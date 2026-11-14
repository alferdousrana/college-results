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

import { isAdminRole, manageableRoles, effectiveRole } from '../../src/auth/roles.js';
import { canTransition } from '../../src/domain/exam-lifecycle.js';
describe('principal and administrators', () => {
  const principal = { role: 'principal', status: 'active' };
  const office = { role: 'administrator', status: 'active' };
  it('a principal has every permission and admin pages', () => {
    expect(can(principal, Permission.PUBLISH_RESULTS)).toBe(true);
    expect(isAdminRole('principal')).toBe(true);
    expect(effectiveRole('principal')).toBe('super_admin');
    expect(canTransition('under_review', 'published', 'principal')).toBe(true);
    setState({ firebaseReady: true, authUser: { uid: 'p' }, profile: principal });
    expect(checkAccess({ path: '/admin', access: 'admin' })).toBe(null);
    expect(homePathFor()).toBe('/admin');
  });
  it('a principal cannot manage the Super Admin or create a principal', () => {
    expect(manageableRoles(principal)).not.toContain('super_admin');
    expect(manageableRoles(principal)).not.toContain('principal');
    expect(manageableRoles({ role: 'super_admin', status: 'active' })).toContain('principal');
  });
  it('administrators and teachers see the overview, read only', () => {
    expect(can(office, Permission.VIEW_OVERVIEW)).toBe(true);
    expect(can({ role: 'teacher', status: 'active' }, Permission.VIEW_OVERVIEW)).toBe(true);
    expect(can(office, Permission.MANAGE_STUDENTS)).toBe(false);
    expect(hasGrant(office, 'students')).toBe(false);
    expect(can({ role: 'staff', status: 'active' }, Permission.VIEW_OVERVIEW)).toBe(false);
    setState({ firebaseReady: true, authUser: { uid: 'o' }, profile: office });
    expect(homePathFor()).toBe('/overview');
    expect(checkAccess({ path: '/admin', access: 'admin' })).toBe('forbidden');
    expect(checkAccess({ path: '/overview', access: 'overview' })).toBe(null);
    expect(checkAccess({ path: '/admin/students', access: 'students-view' })).toBe(null);
    expect(checkAccess({ path: '/admin/students/import', access: 'students' })).toBe('forbidden');
    setState({ firebaseReady: true, authUser: { uid: 's' }, profile: { role: 'staff', status: 'active' } });
    expect(checkAccess({ path: '/overview', access: 'overview' })).toBe('forbidden');
  });
});
