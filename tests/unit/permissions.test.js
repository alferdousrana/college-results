import { describe, it, expect } from 'vitest';
import { can, Permission } from '../../src/auth/roles.js';
import { checkAccess, homePathFor } from '../../src/app/guards.js';
import { setState } from '../../src/core/store.js';

describe('client permission mirror', () => {
  const teacher = { role: 'teacher', status: 'active' };
  it('teachers cannot publish or manage teachers', () => {
    expect(can(teacher, Permission.PUBLISH_RESULTS)).toBe(false);
    expect(can(teacher, Permission.MANAGE_TEACHERS)).toBe(false);
    expect(can(teacher, Permission.ENTER_ASSIGNED_MARKS)).toBe(true);
  });
  it('pending accounts have no permissions', () => {
    expect(can({ role: 'super_admin', status: 'pending' }, Permission.PUBLISH_RESULTS)).toBe(false);
  });
});

describe('route guards', () => {
  const adminRoute = { path: '/admin', access: 'admin' };
  it('sends visitors to sign in', () => {
    setState({ firebaseReady: true, authUser: null, profile: null });
    expect(checkAccess(adminRoute)).toMatch(/^\/login/);
  });
  it('sends pending teachers to the status page', () => {
    setState({ firebaseReady: true, authUser: { uid: 'u' }, profile: { role: 'teacher', status: 'pending' } });
    expect(checkAccess(adminRoute)).toBe('/pending');
  });
  it('forbids teachers from admin pages', () => {
    setState({ firebaseReady: true, authUser: { uid: 'u' }, profile: { role: 'teacher', status: 'active' } });
    expect(checkAccess(adminRoute)).toBe('forbidden');
    expect(homePathFor()).toBe('/teacher');
  });
});

import { hasGrant } from '../../src/auth/roles.js';
describe('grants', () => {
  it('admin always; others only when granted and active', () => {
    expect(hasGrant({ role: 'super_admin', status: 'active' }, 'students')).toBe(true);
    expect(hasGrant({ role: 'staff', status: 'active', grants: { students: true } }, 'students')).toBe(true);
    expect(hasGrant({ role: 'staff', status: 'disabled', grants: { students: true } }, 'students')).toBe(false);
    expect(hasGrant({ role: 'teacher', status: 'active' }, 'students')).toBe(false);
  });
});
