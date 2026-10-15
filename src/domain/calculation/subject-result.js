import { ABSENT, SubjectState } from './constants.js';
import { roundTo, preciseSum } from './rounding.js';
import { gradeForPercentage, failBand } from './grading-scale.js';

/**
 * Subject definition (from the result-sheet snapshot):
 * {
 *   id, name, countsTowardGpa = true,
 *   components: [{ id, label, maxMarks, passMarks = null, scale = 1, required = true, paper? }],
 *   passMarks = null      // optional threshold on the scaled subject total
 * }
 * `scale` converts raw marks into contribution, e.g. a written paper marked out of 100 that
 * counts 70% uses scale 0.7. Pass thresholds are compared against RAW component marks.
 *
 * Mark entry: { absent?: boolean, components: { [componentId]: number | 'AB' | null } }
 */
export function computeSubjectResult(subject, entry, policy, scale) {
  const values = entry?.components ?? {};
  const errors = [];
  const failedComponents = [];
  const componentResults = [];
  const decimals = policy.marksDecimals ?? 2;
  const fullMarks = preciseSum(subject.components.map((c) => c.maxMarks * (c.scale ?? 1)));
  const base = { subjectId: subject.id, fullMarks, countsTowardGpa: subject.countsTowardGpa !== false, countsTowardTotal: subject.countsTowardTotal !== false };

  const wholeAbsent = entry?.absent === true ||
    (subject.components.length > 0 && subject.components.every((c) => values[c.id] === ABSENT));
  if (wholeAbsent) return absentResult(base, policy, scale);

  let missing = false;
  for (const c of subject.components) {
    const raw = values[c.id];
    const required = c.required !== false;
    if (raw === null || raw === undefined || raw === '') {
      if (required) missing = true;
      componentResults.push({ componentId: c.id, raw: null, contribution: null, passed: null });
      continue;
    }
    if (raw === ABSENT) {
      // Absent in one component: contributes nothing; fails the component if it has a pass mark.
      const passed = c.passMarks == null && policy.componentAbsentFails !== true ? null : false;
      if (passed === false) failedComponents.push(c.id);
      componentResults.push({ componentId: c.id, raw: ABSENT, contribution: 0, passed });
      continue;
    }
    const err = validateMarkValue(raw, c, policy);
    if (err) { errors.push({ componentId: c.id, message: err }); continue; }
    const contribution = roundTo(raw * (c.scale ?? 1), 4);
    const passed = c.passMarks == null ? null : raw >= c.passMarks;
    if (passed === false) failedComponents.push(c.id);
    componentResults.push({ componentId: c.id, raw, contribution, passed });
  }

  if (errors.length) return { ...base, state: SubjectState.INVALID, errors, componentResults, obtained: null, grade: null, point: null, passed: null };
  if (missing) return { ...base, state: SubjectState.INCOMPLETE, errors, componentResults, obtained: null, grade: null, point: null, passed: null };

  const obtained = roundTo(preciseSum(componentResults.map((r) => r.contribution ?? 0)), decimals, policy.marksRounding ?? 'half-up');
  const percentage = fullMarks > 0 ? roundTo((obtained / fullMarks) * 100, 4) : 0;
  const meetsSubjectPass = subject.passMarks == null || obtained >= subject.passMarks;
  const passed = failedComponents.length === 0 && meetsSubjectPass;
  const band = passed ? gradeForPercentage(percentage, scale) : failBand(scale);
  // A passing student can never receive the fail band's point via percentage alone if the
  // configured pass marks are lower than the fail band's upper edge; we honour the explicit rule.
  const finalBand = passed && band.isFail && policy.passOverridesScaleFail ? lowestPassBand(scale) : band;
  const effectivePassed = passed && !(finalBand.isFail);

  return {
    ...base,
    state: SubjectState.COMPLETE,
    errors,
    componentResults,
    failedComponents,
    obtained,
    percentage,
    grade: finalBand.grade,
    point: finalBand.point,
    passed: effectivePassed,
  };
}

function absentResult(base, policy, scale) {
  if (policy.absentSubject === 'exclude') {
    return { ...base, state: SubjectState.EXCLUDED, obtained: null, grade: null, point: null, passed: null, errors: [], componentResults: [] };
  }
  const f = failBand(scale);
  return { ...base, state: SubjectState.ABSENT, obtained: 0, percentage: 0, grade: f.grade, point: f.point, passed: false, errors: [], componentResults: [], failedComponents: [] };
}

function lowestPassBand(scale) {
  return [...scale].filter((b) => !b.isFail).sort((a, b) => a.point - b.point)[0];
}

export function validateMarkValue(raw, component, policy = {}) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 'Marks must be a number.';
  if (raw < 0) return 'Marks cannot be negative.';
  if (raw > component.maxMarks) return `Marks cannot exceed ${component.maxMarks}.`;
  if (policy.allowDecimalMarks === false && !Number.isInteger(raw)) return 'Decimal marks are not allowed.';
  const maxDp = policy.maxMarkDecimals ?? 2;
  if (!Number.isInteger(roundTo(raw * 10 ** maxDp, 6))) return `Use at most ${maxDp} decimal places.`;
  return null;
}
