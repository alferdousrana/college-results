/* Service worker — generated at build time by vite.config.js (precachePlugin) from this template.
 * The version string changes on every build, so browsers detect a new version and the app shows "Update now".
 * Firestore/Auth traffic is never cached here; Firestore has its own IndexedDB persistence. */
const CACHE_VERSION = '__BUILD_VERSION__';
const PRECACHE = __PRECACHE__;       // app JS/CSS + interface font
const PRINT_FONTS = __PRINT_FONTS__; // cached on request (Settings → "Keep print fonts offline") or on first use
const SHELL_CACHE = `crms-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `crms-assets-${CACHE_VERSION}`;
const FONT_CACHE = `crms-fonts-${CACHE_VERSION}`;
// BASE is '/' on Vercel and '/<repo>/' on GitHub Pages (taken from the registration scope).
const BASE = new URL(self.registration.scope).pathname;
const SHELL_URLS = ['', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/maskable.svg'].map((p) => BASE + p);

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)),
    caches.open(ASSET_CACHE).then((c) => c.addAll(PRECACHE)),
  ]));
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks the waiting worker to activate after the user accepts "Update available".
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CACHE_PRINT_FONTS') {
    event.waitUntil(caches.open(ASSET_CACHE).then((c) => c.addAll(PRINT_FONTS))
      .then(() => event.source?.postMessage({ type: 'PRINT_FONTS_CACHED', count: PRINT_FONTS.length }))
      .catch(() => event.source?.postMessage({ type: 'PRINT_FONTS_FAILED' })));
  }
});

function isFirebaseTraffic(url) {
  return /(^|\.)firestore\.googleapis\.com$|(^|\.)identitytoolkit\.googleapis\.com$|(^|\.)securetoken\.googleapis\.com$|firebaseinstallations|firebaseappcheck/.test(url.hostname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isFirebaseTraffic(url)) return; // let the network/Firestore SDK handle it

  // SPA navigations: network first, cached shell as offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(`${BASE}index.html`, copy));
          return res;
        })
        .catch(() => caches.match(`${BASE}index.html`)),
    );
    return;
  }

  // Google Fonts: stale-while-revalidate so print fonts keep working offline once used.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  // Same-origin hashed build assets: cache first (immutable file names).
  if (url.origin === self.location.origin && url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(ASSET_CACHE).then((c) => c.put(request, copy)); }
        return res;
      })),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => { if (res.ok || res.type === 'opaque') cache.put(request, res.clone()); return res; })
    .catch(() => cached);
  return cached || network;
}
