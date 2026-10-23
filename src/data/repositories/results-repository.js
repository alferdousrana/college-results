/**
 * Calculation, publication, correction and archive of results.
 * Publication writes (in this order): results → student history → public results → removal of
 * stale public results → publication record → public exam index → session state "published".
 * Batches are chunked; if a later chunk fails the session stays "under review" and publishing
 * again safely overwrites the same deterministic documents.
 */
import { getBackend } from '../backend/index.js';
import { C, paths, SETTINGS_DOCS } from '../paths.js';
import { serverTime } from '../field-ops.js';
import { addAudit, AuditAction } from './audit-repository.js';
import { notify } from './notifications-repository.js';
import { loadSessionBundle, transitionSession } from './sessions-repository.js';
import { loadAllMarks } from './marks-repository.js';
import { getSetting, getInstitution } from './settings-repository.js';
import { loadAllCatalogues } from './catalogue-repository.js';
import { lookupResultId } from './public-results-repository.js';
import { computeResultSheet, buildCalculationSnapshot, OverallState } from '../../domain/calculation/index.js';
import { buildCalcInputs } from '../../domain/session-calc.js';
import { ExamState } from '../../domain/exam-lifecycle.js';
import { buildStudentViewModel, sanitizeViewModel } from '../../print/view-models.js';

function examLabels(session, cats, groupId) {
  const name = (list, id) => list.find((x) => x.id === id)?.name ?? { en: id, bn: id };
  return {
    title: session.title, yearLabel: cats.years.find((y) => y.id === session.yearId)?.label ?? session.yearId,
    examName: name(cats.examDefs, session.examDefId), classLabel: name(cats.classes, session.classId),
    groupLabel: groupId && groupId !== '_' ? name(cats.groups, groupId) : null, heldOn: session.heldOn ?? null,
  };
}

/** Computes the full sheet in memory (no writes). Optionally uses a frozen grading snapshot. */
export async function computeSession(sid, { grading = null, withPrivate = true } = {}) {
  const b = await getBackend();
  const bundle = await loadSessionBundle(sid);
  const marks = await loadAllMarks(sid, bundle.subjects.map((s) => s.id));
  const g = grading ?? await getSetting(SETTINGS_DOCS.GRADING, { fresh: true });
  const fieldDefs = (await getSetting(SETTINGS_DOCS.STUDENT_FIELDS)).fields ?? [];
  const cats = await loadAllCatalogues();
  const input = buildCalcInputs(bundle, marks);
  const sheet = computeResultSheet({ students: input.students, subjectsByGroup: input.subjectsByGroup, marks: input.marks, policy: g.policy, scale: g.scale });
  const privateRecords = withPrivate
    ? Object.fromEntries(await Promise.all(bundle.enrollments.map(async (e) => [e.id, await b.get(paths.student(e.studentId ?? e.id))])))
    : {};
  const vms = sheet.rows.map((row) => {
    const enrollment = bundle.enrollments.find((e) => e.id === row.studentId);
    return buildStudentViewModel({
      exam: examLabels(bundle.session, cats, row.groupId), enrollment, student: privateRecords[row.studentId],
      defs: input.defs, row, highest: sheet.highestByGroup[row.groupId] ?? {}, customFieldDefs: fieldDefs,
    });
  });
  const blocking = sheet.rows.filter((r) => r.result.state === OverallState.INCOMPLETE);
  return { bundle, marks, grading: g, sheet, vms, input, cats, blocking };
}

/** Stores calculated results for review (Submitted / Under review only). */
export async function saveCalculatedResults(actor, sid) {
  const c = await computeSession(sid);
  if (![ExamState.SUBMITTED, ExamState.UNDER_REVIEW].includes(c.bundle.session.state)) throw new Error('Results can be calculated after mark entry is closed.');
  const b = await getBackend();
  const batch = b.batch();
  c.sheet.rows.forEach((row, i) => batch.set(`${paths.results(sid)}/${row.studentId}`, {
    vm: c.vms[i], groupId: row.groupId, roll: row.roll, rollNumber: Number(row.roll), position: row.position, state: row.result.state,
    gpa: row.result.gpa, totalObtained: row.result.totalObtained, calculatedAt: serverTime(), calculatedBy: actor.id,
  }));
  addAudit(b, batch, { action: AuditAction.RESULTS_CALCULATED, actor, targetPath: paths.session(sid), after: c.sheet.summary });
  await batch.commit();
  return c;
}

/** Publishes (or republishes after a correction). Refuses incomplete or invalid results. */
export async function publishResults(actor, sid, { reason = null, onProgress } = {}) {
  const c = await computeSession(sid);
  const { session } = c.bundle;
  if (session.state !== ExamState.UNDER_REVIEW) throw new Error('Start the review before publishing.');
  if (c.blocking.length) throw Object.assign(new Error(`${c.blocking.length} student(s) still have missing or invalid marks.`), { code: 'incomplete', rows: c.blocking });
  if (session.correction && !reason) throw new Error('Enter the reason for this correction.');

  const b = await getBackend();
  const version = (session.publishedVersion ?? 0) + 1;
  const publicId = session.publicId ?? b.newId(C.PUBLIC_INDEX);
  const pub = await getSetting(SETTINGS_DOCS.PUBLICATION, { fresh: true });
  const printSettings = await getSetting(SETTINGS_DOCS.PRINT, { fresh: true });
  const institution = await getInstitution({ fresh: true });
  const snapshot = buildCalculationSnapshot({ policy: c.grading.policy, scale: c.grading.scale, subjects: Object.values(c.input.defs) });
  const verifierField = pub.verifierField || null;

  const batch = b.batch();
  const publicIds = [];
  const unverifiable = [];
  for (let i = 0; i < c.sheet.rows.length; i++) {
    const row = c.sheet.rows[i]; const vm = c.vms[i];
    const enrollment = c.bundle.enrollments.find((e) => e.id === row.studentId);
    const studentId = enrollment.studentId ?? row.studentId;
    batch.set(`${paths.results(sid)}/${row.studentId}`, {
      vm, groupId: row.groupId, roll: row.roll, rollNumber: Number(row.roll), position: row.position, state: row.result.state,
      gpa: row.result.gpa, totalObtained: row.result.totalObtained, publishedVersion: version, calcFingerprint: snapshot.fingerprint,
      calculatedAt: serverTime(), calculatedBy: actor.id,
    });
    batch.set(`${paths.studentHistory(studentId)}/${sid}`, {
      sessionId: sid, title: session.title, yearId: session.yearId, classId: session.classId, examDefId: session.examDefId, groupId: row.groupId,
      roll: row.roll, gpa: row.result.gpa, grade: row.result.grade, status: row.result.state, position: row.position, version, publishedAt: serverTime(),
    });
    let verifier = '';
    if (verifierField) {
      const rec = await b.get(paths.student(studentId));
      verifier = verifierField.startsWith('custom:') ? rec?.customFields?.[verifierField.slice(7)] : rec?.[verifierField];
      if (!verifier) { unverifiable.push(row.roll); continue; }
    }
    const hash = await lookupResultId(publicId, row.roll, verifier);
    publicIds.push(hash);
    const publicVm = sanitizeViewModel(vm, pub.publicStudentFields ?? []);
    if (pub.showPositionPublicly === false) publicVm.position = null;
    batch.set(`${C.PUBLIC_RESULTS}/${hash}`, { publicId, version, vm: publicVm, publishedAt: serverTime() });
  }
  const previous = session.publishedVersion ? await b.get(`${paths.publications(sid)}/v${session.publishedVersion}`) : null;
  for (const old of session.publicIds ?? previous?.publicIds ?? []) if (!publicIds.includes(old)) batch.delete(`${C.PUBLIC_RESULTS}/${old}`);
  batch.set(`${paths.publications(sid)}/v${version}`, {
    version, snapshot: JSON.parse(JSON.stringify(snapshot)), fingerprint: snapshot.fingerprint, publicIds, reason, by: actor.id,
    byName: actor.displayName ?? null, summary: c.sheet.summary, unverifiable, publishedAt: serverTime(),
  });
  const firstGroup = c.sheet.rows[0]?.groupId;
  const labels = examLabels(session, c.cats, firstGroup);
  batch.set(`${C.PUBLIC_INDEX}/${publicId}`, {
    classLabel: labels.classLabel, yearLabel: String(labels.yearLabel), examLabel: labels.examName, title: session.title,
    requiresVerifier: Boolean(verifierField), verifierLabel: verifierField ? pub.verifierLabel : null,
    institution: { name: institution.name, address: institution.address, header: institution.header, footer: institution.footer, signatories: institution.signatories, assets: institution.assets },
    print: printSettings, scale: c.grading.scale, version, publishedAt: serverTime(),
  });
  addAudit(b, batch, { action: AuditAction.RESULT_PUBLISHED, actor, targetPath: paths.session(sid), after: { version, ...c.sheet.summary }, reason });
  await batch.commit(onProgress);

  await transitionSession(actor, sid, ExamState.PUBLISHED, { reason, extra: { publishedVersion: version, publicId, publicIds, publishedAt: serverTime(), correction: null, publicWithdrawn: false } });
  const nb = b.batch();
  for (const uid of session.teacherIds ?? []) await notify({ recipientUid: uid, type: version > 1 ? 'result_corrected' : 'result_published', params: { title: session.title }, link: `/teacher/results?sid=${encodeURIComponent(sid)}` }, nb);
  await nb.commit();
  return { version, publicId, summary: c.sheet.summary, unverifiable };
}

export async function startCorrection(actor, sid, reason) {
  if (!reason?.trim()) throw new Error('Enter the reason for the correction.');
  await transitionSession(actor, sid, ExamState.UNDER_REVIEW, { reason, extra: { correction: { reason, by: actor.id } } });
  const b = await getBackend();
  const batch = b.batch();
  addAudit(b, batch, { action: AuditAction.RESULT_CORRECTION_STARTED, actor, targetPath: paths.session(sid), reason });
  await notify({ audience: 'admins', type: 'result_correction', params: { sid }, link: `/admin/sheet?sid=${encodeURIComponent(sid)}` }, batch);
  await batch.commit();
}

/** Removes an exam from public lookup (internal results remain). */
export async function withdrawPublicLookup(actor, sid) {
  const b = await getBackend();
  const session = await b.get(paths.session(sid));
  const pub = session.publishedVersion ? await b.get(`${paths.publications(sid)}/v${session.publishedVersion}`) : null;
  const batch = b.batch();
  new Set([...(pub?.publicIds ?? []), ...(session.publicIds ?? [])]).forEach((id) => batch.delete(`${C.PUBLIC_RESULTS}/${id}`));
  if (session.publicId) batch.delete(`${C.PUBLIC_INDEX}/${session.publicId}`);
  batch.update(paths.session(sid), { publicWithdrawn: true, updatedAt: serverTime() });
  addAudit(b, batch, { action: AuditAction.PUBLIC_LOOKUP_WITHDRAWN, actor, targetPath: paths.session(sid) });
  await batch.commit();
}

/**
 * Re-applies the CURRENT publication privacy settings (which student details are public, verification)
 * to an already published sheet. Marks, grades, positions and the frozen print snapshot are unchanged.
 */
export async function refreshPublicLookup(actor, sid) {
  const b = await getBackend();
  const session = await b.get(paths.session(sid));
  if (![ExamState.PUBLISHED, ExamState.ARCHIVED].includes(session?.state)) throw new Error('Only published result sheets can be updated.');
  const pub = await getSetting(SETTINGS_DOCS.PUBLICATION, { fresh: true });
  const results = await listResults(sid);
  const previous = await b.get(`${paths.publications(sid)}/v${session.publishedVersion}`);
  const verifierField = pub.verifierField || null;
  const batch = b.batch();
  const publicIds = [], unverifiable = [];
  for (const r of results) {
    let verifier = '';
    if (verifierField) {
      const enr = await b.get(`${paths.enrollments(sid)}/${r.id}`);
      const rec = await b.get(paths.student(enr?.studentId ?? r.id));
      verifier = verifierField.startsWith('custom:') ? rec?.customFields?.[verifierField.slice(7)] : rec?.[verifierField];
      if (!verifier) { unverifiable.push(r.roll); continue; }
    }
    const hash = await lookupResultId(session.publicId, r.roll, verifier);
    publicIds.push(hash);
    const vm = sanitizeViewModel(r.vm, pub.publicStudentFields ?? []);
    if (pub.showPositionPublicly === false) vm.position = null;
    batch.set(`${C.PUBLIC_RESULTS}/${hash}`, { publicId: session.publicId, version: session.publishedVersion, vm, publishedAt: serverTime() });
  }
  for (const old of new Set([...(session.publicIds ?? []), ...(previous?.publicIds ?? [])])) if (!publicIds.includes(old)) batch.delete(`${C.PUBLIC_RESULTS}/${old}`);
  batch.update(`${C.PUBLIC_INDEX}/${session.publicId}`, { requiresVerifier: Boolean(verifierField), verifierLabel: verifierField ? pub.verifierLabel : null });
  batch.update(paths.session(sid), { publicIds, updatedAt: serverTime() });
  addAudit(b, batch, { action: 'public_lookup_updated', actor, targetPath: paths.session(sid), after: { students: publicIds.length, fields: pub.publicStudentFields ?? [], verifier: verifierField } });
  await batch.commit();
  return { count: publicIds.length, unverifiable };
}

export async function listResults(sid) {
  const b = await getBackend();
  return (await b.list(paths.results(sid), { orderBy: [['rollNumber', 'asc']] })).items;
}

export async function listPublications(sid) {
  const b = await getBackend();
  return (await b.list(paths.publications(sid), { orderBy: [['version', 'desc']] })).items;
}

/** Print context for a session: institution, print settings and scale — frozen copy once published. */
export async function getPrintContext(sid) {
  const b = await getBackend();
  const session = await b.get(paths.session(sid));
  if (session?.publicId && !session.publicWithdrawn && [ExamState.PUBLISHED, ExamState.ARCHIVED].includes(session.state)) {
    const idx = await b.get(`${C.PUBLIC_INDEX}/${session.publicId}`);
    if (idx) return { institution: idx.institution, print: idx.print, scale: idx.scale, frozen: true };
  }
  const [institution, print, grading] = await Promise.all([getInstitution(), getSetting(SETTINGS_DOCS.PRINT), getSetting(SETTINGS_DOCS.GRADING)]);
  return { institution, print, scale: grading.scale, frozen: false };
}
