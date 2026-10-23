import { describe, it, expect } from 'vitest';
import { findMissingMarks, validateForSharing, buildCalcInputs, subjectProgress, checkStudentChoices, studentSubjectIds } from '../../src/domain/session-calc.js';

const comps = [{ id: 'cq', label: 'CQ', maxMarks: 70 }, { id: 'mcq', label: 'MCQ', maxMarks: 30 }];
const bundle = {
  session: { state: 'mark_entry_in_progress' },
  sheets: [{ id: 'science', subjectIds: ['phy', 'bio'], subjectRoles: { bio: 'choice' } }, { id: 'humanities', subjectIds: ['eco'] }],
  subjects: [{ id: 'phy', definition: { name: 'Phy', components: comps }, teacherIds: ['t1'] }, { id: 'bio', definition: { name: 'Bio', components: comps }, teacherIds: ['t2'] },
    { id: 'eco', definition: { name: 'Eco', components: comps }, teacherIds: [] }],
  enrollments: [{ id: 's1', roll: '101', name: { en: 'A' }, groupId: 'science', subjectIds: ['bio'] }, { id: 's2', roll: '102', name: { en: 'B' }, groupId: 'science' },
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

describe('group subject choices', () => {
  const b = {
    session: {}, subjects: [],
    sheets: [{ id: 'science', subjectIds: ['b1', 'phy', 'math', 'bio', 'agri'], subjectRoles: { math: 'choice', bio: 'choice', agri: 'fourth' }, choiceCount: 1, requiresFourth: true, examsPerStudent: 4 }],
    enrollments: [],
  };
  const check = (e) => checkStudentChoices(b, { roll: '1', groupId: 'science', ...e });
  it('accepts one main choice plus a 4th subject', () => {
    const r = check({ subjectIds: ['math', 'bio'], optionalSubjectId: 'bio' });
    expect(r.errors).toEqual([]); expect(r.examCount).toBe(4);
  });
  it('requires the right number of choices and a 4th subject', () => {
    expect(check({ subjectIds: [] }).errors.length).toBe(2);
    expect(check({ subjectIds: ['math', 'bio'], optionalSubjectId: 'phy' }).errors.join()).toMatch(/4th subject must be/);
  });
  it('counts papers and warns on a different total', () => {
    expect(check({ subjectIds: ['math', 'agri'], optionalSubjectId: 'agri' }).warnings).toEqual([]);
    expect(check({ subjectIds: ['math'], optionalSubjectId: null }).warnings.length).toBe(1);
  });
  it('a student only sits compulsory + chosen subjects', () => {
    expect(studentSubjectIds(b, { groupId: 'science', subjectIds: ['bio'], optionalSubjectId: 'agri' })).toEqual(['b1', 'phy', 'bio', 'agri']);
  });
});

import { subjectLabelForClass } from '../../src/domain/paper-scheme.js';
describe('paper schemes', () => {
  const physics = { name: { en: 'Physics', bn: 'পদার্থবিজ্ঞান' }, papers: { first: '174', second: '175' }, paperScheme: { 'class-11': 'combined', 'class-12': 'second' } };
  it('Class Eleven examines both papers together; Class Twelve the 2nd paper', () => {
    expect(subjectLabelForClass(physics, 'class-11')).toMatchObject({ name: { en: 'Physics' }, code: '174, 175', scheme: 'combined' });
    expect(subjectLabelForClass(physics, 'class-12')).toMatchObject({ name: { en: 'Physics 2nd Paper', bn: 'পদার্থবিজ্ঞান ২য় পত্র' }, code: '175' });
  });
  it('subjects without papers keep their own name and code', () => {
    expect(subjectLabelForClass({ name: { en: 'ICT' }, code: '275' }, 'class-12')).toMatchObject({ name: { en: 'ICT' }, code: '275', scheme: null });
  });
});

import { bnDate, attendanceRows, scheduleCheck, cellKey } from '../../src/domain/routine.js';
describe('routine and attendance', () => {
  const routine = { slots: [{ id: 'am', label: 'সকাল ১০টা' }, { id: 'pm', label: 'বিকাল ১.৩০টা' }],
    days: [{ date: '2024-02-12', cells: { [cellKey('am', 'S')]: ['b2'] } }, { date: '2024-02-08', cells: { [cellKey('am', 'S')]: ['b1'], [cellKey('pm', 'S')]: ['ict'] } },
      { date: '2024-02-20', cells: { [cellKey('am', 'S')]: ['phy', 'acc'], [cellKey('am', 'T')]: ['phy'] } }] };
  it('formats Bangla dates and weekdays', () => expect(bnDate('2024-02-08')).toEqual({ date: '০৮/০২/২০২৪', day: 'বৃহস্পতিবার' }));
  it('builds a student\'s attendance rows from the routine, only for subjects they sit', () => {
    const rows = attendanceRows(routine, 'S', ['b1', 'b2', 'ict', 'phy']);
    expect(rows.map((r) => `${r.date}:${r.subjectId}`)).toEqual(['2024-02-08:b1', '2024-02-08:ict', '2024-02-12:b2', '2024-02-20:phy']);
  });
  it('reports unscheduled and repeated subjects', () => {
    expect(scheduleCheck(routine, 'S', ['b1', 'b2', 'ict', 'phy', 'acc', 'eco'])).toEqual({ missing: ['eco'], repeated: [] });
  });
});

import { examDateRange } from '../../src/domain/routine.js';
describe('dates from the routine', () => {
  it('gives the first and last exam day of one class and examination', () => {
    const r = [{ days: [{ date: '2024-02-20', cells: { 'am|A': ['x'] } }, { date: '2024-02-08', cells: { 'am|A': ['y'], 'pm|B': ['z'] } }, { date: '2024-03-05', cells: { 'pm|B': ['z'] } }] }];
    expect(examDateRange(r, 'A')).toEqual({ first: '2024-02-08', last: '2024-02-20' });
    expect(examDateRange(r, 'B')).toEqual({ first: '2024-02-08', last: '2024-03-05' });
    expect(examDateRange(r, 'C')).toBeNull();
  });
});

import { countdown, isPastDeadline, greeting } from '../../src/domain/deadline.js';
describe('mark-entry deadline', () => {
  it('counts down and closes after the deadline', () => {
    const now = Date.UTC(2026, 10, 1, 0, 0, 0);
    expect(countdown(now + 90061000, now)).toMatchObject({ days: 1, hours: 1, minutes: 1, seconds: 1 });
    expect(isPastDeadline({ markEntryDeadline: now - 1 }, now)).toBe(true);
    expect(isPastDeadline({ markEntryDeadline: new Date(now + 1).toISOString() }, now)).toBe(false);
    expect(isPastDeadline({}, now)).toBe(false);
  });
  it('greets by time of day', () => {
    expect(greeting(new Date(2026, 0, 1, 8)).bn).toBe('সুপ্রভাত');
    expect(greeting(new Date(2026, 0, 1, 19)).en).toBe('Good evening');
  });
});
