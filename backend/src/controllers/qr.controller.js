const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const FormModel = require('../models/form.model');
const QRModel = require('../models/qr.model');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const QR_DIR = path.join(__dirname, '..', '..', 'uploads', 'qrcodes');

// Ensure the QR directory exists
if (!fs.existsSync(QR_DIR)) {
  fs.mkdirSync(QR_DIR, { recursive: true });
}

/**
 * Generate a QR code for a form, save the image file, and persist to the qr_codes table.
 * If a QR record already exists for this form, returns the existing one.
 *
 * @param {string} formId — UUID of the form
 * @returns {Promise<{ qr_id, form_id, public_url, qr_image_path, qr_data_url, created_at }>}
 */
const generateQR = async (formId) => {
  // Check if QR already exists for this form
  const existing = await QRModel.findByFormId(formId);
  if (existing) {
    // Generate data URL on-the-fly for the response (not stored in DB, it's large)
    const qrDataUrl = await QRCode.toDataURL(existing.public_url, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
    return { ...existing, qr_data_url: qrDataUrl };
  }

  const publicUrl = `${BASE_URL}/form/${formId}`;
  const fileName = `qr_${formId}.png`;
  const filePath = path.join(QR_DIR, fileName);

  // Generate and save QR image as PNG file
  await QRCode.toFile(filePath, publicUrl, {
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  // Generate data URL for immediate API response
  const qrDataUrl = await QRCode.toDataURL(publicUrl, {
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  // Relative path stored in DB (served via /uploads/qrcodes/...)
  const qrImagePath = `/uploads/qrcodes/${fileName}`;

  // Persist to qr_codes table
  const qrRecord = await QRModel.create({
    form_id: formId,
    public_url: publicUrl,
    qr_image_path: qrImagePath,
  });

  return { ...qrRecord, qr_data_url: qrDataUrl };
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
      qr_image_url: `${BASE_URL}${qrData.qr_image_path}`,
      qr_data_url: qrData.qr_data_url,
      created_at: qrData.created_at,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { generateQR, getQRCode };
