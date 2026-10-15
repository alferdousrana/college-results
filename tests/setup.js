import 'fake-indexeddb/auto';
import { isFirebaseConfigured } from '../src/core/config.js';

// Safety guard: automated tests must never reach a real Firebase project.
if (isFirebaseConfigured()) throw new Error('Tests are running with real Firebase configuration. Aborting.');
