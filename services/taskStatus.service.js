'use strict';

const mongoose = require('mongoose');
const Task = require('../models/task.model');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');

const USER_POPULATE_SELECT = 'first_name last_name email';

/** Cached after first check — standalone MongoDB (default local install) cannot use transactions. */
let replicaSetTransactionsSupported = null;

class TxAbort extends Error {
  constructor(result) {
    super('TxAbort');
    this.name = 'TxAbort';
    this.result = result;
  }
}

async function canUseReplicaSetTransactions() {
  if (replicaSetTransactionsSupported !== null) {
    return replicaSetTransactionsSupported;
  }
  try {
    if (mongoose.connection.readyState !== 1) {
      replicaSetTransactionsSupported = false;
      return false;
    }
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    replicaSetTransactionsSupported = Boolean(hello.setName);
  } catch {
    replicaSetTransactionsSupported = false;
  }
  return replicaSetTransactionsSupported;
}

/** For tests: reset cached replica-set detection. */
function resetTransactionSupportCache() {
  replicaSetTransactionsSupported = null;
}

async function validateApprovePreconditions(taskId, ownerUserId) {
  const taskPeek = await Task.findById(taskId);
  if (!taskPeek) {
    return { ok: false, error: 'NOT_FOUND' };
  }
  if (!taskPeek.owner_user_id.equals(ownerUserId)) {
    return { ok: false, error: 'NOT_OWNER' };
  }
  if (taskPeek.status !== 'Completed') {
    return { ok: false, error: 'WRONG_STATE', message: 'Task must be completed before approval.' };
  }
  if (!taskPeek.taker_user_id) {
    return { ok: false, error: 'INVALID_TASK', message: 'Task has no taker.' };
  }

  const existingPayout = await Transaction.findOne({
    task_id: taskId,
    purpose: 'Payout',
    status: 'Active',
  }).lean();
  if (existingPayout) {
    return {
      ok: false,
      error: 'ALREADY_PAID',
      message: 'Payout for this task has already been recorded.',
    };
  }

  const owner = await User.findById(ownerUserId);
  const amt = taskPeek.credit;
  if (!owner || owner.credit_balance < amt) {
    return {
      ok: false,
      error: 'INSUFFICIENT_CREDITS',
      message: 'Owner credit balance is too low to pay out this task.',
    };
  }

  return { ok: true, taskPeek, amt };
}

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
 * Payout without MongoDB transactions (standalone dev MongoDB).
 * Uses atomic updates + compensating rollback on failure.
 */
async function approveWithoutTransaction({ taskId, ownerUserId }) {
  const pre = await validateApprovePreconditions(taskId, ownerUserId);
  if (!pre.ok) return pre;

  const { amt } = pre;

  const ownerAfter = await User.findOneAndUpdate(
    { _id: ownerUserId, credit_balance: { $gte: amt } },
    { $inc: { credit_balance: -amt } },
    { new: true }
  );
  if (!ownerAfter) {
    return {
      ok: false,
      error: 'INSUFFICIENT_CREDITS',
      message: 'Owner credit balance is too low to pay out this task.',
    };
  }

  const task = await Task.findOne({
    _id: taskId,
    status: 'Completed',
    owner_user_id: ownerUserId,
  });
  if (!task || !task.taker_user_id) {
    await User.updateOne({ _id: ownerUserId }, { $inc: { credit_balance: amt } });
    return { ok: false, error: 'WRONG_STATE', message: 'Task state changed; try again.' };
  }

  const takerId = task.taker_user_id;
  await User.updateOne({ _id: takerId }, { $inc: { credit_balance: amt } });

  let payout;
  try {
    payout = await Transaction.create({
      task_id: task._id,
      credit: amt,
      owner_user_id: task.owner_user_id,
      taker_user_id: takerId,
      status: 'Active',
      purpose: 'Payout',
    });
  } catch (e) {
    await User.updateOne({ _id: ownerUserId }, { $inc: { credit_balance: amt } });
    await User.updateOne({ _id: takerId }, { $inc: { credit_balance: -amt } });
    if (e && e.code === 11000) {
      return {
        ok: false,
        error: 'ALREADY_PAID',
        message: 'Payout for this task has already been recorded.',
      };
    }
    throw e;
  }

  const finalised = await Task.findOneAndUpdate(
    { _id: taskId, status: 'Completed', owner_user_id: ownerUserId },
    { $set: { status: 'Finalised' } },
    { new: true }
  )
    .populate('owner_user_id', USER_POPULATE_SELECT)
    .populate('taker_user_id', USER_POPULATE_SELECT);

  if (!finalised) {
    await Transaction.deleteOne({ _id: payout._id });
    await User.updateOne({ _id: ownerUserId }, { $inc: { credit_balance: amt } });
    await User.updateOne({ _id: takerId }, { $inc: { credit_balance: -amt } });
    return { ok: false, error: 'CONFLICT', message: 'Could not finalise task.' };
  }

  return { ok: true, task: finalised };
}

/**
 * Completed → Finalised + credit transfer inside a transaction (replica set / mongos).
 */
async function approveWithTransaction({ taskId, ownerUserId }) {
  const pre = await validateApprovePreconditions(taskId, ownerUserId);
  if (!pre.ok) return pre;

  const { amt } = pre;

  const session = await mongoose.startSession();
  let abortResult = null;
  try {
    await session.withTransaction(async () => {
      const task = await Task.findOne({
        _id: taskId,
        status: 'Completed',
        owner_user_id: ownerUserId,
      }).session(session);

      if (!task) {
        abortResult = { ok: false, error: 'WRONG_STATE', message: 'Task state changed; try again.' };
        throw new TxAbort(abortResult);
      }

      const dup = await Transaction.findOne({
        task_id: taskId,
        purpose: 'Payout',
        status: 'Active',
      }).session(session);
      if (dup) {
        abortResult = {
          ok: false,
          error: 'ALREADY_PAID',
          message: 'Payout for this task has already been recorded.',
        };
        throw new TxAbort(abortResult);
      }

      const ownerDedupe = await User.findOneAndUpdate(
        { _id: ownerUserId, credit_balance: { $gte: amt } },
        { $inc: { credit_balance: -amt } },
        { session, new: true }
      );
      if (!ownerDedupe) {
        abortResult = {
          ok: false,
          error: 'INSUFFICIENT_CREDITS',
          message: 'Owner credit balance is too low to pay out this task.',
        };
        throw new TxAbort(abortResult);
      }

      await User.updateOne({ _id: task.taker_user_id }, { $inc: { credit_balance: amt } }).session(session);

      try {
        await Transaction.create(
          [
            {
              task_id: task._id,
              credit: amt,
              owner_user_id: task.owner_user_id,
              taker_user_id: task.taker_user_id,
              status: 'Active',
              purpose: 'Payout',
            },
          ],
          { session }
        );
      } catch (e) {
        if (e && e.code === 11000) {
          abortResult = {
            ok: false,
            error: 'ALREADY_PAID',
            message: 'Payout for this task has already been recorded.',
          };
          throw new TxAbort(abortResult);
        }
        throw e;
      }

      const finalised = await Task.findOneAndUpdate(
        { _id: taskId, status: 'Completed', owner_user_id: ownerUserId },
        { $set: { status: 'Finalised' } },
        { new: true, session }
      )
        .populate('owner_user_id', USER_POPULATE_SELECT)
        .populate('taker_user_id', USER_POPULATE_SELECT);

      if (!finalised) {
        abortResult = { ok: false, error: 'CONFLICT', message: 'Could not finalise task.' };
        throw new TxAbort(abortResult);
      }

      abortResult = { ok: true, task: finalised };
    });

    return abortResult;
  } catch (e) {
    if (e instanceof TxAbort) {
      return e.result;
    }
    if (e && e.code === 11000) {
      return {
        ok: false,
        error: 'ALREADY_PAID',
        message: 'Payout for this task has already been recorded.',
      };
    }
    throw e;
  } finally {
    session.endSession();
  }
}

/**
 * Completed → Finalised + credit transfer. Owner only (US-8 / FR-8, FR-9).
 *
 * FR-9: Credits move on **Finalised** (this approve step), not when the taker marks **Completed**.
 * Payout is atomic with the status change (transaction on replica set, or ordered updates + rollback
 * on standalone dev MongoDB). A payout `Transaction` row prevents double-spend / replay (409).
 *
 * Uses transactions on replica set; falls back for standalone local MongoDB.
 */
async function approveCompletedByOwner({ taskId, ownerUserId }) {
  if (await canUseReplicaSetTransactions()) {
    return approveWithTransaction({ taskId, ownerUserId });
  }
  return approveWithoutTransaction({ taskId, ownerUserId });
}

module.exports = {
  claimTask,
  completeTaskByTaker,
  approveCompletedByOwner,
  resetTransactionSupportCache,
  USER_POPULATE_SELECT,
};
 