import { describe, it, expect } from 'vitest';
import { parseMarkInput } from '../../src/domain/validation/mark-input.js';
import { parseImportText, validateStudentImport } from '../../src/domain/validation/student-import.js';
import { validateSubjectDefinition } from '../../src/domain/validation/settings-validation.js';

describe('mark input', () => {
  it('parses Bangla digits, absent tokens and blanks', () => {
    expect(parseMarkInput('৮৫')).toEqual({ kind: 'number', value: 85 });
    expect(parseMarkInput('ab').kind).toBe('absent');
    expect(parseMarkInput('অ').kind).toBe('absent');
    expect(parseMarkInput('  ').kind).toBe('missing');
    expect(parseMarkInput('-3').kind).toBe('invalid');
    expect(parseMarkInput('8o').kind).toBe('invalid');
  });
});

describe('student JSON import', () => {
  it('rejects malformed JSON with a message', () => {
    expect(parseImportText('{oops').ok).toBe(false);
    expect(parseImportText('').ok).toBe(false);
  });
  it('reports duplicates, missing fields and unknown groups', () => {
    const { list } = parseImportText(JSON.stringify({ students: [
      { roll: 101, name: 'Diya' }, { roll: 101, name: 'Suraiya' }, { roll: 'x', name: '' }, { roll: 104, name: 'S', groupId: 'arts' }, { roll: 105, name: 'T', colour: 'red' },
    ] }));
    const { valid, errors } = validateStudentImport(list, { groupIds: new Set(['science']), existingRolls: new Set() });
    expect(valid).toEqual([]);
    const msgs = errors.map((e) => `${e.row}:${e.field}`);
    expect(msgs).toEqual(expect.arrayContaining(['2:roll', '3:roll', '3:name', '4:groupId', '5:colour']));
  });
  it('rejects rolls already in the class', () => {
    const { errors } = validateStudentImport([{ roll: '7', name: 'A' }], { existingRolls: new Set(['7']) });
    expect(errors[0].message).toMatch(/already exists/);
  });
  it('accepts a clean file', () => {
    const { valid, errors } = validateStudentImport([{ roll: 1, name: 'A' }, { roll: 2, name: 'B', customFields: { blood: 'O+' } }]);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(2);
  });
});

describe('subject definition', () => {
  it('catches pass marks above full marks', () => {
    expect(validateSubjectDefinition({ id: 'a', name: 'A', components: [{ id: 'cq', maxMarks: 50, passMarks: 60 }] }).length).toBe(1);
  });
});
