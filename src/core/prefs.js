/**
 * Interface preferences (language, theme, install-prompt decision).
 * Stored locally for instant startup; mirrored to users/{uid}.prefs when signed in (Phase 2).
 */
import { emit } from './events.js';

const KEY = 'crms.prefs';
const DEFAULTS = Object.freeze({ lang: 'en', theme: 'light', installPromptDismissed: false, density: 'comfortable', textSize: 'normal', reduceMotion: false });

function read() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

let prefs = read();

export function getPrefs() { return prefs; }

export function setPref(key, value) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown preference: ${key}`);
  prefs = { ...prefs, [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage full or blocked */ }
  emit('prefs', prefs);
  return prefs;
}
