/**
 * @jest-environment jsdom
 */
'use strict';

const path = require('path');

function loadTasksCommentsShell() {
  document.body.innerHTML = `
    <main id="tasks-page" class="tasks-page">
      <p id="tasks-load-msg" class="form-msg tasks-load-msg" role="status"></p>
      <div id="tasks-open-empty" class="tasks-empty hidden"></div>
      <table class="tasks-table" id="tasks-open-table"><tbody id="tasks-open-body"></tbody></table>
      <div id="tasks-mine-empty" class="tasks-empty hidden"></div>
      <table class="tasks-table" id="tasks-mine-table"><tbody id="tasks-mine-body"></tbody></table>
      <div id="tasks-owner-empty" class="tasks-empty hidden"></div>
      <table class="tasks-table" id="tasks-owner-table"><tbody id="tasks-owner-body"></tbody></table>
      <button type="button" id="btn-tasks-refresh"></button>
    </main>
  `;
}

function clearCaches() {
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

describe('Task comments UI (DOM, mocked fetch)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      'taskMarketplaceUser',
      JSON.stringify({
        id: 'user-taker',
        email: 'taker@example.com',
        first_name: 'T',
        last_name: 'K',
      }),
    );
    loadTasksCommentsShell();
    clearCaches();
  });

  it('taker opens Progress, GET loads list, POST 201 appends row', async () => {
    const inProgressTask = {
      id: 'task-ip',
      title: 'WIP',
      description: 'd',
      credit: 5,
      status: 'In Progress',
      owner: { id: 'o1', first_name: 'O', last_name: 'O', email: 'o@example.com' },
      taker: { id: 'user-taker', first_name: 'T', last_name: 'K', email: 'taker@example.com' },
    };

    const newComment = {
      id: 'c-new',
      user_id: 'user-taker',
      comment: 'Shipped draft',
      created: '2026-05-13T10:00:00.000Z',
      user: { id: 'user-taker', first_name: 'T', last_name: 'K', email: 'taker@example.com' },
    };

    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonRes(true, 200, {
          statusCode: 200,
          openForMe: [],
          myAsTaker: [inProgressTask],
          myAsOwner: [],
        }),
      )
      .mockResolvedValueOnce(
        jsonRes(true, 200, { statusCode: 200, comments: [] }),
      )
      .mockResolvedValueOnce(
        jsonRes(true, 201, { statusCode: 201, message: 'Comment created', comment: newComment }),
      );

    require('../public/js/tasksUi.js');
    require('../public/js/taskCommentsUi.js');
    require('../public/js/tasks.js');

    await new Promise((r) => setTimeout(r, 50));

    const progressBtn = document.querySelector('#tasks-mine-body [data-action="toggle-comments"]');
    expect(progressBtn).toBeTruthy();
    progressBtn.click();
    await new Promise((r) => setTimeout(r, 40));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/task-ip/comments',
      expect.objectContaining({ credentials: 'same-origin' }),
    );

    const ta = document.querySelector('#tasks-mine-body .tasks-comments-textarea');
    ta.value = '  Shipped draft  ';
    document.querySelector('#tasks-mine-body .tasks-comments-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/tasks/task-ip/comments',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    const postCall = globalThis.fetch.mock.calls.find((c) => c[1] && c[1].method === 'POST');
    expect(JSON.parse(postCall[1].body)).toEqual({ comment: 'Shipped draft' });

    const items = document.querySelectorAll('#tasks-mine-body .tasks-comment-item');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.tasks-comment-body').textContent).toBe('Shipped draft');
    expect(ta.value).toBe('');
  });

  it('owner view: same GET payload shows read-only list (no post on empty submit)', async () => {
    sessionStorage.setItem(
      'taskMarketplaceUser',
      JSON.stringify({
        id: 'user-owner',
        email: 'owner@example.com',
        first_name: 'O',
        last_name: 'W',
      }),
    );
    loadTasksCommentsShell();
    clearCaches();

    const ownerTask = {
      id: 'task-own',
      title: 'Owned',
      description: '',
      credit: 3,
      status: 'In Progress',
      owner: { id: 'user-owner', first_name: 'O', last_name: 'W', email: 'owner@example.com' },
      taker: { id: 't1', first_name: 'T', last_name: 'T', email: 't@example.com' },
    };

    const comments = [
      {
        id: 'c1',
        user_id: 't1',
        comment: 'Update from taker',
        created: '2026-05-13T09:00:00.000Z',
        user: { id: 't1', first_name: 'T', last_name: 'T', email: 't@example.com' },
      },
    ];

    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonRes(true, 200, {
          statusCode: 200,
          openForMe: [],
          myAsTaker: [],
          myAsOwner: [ownerTask],
        }),
      )
      .mockResolvedValueOnce(jsonRes(true, 200, { statusCode: 200, comments }));

    require('../public/js/tasksUi.js');
    require('../public/js/taskCommentsUi.js');
    require('../public/js/tasks.js');

    await new Promise((r) => setTimeout(r, 50));

    document.querySelector('#tasks-owner-body [data-action="toggle-comments"]').click();
    await new Promise((r) => setTimeout(r, 40));

    const form = document.querySelector('#tasks-owner-body .tasks-comments-form');
    expect(form.classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#tasks-owner-body .tasks-comments-hint').textContent.length).toBeGreaterThan(10);

    const body = document.querySelector('#tasks-owner-body .tasks-comment-body');
    expect(body.textContent).toBe('Update from taker');
  });
});
