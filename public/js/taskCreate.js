'use strict';

/**
 * Create Task UI: GET /api/tasks/create-meta, POST /api/tasks (credentials: same-origin).
 */
const CreateVal = () => globalThis.TaskMarketplaceTaskCreateValidation;
const Api = () => globalThis.TaskMarketplaceApi;
const Credits = () => globalThis.TaskMarketplaceTaskCredits;

let createMeta = null;

function getStoredUser() {
  return globalThis.TaskMarketplaceSession?.getStoredUser?.() ?? null;
}

async function refreshStoredUserFromServer() {
  const api = Api();
  if (!api) return;
  const { res, data } = await api.apiGet('/api/auth/me');
  if (res.ok && data.user) {
    globalThis.TaskMarketplaceSession?.setStoredUser?.(data.user);
    globalThis.TaskMarketplaceSession?.updateHeaderAuth?.();
  }
}

async function loadCreateMeta() {
  const api = Api();
  if (!api) return null;
  const { res, data } = await api.apiGet('/api/tasks/create-meta');
  if (res.status === 401) return { unauthorized: true };
  if (!res.ok) return { error: data.message || 'Could not load create options' };
  createMeta = {
    credit_balance: data.credit_balance,
    canCreate: data.canCreate,
    allowedCredits: data.allowedCredits || [],
    presetCredits: data.presetCredits || Credits()?.TASK_CREDIT_OPTIONS || [1, 3, 5, 8],
  };
  return createMeta;
}

function updateCreateEntryVisibility() {
  const btn = document.getElementById('btn-create-task');
  const hint = document.getElementById('create-task-zero-hint');
  if (!btn || !hint) return;

  const canCreate = createMeta && createMeta.canCreate === true;
  btn.classList.toggle('hidden', !canCreate);
  btn.disabled = !canCreate;
  hint.classList.toggle('hidden', canCreate || !getStoredUser());
}

function renderCreditOptions() {
  const fieldset = document.getElementById('create-task-credit-options');
  if (!fieldset || !createMeta) return;

  fieldset.replaceChildren();
  const allowed = new Set(createMeta.allowedCredits || []);
  const presets = createMeta.presetCredits || Credits()?.TASK_CREDIT_OPTIONS || [1, 3, 5, 8];

  for (const value of presets) {
    const id = `create-credit-${value}`;
    const label = document.createElement('label');
    label.className = 'create-task-credit-option';
    label.htmlFor = id;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'credit';
    input.id = id;
    input.value = String(value);
    if (!allowed.has(value)) {
      input.disabled = true;
    }

    const span = document.createElement('span');
    span.textContent = `${value} credit${value === 1 ? '' : 's'}`;

    label.appendChild(input);
    label.appendChild(span);
    fieldset.appendChild(label);
  }
}

function setFieldError(el, message) {
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('err', Boolean(message));
}

function updateTitleField() {
  const input = document.getElementById('create-task-title');
  const counter = document.getElementById('create-task-title-count');
  const err = document.getElementById('create-task-title-error');
  const val = CreateVal();
  if (!input || !val) return;

  const r = val.validateTitle(input.value);
  if (counter) {
    counter.textContent = `${r.length} / ${val.TITLE_MAX_LENGTH}`;
    counter.classList.toggle('warn', r.length > 0 && !r.ok);
  }
  setFieldError(err, input.value.trim() === '' ? '' : r.ok ? '' : r.message);
  return r;
}

function updateDescriptionField() {
  const input = document.getElementById('create-task-description');
  const counter = document.getElementById('create-task-description-count');
  const err = document.getElementById('create-task-description-error');
  const val = CreateVal();
  if (!input || !val) return;

  const r = val.validateDescription(input.value);
  if (counter) {
    counter.textContent = `${r.length} / ${val.DESCRIPTION_MAX_LENGTH}`;
    const nearLimit = r.length > val.DESCRIPTION_MAX_LENGTH * 0.9;
    counter.classList.toggle('warn', nearLimit && r.ok);
    counter.classList.toggle('err', !r.ok);
  }
  setFieldError(err, input.value.trim() === '' ? '' : r.ok ? '' : r.message);
  return r;
}

function getSelectedCredit() {
  const checked = document.querySelector('#create-task-credit-options input[name="credit"]:checked');
  return checked ? checked.value : '';
}

function updateCreditField() {
  const err = document.getElementById('create-task-credit-error');
  const val = CreateVal();
  if (!val || !createMeta) return { ok: false };

  const r = val.validateCreditSelection(getSelectedCredit(), createMeta.credit_balance);
  setFieldError(err, getSelectedCredit() === '' && !r.ok ? '' : r.ok ? '' : r.message);
  return r;
}

function collectFormValidation() {
  const val = CreateVal();
  if (!val) {
    return { ok: false, message: 'Form validation is unavailable. Refresh the page.' };
  }
  if (!createMeta?.canCreate) {
    return {
      ok: false,
      message: 'You need a positive credit balance to create a task.',
    };
  }

  updateTitleField();
  updateDescriptionField();
  updateCreditField();

  return val.validateCreateTaskForm({
    title: document.getElementById('create-task-title')?.value,
    description: document.getElementById('create-task-description')?.value,
    credit: getSelectedCredit(),
    creditBalance: createMeta.credit_balance,
  });
}

function showFormMessage(text, isError) {
  const msg = document.getElementById('create-task-form-msg');
  if (!msg) return;
  msg.textContent = text || '';
  msg.classList.remove('ok', 'err');
  if (text) msg.classList.add(isError ? 'err' : 'ok');
}

function wireCreateForm() {
  const form = document.getElementById('form-create-task');
  const modal = document.getElementById('modal-create-task');
  const openBtn = document.getElementById('btn-create-task');
  if (!form || !modal) return;

  const openModal = () => {
    if (!createMeta?.canCreate) return;
    setFieldError(document.getElementById('create-task-title-error'), '');
    setFieldError(document.getElementById('create-task-description-error'), '');
    setFieldError(document.getElementById('create-task-credit-error'), '');
    showFormMessage('', false);
    renderCreditOptions();
    updateTitleField();
    updateDescriptionField();
    updateCreditField();
    showFormMessage('', false);
    if (typeof modal.showModal === 'function') modal.showModal();
  };

  openBtn?.addEventListener('click', openModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.close();
  });
  modal.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => modal.close());
  });

  form.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.name) return;
    if (t.id === 'create-task-title' || t.name === 'title') updateTitleField();
    if (t.id === 'create-task-description' || t.name === 'description') updateDescriptionField();
    if (t.name === 'credit') updateCreditField();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const api = Api();
    if (!api) {
      showFormMessage('API client failed to load. Refresh the page.', true);
      return;
    }
    if (!createMeta) {
      showFormMessage('Create options are not loaded. Refresh the page and try again.', true);
      return;
    }

    const full = collectFormValidation();

    if (!full.ok) {
      showFormMessage(full.message, true);
      return;
    }

    const submitBtn = document.getElementById('btn-create-task-submit');
    if (submitBtn) submitBtn.disabled = true;
    showFormMessage('Creating task…', false);

    try {
      const { res, data } = await api.apiPostJson('/api/tasks', {
        title: full.title,
        description: full.description,
        credit: full.credit,
        owner_user_id: 'must-be-ignored',
      });

      if (res.status === 201 && data.task) {
        await refreshStoredUserFromServer();
        await loadCreateMeta();
        updateCreateEntryVisibility();
        renderCreditOptions();
        modal.close();
        form.reset();
        globalThis.TaskMarketplaceFlash?.set({
          type: 'ok',
          message: `Task created: ${data.task.title}`,
        });
        globalThis.TaskMarketplaceTaskCreate?.onTaskCreated?.(data.task);
        return;
      }

      const errText =
        data.message ||
        (res.status === 403
          ? 'You cannot create a task with your current balance.'
          : res.status === 404
            ? 'Create task API not found. Restart the server (npm start) and try again.'
            : 'Could not create task.');
      showFormMessage(errText, true);
    } catch (_) {
      showFormMessage('Network error. Try again.', true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function renderPostedOpenRow(task, ui) {
  const tr = document.createElement('tr');
  tr.dataset.taskId = task.id;

  const titleTd = document.createElement('td');
  titleTd.textContent = task.title || '—';
  tr.appendChild(titleTd);

  const descTd = document.createElement('td');
  descTd.className = 'tasks-desc-cell';
  const text = (task.description || '').trim();
  descTd.textContent = text.length > 140 ? `${text.slice(0, 140)}…` : text || '—';
  tr.appendChild(descTd);

  const creditTd = document.createElement('td');
  creditTd.textContent = task.credit != null ? String(task.credit) : '—';
  tr.appendChild(creditTd);

  const statusTd = document.createElement('td');
  statusTd.textContent = ui ? ui.statusToDisplayLabel(task.status) : task.status || 'Open';
  tr.appendChild(statusTd);

  return tr;
}

async function loadPostedOpenTasks() {
  const tbody = document.getElementById('tasks-posted-body');
  const empty = document.getElementById('tasks-posted-empty');
  const table = document.getElementById('tasks-posted-table');
  const api = Api();
  const ui = globalThis.TaskMarketplaceTasksUi;
  if (!tbody || !api) return;

  const { res, data } = await api.apiGet('/api/tasks?scope=owner');
  if (!res.ok) {
    tbody.replaceChildren();
    if (empty) empty.classList.remove('hidden');
    if (table) table.classList.add('hidden');
    return;
  }

  const posted = (data.tasks || []).filter(
    (t) => t.status === 'Open' && (!t.taker || t.taker === null),
  );

  tbody.replaceChildren();
  for (const task of posted) {
    tbody.appendChild(renderPostedOpenRow(task, ui));
  }

  const isEmpty = posted.length === 0;
  if (empty) empty.classList.toggle('hidden', !isEmpty);
  if (table) table.classList.toggle('hidden', isEmpty);
}

async function initTaskCreate() {
  if (!document.getElementById('tasks-page')) return;
  if (!getStoredUser()) return;

  const meta = await loadCreateMeta();
  if (meta && meta.unauthorized) return;

  if (meta && meta.error) {
    showFormMessage(meta.error, true);
  }

  updateCreateEntryVisibility();
  wireCreateForm();
  await loadPostedOpenTasks();
}

const taskCreateApi = {
  initTaskCreate,
  loadCreateMeta,
  loadPostedOpenTasks,
  onTaskCreated: null,
};

if (typeof globalThis !== 'undefined') {
  globalThis.TaskMarketplaceTaskCreate = taskCreateApi;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = taskCreateApi;
}
