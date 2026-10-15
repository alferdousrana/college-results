/** Subject catalogue with a component editor (CQ / MCQ / Practical / CA / custom, any combination). */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button } from '../../ui/components/page.js';
import { asyncSection } from '../../ui/components/states.js';
import { dataTable } from '../../ui/components/data-table.js';
import { openModal } from '../../ui/components/modal.js';
import { field, checkGroup } from '../../ui/components/form.js';
import { actor, run } from '../_shared.js';
import { validateSubjectDefinition } from '../../domain/validation/settings-validation.js';
import { C } from '../../data/paths.js';

export const title = 'nav.subjects';
const TYPES = () => [['CQ', tt('CQ (written / creative)', 'সৃজনশীল (লিখিত)')], ['MCQ', tt('MCQ', 'বহুনির্বাচনি')], ['PRACTICAL', tt('Practical', 'ব্যবহারিক')], ['CA', tt('Continuous assessment', 'ধারাবাহিক মূল্যায়ন')], ['CUSTOM', tt('Other', 'অন্যান্য')]];
const PRESETS = () => [
  [tt('CQ only', 'শুধু সৃজনশীল'), [['CQ', 100, 33]]], [tt('MCQ only', 'শুধু বহুনির্বাচনি'), [['MCQ', 100, 33]]], [tt('Practical only', 'শুধু ব্যবহারিক'), [['PRACTICAL', 100, 33]]],
  [tt('CQ + MCQ', 'সৃজনশীল + বহুনির্বাচনি'), [['CQ', 70, 23], ['MCQ', 30, 10]]], [tt('CQ + Practical', 'সৃজনশীল + ব্যবহারিক'), [['CQ', 75, 25], ['PRACTICAL', 25, 8]]],
  [tt('MCQ + Practical', 'বহুনির্বাচনি + ব্যবহারিক'), [['MCQ', 75, 25], ['PRACTICAL', 25, 8]]], [tt('CQ + MCQ + Practical', 'সৃজনশীল + বহুনির্বাচনি + ব্যবহারিক'), [['CQ', 50, 17], ['MCQ', 25, 8], ['PRACTICAL', 25, 8]]],
];

export function render() {
  const root = h('section', { class: 'page' });
  const paint = () => {
    const body = h('div');
    asyncSection(body, async () => {
      const { loadAllCatalogues } = await import('../../data/repositories/catalogue-repository.js');
      return loadAllCatalogues({ fresh: true });
    }, (cats) => dataTable({ rows: cats.subjects, searchKeys: [(r) => L(r.name, 'en'), (r) => L(r.name, 'bn'), 'code'], pageSize: 50,
      filters: [{ key: 'cls', label: tt('Class', 'শ্রেণি'), get: (r) => (r.classIds ?? []).join(' '), options: [] },
        { key: 'active', label: tt('Status', 'অবস্থা'), get: (r) => String(r.active !== false), options: [{ value: 'true', label: tt('Active', 'সক্রিয়') }, { value: 'false', label: tt('Inactive', 'নিষ্ক্রিয়') }] }].filter((f) => f.options.length),
      toolbar: [button(tt('Add subject', 'বিষয় যোগ'), { kind: 'primary', size: 'sm', icon: 'plus', onClick: () => edit(null, cats, paint) })],
      columns: [
        { key: 'name', label: tt('Subject', 'বিষয়'), sort: (r) => L(r.name), render: (r) => h('div', {}, h('strong', {}, L(r.name, 'en')), h('div', { class: 'muted small' }, L(r.name, 'bn'))) },
        { key: 'code', label: tt('Code', 'কোড') },
        { key: 'comp', label: tt('Components', 'অংশ'), render: (r) => (r.components ?? []).filter((c) => c.enabled !== false).map((c) => `${c.label} ${c.maxMarks}${c.passMarks != null ? `/${c.passMarks}` : ''}`).join(' · ') },
        { key: 'cls', label: tt('Classes', 'শ্রেণি'), render: (r) => (r.classIds ?? []).map((id) => L(cats.classes.find((x) => x.id === id)?.name) || id).join(', ') || tt('All', 'সব') },
        { key: 'grp', label: tt('Groups', 'বিভাগ'), render: (r) => (r.groupIds ?? []).map((id) => L(cats.groups.find((x) => x.id === id)?.name) || id).join(', ') || tt('All', 'সব') },
        { key: 'active', label: tt('Active', 'সক্রিয়'), render: (r) => (r.active === false ? tt('No', 'না') : tt('Yes', 'হ্যাঁ')) },
        { key: 'e', label: '', render: (r) => button(tt('Edit', 'সম্পাদনা'), { size: 'sm', onClick: () => edit(r, cats, paint) }) },
      ] }).el);
    root.replaceChildren(pageHeader({ title: t('nav.subjects'), subtitle: tt('Changes apply to new result sheets. Sheets already created keep the configuration they were created with.', 'পরিবর্তন নতুন ফলাফল শিটে প্রযোজ্য। আগে তৈরি শিট নিজ কনফিগারেশন রাখে।') }), body);
  };
  paint();
  return root;
}

function edit(subject, cats, refresh) {
  let comps = structuredClone(subject?.components ?? [{ id: 'cq', type: 'CQ', label: 'CQ', maxMarks: 100, passMarks: 33, scale: 1, required: true, enabled: true, paper: null }]);
  const nameEn = field({ label: tt('Name (English)', 'নাম (ইংরেজি)'), name: 'sen', required: true, value: subject?.name?.en ?? '' });
  const nameBn = field({ label: tt('Name (Bangla)', 'নাম (বাংলা)'), name: 'sbn', value: subject?.name?.bn ?? '' });
  const code = field({ label: tt('Subject code', 'বিষয় কোড'), name: 'scode', value: subject?.code ?? '' });
  const pass = field({ label: tt('Pass marks on the subject total (optional)', 'বিষয়ের মোট নম্বরে পাস নম্বর (ঐচ্ছিক)'), name: 'spass', type: 'number', value: subject?.passMarks ?? '', hint: tt('Leave empty if only the component pass marks apply.', 'শুধু অংশভিত্তিক পাস নম্বর প্রযোজ্য হলে খালি রাখুন।') });
  const classes = checkGroup({ label: tt('Classes', 'শ্রেণি'), name: 'scls', options: cats.classes.map((c) => ({ value: c.id, label: L(c.name) })), values: subject?.classIds ?? [] });
  const groups = checkGroup({ label: tt('Groups (none ticked = all groups)', 'বিভাগ (কিছু না বাছলে সব বিভাগ)'), name: 'sgrp', options: cats.groups.map((g) => ({ value: g.id, label: L(g.name) })), values: subject?.groupIds ?? [] });
  const active = field({ label: tt('Active', 'সক্রিয়'), name: 'sact', type: 'checkbox', value: subject ? subject.active !== false : true });
  const optional = field({ label: tt('Can be taken as the optional (4th) subject', 'ঐচ্ছিক (৪র্থ) বিষয় হিসেবে নেওয়া যায়'), name: 'sopt', type: 'checkbox', value: Boolean(subject?.optionalEligible) });
  const gpa = field({ label: tt('Counts toward GPA', 'জিপিএ-তে গণ্য'), name: 'sgpa', type: 'checkbox', value: subject ? subject.countsTowardGpa !== false : true });
  const total = field({ label: tt('Counts toward total marks', 'মোট নম্বরে গণ্য'), name: 'stot', type: 'checkbox', value: subject ? subject.countsTowardTotal !== false : true });
  const compBox = h('div');
  const errBox = h('div');
  const paintComps = () => {
    const full = comps.filter((c) => c.enabled !== false).reduce((a, c) => a + c.maxMarks * (c.scale ?? 1), 0);
    compBox.replaceChildren(
      h('div', { class: 'row-actions wrap' }, h('span', { class: 'muted' }, tt('Quick start:', 'দ্রুত শুরু:')), PRESETS().map(([label, list]) => button(label, { size: 'sm', onClick: () => { comps = list.map(([type, max, p], i) => ({ id: `${type.toLowerCase()}${i ? i : ''}`, type, label: type === 'PRACTICAL' ? 'Practical' : type, maxMarks: max, passMarks: p, scale: 1, required: true, enabled: true, paper: null })); paintComps(); } }))),
      h('div', { class: 'table-scroll' }, h('table', { class: 'data-table comp-table' },
        h('thead', {}, h('tr', {}, [tt('Type', 'ধরন'), tt('Label', 'নাম'), tt('Paper', 'পত্র'), tt('Full marks', 'পূর্ণমান'), tt('Pass marks', 'পাস নম্বর'), tt('Weight', 'ভার'), tt('Required', 'আবশ্যক'), ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, comps.map((c, i) => {
          const upd = (k, parse = (v) => v) => (e) => { c[k] = parse(e.target.type === 'checkbox' ? e.target.checked : e.target.value); if (k !== 'label') paintComps(); };
          return h('tr', {},
            h('td', {}, h('select', { class: 'input input--sm', 'aria-label': tt('Type', 'ধরন'), onchange: upd('type') }, TYPES().map(([v, l]) => h('option', { value: v, selected: c.type === v }, l)))),
            h('td', {}, h('input', { class: 'input input--sm', value: c.label, 'aria-label': tt('Label', 'নাম'), oninput: upd('label') })),
            h('td', {}, h('select', { class: 'input input--sm', 'aria-label': tt('Paper', 'পত্র'), onchange: upd('paper', (v) => v || null) }, [['', '—'], ['1st', '1st'], ['2nd', '2nd']].map(([v, l]) => h('option', { value: v, selected: (c.paper ?? '') === v }, l)))),
            h('td', {}, h('input', { class: 'input input--sm', type: 'number', min: 1, value: c.maxMarks, 'aria-label': tt('Full marks', 'পূর্ণমান'), onchange: upd('maxMarks', Number) })),
            h('td', {}, h('input', { class: 'input input--sm', type: 'number', min: 0, value: c.passMarks ?? '', placeholder: tt('none', 'নেই'), 'aria-label': tt('Pass marks', 'পাস নম্বর'), onchange: upd('passMarks', (v) => (v === '' ? null : Number(v))) })),
            h('td', {}, h('input', { class: 'input input--sm', type: 'number', step: '0.01', min: 0.01, value: c.scale ?? 1, title: tt('1 = counts fully. 0.7 = a paper marked out of 100 counts as 70.', '১ = পুরোটা গণ্য। ০.৭ = ১০০-তে নেওয়া পত্র ৭০ হিসেবে গণ্য।'), 'aria-label': tt('Weight', 'ভার'), onchange: upd('scale', Number) })),
            h('td', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: c.required !== false, 'aria-label': tt('Required', 'আবশ্যক'), onchange: upd('required') })),
            h('td', {}, button(tt('Remove', 'বাদ দিন'), { size: 'sm', onClick: () => { comps.splice(i, 1); paintComps(); } })));
        })))),
      h('div', { class: 'row-actions' }, button(tt('Add component', 'অংশ যোগ'), { size: 'sm', icon: 'plus', onClick: () => { const n = comps.length + 1; comps.push({ id: `c${Date.now().toString(36)}`, type: 'CUSTOM', label: `Part ${n}`, maxMarks: 25, passMarks: null, scale: 1, required: true, enabled: true, paper: null }); paintComps(); } }),
        h('span', { class: 'muted' }, tt('Subject full marks: {n}', 'বিষয়ের পূর্ণমান: {n}', { n: Math.round(full * 100) / 100 }))),
      h('p', { class: 'muted small' }, tt('A student fails the subject if any component with pass marks is below them, even when the total is high.', 'কোনো অংশে পাস নম্বরের কম পেলে মোট নম্বর বেশি হলেও শিক্ষার্থী বিষয়ে অনুত্তীর্ণ হবে।')));
  };
  paintComps();
  openModal({ title: subject ? tt('Edit subject', 'বিষয় সম্পাদনা') : tt('Add subject', 'বিষয় যোগ'), size: 'xl',
    content: h('div', {}, h('div', { class: 'form-grid' }, nameEn.el, nameBn.el, code.el, pass.el), classes.el, groups.el, h('div', { class: 'form-grid' }, active.el, optional.el, gpa.el, total.el),
      h('h3', { class: 'form-section' }, tt('Mark components', 'নম্বরের অংশ')), compBox, errBox),
    actions: [{ label: t('common.cancel'), onClick: () => true }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      const used = new Set(); comps.forEach((c, i) => { if (!c.id || used.has(c.id)) c.id = `${(c.type || 'c').toLowerCase()}${i}`; used.add(c.id); });
      const data = { name: { en: nameEn.value, bn: nameBn.value || null }, code: code.value || null, passMarks: pass.value === '' ? null : Number(pass.value), classIds: classes.value, groupIds: groups.value,
        active: active.value, optionalEligible: optional.value, countsTowardGpa: gpa.value, countsTowardTotal: total.value, components: comps, order: subject?.order ?? cats.subjects.length + 1 };
      const errors = [...(nameEn.value ? [] : [tt('English name is required.', 'ইংরেজি নাম আবশ্যক।')]), ...validateSubjectDefinition({ id: subject?.id ?? 'new', ...data, name: data.name.en })];
      errBox.replaceChildren(errors.length ? h('ul', { class: 'notice notice--bad' }, errors.map((e) => h('li', {}, e))) : '');
      if (errors.length) return false;
      const { saveCatalogueItem } = await import('../../data/repositories/catalogue-repository.js');
      const r = await run(() => saveCatalogueItem(actor(), C.SUBJECTS, subject?.id ?? null, data), { success: tt('Subject saved', 'বিষয় সংরক্ষিত') });
      if (r !== undefined) refresh();
      return r !== undefined;
    } }] });
}
