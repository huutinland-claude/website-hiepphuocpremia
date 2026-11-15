// Local / VPS server: serves the built static site from dist/ and routes /api/* to the same handler Vercel uses.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/router.js';
import { COMMON, SITE_CSP, ADMIN_CSP } from '../lib/headers.js';
import { ensureBootstrapAdmin } from '../lib/auth.js';

// Lives in scripts/ (not the project root) so Vercel does not pick it up as a server entrypoint.
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT || 3000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};
const CLEAN = { '/': '/index.html', '/cam-on': '/cam-on.html', '/admin': '/admin/index.html', '/admin/': '/admin/index.html', '/chinh-sach-bao-mat': '/chinh-sach-bao-mat.html' };

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (CLEAN[p]) p = CLEAN[p];
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.statusCode = 400; return res.end('Bad request'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return fs.createReadStream(path.join(ROOT, '404.html')).on('error', () => res.end('Not found')).pipe(res);
    }
    const ext = path.extname(file);
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    for (const [k, v] of Object.entries(COMMON)) res.setHeader(k, v);
    res.setHeader('Content-Security-Policy', p.startsWith('/admin') ? ADMIN_CSP : SITE_CSP);
    if (p.startsWith('/admin')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Frame-Options', p.startsWith('/admin') ? 'DENY' : 'SAMEORIGIN');
    res.setHeader('Cache-Control', p.startsWith('/assets/img/') ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=3600');
    fs.createReadStream(file).pipe(res);
  });
}

if (!fs.existsSync(ROOT)) {
  console.error('dist/ not found – run "npm run build" first.');
  process.exit(1);
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    for (const [k, v] of Object.entries(COMMON)) res.setHeader(k, v);
    res.setHeader('X-Robots-Tag', 'noindex');
    return handler(req, res);
  }
  serveStatic(req, res);
}).listen(PORT, async () => {
  console.log(`Hiệp Phước Premia landing running at http://localhost:${PORT}  (admin: /admin)`);
  try { await ensureBootstrapAdmin(); } catch (e) { console.error('[db] init failed:', e.message); }
});
