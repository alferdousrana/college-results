import { h } from '../../core/dom.js';
import { tt, currentLang } from '../../i18n/index.js';
import { getFlags, upgradeMessage } from '../../features/flags.js';
import { FEATURE_DEFINITIONS } from '../../features/registry.js';
import { fmtDate } from '../../ui/format.js';
import { on } from '../../core/events.js';

export function render(el) {
  const paint = () => {
    const flags = getFlags();
    el.replaceChildren(
      h('p', {}, tt('Optional features are switched on or off by the app developer. You can see their status here but cannot change them. Turning a feature off never deletes data, and it never weakens security — permissions are always checked by the database.',
        'ঐচ্ছিক সুবিধা অ্যাপ ডেভেলপার চালু বা বন্ধ করেন। এখানে অবস্থা দেখা যাবে, বদলানো যাবে না। কোনো সুবিধা বন্ধ করলে ডেটা মোছে না এবং নিরাপত্তা দুর্বল হয় না — অনুমতি সবসময় ডেটাবেস যাচাই করে।')),
      h('p', { class: 'muted small' }, tt('Last updated: {d}', 'সর্বশেষ হালনাগাদ: {d}', { d: fmtDate(flags.updatedAt, { time: true }) })),
      h('ul', { class: 'feature-list' }, Object.entries(FEATURE_DEFINITIONS).map(([id, def]) => {
        const on1 = flags.features[id]?.enabled;
        return h('li', { class: on1 ? 'is-on' : 'is-off' }, h('span', { class: `badge badge--${on1 ? 'good' : 'neutral'}` }, on1 ? tt('On', 'চালু') : tt('Locked', 'বন্ধ')), ' ', h('strong', {}, def.label),
          !on1 ? h('p', { class: 'muted small' }, upgradeMessage(id, currentLang())) : null,
          !on1 && flags.upgradeUrl ? h('a', { href: flags.upgradeUrl, target: '_blank', rel: 'noopener' }, tt('Learn more', 'বিস্তারিত')) : null);
      })));
  };
  paint();
  return on('flags', paint);
}
