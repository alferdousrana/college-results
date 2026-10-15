#!/usr/bin/env node
// Validates config/feature-flags.json. Used by CI and by the feature-control workflow before committing.
import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'config/feature-flags.json';
const errors = [];
let data;
try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.error(`Invalid JSON: ${e.message}`); process.exit(1); }

const ID = /^[a-z][a-z0-9_]{2,48}$/;
const CATEGORIES = new Set(['students', 'results', 'printing', 'marks', 'interface', 'administration']);
const CRITICAL = new Set(['authentication', 'authorization', 'mark_validation', 'audit_log', 'published_result_privacy', 'data_export']);

if (!Number.isInteger(data.version)) errors.push('version must be an integer');
if (Number.isNaN(Date.parse(data.updatedAt))) errors.push('updatedAt must be an ISO date');
if (data.upgradeUrl !== null && !/^https:\/\//.test(data.upgradeUrl ?? '')) errors.push('upgradeUrl must be null or https://');
for (const [id, f] of Object.entries(data.features ?? {})) {
  if (!ID.test(id)) errors.push(`${id}: invalid id`);
  if (CRITICAL.has(id)) errors.push(`${id}: critical capabilities cannot be feature flags`);
  if (typeof f.enabled !== 'boolean') errors.push(`${id}: enabled must be true/false`);
  if (!CATEGORIES.has(f.category)) errors.push(`${id}: unknown category ${f.category}`);
  if (!f.label) errors.push(`${id}: label required`);
  if (f.message && (typeof f.message.en !== 'string' || f.message.en.length > 300)) errors.push(`${id}: message.en must be text under 300 chars`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK: ${Object.keys(data.features).length} feature flags valid`);
