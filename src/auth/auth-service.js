/**
 * Authentication service.
 *  Firestore mode: Firebase Authentication (email + password); profile = users/{uid}.
 *  Demo mode: choose a demo persona; no passwords; clearly labelled, never production.
 */
import { getState, setState } from '../core/store.js';
import { backendKind, getBackend } from '../data/backend/index.js';
import { serverTime } from '../data/field-ops.js';
import { AccountStatus, Role } from './roles.js';

const DEMO_SESSION = 'crms.demo.session';
let unsubProfile = null;

function watchProfile(backend, uid) {
  unsubProfile?.();
  unsubProfile = backend.listenDoc(`users/${uid}`,
    (doc) => setState({ profile: doc, authResolved: true }),
    (err) => { console.warn('[auth] profile listener', err); setState({ profile: null, authResolved: true }); });
}

export async function initAuth() {
  const kind = backendKind();
  setState({ backendKind: kind });
  if (kind === 'none') { setState({ authResolved: true, firebaseReady: false }); return; }
  const backend = await getBackend();
  setState({ firebaseReady: true });

  if (kind === 'demo') {
    const { ensureDemoSeed } = await import('../demo/seed.js');
    await ensureDemoSeed(backend);
    const uid = localStorage.getItem(DEMO_SESSION);
    if (!uid) { setState({ authUser: null, profile: null, authResolved: true }); return; }
    setState({ authUser: { uid, email: `${uid}@demo.invalid` } });
    watchProfile(backend, uid);
    return;
  }

  const { getFirebase } = await import('../core/firebase.js');
  const { onAuthStateChanged } = await import('firebase/auth');
  onAuthStateChanged(getFirebase().auth, (user) => {
    unsubProfile?.(); unsubProfile = null;
    if (!user) { setState({ authUser: null, profile: null, authResolved: true }); return; }
    setState({ authUser: { uid: user.uid, email: user.email } });
    watchProfile(backend, user.uid);
  });
}

export async function signIn(email, password) {
  const { getFirebase } = await import('../core/firebase.js');
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  return signInWithEmailAndPassword(getFirebase().auth, email.trim(), password);
}

export async function demoSignIn(uid) {
  const backend = await getBackend();
  localStorage.setItem(DEMO_SESSION, uid);
  setState({ authUser: { uid, email: `${uid}@demo.invalid` } });
  watchProfile(backend, uid);
}

export async function signOut() {
  unsubProfile?.(); unsubProfile = null;
  if (backendKind() === 'demo') {
    localStorage.removeItem(DEMO_SESSION);
    setState({ authUser: null, profile: null });
    return;
  }
  const { getFirebase } = await import('../core/firebase.js');
  const { signOut: fbSignOut } = await import('firebase/auth');
  await fbSignOut(getFirebase().auth);
}

function pendingProfile({ displayName, email, phone, requestNote }) {
  return {
    displayName: displayName.trim(), email, phone: phone?.trim() || null, requestNote: requestNote?.trim() || null,
    role: Role.TEACHER, status: AccountStatus.PENDING, createdAt: serverTime(), updatedAt: serverTime(),
  };
}

/** Teacher self-registration: creates an account and a PENDING teacher profile. */
export async function requestTeacherAccount(input) {
  const backend = await getBackend();
  if (backendKind() === 'demo') {
    const uid = backend.newId('users');
    await backend.set(`users/${uid}`, pendingProfile({ ...input, email: input.email.trim().toLowerCase() }));
    await demoSignIn(uid);
    return { uid };
  }
  const { getFirebase } = await import('../core/firebase.js');
  const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
  const cred = await createUserWithEmailAndPassword(getFirebase().auth, input.email.trim(), input.password);
  await updateProfile(cred.user, { displayName: input.displayName }).catch(() => {});
  await backend.set(`users/${cred.user.uid}`, pendingProfile({ ...input, email: cred.user.email }));
  return cred.user;
}

/**
 * Admin creates a teacher account directly (already approved).
 * Uses a SECONDARY Firebase app instance so the administrator stays signed in.
 * The new teacher should change the temporary password (password-reset email is sent).
 */
export async function adminCreateTeacher({ displayName, email, phone, tempPassword, role = Role.TEACHER, grants = null, staffId = null }, actorId) {
  const backend = await getBackend();
  let uid;
  if (backendKind() === 'demo') uid = backend.newId('users');
  else {
    const { firebaseConfig } = await import('../core/config.js');
    const { initializeApp, deleteApp } = await import('firebase/app');
    const { getAuth, createUserWithEmailAndPassword, signOut: so, sendPasswordResetEmail } = await import('firebase/auth');
    const secondary = initializeApp(firebaseConfig, `create-teacher-${Date.now()}`);
    try {
      const auth2 = getAuth(secondary);
      const cred = await createUserWithEmailAndPassword(auth2, email.trim(), tempPassword);
      uid = cred.user.uid;
      await sendPasswordResetEmail(auth2, email.trim()).catch(() => {});
      await so(auth2);
    } finally { await deleteApp(secondary); }
  }
  return { uid, profile: {
    displayName: displayName.trim(), email: email.trim().toLowerCase(), phone: phone?.trim() || null,
    role, status: AccountStatus.ACTIVE, approvedBy: actorId, approvedAt: serverTime(), ...(grants ? { grants } : {}), ...(staffId ? { staffId } : {}),
    createdAt: serverTime(), updatedAt: serverTime(), createdByAdmin: true,
  } };
}

export async function sendPasswordReset(email) {
  if (backendKind() !== 'firestore') return;
  const { getFirebase } = await import('../core/firebase.js');
  const { sendPasswordResetEmail } = await import('firebase/auth');
  await sendPasswordResetEmail(getFirebase().auth, email.trim());
}

export function currentProfile() { return getState().profile; }

/** Maps Firebase error codes to message keys without revealing whether an email exists. */
export function authErrorKey(err) {
  if (err?.code === 'auth/network-request-failed') return 'auth.errorOfflineFirst';
  if (err?.code === 'auth/too-many-requests') return 'auth.errorTooMany';
  return 'auth.errorGeneric';
}
