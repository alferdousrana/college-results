# Environment variables

All variables are read at build time by Vite. Only `VITE_`-prefixed variables reach the browser.

| Variable | Required | Meaning |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | yes for production | Firebase web configuration. These identify the project; they are not secrets. Security comes from `firestore.rules`. |
| `VITE_APPCHECK_SITE_KEY` | recommended | reCAPTCHA v3 site key for Firebase App Check; reduces scripted scraping of the public lookup. |
| `VITE_USE_EMULATORS` | dev only | `true` connects to local Auth/Firestore emulators. |

When the Firebase variables are absent the app shows "Connect the database" and offers the clearly labelled demo mode. Demo mode is impossible once Firebase is configured.

## Secrets that must never be in the browser or in `VITE_` variables

| Secret | Where it lives |
|---|---|
| Firebase service-account JSON | GitHub environment secret `FIREBASE_SERVICE_ACCOUNT` (feature-control workflow) and, temporarily, the developer's machine for `scripts/admin/bootstrap-admin.mjs` |
| GitHub tokens | none needed; the control page has no write access |
