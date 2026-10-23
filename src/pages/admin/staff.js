/** Non-teaching staff (কর্মচারী): list, add, edit, deactivate, delete. */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button } from '../../ui/components/page.js';
import { asyncSection } from '../../ui/components/states.js';
import { dataTable } from '../../ui/components/data-table.js';
import { openModal } from '../../ui/components/modal.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { field, selectField } from '../../ui/components/form.js';
import { actor, run } from '../_shared.js';
import { fmtDate } from '../../ui/format.js';

export const title = 'nav.staff';

export function render() {
  const root = h('section', { class: 'page' });
  const body = h('div');
  const load = () => asyncSection(body, async () => (await import('../../data/repositories/staff-repository.js')).listStaff(), (rows) => dataTable({
    rows, pageSize: 50, searchKeys: [(r) => L(r.name, 'en'), (r) => L(r.name, 'bn'), (r) => L(r.designation), 'phone'],
    filters: [{ key: 'status', label: tt('Status', 'অবস্থা'), options: [{ value: 'active', label: tt('Active', 'সক্রিয়') }, { value: 'inactive', label: tt('Inactive', 'নিষ্ক্রিয়') }] }],
    empty: tt('No staff added yet.', 'এখনো কোনো কর্মচারী যোগ করা হয়নি।'),
    columns: [
      { key: 'name', label: tt('Name', 'নাম'), sort: (r) => L(r.name), render: (r) => h('div', {}, h('strong', {}, L(r.name, 'en')), r.name?.bn ? h('div', { class: 'muted small' }, r.name.bn) : null) },
      { key: 'designation', label: tt('Designation', 'পদবি'), render: (r) => L(r.designation) },
      { key: 'phone', label: tt('Mobile', 'মোবাইল') },
      { key: 'joiningDate', label: tt('Joined', 'যোগদান'), render: (r) => (r.joiningDate ? fmtDate(r.joiningDate) : '') },
      { key: 'status', label: tt('Status', 'অবস্থা'), render: (r) => h('span', { class: `badge badge--${r.status === 'active' ? 'good' : 'neutral'}` }, r.status === 'active' ? tt('Active', 'সক্রিয়') : tt('Inactive', 'নিষ্ক্রিয়')) },
      { key: 'a', label: '', render: (r) => h('div', { class: 'row-actions' }, button(tt('Edit', 'সম্পাদনা'), { size: 'sm', onClick: () => edit(r, rows.length) }),
        button(tt('Delete', 'মুছুন'), { size: 'sm', kind: 'danger-ghost', onClick: async () => {
          if (!(await confirmDialog({ title: tt('Delete {n}?', '{n}-কে মুছবেন?', { n: L(r.name) }), body: tt('The record is removed. To keep it, mark the person inactive instead.', 'রেকর্ড মুছে যাবে। রাখতে চাইলে নিষ্ক্রিয় করুন।'), danger: true, confirmText: tt('Delete', 'মুছুন') }))) return;
          const { deleteStaff } = await import('../../data/repositories/staff-repository.js');
          if (await run(() => deleteStaff(actor(), r.id), { success: tt('Deleted', 'মুছে ফেলা হয়েছে') }) !== undefined) load();
        } })) },
    ] }).el);
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
