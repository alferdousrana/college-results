/** Examination routines: list, then editor / printed routine / attendance sheets for one routine. */
import { h, svgIcon } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button, linkButton, tabs } from '../../ui/components/page.js';
import { asyncSection, loadingState, errorState, emptyState } from '../../ui/components/states.js';
import { field } from '../../ui/components/form.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { toast } from '../../ui/components/toast.js';
import { navigate } from '../../app/router.js';
import { actor, friendlyError, nameOf, run } from '../_shared.js';
import { fmtDate } from '../../ui/format.js';
import { cellKey, sortedDays, scheduleCheck, bnDigits, bnDate } from '../../domain/routine.js';
import { subjectDefinition, studentSubjectIds } from '../../domain/session-calc.js';
import { subjectLabelForClass } from '../../domain/paper-scheme.js';
import { ids } from '../../data/paths.js';

export const title = 'nav.routines';
const DEFAULT_SLOTS = [{ id: 'am', label: 'সকাল ১০.০০টা' }, { id: 'pm', label: 'বিকাল ১.৩০টা' }];

export function render({ query }) {
  return query.get('id') ? editor(query.get('id')) : list();
}

function list() {
  const body = h('div');
  asyncSection(body, async () => (await import('../../data/repositories/routine-repository.js')).listRoutines(), (rows) => rows.length
    ? h('ul', { class: 'sheet-list' }, rows.map((r) => h('li', { class: 'sheet-row' }, h('div', { class: 'sheet-row__head' },
        h('a', { class: 'sheet-row__title', href: `#/admin/routines?id=${encodeURIComponent(r.id)}` }, r.title || tt('Untitled routine', 'শিরোনামহীন সময়সূচি')),
        h('span', { class: 'muted small' }, tt('{n} days · updated {d}', '{n} দিন · হালনাগাদ {d}', { n: r.days?.length ?? 0, d: fmtDate(r.updatedAt) }))))))
    : emptyState({ message: tt('No routine yet. Create one for the next examination.', 'এখনো কোনো সময়সূচি নেই। পরবর্তী পরীক্ষার জন্য তৈরি করুন।') }));
  return h('section', { class: 'page' }, pageHeader({ title: t('nav.routines'), subtitle: tt('Build the examination routine once; the printed routine and every student\'s attendance sheet are produced from it.', 'একবার সময়সূচি তৈরি করুন; ছাপানো সময়সূচি ও প্রত্যেক শিক্ষার্থীর হাজিরা শীট এখান থেকেই তৈরি হবে।'),
    actions: [button(tt('New routine', 'নতুন সময়সূচি'), { kind: 'primary', icon: 'plus', onClick: async () => {
      const { saveRoutine } = await import('../../data/repositories/routine-repository.js');
      const id = await run(() => saveRoutine(actor(), null, { title: '', note: '', columns: [], slots: DEFAULT_SLOTS, days: [] }));
      if (id) navigate(`/admin/routines?id=${encodeURIComponent(id)}`);
    } })] }), body);
}

function editor(id) {
  const root = h('section', { class: 'page page--wide' }, loadingState());
  (async () => {
    const [repo, { loadSessionBundle }, { loadAllCatalogues }, { getPrintContextFromSettings }] = await Promise.all([
      import('../../data/repositories/routine-repository.js'), import('../../data/repositories/sessions-repository.js'),
      import('../../data/repositories/catalogue-repository.js'), import('./routine-print-context.js')]);
    const routine = await repo.getRoutine(id);
    if (!routine) { root.replaceChildren(errorState({ message: tt('Routine not found.', 'সময়সূচি পাওয়া যায়নি।') })); return; }
    const cats = await loadAllCatalogues();
    // A routine is made BEFORE the result sheet: each column is a class + examination + session.
    // If the result sheet already exists its subjects/students are used, otherwise the catalogue and class list.
    const bundles = new Map();
    const bundleOf = async (sid) => {
      if (!bundles.has(sid)) bundles.set(sid, await loadSessionBundle(sid).catch(() => null));
      return bundles.get(sid);
    };
    const parse = (sid) => { const [yearId, classId, examDefId] = String(sid).split('__'); return { yearId, classId, examDefId }; };
    const st = { title: routine.title ?? '', note: routine.note ?? '', columns: [...(routine.columns ?? [])], slots: routine.slots?.length ? [...routine.slots] : [...DEFAULT_SLOTS], days: (routine.days ?? []).map((d) => ({ ...d, cells: { ...(d.cells ?? {}) } })),
      duties: { ...(routine.duties ?? {}) }, committee: [...(routine.committee ?? [])], dutyPrefix: routine.dutyPrefix ?? 'জনাব',
      admit: { sentence: 'তাকে {date} তারিখ পর্যন্ত / পূর্ণ অনুমতি দেওয়া হলো।', validUntil: '', ...(routine.admit ?? {}) },
      seat: { perPage: 8, fields: ['exam', 'title', 'class', 'roll'], ...(routine.seat ?? {}) } };
    for (const c of st.columns) { Object.assign(c, { ...parse(c.sessionId), ...c }); await bundleOf(c.sessionId); }
    let dirty = false;
    const mark = () => { dirty = true; saveState.hidden = false; };
    const saveState = h('span', { class: 'unsaved', hidden: true }, t('common.unsaved'));
    const save = async () => {
      if (st.days.some((d) => !d.date)) { toast(tt('Every row needs a date. Fill in or remove the empty rows.', 'প্রতিটি সারিতে তারিখ লাগবে। খালি সারিতে তারিখ দিন বা সারিটি সরান।'), 'error'); return; }
      const days = st.days.filter((d) => d.date).map((d) => ({ id: d.id, date: d.date, cells: Object.fromEntries(Object.entries(d.cells).filter(([, v]) => v?.length)) }));
      if (await run(() => repo.saveRoutine(actor(), id, { title: st.title, note: st.note, columns: st.columns, slots: st.slots, days, duties: st.duties, committee: st.committee.filter((m) => m.name), dutyPrefix: st.dutyPrefix, admit: st.admit, seat: st.seat }), { success: tt('Routine saved', 'সময়সূচি সংরক্ষিত') }) !== undefined) { dirty = false; saveState.hidden = true; }
    };
    const defsOf = (sid) => {
      const b = bundles.get(sid);
      if (b) return Object.fromEntries(b.subjects.map((x) => [x.id, subjectDefinition(x)]));
      const { classId } = parse(sid);
      return Object.fromEntries(cats.subjects.filter((x) => x.active !== false && (!x.classIds?.length || x.classIds.includes(classId)))
        .sort((a, b2) => (a.order ?? 0) - (b2.order ?? 0)).map((x) => { const l = subjectLabelForClass(x, classId); return [x.id, { id: x.id, name: l.name, code: l.code }]; }));
    };
    const subjectLabel = (sid, subId) => { const d = defsOf(sid)[subId]; return d ? `${L(d.name, 'bn') || L(d.name, 'en')}${d.code ? ` - ${bnDigits(d.code)}` : ''}` : subId; };

    function editTab() {
      const box = h('div');
      const paint = () => {
        const titleF = field({ label: tt('Routine title (as printed)', 'সময়সূচির শিরোনাম (যেভাবে ছাপা হবে)'), name: 'rtt', value: st.title, hint: 'যেমন: দ্বাদশ শ্রেণির নির্বাচনী ও একাদশ শ্রেণির ত্রৈমাসিক পরীক্ষা-২০২৪' });
        titleF.input.addEventListener('input', () => { st.title = titleF.value; mark(); });
        const noteF = field({ label: tt('Note under the routine', 'সময়সূচির নিচের নোট'), name: 'rtn', type: 'textarea', value: st.note, hint: 'যেমন: বি: দ্র: বিকালের পরীক্ষা প্রতিদিন দুপুর ০১.৩০ টায় শুরু হবে।' });
        noteF.input.addEventListener('input', () => { st.note = noteF.value; mark(); });
        // Columns = result sheets
        const yearSel = h('select', { class: 'input input--sm', 'aria-label': tt('Session', 'সেশন') }, cats.years.map((y) => h('option', { value: y.id, selected: y.active }, y.label)));
        const classSel = h('select', { class: 'input input--sm', 'aria-label': tt('Class', 'শ্রেণি') }, cats.classes.filter((c) => c.active !== false).map((c) => h('option', { value: c.id }, L(c.name))));
        const examSel = h('select', { class: 'input input--sm', 'aria-label': tt('Examination', 'পরীক্ষা') }, cats.examDefs.filter((e) => e.active !== false).map((e) => h('option', { value: e.id }, L(e.name))));
        const colBox = h('div', { class: 'rt-columns' },
          st.columns.length ? h('ul', { class: 'chip-list' }, st.columns.map((c, i) => h('li', { class: 'chip rt-col-chip' },
            h('input', { class: 'input input--sm', value: c.label, 'aria-label': tt('Column heading', 'কলামের শিরোনাম'), oninput: (e) => { c.label = e.target.value; mark(); } }),
            h('span', { class: 'muted small' }, bundles.get(c.sessionId) ? tt('result sheet exists', 'ফলাফল শিট আছে') : tt('no result sheet yet', 'এখনো ফলাফল শিট নেই')),
            h('button', { class: 'chip__x', type: 'button', 'aria-label': tt('Remove', 'সরান'), onclick: () => { st.columns.splice(i, 1); mark(); paint(); } }, '×')))) : null,
          h('div', { class: 'row-actions' }, yearSel, classSel, examSel, button(tt('Add column', 'কলাম যোগ'), { size: 'sm', icon: 'plus', onClick: async () => {
            const sid = ids.session(yearSel.value, classSel.value, examSel.value);
            if (st.columns.some((c) => c.sessionId === sid)) { toast(tt('Already added.', 'আগেই যোগ করা আছে।'), 'info'); return; }
            await bundleOf(sid);
            const label = `${L(cats.classes.find((c) => c.id === classSel.value)?.name, 'bn')}র ${L(cats.examDefs.find((e) => e.id === examSel.value)?.name, 'bn')}`;
            st.columns.push({ sessionId: sid, yearId: yearSel.value, classId: classSel.value, examDefId: examSel.value, label });
            mark(); paint();
          } })),
          h('p', { class: 'muted small' }, tt('The routine can be made before the result sheet. When the result sheet is created later, its first and last exam day are taken from this routine.', 'ফলাফল শিটের আগেই সময়সূচি তৈরি করা যায়। পরে ফলাফল শিট তৈরি করলে তার প্রথম ও শেষ পরীক্ষার দিন এই সময়সূচি থেকে নেওয়া হবে।')));
        // Slots
        const slotBox = h('div', { class: 'row-actions' }, st.slots.map((sl, i) => h('span', { class: 'chip' },
          h('input', { class: 'input input--sm', value: sl.label, 'aria-label': tt('Time', 'সময়'), oninput: (e) => { sl.label = e.target.value; mark(); } }),
          st.slots.length > 1 ? h('button', { class: 'chip__x', type: 'button', 'aria-label': tt('Remove', 'সরান'), onclick: () => { st.slots.splice(i, 1); mark(); paint(); } }, '×') : null)),
          button(tt('Add time', 'সময় যোগ'), { size: 'sm', icon: 'plus', onClick: () => { st.slots.push({ id: `s${Date.now().toString(36)}`, label: 'সময়' }); mark(); paint(); } }));
        // Days grid
        const cell = (day, sl, col) => {
          const key = cellKey(sl.id, col.sessionId);
          const ids = day.cells[key] ?? [];
          const all = Object.keys(defsOf(col.sessionId));
          const add = h('select', { class: 'input input--sm', 'aria-label': tt('Add subject', 'বিষয় যোগ'), onchange: (e) => { if (!e.target.value) return; day.cells[key] = [...ids, e.target.value]; mark(); paint(); } },
            h('option', { value: '' }, tt('+ subject', '+ বিষয়')), all.filter((x) => !ids.includes(x)).map((x) => h('option', { value: x }, subjectLabel(col.sessionId, x))));
          return h('td', {}, h('div', { class: 'rt-cell' }, ids.map((x) => h('span', { class: 'chip' }, subjectLabel(col.sessionId, x),
            h('button', { class: 'chip__x', type: 'button', 'aria-label': tt('Remove', 'সরান'), onclick: () => { day.cells[key] = ids.filter((y) => y !== x); mark(); paint(); } }, '×'))), add));
        };
        const grid = st.columns.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'data-table rt-grid' },
          h('thead', {}, h('tr', {}, h('th', { rowspan: 2 }, tt('Date', 'তারিখ')), st.slots.map((sl) => h('th', { colspan: st.columns.length }, sl.label)), h('th', { rowspan: 2 }, '')),
            h('tr', {}, st.slots.map(() => st.columns.map((c) => h('th', {}, c.label))))),
          h('tbody', {}, st.days.map((d, i) => h('tr', {},
            h('td', {}, h('input', { class: 'input input--sm', type: 'date', value: d.date ?? '', 'aria-label': tt('Date', 'তারিখ'), onchange: (e) => { d.date = e.target.value; mark(); } })),
            st.slots.map((sl) => st.columns.map((c) => cell(d, sl, c))),
            h('td', {}, button(tt('Remove', 'সরান'), { size: 'sm', kind: 'danger-ghost', onClick: () => { st.days.splice(i, 1); mark(); paint(); } }))))))) : h('p', { class: 'notice' }, tt('Add at least one column (class and examination) above.', 'উপরে অন্তত একটি কলাম (শ্রেণি ও পরীক্ষা) যোগ করুন।'));
        // Check
        const checks = st.columns.map((c) => {
          const r = scheduleCheck(st, c.sessionId, Object.keys(defsOf(c.sessionId)));
          return h('li', {}, h('strong', {}, `${c.label}: `), r.missing.length ? h('span', { class: 'text-bad' }, `${tt('not in the routine', 'সূচিতে নেই')}: ${r.missing.map((x) => subjectLabel(c.sessionId, x)).join(', ')}`) : h('span', { class: 'text-good' }, tt('every subject is scheduled', 'সব বিষয় সূচিতে আছে')),
            r.repeated.length ? h('span', { class: 'muted' }, ` · ${tt('twice', 'দুবার')}: ${r.repeated.map((x) => subjectLabel(c.sessionId, x)).join(', ')}`) : null);
        });
        box.replaceChildren(
          h('div', { class: 'form-grid' }, titleF.el, noteF.el),
          h('h3', { class: 'form-section' }, tt('Classes and examinations (one column each)', 'শ্রেণি ও পরীক্ষা (প্রতিটি একটি কলাম)')), colBox,
          h('h3', { class: 'form-section' }, tt('Exam times', 'পরীক্ষার সময়')), slotBox,
          h('h3', { class: 'form-section' }, tt('Dates and subjects', 'তারিখ ও বিষয়')), grid,
          st.columns.length ? button(tt('Add date', 'তারিখ যোগ'), { icon: 'plus', onClick: () => {
            const last = sortedDays(st).at(-1)?.date; let next = '';
            if (last) { const d = new Date(`${last}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); next = d.toISOString().slice(0, 10); }
            st.days.push({ id: `d${Date.now().toString(36)}`, date: next, cells: {} }); mark(); paint();
          } }) : null,
          st.columns.length ? h('ul', { class: 'rt-checks' }, checks) : null,
          h('div', { class: 'save-bar' }, saveState, button(t('common.save'), { kind: 'primary', onClick: save })));
      };
      paint();
      return box;
    }

    async function printTab(panel) {
      panel.replaceChildren(loadingState());
      const ctx = await getPrintContextFromSettings();
      const { renderRoutine } = await import('../../print/routine.js');
      const { printContainer } = await import('../../print/print-runner.js');
      const { ensurePrintFonts } = await import('../../print/fonts.js');
      await ensurePrintFonts();
      const area = h('div', { class: 'print-area' }, renderRoutine({ ...st, days: st.days }, st.columns.map((c) => ({ ...c, defs: defsOf(c.sessionId) })), ctx));
      panel.replaceChildren(h('div', { class: 'print-controls no-print' }, button(tt('Print routine', 'সময়সূচি প্রিন্ট'), { kind: 'primary', icon: 'print', onClick: () => printContainer(area, { pageNumbers: false }) }),
        dirty ? h('p', { class: 'notice notice--locked' }, tt('Unsaved changes are shown; save them in the first tab.', 'অসংরক্ষিত পরিবর্তন দেখানো হচ্ছে; প্রথম ট্যাবে সংরক্ষণ করুন।')) : null), area);
    }

    /** Students of one column: from its result sheet if it exists, otherwise the class list. */
    async function studentsFor(col) {
      const bundle = await bundleOf(col.sessionId);
      const defs = defsOf(col.sessionId);
      const order = (g) => cats.groups.find((x) => x.id === g)?.order ?? 99;
      // Without a result sheet: the class's active students and the subjects saved on their records.
      let roster;
      if (bundle) roster = bundle.enrollments.filter((e) => e.status !== 'withdrawn').map((e) => ({ ...e, subjectIds: studentSubjectIds(bundle, e) }));
      else {
        const { listClassRoster } = await import('../../data/repositories/students-repository.js');
        const { yearId, classId } = parse(col.sessionId);
        roster = (await listClassRoster(yearId, classId)).map((x) => {
          const g = x.current.groupId;
          const compulsory = cats.subjects.filter((sub) => sub.active !== false && (!sub.classIds?.length || sub.classIds.includes(classId)) && (!sub.groupIds?.length || sub.groupIds.includes(g)) && (sub.groupRoles?.[g] ?? 'compulsory') === 'compulsory').map((sub) => sub.id);
          return { roll: x.current.roll, name: { en: x.nameEn, bn: x.nameBn }, groupId: g, optionalSubjectId: x.current.optionalSubjectId ?? null, subjectIds: [...new Set([...compulsory, ...(x.current.subjectIds ?? [])])] };
        });
      }
      return roster.sort((a, b) => order(a.groupId) - order(b.groupId) || Number(a.roll) - Number(b.roll))
        .map((e) => ({ name: e.name?.bn || e.name?.en || '', roll: e.roll, groupLabel: `${L(cats.groups.find((x) => x.id === e.groupId)?.name, 'bn')} বিভাগ`, groupId: e.groupId, groupName: L(cats.groups.find((x) => x.id === e.groupId)?.name, 'bn'),
          fourthName: e.optionalSubjectId ? L(defs[e.optionalSubjectId]?.name, 'bn') || '' : '', subjectIds: e.subjectIds }));
    }

    async function attendanceTab(panel) {
      if (!st.columns.length) { panel.replaceChildren(emptyState({ message: tt('Add a class and examination to the routine first.', 'আগে সময়সূচিতে একটি শ্রেণি ও পরীক্ষা যোগ করুন।') })); return; }
      const ctx = await getPrintContextFromSettings();
      const [{ renderAttendance }, { printContainer }, { ensurePrintFonts }] = await Promise.all([import('../../print/routine.js'), import('../../print/print-runner.js'), import('../../print/fonts.js')]);
      await ensurePrintFonts();
      let colIdx = 0;
      const area = h('div', { class: 'print-area' });
      const pick = h('select', { class: 'input input--compact', 'aria-label': tt('Result sheet', 'ফলাফল শিট'), onchange: (e) => { colIdx = Number(e.target.value); paint(); } },
        st.columns.map((c, i) => h('option', { value: i }, c.label)));
      const paint = async () => {
        const col = st.columns[colIdx];
        const defs = defsOf(col.sessionId);
        const students = await studentsFor(col);
        // Each group starts on its own page.
        const pages = [];
        for (const g of [...new Set(students.map((x) => x.groupId))]) pages.push(...renderAttendance(st, { ...col, defs }, students.filter((x) => x.groupId === g), ctx, { examTitle: col.label }));
        area.replaceChildren(...(pages.length ? pages : [emptyState({ message: tt('No students found for this class and session.', 'এই শ্রেণি ও সেশনে কোনো শিক্ষার্থী পাওয়া যায়নি।') })]));
      };
      panel.replaceChildren(h('div', { class: 'print-controls no-print' }, pick,
        button(tt('Print attendance sheets', 'হাজিরা শীট প্রিন্ট'), { kind: 'primary', icon: 'print', onClick: () => printContainer(area, { pageNumbers: false }) }),
        h('p', { class: 'muted small' }, tt('Two students per page, group by group. Dates and subjects come from the routine and each student\'s own subjects (including the 4th subject).', 'প্রতি পৃষ্ঠায় দুজন, বিভাগ অনুযায়ী। তারিখ ও বিষয় সময়সূচি ও প্রত্যেক শিক্ষার্থীর নিজের বিষয় (৪র্থ বিষয়সহ) থেকে আসে।'))), area);
      paint();
    }

    async function printing() {
      const [ctx, r, { printContainer }, { ensurePrintFonts }] = await Promise.all([getPrintContextFromSettings(), import('../../print/routine.js'), import('../../print/print-runner.js'), import('../../print/fonts.js')]);
      await ensurePrintFonts();
      return { ctx, r, printContainer };
    }
    const colMeta = (col) => {
      const { yearId, classId } = parse(col.sessionId);
      return { examTitle: col.label, classLabel: L(cats.classes.find((c) => c.id === classId)?.name, 'bn'), sessionLabel: cats.years.find((y) => y.id === yearId)?.label ?? yearId };
    };
    const saveRow = () => h('div', { class: 'save-bar no-print' }, saveState, button(t('common.save'), { kind: 'primary', onClick: save }));

    async function dutiesTab(panel) {
      panel.replaceChildren(loadingState());
      const [{ listActiveTeachers }, { listStaff }, { ctx, r, printContainer }] = await Promise.all([import('../../data/repositories/users-repository.js'), import('../../data/repositories/staff-repository.js'), printing()]);
      const teachers = await listActiveTeachers();
      const staff = (await listStaff()).filter((x) => x.status !== 'inactive');
      const people = { teachers: Object.fromEntries(teachers.map((x) => [x.id, x.customFields?.nameBn || x.displayName])), staff: Object.fromEntries(staff.map((x) => [x.id, L(x.name, 'bn') || L(x.name, 'en')])) };
      const area = h('div', { class: 'print-area' });
      const repaint = () => area.replaceChildren(r.renderDuties(st, st.columns.map((c) => ({ ...c, defs: defsOf(c.sessionId) })), people, ctx));
      const picker = (day, kind, list) => {
        const duty = (st.duties[day.id] ??= { teacherIds: [], staffIds: [] });
        const key = kind === 'teacher' ? 'teacherIds' : 'staffIds';
        const box = h('div', { class: 'rt-cell' });
        const paintBox = () => box.replaceChildren(...duty[key].map((pid, i) => h('span', { class: 'chip' }, `${kind === 'teacher' ? `${bnDigits(i + 1)}) ` : '❖ '}${(kind === 'teacher' ? people.teachers : people.staff)[pid] ?? pid}`,
          h('button', { class: 'chip__x', type: 'button', 'aria-label': tt('Remove', 'সরান'), onclick: () => { duty[key].splice(i, 1); mark(); paintBox(); repaint(); } }, '×'))),
          h('select', { class: 'input input--sm', 'aria-label': kind === 'teacher' ? tt('Add teacher', 'শিক্ষক যোগ') : tt('Add staff', 'কর্মচারী যোগ'), onchange: (e) => { if (e.target.value) { duty[key].push(e.target.value); mark(); paintBox(); repaint(); } } },
            h('option', { value: '' }, kind === 'teacher' ? tt('+ teacher', '+ শিক্ষক') : tt('+ staff', '+ কর্মচারী')), list.filter((x) => !duty[key].includes(x.id)).map((x) => h('option', { value: x.id }, (kind === 'teacher' ? people.teachers : people.staff)[x.id]))));
        paintBox();
        return box;
      };
      const days = sortedDays(st);
      const prefix = h('input', { class: 'input input--sm', value: st.dutyPrefix, 'aria-label': tt('Title before names', 'নামের আগে'), oninput: (e) => { st.dutyPrefix = e.target.value; mark(); repaint(); } });
      const committeeBox = h('div');
      const paintCommittee = () => committeeBox.replaceChildren(...st.committee.map((m, i) => h('div', { class: 'row-actions' },
        h('input', { class: 'input input--sm', value: m.name, placeholder: tt('Name', 'নাম'), oninput: (e) => { m.name = e.target.value; mark(); repaint(); } }),
        h('input', { class: 'input input--sm', value: m.designation ?? '', placeholder: tt('Designation', 'পদবি'), oninput: (e) => { m.designation = e.target.value; mark(); repaint(); } }),
        button(tt('Remove', 'সরান'), { size: 'sm', kind: 'danger-ghost', onClick: () => { st.committee.splice(i, 1); mark(); paintCommittee(); repaint(); } }))),
        button(tt('Add committee member', 'কমিটির সদস্য যোগ'), { size: 'sm', icon: 'plus', onClick: () => { st.committee.push({ name: '', designation: '' }); paintCommittee(); } }));
      paintCommittee();
      panel.replaceChildren(
        h('div', { class: 'no-print' },
          h('p', { class: 'muted' }, tt('Dates and subjects come from the routine. Choose the teachers (numbered) and one or two staff members for each day.', 'তারিখ ও বিষয় সময়সূচি থেকে আসে। প্রতিদিনের জন্য শিক্ষক (ক্রমিকসহ) ও এক-দুজন কর্মচারী বাছুন।')),
          days.length ? h('div', { class: 'table-scroll' }, h('table', { class: 'data-table rt-grid' }, h('thead', {}, h('tr', {}, h('th', {}, tt('Date', 'তারিখ')), h('th', {}, tt('Invigilators (teachers)', 'কক্ষ প্রত্যবেক্ষক (শিক্ষক)')), h('th', {}, tt('Staff', 'কর্মচারী')))),
            h('tbody', {}, days.map((d) => h('tr', {}, h('td', {}, bnDate(d.date).date, h('div', { class: 'muted small' }, bnDate(d.date).day)), h('td', {}, picker(d, 'teacher', teachers)), h('td', {}, picker(d, 'staff', staff))))))) : h('p', { class: 'notice' }, tt('Add dates in the routine first.', 'আগে সময়সূচিতে তারিখ যোগ করুন।')),
          h('div', { class: 'row-actions' }, h('label', { class: 'field field--inline' }, h('span', { class: 'field__label' }, tt('Title before names', 'নামের আগে')), prefix)),
          h('h3', { class: 'form-section' }, tt('Examination committee (printed at the end)', 'পরীক্ষা কমিটি (শেষে ছাপা হবে)')), committeeBox,
          saveRow(),
          h('div', { class: 'print-controls' }, button(tt('Print duty sheet', 'দায়িত্ব তালিকা প্রিন্ট'), { kind: 'primary', icon: 'print', onClick: () => printContainer(area, { pageNumbers: false }) }))),
        area);
      repaint();
    }

    function columnPicker(onChange) {
      return h('select', { class: 'input input--compact', 'aria-label': tt('Class and examination', 'শ্রেণি ও পরীক্ষা'), onchange: (e) => onChange(Number(e.target.value)) }, st.columns.map((c, i) => h('option', { value: i }, c.label)));
    }

    async function admitTab(panel) {
      if (!st.columns.length) { panel.replaceChildren(emptyState({ message: tt('Add a class and examination to the routine first.', 'আগে সময়সূচিতে একটি শ্রেণি ও পরীক্ষা যোগ করুন।') })); return; }
      const { ctx, r, printContainer } = await printing();
      const { examDateRange } = await import('../../domain/routine.js');
      let colIdx = 0;
      let all = [];
      let mode = 'all';               // 'all' | 'selected'
      const chosen = new Set();       // rolls+group keys of selected students
      const keyOf = (x) => `${x.groupId}|${x.roll}`;
      const area = h('div', { class: 'print-area' });
      const until = h('input', { class: 'input input--compact', type: 'date', 'aria-label': tt('Valid until', 'যে তারিখ পর্যন্ত') });
      const sentence = h('input', { class: 'input', value: st.admit.sentence, 'aria-label': tt('Sentence', 'বাক্য'), oninput: (e) => { st.admit.sentence = e.target.value; mark(); paintCards(); } });
      const pickBox = h('div', { class: 'ac-pick', hidden: true });
      const countNote = h('span', { class: 'muted small' });
      const paintCards = () => {
        const list = mode === 'all' ? all : all.filter((x) => chosen.has(keyOf(x)));
        countNote.textContent = tt('{n} card(s) · {p} page(s)', '{n}টি কার্ড · {p} পৃষ্ঠা', { n: bnDigits(list.length), p: bnDigits(Math.ceil(list.length / 4)) });
        area.replaceChildren(...(list.length ? r.renderAdmitCards(list, { ...colMeta(st.columns[colIdx]), validUntil: until.value, sentence: st.admit.sentence }, ctx)
          : [emptyState({ message: mode === 'all' ? tt('No students found for this class and session.', 'এই শ্রেণি ও সেশনে কোনো শিক্ষার্থী পাওয়া যায়নি।') : tt('Tick the students to print (4 per page).', 'যাদের কার্ড ছাপাবেন তাদের টিক দিন (প্রতি পৃষ্ঠায় ৪টি)।') })]));
      };
      const rollInput = h('input', { class: 'input input--compact', inputmode: 'numeric', placeholder: tt('Roll, e.g. 101 or 101, 105, 210', 'রোল, যেমন ১০১ বা ১০১, ১০৫, ২১০'), 'aria-label': tt('Add by roll', 'রোল দিয়ে যোগ') });
      const paintPick = () => {
        const toEn = (v) => String(v).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
        pickBox.replaceChildren(
          h('div', { class: 'row-actions' }, rollInput,
            button(tt('Add', 'যোগ'), { size: 'sm', icon: 'plus', onClick: () => {
              const rolls = toEn(rollInput.value).split(/[\s,]+/).filter(Boolean);
              let n = 0; for (const x of all) if (rolls.includes(String(x.roll))) { chosen.add(keyOf(x)); n++; }
              if (!n) toast(tt('No student with that roll.', 'এই রোলের কোনো শিক্ষার্থী নেই।'), 'error');
              rollInput.value = ''; paintPick(); paintCards();
            } }),
            button(tt('Clear', 'সব সরান'), { size: 'sm', onClick: () => { chosen.clear(); paintPick(); paintCards(); } })),
          h('ul', { class: 'ac-pick__list' }, all.map((x) => h('li', {}, h('label', { class: 'check-chip' },
            h('input', { type: 'checkbox', class: 'checkbox', checked: chosen.has(keyOf(x)), onchange: (e) => { if (e.target.checked) chosen.add(keyOf(x)); else chosen.delete(keyOf(x)); paintCards(); } }),
            h('span', {}, `${bnDigits(x.roll)} — ${x.name}${x.groupName ? ` (${x.groupName})` : ''}`))))));
      };
      const load = async () => {
        const col = st.columns[colIdx];
        if (!until.value) until.value = st.admit.validUntil || examDateRange([st], col.sessionId)?.last || '';
        all = await studentsFor(col);
        chosen.clear(); paintPick(); paintCards();
      };
      until.addEventListener('change', () => { st.admit.validUntil = until.value; mark(); paintCards(); });
      const modeSel = h('select', { class: 'input input--compact', 'aria-label': tt('Which students', 'কোন শিক্ষার্থী'), onchange: (e) => { mode = e.target.value; pickBox.hidden = mode === 'all'; paintCards(); } },
        h('option', { value: 'all' }, tt('All students', 'সব শিক্ষার্থী')), h('option', { value: 'selected' }, tt('Selected students only', 'শুধু বাছাই করা শিক্ষার্থী')));
      panel.replaceChildren(h('div', { class: 'print-controls no-print' }, columnPicker((i) => { colIdx = i; until.value = ''; load(); }), modeSel,
        h('label', { class: 'field field--inline' }, h('span', { class: 'field__label' }, tt('Valid until', 'যে তারিখ পর্যন্ত')), until), countNote,
        button(tt('Print admit cards', 'প্রবেশ পত্র প্রিন্ট'), { kind: 'primary', icon: 'print', onClick: () => printContainer(area, { pageNumbers: false }) })),
        h('div', { class: 'no-print' }, pickBox),
        h('div', { class: 'no-print rt-sentence' }, h('label', { class: 'field' }, h('span', { class: 'field__label' }, tt('Permission sentence ({date} is replaced by the date)', 'অনুমতির বাক্য ({date}-এর জায়গায় তারিখ বসবে)')), sentence),
          h('p', { class: 'muted small' }, tt("Four cards per A4 page. To give some students a different date, choose \"Selected students only\", tick them, set their date and print; then do the same for the others. The principal's signature comes from Settings → Institution.",
            'প্রতি A4 পৃষ্ঠায় চারটি কার্ড। কয়েকজনকে আলাদা তারিখ দিতে "শুধু বাছাই করা শিক্ষার্থী" বেছে তাদের টিক দিন, তারিখ বসিয়ে প্রিন্ট করুন; তারপর বাকিদের জন্য একইভাবে। অধ্যক্ষের স্বাক্ষর আসে সেটিংস → প্রতিষ্ঠান থেকে।')), saveRow()),
        area);
      load();
    }

    async function seatTab(panel) {
      if (!st.columns.length) { panel.replaceChildren(emptyState({ message: tt('Add a class and examination to the routine first.', 'আগে সময়সূচিতে একটি শ্রেণি ও পরীক্ষা যোগ করুন।') })); return; }
      const { ctx, r, printContainer } = await printing();
      let colIdx = 0;
      const area = h('div', { class: 'print-area' });
      const FIELDS = [['institution', tt('College name', 'কলেজের নাম')], ['exam', tt('Examination', 'পরীক্ষা')], ['title', tt('"Examinee\'s seat" heading', '"পরীক্ষার্থীর আসন" শিরোনাম')], ['class', tt('Class', 'শ্রেণি')], ['group', tt('Group', 'বিভাগ')], ['session', tt('Session', 'শিক্ষাবর্ষ')], ['roll', tt('Class roll', 'শ্রেণি রোল')], ['name', tt('Student name', 'শিক্ষার্থীর নাম')], ['fourth', tt('4th subject', '৪র্থ বিষয়')]];
      const paint = async () => {
        const col = st.columns[colIdx];
        const students = await studentsFor(col);
        area.replaceChildren(...(students.length ? r.renderSeatCards(students, { ...colMeta(col), perPage: Number(st.seat.perPage), fields: FIELDS.map(([k]) => k).filter((k) => st.seat.fields.includes(k)) }, ctx) : [emptyState({ message: tt('No students found for this class and session.', 'এই শ্রেণি ও সেশনে কোনো শিক্ষার্থী পাওয়া যায়নি।') })]));
      };
      const per = h('select', { class: 'input input--compact', 'aria-label': tt('Cards per page', 'প্রতি পৃষ্ঠায় কার্ড'), onchange: (e) => { st.seat.perPage = Number(e.target.value); mark(); paint(); } },
        [4, 6, 8, 9, 12, 15].map((n) => h('option', { value: n, selected: Number(st.seat.perPage) === n }, tt('{n} per page', 'প্রতি পৃষ্ঠায় {n}টি', { n }))));
      const checks = h('div', { class: 'check-row' }, FIELDS.map(([k, label]) => h('label', { class: 'check-chip' }, h('input', { type: 'checkbox', class: 'checkbox', checked: st.seat.fields.includes(k), onchange: (e) => {
        st.seat.fields = e.target.checked ? [...st.seat.fields, k] : st.seat.fields.filter((x) => x !== k); mark(); paint(); } }), h('span', {}, label))));
      panel.replaceChildren(h('div', { class: 'print-controls no-print' }, columnPicker((i) => { colIdx = i; paint(); }), per,
        button(tt('Print seat cards', 'আসন কার্ড প্রিন্ট'), { kind: 'primary', icon: 'print', onClick: () => printContainer(area, { pageNumbers: false }) })),
        h('div', { class: 'no-print' }, h('p', { class: 'field__label' }, tt('Show on each card', 'প্রতিটি কার্ডে দেখান')), checks, saveRow()), area);
      paint();
    }

    const tabCtl = tabs([
      { id: 'edit', label: tt('Edit routine', 'সময়সূচি সম্পাদনা'), render: () => editTab() },
      { id: 'print', label: tt('Printed routine', 'ছাপানো সময়সূচি'), render: (p) => printTab(p) },
      { id: 'attendance', label: tt('Attendance sheets', 'হাজিরা শীট'), render: (p) => attendanceTab(p) },
      { id: 'duties', label: tt('Invigilators', 'কক্ষ প্রত্যবেক্ষক'), render: (p) => dutiesTab(p) },
      { id: 'admit', label: tt('Admit cards', 'প্রবেশ পত্র'), render: (p) => admitTab(p) },
      { id: 'seat', label: tt('Seat cards', 'আসন কার্ড'), render: (p) => seatTab(p) },
    ]);
    root.replaceChildren(pageHeader({ title: st.title || tt('Examination routine', 'পরীক্ষার সময়সূচি'), back: { href: '#/admin/routines', label: t('nav.routines') },
      actions: [button(tt('Delete', 'মুছুন'), { kind: 'danger-ghost', onClick: async () => {
        if (!(await confirmDialog({ title: tt('Delete this routine?', 'এই সময়সূচি মুছবেন?'), body: tt('Result sheets and marks are not affected.', 'ফলাফল শিট ও নম্বর প্রভাবিত হবে না।'), danger: true, confirmText: tt('Delete', 'মুছুন') }))) return;
        if (await run(() => repo.deleteRoutine(actor(), id)) !== undefined) navigate('/admin/routines');
      } })] }), tabCtl.el);
  })().catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}
