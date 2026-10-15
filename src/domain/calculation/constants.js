/** Shared constants for the calculation engine. No Firebase or DOM imports allowed in this folder. */

/** Stored value for an absent component or subject. Distinct from 0 (a real score) and null (not yet entered). */
export const ABSENT = 'AB';

export const SubjectState = Object.freeze({
  COMPLETE: 'COMPLETE',     // every required component has a valid value
  INCOMPLETE: 'INCOMPLETE', // at least one required component has not been entered
  ABSENT: 'ABSENT',         // student absent for the whole subject
  INVALID: 'INVALID',       // at least one value is out of range / malformed
  EXCLUDED: 'EXCLUDED',     // absent and policy says exclude (rare, explicit config only)
});

export const OverallState = Object.freeze({
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  INCOMPLETE: 'INCOMPLETE', // cannot be finalised: missing or invalid marks
});

export const RankMethod = Object.freeze({
  COMPETITION: 'competition', // 1,1,3  (ties share, next rank skips)
  DENSE: 'dense',             // 1,1,2
  SEQUENTIAL: 'sequential',   // 1,2,3  (ties broken by roll — documented, not an official rule)
});
