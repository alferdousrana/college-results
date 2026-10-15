import { h } from '../../core/dom.js';
import { t, tt, formatNumber, L } from '../../i18n/index.js';
import { asyncSection, emptyState } from '../../ui/components/states.js';
import { examStateBadge, lifecycleStrip } from '../../ui/components/status-badge.js';
import { pageHeader, linkButton } from '../../ui/components/page.js';
import { ExamState } from '../../domain/exam-lifecycle.js';
import { fmtDate } from '../../ui/format.js';

export const title = 'dash.adminTitle';

async function load() {
  const [{ listUsersByStatus }, { listSessions }, { getSetting }] = await Promise.all([
    import('../../data/repositories/users-repository.js'),
    import('../../data/repositories/sessions-repository.js'),
    import('../../data/repositories/settings-repository.js'),
  ]);
  const [pending, sessions, grading] = await Promise.all([listUsersByStatus('pending', 50), listSessions({ limit: 30 }), getSetting('grading')]);
  return { pending, sessions, grading };
}

function stat(label, value, href) {
  const body = [h('span', { class: 'stat__value' }, formatNumber(value)), h('span', { class: 'stat__label' }, label)];
  return href ? h('a', { class: 'stat', href }, body) : h('div', { class: 'stat' }, body);
}

function view({ pending, sessions, grading }) {
  const open = sessions.filter((s) => [ExamState.READY, ExamState.IN_PROGRESS].includes(s.state));
  const review = sessions.filter((s) => [ExamState.SUBMITTED, ExamState.UNDER_REVIEW].includes(s.state));
  const year = String(new Date().getFullYear());
  const published = sessions.filter((s) => s.state === ExamState.PUBLISHED && s.yearId === year);
  const active = sessions.filter((s) => s.state !== ExamState.ARCHIVED).slice(0, 8);
  return h('div', {},
    !grading._exists ? h('div', { class: 'notice notice--locked' }, h('p', { class: 'notice__title' }, tt('Confirm the grading rules', 'গ্রেডিং নিয়ম নিশ্চিত করুন')),
      h('p', {}, tt('The grade scale and pass rules are still the starting preset. Review them before publishing any result.', 'গ্রেড স্কেল ও পাসের নিয়ম এখনো প্রাথমিক মান। কোনো ফলাফল প্রকাশের আগে যাচাই করুন।')),
      h('a', { class: 'btn btn--ghost btn--sm', href: '#/settings?section=grading' }, tt('Open grading settings', 'গ্রেডিং সেটিংস খুলুন'))) : null,
    h('div', { class: 'stats' },
      stat(t('dash.pendingTeachers'), pending.length, '#/admin/teachers'),
      stat(t('dash.openSheets'), open.length, '#/admin/sheets'),
      stat(t('dash.awaitingReview'), review.length, '#/admin/sheets'),
      stat(t('dash.published'), published.length, '#/admin/archive')),
    h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, tt('Active result sheets', 'চলমান ফলাফল শিট')), linkButton(t('dash.createSheet'), '#/admin/sheet/new', { kind: 'primary', icon: 'plus' })),
    active.length
      ? h('ul', { class: 'sheet-list' }, active.map((s) => h('li', { class: 'sheet-row' },
          h('div', { class: 'sheet-row__head' }, h('a', { class: 'sheet-row__title', href: `#/admin/sheet?sid=${encodeURIComponent(s.id)}` }, L(s.title) || s.id), examStateBadge(s.state)),
          h('p', { class: 'muted' }, tt('{s} students · {n} subjects · updated {d}', '{s} জন শিক্ষার্থী · {n}টি বিষয় · হালনাগাদ {d}', { s: s.studentCount ?? 0, n: s.subjectCount ?? 0, d: fmtDate(s.updatedAt) })),
          lifecycleStrip(s.state))))
      : emptyState({ message: t('dash.noSheets') }));
}

export function render() {
  const body = h('div');
  asyncSection(body, load, view, { errorMessage: t('dash.loadFailed') });
  return h('section', { class: 'page' }, pageHeader({ title: t('dash.adminTitle') }), body);
}
