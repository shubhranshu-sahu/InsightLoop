const crypto = require('crypto');
const Response = require('../models/response.model');
const FormModel = require('../models/form.model');

/**
 * POST /api/responses/submit
 * PUBLIC — no auth required.
 * Accepts a form submission and saves it to MongoDB Atlas.
 *
 * Request body:
 * {
 *   "form_id": "uuid-of-the-form",
 *   "answers": {
 *     "uuid-question-id-1": { "value": 4 },
 *     "uuid-question-id-2": { "value": "The biryani arrived cold." },
 *     "uuid-question-id-3": { "value": false }
 *   }
 * }
 */
const submitResponse = async (req, res, next) => {
  try {
    const { form_id, answers } = req.body;

    // ── Validation ──────────────────────────────────────
    if (!form_id) {
      return res.status(400).json({ error: 'form_id is required.' });
    }

    if (!answers || typeof answers !== 'object' || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: 'answers object is required and must not be empty.' });
    }

    // ── Lookup the form in MySQL to get business_id & questions ──
    const form = await FormModel.findById(form_id);

    if (!form) {
      return res.status(404).json({ error: 'Form not found.' });
    }

    if (form.is_active === 0) {
      return res.status(410).json({ error: 'This form is no longer accepting responses.' });
    }

    // ── Build the answers object with label & type from MySQL questions ──
    const enrichedAnswers = {};

    for (const question of form.questions) {
      const qId = question.question_id;
      const submitted = answers[qId];

      if (submitted !== undefined) {
        // Normalise — accept either { value: ... } or a raw value
        const rawValue = typeof submitted === 'object' && submitted !== null && 'value' in submitted
          ? submitted.value
          : submitted;

        enrichedAnswers[qId] = {
          label: question.question_text,
          type: question.question_type,
          value: rawValue,
        };
      } else if (question.is_required) {
        return res.status(400).json({
          error: `Answer for required question "${question.question_text}" is missing.`,
          question_id: qId,
        });
      }
    }

    // ── Create the MongoDB document ─────────────────────
    const responseDoc = new Response({
      response_id: crypto.randomUUID(),
      form_id: form_id,
      business_id: form.business_id,
      submitted_at: new Date(),
      answers: enrichedAnswers,
      ai_analysis: {
        status: 'pending',
        processed_at: null,
        retry_count: 0,
      },
    });

    await responseDoc.save();

    // ── Return success ──────────────────────────────────
    res.status(201).json({
      message: 'Thank you for your feedback!',
      response_id: responseDoc.response_id,
      submitted_at: responseDoc.submitted_at,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/responses/form/:form_id
 * JWT required — business owner views all responses for a form.
 */
const getResponsesByForm = async (req, res, next) => {
  try {
    const { form_id } = req.params;

    const responses = await Response.find({ form_id })
      .sort({ submitted_at: -1 })
      .lean();

    res.json({
      count: responses.length,
      responses,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/responses/:response_id
 * JWT required — get a single response document.
 */
const getResponseById = async (req, res, next) => {
  try {
    const { response_id } = req.params;

    const response = await Response.findOne({ response_id }).lean();

    if (!response) {
      return res.status(404).json({ error: 'Response not found.' });
    }

    res.json({ response });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/responses/business/:business_id
 * JWT required — get all responses for a business across all forms.
 */
const getResponsesByBusiness = async (req, res, next) => {
  try {
    const { business_id } = req.params;

    const responses = await Response.find({ business_id })
      .sort({ submitted_at: -1 })
      .lean();

    res.json({
      count: responses.length,
      responses,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitResponse,
  getResponsesByForm,
  getResponseById,
  getResponsesByBusiness,
};
