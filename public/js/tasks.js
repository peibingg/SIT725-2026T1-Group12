'use strict';

/**
 * Tasks page: GET /api/tasks/browse, POST take / complete with credentials: 'same-origin'.
 * Uses TaskMarketplaceTasksUi for labels and description truncation (see tasksUi.js).
 */
const TM_STORAGE_USER_KEY = 'taskMarketplaceUser';
const TM_STORAGE_RETURN_URL_KEY = 'taskMarketplaceReturnUrl';

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
  const data = await res.json().catch(() => ({}));
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

  if (mode === 'open') appendActionsOpen(tr, task);
  else appendActionsMine(tr, task, currentUserId);

  return tr;
}

function renderSection(tbody, tasks, mode, currentUserId) {
  clearTable(tbody);
  for (const task of tasks || []) {
    tbody.appendChild(renderRow(task, mode, currentUserId));
  }
}

let loadInFlight = false;

async function loadBrowse() {
  const msgEl = document.getElementById('tasks-load-msg');
  const openBody = document.getElementById('tasks-open-body');
  const mineBody = document.getElementById('tasks-mine-body');
  const openEmpty = document.getElementById('tasks-open-empty');
  const mineEmpty = document.getElementById('tasks-mine-empty');
  const openTable = document.getElementById('tasks-open-table');
  const mineTable = document.getElementById('tasks-mine-table');

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
      setEmptyVisible(openEmpty, openTable, true);
      setEmptyVisible(mineEmpty, mineTable, true);
      return;
    }

    showLoadMsg(msgEl, '', false);
    const me = getStoredUser();
    const currentUserId = me && me.id;

    const openList = data.openForMe || [];
    const mineList = data.myAsTaker || [];
    const myPostedOpen = data.meta && typeof data.meta.myPostedOpenCount === 'number' ? data.meta.myPostedOpenCount : 0;

    renderSection(openBody, openList, 'open', currentUserId);
    renderSection(mineBody, mineList, 'mine', currentUserId);

    setEmptyVisible(openEmpty, openTable, openList.length === 0);
    setEmptyVisible(mineEmpty, mineTable, mineList.length === 0);

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
    await loadBrowseRollback(openBody, mineBody, openEmpty, mineEmpty, openTable, mineTable);
  } finally {
    loadInFlight = false;
  }
}

async function loadBrowseRollback(openBody, mineBody, openEmpty, mineEmpty, openTable, mineTable) {
  try {
    const { res, data } = await getJson('/api/tasks/browse');
    if (!res.ok) return;
    const me = getStoredUser();
    const currentUserId = me && me.id;
    const openList = data.openForMe || [];
    const mineList = data.myAsTaker || [];
    renderSection(openBody, openList, 'open', currentUserId);
    renderSection(mineBody, mineList, 'mine', currentUserId);
    setEmptyVisible(openEmpty, openTable, openList.length === 0);
    setEmptyVisible(mineEmpty, mineTable, mineList.length === 0);
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
    globalThis.TaskMarketplaceFlash?.consume();
    loadBrowse();
  })();
}

initTasksPage();
