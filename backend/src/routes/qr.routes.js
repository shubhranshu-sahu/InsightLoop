const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const qrController = require('../controllers/qr.controller');

// GET /api/qr/:form_id — Returns QR code data URL (protected)
router.get('/:form_id', verifyToken, qrController.getQRCode);

module.exports = router;
