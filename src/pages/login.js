import { h } from '../core/dom.js';
import { t, tt } from '../i18n/index.js';
import { field } from '../ui/components/form.js';
import { getState } from '../core/store.js';
import { homePathFor } from '../app/guards.js';
import { navigate, parseHash } from '../app/router.js';
import { backendKind } from '../data/backend/index.js';
import { toast } from '../ui/components/toast.js';

export const title = 'auth.signIn';

export function render() {
  if (!getState().firebaseReady) { queueMicrotask(() => navigate('/setup', { replace: true })); return h('div'); }
  if (getState().authUser) { queueMicrotask(() => navigate(homePathFor(), { replace: true })); return h('div'); }
  if (backendKind() === 'demo') return demoLogin();

  const email = field({ label: t('auth.email'), name: 'email', type: 'email', required: true, autocomplete: 'username' });
  const password = field({ label: t('auth.password'), name: 'password', type: 'password', required: true, autocomplete: 'current-password' });
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('auth.signIn'));
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const forgot = h('button', { class: 'linklike', type: 'button', onclick: async () => {
    if (!email.input.value) { email.setError(tt('Enter your email first.', 'আগে ইমেইল লিখুন।')); return; }
    const { sendPasswordReset } = await import('../auth/auth-service.js');
    await sendPasswordReset(email.input.value).catch(() => {});
    toast(tt('If an account exists for this email, a reset link has been sent.', 'এই ইমেইলে অ্যাকাউন্ট থাকলে পাসওয়ার্ড বদলের লিংক পাঠানো হয়েছে।'), 'success');
  } }, tt('Forgot password?', 'পাসওয়ার্ড ভুলে গেছেন?'));

  const form = h('form', { class: 'card form', novalidate: true }, email.el, password.el, formError, submit, forgot);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;
    email.setError(email.input.validity.valid && email.input.value ? null : t('auth.email'));
    if (!email.input.value || !password.input.value) return;
    submit.disabled = true; submit.textContent = t('auth.signingIn');
    try {
      const { signIn } = await import('../auth/auth-service.js');
      await signIn(email.input.value, password.input.value);
      const next = parseHash().query.get('next');
      navigate(next && next.startsWith('/') ? next : '/', { replace: true });
    } catch (err) {
      const { authErrorKey } = await import('../auth/auth-service.js');
      formError.textContent = t(authErrorKey(err));
      formError.hidden = false;
    } finally { submit.disabled = false; submit.textContent = t('auth.signIn'); }
  });

  return h('section', { class: 'page page--narrow' }, h('h1', {}, t('auth.signIn')), form,
    h('p', { class: 'aside' }, h('a', { href: '#/register' }, t('auth.requestAccount'))),
    h('p', { class: 'aside' }, h('a', { href: '#/lookup' }, t('nav.lookup'))));
}

function demoLogin() {
  const list = h('ul', { class: 'persona-list' });
  import('../demo/seed.js').then(({ DEMO_PERSONAS }) => {
    list.replaceChildren(...DEMO_PERSONAS.map((p) => h('li', {}, h('button', { class: 'btn btn--ghost btn--block persona', type: 'button', onclick: async () => {
      const { demoSignIn } = await import('../auth/auth-service.js');
      await demoSignIn(p.id);
      navigate('/', { replace: true });
    } }, p.label))));
  });
  return h('section', { class: 'page page--narrow' }, h('h1', {}, tt('Choose a demo account', 'একটি ডেমো অ্যাকাউন্ট বাছুন')),
    h('p', { class: 'muted' }, tt('Demo mode has no passwords. Pick a role to explore.', 'ডেমো মোডে পাসওয়ার্ড নেই। দেখতে একটি ভূমিকা বাছুন।')), list,
    h('p', { class: 'aside' }, h('a', { href: '#/register' }, t('auth.requestAccount'))));
}
