/**
 * Bulk JSON import: template → choose file → validate → preview with row errors →
 * choose update/skip for matching students → import in batches with progress → report.
 */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button } from '../../ui/components/page.js';
import { selectField } from '../../ui/components/form.js';
import { loadingState, errorState } from '../../ui/components/states.js';
import { toast } from '../../ui/components/toast.js';
import { actor, friendlyError } from '../_shared.js';
import { parseImportText, validateStudentImport } from '../../domain/validation/student-import.js';
import { download } from '../../ui/format.js';
import { featureGate } from '../../ui/components/feature-gate.js';

export const title = 'nav.students';

export const IMPORT_TEMPLATE = {
  students: [
    { roll: 101, name: 'Student Name', nameBn: 'শিক্ষার্থীর নাম', groupId: 'science', fatherName: "Father's name", motherName: "Mother's name",
      dob: '2009-05-14', section: 'A', shift: 'Day', optionalSubjectId: 'biology', studentCode: '', admissionNumber: '', admissionDate: '', customFields: {} },
  ],
};

export function render({ query }) {
  const root = h('section', { class: 'page' }, pageHeader({ title: tt('Import students from JSON', 'JSON থেকে শিক্ষার্থী ইমপোর্ট'), back: { href: '#/admin/students', label: t('nav.students') } }));
  const body = h('div', {}, loadingState());
  root.append(featureGate('json_student_import', () => body));
  init(body, query).catch((e) => body.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

async function init(body, query) {
  const [{ loadAllCatalogues }, { getSetting }, repo] = await Promise.all([import('../../data/repositories/catalogue-repository.js'), import('../../data/repositories/settings-repository.js'), import('../../data/repositories/students-repository.js')]);
  const cats = await loadAllCatalogues();
  const fieldDefs = ((await getSetting('studentFields')).fields ?? []).filter((d) => d.enabled !== false);
  const yearF = selectField({ label: tt('Import into year', 'যে বছরে ইমপোর্ট'), name: 'iy', value: query.get('year') ?? cats.years.find((y) => y.active)?.id, options: cats.years.map((y) => ({ value: y.id, label: y.label })) });
  const classF = selectField({ label: tt('Class', 'শ্রেণি'), name: 'ic', value: query.get('class') ?? '', options: cats.classes.map((c) => ({ value: c.id, label: L(c.name) })) });
  const modeF = selectField({ label: tt('When a student already exists', 'শিক্ষার্থী আগে থেকে থাকলে'), name: 'im', value: 'skip', options: [{ value: 'skip', label: tt('Skip them (keep current data)', 'বাদ দিন (বর্তমান তথ্য রাখুন)') }, { value: 'update', label: tt('Update them with the file', 'ফাইলের তথ্য দিয়ে হালনাগাদ করুন') }],
    hint: tt('Matching uses the student ID when the file has one, otherwise the roll in this class and year.', 'ফাইলে আইডি থাকলে আইডি দিয়ে, না থাকলে এই শ্রেণি ও বছরের রোল দিয়ে মেলানো হয়।') });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', class: 'input', 'aria-label': tt('JSON file', 'JSON ফাইল') });
  const out = h('div', { class: 'import-out' });
  let plan = null;

  fileInput.addEventListener('change', async () => {
    plan = null; out.replaceChildren(loadingState(tt('Checking the file…', 'ফাইল যাচাই হচ্ছে…')));
    const file = fileInput.files[0]; if (!file) { out.replaceChildren(); return; }
    const parsed = parseImportText(await file.text());
    if (!parsed.ok) { out.replaceChildren(errorState({ message: parsed.error })); return; }
    const klass = cats.classes.find((c) => c.id === classF.value);
    const groupIds = new Set(klass?.groupIds?.length ? klass.groupIds : cats.groups.map((g) => g.id));
    const { valid, errors } = validateStudentImport(parsed.list, { groupIds, customFieldDefs: fieldDefs, requireGroup: groupIds.size > 0, allowExisting: true });
    if (errors.length) {
      out.replaceChildren(h('div', { class: 'notice notice--bad' }, h('p', { class: 'notice__title' }, tt('{n} problem(s) found. Nothing has been imported.', '{n}টি সমস্যা পাওয়া গেছে। কিছুই ইমপোর্ট হয়নি।', { n: errors.length })),
        h('p', {}, tt('Fix the file and choose it again.', 'ফাইল ঠিক করে আবার বাছুন।'))),
        h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, tt('Row', 'সারি')), h('th', {}, tt('Field', 'ঘর')), h('th', {}, tt('Problem', 'সমস্যা')))),
          h('tbody', {}, errors.slice(0, 500).map((e) => h('tr', {}, h('td', {}, e.row ?? '—'), h('td', {}, e.field ?? '—'), h('td', {}, e.message)))))));
      return;
    }
    plan = await repo.planImport(valid, { yearId: yearF.value, classId: classF.value, mode: modeF.value });
    paintPlan();
  });

  function paintPlan() {
    const c = { create: 0, update: 0, skip: 0, error: 0 };
    plan.forEach((p) => c[p.action]++);
    const label = { create: tt('New', 'নতুন'), update: tt('Update', 'হালনাগাদ'), skip: tt('Skip', 'বাদ'), error: tt('Error', 'ত্রুটি') };
    out.replaceChildren(
      h('div', { class: 'stats' }, Object.entries(c).map(([k, v]) => h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(v)), h('span', { class: 'stat__label' }, label[k])))),
      c.error ? h('p', { class: 'notice notice--bad' }, tt('Rows marked Error will not be imported.', '"ত্রুটি" চিহ্নিত সারি ইমপোর্ট হবে না।')) : null,
      h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' }, h('thead', {}, h('tr', {}, h('th', {}, tt('Roll', 'রোল')), h('th', {}, tt('Name', 'নাম')), h('th', {}, tt('Group', 'বিভাগ')), h('th', {}, tt('Action', 'কাজ')), h('th', {}, tt('Note', 'নোট')))),
        h('tbody', {}, plan.map((p) => h('tr', { class: p.action === 'error' ? 'is-error' : '' }, h('td', {}, p.row.roll), h('td', {}, p.row.name), h('td', {}, p.row.groupId ?? ''), h('td', {}, label[p.action]),
          h('td', { class: 'muted' }, p.reason ?? (p.existing ? `${p.existing.nameEn} → ${p.row.name}` : ''))))))),
      h('div', { class: 'row-actions' }, button(tt('Import {n} student(s)', '{n} জন শিক্ষার্থী ইমপোর্ট করুন', { n: c.create + c.update }), { kind: 'primary', disabled: !(c.create + c.update), onClick: execute })));
  }

  async function execute() {
    const bar = h('progress', { max: 1, value: 0 });
    out.replaceChildren(h('p', {}, tt('Importing…', 'ইমপোর্ট হচ্ছে…')), bar);
    try {
      const report = await repo.executeImport(actor(), plan, { yearId: yearF.value, classId: classF.value }, (d, total) => { bar.max = total || 1; bar.value = d; });
      out.replaceChildren(h('div', { class: report.failed.length ? 'notice notice--bad' : 'notice' },
        h('p', { class: 'notice__title' }, tt('Import finished', 'ইমপোর্ট শেষ')),
        h('p', {}, tt('Created {a} · Updated {b} · Skipped {c} · Failed {d}', 'নতুন {a} · হালনাগাদ {b} · বাদ {c} · ব্যর্থ {d}', { a: report.created, b: report.updated, c: report.skipped, d: report.failed.length })),
        report.failed.length ? h('ul', {}, report.failed.map((f) => h('li', {}, `${tt('Roll', 'রোল')} ${f.roll}: ${f.message}`))) : null),
        h('div', { class: 'row-actions' }, h('a', { class: 'btn btn--ghost', href: '#/admin/students' }, tt('Open students', 'শিক্ষার্থী দেখুন')),
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => history.back() }, tt('Back to previous page', 'আগের পৃষ্ঠায় ফিরুন'))));
      toast(tt('Import finished', 'ইমপোর্ট শেষ'), report.failed.length ? 'error' : 'success');
    } catch (e) { out.replaceChildren(errorState({ message: friendlyError(e) })); }
  }

  body.replaceChildren(
    h('div', { class: 'card' },
      h('ol', { class: 'steps-text' },
        h('li', {}, tt('Download the template and fill one entry per student. Required: roll, name and (for classes with groups) groupId.', 'টেমপ্লেট নামিয়ে প্রতি শিক্ষার্থীর জন্য একটি করে তথ্য দিন। আবশ্যক: রোল, নাম এবং (বিভাগ থাকলে) groupId।'),
          ' ', button(tt('Download template', 'টেমপ্লেট নামান'), { size: 'sm', icon: 'download', onClick: () => download('students-template.json', JSON.stringify({ ...IMPORT_TEMPLATE, _groups: cats.groups.map((g) => g.id), _optionalSubjects: cats.subjects.filter((s) => s.optionalEligible).map((s) => s.id), _customFields: fieldDefs.map((d) => d.key) }, null, 2)) })),
        h('li', {}, tt('Choose where to import and what to do with students who already exist.', 'কোথায় ইমপোর্ট হবে এবং বিদ্যমান শিক্ষার্থীদের কী হবে তা বাছুন।')),
        h('li', {}, tt('Choose the file. Nothing is saved until you confirm the preview.', 'ফাইল বাছুন। প্রাকদর্শন নিশ্চিত না করা পর্যন্ত কিছুই সংরক্ষিত হবে না।'))),
      h('div', { class: 'form-grid' }, yearF.el, classF.el, modeF.el, h('div', { class: 'field' }, h('span', { class: 'field__label' }, tt('JSON file', 'JSON ফাইল')), fileInput))),
    out);
  [yearF, classF, modeF].forEach((f) => f.input.addEventListener('change', () => { if (fileInput.files[0]) fileInput.dispatchEvent(new Event('change')); }));
}
