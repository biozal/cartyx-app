'use strict';

const express = require('express');
const router = express.Router();
const c = require('../controllers/campaignController');
const { isAuthenticated } = require('../middleware/auth');
const { uploadCampaignImage } = require('../middleware/upload');

router.get('/me', isAuthenticated, c.apiMe);
router.post('/campaigns', isAuthenticated, uploadCampaignImage.single('bannerImage'), c.createCampaign);
router.put('/campaigns/:id', isAuthenticated, uploadCampaignImage.single('bannerImage'), c.updateCampaign);

module.exports = router;
