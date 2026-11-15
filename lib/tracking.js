// Server-side conversion tracking: Meta Conversions API + GA4 Measurement Protocol.
// PII is normalised and SHA-256 hashed before leaving the server, as required by Meta.
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z]/g, '');

export function metaUserData(lead, { ip, ua } = {}) {
  const ud = {};
  if (lead.phone) ud.ph = [sha('84' + lead.phone.replace(/^0/, ''))];
  if (lead.email) ud.em = [sha(lead.email.trim().toLowerCase())];
  const parts = String(lead.full_name || '').trim().split(/\s+/);
  if (parts.length) {
    // Vietnamese order: family name first, given name last
    const fn = fold(parts[parts.length - 1]);
    const ln = parts.length > 1 ? fold(parts[0]) : '';
    if (fn) ud.fn = [sha(fn)];
    if (ln) ud.ln = [sha(ln)];
  }
  ud.country = [sha('vn')];
  ud.external_id = [sha(lead.id)];
  if (ip) ud.client_ip_address = ip;
  if (ua) ud.client_user_agent = ua;
  if (lead.fbp) ud.fbp = lead.fbp;
  if (lead.fbc) ud.fbc = lead.fbc;
  return ud;
}

/** Send one event to Meta CAPI. Returns a short status string, never throws. */
export async function sendMetaEvent({ eventName, eventId, lead, sourceUrl, ip, ua, customData = {}, actionSource = 'website' }) {
  const pixel = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixel || !token) return 'skipped:not-configured';
  const version = process.env.META_API_VERSION || 'v21.0';
  const body = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: actionSource,
      ...(sourceUrl && actionSource === 'website' ? { event_source_url: sourceUrl } : {}),
      user_data: metaUserData(lead, { ip, ua }),
      custom_data: { content_name: 'Hiep Phuoc Premia', ...customData },
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  try {
    const r = await fetch(`https://graph.facebook.com/${version}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(4000),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? `ok:${j.events_received ?? '?'}` : `error:${r.status}:${(j.error && j.error.message) || ''}`.slice(0, 200);
  } catch (e) {
    return `error:${e.name}`;
  }
}

/** GA4 Measurement Protocol (used for offline "qualify_lead" from the dashboard). */
export async function sendGa4Event({ clientId, name, params = {} }) {
  const id = process.env.GA4_MEASUREMENT_ID, secret = process.env.GA4_API_SECRET;
  if (!id || !secret) return 'skipped:not-configured';
  if (!clientId) return 'skipped:no-client-id';
  try {
    const r = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`, {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId, events: [{ name, params }] }),
      signal: AbortSignal.timeout(4000),
    });
    return r.status < 300 ? 'ok' : `error:${r.status}`;
  } catch (e) {
    return `error:${e.name}`;
  }
}

/** _ga cookie "GA1.1.1234567890.1700000000" -> "1234567890.1700000000" */
export function gaClientIdFromCookie(v) {
  const m = String(v || '').match(/^GA\d\.\d\.(\d+\.\d+)$/);
  return m ? m[1] : '';
}
