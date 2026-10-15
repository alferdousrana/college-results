import { OverallState, SubjectState } from './constants.js';
import { computeSubjectResult } from './subject-result.js';
import { roundTo, preciseSum } from './rounding.js';
import { gradeForGpa, failBand } from './grading-scale.js';

/**
 * Computes one student's examination result.
 * @param {object} args
 * @param {Array}  args.subjects           subject definitions from the result-sheet snapshot
 * @param {object} args.marks              { [subjectId]: markEntry }
 * @param {object} args.policy             calculation policy (see default-policy.js)
 * @param {Array}  args.scale              grading scale bands
 * @param {string|null} args.optionalSubjectId  the student's 4th/optional subject, if any
 */
export function computeStudentResult({ subjects, marks, policy, scale, optionalSubjectId = null }) {
  const subjectResults = subjects.map((s) => ({
    ...computeSubjectResult(s, marks?.[s.id], policy, scale),
    isOptional: s.id === optionalSubjectId,
  }));

  const blocking = subjectResults.filter((r) => r.state === SubjectState.INCOMPLETE || r.state === SubjectState.INVALID);
  if (blocking.length) {
    return {
      state: OverallState.INCOMPLETE,
      subjectResults,
      pendingSubjects: blocking.map((r) => r.subjectId),
      totalObtained: null, totalFull: null, gpa: null, gpaWithoutOptional: null, grade: null, passed: null, failedSubjects: [],
    };
  }

  const counted = subjectResults.filter((r) => r.state !== SubjectState.EXCLUDED);
  const required = counted.filter((r) => !r.isOptional);
  const optional = counted.find((r) => r.isOptional) ?? null;
  const failedSubjects = required.filter((r) => r.passed === false).map((r) => r.subjectId);
  const passed = failedSubjects.length === 0;

  const opt = policy.optionalSubject ?? {};
  const includeOptionalInTotal = opt.includeInTotal !== false;
  // Subjects with countsTowardTotal === false (e.g. a non-aggregate subject) are graded but not summed.
  const inTotal = counted.filter((r) => r.countsTowardTotal !== false && (includeOptionalInTotal || !r.isOptional));
  const totalObtained = roundTo(preciseSum(inTotal.map((r) => r.obtained ?? 0)), policy.marksDecimals ?? 2);
  const totalFull = preciseSum(inTotal.map((r) => r.fullMarks));

  const gpaSubjects = required.filter((r) => r.countsTowardGpa);
  const divisor = gpaSubjects.length || 1;
  const pointSum = preciseSum(gpaSubjects.map((r) => r.point ?? 0));
  const bonus = optional && optional.countsTowardGpa ? Math.max(0, (optional.point ?? 0) - (opt.deductPoint ?? 2)) : 0;

  const gpaDecimals = policy.gpaDecimals ?? 2;
  const gpaMode = policy.gpaRounding ?? 'half-up';
  const maxGpa = policy.maxGpa ?? 5;
  let gpa = passed ? Math.min(maxGpa, (pointSum + bonus) / divisor) : (policy.failedGpa ?? 0);
  let gpaWithoutOptional = passed ? Math.min(maxGpa, pointSum / divisor) : (policy.failedGpa ?? 0);
  gpa = roundTo(gpa, gpaDecimals, gpaMode);
  gpaWithoutOptional = roundTo(gpaWithoutOptional, gpaDecimals, gpaMode);
  const grade = passed ? gradeForGpa(gpa, scale).grade : failBand(scale).grade;

  return {
    state: passed ? OverallState.PASSED : OverallState.FAILED,
    subjectResults,
    pendingSubjects: [],
    totalObtained,
    totalFull,
    gpa,
    gpaWithoutOptional,
    grade,
    passed,
    failedSubjects,
  };
}
