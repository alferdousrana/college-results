/**
 * Student records.
 *   students/{studentId}  — permanent identity (auto id; never the roll). Never hard-deleted.
 *   classEnrollments/{year__class__roll} — roll registry enforcing unique rolls per class/year.
 */
import { getBackend } from '../backend/index.js';
import { C, paths } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit, AuditAction } from './audit-repository.js';

export const StudentStatus = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive', TRANSFERRED: 'transferred', LEFT: 'left', GRADUATED: 'graduated' });

export async function listStudents({ yearId, classId, groupId = null, status = null, limit = 50, after = null }) {
  const b = await getBackend();
  const where = [['current.yearId', '==', yearId], ['current.classId', '==', classId]];
  if (groupId) where.push(['current.groupId', '==', groupId]);
  if (status) where.push(['status', '==', status]);
  return b.list(C.STUDENTS, { where, orderBy: [['current.rollNumber', 'asc']], limit, after });
}

/** All students of one class/year (bounded by class size) — used when creating an examination. */
export async function listClassRoster(yearId, classId) {
  const out = [];
  let after = null;
  do {
    const page = await listStudents({ yearId, classId, status: StudentStatus.ACTIVE, limit: 200, after });
    out.push(...page.items); after = page.cursor;
  } while (after && out.length < 2000);
  return out;
}

export async function getStudent(id) { return (await getBackend()).get(paths.student(id)); }

export async function findStudentByCode(code) {
  const b = await getBackend();
  return (await b.list(C.STUDENTS, { where: [['studentCode', '==', String(code).trim()]], limit: 1 })).items[0] ?? null;
}

export function generateStudentCode(yearId) {
  const rand = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return `S${String(yearId).slice(-2)}${rand}`;
}

function enrollmentDoc(studentId, cur, status) {
  return { studentId, yearId: cur.yearId, classId: cur.classId, roll: String(cur.roll), rollNumber: Number(cur.roll), groupId: cur.groupId ?? null, status, updatedAt: serverTime() };
}

/**
 * Creates or updates a student. Changing class/year/roll moves the roll registry entry in the same
 * transaction, so two students can never hold one roll. Returns the student id.
 */
export async function saveStudent(actor, id, data) {
  const b = await getBackend();
  const cur = { ...data.current, roll: String(data.current.roll).trim(), rollNumber: Number(data.current.roll) };
  if (!cur.yearId || !cur.classId || !/^\d{1,6}$/.test(cur.roll)) throw new Error('Year, class and a numeric roll are required.');
  const studentId = id ?? b.newId(C.STUDENTS);
  const newKey = paths.classEnrollment(cur.yearId, cur.classId, cur.roll);
  await b.transaction(async (tx) => {
    const existing = id ? await tx.get(paths.student(id)) : null;
    if (id && !existing) throw new Error('Student not found.');
    const taken = await tx.get(newKey);
    if (taken && taken.studentId !== studentId) throw Object.assign(new Error(`Roll ${cur.roll} is already used in this class and year.`), { code: 'duplicate-roll' });
    const old = existing?.current;
    const oldKey = old ? paths.classEnrollment(old.yearId, old.classId, old.roll) : null;
    const status = data.status ?? existing?.status ?? StudentStatus.ACTIVE;
    const doc = {
      studentCode: data.studentCode || existing?.studentCode || generateStudentCode(cur.yearId),
      nameEn: data.nameEn.trim(), nameBn: data.nameBn?.trim() || null,
      fatherName: data.fatherName?.trim() || null, motherName: data.motherName?.trim() || null,
      dob: data.dob || null, gender: data.gender || null,
      admission: { number: data.admission?.number || null, date: data.admission?.date || null },
      current: cur, status, customFields: data.customFields ?? {},
      updatedAt: serverTime(), ...(existing ? {} : { createdAt: serverTime() }),
    };
    if (oldKey && oldKey !== newKey) tx.delete(oldKey);
    tx.set(newKey, enrollmentDoc(studentId, cur, status));
    tx.set(paths.student(studentId), doc, { merge: Boolean(existing) });
    addAudit(b, tx, { action: existing ? AuditAction.STUDENT_UPDATED : AuditAction.STUDENT_CREATED, actor, targetPath: paths.student(studentId),
      before: existing ? { roll: old?.roll, classId: old?.classId } : null, after: { roll: cur.roll, classId: cur.classId } });
  });
  return studentId;
}

/** Inactive / transferred / left students are kept forever; their roll is released for reuse. */
export async function setStudentStatus(actor, id, status, note = null) {
  if (!Object.values(StudentStatus).includes(status)) throw new Error('Invalid status');
  const b = await getBackend();
  await b.transaction(async (tx) => {
    const s = await tx.get(paths.student(id));
    if (!s) throw new Error('Student not found.');
    const key = paths.classEnrollment(s.current.yearId, s.current.classId, s.current.roll);
    if (status === StudentStatus.ACTIVE) {
      const taken = await tx.get(key);
      if (taken && taken.studentId !== id) throw new Error(`Roll ${s.current.roll} is now used by another student. Edit the roll first.`);
      tx.set(key, enrollmentDoc(id, s.current, status));
    } else tx.delete(key);
    tx.update(paths.student(id), { status, statusNote: note, updatedAt: serverTime() });
    addAudit(b, tx, { action: AuditAction.STUDENT_STATUS_CHANGED, actor, targetPath: paths.student(id), before: { status: s.status }, after: { status }, reason: note });
  });
}

export async function getStudentHistory(id) {
  const b = await getBackend();
  return (await b.list(paths.studentHistory(id), { orderBy: [['publishedAt', 'desc']], limit: 50 })).items;
}

/**
 * Import planning: decides create / update / skip for each validated row WITHOUT writing.
 * Matching: by studentCode if given, else by roll in the target class/year.
 */
export async function planImport(rows, { yearId, classId, mode }) {
  const b = await getBackend();
  const plan = [];
  for (const row of rows) {
    let match = null;
    if (row.studentCode) match = await findStudentByCode(row.studentCode);
    if (!match) {
      const reg = await b.get(paths.classEnrollment(yearId, classId, row.roll));
      if (reg) match = await b.get(paths.student(reg.studentId));
    }
    if (match) {
      const rollOwner = await b.get(paths.classEnrollment(yearId, classId, row.roll));
      if (rollOwner && rollOwner.studentId !== match.id) { plan.push({ row, action: 'error', reason: `Roll ${row.roll} belongs to another student.` }); continue; }
      plan.push({ row, action: mode === 'update' ? 'update' : 'skip', existing: match, reason: mode === 'update' ? 'Matches an existing student; will update.' : 'Matches an existing student; skipped.' });
    } else plan.push({ row, action: 'create' });
  }
  return plan;
}

/** Executes a plan in batches of 100 students; reports progress and returns a summary. */
export async function executeImport(actor, plan, { yearId, classId }, onProgress) {
  const b = await getBackend();
  const work = plan.filter((p) => p.action === 'create' || p.action === 'update');
  const report = { created: 0, updated: 0, skipped: plan.filter((p) => p.action === 'skip').length, failed: [] };
  for (let i = 0; i < work.length; i += 100) {
    const chunk = work.slice(i, i + 100);
    const batch = b.batch();
    for (const item of chunk) {
      const r = item.row;
      const id = item.existing?.id ?? b.newId(C.STUDENTS);
      const cur = { yearId, classId, groupId: r.groupId ?? item.existing?.current?.groupId ?? null, roll: String(r.roll), rollNumber: Number(r.roll),
        section: r.section ?? item.existing?.current?.section ?? null, shift: r.shift ?? item.existing?.current?.shift ?? null,
        optionalSubjectId: r.optionalSubjectId ?? item.existing?.current?.optionalSubjectId ?? null, subjectIds: r.subjectIds ?? item.existing?.current?.subjectIds ?? null };
      const old = item.existing?.current;
      if (old && (old.yearId !== yearId || old.classId !== classId || String(old.roll) !== cur.roll)) batch.delete(paths.classEnrollment(old.yearId, old.classId, old.roll));
      batch.set(paths.classEnrollment(yearId, classId, cur.roll), enrollmentDoc(id, cur, 'active'));
      const fields = {
        nameEn: r.name, nameBn: r.nameBn ?? item.existing?.nameBn ?? null,
        fatherName: r.fatherName ?? item.existing?.fatherName ?? null, motherName: r.motherName ?? item.existing?.motherName ?? null,
        dob: r.dob ?? item.existing?.dob ?? null, gender: r.gender ?? item.existing?.gender ?? null,
        admission: { number: r.admissionNumber ?? item.existing?.admission?.number ?? null, date: r.admissionDate ?? item.existing?.admission?.date ?? null },
        current: cur, status: 'active', customFields: { ...(item.existing?.customFields ?? {}), ...(r.customFields ?? {}) },
        studentCode: r.studentCode || item.existing?.studentCode || generateStudentCode(yearId), updatedAt: serverTime(),
      };
      batch.set(paths.student(id), item.existing ? fields : { ...fields, createdAt: serverTime() }, { merge: Boolean(item.existing) });
    }
    try {
      await batch.commit();
      chunk.forEach((c) => (c.action === 'create' ? report.created++ : report.updated++));
    } catch (e) {
      report.failed.push(...chunk.map((c) => ({ roll: c.row.roll, message: e.message })));
    }
    onProgress?.(Math.min(i + 100, work.length), work.length);
  }
  const a = b.batch();
  addAudit(b, a, { action: AuditAction.STUDENTS_IMPORTED, actor, targetPath: `${C.STUDENTS}`, after: { yearId, classId, created: report.created, updated: report.updated, skipped: report.skipped, failed: report.failed.length } });
  await a.commit();
  return report;
}
