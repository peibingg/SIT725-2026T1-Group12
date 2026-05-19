'use strict';

const { validateTaskCreatePayload } = require('../validators/task.validation');
const { TASK_CREDIT_OPTIONS } = require('../constants/taskCredits');

const valid = {
  title: 'Valid task title',
  description: 'A non-empty description.',
  credit: 3,
  creditBalance: 10,
};

describe('validateTaskCreatePayload (table-driven)', () => {
  it('accepts a valid payload', () => {
    const r = validateTaskCreatePayload(valid);
    expect(r.ok).toBe(true);
    expect(r.title).toBe(valid.title);
    expect(r.description).toBe(valid.description);
    expect(r.credit).toBe(3);
  });

  it.each([
    ['title', { ...valid, title: undefined }],
    ['description', { ...valid, description: undefined }],
    ['credit', { ...valid, credit: undefined }],
  ])('rejects missing %s', (field, payload) => {
    const r = validateTaskCreatePayload(payload);
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(400);
  });

  it.each([
    ['title', { ...valid, title: 123 }],
    ['description', { ...valid, description: ['not', 'a', 'string'] }],
    ['title', { ...valid, title: true }],
  ])('rejects non-string %s', (_label, payload) => {
    const r = validateTaskCreatePayload(payload);
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(400);
    expect(r.message).toMatch(/must be a string/i);
  });

  it.each([
    ['title too short (2 chars)', 'ab'],
    ['title too long (201 chars)', 'a'.repeat(201)],
  ])('rejects title length: %s', (_label, title) => {
    const r = validateTaskCreatePayload({ ...valid, title });
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(400);
    expect(r.message).toMatch(/Title must be between/);
  });

  it('accepts title with exactly 3 and 200 characters after trim', () => {
    expect(validateTaskCreatePayload({ ...valid, title: 'abc' }).ok).toBe(true);
    expect(validateTaskCreatePayload({ ...valid, title: 'a'.repeat(200) }).ok).toBe(true);
  });

  it.each([
    ['empty string', '   '],
    ['20001 characters long', 'x'.repeat(20001)],
  ])('rejects description: %s', (_label, description) => {
    const r = validateTaskCreatePayload({ ...valid, description });
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(400);
  });

  it.each([0, 2, 9])('rejects non-whitelist credit %i', (credit) => {
    const r = validateTaskCreatePayload({ ...valid, credit });
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(400);
    expect(r.message).toMatch(/one of/i);
  });

  it.each([
    [4, 1, true],
    [4, 3, true],
    [4, 5, false],
    [4, 8, false],
    [0, 1, false],
  ])('balance %i credit %i → pass=%s', (creditBalance, credit, shouldPass) => {
    const r = validateTaskCreatePayload({
      ...valid,
      credit,
      creditBalance,
    });
    if (shouldPass) {
      expect(r.ok).toBe(true);
      expect(r.credit).toBe(credit);
    } else if (creditBalance <= 0) {
      expect(r.ok).toBe(false);
      expect(r.httpStatus).toBe(403);
    } else {
      expect(r.ok).toBe(false);
      expect(r.httpStatus).toBe(400);
    }
  });

  it('rejects when credit_balance is zero (403)', () => {
    const r = validateTaskCreatePayload({ ...valid, creditBalance: 0 });
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(403);
  });

  it('exports TASK_CREDIT_OPTIONS aligned with product', () => {
    expect(TASK_CREDIT_OPTIONS).toEqual([1, 3, 5, 8]);
  });
});
