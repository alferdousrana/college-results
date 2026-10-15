/**
 * Marksheet view model — the single printable/publishable shape. Text values are bilingual
 * ({ en, bn }) so one stored result can be printed in either language later.
 * Stored in results/{studentId}.vm and (sanitized) in publicResults/{hash}.vm, so a reprint always
 * matches what was published, even after student records or settings change.
 */
export function buildStudentViewModel({ exam, enrollment, student = null, defs, row, highest = {}, customFieldDefs = [] }) {
  const byId = Object.fromEntries(row.result.subjectResults.map((r) => [r.subjectId, r]));
  // Optional (4th) subject is listed last, as on printed marksheets.
  const subjectIds = [...row.result.subjectResults].sort((a, b) => Number(Boolean(a.isOptional)) - Number(Boolean(b.isOptional))).map((r) => r.subjectId);
  const custom = customFieldDefs.filter((f) => f.enabled !== false).map((f) => ({ key: f.key, label: f.label, value: student?.customFields?.[f.key] ?? null, showOnMarksheet: f.showOnMarksheet !== false, showOnSheet: f.showOnSheet === true }));
  return {
    exam,
    student: {
      name: { en: enrollment.name?.en ?? student?.nameEn ?? '', bn: enrollment.name?.bn ?? student?.nameBn ?? '' },
      roll: String(enrollment.roll), section: enrollment.section ?? student?.current?.section ?? null, shift: enrollment.shift ?? student?.current?.shift ?? null,
      fatherName: student?.fatherName ?? null, motherName: student?.motherName ?? null, studentCode: student?.studentCode ?? null,
      groupId: enrollment.groupId, custom,
    },
    subjects: subjectIds.map((id) => {
      const r = byId[id]; const d = defs[id];
      const comps = Object.fromEntries((r.componentResults ?? []).map((c) => [c.componentId, c.raw]));
      return {
        id, name: d.name, code: d.code ?? null, fullMarks: r.fullMarks, highest: highest[id] ?? null,
        components: d.components.map((c) => ({ id: c.id, type: c.type ?? null, label: c.label ?? c.id, maxMarks: c.maxMarks, paper: c.paper ?? null, value: r.state === 'ABSENT' ? 'AB' : comps[c.id] ?? null })),
        obtained: r.obtained ?? null, point: r.point ?? null, grade: r.grade ?? null, passed: r.passed ?? null,
        state: r.state, isOptional: Boolean(r.isOptional), failedComponents: r.failedComponents ?? [],
      };
    }),
    totals: { obtained: row.result.totalObtained, full: row.result.totalFull },
    gpa: row.result.gpa, gpaWithoutOptional: row.result.gpaWithoutOptional, grade: row.result.grade, status: row.result.state,
    position: row.position == null ? null : { value: row.position, of: row.poolSize },
  };
}

/** Removes fields the college has not allowed on public lookups. */
export function sanitizeViewModel(vm, allowedFields = []) {
  const allow = new Set(allowedFields);
  const s = vm.student;
  return {
    ...vm,
    student: {
      name: s.name, roll: s.roll, groupId: s.groupId,
      section: allow.has('section') ? s.section : null, shift: allow.has('shift') ? s.shift : null,
      fatherName: allow.has('fatherName') ? s.fatherName : null, motherName: allow.has('motherName') ? s.motherName : null,
      studentCode: allow.has('studentCode') ? s.studentCode : null,
      custom: (s.custom ?? []).filter((c) => allow.has(`custom:${c.key}`)),
    },
  };
}
