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
  // Head counts (cheap server-side counts) for the current session.
  const [stats, { loadAllCatalogues }] = await Promise.all([import('../../data/repositories/stats-repository.js'), import('../../data/repositories/catalogue-repository.js')]);
  const cats = await loadAllCatalogues();
  const year = cats.years.find((y) => y.active) ?? cats.years.at(-1);
  const classes = cats.classes.filter((c) => c.active !== false), groups = cats.groups.filter((g) => g.active !== false);
  const [teachers, staff, students] = await Promise.all([stats.countActiveTeachers().catch(() => null), stats.countActiveStaff().catch(() => null),
    year ? stats.studentCounts(year.id, classes, groups).catch(() => ({})) : {}]);
  return { pending, sessions, grading, counts: { teachers, staff, students, year, classes, groups } };
}

function headCounts({ teachers, staff, students, year, classes, groups }) {
  const totalStudents = Object.values(students ?? {}).reduce((a, c) => a + (c.total ?? 0), 0);
  return h('section', { class: 'headcount' },
    h('div', { class: 'stats' },
      stat(tt('Teachers', 'শিক্ষক'), teachers ?? '—', '#/admin/teachers'),
      stat(tt('Staff', 'কর্মচারী'), staff ?? '—', '#/admin/staff'),
      stat(year ? tt('Students ({y})', 'শিক্ষার্থী ({y})', { y: year.label }) : tt('Students', 'শিক্ষার্থী'), totalStudents, '#/admin/students')),
    classes.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'mini-table headcount__table' },
      h('thead', {}, h('tr', {}, h('th', {}, tt('Class', 'শ্রেণি')), groups.map((g) => h('th', {}, L(g.name))), h('th', {}, tt('Total', 'মোট')))),
      h('tbody', {}, classes.map((c) => h('tr', {}, h('th', {}, L(c.name)),
        groups.map((g) => h('td', {}, students?.[c.id]?.byGroup?.[g.id] ?? '—')), h('td', { class: 'strong' }, students?.[c.id]?.total ?? 0)))))) : null);
}

function stat(label, value, href) {
  const body = [h('span', { class: 'stat__value' }, formatNumber(value)), h('span', { class: 'stat__label' }, label)];
  return href ? h('a', { class: 'stat', href }, body) : h('div', { class: 'stat' }, body);
}

function view({ pending, sessions, grading, counts }) {
  const open = sessions.filter((s) => [ExamState.READY, ExamState.IN_PROGRESS].includes(s.state));
  const review = sessions.filter((s) => [ExamState.SUBMITTED, ExamState.UNDER_REVIEW].includes(s.state));
  const year = String(new Date().getFullYear());
  const published = sessions.filter((s) => s.state === ExamState.PUBLISHED && s.yearId === year);
  const active = sessions.filter((s) => s.state !== ExamState.ARCHIVED).slice(0, 8);
  return h('div', {},
    !grading._exists ? h('div', { class: 'notice notice--locked' }, h('p', { class: 'notice__title' }, tt('Confirm the grading rules', 'গ্রেডিং নিয়ম নিশ্চিত করুন')),
      h('p', {}, tt('The grade scale and pass rules are still the starting preset. Review them before publishing any result.', 'গ্রেড স্কেল ও পাসের নিয়ম এখনো প্রাথমিক মান। কোনো ফলাফল প্রকাশের আগে যাচাই করুন।')),
      h('a', { class: 'btn btn--ghost btn--sm', href: '#/settings?section=grading' }, tt('Open grading settings', 'গ্রেডিং সেটিংস খুলুন'))) : null,
    headCounts(counts),
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
