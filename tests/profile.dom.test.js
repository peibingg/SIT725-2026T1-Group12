/**
 * @jest-environment jsdom
 */
'use strict';

const path = require('path');

const STORAGE_KEY = 'taskMarketplaceUser';

function polyfillDialog() {
  if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
}

function loadProfileShell() {
  polyfillDialog();
  document.body.innerHTML = `
    <div id="header-guest" class="header-auth hidden"></div>
    <div id="header-user" class="header-user">
      <span id="header-user-meta"></span>
      <button type="button" id="btn-signout-header"></button>
      <button type="button" id="btn-open-signup"></button>
      <button type="button" id="btn-open-signin"></button>
    </div>
    <div id="hero-actions"></div>
    <div id="site-flash" class="site-flash hidden"></div>
    <main id="profile-page" class="profile-page">
      <p id="profile-credit-balance">—</p>
      <p id="profile-name"></p>
      <p id="profile-email"></p>
      <p id="profile-role"></p>
      <p id="profile-load-msg"></p>
      <form id="form-change-password">
        <input type="password" name="current_password" value="cur" />
        <input type="password" name="new_password" value="12345" />
        <input type="password" name="confirm_password" value="12345" />
        <button type="submit">Go</button>
      </form>
      <p id="profile-password-msg"></p>
      <button type="button" id="btn-profile-refresh">Refresh</button>
    </main>
    <dialog id="modal-signup"></dialog>
    <dialog id="modal-signin"><form id="form-signin"></form><p id="signin-msg"></p></dialog>
  `;
}

function clearCaches() {
  jest.resetModules();
  delete require.cache[path.join(__dirname, '../public/js/authPolicy.js')];
  delete require.cache[path.join(__dirname, '../public/js/authValidation.js')];
  delete require.cache[path.join(__dirname, '../public/js/flash.js')];
  delete require.cache[path.join(__dirname, '../public/js/scripts.js')];
  delete require.cache[path.join(__dirname, '../public/js/profile.js')];
}

describe('profile page (DOM)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    loadProfileShell();
    clearCaches();
  });

  it('renders credit_balance from GET /api/auth/me, not stale sessionStorage', async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: '1',
        email: 'u@example.com',
        credit_balance: 0,
        first_name: 'Old',
        last_name: 'Name',
        role: 'User',
      }),
    );

    globalThis.fetch = jest.fn((url) => {
      if (String(url).includes('/api/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            statusCode: 200,
            user: {
              id: '1',
              email: 'u@example.com',
              credit_balance: 77,
              first_name: 'Fresh',
              last_name: 'User',
              role: 'User',
            },
          }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    require('../public/js/authValidation.js');
    require('../public/js/flash.js');
    require('../public/js/scripts.js');
    require('../public/js/profile.js');

    await new Promise((r) => setTimeout(r, 40));

    expect(document.getElementById('profile-credit-balance').textContent).toBe('77');
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    expect(stored.credit_balance).toBe(77);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
    );
  });

  it('redirects home on 401 from /api/auth/me', async () => {
    const replace = jest.fn();
    delete window.location;
    window.location = { replace, href: '' };

    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({ statusCode: 401, message: 'Authentication required' }),
      }),
    );

    require('../public/js/authValidation.js');
    require('../public/js/flash.js');
    require('../public/js/scripts.js');
    require('../public/js/profile.js');

    await new Promise((r) => setTimeout(r, 40));

    expect(replace).toHaveBeenCalledWith('/');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('blocks change-password submit when new password is too short (no PATCH)', async () => {
    globalThis.fetch = jest.fn((url) => {
      if (String(url).includes('/api/auth/me')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: '1',
              email: 'a@b.co',
              credit_balance: 0,
              first_name: 'A',
              last_name: 'B',
              role: 'User',
            },
          }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    require('../public/js/authValidation.js');
    require('../public/js/flash.js');
    require('../public/js/scripts.js');
    require('../public/js/profile.js');

    await new Promise((r) => setTimeout(r, 40));
    globalThis.fetch.mockClear();

    const form = document.getElementById('form-change-password');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise((r) => setTimeout(r, 25));

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.getElementById('profile-password-msg').textContent).toBe('Password must be 8–128 characters');
  });
});
 