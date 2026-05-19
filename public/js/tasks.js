'use strict';

/**
 * Tasks page: GET /api/tasks/browse, POST take / complete, task progress comments (GET/POST comments).
 * Uses TaskMarketplaceTasksUi (tasksUi.js) and TaskMarketplaceTaskComments (taskCommentsUi.js).
 */
const TM_STORAGE_USER_KEY = 'taskMarketplaceUser';
const TM_STORAGE_RETURN_URL_KEY = 'taskMarketplaceReturnUrl';

/** Table column count including Progress (must match tasks.html thead). */
const TASKS_TABLE_COLSPAN = 8;

const browseTaskById = new Map();

function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(TM_STORAGE_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getUi() {
  return globalThis.TaskMarketplaceTasksUi;
}

function showLoadMsg(el, text, isError) {
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('ok', 'err');
  if (text) el.classList.add(isError ? 'err' : 'ok');
}

async function getJson(url) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const hasHeadersGet = res.headers && typeof res.headers.get === 'function';
  const ct = hasHeadersGet ? (res.headers.get('content-type') || '').toLowerCase() : '';
  let data = {};
  if (!hasHeadersGet || ct.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  }
  return { res, data };
}

async function postJsonEmpty(url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({}),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function postCommentJson(taskId, body) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function ensureSessionUserForTasksPage() {
  if (getStoredUser()) return true;

  const res = await fetch('/api/auth/me', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.user) {
    const session = globalThis.TaskMarketplaceSession;
    if (session && typeof session.setStoredUser === 'function') {
      session.setStoredUser(data.user);
    } else {
      try {
        sessionStorage.setItem(TM_STORAGE_USER_KEY, JSON.stringify(data.user));
      } catch (_) {
        /* ignore */
      }
    }
    if (session && typeof session.updateHeaderAuth === 'function') {
      session.updateHeaderAuth();
    }
    return true;
  }
  return false;
}

function rememberBrowseTasks(openList, mineList, ownerList) {
  browseTaskById.clear();
  for (const t of openList || []) browseTaskById.set(t.id, t);
  for (const t of mineList || []) browseTaskById.set(t.id, t);
  for (const t of ownerList || []) browseTaskById.set(t.id, t);
}

function clearTable(tbody) {
  if (!tbody) return;
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
}

function setEmptyVisible(emptyEl, tableEl, isEmpty) {
  if (emptyEl) emptyEl.classList.toggle('hidden', !isEmpty);
  if (tableEl) tableEl.classList.toggle('hidden', isEmpty);
}

function buildDescriptionCell(task) {
  const ui = getUi();
  if (!ui) return document.createElement('td');

  const td = document.createElement('td');
  td.className = 'tasks-desc-cell';

  const { preview, full, isTruncated } = ui.truncateDescription(task.description);
  const shown = document.createElement('span');
  shown.className = 'tasks-desc-shown';
  shown.textContent = isTruncated ? `${preview}…` : preview;

  const fullEl = document.createElement('span');
  fullEl.className = 'tasks-desc-full hidden';
  fullEl.textContent = full;

  td.appendChild(shown);
  td.appendChild(fullEl);

  if (isTruncated) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-link tasks-desc-toggle';
    btn.textContent = 'Show more';
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      if (!expanded) {
        shown.classList.add('hidden');
        fullEl.classList.remove('hidden');
        btn.textContent = 'Show less';
        btn.setAttribute('aria-expanded', 'true');
      } else {
        shown.classList.remove('hidden');
        fullEl.classList.add('hidden');
        btn.textContent = 'Show more';
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    td.appendChild(btn);
  }

  return td;
}

function appendActionsOpen(tr, task) {
  const td = document.createElement('td');
  td.className = 'tasks-actions-cell';
  if (task.status === 'Open') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-task-action';
    btn.textContent = 'Take';
    btn.dataset.action = 'take';
    btn.dataset.taskId = task.id;
    td.appendChild(btn);
  } else {
    td.appendChild(document.createTextNode('—'));
  }
  tr.appendChild(td);
}

function appendActionsMine(tr, task, currentUserId) {
  const td = document.createElement('td');
  td.className = 'tasks-actions-cell';
  const isTaker = task.taker && String(task.taker.id) === String(currentUserId);
  if (task.status === 'In Progress' && isTaker) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-task-action';
    btn.textContent = 'Complete';
    btn.dataset.action = 'complete';
    btn.dataset.taskId = task.id;
    td.appendChild(btn);
  } else {
    td.appendChild(document.createTextNode('—'));
  }
  tr.appendChild(td);
}

function appendActionsOwner(tr) {
  const td = document.createElement('td');
  td.className = 'tasks-actions-cell';
  td.appendChild(document.createTextNode('—'));
  tr.appendChild(td);
}

function appendProgressCell(tr, task, mode) {
  const td = document.createElement('td');
  td.className = 'tasks-progress-cell';
  if (mode === 'mine' || mode === 'owner') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-task-comments';
    btn.textContent = 'Progress';
    btn.dataset.action = 'toggle-comments';
    btn.dataset.taskId = task.id;
    btn.setAttribute('aria-expanded', 'false');
    td.appendChild(btn);
  } else {
    td.appendChild(document.createTextNode('—'));
  }
  tr.appendChild(td);
}

function buildCommentDetailRow(taskId) {
  const detailTr = document.createElement('tr');
  detailTr.className = 'tasks-comments-expand-row hidden';
  detailTr.dataset.detailFor = taskId;

  const td = document.createElement('td');
  td.colSpan = TASKS_TABLE_COLSPAN;
  td.className = 'tasks-comments-expand-cell';

  const panel = document.createElement('div');
  panel.className = 'tasks-comments-panel';

  const statusEl = document.createElement('p');
  statusEl.className = 'tasks-comments-panel-status form-msg';
  statusEl.setAttribute('role', 'status');

  const errEl = document.createElement('p');
  errEl.className = 'tasks-comments-panel-err form-msg';
  errEl.setAttribute('role', 'status');

  const listEl = document.createElement('ul');
  listEl.className = 'tasks-comments-list';

  const hintEl = document.createElement('p');
  hintEl.className = 'tasks-comments-hint';

  const form = document.createElement('form');
  form.className = 'tasks-comments-form';
  form.dataset.taskId = taskId;

  const ta = document.createElement('textarea');
  ta.className = 'tasks-comments-textarea';
  ta.setAttribute('aria-label', 'Progress comment');
  ta.rows = 3;
  ta.maxLength = 10000;

  const postErr = document.createElement('p');
  postErr.className = 'tasks-comments-post-err form-msg';

  const submitRow = document.createElement('div');
  submitRow.className = 'tasks-comments-form-actions';
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary btn-comments-submit';
  submitBtn.textContent = 'Post update';

  submitRow.appendChild(submitBtn);
  form.appendChild(ta);
  form.appendChild(postErr);
  form.appendChild(submitRow);

  panel.appendChild(statusEl);
  panel.appendChild(errEl);
  panel.appendChild(listEl);
  panel.appendChild(hintEl);
  panel.appendChild(form);
  td.appendChild(panel);
  detailTr.appendChild(td);
  return detailTr;
}

function syncComposerVisibility(panel, task, me) {
  const Comments = globalThis.TaskMarketplaceTaskComments;
  const hintEl = panel.querySelector('.tasks-comments-hint');
  const form = panel.querySelector('.tasks-comments-form');
  if (!Comments || !hintEl || !form) return;

  if (!task) {
    form.classList.add('hidden');
    hintEl.textContent = 'Task details are not available.';
    hintEl.classList.remove('hidden');
    return;
  }

  const { showComposer, hint } = Comments.composerStateForTask(task, me);
  if (showComposer) {
    form.classList.remove('hidden');
    hintEl.classList.add('hidden');
    hintEl.textContent = '';
  } else {
    form.classList.add('hidden');
    hintEl.classList.remove('hidden');
    hintEl.textContent = hint;
  }
}

function renderCommentListItem(ul, dto) {
  const Comments = globalThis.TaskMarketplaceTaskComments;
  if (!Comments || !ul) return;
  const row = Comments.mapCommentApiToRow(dto);
  const li = document.createElement('li');
  li.className = 'tasks-comment-item';
  li.dataset.commentId = row.id;

  const meta = document.createElement('div');
  meta.className = 'tasks-comment-meta';
  const who = document.createElement('span');
  who.className = 'tasks-comment-author';
  who.textContent = row.authorLabel;
  const time = document.createElement('time');
  time.className = 'tasks-comment-time';
  if (row.created) {
    const d = new Date(row.created);
    if (!Number.isNaN(d.getTime())) time.dateTime = d.toISOString();
  }
  time.textContent = row.createdDisplay;

  meta.appendChild(who);
  meta.appendChild(document.createTextNode(' · '));
  meta.appendChild(time);

  const body = document.createElement('div');
  body.className = 'tasks-comment-body';
  body.textContent = dto.comment != null ? String(dto.comment) : '';

  li.appendChild(meta);
  li.appendChild(body);
  ul.appendChild(li);
}

async function fetchCommentsIntoPanel(panel, taskId) {
  const statusEl = panel.querySelector('.tasks-comments-panel-status');
  const errEl = panel.querySelector('.tasks-comments-panel-err');
  const listEl = panel.querySelector('.tasks-comments-list');
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.remove('err');
  }
  if (statusEl) statusEl.textContent = 'Loading comments…';

  const { res, data } = await getJson(`/api/tasks/${encodeURIComponent(taskId)}/comments`);

  if (statusEl) statusEl.textContent = '';

  if (!res.ok) {
    if (listEl) listEl.replaceChildren();
    if (errEl) {
      if (res.status === 401) {
        errEl.textContent = data.message || 'You need to be signed in to view progress comments.';
      } else if (res.status === 403) {
        errEl.textContent = data.message || 'You cannot view comments on this task.';
      } else if (res.status === 404) {
        if (data && data.statusCode === 404 && data.message) {
          errEl.textContent =
            data.message === 'Task not found'
              ? `${data.message} Try “Refresh lists” if the database changed since this page loaded.`
              : data.message;
        } else {
          errEl.textContent =
            'Comments API returned 404 without JSON (route may be missing). Stop and restart `npm start` after pulling the latest code, then hard-refresh this page (Ctrl+Shift+R / Cmd+Shift+R).';
        }
      } else {
        errEl.textContent = data.message || 'Could not load comments.';
      }
      errEl.classList.add('err');
    }
    return;
  }

  if (listEl) {
    listEl.replaceChildren();
    for (const c of data.comments || []) {
      renderCommentListItem(listEl, c);
    }
  }
}

function renderRow(task, mode, currentUserId) {
  const ui = getUi();
  const tr = document.createElement('tr');
  tr.dataset.taskId = task.id;

  const titleTd = document.createElement('td');
  titleTd.textContent = task.title || '—';
  tr.appendChild(titleTd);

  tr.appendChild(buildDescriptionCell(task));

  const ownerTd = document.createElement('td');
  ownerTd.textContent = ui ? ui.formatPersonName(task.owner) : '—';
  tr.appendChild(ownerTd);

  const creditTd = document.createElement('td');
  creditTd.textContent = task.credit != null ? String(task.credit) : '—';
  tr.appendChild(creditTd);

  const takerTd = document.createElement('td');
  takerTd.textContent = ui ? ui.formatPersonName(task.taker) : '—';
  tr.appendChild(takerTd);

  const statusTd = document.createElement('td');
  statusTd.textContent = ui ? ui.statusToDisplayLabel(task.status) : task.status || '—';
  tr.appendChild(statusTd);

  if (mode === 'open') {
    appendActionsOpen(tr, task);
    appendProgressCell(tr, task, 'open');
  } else if (mode === 'owner') {
    appendActionsOwner(tr);
    appendProgressCell(tr, task, 'owner');
  } else {
    appendActionsMine(tr, task, currentUserId);
    appendProgressCell(tr, task, 'mine');
  }

  let detailTr = null;
  if (mode === 'mine' || mode === 'owner') {
    detailTr = buildCommentDetailRow(task.id);
  }
  return { tr, detailTr };
}

function renderSection(tbody, tasks, mode, currentUserId) {
  if (!tbody) return;
  clearTable(tbody);
  for (const task of tasks || []) {
    const { tr, detailTr } = renderRow(task, mode, currentUserId);
    tbody.appendChild(tr);
    if (detailTr) tbody.appendChild(detailTr);
  }
}

let loadInFlight = false;

async function loadBrowse() {
  const msgEl = document.getElementById('tasks-load-msg');
  const openBody = document.getElementById('tasks-open-body');
  const mineBody = document.getElementById('tasks-mine-body');
  const ownerBody = document.getElementById('tasks-owner-body');
  const openEmpty = document.getElementById('tasks-open-empty');
  const mineEmpty = document.getElementById('tasks-mine-empty');
  const ownerEmpty = document.getElementById('tasks-owner-empty');
  const openTable = document.getElementById('tasks-open-table');
  const mineTable = document.getElementById('tasks-mine-table');
  const ownerTable = document.getElementById('tasks-owner-table');

  if (loadInFlight) return;
  loadInFlight = true;
  showLoadMsg(msgEl, 'Loading…', false);

  try {
    const { res, data } = await getJson('/api/tasks/browse');
    if (res.status === 401) {
      try {
        sessionStorage.removeItem(TM_STORAGE_USER_KEY);
        sessionStorage.setItem(TM_STORAGE_RETURN_URL_KEY, '/tasks.html');
      } catch (_) {
        /* ignore */
      }
      globalThis.TaskMarketplaceFlash?.set({
        type: 'err',
        message: 'Sign in to view and manage tasks.',
      });
      window.location.replace('/');
      return;
    }

    if (!res.ok) {
      showLoadMsg(msgEl, data.message || 'Could not load tasks.', true);
      renderSection(openBody, [], 'open', null);
      renderSection(mineBody, [], 'mine', null);
      renderSection(ownerBody, [], 'owner', null);
      setEmptyVisible(openEmpty, openTable, true);
      setEmptyVisible(mineEmpty, mineTable, true);
      setEmptyVisible(ownerEmpty, ownerTable, true);
      rememberBrowseTasks([], [], []);
      return;
    }

    showLoadMsg(msgEl, '', false);
    const me = getStoredUser();
    const currentUserId = me && me.id;

    const openList = data.openForMe || [];
    const mineList = data.myAsTaker || [];
    const ownerList = data.myAsOwner || [];
    const myPostedOpen = data.meta && typeof data.meta.myPostedOpenCount === 'number' ? data.meta.myPostedOpenCount : 0;

    rememberBrowseTasks(openList, mineList, ownerList);

    renderSection(openBody, openList, 'open', currentUserId);
    renderSection(mineBody, mineList, 'mine', currentUserId);
    renderSection(ownerBody, ownerList, 'owner', currentUserId);

    setEmptyVisible(openEmpty, openTable, openList.length === 0);
    setEmptyVisible(mineEmpty, mineTable, mineList.length === 0);
    setEmptyVisible(ownerEmpty, ownerTable, ownerList.length === 0);

    if (openEmpty && openList.length === 0) {
      if (myPostedOpen > 0) {
        openEmpty.textContent = `No takeable tasks from other members right now. You have ${myPostedOpen} open task${myPostedOpen === 1 ? '' : 's'} you posted; those are not listed here (you cannot claim your own work).`;
      } else {
        openEmpty.textContent =
          'No open tasks from other members right now. Tasks you create only appear here for other people to take.';
      }
    }
  } catch (err) {
    console.error('loadBrowse:', err);
    showLoadMsg(msgEl, 'Network error. Try again.', true);
    await loadBrowseRollback(openBody, mineBody, ownerBody, openEmpty, mineEmpty, ownerEmpty, openTable, mineTable, ownerTable);
  } finally {
    loadInFlight = false;
  }
}

async function loadBrowseRollback(
  openBody,
  mineBody,
  ownerBody,
  openEmpty,
  mineEmpty,
  ownerEmpty,
  openTable,
  mineTable,
  ownerTable,
) {
  try {
    const { res, data } = await getJson('/api/tasks/browse');
    if (!res.ok) return;
    const me = getStoredUser();
    const currentUserId = me && me.id;
    const openList = data.openForMe || [];
    const mineList = data.myAsTaker || [];
    const ownerList = data.myAsOwner || [];
    rememberBrowseTasks(openList, mineList, ownerList);
    renderSection(openBody, openList, 'open', currentUserId);
    renderSection(mineBody, mineList, 'mine', currentUserId);
    renderSection(ownerBody, ownerList, 'owner', currentUserId);
    setEmptyVisible(openEmpty, openTable, openList.length === 0);
    setEmptyVisible(mineEmpty, mineTable, mineList.length === 0);
    setEmptyVisible(ownerEmpty, ownerTable, ownerList.length === 0);
  } catch (_) {
    /* ignore */
  }
}

async function handleTake(taskId) {
  const msgEl = document.getElementById('tasks-load-msg');
  const { res, data } = await postJsonEmpty(`/api/tasks/${encodeURIComponent(taskId)}/take`);
  if (res.ok && data.task) {
    showLoadMsg(msgEl, '', false);
    await loadBrowse();
    return;
  }
  const errText = data.message || 'Could not claim this task.';
  await loadBrowse();
  showLoadMsg(msgEl, errText, true);
}

async function handleComplete(taskId) {
  const msgEl = document.getElementById('tasks-load-msg');
  const { res, data } = await postJsonEmpty(`/api/tasks/${encodeURIComponent(taskId)}/complete`);
  if (res.ok && data.task) {
    showLoadMsg(msgEl, '', false);
    await loadBrowse();
    return;
  }
  const errText = data.message || 'Could not complete this task.';
  await loadBrowse();
  showLoadMsg(msgEl, errText, true);
}

function wireCommentsInteraction() {
  const page = document.getElementById('tasks-page');
  if (!page || page.dataset.commentsWired === '1') return;
  page.dataset.commentsWired = '1';

  page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="toggle-comments"]');
    if (!btn || btn.disabled) return;
    const taskId = btn.dataset.taskId;
    if (!taskId) return;
    const tbody = btn.closest('tbody');
    if (!tbody) return;

    const detailRow = Array.from(tbody.querySelectorAll('tr.tasks-comments-expand-row')).find(
      (r) => r.dataset.detailFor === taskId,
    );
    if (!detailRow) return;

    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      detailRow.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
      return;
    }

    detailRow.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    const panel = detailRow.querySelector('.tasks-comments-panel');
    if (!panel) return;

    const task = browseTaskById.get(taskId);
    const me = getStoredUser()?.id;
    syncComposerVisibility(panel, task, me);
    await fetchCommentsIntoPanel(panel, taskId);
  });

  page.addEventListener('submit', async (e) => {
    const form = e.target.closest('.tasks-comments-form');
    if (!form) return;
    e.preventDefault();
    const taskId = form.dataset.taskId;
    const panel = form.closest('.tasks-comments-panel');
    if (!taskId || !panel) return;

    const Comments = globalThis.TaskMarketplaceTaskComments;
    const ta = form.querySelector('.tasks-comments-textarea');
    const postErr = form.querySelector('.tasks-comments-post-err');
    const submitBtn = form.querySelector('.btn-comments-submit');
    if (postErr) {
      postErr.textContent = '';
      postErr.classList.remove('err', 'ok');
    }

    const raw = ta ? ta.value : '';
    const v = Comments
      ? Comments.validateCommentForSubmit(raw)
      : { ok: false, clientMessage: 'Comment validation is unavailable.' };
    if (!v.ok) {
      if (postErr) {
        postErr.textContent = v.clientMessage;
        postErr.classList.add('err');
      }
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const { res, data } = await postCommentJson(taskId, { comment: v.text });
      if (res.status === 201 && data.comment) {
        if (ta) ta.value = '';
        if (postErr) postErr.textContent = '';
        const listEl = panel.querySelector('.tasks-comments-list');
        if (listEl) renderCommentListItem(listEl, data.comment);
        const errEl = panel.querySelector('.tasks-comments-panel-err');
        if (errEl) {
          errEl.textContent = '';
          errEl.classList.remove('err');
        }
        return;
      }
      if (postErr) {
        if (res.status === 400) {
          postErr.textContent = data.message || 'Comment could not be saved.';
        } else if (res.status === 401) {
          postErr.textContent = data.message || 'You need to be signed in to post.';
        } else if (res.status === 403) {
          postErr.textContent = data.message || 'You cannot post this comment.';
        } else if (res.status === 404) {
          postErr.textContent = data.message || 'Task not found.';
        } else {
          postErr.textContent = data.message || 'Could not post comment.';
        }
        postErr.classList.add('err');
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function wireActions() {
  document.getElementById('btn-tasks-refresh')?.addEventListener('click', () => loadBrowse());

  document.getElementById('tasks-open-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="take"]');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.taskId;
    if (!id) return;
    btn.disabled = true;
    handleTake(id).finally(() => {
      btn.disabled = false;
    });
  });

  document.getElementById('tasks-mine-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="complete"]');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.taskId;
    if (!id) return;
    btn.disabled = true;
    handleComplete(id).finally(() => {
      btn.disabled = false;
    });
  });

  wireCommentsInteraction();
}

function initTasksPage() {
  if (!document.getElementById('tasks-page')) return;
  void (async () => {
    const ok = await ensureSessionUserForTasksPage();
    if (!ok) {
      try {
        sessionStorage.setItem(TM_STORAGE_RETURN_URL_KEY, '/tasks.html');
      } catch (_) {
        /* ignore */
      }
      globalThis.TaskMarketplaceFlash?.set({
        type: 'err',
        message: 'Sign in to view tasks.',
      });
      window.location.replace('/');
      return;
    }
    wireActions();
    const taskCreate = globalThis.TaskMarketplaceTaskCreate;
    if (taskCreate) {
      taskCreate.onTaskCreated = async () => {
        await loadBrowse();
        await taskCreate.loadPostedOpenTasks();
      };
      await taskCreate.initTaskCreate();
    }
    globalThis.TaskMarketplaceFlash?.consume();
    loadBrowse();
  })();
}

initTasksPage();
