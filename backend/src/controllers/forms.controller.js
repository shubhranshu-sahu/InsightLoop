const FormModel = require('../models/form.model');
const { generateQR } = require('./qr.controller');

/**
 * GET /api/forms
 * Get all forms for the logged-in business.
 */
const getAllForms = async (req, res, next) => {
  try {
    const forms = await FormModel.findAllByBusiness(req.business.business_id);
    res.json({ forms });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/forms
 * Create a new feedback form with questions.
 * business_id comes from the JWT (req.business.business_id).
 */
const createForm = async (req, res, next) => {
  try {
    const { title, description, questions } = req.body;

    if (!title || !questions || !questions.length) {
      return res.status(400).json({ error: 'Title and at least one question are required.' });
    }

    // 1. Create the form
    const form = await FormModel.create({
      business_id: req.business.business_id,
      title,
      description,
    });

    // 2. Insert questions
    const insertedQuestions = [];
    for (const q of questions) {
      const question = await FormModel.addQuestion({
        form_id: form.form_id,
        question_text: q.question_text,
        question_type: q.question_type,
        order_index: q.order_index,
        is_required: q.is_required !== undefined ? q.is_required : true,
      });
      insertedQuestions.push(question);
    }

    // 3. Generate QR code for this form (persists to qr_codes table + saves image file)
    const qrData = await generateQR(form.form_id);

    // 4. Build and return the response
    const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
    res.status(201).json({
      message: 'Form created successfully.',
      form: {
        form_id: form.form_id,
        business_id: form.business_id,
        title: form.title,
        description: form.description,
        is_active: form.is_active,
        created_at: form.created_at,
        questions: insertedQuestions,
      },
      qr_code: {
        qr_id: qrData.qr_id,
        public_url: qrData.public_url,
        qr_image_url: `${BASE_URL}${qrData.qr_image_path}`,
        qr_data_url: qrData.qr_data_url,
        created_at: qrData.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/forms/:form_id
 * Get a single form with its questions.
 */
const getFormById = async (req, res, next) => {
  try {
    const form = await FormModel.findById(req.params.form_id);
    if (!form) {
      return res.status(404).json({ error: 'Form not found.' });
    }

    res.json({ form });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/forms/:form_id
 * Update form title/description.
 */
const updateForm = async (req, res, next) => {
  try {
    const { title, description } = req.body;
    const updated = await FormModel.update(req.params.form_id, { title, description });

    res.json({ message: 'Form updated.', form: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/forms/:form_id
 * Delete a form and all associated data.
 */
const deleteForm = async (req, res, next) => {
  try {
    await FormModel.delete(req.params.form_id);
    res.json({ message: 'Form deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllForms,
  createForm,
  getFormById,
  updateForm,
  deleteForm,
};
