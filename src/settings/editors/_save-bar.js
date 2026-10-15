import { h } from '../../core/dom.js';
import { t, tt } from '../../i18n/index.js';
import { toast } from '../../ui/components/toast.js';
import { friendlyError } from '../../pages/_shared.js';

/** Sticky save bar with an unsaved-changes indicator; warns before leaving with unsaved edits. */
export function saveBar({ onSave, label = t('common.save') }) {
  let dirty = false;
  const flag = h('span', { class: 'unsaved', hidden: true }, t('common.unsaved'));
  const btn = h('button', { class: 'btn btn--primary', type: 'button' }, label);
  const before = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', before);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { const r = await onSave(); if (r !== false) { setDirty(false); toast(tt('Settings saved', 'সেটিংস সংরক্ষিত'), 'success'); } }
    catch (e) { toast(friendlyError(e), 'error'); }
    finally { btn.disabled = false; }
  });
  const setDirty = (v) => { dirty = v; flag.hidden = !v; };
  return { el: h('div', { class: 'save-bar' }, flag, btn), markDirty: () => setDirty(true), dispose: () => window.removeEventListener('beforeunload', before) };
}
