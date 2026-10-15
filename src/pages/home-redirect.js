import { homePathFor } from '../app/guards.js';
import { navigate } from '../app/router.js';
import { h } from '../core/dom.js';

export function render() {
  queueMicrotask(() => navigate(homePathFor(), { replace: true }));
  return h('div');
}
