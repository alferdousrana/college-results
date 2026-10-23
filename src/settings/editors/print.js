/** Print design editor with a live sample preview in either language. */
import { h } from '../../core/dom.js';
import { tt } from '../../i18n/index.js';
import { loadingState } from '../../ui/components/states.js';
import { actor } from '../../pages/_shared.js';
import { saveBar } from './_save-bar.js';
import { ENGLISH_FONTS, BANGLA_FONTS, ensurePrintFonts } from '../../print/fonts.js';
import { withPrintDefaults } from '../../print/print-settings.js';
import { featureGate } from '../../ui/components/feature-gate.js';
import { isEnabled } from '../../features/flags.js';

export async function render(el) {
  el.append(loadingState());
  const repo = await import('../../data/repositories/settings-repository.js');
  const [doc, institution, grading] = await Promise.all([repo.getSetting('print', { fresh: true }), repo.getInstitution(), repo.getSetting('grading')]);
  const s = withPrintDefaults(doc);
  const [{ sampleData }, { renderProgressReport }, { renderResultSheet }] = await Promise.all([import('../../print/sample.js'), import('../../print/progress-report.js'), import('../../print/result-sheet.js')]);
  await ensurePrintFonts();
  const sample = sampleData({ scale: grading.scale, policy: grading.policy });
  let previewLang = s.language, previewDoc = 'report';
  const bar = saveBar({ onSave: async () => { const clean = JSON.parse(JSON.stringify(s)); await repo.saveSetting(actor(), 'print', clean, doc.revision ?? 0); doc.revision = (doc.revision ?? 0) + 1; } });
  const previewBox = h('div', { class: 'print-preview-box' });
  const paintPreview = () => {
    const ctx = { institution, print: s, scale: grading.scale, lang: previewLang };
    previewBox.replaceChildren(previewDoc === 'report' ? renderProgressReport(sample.vms[0], ctx) : renderResultSheet({ vms: sample.vms, subjects: sample.subjects, exam: sample.exam, groupLabel: sample.exam.groupLabel }, ctx));
  };
  const changed = () => { bar.markDirty(); paintPreview(); };
  const set = (path, v) => { const k = path.split('.'); let o = s; k.slice(0, -1).forEach((x) => { o = o[x]; }); o[k.at(-1)] = v; changed(); };
  const get = (path) => path.split('.').reduce((o, x) => o?.[x], s);
  const sel = (label, path, options) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), h('select', { class: 'input', onchange: (e) => set(path, e.target.value) }, options.map(([v, l]) => h('option', { value: v, selected: String(get(path)) === String(v) }, l))));
  const num = (label, path, attrs) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), h('input', { class: 'input', type: 'number', value: get(path), ...attrs, onchange: (e) => set(path, Number(e.target.value)) }));
  const chk = (label, path) => h('label', { class: 'field field--check' }, h('input', { type: 'checkbox', class: 'checkbox', checked: Boolean(get(path)), onchange: (e) => set(path, e.target.checked) }), h('span', {}, label));
  const fontsAllowed = isEnabled('custom_print_fonts');
  const fontSel = (label, path, list) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label),
    h('select', { class: 'input', disabled: !fontsAllowed, onchange: (e) => set(path, e.target.value) }, list.map((f) => h('option', { value: f.id, selected: get(path) === f.id, style: `font-family:${f.css}` }, `${f.family}${f.note ? ` — ${f.note}` : ''}`))));
  const sigEditor = (key, title) => h('fieldset', { class: 'fieldset' }, h('legend', {}, title), s[key].map((sig) => h('div', { class: 'sig-row' },
    h('label', { class: 'field field--check' }, h('input', { type: 'checkbox', class: 'checkbox', checked: sig.enabled, onchange: (e) => { sig.enabled = e.target.checked; changed(); } }), h('span', {}, sig.label.en)),
    h('input', { class: 'input input--sm', value: sig.label.en, 'aria-label': 'English label', oninput: (e) => { sig.label.en = e.target.value; changed(); } }),
    h('input', { class: 'input input--sm', value: sig.label.bn, 'aria-label': 'বাংলা নাম', oninput: (e) => { sig.label.bn = e.target.value; changed(); } }),
    h('select', { class: 'input input--sm', 'aria-label': tt('Position', 'অবস্থান'), onchange: (e) => { sig.position = e.target.value; changed(); } }, [['left', tt('Left', 'বাম')], ['center', tt('Centre', 'মাঝ')], ['right', tt('Right', 'ডান')]].map(([v, l]) => h('option', { value: v, selected: sig.position === v }, l))),
    h('label', { class: 'field field--check' }, h('input', { type: 'checkbox', class: 'checkbox', checked: sig.useImage, onchange: (e) => { sig.useImage = e.target.checked; changed(); } }), h('span', {}, tt('Use signature image', 'স্বাক্ষরের ছবি')))))) ;
  const F = s.marksheetFields;
  el.replaceChildren(h('div', { class: 'print-designer' },
    h('div', { class: 'print-designer__form' },
      h('h3', { class: 'form-section' }, tt('Language and fonts', 'ভাষা ও ফন্ট')),
      sel(tt('Default printed language', 'মুদ্রণের প্রাথমিক ভাষা'), 'language', [['en', 'English'], ['bn', 'বাংলা']]),
      featureGate('custom_print_fonts', () => h('div', {}, fontSel(tt('English font', 'ইংরেজি ফন্ট'), 'fonts.en', ENGLISH_FONTS), fontSel(tt('Bangla font', 'বাংলা ফন্ট'), 'fonts.bn', BANGLA_FONTS),
        h('p', { class: 'muted small' }, tt('All {a} English and {b} Bangla fonts are included with the app (open licences), so printing works offline.', 'সব {a}টি ইংরেজি ও {b}টি বাংলা ফন্ট অ্যাপের সাথেই আছে (মুক্ত লাইসেন্স), তাই অফলাইনেও প্রিন্ট হয়।', { a: ENGLISH_FONTS.length, b: BANGLA_FONTS.length })))),
      h('div', { class: 'form-grid' }, num(tt('Body size (pt)', 'মূল লেখা (pt)'), 'fontSizePt.body', { min: 7, max: 14, step: 0.5 }), num(tt('Heading size (pt)', 'শিরোনাম (pt)'), 'fontSizePt.heading', { min: 10, max: 28 }),
        num(tt('Marksheet table (pt)', 'মার্কশিট টেবিল (pt)'), 'fontSizePt.table', { min: 6, max: 13, step: 0.5 }), num(tt('Result sheet table (pt)', 'ফলাফল শিট টেবিল (pt)'), 'fontSizePt.sheetTable', { min: 6, max: 12, step: 0.5 })),
      h('h3', { class: 'form-section' }, tt('Layout', 'বিন্যাস')),
      h('div', { class: 'form-grid' }, sel(tt('Heading alignment', 'শিরোনামের সারিবদ্ধতা'), 'headingAlign', [['center', tt('Centre', 'মাঝ')], ['left', tt('Left', 'বাম')], ['right', tt('Right', 'ডান')]]),
        sel(tt('Heading style', 'শিরোনামের ধরন'), 'headingStyle', [['bold', tt('Bold', 'গাঢ়')], ['boldUnderline', tt('Bold, underlined title', 'গাঢ়, নিচে দাগ')], ['caps', tt('Capital letters', 'বড় হাতের')]]),
        sel(tt('Logo position', 'লোগোর অবস্থান'), 'logoPosition', [['left', tt('Left', 'বাম')], ['center', tt('Above the name', 'নামের উপরে')], ['right', tt('Right', 'ডান')], ['none', tt('No logo', 'লোগো নেই')]]),
        sel(tt('Page border', 'পৃষ্ঠার বর্ডার'), 'border.style', [['double', tt('Double line', 'দুই লাইন')], ['single', tt('Single line', 'এক লাইন')], ['none', tt('None', 'নেই')]]),
        num(tt('Border width (pt)', 'বর্ডারের পুরুত্ব (pt)'), 'border.widthPt', { min: 0.5, max: 6, step: 0.5 }), num(tt('Table line width (pt)', 'টেবিল লাইন (pt)'), 'table.lineWidthPt', { min: 0.25, max: 2, step: 0.25 }),
        num(tt('Cell spacing (pt)', 'ঘরের ফাঁকা (pt)'), 'table.cellPaddingPt', { min: 0, max: 8, step: 0.5 }),
        num(tt('Marksheet margin (mm)', 'মার্কশিট মার্জিন (মিমি)'), 'marginsMm.progressReport', { min: 4, max: 25 }), num(tt('Result sheet margin (mm)', 'ফলাফল শিট মার্জিন (মিমি)'), 'marginsMm.resultSheet', { min: 4, max: 25 }),
        sel(tt('Marksheet orientation', 'মার্কশিটের দিক'), 'orientation.progressReport', [['portrait', tt('Portrait', 'লম্বালম্বি')], ['landscape', tt('Landscape', 'আড়াআড়ি')]]),
        sel(tt('Result sheet orientation', 'ফলাফল শিটের দিক'), 'orientation.resultSheet', [['landscape', tt('Landscape', 'আড়াআড়ি')], ['portrait', tt('Portrait', 'লম্বালম্বি')]])),
      h('h3', { class: 'form-section' }, tt('Individual marksheet page', 'একক মার্কশিটের পৃষ্ঠা')),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field' }, h('span', { class: 'field__label' }, tt('Page colour', 'পৃষ্ঠার রং')), h('input', { class: 'input input--color', type: 'color', value: s.page.color, oninput: (e) => set('page.color', e.target.value) })),
        chk(tt('Large faint logo in the middle (watermark)', 'মাঝখানে বড় হালকা লোগো (জলছাপ)'), 'page.watermark'),
        num(tt('Watermark strength (0.02–0.3)', 'জলছাপের গাঢ়ত্ব (০.০২–০.৩)'), 'page.watermarkOpacity', { min: 0.02, max: 0.3, step: 0.01 }),
        chk(tt('Centre the content on the page', 'বিষয়বস্তু পৃষ্ঠার মাঝখানে রাখুন'), 'page.centerContent')),
      h('p', { class: 'muted small' }, tt('To print the page colour, keep "Background graphics" ticked in the print window (Chrome/Edge: More settings).', 'পৃষ্ঠার রং ছাপাতে প্রিন্ট উইন্ডোতে "Background graphics" টিক দেওয়া রাখুন (Chrome/Edge: More settings)।')),
      h('h3', { class: 'form-section' }, tt('Full result sheet', 'পূর্ণ ফলাফল শিট')),
      h('p', { class: 'muted small' }, tt('The whole width always fits on one page: if there are many columns the table is printed smaller. Fewer columns keep the text larger.', 'পুরো প্রস্থ সবসময় এক পৃষ্ঠায় আঁটবে: কলাম বেশি হলে টেবিল ছোট করে ছাপা হবে। কম কলাম রাখলে লেখা বড় থাকে।')),
      h('div', { class: 'form-grid' }, sel(tt('Paper size', 'কাগজের মাপ'), 'sheet.paper', [['A4', 'A4'], ['Legal', 'Legal']]),
        num(tt('Name column width (mm)', 'নামের কলাম (মিমি)'), 'sheet.nameColumnMm', { min: 20, max: 80 }), chk(tt('Page numbers', 'পৃষ্ঠা নম্বর'), 'sheet.pageNumbers'), chk(tt('Serial number column', 'ক্রমিক নম্বর কলাম'), 'sheet.showSerial'), chk(tt('Subject codes in the header', 'শিরোনামে বিষয় কোড'), 'sheet.showCodes')),
      h('p', { class: 'field__label' }, tt('Bangla, English (subjects with 1st and 2nd papers)', 'বাংলা, ইংরেজি (১ম ও ২য় পত্রের বিষয়)')),
      h('div', { class: 'form-grid' }, chk(tt('1st and 2nd paper marks', '১ম ও ২য় পত্রের নম্বর'), 'sheet.combined.papers'), chk(tt('Total marks', 'মোট নম্বর'), 'sheet.combined.total'), chk(tt('Letter grade', 'লেটার গ্রেড'), 'sheet.combined.grade'), chk(tt('Grade point', 'গ্রেড পয়েন্ট'), 'sheet.combined.gradePoint')),
      h('p', { class: 'field__label' }, tt('Other subjects', 'অন্যান্য বিষয়')),
      h('div', { class: 'form-grid' }, chk(tt('Marks', 'নম্বর'), 'sheet.single.marks'), chk(tt('Letter grade', 'লেটার গ্রেড'), 'sheet.single.grade'), chk(tt('Grade point', 'গ্রেড পয়েন্ট'), 'sheet.single.gradePoint')),
      h('p', { class: 'field__label' }, tt('Last columns', 'শেষের কলাম')),
      h('div', { class: 'form-grid' }, chk(tt('Total marks', 'মোট প্রাপ্ত নম্বর'), 'sheet.totals.totalMarks'), chk('GPA', 'sheet.totals.gpa'), chk(tt('Overall letter grade', 'সামগ্রিক লেটার গ্রেড'), 'sheet.totals.grade'), chk(tt('Merit position', 'মেধাস্থান'), 'sheet.totals.merit')),
      h('h3', { class: 'form-section' }, tt('Shown on the marksheet', 'মার্কশিটে দেখানো হবে')),
      h('div', { class: 'form-grid' }, [['fatherName', tt("Father's name", 'পিতার নাম')], ['motherName', tt("Mother's name", 'মাতার নাম')], ['studentCode', tt('Student ID', 'শিক্ষার্থী আইডি')], ['group', tt('Group', 'বিভাগ')],
        ['highestMarks', tt('Highest marks', 'সর্বোচ্চ নম্বর')], ['gradeScale', tt('Grade table', 'গ্রেড তালিকা')], ['position', tt('Merit position', 'মেধাস্থান')], ['examHeld', tt('Exam held', 'পরীক্ষার সময়')], ['seal', tt('Seal', 'সিল')], ['printedOn', tt('Printed date', 'মুদ্রণের তারিখ')], ['subjectCode', tt('Subject code', 'বিষয় কোড')]]
        .map(([k, l]) => h('label', { class: 'field field--check' }, h('input', { type: 'checkbox', class: 'checkbox', checked: F[k], onchange: (e) => { F[k] = e.target.checked; changed(); } }), h('span', {}, l)))),
      sigEditor('signatures', tt('Marksheet signatures', 'মার্কশিটের স্বাক্ষর')), sigEditor('sheetSignatures', tt('Result sheet signatures', 'ফলাফল শিটের স্বাক্ষর')), bar.el),
    h('div', { class: 'print-designer__preview' },
      h('div', { class: 'row-actions' }, h('select', { class: 'input input--sm', 'aria-label': tt('Preview language', 'প্রাকদর্শনের ভাষা'), onchange: (e) => { previewLang = e.target.value; paintPreview(); } }, [['en', 'English'], ['bn', 'বাংলা']].map(([v, l]) => h('option', { value: v, selected: previewLang === v }, l))),
        h('select', { class: 'input input--sm', 'aria-label': tt('Preview document', 'প্রাকদর্শনের নথি'), onchange: (e) => { previewDoc = e.target.value; paintPreview(); } }, [['report', tt('Marksheet', 'মার্কশিট')], ['sheet', tt('Result sheet', 'ফলাফল শিট')]].map(([v, l]) => h('option', { value: v }, l)))),
      h('p', { class: 'muted small' }, tt('Sample data — for layout only.', 'নমুনা ডেটা — শুধু বিন্যাস দেখার জন্য।')), previewBox)));
  paintPreview();
  return bar.dispose;
}
