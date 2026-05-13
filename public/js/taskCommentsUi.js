'use strict';

/**
 * Task progress comments (US-7): pure helpers for mapping API payloads and client-side checks.
 * Server remains authoritative; these mirror trim / length for UX.
 */
const MAX_COMMENT_LENGTH = 10000;

function escapeHtml(s) {
  const str = s == null ? '' : String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string|Date|undefined|null} iso
 * @returns {string}
 */
function formatCommentCreated(iso) {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

function authorLabelFromComment(dto) {
  if (dto && dto.user && typeof dto.user === 'object') {
    const fn = (dto.user.first_name || '').trim();
    const ln = (dto.user.last_name || '').trim();
    const name = `${fn} ${ln}`.trim();
    if (name) return name;
    if (dto.user.email) return String(dto.user.email);
  }
  if (dto && dto.user_id) return `User ${dto.user_id}`;
  return 'Unknown';
}

/**
 * Map GET /api/tasks/:id/comments item to a display row (plain-text body stays in `comment`; use textContent in DOM).
 * @param {{ id: string, user_id: string, comment: string, created?: string, user?: object }} dto
 * @returns {{ id: string, user_id: string, comment: string, created: string|undefined, authorLabel: string, bodyEscaped: string, createdDisplay: string }}
 */
function mapCommentApiToRow(dto) {
  const id = dto && dto.id != null ? String(dto.id) : '';
  const user_id = dto && dto.user_id != null ? String(dto.user_id) : '';
  const comment = dto && dto.comment != null ? String(dto.comment) : '';
  const created = dto && dto.created != null ? dto.created : undefined;
  return {
    id,
    user_id,
    comment,
    created,
    authorLabel: authorLabelFromComment(dto),
    bodyEscaped: escapeHtml(comment),
    createdDisplay: formatCommentCreated(created),
  };
}

/**
 * @param {object} task — browse task shape with owner / taker ids
 * @param {string|undefined} currentUserId
 * @returns {{ showComposer: boolean, hint: string }}
 */
function composerStateForTask(task, currentUserId) {
  const me = currentUserId != null ? String(currentUserId) : '';
  const isTaker = task && task.taker && String(task.taker.id) === me;
  const isOwner = task && task.owner && String(task.owner.id) === me;

  if (isTaker && task.status === 'In Progress') {
    return {
      showComposer: true,
      hint: '',
    };
  }
  if (isOwner) {
    return {
      showComposer: false,
      hint: 'You can read progress updates from your taker. Only the assigned taker can post comments while work is in progress.',
    };
  }
  if (isTaker) {
    return {
      showComposer: false,
      hint: 'Progress comments can only be posted while the task is in progress.',
    };
  }
  return {
    showComposer: false,
    hint: 'You cannot post progress on this task.',
  };
}

/**
 * Client-side mirror of server rules (trim, empty, max length).
 * @param {unknown} rawText
 * @returns {{ ok: true, text: string } | { ok: false, code: string, clientMessage: string }}
 */
function validateCommentForSubmit(rawText) {
  const text = String(rawText ?? '').trim();
  if (!text) {
    return { ok: false, code: 'EMPTY', clientMessage: 'Enter a comment before posting.' };
  }
  if (text.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      code: 'TOO_LONG',
      clientMessage: `Comment must be at most ${MAX_COMMENT_LENGTH} characters.`,
    };
  }
  return { ok: true, text };
}

const taskCommentsUiApi = {
  MAX_COMMENT_LENGTH,
  escapeHtml,
  formatCommentCreated,
  authorLabelFromComment,
  mapCommentApiToRow,
  composerStateForTask,
  validateCommentForSubmit,
};

if (typeof globalThis !== 'undefined') {
  globalThis.TaskMarketplaceTaskComments = taskCommentsUiApi;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = taskCommentsUiApi;
}
