/**
 * @jest-environment jsdom
 */
'use strict';

const path = require('path');

function loadHomeShell() {
  document.body.innerHTML = `
    <div id="site-flash" class="site-flash hidden"></div>
    <div id="header-guest" class="header-auth"></div>
    <div id="header-user" class="header-user hidden">
      <a class="header-link" href="/tasks.html" id="link-tasks">Tasks</a>
    </div>
    <div id="hero-actions">
      <button type="button" id="hero-cta-signup"></button>
      <button type="button" id="hero-cta-signin"></button>
      <button type="button" id="hero-cta-browse"></button>
    </div>
    <button type="button" id="btn-open-signup"></button>
    <button type="button" id="btn-open-signin"></button>
    <button type="button" id="btn-signout-header"></button>
    <span id="header-user-meta"></span>
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

describe('Browse Open Tasks (home DOM)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    loadHomeShell();
    clearScriptCache();
  });

  it('guest: Browse sets returnUrl and opens sign-in modal', () => {
    require('../public/js/authValidation.js');
    require('../public/js/flash.js');
    require('../public/js/scripts.js');

    document.getElementById('hero-cta-browse').click();

    expect(sessionStorage.getItem('taskMarketplaceReturnUrl')).toBe('/tasks.html');
    const modal = document.getElementById('modal-signin');
    expect(modal.hasAttribute('open')).toBe(true);
  });

  it('logged-in: Browse navigates to Tasks', () => {
    sessionStorage.setItem(
      'taskMarketplaceUser',
      JSON.stringify({
        id: '1',
        email: 'x@example.com',
        credit_balance: 0,
        first_name: 'X',
        last_name: 'Y',
        role: 'User',
      }),
    );

    const assign = jest.fn();
    delete window.location;
    window.location = { assign, replace: jest.fn(), href: '' };

    require('../public/js/authValidation.js');
    require('../public/js/flash.js');
    require('../public/js/scripts.js');

    document.getElementById('hero-cta-browse').click();

    expect(assign).toHaveBeenCalledWith('/tasks.html');
  });

  it('opens sign-in when returnUrl is pending and user is a guest', () => {
    sessionStorage.setItem('taskMarketplaceReturnUrl', '/tasks.html');

    require('../public/js/authValidation.js');
    require('../public/js/flash.js');
    require('../public/js/scripts.js');

    const modal = document.getElementById('modal-signin');
    expect(modal.hasAttribute('open')).toBe(true);
  });
});
