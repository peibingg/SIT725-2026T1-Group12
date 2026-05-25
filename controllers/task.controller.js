'use strict';

const mongoose = require('mongoose');
const Task = require('../models/task.model');
const taskStatusService = require('../services/taskStatus.service');
const taskService = require('../services/task.service');

const USER_POPULATE_SELECT = taskStatusService.USER_POPULATE_SELECT;

function serializeUser(ref) {
  if (!ref) return null;
  if (ref instanceof mongoose.Types.ObjectId) return null;
  return {
    id: ref._id.toString(),
    first_name: ref.first_name,
    last_name: ref.last_name,
    email: ref.email,
  };
}

function serializeTask(doc) {
  const plain = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: plain._id.toString(),
    title: plain.title,
    description: plain.description,
    credit: plain.credit,
    status: plain.status,
    created: plain.created,
    owner: serializeUser(plain.owner_user_id),
    taker: serializeUser(plain.taker_user_id),
  };
}

function parseUserId(req) {
  return new mongoose.Types.ObjectId(req.session.userId);
}

function invalidIdResponse(res) {
  return res.status(400).json({ statusCode: 400, message: 'Invalid task id' });
}

const ping = (req, res) => {
  res.json({ statusCode: 200, message: 'task controller skeleton' });
};

const createMeta = async (req, res) => {
  try {
    const userId = parseUserId(req);
    const r = await taskService.getCreateMeta(userId);
    if (!r.ok) {
      return res.status(r.httpStatus).json({ statusCode: r.httpStatus, message: r.message });
    }
    return res.json({ statusCode: 200, ...r.meta });
  } catch (err) {
    console.error('createMeta error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not load create metadata' });
  }
};

const createTask = async (req, res) => {
  try {
    const ownerUserId = parseUserId(req);
    const { title, description, credit } = req.body || {};

    const r = await taskService.createTask({
      ownerUserId,
      title,
      description,
      credit,
    });

    if (!r.ok) {
      return res.status(r.httpStatus).json({ statusCode: r.httpStatus, message: r.message });
    }

    return res.status(201).json({
      statusCode: 201,
      message: 'Task created',
      task: serializeTask(r.task),
    });
  } catch (err) {
    console.error('createTask error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not create task' });
  }
};

const listTasks = async (req, res) => {
  try {
    const userId = parseUserId(req);
    const scope = req.query.scope;
    const r = await taskService.listTasks({ userId, scope });
    if (!r.ok) {
      return res.status(r.httpStatus).json({ statusCode: r.httpStatus, message: r.message });
    }
    return res.json({
      statusCode: 200,
      tasks: r.tasks.map((t) => serializeTask(t)),
    });
  } catch (err) {
    console.error('listTasks error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not load tasks' });
  }
};

const getTaskById = async (req, res) => {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    return invalidIdResponse(res);
  }

  const taskId = new mongoose.Types.ObjectId(id);
  const userId = parseUserId(req);

  try {
    const r = await taskService.getTaskDetailForParticipant({ taskId, userId });
    if (r.ok) {
      return res.json({
        statusCode: 200,
        task: serializeTask(r.task),
        viewerRole: r.viewerRole,
      });
    }
    if (r.error === 'NOT_FOUND') {
      return res.status(404).json({ statusCode: 404, message: 'Task not found' });
    }
    if (r.error === 'FORBIDDEN') {
      return res.status(403).json({
        statusCode: 403,
        message: r.message || 'You do not have access to this task',
      });
    }
    return res.status(403).json({ statusCode: 403, message: r.message || 'Access denied' });
  } catch (err) {
    console.error('getTaskById error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not load task' });
  }
};

const browse = async (req, res) => {
  try {
    const userId = parseUserId(req);

    const [openForMe, myAsTaker, myAsOwner, myPostedOpenCount] = await Promise.all([
      Task.find({
        status: 'Open',
        taker_user_id: null,
        owner_user_id: { $ne: userId },
      })
        .sort({ created: -1 })
        .populate('owner_user_id', USER_POPULATE_SELECT)
        .populate('taker_user_id', USER_POPULATE_SELECT),
      Task.find({
        taker_user_id: userId,
        status: { $in: ['In Progress', 'Completed', 'Finalised'] },
      })
        .sort({ created: -1 })
        .populate('owner_user_id', USER_POPULATE_SELECT)
        .populate('taker_user_id', USER_POPULATE_SELECT),
      Task.find({
        owner_user_id: userId,
        status: { $in: ['In Progress', 'Completed', 'Finalised'] },
      })
        .sort({ created: -1 })
        .populate('owner_user_id', USER_POPULATE_SELECT)
        .populate('taker_user_id', USER_POPULATE_SELECT),
      Task.countDocuments({
        status: 'Open',
        taker_user_id: null,
        owner_user_id: userId,
      }),
    ]);

    res.json({
      statusCode: 200,
      openForMe: openForMe.map((t) => serializeTask(t)),
      myAsTaker: myAsTaker.map((t) => serializeTask(t)),
      myAsOwner: myAsOwner.map((t) => serializeTask(t)),
      meta: {
        myPostedOpenCount: myPostedOpenCount,
      },
    });
  } catch (err) {
    console.error('browse error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not load tasks' });
  }
};

const takeTask = async (req, res) => {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    return invalidIdResponse(res);
  }

  const taskId = new mongoose.Types.ObjectId(id);
  const userId = parseUserId(req);

  try {
    const r = await taskStatusService.claimTask({ taskId, userId });
    if (r.ok) {
      return res.json({
        statusCode: 200,
        message: 'Task claimed',
        task: serializeTask(r.task),
      });
    }
    if (r.error === 'NOT_FOUND') {
      return res.status(404).json({ statusCode: 404, message: 'Task not found' });
    }
    if (r.error === 'OWN_TASK') {
      return res.status(403).json({ statusCode: 403, message: 'You cannot claim your own task' });
    }
    return res.status(409).json({
      statusCode: 409,
      message: r.message || 'Task is not available to claim',
    });
  } catch (err) {
    console.error('takeTask error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not claim task' });
  }
};

const completeTask = async (req, res) => {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    return invalidIdResponse(res);
  }

  const taskId = new mongoose.Types.ObjectId(id);
  const userId = parseUserId(req);

  try {
    const r = await taskStatusService.completeTaskByTaker({ taskId, userId });
    if (r.ok) {
      return res.json({
        statusCode: 200,
        message: 'Task marked completed',
        task: serializeTask(r.task),
      });
    }
    if (r.error === 'NOT_FOUND') {
      return res.status(404).json({ statusCode: 404, message: 'Task not found' });
    }
    if (r.error === 'NOT_TAKER') {
      return res.status(403).json({ statusCode: 403, message: 'Only the assigned taker can complete this task' });
    }
    return res.status(409).json({
      statusCode: 409,
      message: r.message || 'Task is not in progress',
    });
  } catch (err) {
    console.error('completeTask error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not complete task' });
  }
};

const approveTask = async (req, res) => {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    return invalidIdResponse(res);
  }

  const taskId = new mongoose.Types.ObjectId(id);
  const ownerUserId = parseUserId(req);

  try {
    const r = await taskStatusService.approveCompletedByOwner({ taskId, ownerUserId });
    if (r.ok) {
      return res.json({
        statusCode: 200,
        message: 'Task finalised and credits transferred',
        task: serializeTask(r.task),
      });
    }
    if (r.error === 'NOT_FOUND') {
      return res.status(404).json({ statusCode: 404, message: 'Task not found' });
    }
    if (r.error === 'NOT_OWNER') {
      return res.status(403).json({ statusCode: 403, message: 'Only the task owner can approve payout' });
    }
    if (r.error === 'INSUFFICIENT_CREDITS') {
      return res.status(400).json({
        statusCode: 400,
        message: r.message || 'Insufficient credits to pay the taker',
      });
    }
    if (r.error === 'INVALID_TASK') {
      return res.status(400).json({ statusCode: 400, message: r.message || 'Invalid task for payout' });
    }
    if (r.error === 'ALREADY_PAID') {
      return res.status(409).json({
        statusCode: 409,
        message: r.message || 'Payout already recorded for this task',
      });
    }
    if (r.error === 'WRONG_STATE' || r.error === 'CONFLICT') {
      return res.status(409).json({
        statusCode: 409,
        message: r.message || 'Task cannot be approved in its current state',
      });
    }
    return res.status(409).json({ statusCode: 409, message: r.message || 'Could not approve task' });
  } catch (err) {
    console.error('approveTask error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not approve task' });
  }
};

module.exports = {
  ping,
  createMeta,
  createTask,
  listTasks,
  getTaskById,
  browse,
  takeTask,
  completeTask,
  approveTask,
};
 