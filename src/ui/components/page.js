import { h, svgIcon } from '../../core/dom.js';

/** Page header: title, optional subtitle, back link and right-aligned actions. */
export function pageHeader({ title, subtitle = null, back = null, actions = [] }) {
  return h('header', { class: 'page-head' },
    h('div', { class: 'page-head__text' },
      back ? h('a', { class: 'page-head__back', href: back.href }, '‹ ', back.label) : null,
      h('h1', {}, title),
      subtitle ? h('p', { class: 'muted page-head__sub' }, subtitle) : null),
    actions.length ? h('div', { class: 'page-head__actions' }, actions) : null);
}

export function button(label, { kind = 'ghost', icon = null, onClick = null, type = 'button', disabled = false, size = null, attrs = {} } = {}) {
  return h('button', { class: `btn btn--${kind}${size ? ` btn--${size}` : ''}`, type, disabled, onclick: onClick, ...attrs },
    icon ? svgIcon(icon) : null, h('span', {}, label));
}

export function linkButton(label, href, { kind = 'ghost', icon = null } = {}) {
  return h('a', { class: `btn btn--${kind}`, href }, icon ? svgIcon(icon) : null, h('span', {}, label));
}

/** Simple tab strip; renders the active panel into `panel`. */
export function tabs(items, { active = items[0]?.id, onChange } = {}) {
  const panel = h('div', { class: 'tabs__panel', role: 'tabpanel' });
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  const select = (id) => {
    active = id;
    bar.querySelectorAll('[role=tab]').forEach((b) => { const on = b.dataset.id === id; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    const item = items.find((i) => i.id === id);
    panel.replaceChildren();
    Promise.resolve(item.render(panel)).then((node) => { if (node) panel.replaceChildren(node); });
    onChange?.(id);
  };
  items.forEach((i) => bar.append(h('button', { role: 'tab', type: 'button', class: 'tabs__tab', dataset: { id: i.id }, onclick: () => select(i.id),
    onkeydown: (e) => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const idx = items.findIndex((x) => x.id === active) + (e.key === 'ArrowRight' ? 1 : -1);
      const next = items[(idx + items.length) % items.length]; select(next.id); bar.querySelector(`[data-id="${next.id}"]`).focus();
    } }, i.label, i.badge != null ? h('span', { class: 'tabs__badge' }, i.badge) : null)));
  queueMicrotask(() => select(active));
  return { el: h('div', { class: 'tabs-wrap' }, bar, panel), select };
}

export function keyValue(pairs) {
  return h('dl', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v ?? '—')]));
}
