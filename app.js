'use strict';

const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-SESSION_SECRET-in-production';
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: 'tm.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

require('./models/user.model');
require('./models/task.model');
require('./models/transaction.model');
require('./models/comment.model');

const authRouter = require('./routes/auth.routes');
const taskRouter = require('./routes/task.routes');
const creditRouter = require('./routes/credit.routes');

app.use('/api/auth', authRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/credits', creditRouter);

app.get('/api/health', (req, res) => {
  res.json({ statusCode: 200, message: 'Task Marketplace API', mongoose: mongoose.connection.readyState === 1 });
});

module.exports = app;
