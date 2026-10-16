import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { openModal } from '../../ui/components/modal.js';
import { toast } from '../../ui/components/toast.js';
import { button } from '../../ui/components/page.js';
import { actor, friendlyError } from '../../pages/_shared.js';
import { C } from '../../data/paths.js';

const COLL_LABEL = () => ({ [C.YEARS]: tt('Session', 'সেশন'), [C.CLASSES]: tt('Class', 'শ্রেণি'), [C.GROUPS]: tt('Group', 'বিভাগ'), [C.EXAM_DEFS]: tt('Examination', 'পরীক্ষা'), [C.SUBJECTS]: tt('Subject', 'বিষয়') });

export function render(el) {
  el.append(
    h('ul', { class: 'link-list' },
      h('li', {}, h('a', { href: '#/admin/classes' }, t('nav.classes')), ' — ', tt('sessions, classes, groups (with their subject rules) and examination names', 'সেশন, শ্রেণি, বিভাগ (বিষয়ের নিয়মসহ) ও পরীক্ষার নাম')),
      h('li', {}, h('a', { href: '#/admin/subjects' }, t('nav.subjects')), ' — ', tt('subjects, their parts, combined papers and role in each group', 'বিষয়, অংশ, যৌথ পত্র ও প্রতিটি বিভাগে ভূমিকা')),
      h('li', {}, h('a', { href: '#/admin/assignments' }, t('nav.assignments')), ' — ', tt('which teacher teaches which subject', 'কোন শিক্ষক কোন বিষয় পড়ান'))),
    h('h3', { class: 'form-section' }, tt('Starter data', 'প্রাথমিক তথ্য')),
    h('p', {}, tt("Adds the college's sessions, classes, the three groups with their subject rules, examination names and all 26 subjects (Bangla and English 1st/2nd papers combined), plus the college name and address if they are still empty.",
      'কলেজের সেশন, শ্রেণি, তিনটি বিভাগ ও তাদের বিষয়ের নিয়ম, পরীক্ষার নাম এবং ২৬টি বিষয় (বাংলা ও ইংরেজি ১ম/২য় পত্র যৌথভাবে) যোগ করে; কলেজের নাম ও ঠিকানা খালি থাকলে সেগুলোও।')),
    h('p', { class: 'muted small' }, tt('Mark distributions and pass marks are starting values. Check every subject afterwards on the Subjects page.', 'নম্বর বণ্টন ও পাস নম্বর প্রাথমিক মান। পরে বিষয় পৃষ্ঠায় প্রতিটি বিষয় যাচাই করুন।')),
    h('div', { class: 'row-actions' },
      button(tt('Load starter data…', 'প্রাথমিক তথ্য যোগ করুন…'), { kind: 'primary', onClick: preview }),
      button(tt('Check and repair subject links', 'বিষয়ের সংযোগ যাচাই ও মেরামত'), { onClick: async () => {
        try {
          const { repairReferences } = await import('../../data/repositories/starter-repository.js');
          const n = await repairReferences(actor());
          toast(n ? tt('{n} item(s) pointed at a missing class or group and were fixed.', '{n}টি আইটেম অনুপস্থিত শ্রেণি বা বিভাগ দেখাচ্ছিল, ঠিক করা হয়েছে।', { n }) : tt('Everything is linked correctly.', 'সব সংযোগ ঠিক আছে।'), 'success');
        } catch (e) { toast(friendlyError(e), 'error'); }
      } })));
}

async function preview() {
  try {
    const [{ planStarterData, applyStarterData }, dataMod] = await Promise.all([import('../../data/repositories/starter-repository.js'), import('../../../config/starter-data.json')]);
    const data = dataMod.default;
    const plan = await planStarterData(data);
    const fresh = plan.filter((p) => !p.match), matched = plan.filter((p) => p.match);
    const upd = h('input', { type: 'checkbox', class: 'checkbox', id: 'starter-upd', checked: true });
    const labels = COLL_LABEL();
    openModal({ title: tt('Load starter data', 'প্রাথমিক তথ্য যোগ'), size: 'l', content: h('div', {},
      h('p', {}, tt('{a} new item(s) will be added. {b} already exist.', '{a}টি নতুন যোগ হবে। {b}টি আগে থেকেই আছে।', { a: fresh.length, b: matched.length })),
      h('div', { class: 'table-scroll' }, h('table', { class: 'mini-table' }, h('tbody', {}, plan.map((p) => h('tr', {}, h('td', {}, labels[p.coll]), h('td', {}, L(p.item.name ?? p.item.label)),
        h('td', { class: p.match ? 'muted' : 'text-good' }, p.match ? tt('exists: {n}', 'আছে: {n}', { n: L(p.match.name ?? p.match.label) }) : tt('new', 'নতুন'))))))),
      h('div', { class: 'field field--check' }, upd, h('label', { for: 'starter-upd' }, tt('For items that already exist, add the group rules, subject roles and combined-paper settings (names and marks are not changed)', 'যেগুলো আগে থেকেই আছে, সেগুলোতে বিভাগের নিয়ম, বিষয়ের ভূমিকা ও যৌথ পত্রের তথ্য যোগ করুন (নাম ও নম্বর বদলাবে না)')))),
      actions: [{ label: t('common.cancel'), onClick: () => true }, { label: tt('Add starter data', 'যোগ করুন'), kind: 'primary', onClick: async () => {
        try {
          const r = await applyStarterData(actor(), data, plan, { updateMatching: upd.checked });
          toast(tt('Added {a}, updated {b}, skipped {c}, repaired {d}.', 'যোগ {a}, হালনাগাদ {b}, বাদ {c}, মেরামত {d}।', { a: r.created, b: r.updated, c: r.skipped, d: r.repaired }), 'success');
          return true;
        } catch (e) { toast(friendlyError(e), 'error'); return false; }
      } }] });
  } catch (e) { toast(friendlyError(e), 'error'); }
}
