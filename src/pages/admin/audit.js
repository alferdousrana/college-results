/** Audit log viewer (read-only; entries cannot be edited or deleted by anyone through the app or rules). */
import { h } from '../../core/dom.js';
import { t, tt } from '../../i18n/index.js';
import { pageHeader } from '../../ui/components/page.js';
import { loadingState, errorState } from '../../ui/components/states.js';
import { dataTable } from '../../ui/components/data-table.js';
import { selectField } from '../../ui/components/form.js';
import { featureGate } from '../../ui/components/feature-gate.js';
import { friendlyError } from '../_shared.js';
import { fmtDate } from '../../ui/format.js';

export const title = 'nav.audit';

const LABELS = () => ({
  teacher_approved: tt('Teacher approved', 'শিক্ষক অনুমোদিত'), teacher_rejected: tt('Teacher rejected', 'শিক্ষক প্রত্যাখ্যাত'), teacher_disabled: tt('Teacher disabled', 'শিক্ষক নিষ্ক্রিয়'),
  teacher_created: tt('Teacher account created', 'শিক্ষক অ্যাকাউন্ট তৈরি'), role_changed: tt('Role changed', 'ভূমিকা পরিবর্তন'), assignment_changed: tt('Assignment changed', 'দায়িত্ব পরিবর্তন'),
  session_created: tt('Result sheet created', 'ফলাফল শিট তৈরি'), session_updated: tt('Result sheet edited', 'ফলাফল শিট সম্পাদনা'), session_shared: tt('Shared with teachers', 'শিক্ষকদের সাথে শেয়ার'),
  session_state_changed: tt('Status changed', 'অবস্থা পরিবর্তন'), mark_created: tt('Mark entered', 'নম্বর দেওয়া'), mark_changed: tt('Mark changed', 'নম্বর পরিবর্তন'),
  absence_changed: tt('Absence changed', 'অনুপস্থিতি পরিবর্তন'), subject_submitted: tt('Subject submitted', 'বিষয় জমা'), subject_reopened: tt('Subject reopened', 'বিষয় আবার খোলা'),
  results_calculated: tt('Results calculated', 'ফলাফল হিসাব'), result_published: tt('Results published', 'ফলাফল প্রকাশ'), result_correction_started: tt('Correction started', 'সংশোধন শুরু'),
  public_lookup_withdrawn: tt('Removed from public lookup', 'পাবলিক অনুসন্ধান থেকে সরানো'), settings_changed: tt('Settings changed', 'সেটিংস পরিবর্তন'),
  catalogue_changed: tt('Class/subject list changed', 'শ্রেণি/বিষয় তালিকা পরিবর্তন'), student_created: tt('Student added', 'শিক্ষার্থী যোগ'), student_updated: tt('Student edited', 'শিক্ষার্থী সম্পাদনা'),
  student_status_changed: tt('Student status changed', 'শিক্ষার্থীর অবস্থা পরিবর্তন'), students_imported: tt('Students imported', 'শিক্ষার্থী ইমপোর্ট'), bootstrap_super_admin: tt('Administrator set up', 'প্রশাসক নির্ধারণ'),
  session_deleted: tt('Result sheet deleted', 'ফলাফল শিট মোছা'), routine_saved: tt('Routine saved', 'সময়সূচি সংরক্ষণ'), routine_deleted: tt('Routine deleted', 'সময়সূচি মোছা'), public_lookup_updated: tt('Public lookup updated', 'পাবলিক অনুসন্ধান হালনাগাদ'),
  staff_created: tt('Staff added', 'কর্মচারী যোগ'), staff_updated: tt('Staff edited', 'কর্মচারী সম্পাদনা'), staff_deleted: tt('Staff deleted', 'কর্মচারী মোছা'), teacher_updated: tt('Teacher edited', 'শিক্ষক সম্পাদনা'), student_deleted: tt('Student deleted', 'শিক্ষার্থী মোছা'),
  teacher_deleted: tt('Teacher deleted', 'শিক্ষক মোছা'), teacher_updated: tt('Teacher details changed', 'শিক্ষকের তথ্য পরিবর্তন'), catalogue_deleted: tt('Class/subject item deleted', 'শ্রেণি/বিষয় মোছা'),
});

export function render() {
  const root = h('section', { class: 'page' }, pageHeader({ title: t('nav.audit'), subtitle: tt('Who changed what and when. Entries are added automatically and cannot be edited or deleted.', 'কে কখন কী বদলেছেন। এন্ট্রি স্বয়ংক্রিয়ভাবে যোগ হয় এবং সম্পাদনা বা মোছা যায় না।') }));
  const body = h('div', {}, loadingState());
  root.append(featureGate('audit_log_viewer', () => body));
  (async () => {
    const { listAudit } = await import('../../data/repositories/audit-repository.js');
    const labels = LABELS();
    const actionF = selectField({ label: tt('Action', 'কাজ'), name: 'aa', options: [{ value: '', label: tt('All actions', 'সব কাজ') }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))] });
    let cursor = null;
    const describe = (r) => {
      const parts = [];
      if (r.before?.state || r.after?.state) parts.push(`${r.before?.state ?? ''} → ${r.after?.state ?? ''}`);
      if (r.after?.components) parts.push(`${JSON.stringify(r.before?.components ?? {})} → ${JSON.stringify(r.after.components)}${r.after.absent ? ' (absent)' : ''}`);
      if (r.after?.status) parts.push(`${r.before?.status ?? ''} → ${r.after.status}`);
      if (r.reason) parts.push(`${tt('Reason', 'কারণ')}: ${r.reason}`);
      return parts.join(' · ');
    };
    const table = dataTable({ rows: [], pageSize: 50, searchKeys: ['actorName', 'targetPath', 'reason'],
      onLoadMore: async () => { const page = await listAudit({ action: actionF.value || null, limit: 50, after: cursor }); cursor = page.cursor; table.appendRows(page.items, { hasMore: Boolean(cursor) }); return { hasMore: Boolean(cursor) }; },
      columns: [
        { key: 'at', label: tt('When', 'কখন'), render: (r) => fmtDate(r.at, { time: true }) },
        { key: 'actorName', label: tt('Who', 'কে'), render: (r) => `${r.actorName ?? r.actorUid} (${r.actorRole})` },
        { key: 'action', label: tt('What', 'কী'), render: (r) => labels[r.action] ?? r.action },
        { key: 'targetPath', label: tt('Record', 'রেকর্ড'), render: (r) => h('code', { class: 'small' }, r.targetPath) },
        { key: 'detail', label: tt('Details', 'বিস্তারিত'), render: (r) => h('span', { class: 'small' }, describe(r)) },
      ] });
    const load = async () => { const page = await listAudit({ action: actionF.value || null, limit: 50 }); cursor = page.cursor; table.setRows(page.items, { more: Boolean(cursor) }); };
    actionF.input.addEventListener('change', () => load().catch((e) => body.replaceChildren(errorState({ message: friendlyError(e) }))));
    body.replaceChildren(h('div', { class: 'filter-bar' }, actionF.el), table.el);
    await load();
  })().catch((e) => body.replaceChildren(errorState({ message: friendlyError(e) })));
  return root;
}
