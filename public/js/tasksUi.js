'use strict';

/**
 * Pure helpers for Tasks UI: API status values are unchanged on the wire; labels are display-only.
 */
const DESCRIPTION_PREVIEW_MAX = 140;

const STATUS_DISPLAY_LABELS = {
  Open: 'Open',
  'In Progress': 'Pending',
  Completed: 'Completed',
  Finalised: 'Finalised',
};

function statusToDisplayLabel(status) {
  if (status == null || status === '') return '—';
  return STATUS_DISPLAY_LABELS[status] || String(status);
}

function formatPersonName(person) {
  if (!person || typeof person !== 'object') return '—';
  const fn = (person.first_name || '').trim();
  const ln = (person.last_name || '').trim();
  const name = `${fn} ${ln}`.trim();
  return name || '—';
}

/**
 * @returns {{ preview: string, full: string, isTruncated: boolean }}
 */
function truncateDescription(text, maxLen = DESCRIPTION_PREVIEW_MAX) {
  const full = text == null ? '' : String(text);
  const limit = typeof maxLen === 'number' && maxLen > 0 ? maxLen : DESCRIPTION_PREVIEW_MAX;
  if (full.length <= limit) {
    return { preview: full, full, isTruncated: false };
  }
  return { preview: full.slice(0, limit), full, isTruncated: true };
}

const tasksUiApi = {
  DESCRIPTION_PREVIEW_MAX,
  STATUS_DISPLAY_LABELS,
  statusToDisplayLabel,
  formatPersonName,
  truncateDescription,
};

if (typeof globalThis !== 'undefined') {
  globalThis.TaskMarketplaceTasksUi = tasksUiApi;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = tasksUiApi;
}
