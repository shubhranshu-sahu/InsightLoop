# InsightLoop — Dashboard Planning Document
> **For:** Purvi (Node API) + Frontend Developer  
> **Page:** `pages/dashboard.html`  
> **Purpose:** Complete reference for building the dashboard — what to show, what APIs to build, and what data comes from where.

---

## Table of Contents

1. [What the Dashboard Shows](#1-what-the-dashboard-shows)
2. [Data Sources](#2-data-sources)
3. [APIs Purvi Needs to Build](#3-apis-purvi-needs-to-build)
4. [Frontend — What to Call and When](#4-frontend--what-to-call-and-when)
5. [Dashboard Layout](#5-dashboard-layout)

---

## 1. What the Dashboard Shows

The dashboard is a **business health overview** — everything at a glance without needing to open individual forms. A business owner should be able to open this page and within 10 seconds know: how many responses came in, whether sentiment is improving or worsening, what customers are complaining about, and whether anything urgent needs attention.

### Section A — Stat Cards (top row)

Six cards. Each shows one number with a label and a small context indicator.

| Card | Value | Context |
|---|---|---|
| Total Responses | All responses ever received (all forms) | `+N this week` in smaller text below |
| Active Forms | How many forms are currently active | Static label "forms collecting feedback" |
| Complaints This Month | Responses flagged `is_complaint: true` in current calendar month | Shown in red if > 0 |
| Unread Alerts | Count of alerts in MySQL with `is_read = false` | Red badge; clicking scrolls to alerts section |
| Positive Rate | `(positive count / total count) * 100` for last 30 days | Arrow up/down vs previous 30 days |
| Responses Today | Count submitted since midnight (local time) | "No responses yet today" if 0 |

---

### Section B — Sentiment Trend Chart

A line chart showing how sentiment is trending over the last 30 days (default). Three lines: positive, neutral, negative. User can switch between 7 days / 30 days / 90 days using tab buttons above the chart.

X-axis: dates. Y-axis: count of responses. Each point = how many responses of that sentiment on that day.

This is the most important chart — it tells the business owner whether things are getting better or worse over time.

---

### Section C — Form Performance Table

A table showing each form's performance side by side. Helps the business owner see which form (location, service type) is generating the most complaints or lowest ratings.

Columns:
- Form Name
- Total Responses
- Positive % (green)
- Negative % (red)
- Avg Rating (only if the form has rating questions — show `—` if not)
- Complaints
- Last Response (how long ago)
- Quick action: "View Analysis →" link

---

### Section D — Top Topics + Urgency Split

Two charts side by side.

**Left — Top Topics (horizontal bar chart):**
What are customers talking about most? Derived from `ai_analysis.dominant_topic` across all responses for this business in the last 30 days. Shows top 6 topics with response counts.

Example:
```
Food Quality    ████████████  34
Service Speed   ████████      22
Ambience        █████         14
Staff Behavior  ████          11
Billing         ██             6
Cleanliness     █              3
```

**Right — Urgency Breakdown (donut chart):**
Of all responses in last 30 days, how many are Low / Medium / High urgency? Helps at a glance: if High urgency slice is large, something is seriously wrong.

---

### Section E — Recent Responses Table

Last 15 responses across all forms, newest first. The business owner can scan recent feedback without opening the analysis page.

Columns:
- Form Name (which form the response came from)
- Submitted (relative time — "2 hours ago", "Yesterday")
- Sentiment badge (colored)
- Urgency badge (colored)
- Topic
- Summary (truncated to ~70 chars, full text on hover)
- Action: "View →" (opens full response in analysis page)

---

### Section F — Alerts Panel

Only shown if there are unread alerts. Sits below the recent responses table.

Each alert shows:
- Alert type label (e.g. "High Urgency Spike")
- Message text (e.g. "4 high-urgency complaints received in the last 6 hours for: Dining Feedback")
- Time ago
- "Mark as Read ✓" button — dismisses from dashboard view

If no unread alerts: this section is hidden entirely. No empty state needed.

---

## 2. Data Sources

This tells Purvi exactly where each piece of data comes from so she knows which database to query.

| Data Point | Source | Query Target |
|---|---|---|
| Active forms count | MySQL | `feedback_forms WHERE business_id = ? AND is_active = 1` |
| Unread alerts count | MySQL | `alerts WHERE business_id = ? AND is_read = 0` |
| All alerts (unread) | MySQL | `alerts WHERE business_id = ? AND is_read = 0 ORDER BY created_at DESC` |
| Total responses | MongoDB | `count({ business_id })` |
| Responses this week | MongoDB | `count({ business_id, submitted_at >= 7 days ago })` |
| Responses today | MongoDB | `count({ business_id, submitted_at >= today midnight })` |
| Complaints this month | MongoDB | `count({ business_id, ai_analysis.is_complaint: true, submitted_at >= month start })` |
| Sentiment breakdown (30d) | MongoDB | `aggregate: group by ai_analysis.overall_sentiment, submitted_at >= 30d` |
| Positive rate (previous 30d) | MongoDB | `count({ sentiment: positive, 30-60d ago }) / total(30-60d ago)` |
| Urgency breakdown (30d) | MongoDB | `aggregate: group by ai_analysis.urgency, submitted_at >= 30d` |
| Top topics (30d) | MongoDB | `aggregate: group by ai_analysis.dominant_topic, submitted_at >= 30d, limit 6` |
| Sentiment trend (daily) | MongoDB | `aggregate: group by date + sentiment, submitted_at >= N days` |
| Recent responses (last 15) | MongoDB | `find({ business_id }).sort(submitted_at: -1).limit(15)` |
| Per-form response counts | MongoDB | `aggregate: group by form_id, count` |
| Per-form sentiment | MongoDB | `aggregate: group by form_id + sentiment` |
| Form titles | MySQL | `feedback_forms WHERE business_id = ?` |
| Avg rating per form | MongoDB | `aggregate: avg of rating-type answer values per form` — **complex, see note below** |

**Note on avg rating:** Computing average rating from MongoDB requires iterating over the `answers` map to find `type: "rating"` fields. This is expensive to do in MongoDB's aggregation pipeline since keys are dynamic UUIDs. Simpler approach: skip the avg rating column for now, or only show it if the form has exactly one rating question (most common case). Add a comment in the code to revisit.

---

## 3. APIs Purvi Needs to Build

### Overview

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/analytics/dashboard` | All stat cards + urgency + topics in one call |
| `GET` | `/api/analytics/sentiment-trend` | Sentiment over time (for line chart) |
| `GET` | `/api/analytics/forms-performance` | Per-form stats table |
| `GET` | `/api/analytics/recent-responses` | Last 15 responses (recent table) |
| `GET` | `/api/alerts` | Unread alerts list |
| `PATCH` | `/api/alerts/:alert_id/read` | Mark one alert as read |
| `PATCH` | `/api/alerts/read-all` | Mark all alerts as read |

---

### `GET /api/analytics/dashboard`

The primary dashboard endpoint. Called once on page load. Returns everything needed for stat cards, urgency donut, and top topics. Queries both MySQL and MongoDB.

**Auth:** Required (JWT)  
**Query params:** None  

**What Purvi does internally:**
1. Read `business_id` from JWT
2. MySQL query: count active forms, count unread alerts
3. MongoDB queries (can run in parallel with `Promise.all`):
   - Total response count
   - Responses this week count
   - Responses today count
   - Complaints this month count
   - Sentiment breakdown last 30 days (positive/neutral/negative counts)
   - Sentiment breakdown previous 30 days (for positive rate delta)
   - Urgency breakdown last 30 days
   - Top 6 topics last 30 days

**Response:**
```json
{
  "stat_cards": {
    "total_responses":     1284,
    "responses_this_week": 47,
    "responses_today":     8,
    "active_forms":        3,
    "complaints_this_month": 19,
    "unread_alerts":       2
  },
  "positive_rate": {
    "current_30d":  67.4,
    "previous_30d": 61.2,
    "delta":        6.2
  },
  "sentiment_breakdown_30d": {
    "positive": 189,
    "neutral":  62,
    "negative": 30
  },
  "urgency_breakdown_30d": {
    "low":    192,
    "medium": 67,
    "high":   22
  },
  "top_topics_30d": [
    { "topic": "Food Quality",   "count": 34 },
    { "topic": "Service Speed",  "count": 22 },
    { "topic": "Ambience",       "count": 14 },
    { "topic": "Staff Behavior", "count": 11 },
    { "topic": "Billing",        "count": 6  },
    { "topic": "Cleanliness",    "count": 3  }
  ]
}
```

**MongoDB aggregations she needs:**

Sentiment breakdown (last 30 days):
```js
db.responses.aggregate([
  {
    $match: {
      business_id: businessId,
      "ai_analysis.status": "done",
      submitted_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: "$ai_analysis.overall_sentiment",
      count: { $sum: 1 }
    }
  }
])
```

Top topics (last 30 days):
```js
db.responses.aggregate([
  {
    $match: {
      business_id: businessId,
      "ai_analysis.status": "done",
      "ai_analysis.dominant_topic": { $exists: true, $ne: null },
      submitted_at: { $gte: thirtyDaysAgo }
    }
  },
  {
    $group: {
      _id: "$ai_analysis.dominant_topic",
      count: { $sum: 1 }
    }
  },
  { $sort: { count: -1 } },
  { $limit: 6 }
])
```

Urgency breakdown — same pattern, group by `$ai_analysis.urgency`.

---

### `GET /api/analytics/sentiment-trend`

Powers the sentiment line chart. Returns daily counts for each sentiment.

**Auth:** Required  
**Query params:**
- `days` — number of past days to return (default `30`, accepts `7`, `30`, `90`)

**Response:**
```json
{
  "days": 30,
  "trend": [
    { "date": "2026-04-10", "positive": 8,  "neutral": 3, "negative": 1 },
    { "date": "2026-04-11", "positive": 12, "neutral": 4, "negative": 2 },
    { "date": "2026-04-12", "positive": 5,  "neutral": 2, "negative": 4 },
    { "date": "2026-04-13", "positive": 9,  "neutral": 1, "negative": 0 }
  ]
}
```

Every date in the range must appear in the array, even if all values are 0. Frontend needs continuous dates for the chart X-axis — don't skip empty days.

**MongoDB aggregation:**
```js
db.responses.aggregate([
  {
    $match: {
      business_id: businessId,
      "ai_analysis.status": "done",
      submitted_at: { $gte: startDate }
    }
  },
  {
    $group: {
      _id: {
        date:      { $dateToString: { format: "%Y-%m-%d", date: "$submitted_at" } },
        sentiment: "$ai_analysis.overall_sentiment"
      },
      count: { $sum: 1 }
    }
  },
  { $sort: { "_id.date": 1 } }
])
```

After getting the raw result, Purvi needs to **reshape it in Node** — pivot the sentiment into columns per date, and fill in zeros for any missing date+sentiment combinations.

```javascript
// Reshaping logic (Node side)
const dateMap = {};
rawResult.forEach(({ _id, count }) => {
  const { date, sentiment } = _id;
  if (!dateMap[date]) dateMap[date] = { date, positive: 0, neutral: 0, negative: 0 };
  dateMap[date][sentiment] = count;
});

// Fill in all dates in range (even if no responses that day)
const allDates = generateDateRange(startDate, new Date()); // helper that generates YYYY-MM-DD strings
const trend = allDates.map(date => dateMap[date] || { date, positive: 0, neutral: 0, negative: 0 });
```

---

### `GET /api/analytics/forms-performance`

Powers the form performance table. Returns per-form stats by combining MySQL (form titles) with MongoDB (response counts and sentiment).

**Auth:** Required  
**Query params:** None

**Response:**
```json
{
  "forms": [
    {
      "form_id":         "uuid-form-1",
      "title":           "Dining Experience Feedback",
      "is_active":       true,
      "total_responses": 142,
      "positive_count":  89,
      "neutral_count":   31,
      "negative_count":  22,
      "positive_pct":    62.7,
      "complaint_count": 14,
      "last_response_at": "2026-05-09T11:30:00Z"
    },
    {
      "form_id":         "uuid-form-2",
      "title":           "Staff Feedback Survey",
      "is_active":       true,
      "total_responses": 38,
      "positive_count":  30,
      "neutral_count":   6,
      "negative_count":  2,
      "positive_pct":    78.9,
      "complaint_count": 1,
      "last_response_at": "2026-05-08T16:45:00Z"
    }
  ]
}
```

**What Purvi does internally:**
1. MySQL: `SELECT form_id, title, is_active FROM feedback_forms WHERE business_id = ?`
2. MongoDB: For each form, aggregate sentiment counts + complaint count + latest `submitted_at`
3. Merge both arrays by `form_id`

Can use MongoDB's `$facet` to run all form aggregations in one query:
```js
db.responses.aggregate([
  { $match: { business_id: businessId, "ai_analysis.status": "done" } },
  {
    $group: {
      _id: {
        form_id:   "$form_id",
        sentiment: "$ai_analysis.overall_sentiment"
      },
      count:             { $sum: 1 },
      complaint_count:   { $sum: { $cond: ["$ai_analysis.is_complaint", 1, 0] } },
      last_response_at:  { $max: "$submitted_at" }
    }
  }
])
```

---

### `GET /api/analytics/recent-responses`

Powers the recent responses table at the bottom of the dashboard.

**Auth:** Required  
**Query params:**
- `limit` — how many to return (default `15`, max `50`)

**Response:**
```json
{
  "responses": [
    {
      "response_id":   "uuid",
      "form_id":       "uuid",
      "form_title":    "Dining Experience Feedback",
      "submitted_at":  "2026-05-09T14:30:00Z",
      "sentiment":     "negative",
      "urgency":       "high",
      "is_complaint":  true,
      "dominant_topic": "Food Quality",
      "summary":       "Customer experienced cold food and long wait times despite appreciating the ambience."
    }
  ]
}
```

`form_title` needs to be joined from MySQL. Two options:
- Option A: Fetch responses from MongoDB, then batch-fetch titles from MySQL using `IN (form_id_1, form_id_2, ...)` — one MySQL query.
- Option B: Store `form_title` denormalized in the MongoDB response document when feedback is submitted. Faster reads, slightly redundant data. Purvi's choice — both are valid.

---

### `GET /api/alerts`

Returns all unread alerts for this business.

**Auth:** Required  
**Query params:** None

**Response:**
```json
{
  "alerts": [
    {
      "alert_id":    "uuid",
      "form_id":     "uuid",
      "form_title":  "Dining Experience Feedback",
      "alert_type":  "high_urgency_spike",
      "message":     "4 high-urgency complaints received in the last 6 hours.",
      "is_read":     false,
      "created_at":  "2026-05-09T12:00:00Z"
    }
  ],
  "unread_count": 1
}
```

MySQL query:
```sql
SELECT a.*, f.title as form_title
FROM alerts a
LEFT JOIN feedback_forms f ON a.form_id = f.form_id
WHERE a.business_id = ?
  AND a.is_read = 0
ORDER BY a.created_at DESC
```

---

### `PATCH /api/alerts/:alert_id/read`

Mark one alert as read.

**Auth:** Required  
**Body:** None  

**Response:**
```json
{ "message": "Alert marked as read." }
```

MySQL: `UPDATE alerts SET is_read = 1 WHERE alert_id = ? AND business_id = ?`

Always check `business_id` matches — don't let a business mark another business's alerts as read.

---

### `PATCH /api/alerts/read-all`

Mark all unread alerts as read.

**Auth:** Required  
**Body:** None  

**Response:**
```json
{ "message": "All alerts marked as read.", "updated_count": 3 }
```

MySQL: `UPDATE alerts SET is_read = 1 WHERE business_id = ? AND is_read = 0`

---

## 4. Frontend — What to Call and When

### On Page Load (parallel calls)

```javascript
// Call all three at the same time — don't chain them
const [dashboardData, trendData, formsData, recentData, alertsData] = await Promise.all([
  apiFetch('/api/analytics/dashboard'),
  apiFetch('/api/analytics/sentiment-trend?days=30'),
  apiFetch('/api/analytics/forms-performance'),
  apiFetch('/api/analytics/recent-responses?limit=15'),
  apiFetch('/api/alerts')
]);
```

Show skeleton loaders for each section while loading. Render each section as its data arrives.

### On Tab Switch (7d / 30d / 90d)

Only re-fetch the trend chart — everything else stays:
```javascript
async function changeTrendPeriod(days) {
  const data = await apiFetch(`/api/analytics/sentiment-trend?days=${days}`);
  updateSentimentChart(data.trend);
}
```

### On "Mark as Read"

```javascript
async function markAlertRead(alertId, cardElement) {
  await apiFetch(`/api/alerts/${alertId}/read`, { method: 'PATCH' });
  cardElement.remove();
  // Update unread count in stat card
  const badge = document.getElementById('alertBadge');
  const current = parseInt(badge.textContent) - 1;
  if (current <= 0) badge.style.display = 'none';
  else badge.textContent = current;
}
```

---

## 5. Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ SECTION A — Stat Cards (6 cards in a row, 3 on tablet, 2 on mobile) │
│                                                                     │
│  Total        Active    Complaints   Unread    Positive   Responses │
│  Responses    Forms     This Month   Alerts    Rate       Today     │
│  1,284        3         19           2 🔴      67.4% ↑    8        │
│  +47 this wk                                   +6.2% vs last mo    │
├───────────────────────────────────────────┬─────────────────────────┤
│ SECTION B — Sentiment Trend               │ SECTION D right half    │
│                                           │ Urgency Breakdown       │
│  [7d] [30d] [90d]                         │                         │
│                                           │  ⬤ Low    192  (68%)    │
│  📈 Line chart                            │  ⬤ Medium  67  (24%)    │
│     positive / neutral / negative         │  ⬤ High    22   (8%)    │
│                                           │                         │
│                                           │ [donut chart]           │
├───────────────────────────────────────────┴─────────────────────────┤
│ SECTION D left half — Top Topics                                    │
│                                                                     │
│  Food Quality    ████████████████  34                               │
│  Service Speed   ████████████      22                               │
│  Ambience        ████████          14                               │
│  Staff Behavior  ███████           11                               │
│  Billing         ████               6                               │
│  Cleanliness     ██                 3                               │
├─────────────────────────────────────────────────────────────────────┤
│ SECTION C — Form Performance Table                                  │
│                                                                     │
│  Form Name          Responses  Positive%  Negative%  Complaints  → │
│  Dining Feedback    142        62.7%      15.5%      14          → │
│  Staff Survey        38        78.9%       5.3%       1          → │
├─────────────────────────────────────────────────────────────────────┤
│ SECTION E — Recent Responses                                        │
│                                                                     │
│  Form          Time         Sentiment  Urgency  Topic       →      │
│  Dining...     2 hours ago  Negative   High     Food        →      │
│  Staff...      Yesterday    Positive   Low      Staff       →      │
│  Dining...     Yesterday    Neutral    Low      Ambience    →      │
├─────────────────────────────────────────────────────────────────────┤
│ SECTION F — Alerts (hidden if no unread alerts)                    │
│                                                                     │
│  🔴 High Urgency Spike                          2 hours ago  [✓]   │
│     4 high-urgency complaints in last 6h                           │
│     Form: Dining Experience Feedback                               │
└─────────────────────────────────────────────────────────────────────┘
```

### Mobile Stacking Order

On mobile, sections stack vertically in this order:
1. Stat cards (2 per row)
2. Alerts panel (if any)
3. Sentiment trend chart
4. Top topics
5. Urgency donut
6. Form performance (horizontal scroll table)
7. Recent responses (horizontal scroll table or card view)

---

## Quick Reference — Empty States

| Section | Empty state text |
|---|---|
| Form performance | "No forms created yet. Create your first form." + button |
| Recent responses | "No feedback received yet. Share your QR code to start collecting." |
| Top topics | "Topics will appear once feedback is analyzed." |
| Alerts | Section hidden entirely — no empty state |
| Sentiment trend | Chart shows flat zero line with message "No data for this period" |

---

*End of Dashboard Planning Document*