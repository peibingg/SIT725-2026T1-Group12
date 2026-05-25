'use strict';

const path = require('path');
const fs = require('fs');
const serverPolicy = require('../validators/auth.validation');
const {
  EMAIL_RE,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_POLICY_HINT,
  validateSignupPayload,
  validateSigninPayload,
  validateChangePasswordPayload,
} = require('../public/js/authValidation');

describe('authValidation (parity with backend rules)', () => {
  it('uses the same email regex as the auth controller', () => {
    expect(EMAIL_RE.source).toBe(serverPolicy.EMAIL_RE.source);
    expect(EMAIL_RE.flags).toBe(serverPolicy.EMAIL_RE.flags);
  });

  it('uses the same password length constants as authPolicy', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(serverPolicy.MIN_PASSWORD_LENGTH);
    expect(MAX_PASSWORD_LENGTH).toBe(serverPolicy.MAX_PASSWORD_LENGTH);
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('signup: matches backend error strings for name, email, password', () => {
    expect(validateSignupPayload({ first_name: '', last_name: 'L', email: 'a@b.co', password: 'secret12' }).message).toBe(
      'First name and last name are required',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: '', email: 'a@b.co', password: 'secret12' }).message).toBe(
      'First name and last name are required',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: 'L', email: 'bad', password: 'secret12' }).message).toBe(
      'Valid email is required',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: 'L', email: '', password: 'secret12' }).message).toBe(
      'Valid email is required',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: 'L', email: 'a@b.co', password: '12345' }).message).toBe(
      serverPolicy.PASSWORD_LENGTH_MESSAGE,
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: 'L', email: 'a@b.co', password: '12345678' }).message).toBe(
      'Password must include a letter and a number',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: 'L', email: 'a@b.co', password: 'secret12' }).ok).toBe(true);
  });

  it('signin: validates email only; no minimum password length', () => {
    expect(validateSigninPayload({ email: '', password: 'x' }).message).toBe('Email and password are required');
    expect(validateSigninPayload({ email: 'a@b.co', password: '' }).message).toBe('Email and password are required');
    expect(validateSigninPayload({ email: 'not-an-email', password: '123456' }).message).toBe('Valid email is required');
    expect(validateSigninPayload({ email: 'a@b.co', password: '12' }).ok).toBe(true);
    expect(validateSigninPayload({ email: 'a@b.co', password: '123456' }).ok).toBe(true);
  });

  it('authValidation.js documents server-only hashing (story requirement)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../public/js/authValidation.js'), 'utf8');
    expect(src).toMatch(/bcrypt|server|hash/i);
    expect(src.toLowerCase()).toContain('never hash');
  });

  it('exports PASSWORD_POLICY_HINT aligned with authPolicy', () => {
    expect(PASSWORD_POLICY_HINT).toBe(serverPolicy.PASSWORD_POLICY_HINT);
  });

  it('change password: same policy as signup; confirm mismatch', () => {
    expect(
      validateChangePasswordPayload({
        current_password: 'old',
        new_password: '12345',
        confirm_password: '12345',
      }).message,
    ).toBe(serverPolicy.PASSWORD_LENGTH_MESSAGE);
    expect(
      validateChangePasswordPayload({
        current_password: 'old',
        new_password: 'abcdefgh',
        confirm_password: 'abcdefgh',
      }).message,
    ).toBe('Password must include a letter and a number');
    expect(
      validateChangePasswordPayload({
        current_password: 'old',
        new_password: 'abcdef12',
        confirm_password: 'abcdeg12',
      }).message,
    ).toBe('New password and confirmation do not match');
    expect(
      validateChangePasswordPayload({
        current_password: 'old',
        new_password: 'abcdef12',
        confirm_password: 'abcdef12',
      }).ok,
    ).toBe(true);
  });
});
 