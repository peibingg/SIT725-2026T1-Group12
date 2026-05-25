'use strict';

const mongoose = require('mongoose');
const Task = require('../models/task.model');
const creditService = require('./credit.service');

const USER_POPULATE_SELECT = creditService.USER_POPULATE_SELECT;

/**
 * Open → In Progress (claim). Single atomic findOneAndUpdate; concurrent claims lose with NOT_CLAIMABLE.
 */
async function claimTask({ taskId, userId }) {
  const updated = await Task.findOneAndUpdate(
    {
      _id: taskId,
      status: 'Open',
      taker_user_id: null,
      owner_user_id: { $ne: userId },
    },
    { $set: { status: 'In Progress', taker_user_id: userId } },
    { new: true }
  )
    .populate('owner_user_id', USER_POPULATE_SELECT)
    .populate('taker_user_id', USER_POPULATE_SELECT);

  if (updated) {
    return { ok: true, task: updated };
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return { ok: false, error: 'NOT_FOUND' };
  }
  if (task.owner_user_id.equals(userId)) {
    return { ok: false, error: 'OWN_TASK' };
  }
  if (task.status === 'In Progress' || task.status === 'Completed' || task.status === 'Finalised') {
    return {
      ok: false,
      error: 'NOT_CLAIMABLE',
      message: 'Task is not open for claiming (already in progress, completed, or finalised).',
    };
  }
  if (task.status === 'Open' && task.taker_user_id) {
    return { ok: false, error: 'NOT_CLAIMABLE', message: 'Task is not available to claim.' };
  }
  return { ok: false, error: 'NOT_CLAIMABLE', message: 'Task is not available to claim.' };
}

/**
 * In Progress → Completed. Only assigned taker; atomic conditional update.
 * Does not transfer credits (payout runs on owner approve → Finalised).
 */
async function completeTaskByTaker({ taskId, userId }) {
  const updated = await Task.findOneAndUpdate(
    {
      _id: taskId,
      status: 'In Progress',
      taker_user_id: userId,
    },
    { $set: { status: 'Completed' } },
    { new: true }
  )
    .populate('owner_user_id', USER_POPULATE_SELECT)
    .populate('taker_user_id', USER_POPULATE_SELECT);

  if (updated) {
    return { ok: true, task: updated };
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return { ok: false, error: 'NOT_FOUND' };
  }
  if (!task.taker_user_id || !task.taker_user_id.equals(userId)) {
    return { ok: false, error: 'NOT_TAKER' };
  }
  return { ok: false, error: 'WRONG_STATE', message: 'Task is not in progress.' };
}

/**
 * Completed → Finalised + credit transfer. Owner only (US-8 / FR-8, FR-9).
 * Delegates payout to credit.service (single server-side entry for balance changes).
 */
async function approveCompletedByOwner({ taskId, ownerUserId }) {
  return creditService.executeTaskPayout({ taskId, ownerUserId });
}

module.exports = {
  claimTask,
  completeTaskByTaker,
  approveCompletedByOwner,
  resetTransactionSupportCache: creditService.resetTransactionSupportCache,
  USER_POPULATE_SELECT,
};
 