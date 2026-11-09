import { describe, it, expect } from 'vitest';
import { examEntries, allExamEntries, formFromIds, baseSubjectId, paperOfId, assignmentCovers } from '../../src/domain/paper-scheme.js';
import { studentSubjectIds, checkStudentChoices, buildCalcInputs, subjectRole } from '../../src/domain/session-calc.js';
import { computeResultSheet, DEFAULT_POLICY, REFERENCE_SCALE_5 } from '../../src/domain/calculation/index.js';
import { attendanceRows, scheduledIds, cellKey } from '../../src/domain/routine.js';
import { buildSheetColumns } from '../../src/print/result-sheet.js';

const comps = [{ id: 'cq', label: 'CQ', maxMarks: 70, passMarks: 23 }, { id: 'mcq', label: 'MCQ', maxMarks: 30, passMarks: 10 }];
const physics = { id: 'physics', name: { en: 'Physics', bn: 'পদার্থবিজ্ঞান' }, papers: { first: '174', second: '175' }, components: comps };
const ict = { id: 'ict', name: { en: 'ICT' }, code: '275', components: comps };

describe('1st and 2nd paper forms', () => {
  it('separate (default): two subjects with their own codes, linked for the grade', () => {
    const e = examEntries(physics);
    expect(e.map((x) => [x.id, x.code, x.name.en, x.name.bn])).toEqual([
      ['physics__p1', '174', 'Physics 1st Paper', 'পদার্থবিজ্ঞান ১ম পত্র'], ['physics__p2', '175', 'Physics 2nd Paper', 'পদার্থবিজ্ঞান ২য় পত্র']]);
    expect(e.map((x) => x.combine)).toEqual([{ key: 'physics', name: { en: 'Physics', bn: 'পদার্থবিজ্ঞান' }, paper: '1st' }, { key: 'physics', name: { en: 'Physics', bn: 'পদার্থবিজ্ঞান' }, paper: '2nd' }]);
  });
  it('together: one subject, both codes', () => {
    expect(examEntries(physics, 'combined')).toMatchObject([{ id: 'physics', code: '174, 175', combine: null, paperScheme: 'combined' }]);
  });
  it('one paper only is graded on its own', () => {
    expect(examEntries(physics, 'second')).toMatchObject([{ id: 'physics__p2', code: '175', combine: null }]);
  });
  it('subjects without two paper codes are single subjects', () => {
    expect(examEntries(ict, 'separate')).toMatchObject([{ id: 'ict', code: '275' }]);
    expect(allExamEntries(physics).map((x) => x.id)).toEqual(['physics__p1', 'physics__p2', 'physics']);
  });
  it('reads the form back from routine or sheet ids', () => {
    expect(formFromIds(physics, ['physics__p1', 'physics__p2'])).toBe('separate');
    expect(formFromIds(physics, ['physics'])).toBe('combined');
    expect(formFromIds(physics, ['physics__p2'])).toBe('second');
    expect(formFromIds(physics, [])).toBe(null);
    expect([baseSubjectId('physics__p2'), paperOfId('physics__p1'), paperOfId('physics')]).toEqual(['physics', '1st', null]);
  });
  it('teacher assignments may cover one paper', () => {
    expect(assignmentCovers({ subjectId: 'physics', paper: null }, 'physics__p2')).toBe(true);
    expect(assignmentCovers({ subjectId: 'physics', paper: '1st' }, 'physics__p2')).toBe(false);
    expect(assignmentCovers({ subjectId: 'physics', paper: '1st' }, 'physics')).toBe(true);
  });
});

describe('a sheet with separate papers', () => {
  // Science: Physics compulsory (two papers), Biology / Higher Math as choice or 4th, both as two papers.
  const def = (id, base, paper) => ({ id, definition: { name: { en: id }, code: id, components: comps, combine: { key: base, name: { en: base }, paper } }, teacherIds: ['t'] });
  const bundle = {
    session: { state: 'mark_entry_in_progress' },
    sheets: [{ id: 'science', subjectIds: ['physics__p1', 'physics__p2', 'bio__p1', 'bio__p2', 'hm__p1', 'hm__p2'],
      subjectRoles: { physics__p1: 'compulsory', physics__p2: 'compulsory', bio__p1: 'choice', bio__p2: 'choice', hm__p1: 'choice', hm__p2: 'choice' }, choiceCount: 1, requiresFourth: true, examsPerStudent: 6 }],
    subjects: [def('physics__p1', 'physics', '1st'), def('physics__p2', 'physics', '2nd'), def('bio__p1', 'bio', '1st'), def('bio__p2', 'bio', '2nd'), def('hm__p1', 'hm', '1st'), def('hm__p2', 'hm', '2nd')],
    // Students choose catalogue subjects, not papers.
    enrollments: [{ id: 's1', roll: '1', groupId: 'science', subjectIds: ['hm', 'bio'], optionalSubjectId: 'bio' }],
  };
  it('a chosen subject brings both of its papers', () => {
    expect(studentSubjectIds(bundle, bundle.enrollments[0])).toEqual(['physics__p1', 'physics__p2', 'bio__p1', 'bio__p2', 'hm__p1', 'hm__p2']);
    expect(subjectRole(bundle.sheets[0], 'bio')).toBe('choice');
    expect(checkStudentChoices(bundle, bundle.enrollments[0])).toEqual({ errors: [], warnings: [], examCount: 6 });
  });
  it('papers are graded together and the 4th subject covers both papers', () => {
    const m = (cq, mcq) => ({ absent: false, components: { cq, mcq } });
    const marks = { physics__p1: { s1: m(50, 20) }, physics__p2: { s1: m(60, 25) }, bio__p1: { s1: m(40, 20) }, bio__p2: { s1: m(40, 20) }, hm__p1: { s1: m(55, 25) }, hm__p2: { s1: m(55, 25) } };
    const input = buildCalcInputs(bundle, marks);
    const sheet = computeResultSheet({ ...input, policy: DEFAULT_POLICY, scale: REFERENCE_SCALE_5 });
    const res = sheet.rows[0].result;
    const physicsResult = res.subjectResults.find((r) => r.subjectId === 'combo_physics');
    expect(physicsResult).toMatchObject({ fullMarks: 200, obtained: 155, isOptional: false });
    expect(res.subjectResults.find((r) => r.subjectId === 'combo_bio')).toMatchObject({ fullMarks: 200, isOptional: true });
    expect(res.subjectResults).toHaveLength(3);
  });
  it('a failed paper fails the subject', () => {
    const m = (cq, mcq) => ({ absent: false, components: { cq, mcq } });
    const marks = { physics__p1: { s1: m(10, 20) }, physics__p2: { s1: m(60, 25) }, bio__p1: { s1: m(40, 20) }, bio__p2: { s1: m(40, 20) }, hm__p1: { s1: m(55, 25) }, hm__p2: { s1: m(55, 25) } };
    const res = computeResultSheet({ ...buildCalcInputs(bundle, marks), policy: DEFAULT_POLICY, scale: REFERENCE_SCALE_5 }).rows[0].result;
    expect(res.subjectResults.find((r) => r.subjectId === 'combo_physics').passed).toBe(false);
  });
});

describe('routine and full sheet with papers', () => {
  it('attendance lists both papers for a student who chose the subject', () => {
    const routine = { slots: [{ id: 'am' }], days: [{ date: '2026-12-01', cells: { [cellKey('am', 'S')]: ['physics__p1'] } }, { date: '2026-12-03', cells: { [cellKey('am', 'S')]: ['physics__p2', 'bio'] } }] };
    expect(attendanceRows(routine, 'S', ['physics']).map((r) => r.subjectId)).toEqual(['physics__p1', 'physics__p2']);
    expect(attendanceRows(routine, 'S', ['bio__p1']).map((r) => r.subjectId)).toEqual(['bio']);
    expect(scheduledIds([routine], 'S').sort()).toEqual(['bio', 'physics__p1', 'physics__p2']);
  });
  it('alternatives with a shared column print in one combined column', () => {
    const p = (id, key, paper) => ({ id, code: id, combine: { key, name: { en: key }, paper } });
    const cols = buildSheetColumns([p('soc__p1', 'soc', '1st'), p('soc__p2', 'soc', '2nd'), p('sw__p1', 'sw', '1st'), p('sw__p2', 'sw', '2nd'), p('eco__p1', 'eco', '1st'), p('eco__p2', 'eco', '2nd')],
      { soc__p1: 'socx', soc__p2: 'socx', sw__p1: 'socx', sw__p2: 'socx', eco__p1: 'eco', eco__p2: 'eco' });
    expect(cols.map((c) => c.key)).toEqual(['combo_socx', 'combo_eco']);
    expect(cols[0].comboIds).toEqual(['combo_soc', 'combo_sw']);
    expect(cols[0].papers.map((x) => x.ids)).toEqual([['soc__p1', 'sw__p1'], ['soc__p2', 'sw__p2']]);
  });
});
