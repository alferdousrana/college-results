# Deployment considerations (to be done together, step by step)

Nothing has been deployed yet. Order of the guided setup:

1. **Firebase project** (Spark plan): enable Email/Password sign-in; create Firestore in a nearby region (e.g. `asia-south1`); add the web app and copy its configuration.
2. **Rules and indexes**: `firebase deploy --only firestore:rules,firestore:indexes`. Run `npm run test:rules` against the emulator first.
3. **Authorized domains**: add the Vercel domain(s) in Firebase Authentication settings.
4. **Vercel**: import the GitHub repository; framework "Other"; build `npm run build`; output `dist`; add the `VITE_FIREBASE_*` variables (Production and Preview). `vercel.json` sets headers and no caching for `sw.js`.
5. **First Super Admin**: the administrator requests an account in the deployed app; the developer runs `scripts/admin/bootstrap-admin.mjs <email>` once with a service-account key on a trusted machine, then deletes the key file.
6. **Optional App Check**: register reCAPTCHA v3, set `VITE_APPCHECK_SITE_KEY`, enforce App Check for Firestore after testing.
7. **GitHub feature control**: create environment `feature-control` with required reviewer = developer and secret `FIREBASE_SERVICE_ACCOUNT`; enable GitHub Pages ("GitHub Actions" source) to publish `dev-control/`. Run the workflow once to create `featureFlags/global`.
8. **Smoke test** with a real teacher account on a phone: install, enter marks offline, reconnect, publish a test sheet, look it up.

## Test hosting on GitHub Pages (before Vercel)

* `.github/workflows/pages.yml` builds with `BASE_PATH=/<repo>/` and publishes the app at `https://<user>.github.io/<repo>/` and the developer page at `…/<repo>/dev-control/`. Requires a public repository (free GitHub accounts) and Settings → Pages → Source = GitHub Actions.
* Firebase web configuration is read from repository **variables** `VITE_FIREBASE_*`.
* `.github/workflows/firestore-deploy.yml` runs the security-rules tests on the emulator, then deploys rules and indexes using the repository **secret** `FIREBASE_SERVICE_ACCOUNT`.
* Add `<user>.github.io` to Firebase Authentication → Settings → Authorized domains.
* First Super Admin without Node.js: request an account in the app, then in Firebase Console → Firestore → `users/<your uid>` set `role` = `super_admin` and `status` = `active`. (The console is restricted to project owners, so this is as safe as the bootstrap script.)
* The app works under any base path (`import.meta.env.BASE_URL`); Vercel builds use `/`.
