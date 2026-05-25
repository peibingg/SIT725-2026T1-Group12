'use strict';

/**
 * Single source of truth for auth email + password policy.
 * Loaded in the browser before authValidation.js; required by validators/auth.validation.js on the server.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const PASSWORD_POLICY_HINT =
  '8–128 characters, at least one letter and one number, not only spaces, not a common password.';

/** Lowercase exact matches only — blocks trivial passwords at registration / change-password. */
const PASSWORD_BLOCKLIST = new Set(['password', '123456', '12345678', 'qwerty', '111111', 'abc123', 'password1']);

const PASSWORD_LENGTH_MESSAGE = `Password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters`;

function assertPasswordMeetsPolicy(password) {
  const pw = password == null ? '' : String(password);

  if (pw.length < MIN_PASSWORD_LENGTH || pw.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, message: PASSWORD_LENGTH_MESSAGE };
  }
  if (pw.trim().length === 0) {
    return { ok: false, message: 'Password cannot be only spaces' };
  }
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    return { ok: false, message: 'Password must include a letter and a number' };
  }
  if (PASSWORD_BLOCKLIST.has(pw.toLowerCase())) {
    return { ok: false, message: 'Password is too common' };
  }
  return { ok: true, message: '' };
}

const authPolicyApi = {
  EMAIL_RE,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_POLICY_HINT,
  PASSWORD_LENGTH_MESSAGE,
  assertPasswordMeetsPolicy,
};

if (typeof globalThis !== 'undefined') {
  globalThis.TaskMarketplaceAuthPolicy = authPolicyApi;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = authPolicyApi;
}
 