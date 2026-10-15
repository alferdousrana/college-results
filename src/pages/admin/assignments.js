/** Default teacher ↔ subject ↔ class assignments (used when a new result sheet is created). */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button } from '../../ui/components/page.js';
import { loadingState, errorState } from '../../ui/components/states.js';
import { selectField } from '../../ui/components/form.js';
import { openModal } from '../../ui/components/modal.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { actor, friendlyError, run } from '../_shared.js';

export const title = 'nav.assignments';

export function render() {
  const root = h('section', { class: 'page' }, loadingState());
  init(root).catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

async function init(root) {
  const [{ loadAllCatalogues }, { listActiveTeachers }, repo] = await Promise.all([import('../../data/repositories/catalogue-repository.js'), import('../../data/repositories/users-repository.js'), import('../../data/repositories/assignments-repository.js')]);
  const [cats, teachers] = await Promise.all([loadAllCatalogues(), listActiveTeachers()]);
  const classF = selectField({ label: tt('Class', 'শ্রেণি'), name: 'ac', options: cats.classes.map((c) => ({ value: c.id, label: L(c.name) })) });
  const grid = h('div');
  async function paint() {
    grid.replaceChildren(loadingState());
    const list = await repo.listAssignments({ classId: classF.value });
    const subjects = cats.subjects.filter((s) => s.active !== false && (!s.classIds?.length || s.classIds.includes(classF.value)));
    grid.replaceChildren(subjects.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'data-table' },
      h('thead', {}, h('tr', {}, h('th', {}, tt('Subject', 'বিষয়')), h('th', {}, tt('Teachers', 'শিক্ষক')), h('th', {}, ''))),
      h('tbody', {}, subjects.map((s) => {
        const mine = list.filter((a) => a.subjectId === s.id);
        return h('tr', {}, h('td', {}, L(s.name)),
          h('td', {}, mine.length ? h('ul', { class: 'chip-list' }, mine.map((a) => h('li', { class: 'chip' }, a.teacherName ?? a.teacherId,
            h('button', { class: 'chip__x', type: 'button', 'aria-label': tt('Remove {n}', '{n} সরান', { n: a.teacherName }), onclick: async () => {
              if (!(await confirmDialog({ title: tt('Remove this assignment?', 'এই দায়িত্ব সরাবেন?'), body: tt('Existing result sheets are not changed; change them on the sheet page.', 'বিদ্যমান ফলাফল শিট বদলাবে না; শিট পৃষ্ঠায় বদলান।'), confirmText: tt('Remove', 'সরান') }))) return;
              if (await run(() => repo.removeAssignment(actor(), a.id)) !== undefined) paint();
            } }, '×')))) : h('span', { class: 'text-bad' }, tt('No teacher', 'শিক্ষক নেই'))),
          h('td', {}, button(tt('Assign', 'দায়িত্ব দিন'), { size: 'sm', onClick: () => assign(s, mine) })));
      })))) : h('p', { class: 'muted' }, tt('No active subjects for this class.', 'এই শ্রেণির কোনো সক্রিয় বিষয় নেই।')));
  }
  function assign(subject, existing) {
    const options = teachers.filter((x) => !existing.some((a) => a.teacherId === x.id));
    if (!options.length) { openModal({ title: tt('No more teachers', 'আর শিক্ষক নেই'), content: h('p', {}, tt('Every approved teacher is already assigned. Approve more teachers first.', 'সব অনুমোদিত শিক্ষক আগেই দায়িত্বে আছেন। আগে আরও শিক্ষক অনুমোদন দিন।')) }); return; }
    const sel = selectField({ label: tt('Approved teacher', 'অনুমোদিত শিক্ষক'), name: 'at', options: options.map((x) => ({ value: x.id, label: x.displayName })) });
    openModal({ title: tt('Assign {s}', '{s}-এর দায়িত্ব দিন', { s: L(subject.name) }), content: sel.el, actions: [{ label: t('common.cancel'), onClick: () => true },
      { label: tt('Assign', 'দায়িত্ব দিন'), kind: 'primary', onClick: async () => {
        const teacher = teachers.find((x) => x.id === sel.value);
        const r = await run(() => repo.addAssignment(actor(), { teacher, subjectId: subject.id, classId: classF.value }), { success: tt('Assigned', 'দায়িত্ব দেওয়া হয়েছে') });
        if (r !== undefined) paint(); return r !== undefined;
      } }] });
  }
  classF.input.addEventListener('change', paint);
  root.replaceChildren(pageHeader({ title: t('nav.assignments'), subtitle: tt('Only approved teachers can be assigned. These defaults are copied into new result sheets.', 'শুধু অনুমোদিত শিক্ষককে দায়িত্ব দেওয়া যায়। এগুলো নতুন ফলাফল শিটে কপি হয়।') }), h('div', { class: 'filter-bar' }, classF.el), grid);
  paint();
}
