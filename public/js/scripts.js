'use strict';

const STORAGE_KEY = 'taskMarketplaceUser';

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

function updateHeaderAuth() {
  const { headerGuest, headerUser, headerUserMeta } = getEls();
  const user = getStoredUser();
  const heroActions = document.getElementById('hero-actions');

  if (!headerGuest || !headerUser) return;

  if (user) {
    headerGuest.classList.add('hidden');
    headerUser.classList.remove('hidden');
    if (headerUserMeta) {
      headerUserMeta.textContent = `${user.email} · ${user.credit_balance} credits`;
    }
    heroActions?.classList.add('hidden');
  } else {
    headerGuest.classList.remove('hidden');
    headerUser.classList.add('hidden');
    heroActions?.classList.remove('hidden');
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

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

  els.btnOpenSignup?.addEventListener('click', openSignup);
  els.btnOpenSignin?.addEventListener('click', openSignin);
  els.heroCtaSignup?.addEventListener('click', openSignup);
  els.heroCtaSignin?.addEventListener('click', openSignin);

  els.btnSignout?.addEventListener('click', () => {
    setStoredUser(null);
    updateHeaderAuth();
  });

  formSignup?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMsg(signupMsg, '');
    const fd = new FormData(formSignup);
    const first_name = (fd.get('first_name') || '').toString().trim();
    const last_name = (fd.get('last_name') || '').toString().trim();
    const email = (fd.get('email') || '').toString().trim();
    const password = (fd.get('password') || '').toString();
    const { res, data } = await postJson('/api/auth/signup', { first_name, last_name, email, password });
    if (res.ok && data.user) {
      setStoredUser(data.user);
      updateHeaderAuth();
      showMsg(signupMsg, data.message || 'Account created.', true);
      formSignup.reset();
      setTimeout(() => closeModal(els.modalSignup), 600);
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
    const { res, data } = await postJson('/api/auth/signin', { email, password });
    if (res.ok && data.user) {
      setStoredUser(data.user);
      updateHeaderAuth();
      showMsg(signinMsg, data.message || 'Signed in.', true);
      setTimeout(() => closeModal(els.modalSignin), 600);
    } else {
      showMsg(signinMsg, data.message || 'Could not sign in.', false);
    }
  });
}

initForms();
updateHeaderAuth();
