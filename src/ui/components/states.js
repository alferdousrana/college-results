import { h, svgIcon } from '../../core/dom.js';
import { t } from '../../i18n/index.js';

/** Loading, empty and error states share one shape so every screen handles all three. */
export function loadingState(label = t('common.loading')) {
  return h('div', { class: 'state state--loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', {}, label));
}

export function emptyState({ message, action = null }) {
  return h('div', { class: 'state state--empty' }, h('p', {}, message), action);
}

export function errorState({ message, onRetry = null }) {
  return h('div', { class: 'state state--error', role: 'alert' },
    svgIcon('alert'), h('p', {}, message),
    onRetry ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: onRetry }, t('common.retry')) : null);
}

/** Renders async content with automatic loading/error handling. */
export async function asyncSection(container, loader, render, { errorMessage } = {}) {
  container.replaceChildren(loadingState());
  try {
    const data = await loader();
    container.replaceChildren(render(data));
  } catch (err) {
    console.error(err);
    container.replaceChildren(errorState({ message: errorMessage ?? err.message, onRetry: () => asyncSection(container, loader, render, { errorMessage }) }));
  }
}
