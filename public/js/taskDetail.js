'use strict';

/**
 * Task detail page: GET /api/tasks/:id + GET /api/tasks/:id/comments (owner or taker only).
 * MVP updates = current status + chronological progress comments.
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

function parseTaskIdFromPath() {
  const parts = (window.location.pathname || '').split('/').filter(Boolean);
  if (parts.length >= 2 && parts[0] === 'tasks') {
    return decodeURIComponent(parts[1]);
  }
  return null;
}

function formatCreated(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
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

async function ensureSession() {
  if (getStoredUser()) return true;
  const { res, data } = await getJson('/api/auth/me');
  if (res.ok && data.user) {
    const session = globalThis.TaskMarketplaceSession;
    if (session && typeof session.setStoredUser === 'function') {
      session.setStoredUser(data.user);
      session.updateHeaderAuth?.();
    } else {
      try {
        sessionStorage.setItem(TM_STORAGE_USER_KEY, JSON.stringify(data.user));
      } catch (_) {
        /* ignore */
      }
    }
    return true;
  }
  return false;
}

function renderCommentItem(ul, dto) {
  const Comments = globalThis.TaskMarketplaceTaskComments;
  if (!Comments || !ul) return;
  const row = Comments.mapCommentApiToRow(dto);
  const li = document.createElement('li');
  li.className = 'task-detail-comment-item';

  const meta = document.createElement('div');
  meta.className = 'task-detail-comment-meta';
  const who = document.createElement('span');
  who.textContent = row.authorLabel;
  const time = document.createElement('time');
  if (row.created) {
    const d = new Date(row.created);
    if (!Number.isNaN(d.getTime())) time.dateTime = d.toISOString();
  }
  time.textContent = row.createdDisplay;
  meta.appendChild(who);
  meta.appendChild(document.createTextNode(' · '));
  meta.appendChild(time);

  const body = document.createElement('div');
  body.className = 'task-detail-comment-body';
  body.textContent = dto.comment != null ? String(dto.comment) : '';

  li.appendChild(meta);
  li.appendChild(body);
  ul.appendChild(li);
}

function renderTaskDetail(task, viewerRole) {
  const ui = getUi();
  const card = document.getElementById('task-detail-card');
  if (!card) return;

  const titleEl = document.getElementById('task-detail-title');
  const roleEl = document.getElementById('task-detail-role');
  const statusEl = document.getElementById('task-detail-status');
  const creditEl = document.getElementById('task-detail-credit');
  const ownerEl = document.getElementById('task-detail-owner');
  const takerEl = document.getElementById('task-detail-taker');
  const createdEl = document.getElementById('task-detail-created');
  const descEl = document.getElementById('task-detail-description');
  const statusNote = document.getElementById('task-detail-status-note');

  if (titleEl) titleEl.textContent = task.title || '—';
  if (roleEl) {
    roleEl.textContent =
      viewerRole === 'owner'
        ? 'You are the owner of this task.'
        : 'You are the assigned taker for this task.';
  }
  if (statusEl) statusEl.textContent = ui ? ui.statusToDisplayLabel(task.status) : task.status || '—';
  if (creditEl) creditEl.textContent = task.credit != null ? String(task.credit) : '—';
  if (ownerEl) ownerEl.textContent = ui ? ui.formatPersonName(task.owner) : '—';
  if (takerEl) takerEl.textContent = ui ? ui.formatPersonName(task.taker) : '—';
  if (createdEl) createdEl.textContent = formatCreated(task.created);
  if (descEl) descEl.textContent = task.description != null ? String(task.description) : '';
  if (statusNote) {
    statusNote.textContent = `Current workflow status: ${task.status || '—'}.`;
  }

  card.classList.remove('hidden');
}

async function loadComments(taskId) {
  const msgEl = document.getElementById('task-detail-comments-msg');
  const listEl = document.getElementById('task-detail-comments');
  if (msgEl) msgEl.textContent = 'Loading comments…';

  const { res, data } = await getJson(`/api/tasks/${encodeURIComponent(taskId)}/comments`);

  if (msgEl) msgEl.textContent = '';

  if (!res.ok) {
    if (listEl) listEl.replaceChildren();
    if (msgEl) {
      msgEl.textContent = data.message || 'Could not load comments.';
      msgEl.classList.add('err');
    }
    return;
  }

  if (listEl) {
    listEl.replaceChildren();
    for (const c of data.comments || []) {
      renderCommentItem(listEl, c);
    }
    if ((data.comments || []).length === 0 && msgEl) {
      msgEl.textContent = 'No progress comments yet.';
    }
  }
}

async function initTaskDetailPage() {
  const page = document.getElementById('task-detail-page');
  if (!page) return;

  const taskId = parseTaskIdFromPath();
  const loadMsg = document.getElementById('task-detail-load-msg');

  if (!taskId) {
    if (loadMsg) {
      loadMsg.textContent = 'Invalid task link.';
      loadMsg.classList.add('err');
    }
    return;
  }

  const ok = await ensureSession();
  if (!ok) {
    try {
      sessionStorage.setItem(TM_STORAGE_RETURN_URL_KEY, window.location.pathname);
    } catch (_) {
      /* ignore */
    }
    globalThis.TaskMarketplaceFlash?.set({
      type: 'err',
      message: 'Sign in to view task details.',
    });
    window.location.replace('/');
    return;
  }

  if (loadMsg) loadMsg.textContent = 'Loading…';

  const { res, data } = await getJson(`/api/tasks/${encodeURIComponent(taskId)}`);

  if (res.status === 401) {
    try {
      sessionStorage.removeItem(TM_STORAGE_USER_KEY);
      sessionStorage.setItem(TM_STORAGE_RETURN_URL_KEY, window.location.pathname);
    } catch (_) {
      /* ignore */
    }
    window.location.replace('/');
    return;
  }

  if (!res.ok) {
    if (loadMsg) {
      loadMsg.textContent =
        res.status === 403
          ? data.message || 'You do not have access to this task.'
          : res.status === 404
            ? data.message || 'Task not found.'
            : data.message || 'Could not load task.';
      loadMsg.classList.add('err');
    }
    document.title = 'Task detail — Task Marketplace';
    return;
  }

  if (loadMsg) {
    loadMsg.textContent = '';
    loadMsg.classList.remove('err');
  }

  const task = data.task;
  document.title = `${task.title || 'Task'} — Task Marketplace`;
  renderTaskDetail(task, data.viewerRole);
  await loadComments(taskId);
  globalThis.TaskMarketplaceFlash?.consume();
}

initTaskDetailPage();
 