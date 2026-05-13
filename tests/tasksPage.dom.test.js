/**
 * @jest-environment jsdom
 */
'use strict';

const path = require('path');

function loadTasksPageShell() {
  document.body.innerHTML = `
    <main id="tasks-page" class="tasks-page">
      <p id="tasks-load-msg" class="form-msg tasks-load-msg" role="status"></p>
      <div id="tasks-open-empty" class="tasks-empty hidden"></div>
      <table class="tasks-table" id="tasks-open-table"><tbody id="tasks-open-body"></tbody></table>
      <div id="tasks-mine-empty" class="tasks-empty hidden"></div>
      <table class="tasks-table" id="tasks-mine-table"><tbody id="tasks-mine-body"></tbody></table>
      <button type="button" id="btn-tasks-refresh"></button>
    </main>
  `;
}

function clearTasksCaches() {
  jest.resetModules();
  delete require.cache[path.join(__dirname, '../public/js/tasksUi.js')];
  delete require.cache[path.join(__dirname, '../public/js/taskCommentsUi.js')];
  delete require.cache[path.join(__dirname, '../public/js/tasks.js')];
}

function jsonRes(ok, status, body) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe('Tasks page (DOM)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      'taskMarketplaceUser',
      JSON.stringify({
        id: 'user-1',
        email: 'taker@example.com',
        credit_balance: 10,
        first_name: 'T',
        last_name: 'K',
        role: 'User',
      }),
    );
    loadTasksPageShell();
    clearTasksCaches();
  });

  it('loads browse with credentials; Take then refetch shows Complete', async () => {
    const openTask = {
      id: 'task-99',
      title: 'Proofread',
      description: 'Short',
      credit: 5,
      status: 'Open',
      owner: { id: 'o1', first_name: 'Owner', last_name: 'One', email: 'o@example.com' },
      taker: null,
    };

    const inProgressTask = {
      ...openTask,
      status: 'In Progress',
      taker: { id: 'user-1', first_name: 'T', last_name: 'K', email: 'taker@example.com' },
    };

    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonRes(true, 200, { statusCode: 200, openForMe: [openTask], myAsTaker: [], myAsOwner: [] }),
      )
      .mockResolvedValueOnce(
        jsonRes(true, 200, {
          statusCode: 200,
          message: 'Task claimed',
          task: inProgressTask,
        }),
      )
      .mockResolvedValueOnce(
        jsonRes(true, 200, { statusCode: 200, openForMe: [], myAsTaker: [inProgressTask], myAsOwner: [] }),
      );

    require('../public/js/tasksUi.js');
    require('../public/js/taskCommentsUi.js');
    require('../public/js/tasks.js');

    await new Promise((r) => setTimeout(r, 40));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/browse',
      expect.objectContaining({ credentials: 'same-origin' }),
    );

    const takeBtn = document.querySelector('[data-action="take"]');
    expect(takeBtn).toBeTruthy();
    takeBtn.click();

    await new Promise((r) => setTimeout(r, 60));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/task-99/take',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );

    await new Promise((r) => setTimeout(r, 80));

    const completeBtn = document.querySelector('#tasks-mine-body [data-action="complete"]');
    expect(completeBtn).toBeTruthy();
    expect(completeBtn.textContent).toBe('Complete');
  });

  it('shows error message and refetches after failed Take (409)', async () => {
    const openTask = {
      id: 'task-1',
      title: 'Gone',
      description: 'd',
      credit: 1,
      status: 'Open',
      owner: { id: 'o1', first_name: 'O', last_name: 'O', email: 'o@example.com' },
      taker: null,
    };

    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonRes(true, 200, { statusCode: 200, openForMe: [openTask], myAsTaker: [], myAsOwner: [] }),
      )
      .mockResolvedValueOnce(
        jsonRes(false, 409, { statusCode: 409, message: 'Task is not available to claim' }),
      )
      .mockResolvedValueOnce(
        jsonRes(true, 200, { statusCode: 200, openForMe: [], myAsTaker: [], myAsOwner: [] }),
      );

    require('../public/js/tasksUi.js');
    require('../public/js/taskCommentsUi.js');
    require('../public/js/tasks.js');

    await new Promise((r) => setTimeout(r, 40));

    document.querySelector('[data-action="take"]').click();
    await new Promise((r) => setTimeout(r, 80));

    const msg = document.getElementById('tasks-load-msg');
    expect(msg.textContent).toContain('not available');
    expect(msg.classList.contains('err')).toBe(true);
    expect(globalThis.fetch.mock.calls.filter((c) => c[0] === '/api/tasks/browse').length).toBeGreaterThanOrEqual(2);
  });
});
