/** Academic years, classes, groups, subjects and examination names (admin-managed reference data). */
import { getBackend } from '../backend/index.js';
import { C, ids } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit, AuditAction } from './audit-repository.js';

export const CATALOGUES = Object.freeze([C.YEARS, C.CLASSES, C.GROUPS, C.SUBJECTS, C.EXAM_DEFS]);
const cache = new Map(); // short-lived in-memory cache to avoid re-reading reference data on every screen

export async function listCatalogue(name, { fresh = false } = {}) {
  if (!CATALOGUES.includes(name)) throw new Error(`Not a catalogue collection: ${name}`);
  if (!fresh && cache.has(name) && Date.now() - cache.get(name).at < 60_000) return cache.get(name).items;
  const b = await getBackend();
  const items = (await b.list(name, { orderBy: [['order', 'asc']] })).items;
  cache.set(name, { at: Date.now(), items });
  return items;
}

export async function loadAllCatalogues(opts) {
  const [years, classes, groups, subjects, examDefs] = await Promise.all(CATALOGUES.map((n) => listCatalogue(n, opts)));
  return { years, classes, groups, subjects, examDefs };
}

export async function saveCatalogueItem(actor, name, id, data) {
  if (!CATALOGUES.includes(name)) throw new Error(`Not a catalogue collection: ${name}`);
  const b = await getBackend();
  const docId = id ?? ids.slug(data.code || data.name?.en || data.label || 'item') + '-' + b.newId(name).slice(-4).toLowerCase();
  const batch = b.batch();
  batch.set(`${name}/${docId}`, { ...data, updatedAt: serverTime(), ...(id ? {} : { createdAt: serverTime() }) }, { merge: true });
  addAudit(b, batch, { action: AuditAction.CATALOGUE_CHANGED, actor, targetPath: `${name}/${docId}`, after: { active: data.active ?? true } });
  await batch.commit();
  cache.delete(name);
  return docId;
}

export function labelOf(item, lang = 'en') {
  if (!item) return '';
  const n = item.name ?? item.label;
  if (typeof n === 'string') return n;
  return n?.[lang] || n?.en || item.id;
}

export function invalidateCatalogueCache() { cache.clear(); }
