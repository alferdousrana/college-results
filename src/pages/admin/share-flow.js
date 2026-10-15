/** "Share with all teachers": validation report, confirmation summary, then the transition. */
import { h } from '../../core/dom.js';
import { tt, L } from '../../i18n/index.js';
import { openModal } from '../../ui/components/modal.js';
import { toast } from '../../ui/components/toast.js';
import { actor, byId, friendlyError, nameOf } from '../_shared.js';
import { validateForSharing, subjectDefinition } from '../../domain/session-calc.js';

export async function shareFlow(sid, onDone) {
  const [{ loadSessionBundle, shareWithTeachers }, { listTeachers }, { loadAllCatalogues }] = await Promise.all([
    import('../../data/repositories/sessions-repository.js'), import('../../data/repositories/users-repository.js'), import('../../data/repositories/catalogue-repository.js')]);
  const [bundle, teachers, cats] = await Promise.all([loadSessionBundle(sid), listTeachers(), loadAllCatalogues()]);
  const tById = byId(teachers);
  const check = validateForSharing(bundle, tById);
  const list = (items, cls) => h('ul', { class: cls }, items.map((i) => h('li', {}, i.message)));
  const content = h('div', {},
    h('p', {}, h('strong', {}, L(bundle.session.title)), ` — ${nameOf(cats.classes, bundle.session.classId)}, ${bundle.session.yearId}`),
    h('p', {}, tt('{s} students · {g} group(s) · {n} subjects · {t} teachers', '{s} জন শিক্ষার্থী · {g}টি বিভাগ · {n}টি বিষয় · {t} জন শিক্ষক', { s: check.summary.students, g: check.summary.groups, n: check.summary.subjects, t: check.summary.teachers })),
    h('table', { class: 'mini-table' }, h('thead', {}, h('tr', {}, h('th', {}, tt('Subject', 'বিষয়')), h('th', {}, tt('Groups', 'বিভাগ')), h('th', {}, tt('Teacher', 'শিক্ষক')))),
      h('tbody', {}, bundle.subjects.map((s) => h('tr', {}, h('td', {}, L(subjectDefinition(s).name)), h('td', {}, (s.groupIds ?? []).map((g) => nameOf(cats.groups, g)).join(', ')),
        h('td', { class: (s.teacherIds ?? []).length ? '' : 'text-bad' }, (s.teacherIds ?? []).map((id) => tById[id]?.displayName ?? id).join(', ') || tt('Not assigned', 'নির্ধারিত নয়')))))),
    check.errors.length ? h('div', { class: 'notice notice--bad' }, h('p', { class: 'notice__title' }, tt('Fix these before sharing', 'শেয়ার করার আগে এগুলো ঠিক করুন')), list(check.errors)) : null,
    check.warnings.length ? h('div', { class: 'notice notice--locked' }, h('p', { class: 'notice__title' }, tt('Check these', 'এগুলো দেখে নিন')), list(check.warnings)) : null,
    !check.errors.length ? h('p', {}, tt('Each teacher will see only the subjects assigned to them. The subject list is locked after sharing; teachers and late students can still be changed.',
      'প্রত্যেক শিক্ষক শুধু নিজের বিষয় দেখবেন। শেয়ারের পর বিষয়ের তালিকা আর বদলানো যাবে না; শিক্ষক ও দেরিতে আসা শিক্ষার্থী বদলানো যাবে।')) : null);
  openModal({
    title: tt('Share with all teachers', 'সব শিক্ষকের সাথে শেয়ার করুন'), size: 'l', content,
    actions: [
      { label: tt('Cancel', 'বাতিল'), onClick: () => true },
      ...(check.errors.length ? [] : [{ label: tt('Share with all teachers', 'সব শিক্ষকের সাথে শেয়ার করুন'), kind: 'primary', onClick: async () => {
        try { await shareWithTeachers(actor(), sid, tById); toast(tt('Shared. Teachers can now enter marks.', 'শেয়ার করা হয়েছে। শিক্ষকরা এখন নম্বর দিতে পারবেন।'), 'success'); onDone?.(); return true; }
        catch (e) { toast(friendlyError(e), 'error'); return false; }
      } }]),
    ],
  });
}
