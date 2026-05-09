const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const { verifyToken } = require('../middleware/auth');

// All report routes require JWT authentication
router.post('/generate', verifyToken, reportsController.generateReport);
router.get('/', verifyToken, reportsController.getAllReports);
router.get('/:report_id/download', verifyToken, reportsController.downloadReport);

module.exports = router;
