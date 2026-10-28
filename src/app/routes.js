/**
 * Route table. `access`:
 *   public  — anyone          signed-in — any signed-in account (incl. pending)
 *   staff   — any ACTIVE account (pages check finer permissions, e.g. subject assignment)
 *   admin   — active super_admin      teacher — active teacher
 * Guards only decide what to render; Firestore rules decide what data can be read or written.
 */
const A = ['super_admin'];
export const ROUTES = [
  { path: '/', access: 'public', load: () => import('../pages/home-redirect.js') },
  { path: '/lookup', access: 'public', load: () => import('../pages/result-lookup.js'), nav: 'nav.lookup', icon: 'search', navFor: ['public'] },
  { path: '/login', access: 'public', load: () => import('../pages/login.js') },
  { path: '/register', access: 'public', load: () => import('../pages/register.js') },
  { path: '/demo', access: 'public', load: () => import('../pages/demo.js') },
  { path: '/pending', access: 'signed-in', load: () => import('../pages/account-status.js') },

  { path: '/admin', access: 'admin', load: () => import('../pages/admin/dashboard.js'), nav: 'nav.dashboard', icon: 'home', navFor: A },
  { path: '/admin/sheets', access: 'admin', load: () => import('../pages/admin/sheets.js'), nav: 'nav.resultSheets', icon: 'sheet', navFor: A },
  { path: '/admin/sheet/new', access: 'admin', load: () => import('../pages/admin/sheet-wizard.js') },
  { path: '/admin/sheet', access: 'admin', load: () => import('../pages/admin/sheet-detail.js') },
  { path: '/admin/routines', access: 'admin', load: () => import('../pages/admin/routines.js'), nav: 'nav.routines', icon: 'sheet', navFor: A },
  // Students: the Super Admin, plus teachers/staff given the "students" right (navGrant).
  { path: '/admin/students', access: 'students', load: () => import('../pages/admin/students.js'), nav: 'nav.students', icon: 'users', navFor: A, navGrant: 'students' },
  { path: '/admin/students/import', access: 'students', load: () => import('../pages/admin/student-import.js') },
  { path: '/admin/teachers', access: 'admin', load: () => import('../pages/admin/teachers.js'), nav: 'nav.teachers', icon: 'users', navFor: A },
  { path: '/admin/staff', access: 'admin', load: () => import('../pages/admin/staff.js'), nav: 'nav.staff', icon: 'users', navFor: A },
  { path: '/admin/classes', access: 'admin', load: () => import('../pages/admin/classes.js'), nav: 'nav.classes', icon: 'book', navFor: A },
  { path: '/admin/subjects', access: 'admin', load: () => import('../pages/admin/subjects.js'), nav: 'nav.subjects', icon: 'book', navFor: A },
  { path: '/admin/assignments', access: 'admin', load: () => import('../pages/admin/assignments.js'), nav: 'nav.assignments', icon: 'edit', navFor: A },
  { path: '/admin/archive', access: 'admin', load: () => import('../pages/admin/archive.js'), nav: 'nav.archive', icon: 'sheet', navFor: A },
  { path: '/admin/audit', access: 'admin', load: () => import('../pages/admin/audit.js'), nav: 'nav.audit', icon: 'alert', navFor: A },

  { path: '/staff', access: 'staff-home', load: () => import('../pages/staff-home.js'), nav: 'nav.home', icon: 'home', navFor: ['staff'] },
  { path: '/teacher', access: 'teacher', load: () => import('../pages/teacher/dashboard.js'), nav: 'nav.markEntry', icon: 'edit', navFor: ['teacher'] },
  { path: '/teacher/exam', access: 'teacher', load: () => import('../pages/teacher/exam.js') },
  { path: '/teacher/history', access: 'teacher', load: () => import('../pages/teacher/history.js'), nav: 'nav.history', icon: 'sheet', navFor: ['teacher'] },

  { path: '/marks', access: 'staff', load: () => import('../pages/mark-entry.js') },
  { path: '/results', access: 'staff', load: () => import('../pages/results-view.js') },

  { path: '/settings', access: 'public', load: () => import('../pages/settings.js'), nav: 'nav.settings', icon: 'settings', navFor: ['public', 'super_admin', 'teacher', 'staff'] },
  { path: '/print-preview', access: 'public', devOnly: true, load: () => import('../pages/print-preview.js') },
];

export function matchRoute(path) {
  return ROUTES.find((r) => r.path === path && (!r.devOnly || import.meta.env.DEV)) ?? null;
}
