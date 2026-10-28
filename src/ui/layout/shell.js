/**
 * Application frame: header + sidebar (≥960px) or bottom tab bar with a "More" sheet (phones).
 * Navigation items come from the route table filtered by the signed-in role.
 */
import { h, svgIcon } from '../../core/dom.js';
import { getState } from '../../core/store.js';
import { ROUTES } from '../../app/routes.js';
import { t, tt } from '../../i18n/index.js';
import { syncIndicator } from '../components/sync-indicator.js';
import { loadingState } from '../components/states.js';
import { notificationBell } from '../components/notification-bell.js';
import { demoBanner } from '../components/demo-banner.js';
import { AccountStatus } from '../../auth/roles.js';
import { openModal } from '../components/modal.js';

let frame = null;
let indicator = null; // created once so listeners are not duplicated on every render
let bell = null;

function navItems() {
  const { profile, authUser } = getState();
  const key = authUser && profile?.status === AccountStatus.ACTIVE ? profile.role : 'public';
  return ROUTES.filter((r) => r.nav && r.navFor?.includes(key));
}

function buildFrame() {
  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  const sidebar = h('nav', { class: 'sidebar', 'aria-label': 'Main' });
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' });
  const header = h('header', { class: 'topbar' });
  const banner = h('div', { class: 'banner-slot' });
  const root = h('div', { class: 'app' }, banner, header, h('div', { class: 'app__body' }, sidebar, main), tabbar);
  return { root, header, sidebar, tabbar, main, banner };
}

/** The most specific navigation route wins (so /admin/assignments does not also light up /admin). */
function isActive(route, path) {
  if (!path) return false;
  if (path.startsWith('/admin/sheet/') || path === '/admin/sheet') path = '/admin/sheets'; // sheet pages belong to "Result sheets"
  if (path === '/marks' || path === '/results') return false;
  const matches = navItems().filter((r) => path === r.path || path.startsWith(`${r.path}/`));
  const best = matches.sort((a, b) => b.path.length - a.path.length)[0];
  return best?.path === route.path;
}

function link(route, active, compact) {
  return h('a', { href: `#${route.path}`, class: `navlink ${active ? 'is-active' : ''}`, 'aria-current': active ? 'page' : null },
    svgIcon(route.icon), h('span', { class: compact ? 'navlink__label--compact' : 'navlink__label' }, t(route.nav)));
}

async function doSignOut() {
  const { listQueue } = await import('../../offline/offline-queue.js');
  const pending = (await listQueue(getState().authUser?.uid).catch(() => [])).length;
  if (pending) {
    const { confirmDialog } = await import('../components/dialog.js');
    const ok = await confirmDialog({ title: tt('Sign out with unsent marks?', 'না-পাঠানো নম্বর রেখে সাইন আউট করবেন?'),
      body: tt('{n} change(s) have not reached the server. They stay on this device and are sent after you sign in again.', '{n}টি পরিবর্তন সার্ভারে পৌঁছায়নি। এগুলো এই ডিভাইসে থাকবে এবং আবার সাইন ইন করলে পাঠানো হবে।', { n: pending }),
      confirmText: t('nav.signOut'), danger: true });
    if (!ok) return;
  }
  bell?.dispose(); bell = null;
  const { signOut } = await import('../../auth/auth-service.js');
  await signOut();
  location.hash = '#/lookup';
}

function moreSheet(items, activePath) {
  openModal({ title: t('nav.more'), size: 's', content: h('nav', { class: 'more-nav' }, items.map((r) => {
    const a = link(r, isActive(r, activePath), false);
    a.addEventListener('click', () => document.querySelector('dialog[open]')?.close());
    return a;
  })) });
}

export function renderShell({ route, content, loading = false }) {
  const app = document.getElementById('app');
  if (!frame || !app.contains(frame.root)) { frame = buildFrame(); app.replaceChildren(frame.root); }
  const { profile, authUser, backendKind } = getState();
  const items = navItems();
  const activePath = route?.path;
  const staff = authUser && profile?.status === AccountStatus.ACTIVE;
  if (staff && bell?.uid !== profile.id) { bell?.dispose(); bell = { ...notificationBell(profile), uid: profile.id }; }
  if (!staff && bell) { bell.dispose(); bell = null; }

  frame.banner.replaceChildren(...(backendKind === 'demo' ? [demoBanner()] : []));
  frame.header.replaceChildren(...[
    h('a', { class: 'brand', href: '#/' }, h('img', { src: `${import.meta.env.BASE_URL}icons/logo-192.png`, alt: '', width: 28, height: 28 }), h('span', {}, t('app.name'))),
    authUser ? (indicator ??= syncIndicator()) : null,
    staff ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': t('nav.search'), title: 'Ctrl+K',
      onclick: () => import('../components/search-palette.js').then((m) => m.openSearch()) }, svgIcon('search')) : null,
    staff ? bell.el : null,
    authUser
      ? h('div', { class: 'topbar__user' },
          h('span', { class: 'topbar__name' }, profile?.displayName ?? authUser.email),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: doSignOut }, svgIcon('logout'), h('span', { class: 'hide-sm' }, t('nav.signOut'))))
      : h('a', { class: 'btn btn--ghost btn--sm', href: '#/login' }, t('nav.signIn')),
  ].filter(Boolean));

  frame.sidebar.replaceChildren(...items.map((r) => link(r, isActive(r, activePath), false)));
  const primary = items.length > 5 ? items.slice(0, 4) : items;
  frame.tabbar.replaceChildren(...primary.map((r) => link(r, isActive(r, activePath), true)),
    ...(items.length > 5 ? [h('button', { class: 'navlink', type: 'button', onclick: () => moreSheet(items, activePath) }, svgIcon('menu'), h('span', { class: 'navlink__label--compact' }, t('nav.more')))] : []));
  frame.tabbar.hidden = items.length < 2;
  frame.root.classList.toggle('app--no-sidebar', items.length < 2);
  frame.main.replaceChildren(loading ? loadingState() : content ?? h('div'));
}
