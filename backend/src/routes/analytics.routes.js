const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { verifyToken } = require('../middleware/auth');

// All analytics routes require JWT authentication
router.get('/dashboard', verifyToken, analyticsController.getDashboardStats);
router.get('/sentiment-trend', verifyToken, analyticsController.getSentimentTrend);
router.get('/forms-performance', verifyToken, analyticsController.getFormsPerformance);
router.get('/recent-responses', verifyToken, analyticsController.getRecentResponses);
router.get('/form/:form_id', verifyToken, analyticsController.getFormAnalytics);

module.exports = router;
