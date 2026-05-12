const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { verifyToken } = require('../middleware/auth');

// All chat routes require JWT — business owner only
router.post('/thread',          verifyToken, chatController.getOrCreateThread);
router.post('/message',         verifyToken, chatController.chatMessage);
router.get('/threads',          verifyToken, chatController.listThreads);
router.get('/thread/:form_id',  verifyToken, chatController.getThread);

module.exports = router;
