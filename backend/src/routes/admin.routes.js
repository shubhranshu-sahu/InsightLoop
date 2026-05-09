const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyAdminToken } = require('../middleware/adminAuth');

// Public admin route
router.post('/login', adminController.login);

// Protected admin routes
router.get('/businesses', verifyAdminToken, adminController.getAllBusinesses);
router.get('/stats', verifyAdminToken, adminController.getPlatformStats);
router.patch('/businesses/:id/suspend', verifyAdminToken, adminController.suspendBusiness);
router.delete('/businesses/:id', verifyAdminToken, adminController.deleteBusiness);

module.exports = router;
