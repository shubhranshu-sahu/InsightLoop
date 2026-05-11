const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedback.controller');

// Public routes (no auth — used by customers)
// This endpoint returns the form schema so feedback.html can render the questions
router.get('/form/:form_id', feedbackController.getFormForCustomer);

// NOTE: POST /submit has been removed — submissions go through POST /api/responses/submit (MongoDB)
// NOTE: Protected response routes removed — responses are read via /api/responses/* routes (MongoDB)

module.exports = router;
