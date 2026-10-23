import { toMillis } from '../data/field-ops.js';

/** Mark-entry deadline helpers. `deadline` may be a Firestore Timestamp, Date, ISO string or ms. */
export function deadlineMs(session) { return toMillis(session?.markEntryDeadline ?? null); }
export function isPastDeadline(session, now = Date.now()) { const d = deadlineMs(session); return d != null && now >= d; }

/** { days, hours, minutes, seconds, total } until the deadline (never negative). */
export function countdown(ms, now = Date.now()) {
  const total = Math.max(0, ms - now);
  return { total, days: Math.floor(total / 86400000), hours: Math.floor(total / 3600000) % 24, minutes: Math.floor(total / 60000) % 60, seconds: Math.floor(total / 1000) % 60 };
}

/** Time-of-day greeting. */
export function greeting(date = new Date()) {
  const hr = date.getHours();
  if (hr >= 5 && hr < 12) return { en: 'Good morning', bn: 'সুপ্রভাত' };
  if (hr >= 12 && hr < 16) return { en: 'Good afternoon', bn: 'শুভ দুপুর' };
  if (hr >= 16 && hr < 18) return { en: 'Good afternoon', bn: 'শুভ বিকাল' };
  if (hr >= 18 && hr < 21) return { en: 'Good evening', bn: 'শুভ সন্ধ্যা' };
  return { en: 'Good night', bn: 'শুভ রাত্রি' };
}
