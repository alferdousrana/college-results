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
    year: selectField({ label: tt('Session', 'সেশন'), name: 'year', required: true, value: cur.yearId ?? '', options: cats.years.map((y) => ({ value: y.id, label: y.label })) }),
    klass: selectField({ label: tt('Class', 'শ্রেণি'), name: 'klass', required: true, value: cur.classId ?? '', options: cats.classes.map((c) => ({ value: c.id, label: L(c.name) })) }),
    group: selectField({ label: tt('Group', 'বিভাগ'), name: 'group', value: cur.groupId ?? '', options: [{ value: '', label: '—' }, ...cats.groups.map((g) => ({ value: g.id, label: L(g.name) }))] }),
    roll: field({ label: tt('Roll', 'রোল'), name: 'roll', value: cur.roll ?? '', required: true, inputmode: 'numeric' }),
    code: field({ label: tt('Student ID', 'শিক্ষার্থী আইডি'), name: 'code', value: student?.studentCode ?? '', hint: tt('Leave empty to create one automatically. It never changes when the roll changes.', 'খালি রাখলে স্বয়ংক্রিয়ভাবে তৈরি হবে। রোল বদলালেও এটি বদলায় না।') }),
  };
  const choices = subjectChooser({ cats, groupInput: f.group.input, classInput: f.klass.input, chosen: (cur.subjectIds ?? []).filter((id) => id !== cur.optionalSubjectId), fourth: cur.optionalSubjectId ?? null });
  const defs = (fieldDefs ?? []).filter((d) => d.enabled !== false && d.showOnRecord !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const cInputs = Object.fromEntries(defs.map((d) => [d.key, customFieldInput(d, student?.customFields?.[d.key])]));
  const content = h('div', {},
    h('h3', { class: 'form-section' }, tt('Identity', 'পরিচয়')), h('div', { class: 'form-grid' }, f.nameEn.el, f.nameBn.el, f.father.el, f.mother.el, f.dob.el, f.gender.el, f.code.el),
    h('h3', { class: 'form-section' }, tt('Current class and session', 'বর্তমান শ্রেণি ও সেশন')), h('div', { class: 'form-grid' }, f.year.el, f.klass.el, f.group.el, f.roll.el),
    h('h3', { class: 'form-section' }, tt('Subjects', 'বিষয়')), choices.el,
    defs.length ? [h('h3', { class: 'form-section' }, tt('Additional information', 'অতিরিক্ত তথ্য')), h('div', { class: 'form-grid' }, defs.map((d) => cInputs[d.key].el))] : null);
  openModal({ title: student ? tt('Edit student', 'শিক্ষার্থী সম্পাদনা') : tt('Add student', 'শিক্ষার্থী যোগ'), size: 'l', content, actions: [
    { label: t('common.cancel'), onClick: () => true },
    { label: t('common.save'), kind: 'primary', onClick: async () => {
      let ok = true;
      f.nameEn.setError(f.nameEn.value ? null : tt('Required', 'আবশ্যক')); ok &&= Boolean(f.nameEn.value);
      f.roll.setError(/^\d{1,6}$/.test(f.roll.value) ? null : tt('Use a whole number', 'পূর্ণ সংখ্যা লিখুন')); ok &&= /^\d{1,6}$/.test(f.roll.value);
      const custom = readCustom(defs, cInputs); ok &&= !custom.errors.length;
      const pick = choices.read(); ok &&= pick.ok;
      if (!ok) return false;
      try {
        const { saveStudent } = await import('../../data/repositories/students-repository.js');
        const id = await saveStudent(actor(), student?.id ?? null, {
          nameEn: f.nameEn.value, nameBn: f.nameBn.value, fatherName: f.father.value, motherName: f.mother.value, dob: f.dob.value, gender: f.gender.value,
          studentCode: f.code.value || null, admission: student?.admission ?? null,
          current: { ...(student?.current ?? {}), yearId: f.year.value, classId: f.klass.value, groupId: f.group.value || null, roll: f.roll.value, subjectIds: pick.subjectIds, optionalSubjectId: pick.fourth },
          customFields: { ...(student?.customFields ?? {}), ...custom.values },
        });
        toast(tt('Student saved', 'শিক্ষার্থী সংরক্ষিত'), 'success'); onSaved?.(id); return true;
      } catch (e) { (e.code === 'duplicate-roll' ? f.roll : f.nameEn).setError(e.code === 'duplicate-roll' ? e.message : null); toast(friendlyError(e), 'error'); return false; }
    } }] });
}

/**
 * Subject choices for the student's group: compulsory subjects (shown), the subjects the student
 * chooses (exactly the group's "subjects each student chooses"), and the 4th subject.
 * Roles come from Subjects → "Role in each group"; the count from Classes & groups → group rules.
 */
export function subjectChooser({ cats, groupInput, classInput, chosen = [], fourth = null }) {
  const el = h('div', { class: 'chooser' });
  let state = { chosen: [...chosen], fourth };
  const err = h('p', { class: 'field__error', hidden: true });
  const info = () => {
    const g = groupInput.value; const c = classInput.value;
    const group = cats.groups.find((x) => x.id === g);
    const subs = cats.subjects.filter((x) => x.active !== false && (!x.groupIds?.length || x.groupIds.includes(g)) && (!x.classIds?.length || x.classIds.includes(c)));
    const role = (x) => x.groupRoles?.[g] ?? 'compulsory';
    return { g, group, rules: group?.rules ?? {}, compulsory: subs.filter((x) => role(x) === 'compulsory'), choice: subs.filter((x) => role(x) === 'choice'), fourthOnly: subs.filter((x) => role(x) === 'fourth') };
  };
  const paint = () => {
    err.hidden = true;
    const i = info();
    if (!i.g) { el.replaceChildren(h('p', { class: 'muted small' }, tt('Choose the group first.', 'আগে বিভাগ বাছুন।'))); return; }
    state.chosen = state.chosen.filter((id) => i.choice.some((x) => x.id === id));
    const fourthOptions = [...i.choice.filter((x) => !state.chosen.includes(x.id)), ...i.fourthOnly];
    if (state.fourth && !fourthOptions.some((x) => x.id === state.fourth)) state.fourth = null;
    const need = Number(i.rules.choiceCount ?? 0);
    const papers = i.compulsory.length + state.chosen.length + (state.fourth ? 1 : 0);
    const expected = i.rules.examsPerStudent;
    el.replaceChildren(
      h('p', { class: 'small' }, h('strong', {}, tt('Compulsory: ', 'আবশ্যিক: ')), i.compulsory.map((x) => L(x.name)).join(', ') || '—'),
      i.choice.length ? h('fieldset', { class: 'fieldset' }, h('legend', {}, need ? tt('Main subjects — choose {n}', 'মূল বিষয় — {n}টি বাছুন', { n: need }) : tt('Chosen subjects', 'বাছাই করা বিষয়')),
        h('div', { class: 'check-row' }, i.choice.map((x) => h('label', { class: 'check-chip' },
          h('input', { type: 'checkbox', class: 'checkbox', checked: state.chosen.includes(x.id), onchange: (e) => {
            state.chosen = e.target.checked ? [...state.chosen, x.id] : state.chosen.filter((y) => y !== x.id); paint(); } }), h('span', {}, L(x.name)))))) : null,
      fourthOptions.length ? h('label', { class: 'field' }, h('span', { class: 'field__label' }, tt('4th subject', '৪র্থ বিষয়'), i.rules.requiresFourth ? h('span', { class: 'field__req' }, ' *') : null),
        h('select', { class: 'input input--compact', onchange: (e) => { state.fourth = e.target.value || null; paint(); } },
          h('option', { value: '' }, '—'), fourthOptions.map((x) => h('option', { value: x.id, selected: state.fourth === x.id }, L(x.name))))) : null,
      h('p', { class: 'muted small' }, tt('Papers: {n}', 'মোট পত্র: {n}', { n: papers }), expected ? ` / ${expected}` : '',
        expected && papers !== Number(expected) ? h('span', { class: 'badge badge--warn' }, tt('check', 'যাচাই করুন')) : null),
      err);
  };
  groupInput.addEventListener('change', () => { state = { chosen: [], fourth: null }; paint(); });
  classInput.addEventListener('change', paint);
  paint();
  return {
    el,
    /** Validates and returns { ok, subjectIds (chosen + 4th), fourth }. */
    read() {
      const i = info();
      const need = Number(i.rules.choiceCount ?? 0);
      let msg = null;
      if (i.g && need && state.chosen.length !== need) msg = tt('Choose exactly {n} main subject(s).', 'ঠিক {n}টি মূল বিষয় বাছুন।', { n: need });
      else if (i.g && i.rules.requiresFourth && !state.fourth) msg = tt('Choose the 4th subject.', '৪র্থ বিষয় বাছুন।');
      err.textContent = msg ?? ''; err.hidden = !msg;
      return { ok: !msg, subjectIds: [...state.chosen, ...(state.fourth ? [state.fourth] : [])], fourth: state.fourth };
    },
  };
}
