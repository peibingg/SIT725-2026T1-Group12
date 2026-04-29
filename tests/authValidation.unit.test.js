'use strict';

const path = require('path');
const fs = require('fs');
const {
  EMAIL_RE,
  MIN_PASSWORD_LENGTH,
  validateSignupPayload,
  validateSigninPayload,
} = require('../public/js/authValidation');

/** Mirrors controllers/auth.controller.js EMAIL_RE and password length rule. */
const BACKEND_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe('authValidation (parity with backend rules)', () => {
  it('uses the same email regex as the auth controller', () => {
    expect(EMAIL_RE.source).toBe(BACKEND_EMAIL_RE.source);
    expect(EMAIL_RE.flags).toBe(BACKEND_EMAIL_RE.flags);
  });

  it('uses minimum password length 6 like signup in auth.controller', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6);
  });

  it('signup: matches backend error strings for name, email, password', () => {
    expect(validateSignupPayload({ first_name: '', last_name: 'L', email: 'a@b.co', password: '123456' }).message).toBe(
      'First name and last name are required',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: '', email: 'a@b.co', password: '123456' }).message).toBe(
      'First name and last name are required',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: 'L', email: 'bad', password: '123456' }).message).toBe(
      'Valid email is required',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: 'L', email: '', password: '123456' }).message).toBe(
      'Valid email is required',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: 'L', email: 'a@b.co', password: '12345' }).message).toBe(
      'Password must be at least 6 characters',
    );
    expect(validateSignupPayload({ first_name: 'F', last_name: 'L', email: 'a@b.co', password: '123456' }).ok).toBe(true);
  });

  it('signin: matches backend empty-field message and enforces email + min length', () => {
    expect(validateSigninPayload({ email: '', password: 'x' }).message).toBe('Email and password are required');
    expect(validateSigninPayload({ email: 'a@b.co', password: '' }).message).toBe('Email and password are required');
    expect(validateSigninPayload({ email: 'not-an-email', password: '123456' }).message).toBe('Valid email is required');
    expect(validateSigninPayload({ email: 'a@b.co', password: '12' }).message).toBe('Password must be at least 6 characters');
    expect(validateSigninPayload({ email: 'a@b.co', password: '123456' }).ok).toBe(true);
  });

  it('authValidation.js documents server-only hashing (story requirement)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../public/js/authValidation.js'), 'utf8');
    expect(src).toMatch(/bcrypt|server|hash/i);
    expect(src.toLowerCase()).toContain('never hash');
  });
});
