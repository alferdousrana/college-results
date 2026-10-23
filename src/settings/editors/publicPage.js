/** The public result page students see: title, description, picture and an optional notice. */
import { h } from '../../core/dom.js';
import { tt } from '../../i18n/index.js';
import { field } from '../../ui/components/form.js';
import { imageInput } from '../../ui/components/image-input.js';
import { loadingState } from '../../ui/components/states.js';
import { actor } from '../../pages/_shared.js';
import { saveBar } from './_save-bar.js';

export async function render(el) {
  el.append(loadingState());
  const repo = await import('../../data/repositories/settings-repository.js');
  const inst = await repo.getInstitution({ fresh: true });
  const land = inst.landing ?? {};
  const assets = { ...(inst.assets ?? {}) };
  const bar = saveBar({ onSave: async () => {
    await repo.saveInstitution(actor(), { ...inst, assets, landing: {
      title: { en: f.tEn.value, bn: f.tBn.value }, description: { en: f.dEn.value, bn: f.dBn.value }, notice: { en: f.nEn.value, bn: f.nBn.value },
      showLogo: f.logo.value } });
  } });
  const f = {
    tEn: field({ label: tt('Heading (English)', 'শিরোনাম (ইংরেজি)'), name: 'ltEn', value: land.title?.en ?? '', hint: tt('Leave empty to show the institution name.', 'খালি রাখলে প্রতিষ্ঠানের নাম দেখাবে।') }),
    tBn: field({ label: tt('Heading (Bangla)', 'শিরোনাম (বাংলা)'), name: 'ltBn', value: land.title?.bn ?? '' }),
    dEn: field({ label: tt('Description (English)', 'বিবরণ (ইংরেজি)'), name: 'ldEn', type: 'textarea', value: land.description?.en ?? '' }),
    dBn: field({ label: tt('Description (Bangla)', 'বিবরণ (বাংলা)'), name: 'ldBn', type: 'textarea', value: land.description?.bn ?? '' }),
    nEn: field({ label: tt('Notice (English, optional)', 'নোটিশ (ইংরেজি, ঐচ্ছিক)'), name: 'lnEn', value: land.notice?.en ?? '', hint: tt('For example: Annual examination results are published.', 'যেমন: বার্ষিক পরীক্ষার ফলাফল প্রকাশিত হয়েছে।') }),
    nBn: field({ label: tt('Notice (Bangla, optional)', 'নোটিশ (বাংলা, ঐচ্ছিক)'), name: 'lnBn', value: land.notice?.bn ?? '' }),
    logo: field({ label: tt('Show the logo', 'লোগো দেখান'), name: 'llogo', type: 'checkbox', value: land.showLogo !== false }),
  };
  el.replaceChildren(
    h('p', { class: 'muted' }, tt('This is the first page students and guardians see. The result search box is always in the middle.', 'শিক্ষার্থী ও অভিভাবকরা প্রথমে এই পেজটি দেখেন। ফলাফল খোঁজার ঘর সবসময় মাঝখানে থাকে।')),
    h('div', { class: 'form-grid', oninput: bar.markDirty, onchange: bar.markDirty }, Object.values(f).map((x) => x.el)),
    h('h3', { class: 'form-section' }, tt('Picture', 'ছবি')),
    imageInput({ label: tt('Banner picture (e.g. the college building)', 'ব্যানারের ছবি (যেমন কলেজ ভবন)'), value: assets.heroImage ?? null, maxWidth: 1600, maxHeight: 700,
      onChange: (v) => { if (v) assets.heroImage = v; else delete assets.heroImage; bar.markDirty(); } }),
    h('p', { class: 'muted small' }, tt('A wide picture works best. It is reduced automatically.', 'চওড়া ছবি সবচেয়ে ভালো দেখায়। ছবি স্বয়ংক্রিয়ভাবে ছোট হয়।')),
    bar.el);
  return bar.dispose;
}
