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
    /** When set to `Payout`, marks final owner→taker credit transfer for a completed task (see taskStatus.service). */
    purpose: { type: String, enum: ['Payout'] },
  },
  { timestamps: { createdAt: 'created', updatedAt: false } }
);

/** At most one Active payout ledger row per task (idempotent owner approve). */
transactionSchema.index(
  { task_id: 1 },
  { unique: true, partialFilterExpression: { purpose: 'Payout', status: 'Active' } }
);

module.exports = mongoose.model('Transaction', transactionSchema);
