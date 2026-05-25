'use strict';

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const taskCommentController = require('../controllers/taskComment.controller');
const { requireAuth } = require('../middleware/requireAuth');

router.get('/ping', taskController.ping);
router.get('/create-meta', requireAuth, taskController.createMeta);
router.get('/browse', requireAuth, taskController.browse);
router.get('/', requireAuth, taskController.listTasks);
router.post('/', requireAuth, taskController.createTask);
router.get('/:id', requireAuth, taskController.getTaskById);
router.get('/:taskId/comments', requireAuth, taskCommentController.listComments);
router.post('/:taskId/comments', requireAuth, taskCommentController.createComment);
router.post('/:id/approve', requireAuth, taskController.approveTask);
router.post('/:id/take', requireAuth, taskController.takeTask);
router.post('/:id/complete', requireAuth, taskController.completeTask);

module.exports = router;
 