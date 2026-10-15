import { getBackend } from '../backend/index.js';
import { C, SETTINGS_DOCS, paths } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit, AuditAction } from './audit-repository.js';
import { REFERENCE_SCALE_5, DEFAULT_POLICY } from '../../domain/calculation/index.js';
import { DEFAULT_PRINT_SETTINGS } from '../../print/print-settings.js';

/** Defaults are returned when a settings document does not exist yet. */
export const SETTINGS_DEFAULTS = Object.freeze({
  [SETTINGS_DOCS.GRADING]: { scale: REFERENCE_SCALE_5, policy: DEFAULT_POLICY, confirmed: false },
  [SETTINGS_DOCS.PUBLICATION]: { verifierField: null, verifierLabel: { en: 'Date of birth', bn: 'জন্ম তারিখ' }, publicStudentFields: [], showPositionPublicly: true },
  [SETTINGS_DOCS.PRINT]: DEFAULT_PRINT_SETTINGS,
  [SETTINGS_DOCS.STUDENT_FIELDS]: { fields: [] },
  [SETTINGS_DOCS.RETENTION]: { publicLookupYears: 5, keepInternalYears: 10 },
  [SETTINGS_DOCS.INTERFACE]: { defaultLang: 'en', defaultTheme: 'light' },
});

export const INSTITUTION_DEFAULT = Object.freeze({
  name: { en: '', bn: '' }, address: { en: '', bn: '' }, phone: '', email: '', website: '', eiin: '',
  header: { en: '', bn: '' }, footer: { en: '', bn: '' },
  signatories: {
    principal: { name: { en: '', bn: '' }, title: { en: 'Principal', bn: 'অধ্যক্ষ' } },
    committee: { name: { en: '', bn: '' }, title: { en: 'Convener, Examination Committee', bn: 'আহ্বায়ক, পরীক্ষা কমিটি' } },
    classTeacher: { name: { en: '', bn: '' }, title: { en: 'Class Teacher', bn: 'শ্রেণি শিক্ষক' } },
  },
  assets: {}, // { logo, principalSignature, committeeSignature, classTeacherSignature, seal } as data URLs
});

const memo = new Map();

export async function getSetting(name, { fresh = false } = {}) {
  if (!fresh && memo.has(name)) return memo.get(name);
  const b = await getBackend();
  const doc = await b.get(paths.setting(name));
  const value = { ...structuredClone(SETTINGS_DEFAULTS[name] ?? {}), ...(doc ?? {}), _exists: Boolean(doc) };
  memo.set(name, value);
  return value;
}

/** Saves a settings document with a revision counter (detects concurrent edits) and an audit entry. */
export async function saveSetting(actor, name, data, expectedRevision) {
  const b = await getBackend();
  const clean = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_') && k !== 'id'));
  await b.transaction(async (tx) => {
    const cur = await tx.get(paths.setting(name));
    const rev = cur?.revision ?? 0;
    if (expectedRevision != null && rev !== expectedRevision) {
      throw Object.assign(new Error('These settings were changed by someone else. Reload the page and try again.'), { code: 'stale' });
    }
    tx.set(paths.setting(name), { ...clean, revision: rev + 1, updatedAt: serverTime(), updatedBy: actor.id });
    addAudit(b, tx, { action: AuditAction.SETTINGS_CHANGED, actor, targetPath: paths.setting(name), after: { revision: rev + 1 } });
  });
  memo.delete(name);
}

export async function getInstitution({ fresh = false } = {}) {
  if (!fresh && memo.has('institution')) return memo.get('institution');
  const b = await getBackend();
  const doc = await b.get(`${C.INSTITUTION}/public`);
  const value = deepMerge(structuredClone(INSTITUTION_DEFAULT), doc ?? {});
  memo.set('institution', value);
  return value;
}

export async function saveInstitution(actor, data) {
  const b = await getBackend();
  const clean = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'id'));
  const size = new Blob([JSON.stringify(clean)]).size;
  if (size > 900_000) throw new Error('Images are too large together. Use smaller logo, signature or seal images.');
  const batch = b.batch();
  batch.set(`${C.INSTITUTION}/public`, { ...clean, updatedAt: serverTime(), updatedBy: actor.id });
  addAudit(b, batch, { action: AuditAction.SETTINGS_CHANGED, actor, targetPath: `${C.INSTITUTION}/public` });
  await batch.commit();
  memo.delete('institution');
}

export function clearSettingsCache() { memo.clear(); }

function deepMerge(base, extra) {
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') base[k] = deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}
