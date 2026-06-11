/**
 * Vyrthlands backend: accounts, sessions, servers (worlds shared with
 * friends via invite codes), per-player progress, shared world edits,
 * and WebSocket presence. Express + built-in node:sqlite — no external
 * services required. Real password hashing (bcryptjs), token sessions.
 */
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8081);
const DB_PATH = process.env.DB_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), 'vyrthlands.db');

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    email TEXT, pass_hash TEXT NOT NULL, avatar TEXT DEFAULT '',
    created_at INTEGER NOT NULL, last_login INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL,
    world_type TEXT NOT NULL, mode TEXT NOT NULL, world_size TEXT NOT NULL,
    seed INTEGER NOT NULL, max_players INTEGER NOT NULL DEFAULT 8,
    invite_code TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, last_played INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS server_members (
    server_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS progress (
    server_id TEXT NOT NULL, user_id TEXT NOT NULL,
    data TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS world_state (
    server_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL
  );
`);

const app = express();
app.use(express.json({ limit: '8mb' }));

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

function userBySession(token) {
  if (!token) return null;
  const s = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  return db.prepare('SELECT id, username, email, avatar, created_at, last_login FROM users WHERE id = ?').get(s.user_id) ?? null;
}

/** Auth middleware: Bearer token, or ?token= for sendBeacon routes. */
function auth(req, res, next) {
  const h = req.headers.authorization;
  const token = (h && h.startsWith('Bearer ') ? h.slice(7) : null) || req.query.token;
  const user = userBySession(token);
  if (!user) return fail(res, 401, 'Not logged in');
  req.user = user;
  next();
}

function memberOf(serverId, userId) {
  return !!db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
}

function serverInfo(row, userId) {
  const members = db.prepare(
    'SELECT u.id, u.username FROM server_members m JOIN users u ON u.id = m.user_id WHERE m.server_id = ?'
  ).all(row.id);
  return {
    id: row.id, name: row.name, ownerId: row.owner_id, isOwner: row.owner_id === userId,
    worldType: row.world_type, mode: row.mode, worldSize: row.world_size, seed: row.seed,
    maxPlayers: row.max_players, inviteCode: row.owner_id === userId ? row.invite_code : undefined,
    createdAt: row.created_at, lastPlayed: row.last_played,
    members, online: roomUsers(row.id).length,
  };
}

// ---------- account routes ----------
app.post('/api/register', async (req, res) => {
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
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return fail(res, 409, 'Username is already taken');
  }
  const id = uid();
  const hash = await bcrypt.hash(password, 10);
  db.prepare('INSERT INTO users (id, username, email, pass_hash, created_at, last_login) VALUES (?,?,?,?,?,?)')
    .run(id, username, email ?? null, hash, now(), now());
  const token = uid();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(token, id, now());
  res.json({ token, user: { id, username, email: email ?? null, avatar: '', createdAt: now() } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? ''));
  if (!row || !(await bcrypt.compare(String(password ?? ''), row.pass_hash))) {
    return fail(res, 401, 'Wrong username or password');
  }
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), row.id);
  const token = uid();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)').run(token, row.id, now());
  res.json({ token, user: { id: row.id, username: row.username, email: row.email, avatar: row.avatar, createdAt: row.created_at } });
});

app.post('/api/logout', auth, (req, res) => {
  const h = req.headers.authorization;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(h.slice(7));
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

// ---------- server (world/lobby) routes ----------
app.get('/api/servers', auth, (req, res) => {
  const rows = db.prepare(
    'SELECT s.* FROM servers s JOIN server_members m ON m.server_id = s.id WHERE m.user_id = ? ORDER BY s.last_played DESC'
  ).all(req.user.id);
  res.json({ servers: rows.map((r) => serverInfo(r, req.user.id)) });
});

app.post('/api/servers', auth, (req, res) => {
  const { name, worldType, mode, worldSize, seed, maxPlayers } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 32) {
    return fail(res, 400, 'Server name must be 1-32 characters');
  }
  const id = uid();
  const code = makeInviteCode();
  db.prepare(`INSERT INTO servers (id, name, owner_id, world_type, mode, world_size, seed, max_players, invite_code, created_at, last_played)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, name.trim(), req.user.id, String(worldType ?? 'natural'), String(mode ?? 'survival'),
      String(worldSize ?? 'medium'), Number(seed ?? 0) | 0, Math.min(16, Math.max(1, Number(maxPlayers ?? 8))), code, now(), now());
  db.prepare('INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?,?,?)').run(id, req.user.id, now());
  const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(id);
  res.json({ server: serverInfo(row, req.user.id) });
});

app.post('/api/servers/join', auth, (req, res) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  const row = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(code);
  if (!row) return fail(res, 404, 'Invalid invite code');
  const count = db.prepare('SELECT COUNT(*) AS n FROM server_members WHERE server_id = ?').get(row.id).n;
  if (!memberOf(row.id, req.user.id) && count >= row.max_players) return fail(res, 403, 'Server is full');
  db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at) VALUES (?,?,?)').run(row.id, req.user.id, now());
  res.json({ server: serverInfo(row, req.user.id) });
});

app.get('/api/servers/:id', auth, (req, res) => {
  if (!memberOf(req.params.id, req.user.id)) return fail(res, 403, 'Not a member of this server');
  const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!row) return fail(res, 404, 'Server not found');
  res.json({ server: serverInfo(row, req.user.id) });
});

// ---------- progress + shared world state ----------
app.get('/api/progress/:serverId', auth, (req, res) => {
  if (!memberOf(req.params.serverId, req.user.id)) return fail(res, 403, 'Not a member of this server');
  const p = db.prepare('SELECT data, updated_at FROM progress WHERE server_id = ? AND user_id = ?')
    .get(req.params.serverId, req.user.id);
  const w = db.prepare('SELECT data, updated_at FROM world_state WHERE server_id = ?').get(req.params.serverId);
  res.json({
    progress: p ? JSON.parse(p.data) : null,
    world: w ? JSON.parse(w.data) : null,
  });
});

app.post('/api/progress/:serverId', auth, (req, res) => {
  if (!memberOf(req.params.serverId, req.user.id)) return fail(res, 403, 'Not a member of this server');
  const { progress, world } = req.body ?? {};
  const t = now();
  if (progress != null) {
    db.prepare(`INSERT INTO progress (server_id, user_id, data, updated_at) VALUES (?,?,?,?)
      ON CONFLICT(server_id, user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(req.params.serverId, req.user.id, JSON.stringify(progress), t);
  }
  if (world != null) {
    db.prepare(`INSERT INTO world_state (server_id, data, updated_at) VALUES (?,?,?)
      ON CONFLICT(server_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(req.params.serverId, JSON.stringify(world), t);
  }
  db.prepare('UPDATE servers SET last_played = ? WHERE id = ?').run(t, req.params.serverId);
  res.json({ ok: true, savedAt: t });
});

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

function broadcast(serverId, msg) {
  const room = rooms.get(serverId);
  if (!room) return;
  const text = JSON.stringify(msg);
  for (const { ws } of room.values()) {
    if (ws.readyState === 1) ws.send(text);
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const user = userBySession(url.searchParams.get('token'));
  const serverId = url.searchParams.get('server');
  if (!user || !serverId || !memberOf(serverId, user.id)) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  let room = rooms.get(serverId);
  if (!room) rooms.set(serverId, (room = new Map()));
  room.set(user.id, { ws, username: user.username });
  broadcast(serverId, { type: 'join', username: user.username, players: roomUsers(serverId) });

  ws.on('message', (raw) => {
    // position sync placeholder: relay to room (full gameplay sync = next phase)
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'pos') {
        broadcast(serverId, { type: 'pos', username: user.username, x: msg.x, y: msg.y, z: msg.z });
      }
    } catch { /* ignore malformed packets */ }
  });

  ws.on('close', () => {
    const r = rooms.get(serverId);
    if (r) {
      r.delete(user.id);
      if (r.size === 0) rooms.delete(serverId);
      else broadcast(serverId, { type: 'leave', username: user.username, players: roomUsers(serverId) });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Vyrthlands server on http://localhost:${PORT} (db: ${DB_PATH})`);
});
