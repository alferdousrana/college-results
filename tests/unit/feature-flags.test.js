import { describe, it, expect } from 'vitest';
import { mergeFlags, isEnabled } from '../../src/features/flags.js';
import { BUILD_DEFAULTS, CRITICAL_CAPABILITIES, FEATURE_IDS } from '../../src/features/registry.js';

describe('feature flags', () => {
  it('uses safe build defaults with no remote config', () => {
    expect(mergeFlags(BUILD_DEFAULTS, null).features).toEqual(BUILD_DEFAULTS.features);
  });
  it('applies remote overrides only for known ids', () => {
    const m = mergeFlags(BUILD_DEFAULTS, { features: { json_student_import: { enabled: false }, made_up: { enabled: true } } });
    expect(m.features.json_student_import.enabled).toBe(false);
    expect(m.features.made_up).toBeUndefined();
  });
  it('rejects non-https upgrade URLs', () => {
    expect(mergeFlags(BUILD_DEFAULTS, { upgradeUrl: 'javascript:alert(1)' }).upgradeUrl).toBe(BUILD_DEFAULTS.upgradeUrl);
  });
  it('critical capabilities are always on and never flags', () => {
    for (const c of CRITICAL_CAPABILITIES) { expect(isEnabled(c)).toBe(true); expect(FEATURE_IDS).not.toContain(c); }
  });
});
