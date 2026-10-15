import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { getState } from '../../core/store.js';
import { asyncSection } from '../../ui/components/states.js';
import { examStateBadge } from '../../ui/components/status-badge.js';
import { pageHeader } from '../../ui/components/page.js';
import { dataTable } from '../../ui/components/data-table.js';
import { ExamState } from '../../domain/exam-lifecycle.js';
import { nameOf } from '../_shared.js';
import { fmtDate } from '../../ui/format.js';

export const title = 'nav.history';

export function render() {
  const body = h('div');
  asyncSection(body, async () => {
    const [{ listTeacherSessions }, { loadAllCatalogues }] = await Promise.all([import('../../data/repositories/sessions-repository.js'), import('../../data/repositories/catalogue-repository.js')]);
    return { sessions: await listTeacherSessions(getState().authUser.uid, 200), cats: await loadAllCatalogues() };
  }, ({ sessions, cats }) => dataTable({ rows: sessions, searchKeys: [(r) => L(r.title)], empty: tt('No examinations yet.', 'এখনো কোনো পরীক্ষা নেই।'),
    filters: [{ key: 'yearId', label: tt('Year', 'বছর'), options: cats.years.map((y) => ({ value: y.id, label: y.label })) }],
    columns: [
      { key: 'title', label: tt('Examination', 'পরীক্ষা'), render: (r) => L(r.title) }, { key: 'classId', label: tt('Class', 'শ্রেণি'), render: (r) => nameOf(cats.classes, r.classId) },
      { key: 'state', label: tt('Status', 'অবস্থা'), render: (r) => examStateBadge(r.state) }, { key: 'updatedAt', label: tt('Updated', 'হালনাগাদ'), render: (r) => fmtDate(r.updatedAt) },
      { key: 'go', label: '', render: (r) => [ExamState.PUBLISHED, ExamState.ARCHIVED].includes(r.state)
        ? h('a', { class: 'btn btn--ghost btn--sm', href: `#/results?sid=${encodeURIComponent(r.id)}` }, tt('Results', 'ফলাফল'))
        : h('a', { class: 'btn btn--ghost btn--sm', href: `#/teacher/exam?sid=${encodeURIComponent(r.id)}` }, tt('Open', 'খুলুন')) },
    ] }).el, { errorMessage: t('dash.loadFailed') });
  return h('section', { class: 'page' }, pageHeader({ title: t('nav.history') }), body);
}
