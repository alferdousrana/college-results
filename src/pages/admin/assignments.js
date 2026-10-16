/**
 * Default teacher ↔ subject assignments, organised by group (Common, Science, Humanities, Business…).
 * A teacher assigned to a subject is assigned for every class that has the subject (e.g. Eleven and
 * Twelve) in one step. Stored per class (teacherAssignments/{teacher__subject__class}) because result
 * sheets are per class; the screen shows them merged.
 */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button } from '../../ui/components/page.js';
import { loadingState, errorState, emptyState } from '../../ui/components/states.js';
import { checkGroup, selectField } from '../../ui/components/form.js';
import { openModal } from '../../ui/components/modal.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { toast } from '../../ui/components/toast.js';
import { actor, friendlyError, run } from '../_shared.js';

export const title = 'nav.assignments';

export function render() {
  const root = h('section', { class: 'page' }, loadingState());
  init(root).catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

/** Groups a subject list into Common / each group / Other (subjects whose groups are missing). */
export function sectionSubjects(subjects, groups) {
  const groupIds = groups.map((g) => g.id);
  const own = (s) => (s.groupIds ?? []).filter((g) => groupIds.includes(g));
  const isCommon = (s) => !(s.groupIds ?? []).length || (groupIds.length > 0 && groupIds.every((g) => (s.groupIds ?? []).includes(g)));
  const common = subjects.filter(isCommon);
  const sections = [{ id: '_common', title: tt('Common subjects (all groups)', 'সাধারণ বিষয় (সব বিভাগ)'), items: common }];
  for (const g of groups) sections.push({ id: g.id, title: L(g.name), items: subjects.filter((s) => !isCommon(s) && own(s).includes(g.id)) });
  const other = subjects.filter((s) => !isCommon(s) && !own(s).length);
  if (other.length) sections.push({ id: '_other', title: tt('Other subjects (check their groups in Subjects)', 'অন্যান্য বিষয় (বিষয় পৃষ্ঠায় বিভাগ ঠিক করুন)'), items: other });
  return sections.filter((x) => x.items.length);
}

async function init(root) {
  const [{ loadAllCatalogues }, { listActiveTeachers }, repo] = await Promise.all([import('../../data/repositories/catalogue-repository.js'), import('../../data/repositories/users-repository.js'), import('../../data/repositories/assignments-repository.js')]);
  const [cats, teachers] = await Promise.all([loadAllCatalogues({ fresh: true }), listActiveTeachers()]);
  const classes = cats.classes.filter((c) => c.active !== false);
  const groups = cats.groups.filter((g) => g.active !== false);
  const subjects = cats.subjects.filter((s) => s.active !== false);
  const classIdsOf = (s) => { const ids = (s.classIds ?? []).filter((c) => classes.some((x) => x.id === c)); return ids.length ? ids : classes.map((c) => c.id); };
  const className = (id) => L(classes.find((c) => c.id === id)?.name) || id;
  const grid = h('div');

  async function paint() {
    const keepScroll = window.scrollY;
    if (!grid.children.length) grid.replaceChildren(loadingState());
    const all = await repo.listAssignments();
    const sections = sectionSubjects(subjects, groups);
    grid.replaceChildren(...(sections.length ? sections.map((sec) => h('section', { class: 'assign-section' },
      h('h2', { class: 'assign-section__title' }, sec.title, h('span', { class: 'muted small' }, ` · ${tt('{n} subjects', '{n}টি বিষয়', { n: sec.items.length })}`)),
      h('ul', { class: 'assign-list' }, sec.items.map((s) => {
        const subjectClasses = classIdsOf(s);
        const rows = all.filter((a) => a.subjectId === s.id && subjectClasses.includes(a.classId));
        // Merge per teacher: which of the subject's classes they are assigned for.
        const byTeacher = new Map();
        rows.forEach((a) => { if (!byTeacher.has(a.teacherId)) byTeacher.set(a.teacherId, { name: a.teacherName ?? a.teacherId, ids: [], classIds: [] }); const x = byTeacher.get(a.teacherId); x.ids.push(a.id); x.classIds.push(a.classId); });
        const alsoIn = sec.id.startsWith('_') ? [] : (s.groupIds ?? []).filter((g) => g !== sec.id && groups.some((x) => x.id === g)).map((g) => L(groups.find((x) => x.id === g).name));
        return h('li', { class: 'assign-row' },
          h('div', { class: 'assign-row__subject' }, h('strong', {}, L(s.name)), s.code ? h('span', { class: 'muted small' }, ` ${s.code}`) : null,
            alsoIn.length && alsoIn.length < groups.length - 1 ? h('div', { class: 'muted small' }, tt('also in {g}', '{g}-এও আছে', { g: alsoIn.join(', ') })) : null),
          h('div', { class: 'assign-row__teachers' }, byTeacher.size ? h('ul', { class: 'chip-list' }, [...byTeacher.entries()].map(([tid, x]) => h('li', { class: 'chip' },
            x.name, x.classIds.length < subjectClasses.length ? h('span', { class: 'muted small' }, ` (${x.classIds.map(className).join(', ')} ${tt('only', 'শুধু')})`) : null,
            h('button', { class: 'chip__x', type: 'button', 'aria-label': tt('Remove {n}', '{n} সরান', { n: x.name }), onclick: async () => {
              if (!(await confirmDialog({ title: tt('Remove {n} from {s}?', '{s} থেকে {n}-কে সরাবেন?', { n: x.name, s: L(s.name) }), body: tt('Removed for all classes. Existing result sheets are not changed; change them on the sheet page.', 'সব শ্রেণি থেকে সরবে। বিদ্যমান ফলাফল শিট বদলাবে না; শিট পৃষ্ঠায় বদলান।'), confirmText: tt('Remove', 'সরান') }))) return;
              if (await run(async () => { for (const id of x.ids) await repo.removeAssignment(actor(), id); }, { success: tt('Removed', 'সরানো হয়েছে') }) !== undefined) paint();
            } }, '×')))) : h('span', { class: 'text-bad small' }, tt('No teacher', 'শিক্ষক নেই'))),
          button(tt('Assign', 'দায়িত্ব দিন'), { size: 'sm', icon: 'plus', onClick: () => assign(s, subjectClasses, rows) }));
      })))) : [emptyState({ message: tt('No active subjects. Add them in Subjects.', 'কোনো সক্রিয় বিষয় নেই। বিষয় পৃষ্ঠায় যোগ করুন।') })]));
    window.scrollTo({ top: keepScroll });
  }

  function assign(subject, subjectClasses, existing) {
    if (!teachers.length) { openModal({ title: tt('No approved teachers', 'অনুমোদিত শিক্ষক নেই'), content: h('p', {}, tt('Approve teachers first on the Teachers page.', 'আগে শিক্ষক পৃষ্ঠায় শিক্ষক অনুমোদন দিন।')) }); return; }
    const sel = selectField({ label: tt('Approved teacher', 'অনুমোদিত শিক্ষক'), name: 'at', options: teachers.map((x) => ({ value: x.id, label: x.displayName })) });
    const cls = subjectClasses.length > 1 ? checkGroup({ label: tt('For classes', 'যে শ্রেণিগুলোর জন্য'), name: 'acls', options: subjectClasses.map((id) => ({ value: id, label: className(id) })), values: subjectClasses }) : null;
    openModal({ title: tt('Assign {s}', '{s}-এর দায়িত্ব দিন', { s: L(subject.name) }), size: 's', content: h('div', {}, sel.el, cls?.el,
      cls ? h('p', { class: 'muted small' }, tt('Usually the same teacher takes the subject in every class, so all classes are ticked.', 'সাধারণত একই শিক্ষক সব শ্রেণিতে বিষয়টি নেন, তাই সব শ্রেণি বাছা আছে।')) : null),
    actions: [{ label: t('common.cancel'), onClick: () => true }, { label: tt('Assign', 'দায়িত্ব দিন'), kind: 'primary', onClick: async () => {
      const teacher = teachers.find((x) => x.id === sel.value);
      const targets = (cls ? cls.value : subjectClasses).filter((c) => !existing.some((a) => a.teacherId === teacher.id && a.classId === c));
      if (!targets.length) { toast(tt('{n} is already assigned for the chosen classes.', '{n} আগেই বাছা শ্রেণিগুলোর দায়িত্বে আছেন।', { n: teacher.displayName }), 'info'); return true; }
      const ok = await run(async () => { for (const classId of targets) await repo.addAssignment(actor(), { teacher, subjectId: subject.id, classId }); },
        { success: tt('{n} assigned to {s}', '{n}-কে {s}-এর দায়িত্ব দেওয়া হয়েছে', { n: teacher.displayName, s: L(subject.name) }) });
      if (ok === undefined) return false;
      paint();
      return true;
    } }] });
  }

  root.replaceChildren(pageHeader({ title: t('nav.assignments'), subtitle: tt('Only approved teachers can be assigned. A teacher is assigned for every class that has the subject. These defaults are copied into new result sheets.', 'শুধু অনুমোদিত শিক্ষককে দায়িত্ব দেওয়া যায়। একবার দায়িত্ব দিলে বিষয়টি যে সব শ্রেণিতে আছে সবগুলোর জন্য হয়। এগুলো নতুন ফলাফল শিটে কপি হয়।') }), grid);
  paint();
}
