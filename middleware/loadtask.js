const Task = require('../models/Task');
const mongoose = require('mongoose');

module.exports = async function loadTask(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid task id' });
    }

    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    req.task = task;
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};