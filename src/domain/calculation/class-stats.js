import { SubjectState } from './constants.js';

/** Highest obtained marks per subject across a set of student results (shown on progress reports). */
export function highestMarksBySubject(studentResults) {
  const out = {};
  for (const res of studentResults) {
    for (const s of res.subjectResults ?? []) {
      if (s.state !== SubjectState.COMPLETE || s.obtained == null) continue;
      if (out[s.subjectId] == null || s.obtained > out[s.subjectId]) out[s.subjectId] = s.obtained;
    }
  }
  return out;
}

/** Counts for the review screen. */
export function summarize(studentResults) {
  const s = { total: studentResults.length, passed: 0, failed: 0, incomplete: 0, gradeCounts: {} };
  for (const r of studentResults) {
    if (r.state === 'PASSED') s.passed++;
    else if (r.state === 'FAILED') s.failed++;
    else s.incomplete++;
    if (r.grade) s.gradeCounts[r.grade] = (s.gradeCounts[r.grade] ?? 0) + 1;
  }
  return s;
}
