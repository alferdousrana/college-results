/**
 * College overview for teachers and administrators — VIEW ONLY.
 * Head counts, students by class and group, published result sheets, teachers and subjects.
 * Nothing here changes data; firestore.rules (isViewer) allow exactly these reads.
 */
import { h } from '../core/dom.js';
import { tt, L, formatNumber } from '../i18n/index.js';
import { getState } from '../core/store.js';
import { asyncSection, emptyState } from '../ui/components/states.js';
import { pageHeader, linkButton } from '../ui/components/page.js';
import { fmtDate } from '../ui/format.js';
import { nameOf } from './_shared.js';
import { hasGrant, Grant, ROLE_LABELS } from '../auth/roles.js';

export const title = 'nav.overview';

async function load() {
  const [{ loadAllCatalogues }, stats, { listPublishedSessions }, { listActiveTeacherNames }] = await Promise.all([
    import('../data/repositories/catalogue-repository.js'), import('../data/repositories/stats-repository.js'),
    import('../data/repositories/sessions-repository.js'), import('../data/repositories/users-repository.js')]);
  const cats = await loadAllCatalogues();
  const year = cats.years.find((y) => y.active) ?? cats.years.at(-1) ?? null;
  const classes = cats.classes.filter((c) => c.active !== false);
  const groups = cats.groups.filter((g) => g.active !== false);
  const [students, teachers, published] = await Promise.all([
    year ? stats.studentCounts(year.id, classes, groups).catch(() => ({})) : {},
    listActiveTeacherNames().catch(() => null),
    listPublishedSessions().catch(() => null),
  ]);
  return { cats, year, classes, groups, students, teachers, published };
}

function stat(label, value, href = null) {
  const body = [h('span', { class: 'stat__value' }, value == null ? '—' : formatNumber(value)), h('span', { class: 'stat__label' }, label)];
  return href ? h('a', { class: 'stat', href }, body) : h('div', { class: 'stat' }, body);
}

function view({ cats, year, classes, groups, students, teachers, published }) {
  const totalStudents = Object.values(students ?? {}).reduce((a, c) => a + (c.total ?? 0), 0);
  const subjects = cats.subjects.filter((s) => s.active !== false);
  const pubList = published ?? [];

  const studentTable = classes.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'mini-table headcount__table' },
    h('thead', {}, h('tr', {}, h('th', {}, tt('Class', 'শ্রেণি')), groups.map((g) => h('th', {}, L(g.name))), h('th', {}, tt('Total', 'মোট')))),
    h('tbody', {}, classes.map((c) => h('tr', {}, h('th', {}, L(c.name)),
      groups.map((g) => h('td', {}, students?.[c.id]?.byGroup?.[g.id] != null ? formatNumber(students[c.id].byGroup[g.id]) : '—')),
      h('td', { class: 'strong' }, formatNumber(students?.[c.id]?.total ?? 0))))))) : null;

  const publishedSection = pubList.length
    ? h('ul', { class: 'sheet-list' }, pubList.map((s) => h('li', { class: 'sheet-row' },
        h('div', { class: 'sheet-row__head' },
          h('div', {}, h('p', { class: 'sheet-row__title' }, L(s.title) || s.id),
            h('p', { class: 'muted small' }, [nameOf(cats.classes, s.classId), cats.years.find((y) => y.id === s.yearId)?.label ?? s.yearId,
              tt('{n} students', '{n} জন শিক্ষার্থী', { n: s.studentCount ?? 0 }),
              s.publishedAt ? tt('published {d}', 'প্রকাশ {d}', { d: fmtDate(s.publishedAt) }) : null].filter(Boolean).join(' · '))),
          h('a', { class: 'btn btn--ghost btn--sm', href: `#/results?sid=${encodeURIComponent(s.id)}&from=overview` }, tt('View results', 'ফলাফল দেখুন'))))))
    : emptyState({ message: published === null ? tt('Published results could not be loaded.', 'প্রকাশিত ফলাফল লোড করা যায়নি।') : tt('No results have been published yet.', 'এখনো কোনো ফলাফল প্রকাশিত হয়নি।') });

  const subjectsByGroup = groups.map((g) => ({ g, list: subjects.filter((s) => !s.groupIds?.length || s.groupIds.includes(g.id)) })).filter((x) => x.list.length);

  return h('div', { class: 'overview' },
    h('div', { class: 'stats overview__stats' },
      stat(year ? tt('Students ({y})', 'শিক্ষার্থী ({y})', { y: year.label }) : tt('Students', 'শিক্ষার্থী'), totalStudents, '#/admin/students'),
      stat(tt('Teachers', 'শিক্ষক'), teachers?.length ?? null),
      stat(tt('Subjects', 'বিষয়'), subjects.length),
      stat(tt('Published results', 'প্রকাশিত ফলাফল'), published?.length ?? null)),

    h('section', { class: 'overview__block' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, tt('Students by class and group', 'শ্রেণি ও বিভাগ অনুযায়ী শিক্ষার্থী')),
        linkButton(tt('Student list', 'শিক্ষার্থীর তালিকা'), '#/admin/students', { icon: 'users' })),
      studentTable ?? emptyState({ message: tt('No classes yet.', 'এখনো কোনো শ্রেণি নেই।') })),

    h('section', { class: 'overview__block' },
      h('h2', { class: 'section-title' }, tt('Published results', 'প্রকাশিত ফলাফল')), publishedSection),

    h('div', { class: 'overview__two' },
      h('section', { class: 'overview__block card' },
        h('h2', { class: 'section-title' }, tt('Teachers', 'শিক্ষকবৃন্দ'), ' ', h('span', { class: 'muted small' }, teachers ? `(${formatNumber(teachers.length)})` : '')),
        teachers?.length ? h('ol', { class: 'overview__people' }, teachers.map((x) => h('li', {}, x.displayName)))
          : h('p', { class: 'muted' }, teachers === null ? tt('The teacher list could not be loaded.', 'শিক্ষকের তালিকা লোড করা যায়নি।') : tt('No teachers yet.', 'এখনো কোনো শিক্ষক নেই।'))),
      h('section', { class: 'overview__block card' },
        h('h2', { class: 'section-title' }, tt('Subjects', 'বিষয়সমূহ'), ' ', h('span', { class: 'muted small' }, `(${formatNumber(subjects.length)})`)),
        subjectsByGroup.length ? subjectsByGroup.map(({ g, list }) => h('div', { class: 'overview__subjects' },
          h('h3', { class: 'overview__group' }, L(g.name)),
          h('ul', { class: 'chip-list' }, list.map((s) => h('li', { class: 'chip' }, L(s.name))))))
          : h('p', { class: 'muted' }, tt('No subjects yet.', 'এখনো কোনো বিষয় নেই।')))));
}

export function render() {
  const { profile } = getState();
  const body = h('div');
  asyncSection(body, load, view, { errorMessage: tt('Could not load the overview.', 'সার্বিক চিত্র লোড করা যায়নি।') });
  const canEditStudents = hasGrant(profile, Grant.STUDENTS);
  return h('section', { class: 'page' },
    pageHeader({ title: tt('College overview', 'কলেজের সার্বিক চিত্র'),
      subtitle: canEditStudents
        ? tt('You can see these figures. Of these, you may also add and edit students.', 'আপনি এই তথ্যগুলো দেখতে পারবেন। এর মধ্যে শিক্ষার্থী যোগ ও সম্পাদনাও করতে পারবেন।')
        : tt('View only — {r} accounts can see these figures but cannot change them.', 'শুধু দেখার জন্য — {r} অ্যাকাউন্ট থেকে এই তথ্য দেখা যায়, বদলানো যায় না।', { r: L(ROLE_LABELS[profile?.role] ?? ROLE_LABELS.teacher) }) }),
    body);
}
