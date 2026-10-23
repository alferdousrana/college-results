/** Student records: class-scoped list with server pagination, add/edit, status changes and history. */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button, linkButton, keyValue } from '../../ui/components/page.js';
import { loadingState, errorState } from '../../ui/components/states.js';
import { dataTable } from '../../ui/components/data-table.js';
import { openModal, promptText } from '../../ui/components/modal.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { selectField } from '../../ui/components/form.js';
import { actor, friendlyError, nameOf, run } from '../_shared.js';
import { openStudentForm } from './student-form.js';
import { fmtDate, fmtNum } from '../../ui/format.js';

export const title = 'nav.students';
const prefKey = 'crms.students.filter';

export function render({ query }) {
  const root = h('section', { class: 'page' }, loadingState());
  init(root, query).catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

async function init(root, query) {
  const [repo, { loadAllCatalogues }, { getSetting }] = await Promise.all([import('../../data/repositories/students-repository.js'), import('../../data/repositories/catalogue-repository.js'), import('../../data/repositories/settings-repository.js')]);
  const cats = await loadAllCatalogues();
  const fieldDefs = (await getSetting('studentFields')).fields ?? [];
  const saved = JSON.parse(sessionStorage.getItem(prefKey) || '{}');
  const sel = { yearId: saved.yearId ?? cats.years.find((y) => y.active)?.id ?? cats.years.at(-1)?.id, classId: saved.classId ?? cats.classes[0]?.id, status: saved.status ?? 'active' };
  const yearF = selectField({ label: tt('Session', 'সেশন'), name: 'sy', value: sel.yearId, options: cats.years.map((y) => ({ value: y.id, label: y.label })) });
  const classF = selectField({ label: tt('Class', 'শ্রেণি'), name: 'sc', value: sel.classId, options: cats.classes.map((c) => ({ value: c.id, label: L(c.name) })) });
  const statusF = selectField({ label: tt('Status', 'অবস্থা'), name: 'ss', value: sel.status, options: [['active', tt('Active', 'সক্রিয়')], ['inactive', tt('Inactive', 'নিষ্ক্রিয়')], ['transferred', tt('Transferred', 'বদলি')], ['left', tt('Left', 'চলে গেছে')], ['graduated', tt('Graduated', 'উত্তীর্ণ হয়ে গেছে')], ['', tt('All', 'সব')]].map(([value, label]) => ({ value, label })) });
  let cursor = null;
  const table = dataTable({ rows: [], pageSize: 50, searchKeys: ['nameEn', 'nameBn', (r) => r.current?.roll, 'studentCode'],
    filters: [{ key: 'group', label: tt('Group', 'বিভাগ'), get: (r) => r.current?.groupId ?? '', options: cats.groups.map((g) => ({ value: g.id, label: L(g.name) })) }],
    empty: tt('No students in this class and year. Add students or import a JSON file.', 'এই শ্রেণি ও বছরে কোনো শিক্ষার্থী নেই। যোগ করুন বা JSON ফাইল ইমপোর্ট করুন।'),
    onLoadMore: async () => { const page = await repo.listStudents({ ...sel, status: sel.status || null, limit: 100, after: cursor }); cursor = page.cursor; table.appendRows(page.items, { hasMore: Boolean(cursor) }); return { hasMore: Boolean(cursor) }; },
    columns: [
      { key: 'roll', label: tt('Roll', 'রোল'), sort: (r) => Number(r.current?.roll), render: (r) => fmtNum(r.current?.roll) },
      { key: 'nameEn', label: tt('Name', 'নাম'), sortable: true, render: (r) => h('div', {}, h('button', { class: 'name-link', type: 'button', onclick: () => details(r) }, r.nameEn), r.nameBn ? h('div', { class: 'muted small' }, r.nameBn) : null) },
      { key: 'group', label: tt('Group', 'বিভাগ'), render: (r) => nameOf(cats.groups, r.current?.groupId) },
      { key: 'studentCode', label: tt('Student ID', 'আইডি') },
      { key: 'status', label: tt('Status', 'অবস্থা'), render: (r) => h('span', { class: `badge badge--${r.status === 'active' ? 'good' : 'neutral'}` }, r.status) },
      { key: 'a', label: '', render: (r) => h('div', { class: 'row-actions' }, button(tt('Edit', 'সম্পাদনা'), { size: 'sm', onClick: () => openStudentForm({ student: r, cats, fieldDefs, onSaved: reload }) }), statusMenu(r),
        button(tt('Delete', 'মুছুন'), { size: 'sm', kind: 'danger-ghost', onClick: async () => {
          if (!(await confirmDialog({ title: tt('Delete {n}?', '{n}-কে মুছবেন?', { n: r.nameEn }), body: tt('Only possible if the student is in no result sheet. Otherwise mark them inactive.', 'শিক্ষার্থী কোনো ফলাফল শিটে না থাকলেই মোছা যাবে। নইলে নিষ্ক্রিয় করুন।'), danger: true, confirmText: tt('Delete', 'মুছুন') }))) return;
          const { deleteStudent } = await import('../../data/repositories/deletion-repository.js');
          if (await run(() => deleteStudent(actor(), r.id), { success: tt('Student deleted', 'শিক্ষার্থী মুছে ফেলা হয়েছে') }) !== undefined) reload();
        } })) },
    ] });
  const statusMenu = (r) => h('select', { class: 'input input--sm', 'aria-label': tt('Change status', 'অবস্থা বদলান'), onchange: async (e) => {
    const to = e.target.value; e.target.value = '';
    if (!to) return;
    const note = await promptText({ title: tt('Change status of {n}', '{n}-এর অবস্থা বদলান', { n: r.nameEn }), body: tt('Records are never deleted. Inactive, transferred or departed students keep their history; their roll becomes free.', 'রেকর্ড কখনো মোছা হয় না। নিষ্ক্রিয়, বদলি বা চলে যাওয়া শিক্ষার্থীর ইতিহাস থাকে; তাদের রোল খালি হয়।'), label: tt('Note (optional)', 'নোট (ঐচ্ছিক)'), required: false, confirmText: tt('Change status', 'অবস্থা বদলান') });
    if (note === null) return;
    if (await run(() => repo.setStudentStatus(actor(), r.id, to, note || null), { success: tt('Status changed', 'অবস্থা বদলানো হয়েছে') }) !== undefined) reload();
  } }, h('option', { value: '' }, tt('Status…', 'অবস্থা…')), ['active', 'inactive', 'transferred', 'left', 'graduated'].filter((s) => s !== r.status).map((s) => h('option', { value: s }, s)));

  async function details(r) {
    const hist = await repo.getStudentHistory(r.id).catch(() => []);
    const custom = fieldDefs.filter((d) => d.enabled !== false && r.customFields?.[d.key] != null).map((d) => [L(d.label), String(r.customFields[d.key])]);
    openModal({ title: r.nameEn, size: 'l', content: h('div', {},
      keyValue([[tt('Bangla name', 'বাংলা নাম'), r.nameBn], [tt('Student ID', 'শিক্ষার্থী আইডি'), r.studentCode], [tt("Father's name", 'পিতার নাম'), r.fatherName], [tt("Mother's name", 'মাতার নাম'), r.motherName],
        [tt('Date of birth', 'জন্ম তারিখ'), r.dob], [tt('Class', 'শ্রেণি'), `${nameOf(cats.classes, r.current?.classId)} · ${r.current?.yearId} · ${tt('roll', 'রোল')} ${r.current?.roll}`],
        [tt('Subjects chosen', 'বাছাই করা বিষয়'), (r.current?.subjectIds ?? []).filter((id) => id !== r.current?.optionalSubjectId).map((id) => nameOf(cats.subjects, id)).join(', ') || '—'],
        [tt('4th subject', '৪র্থ বিষয়'), r.current?.optionalSubjectId ? nameOf(cats.subjects, r.current.optionalSubjectId) : '—'],
        ...custom]),
      h('h3', {}, tt('Published results', 'প্রকাশিত ফলাফল')),
      hist.length ? h('table', { class: 'mini-table' }, h('tbody', {}, hist.map((x) => h('tr', {}, h('td', {}, L(x.title)), h('td', {}, `${tt('Roll', 'রোল')} ${x.roll}`), h('td', {}, `GPA ${fmtNum(x.gpa, 2)} (${x.grade})`), h('td', {}, fmtDate(x.publishedAt)),
        h('td', {}, h('a', { href: `#/results?sid=${encodeURIComponent(x.sessionId)}&student=${encodeURIComponent(r.id)}&group=${encodeURIComponent(x.groupId)}` }, tt('Marksheet', 'মার্কশিট')))))))
        : h('p', { class: 'muted' }, tt('No published results yet.', 'এখনো কোনো প্রকাশিত ফলাফল নেই।'))) });
  }

  async function reload() {
    Object.assign(sel, { yearId: yearF.value, classId: classF.value, status: statusF.value });
    sessionStorage.setItem(prefKey, JSON.stringify(sel));
    const page = await repo.listStudents({ ...sel, status: sel.status || null, limit: 100 }).catch((e) => { root.querySelector('.table-card')?.replaceWith(errorState({ message: friendlyError(e) })); return null; });
    if (!page) return;
    cursor = page.cursor;
    table.setRows(page.items, { more: Boolean(cursor) });
    paintCounts();
  }
  // Group-wise totals for the chosen session, class and status (server-side counts, not just the loaded page).
  const countsBox = h('div', { class: 'count-chips', 'aria-live': 'polite' });
  async function paintCounts() {
    try {
      const { studentCounts } = await import('../../data/repositories/stats-repository.js');
      const cls = cats.classes.find((c) => c.id === sel.classId);
      if (!cls) { countsBox.replaceChildren(); return; }
      const res = (await studentCounts(sel.yearId, [cls], cats.groups, { status: sel.status || null }))[cls.id];
      const gs = cats.groups.filter((g) => res.byGroup[g.id] != null);
      countsBox.replaceChildren(...gs.map((g) => h('span', { class: 'chip' }, `${L(g.name)}: `, h('strong', {}, String(res.byGroup[g.id])))),
        h('span', { class: 'chip chip--total' }, `${tt('Total', 'মোট')}: `, h('strong', {}, String(res.total))));
    } catch { countsBox.replaceChildren(); }
  }
  [yearF, classF, statusF].forEach((x) => x.input.addEventListener('change', reload));
  root.replaceChildren(
    pageHeader({ title: t('nav.students'), actions: [
      linkButton(tt('Import JSON', 'JSON ইমপোর্ট'), '#/admin/students/import', {}),
      button(tt('Add student', 'শিক্ষার্থী যোগ'), { kind: 'primary', icon: 'plus', onClick: () => openStudentForm({ cats, fieldDefs, defaults: { yearId: sel.yearId, classId: sel.classId }, onSaved: reload }) })] }),
    h('div', { class: 'filter-bar' }, yearF.el, classF.el, statusF.el), countsBox, table.el);
  await reload();
  const focus = query.get('student');
  if (focus) { const s = await repo.getStudent(focus); if (s) details(s); }
}
