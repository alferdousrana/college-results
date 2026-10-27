import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

/** Generates /sw.js from src/pwa/sw-template.js with the list of built files to precache. */
function precachePlugin() {
  let base = '/';
  return {
    name: 'crms-precache',
    apply: 'build',
    configResolved(c) { base = c.base; },
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const isFont = (f) => /\.woff2$/.test(f);
      const core = files.filter((f) => /\.(js|css)$/.test(f) && !/print-preview/.test(f)).concat(files.filter((f) => isFont(f) && /hind-siliguri/.test(f)));
      const fonts = files.filter((f) => isFont(f) && !/hind-siliguri/.test(f));
      const version = Date.now().toString(36);
      const tpl = readFileSync(new URL('./src/pwa/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: tpl
        .replace('__BUILD_VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(core.map((f) => `${base}${f}`)))
        .replace('__PRINT_FONTS__', JSON.stringify(fonts.map((f) => `${base}${f}`))) });
    },
  };
}

export default defineConfig({
  // '/' for Vercel; the GitHub Pages workflow sets BASE_PATH=/<repository-name>/.
  base: process.env.BASE_PATH || '/',
  // Only VITE_-prefixed variables are exposed to the browser bundle.
  envPrefix: 'VITE_',
  plugins: [precachePlugin()],
  build: {
    target: 'es2020',
    sourcemap: true,
    // The Firebase chunk (~600 kB, ~140 kB gzip) is loaded lazily, never on first paint.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      // The developer control page is only built for GitHub Pages (BUILD_DEV_CONTROL=1), never for the college's Vercel site.
      input: process.env.BUILD_DEV_CONTROL === '1'
        ? { main: new URL('./index.html', import.meta.url).pathname, devControl: new URL('./dev-control/index.html', import.meta.url).pathname }
        : { main: new URL('./index.html', import.meta.url).pathname },
      output: {
        manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'] },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js', 'tests/workflow/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    // Tests must NEVER talk to a real Firebase project, even when CI has the VITE_FIREBASE_* variables set.
    env: {
      VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_AUTH_DOMAIN: '', VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_STORAGE_BUCKET: '', VITE_FIREBASE_MESSAGING_SENDER_ID: '', VITE_FIREBASE_APP_ID: '', VITE_APPCHECK_SITE_KEY: '',
    },
    // CI runners are slower than a laptop; workflow tests seed a whole demo database.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
