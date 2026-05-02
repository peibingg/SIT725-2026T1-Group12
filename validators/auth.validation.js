'use strict';

/** Must stay aligned with signup rules in controllers/auth.controller.js */
const MIN_PASSWORD_LENGTH = 6;

function assertPasswordMeetsPolicy(password) {
  const pw = password == null ? '' : String(password);
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: 'Password must be at least 6 characters' };
  }
  return { ok: true, message: '' };
}

module.exports = { MIN_PASSWORD_LENGTH, assertPasswordMeetsPolicy };
