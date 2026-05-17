const axios = require('axios');
const ChatThread = require('../models/chat_thread.model');
const { getPool } = require('../config/db');

/**
 * POST /api/chat/thread
 * JWT required. Gets or creates a chat thread for a form.
 * Proxies to FastAPI to handle thread creation/retrieval.
 */
const getOrCreateThread = async (req, res, next) => {
  try {
    const { form_id } = req.body;
    const business_id = req.business.business_id;

    if (!form_id) {
      return res.status(400).json({ error: 'form_id is required.' });
    }

    // 1. Fetch form_title and its owner from MySQL
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT title, business_id FROM feedback_forms WHERE form_id = ?',
      [form_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Form not found.' });
    }

    // 2. CRITICAL FIX: Ensure the form belongs to the logged-in business
    if (rows[0].business_id !== business_id) {
      return res.status(403).json({ error: 'Unauthorized: Form does not belong to this business.' });
    }

    const form_title = rows[0].title;

    // Call FastAPI to get or create thread
    const fastApiResponse = await axios.post(
      `${process.env.AI_SERVICE_URL}/chat/thread`,
      { business_id, form_id, form_title },
      {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET },
        timeout: 15000
      }
    );

    res.json(fastApiResponse.data);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chat/message  — STREAMING SSE
 * JWT required. Proxies streaming chat response from FastAPI to frontend.
 */
const chatMessage = async (req, res, next) => {
  try {
    const { thread_id, form_id, message } = req.body;
    const business_id = req.business.business_id;

    // Set SSE headers before piping
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // critical for nginx/Render

    // Call FastAPI with streaming
    const fastApiResponse = await axios.post(
      `${process.env.AI_SERVICE_URL}/chat/message`,
      { thread_id, form_id, business_id, message },
      {
        headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET },
        responseType: 'stream',
        timeout: 60000
      }
    );

    // Pipe the SSE stream directly — do not buffer
    fastApiResponse.data.pipe(res);

    fastApiResponse.data.on('end', () => res.end());
    fastApiResponse.data.on('error', (err) => {
      console.error('[Chat] Stream error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Stream failed.' });
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chat/threads
 * JWT required. Returns all chat threads for this business.
 * Reads directly from MongoDB — no FastAPI call.
 */
const listThreads = async (req, res, next) => {
  try {
    const threads = await ChatThread.find({ business_id: req.business.business_id })
      .sort({ updated_at: -1 })
      .select('thread_id form_id form_title message_count messages updated_at')
      .lean();

    // Extract last user message for preview
    const result = threads.map(t => ({
      thread_id:     t.thread_id,
      form_id:       t.form_id,
      form_title:    t.form_title,
      message_count: t.message_count,
      last_message:  t.messages.filter(m => m.role === 'user').slice(-1)[0]?.content?.slice(0, 80) || '',
      updated_at:    t.updated_at
    }));

    res.json({ threads: result });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/chat/thread/:form_id
 * JWT required. Returns the full thread for a specific form.
 * Reads directly from MongoDB — no FastAPI call.
 */
const getThread = async (req, res, next) => {
  try {
    const thread = await ChatThread.findOne({
      business_id: req.business.business_id,
      form_id:     req.params.form_id
    }).lean();

    if (!thread) return res.json({ thread: null, is_new: true });
    res.json({ thread });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrCreateThread,
  chatMessage,
  listThreads,
  getThread,
};
