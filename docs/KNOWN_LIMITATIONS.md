# Known limitations and trade-offs

## Not yet verified
* **Security rules** run on the emulator in GitHub Actions before each deploy (first run passed). The four developer-control cases added in round 2 run on the next deploy.
* **No real Firebase project, Vercel deployment or GitHub workflow run** has been tested. Everything that ran used the demo backend, which does not enforce rules.
* The browser checks ran in headless Chromium only (desktop and a 390 px phone viewport). Safari/iOS, Firefox and real devices are untested.

## Security model limits (free tier, no backend)
* Roles are checked by rules reading `users/{uid}`; there are no Cloud Functions. Publication is a sequence of admin batches from the browser; a crash part-way leaves the sheet "under review" and publishing again overwrites the same documents.
* **Audit entries are written by the client** under rules that force actor and server time and forbid edits/deletes. They are reliable for "who did what" against teachers, but a Super Admin with database console access, or a modified client using an admin account, could write misleading entries. Tamper-evident logs need a trusted backend (Cloud Functions, Blaze plan).
* Mark range checks (≤ full marks) are enforced by the client and again before publication, not inside rules (rules do not know each component's maximum).
* Public lookup without a verifier lets anyone who knows an exam try roll numbers one by one. Turn on the verifier in Settings → Result publication and enable App Check.
* Feature flags hide optional features only. A "locked" feature is not a security boundary; nothing protected depends on a flag.
* Retention is manual: nothing is deleted automatically (no scheduled server job on Spark).
* Admin-created teacher accounts use a temporary password plus a reset email; the admin must pass the temporary password privately.

## Offline
* Only mark entry works offline (and viewing pages already loaded). First sign-in, approvals, sharing, review, publication, settings and public lookup need a connection.
* Background Sync is not used; unsent marks are sent when the app is open and online (on start, on reconnect and every 30 s).
* iOS Safari can clear site data for non-installed web apps after about 7 days; install the app on phones.
* In private browsing IndexedDB may be unavailable; Settings says so and offline entry is not durable there.
* Firestore's own cache uses multi-tab persistence; the outbox is per device, keyed per teacher.

## Printing
* Page numbers use CSS `@page` margin boxes: shown in current Chrome/Edge, omitted by browsers that do not support them.
* "PDF output" is the browser's Save as PDF.
* Very wide sheets (many subjects with per-paper columns) rely on the configurable sheet table font size and "Total only" mode to fit A4 landscape.
* Bijoy/SutonnyMJ text from old spreadsheets is not converted; type or import Unicode Bangla.

## Quota and growth (Spark plan: 50k reads, 20k writes, 20k deletes per day; 1 GiB storage)
| Action | Approximate cost |
|---|---|
| One mark save | 2 reads + 2 writes (mark + audit) — a 60-student, 10-subject sheet ≈ 1,200 writes if each row is saved once |
| Opening a sheet page (admin) | ~ subjects + students + marks documents (e.g. 15 + 60 + 600 reads) |
| Publishing 60 students | ~ 3 × 60 writes + 60 reads + a few |
| Public lookup | 2 reads |
A college with ~1,000 students and 3 examinations a year fits comfortably if staff avoid repeatedly reloading large sheets. Several institutions, or heavy public lookup on result day, may need the Blaze plan (pay-as-you-go; still no fixed cost). Quota errors are shown as a plain message and marks stay in the device outbox.
