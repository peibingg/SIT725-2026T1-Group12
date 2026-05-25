'use strict';

const {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_LENGTH_MESSAGE,
  assertPasswordMeetsPolicy,
} = require('../validators/auth.validation');

describe('authPolicy (assertPasswordMeetsPolicy)', () => {
  it('exports length constants', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(MAX_PASSWORD_LENGTH).toBe(128);
  });

  it.each([
    ['12345', PASSWORD_LENGTH_MESSAGE],
    ['123456', PASSWORD_LENGTH_MESSAGE],
    ['12345678', 'Password must include a letter and a number'],
    ['abcdefgh', 'Password must include a letter and a number'],
    ['        ', 'Password cannot be only spaces'],
    ['password1', 'Password is too common'],
    ['123456', PASSWORD_LENGTH_MESSAGE],
  ])('rejects %j → %s', (password, message) => {
    const result = assertPasswordMeetsPolicy(password);
    expect(result.ok).toBe(false);
    expect(result.message).toBe(message);
  });

  it('accepts a strong password', () => {
    expect(assertPasswordMeetsPolicy('secret12')).toEqual({ ok: true, message: '' });
  });

  it('rejects passwords longer than max', () => {
    const tooLong = `a1${'x'.repeat(MAX_PASSWORD_LENGTH)}`;
    expect(assertPasswordMeetsPolicy(tooLong).message).toBe(PASSWORD_LENGTH_MESSAGE);
  });
});
 