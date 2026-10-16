/**
 * Default teacher ↔ subject ↔ class assignments (copied into new result sheets).
 * Classes are chosen with buttons; subjects are grouped under "Common subjects" and each group,
 * and the list refreshes immediately after assigning or removing a teacher.
 */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button } from '../../ui/components/page.js';
import { loadingState, errorState, emptyState } from '../../ui/components/states.js';
import { selectField } from '../../ui/components/form.js';
import { openModal } from '../../ui/components/modal.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { actor, friendlyError, run } from '../_shared.js';

export const title = 'nav.assignments';
const KEY = 'crms.assign.class';

export function render() {
  const root = h('section', { class: 'page' }, loadingState());
  init(root).catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

async function init(root) {
  const [{ loadAllCatalogues }, { listActiveTeachers }, repo] = await Promise.all([import('../../data/repositories/catalogue-repository.js'), import('../../data/repositories/users-repository.js'), import('../../data/repositories/assignments-repository.js')]);
  const [cats, teachers] = await Promise.all([loadAllCatalogues(), listActiveTeachers()]);
  const classes = cats.classes.filter((c) => c.active !== false);
  let classId = classes.some((c) => c.id === sessionStorage.getItem(KEY)) ? sessionStorage.getItem(KEY) : classes[0]?.id;
  const classBar = h('div', { class: 'choice-bar', role: 'group', 'aria-label': tt('Class', 'শ্রেণি') });
  const grid = h('div');

  function paintClassBar() {
    classBar.replaceChildren(...classes.map((c) => h('button', { type: 'button', class: `choice ${c.id === classId ? 'is-active' : ''}`, 'aria-pressed': String(c.id === classId),
      onclick: () => { classId = c.id; sessionStorage.setItem(KEY, c.id); paintClassBar(); paint(); } }, L(c.name))));
  }

  async function paint() {
    if (!classId) { grid.replaceChildren(emptyState({ message: tt('Add a class first in Classes & groups.', 'আগে শ্রেণি ও বিভাগে একটি শ্রেণি যোগ করুন।') })); return; }
    const keepScroll = window.scrollY;
    if (!grid.children.length) grid.replaceChildren(loadingState());
    const list = await repo.listAssignments({ classId });
    const cls = classes.find((c) => c.id === classId);
    const classGroups = cats.groups.filter((g) => !cls?.groupIds?.length || cls.groupIds.includes(g.id));
    const subjects = cats.subjects.filter((s) => s.active !== false && (!s.classIds?.length || s.classIds.includes(classId)));
    // "Common" = taught to every group of this class (or not tied to any group).
    const isCommon = (s) => !s.groupIds?.length || classGroups.every((g) => s.groupIds.includes(g.id));
    const sections = [
      { title: tt('Common subjects', 'সাধারণ বিষয়'), items: subjects.filter(isCommon) },
      ...classGroups.map((g) => ({ title: L(g.name), items: subjects.filter((s) => !isCommon(s) && s.groupIds?.includes(g.id)) })),
    ].filter((sec) => sec.items.length);
    grid.replaceChildren(...(sections.length ? sections.map((sec) => h('section', { class: 'assign-section' },
      h('h2', { class: 'assign-section__title' }, sec.title, h('span', { class: 'muted small' }, ` · ${tt('{n} subjects', '{n}টি বিষয়', { n: sec.items.length })}`)),
      h('ul', { class: 'assign-list' }, sec.items.map((s) => {
        const mine = list.filter((a) => a.subjectId === s.id);
        return h('li', { class: 'assign-row' },
          h('div', { class: 'assign-row__subject' }, h('strong', {}, L(s.name)), s.code ? h('span', { class: 'muted small' }, ` ${s.code}`) : null),
          h('div', { class: 'assign-row__teachers' }, mine.length ? h('ul', { class: 'chip-list' }, mine.map((a) => h('li', { class: 'chip' }, a.teacherName ?? a.teacherId,
            h('button', { class: 'chip__x', type: 'button', 'aria-label': tt('Remove {n}', '{n} সরান', { n: a.teacherName }), onclick: async () => {
              if (!(await confirmDialog({ title: tt('Remove {n} from {s}?', '{s} থেকে {n}-কে সরাবেন?', { n: a.teacherName, s: L(s.name) }), body: tt('Existing result sheets are not changed; change them on the sheet page.', 'বিদ্যমান ফলাফল শিট বদলাবে না; শিট পৃষ্ঠায় বদলান।'), confirmText: tt('Remove', 'সরান') }))) return;
              if (await run(() => repo.removeAssignment(actor(), a.id), { success: tt('Removed', 'সরানো হয়েছে') }) !== undefined) paint();
            } }, '×')))) : h('span', { class: 'text-bad small' }, tt('No teacher', 'শিক্ষক নেই'))),
          button(tt('Assign', 'দায়িত্ব দিন'), { size: 'sm', icon: 'plus', onClick: () => assign(s, mine) }));
      })))) : [emptyState({ message: tt('No active subjects for this class. Add them in Subjects.', 'এই শ্রেণির কোনো সক্রিয় বিষয় নেই। বিষয় পৃষ্ঠায় যোগ করুন।') })]));
    window.scrollTo({ top: keepScroll });
  }

  function assign(subject, existing) {
    const options = teachers.filter((x) => !existing.some((a) => a.teacherId === x.id));
    if (!options.length) { openModal({ title: tt('No more teachers', 'আর শিক্ষক নেই'), content: h('p', {}, tt('Every approved teacher is already assigned. Approve more teachers first.', 'সব অনুমোদিত শিক্ষক আগেই দায়িত্বে আছেন। আগে আরও শিক্ষক অনুমোদন দিন।')) }); return; }
    const sel = selectField({ label: tt('Approved teacher', 'অনুমোদিত শিক্ষক'), name: 'at', options: options.map((x) => ({ value: x.id, label: x.displayName })) });
    openModal({ title: tt('Assign {s}', '{s}-এর দায়িত্ব দিন', { s: L(subject.name) }), content: sel.el, size: 's', actions: [{ label: t('common.cancel'), onClick: () => true },
      { label: tt('Assign', 'দায়িত্ব দিন'), kind: 'primary', onClick: async () => {
        const teacher = teachers.find((x) => x.id === sel.value);
        const ok = await run(() => repo.addAssignment(actor(), { teacher, subjectId: subject.id, classId }), { success: tt('{n} assigned to {s}', '{n}-কে {s}-এর দায়িত্ব দেওয়া হয়েছে', { n: teacher.displayName, s: L(subject.name) }) });
        if (ok === undefined) return false; // keep the dialog open on failure
        paint();                            // closes the dialog and refreshes the list immediately
        return true;
      } }] });
  }

  paintClassBar();
  root.replaceChildren(pageHeader({ title: t('nav.assignments'), subtitle: tt('Only approved teachers can be assigned. These defaults are copied into new result sheets.', 'শুধু অনুমোদিত শিক্ষককে দায়িত্ব দেওয়া যায়। এগুলো নতুন ফলাফল শিটে কপি হয়।') }),
    h('div', { class: 'filter-bar' }, h('div', { class: 'field' }, h('span', { class: 'field__label' }, tt('Class', 'শ্রেণি')), classBar)), grid);
  paint();
}
