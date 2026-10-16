/**
 * One-click starter data (Settings → Examinations): institution, session, classes, groups with their
 * rules, examination names and the subject catalogue. Nothing existing is overwritten unless the
 * administrator ticks "update matching items" — and even then marks and components are never touched.
 */
import { getBackend } from '../backend/index.js';
import { C } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit } from './audit-repository.js';
import { loadAllCatalogues, invalidateCatalogueCache } from './catalogue-repository.js';
import { getInstitution, saveInstitution, clearSettingsCache } from './settings-repository.js';

const norm = (v) => String(v ?? '').toLowerCase().replace(/\b(class|the)\b/g, '').replace(/[^a-z0-9\u0980-\u09ff]+/g, '');
const nameKeys = (x) => [norm(x.name?.en ?? x.label), norm(x.name?.bn)].filter(Boolean);

/** Works out what would happen, without writing. */
export async function planStarterData(data) {
  const cats = await loadAllCatalogues({ fresh: true });
  const map = { [C.YEARS]: ['academicYears', cats.years], [C.CLASSES]: ['classes', cats.classes], [C.GROUPS]: ['groups', cats.groups], [C.EXAM_DEFS]: ['examDefinitions', cats.examDefs], [C.SUBJECTS]: ['subjects', cats.subjects] };
  const plan = [];
  for (const [coll, [key, existing]] of Object.entries(map)) {
    for (const item of data[key] ?? []) {
      const keys = nameKeys(item);
      const match = existing.find((e) => e.id === item.id || nameKeys(e).some((k) => keys.includes(k)));
      plan.push({ coll, item, match: match ?? null });
    }
  }
  return plan;
}

export async function applyStarterData(actor, data, plan, { updateMatching = true } = {}) {
  const b = await getBackend();
  const batch = b.batch();
  const report = { created: 0, updated: 0, skipped: 0 };
  for (const { coll, item, match } of plan) {
    const { id, ...fields } = item;
    if (!match) { batch.set(`${coll}/${id}`, { ...fields, createdAt: serverTime(), updatedAt: serverTime() }); report.created++; continue; }
    if (!updateMatching) { report.skipped++; continue; }
    // Update only structural settings; never names the college typed, never mark components.
    const patch = coll === C.SUBJECTS
      ? { groupRoles: fields.groupRoles, sheetColumns: fields.sheetColumns, combine: fields.combine, groupIds: [...new Set([...(match.groupIds ?? []), ...(fields.groupIds ?? [])])], optionalEligible: fields.optionalEligible }
      : coll === C.GROUPS ? { rules: fields.rules } : coll === C.CLASSES ? { groupIds: [...new Set([...(match.groupIds ?? []), ...(fields.groupIds ?? [])])] } : null;
    if (patch) { batch.set(`${coll}/${match.id}`, { ...patch, updatedAt: serverTime() }, { merge: true }); report.updated++; } else report.skipped++;
  }
  addAudit(b, batch, { action: 'settings_changed', actor, targetPath: 'starter-data', after: report });
  await batch.commit();
  invalidateCatalogueCache();
  // Institution: fill only what is still empty.
  const inst = await getInstitution({ fresh: true });
  const fill = (cur, add) => ({ en: cur?.en || add?.en || '', bn: cur?.bn || add?.bn || '' });
  if (data.institution && (!inst.name?.en || !inst.name?.bn || !inst.address?.en || !inst.address?.bn)) {
    await saveInstitution(actor, { ...inst, name: fill(inst.name, data.institution.name), address: fill(inst.address, data.institution.address) });
  }
  clearSettingsCache();
  return report;
}
