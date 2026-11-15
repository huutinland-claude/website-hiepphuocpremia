// Landing page entry point.
import { captureAttribution } from './attribution.js';
import { initTracking } from './tracking.js';
import { assignVariants, recordExposure } from './ab.js';
import { mountForms, configureForms } from './forms.js';
import { initCalculator } from './calculator.js';
import * as ui from './ui.js';

captureAttribution();
mountForms();
ui.initHeader();
ui.initReveal();
ui.initTabs();
ui.initFilters();
ui.initLightbox();
ui.initDialogs();
ui.initClickTracking();
ui.initShare();

async function loadConfig() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch('/api/config', { signal: ctrl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally { clearTimeout(t); }
}

function applyVariants(v) {
  if (v.hero_copy?.headline) document.querySelectorAll('[data-content="headline"]').forEach((el) => { el.textContent = v.hero_copy.headline; });
  if (v.hero_copy?.subheadline) document.querySelectorAll('[data-content="subheadline"]').forEach((el) => { el.textContent = v.hero_copy.subheadline; });
  if (v.cta_primary?.cta) ui.setPrimaryCta(v.cta_primary.cta);
  if (v.hero_image?.image && v.hero_image.image !== 'hero-a') {
    const pic = document.querySelector('[data-hero-picture]');
    const name = v.hero_image.image.replace(/[^a-z0-9-]/gi, '');
    pic.querySelectorAll('source').forEach((s) => { s.srcset = s.srcset.replaceAll('hero-a', name); });
    const img = pic.querySelector('img');
    img.src = img.src.replace('hero-a', name);
    img.style.objectPosition = '50% 50%';
  }
  if (v.form_position?.id === 'below') {
    document.querySelector('[data-hero-form]')?.setAttribute('hidden', '');
    document.querySelector('#hero')?.classList.add('no-form');
  }
  if (v.lead_magnet?.title) {
    const t = document.querySelector('[data-main-form-title]');
    if (t) t.textContent = v.lead_magnet.title;
  }
}

try {
  const cfg = await loadConfig();
  initTracking(cfg.tracking);
  ui.applyContent(cfg.content);
  ui.applyContact(cfg.contact);
  const variants = assignVariants(cfg.ab_tests);
  applyVariants(variants);
  configureForms(cfg, {
    mainVariant: variants.form_length?.id === 'short' ? 'short' : 'full',
    magnetVariant: variants.lead_magnet?.id,
  });
  ui.renderPolicies(cfg.policies, cfg.today);
  initCalculator(cfg);
  recordExposure();
} catch (err) {
  // API unreachable: page stays usable (forms will show a clear error on submit; no fake success).
  console.error('[config]', err);
  ui.renderPolicies([], '');
  initCalculator({
    loan_support: { max_rate: 10, max_ratio: 70, max_months: 12 },
    payment_methods: [],
  });
}
