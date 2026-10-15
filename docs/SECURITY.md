# Security and privacy

## Principles

1. `firestore.rules` is the only authority. The client mirrors permissions only to hide controls.
2. Deny by default; a catch-all `match /{document=**}` denies everything not listed.
3. No privileged secret ever reaches the browser. The Firebase web config is public by design.
4. Feature flags never grant or remove permissions.

## Roles

* Roles live in `users/{uid}.role`, read by rules via `get()`. Custom claims would need Cloud Functions (Blaze), so they are not used.
* Self-registration may only create `{ role: 'teacher', status: 'pending' }` with the caller's own verified email address.
* Owners may change only `displayName`, `phone`, `prefs`. Only an active `super_admin` can change role or status.
* An admin cannot deactivate their own account from the app (prevents lock-out).
* Admins can create already-approved teacher profiles (`approvedBy` must be the admin); the Auth account is created through a secondary Firebase app instance so the admin's session is untouched.

## Super Admin bootstrap

No public admin-registration endpoint exists. The future administrator requests an ordinary account; the developer then runs `scripts/admin/bootstrap-admin.mjs <email>` on a trusted machine with a service-account key. The script refuses to run when an active admin already exists. Keys are listed in `.gitignore`.

## Teacher mark entry

A teacher can write `…/sessionSubjects/{subjectId}/marks/{studentId}` only when all are true: account active, teacher listed in that session subject's `teacherIds`, session in `ready_for_mark_entry` or `mark_entry_in_progress`, the subject is not marked submitted, the student is enrolled, `version` increments by one, `updatedBy` is the caller and `updatedAt` is server time. Range checks against component maxima are enforced by the client and again by the engine; publication refuses any `INVALID` or `INCOMPLETE` result.

## Public lookup and privacy

* Unpublished data is never copied to public collections, and every other collection denies unauthenticated reads.
* `publicResults/{id}` permits `get` but not `list`; the id is SHA-256 of `publicId|roll|verifier`.
* Public documents contain only fields in `PUBLIC_RESULT_FIELDS`; parents' names and student ID are off unless the admin enables them.
* **Known limitation:** roll numbers are small integers, so anyone who knows an exam can try rolls one by one — equivalent to a printed notice board. Mitigations, in order of strength: (1) enable a verifier (date of birth or a per-student PIN printed on the admit card) in Settings → Publication; (2) enable Firebase App Check (`VITE_APPCHECK_SITE_KEY`) to block scripted access; (3) unpublish old public results after the retention period. Default: verifier **off** to match the requested class/year/exam/roll workflow; the publication screen will recommend turning it on.

## Audit log

Append-only (`create` only; actor and server time enforced). Written in the same batch/transaction as: teacher approval, role/assignment changes, session creation and state changes, publication and corrections, settings changes, student imports, and mark changes made after submission. Routine first-time mark entry is captured by `updatedBy/version` on the mark document instead, to stay within free-tier write quotas.

## GitHub feature control

See `FEATURE_FLAGS.md`. The workflow passes inputs via environment variables (not `${{ }}` inside scripts) to prevent command injection, accepts only existing feature ids, and runs in a protected environment.

## Headers

`vercel.json` sets `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY` and a restrictive `Permissions-Policy`. A Content-Security-Policy is planned for Phase 2 once all asset origins (fonts, Firebase, App Check) are final.

## DOM safety

`core/dom.js#h` builds nodes with `textContent`; passing `html` throws. Names from the database are never parsed as HTML (covered by a print-layout test).

## Phase 2 additions
* Notifications: readable only by the recipient (or by admins for admin broadcasts); a reader can only add themselves to `readBy`; content carries exam titles, never marks or guardian data.
* Public lookup returns the same message for "no such roll", "wrong verifier" and network errors.
* Teachers cannot open another teacher's subject: the page refuses it, and the rules reject reads and writes of that subject's marks.
* Demo mode never runs when Firebase is configured and enforces no rules; it is labelled on every screen.
* See `KNOWN_LIMITATIONS.md` for what client-side enforcement cannot guarantee.
