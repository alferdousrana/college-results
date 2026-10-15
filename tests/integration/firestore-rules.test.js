/**
 * Security-rules integration tests. Run with the Firestore emulator:
 *   npm run test:rules   (requires firebase-tools and Java)
 * Skipped automatically when FIRESTORE_EMULATOR_HOST is not set.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const d = enabled ? describe : describe.skip;
let env;

d('firestore.rules', () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: 'demo-crms', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'users/admin'), { role: 'super_admin', status: 'active' });
      await setDoc(doc(db, 'users/t1'), { role: 'teacher', status: 'active' });
      await setDoc(doc(db, 'users/t2'), { role: 'teacher', status: 'active' });
      await setDoc(doc(db, 'users/tp'), { role: 'teacher', status: 'pending' });
      await setDoc(doc(db, 'examSessions/y__c__e'), { yearId: 'y', classId: 'c', examDefId: 'e', state: 'mark_entry_in_progress', teacherIds: ['t1', 't2'] });
      await setDoc(doc(db, 'examSessions/y__c__e/sessionSubjects/phy'), { teacherIds: ['t1'] });
      await setDoc(doc(db, 'examSessions/y__c__e/enrollments/st1'), { roll: '1' });
      await setDoc(doc(db, 'publicResults/abc'), { gpa: 5 });
      await setDoc(doc(db, 'students/st1'), { nameEn: 'A' });
      await setDoc(doc(db, 'examSessions/y__c__e/results/st1'), { gpa: 5 });
    });
  });

  const mark = (uid, version) => ({ studentId: 'st1', subjectId: 'phy', components: { cq: 40 }, absent: false, version, updatedBy: uid, updatedAt: serverTimestamp() });
  const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@x.test` }).firestore();

  it('a teacher cannot make themselves admin', async () => {
    await assertFails(updateDoc(doc(as('t1'), 'users/t1'), { role: 'super_admin' }));
  });
  it('self-registration must be a pending teacher', async () => {
    const db = as('new');
    await assertFails(setDoc(doc(db, 'users/new'), { displayName: 'N', email: 'new@x.test', role: 'super_admin', status: 'active', createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, 'users/new'), { displayName: 'N', email: 'new@x.test', role: 'teacher', status: 'pending', createdAt: serverTimestamp() }));
  });
  it('assigned teacher can enter marks; unassigned and pending cannot', async () => {
    await assertSucceeds(setDoc(doc(as('t1'), 'examSessions/y__c__e/sessionSubjects/phy/marks/st1'), mark('t1', 1)));
    await assertFails(setDoc(doc(as('t2'), 'examSessions/y__c__e/sessionSubjects/phy/marks/st1'), mark('t2', 2)));
    await assertFails(setDoc(doc(as('tp'), 'examSessions/y__c__e/sessionSubjects/phy/marks/st1'), mark('tp', 2)));
  });
  it('stale writes are rejected (version must increase by one)', async () => {
    await assertSucceeds(setDoc(doc(as('t1'), 'examSessions/y__c__e/sessionSubjects/phy/marks/st1'), mark('t1', 1)));
    await assertFails(setDoc(doc(as('t1'), 'examSessions/y__c__e/sessionSubjects/phy/marks/st1'), mark('t1', 1)));
    await assertSucceeds(setDoc(doc(as('t1'), 'examSessions/y__c__e/sessionSubjects/phy/marks/st1'), mark('t1', 2)));
  });
  it('teachers cannot publish', async () => {
    await assertFails(updateDoc(doc(as('t1'), 'examSessions/y__c__e'), { state: 'published' }));
  });
  it('teachers cannot read student records, settings writes, audit logs or unpublished results', async () => {
    const t1 = as('t1');
    await assertFails(getDoc(doc(t1, 'students/st1')));
    await assertFails(setDoc(doc(t1, 'settings/grading'), { scale: [] }));
    await assertFails(getDocs(collection(t1, 'auditLogs')));
    await assertFails(getDoc(doc(t1, 'examSessions/y__c__e/results/st1')));
  });
  it('audit records cannot be edited or deleted, even by an admin', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'auditLogs/a1'), { action: 'x', actorUid: 'admin' }));
    await assertFails(updateDoc(doc(as('admin'), 'auditLogs/a1'), { action: 'y' }));
    await assertFails(deleteDoc(doc(as('admin'), 'auditLogs/a1')));
  });
  it('audit entries must name the caller as actor', async () => {
    await assertFails(setDoc(doc(as('t1'), 'auditLogs/a2'), { action: 'x', actorUid: 'admin', actorRole: 'super_admin', at: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(as('t1'), 'auditLogs/a3'), { action: 'x', actorUid: 't1', actorRole: 'teacher', at: serverTimestamp() }));
  });
  it('a teacher cannot approve another account or themselves', async () => {
    await assertFails(updateDoc(doc(as('t1'), 'users/tp'), { status: 'active' }));
    await assertFails(updateDoc(doc(as('tp'), 'users/tp'), { status: 'active' }));
    await assertSucceeds(updateDoc(doc(as('admin'), 'users/tp'), { status: 'active' }));
  });
  it('only the admin manages settings and students', async () => {
    await assertSucceeds(setDoc(doc(as('admin'), 'settings/grading'), { scale: [] }));
    await assertSucceeds(getDoc(doc(as('admin'), 'students/st1')));
  });
  it('feature flags are read-only for everyone in the browser', async () => {
    await assertFails(setDoc(doc(as('admin'), 'featureFlags/global'), { features: {} }));
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'featureFlags/global')));
  });
  it('notifications are private to their recipient', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'notifications/n1'), { recipientUid: 't1', readBy: [] }));
    await assertSucceeds(getDoc(doc(as('t1'), 'notifications/n1')));
    await assertFails(getDoc(doc(as('t2'), 'notifications/n1')));
    await assertSucceeds(updateDoc(doc(as('t1'), 'notifications/n1'), { readBy: ['t1'] }));
  });
  it('teachers cannot write marks after their subject is submitted or the sheet is published', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'examSessions/y__c__e/sessionSubjects/phy'), { submission: { state: 'submitted' } }));
    await assertFails(setDoc(doc(as('t1'), 'examSessions/y__c__e/sessionSubjects/phy/marks/st1'), mark('t1', 1)));
  });
  it('public visitors can get but not list published results, and cannot read sessions', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, 'publicResults/abc')));
    await assertFails(getDocs(collection(anon, 'publicResults')));
    await assertFails(getDoc(doc(anon, 'examSessions/y__c__e')));
  });
});
