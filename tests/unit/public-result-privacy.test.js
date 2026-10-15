import { describe, it, expect } from 'vitest';
import { sanitizeViewModel } from '../../src/print/view-models.js';
import { lookupResultId } from '../../src/data/repositories/public-results-repository.js';

const vm = { student: { name: { en: 'A' }, roll: '7', groupId: 'science', fatherName: 'F', motherName: 'M', studentCode: 'S1', section: 'A', shift: 'Day',
  custom: [{ key: 'bloodGroup', value: 'O+' }, { key: 'guardianPhone', value: '017' }] }, gpa: 5 };

describe('published result privacy', () => {
  it('strips guardian, ID and custom fields by default', () => {
    const s = sanitizeViewModel(vm, []).student;
    expect(s.fatherName).toBeNull(); expect(s.motherName).toBeNull(); expect(s.studentCode).toBeNull(); expect(s.section).toBeNull();
    expect(s.custom).toEqual([]);
  });
  it('includes only fields explicitly allowed', () => {
    const s = sanitizeViewModel(vm, ['fatherName', 'custom:bloodGroup']).student;
    expect(s.fatherName).toBe('F'); expect(s.motherName).toBeNull();
    expect(s.custom.map((c) => c.key)).toEqual(['bloodGroup']);
  });
  it('lookup id is a stable hash that changes with the verifier', async () => {
    const a = await lookupResultId('pub1', '007');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await lookupResultId('pub1', '7')).toBe(a);
    expect(await lookupResultId('pub1', '7', '2010-01-01')).not.toBe(a);
    expect(await lookupResultId('pub2', '7')).not.toBe(a);
  });
});
