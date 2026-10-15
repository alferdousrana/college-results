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

export function render() {
  const body = h('div');
  const uid = getState().authUser.uid;
  asyncSection(body, async () => {
    const [{ listTeacherSessions, loadSessionBundle }, { listMarks }, { listAssignments }, { loadAllCatalogues }] = await Promise.all([
      import('../../data/repositories/sessions-repository.js'), import('../../data/repositories/marks-repository.js'),
      import('../../data/repositories/assignments-repository.js'), import('../../data/repositories/catalogue-repository.js')]);
    const sessions = (await listTeacherSessions(uid)).filter((s) => [ExamState.READY, ExamState.IN_PROGRESS, ExamState.SUBMITTED, ExamState.UNDER_REVIEW].includes(s.state));
    const cards = [];
    for (const s of sessions) {
      const bundle = await loadSessionBundle(s.id);
      const mine = bundle.subjects.filter((x) => (x.teacherIds ?? []).includes(uid));
      const progress = [];
      for (const sub of mine) progress.push({ sub, p: subjectProgress(bundle, { [sub.id]: await listMarks(s.id, sub.id) }, sub.id) });
      cards.push({ s, progress });
    }
    return { cards, assignments: await listAssignments({ teacherId: uid }), cats: await loadAllCatalogues() };
  }, ({ cards, assignments, cats }) => h('div', {},
    cards.length ? h('div', { class: 'exam-cards' }, cards.map(({ s, progress }) => h('article', { class: 'exam-card' },
      h('div', { class: 'sheet-row__head' }, h('h2', { class: 'exam-card__title' }, L(s.title)), examStateBadge(s.state)),
      h('ul', { class: 'subject-progress' }, progress.map(({ sub, p }) => h('li', {},
        h('a', { href: `#/marks?sid=${encodeURIComponent(s.id)}&subject=${encodeURIComponent(sub.id)}` }, L(subjectDefinition(sub).name)),
        h('span', { class: 'muted' }, tt('{a} of {b} complete', '{b}টির মধ্যে {a}টি সম্পূর্ণ', { a: p.complete, b: p.total })),
        h('progress', { max: p.total || 1, value: p.complete }),
        sub.submission?.state === 'submitted' ? h('span', { class: 'badge badge--good' }, tt('Submitted', 'জমা হয়েছে')) : p.missingCells ? h('span', { class: 'badge badge--warn' }, tt('{n} missing', '{n}টি বাকি', { n: p.missingCells })) : h('span', { class: 'badge badge--info' }, tt('Ready to submit', 'জমার জন্য প্রস্তুত'))))),
      h('a', { class: 'btn btn--ghost btn--sm', href: `#/teacher/exam?sid=${encodeURIComponent(s.id)}` }, tt('Open examination', 'পরীক্ষা খুলুন')))))
      : emptyState({ message: t('dash.noAssignments') }),
    h('h2', { class: 'section-title' }, tt('Your subjects', 'আপনার বিষয়')),
    assignments.length ? h('ul', { class: 'chip-list' }, assignments.map((a) => h('li', { class: 'chip' }, `${L(cats.subjects.find((x) => x.id === a.subjectId)?.name) || a.subjectId} — ${L(cats.classes.find((x) => x.id === a.classId)?.name) || a.classId}`)))
      : h('p', { class: 'muted' }, tt('No subjects are assigned to you yet.', 'এখনো আপনাকে কোনো বিষয় দেওয়া হয়নি।')),
    h('p', {}, h('a', { href: '#/teacher/history' }, tt('Published results and past examinations', 'প্রকাশিত ফলাফল ও পূর্ববর্তী পরীক্ষা'))),
  ), { errorMessage: t('dash.loadFailed') });
  return h('section', { class: 'page' }, pageHeader({ title: t('dash.teacherTitle') }), body);
}
