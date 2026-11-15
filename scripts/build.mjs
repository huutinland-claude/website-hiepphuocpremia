// Build: copy public/ -> dist/ and inject SITE_URL into HTML / XML / TXT (canonical, Open Graph, sitemap, JSON-LD).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// load .env for local builds (Vercel injects env vars itself)
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const SRC = path.join(root, 'public');
const OUT = path.join(root, 'dist');
const site = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const version = Date.now().toString(36);
if (!process.env.SITE_URL) console.warn('[build] SITE_URL not set – using http://localhost:3000 for canonical/OG URLs.');

fs.rmSync(OUT, { recursive: true, force: true });
let n = 0;
(function copy(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, e.name);
    const to = path.join(OUT, path.relative(SRC, from));
    if (e.isDirectory()) { fs.mkdirSync(to, { recursive: true }); copy(from); continue; }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (/\.(html|xml|txt|webmanifest)$/.test(e.name)) {
      const txt = fs.readFileSync(from, 'utf8')
        .replaceAll('__SITE_URL__', site)
        .replaceAll('__BUILD_DATE__', new Date().toISOString().slice(0, 10))
        .replace(/(\.(?:css|js))\?v=__V__/g, `$1?v=${version}`);
      fs.writeFileSync(to, txt);
    } else fs.copyFileSync(from, to);
    n++;
  }
})(SRC);
console.log(`[build] ${n} files -> dist/ (SITE_URL=${site})`);
