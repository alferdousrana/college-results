import { h } from '../../core/dom.js';
import { t } from '../../i18n/index.js';

/**
 * Generic modal built on <dialog>. actions: [{ label, kind, onClick }] — onClick may be async;
 * return false to keep the dialog open (e.g. validation failed). Escape/cancel closes.
 */
export function openModal({ title, content, actions = [], size = 'm', onClose = null }) {
  const footer = h('div', { class: 'dialog__actions' });
  const body = h('div', { class: 'dialog__content' }, content);
  const dlg = h('dialog', { class: `dialog dialog--${size}`, 'aria-labelledby': 'modal-title' },
    h('div', { class: 'dialog__head' }, h('h2', { id: 'modal-title', class: 'dialog__title' }, title),
      h('button', { class: 'dialog__x', type: 'button', 'aria-label': t('common.close'), onclick: () => close() }, '×')),
    body, footer);
  const close = () => { if (!dlg.open) return; dlg.close(); dlg.remove(); onClose?.(); };
  const all = actions.length ? actions : [{ label: t('common.close'), kind: 'ghost', onClick: () => true }];
  for (const a of all) {
    const btn = h('button', { class: `btn btn--${a.kind ?? 'ghost'}`, type: 'button' }, a.label);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { const r = await a.onClick?.(); if (r !== false) close(); }
      finally { btn.disabled = false; }
    });
    footer.append(btn);
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('input, select, textarea, button.btn--primary')?.focus();
  return { close, body, dialog: dlg };
}

/** Text prompt (e.g. correction reason). Resolves the trimmed text or null. */
export function promptText({ title, label, body = null, confirmText, required = true, multiline = true }) {
  return new Promise((resolve) => {
    const input = h(multiline ? 'textarea' : 'input', { class: 'input', rows: 3, 'aria-label': label });
    const err = h('p', { class: 'field__error', hidden: true }, label);
    let value = null;
    openModal({
      title,
      content: h('div', {}, body ? h('p', {}, body) : null, h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), input, err)),
      actions: [
        { label: t('common.cancel'), onClick: () => true },
        { label: confirmText, kind: 'primary', onClick: () => { const v = input.value.trim(); if (required && !v) { err.hidden = false; return false; } value = v; return true; } },
      ],
      onClose: () => resolve(value),
    });
  });
}
