/**
 * Mark documents: examSessions/{sid}/sessionSubjects/{subjectId}/marks/{studentId}
 * { studentId, subjectId, components: { cq: 45, mcq: 'AB', prac: null }, absent, version, updatedBy, updatedAt, clientUpdatedAt }
 * Writes are transactional with optimistic concurrency (`version`), mirrored by the rules,
 * and every write adds an audit entry (mark_created / mark_changed / absence_changed).
 */
import { getBackend } from '../backend/index.js';
import { paths } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit, AuditAction } from './audit-repository.js';
import { notify } from './notifications-repository.js';
import { ExamState } from '../../domain/exam-lifecycle.js';

export async function listMarks(sid, subjectId) {
  const b = await getBackend();
  const { items } = await b.list(paths.marks(sid, subjectId));
  return Object.fromEntries(items.map((m) => [m.id, m]));
}

export async function loadAllMarks(sid, subjectIds) {
  const entries = await Promise.all(subjectIds.map(async (id) => [id, await listMarks(sid, id)]));
  return Object.fromEntries(entries);
}

/**
 * Transport for the offline outbox. Resolves { status: 'ok', version } | { status: 'conflict', server }
 * | { status: 'rejected', reason }. Throws on network failure (entry stays pending).
 */
export function createMarkTransport(actor) {
  return async (entry) => {
    const b = await getBackend();
    const { sessionId, subjectId, studentId } = entry.path;
    const path = paths.mark(sessionId, subjectId, studentId);
    try {
      return await b.transaction(async (tx) => {
        const cur = await tx.get(path);
        const session = await tx.get(paths.session(sessionId));
        const serverVersion = cur?.version ?? 0;
        if (serverVersion !== (entry.baseVersion ?? 0)) return { status: 'conflict', server: cur ? { version: serverVersion, components: cur.components, absent: cur.absent, updatedBy: cur.updatedBy } : { version: 0 } };
        const next = {
          studentId, subjectId, components: entry.payload.components, absent: Boolean(entry.payload.absent),
          version: serverVersion + 1, updatedBy: actor.id, updatedAt: serverTime(), clientUpdatedAt: entry.updatedAt,
        };
        tx.set(path, next);
        const action = !cur ? AuditAction.MARK_CREATED : Boolean(cur.absent) !== next.absent ? AuditAction.ABSENCE_CHANGED : AuditAction.MARK_CHANGED;
        addAudit(b, tx, { action, actor, targetPath: path, before: cur ? { components: cur.components, absent: cur.absent } : null, after: { components: next.components, absent: next.absent } });
        if (session?.state === ExamState.READY && actor.role === 'teacher') tx.update(paths.session(sessionId), { state: ExamState.IN_PROGRESS, updatedAt: serverTime() });
        return { status: 'ok', version: next.version };
      });
    } catch (err) {
      if (err?.code === 'permission-denied') return { status: 'rejected', reason: 'permission-denied' };
      if (err?.code === 'failed-precondition' || err?.code === 'aborted') return { status: 'conflict', server: null };
      if (err?.code === 'resource-exhausted') return { status: 'rejected', reason: 'quota' };
      throw err;
    }
  };
}

export async function submitSubject(actor, sid, subjectId, title) {
  const b = await getBackend();
  const batch = b.batch();
  batch.update(paths.sessionSubject(sid, subjectId), { submission: { state: 'submitted', by: actor.id, byName: actor.displayName ?? null, at: serverTime() }, updatedAt: serverTime() });
  addAudit(b, batch, { action: AuditAction.SUBJECT_SUBMITTED, actor, targetPath: paths.sessionSubject(sid, subjectId) });
  await notify({ audience: 'admins', type: 'subject_submitted', params: { title, subjectId }, link: `/admin/sheet?sid=${encodeURIComponent(sid)}` }, batch);
  await batch.commit();
}

export async function reopenSubject(actor, sid, subjectId, reason) {
  const b = await getBackend();
  const batch = b.batch();
  batch.update(paths.sessionSubject(sid, subjectId), { submission: { state: 'open', reopenedBy: actor.id, reason: reason ?? null }, updatedAt: serverTime() });
  addAudit(b, batch, { action: AuditAction.SUBJECT_REOPENED, actor, targetPath: paths.sessionSubject(sid, subjectId), reason });
  await batch.commit();
}
