/**
 * @jest-environment jsdom
 */
'use strict';

const path = require('path');

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

function loadCreateShell() {
  document.body.innerHTML = `
    <main id="tasks-page" class="tasks-page">
      <button type="button" id="btn-create-task" class="hidden"></button>
      <p id="create-task-zero-hint" class="hidden"></p>
      <tbody id="tasks-posted-body"></tbody>
      <div id="tasks-posted-empty" class="hidden"></div>
      <table id="tasks-posted-table"></table>
    </main>
    <dialog id="modal-create-task">
      <form id="form-create-task">
        <input id="create-task-title" />
        <textarea id="create-task-description"></textarea>
        <span id="create-task-title-count"></span>
        <span id="create-task-title-error"></span>
        <span id="create-task-description-count"></span>
        <span id="create-task-description-error"></span>
        <fieldset id="create-task-credit-options"></fieldset>
        <span id="create-task-credit-error"></span>
        <button type="submit" id="btn-create-task-submit"></button>
        <p id="create-task-form-msg"></p>
      </form>
    </dialog>
  `;
}

function clearCaches() {
  jest.resetModules();
  [
    'taskCredits.js',
    'taskCreateValidation.js',
    'apiClient.js',
    'taskCreate.js',
  ].forEach((f) => {
    delete require.cache[path.join(__dirname, `../public/js/${f}`)];
  });
}

function jsonRes(ok, status, body) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe('Create task UI (DOM)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      'taskMarketplaceUser',
      JSON.stringify({ id: 'u1', email: 'u@example.com', credit_balance: 0 }),
    );
    polyfillDialog();
    loadCreateShell();
    clearCaches();
    globalThis.TaskMarketplaceSession = {
      getStoredUser: () => JSON.parse(sessionStorage.getItem('taskMarketplaceUser')),
      setStoredUser: (u) => {
        if (u) sessionStorage.setItem('taskMarketplaceUser', JSON.stringify(u));
        else sessionStorage.removeItem('taskMarketplaceUser');
      },
      updateHeaderAuth: jest.fn(),
    };
  });

  it('hides Create task button when create-meta reports balance 0', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonRes(true, 200, {
        statusCode: 200,
        credit_balance: 0,
        canCreate: false,
        allowedCredits: [],
        presetCredits: [1, 3, 5, 8],
      }),
    );

    require('../public/js/taskCredits');
    require('../public/js/taskCreateValidation');
    require('../public/js/apiClient');
    require('../public/js/taskCreate');

    await globalThis.TaskMarketplaceTaskCreate.initTaskCreate();

    const btn = document.getElementById('btn-create-task');
    const hint = document.getElementById('create-task-zero-hint');
    expect(btn.classList.contains('hidden')).toBe(true);
    expect(hint.classList.contains('hidden')).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/create-meta',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('disables credit options above balance 4', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonRes(true, 200, {
          credit_balance: 4,
          canCreate: true,
          allowedCredits: [1, 3],
          presetCredits: [1, 3, 5, 8],
        }),
      )
      .mockResolvedValue(jsonRes(true, 200, { tasks: [] }));

    require('../public/js/taskCredits');
    require('../public/js/taskCreateValidation');
    require('../public/js/apiClient');
    require('../public/js/taskCreate');

    await globalThis.TaskMarketplaceTaskCreate.initTaskCreate();
    document.getElementById('btn-create-task').click();

    const radios = Array.from(
      document.querySelectorAll('#create-task-credit-options input[name="credit"]'),
    );
    expect(radios).toHaveLength(4);
    const byValue = Object.fromEntries(radios.map((r) => [r.value, r.disabled]));
    expect(byValue['1']).toBe(false);
    expect(byValue['3']).toBe(false);
    expect(byValue['5']).toBe(true);
    expect(byValue['8']).toBe(true);
  });
});
