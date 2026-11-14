/**
 * Notice board on the public page.
 *   notices/{id}     { title{en,bn}, body{en,bn}, date 'YYYY-MM-DD', link|null, pinned, published,
 *                      file: { name, size } | null, createdAt, updatedAt }
 *   noticeFiles/{id} { data: 'data:application/pdf;base64,…', name, size }  — read only when opened.
 * The free Firebase plan has no file storage, so a PDF is kept inside a Firestore document
 * (limit about 1 MB, so up to MAX_PDF_BYTES). Larger files can be given as a link instead.
 * Rules: everyone reads published notices (queries must filter published == true); admins write.
 */
import { getBackend } from '../backend/index.js';
import { C } from '../paths.js';
import { serverTime, toMillis } from '../field-ops.js';
import { addAudit } from './audit-repository.js';

export const MAX_PDF_BYTES = 700 * 1024;

/** Pinned notices first, then the newest date. */
export function sortNotices(list) {
  return [...list].sort((a, b) => (b.pinned === true) - (a.pinned === true)
    || String(b.date ?? '').localeCompare(String(a.date ?? ''))
    || (toMillis(b.createdAt) ?? 0) - (toMillis(a.createdAt) ?? 0));
}

/** Notices visible on the public page (no account needed). */
export async function listPublicNotices(max = 100) {
  const b = await getBackend();
  return sortNotices((await b.list(C.NOTICES, { where: [['published', '==', true]], limit: max })).items);
}

/** Every notice, including hidden ones (admins). */
export async function listAllNotices() {
  const b = await getBackend();
  return sortNotices((await b.list(C.NOTICES, { limit: 500 })).items);
}

export async function getNoticeFile(id) {
  const b = await getBackend();
  return b.get(`${C.NOTICE_FILES}/${id}`);
}

/**
 * Creates or updates a notice. `pdf`: undefined = keep the current file, null = remove it,
 * { data, name, size } = replace it.
 */
export async function saveNotice(actor, id, data, pdf = undefined) {
  if (!data.title?.en?.trim() && !data.title?.bn?.trim()) throw new Error('Give the notice a title.');
  if (data.link && !/^https?:\/\/\S+$/i.test(data.link)) throw new Error('The link must start with https://');
  if (pdf && pdf.size > MAX_PDF_BYTES) throw new Error(`The PDF is too large (largest ${Math.round(MAX_PDF_BYTES / 1024)} KB). Share it as a Google Drive link instead.`);
  if (pdf && !String(pdf.data).startsWith('data:application/pdf;base64,')) throw new Error('Only PDF files can be attached.');
  const b = await getBackend();
  const docId = id ?? b.newId(C.NOTICES);
  const before = id ? await b.get(`${C.NOTICES}/${id}`) : null;
  const file = pdf === undefined ? (before?.file ?? null) : pdf ? { name: pdf.name, size: pdf.size } : null;
  const batch = b.batch();
  batch.set(`${C.NOTICES}/${docId}`, {
    title: { en: data.title?.en?.trim() ?? '', bn: data.title?.bn?.trim() ?? '' },
    body: { en: data.body?.en?.trim() ?? '', bn: data.body?.bn?.trim() ?? '' },
    date: data.date || new Date().toISOString().slice(0, 10), link: data.link?.trim() || null,
    pinned: Boolean(data.pinned), published: data.published !== false, file,
    updatedAt: serverTime(), ...(id ? {} : { createdAt: serverTime() }),
  }, { merge: true });
  if (pdf) batch.set(`${C.NOTICE_FILES}/${docId}`, { data: pdf.data, name: pdf.name, size: pdf.size, updatedAt: serverTime() });
  else if (pdf === null && before?.file) batch.delete(`${C.NOTICE_FILES}/${docId}`);
  addAudit(b, batch, { action: id ? 'notice_updated' : 'notice_created', actor, targetPath: `${C.NOTICES}/${docId}`, after: { title: data.title?.en || data.title?.bn || '', published: data.published !== false, file: file?.name ?? null } });
  await batch.commit();
  return docId;
}

export async function deleteNotice(actor, id) {
  const b = await getBackend();
  const before = await b.get(`${C.NOTICES}/${id}`);
  const batch = b.batch();
  batch.delete(`${C.NOTICES}/${id}`);
  if (before?.file) batch.delete(`${C.NOTICE_FILES}/${id}`);
  addAudit(b, batch, { action: 'notice_deleted', actor, targetPath: `${C.NOTICES}/${id}`, before: { title: before?.title?.en || before?.title?.bn || '' } });
  await batch.commit();
}

/** Opens a stored PDF in a new tab (browsers block opening data: URLs directly). */
export function pdfBlobUrl(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] ?? '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}
