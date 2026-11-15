// Client-side A/B testing driven by Dashboard → Cấu hình → A/B tests.
// Sticky per visitor (localStorage). Force a variant for QA with ?ab_<test>=<variantId>.
import { store, uuid } from './storage.js';
import { track } from './tracking.js';

const KEY = 'hpp_ab';
let assigned = {};

function weighted(variants) {
  const total = variants.reduce((n, v) => n + Math.max(0, Number(v.weight) || 0), 0);
  if (!total) return variants[0];
  let r = (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * total;
  for (const v of variants) { r -= Math.max(0, Number(v.weight) || 0); if (r < 0) return v; }
  return variants[variants.length - 1];
}

/** Returns { testKey: variantObject } for every test (inactive tests resolve to their control, variant[0]). */
export function assignVariants(tests = {}) {
  const saved = store.get(KEY) || {};
  const url = new URL(location.href);
  const result = {};
  assigned = {};
  for (const [key, t] of Object.entries(tests)) {
    const variants = Array.isArray(t.variants) ? t.variants : [];
    if (!variants.length) continue;
    const forced = url.searchParams.get(`ab_${key}`);
    let v = variants.find((x) => x.id === forced);
    if (!v && t.active) v = variants.find((x) => x.id === saved[key]) || weighted(variants);
    if (!v) v = variants[0];
    result[key] = v;
    if (t.active || forced) assigned[key] = v.id;
  }
  store.set(KEY, { ...saved, ...assigned });
  return result;
}

/** Variants actually under test – attached to every lead. */
export function getAssignments() {
  return { ...assigned };
}

/** Count one exposure per visitor per day (for conversion-rate per variant in the Dashboard). */
export function recordExposure() {
  if (!Object.keys(assigned).length) return;
  const today = new Date().toISOString().slice(0, 10);
  const sentKey = 'hpp_ab_sent';
  const sent = store.get(sentKey) || {};
  if (sent.day === today) return;
  store.set(sentKey, { day: today, id: uuid() });
  const body = JSON.stringify({ exposures: assigned });
  try {
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ab', new Blob([body], { type: 'application/json' })))) {
      fetch('/api/ab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* ignore */ }
  track('ab_assignment', Object.fromEntries(Object.entries(assigned).map(([k, v]) => [`ab_${k}`, v])));
}
