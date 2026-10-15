/**
 * Firebase initialisation. Imported lazily so the public result page and the "not configured"
 * screen work without Firebase credentials.
 *
 * Offline persistence: persistentLocalCache + persistentMultipleTabManager lets several tabs
 * share one IndexedDB cache. If IndexedDB is unavailable (some private-browsing modes), the SDK
 * falls back to memory cache and the app shows "offline editing unavailable".
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, browserLocalPersistence, setPersistence } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { firebaseConfig, appConfig, isFirebaseConfigured } from './config.js';

let services = null;

export function getFirebase() {
  if (services) return services;
  if (!isFirebaseConfigured()) throw new Error('FIREBASE_NOT_CONFIGURED');

  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});

  let db;
  let persistence = 'indexeddb';
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('[firebase] persistent cache unavailable, using memory cache', e);
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
    persistence = 'memory';
  }

  if (appConfig.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  services = { app, auth, db, persistence };
  if (appConfig.appCheckSiteKey) initAppCheck(app).catch((e) => console.warn('[appcheck]', e));
  return services;
}

async function initAppCheck(app) {
  const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appConfig.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
}
