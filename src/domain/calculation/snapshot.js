/**
 * A calculation snapshot freezes everything that influenced a published result:
 * grading scale, policy, subject/component definitions and engine version.
 * It is stored with the published result sheet so later settings changes never alter it.
 */
export const ENGINE_VERSION = '1.0.0';

export function buildCalculationSnapshot({ policy, scale, subjects }) {
  const snapshot = {
    engineVersion: ENGINE_VERSION,
    policy: structuredCloneSafe(policy),
    scale: structuredCloneSafe(scale),
    subjects: structuredCloneSafe(subjects),
  };
  snapshot.fingerprint = fingerprint(stableStringify(snapshot));
  return deepFreeze(snapshot);
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** Non-cryptographic FNV-1a fingerprint — detects accidental changes, not tampering. */
function fingerprint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function structuredCloneSafe(v) { return JSON.parse(JSON.stringify(v)); }
function deepFreeze(o) { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); }
