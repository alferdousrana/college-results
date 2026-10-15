/**
 * Backend-neutral write sentinels. Repositories use these instead of Firestore helpers so the
 * same code runs against Firestore and the labelled demo backend.
 */
export const OP = '__crmsOp';
export const serverTime = () => ({ [OP]: 'serverTime' });
export const arrayUnion = (...values) => ({ [OP]: 'arrayUnion', values });
export const arrayRemove = (...values) => ({ [OP]: 'arrayRemove', values });
export const deleteField = () => ({ [OP]: 'delete' });
export const increment = (by = 1) => ({ [OP]: 'increment', by });
export const isOp = (v) => v !== null && typeof v === 'object' && OP in v;

/** Converts any stored timestamp shape (Firestore Timestamp, Date, ms, ISO) to milliseconds. */
export function toMillis(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}
