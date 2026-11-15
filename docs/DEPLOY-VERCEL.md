# Triển khai lên Vercel

## 1. Chuẩn bị database Postgres

Vercel là serverless – ổ đĩa không lưu lâu dài, **bắt buộc** dùng Postgres. Chọn một:

- **Neon** (Vercel → Storage → Marketplace → Neon) – tự thêm biến `DATABASE_URL` vào project.
- **Supabase** – Project Settings → Database → Connection string (dùng chế độ *Transaction pooler*, cổng 6543).

Bảng được tạo tự động ở request đầu tiên (`CREATE TABLE IF NOT EXISTS`), không cần chạy migration.

## 2. Đưa code lên Git và import vào Vercel

1. Đưa thư mục `landing-page/` lên một repository GitHub/GitLab (không commit `.env`, `data/`, `dist/` – đã có trong `.gitignore`).
2. Vercel → **Add New → Project** → chọn repository. Nếu repo chứa cả thư mục cha, đặt **Root Directory** = `landing-page`.
3. Framework Preset: **Other**. Build/Output đã khai báo trong `vercel.json` (`node scripts/build.mjs` → `dist`).
4. Node.js version: 22.x trở lên (Project Settings → General).

## 3. Biến môi trường (Project Settings → Environment Variables)

Bắt buộc:

| Biến | Giá trị |
|---|---|
| `SITE_URL` | `https://ten-mien-chinh-thuc.vn` (không có `/` cuối) |
| `DATABASE_URL` | chuỗi kết nối Postgres |
| `SESSION_SECRET` | chuỗi ngẫu nhiên ≥ 32 ký tự |
| `IP_HASH_SALT` | chuỗi ngẫu nhiên |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | tài khoản admin đầu tiên – **xóa 2 biến này sau khi đăng nhập lần đầu** |

Tracking / thông báo: xem `.env.example` và các tài liệu trong `docs/`.

> Sau khi thêm/đổi biến môi trường phải **Redeploy** để có hiệu lực (SITE_URL được chèn lúc build).

## 4. Tên miền & HTTPS

Project → Settings → Domains → thêm tên miền, trỏ DNS theo hướng dẫn (A `76.76.21.21` hoặc CNAME `cname.vercel-dns.com`). Vercel tự cấp HTTPS. Đặt tên miền chính, chuyển hướng `www` ↔ apex một chiều.

## 5. Kiểm tra sau deploy

```bash
curl -s https://ten-mien/api/health
```

Kết quả mong đợi: `{"ok":true,"db":"postgres"}`. Sau đó chạy toàn bộ [QA-CHECKLIST.md](QA-CHECKLIST.md).

## 6. Bảo mật đã cấu hình

- Security headers trong `vercel.json`: CSP (Dashboard khóa chặt `script-src 'self'`), HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy.
- `/admin`, `/api`, `/cam-on` gắn `noindex`; `robots.txt` chặn `/admin`, `/api/`.
- Mật khẩu băm scrypt; phiên đăng nhập cookie HttpOnly + Secure + SameSite=Strict, ký HMAC, hết hạn 12 giờ; chống CSRF bằng header `X-Requested-With`; giới hạn đăng nhập sai 10 lần/15 phút/IP.
- Không có khóa bí mật nào ở frontend; `/api/config` chỉ trả về ID công khai (Pixel ID, GTM ID…).

## 7. Triển khai trên VPS (thay cho Vercel)

```bash
npm ci && npm run build && npm start
```

- Có thể dùng SQLite (`data/leads.db`) – nhớ sao lưu file này định kỳ – hoặc đặt `DATABASE_URL`.
- Chạy sau reverse proxy (Nginx/Caddy) có HTTPS; dùng PM2/systemd để tự khởi động lại.
- Đặt `NODE_ENV=production` để cookie dùng cờ `Secure`.
