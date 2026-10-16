# Feature flags and developer control

## Goal

The developer can switch optional features on or off for a college and show an upgrade message, from a page outside the normal app, without exposing any secret.

## How it works now (round 2): direct control from the developer page

The developer page (`https://<user>.github.io/<repo>/dev-control/`, built only for GitHub Pages) changes features directly, with three locks that are all enforced by **Firestore security rules**, not by the page:

1. **Firebase email + password.** The sign-in lasts only while the browser tab is open.
2. **Developer registration.** The account's uid must exist in `developers/{uid}`. That collection has *no* client read or write access, so it can only be created in the Firebase console by a project owner.
3. **Secret question.** The question text is in `developerProfiles/{uid}` (readable only by that developer). The answer is never stored; `developers/{uid}.answerHash` holds SHA-256(`uid|answer`, lower-cased, spaces collapsed). Answering creates `developerSessions/{uid}` with that proof and an expiry of at most 30 minutes; rules accept it only if the proof equals the stored hash. Every flag change re-checks the session and expiry.

Saving writes `featureFlags/global` (version must increase by exactly one, `updatedBy` = caller, server time) and an append-only `featureFlagHistory` entry in one batch. The college app listens to `featureFlags/global` and updates within seconds, showing a short notice. The page lists the last ten changes.

`config/feature-flags.json` remains the **build-time default** (what the app uses before the first save, or offline). The old GitHub Actions "Feature control" workflow and its scripts were removed so there is only one place that changes live flags.

### One-time setup
1. Firebase Console → Authentication → Users → **Add user** (developer email + strong password). Use an account that is not a college staff account.
2. Open the developer page, sign in. It shows "Not registered" with your uid; enter a question and answer and press **Generate setup values**.
3. Firebase Console → Firestore → create `developers/<uid>` with string field `answerHash`, and `developerProfiles/<uid>` with string field `question`, using the generated values.
4. Reload the page and answer the question.

### Limits (honest)
* Firestore rules cannot count attempts, so wrong answers are not rate-limited by the server (the page stops after 5 tries per sign-in; the password itself is rate-limited by Firebase Auth). Use a long, uncommon answer.
* Anyone who owns the Firebase project can edit `developers` in the console. If the college ever owns the project, the developer lock is only as strong as that ownership.
* Flags hide or show optional features only. Nothing protected depends on a flag; critical capabilities (authentication, authorization, mark validation, audit log, result privacy, data export) are never flags.
