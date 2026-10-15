import { OverallState, RankMethod } from './constants.js';

/**
 * Assigns merit positions within ONE ranking pool (same exam session + class + group).
 * The caller is responsible for building the pool; this function never mixes groups.
 *
 * rows: [{ studentId, roll, result }]
 * options: {
 *   method: 'competition' | 'dense' | 'sequential',
 *   tieBreakers: ordered keys from KEY_FNS (default: passed, gpa, total),
 *   rankFailed: boolean (default true — failed students ranked after all passed students),
 * }
 * Incomplete results are never ranked (position = null).
 */
const KEY_FNS = {
  passed: (r) => (r.result.passed ? 1 : 0),
  gpa: (r) => r.result.gpa ?? -1,
  total: (r) => r.result.totalObtained ?? -1,
  gpaWithoutOptional: (r) => r.result.gpaWithoutOptional ?? -1,
  fewerFailedSubjects: (r) => -(r.result.failedSubjects?.length ?? 0),
};

export function rankStudents(rows, options = {}) {
  const method = options.method ?? RankMethod.COMPETITION;
  const tieBreakers = (options.tieBreakers ?? ['passed', 'gpa', 'total']).filter((k) => KEY_FNS[k]);
  const rankFailed = options.rankFailed !== false;

  const positions = new Map();
  const eligible = rows.filter((r) => {
    const ok = r.result.state !== OverallState.INCOMPLETE && (rankFailed || r.result.passed);
    if (!ok) positions.set(r.studentId, null);
    return ok;
  });

  const keyOf = (r) => tieBreakers.map((k) => KEY_FNS[k](r));
  const cmp = (a, b) => {
    const ka = keyOf(a), kb = keyOf(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  };
  // Stable order: ties listed by roll for display; roll only *decides* rank in sequential mode.
  const sorted = [...eligible].sort((a, b) => cmp(a, b) || compareRoll(a.roll, b.roll));

  let rank = 0;
  let dense = 0;
  sorted.forEach((row, i) => {
    if (method === RankMethod.SEQUENTIAL) rank = i + 1;
    else if (i === 0 || cmp(sorted[i - 1], row) !== 0) { rank = i + 1; dense += 1; }
    positions.set(row.studentId, method === RankMethod.DENSE ? dense : rank);
  });
  return positions;
}

function compareRoll(a, b) {
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}
