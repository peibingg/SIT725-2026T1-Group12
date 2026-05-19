'use strict';

const mongoose = require('mongoose');

const taskStatus = ['Open', 'In Progress', 'Completed', 'Finalised'];

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 20000 },
    owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    taker_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    credit: { type: Number, required: true, min: 1 },
    status: { type: String, enum: taskStatus, default: 'Open' },
  },
  { timestamps: { createdAt: 'created', updatedAt: false } }
);

module.exports = mongoose.model('Task', taskSchema);
