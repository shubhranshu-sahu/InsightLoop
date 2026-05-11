# InsightLoop — Backend & Frontend Complete Reference
> **For:** Purvi (Node backend) · Frontend Developer  
> **Purpose:** Single document covering all pages, all APIs, all fixes, all data formats.  
> **Status as of now:** Read Section 1 first — there are critical bugs to fix before anything new is built.

---

## Table of Contents

1. [Critical Bugs to Fix First](#1-critical-bugs-to-fix-first)
2. [Architecture Summary](#2-architecture-summary)
3. [Data Models — Corrections Needed](#3-data-models--corrections-needed)
4. [Pages and What APIs Power Them](#4-pages-and-what-apis-power-them)
5. [API Reference — All Endpoints](#5-api-reference--all-endpoints)
   - [Auth APIs](#51-auth-apis)
   - [Forms APIs](#52-forms-apis)
   - [Responses (Submission + Viewing)](#53-responses-submission--viewing)
   - [Analytics APIs](#54-analytics-apis)
   - [Alerts APIs](#55-alerts-apis)
   - [Chat APIs (New — Replace old /api/ai)](#56-chat-apis-new--replace-old-apiai)
   - [QR API](#57-qr-api)
6. [The Submission Flow — Fixed](#6-the-submission-flow--fixed)
7. [Chat System — How Node Proxies the Stream](#7-chat-system--how-node-proxies-the-stream)
8. [What to Skip](#8-what-to-skip)

---

## 1. Critical Bugs to Fix First

Fix these before building anything new. They will break the entire platform if left.

---

### Bug 1 — Two submission routes doing the same job differently

**Problem:**
- `POST /api/feedback/submit` → `feedbackController.submitFeedback` saves to **MySQL** (`feedback_responses`, `answers` tables)
- `POST /api/responses/submit` → `responsesController.submitResponse` saves to **MongoDB**

These are two completely different implementations for the same action. The frontend and customer `feedback.html` are calling one of these — whichever it is, the other route must be disabled.

**Fix:**
**MongoDB is the correct storage for responses.** `POST /api/responses/submit` is the correct endpoint.

Action items:
- Remove `POST /api/feedback/submit` from `feedback.routes.js` entirely
- Remove `feedbackController.submitFeedback` function (or leave it but unregister the route)
- The `feedback.html` page (customer form) must send submissions to `POST /api/responses/submit`
- Remove `createResponse`, `createAnswer`, `saveAnalysis` functions from `feedback.model.js` — they write to MySQL tables that don't exist in the correct architecture
- Keep only `getPublicForm` in `feedback.model.js` — that reads from MySQL `feedback_forms` + `questions` which is correct

---

### Bug 2 — AI service is never called after the correct submission

**Problem:**
`responses.controller.js` saves the response to MongoDB correctly but never calls the FastAPI AI service. The AI call that exists is in the wrong file (`feedback.controller.js`) and sends the wrong data format.

**Fix — Add this to `responses.controller.js` after `responseDoc.save()`:**

The call must be fire-and-forget (don't await it), and must send the enriched answers map — not an array of strings.

```javascript
// Fire-and-forget — do NOT await this
callAIService(responseDoc).catch(err => {
  console.error('[AI] Analysis failed for response:', responseDoc.response_id, err.message);
});

async function callAIService(responseDoc) {
  await axios.post(
    `${process.env.AI_SERVICE_URL}/analyze`,
    {
      response_id:  responseDoc.response_id,
      form_id:      responseDoc.form_id,
      business_id:  responseDoc.business_id,
      submitted_at: responseDoc.submitted_at.toISOString(),
      answers:      responseDoc.answers  // the full enriched map with label + type + value
    },
    {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET },
      timeout: 30000
    }
  );
}
```

**Why the enriched answers map matters:**  
FastAPI expects `answers` as `{ "question-uuid": { label, type, value } }` — this is exactly what `responses.controller.js` already builds in `enrichedAnswers` and saves to MongoDB. Pass that same object to FastAPI. Don't filter or transform it.

---

### Bug 3 — `response.model.js` is missing `per_text_analysis`

FastAPI writes `per_text_analysis` into `ai_analysis` after processing each text answer. The Mongoose schema doesn't have this field, so Mongoose will strip it.

**Fix — Add to `ai_analysis` in `response.model.js`:**

```javascript
ai_analysis: {
  // ... existing fields stay ...
  per_text_analysis: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
    // Structure written by FastAPI:
    // {
    //   "question-uuid": {
    //     label: "What could we do better?",
    //     raw_answer: "The food was cold.",
    //     sentiment: "negative",
    //     sentiment_score: 0.88,
    //     topics: ["food temperature"],
    //     key_phrases: ["food was cold"],
    //     intent: "complaint",
    //     emotions: ["frustration"]
    //   }
    // }
  }
}
```

---

### Bug 4 — Old AI chat system conflicts with new thread-based system

**Problem:**
`ai.routes.js` registers `/api/ai/query`, `/api/ai/sessions`, `/api/ai/session/:session_id` — these are the old session-based chat approach. The new chat system uses `/api/chat/*` with a thread-per-form model. The old routes must be removed to avoid confusion.

**Fix:**
- Delete or empty `ai.routes.js`
- Remove `app.use('/api/ai', aiRoutes)` from `app.js`
- Delete or archive `ai.controller.js` (the inline Mongoose schema definitions inside a controller is bad practice — schemas belong in `models/`)
- Create new `routes/chat.routes.js` and `controllers/chat.controller.js` (see Section 5.6)
- Add `app.use('/api/chat', chatRoutes)` to `app.js`

---

### Bug 5 — public_routes.js serves HTML from Node (wrong approach)

**Problem:**
`public_routes.js` serves a server-rendered HTML feedback form when customers scan QR codes (`/form/:form_id`). This is the old approach. The correct approach is:
- QR code points to `feedback.html?form_id=uuid` on the **frontend** (Vercel)
- `feedback.html` calls `GET /api/feedback/form/:form_id` (public JSON endpoint) to get the form schema
- Frontend renders the questions dynamically

**Fix:**
- `GET /api/feedback/form/:form_id` in `feedback.routes.js` stays — it returns JSON, this is used by `feedback.html`
- The `/form` public routes that serve HTML can be removed from `app.js` (or left harmlessly — they won't be called)
- Ensure `qr_codes.public_url` in MySQL points to the Vercel frontend URL + `feedback.html?form_id=uuid`, not `localhost:5000/form/uuid`

---

## 2. Architecture Summary

```
Customer (phone)
    │ scans QR
    ▼
feedback.html?form_id=uuid  (Vercel — frontend)
    │ GET /api/feedback/form/:form_id  →  Node (Render)
    │ POST /api/responses/submit       →  Node (Render)
    │                                        │
    │                                        ├── Saves to MongoDB Atlas
    │                                        └── Calls FastAPI /analyze (fire-and-forget)
    │                                                   │
    │                                              FastAPI (Render)
    │                                              updates MongoDB
    │                                              stores in Qdrant

Business Owner (browser)
    │ logged in via JWT
    ▼
dashboard / forms / responses / analysis / chat  (Vercel)
    │ All API calls → Node (Render) with Bearer token
    │
    ├── MySQL (AlwaysData) — form config, questions, QR, alerts, business accounts
    ├── MongoDB Atlas — responses + AI analysis, chat threads
    └── FastAPI (Render) — AI processing, streaming chat
```

**Rule:** MySQL stores configuration and structure. MongoDB stores all response data and chat. Never mix them for the same entity.

---

## 3. Data Models — Corrections Needed

### `response.model.js` — Add `per_text_analysis`

Already shown in Bug 3 above. Make that change.

### `feedback.model.js` — Remove MySQL response functions

Keep only `getPublicForm`. Remove: `createResponse`, `createAnswer`, `saveAnalysis`, `getResponsesByForm`, `getResponseById`. Responses live in MongoDB now — those functions are for the wrong database.

### `response.model.js` — Add compound indexes

Add these after the schema definition for query performance:

```javascript
responseSchema.index({ form_id: 1, submitted_at: -1 });
responseSchema.index({ business_id: 1, submitted_at: -1 });
responseSchema.index({ form_id: 1, 'ai_analysis.overall_sentiment': 1 });
responseSchema.index({ form_id: 1, 'ai_analysis.urgency': 1 });
responseSchema.index({ business_id: 1, 'ai_analysis.status': 1 });
```

### New model needed: `chat_thread.model.js`

Create this file in `models/`. This is the MongoDB schema for the chat threads collection that FastAPI writes to.

```javascript
// models/chat_thread.model.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  sources: [{
    response_id:  String,
    submitted_at: String,
    snippet:      String
    // chart field for Phase 3 — leave as flexible
  }]
}, { _id: false });

const chatThreadSchema = new mongoose.Schema({
  thread_id:       { type: String, required: true, unique: true },
  business_id:     { type: String, required: true },
  form_id:         { type: String, required: true },
  form_title:      { type: String },
  context_summary: { type: String, default: '' },
  message_count:   { type: Number, default: 0 },
  messages:        [messageSchema],
  created_at:      { type: Date, default: Date.now },
  updated_at:      { type: Date, default: Date.now }
}, {
  collection: 'chat_threads',
  versionKey: false
});

chatThreadSchema.index({ business_id: 1, form_id: 1 }, { unique: true });
chatThreadSchema.index({ business_id: 1, updated_at: -1 });

module.exports = mongoose.model('ChatThread', chatThreadSchema);
```

---

## 4. Pages and What APIs Power Them

| Page | Status | APIs Required |
|---|---|---|
| `index.html` | ✅ Done | None |
| `pages/login.html` | ✅ Done | `POST /api/auth/login` |
| `pages/register.html` | ✅ Done | `POST /api/auth/register` |
| `feedback.html` | ✅ Done | `GET /api/feedback/form/:form_id` · `POST /api/responses/submit` |
| `pages/dashboard.html` | ✅ Mostly done | `GET /api/analytics/dashboard` · `GET /api/analytics/sentiment-trend` · `GET /api/analytics/forms-performance` · `GET /api/analytics/recent-responses` · `GET /api/alerts` · `PATCH /api/alerts/:id/read` · `PATCH /api/alerts/read-all` |
| `pages/forms.html` | ✅ Done | `GET /api/forms` · `POST /api/forms` · `GET /api/forms/:id` · `DELETE /api/forms/:id` · `GET /api/qr/:form_id` |
| `pages/responses.html` | 🔴 Not built | `GET /api/forms` (form selector) · `GET /api/responses/form/:form_id` |
| `pages/analysis.html` | 🔴 Not built | `GET /api/forms` · `GET /api/analytics/form/:form_id` · `GET /api/analytics/sentiment-trend?form_id=&days=` |
| `pages/profile.html` | 🔴 Not built | `GET /api/auth/me` · `PUT /api/auth/profile` · `PUT /api/auth/change-password` |
| `pages/chat.html` | 🔴 Not built | `GET /api/forms` · `POST /api/chat/thread` · `POST /api/chat/message` (SSE) · `GET /api/chat/threads` · `GET /api/chat/thread/:form_id` |

---

## 5. API Reference — All Endpoints

### 5.1 Auth APIs

All existing and working. Listed here for frontend reference.

---

#### `POST /api/auth/register`
No auth required.

**Request:**
```json
{
  "name":     "Spice Garden Restaurant",
  "email":    "owner@spicegarden.com",
  "password": "mypassword123",
  "industry": "Restaurant",
  "phone":    "9876543210"
}
```

**Response `201`:**
```json
{
  "message": "Registration successful.",
  "business": {
    "business_id": "uuid",
    "name":        "Spice Garden Restaurant",
    "email":       "owner@spicegarden.com"
  }
}
```

---

#### `POST /api/auth/login`
No auth required.

**Request:**
```json
{ "email": "owner@spicegarden.com", "password": "mypassword123" }
```

**Response `200`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "business": {
    "business_id": "uuid",
    "name":        "Spice Garden Restaurant",
    "email":       "owner@spicegarden.com"
  }
}
```

Frontend stores `token` and `business` in `localStorage`.

---

#### `GET /api/auth/me`
JWT required.

**Response `200`:**
```json
{
  "business": {
    "business_id": "uuid",
    "name":        "Spice Garden Restaurant",
    "email":       "owner@spicegarden.com",
    "industry":    "Restaurant",
    "phone":       "9876543210",
    "logo_url":    null,
    "is_active":   1,
    "created_at":  "2026-05-01T10:00:00.000Z"
  }
}
```

---

#### `PUT /api/auth/profile`
JWT required. Updates name, industry, phone. Logo upload is out of scope for now.

**Request:**
```json
{
  "name":     "Spice Garden Cafe",
  "industry": "Cafe",
  "phone":    "9999999999"
}
```

**Response `200`:**
```json
{
  "message":  "Profile updated.",
  "business": { ...full business object... }
}
```

---

#### `PUT /api/auth/change-password`
JWT required.

**Request:**
```json
{
  "current_password": "oldpassword",
  "new_password":     "newpassword123"
}
```

**Response `200`:**
```json
{ "message": "Password changed successfully." }
```

**Response `401`:**
```json
{ "error": "Current password is incorrect." }
```

Controller must verify current password with `bcrypt.compare` before updating.

---

### 5.2 Forms APIs

Existing and working. Listed for reference.

---

#### `GET /api/forms`
JWT required. Returns all forms for the logged-in business.

**Response `200`:**
```json
{
  "forms": [
    {
      "form_id":     "uuid",
      "business_id": "uuid",
      "title":       "Dining Experience Feedback",
      "description": "Tell us about your visit.",
      "is_active":   1,
      "created_at":  "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

---

#### `POST /api/forms`
JWT required.

**Request:**
```json
{
  "title":       "Dining Experience Feedback",
  "description": "Help us improve your dining experience.",
  "questions": [
    { "question_text": "How was your overall experience?", "question_type": "rating", "order_index": 0, "is_required": true },
    { "question_text": "Rate the food quality",            "question_type": "rating", "order_index": 1, "is_required": true },
    { "question_text": "What could we do better?",         "question_type": "text",   "order_index": 2, "is_required": false },
    { "question_text": "Would you recommend us?",          "question_type": "yesno",  "order_index": 3, "is_required": true }
  ]
}
```

**Response `201`:**
```json
{
  "message": "Form created successfully.",
  "form": {
    "form_id":     "uuid",
    "business_id": "uuid",
    "title":       "Dining Experience Feedback",
    "description": "Help us improve your dining experience.",
    "is_active":   1,
    "created_at":  "2026-05-10T05:18:45.000Z",
    "questions": [
      {
        "question_id":   "uuid",
        "form_id":       "uuid",
        "question_text": "How was your overall experience?",
        "question_type": "rating",
        "order_index":   0,
        "is_required":   1
      }
    ]
  },
  "qr_code": {
    "qr_id":      "uuid",
    "public_url": "https://insightloop.vercel.app/feedback.html?form_id=uuid",
    "created_at": "2026-05-10T05:18:47.000Z"
  }
}
```

**Note:** `public_url` must use `process.env.FRONTEND_BASE_URL` + `/feedback.html?form_id=` + `form_id`. No image URLs.

---

#### `GET /api/forms/:form_id`
JWT required. Returns form with questions.

**Response `200`:**
```json
{
  "form": {
    "form_id":     "uuid",
    "title":       "Dining Experience Feedback",
    "description": "...",
    "is_active":   1,
    "created_at":  "...",
    "questions": [ ...array of question objects... ]
  }
}
```

---

#### `DELETE /api/forms/:form_id`
JWT required.

**Response `200`:**
```json
{ "message": "Form deleted successfully." }
```

---

### 5.3 Responses (Submission + Viewing)

---

#### `GET /api/feedback/form/:form_id` — PUBLIC
No auth. Used by `feedback.html` to get the form schema before rendering.

**Response `200`:**
```json
{
  "form": {
    "form_id":       "uuid",
    "title":         "Dining Experience Feedback",
    "description":   "Help us improve your dining experience.",
    "business_name": "Spice Garden Restaurant",
    "logo_url":      null,
    "questions": [
      {
        "question_id":   "uuid",
        "question_text": "How was your overall experience?",
        "question_type": "rating",
        "order_index":   0,
        "is_required":   1
      }
    ]
  }
}
```

This endpoint already exists and works correctly. No changes needed.

---

#### `POST /api/responses/submit` — PUBLIC
No auth. This is the ONLY submission endpoint. Used by `feedback.html`.

**Request body from frontend:**
```json
{
  "form_id": "uuid-form",
  "answers": {
    "uuid-q1": { "value": 4 },
    "uuid-q2": { "value": "The biryani arrived cold and we waited 40 minutes." },
    "uuid-q3": { "value": false }
  }
}
```

**What Node does:**
1. Validate `form_id` and `answers` exist
2. Look up form in MySQL — get `business_id` and all questions with labels
3. Enrich each answer with `label` and `type` from MySQL questions
4. Save to MongoDB with `ai_analysis.status: "pending"`
5. Fire-and-forget call to FastAPI `/analyze`
6. Return `201` immediately

**Response `201`:**
```json
{
  "message":      "Thank you for your feedback!",
  "response_id":  "uuid",
  "submitted_at": "2026-05-10T14:30:00.000Z"
}
```

**Response `404`:** Form not found  
**Response `410`:** Form inactive (`is_active = 0`)  
**Response `400`:** Missing required question answer

---

#### `GET /api/responses/form/:form_id`
JWT required. Returns all responses for a form. Used by `responses.html`.

**Response `200`:**
```json
{
  "count": 42,
  "responses": [
    {
      "response_id":  "uuid",
      "form_id":      "uuid",
      "business_id":  "uuid",
      "submitted_at": "2026-05-10T14:30:00.000Z",
      "answers": {
        "uuid-q1": { "label": "How was your overall experience?", "type": "rating",  "value": 2 },
        "uuid-q2": { "label": "What could we do better?",        "type": "text",    "value": "Food was cold." },
        "uuid-q3": { "label": "Would you recommend us?",         "type": "yesno",   "value": false }
      },
      "ai_analysis": {
        "status":            "done",
        "overall_sentiment": "negative",
        "sentiment_score":   0.81,
        "urgency":           "high",
        "is_complaint":      true,
        "dominant_topic":    "Food Quality",
        "summary":           "Customer experienced cold food and long wait times.",
        "key_phrases":       ["food was cold"],
        "per_text_analysis": {
          "uuid-q2": {
            "label":           "What could we do better?",
            "raw_answer":      "Food was cold.",
            "sentiment":       "negative",
            "sentiment_score": 0.88,
            "topics":          ["food temperature"],
            "key_phrases":     ["food was cold"],
            "intent":          "complaint",
            "emotions":        ["frustration"]
          }
        }
      }
    }
  ]
}
```

---

#### `GET /api/responses/:response_id`
JWT required. Returns one full response. Used in the response detail modal.

**Response `200`:** Same structure as a single item from the list above.

---

### 5.4 Analytics APIs

These power the dashboard and analysis pages. All require JWT. All aggregate from MongoDB.

---

#### `GET /api/analytics/dashboard`
Business-wide stats. Powers the stat cards, urgency donut, and top topics on the dashboard.

**Response `200`:**
```json
{
  "stat_cards": {
    "total_responses":       1284,
    "responses_this_week":   47,
    "responses_today":       8,
    "active_forms":          3,
    "complaints_this_month": 19,
    "unread_alerts":         2
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
    { "topic": "Billing",        "count": 6  }
  ]
}
```

**MongoDB aggregations needed:**

```javascript
const businessId = req.business.business_id;
const now = new Date();
const thirtyDaysAgo  = new Date(now - 30 * 24 * 60 * 60 * 1000);
const sixtyDaysAgo   = new Date(now - 60 * 24 * 60 * 60 * 1000);
const sevenDaysAgo   = new Date(now - 7  * 24 * 60 * 60 * 1000);
const todayMidnight  = new Date(now.setHours(0, 0, 0, 0));
const monthStart     = new Date(now.getFullYear(), now.getMonth(), 1);

// Run these in parallel with Promise.all:

// 1. Total
const total = await Response.countDocuments({ business_id: businessId });

// 2. This week
const thisWeek = await Response.countDocuments({
  business_id: businessId,
  submitted_at: { $gte: sevenDaysAgo }
});

// 3. Today
const today = await Response.countDocuments({
  business_id: businessId,
  submitted_at: { $gte: todayMidnight }
});

// 4. Complaints this month
const complaintsMonth = await Response.countDocuments({
  business_id: businessId,
  'ai_analysis.is_complaint': true,
  submitted_at: { $gte: monthStart }
});

// 5. Sentiment breakdown 30d
const sentiment30d = await Response.aggregate([
  { $match: { business_id: businessId, 'ai_analysis.status': 'done', submitted_at: { $gte: thirtyDaysAgo } } },
  { $group: { _id: '$ai_analysis.overall_sentiment', count: { $sum: 1 } } }
]);

// 6. Sentiment previous 30d (for delta)
const sentimentPrev30d = await Response.aggregate([
  { $match: { business_id: businessId, 'ai_analysis.status': 'done',
    submitted_at: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
  { $group: { _id: '$ai_analysis.overall_sentiment', count: { $sum: 1 } } }
]);

// 7. Urgency breakdown 30d
const urgency30d = await Response.aggregate([
  { $match: { business_id: businessId, 'ai_analysis.status': 'done', submitted_at: { $gte: thirtyDaysAgo } } },
  { $group: { _id: '$ai_analysis.urgency', count: { $sum: 1 } } }
]);

// 8. Top topics 30d
const topics30d = await Response.aggregate([
  { $match: { business_id: businessId, 'ai_analysis.status': 'done',
    'ai_analysis.dominant_topic': { $exists: true, $ne: null },
    submitted_at: { $gte: thirtyDaysAgo } } },
  { $group: { _id: '$ai_analysis.dominant_topic', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 5 }
]);

// 9. Active forms count — MySQL
const [formRows] = await pool.query(
  'SELECT COUNT(*) as count FROM feedback_forms WHERE business_id = ? AND is_active = 1',
  [businessId]
);

// 10. Unread alerts — MySQL
const [alertRows] = await pool.query(
  'SELECT COUNT(*) as count FROM alerts WHERE business_id = ? AND is_read = 0',
  [businessId]
);
```

**Helper to reshape aggregation results:**
```javascript
function toSentimentMap(aggResult) {
  const map = { positive: 0, neutral: 0, negative: 0 };
  aggResult.forEach(r => { if (r._id) map[r._id] = r.count; });
  return map;
}
```

---

#### `GET /api/analytics/sentiment-trend`
JWT required. Powers the line chart on dashboard and analysis page.

**Query params:** `days` (7, 30, or 90, default 30) · `form_id` (optional — if provided, scopes to one form)

**Response `200`:**
```json
{
  "days": 30,
  "trend": [
    { "date": "2026-04-10", "positive": 8,  "neutral": 3, "negative": 1 },
    { "date": "2026-04-11", "positive": 12, "neutral": 4, "negative": 2 },
    { "date": "2026-04-12", "positive": 0,  "neutral": 0, "negative": 0 }
  ]
}
```

Every date in the range must appear — even if all counts are 0. The chart needs continuous dates.

**MongoDB aggregation:**
```javascript
const match = {
  business_id: businessId,
  'ai_analysis.status': 'done',
  submitted_at: { $gte: startDate }
};
if (form_id) match.form_id = form_id;

const raw = await Response.aggregate([
  { $match: match },
  {
    $group: {
      _id: {
        date:      { $dateToString: { format: '%Y-%m-%d', date: '$submitted_at' } },
        sentiment: '$ai_analysis.overall_sentiment'
      },
      count: { $sum: 1 }
    }
  },
  { $sort: { '_id.date': 1 } }
]);

// Reshape into per-date objects and fill empty days
```

---

#### `GET /api/analytics/forms-performance`
JWT required. Powers the form performance table on the dashboard.

**Response `200`:**
```json
{
  "forms": [
    {
      "form_id":         "uuid",
      "title":           "Dining Experience Feedback",
      "is_active":       true,
      "total_responses": 142,
      "positive_count":  89,
      "neutral_count":   31,
      "negative_count":  22,
      "positive_pct":    62.7,
      "complaint_count": 14,
      "last_response_at": "2026-05-09T11:30:00Z"
    }
  ]
}
```

**Logic:** Fetch form titles from MySQL. For each form, aggregate MongoDB counts. Merge by `form_id`.

---

#### `GET /api/analytics/recent-responses`
JWT required. Powers the recent responses table on the dashboard.

**Query params:** `limit` (default 15)

**Response `200`:**
```json
{
  "responses": [
    {
      "response_id":    "uuid",
      "form_id":        "uuid",
      "form_title":     "Dining Experience Feedback",
      "submitted_at":   "2026-05-09T14:30:00Z",
      "sentiment":      "negative",
      "urgency":        "high",
      "is_complaint":   true,
      "dominant_topic": "Food Quality",
      "summary":        "Customer experienced cold food and long wait times."
    }
  ]
}
```

**Logic:** Query MongoDB `responses` sorted by `submitted_at` descending, limit to N. For `form_title`, either:
- Store it denormalized in MongoDB when the response is submitted (simplest), OR
- Batch-fetch from MySQL using `WHERE form_id IN (...)` after the MongoDB query

Recommended: fetch the unique `form_id` values from the MongoDB results, query MySQL once for all their titles, merge.

---

#### `GET /api/analytics/form/:form_id`
JWT required. Form-specific deep analytics for `analysis.html`.

**Response `200`:**
```json
{
  "form_id":    "uuid",
  "form_title": "Dining Experience Feedback",
  "stats": {
    "total_responses": 142,
    "positive_count":  89,
    "neutral_count":   31,
    "negative_count":  22,
    "positive_pct":    62.7,
    "negative_pct":    15.5,
    "complaint_count": 14,
    "high_urgency_count": 8
  },
  "sentiment_breakdown": {
    "positive": 89,
    "neutral":  31,
    "negative": 22
  },
  "urgency_breakdown": {
    "low":    112,
    "medium":  22,
    "high":     8
  },
  "top_topics": [
    { "topic": "Food Quality",  "count": 34 },
    { "topic": "Service Speed", "count": 22 },
    { "topic": "Ambience",      "count": 14 }
  ],
  "rating_distribution": {
    "How was your overall experience?": { "1": 8, "2": 14, "3": 31, "4": 52, "5": 37 },
    "Rate the food quality":            { "1": 12, "2": 18, "3": 28, "4": 48, "5": 36 }
  }
}
```

**Rating distribution logic:** Iterate over all `done` responses for this form. For each response, look at each answer where `type === "rating"`. Group counts by label and value. This has to be done in JavaScript after fetching documents (MongoDB aggregation over dynamic keys is impractical). Since this is a college project with limited data volume, fetching and processing in Node is fine.

```javascript
// Pseudocode
const responses = await Response.find({ form_id, 'ai_analysis.status': 'done' }).lean();
const ratingDist = {};
responses.forEach(r => {
  Object.values(r.answers).forEach(ans => {
    if (ans.type === 'rating') {
      if (!ratingDist[ans.label]) ratingDist[ans.label] = { 1:0, 2:0, 3:0, 4:0, 5:0 };
      ratingDist[ans.label][ans.value]++;
    }
  });
});
```

---

### 5.5 Alerts APIs

Routes exist. Verify the controller is implemented.

---

#### `GET /api/alerts`
JWT required.

**Response `200`:**
```json
{
  "alerts": [
    {
      "alert_id":   "uuid",
      "form_id":    "uuid",
      "form_title": "Dining Experience Feedback",
      "alert_type": "high_urgency_spike",
      "message":    "4 high-urgency complaints received in the last 6 hours.",
      "is_read":    false,
      "created_at": "2026-05-09T12:00:00Z"
    }
  ],
  "unread_count": 1
}
```

**MySQL query:**
```sql
SELECT a.*, f.title as form_title
FROM alerts a
LEFT JOIN feedback_forms f ON a.form_id = f.form_id
WHERE a.business_id = ? AND a.is_read = 0
ORDER BY a.created_at DESC
```

---

#### `PATCH /api/alerts/:alert_id/read`
JWT required. No request body.

**Response `200`:**
```json
{ "message": "Alert marked as read." }
```

**MySQL:** `UPDATE alerts SET is_read = 1 WHERE alert_id = ? AND business_id = ?`  
Always include `AND business_id = ?` — don't let a business read another business's alerts.

---

#### `PATCH /api/alerts/read-all`
JWT required. No request body.

**Response `200`:**
```json
{ "message": "All alerts marked as read.", "updated_count": 3 }
```

**Important:** In `alerts.routes.js`, `/read-all` must be registered BEFORE `/:alert_id/read`, otherwise Express will match "read-all" as an alert_id.

```javascript
router.patch('/read-all', verifyToken, alertsController.markAllAlertsRead);     // FIRST
router.patch('/:alert_id/read', verifyToken, alertsController.markAlertRead);   // SECOND
```

---

### 5.6 Chat APIs (New — Replace old `/api/ai`)

**Create `routes/chat.routes.js`** and **`controllers/chat.controller.js`**.  
Register in `app.js`: `app.use('/api/chat', chatRoutes)`.  
Remove `app.use('/api/ai', aiRoutes)` from `app.js`.

---

#### `POST /api/chat/thread`
JWT required. Gets or creates a thread for a form. Called when user opens the chat page and selects a form.

**Request:**
```json
{
  "form_id": "uuid-form"
}
```

**What Node does:**
1. Extract `business_id` from JWT
2. Fetch `form_title` from MySQL: `SELECT title FROM feedback_forms WHERE form_id = ?`
3. Call FastAPI: `POST {AI_SERVICE_URL}/chat/thread` with `{ business_id, form_id, form_title }`
4. Return FastAPI's response directly

**Response `200`:**
```json
{
  "thread_id":     "uuid-thread",
  "business_id":   "uuid-biz",
  "form_id":       "uuid-form",
  "form_title":    "Dining Experience Feedback",
  "is_new":        false,
  "message_count": 12,
  "messages": [
    { "role": "user",      "content": "What are the top complaints?",      "timestamp": "2026-05-01T10:00:00Z", "sources": [] },
    { "role": "assistant", "content": "The most common complaints are...", "timestamp": "2026-05-01T10:00:06Z", "sources": [] }
  ]
}
```

---

#### `POST /api/chat/message` — **STREAMING SSE**
JWT required. Proxies streaming chat response from FastAPI to frontend.

**Request:**
```json
{
  "thread_id": "uuid-thread",
  "form_id":   "uuid-form",
  "message":   "What are the most common complaints this month?"
}
```

**What Node does:**
```javascript
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
```

**Stream format (what frontend receives):**
```
data: {"type":"token","token":"The"}

data: {"type":"token","token":" most"}

data: {"type":"token","token":" common complaints..."}

data: {"type":"done","sources":[],"message_count":4}

```

For Phase 2 (RAG), `sources` will be populated:
```json
{ "type": "done", "sources": [{ "response_id": "uuid", "submitted_at": "2026-04-12", "snippet": "food was cold..." }], "message_count": 4 }
```

For Phase 3 (data tool), an additional event type appears:
```json
{ "type": "chart", "chart_type": "bar", "data": { "labels": [...], "datasets": [...] } }
```

---

#### `GET /api/chat/threads`
JWT required. Node reads MongoDB `chat_threads` directly — no FastAPI call.

**Response `200`:**
```json
{
  "threads": [
    {
      "thread_id":     "uuid",
      "form_id":       "uuid",
      "form_title":    "Dining Experience Feedback",
      "message_count": 14,
      "last_message":  "What are complaints about food?",
      "updated_at":    "2026-05-01T10:05:00Z"
    }
  ]
}
```

**Node code:**
```javascript
const ChatThread = require('../models/chat_thread.model');
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
```

---

#### `GET /api/chat/thread/:form_id`
JWT required. Returns full thread for a specific form. Node reads MongoDB directly.

**Response `200`:** Full thread object with `messages` array.

```javascript
const thread = await ChatThread.findOne({
  business_id: req.business.business_id,
  form_id:     req.params.form_id
}).lean();

if (!thread) return res.json({ thread: null, is_new: true });
res.json({ thread });
```

---

### 5.7 QR API

---

#### `GET /api/qr/:form_id`
JWT required. Returns just the `public_url` for the form. Frontend generates the QR image client-side.

**Response `200`:**
```json
{
  "qr_id":      "uuid",
  "form_id":    "uuid",
  "form_title": "Dining Experience Feedback",
  "public_url": "https://insightloop.vercel.app/feedback.html?form_id=uuid",
  "created_at": "2026-05-10T05:18:47.000Z"
}
```

No `qr_image_url` or `qr_data_url` fields. Frontend uses `public_url` with `qrcode.js` library.

---

## 6. The Submission Flow — Fixed

This is the complete, correct submission flow after all bugs are fixed.

```
Customer on feedback.html
  │
  │  1. GET /api/feedback/form/:form_id
  │     → Node reads MySQL: feedback_forms + questions
  │     → Returns form schema with question_id, label, type for each question
  │
  │  2. Customer fills form, clicks Submit
  │     Frontend builds answers object:
  │     { "uuid-q1": { "value": 4 }, "uuid-q2": { "value": "Food was cold." } }
  │
  │  3. POST /api/responses/submit
  │     Body: { form_id, answers }
  │
  ▼
Node (responses.controller.js)
  │
  ├── Look up form in MySQL → get business_id + question labels/types
  ├── Enrich each answer: { label, type, value } per question_id
  ├── Build MongoDB document with ai_analysis.status: "pending"
  ├── Save to MongoDB (responseDoc.save())
  ├── Return 201 to customer immediately ← customer sees Thank You
  │
  └── Fire-and-forget: POST {AI_SERVICE_URL}/analyze
      Body: { response_id, form_id, business_id, submitted_at, answers (enriched map) }
      Header: X-Internal-Secret

                                  ▼
                           FastAPI (ai-service)
                           ├── Run LangGraph pipeline
                           ├── Analyze text, compute urgency, generate summary
                           ├── Store embedding in Qdrant
                           ├── $set update MongoDB: ai_analysis.status = "done" + all fields
                           └── Check alert thresholds → write to MySQL alerts if triggered
```

---

## 7. Chat System — How Node Proxies the Stream

### Node Side

Node's `POST /api/chat/message` does one thing: proxy the SSE stream from FastAPI to the frontend without buffering. The implementation is in Section 5.6.

### Frontend Side (chat.js)

```javascript
async function sendMessage(threadId, formId, message) {
  // Show user message immediately
  appendUserMessage(message);
  showTypingIndicator();

  const response = await fetch(`${API_BASE}/api/chat/message`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${Auth.getToken()}`
    },
    body: JSON.stringify({ thread_id: threadId, form_id: formId, message })
  });

  hideTypingIndicator();
  const bubble = createEmptyAIBubble(); // creates chat bubble element
  let fullText = '';

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      try {
        const event = JSON.parse(line.slice(6)); // strip "data: "

        if (event.type === 'token') {
          fullText += event.token;
          bubble.querySelector('.message-text').textContent = fullText;
          scrollToBottom();
        }

        if (event.type === 'chart') {
          // Phase 3 — render inline chart
          renderInlineChart(bubble, event.chart_type, event.data);
        }

        if (event.type === 'done') {
          renderSources(bubble, event.sources || []);
          // update message count if needed
        }

        if (event.type === 'error') {
          bubble.querySelector('.message-text').textContent = event.message;
          bubble.classList.add('message-error');
        }
      } catch (e) { /* skip malformed chunks */ }
    }
  }
}

function renderSources(bubble, sources) {
  if (!sources.length) return;
  const div = document.createElement('div');
  div.className = 'message-sources';
  sources.forEach(s => {
    const chip = document.createElement('span');
    chip.className = 'source-chip';
    chip.textContent = `${s.submitted_at} — "${s.snippet.slice(0, 60)}..."`;
    div.appendChild(chip);
  });
  bubble.appendChild(div);
}

function renderInlineChart(bubble, chartType, data) {
  const canvas = document.createElement('canvas');
  canvas.style.maxWidth = '100%';
  bubble.appendChild(canvas);
  new Chart(canvas, {
    type: chartType,
    data: data,
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: {
        x: { ticks: { color: '#475569' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#475569' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}
```

### Chat Page Load Sequence

```javascript
// 1. Page load
Auth.requireAuth();
const forms   = await apiFetch('/api/forms');
const threads = await apiFetch('/api/chat/threads');
renderFormSelector(forms.forms);
renderThreadSidebar(threads.threads);

// 2. User selects a form from dropdown
async function onFormSelect(formId) {
  const data = await apiFetch('/api/chat/thread/' + formId);
  if (data.thread) {
    activeThreadId = data.thread.thread_id;
    renderMessageHistory(data.thread.messages);
  } else {
    // First time — create thread
    const newThread = await apiFetch('/api/chat/thread', {
      method: 'POST',
      body: JSON.stringify({ form_id: formId })
    });
    activeThreadId = newThread.thread_id;
    showSuggestedPrompts(); // show example questions when chat is empty
  }
}
```

---

## 8. What to Skip

| Feature | Decision |
|---|---|
| Report generation (PDF) | ❌ Skip entirely — remove from frontend navigation |
| Admin panel | ❌ Skip from frontend and college report — code stays but don't feature it |
| Email OTP verification | ❌ Skip — registration works without it |
| Logo upload | ❌ Skip — profile page shows name/industry/phone only |
| Response pagination | ❌ Skip — client-side filtering is enough for demo data volume |
| `/api/feedback/submit` (old MySQL route) | ❌ Remove from routes |
| `/api/ai/*` routes (old chat) | ❌ Remove from routes |
| `public_routes.js` HTML serving | ❌ Remove from app.js |

---

## Quick Checklist for Purvi

**Bugs to fix:**
- [ ] Remove `POST /api/feedback/submit` route registration from `feedback.routes.js`
- [ ] Remove MySQL response functions from `feedback.model.js` (keep only `getPublicForm`)
- [ ] Add AI service fire-and-forget call to `responses.controller.js` `submitResponse`
- [ ] Add `per_text_analysis` field to `response.model.js`
- [ ] Add compound indexes to `response.model.js`
- [ ] Fix `alerts.routes.js` — put `/read-all` before `/:alert_id/read`
- [ ] Remove `app.use('/api/ai', aiRoutes)` from `app.js`
- [ ] Remove `/form` public HTML routes from `app.js`
- [ ] Fix `public_url` in QR generation to use `process.env.FRONTEND_BASE_URL` + `/feedback.html?form_id=`

**New to build:**
- [ ] `models/chat_thread.model.js`
- [ ] `controllers/chat.controller.js` (4 functions: getOrCreateThread, sendMessage/stream proxy, listThreads, getThread)
- [ ] `routes/chat.routes.js`
- [ ] Register `app.use('/api/chat', chatRoutes)` in `app.js`
- [ ] `controllers/analytics.controller.js` — implement all 4 analytics functions with MongoDB aggregations
- [ ] `controllers/alerts.controller.js` — if not already done
- [ ] Verify `auth.controller.js` has `updateProfile` and `changePassword` implemented

---

*End of Document*