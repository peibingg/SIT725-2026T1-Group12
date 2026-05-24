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
      <table class="tasks-table" id="tasks-owner-table"><tbody id="tasks-owner-body"></tbody></table>
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

  it('owner approves Completed task → POST approve and browse refresh', async () => {
    sessionStorage.setItem(
      'taskMarketplaceUser',
      JSON.stringify({
        id: 'owner-1',
        email: 'owner@example.com',
        credit_balance: 50,
        first_name: 'O',
        last_name: 'W',
        role: 'User',
      }),
    );

    const completedTask = {
      id: 'task-done',
      title: 'Pay me',
      description: 'Work done',
      credit: 12,
      status: 'Completed',
      owner: { id: 'owner-1', first_name: 'O', last_name: 'W', email: 'owner@example.com' },
      taker: { id: 'taker-1', first_name: 'T', last_name: 'K', email: 'taker@example.com' },
    };

    const finalisedTask = {
      ...completedTask,
      status: 'Finalised',
    };

    globalThis.TaskMarketplaceSession = {
      getStoredUser: () => JSON.parse(sessionStorage.getItem('taskMarketplaceUser')),
      setStoredUser: (u) => sessionStorage.setItem('taskMarketplaceUser', JSON.stringify(u)),
      updateHeaderAuth: jest.fn(),
    };

    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonRes(true, 200, { statusCode: 200, openForMe: [], myAsTaker: [], myAsOwner: [completedTask] }),
      )
      .mockResolvedValueOnce(
        jsonRes(true, 200, {
          statusCode: 200,
          message: 'Task finalised and credits transferred',
          task: finalisedTask,
        }),
      )
      .mockResolvedValueOnce(
        jsonRes(true, 200, {
          statusCode: 200,
          user: {
            id: 'owner-1',
            email: 'owner@example.com',
            credit_balance: 38,
            first_name: 'O',
            last_name: 'W',
            role: 'User',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonRes(true, 200, { statusCode: 200, openForMe: [], myAsTaker: [], myAsOwner: [finalisedTask] }),
      );

    require('../public/js/tasksUi.js');
    require('../public/js/taskCommentsUi.js');
    require('../public/js/tasks.js');

    await new Promise((r) => setTimeout(r, 40));

    const approveBtn = document.querySelector('#tasks-owner-body [data-action="approve"]');
    expect(approveBtn).toBeTruthy();
    expect(approveBtn.textContent).toBe('Approve');

    approveBtn.click();
    await new Promise((r) => setTimeout(r, 80));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/task-done/approve',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    );

    expect(globalThis.TaskMarketplaceSession.updateHeaderAuth).toHaveBeenCalled();
    const stored = JSON.parse(sessionStorage.getItem('taskMarketplaceUser'));
    expect(stored.credit_balance).toBe(38);

    await new Promise((r) => setTimeout(r, 80));
    expect(document.querySelector('#tasks-owner-body [data-action="approve"]')).toBeNull();
  });

  it('shows error after failed Approve (400 insufficient credits)', async () => {
    sessionStorage.setItem(
      'taskMarketplaceUser',
      JSON.stringify({
        id: 'owner-2',
        email: 'poor@example.com',
        credit_balance: 2,
        first_name: 'P',
        last_name: 'O',
        role: 'User',
      }),
    );

    const completedTask = {
      id: 'task-expensive',
      title: 'Big job',
      description: 'd',
      credit: 20,
      status: 'Completed',
      owner: { id: 'owner-2', first_name: 'P', last_name: 'O', email: 'poor@example.com' },
      taker: { id: 'taker-1', first_name: 'T', last_name: 'K', email: 'taker@example.com' },
    };

    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonRes(true, 200, { statusCode: 200, openForMe: [], myAsTaker: [], myAsOwner: [completedTask] }),
      )
      .mockResolvedValueOnce(
        jsonRes(false, 400, {
          statusCode: 400,
          message: 'Owner credit balance is too low to pay out this task.',
        }),
      )
      .mockResolvedValueOnce(
        jsonRes(true, 200, { statusCode: 200, openForMe: [], myAsTaker: [], myAsOwner: [completedTask] }),
      );

    require('../public/js/tasksUi.js');
    require('../public/js/taskCommentsUi.js');
    require('../public/js/tasks.js');

    await new Promise((r) => setTimeout(r, 40));

    document.querySelector('#tasks-owner-body [data-action="approve"]').click();
    await new Promise((r) => setTimeout(r, 80));

    const msg = document.getElementById('tasks-load-msg');
    expect(msg.textContent).toMatch(/balance is too low/i);
    expect(msg.classList.contains('err')).toBe(true);
    expect(document.querySelector('#tasks-owner-body [data-action="approve"]')).toBeTruthy();
  });
});

describe('US-8 Approve button visibility (DOM)', () => {
  const ownerUser = {
    id: 'owner-us8',
    email: 'owner-us8@example.com',
    credit_balance: 50,
    first_name: 'O',
    last_name: 'W',
    role: 'User',
  };

  function ownerTask(id, status, takerId = 'taker-1') {
    return {
      id,
      title: `Task ${id}`,
      description: 'd',
      credit: 5,
      status,
      owner: { id: 'owner-us8', first_name: 'O', last_name: 'W', email: ownerUser.email },
      taker: takerId
        ? { id: takerId, first_name: 'T', last_name: 'K', email: 'taker@example.com' }
        : null,
    };
  }

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem('taskMarketplaceUser', JSON.stringify(ownerUser));
    clearTasksCaches();
    loadTasksPageShell();
    globalThis.TaskMarketplaceSession = {
      getStoredUser: () => JSON.parse(sessionStorage.getItem('taskMarketplaceUser')),
      setStoredUser: (u) => sessionStorage.setItem('taskMarketplaceUser', JSON.stringify(u)),
      updateHeaderAuth: jest.fn(),
    };
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonRes(true, 200, {
        statusCode: 200,
        openForMe: [],
        myAsTaker: [],
        myAsOwner: [
          ownerTask('o-open', 'Open', null),
          ownerTask('o-prog', 'In Progress'),
          ownerTask('o-done', 'Completed'),
          ownerTask('o-fin', 'Finalised'),
        ],
      }),
    );
    require('../public/js/tasksUi.js');
    require('../public/js/taskCommentsUi.js');
    require('../public/js/tasks.js');
  });

  it('shows Approve only for Completed in owner table', async () => {
    await new Promise((r) => setTimeout(r, 40));
    const approveButtons = document.querySelectorAll('#tasks-owner-body [data-action="approve"]');
    expect(approveButtons.length).toBe(1);
    expect(approveButtons[0].dataset.taskId).toBe('o-done');
    expect(approveButtons[0].textContent).toBe('Approve');
  });

  it('does not show Approve in taker table for Completed task', async () => {
    clearTasksCaches();
    sessionStorage.setItem(
      'taskMarketplaceUser',
      JSON.stringify({
        id: 'taker-us8',
        email: 'taker@example.com',
        credit_balance: 10,
        first_name: 'T',
        last_name: 'K',
        role: 'User',
      }),
    );
    globalThis.fetch = jest.fn().mockResolvedValue(
      jsonRes(true, 200, {
        statusCode: 200,
        openForMe: [],
        myAsTaker: [
          {
            id: 't-completed',
            title: 'Done work',
            description: 'd',
            credit: 3,
            status: 'Completed',
            owner: { id: 'other-owner', first_name: 'O', last_name: 'X', email: 'o@example.com' },
            taker: { id: 'taker-us8', first_name: 'T', last_name: 'K', email: 'taker@example.com' },
          },
        ],
        myAsOwner: [],
      }),
    );
    require('../public/js/tasksUi.js');
    require('../public/js/taskCommentsUi.js');
    require('../public/js/tasks.js');

    await new Promise((r) => setTimeout(r, 40));
    expect(document.querySelector('#tasks-mine-body [data-action="approve"]')).toBeNull();
    expect(document.querySelector('#tasks-mine-body [data-action="complete"]')).toBeNull();
  });
});
 