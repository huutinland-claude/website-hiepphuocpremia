// Financial calculator: bank-loan simulation (with developer interest support) and developer payment schedules.
import { track } from './tracking.js';

const fmt = new Intl.NumberFormat('vi-VN');
const money = (n) => `${fmt.format(Math.round(n))} đ`;
const short = (n) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return fmt.format(Math.round(n));
};
const parseMoney = (s) => Number(String(s || '').replace(/\D/g, '')) || 0;
const $ = (sel, root = document) => root.querySelector(sel);

function bindMoney(input, onChange) {
  const words = $(`[data-words="${input.id}"]`);
  const update = () => {
    const n = parseMoney(input.value);
    input.value = n ? fmt.format(n) : '';
    if (words) words.textContent = n ? `≈ ${short(n)} đồng` : '';
    onChange(n);
  };
  input.addEventListener('input', update);
  input.addEventListener('blur', update);
  update();
}

/** Monthly amortisation schedule. Returns per-month rows and totals. */
export function simulateLoan({ loan, years, rate, graceMonths, method, support }) {
  const n = Math.max(1, Math.round(years * 12));
  const g = Math.min(Math.max(0, graceMonths), n - 1);
  const i = rate / 100 / 12;
  const rows = [];
  let bal = loan;
  const amortMonths = n - g;
  const annuity = i > 0 ? (loan * i) / (1 - (1 + i) ** -amortMonths) : loan / amortMonths;
  let totalInterest = 0, totalSupported = 0, max = 0;
  for (let m = 1; m <= n && bal > 0.5; m++) {
    const interest = bal * i;
    let principal = 0;
    if (m > g) principal = method === 'annuity' ? Math.min(bal, annuity - interest) : Math.min(bal, loan / amortMonths);
    let supported = 0;
    if (support && support.months && m <= support.months) supported = Math.min(interest, bal * (Math.min(rate, support.rate) / 100 / 12));
    const custInterest = interest - supported;
    const pay = principal + custInterest;
    bal -= principal;
    totalInterest += custInterest;
    totalSupported += supported;
    max = Math.max(max, pay);
    rows.push({ m, principal, interest: custInterest, supported, pay, bal: Math.max(0, bal) });
  }
  return { rows, totalInterest, totalSupported, max, first: rows[0]?.pay || 0 };
}

function barChart(years) {
  const W = 640, H = 200, pad = 28;
  const max = Math.max(1, ...years.map((y) => y.principal + y.interest));
  const bw = (W - pad) / years.length;
  let bars = '';
  years.forEach((y, k) => {
    const x = pad + k * bw + bw * 0.15;
    const w = Math.max(2, bw * 0.7);
    const hp = (y.principal / max) * (H - 30);
    const hi = (y.interest / max) * (H - 30);
    bars += `<rect x="${x.toFixed(1)}" y="${(H - 20 - hp).toFixed(1)}" width="${w.toFixed(1)}" height="${hp.toFixed(1)}" fill="var(--teal-700)" rx="1.5"><title>Năm ${y.year}: gốc ${short(y.principal)}</title></rect>`;
    bars += `<rect x="${x.toFixed(1)}" y="${(H - 20 - hp - hi).toFixed(1)}" width="${w.toFixed(1)}" height="${hi.toFixed(1)}" fill="var(--gold-500)" rx="1.5"><title>Năm ${y.year}: lãi ${short(y.interest)}</title></rect>`;
    if (years.length <= 12 || k % Math.ceil(years.length / 12) === 0) bars += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" font-size="10" text-anchor="middle" fill="#6a7d7f">${y.year}</text>`;
  });
  const axis = `<text x="0" y="12" font-size="10" fill="#6a7d7f">${short(max)}</text><line x1="${pad}" y1="${H - 20}" x2="${W}" y2="${H - 20}" stroke="#e2e8e7"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ dòng tiền trả nợ theo năm">${axis}${bars}</svg>`;
}

function initLoan(cfg) {
  const root = $('[data-calc="loan"]');
  if (!root) return;
  const support = cfg.loan_support || { max_rate: 10, max_ratio: 70, max_months: 12 };
  const st = { price: 0, ratio: 70, equity: 0 };
  const el = {
    price: $('#lc-price'), ratio: $('#lc-ratio'), equity: $('#lc-equity'), years: $('#lc-years'), rate: $('#lc-rate'),
    grace: $('#lc-grace'), method: $('#lc-method'), support: $('#lc-support'),
  };
  el.ratio.max = String(support.max_ratio || 70);
  $('[data-support-text]').textContent = `Tối đa ${support.max_rate}%/năm, khoản vay ≤ ${support.max_ratio}% giá trị, tối đa ${support.max_months} tháng (PTTT chuẩn 36 tháng).`;
  let used = false;

  const render = () => {
    const loan = Math.max(0, st.price - st.equity);
    const years = Number(el.years.value), rate = Number(el.rate.value), grace = Number(el.grace.value);
    $('[data-out="ratio"]').textContent = `${st.price ? Math.round((loan / st.price) * 1000) / 10 : 0}%`;
    $('[data-out="years"]').textContent = `${years} năm`;
    $('[data-out="rate"]').textContent = `${rate.toLocaleString('vi-VN')}%`;
    $('[data-out="grace"]').textContent = `${grace} tháng`;
    const eligible = st.price > 0 && loan / st.price <= (support.max_ratio || 70) / 100 + 1e-9;
    const sim = simulateLoan({
      loan, years, rate, graceMonths: grace, method: el.method.value,
      support: el.support.checked && eligible ? { rate: support.max_rate, months: support.max_months } : null,
    });
    const set = (k, v) => { $(`[data-r="${k}"]`).textContent = v; };
    set('equity', money(st.equity));
    set('loan', money(loan));
    set('first', loan ? money(sim.first) : '0 đ');
    set('max', loan ? money(sim.max) : '0 đ');
    set('interest', money(sim.totalInterest));
    set('supported', el.support.checked ? money(sim.totalSupported) : '—');

    const years_ = [];
    for (const r of sim.rows) {
      const y = Math.ceil(r.m / 12);
      years_[y - 1] ||= { year: y, principal: 0, interest: 0, supported: 0, bal: 0 };
      years_[y - 1].principal += r.principal;
      years_[y - 1].interest += r.interest;
      years_[y - 1].supported += r.supported;
      years_[y - 1].bal = r.bal;
    }
    $('[data-chart]').innerHTML = years_.length ? barChart(years_) : '<p class="hint">Không có khoản vay.</p>';
    const tbl = $('[data-loan-table]');
    tbl.innerHTML = '<thead><tr><th>Năm</th><th>Gốc</th><th>Lãi KH trả</th><th>Lãi CĐT hỗ trợ</th><th>Tổng trả</th><th>Dư nợ cuối năm</th></tr></thead>';
    const body = document.createElement('tbody');
    for (const y of years_) {
      const tr = document.createElement('tr');
      for (const v of [`Năm ${y.year}`, money(y.principal), money(y.interest), y.supported ? money(y.supported) : '–', money(y.principal + y.interest), money(y.bal)]) {
        const td = document.createElement('td'); td.textContent = v; tr.append(td);
      }
      body.append(tr);
    }
    tbl.append(body);
    const tf = document.createElement('tfoot');
    tf.innerHTML = `<tr><td>Tổng</td><td>${money(loan)}</td><td>${money(sim.totalInterest)}</td><td>${money(sim.totalSupported)}</td><td>${money(loan + sim.totalInterest)}</td><td></td></tr>`;
    tbl.append(tf);
    if (!used && document.activeElement && root.contains(document.activeElement)) { used = true; track('calculator_use', { tool: 'loan' }); }
  };

  bindMoney(el.price, (n) => { st.price = n; st.equity = Math.round(n * (1 - st.ratio / 100)); el.equity.value = fmt.format(st.equity); render(); });
  el.equity.addEventListener('input', () => {
    const n = Math.min(parseMoney(el.equity.value), st.price);
    st.equity = n;
    el.equity.value = n ? fmt.format(n) : '';
    st.ratio = st.price ? Math.max(0, (1 - n / st.price) * 100) : 0;
    el.ratio.value = String(Math.round(st.ratio / 5) * 5);
    render();
  });
  el.ratio.addEventListener('input', () => {
    st.ratio = Number(el.ratio.value);
    st.equity = Math.round(st.price * (1 - st.ratio / 100));
    el.equity.value = fmt.format(st.equity);
    render();
  });
  for (const k of ['years', 'rate', 'grace', 'method', 'support']) el[k].addEventListener('input', render);
  el.method.addEventListener('change', render);
  render();
}

function scheduleSummary(m) {
  const mid = m.schedule.filter((s) => s.day !== null && s.day > 0);
  const groups = [];
  mid.forEach((s, k) => {
    const g = groups[groups.length - 1];
    if (g && g.pct === s.pct) { g.to = k + 2; g.dayTo = s.day; } else groups.push({ pct: s.pct, from: k + 2, to: k + 2, dayFrom: s.day, dayTo: s.day });
  });
  return groups.map((g) => (g.from === g.to ? `Đ${g.from}: ${g.pct}% (ngày ${g.dayFrom})` : `Đ${g.from} – Đ${g.to}: ${g.pct}%/đợt (ngày ${g.dayFrom} – ${fmt.format(g.dayTo)})`));
}

export function renderPtttTable(cfg) {
  const table = $('[data-pttt]');
  const methods = cfg.payment_methods || [];
  if (!table || !methods.length) { $('[data-pttt-wrap]')?.setAttribute('hidden', ''); return; }
  const row = (label, cells) => `<tr><th scope="row">${label}</th>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  table.innerHTML = `<thead><tr><th>Tiêu chí</th>${methods.map((m) => `<th>${esc(m.name)}</th>`).join('')}</tr></thead><tbody>${[
    row('Chiết khấu', methods.map((m) => `<b>${m.discount ? `${m.discount}%` : 'Không'}</b>`)),
    row('Đợt 1 (≤ 7 ngày, ký HĐ)', methods.map((m) => `${m.schedule[0]?.pct ?? '–'}%`)),
    row('Các đợt tiếp theo', methods.map((m) => scheduleSummary(m).map(esc).join('<br>') || '—')),
    row('Khi nhận Giấy chứng nhận', methods.map((m) => `${m.schedule.find((s) => s.day === null)?.pct ?? '–'}%`)),
    row('Vay ngân hàng &amp; HTLS', methods.map((m) => (m.loan ? 'Áp dụng' : 'Không'))),
  ].join('')}</tbody>`;
}

function initPttt(cfg) {
  const root = $('[data-calc="pttt"]');
  const methods = cfg.payment_methods || [];
  if (!root || !methods.length) return;
  const opts = $('[data-pttt-options]');
  opts.textContent = '';
  methods.forEach((m, k) => {
    const l = document.createElement('label'); l.className = 'chip';
    const i = document.createElement('input'); i.type = 'radio'; i.name = 'pttt'; i.value = m.id; if (!k) i.checked = true;
    const s = document.createElement('span'); s.textContent = `${m.name}${m.discount ? ` · CK ${m.discount}%` : ''}`;
    l.append(i, s); opts.append(l);
  });
  let price = 0;
  let used = false;
  const render = () => {
    const m = methods.find((x) => x.id === (opts.querySelector('input:checked')?.value)) || methods[0];
    const disc = price * (m.discount / 100);
    const net = price - disc;
    $('[data-p="discount"]').textContent = m.discount ? `${m.discount}% · ${money(disc)}` : 'Không áp dụng';
    $('[data-p="net"]').textContent = money(net);
    $('[data-p="first"]').textContent = money((net * (m.schedule[0]?.pct || 0)) / 100);
    const tbl = $('[data-pttt-table]');
    tbl.innerHTML = '<thead><tr><th>Đợt</th><th>Thời điểm</th><th>Tỷ lệ</th><th>Số tiền</th></tr></thead>';
    const body = document.createElement('tbody');
    for (const s of m.schedule) {
      const tr = document.createElement('tr');
      const when = s.day === null ? 'Khi nhận GCN' : s.day === 0 ? '≤ 7 ngày từ đặt cọc' : `Ngày thứ ${fmt.format(s.day)}`;
      for (const v of [s.label, when, `${s.pct}%`, money((net * s.pct) / 100)]) { const td = document.createElement('td'); td.textContent = v; tr.append(td); }
      body.append(tr);
    }
    tbl.append(body);
    const tf = document.createElement('tfoot');
    tf.innerHTML = `<tr><td>Tổng</td><td></td><td>100%</td><td>${money(net)}</td></tr>`;
    tbl.append(tf);
    if (!used && price) { used = true; }
  };
  bindMoney($('#pc-price'), (n) => { price = n; render(); });
  opts.addEventListener('change', () => { render(); track('calculator_use', { tool: 'payment_schedule', method: opts.querySelector('input:checked')?.value }); });
  render();
}

export function initCalculator(cfg) {
  initLoan(cfg);
  initPttt(cfg);
  renderPtttTable(cfg);
}
