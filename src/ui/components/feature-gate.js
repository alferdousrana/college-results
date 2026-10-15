import { h } from '../../core/dom.js';
import { isEnabled, upgradeMessage, flagInfo } from '../../features/flags.js';
import { currentLang } from '../../i18n/index.js';

/** Renders `content()` when the optional feature is on; otherwise an honest notice (never a dead button). */
export function featureGate(featureId, content) {
  if (isEnabled(featureId)) return content();
  const info = flagInfo(featureId);
  return h('div', { class: 'notice notice--locked', role: 'note' },
    h('p', { class: 'notice__title' }, info.label ?? featureId),
    h('p', {}, upgradeMessage(featureId, currentLang())),
    info.upgradeUrl ? h('a', { class: 'btn btn--ghost', href: info.upgradeUrl, target: '_blank', rel: 'noopener' }, 'Learn more') : null);
}
