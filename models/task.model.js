'use strict';

const mongoose = require('mongoose');

const taskStatus = ['Open', 'InProgress', 'Completed'];

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    creditValue: { type: Number, required: true, min: 1 },
    status: { type: String, enum: taskStatus, default: 'Open' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    takerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);
