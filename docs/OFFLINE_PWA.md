# PWA and offline behaviour

## Installation

* `public/manifest.webmanifest` (standalone, theme colour, SVG icons including maskable).
* `pwa/install.js` captures `beforeinstallprompt`. Our banner appears once, after the user's second navigation, and never again after **Install** or **Not now** (`prefs.installPromptDismissed`). **Settings → Install app** remains whenever the browser allows it; it shows "installed" in standalone mode and explains Add to Home Screen on iOS.
* Icons are SVG (any + maskable). Some older Android launchers prefer PNG; adding 192/512 px PNGs is a small follow-up.

## Caching (`public/sw.js`)

| Request | Strategy |
|---|---|
| Navigations | network first, cached `index.html` fallback |
| `/assets/*` (hashed) | cache first |
| Google Fonts | stale-while-revalidate (print fonts work offline after first use) |
| Firestore / Auth / App Check | never touched by the worker |

`sw.js` is generated per build with a precache list of the app's JS/CSS and interface font. Print fonts are cached on first use, or all at once from Settings → "Keep all print fonts available offline". A new worker waits; the app shows **Update now** instead of reloading mid mark-entry. The worker is registered in production builds only.

## Data offline

* Firestore uses `persistentLocalCache` with `persistentMultipleTabManager`, so several tabs share one IndexedDB cache. If IndexedDB is unavailable (some private modes, very old Safari) it falls back to memory and Settings says so.
* **Mark edits do not rely on Firestore's blind offline writes.** Rules require `version = previous + 1`; a stale queued write would be rejected after reconnect and silently rolled back by the SDK. Instead `offline/offline-queue.js` stores each edit in the app's own IndexedDB outbox with the version it was based on.
* On reconnect the outbox sends entries through a Firestore transaction (`createMarkTransport`). Outcomes: accepted (removed), conflict (kept, with the server value, for the teacher to choose **keep mine** or **use server value**), rejected (permission lost — kept and flagged), or network failure (stays pending).
* The header's sync indicator always shows: online/offline, number pending, sending, or conflicts. "All changes saved" appears only when the outbox is empty.
* Outbox entries survive refreshes and restarts (verified in the browser checks by reloading while offline). They are keyed per teacher; signing out with pending entries asks for confirmation.
* The mark grid restores unsent edits after a refresh, shows a per-row status (Saved, Waiting to send, Not saved, Changed elsewhere) and only shows "All changes saved" after the server acknowledged every write.

## What needs a connection

First sign-in on a device, account approval, role or assignment changes, sharing with teachers, review, publishing, corrections, settings changes, and public result lookup of an exam not viewed before. Firebase Auth keeps a signed-in session offline, but a revoked/disabled account is only noticed when the device reconnects — and the server will reject its writes then.

## Browser notes

* iOS Safari may evict IndexedDB for sites not added to the Home Screen after about 7 days without use; installed web apps are exempt. Teachers should install the app.
* Background Sync API is not used (not available in Safari/Firefox). `offline/sync-manager.js` flushes on app start, on the `online` event and every 30 s while something is pending; the mark grid also retries every 20 s.
