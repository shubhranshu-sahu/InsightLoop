const { getPool } = require('../config/db');

/**
 * GET /api/analytics/dashboard
 * Summary stats for the main dashboard (all forms for this business).
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const pool = getPool();
    const businessId = req.business.business_id;

    // Total responses
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) as total_responses 
       FROM feedback_responses fr
       JOIN feedback_forms ff ON fr.form_id = ff.form_id
       WHERE ff.business_id = ?`,
      [businessId]
    );

    // Sentiment breakdown
    const [sentimentRows] = await pool.query(
      `SELECT aa.sentiment, COUNT(*) as count
       FROM ai_analysis aa
       JOIN feedback_responses fr ON aa.response_id = fr.response_id
       JOIN feedback_forms ff ON fr.form_id = ff.form_id
       WHERE ff.business_id = ?
       GROUP BY aa.sentiment`,
      [businessId]
    );

    // Active forms count
    const [formsRows] = await pool.query(
      `SELECT COUNT(*) as active_forms FROM feedback_forms WHERE business_id = ? AND is_active = TRUE`,
      [businessId]
    );

    // Unread alerts
    const [alertRows] = await pool.query(
      `SELECT COUNT(*) as unread_alerts FROM alerts WHERE business_id = ? AND is_read = FALSE`,
      [businessId]
    );

    // Top topics
    const [topicRows] = await pool.query(
      `SELECT aa.topic, COUNT(*) as count
       FROM ai_analysis aa
       JOIN feedback_responses fr ON aa.response_id = fr.response_id
       JOIN feedback_forms ff ON fr.form_id = ff.form_id
       WHERE ff.business_id = ? AND aa.topic IS NOT NULL
       GROUP BY aa.topic
       ORDER BY count DESC
       LIMIT 5`,
      [businessId]
    );

    const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
    sentimentRows.forEach((row) => {
      sentimentBreakdown[row.sentiment] = row.count;
    });

    res.json({
      total_responses: totalRows[0].total_responses,
      sentiment_breakdown: sentimentBreakdown,
      active_forms: formsRows[0].active_forms,
      unread_alerts: alertRows[0].unread_alerts,
      top_topics: topicRows.map((r) => r.topic),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/form/:form_id
 * Deep analytics for one specific form.
 */
const getFormAnalytics = async (req, res, next) => {
  try {
    const pool = getPool();
    const formId = req.params.form_id;

    // Total responses for this form
    const [totalRows] = await pool.query(
      `SELECT COUNT(*) as total FROM feedback_responses WHERE form_id = ?`,
      [formId]
    );

    // Sentiment breakdown
    const [sentimentRows] = await pool.query(
      `SELECT aa.sentiment, COUNT(*) as count
       FROM ai_analysis aa
       JOIN feedback_responses fr ON aa.response_id = fr.response_id
       WHERE fr.form_id = ?
       GROUP BY aa.sentiment`,
      [formId]
    );

    // Urgency breakdown
    const [urgencyRows] = await pool.query(
      `SELECT aa.urgency, COUNT(*) as count
       FROM ai_analysis aa
       JOIN feedback_responses fr ON aa.response_id = fr.response_id
       WHERE fr.form_id = ?
       GROUP BY aa.urgency`,
      [formId]
    );

    // Complaint count
    const [complaintRows] = await pool.query(
      `SELECT COUNT(*) as complaints
       FROM ai_analysis aa
       JOIN feedback_responses fr ON aa.response_id = fr.response_id
       WHERE fr.form_id = ? AND aa.is_complaint = TRUE`,
      [formId]
    );

    res.json({
      form_id: formId,
      total_responses: totalRows[0].total,
      sentiment_breakdown: sentimentRows,
      urgency_breakdown: urgencyRows,
      complaint_count: complaintRows[0].complaints,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/sentiment-trend
 * Sentiment over time (query params: form_id, days).
 */
const getSentimentTrend = async (req, res, next) => {
  try {
    const pool = getPool();
    const businessId = req.business.business_id;
    const { form_id, days = 30 } = req.query;

    let query = `
      SELECT DATE(fr.submitted_at) as date, aa.sentiment, COUNT(*) as count
      FROM ai_analysis aa
      JOIN feedback_responses fr ON aa.response_id = fr.response_id
      JOIN feedback_forms ff ON fr.form_id = ff.form_id
      WHERE ff.business_id = ?
        AND fr.submitted_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    const params = [businessId, parseInt(days)];

    if (form_id) {
      query += ` AND fr.form_id = ?`;
      params.push(form_id);
    }

    query += ` GROUP BY DATE(fr.submitted_at), aa.sentiment ORDER BY date`;

    const [rows] = await pool.query(query, params);
    res.json({ trend: rows });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/topics
 * Topic breakdown (query params: form_id).
 */
const getTopicBreakdown = async (req, res, next) => {
  try {
    const pool = getPool();
    const businessId = req.business.business_id;
    const { form_id } = req.query;

    let query = `
      SELECT aa.topic, COUNT(*) as count
      FROM ai_analysis aa
      JOIN feedback_responses fr ON aa.response_id = fr.response_id
      JOIN feedback_forms ff ON fr.form_id = ff.form_id
      WHERE ff.business_id = ? AND aa.topic IS NOT NULL
    `;
    const params = [businessId];

    if (form_id) {
      query += ` AND fr.form_id = ?`;
      params.push(form_id);
    }

    query += ` GROUP BY aa.topic ORDER BY count DESC`;

    const [rows] = await pool.query(query, params);
    res.json({ topics: rows });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getFormAnalytics,
  getSentimentTrend,
  getTopicBreakdown,
};
