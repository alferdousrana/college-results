/**
 * Individual marksheet / progress report (A4 portrait), modelled on the reference image.
 * renderProgressReport(vm, { institution, print, scale, lang })
 * Component columns are grouped by component type (CA, CQ, MCQ, Practical, …) and a cell is
 * filled only when that component applies to the subject.
 */
import { h } from '../core/dom.js';
import { PRINT_LABELS, pnum, pick } from './labels.js';
import { withPrintDefaults, printVars } from './print-settings.js';

const TYPE_ORDER = ['CA', 'CQ', 'MCQ', 'PRACTICAL'];
const TYPE_LABEL = { en: { CA: 'CA', CQ: 'CQ', MCQ: 'MCQ', PRACTICAL: 'Practical' }, bn: { CA: 'ধারাবাহিক', CQ: 'সৃজনশীল', MCQ: 'বহুনির্বাচনি', PRACTICAL: 'ব্যবহারিক' } };

export function componentColumns(subjects) {
  const keys = [];
  for (const s of subjects) for (const c of s.components) { const k = c.type && c.type !== 'CUSTOM' ? c.type : `L:${c.label}`; if (!keys.includes(k)) keys.push(k); }
  return keys.sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99));
}

export function componentCell(subject, key) {
  const comps = subject.components.filter((c) => (c.type && c.type !== 'CUSTOM' ? c.type : `L:${c.label}`) === key);
  if (!comps.length) return null;               // not applicable to this subject
  if (comps.every((c) => c.value === 'AB')) return 'AB';
  if (comps.some((c) => c.value == null)) return '';
  return Math.round(comps.reduce((a, c) => a + (c.value === 'AB' ? 0 : c.value), 0) * 100) / 100;
}

function signatureBlock(sig, institution, lang) {
  const assetKey = { principal: 'principalSignature', classTeacher: 'classTeacherSignature', committee: 'committeeSignature' }[sig.role];
  const img = sig.useImage && assetKey ? institution?.assets?.[assetKey] : null;
  const person = institution?.signatories?.[sig.role];
  return h('div', { class: `pr-sig pr-sig--${sig.position}` },
    h('div', { class: 'pr-sig__img' }, img ? h('img', { src: img, alt: '' }) : null),
    h('span', { class: 'pr-sig__line' }),
    person?.name && pick(person.name, lang) ? h('span', { class: 'pr-sig__name' }, pick(person.name, lang)) : null,
    h('span', {}, pick(sig.label, lang)));
}

export function institutionHeader(institution, s, lang, title) {
  const logo = institution?.assets?.logo && s.logoPosition !== 'none' ? h('img', { class: 'pr-logo', src: institution.assets.logo, alt: '' }) : null;
  return h('header', { class: `pr-head pr-head--logo-${s.logoPosition} pr-head--${s.headingStyle}`, style: `text-align:${s.headingAlign}` },
    logo,
    h('div', { class: 'pr-head__text' },
      h('h1', { class: 'pr-inst' }, pick(institution?.name, lang)),
      h('p', { class: 'pr-addr' }, pick(institution?.address, lang)),
      pick(institution?.header, lang) ? h('p', { class: 'pr-headtext' }, pick(institution.header, lang)) : null,
      title ? h('p', { class: 'pr-doc-title' }, title) : null));
}

export function renderProgressReport(vm, ctx) {
  const lang = ctx.lang === 'bn' ? 'bn' : 'en';
  const s = withPrintDefaults(ctx.print);
  const f = s.marksheetFields;
  const Lb = PRINT_LABELS[lang];
  const cols = componentColumns(vm.subjects);
  const colLabel = (k) => (k.startsWith('L:') ? k.slice(2) : TYPE_LABEL[lang][k] ?? k);
  const n = (v, dp) => pnum(v, lang, dp);
  const statusText = { PASSED: Lb.pass, FAILED: Lb.fail, INCOMPLETE: Lb.incomplete }[vm.status] ?? '';
  const st = vm.student;
  const info = (k, v) => (v == null || v === '' ? null : [h('dt', {}, k), h('dd', {}, v)]);
  const custom = (st.custom ?? []).filter((c) => c.showOnMarksheet && c.value != null && c.value !== '');

  const scale = f.gradeScale && ctx.scale?.length ? h('table', { class: 'pr-scale' },
    h('thead', {}, h('tr', {}, h('th', {}, Lb.range), h('th', {}, Lb.grade), h('th', {}, Lb.gp))),
    h('tbody', {}, [...ctx.scale].sort((a, b) => b.min - a.min).map((b) => h('tr', {}, h('td', {}, `${n(b.min)}-${n(b.max)}`), h('td', {}, b.grade), h('td', {}, n(b.point)))))) : null;

  const details = h('div', { class: 'pr-details' },
    h('dl', {}, info(Lb.studentName, pick(st.name, lang)), f.fatherName ? info(Lb.fatherName, st.fatherName) : null, f.motherName ? info(Lb.motherName, st.motherName) : null,
      f.studentCode ? info(Lb.studentId, st.studentCode) : null, info(Lb.examination, pick(vm.exam.examName, lang) || pick(vm.exam.title, lang)), info(Lb.year, n(vm.exam.yearLabel)),
      custom.map((c) => info(pick(c.label, lang), String(c.value)))),
    h('dl', {}, info(Lb.class, pick(vm.exam.classLabel, lang)), f.group ? info(Lb.group, pick(vm.exam.groupLabel, lang)) : null,
      f.section ? info(Lb.section, st.section) : null, f.shift ? info(Lb.shift, st.shift) : null, info(Lb.roll, n(st.roll)),
      f.examHeld ? info(Lb.examHeld, vm.exam.heldOn ? n(vm.exam.heldOn) : null) : null));

  const marks = h('table', { class: 'pr-marks' },
    h('thead', {},
      h('tr', {}, f.subjectCode ? h('th', { rowspan: 2 }, Lb.code) : null, h('th', { rowspan: 2 }, Lb.subject), h('th', { rowspan: 2 }, Lb.fullMarks), f.highestMarks ? h('th', { rowspan: 2 }, Lb.highest) : null,
        cols.length ? h('th', { colspan: cols.length }, Lb.obtained) : null,
        h('th', { rowspan: 2 }, Lb.totalMarks), h('th', { rowspan: 2 }, Lb.gradePoint), h('th', { rowspan: 2 }, Lb.letterGrade)),
      h('tr', {}, cols.map((k) => h('th', {}, colLabel(k))))),
    h('tbody', {}, vm.subjects.flatMap((sub) => {
      const fail = sub.passed === false ? 'is-fail' : '';
      const cells = (x) => cols.map((k) => { const v = componentCell(x, k); return h('td', { class: v === null ? 'is-na' : '' }, v === null ? '' : n(v)); });
      if (sub.isCombined) {
        // One row per paper; total, grade point and letter grade belong to the combined subject.
        const span = sub.parts.length;
        return sub.parts.map((part, i) => h('tr', { class: fail },
          f.subjectCode ? h('td', {}, n(part.code ?? '')) : null,
          h('td', { class: 'pr-subj' }, pick(part.name, lang)),
          h('td', {}, n(part.fullMarks)), f.highestMarks ? h('td', {}, n(part.highest, 2)) : null,
          cells(part),
          i === 0 ? h('td', { rowspan: span, class: 'pr-combined' }, sub.state === 'ABSENT' ? Lb.absent : n(sub.obtained, 2)) : null,
          i === 0 ? h('td', { rowspan: span, class: 'pr-combined' }, n(sub.point)) : null,
          i === 0 ? h('td', { rowspan: span, class: 'pr-combined' }, sub.grade ?? '') : null));
      }
      return [h('tr', { class: fail },
        f.subjectCode ? h('td', {}, n(sub.code ?? '')) : null,
        h('td', { class: 'pr-subj' }, pick(sub.name, lang), sub.isOptional ? ` (${Lb.optional})` : ''),
        h('td', {}, n(sub.fullMarks)), f.highestMarks ? h('td', {}, n(sub.highest, 2)) : null,
        cells(sub),
        h('td', {}, sub.state === 'ABSENT' ? Lb.absent : n(sub.obtained, 2)), h('td', {}, n(sub.point)), h('td', {}, sub.grade ?? ''))];
    })),
    h('tfoot', {}, h('tr', {}, h('th', { colspan: 2 + (f.subjectCode ? 1 : 0) + (f.highestMarks ? 1 : 0) + cols.length }, Lb.total),
      h('th', {}, n(vm.totals.obtained, 2)), h('th', {}, vm.gpa == null ? '' : n(vm.gpa, 2)), h('th', {}, vm.grade ?? ''))));

  const summary = h('table', { class: 'pr-summary' }, h('tbody', {},
    h('tr', {}, h('th', {}, Lb.gpa), h('td', {}, vm.gpa == null ? '' : n(vm.gpa, 2)), h('th', {}, Lb.grade), h('td', {}, vm.grade ?? ''), h('th', {}, Lb.status), h('td', { class: 'pr-status' }, statusText)),
    f.position && vm.position ? h('tr', {}, h('th', {}, Lb.position), h('td', { colspan: 5 }, `${n(vm.position.value)} (${n(vm.position.of)} ${Lb.of})`)) : null));

  const P = s.page;
  const watermark = P.watermark && ctx.institution?.assets?.logo ? h('img', { class: 'pr-watermark', src: ctx.institution.assets.logo, alt: '', style: `opacity:${P.watermarkOpacity}` }) : null;
  return h('article', { class: `print-doc print-doc--report border--${s.border.style} ${P.centerContent ? 'pr-centered' : ''}`,
    style: `${printVars(s, lang)};--page-color:${P.color};--page-margin:${s.marginsMm.progressReport}mm`, lang, dataset: { orientation: s.orientation.progressReport, margin: s.marginsMm.progressReport } },
    watermark,
    h('div', { class: 'pr-top' }, institutionHeader(ctx.institution, s, lang, Lb.progressReport), scale),
    h('div', { class: 'pr-body' }, details, marks, summary),
    h('footer', { class: 'pr-sigs' }, s.signatures.filter((x) => x.enabled).map((x) => signatureBlock(x, ctx.institution, lang)),
      f.seal && ctx.institution?.assets?.seal ? h('img', { class: 'pr-seal', src: ctx.institution.assets.seal, alt: Lb.seal }) : null),
    pick(ctx.institution?.footer, lang) ? h('p', { class: 'pr-footer' }, pick(ctx.institution.footer, lang)) : null,
    f.printedOn ? h('p', { class: 'pr-printed' }, `${Lb.printed}: ${new Date().toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB')}`) : null);
}

export { signatureBlock };
