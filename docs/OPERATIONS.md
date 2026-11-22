# Operations Guide

## Local development
```bash
npm install
# PostgreSQL 16 running locally; create user/db once:
#   CREATE USER astra WITH PASSWORD 'astra_dev' CREATEDB; CREATE DATABASE astra OWNER astra;
npm run build -w @astra/server && node apps/server/dist/server.js   # API + WS on :8080, runs migrations
npm run dev:client                                                   # Vite on :5173, proxies /api and /ws
```
Without a server the client falls back to **Offline mode** (clearly bannered).

## Tests
- `npm run typecheck` — all three packages.
- `npm test` — Vitest (content invariants, loadout/passive validation, 300 dungeon seeds, combat for all six classes, boss phases, idempotency, hardcore death, rate limiting).
- `npx tsx apps/server/test/bot.ts http://localhost:8080 warrior` — full online run (register → create → walk to Rift Gate → clear rooms → kill Veyra → exit).
- `... --bots N` — concurrent load test (each bot runs its own Rift instance).
- `npx tsx apps/server/test/social-e2e.ts` — two live clients: trade, auction sale, bound-item refusal, reconnect; verifies rows in Postgres.

## Production deployment (not yet done)
1. Provision PostgreSQL 16 with automated daily backups + point-in-time recovery.
2. `docker build -t astra .` and run with `DATABASE_URL`, `PORT`.
3. Terminate TLS at a reverse proxy (Caddy example: `astra.example.com { reverse_proxy game:8080 }` — Caddy proxies WebSockets automatically). The game must be served over HTTPS so `/ws` upgrades to WSS.
4. Keep `ASTRA_DEBUG` unset in production.
5. Health check: `GET /api/health`.

## Backups & restore
- Backup: `pg_dump -Fc "$DATABASE_URL" > astra-$(date +%F).dump`
- Restore into a test database: `createdb astra_restore && pg_restore -d astra_restore astra-YYYY-MM-DD.dump`
- Restore testing has **not** been performed yet for a production database; do it before launch.

## Rollback
Images are immutable: redeploy the previous tag. Migrations are additive only; a destructive migration requires a written down-migration and a backup taken immediately before.

## Security checklist
- [x] scrypt password hashing, hashed session tokens, expiry
- [x] Parameterized SQL everywhere
- [x] Server-side validation of every game command; no client-trusted values
- [x] Rate limits (auth endpoints per IP, API per IP, WS per session)
- [x] CSP and security headers on static + API responses
- [x] Text rendered via text nodes only (no innerHTML of user content)
- [x] Audit log for economy and moderation events
- [ ] HTTPS/WSS in production (needs host)
- [ ] Admin MFA + RBAC tooling (no admin panel yet)
- [ ] Account recovery via email (needs mail provider)
- [ ] Automated anti-cheat heuristics + appeal workflow
- [ ] Backup restore drill

## Known issues / limitations
- Single game process; no horizontal scaling yet. Load tested with 5 concurrent bots only (0 slow ticks) — no capacity figure is claimed.
- Snapshots are full JSON (no delta compression).
- Party and reconnect flows lack automated tests.
- Art is procedural placeholder drawing; no audio.
- Item content and skill descriptions are English only.
- Offline mode stores saves in the browser's localStorage (lost if site data is cleared).
