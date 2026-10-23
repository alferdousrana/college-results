import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { getState } from '../../core/store.js';
import { asyncSection, emptyState } from '../../ui/components/states.js';
import { examStateBadge } from '../../ui/components/status-badge.js';
import { pageHeader } from '../../ui/components/page.js';
import { ExamState } from '../../domain/exam-lifecycle.js';
import { subjectDefinition, subjectProgress } from '../../domain/session-calc.js';
import { fmtNum } from '../../ui/format.js';

export const title = 'dash.teacherTitle';

const PALETTE = ['#0E6B57', '#1D5C8F', '#8A4FB5', '#B7591F', '#2F7D32', '#A6345B', '#00796B', '#5D4037'];

export function render() {
  const body = h('div');
  const { authUser, profile } = getState();
  const uid = authUser.uid;
  asyncSection(body, async () => {
    const [{ listTeacherSessions, loadSessionBundle }, { listMarks }, { listAssignments }, { loadAllCatalogues }] = await Promise.all([
      import('../../data/repositories/sessions-repository.js'), import('../../data/repositories/marks-repository.js'),
      import('../../data/repositories/assignments-repository.js'), import('../../data/repositories/catalogue-repository.js')]);
    const all = await listTeacherSessions(uid);
    const open = all.filter((s) => [ExamState.READY, ExamState.IN_PROGRESS].includes(s.state));
    const waiting = all.filter((s) => [ExamState.SUBMITTED, ExamState.UNDER_REVIEW].includes(s.state));
    const published = all.filter((s) => [ExamState.PUBLISHED, ExamState.ARCHIVED].includes(s.state)).slice(0, 5);
    const cards = [];
    for (const s of [...open, ...waiting]) {
      const bundle = await loadSessionBundle(s.id);
      const mine = bundle.subjects.filter((x) => (x.teacherIds ?? []).includes(uid));
      const progress = [];
      for (const sub of mine) progress.push({ sub, p: subjectProgress(bundle, { [sub.id]: await listMarks(s.id, sub.id) }, sub.id) });
      cards.push({ s, progress });
    }
    return { cards, open, waiting, published, assignments: await listAssignments({ teacherId: uid }), cats: await loadAllCatalogues() };
  }, ({ cards, open, waiting, published, assignments, cats }) => {
    // Subjects: one tile per subject, listing the classes it is assigned for.
    const bySubject = new Map();
    for (const a of assignments) { if (!bySubject.has(a.subjectId)) bySubject.set(a.subjectId, []); bySubject.get(a.subjectId).push(a.classId); }
    const tiles = [...bySubject.entries()].map(([sid, classIds], i) => {
      const sub = cats.subjects.find((x) => x.id === sid);
      const code = sub?.papers ? [sub.papers.first, sub.papers.second].filter(Boolean).join(' / ') : sub?.code;
      const groups = (sub?.groupIds ?? []).map((g) => L(cats.groups.find((x) => x.id === g)?.name)).filter(Boolean);
      return h('li', { class: 'subject-tile', style: `--tile:${PALETTE[i % PALETTE.length]}` },
        h('span', { class: 'subject-tile__name' }, L(sub?.name) || sid),
        code ? h('span', { class: 'subject-tile__code' }, `${tt('Code', 'কোড')} ${code}`) : null,
        h('span', { class: 'subject-tile__meta' }, classIds.map((c) => L(cats.classes.find((x) => x.id === c)?.name) || c).join(' · ')),
        groups.length && groups.length < cats.groups.length ? h('span', { class: 'subject-tile__meta' }, groups.join(', ')) : null);
    });
    const allDone = !open.length;
    return h('div', { class: 'teacher-home' },
      h('section', { class: `teacher-status ${allDone ? 'is-done' : ''}` },
        h('div', { class: 'teacher-status__icon', 'aria-hidden': 'true' }, allDone ? '✓' : '✎'),
        h('div', {},
          h('h2', {}, allDone
            ? (waiting.length ? tt('All your marks are submitted', 'আপনার সব নম্বর জমা হয়েছে') : tt('Nothing to enter right now', 'এই মুহূর্তে নম্বর দেওয়ার কিছু নেই'))
            : tt('{n} examination(s) open for mark entry', '{n}টি পরীক্ষায় নম্বর দেওয়া চলছে', { n: open.length })),
          h('p', { class: 'muted' }, allDone
            ? (waiting.length ? tt('The administrator is reviewing them. You will be notified when results are published.', 'প্রশাসক যাচাই করছেন। ফলাফল প্রকাশ হলে আপনাকে জানানো হবে।') : tt('When the administrator shares an examination it will appear here and you will get a notification.', 'প্রশাসক কোনো পরীক্ষা শেয়ার করলে এখানে দেখাবে এবং আপনি বিজ্ঞপ্তি পাবেন।'))
            : tt('Open a subject below to enter marks. Marks save automatically.', 'নম্বর দিতে নিচের বিষয় খুলুন। নম্বর নিজে থেকে সংরক্ষিত হয়।')))),
      cards.length ? h('div', { class: 'exam-cards' }, cards.map(({ s, progress }) => h('article', { class: 'exam-card' },
        h('div', { class: 'sheet-row__head' }, h('h2', { class: 'exam-card__title' }, L(s.title)), examStateBadge(s.state)),
        h('ul', { class: 'subject-progress' }, progress.map(({ sub, p }) => h('li', {},
          h('a', { href: `#/marks?sid=${encodeURIComponent(s.id)}&subject=${encodeURIComponent(sub.id)}` }, L(subjectDefinition(sub).name)),
          h('span', { class: 'muted' }, tt('{a} of {b} complete', '{b}টির মধ্যে {a}টি সম্পূর্ণ', { a: p.complete, b: p.total })),
          h('progress', { max: p.total || 1, value: p.complete }),
          sub.submission?.state === 'submitted' ? h('span', { class: 'badge badge--good' }, tt('Submitted', 'জমা হয়েছে')) : p.missingCells ? h('span', { class: 'badge badge--warn' }, tt('{n} missing', '{n}টি বাকি', { n: p.missingCells })) : h('span', { class: 'badge badge--info' }, tt('Ready to submit', 'জমার জন্য প্রস্তুত'))))),
        h('a', { class: 'btn btn--ghost btn--sm', href: `#/teacher/exam?sid=${encodeURIComponent(s.id)}` }, tt('Open examination', 'পরীক্ষা খুলুন'))))) : null,
      h('h2', { class: 'section-title' }, tt('Your subjects', 'আপনার বিষয়')),
      tiles.length ? h('ul', { class: 'subject-tiles' }, tiles) : h('p', { class: 'muted' }, tt('No subjects are assigned to you yet.', 'এখনো আপনাকে কোনো বিষয় দেওয়া হয়নি।')),
      published.length ? [h('h2', { class: 'section-title' }, tt('Recently published', 'সম্প্রতি প্রকাশিত')),
        h('ul', { class: 'sheet-list' }, published.map((s) => h('li', { class: 'sheet-row' }, h('div', { class: 'sheet-row__head' },
          h('strong', {}, L(s.title)), h('a', { class: 'btn btn--ghost btn--sm', href: `#/results?sid=${encodeURIComponent(s.id)}` }, tt('View results', 'ফলাফল দেখুন'))))))] : null,
      h('p', {}, h('a', { class: 'btn btn--ghost btn--sm', href: '#/teacher/history' }, tt('All past examinations', 'সব পূর্ববর্তী পরীক্ষা'))));
  }, { errorMessage: t('dash.loadFailed') });
  return h('section', { class: 'page' }, pageHeader({ title: tt('Welcome, {n}', 'স্বাগতম, {n}', { n: profile?.displayName ?? '' }), subtitle: t('dash.teacherTitle') }), body);
}
