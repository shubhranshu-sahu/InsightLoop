const FeedbackModel = require('../models/feedback.model');
const axios = require('axios');

/**
 * GET /api/feedback/form/:form_id  (PUBLIC — no auth)
 * Get the form schema so customers can fill it out.
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

/**
 * POST /api/feedback/submit  (PUBLIC — no auth)
 * Submit a feedback response from a customer.
 */
const submitFeedback = async (req, res, next) => {
  try {
    const { form_id, answers } = req.body;

    if (!form_id || !answers || !answers.length) {
      return res.status(400).json({ error: 'form_id and answers are required.' });
    }

    // 1. Insert into feedback_responses
    const response = await FeedbackModel.createResponse({
      form_id,
      ip_address: req.ip,
      device_info: req.headers['user-agent'],
    });

    // 2. Insert all answers
    for (const answer of answers) {
      await FeedbackModel.createAnswer({
        response_id: response.response_id,
        question_id: answer.question_id,
        answer_value: answer.answer_value,
      });
    }

    // 3. Call FastAPI AI service asynchronously (fire-and-forget)
    try {
      const textAnswers = answers
        .filter((a) => typeof a.answer_value === 'string' && a.answer_value.length > 5)
        .map((a) => a.answer_value);

      const ratingAnswer = answers.find(
        (a) => !isNaN(a.answer_value) && Number(a.answer_value) >= 1 && Number(a.answer_value) <= 5
      );

      if (textAnswers.length > 0) {
        axios
          .post(`${process.env.AI_SERVICE_URL}/analyze`, {
            response_id: response.response_id,
            business_id: response.business_id || null,
            form_id,
            text_answers: textAnswers,
            rating: ratingAnswer ? Number(ratingAnswer.answer_value) : null,
          })
          .catch((err) => {
            console.error('AI analysis failed (non-blocking):', err.message);
          });
      }
    } catch (aiError) {
      console.error('AI service call setup failed:', aiError.message);
    }

    // 4. Return success immediately (don't wait for AI)
    res.status(201).json({
      message: 'Thank you for your feedback!',
      response_id: response.response_id,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/feedback/responses/:form_id  (JWT required)
 * Get all responses for a form.
 */
const getResponsesByForm = async (req, res, next) => {
  try {
    const responses = await FeedbackModel.getResponsesByForm(req.params.form_id);
    res.json({ responses });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/feedback/response/:response_id  (JWT required)
 * Get one full response with answers and AI analysis.
 */
const getResponseById = async (req, res, next) => {
  try {
    const response = await FeedbackModel.getResponseById(req.params.response_id);
    if (!response) {
      return res.status(404).json({ error: 'Response not found.' });
    }

    res.json({ response });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFormForCustomer,
  submitFeedback,
  getResponsesByForm,
  getResponseById,
};
