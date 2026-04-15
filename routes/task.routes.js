'use strict';

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');

router.get('/ping', taskController.ping);

module.exports = router;
