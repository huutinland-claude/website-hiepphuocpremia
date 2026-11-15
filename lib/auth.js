import crypto from 'node:crypto';
import { getDb, nowIso } from './db.js';
import { HttpError, parseCookies, cookie, isProd, clientIp, hashIp } from './http.js';
import { hit, count } from './ratelimit.js';

const COOKIE = 'hpp_admin';
const TTL_SECONDS = 12 * 60 * 60;
let devSecret = null;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd()) throw new HttpError(500, 'SESSION_SECRET chưa được cấu hình (>= 32 ký tự).');
  if (!devSecret) {
    devSecret = crypto.randomBytes(48).toString('base64url');
    console.warn('[auth] SESSION_SECRET not set – using an ephemeral dev secret (sessions reset on restart).');
  }
  return devSecret;
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(pw, stored) {
  const [alg, saltB64, hashB64] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64url'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

export function publicUser(u) {
  return u && { id: u.id, email: u.email, name: u.name, role: u.role, active: !!u.active, receive_leads: !!u.receive_leads, last_login_at: u.last_login_at, created_at: u.created_at };
}

export async function ensureBootstrapAdmin() {
  const db = await getDb();
  const row = await db.get('SELECT COUNT(*) AS n FROM users');
  if (Number(row.n) > 0) return false;
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || '';
  if (!email || pw.length < 10) return false;
  await db.run(
    'INSERT INTO users (id, email, name, password_hash, role, active, receive_leads, created_at) VALUES ($1,$2,$3,$4,$5,1,0,$6)',
    [crypto.randomUUID(), email, 'Administrator', hashPassword(pw), 'admin', nowIso()],
  );
  console.log(`[auth] bootstrap admin created: ${email}`);
  return true;
}

export async function login(req, email, password) {
  const ipKey = hashIp(clientIp(req));
  if ((await count('login', ipKey, 15 * 60)) >= 10) throw new HttpError(429, 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.');
  await ensureBootstrapAdmin();
  const db = await getDb();
  const user = await db.get('SELECT * FROM users WHERE email = $1', [String(email || '').trim().toLowerCase()]);
  const ok = user && user.active && verifyPassword(String(password || ''), user.password_hash);
  if (!ok) {
    await hit('login', ipKey);
    throw new HttpError(401, 'Email hoặc mật khẩu không đúng.');
  }
  await db.run('UPDATE users SET last_login_at = $1 WHERE id = $2', [nowIso(), user.id]);
  const token = sign({ uid: user.id, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS });
  return { user, setCookie: cookie(COOKIE, token, { maxAge: TTL_SECONDS }) };
}

export const logoutCookie = () => cookie(COOKIE, '', { maxAge: 0 });

/** Resolve the logged-in user; throws 401/403. Also enforces a CSRF header on state-changing requests. */
export async function requireUser(req, roles) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers['x-requested-with'] !== 'hpp-admin') throw new HttpError(403, 'CSRF check failed');
  }
  const p = verify(parseCookies(req)[COOKIE]);
  if (!p) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn.');
  const db = await getDb();
  const user = await db.get('SELECT * FROM users WHERE id = $1', [p.uid]);
  if (!user || !user.active) throw new HttpError(401, 'Tài khoản không còn hiệu lực.');
  if (roles && !roles.includes(user.role)) throw new HttpError(403, 'Bạn không có quyền thực hiện thao tác này.');
  return user;
}
