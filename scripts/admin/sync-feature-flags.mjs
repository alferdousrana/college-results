#!/usr/bin/env node
/** Copies config/feature-flags.json into Firestore featureFlags/global. Runs in GitHub Actions with a secret. */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.error('FIREBASE_SERVICE_ACCOUNT secret is missing'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(raw)) });
const config = JSON.parse(readFileSync('config/feature-flags.json', 'utf8'));
const features = Object.fromEntries(Object.entries(config.features).map(([id, f]) => [id, { enabled: f.enabled, ...(f.message ? { message: f.message } : {}) }]));
await getFirestore().doc('featureFlags/global').set({
  version: config.version, updatedAt: config.updatedAt, upgradeUrl: config.upgradeUrl, features,
  syncedAt: FieldValue.serverTimestamp(), syncedBy: process.env.GITHUB_ACTOR ?? 'unknown',
});
console.log(`Synced feature flags v${config.version}`);
