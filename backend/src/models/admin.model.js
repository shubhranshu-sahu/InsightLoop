const { getPool } = require('../config/db');

/**
 * Admin Model — MySQL query functions for the admins table.
 */

const AdminModel = {
  /**
   * Find an admin by email.
   */
  async findByEmail(email) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM admins WHERE email = ?`, [email]);
    return rows[0] || null;
  },

  /**
   * Find an admin by ID.
   */
  async findById(adminId) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM admins WHERE admin_id = ?`, [adminId]);
    return rows[0] || null;
  },

  /**
   * Create a new admin (used for seeding).
   */
  async create({ email, password_hash }) {
    const pool = getPool();
    const adminId = require('crypto').randomUUID();

    await pool.query(
      `INSERT INTO admins (admin_id, email, password_hash) VALUES (?, ?, ?)`,
      [adminId, email, password_hash]
    );

    return { admin_id: adminId, email };
  },
};

module.exports = AdminModel;
