import { currentLang, formatNumber, L } from '../i18n/index.js';
import { toMillis } from '../data/field-ops.js';

export { L };

export function fmtDate(value, { time = false } = {}) {
  const ms = toMillis(value);
  if (ms == null) return '';
  const d = new Date(ms);
  const locale = currentLang() === 'bn' ? 'bn-BD' : 'en-GB';
  return d.toLocaleString(locale, time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function fmtNum(v, dp = null) {
  if (v == null || v === '') return '';
  const s = typeof v === 'number' && dp != null ? v.toFixed(dp) : String(v);
  return formatNumber(s);
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
