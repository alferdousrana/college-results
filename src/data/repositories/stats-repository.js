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
