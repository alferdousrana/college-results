import { h } from '../../core/dom.js';
import { t, tt, LANGUAGES, currentLang, setLanguage } from '../../i18n/index.js';
import { THEMES, setTheme, applyDisplayPrefs } from '../../theme/theme.js';
import { getPrefs, setPref } from '../../core/prefs.js';
import { getState } from '../../core/store.js';
import { on } from '../../core/events.js';
import { isEnabled } from '../../features/flags.js';
import * as install from '../../pwa/install.js';
import { backendKind } from '../../data/backend/index.js';

function segmented(name, options, value, onChange) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': name }, options.map(([v, label]) => h('label', { class: 'segmented__opt' },
    h('input', { type: 'radio', name, value: v, checked: value === v, onchange: () => onChange(v) }), h('span', {}, label))));
}

async function mirror() {
  const { authUser, profile } = getState();
  if (!authUser || profile?.status !== 'active') return;
  const { saveOwnPrefs } = await import('../../data/repositories/users-repository.js');
  const p = getPrefs();
  saveOwnPrefs(authUser.uid, { lang: p.lang, theme: p.theme, density: p.density, textSize: p.textSize, reduceMotion: p.reduceMotion }).catch(() => {});
}

export function render(el) {
  const p = getPrefs();
  const lang = h('select', { class: 'input', id: 'pref-lang', onchange: (e) => { setLanguage(e.target.value); mirror(); } },
    LANGUAGES.filter((l) => l.code === 'en' || isEnabled('bangla_interface')).map((l) => h('option', { value: l.code, selected: l.code === currentLang() }, l.label)));
  const themes = THEMES.filter((x) => x === 'light' || isEnabled('dark_theme')).map((x) => [x, t(`settings.theme.${x}`)]);
  const installBox = h('div');
  const paintInstall = () => {
    const s = install.state();
    if (s.installed) installBox.replaceChildren(h('p', {}, t('settings.installed')));
    else if (s.canInstall) installBox.replaceChildren(h('button', { class: 'btn btn--primary', type: 'button', onclick: () => install.promptInstall() }, t('settings.installButton')));
    else installBox.replaceChildren(h('p', { class: 'muted' }, t('settings.installUnavailable')));
  };
  const off = on('install', paintInstall);
  paintInstall();
  const offline = h('p', { class: 'muted' });
  if (backendKind() === 'firestore') import('../../core/firebase.js').then(({ getFirebase }) => { offline.textContent = t(`settings.cacheMode.${getFirebase().persistence}`); }).catch(() => {});
  else offline.textContent = backendKind() === 'demo' ? tt('Demo mode keeps data in this browser.', 'ডেমো মোডে ডেটা এই ব্রাউজারে থাকে।') : '';
  el.append(
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pref-lang' }, t('settings.language')), lang),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, t('settings.theme')), segmented('theme', themes, p.theme, (v) => { setTheme(v); mirror(); })),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, tt('Table density', 'টেবিলের ঘনত্ব')), segmented('density', [['comfortable', tt('Comfortable', 'আরামদায়ক')], ['compact', tt('Compact', 'ঘন')]], p.density, (v) => { setPref('density', v); applyDisplayPrefs(); mirror(); })),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, tt('Text size', 'লেখার আকার')), segmented('textSize', [['normal', tt('Normal', 'সাধারণ')], ['large', tt('Large', 'বড়')]], p.textSize, (v) => { setPref('textSize', v); applyDisplayPrefs(); mirror(); })),
    h('div', { class: 'field field--check' }, h('input', { type: 'checkbox', class: 'checkbox', id: 'pref-motion', checked: p.reduceMotion, onchange: (e) => { setPref('reduceMotion', e.target.checked); applyDisplayPrefs(); mirror(); } }), h('label', { for: 'pref-motion' }, tt('Reduce animations', 'অ্যানিমেশন কমান'))),
    h('h3', { class: 'form-section' }, t('settings.install')), h('p', {}, t('settings.installBody')), installBox,
    h('h3', { class: 'form-section' }, t('settings.offline')), h('p', {}, t('settings.offlineBody')), offline,
    h('div', { class: 'row-actions' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async (e) => {
      e.target.disabled = true;
      const { cachePrintFonts } = await import('../../pwa/sw-register.js');
      const r = await cachePrintFonts();
      const { toast } = await import('../../ui/components/toast.js');
      toast(r.ok ? tt('{n} print font files saved for offline printing.', 'অফলাইনে প্রিন্টের জন্য {n}টি ফন্ট ফাইল রাখা হয়েছে।', { n: r.count }) : tt('Fonts could not be saved now. Install the app or reload once while online, then try again.', 'এখন ফন্ট রাখা যায়নি। অনলাইনে থাকা অবস্থায় অ্যাপ ইনস্টল বা একবার রিলোড করে আবার চেষ্টা করুন।'), r.ok ? 'success' : 'error');
      e.target.disabled = false;
    } }, tt('Keep all print fonts available offline', 'সব প্রিন্ট ফন্ট অফলাইনে রাখুন'))),
    h('p', { class: 'muted small' }, tt('Signing in for the first time, approving teachers, sharing, publishing and changing settings need an internet connection.', 'প্রথমবার সাইন ইন, শিক্ষক অনুমোদন, শেয়ার, প্রকাশ ও সেটিংস বদলাতে ইন্টারনেট লাগে।')));
  return off;
}
