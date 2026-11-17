// Formatting helpers. Pure functions, no DOM.

const intFmt = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });

/** ₦1,250,000 — whole naira. */
export function naira(n) {
  return '₦' + intFmt.format(Math.round(Number(n) || 0));
}

/** 3,200 or 197.53 — thousands separators, up to `dp` decimals. */
export function num(n, dp = 0) {
  const v = Number(n) || 0;
  if (dp === 0) return intFmt.format(Math.round(v));
  return dp === 2 ? decFmt.format(v) : new Intl.NumberFormat('en-NG', { maximumFractionDigits: dp }).format(v);
}

/** Parse user-typed numbers such as "350,000" or "₦ 1,200.50". Blank/invalid → 0. */
export function parseNum(s) {
  const v = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

/** 17 Nov 2026 */
export function date(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString();
}

/** Nigerian phone to international digits for wa.me: 0803 123 4567 → 2348031234567. */
export function waPhone(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '234' + d.slice(1);
  else if (d.length === 10) d = '234' + d; // 8031234567
  return d;
}

/** Escape text for safe insertion into HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
