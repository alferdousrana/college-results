import { h } from '../../core/dom.js';
import { tt, L } from '../../i18n/index.js';
import { field, selectField, checkGroup } from '../../ui/components/form.js';
import { loadingState } from '../../ui/components/states.js';
import { actor } from '../../pages/_shared.js';
import { saveBar } from './_save-bar.js';

export async function render(el) {
  el.append(loadingState());
  const repo = await import('../../data/repositories/settings-repository.js');
  const [pub, fieldsDoc] = await Promise.all([repo.getSetting('publication', { fresh: true }), repo.getSetting('studentFields')]);
  const custom = (fieldsDoc.fields ?? []).filter((f) => f.enabled !== false);
  const verifier = selectField({ label: tt('Extra check before showing a result', 'ফলাফল দেখানোর আগে অতিরিক্ত যাচাই'), name: 'pv', value: pub.verifierField ?? '',
    options: [{ value: '', label: tt('None — class, year, examination and roll are enough', 'নেই — শ্রেণি, বছর, পরীক্ষা ও রোলই যথেষ্ট') }, { value: 'dob', label: tt('Date of birth', 'জন্ম তারিখ') }, ...custom.map((f) => ({ value: `custom:${f.key}`, label: L(f.label) }))],
    hint: tt('Recommended. Without it, anyone who knows a roll number can see that student\'s result.', 'প্রস্তাবিত। এটি ছাড়া রোল নম্বর জানা যে কেউ সেই শিক্ষার্থীর ফলাফল দেখতে পারবে।') });
  const vEn = field({ label: tt('What students are asked for (English)', 'শিক্ষার্থীদের কী জিজ্ঞাসা করা হবে (ইংরেজি)'), name: 'pven', value: pub.verifierLabel?.en ?? '' });
  const vBn = field({ label: tt('What students are asked for (Bangla)', 'শিক্ষার্থীদের কী জিজ্ঞাসা করা হবে (বাংলা)'), name: 'pvbn', value: pub.verifierLabel?.bn ?? '' });
  const fieldsCg = checkGroup({ label: tt('Extra details shown on the public marksheet', 'পাবলিক মার্কশিটে অতিরিক্ত তথ্য'), name: 'pf',
    options: [['fatherName', tt("Father's name", 'পিতার নাম')], ['motherName', tt("Mother's name", 'মাতার নাম')], ['studentCode', tt('Student ID', 'শিক্ষার্থী আইডি')], ...custom.map((f) => [`custom:${f.key}`, L(f.label)])].map(([value, label]) => ({ value, label })),
    values: pub.publicStudentFields ?? [] });
  const pos = field({ label: tt('Show merit position on public results', 'পাবলিক ফলাফলে মেধাস্থান দেখান'), name: 'pp', type: 'checkbox', value: pub.showPositionPublicly !== false });
  const bar = saveBar({ onSave: () => repo.saveSetting(actor(), 'publication', { verifierField: verifier.value || null, verifierLabel: { en: vEn.value || 'Verification', bn: vBn.value || 'যাচাই' }, publicStudentFields: fieldsCg.value, showPositionPublicly: pos.value }, pub.revision ?? 0).then(() => { pub.revision = (pub.revision ?? 0) + 1; }) });
  el.replaceChildren(h('div', { oninput: bar.markDirty, onchange: bar.markDirty }, verifier.el, h('div', { class: 'form-grid' }, vEn.el, vBn.el), fieldsCg.el, pos.el),
    h('p', { class: 'muted small' }, tt('Unpublished results, guardian details not ticked above, teacher records and other students\' data are never shown publicly. Changes apply from the next publication.', 'অপ্রকাশিত ফলাফল, উপরে না বাছা অভিভাবকের তথ্য, শিক্ষকের তথ্য ও অন্য শিক্ষার্থীর ডেটা কখনো প্রকাশ্যে দেখানো হয় না। পরিবর্তন পরবর্তী প্রকাশ থেকে কার্যকর।')), bar.el);
  return bar.dispose;
}
