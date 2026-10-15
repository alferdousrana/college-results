/**
 * Audit log. Entries are written in the SAME batch/transaction as the change they describe.
 * Rules: create-only, actor must be the caller, `at` must be server time. Entries written by a
 * browser are trustworthy as "who did what" only to the extent rules enforce; they are not
 * tamper-proof against a malicious administrator (see docs/SECURITY.md).
 */
import { getBackend } from '../backend/index.js';
import { C } from '../paths.js';
import { serverTime } from '../field-ops.js';

export const AuditAction = Object.freeze({
  TEACHER_APPROVED: 'teacher_approved', TEACHER_REJECTED: 'teacher_rejected', TEACHER_DISABLED: 'teacher_disabled',
  TEACHER_CREATED: 'teacher_created', ROLE_CHANGED: 'role_changed',
  ASSIGNMENT_CHANGED: 'assignment_changed',
  SESSION_CREATED: 'session_created', SESSION_UPDATED: 'session_updated', SESSION_SHARED: 'session_shared',
  SESSION_STATE_CHANGED: 'session_state_changed',
  MARK_CREATED: 'mark_created', MARK_CHANGED: 'mark_changed', ABSENCE_CHANGED: 'absence_changed',
  SUBJECT_SUBMITTED: 'subject_submitted', SUBJECT_REOPENED: 'subject_reopened',
  RESULTS_CALCULATED: 'results_calculated', RESULT_PUBLISHED: 'result_published', RESULT_CORRECTION_STARTED: 'result_correction_started',
  PUBLIC_LOOKUP_WITHDRAWN: 'public_lookup_withdrawn',
  SETTINGS_CHANGED: 'settings_changed', CATALOGUE_CHANGED: 'catalogue_changed',
  STUDENT_CREATED: 'student_created', STUDENT_UPDATED: 'student_updated', STUDENT_STATUS_CHANGED: 'student_status_changed',
  STUDENTS_IMPORTED: 'students_imported',
});

/** Adds an audit entry to a transaction or batch (anything with `.set(path, data)`). */
export function addAudit(backend, writer, { action, actor, targetPath, before = null, after = null, reason = null }) {
  const id = backend.newId(C.AUDIT);
  writer.set(`${C.AUDIT}/${id}`, {
    action, actorUid: actor.id, actorRole: actor.role, actorName: actor.displayName ?? null,
    targetPath, before, after, reason, at: serverTime(),
  });
}

export async function listAudit({ action = null, limit = 25, after = null } = {}) {
  const b = await getBackend();
  const where = action ? [['action', '==', action]] : [];
  return b.list(C.AUDIT, { where, orderBy: [['at', 'desc']], limit, after });
}
