import { h } from '../../core/dom.js';
import { on } from '../../core/events.js';
import { t } from '../../i18n/index.js';
import { activateUpdate } from '../../pwa/sw-register.js';

/** Offers the new version instead of silently reloading mid mark-entry. */
export function initUpdateBanner() {
  on('sw:update', (worker) => {
    if (document.querySelector('.banner--update')) return;
    const el = h('aside', { class: 'banner banner--update', role: 'status' }, h('p', {}, t('update.available')),
      h('div', { class: 'banner__actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => el.remove() }, t('common.close')),
        h('button', { class: 'btn btn--primary', type: 'button', onclick: () => activateUpdate(worker) }, t('update.reload'))));
    document.body.append(el);
  });
}
