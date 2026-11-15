# Checklist kiểm thử trước khi chạy quảng cáo

Ký hiệu: **[x]** đã kiểm thử thực tế trong môi trường local (15/11/2026) · **[ ]** chưa kiểm thử – cần làm trên môi trường thật sau khi có tài khoản/khóa.

## Đã kiểm thử (local)

- [x] Giao diện Desktop (1024px) – 11 section hiển thị, không tràn ngang
- [x] Giao diện Mobile (375px) – hero, form, bottom-sheet, thanh CTA dính, máy tính tài chính; không tràn ngang
- [x] Form gửi dữ liệu thành công (form hero + form bottom-sheet "Đăng ký tham quan")
- [x] Dữ liệu được lưu thực tế (SQLite) kèm UTM, fbclid → fbc, landing URL, first touch, A/B variant, event_id
- [x] Validate: tên, SĐT (chuẩn hóa +84 → 0…), email, đồng ý xử lý dữ liệu; lỗi hiển thị tại trường
- [x] Chống spam: honeypot, gửi quá nhanh, giới hạn 5 lần/10 phút/IP (test tự động)
- [x] Chống trùng: double-submit (idempotent `submission_id`), cùng SĐT trong 30 phút gộp vào lead cũ, không bắn conversion lần hai
- [x] Trang cảm ơn: chỉ bắn `generate_lead`/`schedule_visit` một lần; reload hoặc vào trực tiếp không bắn
- [x] Lead event chỉ bắn sau khi server lưu thành công; bấm CTA không bắn Lead (unit test)
- [x] Pixel dùng cùng `event_id` với CAPI; PII được băm SHA-256 trước khi gửi CAPI (unit test, không gọi Meta thật)
- [x] Chế độ GTM không tải thêm gtag (unit test)
- [x] Dashboard: đăng nhập, KPI, danh sách, tìm kiếm không dấu, lọc, chi tiết, đổi trạng thái → Qualified, ghi lịch sử chăm sóc, thời gian phản hồi
- [x] Phân quyền: chuyên viên chỉ thấy lead của mình, không xuất được dữ liệu, không vào cấu hình (test tự động)
- [x] Xuất Excel (.xlsx), CSV (UTF-8 BOM), file Google Ads offline conversion (test tự động)
- [x] Cấu hình: chặn lưu chính sách thiếu ngày hiệu lực/điều kiện, PTTT tổng ≠ 100% (test tự động)
- [x] Chính sách hết hạn tự ẩn (Booking X3 hết hạn 25/10/2026 không hiển thị)
- [x] Toàn bộ test API chạy trên cả SQLite và Postgres (PGlite) – 13/13 + 2/2 unit test
- [x] Không lỗi JavaScript trên console (landing, cảm ơn, dashboard) – chỉ có phản hồi 401 mong đợi khi mở /admin chưa đăng nhập
- [x] QR code sinh đúng link UTM

## Cần kiểm thử trên môi trường thật

- [ ] Tablet (768–1024px) trên thiết bị thật; Safari iOS, trình duyệt trong app Facebook/Zalo/TikTok
- [x] Deploy Vercel + Neon Postgres (15/11/2026, https://website-hiepphuocpremia.vercel.app): `/api/health` trả `"db":"postgres"`; gửi form desktop + mobile → chuyển `/cam-on`; robots/sitemap/canonical đúng tên miền; trang 404 đúng
- [ ] Đăng nhập `/admin` trên production, thấy 2 lead "TEST Claude…" (đánh dấu Lost sau khi kiểm tra); xóa `ADMIN_EMAIL`/`ADMIN_PASSWORD` khỏi env Vercel
- [ ] Meta Pixel: Pixel Helper thấy PageView/ViewContent/Contact; Test Events thấy Lead/CompleteRegistration/Schedule từ Browser **và** Server, trạng thái Deduplicated
- [ ] Meta CAPI: cột "Meta CAPI" trong lead = `ok:1`; Event Match Quality ≥ 6
- [ ] GA4: DebugView thấy `page_view`, `cta_click`, `form_start`, `generate_lead`; đánh dấu Key event
- [ ] Google Ads conversion: Tag Assistant thấy conversion trên `/cam-on` với transaction_id; trạng thái "Recording conversions"
- [ ] Zalo: nút Zalo mở đúng OA/số (sau khi cấu hình)
- [ ] Hotline: nút gọi mở trình gọi điện với đúng số (sau khi cấu hình)
- [ ] Thông báo lead: Telegram/email/webhook nhận được (sau khi cấu hình)
- [ ] Tốc độ tải: PageSpeed Insights mobile trên tên miền thật (mục tiêu LCP < 2,5 s)
- [ ] SEO: Rich Results Test (FAQ), Facebook Sharing Debugger / Zalo preview hiển thị ảnh OG; Search Console + sitemap
- [ ] Bảo mật: securityheaders.com đạt A; đổi mật khẩu admin mặc định, xóa `ADMIN_PASSWORD` khỏi env
- [ ] Nội dung: pháp chế duyệt câu đồng ý xử lý dữ liệu, chính sách bảo mật, thông tin pháp lý, chính sách bán hàng còn hiệu lực
- [ ] Gửi 1 lead thật end-to-end mỗi nguồn (Facebook, TikTok, Google) với UTM thật, kiểm tra hiển thị đúng nguồn trong Dashboard

## Lệnh kiểm thử tự động

```bash
npm test
```
