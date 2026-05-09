const jwt = require('jsonwebtoken');

/**
 * Verify JWT token for business owner routes.
 * Extracts business_id, email, name from token and attaches to req.business.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.business = decoded; // { business_id, email, name }
    next();
  });
};

module.exports = { verifyToken };
