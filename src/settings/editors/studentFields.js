import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { field, selectField } from '../../ui/components/form.js';
import { openModal } from '../../ui/components/modal.js';
import { loadingState } from '../../ui/components/states.js';
import { actor } from '../../pages/_shared.js';
import { saveBar } from './_save-bar.js';
import { featureGate } from '../../ui/components/feature-gate.js';
import { button } from '../../ui/components/page.js';

const TYPES = () => [['text', tt('Text', 'লেখা')], ['number', tt('Number', 'সংখ্যা')], ['date', tt('Date', 'তারিখ')], ['select', tt('Choice list', 'তালিকা থেকে বাছাই')], ['checkbox', tt('Yes / no', 'হ্যাঁ / না')]];
const RESERVED = new Set(['name', 'nameBn', 'roll', 'groupId', 'fatherName', 'motherName', 'dob', 'studentCode', 'section', 'shift']);

export const render = (el) => renderFieldsEditor(el);

/** Shared editor for extra fields on students (settings/studentFields) or teachers (settings/teacherFields). */
export async function renderFieldsEditor(el, { docName = 'studentFields', forTeachers = false } = {}) {
  el.append(loadingState());
  const repo = await import('../../data/repositories/settings-repository.js');
  const doc = await repo.getSetting(docName, { fresh: true });
  let fields = structuredClone(doc.fields ?? []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const bar = saveBar({ onSave: () => repo.saveSetting(actor(), docName, { fields: fields.map((f, i) => ({ ...f, order: i + 1 })) }, doc.revision ?? 0).then(() => { doc.revision = (doc.revision ?? 0) + 1; }) });
  const list = h('div');
  const paint = () => list.replaceChildren(fields.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
    h('thead', {}, h('tr', {}, [tt('Field', 'তথ্যঘর'), tt('Type', 'ধরন'), tt('Shown on', 'যেখানে দেখাবে'), tt('Enabled', 'চালু'), ''].map((x) => h('th', {}, x)))),
    h('tbody', {}, fields.map((f, i) => h('tr', { class: f.enabled === false ? 'is-muted' : '' },
      h('td', {}, h('strong', {}, L(f.label)), h('div', { class: 'muted small' }, f.key, f.required ? ` · ${tt('required', 'আবশ্যক')}` : '')),
      h('td', {}, TYPES().find((x) => x[0] === f.type)?.[1] ?? f.type),
      h('td', { class: 'small' }, [f.showOnRecord !== false ? tt('record', 'রেকর্ড') : null, f.showOnMarksheet ? tt('marksheet', 'মার্কশিট') : null, f.showOnSheet ? tt('result sheet', 'ফলাফল শিট') : null].filter(Boolean).join(', ')),
      h('td', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: f.enabled !== false, 'aria-label': tt('Enabled', 'চালু'), onchange: (e) => { f.enabled = e.target.checked; bar.markDirty(); paint(); } })),
      h('td', {}, h('div', { class: 'row-actions' },
        button('↑', { size: 'sm', disabled: i === 0, attrs: { 'aria-label': tt('Move up', 'উপরে') }, onClick: () => { [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]]; bar.markDirty(); paint(); } }),
        button('↓', { size: 'sm', disabled: i === fields.length - 1, attrs: { 'aria-label': tt('Move down', 'নিচে') }, onClick: () => { [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]]; bar.markDirty(); paint(); } }),
        button(tt('Edit', 'সম্পাদনা'), { size: 'sm', onClick: () => edit(f) }))))))))
    : h('p', { class: 'muted' }, tt('No extra fields yet.', 'এখনো কোনো অতিরিক্ত তথ্যঘর নেই।')));
  function edit(existing) {
    const f = existing ? { ...existing } : { key: '', label: { en: '', bn: '' }, type: 'text', options: [], required: false, enabled: true, showOnRecord: true, showOnMarksheet: false, showOnSheet: false };
    const en = field({ label: tt('Label (English)', 'নাম (ইংরেজি)'), name: 'fen', value: f.label?.en, required: true });
    const bn = field({ label: tt('Label (Bangla)', 'নাম (বাংলা)'), name: 'fbn', value: f.label?.bn });
    const type = selectField({ label: tt('Type', 'ধরন'), name: 'ft', value: f.type, options: TYPES().map(([value, label]) => ({ value, label })) });
    const opts = field({ label: tt('Choices (one per line)', 'বিকল্প (প্রতি লাইনে একটি)'), name: 'fo', type: 'textarea', value: (f.options ?? []).join('\n') });
    const req = field({ label: tt('Required', 'আবশ্যক'), name: 'fr', type: 'checkbox', value: f.required });
    const rec = field({ label: forTeachers ? tt('Show on teacher record', 'শিক্ষকের তথ্যে দেখান') : tt('Show on student record', 'শিক্ষার্থীর রেকর্ডে দেখান'), name: 'fsr', type: 'checkbox', value: f.showOnRecord !== false });
    const ms = field({ label: tt('Show on individual marksheet', 'একক মার্কশিটে দেখান'), name: 'fsm', type: 'checkbox', value: f.showOnMarksheet });
    const sh = field({ label: tt('Show on full result sheet', 'পূর্ণ ফলাফল শিটে দেখান'), name: 'fss', type: 'checkbox', value: f.showOnSheet });
    if (forTeachers) { ms.el.hidden = true; sh.el.hidden = true; }
    const syncOpts = () => { opts.el.hidden = type.value !== 'select'; };
    type.input.addEventListener('change', syncOpts); syncOpts();
    openModal({ title: existing ? tt('Edit field', 'তথ্যঘর সম্পাদনা') : tt('Add field', 'তথ্যঘর যোগ'), content: h('div', {}, en.el, bn.el, type.el, opts.el, req.el, rec.el, ms.el, sh.el,
      h('p', { class: 'muted small' }, tt('Marksheet visibility only applies to results calculated after the change; published results keep what was shown when published.', 'মার্কশিটে দেখানো শুধু পরিবর্তনের পরের হিসাবে প্রযোজ্য; প্রকাশিত ফলাফল আগের মতোই থাকে।'))),
    actions: [{ label: t('common.cancel'), onClick: () => true }, { label: t('common.save'), kind: 'primary', onClick: () => {
      if (!en.value) { en.setError(tt('Required', 'আবশ্যক')); return false; }
      const key = existing?.key ?? en.value.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
      if (!existing && (!key || RESERVED.has(key) || fields.some((x) => x.key === key))) { en.setError(tt('Choose a different name — this one is already used.', 'অন্য নাম দিন — এটি আগেই ব্যবহৃত।')); return false; }
      const options = opts.value.split('\n').map((x) => x.trim()).filter(Boolean);
      if (type.value === 'select' && !options.length) { opts.setError(tt('Add at least one choice', 'অন্তত একটি বিকল্প দিন')); return false; }
      Object.assign(f, { key, label: { en: en.value, bn: bn.value || null }, type: type.value, options: type.value === 'select' ? options : [], required: req.value, showOnRecord: rec.value, showOnMarksheet: ms.value, showOnSheet: sh.value });
      if (existing) Object.assign(existing, f); else fields.push(f);
      bar.markDirty(); paint(); return true;
    } }] });
  }
  paint();
  const body = () => h('div', {},
    h('p', {}, forTeachers
      ? tt('Add information you keep about every teacher, such as designation, joining date or NID. Disabled fields are hidden but their stored values are kept.', 'প্রত্যেক শিক্ষকের যে তথ্য রাখতে চান (যেমন পদবি, যোগদানের তারিখ, এনআইডি) তা যোগ করুন। বন্ধ তথ্যঘর লুকানো থাকে কিন্তু সংরক্ষিত মান থাকে।')
      : tt('Add information you want to keep about every student, such as blood group or guardian phone. Disabled fields are hidden but their stored values are kept.', 'প্রত্যেক শিক্ষার্থীর বিষয়ে যে তথ্য রাখতে চান (যেমন রক্তের গ্রুপ, অভিভাবকের ফোন) তা যোগ করুন। বন্ধ তথ্যঘর লুকানো থাকে কিন্তু সংরক্ষিত মান থাকে।')),
    list, h('div', { class: 'row-actions' }, button(tt('Add field', 'তথ্যঘর যোগ'), { icon: 'plus', onClick: () => edit(null) })), bar.el);
  el.replaceChildren(forTeachers ? body() : featureGate('custom_student_fields', body));
  return bar.dispose;
}
