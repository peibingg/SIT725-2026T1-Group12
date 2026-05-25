'use strict';

/**
 * Client-side auth validation only. Password hashing is performed on the server (bcrypt);
 * the browser must never hash passwords or persist password_hash — see POST /api/auth/signup.
 */
const policy =
  typeof require !== 'undefined'
    ? require('./authPolicy.js')
    : globalThis.TaskMarketplaceAuthPolicy;

if (!policy) {
  throw new Error('authPolicy.js must be loaded before authValidation.js');
}

const { EMAIL_RE, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, PASSWORD_POLICY_HINT, assertPasswordMeetsPolicy } =
  policy;

function validateSignupPayload({ first_name, last_name, email, password }) {
  const fn = (first_name || '').trim();
  const ln = (last_name || '').trim();
  const em = (email || '').trim();
  const pw = password == null ? '' : String(password);

  if (!fn || !ln) {
    return { ok: false, message: 'First name and last name are required' };
  }
  if (!em || !EMAIL_RE.test(em)) {
    return { ok: false, message: 'Valid email is required' };
  }
  return assertPasswordMeetsPolicy(pw);
}

/** Sign-in: email format only; no minimum password length (existing accounts may predate policy). */
function validateSigninPayload({ email, password }) {
  const em = (email || '').trim();
  const pw = password == null ? '' : String(password);

  if (!em || !pw) {
    return { ok: false, message: 'Email and password are required' };
  }
  if (!EMAIL_RE.test(em)) {
    return { ok: false, message: 'Valid email is required' };
  }
  return { ok: true, message: '' };
}

function validateChangePasswordPayload({ current_password, new_password, confirm_password }) {
  const cur = (current_password || '').trim();
  const nw = new_password == null ? '' : String(new_password);
  const cf = confirm_password == null ? '' : String(confirm_password);

  if (!cur || !nw) {
    return { ok: false, message: 'Current password and new password are required' };
  }
  if (!cf) {
    return { ok: false, message: 'Please confirm your new password' };
  }
  const policyResult = assertPasswordMeetsPolicy(nw);
  if (!policyResult.ok) {
    return policyResult;
  }
  if (nw !== cf) {
    return { ok: false, message: 'New password and confirmation do not match' };
  }
  return { ok: true, message: '' };
}

const authValidationApi = {
  EMAIL_RE,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_POLICY_HINT,
  validateSignupPayload,
  validateSigninPayload,
  validateChangePasswordPayload,
};

if (typeof globalThis !== 'undefined') {
  globalThis.TaskMarketplaceAuth = authValidationApi;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = authValidationApi;
}
 