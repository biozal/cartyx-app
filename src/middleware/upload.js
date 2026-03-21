'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');

const campaignImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', '..', 'public', 'uploads', 'campaigns');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const uploadCampaignImage = multer({
  storage: campaignImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

module.exports = { uploadCampaignImage };
