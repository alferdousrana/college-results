/** Non-teaching staff (কর্মচারী): list, add, edit, deactivate, delete. */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button } from '../../ui/components/page.js';
import { asyncSection } from '../../ui/components/states.js';
import { dataTable } from '../../ui/components/data-table.js';
import { openModal } from '../../ui/components/modal.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { field, selectField } from '../../ui/components/form.js';
import { actor, run, friendlyError } from '../_shared.js';
import { toast } from '../../ui/components/toast.js';
import { fmtDate } from '../../ui/format.js';

export const title = 'nav.staff';

export function render() {
  const root = h('section', { class: 'page' });
  const body = h('div');
  // Staff with a login have a users/{uid} profile (role staff) holding their permissions.
  let accounts = {};
  const load = () => asyncSection(body, async () => {
    const [{ listStaff }, { getBackend }] = await Promise.all([import('../../data/repositories/staff-repository.js'), import('../../data/backend/index.js')]);
    const b = await getBackend();
    const users = (await b.list('users', { where: [['role', '==', 'staff']], limit: 500 })).items;
    accounts = Object.fromEntries(users.map((u) => [u.id, u]));
    return listStaff();
  }, (rows) => dataTable({
    rows, pageSize: 50, searchKeys: [(r) => L(r.name, 'en'), (r) => L(r.name, 'bn'), (r) => L(r.designation), 'phone'],
    filters: [{ key: 'status', label: tt('Status', 'অবস্থা'), options: [{ value: 'active', label: tt('Active', 'সক্রিয়') }, { value: 'inactive', label: tt('Inactive', 'নিষ্ক্রিয়') }] }],
    empty: tt('No staff added yet.', 'এখনো কোনো কর্মচারী যোগ করা হয়নি।'),
    columns: [
      { key: 'name', label: tt('Name', 'নাম'), sort: (r) => L(r.name), render: (r) => h('div', {}, h('strong', {}, L(r.name, 'en')), r.name?.bn ? h('div', { class: 'muted small' }, r.name.bn) : null) },
      { key: 'designation', label: tt('Designation', 'পদবি'), render: (r) => L(r.designation) },
      { key: 'phone', label: tt('Mobile', 'মোবাইল') },
      { key: 'joiningDate', label: tt('Joined', 'যোগদান'), render: (r) => (r.joiningDate ? fmtDate(r.joiningDate) : '') },
      { key: 'login', label: tt('Login', 'লগইন'), render: (r) => {
        const u = r.userId ? accounts[r.userId] : null;
        if (!u) return h('span', { class: 'muted small' }, tt('No login', 'লগইন নেই'));
        return h('div', {}, h('div', { class: 'small' }, u.email),
          u.status !== 'active' ? h('span', { class: 'badge badge--neutral' }, tt('Login disabled', 'লগইন বন্ধ'))
            : u.grants?.students ? h('span', { class: 'badge badge--good' }, tt('Can add students', 'শিক্ষার্থী যোগ করতে পারেন')) : h('span', { class: 'badge badge--neutral' }, tt('No permissions', 'কোনো অনুমতি নেই')));
      } },
      { key: 'status', label: tt('Status', 'অবস্থা'), render: (r) => h('span', { class: `badge badge--${r.status === 'active' ? 'good' : 'neutral'}` }, r.status === 'active' ? tt('Active', 'সক্রিয়') : tt('Inactive', 'নিষ্ক্রিয়')) },
      { key: 'a', label: '', render: (r) => h('div', { class: 'row-actions' }, button(tt('Edit', 'সম্পাদনা'), { size: 'sm', onClick: () => edit(r, rows.length) }),
        r.userId && accounts[r.userId] ? button(tt('Login & permissions', 'লগইন ও অনুমতি'), { size: 'sm', onClick: () => loginSettings(r, accounts[r.userId]) }) : button(tt('Create login', 'লগইন তৈরি'), { size: 'sm', onClick: () => createLogin(r) }),
        button(tt('Delete', 'মুছুন'), { size: 'sm', kind: 'danger-ghost', onClick: async () => {
          if (!(await confirmDialog({ title: tt('Delete {n}?', '{n}-কে মুছবেন?', { n: L(r.name) }), body: tt('The record is removed. To keep it, mark the person inactive instead.', 'রেকর্ড মুছে যাবে। রাখতে চাইলে নিষ্ক্রিয় করুন।'), danger: true, confirmText: tt('Delete', 'মুছুন') }))) return;
          const { deleteStaff } = await import('../../data/repositories/staff-repository.js');
          if (await run(() => deleteStaff(actor(), r.id), { success: tt('Deleted', 'মুছে ফেলা হয়েছে') }) !== undefined) load();
        } })) },
    ] }).el);
  function createLogin(staff) {
    const email = field({ label: tt('Email (for signing in)', 'ইমেইল (লগইনের জন্য)'), name: 'sle', type: 'email', required: true });
    const pass = field({ label: tt('Temporary password (at least 8 characters)', 'অস্থায়ী পাসওয়ার্ড (অন্তত ৮ অক্ষর)'), name: 'slp', type: 'password', required: true });
    const st = field({ label: tt('Can add and edit students (not delete)', 'শিক্ষার্থী যোগ ও সম্পাদনা করতে পারবেন (মুছতে নয়)'), name: 'slg', type: 'checkbox', value: true });
    openModal({ title: tt('Create login for {n}', '{n}-এর লগইন তৈরি', { n: L(staff.name) }), content: h('div', { class: 'form-grid' }, email.el, pass.el, st.el,
      h('p', { class: 'muted small span-all' }, tt('Staff sign in like teachers but cannot enter marks. They can only do what you allow here. A password-reset email is also sent so they can choose their own password.', 'কর্মচারী শিক্ষকের মতো লগইন করবেন, কিন্তু নম্বর দিতে পারবেন না। এখানে যা অনুমতি দেবেন শুধু তা-ই করতে পারবেন। নিজের পাসওয়ার্ড বসানোর জন্য একটি ইমেইলও যাবে।'))),
      actions: [{ label: t('common.cancel'), onClick: () => true }, { label: tt('Create login', 'লগইন তৈরি'), kind: 'primary', onClick: async () => {
        if (!email.value || !email.input.validity.valid) { email.setError(tt('Enter a valid email', 'সঠিক ইমেইল দিন')); return false; }
        if ((pass.value ?? '').length < 8) { pass.setError(tt('At least 8 characters', 'অন্তত ৮ অক্ষর')); return false; }
        try {
          const [{ adminCreateTeacher }, { saveCreatedStaffUser }] = await Promise.all([import('../../auth/auth-service.js'), import('../../data/repositories/users-repository.js')]);
          const { uid, profile } = await adminCreateTeacher({ displayName: L(staff.name, 'en') || L(staff.name), email: email.value, phone: staff.phone, tempPassword: pass.value, role: 'staff', grants: { students: st.value }, staffId: staff.id }, actor().id);
          await saveCreatedStaffUser(actor(), uid, profile, staff.id);
          toast(tt('Login created. Share the temporary password privately.', 'লগইন তৈরি হয়েছে। অস্থায়ী পাসওয়ার্ড গোপনে জানান।'), 'success'); load(); return true;
        } catch (e) { toast(e?.code === 'auth/email-already-in-use' ? tt('An account with this email already exists.', 'এই ইমেইলে আগেই অ্যাকাউন্ট আছে।') : friendlyError(e), 'error'); return false; }
      } }] });
  }

  function loginSettings(staff, user) {
    const st = field({ label: tt('Can add and edit students (not delete)', 'শিক্ষার্থী যোগ ও সম্পাদনা করতে পারবেন (মুছতে নয়)'), name: 'lsg', type: 'checkbox', value: user.grants?.students === true });
    const active = user.status === 'active';
    openModal({ title: tt('Login of {n}', '{n}-এর লগইন', { n: L(staff.name) }), content: h('div', {}, h('p', {}, user.email), st.el), actions: [
      { label: active ? tt('Disable login', 'লগইন বন্ধ') : tt('Enable login', 'লগইন চালু'), kind: active ? 'danger-ghost' : 'ghost', onClick: async () => {
        const { setUserStatus } = await import('../../data/repositories/users-repository.js');
        const ok = await run(() => setUserStatus(actor(), user.id, active ? 'disabled' : 'active'), { success: tt('Saved', 'সংরক্ষিত') });
        if (ok !== undefined) load(); return ok !== undefined;
      } },
      { label: t('common.cancel'), onClick: () => true },
      { label: t('common.save'), kind: 'primary', onClick: async () => {
        const { setUserGrants } = await import('../../data/repositories/users-repository.js');
        const ok = await run(() => setUserGrants(actor(), user.id, { ...(user.grants ?? {}), students: st.value }), { success: tt('Permissions saved', 'অনুমতি সংরক্ষিত') });
        if (ok !== undefined) load(); return ok !== undefined;
      } }] });
  }

  function edit(item, count = 0) {
    const f = {
      en: field({ label: tt('Name (English)', 'নাম (ইংরেজি)'), name: 'sfen', required: true, value: item?.name?.en ?? '' }),
      bn: field({ label: tt('Name (Bangla)', 'নাম (বাংলা)'), name: 'sfbn', value: item?.name?.bn ?? '' }),
      den: field({ label: tt('Designation (English)', 'পদবি (ইংরেজি)'), name: 'sfden', value: item?.designation?.en ?? '', hint: tt('e.g. Office Assistant, Accountant, Night Guard', 'যেমন অফিস সহকারী, হিসাবরক্ষক, নৈশপ্রহরী') }),
      dbn: field({ label: tt('Designation (Bangla)', 'পদবি (বাংলা)'), name: 'sfdbn', value: item?.designation?.bn ?? '' }),
      phone: field({ label: tt('Mobile number', 'মোবাইল নম্বর'), name: 'sfph', type: 'tel', value: item?.phone ?? '' }),
      join: field({ label: tt('Joining date', 'যোগদানের তারিখ'), name: 'sfjd', type: 'date', value: item?.joiningDate ?? '' }),
      status: selectField({ label: tt('Status', 'অবস্থা'), name: 'sfst', value: item?.status ?? 'active', options: [{ value: 'active', label: tt('Active', 'সক্রিয়') }, { value: 'inactive', label: tt('Inactive', 'নিষ্ক্রিয়') }] }),
      order: field({ label: tt('Display order', 'প্রদর্শনের ক্রম'), name: 'sfo', type: 'number', value: item?.order ?? count + 1 }),
    };
    openModal({ title: item ? tt('Edit staff member', 'কর্মচারী সম্পাদনা') : tt('Add staff member', 'কর্মচারী যোগ'), content: h('div', { class: 'form-grid' }, Object.values(f).map((x) => x.el)), actions: [
      { label: t('common.cancel'), onClick: () => true },
      { label: t('common.save'), kind: 'primary', onClick: async () => {
        if (!f.en.value) { f.en.setError(tt('Required', 'আবশ্যক')); return false; }
        const { saveStaff } = await import('../../data/repositories/staff-repository.js');
        const r = await run(() => saveStaff(actor(), item?.id ?? null, { name: { en: f.en.value, bn: f.bn.value || null }, designation: { en: f.den.value || null, bn: f.dbn.value || null },
          phone: f.phone.value || null, joiningDate: f.join.value || null, status: f.status.value, order: Number(f.order.value) || 0 }), { success: tt('Saved', 'সংরক্ষিত') });
        if (r !== undefined) load();
        return r !== undefined;
      } }] });
  }
  root.append(pageHeader({ title: t('nav.staff'), subtitle: tt('Office and support staff. They do not sign in to the app.', 'অফিস ও সহায়ক কর্মচারী। তাঁরা অ্যাপে সাইন ইন করেন না।'),
    actions: [button(tt('Add staff member', 'কর্মচারী যোগ'), { kind: 'primary', icon: 'plus', onClick: () => edit(null) })] }), body);
  load();
  return root;
}
