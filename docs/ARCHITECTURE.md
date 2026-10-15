# Architecture

Developer documentation. The user-facing guide is the root `README.md`.

## Shape of the system

```
 Browser (Vercel static hosting)                     Firebase (Spark / free tier)
 ┌──────────────────────────────────────┐            ┌──────────────────────────────┐
 │ Vite build, plain ES modules          │  Auth      │ Firebase Authentication       │
 │  app/      router, routes, guards     │──────────▶ │  email + password             │
 │  pages/    one module per screen      │            ├──────────────────────────────┤
 │  ui/       components, layout shell   │ Firestore  │ Cloud Firestore               │
 │  domain/   calculation, validation,   │──────────▶ │  firestore.rules = authority  │
 │            exam lifecycle (pure JS)   │            │  IndexedDB cache in browser   │
 │  data/     paths + repositories       │            └──────────────────────────────┘
 │  offline/  IndexedDB outbox           │                         ▲
 │  print/    marksheet + sheet templates│                         │ Admin SDK (secret)
 │  sw.js     shell cache                │            ┌──────────────────────────────┐
 └──────────────────────────────────────┘            │ GitHub Actions                │
                                                      │  feature-control workflow     │
 GitHub Pages: dev-control/ (read-only status page) ─▶│  bootstrap / sync scripts     │
                                                      └──────────────────────────────┘
```

No custom backend. Everything privileged (first Super Admin, feature-flag sync) runs from trusted scripts with the Admin SDK, never in the browser.

## Phase 2 changes to the Phase 1 architecture

* **Backend interface** (`src/data/backend/`). Repositories no longer import the Firestore SDK; they call a small interface (`get`, `list`, `set`, `update`, `batch`, `transaction`, `listen*`). `firestore-backend.js` implements it with Firestore; `demo-backend.js` implements it in the browser for the labelled demo mode and for workflow tests. Write sentinels (`serverTime()`, `arrayUnion()`…) live in `data/field-ops.js`. This was the smallest change that let the same repository code be tested end to end without credentials.
* **Marks path** unchanged; transport now also writes an audit entry and moves a shared sheet to "in progress" on the first teacher save.
* **Service worker** is generated at build time (`vite.config.js → precachePlugin`) from `src/pwa/sw-template.js`, so each deploy has a new version and a precache list.
* **Fonts** are bundled from `@fontsource` packages; no runtime Google Fonts requests.
* **Shared copy**: interface text uses `t(key)` for shared vocabulary and `tt(en, bn)` for screen-specific text, keeping both languages side by side.

## Module map

| Folder | Contents |
|---|---|
| `app/` | routes, guards, hash router |
| `auth/` | Firebase/demo sign-in, registration, admin-created teachers, roles mirror |
| `data/backend/` | Firestore and demo implementations of the backend interface |
| `data/repositories/` | users, students, catalogue, assignments, settings, sessions, marks, results, public results, notifications, audit |
| `domain/` | calculation engine, `session-calc.js` (missing marks, sharing checks, engine inputs), validation, lifecycle |
| `offline/` | IndexedDB outbox, sync manager, network status |
| `pages/` | one module per screen (`admin/`, `teacher/`, shared mark entry and results viewer, public lookup) |
| `settings/editors/` | one editor per settings section |
| `print/` | view model, marksheet, result sheet, labels (en/bn), fonts, print runner, sample data |
| `ui/` | components (table, modal, tabs, forms, image input, bell, search, banners) and the shell |
| `demo/` | demo seed (demo mode only) |

## Layering rules

| Layer | May import | Must not import |
|---|---|---|
| `domain/` | other `domain/` files | Firebase, DOM, `data/`, `ui/` |
| `data/` | `domain/`, `core/` | `ui/`, `pages/` |
| `ui/`, `print/` | `core/`, `i18n/`, `domain/` | Firebase directly |
| `pages/` | everything above (lazy-load `data/`) | — |

`domain/calculation` is the only place results are computed; the review screen, publication step and print preview all call it. This keeps unit tests meaningful.

## Loading strategy

* `main.js` loads only the shell, router, i18n and theme (~32 kB).
* Firebase (~140 kB gzip) is dynamically imported when auth or data is first needed, so the setup screen and the first paint never wait for it.
* Each page is a lazy chunk. `pages/print-preview.js` is routed only in development builds.

## Routing and guards

Hash routing (`#/admin`) works on any static host and from the cached shell offline. `app/guards.js` decides between: render, redirect to sign in, redirect to the account-status page (pending / rejected / disabled), or show "forbidden". Guards are a usability layer only. `firestore.rules` is the security boundary.

The profile document `users/{uid}` is observed live, so approving or disabling a teacher takes effect without them signing out.

## State and events

`core/store.js` holds session-wide state (auth user, profile, online, flags). `core/events.js` is a small pub/sub (`state`, `prefs`, `queue`, `network`, `install`, `sw:update`, `flags`). Pages own their local state and may export `dispose()`.

## Localisation and theme

`i18n/en.js` and `i18n/bn.js` hold all interface text; a unit test fails if a Bangla key is missing or not Unicode Bengali. Stored data uses ASCII digits; Bangla digits are display-only (`formatNumber`) and accepted on input (`normalizeDigits`). Theme tokens live in `styles/tokens.css`; printouts never inherit the theme (`print/print.css`).

**Legacy Bangla encoding.** The reference PDF uses SutonnyMJ/Bijoy ANSI encoding (text extracts as Latin gibberish). The system stores Unicode only. A Bijoy→Unicode converter for importing old spreadsheets is a Phase 2 option.

## Deployment model

Vercel builds `npm run build` and serves `dist/` with headers from `vercel.json` (no caching of `sw.js`). Environment variables are the six `VITE_FIREBASE_*` web-config values (public identifiers, not secrets). Firestore rules and indexes are deployed with the Firebase CLI. Firebase Hosting is not used.

## Paid-plan notes

Nothing in Phase 1 requires the Blaze plan. Things that **would**:
* Cloud Functions (custom claims, server-side publication, scheduled backups). Avoided: roles are read from `users/{uid}` in rules; publication is a client-side admin transaction guarded by rules.
* Cloud Storage for logos/signatures on new projects (Firebase now requires Blaze for new default buckets). Phase 2 default: store small, compressed images as data URLs inside `institution/public` (well under the 1 MiB document limit), with Storage as an optional upgrade.
