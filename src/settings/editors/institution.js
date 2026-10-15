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
  const bar = saveBar({ onSave: async () => { await repo.saveInstitution(actor(), collect()); } });
  const pair = (label, value, name) => {
    const en = field({ label: `${label} (English)`, name: `${name}En`, value: value?.en ?? '' });
    const bn = field({ label: `${label} (বাংলা)`, name: `${name}Bn`, value: value?.bn ?? '' });
    return { el: [en.el, bn.el], get: () => ({ en: en.value, bn: bn.value }) };
  };
  const f = {
    name: pair(tt('Institution name', 'প্রতিষ্ঠানের নাম'), inst.name, 'name'),
    address: pair(tt('Address', 'ঠিকানা'), inst.address, 'addr'),
    header: pair(tt('Extra heading line (optional)', 'অতিরিক্ত শিরোনাম (ঐচ্ছিক)'), inst.header, 'hdr'),
    footer: pair(tt('Footer note (optional)', 'পাদটীকা (ঐচ্ছিক)'), inst.footer, 'ftr'),
    phone: field({ label: tt('Phone', 'ফোন'), name: 'phone', value: inst.phone }),
    email: field({ label: tt('Email', 'ইমেইল'), name: 'email', type: 'email', value: inst.email }),
    website: field({ label: tt('Website', 'ওয়েবসাইট'), name: 'web', value: inst.website }),
    eiin: field({ label: 'EIIN', name: 'eiin', value: inst.eiin }),
  };
  const people = ['principal', 'committee', 'classTeacher'].map((role) => ({ role,
    name: pair({ principal: tt("Principal's name", 'অধ্যক্ষের নাম'), committee: tt('Examination committee convener', 'পরীক্ষা কমিটির আহ্বায়ক'), classTeacher: tt('Class teacher (if the same on every marksheet)', 'শ্রেণি শিক্ষক (সব মার্কশিটে একই হলে)') }[role], inst.signatories?.[role]?.name, `${role}N`),
    title: pair(tt('Title', 'পদবি'), inst.signatories?.[role]?.title, `${role}T`) }));
  const assets = { ...(inst.assets ?? {}) };
  const img = (key, label, w, hgt) => imageInput({ label, value: assets[key] ?? null, maxWidth: w, maxHeight: hgt, onChange: (v) => { if (v) assets[key] = v; else delete assets[key]; bar.markDirty(); } });
  function collect() {
    return {
      name: f.name.get(), address: f.address.get(), header: f.header.get(), footer: f.footer.get(), phone: f.phone.value, email: f.email.value, website: f.website.value, eiin: f.eiin.value,
      signatories: Object.fromEntries(people.map((p) => [p.role, { name: p.name.get(), title: p.title.get() }])), assets,
    };
  }
  el.replaceChildren(
    h('div', { class: 'form-grid', oninput: bar.markDirty }, f.name.el, f.address.el, f.phone.el, f.email.el, f.website.el, f.eiin.el, f.header.el, f.footer.el),
    h('h3', { class: 'form-section' }, tt('Logo and seal', 'লোগো ও সিল')),
    h('div', { class: 'image-grid' }, img('logo', tt('Logo', 'লোগো'), 400, 400), img('seal', tt('Seal', 'সিল'), 300, 300)),
    h('h3', { class: 'form-section' }, tt('Signatories', 'স্বাক্ষরকারী')),
    ...people.map((p) => h('div', { class: 'form-grid', oninput: bar.markDirty }, p.name.el, p.title.el)),
    h('div', { class: 'image-grid' }, img('principalSignature', tt("Principal's signature", 'অধ্যক্ষের স্বাক্ষর'), 500, 200), img('committeeSignature', tt("Convener's signature", 'আহ্বায়কের স্বাক্ষর'), 500, 200), img('classTeacherSignature', tt("Class teacher's signature", 'শ্রেণি শিক্ষকের স্বাক্ষর'), 500, 200)),
    h('p', { class: 'muted small' }, tt('PNG, JPEG or WebP, up to 3 MB. Images are reduced automatically. Published results keep the logo and signatures used when they were published.', 'PNG, JPEG বা WebP, ৩ এমবি পর্যন্ত। ছবি স্বয়ংক্রিয়ভাবে ছোট হয়। প্রকাশিত ফলাফল প্রকাশের সময়ের লোগো ও স্বাক্ষর রাখে।')),
    bar.el);
  return bar.dispose;
}
