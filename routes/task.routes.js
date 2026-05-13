'use strict';

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const { requireAuth } = require('../middleware/requireAuth');

router.get('/ping', taskController.ping);
router.get('/browse', requireAuth, taskController.browse);
router.post('/:id/take', requireAuth, taskController.takeTask);
router.post('/:id/complete', requireAuth, taskController.completeTask);

module.exports = router;
