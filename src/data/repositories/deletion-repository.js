/**
 * Safe deletion. Something can be deleted only when nothing else depends on it, so old marksheets,
 * merit lists and the audit trail never break. The one exception — deleting a whole result sheet
 * (for test or mistaken data) — needs a typed confirmation and a reason, and is recorded in the audit log.
 * Audit log entries themselves can never be deleted.
 */
import { getBackend } from '../backend/index.js';
import { C, paths } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit } from './audit-repository.js';
import { loadSessionBundle } from './sessions-repository.js';
import { invalidateCatalogueCache } from './catalogue-repository.js';
import { ExamState } from '../../domain/exam-lifecycle.js';

const inUse = (message, uses = []) => Object.assign(new Error(message), { code: 'in-use', uses });

async function allSessions(b) {
  return (await b.list(C.SESSIONS, { limit: 2000 })).items;
}

/** Deletes a whole result sheet and everything inside it (marks, results, publications, public lookup). */
export async function deleteResultSheet(actor, sid, reason, onProgress) {
  const b = await getBackend();
  const bundle = await loadSessionBundle(sid);
  const s = bundle.session;
  const isDraft = s.state === ExamState.DRAFT;
  if (!isDraft && !reason?.trim()) throw new Error('Enter the reason for deleting this result sheet.');
  // 1) Mark it as being deleted (rules then allow removing its contents; an interrupted delete can be retried).
  if (!isDraft) await b.update(paths.session(sid), { deleting: { reason, by: actor.id, at: serverTime() } });
  const batch = b.batch();
  for (const sub of bundle.subjects) {
    const marks = (await b.list(paths.marks(sid, sub.id))).items;
    marks.forEach((m) => batch.delete(`${paths.marks(sid, sub.id)}/${m.id}`));
    batch.delete(paths.sessionSubject(sid, sub.id));
  }
  bundle.sheets.forEach((x) => batch.delete(`${paths.sheets(sid)}/${x.id}`));
  const results = (await b.list(paths.results(sid))).items;
  results.forEach((r) => batch.delete(`${paths.results(sid)}/${r.id}`));
  const pubs = (await b.list(paths.publications(sid))).items;
  const publicIds = new Set([...pubs.flatMap((p) => p.publicIds ?? []), ...(s.publicIds ?? [])]);
  publicIds.forEach((id) => batch.delete(`${C.PUBLIC_RESULTS}/${id}`));
  pubs.forEach((p) => batch.delete(`${paths.publications(sid)}/${p.id}`));
  if (s.publicId) batch.delete(`${C.PUBLIC_INDEX}/${s.publicId}`);
  for (const e of bundle.enrollments) {
    batch.delete(`${paths.enrollments(sid)}/${e.id}`);
    if (s.publishedVersion) batch.delete(`${paths.studentHistory(e.studentId ?? e.id)}/${sid}`);
  }
  await batch.commit(onProgress);
  // 2) The sheet itself last, together with the audit entry.
  const last = b.batch();
  last.delete(paths.session(sid));
  addAudit(b, last, { action: 'session_deleted', actor, targetPath: paths.session(sid), before: { title: s.title, state: s.state, students: bundle.enrollments.length, publishedVersion: s.publishedVersion ?? null }, reason: reason || 'draft deleted' });
  await last.commit();
}

/** A student can be deleted only if they are in no result sheet and have no published result. */
export async function deleteStudent(actor, studentId) {
  const b = await getBackend();
  const st = await b.get(paths.student(studentId));
  if (!st) throw new Error('Student not found.');
  const uses = [];
  for (const s of await allSessions(b)) if (await b.get(`${paths.enrollments(s.id)}/${studentId}`)) uses.push(s.title?.en ?? s.id);
  const hist = (await b.list(paths.studentHistory(studentId), { limit: 1 })).items;
  if (uses.length || hist.length) throw inUse(`This student is in ${uses.length || 1} result sheet(s): ${uses.slice(0, 3).join(', ')}. Mark them inactive instead, or remove them from those sheets first.`, uses);
  const batch = b.batch();
  if (st.current) batch.delete(paths.classEnrollment(st.current.yearId, st.current.classId, st.current.roll));
  batch.delete(paths.student(studentId));
  addAudit(b, batch, { action: 'student_deleted', actor, targetPath: paths.student(studentId), before: { name: st.nameEn, roll: st.current?.roll, classId: st.current?.classId } });
  await batch.commit();
}

/** A subject can be deleted only if no result sheet uses it. Its default assignments are removed too. */
export async function deleteSubject(actor, subjectId) {
  const b = await getBackend();
  const sub = await b.get(`${C.SUBJECTS}/${subjectId}`);
  const uses = [];
  for (const s of await allSessions(b)) if (await b.get(paths.sessionSubject(s.id, subjectId))) uses.push(s.title?.en ?? s.id);
  if (uses.length) throw inUse(`This subject is used in ${uses.length} result sheet(s): ${uses.slice(0, 3).join(', ')}. Mark it inactive instead.`, uses);
  const batch = b.batch();
  (await b.list(C.TEACHER_ASSIGNMENTS, { where: [['subjectId', '==', subjectId]], limit: 500 })).items.forEach((a) => batch.delete(`${C.TEACHER_ASSIGNMENTS}/${a.id}`));
  batch.delete(`${C.SUBJECTS}/${subjectId}`);
  addAudit(b, batch, { action: 'catalogue_deleted', actor, targetPath: `${C.SUBJECTS}/${subjectId}`, before: { name: sub?.name ?? null } });
  await batch.commit();
  invalidateCatalogueCache();
}

/** Years, classes, groups and examination names — only when no result sheet or student refers to them. */
export async function deleteCatalogueItem(actor, collectionName, id) {
  const b = await getBackend();
  const checks = {
    [C.YEARS]: [[C.SESSIONS, 'yearId', '=='], [C.STUDENTS, 'current.yearId', '==']],
    [C.CLASSES]: [[C.SESSIONS, 'classId', '=='], [C.STUDENTS, 'current.classId', '==']],
    [C.GROUPS]: [[C.SESSIONS, 'groupIds', 'array-contains'], [C.STUDENTS, 'current.groupId', '=='], [C.CLASSES, 'groupIds', 'array-contains']],
    [C.EXAM_DEFS]: [[C.SESSIONS, 'examDefId', '==']],
  }[collectionName];
  if (!checks) throw new Error('This item cannot be deleted here.');
  for (const [coll, field, op] of checks) {
    const hit = (await b.list(coll, { where: [[field, op, id]], limit: 1 })).items[0];
    if (hit) throw inUse(`It is still used by ${coll === C.SESSIONS ? 'a result sheet' : coll === C.STUDENTS ? 'a student record' : 'a class'}. Mark it inactive instead.`);
  }
  const item = await b.get(`${collectionName}/${id}`);
  const batch = b.batch();
  batch.delete(`${collectionName}/${id}`);
  addAudit(b, batch, { action: 'catalogue_deleted', actor, targetPath: `${collectionName}/${id}`, before: { name: item?.name ?? item?.label ?? null } });
  await batch.commit();
  invalidateCatalogueCache();
}

/**
 * A teacher's profile can be deleted only if they never entered a mark and are not assigned in any
 * result sheet. The sign-in account must also be removed in Firebase Console → Authentication.
 */
export async function deleteTeacher(actor, uid) {
  const b = await getBackend();
  if (uid === actor.id) throw new Error('You cannot delete your own account.');
  const user = await b.get(paths.user(uid));
  if (!user || user.role !== 'teacher') throw new Error('Only teacher accounts can be deleted.');
  const inSheet = (await b.list(C.SESSIONS, { where: [['teacherIds', 'array-contains', uid]], limit: 1 })).items[0];
  if (inSheet) throw inUse(`This teacher is assigned in "${inSheet.title?.en ?? inSheet.id}". Change the teacher there first, or disable the account instead.`);
  const acted = (await b.list(C.AUDIT, { where: [['actorUid', '==', uid]], limit: 1 })).items[0];
  if (acted) throw inUse('This teacher has entered marks or other records. Disable the account instead so the history stays complete.');
  const batch = b.batch();
  (await b.list(C.TEACHER_ASSIGNMENTS, { where: [['teacherId', '==', uid]], limit: 500 })).items.forEach((a) => batch.delete(`${C.TEACHER_ASSIGNMENTS}/${a.id}`));
  batch.delete(paths.user(uid));
  addAudit(b, batch, { action: 'teacher_deleted', actor, targetPath: paths.user(uid), before: { name: user.displayName, email: user.email } });
  await batch.commit();
}
