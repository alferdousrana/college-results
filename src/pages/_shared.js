/** Small helpers shared by pages. */
import { getState } from '../core/store.js';
import { L } from '../i18n/index.js';
import { toast } from '../ui/components/toast.js';

/** The signed-in actor as repositories expect it. */
export function actor() {
  const p = getState().profile;
  return { id: p.id, role: p.role, displayName: p.displayName };
}

export function isAdmin() { const p = getState().profile; return p?.status === 'active' && p.role === 'super_admin'; }

export function byId(list) { return Object.fromEntries((list ?? []).map((x) => [x.id, x])); }

export function nameOf(list, id) { const x = (list ?? []).find((i) => i.id === id); return x ? L(x.name ?? x.label) : id ?? ''; }

/**
 * Runs an async action with a toast for success/failure.
 * Returns the action's result (or `true` when it returns nothing) on success, `undefined` on failure,
 * so callers can test `!== undefined` even for actions that return no value.
 */
export async function run(fn, { success = null } = {}) {
  try {
    const r = await fn();
    if (success) toast(success, 'success');
    return r === undefined ? true : r;
  } catch (e) {
    console.error(e);
    toast(friendlyError(e), 'error');
    return undefined;
  }
}

export function friendlyError(e) {
  if (e?.code === 'permission-denied') return 'You do not have permission to do this. If you think you should, ask the administrator.';
  if (e?.code === 'resource-exhausted') return 'The free database quota for today has been used up. Try again tomorrow or ask the developer to review the plan.';
  if (e?.code === 'unavailable') return 'The server could not be reached. Check the internet connection and try again.';
  return e?.message || 'Something went wrong. Try again.';
}

export function sessionLink(s, role = 'super_admin') {
  return role === 'super_admin' ? `#/admin/sheet?sid=${encodeURIComponent(s.id)}` : `#/teacher/exam?sid=${encodeURIComponent(s.id)}`;
}
