import { setState } from '../core/store.js';
import { emit } from '../core/events.js';

/** navigator.onLine only means "has a network interface"; actual sync success is tracked by the queue. */
export function initNetworkStatus() {
  const update = () => { setState({ online: navigator.onLine }); emit('network', navigator.onLine); };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
