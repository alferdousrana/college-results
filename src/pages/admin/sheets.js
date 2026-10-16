import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { asyncSection } from '../../ui/components/states.js';
import { examStateBadge } from '../../ui/components/status-badge.js';
import { pageHeader, linkButton } from '../../ui/components/page.js';
import { dataTable } from '../../ui/components/data-table.js';
import { LIFECYCLE_ORDER } from '../../domain/exam-lifecycle.js';
import { fmtDate } from '../../ui/format.js';
import { nameOf } from '../_shared.js';

export const title = 'nav.resultSheets';

export function render() {
  const body = h('div');
  asyncSection(body, async () => {
    const [{ listSessions }, { loadAllCatalogues }] = await Promise.all([import('../../data/repositories/sessions-repository.js'), import('../../data/repositories/catalogue-repository.js')]);
    return { sessions: await listSessions({ limit: 200 }), cats: await loadAllCatalogues() };
  }, ({ sessions, cats }) => dataTable({
    rows: sessions, pageSize: 20, empty: t('dash.noSheets'),
    searchKeys: [(r) => L(r.title), 'id'],
    filters: [
      { key: 'yearId', label: tt('Session', 'সেশন'), options: cats.years.map((y) => ({ value: y.id, label: y.label })) },
      { key: 'classId', label: tt('Class', 'শ্রেণি'), options: cats.classes.map((c) => ({ value: c.id, label: L(c.name) })) },
      { key: 'state', label: tt('Status', 'অবস্থা'), options: LIFECYCLE_ORDER.map((s) => ({ value: s, label: t(`exam.state.${s}`) })) },
    ],
    columns: [
      { key: 'title', label: tt('Examination', 'পরীক্ষা'), sort: (r) => L(r.title), render: (r) => h('a', { href: `#/admin/sheet?sid=${encodeURIComponent(r.id)}` }, L(r.title) || r.id) },
      { key: 'classId', label: tt('Class', 'শ্রেণি'), render: (r) => nameOf(cats.classes, r.classId) },
      { key: 'yearId', label: tt('Session', 'সেশন'), sortable: true },
      { key: 'studentCount', label: tt('Students', 'শিক্ষার্থী'), sortable: true },
      { key: 'state', label: tt('Status', 'অবস্থা'), render: (r) => examStateBadge(r.state), sort: (r) => LIFECYCLE_ORDER.indexOf(r.state) },
      { key: 'updatedAt', label: tt('Updated', 'হালনাগাদ'), sortable: true, render: (r) => fmtDate(r.updatedAt) },
    ],
  }).el);
  return h('section', { class: 'page' }, pageHeader({ title: t('nav.resultSheets'), actions: [linkButton(t('dash.createSheet'), '#/admin/sheet/new', { kind: 'primary', icon: 'plus' })] }), body);
}
