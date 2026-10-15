# Testing

| Command | What it runs | Status at the end of Phase 2 |
|---|---|---|
| `npm test` | Unit tests (Vitest, jsdom, fake-indexeddb) and workflow tests on the demo backend | **97 passing** |
| `npm run test:e2e` | Builds, serves the production build, drives headless Chromium in demo mode (`tests/e2e/run_e2e.py`) | **50 / 50 checks passing**; screenshots and PDFs in `tests/e2e/out/` |
| `npm run test:rules` | Security rules against the Firestore emulator (`vitest.rules.config.js`) | **Not run** — emulator download blocked in the build environment |
| `npm run build` | Production build | passing |
| `npm run validate:flags` | Feature configuration | passing |

No linter is configured; syntax is checked by the build and tests.

## Coverage by requirement

* **Calculation** (`calculation.test.js`, `session-calc.test.js`): all components passed; CQ / MCQ / practical failure despite a high total; missing marks; absent; full marks; above full marks; grade boundaries; GPA rounding (half-up, truncate); optional subject bonus and cap; failed required subject; tied ranks (competition, dense); incomplete sheets; separate group pools; elective subject lists; subjects excluded from totals; reproduction of the reference marksheet (850.60, GPA 4.70).
* **Workflows** (`tests/workflow/workflows.test.js`, demo backend): registration → approval → notification → audit; duplicate roll refusal; JSON import preview, skip vs update, row errors; examination creation and duplicate refusal; sharing blocked without teachers, then shared with notifications; outbox → transaction autosave; simultaneous edits produce a conflict and never overwrite; offline pending → later sync; absent ≠ missing; incomplete sheets cannot be published and are not ranked; publication snapshot unaffected by later grading changes; correction requires a reason and creates version 2; per-student history; withdrawal from public lookup; verifier required when configured; printing from stored results in Bangla.
* **Security rules** (`tests/integration/firestore-rules.test.js`, unrun): self-elevation, pending registration, assigned-subject writes, stale versions, teachers cannot publish, students/settings/audit/unpublished results hidden from teachers, audit immutability and actor binding, approval only by admin, flags read-only, private notifications, submitted subjects locked, public get-but-not-list.
* **Browser** (`tests/e2e/run_e2e.py`): English + light defaults; setup screen; demo banner; every admin page loads; missing marks and publish guard; subject component presets; wizard to share confirmation and sharing; every settings section; ten Bangla fonts in the designer; Bangla preview; Bangla interface and dark theme persist; full sheet print to PDF; teacher sees only own subjects; URL tampering refused; Enter navigation; autosave; max-mark validation; absent confirmation; offline pending, offline reload restoring edits, sync on reconnect; mobile layout without page overflow and bottom navigation; public lookup with generic not-found, unpublished exams hidden, Bangla digits, guardian fields hidden, chrome hidden in print; valid manifest; active service worker; no uncaught errors.
* The real install prompt (`beforeinstallprompt`) cannot be triggered in headless Chromium; the once-only logic is covered by code review only.
