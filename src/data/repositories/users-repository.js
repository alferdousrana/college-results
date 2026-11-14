import { getBackend } from '../backend/index.js';
import { C, paths } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit, AuditAction } from './audit-repository.js';
import { AccountStatus, Role, manageableRoles } from '../../auth/roles.js';
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
    if (actor.role && !canManage(actor, cur.role)) throw new Error('You cannot change this account.');
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

/** Sets the extra rights of a teacher or staff account (only the Super Admin can; enforced by rules). */
export async function setUserGrants(actor, uid, grants) {
  const b = await getBackend();
  const before = await b.get(paths.user(uid));
  const batch = b.batch();
  batch.update(paths.user(uid), { grants, updatedAt: serverTime() });
  addAudit(b, batch, { action: 'grants_changed', actor, targetPath: paths.user(uid), before: { grants: before?.grants ?? {} }, after: { grants } });
  await batch.commit();
}

/** Login account for a staff member (role staff), linked to staff/{staffId}. */
export async function saveCreatedStaffUser(actor, uid, profile, staffId) {
  const b = await getBackend();
  const batch = b.batch();
  batch.set(paths.user(uid), profile);
  batch.update(`${C.STAFF}/${staffId}`, { userId: uid, loginEmail: profile.email, updatedAt: serverTime() });
  addAudit(b, batch, { action: 'staff_login_created', actor, targetPath: paths.user(uid), after: { email: profile.email, grants: profile.grants ?? {} } });
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

/**
 * Administrator edits a teacher's name, mobile number and extra fields. Email and password belong
 * to the sign-in account and are not editable here. The name shown on assignments is updated too.
 */
export async function updateTeacher(actor, uid, { displayName, phone, customFields, grants }) {
  if (!displayName?.trim()) throw new Error('Name is required.');
  const b = await getBackend();
  const before = await b.get(paths.user(uid));
  if (!before || !['teacher', 'staff', 'administrator'].includes(before.role)) throw new Error('Teacher not found.');
  const batch = b.batch();
  batch.update(paths.user(uid), { displayName: displayName.trim(), phone: phone?.trim() || null, customFields: customFields ?? {}, ...(grants ? { grants } : {}), updatedAt: serverTime() });
  if (before.displayName !== displayName.trim()) {
    const { items } = await b.list(C.TEACHER_ASSIGNMENTS, { where: [['teacherId', '==', uid]], limit: 500 });
    items.forEach((a) => batch.update(`${C.TEACHER_ASSIGNMENTS}/${a.id}`, { teacherName: displayName.trim() }));
  }
  addAudit(b, batch, { action: 'teacher_updated', actor, targetPath: paths.user(uid), before: { displayName: before.displayName, phone: before.phone ?? null }, after: { displayName: displayName.trim(), phone: phone?.trim() || null, ...(grants ? { grants } : {}) } });
  await batch.commit();
}

/** Client mirror of the rules: a principal manages teachers, staff and administrators; the Super Admin everyone. */
function canManage(actor, targetRole) {
  if (actor.role === Role.SUPER_ADMIN) return true;
  return manageableRoles({ role: actor.role, status: 'active' }).includes(targetRole);
}

/** Members of the administration (Super Admin, principal, administrators) for the Administration page. */
export async function listAdministration() {
  const b = await getBackend();
  const lists = await Promise.all([Role.SUPER_ADMIN, Role.PRINCIPAL, Role.ADMINISTRATOR].map((role) => b.list(C.USERS, { where: [['role', '==', role]], limit: 200 }).then((r) => r.items)));
  const rank = { super_admin: 0, principal: 1, administrator: 2 };
  return lists.flat().sort((a, c) => rank[a.role] - rank[c.role] || (a.order ?? 99) - (c.order ?? 99) || String(a.displayName).localeCompare(String(c.displayName)));
}

/** Saves a newly created principal / administrator login (see auth-service adminCreateTeacher). */
export async function saveCreatedAdministrator(actor, uid, profile) {
  if (!canManage(actor, profile.role)) throw new Error('Only the Super Admin can create a principal account.');
  const b = await getBackend();
  const batch = b.batch();
  batch.set(paths.user(uid), profile);
  addAudit(b, batch, { action: 'administrator_created', actor, targetPath: paths.user(uid), after: { email: profile.email, role: profile.role } });
  await batch.commit();
}

/** Edits a member of the administration: name, designation, mobile, order, students right. */
export async function updateAdministrator(actor, uid, { displayName, designation, phone, order, grants }) {
  if (!displayName?.trim()) throw new Error('Name is required.');
  const b = await getBackend();
  const before = await b.get(paths.user(uid));
  if (!before || ![Role.PRINCIPAL, Role.ADMINISTRATOR].includes(before.role)) throw new Error('Account not found.');
  if (!canManage(actor, before.role)) throw new Error('Only the Super Admin can change the principal account.');
  const batch = b.batch();
  batch.update(paths.user(uid), { displayName: displayName.trim(), designation: designation ?? null, phone: phone?.trim() || null, order: Number(order) || 0,
    ...(grants ? { grants } : {}), updatedAt: serverTime() });
  addAudit(b, batch, { action: 'administrator_updated', actor, targetPath: paths.user(uid), before: { displayName: before.displayName }, after: { displayName: displayName.trim(), ...(grants ? { grants } : {}) } });
  await batch.commit();
}

/** Removes the profile of a principal / administrator (they can no longer use the app). */
export async function deleteAdministrator(actor, uid) {
  if (actor.id === uid) throw new Error('You cannot remove your own account.');
  const b = await getBackend();
  const before = await b.get(paths.user(uid));
  if (!before || ![Role.PRINCIPAL, Role.ADMINISTRATOR].includes(before.role)) throw new Error('Account not found.');
  if (!canManage(actor, before.role)) throw new Error('Only the Super Admin can remove the principal account.');
  const batch = b.batch();
  batch.delete(paths.user(uid));
  addAudit(b, batch, { action: 'administrator_deleted', actor, targetPath: paths.user(uid), before: { displayName: before.displayName, email: before.email, role: before.role } });
  await batch.commit();
}

/** Active teachers for the view-only overview (query filters match the rules for viewers). */
export async function listActiveTeacherNames() {
  const b = await getBackend();
  const { items } = await b.list(C.USERS, { where: [['role', '==', Role.TEACHER], ['status', '==', AccountStatus.ACTIVE]], limit: 500 });
  return items.map((u) => ({ id: u.id, displayName: u.displayName, designation: u.customFields?.designation ?? null }))
    .sort((a, c) => String(a.displayName).localeCompare(String(c.displayName)));
}
