const jwt = require('jsonwebtoken');

/**
 * Verify JWT token for admin routes.
 * Extracts admin_id, email from token and attaches to req.admin.
 */
const verifyAdminToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No admin token provided.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired admin token.' });
    }

    // Ensure this is an admin token
    if (!decoded.admin_id) {
      return res.status(403).json({ error: 'Not authorized as admin.' });
    }

    req.admin = decoded; // { admin_id, email }
    next();
  });
};

module.exports = { verifyAdminToken };
