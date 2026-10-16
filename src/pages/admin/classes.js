/** Academic years, classes, groups/streams and examination names. */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { pageHeader, button, tabs } from '../../ui/components/page.js';
import { asyncSection } from '../../ui/components/states.js';
import { dataTable } from '../../ui/components/data-table.js';
import { openModal } from '../../ui/components/modal.js';
import { field, checkGroup } from '../../ui/components/form.js';
import { actor, run } from '../_shared.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { C } from '../../data/paths.js';

export const title = 'nav.classes';

const KINDS = () => ({
  [C.YEARS]: { label: tt('Sessions', 'সেশন'), bilingual: false },
  [C.CLASSES]: { label: tt('Classes', 'শ্রেণি'), bilingual: true, groups: true },
  [C.GROUPS]: { label: tt('Groups / streams', 'বিভাগ'), bilingual: true },
  [C.EXAM_DEFS]: { label: tt('Examination names', 'পরীক্ষার নাম'), bilingual: true },
});

export function render() {
  const root = h('section', { class: 'page' });
  const paint = (active = C.CLASSES) => {
    const k = KINDS();
    const tabCtl = tabs(Object.entries(k).map(([id, cfg]) => ({ id, label: cfg.label, render: (p) => panel(p, id, cfg, () => paint(id)) })), { active });
    root.replaceChildren(pageHeader({ title: t('nav.classes'), subtitle: tt('Items in use are never deleted; mark them inactive to hide them from new result sheets.', 'ব্যবহৃত তথ্য মোছা হয় না; নতুন ফলাফল শিটে না দেখাতে নিষ্ক্রিয় করুন।') }), tabCtl.el);
  };
  function panel(p, kind, cfg, refresh) {
    asyncSection(p, async () => {
      const { listCatalogue } = await import('../../data/repositories/catalogue-repository.js');
      return { items: await listCatalogue(kind, { fresh: true }), groups: cfg.groups ? await listCatalogue(C.GROUPS) : [] };
    }, ({ items, groups }) => dataTable({ rows: items, searchKeys: [(r) => L(r.name ?? r.label)],
      toolbar: [button(tt('Add', 'যোগ করুন'), { kind: 'primary', size: 'sm', icon: 'plus', onClick: () => edit(kind, cfg, null, groups, refresh, items.length) })],
      columns: [
        { key: 'name', label: tt('Name', 'নাম'), render: (r) => (cfg.bilingual ? h('div', {}, L(r.name, 'en'), h('div', { class: 'muted small' }, L(r.name, 'bn'))) : r.label) },
        cfg.groups ? { key: 'g', label: tt('Groups', 'বিভাগ'), render: (r) => (r.groupIds ?? []).map((g) => L(groups.find((x) => x.id === g)?.name) || g).join(', ') } : null,
        kind === C.YEARS ? { key: 'active', label: tt('Current session', 'চলতি সেশন'), render: (r) => (r.active ? '✓' : '') } : { key: 'active', label: tt('Active', 'সক্রিয়'), render: (r) => (r.active === false ? tt('No', 'না') : tt('Yes', 'হ্যাঁ')) },
        { key: 'order', label: tt('Order', 'ক্রম'), sortable: true },
        { key: 'e', label: '', render: (r) => h('div', { class: 'row-actions' }, button(tt('Edit', 'সম্পাদনা'), { size: 'sm', onClick: () => edit(kind, cfg, r, groups, refresh) }),
          button(tt('Delete', 'মুছুন'), { size: 'sm', kind: 'danger-ghost', onClick: async () => {
            if (!(await confirmDialog({ title: tt('Delete {n}?', '{n} মুছবেন?', { n: L(r.name ?? r.label) }), body: tt('Only possible if no result sheet or student uses it.', 'কোনো ফলাফল শিট বা শিক্ষার্থী এটি ব্যবহার না করলেই মোছা যাবে।'), danger: true, confirmText: tt('Delete', 'মুছুন') }))) return;
            const { deleteCatalogueItem } = await import('../../data/repositories/deletion-repository.js');
            if (await run(() => deleteCatalogueItem(actor(), kind, r.id), { success: tt('Deleted', 'মুছে ফেলা হয়েছে') }) !== undefined) refresh();
          } })) },
      ].filter(Boolean) }).el);
  }
  function edit(kind, cfg, item, groups, refresh, count = 0) {
    const en = field({ label: cfg.bilingual ? tt('Name (English)', 'নাম (ইংরেজি)') : tt('Session (e.g. 2026-2027)', 'সেশন (যেমন ২০২৬-২০২৭)'), name: 'en', required: true, value: cfg.bilingual ? item?.name?.en ?? '' : item?.label ?? '' });
    const bn = cfg.bilingual ? field({ label: tt('Name (Bangla)', 'নাম (বাংলা)'), name: 'bn', value: item?.name?.bn ?? '' }) : null;
    const order = field({ label: tt('Display order', 'প্রদর্শনের ক্রম'), name: 'order', type: 'number', value: item?.order ?? (kind === C.YEARS ? new Date().getFullYear() : count + 1) });
    const active = field({ label: kind === C.YEARS ? tt('This is the current session', 'এটি চলতি সেশন') : tt('Active', 'সক্রিয়'), name: 'active', type: 'checkbox', value: item ? item.active !== false : true });
    const isGroup = kind === C.GROUPS;
    const rc = isGroup ? field({ label: tt('Subjects each student chooses', 'প্রত্যেক শিক্ষার্থী যতটি বিষয় বাছবে'), name: 'grc', type: 'number', value: item?.rules?.choiceCount ?? 0, attrs: { min: 0, max: 10 } }) : null;
    const r4 = isGroup ? field({ label: tt('Every student has a 4th subject', 'প্রত্যেকের ৪র্থ বিষয় আছে'), name: 'gr4', type: 'checkbox', value: item?.rules?.requiresFourth ?? false }) : null;
    const rp = isGroup ? field({ label: tt('Papers per student', 'প্রতি শিক্ষার্থীর পত্র সংখ্যা'), name: 'grp', type: 'number', value: item?.rules?.examsPerStudent ?? '', attrs: { min: 0, max: 30 }, hint: tt('Used to warn when a student has too many or too few papers. Leave empty to skip.', 'কোনো শিক্ষার্থীর পত্র কম-বেশি হলে সতর্ক করতে। খালি রাখলে যাচাই হবে না।') }) : null;
    const gsel = cfg.groups ? checkGroup({ label: tt('Groups in this class', 'এই শ্রেণির বিভাগ'), name: 'cg', options: groups.map((g) => ({ value: g.id, label: L(g.name) })), values: item?.groupIds ?? [] }) : null;
    openModal({ title: item ? tt('Edit', 'সম্পাদনা') : tt('Add', 'যোগ করুন'), content: h('div', { class: 'form-grid' }, en.el, bn?.el, order.el, active.el, gsel?.el, rc?.el, r4?.el, rp?.el), actions: [
      { label: t('common.cancel'), onClick: () => true },
      { label: t('common.save'), kind: 'primary', onClick: async () => {
        if (!en.value) { en.setError(tt('Required', 'আবশ্যক')); return false; }
        if (kind === C.YEARS && !/^\d{4}(-\d{2,4})?$/.test(en.value)) { en.setError(tt('Use a session such as 2026-2027 (or a year such as 2026)', '২০২৬-২০২৭ এর মতো সেশন (বা ২০২৬ এর মতো বছর) লিখুন')); return false; }
        const data = cfg.bilingual ? { name: { en: en.value, bn: bn.value || null }, order: Number(order.value) || 0, active: active.value } : { label: en.value, order: Number(order.value) || 0, active: active.value };
        if (gsel) data.groupIds = gsel.value;
        if (isGroup) data.rules = { choiceCount: Number(rc.value) || 0, requiresFourth: r4.value, examsPerStudent: rp.value === '' ? null : Number(rp.value) };
        const { saveCatalogueItem } = await import('../../data/repositories/catalogue-repository.js');
        const id = item?.id ?? (kind === C.YEARS ? en.value : null);
        const r = await run(() => saveCatalogueItem(actor(), kind, id, data), { success: tt('Saved', 'সংরক্ষিত') });
        if (r !== undefined) refresh();
        return r !== undefined;
      } }] });
  }
  paint();
  return root;
}
