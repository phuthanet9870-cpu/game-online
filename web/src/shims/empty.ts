// Stand-in for Node built-ins the in-page server never reaches at runtime (http, net, os, path, ...). Named exports that are
// not listed here are filled in by rolldown's shimMissingExports; the default export answers any property with a no-op.
export const STATUS_CODES: Record<number, string> = {};
export const createServer = () => { throw new Error("no http server in the browser build"); };
export const fileURLToPath = (u: string | URL) => String(u).replace(/^file:\/\//, "");
export const pathToFileURL = (p: string) => new URL("file://" + p);
export const join = (...p: string[]) => p.join("/").replace(/\/+/g, "/");
export const resolve = join, dirname = (p: string) => p.replace(/\/[^/]*$/, ""), basename = (p: string) => p.replace(/^.*\//, "");
export const hostname = () => "browser", cpus = () => [{}], networkInterfaces = () => ({}), tmpdir = () => "/tmp", EOL = "\n";
const _URL = globalThis.URL, _USP = globalThis.URLSearchParams;
export { _URL as URL, _USP as URLSearchParams };

const named: Record<string, unknown> = { STATUS_CODES, createServer, fileURLToPath, pathToFileURL, join, resolve, dirname, basename, hostname, cpus, networkInterfaces, tmpdir, EOL, URL: _URL, URLSearchParams: _USP, sep: "/" };
const noop = () => undefined;
export default new Proxy(named, { get: (t, k) => (k in t ? t[k as string] : typeof k === "string" ? noop : undefined) });
