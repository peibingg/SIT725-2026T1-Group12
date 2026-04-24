'use strict';

const bcrypt = require('bcryptjs');
const User = require('../models/user.model');

const SALT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ping = (req, res) => {
  res.json({ statusCode: 200, message: 'auth controller skeleton' });
};

const signup = async (req, res) => {
  try {
    const first_name = (req.body.first_name || '').trim();
    const last_name = (req.body.last_name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!first_name || !last_name) {
      return res.status(400).json({ statusCode: 400, message: 'First name and last name are required' });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ statusCode: 400, message: 'Valid email is required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ statusCode: 400, message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ statusCode: 409, message: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      first_name,
      last_name,
      email,
      password_hash,
      role: 'User',
    });

    res.status(201).json({
      statusCode: 201,
      message: 'Account created',
      user: {
        id: user._id.toString(),
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        credit_balance: user.credit_balance,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('signup error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not create account' });
  }
};

const signin = async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!email || !password) {
      return res.status(400).json({ statusCode: 400, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password_hash');
    if (!user) {
      return res.status(401).json({ statusCode: 401, message: 'Invalid email or password' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ statusCode: 401, message: 'Invalid email or password' });
    }

    res.json({
      statusCode: 200,
      message: 'Signed in',
      user: {
        id: user._id.toString(),
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        credit_balance: user.credit_balance,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('signin error:', err.message);
    res.status(500).json({ statusCode: 500, message: 'Could not sign in' });
  }
};

module.exports = { ping, signup, signin };
