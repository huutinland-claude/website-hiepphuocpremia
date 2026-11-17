# Đổ lead vào Google Sheet (Apps Script)

Mỗi lead mới trên website được gửi sang Google Sheet riêng của Hiệp Phước Premia, mỗi lead một dòng. Lead trùng (cùng mã lead) không bị ghi hai lần.

## Cài đặt (khoảng 5 phút)

1. Tạo Google Sheet mới, đặt tên ví dụ **HPP – Leads website**.
2. **Tiện ích mở rộng → Apps Script**. Xóa code mẫu, dán toàn bộ nội dung file [`Code.gs`](Code.gs), bấm **Lưu**.
3. Ở thanh trên chọn hàm **`setup`** → **Chạy** → cấp quyền bằng tài khoản Google của bạn (màn hình "Google chưa xác minh ứng dụng" → *Nâng cao* → *Đi tới…*). Hàm này tạo khóa bí mật và sheet `Leads` có tiêu đề.
4. **Triển khai → Tùy chọn triển khai mới** → loại **Ứng dụng web**:
   - Thực thi với tư cách: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
   - Bấm **Triển khai**.
5. Chạy lại hàm **`setup`** → mở **Nhật ký thực thi** → sao chép dòng `https://script.google.com/macros/s/…/exec?key=…`.
6. Dán link đó vào Vercel làm biến **`LEAD_WEBHOOK_URL`** (loại *Sensitive*), rồi Redeploy.

Link có chứa khóa bí mật: không gửi qua chat/email. Không có khóa đúng, script trả `unauthorized` và không ghi gì.

## Sửa code về sau

Sau khi sửa `Code.gs` phải vào **Triển khai → Quản lý triển khai → ✏️ → Phiên bản: Phiên bản mới → Triển khai** thì link cũ mới chạy code mới.

## Kiểm tra

- Mở link (bỏ phần `?key=…`) trên trình duyệt → thấy `{"ok":true,"service":"hpp-leads"}`.
- Gửi 1 form trên website → dòng mới xuất hiện trong sheet `Leads`; cột **Thông báo** của lead trong Dashboard có `webhook:ok`.
