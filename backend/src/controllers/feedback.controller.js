const FeedbackModel = require('../models/feedback.model');

/**
 * GET /api/feedback/form/:form_id  (PUBLIC — no auth)
 * Get the form schema so customers can fill it out.
 * Reads from MySQL feedback_forms + questions — this is correct.
 */
const getFormForCustomer = async (req, res, next) => {
  try {
    const form = await FeedbackModel.getPublicForm(req.params.form_id);
    if (!form) {
      return res.status(404).json({ error: 'Form not found or inactive.' });
    }

    res.json({ form });
  } catch (error) {
    next(error);
  }
};

// NOTE: submitFeedback, getResponsesByForm, getResponseById have been removed.
// Submissions now go through responses.controller.js → MongoDB.
// Response viewing is handled via /api/responses/* routes.

module.exports = {
  getFormForCustomer,
};

