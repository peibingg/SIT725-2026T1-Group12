'use strict';

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskMarketplaceDB';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(MONGODB_URI);
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected:', MONGODB_URI);
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

const authRouter = require('./routes/auth.routes');
const taskRouter = require('./routes/task.routes');
const creditRouter = require('./routes/credit.routes');

app.use('/api/auth', authRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/credits', creditRouter);

app.get('/api/health', (req, res) => {
  res.json({ statusCode: 200, message: 'Task Marketplace API', mongoose: mongoose.connection.readyState === 1 });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
