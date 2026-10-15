import { validateGradingScale } from '../calculation/grading-scale.js';

/** Validates a subject definition used in a result sheet. */
export function validateSubjectDefinition(subject) {
  const errors = [];
  if (!subject?.id) errors.push('Subject id is required.');
  if (!subject?.name) errors.push('Subject name is required.');
  if (!Array.isArray(subject?.components) || subject.components.length === 0) errors.push('At least one mark component (e.g. CQ, MCQ) is required.');
  const ids = new Set();
  for (const c of subject?.components ?? []) {
    if (!c.id) errors.push('Every component needs an id.');
    if (ids.has(c.id)) errors.push(`Duplicate component "${c.id}".`);
    ids.add(c.id);
    if (!(c.maxMarks > 0)) errors.push(`${c.label ?? c.id}: full marks must be greater than 0.`);
    if (c.passMarks != null && (c.passMarks < 0 || c.passMarks > c.maxMarks)) errors.push(`${c.label ?? c.id}: pass marks must be between 0 and full marks.`);
    if (c.scale != null && !(c.scale > 0)) errors.push(`${c.label ?? c.id}: weight must be greater than 0.`);
  }
  return errors;
}

export function validatePolicyBundle({ scale, policy }) {
  const errors = [...validateGradingScale(scale)];
  if (!(policy.maxGpa > 0)) errors.push('Maximum GPA must be greater than 0.');
  if (![0, 1, 2, 3].includes(policy.gpaDecimals)) errors.push('GPA decimals must be 0–3.');
  return errors;
}
