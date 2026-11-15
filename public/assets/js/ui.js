// UI behaviours: header, nav, reveal, tabs, filters, lightbox, dialogs, contact links, sharing, policies.
import { track, fb } from './tracking.js';
import { preparePopup } from './forms.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const MAGNET_COPY = {
  'bang-gia': ['Nhận bảng giá & tư vấn', 'Bảng giá, giỏ hàng cập nhật theo vị trí và ngân sách của bạn.'],
  'chinh-sach': ['Nhận chính sách bán hàng', 'Chi tiết chiết khấu, hỗ trợ lãi suất và ưu đãi đang áp dụng.'],
  'tham-quan': ['Đăng ký tham quan dự án', 'Chuyên viên sẽ liên hệ xác nhận lịch tham quan Sales Gallery.'],
  'tu-van': ['Gặp chuyên viên tư vấn', 'Tư vấn 1:1 miễn phí về sản phẩm, pháp lý và phương án tài chính.'],
  'tinh-toan': ['Nhận bảng tính chi tiết', 'Bảng dòng tiền theo căn, phương thức thanh toán và phương án vay của bạn.'],
};

export function initHeader() {
  const header = $('[data-header]');
  const bar = $('[data-mobile-bar]');
  const hero = $('#hero');
  const register = $('#dang-ky');
  let registerVisible = false;
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-solid', y > 40);
    const pastHero = hero ? y > hero.offsetHeight * 0.6 : y > 400;
    bar?.classList.toggle('is-visible', pastHero && !registerVisible);
  };
  if (register && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { registerVisible = e.isIntersecting; onScroll(); }, { threshold: 0.15 }).observe(register);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // active nav link
  const links = $$('.nav a');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${e.target.id}`));
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((a) => { const s = $(a.getAttribute('href')); if (s) io.observe(s); });
  }
}

export function initReveal() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  els.forEach((e) => io.observe(e));
}

export function initTabs() {
  $$('[role="tablist"]').forEach((list) => {
    const tabs = $$('[role="tab"]', list);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel?.dataset.product) {
        track('view_product', { product: panel.dataset.product });
        fb('ViewContent', { content_name: panel.dataset.product, content_category: 'product' });
      }
    };
    tabs.forEach((t, k) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const next = tabs[(k + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        select(next, true);
      });
    });
  });
}

export function initFilters() {
  const btns = $$('[data-filter]');
  btns.forEach((b) => b.addEventListener('click', () => {
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const f = b.dataset.filter;
    $$('[data-gallery] .g-item').forEach((it) => { it.hidden = f !== 'all' && it.dataset.cat !== f; });
    track('amenity_filter', { filter: f });
  }));
}

export function initLightbox() {
  const dlg = $('#lightbox');
  const img = $('[data-lb-img]', dlg);
  const cap = $('[data-lb-cap]', dlg);
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lightbox]');
    if (!t) return;
    img.src = t.dataset.lightbox;
    img.alt = t.dataset.caption || '';
    cap.textContent = t.dataset.caption || '';
    dlg.showModal();
    track('image_view', { image: t.dataset.lightbox.split('/').pop() });
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

export function initDialogs() {
  const dlg = $('#form-dialog');
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open-form]');
    if (opener) {
      e.preventDefault();
      const magnet = opener.dataset.openForm || 'bang-gia';
      const [title, sub] = MAGNET_COPY[magnet] || MAGNET_COPY['bang-gia'];
      $('[data-dialog-title]', dlg).textContent = title;
      $('[data-dialog-sub]', dlg).textContent = sub;
      preparePopup(magnet, opener.dataset.productPref);
      dlg.showModal();
      setTimeout(() => dlg.querySelector('input[name="full_name"]')?.focus(), 60);
      track('form_open', { form_id: 'popup', lead_magnet: magnet, cta_id: opener.dataset.cta || '' });
    }
    const close = e.target.closest('[data-close]');
    if (close) close.closest('dialog')?.close();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

/** Every element with data-cta is measured independently; phone/Zalo also send a Meta "Contact" event. */
export function initClickTracking() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-cta], [data-contact]');
    if (!el) return;
    const id = el.dataset.cta || el.dataset.contact;
    const text = (el.textContent || '').trim().slice(0, 60);
    track('cta_click', { cta_id: id, cta_text: text });
    if (el.dataset.contact === 'phone') { track('phone_click', { cta_id: id }); fb('Contact', { method: 'phone' }); }
    if (el.dataset.contact === 'zalo') { track('zalo_click', { cta_id: id }); fb('Contact', { method: 'zalo' }); }
  });
  // ViewContent when the product collection is actually seen
  const products = $('#san-pham');
  if (products && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      track('view_products', {});
      fb('ViewContent', { content_name: 'Product collection', content_category: 'product' });
    }, { threshold: 0.4 });
    io.observe(products);
  }
}

export function applyContact(contact = {}) {
  const tel = (contact.hotline || '').replace(/[^\d+]/g, '');
  const zaloDigits = (contact.zalo_phone || '').replace(/\D/g, '');
  const zalo = contact.zalo_url || (zaloDigits ? `https://zalo.me/${zaloDigits}` : '');
  $$('[data-contact="phone"]').forEach((a) => { a.hidden = !tel; if (tel) a.href = `tel:${tel}`; });
  $$('[data-contact="zalo"]').forEach((a) => { a.hidden = !zalo; if (zalo) a.href = zalo; });
  $$('[data-hotline-text]').forEach((s) => { s.textContent = contact.hotline || ''; });
  const fh = $('[data-footer-hotline]'); if (fh) fh.hidden = !tel;
  const fz = $('[data-footer-zalo]'); if (fz) fz.hidden = !zalo;
  $$('[data-maps-link]').forEach((a) => { if (contact.maps_url) a.href = contact.maps_url; else a.hidden = true; });
  if (contact.sales_gallery) $$('[data-gallery-address]').forEach((s) => { s.textContent = contact.sales_gallery; });
  // mobile bar layout when hotline/zalo missing
  const bar = $('[data-mobile-bar]');
  if (bar) bar.style.gridTemplateColumns = [tel ? 'auto' : '', zalo ? 'auto' : '', '1fr'].filter(Boolean).join(' ');
}

export function applyContent(content = {}) {
  for (const [k, v] of Object.entries(content)) {
    if (typeof v !== 'string' || !v) continue;
    $$(`[data-content="${k}"]`).forEach((el) => { el.textContent = v; });
  }
  if (content.cta_primary) setPrimaryCta(content.cta_primary);
}

export function setPrimaryCta(label) {
  $$('[data-cta-primary]').forEach((b) => {
    const icon = b.querySelector('svg');
    b.textContent = b.closest('.site-header') ? label.replace(/\s*&\s*TƯ VẤN/i, '') : label;
    if (icon) b.append(' ', icon);
  });
}

const ICONS = { wallet: 'i-wallet', bank: 'i-bank', gift: 'i-gift', bolt: 'i-bolt', shield: 'i-shield', stack: 'i-stack', pin: 'i-pin' };
const vnDate = (d) => (d ? d.split('-').reverse().join('/') : '');

export function renderPolicies(policies = [], today) {
  const box = $('[data-policies]');
  if (!box) return;
  box.textContent = '';
  if (!policies.length) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'Chính sách đang được cập nhật. Vui lòng để lại thông tin để nhận chính sách mới nhất.';
    box.append(p);
    return;
  }
  for (const pol of policies) {
    const card = document.createElement('article');
    card.className = 'policy';
    const top = document.createElement('div'); top.className = 'policy__top';
    const ic = document.createElement('span'); ic.className = 'policy__ic';
    ic.innerHTML = `<svg><use href="#${ICONS[pol.icon] || 'i-gift'}"/></svg>`;
    const src = document.createElement('span'); src.className = 'policy__src'; src.textContent = pol.source || '';
    top.append(ic, src);
    const h = document.createElement('h3'); h.textContent = pol.title;
    const p = document.createElement('p'); p.textContent = pol.summary;
    const det = document.createElement('details');
    const sum = document.createElement('summary'); sum.textContent = 'Điều kiện áp dụng';
    det.append(sum);
    if (Array.isArray(pol.details) && pol.details.length) {
      const ul = document.createElement('ul');
      for (const d of pol.details) { const li = document.createElement('li'); li.textContent = d; ul.append(li); }
      det.append(ul);
    }
    const cond = document.createElement('p'); cond.style.margin = '0'; cond.textContent = pol.conditions || '';
    det.append(cond);
    const val = document.createElement('div'); val.className = 'validity';
    val.innerHTML = '<svg><use href="#i-clock"/></svg>';
    const vt = document.createElement('span');
    vt.textContent = `Hiệu lực: từ ${vnDate(pol.valid_from)}${pol.valid_to ? ` đến ${vnDate(pol.valid_to)}` : ''}${pol.valid_note ? ` – ${pol.valid_note}` : ''}`;
    val.append(vt);
    card.append(top, h, p, val, det);
    box.append(card);
  }
  const upd = $('[data-policy-updated]');
  if (upd && today) upd.textContent = `Hiển thị các chính sách còn hiệu lực tại ngày ${vnDate(today)}. Chính sách có thể thay đổi theo thông báo mới nhất của chủ đầu tư.`;
}

export function initShare() {
  const base = location.origin + location.pathname;
  const withUtm = (src) => `${base}?utm_source=${src}&utm_medium=social_share&utm_campaign=organic_share`;
  const fbA = $('[data-share-net="facebook"]');
  const liA = $('[data-share-net="linkedin"]');
  if (fbA) fbA.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(withUtm('facebook'))}`;
  if (liA) liA.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(withUtm('linkedin'))}`;
  $$('[data-share-net]').forEach((a) => a.addEventListener('click', () => track('share', { method: a.dataset.shareNet })));
  const native = $('[data-share-native]');
  if (native && navigator.share) {
    native.hidden = false;
    native.addEventListener('click', async () => {
      try {
        await navigator.share({ title: document.title, text: 'Hiệp Phước Premia – đô thị sinh thái ven sông Soài Rạp', url: withUtm('native_share') });
        track('share', { method: 'native' });
      } catch { /* cancelled */ }
    });
  }
  const copy = $('[data-share-copy]');
  copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(withUtm('copy_link'));
      copy.setAttribute('aria-label', 'Đã sao chép liên kết');
      copy.style.background = 'rgba(224,185,109,.3)';
      setTimeout(() => { copy.style.background = ''; copy.setAttribute('aria-label', 'Sao chép liên kết'); }, 1500);
      track('share', { method: 'copy_link' });
    } catch { /* ignore */ }
  });
}
