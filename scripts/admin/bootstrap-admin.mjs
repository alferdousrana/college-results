#!/usr/bin/env node
/**
 * One-time Super Admin bootstrap (no public admin-registration endpoint exists).
 *
 * 1. The future administrator creates an account in the app ("Request a teacher account").
 * 2. The developer runs, on a trusted machine:
 *      GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json \
 *        node scripts/admin/bootstrap-admin.mjs admin@college.edu.bd
 * 3. The script refuses to run if a super_admin already exists, unless --force-additional is given.
 * The service-account file must never be committed or uploaded to Vercel.
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const email = process.argv[2];
const force = process.argv.includes('--force-additional');
if (!email) { console.error('Usage: node bootstrap-admin.mjs <email> [--force-additional]'); process.exit(1); }

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const user = await getAuth().getUserByEmail(email);

const existing = await db.collection('users').where('role', '==', 'super_admin').where('status', '==', 'active').limit(1).get();
if (!existing.empty && !force) { console.error('A Super Admin already exists. Use the app to promote additional admins.'); process.exit(1); }

await db.runTransaction(async (tx) => {
  const ref = db.doc(`users/${user.uid}`);
  const snap = await tx.get(ref);
  tx.set(ref, {
    displayName: snap.data()?.displayName ?? user.displayName ?? email,
    email,
    role: 'super_admin',
    status: 'active',
    approvedBy: 'bootstrap-script',
    approvedAt: FieldValue.serverTimestamp(),
    createdAt: snap.data()?.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  tx.set(db.collection('auditLogs').doc(), {
    action: 'bootstrap_super_admin', actorUid: 'bootstrap-script', actorRole: 'system',
    targetPath: `users/${user.uid}`, at: FieldValue.serverTimestamp(),
  });
});
console.log(`${email} is now the Super Admin.`);
