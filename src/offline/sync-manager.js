/**
 * Background sync for the signed-in user's outbox: on app start, when the browser comes back
 * online, and every 30 s while there is something pending. (The Background Sync API is not used:
 * it is unavailable in Safari and Firefox.)
 */
import { on, emit } from '../core/events.js';
import { flushQueue, queueSummary, setQueueOwner } from './offline-queue.js';

let timer = null, offOnline = null, current = null;

export function startSync(actor) {
  stopSync();
  current = actor;
  setQueueOwner(actor.id);
  const tick = () => syncNow().catch(() => {});
  offOnline = on('network', (online) => { if (online) tick(); });
  timer = setInterval(async () => { if (navigator.onLine && (await queueSummary(actor.id)).pending) tick(); }, 30_000);
  tick();
}

export async function syncNow(opts = {}) {
  if (!current || !navigator.onLine) return null;
  const { createMarkTransport } = await import('../data/repositories/marks-repository.js');
  const report = await flushQueue(current.id, createMarkTransport(current), opts);
  emit('sync:done', report);
  return report;
}

export function stopSync() {
  clearInterval(timer); timer = null;
  offOnline?.(); offOnline = null;
  current = null;
  setQueueOwner(null);
}
