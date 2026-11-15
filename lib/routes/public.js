import QRCode from 'qrcode';
import { getDb, dialect } from '../db.js';
import { send, readJson, HttpError, requestUrl } from '../http.js';
import { publicConfig, getSettings, todayVN } from '../content.js';
import { createLead } from '../leads.js';
import { clean } from '../validate.js';

export async function getConfig(req, res) {
  send(res, 200, await publicConfig(), { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300' });
}

export async function postLead(req, res) {
  const body = await readJson(req);
  const result = await createLead(req, body);
  send(res, result.repeat || result.duplicate ? 200 : 201, result);
}

/** Record A/B exposures (one call per visitor per day, deduped client-side). */
export async function postAb(req, res) {
  const body = await readJson(req, 4096);
  const settings = await getSettings();
  const db = await getDb();
  const day = todayVN();
  let n = 0;
  for (const [test, variant] of Object.entries(body.exposures || {}).slice(0, 10)) {
    const t = settings.ab_tests[clean(test, 40)];
    if (!t || !t.active || !t.variants.some((v) => v.id === variant)) continue;
    await db.run(
      'INSERT INTO ab_exposures (day, test, variant, views) VALUES ($1,$2,$3,1) ON CONFLICT (day, test, variant) DO UPDATE SET views = ab_exposures.views + 1',
      [day, test, variant],
    );
    n++;
  }
  send(res, 200, { ok: true, recorded: n });
}

/** QR code (SVG) pointing to this landing page with UTM tags – for leaflets, standees, events. */
export async function getQr(req, res) {
  const url = requestUrl(req);
  const base = (process.env.SITE_URL || url.origin).replace(/\/$/, '');
  const target = new URL(base + '/');
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const v = clean(url.searchParams.get(k), 80);
    if (v) target.searchParams.set(k, v);
  }
  if (!target.searchParams.get('utm_source')) target.searchParams.set('utm_source', 'qr');
  if (!target.searchParams.get('utm_medium')) target.searchParams.set('utm_medium', 'offline');
  const svg = await QRCode.toString(target.toString(), { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0b3236', light: '#ffffff' } });
  send(res, 200, svg, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-QR-Target': target.toString() });
}

export async function getHealth(req, res) {
  try {
    const db = await getDb();
    await db.get('SELECT 1 AS ok');
    send(res, 200, { ok: true, db: dialect() });
  } catch (e) {
    throw new HttpError(503, 'Database unavailable: ' + e.message);
  }
}
