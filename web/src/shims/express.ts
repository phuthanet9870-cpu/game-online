// Just enough of Express for server/src/api.ts: Router with use/get/post/delete, path params, json bodies, error middleware.
// The page's fetch shim (net.ts) calls dispatch() for every /api request.
type Next = (err?: unknown) => void;
type Handler = (req: any, res: any, next: Next) => unknown;
type Layer = { method: string | null; path: string | null; handlers: Handler[] };

export class Router {
  layers: Layer[] = [];
  use(pathOrFn: string | Handler | Router, ...rest: (Handler | Router)[]) {
    const path = typeof pathOrFn === "string" ? pathOrFn : null;
    const fns = (typeof pathOrFn === "string" ? rest : [pathOrFn, ...rest]).map(asHandler);
    this.layers.push({ method: null, path, handlers: fns });
    return this;
  }
  get(path: string, ...h: Handler[]) { this.layers.push({ method: "GET", path, handlers: h }); return this; }
  post(path: string, ...h: Handler[]) { this.layers.push({ method: "POST", path, handlers: h }); return this; }
  delete(path: string, ...h: Handler[]) { this.layers.push({ method: "DELETE", path, handlers: h }); return this; }

  /** Runs the request through the layers; mount = the prefix this router was mounted under. */
  async run(req: any, res: any, done: Next, mount = "") {
    const rel = req.path.startsWith(mount) ? req.path.slice(mount.length) || "/" : null;
    if (rel === null) return done();
    const stack: { h: Handler; layer: Layer; params: Record<string, string> }[] = [];
    for (const layer of this.layers) {
      let params: Record<string, string> | null = {};
      if (layer.method) {
        if (layer.method !== req.method) continue;
        params = match(layer.path!, rel);
      } else if (layer.path) {
        params = rel === layer.path || rel.startsWith(layer.path + "/") ? {} : null;
      }
      if (!params) continue;
      for (const h of layer.handlers) stack.push({ h, layer, params });
    }
    let i = 0;
    const next: Next = async (err) => {
      while (i < stack.length) {
        const { h, layer, params } = stack[i++];
        const isErr = h.length === 4;
        if (!!err !== isErr) continue;
        req.params = params;
        try {
          if (!layer.method && layer.path && (h as any).__router) {
            await (h as any).__router.run(req, res, next, mount + layer.path);
            return;
          }
          await (isErr ? (h as any)(err, req, res, next) : h(req, res, next));
        } catch (e) { return next(e); }
        return;
      }
      done(err);
    };
    await next();
  }
}

function asHandler(x: Handler | Router): Handler {
  if (x instanceof Router) { const f: any = (_req: any, _res: any, next: Next) => next(); f.__router = x; return f; }
  return x;
}

function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split("/").filter(Boolean), b = path.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) out[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return out;
}

export type Application = Router;
export type Request = any;
export type Response = any;
export type NextFunction = Next;

function express() { return new Router(); }
express.Router = () => new Router();
express.json = (_o?: unknown): Handler => (_req, _res, next) => next();
express.static = (): Handler => (_req, _res, next) => next();
export default express;

export type Reply = { status: number; headers: Record<string, string>; body: string };

/** One HTTP request through the app, resolved when a handler answers (or 404). */
export function dispatch(app: Router, method: string, path: string, headers: Record<string, string>, bodyText: string): Promise<Reply> {
  return new Promise((resolve) => {
    let body: unknown = undefined;
    if (bodyText) { try { body = JSON.parse(bodyText); } catch { body = bodyText; } }
    const req = { method, path, url: path, headers, body, params: {}, query: {}, socket: { remoteAddress: "127.0.0.1" } };
    const out: Reply = { status: 200, headers: {}, body: "" };
    let sent = false;
    const finish = () => { if (!sent) { sent = true; resolve(out); } };
    const res = {
      status(n: number) { out.status = n; return res; },
      setHeader(k: string, v: string) { out.headers[k.toLowerCase()] = v; return res; },
      json(v: unknown) { out.headers["content-type"] = "application/json"; out.body = JSON.stringify(v); finish(); return res; },
      send(v: unknown) { out.body = typeof v === "string" ? v : JSON.stringify(v); finish(); return res; },
      sendStatus(n: number) { out.status = n; finish(); return res; },
      end() { finish(); return res; },
    };
    app.run(req, res, (err) => {
      if (sent) return;
      if (err) { console.error(err); out.status = 500; out.headers["content-type"] = "application/json"; out.body = JSON.stringify({ error: "server error" }); }
      else { out.status = 404; out.headers["content-type"] = "application/json"; out.body = JSON.stringify({ error: "not found" }); }
      finish();
    });
  });
}
