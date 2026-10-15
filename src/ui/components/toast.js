import { h } from '../../core/dom.js';

/** Non-blocking status message. type: 'info' | 'success' | 'error'. Errors stay until dismissed. */
export function toast(message, type = 'info', { timeout = 4000 } = {}) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const close = h('button', { class: 'toast__close', type: 'button', 'aria-label': 'Dismiss' }, '×');
  const el = h('div', { class: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status' }, h('span', {}, message), close);
  close.addEventListener('click', () => el.remove());
  region.append(el);
  if (type !== 'error') setTimeout(() => el.remove(), timeout);
}
