/**
 * A grading scale is an ordered list of bands on a 0–100 percentage:
 *   { grade: 'A+', point: 5, min: 80, max: 100, isFail?: true }
 * `min` is inclusive. Bands must not overlap or leave gaps (validated below).
 * The engine never assumes a specific scale — it is supplied by settings.
 */
export function validateGradingScale(scale) {
  const errors = [];
  if (!Array.isArray(scale) || scale.length === 0) return ['Grading scale must contain at least one band.'];
  const sorted = [...scale].sort((a, b) => a.min - b.min);
  sorted.forEach((b, i) => {
    if (typeof b.grade !== 'string' || !b.grade.trim()) errors.push(`Band ${i + 1}: grade label is required.`);
    if (typeof b.point !== 'number' || b.point < 0) errors.push(`Band ${b.grade}: grade point must be a non-negative number.`);
    if (typeof b.min !== 'number' || typeof b.max !== 'number' || b.min > b.max) errors.push(`Band ${b.grade}: min/max are invalid.`);
  });
  if (sorted[0].min !== 0) errors.push('The lowest band must start at 0.');
  if (sorted[sorted.length - 1].max !== 100) errors.push('The highest band must end at 100.');
  // Bands use integer-style edges (70–79, 80–100): the next band starts after the previous max,
  // at most 1 mark later. Percentages like 79.5 are resolved by `min` in gradeForPercentage.
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if (cur.min <= prev.max) errors.push(`Bands ${prev.grade} and ${cur.grade} overlap.`);
    else if (cur.min - prev.max > 1) errors.push(`Gap between ${prev.grade} and ${cur.grade}.`);
  }
  if (!sorted.some((b) => b.isFail)) errors.push('Mark exactly one band as the fail band.');
  if (sorted.filter((b) => b.isFail).length > 1) errors.push('Only one band can be the fail band.');
  return errors;
}

/** Returns the band for a percentage. Uses `min` thresholds only, so 79.5 falls into the 70–79 band. */
export function gradeForPercentage(percentage, scale) {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return sorted.find((b) => percentage >= b.min) ?? sorted[sorted.length - 1];
}

export function failBand(scale) {
  return scale.find((b) => b.isFail) ?? [...scale].sort((a, b) => a.point - b.point)[0];
}

/** Letter grade for a GPA: the highest band whose point is <= gpa (e.g. 4.7 → A when A=4, A+=5). */
export function gradeForGpa(gpa, scale) {
  const sorted = [...scale].sort((a, b) => b.point - a.point);
  return sorted.find((b) => gpa >= b.point) ?? failBand(scale);
}
