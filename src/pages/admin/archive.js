/** Historical results: search published/archived examinations, then find a roll within them. */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader } from '../../ui/components/page.js';
import { loadingState, errorState } from '../../ui/components/states.js';
import { selectField, field } from '../../ui/components/form.js';
import { dataTable } from '../../ui/components/data-table.js';
import { examStateBadge } from '../../ui/components/status-badge.js';
import { friendlyError, nameOf } from '../_shared.js';
import { fmtDate, fmtNum } from '../../ui/format.js';
import { button } from '../../ui/components/page.js';
import { featureGate } from '../../ui/components/feature-gate.js';

export const title = 'nav.archive';

export function render() {
  const root = h('section', { class: 'page' }, loadingState());
  const gated = featureGate('historical_archive', () => null);
  if (gated) { root.replaceChildren(pageHeader({ title: t('nav.archive') }), gated); return root; }
  init(root).catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

async function init(root) {
  const [{ loadAllCatalogues }, { listSessions }, results, { getSetting }] = await Promise.all([import('../../data/repositories/catalogue-repository.js'), import('../../data/repositories/sessions-repository.js'), import('../../data/repositories/results-repository.js'), import('../../data/repositories/settings-repository.js')]);
  const [cats, retention] = await Promise.all([loadAllCatalogues(), getSetting('retention')]);
  const sessions = await listSessions({ state: ['published', 'archived'], limit: 500 });
  const opt = (list, f = (x) => L(x.name)) => [{ value: '', label: tt('Any', 'যেকোনো') }, ...list.map((x) => ({ value: x.id, label: f(x) }))];
  const yearF = selectField({ label: tt('Session', 'সেশন'), name: 'hy', options: opt(cats.years, (y) => y.label) });
  const classF = selectField({ label: tt('Class', 'শ্রেণি'), name: 'hc', options: opt(cats.classes) });
  const examF = selectField({ label: tt('Examination', 'পরীক্ষা'), name: 'he', options: opt(cats.examDefs) });
  const groupF = selectField({ label: tt('Group', 'বিভাগ'), name: 'hg', options: opt(cats.groups) });
  const rollF = field({ label: tt('Roll or name', 'রোল বা নাম'), name: 'hr', inputmode: 'search' });
  const out = h('div');
  async function search() {
    const list = sessions.filter((s) => (!yearF.value || s.yearId === yearF.value) && (!classF.value || s.classId === classF.value) && (!examF.value || s.examDefId === examF.value) && (!groupF.value || (s.groupIds ?? []).includes(groupF.value)));
    if (!rollF.value) {
      out.replaceChildren(dataTable({ rows: list, empty: tt('No published results match.', 'কোনো প্রকাশিত ফলাফল মেলেনি।'), columns: [
        { key: 'title', label: tt('Examination', 'পরীক্ষা'), render: (s) => L(s.title) }, { key: 'classId', label: tt('Class', 'শ্রেণি'), render: (s) => nameOf(cats.classes, s.classId) },
        { key: 'yearId', label: tt('Session', 'সেশন'), sortable: true }, { key: 'state', label: tt('Status', 'অবস্থা'), render: (s) => examStateBadge(s.state) },
        { key: 'publishedAt', label: tt('Published', 'প্রকাশ'), render: (s) => fmtDate(s.publishedAt) }, { key: 'v', label: tt('Version', 'সংস্করণ'), render: (s) => fmtNum(s.publishedVersion) },
        { key: 'go', label: '', render: (s) => h('div', { class: 'row-actions' }, h('a', { class: 'btn btn--ghost btn--sm', href: `#/results?sid=${encodeURIComponent(s.id)}` }, tt('Open', 'খুলুন')), h('a', { class: 'btn btn--ghost btn--sm', href: `#/admin/sheet?sid=${encodeURIComponent(s.id)}&tab=history` }, tt('History', 'ইতিহাস'))) },
      ] }).el);
      return;
    }
    out.replaceChildren(loadingState());
    const q = rollF.value.toLowerCase();
    const hits = [];
    for (const s of list.slice(0, 20)) {
      for (const r of await results.listResults(s.id)) {
        if (String(r.roll) === rollF.value || L(r.vm.student.name, 'en').toLowerCase().includes(q) || L(r.vm.student.name, 'bn').includes(rollF.value)) hits.push({ ...r, session: s });
      }
    }
    out.replaceChildren(list.length > 20 ? h('p', { class: 'muted' }, tt('Searched the 20 most recent matching examinations. Narrow the filters to search older ones.', 'সাম্প্রতিক ২০টি মিলে যাওয়া পরীক্ষায় খোঁজা হয়েছে। পুরোনোগুলোর জন্য ফিল্টার সরু করুন।')) : null,
      dataTable({ rows: hits.map((x) => ({ ...x, id: `${x.session.id}/${x.id}` })), empty: tt('No student found.', 'কোনো শিক্ষার্থী পাওয়া যায়নি।'), columns: [
        { key: 'roll', label: tt('Roll', 'রোল') }, { key: 'name', label: tt('Name', 'নাম'), render: (r) => L(r.vm.student.name) },
        { key: 'exam', label: tt('Examination', 'পরীক্ষা'), render: (r) => L(r.session.title) }, { key: 'gpa', label: 'GPA', render: (r) => fmtNum(r.gpa, 2) },
        { key: 'grade', label: tt('Grade', 'গ্রেড'), render: (r) => r.vm.grade }, { key: 'pos', label: tt('Merit', 'মেধা'), render: (r) => fmtNum(r.position) },
        { key: 'go', label: '', render: (r) => h('a', { class: 'btn btn--ghost btn--sm', href: `#/results?sid=${encodeURIComponent(r.session.id)}&student=${encodeURIComponent(r.id)}&group=${encodeURIComponent(r.groupId)}` }, tt('Marksheet', 'মার্কশিট')) },
      ] }).el);
  }
  [yearF, classF, examF, groupF].forEach((f) => f.input.addEventListener('change', search));
  rollF.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
  root.replaceChildren(pageHeader({ title: t('nav.archive'), subtitle: tt('Published results are kept for at least {n} years in public lookup and {m} years internally (Settings → Retention).', 'প্রকাশিত ফলাফল পাবলিক অনুসন্ধানে অন্তত {n} বছর এবং অভ্যন্তরীণভাবে {m} বছর রাখা হয় (সেটিংস → সংরক্ষণকাল)।', { n: retention.publicLookupYears, m: retention.keepInternalYears }) }),
    h('div', { class: 'filter-bar' }, yearF.el, classF.el, examF.el, groupF.el, rollF.el, h('div', { class: 'field' }, h('span', { class: 'field__label' }, '\u00a0'), button(tt('Search', 'খুঁজুন'), { kind: 'primary', icon: 'search', onClick: search }))), out);
  search();
}
