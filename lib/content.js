// Editable content (headline, CTA, contact, sales policies, payment methods, A/B tests).
// Defaults below are transcribed from the official documents in the project folder:
//   TB50, TB51, TB52 (12/10/2026), TB55 (25/10/2026), HPP_TRAINING_DKRA_T11.2026.
// Admins override any key from Dashboard → Cấu hình (stored in the `settings` table) without touching code.
import { getDb, nowIso } from './db.js';
import * as C from './constants.js';

const SALES_GALLERY = 'Sales Gallery Hiệp Phước Premia – Đường Nguyễn Văn Tạo, xã Tân Tập, tỉnh Tây Ninh';

export const DEFAULTS = {
  content: {
    badge: 'Chính sách bán hàng T11/2026',
    headline: 'Đô thị sinh thái ven sông Soài Rạp – cửa ngõ phía Nam TP.HCM',
    subheadline:
      'Khu đô thị thấp tầng ~80 ha với 2.496 sản phẩm liền kề, nhà phố thương mại, biệt thự và hơn 40 tiện ích nội khu. Thanh toán 20% ký hợp đồng, giãn tiến độ đến 36 tháng.',
    cta_primary: 'NHẬN BẢNG GIÁ & TƯ VẤN',
    cta_secondary: 'KHÁM PHÁ DỰ ÁN',
    form_title: 'Nhận bảng giá & chính sách mới nhất',
    form_subtitle: 'Chuyên viên DKRA Realty liên hệ trong giờ làm việc. Thông tin của bạn được bảo mật.',
    final_headline: 'ĐĂNG KÝ NGAY ĐỂ NHẬN THÔNG TIN HIỆP PHƯỚC PREMIA',
    final_subheadline: 'Bảng giá, chính sách bán hàng, lịch tham quan Sales Gallery và tư vấn phương án tài chính phù hợp với bạn.',
  },
  contact: {
    hotline: '',
    zalo_phone: '',
    zalo_url: '',
    sales_gallery: SALES_GALLERY,
    maps_url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Hiệp Phước Premia, Nguyễn Văn Tạo, Tân Tập'),
  },
  policies: [
    {
      id: 'tb52-pttt', source: 'TB52/2026/TB-DVKH/DKRA/HPP', icon: 'wallet', active: true,
      title: '4 phương thức thanh toán linh hoạt',
      summary: 'Ký hợp đồng chỉ 20% – giãn đến 36 tháng, hoặc thanh toán nhanh để nhận chiết khấu đến 10%.',
      details: [
        'Chuẩn 36 tháng: đợt 1 20%, sau đó 5%/60 ngày – không chiết khấu, được áp dụng vay ngân hàng & hỗ trợ lãi suất.',
        'Nhanh 18 tháng: chiết khấu 3%.',
        'Nhanh 06 tháng: chiết khấu 6%.',
        'Thanh toán 98% một lần: chiết khấu 10%; 2% còn lại khi nhận Giấy chứng nhận.',
      ],
      conditions: 'Chiết khấu tính trên giá bán đã gồm VAT. Chiết khấu thanh toán nhanh không áp dụng đồng thời với hỗ trợ lãi suất.',
      valid_from: '2026-10-12', valid_to: '', valid_note: 'Đến khi có thông báo mới thay thế',
    },
    {
      id: 'tb52-htls', source: 'TB52/2026/TB-DVKH/DKRA/HPP', icon: 'bank', active: true,
      title: 'Hỗ trợ lãi suất khi vay ngân hàng',
      summary: 'CĐT hỗ trợ lãi suất tối đa 10%/năm cho khoản vay tối đa 70% giá trị sản phẩm, tối đa 12 tháng.',
      details: [
        'Áp dụng cho phương thức thanh toán chuẩn 36 tháng có vay ngân hàng.',
        'Ngân hàng đối tác: MB, ACB, VietinBank. Ân hạn nợ gốc theo chính sách từng ngân hàng.',
        'Ngân hàng giải ngân sau khi khách hàng thanh toán đủ phần vốn tự có.',
        'Người nhận chuyển nhượng được kế thừa thời gian hỗ trợ lãi suất còn lại.',
      ],
      conditions: 'Hồ sơ vay do ngân hàng thẩm định và phê duyệt. Trường hợp không đủ điều kiện vay, hỗ trợ theo tỷ lệ ngân hàng duyệt.',
      valid_from: '2026-10-12', valid_to: '', valid_note: 'Đến khi có thông báo mới thay thế',
    },
    {
      id: 'tb55-lien-hoan', source: 'TB55/2026/TB-DVKH/DKRA/HPP', icon: 'gift', active: true,
      title: 'Ưu đãi liên hoàn',
      summary: 'Chiết khấu 4% trừ trực tiếp vào giá bán và Cashback 30.000.000đ cho mỗi giao dịch thành công.',
      details: [
        'Chiết khấu 4% tính trên giá bán công bố đã gồm VAT.',
        'Cashback 30.000.000đ chuyển khoản sau khi giao dịch thành công.',
        '“Nâng tầm cashback” thêm 20.000.000đ khi giao dịch từ 02 sản phẩm hoặc thanh toán tối thiểu 30% giá trị hợp đồng tại đợt 1.',
      ],
      conditions: 'Giao dịch thành công = ký Phiếu xác nhận + ký hợp đồng + thanh toán đủ 100% đợt 1 đúng hạn.',
      valid_from: '2026-10-25', valid_to: '', valid_note: 'Đến khi có thông báo mới thay thế',
    },
    {
      id: 'tb51-x3', source: 'TB51/2026/TB-PTKD/DKRA/HPP', icon: 'bolt', active: true,
      title: 'Booking siêu tốc – X3 giá trị',
      summary: 'Booking 20 triệu được trừ 60 triệu vào giá bán.',
      details: ['Áp dụng cho booking thành công từ 12/10 đến 25/10/2026.'],
      conditions: 'Khách hàng thanh toán đủ đợt 1 và ký hợp đồng đúng hạn.',
      valid_from: '2026-10-12', valid_to: '2026-10-25', valid_note: '',
    },
    {
      id: 'tb51-x2', source: 'TB51/2026/TB-PTKD/DKRA/HPP', icon: 'bolt', active: true,
      title: 'Booking siêu tốc – X2 giá trị',
      summary: 'Booking 20.000.000đ được trừ 40.000.000đ trực tiếp vào giá bán.',
      details: ['Booking thành công = thanh toán đủ 20.000.000đ và ký Phiếu đăng ký tìm hiểu thông tin.'],
      conditions: 'Khách hàng thanh toán đủ đợt 1 và ký hợp đồng đúng hạn. Không quy đổi thành tiền mặt.',
      valid_from: '2026-10-26', valid_to: '', valid_note: 'Đến trước ngày mở bán (theo thông báo chính thức của CĐT)',
    },
    {
      id: 'tb51-an-cu', source: 'TB51/2026/TB-PTKD/DKRA/HPP', icon: 'shield', active: true,
      title: 'Bảo chứng an cư',
      summary: 'CĐT tài trợ chi phí cấp sổ (lệ phí trước bạ, phí công chứng) và miễn phí chuyển nhượng lần đầu.',
      details: ['Miễn phí chuyển nhượng lần đầu áp dụng cho sản phẩm chưa hoàn tất công chứng sang tên Giấy chứng nhận từ CĐT.'],
      conditions: 'Dành cho khách hàng booking thành công; thanh toán đủ đợt 1 và ký hợp đồng đúng hạn. Không quy đổi thành tiền mặt.',
      valid_from: '2026-10-12', valid_to: '', valid_note: 'Đến trước ngày mở bán (theo thông báo chính thức của CĐT)',
    },
    {
      id: 'tb52-si', source: 'TB52/2026/TB-DVKH/DKRA/HPP', icon: 'stack', active: true,
      title: 'Chiết khấu mua sỉ',
      summary: 'Chiết khấu 1%/sản phẩm khi mua 02–05 sản phẩm; 1,5%/sản phẩm khi mua từ 06 sản phẩm.',
      details: ['Áp dụng cho cùng một cá nhân hoặc thành viên gia đình (vợ/chồng, cha mẹ, con, anh chị em ruột).', 'Khách hàng hiện hữu mua thêm được áp dụng cùng mức, không hồi tố giao dịch cũ.'],
      conditions: 'Khách hàng mới mua từ 02 sản phẩm kể từ 08/11/2026.',
      valid_from: '2026-11-08', valid_to: '', valid_note: 'Đến khi có thông báo mới thay thế',
    },
    {
      id: 'tb50-checkin', source: 'TB50/2026/TB-DVKH/DKRA/HPP', icon: 'pin', active: true,
      title: 'Check-in cuối tuần – nhận voucher 5 triệu',
      summary: 'Tham quan Sales Gallery 8h30 – 10h00 cuối tuần, nhận voucher 5.000.000đ khi giao dịch thành công.',
      details: [`Địa điểm: ${SALES_GALLERY}.`, 'Tối đa 25 voucher/tuần, 01 sản phẩm/khách hàng.'],
      conditions: 'Voucher trừ vào giá bán đã gồm VAT, không quy đổi thành tiền mặt, không chuyển nhượng.',
      valid_from: '2026-10-18', valid_to: '', valid_note: 'Đến trước tuần tổ chức sự kiện mở bán',
    },
  ],
  payment_methods: [
    {
      id: 'std36', name: 'Chuẩn 36 tháng', discount: 0, loan: true,
      schedule: [
        { label: 'Đợt 1 – ký hợp đồng (≤ 7 ngày, gồm 20 triệu booking)', day: 0, pct: 20 },
        ...Array.from({ length: 14 }, (_, i) => ({ label: `Đợt ${i + 2}`, day: 60 * (i + 1), pct: 5 })),
        ...Array.from({ length: 4 }, (_, i) => ({ label: `Đợt ${i + 16}`, day: 900 + 60 * i, pct: 2 })),
        { label: 'Khi nhận Giấy chứng nhận', day: null, pct: 2 },
      ],
    },
    {
      id: 'f18', name: 'Nhanh 18 tháng', discount: 3, loan: false,
      schedule: [
        { label: 'Đợt 1 – ký hợp đồng (≤ 7 ngày)', day: 0, pct: 20 },
        ...[60, 120, 180].map((d, i) => ({ label: `Đợt ${i + 2}`, day: d, pct: 10 })),
        ...[240, 300, 360, 420, 480, 540].map((d, i) => ({ label: `Đợt ${i + 5}`, day: d, pct: 8 })),
        { label: 'Khi nhận Giấy chứng nhận', day: null, pct: 2 },
      ],
    },
    {
      id: 'f6', name: 'Nhanh 06 tháng', discount: 6, loan: false,
      schedule: [
        { label: 'Đợt 1 – ký hợp đồng (≤ 7 ngày)', day: 0, pct: 20 },
        ...[45, 90, 135].map((d, i) => ({ label: `Đợt ${i + 2}`, day: d, pct: 20 })),
        { label: 'Đợt 5', day: 180, pct: 18 },
        { label: 'Khi nhận Giấy chứng nhận', day: null, pct: 2 },
      ],
    },
    {
      id: 'one98', name: 'Thanh toán 98%', discount: 10, loan: false,
      schedule: [
        { label: 'Đợt 1 – ký hợp đồng (≤ 7 ngày)', day: 0, pct: 98 },
        { label: 'Khi nhận Giấy chứng nhận', day: null, pct: 2 },
      ],
    },
  ],
  loan_support: { max_rate: 10, max_ratio: 70, max_months: 12, source: 'TB52/2026/TB-DVKH/DKRA/HPP' },
  ab_tests: {
    hero_copy: {
      active: true, label: 'Headline hero',
      variants: [
        { id: 'A', weight: 50, headline: 'Đô thị sinh thái ven sông Soài Rạp – cửa ngõ phía Nam TP.HCM' },
        { id: 'B', weight: 50, headline: 'Nhà phố ven sông khu Nam – ký hợp đồng chỉ 20%, giãn 36 tháng' },
      ],
    },
    cta_primary: {
      active: true, label: 'Nút CTA chính',
      variants: [
        { id: 'A', weight: 50, cta: 'NHẬN BẢNG GIÁ & TƯ VẤN' },
        { id: 'B', weight: 50, cta: 'NHẬN BẢNG GIÁ T11/2026' },
      ],
    },
    hero_image: {
      active: false, label: 'Ảnh hero',
      variants: [
        { id: 'A', weight: 50, image: 'hero-a' },
        { id: 'B', weight: 50, image: 'hero-b' },
      ],
    },
    form_length: {
      active: false, label: 'Độ dài form chính',
      variants: [
        { id: 'full', weight: 50 },
        { id: 'short', weight: 50 },
      ],
    },
    lead_magnet: {
      active: false, label: 'Lead magnet của form',
      variants: [
        { id: 'bang-gia', weight: 50, title: 'Nhận bảng giá & chính sách mới nhất' },
        { id: 'tinh-toan', weight: 50, title: 'Nhận bảng tính dòng tiền theo ngân sách của bạn' },
      ],
    },
    form_position: {
      active: false, label: 'Vị trí form trên mobile',
      variants: [
        { id: 'hero', weight: 50 },
        { id: 'below', weight: 50 },
      ],
    },
  },
};

export const SETTING_KEYS = Object.keys(DEFAULTS);

let cache = null;
let cacheAt = 0;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < 30_000) return cache;
  const db = await getDb();
  const rows = await db.all('SELECT key, value, updated_at, updated_by FROM settings');
  const stored = Object.fromEntries(rows.map((r) => { try { return [r.key, JSON.parse(r.value)]; } catch { return [r.key, null]; } }));
  const envContact = Object.fromEntries(
    Object.entries({ hotline: process.env.HOTLINE, zalo_phone: process.env.ZALO_PHONE, zalo_url: process.env.ZALO_URL }).filter(([, v]) => v),
  );
  const out = {};
  for (const key of SETTING_KEYS) {
    const def = DEFAULTS[key];
    const val = stored[key];
    if (Array.isArray(def)) out[key] = Array.isArray(val) ? val : def;
    else out[key] = { ...def, ...(key === 'contact' ? envContact : {}), ...(val && typeof val === 'object' ? val : {}) };
  }
  out._meta = Object.fromEntries(rows.map((r) => [r.key, { updated_at: r.updated_at, updated_by: r.updated_by }]));
  cache = out;
  cacheAt = Date.now();
  return out;
}

export async function saveSetting(key, value, userEmail) {
  if (!SETTING_KEYS.includes(key)) throw new Error('Unknown setting');
  const db = await getDb();
  const json = JSON.stringify(value);
  const updated = await db.run('UPDATE settings SET value = $1, updated_at = $2, updated_by = $3 WHERE key = $4', [json, nowIso(), userEmail, key]);
  if (!updated.changes) await db.run('INSERT INTO settings (key, value, updated_at, updated_by) VALUES ($1,$2,$3,$4)', [key, json, nowIso(), userEmail]);
  cache = null;
}

export async function resetSetting(key) {
  const db = await getDb();
  await db.run('DELETE FROM settings WHERE key = $1', [key]);
  cache = null;
}

/** Today's date in Vietnam (YYYY-MM-DD). */
export function todayVN() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function isPolicyLive(p, today = todayVN()) {
  if (!p.active) return false;
  if (p.valid_from && today < p.valid_from) return false;
  if (p.valid_to && today > p.valid_to) return false;
  return true;
}

export async function publicConfig() {
  const s = await getSettings();
  const today = todayVN();
  const env = process.env;
  return {
    content: s.content,
    contact: s.contact,
    policies: s.policies.filter((p) => isPolicyLive(p, today)),
    payment_methods: s.payment_methods,
    loan_support: s.loan_support,
    ab_tests: Object.fromEntries(Object.entries(s.ab_tests).map(([k, t]) => [k, { active: !!t.active, variants: t.variants }])),
    options: { needs: C.NEEDS, products: C.PRODUCTS, budgets: C.BUDGETS, contact_methods: C.CONTACT_METHODS, lead_magnets: C.LEAD_MAGNETS },
    consent_text: C.CONSENT_TEXT,
    tracking: {
      gtm_id: env.GTM_ID || '',
      ga4_id: env.GA4_MEASUREMENT_ID || '',
      google_ads_id: env.GOOGLE_ADS_ID || '',
      google_ads_lead_label: env.GOOGLE_ADS_LEAD_LABEL || '',
      meta_pixel_id: env.META_PIXEL_ID || '',
    },
    turnstile_site_key: env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY ? env.TURNSTILE_SITE_KEY : '',
    today,
  };
}
