import { ENGLISH_FONTS, BANGLA_FONTS } from './fonts.js';

/** Defaults for settings/print. Printouts never follow the app theme: always black on white. */
export const DEFAULT_PRINT_SETTINGS = Object.freeze({
  language: 'en',                       // default printed language ('en' | 'bn'); can be changed per print
  paper: 'A4',
  orientation: { progressReport: 'portrait', resultSheet: 'landscape' },
  marginsMm: { progressReport: 10, resultSheet: 8 },
  fonts: { en: 'tinos', bn: 'noto-serif-bengali' },
  fontSizePt: { body: 10, heading: 16, table: 9, sheetTable: 7.5 },
  headingAlign: 'center',
  headingStyle: 'bold',                 // 'bold' | 'boldUnderline' | 'caps'
  logoPosition: 'left',                 // 'left' | 'center' | 'right' | 'none'
  border: { style: 'double', widthPt: 3 },
  table: { cellPaddingPt: 2, lineWidthPt: 0.75 },
  // Full result sheet. The whole width always fits one page (the table is scaled down if needed).
  sheet: {
    paper: 'A4',                          // 'A4' | 'Legal'
    nameColumnMm: 38, pageNumbers: true,
    combined: { papers: true, total: true, grade: false, gradePoint: true },   // Bangla, English (1st/2nd paper subjects)
    single: { marks: false, grade: true, gradePoint: true },                   // every other subject
    totals: { totalMarks: true, gpa: true, grade: false, merit: true },
  },
  marksheetFields: {
    fatherName: true, motherName: true, studentCode: false, section: false, shift: false, group: true,
    highestMarks: true, gradeScale: true, position: true, examHeld: true, seal: true, printedOn: true,
  },
  signatures: [
    { role: 'guardian', label: { en: 'Guardian', bn: 'অভিভাবক' }, position: 'left', enabled: true, useImage: false },
    { role: 'classTeacher', label: { en: 'Class Teacher', bn: 'শ্রেণি শিক্ষক' }, position: 'center', enabled: true, useImage: true },
    { role: 'principal', label: { en: 'Principal', bn: 'অধ্যক্ষ' }, position: 'right', enabled: true, useImage: true },
  ],
  sheetSignatures: [
    { role: 'committee', label: { en: 'Convener, Examination Committee', bn: 'আহ্বায়ক, পরীক্ষা কমিটি' }, position: 'left', enabled: true, useImage: true },
    { role: 'principal', label: { en: 'Principal', bn: 'অধ্যক্ষ' }, position: 'right', enabled: true, useImage: true },
  ],
});

export function resolveFont(id, lang) {
  const list = lang === 'bn' ? BANGLA_FONTS : ENGLISH_FONTS;
  return list.find((f) => f.id === id) ?? list[0];
}

/** Merges stored settings over defaults (older documents may miss newer keys). */
export function withPrintDefaults(s = {}) {
  const d = structuredClone(DEFAULT_PRINT_SETTINGS);
  const out = { ...d, ...s };
  for (const k of ['orientation', 'marginsMm', 'fonts', 'fontSizePt', 'border', 'table', 'sheet', 'marksheetFields']) out[k] = { ...d[k], ...(s[k] ?? {}) };
  for (const k of ['combined', 'single', 'totals']) out.sheet[k] = { ...d.sheet[k], ...(s.sheet?.[k] ?? {}) };
  // Older settings used showGradePoint / showMerit.
  if (s.sheet?.showGradePoint === false) { out.sheet.single.gradePoint = false; out.sheet.combined.gradePoint = false; }
  if (s.sheet?.showMerit === false) out.sheet.totals.merit = false;
  out.signatures = s.signatures ?? d.signatures;
  out.sheetSignatures = s.sheetSignatures ?? d.sheetSignatures;
  return out;
}

/** CSS custom properties for a printed document. */
export function printVars(s, lang) {
  const en = resolveFont(s.fonts.en, 'en'), bn = resolveFont(s.fonts.bn, 'bn');
  const stack = lang === 'bn' ? `${bn.css.split(',')[0]}, ${en.css}` : `${en.css}, ${bn.css.split(',')[0]}`;
  return `--print-font:${stack};--print-size:${s.fontSizePt.body}pt;--print-head:${s.fontSizePt.heading}pt;--print-table:${s.fontSizePt.table}pt;--print-sheet-table:${s.fontSizePt.sheetTable}pt;--print-pad:${s.table.cellPaddingPt}pt;--print-line:${s.table.lineWidthPt}pt;--print-border:${s.border.widthPt}pt;--print-name-col:${s.sheet.nameColumnMm}mm`;
}

export function fontFamiliesFor(s) {
  return [resolveFont(s.fonts.en, 'en').family, resolveFont(s.fonts.bn, 'bn').family];
}

/** Paper sizes in millimetres (portrait width × height). */
export const PAPER_MM = { A4: [210, 297], Legal: [215.9, 355.6] };
