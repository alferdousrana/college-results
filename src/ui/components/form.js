import { h } from '../../core/dom.js';
import { tt } from '../../i18n/index.js';

let uid = 0;
/** Labelled input with hint and inline error, wired with aria-describedby. */
export function field({ label, name, type = 'text', value = '', hint = null, required = false, autocomplete = null, inputmode = null, attrs = {} }) {
  const id = `f-${name}-${++uid}`;
  const hintId = hint ? `${id}-hint` : null;
  const errId = `${id}-err`;
  const input = type === 'textarea'
    ? h('textarea', { id, name, class: 'input', required, rows: 3, 'aria-describedby': [hintId, errId].filter(Boolean).join(' '), ...attrs }, value ?? '')
    : h('input', { id, name, type, value: value ?? '', class: 'input', required, autocomplete, inputmode, 'aria-describedby': [hintId, errId].filter(Boolean).join(' '), ...attrs });
  if (type === 'checkbox') { input.className = 'checkbox'; input.checked = Boolean(value); }
  const error = h('p', { id: errId, class: 'field__error', hidden: true });
  // Password fields get a show/hide button (the input keeps its id, label and autocomplete).
  let control = input;
  if (type === 'password') {
    const toggle = h('button', { type: 'button', class: 'pw-toggle', 'aria-controls': id, 'aria-pressed': 'false', 'aria-label': tt('Show password', 'পাসওয়ার্ড দেখান') }, tt('Show', 'দেখান'));
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? tt('Hide', 'লুকান') : tt('Show', 'দেখান');
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? tt('Hide password', 'পাসওয়ার্ড লুকান') : tt('Show password', 'পাসওয়ার্ড দেখান'));
      input.focus();
    });
    control = h('div', { class: 'pw-wrap' }, input, toggle);
  }
  const wrap = type === 'checkbox'
    ? h('div', { class: 'field field--check' }, input, h('label', { for: id }, label), hint ? h('p', { id: hintId, class: 'field__hint' }, hint) : null, error)
    : h('div', { class: 'field' },
      h('label', { class: 'field__label', for: id }, label, required ? h('span', { class: 'field__req', 'aria-hidden': 'true' }, ' *') : null),
      control, hint ? h('p', { id: hintId, class: 'field__hint' }, hint) : null, error);
  return {
    el: wrap, input,
    get value() { return type === 'checkbox' ? input.checked : input.value.trim(); },
    setError(msg) { error.hidden = !msg; error.textContent = msg ?? ''; input.setAttribute('aria-invalid', msg ? 'true' : 'false'); },
  };
}

export function selectField({ label, name, options, value = '', required = false, hint = null, multiple = false }) {
  const id = `f-${name}-${++uid}`;
  const values = new Set([].concat(value ?? []));
  const select = h('select', { id, name, class: 'input', required, multiple, size: multiple ? Math.min(6, options.length) : null },
    options.map((o) => h('option', { value: o.value, selected: values.has(o.value), disabled: o.disabled }, o.label)));
  const error = h('p', { class: 'field__error', hidden: true });
  return {
    el: h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label, required ? h('span', { class: 'field__req', 'aria-hidden': 'true' }, ' *') : null), select,
      hint ? h('p', { class: 'field__hint' }, hint) : null, error),
    input: select,
    get value() { return multiple ? [...select.selectedOptions].map((o) => o.value) : select.value; },
    setError(msg) { error.hidden = !msg; error.textContent = msg ?? ''; select.setAttribute('aria-invalid', msg ? 'true' : 'false'); },
  };
}

/** Group of checkboxes (e.g. applicable classes). */
export function checkGroup({ label, name, options, values = [] }) {
  const set = new Set(values);
  const boxes = options.map((o) => {
    const id = `f-${name}-${++uid}`;
    const cb = h('input', { type: 'checkbox', id, value: o.value, class: 'checkbox', checked: set.has(o.value) });
    return { cb, el: h('label', { class: 'check-chip', for: id }, cb, h('span', {}, o.label)) };
  });
  return {
    el: h('fieldset', { class: 'field fieldset' }, h('legend', { class: 'field__label' }, label), h('div', { class: 'check-row' }, boxes.map((b) => b.el))),
    get value() { return boxes.filter((b) => b.cb.checked).map((b) => b.cb.value); },
  };
}

/** Tracks unsaved changes and warns before leaving the page. */
export function trackUnsaved(form, indicator) {
  let dirty = false;
  const set = (v) => { dirty = v; if (indicator) indicator.hidden = !v; };
  form.addEventListener('input', () => set(true));
  form.addEventListener('change', () => set(true));
  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  return { isDirty: () => dirty, reset: () => set(false), dispose: () => window.removeEventListener('beforeunload', beforeUnload) };
}
