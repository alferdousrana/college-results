/**
 * Printed examination routine (Bangla) and student attendance sheets (হাজিরা শীট).
 * Routine layout: Date/Day | for each time slot: one column per result sheet (class), subjects listed
 * with their codes — like a university schedule table.
 */
import { h } from '../core/dom.js';
import { pick } from './labels.js';
import { withPrintDefaults, printVars } from './print-settings.js';
import { institutionHeader, mottoRow, signatureBlock } from './progress-report.js';
import { bnDate, bnDigits, cellKey, sortedDays, attendanceRows } from '../domain/routine.js';

/** "পদার্থবিজ্ঞান - ১৭৪, ১৭৫" */
export function subjectText(def) {
  if (!def) return '';
  const name = pick(def.name, 'bn') || pick(def.name, 'en');
  return def.code ? `${name} - ${bnDigits(def.code)}` : name;
}

/**
 * columns: [{ sessionId, label, defs: { subjectId: definition } }]
 */
export function renderRoutine(routine, columns, ctx) {
  const s = withPrintDefaults(ctx.print);
  const slots = routine.slots ?? [];
  const days = sortedDays(routine);
  const head1 = h('tr', {}, h('th', { rowspan: 2, class: 'rt-date' }, 'তারিখ ও বার'), slots.map((sl) => h('th', { colspan: columns.length }, sl.label)));
  const head2 = h('tr', {}, slots.map(() => columns.map((c) => h('th', {}, c.label))));
  const body = days.map((d) => {
    const { date, day } = bnDate(d.date);
    return h('tr', {}, h('td', { class: 'rt-date' }, h('strong', {}, date), h('div', {}, day)),
      slots.map((sl) => columns.map((c) => {
        const ids = d.cells?.[cellKey(sl.id, c.sessionId)] ?? [];
        return h('td', { class: ids.length ? '' : 'rt-empty' }, ids.length ? ids.map((id) => h('div', { class: 'rt-subject' }, subjectText(c.defs[id]))) : '—');
      })));
  });
  return h('article', { class: 'print-doc print-doc--routine', lang: 'bn', style: printVars(s, 'bn'), dataset: { orientation: columns.length * slots.length > 2 ? 'landscape' : 'portrait', margin: 10 } },
    mottoRow(ctx.institution, s, 'bn'),
    institutionHeader(ctx.institution, s, 'bn', 'পরীক্ষার সময়সূচি'),
    routine.title ? h('p', { class: 'rt-title' }, routine.title) : null,
    h('table', { class: 'rt-table' }, h('thead', {}, head1, head2), h('tbody', {}, body)),
    routine.note ? h('p', { class: 'rt-note' }, routine.note) : null,
    h('footer', { class: 'pr-sigs pr-sigs--sheet' }, s.sheetSignatures.filter((x) => x.enabled).map((x) => signatureBlock(x, ctx.institution, 'bn'))));
}

/**
 * Attendance sheets: two students per landscape page, grouped by group (each group starts a new page).
 * students: [{ name, roll, groupLabel, fourthName, subjectIds }]
 */
export function renderAttendance(routine, column, students, ctx, { minRows = 10, examTitle = '' } = {}) {
  const s = withPrintDefaults(ctx.print);
  const box = (st) => {
    const rows = attendanceRows(routine, column.sessionId, st.subjectIds);
    const blanks = Math.max(0, minRows - rows.length);
    return h('div', { class: 'at-box' },
      h('div', { class: 'at-head' },
        h('div', {}, 'পরীক্ষার্থীর নাম : ', h('strong', {}, st.name)),
        h('div', { class: 'at-head__row' }, h('span', {}, 'শ্রেণি রোল নম্বর : ', h('strong', {}, bnDigits(st.roll))), h('span', {}, 'চতুর্থ বিষয় : ', h('strong', {}, st.fourthName ?? '')))),
      h('table', { class: 'at-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'পরীক্ষার তারিখ'), h('th', {}, 'পরীক্ষার বিষয়'), h('th', {}, 'পরীক্ষার্থীর স্বাক্ষর'), h('th', {}, 'কক্ষপ্রত্যবেক্ষকের স্বাক্ষর'))),
        h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, bnDate(r.date).date, (routine.slots?.length ?? 0) > 1 && r.order > 0 ? h('div', { class: 'at-slot' }, r.slotLabel) : null),
          h('td', {}, subjectText(column.defs[r.subjectId])), h('td', {}), h('td', {}))),
          Array.from({ length: blanks }, () => h('tr', {}, h('td', {}, '\u00a0'), h('td', {}), h('td', {}), h('td', {}))))));
  };
  const pages = [];
  for (let i = 0; i < students.length; i += 2) {
    const pair = students.slice(i, i + 2);
    pages.push(h('article', { class: 'print-doc print-doc--attendance', lang: 'bn', style: printVars(s, 'bn'), dataset: { orientation: 'landscape', margin: 8 } },
      h('header', { class: 'at-page-head' },
        h('div', { class: 'at-page-head__text' }, h('h1', { class: 'pr-inst' }, pick(ctx.institution?.name, 'bn')), h('p', {}, examTitle), h('p', {}, 'পরীক্ষার্থী হাজিরা শীট')),
        pair[0]?.groupLabel ? h('div', { class: 'at-group' }, pair[0].groupLabel) : null),
      h('div', { class: 'at-pair' }, pair.map(box)),
      h('footer', { class: 'pr-sigs pr-sigs--sheet' }, s.sheetSignatures.filter((x) => x.enabled).map((x) => signatureBlock(x, ctx.institution, 'bn')))));
  }
  return pages;
}

/** Subjects held on one date, across every column and time slot (for the invigilator sheet). */
function subjectsOnDay(routine, day, columns) {
  const out = [];
  for (const sl of routine.slots ?? []) for (const c of columns) for (const id of day.cells?.[cellKey(sl.id, c.sessionId)] ?? []) {
    const t = subjectText(c.defs[id]);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Invigilator duty sheet (কক্ষ প্রত্যবেক্ষক): date & day, subjects from the routine, the teachers (numbered)
 * and staff (❖) on duty, and a signature box for each teacher. Committee list and signatures at the end.
 * people: { teachers: { id: name }, staff: { id: name } }
 */
export function renderDuties(routine, columns, people, ctx) {
  const s = withPrintDefaults(ctx.print);
  const duties = routine.duties ?? {};
  const prefix = routine.dutyPrefix ?? 'জনাব';
  const rows = sortedDays(routine).map((d) => {
    const duty = duties[d.id] ?? {};
    const teachers = (duty.teacherIds ?? []).map((id) => people.teachers[id]).filter(Boolean);
    const staff = (duty.staffIds ?? []).map((id) => people.staff[id]).filter(Boolean);
    const { date, day } = bnDate(d.date);
    return h('tr', {},
      h('td', { class: 'rt-date' }, h('strong', {}, date), h('div', {}, day)),
      h('td', { class: 'dt-subjects' }, subjectsOnDay(routine, d, columns).map((t) => h('div', {}, t))),
      // Names and signature boxes are built line by line so each box sits beside its name.
      h('td', { class: 'dt-people' },
        teachers.length ? h('div', { class: 'dt-line dt-line--head' }, 'শিক্ষক মণ্ডলী') : null,
        teachers.map((n, i) => h('div', { class: 'dt-line' }, `${bnDigits(i + 1)}) ${prefix ? `${prefix} ` : ''}${n}`)),
        staff.length ? h('div', { class: 'dt-line dt-line--head' }, 'কর্মচারীগণ') : null,
        staff.map((n) => h('div', { class: 'dt-line dt-line--staff' }, `❖ ${n}`))),
      h('td', { class: 'dt-sign' },
        teachers.length ? h('div', { class: 'dt-line dt-line--head' }) : null,
        teachers.map(() => h('div', { class: 'dt-line' }, h('div', { class: 'dt-sign__box' }))),
        staff.length ? h('div', { class: 'dt-line dt-line--head' }) : null,
        staff.map(() => h('div', { class: 'dt-line' }, h('div', { class: 'dt-sign__box' })))));
  });
  const committee = (routine.committee ?? []).filter((m) => m.name);
  return h('article', { class: 'print-doc print-doc--routine print-doc--duties', lang: 'bn', style: printVars(s, 'bn'), dataset: { orientation: 'portrait', margin: 10 } },
    mottoRow(ctx.institution, s, 'bn'),
    institutionHeader(ctx.institution, s, 'bn', routine.title || 'পরীক্ষা'),
    h('p', { class: 'rt-title' }, 'কক্ষ প্রত্যবেক্ষকগণের নাম, পরীক্ষার বিষয়, তারিখ ও স্বাক্ষর'),
    h('table', { class: 'rt-table dt-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'পরীক্ষার তারিখ ও বার'), h('th', {}, 'পরীক্ষার বিষয়'), h('th', {}, 'কক্ষ প্রত্যবেক্ষকের নাম'), h('th', {}, 'স্বাক্ষর'))),
      h('tbody', {}, rows)),
    committee.length ? h('section', { class: 'dt-committee' }, h('p', { class: 'dt-committee__title' }, 'সৌজন্যে'), h('p', { class: 'dt-committee__title' }, 'পরীক্ষা কমিটি'),
      h('ol', {}, committee.map((m, i) => h('li', {}, `${bnDigits(i + 1)}. ${prefix ? `${prefix} ` : ''}${m.name}${m.designation ? ` (${m.designation})` : ''}`)))) : null,
    h('footer', { class: 'pr-sigs pr-sigs--sheet' }, s.sheetSignatures.filter((x) => x.enabled).map((x) => signatureBlock(x, ctx.institution, 'bn'))));
}

/** Admit cards (প্রবেশ পত্র): four per A4 page. */
export function renderAdmitCards(students, { examTitle, sessionLabel, classLabel, validUntil, sentence }, ctx) {
  const inst = ctx.institution ?? {};
  const sig = inst.assets?.principalSignature;
  const text = (sentence || 'তাকে {date} তারিখ পর্যন্ত / পূর্ণ অনুমতি দেওয়া হলো।').replace('{date}', validUntil ? bnDate(validUntil).date : '______');
  const card = (st) => h('div', { class: 'ac-card' },
    h('div', { class: 'ac-inner' },
      h('p', { class: 'ac-inst' }, pick(inst.name, 'bn')), h('p', { class: 'ac-addr' }, pick(inst.address, 'bn')), h('p', { class: 'ac-exam' }, examTitle),
      h('p', { class: 'ac-title' }, 'প্রবেশ পত্র'),
      h('div', { class: 'ac-row' }, h('span', {}, 'পরীক্ষার্থীর নাম : ', h('strong', {}, st.name)), h('span', {}, 'শ্রেণি : ', h('strong', {}, classLabel))),
      h('div', { class: 'ac-row' }, h('span', {}, 'শ্রেণি রোল : ', h('strong', {}, bnDigits(st.roll))), h('span', {}, 'শিক্ষাবর্ষ : ', h('strong', {}, bnDigits(sessionLabel))), h('span', {}, 'বিভাগ : ', h('strong', {}, st.groupName))),
      h('p', { class: 'ac-text' }, text),
      h('div', { class: 'ac-sign' }, sig ? h('img', { src: sig, alt: '' }) : h('span', { class: 'ac-sign__space' }), h('span', {}, 'অধ্যক্ষ'))));
  const pages = [];
  for (let i = 0; i < students.length; i += 4) pages.push(h('article', { class: 'print-doc print-doc--cards print-doc--admit', lang: 'bn', dataset: { orientation: 'landscape', margin: 12 } }, h('div', { class: 'ac-grid' }, students.slice(i, i + 4).map(card))));
  return pages;
}

/** Seat plan cards: 9 or 12 (or any number) per A4 page; fields chosen by the administrator. */
export function renderSeatCards(students, { perPage = 8, fields = ['exam', 'title', 'class', 'roll'], examTitle, classLabel, sessionLabel }, ctx) {
  const inst = ctx.institution ?? {};
  const cols = perPage <= 8 ? 2 : 3;
  const rows = Math.ceil(perPage / cols);
  const line = (key, st) => ({
    institution: h('p', { class: 'sc-inst' }, pick(inst.name, 'bn')),
    exam: h('p', { class: 'sc-exam' }, examTitle),
    title: h('p', { class: 'sc-title' }, 'পরীক্ষার্থীর আসন'),
    class: h('p', { class: 'sc-class' }, classLabel),
    group: h('p', {}, 'বিভাগ : ', h('strong', {}, st.groupName)),
    session: h('p', {}, 'শিক্ষাবর্ষ : ', h('strong', {}, bnDigits(sessionLabel))),
    roll: h('p', { class: 'sc-roll' }, `রোল নং - ${bnDigits(st.roll)}`),
    name: h('p', { class: 'sc-name' }, st.name),
    fourth: st.fourthName ? h('p', {}, '৪র্থ বিষয় : ', st.fourthName) : null,
  }[key] ?? null);
  const pages = [];
  for (let i = 0; i < students.length; i += perPage) {
    pages.push(h('article', { class: 'print-doc print-doc--cards print-doc--seat', lang: 'bn', dataset: { orientation: 'portrait', margin: 10 } },
      h('div', { class: `sc-grid sc-grid--${cols}`, style: `grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr)` },
        students.slice(i, i + perPage).map((st) => h('div', { class: 'sc-card' }, fields.map((f) => line(f, st)))))));
  }
  return pages;
}
