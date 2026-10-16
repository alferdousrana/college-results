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
  const report = { created: 0, updated: 0, skipped: 0, repaired: 0 };
  // Starter ids → the ids actually used in this database (an existing "Science" group keeps its own id).
  const idMap = Object.fromEntries(plan.map(({ item, match }) => [item.id, match?.id ?? item.id]));
  const mapIds = (list) => [...new Set((list ?? []).map((x) => idMap[x] ?? x))];
  const mapKeys = (obj) => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [idMap[k] ?? k, v]));
  const remap = (coll, f) => (coll === C.SUBJECTS ? { ...f, groupIds: mapIds(f.groupIds), classIds: mapIds(f.classIds), groupRoles: mapKeys(f.groupRoles), sheetColumns: mapKeys(f.sheetColumns) }
    : coll === C.CLASSES ? { ...f, groupIds: mapIds(f.groupIds) } : f);
  for (const { coll, item, match } of plan) {
    const { id, ...raw } = item;
    const fields = remap(coll, raw);
    if (!match) { batch.set(`${coll}/${id}`, { ...fields, createdAt: serverTime(), updatedAt: serverTime() }); report.created++; continue; }
    if (!updateMatching) { report.skipped++; continue; }
    // Update only structural settings; never names the college typed, never mark components.
    const patch = coll === C.SUBJECTS
      ? { groupRoles: fields.groupRoles, sheetColumns: fields.sheetColumns, combine: fields.combine, groupIds: fields.groupIds, classIds: fields.classIds, optionalEligible: fields.optionalEligible }
      : coll === C.GROUPS ? { rules: fields.rules } : coll === C.CLASSES ? { groupIds: fields.groupIds } : null;
    if (patch) { batch.set(`${coll}/${match.id}`, { ...patch, updatedAt: serverTime() }, { merge: true }); report.updated++; } else report.skipped++;
  }
  addAudit(b, batch, { action: 'settings_changed', actor, targetPath: 'starter-data', after: report });
  await batch.commit();
  invalidateCatalogueCache();
  report.repaired = await repairReferences(actor, idMap);
  // Institution: fill only what is still empty.
  const inst = await getInstitution({ fresh: true });
  const fill = (cur, add) => ({ en: cur?.en || add?.en || '', bn: cur?.bn || add?.bn || '' });
  if (data.institution && (!inst.name?.en || !inst.name?.bn || !inst.address?.en || !inst.address?.bn)) {
    await saveInstitution(actor, { ...inst, name: fill(inst.name, data.institution.name), address: fill(inst.address, data.institution.address) });
  }
  clearSettingsCache();
  return report;
}

/**
 * Repairs subjects and classes that point at groups or classes which do not exist
 * (for example after an earlier starter load matched an existing "Science" group under another id).
 * Unknown ids are translated through idMap when possible, otherwise dropped. Returns the number of fixed items.
 */
export async function repairReferences(actor, idMap = {}) {
  const b = await getBackend();
  const cats = await loadAllCatalogues({ fresh: true });
  const groupIds = new Set(cats.groups.map((g) => g.id));
  const classIds = new Set(cats.classes.map((c) => c.id));
  const fix = (list, valid) => [...new Set((list ?? []).map((x) => (valid.has(x) ? x : idMap[x])).filter((x) => x && valid.has(x)))];
  const fixKeys = (obj, valid) => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [valid.has(k) ? k : idMap[k], v]).filter(([k]) => k && valid.has(k)));
  const batch = b.batch();
  let n = 0;
  for (const s of cats.subjects) {
    const next = { groupIds: fix(s.groupIds, groupIds), classIds: fix(s.classIds, classIds), groupRoles: fixKeys(s.groupRoles, groupIds), sheetColumns: fixKeys(s.sheetColumns, groupIds) };
    if (JSON.stringify([s.groupIds ?? [], s.classIds ?? [], s.groupRoles ?? {}, s.sheetColumns ?? {}]) !== JSON.stringify([next.groupIds, next.classIds, next.groupRoles, next.sheetColumns])) {
      batch.update(`${C.SUBJECTS}/${s.id}`, { ...next, updatedAt: serverTime() }); n++;
    }
  }
  for (const c of cats.classes) {
    const next = fix(c.groupIds, groupIds);
    if (JSON.stringify(c.groupIds ?? []) !== JSON.stringify(next)) { batch.update(`${C.CLASSES}/${c.id}`, { groupIds: next, updatedAt: serverTime() }); n++; }
  }
  if (n) {
    addAudit(b, batch, { action: 'settings_changed', actor, targetPath: 'catalogue-repair', after: { fixed: n } });
    await batch.commit();
    invalidateCatalogueCache();
  }
  return n;
}
