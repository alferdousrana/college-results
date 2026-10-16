/** Public API of the result-calculation engine (pure functions; no Firebase, no DOM). */
export * from './constants.js';
export * from './rounding.js';
export * from './grading-scale.js';
export * from './subject-result.js';
export * from './overall-result.js';
export * from './merit.js';
export * from './class-stats.js';
export * from './default-policy.js';
export * from './snapshot.js';
export * from './combine.js';

import { computeStudentResult } from './overall-result.js';
import { rankStudents } from './merit.js';
import { highestMarksBySubject, summarize } from './class-stats.js';

/**
 * Computes a full result sheet. Ranking pools are built per group so Science, Humanities
 * and Business Studies are never ranked against each other.
 * students: [{ studentId, roll, name, groupId, optionalSubjectId, subjectIds? }]
 * subjectsByGroup: { [groupId]: subjectDefinitions[] }
 * marks: { [studentId]: { [subjectId]: markEntry } }
 */
export function computeResultSheet({ students, subjectsByGroup, marks, policy, scale }) {
  const rows = students.map((st) => ({
    studentId: st.studentId,
    roll: st.roll,
    groupId: st.groupId ?? '_',
    result: computeStudentResult({
      // Each student sits the group's subjects, narrowed by their own subject list when given
      // (elective alternatives such as Islamic History / Psychology in Humanities).
      subjects: (subjectsByGroup[st.groupId ?? '_'] ?? []).filter((s) => !Array.isArray(st.subjectIds) || st.subjectIds.includes(s.id)),
      marks: marks[st.studentId],
      policy, scale,
      optionalSubjectId: st.optionalSubjectId ?? null,
    }),
  }));
  const pools = new Map();
  rows.forEach((r) => { if (!pools.has(r.groupId)) pools.set(r.groupId, []); pools.get(r.groupId).push(r); });
  const positions = new Map();
  for (const pool of pools.values()) {
    for (const [id, pos] of rankStudents(pool, policy.merit)) positions.set(id, pos);
  }
  const highest = {};
  for (const [g, pool] of pools) highest[g] = highestMarksBySubject(pool.map((r) => r.result));
  return {
    rows: rows.map((r) => ({ ...r, position: positions.get(r.studentId) ?? null, poolSize: pools.get(r.groupId).length })),
    highestByGroup: highest,
    summary: summarize(rows.map((r) => r.result)),
  };
}
