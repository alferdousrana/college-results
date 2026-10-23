/**
 * Result sheet and marksheet viewer/printer for staff.
 *  - Published/archived: stored results + frozen print context (identical to what was published).
 *  - Administrator before publication: live preview, clearly labelled "Preview — not published".
 * Teachers can open this page only for published examinations they took part in (rules enforce it).
 */
import { h, svgIcon } from '../core/dom.js';
import { tt, L, currentLang } from '../i18n/index.js';
import { pageHeader } from '../ui/components/page.js';
import { loadingState, errorState, emptyState } from '../ui/components/states.js';
import { actor, friendlyError, nameOf } from './_shared.js';
import { ExamState } from '../domain/exam-lifecycle.js';
import { subjectDefinition } from '../domain/session-calc.js';
import { featureGate } from '../ui/components/feature-gate.js';

export const title = 'nav.results';

export function render({ query }) {
  const root = h('section', { class: 'page page--wide' }, loadingState());
  init(query, root).catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

async function init(query, root) {
  const sid = query.get('sid');
  const me = actor();
  const [{ loadSessionBundle }, results, { loadAllCatalogues }, fonts] = await Promise.all([
    import('../data/repositories/sessions-repository.js'), import('../data/repositories/results-repository.js'),
    import('../data/repositories/catalogue-repository.js'), import('../print/fonts.js')]);
  const bundle = await loadSessionBundle(sid);
  const s = bundle.session;
  const published = [ExamState.PUBLISHED, ExamState.ARCHIVED].includes(s.state);
  if (!published && me.role !== 'super_admin') { root.replaceChildren(emptyState({ message: tt('Results become visible here after they are published.', 'ফলাফল প্রকাশের পর এখানে দেখা যাবে।') })); return; }
  const cats = await loadAllCatalogues();
  const ctx = await results.getPrintContext(sid);
  let vms;
  if (published) vms = (await results.listResults(sid)).map((r) => ({ ...r.vm, _groupId: r.groupId, _id: r.id }));
  else { const c = await results.computeSession(sid); vms = c.vms.map((vm, i) => ({ ...vm, _groupId: c.sheet.rows[i].groupId, _id: c.sheet.rows[i].studentId })); }
  await fonts.ensurePrintFonts();

  const order = (g) => cats.groups.find((x) => x.id === g)?.order ?? 99;
  const groups = bundle.sheets.map((x) => x.id).sort((a, b) => order(a) - order(b));
  const ALL = '__all';
  const state = { lang: query.get('lang') || ctx.print?.language || currentLang(), group: query.get('group') || (groups.length > 1 ? ALL : groups[0]), mode: query.get('student') ? 'marksheet' : 'sheet', student: query.get('student') || 'all' };
  const area = h('div', { class: 'print-area' });
  const controls = h('div', { class: 'print-controls no-print' });
  const { renderResultSheet } = await import('../print/result-sheet.js');
  const { renderProgressReport } = await import('../print/progress-report.js');
  const { printContainer } = await import('../print/print-runner.js');
  const { fontFamiliesFor, withPrintDefaults } = await import('../print/print-settings.js');
  const printSettings = withPrintDefaults(ctx.print);

  function paintControls() {
    const groupVms = vms.filter((v) => state.group === ALL || v._groupId === state.group).sort((a, b) => groups.indexOf(a._groupId) - groups.indexOf(b._groupId) || Number(a.student.roll) - Number(b.student.roll));
    const sel = (label, value, options, onChange) => h('label', { class: 'field field--inline' }, h('span', { class: 'field__label' }, label),
      h('select', { class: 'input', onchange: (e) => { onChange(e.target.value); paint(); } }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
    controls.replaceChildren(
      sel(tt('Printed language', 'মুদ্রণের ভাষা'), state.lang, [['en', 'English'], ['bn', 'বাংলা']], (v) => { state.lang = v; }),
      groups.length > 1 ? sel(tt('Group', 'বিভাগ'), state.group, [[ALL, tt('All groups (one print)', 'সব বিভাগ (একসাথে প্রিন্ট)')], ...groups.map((g) => [g, nameOf(cats.groups, g)])], (v) => { state.group = v; state.student = 'all'; }) : null,
      sel(tt('Document', 'নথি'), state.mode, [['sheet', tt('Full result sheet', 'পূর্ণ ফলাফল শিট')], ['marksheet', tt('Individual marksheets', 'একক মার্কশিট')]], (v) => { state.mode = v; }),
      state.mode === 'marksheet' ? sel(tt('Student', 'শিক্ষার্থী'), state.student, [['all', state.group === ALL ? tt('All students', 'সব শিক্ষার্থী') : tt('All students in this group', 'এই বিভাগের সব শিক্ষার্থী')], ...groupVms.map((v) => [v._id, `${v.student.roll} — ${L(v.student.name)}`])], (v) => { state.student = v; }) : null,
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => printContainer(area, { families: fontFamiliesFor(printSettings), pageNumbers: printSettings.sheet.pageNumbers, pageLabel: state.lang === 'bn' ? 'পৃষ্ঠা' : 'Page' }) }, svgIcon('print'), h('span', {}, tt('Print', 'প্রিন্ট'))),
      h('p', { class: 'muted small' }, tt('To save a PDF, choose "Save as PDF" in the print dialog.', 'পিডিএফ রাখতে প্রিন্ট উইন্ডোতে "Save as PDF" বাছুন।')));
  }

  function sheetFor(groupId, c) {
    const groupVms = vms.filter((v) => v._groupId === groupId);
    const sheet = bundle.sheets.find((x) => x.id === groupId);
    const ord = (x) => x.definition?.order ?? 999;
    const subjects = (sheet?.subjectIds ?? []).map((id) => bundle.subjects.find((x) => x.id === id)).filter(Boolean).sort((a, b) => ord(a) - ord(b)).map((x) => ({ ...subjectDefinition(x) }));
    return groupVms.length ? renderResultSheet({ vms: groupVms, subjects, exam: groupVms[0].exam, groupLabel: groupVms[0].exam.groupLabel, subjectColumns: sheet?.subjectColumns ?? {} }, c) : null;
  }

  function paint() {
    paintControls();
    const c = { ...ctx, lang: state.lang, print: printSettings };
    const shownGroups = state.group === ALL ? groups : [state.group];
    if (!vms.some((v) => shownGroups.includes(v._groupId))) { area.replaceChildren(emptyState({ message: tt('No students in this group.', 'এই বিভাগে শিক্ষার্থী নেই।') })); return; }
    if (state.mode === 'sheet') {
      // One sheet per group, in group order (Science, Humanities, Business Studies); each starts on a new page.
      area.replaceChildren(featureGate('result_sheet_print', () => h('div', {}, shownGroups.map((g) => sheetFor(g, c)))));
      requestAnimationFrame(async () => {
        const { applySheetFit } = await import('../print/print-runner.js');
        const z = applySheetFit(area);
        if (z < 1) area.prepend(h('p', { class: `notice ${z < 0.6 ? 'notice--locked' : ''} no-print` }, tt('The sheet will be printed at {p}% so every column fits on the page.', 'সব কলাম পৃষ্ঠায় আঁটাতে শিটটি {p}% আকারে ছাপা হবে।', { p: Math.round(z * 100) }),
          z < 0.6 ? ` ${tt('To make the text larger, choose Legal paper or hide some columns in Settings → Print design.', 'লেখা বড় করতে সেটিংস → মুদ্রণ নকশায় Legal কাগজ বাছুন বা কিছু কলাম লুকান।')}` : ''));
      });
    } else {
      const inGroups = vms.filter((v) => shownGroups.includes(v._groupId)).sort((a, b) => groups.indexOf(a._groupId) - groups.indexOf(b._groupId) || Number(a.student.roll) - Number(b.student.roll));
      const list = state.student === 'all' ? inGroups : inGroups.filter((v) => v._id === state.student);
      area.replaceChildren(featureGate('progress_report_print', () => h('div', {}, list.map((vm) => renderProgressReport(vm, c)))));
    }
  }

  root.replaceChildren(
    pageHeader({ title: L(s.title), subtitle: `${nameOf(cats.classes, s.classId)} · ${s.yearId}`, back: { href: me.role === 'super_admin' ? `#/admin/sheet?sid=${encodeURIComponent(sid)}` : '#/teacher/history', label: tt('Back', 'ফিরে যান') } }),
    !published ? h('p', { class: 'notice notice--locked no-print' }, tt('Preview — not published. Students cannot see these results yet.', 'প্রাকদর্শন — প্রকাশিত নয়। শিক্ষার্থীরা এখনো এই ফলাফল দেখতে পাবে না।')) : null,
    controls, area);
  paint();
}
