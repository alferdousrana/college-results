/**
 * Paper schemes. Most HSC subjects have a 1st and a 2nd paper (board codes e.g. Physics 174 / 175),
 * taught by the same teacher. Each subject keeps ONE catalogue entry and ONE teacher assignment; each
 * class decides what its examinations cover:
 *   combined — 1st and 2nd paper examined together (e.g. Class Eleven, 100 marks)  → "Physics", codes 174, 175
 *   first    — 1st paper only                                                    → "Physics 1st Paper", 174
 *   second   — 2nd paper only (e.g. Class Twelve)                                → "Physics 2nd Paper", 175
 * Subjects without paper codes are unaffected. (Bangla and English, whose papers are examined and
 * graded separately, stay as two linked subjects — see combine.js.)
 * The resolved name and code are frozen into each result sheet when it is created.
 */
export const PAPER_SCHEMES = ['combined', 'first', 'second'];

export function resolvePaperScheme(subject, classId) {
  if (!subject?.papers?.first && !subject?.papers?.second) return null;
  return subject.paperScheme?.[classId] ?? 'combined';
}

/** Name and code to print for a subject in one class. */
export function subjectLabelForClass(subject, classId) {
  const scheme = resolvePaperScheme(subject, classId);
  const name = subject.name ?? {};
  if (!scheme) return { name, code: subject.code ?? null, scheme: null };
  const p = subject.papers;
  if (scheme === 'first') return { name: { en: `${name.en ?? ''} 1st Paper`.trim(), bn: name.bn ? `${name.bn} ১ম পত্র` : null }, code: p.first ?? null, scheme };
  if (scheme === 'second') return { name: { en: `${name.en ?? ''} 2nd Paper`.trim(), bn: name.bn ? `${name.bn} ২য় পত্র` : null }, code: p.second ?? null, scheme };
  return { name, code: [p.first, p.second].filter(Boolean).join(', ') || subject.code || null, scheme };
}
