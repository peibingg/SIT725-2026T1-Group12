'use strict';

const mongoose = require('mongoose');
const Task = require('../models/task.model');
const Comment = require('../models/comment.model');

const MAX_COMMENT_LENGTH = 10000;

/**
 * Taker-only progress update while task is In Progress.
 */
async function createTaskComment({ taskId, callerId, rawComment }) {
  const text = String(rawComment ?? '').trim();
  if (!text) {
    return { ok: false, code: 'EMPTY', httpStatus: 400, message: 'Comment is required' };
  }
  if (text.length > MAX_COMMENT_LENGTH) {
    return {
      ok: false,
      code: 'TOO_LONG',
      httpStatus: 400,
      message: `Comment must be at most ${MAX_COMMENT_LENGTH} characters`,
    };
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return { ok: false, code: 'NOT_FOUND', httpStatus: 404, message: 'Task not found' };
  }
  if (task.status !== 'In Progress') {
    return {
      ok: false,
      code: 'WRONG_STATE',
      httpStatus: 403,
      message: 'Comments can only be added while the task is in progress',
    };
  }
  if (!task.taker_user_id || !task.taker_user_id.equals(callerId)) {
    return {
      ok: false,
      code: 'NOT_TAKER',
      httpStatus: 403,
      message: 'Only the assigned taker can add progress comments',
    };
  }

  const doc = await Comment.create({
    task_id: taskId,
    user_id: callerId,
    comment: text,
  });

  return { ok: true, comment: doc };
}

/**
 * Owner or taker may list comments for a task (ordered by created ascending).
 */
async function listTaskComments({ taskId, callerId }) {
  const task = await Task.findById(taskId);
  if (!task) {
    return { ok: false, code: 'NOT_FOUND', httpStatus: 404, message: 'Task not found' };
  }

  const isOwner = task.owner_user_id.equals(callerId);
  const isTaker = task.taker_user_id && task.taker_user_id.equals(callerId);
  if (!isOwner && !isTaker) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      httpStatus: 403,
      message: 'Only the task owner or taker can view comments',
    };
  }

  const comments = await Comment.find({ task_id: taskId })
    .sort({ created: 1 })
    .populate('user_id', 'first_name last_name email');

  return { ok: true, comments };
}

module.exports = {
  createTaskComment,
  listTaskComments,
  MAX_COMMENT_LENGTH,
};
