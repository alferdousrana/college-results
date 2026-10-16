/** Round 4: starter data, group choices with combined papers, and safe deletion (demo backend). */
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, ADMIN } from './helpers.js';
import starter from '../../config/starter-data.json';
import { planStarterData, applyStarterData } from '../../src/data/repositories/starter-repository.js';
import { saveDraft, shareWithTeachers, transitionSession, loadSessionBundle } from '../../src/data/repositories/sessions-repository.js';
import { createMarkTransport } from '../../src/data/repositories/marks-repository.js';
import { publishResults, listResults, computeSession } from '../../src/data/repositories/results-repository.js';
import { saveStudent } from '../../src/data/repositories/students-repository.js';
import { deleteResultSheet, deleteStudent, deleteSubject, deleteTeacher, deleteCatalogueItem } from '../../src/data/repositories/deletion-repository.js';
import { listCatalogue } from '../../src/data/repositories/catalogue-repository.js';
import { studentSubjectIds } from '../../src/domain/session-calc.js';

let b;
describe('college starter data and a science examination', () => {
  let sid; const ids = [];
  beforeAll(async () => {
    b = await freshDb({ seed: false });
    await b.set('users/demo-admin', { role: 'super_admin', status: 'active', displayName: 'Admin', createdAt: 1 });
    await b.set('users/t1', { role: 'teacher', status: 'active', displayName: 'T One', createdAt: 1 });
  });
  it('loads 26 subjects, groups with rules and the institution', async () => {
    const plan = await planStarterData(starter);
    const r = await applyStarterData(ADMIN, starter, plan);
    expect(r.created).toBe(plan.length);
    expect((await listCatalogue('subjects', { fresh: true })).length).toBe(26);
    expect((await b.get('groups/science')).rules).toEqual({ choiceCount: 1, requiresFourth: true, examsPerStudent: 9 });
    expect((await b.get('institution/public')).name.bn).toMatch(/আজিমুন্নেছা/);
    const again = await applyStarterData(ADMIN, starter, await planStarterData(starter), { updateMatching: false });
    expect(again.created).toBe(0); // idempotent
  });
  it('a science student sits exactly 9 papers and Bangla/English are graded as combined subjects', async () => {
    const subjects = (await listCatalogue('subjects', { fresh: true })).filter((s) => s.groupIds.includes('science'));
    for (const [roll, main, fourth] of [['101', 'higher-math', 'biology'], ['102', 'biology', 'psychology']]) {
      ids.push({ id: await saveStudent(ADMIN, null, { nameEn: `S${roll}`, current: { yearId: '2026-2027', classId: 'class-11', groupId: 'science', roll } }), roll, main, fourth });
    }
    sid = await saveDraft(ADMIN, null, {
      yearId: '2026-2027', classId: 'class-11', examDefId: 'annual', title: { en: 'Annual 2026' },
      groups: [{ groupId: 'science', subjectIds: subjects.map((s) => s.id), subjectRoles: Object.fromEntries(subjects.map((s) => [s.id, s.groupRoles.science])), subjectColumns: {}, choiceCount: 1, requiresFourth: true, examsPerStudent: 9 }],
      subjects: subjects.map((s) => ({ subjectId: s.id, definition: { name: s.name, order: s.order, combine: s.combine, components: s.components }, teacherIds: ['t1'] })),
      roster: ids.map((x) => ({ studentId: x.id, roll: x.roll, name: { en: `S${x.roll}` }, groupId: 'science', subjectIds: [x.main, x.fourth], optionalSubjectId: x.fourth })),
    });
    const check = await shareWithTeachers(ADMIN, sid, { t1: { status: 'active' } });
    expect(check.errors).toEqual([]); expect(check.warnings).toEqual([]);
    const bundle = await loadSessionBundle(sid);
    expect(studentSubjectIds(bundle, bundle.enrollments[0]).length).toBe(9);
    const t = createMarkTransport(ADMIN);
    for (const e of bundle.enrollments) for (const subId of studentSubjectIds(bundle, e)) {
      const def = bundle.subjects.find((x) => x.id === subId).definition;
      await t({ path: { sessionId: sid, subjectId: subId, studentId: e.id }, payload: { components: Object.fromEntries(def.components.map((c) => [c.id, Math.round(c.maxMarks * 0.8)])) }, baseVersion: 0, updatedAt: 1 });
    }
    await transitionSession(ADMIN, sid, 'mark_entry_in_progress');
    await transitionSession(ADMIN, sid, 'submitted');
    await transitionSession(ADMIN, sid, 'under_review');
    const c = await computeSession(sid);
    const r0 = c.sheet.rows[0].result;
    expect(r0.subjectResults.map((x) => x.subjectId)).toContain('combo_bangla');
    expect(r0.subjectResults.length).toBe(7); // Bangla, English, ICT, Physics, Chemistry, main + 4th
    expect(r0.gpa).toBe(5);
    await publishResults(ADMIN, sid);
    const res = await listResults(sid);
    const bangla = res[0].vm.subjects.find((x) => x.id === 'combo_bangla');
    expect(bangla.parts.map((p) => p.paper)).toEqual(['1st', '2nd']);
  });
  it('refuses to delete what is in use', async () => {
    await expect(deleteStudent(ADMIN, ids[0].id)).rejects.toMatchObject({ code: 'in-use' });
    await expect(deleteSubject(ADMIN, 'physics')).rejects.toMatchObject({ code: 'in-use' });
    await expect(deleteCatalogueItem(ADMIN, 'classes', 'class-11')).rejects.toMatchObject({ code: 'in-use' });
    await expect(deleteTeacher(ADMIN, 't1')).rejects.toMatchObject({ code: 'in-use' });
  });
  it('deletes a published (test) sheet completely, then its students and subjects can go', async () => {
    await expect(deleteResultSheet(ADMIN, sid, '')).rejects.toThrow(/reason/);
    await deleteResultSheet(ADMIN, sid, 'test data');
    expect(await b.get(`examSessions/${sid}`)).toBeNull();
    expect((await b.list(`examSessions/${sid}/results`)).items).toEqual([]);
    expect((await b.list('publicResults')).items).toEqual([]);
    expect((await b.list(`students/${ids[0].id}/publishedResults`)).items).toEqual([]);
    expect((await b.list('auditLogs', { where: [['action', '==', 'session_deleted']] })).items[0].reason).toBe('test data');
    await deleteStudent(ADMIN, ids[0].id);
    expect(await b.get(`students/${ids[0].id}`)).toBeNull();
    expect(await b.get('classEnrollments/2026-2027__class-11__101')).toBeNull();
    await deleteSubject(ADMIN, 'sanskrit');
    expect(await b.get('subjects/sanskrit')).toBeNull();
    await deleteCatalogueItem(ADMIN, 'examDefinitions', 'pre-test');
    expect(await b.get('examDefinitions/pre-test')).toBeNull();
  });
  it('a teacher who entered nothing can be deleted; one with history cannot', async () => {
    await b.set('users/t2', { role: 'teacher', status: 'active', displayName: 'T Two', createdAt: 1 });
    await deleteTeacher(ADMIN, 't2');
    expect(await b.get('users/t2')).toBeNull();
    await expect(deleteTeacher(ADMIN, ADMIN.id)).rejects.toThrow();
  });
});
