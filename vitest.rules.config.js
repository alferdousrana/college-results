// Security-rules tests: run with `npm run test:rules` (needs firebase-tools + Java; starts the Firestore emulator).
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['tests/integration/**/*.test.js'], testTimeout: 20000 } });
