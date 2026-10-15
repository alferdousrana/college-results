/**
 * Full-class result sheet for ONE group (A4 landscape by default), modelled on the reference PDF.
 * renderResultSheet({ vms, subjects, exam, groupLabel }, { institution, print, lang })
 *  - subjects: the group's subject list, in order (each group has its own list).
 *  - Header rows repeat on every printed page (<thead>), rows never split across pages,
 *    students stay in roll order, page numbers come from @page margin boxes.
 */
import { h } from '../core/dom.js';
import { PRINT_LABELS, pnum, pick } from './labels.js';
import { withPrintDefaults, printVars } from './print-settings.js';
import { institutionHeader, signatureBlock, componentColumns, componentCell } from './progress-report.js';

function papersOf(sub) { return [...new Set(sub.components.map((c) => c.paper).filter(Boolean))]; }

export function renderResultSheet({ vms, subjects, exam, groupLabel = null }, ctx) {
  const lang = ctx.lang === 'bn' ? 'bn' : 'en';
  const s = withPrintDefaults(ctx.print);
  const Lb = PRINT_LABELS[lang];
  const n = (v, dp) => pnum(v, lang, dp);
  const mode = s.sheet.showComponents; // 'papers' | 'components' | 'totals'
  const customCols = (vms[0]?.student.custom ?? []).filter((c) => c.showOnSheet);
  const subCols = (sub) => {
    if (mode === 'papers' && papersOf(sub).length > 1) return papersOf(sub).map((p) => ({ kind: 'paper', key: p, label: Lb.papers[p] ?? p }));
    if (mode === 'components') return componentColumns([sub]).map((k) => ({ kind: 'comp', key: k, label: k.startsWith('L:') ? k.slice(2) : k }));
    return [];
  };
  const perSub = subjects.map((sub) => ({ sub, cols: subCols(sub) }));
  const tail = [s.sheet.showGradePoint ? 'gp' : null, 'grade'].filter(Boolean);

  const head1 = h('tr', {}, h('th', { rowspan: 2 }, Lb.roll), h('th', { rowspan: 2, class: 'rs-name' }, Lb.name),
    customCols.map((c) => h('th', { rowspan: 2 }, pick(c.label, lang))),
    perSub.map(({ sub, cols }) => h('th', { colspan: cols.length + 1 + tail.length }, pick(sub.name, lang))),
    h('th', { rowspan: 2 }, Lb.totalMarks), h('th', { rowspan: 2 }, Lb.gpa), h('th', { rowspan: 2 }, Lb.grade), s.sheet.showMerit ? h('th', { rowspan: 2 }, Lb.merit) : null);
  const head2 = h('tr', {}, perSub.map(({ cols }) => [...cols.map((c) => h('th', {}, c.label)), h('th', {}, cols.length ? Lb.total : Lb.marks),
    ...tail.map((tk) => h('th', {}, tk === 'gp' ? Lb.gp : Lb.grade))]));

  const sorted = [...vms].sort((a, b) => Number(a.student.roll) - Number(b.student.roll));
  const body = sorted.map((vm) => {
    const byId = Object.fromEntries(vm.subjects.map((x) => [x.id, x]));
    return h('tr', { class: vm.status === 'FAILED' ? 'is-fail' : '' },
      h('td', {}, n(vm.student.roll)), h('td', { class: 'rs-name' }, pick(vm.student.name, lang)),
      customCols.map((c) => h('td', {}, String(vm.student.custom.find((x) => x.key === c.key)?.value ?? ''))),
      perSub.map(({ sub, cols }) => {
        const r = byId[sub.id];
        if (!r) return [...cols.map(() => h('td', { class: 'is-na' }, '')), h('td', { class: 'is-na' }, '—'), ...tail.map(() => h('td', { class: 'is-na' }, ''))];
        const cells = cols.map((c) => {
          if (c.kind === 'paper') {
            const vals = r.components.filter((x) => x.paper === c.key);
            if (vals.every((x) => x.value === 'AB')) return h('td', {}, n('AB'));
            return h('td', {}, n(Math.round(vals.reduce((a, x) => a + (typeof x.value === 'number' ? x.value : 0), 0) * 100) / 100));
          }
          const v = componentCell(r, c.key); return h('td', {}, v == null ? '' : n(v));
        });
        return [...cells, h('td', { class: 'rs-total' }, r.state === 'ABSENT' ? n('AB') : n(r.obtained, 2)), ...tail.map((tk) => h('td', {}, tk === 'gp' ? n(r.point) : r.grade ?? ''))];
      }),
      h('td', { class: 'rs-total' }, n(vm.totals.obtained, 2)), h('td', {}, vm.gpa == null ? '' : n(vm.gpa, 2)), h('td', {}, vm.grade ?? ''),
      s.sheet.showMerit ? h('td', {}, vm.position ? n(vm.position.value) : '') : null);
  });

  return h('article', { class: 'print-doc print-doc--sheet', lang, style: printVars(s, lang), dataset: { orientation: s.orientation.resultSheet, margin: s.marginsMm.resultSheet } },
    institutionHeader(ctx.institution, s, lang, `${pick(exam.title, lang)} — ${Lb.resultSheet}`),
    h('p', { class: 'rs-sub' }, [pick(exam.classLabel, lang), groupLabel ? `${Lb.group}: ${pick(groupLabel, lang)}` : null].filter(Boolean).join(' · ')),
    h('div', { class: 'rs-scroll' }, h('table', { class: 'rs-table' }, h('thead', {}, head1, head2), h('tbody', {}, body))),
    h('footer', { class: 'pr-sigs pr-sigs--sheet' }, s.sheetSignatures.filter((x) => x.enabled).map((x) => signatureBlock(x, ctx.institution, lang))));
}
