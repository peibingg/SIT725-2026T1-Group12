/**
 * @jest-environment jsdom
 */
'use strict';

const path = require('path');

function loadAuthPageShell() {
  document.body.innerHTML = `
    <div id="site-flash" class="site-flash hidden"></div>
    <div id="header-guest" class="header-auth"></div>
    <div id="header-user" class="header-user hidden"><span id="header-user-meta"></span></div>
    <div id="hero-actions"></div>
    <button type="button" id="btn-open-signup"></button>
    <button type="button" id="btn-open-signin"></button>
    <button type="button" id="hero-cta-signup"></button>
    <button type="button" id="hero-cta-signin"></button>
    <button type="button" id="btn-signout-header"></button>
    <dialog id="modal-signup"><div class="modal-panel"><form id="form-signup"></form><p id="signup-msg"></p></div></dialog>
    <dialog id="modal-signin"><div class="modal-panel">
      <form id="form-signin" class="auth-form" novalidate>
        <input type="email" name="email" value="u@example.com" />
        <input type="password" name="password" value="secret12" />
        <button type="submit">Sign in</button>
      </form>
      <p id="signin-msg" class="form-msg" role="status"></p>
    </div></dialog>
  `;

  if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
}

function clearScriptCache() {
  jest.resetModules();
  delete require.cache[path.join(__dirname, '../public/js/authValidation.js')];
  delete require.cache[path.join(__dirname, '../public/js/flash.js')];
  delete require.cache[path.join(__dirname, '../public/js/scripts.js')];
}

describe('sign-in UI (DOM)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    loadAuthPageShell();
    clearScriptCache();
  });

  it('shows API error message on sign-in when fetch returns 401', async () => {
    const apiMessage = 'Invalid email or password';
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ statusCode: 401, message: apiMessage }),
    });

    require('../public/js/authValidation.js');
    require('../public/js/flash.js');
    require('../public/js/scripts.js');

    const form = document.getElementById('form-signin');
    const msg = document.getElementById('signin-msg');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise((r) => setTimeout(r, 30));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/auth/signin',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(msg.textContent).toBe(apiMessage);
    expect(msg.classList.contains('err')).toBe(true);
  });

  it('redirects to profile after successful sign-in', async () => {
    const assign = jest.fn();
    delete window.location;
    window.location = { assign, replace: jest.fn(), href: '' };

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        statusCode: 200,
        message: 'Signed in',
        user: {
          id: '1',
          email: 'ok@example.com',
          credit_balance: 0,
          first_name: 'O',
          last_name: 'K',
          role: 'User',
        },
      }),
    });

    require('../public/js/authValidation.js');
    require('../public/js/flash.js');
    require('../public/js/scripts.js');

    const form = document.getElementById('form-signin');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await new Promise((r) => setTimeout(r, 600));

    expect(assign).toHaveBeenCalledWith('/profile.html');
    expect(sessionStorage.getItem('taskMarketplaceFlash')).toBeTruthy();
  });
});
