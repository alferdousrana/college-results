/** Minimal observable state container. Feature modules keep their own state; this holds session-wide state. */
import { emit } from './events.js';

const state = {
  firebaseReady: false,
  authUser: null,   // Firebase user (uid, email)
  profile: null,    // users/{uid} document
  authResolved: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  flags: null,
};

export function getState() { return state; }

export function setState(patch) {
  Object.assign(state, patch);
  emit('state', state);
}
