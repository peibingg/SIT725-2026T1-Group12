/**
 * @jest-environment jsdom
 */
'use strict';

const path = require('path');

function loadDetailShell() {
  document.body.innerHTML = `
    <main id="task-detail-page">
      <p id="task-detail-load-msg" class="form-msg"></p>
      <article id="task-detail-card" class="task-detail-card hidden">
        <h1 id="task-detail-title"></h1>
        <p id="task-detail-role"></p>
        <dd id="task-detail-status"></dd>
        <div id="task-detail-description"></div>
        <ul id="task-detail-comments"></ul>
        <p id="task-detail-comments-msg"></p>
      </article>
    </main>
  `;
}

describe('Task detail page (DOM)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      'taskMarketplaceUser',
      JSON.stringify({ id: 'u1', email: 'u@example.com', first_name: 'U', last_name: 'S' }),
    );
    delete window.location;
    window.location = { pathname: '/tasks/task-abc', replace: jest.fn() };
    loadDetailShell();
    jest.resetModules();
    delete require.cache[path.join(__dirname, '../public/js/tasksUi.js')];
    delete require.cache[path.join(__dirname, '../public/js/taskCommentsUi.js')];
    delete require.cache[path.join(__dirname, '../public/js/taskDetail.js')];
  });

  it('renders task fields and comments with textContent (XSS-safe)', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        {
          ok: true,
          status: 200,
          json: async () => ({
            statusCode: 200,
            viewerRole: 'owner',
            task: {
              id: 'task-abc',
              title: 'Test <script>',
              description: '<img onerror=alert(1)>',
              credit: 5,
              status: 'In Progress',
              created: '2026-01-01T00:00:00.000Z',
              owner: { id: 'u1', first_name: 'U', last_name: 'S', email: 'u@example.com' },
              taker: null,
            },
          }),
        },
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          statusCode: 200,
          comments: [
            {
              id: 'c1',
              user_id: 'u1',
              comment: '<b>bold</b>',
              created: '2026-01-02T00:00:00.000Z',
              user: { id: 'u1', first_name: 'U', last_name: 'S', email: 'u@example.com' },
            },
          ],
        }),
      });

    require('../public/js/tasksUi.js');
    require('../public/js/taskCommentsUi.js');
    require('../public/js/taskDetail.js');

    await new Promise((r) => setTimeout(r, 50));

    const title = document.getElementById('task-detail-title');
    expect(title.textContent).toBe('Test <script>');
    expect(title.innerHTML).not.toContain('<script>');

    const desc = document.getElementById('task-detail-description');
    expect(desc.textContent).toBe('<img onerror=alert(1)>');

    const body = document.querySelector('.task-detail-comment-body');
    expect(body.textContent).toBe('<b>bold</b>');
    expect(body.querySelector('b')).toBeNull();
  });
});
 