const axios = require('axios');
const mongoose = require('mongoose');

// MongoDB schemas for AI queries and chat sessions
const aiQuerySchema = new mongoose.Schema({
  business_id: String,
  form_id: String,
  query_text: String,
  retrieved_chunks: [String],
  response_text: String,
  model_used: String,
  token_count: Number,
  created_at: { type: Date, default: Date.now },
});

const chatSessionSchema = new mongoose.Schema({
  business_id: String,
  session_id: String,
  form_id: String,
  messages: [
    {
      role: { type: String, enum: ['user', 'assistant'] },
      content: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

const AIQuery = mongoose.model('AIQuery', aiQuerySchema, 'ai_queries');
const ChatSession = mongoose.model('ChatSession', chatSessionSchema, 'chat_sessions');

/**
 * POST /api/ai/query
 * Send a chat query to the RAG system (proxied to FastAPI).
 */
const queryAI = async (req, res, next) => {
  try {
    const { query, form_id, session_id } = req.body;
    const businessId = req.business.business_id;

    if (!query) {
      return res.status(400).json({ error: 'Query text is required.' });
    }

    // Get or create chat session
    let session;
    if (session_id) {
      session = await ChatSession.findOne({ session_id, business_id: businessId });
    }

    // Build chat history from session
    const chatHistory = session ? session.messages.map((m) => ({ role: m.role, content: m.content })) : [];

    // Call FastAPI AI service
    const aiResponse = await axios.post(`${process.env.AI_SERVICE_URL}/query`, {
      query,
      business_id: businessId,
      form_id: form_id || null,
      chat_history: chatHistory,
    });

    const { answer, sources, token_usage } = aiResponse.data;

    // Save to MongoDB — ai_queries
    await AIQuery.create({
      business_id: businessId,
      form_id: form_id || null,
      query_text: query,
      retrieved_chunks: sources ? sources.map((s) => s.snippet) : [],
      response_text: answer,
      model_used: aiResponse.data.model_used || 'unknown',
      token_count: token_usage || 0,
    });

    // Update or create chat session
    const newSessionId = session_id || new mongoose.Types.ObjectId().toString();
    if (session) {
      session.messages.push(
        { role: 'user', content: query, timestamp: new Date() },
        { role: 'assistant', content: answer, timestamp: new Date() }
      );
      session.updated_at = new Date();
      await session.save();
    } else {
      await ChatSession.create({
        business_id: businessId,
        session_id: newSessionId,
        form_id: form_id || null,
        messages: [
          { role: 'user', content: query, timestamp: new Date() },
          { role: 'assistant', content: answer, timestamp: new Date() },
        ],
      });
    }

    res.json({
      answer,
      sources: sources || [],
      session_id: session ? session.session_id : newSessionId,
      token_usage: token_usage || 0,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/ai/sessions
 * Get all chat sessions for this business.
 */
const getChatSessions = async (req, res, next) => {
  try {
    const sessions = await ChatSession.find({ business_id: req.business.business_id })
      .select('session_id form_id created_at updated_at')
      .sort({ updated_at: -1 });

    res.json({ sessions });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/ai/session/:session_id
 * Get full chat history of one session.
 */
const getChatSession = async (req, res, next) => {
  try {
    const session = await ChatSession.findOne({
      session_id: req.params.session_id,
      business_id: req.business.business_id,
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found.' });
    }

    res.json({ session });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/ai/session/:session_id
 * Delete a chat session.
 */
const deleteChatSession = async (req, res, next) => {
  try {
    await ChatSession.deleteOne({
      session_id: req.params.session_id,
      business_id: req.business.business_id,
    });

    res.json({ message: 'Chat session deleted.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  queryAI,
  getChatSessions,
  getChatSession,
  deleteChatSession,
};
