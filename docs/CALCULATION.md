# Result calculation engine

`src/domain/calculation/` — pure functions, no Firebase or DOM. Every rule below is configuration; the shipped values are a **preset to be confirmed by the college**, not an official board rule.

## Inputs

* **Subject definition**: components `[{ id, label, maxMarks, passMarks?, scale = 1, required = true, paper? }]`, optional subject-level `passMarks`, `countsTowardGpa`.
  * `scale` converts raw marks into contribution. The reference marksheet (CA 30% + main 70%) is `CA: max 30, scale 1` and `CQ: max 100, scale 0.7` → `28 + 91 × 0.7 = 91.70`.
  * `paper` groups components into 1st/2nd paper columns on the result sheet.
* **Mark entry**: `{ absent?: bool, components: { [id]: number | 'AB' | null } }`.
* **Grading scale**: bands `{ grade, point, min, max, isFail? }`, validated for gaps, overlaps and exactly one fail band.
* **Policy**: rounding, decimals, absent handling, optional subject, maximum GPA, merit options (`default-policy.js`).

## Rules

1. **Missing ≠ zero ≠ absent.** `null` makes the subject `INCOMPLETE`; the student's overall result is `INCOMPLETE` with no GPA or position. `0` is a real score. `'AB'` is absent.
2. **Invalid marks** (negative, above max, non-numeric, too many decimals) make the subject `INVALID` — never clamped.
3. **Component failure.** If any component with a pass mark is below it, the subject fails, whatever the total.
4. **Subject grade** comes from the percentage of (scaled total ÷ scaled full marks). Bands use `min` thresholds, so 79.5 % is in the 70–79 band. A failed subject always gets the fail band.
5. **Absent subject**: default fail (`absentSubject: 'fail'`); `'exclude'` is available for non-examined subjects.
6. **Overall pass** only when every required (non-optional) subject passes. A failed student gets `failedGpa` (default 0) and the fail grade.
7. **GPA** = (sum of required subject points + max(0, optional point − `deductPoint`)) ÷ number of required GPA subjects, capped at `maxGpa`, rounded with `gpaDecimals`/`gpaRounding`. `gpaWithoutOptional` is also reported.
8. **Overall letter grade** = highest band whose point ≤ GPA (4.70 → A when A = 4, A+ = 5) — matches the reference marksheet.
9. **Rounding** is decimal-safe (`roundTo` scales to integers; avoids `1.005 → 1.00`).

## Merit positions

`rankStudents(rows, { method, tieBreakers, rankFailed })` ranks **one pool**. `computeResultSheet` builds a pool per group, so Science, Humanities and Business Studies are never ranked together.

* Default order: passed first, then GPA, then total marks (all descending).
* `competition` (1, 1, 3) default; `dense` (1, 1, 2); `sequential` (1, 2, 3, ties broken by roll — clearly labelled as a college choice).
* Incomplete results are never ranked. Failed students are ranked after all passed students unless `rankFailed: false`.

## Reproducibility

`buildCalculationSnapshot` freezes policy, scale and subject definitions with an engine version and fingerprint. Publication stores it; reprints and corrections always calculate from the snapshot.

## Verified against the reference

`tests/fixtures/reference-progress-report.js` reproduces the uploaded marksheet: every subject total, grand total 850.60, GPA 4.70, grade A.

## Administrator controls (Settings → Grades and pass rules)
Grade bands (validated for gaps, overlaps and one fail band), GPA maximum, decimals and rounding, GPA for a failed student, mark decimals and rounding, decimal marks allowed, absent subject policy, absent-in-a-part policy, optional subject deduction and inclusion in totals, merit method, ordered tie-breakers and whether failed students are ranked. The screen explains the current rules with worked examples before saving. Subject-level options (Subjects page): any combination of CQ / MCQ / practical / CA / custom parts, per-part full and pass marks, weight, 1st/2nd paper, subject-level pass marks, counts toward GPA, counts toward total, optional-subject eligibility.

## Tie handling (deterministic)
Students are ordered by the configured keys (default: passed first, GPA, total marks). Students equal on every key share a position; with the "never share" method the lower roll comes first. The order is the same on every calculation for the same inputs.
