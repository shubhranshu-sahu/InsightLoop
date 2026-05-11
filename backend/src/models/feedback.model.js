const { getPool } = require('../config/db');

/**
 * Feedback Model — MySQL query functions for public form access.
 * 
 * NOTE: Response storage (createResponse, createAnswer, saveAnalysis) has been removed.
 * All response data is now stored in MongoDB via response.model.js.
 * This model only handles reading form configuration from MySQL.
 */

const FeedbackModel = {
  /**
   * Get public form schema (for customer feedback page).
   * Returns form info + questions, only if form is active.
   */
  async getPublicForm(formId) {
    const pool = getPool();
    const [formRows] = await pool.query(
      `SELECT ff.form_id, ff.title, ff.description, b.name as business_name, b.logo_url
       FROM feedback_forms ff
       JOIN businesses b ON ff.business_id = b.business_id
       WHERE ff.form_id = ? AND ff.is_active = TRUE`,
      [formId]
    );

    if (!formRows.length) return null;

    const form = formRows[0];
    const [questions] = await pool.query(
      `SELECT question_id, question_text, question_type, is_required, order_index
       FROM questions WHERE form_id = ? ORDER BY order_index`,
      [formId]
    );

    return { ...form, questions };
  },
};

module.exports = FeedbackModel;

