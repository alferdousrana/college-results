import { describe, it, expect } from 'vitest';
import {
  computeSubjectResult, computeStudentResult, rankStudents, computeResultSheet,
  REFERENCE_SCALE_5, DEFAULT_POLICY, ABSENT, SubjectState, OverallState, roundTo,
  validateGradingScale, gradeForPercentage, buildCalculationSnapshot,
} from '../../src/domain/calculation/index.js';
import { SUBJECTS, MARKS, EXPECTED } from '../fixtures/reference-progress-report.js';

const policy = DEFAULT_POLICY;
const scale = REFERENCE_SCALE_5;

describe('rounding', () => {
  it('avoids floating point drift', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(4.666, 2, 'truncate')).toBe(4.66);
    expect(roundTo(2.5, 0, 'half-even')).toBe(2);
  });
});

describe('grading scale', () => {
  it('reference scale is valid', () => expect(validateGradingScale(scale)).toEqual([]));
  it('detects overlap and missing fail band', () => {
    const bad = [{ grade: 'A', point: 5, min: 0, max: 60 }, { grade: 'B', point: 4, min: 50, max: 100 }];
    const errs = validateGradingScale(bad);
    expect(errs.some((e) => e.includes('overlap'))).toBe(true);
    expect(errs.some((e) => e.includes('fail band'))).toBe(true);
  });
  it('fractional percentage uses the lower band', () => expect(gradeForPercentage(79.5, scale).grade).toBe('A'));
});

describe('reference progress report', () => {
  const res = computeStudentResult({ subjects: SUBJECTS, marks: MARKS, policy, scale });
  it('reproduces subject totals', () => {
    for (const r of res.subjectResults) expect(r.obtained).toBe(EXPECTED.totals[r.subjectId]);
  });
  it('reproduces total, GPA and grade', () => {
    expect(res.totalObtained).toBe(EXPECTED.grandTotal);
    expect(res.gpa).toBe(EXPECTED.gpa);
    expect(res.grade).toBe(EXPECTED.grade);
    expect(res.state).toBe(OverallState.PASSED);
  });
});

describe('component-level failure', () => {
  const subject = { id: 'phy', name: 'Physics', components: [
    { id: 'cq', maxMarks: 50, passMarks: 17 },
    { id: 'mcq', maxMarks: 25, passMarks: 8 },
    { id: 'prac', maxMarks: 25, passMarks: 8 },
  ] };
  it('fails the subject when one component fails even if the total is high', () => {
    const r = computeSubjectResult(subject, { components: { cq: 50, mcq: 7, prac: 25 } }, policy, scale);
    expect(r.obtained).toBe(82);
    expect(r.passed).toBe(false);
    expect(r.grade).toBe('F');
    expect(r.failedComponents).toEqual(['mcq']);
  });
  it('a failed required subject fails the whole exam', () => {
    const res = computeStudentResult({
      subjects: [subject, SUBJECTS[0]],
      marks: { phy: { components: { cq: 50, mcq: 7, prac: 25 } }, bangla: MARKS.bangla },
      policy, scale,
    });
    expect(res.state).toBe(OverallState.FAILED);
    expect(res.gpa).toBe(0);
    expect(res.failedSubjects).toEqual(['phy']);
  });
});

describe('absent vs missing vs zero', () => {
  const s = { id: 'x', name: 'X', components: [{ id: 'w', maxMarks: 100, passMarks: 33 }] };
  it('missing marks make the subject incomplete, never zero', () => {
    const r = computeSubjectResult(s, { components: { w: null } }, policy, scale);
    expect(r.state).toBe(SubjectState.INCOMPLETE);
    expect(r.obtained).toBeNull();
    const overall = computeStudentResult({ subjects: [s], marks: {}, policy, scale });
    expect(overall.state).toBe(OverallState.INCOMPLETE);
    expect(overall.gpa).toBeNull();
  });
  it('absent is a fail by default, distinct from incomplete', () => {
    const r = computeSubjectResult(s, { components: { w: ABSENT } }, policy, scale);
    expect(r.state).toBe(SubjectState.ABSENT);
    expect(r.passed).toBe(false);
  });
  it('a real zero is a complete, failing mark', () => {
    const r = computeSubjectResult(s, { components: { w: 0 } }, policy, scale);
    expect(r.state).toBe(SubjectState.COMPLETE);
    expect(r.obtained).toBe(0);
  });
  it('invalid marks are reported, not clamped', () => {
    expect(computeSubjectResult(s, { components: { w: 120 } }, policy, scale).state).toBe(SubjectState.INVALID);
    expect(computeSubjectResult(s, { components: { w: -1 } }, policy, scale).state).toBe(SubjectState.INVALID);
  });
});

describe('optional (4th) subject', () => {
  const mk = (id) => ({ id, name: id, components: [{ id: 'w', maxMarks: 100, passMarks: 33 }] });
  const subjects = [mk('a'), mk('b'), mk('opt')];
  it('adds only points above the deduction and caps GPA', () => {
    const r = computeStudentResult({ subjects, marks: { a: { components: { w: 70 } }, b: { components: { w: 70 } }, opt: { components: { w: 85 } } }, policy, scale, optionalSubjectId: 'opt' });
    expect(r.gpa).toBe(5); // (4+4+(5-2))/2 = 5.5 → capped
    expect(r.gpaWithoutOptional).toBe(4);
  });
  it('failing the optional subject does not fail the exam', () => {
    const r = computeStudentResult({ subjects, marks: { a: { components: { w: 70 } }, b: { components: { w: 70 } }, opt: { components: { w: 10 } } }, policy, scale, optionalSubjectId: 'opt' });
    expect(r.passed).toBe(true);
    expect(r.gpa).toBe(4);
  });
});

describe('merit positions', () => {
  const row = (studentId, roll, gpa, total, passed = true, state = passed ? 'PASSED' : 'FAILED') =>
    ({ studentId, roll, result: { gpa, totalObtained: total, passed, state, failedSubjects: [] } });
  const rows = [row('a', 1, 5, 900), row('b', 2, 5, 900), row('c', 3, 4.8, 950), row('d', 4, 0, 990, false), row('e', 5, null, null, null, 'INCOMPLETE')];
  it('competition ranking shares ties and skips', () => {
    const p = rankStudents(rows, { method: 'competition' });
    expect([p.get('a'), p.get('b'), p.get('c'), p.get('d'), p.get('e')]).toEqual([1, 1, 3, 4, null]);
  });
  it('dense ranking', () => {
    const p = rankStudents(rows, { method: 'dense' });
    expect([p.get('a'), p.get('b'), p.get('c')]).toEqual([1, 1, 2]);
  });
  it('failed students can be excluded', () => {
    expect(rankStudents(rows, { rankFailed: false }).get('d')).toBeNull();
  });
});

describe('result sheet', () => {
  it('ranks groups separately', () => {
    const subj = [{ id: 's', name: 's', components: [{ id: 'w', maxMarks: 100 }] }];
    const sheet = computeResultSheet({
      students: [
        { studentId: 'sci1', roll: '101', groupId: 'science' },
        { studentId: 'hum1', roll: '201', groupId: 'humanities' },
      ],
      subjectsByGroup: { science: subj, humanities: subj },
      marks: { sci1: { s: { components: { w: 50 } } }, hum1: { s: { components: { w: 90 } } } },
      policy, scale,
    });
    expect(sheet.rows.map((r) => r.position)).toEqual([1, 1]);
    expect(sheet.highestByGroup.science.s).toBe(50);
  });
});

describe('snapshot', () => {
  it('is frozen and fingerprinted', () => {
    const snap = buildCalculationSnapshot({ policy, scale, subjects: SUBJECTS });
    expect(Object.isFrozen(snap.scale)).toBe(true);
    expect(snap.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(buildCalculationSnapshot({ policy, scale, subjects: SUBJECTS }).fingerprint).toBe(snap.fingerprint);
  });
});

describe('Phase 2 calculation cases', () => {
  const three = { id: 'sci', name: 'Sci', components: [
    { id: 'cq', maxMarks: 50, passMarks: 17 }, { id: 'mcq', maxMarks: 25, passMarks: 8 }, { id: 'prac', maxMarks: 25, passMarks: 8 }] };
  const r = (c) => computeSubjectResult(three, { components: c }, policy, scale);
  it('all components passed', () => { const x = r({ cq: 40, mcq: 20, prac: 22 }); expect(x.passed).toBe(true); expect(x.grade).toBe('A+'); });
  it('CQ failure despite a high total', () => { const x = r({ cq: 16, mcq: 25, prac: 25 }); expect(x.obtained).toBe(66); expect(x.passed).toBe(false); expect(x.failedComponents).toEqual(['cq']); });
  it('MCQ failure despite a high total', () => expect(r({ cq: 50, mcq: 7, prac: 25 }).passed).toBe(false));
  it('practical failure', () => { const x = r({ cq: 45, mcq: 20, prac: 7 }); expect(x.passed).toBe(false); expect(x.point).toBe(0); });
  it('marks equal to full marks are valid', () => { const x = r({ cq: 50, mcq: 25, prac: 25 }); expect(x.state).toBe(SubjectState.COMPLETE); expect(x.obtained).toBe(100); });
  it('marks above full marks are invalid', () => expect(r({ cq: 51, mcq: 25, prac: 25 }).state).toBe(SubjectState.INVALID));
  it('grade boundaries are inclusive at the minimum', () => {
    const one = { id: 'o', components: [{ id: 'w', maxMarks: 100 }] };
    const g = (m) => computeSubjectResult(one, { components: { w: m } }, policy, scale).grade;
    expect([g(80), g(79), g(70), g(69.99), g(33), g(32)]).toEqual(['A+', 'A', 'A', 'A-', 'D', 'F']);
  });
  it('GPA rounding follows the policy', () => {
    const s = ['a', 'b', 'c'].map((id) => ({ id, components: [{ id: 'w', maxMarks: 100 }] }));
    const marks = { a: { components: { w: 85 } }, b: { components: { w: 75 } }, c: { components: { w: 75 } } }; // (5+4+4)/3 = 4.3333
    expect(computeStudentResult({ subjects: s, marks, policy, scale }).gpa).toBe(4.33);
    expect(computeStudentResult({ subjects: s, marks: { ...marks, c: { components: { w: 85 } } }, policy: { ...policy, gpaRounding: 'truncate' }, scale }).gpa).toBe(4.66);
    expect(computeStudentResult({ subjects: s, marks: { ...marks, c: { components: { w: 85 } } }, policy, scale }).gpa).toBe(4.67);
  });
  it('subjects excluded from the total are graded but not summed', () => {
    const s = [{ id: 'a', components: [{ id: 'w', maxMarks: 100 }] }, { id: 'pe', countsTowardTotal: false, countsTowardGpa: false, components: [{ id: 'w', maxMarks: 50 }] }];
    const res = computeStudentResult({ subjects: s, marks: { a: { components: { w: 80 } }, pe: { components: { w: 40 } } }, policy, scale });
    expect(res.totalObtained).toBe(80); expect(res.gpa).toBe(5);
  });
  it('an incomplete result sheet ranks only complete students', () => {
    const subj = [{ id: 's', components: [{ id: 'w', maxMarks: 100 }] }];
    const sheet = computeResultSheet({ students: [{ studentId: 'a', roll: '1' }, { studentId: 'b', roll: '2' }, { studentId: 'c', roll: '3' }], subjectsByGroup: { _: subj },
      marks: { a: { s: { components: { w: 70 } } }, b: {}, c: { s: { components: { w: 90 } } } }, policy, scale });
    expect(sheet.rows.map((x) => x.position)).toEqual([2, null, 1]);
    expect(sheet.summary.incomplete).toBe(1);
  });
  it('students sit only their own subject list (electives)', () => {
    const subj = [{ id: 'x', components: [{ id: 'w', maxMarks: 100 }] }, { id: 'y', components: [{ id: 'w', maxMarks: 100 }] }];
    const sheet = computeResultSheet({ students: [{ studentId: 'a', roll: '1', subjectIds: ['x'] }], subjectsByGroup: { _: subj }, marks: { a: { x: { components: { w: 90 } } } }, policy, scale });
    expect(sheet.rows[0].result.state).toBe(OverallState.PASSED);
  });
});
