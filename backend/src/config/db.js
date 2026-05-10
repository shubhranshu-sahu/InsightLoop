const mysql = require('mysql2/promise');

let pool;

const connectMySQL = async () => {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    // Test the connection
    const connection = await pool.getConnection();
    console.log('✅ MySQL connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    throw error;
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('MySQL pool not initialized. Call connectMySQL() first.');
  }
  return pool;
};

module.exports = { connectMySQL, getPool };
