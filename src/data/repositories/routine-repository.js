/**
 * Examination routines: routines/{id}. One routine can cover several result sheets side by side
 * (e.g. Class Twelve Test + Class Eleven Quarterly), like the college's printed routine.
 * { title, note, columns: [{ sessionId, label }], slots: [{ id, label }], days: [{ id, date, cells: { 'slotId|sessionId': [subjectId] } }] }
 */
import { getBackend } from '../backend/index.js';
import { serverTime } from '../field-ops.js';
import { addAudit } from './audit-repository.js';

export const ROUTINES = 'routines';

export async function listRoutines() {
  const b = await getBackend();
  return (await b.list(ROUTINES, { orderBy: [['updatedAt', 'desc']], limit: 100 })).items;
}
export async function getRoutine(id) { return (await getBackend()).get(`${ROUTINES}/${id}`); }

export async function saveRoutine(actor, id, data) {
  const b = await getBackend();
  const docId = id ?? b.newId(ROUTINES);
  const batch = b.batch();
  batch.set(`${ROUTINES}/${docId}`, { ...data, updatedAt: serverTime(), updatedBy: actor.id, ...(id ? {} : { createdAt: serverTime() }) });
  addAudit(b, batch, { action: 'routine_saved', actor, targetPath: `${ROUTINES}/${docId}`, after: { title: data.title ?? null, days: data.days?.length ?? 0 } });
  await batch.commit();
  return docId;
}

export async function deleteRoutine(actor, id) {
  const b = await getBackend();
  const batch = b.batch();
  batch.delete(`${ROUTINES}/${id}`);
  addAudit(b, batch, { action: 'routine_deleted', actor, targetPath: `${ROUTINES}/${id}` });
  await batch.commit();
}
