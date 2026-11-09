/**
 * 1st and 2nd papers.
 * Most HSC subjects have a 1st and a 2nd paper with their own board codes (e.g. Physics 174 / 175).
 * A subject keeps ONE catalogue entry (papers.first / papers.second) and ONE teacher assignment
 * (optionally per paper). How the papers are examined is decided per examination, in the routine
 * and in step 2 of the result-sheet wizard:
 *
 *   separate — default. Two exams, two subjects on the sheet, each with the full marks of the
 *              subject's components (e.g. 100 each), ids `physics__p1` and `physics__p2`, codes 174
 *              and 175. For the grade they are combined like Bangla 1st + 2nd (see combine.js).
 *   combined — 1st and 2nd paper examined together in ONE exam (e.g. 100 marks), id `physics`,
 *              codes "174, 175".
 *   first    — 1st paper only (id `physics__p1`).
 *   second   — 2nd paper only (id `physics__p2`).
 *
 * Students and teacher assignments always refer to the catalogue id (`physics`); use
 * baseSubjectId() to map a paper id back. Subjects without two paper codes are single subjects.
 * The resolved names and codes are frozen into each result sheet when it is created.
 */
export const PAPER_FORMS = ['separate', 'combined', 'first', 'second'];
export const DEFAULT_PAPER_FORM = 'separate';
const SUFFIX = { '1st': '__p1', '2nd': '__p2' };

/** True when the subject has both a 1st and a 2nd paper code. */
export const hasTwoPapers = (subject) => Boolean(subject?.papers?.first && subject?.papers?.second);

/** `physics__p1` → `physics`; any other id is returned unchanged. */
export const baseSubjectId = (id) => String(id ?? '').replace(/__p[12]$/, '');

/** `physics__p1` → '1st', `physics__p2` → '2nd', otherwise null. */
export function paperOfId(id) {
  const m = /__p([12])$/.exec(String(id ?? ''));
  return m ? (m[1] === '1' ? '1st' : '2nd') : null;
}

export const paperSubjectId = (baseId, paper) => `${baseId}${SUFFIX[paper] ?? ''}`;

/** True when a session subject id belongs to the catalogue subject (itself or one of its papers). */
export const belongsTo = (id, baseId) => id === baseId || baseSubjectId(id) === baseId;

export function paperName(name = {}, paper) {
  const en = name.en ?? '';
  const bn = name.bn ?? null;
  if (paper === '1st') return { en: `${en} 1st Paper`.trim(), bn: bn ? `${bn} ১ম পত্র` : null };
  if (paper === '2nd') return { en: `${en} 2nd Paper`.trim(), bn: bn ? `${bn} ২য় পত্র` : null };
  return { en, bn };
}

/**
 * The exam entries (result-sheet subjects / routine items) of one catalogue subject in one paper form:
 * [{ id, name, code, paper, paperScheme, combine }]
 */
export function examEntries(subject, form = DEFAULT_PAPER_FORM) {
  const name = subject.name ?? {};
  if (!hasTwoPapers(subject)) {
    return [{ id: subject.id, name, code: subject.code ?? subject.papers?.first ?? subject.papers?.second ?? null, paper: null, paperScheme: null, combine: subject.combine?.key ? subject.combine : null }];
  }
  const p = subject.papers;
  const one = (paper, linked) => ({
    id: paperSubjectId(subject.id, paper), name: paperName(name, paper), code: paper === '1st' ? p.first : p.second, paper,
    paperScheme: paper === '1st' ? 'first' : 'second',
    combine: linked ? { key: subject.id, name: { en: name.en ?? subject.id, bn: name.bn ?? null }, paper } : null,
  });
  if (form === 'combined') return [{ id: subject.id, name, code: `${p.first}, ${p.second}`, paper: null, paperScheme: 'combined', combine: null }];
  if (form === 'first') return [one('1st', false)];
  if (form === 'second') return [one('2nd', false)];
  return [one('1st', true), one('2nd', true)];
}

/** Every possible exam entry of a subject (used to offer choices in the routine). */
export function allExamEntries(subject) {
  if (!hasTwoPapers(subject)) return examEntries(subject);
  return [...examEntries(subject, 'separate'), ...examEntries(subject, 'combined')];
}

/** Which paper form a set of ids (routine cells or sheet subjects) uses for one subject, or null. */
export function formFromIds(subject, idList) {
  if (!hasTwoPapers(subject)) return null;
  const set = new Set(idList);
  if (set.has(subject.id)) return 'combined';
  const a = set.has(paperSubjectId(subject.id, '1st')), b = set.has(paperSubjectId(subject.id, '2nd'));
  if (a && b) return 'separate';
  if (a) return 'first';
  if (b) return 'second';
  return null;
}

/** Does a teacher assignment (optionally limited to one paper) cover this exam entry? */
export function assignmentCovers(assignment, entryId) {
  if (baseSubjectId(entryId) !== assignment.subjectId) return false;
  const paper = paperOfId(entryId);
  return !assignment.paper || !paper || assignment.paper === paper;
}

// ---- Older result sheets (created before papers were chosen per examination) ----
/** Name and code for a subject in one class under the old per-class scheme. Kept for old data. */
export function resolvePaperScheme(subject, classId) {
  if (!subject?.papers?.first && !subject?.papers?.second) return null;
  return subject.paperScheme?.[classId] ?? 'combined';
}
export function subjectLabelForClass(subject, classId) {
  const scheme = resolvePaperScheme(subject, classId);
  const name = subject.name ?? {};
  if (!scheme) return { name, code: subject.code ?? null, scheme: null };
  const p = subject.papers;
  if (scheme === 'first') return { name: paperName(name, '1st'), code: p.first ?? null, scheme };
  if (scheme === 'second') return { name: paperName(name, '2nd'), code: p.second ?? null, scheme };
  return { name, code: [p.first, p.second].filter(Boolean).join(', ') || subject.code || null, scheme };
}
