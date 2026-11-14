/**
 * Roles and permissions — CLIENT MIRROR for showing/hiding interface only.
 * Real enforcement lives in firestore.rules. Never trust these checks for security.
 *
 *   super_admin    — everything (the system owner).
 *   principal      — the same rights as the Super Admin, except that a principal can never change,
 *                    disable or delete a Super Admin account, and cannot create another principal.
 *   administrator  — other members of the college administration: may see the college overview
 *                    (head counts, students, published results) but change nothing, unless the
 *                    Super Admin or the principal gives them the "students" right.
 *   teacher        — enters marks for assigned subjects; may also see the college overview (view only).
 *   staff          — office staff; only what they are granted.
 */
export const Role = Object.freeze({ SUPER_ADMIN: 'super_admin', PRINCIPAL: 'principal', ADMINISTRATOR: 'administrator', TEACHER: 'teacher', STAFF: 'staff' });

/** Roles with full administrative rights (keep in sync with isAdmin() in firestore.rules). */
export const ADMIN_ROLES = Object.freeze([Role.SUPER_ADMIN, Role.PRINCIPAL]);
/** Roles that may see the college overview without changing anything (isViewer() in firestore.rules). */
export const VIEWER_ROLES = Object.freeze([Role.TEACHER, Role.ADMINISTRATOR]);

export function isAdminRole(role) { return ADMIN_ROLES.includes(role); }
export function isAdminProfile(profile) { return profile?.status === 'active' && isAdminRole(profile.role); }
export function isSuperAdmin(profile) { return profile?.status === 'active' && profile.role === Role.SUPER_ADMIN; }
/** The role whose rights a role has — a principal acts as the Super Admin everywhere in the interface. */
export function effectiveRole(role) { return role === Role.PRINCIPAL ? Role.SUPER_ADMIN : role; }

/** Which account roles the signed-in person may create, change or remove. */
export function manageableRoles(profile) {
  if (profile?.status !== 'active') return [];
  if (profile.role === Role.SUPER_ADMIN) return [Role.PRINCIPAL, Role.ADMINISTRATOR, Role.TEACHER, Role.STAFF];
  if (profile.role === Role.PRINCIPAL) return [Role.ADMINISTRATOR, Role.TEACHER, Role.STAFF];
  return [];
}

/**
 * Extra rights the Super Admin can give a teacher or a staff member (users/{uid}.grants).
 * Enforced by firestore.rules; this mirror only shows/hides the interface.
 */
export const Grant = Object.freeze({ STUDENTS: 'students' }); // add and edit students (not delete)
export function hasGrant(profile, grant) {
  if (!profile || profile.status !== 'active') return false;
  return isAdminRole(profile.role) || profile.grants?.[grant] === true;
}
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
  VIEW_OVERVIEW: 'view_overview',           // head counts, student list, published results — read only
});

const P = Permission;
const ALL = new Set(Object.values(P));
const ROLE_PERMISSIONS = {
  [Role.SUPER_ADMIN]: ALL,
  [Role.PRINCIPAL]: ALL,
  [Role.TEACHER]: new Set([P.ENTER_ASSIGNED_MARKS, P.VIEW_PUBLISHED_SHEETS, P.VIEW_OVERVIEW]),
  [Role.ADMINISTRATOR]: new Set([P.VIEW_PUBLISHED_SHEETS, P.VIEW_OVERVIEW]),
};

export function can(profile, permission) {
  if (!profile || profile.status !== AccountStatus.ACTIVE) return false;
  return ROLE_PERMISSIONS[profile.role]?.has(permission) ?? false;
}

export function isActiveRole(profile, role) {
  return profile?.status === AccountStatus.ACTIVE && profile.role === role;
}

/** Display names of the roles. */
export const ROLE_LABELS = Object.freeze({
  super_admin: { en: 'Super Admin', bn: 'সুপার অ্যাডমিন' },
  principal: { en: 'Principal', bn: 'অধ্যক্ষ' },
  administrator: { en: 'Administrator', bn: 'প্রশাসনিক কর্মকর্তা' },
  teacher: { en: 'Teacher', bn: 'শিক্ষক' },
  staff: { en: 'Staff', bn: 'কর্মচারী' },
});
