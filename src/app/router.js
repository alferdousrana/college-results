/**
 * Hash router (works on any static host and offline from the cached shell).
 * Pages export: render(ctx) → Node | Promise<Node>, optional title (i18n key), optional dispose().
 */
import { matchRoute } from './routes.js';
import { checkAccess } from './guards.js';
import { on } from '../core/events.js';
import { getState } from '../core/store.js';
import { renderShell } from '../ui/layout/shell.js';
import { t } from '../i18n/index.js';

let current = null;
let renderToken = 0;

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (replace) location.replace(target); else location.hash = target;
}

export async function renderRoute() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  const route = matchRoute(path);
  current?.dispose?.();
  current = null;

  if (!getState().authResolved) { renderShell({ route: null, content: null, loading: true }); return; }

  if (path === '/setup') { const m = await import('../pages/setup-required.js'); if (token === renderToken) mount(null, m, {}); return; }
  if (!route) { const m = await import('../pages/not-found.js'); if (token === renderToken) mount(null, m, {}); return; }

  const verdict = checkAccess(route);
  if (verdict === 'forbidden') { const m = await import('../pages/forbidden.js'); if (token === renderToken) mount(route, m, {}); return; }
  if (verdict) { navigate(verdict, { replace: true }); return; }

  renderShell({ route, content: null, loading: true });
  const mod = await route.load();
  if (token !== renderToken) return; // a newer navigation started
  mount(route, mod, { query, meta: route.meta ?? {} });
}

async function mount(route, mod, ctx) {
  current = mod;
  const content = await mod.render(ctx);
  renderShell({ route, content });
  document.title = `${mod.title ? `${t(mod.title)} — ` : ''}${t('app.name')}`;
  document.getElementById('main')?.focus({ preventScroll: true });
}

export function startRouter() {
  window.addEventListener('hashchange', renderRoute);
  // Re-render when auth/profile changes (approval, sign-out) or language changes.
  let last = '';
  on('state', (s) => {
    const sig = `${s.authResolved}|${s.authUser?.uid}|${s.profile?.status}|${s.profile?.role}`;
    if (sig !== last) { last = sig; renderRoute(); }
  });
  on('prefs', () => renderRoute());
  renderRoute();
}
