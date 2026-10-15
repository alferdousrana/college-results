/** DEVELOPMENT ONLY (#/print-preview): both print templates from sample data, no Firebase needed. */
import { h, svgIcon } from '../core/dom.js';
import { sampleData } from '../print/sample.js';
import { renderProgressReport } from '../print/progress-report.js';
import { renderResultSheet } from '../print/result-sheet.js';
import { DEFAULT_PRINT_SETTINGS, fontFamiliesFor } from '../print/print-settings.js';
import { REFERENCE_SCALE_5 } from '../domain/calculation/index.js';
import { ensurePrintFonts } from '../print/fonts.js';
import { printContainer } from '../print/print-runner.js';

export function render({ query }) {
  ensurePrintFonts();
  const lang = query.get('lang') === 'bn' ? 'bn' : 'en';
  const { vms, subjects, exam } = sampleData();
  const ctx = { institution: { name: { en: 'Sample School & College', bn: 'নমুনা স্কুল অ্যান্ড কলেজ' }, address: { en: 'Configurable address', bn: 'পরিবর্তনযোগ্য ঠিকানা' }, assets: {}, signatories: {} }, print: DEFAULT_PRINT_SETTINGS, scale: REFERENCE_SCALE_5, lang };
  const a = h('div', { class: 'print-area' }, renderProgressReport(vms[0], ctx));
  const b = h('div', { class: 'print-area' }, renderResultSheet({ vms, subjects, exam, groupLabel: exam.groupLabel }, ctx));
  return h('section', { class: 'page page--wide' }, h('h1', { class: 'no-print' }, 'Print preview (sample data)'),
    h('div', { class: 'row-actions no-print' }, h('a', { href: `#/print-preview?lang=${lang === 'en' ? 'bn' : 'en'}` }, lang === 'en' ? 'বাংলা' : 'English'),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => printContainer(a, { families: fontFamiliesFor(DEFAULT_PRINT_SETTINGS) }) }, svgIcon('print'), h('span', {}, 'Print marksheet')),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => printContainer(b, { families: fontFamiliesFor(DEFAULT_PRINT_SETTINGS) }) }, h('span', {}, 'Print sheet'))), a, b);
}
