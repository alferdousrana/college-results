/**
 * The public page students and guardians see: heading, banner, notice line and the college
 * information block (founder, year founded, short history, principal, student and teacher numbers).
 * Stored in institution/public (landing + about + assets.heroImage / assets.principalPhoto).
 * Notices with text and PDF are managed in Settings → Notices.
 */
import { h } from '../../core/dom.js';
import { tt, L } from '../../i18n/index.js';
import { field, selectField } from '../../ui/components/form.js';
import { imageInput } from '../../ui/components/image-input.js';
import { loadingState } from '../../ui/components/states.js';
import { actor, friendlyError } from '../../pages/_shared.js';
import { toast } from '../../ui/components/toast.js';
import { saveBar } from './_save-bar.js';

export async function render(el) {
  el.append(loadingState());
  const repo = await import('../../data/repositories/settings-repository.js');
  const inst = await repo.getInstitution({ fresh: true });
  const land = inst.landing ?? {};
  const about = inst.about ?? {};
  const assets = { ...(inst.assets ?? {}) };
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
  const bar = saveBar({ onSave: async () => {
    await repo.saveInstitution(actor(), { ...inst, assets,
      landing: {
        title: { en: f.tEn.value, bn: f.tBn.value }, description: { en: f.dEn.value, bn: f.dBn.value }, notice: { en: f.nEn.value, bn: f.nBn.value },
        showLogo: f.logo.value },
      about: {
        founder: { en: a.fEn.value, bn: a.fBn.value }, established: a.est.value,
        bio: { en: a.bEn.value, bn: a.bBn.value },
        principalName: { en: a.pEn.value, bn: a.pBn.value }, principalTitle: { en: a.ptEn.value, bn: a.ptBn.value },
        countMode: a.mode.value, studentCount: num(a.students.value), teacherCount: num(a.teachers.value),
      } });
  } });
  const f = {
    tEn: field({ label: tt('Heading (English)', 'শিরোনাম (ইংরেজি)'), name: 'ltEn', value: land.title?.en ?? '', hint: tt('Leave empty to show the institution name.', 'খালি রাখলে প্রতিষ্ঠানের নাম দেখাবে।') }),
    tBn: field({ label: tt('Heading (Bangla)', 'শিরোনাম (বাংলা)'), name: 'ltBn', value: land.title?.bn ?? '' }),
    dEn: field({ label: tt('Description (English)', 'বিবরণ (ইংরেজি)'), name: 'ldEn', type: 'textarea', value: land.description?.en ?? '', hint: tt('One or two lines under the college name.', 'কলেজের নামের নিচে এক-দুই লাইন।') }),
    dBn: field({ label: tt('Description (Bangla)', 'বিবরণ (বাংলা)'), name: 'ldBn', type: 'textarea', value: land.description?.bn ?? '' }),
    nEn: field({ label: tt('Short announcement (English, optional)', 'ছোট ঘোষণা (ইংরেজি, ঐচ্ছিক)'), name: 'lnEn', value: land.notice?.en ?? '', hint: tt('One line shown in the banner, e.g. Annual examination results are published. Full notices go in Settings → Notices.', 'ব্যানারে এক লাইনে দেখাবে, যেমন: বার্ষিক পরীক্ষার ফলাফল প্রকাশিত হয়েছে। পূর্ণ নোটিশ দিন সেটিংস → নোটিশ-এ।') }),
    nBn: field({ label: tt('Short announcement (Bangla, optional)', 'ছোট ঘোষণা (বাংলা, ঐচ্ছিক)'), name: 'lnBn', value: land.notice?.bn ?? '' }),
    logo: field({ label: tt('Show the logo', 'লোগো দেখান'), name: 'llogo', type: 'checkbox', value: land.showLogo !== false }),
  };
  const sigName = inst.signatories?.principal?.name ?? {};
  const a = {
    fEn: field({ label: tt('Founder (English)', 'প্রতিষ্ঠাতা (ইংরেজি)'), name: 'afEn', value: about.founder?.en ?? '' }),
    fBn: field({ label: tt('Founder (Bangla)', 'প্রতিষ্ঠাতা (বাংলা)'), name: 'afBn', value: about.founder?.bn ?? '' }),
    est: field({ label: tt('Founded in', 'প্রতিষ্ঠাকাল'), name: 'aest', value: about.established ?? '', hint: tt('A year (e.g. 1995) or a date.', 'সাল (যেমন ১৯৯৫) বা তারিখ।') }),
    bEn: field({ label: tt('About the college (English)', 'কলেজ পরিচিতি (ইংরেজি)'), name: 'abEn', type: 'textarea', value: about.bio?.en ?? '', hint: tt('A short history: a few sentences. Leave an empty line between paragraphs.', 'সংক্ষিপ্ত ইতিহাস, কয়েকটি বাক্য। অনুচ্ছেদের মাঝে একটি খালি লাইন রাখুন।') }),
    bBn: field({ label: tt('About the college (Bangla)', 'কলেজ পরিচিতি (বাংলা)'), name: 'abBn', type: 'textarea', value: about.bio?.bn ?? '' }),
    pEn: field({ label: tt('Principal’s name (English)', 'অধ্যক্ষের নাম (ইংরেজি)'), name: 'apEn', value: about.principalName?.en ?? '', hint: L(sigName) ? tt('Empty: the name from Institution → signatures is used ({n}).', 'খালি থাকলে প্রতিষ্ঠান → স্বাক্ষর অংশের নাম দেখাবে ({n})।', { n: L(sigName) }) : null }),
    pBn: field({ label: tt('Principal’s name (Bangla)', 'অধ্যক্ষের নাম (বাংলা)'), name: 'apBn', value: about.principalName?.bn ?? '' }),
    ptEn: field({ label: tt('Title under the name (English)', 'নামের নিচের পদবি (ইংরেজি)'), name: 'aptEn', value: about.principalTitle?.en ?? '', hint: tt('Empty: “Principal”. Use e.g. “Acting Principal” when needed.', 'খালি থাকলে “অধ্যক্ষ”। প্রয়োজনে লিখুন “ভারপ্রাপ্ত অধ্যক্ষ”।') }),
    ptBn: field({ label: tt('Title under the name (Bangla)', 'নামের নিচের পদবি (বাংলা)'), name: 'aptBn', value: about.principalTitle?.bn ?? '' }),
    mode: selectField({ label: tt('Student and teacher numbers', 'শিক্ষার্থী ও শিক্ষকের সংখ্যা'), name: 'amode', value: about.countMode ?? 'auto', options: [
      { value: 'auto', label: tt('Automatic — counted from the app', 'স্বয়ংক্রিয় — অ্যাপ থেকে গণনা') },
      { value: 'manual', label: tt('Write the numbers myself', 'সংখ্যা নিজে লিখব') },
      { value: 'hidden', label: tt('Do not show', 'দেখাবে না') }],
      hint: tt('Automatic: active students of the current session and active teachers. The numbers are refreshed whenever an administrator opens the dashboard.', 'স্বয়ংক্রিয়: চলতি সেশনের সক্রিয় শিক্ষার্থী ও সক্রিয় শিক্ষক। প্রশাসক ড্যাশবোর্ড খুললেই সংখ্যা হালনাগাদ হয়।') }),
    students: field({ label: tt('Current students', 'বর্তমান শিক্ষার্থী'), name: 'ast', type: 'number', value: about.studentCount ?? '', attrs: { min: 0 } }),
    teachers: field({ label: tt('Teachers', 'শিক্ষক'), name: 'atc', type: 'number', value: about.teacherCount ?? '', attrs: { min: 0 } }),
  };
  const countNow = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => {
    countNow.disabled = true;
    try {
      const { publicHeadCounts } = await import('../../data/repositories/stats-repository.js');
      const c = await publicHeadCounts();
      a.students.input.value = c.students; a.teachers.input.value = c.teachers;
      bar.markDirty();
      toast(tt('Counted: {s} students, {t} teachers. Press Save.', 'গণনা: {s} জন শিক্ষার্থী, {t} জন শিক্ষক। সংরক্ষণ চাপুন।', { s: c.students, t: c.teachers }), 'success');
    } catch (e) { toast(friendlyError(e), 'error'); } finally { countNow.disabled = false; }
  } }, tt('Count from the app now', 'এখনই অ্যাপ থেকে গণনা করুন'));
  const syncMode = () => {
    const m = a.mode.value;
    a.students.el.hidden = a.teachers.el.hidden = m === 'hidden';
    a.students.input.readOnly = a.teachers.input.readOnly = m === 'auto';
    countNow.hidden = m === 'hidden';
  };
  a.mode.input.addEventListener('change', syncMode); syncMode();

  const grid = (items) => h('div', { class: 'form-grid form-grid--pairs', oninput: bar.markDirty, onchange: bar.markDirty }, items);
  el.replaceChildren(
    h('p', { class: 'muted' }, tt('This is the first page students and guardians see. The result search is always at the top; everything you fill in here is shown around it. Empty fields are left out.', 'শিক্ষার্থী ও অভিভাবকরা প্রথমে এই পেজটি দেখেন। ফলাফল খোঁজার ঘর সবসময় উপরে থাকে; এখানে যা লিখবেন তা তার চারপাশে দেখাবে। খালি ঘর দেখানো হয় না।')),
    h('p', {}, h('a', { class: 'btn btn--ghost btn--sm', href: '#/lookup', target: '_blank', rel: 'noopener' }, tt('Open the public page', 'পাবলিক পেজটি খুলুন'))),
    h('h3', { class: 'form-section' }, tt('Banner', 'ব্যানার')),
    grid([f.tBn.el, f.tEn.el, f.dBn.el, f.dEn.el, f.nBn.el, f.nEn.el, f.logo.el]),
    imageInput({ label: tt('Banner picture (e.g. the college building)', 'ব্যানারের ছবি (যেমন কলেজ ভবন)'), value: assets.heroImage ?? null, maxWidth: 1600, maxHeight: 700,
      onChange: (v) => { if (v) assets.heroImage = v; else delete assets.heroImage; bar.markDirty(); } }),
    h('p', { class: 'muted small' }, tt('A wide picture works best. It is reduced automatically.', 'চওড়া ছবি সবচেয়ে ভালো দেখায়। ছবি স্বয়ংক্রিয়ভাবে ছোট হয়।')),
    h('h3', { class: 'form-section' }, tt('About the college', 'কলেজ পরিচিতি')),
    grid([a.fBn.el, a.fEn.el, a.est.el, h('span'), a.bBn.el, a.bEn.el]),
    h('h3', { class: 'form-section' }, tt('Principal', 'অধ্যক্ষ')),
    grid([a.pBn.el, a.pEn.el, a.ptBn.el, a.ptEn.el]),
    imageInput({ label: tt('Principal’s photo (optional)', 'অধ্যক্ষের ছবি (ঐচ্ছিক)'), value: assets.principalPhoto ?? null, maxWidth: 360, maxHeight: 440,
      onChange: (v) => { if (v) assets.principalPhoto = v; else delete assets.principalPhoto; bar.markDirty(); } }),
    h('h3', { class: 'form-section' }, tt('Students and teachers', 'শিক্ষার্থী ও শিক্ষক')),
    grid([a.mode.el, h('span'), a.students.el, a.teachers.el]),
    h('p', {}, countNow),
    h('p', { class: 'muted small' }, tt('Current figures on the page: {s} students, {t} teachers.', 'পেজে এখন দেখাচ্ছে: {s} জন শিক্ষার্থী, {t} জন শিক্ষক।', { s: about.studentCount ?? '—', t: about.teacherCount ?? '—' })),
    bar.el);
  return bar.dispose;
}
