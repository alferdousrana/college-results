import { h } from '../../core/dom.js';
import { t } from '../../i18n/index.js';
import { LIFECYCLE_ORDER } from '../../domain/exam-lifecycle.js';

const TONE = {
  draft: 'neutral', ready_for_mark_entry: 'info', mark_entry_in_progress: 'info',
  submitted: 'warn', under_review: 'warn', published: 'good', archived: 'neutral',
};

export function examStateBadge(state) {
  return h('span', { class: `badge badge--${TONE[state] ?? 'neutral'}` }, t(`exam.state.${state}`));
}

/** The lifecycle strip: shows where a result sheet is in its journey. */
export function lifecycleStrip(state) {
  const idx = LIFECYCLE_ORDER.indexOf(state);
  return h('ol', { class: 'lifecycle', 'aria-label': 'Result sheet progress' },
    (state === 'archived' ? LIFECYCLE_ORDER : LIFECYCLE_ORDER.slice(0, 6)).map((s, i) => h('li', {
      class: `lifecycle__step ${i < idx ? 'is-done' : ''} ${i === idx ? 'is-current' : ''}`,
      'aria-current': i === idx ? 'step' : null,
    }, h('span', { class: 'lifecycle__label' }, t(`exam.state.${s}`)))));
}
