# Vyrthlands

Original voxel survival RPG with themed realms, RPG roles, accounts, friend servers, and cloud saves.

## Run (full experience: accounts + servers)

- `npm install`
- `npm run server` — backend (accounts, servers, progress, presence) on port 8081
- `npm run dev` — game on http://localhost:5173 (proxies /api and /ws to the backend)

Guest mode works without the backend (local saves only).

## Build

- `npm run build` — typecheck + production build to `dist/`
- `npm run server` also serves `dist/` if it exists (single-process deploy)

## Accounts & servers

- Create an account or log in from the landing page (sessions survive refresh).
- Create a server (realm): pick world type, size, seed, mode — get a 6-char invite code.
- Friends join with the invite code and play in the same world (shared block edits).
- Per-player progress (role, inventory, health, position) is saved to the server
  automatically every 25s, on quit, and on page close.

## Backend

- Express + built-in `node:sqlite` (no external services) + WebSocket presence.
- Database file: `server/vyrthlands.db` (configurable via `DB_PATH`, see `.env.example`).
- Passwords hashed with bcrypt; sessions are server-side tokens; invite codes and
  membership are checked on every progress/world route.
- Real-time gameplay sync (remote player avatars, live block updates) is the next
  phase — presence (join/leave/online list, position relay) is live already.

## Deploy: Vercel (frontend) + Railway (backend) + Neon (database)

1. **Neon**: create a project at neon.tech → copy the connection string.
2. **Railway**: new project → deploy this repo → set env vars:
   - `DATABASE_URL` = your Neon connection string
   - `ALLOWED_ORIGIN` = your Vercel URL (e.g. https://vyrthlands.vercel.app)
   - start command is `npm start` (runs server/index.js)
3. **Vercel**: import this repo → framework Vite → set env var:
   - `VITE_API_URL` = your Railway URL (e.g. https://vyrthlands.up.railway.app)
4. Done. Accounts, servers, saves live in Neon; presence (see friends move)
   runs over the Railway WebSocket.

Local dev needs no setup: sqlite file + vite proxy (`npm run server` + `npm run dev`).
