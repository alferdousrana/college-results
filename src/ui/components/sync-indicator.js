import { h } from '../../core/dom.js';
import { on } from '../../core/events.js';
import { getState } from '../../core/store.js';
import { t } from '../../i18n/index.js';

/** Always-visible connection + outbox status so nobody assumes unsent marks are saved. */
export function syncIndicator() {
  const el = h('div', { class: 'sync', role: 'status', 'aria-live': 'polite' });
  let queue = { pending: 0, syncing: 0, conflicts: 0 };
  const render = () => {
    const online = getState().online;
    let tone = 'good', text = t('sync.synced');
    if (queue.conflicts) { tone = 'bad'; text = t('sync.conflict', { n: queue.conflicts }); }
    else if (!online) { tone = 'warn'; text = queue.pending ? `${t('sync.offline')} · ${t('sync.pending', { n: queue.pending })}` : t('sync.offline'); }
    else if (queue.syncing) { tone = 'info'; text = t('sync.syncing'); }
    else if (queue.pending) { tone = 'warn'; text = t('sync.pending', { n: queue.pending }); }
    el.className = `sync sync--${tone}`;
    el.replaceChildren(h('span', { class: 'sync__dot', 'aria-hidden': 'true' }), h('span', {}, text));
  };
  on('network', render);
  on('queue', (q) => { queue = q; render(); });
  on('prefs', render);
  render();
  return el;
}
