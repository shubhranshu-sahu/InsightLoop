const express = require('express');
const router = express.Router();
const responsesController = require('../controllers/responses.controller');
const { verifyToken } = require('../middleware/auth');

// ── Public (no auth — called by the customer feedback form) ──
router.post('/submit', responsesController.submitResponse);

// ── Protected (JWT required — business owner dashboard) ──
router.get('/form/:form_id', verifyToken, responsesController.getResponsesByForm);
router.get('/business/:business_id', verifyToken, responsesController.getResponsesByBusiness);
router.get('/:response_id', verifyToken, responsesController.getResponseById);

module.exports = router;
