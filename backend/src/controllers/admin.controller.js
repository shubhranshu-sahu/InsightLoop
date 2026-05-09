const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../config/db');

/**
 * POST /api/admin/login
 * Admin login — separate from business owner login.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const pool = getPool();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const [rows] = await pool.query(`SELECT * FROM admins WHERE email = ? AND password_hash = ?`, [email, password]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const admin = rows[0];

    const token = jwt.sign(
      { admin_id: admin.admin_id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, admin: { admin_id: admin.admin_id, email: admin.email } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/businesses
 * Get all registered businesses on the platform.
 */
const getAllBusinesses = async (req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT b.business_id, b.name, b.email, b.industry, b.is_active, b.created_at,
              (SELECT COUNT(*) FROM feedback_forms WHERE business_id = b.business_id) as forms_count,
              (SELECT COUNT(*) FROM feedback_responses fr 
               JOIN feedback_forms ff ON fr.form_id = ff.form_id 
               WHERE ff.business_id = b.business_id) as responses_count
       FROM businesses b
       ORDER BY b.created_at DESC`
    );

    res.json({ businesses: rows });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/stats
 * Platform-wide statistics.
 */
const getPlatformStats = async (req, res, next) => {
  try {
    const pool = getPool();

    const [businessCount] = await pool.query(`SELECT COUNT(*) as count FROM businesses`);
    const [formCount] = await pool.query(`SELECT COUNT(*) as count FROM feedback_forms`);
    const [responseCount] = await pool.query(`SELECT COUNT(*) as count FROM feedback_responses`);

    res.json({
      total_businesses: businessCount[0].count,
      total_forms: formCount[0].count,
      total_responses: responseCount[0].count,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/businesses/:id/suspend
 * Suspend a business account.
 */
const suspendBusiness = async (req, res, next) => {
  try {
    const pool = getPool();
    await pool.query(`UPDATE businesses SET is_active = FALSE WHERE business_id = ?`, [req.params.id]);

    res.json({ message: 'Business suspended.' });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/businesses/:id
 * Delete a business account and all associated data.
 */
const deleteBusiness = async (req, res, next) => {
  try {
    const pool = getPool();
    await pool.query(`DELETE FROM businesses WHERE business_id = ?`, [req.params.id]);

    res.json({ message: 'Business deleted.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getAllBusinesses,
  getPlatformStats,
  suspendBusiness,
  deleteBusiness,
};
