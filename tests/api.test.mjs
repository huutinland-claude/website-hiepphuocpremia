// End-to-end API tests against an isolated temporary SQLite database.
// Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hpp-test-'));
process.env.SQLITE_PATH = path.join(tmp, 'test.db');
// TEST_DATABASE_URL=postgres://… runs the same suite against Postgres (must be an empty, disposable database).
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.SESSION_SECRET = crypto.randomBytes(40).toString('base64url');
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'Test-Admin-Pass-123';
for (const k of ['META_PIXEL_ID', 'META_CAPI_ACCESS_TOKEN', 'TELEGRAM_BOT_TOKEN', 'RESEND_API_KEY', 'LEAD_WEBHOOK_URL', 'TURNSTILE_SECRET_KEY', 'GA4_API_SECRET', 'HOTLINE', 'ZALO_PHONE', 'ZALO_URL']) delete process.env[k];

const { default: handler } = await import('../api/router.js');
const { normalizePhone } = await import('../lib/validate.js');
const { getDb } = await import('../lib/db.js');

let server, base;
before(async () => {
  server = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  const db = await getDb();
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

let ipCounter = 10;
const nextIp = () => `203.0.113.${ipCounter++}`;

async function call(p, { method = 'GET', body, headers = {}, cookie, ip } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), 'X-Forwarded-For': ip || '198.51.100.1', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}

const lead = (over = {}) => ({
  submission_id: crypto.randomUUID(),
  form_id: 'main',
  full_name: 'Nguyễn Văn Kiểm Thử',
  phone: '0912 345 678',
  need: 'dau-tu',
  product_interest: 'lien-ke',
  budget: '3-5',
  contact_method: 'zalo',
  lead_magnet: 'tham-quan',
  consent: true,
  elapsed_ms: 8000,
  attribution: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'search_brand', gclid: 'Cj0TEST', landing_url: 'https://example.com/?utm_source=google' },
  ab: { hero_copy: 'A' },
  ...over,
});

test('phone normalisation', () => {
  assert.equal(normalizePhone('+84 912 345 678'), '0912345678');
  assert.equal(normalizePhone('84912345678'), '0912345678');
  assert.equal(normalizePhone('0912.345.678'), '0912345678');
  assert.equal(normalizePhone('0281234567'), '');
  assert.equal(normalizePhone('02812345678'), '02812345678');
  assert.equal(normalizePhone('0112345678'), '');
  assert.equal(normalizePhone('12345'), '');
});

test('public config hides expired policies and exposes no secrets', async () => {
  const r = await call('/api/config');
  assert.equal(r.status, 200);
  const today = r.data.today;
  for (const p of r.data.policies) {
    assert.ok(!p.valid_to || p.valid_to >= today, `expired policy shown: ${p.id}`);
    assert.ok(p.valid_from && p.conditions, 'policy must have validity + conditions');
  }
  const json = JSON.stringify(r.data);
  assert.ok(!/ACCESS_TOKEN|api_secret|SESSION/i.test(json));
  assert.equal(r.data.contact.hotline, '');
});

test('lead validation errors (422)', async () => {
  const bad = await call('/api/leads', { method: 'POST', body: lead({ phone: '12345', full_name: '1', consent: false }), ip: nextIp() });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.errors.phone && bad.data.errors.full_name && bad.data.errors.consent);
});

test('honeypot and too-fast submissions are rejected', async () => {
  const hp = await call('/api/leads', { method: 'POST', body: lead({ company_website: 'http://spam' }), ip: nextIp() });
  assert.equal(hp.status, 422);
  const fast = await call('/api/leads', { method: 'POST', body: lead({ elapsed_ms: 300 }), ip: nextIp() });
  assert.equal(fast.status, 422);
});

let createdId;
test('valid lead is stored with attribution; replay is idempotent; repeat phone is merged', async () => {
  const body = lead();
  const ip = nextIp();
  const r1 = await call('/api/leads', { method: 'POST', body, ip });
  assert.equal(r1.status, 201);
  assert.ok(r1.data.id && r1.data.event_id.startsWith('lead_'));
  assert.equal(r1.data.schedule, true);
  createdId = r1.data.id;

  const r2 = await call('/api/leads', { method: 'POST', body, ip });
  assert.equal(r2.status, 200);
  assert.equal(r2.data.duplicate, true);
  assert.equal(r2.data.id, createdId);

  const r3 = await call('/api/leads', { method: 'POST', body: lead({ email: 'kiemthu@example.com' }), ip });
  assert.equal(r3.data.repeat, true);
  assert.equal(r3.data.id, createdId);
  assert.equal(r3.data.event_id, null, 'no second Lead conversion for a repeat');

  const db = await getDb();
  const row = await db.get('SELECT * FROM leads WHERE id = $1', [createdId]);
  assert.equal(row.phone, '0912345678');
  assert.equal(row.utm_source, 'google');
  assert.equal(row.gclid, 'Cj0TEST');
  assert.equal(row.email, 'kiemthu@example.com', 'repeat fills missing fields');
  assert.equal(row.priority, 'hot');
  assert.equal(row.consent, 1);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM leads')).n), 1);
});

test('rate limit per IP (5 per 10 minutes)', async () => {
  const ip = nextIp();
  for (let i = 0; i < 5; i++) {
    const r = await call('/api/leads', { method: 'POST', body: lead({ phone: `09000000${10 + i}` }), ip });
    assert.ok([200, 201].includes(r.status), `submission ${i} status ${r.status}`);
  }
  const blocked = await call('/api/leads', { method: 'POST', body: lead({ phone: '0900000099' }), ip });
  assert.equal(blocked.status, 429);
});

let adminCookie;
test('admin auth: 401 without session, wrong password rejected, login works', async () => {
  assert.equal((await call('/api/admin/leads')).status, 401);
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { email: 'admin@test.local', password: 'wrong-password' } })).status, 401);
  const ok = await call('/api/admin/login', { method: 'POST', body: { email: 'admin@test.local', password: 'Test-Admin-Pass-123' } });
  assert.equal(ok.status, 200);
  adminCookie = ok.headers.get('set-cookie').split(';')[0];
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
});

test('admin: list, CSRF guard, status change, notes, stats, exports', async () => {
  const list = await call('/api/admin/leads?q=kiem thu', { cookie: adminCookie });
  assert.equal(list.status, 200);
  assert.ok(list.data.rows.some((r) => r.id === createdId), 'accent-insensitive search');
  const byPhone = await call('/api/admin/leads?q=84912345678', { cookie: adminCookie });
  assert.equal(byPhone.data.total, 1);

  const noCsrf = await call('/api/admin/lead', { method: 'PATCH', cookie: adminCookie, body: { id: createdId, status: 'contacted' } });
  assert.equal(noCsrf.status, 403);

  const H = { 'X-Requested-With': 'hpp-admin' };
  assert.equal((await call('/api/admin/lead', { method: 'PATCH', cookie: adminCookie, headers: H, body: { id: createdId, status: 'qualified' } })).status, 200);
  assert.equal((await call('/api/admin/lead-note', { method: 'POST', cookie: adminCookie, headers: H, body: { id: createdId, type: 'call', content: 'Đã gọi' } })).status, 201);
  const detail = await call(`/api/admin/lead?id=${createdId}`, { cookie: adminCookie });
  assert.equal(detail.data.lead.status, 'qualified');
  assert.ok(detail.data.lead.qualified_at && detail.data.lead.first_response_at);
  assert.ok(detail.data.activities.some((a) => a.type === 'status'));

  const stats = await call('/api/admin/stats', { cookie: adminCookie });
  assert.equal(stats.status, 200);
  assert.ok(stats.data.totals.leads >= 6);
  assert.ok(stats.data.totals.qualified >= 1);

  const xlsx = await call('/api/admin/export?format=xlsx', { cookie: adminCookie });
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.data.subarray(0, 2).toString(), 'PK');
  const csv = await call('/api/admin/export?format=csv', { cookie: adminCookie });
  assert.ok(csv.data.toString('utf8').startsWith('﻿Thời gian'));
  const gads = await call('/api/admin/export-google-ads', { cookie: adminCookie });
  assert.match(gads.data.toString('utf8'), /Cj0TEST,Qualified Lead,/);
});

test('settings validation rejects policies without validity/conditions and bad payment schedules', async () => {
  const H = { 'X-Requested-With': 'hpp-admin' };
  const badPol = await call('/api/admin/settings', { method: 'PUT', cookie: adminCookie, headers: H, body: { key: 'policies', value: [{ id: 'x', title: 'X', summary: 'Y' }] } });
  assert.equal(badPol.status, 422);
  const badPm = await call('/api/admin/settings', { method: 'PUT', cookie: adminCookie, headers: H, body: { key: 'payment_methods', value: [{ id: 'a', name: 'A', discount: 0, schedule: [{ label: 'x', day: 0, pct: 50 }] }] } });
  assert.equal(badPm.status, 422);
  const ok = await call('/api/admin/settings', { method: 'PUT', cookie: adminCookie, headers: H, body: { key: 'contact', value: { hotline: '0909 000 000' } } });
  assert.equal(ok.status, 200);
  await call('/api/admin/settings?key=contact', { method: 'DELETE', cookie: adminCookie, headers: H });
});

test('role-based access: sales sees only assigned leads and cannot export', async () => {
  const H = { 'X-Requested-With': 'hpp-admin' };
  assert.equal((await call('/api/admin/users', { method: 'POST', cookie: adminCookie, headers: H, body: { email: 'sale1@test.local', name: 'Sale Một', role: 'sales', password: 'Sale-Pass-12345' } })).status, 201);
  const login = await call('/api/admin/login', { method: 'POST', body: { email: 'sale1@test.local', password: 'Sale-Pass-12345' } });
  const saleCookie = login.headers.get('set-cookie').split(';')[0];
  // new lead -> round-robin assigns to the only lead-receiving user
  const r = await call('/api/leads', { method: 'POST', body: lead({ phone: '0987654321' }), ip: nextIp() });
  const mine = await call('/api/admin/leads', { cookie: saleCookie });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.data.rows.map((x) => x.id), [r.data.id]);
  assert.equal((await call(`/api/admin/lead?id=${createdId}`, { cookie: saleCookie })).status, 403);
  assert.equal((await call('/api/admin/export', { cookie: saleCookie })).status, 403);
  assert.equal((await call('/api/admin/settings', { cookie: saleCookie })).status, 403);
});

test('QR endpoint returns SVG with UTM target', async () => {
  const r = await call('/api/qr?utm_source=leaflet&utm_campaign=t11');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /svg/);
  assert.match(r.headers.get('x-qr-target'), /utm_source=leaflet/);
});

test('A/B exposure endpoint only counts active tests', async () => {
  const r = await call('/api/ab', { method: 'POST', body: { exposures: { hero_copy: 'A', hero_image: 'B', bogus: 'Z' } } });
  assert.equal(r.status, 200);
  assert.equal(r.data.recorded, 1);
});

test('unknown route 404, wrong method 405', async () => {
  assert.equal((await call('/api/nope')).status, 404);
  assert.equal((await call('/api/leads')).status, 405);
});
