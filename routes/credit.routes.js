'use strict';

const express = require('express');
const router = express.Router();
const creditController = require('../controllers/credit.controller');

router.get('/ping', creditController.ping);

module.exports = router;
