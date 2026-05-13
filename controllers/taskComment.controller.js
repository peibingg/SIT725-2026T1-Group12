'use strict';

const mongoose = require('mongoose');
const Comment = require('../models/comment.model');
const taskCommentService = require('../services/taskComment.service');

function parseUserId(req) {
  return new mongoose.Types.ObjectId(req.session.userId);
}

function serializeComment(doc) {
  const plain = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const uid = plain.user_id;
  const userIdStr =
    uid && uid._id
      ? uid._id.toString()
      : uid && typeof uid.toString === 'function'
        ? uid.toString()
        : String(uid);

  const out = {
    id: plain._id.toString(),
    user_id: userIdStr,
    comment: plain.comment,
    created: plain.created,
  };

  if (uid && uid.first_name !== undefined) {
    out.user = {
      id: uid._id.toString(),
      first_name: uid.first_name,
      last_name: uid.last_name,
      email: uid.email,
    };
  }

  return out;
}

function invalidTaskId(res) {
  return res.status(400).json({ statusCode: 400, message: 'Invalid task id' });
}

const createComment = async (req, res) => {
  const taskIdStr = req.params.taskId;
  if (!mongoose.isValidObjectId(taskIdStr)) {
    return invalidTaskId(res);
  }
  const taskId = new mongoose.Types.ObjectId(taskIdStr);
  const callerId = parseUserId(req);

  try {
    const r = await taskCommentService.createTaskComment({
      taskId,
      callerId,
      rawComment: req.body && req.body.comment,
    });

    if (!r.ok) {
      return res.status(r.httpStatus).json({
        statusCode: r.httpStatus,
        message: r.message,
      });
    }

    const populated = await Comment.findById(r.comment._id).populate('user_id', 'first_name last_name email');

    res.status(201).json({
      statusCode: 201,
      message: 'Comment created',
      comment: serializeComment(populated),
    });
  } catch (err) {
    console.error('createComment error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not create comment' });
  }
};

const listComments = async (req, res) => {
  const taskIdStr = req.params.taskId;
  if (!mongoose.isValidObjectId(taskIdStr)) {
    return invalidTaskId(res);
  }
  const taskId = new mongoose.Types.ObjectId(taskIdStr);
  const callerId = parseUserId(req);

  try {
    const r = await taskCommentService.listTaskComments({ taskId, callerId });

    if (!r.ok) {
      return res.status(r.httpStatus).json({
        statusCode: r.httpStatus,
        message: r.message,
      });
    }

    res.json({
      statusCode: 200,
      comments: r.comments.map((c) => serializeComment(c)),
    });
  } catch (err) {
    console.error('listComments error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not load comments' });
  }
};

module.exports = { createComment, listComments };
