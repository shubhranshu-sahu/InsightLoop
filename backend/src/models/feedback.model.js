const { getPool } = require('../config/db');

/**
 * Feedback Model — MySQL query functions for feedback_responses, answers, and ai_analysis tables.
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
      `SELECT question_id, question_text, question_type, options, is_required, order_index
       FROM questions WHERE form_id = ? ORDER BY order_index`,
      [formId]
    );

    return { ...form, questions };
  },

  /**
   * Create a feedback response entry.
   */
  async createResponse({ form_id, ip_address, device_info }) {
    const pool = getPool();
    const responseId = require('crypto').randomUUID();

    await pool.query(
      `INSERT INTO feedback_responses (response_id, form_id, ip_address, device_info) VALUES (?, ?, ?, ?)`,
      [responseId, form_id, ip_address || null, device_info || null]
    );

    return { response_id: responseId, form_id };
  },

  /**
   * Create an individual answer.
   */
  async createAnswer({ response_id, question_id, answer_value }) {
    const pool = getPool();
    const answerId = require('crypto').randomUUID();

    await pool.query(
      `INSERT INTO answers (answer_id, response_id, question_id, answer_value) VALUES (?, ?, ?, ?)`,
      [answerId, response_id, question_id, answer_value]
    );

    return { answer_id: answerId };
  },

  /**
   * Save AI analysis results for a response.
   */
  async saveAnalysis({ response_id, sentiment, sentiment_score, topic, urgency, is_complaint, key_phrases, summary }) {
    const pool = getPool();
    const analysisId = require('crypto').randomUUID();

    await pool.query(
      `INSERT INTO ai_analysis (analysis_id, response_id, sentiment, sentiment_score, topic, urgency, is_complaint, key_phrases, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        analysisId,
        response_id,
        sentiment,
        sentiment_score || null,
        topic || null,
        urgency,
        is_complaint || false,
        key_phrases ? JSON.stringify(key_phrases) : null,
        summary || null,
      ]
    );

    return { analysis_id: analysisId };
  },

  /**
   * Get all responses for a form (with AI analysis).
   */
  async getResponsesByForm(formId) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT fr.*, aa.sentiment, aa.topic, aa.urgency, aa.is_complaint, aa.summary
       FROM feedback_responses fr
       LEFT JOIN ai_analysis aa ON fr.response_id = aa.response_id
       WHERE fr.form_id = ?
       ORDER BY fr.submitted_at DESC`,
      [formId]
    );
    return rows;
  },

  /**
   * Get one full response with all answers and AI analysis.
   */
  async getResponseById(responseId) {
    const pool = getPool();

    const [responseRows] = await pool.query(
      `SELECT fr.*, aa.sentiment, aa.sentiment_score, aa.topic, aa.urgency, 
              aa.is_complaint, aa.key_phrases, aa.summary as ai_summary
       FROM feedback_responses fr
       LEFT JOIN ai_analysis aa ON fr.response_id = aa.response_id
       WHERE fr.response_id = ?`,
      [responseId]
    );

    if (!responseRows.length) return null;

    const response = responseRows[0];

    const [answers] = await pool.query(
      `SELECT a.*, q.question_text, q.question_type
       FROM answers a
       JOIN questions q ON a.question_id = q.question_id
       WHERE a.response_id = ?
       ORDER BY q.order_index`,
      [responseId]
    );

    return { ...response, answers };
  },
};

module.exports = FeedbackModel;
