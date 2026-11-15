// UTM & click-id attribution, persisted across pages and visits (first touch + last touch).
import { store } from './storage.js';

const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid'];
const FT_KEY = 'hpp_ft';
const LT_KEY = 'hpp_lt';
const SESSION_KEY = 'hpp_session';
const FT_DAYS = 90;
const LT_DAYS = 30;

function fresh(rec, days) {
  return rec && rec.ts && Date.now() - rec.ts < days * 86400000 ? rec : null;
}

export function captureAttribution() {
  const url = new URL(location.href);
  const found = {};
  for (const k of PARAMS) {
    const v = url.searchParams.get(k);
    if (v) found[k] = v.slice(0, 300);
  }
  const ref = document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '';
  const now = Date.now();

  const hasParams = Object.keys(found).length > 0;

  // per-session landing page & referrer (first page of this visit, or the latest ad click within it)
  if (!store.get(SESSION_KEY, true) || hasParams) {
    store.set(SESSION_KEY, { landing_url: location.href.slice(0, 1000), referrer: ref.slice(0, 1000), ts: now }, true);
  }

  if (hasParams) store.set(LT_KEY, { ...found, landing_url: location.href.slice(0, 1000), referrer: ref, ts: now });
  if (!fresh(store.get(FT_KEY), FT_DAYS)) {
    store.set(FT_KEY, { ...found, landing_url: location.href.slice(0, 1000), referrer: ref, ts: now });
  }
}

/** Payload sent with the lead. Last non-direct touch wins; the session landing URL is kept for context. */
export function getAttribution() {
  const lt = fresh(store.get(LT_KEY), LT_DAYS) || {};
  const session = store.get(SESSION_KEY, true) || {};
  const ft = store.get(FT_KEY) || {};
  const out = {};
  for (const k of PARAMS) if (lt[k]) out[k] = lt[k];
  out.landing_url = session.landing_url || lt.landing_url || location.href;
  out.referrer = session.referrer || lt.referrer || '';
  out.first_touch = {
    ...Object.fromEntries(PARAMS.filter((k) => ft[k]).map((k) => [k, ft[k]])),
    landing_url: ft.landing_url || '',
    referrer: ft.referrer || '',
    date: ft.ts ? new Date(ft.ts).toISOString() : '',
  };
  return out;
}
