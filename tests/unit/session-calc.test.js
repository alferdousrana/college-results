import { describe, it, expect } from 'vitest';
import { findMissingMarks, validateForSharing, buildCalcInputs, subjectProgress } from '../../src/domain/session-calc.js';

const comps = [{ id: 'cq', label: 'CQ', maxMarks: 70 }, { id: 'mcq', label: 'MCQ', maxMarks: 30 }];
const bundle = {
  session: { state: 'mark_entry_in_progress' },
  sheets: [{ id: 'science', subjectIds: ['phy', 'bio'] }, { id: 'humanities', subjectIds: ['eco'] }],
  subjects: [{ id: 'phy', definition: { name: 'Phy', components: comps }, teacherIds: ['t1'] }, { id: 'bio', definition: { name: 'Bio', components: comps }, teacherIds: ['t2'] },
    { id: 'eco', definition: { name: 'Eco', components: comps }, teacherIds: [] }],
  enrollments: [{ id: 's1', roll: '101', name: { en: 'A' }, groupId: 'science' }, { id: 's2', roll: '102', name: { en: 'B' }, groupId: 'science', subjectIds: ['phy'] },
    { id: 's3', roll: '201', name: { en: 'C' }, groupId: 'humanities' }],
};

describe('missing marks', () => {
  const marks = { phy: { s1: { components: { cq: 50, mcq: null } }, s2: { absent: true, components: {} } }, bio: {}, eco: {} };
  it('lists every missing required component; absent is not missing', () => {
    const m = findMissingMarks(bundle, marks);
    expect(m.filter((x) => x.subjectId === 'phy').map((x) => `${x.roll}:${x.componentId}`)).toEqual(['101:mcq']);
    expect(m.filter((x) => x.subjectId === 'bio').map((x) => x.roll)).toEqual(['101', '101']); // s2 does not take biology
    expect(m.find((x) => x.subjectId === 'phy').teacherIds).toEqual(['t1']);
  });
  it('filters to one subject for a teacher', () => expect(findMissingMarks(bundle, marks, { subjectId: 'eco' })).toHaveLength(2));
  it('progress counts', () => expect(subjectProgress(bundle, marks, 'phy')).toEqual({ total: 2, complete: 1, missingCells: 1, absent: 1 }));
  it('builds engine inputs per student subject list', () => {
    const input = buildCalcInputs(bundle, marks);
    expect(input.students.find((s) => s.studentId === 's2').subjectIds).toEqual(['phy']);
    expect(input.subjectsByGroup.science.map((s) => s.id)).toEqual(['phy', 'bio']);
  });
});

describe('sharing checks', () => {
  it('blocks a subject without an approved teacher and duplicate rolls', () => {
    const b = { ...bundle, enrollments: [...bundle.enrollments, { id: 's9', roll: '101', name: { en: 'Z' }, groupId: 'science' }] };
    const r = validateForSharing(b, { t1: { status: 'active' }, t2: { status: 'pending' } });
    const codes = r.errors.map((e) => e.code);
    expect(codes).toContain('no-teacher');
    expect(codes).toContain('duplicate-roll');
    expect(r.errors.filter((e) => e.code === 'no-teacher').map((e) => e.subjectId).sort()).toEqual(['bio', 'eco']); // pending teacher does not count
  });
  it('passes a complete setup', () => {
    const b = { ...bundle, subjects: bundle.subjects.map((s) => ({ ...s, teacherIds: ['t1'] })) };
    expect(validateForSharing(b, { t1: { status: 'active' } }).errors).toEqual([]);
  });
});
