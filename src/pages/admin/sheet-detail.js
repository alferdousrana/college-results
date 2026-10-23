/** One result sheet: lifecycle actions, subjects & teachers, roster, missing marks, results, history. */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button, linkButton, tabs } from '../../ui/components/page.js';
import { loadingState, errorState, emptyState } from '../../ui/components/states.js';
import { examStateBadge, lifecycleStrip } from '../../ui/components/status-badge.js';
import { dataTable } from '../../ui/components/data-table.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { openModal, promptText } from '../../ui/components/modal.js';
import { toast } from '../../ui/components/toast.js';
import { navigate } from '../../app/router.js';
import { actor, byId, friendlyError, nameOf, run } from '../_shared.js';
import { ExamState } from '../../domain/exam-lifecycle.js';
import { findMissingMarks, subjectProgress, subjectDefinition, studentsForSubject } from '../../domain/session-calc.js';
import { fmtDate, fmtNum } from '../../ui/format.js';
import { shareFlow } from './share-flow.js';

export const title = 'nav.resultSheets';

export function render({ query }) {
  const sid = query.get('sid');
  const root = h('section', { class: 'page' });
  root.append(loadingState());
  load(sid, root, query.get('tab')).catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

async function load(sid, root, initialTab) {
  const [sess, marksRepo, { loadAllCatalogues }, { listTeachers }] = await Promise.all([
    import('../../data/repositories/sessions-repository.js'), import('../../data/repositories/marks-repository.js'),
    import('../../data/repositories/catalogue-repository.js'), import('../../data/repositories/users-repository.js')]);
  const [bundle, cats, teachers] = await Promise.all([sess.loadSessionBundle(sid), loadAllCatalogues(), listTeachers()]);
  const marks = await marksRepo.loadAllMarks(sid, bundle.subjects.map((s) => s.id));
  const tById = byId(teachers);
  const s = bundle.session;
  const reload = (tab) => { root.replaceChildren(loadingState()); load(sid, root, tab).catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) }))); };
  const missing = findMissingMarks(bundle, marks);
  const unsubmitted = bundle.subjects.filter((x) => x.submission?.state !== 'submitted');

  const act = async (fn, msg) => { const r = await run(fn, { success: msg }); if (r !== undefined) reload(); };
  const transition = (to, opts) => act(() => sess.transitionSession(actor(), sid, to, opts), tt('Status updated', 'অবস্থা হালনাগাদ হয়েছে'));
  const actions = [];
  const st = s.state;
  if (st === ExamState.DRAFT) {
    actions.push(linkButton(tt('Edit draft', 'খসড়া সম্পাদনা'), `#/admin/sheet/new?sid=${encodeURIComponent(sid)}`, { icon: 'edit' }),
      button(tt('Share with all teachers', 'সব শিক্ষকের সাথে শেয়ার করুন'), { kind: 'primary', onClick: () => shareFlow(sid, () => reload()) }));
  }
  if (st === ExamState.READY) actions.push(button(tt('Withdraw to draft', 'খসড়ায় ফেরত নিন'), { onClick: async () => {
    if (Object.values(marks).some((m) => Object.keys(m).length)) { toast(tt('Marks have already been entered, so the sheet cannot go back to draft.', 'ইতিমধ্যে নম্বর দেওয়া হয়েছে, তাই খসড়ায় ফেরানো যাবে না।'), 'error'); return; }
    if (await confirmDialog({ title: tt('Withdraw to draft?', 'খসড়ায় ফেরত নেবেন?'), body: tt('Teachers will no longer see this examination until you share it again.', 'আবার শেয়ার না করা পর্যন্ত শিক্ষকরা এটি দেখবেন না।'), confirmText: tt('Withdraw', 'ফেরত নিন') })) transition(ExamState.DRAFT);
  } }));
  if ([ExamState.READY, ExamState.IN_PROGRESS].includes(st)) actions.push(button(tt('Close mark entry', 'নম্বর প্রদান বন্ধ করুন'), { kind: 'primary', onClick: async () => {
    const warn = [unsubmitted.length ? tt('{n} subject(s) are not submitted by their teachers.', '{n}টি বিষয় শিক্ষকরা জমা দেননি।', { n: unsubmitted.length }) : null,
      missing.length ? tt('{n} required mark(s) are still missing.', '{n}টি আবশ্যক নম্বর এখনো বাকি।', { n: missing.length }) : null].filter(Boolean).join(' ');
    if (await confirmDialog({ title: tt('Close mark entry?', 'নম্বর প্রদান বন্ধ করবেন?'), body: `${warn} ${tt('Teachers will not be able to change marks after this. You can reopen it later.', 'এরপর শিক্ষকরা নম্বর বদলাতে পারবেন না। পরে আবার খোলা যাবে।')}`, confirmText: tt('Close mark entry', 'নম্বর প্রদান বন্ধ করুন') })) {
      if (st === ExamState.READY) await sess.transitionSession(actor(), sid, ExamState.IN_PROGRESS).catch(() => {});
      transition(ExamState.SUBMITTED);
    }
  } }));
  if (st === ExamState.SUBMITTED) actions.push(button(tt('Reopen mark entry', 'নম্বর প্রদান আবার খুলুন'), { onClick: () => transition(ExamState.IN_PROGRESS) }), button(tt('Start review', 'যাচাই শুরু করুন'), { kind: 'primary', onClick: () => transition(ExamState.UNDER_REVIEW) }));
  if (st === ExamState.UNDER_REVIEW) actions.push(button(tt('Reopen mark entry', 'নম্বর প্রদান আবার খুলুন'), { onClick: () => transition(ExamState.IN_PROGRESS) }), button(tt('Preview and publish', 'দেখে প্রকাশ করুন'), { kind: 'primary', onClick: () => tabCtl.select('results') }));
  if (st === ExamState.PUBLISHED) actions.push(
    button(tt('Correct a published result', 'প্রকাশিত ফলাফল সংশোধন'), { onClick: async () => {
      const reason = await promptText({ title: tt('Start a correction', 'সংশোধন শুরু করুন'), body: tt('The sheet returns to review. The currently published version stays visible to students until you publish the corrected version. The reason is recorded in the audit log.', 'শিটটি যাচাইয়ে ফিরবে। সংশোধিত সংস্করণ প্রকাশ না করা পর্যন্ত বর্তমান প্রকাশিত ফলাফল শিক্ষার্থীরা দেখতে পাবে। কারণটি অডিট লগে থাকবে।'), label: tt('Reason for the correction', 'সংশোধনের কারণ'), confirmText: tt('Start correction', 'সংশোধন শুরু করুন') });
      if (reason) act(async () => (await import('../../data/repositories/results-repository.js')).startCorrection(actor(), sid, reason), tt('Correction started', 'সংশোধন শুরু হয়েছে'));
    } }),
    button(tt('Archive', 'আর্কাইভ করুন'), { onClick: async () => { if (await confirmDialog({ title: tt('Archive this result sheet?', 'এই ফলাফল শিট আর্কাইভ করবেন?'), body: tt('It stays readable and printable but can no longer be corrected.', 'এটি পড়া ও প্রিন্ট করা যাবে কিন্তু আর সংশোধন করা যাবে না।'), confirmText: tt('Archive', 'আর্কাইভ করুন') })) transition(ExamState.ARCHIVED); } }));
  if ([ExamState.PUBLISHED, ExamState.ARCHIVED].includes(st) && !s.publicWithdrawn) actions.push(button(tt('Update public lookup', 'পাবলিক অনুসন্ধান হালনাগাদ'), { onClick: async () => {
    if (!(await confirmDialog({ title: tt('Apply the current publication settings?', 'বর্তমান প্রকাশ-সেটিংস প্রয়োগ করবেন?'), body: tt("Students' public marksheets will show the details chosen now in Settings → Result publication (for example parents' names) and use the current verification. Marks, grades and positions do not change.", 'শিক্ষার্থীদের পাবলিক মার্কশিটে এখন সেটিংস → ফলাফল প্রকাশে বাছা তথ্য (যেমন বাবা-মায়ের নাম) ও বর্তমান যাচাই ব্যবহার হবে। নম্বর, গ্রেড ও মেধাস্থান বদলাবে না।'), confirmText: tt('Update', 'হালনাগাদ') }))) return;
    const { refreshPublicLookup } = await import('../../data/repositories/results-repository.js');
    const r = await run(() => refreshPublicLookup(actor(), sid), { success: tt('Public lookup updated', 'পাবলিক অনুসন্ধান হালনাগাদ হয়েছে') });
    if (r?.unverifiable?.length) toast(tt('Rolls {r} have no verification value and cannot be found online.', 'রোল {r}-এর যাচাই তথ্য নেই, অনলাইনে পাওয়া যাবে না।', { r: r.unverifiable.join(', ') }), 'error');
  } }));
  if ([ExamState.PUBLISHED, ExamState.ARCHIVED].includes(st) && !s.publicWithdrawn) actions.push(button(tt('Remove from public lookup', 'পাবলিক অনুসন্ধান থেকে সরান'), { onClick: async () => {
    if (await confirmDialog({ title: tt('Remove from public lookup?', 'পাবলিক অনুসন্ধান থেকে সরাবেন?'), body: tt('Students will no longer find this result online. Staff can still view and print it.', 'শিক্ষার্থীরা আর অনলাইনে এই ফলাফল পাবে না। কর্মীরা দেখতে ও প্রিন্ট করতে পারবেন।'), danger: true, confirmText: tt('Remove', 'সরান') }))
      act(async () => (await import('../../data/repositories/results-repository.js')).withdrawPublicLookup(actor(), sid), tt('Removed from public lookup', 'পাবলিক অনুসন্ধান থেকে সরানো হয়েছে'));
  } }));
  if ([ExamState.PUBLISHED, ExamState.ARCHIVED, ExamState.UNDER_REVIEW, ExamState.SUBMITTED].includes(st)) actions.push(linkButton(tt('Print', 'প্রিন্ট'), `#/results?sid=${encodeURIComponent(sid)}`, { icon: 'print' }));

  // Deleting: drafts with a simple confirmation; any other sheet (test or mistaken data) with DELETE + a reason.
  const deleteSheet = async () => {
    const isDraft = st === ExamState.DRAFT;
    let reason = null;
    if (isDraft) {
      if (!(await confirmDialog({ title: tt('Delete this draft?', 'এই খসড়া মুছবেন?'), body: tt('The draft and its student list are removed. Students and subjects themselves are not deleted.', 'খসড়া ও এর শিক্ষার্থী তালিকা মুছে যাবে। শিক্ষার্থী ও বিষয় নিজেরা মুছবে না।'), danger: true, confirmText: tt('Delete draft', 'খসড়া মুছুন') }))) return;
    } else {
      reason = await promptText({ title: tt('Delete the whole result sheet?', 'পুরো ফলাফল শিট মুছবেন?'),
        body: tt('Use this only for test or mistaken sheets. All marks, results, publications and the public lookup of this examination are removed permanently. Students, teachers and subjects are kept. The deletion and your reason stay in the audit log.',
          'শুধু পরীক্ষামূলক বা ভুল শিটের জন্য ব্যবহার করুন। এই পরীক্ষার সব নম্বর, ফলাফল, প্রকাশনা ও পাবলিক অনুসন্ধান স্থায়ীভাবে মুছে যাবে। শিক্ষার্থী, শিক্ষক ও বিষয় থাকবে। মোছা ও আপনার কারণ অডিট লগে থাকবে।'),
        label: tt('Reason', 'কারণ'), confirmText: tt('Continue', 'এগিয়ে যান') });
      if (!reason) return;
      if (!(await confirmDialog({ title: tt('Delete "{t}" permanently?', '"{t}" স্থায়ীভাবে মুছবেন?', { t: L(s.title) }), body: tt('This cannot be undone.', 'এটি আর ফেরানো যাবে না।'), danger: true, confirmText: tt('Delete permanently', 'স্থায়ীভাবে মুছুন'), requireText: 'DELETE' }))) return;
    }
    const { deleteResultSheet } = await import('../../data/repositories/deletion-repository.js');
    if (await run(() => deleteResultSheet(actor(), sid, reason), { success: tt('Result sheet deleted', 'ফলাফল শিট মুছে ফেলা হয়েছে') }) !== undefined) navigate('/admin/sheets');
  };
  actions.push(button(st === ExamState.DRAFT ? tt('Delete draft', 'খসড়া মুছুন') : tt('Delete sheet', 'শিট মুছুন'), { kind: 'danger-ghost', onClick: deleteSheet }));

  const tabItems = [
    { id: 'overview', label: tt('Subjects & teachers', 'বিষয় ও শিক্ষক'), render: () => overview() },
    { id: 'students', label: tt('Students', 'শিক্ষার্থী'), badge: bundle.enrollments.length, render: () => students() },
    { id: 'missing', label: tt('Missing marks', 'বাকি নম্বর'), badge: missing.length, render: () => missingTab() },
    { id: 'results', label: tt('Results', 'ফলাফল'), render: (panel) => results(panel) },
    { id: 'history', label: tt('Publications', 'প্রকাশনা'), render: (panel) => history(panel) },
  ];
  const tabCtl = tabs(tabItems, { active: initialTab && tabItems.some((x) => x.id === initialTab) ? initialTab : 'overview' });

  root.replaceChildren(
    pageHeader({ title: L(s.title), subtitle: `${nameOf(cats.classes, s.classId)} · ${s.yearId} · ${(s.groupIds ?? []).map((g) => nameOf(cats.groups, g)).join(', ')}`, back: { href: '#/admin/sheets', label: t('nav.resultSheets') }, actions }),
    s.deleting ? h('div', { class: 'notice notice--bad' }, h('p', { class: 'notice__title' }, tt('Deletion was interrupted', 'মোছা মাঝপথে থেমে গেছে')),
      h('p', {}, tt('Some contents may already be removed. Delete again to finish.', 'কিছু অংশ হয়তো মুছে গেছে। শেষ করতে আবার মুছুন।')),
      button(tt('Finish deleting', 'মোছা শেষ করুন'), { kind: 'danger', size: 'sm', onClick: async () => { const { deleteResultSheet } = await import('../../data/repositories/deletion-repository.js'); if (await run(() => deleteResultSheet(actor(), sid, s.deleting.reason)) !== undefined) navigate('/admin/sheets'); } })) : null,
    h('div', { class: 'sheet-status' }, examStateBadge(st), s.correction ? h('span', { class: 'badge badge--warn' }, tt('Correction in progress: {r}', 'সংশোধন চলছে: {r}', { r: s.correction.reason })) : null,
      s.publishedVersion ? h('span', { class: 'muted' }, tt('Published version {v}', 'প্রকাশিত সংস্করণ {v}', { v: s.publishedVersion })) : null,
      s.publicWithdrawn ? h('span', { class: 'badge badge--neutral' }, tt('Not in public lookup', 'পাবলিক অনুসন্ধানে নেই')) : null),
    lifecycleStrip(st), tabCtl.el);

  function overview() {
    const editableTeachers = ![ExamState.PUBLISHED, ExamState.ARCHIVED].includes(st);
    return dataTable({ rows: bundle.subjects, pageSize: 50, rowKey: (r) => r.id, columns: [
      { key: 'name', label: tt('Subject', 'বিষয়'), render: (r) => h('div', {}, h('strong', {}, L(subjectDefinition(r).name)), h('div', { class: 'muted small' }, subjectDefinition(r).components.map((c) => `${c.label} ${c.maxMarks}`).join(' · '))) },
      { key: 'groups', label: tt('Groups', 'বিভাগ'), render: (r) => (r.groupIds ?? []).map((g) => nameOf(cats.groups, g)).join(', ') },
      { key: 'teachers', label: tt('Teacher(s)', 'শিক্ষক'), render: (r) => h('div', {}, (r.teacherIds ?? []).map((id) => tById[id]?.displayName ?? id).join(', ') || h('span', { class: 'text-bad' }, tt('Not assigned', 'নির্ধারিত নয়')),
        editableTeachers ? h('div', {}, h('button', { class: 'linklike', type: 'button', onclick: () => reassign(r) }, tt('Change', 'বদলান'))) : null) },
      { key: 'progress', label: tt('Progress', 'অগ্রগতি'), render: (r) => { const p = subjectProgress(bundle, marks, r.id); return h('div', {}, h('progress', { max: p.total || 1, value: p.complete }), ` ${fmtNum(p.complete)}/${fmtNum(p.total)}`, p.absent ? h('div', { class: 'muted small' }, tt('{n} absent', '{n} জন অনুপস্থিত', { n: p.absent })) : null); } },
      { key: 'submission', label: tt('Submission', 'জমা'), render: (r) => r.submission?.state === 'submitted' ? h('span', { class: 'badge badge--good' }, tt('Submitted', 'জমা হয়েছে')) : h('span', { class: 'badge badge--neutral' }, tt('Open', 'খোলা')) },
      { key: 'actions', label: '', render: (r) => h('div', { class: 'row-actions' },
        [ExamState.READY, ExamState.IN_PROGRESS, ExamState.SUBMITTED, ExamState.UNDER_REVIEW].includes(st) ? h('a', { class: 'btn btn--ghost btn--sm', href: `#/marks?sid=${encodeURIComponent(sid)}&subject=${encodeURIComponent(r.id)}` }, tt('Marks', 'নম্বর')) : null,
        r.submission?.state === 'submitted' && [ExamState.READY, ExamState.IN_PROGRESS].includes(st) ? button(tt('Reopen', 'আবার খুলুন'), { size: 'sm', onClick: async () => {
          const reason = await promptText({ title: tt('Reopen this subject?', 'বিষয়টি আবার খুলবেন?'), label: tt('Reason (shown to the teacher)', 'কারণ (শিক্ষক দেখবেন)'), confirmText: tt('Reopen', 'আবার খুলুন') });
          if (reason) act(() => marksRepo.reopenSubject(actor(), sid, r.id, reason), tt('Subject reopened', 'বিষয় আবার খোলা হয়েছে'));
        } }) : null) },
    ] }).el;
  }

  function reassign(subject) {
    const active = teachers.filter((x) => x.status === 'active');
    const sel = h('select', { class: 'input', multiple: true, size: Math.min(8, active.length), 'aria-label': tt('Teachers', 'শিক্ষক') }, active.map((x) => h('option', { value: x.id, selected: (subject.teacherIds ?? []).includes(x.id) }, x.displayName)));
    openModal({ title: tt('Teachers for {x}', '{x}-এর শিক্ষক', { x: L(subjectDefinition(subject).name) }),
      content: h('div', {}, sel, h('p', { class: 'muted' }, tt('Existing marks are kept and still show who entered them.', 'বিদ্যমান নম্বর থাকবে এবং কে দিয়েছেন তা দেখা যাবে।'))),
      actions: [{ label: t('common.cancel'), onClick: () => true }, { label: t('common.save'), kind: 'primary', onClick: async () => {
        const ids = [...sel.selectedOptions].map((o) => o.value);
        if (!ids.length) { toast(tt('Choose at least one teacher.', 'অন্তত একজন শিক্ষক বাছুন।'), 'error'); return false; }
        await act(() => sess.reassignTeachers(actor(), sid, subject.id, ids, Object.fromEntries(ids.map((i) => [i, tById[i]?.displayName ?? i]))), tt('Teachers updated', 'শিক্ষক হালনাগাদ হয়েছে'));
        return true;
      } }] });
  }

  function students() {
    const editable = [ExamState.DRAFT, ExamState.READY, ExamState.IN_PROGRESS].includes(st);
    const table = dataTable({ rows: bundle.enrollments, pageSize: 50, searchKeys: ['roll', (r) => L(r.name)],
      filters: [{ key: 'groupId', label: tt('Group', 'বিভাগ'), options: (s.groupIds ?? []).map((g) => ({ value: g, label: nameOf(cats.groups, g) })) }],
      rowClass: (r) => (r.status === 'withdrawn' ? 'is-muted' : ''),
      toolbar: editable && st !== ExamState.DRAFT ? [button(tt('Add late student', 'দেরিতে আসা শিক্ষার্থী যোগ'), { size: 'sm', icon: 'plus', onClick: addLate })] : [],
      columns: [
        { key: 'roll', label: tt('Roll', 'রোল'), sort: (r) => Number(r.roll) },
        { key: 'name', label: tt('Name', 'নাম'), render: (r) => L(r.name) },
        { key: 'groupId', label: tt('Group', 'বিভাগ'), render: (r) => nameOf(cats.groups, r.groupId) },
        { key: 'optional', label: tt('Optional subject', 'ঐচ্ছিক বিষয়'), render: (r) => (r.optionalSubjectId ? nameOf(cats.subjects, r.optionalSubjectId) : '—') },
        { key: 'status', label: tt('Status', 'অবস্থা'), render: (r) => (r.status === 'withdrawn' ? tt('Withdrawn', 'প্রত্যাহৃত') : tt('Sitting', 'অংশগ্রহণকারী')) },
        { key: 'a', label: '', render: (r) => editable && st !== ExamState.DRAFT ? button(r.status === 'withdrawn' ? tt('Restore', 'ফেরত আনুন') : tt('Withdraw', 'প্রত্যাহার'), { size: 'sm', onClick: async () => {
          if (r.status !== 'withdrawn' && !(await confirmDialog({ title: tt('Withdraw roll {r}?', 'রোল {r} প্রত্যাহার করবেন?', { r: r.roll }), body: tt('The student is left out of results. Marks already entered are kept.', 'শিক্ষার্থী ফলাফলে থাকবে না। দেওয়া নম্বর রাখা থাকবে।'), confirmText: tt('Withdraw', 'প্রত্যাহার') }))) return;
          act(() => sess.upsertEnrollment(actor(), sid, { ...r, studentId: r.studentId ?? r.id, status: r.status === 'withdrawn' ? 'active' : 'withdrawn' }), tt('Saved', 'সংরক্ষিত'));
        } }) : null },
      ] });
    return h('div', {}, st === ExamState.DRAFT ? h('p', { class: 'muted' }, tt('Edit the draft to change the student list.', 'শিক্ষার্থী তালিকা বদলাতে খসড়া সম্পাদনা করুন।')) : null, table.el);
  }

  async function addLate() {
    const { listClassRoster } = await import('../../data/repositories/students-repository.js');
    const roster = (await listClassRoster(s.yearId, s.classId)).filter((x) => !bundle.enrollments.some((e) => (e.studentId ?? e.id) === x.id) && (s.groupIds ?? []).includes(x.current.groupId));
    if (!roster.length) { toast(tt('Every active student of this class is already included. Add new students on the Students page first.', 'এই শ্রেণির সব সক্রিয় শিক্ষার্থী আগেই আছে। আগে শিক্ষার্থী পৃষ্ঠায় নতুন শিক্ষার্থী যোগ করুন।'), 'info'); return; }
    const sel = h('select', { class: 'input', 'aria-label': tt('Student', 'শিক্ষার্থী') }, roster.map((x) => h('option', { value: x.id }, `${x.current.roll} — ${x.nameEn}`)));
    openModal({ title: tt('Add late student', 'দেরিতে আসা শিক্ষার্থী যোগ'), content: sel, actions: [{ label: t('common.cancel'), onClick: () => true }, { label: tt('Add', 'যোগ করুন'), kind: 'primary', onClick: async () => {
      const x = roster.find((r) => r.id === sel.value);
      await act(() => sess.upsertEnrollment(actor(), sid, { studentId: x.id, roll: x.current.roll, name: { en: x.nameEn, bn: x.nameBn }, groupId: x.current.groupId, optionalSubjectId: x.current.optionalSubjectId ?? null, section: x.current.section, shift: x.current.shift }), tt('Student added', 'শিক্ষার্থী যোগ হয়েছে'));
      return true;
    } }] });
  }

  function missingTab() {
    if (!missing.length) return emptyState({ message: tt('No required marks are missing.', 'কোনো আবশ্যক নম্বর বাকি নেই।') });
    return dataTable({ rows: missing.map((m, i) => ({ ...m, id: String(i) })), pageSize: 50, searchKeys: ['roll', (r) => L(r.name)],
      filters: [{ key: 'subjectId', label: tt('Subject', 'বিষয়'), options: bundle.subjects.map((x) => ({ value: x.id, label: L(subjectDefinition(x).name) })) },
        { key: 'groupId', label: tt('Group', 'বিভাগ'), options: (s.groupIds ?? []).map((g) => ({ value: g, label: nameOf(cats.groups, g) })) }],
      columns: [
        { key: 'roll', label: tt('Roll', 'রোল'), sort: (r) => Number(r.roll) }, { key: 'name', label: tt('Name', 'নাম'), render: (r) => L(r.name) },
        { key: 'subjectId', label: tt('Subject', 'বিষয়'), render: (r) => L(subjectDefinition(bundle.subjects.find((x) => x.id === r.subjectId)).name) },
        { key: 'componentLabel', label: tt('Missing part', 'বাকি অংশ') },
        { key: 'teacher', label: tt('Teacher', 'শিক্ষক'), render: (r) => r.teacherIds.map((id) => tById[id]?.displayName ?? id).join(', ') },
        { key: 'state', label: tt('Exam status', 'পরীক্ষার অবস্থা'), render: () => t(`exam.state.${st}`) },
      ] }).el;
  }

  async function results(panel) {
    panel.replaceChildren(loadingState(tt('Calculating results…', 'ফলাফল হিসাব হচ্ছে…')));
    const resultsRepo = await import('../../data/repositories/results-repository.js');
    try {
      const frozen = [ExamState.PUBLISHED, ExamState.ARCHIVED].includes(st);
      let rows, summary, blocking = [];
      if (frozen) {
        const stored = await resultsRepo.listResults(sid);
        rows = stored.map((r) => ({ id: r.id, roll: r.roll, name: r.vm.student.name, groupId: r.groupId, total: r.totalObtained, gpa: r.gpa, grade: r.vm.grade, state: r.state, position: r.position }));
      } else {
        const c = await resultsRepo.computeSession(sid, { withPrivate: false });
        rows = c.sheet.rows.map((r, i) => ({ id: r.studentId, roll: r.roll, name: c.vms[i].student.name, groupId: r.groupId, total: r.result.totalObtained, gpa: r.result.gpa, grade: r.result.grade, state: r.result.state, position: r.position, failed: r.result.failedSubjects }));
        summary = c.sheet.summary; blocking = c.blocking;
      }
      const canPublish = st === ExamState.UNDER_REVIEW && !blocking.length;
      panel.replaceChildren(
        frozen ? h('p', { class: 'notice' }, tt('These are the published results. They do not change when settings change.', 'এগুলো প্রকাশিত ফলাফল। সেটিংস বদলালেও এগুলো বদলায় না।'))
          : h('p', { class: 'notice notice--locked' }, tt('Preview calculated with the current grading settings. Nothing is visible to students until you publish.', 'বর্তমান গ্রেডিং সেটিংস দিয়ে হিসাব করা প্রাকদর্শন। প্রকাশ না করা পর্যন্ত শিক্ষার্থীরা কিছু দেখবে না।')),
        summary ? h('p', {}, tt('Passed {p} · Failed {f} · Incomplete {i}', 'উত্তীর্ণ {p} · অনুত্তীর্ণ {f} · অসম্পূর্ণ {i}', { p: summary.passed, f: summary.failed, i: summary.incomplete })) : null,
        blocking.length ? h('p', { class: 'notice notice--bad' }, tt('{n} student(s) have missing or invalid marks. They are not ranked and the sheet cannot be published until this is fixed (see Missing marks).', '{n} জন শিক্ষার্থীর নম্বর বাকি বা ভুল। তাদের মেধাস্থান হবে না এবং ঠিক না হওয়া পর্যন্ত প্রকাশ করা যাবে না (বাকি নম্বর দেখুন)।', { n: blocking.length })) : null,
        st === ExamState.UNDER_REVIEW ? h('div', { class: 'row-actions' }, button(s.correction ? tt('Publish corrected results', 'সংশোধিত ফলাফল প্রকাশ') : tt('Publish results', 'ফলাফল প্রকাশ'), { kind: 'primary', disabled: !canPublish, onClick: () => publish() })) : null,
        dataTable({ rows, pageSize: 50, searchKeys: ['roll', (r) => L(r.name)],
          filters: [{ key: 'groupId', label: tt('Group', 'বিভাগ'), options: (s.groupIds ?? []).map((g) => ({ value: g, label: nameOf(cats.groups, g) })) },
            { key: 'state', label: tt('Result', 'ফলাফল'), options: [['PASSED', tt('Passed', 'উত্তীর্ণ')], ['FAILED', tt('Failed', 'অনুত্তীর্ণ')], ['INCOMPLETE', tt('Incomplete', 'অসম্পূর্ণ')]].map(([value, label]) => ({ value, label })) }],
          rowClass: (r) => (r.state === 'INCOMPLETE' ? 'is-error' : r.state === 'FAILED' ? 'is-fail' : ''),
          columns: [
            { key: 'roll', label: tt('Roll', 'রোল'), sort: (r) => Number(r.roll) }, { key: 'name', label: tt('Name', 'নাম'), render: (r) => L(r.name) },
            { key: 'groupId', label: tt('Group', 'বিভাগ'), render: (r) => nameOf(cats.groups, r.groupId) },
            { key: 'total', label: tt('Total', 'মোট'), sortable: true, render: (r) => fmtNum(r.total, 2) }, { key: 'gpa', label: 'GPA', sortable: true, render: (r) => fmtNum(r.gpa, 2) },
            { key: 'grade', label: tt('Grade', 'গ্রেড') },
            { key: 'state', label: tt('Result', 'ফলাফল'), render: (r) => ({ PASSED: tt('Passed', 'উত্তীর্ণ'), FAILED: tt('Failed', 'অনুত্তীর্ণ'), INCOMPLETE: tt('Incomplete', 'অসম্পূর্ণ') }[r.state]) },
            { key: 'position', label: tt('Merit', 'মেধা'), sort: (r) => r.position ?? 1e9, render: (r) => fmtNum(r.position) },
          ] }).el);
    } catch (e) { panel.replaceChildren(errorState({ message: friendlyError(e) })); }
  }

  async function publish() {
    const reason = s.correction ? await promptText({ title: tt('Publish corrected results', 'সংশোধিত ফলাফল প্রকাশ'), label: tt('What was corrected?', 'কী সংশোধন করা হয়েছে?'), confirmText: tt('Publish', 'প্রকাশ করুন') }) : null;
    if (s.correction && !reason) return;
    if (!s.correction && !(await confirmDialog({ title: tt('Publish these results?', 'এই ফলাফল প্রকাশ করবেন?'), body: tt('Students will be able to look up and print their marksheets. The grading rules in use now are saved with this publication.', 'শিক্ষার্থীরা মার্কশিট দেখতে ও প্রিন্ট করতে পারবে। এখনকার গ্রেডিং নিয়ম এই প্রকাশনার সাথে সংরক্ষিত থাকবে।'), confirmText: tt('Publish', 'প্রকাশ করুন'), requireText: 'PUBLISH' }))) return;
    const progress = h('progress', { max: 1, value: 0 });
    const m = openModal({ title: tt('Publishing…', 'প্রকাশ হচ্ছে…'), content: h('div', {}, progress, h('p', { class: 'muted' }, tt('Keep this page open.', 'পৃষ্ঠাটি খোলা রাখুন।'))), actions: [{ label: t('common.close'), onClick: () => true }] });
    try {
      const { publishResults } = await import('../../data/repositories/results-repository.js');
      const r = await publishResults(actor(), sid, { reason, onProgress: (d, total) => { progress.max = total; progress.value = d; } });
      m.close();
      toast(tt('Published version {v}.', 'সংস্করণ {v} প্রকাশিত।', { v: r.version }), 'success');
      if (r.unverifiable.length) toast(tt('{n} student(s) have no verification value and cannot be found in public lookup: rolls {r}.', '{n} জন শিক্ষার্থীর যাচাই তথ্য নেই, তাই পাবলিক অনুসন্ধানে পাওয়া যাবে না: রোল {r}।', { n: r.unverifiable.length, r: r.unverifiable.join(', ') }), 'error');
      reload('results');
    } catch (e) { m.close(); toast(friendlyError(e), 'error'); }
  }

  async function history(panel) {
    const { listPublications } = await import('../../data/repositories/results-repository.js');
    const pubs = await listPublications(sid);
    panel.replaceChildren(pubs.length ? h('ul', { class: 'sheet-list' }, pubs.map((p) => h('li', { class: 'sheet-row' },
      h('div', { class: 'sheet-row__head' }, h('strong', {}, tt('Version {v}', 'সংস্করণ {v}', { v: p.version })), h('span', { class: 'muted' }, fmtDate(p.publishedAt, { time: true }))),
      h('p', {}, tt('By {n}', 'প্রকাশক {n}', { n: p.byName ?? p.by }), p.reason ? ` — ${tt('Correction', 'সংশোধন')}: ${p.reason}` : ''),
      h('p', { class: 'muted small' }, tt('Passed {a}, failed {b}. Calculation fingerprint {f}.', 'উত্তীর্ণ {a}, অনুত্তীর্ণ {b}। হিসাবের চিহ্ন {f}।', { a: p.summary?.passed ?? 0, b: p.summary?.failed ?? 0, f: p.fingerprint })))))
      : emptyState({ message: tt('Not published yet.', 'এখনো প্রকাশিত হয়নি।') }));
  }
}
