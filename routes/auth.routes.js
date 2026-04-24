'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/requireAuth');

router.get('/ping', authController.ping);
router.post('/signup', authController.signup);
router.post('/signin', authController.signin);
router.get('/me', requireAuth, authController.me);
router.post('/signout', authController.signout);

module.exports = router;
