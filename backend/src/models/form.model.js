const { getPool } = require('../config/db');

/**
 * Form Model — MySQL query functions for feedback_forms and questions tables.
 */

const FormModel = {
  /**
   * Get all forms for a business.
   */
  async findAllByBusiness(businessId) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM feedback_forms WHERE business_id = ? ORDER BY created_at DESC`,
      [businessId]
    );
    return rows;
  },

  /**
   * Get a single form with its questions.
   */
  async findById(formId) {
    const pool = getPool();
    const [formRows] = await pool.query(
      `SELECT * FROM feedback_forms WHERE form_id = ?`,
      [formId]
    );
    if (!formRows.length) return null;

    const form = formRows[0];

    // Get questions for this form
    const [questions] = await pool.query(
      `SELECT * FROM questions WHERE form_id = ? ORDER BY order_index`,
      [formId]
    );

    return { ...form, questions };
  },

  /**
   * Create a new form. Returns the auto-generated UUID form_id.
   */
  async create({ business_id, title, description }) {
    const pool = getPool();

    // Insert — MySQL generates the UUID via DEFAULT (UUID())
    await pool.query(
      `INSERT INTO feedback_forms (business_id, title, description) VALUES (?, ?, ?)`,
      [business_id, title, description || null]
    );

    // Retrieve the row we just inserted (last insert by this connection)
    const [rows] = await pool.query(
      `SELECT * FROM feedback_forms WHERE business_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1`,
      [business_id, title]
    );

    return rows[0];
  },

  /**
   * Add a question to a form.
   */
  async addQuestion({ form_id, question_text, question_type, order_index, is_required }) {
    const pool = getPool();

    await pool.query(
      `INSERT INTO questions (form_id, question_text, question_type, order_index, is_required) VALUES (?, ?, ?, ?, ?)`,
      [form_id, question_text, question_type, order_index, is_required]
    );

    // Retrieve the inserted question
    const [rows] = await pool.query(
      `SELECT * FROM questions WHERE form_id = ? AND order_index = ?`,
      [form_id, order_index]
    );

    return rows[0];
  },

  /**
   * Update form title/description.
   */
  async update(formId, { title, description }) {
    const pool = getPool();
    await pool.query(
      `UPDATE feedback_forms SET title = COALESCE(?, title), description = COALESCE(?, description) WHERE form_id = ?`,
      [title, description, formId]
    );

    return this.findById(formId);
  },

  /**
   * Delete a form (cascades to questions via FK).
   */
  async delete(formId) {
    const pool = getPool();
    await pool.query(`DELETE FROM feedback_forms WHERE form_id = ?`, [formId]);
  },
};

module.exports = FormModel;
