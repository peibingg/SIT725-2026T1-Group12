'use strict';

const mongoose = require('mongoose');

const transactionStatus = ['Active', 'Deleted'];

const transactionSchema = new mongoose.Schema(
  {
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    credit: { type: Number, required: true, min: 0 },
    owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    taker_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: transactionStatus, default: 'Active' },
  },
  { timestamps: { createdAt: 'created', updatedAt: false } }
);

module.exports = mongoose.model('Transaction', transactionSchema);
