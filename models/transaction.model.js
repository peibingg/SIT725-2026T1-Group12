'use strict';

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
