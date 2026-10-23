/**
 * Pure helpers for examination routines and attendance (হাজিরা) sheets.
 */
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export const bnDigits = (v) => String(v ?? '').replace(/\d/g, (d) => BN_DIGITS[d]);
export const BN_WEEKDAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

/** '2024-02-08' → { date: '০৮/০২/২০২৪', day: 'বৃহস্পতিবার' } (no time-zone shift). */
export function bnDate(iso) {
  if (!iso) return { date: '', day: '' };
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { date: bnDigits(`${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`), day: BN_WEEKDAYS[wd] };
}

export const cellKey = (slotId, sessionId) => `${slotId}|${sessionId}`;

/** Days sorted by date. */
export function sortedDays(routine) {
  return [...(routine.days ?? [])].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));
}

/** Subjects of one result sheet that are not yet in the routine, and those scheduled more than once. */
export function scheduleCheck(routine, sessionId, subjectIds) {
  const count = Object.fromEntries(subjectIds.map((id) => [id, 0]));
  for (const d of routine.days ?? []) for (const s of routine.slots ?? []) for (const id of d.cells?.[cellKey(s.id, sessionId)] ?? []) if (id in count) count[id]++;
  return { missing: subjectIds.filter((id) => count[id] === 0), repeated: subjectIds.filter((id) => count[id] > 1) };
}

/**
 * Attendance rows for one student: every routine entry of this result sheet whose subject the student sits.
 * Returns [{ date, slotLabel, subjectId }] sorted by date and slot order.
 */
export function attendanceRows(routine, sessionId, studentSubjectIds) {
  const rows = [];
  const slotOrder = Object.fromEntries((routine.slots ?? []).map((s, i) => [s.id, i]));
  for (const d of sortedDays(routine)) {
    for (const s of routine.slots ?? []) {
      for (const id of d.cells?.[cellKey(s.id, sessionId)] ?? []) {
        if (studentSubjectIds.includes(id)) rows.push({ date: d.date, slotId: s.id, slotLabel: s.label, subjectId: id, order: slotOrder[s.id] });
      }
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
}

/** First and last exam day of one result sheet (class + exam + session) across all routines. */
export function examDateRange(routines, sessionId) {
  const dates = [];
  for (const r of routines) for (const d of r.days ?? []) {
    if (!d.date) continue;
    if (Object.entries(d.cells ?? {}).some(([k, v]) => k.endsWith(`|${sessionId}`) && v?.length)) dates.push(d.date);
  }
  dates.sort();
  return dates.length ? { first: dates[0], last: dates.at(-1) } : null;
}
