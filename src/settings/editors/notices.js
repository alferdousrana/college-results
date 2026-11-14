/** Notice board for the public page: text notices with an optional PDF or link. */
import { h } from '../../core/dom.js';
import { t, tt, L, formatNumber } from '../../i18n/index.js';
import { field } from '../../ui/components/form.js';
import { loadingState, errorState } from '../../ui/components/states.js';
import { openModal } from '../../ui/components/modal.js';
import { confirmDialog } from '../../ui/components/dialog.js';
import { toast } from '../../ui/components/toast.js';
import { actor, run, friendlyError } from '../../pages/_shared.js';

const kb = (n) => `${formatNumber(Math.max(1, Math.round((n ?? 0) / 1024)))} KB`;

export async function render(el) {
  el.append(loadingState());
  const repo = await import('../../data/repositories/notices-repository.js');
  const list = h('div', { class: 'notice-admin' });

  async function paint() {
    let rows;
    try { rows = await repo.listAllNotices(); } catch (e) { list.replaceChildren(errorState({ message: friendlyError(e) })); return; }
    list.replaceChildren(rows.length
      ? h('ul', { class: 'notice-admin__list' }, rows.map((n) => h('li', { class: 'notice-admin__item' },
          h('div', { class: 'notice-admin__main' },
            h('strong', {}, L(n.title) || tt('(no title)', '(শিরোনাম নেই)')),
            h('div', { class: 'muted small' }, [n.date, n.file ? `PDF ${kb(n.file.size)}` : null, n.link ? tt('link', 'লিংক') : null].filter(Boolean).join(' · ')),
            h('div', { class: 'notice-admin__badges' },
              n.published !== false ? h('span', { class: 'badge badge--good' }, tt('On the public page', 'পাবলিক পেজে আছে')) : h('span', { class: 'badge badge--neutral' }, tt('Hidden', 'লুকানো')),
              n.pinned ? h('span', { class: 'badge badge--warn' }, tt('Pinned to the top', 'উপরে আটকানো')) : null)),
          h('div', { class: 'row-actions' },
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => edit(n) }, tt('Edit', 'সম্পাদনা')),
            h('button', { class: 'btn btn--danger-ghost btn--sm', type: 'button', onclick: async () => {
              if (!(await confirmDialog({ title: tt('Delete this notice?', 'নোটিশটি মুছবেন?'), body: L(n.title), danger: true, confirmText: tt('Delete', 'মুছুন') }))) return;
              if (await run(() => repo.deleteNotice(actor(), n.id), { success: tt('Notice deleted', 'নোটিশ মুছে ফেলা হয়েছে') }) !== undefined) paint();
            } }, tt('Delete', 'মুছুন'))))))
      : h('p', { class: 'muted' }, tt('No notices yet. Add the first one.', 'এখনো কোনো নোটিশ নেই। প্রথমটি যোগ করুন।')));
  }

  function edit(n = null) {
    const today = new Date().toISOString().slice(0, 10);
    const f = {
      tBn: field({ label: tt('Title (Bangla)', 'শিরোনাম (বাংলা)'), name: 'ntbn', value: n?.title?.bn ?? '' }),
      tEn: field({ label: tt('Title (English)', 'শিরোনাম (ইংরেজি)'), name: 'nten', value: n?.title?.en ?? '', hint: tt('At least one title. The other language falls back to it.', 'অন্তত একটি শিরোনাম দিন। অন্য ভাষায় এটিই দেখাবে।') }),
      date: field({ label: tt('Date', 'তারিখ'), name: 'ndate', type: 'date', value: n?.date ?? today, required: true }),
      link: field({ label: tt('Link (optional)', 'লিংক (ঐচ্ছিক)'), name: 'nlink', type: 'url', value: n?.link ?? '', hint: tt('For example a Google Drive link to a large PDF.', 'যেমন বড় PDF-এর Google Drive লিংক।') }),
      bBn: field({ label: tt('Text (Bangla)', 'বিস্তারিত (বাংলা)'), name: 'nbbn', type: 'textarea', value: n?.body?.bn ?? '' }),
      bEn: field({ label: tt('Text (English)', 'বিস্তারিত (ইংরেজি)'), name: 'nben', type: 'textarea', value: n?.body?.en ?? '' }),
      pinned: field({ label: tt('Pin to the top', 'উপরে আটকে রাখুন'), name: 'npin', type: 'checkbox', value: n?.pinned === true }),
      published: field({ label: tt('Show on the public page', 'পাবলিক পেজে দেখান'), name: 'npub', type: 'checkbox', value: n ? n.published !== false : true }),
    };
    // PDF: undefined = unchanged, null = remove, object = new file.
    let pdf;
    const fileInfo = h('p', { class: 'muted small' });
    const showInfo = () => {
      const cur = pdf === undefined ? n?.file : pdf;
      fileInfo.textContent = cur ? tt('Attached: {f} ({s})', 'সংযুক্ত: {f} ({s})', { f: cur.name, s: kb(cur.size) }) : tt('No PDF attached.', 'কোনো PDF সংযুক্ত নেই।');
      removeBtn.hidden = !cur;
    };
    const input = h('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'input', onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.type && file.type !== 'application/pdf') { toast(tt('Choose a PDF file.', 'একটি PDF ফাইল বাছাই করুন।'), 'error'); e.target.value = ''; return; }
      if (file.size > repo.MAX_PDF_BYTES) {
        toast(tt('The PDF is {s}; the largest allowed is {m}. Make it smaller or give a Google Drive link instead.', 'PDF-টি {s}; সর্বোচ্চ {m} দেওয়া যায়। ছোট করুন বা Google Drive লিংক দিন।', { s: kb(file.size), m: kb(repo.MAX_PDF_BYTES) }), 'error');
        e.target.value = ''; return;
      }
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^;]*;/, 'data:application/pdf;')); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
      pdf = { data, name: file.name, size: file.size };
      showInfo();
    } });
    const removeBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { pdf = null; input.value = ''; showInfo(); } }, tt('Remove PDF', 'PDF সরান'));
    showInfo();
    openModal({ title: n ? tt('Edit notice', 'নোটিশ সম্পাদনা') : tt('New notice', 'নতুন নোটিশ'), size: 'l',
      content: h('div', { class: 'form-grid' }, f.tBn.el, f.tEn.el, f.date.el, f.link.el, f.bBn.el, f.bEn.el,
        h('div', { class: 'field span-all' }, h('span', { class: 'field__label' }, tt('PDF file (optional, up to {m})', 'PDF ফাইল (ঐচ্ছিক, সর্বোচ্চ {m})', { m: kb(repo.MAX_PDF_BYTES) })), input, h('div', { class: 'row-actions' }, fileInfo, removeBtn)),
        f.pinned.el, f.published.el),
      actions: [{ label: t('common.cancel'), onClick: () => true }, { label: t('common.save'), kind: 'primary', onClick: async () => {
        if (!f.tBn.value && !f.tEn.value) { f.tBn.setError(tt('Give the notice a title.', 'নোটিশের শিরোনাম দিন।')); return false; }
        if (f.link.value && !/^https?:\/\/\S+$/i.test(f.link.value)) { f.link.setError(tt('The link must start with https://', 'লিংক https:// দিয়ে শুরু হতে হবে')); return false; }
        const ok = await run(() => repo.saveNotice(actor(), n?.id ?? null, {
          title: { en: f.tEn.value, bn: f.tBn.value }, body: { en: f.bEn.value, bn: f.bBn.value },
          date: f.date.value || today, link: f.link.value || null, pinned: f.pinned.value, published: f.published.value }, pdf), { success: tt('Notice saved', 'নোটিশ সংরক্ষিত') });
        if (ok !== undefined) paint();
        return ok !== undefined;
      } }] });
  }

  el.replaceChildren(
    h('p', { class: 'muted' }, tt('Notices appear on the public page, newest first; pinned notices stay on top. A PDF can be up to {m}; for a larger file give a link.', 'নোটিশ পাবলিক পেজে নতুনটি আগে দেখায়; আটকানো নোটিশ সবার উপরে থাকে। PDF সর্বোচ্চ {m}; বড় ফাইলের জন্য লিংক দিন।', { m: kb(repo.MAX_PDF_BYTES) })),
    h('p', {}, h('button', { class: 'btn btn--primary', type: 'button', onclick: () => edit() }, tt('Add notice', 'নোটিশ যোগ করুন'))),
    list);
  await paint();
  return () => {};
}
