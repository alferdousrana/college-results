/**
 * Combined (multi-paper) subjects, e.g. Bangla 1st + Bangla 2nd → "Bangla".
 * Each paper is its own subject for mark entry and teacher assignment (subject.combine = { key, name, paper }).
 * For grading, papers with the same combine.key are merged into ONE subject result:
 *   full marks and obtained marks are summed, the grade comes from the combined percentage,
 *   and the combined subject passes only if every paper passes its own component rules
 *   (plus combine.passMarks on the combined total, when configured). GPA counts it once.
 */
import { SubjectState } from './constants.js';
import { roundTo, preciseSum } from './rounding.js';
import { gradeForPercentage, failBand } from './grading-scale.js';

export const combinedId = (key) => `combo_${key}`;

export function combineSubjectResults(subjectResults, subjects, policy, scale) {
  const groups = new Map();
  const out = [];
  subjects.forEach((s, i) => {
    const r = subjectResults[i];
    const key = s.combine?.key;
    if (!key) { out.push(r); return; }
    if (!groups.has(key)) { groups.set(key, { key, combine: s.combine, parts: [], slot: out.length }); out.push(null); }
    groups.get(key).parts.push({ subject: s, result: r });
  });
  for (const g of groups.values()) out[g.slot] = mergeParts(g, policy, scale);
  return out;
}

function mergeParts({ key, combine, parts }, policy, scale) {
  const results = parts.map((p) => p.result);
  const base = {
    subjectId: combinedId(key), isCombined: true, combineKey: key, name: combine.name ?? key,
    parts: parts.map((p) => ({ subjectId: p.subject.id, paper: p.subject.combine?.paper ?? null, result: p.result })),
    fullMarks: preciseSum(results.map((r) => r.fullMarks)),
    countsTowardGpa: results.every((r) => r.countsTowardGpa !== false),
    countsTowardTotal: results.every((r) => r.countsTowardTotal !== false),
    componentResults: results.flatMap((r, i) => (r.componentResults ?? []).map((c) => ({ ...c, partId: parts[i].subject.id }))),
    errors: results.flatMap((r) => r.errors ?? []),
    isOptional: results.some((r) => r.isOptional),
  };
  if (results.some((r) => r.state === SubjectState.INVALID)) return { ...base, state: SubjectState.INVALID, obtained: null, grade: null, point: null, passed: null };
  if (results.some((r) => r.state === SubjectState.INCOMPLETE)) return { ...base, state: SubjectState.INCOMPLETE, obtained: null, grade: null, point: null, passed: null };
  if (results.every((r) => r.state === SubjectState.EXCLUDED)) return { ...base, state: SubjectState.EXCLUDED, obtained: null, grade: null, point: null, passed: null };
  if (results.every((r) => r.state === SubjectState.ABSENT)) {
    const f = failBand(scale);
    return { ...base, state: SubjectState.ABSENT, obtained: 0, percentage: 0, grade: f.grade, point: f.point, passed: false, failedComponents: [] };
  }
  const obtained = roundTo(preciseSum(results.map((r) => r.obtained ?? 0)), policy.marksDecimals ?? 2, policy.marksRounding ?? 'half-up');
  const percentage = base.fullMarks > 0 ? roundTo((obtained / base.fullMarks) * 100, 4) : 0;
  const failedParts = parts.filter((p) => p.result.passed === false).map((p) => p.subject.id);
  const meetsCombined = combine.passMarks == null || obtained >= combine.passMarks;
  const passed = failedParts.length === 0 && meetsCombined;
  const band = passed ? gradeForPercentage(percentage, scale) : failBand(scale);
  return {
    ...base, state: SubjectState.COMPLETE, obtained, percentage, failedParts,
    failedComponents: results.flatMap((r) => r.failedComponents ?? []),
    grade: band.grade, point: band.point, passed: passed && !band.isFail,
  };
}
