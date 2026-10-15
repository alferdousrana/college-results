import { createDemoBackend } from '../../src/data/backend/demo-backend.js';
import { _setBackendForTests } from '../../src/data/backend/index.js';
import { clearSettingsCache } from '../../src/data/repositories/settings-repository.js';
import { invalidateCatalogueCache } from '../../src/data/repositories/catalogue-repository.js';
import { ensureDemoSeed, DEMO_ADMIN } from '../../src/demo/seed.js';

export const ADMIN = DEMO_ADMIN;
export const T_SCI = { id: 'demo-t-science', role: 'teacher', displayName: 'Kamal Hossain' };
export const T_BANGLA = { id: 'demo-t-bangla', role: 'teacher', displayName: 'Rahima Begum' };

/** Fresh, seeded demo database. Runs the same repositories the app uses. */
export async function freshDb({ seed = true } = {}) {
  localStorage.setItem('crms.demo.enabled', '1');
  const b = createDemoBackend({ storage: null });
  _setBackendForTests(b);
  clearSettingsCache(); invalidateCatalogueCache();
  if (seed) await ensureDemoSeed(b);
  return b;
}
