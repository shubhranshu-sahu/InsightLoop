const { getPool } = require('../config/db');
const Response = require('../models/response.model');

// ── Helper: generate array of YYYY-MM-DD strings for a date range ──
function generateDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

/**
 * GET /api/analytics/dashboard
 * All stat cards + urgency + topics in one call.
 * Queries both MySQL and MongoDB.
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const pool = getPool();
    const businessId = req.business.business_id;

    const now = new Date();

    // ── Date boundaries ──
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Start of current calendar month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Start of current week (Monday)
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon ...
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    // Today midnight
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);

    // ── MySQL queries (run in parallel) ──
    const mysqlPromises = Promise.all([
      // Active forms count
      pool.query(
        `SELECT COUNT(*) as active_forms FROM feedback_forms WHERE business_id = ? AND is_active = 1`,
        [businessId]
      ),
      // Unread alerts count
      pool.query(
        `SELECT COUNT(*) as unread_alerts FROM alerts WHERE business_id = ? AND is_read = 0`,
        [businessId]
      ),
    ]);

    // ── MongoDB queries (run in parallel) ──
    const mongoPromises = Promise.all([
      // 1. Total response count
      Response.countDocuments({ business_id: businessId }),

      // 2. Responses this week
      Response.countDocuments({
        business_id: businessId,
        submitted_at: { $gte: weekStart },
      }),

      // 3. Responses today
      Response.countDocuments({
        business_id: businessId,
        submitted_at: { $gte: todayMidnight },
      }),

      // 4. Complaints this month
      Response.countDocuments({
        business_id: businessId,
        'ai_analysis.is_complaint': true,
        submitted_at: { $gte: monthStart },
      }),

      // 5. Sentiment breakdown — last 30 days
      Response.aggregate([
        {
          $match: {
            business_id: businessId,
            'ai_analysis.status': 'completed',
            submitted_at: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: '$ai_analysis.overall_sentiment',
            count: { $sum: 1 },
          },
        },
      ]),

      // 6. Sentiment breakdown — previous 30 days (30-60 days ago) for positive rate delta
      Response.aggregate([
        {
          $match: {
            business_id: businessId,
            'ai_analysis.status': 'completed',
            submitted_at: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: '$ai_analysis.overall_sentiment',
            count: { $sum: 1 },
          },
        },
      ]),

      // 7. Urgency breakdown — last 30 days
      Response.aggregate([
        {
          $match: {
            business_id: businessId,
            'ai_analysis.status': 'completed',
            submitted_at: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: '$ai_analysis.urgency',
            count: { $sum: 1 },
          },
        },
      ]),

      // 8. Top 6 topics — last 30 days
      Response.aggregate([
        {
          $match: {
            business_id: businessId,
            'ai_analysis.status': 'completed',
            'ai_analysis.dominant_topic': { $exists: true, $ne: null },
            submitted_at: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: '$ai_analysis.dominant_topic',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
    ]);

    // ── Run MySQL + MongoDB in parallel ──
    const [mysqlResults, mongoResults] = await Promise.all([mysqlPromises, mongoPromises]);

    // Destructure MySQL
    const [[activeFormsRows]] = mysqlResults[0];
    const [[unreadAlertsRows]] = mysqlResults[1];

    // Destructure MongoDB
    const [
      totalResponses,
      responsesThisWeek,
      responsesToday,
      complaintsThisMonth,
      sentimentCurrent30d,
      sentimentPrevious30d,
      urgencyBreakdown30d,
      topTopics30d,
    ] = mongoResults;

    // ── Build sentiment breakdown (current 30d) ──
    const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
    sentimentCurrent30d.forEach(({ _id, count }) => {
      if (_id && sentimentBreakdown.hasOwnProperty(_id)) {
        sentimentBreakdown[_id] = count;
      }
    });

    // ── Build positive rate (current vs previous 30d) ──
    const totalCurrent30d = sentimentCurrent30d.reduce((sum, r) => sum + r.count, 0);
    const positiveCurrent = sentimentBreakdown.positive;
    const currentPositiveRate = totalCurrent30d > 0
      ? parseFloat(((positiveCurrent / totalCurrent30d) * 100).toFixed(1))
      : 0;

    const prevBreakdown = { positive: 0 };
    let totalPrevious30d = 0;
    sentimentPrevious30d.forEach(({ _id, count }) => {
      totalPrevious30d += count;
      if (_id === 'positive') prevBreakdown.positive = count;
    });
    const previousPositiveRate = totalPrevious30d > 0
      ? parseFloat(((prevBreakdown.positive / totalPrevious30d) * 100).toFixed(1))
      : 0;

    const delta = parseFloat((currentPositiveRate - previousPositiveRate).toFixed(1));

    // ── Build urgency breakdown ──
    const urgency = { low: 0, medium: 0, high: 0 };
    urgencyBreakdown30d.forEach(({ _id, count }) => {
      if (_id && urgency.hasOwnProperty(_id)) {
        urgency[_id] = count;
      }
    });

    // ── Build top topics ──
    const topics = topTopics30d.map(({ _id, count }) => ({
      topic: _id,
      count,
    }));

    // ── Response ──
    res.json({
      stat_cards: {
        total_responses: totalResponses,
        responses_this_week: responsesThisWeek,
        responses_today: responsesToday,
        active_forms: activeFormsRows.active_forms,
        complaints_this_month: complaintsThisMonth,
        unread_alerts: unreadAlertsRows.unread_alerts,
      },
      positive_rate: {
        current_30d: currentPositiveRate,
        previous_30d: previousPositiveRate,
        delta,
      },
      sentiment_breakdown_30d: sentimentBreakdown,
      urgency_breakdown_30d: urgency,
      top_topics_30d: topics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/sentiment-trend
 * Sentiment over time (for line chart).
 * Query params: days (7 | 30 | 90, default 30)
 */
const getSentimentTrend = async (req, res, next) => {
  try {
    const businessId = req.business.business_id;
    const days = parseInt(req.query.days) || 30;

    // Clamp to allowed values
    const allowedDays = [7, 30, 90];
    const validDays = allowedDays.includes(days) ? days : 30;

    const startDate = new Date(Date.now() - validDays * 24 * 60 * 60 * 1000);

    // MongoDB aggregation — group by date + sentiment
    const rawResult = await Response.aggregate([
      {
        $match: {
          business_id: businessId,
          'ai_analysis.status': 'completed',
          submitted_at: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$submitted_at' } },
            sentiment: '$ai_analysis.overall_sentiment',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    // Reshape — pivot sentiment into columns per date
    const dateMap = {};
    rawResult.forEach(({ _id, count }) => {
      const { date, sentiment } = _id;
      if (!dateMap[date]) dateMap[date] = { date, positive: 0, neutral: 0, negative: 0 };
      if (sentiment && ['positive', 'neutral', 'negative'].includes(sentiment)) {
        dateMap[date][sentiment] = count;
      }
    });

    // Fill in all dates in range (even if no responses that day)
    const allDates = generateDateRange(startDate, new Date());
    const trend = allDates.map(
      (date) => dateMap[date] || { date, positive: 0, neutral: 0, negative: 0 }
    );

    res.json({ days: validDays, trend });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/forms-performance
 * Per-form stats table — combines MySQL (form titles) with MongoDB (response counts and sentiment).
 */
const getFormsPerformance = async (req, res, next) => {
  try {
    const pool = getPool();
    const businessId = req.business.business_id;

    // 1. MySQL — get all forms for this business
    const [formRows] = await pool.query(
      `SELECT form_id, title, is_active FROM feedback_forms WHERE business_id = ?`,
      [businessId]
    );

    if (!formRows.length) {
      return res.json({ forms: [] });
    }

    // 2. MongoDB — aggregate per-form stats in one query
    const mongoStats = await Response.aggregate([
      {
        $match: {
          business_id: businessId,
          'ai_analysis.status': 'completed',
        },
      },
      {
        $group: {
          _id: {
            form_id: '$form_id',
            sentiment: '$ai_analysis.overall_sentiment',
          },
          count: { $sum: 1 },
          complaint_count: {
            $sum: { $cond: [{ $eq: ['$ai_analysis.is_complaint', true] }, 1, 0] },
          },
          last_response_at: { $max: '$submitted_at' },
        },
      },
    ]);

    // Also get total counts per form (including responses not yet analyzed)
    const totalCounts = await Response.aggregate([
      { $match: { business_id: businessId } },
      {
        $group: {
          _id: '$form_id',
          total_responses: { $sum: 1 },
          last_response_at: { $max: '$submitted_at' },
        },
      },
    ]);

    // Build a lookup map: form_id → { positive, neutral, negative, complaint_count, last_response_at }
    const statsMap = {};
    mongoStats.forEach(({ _id, count, complaint_count, last_response_at }) => {
      const fid = _id.form_id;
      if (!statsMap[fid]) {
        statsMap[fid] = {
          positive_count: 0,
          neutral_count: 0,
          negative_count: 0,
          complaint_count: 0,
          last_response_at: null,
        };
      }
      const sentiment = _id.sentiment;
      if (sentiment && ['positive', 'neutral', 'negative'].includes(sentiment)) {
        statsMap[fid][`${sentiment}_count`] = count;
      }
      statsMap[fid].complaint_count += complaint_count;
      if (!statsMap[fid].last_response_at || last_response_at > statsMap[fid].last_response_at) {
        statsMap[fid].last_response_at = last_response_at;
      }
    });

    // Build total counts map
    const totalMap = {};
    totalCounts.forEach(({ _id, total_responses, last_response_at }) => {
      totalMap[_id] = { total_responses, last_response_at };
    });

    // 3. Merge MySQL forms with MongoDB stats
    const forms = formRows.map((form) => {
      const stats = statsMap[form.form_id] || {
        positive_count: 0,
        neutral_count: 0,
        negative_count: 0,
        complaint_count: 0,
        last_response_at: null,
      };
      const totals = totalMap[form.form_id] || { total_responses: 0, last_response_at: null };

      const totalResponses = totals.total_responses;
      const analyzedTotal = stats.positive_count + stats.neutral_count + stats.negative_count;
      const positivePct = analyzedTotal > 0
        ? parseFloat(((stats.positive_count / analyzedTotal) * 100).toFixed(1))
        : 0;

      return {
        form_id: form.form_id,
        title: form.title,
        is_active: form.is_active === 1,
        total_responses: totalResponses,
        positive_count: stats.positive_count,
        neutral_count: stats.neutral_count,
        negative_count: stats.negative_count,
        positive_pct: positivePct,
        complaint_count: stats.complaint_count,
        last_response_at: totals.last_response_at || stats.last_response_at,
      };
    });

    res.json({ forms });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/recent-responses
 * Last N responses across all forms, newest first.
 * Query params: limit (default 15, max 50)
 */
const getRecentResponses = async (req, res, next) => {
  try {
    const pool = getPool();
    const businessId = req.business.business_id;
    const limit = Math.min(parseInt(req.query.limit) || 15, 50);

    // 1. MongoDB — fetch recent responses
    const recentDocs = await Response.find({ business_id: businessId })
      .sort({ submitted_at: -1 })
      .limit(limit)
      .lean();

    if (!recentDocs.length) {
      return res.json({ responses: [] });
    }

    // 2. MySQL — batch-fetch form titles for all unique form_ids
    const formIds = [...new Set(recentDocs.map((r) => r.form_id))];
    const placeholders = formIds.map(() => '?').join(',');
    const [formRows] = await pool.query(
      `SELECT form_id, title FROM feedback_forms WHERE form_id IN (${placeholders})`,
      formIds
    );

    // Build form title lookup
    const titleMap = {};
    formRows.forEach((row) => {
      titleMap[row.form_id] = row.title;
    });

    // 3. Build response array
    const responses = recentDocs.map((doc) => ({
      response_id: doc.response_id,
      form_id: doc.form_id,
      form_title: titleMap[doc.form_id] || 'Unknown Form',
      submitted_at: doc.submitted_at,
      sentiment: doc.ai_analysis?.overall_sentiment || null,
      urgency: doc.ai_analysis?.urgency || null,
      is_complaint: doc.ai_analysis?.is_complaint || false,
      dominant_topic: doc.ai_analysis?.dominant_topic || null,
      summary: doc.ai_analysis?.summary || null,
    }));

    res.json({ responses });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/form/:form_id
 * Deep analytics for one specific form.
 * (Kept from original code — not part of dashboard doc but useful for analysis page)
 */
const getFormAnalytics = async (req, res, next) => {
  try {
    const businessId = req.business.business_id;
    const formId = req.params.form_id;

    // Verify the form belongs to this business
    const pool = getPool();
    const [formCheck] = await pool.query(
      `SELECT form_id FROM feedback_forms WHERE form_id = ? AND business_id = ?`,
      [formId, businessId]
    );
    if (!formCheck.length) {
      return res.status(404).json({ error: 'Form not found.' });
    }

    // MongoDB aggregations
    const [totalResponses, sentimentBreakdown, urgencyBreakdown, complaintCount] = await Promise.all([
      Response.countDocuments({ form_id: formId }),

      Response.aggregate([
        { $match: { form_id: formId, 'ai_analysis.status': 'completed' } },
        { $group: { _id: '$ai_analysis.overall_sentiment', count: { $sum: 1 } } },
      ]),

      Response.aggregate([
        { $match: { form_id: formId, 'ai_analysis.status': 'completed' } },
        { $group: { _id: '$ai_analysis.urgency', count: { $sum: 1 } } },
      ]),

      Response.countDocuments({ form_id: formId, 'ai_analysis.is_complaint': true }),
    ]);

    res.json({
      form_id: formId,
      total_responses: totalResponses,
      sentiment_breakdown: sentimentBreakdown,
      urgency_breakdown: urgencyBreakdown,
      complaint_count: complaintCount,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getSentimentTrend,
  getFormsPerformance,
  getRecentResponses,
  getFormAnalytics,
};
