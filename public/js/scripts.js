'use strict';

/**
 * Auth UI: passwords are sent to the server in plaintext over HTTPS in production; the API hashes
 * with bcrypt. Never hash passwords in this file, never log password fields, never store password_hash.
 * Session cookie (express-session) requires fetch(..., { credentials: 'same-origin' }) — see postJson.
 */
const STORAGE_KEY = 'taskMarketplaceUser';
const RETURN_URL_KEY = 'taskMarketplaceReturnUrl';

function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user) {
  if (user) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

function getEls() {
  return {
    modalSignup: document.getElementById('modal-signup'),
    modalSignin: document.getElementById('modal-signin'),
    headerGuest: document.getElementById('header-guest'),
    headerUser: document.getElementById('header-user'),
    headerUserMeta: document.getElementById('header-user-meta'),
    btnOpenSignup: document.getElementById('btn-open-signup'),
    btnOpenSignin: document.getElementById('btn-open-signin'),
    btnSignout: document.getElementById('btn-signout-header'),
    heroCtaSignup: document.getElementById('hero-cta-signup'),
    heroCtaSignin: document.getElementById('hero-cta-signin'),
    heroCtaBrowse: document.getElementById('hero-cta-browse'),
    linkTasks: document.getElementById('link-tasks'),
  };
}

function openModal(dialog) {
  if (!dialog || typeof dialog.showModal !== 'function') return;
  dialog.showModal();
}

function closeModal(dialog) {
  if (!dialog || typeof dialog.close !== 'function') return;
  dialog.close();
}

function navigateAfterAuth(defaultPath) {
  let next = null;
  try {
    const stored = sessionStorage.getItem(RETURN_URL_KEY);
    if (stored && typeof stored === 'string' && stored.startsWith('/')) {
      sessionStorage.removeItem(RETURN_URL_KEY);
      next = stored;
    }
  } catch (_) {
    /* ignore */
  }
  if (next) {
    window.location.assign(next);
    return;
  }
  if (defaultPath) {
    window.location.assign(defaultPath);
  }
}

function updateHeaderAuth() {
  const { headerGuest, headerUser, headerUserMeta, heroCtaSignup, heroCtaSignin, heroCtaBrowse } = getEls();
  const user = getStoredUser();
  const heroActions = document.getElementById('hero-actions');

  if (!headerGuest || !headerUser) return;

  if (user) {
    headerGuest.classList.add('hidden');
    headerUser.classList.remove('hidden');
    if (headerUserMeta) {
      headerUserMeta.textContent = `${user.email} · ${user.credit_balance} credits`;
    }
    heroActions?.classList.remove('hidden');
    heroCtaSignup?.classList.add('hidden');
    heroCtaSignin?.classList.add('hidden');
    heroCtaBrowse?.classList.remove('hidden');
  } else {
    headerGuest.classList.remove('hidden');
    headerUser.classList.add('hidden');
    heroActions?.classList.remove('hidden');
    heroCtaSignup?.classList.remove('hidden');
    heroCtaSignin?.classList.remove('hidden');
    heroCtaBrowse?.classList.remove('hidden');
  }
}

function showMsg(el, text, ok) {
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('ok', 'err');
  if (text) {
    el.classList.add(ok ? 'ok' : 'err');
  }
}

function getAuthValidation() {
  return globalThis.TaskMarketplaceAuth;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function wireModal(dialog) {
  if (!dialog) return;
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeModal(dialog);
    }
  });
  dialog.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(dialog));
  });
}

function initForms() {
  const els = getEls();
  const formSignup = document.getElementById('form-signup');
  const formSignin = document.getElementById('form-signin');
  const signupMsg = document.getElementById('signup-msg');
  const signinMsg = document.getElementById('signin-msg');
  const authVal = getAuthValidation();

  wireModal(els.modalSignup);
  wireModal(els.modalSignin);

  const openSignup = () => {
    showMsg(signupMsg, '');
    openModal(els.modalSignup);
    const first = formSignup?.querySelector('input');
    queueMicrotask(() => first?.focus());
  };
  const openSignin = () => {
    showMsg(signinMsg, '');
    openModal(els.modalSignin);
    const first = formSignin?.querySelector('input');
    queueMicrotask(() => first?.focus());
  };

  const goBrowseOpenTasks = () => {
    if (getStoredUser()) {
      window.location.assign('/tasks.html');
      return;
    }
    try {
      sessionStorage.setItem(RETURN_URL_KEY, '/tasks.html');
    } catch (_) {
      /* ignore */
    }
    openSignin();
  };

  els.btnOpenSignup?.addEventListener('click', openSignup);
  els.btnOpenSignin?.addEventListener('click', openSignin);
  els.heroCtaSignup?.addEventListener('click', openSignup);
  els.heroCtaSignin?.addEventListener('click', openSignin);
  els.heroCtaBrowse?.addEventListener('click', goBrowseOpenTasks);
  els.linkTasks?.addEventListener('click', (e) => {
    if (getStoredUser()) return;
    e.preventDefault();
    goBrowseOpenTasks();
  });

  els.btnSignout?.addEventListener('click', async () => {
    try {
      await postJson('/api/auth/signout', {});
    } catch (_) {
      /* still clear client if the server is unreachable */
    }
    setStoredUser(null);
    updateHeaderAuth();
    globalThis.TaskMarketplaceFlash?.set({
      type: 'ok',
      message: 'You have been signed out.',
    });
    window.location.replace('/');
  });

  formSignup?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg(signupMsg, '');
    const fd = new FormData(formSignup);
    const first_name = (fd.get('first_name') || '').toString().trim();
    const last_name = (fd.get('last_name') || '').toString().trim();
    const email = (fd.get('email') || '').toString().trim();
    const password = (fd.get('password') || '').toString();

    if (authVal) {
      const v = authVal.validateSignupPayload({ first_name, last_name, email, password });
      if (!v.ok) {
        showMsg(signupMsg, v.message, false);
        return;
      }
    }

    const { res, data } = await postJson('/api/auth/signup', { first_name, last_name, email, password });
    if (res.ok && data.user) {
      setStoredUser(data.user);
      updateHeaderAuth();
      showMsg(signupMsg, data.message || 'Account created.', true);
      formSignup.reset();
      setTimeout(() => {
        closeModal(els.modalSignup);
        navigateAfterAuth(null);
      }, 600);
    } else {
      showMsg(signupMsg, data.message || 'Could not sign up.', false);
    }
  });

  formSignin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg(signinMsg, '');
    const fd = new FormData(formSignin);
    const email = (fd.get('email') || '').toString().trim();
    const password = (fd.get('password') || '').toString();

    if (authVal) {
      const v = authVal.validateSigninPayload({ email, password });
      if (!v.ok) {
        showMsg(signinMsg, v.message, false);
        return;
      }
    }

    const { res, data } = await postJson('/api/auth/signin', { email, password });
    if (res.ok && data.user) {
      setStoredUser(data.user);
      updateHeaderAuth();
      showMsg(signinMsg, data.message || 'You have been logged in.', true);
      formSignin?.reset();
      setTimeout(() => {
        closeModal(els.modalSignin);
        globalThis.TaskMarketplaceFlash?.set({
          type: 'ok',
          message: data.message || 'Signed in successfully.',
        });
        navigateAfterAuth('/profile.html');
      }, 500);
    } else {
      const msg = data.message || 'Could not sign in.';
      showMsg(signinMsg, msg, false);
    }
  });
}

globalThis.TaskMarketplaceSession = {
  getStoredUser,
  setStoredUser,
  updateHeaderAuth,
};

initForms();
updateHeaderAuth();
if (!document.getElementById('profile-page') && !document.getElementById('tasks-page')) {
  globalThis.TaskMarketplaceFlash?.consume();
}

(function maybeOpenSigninForReturnUrl() {
  if (document.getElementById('tasks-page')) return;
  if (getStoredUser()) return;
  let pending = null;
  try {
    pending = sessionStorage.getItem(RETURN_URL_KEY);
  } catch (_) {
    return;
  }
  if (!pending) return;
  const { modalSignin } = getEls();
  const signinMsg = document.getElementById('signin-msg');
  if (modalSignin && typeof modalSignin.showModal === 'function') {
    showMsg(signinMsg, 'Sign in to continue to Tasks.', false);
    openModal(modalSignin);
    const first = document.getElementById('form-signin')?.querySelector('input');
    queueMicrotask(() => first?.focus());
  }
})();
