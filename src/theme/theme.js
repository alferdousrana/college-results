/** Light/dark/system theme. Print output never uses the app theme (see print/print.css). */
import { getPrefs, setPref } from '../core/prefs.js';

export const THEMES = Object.freeze(['light', 'dark', 'system']);
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme(choice = getPrefs().theme) {
  const resolved = choice === 'system' ? (media?.matches ? 'dark' : 'light') : choice;
  document.documentElement.dataset.theme = resolved === 'dark' ? 'dark' : 'light';
}

export function setTheme(choice) {
  if (!THEMES.includes(choice)) return;
  setPref('theme', choice);
  applyTheme(choice);
}

media?.addEventListener?.('change', () => { if (getPrefs().theme === 'system') applyTheme('system'); });

/** Density, text size and motion preferences are applied as data attributes on <html>. */
export function applyDisplayPrefs(p = getPrefs()) {
  const el = document.documentElement;
  el.dataset.density = p.density === 'compact' ? 'compact' : 'comfortable';
  el.dataset.textSize = p.textSize === 'large' ? 'large' : 'normal';
  el.dataset.reduceMotion = p.reduceMotion ? 'true' : 'false';
}
