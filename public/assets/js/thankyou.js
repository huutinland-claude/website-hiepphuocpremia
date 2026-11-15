// Thank-you page: fires the Lead conversion exactly once, only when the form flow confirmed a database save.
import { initTracking, trackLeadConversion, track } from './tracking.js';
import { applyContact, initClickTracking } from './ui.js';
import { store } from './storage.js';

const conv = store.get('hpp_conv', true);
const $ = (s) => document.querySelector(s);

const COPY = {
  'tham-quan': ['Đã nhận đăng ký tham quan!', 'Chuyên viên sẽ gọi xác nhận lịch tham quan Sales Gallery và hướng dẫn đường đi cho bạn.'],
  'chinh-sach': ['Đã nhận yêu cầu chính sách!', 'Chuyên viên sẽ gửi chính sách bán hàng đang áp dụng và giải đáp điều kiện chi tiết.'],
  'tu-van': ['Đã nhận yêu cầu tư vấn!', 'Chuyên viên sẽ liên hệ để tư vấn 1:1 về sản phẩm, pháp lý và phương án tài chính.'],
  'tinh-toan': ['Đã nhận yêu cầu bảng tính!', 'Chuyên viên sẽ gửi bảng dòng tiền chi tiết theo căn và phương thức thanh toán bạn quan tâm.'],
  'bang-gia': ['Cảm ơn bạn đã đăng ký!', 'Chuyên viên DKRA Realty sẽ gửi bảng giá, giỏ hàng cập nhật và tư vấn phương án phù hợp.'],
};

if (conv) {
  const [title, text] = COPY[conv.magnet] || COPY['bang-gia'];
  $('[data-ty-title]').textContent = conv.name ? `${title.replace('!', '')}, ${conv.name}!` : title;
  $('[data-ty-text]').textContent = conv.repeat
    ? 'Chúng tôi đã ghi nhận thông tin của bạn trước đó và cập nhật thêm yêu cầu mới. Chuyên viên sẽ sớm liên hệ.'
    : text;
} else {
  // Direct visit without a confirmed submission: neutral page, no conversion.
  $('[data-ty-title]').textContent = 'Đăng ký nhận thông tin Hiệp Phước Premia';
  $('[data-ty-text]').textContent = 'Bạn chưa gửi biểu mẫu đăng ký trong phiên này. Vui lòng quay lại trang dự án để để lại thông tin.';
  $('[data-ty-icon]').hidden = true;
  $('[data-ty-steps]').hidden = true;
}

initClickTracking();
try {
  const r = await fetch('/api/config');
  const cfg = await r.json();
  initTracking(cfg.tracking);
  applyContact(cfg.contact);
} catch { /* tracking unavailable; page still works */ }

if (conv && !conv.fired) {
  if (conv.event_id && !conv.repeat) {
    trackLeadConversion({ eventId: conv.event_id, schedule: conv.schedule, magnet: conv.magnet, formId: conv.form_id, product: conv.product });
  } else {
    track('lead_resubmit', { form_id: conv.form_id, lead_magnet: conv.magnet });
  }
  // keep copy for refresh, but never fire twice
  store.set('hpp_conv', { ...conv, fired: true }, true);
}
