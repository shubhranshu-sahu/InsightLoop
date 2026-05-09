const { getPool } = require('../config/db');

/**
 * Business Model — MySQL query functions for the businesses table.
 */

const BusinessModel = {
  /**
   * Find a business by email.
   */

  async findByEmail(email) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM businesses WHERE email = ?`, [email]);
    console.log(rows, "rows");
    return rows[0] || null;
  },

  /**
   * Find a business by ID.
   */
  async findById(businessId) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM businesses WHERE business_id = ?`, [businessId]);
    return rows[0] || null;
  },

  /**
   * Create a new business.
   */
  async create({ name, email, password_hash, industry, phone }) {
    const pool = getPool();
    const businessId = require('crypto').randomUUID();

    await pool.query(
      `INSERT INTO businesses (business_id, name, email, password_hash, industry, phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [businessId, name, email, password_hash, industry || null, phone || null]
    );

    return { business_id: businessId, name, email };
  },

  /**
   * Update business profile.
   */
  async update(businessId, { name, industry, phone, logo_url }) {
    const pool = getPool();
    await pool.query(
      `UPDATE businesses SET name = COALESCE(?, name), industry = COALESCE(?, industry), 
       phone = COALESCE(?, phone), logo_url = COALESCE(?, logo_url)
       WHERE business_id = ?`,
      [name, industry, phone, logo_url, businessId]
    );

    return this.findById(businessId);
  },

  /**
   * Update password.
   */
  async updatePassword(businessId, passwordHash) {
    const pool = getPool();
    await pool.query(`UPDATE businesses SET password_hash = ? WHERE business_id = ?`, [
      passwordHash,
      businessId,
    ]);
  },

  /**
   * Get all businesses (admin use).
   */
  async findAll() {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT business_id, name, email, industry, phone, is_active, created_at FROM businesses ORDER BY created_at DESC`
    );
    return rows;
  },
};

module.exports = BusinessModel;
