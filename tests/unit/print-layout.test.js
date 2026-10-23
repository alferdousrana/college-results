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

describe('combined papers on the marksheet', () => {
  it('prints one row per paper with a shared grade', () => {
    const { vms } = sampleData();
    const el = renderProgressReport(vms[0], ctx('en'));
    const rows = [...el.querySelectorAll('.pr-marks tbody tr')];
    expect(rows[0].textContent).toContain('Bangla 1st Paper');
    expect(rows[1].textContent).toContain('Bangla 2nd Paper');
    expect(rows[0].querySelectorAll('.pr-combined')).toHaveLength(3);
    expect(rows[1].querySelectorAll('.pr-combined')).toHaveLength(0);
  });
  it('fit-to-width scale never exceeds 1 and shrinks wide tables', async () => {
    const { fitScale } = await import('../../src/print/print-runner.js');
    expect(fitScale(500)).toBe(1);
    expect(fitScale(2000)).toBeLessThan(0.6);
    expect(fitScale(2000, { paper: 'Legal' })).toBeGreaterThan(fitScale(2000));
  });
});

describe('component columns', () => {
  it('only fills cells for components the subject has', () => {
    const { vms } = sampleData();
    const cols = componentColumns(vms[0].subjects);
    expect(cols).toEqual(['CQ', 'MCQ', 'PRACTICAL']);
    const el = renderProgressReport(vms[0], ctx('en'));
    const englishRow = [...el.querySelectorAll('.pr-marks tbody tr')].find((tr) => tr.textContent.startsWith('English 1st'));
    expect(englishRow.querySelectorAll('td.is-na')).toHaveLength(2); // English has no MCQ/practical
  });
});

describe('full result sheet', () => {
  it('lists students in roll order with header rows and merit', () => {
    const { vms, subjects, exam } = sampleData();
    const el = renderResultSheet({ vms: [...vms].reverse(), subjects, exam, groupLabel: exam.groupLabel }, ctx('en'));
    expect(el.querySelectorAll('thead tr')).toHaveLength(2);
    const serials = [...el.querySelectorAll('tbody tr td:first-child')].map((td) => td.textContent);
    expect(serials).toEqual(['1', '2', '3']); // serial restarts at 1 in every group's sheet
    const rolls = [...el.querySelectorAll('tbody tr td:nth-child(2)')].map((td) => td.textContent);
    expect(rolls).toEqual(['101', '102', '103']);
    const heads = [...el.querySelectorAll('thead tr:first-child th')].map((x) => x.textContent);
    expect(heads).toContain('Bangla'); // 1st + 2nd papers share one combined column
    expect(heads).not.toContain('Bangla 1st Paper');
    const sub = [...el.querySelectorAll('thead tr:nth-child(2) th')].slice(0, 3).map((x) => x.textContent);
    expect(sub).toEqual(['1st', '2nd', 'Total']);
    expect(el.dataset.orientation).toBe('landscape');
  });
  it('print CSS keeps rows whole and repeats headers', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/print/print.css'), 'utf8');
    expect(css).toMatch(/thead \{ display: table-header-group/);
    expect(css).toMatch(/break-inside: avoid/);
  });
});

describe('round 8 print details', () => {
  it('shows subject codes on both documents and a watermark', () => {
    const { vms, subjects, exam } = sampleData();
    const withCodes = subjects.map((x) => ({ ...x, code: x.id === 'physics' ? '174' : x.id === 'bangla1' ? '101' : x.id === 'bangla2' ? '102' : null }));
    const sheet = renderResultSheet({ vms, subjects: withCodes, exam }, ctx('en'));
    expect(sheet.textContent).toContain('174');
    expect(sheet.textContent).toContain('101, 102');
    const vm = { ...vms[0], subjects: vms[0].subjects.map((x) => (x.id === 'physics' ? { ...x, code: '174' } : x)) };
    const rep = renderProgressReport(vm, { ...ctx('en'), institution: { ...ctx('en').institution, assets: { logo: 'data:image/png;base64,AAAA' } } });
    expect([...rep.querySelectorAll('.pr-marks th')].map((x) => x.textContent)).toContain('Code');
    expect(rep.textContent).toContain('174');
    expect(rep.querySelector('.pr-watermark')).not.toBeNull();
  });
});

describe('round 9 print details', () => {
  it('spreads the motto across the top and draws the name frame', () => {
    const { vms } = sampleData();
    const c = ctx('bn', { border: { style: 'nameText', widthPt: 3, color: '#123456' } });
    c.institution = { ...c.institution, header: { en: 'Education Peace Progress', bn: 'শিক্ষা শান্তি প্রগতি' } };
    const el = renderProgressReport(vms[0], c);
    expect([...el.querySelectorAll('.pr-motto span')].map((x) => x.textContent)).toEqual(['শিক্ষা', 'শান্তি', 'প্রগতি']);
    expect(el.querySelector('.pr-headtext')).toBeNull();
    expect(el.querySelectorAll('.pr-frame > div')).toHaveLength(4);
    expect(el.querySelector('.pr-frame__top').textContent).toContain('টেস্ট কলেজ');
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
