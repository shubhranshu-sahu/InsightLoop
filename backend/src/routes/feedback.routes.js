const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');
const { verifyToken } = require('../middleware/auth');

// Public routes (no auth — used by customers)
router.get('/form/:form_id', feedbackController.getFormForCustomer);
router.post('/submit', feedbackController.submitFeedback);

// Protected routes (business owner)
router.get('/responses/:form_id', verifyToken, feedbackController.getResponsesByForm);
router.get('/response/:response_id', verifyToken, feedbackController.getResponseById);

module.exports = router;
