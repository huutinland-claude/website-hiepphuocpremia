# Vận hành hằng ngày

## Phân quyền

| Vai trò | Quyền |
|---|---|
| Quản trị viên | Toàn quyền; tạo/khóa người dùng; sửa phương thức thanh toán |
| Trưởng nhóm | Xem mọi lead, phân công, xuất dữ liệu, nhập chi phí QC, sửa nội dung/chính sách/A/B |
| Chuyên viên | Chỉ xem & cập nhật lead được phân công cho mình |

Lead mới được chia **vòng tròn** cho người dùng đang hoạt động có bật "Nhận lead" (Trưởng nhóm/Chuyên viên). Tắt "Nhận lead" khi nhân viên nghỉ phép.

## Quy trình xử lý lead

1. Nhận thông báo (Telegram/email) → mở Dashboard → **Leads** → lọc *New Lead*.
2. Gọi/nhắn Zalo ngay từ chi tiết lead → ghi **lịch sử chăm sóc** (hệ thống tự tính thời gian phản hồi).
3. Cập nhật trạng thái theo phễu: New → Contacted → Qualified → Appointment → Visited → Booking → Converted (hoặc Lost + lý do).
4. *Qualified* = khách có nhu cầu thật và tài chính phù hợp → gửi tín hiệu chất lượng về Meta/GA4.

## Đo lường hiệu quả

- **Tổng quan**: lead, Qualified Lead Rate, Booking Conversion Rate, thời gian phản hồi, lead chưa liên hệ; bảng theo nguồn/chiến dịch.
- **CPL / Cost per Qualified Lead**: nhập chi phí tại *Chi phí quảng cáo* (theo `utm_source` + `utm_campaign`, khoảng ngày). Không nhập campaign = phân bổ cho cả nguồn theo số lead.
- Landing Page Views, Unique Visitors, CTA Clicks, tỷ lệ chuyển đổi trang: xem trong GA4 (sự kiện `page_view`, `cta_click`, `generate_lead`).

## Quy ước UTM

| Kênh | utm_source | utm_medium |
|---|---|---|
| Facebook / Instagram Ads | facebook / instagram | paid_social |
| TikTok Ads | tiktok | paid_social |
| Google Search / PMax | google | cpc |
| Zalo Ads | zalo | paid_social |
| Tờ rơi / standee / sự kiện (QR) | leaflet / standee / event | offline |
| Chia sẻ tự nhiên | (tự gắn) | social_share |

`utm_campaign`: viết thường, không dấu, ví dụ `hpp_t11_2026_lead_lienke`. Dùng **QR & UTM** trong Dashboard để tạo link + mã QR cho ấn phẩm.

## Sửa nội dung không cần sửa code

Dashboard → **Cấu hình nội dung**:
- Headline, subheadline, CTA, tiêu đề form, CTA cuối trang.
- Hotline, Zalo, địa chỉ Sales Gallery, link Google Maps.
- Chính sách bán hàng: bật/tắt, ngày hiệu lực, điều kiện. Chính sách tự ẩn khi hết hạn.
- Phương thức thanh toán dùng cho bảng so sánh và máy tính tài chính (admin).

Nội dung cập nhật lên trang trong khoảng 30 giây (cache).

## A/B test

Dashboard → **A/B test**. Có sẵn 6 thử nghiệm: `hero_copy` (headline), `cta_primary` (nút chính), `hero_image`, `form_length` (form đầy đủ / rút gọn), `lead_magnet` (lời mời của form chính), `form_position` (form ở hero / chỉ CTA). Mặc định đang chạy `hero_copy` và `cta_primary` 50/50.

- Mỗi khách được gán cố định một biến thể (lưu trên trình duyệt).
- Báo cáo: lượt xem (visitor/ngày) → lead → tỷ lệ chuyển đổi → qualified, theo từng biến thể.
- Xem trước biến thể: `/?ab_hero_copy=B`, `/?ab_form_position=below`…
- Chỉ kết luận khi mỗi biến thể có đủ dữ liệu (gợi ý ≥ 100 lead/biến thể hoặc dùng công cụ tính ý nghĩa thống kê); đổi `id` biến thể khi thay nội dung.

## Sao lưu

- Postgres: bật backup/PITR của nhà cung cấp (Neon/Supabase).
- SQLite (VPS): sao lưu file `data/leads.db` hằng ngày.
- Xuất Excel định kỳ từ Dashboard để lưu trữ nội bộ.
