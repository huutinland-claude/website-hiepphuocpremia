// Browser tracking: GTM (preferred) or gtag.js, plus Meta Pixel.
// Rules: events fire only on real user actions; the Lead conversion fires only after the server confirmed the save
// (on /cam-on), with the same event_id the server sent to Meta CAPI for de-duplication. No PII is sent from the browser.
window.dataLayer = window.dataLayer || [];
const mode = { gtm: false, gtag: false, fbq: false, ads: '', adsLabel: '' };

function loadScript(src) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

export function initTracking(t = {}) {
  if (t.gtm_id && /^GTM-[A-Z0-9]+$/i.test(t.gtm_id)) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(t.gtm_id)}`);
    mode.gtm = true;
  } else if (t.ga4_id || t.google_ads_id) {
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    if (t.ga4_id) window.gtag('config', t.ga4_id);
    if (t.google_ads_id) window.gtag('config', t.google_ads_id);
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(t.ga4_id || t.google_ads_id)}`);
    mode.gtag = true;
  }
  mode.ads = t.google_ads_id || '';
  mode.adsLabel = t.google_ads_lead_label || '';

  if (t.meta_pixel_id && /^\d{5,20}$/.test(t.meta_pixel_id)) {
    /* Meta Pixel base code (unminified) */
    if (!window.fbq) {
      const fbq = function fbqStub() { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
      fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
      window.fbq = fbq; window._fbq = fbq;
      loadScript('https://connect.facebook.net/en_US/fbevents.js');
    }
    window.fbq('init', t.meta_pixel_id);
    window.fbq('track', 'PageView');
    mode.fbq = true;
  }
}

/** GA4 / GTM event (dataLayer). */
export function track(event, params = {}) {
  window.dataLayer.push({ event, ...params });
  if (mode.gtag && window.gtag) window.gtag('event', event, params);
}

/** Meta Pixel event. */
export function fb(name, params = {}, eventID, custom = false) {
  if (!mode.fbq || !window.fbq) return;
  const opts = eventID ? { eventID } : undefined;
  window.fbq(custom ? 'trackCustom' : 'track', name, params, opts);
}

/** Fired once on the thank-you page after a confirmed save. */
export function trackLeadConversion({ eventId, schedule, magnet, formId, product }) {
  const params = { lead_event_id: eventId, form_id: formId, lead_magnet: magnet, product_interest: product || '', currency: 'VND', value: 1 };
  track('generate_lead', params);
  if (mode.gtag && mode.ads && mode.adsLabel && window.gtag) {
    window.gtag('event', 'conversion', { send_to: `${mode.ads}/${mode.adsLabel}`, transaction_id: eventId, value: 1, currency: 'VND' });
  }
  fb('Lead', { content_name: 'Hiep Phuoc Premia', lead_type: magnet }, eventId);
  fb('CompleteRegistration', { content_name: 'Hiep Phuoc Premia', status: 'submitted' }, `${eventId}_cr`);
  if (schedule) {
    track('schedule_visit', params);
    fb('Schedule', { content_name: 'Hiep Phuoc Premia' }, `${eventId}_sch`);
  }
}

export const trackingMode = mode;
