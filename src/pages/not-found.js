import { h } from '../core/dom.js';
import { t } from '../i18n/index.js';
export const title = 'common.notFound';
export function render() {
  return h('section', { class: 'page page--narrow' }, h('h1', {}, t('common.notFound')), h('a', { class: 'btn btn--primary', href: '#/' }, t('common.goHome')));
}
