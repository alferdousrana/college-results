# SAGSC Exam Management System — Handover for a new support chat

> **বাংলায় ব্যবহারের নিয়ম:** নতুন চ্যাটে সমস্যা নিয়ে আসলে এই ফাইলটা আপলোড করুন, সাথে
> (১) কী করতে চেয়েছিলেন, (২) কী হলো — স্ক্রিনশট বা error-এর পুরো লেখা, (৩) কোন পেজে/কোন ধাপে।
> কোড বদলাতে হলে সংশ্লিষ্ট ফাইলগুলো (বা পুরো প্রজেক্টের zip, `node_modules` বাদে) আপলোড করুন।
> নিচের অংশটা ইংরেজিতে, যাতে যেকোনো AI বা ডেভেলপার সঙ্গে সঙ্গে পুরো সিস্টেম বুঝতে পারে।

---

## 1. What this is
A result and examination management web app for **Shirjug Azimunnesa Girls' School & College (SAGSC), Shekherhat, Jhalokathi** (HSC classes Eleven and Twelve; groups Science, Humanities, Business Studies). Bangla + English interface. Built over many rounds in one long chat; this file is the summary.

| Item | Value |
|---|---|
| Live site (main) | https://sagsc.vercel.app (Vercel, auto-deploys `main`) |
| Backup site | https://alferdousrana.github.io/college-results/ (GitHub Pages) |
| Developer feature page | https://alferdousrana.github.io/college-results/dev-control/ (GitHub Pages only) |
| Repository | https://github.com/alferdousrana/college-results (public) |
| Firebase project | `college-results-737c6` (Auth Email/Password + Firestore, region asia-south1, Spark/free plan) |
| Local folder (owner's PC) | `D:\Rana\20 Project\college-result-system-phase2\crms` |
| Owner / developer | Md. Al Ferdous (alferdousrana) |

## 2. Stack and principles
* Plain ES modules + Vite (no framework), Firebase Auth + Firestore, PWA with build-generated service worker, IndexedDB offline outbox for marks, hash routing (`#/...`).
* **Firestore security rules are the only real authority.** Client checks only show/hide UI.
* Backend interface (`src/data/backend/`) with two implementations: `firestore-backend.js` and `demo-backend.js` (browser demo mode; all tests run on it).
* Bilingual copy written inline as `tt('English', 'বাংলা')`; numbers via `formatNumber` (Bangla digits).
* Printing: HTML print documents (`src/print/`), bundled OFL fonts, A4/Legal, fit-to-width full sheets.

## 3. Roles and rights
* `super_admin` — everything. First admin was made by editing `users/{uid}` in the Firebase console (`role: super_admin`, `status: active`).
* `teacher` — enters marks only for subjects assigned in a result sheet; mark entry closes at the sheet's deadline.
* `staff` — login created by the Super Admin on the **Staff** page; cannot enter marks.
* **Grants** (`users/{uid}.grants.students = true`, set only by Super Admin): teacher or staff may add/edit/import students and change status — **not delete**, not see published-result history.
* Students have no account; they use the public lookup page.
* Developer: separate Firebase Auth user listed in `developers/{uid}` (+ `developerProfiles/{uid}` with the secret question); unlocks feature flags on the dev-control page for 30 minutes.

## 4. Main features (where to find them)
* **Settings**: appearance; institution (name, address, motto "শিক্ষা শান্তি প্রগতি", logo, signatures, seal); result page for students (banner, description, notice); student fields; teacher fields (key `nameBn` = Bangla name for duty sheets); examinations (Load starter data, repair subject links); grading; print design (fonts, border styles incl. college-name micro-text, motto spread, page colour, watermark, marksheet/full-sheet columns, A4/Legal); result publication (which details are public, verifier); retention; features.
* **Classes & groups**: sessions (e.g. `2026-2027`), classes, groups with rules (`choiceCount`, `requiresFourth`, `examsPerStudent` = 9), examination names.
* **Subjects** (26 from the college's sheets; board codes from the HSC 2026 routine): role per group (compulsory / choice / 4th-only), shared full-sheet column, **paper scheme per class** (`combined` = 1st+2nd together, e.g. Class Eleven; `second` = 2nd paper only, e.g. Class Twelve). Bangla and English are two linked subjects each (`combine.key`), graded together.
* **Students**: list with group-wise counts, add/edit with subject chooser (main subjects + 4th), JSON import (groups/subjects may be given by name), safe delete.
* **Teachers**, **Staff**, **Assignments** (by group, one assignment covers all classes of a subject).
* **Result sheets**: 5-step wizard (details incl. mark-entry deadline, subjects & group rules, teachers, students & choices, review) → share → mark entry → close → review → publish → corrections, public-lookup refresh ("Apply current design and settings"), delete (draft, or any sheet with reason + typing DELETE).
* **Exam routine** (before any result sheet): columns = class + exam + session; dates and subjects; printed routine (Bangla); attendance sheets (হাজিরা, 2 per page); invigilator duty sheet (teachers + staff, signature boxes, committee); admit cards (4 per A4 landscape, all or selected students, valid-until date); seat cards (default 8 per page).
* **Printing**: full result sheet (serial per group, all groups in one print, Science → Humanities → Business), individual marksheet (codes, combined papers, watermark, centred), student lookup view (fit-to-screen + zoom).
* **Dashboard**: head counts (teachers, staff, students by class and group).
* Teacher home: greeting, countdown to the nearest mark-entry deadline, coloured subject tiles.

## 5. Calculation rules (short)
Component pass marks fail the subject even if the total passes; missing ≠ 0 ≠ absent; incomplete results are not ranked; 4th subject adds only points above the deduction; combined papers sum marks and fail if any paper fails; merit per group. Full details: `docs/CALCULATION.md`.

## 6. Data model (key paths)
`institution/public`, `settings/*`, `academicYears`, `classes`, `groups`, `subjects`, `examDefinitions`, `teacherAssignments`, `users`, `staff`, `students` (+`publishedResults`), `classEnrollments`, `examSessions/{year__class__exam}` (+`sheets`, `sessionSubjects/{id}/marks`, `enrollments`, `results`, `publications`), `publicResults`, `publicExamIndex`, `routines`, `notifications`, `auditLogs`, `featureFlags`, `developers`, `developerProfiles`, `developerSessions`. Full list: `docs/DATA_MODEL.md`.

## 7. Deployment pipeline
* **GitHub → Vercel**: Vercel project `sagsc`, root `./`, `vercel.json` (install `npm ci`, build `node scripts/guard.mjs && npm run build`, output `dist`, long cache for `/assets/*`, no-cache for `index.html`/`sw.js`). Environment variables on Vercel: the six `VITE_FIREBASE_*` values. **Do not** set `BASE_PATH` or `BUILD_DEV_CONTROL` on Vercel.
* **GitHub Actions** (`.github/workflows/`):
  * `pages.yml` — tests, build with `BASE_PATH=/college-results/` and `BUILD_DEV_CONTROL=1`, deploy to GitHub Pages. Repository **variables** `VITE_FIREBASE_*`.
  * `firestore-deploy.yml` — runs security-rules tests on the emulator, then deploys `firestore.rules` + `firestore.indexes.json`. Runs on push when rules/indexes/tests change, or manually. Needs repository **secret** `FIREBASE_SERVICE_ACCOUNT` (JSON key of service account `github-deploy` with roles Firebase Rules Admin, Cloud Datastore Index Admin, Service Usage Consumer, Firebase Viewer).
  * `ci.yml` — tests on pull requests.
  * Every workflow first runs **`scripts/guard.mjs`** (supply-chain guard, see §9).
* Firebase **Authorized domains** must include `sagsc.vercel.app` and `alferdousrana.github.io`.
* Free-plan limit to watch: ~50,000 Firestore reads/day. Before a big result day consider Blaze + a budget alert.

## 8. How updates are applied (owner's routine)
1. Download the update zip (contains only changed files, same folder structure).
2. PowerShell:
   ```powershell
   cd "D:\Rana\20 Project\college-result-system-phase2\crms"
   Expand-Archive -Path "$HOME\Downloads\<update>.zip" -DestinationPath . -Force
   git add .
   git commit -m "<what changed>"
   git push
   git fetch; git log --oneline -1   # must show (HEAD -> main, origin/main)
   ```
3. Wait for Actions/Vercel to turn green; refresh the site with Ctrl+Shift+R.
* Apply updates **in order**; a skipped update breaks the build (it happened once: a missing `routine-repository.js`). If unsure, ask for a full "sync" zip (all files except `package.json`/`package-lock.json` only if those were intentionally customised — normally include them).
* Never edit files on the GitHub website; if it happened, run `git pull` before the next update.
* LF/CRLF warnings are harmless. If Vim opens during a merge: `Esc`, `:wq`, Enter. Editor can be switched: `git config --global core.editor "notepad"`.

## 9. Security incident (Oct 2026) — important history
* An obfuscated `api.js` was injected and `package.json` build changed to `node api.js && vite build`; commits were rewritten under the owner's name (local hash `e5f411e` became `6a348e8` on GitHub). Likely cause: a malicious VS Code extension stealing the saved GitHub token (suspect: `bracketpaircolordlw.bracket-pair-color-dlw`, removed). No git hooks or git config tampering were found.
* Clean-up done: `api.js` removed, clean `package.json`/`package-lock.json`/`vite.config.js`/`.gitignore` restored, saved credentials removed and re-authorised through Git Credential Manager, old Firebase service account deleted (new `github-deploy` account to be used), tamper guard added.
* **Guard (`scripts/guard.mjs`)** stops builds when it finds: unexpected top-level scripts, changed `package.json` scripts or install hooks, lines starting with hundreds of spaces/tabs, very long obfuscated lines, or markers like `global['!']`, `createRequire(import.meta.url)`. If a build fails with "The repository looks tampered with", treat it as an attack: stop, check `git log`, compare `git log --oneline -1` with `origin/main`.
* Recommended standing settings: GitHub 2FA, repository ruleset "Block force pushes" on `main`, review GitHub → Settings → Applications / Security log occasionally, keep VS Code extensions minimal and from verified publishers.

## 10. Common problems seen and their fixes
| Symptom | Cause / fix |
|---|---|
| Site shows "Connect the database" | `VITE_FIREBASE_*` variables missing in the build environment (GitHub variables or Vercel env). |
| Login fails on a new domain | Add the domain in Firebase → Authentication → Settings → Authorized domains. |
| Firestore deploy 403 "caller does not have permission" | Service account lacks roles (see §7). |
| Pages that save routines/staff/grants give "permission" errors | New rules not deployed yet → run "Deploy Firestore rules & indexes". |
| Build: "Could not resolve …/x.js" | An update was skipped; apply it or a sync zip. |
| `git push` rejected (non-fast-forward) | Remote has commits you don't have → `git pull` (then `:wq` in Vim), then push. Find out why the remote changed. |
| `git push` "Invalid username or token" | Saved token revoked → remove GitHub entries in Windows Credential Manager, `git config --global credential.helper manager`, push and sign in in the browser. |
| "Could not resolve host: github.com" | Internet/DNS; `ipconfig /flushdns`, retry. |
| JSON import "Unknown group" | Group/subject name in the file does not match the app (spelling); names or ids both work. |
| Assignments/subjects in the wrong group | Settings → Examinations → "Check and repair subject links". |
| WhatsApp shows old preview | Share `https://sagsc.vercel.app/?v=N`; Facebook: Sharing Debugger → Scrape Again. |
| Printed colours/background missing | Tick "Background graphics" in the browser print dialog. |

## 11. Testing (for a developer)
* `npm test` — unit + workflow tests on the demo backend (126 at handover).
* `npm run test:e2e` — headless Chromium against a production build in demo mode (67 checks).
* `npm run test:rules` — Firestore emulator (runs in GitHub Actions; 21+ cases incl. deadline, deletion, grants, developer control).
* Demo mode: open `/#/demo` on a build without Firebase configuration.

## 12. Template for asking for help in a new chat
```
I maintain the SAGSC Exam Management System. The handover file is attached (docs/HANDOVER.md).
Problem: <what happened>
Where: <page / workflow / command>
Steps I did: <1, 2, 3>
Error (full text or screenshot): <…>
What I expected: <…>
Files attached: <list, or the full project zip without node_modules>
Please give changed files as a zip with the same folder structure and the PowerShell commands to apply them,
and explain in Bangla.
```
