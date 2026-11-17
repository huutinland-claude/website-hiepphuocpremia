/**
 * Hiệp Phước Premia – nhận lead từ website và ghi vào Google Sheet.
 *
 * Cài đặt: xem integrations/google-sheets/HUONG-DAN.md
 *  1. Tạo Google Sheet mới → Tiện ích mở rộng → Apps Script → dán toàn bộ file này.
 *  2. Chọn hàm `setup` → Chạy (cấp quyền) → xem Nhật ký thực thi để lấy WEBHOOK URL.
 *  3. Triển khai → Tùy chọn triển khai mới → Ứng dụng web
 *     (Thực thi với tư cách: Tôi · Người có quyền truy cập: Bất kỳ ai) → Triển khai.
 *  4. Chạy lại `setup` để in ra link webhook đầy đủ (đã có /exec + key).
 */

const SERVICE = 'hpp-leads';
const SHEET_NAME = 'Leads';
const TZ = 'Asia/Ho_Chi_Minh';

const COLUMNS = [
  ['Thời gian', (p) => Utilities.formatDate(new Date(p.lead.created_at || Date.now()), TZ, 'dd/MM/yyyy HH:mm:ss')],
  ['Họ tên', (p) => p.lead.full_name],
  ['SĐT', (p) => p.lead.phone],
  ['Email', (p) => p.lead.email],
  ['Nhu cầu', (p) => label(p, 'need')],
  ['Sản phẩm', (p) => label(p, 'product_interest')],
  ['Ngân sách', (p) => label(p, 'budget')],
  ['Liên hệ qua', (p) => label(p, 'contact_method')],
  ['Yêu cầu', (p) => label(p, 'lead_magnet')],
  ['Ưu tiên', (p) => p.lead.priority],
  ['Phụ trách', (p) => (p.assignee ? p.assignee.name : '')],
  ['Form', (p) => p.lead.form_id],
  ['utm_source', (p) => p.lead.utm_source],
  ['utm_medium', (p) => p.lead.utm_medium],
  ['utm_campaign', (p) => p.lead.utm_campaign],
  ['utm_content', (p) => p.lead.utm_content],
  ['utm_term', (p) => p.lead.utm_term],
  ['gclid', (p) => p.lead.gclid],
  ['fbclid', (p) => p.lead.fbclid],
  ['ttclid', (p) => p.lead.ttclid],
  ['Landing URL', (p) => p.lead.landing_url],
  ['Referrer', (p) => p.lead.referrer],
  ['Mở trong Dashboard', (p) => p.admin_url],
  ['Mã lead', (p) => p.lead.id],
];

function label(p, key) {
  return (p.labels && p.labels[key]) || p.lead[key] || '';
}

/** Chạy một lần: tạo khóa bí mật + sheet, in ra link webhook để dán vào Vercel. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('WEBHOOK_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('WEBHOOK_KEY', key);
  }
  getSheet_();
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    Logger.log('Chưa triển khai Ứng dụng web. Làm bước 3 rồi chạy lại setup.');
  } else {
    Logger.log('WEBHOOK URL (giữ bí mật):\n' + url + '?key=' + key);
  }
}

function doGet() {
  return json_({ ok: true, service: SERVICE });
}

function doPost(e) {
  const key = PropertiesService.getScriptProperties().getProperty('WEBHOOK_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) return json_({ ok: false, error: 'unauthorized' });

  let p;
  try {
    p = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  if (!p || p.event !== 'lead.created' || !p.lead || !p.lead.id) return json_({ ok: false, error: 'bad_payload' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    const idCol = COLUMNS.length;
    const last = sheet.getLastRow();
    if (last > 1) {
      const found = sheet.getRange(2, idCol, last - 1, 1).createTextFinder(p.lead.id).matchEntireCell(true).findNext();
      if (found) return json_({ ok: true, duplicate: true, row: found.getRow() });
    }
    const row = COLUMNS.map(([, fn]) => safe_(fn(p)));
    const r = sheet.getRange(last + 1, 1, 1, row.length);
    r.setNumberFormat('@'); // giữ số 0 đầu SĐT, không tự đổi kiểu dữ liệu
    r.setValues([row]);
    return json_({ ok: true, row: last + 1 });
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(([h]) => h));
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold').setBackground('#0f3d3e').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Chặn chèn công thức (=, +, -, @) từ dữ liệu người dùng nhập. */
function safe_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).slice(0, 2000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
