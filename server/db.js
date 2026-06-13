/**
 * Storage layer with two engines behind one async API:
 *  - a postgres:// URL found in the environment -> Postgres (Neon, Railway Postgres, etc.)
 *  - otherwise                                  -> built-in node:sqlite file (zero-setup local dev)
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
    invite_code TEXT UNIQUE NOT NULL, created_at BIGINT NOT NULL, last_played BIGINT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private'
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

/** Env var names checked for a Postgres connection string, in order. */
const URL_VARS = [
  'DATABASE_URL', 'DATABASE_PRIVATE_URL', 'DATABASE_PUBLIC_URL',
  'POSTGRES_URL', 'POSTGRESQL_URL', 'NEON_DATABASE_URL', 'PG_CONNECTION_STRING',
];

/**
 * Find a usable Postgres URL in the environment. Tolerates common
 * copy/paste artifacts from the Neon dashboard: surrounding whitespace,
 * wrapping quotes, and a leading `psql ` (the "psql" tab's command).
 */
export function findDatabaseUrl() {
  for (const name of URL_VARS) {
    const raw = process.env[name];
    if (!raw || !raw.trim()) continue;
    const url = raw.trim().replace(/^psql\s+/i, '').trim().replace(/^['"]+|['"]+$/g, '').trim();
    if (!/^postgres(ql)?:\/\//i.test(url)) {
      console.warn(`[db] ${name} is set but is not a postgres:// URL (starts with "${url.slice(0, 12)}…") — ignoring it`);
      continue;
    }
    return { name, url };
  }
  return null;
}

export function dbEnvKeys() {
  return Object.keys(process.env).filter((k) => /DATABASE|POSTGRES|NEON|^PG/i.test(k));
}

export async function openDb() {
  const found = findDatabaseUrl();
  if (found) {
    const { name, url } = found;
    const u = new URL(url);
    const { default: pg } = await import('pg');
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({
      connectionString: url,
      ssl: local ? undefined : { rejectUnauthorized: false }, // Neon/Railway need TLS
      max: 5,
    });
    try {
      await pool.query(SCHEMA);
      // migration for DBs created before the visibility column existed
      await pool.query("ALTER TABLE servers ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'");
    } catch (e) {
      console.error(`[db] FAILED to connect to Postgres via ${name} (host ${u.hostname}, db ${u.pathname.slice(1) || '?'}): ${e.message}`);
      console.error('[db] Refusing to fall back to sqlite when a database URL is set — fix the connection string and redeploy.');
      throw e;
    }
    console.log(`[db] Postgres connected via ${name} (host ${u.hostname}, db ${u.pathname.slice(1) || 'default'})`);
    return {
      engine: 'postgres',
      via: name,
      host: u.hostname,
      database: u.pathname.slice(1) || null,
      all: (sql, params = []) => pool.query(sql, params).then((r) => r.rows),
      get: (sql, params = []) => pool.query(sql, params).then((r) => r.rows[0] ?? null),
      run: (sql, params = []) => pool.query(sql, params).then(() => undefined),
    };
  }

  // No Postgres URL visible. On a hosting platform that almost certainly
  // means misconfiguration (sqlite data is wiped on every redeploy), so be loud.
  const hosted = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID
    || process.env.RENDER || process.env.FLY_APP_NAME || process.env.NODE_ENV === 'production';
  if (hosted) {
    console.warn('[db] *** WARNING: no DATABASE_URL visible to this process — using a LOCAL SQLITE FILE. ***');
    console.warn('[db] *** Accounts and saves will be LOST on every redeploy/restart. ***');
    console.warn('[db] *** On Railway: open THIS service -> Variables tab -> add DATABASE_URL with the Neon string, then redeploy. ***');
    console.warn(`[db] db-related env vars visible right now: ${dbEnvKeys().join(', ') || '(none)'}`);
  }

  const { DatabaseSync } = await import('node:sqlite');
  const file = process.env.DB_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), 'vyrthlands.db');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // migration for older sqlite files (ADD COLUMN throws if it already exists)
  try { db.exec("ALTER TABLE servers ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'"); } catch { /* already present */ }
  console.log(`[db] sqlite at ${file}`);
  const rewrite = (sql, params) => {
    const out = [];
    const text = sql.replace(/\$(\d+)/g, (_, n) => { out.push(params[+n - 1]); return '?'; });
    return { text, out };
  };
  return {
    engine: 'sqlite',
    via: null,
    host: null,
    database: file,
    all: async (sql, params = []) => { const { text, out } = rewrite(sql, params); return db.prepare(text).all(...out); },
    get: async (sql, params = []) => { const { text, out } = rewrite(sql, params); return db.prepare(text).get(...out) ?? null; },
    run: async (sql, params = []) => { const { text, out } = rewrite(sql, params); db.prepare(text).run(...out); },
  };
}
