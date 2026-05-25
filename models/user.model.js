'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password_hash: { type: String, required: true, select: false },
    credit_balance: { type: Number, default: 100, min: 0 },
    role: { type: String, enum: ['Admin', 'User'], default: 'User' },
  },
  { timestamps: { createdAt: 'created', updatedAt: false } }
);

module.exports = mongoose.model('User', userSchema);
