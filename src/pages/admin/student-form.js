/** Student create/edit modal, including Settings-defined custom fields. */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { field, selectField } from '../../ui/components/form.js';
import { openModal } from '../../ui/components/modal.js';
import { toast } from '../../ui/components/toast.js';
import { actor, friendlyError } from '../_shared.js';

export function customFieldInput(def, value) {
  const label = L(def.label);
  if (def.type === 'select') return selectField({ label, name: `cf-${def.key}`, value: value ?? '', required: def.required, options: [{ value: '', label: '—' }, ...(def.options ?? []).map((o) => ({ value: o, label: o }))] });
  if (def.type === 'checkbox') return field({ label, name: `cf-${def.key}`, type: 'checkbox', value: Boolean(value) });
  return field({ label, name: `cf-${def.key}`, type: def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text', value: value ?? '', required: def.required });
}

export function readCustom(defs, inputs) {
  const out = {}; const errors = [];
  for (const d of defs) {
    const f = inputs[d.key];
    let v = d.type === 'checkbox' ? f.input.checked : f.input.value.trim();
    if (d.type === 'number' && v !== '') v = Number(v);
    if (d.required && (v === '' || v == null)) { f.setError?.(tt('Required', 'আবশ্যক')); errors.push(d.key); } else f.setError?.(null);
    if (v !== '' && v != null) out[d.key] = v;
  }
  return { values: out, errors };
}

export function openStudentForm({ student = null, cats, fieldDefs, defaults = {}, onSaved }) {
  const cur = student?.current ?? defaults;
  const f = {
    nameEn: field({ label: tt('Name (English)', 'নাম (ইংরেজি)'), name: 'nameEn', value: student?.nameEn ?? '', required: true }),
    nameBn: field({ label: tt('Name (Bangla)', 'নাম (বাংলা)'), name: 'nameBn', value: student?.nameBn ?? '' }),
    father: field({ label: tt("Father's name", 'পিতার নাম'), name: 'father', value: student?.fatherName ?? '' }),
    mother: field({ label: tt("Mother's name", 'মাতার নাম'), name: 'mother', value: student?.motherName ?? '' }),
    dob: field({ label: tt('Date of birth', 'জন্ম তারিখ'), name: 'dob', type: 'date', value: student?.dob ?? '' }),
    gender: selectField({ label: tt('Gender', 'লিঙ্গ'), name: 'gender', value: student?.gender ?? '', options: [{ value: '', label: '—' }, { value: 'female', label: tt('Female', 'নারী') }, { value: 'male', label: tt('Male', 'পুরুষ') }, { value: 'other', label: tt('Other', 'অন্যান্য') }] }),
    year: selectField({ label: tt('Academic year', 'শিক্ষাবর্ষ'), name: 'year', required: true, value: cur.yearId ?? '', options: cats.years.map((y) => ({ value: y.id, label: y.label })) }),
    klass: selectField({ label: tt('Class', 'শ্রেণি'), name: 'klass', required: true, value: cur.classId ?? '', options: cats.classes.map((c) => ({ value: c.id, label: L(c.name) })) }),
    group: selectField({ label: tt('Group', 'বিভাগ'), name: 'group', value: cur.groupId ?? '', options: [{ value: '', label: '—' }, ...cats.groups.map((g) => ({ value: g.id, label: L(g.name) }))] }),
    roll: field({ label: tt('Roll', 'রোল'), name: 'roll', value: cur.roll ?? '', required: true, inputmode: 'numeric' }),
    section: field({ label: tt('Section', 'শাখা'), name: 'section', value: cur.section ?? '' }),
    shift: field({ label: tt('Shift', 'শিফট'), name: 'shift', value: cur.shift ?? '' }),
    optional: selectField({ label: tt('Optional (4th) subject', 'ঐচ্ছিক (৪র্থ) বিষয়'), name: 'opt', value: cur.optionalSubjectId ?? '', options: [{ value: '', label: '—' }, ...cats.subjects.filter((s) => s.optionalEligible).map((s) => ({ value: s.id, label: L(s.name) }))] }),
    admNo: field({ label: tt('Admission number', 'ভর্তি নম্বর'), name: 'admNo', value: student?.admission?.number ?? '' }),
    admDate: field({ label: tt('Admission date', 'ভর্তির তারিখ'), name: 'admDate', type: 'date', value: student?.admission?.date ?? '' }),
    code: field({ label: tt('Student ID', 'শিক্ষার্থী আইডি'), name: 'code', value: student?.studentCode ?? '', hint: tt('Leave empty to create one automatically. It never changes when the roll changes.', 'খালি রাখলে স্বয়ংক্রিয়ভাবে তৈরি হবে। রোল বদলালেও এটি বদলায় না।') }),
  };
  const defs = (fieldDefs ?? []).filter((d) => d.enabled !== false && d.showOnRecord !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const cInputs = Object.fromEntries(defs.map((d) => [d.key, customFieldInput(d, student?.customFields?.[d.key])]));
  const content = h('div', {},
    h('h3', { class: 'form-section' }, tt('Identity', 'পরিচয়')), h('div', { class: 'form-grid' }, f.nameEn.el, f.nameBn.el, f.father.el, f.mother.el, f.dob.el, f.gender.el, f.code.el),
    h('h3', { class: 'form-section' }, tt('Current class', 'বর্তমান শ্রেণি')), h('div', { class: 'form-grid' }, f.year.el, f.klass.el, f.group.el, f.roll.el, f.section.el, f.shift.el, f.optional.el),
    h('h3', { class: 'form-section' }, tt('Admission', 'ভর্তি')), h('div', { class: 'form-grid' }, f.admNo.el, f.admDate.el),
    defs.length ? [h('h3', { class: 'form-section' }, tt('Additional information', 'অতিরিক্ত তথ্য')), h('div', { class: 'form-grid' }, defs.map((d) => cInputs[d.key].el))] : null);
  openModal({ title: student ? tt('Edit student', 'শিক্ষার্থী সম্পাদনা') : tt('Add student', 'শিক্ষার্থী যোগ'), size: 'l', content, actions: [
    { label: t('common.cancel'), onClick: () => true },
    { label: t('common.save'), kind: 'primary', onClick: async () => {
      let ok = true;
      f.nameEn.setError(f.nameEn.value ? null : tt('Required', 'আবশ্যক')); ok &&= Boolean(f.nameEn.value);
      f.roll.setError(/^\d{1,6}$/.test(f.roll.value) ? null : tt('Use a whole number', 'পূর্ণ সংখ্যা লিখুন')); ok &&= /^\d{1,6}$/.test(f.roll.value);
      const custom = readCustom(defs, cInputs); ok &&= !custom.errors.length;
      if (!ok) return false;
      try {
        const { saveStudent } = await import('../../data/repositories/students-repository.js');
        const id = await saveStudent(actor(), student?.id ?? null, {
          nameEn: f.nameEn.value, nameBn: f.nameBn.value, fatherName: f.father.value, motherName: f.mother.value, dob: f.dob.value, gender: f.gender.value,
          studentCode: f.code.value || null, admission: { number: f.admNo.value, date: f.admDate.value },
          current: { ...(student?.current ?? {}), yearId: f.year.value, classId: f.klass.value, groupId: f.group.value || null, roll: f.roll.value, section: f.section.value || null, shift: f.shift.value || null, optionalSubjectId: f.optional.value || null },
          customFields: { ...(student?.customFields ?? {}), ...custom.values },
        });
        toast(tt('Student saved', 'শিক্ষার্থী সংরক্ষিত'), 'success'); onSaved?.(id); return true;
      } catch (e) { (e.code === 'duplicate-roll' ? f.roll : f.nameEn).setError(e.code === 'duplicate-roll' ? e.message : null); toast(friendlyError(e), 'error'); return false; }
    } }] });
}
