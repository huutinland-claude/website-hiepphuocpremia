// Input normalisation & validation shared by the lead API.

/** Strip control chars / tags, collapse whitespace, cap length. */
export function clean(v, max = 200) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Free-text field for URLs/referrers: keep as-is but bounded and without control chars. */
export function cleanUrl(v, max = 1000) {
  if (!v) return '';
  const s = String(v).replace(/[\u0000-\u001F\u007F\s]/g, '').slice(0, max);
  try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) ? u.toString().slice(0, max) : ''; } catch { return ''; }
}

/** Vietnamese phone -> 0xxxxxxxxx, or '' if invalid. Accepts +84 / 84 / spaces / dots / dashes. */
export function normalizePhone(v) {
  let s = String(v || '').replace(/[\s.\-()]/g, '');
  if (s.startsWith('+84')) s = '0' + s.slice(3);
  else if (/^84\d{9}$/.test(s)) s = '0' + s.slice(2);
  if (/^0(3|5|7|8|9)\d{8}$/.test(s)) return s; // mobile (10 digits)
  if (/^02\d{9}$/.test(s)) return s; // landline (11 digits)
  return '';
}

export function isEmail(v) {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(String(v || ''));
}

export function isValidName(v) {
  const s = clean(v, 80);
  // at least 2 letters, letters/spaces/apostrophes/dots only (Unicode letters for Vietnamese)
  return s.length >= 2 && /^[\p{L}\s'.]+$/u.test(s) && /\p{L}.*\p{L}/u.test(s);
}

export function pick(v, dict) {
  const s = clean(v, 40);
  return Object.prototype.hasOwnProperty.call(dict, s) ? s : '';
}

/** Remove Vietnamese diacritics + lowercase for accent-insensitive search. */
export function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
