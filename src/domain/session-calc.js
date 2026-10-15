/**
 * Pure helpers that turn an examination "bundle" (session, sheets, session subjects, enrollments)
 * plus mark documents into calculation inputs, missing-mark reports and sharing checks.
 * No Firebase or DOM — used by the review screen, the mark-entry screen and the tests.
 *
 * bundle = { session, sheets: [{ id: groupId, subjectIds }], subjects: [sessionSubject], enrollments: [enrollment] }
 * marks  = { [subjectId]: { [studentId]: markDoc } }
 */
import { ABSENT } from './calculation/constants.js';

export function subjectDefinition(sessionSubject) {
  const d = sessionSubject.definition ?? {};
  return {
    id: sessionSubject.id,
    name: d.name ?? sessionSubject.id,
    code: d.code ?? null,
    components: (d.components ?? []).filter((c) => c.enabled !== false),
    passMarks: d.passMarks ?? null,
    countsTowardGpa: d.countsTowardGpa !== false,
    countsTowardTotal: d.countsTowardTotal !== false,
  };
}

export function activeEnrollments(bundle) {
  return bundle.enrollments.filter((e) => e.status !== 'withdrawn');
}

/** Subjects a given enrolled student sits. */
export function studentSubjectIds(bundle, enrollment) {
  const sheet = bundle.sheets.find((s) => s.id === enrollment.groupId);
  const groupSubjects = sheet?.subjectIds ?? [];
  return Array.isArray(enrollment.subjectIds) && enrollment.subjectIds.length
    ? groupSubjects.filter((id) => enrollment.subjectIds.includes(id))
    : groupSubjects;
}

export function studentsForSubject(bundle, subjectId) {
  return activeEnrollments(bundle).filter((e) => studentSubjectIds(bundle, e).includes(subjectId))
    .sort((a, b) => Number(a.roll) - Number(b.roll));
}

/** Converts a mark document into the engine's mark-entry shape. */
export function markEntry(doc) {
  if (!doc) return null;
  return { absent: doc.absent === true, components: { ...(doc.components ?? {}) } };
}

export function buildCalcInputs(bundle, marks) {
  const defs = Object.fromEntries(bundle.subjects.map((s) => [s.id, subjectDefinition(s)]));
  // Subjects keep the catalogue order (definition.order); a sheet's own order is the fallback.
  const ord = (id) => bundle.subjects.find((s) => s.id === id)?.definition?.order ?? 999;
  const subjectsByGroup = Object.fromEntries(bundle.sheets.map((sh) => [sh.id, (sh.subjectIds ?? []).map((id, i) => [id, i]).sort((a, b) => ord(a[0]) - ord(b[0]) || a[1] - b[1]).map(([id]) => defs[id]).filter(Boolean)]));
  const students = activeEnrollments(bundle).map((e) => ({
    studentId: e.id, roll: e.roll, groupId: e.groupId, optionalSubjectId: e.optionalSubjectId ?? null,
    subjectIds: studentSubjectIds(bundle, e),
  }));
  const markMap = {};
  for (const st of students) {
    markMap[st.studentId] = {};
    for (const sid of st.subjectIds) {
      const m = marks?.[sid]?.[st.studentId];
      if (m) markMap[st.studentId][sid] = markEntry(m);
    }
  }
  return { students, subjectsByGroup, marks: markMap, defs };
}

/**
 * Lists every missing REQUIRED component. A subject recorded as absent is not "missing".
 * Component-level 'AB' is recorded absence, also not missing.
 */
export function findMissingMarks(bundle, marks, { subjectId = null } = {}) {
  const out = [];
  for (const s of bundle.subjects) {
    if (subjectId && s.id !== subjectId) continue;
    const def = subjectDefinition(s);
    for (const e of studentsForSubject(bundle, s.id)) {
      const m = marks?.[s.id]?.[e.id];
      if (m?.absent) continue;
      for (const c of def.components) {
        if (c.required === false) continue;
        const v = m?.components?.[c.id];
        if (v === null || v === undefined || v === '') {
          out.push({ studentId: e.id, roll: e.roll, name: e.name, groupId: e.groupId, subjectId: s.id, componentId: c.id, componentLabel: c.label ?? c.id, teacherIds: s.teacherIds ?? [] });
        }
      }
    }
  }
  return out.sort((a, b) => Number(a.roll) - Number(b.roll) || a.subjectId.localeCompare(b.subjectId));
}

export function subjectProgress(bundle, marks, subjectId) {
  const students = studentsForSubject(bundle, subjectId);
  const missing = findMissingMarks(bundle, marks, { subjectId });
  const incompleteStudents = new Set(missing.map((m) => m.studentId));
  const absent = students.filter((e) => marks?.[subjectId]?.[e.id]?.absent || Object.values(marks?.[subjectId]?.[e.id]?.components ?? {}).includes(ABSENT)).length;
  return { total: students.length, complete: students.length - incompleteStudents.size, missingCells: missing.length, absent };
}

/**
 * Checks before "Share with all teachers". Errors block sharing; warnings are shown but allowed.
 * teachersById: { [uid]: { status, displayName } }
 */
export function validateForSharing(bundle, teachersById = {}) {
  const errors = [], warnings = [];
  if (!bundle.sheets.length) errors.push({ code: 'no-groups', message: 'Choose at least one group.' });
  for (const sh of bundle.sheets) if (!sh.subjectIds?.length) errors.push({ code: 'group-no-subjects', groupId: sh.id, message: `Group "${sh.id}" has no subjects.` });
  for (const s of bundle.subjects) {
    const def = subjectDefinition(s);
    if (!def.components.length) errors.push({ code: 'no-components', subjectId: s.id, message: `${labelOf(def.name)} has no mark components.` });
    const active = (s.teacherIds ?? []).filter((id) => teachersById[id]?.status === 'active');
    if (!active.length) errors.push({ code: 'no-teacher', subjectId: s.id, message: `${labelOf(def.name)} has no approved teacher assigned.` });
    else if (active.length !== (s.teacherIds ?? []).length) warnings.push({ code: 'inactive-teacher', subjectId: s.id, message: `${labelOf(def.name)} lists a teacher who is not active.` });
  }
  const enrollments = activeEnrollments(bundle);
  if (!enrollments.length) errors.push({ code: 'no-students', message: 'Add at least one student.' });
  const rolls = new Map();
  for (const e of enrollments) {
    if (rolls.has(String(e.roll))) errors.push({ code: 'duplicate-roll', message: `Roll ${e.roll} appears twice.` });
    rolls.set(String(e.roll), e.id);
    if (!bundle.sheets.some((sh) => sh.id === e.groupId)) errors.push({ code: 'student-group', message: `Roll ${e.roll} is not in a selected group.` });
    else if (!studentSubjectIds(bundle, e).length) errors.push({ code: 'student-subjects', message: `Roll ${e.roll} has no subjects.` });
    if (e.optionalSubjectId && !studentSubjectIds(bundle, e).includes(e.optionalSubjectId)) warnings.push({ code: 'optional', message: `Roll ${e.roll}: optional subject is not one of the student's subjects.` });
  }
  const teacherIds = [...new Set(bundle.subjects.flatMap((s) => s.teacherIds ?? []))];
  return {
    errors, warnings,
    summary: { groups: bundle.sheets.length, subjects: bundle.subjects.length, students: enrollments.length, teachers: teacherIds.length },
  };
}

export function unionTeacherIds(subjects) {
  return [...new Set(subjects.flatMap((s) => s.teacherIds ?? []))].sort();
}

function labelOf(name) { return typeof name === 'string' ? name : name?.en ?? ''; }
