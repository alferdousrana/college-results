# Firestore data model

All ids that prevent duplicates are deterministic (built in `src/data/paths.js`). Timestamps use `serverTimestamp()`.

## Collections

| Path | Purpose | Key fields | Who writes |
|---|---|---|---|
| `institution/public` | Name (en/bn), address, logo, signatories, print branding — needed by public marksheets | `name{en,bn}`, `address{en,bn}`, `logo`, `signatories{principal,committee}` | admin |
| `institution/private` | Contact phone/email, internal notes | | admin |
| `users/{uid}` | Staff profile and approval | `role` (`super_admin`/`teacher`), `status` (`pending`/`active`/`rejected`/`disabled`), `displayName`, `email`, `prefs`, `approvedBy/At` | self (pending teacher only), admin |
| `settings/grading` | Current grading scale + policy (editable) | `scale[]`, `policy{}`, `revision` | admin |
| `settings/publication` | Lookup verifier type, optional public fields | `verifier: none|dob|pin`, `publicStudentFields[]` | admin |
| `settings/print` | Fonts, sizes, borders, signatures, headings | see `print/print-settings.js` | admin |
| `settings/studentFields` | Custom student field definitions | `fields[{key,label{en,bn},type,required}]` | admin |
| `settings/retention` | Archive policy | | admin |
| `academicYears/{yearId}` | e.g. `2026` | `label`, `order`, `active` | admin |
| `classes/{classId}` | e.g. `class-11` | `name{en,bn}`, `groupIds[]`, `order` | admin |
| `groups/{groupId}` | Science / Humanities / Business Studies | `name{en,bn}` | admin |
| `subjects/{subjectId}` | Catalogue | `code`, `name{en,bn}`, `components[{id,label,maxMarks,passMarks,scale,paper}]`, `passMarks`, `classIds[]`, `groupIds[]`, `optionalEligible` | admin |
| `examDefinitions/{examDefId}` | Examination names (Half-yearly, Annual, Test…) | `name{en,bn}`, `order` | admin |
| `teacherAssignments/{teacher__subject__class}` | Default assignments | `teacherId`, `subjectId`, `classId` | admin |
| `students/{studentId}` | Private student record | names, parents, `studentCode`, `status` (`active`/`inactive`/`transferred`), `customFields` | admin |
| `classEnrollments/{year__class__roll}` | Roll registry — **unique roll per class/year** | `studentId`, `yearId`, `classId`, `roll`, `rollNumber`, `groupId`, `optionalSubjectId`, `status` | admin |
| `examSessions/{year__class__examDef}` | One examination of one class — **unique** | `state`, `title`, `heldOn`, `groupIds[]`, `teacherIds[]` (denormalised union), `publicId`, `publishedVersion` | admin; teacher may only move `ready → in_progress` |
| `…/sheets/{groupId}` | Result sheet per group | `subjectIds[]`, heading overrides | admin |
| `…/sessionSubjects/{subjectId}` | Subject snapshot for this exam | frozen `definition` (components, pass marks), `groupIds[]`, `teacherIds[]`, `submission{state,by,at}` | admin; teacher: `submission` only |
| `…/sessionSubjects/{subjectId}/marks/{studentId}` | **One doc per student per subject** | `components{cq: 45, mcq: 'AB', prac: null}`, `absent`, `version`, `updatedBy`, `updatedAt`, `clientUpdatedAt` | assigned teacher / admin |
| `…/enrollments/{studentId}` | Who sits this exam (snapshot of roll/name/group) | `roll`, `name`, `groupId`, `optionalSubjectId`, `status` | admin |
| `…/results/{studentId}` | Computed result | `vm` (bilingual marksheet view model — names, rolls, subject definitions and grades frozen at calculation), `position`, `gpa`, `state`, `publishedVersion`, `calcFingerprint` | admin |
| `…/publications/{n}` | Append-only publication history | `publishedAt`, `by`, `snapshot` (scale, policy, subjects, engine version), `fingerprint`, `reason` | admin, create only |
| `publicResults/{sha256}` | Minimal public marksheet | `publicId`, `version`, sanitized `vm` (`print/view-models.js#sanitizeViewModel`) | admin |
| `publicExamIndex/{publicId}` | Published exam list + frozen print context | `classLabel`, `examLabel`, `yearLabel`, `requiresVerifier`, `verifierLabel`, `institution` snapshot (names, logo, signatures, seal), `print` settings, `scale`, `version` | admin |
| `notifications/{auto}` | In-app notifications | `recipientUid` or `audience: 'admins'`, `type`, `params` (titles only), `link`, `readBy[]`, `createdAt`, `senderUid` | any active user (broadcast to admins) / admin (to teachers) |
| `students/{id}/publishedResults/{sessionId}` | Per-student published history | roll, GPA, grade, position, version, `publishedAt` | admin at publication |
| `auditLogs/{auto}` | Append-only audit | `action`, `actorUid`, `actorRole`, `targetPath`, `before`, `after`, `reason`, `at` | any active user, create only |
| `featureFlags/global` | Runtime feature switches | mirrors `config/feature-flags.json` | GitHub Actions only |

## Why marks are one document per student per subject

* Two teachers never write the same document, so there is no write contention between subjects.
* A document per cell would cost one write per keystroke-commit; per student+subject is one write per student row, which fits the free tier (20k writes/day ≈ 30 full class sheets of 60 students × 10 subjects).
* The path contains `subjectId`, so rules can check the assignment with `get()` even for list queries.
* A per-subject document holding every student was rejected: offline edits on two devices would conflict on the whole class.

## Denormalisation and synchronisation

| Copy | Source of truth | Kept in sync by |
|---|---|---|
| `examSessions.teacherIds` | union of `sessionSubjects.*.teacherIds` | the same batch that changes an assignment |
| `enrollments.{roll,name,groupId}` | `classEnrollments` / `students` | copied when shared; frozen at publication |
| `sessionSubjects.definition` | `subjects/{id}` | copied when the sheet is created; edits to the catalogue never change an existing exam |
| `publicResults` | `results` + publication snapshot | rewritten only by publish / correction |

## Historical integrity

Publishing stores a calculation snapshot (`domain/calculation/snapshot.js`) — scale, policy, subject definitions, engine version and a fingerprint — in `publications/{n}`. Re-printing a published result uses the stored view model, never the current settings. A correction creates publication `n+1` with a reason; earlier publications are never edited (rules: create-only).

## Edge cases

| Case | Handling |
|---|---|
| Duplicate roll | `classEnrollments` id includes roll; import validator also checks file and existing rolls |
| Duplicate session / enrollment / mark | deterministic ids + `create` inside transactions |
| Teacher reassigned after marks entered | marks keep `updatedBy`; new teacher gains access, old loses it; audit entry records the change |
| Student transferred | `classEnrollments.status = transferred`, new enrollment in the new class; past results untouched |
| Deleted / deactivated student | never hard-deleted; `status: inactive`, excluded from new sheets, kept in history |
| Concurrent edits | `version` must increase by exactly one (rules) → transactional sync reports conflict |
| Published result needs correction | `published → under_review` with a reason; republish creates a new publication record |
| Missing vs absent vs zero | `null` / `'AB'` / `0` — three different values all the way through the engine |

## Limits considered

* Document size 1 MiB: the largest documents are `publications/{n}` snapshots (a few KB) and data-URL logos (keep < 200 KB).
* `in`/`array-contains-any` limits: lookups use deterministic ids, not big `in` queries.
* Rules `get()` budget (10 per single-doc request): the heaviest rule (`marks` write) uses users, session, sessionSubject, enrollment = 4.

## Phase 2 notes
* `sessionSubjects.definition` now also stores `order` (catalogue order) so marksheets list subjects consistently.
* Enrollment `subjectIds` (optional) narrows a student's subjects within the group (electives); `findMissingMarks` and the engine respect it.
* Composite indexes for every query used are in `firestore.indexes.json` (students by class/year/roll, users by role/status, sessions by year/state, notifications, audit by action).

## Round 4 fields
* `subjects`: `combine { key, name{en,bn}, paper }`, `groupRoles { groupId: compulsory|choice|fourth }`, `sheetColumns { groupId: columnKey }` (alternatives sharing a full-sheet column).
* `groups.rules { choiceCount, requiresFourth, examsPerStudent }` — defaults copied into each result sheet.
* `examSessions/{id}/sheets/{groupId}`: `subjectRoles`, `subjectColumns`, `choiceCount`, `requiresFourth`, `examsPerStudent`.
* `sessionSubjects.definition.combine` (frozen copy).
* `examSessions/{id}.deleting { reason, by, at }` while a whole sheet is being deleted.
* Sessions are the `academicYears` collection (label such as `2026-2027`).
* `config/starter-data.json`: the college's starter catalogue, loaded from Settings → Examinations.
