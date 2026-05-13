'use strict';

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    comment: { type: String, required: true, trim: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: 'created', updatedAt: false } }
);

commentSchema.index({ task_id: 1, created: 1 });

module.exports = mongoose.model('Comment', commentSchema);
