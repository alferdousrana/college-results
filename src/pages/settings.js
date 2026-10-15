/** Settings: a section list beside an editor panel (stacked on phones). */
import { h } from '../core/dom.js';
import { t } from '../i18n/index.js';
import { getState } from '../core/store.js';
import { SETTINGS_SECTIONS } from '../settings/sections.js';
import { loadingState, errorState } from '../ui/components/states.js';
import { navigate } from '../app/router.js';
import { friendlyError } from './_shared.js';

export const title = 'settings.title';
let disposeEditor = null;
export function dispose() { disposeEditor?.(); disposeEditor = null; }

export function render({ query }) {
  const { profile } = getState();
  const isAdmin = profile?.status === 'active' && profile.role === 'super_admin';
  const sections = SETTINGS_SECTIONS().filter((s) => !s.admin || isAdmin);
  const current = sections.find((s) => s.id === query.get('section')) ?? sections[0];
  const panel = h('div', { class: 'settings-panel card' }, loadingState());
  const nav = h('nav', { class: 'settings-nav', 'aria-label': t('settings.title') }, sections.map((s) => h('a', {
    href: `#/settings?section=${s.id}`, class: `settings-nav__item ${s.id === current.id ? 'is-active' : ''}`, 'aria-current': s.id === current.id ? 'page' : null,
    onclick: (e) => { e.preventDefault(); navigate(`/settings?section=${s.id}`); } }, h('strong', {}, s.label), h('span', { class: 'muted small' }, s.desc))));
  import(`../settings/editors/${current.id}.js`).then(async (m) => {
    panel.replaceChildren(h('h2', { class: 'card__title' }, current.label), h('p', { class: 'muted' }, current.desc));
    const body = h('div');
    panel.append(body);
    disposeEditor = await m.render(body, { query, isAdmin });
  }).catch((e) => panel.replaceChildren(errorState({ message: friendlyError(e) })));
  return h('section', { class: 'page' }, h('h1', {}, t('settings.title')), h('div', { class: 'settings-layout' }, nav, panel));
}
