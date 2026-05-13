'use strict';

const mongoose = require('mongoose');
const Task = require('../models/task.model');

const USER_POPULATE_SELECT = 'first_name last_name email';

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

const browse = async (req, res) => {
  try {
    const userId = parseUserId(req);

    const [openForMe, myAsTaker] = await Promise.all([
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
    ]);

    res.json({
      statusCode: 200,
      openForMe: openForMe.map((t) => serializeTask(t)),
      myAsTaker: myAsTaker.map((t) => serializeTask(t)),
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
      return res.json({
        statusCode: 200,
        message: 'Task claimed',
        task: serializeTask(updated),
      });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ statusCode: 404, message: 'Task not found' });
    }

    if (task.owner_user_id.equals(userId)) {
      return res.status(403).json({ statusCode: 403, message: 'You cannot claim your own task' });
    }

    return res.status(409).json({
      statusCode: 409,
      message: 'Task is not available to claim',
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
      return res.json({
        statusCode: 200,
        message: 'Task marked completed',
        task: serializeTask(updated),
      });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ statusCode: 404, message: 'Task not found' });
    }

    if (!task.taker_user_id || !task.taker_user_id.equals(userId)) {
      return res.status(403).json({ statusCode: 403, message: 'Only the assigned taker can complete this task' });
    }

    return res.status(409).json({
      statusCode: 409,
      message: 'Task is not in progress',
    });
  } catch (err) {
    console.error('completeTask error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not complete task' });
  }
};

module.exports = { ping, browse, takeTask, completeTask };
