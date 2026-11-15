// Database-backed sliding window (works across serverless instances).
import { getDb, nowIso } from './db.js';

export async function count(bucket, key, windowSeconds) {
  const db = await getDb();
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const row = await db.get('SELECT COUNT(*) AS n FROM rate_events WHERE bucket = $1 AND key = $2 AND created_at > $3', [bucket, key, since]);
  return Number(row?.n || 0);
}

export async function hit(bucket, key) {
  const db = await getDb();
  await db.run('INSERT INTO rate_events (bucket, key, created_at) VALUES ($1,$2,$3)', [bucket, key, nowIso()]);
  if (Math.random() < 0.02) {
    const old = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    await db.run('DELETE FROM rate_events WHERE created_at < $1', [old]);
  }
}
