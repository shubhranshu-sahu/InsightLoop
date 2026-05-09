const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const BusinessModel = require('../models/business.model');

/**
 * POST /api/auth/register
 * Register a new business owner account.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, industry, phone } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    // Check if email already exists
    const existingBusiness = await BusinessModel.findByEmail(email);
    if (existingBusiness) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create business
    const business = await BusinessModel.create({
      name,
      email,
      password_hash,
      industry,
      phone,
    });

    res.status(201).json({
      message: 'Registration successful.',
      business: {
        business_id: business.business_id,
        name: business.name,
        email: business.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 * Login and return JWT token.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log(req.body, "body");


    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find business by email
    const business = await BusinessModel.findByEmail(email);
    if (!business) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, business.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        business_id: business.business_id,
        email: business.email,
        name: business.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      business: {
        business_id: business.business_id,
        name: business.name,
        email: business.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/logout
 * Logout (client-side token removal; optional server-side invalidation).
 */
const logout = async (req, res, next) => {
  try {
    // JWT is stateless — client should remove the token
    // Optionally implement a token blacklist here
    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Get current authenticated business profile.
 */
const getProfile = async (req, res, next) => {
  try {
    const business = await BusinessModel.findById(req.business.business_id);
    if (!business) {
      return res.status(404).json({ error: 'Business not found.' });
    }

    // Remove password_hash from response
    const { password_hash, ...profile } = business;
    res.json({ business: profile });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/profile
 * Update business profile info.
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, industry, phone, logo_url } = req.body;

    const updated = await BusinessModel.update(req.business.business_id, {
      name,
      industry,
      phone,
      logo_url,
    });

    res.json({ message: 'Profile updated.', business: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/change-password
 * Change password (requires current password).
 */
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new passwords are required.' });
    }

    const business = await BusinessModel.findById(req.business.business_id);
    if (!business) {
      return res.status(404).json({ error: 'Business not found.' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(current_password, business.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);

    await BusinessModel.updatePassword(req.business.business_id, password_hash);

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
};
