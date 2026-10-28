/** Teacher accounts: approval queue, active/disabled lists, admin-created accounts. */
import { h } from '../../core/dom.js';
import { t, tt } from '../../i18n/index.js';
import { pageHeader, button, tabs, linkButton } from '../../ui/components/page.js';
import { asyncSection } from '../../ui/components/states.js';
import { dataTable } from '../../ui/components/data-table.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { openModal } from '../../ui/components/modal.js';
import { field } from '../../ui/components/form.js';
import { toast } from '../../ui/components/toast.js';
import { actor, friendlyError, run } from '../_shared.js';
import { fmtDate } from '../../ui/format.js';
import { backendKind } from '../../data/backend/index.js';

export const title = 'nav.teachers';

export function render({ query }) {
  const root = h('section', { class: 'page' });
  const paint = async (active = query.get('tab') ?? 'active') => {
    const { listTeachers } = await import('../../data/repositories/users-repository.js');
    const pendingCount = (await listTeachers({ status: 'pending' }).catch(() => [])).length;
    const tabCtl = tabs([
      { id: 'active', label: tt('Approved', 'অনুমোদিত'), render: (p) => list(p, 'active') },
      { id: 'pending', label: tt('Requests', 'আবেদন'), badge: pendingCount || null, render: (p) => list(p, 'pending') },
      { id: 'disabled', label: tt('Disabled or rejected', 'নিষ্ক্রিয় বা প্রত্যাখ্যাত'), render: (p) => list(p, ['disabled', 'rejected']) },
    ], { active });
    root.replaceChildren(pageHeader({ title: t('nav.teachers'), actions: [linkButton(t('nav.assignments'), '#/admin/assignments'), button(tt('Create teacher account', 'শিক্ষক অ্যাকাউন্ট তৈরি'), { kind: 'primary', icon: 'plus', onClick: () => create(paint) })] }), tabCtl.el);
  };
  async function list(panel, status) {
    asyncSection(panel, async () => {
      const { listTeachers } = await import('../../data/repositories/users-repository.js');
      const all = await listTeachers();
      return all.filter((u) => (Array.isArray(status) ? status.includes(u.status) : u.status === status));
    }, (rows) => dataTable({ rows, searchKeys: ['displayName', 'email', 'phone'], empty: status === 'pending' ? tt('No teacher requests are waiting.', 'কোনো শিক্ষকের আবেদন অপেক্ষায় নেই।') : tt('No teachers here.', 'এখানে কোনো শিক্ষক নেই।'),
      columns: [
        { key: 'displayName', label: tt('Name', 'নাম'), sortable: true, render: (u) => h('div', {}, h('strong', {}, u.displayName), u.grants?.students ? h('span', { class: 'badge badge--good' }, tt('Can add students', 'শিক্ষার্থী যোগ করতে পারেন')) : null, u.requestNote ? h('div', { class: 'muted small' }, u.requestNote) : null) },
        { key: 'email', label: tt('Email', 'ইমেইল') }, { key: 'phone', label: tt('Phone', 'ফোন') },
        { key: 'createdAt', label: tt('Requested', 'আবেদনের তারিখ'), sortable: true, render: (u) => fmtDate(u.createdAt) },
        { key: 'a', label: '', render: (u) => h('div', { class: 'row-actions' }, actionsFor(u, () => paint(Array.isArray(status) ? 'disabled' : status))) },
      ] }).el);
  }
  function actionsFor(u, after) {
    const set = (to, opts) => async () => {
      if (!(await confirmDialog(opts))) return;
      const { setUserStatus } = await import('../../data/repositories/users-repository.js');
      if (await run(() => setUserStatus(actor(), u.id, to), { success: tt('Saved', 'সংরক্ষিত') }) !== undefined) after();
    };
    const approve = button(tt('Approve', 'অনুমোদন'), { kind: 'primary', size: 'sm', onClick: set('active', { title: tt('Approve {n}?', '{n}-কে অনুমোদন দেবেন?', { n: u.displayName }), body: tt('They can sign in and enter marks only for subjects you assign.', 'তিনি সাইন ইন করে শুধু আপনার দেওয়া বিষয়ে নম্বর দিতে পারবেন।'), confirmText: tt('Approve', 'অনুমোদন') }) });
    const del = button(tt('Delete', 'মুছুন'), { size: 'sm', kind: 'danger-ghost', onClick: async () => {
      if (!(await confirmDialog({ title: tt('Delete {n}?', '{n}-কে মুছবেন?', { n: u.displayName }), body: tt('Only possible if this teacher never entered marks and is not assigned in a result sheet. Afterwards also delete the sign-in account in Firebase Console → Authentication.', 'এই শিক্ষক কখনো নম্বর না দিলে এবং কোনো ফলাফল শিটে দায়িত্বে না থাকলেই মোছা যাবে। এরপর Firebase Console → Authentication থেকে লগইন অ্যাকাউন্টও মুছুন।'), danger: true, confirmText: tt('Delete', 'মুছুন') }))) return;
      const { deleteTeacher } = await import('../../data/repositories/deletion-repository.js');
      if (await run(() => deleteTeacher(actor(), u.id), { success: tt('Teacher profile deleted. Remove the sign-in account in Firebase Console → Authentication.', 'শিক্ষকের প্রোফাইল মুছে গেছে। Firebase Console → Authentication থেকে লগইন অ্যাকাউন্ট মুছুন।') }) !== undefined) after();
    } });
    const edit = button(tt('Edit', 'সম্পাদনা'), { size: 'sm', onClick: () => editTeacher(u, after) });
    if (u.status === 'pending') return [edit, button(tt('Reject', 'প্রত্যাখ্যান'), { size: 'sm', onClick: set('rejected', { title: tt('Reject {n}?', '{n}-এর আবেদন প্রত্যাখ্যান করবেন?', { n: u.displayName }), body: tt('They will not be able to use the app. You can approve them later.', 'তিনি অ্যাপ ব্যবহার করতে পারবেন না। পরে অনুমোদন দেওয়া যাবে।'), confirmText: tt('Reject', 'প্রত্যাখ্যান'), danger: true }) }), approve];
    if (u.status === 'active') return [edit, del, button(tt('Disable', 'নিষ্ক্রিয় করুন'), { size: 'sm', onClick: set('disabled', { title: tt('Disable {n}?', '{n}-কে নিষ্ক্রিয় করবেন?', { n: u.displayName }), body: tt('They lose access immediately. Marks they entered are kept.', 'তিনি সঙ্গে সঙ্গে প্রবেশাধিকার হারাবেন। তাঁর দেওয়া নম্বর থাকবে।'), confirmText: tt('Disable', 'নিষ্ক্রিয় করুন'), danger: true }) })];
    return [edit, del, approve];
  }
  async function editTeacher(u, after) {
    const { getSetting } = await import('../../data/repositories/settings-repository.js');
    const { customFieldInput, readCustom } = await import('./student-form.js');
    const defs = ((await getSetting('teacherFields', { fresh: true })).fields ?? []).filter((d) => d.enabled !== false && d.showOnRecord !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const name = field({ label: tt('Full name', 'পূর্ণ নাম'), name: 'en', required: true, value: u.displayName });
    const phone = field({ label: tt('Mobile number', 'মোবাইল নম্বর'), name: 'ep', type: 'tel', value: u.phone ?? '' });
    const inputs = Object.fromEntries(defs.map((d) => [d.key, customFieldInput(d, u.customFields?.[d.key])]));
    const grantStudents = field({ label: tt('Can add and edit students (not delete)', 'শিক্ষার্থী যোগ ও সম্পাদনা করতে পারবেন (মুছতে নয়)'), name: 'gst', type: 'checkbox', value: u.grants?.students === true });
    openModal({ title: tt('Edit teacher', 'শিক্ষকের তথ্য সম্পাদনা'), content: h('div', {},
      h('div', { class: 'form-grid' }, name.el, phone.el, h('div', { class: 'field' }, h('span', { class: 'field__label' }, tt('Email (sign-in)', 'ইমেইল (লগইন)')), h('p', { class: 'muted' }, u.email))),
      defs.length ? h('div', { class: 'form-grid' }, defs.map((d) => inputs[d.key].el)) : h('p', { class: 'muted small' }, tt('Add more teacher fields in Settings → Teacher fields.', 'আরও তথ্যঘর যোগ করতে সেটিংস → শিক্ষকের তথ্যঘর।')),
      h('h3', { class: 'form-section' }, tt('Extra permission', 'বাড়তি অনুমতি')), grantStudents.el,
      h('p', { class: 'muted small' }, tt('Email and password belong to the teacher\'s sign-in account and cannot be changed here. The teacher can reset the password from the sign-in page.', 'ইমেইল ও পাসওয়ার্ড শিক্ষকের লগইন অ্যাকাউন্টের অংশ, এখানে বদলানো যায় না। শিক্ষক লগইন পেজ থেকে পাসওয়ার্ড বদলাতে পারবেন।'))),
    actions: [{ label: t('common.cancel'), onClick: () => true }, { label: t('common.save'), kind: 'primary', onClick: async () => {
      if (!name.value) { name.setError(tt('Required', 'আবশ্যক')); return false; }
      const custom = readCustom(defs, inputs);
      if (custom.errors.length) return false;
      const { updateTeacher } = await import('../../data/repositories/users-repository.js');
      const r = await run(() => updateTeacher(actor(), u.id, { displayName: name.value, phone: phone.value, customFields: { ...(u.customFields ?? {}), ...custom.values }, grants: { ...(u.grants ?? {}), students: grantStudents.value } }), { success: tt('Saved', 'সংরক্ষিত') });
      if (r !== undefined) after();
      return r !== undefined;
    } }] });
  }

  function create(after) {
    const f = { name: field({ label: tt('Full name', 'পূর্ণ নাম'), name: 'cn', required: true }), email: field({ label: tt('Email', 'ইমেইল'), name: 'ce', type: 'email', required: true }),
      phone: field({ label: tt('Mobile number', 'মোবাইল নম্বর'), name: 'cp', type: 'tel' }),
      pass: field({ label: tt('Temporary password', 'অস্থায়ী পাসওয়ার্ড'), name: 'cpw', type: 'text', required: backendKind() !== 'demo', value: crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12), hint: tt('A password-reset email is also sent so the teacher can choose their own.', 'শিক্ষক যাতে নিজের পাসওয়ার্ড দিতে পারেন সে জন্য পাসওয়ার্ড বদলের ইমেইলও পাঠানো হয়।') }) };
    openModal({ title: tt('Create teacher account', 'শিক্ষক অ্যাকাউন্ট তৈরি'), content: h('div', { class: 'form-grid' }, Object.values(f).map((x) => x.el)), actions: [
      { label: t('common.cancel'), onClick: () => true },
      { label: tt('Create account', 'অ্যাকাউন্ট তৈরি'), kind: 'primary', onClick: async () => {
        if (!f.name.value || !f.email.input.validity.valid || !f.email.value) { f.name.setError(f.name.value ? null : tt('Required', 'আবশ্যক')); f.email.setError(tt('Enter a valid email', 'সঠিক ইমেইল দিন')); return false; }
        try {
          const { adminCreateTeacher } = await import('../../auth/auth-service.js');
          const { saveCreatedTeacher } = await import('../../data/repositories/users-repository.js');
          const { uid, profile } = await adminCreateTeacher({ displayName: f.name.value, email: f.email.value, phone: f.phone.value, tempPassword: f.pass.value }, actor().id);
          await saveCreatedTeacher(actor(), uid, profile);
          toast(tt('Account created. Share the temporary password privately.', 'অ্যাকাউন্ট তৈরি হয়েছে। অস্থায়ী পাসওয়ার্ড গোপনে জানান।'), 'success'); after('active'); return true;
        } catch (e) { toast(e?.code === 'auth/email-already-in-use' ? tt('An account with this email already exists.', 'এই ইমেইলে আগেই অ্যাকাউন্ট আছে।') : friendlyError(e), 'error'); return false; }
      } }] });
  }
  paint();
  return root;
}
