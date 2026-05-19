'use strict';

const TASK_CREDIT_OPTIONS =
  (typeof globalThis !== 'undefined' && globalThis.TaskMarketplaceTaskCredits?.TASK_CREDIT_OPTIONS) ||
  [1, 3, 5, 8];

const TITLE_MIN_LENGTH = 3;
const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 20000;

function allowedCreditsForBalance(creditBalance) {
  const balance = Number(creditBalance) || 0;
  if (balance <= 0) return [];
  return TASK_CREDIT_OPTIONS.filter((c) => c <= balance);
}

function trimTitle(title) {
  return String(title ?? '').trim();
}

function trimDescription(description) {
  return String(description ?? '').trim();
}

function validateTitle(title) {
  const trimmed = trimTitle(title);
  if (!trimmed) {
    return { ok: false, message: 'Title is required', trimmed, length: 0 };
  }
  const length = trimmed.length;
  if (length < TITLE_MIN_LENGTH || length > TITLE_MAX_LENGTH) {
    return {
      ok: false,
      message: `Title must be between ${TITLE_MIN_LENGTH} and ${TITLE_MAX_LENGTH} characters`,
      trimmed,
      length,
    };
  }
  return { ok: true, message: '', trimmed, length };
}

function validateDescription(description) {
  const trimmed = trimDescription(description);
  if (!trimmed) {
    return { ok: false, message: 'Description is required', trimmed, length: 0 };
  }
  const length = trimmed.length;
  if (length > DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      message: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
      trimmed,
      length,
    };
  }
  return { ok: true, message: '', trimmed, length };
}

function validateCreditSelection(credit, creditBalance) {
  const balance = Number(creditBalance) || 0;
  if (balance <= 0) {
    return { ok: false, message: 'You need a positive credit balance to create a task' };
  }
  if (credit === undefined || credit === null || credit === '') {
    return { ok: false, message: 'Credit is required' };
  }
  const creditNum = Number(credit);
  if (!Number.isInteger(creditNum)) {
    return { ok: false, message: 'Credit must be a whole number' };
  }
  if (!TASK_CREDIT_OPTIONS.includes(creditNum)) {
    return {
      ok: false,
      message: `Credit must be one of: ${TASK_CREDIT_OPTIONS.join(', ')}`,
    };
  }
  if (creditNum > balance) {
    return {
      ok: false,
      message: 'Credit cannot exceed your available credit balance',
    };
  }
  return { ok: true, credit: creditNum, message: '' };
}

function validateCreateTaskForm({ title, description, credit, creditBalance }) {
  const balance = Number(creditBalance) || 0;
  if (balance <= 0) {
    return { ok: false, message: 'You need a positive credit balance to create a task' };
  }

  const titleResult = validateTitle(title);
  if (!titleResult.ok) return titleResult;

  const descResult = validateDescription(description);
  if (!descResult.ok) return descResult;

  const creditResult = validateCreditSelection(credit, balance);
  if (!creditResult.ok) return creditResult;

  return {
    ok: true,
    message: '',
    title: titleResult.trimmed,
    description: descResult.trimmed,
    credit: creditResult.credit,
  };
}

const taskCreateValidationApi = {
  TASK_CREDIT_OPTIONS,
  TITLE_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  allowedCreditsForBalance,
  trimTitle,
  trimDescription,
  validateTitle,
  validateDescription,
  validateCreditSelection,
  validateCreateTaskForm,
};

if (typeof globalThis !== 'undefined') {
  globalThis.TaskMarketplaceTaskCreateValidation = taskCreateValidationApi;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = taskCreateValidationApi;
}
