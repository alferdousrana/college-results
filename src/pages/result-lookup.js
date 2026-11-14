/**
 * Public front page (no account): college banner, key facts, result lookup, notice board,
 * college history and the principal. Everything except the result search comes from
 * Settings → "Public page and college information" and Settings → "Notices"; empty parts are left out.
 *
 * Result lookup reads only publicExamIndex (published exam list) and publicResults/{hash} by id.
 * Every failure shows the same generic message, so the page never reveals whether a roll exists.
 */
import '@fontsource/noto-serif-bengali/bengali-600.css';
import '@fontsource/noto-serif-bengali/latin-600.css';
import '@fontsource/noto-serif-bengali/bengali-700.css';
import '@fontsource/noto-serif-bengali/latin-700.css';
import { h, svgIcon } from '../core/dom.js';
import { t, tt, L, currentLang, formatNumber } from '../i18n/index.js';
import { getState } from '../core/store.js';
import { field } from '../ui/components/form.js';
import { loadingState, emptyState, errorState } from '../ui/components/states.js';
import { featureGate } from '../ui/components/feature-gate.js';
import { isEnabled } from '../features/flags.js';
import { normalizeDigits } from '../domain/validation/mark-input.js';

export const title = 'lookup.title';

const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function render() {
  const page = h('section', { class: 'page page--lookup pub' });
  if (!getState().firebaseReady) { page.append(h('p', { class: 'notice' }, t('setup.body'))); return page; }

  const hero = h('header', { class: 'landing-hero pub-hero no-print' }, h('div', { class: 'pub-hero__inner' }, h('div', { class: 'pub-hero__placeholder' })));
  const facts = h('div', { class: 'pub-facts no-print', hidden: true });
  const output = h('div', { class: 'lookup-output pub-output', 'aria-live': 'polite' });
  const notices = h('section', { class: 'pub-notices no-print', 'aria-labelledby': 'pub-notices-title' },
    h('h2', { class: 'pub-h2', id: 'pub-notices-title' }, tt('Notice board', 'নোটিশ বোর্ড')), loadingState());
  const about = h('div', { class: 'pub-about-slot no-print' });
  const footer = h('div', { class: 'pub-footer-slot no-print' }, siteFooter());

  page.append(hero, facts,
    h('div', { class: 'pub-main' },
      h('section', { class: 'lookup-card-wrap pub-lookup', 'aria-labelledby': 'pub-lookup-title' },
        h('h2', { class: 'lookup-card-title pub-h2 no-print', id: 'pub-lookup-title' }, t('lookup.title')),
        h('p', { class: 'muted no-print' }, t('lookup.intro')),
        featureGate('public_result_lookup', () => lookupForm(output))),
      notices),
    output, about, footer);

  paintInstitution({ hero, facts, about, footer });
  paintNotices(notices);
  return page;
}

// ---------------------------------------------------------------- result lookup

function lookupForm(output) {
  const wrap = h('div', {}, loadingState());
  import('../data/repositories/public-results-repository.js').then(async (repo) => {
    const exams = await repo.listPublishedExams();
    if (!exams.length) { wrap.replaceChildren(emptyState({ message: t('lookup.noExams') })); return; }
    const classes = [...new Map(exams.map((e) => [L(e.classLabel, 'en'), e.classLabel])).values()];
    const mk = (id, label) => h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label), h('select', { class: 'input', id, required: true }));
    const cF = mk('lk-class', tt('Class', 'শ্রেণি')), yF = mk('lk-year', tt('Session', 'সেশন')), eF = mk('lk-exam', tt('Examination name', 'পরীক্ষার নাম'));
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
      output.scrollIntoView({ behavior: 'smooth', block: 'start' });
      submit.disabled = false;
    });
    wrap.replaceChildren(form);
  }).catch(() => wrap.replaceChildren(errorState({ message: tt('Results could not be loaded. Check the internet connection and try again.', 'ফলাফল লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।') })));
  return wrap;
}

async function resultView({ exam, result }) {
  const [{ renderProgressReport }, { withPrintDefaults, fontFamiliesFor }, { ensurePrintFonts }, { printContainer }] = await Promise.all([
    import('../print/progress-report.js'), import('../print/print-settings.js'), import('../print/fonts.js'), import('../print/print-runner.js')]);
  await ensurePrintFonts();
  const print = withPrintDefaults(exam.print);
  let lang = currentLang() === 'bn' ? 'bn' : print.language;
  const area = h('div', { class: 'print-area ms-viewer' });
  // Fit the whole A4 page to the screen width (no sideways scrolling); +/− to zoom.
  let zoom = null; // null = fit to width
  const zoomLabel = h('span', { class: 'ms-zoom__value', 'aria-live': 'polite' });
  const applyZoom = () => {
    const doc = area.querySelector('.print-doc');
    if (!doc) return;
    doc.style.zoom = '1';
    const fit = Math.min(1, (area.clientWidth - 8) / doc.offsetWidth);
    const z = zoom ?? fit;
    doc.style.zoom = String(z);
    area.classList.toggle('is-zoomed', z > fit + 0.01);
    zoomLabel.textContent = `${Math.round(z * 100)}%`;
  };
  const paint = () => { area.replaceChildren(renderProgressReport(result.vm, { institution: exam.institution, print, scale: exam.scale, lang })); requestAnimationFrame(applyZoom); };
  paint();
  const onResize = () => { if (zoom === null) applyZoom(); };
  window.addEventListener('resize', onResize);
  const step = (d) => { const cur = Number(area.querySelector('.print-doc')?.style.zoom || 1); zoom = Math.max(0.3, Math.min(2, Math.round((cur + d) * 10) / 10)); applyZoom(); };
  const zoomBar = h('div', { class: 'ms-zoom', role: 'group', 'aria-label': tt('Zoom', 'জুম') },
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': tt('Zoom out', 'ছোট করুন'), onclick: () => step(-0.1) }, '−'),
    zoomLabel,
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'aria-label': tt('Zoom in', 'বড় করুন'), onclick: () => step(0.1) }, '+'),
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { zoom = null; applyZoom(); } }, tt('Fit to screen', 'স্ক্রিনে আঁটান')));
  const langSel = h('select', { class: 'input input--sm', 'aria-label': tt('Marksheet language', 'মার্কশিটের ভাষা'), onchange: (e) => { lang = e.target.value; paint(); } },
    [['en', 'English'], ['bn', 'বাংলা']].map(([v, l]) => h('option', { value: v, selected: v === lang }, l)));
  return h('div', {},
    h('div', { class: 'row-actions no-print lookup-actions' }, langSel, zoomBar,
      isEnabled('progress_report_print') ? h('button', { class: 'btn btn--primary', type: 'button', onclick: () => printContainer(area, { families: fontFamiliesFor(print), pageNumbers: false }) }, svgIcon('print'), h('span', {}, t('lookup.print'))) : null),
    area);
}

// ---------------------------------------------------------------- college information

/** Banner, facts row, history + principal and the contact footer (institution/public). */
async function paintInstitution({ hero, facts, about, footer }) {
  let inst;
  try {
    const { getInstitution } = await import('../data/repositories/settings-repository.js');
    inst = await getInstitution();
  } catch {
    hero.replaceChildren(h('div', { class: 'pub-hero__inner' }, h('h1', { class: 'landing-hero__title pub-hero__title' }, t('lookup.title'))));
    return;
  }
  const land = inst.landing ?? {};
  const ab = inst.about ?? {};
  const name = L(land.title) || L(inst.name) || t('app.name');
  const motto = L(inst.header).trim();

  hero.classList.toggle('has-image', Boolean(inst.assets?.heroImage));
  if (inst.assets?.heroImage) hero.style.setProperty('--hero-image', `url("${inst.assets.heroImage}")`);
  hero.replaceChildren(h('div', { class: 'pub-hero__inner' },
    land.showLogo !== false && inst.assets?.logo ? h('img', { class: 'landing-hero__logo pub-hero__logo', src: inst.assets.logo, alt: '' }) : null,
    h('div', { class: 'pub-hero__text' },
      motto ? h('p', { class: 'pub-hero__motto' }, motto.split(/\s+/).map((w) => h('span', {}, w))) : null,
      h('h1', { class: 'landing-hero__title pub-hero__title' }, name),
      L(inst.address) ? h('p', { class: 'landing-hero__address pub-hero__address' }, L(inst.address), inst.eiin ? h('span', { class: 'pub-hero__eiin' }, `EIIN ${formatNumber(inst.eiin)}`) : null) : null,
      L(land.description) ? h('p', { class: 'landing-hero__desc pub-hero__desc' }, L(land.description)) : null,
      L(land.notice) ? h('p', { class: 'landing-hero__notice pub-hero__notice', role: 'note' }, L(land.notice)) : null)));

  // Key facts: only those that are filled in.
  const showCounts = ab.countMode !== 'hidden';
  const items = [
    ab.established ? [tt('Founded', 'প্রতিষ্ঠাকাল'), formatNumber(ab.established)] : null,
    showCounts && ab.studentCount != null ? [tt('Current students', 'বর্তমান শিক্ষার্থী'), formatNumber(ab.studentCount)] : null,
    showCounts && ab.teacherCount != null ? [tt('Teachers', 'শিক্ষক'), formatNumber(ab.teacherCount)] : null,
    L(ab.founder) ? [tt('Founder', 'প্রতিষ্ঠাতা'), L(ab.founder), true] : null,
  ].filter(Boolean);
  if (items.length) {
    facts.hidden = false;
    facts.dataset.count = String(items.length);
    facts.replaceChildren(h('dl', { class: 'pub-facts__list' }, items.map(([label, value, isName]) =>
      h('div', { class: `pub-fact${isName ? ' pub-fact--name' : ''}` }, h('dt', {}, label), h('dd', {}, value)))));
  }

  // History and principal.
  const bio = L(ab.bio).trim();
  const principalName = L(ab.principalName) || L(inst.signatories?.principal?.name);
  const principalTitle = L(ab.principalTitle) || L(inst.signatories?.principal?.title) || tt('Principal', 'অধ্যক্ষ');
  if (bio || principalName) {
    about.replaceChildren(h('section', { class: `pub-about${bio && principalName ? '' : ' pub-about--single'}`, 'aria-labelledby': 'pub-about-title' },
      bio ? h('div', { class: 'pub-about__text' },
        h('h2', { class: 'pub-h2', id: 'pub-about-title' }, tt('About the college', 'কলেজ পরিচিতি')),
        bio.split(/\n\s*\n/).map((p) => h('p', {}, p.trim()))) : h('h2', { class: 'sr-only', id: 'pub-about-title' }, tt('About the college', 'কলেজ পরিচিতি')),
      principalName ? h('figure', { class: 'pub-principal' },
        inst.assets?.principalPhoto ? h('img', { class: 'pub-principal__photo', src: inst.assets.principalPhoto, alt: principalName })
          : h('div', { class: 'pub-principal__initial', 'aria-hidden': 'true' }, principalName.replace(/^(মো\.|মোছা\.|মোঃ|Md\.|Mst\.|Dr\.|ড\.)\s*/i, '').charAt(0)),
        h('figcaption', {}, h('span', { class: 'pub-principal__role' }, principalTitle), h('strong', { class: 'pub-principal__name' }, principalName))) : null));
  }

  // Footer with contacts.
  const contacts = [
    inst.phone ? h('a', { href: `tel:${String(inst.phone).replace(/[^\d+]/g, '')}` }, formatNumber(inst.phone)) : null,
    inst.email ? h('a', { href: `mailto:${inst.email}` }, inst.email) : null,
    inst.website ? h('a', { href: /^https?:/i.test(inst.website) ? inst.website : `https://${inst.website}`, target: '_blank', rel: 'noopener' }, inst.website.replace(/^https?:\/\//i, '')) : null,
  ].filter(Boolean);
  footer.replaceChildren(h('footer', { class: 'pub-footer' },
    h('div', { class: 'pub-footer__inner' },
      h('div', { class: 'pub-footer__id' },
        inst.assets?.logo ? h('img', { src: inst.assets.logo, alt: '', width: 44, height: 44 }) : null,
        h('div', {}, h('strong', {}, L(inst.name) || name), L(inst.address) ? h('div', {}, L(inst.address)) : null)),
      contacts.length ? h('div', { class: 'pub-footer__contacts' }, contacts) : null,
      h('a', { class: 'pub-footer__signin', href: '#/login' }, tt('Teachers and staff: sign in', 'শিক্ষক ও কর্মচারী: সাইন ইন'))),
    siteFooter()));
}

// ---------------------------------------------------------------- notices

function dateParts(iso) {
  const [y, m, d] = String(iso ?? '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const bn = currentLang() === 'bn';
  return { day: formatNumber(d), month: bn ? BN_MONTHS[m - 1] : EN_MONTHS[m - 1], year: formatNumber(y),
    full: bn ? `${formatNumber(d)} ${BN_MONTHS[m - 1]} ${formatNumber(y)}` : `${d} ${EN_MONTHS[m - 1]} ${y}` };
}

const SHOWN = 5;
async function paintNotices(section) {
  const heading = section.firstChild;
  let list;
  try {
    const { listPublicNotices } = await import('../data/repositories/notices-repository.js');
    list = await listPublicNotices();
  } catch { list = null; }
  if (list === null) { section.replaceChildren(heading, h('p', { class: 'muted' }, tt('Notices could not be loaded.', 'নোটিশ লোড করা যায়নি।'))); return; }
  if (!list.length) { section.replaceChildren(heading, h('p', { class: 'pub-notices__empty' }, tt('There are no notices at the moment.', 'এই মুহূর্তে কোনো নোটিশ নেই।'))); return; }
  const ul = h('ol', { class: 'pub-notices__list' });
  let expanded = false;
  const more = h('button', { class: 'btn btn--ghost btn--sm pub-notices__more', type: 'button', onclick: () => { expanded = !expanded; paint(); } });
  const paint = () => {
    ul.replaceChildren(...(expanded ? list : list.slice(0, SHOWN)).map(noticeItem));
    more.hidden = list.length <= SHOWN;
    more.textContent = expanded ? tt('Show fewer', 'কম দেখান') : tt('All notices ({n})', 'সব নোটিশ ({n})', { n: list.length });
  };
  paint();
  section.replaceChildren(heading, ul, more);
}

function noticeItem(n) {
  const d = dateParts(n.date);
  const body = L(n.body).trim();
  const isNew = n.date && Date.now() - Date.parse(n.date) < 7 * 86400000;
  const text = body ? h('div', { class: 'pub-notice__body', hidden: true }, body.split(/\n\s*\n/).map((p) => h('p', {}, p.trim()))) : null;
  const toggle = body ? h('button', { class: 'pub-notice__link', type: 'button', 'aria-expanded': 'false', onclick: () => {
    text.hidden = !text.hidden;
    toggle.setAttribute('aria-expanded', String(!text.hidden));
    toggle.textContent = text.hidden ? tt('Read', 'পড়ুন') : tt('Close', 'বন্ধ করুন');
  } }, tt('Read', 'পড়ুন')) : null;
  return h('li', { class: `pub-notice${n.pinned ? ' pub-notice--pinned' : ''}` },
    d ? h('time', { class: 'pub-notice__date', datetime: n.date, title: d.full }, h('span', { class: 'pub-notice__day' }, d.day), h('span', { class: 'pub-notice__month' }, d.month), h('span', { class: 'pub-notice__year' }, d.year)) : h('span', { class: 'pub-notice__date' }),
    h('div', { class: 'pub-notice__main' },
      h('h3', { class: 'pub-notice__title' }, L(n.title),
        n.pinned ? h('span', { class: 'pub-tag pub-tag--pin' }, tt('Important', 'জরুরি')) : isNew ? h('span', { class: 'pub-tag' }, tt('New', 'নতুন')) : null),
      text,
      h('div', { class: 'pub-notice__actions' },
        toggle,
        n.file ? h('button', { class: 'pub-notice__link pub-notice__pdf', type: 'button', onclick: (e) => openPdf(n, e.currentTarget, false) }, svgIcon('sheet'), tt('Open PDF', 'PDF খুলুন')) : null,
        n.file ? h('button', { class: 'pub-notice__link', type: 'button', onclick: (e) => openPdf(n, e.currentTarget, true) }, svgIcon('download'), tt('Download', 'ডাউনলোড')) : null,
        n.link ? h('a', { class: 'pub-notice__link', href: n.link, target: '_blank', rel: 'noopener' }, tt('Open link', 'লিংক খুলুন')) : null)));
}

/** Fetches the stored PDF only when asked; opens it in a new tab or downloads it. */
async function openPdf(n, btn, download) {
  // Open the tab right away (inside the click) so pop-up blockers allow it; fill it when the file arrives.
  const win = download ? null : window.open('', '_blank');
  btn.disabled = true;
  try {
    const { getNoticeFile, pdfBlobUrl } = await import('../data/repositories/notices-repository.js');
    const file = await getNoticeFile(n.id);
    if (!file?.data) throw new Error('missing');
    const url = pdfBlobUrl(file.data);
    if (win) {
      win.location.href = url;
      // Phones without a PDF viewer download the file instead and leave the new tab empty: close it.
      setTimeout(() => { try { if (win.location.href === 'about:blank') win.close(); } catch { /* showing the PDF */ } }, 2500);
    }
    else {
      const a = h('a', { href: url, download: file.name || 'notice.pdf' });
      document.body.append(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    win?.close();
    const { toast } = await import('../ui/components/toast.js');
    toast(tt('The PDF could not be opened. Check the internet connection and try again.', 'PDF খোলা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।'), 'error');
  } finally { btn.disabled = false; }
}

/** Small credit line under the public page. */
export function siteFooter() {
  return h('div', { class: 'site-footer no-print' },
    h('span', {}, 'Powered by SAGSC'), h('span', { 'aria-hidden': 'true' }, ' · '),
    h('span', {}, 'Developed by ', h('a', { href: 'https://alferdousrana.github.io/', target: '_blank', rel: 'noopener' }, 'Md. Al Ferdous')));
}
