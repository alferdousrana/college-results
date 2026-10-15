/**
 * Create New Result Sheet — five steps: details → subjects → teachers → students → review.
 * Saves as Draft at any point; sharing happens from the review step (or the sheet page).
 * ?sid=… reopens an existing draft.
 */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button } from '../../ui/components/page.js';
import { field, selectField, checkGroup } from '../../ui/components/form.js';
import { loadingState, errorState } from '../../ui/components/states.js';
import { openModal } from '../../ui/components/modal.js';
import { toast } from '../../ui/components/toast.js';
import { navigate } from '../../app/router.js';
import { actor, byId, friendlyError, nameOf } from '../_shared.js';
import { validateForSharing } from '../../domain/session-calc.js';
import { ExamState } from '../../domain/exam-lifecycle.js';
import { shareFlow } from './share-flow.js';

export const title = 'dash.createSheet';
const STEPS = () => [tt('Examination', 'পরীক্ষা'), tt('Subjects', 'বিষয়'), tt('Teachers', 'শিক্ষক'), tt('Students', 'শিক্ষার্থী'), tt('Review', 'যাচাই')];
let unloadGuard = null;

export function dispose() { if (unloadGuard) window.removeEventListener('beforeunload', unloadGuard); unloadGuard = null; }

export function render({ query }) {
  const root = h('section', { class: 'page' }, pageHeader({ title: query.get('sid') ? tt('Edit draft result sheet', 'খসড়া ফলাফল শিট সম্পাদনা') : t('dash.createSheet'), back: { href: '#/admin/sheets', label: t('nav.resultSheets') } }));
  const body = h('div', {}, loadingState());
  root.append(body);
  init(query.get('sid'), body).catch((e) => body.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

async function init(sid, body) {
  const [{ loadAllCatalogues }, { listTeachers }, { listAssignments }, sessions] = await Promise.all([
    import('../../data/repositories/catalogue-repository.js'), import('../../data/repositories/users-repository.js'),
    import('../../data/repositories/assignments-repository.js'), import('../../data/repositories/sessions-repository.js')]);
  const cats = await loadAllCatalogues({ fresh: true });
  const teachers = await listTeachers();
  const tById = byId(teachers);
  const st = { sid, step: 0, dirty: false, details: { yearId: cats.years.find((y) => y.active)?.id ?? cats.years.at(-1)?.id ?? '', classId: '', examDefId: '', titleEn: '', titleBn: '', heldOn: '', startDate: '', endDate: '', notes: '' },
    groupIds: [], groupSubjects: {}, teachers: {}, roster: new Map(), rosterLoadedFor: null };

  if (sid) {
    const b = await sessions.loadSessionBundle(sid);
    if (b.session.state !== ExamState.DRAFT) { navigate(`/admin/sheet?sid=${encodeURIComponent(sid)}`, { replace: true }); return; }
    const s = b.session;
    Object.assign(st.details, { yearId: s.yearId, classId: s.classId, examDefId: s.examDefId, titleEn: s.title?.en ?? '', titleBn: s.title?.bn ?? '', heldOn: s.heldOn ?? '', startDate: s.startDate ?? '', endDate: s.endDate ?? '', notes: s.notes ?? '' });
    st.groupIds = b.sheets.map((x) => x.id);
    b.sheets.forEach((x) => { st.groupSubjects[x.id] = [...(x.subjectIds ?? [])]; });
    b.subjects.forEach((x) => { st.teachers[x.id] = [...(x.teacherIds ?? [])]; });
    b.enrollments.forEach((e) => st.roster.set(e.id, { ...e, studentId: e.studentId ?? e.id, include: true }));
    st.rosterLoadedFor = `${s.yearId}|${s.classId}`;
  }
  unloadGuard = (e) => { if (st.dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', unloadGuard);

  const cls = () => cats.classes.find((c) => c.id === st.details.classId);
  const subjectsFor = (groupId) => cats.subjects.filter((s) => s.active !== false && (!s.classIds?.length || s.classIds.includes(st.details.classId)) && (!s.groupIds?.length || s.groupIds.includes(groupId)));
  const chosenSubjectIds = () => [...new Set(st.groupIds.flatMap((g) => st.groupSubjects[g] ?? []))];
  const stepper = h('ol', { class: 'stepper' });
  const panel = h('div', { class: 'wizard-panel card' });
  const footer = h('div', { class: 'wizard-foot' });
  body.replaceChildren(stepper, panel, footer);

  function paintStepper() {
    stepper.replaceChildren(...STEPS().map((label, i) => h('li', { class: `stepper__step ${i < st.step ? 'is-done' : ''} ${i === st.step ? 'is-current' : ''}`, 'aria-current': i === st.step ? 'step' : null },
      h('button', { type: 'button', class: 'stepper__btn', disabled: i > st.step, onclick: () => go(i) }, h('span', { class: 'stepper__num' }, String(i + 1)), h('span', {}, label)))));
  }
  function go(i) { st.step = i; paint(); window.scrollTo({ top: 0 }); }
  const markDirty = () => { st.dirty = true; };

  function paint() {
    paintStepper();
    panel.replaceChildren([stepDetails, stepSubjects, stepTeachers, stepStudents, stepReview][st.step]());
    footer.replaceChildren(
      st.step > 0 ? button(t('common.back'), { onClick: () => go(st.step - 1) }) : h('span'),
      h('div', { class: 'row-actions' },
        st.details.yearId && st.details.classId && st.details.examDefId ? button(tt('Save draft', 'খসড়া সংরক্ষণ'), { onClick: () => save() }) : null,
        st.step < 4 ? button(tt('Continue', 'পরবর্তী'), { kind: 'primary', onClick: () => { if (validateStep()) go(st.step + 1); } }) : null));
  }

  function validateStep() {
    if (st.step === 0) {
      const d = st.details;
      if (!d.yearId || !d.classId || !d.examDefId) { toast(tt('Choose the year, class and examination.', 'বছর, শ্রেণি ও পরীক্ষা বাছুন।'), 'error'); return false; }
      if (!st.groupIds.length) { toast(tt('Choose at least one group.', 'অন্তত একটি বিভাগ বাছুন।'), 'error'); return false; }
    }
    if (st.step === 1 && st.groupIds.some((g) => !(st.groupSubjects[g] ?? []).length)) { toast(tt('Every group needs at least one subject.', 'প্রতিটি বিভাগে অন্তত একটি বিষয় দরকার।'), 'error'); return false; }
    if (st.step === 2) {
      const missing = chosenSubjectIds().filter((s) => !(st.teachers[s] ?? []).length);
      if (missing.length) toast(tt('{n} subject(s) have no teacher yet. You can save the draft, but sharing needs a teacher for every subject.', '{n}টি বিষয়ে এখনো শিক্ষক নেই। খসড়া রাখা যাবে, তবে শেয়ার করতে সব বিষয়ে শিক্ষক লাগবে।', { n: missing.length }), 'info');
    }
    return true;
  }

  function stepDetails() {
    const d = st.details;
    const year = selectField({ label: tt('Academic year', 'শিক্ষাবর্ষ'), name: 'year', required: true, value: d.yearId, options: [{ value: '', label: '—' }, ...cats.years.map((y) => ({ value: y.id, label: y.label }))] });
    const klass = selectField({ label: tt('Class', 'শ্রেণি'), name: 'class', required: true, value: d.classId, options: [{ value: '', label: '—' }, ...cats.classes.filter((c) => c.active !== false).map((c) => ({ value: c.id, label: L(c.name) }))] });
    const exam = selectField({ label: tt('Examination name', 'পরীক্ষার নাম'), name: 'exam', required: true, value: d.examDefId, options: [{ value: '', label: '—' }, ...cats.examDefs.filter((e) => e.active !== false).map((e) => ({ value: e.id, label: L(e.name) }))] });
    const titleEn = field({ label: tt('Title (English)', 'শিরোনাম (ইংরেজি)'), name: 'titleEn', value: d.titleEn, hint: tt('Printed on marksheets. Filled in automatically; you can change it.', 'মার্কশিটে ছাপা হবে। স্বয়ংক্রিয়ভাবে বসে; বদলানো যায়।') });
    const titleBn = field({ label: tt('Title (Bangla)', 'শিরোনাম (বাংলা)'), name: 'titleBn', value: d.titleBn });
    const heldOn = field({ label: tt('Exam held (as printed)', 'পরীক্ষার সময় (যেভাবে ছাপা হবে)'), name: 'heldOn', value: d.heldOn, hint: tt('For example: Dec-2026', 'যেমন: ডিসেম্বর-২০২৬') });
    const start = field({ label: tt('First exam day', 'পরীক্ষা শুরুর দিন'), name: 'start', type: 'date', value: d.startDate });
    const end = field({ label: tt('Last exam day', 'পরীক্ষা শেষের দিন'), name: 'end', type: 'date', value: d.endDate });
    const notes = field({ label: tt('Internal notes', 'অভ্যন্তরীণ নোট'), name: 'notes', type: 'textarea', value: d.notes });
    const groupsBox = h('div');
    const paintGroups = () => {
      const c = cats.classes.find((x) => x.id === klass.input.value);
      const options = cats.groups.filter((g) => g.active !== false && (!c?.groupIds?.length || c.groupIds.includes(g.id))).map((g) => ({ value: g.id, label: L(g.name) }));
      const cg = checkGroup({ label: tt('Groups in this examination', 'এই পরীক্ষার বিভাগ'), name: 'groups', options, values: st.groupIds });
      cg.el.addEventListener('change', () => { st.groupIds = cg.value; markDirty(); });
      groupsBox.replaceChildren(options.length ? cg.el : h('p', { class: 'muted' }, tt('This class has no groups. Add groups in Classes & groups.', 'এই শ্রেণির কোনো বিভাগ নেই। শ্রেণি ও বিভাগে যোগ করুন।')));
    };
    const autoTitle = () => {
      const e = cats.examDefs.find((x) => x.id === exam.input.value); const y = cats.years.find((x) => x.id === year.input.value);
      if (e && y) { if (!d.titleEn || d.autoTitle) { titleEn.input.value = `${L(e.name, 'en')} ${y.label}`; titleBn.input.value = `${L(e.name, 'bn')} ${y.label.replace(/\d/g, (x) => '০১২৩৪৫৬৭৮৯'[x])}`; d.autoTitle = true; } }
    };
    const sync = () => { Object.assign(d, { yearId: year.input.value, classId: klass.input.value, examDefId: exam.input.value, titleEn: titleEn.value, titleBn: titleBn.value, heldOn: heldOn.value, startDate: start.value, endDate: end.value, notes: notes.value }); markDirty(); };
    const locked = Boolean(st.sid);
    [year, klass, exam].forEach((f) => { f.input.disabled = locked; f.input.addEventListener('change', () => { autoTitle(); sync(); if (f === klass) { st.groupIds = []; paintGroups(); } }); });
    [titleEn, titleBn].forEach((f) => f.input.addEventListener('input', () => { d.autoTitle = false; sync(); }));
    [heldOn, start, end, notes].forEach((f) => f.input.addEventListener('input', sync));
    paintGroups();
    return h('div', { class: 'form-grid' }, year.el, klass.el, exam.el, locked ? h('p', { class: 'muted span-all' }, tt('Year, class and examination cannot change after the draft is created.', 'খসড়া তৈরির পর বছর, শ্রেণি ও পরীক্ষা বদলানো যায় না।')) : null,
      titleEn.el, titleBn.el, heldOn.el, start.el, end.el, h('div', { class: 'span-all' }, groupsBox), h('div', { class: 'span-all' }, notes.el));
  }

  function compSummary(s) {
    return (s.components ?? []).filter((c) => c.enabled !== false).map((c) => `${c.label} ${c.maxMarks}${c.passMarks != null ? ` (${tt('pass', 'পাস')} ${c.passMarks})` : ''}`).join(' · ');
  }

  function stepSubjects() {
    return h('div', {}, st.groupIds.map((g) => {
      const options = subjectsFor(g);
      if (!st.groupSubjects[g]) st.groupSubjects[g] = options.map((s) => s.id);
      return h('fieldset', { class: 'fieldset subject-pick' }, h('legend', {}, nameOf(cats.groups, g)),
        options.length ? options.map((s) => {
          const cb = h('input', { type: 'checkbox', class: 'checkbox', checked: st.groupSubjects[g].includes(s.id), onchange: (e) => {
            st.groupSubjects[g] = e.target.checked ? [...new Set([...st.groupSubjects[g], s.id])] : st.groupSubjects[g].filter((x) => x !== s.id); markDirty(); } });
          return h('label', { class: 'subject-option' }, cb, h('span', {}, h('strong', {}, L(s.name)), s.code ? ` (${s.code})` : '', h('small', { class: 'muted' }, compSummary(s))));
        }) : h('p', { class: 'muted' }, tt('No active subjects for this class and group. Add them in Subjects.', 'এই শ্রেণি ও বিভাগের কোনো সক্রিয় বিষয় নেই। বিষয় পৃষ্ঠায় যোগ করুন।')));
    }));
  }

  function stepTeachers() {
    const box = h('div', {}, loadingState());
    listAssignments({ classId: st.details.classId }).then((assign) => {
      const active = teachers.filter((x) => x.status === 'active');
      box.replaceChildren(h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, tt('Subject', 'বিষয়')), h('th', {}, tt('Components', 'অংশ')), h('th', {}, tt('Teacher(s)', 'শিক্ষক')))),
        h('tbody', {}, chosenSubjectIds().map((sid2) => {
          const s = cats.subjects.find((x) => x.id === sid2);
          if (!st.teachers[sid2]) st.teachers[sid2] = assign.filter((a) => a.subjectId === sid2 && tById[a.teacherId]?.status === 'active').map((a) => a.teacherId);
          const sel = h('select', { class: 'input', multiple: true, size: Math.min(4, Math.max(2, active.length)), 'aria-label': tt('Teachers for {x}', '{x}-এর শিক্ষক', { x: L(s?.name) }),
            onchange: (e) => { st.teachers[sid2] = [...e.target.selectedOptions].map((o) => o.value); markDirty(); warn.hidden = st.teachers[sid2].length > 0; } },
            active.map((x) => h('option', { value: x.id, selected: st.teachers[sid2].includes(x.id) }, x.displayName)));
          const warn = h('p', { class: 'field__error', hidden: st.teachers[sid2].length > 0 }, tt('No teacher assigned', 'শিক্ষক নির্ধারিত নয়'));
          return h('tr', {}, h('td', {}, L(s?.name)), h('td', { class: 'muted' }, compSummary(s ?? {})), h('td', {}, sel, warn));
        }))), h('p', { class: 'muted' }, tt('Hold Ctrl (or ⌘) to choose more than one teacher. Only approved teachers are listed. Defaults come from Assignments.', 'একাধিক শিক্ষক বাছতে Ctrl (বা ⌘) চেপে ধরুন। শুধু অনুমোদিত শিক্ষক দেখানো হয়। প্রাথমিক মান দায়িত্ব বণ্টন থেকে আসে।')));
    });
    return box;
  }

  function stepStudents() {
    const box = h('div', {}, loadingState());
    const key = `${st.details.yearId}|${st.details.classId}`;
    const load = async (force = false) => {
      if (force || st.rosterLoadedFor !== key) {
        const { listClassRoster } = await import('../../data/repositories/students-repository.js');
        const list = await listClassRoster(st.details.yearId, st.details.classId);
        for (const s of list) if (!st.roster.has(s.id)) st.roster.set(s.id, { studentId: s.id, include: true, roll: s.current.roll, name: { en: s.nameEn, bn: s.nameBn }, groupId: s.current.groupId, optionalSubjectId: s.current.optionalSubjectId ?? null, subjectIds: s.current.subjectIds ?? null, section: s.current.section, shift: s.current.shift });
        st.rosterLoadedFor = key;
      }
      paintRoster();
    };
    const paintRoster = () => {
      const rows = [...st.roster.values()].sort((a, b) => Number(a.roll) - Number(b.roll));
      const dup = new Set(); const seen = new Set();
      rows.filter((r) => r.include).forEach((r) => { if (seen.has(r.roll)) dup.add(r.roll); seen.add(r.roll); });
      const groupOpts = st.groupIds.map((g) => ({ value: g, label: nameOf(cats.groups, g) }));
      box.replaceChildren(
        h('div', { class: 'table-toolbar' },
          h('p', { class: 'muted' }, tt('{n} students included. Students already in this class are loaded automatically.', '{n} জন শিক্ষার্থী অন্তর্ভুক্ত। এই শ্রেণির বিদ্যমান শিক্ষার্থীরা স্বয়ংক্রিয়ভাবে এসেছে।', { n: rows.filter((r) => r.include).length })),
          h('div', { class: 'table-toolbar__end' },
            button(tt('Reload class students', 'শ্রেণির শিক্ষার্থী আবার আনুন'), { size: 'sm', onClick: () => load(true) }),
            button(tt('Add student', 'শিক্ষার্থী যোগ'), { size: 'sm', icon: 'plus', onClick: () => quickAdd() }),
            h('a', { class: 'btn btn--ghost btn--sm', href: `#/admin/students/import?year=${encodeURIComponent(st.details.yearId)}&class=${encodeURIComponent(st.details.classId)}`, onclick: (e) => { if (st.dirty && !confirm(tt('Save the draft first? Unsaved changes in this wizard will be lost.', 'আগে খসড়া সংরক্ষণ করবেন? এই ধাপের অসংরক্ষিত পরিবর্তন হারাবে।'))) e.preventDefault(); } }, tt('Import JSON', 'JSON ইমপোর্ট')))),
        rows.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'data-table roster' },
          h('thead', {}, h('tr', {}, h('th', {}, tt('Include', 'অন্তর্ভুক্ত')), h('th', {}, tt('Roll', 'রোল')), h('th', {}, tt('Name', 'নাম')), h('th', {}, tt('Group', 'বিভাগ')), h('th', {}, tt('Optional subject', 'ঐচ্ছিক বিষয়')), h('th', {}, tt('Subjects', 'বিষয়')))),
          h('tbody', {}, rows.map((r) => {
            const groupSubs = st.groupSubjects[r.groupId] ?? [];
            const opt = h('select', { class: 'input input--sm', 'aria-label': tt('Optional subject', 'ঐচ্ছিক বিষয়'), onchange: (e) => { r.optionalSubjectId = e.target.value || null; markDirty(); } },
              h('option', { value: '' }, '—'), groupSubs.map((id) => h('option', { value: id, selected: r.optionalSubjectId === id }, nameOf(cats.subjects, id))));
            return h('tr', { class: dup.has(r.roll) && r.include ? 'is-error' : '' },
              h('td', {}, h('input', { type: 'checkbox', class: 'checkbox', checked: r.include, 'aria-label': tt('Include roll {r}', 'রোল {r} অন্তর্ভুক্ত', { r: r.roll }), onchange: (e) => { r.include = e.target.checked; markDirty(); paintRoster(); } })),
              h('td', {}, r.roll, dup.has(r.roll) && r.include ? h('span', { class: 'badge badge--bad' }, tt('duplicate', 'পুনরাবৃত্ত')) : null),
              h('td', {}, L(r.name)),
              h('td', {}, h('select', { class: 'input input--sm', 'aria-label': tt('Group', 'বিভাগ'), onchange: (e) => { r.groupId = e.target.value; r.optionalSubjectId = null; markDirty(); paintRoster(); } },
                h('option', { value: '' }, '—'), groupOpts.map((o) => h('option', { value: o.value, selected: r.groupId === o.value }, o.label)))),
              h('td', {}, opt),
              h('td', {}, button(r.subjectIds?.length ? tt('{n} chosen', '{n}টি বাছা', { n: r.subjectIds.length }) : tt('All group subjects', 'বিভাগের সব বিষয়'), { size: 'sm', onClick: () => pickSubjects(r) })));
          })))) : h('p', { class: 'muted' }, tt('No students in this class yet. Add them or import a JSON file.', 'এই শ্রেণিতে এখনো শিক্ষার্থী নেই। যোগ করুন বা JSON ফাইল ইমপোর্ট করুন।')));
    };
    const pickSubjects = (r) => {
      const all = st.groupSubjects[r.groupId] ?? [];
      const cg = checkGroup({ label: tt('Subjects this student sits', 'শিক্ষার্থীর বিষয়সমূহ'), name: 'stsubs', options: all.map((id) => ({ value: id, label: nameOf(cats.subjects, id) })), values: r.subjectIds?.length ? r.subjectIds : all });
      openModal({ title: tt('Subjects for roll {r}', 'রোল {r}-এর বিষয়', { r: r.roll }), content: cg.el, actions: [
        { label: t('common.cancel'), onClick: () => true },
        { label: t('common.save'), kind: 'primary', onClick: () => { const v = cg.value; r.subjectIds = v.length === all.length ? null : v; markDirty(); paintRoster(); return true; } }] });
    };
    const quickAdd = () => {
      const f = { en: field({ label: tt('Name (English)', 'নাম (ইংরেজি)'), name: 'qen', required: true }), bn: field({ label: tt('Name (Bangla)', 'নাম (বাংলা)'), name: 'qbn' }),
        roll: field({ label: tt('Roll', 'রোল'), name: 'qroll', required: true, inputmode: 'numeric' }),
        group: selectField({ label: tt('Group', 'বিভাগ'), name: 'qg', options: st.groupIds.map((g) => ({ value: g, label: nameOf(cats.groups, g) })) }),
        father: field({ label: tt("Father's name", 'পিতার নাম'), name: 'qf' }), mother: field({ label: tt("Mother's name", 'মাতার নাম'), name: 'qm' }) };
      openModal({ title: tt('Add student', 'শিক্ষার্থী যোগ'), content: h('div', { class: 'form-grid' }, Object.values(f).map((x) => x.el)), actions: [
        { label: t('common.cancel'), onClick: () => true },
        { label: tt('Add student', 'শিক্ষার্থী যোগ'), kind: 'primary', onClick: async () => {
          if (!f.en.value || !/^\d{1,6}$/.test(f.roll.value)) { f.en.setError(f.en.value ? null : tt('Required', 'আবশ্যক')); f.roll.setError(tt('Use a number', 'সংখ্যা লিখুন')); return false; }
          try {
            const { saveStudent } = await import('../../data/repositories/students-repository.js');
            const id = await saveStudent(actor(), null, { nameEn: f.en.value, nameBn: f.bn.value, fatherName: f.father.value, motherName: f.mother.value, current: { yearId: st.details.yearId, classId: st.details.classId, groupId: f.group.value, roll: f.roll.value } });
            st.roster.set(id, { studentId: id, include: true, roll: f.roll.value, name: { en: f.en.value, bn: f.bn.value || null }, groupId: f.group.value, optionalSubjectId: null, subjectIds: null });
            markDirty(); paintRoster(); toast(tt('Student added', 'শিক্ষার্থী যোগ হয়েছে'), 'success'); return true;
          } catch (e) { toast(friendlyError(e), 'error'); return false; }
        } }] });
    };
    load().catch((e) => box.replaceChildren(errorState({ message: friendlyError(e) })));
    return box;
  }

  function buildPayload() {
    const d = st.details;
    const subjectIds = chosenSubjectIds();
    return {
      yearId: d.yearId, classId: d.classId, examDefId: d.examDefId,
      title: { en: d.titleEn || `${nameOf(cats.examDefs, d.examDefId)} ${d.yearId}`, bn: d.titleBn || null },
      heldOn: d.heldOn || null, startDate: d.startDate || null, endDate: d.endDate || null, notes: d.notes || null,
      groups: st.groupIds.map((g) => ({ groupId: g, subjectIds: (st.groupSubjects[g] ?? []).filter((x) => subjectsFor(g).some((s) => s.id === x)) })),
      subjects: subjectIds.map((id) => {
        const s = cats.subjects.find((x) => x.id === id);
        return { subjectId: id, definition: { name: s.name, code: s.code ?? null, order: s.order ?? null, components: s.components ?? [], passMarks: s.passMarks ?? null, countsTowardGpa: s.countsTowardGpa !== false, countsTowardTotal: s.countsTowardTotal !== false },
          teacherIds: st.teachers[id] ?? [], teacherNames: Object.fromEntries((st.teachers[id] ?? []).map((x) => [x, tById[x]?.displayName ?? x])) };
      }),
      roster: [...st.roster.values()].filter((r) => r.include && st.groupIds.includes(r.groupId)),
    };
  }

  function stepReview() {
    const p = buildPayload();
    const pseudo = { sheets: p.groups.map((g) => ({ id: g.groupId, subjectIds: g.subjectIds })), subjects: p.subjects.map((s) => ({ id: s.subjectId, definition: s.definition, teacherIds: s.teacherIds })),
      enrollments: p.roster.map((r) => ({ ...r, id: r.studentId })) };
    const check = validateForSharing(pseudo, tById);
    const excluded = [...st.roster.values()].filter((r) => r.include && !st.groupIds.includes(r.groupId)).length;
    return h('div', {},
      h('h2', {}, p.title.en),
      h('p', {}, `${nameOf(cats.classes, p.classId)} · ${p.yearId} · ${nameOf(cats.examDefs, p.examDefId)}${p.heldOn ? ` · ${p.heldOn}` : ''}`),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(p.groups.length)), h('span', { class: 'stat__label' }, tt('Groups', 'বিভাগ'))),
        h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(p.subjects.length)), h('span', { class: 'stat__label' }, tt('Subjects', 'বিষয়'))),
        h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(p.roster.length)), h('span', { class: 'stat__label' }, tt('Students', 'শিক্ষার্থী'))),
        h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(check.summary.teachers)), h('span', { class: 'stat__label' }, tt('Teachers', 'শিক্ষক')))),
      excluded ? h('p', { class: 'notice notice--locked' }, tt('{n} selected student(s) have no group in this examination and will be left out.', '{n} জন বাছাই করা শিক্ষার্থীর এই পরীক্ষায় কোনো বিভাগ নেই, তারা বাদ যাবে।', { n: excluded })) : null,
      check.errors.length ? h('div', { class: 'notice notice--bad' }, h('p', { class: 'notice__title' }, tt('Needed before sharing', 'শেয়ারের আগে দরকার')), h('ul', {}, check.errors.map((e) => h('li', {}, e.message)))) : h('p', { class: 'notice' }, tt('Everything needed for sharing is in place.', 'শেয়ারের জন্য সব প্রস্তুত।')),
      check.warnings.length ? h('div', { class: 'notice notice--locked' }, h('ul', {}, check.warnings.map((e) => h('li', {}, e.message)))) : null,
      h('div', { class: 'row-actions' },
        button(tt('Save draft', 'খসড়া সংরক্ষণ'), { onClick: () => save() }),
        button(tt('Save and share with all teachers', 'সংরক্ষণ করে সব শিক্ষকের সাথে শেয়ার করুন'), { kind: 'primary', disabled: check.errors.length > 0, onClick: async () => { const id = await save(); if (id) shareFlow(id, () => navigate(`/admin/sheet?sid=${encodeURIComponent(id)}`)); } })));
  }

  async function save() {
    try {
      const id = await sessions.saveDraft(actor(), st.sid, buildPayload());
      st.dirty = false;
      if (!st.sid) { st.sid = id; history.replaceState(null, '', `#/admin/sheet/new?sid=${encodeURIComponent(id)}`); }
      toast(tt('Draft saved', 'খসড়া সংরক্ষিত'), 'success');
      paint();
      return id;
    } catch (e) { toast(friendlyError(e), 'error'); return null; }
  }

  paint();
}
