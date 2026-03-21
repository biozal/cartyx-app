'use strict';

const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/google', auth.googleAuth);
router.get('/google/callback', ...auth.googleCallback);

router.get('/github', auth.githubAuth);
router.get('/github/callback', ...auth.githubCallback);

router.get('/apple', auth.appleAuth);
router.post('/apple/callback', auth.appleCallbackPost);
router.get('/apple/callback', ...auth.appleCallbackGet);

router.get('/refresh', isAuthenticated, auth.tokenRefresh);
router.get('/logout', auth.logout);

module.exports = router;
