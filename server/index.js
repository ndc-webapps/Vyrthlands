/**
 * Vyrthlands backend: accounts, sessions, servers (worlds shared with
 * friends via invite codes), per-player progress, shared world edits,
 * and WebSocket presence with live player positions.
 * Storage: Postgres (DATABASE_URL, e.g. Neon) or local sqlite — see db.js.
 */
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, findDatabaseUrl, dbEnvKeys } from './db.js';

const PORT = Number(process.env.PORT || 8081);
const db = await openDb();

const app = express();
app.use(express.json({ limit: '8mb' }));

// CORS: needed when the frontend is hosted elsewhere (e.g. Vercel).
// Lock down with ALLOWED_ORIGIN=https://yourgame.vercel.app in production.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
app.use((req, res, next) => {
  const origin = ALLOWED_ORIGIN === '*' ? (req.headers.origin || '*') : ALLOWED_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- helpers ----------
const now = () => Date.now();
const uid = () => crypto.randomUUID();
const fail = (res, code, msg) => res.status(code).json({ error: msg });

function makeInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[crypto.randomInt(chars.length)];
  return c;
}

async function userBySession(token) {
  if (!token) return null;
  const s = await db.get('SELECT user_id FROM sessions WHERE token = $1', [token]);
  if (!s) return null;
  return db.get('SELECT id, username, email, avatar, created_at, last_login FROM users WHERE id = $1', [s.user_id]);
}

/** Auth middleware: Bearer token, or ?token= for sendBeacon routes. */
function auth(req, res, next) {
  const h = req.headers.authorization;
  const token = (h && h.startsWith('Bearer ') ? h.slice(7) : null) || req.query.token;
  userBySession(token).then((user) => {
    if (!user) return fail(res, 401, 'Not logged in');
    req.user = user;
    next();
  }).catch(() => fail(res, 500, 'Auth failed'));
}

async function memberOf(serverId, userId) {
  return !!(await db.get('SELECT 1 AS x FROM server_members WHERE server_id = $1 AND user_id = $2', [serverId, userId]));
}

async function serverInfo(row, userId) {
  const members = await db.all(
    'SELECT u.id, u.username FROM server_members m JOIN users u ON u.id = m.user_id WHERE m.server_id = $1', [row.id]
  );
  return {
    id: row.id, name: row.name, ownerId: row.owner_id, isOwner: row.owner_id === userId,
    worldType: row.world_type, mode: row.mode, worldSize: row.world_size, seed: Number(row.seed),
    maxPlayers: row.max_players, inviteCode: row.invite_code, // members can share the code too
    createdAt: Number(row.created_at), lastPlayed: Number(row.last_played),
    members, online: roomUsers(row.id).length,
  };
}

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); fail(res, 500, 'Server error'); });

// ---------- account routes ----------
app.post('/api/register', wrap(async (req, res) => {
  const { username, password, email } = req.body ?? {};
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    return fail(res, 400, 'Username must be 3-16 letters, numbers, or _');
  }
  if (typeof password !== 'string' || password.length < 6) {
    return fail(res, 400, 'Password must be at least 6 characters');
  }
  if (email && (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email))) {
    return fail(res, 400, 'Invalid email address');
  }
  const existing = await db.get('SELECT 1 AS x FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  if (existing) return fail(res, 409, 'Username is already taken');
  const id = uid();
  const hash = await bcrypt.hash(password, 10);
  await db.run('INSERT INTO users (id, username, email, pass_hash, created_at, last_login) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, username, email ?? null, hash, now(), now()]);
  const token = uid();
  await db.run('INSERT INTO sessions (token, user_id, created_at) VALUES ($1,$2,$3)', [token, id, now()]);
  res.json({ token, user: { id, username, email: email ?? null, avatar: '', createdAt: now() }, storage: db.engine });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { username, password } = req.body ?? {};
  const row = await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [String(username ?? '')]);
  if (!row || !(await bcrypt.compare(String(password ?? ''), row.pass_hash))) {
    return fail(res, 401, 'Wrong username or password');
  }
  await db.run('UPDATE users SET last_login = $1 WHERE id = $2', [now(), row.id]);
  const token = uid();
  await db.run('INSERT INTO sessions (token, user_id, created_at) VALUES ($1,$2,$3)', [token, row.id, now()]);
  res.json({ token, user: { id: row.id, username: row.username, email: row.email, avatar: row.avatar, createdAt: Number(row.created_at) }, storage: db.engine });
}));

app.post('/api/logout', auth, wrap(async (req, res) => {
  const h = req.headers.authorization;
  await db.run('DELETE FROM sessions WHERE token = $1', [h.slice(7)]);
  res.json({ ok: true });
}));

app.get('/api/me', auth, (req, res) => res.json({ user: req.user, storage: db.engine }));

// DEBUG — open https://<railway-domain>/api/_debug to check which database is in use
app.get('/api/_debug', wrap(async (req, res) => {
  const found = findDatabaseUrl();
  const c = await db.get('SELECT count(*) AS n FROM users');
  res.json({
    engine: db.engine,               // must say "postgres" in production
    connectedVia: db.via,            // env var name the URL came from
    dbHost: db.host,                 // must match your Neon host (ep-xxxx...)
    dbName: db.database,             // must match the Neon database you inspect
    urlFoundInEnv: found ? found.name : null,
    userCount: c ? Number(c.n) : null,
    envKeys: dbEnvKeys(),
  });
}));

// ---------- server (world/lobby) routes ----------
app.get('/api/servers', auth, wrap(async (req, res) => {
  const rows = await db.all(
    'SELECT s.* FROM servers s JOIN server_members m ON m.server_id = s.id WHERE m.user_id = $1 ORDER BY s.last_played DESC',
    [req.user.id]
  );
  res.json({ servers: await Promise.all(rows.map((r) => serverInfo(r, req.user.id))) });
}));

app.post('/api/servers', auth, wrap(async (req, res) => {
  const { name, worldType, mode, worldSize, seed, maxPlayers } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 32) {
    return fail(res, 400, 'Server name must be 1-32 characters');
  }
  const id = uid();
  const code = makeInviteCode();
  await db.run(
    `INSERT INTO servers (id, name, owner_id, world_type, mode, world_size, seed, max_players, invite_code, created_at, last_played)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, name.trim(), req.user.id, String(worldType ?? 'natural'), String(mode ?? 'survival'),
      String(worldSize ?? 'medium'), Number(seed ?? 0) | 0, Math.min(16, Math.max(1, Number(maxPlayers ?? 8))), code, now(), now()]
  );
  await db.run('INSERT INTO server_members (server_id, user_id, joined_at) VALUES ($1,$2,$3)', [id, req.user.id, now()]);
  const row = await db.get('SELECT * FROM servers WHERE id = $1', [id]);
  res.json({ server: await serverInfo(row, req.user.id) });
}));

app.post('/api/servers/join', auth, wrap(async (req, res) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  const row = await db.get('SELECT * FROM servers WHERE invite_code = $1', [code]);
  if (!row) return fail(res, 404, 'Invalid invite code');
  const member = await memberOf(row.id, req.user.id);
  const count = (await db.all('SELECT user_id FROM server_members WHERE server_id = $1', [row.id])).length;
  if (!member && count >= row.max_players) return fail(res, 403, 'Server is full');
  await db.run(
    'INSERT INTO server_members (server_id, user_id, joined_at) VALUES ($1,$2,$3) ON CONFLICT (server_id, user_id) DO NOTHING',
    [row.id, req.user.id, now()]
  );
  res.json({ server: await serverInfo(row, req.user.id) });
}));

app.get('/api/servers/:id', auth, wrap(async (req, res) => {
  if (!(await memberOf(req.params.id, req.user.id))) return fail(res, 403, 'Not a member of this server');
  const row = await db.get('SELECT * FROM servers WHERE id = $1', [req.params.id]);
  if (!row) return fail(res, 404, 'Server not found');
  res.json({ server: await serverInfo(row, req.user.id) });
}));

// ---------- progress + shared world state ----------
app.get('/api/progress/:serverId', auth, wrap(async (req, res) => {
  if (!(await memberOf(req.params.serverId, req.user.id))) return fail(res, 403, 'Not a member of this server');
  const p = await db.get('SELECT data FROM progress WHERE server_id = $1 AND user_id = $2', [req.params.serverId, req.user.id]);
  const w = await db.get('SELECT data FROM world_state WHERE server_id = $1', [req.params.serverId]);
  res.json({
    progress: p ? JSON.parse(p.data) : null,
    world: w ? JSON.parse(w.data) : null,
  });
}));

app.post('/api/progress/:serverId', auth, wrap(async (req, res) => {
  if (!(await memberOf(req.params.serverId, req.user.id))) return fail(res, 403, 'Not a member of this server');
  const { progress, world } = req.body ?? {};
  const t = now();
  if (progress != null) {
    await db.run(
      `INSERT INTO progress (server_id, user_id, data, updated_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (server_id, user_id) DO UPDATE SET data = $3, updated_at = $4`,
      [req.params.serverId, req.user.id, JSON.stringify(progress), t]
    );
  }
  if (world != null) {
    await db.run(
      `INSERT INTO world_state (server_id, data, updated_at) VALUES ($1,$2,$3)
       ON CONFLICT (server_id) DO UPDATE SET data = $2, updated_at = $3`,
      [req.params.serverId, JSON.stringify(world), t]
    );
  }
  await db.run('UPDATE servers SET last_played = $1 WHERE id = $2', [t, req.params.serverId]);
  res.json({ ok: true, savedAt: t });
}));

// serve the built game in production (npm run build first)
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(dist)) app.use(express.static(dist));

// ---------- WebSocket presence ----------
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
/** serverId -> Map<userId, { ws, username }> */
const rooms = new Map();

function roomUsers(serverId) {
  const room = rooms.get(serverId);
  return room ? [...room.values()].map((v) => v.username) : [];
}

/** Simulation leader = longest-connected member; they run mobs + the clock. */
function roomLeader(serverId) {
  const room = rooms.get(serverId);
  if (!room || room.size === 0) return null;
  return room.values().next().value.username;
}

function broadcast(serverId, msg) {
  const room = rooms.get(serverId);
  if (!room) return;
  const text = JSON.stringify(msg);
  for (const { ws } of room.values()) {
    if (ws.readyState === 1) ws.send(text);
  }
}

wss.on('connection', async (ws, req) => {
  // buffer anything sent while we're still authenticating (db roundtrips)
  const early = [];
  const buffer = (raw) => early.push(raw);
  ws.on('message', buffer);

  const url = new URL(req.url, 'http://x');
  const user = await userBySession(url.searchParams.get('token')).catch(() => null);
  const serverId = url.searchParams.get('server');
  if (!user || !serverId || !(await memberOf(serverId, user.id))) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  ws.off('message', buffer);
  let room = rooms.get(serverId);
  if (!room) rooms.set(serverId, (room = new Map()));
  room.set(user.id, { ws, username: user.username });
  broadcast(serverId, { type: 'join', username: user.username, players: roomUsers(serverId), leader: roomLeader(serverId) });

  let lastChat = 0;
  const handle = (raw) => {
    // live relay: positions, chat, block edits
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'pos') {
        broadcast(serverId, {
          type: 'pos', username: user.username, role: msg.role,
          x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw,
        });
      } else if (msg.type === 'chat') {
        const t = Date.now();
        if (t - lastChat < 400) return; // basic flood protection
        lastChat = t;
        const text = String(msg.text ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, 200);
        if (text) broadcast(serverId, { type: 'chat', username: user.username, text });
      } else if (msg.type === 'block') {
        const { x, y, z, id } = msg;
        if ([x, y, z, id].every((v) => Number.isFinite(v))) {
          broadcast(serverId, { type: 'block', username: user.username, x, y, z, id });
        }
      } else if (msg.type === 'mobs') {
        // mob snapshot + world clock — only the leader may drive these
        if (user.username === roomLeader(serverId) && Array.isArray(msg.mobs) && msg.mobs.length <= 80) {
          broadcast(serverId, { type: 'mobs', username: user.username, mobs: msg.mobs, t: Number(msg.t) || 0 });
        }
      } else if (msg.type === 'mobhit') {
        // a non-leader hit a mob; relay so the leader applies the damage
        if ([msg.id, msg.dmg].every((v) => Number.isFinite(v))) {
          broadcast(serverId, { type: 'mobhit', username: user.username, id: msg.id, dmg: msg.dmg, kx: Number(msg.kx) || 0, kz: Number(msg.kz) || 0 });
        }
      } else if (msg.type === 'mobatk') {
        // leader's mob hit another player; relay so the target takes damage
        if (user.username === roomLeader(serverId) && typeof msg.target === 'string' && Number.isFinite(msg.dmg)) {
          broadcast(serverId, { type: 'mobatk', target: msg.target, dmg: msg.dmg });
        }
      } else if (msg.type === 'shot') {
        // projectile visuals + hostile fire replication
        const nums = [msg.x, msg.y, msg.z, msg.dx, msg.dy, msg.dz, msg.speed, msg.dmg];
        if (nums.every((v) => Number.isFinite(v))) {
          broadcast(serverId, {
            type: 'shot', username: user.username,
            x: msg.x, y: msg.y, z: msg.z, dx: msg.dx, dy: msg.dy, dz: msg.dz,
            speed: msg.speed, dmg: msg.dmg, color: Number(msg.color) || 0xffffff, hostile: !!msg.hostile,
          });
        }
      } else if (msg.type === 'sleep') {
        broadcast(serverId, { type: 'sleep', username: user.username });
      } else if (msg.type === 'tame') {
        // a player tamed a mob — everyone (incl. the sim leader) removes it
        if (Number.isFinite(msg.id)) {
          broadcast(serverId, { type: 'tame', username: user.username, id: msg.id, mob: String(msg.mob ?? '').slice(0, 40) });
        }
      }
    } catch { /* ignore malformed packets */ }
  };
  ws.on('message', handle);
  for (const raw of early) handle(raw); // replay anything sent during auth

  ws.on('close', () => {
    const r = rooms.get(serverId);
    if (r) {
      r.delete(user.id);
      if (r.size === 0) rooms.delete(serverId);
      else broadcast(serverId, { type: 'leave', username: user.username, players: roomUsers(serverId), leader: roomLeader(serverId) });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Vyrthlands server on http://localhost:${PORT} (storage: ${db.engine})`);
});
