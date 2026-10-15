import { h } from '../../core/dom.js';
import { on } from '../../core/events.js';
import { t } from '../../i18n/index.js';
import * as install from '../../pwa/install.js';

let visits = 0;
/** Shown once, only after the user has navigated at least once (engaged), never after a decision. */
export function initInstallBanner() {
  let el = null;
  const maybeShow = () => {
    if (el || visits < 2 || !install.shouldShowBanner()) return;
    const close = () => { el?.remove(); el = null; };
    el = h('aside', { class: 'banner', role: 'dialog', 'aria-labelledby': 'install-title' },
      h('p', { id: 'install-title', class: 'notice__title' }, t('install.title')), h('p', {}, t('install.body')),
      h('div', { class: 'banner__actions' },
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { install.dismissBanner(); close(); } }, t('install.dismiss')),
        h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => { close(); await install.promptInstall(); } }, t('install.accept'))));
    document.body.append(el);
  };
  window.addEventListener('hashchange', () => { visits++; maybeShow(); });
  visits = 1;
  on('install', () => { if (!install.shouldShowBanner()) { el?.remove(); el = null; } else maybeShow(); });
}
