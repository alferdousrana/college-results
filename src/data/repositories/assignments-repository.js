/** Default teacher-subject-class assignments. Only ACTIVE teachers can be assigned. */
import { getBackend } from '../backend/index.js';
import { C, ids } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit, AuditAction } from './audit-repository.js';

export async function listAssignments({ teacherId = null, subjectId = null, classId = null } = {}) {
  const b = await getBackend();
  const where = [];
  if (teacherId) where.push(['teacherId', '==', teacherId]);
  if (subjectId) where.push(['subjectId', '==', subjectId]);
  if (classId) where.push(['classId', '==', classId]);
  return (await b.list(C.TEACHER_ASSIGNMENTS, { where, limit: 1000 })).items;
}

export async function addAssignment(actor, { teacher, subjectId, classId }) {
  if (teacher.status !== 'active' || teacher.role !== 'teacher') throw new Error('Only approved teachers can be assigned.');
  const b = await getBackend();
  const id = ids.teacherAssignment(teacher.id, subjectId, classId);
  const batch = b.batch();
  batch.set(`${C.TEACHER_ASSIGNMENTS}/${id}`, { teacherId: teacher.id, teacherName: teacher.displayName, subjectId, classId, createdAt: serverTime() });
  addAudit(b, batch, { action: AuditAction.ASSIGNMENT_CHANGED, actor, targetPath: `${C.TEACHER_ASSIGNMENTS}/${id}`, after: { assigned: true } });
  await batch.commit();
}

export async function removeAssignment(actor, id) {
  const b = await getBackend();
  const batch = b.batch();
  batch.delete(`${C.TEACHER_ASSIGNMENTS}/${id}`);
  addAudit(b, batch, { action: AuditAction.ASSIGNMENT_CHANGED, actor, targetPath: `${C.TEACHER_ASSIGNMENTS}/${id}`, after: { assigned: false } });
  await batch.commit();
}
