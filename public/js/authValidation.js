'use strict';

/**
 * Client-side auth validation only. Password hashing is performed on the server (bcrypt);
 * the browser must never hash passwords or persist password_hash — see POST /api/auth/signup.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

function validateSignupPayload({ first_name, last_name, email, password }) {
  const fn = (first_name || '').trim();
  const ln = (last_name || '').trim();
  const em = (email || '').trim();
  const pw = password || '';

  if (!fn || !ln) {
    return { ok: false, message: 'First name and last name are required' };
  }
  if (!em || !EMAIL_RE.test(em)) {
    return { ok: false, message: 'Valid email is required' };
  }
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: 'Password must be at least 6 characters' };
  }
  return { ok: true, message: '' };
}

function validateSigninPayload({ email, password }) {
  const em = (email || '').trim();
  const pw = password || '';

  if (!em || !pw) {
    return { ok: false, message: 'Email and password are required' };
  }
  if (!EMAIL_RE.test(em)) {
    return { ok: false, message: 'Valid email is required' };
  }
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: 'Password must be at least 6 characters' };
  }
  return { ok: true, message: '' };
}

const authValidationApi = {
  EMAIL_RE,
  MIN_PASSWORD_LENGTH,
  validateSignupPayload,
  validateSigninPayload,
};

if (typeof globalThis !== 'undefined') {
  globalThis.TaskMarketplaceAuth = authValidationApi;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = authValidationApi;
}
