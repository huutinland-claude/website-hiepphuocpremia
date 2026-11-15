// Browser tracking logic, tested with a stubbed DOM (no network calls to Meta/Google).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const loaded = [];
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({}), head: { appendChild: (s) => loaded.push(s.src) } };

const t = await import('../public/assets/js/tracking.js');
const { metaUserData } = await import('../lib/tracking.js');

test('GTM mode loads only GTM; Pixel loads separately; Lead fires with the server event_id', () => {
  t.initTracking({ gtm_id: 'GTM-ABC123', meta_pixel_id: '123456789012345' });
  assert.ok(loaded.some((s) => s.includes('gtm.js?id=GTM-ABC123')));
  assert.ok(loaded.some((s) => s.includes('fbevents.js')));
  assert.ok(!loaded.some((s) => s.includes('gtag/js')), 'gtag must not load when GTM is used');

  t.track('cta_click', { cta_id: 'hero_primary' });
  assert.equal(window.dataLayer.at(-1).event, 'cta_click');
  // CTA click must NOT produce a Meta Lead
  assert.ok(!window.fbq.queue.some((c) => c[1] === 'Lead'));

  t.trackLeadConversion({ eventId: 'lead_abc', schedule: true, magnet: 'tham-quan', formId: 'hero' });
  const q = window.fbq.queue.map((c) => [...c]);
  const lead = q.find((c) => c[1] === 'Lead');
  assert.deepEqual(lead[3], { eventID: 'lead_abc' });
  assert.deepEqual(q.find((c) => c[1] === 'CompleteRegistration')[3], { eventID: 'lead_abc_cr' });
  assert.deepEqual(q.find((c) => c[1] === 'Schedule')[3], { eventID: 'lead_abc_sch' });
  assert.equal(window.dataLayer.find((e) => e.event === 'generate_lead').lead_event_id, 'lead_abc');
  // no PII in browser events
  assert.ok(!JSON.stringify(window.dataLayer).match(/09\d{8}/));
});

test('Meta CAPI user_data is SHA-256 hashed and normalised', () => {
  const ud = metaUserData({ id: 'x', phone: '0912345678', email: ' A@B.com ', full_name: 'Nguyễn Văn Đức' }, { ip: '1.2.3.4', ua: 'UA' });
  assert.equal(ud.ph[0].length, 64);
  assert.notEqual(ud.ph[0], '0912345678');
  assert.equal(ud.client_ip_address, '1.2.3.4');
  assert.ok(!JSON.stringify(ud).includes('0912345678'));
  assert.ok(!JSON.stringify(ud).includes('a@b.com'));
});
