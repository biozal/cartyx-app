'use strict';

const express = require('express');
const path = require('path');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const { dashboard } = require('../controllers/campaignController');

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

router.get('/dashboard', isAuthenticated, dashboard);

module.exports = router;
