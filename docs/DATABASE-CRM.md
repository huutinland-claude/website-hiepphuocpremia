# Database schema, API & tích hợp CRM

Schema định nghĩa trong `lib/db.js` (tương thích SQLite và Postgres; thời gian lưu ISO-8601 UTC).

## Bảng `leads`

| Cột | Ý nghĩa |
|---|---|
| `id` | UUID lead |
| `submission_id` | UUID mỗi lần điền form (UNIQUE – chống gửi trùng khi double-click / retry) |
| `created_at`, `updated_at` | Thời gian đăng ký / cập nhật |
| `full_name`, `phone` (chuẩn hóa `0xxxxxxxxx`), `email` | Thông tin liên hệ |
| `need` | `dau-tu` · `mua-o` · `kinh-doanh` · `cho-thue` |
| `product_interest` | `lien-ke` · `nha-pho-tm` · `biet-thu` · `chua-xac-dinh` |
| `budget` | `duoi-2` · `2-3` · `3-5` · `5-8` · `tren-8` · `chua-xac-dinh` |
| `contact_method` | `goi-dien` · `zalo` · `email` · `gap-truc-tiep` |
| `lead_magnet` | `bang-gia` · `chinh-sach` · `tham-quan` · `tu-van` · `tinh-toan` |
| `form_id` | `hero` · `main` · `popup` |
| `consent`, `consent_text` | Đồng ý xử lý dữ liệu (bắt buộc) + nội dung câu đồng ý tại thời điểm gửi |
| `status` | `new` · `contacted` · `qualified` · `appointment` · `visited` · `booking` · `converted` · `lost` |
| `priority` | `hot` / `warm` / `cold` – chấm điểm tự động theo ngân sách, nhu cầu, yêu cầu tham quan |
| `assigned_to`, `assigned_at` | Nhân viên phụ trách (round-robin) |
| `first_response_at` | Lần phản hồi đầu tiên (đổi trạng thái khỏi New hoặc ghi nhận cuộc gọi/Zalo/email/gặp) |
| `qualified_at`, `lost_reason`, `duplicate_of` | Mốc Qualified, lý do Lost, lead cũ cùng SĐT |
| `utm_source` … `utm_term`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `ttclid` | Attribution (last non-direct touch, 30 ngày) |
| `fbp`, `fbc`, `ga_client_id` | Định danh quảng cáo để gửi conversion server-side |
| `referrer`, `landing_url`, `first_touch` (JSON) | Trang đích, nguồn giới thiệu, first touch 90 ngày |
| `ab_variants` (JSON) | Biến thể A/B khách đã thấy |
| `ip_hash`, `user_agent` | IP băm một chiều (chống spam), trình duyệt |
| `event_id`, `capi_status`, `notify_status` | Mã sự kiện dedup, kết quả CAPI, kết quả thông báo |
| `search_text` | Tên/SĐT/email bỏ dấu để tìm kiếm |

Các bảng khác: `lead_activities` (lịch sử chăm sóc & thay đổi), `users` (tài khoản + vai trò), `settings` (nội dung chỉnh từ Dashboard), `ab_exposures` (lượt xem theo biến thể/ngày), `ad_spend` (chi phí QC), `rate_events` (giới hạn tần suất).

## Quy tắc tiếp nhận lead (`lib/leads.js`)

1. Honeypot, thời gian điền < 1,5 giây, Turnstile (nếu bật) → từ chối.
2. Giới hạn 5 lần/10 phút và 20 lần/ngày cho mỗi IP.
3. Validate: họ tên, SĐT Việt Nam (di động 10 số / cố định 11 số, chấp nhận +84), email, đồng ý xử lý dữ liệu.
4. Cùng `submission_id` → trả về lead cũ (idempotent).
5. Cùng SĐT trong 30 phút → gộp thông tin mới vào lead cũ, ghi lịch sử, **không** tạo conversion mới.
6. Lưu database → phân công → gửi CAPI + thông báo (song song, tối đa 4 giây) → trả kết quả. Trình duyệt chỉ chuyển sang `/cam-on` khi nhận được `id` lead đã lưu.

## API

Công khai: `GET /api/config`, `POST /api/leads`, `POST /api/ab`, `GET /api/qr`, `GET /api/health`.

Quản trị (cookie phiên + header `X-Requested-With: hpp-admin` với request thay đổi dữ liệu):
`POST /api/admin/login|logout`, `GET /api/admin/me`, `GET /api/admin/leads`, `GET|PATCH /api/admin/lead`, `POST /api/admin/lead-note`, `GET /api/admin/stats`, `GET /api/admin/export?format=xlsx|csv`, `GET /api/admin/export-google-ads`, `GET|PUT|DELETE /api/admin/settings`, `GET|POST|PATCH /api/admin/users`, `GET|POST|DELETE /api/admin/spend`.

## Tích hợp CRM / Zalo OA qua Webhook

Đặt `LEAD_WEBHOOK_URL` (vd. n8n, Make, Zapier, API CRM nội bộ) và `LEAD_WEBHOOK_SECRET`. Mỗi lead mới gửi `POST` JSON:

```json
{
  "event": "lead.created",
  "lead": { "id": "…", "created_at": "…", "full_name": "…", "phone": "09…", "need": "dau-tu", "utm_source": "facebook", "…": "…" },
  "assignee": { "id": "…", "name": "…", "email": "…" }
}
```

Header `X-Signature: sha256=<HMAC-SHA256(body, LEAD_WEBHOOK_SECRET)>` để bên nhận xác thực. Từ workflow này có thể gửi tin Zalo OA (qua API chính thức của Zalo OA), tạo deal trong CRM, v.v.

Thông báo sẵn có: Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) và email qua Resend (`RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `NOTIFY_EMAIL_TO` – email nhân viên được phân công cũng được thêm vào người nhận).
