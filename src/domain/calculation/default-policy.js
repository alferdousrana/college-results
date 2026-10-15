/**
 * PRESETS ONLY. These values are starting points the Super Admin must review in
 * Settings → Grades & GPA before the first result is published. They are NOT presented
 * as official education-board rules.
 *
 * The 5.0 scale below matches the scale printed on the reference progress report supplied
 * with the project brief (80–100 A+ 5 … 0–32 F 0).
 */
export const REFERENCE_SCALE_5 = Object.freeze([
  { grade: 'A+', point: 5, min: 80, max: 100 },
  { grade: 'A', point: 4, min: 70, max: 79 },
  { grade: 'A-', point: 3.5, min: 60, max: 69 },
  { grade: 'B', point: 3, min: 50, max: 59 },
  { grade: 'C', point: 2, min: 40, max: 49 },
  { grade: 'D', point: 1, min: 33, max: 39 },
  { grade: 'F', point: 0, min: 0, max: 32, isFail: true },
]);

export const DEFAULT_POLICY = Object.freeze({
  marksDecimals: 2,
  marksRounding: 'half-up',
  allowDecimalMarks: true,
  maxMarkDecimals: 2,
  gpaDecimals: 2,
  gpaRounding: 'half-up',
  maxGpa: 5,
  failedGpa: 0,
  absentSubject: 'fail',          // 'fail' | 'exclude'
  componentAbsentFails: true,     // absent in a component with a pass mark fails the subject
  passOverridesScaleFail: false,
  optionalSubject: { deductPoint: 2, includeInTotal: true },
  merit: { method: 'competition', tieBreakers: ['passed', 'gpa', 'total'], rankFailed: true },
});
