/**
 * Backend selector.
 *  - Firestore when the VITE_FIREBASE_* configuration is present (production and staging).
 *  - Demo backend ONLY when Firebase is not configured and the user explicitly opened demo mode.
 *    Demo data lives in this browser's localStorage, is clearly labelled, and enforces no security.
 *
 * Interface (all paths are slash-separated strings):
 *   get(path) → doc | null            doc = { id, ...data }
 *   list(collectionPath, { where:[[field, op, value]], orderBy:[[field,'asc'|'desc']], limit, after }) → { items, cursor }
 *   set(path, data, { merge })        update(path, data)        remove(path)
 *   batch() → { set, update, delete, commit() }   (auto-chunked at 450 writes; chunks are not atomic together)
 *   transaction(async (tx) => …)      tx.get / tx.set / tx.update / tx.delete
 *   listenDoc(path, cb, onError) / listenList(collectionPath, query, cb, onError) → unsubscribe
 *   newId(collectionPath)
 */
import { isFirebaseConfigured } from '../../core/config.js';

const DEMO_FLAG = 'crms.demo.enabled';
let backendPromise = null;

export function isDemoMode() {
  if (isFirebaseConfigured()) return false;
  try { return localStorage.getItem(DEMO_FLAG) === '1'; } catch { return false; }
}

export function enableDemoMode() {
  if (isFirebaseConfigured()) throw new Error('Demo mode is not available when Firebase is configured.');
  localStorage.setItem(DEMO_FLAG, '1');
}

export function disableDemoMode() {
  localStorage.removeItem(DEMO_FLAG);
  localStorage.removeItem('crms.demo.session');
}

export function backendKind() {
  if (isFirebaseConfigured()) return 'firestore';
  return isDemoMode() ? 'demo' : 'none';
}

export function getBackend() {
  if (!backendPromise) {
    const kind = backendKind();
    if (kind === 'firestore') backendPromise = import('./firestore-backend.js').then((m) => m.createFirestoreBackend());
    else if (kind === 'demo') backendPromise = import('./demo-backend.js').then((m) => m.getDemoBackend());
    else backendPromise = Promise.reject(Object.assign(new Error('The database is not connected.'), { code: 'not-configured' }));
  }
  return backendPromise;
}

/** Tests inject a backend directly. */
export function _setBackendForTests(backend) { backendPromise = Promise.resolve(backend); }
