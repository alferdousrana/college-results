import { h } from '../../core/dom.js';
import { t } from '../../i18n/index.js';

/**
 * Accessible confirmation dialog built on <dialog>. Resolves true/false.
 * Destructive actions pass { danger: true, confirmText } so the button reads as what happens.
 * `requireText` makes the user type a word (e.g. "PUBLISH") for irreversible actions.
 */
export function confirmDialog({ title, body, confirmText = t('common.confirm'), danger = false, requireText = null }) {
  return new Promise((resolve) => {
    const input = requireText ? h('input', { class: 'input', 'aria-label': `Type ${requireText} to confirm`, autocomplete: 'off' }) : null;
    const ok = h('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button', disabled: Boolean(requireText) }, confirmText);
    const cancel = h('button', { class: 'btn btn--ghost', type: 'button' }, t('common.cancel'));
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' },
      h('h2', { id: 'dlg-title', class: 'dialog__title' }, title),
      body ? h('p', { class: 'dialog__body' }, body) : null,
      input ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, `Type ${requireText} to continue`), input) : null,
      h('div', { class: 'dialog__actions' }, cancel, ok));
    input?.addEventListener('input', () => { ok.disabled = input.value.trim() !== requireText; });
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    ok.addEventListener('click', () => done(true));
    cancel.addEventListener('click', () => done(false));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    document.body.append(dlg);
    dlg.showModal();
    (input ?? cancel).focus();
  });
}
