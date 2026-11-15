// Usage: npm run create-admin -- email@company.vn "Họ tên" "MậtKhẩuDài>=10" [admin|manager|sales]
import crypto from 'node:crypto';
import { getDb, nowIso } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';

const [email, name, password, role = 'admin'] = process.argv.slice(2);
if (!email || !name || !password || password.length < 10 || !['admin', 'manager', 'sales'].includes(role)) {
  console.error('Usage: npm run create-admin -- <email> "<name>" "<password (>=10 chars)>" [admin|manager|sales]');
  process.exit(1);
}
const db = await getDb();
const existing = await db.get('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
if (existing) {
  await db.run('UPDATE users SET password_hash = $1, role = $2, active = 1, name = $3 WHERE id = $4', [hashPassword(password), role, name, existing.id]);
  console.log(`Updated user ${email} (${role}).`);
} else {
  await db.run(
    'INSERT INTO users (id, email, name, password_hash, role, active, receive_leads, created_at) VALUES ($1,$2,$3,$4,$5,1,$6,$7)',
    [crypto.randomUUID(), email.toLowerCase(), name, hashPassword(password), role, role === 'admin' ? 0 : 1, nowIso()],
  );
  console.log(`Created user ${email} (${role}).`);
}
await db.close();
