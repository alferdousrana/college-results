/**
 * Runtime feature flags = build defaults overlaid with featureFlags/global (written only by the
 * GitHub Actions job with the Admin SDK; rules deny all client writes).
 * Flags only HIDE optional features. Firestore rules still enforce every permission.
 */
import { BUILD_DEFAULTS, FEATURE_DEFINITIONS, DEFAULT_UPGRADE_MESSAGE, CRITICAL_CAPABILITIES } from './registry.js';
import { setState } from '../core/store.js';
import { emit } from '../core/events.js';
import { backendKind } from '../data/backend/index.js';

let current = mergeFlags(BUILD_DEFAULTS, null);
let unsub = null;

export function mergeFlags(defaults, remote) {
  const out = { ...defaults, features: { ...defaults.features } };
  if (!remote || typeof remote !== 'object') return out;
  if (typeof remote.upgradeUrl === 'string' && /^https:\/\//.test(remote.upgradeUrl)) out.upgradeUrl = remote.upgradeUrl;
  if (remote.updatedAt) out.updatedAt = remote.updatedAt;
  for (const [id, value] of Object.entries(remote.features ?? {})) {
    if (!(id in defaults.features) || CRITICAL_CAPABILITIES.includes(id)) continue;
    out.features[id] = {
      enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.features[id].enabled,
      message: value.message && typeof value.message === 'object' ? value.message : undefined,
    };
  }
  return out;
}

export function isEnabled(id) {
  if (CRITICAL_CAPABILITIES.includes(id)) return true;
  return current.features[id]?.enabled ?? false;
}

export function upgradeMessage(id, lang = 'en') {
  const m = current.features[id]?.message ?? DEFAULT_UPGRADE_MESSAGE;
  return m?.[lang] || m?.en || '';
}

export function flagInfo(id) {
  return { id, ...FEATURE_DEFINITIONS[id], ...current.features[id], upgradeUrl: current.upgradeUrl };
}

export function getFlags() { return current; }

/** Test helper. */
export function _setFlagsForTests(remote) { current = mergeFlags(BUILD_DEFAULTS, remote); }

export async function initFlags() {
  setState({ flags: current });
  if (backendKind() !== 'firestore') return; // demo mode uses the committed defaults
  try {
    const { getBackend } = await import('../data/backend/index.js');
    const b = await getBackend();
    let first = true;
    unsub?.();
    unsub = b.listenDoc('featureFlags/global', (doc) => {
      const before = JSON.stringify(current.features);
      current = mergeFlags(BUILD_DEFAULTS, doc);
      setState({ flags: current });
      emit('flags', current);
      if (!first && before !== JSON.stringify(current.features)) {
        import('../ui/components/toast.js').then(({ toast }) => toast('Feature availability changed.', 'info'));
      }
      first = false;
    }, () => { /* offline or missing: keep safe defaults */ });
  } catch (e) { console.warn('[flags] using build defaults', e); }
}
