import { h } from '../core/dom.js';
import { t } from '../i18n/index.js';
import { field } from '../ui/components/form.js';
import { getState } from '../core/store.js';
import { navigate } from '../app/router.js';
import { toast } from '../ui/components/toast.js';
import { backendKind } from '../data/backend/index.js';

export const title = 'auth.requestAccount';

export function render() {
  if (!getState().firebaseReady) { queueMicrotask(() => navigate('/setup', { replace: true })); return h('div'); }
  const name = field({ label: t('auth.fullName'), name: 'displayName', required: true, autocomplete: 'name' });
  const email = field({ label: t('auth.email'), name: 'email', type: 'email', required: true, autocomplete: 'email' });
  const phone = field({ label: t('auth.phone'), name: 'phone', type: 'tel', autocomplete: 'tel', inputmode: 'tel' });
  const password = field({ label: t('auth.password'), name: 'password', type: 'password', required: true, autocomplete: 'new-password', hint: t('auth.passwordHint'), attrs: { minlength: 8 } });
  const note = field({ label: t('auth.note'), name: 'requestNote' });
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('auth.sendRequest'));
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const form = h('form', { class: 'card form', novalidate: true }, name.el, email.el, phone.el, password.el, note.el, formError, submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let ok = true;
    name.setError(name.input.value.trim() ? null : t('auth.fullName')); ok &&= Boolean(name.input.value.trim());
    email.setError(email.input.validity.valid && email.input.value ? null : t('auth.email')); ok &&= email.input.validity.valid && Boolean(email.input.value);
    const demo = backendKind() === 'demo';
    password.setError(demo || password.input.value.length >= 8 ? null : t('auth.passwordHint')); ok &&= demo || password.input.value.length >= 8;
    if (!ok) return;
    submit.disabled = true;
    try {
      const { requestTeacherAccount } = await import('../auth/auth-service.js');
      await requestTeacherAccount({ displayName: name.input.value, email: email.input.value, password: password.input.value, phone: phone.input.value, requestNote: note.input.value });
      toast(t('auth.pendingTitle'), 'success');
      navigate('/pending', { replace: true });
    } catch (err) {
      formError.textContent = err?.code === 'auth/email-already-in-use' ? t('auth.haveAccount') : t('auth.errorGeneric');
      formError.hidden = false;
    } finally { submit.disabled = false; }
  });

  return h('section', { class: 'page page--narrow' }, h('h1', {}, t('auth.requestAccount')), form,
    h('p', { class: 'aside' }, h('a', { href: '#/login' }, t('auth.haveAccount'))));
}
