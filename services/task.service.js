'use strict';

const mongoose = require('mongoose');
const Task = require('../models/task.model');
const User = require('../models/user.model');
const { validateTaskCreatePayload, buildCreateMeta } = require('../validators/task.validation');
const taskStatusService = require('./taskStatus.service');

const USER_POPULATE_SELECT = taskStatusService.USER_POPULATE_SELECT;

async function loadUserCreditBalance(userId) {
  const user = await User.findById(userId).select('credit_balance');
  if (!user) {
    return { ok: false, httpStatus: 401, message: 'Authentication required' };
  }
  return { ok: true, creditBalance: user.credit_balance };
}

async function getCreateMeta(userId) {
  const loaded = await loadUserCreditBalance(userId);
  if (!loaded.ok) return loaded;
  return { ok: true, meta: buildCreateMeta(loaded.creditBalance) };
}

async function createTask({ ownerUserId, title, description, credit }) {
  const loaded = await loadUserCreditBalance(ownerUserId);
  if (!loaded.ok) return loaded;

  const validated = validateTaskCreatePayload({
    title,
    description,
    credit,
    creditBalance: loaded.creditBalance,
  });
  if (!validated.ok) {
    return {
      ok: false,
      httpStatus: validated.httpStatus,
      message: validated.message,
    };
  }

  const task = await Task.create({
    title: validated.title,
    description: validated.description,
    credit: validated.credit,
    owner_user_id: ownerUserId,
    status: 'Open',
    taker_user_id: null,
  });

  await task.populate('owner_user_id', USER_POPULATE_SELECT);
  await task.populate('taker_user_id', USER_POPULATE_SELECT);

  return { ok: true, task };
}

function scopeFilter(userId, scope) {
  const normalized = (scope || 'all').toLowerCase();

  if (normalized === 'owner') {
    return { owner_user_id: userId };
  }
  if (normalized === 'taker') {
    return { taker_user_id: userId };
  }
  if (normalized === 'open') {
    return {
      status: 'Open',
      taker_user_id: null,
      owner_user_id: { $ne: userId },
    };
  }

  return {
    $or: [
      { owner_user_id: userId },
      { taker_user_id: userId },
      {
        status: 'Open',
        taker_user_id: null,
        owner_user_id: { $ne: userId },
      },
    ],
  };
}

async function listTasks({ userId, scope }) {
  const filter = scopeFilter(userId, scope);
  const tasks = await Task.find(filter)
    .sort({ created: -1 })
    .populate('owner_user_id', USER_POPULATE_SELECT)
    .populate('taker_user_id', USER_POPULATE_SELECT);

  return { ok: true, tasks };
}

module.exports = {
  getCreateMeta,
  createTask,
  listTasks,
  USER_POPULATE_SELECT,
};
