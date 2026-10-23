/**
 * Non-teaching staff (কর্মচারী): staff/{id}. Admin-only. Staff members do not sign in and are not
 * referenced by results, so records can be edited, deactivated or deleted freely (audited).
 */
import { getBackend } from '../backend/index.js';
import { C } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit } from './audit-repository.js';

export async function listStaff() {
  const b = await getBackend();
  return (await b.list(C.STAFF, { orderBy: [['order', 'asc']], limit: 1000 })).items;
}

export async function saveStaff(actor, id, data) {
  const b = await getBackend();
  const docId = id ?? b.newId(C.STAFF);
  const batch = b.batch();
  batch.set(`${C.STAFF}/${docId}`, { ...data, updatedAt: serverTime(), ...(id ? {} : { createdAt: serverTime() }) }, { merge: true });
  addAudit(b, batch, { action: id ? 'staff_updated' : 'staff_created', actor, targetPath: `${C.STAFF}/${docId}`, after: { name: data.name ?? null, status: data.status ?? null } });
  await batch.commit();
  return docId;
}

export async function deleteStaff(actor, id) {
  const b = await getBackend();
  const cur = await b.get(`${C.STAFF}/${id}`);
  const batch = b.batch();
  batch.delete(`${C.STAFF}/${id}`);
  addAudit(b, batch, { action: 'staff_deleted', actor, targetPath: `${C.STAFF}/${id}`, before: { name: cur?.name ?? null } });
  await batch.commit();
}
