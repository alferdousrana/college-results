import { h } from '../../core/dom.js';
import { tt } from '../../i18n/index.js';
import { field } from '../../ui/components/form.js';
import { loadingState } from '../../ui/components/states.js';
import { actor } from '../../pages/_shared.js';
import { saveBar } from './_save-bar.js';

export async function render(el) {
  el.append(loadingState());
  const repo = await import('../../data/repositories/settings-repository.js');
  const r = await repo.getSetting('retention', { fresh: true });
  const pub = field({ label: tt('Keep results in public lookup for (years)', 'পাবলিক অনুসন্ধানে ফলাফল রাখুন (বছর)'), name: 'rp', type: 'number', value: r.publicLookupYears, attrs: { min: 5, max: 50 } });
  const internal = field({ label: tt('Keep results for staff for (years)', 'কর্মীদের জন্য ফলাফল রাখুন (বছর)'), name: 'ri', type: 'number', value: r.keepInternalYears, attrs: { min: 5, max: 100 } });
  const bar = saveBar({ onSave: async () => {
    const a = Number(pub.value), b = Number(internal.value);
    if (!(a >= 5)) { pub.setError(tt('At least 5 years', 'অন্তত ৫ বছর')); return false; }
    if (!(b >= a)) { internal.setError(tt('Must be at least the public period', 'পাবলিক সময়ের সমান বা বেশি হতে হবে')); return false; }
    await repo.saveSetting(actor(), 'retention', { publicLookupYears: a, keepInternalYears: b }, r.revision ?? 0); r.revision = (r.revision ?? 0) + 1;
  } });
  el.replaceChildren(h('div', { class: 'form-grid', oninput: bar.markDirty }, pub.el, internal.el),
    h('p', { class: 'muted small' }, tt('Nothing is deleted automatically: the app has no server process that could do it safely on the free plan. When an examination is older than the public period, open it and choose "Remove from public lookup". Staff copies stay available.',
      'কিছুই স্বয়ংক্রিয়ভাবে মোছে না: বিনামূল্যের প্ল্যানে নিরাপদে তা করার মতো সার্ভার প্রক্রিয়া নেই। কোনো পরীক্ষা পাবলিক সময়ের চেয়ে পুরোনো হলে সেটি খুলে "পাবলিক অনুসন্ধান থেকে সরান" বাছুন। কর্মীদের কপি থাকবে।')), bar.el);
  return bar.dispose;
}
