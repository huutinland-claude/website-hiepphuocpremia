// Lead forms: rendering, validation, anti-duplicate submission, real API submit, error/success states.
import { getAttribution } from './attribution.js';
import { getAssignments } from './ab.js';
import { track } from './tracking.js';
import { store, cookie, uuid } from './storage.js';

// Same options as lib/constants.js – used until /api/config responds (keeps the hero form instant).
const FALLBACK = {
  options: {
    needs: { 'dau-tu': 'Đầu tư', 'mua-o': 'Mua ở', 'kinh-doanh': 'Kinh doanh', 'cho-thue': 'Cho thuê' },
    products: { 'lien-ke': 'Liền kề phố 3 tầng', 'nha-pho-tm': 'Nhà phố thương mại 4 tầng', 'biet-thu': 'Biệt thự', 'chua-xac-dinh': 'Chưa xác định / cần tư vấn' },
    budgets: { 'duoi-2': 'Dưới 2 tỷ', '2-3': '2 – 3 tỷ', '3-5': '3 – 5 tỷ', '5-8': '5 – 8 tỷ', 'tren-8': 'Trên 8 tỷ', 'chua-xac-dinh': 'Chưa xác định' },
    contact_methods: { 'goi-dien': 'Gọi điện', zalo: 'Zalo', email: 'Email', 'gap-truc-tiep': 'Gặp trực tiếp tại Sales Gallery' },
    lead_magnets: { 'bang-gia': 'Nhận bảng giá', 'chinh-sach': 'Nhận chính sách bán hàng', 'tham-quan': 'Đăng ký tham quan dự án', 'tu-van': 'Gặp chuyên viên tư vấn', 'tinh-toan': 'Nhận bảng tính tài chính' },
  },
  consent_text: 'Tôi đồng ý để DKRA Realty và Chủ đầu tư dự án Hiệp Phước Premia thu thập, xử lý dữ liệu cá nhân tôi cung cấp nhằm liên hệ tư vấn, gửi thông tin dự án theo Nghị định 13/2023/NĐ-CP.',
};

const SHORT_MAGNETS = { 'bang-gia': 'Bảng giá', 'chinh-sach': 'Chính sách', 'tham-quan': 'Tham quan', 'tu-van': 'Tư vấn 1:1', 'tinh-toan': 'Bảng tính tài chính' };

let cfg = FALLBACK;
let turnstileKey = '';
let turnstileLoading = null;
const forms = new Map();

export function normalizePhone(v) {
  let s = String(v || '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  else if (/^84\d{9}$/.test(s)) s = '0' + s.slice(2);
  if (/^0(3|5|7|8|9)\d{8}$/.test(s) || /^02\d{9}$/.test(s)) return s;
  return '';
}

const isName = (v) => { const s = v.trim(); return s.length >= 2 && /^[\p{L}\s'.]+$/u.test(s) && /\p{L}.*\p{L}/u.test(s); };
const isEmail = (v) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(v);

function chips(container, name, dict, { required = false } = {}) {
  container.textContent = '';
  for (const [value, label] of Object.entries(dict)) {
    const l = document.createElement('label');
    l.className = 'chip';
    const i = document.createElement('input');
    i.type = 'radio'; i.name = name; i.value = value;
    if (required) i.required = true;
    const s = document.createElement('span');
    s.textContent = label;
    l.append(i, s);
    container.append(l);
  }
}

function fillSelect(select, dict) {
  const first = select.options[0];
  select.textContent = '';
  select.append(first);
  for (const [v, label] of Object.entries(dict)) select.append(new Option(label, v));
}

function setError(form, name, msg) {
  const field = form.querySelector(`[data-f="${name}"]`);
  if (!field) return;
  field.classList.toggle('has-error', !!msg);
  const err = field.querySelector('.field-error');
  if (err) err.textContent = msg || '';
  const input = field.querySelector('input,select');
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

function validate(form, state, onlyName) {
  const errs = {};
  const f = form.elements;
  const check = (name) => !onlyName || onlyName === name;
  if (check('full_name') && !isName(f.full_name.value)) errs.full_name = 'Vui lòng nhập họ và tên (ít nhất 2 chữ cái).';
  if (check('phone') && !normalizePhone(f.phone.value)) errs.phone = 'Số điện thoại chưa đúng định dạng (VD: 0912 345 678).';
  if (check('email') && state.fields.email && f.email.value.trim() && !isEmail(f.email.value.trim())) errs.email = 'Email chưa đúng định dạng.';
  if (check('need') && state.needRequired && !form.querySelector('input[name="need"]:checked')) errs.need = 'Vui lòng chọn nhu cầu của bạn.';
  if (check('consent') && !f.consent.checked) errs.consent = 'Vui lòng đồng ý để chúng tôi liên hệ tư vấn.';
  const names = onlyName ? [onlyName] : ['full_name', 'phone', 'email', 'need', 'consent'];
  for (const n of names) setError(form, n, errs[n]);
  return errs;
}

function variantFields(variant) {
  if (variant === 'quick') return { lead_magnet: false, email: false, need: true, product_interest: false, budget: false, contact_method: false };
  if (variant === 'short') return { lead_magnet: true, email: false, need: true, product_interest: false, budget: false, contact_method: false };
  return { lead_magnet: true, email: true, need: true, product_interest: true, budget: true, contact_method: true };
}

function applyVariant(state) {
  const { form, variant } = state;
  state.fields = variantFields(variant);
  if (!state.showMagnet) state.fields.lead_magnet = false;
  for (const [name, on] of Object.entries(state.fields)) {
    const el = form.querySelector(`[data-f="${name}"]`);
    if (el) el.hidden = !on;
  }
  // product + budget share a row
  const row = form.querySelector('[data-f="product_interest"]')?.parentElement;
  if (row) row.hidden = !state.fields.product_interest && !state.fields.budget;
  state.needRequired = variant !== 'quick';
  form.querySelector('[data-need-req]').hidden = !state.needRequired;
}

function populate(state) {
  const { form } = state;
  const o = cfg.options || FALLBACK.options;
  const magnetLabels = Object.fromEntries(Object.keys(o.lead_magnets).map((k) => [k, SHORT_MAGNETS[k] || o.lead_magnets[k]]));
  const prev = {
    need: form.querySelector('input[name="need"]:checked')?.value,
    contact_method: form.querySelector('input[name="contact_method"]:checked')?.value,
    lead_magnet: form.querySelector('input[name="lead_magnet"]:checked')?.value || state.magnet,
    product_interest: form.elements.product_interest.value,
    budget: form.elements.budget.value,
  };
  chips(form.querySelector('[data-chips="need"]'), 'need', o.needs);
  chips(form.querySelector('[data-chips="contact_method"]'), 'contact_method', o.contact_methods);
  chips(form.querySelector('[data-chips="lead_magnet"]'), 'lead_magnet', magnetLabels);
  fillSelect(form.elements.product_interest, o.products);
  fillSelect(form.elements.budget, o.budgets);
  for (const k of ['need', 'contact_method', 'lead_magnet']) {
    const r = form.querySelector(`input[name="${k}"][value="${CSS.escape(prev[k] || '')}"]`);
    if (r) r.checked = true;
  }
  form.elements.product_interest.value = prev.product_interest || '';
  form.elements.budget.value = prev.budget || '';
  form.querySelector('[data-consent-text]').textContent = cfg.consent_text || FALLBACK.consent_text;
  const link = document.createElement('a');
  link.href = '/chinh-sach-bao-mat'; link.target = '_blank'; link.rel = 'noopener'; link.textContent = ' Xem chính sách bảo mật.';
  form.querySelector('[data-consent-text]').append(link);
}

async function ensureTurnstile(state) {
  if (!turnstileKey || state.turnstileId !== undefined) return;
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve) => {
      window.__hppTurnstileReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__hppTurnstileReady';
      s.async = true;
      document.head.append(s);
    });
  }
  await turnstileLoading;
  state.turnstileId = window.turnstile.render(state.form.querySelector('[data-turnstile]'), { sitekey: turnstileKey, size: 'flexible', appearance: 'interaction-only' });
}

function setBusy(state, busy) {
  const btn = state.form.querySelector('[data-submit]');
  btn.disabled = busy;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (busy) {
    state.btnText = btn.textContent;
    btn.textContent = '';
    const sp = document.createElement('span'); sp.className = 'spinner';
    btn.append(sp, document.createTextNode(' Đang gửi thông tin…'));
  } else if (state.btnText) btn.textContent = state.btnText;
}

function showFormError(state, msg) {
  const box = state.form.querySelector('[data-form-error]');
  box.textContent = msg || '';
  box.hidden = !msg;
  if (msg && cfg.contact?.hotline) {
    const a = document.createElement('a');
    a.href = `tel:${cfg.contact.hotline.replace(/[^\d+]/g, '')}`;
    a.dataset.contact = 'phone'; a.dataset.cta = `form_error_${state.formId}`;
    a.textContent = ` Hoặc gọi ${cfg.contact.hotline}`;
    box.append(a);
  }
}

async function submit(state, e) {
  e.preventDefault();
  if (state.sending) return; // anti double-submit
  const { form } = state;
  showFormError(state, '');
  const errs = validate(form, state);
  track('form_submit', { form_id: state.formId, valid: !Object.keys(errs).length });
  if (Object.keys(errs).length) {
    const first = form.querySelector('.has-error input, .has-error select');
    if (first) first.focus();
    track('form_error', { form_id: state.formId, fields: Object.keys(errs).join(',') });
    return;
  }

  let turnstileToken = '';
  if (turnstileKey) {
    await ensureTurnstile(state);
    turnstileToken = window.turnstile?.getResponse(state.turnstileId) || '';
    if (!turnstileToken) { showFormError(state, 'Vui lòng hoàn tất bước xác minh chống spam rồi gửi lại.'); return; }
  }

  const f = form.elements;
  const val = (n) => form.querySelector(`input[name="${n}"]:checked`)?.value || '';
  const payload = {
    submission_id: state.submissionId,
    form_id: state.formId,
    full_name: f.full_name.value.trim(),
    phone: normalizePhone(f.phone.value),
    email: state.fields.email ? f.email.value.trim() : '',
    need: val('need'),
    product_interest: state.fields.product_interest ? f.product_interest.value : (state.productPref || ''),
    budget: state.fields.budget ? f.budget.value : '',
    contact_method: state.fields.contact_method ? val('contact_method') : '',
    lead_magnet: (state.fields.lead_magnet && val('lead_magnet')) || state.magnet || 'bang-gia',
    consent: f.consent.checked === true,
    company_website: f.company_website.value,
    elapsed_ms: Date.now() - state.renderedAt,
    turnstile_token: turnstileToken,
    attribution: getAttribution(),
    ab: getAssignments(),
    fbp: cookie('_fbp'),
    fbc: cookie('_fbc'),
  };

  state.sending = true;
  setBusy(state, true);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.id) {
      // Saved in the database – hand over to the thank-you page, which fires conversions exactly once.
      store.set('hpp_conv', {
        lead_id: data.id, event_id: data.event_id || null, repeat: !!data.repeat, schedule: !!data.schedule,
        magnet: payload.lead_magnet, form_id: state.formId, product: payload.product_interest, name: payload.full_name.split(' ').pop(), ts: Date.now(),
      }, true);
      track('form_submit_success', { form_id: state.formId, lead_magnet: payload.lead_magnet, repeat: !!data.repeat });
      state.submissionId = uuid();
      location.assign('/cam-on');
      return;
    }
    if (res.status === 422 && data.errors) {
      for (const [k, msg] of Object.entries(data.errors)) setError(form, k, msg);
    }
    showFormError(state, data.error || 'Gửi thông tin chưa thành công. Vui lòng thử lại.');
    track('form_submit_failed', { form_id: state.formId, status: res.status });
  } catch (err) {
    showFormError(state, err.name === 'AbortError'
      ? 'Kết nối quá chậm, thông tin chưa được gửi. Vui lòng thử lại.'
      : 'Không thể kết nối máy chủ, thông tin chưa được gửi. Vui lòng kiểm tra mạng và thử lại.');
    track('form_submit_failed', { form_id: state.formId, status: 0 });
  } finally {
    clearTimeout(timer);
    state.sending = false;
    if (form.isConnected) setBusy(state, false);
    if (state.turnstileId !== undefined && window.turnstile) window.turnstile.reset(state.turnstileId);
  }
}

function mount(slot) {
  const tpl = document.getElementById('lead-form-tpl');
  const form = tpl.content.firstElementChild.cloneNode(true);
  const formId = slot.dataset.formId;
  // unique ids for label association
  form.querySelectorAll('[data-f]').forEach((field) => {
    const input = field.querySelector('input:not([type=radio]),select');
    const label = field.querySelector(':scope > label');
    if (input && label) { input.id = `${formId}-${field.dataset.f}`; label.htmlFor = input.id; }
  });
  const state = {
    form, formId, slot,
    variant: slot.dataset.variant || 'full',
    magnet: slot.dataset.magnet || 'bang-gia',
    showMagnet: slot.hasAttribute('data-show-magnet'),
    submissionId: uuid(),
    renderedAt: Date.now(),
    started: false,
    sending: false,
  };
  slot.append(form);
  populate(state);
  applyVariant(state);
  const m = form.querySelector(`input[name="lead_magnet"][value="${state.magnet}"]`);
  if (m) m.checked = true;

  form.addEventListener('submit', (e) => submit(state, e));
  form.addEventListener('focusin', () => {
    if (state.started) return;
    state.started = true;
    track('form_start', { form_id: formId });
    ensureTurnstile(state);
  });
  form.addEventListener('blur', (e) => {
    const n = e.target.name;
    if (['full_name', 'phone', 'email'].includes(n) && e.target.value) validate(form, state, n);
  }, true);
  form.addEventListener('change', (e) => {
    if (['need', 'consent'].includes(e.target.name)) validate(form, state, e.target.name);
    if (e.target.name === 'lead_magnet') state.magnet = e.target.value;
  });
  form.elements.phone.addEventListener('input', (e) => {
    if (form.querySelector('[data-f="phone"]').classList.contains('has-error') && normalizePhone(e.target.value)) setError(form, 'phone', '');
  });
  forms.set(formId, state);
  return state;
}

export function mountForms() {
  document.querySelectorAll('[data-form-slot]').forEach((slot) => { if (!slot.firstElementChild) mount(slot); });
}

export function configureForms(config, { mainVariant, magnetVariant } = {}) {
  cfg = { ...FALLBACK, ...config, options: config.options || FALLBACK.options };
  turnstileKey = config.turnstile_site_key || '';
  for (const state of forms.values()) {
    populate(state);
    if (state.formId === 'main' && mainVariant) state.variant = mainVariant;
    if (state.formId === 'main' && magnetVariant) {
      state.magnet = magnetVariant;
      const r = state.form.querySelector(`input[name="lead_magnet"][value="${magnetVariant}"]`);
      if (r) r.checked = true;
    }
    applyVariant(state);
  }
}

/** Prepare the popup form for a given intent (lead magnet) and optional product preference. */
export function preparePopup(magnet, productPref) {
  const state = forms.get('popup');
  if (!state) return;
  state.magnet = magnet || 'bang-gia';
  state.productPref = productPref || '';
  const r = state.form.querySelector(`input[name="lead_magnet"][value="${state.magnet}"]`);
  if (r) r.checked = true;
  if (productPref) state.form.elements.product_interest.value = productPref;
  showFormError(state, '');
}
