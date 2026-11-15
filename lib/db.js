// Database adapter: Postgres (DATABASE_URL) in production / Vercel, built-in SQLite (node:sqlite) locally.
// All SQL is written with $1, $2… placeholders and portable types (TEXT / INTEGER / BIGINT).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'sales',
    active INTEGER NOT NULL DEFAULT 1,
    receive_leads INTEGER NOT NULL DEFAULT 1,
    last_assigned_at TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    submission_id TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    need TEXT,
    product_interest TEXT,
    budget TEXT,
    contact_method TEXT,
    lead_magnet TEXT,
    message TEXT,
    form_id TEXT,
    consent INTEGER NOT NULL DEFAULT 0,
    consent_text TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    priority TEXT,
    assigned_to TEXT,
    assigned_at TEXT,
    first_response_at TEXT,
    qualified_at TEXT,
    duplicate_of TEXT,
    lost_reason TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    gclid TEXT,
    gbraid TEXT,
    wbraid TEXT,
    fbclid TEXT,
    ttclid TEXT,
    fbp TEXT,
    fbc TEXT,
    ga_client_id TEXT,
    referrer TEXT,
    landing_url TEXT,
    first_touch TEXT,
    ab_variants TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    event_id TEXT,
    capi_status TEXT,
    notify_status TEXT,
    search_text TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(utm_source, utm_campaign)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to)`,
  `CREATE TABLE IF NOT EXISTS lead_activities (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT,
    type TEXT NOT NULL,
    content TEXT,
    meta TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_act_lead ON lead_activities(lead_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ab_exposures (
    day TEXT NOT NULL,
    test TEXT NOT NULL,
    variant TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, test, variant)
  )`,
  `CREATE TABLE IF NOT EXISTS ad_spend (
    id TEXT PRIMARY KEY,
    date_from TEXT NOT NULL,
    date_to TEXT NOT NULL,
    source TEXT NOT NULL,
    campaign TEXT,
    amount BIGINT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS rate_events (
    bucket TEXT NOT NULL,
    key TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_rate ON rate_events(bucket, key, created_at)`,
];

let instance = null;
let initPromise = null;

export function dialect() {
  return process.env.DATABASE_URL ? 'postgres' : 'sqlite';
}

async function createPostgres() {
  const { default: pg } = await import('pg');
  // BIGINT (int8) -> JS number (amounts in VND fit safely below 2^53)
  pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 3),
    ssl: /sslmode=disable/.test(process.env.DATABASE_URL) || /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
      ? false
      : { rejectUnauthorized: false },
  });
  const api = {
    kind: 'postgres',
    async all(sql, params = []) { return (await pool.query(sql, params)).rows; },
    async get(sql, params = []) { return (await pool.query(sql, params)).rows[0] || null; },
    async run(sql, params = []) { const r = await pool.query(sql, params); return { changes: r.rowCount }; },
    async close() { await pool.end(); },
  };
  for (const stmt of SCHEMA) await pool.query(stmt);
  return api;
}

async function createSqlite() {
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL (Postgres) is required on Vercel – the serverless filesystem is not persistent.');
  }
  const { DatabaseSync } = await import('node:sqlite');
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = path.resolve(projectRoot, process.env.SQLITE_PATH || 'data/leads.db');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  for (const stmt of SCHEMA) db.exec(stmt);
  const conv = (sql) => sql.replace(/\$(\d+)/g, '?$1');
  const norm = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
  const plain = (row) => (row ? { ...row } : null);
  return {
    kind: 'sqlite',
    async all(sql, params = []) { return db.prepare(conv(sql)).all(...norm(params)).map(plain); },
    async get(sql, params = []) { return plain(db.prepare(conv(sql)).get(...norm(params))); },
    async run(sql, params = []) { const r = db.prepare(conv(sql)).run(...norm(params)); return { changes: Number(r.changes) }; },
    async close() { db.close(); },
  };
}

export async function getDb() {
  if (instance) return instance;
  if (!initPromise) {
    initPromise = (dialect() === 'postgres' ? createPostgres() : createSqlite())
      .then((d) => { instance = d; return d; })
      .catch((e) => { initPromise = null; throw e; });
  }
  return initPromise;
}

export const nowIso = () => new Date().toISOString();
