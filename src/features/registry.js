/**
 * Feature registry. Definitions and safe defaults come from config/feature-flags.json
 * (version-controlled; changed only through the protected GitHub Actions workflow).
 *
 * CRITICAL capabilities are NOT in the registry and cannot be switched off by any flag:
 * authentication, role checks, security rules, mark validation, audit logging,
 * publication privacy, data export of the college's own data.
 */
import config from '../../config/feature-flags.json';

export const FEATURE_IDS = Object.freeze(Object.keys(config.features));
export const FEATURE_DEFINITIONS = Object.freeze(config.features);
export const DEFAULT_UPGRADE_MESSAGE = config.defaultUpgradeMessage;
export const CRITICAL_CAPABILITIES = Object.freeze([
  'authentication', 'authorization', 'mark_validation', 'audit_log', 'published_result_privacy', 'data_export',
]);
export const BUILD_DEFAULTS = Object.freeze({
  version: config.version,
  updatedAt: config.updatedAt,
  upgradeUrl: config.upgradeUrl,
  features: Object.fromEntries(FEATURE_IDS.map((id) => [id, { enabled: config.features[id].enabled }])),
});
