import { emit } from '../core/events.js';

/** Registers the service worker in production builds only (avoids stale caches during development). */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return null;
  try {
    // BASE_URL is '/' on Vercel and '/<repo>/' on GitHub Pages.
    const base = import.meta.env.BASE_URL;
    const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
    const announce = (worker) => worker && emit('sw:update', worker);
    if (reg.waiting) announce(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w);
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloaded) { reloaded = true; window.location.reload(); }
    });
    return reg;
  } catch (e) {
    console.warn('[sw] registration failed', e);
    return null;
  }
}

export function activateUpdate(worker) { worker.postMessage({ type: 'SKIP_WAITING' }); }

/** Asks the service worker to download every bundled print font for offline printing. */
export function cachePrintFonts() {
  return new Promise((resolve) => {
    const ctl = navigator.serviceWorker?.controller;
    if (!ctl) { resolve({ ok: false, reason: 'no-sw' }); return; }
    const onMsg = (e) => {
      if (e.data?.type === 'PRINT_FONTS_CACHED') { navigator.serviceWorker.removeEventListener('message', onMsg); resolve({ ok: true, count: e.data.count }); }
      if (e.data?.type === 'PRINT_FONTS_FAILED') { navigator.serviceWorker.removeEventListener('message', onMsg); resolve({ ok: false, reason: 'failed' }); }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    ctl.postMessage({ type: 'CACHE_PRINT_FONTS' });
  });
}
