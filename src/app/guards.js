import { getState } from '../core/store.js';
import { AccountStatus, Role } from '../auth/roles.js';

/** Returns null when access is allowed, or a redirect path / 'forbidden'. */
export function checkAccess(route) {
  const { authUser, profile, firebaseReady } = getState();
  if (route.access === 'public') return null;
  if (!firebaseReady) return '/setup';
  if (!authUser) return `/login?next=${encodeURIComponent(route.path)}`;
  if (route.access === 'signed-in') return null;
  if (!profile || profile.status !== AccountStatus.ACTIVE) return '/pending';
  if (route.access === 'staff') return null;
  if (route.access === 'admin' && profile.role !== Role.SUPER_ADMIN) return 'forbidden';
  if (route.access === 'teacher' && profile.role !== Role.TEACHER) return 'forbidden';
  return null;
}

export function homePathFor(state = getState()) {
  const p = state.profile;
  if (!state.authUser) return '/lookup';
  if (!p || p.status !== AccountStatus.ACTIVE) return '/pending';
  return p.role === Role.SUPER_ADMIN ? '/admin' : '/teacher';
}
