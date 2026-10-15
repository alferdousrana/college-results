/**
 * End-to-end workflows against the demo backend (same repository code as production).
 * These do NOT test Firestore security rules — see tests/integration/firestore-rules.test.js.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, ADMIN, T_SCI, T_BANGLA } from './helpers.js';
import { requestTeacherAccount } from '../../src/auth/auth-service.js';
import { setUserStatus, listUsersByStatus } from '../../src/data/repositories/users-repository.js';
import { saveDraft, shareWithTeachers, loadSessionBundle, transitionSession } from '../../src/data/repositories/sessions-repository.js';
import { createMarkTransport, loadAllMarks, submitSubject } from '../../src/data/repositories/marks-repository.js';
import { computeSession, publishResults, startCorrection, listResults, listPublications, getPrintContext, withdrawPublicLookup } from '../../src/data/repositories/results-repository.js';
import { fetchPublicResult, listPublishedExams } from '../../src/data/repositories/public-results-repository.js';
import { planImport, executeImport, getStudentHistory, saveStudent, listClassRoster } from '../../src/data/repositories/students-repository.js';
import { saveSetting, getSetting } from '../../src/data/repositories/settings-repository.js';
import { parseImportText, validateStudentImport } from '../../src/domain/validation/student-import.js';
import { findMissingMarks } from '../../src/domain/session-calc.js';
import { enqueueMark, flushQueue, listQueue, QueueStatus } from '../../src/offline/offline-queue.js';
import { idb, STORES } from '../../src/offline/idb.js';
import { renderResultSheet } from '../../src/print/result-sheet.js';
import { renderProgressReport } from '../../src/print/progress-report.js';
import { subjectDefinition } from '../../src/domain/session-calc.js';

const HALF = '2026__class-11__half-yearly';
const ANNUAL = '2026__class-11__annual';
let b;

describe('teacher registration and approval', () => {
  beforeAll(async () => { b = await freshDb(); });
  it('self-registration creates a pending teacher that the admin approves', async () => {
    const { uid } = await requestTeacherAccount({ displayName: 'New Teacher', email: 'New@Example.com', password: 'x', phone: '', requestNote: 'Physics' });
    const u = await b.get(`users/${uid}`);
    expect(u).toMatchObject({ role: 'teacher', status: 'pending', email: 'new@example.com' });
    expect((await listUsersByStatus('pending')).map((x) => x.id)).toContain(uid);
    await setUserStatus(ADMIN, uid, 'active');
    expect((await b.get(`users/${uid}`)).status).toBe('active');
    const notes = (await b.list('notifications', { where: [['recipientUid', '==', uid]] })).items;
    expect(notes.map((n) => n.type)).toContain('teacher_approved');
    const audit = (await b.list('auditLogs', { where: [['action', '==', 'teacher_approved']] })).items;
    expect(audit[0]).toMatchObject({ actorUid: 'demo-admin', targetPath: `users/${uid}` });
  });
  it('an administrator cannot deactivate themselves', async () => {
    await expect(setUserStatus(ADMIN, ADMIN.id, 'disabled')).rejects.toThrow();
  });
});

describe('students and JSON import', () => {
  beforeAll(async () => { b = await freshDb(); });
  it('rejects a duplicate roll in the same class and year', async () => {
    await expect(saveStudent(ADMIN, null, { nameEn: 'Dup', current: { yearId: '2026', classId: 'class-11', groupId: 'science', roll: '101' } })).rejects.toThrow(/already used/);
  });
  it('previews, then creates new students and skips or updates existing ones', async () => {
    const text = JSON.stringify({ students: [{ roll: 101, name: 'Changed Name', groupId: 'science' }, { roll: 150, name: 'Brand New', groupId: 'science', nameBn: 'নতুন' }] });
    const parsed = parseImportText(text);
    const { valid, errors } = validateStudentImport(parsed.list, { groupIds: new Set(['science', 'humanities', 'business']), allowExisting: true, requireGroup: true });
    expect(errors).toEqual([]);
    const skipPlan = await planImport(valid, { yearId: '2026', classId: 'class-11', mode: 'skip' });
    expect(skipPlan.map((p) => p.action)).toEqual(['skip', 'create']);
    const report = await executeImport(ADMIN, skipPlan, { yearId: '2026', classId: 'class-11' });
    expect(report).toMatchObject({ created: 1, updated: 0, skipped: 1 });
    const roster = await listClassRoster('2026', 'class-11');
    expect(roster.find((s) => s.current.roll === '101').nameEn).not.toBe('Changed Name'); // never overwritten silently
    const upd = await planImport(valid.slice(0, 1), { yearId: '2026', classId: 'class-11', mode: 'update' });
    await executeImport(ADMIN, upd, { yearId: '2026', classId: 'class-11' });
    expect((await listClassRoster('2026', 'class-11')).find((s) => s.current.roll === '101').nameEn).toBe('Changed Name');
  });
  it('reports row-specific errors and imports nothing', () => {
    const { valid, errors } = validateStudentImport([{ roll: 1, name: 'A', groupId: 'science' }, { roll: 1, name: '', groupId: 'x' }], { groupIds: new Set(['science']), allowExisting: true });
    expect(valid).toEqual([]);
    expect(errors.map((e) => `${e.row}:${e.field}`)).toEqual(expect.arrayContaining(['2:roll', '2:name', '2:groupId']));
  });
});

describe('examination creation, sharing and mark entry', () => {
  let sid;
  beforeAll(async () => { b = await freshDb(); });
  it('creates a draft once and refuses a duplicate', async () => {
    const subjects = (await b.list('subjects')).items.filter((s) => s.groupIds.includes('science'));
    const roster = (await listClassRoster('2026', 'class-11')).filter((s) => s.current.groupId === 'science')
      .map((s) => ({ studentId: s.id, roll: s.current.roll, name: { en: s.nameEn, bn: s.nameBn }, groupId: 'science' }));
    const payload = {
      yearId: '2026', classId: 'class-11', examDefId: 'test', title: { en: 'Test Examination 2026' }, groups: [{ groupId: 'science', subjectIds: ['physics', 'chemistry'] }],
      subjects: subjects.filter((s) => ['physics', 'chemistry'].includes(s.id)).map((s) => ({ subjectId: s.id, definition: { name: s.name, components: s.components }, teacherIds: s.id === 'physics' ? [T_SCI.id] : [] })),
      roster,
    };
    sid = await saveDraft(ADMIN, null, payload);
    expect(sid).toBe('2026__class-11__test');
    await expect(saveDraft(ADMIN, null, payload)).rejects.toThrow(/already exists/);
    const bundle = await loadSessionBundle(sid);
    expect(bundle.session.state).toBe('draft');
    expect(bundle.enrollments).toHaveLength(roster.length);
  });
  it('refuses to share while a subject has no teacher, then shares and notifies', async () => {
    const teachers = { [T_SCI.id]: { status: 'active' } };
    await expect(shareWithTeachers(ADMIN, sid, teachers)).rejects.toMatchObject({ code: 'invalid' });
    const bundle = await loadSessionBundle(sid);
    await saveDraft(ADMIN, sid, {
      yearId: '2026', classId: 'class-11', examDefId: 'test', title: { en: 'Test Examination 2026' }, groups: [{ groupId: 'science', subjectIds: ['physics', 'chemistry'] }],
      subjects: bundle.subjects.map((s) => ({ subjectId: s.id, definition: s.definition, teacherIds: [T_SCI.id] })),
      roster: bundle.enrollments.map((e) => ({ ...e, studentId: e.id })),
    });
    const check = await shareWithTeachers(ADMIN, sid, teachers);
    expect(check.errors).toEqual([]);
    expect((await b.get(`examSessions/${sid}`)).state).toBe('ready_for_mark_entry');
    const notes = (await b.list('notifications', { where: [['recipientUid', '==', T_SCI.id], ['type', '==', 'exam_shared']] })).items;
    expect(notes.length).toBeGreaterThan(0);
  });
  it('autosave path: outbox → transaction; first teacher save starts mark entry', async () => {
    await idb.clear(STORES.QUEUE);
    const bundle = await loadSessionBundle(sid);
    const st = bundle.enrollments[0];
    await enqueueMark({ ownerUid: T_SCI.id, path: { sessionId: sid, subjectId: 'physics', studentId: st.id }, payload: { components: { cq: 40, mcq: 20, prac: 20 }, absent: false }, baseVersion: 0 });
    const report = await flushQueue(T_SCI.id, createMarkTransport(T_SCI));
    expect(report.sent).toBe(1);
    expect((await b.get(`examSessions/${sid}/sessionSubjects/physics/marks/${st.id}`)).version).toBe(1);
    expect((await b.get(`examSessions/${sid}`)).state).toBe('mark_entry_in_progress');
    expect((await b.list('auditLogs', { where: [['action', '==', 'mark_created']] })).items.length).toBeGreaterThan(0);
  });
  it('simultaneous edits: the stale device gets a conflict instead of overwriting', async () => {
    const bundle = await loadSessionBundle(sid);
    const st = bundle.enrollments[0];
    const t = createMarkTransport(T_SCI);
    const p = { sessionId: sid, subjectId: 'physics', studentId: st.id };
    expect((await t({ path: p, payload: { components: { cq: 45, mcq: 20, prac: 20 } }, baseVersion: 1, updatedAt: 1 })).status).toBe('ok');
    const stale = await t({ path: p, payload: { components: { cq: 10, mcq: 20, prac: 20 } }, baseVersion: 1, updatedAt: 2 });
    expect(stale.status).toBe('conflict');
    expect(stale.server.components.cq).toBe(45);
    expect((await b.get(`examSessions/${sid}/sessionSubjects/physics/marks/${st.id}`)).components.cq).toBe(45);
  });
  it('offline edits stay pending and are sent later', async () => {
    await idb.clear(STORES.QUEUE);
    const bundle = await loadSessionBundle(sid);
    const st = bundle.enrollments[1];
    await enqueueMark({ ownerUid: T_SCI.id, path: { sessionId: sid, subjectId: 'physics', studentId: st.id }, payload: { components: { cq: 30, mcq: 15, prac: 15 } }, baseVersion: 0 });
    await flushQueue(T_SCI.id, async () => { throw new Error('offline'); });
    expect((await listQueue(T_SCI.id))[0].status).toBe(QueueStatus.PENDING);
    expect(await b.get(`examSessions/${sid}/sessionSubjects/physics/marks/${st.id}`)).toBeNull();
    await flushQueue(T_SCI.id, createMarkTransport(T_SCI));
    expect(await listQueue(T_SCI.id)).toEqual([]);
    expect((await b.get(`examSessions/${sid}/sessionSubjects/physics/marks/${st.id}`)).components.cq).toBe(30);
  });
  it('absent is recorded separately and is not missing', async () => {
    const bundle = await loadSessionBundle(sid);
    const st = bundle.enrollments[2];
    await createMarkTransport(T_SCI)({ path: { sessionId: sid, subjectId: 'physics', studentId: st.id }, payload: { components: {}, absent: true }, baseVersion: 0, updatedAt: 3 });
    const marks = await loadAllMarks(sid, ['physics']);
    const missing = findMissingMarks(bundle, marks, { subjectId: 'physics' });
    expect(missing.some((m) => m.studentId === st.id)).toBe(false);
    expect(missing.some((m) => m.studentId === bundle.enrollments[3].id)).toBe(true);
  });
});

describe('review, publication, lookup, correction and history', () => {
  beforeAll(async () => { b = await freshDb(); });
  it('the seeded half-yearly sheet is published with a frozen snapshot', async () => {
    const s = await b.get(`examSessions/${HALF}`);
    expect(s).toMatchObject({ state: 'published', publishedVersion: 1 });
    const pubs = await listPublications(HALF);
    expect(pubs[0].snapshot.scale.length).toBe(7);
    expect((await listResults(HALF))).toHaveLength(24);
  });
  it('public lookup returns only the published, sanitized result', async () => {
    const [exam] = await listPublishedExams();
    const found = await fetchPublicResult(exam.id, '101', '');
    expect(found.result.vm.student.roll).toBe('101');
    expect(found.result.vm.student.fatherName).toBeNull();
    expect(await fetchPublicResult(exam.id, '999', '')).toBeNull();
    expect((await listPublishedExams()).some((e) => e.title?.en?.startsWith('Annual'))).toBe(false); // unpublished never listed
  });
  it('publishing is refused while marks are missing', async () => {
    await transitionSession(ADMIN, ANNUAL, 'submitted');
    await transitionSession(ADMIN, ANNUAL, 'under_review');
    const c = await computeSession(ANNUAL);
    expect(c.blocking.length).toBeGreaterThan(0);
    expect(c.sheet.rows.filter((r) => r.result.state === 'INCOMPLETE').every((r) => r.position === null)).toBe(true);
    await expect(publishResults(ADMIN, ANNUAL)).rejects.toMatchObject({ code: 'incomplete' });
  });
  it('changing grading settings does not change published results', async () => {
    const before = (await listResults(HALF)).map((r) => [r.id, r.gpa, r.vm.grade]);
    const g = await getSetting('grading', { fresh: true });
    await saveSetting(ADMIN, 'grading', { scale: g.scale.map((x) => ({ ...x, point: x.point / 2 })), policy: g.policy }, g.revision ?? 0);
    expect((await listResults(HALF)).map((r) => [r.id, r.gpa, r.vm.grade])).toEqual(before);
    const ctx = await getPrintContext(HALF);
    expect(ctx.frozen).toBe(true);
    expect(ctx.scale.find((x) => x.grade === 'A+').point).toBe(5);
  });
  it('a correction needs a reason and creates version 2', async () => {
    await expect(startCorrection(ADMIN, HALF, '')).rejects.toThrow();
    await startCorrection(ADMIN, HALF, 'Physics mark of roll 101 corrected');
    const bundle = await loadSessionBundle(HALF);
    const st = bundle.enrollments.find((e) => e.roll === '101');
    const cur = await b.get(`examSessions/${HALF}/sessionSubjects/physics/marks/${st.id}`);
    expect((await createMarkTransport(ADMIN)({ path: { sessionId: HALF, subjectId: 'physics', studentId: st.id }, payload: { components: { cq: 50, mcq: 25, prac: 25 } }, baseVersion: cur.version, updatedAt: 9 })).status).toBe('ok');
    await expect(publishResults(ADMIN, HALF)).rejects.toThrow(/reason/);
    const r = await publishResults(ADMIN, HALF, { reason: 'Physics mark of roll 101 corrected' });
    expect(r.version).toBe(2);
    const pubs = await listPublications(HALF);
    expect(pubs.map((p) => p.version)).toEqual([2, 1]);
    expect(pubs[0].reason).toMatch(/Physics/);
    expect((await b.list('auditLogs', { where: [['action', '==', 'result_correction_started']] })).items).toHaveLength(1);
  });
  it('keeps per-student history and can withdraw public lookup', async () => {
    const bundle = await loadSessionBundle(HALF);
    const hist = await getStudentHistory(bundle.enrollments[0].studentId);
    expect(hist[0]).toMatchObject({ sessionId: HALF, version: 2 });
    const [exam] = await listPublishedExams();
    await withdrawPublicLookup(ADMIN, HALF);
    expect(await fetchPublicResult(exam.id, '101', '')).toBeNull();
    expect((await listResults(HALF)).length).toBe(24); // internal copies remain
  });
  it('requires the verifier when one is configured', async () => {
    b = await freshDb({ seed: true });
    const pub = await getSetting('publication', { fresh: true });
    await saveSetting(ADMIN, 'publication', { ...pub, verifierField: 'dob' }, pub.revision ?? 0);
    await startCorrection(ADMIN, HALF, 'enable verifier');
    await publishResults(ADMIN, HALF, { reason: 'enable verifier' });
    const [exam] = await listPublishedExams();
    expect(exam.requiresVerifier).toBe(true);
    expect(await fetchPublicResult(exam.id, '101', '')).toBeNull();
    const roster = await listClassRoster('2026', 'class-11');
    const dob = roster.find((s) => s.current.roll === '101').dob;
    expect((await fetchPublicResult(exam.id, '101', dob))?.result.vm.student.roll).toBe('101');
  });
  it('prints the full sheet and marksheets from stored results', async () => {
    const results = await listResults(HALF);
    const bundle = await loadSessionBundle(HALF);
    const ctx = { ...(await getPrintContext(HALF)), lang: 'bn' };
    const sci = results.filter((r) => r.groupId === 'science').map((r) => r.vm);
    const subjects = bundle.sheets.find((s) => s.id === 'science').subjectIds.map((id) => subjectDefinition(bundle.subjects.find((x) => x.id === id)));
    const sheet = renderResultSheet({ vms: sci, subjects, exam: sci[0].exam, groupLabel: sci[0].exam.groupLabel }, ctx);
    expect(sheet.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(sheet.textContent).toContain('পদার্থবিজ্ঞান');
    const report = renderProgressReport(sci[0], { ...ctx, lang: 'en' });
    expect(report.textContent).toContain('Demo Model School & College');
  });
});

describe('subject submission', () => {
  beforeAll(async () => { b = await freshDb(); });
  it('a teacher submits a subject and administrators are notified', async () => {
    await submitSubject(T_BANGLA, ANNUAL, 'bangla', { en: 'Annual Examination 2026' });
    expect((await b.get(`examSessions/${ANNUAL}/sessionSubjects/bangla`)).submission.state).toBe('submitted');
    expect((await b.list('notifications', { where: [['audience', '==', 'admins']] })).items.some((n) => n.type === 'subject_submitted')).toBe(true);
  });
});
