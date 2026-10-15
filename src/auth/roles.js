/**
 * Roles and permissions — CLIENT MIRROR for showing/hiding interface only.
 * Real enforcement lives in firestore.rules. Never trust these checks for security.
 */
export const Role = Object.freeze({ SUPER_ADMIN: 'super_admin', TEACHER: 'teacher' });
export const AccountStatus = Object.freeze({ PENDING: 'pending', ACTIVE: 'active', REJECTED: 'rejected', DISABLED: 'disabled' });

export const Permission = Object.freeze({
  MANAGE_TEACHERS: 'manage_teachers',
  MANAGE_STUDENTS: 'manage_students',
  MANAGE_CATALOGUE: 'manage_catalogue',     // classes, groups, subjects, exam names
  MANAGE_SETTINGS: 'manage_settings',
  CREATE_RESULT_SHEET: 'create_result_sheet',
  SHARE_WITH_TEACHERS: 'share_with_teachers',
  ENTER_ASSIGNED_MARKS: 'enter_assigned_marks',
  ENTER_ANY_MARKS: 'enter_any_marks',
  REVIEW_RESULTS: 'review_results',
  PUBLISH_RESULTS: 'publish_results',
  CORRECT_PUBLISHED: 'correct_published',
  VIEW_PUBLISHED_SHEETS: 'view_published_sheets',
  VIEW_AUDIT_LOG: 'view_audit_log',
});

const P = Permission;
const ROLE_PERMISSIONS = {
  [Role.SUPER_ADMIN]: new Set(Object.values(P)),
  [Role.TEACHER]: new Set([P.ENTER_ASSIGNED_MARKS, P.VIEW_PUBLISHED_SHEETS]),
};

export function can(profile, permission) {
  if (!profile || profile.status !== AccountStatus.ACTIVE) return false;
  return ROLE_PERMISSIONS[profile.role]?.has(permission) ?? false;
}

export function isActiveRole(profile, role) {
  return profile?.status === AccountStatus.ACTIVE && profile.role === role;
}
