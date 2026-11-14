/** Head counts for the dashboard and the Students page, using cheap server-side count queries. */
import { getBackend } from '../backend/index.js';
import { C } from '../paths.js';

export async function countActiveTeachers() {
  const b = await getBackend();
  return b.count(C.USERS, { where: [['role', '==', 'teacher'], ['status', '==', 'active']] });
}

export async function countActiveStaff() {
  const b = await getBackend();
  return b.count(C.STAFF, { where: [['status', '==', 'active']] });
}

/** { [classId]: { total, byGroup: { [groupId]: n } } } for one session (active students only). */
export async function studentCounts(yearId, classes, groups, { status = 'active' } = {}) {
  const b = await getBackend();
  const out = {};
  for (const c of classes) {
    const base = [['current.yearId', '==', yearId], ['current.classId', '==', c.id], ...(status ? [['status', '==', status]] : [])];
    const gs = groups.filter((g) => !c.groupIds?.length || c.groupIds.includes(g.id));
    const byGroup = {};
    for (const g of gs) byGroup[g.id] = await b.count(C.STUDENTS, { where: [...base, ['current.groupId', '==', g.id]] });
    out[c.id] = { total: await b.count(C.STUDENTS, { where: base }), byGroup };
  }
  return out;
}

/**
 * Head counts for the public page: active students of the current session and active teachers.
 * Admins only (the public page shows the numbers stored in institution/public.about).
 */
export async function publicHeadCounts() {
  const b = await getBackend();
  const { listCatalogue } = await import('./catalogue-repository.js');
  const years = await listCatalogue(C.YEARS);
  const year = years.find((y) => y.active) ?? years.at(-1) ?? null;
  const [students, teachers] = await Promise.all([
    year ? b.count(C.STUDENTS, { where: [['current.yearId', '==', year.id], ['status', '==', 'active']] }) : 0,
    countActiveTeachers(),
  ]);
  return { students, teachers, yearLabel: year?.label ?? null };
}

/**
 * When the public page shows automatic counts, keeps institution/public.about up to date.
 * Called from the admin dashboard with counts it has already loaded (no extra reads); writes only on change.
 */
export async function syncPublicCounts({ students, teachers }) {
  if (students == null || teachers == null) return;
  const { getInstitution, clearSettingsCache } = await import('./settings-repository.js');
  const inst = await getInstitution({ fresh: true });
  const about = inst.about ?? {};
  if (about.countMode === 'manual') return;
  if (about.studentCount === students && about.teacherCount === teachers) return;
  const b = await getBackend();
  await b.update(`${C.INSTITUTION}/public`, { about: { ...about, studentCount: students, teacherCount: teachers } });
  clearSettingsCache();
}
