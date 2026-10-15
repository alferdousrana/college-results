/** Localisation. Missing Bangla keys fall back to English; missing English keys show the key (caught by tests). */
import en from './en.js';
import bn from './bn.js';
import { getPrefs, setPref } from '../core/prefs.js';

export const LANGUAGES = Object.freeze([
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'বাংলা' },
]);
const DICTS = { en, bn };
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function currentLang() { return getPrefs().lang in DICTS ? getPrefs().lang : 'en'; }

export function t(key, params = {}) {
  const lang = currentLang();
  const str = DICTS[lang][key] ?? en[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, p) => (p in params ? formatNumber(params[p]) : `{${p}}`));
}

/** Localised digits for display only; stored data always uses ASCII digits. */
export function formatNumber(value, lang = currentLang()) {
  const s = String(value);
  return lang === 'bn' ? s.replace(/\d/g, (d) => BN_DIGITS[d]) : s;
}

export function setLanguage(code) {
  if (!DICTS[code]) return;
  setPref('lang', code);
  document.documentElement.lang = code;
}

export function applyLanguage() { document.documentElement.lang = currentLang(); }

export const dictionaries = DICTS;

/**
 * Inline bilingual text for screen-specific copy: tt('Save', 'সংরক্ষণ').
 * Shared vocabulary (navigation, statuses, common actions) stays in en.js / bn.js via t().
 * Keeping both languages side by side makes it impossible to add an English-only string by accident.
 */
export function tt(en, bn, params = {}) {
  const str = currentLang() === 'bn' && bn ? bn : en;
  return str.replace(/\{(\w+)\}/g, (_, p) => (p in params ? formatNumber(params[p]) : `{${p}}`));
}

/** Picks the right language from a { en, bn } value (or returns a plain string unchanged). */
export function L(value, lang = currentLang()) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  return value[lang] || value.en || value.bn || '';
}
