import { h } from '../core/dom.js';
import { t, tt } from '../i18n/index.js';
export const title = 'setup.title';
export function render() {
  return h('section', { class: 'page page--narrow' },
    h('h1', {}, t('setup.title')), h('p', { class: 'lede' }, t('setup.body')),
    h('div', { class: 'row-actions' },
      h('a', { class: 'btn btn--primary', href: '#/demo' }, tt('Try demo mode', 'ডেমো মোড দেখুন')),
      h('a', { class: 'btn btn--ghost', href: '#/settings' }, t('nav.settings'))));
}
