// Node globals the server code expects, installed before any server or Colyseus module is evaluated.
import { Buffer } from "buffer";
import proc from "./shims/process.ts";

(globalThis as any).process ??= proc;
(globalThis as any).global ??= globalThis;
(globalThis as any).Buffer ??= Buffer;

// the npm `buffer` package predates "base64url" (server/src/auth.ts makes session tokens with it)
const toString = Buffer.prototype.toString as (this: Buffer, ...a: unknown[]) => string;
Buffer.prototype.toString = function (this: Buffer, enc?: string, start?: number, end?: number) {
  if (enc === "base64url") return toString.call(this, "base64", start, end).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return toString.call(this, enc, start, end);
} as typeof Buffer.prototype.toString;
const from = Buffer.from as (...a: unknown[]) => Buffer;
(Buffer as any).from = function (v: unknown, enc?: unknown, len?: unknown) {
  if (enc === "base64url" && typeof v === "string") return from.call(Buffer, v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return from.call(Buffer, v, enc, len);
};

// Node timers return objects with unref()/ref(); browser timers return numbers, so give numbers those no-ops
for (const k of ["unref", "ref", "refresh"]) {
  if (!(k in Number.prototype)) Object.defineProperty(Number.prototype, k, { value: function (this: number) { return this; }, configurable: true });
}
if (!("hasRef" in Number.prototype)) Object.defineProperty(Number.prototype, "hasRef", { value: () => true, configurable: true });
