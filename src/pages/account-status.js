import { h } from '../core/dom.js';
import { t } from '../i18n/index.js';
import { getState } from '../core/store.js';
import { homePathFor } from '../app/guards.js';
import { navigate } from '../app/router.js';

export const title = 'auth.pendingTitle';

export function render() {
  const p = getState().profile;
  if (p?.status === 'active') { queueMicrotask(() => navigate(homePathFor(), { replace: true })); return h('div'); }
  const key = p?.status === 'rejected' ? 'auth.rejectedTitle' : p?.status === 'disabled' ? 'auth.disabledTitle' : 'auth.pendingTitle';
  return h('section', { class: 'page page--narrow' },
    h('h1', {}, t(key)),
    h('p', { class: 'lede' }, key === 'auth.pendingTitle' ? t('auth.pendingBody') : t('auth.contactAdmin')));
}
