'use strict';

const { TASK_CREDIT_OPTIONS } = require('../constants/taskCredits');

const TITLE_MIN_LENGTH = 3;
const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 20000;

function validateCreateTaskInput({ title, description, credit, creditBalance }) {
  if (creditBalance <= 0) {
    return {
      ok: false,
      httpStatus: 403,
      message: 'You need a positive credit balance to create a task',
    };
  }

  if (title === undefined || title === null || String(title).trim() === '') {
    return { ok: false, httpStatus: 400, message: 'Title is required' };
  }
  if (description === undefined || description === null || String(description).trim() === '') {
    return { ok: false, httpStatus: 400, message: 'Description is required' };
  }
  if (credit === undefined || credit === null || credit === '') {
    return { ok: false, httpStatus: 400, message: 'Credit is required' };
  }

  const trimmedTitle = String(title).trim();
  const trimmedDescription = String(description).trim();

  if (trimmedTitle.length < TITLE_MIN_LENGTH || trimmedTitle.length > TITLE_MAX_LENGTH) {
    return {
      ok: false,
      httpStatus: 400,
      message: `Title must be between ${TITLE_MIN_LENGTH} and ${TITLE_MAX_LENGTH} characters`,
    };
  }

  if (trimmedDescription.length > DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      httpStatus: 400,
      message: `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
    };
  }

  const creditNum = Number(credit);
  if (!Number.isInteger(creditNum)) {
    return { ok: false, httpStatus: 400, message: 'Credit must be a whole number' };
  }

  if (!TASK_CREDIT_OPTIONS.includes(creditNum)) {
    return {
      ok: false,
      httpStatus: 400,
      message: `Credit must be one of: ${TASK_CREDIT_OPTIONS.join(', ')}`,
    };
  }

  if (creditNum > creditBalance) {
    return {
      ok: false,
      httpStatus: 400,
      message: 'Credit cannot exceed your available credit balance',
    };
  }

  return {
    ok: true,
    title: trimmedTitle,
    description: trimmedDescription,
    credit: creditNum,
  };
}

function buildCreateMeta(creditBalance) {
  const balance = Number(creditBalance) || 0;
  return {
    credit_balance: balance,
    canCreate: balance > 0,
    allowedCredits: TASK_CREDIT_OPTIONS.filter((c) => c <= balance),
    presetCredits: TASK_CREDIT_OPTIONS,
  };
}

module.exports = {
  TITLE_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  validateCreateTaskInput,
  buildCreateMeta,
};
