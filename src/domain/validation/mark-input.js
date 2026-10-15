import { ABSENT } from '../calculation/constants.js';

const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
const ABSENT_TOKENS = new Set(['ab', 'a', 'abs', 'absent', 'অ', 'অনু', 'অনুপস্থিত']);

export function normalizeDigits(text) {
  return String(text).replace(/[০-৯]/g, (d) => BN_DIGITS[d]);
}

/**
 * Parses what a teacher typed into a mark cell.
 *   ''            → { kind: 'missing', value: null }
 *   'AB' / 'অ'    → { kind: 'absent',  value: 'AB' }
 *   '৮৫' / '85.5' → { kind: 'number',  value: 85.5 }
 *   anything else → { kind: 'invalid', error }
 */
export function parseMarkInput(input) {
  const raw = normalizeDigits(input ?? '').trim();
  if (raw === '') return { kind: 'missing', value: null };
  if (ABSENT_TOKENS.has(raw.toLowerCase())) return { kind: 'absent', value: ABSENT };
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return { kind: 'invalid', value: null, error: 'Enter a number, or AB for absent.' };
  const value = Number(raw);
  if (value < 0) return { kind: 'invalid', value: null, error: 'Marks cannot be negative.' };
  return { kind: 'number', value };
}
