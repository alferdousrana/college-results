# Feature flags and developer control

## Goal

The developer can switch optional features on or off for a college and show an upgrade message, from a page outside the normal app, without exposing any secret.

## Why a static GitHub page cannot do it directly

GitHub Pages serves static files. Changing configuration needs an authenticated write; putting a GitHub token or Firebase key in that page would let anyone take it. So the page is **read-only** and changes go through a protected GitHub Actions workflow.

## Flow

1. `config/feature-flags.json` (version-controlled) defines every feature: stable id, category, label, enabled, optional bilingual message; plus a default message and optional `upgradeUrl`.
2. The developer opens the GitHub Pages control page (`dev-control/`). It lists the committed state, prepares the exact values (state, bilingual upgrade message, optional upgrade link) to paste into **Actions → Feature control → Run workflow**, and shows the result of recent runs (public repositories; the unauthenticated GitHub API allows 60 requests per hour). GitHub handles sign-in.
3. The workflow (`.github/workflows/feature-flags.yml`) runs in the `feature-control` environment (configure required reviewers = the developer). It accepts only existing ids, validates the file, commits the change with the actor's name, then syncs it to Firestore `featureFlags/global` using the `FIREBASE_SERVICE_ACCOUNT` environment secret.
4. The app listens to `featureFlags/global` and updates within seconds. Without it (offline, first run) the build-time defaults from the JSON are used.

History and rollback are ordinary git commits. Rules make `featureFlags` readable by all and writable by nobody (the Admin SDK bypasses rules).

## Rules for flags

* Flags hide or show **optional** features only. Authentication, authorization, mark validation, audit logging, published-result privacy and data export are `CRITICAL_CAPABILITIES`: they are not flags, the validator rejects them, and `isEnabled()` always returns true for them.
* Unknown ids from Firestore are ignored; `upgradeUrl` must be `https://`.
* A disabled feature shows an honest notice (`ui/components/feature-gate.js`), never a dead button.
* Turning off a feature never deletes data.

## Trade-off

Changes take effect after the workflow runs (~30–60 s) rather than instantly, and need a GitHub account with write access. This avoids paid infrastructure and keeps every secret inside GitHub.

## Implemented flags

`json_student_import`, `custom_student_fields`, `public_result_lookup`, `progress_report_print`, `result_sheet_print`, `custom_print_fonts`, `offline_mark_entry`, `historical_archive`, `bangla_interface`, `dark_theme`, `audit_log_viewer`. Each is checked where the feature is offered and shows the upgrade notice when off. (The Phase 1 placeholder `qr_verification` was removed because no QR feature exists.) Administrators see the status in Settings → Feature availability and cannot change it. When a flag changes while the app is open, users get a short notice.
