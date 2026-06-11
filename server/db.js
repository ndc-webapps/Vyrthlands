/**
 * Storage layer with two engines behind one async API:
 *  - DATABASE_URL set  -> Postgres (Neon, Railway Postgres, etc.)
 *  - otherwise         -> built-in node:sqlite file (zero-setup local dev)
 * Queries are written with $1..$n placeholders (Postgres style); the
 * sqlite wrapper rewrites them positionally.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
    email TEXT, pass_hash TEXT NOT NULL, avatar TEXT DEFAULT '',
    created_at BIGINT NOT NULL, last_login BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL,
    world_type TEXT NOT NULL, mode TEXT NOT NULL, world_size TEXT NOT NULL,
    seed BIGINT NOT NULL, max_players INTEGER NOT NULL DEFAULT 8,
    invite_code TEXT UNIQUE NOT NULL, created_at BIGINT NOT NULL, last_played BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS server_members (
    server_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at BIGINT NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS progress (
    server_id TEXT NOT NULL, user_id TEXT NOT NULL,
    data TEXT NOT NULL, updated_at BIGINT NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS world_state (
    server_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at BIGINT NOT NULL
  );
`;

export async function openDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({
      connectionString: url,
      ssl: local ? undefined : { rejectUnauthorized: false }, // Neon/Railway need TLS
      max: 5,
    });
    await pool.query(SCHEMA);
    console.log('[db] Postgres connected');
    return {
      engine: 'postgres',
      all: (sql, params = []) => pool.query(sql, params).then((r) => r.rows),
      get: (sql, params = []) => pool.query(sql, params).then((r) => r.rows[0] ?? null),
      run: (sql, params = []) => pool.query(sql, params).then(() => undefined),
    };
  }

  const { DatabaseSync } = await import('node:sqlite');
  const file = process.env.DB_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), 'vyrthlands.db');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  console.log(`[db] sqlite at ${file}`);
  const rewrite = (sql, params) => {
    const out = [];
    const text = sql.replace(/\$(\d+)/g, (_, n) => { out.push(params[+n - 1]); return '?'; });
    return { text, out };
  };
  return {
    engine: 'sqlite',
    all: async (sql, params = []) => { const { text, out } = rewrite(sql, params); return db.prepare(text).all(...out); },
    get: async (sql, params = []) => { const { text, out } = rewrite(sql, params); return db.prepare(text).get(...out) ?? null; },
    run: async (sql, params = []) => { const { text, out } = rewrite(sql, params); db.prepare(text).run(...out); },
  };
}
