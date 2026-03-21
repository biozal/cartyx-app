'use strict';

const express = require('express');
const router = express.Router();
const c = require('../controllers/campaignController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/',            isAuthenticated, c.listCampaigns);
router.get('/new',         isAuthenticated, c.newCampaignForm);
router.get('/editor',      isAuthenticated, c.editorForm);
router.get('/summary/:id', isAuthenticated, c.summaryCampaign);

module.exports = router;
