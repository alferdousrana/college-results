/** Reads build-time environment (VITE_*). Firebase web config values are public identifiers. */
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const appConfig = {
  appCheckSiteKey: env.VITE_APPCHECK_SITE_KEY || null,
  useEmulators: env.VITE_USE_EMULATORS === 'true',
  isDev: env.DEV,
};

export function isFirebaseConfigured() {
  return ['apiKey', 'authDomain', 'projectId', 'appId'].every((k) => Boolean(firebaseConfig[k]));
}
