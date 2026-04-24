'use strict';

const mongoose = require('mongoose');

const taskStatus = ['Open', 'In Progress', 'Completed', 'Finalised'];

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    taker_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    credit: { type: Number, required: true, min: 1 },
    status: { type: String, enum: taskStatus, default: 'Open' },
  },
  { timestamps: { createdAt: 'created', updatedAt: false } }
);

module.exports = mongoose.model('Task', taskSchema);
