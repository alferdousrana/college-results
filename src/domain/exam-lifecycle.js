/**
 * Examination session lifecycle. The same table is mirrored in firestore.rules
 * (function validTransition) — keep them in sync; tests/unit/exam-lifecycle.test.js checks this file.
 */
export const ExamState = Object.freeze({
  DRAFT: 'draft',
  READY: 'ready_for_mark_entry',
  IN_PROGRESS: 'mark_entry_in_progress',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});

const S = ExamState;

/** from → [{ to, roles, label }] */
export const TRANSITIONS = Object.freeze({
  [S.DRAFT]: [{ to: S.READY, roles: ['super_admin'], action: 'share_with_teachers' }],
  [S.READY]: [
    { to: S.DRAFT, roles: ['super_admin'], action: 'withdraw' },
    { to: S.IN_PROGRESS, roles: ['super_admin', 'teacher', 'system'], action: 'first_mark_saved' },
  ],
  [S.IN_PROGRESS]: [{ to: S.SUBMITTED, roles: ['super_admin', 'system'], action: 'all_subjects_submitted' }],
  [S.SUBMITTED]: [
    { to: S.UNDER_REVIEW, roles: ['super_admin'], action: 'start_review' },
    { to: S.IN_PROGRESS, roles: ['super_admin'], action: 'reopen_mark_entry' },
  ],
  [S.UNDER_REVIEW]: [
    { to: S.PUBLISHED, roles: ['super_admin'], action: 'publish' },
    { to: S.IN_PROGRESS, roles: ['super_admin'], action: 'reopen_mark_entry' },
  ],
  [S.PUBLISHED]: [
    { to: S.UNDER_REVIEW, roles: ['super_admin'], action: 'start_correction' },
    { to: S.ARCHIVED, roles: ['super_admin'], action: 'archive' },
  ],
  [S.ARCHIVED]: [],
});

/** States in which assigned teachers may write marks. */
export const MARK_ENTRY_STATES = Object.freeze([S.READY, S.IN_PROGRESS]);

export function canTransition(from, to, role) {
  return (TRANSITIONS[from] ?? []).some((t) => t.to === to && t.roles.includes(role));
}

export function nextStates(from, role) {
  return (TRANSITIONS[from] ?? []).filter((t) => t.roles.includes(role));
}

export const LIFECYCLE_ORDER = [S.DRAFT, S.READY, S.IN_PROGRESS, S.SUBMITTED, S.UNDER_REVIEW, S.PUBLISHED, S.ARCHIVED];
