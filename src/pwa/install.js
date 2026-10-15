/**
 * Install prompt handling.
 * - The browser's beforeinstallprompt is captured and deferred.
 * - Our own banner appears at most once, after the user has used the app (second navigation),
 *   and never again after "Install" or "Not now" (decision stored in prefs).
 * - Settings → Install app stays available whenever the browser allows installation.
 */
import { emit } from '../core/events.js';
import { getPrefs, setPref } from '../core/prefs.js';

let deferred = null;
let installed = false;

export function initInstall() {
  installed = isStandalone();
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    emit('install', state());
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    setPref('installPromptDismissed', true);
    emit('install', state());
  });
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function state() {
  return { canInstall: Boolean(deferred) && !installed, installed };
}

export function shouldShowBanner() {
  return state().canInstall && !getPrefs().installPromptDismissed;
}

export async function promptInstall() {
  if (!deferred) return 'unavailable';
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null; // a prompt event can only be used once
  setPref('installPromptDismissed', true);
  emit('install', state());
  return outcome;
}

export function dismissBanner() {
  setPref('installPromptDismissed', true);
  emit('install', state());
}
