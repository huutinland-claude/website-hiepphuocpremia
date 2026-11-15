import crypto from 'node:crypto';
import { getDb, nowIso } from '../db.js';
import { send, readJson, HttpError, requestUrl, clientIp } from '../http.js';
import { login, logoutCookie, requireUser, publicUser, hashPassword } from '../auth.js';
import { getSettings, saveSetting, resetSetting, DEFAULTS, SETTING_KEYS, todayVN } from '../content.js';
import { logActivity } from '../leads.js';
import { sendMetaEvent, sendGa4Event } from '../tracking.js';
import { clean, fold, isEmail } from '../validate.js';
import { buildXlsx, buildCsv } from '../xlsx.js';
import * as C from '../constants.js';

const MANAGERS = ['admin', 'manager'];
const vnStart = (d) => new Date(`${d}T00:00:00+07:00`).toISOString();
const vnEndExcl = (d) => new Date(new Date(`${d}T00:00:00+07:00`).getTime() + 86400000).toISOString();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const toVN = (iso) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().replace('T', ' ').slice(0, 16) : '');
const parseJson = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// ---------------------------------------------------------------- auth
export async function postLogin(req, res) {
  const body = await readJson(req, 4096);
  const { user, setCookie } = await login(req, body.email, body.password);
  send(res, 200, { ok: true, user: publicUser(user) }, { 'Set-Cookie': setCookie });
}

export async function postLogout(req, res) {
  send(res, 200, { ok: true }, { 'Set-Cookie': logoutCookie() });
}

export async function getMe(req, res) {
  const user = await requireUser(req);
  send(res, 200, {
    user: publicUser(user),
    options: { statuses: C.STATUSES, needs: C.NEEDS, products: C.PRODUCTS, budgets: C.BUDGETS, contact_methods: C.CONTACT_METHODS, lead_magnets: C.LEAD_MAGNETS, roles: C.ROLES },
    integrations: {
      database: process.env.DATABASE_URL ? 'postgres' : 'sqlite',
      meta_pixel: !!process.env.META_PIXEL_ID,
      meta_capi: !!(process.env.META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN),
      meta_test_mode: !!process.env.META_TEST_EVENT_CODE,
      gtm: !!process.env.GTM_ID,
      ga4: !!process.env.GA4_MEASUREMENT_ID,
      ga4_mp: !!(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET),
      google_ads: !!(process.env.GOOGLE_ADS_ID && process.env.GOOGLE_ADS_LEAD_LABEL),
      turnstile: !!(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY),
      telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      email: !!(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO),
      webhook: !!process.env.LEAD_WEBHOOK_URL,
      site_url: process.env.SITE_URL || '',
      session_secret: !!(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
    },
  });
}

// ---------------------------------------------------------------- leads
function leadFilters(user, q) {
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (user.role === 'sales') add('assigned_to = ?', user.id);
  if (q.get('status')) add('status = ?', q.get('status'));
  const src = q.get('source');
  if (src === '(direct)') where.push('utm_source IS NULL');
  else if (src) add('utm_source = ?', src);
  if (q.get('campaign')) add('utm_campaign = ?', q.get('campaign'));
  for (const k of ['need', 'budget', 'priority', 'lead_magnet', 'form_id']) if (q.get(k)) add(`${k} = ?`, q.get(k));
  if (q.get('product')) add('product_interest = ?', q.get('product'));
  const asg = q.get('assigned');
  if (asg === 'none') where.push('assigned_to IS NULL');
  else if (asg) add('assigned_to = ?', asg);
  if (isDate(q.get('from'))) add('created_at >= ?', vnStart(q.get('from')));
  if (isDate(q.get('to'))) add('created_at < ?', vnEndExcl(q.get('to')));
  const term = clean(q.get('q'), 80);
  if (term) {
    const digits = term.replace(/[\s.\-+]/g, '');
    const needle = /^\d{3,}$/.test(digits) ? digits.replace(/^84/, '0') : fold(term).replace(/[%_]/g, '');
    add('search_text LIKE ?', `%${needle}%`);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

export async function listLeads(req, res) {
  const user = await requireUser(req);
  const q = requestUrl(req).searchParams;
  const { sql, params } = leadFilters(user, q);
  const limit = Math.min(200, Math.max(1, Number(q.get('limit')) || 50));
  const page = Math.max(1, Number(q.get('page')) || 1);
  const db = await getDb();
  const total = Number((await db.get(`SELECT COUNT(*) AS n FROM leads ${sql}`, params)).n);
  const rows = await db.all(
    `SELECT l.id, l.created_at, l.full_name, l.phone, l.email, l.need, l.product_interest, l.budget, l.lead_magnet, l.contact_method,
            l.status, l.priority, l.assigned_to, l.first_response_at, l.utm_source, l.utm_medium, l.utm_campaign, l.form_id, l.duplicate_of,
            u.name AS assigned_name
       FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
       ${sql.replace(/\b(status|utm_source|utm_campaign|need|budget|priority|lead_magnet|form_id|product_interest|assigned_to|created_at|search_text)\b/g, 'l.$1')}
       ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    params,
  );
  const facets = user.role === 'sales' ? {} : {
    sources: (await db.all('SELECT DISTINCT utm_source AS v FROM leads WHERE utm_source IS NOT NULL ORDER BY utm_source')).map((r) => r.v),
    campaigns: (await db.all('SELECT DISTINCT utm_campaign AS v FROM leads WHERE utm_campaign IS NOT NULL ORDER BY utm_campaign')).map((r) => r.v),
    users: (await db.all("SELECT id, name, role, active FROM users ORDER BY name")).map((u) => ({ ...u, active: !!u.active })),
  };
  send(res, 200, { total, page, limit, rows, facets });
}

async function loadLeadFor(user, id) {
  const db = await getDb();
  const lead = await db.get('SELECT * FROM leads WHERE id = $1', [clean(id, 64)]);
  if (!lead) throw new HttpError(404, 'Không tìm thấy lead.');
  if (user.role === 'sales' && lead.assigned_to !== user.id) throw new HttpError(403, 'Lead này không được phân công cho bạn.');
  return lead;
}

export async function getLead(req, res) {
  const user = await requireUser(req);
  const lead = await loadLeadFor(user, requestUrl(req).searchParams.get('id'));
  const db = await getDb();
  const activities = await db.all('SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC', [lead.id]);
  const related = await db.all('SELECT id, created_at, status, form_id, lead_magnet FROM leads WHERE phone = $1 AND id <> $2 ORDER BY created_at DESC', [lead.phone, lead.id]);
  const users = (await db.all('SELECT id, name, role, active FROM users WHERE active = 1 ORDER BY name')).map((u) => ({ ...u, active: !!u.active }));
  delete lead.ip_hash;
  delete lead.search_text;
  lead.first_touch = parseJson(lead.first_touch);
  lead.ab_variants = parseJson(lead.ab_variants);
  send(res, 200, { lead, activities: activities.map((a) => ({ ...a, meta: parseJson(a.meta) })), related, users });
}

async function onQualified(lead, req) {
  const [meta, ga] = await Promise.all([
    sendMetaEvent({ eventName: 'QualifiedLead', eventId: `${lead.event_id || lead.id}_q`, lead, actionSource: 'system_generated', ua: lead.user_agent, customData: { lead_type: lead.lead_magnet } }),
    sendGa4Event({ clientId: lead.ga_client_id, name: 'qualify_lead', params: { lead_source: lead.utm_source || 'direct', campaign: lead.utm_campaign || '', value: 1, currency: 'VND' } }),
  ]);
  return { meta_capi: meta, ga4_mp: ga };
}

export async function patchLead(req, res) {
  const user = await requireUser(req);
  const body = await readJson(req, 8192);
  const lead = await loadLeadFor(user, body.id);
  const db = await getDb();
  const sets = {};
  const now = nowIso();
  const logs = [];

  if (body.status !== undefined && body.status !== lead.status) {
    if (!C.STATUSES[body.status]) throw new HttpError(422, 'Trạng thái không hợp lệ.');
    sets.status = body.status;
    if (body.status === 'lost') sets.lost_reason = clean(body.lost_reason, 300) || null;
    if (!lead.first_response_at && lead.status === 'new') sets.first_response_at = now;
    let meta = null;
    if (C.QUALIFIED_SET.includes(body.status) && !lead.qualified_at) {
      sets.qualified_at = now;
      meta = await onQualified(lead, req);
    }
    logs.push({ type: 'status', content: `${C.STATUSES[lead.status]} → ${C.STATUSES[body.status]}${sets.lost_reason ? ` (lý do: ${sets.lost_reason})` : ''}`, meta });
  }

  if (body.assigned_to !== undefined && body.assigned_to !== lead.assigned_to) {
    if (!MANAGERS.includes(user.role)) throw new HttpError(403, 'Chỉ quản lý mới được phân công lead.');
    let name = 'Chưa phân công';
    if (body.assigned_to) {
      const u = await db.get('SELECT id, name FROM users WHERE id = $1 AND active = 1', [clean(body.assigned_to, 64)]);
      if (!u) throw new HttpError(422, 'Nhân viên không hợp lệ.');
      name = u.name;
      await db.run('UPDATE users SET last_assigned_at = $1 WHERE id = $2', [now, u.id]);
    }
    sets.assigned_to = body.assigned_to || null;
    sets.assigned_at = body.assigned_to ? now : null;
    logs.push({ type: 'assign', content: `Phân công cho ${name}` });
  }

  const keys = Object.keys(sets);
  if (!keys.length) return send(res, 200, { ok: true, unchanged: true });
  await db.run(
    `UPDATE leads SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = $${keys.length + 1} WHERE id = $${keys.length + 2}`,
    [...keys.map((k) => sets[k]), now, lead.id],
  );
  for (const l of logs) await logActivity(db, { leadId: lead.id, user, ...l });
  send(res, 200, { ok: true });
}

export async function postLeadNote(req, res) {
  const user = await requireUser(req);
  const body = await readJson(req, 8192);
  const lead = await loadLeadFor(user, body.id);
  const types = { note: 'Ghi chú', call: 'Gọi điện', zalo: 'Nhắn Zalo', email: 'Gửi email', meeting: 'Gặp trực tiếp' };
  const type = types[body.type] ? body.type : 'note';
  const content = clean(body.content, 2000);
  if (!content) throw new HttpError(422, 'Nội dung không được để trống.');
  const db = await getDb();
  await logActivity(db, { leadId: lead.id, user, type, content });
  if (type !== 'note' && !lead.first_response_at) {
    await db.run('UPDATE leads SET first_response_at = $1, updated_at = $1 WHERE id = $2', [nowIso(), lead.id]);
  }
  send(res, 201, { ok: true });
}

// ---------------------------------------------------------------- export
const EXPORT_COLS = [
  ['Thời gian (GMT+7)', (l) => toVN(l.created_at)], ['Họ tên', (l) => l.full_name], ['Số điện thoại', (l) => l.phone], ['Email', (l) => l.email],
  ['Nhu cầu', (l) => C.NEEDS[l.need]], ['Sản phẩm quan tâm', (l) => C.PRODUCTS[l.product_interest]], ['Ngân sách', (l) => C.BUDGETS[l.budget]],
  ['Liên hệ qua', (l) => C.CONTACT_METHODS[l.contact_method]], ['Yêu cầu', (l) => C.LEAD_MAGNETS[l.lead_magnet]], ['Ghi chú KH', (l) => l.message],
  ['Trạng thái', (l) => C.STATUSES[l.status]], ['Ưu tiên', (l) => l.priority], ['Phụ trách', (l) => l.assigned_name], ['Phản hồi lần đầu', (l) => toVN(l.first_response_at)],
  ['utm_source', (l) => l.utm_source], ['utm_medium', (l) => l.utm_medium], ['utm_campaign', (l) => l.utm_campaign], ['utm_content', (l) => l.utm_content], ['utm_term', (l) => l.utm_term],
  ['gclid', (l) => l.gclid], ['fbclid', (l) => l.fbclid], ['Form', (l) => l.form_id], ['Landing URL', (l) => l.landing_url], ['Referrer', (l) => l.referrer],
  ['A/B variants', (l) => l.ab_variants], ['Lead ID', (l) => l.id], ['Trùng SĐT với lead', (l) => l.duplicate_of],
];

export async function exportLeads(req, res) {
  const user = await requireUser(req, MANAGERS);
  const q = requestUrl(req).searchParams;
  const { sql, params } = leadFilters(user, q);
  const db = await getDb();
  const rows = await db.all(
    `SELECT l.*, u.name AS assigned_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
     ${sql.replace(/\b(status|utm_source|utm_campaign|need|budget|priority|lead_magnet|form_id|product_interest|assigned_to|created_at|search_text)\b/g, 'l.$1')}
     ORDER BY l.created_at DESC LIMIT 50000`,
    params,
  );
  const header = EXPORT_COLS.map((c) => c[0]);
  const data = rows.map((l) => EXPORT_COLS.map(([, f]) => f(l) ?? ''));
  const stamp = todayVN();
  if (q.get('format') === 'csv') {
    return send(res, 200, buildCsv(header, data), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-hiep-phuoc-premia-${stamp}.csv"` });
  }
  send(res, 200, buildXlsx('Leads', header, data), {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="leads-hiep-phuoc-premia-${stamp}.xlsx"`,
  });
}

/** Google Ads Offline Conversion Import file (qualified leads that came from a Google click). */
export async function exportGoogleAds(req, res) {
  await requireUser(req, MANAGERS);
  const q = requestUrl(req).searchParams;
  const db = await getDb();
  const params = [];
  let where = "WHERE gclid IS NOT NULL AND gclid <> '' AND qualified_at IS NOT NULL";
  if (isDate(q.get('from'))) { params.push(vnStart(q.get('from'))); where += ` AND qualified_at >= $${params.length}`; }
  if (isDate(q.get('to'))) { params.push(vnEndExcl(q.get('to'))); where += ` AND qualified_at < $${params.length}`; }
  const rows = await db.all(`SELECT gclid, qualified_at FROM leads ${where} ORDER BY qualified_at`, params);
  const name = process.env.GOOGLE_ADS_OFFLINE_CONVERSION_NAME || 'Qualified Lead';
  const lines = ['Parameters:TimeZone=Asia/Ho_Chi_Minh', 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency'];
  for (const r of rows) lines.push(`${r.gclid},${name},${toVN(r.qualified_at)}:00,1,VND`);
  send(res, 200, lines.join('\r\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="google-ads-offline-conversions-${todayVN()}.csv"` });
}

// ---------------------------------------------------------------- stats
export async function getStats(req, res) {
  const user = await requireUser(req);
  const q = requestUrl(req).searchParams;
  const to = isDate(q.get('to')) ? q.get('to') : todayVN();
  const from = isDate(q.get('from')) ? q.get('from') : new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const db = await getDb();
  const params = [vnStart(from), vnEndExcl(to)];
  let scope = '';
  if (user.role === 'sales') { params.push(user.id); scope = ' AND assigned_to = $3'; }
  const leads = await db.all(
    `SELECT created_at, status, qualified_at, first_response_at, utm_source, utm_campaign, need, product_interest, budget, priority, lead_magnet, form_id, ab_variants
       FROM leads WHERE created_at >= $1 AND created_at < $2${scope}`,
    params,
  );
  const isQ = (l) => !!l.qualified_at || C.QUALIFIED_SET.includes(l.status);
  const isB = (l) => C.BOOKING_SET.includes(l.status);
  const group = (keyFn) => {
    const m = {};
    for (const l of leads) {
      const k = keyFn(l) || '(không có)';
      m[k] ||= { key: k, leads: 0, qualified: 0, booking: 0, converted: 0 };
      m[k].leads++;
      if (isQ(l)) m[k].qualified++;
      if (isB(l)) m[k].booking++;
      if (l.status === 'converted') m[k].converted++;
    }
    return Object.values(m).sort((a, b) => b.leads - a.leads);
  };

  // daily series (VN days)
  const days = [];
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= new Date(`${to}T00:00:00Z`).getTime(); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  const byDay = Object.fromEntries(days.map((d) => [d, { day: d, leads: 0, qualified: 0 }]));
  for (const l of leads) {
    const d = toVN(l.created_at).slice(0, 10);
    if (byDay[d]) { byDay[d].leads++; if (isQ(l)) byDay[d].qualified++; }
  }

  const responded = leads.filter((l) => l.first_response_at);
  const respMins = responded.map((l) => (new Date(l.first_response_at) - new Date(l.created_at)) / 60000).sort((a, b) => a - b);

  // campaign table with spend (pro-rated by overlapping days)
  const campaigns = group((l) => `${l.utm_source || '(direct)'}|${l.utm_campaign || ''}`).map((r) => {
    const [source, campaign] = r.key.split('|');
    return { ...r, source, campaign, spend: 0 };
  });
  let spendRows = [];
  if (user.role !== 'sales') {
    spendRows = await db.all('SELECT * FROM ad_spend WHERE date_to >= $1 AND date_from <= $2', [from, to]);
    for (const s of spendRows) {
      const total = (new Date(s.date_to) - new Date(s.date_from)) / 86400000 + 1;
      const ov = (Math.min(new Date(s.date_to), new Date(to)) - Math.max(new Date(s.date_from), new Date(from))) / 86400000 + 1;
      const part = ov > 0 && total > 0 ? Number(s.amount) * (ov / total) : 0;
      if (!part) continue;
      const newRow = (campaign) => {
        const r = { key: `${s.source}|${campaign}`, source: s.source, campaign, leads: 0, qualified: 0, booking: 0, converted: 0, spend: 0 };
        campaigns.push(r);
        return r;
      };
      if (s.campaign) {
        const row = campaigns.find((c) => c.source === s.source && c.campaign === s.campaign) || newRow(s.campaign);
        row.spend += part;
      } else {
        // source-level spend: split across that source's campaigns by lead count
        const rowsOfSource = campaigns.filter((c) => c.source === s.source);
        const n = rowsOfSource.reduce((a, c) => a + c.leads, 0);
        if (!rowsOfSource.length || !n) (rowsOfSource[0] || newRow('')).spend += part;
        else for (const c of rowsOfSource) c.spend += part * (c.leads / n);
      }
    }
  }
  const totalSpend = campaigns.reduce((n, c) => n + c.spend, 0);
  const qualified = leads.filter(isQ).length;

  // A/B report
  const abViews = user.role === 'sales' ? [] : await db.all('SELECT test, variant, SUM(views) AS views FROM ab_exposures WHERE day >= $1 AND day <= $2 GROUP BY test, variant', [from, to]);
  const ab = {};
  for (const r of abViews) { ab[r.test] ||= {}; ab[r.test][r.variant] = { views: Number(r.views), leads: 0, qualified: 0 }; }
  for (const l of leads) {
    const v = parseJson(l.ab_variants) || {};
    for (const [t, id] of Object.entries(v)) {
      if (!ab[t]) continue;
      ab[t][id] ||= { views: 0, leads: 0, qualified: 0 };
      ab[t][id].leads++;
      if (isQ(l)) ab[t][id].qualified++;
    }
  }

  send(res, 200, {
    range: { from, to },
    totals: {
      leads: leads.length,
      qualified,
      qualified_rate: leads.length ? qualified / leads.length : 0,
      booking: leads.filter(isB).length,
      booking_rate: leads.length ? leads.filter(isB).length / leads.length : 0,
      converted: leads.filter((l) => l.status === 'converted').length,
      lost: leads.filter((l) => l.status === 'lost').length,
      uncontacted: leads.filter((l) => l.status === 'new').length,
      responded: responded.length,
      median_response_min: respMins.length ? respMins[Math.floor(respMins.length / 2)] : null,
      avg_response_min: respMins.length ? respMins.reduce((a, b) => a + b, 0) / respMins.length : null,
      spend: user.role === 'sales' ? null : totalSpend,
      cpl: user.role === 'sales' || !leads.length || !totalSpend ? null : totalSpend / leads.length,
      cpql: user.role === 'sales' || !qualified || !totalSpend ? null : totalSpend / qualified,
    },
    series: Object.values(byDay),
    by_status: Object.keys(C.STATUSES).map((k) => ({ key: k, leads: leads.filter((l) => l.status === k).length })),
    by_source: group((l) => l.utm_source || '(direct)'),
    campaigns: campaigns.sort((a, b) => b.leads - a.leads),
    by_need: group((l) => C.NEEDS[l.need]),
    by_product: group((l) => C.PRODUCTS[l.product_interest]),
    by_budget: group((l) => C.BUDGETS[l.budget]),
    by_magnet: group((l) => C.LEAD_MAGNETS[l.lead_magnet]),
    by_form: group((l) => l.form_id),
    by_priority: group((l) => l.priority),
    ab,
  });
}

// ---------------------------------------------------------------- settings
function assertSettingShape(key, v) {
  const bad = (m) => { throw new HttpError(422, `Cấu hình "${key}" không hợp lệ: ${m}`); };
  if (key === 'content' || key === 'contact') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) bad('phải là object');
    for (const [k, val] of Object.entries(v)) if (typeof val !== 'string' || val.length > 1000) bad(`trường ${k}`);
  } else if (key === 'policies') {
    if (!Array.isArray(v)) bad('phải là danh sách');
    for (const p of v) {
      if (!p.id || !p.title || !p.summary) bad('mỗi chính sách cần id, title, summary');
      if (!p.valid_from || !isDate(p.valid_from)) bad(`"${p.title}" thiếu ngày hiệu lực (valid_from)`);
      if (p.valid_to && !isDate(p.valid_to)) bad(`"${p.title}" valid_to sai định dạng YYYY-MM-DD`);
      if (!p.valid_to && !p.valid_note) bad(`"${p.title}" cần valid_to hoặc valid_note (thời hạn hiệu lực)`);
      if (!p.conditions) bad(`"${p.title}" thiếu điều kiện áp dụng`);
    }
  } else if (key === 'payment_methods') {
    if (!Array.isArray(v) || !v.length) bad('phải là danh sách');
    for (const m of v) {
      const sum = (m.schedule || []).reduce((n, s) => n + Number(s.pct || 0), 0);
      if (Math.abs(sum - 100) > 0.01) bad(`"${m.name}" tổng tỷ lệ các đợt = ${sum}%, phải bằng 100%`);
    }
  } else if (key === 'ab_tests') {
    if (!v || typeof v !== 'object') bad('phải là object');
    for (const [k, t] of Object.entries(v)) {
      if (!Array.isArray(t.variants) || t.variants.length < 1) bad(`${k} cần ít nhất 1 biến thể`);
      if (t.variants.some((x) => !x.id || !(Number(x.weight) >= 0))) bad(`${k}: mỗi biến thể cần id và weight`);
    }
  } else if (key === 'loan_support') {
    if (!v || typeof v !== 'object') bad('phải là object');
  }
}

export async function getSettingsAdmin(req, res) {
  await requireUser(req, MANAGERS);
  send(res, 200, { settings: await getSettings({ fresh: true }), defaults: DEFAULTS });
}

export async function putSettings(req, res) {
  const user = await requireUser(req, MANAGERS);
  const body = await readJson(req, 256 * 1024);
  if (!SETTING_KEYS.includes(body.key)) throw new HttpError(422, 'Khóa cấu hình không hợp lệ.');
  if (['payment_methods', 'loan_support'].includes(body.key) && user.role !== 'admin') throw new HttpError(403, 'Chỉ quản trị viên được sửa phương thức thanh toán.');
  assertSettingShape(body.key, body.value);
  await saveSetting(body.key, body.value, user.email);
  send(res, 200, { ok: true });
}

export async function deleteSettings(req, res) {
  await requireUser(req, ['admin']);
  const key = requestUrl(req).searchParams.get('key');
  if (!SETTING_KEYS.includes(key)) throw new HttpError(422, 'Khóa cấu hình không hợp lệ.');
  await resetSetting(key);
  send(res, 200, { ok: true });
}

// ---------------------------------------------------------------- users
export async function listUsers(req, res) {
  await requireUser(req, MANAGERS);
  const db = await getDb();
  const users = await db.all('SELECT * FROM users ORDER BY created_at');
  send(res, 200, { users: users.map(publicUser) });
}

export async function postUser(req, res) {
  await requireUser(req, ['admin']);
  const b = await readJson(req, 4096);
  const email = clean(b.email, 254).toLowerCase();
  const name = clean(b.name, 80);
  if (!isEmail(email)) throw new HttpError(422, 'Email không hợp lệ.');
  if (!name) throw new HttpError(422, 'Vui lòng nhập tên.');
  if (!C.ROLES[b.role]) throw new HttpError(422, 'Vai trò không hợp lệ.');
  if (String(b.password || '').length < 10) throw new HttpError(422, 'Mật khẩu tối thiểu 10 ký tự.');
  const db = await getDb();
  if (await db.get('SELECT id FROM users WHERE email = $1', [email])) throw new HttpError(409, 'Email đã tồn tại.');
  await db.run(
    'INSERT INTO users (id, email, name, password_hash, role, active, receive_leads, created_at) VALUES ($1,$2,$3,$4,$5,1,$6,$7)',
    [crypto.randomUUID(), email, name, hashPassword(String(b.password)), b.role, b.receive_leads === false ? 0 : 1, nowIso()],
  );
  send(res, 201, { ok: true });
}

export async function patchUser(req, res) {
  const me = await requireUser(req, ['admin']);
  const b = await readJson(req, 4096);
  const db = await getDb();
  const u = await db.get('SELECT * FROM users WHERE id = $1', [clean(b.id, 64)]);
  if (!u) throw new HttpError(404, 'Không tìm thấy người dùng.');
  const sets = {};
  if (b.name !== undefined) sets.name = clean(b.name, 80) || u.name;
  if (b.role !== undefined) { if (!C.ROLES[b.role]) throw new HttpError(422, 'Vai trò không hợp lệ.'); sets.role = b.role; }
  if (b.active !== undefined) sets.active = b.active ? 1 : 0;
  if (b.receive_leads !== undefined) sets.receive_leads = b.receive_leads ? 1 : 0;
  if (b.password) { if (String(b.password).length < 10) throw new HttpError(422, 'Mật khẩu tối thiểu 10 ký tự.'); sets.password_hash = hashPassword(String(b.password)); }
  if (u.id === me.id && (sets.active === 0 || (sets.role && sets.role !== 'admin'))) throw new HttpError(422, 'Không thể tự khóa hoặc hạ quyền tài khoản của chính bạn.');
  const keys = Object.keys(sets);
  if (keys.length) await db.run(`UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1}`, [...keys.map((k) => sets[k]), u.id]);
  send(res, 200, { ok: true });
}

// ---------------------------------------------------------------- ad spend
export async function listSpend(req, res) {
  await requireUser(req, MANAGERS);
  const db = await getDb();
  send(res, 200, { rows: await db.all('SELECT * FROM ad_spend ORDER BY date_from DESC LIMIT 500') });
}

export async function postSpend(req, res) {
  const user = await requireUser(req, MANAGERS);
  const b = await readJson(req, 4096);
  if (!isDate(b.date_from) || !isDate(b.date_to) || b.date_to < b.date_from) throw new HttpError(422, 'Khoảng ngày không hợp lệ.');
  const source = clean(b.source, 120);
  const amount = Math.round(Number(b.amount));
  if (!source) throw new HttpError(422, 'Vui lòng nhập utm_source (VD: facebook, google, tiktok).');
  if (!(amount > 0)) throw new HttpError(422, 'Chi phí phải lớn hơn 0.');
  const db = await getDb();
  await db.run(
    'INSERT INTO ad_spend (id, date_from, date_to, source, campaign, amount, note, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [crypto.randomUUID(), b.date_from, b.date_to, source, clean(b.campaign, 200) || null, amount, clean(b.note, 300) || null, nowIso(), user.email],
  );
  send(res, 201, { ok: true });
}

export async function deleteSpend(req, res) {
  await requireUser(req, MANAGERS);
  const db = await getDb();
  await db.run('DELETE FROM ad_spend WHERE id = $1', [clean(requestUrl(req).searchParams.get('id'), 64)]);
  send(res, 200, { ok: true });
}
