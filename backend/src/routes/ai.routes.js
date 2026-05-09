const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const { verifyToken } = require('../middleware/auth');

// All AI routes require JWT — these proxy to the FastAPI AI microservice
router.post('/query', verifyToken, aiController.queryAI);
router.get('/sessions', verifyToken, aiController.getChatSessions);
router.get('/session/:session_id', verifyToken, aiController.getChatSession);
router.delete('/session/:session_id', verifyToken, aiController.deleteChatSession);

module.exports = router;
