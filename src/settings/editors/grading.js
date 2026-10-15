/** Grade scale + calculation policy editor with validation and a plain-language preview. */
import { h } from '../../core/dom.js';
import { tt } from '../../i18n/index.js';
import { loadingState } from '../../ui/components/states.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { actor } from '../../pages/_shared.js';
import { saveBar } from './_save-bar.js';
import { button } from '../../ui/components/page.js';
import { validatePolicyBundle } from '../../domain/validation/settings-validation.js';
import { computeSubjectResult, computeStudentResult, REFERENCE_SCALE_5, DEFAULT_POLICY } from '../../domain/calculation/index.js';

export async function render(el) {
  el.append(loadingState());
  const repo = await import('../../data/repositories/settings-repository.js');
  const doc = await repo.getSetting('grading', { fresh: true });
  let scale = structuredClone(doc.scale);
  const policy = structuredClone({ ...DEFAULT_POLICY, ...doc.policy, optionalSubject: { ...DEFAULT_POLICY.optionalSubject, ...(doc.policy?.optionalSubject ?? {}) }, merit: { ...DEFAULT_POLICY.merit, ...(doc.policy?.merit ?? {}) } });
  const errBox = h('div'); const preview = h('div', { class: 'grading-preview' }); const scaleBox = h('div');
  const bar = saveBar({ onSave: async () => {
    const errors = validatePolicyBundle({ scale, policy });
    if (errors.length) { paintErrors(errors); return false; }
    if (!(await confirmDialog({ title: tt('Save grading rules?', 'গ্রেডিং নিয়ম সংরক্ষণ করবেন?'), body: tt('The new rules apply to results calculated from now on. Results that are already published keep the rules they were published with.', 'নতুন নিয়ম এখন থেকে হিসাব করা ফলাফলে প্রযোজ্য। ইতিমধ্যে প্রকাশিত ফলাফল প্রকাশের সময়ের নিয়ম রাখবে।'), confirmText: tt('Save rules', 'নিয়ম সংরক্ষণ') }))) return false;
    await repo.saveSetting(actor(), 'grading', { scale, policy, confirmed: true }, doc.revision ?? 0); doc.revision = (doc.revision ?? 0) + 1;
  } });
  const changed = () => { bar.markDirty(); refresh(); };
  const paintErrors = (errors) => errBox.replaceChildren(errors.length ? h('ul', { class: 'notice notice--bad' }, errors.map((e) => h('li', {}, e))) : '');
  const num = (v) => (v === '' ? NaN : Number(v));

  function paintScale() {
    scale.sort((a, b) => b.min - a.min);
    scaleBox.replaceChildren(h('div', { class: 'table-scroll' }, h('table', { class: 'data-table comp-table' },
      h('thead', {}, h('tr', {}, [tt('Grade', 'গ্রেড'), tt('Grade point', 'গ্রেড পয়েন্ট'), tt('From %', 'শুরু %'), tt('To %', 'শেষ %'), tt('Fail grade', 'ফেল গ্রেড'), ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, scale.map((b, i) => h('tr', {},
        h('td', {}, h('input', { class: 'input input--sm', value: b.grade, 'aria-label': tt('Grade', 'গ্রেড'), oninput: (e) => { b.grade = e.target.value.trim(); changed(); } })),
        h('td', {}, h('input', { class: 'input input--sm', type: 'number', step: '0.25', value: b.point, 'aria-label': tt('Grade point', 'গ্রেড পয়েন্ট'), onchange: (e) => { b.point = num(e.target.value); changed(); } })),
        h('td', {}, h('input', { class: 'input input--sm', type: 'number', value: b.min, 'aria-label': tt('From %', 'শুরু %'), onchange: (e) => { b.min = num(e.target.value); changed(); paintScale(); } })),
        h('td', {}, h('input', { class: 'input input--sm', type: 'number', value: b.max, 'aria-label': tt('To %', 'শেষ %'), onchange: (e) => { b.max = num(e.target.value); changed(); } })),
        h('td', {}, h('input', { type: 'radio', name: 'failband', checked: Boolean(b.isFail), 'aria-label': tt('Fail grade', 'ফেল গ্রেড'), onchange: () => { scale.forEach((x) => delete x.isFail); b.isFail = true; changed(); } })),
        h('td', {}, button(tt('Remove', 'বাদ দিন'), { size: 'sm', onClick: () => { scale.splice(i, 1); paintScale(); changed(); } }))))))),
      h('div', { class: 'row-actions' }, button(tt('Add grade', 'গ্রেড যোগ'), { size: 'sm', icon: 'plus', onClick: () => { scale.push({ grade: '?', point: 0, min: 0, max: 0 }); paintScale(); changed(); } }),
        button(tt('Reset to starting preset', 'প্রাথমিক মানে ফেরান'), { size: 'sm', onClick: () => { scale = structuredClone(REFERENCE_SCALE_5); paintScale(); changed(); } })));
  }

  const sel = (label, value, options, set, hint) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label),
    h('select', { class: 'input', onchange: (e) => { set(e.target.value); changed(); } }, options.map(([v, l]) => h('option', { value: v, selected: String(value) === String(v) }, l))), hint ? h('span', { class: 'field__hint' }, hint) : null);
  const numF = (label, value, set, attrs = {}, hint) => h('label', { class: 'field' }, h('span', { class: 'field__label' }, label), h('input', { class: 'input', type: 'number', value, ...attrs, onchange: (e) => { set(num(e.target.value)); changed(); } }), hint ? h('span', { class: 'field__hint' }, hint) : null);
  const chk = (label, value, set) => h('div', { class: 'field field--check' }, h('input', { type: 'checkbox', class: 'checkbox', checked: value, id: `g-${label.length}-${String(value)}`, onchange: (e) => { set(e.target.checked); changed(); } }), h('label', {}, label));
  const rounding = [['half-up', tt('Round half up (4.665 → 4.67)', 'অর্ধেক হলে উপরে (৪.৬৬৫ → ৪.৬৭)')], ['truncate', tt('Cut off extra digits (4.669 → 4.66)', 'বাড়তি অঙ্ক বাদ (৪.৬৬৯ → ৪.৬৬)')], ['half-even', tt('Round half to even', 'অর্ধেক হলে জোড়ের দিকে')]];
  const tieKeys = [['passed', tt('Passed before failed', 'উত্তীর্ণ আগে')], ['gpa', 'GPA'], ['total', tt('Total marks', 'মোট নম্বর')], ['gpaWithoutOptional', tt('GPA without optional subject', 'ঐচ্ছিক বিষয় ছাড়া জিপিএ')], ['fewerFailedSubjects', tt('Fewer failed subjects', 'কম বিষয়ে ফেল')]];
  const tieSelects = [0, 1, 2, 3].map((i) => sel(tt('Order step {n}', 'ক্রম ধাপ {n}', { n: i + 1 }), policy.merit.tieBreakers[i] ?? '', [['', '—'], ...tieKeys], (v) => { const t2 = [...policy.merit.tieBreakers]; t2[i] = v; policy.merit.tieBreakers = t2.filter(Boolean); }));

  function refresh() {
    paintErrors(validatePolicyBundle({ scale, policy }));
    const ex = { id: 'x', components: [{ id: 'cq', label: 'CQ', maxMarks: 70, passMarks: 23 }, { id: 'mcq', label: 'MCQ', maxMarks: 30, passMarks: 10 }] };
    const a = computeSubjectResult(ex, { components: { cq: 62, mcq: 9 } }, policy, scale);
    const b = computeSubjectResult(ex, { components: { cq: 55, mcq: 24 } }, policy, scale);
    const subj = (id) => ({ id, components: [{ id: 'w', maxMarks: 100, passMarks: 33 }] });
    const opt = computeStudentResult({ subjects: [subj('a'), subj('b'), subj('o')], marks: { a: { components: { w: 72 } }, b: { components: { w: 81 } }, o: { components: { w: 85 } } }, policy, scale, optionalSubjectId: 'o' });
    const failBand = scale.find((x) => x.isFail);
    preview.replaceChildren(h('h3', { class: 'form-section' }, tt('What these rules mean', 'এই নিয়মগুলোর অর্থ')), h('ul', {},
      h('li', {}, tt('A subject is graded on its percentage. {g} is the fail grade ({p} points).', 'বিষয়ের গ্রেড শতাংশে নির্ধারিত। {g} হলো ফেল গ্রেড ({p} পয়েন্ট)।', { g: failBand?.grade ?? '?', p: failBand?.point ?? '?' })),
      h('li', {}, tt('Example: CQ 62/70 and MCQ 9/30 (MCQ pass 10) → total {t}, but the MCQ part failed, so the subject is {g}.', 'উদাহরণ: সৃজনশীল ৬২/৭০ ও বহুনির্বাচনি ৯/৩০ (পাস ১০) → মোট {t}, কিন্তু বহুনির্বাচনিতে ফেল, তাই বিষয়ে {g}।', { t: a.obtained, g: a.grade })),
      h('li', {}, tt('Example: CQ 55/70 and MCQ 24/30 → {t}% → grade {g} ({p}).', 'উদাহরণ: সৃজনশীল ৫৫/৭০ ও বহুনির্বাচনি ২৪/৩০ → {t}% → গ্রেড {g} ({p})।', { t: b.percentage, g: b.grade, p: b.point })),
      h('li', {}, tt('Optional subject: only points above {d} are added. Two subjects at 72% and 81% plus an optional 85% give GPA {x} (without optional {y}). GPA is capped at {m}.', 'ঐচ্ছিক বিষয়: শুধু {d}-এর বেশি পয়েন্ট যোগ হয়। ৭২% ও ৮১% দুটি বিষয় এবং ঐচ্ছিক ৮৫% হলে জিপিএ {x} (ঐচ্ছিক ছাড়া {y})। সর্বোচ্চ জিপিএ {m}।', { d: policy.optionalSubject.deductPoint, x: opt.gpa, y: opt.gpaWithoutOptional, m: policy.maxGpa })),
      h('li', {}, policy.absentSubject === 'fail' ? tt('Absent in a subject counts as failing it. Missing marks are never treated as zero — the result stays incomplete.', 'কোনো বিষয়ে অনুপস্থিত হলে সেই বিষয়ে ফেল ধরা হয়। বাকি নম্বর কখনো শূন্য ধরা হয় না — ফলাফল অসম্পূর্ণ থাকে।') : tt('Absent subjects are left out of the result.', 'অনুপস্থিত বিষয় ফলাফল থেকে বাদ থাকে।')),
      h('li', {}, tt('Merit: students are ordered by {k}. Students equal on all of these share a position ({m}). Incomplete results are never ranked.', 'মেধা: শিক্ষার্থীরা {k} অনুযায়ী সাজানো। সবগুলোতে সমান হলে একই স্থান ({m})। অসম্পূর্ণ ফলাফলের স্থান হয় না।',
        { k: policy.merit.tieBreakers.map((k) => tieKeys.find((x) => x[0] === k)?.[1] ?? k).join(' → '), m: { competition: '1, 1, 3', dense: '1, 1, 2', sequential: tt('no ties; roll decides', 'সমতা নেই; রোল অনুযায়ী') }[policy.merit.method] })),
      !policy.merit.rankFailed ? h('li', {}, tt('Failed students get no merit position.', 'অনুত্তীর্ণ শিক্ষার্থীদের মেধাস্থান হয় না।')) : null));
  }

  el.replaceChildren(
    !doc._exists || !doc.confirmed ? h('p', { class: 'notice notice--locked' }, tt('These are starting values copied from the sample marksheet, not official board rules. Check them against your institution\'s rules and save.', 'এগুলো নমুনা মার্কশিট থেকে নেওয়া প্রাথমিক মান, বোর্ডের সরকারি নিয়ম নয়। প্রতিষ্ঠানের নিয়মের সাথে মিলিয়ে সংরক্ষণ করুন।')) : null,
    h('h3', { class: 'form-section' }, tt('Grade ranges', 'গ্রেডের সীমা')), scaleBox,
    h('h3', { class: 'form-section' }, tt('GPA and rounding', 'জিপিএ ও রাউন্ডিং')),
    h('div', { class: 'form-grid' },
      numF(tt('Maximum GPA', 'সর্বোচ্চ জিপিএ'), policy.maxGpa, (v) => { policy.maxGpa = v; }, { step: '0.5', min: 1 }),
      numF(tt('GPA decimal places', 'জিপিএ দশমিক ঘর'), policy.gpaDecimals, (v) => { policy.gpaDecimals = v; }, { min: 0, max: 3 }),
      sel(tt('GPA rounding', 'জিপিএ রাউন্ডিং'), policy.gpaRounding, rounding, (v) => { policy.gpaRounding = v; }),
      numF(tt('GPA given when a required subject fails', 'আবশ্যক বিষয়ে ফেল হলে জিপিএ'), policy.failedGpa, (v) => { policy.failedGpa = v; }, { step: '0.5', min: 0 }),
      numF(tt('Mark decimal places', 'নম্বরের দশমিক ঘর'), policy.marksDecimals, (v) => { policy.marksDecimals = v; }, { min: 0, max: 2 }),
      sel(tt('Mark rounding', 'নম্বর রাউন্ডিং'), policy.marksRounding, rounding, (v) => { policy.marksRounding = v; }),
      chk(tt('Allow decimal marks such as 45.5', '৪৫.৫-এর মতো দশমিক নম্বর গ্রহণ'), policy.allowDecimalMarks !== false, (v) => { policy.allowDecimalMarks = v; })),
    h('h3', { class: 'form-section' }, tt('Absence and optional subject', 'অনুপস্থিতি ও ঐচ্ছিক বিষয়')),
    h('div', { class: 'form-grid' },
      sel(tt('A student absent in a whole subject', 'পুরো বিষয়ে অনুপস্থিত হলে'), policy.absentSubject, [['fail', tt('fails that subject', 'সেই বিষয়ে ফেল')], ['exclude', tt('is left out of that subject', 'সেই বিষয় বাদ')]], (v) => { policy.absentSubject = v; }),
      chk(tt('Absent in one part that has pass marks fails the subject', 'পাস নম্বরযুক্ত একটি অংশে অনুপস্থিত হলে বিষয়ে ফেল'), policy.componentAbsentFails !== false, (v) => { policy.componentAbsentFails = v; }),
      numF(tt('Optional subject: points deducted before adding', 'ঐচ্ছিক বিষয়: যোগের আগে বাদ পয়েন্ট'), policy.optionalSubject.deductPoint, (v) => { policy.optionalSubject.deductPoint = v; }, { step: '0.5', min: 0 }),
      chk(tt('Optional subject marks count in total marks', 'ঐচ্ছিক বিষয়ের নম্বর মোট নম্বরে গণ্য'), policy.optionalSubject.includeInTotal !== false, (v) => { policy.optionalSubject.includeInTotal = v; })),
    h('h3', { class: 'form-section' }, tt('Merit position', 'মেধাস্থান')),
    h('p', { class: 'muted small' }, tt('Positions are counted separately for each examination, class and group.', 'প্রতিটি পরীক্ষা, শ্রেণি ও বিভাগে আলাদাভাবে মেধাস্থান হিসাব হয়।')),
    h('div', { class: 'form-grid' }, sel(tt('Equal results', 'সমান ফলাফল'), policy.merit.method, [['competition', tt('share a position, next skips (1, 1, 3)', 'একই স্থান, পরেরটি লাফ দেয় (১, ১, ৩)')], ['dense', tt('share a position, next follows (1, 1, 2)', 'একই স্থান, পরেরটি পরপর (১, ১, ২)')], ['sequential', tt('never share; lower roll first', 'কখনো একই নয়; কম রোল আগে')]], (v) => { policy.merit.method = v; }),
      chk(tt('Give failed students a position (after all who passed)', 'অনুত্তীর্ণদেরও স্থান দিন (সব উত্তীর্ণের পরে)'), policy.merit.rankFailed !== false, (v) => { policy.merit.rankFailed = v; }), ...tieSelects),
    errBox, preview, bar.el);
  paintScale(); refresh();
  return bar.dispose;
}
