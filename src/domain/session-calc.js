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
    combine: d.combine?.key ? d.combine : null,   // { key, name{en,bn}, paper: '1st'|'2nd', passMarks? }
    order: d.order ?? null,
  };
}

/** Role of a subject inside a group's sheet: 'compulsory' (default), 'choice' (student picks) or 'fourth' (4th-subject only). */
export function subjectRole(sheet, subjectId) {
  return sheet?.subjectRoles?.[subjectId] ?? 'compulsory';
}

export function activeEnrollments(bundle) {
  return bundle.enrollments.filter((e) => e.status !== 'withdrawn');
}

/**
 * Subjects a given enrolled student sits: every compulsory subject of the group, plus the
 * student's chosen subjects (enrollment.subjectIds) and 4th subject (optionalSubjectId).
 */
export function studentSubjectIds(bundle, enrollment) {
  const sheet = bundle.sheets.find((s) => s.id === enrollment.groupId);
  const groupSubjects = sheet?.subjectIds ?? [];
  const chosen = new Set([...(Array.isArray(enrollment.subjectIds) ? enrollment.subjectIds : []), enrollment.optionalSubjectId].filter(Boolean));
  return groupSubjects.filter((id) => subjectRole(sheet, id) === 'compulsory' || chosen.has(id));
}

/** Checks one student's subject choices against the group rules. Returns { errors, warnings, examCount }. */
export function checkStudentChoices(bundle, enrollment) {
  const sheet = bundle.sheets.find((s) => s.id === enrollment.groupId);
  const errors = [], warnings = [];
  if (!sheet) return { errors, warnings, examCount: 0 };
  const chosen = (enrollment.subjectIds ?? []).filter((id) => subjectRole(sheet, id) === 'choice' && id !== enrollment.optionalSubjectId);
  const need = Number(sheet.choiceCount ?? 0);
  if (need && chosen.length !== need) errors.push(`Roll ${enrollment.roll}: choose ${need} group subject(s) (${chosen.length} chosen).`);
  if (sheet.requiresFourth && !enrollment.optionalSubjectId) errors.push(`Roll ${enrollment.roll}: choose the 4th subject.`);
  if (enrollment.optionalSubjectId) {
    const r = subjectRole(sheet, enrollment.optionalSubjectId);
    if (!(sheet.subjectIds ?? []).includes(enrollment.optionalSubjectId) || r === 'compulsory') errors.push(`Roll ${enrollment.roll}: the 4th subject must be a choice or 4th-subject option.`);
    if (chosen.includes(enrollment.optionalSubjectId)) errors.push(`Roll ${enrollment.roll}: the 4th subject is also chosen as a main subject.`);
  }
  const examCount = studentSubjectIds(bundle, enrollment).length;
  if (sheet.examsPerStudent && examCount !== Number(sheet.examsPerStudent)) warnings.push(`Roll ${enrollment.roll}: sits ${examCount} papers (expected ${sheet.examsPerStudent}).`);
  return { errors, warnings, examCount };
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
    else {
      const c = checkStudentChoices(bundle, e);
      c.errors.forEach((m) => errors.push({ code: 'student-choices', message: m }));
      c.warnings.forEach((m) => warnings.push({ code: 'student-exam-count', message: m }));
    }
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
