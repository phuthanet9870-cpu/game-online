import type { RequestHandler, Router } from "express";
import type { Account, HostServices } from "@game/core";
import { CharacterError, CharacterStore } from "./characters";
import { tickStats } from "./WorldRoom";

const wrap = (fn: (account: Account, req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(res.locals.account as Account, req, res).catch((err) => {
      if (err instanceof CharacterError) res.status(err.status).json({ error: err.message });
      else next(err);
    });
  };

/** Character-select endpoints: /api/games/world/characters */
export function characterRoutes(router: Router, services: HostServices & { requireAccount: RequestHandler }) {
  const store = new CharacterStore(services.db);
  // Server load, for load tests and monitoring. Public: it holds no player data.
  router.get("/stats", (req, res) => {
    const avg = tickStats.ticks ? tickStats.totalMs / tickStats.ticks : 0;
    res.json({ ticks: tickStats.ticks, avgTickMs: Number(avg.toFixed(3)), maxTickMs: Number(tickStats.maxMs.toFixed(3)) });
    if (req.query.reset === "1") tickStats.reset();
  });
  router.use(services.requireAccount);
  router.get("/characters", wrap(async (account, _req, res) => {
    res.json({ characters: await store.list(account.id) });
  }));
  router.post("/characters", wrap(async (account, req, res) => {
    res.status(201).json({ character: await store.create(account.id, req.body ?? {}) });
  }));
  router.delete("/characters/:id", wrap(async (account, req, res) => {
    const removed = await store.remove(account.id, Number(req.params.id));
    if (!removed) throw new CharacterError(404, "ไม่พบตัวละคร");
    res.status(204).end();
  }));
}
