# Putting Game Online on the internet

The game is a real online game when its server runs all the time. The server needs PostgreSQL (accounts and characters)
and Redis (login sessions). Everything is in the `Dockerfile`; players just open the server's address in a browser.

## Option A: Render (managed, about 10 minutes)

1. Push this repository to GitHub (it already is).
2. On <https://render.com>: **New > Blueprint**, pick this repository. It reads `render.yaml` and creates the web service,
   Postgres and Redis. Choose paid plans: a free web service sleeps when nobody is online and drops everyone.
3. When it asks for `GM_PASSPHRASE`, type a long phrase only you know (this unlocks the GM menu, see below).
4. Wait for the deploy to turn green, then open `https://<your-service>.onrender.com`. Share that link.

Railway and Fly.io work the same way: deploy the `Dockerfile`, add a Postgres and a Redis, set `DATABASE_URL`, `REDIS_URL`
and `GM_PASSPHRASE`, and expose port 2567 with WebSocket support (all three have it on by default).

## Option B: your own machine or VPS

```bash
echo 'GM_PASSPHRASE=put-a-long-secret-phrase-here' > .env
docker compose up -d --build        # http://<machine>:2567
```

Put a reverse proxy with HTTPS in front (Caddy: `your.domain { reverse_proxy localhost:2567 }`), and change the database
password in `compose.yml` before opening it to the internet.

## The GM menu

In game, press Enter, type `/gm` followed directly by the passphrase (for example `/gmput-a-long-secret-phrase-here`) and
press Enter. The phrase is checked on the server and never appears in chat; a wrong one answers "Unknown command.", and an
account gets 5 tries per 10 minutes. The account stays a GM afterwards; `/gm` alone opens and closes the window.
GMs can list who is online, teleport / summon, set levels, jobs, stats, give zeny and items, heal, revive, kill, kick, ban,
mute, make other GMs, spawn monsters, clear a map, announce to everyone, and change the EXP and drop rates. Every action
is written to the server log with the GM's name. Without `GM_PASSPHRASE` nobody can unlock the menu.

## Notes

- Data lives in Postgres: back it up (`pg_dump`). Redis only holds login sessions; losing it logs everyone out.
- Updating the game: push to the branch Render follows. Database changes apply automatically on start (`server/migrations`).
- The single-player browser build (`web/`) is separate: it needs no server and keeps its progress in the player's browser.
