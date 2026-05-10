const { getPool } = require('../config/db');

/**
 * QR Code Model — MySQL query functions for qr_codes table.
 *
 * Table schema (simplified — no image storage):
 *   qr_id       VARCHAR(36)  PRIMARY KEY DEFAULT (UUID())
 *   form_id     VARCHAR(36)  NOT NULL UNIQUE
 *   public_url  VARCHAR(500) NOT NULL
 *   created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
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
  async create({ form_id, public_url }) {
    const pool = getPool();

    await pool.query(
      `INSERT INTO qr_codes (form_id, public_url) VALUES (?, ?)`,
      [form_id, public_url]
    );

    // Retrieve the row we just inserted
    const [rows] = await pool.query(
      `SELECT * FROM qr_codes WHERE form_id = ?`,
      [form_id]
    );

    return rows[0];
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
