# Cấu hình Meta Pixel & Conversions API (CAPI)

## Sự kiện được gửi

| Sự kiện | Khi nào | Browser Pixel | Server CAPI | event_id |
|---|---|---|---|---|
| `PageView` | Mỗi lượt tải trang | ✔ | – | – |
| `ViewContent` | Khách thực sự xem khu vực sản phẩm (≥ 40% hiển thị) / đổi tab sản phẩm | ✔ | – | – |
| `Contact` | Bấm Hotline hoặc Zalo | ✔ | – | – |
| `Lead` | **Chỉ khi server đã lưu lead** (trên `/cam-on`) | ✔ | ✔ | `lead_<id>` |
| `CompleteRegistration` | Cùng lúc với Lead | ✔ | ✔ | `lead_<id>_cr` |
| `Schedule` | Lead chọn "Đăng ký tham quan" | ✔ | ✔ | `lead_<id>_sch` |
| `QualifiedLead` (custom) | Sale chuyển lead sang Qualified trong Dashboard | – | ✔ (`system_generated`) | `lead_<id>_q` |

- Bấm CTA **không** gửi Lead. Khách gửi lại form trong 30 phút với cùng SĐT **không** tạo Lead mới.
- Browser và Server dùng cùng `event_id` → Meta tự loại trùng.
- Dữ liệu cá nhân gửi lên CAPI (SĐT dạng `84xxxxxxxxx`, email, họ, tên, quốc gia, external_id) được chuẩn hóa và băm **SHA-256** trên server. Trình duyệt không gửi PII cho Meta.
- `fbp`/`fbc` lấy từ cookie `_fbp`/`_fbc`; nếu chưa có `_fbc` nhưng URL có `fbclid`, server tự tạo `fbc` theo định dạng `fb.1.<timestamp>.<fbclid>`.

## Các bước cấu hình

1. **Events Manager** → Data sources → chọn/khởi tạo Dataset (Pixel) → copy **Pixel ID**.
2. Settings → **Conversions API** → *Generate access token* → copy token.
3. Đặt biến môi trường:

   ```
   META_PIXEL_ID=123456789012345
   META_CAPI_ACCESS_TOKEN=EAAB...
   META_TEST_EVENT_CODE=TEST12345   # chỉ khi kiểm thử
   ```

4. Redeploy.
5. Events Manager → **Test events** → mở trang với mã test, gửi 1 form → phải thấy `Lead` từ cả *Browser* và *Server* với trạng thái **Deduplicated**.
6. Kiểm tra cột "Meta CAPI" trong chi tiết lead ở Dashboard: `Lead=ok:1 CR=ok:1`.
7. Xóa `META_TEST_EVENT_CODE`, redeploy, rồi mới chạy quảng cáo.

> Không cài Pixel lần nữa trong GTM – trang đã tự tải Pixel khi có `META_PIXEL_ID` (tránh đếm đôi).

## Tối ưu chiến dịch

- Mục tiêu chiến dịch: **Leads** → Conversion location: Website → Conversion event: `Lead`.
- Khi có đủ dữ liệu, có thể tạo Custom Conversion từ `QualifiedLead` để tối ưu theo chất lượng.
- Xác minh tên miền (Business Settings → Brand safety → Domains) và cấu hình Aggregated Event Measurement nếu chạy iOS.
- Tệp retargeting: tạo Custom Audience theo `ViewContent`, `Contact`, người truy cập `/` nhưng không đến `/cam-on`.

## UTM chuẩn cho quảng cáo Meta

```
?utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

(Instagram có thể dùng `utm_source=instagram`; TikTok dùng `utm_source=tiktok&utm_medium=paid_social`, `ttclid` được lưu tự động.)
