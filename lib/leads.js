// Lead intake: validation, anti-spam, de-duplication, assignment, persistence, CAPI + notifications.
import crypto from 'node:crypto';
import { getDb, nowIso } from './db.js';
import { HttpError, clientIp, hashIp, parseCookies, requestUrl } from './http.js';
import { clean, cleanUrl, normalizePhone, isEmail, isValidName, pick, fold } from './validate.js';
import { count, hit } from './ratelimit.js';
import { sendMetaEvent, gaClientIdFromCookie } from './tracking.js';
import { notifyNewLead } from './notify.js';
import * as C from './constants.js';

const REPEAT_WINDOW_MIN = 30;

export function computePriority(l) {
  let s = 0;
  if (['3-5', '5-8', 'tren-8'].includes(l.budget)) s += 2;
  else if (['2-3', 'duoi-2'].includes(l.budget)) s += 1;
  if (l.need) s += 1;
  if (l.product_interest && l.product_interest !== 'chua-xac-dinh') s += 1;
  if (l.lead_magnet === 'tham-quan' || l.lead_magnet === 'tu-van') s += 2;
  if (l.email) s += 1;
  return s >= 5 ? 'hot' : s >= 3 ? 'warm' : 'cold';
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.TURNSTILE_SITE_KEY) return true;
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: String(token).slice(0, 2048), remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    return !!j.success;
  } catch { return false; }
}

/** Round-robin among active sales users who receive leads. */
export async function pickAssignee(db) {
  const u = await db.get(
    `SELECT * FROM users WHERE active = 1 AND receive_leads = 1 AND role IN ('sales','manager')
     ORDER BY CASE WHEN last_assigned_at IS NULL THEN 0 ELSE 1 END, last_assigned_at ASC LIMIT 1`,
  );
  return u || null;
}

export async function logActivity(db, { leadId, user, type, content, meta }) {
  await db.run(
    'INSERT INTO lead_activities (id, lead_id, created_at, user_id, user_name, type, content, meta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [crypto.randomUUID(), leadId, nowIso(), user?.id || null, user?.name || 'Hệ thống', type, content || '', meta ? JSON.stringify(meta) : null],
  );
}

function adminLink(req, id) {
  const base = process.env.SITE_URL || requestUrl(req).origin;
  return `${base.replace(/\/$/, '')}/admin/#lead=${id}`;
}

export async function createLead(req, body) {
  const ip = clientIp(req);
  const ipHash = hashIp(ip);
  const ua = clean(req.headers['user-agent'], 400);

  // ---- anti-spam -------------------------------------------------------
  if (clean(body.company_website)) throw new HttpError(422, 'Không thể gửi biểu mẫu. Vui lòng liên hệ hotline.');
  if (Number(body.elapsed_ms) > 0 && Number(body.elapsed_ms) < 1500) throw new HttpError(422, 'Vui lòng kiểm tra lại thông tin trước khi gửi.');
  if (!(await verifyTurnstile(body.turnstile_token, ip))) throw new HttpError(422, 'Xác minh chống spam không thành công. Vui lòng thử lại.');
  if ((await count('lead', ipHash, 10 * 60)) >= 5 || (await count('lead', ipHash, 24 * 3600)) >= 20) {
    throw new HttpError(429, 'Bạn đã gửi quá nhiều lần. Vui lòng thử lại sau hoặc gọi hotline.');
  }

  // ---- validation ------------------------------------------------------
  const errors = {};
  const full_name = clean(body.full_name, 80);
  const phone = normalizePhone(body.phone);
  const email = clean(body.email, 254).toLowerCase();
  if (!isValidName(full_name)) errors.full_name = 'Vui lòng nhập họ và tên hợp lệ.';
  if (!phone) errors.phone = 'Số điện thoại không hợp lệ (VD: 0912 345 678).';
  if (email && !isEmail(email)) errors.email = 'Email không hợp lệ.';
  if (body.consent !== true) errors.consent = 'Vui lòng đồng ý với điều khoản xử lý dữ liệu để được tư vấn.';
  const submission_id = clean(body.submission_id, 64);
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(submission_id)) errors.submission_id = 'invalid';
  if (Object.keys(errors).length) throw new HttpError(422, 'Vui lòng kiểm tra lại thông tin.', { errors });

  const a = body.attribution && typeof body.attribution === 'object' ? body.attribution : {};
  const cookies = parseCookies(req);
  const ab = body.ab && typeof body.ab === 'object'
    ? Object.fromEntries(Object.entries(body.ab).slice(0, 10).map(([k, v]) => [clean(k, 40), clean(v, 40)]))
    : {};
  const first = a.first_touch && typeof a.first_touch === 'object'
    ? Object.fromEntries(Object.entries(a.first_touch).slice(0, 15).map(([k, v]) => [clean(k, 30), clean(v, 500)]))
    : null;

  const db = await getDb();

  // ---- idempotency: same submission replayed (double click / retry) ----
  const replay = await db.get('SELECT id, event_id FROM leads WHERE submission_id = $1', [submission_id]);
  if (replay) return { ok: true, id: replay.id, event_id: replay.event_id, duplicate: true };

  const now = nowIso();
  const lead = {
    id: crypto.randomUUID(),
    submission_id,
    created_at: now,
    updated_at: now,
    full_name,
    phone,
    email: email || null,
    need: pick(body.need, C.NEEDS) || null,
    product_interest: pick(body.product_interest, C.PRODUCTS) || null,
    budget: pick(body.budget, C.BUDGETS) || null,
    contact_method: pick(body.contact_method, C.CONTACT_METHODS) || null,
    lead_magnet: pick(body.lead_magnet, C.LEAD_MAGNETS) || 'bang-gia',
    message: clean(body.message, 500) || null,
    form_id: clean(body.form_id, 30) || null,
    consent: 1,
    consent_text: C.CONSENT_TEXT,
    status: 'new',
    utm_source: clean(a.utm_source, 120) || null,
    utm_medium: clean(a.utm_medium, 120) || null,
    utm_campaign: clean(a.utm_campaign, 200) || null,
    utm_content: clean(a.utm_content, 200) || null,
    utm_term: clean(a.utm_term, 200) || null,
    gclid: clean(a.gclid, 200) || null,
    gbraid: clean(a.gbraid, 200) || null,
    wbraid: clean(a.wbraid, 200) || null,
    fbclid: clean(a.fbclid, 300) || null,
    ttclid: clean(a.ttclid, 200) || null,
    fbp: clean(cookies._fbp || body.fbp, 200) || null,
    fbc: clean(cookies._fbc || body.fbc, 400) || (a.fbclid ? `fb.1.${Date.now()}.${clean(a.fbclid, 300)}` : null),
    ga_client_id: gaClientIdFromCookie(cookies._ga) || null,
    referrer: cleanUrl(a.referrer) || null,
    landing_url: cleanUrl(a.landing_url) || null,
    first_touch: first ? JSON.stringify(first) : null,
    ab_variants: Object.keys(ab).length ? JSON.stringify(ab) : null,
    ip_hash: ipHash,
    user_agent: ua,
  };
  lead.priority = computePriority(lead);
  lead.event_id = 'lead_' + lead.id;
  lead.search_text = fold([full_name, phone, email].join(' '));

  await hit('lead', ipHash);

  // ---- repeat submission from the same phone shortly after -------------
  const since = new Date(Date.now() - REPEAT_WINDOW_MIN * 60 * 1000).toISOString();
  const recent = await db.get('SELECT * FROM leads WHERE phone = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 1', [phone, since]);
  if (recent) {
    const fill = {};
    for (const k of ['email', 'need', 'product_interest', 'budget', 'contact_method', 'message']) if (!recent[k] && lead[k]) fill[k] = lead[k];
    const keys = Object.keys(fill);
    if (keys.length) {
      await db.run(
        `UPDATE leads SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = $${keys.length + 1} WHERE id = $${keys.length + 2}`,
        [...keys.map((k) => fill[k]), now, recent.id],
      );
    }
    await logActivity(db, { leadId: recent.id, type: 'system', content: `Khách gửi lại form (${C.LEAD_MAGNETS[lead.lead_magnet] || ''}).`, meta: { form_id: lead.form_id, fill: keys } });
    return { ok: true, id: recent.id, event_id: null, repeat: true };
  }

  const older = await db.get('SELECT id FROM leads WHERE phone = $1 ORDER BY created_at ASC LIMIT 1', [phone]);
  if (older) lead.duplicate_of = older.id;

  const assignee = await pickAssignee(db);
  if (assignee) {
    lead.assigned_to = assignee.id;
    lead.assigned_at = now;
  }

  const cols = Object.keys(lead);
  await db.run(`INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map((k) => lead[k]));
  if (assignee) await db.run('UPDATE users SET last_assigned_at = $1 WHERE id = $2', [now, assignee.id]);
  await logActivity(db, {
    leadId: lead.id, type: 'created',
    content: `Đăng ký từ form "${lead.form_id || 'web'}"${assignee ? ` – tự động phân công cho ${assignee.name}` : ''}${older ? ' – số điện thoại đã từng đăng ký trước đó' : ''}.`,
  });

  // ---- server-side conversion + notifications (parallel, time-boxed) ---
  const sourceUrl = lead.landing_url || undefined;
  const custom = { lead_type: lead.lead_magnet, product: lead.product_interest || undefined };
  const tasks = [
    sendMetaEvent({ eventName: 'Lead', eventId: lead.event_id, lead, sourceUrl, ip, ua, customData: custom }),
    sendMetaEvent({ eventName: 'CompleteRegistration', eventId: lead.event_id + '_cr', lead, sourceUrl, ip, ua, customData: custom }),
    lead.lead_magnet === 'tham-quan'
      ? sendMetaEvent({ eventName: 'Schedule', eventId: lead.event_id + '_sch', lead, sourceUrl, ip, ua, customData: custom })
      : Promise.resolve(null),
    notifyNewLead(lead, assignee, adminLink(req, lead.id)),
  ];
  const [capiLead, capiCr, capiSch, notified] = await Promise.all(tasks);
  const capi_status = [`Lead=${capiLead}`, `CR=${capiCr}`, capiSch ? `Schedule=${capiSch}` : null].filter(Boolean).join(' ');
  await db.run('UPDATE leads SET capi_status = $1, notify_status = $2 WHERE id = $3', [capi_status, notified, lead.id]);

  return { ok: true, id: lead.id, event_id: lead.event_id, schedule: lead.lead_magnet === 'tham-quan' };
}
