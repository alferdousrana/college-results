#!/usr/bin/env node
// Applies one change to config/feature-flags.json. Run ONLY inside the protected GitHub Actions workflow.
// Usage: node scripts/apply-feature-change.mjs <featureId> <true|false> [message-en] [message-bn] [upgrade-url|-]
import { readFileSync, writeFileSync } from 'node:fs';

const [id, enabledRaw, msgEn, msgBn, upgradeUrl] = process.argv.slice(2);
const file = 'config/feature-flags.json';
const data = JSON.parse(readFileSync(file, 'utf8'));
if (!data.features[id]) { console.error(`Unknown feature "${id}". Add new features through a reviewed pull request.`); process.exit(1); }
if (!['true', 'false'].includes(enabledRaw)) { console.error('enabled must be true or false'); process.exit(1); }
data.features[id].enabled = enabledRaw === 'true';
if (msgEn || msgBn) data.features[id].message = { en: (msgEn || '').slice(0, 300), bn: (msgBn || '').slice(0, 300) };
if (upgradeUrl === '-') data.upgradeUrl = null;
else if (upgradeUrl) {
  if (!/^https:\/\/[^\s]+$/.test(upgradeUrl)) { console.error('upgrade_url must start with https://'); process.exit(1); }
  data.upgradeUrl = upgradeUrl;
}
data.version += 1;
data.updatedAt = new Date().toISOString();
writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
console.log(`${id} → ${data.features[id].enabled ? 'enabled' : 'disabled'} (config v${data.version})`);
