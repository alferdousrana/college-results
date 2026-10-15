/**
 * Public (no-account) result lookup.
 * publicExamIndex/{publicId}: exam labels + frozen institution/print snapshot.
 * publicResults/{sha256(publicId|roll|verifier)}: sanitized marksheet view model.
 * Rules allow `get` by id but deny `list`, so results cannot be queried or dumped.
 */
import { getBackend } from '../backend/index.js';
import { C } from '../paths.js';

export async function listPublishedExams() {
  const b = await getBackend();
  return (await b.list(C.PUBLIC_INDEX, { orderBy: [['yearLabel', 'desc'], ['publishedAt', 'desc']], limit: 100 })).items;
}

export async function lookupResultId(publicId, roll, verifier = '') {
  const norm = `${publicId}|${String(roll).trim().replace(/^0+(?=\d)/, '')}|${String(verifier ?? '').trim().toLowerCase()}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Returns { exam, result } or null. Every failure looks the same to the visitor. */
export async function fetchPublicResult(publicId, roll, verifier) {
  const b = await getBackend();
  try {
    const exam = await b.get(`${C.PUBLIC_INDEX}/${publicId}`);
    if (!exam) return null;
    const doc = await b.get(`${C.PUBLIC_RESULTS}/${await lookupResultId(publicId, roll, verifier)}`);
    return doc && doc.publicId === publicId ? { exam, result: doc } : null;
  } catch { return null; }
}
