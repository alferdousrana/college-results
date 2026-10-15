/**
 * Public result lookup (no account). Reads only publicExamIndex (published exam list) and
 * publicResults/{hash} by id. Every failure shows the same generic message, so the page never
 * reveals whether a particular roll exists.
 */
import { h, svgIcon } from '../core/dom.js';
import { t, tt, L, currentLang } from '../i18n/index.js';
import { getState } from '../core/store.js';
import { field } from '../ui/components/form.js';
import { loadingState, emptyState, errorState } from '../ui/components/states.js';
import { featureGate } from '../ui/components/feature-gate.js';
import { isEnabled } from '../features/flags.js';
import { normalizeDigits } from '../domain/validation/mark-input.js';

export const title = 'lookup.title';

export function render() {
  const page = h('section', { class: 'page page--lookup' }, h('div', { class: 'lookup-hero no-print' }, h('h1', {}, t('lookup.title')), h('p', { class: 'lede' }, t('lookup.intro'))));
  if (!getState().firebaseReady) { page.append(h('p', { class: 'notice' }, t('setup.body'))); return page; }
  page.append(featureGate('public_result_lookup', () => lookupForm()));
  return page;
}

function lookupForm() {
  const wrap = h('div', {}, loadingState());
  const output = h('div', { class: 'lookup-output', 'aria-live': 'polite' });
  import('../data/repositories/public-results-repository.js').then(async (repo) => {
    const exams = await repo.listPublishedExams();
    if (!exams.length) { wrap.replaceChildren(emptyState({ message: t('lookup.noExams') })); return; }
    const classes = [...new Map(exams.map((e) => [L(e.classLabel, 'en'), e.classLabel])).values()];
    const mk = (id, label) => h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label), h('select', { class: 'input', id, required: true }));
    const cF = mk('lk-class', tt('Class', 'শ্রেণি')), yF = mk('lk-year', tt('Examination year', 'পরীক্ষার বছর')), eF = mk('lk-exam', tt('Examination name', 'পরীক্ষার নাম'));
    const [cS, yS, eS] = [cF, yF, eF].map((x) => x.querySelector('select'));
    const fill = (sel, opts) => sel.replaceChildren(...opts.map(([v, l]) => h('option', { value: v }, l)));
    fill(cS, classes.map((c) => [L(c, 'en'), L(c)]));
    const sync = () => {
      const inClass = exams.filter((e) => L(e.classLabel, 'en') === cS.value);
      const years = [...new Set(inClass.map((e) => e.yearLabel))];
      if (!years.includes(yS.value)) fill(yS, years.map((y) => [y, y]));
      fill(eS, inClass.filter((e) => e.yearLabel === yS.value).map((e) => [e.id, L(e.examLabel) || L(e.title)]));
      const ex = exams.find((e) => e.id === eS.value);
      verifier.el.hidden = !ex?.requiresVerifier;
      if (ex?.verifierLabel) verifier.el.querySelector('label').textContent = L(ex.verifierLabel);
    };
    const roll = field({ label: tt('Roll number', 'রোল নম্বর'), name: 'roll', inputmode: 'numeric', required: true, autocomplete: 'off' });
    const verifier = field({ label: t('lookup.verifier'), name: 'verifier', autocomplete: 'off' });
    cS.addEventListener('change', () => { yS.replaceChildren(); sync(); }); yS.addEventListener('change', sync); eS.addEventListener('change', sync);
    sync();
    const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, svgIcon('search'), h('span', {}, t('lookup.submit')));
    const form = h('form', { class: 'card form lookup-form no-print', novalidate: true }, h('div', { class: 'form-grid' }, cF, yF, eF, roll.el, verifier.el), submit);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const r = normalizeDigits(roll.input.value.trim());
      roll.setError(/^\d{1,6}$/.test(r) ? null : tt('Enter the roll as a number.', 'রোল সংখ্যায় লিখুন।'));
      if (!/^\d{1,6}$/.test(r) || !eS.value) return;
      submit.disabled = true;
      output.replaceChildren(loadingState());
      const found = await repo.fetchPublicResult(eS.value, r, normalizeDigits(verifier.input.value));
      output.replaceChildren(found ? await resultView(found) : errorState({ message: t('lookup.notFound') }));
      submit.disabled = false;
    });
    wrap.replaceChildren(form, output);
  }).catch(() => wrap.replaceChildren(errorState({ message: tt('Results could not be loaded. Check the internet connection and try again.', 'ফলাফল লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।') })));
  return wrap;
}

async function resultView({ exam, result }) {
  const [{ renderProgressReport }, { withPrintDefaults, fontFamiliesFor }, { ensurePrintFonts }, { printContainer }] = await Promise.all([
    import('../print/progress-report.js'), import('../print/print-settings.js'), import('../print/fonts.js'), import('../print/print-runner.js')]);
  await ensurePrintFonts();
  const print = withPrintDefaults(exam.print);
  let lang = currentLang() === 'bn' ? 'bn' : print.language;
  const area = h('div', { class: 'print-area' });
  const paint = () => area.replaceChildren(renderProgressReport(result.vm, { institution: exam.institution, print, scale: exam.scale, lang }));
  paint();
  const langSel = h('select', { class: 'input input--sm', 'aria-label': tt('Marksheet language', 'মার্কশিটের ভাষা'), onchange: (e) => { lang = e.target.value; paint(); } },
    [['en', 'English'], ['bn', 'বাংলা']].map(([v, l]) => h('option', { value: v, selected: v === lang }, l)));
  return h('div', {},
    h('div', { class: 'row-actions no-print lookup-actions' }, langSel,
      isEnabled('progress_report_print') ? h('button', { class: 'btn btn--primary', type: 'button', onclick: () => printContainer(area, { families: fontFamiliesFor(print), pageNumbers: false }) }, svgIcon('print'), h('span', {}, t('lookup.print'))) : null),
    area);
}
