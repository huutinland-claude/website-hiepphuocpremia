// Lead management dashboard – vanilla JS, no inline handlers (strict CSP), all text via textContent.
const app = document.getElementById('app');
const S = { me: null, options: null, integrations: null, range: null, filters: {}, page: 1, users: [] };

// ------------------------------------------------------------ helpers
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const nf = new Intl.NumberFormat('vi-VN');
const num = (n) => (n === null || n === undefined ? '–' : nf.format(Math.round(n)));
const vnd = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : `${nf.format(Math.round(n))} đ`);
const pct = (x) => (x === null || x === undefined ? '–' : `${(x * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`);
const dt = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400e3).toISOString().slice(0, 10);
const mins = (m) => (m === null || m === undefined ? '–' : m < 60 ? `${Math.round(m)} phút` : m < 1440 ? `${(m / 60).toFixed(1)} giờ` : `${(m / 1440).toFixed(1)} ngày`);
const isMgr = () => ['admin', 'manager'].includes(S.me?.role);

function toast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = error ? 'error' : '';
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}

async function api(path, { method = 'GET', body, raw } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'X-Requested-With': 'hpp-admin' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401 && path !== 'admin/login') { S.me = null; renderLogin(); throw new Error('Phiên đăng nhập hết hạn.'); }
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

function qs(obj) {
  return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();
}

function select(name, dict, value, empty = 'Tất cả') {
  const s = h('select', { class: 'select', name });
  if (empty !== null) s.append(h('option', { value: '' }, empty));
  for (const [k, v] of Object.entries(dict)) s.append(h('option', { value: k, selected: k === value }, v));
  return s;
}

function statusPill(s) { return h('span', { class: `pill st-${s}` }, S.options.statuses[s] || s); }
function prioPill(p) { return p ? h('span', { class: `pill pr-${p}` }, p.toUpperCase()) : ''; }

// ------------------------------------------------------------ auth
function renderLogin(msg) {
  const err = h('div', { class: 'err', hidden: !msg }, msg || '');
  const form = h('form', { novalidate: true },
    h('div', { class: 'brand' }, 'HIỆP PHƯỚC', h('small', {}, 'PREMIA · LEAD DASHBOARD')),
    h('label', { class: 'f' }, 'Email', h('input', { class: 'input', name: 'email', type: 'email', autocomplete: 'username', required: true })),
    h('label', { class: 'f' }, 'Mật khẩu', h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
    err,
    h('button', { class: 'btn primary', type: 'submit' }, 'Đăng nhập'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = form.querySelector('button');
    b.disabled = true;
    try {
      await api('admin/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
      await boot();
    } catch (x) { err.textContent = x.message; err.hidden = false; } finally { b.disabled = false; }
  });
  app.replaceChildren(h('div', { class: 'login' }, form));
  form.email.focus();
}

async function boot() {
  try {
    const me = await api('admin/me');
    S.me = me.user; S.options = me.options; S.integrations = me.integrations;
    S.range ||= { from: addDays(today(), -29), to: today() };
    renderShell();
    route();
  } catch (e) {
    if (!S.me) renderLogin();
  }
}

// ------------------------------------------------------------ shell & routing
const VIEWS = [
  ['overview', 'Tổng quan', () => true],
  ['leads', 'Leads', () => true],
  ['spend', 'Chi phí quảng cáo', isMgr],
  ['ab', 'A/B test', isMgr],
  ['settings', 'Cấu hình nội dung', isMgr],
  ['users', 'Người dùng', () => S.me.role === 'admin'],
  ['qr', 'QR & UTM', isMgr],
  ['integrations', 'Tích hợp', isMgr],
];

function renderShell() {
  const nav = h('nav', {}, VIEWS.filter(([, , ok]) => ok()).map(([id, label]) => h('a', { href: `#${id}`, 'data-view': id }, label)));
  const logout = h('button', { class: 'btn sm', type: 'button' }, 'Đăng xuất');
  logout.addEventListener('click', async () => { await api('admin/logout', { method: 'POST' }).catch(() => {}); S.me = null; renderLogin(); });
  app.replaceChildren(h('div', { class: 'layout' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, 'HIỆP PHƯỚC', h('small', {}, 'PREMIA')),
      nav,
      h('div', { class: 'me' }, h('div', {}, S.me.name), h('div', { class: 'muted small' }, `${S.options.roles[S.me.role]} · ${S.me.email}`), h('div', { style: { marginTop: '8px' } }, logout)),
    ),
    h('main', { class: 'main', id: 'view' }),
  ));
}

window.addEventListener('hashchange', () => S.me && route());

function route() {
  const hash = location.hash.slice(1) || 'overview';
  const [view, param] = hash.split('=');
  const allowed = VIEWS.find(([id, , ok]) => id === view && ok());
  const v = allowed ? view : view === 'lead' ? 'leads' : 'overview';
  document.querySelectorAll('[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
  const el = document.getElementById('view');
  el.replaceChildren(h('p', { class: 'muted' }, 'Đang tải…'));
  const fn = { overview: viewOverview, leads: viewLeads, spend: viewSpend, ab: viewAb, settings: viewSettings, users: viewUsers, qr: viewQr, integrations: viewIntegrations }[v];
  fn(el).catch((e) => el.replaceChildren(h('div', { class: 'err' }, e.message)));
  if (view === 'lead' && param) openLead(param);
}

function rangeBar(onChange) {
  const from = h('input', { class: 'input', type: 'date', value: S.range.from });
  const to = h('input', { class: 'input', type: 'date', value: S.range.to });
  const apply = () => { S.range = { from: from.value, to: to.value }; onChange(); };
  from.addEventListener('change', apply); to.addEventListener('change', apply);
  const preset = (days, label) => {
    const b = h('button', { class: 'btn sm', type: 'button' }, label);
    b.addEventListener('click', () => { to.value = today(); from.value = addDays(today(), -(days - 1)); apply(); });
    return b;
  };
  return h('div', { class: 'row' }, preset(1, 'Hôm nay'), preset(7, '7 ngày'), preset(30, '30 ngày'), preset(90, '90 ngày'), from, h('span', { class: 'muted' }, '→'), to);
}

// ------------------------------------------------------------ overview
function dayChart(series) {
  const W = 760, H = 180, pad = 26;
  const max = Math.max(1, ...series.map((d) => d.leads));
  const bw = (W - pad) / Math.max(1, series.length);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const add = (tag, a, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; svg.append(e); return e; };
  add('text', { x: 0, y: 12, 'font-size': 10, fill: '#74898b' }, String(max));
  add('line', { x1: pad, y1: H - 20, x2: W, y2: H - 20, stroke: '#e1e8e7' });
  series.forEach((d, i) => {
    const x = pad + i * bw + bw * 0.15, w = Math.max(2, bw * 0.7);
    const hl = (d.leads / max) * (H - 34), hq = (d.qualified / max) * (H - 34);
    const r1 = add('rect', { x, y: H - 20 - hl, width: w, height: hl, fill: '#9fc9c6', rx: 2 });
    r1.append(Object.assign(document.createElementNS(ns, 'title'), { textContent: `${d.day}: ${d.leads} lead` }));
    add('rect', { x, y: H - 20 - hq, width: w, height: hq, fill: '#0b3b3f', rx: 2 });
    if (series.length <= 14 || i % Math.ceil(series.length / 14) === 0) add('text', { x: x + w / 2, y: H - 6, 'font-size': 9, 'text-anchor': 'middle', fill: '#74898b' }, d.day.slice(5).split('-').reverse().join('/'));
  });
  return h('div', { class: 'bars' }, svg, h('div', { class: 'row small muted' }, h('span', {}, '■ Lead'), h('span', { style: { color: '#0b3b3f' } }, '■ Qualified+')));
}

function hbars(rows, label = (r) => r.key) {
  const max = Math.max(1, ...rows.map((r) => r.leads));
  if (!rows.length) return h('p', { class: 'muted small' }, 'Chưa có dữ liệu.');
  return h('div', {}, rows.slice(0, 10).map((r) => h('div', { class: 'hbar' }, h('span', { title: label(r) }, label(r)), h('span', { class: 'track' }, h('i', { style: { width: `${(r.leads / max) * 100}%` } })), h('b', {}, num(r.leads)))));
}

async function viewOverview(el) {
  const load = async () => {
    const s = await api(`admin/stats?${qs(S.range)}`);
    const t = s.totals;
    const kpis = h('div', { class: 'kpis' },
      h('div', { class: 'kpi hl' }, h('small', {}, 'Tổng lead'), h('b', {}, num(t.leads)), h('span', {}, `${s.range.from.split('-').reverse().join('/')} – ${s.range.to.split('-').reverse().join('/')}`)),
      h('div', { class: 'kpi' }, h('small', {}, 'Qualified Lead Rate'), h('b', {}, pct(t.qualified_rate)), h('span', {}, `${num(t.qualified)} qualified`)),
      h('div', { class: 'kpi' }, h('small', {}, 'Booking Conversion Rate'), h('b', {}, pct(t.booking_rate)), h('span', {}, `${num(t.booking)} booking · ${num(t.converted)} converted`)),
      h('div', { class: 'kpi' }, h('small', {}, 'Chưa liên hệ (New)'), h('b', { style: { color: t.uncontacted ? '#b42318' : '' } }, num(t.uncontacted)), h('span', {}, `${num(t.lost)} lost`)),
      h('div', { class: 'kpi' }, h('small', {}, 'Thời gian phản hồi (trung vị)'), h('b', {}, mins(t.median_response_min)), h('span', {}, `TB ${mins(t.avg_response_min)} · ${num(t.responded)} lead`)),
      ...(t.spend !== null ? [
        h('div', { class: 'kpi' }, h('small', {}, 'Chi phí quảng cáo'), h('b', {}, vnd(t.spend)), h('span', {}, 'Nhập tại mục Chi phí QC')),
        h('div', { class: 'kpi' }, h('small', {}, 'CPL – Cost per Lead'), h('b', {}, vnd(t.cpl)), h('span', {}, '')),
        h('div', { class: 'kpi' }, h('small', {}, 'Cost per Qualified Lead'), h('b', {}, vnd(t.cpql)), h('span', {}, '')),
      ] : []),
    );
    const camp = h('div', { class: 'tbl-wrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, ['Nguồn', 'Chiến dịch', 'Lead', 'Qualified', 'QL rate', 'Booking', 'Chi phí', 'CPL', 'CPQL'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))),
      h('tbody', {}, s.campaigns.length ? s.campaigns.map((c) => h('tr', {},
        h('td', {}, c.source), h('td', { class: 'wrap' }, c.campaign || '–'), h('td', { class: 'num' }, num(c.leads)), h('td', { class: 'num' }, num(c.qualified)),
        h('td', { class: 'num' }, c.leads ? pct(c.qualified / c.leads) : '–'), h('td', { class: 'num' }, num(c.booking)), h('td', { class: 'num' }, c.spend ? vnd(c.spend) : '–'),
        h('td', { class: 'num' }, c.spend && c.leads ? vnd(c.spend / c.leads) : '–'), h('td', { class: 'num' }, c.spend && c.qualified ? vnd(c.spend / c.qualified) : '–'),
      )) : h('tr', {}, h('td', { colspan: 9, class: 'muted' }, 'Chưa có lead trong khoảng thời gian này.'))),
    ));
    body.replaceChildren(
      kpis,
      h('div', { class: 'panel' }, h('h2', {}, 'Lead theo ngày'), dayChart(s.series)),
      h('div', { class: 'panel' }, h('h2', {}, 'Hiệu quả theo nguồn & chiến dịch'), camp, h('p', { class: 'small muted' }, 'Lead không có UTM được tính là (direct). CPL/CPQL chỉ hiển thị khi đã nhập chi phí.')),
      h('div', { class: 'grid g2' },
        h('div', { class: 'panel' }, h('h3', {}, 'Phễu trạng thái'), hbars(s.by_status, (r) => S.options.statuses[r.key])),
        h('div', { class: 'panel' }, h('h3', {}, 'Nhu cầu'), hbars(s.by_need)),
        h('div', { class: 'panel' }, h('h3', {}, 'Sản phẩm quan tâm'), hbars(s.by_product)),
        h('div', { class: 'panel' }, h('h3', {}, 'Ngân sách'), hbars(s.by_budget)),
        h('div', { class: 'panel' }, h('h3', {}, 'Yêu cầu (lead magnet)'), hbars(s.by_magnet)),
        h('div', { class: 'panel' }, h('h3', {}, 'Vị trí form'), hbars(s.by_form)),
      ),
    );
  };
  const body = h('div', {});
  el.replaceChildren(h('div', { class: 'topbar' }, h('h1', {}, 'Tổng quan hiệu quả'), rangeBar(() => load().catch((e) => toast(e.message, true)))), body);
  await load();
}

// ------------------------------------------------------------ leads
async function viewLeads(el) {
  const f = S.filters;
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Tên, SĐT, email…', value: f.q || '' });
  const form = h('form', { class: 'filters' },
    h('label', { class: 'f' }, 'Tìm kiếm', search),
    h('label', { class: 'f' }, 'Trạng thái', select('status', S.options.statuses, f.status)),
    h('label', { class: 'f' }, 'Nguồn (utm_source)', h('select', { class: 'select', name: 'source' }, h('option', { value: '' }, 'Tất cả'))),
    h('label', { class: 'f' }, 'Chiến dịch', h('select', { class: 'select', name: 'campaign' }, h('option', { value: '' }, 'Tất cả'))),
    h('label', { class: 'f' }, 'Nhu cầu', select('need', S.options.needs, f.need)),
    h('label', { class: 'f' }, 'Sản phẩm', select('product', S.options.products, f.product)),
    h('label', { class: 'f' }, 'Ngân sách', select('budget', S.options.budgets, f.budget)),
    h('label', { class: 'f' }, 'Ưu tiên', select('priority', { hot: 'Hot', warm: 'Warm', cold: 'Cold' }, f.priority)),
    isMgr() ? h('label', { class: 'f' }, 'Phụ trách', h('select', { class: 'select', name: 'assigned' }, h('option', { value: '' }, 'Tất cả'), h('option', { value: 'none' }, 'Chưa phân công'))) : '',
    h('label', { class: 'f' }, 'Từ ngày', h('input', { class: 'input', type: 'date', name: 'from', value: f.from || '' })),
    h('label', { class: 'f' }, 'Đến ngày', h('input', { class: 'input', type: 'date', name: 'to', value: f.to || '' })),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, 'Lọc'), h('button', { class: 'btn', type: 'reset' }, 'Xóa lọc')),
  );
  const list = h('div', {});
  const exportBar = isMgr() ? h('div', { class: 'row' },
    h('a', { class: 'btn', href: '#', 'data-exp': 'xlsx' }, 'Xuất Excel'),
    h('a', { class: 'btn', href: '#', 'data-exp': 'csv' }, 'Xuất CSV'),
    h('a', { class: 'btn', href: '#', 'data-exp': 'gads', title: 'File Offline Conversion Import – lead Qualified có gclid' }, 'Google Ads offline'),
  ) : '';
  el.replaceChildren(h('div', { class: 'topbar' }, h('h1', {}, 'Danh sách lead'), exportBar), h('div', { class: 'panel' }, form), list);

  const readForm = () => {
    const fd = new FormData(form);
    S.filters = { q: search.value.trim(), ...Object.fromEntries([...fd.entries()].filter(([k]) => k !== '')) };
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); readForm(); S.page = 1; load(); });
  form.addEventListener('reset', () => { setTimeout(() => { S.filters = {}; S.page = 1; search.value = ''; load(); }, 0); });
  if (exportBar) exportBar.addEventListener('click', (e) => {
    const a = e.target.closest('[data-exp]');
    if (!a) return;
    e.preventDefault();
    readForm();
    const type = a.dataset.exp;
    location.href = type === 'gads' ? `/api/admin/export-google-ads?${qs({ from: S.filters.from, to: S.filters.to })}` : `/api/admin/export?${qs({ ...S.filters, format: type })}`;
  });

  async function load() {
    const d = await api(`admin/leads?${qs({ ...S.filters, page: S.page, limit: 50 })}`);
    if (d.facets.sources) {
      const fill = (name, items, label = (x) => x) => {
        const sel = form.querySelector(`[name="${name}"]`);
        const cur = S.filters[name] || '';
        const keep = [...sel.options].slice(0, name === 'assigned' ? 2 : 1);
        sel.replaceChildren(...keep, ...(name === 'source' ? [h('option', { value: '(direct)' }, '(direct)')] : []), ...items.map((x) => h('option', { value: typeof x === 'string' ? x : x.id }, label(x))));
        sel.value = cur;
      };
      fill('source', d.facets.sources);
      fill('campaign', d.facets.campaigns);
      if (isMgr()) fill('assigned', d.facets.users, (u) => `${u.name}${u.active ? '' : ' (khóa)'}`);
      S.users = d.facets.users;
    }
    const rows = d.rows.map((l) => {
      const tr = h('tr', { class: 'click', tabindex: 0 },
        h('td', {}, dt(l.created_at)),
        h('td', {}, h('b', {}, l.full_name), l.duplicate_of ? h('span', { class: 'pill', title: 'SĐT đã đăng ký trước đó', style: { marginLeft: '6px' } }, 'trùng') : ''),
        h('td', {}, l.phone),
        h('td', {}, statusPill(l.status)),
        h('td', {}, prioPill(l.priority)),
        h('td', {}, S.options.needs[l.need] || '–'),
        h('td', {}, S.options.products[l.product_interest] || '–'),
        h('td', {}, S.options.budgets[l.budget] || '–'),
        h('td', {}, S.options.lead_magnets[l.lead_magnet] || '–'),
        h('td', {}, [l.utm_source, l.utm_campaign].filter(Boolean).join(' / ') || '(direct)'),
        h('td', {}, l.assigned_name || h('span', { class: 'muted' }, 'Chưa phân công')),
      );
      const open = () => { location.hash = `lead=${l.id}`; };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      return tr;
    });
    const pages = Math.max(1, Math.ceil(d.total / d.limit));
    const prev = h('button', { class: 'btn sm', type: 'button', disabled: S.page <= 1 }, '← Trước');
    const next = h('button', { class: 'btn sm', type: 'button', disabled: S.page >= pages }, 'Sau →');
    prev.addEventListener('click', () => { S.page--; load(); });
    next.addEventListener('click', () => { S.page++; load(); });
    list.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'tbl-wrap' }, h('table', { class: 't' },
        h('thead', {}, h('tr', {}, ['Thời gian', 'Họ tên', 'SĐT', 'Trạng thái', 'Ưu tiên', 'Nhu cầu', 'Sản phẩm', 'Ngân sách', 'Yêu cầu', 'Nguồn / chiến dịch', 'Phụ trách'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: 11, class: 'muted' }, 'Không có lead phù hợp.'))),
      )),
      h('div', { class: 'pager' }, h('span', { class: 'muted small' }, `${num(d.total)} lead · trang ${S.page}/${pages}`), h('div', { class: 'row' }, prev, next)),
    ));
  }
  await load();
}

async function openLead(id) {
  document.querySelector('.drawer')?.remove();
  document.querySelector('.drawer-bg')?.remove();
  const bg = h('div', { class: 'drawer-bg' });
  const dr = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Chi tiết lead' }, h('p', { class: 'muted' }, 'Đang tải…'));
  const close = () => { bg.remove(); dr.remove(); if (location.hash.startsWith('#lead=')) history.replaceState(null, '', '#leads'); };
  bg.addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  document.body.append(bg, dr);
  let d;
  try { d = await api(`admin/lead?id=${encodeURIComponent(id)}`); } catch (e) { dr.replaceChildren(h('div', { class: 'err' }, e.message)); return; }
  const l = d.lead;
  const O = S.options;
  const tel = `tel:${l.phone}`;
  const zalo = `https://zalo.me/${l.phone}`;

  const status = select('status', O.statuses, l.status, null);
  const lost = h('input', { class: 'input', placeholder: 'Lý do (khi chọn Lost)', value: l.lost_reason || '', hidden: l.status !== 'lost' });
  status.addEventListener('change', () => { lost.hidden = status.value !== 'lost'; });
  const assign = h('select', { class: 'select', disabled: !isMgr() }, h('option', { value: '' }, 'Chưa phân công'), d.users.map((u) => h('option', { value: u.id, selected: u.id === l.assigned_to }, `${u.name} (${O.roles[u.role]})`)));
  const save = h('button', { class: 'btn primary', type: 'button' }, 'Lưu thay đổi');
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const body = { id: l.id, status: status.value, lost_reason: lost.value };
      if (isMgr()) body.assigned_to = assign.value || null;
      await api('admin/lead', { method: 'PATCH', body });
      toast('Đã cập nhật lead.');
      openLead(l.id);
      if (location.hash.startsWith('#lead') || location.hash === '#leads') document.querySelector('#view form.filters')?.dispatchEvent(new Event('submit', { cancelable: true }));
    } catch (e) { toast(e.message, true); } finally { save.disabled = false; }
  });

  const noteType = select('type', { call: 'Gọi điện', zalo: 'Nhắn Zalo', email: 'Gửi email', meeting: 'Gặp trực tiếp', note: 'Ghi chú' }, 'call', null);
  const note = h('textarea', { class: 'input', placeholder: 'Nội dung chăm sóc: kết quả cuộc gọi, nhu cầu, hẹn lịch…', maxlength: 2000 });
  const addNote = h('button', { class: 'btn', type: 'button' }, 'Thêm lịch sử chăm sóc');
  addNote.addEventListener('click', async () => {
    if (!note.value.trim()) { toast('Vui lòng nhập nội dung.', true); return; }
    addNote.disabled = true;
    try { await api('admin/lead-note', { method: 'POST', body: { id: l.id, type: noteType.value, content: note.value } }); toast('Đã ghi nhận.'); openLead(l.id); } catch (e) { toast(e.message, true); } finally { addNote.disabled = false; }
  });

  const kv = (pairs) => h('dl', { class: 'kv' }, pairs.filter(([, v]) => v !== undefined).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v === null || v === '' ? '–' : v)]));
  const ft = l.first_touch || {};
  dr.replaceChildren(
    h('header', {},
      h('div', {}, h('h2', {}, l.full_name), h('div', { class: 'row' }, statusPill(l.status), prioPill(l.priority), h('span', { class: 'muted small' }, `Đăng ký ${dt(l.created_at)}`))),
      (() => { const b = h('button', { class: 'btn sm', type: 'button', 'aria-label': 'Đóng' }, '✕'); b.addEventListener('click', close); return b; })(),
    ),
    h('div', { class: 'panel' },
      h('div', { class: 'row', style: { marginBottom: '10px' } }, h('a', { class: 'btn gold', href: tel }, `Gọi ${l.phone}`), h('a', { class: 'btn', href: zalo, target: '_blank', rel: 'noopener' }, 'Mở Zalo'), l.email ? h('a', { class: 'btn', href: `mailto:${l.email}` }, 'Email') : ''),
      kv([
        ['Số điện thoại', l.phone], ['Email', l.email], ['Nhu cầu', O.needs[l.need]], ['Sản phẩm', O.products[l.product_interest]], ['Ngân sách', O.budgets[l.budget]],
        ['Liên hệ qua', O.contact_methods[l.contact_method]], ['Yêu cầu', O.lead_magnets[l.lead_magnet]], ['Ghi chú KH', l.message], ['Form', l.form_id],
        ['Phản hồi lần đầu', l.first_response_at ? `${dt(l.first_response_at)} (${mins((new Date(l.first_response_at) - new Date(l.created_at)) / 60000)})` : 'Chưa phản hồi'],
        ['Đồng ý xử lý dữ liệu', l.consent ? 'Có' : 'Không'],
      ]),
    ),
    h('div', { class: 'panel' },
      h('h3', {}, 'Xử lý lead'),
      h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr' } }, h('label', { class: 'f' }, 'Trạng thái', status), h('label', { class: 'f' }, 'Phụ trách', assign)),
      h('div', { style: { margin: '8px 0' } }, lost),
      h('div', { class: 'row end' }, save),
      h('p', { class: 'small muted' }, 'Chuyển sang Qualified sẽ gửi sự kiện QualifiedLead (Meta CAPI) và qualify_lead (GA4) nếu đã cấu hình.'),
    ),
    h('div', { class: 'panel' },
      h('h3', {}, 'Lịch sử chăm sóc'),
      h('div', { class: 'grid', style: { gridTemplateColumns: '160px 1fr' } }, noteType, note),
      h('div', { class: 'row end', style: { marginTop: '8px' } }, addNote),
      h('ul', { class: 'timeline', style: { marginTop: '12px' } }, d.activities.map((a) => h('li', {},
        h('div', { class: 'meta' }, `${dt(a.created_at)} · ${a.user_name || 'Hệ thống'} · ${{ call: 'Gọi điện', zalo: 'Zalo', email: 'Email', meeting: 'Gặp trực tiếp', note: 'Ghi chú', status: 'Trạng thái', assign: 'Phân công', created: 'Tạo lead', system: 'Hệ thống' }[a.type] || a.type}`),
        h('div', {}, a.content),
        a.meta && (a.meta.meta_capi || a.meta.ga4_mp) ? h('div', { class: 'meta' }, `Meta CAPI: ${a.meta.meta_capi} · GA4: ${a.meta.ga4_mp}`) : '',
      ))),
    ),
    h('div', { class: 'panel' },
      h('h3', {}, 'Nguồn & attribution'),
      kv([
        ['utm_source', l.utm_source], ['utm_medium', l.utm_medium], ['utm_campaign', l.utm_campaign], ['utm_content', l.utm_content], ['utm_term', l.utm_term],
        ['gclid', l.gclid], ['fbclid', l.fbclid], ['ttclid', l.ttclid], ['Landing URL', l.landing_url], ['Referrer', l.referrer],
        ['First touch', [ft.utm_source, ft.utm_campaign].filter(Boolean).join(' / ') || (ft.referrer ? ft.referrer : '(direct)')],
        ['A/B variants', l.ab_variants ? Object.entries(l.ab_variants).map(([k, v]) => `${k}=${v}`).join(', ') : null],
        ['Meta CAPI', l.capi_status], ['Thông báo', l.notify_status], ['Event ID', l.event_id], ['Lead ID', l.id],
      ]),
    ),
    d.related.length ? h('div', { class: 'panel' }, h('h3', {}, 'Các lần đăng ký khác cùng SĐT'), h('ul', {}, d.related.map((r) => h('li', {}, h('a', { href: `#lead=${r.id}` }, `${dt(r.created_at)} – ${O.statuses[r.status]} – ${r.form_id || ''}`))))) : '',
  );
}

// ------------------------------------------------------------ ad spend
async function viewSpend(el) {
  const d = await api('admin/spend');
  const form = h('form', { class: 'filters' },
    h('label', { class: 'f' }, 'Từ ngày', h('input', { class: 'input', type: 'date', name: 'date_from', required: true, value: addDays(today(), -6) })),
    h('label', { class: 'f' }, 'Đến ngày', h('input', { class: 'input', type: 'date', name: 'date_to', required: true, value: today() })),
    h('label', { class: 'f' }, 'utm_source', h('input', { class: 'input', name: 'source', required: true, placeholder: 'facebook / google / tiktok' })),
    h('label', { class: 'f' }, 'utm_campaign (để trống = cả nguồn)', h('input', { class: 'input', name: 'campaign' })),
    h('label', { class: 'f' }, 'Chi phí (VNĐ)', h('input', { class: 'input', name: 'amount', inputmode: 'numeric', required: true })),
    h('label', { class: 'f' }, 'Ghi chú', h('input', { class: 'input', name: 'note' })),
    h('button', { class: 'btn primary', type: 'submit' }, 'Thêm chi phí'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(form));
    b.amount = Number(String(b.amount).replace(/\D/g, ''));
    try { await api('admin/spend', { method: 'POST', body: b }); toast('Đã thêm chi phí.'); viewSpend(el); } catch (x) { toast(x.message, true); }
  });
  const rows = d.rows.map((r) => {
    const del = h('button', { class: 'btn sm danger', type: 'button' }, 'Xóa');
    del.addEventListener('click', async () => { if (!confirm('Xóa dòng chi phí này?')) return; await api(`admin/spend?id=${r.id}`, { method: 'DELETE' }); viewSpend(el); });
    return h('tr', {}, h('td', {}, `${r.date_from} → ${r.date_to}`), h('td', {}, r.source), h('td', {}, r.campaign || '(cả nguồn)'), h('td', { class: 'num' }, vnd(r.amount)), h('td', { class: 'wrap' }, r.note || ''), h('td', {}, r.created_by || ''), h('td', {}, del));
  });
  el.replaceChildren(
    h('div', { class: 'topbar' }, h('h1', {}, 'Chi phí quảng cáo')),
    h('div', { class: 'panel' }, h('p', { class: 'small muted' }, 'Nhập chi phí theo nguồn/chiến dịch (khớp utm_source, utm_campaign trên link quảng cáo) để Dashboard tính CPL và Cost per Qualified Lead. Chi phí được phân bổ theo số ngày giao với khoảng thời gian xem báo cáo.'), form),
    h('div', { class: 'panel' }, h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Khoảng ngày', 'Nguồn', 'Chiến dịch', 'Chi phí', 'Ghi chú', 'Người nhập', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: 7, class: 'muted' }, 'Chưa có dữ liệu chi phí.')))))),
  );
}

// ------------------------------------------------------------ A/B
async function viewAb(el) {
  const [stats, conf] = await Promise.all([api(`admin/stats?${qs(S.range)}`), api('admin/settings')]);
  const tests = conf.settings.ab_tests;
  const blocks = Object.entries(tests).map(([key, t]) => {
    const rep = stats.ab[key] || {};
    const rows = t.variants.map((v) => {
      const r = rep[v.id] || { views: 0, leads: 0, qualified: 0 };
      const desc = v.headline || v.cta || v.image || v.title || '';
      return h('tr', {}, h('td', {}, h('b', {}, v.id)), h('td', { class: 'wrap' }, desc), h('td', { class: 'num' }, `${v.weight}%`), h('td', { class: 'num' }, num(r.views)), h('td', { class: 'num' }, num(r.leads)), h('td', { class: 'num' }, r.views ? pct(r.leads / r.views) : '–'), h('td', { class: 'num' }, num(r.qualified)));
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h3', {}, `${t.label || key} `, h('span', { class: 'muted small' }, `(${key})`)), h('span', { class: `pill ${t.active ? 'st-converted' : 'st-lost'}` }, t.active ? 'Đang chạy' : 'Tắt')),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Biến thể', 'Nội dung', 'Tỷ trọng', 'Lượt xem (visitor/ngày)', 'Lead', 'Conversion', 'Qualified'].map((x, i) => h('th', { class: i > 1 ? 'num' : '' }, x)))), h('tbody', {}, rows))),
      h('p', { class: 'small muted' }, `Xem thử: /?ab_${key}=<id biến thể>`),
    );
  });
  const ta = h('textarea', { class: 'input code', spellcheck: 'false' }, JSON.stringify(tests, null, 2));
  const save = h('button', { class: 'btn primary', type: 'button' }, 'Lưu cấu hình A/B');
  save.addEventListener('click', async () => {
    let v; try { v = JSON.parse(ta.value); } catch { toast('JSON không hợp lệ.', true); return; }
    try { await api('admin/settings', { method: 'PUT', body: { key: 'ab_tests', value: v } }); toast('Đã lưu. Trang landing cập nhật trong ~30 giây.'); viewAb(el); } catch (e) { toast(e.message, true); }
  });
  el.replaceChildren(
    h('div', { class: 'topbar' }, h('h1', {}, 'A/B test'), rangeBar(() => viewAb(el))),
    ...blocks,
    h('div', { class: 'panel' }, h('h2', {}, 'Chỉnh sửa thử nghiệm'),
      h('p', { class: 'small muted' }, 'Mỗi test: "active" (true/false) và danh sách "variants" gồm id, weight (%) và nội dung: headline (hero_copy), cta (cta_primary), image: hero-a | hero-b (hero_image), id full | short (form_length), id = lead magnet + title (lead_magnet), id hero | below (form_position). Khi đổi nội dung biến thể, nên đổi id để số liệu không lẫn.'),
      ta, h('div', { class: 'row end', style: { marginTop: '8px' } }, save)),
  );
}

// ------------------------------------------------------------ settings
async function viewSettings(el) {
  const { settings: s } = await api('admin/settings');
  const saveKey = async (key, value, btn) => {
    btn.disabled = true;
    try { await api('admin/settings', { method: 'PUT', body: { key, value } }); toast('Đã lưu. Trang landing cập nhật trong ~30 giây.'); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
  };
  const objForm = (key, fields, title, note) => {
    const inputs = {};
    const grid = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' } }, fields.map(([k, label, multi]) => {
      inputs[k] = multi ? h('textarea', { class: 'input' }, s[key][k] || '') : h('input', { class: 'input', value: s[key][k] || '' });
      return h('label', { class: 'f' }, label, inputs[k]);
    }));
    const b = h('button', { class: 'btn primary', type: 'button' }, 'Lưu');
    b.addEventListener('click', () => saveKey(key, { ...s[key], ...Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()])) }, b));
    return h('div', { class: 'panel' }, h('h2', {}, title), note ? h('p', { class: 'small muted' }, note) : '', grid, h('div', { class: 'row end', style: { marginTop: '10px' } }, b));
  };

  // policies editor
  const polBox = h('div', {});
  const policies = JSON.parse(JSON.stringify(s.policies));
  const drawPolicies = () => {
    polBox.replaceChildren(...policies.map((p, i) => {
      const inp = (k, label, type = 'text') => {
        const e = type === 'textarea' ? h('textarea', { class: 'input' }, Array.isArray(p[k]) ? p[k].join('\n') : (p[k] || '')) : h('input', { class: 'input', type, value: p[k] || '' });
        e.addEventListener('input', () => { p[k] = k === 'details' ? e.value.split('\n').map((x) => x.trim()).filter(Boolean) : e.value; });
        return h('label', { class: 'f' }, label, e);
      };
      const active = h('input', { type: 'checkbox', checked: !!p.active });
      active.addEventListener('change', () => { p.active = active.checked; });
      const icon = select('icon', { wallet: 'Ví', bank: 'Ngân hàng', gift: 'Quà', bolt: 'Tia sét', shield: 'Khiên', stack: 'Chồng', pin: 'Vị trí' }, p.icon, null);
      icon.addEventListener('change', () => { p.icon = icon.value; });
      const del = h('button', { class: 'btn sm danger', type: 'button' }, 'Xóa');
      del.addEventListener('click', () => { if (confirm(`Xóa chính sách "${p.title}"?`)) { policies.splice(i, 1); drawPolicies(); } });
      const expired = p.valid_to && p.valid_to < today();
      return h('div', { class: 'pol' },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('label', { class: 'row small' }, active, ' Hiển thị'), expired ? h('span', { class: 'pill st-lost' }, 'Đã hết hạn – tự ẩn') : '', del),
        h('div', { class: 'g' }, inp('title', 'Tiêu đề'), inp('source', 'Số thông báo / nguồn'), h('label', { class: 'f' }, 'Biểu tượng', icon)),
        inp('summary', 'Tóm tắt'),
        inp('details', 'Chi tiết (mỗi dòng một ý)', 'textarea'),
        inp('conditions', 'Điều kiện áp dụng (bắt buộc)'),
        h('div', { class: 'g' }, inp('valid_from', 'Hiệu lực từ (bắt buộc)', 'date'), inp('valid_to', 'Đến ngày', 'date'), inp('valid_note', 'Ghi chú hiệu lực (khi không có ngày kết thúc)')),
      );
    }));
  };
  drawPolicies();
  const addPol = h('button', { class: 'btn', type: 'button' }, '+ Thêm chính sách');
  addPol.addEventListener('click', () => { policies.push({ id: `pol-${Date.now().toString(36)}`, active: false, icon: 'gift', title: '', source: '', summary: '', details: [], conditions: '', valid_from: today(), valid_to: '', valid_note: '' }); drawPolicies(); });
  const savePol = h('button', { class: 'btn primary', type: 'button' }, 'Lưu chính sách');
  savePol.addEventListener('click', () => saveKey('policies', policies, savePol));

  const pm = h('textarea', { class: 'input code', spellcheck: 'false' }, JSON.stringify(s.payment_methods, null, 2));
  const savePm = h('button', { class: 'btn primary', type: 'button', disabled: S.me.role !== 'admin' }, 'Lưu phương thức thanh toán');
  savePm.addEventListener('click', () => { let v; try { v = JSON.parse(pm.value); } catch { toast('JSON không hợp lệ.', true); return; } saveKey('payment_methods', v, savePm); });

  el.replaceChildren(
    h('div', { class: 'topbar' }, h('h1', {}, 'Cấu hình nội dung'), h('a', { class: 'btn', href: '/', target: '_blank', rel: 'noopener' }, 'Xem trang landing ↗')),
    h('div', { class: 'warn', style: { marginBottom: '14px' } }, 'Mọi thông tin giá, chính sách, pháp lý phải đối chiếu với văn bản chính thức mới nhất của chủ đầu tư/DKRA trước khi lưu. Headline/CTA đang được A/B test sẽ ưu tiên nội dung biến thể.'),
    objForm('content', [['badge', 'Nhãn hero'], ['headline', 'Headline (khi không A/B test)'], ['subheadline', 'Subheadline', true], ['cta_primary', 'CTA chính'], ['cta_secondary', 'CTA phụ'], ['form_title', 'Tiêu đề form chính'], ['form_subtitle', 'Mô tả form chính'], ['final_headline', 'Headline CTA cuối trang'], ['final_subheadline', 'Mô tả CTA cuối trang', true]], 'Nội dung chính'),
    objForm('contact', [['hotline', 'Hotline (để trống = ẩn nút gọi)'], ['zalo_phone', 'Số Zalo'], ['zalo_url', 'Link Zalo OA (ưu tiên hơn số Zalo)'], ['sales_gallery', 'Địa chỉ Sales Gallery'], ['maps_url', 'Link Google Maps']], 'Thông tin liên hệ', 'Nút Hotline/Zalo nổi, thanh CTA mobile và trang cảm ơn dùng các giá trị này.'),
    h('div', { class: 'panel' }, h('h2', {}, 'Chính sách bán hàng'), h('p', { class: 'small muted' }, 'Chính sách chỉ hiển thị khi được bật và nằm trong thời gian hiệu lực. Bắt buộc có ngày hiệu lực và điều kiện áp dụng.'), polBox, h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '10px' } }, addPol, savePol)),
    h('div', { class: 'panel' }, h('h2', {}, 'Phương thức thanh toán (máy tính tài chính)'), h('p', { class: 'small muted' }, 'Chỉ quản trị viên được sửa. Tổng tỷ lệ các đợt của mỗi phương thức phải bằng 100%. day = số ngày kể từ đợt 1, null = khi nhận GCN.'), pm, h('div', { class: 'row end', style: { marginTop: '8px' } }, savePm)),
  );
}

// ------------------------------------------------------------ users
async function viewUsers(el) {
  const d = await api('admin/users');
  const form = h('form', { class: 'filters' },
    h('label', { class: 'f' }, 'Họ tên', h('input', { class: 'input', name: 'name', required: true })),
    h('label', { class: 'f' }, 'Email', h('input', { class: 'input', name: 'email', type: 'email', required: true })),
    h('label', { class: 'f' }, 'Vai trò', select('role', S.options.roles, 'sales', null)),
    h('label', { class: 'f' }, 'Mật khẩu tạm (≥ 10 ký tự)', h('input', { class: 'input', name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: 10 })),
    h('button', { class: 'btn primary', type: 'submit' }, 'Tạo tài khoản'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('admin/users', { method: 'POST', body: Object.fromEntries(new FormData(form)) }); toast('Đã tạo tài khoản.'); viewUsers(el); } catch (x) { toast(x.message, true); }
  });
  const rows = d.users.map((u) => {
    const role = select('role', S.options.roles, u.role, null);
    const active = h('input', { type: 'checkbox', checked: u.active });
    const recv = h('input', { type: 'checkbox', checked: u.receive_leads });
    const pw = h('button', { class: 'btn sm', type: 'button' }, 'Đặt lại mật khẩu');
    const patch = async (body) => { try { await api('admin/users', { method: 'PATCH', body: { id: u.id, ...body } }); toast('Đã cập nhật.'); } catch (x) { toast(x.message, true); viewUsers(el); } };
    role.addEventListener('change', () => patch({ role: role.value }));
    active.addEventListener('change', () => patch({ active: active.checked }));
    recv.addEventListener('change', () => patch({ receive_leads: recv.checked }));
    pw.addEventListener('click', () => { const p = prompt(`Mật khẩu mới cho ${u.email} (≥ 10 ký tự):`); if (p) patch({ password: p }); });
    return h('tr', {}, h('td', {}, h('b', {}, u.name)), h('td', {}, u.email), h('td', {}, role), h('td', {}, active), h('td', {}, recv), h('td', {}, dt(u.last_login_at)), h('td', {}, pw));
  });
  el.replaceChildren(
    h('div', { class: 'topbar' }, h('h1', {}, 'Người dùng & phân quyền')),
    h('div', { class: 'panel small' }, h('p', {}, h('b', {}, 'Quản trị viên: '), 'toàn quyền, quản lý người dùng, phương thức thanh toán.'), h('p', {}, h('b', {}, 'Trưởng nhóm: '), 'xem toàn bộ lead, phân công, xuất dữ liệu, cấu hình nội dung, chi phí QC.'), h('p', { style: { margin: 0 } }, h('b', {}, 'Chuyên viên: '), 'chỉ xem và cập nhật lead được phân công cho mình.'), h('p', { class: 'muted', style: { marginTop: '8px' } }, 'Lead mới được tự động chia vòng tròn (round-robin) cho người dùng đang hoạt động có bật "Nhận lead".')),
    h('div', { class: 'panel' }, form),
    h('div', { class: 'panel' }, h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Tên', 'Email', 'Vai trò', 'Hoạt động', 'Nhận lead', 'Đăng nhập gần nhất', ''].map((x) => h('th', {}, x)))), h('tbody', {}, rows)))),
  );
}

// ------------------------------------------------------------ QR & UTM builder
async function viewQr(el) {
  const base = S.integrations.site_url || location.origin;
  const f = { utm_source: 'leaflet', utm_medium: 'offline', utm_campaign: 'hpp_t11_2026', utm_content: '' };
  const img = h('img', { alt: 'QR code', width: 220, height: 220, style: { background: '#fff', borderRadius: '10px' } });
  const link = h('input', { class: 'input', readonly: true });
  const dl = h('a', { class: 'btn', download: 'qr-hiep-phuoc-premia.svg' }, 'Tải QR (SVG)');
  const draw = () => {
    const q = qs(f);
    img.src = `/api/qr?${q}`;
    dl.href = `/api/qr?${q}`;
    link.value = `${base.replace(/\/$/, '')}/?${q}`;
  };
  const inputs = Object.keys(f).map((k) => {
    const i = h('input', { class: 'input', value: f[k] });
    i.addEventListener('input', () => { f[k] = i.value.trim(); draw(); });
    return h('label', { class: 'f' }, k, i);
  });
  draw();
  el.replaceChildren(
    h('div', { class: 'topbar' }, h('h1', {}, 'QR code & link UTM')),
    h('div', { class: 'panel' },
      h('p', { class: 'small muted' }, 'Tạo link có UTM cho quảng cáo, tờ rơi, standee, sự kiện. Lead từ QR sẽ được ghi nhận đúng nguồn trong Dashboard.'),
      h('div', { class: 'filters' }, inputs),
      h('div', { class: 'row', style: { marginTop: '14px', alignItems: 'flex-start' } }, img, h('div', { style: { flex: '1', minWidth: '240px', display: 'grid', gap: '8px' } }, h('label', { class: 'f' }, 'Link có UTM', link), h('div', { class: 'row' }, dl))),
    ),
  );
}

// ------------------------------------------------------------ integrations
async function viewIntegrations(el) {
  const i = S.integrations;
  const rows = [
    ['Database', i.database === 'postgres' ? 'Postgres (DATABASE_URL)' : 'SQLite local (data/leads.db)', true, i.database === 'sqlite' ? 'Chỉ dùng cho local/VPS. Trên Vercel bắt buộc Postgres.' : ''],
    ['SESSION_SECRET', i.session_secret ? 'Đã cấu hình' : 'Chưa cấu hình', i.session_secret, 'Bắt buộc khi deploy.'],
    ['SITE_URL', i.site_url || 'Chưa cấu hình', !!i.site_url, 'Dùng cho canonical, Open Graph, sitemap, QR.'],
    ['Meta Pixel', i.meta_pixel ? 'Đã cấu hình' : 'Chưa cấu hình', i.meta_pixel, 'META_PIXEL_ID'],
    ['Meta Conversions API', i.meta_capi ? (i.meta_test_mode ? 'Đã cấu hình – ĐANG Ở CHẾ ĐỘ TEST' : 'Đã cấu hình') : 'Chưa cấu hình', i.meta_capi, 'META_CAPI_ACCESS_TOKEN (+ META_TEST_EVENT_CODE khi kiểm thử)'],
    ['Google Tag Manager', i.gtm ? 'Đã cấu hình' : 'Chưa cấu hình', i.gtm, 'GTM_ID – nếu có, GA4/Ads cấu hình trong GTM'],
    ['GA4', i.ga4 ? 'Đã cấu hình' : 'Chưa cấu hình', i.ga4, 'GA4_MEASUREMENT_ID'],
    ['GA4 Measurement Protocol', i.ga4_mp ? 'Đã cấu hình' : 'Chưa cấu hình', i.ga4_mp, 'GA4_API_SECRET – gửi qualify_lead từ server'],
    ['Google Ads conversion', i.google_ads ? 'Đã cấu hình' : 'Chưa cấu hình', i.google_ads, 'GOOGLE_ADS_ID + GOOGLE_ADS_LEAD_LABEL (khi không dùng GTM)'],
    ['Cloudflare Turnstile', i.turnstile ? 'Đã bật' : 'Tắt (honeypot + rate limit vẫn hoạt động)', i.turnstile, 'TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY'],
    ['Telegram', i.telegram ? 'Đã cấu hình' : 'Chưa cấu hình', i.telegram, 'TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID'],
    ['Email (Resend)', i.email ? 'Đã cấu hình' : 'Chưa cấu hình', i.email, 'RESEND_API_KEY + NOTIFY_EMAIL_FROM/TO'],
    ['Webhook CRM / Zalo OA', i.webhook ? 'Đã cấu hình' : 'Chưa cấu hình', i.webhook, 'LEAD_WEBHOOK_URL (+ LEAD_WEBHOOK_SECRET)'],
  ];
  el.replaceChildren(
    h('div', { class: 'topbar' }, h('h1', {}, 'Trạng thái tích hợp')),
    h('div', { class: 'panel' }, h('p', { class: 'small muted' }, 'Trạng thái đọc từ biến môi trường của server. "Đã cấu hình" nghĩa là có khóa – vẫn cần kiểm thử thực tế (Meta Test Events, GA4 DebugView, Tag Assistant) trước khi chạy quảng cáo.'),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Hạng mục', 'Trạng thái', 'Biến môi trường / ghi chú'].map((x) => h('th', {}, x)))),
        h('tbody', {}, rows.map(([a, b, ok, c]) => h('tr', {}, h('td', {}, h('b', {}, a)), h('td', {}, h('span', { class: `pill ${ok ? 'st-converted' : 'st-booking'}` }, b)), h('td', { class: 'wrap small' }, c))))))),
  );
}

boot();
