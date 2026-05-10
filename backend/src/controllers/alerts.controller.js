const { getPool } = require('../config/db');

/**
 * GET /api/alerts
 * Returns all unread alerts for this business.
 */
const getAlerts = async (req, res, next) => {
  try {
    const pool = getPool();
    const businessId = req.business.business_id;

    const [alerts] = await pool.query(
      `SELECT a.alert_id, a.form_id, f.title AS form_title,
              a.alert_type, a.message, a.is_read, a.created_at
       FROM alerts a
       LEFT JOIN feedback_forms f ON a.form_id = f.form_id
       WHERE a.business_id = ? AND a.is_read = 0
       ORDER BY a.created_at DESC`,
      [businessId]
    );

    res.json({
      alerts: alerts.map((a) => ({
        ...a,
        is_read: a.is_read === 1,
      })),
      unread_count: alerts.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/alerts/:alert_id/read
 * Mark one alert as read.
 */
const markAlertRead = async (req, res, next) => {
  try {
    const pool = getPool();
    const businessId = req.business.business_id;
    const { alert_id } = req.params;

    // Always check business_id matches — don't let a business mark another business's alerts
    const [result] = await pool.query(
      `UPDATE alerts SET is_read = 1 WHERE alert_id = ? AND business_id = ?`,
      [alert_id, businessId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Alert not found or already read.' });
    }

    res.json({ message: 'Alert marked as read.' });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/alerts/read-all
 * Mark all unread alerts as read for this business.
 */
const markAllAlertsRead = async (req, res, next) => {
  try {
    const pool = getPool();
    const businessId = req.business.business_id;

    const [result] = await pool.query(
      `UPDATE alerts SET is_read = 1 WHERE business_id = ? AND is_read = 0`,
      [businessId]
    );

    res.json({
      message: 'All alerts marked as read.',
      updated_count: result.affectedRows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAlerts,
  markAlertRead,
  markAllAlertsRead,
};
