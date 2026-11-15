// New-lead notifications to the sales team. Each channel runs only when configured via env.
import crypto from 'node:crypto';
import * as C from './constants.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function summary(lead, assignee) {
  return [
    ['Họ tên', lead.full_name],
    ['SĐT', lead.phone],
    ['Email', lead.email],
    ['Nhu cầu', C.NEEDS[lead.need]],
    ['Sản phẩm', C.PRODUCTS[lead.product_interest]],
    ['Ngân sách', C.BUDGETS[lead.budget]],
    ['Liên hệ qua', C.CONTACT_METHODS[lead.contact_method]],
    ['Yêu cầu', C.LEAD_MAGNETS[lead.lead_magnet]],
    ['Ưu tiên', lead.priority],
    ['Nguồn', [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ') || (lead.referrer ? 'referral' : 'direct')],
    ['Phụ trách', assignee ? assignee.name : 'Chưa phân công'],
  ].filter(([, v]) => v);
}

async function telegram(lead, assignee, adminUrl) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!token || !chat) return null;
  const text = `🔔 <b>LEAD MỚI – Hiệp Phước Premia</b>\n` + summary(lead, assignee).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join('\n') + (adminUrl ? `\n\n<a href="${esc(adminUrl)}">Mở trong Dashboard</a>` : '');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(4000),
  });
  return r.ok ? 'telegram:ok' : `telegram:error:${r.status}`;
}

async function email(lead, assignee, adminUrl) {
  const { RESEND_API_KEY: key, NOTIFY_EMAIL_FROM: from, NOTIFY_EMAIL_TO: to } = process.env;
  if (!key || !from || !to) return null;
  const rows = summary(lead, assignee).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('');
  const recipients = to.split(',').map((s) => s.trim()).filter(Boolean);
  if (assignee?.email && !recipients.includes(assignee.email)) recipients.push(assignee.email);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: recipients,
      subject: `[Lead mới] ${lead.full_name} – ${C.LEAD_MAGNETS[lead.lead_magnet] || 'Hiệp Phước Premia'}`,
      html: `<h2 style="font-family:Arial">Lead mới – Hiệp Phước Premia</h2><table style="font-family:Arial;font-size:14px">${rows}</table>${adminUrl ? `<p><a href="${esc(adminUrl)}">Mở trong Dashboard</a></p>` : ''}`,
    }),
    signal: AbortSignal.timeout(4000),
  });
  return r.ok ? 'email:ok' : `email:error:${r.status}`;
}

async function webhook(lead, assignee) {
  const { LEAD_WEBHOOK_URL: url, LEAD_WEBHOOK_SECRET: secret } = process.env;
  if (!url) return null;
  const payload = JSON.stringify({ event: 'lead.created', lead: { ...lead, ip_hash: undefined, search_text: undefined }, assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null });
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Signature'] = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const r = await fetch(url, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(4000) });
  return r.ok ? 'webhook:ok' : `webhook:error:${r.status}`;
}

export async function notifyNewLead(lead, assignee, adminUrl) {
  const results = await Promise.allSettled([telegram(lead, assignee, adminUrl), email(lead, assignee, adminUrl), webhook(lead, assignee)]);
  const parts = results.map((r) => (r.status === 'fulfilled' ? r.value : `error:${r.reason?.name || 'failed'}`)).filter(Boolean);
  return parts.length ? parts.join(',') : 'skipped:not-configured';
}
