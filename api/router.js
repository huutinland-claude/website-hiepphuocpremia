// Single serverless entry point for every /api/* route (Vercel rewrites /api/:path* -> /api/router?__path=:path*).
// The local dev server (scripts/serve.mjs) calls the same handler, so behaviour is identical locally and in production.
import { send, HttpError, requestUrl } from '../lib/http.js';
import * as pub from '../lib/routes/public.js';
import * as admin from '../lib/routes/admin.js';

const ROUTES = {
  'GET config': pub.getConfig,
  'POST leads': pub.postLead,
  'POST ab': pub.postAb,
  'GET qr': pub.getQr,
  'GET health': pub.getHealth,

  'POST admin/login': admin.postLogin,
  'POST admin/logout': admin.postLogout,
  'GET admin/me': admin.getMe,
  'GET admin/leads': admin.listLeads,
  'GET admin/lead': admin.getLead,
  'PATCH admin/lead': admin.patchLead,
  'POST admin/lead-note': admin.postLeadNote,
  'GET admin/stats': admin.getStats,
  'GET admin/export': admin.exportLeads,
  'GET admin/export-google-ads': admin.exportGoogleAds,
  'GET admin/settings': admin.getSettingsAdmin,
  'PUT admin/settings': admin.putSettings,
  'DELETE admin/settings': admin.deleteSettings,
  'GET admin/users': admin.listUsers,
  'POST admin/users': admin.postUser,
  'PATCH admin/users': admin.patchUser,
  'GET admin/spend': admin.listSpend,
  'POST admin/spend': admin.postSpend,
  'DELETE admin/spend': admin.deleteSpend,
};

export function resolvePath(req) {
  const url = requestUrl(req);
  const forced = url.searchParams.get('__path');
  const p = forced ?? url.pathname.replace(/^\/api\/?/, '');
  return p.replace(/^\/+|\/+$/g, '');
}

export default async function handler(req, res) {
  const path = resolvePath(req);
  const fn = ROUTES[`${req.method} ${path}`];
  try {
    if (!fn) {
      const allowed = Object.keys(ROUTES).filter((k) => k.endsWith(` ${path}`)).map((k) => k.split(' ')[0]);
      if (req.method === 'OPTIONS' && allowed.length) return send(res, 204, '', { Allow: allowed.join(', ') });
      throw new HttpError(allowed.length ? 405 : 404, allowed.length ? 'Method not allowed' : 'Not found');
    }
    await fn(req, res);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(`[api] ${req.method} ${path}:`, e);
    send(res, status, { ok: false, error: status >= 500 && !(e instanceof HttpError) ? 'Lỗi hệ thống, vui lòng thử lại.' : e.message, ...(e.extra || {}) });
  }
}
