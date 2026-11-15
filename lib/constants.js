// Single source of truth for form options & lead pipeline. Exposed to the browser via /api/config.

export const NEEDS = {
  'dau-tu': 'Đầu tư',
  'mua-o': 'Mua ở',
  'kinh-doanh': 'Kinh doanh',
  'cho-thue': 'Cho thuê',
};

export const PRODUCTS = {
  'lien-ke': 'Liền kề phố 3 tầng',
  'nha-pho-tm': 'Nhà phố thương mại 4 tầng',
  'biet-thu': 'Biệt thự',
  'chua-xac-dinh': 'Chưa xác định / cần tư vấn',
};

export const BUDGETS = {
  'duoi-2': 'Dưới 2 tỷ',
  '2-3': '2 – 3 tỷ',
  '3-5': '3 – 5 tỷ',
  '5-8': '5 – 8 tỷ',
  'tren-8': 'Trên 8 tỷ',
  'chua-xac-dinh': 'Chưa xác định',
};

export const CONTACT_METHODS = {
  'goi-dien': 'Gọi điện',
  zalo: 'Zalo',
  email: 'Email',
  'gap-truc-tiep': 'Gặp trực tiếp tại Sales Gallery',
};

// What the visitor asked for (lead magnet / CTA intent)
export const LEAD_MAGNETS = {
  'bang-gia': 'Nhận bảng giá',
  'chinh-sach': 'Nhận chính sách bán hàng',
  'tham-quan': 'Đăng ký tham quan dự án',
  'tu-van': 'Gặp chuyên viên tư vấn',
  'tinh-toan': 'Nhận bảng tính tài chính',
};

export const STATUSES = {
  new: 'New Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  appointment: 'Appointment',
  visited: 'Visited',
  booking: 'Booking',
  converted: 'Converted',
  lost: 'Lost',
};

// Statuses that count as "qualified or better" for Qualified Lead Rate
export const QUALIFIED_SET = ['qualified', 'appointment', 'visited', 'booking', 'converted'];
export const BOOKING_SET = ['booking', 'converted'];

export const ROLES = {
  admin: 'Quản trị viên',
  manager: 'Trưởng nhóm',
  sales: 'Chuyên viên kinh doanh',
};

export const CONSENT_TEXT =
  'Tôi đồng ý để DKRA Realty và Chủ đầu tư dự án Hiệp Phước Premia thu thập, xử lý dữ liệu cá nhân ' +
  'tôi cung cấp nhằm liên hệ tư vấn, gửi thông tin dự án theo Nghị định 13/2023/NĐ-CP.';
