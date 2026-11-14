/**
 * Administration (প্রশাসন): the Super Admin, the principal and other administrators.
 *   - Only the Super Admin creates, changes or removes a principal.
 *   - The Super Admin and the principal create, change or remove administrators.
 *   - Nobody but the Super Admin changes a Super Admin account (enforced by firestore.rules).
 * Administrators sign in and see the college overview (view only) unless given the students right.
 */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { getState } from '../../core/store.js';
import { pageHeader, button } from '../../ui/components/page.js';
import { asyncSection } from '../../ui/components/states.js';
import { dataTable } from '../../ui/components/data-table.js';
import { openModal } from '../../ui/components/modal.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { field, selectField } from '../../ui/components/form.js';
import { toast } from '../../ui/components/toast.js';
import { actor, run, friendlyError } from '../_shared.js';
import { Role, ROLE_LABELS, manageableRoles } from '../../auth/roles.js';

export const title = 'nav.administrators';

const roleBadge = (role) => h('span', { class: `badge badge--role badge--role-${role}` }, L(ROLE_LABELS[role]) || role);

export function render() {
  const root = h('section', { class: 'page' });
  const body = h('div');
  const me = getState().profile;
  const allowed = manageableRoles(me).filter((r) => [Role.PRINCIPAL, Role.ADMINISTRATOR].includes(r));
  const mayManage = (u) => u.id !== me.id && allowed.includes(u.role);

  const load = () => asyncSection(body, async () => {
    const { listAdministration } = await import('../../data/repositories/users-repository.js');
    return listAdministration();
  }, (rows) => dataTable({
    rows, pageSize: 50, searchKeys: ['displayName', 'email', 'phone', 'designation'],
    empty: tt('No principal or administrators yet. Add the principal first.', 'এখনো কোনো অধ্যক্ষ বা প্রশাসনিক কর্মকর্তা নেই। আগে অধ্যক্ষকে যোগ করুন।'),
    columns: [
      { key: 'displayName', label: tt('Name', 'নাম'), render: (u) => h('div', {}, h('strong', {}, u.displayName ?? u.email),
        u.designation ? h('div', { class: 'muted small' }, u.designation) : null) },
      { key: 'role', label: tt('Role', 'ভূমিকা'), render: (u) => h('div', {}, roleBadge(u.role),
        u.role === Role.ADMINISTRATOR && u.grants?.students ? h('div', {}, h('span', { class: 'badge badge--good' }, tt('Can add students', 'শিক্ষার্থী যোগ করতে পারেন'))) : null) },
      { key: 'email', label: tt('Email', 'ইমেইল'), render: (u) => h('span', { class: 'small' }, u.email ?? '') },
      { key: 'phone', label: tt('Mobile', 'মোবাইল') },
      { key: 'status', label: tt('Status', 'অবস্থা'), render: (u) => h('span', { class: `badge badge--${u.status === 'active' ? 'good' : 'neutral'}` }, u.status === 'active' ? tt('Active', 'সক্রিয়') : tt('Disabled', 'নিষ্ক্রিয়')) },
      { key: 'a', label: '', render: (u) => {
        if (u.id === me.id) return h('span', { class: 'muted small' }, tt('Your account', 'আপনার অ্যাকাউন্ট'));
        if (!mayManage(u)) return h('span', { class: 'muted small' }, u.role === Role.SUPER_ADMIN ? tt('Cannot be changed', 'পরিবর্তন করা যায় না') : tt('Only the Super Admin can change this', 'শুধু সুপার অ্যাডমিন বদলাতে পারেন'));
        return h('div', { class: 'row-actions' },
          button(tt('Edit', 'সম্পাদনা'), { size: 'sm', onClick: () => edit(u) }),
          button(u.status === 'active' ? tt('Disable', 'নিষ্ক্রিয় করুন') : tt('Enable', 'সক্রিয় করুন'), { size: 'sm', onClick: () => toggle(u) }),
          button(tt('Remove', 'সরান'), { size: 'sm', kind: 'danger-ghost', onClick: () => remove(u) }));
      } },
    ] }).el);

  async function toggle(u) {
    const active = u.status === 'active';
    if (!(await confirmDialog({ title: active ? tt('Disable {n}?', '{n}-কে নিষ্ক্রিয় করবেন?', { n: u.displayName }) : tt('Enable {n}?', '{n}-কে সক্রিয় করবেন?', { n: u.displayName }),
      body: active ? tt('They lose access immediately. You can enable the account again later.', 'তাঁরা সঙ্গে সঙ্গে প্রবেশাধিকার হারাবেন। পরে আবার সক্রিয় করা যাবে।') : tt('They can sign in again.', 'তাঁরা আবার সাইন ইন করতে পারবেন।'),
      danger: active, confirmText: active ? tt('Disable', 'নিষ্ক্রিয় করুন') : tt('Enable', 'সক্রিয় করুন') }))) return;
    const { setUserStatus } = await import('../../data/repositories/users-repository.js');
    if (await run(() => setUserStatus(actor(), u.id, active ? 'disabled' : 'active'), { success: tt('Saved', 'সংরক্ষিত') }) !== undefined) load();
  }

  async function remove(u) {
    if (!(await confirmDialog({ title: tt('Remove {n}?', '{n}-কে সরাবেন?', { n: u.displayName }),
      body: tt('The profile is removed and the person can no longer use the app. Afterwards also delete the sign-in account in Firebase Console → Authentication.', 'প্রোফাইল মুছে যাবে, তিনি আর অ্যাপ ব্যবহার করতে পারবেন না। এরপর Firebase Console → Authentication থেকে লগইন অ্যাকাউন্টটিও মুছুন।'),
      danger: true, confirmText: tt('Remove', 'সরান') }))) return;
    const { deleteAdministrator } = await import('../../data/repositories/users-repository.js');
    if (await run(() => deleteAdministrator(actor(), u.id), { success: tt('Removed', 'সরানো হয়েছে') }) !== undefined) load();
  }

  function formFields(u = null) {
    return {
      name: field({ label: tt('Name', 'নাম'), name: 'adn', required: true, value: u?.displayName ?? '', hint: tt('As it should appear, e.g. Md. Abdul Karim', 'যেভাবে দেখাবে, যেমন মো. আব্দুল করিম') }),
      designation: field({ label: tt('Designation', 'পদবি'), name: 'add', value: u?.designation ?? '', hint: tt('e.g. Vice Principal, Head Assistant, Accountant', 'যেমন উপাধ্যক্ষ, প্রধান সহকারী, হিসাবরক্ষক') }),
      phone: field({ label: tt('Mobile number', 'মোবাইল নম্বর'), name: 'adp', type: 'tel', value: u?.phone ?? '' }),
      order: field({ label: tt('Display order', 'প্রদর্শনের ক্রম'), name: 'ado', type: 'number', value: u?.order ?? '' }),
      students: field({ label: tt('Can add and edit students (not delete) — administrators only', 'শিক্ষার্থী যোগ ও সম্পাদনা করতে পারবেন (মুছতে নয়) — শুধু প্রশাসনিক কর্মকর্তা'), name: 'adg', type: 'checkbox', value: u?.grants?.students === true }),
    };
  }

  function create() {
    if (!allowed.length) return;
    const role = selectField({ label: tt('Role', 'ভূমিকা'), name: 'adr', value: allowed.includes(Role.PRINCIPAL) ? Role.PRINCIPAL : Role.ADMINISTRATOR,
      options: allowed.map((r) => ({ value: r, label: L(ROLE_LABELS[r]) })),
      hint: allowed.includes(Role.PRINCIPAL)
        ? tt('Principal: the same rights as you, except changing or removing the Super Admin. Administrator: sees the college overview only.', 'অধ্যক্ষ: আপনার মতোই সব অনুমতি, শুধু সুপার অ্যাডমিনকে বদলানো বা সরানো যাবে না। প্রশাসনিক কর্মকর্তা: শুধু কলেজের সার্বিক চিত্র দেখতে পারবেন।')
        : tt('Administrators see the college overview only. Only the Super Admin can add a principal.', 'প্রশাসনিক কর্মকর্তা শুধু কলেজের সার্বিক চিত্র দেখতে পারবেন। অধ্যক্ষ যোগ করতে পারেন শুধু সুপার অ্যাডমিন।') });
    const f = formFields();
    const email = field({ label: tt('Email (for signing in)', 'ইমেইল (লগইনের জন্য)'), name: 'ade', type: 'email', required: true });
    const pass = field({ label: tt('Temporary password (at least 8 characters)', 'অস্থায়ী পাসওয়ার্ড (অন্তত ৮ অক্ষর)'), name: 'adpw', type: 'password', required: true });
    const syncGrant = () => { f.students.el.hidden = role.value !== Role.ADMINISTRATOR; };
    role.input.addEventListener('change', syncGrant); syncGrant();
    openModal({ title: tt('Add to the administration', 'প্রশাসনে যোগ করুন'), content: h('div', { class: 'form-grid' }, role.el, f.name.el, f.designation.el, f.phone.el, email.el, pass.el, f.order.el, f.students.el,
      h('p', { class: 'muted small span-all' }, tt('A password-reset email is also sent so they can choose their own password. Share the temporary password privately.', 'নিজের পাসওয়ার্ড বসানোর জন্য একটি ইমেইলও যাবে। অস্থায়ী পাসওয়ার্ড গোপনে জানান।'))),
    actions: [{ label: t('common.cancel'), onClick: () => true }, { label: tt('Create account', 'অ্যাকাউন্ট তৈরি'), kind: 'primary', onClick: async () => {
      if (!f.name.value?.trim()) { f.name.setError(tt('Required', 'আবশ্যক')); return false; }
      if (!email.value || !email.input.validity.valid) { email.setError(tt('Enter a valid email', 'সঠিক ইমেইল দিন')); return false; }
      if ((pass.value ?? '').length < 8) { pass.setError(tt('At least 8 characters', 'অন্তত ৮ অক্ষর')); return false; }
      try {
        const [{ adminCreateTeacher }, { saveCreatedAdministrator }] = await Promise.all([import('../../auth/auth-service.js'), import('../../data/repositories/users-repository.js')]);
        const grants = role.value === Role.ADMINISTRATOR && f.students.value ? { students: true } : null;
        const { uid, profile } = await adminCreateTeacher({ displayName: f.name.value, email: email.value, phone: f.phone.value, tempPassword: pass.value, role: role.value, grants }, actor().id);
        await saveCreatedAdministrator(actor(), uid, { ...profile, designation: f.designation.value?.trim() || null, order: Number(f.order.value) || 0 });
        toast(tt('Account created. Share the temporary password privately.', 'অ্যাকাউন্ট তৈরি হয়েছে। অস্থায়ী পাসওয়ার্ড গোপনে জানান।'), 'success'); load(); return true;
      } catch (e) { toast(e?.code === 'auth/email-already-in-use' ? tt('An account with this email already exists.', 'এই ইমেইলে আগেই অ্যাকাউন্ট আছে।') : friendlyError(e), 'error'); return false; }
    } }] });
  }

  function edit(u) {
    const f = formFields(u);
    f.students.el.hidden = u.role !== Role.ADMINISTRATOR;
    openModal({ title: tt('Edit {n}', '{n} সম্পাদনা', { n: u.displayName }), content: h('div', { class: 'form-grid' }, h('p', { class: 'span-all' }, roleBadge(u.role), ' ', h('span', { class: 'muted small' }, u.email ?? '')),
      f.name.el, f.designation.el, f.phone.el, f.order.el, f.students.el),
    actions: [{ label: t('common.cancel'), onClick: () => true }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      if (!f.name.value?.trim()) { f.name.setError(tt('Required', 'আবশ্যক')); return false; }
      const { updateAdministrator } = await import('../../data/repositories/users-repository.js');
      const ok = await run(() => updateAdministrator(actor(), u.id, { displayName: f.name.value, designation: f.designation.value?.trim() || null, phone: f.phone.value, order: f.order.value,
        grants: u.role === Role.ADMINISTRATOR ? { ...(u.grants ?? {}), students: f.students.value } : null }), { success: tt('Saved', 'সংরক্ষিত') });
      if (ok !== undefined) load();
      return ok !== undefined;
    } }] });
  }

  root.append(pageHeader({ title: t('nav.administrators'),
    subtitle: tt('The principal and other members of the college administration. They sign in with their own email.', 'অধ্যক্ষ ও কলেজ প্রশাসনের অন্যান্য সদস্য। তাঁরা নিজের ইমেইল দিয়ে সাইন ইন করেন।'),
    actions: allowed.length ? [button(tt('Add', 'যোগ করুন'), { kind: 'primary', icon: 'plus', onClick: create })] : [] }), body);
  load();
  return root;
}
