import { h } from '../../core/dom.js';
import { tt, L } from '../../i18n/index.js';
import { getState } from '../../core/store.js';
import { loadingState, errorState } from '../../ui/components/states.js';
import { examStateBadge, lifecycleStrip } from '../../ui/components/status-badge.js';
import { pageHeader } from '../../ui/components/page.js';
import { dataTable } from '../../ui/components/data-table.js';
import { ExamState } from '../../domain/exam-lifecycle.js';
import { subjectDefinition, subjectProgress, findMissingMarks } from '../../domain/session-calc.js';
import { friendlyError, nameOf } from '../_shared.js';

export const title = 'nav.markEntry';

export function render({ query }) {
  const root = h('section', { class: 'page' }, loadingState());
  (async () => {
    const sid = query.get('sid'); const uid = getState().authUser.uid;
    const [{ loadSessionBundle }, { listMarks }, { loadAllCatalogues }] = await Promise.all([import('../../data/repositories/sessions-repository.js'), import('../../data/repositories/marks-repository.js'), import('../../data/repositories/catalogue-repository.js')]);
    const bundle = await loadSessionBundle(sid);
    const cats = await loadAllCatalogues();
    const mine = bundle.subjects.filter((x) => (x.teacherIds ?? []).includes(uid));
    const marks = {};
    for (const sub of mine) marks[sub.id] = await listMarks(sid, sub.id);
    const missing = mine.flatMap((sub) => findMissingMarks(bundle, marks, { subjectId: sub.id }));
    const s = bundle.session;
    root.replaceChildren(
      pageHeader({ title: L(s.title), subtitle: nameOf(cats.classes, s.classId), back: { href: '#/teacher', label: tt('Back', 'ফিরে যান') } }),
      h('div', { class: 'sheet-status' }, examStateBadge(s.state)), lifecycleStrip(s.state),
      h('h2', { class: 'section-title' }, tt('Your subjects in this examination', 'এই পরীক্ষায় আপনার বিষয়')),
      h('ul', { class: 'sheet-list' }, mine.map((sub) => { const p = subjectProgress(bundle, marks, sub.id); return h('li', { class: 'sheet-row' },
        h('div', { class: 'sheet-row__head' }, h('strong', {}, L(subjectDefinition(sub).name)),
          sub.submission?.state === 'submitted' ? h('span', { class: 'badge badge--good' }, tt('Submitted', 'জমা হয়েছে')) : sub.submission?.reason ? h('span', { class: 'badge badge--warn' }, tt('Reopened: {r}', 'আবার খোলা: {r}', { r: sub.submission.reason })) : null),
        h('p', { class: 'muted' }, tt('{a} of {b} students complete · {m} missing · {x} absent', '{b} জনের মধ্যে {a} জন সম্পূর্ণ · {m}টি বাকি · {x} জন অনুপস্থিত', { a: p.complete, b: p.total, m: p.missingCells, x: p.absent })),
        h('a', { class: 'btn btn--primary btn--sm', href: `#/marks?sid=${encodeURIComponent(sid)}&subject=${encodeURIComponent(sub.id)}` }, [ExamState.READY, ExamState.IN_PROGRESS].includes(s.state) && sub.submission?.state !== 'submitted' ? tt('Enter marks', 'নম্বর দিন') : tt('View marks', 'নম্বর দেখুন'))); })),
      h('h2', { class: 'section-title' }, tt('Missing marks', 'বাকি নম্বর')),
      dataTable({ rows: missing.map((m, i) => ({ ...m, id: String(i) })), pageSize: 25, empty: tt('Nothing missing in your subjects.', 'আপনার বিষয়ে কিছু বাকি নেই।'),
        filters: [{ key: 'subjectId', label: tt('Subject', 'বিষয়'), options: mine.map((x) => ({ value: x.id, label: L(subjectDefinition(x).name) })) }],
        columns: [{ key: 'roll', label: tt('Roll', 'রোল') }, { key: 'name', label: tt('Name', 'নাম'), render: (r) => L(r.name) },
          { key: 'subjectId', label: tt('Subject', 'বিষয়'), render: (r) => L(subjectDefinition(mine.find((x) => x.id === r.subjectId)).name) }, { key: 'componentLabel', label: tt('Missing part', 'বাকি অংশ') }] }).el,
      [ExamState.PUBLISHED, ExamState.ARCHIVED].includes(s.state) ? h('a', { class: 'btn btn--ghost', href: `#/results?sid=${encodeURIComponent(sid)}` }, tt('View results', 'ফলাফল দেখুন')) : null);
  })().catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}
