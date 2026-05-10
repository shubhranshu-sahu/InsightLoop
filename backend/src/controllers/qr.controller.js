const FormModel = require('../models/form.model');
const QRModel = require('../models/qr.model');

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';

/**
 * Generate a QR code record for a form (no image generation — frontend handles that).
 * Constructs the public_url pointing to the frontend feedback page and persists it.
 * If a QR record already exists for this form, returns the existing one.
 *
 * @param {string} formId — UUID of the form
 * @returns {Promise<{ qr_id, form_id, public_url, created_at }>}
 */
const generateQR = async (formId) => {
  // Check if QR already exists for this form
  const existing = await QRModel.findByFormId(formId);
  if (existing) {
    return existing;
  }

  // Construct URL pointing to the frontend feedback page
  const publicUrl = `${FRONTEND_BASE_URL}/feedback.html?form_id=${formId}`;

  // Persist to qr_codes table
  const qrRecord = await QRModel.create({
    form_id: formId,
    public_url: publicUrl,
  });

  return qrRecord;
};

/**
 * GET /api/qr/:form_id
 * Returns QR code info for the given form.
 * Requires JWT — only the business owner should access this.
 */
const getQRCode = async (req, res, next) => {
  try {
    const { form_id } = req.params;

    // Verify the form exists
    const form = await FormModel.findById(form_id);
    if (!form) {
      return res.status(404).json({ error: 'Form not found.' });
    }

    const qrData = await generateQR(form_id);

    res.json({
      qr_id: qrData.qr_id,
      form_id,
      form_title: form.title,
      public_url: qrData.public_url,
      created_at: qrData.created_at,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { generateQR, getQRCode };
