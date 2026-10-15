/**
 * Image picker for logo / signatures / seal. Validates type and size, downsizes with a canvas,
 * and returns a compact data URL (stored in institution/public; see docs/DECISIONS.md #13).
 */
import { h } from '../../core/dom.js';
import { tt } from '../../i18n/index.js';

export const IMAGE_RULES = Object.freeze({ types: ['image/png', 'image/jpeg', 'image/webp'], maxInputBytes: 3_000_000, maxOutputBytes: 180_000 });

export async function processImage(file, { maxWidth = 600, maxHeight = 300 } = {}) {
  if (!IMAGE_RULES.types.includes(file.type)) throw new Error(tt('Use a PNG, JPEG or WebP image.', 'PNG, JPEG বা WebP ছবি ব্যবহার করুন।'));
  if (file.size > IMAGE_RULES.maxInputBytes) throw new Error(tt('The image is larger than 3 MB.', 'ছবিটি ৩ এমবি-র বেশি।'));
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.92, 0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL('image/webp', q);
    const out = url.startsWith('data:image/webp') ? url : canvas.toDataURL('image/png');
    if (out.length * 0.75 <= IMAGE_RULES.maxOutputBytes) return out;
  }
  throw new Error(tt('The image is still too large after compression. Use a smaller image.', 'সংকোচনের পরও ছবিটি বড়। ছোট ছবি ব্যবহার করুন।'));
}

/** Preview + Choose/Replace/Remove controls. onChange(dataUrl|null). */
export function imageInput({ label, value = null, onChange, maxWidth, maxHeight }) {
  const preview = h('div', { class: 'image-input__preview' });
  const err = h('p', { class: 'field__error', hidden: true });
  const file = h('input', { type: 'file', accept: IMAGE_RULES.types.join(','), class: 'sr-only', 'aria-label': label });
  const choose = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => file.click() });
  const remove = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { value = null; onChange(null); paint(); } }, tt('Remove', 'মুছুন'));
  const paint = () => {
    preview.replaceChildren(value ? h('img', { src: value, alt: label }) : h('span', { class: 'muted' }, tt('No image', 'ছবি নেই')));
    choose.textContent = value ? tt('Replace', 'বদলান') : tt('Choose image', 'ছবি বাছুন');
    remove.hidden = !value;
  };
  file.addEventListener('change', async () => {
    err.hidden = true;
    const f = file.files[0]; file.value = '';
    if (!f) return;
    try { value = await processImage(f, { maxWidth, maxHeight }); onChange(value); paint(); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
  });
  paint();
  return h('div', { class: 'field image-input' }, h('span', { class: 'field__label' }, label), preview, h('div', { class: 'row-actions' }, choose, remove), file, err);
}
