# Cấu hình Google Tag Manager, GA4 & Google Ads

Trang hỗ trợ 2 chế độ – **chọn một**:

- **A. Dùng GTM (khuyến nghị)**: đặt `GTM_ID`. Trang chỉ tải GTM; GA4 và Google Ads cấu hình bên trong GTM dựa trên các sự kiện `dataLayer` bên dưới.
- **B. Không dùng GTM**: đặt `GA4_MEASUREMENT_ID` (+ `GOOGLE_ADS_ID`, `GOOGLE_ADS_LEAD_LABEL`). Trang tự tải gtag.js và tự gửi conversion.

## Sự kiện dataLayer

| event | Tham số | Ý nghĩa |
|---|---|---|
| `cta_click` | `cta_id`, `cta_text` | Mọi nút/link có `data-cta` – mỗi CTA có id riêng (vd. `hero_primary`, `sticky_cta`, `final_tham_quan`) |
| `phone_click` | `cta_id` | Bấm gọi hotline |
| `zalo_click` | `cta_id` | Bấm Zalo |
| `form_open` | `form_id`, `lead_magnet`, `cta_id` | Mở form bottom-sheet |
| `form_start` | `form_id` | Lần đầu tương tác với form |
| `form_submit` | `form_id`, `valid` | Bấm gửi |
| `form_error` / `form_submit_failed` | `form_id`, `fields` / `status` | Lỗi validate / lỗi server |
| `form_submit_success` | `form_id`, `lead_magnet`, `repeat` | Server xác nhận đã lưu |
| `generate_lead` | `lead_event_id`, `form_id`, `lead_magnet`, `product_interest`, `value`, `currency` | Trên `/cam-on`, **một lần** |
| `schedule_visit` | như trên | Lead đăng ký tham quan |
| `view_products`, `view_product` | `product` | Xem bộ sưu tập sản phẩm |
| `calculator_use` | `tool`, `method` | Dùng máy tính tài chính |
| `share` | `method` | Chia sẻ |
| `ab_assignment` | `ab_<test>` | Biến thể A/B của khách |

`form_id`: `hero` (form đầu trang), `main` (form chính), `popup` (bottom-sheet).

## A. Cấu hình trong GTM

1. Tạo **Data Layer Variables**: `lead_event_id`, `form_id`, `lead_magnet`, `cta_id`.
2. Tag **Google Tag** (GA4) với Measurement ID → trigger *Initialization – All Pages*.
3. Tag **GA4 Event** `generate_lead` → trigger *Custom Event* `generate_lead`; tham số `form_id`, `lead_magnet`. Đánh dấu `generate_lead` là **Key event** trong GA4.
4. Tag **GA4 Event** cho `phone_click`, `zalo_click`, `cta_click`, `form_start`, `form_submit` (một tag dùng `{{Event}}` làm tên sự kiện với trigger regex `^(phone_click|zalo_click|cta_click|form_start|form_submit)$`).
5. Tag **Google Ads Conversion Tracking** → Conversion ID + Label của action "Lead" → trigger `generate_lead` → **Transaction ID** = `{{lead_event_id}}` (chống đếm trùng).
6. Tag **Conversion Linker** → All Pages.
7. *Preview* (Tag Assistant) → gửi form test → kiểm tra tag bắn trên `/cam-on` đúng một lần.

## B. Không dùng GTM

```
GA4_MEASUREMENT_ID=G-XXXXXXX
GOOGLE_ADS_ID=AW-XXXXXXXXX
GOOGLE_ADS_LEAD_LABEL=AbCdEfGh123
```

Trang tự gọi `gtag('event','conversion',{send_to:'AW-…/label', transaction_id: lead_event_id})` trên `/cam-on`.

## Qualified Lead (chất lượng lead)

- **GA4 Measurement Protocol**: đặt `GA4_API_SECRET` (GA4 → Admin → Data streams → Measurement Protocol API secrets). Khi sale chuyển lead sang *Qualified*, server gửi sự kiện `qualify_lead` gắn với `client_id` (cookie `_ga`) của khách.
- **Google Ads Offline Conversion Import**: tạo conversion action loại *Import → Other data sources → Track conversions from clicks*, đặt tên đúng giá trị `GOOGLE_ADS_OFFLINE_CONVERSION_NAME` (mặc định `Qualified Lead`). Dashboard → Leads → **Google Ads offline** tải file CSV (gclid + thời điểm qualified) để upload trong Google Ads → Tools → Conversions → Uploads.

## UTM chuẩn cho Google Ads

Bật **auto-tagging** (gclid được lưu tự động). Tracking template gợi ý:

```
{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={creative}&utm_term={keyword}
```
