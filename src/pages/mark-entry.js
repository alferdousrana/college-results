/**
 * Subject-wise mark entry (teachers for their assigned subjects; the administrator for any subject
 * until publication). Every edit is stored in the device outbox first, then sent in a transaction
 * that refuses to overwrite a newer server value (see offline/offline-queue.js).
 */
import { h } from '../core/dom.js';
import { t, tt, L, formatNumber } from '../i18n/index.js';
import { getState } from '../core/store.js';
import { on } from '../core/events.js';
import { pageHeader, button } from '../ui/components/page.js';
import { loadingState, errorState } from '../ui/components/states.js';
import { confirmDialog } from '../ui/components/dialog.js';
import { toast } from '../ui/components/toast.js';
import { actor, friendlyError } from './_shared.js';
import { parseMarkInput } from '../domain/validation/mark-input.js';
import { validateMarkValue, computeSubjectResult, ABSENT } from '../domain/calculation/index.js';
import { subjectDefinition, studentsForSubject, findMissingMarks } from '../domain/session-calc.js';
import { ExamState } from '../domain/exam-lifecycle.js';
import { enqueueMark, listQueue, resolveConflict, markKey, QueueStatus } from '../offline/offline-queue.js';
import { syncNow } from '../offline/sync-manager.js';
import { debounce, fmtNum } from '../ui/format.js';
import { isEnabled } from '../features/flags.js';

export const title = 'nav.markEntry';
let cleanup = [];
export function dispose() { cleanup.forEach((f) => f()); cleanup = []; }

const STATUS = () => ({
  empty: [tt('Not entered', 'দেওয়া হয়নি'), 'neutral'], dirty: [tt('Editing…', 'সম্পাদনা চলছে…'), 'info'], saving: [tt('Saving…', 'সংরক্ষণ হচ্ছে…'), 'info'],
  saved: [tt('Saved', 'সংরক্ষিত'), 'good'], pending: [tt('Waiting to send', 'পাঠানোর অপেক্ষায়'), 'warn'], error: [tt('Not saved', 'সংরক্ষিত হয়নি'), 'bad'],
  invalid: [tt('Fix the value', 'মান ঠিক করুন'), 'bad'], conflict: [tt('Changed elsewhere', 'অন্য কোথাও বদলেছে'), 'bad'],
});

export function render({ query }) {
  const root = h('section', { class: 'page page--wide' }, loadingState());
  init(query.get('sid'), query.get('subject'), root).catch((e) => root.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}

async function init(sid, subjectId, root) {
  const me = actor();
  const [{ loadSessionBundle }, { listMarks, submitSubject }, { getSetting }] = await Promise.all([
    import('../data/repositories/sessions-repository.js'), import('../data/repositories/marks-repository.js'), import('../data/repositories/settings-repository.js')]);
  const bundle = await loadSessionBundle(sid);
  const subject = bundle.subjects.find((s) => s.id === subjectId);
  const isAdminUser = me.role === 'super_admin';
  if (!subject || (!isAdminUser && !(subject.teacherIds ?? []).includes(me.id))) {
    root.replaceChildren(errorState({ message: tt('This subject is not assigned to you.', 'এই বিষয়টি আপনাকে দেওয়া হয়নি।') }));
    return;
  }
  const def = subjectDefinition(subject);
  const grading = await getSetting('grading');
  const state = bundle.session.state;
  const submitted = subject.submission?.state === 'submitted';
  const editable = isAdminUser ? [ExamState.READY, ExamState.IN_PROGRESS, ExamState.SUBMITTED, ExamState.UNDER_REVIEW].includes(state)
    : [ExamState.READY, ExamState.IN_PROGRESS].includes(state) && !submitted;
  const students = studentsForSubject(bundle, subjectId);
  const server = await listMarks(sid, subjectId);
  const queued = (await listQueue(me.id)).filter((e) => e.path.sessionId === sid && e.path.subjectId === subjectId);

  /** row = { e (enrollment), base: { version, components, absent }, local: {components, absent}, cellErr: {}, status } */
  const rows = students.map((e) => {
    const m = server[e.id];
    const base = { version: m?.version ?? 0, components: { ...(m?.components ?? {}) }, absent: Boolean(m?.absent), updatedBy: m?.updatedBy ?? null };
    const q = queued.find((x) => x.path.studentId === e.id);
    const local = q ? { components: { ...q.payload.components }, absent: Boolean(q.payload.absent) } : { components: { ...base.components }, absent: base.absent };
    return { e, base, local, cellErr: {}, status: q ? (q.status === QueueStatus.CONFLICT ? 'conflict' : 'pending') : hasAny(base) ? 'saved' : 'empty', server: q?.server ?? null };
  });
  const restored = queued.length;

  const saveStatus = h('div', { class: 'save-status', role: 'status', 'aria-live': 'polite' });
  const table = h('table', { class: 'marks-grid' });
  const missingBox = h('div', { class: 'missing-box' });
  const rowEls = new Map();

  function hasAny(x) { return x.absent || Object.values(x.components ?? {}).some((v) => v !== null && v !== undefined && v !== ''); }
  const entryOf = (r) => ({ absent: r.local.absent, components: r.local.components });

  function paintSaveStatus() {
    const c = { pending: 0, error: 0, conflict: 0, saving: 0, dirty: 0, invalid: 0 };
    rows.forEach((r) => { if (c[r.status] != null) c[r.status]++; });
    let text = tt('All changes saved', 'সব পরিবর্তন সংরক্ষিত'), tone = 'good';
    if (c.conflict) { text = tt('{n} mark(s) were changed by someone else — choose which value to keep', '{n}টি নম্বর অন্য কেউ বদলেছেন — কোনটি রাখবেন বাছুন', { n: c.conflict }); tone = 'bad'; }
    else if (c.error || c.invalid) { text = tt('{n} row(s) not saved', '{n}টি সারি সংরক্ষিত হয়নি', { n: c.error + c.invalid }); tone = 'bad'; }
    else if (c.saving || c.dirty) { text = tt('Saving…', 'সংরক্ষণ হচ্ছে…'); tone = 'info'; }
    else if (c.pending) { text = navigator.onLine ? tt('{n} change(s) waiting to be sent', '{n}টি পরিবর্তন পাঠানোর অপেক্ষায়', { n: c.pending }) : tt('Offline — {n} change(s) kept on this device', 'অফলাইন — {n}টি পরিবর্তন এই ডিভাইসে রাখা', { n: c.pending }); tone = 'warn'; }
    saveStatus.className = `save-status save-status--${tone}`;
    saveStatus.textContent = text;
  }

  function paintRow(r) {
    const tr = rowEls.get(r.e.id);
    if (!tr) return;
    const res = computeSubjectResult(def, entryOf(r), grading.policy, grading.scale);
    tr.querySelector('.mg-total').textContent = res.state === 'ABSENT' ? tt('Absent', 'অনুপস্থিত') : res.obtained == null ? '' : fmtNum(res.obtained, 2);
    tr.querySelector('.mg-grade').textContent = res.grade ?? '';
    const [label, tone] = STATUS()[r.status];
    const st = tr.querySelector('.mg-status');
    st.replaceChildren(h('span', { class: `badge badge--${tone}` }, label));
    if (r.status === 'conflict') {
      const theirs = r.server ? (r.server.absent ? tt('Absent', 'অনুপস্থিত') : def.components.map((c) => `${c.label}: ${r.server.components?.[c.id] ?? '—'}`).join(', ')) : '';
      st.append(h('div', { class: 'conflict' }, h('small', {}, tt('Saved value: {v}', 'সংরক্ষিত মান: {v}', { v: theirs })),
        button(tt('Keep mine', 'আমারটা রাখুন'), { size: 'sm', onClick: () => resolve(r, 'mine') }), button(tt('Use saved', 'সংরক্ষিতটা নিন'), { size: 'sm', onClick: () => resolve(r, 'server') })));
    }
    tr.classList.toggle('is-fail', res.passed === false && res.state === 'COMPLETE');
    tr.querySelectorAll('input[data-comp]').forEach((inp) => {
      const err = r.cellErr[inp.dataset.comp];
      inp.setAttribute('aria-invalid', err ? 'true' : 'false');
      inp.title = err ?? '';
      inp.disabled = !editable || r.local.absent;
      const missing = !r.local.absent && (r.local.components[inp.dataset.comp] == null || r.local.components[inp.dataset.comp] === '');
      inp.classList.toggle('is-missing', missing && !err);
    });
  }

  async function resolve(r, choice) {
    const key = markKey({ sessionId: sid, subjectId, studentId: r.e.id });
    const res = await resolveConflict(key, choice);
    if (choice === 'server') {
      r.base = { version: r.server?.version ?? r.base.version, components: { ...(r.server?.components ?? {}) }, absent: Boolean(r.server?.absent) };
      r.local = { components: { ...r.base.components }, absent: r.base.absent };
      r.status = hasAny(r.base) ? 'saved' : 'empty'; r.server = null;
      rebuildInputs(r);
    } else if (res) { r.base.version = res.baseVersion; r.status = 'pending'; r.server = null; flushSoon(); }
    paintRow(r); paintSaveStatus(); paintMissing();
  }

  const timers = new Map();
  function scheduleSave(r) {
    r.status = 'dirty'; paintRow(r); paintSaveStatus();
    clearTimeout(timers.get(r.e.id));
    timers.set(r.e.id, setTimeout(() => commit(r), 1200));
  }
  async function commit(r) {
    timers.delete(r.e.id);
    if (!navigator.onLine && !isEnabled('offline_mark_entry')) { r.status = 'error'; paintRow(r); paintSaveStatus(); toast(tt('Offline mark entry is not available for your college. Reconnect to save.', 'আপনার কলেজের জন্য অফলাইনে নম্বর দেওয়ার সুবিধা নেই। সংরক্ষণ করতে আবার সংযুক্ত হোন।'), 'error'); return; }
    if (Object.keys(r.cellErr).length) { r.status = 'invalid'; paintRow(r); paintSaveStatus(); return; }
    await enqueueMark({ ownerUid: me.id, path: { sessionId: sid, subjectId, studentId: r.e.id }, payload: { components: { ...r.local.components }, absent: r.local.absent }, baseVersion: r.base.version });
    r.status = 'pending'; paintRow(r); paintSaveStatus();
    flushSoon();
  }
  const flushSoon = debounce(() => flush(), 300);
  async function flush() {
    if (!navigator.onLine) { paintSaveStatus(); return; }
    rows.filter((r) => r.status === 'pending').forEach((r) => { r.status = 'saving'; paintRow(r); });
    paintSaveStatus();
    await syncNow({
      filter: (e) => e.path.sessionId === sid && e.path.subjectId === subjectId,
      onEntry: (entry, res) => {
        const r = rows.find((x) => x.e.id === entry.path.studentId); if (!r) return;
        if (res.status === 'ok') { r.base = { version: res.version, components: { ...entry.payload.components }, absent: entry.payload.absent }; r.status = sameAsBase(r) ? 'saved' : 'dirty'; }
        else if (res.status === 'conflict') { r.status = 'conflict'; r.server = res.server; }
        else if (res.status === 'rejected') { r.status = 'error'; toast(res.reason === 'permission-denied' ? tt('The server refused the change. Mark entry may be closed or the subject reassigned.', 'সার্ভার পরিবর্তনটি গ্রহণ করেনি। নম্বর প্রদান বন্ধ বা বিষয় পুনর্বণ্টন হতে পারে।') : tt('The daily database quota is used up. Your marks are kept on this device.', 'আজকের ডেটাবেস কোটা শেষ। নম্বর এই ডিভাইসে রাখা আছে।'), 'error'); }
        else r.status = 'pending';
        paintRow(r);
      },
    }).catch(() => {});
    rows.filter((r) => r.status === 'saving').forEach((r) => { r.status = 'pending'; paintRow(r); });
    await reconcile();
    paintSaveStatus(); paintMissing();
  }
  /** Rows still "pending" whose outbox entry is gone were sent by the background sync: refresh them. */
  async function reconcile() {
    const left = new Set((await listQueue(me.id)).filter((e) => e.path.sessionId === sid && e.path.subjectId === subjectId).map((e) => e.path.studentId));
    const stale = rows.filter((r) => r.status === 'pending' && !left.has(r.e.id));
    if (!stale.length) return;
    const fresh = await listMarks(sid, subjectId).catch(() => null);
    if (!fresh) return;
    for (const r of stale) {
      const m = fresh[r.e.id];
      r.base = { version: m?.version ?? 0, components: { ...(m?.components ?? {}) }, absent: Boolean(m?.absent) };
      r.status = sameAsBase(r) ? (hasAny(r.base) ? 'saved' : 'empty') : 'dirty';
      if (r.status === 'dirty') scheduleSave(r); else paintRow(r);
    }
  }
  const sameAsBase = (r) => r.local.absent === r.base.absent && def.components.every((c) => (r.local.components[c.id] ?? null) === (r.base.components[c.id] ?? null));

  function onCellInput(r, comp, inp) {
    const p = parseMarkInput(inp.value);
    delete r.cellErr[comp.id];
    if (p.kind === 'invalid') r.cellErr[comp.id] = p.error;
    else if (p.kind === 'number') { const err = validateMarkValue(p.value, comp, grading.policy); if (err) r.cellErr[comp.id] = err; }
    r.local.components[comp.id] = p.kind === 'invalid' ? r.local.components[comp.id] : p.value;
    if (p.kind === 'number' && r.cellErr[comp.id]) r.local.components[comp.id] = r.base.components[comp.id] ?? null;
    scheduleSave(r);
  }

  async function onAbsent(r, cb) {
    if (cb.checked && def.components.some((c) => r.local.components[c.id] != null && r.local.components[c.id] !== '')) {
      const ok = await confirmDialog({ title: tt('Mark roll {r} absent?', 'রোল {r} অনুপস্থিত করবেন?', { r: r.e.roll }), body: tt('The marks already entered for this subject will be cleared. Absent is recorded separately from zero.', 'এই বিষয়ের দেওয়া নম্বর মুছে যাবে। অনুপস্থিতি শূন্য থেকে আলাদাভাবে রাখা হয়।'), confirmText: tt('Mark absent', 'অনুপস্থিত করুন'), danger: true });
      if (!ok) { cb.checked = false; return; }
      r.local.components = {};
    }
    r.local.absent = cb.checked;
    r.cellErr = {};
    rebuildInputs(r);
    scheduleSave(r);
  }

  function rebuildInputs(r) {
    rowEls.get(r.e.id)?.querySelectorAll('input[data-comp]').forEach((inp) => { const v = r.local.components[inp.dataset.comp]; inp.value = v == null ? '' : v === ABSENT ? 'AB' : String(v); });
    const cb = rowEls.get(r.e.id)?.querySelector('input.mg-absent'); if (cb) cb.checked = r.local.absent;
  }

  function onKey(e) {
    const inp = e.target;
    if (!inp.matches('input[data-row]')) return;
    const row = Number(inp.dataset.row), col = Number(inp.dataset.col);
    let target = null;
    if (e.key === 'Enter' || e.key === 'ArrowDown') target = table.querySelector(`input[data-row="${row + 1}"][data-col="${col}"]`);
    if (e.key === 'ArrowUp') target = table.querySelector(`input[data-row="${row - 1}"][data-col="${col}"]`);
    if (target) { e.preventDefault(); target.focus(); target.select?.(); }
  }

  table.append(
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, tt('Roll', 'রোল')), h('th', { scope: 'col', class: 'mg-name' }, tt('Name', 'নাম')),
      def.components.map((c) => h('th', { scope: 'col' }, c.label, h('small', { class: 'muted' }, ` /${c.maxMarks}`), c.passMarks != null ? h('div', { class: 'small muted' }, tt('pass {p}', 'পাস {p}', { p: c.passMarks })) : null)),
      h('th', { scope: 'col' }, tt('Absent', 'অনুপস্থিত')), h('th', { scope: 'col' }, tt('Total', 'মোট')), h('th', { scope: 'col' }, tt('Grade', 'গ্রেড')), h('th', { scope: 'col' }, tt('Status', 'অবস্থা')))),
    h('tbody', { onkeydown: onKey }, rows.map((r, ri) => {
      const tr = h('tr', {},
        h('td', { class: 'mg-roll' }, formatNumber(r.e.roll)), h('td', { class: 'mg-name' }, L(r.e.name)),
        def.components.map((c, ci) => {
          const v = r.local.components[c.id];
          const inp = h('input', { class: 'mg-input', inputmode: 'decimal', autocomplete: 'off', value: v == null ? '' : v === ABSENT ? 'AB' : String(v), dataset: { row: ri, col: ci, comp: c.id },
            'aria-label': tt('{c} for roll {r}', 'রোল {r}-এর {c}', { c: c.label, r: r.e.roll }) });
          inp.addEventListener('input', () => onCellInput(r, c, inp));
          inp.addEventListener('focus', () => inp.select());
          return h('td', {}, inp);
        }),
        h('td', {}, h('input', { type: 'checkbox', class: 'checkbox mg-absent', checked: r.local.absent, disabled: !editable, 'aria-label': tt('Absent, roll {r}', 'অনুপস্থিত, রোল {r}', { r: r.e.roll }), onchange: (ev) => onAbsent(r, ev.target) })),
        h('td', { class: 'mg-total' }), h('td', { class: 'mg-grade' }), h('td', { class: 'mg-status' }));
      rowEls.set(r.e.id, tr);
      return tr;
    })));

  function paintMissing() {
    const localMarks = { [subjectId]: Object.fromEntries(rows.map((r) => [r.e.id, { absent: r.local.absent, components: r.local.components }])) };
    const missing = findMissingMarks(bundle, localMarks, { subjectId });
    missingBox.replaceChildren(missing.length
      ? h('details', { class: 'notice notice--locked' }, h('summary', {}, tt('{n} required mark(s) missing', '{n}টি আবশ্যক নম্বর বাকি', { n: missing.length })),
          h('ul', { class: 'missing-list' }, missing.slice(0, 200).map((m) => h('li', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); rowEls.get(m.studentId)?.querySelector(`input[data-comp="${m.componentId}"]`)?.focus(); } },
            tt('Roll {r} — {n}: {c}', 'রোল {r} — {n}: {c}', { r: m.roll, n: L(m.name), c: m.componentLabel }))))))
      : h('p', { class: 'notice' }, tt('No marks missing. Absent students are not counted as missing.', 'কোনো নম্বর বাকি নেই। অনুপস্থিত শিক্ষার্থীদের বাকি ধরা হয় না।')));
    submitBtn.disabled = !editable || isAdminUser || missing.length > 0;
  }

  const submitBtn = button(tt('Submit subject', 'বিষয় জমা দিন'), { kind: 'primary', onClick: async () => {
    if (rows.some((r) => ['dirty', 'saving', 'pending', 'error', 'invalid', 'conflict'].includes(r.status))) { toast(tt('Wait until every row shows Saved, then submit.', 'সব সারিতে "সংরক্ষিত" দেখানো পর্যন্ত অপেক্ষা করে জমা দিন।'), 'error'); return; }
    if (!(await confirmDialog({ title: tt('Submit {x}?', '{x} জমা দেবেন?', { x: L(def.name) }), body: tt('You will not be able to change marks after submitting unless the administrator reopens the subject.', 'জমা দেওয়ার পর প্রশাসক আবার না খুললে নম্বর বদলানো যাবে না।'), confirmText: tt('Submit', 'জমা দিন') }))) return;
    try { await submitSubject(me, sid, subjectId, bundle.session.title); toast(tt('Submitted. The administrator has been notified.', 'জমা হয়েছে। প্রশাসককে জানানো হয়েছে।'), 'success'); location.reload(); }
    catch (e) { toast(friendlyError(e), 'error'); }
  } });
  const saveBtn = button(tt('Save now', 'এখনই সংরক্ষণ'), { onClick: async () => { for (const [id, tm] of timers) { clearTimeout(tm); await commit(rows.find((r) => r.e.id === id)); } await flush(); } });

  const notices = [
    !editable ? h('p', { class: 'notice' }, submitted ? tt('This subject has been submitted. Ask the administrator to reopen it if a mark must change.', 'বিষয়টি জমা হয়েছে। নম্বর বদলাতে প্রশাসককে আবার খুলতে বলুন।') : tt('Mark entry is closed for this examination.', 'এই পরীক্ষার নম্বর প্রদান বন্ধ।')) : null,
    restored ? h('p', { class: 'notice notice--locked' }, tt('{n} unsent change(s) from this device were restored and will be sent automatically.', 'এই ডিভাইসের {n}টি না-পাঠানো পরিবর্তন ফিরিয়ে আনা হয়েছে এবং স্বয়ংক্রিয়ভাবে পাঠানো হবে।', { n: restored })) : null,
    isAdminUser && [ExamState.SUBMITTED, ExamState.UNDER_REVIEW].includes(state) ? h('p', { class: 'notice notice--locked' }, tt('You are changing marks after mark entry closed. Every change is recorded in the audit log.', 'নম্বর প্রদান বন্ধ হওয়ার পর আপনি নম্বর বদলাচ্ছেন। প্রতিটি পরিবর্তন অডিট লগে থাকবে।')) : null,
  ];

  root.replaceChildren(
    pageHeader({ title: L(def.name), subtitle: `${L(bundle.session.title)} · ${tt('{n} students', '{n} জন শিক্ষার্থী', { n: rows.length })}`,
      back: { href: isAdminUser ? `#/admin/sheet?sid=${encodeURIComponent(sid)}` : `#/teacher/exam?sid=${encodeURIComponent(sid)}`, label: tt('Back to examination', 'পরীক্ষায় ফিরে যান') },
      actions: editable ? [saveBtn, isAdminUser ? null : submitBtn].filter(Boolean) : [] }),
    ...notices.filter(Boolean),
    h('div', { class: 'marks-toolbar' }, saveStatus, h('p', { class: 'muted small' }, tt('Type a number, or AB for absent in one part. Leave empty if not available yet. Enter or ↓ moves down.', 'সংখ্যা লিখুন, কোনো অংশে অনুপস্থিত হলে AB লিখুন। এখনো না পেলে খালি রাখুন। Enter বা ↓ চাপলে নিচে যায়।'))),
    missingBox,
    h('div', { class: 'table-scroll marks-scroll' }, table));
  rows.forEach(paintRow);
  paintSaveStatus(); paintMissing();
  if (restored) flushSoon();

  const offNet = on('network', (online) => { paintSaveStatus(); if (online) flush(); });
  const offSync = on('sync:done', () => reconcile().then(() => { paintSaveStatus(); paintMissing(); }));
  const retry = setInterval(() => { if (rows.some((r) => r.status === 'pending')) flush(); }, 20_000);
  const onHide = () => { if (document.visibilityState === 'hidden') for (const [id, tm] of timers) { clearTimeout(tm); commit(rows.find((r) => r.e.id === id)); } };
  const beforeUnload = (e) => { if (timers.size || rows.some((r) => ['dirty', 'saving'].includes(r.status))) { e.preventDefault(); e.returnValue = ''; } };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('beforeunload', beforeUnload);
  cleanup.push(offNet, offSync, () => clearInterval(retry), () => document.removeEventListener('visibilitychange', onHide), () => window.removeEventListener('beforeunload', beforeUnload),
    () => { for (const [id, tm] of timers) { clearTimeout(tm); commit(rows.find((r) => r.e.id === id)); } });
  if (!getState().online) paintSaveStatus();
}
