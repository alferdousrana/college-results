/**
 * Full-class result sheet for ONE group, modelled on the college's sheets.
 * renderResultSheet({ vms, subjects, exam, groupLabel, subjectColumns }, { institution, print, lang })
 *  - subjects: the group's subject definitions in order (papers of a combined subject carry `combine`).
 *  - subjectColumns: { subjectId: columnKey } — alternatives sharing a key print in one column ("A / B").
 *  - Which cells appear is set in Settings → Print design → Full result sheet.
 *  - The table is scaled to fit the page width when printing (see print-runner.js), header rows repeat
 *    on every page, rows never split, students stay in roll order.
 */
import { h } from '../core/dom.js';
import { PRINT_LABELS, pnum, pick } from './labels.js';
import { withPrintDefaults, printVars } from './print-settings.js';
import { institutionHeader, signatureBlock } from './progress-report.js';

/** Builds the column layout: combined subjects, then single subjects grouped by shared column key. */
export function buildSheetColumns(subjects, subjectColumns = {}) {
  const cols = [];
  const byKey = new Map();
  for (const s of subjects) {
    const isComb = Boolean(s.combine?.key);
    const key = isComb ? `combo_${s.combine.key}` : (subjectColumns[s.id] || s.id);
    if (!byKey.has(key)) {
      const col = { key, combined: isComb, label: isComb ? s.combine.name : null, names: [], ids: [], papers: [] };
      byKey.set(key, col); cols.push(col);
    }
    const col = byKey.get(key);
    if (isComb) col.papers.push({ id: s.id, paper: s.combine.paper });
    else { col.ids.push(s.id); col.names.push(s.name); }
  }
  return cols;
}

export function renderResultSheet({ vms, subjects, exam, groupLabel = null, subjectColumns = {} }, ctx) {
  const lang = ctx.lang === 'bn' ? 'bn' : 'en';
  const s = withPrintDefaults(ctx.print);
  const Lb = PRINT_LABELS[lang];
  const n = (v, dp) => pnum(v, lang, dp);
  const C = s.sheet.combined, S = s.sheet.single, T = s.sheet.totals;
  const columns = buildSheetColumns(subjects, subjectColumns);
  const customCols = (vms[0]?.student.custom ?? []).filter((c) => c.showOnSheet);
  const subHeads = (col) => (col.combined
    ? [...(C.papers ? col.papers.map((p) => Lb.papers[p.paper] ?? p.paper) : []), ...(C.total ? [Lb.total] : []), ...(C.grade ? [Lb.grade] : []), ...(C.gradePoint ? [Lb.gp] : [])]
    : [...(S.marks ? [Lb.marks] : []), ...(S.grade ? [Lb.grade] : []), ...(S.gradePoint ? [Lb.gp] : [])]);
  const label = (col) => (col.combined ? pick(col.label, lang) : col.names.map((x) => pick(x, lang)).join(' / '));
  const tailHeads = [T.totalMarks ? Lb.totalMarks : null, T.gpa ? Lb.gpa : null, T.grade ? Lb.grade : null, T.merit ? Lb.merit : null].filter(Boolean);

  const head1 = h('tr', {}, h('th', { rowspan: 2 }, Lb.roll), h('th', { rowspan: 2, class: 'rs-name' }, Lb.name),
    customCols.map((c) => h('th', { rowspan: 2 }, pick(c.label, lang))),
    columns.map((col) => { const k = subHeads(col).length; return k ? h('th', { colspan: k }, label(col)) : null; }),
    tailHeads.map((t) => h('th', { rowspan: 2 }, t)));
  const head2 = h('tr', {}, columns.map((col) => subHeads(col).map((x) => h('th', {}, x))));

  const sorted = [...vms].sort((a, b) => Number(a.student.roll) - Number(b.student.roll));
  const body = sorted.map((vm) => {
    const byId = Object.fromEntries(vm.subjects.map((x) => [x.id, x]));
    const cells = columns.flatMap((col) => {
      const r = col.combined ? byId[col.key] : col.ids.map((id) => byId[id]).find(Boolean);
      const k = subHeads(col).length;
      if (!r) return Array.from({ length: k }, () => h('td', { class: 'is-na' }, ''));
      const opt = r.isOptional ? '*' : '';
      if (col.combined) {
        const paperCells = C.papers ? col.papers.map((p) => { const part = r.parts?.find((x) => x.id === p.id); return h('td', {}, part?.state === 'ABSENT' ? n('AB') : n(part?.obtained, 0)); }) : [];
        return [...paperCells, ...(C.total ? [h('td', { class: 'rs-total' }, r.state === 'ABSENT' ? n('AB') : n(r.obtained, 0))] : []),
          ...(C.grade ? [h('td', {}, r.grade ?? '')] : []), ...(C.gradePoint ? [h('td', {}, n(r.point))] : [])];
      }
      return [...(S.marks ? [h('td', {}, r.state === 'ABSENT' ? n('AB') : n(r.obtained, 0))] : []),
        ...(S.grade ? [h('td', {}, `${r.grade ?? ''}${opt}`)] : []), ...(S.gradePoint ? [h('td', {}, `${n(r.point)}${S.grade ? '' : opt}`)] : [])];
    });
    return h('tr', { class: vm.status === 'FAILED' ? 'is-fail' : '' },
      h('td', {}, n(vm.student.roll)), h('td', { class: 'rs-name' }, pick(vm.student.name, lang)),
      customCols.map((c) => h('td', {}, String(vm.student.custom.find((x) => x.key === c.key)?.value ?? ''))),
      cells,
      T.totalMarks ? h('td', { class: 'rs-total' }, n(vm.totals.obtained, 0)) : null,
      T.gpa ? h('td', { class: 'rs-total' }, vm.gpa == null ? '' : n(vm.gpa, 2)) : null,
      T.grade ? h('td', {}, vm.grade ?? '') : null,
      T.merit ? h('td', {}, vm.position ? n(vm.position.value) : '') : null);
  });

  return h('article', { class: 'print-doc print-doc--sheet', lang, style: printVars(s, lang), dataset: { orientation: s.orientation.resultSheet, margin: s.marginsMm.resultSheet, paper: s.sheet.paper } },
    institutionHeader(ctx.institution, s, lang, `${pick(exam.title, lang)} — ${Lb.resultSheet}`),
    h('p', { class: 'rs-sub' }, [pick(exam.classLabel, lang), groupLabel ? `${Lb.group}: ${pick(groupLabel, lang)}` : null].filter(Boolean).join(' · ')),
    h('div', { class: 'rs-scroll' }, h('table', { class: 'rs-table' }, h('thead', {}, head1, head2), h('tbody', {}, body))),
    h('p', { class: 'rs-note' }, lang === 'bn' ? '* ৪র্থ বিষয়' : '* 4th subject'),
    h('footer', { class: 'pr-sigs pr-sigs--sheet' }, s.sheetSignatures.filter((x) => x.enabled).map((x) => signatureBlock(x, ctx.institution, lang))));
}
