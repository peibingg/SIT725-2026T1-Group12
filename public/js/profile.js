'use strict';

/**
 * Profile: GET /api/auth/me and PATCH /api/auth/password use credentials: 'same-origin' for the session cookie.
 * Passwords are never hashed in the browser; do not log password fields.
 * Session key string must match scripts.js (classic scripts share one global scope — do not redeclare const STORAGE_KEY here).
 */
function getStoredUser() {
  try {
    const raw = sessionStorage.getItem('taskMarketplaceUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user) {
  if (user) {
    sessionStorage.setItem('taskMarketplaceUser', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('taskMarketplaceUser');
  }
}

function getAuthValidation() {
  return globalThis.TaskMarketplaceAuth;
}

async function getJson(url) {
  /* Avoid HTTP cache + ETag 304 empty bodies — Express sets ETag on JSON; default fetch can revalidate and break res.json(). */
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function patchJson(url, body) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function showMsg(el, text, ok) {
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('ok', 'err');
  if (text) {
    el.classList.add(ok ? 'ok' : 'err');
  }
}

function syncHeaderFromStoredUser() {
  const headerGuest = document.getElementById('header-guest');
  const headerUser = document.getElementById('header-user');
  const headerUserMeta = document.getElementById('header-user-meta');
  const user = getStoredUser();
  if (!headerGuest || !headerUser) return;
  if (user) {
    headerGuest.classList.add('hidden');
    headerUser.classList.remove('hidden');
    if (headerUserMeta) {
      headerUserMeta.textContent = `${user.email} · ${user.credit_balance} credits`;
    }
  } else {
    headerGuest.classList.remove('hidden');
    headerUser.classList.add('hidden');
  }
}

function mapPasswordChangeError(res, data) {
  if (res.status === 401) {
    const m = (data && data.message) || '';
    if (/current password/i.test(m)) return m;
    return 'Please sign in again';
  }
  if (data && data.message) return data.message;
  return 'Could not update password.';
}

function clearLoadMsg(loadMsg) {
  if (!loadMsg) return;
  loadMsg.textContent = '';
  loadMsg.classList.remove('ok', 'err');
}

async function loadProfileFromApi(opts) {
  const { silent } = opts || {};
  const creditEl = document.getElementById('profile-credit-balance');
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');
  const roleEl = document.getElementById('profile-role');
  const loadMsg = document.getElementById('profile-load-msg');

  if (!silent && loadMsg) {
    loadMsg.textContent = 'Loading profile…';
    loadMsg.classList.remove('ok', 'err');
  }

  const { res, data } = await getJson('/api/auth/me');

  if (res.status === 401) {
    setStoredUser(null);
    syncHeaderFromStoredUser();
    clearLoadMsg(loadMsg);
    window.location.replace('/');
    return null;
  }

  if (!res.ok || !data.user) {
    showMsg(loadMsg, (data && data.message) || 'Could not load profile.', false);
    return null;
  }

  const u = data.user;
  setStoredUser(u);
  syncHeaderFromStoredUser();

  if (creditEl) creditEl.textContent = String(u.credit_balance ?? '—');
  if (nameEl) nameEl.textContent = [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
  if (emailEl) emailEl.textContent = u.email || '—';
  if (roleEl) roleEl.textContent = u.role || '—';

  clearLoadMsg(loadMsg);
  return u;
}

function initProfilePage() {
  globalThis.TaskMarketplaceFlash?.consume();

  const form = document.getElementById('form-change-password');
  const pwdMsg = document.getElementById('profile-password-msg');
  const btnRefresh = document.getElementById('btn-profile-refresh');
  const authVal = getAuthValidation();

  loadProfileFromApi({ silent: false });

  btnRefresh?.addEventListener('click', () => {
    loadProfileFromApi({ silent: true });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg(pwdMsg, '');
    const fd = new FormData(form);
    const current_password = (fd.get('current_password') || '').toString();
    const new_password = (fd.get('new_password') || '').toString();
    const confirm_password = (fd.get('confirm_password') || '').toString();

    if (authVal) {
      const v = authVal.validateChangePasswordPayload({ current_password, new_password, confirm_password });
      if (!v.ok) {
        showMsg(pwdMsg, v.message, false);
        return;
      }
    }

    const { res, data } = await patchJson('/api/auth/password', {
      current_password,
      new_password,
      confirm_password,
    });

    if (res.ok) {
      showMsg(pwdMsg, data.message || 'Password updated.', true);
      form.reset();
      await loadProfileFromApi({ silent: true });
    } else {
      showMsg(pwdMsg, mapPasswordChangeError(res, data), false);
    }
  });
}

if (document.getElementById('profile-page')) {
  initProfilePage();
}
