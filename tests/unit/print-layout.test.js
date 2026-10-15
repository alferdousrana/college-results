import { describe, it, expect } from 'vitest';
import { computeResultSheet, REFERENCE_SCALE_5, DEFAULT_POLICY } from '../../src/domain/calculation/index.js';
import { buildStudentViewModel } from '../../src/print/view-models.js';
import { renderProgressReport, componentColumns } from '../../src/print/progress-report.js';
import { renderResultSheet } from '../../src/print/result-sheet.js';
import { ENGLISH_FONTS, BANGLA_FONTS } from '../../src/print/fonts.js';
import { DEFAULT_PRINT_SETTINGS } from '../../src/print/print-settings.js';
import { sampleData } from '../../src/print/sample.js';
import { SUBJECTS, MARKS } from '../fixtures/reference-progress-report.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ctx = (lang, extra = {}) => ({ institution: { name: { en: 'Test College', bn: 'টেস্ট কলেজ' }, address: { en: 'Addr', bn: 'ঠিকানা' }, assets: {}, signatories: {} }, print: { ...DEFAULT_PRINT_SETTINGS, ...extra }, scale: REFERENCE_SCALE_5, lang });

describe('marksheet', () => {
  const sheet = computeResultSheet({ students: [{ studentId: 's', roll: '13', groupId: '_' }], subjectsByGroup: { _: SUBJECTS.map((s) => ({ ...s, components: s.components.map((c) => ({ ...c, type: c.id.toUpperCase() })) })) }, marks: { s: MARKS }, policy: DEFAULT_POLICY, scale: REFERENCE_SCALE_5 });
  const defs = Object.fromEntries(SUBJECTS.map((s) => [s.id, { ...s, name: { en: s.id, bn: s.id } }]));
  const vm = buildStudentViewModel({ exam: { title: { en: 'Annual' }, yearLabel: '2024', classLabel: { en: 'VIII', bn: 'অষ্টম' } }, enrollment: { roll: '13', name: { en: '<b>X</b>', bn: 'এক্স' } }, defs, row: { ...sheet.rows[0], poolSize: 243, position: 18 } });
  it('renders totals, GPA, position and signatures in English', () => {
    const el = renderProgressReport(vm, ctx('en'));
    expect(el.textContent).toContain('850.60');
    expect(el.textContent).toContain('4.70');
    expect(el.querySelectorAll('.pr-sig')).toHaveLength(3);
    expect(el.querySelector('b')).toBeNull(); // names are text, never HTML
  });
  it('renders Bangla labels and digits independent of the interface language', () => {
    const el = renderProgressReport(vm, ctx('bn'));
    expect(el.textContent).toContain('মোট নম্বর');
    expect(el.textContent).toContain('৮৫০.৬০');
    expect(el.getAttribute('lang')).toBe('bn');
  });
  it('hides fields the administrator turned off', () => {
    const el = renderProgressReport({ ...vm, student: { ...vm.student, fatherName: 'F' } }, ctx('en', { marksheetFields: { ...DEFAULT_PRINT_SETTINGS.marksheetFields, fatherName: false, gradeScale: false } }));
    expect(el.textContent).not.toContain("Father's Name");
    expect(el.querySelector('.pr-scale')).toBeNull();
  });
});

describe('component columns', () => {
  it('only fills cells for components the subject has', () => {
    const { vms } = sampleData();
    const cols = componentColumns(vms[0].subjects);
    expect(cols).toEqual(['CQ', 'MCQ', 'PRACTICAL']);
    const el = renderProgressReport(vms[0], ctx('en'));
    const englishRow = [...el.querySelectorAll('.pr-marks tbody tr')].find((tr) => tr.textContent.startsWith('English'));
    expect(englishRow.querySelectorAll('td.is-na')).toHaveLength(2); // English has no MCQ/practical
  });
});

describe('full result sheet', () => {
  it('lists students in roll order with header rows and merit', () => {
    const { vms, subjects, exam } = sampleData();
    const el = renderResultSheet({ vms: [...vms].reverse(), subjects, exam, groupLabel: exam.groupLabel }, ctx('en'));
    expect(el.querySelectorAll('thead tr')).toHaveLength(2);
    const rolls = [...el.querySelectorAll('tbody tr td:first-child')].map((td) => td.textContent);
    expect(rolls).toEqual(['101', '102', '103']);
    expect(el.dataset.orientation).toBe('landscape');
  });
  it('print CSS keeps rows whole and repeats headers', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/print/print.css'), 'utf8');
    expect(css).toMatch(/thead \{ display: table-header-group/);
    expect(css).toMatch(/break-inside: avoid/);
  });
});

describe('fonts', () => {
  it('offers at least ten bundled English and ten bundled Bangla fonts', () => {
    expect(ENGLISH_FONTS.length).toBeGreaterThanOrEqual(10);
    expect(BANGLA_FONTS.length).toBeGreaterThanOrEqual(10);
    const bundle = readFileSync(resolve(process.cwd(), 'src/print/fonts-bundle.js'), 'utf8');
    for (const f of [...ENGLISH_FONTS, ...BANGLA_FONTS]) expect(bundle, f.id).toContain(`@fontsource/${f.id}/`);
  });
});
