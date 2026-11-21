// Routes the client's network calls to the in-page server:
//   fetch  /api/*                 -> server/src/api.ts on the Express shim
//   fetch  /matchmake/:m/:room    -> Colyseus matchMaker.controller.invokeMethod (what the real HTTP route does)
//   WebSocket ws(s)://<page>/<processId>/<roomId>?sessionId=...  -> an in-memory socket handed to connectClientToRoom
// Anything else (other origins) uses the browser's own fetch / WebSocket.
import { EventEmitter } from "events";
import { Buffer } from "buffer";
import { matchMaker, connectClientToRoom, createAuthContext, getMessageBytes, enqueueClientRaw, ClientState, Protocol, CloseCode } from "@colyseus/core";
import { dispatch, type Router } from "./shims/express.ts";

const realFetch = globalThis.fetch.bind(globalThis);
const RealWebSocket = globalThis.WebSocket;

const isLocal = (u: URL) => u.host === location.host || u.hostname === "localhost";

/** Runs fn on a later task, in call order. A real socket never delivers inside the sender's task; the client relies on
 *  that (it registers room.onMessage handlers right after `await joinOrCreate()`, before the first messages land). */
const later = (() => {
  let q: (() => void)[] = [], scheduled = false;
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {
    scheduled = false;
    const batch = q;
    q = [];
    for (const fn of batch) fn(); // anything these queue runs on the next task
  };
  return (fn: () => void) => { q.push(fn); if (!scheduled) { scheduled = true; ch.port2.postMessage(0); } };
})();

// ---------- fetch ----------
export function installFetch(app: Router, asset: (path: string) => Blob | undefined) {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const u = new URL(req ? req.url : String(input), location.href);
    if (!isLocal(u)) return realFetch(input as any, init);
    const path = decodeURIComponent(u.pathname);
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    const hdrs: Record<string, string> = {};
    new Headers(init?.headers ?? req?.headers).forEach((v, k) => (hdrs[k.toLowerCase()] = v));
    const bodyText = async () => (init?.body != null ? String(init.body) : req ? await req.text() : "");

    if (path.startsWith("/api/") || path === "/api") {
      const r = await dispatch(app, method, path, hdrs, await bodyText());
      return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers });
    }
    const mm = path.match(/^\/matchmake\/([^/]+)\/([^/]+)$/);
    if (mm && method === "POST") {
      try {
        const text = await bodyText();
        const response: any = await matchMaker.controller.invokeMethod(mm[1], mm[2], text ? JSON.parse(text) : {}, createAuthContext({ headers: hdrs }));
        return new Response(JSON.stringify(response), { headers: { "content-type": "application/json" } });
      } catch (e: any) {
        console.error("[matchmake]", e);
        return new Response(JSON.stringify({ code: e.code, error: e.message }), { status: 400, headers: { "content-type": "application/json" } });
      }
    }
    const blob = asset(path);
    if (blob) return new Response(blob, { headers: { "content-type": blob.type || "application/octet-stream" } });
    if (method === "GET" && /\.[a-z0-9]+$/i.test(path) && !path.startsWith("/assets/")) {
      // a game file that is not in the packs: answer 404 like the real static server, without a network round trip
      return new Response("not found", { status: 404 });
    }
    return realFetch(input as any, init);
  };
}

// ---------- WebSocket ----------
const toArrayBuffer = (d: any): ArrayBuffer => {
  const u8 = d instanceof Uint8Array ? d : Array.isArray(d) ? Uint8Array.from(d) : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer ?? d);
  return u8.slice().buffer;
};

/** The server's view of one connection (what `ws` gives @colyseus/ws-transport). */
class ServerSocket extends EventEmitter {
  readyState = 1;
  peer!: PageSocket;
  send(data: any, _opts?: unknown, cb?: (e?: Error) => void) {
    if (this.readyState !== 1) { cb?.(new Error("closed")); return; }
    const buf = toArrayBuffer(data);
    later(() => this.peer.deliver(buf));
    cb?.();
  }
  close(code = 1000, reason = "") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    later(() => { this.emit("close", code, reason); this.peer.closedByServer(code, String(reason ?? "")); });
  }
  terminate() { this.close(1006); }
  ping() {}
}

/** Same as @colyseus/ws-transport's WebSocketClient. */
class InPageClient {
  state = ClientState.JOINING;
  _enqueuedMessages: unknown[] = [];
  _numMessagesLastSecond = 0;
  _messageCountResetsAt = 0;
  _lastMessageTime = 0;
  id: string; sessionId: string;
  constructor(id: string, public ref: ServerSocket) { this.sessionId = this.id = id; }
  sendBytes(type: any, bytes: any, options?: any) { this.enqueueRaw(getMessageBytes.raw(Protocol.ROOM_DATA_BYTES, type, undefined, bytes), options); }
  send(type: any, message?: any, options?: any) { this.enqueueRaw(getMessageBytes.raw(Protocol.ROOM_DATA, type, message), options); }
  enqueueRaw(data: any, options?: any) { enqueueClientRaw(this as any, data, options); }
  raw(data: any, _options?: any, cb?: () => void) { this.ref.send(data, undefined, cb); }
  error(code: number, message = "", cb?: () => void) { this.raw((getMessageBytes as any)[Protocol.ERROR](code, message), undefined, cb); }
  get readyState() { return this.ref.readyState; }
  leave(code?: number, data?: string) { this.ref.close(code, data); }
  close(code?: number, data?: string) { this.leave(code, data); }
  toJSON() { return { sessionId: this.sessionId, readyState: this.readyState }; }
}

/** The page's view: a WebSocket look-alike for @colyseus/sdk. */
class PageSocket extends EventTarget {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  CONNECTING = 0; OPEN = 1; CLOSING = 2; CLOSED = 3;
  readyState = 0;
  binaryType: BinaryType = "arraybuffer";
  protocol = ""; extensions = ""; bufferedAmount = 0;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: ((e: CloseEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private server = new ServerSocket();

  constructor(public url: string) {
    super();
    this.server.peer = this;
    setTimeout(() => this.open(), 0);
  }
  private fire(type: string, ev: Event) {
    const h = (this as any)["on" + type];
    if (h) h.call(this, ev);
    this.dispatchEvent(ev);
  }
  private async open() {
    const u = new URL(this.url);
    const sessionId = u.searchParams.get("sessionId");
    const roomId = u.pathname.match(/\/[a-zA-Z0-9_\-]+\/([a-zA-Z0-9_\-]+)$/)?.[1];
    this.readyState = 1;
    this.fire("open", new Event("open"));
    if (!sessionId || !roomId) { this.server.close(CloseCode.NORMAL_CLOSURE); return; }
    const room = matchMaker.getLocalRoomById(roomId);
    const client = new InPageClient(sessionId, this.server);
    const reconnectionToken = u.searchParams.get("reconnectionToken");
    try {
      await connectClientToRoom(room, client as any, createAuthContext({ headers: {}, token: u.searchParams.get("_authToken") }), {
        reconnectionToken, skipHandshake: u.searchParams.has("skipHandshake"),
      } as any);
    } catch (e: any) {
      console.error("[ws]", e);
      client.error(e.code, e.message, () => this.server.close(reconnectionToken ? CloseCode.FAILED_TO_RECONNECT : CloseCode.WITH_ERROR));
    }
  }
  deliver(buf: ArrayBuffer) {
    if (this.readyState !== 1) return;
    this.fire("message", new MessageEvent("message", { data: this.binaryType === "blob" ? new Blob([buf]) : buf }));
  }
  closedByServer(code: number, reason: string) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.fire("close", new CloseEvent("close", { code, reason, wasClean: true }));
  }
  send(data: string | ArrayBufferLike | ArrayBufferView | Blob) {
    if (this.readyState !== 1) return;
    const s = this.server;
    if (typeof data === "string") { const b = Buffer.from(data); later(() => s.emit("message", b)); return; }
    if (data instanceof Blob) { data.arrayBuffer().then((b) => later(() => s.emit("message", Buffer.from(b)))); return; }
    const u8 = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data as ArrayBuffer);
    const b = Buffer.from(u8); // copies: the caller may reuse its buffer
    later(() => s.emit("message", b));
  }
  close(code = 1000, reason = "") {
    if (this.readyState >= 2) return;
    this.readyState = 3;
    const s = this.server;
    if (s.readyState !== 3) { s.readyState = 3; later(() => s.emit("close", code, reason)); }
    setTimeout(() => this.fire("close", new CloseEvent("close", { code, reason, wasClean: true })), 0);
  }
}

export function installWebSocket() {
  const Shim: any = function (this: unknown, url: string | URL, protocols?: unknown) {
    const u = new URL(String(url), location.href);
    if (!isLocal(u)) return new RealWebSocket(url, typeof protocols === "object" && !Array.isArray(protocols) ? undefined : (protocols as any));
    return new PageSocket(u.href);
  };
  Object.assign(Shim, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, prototype: PageSocket.prototype });
  globalThis.WebSocket = Shim;
}
