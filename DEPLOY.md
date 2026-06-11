# Vyrthlands — Backend Integration & Deploy Guide

Everything you need to put the game online so kids/friends can play together.
The code is already wired for this — you only create accounts and paste env vars.

## What runs where

| Piece | Host | Why |
|---|---|---|
| Game frontend (this repo, built with Vite) | **Vercel** | Fast static hosting |
| Backend `server/index.js` (accounts, servers, saves, chat, presence WebSocket) | **Railway** (or Render/Fly.io) | Needs a long-running process — Vercel serverless cannot hold WebSockets |
| Database | **Neon** (Postgres) | Free tier, works from Railway |

Local dev needs none of this: `npm run server` + `npm run dev` uses a local sqlite file.

## Step 1 — Neon (database)

1. Go to https://neon.tech → sign up → New Project (any name, any region near you).
2. On the project dashboard, copy the **connection string**. It looks like:
   `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`
3. That's it. Tables are created automatically on first backend boot.

## Step 2 — Railway (backend)

1. Push this repo to GitHub if it isn't already.
2. Go to https://railway.app → New Project → **Deploy from GitHub repo** → pick this repo.
3. In the service → **Variables**, add:
   - `DATABASE_URL` = the Neon connection string from Step 1
   - `ALLOWED_ORIGIN` = your Vercel URL (add after Step 3, e.g. `https://vyrthlands.vercel.app`)
4. In **Settings → Deploy**, make sure the start command is `npm start`
   (that runs `node server/index.js`; it's already in package.json).
5. In **Settings → Networking**, click **Generate Domain**. Copy it
   (e.g. `https://vyrthlands-production.up.railway.app`).
6. Check the deploy logs — you should see:
   `[db] Postgres connected` and `Vyrthlands server on http://localhost:PORT`.

## Step 3 — Vercel (frontend)

1. Go to https://vercel.com → Add New Project → import the same GitHub repo.
2. Framework preset: **Vite**. Build command `npm run build`, output `dist` (defaults are fine).
3. In **Environment Variables**, add:
   - `VITE_API_URL` = the Railway domain from Step 2.5 (https://… no trailing slash)
4. Deploy. Then go back to Railway and set `ALLOWED_ORIGIN` to your Vercel URL.
5. Redeploy the Railway service once so the CORS lock takes effect.

## Step 4 — Verify

1. Open the Vercel URL → Create Account → should succeed (data lives in Neon).
2. Create a server → note the 6-character invite code.
3. On another device/account, Join with the code → both players appear in the
   same world, see each other's avatars + name tags, chat with T, and watch
   each other place/break blocks live.
4. Refresh: you stay logged in and your progress reloads.

## Env vars reference

| Var | Where | Value |
|---|---|---|
| `DATABASE_URL` | Railway | Neon connection string. If unset, backend uses local sqlite file. |
| `ALLOWED_ORIGIN` | Railway | Your Vercel URL. Locks CORS. Default `*` (dev only). |
| `PORT` | Railway | Auto-set by Railway. Local default 8081. |
| `DB_PATH` | local only | sqlite file location override. |
| `VITE_API_URL` | Vercel | Railway domain. If unset, frontend expects same-origin backend (local dev proxy). |

## Alternatives

- **Render.com**: same as Railway — Web Service, start command `npm start`, same env vars.
- **Fly.io**: `fly launch`, set secrets with `fly secrets set DATABASE_URL=...`.
- **Single host, no Vercel**: run `npm run build`, then `npm start` on Railway alone —
  the backend serves `dist/` itself. Skip `VITE_API_URL` and `ALLOWED_ORIGIN`.
  Simplest option if you don't care about Vercel.

## Troubleshooting

- **"Cannot reach server"** on login → `VITE_API_URL` missing/wrong on Vercel,
  or Railway service is asleep/crashed (check Railway logs).
- **CORS errors** in browser console → `ALLOWED_ORIGIN` doesn't exactly match
  the Vercel URL (https, no trailing slash).
- **Friends can't see each other** → WebSocket blocked: confirm the Railway
  domain works with `wss://` (Railway supports it out of the box) and that you
  are both *in the same server* (invite code), not two servers with the same name.
- **Postgres SSL errors** → make sure the Neon string ends with `?sslmode=require`.
- **Wiped data after redeploy** → you were on sqlite (no `DATABASE_URL` set).
  Set it; Neon data survives redeploys.
