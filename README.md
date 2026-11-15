# Hiệp Phước Premia – High-Conversion Landing Page & Lead System

Landing page Performance Marketing cho dự án **Hiệp Phước Premia** (Hai Thành Group · CĐT: Công ty TNHH Đầu tư Hồng Phước Long An · Tổng đại lý: DKRA Realty), kèm hệ thống thu thập – phân loại – quản lý lead và tracking quảng cáo.

| Thành phần | Mô tả |
|---|---|
| Landing page | 11 section theo CRO funnel, mobile-first, ảnh WebP/AVIF lazy-load, không framework |
| Form lead | 3 vị trí (hero, form chính, bottom-sheet theo CTA), validate, chống trùng, chống spam, lưu UTM |
| Backend API | Node.js, 1 serverless function (`api/router.js`) – chạy y hệt local và trên Vercel |
| Database | SQLite tích hợp sẵn (local/VPS) hoặc Postgres (Vercel – Neon/Supabase) |
| Dashboard | `/admin` – KPI, lead, lịch sử chăm sóc, phân công, xuất Excel/CSV, chi phí QC, A/B, cấu hình nội dung, phân quyền, QR |
| Tracking | GTM hoặc gtag (GA4 + Google Ads), Meta Pixel + Conversions API dedup `event_id`, GA4 Measurement Protocol |
| Trang cảm ơn | `/cam-on` – bắn conversion **một lần**, chỉ khi server đã lưu lead |

---

## 1. Chạy local

Yêu cầu: **Node.js ≥ 22.13** (đã thử với Node 26).

```bash
npm install
```

```bash
copy .env.example .env
```

Mở `.env`, điền tối thiểu `SESSION_SECRET` (chuỗi ngẫu nhiên ≥ 32 ký tự), `IP_HASH_SALT`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 10 ký tự). Tạo chuỗi ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

```bash
npm run dev
```

- Landing: http://localhost:3000
- Dashboard: http://localhost:3000/admin (tài khoản admin đầu tiên được tạo tự động từ `ADMIN_EMAIL` / `ADMIN_PASSWORD` khi database chưa có user).
- Dữ liệu local nằm ở `data/leads.db` (SQLite).

Chạy kiểm thử tự động (database tạm, không đụng dữ liệu thật):

```bash
npm test
```

Chạy cùng bộ test trên Postgres (database trống, dùng một lần):

```bash
set TEST_DATABASE_URL=postgres://user:pass@host:5432/hpp_test && npm test
```

## 2. Cấu trúc thư mục

```
landing-page/
├─ api/router.js            # 1 serverless function cho mọi /api/*
├─ lib/
│  ├─ db.js                 # adapter SQLite / Postgres + schema
│  ├─ leads.js              # tiếp nhận lead: chống spam, dedup, phân công, CAPI, thông báo
│  ├─ content.js            # nội dung + chính sách + PTTT + A/B mặc định (sửa được trong Dashboard)
│  ├─ constants.js          # danh mục form, trạng thái lead, câu đồng ý xử lý dữ liệu
│  ├─ tracking.js           # Meta CAPI + GA4 Measurement Protocol (server)
│  ├─ notify.js             # Telegram / Email (Resend) / Webhook CRM
│  ├─ auth.js, ratelimit.js, validate.js, http.js, xlsx.js, headers.js
│  └─ routes/{public,admin}.js
├─ public/                  # nguồn web tĩnh (build -> dist/)
│  ├─ index.html, cam-on.html, chinh-sach-bao-mat.html, 404.html
│  ├─ admin/                # Dashboard
│  └─ assets/{css,js,img}
├─ scripts/build.mjs        # chèn SITE_URL vào canonical / OG / sitemap
├─ scripts/create-admin.mjs
├─ scripts/serve.mjs        # server local / VPS (không đặt ở thư mục gốc để Vercel không nhận nhầm là entrypoint)
├─ tests/                   # node:test
├─ docs/                    # hướng dẫn chi tiết
└─ vercel.json
```

## 3. Tài liệu chi tiết

- [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md) – triển khai Vercel + Postgres, tên miền, VPS
- [docs/META-PIXEL-CAPI.md](docs/META-PIXEL-CAPI.md) – cấu hình Meta Pixel & Conversions API
- [docs/GOOGLE-GA4-GTM-ADS.md](docs/GOOGLE-GA4-GTM-ADS.md) – GTM, GA4, Google Ads conversion, offline conversion
- [docs/DATABASE-CRM.md](docs/DATABASE-CRM.md) – schema database, API, webhook tích hợp CRM / Zalo OA
- [docs/VAN-HANH.md](docs/VAN-HANH.md) – vận hành Dashboard, UTM, A/B test, chỉnh nội dung
- [docs/QA-CHECKLIST.md](docs/QA-CHECKLIST.md) – checklist kiểm thử trước khi chạy quảng cáo (kèm trạng thái đã test)

## 4. Nguồn nội dung & nguyên tắc

Toàn bộ số liệu trên trang lấy từ tài liệu trong thư mục dự án: `HPP_TRAINING_DKRA_T11.2026`, E-Leaflet, TB50/TB51/TB52 (12/10/2026), TB55 (25/10/2026), file hạ tầng (link nguồn báo chí). Ảnh phối cảnh trích từ `HPP_Thông tin dự án.pptx`.

- Không hiển thị giá bán; không cam kết tăng giá / lợi nhuận / thanh khoản.
- Hạ tầng ghi rõ trạng thái (đã thông xe / đang triển khai / quy hoạch) và nguồn.
- Chính sách bán hàng có ngày hiệu lực + điều kiện; chính sách hết hạn **tự ẩn** (ví dụ Booking X3 hết 25/10/2026).
- Hotline/Zalo **để trống** cho tới khi có số chính thức – các nút tự ẩn, không dùng số giả.

## 5. Thông tin cần bổ sung trước khi chạy quảng cáo

| Hạng mục | Nơi cấu hình | Ghi chú |
|---|---|---|
| Tên miền chính thức | `SITE_URL` | Canonical, OG, sitemap, QR |
| Hotline, Zalo / Zalo OA | Dashboard → Cấu hình nội dung (hoặc env `HOTLINE`, `ZALO_PHONE`, `ZALO_URL`) | Nút gọi/Zalo nổi đang ẩn |
| Meta Pixel ID + CAPI token | env | Xem docs/META-PIXEL-CAPI.md |
| GTM ID **hoặc** GA4 ID + Google Ads ID/label | env | Xem docs/GOOGLE-GA4-GTM-ADS.md |
| Postgres `DATABASE_URL` | env (Vercel) | Neon / Supabase / Vercel Postgres |
| Kênh thông báo lead | env Telegram / Resend / Webhook | Hiện chưa gửi thông báo nào |
| Ngày mở bán chính thức | Dashboard → chính sách (`valid_to`) | TB50/TB51 hiệu lực "đến trước ngày mở bán" |
| Duyệt pháp lý nội dung | Pháp chế DKRA/CĐT | Đặc biệt: câu đồng ý xử lý dữ liệu (`lib/constants.js`), trang chính sách bảo mật, mục pháp lý (QĐ 1095 là QH 1/500 phần 50 ha) |
| Logo chính thức (SVG/PNG nền trong) | `public/` | Hiện dùng wordmark chữ + biểu tượng tự vẽ |
| Cloudflare Turnstile (tuỳ chọn) | env | Khi gặp spam nhiều |
