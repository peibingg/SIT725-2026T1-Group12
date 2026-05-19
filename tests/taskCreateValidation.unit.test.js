'use strict';

require('../public/js/taskCredits');
const {
  allowedCreditsForBalance,
  validateTitle,
  validateDescription,
  validateCreditSelection,
  validateCreateTaskForm,
  TITLE_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} = require('../public/js/taskCreateValidation');

describe('taskCreateValidation helpers', () => {
  it.each([
    [0, []],
    [3, [1, 3]],
    [4, [1, 3]],
    [10, [1, 3, 5, 8]],
  ])('allowedCreditsForBalance(%i)', (balance, expected) => {
    expect(allowedCreditsForBalance(balance)).toEqual(expected);
  });

  it('validateTitle enforces trimmed length 3–200', () => {
    expect(validateTitle('  ab ').ok).toBe(false);
    expect(validateTitle('abc').ok).toBe(true);
    expect(validateTitle('a'.repeat(200)).ok).toBe(true);
    expect(validateTitle('a'.repeat(201)).ok).toBe(false);
  });

  it('validateDescription requires non-empty and max 20000', () => {
    expect(validateDescription('   ').ok).toBe(false);
    expect(validateDescription('hello').ok).toBe(true);
    expect(validateDescription('x'.repeat(20000)).ok).toBe(true);
    expect(validateDescription('x'.repeat(20001)).ok).toBe(false);
  });

  it('validateCreditSelection rejects values above balance', () => {
    expect(validateCreditSelection(5, 4).ok).toBe(false);
    expect(validateCreditSelection(3, 4).ok).toBe(true);
    expect(validateCreditSelection(2, 10).ok).toBe(false);
  });

  it('validateCreateTaskForm returns normalized payload', () => {
    const r = validateCreateTaskForm({
      title: '  My task  ',
      description: ' Details ',
      credit: 3,
      creditBalance: 10,
    });
    expect(r.ok).toBe(true);
    expect(r.title).toBe('My task');
    expect(r.description).toBe('Details');
    expect(r.credit).toBe(3);
  });

  it('validateCreateTaskForm rejects zero balance', () => {
    const r = validateCreateTaskForm({
      title: 'Valid title',
      description: 'Body',
      credit: 1,
      creditBalance: 0,
    });
    expect(r.ok).toBe(false);
  });

  it('exports limits aligned with backend', () => {
    expect(TITLE_MIN_LENGTH).toBe(3);
    expect(TITLE_MAX_LENGTH).toBe(200);
    expect(DESCRIPTION_MAX_LENGTH).toBe(20000);
  });
});
