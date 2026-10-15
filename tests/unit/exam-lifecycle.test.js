import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExamState, canTransition, TRANSITIONS } from '../../src/domain/exam-lifecycle.js';

describe('exam lifecycle', () => {
  it('teachers cannot publish', () => expect(canTransition(ExamState.UNDER_REVIEW, ExamState.PUBLISHED, 'teacher')).toBe(false));
  it('admin can publish from review only', () => {
    expect(canTransition(ExamState.UNDER_REVIEW, ExamState.PUBLISHED, 'super_admin')).toBe(true);
    expect(canTransition(ExamState.DRAFT, ExamState.PUBLISHED, 'super_admin')).toBe(false);
  });
  it('archived is terminal', () => expect(TRANSITIONS[ExamState.ARCHIVED]).toEqual([]));
  it('firestore.rules mirrors every admin transition', () => {
    const rules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    for (const [from, list] of Object.entries(TRANSITIONS)) {
      for (const t of list.filter((x) => x.roles.includes('super_admin'))) {
        expect(rules, `${from} -> ${t.to}`).toContain(`['${from}', '${t.to}']`);
      }
    }
  });
});
