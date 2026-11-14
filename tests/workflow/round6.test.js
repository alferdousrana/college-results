/** Round 6: principal & administrators, view-only overview data, notices and public counts. */
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, ADMIN } from './helpers.js';
import { listAdministration, saveCreatedAdministrator, updateAdministrator, deleteAdministrator, setUserStatus, listActiveTeacherNames } from '../../src/data/repositories/users-repository.js';
import { listPublishedSessions } from '../../src/data/repositories/sessions-repository.js';
import { saveNotice, deleteNotice, listPublicNotices, listAllNotices, getNoticeFile, sortNotices, MAX_PDF_BYTES } from '../../src/data/repositories/notices-repository.js';
import { publicHeadCounts, syncPublicCounts } from '../../src/data/repositories/stats-repository.js';
import { getInstitution } from '../../src/data/repositories/settings-repository.js';

const PRINCIPAL = { id: 'demo-principal', role: 'principal', displayName: 'Demo Principal' };
let b;
describe('administration accounts', () => {
  beforeAll(async () => { b = await freshDb(); });
  it('lists Super Admin first, then principal and administrators', async () => {
    const rows = await listAdministration();
    expect(rows.map((r) => r.role)).toEqual(['super_admin', 'principal', 'administrator']);
  });
  it('only the Super Admin creates a principal; a principal creates administrators', async () => {
    const p = { displayName: 'New P', email: 'np@x.test', role: 'principal', status: 'active' };
    await expect(saveCreatedAdministrator(PRINCIPAL, 'np', p)).rejects.toThrow();
    await saveCreatedAdministrator(ADMIN, 'np', p);
    await saveCreatedAdministrator(PRINCIPAL, 'na', { displayName: 'New A', email: 'na@x.test', role: 'administrator', status: 'active' });
    expect((await b.get('users/na')).role).toBe('administrator');
  });
  it('a principal cannot change the Super Admin or another principal', async () => {
    await expect(setUserStatus(PRINCIPAL, 'demo-admin', 'disabled')).rejects.toThrow();
    await expect(updateAdministrator(PRINCIPAL, 'np', { displayName: 'X' })).rejects.toThrow();
    await expect(deleteAdministrator(PRINCIPAL, 'np')).rejects.toThrow();
    await updateAdministrator(PRINCIPAL, 'na', { displayName: 'Office A', designation: 'Head Assistant', grants: { students: true } });
    expect((await b.get('users/na')).grants.students).toBe(true);
    await deleteAdministrator(PRINCIPAL, 'na');
    expect(await b.get('users/na')).toBeFalsy();
    await deleteAdministrator(ADMIN, 'np');
  });
});

describe('overview data', () => {
  it('lists active teachers and published sheets', async () => {
    expect((await listActiveTeacherNames()).length).toBe(4);
    const pub = await listPublishedSessions();
    expect(pub.length).toBe(1);
    expect(pub[0].state).toBe('published');
  });
});

describe('notices', () => {
  it('saves, attaches a PDF, hides drafts from the public list and deletes', async () => {
    const pdf = { data: 'data:application/pdf;base64,JVBERi0xLjQK', name: 'routine.pdf', size: 9 };
    const id = await saveNotice(ADMIN, null, { title: { bn: 'রুটিন' }, date: '2030-01-01', published: true }, pdf);
    expect((await b.get(`notices/${id}`)).file.name).toBe('routine.pdf');
    expect((await getNoticeFile(id)).data).toContain('base64');
    const pub = await listPublicNotices();
    expect(pub.every((n) => n.published)).toBe(true);
    expect(pub[0].pinned).toBe(true);              // pinned demo notice stays on top
    expect(pub[1].id).toBe(id);                    // then the newest date
    await saveNotice(ADMIN, id, { title: { bn: 'রুটিন' }, date: '2030-01-01' }, null);   // remove the PDF
    expect(await getNoticeFile(id)).toBeFalsy();
    await expect(saveNotice(ADMIN, null, { title: { en: 'x' } }, { ...pdf, size: MAX_PDF_BYTES + 1 })).rejects.toThrow();
    await expect(saveNotice(ADMIN, null, { title: { en: '' } })).rejects.toThrow();
    await expect(saveNotice(ADMIN, null, { title: { en: 'x' }, link: 'javascript:alert(1)' })).rejects.toThrow();
    await deleteNotice(ADMIN, id);
    expect((await listAllNotices()).some((n) => n.id === id)).toBe(false);
  });
  it('sorts pinned first, then by date', () => {
    const s = sortNotices([{ id: 'a', date: '2026-01-01' }, { id: 'b', date: '2026-03-01' }, { id: 'c', date: '2025-01-01', pinned: true }]);
    expect(s.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('numbers on the public page', () => {
  it('counts active students and teachers and keeps automatic numbers in sync', async () => {
    const c = await publicHeadCounts();
    expect(c).toMatchObject({ students: 24, teachers: 4 });
    await syncPublicCounts({ students: 30, teachers: 5 });
    expect((await getInstitution({ fresh: true })).about).toMatchObject({ studentCount: 30, teacherCount: 5 });
    await b.update('institution/public', { about: { ...(await getInstitution({ fresh: true })).about, countMode: 'manual' } });
    await syncPublicCounts({ students: 1, teachers: 1 });
    expect((await getInstitution({ fresh: true })).about.studentCount).toBe(30);
  });
});
