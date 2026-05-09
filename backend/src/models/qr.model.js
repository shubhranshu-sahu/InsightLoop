const { getPool } = require('../config/db');

/**
 * QR Code Model — MySQL query functions for qr_codes table.
 */

const QRModel = {
  /**
   * Find a QR code record by form_id.
   */
  async findByFormId(formId) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM qr_codes WHERE form_id = ?`,
      [formId]
    );
    return rows.length ? rows[0] : null;
  },

  /**
   * Find a QR code record by qr_id.
   */
  async findById(qrId) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM qr_codes WHERE qr_id = ?`,
      [qrId]
    );
    return rows.length ? rows[0] : null;
  },

  /**
   * Create a new QR code record.
   * MySQL generates the UUID via DEFAULT (UUID()).
   */
  async create({ form_id, public_url, qr_image_path }) {
    const pool = getPool();

    await pool.query(
      `INSERT INTO qr_codes (form_id, public_url, qr_image_path) VALUES (?, ?, ?)`,
      [form_id, public_url, qr_image_path || null]
    );

    // Retrieve the row we just inserted
    const [rows] = await pool.query(
      `SELECT * FROM qr_codes WHERE form_id = ?`,
      [form_id]
    );

    return rows[0];
  },

  /**
   * Update QR image path for an existing record.
   */
  async updateImagePath(formId, qrImagePath) {
    const pool = getPool();
    await pool.query(
      `UPDATE qr_codes SET qr_image_path = ? WHERE form_id = ?`,
      [qrImagePath, formId]
    );
    return this.findByFormId(formId);
  },

  /**
   * Delete QR code record by form_id.
   */
  async deleteByFormId(formId) {
    const pool = getPool();
    await pool.query(`DELETE FROM qr_codes WHERE form_id = ?`, [formId]);
  },
};

module.exports = QRModel;
