/**
 * Validates a JSON student import BEFORE anything is written.
 * Accepts either an array of students or { students: [...] }.
 * Nothing is imported if `errors` is non-empty — the UI shows every error with its row.
 */
export const IMPORT_LIMITS = Object.freeze({ maxRows: 1000, maxBytes: 1_000_000, maxNameLength: 120 });

const CORE_FIELDS = new Set(['roll', 'name', 'nameBn', 'groupId', 'optionalSubjectId', 'subjectIds', 'gender', 'studentCode', 'customFields',
  'fatherName', 'motherName', 'dob', 'section', 'shift', 'admissionNumber', 'admissionDate']);

export function parseImportText(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The file is empty.' };
  if (new Blob([text]).size > IMPORT_LIMITS.maxBytes) return { ok: false, error: 'The file is larger than 1 MB.' };
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : Array.isArray(data?.students) ? data.students : null;
    if (!list) return { ok: false, error: 'Expected a list of students, or an object with a "students" list.' };
    return { ok: true, list };
  } catch (e) {
    return { ok: false, error: `The file is not valid JSON: ${e.message}` };
  }
}

/**
 * @param {Array} list parsed rows
 * @param {object} ctx { existingRolls: Set<string>, allowExisting, groupIds: Set<string>, customFieldDefs: [{key,type,required,options}], requireGroup }
 * With allowExisting the existing-roll check is skipped (the import plan decides update/skip).
 */
/**
 * Lets an import file name groups and subjects by id OR by name (English or Bangla, any case),
 * e.g. "groupId": "Science" or "subjectIds": ["Higher Mathematics"]. Returns a rewritten copy of the list
 * plus the names that could not be resolved (reported as row errors by validateStudentImport).
 * items: [{ id, name: { en, bn } | label }]
 */
export function resolveImportNames(list, { groups = [], subjects = [] } = {}) {
  const key = (v) => String(v ?? '').normalize('NFC').toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/g, '');
  const index = (items) => {
    const m = new Map();
    for (const x of items) for (const k of [x.id, x.name?.en, x.name?.bn, x.label, x.code]) if (k) m.set(key(k), x.id);
    return m;
  };
  const g = index(groups), s = index(subjects);
  const unresolved = [];
  const out = list.map((item, i) => {
    if (!item || typeof item !== 'object') return item;
    const copy = { ...item };
    if (copy.groupId != null && copy.groupId !== '') {
      const id = g.get(key(copy.groupId));
      if (id) copy.groupId = id; else unresolved.push({ row: i + 1, field: 'groupId', message: `Unknown group "${item.groupId}".` });
    }
    const mapSubject = (v, field) => { const id = s.get(key(v)); if (!id) unresolved.push({ row: i + 1, field, message: `Unknown subject "${v}".` }); return id ?? v; };
    if (Array.isArray(copy.subjectIds)) copy.subjectIds = copy.subjectIds.map((v) => mapSubject(v, 'subjectIds'));
    if (copy.optionalSubjectId) copy.optionalSubjectId = mapSubject(copy.optionalSubjectId, 'optionalSubjectId');
    return copy;
  });
  return { list: out, unresolved };
}

export function validateStudentImport(list, ctx = {}) {
  const errors = [];
  const valid = [];
  const seen = new Map();
  const existing = ctx.existingRolls ?? new Set();
  const groups = ctx.groupIds ?? null;
  const defs = ctx.customFieldDefs ?? [];

  if (list.length > IMPORT_LIMITS.maxRows) {
    return { valid: [], errors: [{ row: null, field: null, message: `At most ${IMPORT_LIMITS.maxRows} students per import.` }] };
  }

  list.forEach((item, i) => {
    const row = i + 1;
    const rowErrors = [];
    const push = (field, message) => rowErrors.push({ row, field, message });
    if (!item || typeof item !== 'object' || Array.isArray(item)) { push(null, 'Each entry must be an object.'); errors.push(...rowErrors); return; }

    const roll = String(item.roll ?? '').trim();
    if (!roll) push('roll', 'Roll is required.');
    else if (!/^\d{1,6}$/.test(roll)) push('roll', 'Roll must be a whole number (up to 6 digits).');
    else if (seen.has(roll)) push('roll', `Duplicate roll ${roll} (also in row ${seen.get(roll)}).`);
    else if (!ctx.allowExisting && existing.has(roll)) push('roll', `Roll ${roll} already exists in this class and year.`);

    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) push('name', 'Name is required.');
    else if (name.length > IMPORT_LIMITS.maxNameLength) push('name', 'Name is too long.');

    if (ctx.requireGroup && !item.groupId) push('groupId', 'Group is required for this class.');
    for (const k of ['fatherName', 'motherName', 'nameBn', 'section', 'shift', 'studentCode', 'admissionNumber']) if (item[k] != null && typeof item[k] !== 'string') push(k, 'Must be text.');
    for (const k of ['dob', 'admissionDate']) if (item[k] && Number.isNaN(Date.parse(item[k]))) push(k, 'Must be a date (YYYY-MM-DD).');
    if (item.subjectIds != null && !(Array.isArray(item.subjectIds) && item.subjectIds.every((x) => typeof x === 'string'))) push('subjectIds', 'Must be a list of subject ids.');
    if (item.groupId && groups && !groups.has(item.groupId)) push('groupId', `Unknown group "${item.groupId}" for this class.`);

    for (const key of Object.keys(item)) if (!CORE_FIELDS.has(key)) push(key, `Unknown field "${key}". Put extra data inside "customFields".`);

    const custom = item.customFields ?? {};
    if (typeof custom !== 'object' || Array.isArray(custom)) push('customFields', 'customFields must be an object.');
    else {
      for (const def of defs) {
        const v = custom[def.key];
        if (def.required && (v === undefined || v === null || v === '')) push(`customFields.${def.key}`, `${def.label ?? def.key} is required.`);
        if (v != null && def.type === 'number' && typeof v !== 'number') push(`customFields.${def.key}`, 'Must be a number.');
        if (v != null && def.type === 'date' && Number.isNaN(Date.parse(v))) push(`customFields.${def.key}`, 'Must be a date (YYYY-MM-DD).');
        if (v != null && def.type === 'checkbox' && typeof v !== 'boolean') push(`customFields.${def.key}`, 'Must be true or false.');
        if (v != null && v !== '' && def.type === 'select' && Array.isArray(def.options) && !def.options.includes(v)) push(`customFields.${def.key}`, `Must be one of: ${def.options.join(', ')}.`);
      }
      const known = new Set(defs.map((d) => d.key));
      for (const k of Object.keys(custom)) if (!k.startsWith('_') && defs.length && !known.has(k)) push(`customFields.${k}`, `Custom field "${k}" is not defined in Settings.`);
    }

    if (roll && !seen.has(roll)) seen.set(roll, row);
    if (rowErrors.length) errors.push(...rowErrors);
    else valid.push({
      roll, name, nameBn: item.nameBn?.trim() || null, groupId: item.groupId ?? null, optionalSubjectId: item.optionalSubjectId ?? null,
      subjectIds: item.subjectIds ?? null, gender: item.gender ?? null, studentCode: item.studentCode?.trim() || null,
      fatherName: item.fatherName?.trim() || null, motherName: item.motherName?.trim() || null, dob: item.dob || null,
      section: item.section || null, shift: item.shift || null, admissionNumber: item.admissionNumber || null, admissionDate: item.admissionDate || null,
      customFields: custom,
    });
  });

  const all = [...(ctx.extraErrors ?? []), ...errors].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return { valid: all.length ? [] : valid, errors: all };
}
