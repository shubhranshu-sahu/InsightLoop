const express = require('express');
const router = express.Router();
const alertsController = require('../controllers/alerts.controller');
const { verifyToken } = require('../middleware/auth');

// All alerts routes require JWT authentication
router.get('/', verifyToken, alertsController.getAlerts);
router.patch('/read-all', verifyToken, alertsController.markAllAlertsRead);
router.patch('/:alert_id/read', verifyToken, alertsController.markAlertRead);

module.exports = router;
