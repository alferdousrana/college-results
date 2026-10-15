/**
 * Examination sessions (result sheets).
 *   examSessions/{year__class__examDef}
 *     sheets/{groupId}               { subjectIds, groupLabel }
 *     sessionSubjects/{subjectId}    { definition (frozen copy of catalogue subject), groupIds, teacherIds, submission }
 *     enrollments/{studentId}        { roll, name{en,bn}, groupId, subjectIds, optionalSubjectId, section, shift }
 */
import { getBackend } from '../backend/index.js';
import { C, ids, paths } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit, AuditAction } from './audit-repository.js';
import { notify } from './notifications-repository.js';
import { ExamState, canTransition } from '../../domain/exam-lifecycle.js';
import { unionTeacherIds, validateForSharing } from '../../domain/session-calc.js';

const EDITABLE_ROSTER = [ExamState.DRAFT, ExamState.READY, ExamState.IN_PROGRESS];

export async function getSession(id) { return (await getBackend()).get(paths.session(id)); }

export async function loadSessionBundle(sid) {
  const b = await getBackend();
  const [session, sheets, subjects, enrollments] = await Promise.all([
    b.get(paths.session(sid)),
    b.list(paths.sheets(sid)).then((r) => r.items),
    b.list(paths.sessionSubjects(sid)).then((r) => r.items),
    b.list(paths.enrollments(sid), { orderBy: [['rollNumber', 'asc']] }).then((r) => r.items),
  ]);
  if (!session) throw Object.assign(new Error('Result sheet not found or you do not have access.'), { code: 'not-found' });
  return { session, sheets, subjects, enrollments };
}

export async function listSessions({ yearId = null, state = null, limit = 50 } = {}) {
  const b = await getBackend();
  const where = [];
  if (yearId) where.push(['yearId', '==', yearId]);
  if (state) where.push(Array.isArray(state) ? ['state', 'in', state] : ['state', '==', state]);
  return (await b.list(C.SESSIONS, { where, orderBy: [['updatedAt', 'desc']], limit })).items;
}

export async function listTeacherSessions(teacherId, max = 50) {
  const b = await getBackend();
  return (await b.list(C.SESSIONS, { where: [['teacherIds', 'array-contains', teacherId]], orderBy: [['updatedAt', 'desc']], limit: max })).items;
}

function enrollmentData(r) {
  return {
    studentId: r.studentId, roll: String(r.roll), rollNumber: Number(r.roll), name: r.name, groupId: r.groupId,
    subjectIds: r.subjectIds ?? null, optionalSubjectId: r.optionalSubjectId ?? null,
    section: r.section ?? null, shift: r.shift ?? null, status: r.status ?? 'active',
  };
}

/**
 * Saves the whole draft (wizard). Creating fails if a sheet for the same year/class/exam exists.
 * payload: { yearId, classId, examDefId, title{en,bn}, heldOn, startDate, endDate, notes,
 *            groups: [{ groupId, subjectIds }], subjects: [{ subjectId, definition, teacherIds }], roster: [...] }
 */
export async function saveDraft(actor, existingId, payload) {
  const b = await getBackend();
  const sid = existingId ?? ids.session(payload.yearId, payload.classId, payload.examDefId);
  const groupIds = payload.groups.map((g) => g.groupId);
  const subjectGroupIds = (subjectId) => payload.groups.filter((g) => g.subjectIds.includes(subjectId)).map((g) => g.groupId);
  const subjects = payload.subjects.filter((s) => subjectGroupIds(s.subjectId).length);
  const teacherIds = unionTeacherIds(subjects);

  await b.transaction(async (tx) => {
    const cur = await tx.get(paths.session(sid));
    if (!existingId && cur) throw Object.assign(new Error('A result sheet for this class, year and examination already exists. Open it from Result sheets.'), { code: 'duplicate' });
    if (existingId && cur?.state !== ExamState.DRAFT) throw new Error('Only draft result sheets can be edited this way.');
    const base = {
      yearId: payload.yearId, classId: payload.classId, examDefId: payload.examDefId,
      title: payload.title, heldOn: payload.heldOn ?? null, startDate: payload.startDate ?? null, endDate: payload.endDate ?? null,
      notes: payload.notes ?? null, groupIds, teacherIds, studentCount: payload.roster.length, subjectCount: subjects.length,
      updatedAt: serverTime(),
    };
    if (cur) tx.update(paths.session(sid), base);
    else tx.set(paths.session(sid), { ...base, state: ExamState.DRAFT, createdBy: actor.id, createdAt: serverTime() });
    addAudit(b, tx, { action: cur ? AuditAction.SESSION_UPDATED : AuditAction.SESSION_CREATED, actor, targetPath: paths.session(sid) });
  });

  // Children: replace sets, deleting entries that were removed from the draft.
  const existing = existingId ? await loadSessionBundle(sid) : { sheets: [], subjects: [], enrollments: [] };
  const batch = b.batch();
  for (const g of payload.groups) batch.set(`${paths.sheets(sid)}/${g.groupId}`, { subjectIds: g.subjectIds, groupLabel: g.groupLabel ?? null, updatedAt: serverTime() });
  existing.sheets.filter((s) => !groupIds.includes(s.id)).forEach((s) => batch.delete(`${paths.sheets(sid)}/${s.id}`));
  for (const s of subjects) {
    batch.set(paths.sessionSubject(sid, s.subjectId), {
      definition: s.definition, groupIds: subjectGroupIds(s.subjectId), teacherIds: s.teacherIds ?? [],
      teacherNames: s.teacherNames ?? {}, submission: { state: 'open' }, updatedAt: serverTime(),
    });
  }
  existing.subjects.filter((s) => !subjects.some((x) => x.subjectId === s.id)).forEach((s) => batch.delete(paths.sessionSubject(sid, s.id)));
  for (const r of payload.roster) batch.set(`${paths.enrollments(sid)}/${r.studentId}`, enrollmentData(r));
  existing.enrollments.filter((e) => !payload.roster.some((r) => r.studentId === e.id)).forEach((e) => batch.delete(`${paths.enrollments(sid)}/${e.id}`));
  await batch.commit();
  return sid;
}

/** Validates, then moves Draft → Ready for mark entry and notifies every assigned teacher. */
export async function shareWithTeachers(actor, sid, teachersById) {
  const bundle = await loadSessionBundle(sid);
  const check = validateForSharing(bundle, teachersById);
  if (check.errors.length) throw Object.assign(new Error('Fix the listed problems before sharing.'), { code: 'invalid', check });
  const b = await getBackend();
  await b.transaction(async (tx) => {
    const s = await tx.get(paths.session(sid));
    if (!canTransition(s.state, ExamState.READY, actor.role)) throw new Error('This result sheet has already been shared.');
    tx.update(paths.session(sid), { state: ExamState.READY, sharedAt: serverTime(), sharedBy: actor.id, updatedAt: serverTime() });
    addAudit(b, tx, { action: AuditAction.SESSION_SHARED, actor, targetPath: paths.session(sid), before: { state: s.state }, after: { state: ExamState.READY, ...check.summary } });
  });
  const nb = b.batch();
  for (const uid of bundle.session.teacherIds ?? []) {
    await notify({ recipientUid: uid, type: 'exam_shared', params: { title: bundle.session.title }, link: `/teacher/exam?sid=${encodeURIComponent(sid)}` }, nb);
  }
  await nb.commit();
  return check;
}

/** Lifecycle change guarded client-side (for clear messages) and by rules (for security). */
export async function transitionSession(actor, sid, to, { reason = null, extra = {} } = {}) {
  const b = await getBackend();
  let from;
  await b.transaction(async (tx) => {
    const s = await tx.get(paths.session(sid));
    if (!s) throw new Error('Result sheet not found.');
    from = s.state;
    if (!canTransition(from, to, actor.role)) throw Object.assign(new Error(`This result sheet cannot move from "${from}" to "${to}".`), { code: 'invalid-transition' });
    tx.update(paths.session(sid), { state: to, updatedAt: serverTime(), ...extra });
    addAudit(b, tx, { action: AuditAction.SESSION_STATE_CHANGED, actor, targetPath: paths.session(sid), before: { state: from }, after: { state: to }, reason });
  });
  return from;
}

/** Reassigning a subject's teacher never touches marks; `updatedBy` on marks keeps who entered them. */
export async function reassignTeachers(actor, sid, subjectId, teacherIds, teacherNames) {
  const b = await getBackend();
  const bundle = await loadSessionBundle(sid);
  if ([ExamState.PUBLISHED, ExamState.ARCHIVED].includes(bundle.session.state)) throw new Error('Published result sheets cannot be reassigned.');
  const subjects = bundle.subjects.map((s) => (s.id === subjectId ? { ...s, teacherIds } : s));
  const before = bundle.subjects.find((s) => s.id === subjectId)?.teacherIds ?? [];
  const batch = b.batch();
  batch.update(paths.sessionSubject(sid, subjectId), { teacherIds, teacherNames, updatedAt: serverTime() });
  batch.update(paths.session(sid), { teacherIds: unionTeacherIds(subjects), updatedAt: serverTime() });
  addAudit(b, batch, { action: AuditAction.ASSIGNMENT_CHANGED, actor, targetPath: paths.sessionSubject(sid, subjectId), before: { teacherIds: before }, after: { teacherIds } });
  if (bundle.session.state !== ExamState.DRAFT) {
    for (const uid of teacherIds.filter((t) => !before.includes(t))) {
      await notify({ recipientUid: uid, type: 'exam_shared', params: { title: bundle.session.title }, link: `/teacher/exam?sid=${encodeURIComponent(sid)}` }, batch);
    }
  }
  await batch.commit();
}

/** Late roster changes (after sharing, before review). Marks of a removed student are kept. */
export async function upsertEnrollment(actor, sid, row) {
  const b = await getBackend();
  const s = await b.get(paths.session(sid));
  if (!EDITABLE_ROSTER.includes(s.state)) throw new Error('The student list is locked at this stage.');
  const batch = b.batch();
  batch.set(`${paths.enrollments(sid)}/${row.studentId}`, enrollmentData(row));
  addAudit(b, batch, { action: AuditAction.SESSION_UPDATED, actor, targetPath: `${paths.enrollments(sid)}/${row.studentId}`, after: { roll: row.roll, status: row.status ?? 'active' } });
  await batch.commit();
}
