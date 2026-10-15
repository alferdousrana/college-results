# Decision log

| # | Decision | Why | Alternatives rejected |
|---|---|---|---|
| 1 | Roles in `users/{uid}`, read by rules | Free tier; no Cloud Functions needed | Custom claims (needs Functions/Blaze) |
| 2 | Bootstrap admin with an Admin SDK script | No public escalation path | Hard-coded email in rules; "first user is admin" |
| 3 | Deterministic ids for sessions, roll registry, enrollments, marks | Duplicate prevention without a server | Query-then-write (racy) |
| 4 | Marks: one doc per student per subject under the subject path | No cross-teacher contention; rules can `get()` the assignment | One doc per subject; one doc per cell |
| 5 | Optimistic concurrency via `version` enforced in rules | Never silently overwrite newer marks | Last-write-wins |
| 6 | Own IndexedDB outbox for marks | Visible pending/conflict states; no silent rollback | Firestore offline writes alone |
| 7 | Public results as get-only hashed documents | No enumeration by query; minimal fields | Public read on results subcollection |
| 8 | Verifier off by default, recommended in UI | Matches requested lookup; risk documented | Mandatory PIN |
| 9 | Calculation snapshot stored with each publication | Old results never change with new settings | Recalculate on view |
| 10 | Feature flags: JSON in git + protected Actions → Firestore | No secrets in browser; audit via git | Token in GitHub Pages page; Firestore writes from the control page |
| 11 | Hash routing, plain ES modules, lazy Firebase | Static hosting, offline shell, small first load | Framework / history routing |
| 12 | Unicode Bangla only | Searchable, portable; correct rendering | Bijoy/SutonnyMJ ANSI encoding as in the reference PDF |
| 13 | Logos/signatures as small data URLs (Phase 2 default) | Cloud Storage needs Blaze on new projects | Storage bucket by default |
| 14 | Grading preset copied from the reference marksheet, labelled as a preset | Avoid inventing official rules | Hard-coded "board" rules |
| 15 | One UI family (Hind Siliguri) for Latin + Bangla | Consistent rhythm across languages | Separate English and Bangla UI fonts |
| 16 | Backend interface with Firestore + demo implementations | One repository codebase testable without credentials; demo clearly labelled | Mock data in pages |
| 17 | Bundled @fontsource fonts (11 English, 10 Bangla) | Offline printing; only list fonts that ship | Google Fonts at runtime; Kalpurush/SolaimanLipi (licence unclear, not packaged) |
| 18 | Build-generated service worker | New version per deploy, precache list | Static `sw.js` that never changes |
| 19 | Results store a bilingual view model | Reprints match publication in either language | Re-render from current records |
| 20 | `tt(en, bn)` inline copy for screens | Both languages written together | Hundreds of dictionary keys |
| 21 | Notifications as Firestore documents with bounded listeners | No FCM/server needed | Push notifications (needs a server key) |
