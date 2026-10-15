import { getBackend } from '../backend/index.js';
import { C, paths } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit, AuditAction } from './audit-repository.js';
import { AccountStatus, Role } from '../../auth/roles.js';
import { notify } from './notifications-repository.js';

export async function listUsersByStatus(status, max = 100) {
  const b = await getBackend();
  return (await b.list(C.USERS, { where: [['status', '==', status]], orderBy: [['createdAt', 'desc']], limit: max })).items;
}

export async function listTeachers({ status = null } = {}) {
  const b = await getBackend();
  const where = [['role', '==', Role.TEACHER], ...(status ? [['status', '==', status]] : [])];
  return (await b.list(C.USERS, { where, orderBy: [['createdAt', 'desc']], limit: 500 })).items;
}

export async function listActiveTeachers() { return listTeachers({ status: AccountStatus.ACTIVE }); }

const ACTION_FOR = { active: AuditAction.TEACHER_APPROVED, rejected: AuditAction.TEACHER_REJECTED, disabled: AuditAction.TEACHER_DISABLED, pending: AuditAction.ROLE_CHANGED };

/** Approve / reject / disable / re-enable an account; the audit entry is written atomically. */
export async function setUserStatus(actor, userId, status) {
  if (!Object.values(AccountStatus).includes(status)) throw new Error('Invalid status');
  if (actor.id === userId && status !== AccountStatus.ACTIVE) throw new Error('You cannot deactivate your own account.');
  const b = await getBackend();
  await b.transaction(async (tx) => {
    const cur = await tx.get(paths.user(userId));
    if (!cur) throw new Error('Account not found.');
    tx.update(paths.user(userId), { status, updatedAt: serverTime(), ...(status === AccountStatus.ACTIVE ? { approvedBy: actor.id, approvedAt: serverTime() } : {}) });
    addAudit(b, tx, { action: ACTION_FOR[status], actor, targetPath: paths.user(userId), before: { status: cur.status }, after: { status } });
  });
  if (status === AccountStatus.ACTIVE) await notify({ recipientUid: userId, type: 'teacher_approved', link: '/teacher' }).catch(() => {});
}

export async function saveCreatedTeacher(actor, uid, profile) {
  const b = await getBackend();
  const batch = b.batch();
  batch.set(paths.user(uid), profile);
  addAudit(b, batch, { action: AuditAction.TEACHER_CREATED, actor, targetPath: paths.user(uid), after: { email: profile.email } });
  await batch.commit();
}

export async function updateOwnProfile(uid, { displayName, phone }) {
  const b = await getBackend();
  await b.update(paths.user(uid), { displayName, phone: phone || null, updatedAt: serverTime() });
}

/** Mirrors interface preferences to the profile (rules allow owners to write `prefs`). */
export async function saveOwnPrefs(uid, prefs) {
  const b = await getBackend();
  await b.update(paths.user(uid), { prefs, updatedAt: serverTime() });
}
