# InsightLoop — Node.js Backend: Exhaustive Technical Documentation

> **Project**: InsightLoop — AI-Powered Feedback Intelligence Platform  
> **Component**: Node.js + Express.js Backend (REST API Server)  
> **Institution**: Shri Vaishnav Vidyapeeth Vishwavidyalaya (SVVV), Indore  
> **Programme**: B.Tech Minor Project  
> **Last Updated**: 17 May 2026

---

## Table of Contents

1. [Component Overview](#1-component-overview)
2. [Technology Stack](#2-technology-stack)
3. [Folder & File Structure](#3-folder--file-structure)
4. [Environment Variables](#4-environment-variables)
5. [Database Architecture](#5-database-architecture)
6. [All API Endpoints — Complete Reference](#6-all-api-endpoints--complete-reference)
7. [The Feedback Submission Flow — Critical](#7-the-feedback-submission-flow--critical)
8. [Analytics — MongoDB Aggregations](#8-analytics--mongodb-aggregations)
9. [Chat Proxy — SSE Streaming](#9-chat-proxy--sse-streaming)
10. [Changes from Original Plan](#10-changes-from-original-plan)
11. [Problems Faced & How They Were Solved](#11-problems-faced--how-they-were-solved)
12. [Deployment](#12-deployment)
13. [What Was Skipped or Dropped](#13-what-was-skipped-or-dropped)

---

## 1. Component Overview

### 1.1 What This Component Does

The Node.js backend is the **primary application server** for InsightLoop. It is responsible for:

| Responsibility | Description |
|---|---|
| **Authentication & Authorisation** | Business owner registration, login, JWT token issuance and verification |
| **Form Management** | CRUD operations for feedback forms and their questions |
| **QR Code Records** | Generating and storing public URL records so customers can access feedback forms |
| **Response Ingestion** | Accepting customer feedback submissions, enriching answer data, persisting to MongoDB |
| **AI Service Coordination** | Fire-and-forget calls to the FastAPI AI microservice for sentiment analysis |
| **Analytics Aggregation** | Running MongoDB aggregation pipelines and MySQL queries to power the dashboard |
| **Alert Management** | Reading alerts written by FastAPI, marking them as read |
| **Chat Proxy** | Proxying Server-Sent Events (SSE) streaming chat responses from FastAPI to the frontend |
| **Report Generation** | Placeholder report endpoint (PDF generation was dropped) |
| **Admin Panel** | Platform admin routes for managing businesses (built but not featured) |

### 1.2 Who Consumes It

| Consumer | How |
|---|---|
| **Frontend (Vercel)** | Calls all REST API endpoints via `fetch` / `axios` with JWT in `Authorization` header |
| **Public Feedback Page** | Calls `GET /api/feedback/form/:form_id` (no auth) and `POST /api/responses/submit` (no auth) |

### 1.3 Who It Calls

| Downstream Service | Protocol | Purpose |
|---|---|---|
| **MySQL (AlwaysData)** | TCP via `mysql2/promise` | Auth, form config, questions, QR records, alerts, reports, admins |
| **MongoDB Atlas** | TCP via Mongoose ODM | Response documents, chat thread documents |
| **FastAPI AI Service (Render)** | HTTP via `axios` | `POST /analyze` (fire-and-forget), `POST /chat/thread`, `POST /chat/message` (SSE stream) |

### 1.4 Runtime

- **Framework**: Express.js 4.x on Node.js
- **Local Port**: `5000`
- **Production Deployment**: Render (free-tier Web Service)

---

## 2. Technology Stack

### 2.1 Production Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.18.2 | Web framework — routing, middleware pipeline, request/response handling |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing — allows the Vercel frontend to call the Render backend |
| `helmet` | ^7.0.0 | Security headers — sets `X-Content-Type-Options`, `Strict-Transport-Security`, etc. |
| `dotenv` | ^16.3.1 | Loads `.env` file into `process.env` at startup |
| `mysql2` | ^3.6.0 | MySQL driver — used via `mysql2/promise` for async/await connection pool |
| `mongoose` | ^7.5.0 | MongoDB ODM — schema definitions, indexes, and query helpers for Atlas |
| `bcryptjs` | ^2.4.3 | Password hashing — `genSalt(10)` + `hash()` for registration, `compare()` for login |
| `jsonwebtoken` | ^9.0.2 | JWT creation (`sign`) and verification (`verify`) for business and admin auth |
| `axios` | ^1.15.1 | HTTP client — calls FastAPI `/analyze`, `/chat/thread`, `/chat/message`, `/summary` |
| `express-rate-limit` | ^7.1.0 | Rate limiting middleware (installed but not currently wired into routes) |
| `multer` | ^1.4.5-lts.1 | Multipart form-data parsing (installed for future file upload support, not actively used) |
| `nodemailer` | ^8.0.7 | Email sending (installed for future email OTP verification, not actively used) |

### 2.2 Development Dependencies

| Package | Version | Purpose |
|---|---|---|
| `nodemon` | ^3.0.1 | Auto-restarts server on file changes during development |

### 2.3 Built-in Node.js Modules Used

| Module | Usage |
|---|---|
| `crypto` | `crypto.randomUUID()` — generates UUIDs for `business_id` and `response_id` |
| `path` | `path.join()` — resolves file paths for static file serving and report storage |
| `fs` | `fs.existsSync()`, `fs.mkdirSync()`, `fs.writeFileSync()` — report placeholder file creation |

---

## 3. Folder & File Structure

```
backend/
├── .env                              — Environment variables (secrets, DB credentials, URLs)
├── .gitignore                        — Git ignore rules (node_modules, .env, uploads, logs)
├── package.json                      — NPM manifest with dependencies and scripts
├── package-lock.json                 — Locked dependency tree
├── uploads/
│   └── qrcodes/                      — Legacy directory (QR images no longer generated here)
│
└── src/
    ├── app.js                        — Express app initialisation, middleware stack, route
    │                                   registrations, DB connections, server startup
    │
    ├── config/
    │   ├── db.js                     — MySQL connection pool (mysql2/promise) with
    │   │                               connectMySQL() and getPool() exports
    │   └── mongo.js                  — Mongoose connection with connectMongo() export
    │
    ├── middleware/
    │   ├── auth.js                   — verifyToken: JWT verification for business owner
    │   │                               routes; attaches decoded payload to req.business
    │   ├── adminAuth.js              — verifyAdminToken: separate JWT verification for
    │   │                               admin routes; checks for admin_id in payload
    │   └── errorHandler.js           — Global error handler; returns structured JSON with
    │                                   stack trace in development mode
    │
    ├── models/
    │   ├── business.model.js         — MySQL: findByEmail, findById, create, update,
    │   │                               updatePassword, findAll
    │   ├── form.model.js             — MySQL: findAllByBusiness, findById, create,
    │   │                               addQuestion, update, delete
    │   ├── qr.model.js              — MySQL: findByFormId, findById, create, deleteByFormId
    │   │                               (stores only public_url — no image)
    │   ├── feedback.model.js         — MySQL: getPublicForm only (response functions removed;
    │   │                               MongoDB handles responses now)
    │   ├── response.model.js         — MongoDB Mongoose schema for the "responses" collection
    │   ├── chat_thread.model.js      — MongoDB Mongoose schema for the "chat_threads"
    │   │                               collection
    │   └── admin.model.js            — MySQL: findByEmail, findById, create
    │
    ├── controllers/
    │   ├── auth.controller.js        — register, login, logout, getProfile, updateProfile,
    │   │                               changePassword
    │   ├── forms.controller.js       — getAllForms, createForm, getFormById, updateForm,
    │   │                               deleteForm
    │   ├── qr.controller.js          — getQRCode (route handler), generateQR (internal helper)
    │   ├── feedback.controller.js    — getFormForCustomer (public form JSON schema)
    │   ├── responses.controller.js   — submitResponse, getResponsesByForm, getResponseById,
    │   │                               getResponsesByBusiness, callAIService (internal helper)
    │   ├── analytics.controller.js   — getDashboardStats, getSentimentTrend,
    │   │                               getFormsPerformance, getRecentResponses, getFormAnalytics
    │   ├── alerts.controller.js      — getAlerts, markAlertRead, markAllAlertsRead
    │   ├── chat.controller.js        — getOrCreateThread, chatMessage (SSE proxy),
    │   │                               listThreads, getThread
    │   ├── reports.controller.js     — generateReport (placeholder), getAllReports,
    │   │                               downloadReport
    │   ├── admin.controller.js       — login, getAllBusinesses, getPlatformStats,
    │   │                               suspendBusiness, deleteBusiness
    │   └── ai.controller.js          — LEGACY: queryAI, getChatSessions, getChatSession,
    │                                   deleteChatSession (file exists but routes not
    │                                   registered in app.js)
    │
    ├── routes/
    │   ├── auth.routes.js            — POST register, login; POST logout, GET me,
    │   │                               PUT profile, PUT change-password (JWT)
    │   ├── forms.routes.js           — GET /, POST /, GET /:form_id, PUT /:form_id,
    │   │                               DELETE /:form_id (all JWT)
    │   ├── qr.routes.js              — GET /:form_id (JWT)
    │   ├── feedback.routes.js        — GET /form/:form_id (public, no auth)
    │   ├── responses.routes.js       — POST /submit (public); GET /form/:form_id,
    │   │                               GET /business/:business_id, GET /:response_id (JWT)
    │   ├── analytics.routes.js       — GET /dashboard, /sentiment-trend,
    │   │                               /forms-performance, /recent-responses,
    │   │                               /form/:form_id (all JWT)
    │   ├── alerts.routes.js          — GET /; PATCH /read-all (registered BEFORE
    │   │                               /:alert_id/read); PATCH /:alert_id/read (all JWT)
    │   ├── chat.routes.js            — POST /thread, POST /message, GET /threads,
    │   │                               GET /thread/:form_id (all JWT)
    │   ├── reports.routes.js         — POST /generate, GET /, GET /:report_id/download
    │   │                               (all JWT)
    │   ├── admin.routes.js           — POST /login (public); GET /businesses, /stats;
    │   │                               PATCH /businesses/:id/suspend; DELETE /businesses/:id
    │   │                               (admin JWT)
    │   ├── ai.routes.js              — LEGACY: file exists but NOT registered in app.js
    │   └── public.routes.js          — LEGACY: server-rendered HTML feedback form (725 lines);
    │                                   NOT registered in app.js — frontend uses Vercel-hosted
    │                                   feedback.html now
    │
    └── utils/                        — Empty directory (reserved for future utility functions)
```

### 3.1 Files Not Registered in app.js (Legacy Code)

| File | Status | Reason |
|---|---|---|
| `ai.routes.js` + `ai.controller.js` | Present on disk, NOT active | Replaced by `chat.routes.js` + `chat.controller.js` |
| `public.routes.js` | Present on disk, NOT active | 725-line server-rendered HTML form; replaced by Vercel-hosted `feedback.html` |

---

## 4. Environment Variables

The `.env` file contains the following variables:

| Variable | Example Value | Purpose |
|---|---|---|
| `PORT` | `5000` | HTTP port the Express server listens on |
| `NODE_ENV` | `development` | Controls error handler stack trace output (`development` shows stack) |
| `DB_HOST` | `mysql-shub.alwaysdata.net` | MySQL server hostname (AlwaysData cloud) |
| `DB_PORT` | `3306` | MySQL server port |
| `DB_USER` | `shub` | MySQL username |
| `DB_PASSWORD` | `********` | MySQL password |
| `DB_NAME` | `shub_insightloop` | MySQL database name |
| `MONGO_URI` | `mongodb+srv://...@mongo-insight.l9wwcnw.mongodb.net/insightloop` | MongoDB Atlas connection string |
| `JWT_SECRET` | `your_jwt_secret_key_change_this` | Secret key for `jsonwebtoken.sign()` and `verify()` |
| `AI_SERVICE_URL` | `http://localhost:8000` (local) / Render URL (prod) | Base URL for the FastAPI AI microservice |
| `BASE_URL` | `http://localhost:5000` | Backend's own URL (used for self-referencing) |
| `FRONTEND_BASE_URL` | `https://insight-loop-svvv.vercel.app/` | Vercel frontend URL — used to construct QR `public_url` values |

> **Note**: `INTERNAL_SECRET` is referenced in code (`X-Internal-Secret` header sent to FastAPI) but is not present in the current `.env` file. It must be set in the Render dashboard for production.

---

## 5. Database Architecture

### 5.1 MySQL — Relational Data (AlwaysData Cloud)

MySQL stores all **structured, relational data** with fixed schemas: authentication credentials, form configuration, normalised questions, QR records, alerts, reports, and admin accounts.

#### 5.1.1 `businesses` Table

Stores registered business owner accounts.

```sql
CREATE TABLE businesses (
  business_id   VARCHAR(36)   PRIMARY KEY,
  name          VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  industry      VARCHAR(100)  DEFAULT NULL,
  phone         VARCHAR(20)   DEFAULT NULL,
  logo_url      VARCHAR(500)  DEFAULT NULL,
  is_active     BOOLEAN       DEFAULT TRUE,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

- `business_id` is generated in Node via `crypto.randomUUID()`
- `password_hash` is bcrypt hash with salt factor 10
- `is_active` is used by admin suspend functionality

#### 5.1.2 `feedback_forms` Table

Stores form configuration (title, description, active status).

```sql
CREATE TABLE feedback_forms (
  form_id       VARCHAR(36)   PRIMARY KEY DEFAULT (UUID()),
  business_id   VARCHAR(36)   NOT NULL,
  title         VARCHAR(255)  NOT NULL,
  description   TEXT          DEFAULT NULL,
  is_active     BOOLEAN       DEFAULT TRUE,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE
);
```

- `form_id` is generated by MySQL via `DEFAULT (UUID())` — requires MySQL 8.0+

#### 5.1.3 `questions` Table

Stores individual questions belonging to a form.

```sql
CREATE TABLE questions (
  question_id    VARCHAR(36)                             PRIMARY KEY DEFAULT (UUID()),
  form_id        VARCHAR(36)                             NOT NULL,
  question_text  TEXT                                    NOT NULL,
  question_type  ENUM('text', 'rating', 'yesno')        NOT NULL DEFAULT 'text',
  order_index    INT                                     NOT NULL DEFAULT 0,
  is_required    BOOLEAN                                 DEFAULT TRUE,
  created_at     TIMESTAMP                               DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

> **Critical Design Note**: `question_id` values (UUIDs) serve as the **keys** in MongoDB's `answers` map. This is the bridge between the relational schema and the document store.

#### 5.1.4 `qr_codes` Table

Stores one QR record per form — only the public URL, no image.

```sql
CREATE TABLE qr_codes (
  qr_id       VARCHAR(36)   PRIMARY KEY DEFAULT (UUID()),
  form_id     VARCHAR(36)   NOT NULL UNIQUE,
  public_url  VARCHAR(500)  NOT NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

#### 5.1.5 `alerts` Table

Stores alerts written by FastAPI AI service, read by Node.

```sql
CREATE TABLE alerts (
  alert_id    VARCHAR(36)   PRIMARY KEY DEFAULT (UUID()),
  business_id VARCHAR(36)   NOT NULL,
  form_id     VARCHAR(36)   DEFAULT NULL,
  alert_type  VARCHAR(50)   NOT NULL,
  message     TEXT          NOT NULL,
  is_read     BOOLEAN       DEFAULT FALSE,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE SET NULL
);
```

#### 5.1.6 `reports` Table

Exists but feature was dropped — stores placeholder report records.

```sql
CREATE TABLE reports (
  report_id    VARCHAR(36)   PRIMARY KEY,
  business_id  VARCHAR(36)   NOT NULL,
  form_id      VARCHAR(36)   DEFAULT NULL,
  title        VARCHAR(255)  NOT NULL,
  report_type  VARCHAR(50)   DEFAULT 'custom',
  file_path    VARCHAR(500)  DEFAULT NULL,
  generated_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE SET NULL
);
```

#### 5.1.7 `admins` Table

Platform admin accounts — built but not featured.

```sql
CREATE TABLE admins (
  admin_id      VARCHAR(36)   PRIMARY KEY,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
```

### 5.2 MongoDB — Document Data (Atlas)

MongoDB stores all **dynamic/variable-schema data** that changes shape per form.

#### 5.2.1 `responses` Collection — Mongoose Schema

```javascript
const responseSchema = new mongoose.Schema({
  response_id:  { type: String, required: true, unique: true, index: true },
  form_id:      { type: String, required: true, index: true },
  business_id:  { type: String, required: true, index: true },
  submitted_at: { type: Date, default: Date.now },

  // Dynamic keys — each key is a question UUID
  answers: { type: mongoose.Schema.Types.Mixed, required: true },

  ai_analysis: {
    status:            { type: String, default: 'pending',
                         enum: ['pending', 'processing', 'done', 'failed'] },
    processed_at:      { type: Date, default: null },
    retry_count:       { type: Number, default: 0 },
    overall_sentiment: { type: String, default: null },   // positive | neutral | negative
    urgency:           { type: String, default: null },    // low | medium | high
    is_complaint:      { type: Boolean, default: false },
    dominant_topic:    { type: String, default: null },
    summary:           { type: String, default: null },
    sentiment_score:   { type: Number, default: null },
    key_phrases:       { type: [String], default: [] },
    per_text_analysis: { type: mongoose.Schema.Types.Mixed, default: null }
    // per_text_analysis structure (written by FastAPI):
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
}, {
  collection: 'responses',
  timestamps: false,
  versionKey: false
});

// Compound indexes for analytics performance
responseSchema.index({ form_id: 1, submitted_at: -1 });
responseSchema.index({ business_id: 1, submitted_at: -1 });
responseSchema.index({ form_id: 1, 'ai_analysis.overall_sentiment': 1 });
responseSchema.index({ form_id: 1, 'ai_analysis.urgency': 1 });
responseSchema.index({ business_id: 1, 'ai_analysis.status': 1 });
```

#### 5.2.2 `chat_threads` Collection — Mongoose Schema

```javascript
const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  sources: [{
    response_id:  String,
    submitted_at: String,
    snippet:      String
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

// Indexes
chatThreadSchema.index({ business_id: 1, form_id: 1 }, { unique: true });
chatThreadSchema.index({ business_id: 1, updated_at: -1 });
```

### 5.3 Why Both Databases Are Needed

| Concern | MySQL | MongoDB |
|---|---|---|
| **Schema** | Fixed, relational | Flexible, document-based |
| **Best for** | Auth, form config, normalised questions, FK constraints | Responses (shape changes per form), chat threads |
| **Key advantage** | Referential integrity via foreign keys, JOIN capability | Dynamic answer keys (question UUIDs), nested AI analysis objects |
| **Example** | `questions` table with `form_id` FK → `feedback_forms` | `answers: { "uuid-q1": { label, type, value }, ... }` |

The fundamental reason: each form has different questions, so each response has a **different set of answer keys**. MySQL would require EAV (Entity-Attribute-Value) tables which are cumbersome. MongoDB's flexible schema handles this naturally.

---

## 6. All API Endpoints — Complete Reference

### 6.0 Health Check

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Returns `{ status: 'ok', timestamp }` |

---

### 6.1 Auth Routes (`/api/auth`)

#### `POST /api/auth/register` — Register a new business

- **Auth**: None (public)
- **Called by**: Registration page

**Request Body:**
```json
{
  "name": "Cafe Delight",
  "email": "owner@cafedelight.com",
  "password": "SecureP@ss123",
  "industry": "Food & Beverage",
  "phone": "+91-9876543210"
}
```

**Success Response (201):**
```json
{
  "message": "Registration successful.",
  "business": {
    "business_id": "a1b2c3d4-...",
    "name": "Cafe Delight",
    "email": "owner@cafedelight.com"
  }
}
```

**Error Responses:**
- `400` — `"Name, email, and password are required."`
- `409` — `"Email already registered."`

**Controller Steps:**
1. Validate required fields (`name`, `email`, `password`)
2. Check if email already exists via `BusinessModel.findByEmail()`
3. Hash password with `bcrypt.genSalt(10)` + `bcrypt.hash()`
4. Generate UUID via `crypto.randomUUID()`
5. Insert into `businesses` table
6. Return 201 with business info (no token — user must login separately)

---

#### `POST /api/auth/login` — Login

- **Auth**: None (public)

**Request Body:**
```json
{ "email": "owner@cafedelight.com", "password": "SecureP@ss123" }
```

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "business": {
    "business_id": "a1b2c3d4-...",
    "name": "Cafe Delight",
    "email": "owner@cafedelight.com"
  }
}
```

**Error Responses:**
- `400` — `"Email and password are required."`
- `401` — `"Invalid email or password."`

**Controller Steps:**
1. Find business by email
2. Compare password with bcrypt
3. Sign JWT with `{ business_id, email, name }`, expires in `7d`

---

#### `POST /api/auth/logout` — Logout

- **Auth**: JWT required
- **Note**: JWT is stateless; client removes the token. This endpoint returns a success message.

---

#### `GET /api/auth/me` — Get Profile

- **Auth**: JWT required

**Success Response:**
```json
{
  "business": {
    "business_id": "...", "name": "Cafe Delight", "email": "...",
    "industry": "Food & Beverage", "phone": "...", "logo_url": null,
    "is_active": 1, "created_at": "...", "updated_at": "..."
  }
}
```

---

#### `PUT /api/auth/profile` — Update Profile

- **Auth**: JWT required

**Request Body:**
```json
{ "name": "Cafe Delight Premium", "industry": "Hospitality", "phone": "...", "logo_url": "..." }
```

All fields are optional — uses `COALESCE` to only update provided fields.

---

#### `PUT /api/auth/change-password` — Change Password

- **Auth**: JWT required

**Request Body:**
```json
{ "current_password": "OldP@ss", "new_password": "NewP@ss" }
```

**Error Responses:**
- `400` — Missing fields
- `401` — Current password incorrect

---

### 6.2 Form Routes (`/api/forms`)

All routes require JWT.

#### `GET /api/forms` — List all forms

**Response:**
```json
{
  "forms": [
    {
      "form_id": "uuid", "business_id": "uuid", "title": "Customer Satisfaction",
      "description": "...", "is_active": 1, "created_at": "...", "updated_at": "..."
    }
  ]
}
```

---

#### `POST /api/forms` — Create form with questions and QR

This is a **composite operation** that creates the form, inserts all questions, and generates a QR code record in a single API call.

**Request Body:**
```json
{
  "title": "Customer Satisfaction Survey",
  "description": "Help us improve our service",
  "questions": [
    { "question_text": "Rate your experience", "question_type": "rating", "order_index": 0, "is_required": true },
    { "question_text": "Would you visit again?", "question_type": "yesno", "order_index": 1, "is_required": true },
    { "question_text": "Any suggestions?", "question_type": "text", "order_index": 2, "is_required": false }
  ]
}
```

**Success Response (201):**
```json
{
  "message": "Form created successfully.",
  "form": {
    "form_id": "uuid", "business_id": "uuid", "title": "...",
    "description": "...", "is_active": 1, "created_at": "...",
    "questions": [
      { "question_id": "uuid", "form_id": "uuid", "question_text": "...",
        "question_type": "rating", "order_index": 0, "is_required": 1 }
    ]
  },
  "qr_code": {
    "qr_id": "uuid",
    "public_url": "https://insight-loop-svvv.vercel.app/feedback.html?form_id=uuid",
    "created_at": "..."
  }
}
```

**Controller Steps:**
1. Validate title and at least one question
2. Insert form into `feedback_forms` (MySQL generates UUID via `DEFAULT (UUID())`)
3. Loop through questions → `FormModel.addQuestion()` for each
4. Call `generateQR(form_id)` → constructs `FRONTEND_BASE_URL/feedback.html?form_id=...` and inserts into `qr_codes`
5. Return 201 with form, questions, and QR data

---

#### `GET /api/forms/:form_id` — Get single form with questions

Returns form details plus all questions sorted by `order_index`.

---

#### `PUT /api/forms/:form_id` — Update form

**Request Body:** `{ "title": "Updated Title", "description": "Updated desc" }`

---

#### `DELETE /api/forms/:form_id` — Delete form

Cascades to questions via FK `ON DELETE CASCADE`.

---

### 6.3 QR Route (`/api/qr`)

#### `GET /api/qr/:form_id` — Get QR code info

- **Auth**: JWT required

**Response:**
```json
{
  "qr_id": "uuid", "form_id": "uuid",
  "form_title": "Customer Satisfaction Survey",
  "public_url": "https://insight-loop-svvv.vercel.app/feedback.html?form_id=uuid",
  "created_at": "..."
}
```

**Note**: No image is returned. The frontend generates the QR image client-side using `qrcode.js` library from the `public_url`.

---

### 6.4 Feedback Route (`/api/feedback`) — Public

#### `GET /api/feedback/form/:form_id` — Get form schema for customers

- **Auth**: None (public)
- **Called by**: `feedback.html` on Vercel

**Response:**
```json
{
  "form": {
    "form_id": "uuid", "title": "Customer Satisfaction",
    "description": "Help us improve", "business_name": "Cafe Delight",
    "logo_url": null,
    "questions": [
      { "question_id": "uuid", "question_text": "Rate your experience",
        "question_type": "rating", "is_required": 1, "order_index": 0 }
    ]
  }
}
```

Only returns forms where `is_active = TRUE`. JOINs with `businesses` table to get `business_name` and `logo_url`.

---

### 6.5 Response Routes (`/api/responses`)

#### `POST /api/responses/submit` — Submit feedback (PUBLIC)

- **Auth**: None (public — called by customers)
- **This is THE correct submission endpoint** (see Section 7)

**Request Body:**
```json
{
  "form_id": "uuid-of-the-form",
  "answers": {
    "uuid-question-id-1": { "value": 4 },
    "uuid-question-id-2": { "value": "The biryani arrived cold." },
    "uuid-question-id-3": { "value": false }
  }
}
```

**Success Response (201):**
```json
{
  "message": "Thank you for your feedback!",
  "response_id": "uuid",
  "submitted_at": "2026-05-17T10:30:00.000Z"
}
```

**Error Responses:**
- `400` — Missing `form_id`, empty answers, missing required question, invalid rating (not 1-5)
- `404` — Form not found
- `410` — Form no longer accepting responses (`is_active = 0`)

*(Full flow documented in Section 7)*

---

#### `GET /api/responses/form/:form_id` — Get all responses for a form

- **Auth**: JWT required
- **Response**: `{ count: N, responses: [...] }`

---

#### `GET /api/responses/:response_id` — Get single response

- **Auth**: JWT required

---

#### `GET /api/responses/business/:business_id` — Get all responses for a business

- **Auth**: JWT required

---

### 6.6 Analytics Routes (`/api/analytics`)

All routes require JWT. Full aggregation pipelines documented in Section 8.

#### `GET /api/analytics/dashboard` — Dashboard statistics

Returns all stat cards, sentiment breakdown, urgency breakdown, and top topics in one call.

**Response:**
```json
{
  "stat_cards": {
    "total_responses": 142,
    "responses_this_week": 23,
    "responses_today": 5,
    "active_forms": 3,
    "complaints_this_month": 8,
    "unread_alerts": 2
  },
  "positive_rate": {
    "current_30d": 72.5,
    "previous_30d": 65.0,
    "delta": 7.5
  },
  "sentiment_breakdown_30d": { "positive": 58, "neutral": 15, "negative": 7 },
  "urgency_breakdown_30d": { "low": 45, "medium": 25, "high": 10 },
  "top_topics_30d": [
    { "topic": "food quality", "count": 18 },
    { "topic": "service speed", "count": 12 }
  ]
}
```

---

#### `GET /api/analytics/sentiment-trend` — Sentiment over time

**Query Params**: `days` (7|30|90, default 30), `form_id` (optional filter)

**Response:**
```json
{
  "days": 30,
  "trend": [
    { "date": "2026-04-17", "positive": 3, "neutral": 1, "negative": 0 },
    { "date": "2026-04-18", "positive": 0, "neutral": 0, "negative": 0 }
  ]
}
```

Zero-fills all dates in range even if no responses exist for that day.

---

#### `GET /api/analytics/forms-performance` — Per-form stats

**Response:**
```json
{
  "forms": [
    {
      "form_id": "uuid", "title": "...", "is_active": true,
      "total_responses": 50, "positive_count": 30, "neutral_count": 12,
      "negative_count": 8, "positive_pct": 60.0, "complaint_count": 5,
      "last_response_at": "2026-05-17T..."
    }
  ]
}
```

---

#### `GET /api/analytics/recent-responses` — Recent responses

**Query Params**: `limit` (default 15, max 50)

---

#### `GET /api/analytics/form/:form_id` — Deep form analytics

**Response** includes: `stats`, `sentiment_breakdown`, `urgency_breakdown`, `top_topics`, `rating_distribution`.

---

### 6.7 Alert Routes (`/api/alerts`)

All require JWT.

#### `GET /api/alerts` — Get unread alerts

**Response:**
```json
{
  "alerts": [
    {
      "alert_id": "uuid", "form_id": "uuid", "form_title": "...",
      "alert_type": "negative_spike", "message": "...",
      "is_read": false, "created_at": "..."
    }
  ],
  "unread_count": 2
}
```

---

#### `PATCH /api/alerts/read-all` — Mark all as read

> **Important**: This route is registered BEFORE `/:alert_id/read` to avoid Express matching `read-all` as an `alert_id` parameter.

---

#### `PATCH /api/alerts/:alert_id/read` — Mark one as read

---

### 6.8 Chat Routes (`/api/chat`)

All require JWT. Documented in detail in Section 9.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat/thread` | Get or create a chat thread for a form (proxies to FastAPI) |
| `POST` | `/api/chat/message` | Send message and stream AI response via SSE (proxies to FastAPI) |
| `GET` | `/api/chat/threads` | List all threads for this business (reads MongoDB directly) |
| `GET` | `/api/chat/thread/:form_id` | Get full thread for a specific form (reads MongoDB directly) |

---

### 6.9 Report Routes (`/api/reports`)

All require JWT. **Feature is a placeholder — PDF generation was dropped.**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/reports/generate` | Creates a placeholder text file, saves record to `reports` table |
| `GET` | `/api/reports` | Lists all reports for this business |
| `GET` | `/api/reports/:report_id/download` | Downloads the report file |

---

### 6.10 Admin Routes (`/api/admin`)

**Built but not featured in final product.**

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/admin/login` | None | Admin login (separate from business login) |
| `GET` | `/api/admin/businesses` | Admin JWT | List all registered businesses |
| `GET` | `/api/admin/stats` | Admin JWT | Platform-wide statistics |
| `PATCH` | `/api/admin/businesses/:id/suspend` | Admin JWT | Set `is_active = FALSE` |
| `DELETE` | `/api/admin/businesses/:id` | Admin JWT | Delete business and cascaded data |

> **Note**: Admin login currently compares password as plain text (`WHERE email = ? AND password_hash = ?`) — this was a development shortcut and would need `bcrypt.compare` for production use.

---

## 7. The Feedback Submission Flow — Critical

This section documents the most important data flow in the entire system.

### 7.1 The Two Submission Routes Problem

During development, **two separate submission pathways** existed simultaneously:

| File | Route | Storage | Status |
|---|---|---|---|
| `feedback.controller.js` | `POST /api/feedback/submit` | MySQL (`feedback_responses` + `answers` tables) | **REMOVED** — old approach |
| `responses.controller.js` | `POST /api/responses/submit` | MongoDB (`responses` collection) | **ACTIVE** — current approach |

**How the conflict was identified**: Responses submitted via the old MySQL route were invisible to the analytics dashboard (which queries MongoDB). The root cause was that the original architecture stored responses in MySQL, but the analytics system was built to aggregate from MongoDB.

**Resolution**:
1. `submitFeedback` function was removed from `feedback.controller.js`
2. `POST /submit` was unregistered from `feedback.routes.js`
3. All response-related functions (createResponse, createAnswer, saveAnalysis) were removed from `feedback.model.js`
4. Only `getPublicForm` remains in `feedback.model.js`
5. `POST /api/responses/submit` in `responses.routes.js` is the sole active submission endpoint

### 7.2 The Correct Submission Flow — Step by Step

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Customer   │────▶│  feedback.html│────▶│  Node.js     │────▶│   MongoDB    │
│  (phone/QR)  │     │  (Vercel)    │     │  Backend     │     │   Atlas      │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                │ fire-and-forget
                                                ▼
                                          ┌──────────────┐
                                          │   FastAPI    │
                                          │  AI Service  │
                                          └──────────────┘
                                                │
                                                │ $set update
                                                ▼
                                          ┌──────────────┐
                                          │   MongoDB    │
                                          │   Atlas      │
                                          └──────────────┘
```

**Detailed Steps:**

1. **Customer scans QR / opens link** → arrives at `feedback.html` on Vercel with `?form_id=uuid` in the URL
2. **feedback.html calls** `GET /api/feedback/form/:form_id` → gets form title, description, questions with their UUIDs, types, and labels
3. **Customer fills out the form and submits** → JavaScript collects answers as `{ "uuid-q": { value: ... } }` and POSTs to `POST /api/responses/submit`
4. **Node looks up form in MySQL** → `FormModel.findById(form_id)` retrieves the form with all questions (gets `business_id`, question labels, types)
5. **Node enriches each answer**:
   ```javascript
   enrichedAnswers[questionId] = {
     label: question.question_text,    // e.g., "Rate your experience"
     type:  question.question_type,    // e.g., "rating"
     value: rawValue                   // e.g., 4
   };
   ```
6. **Node validates**: rating values must be 1-5, required questions must be present
7. **Node saves MongoDB document** with `ai_analysis.status = "pending"`
8. **Node returns 201 immediately** — customer sees "Thank You!" screen
9. **Fire-and-forget**: `axios.post` to FastAPI `/analyze` with the enriched answers map:
   ```javascript
   axios.post(`${AI_SERVICE_URL}/analyze`, {
     response_id, form_id, business_id, submitted_at,
     answers: enrichedAnswers  // full map with label + type + value
   }, {
     headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET },
     timeout: 30000
   });
   ```
10. **FastAPI processes asynchronously** → uses `$set` to update `ai_analysis` fields (overall_sentiment, urgency, is_complaint, dominant_topic, summary, key_phrases, per_text_analysis, etc.) and sets `status = "done"`

### 7.3 Why the Enriched Answers Map Matters

| Property | Purpose |
|---|---|
| **question_id as key** | Links MySQL schema (question definition) to MongoDB data (answer value) |
| **label stored with answer** | Makes documents self-describing — anyone reading MongoDB can understand what "Rate your experience: 4" means without a MySQL lookup |
| **type stored with answer** | Allows FastAPI to handle `text` answers differently from `rating` or `yesno` — only text answers get NLP analysis |
| **FastAPI independence** | FastAPI reads the enriched map directly — it never needs to query MySQL |

---

## 8. Analytics — MongoDB Aggregations

### 8.1 Dashboard Stats (`getDashboardStats`)

This endpoint runs **MySQL and MongoDB queries in parallel** using `Promise.all` for maximum performance.

**MySQL Queries (2 parallel):**
```sql
-- Active forms count
SELECT COUNT(*) as active_forms FROM feedback_forms WHERE business_id = ? AND is_active = 1;

-- Unread alerts count
SELECT COUNT(*) as unread_alerts FROM alerts WHERE business_id = ? AND is_read = 0;
```

**MongoDB Queries (8 parallel):**

```javascript
// 1. Total response count
Response.countDocuments({ business_id })

// 2. Responses this week (Monday midnight start)
Response.countDocuments({ business_id, submitted_at: { $gte: weekStart } })

// 3. Responses today
Response.countDocuments({ business_id, submitted_at: { $gte: todayMidnight } })

// 4. Complaints this month
Response.countDocuments({ business_id, 'ai_analysis.is_complaint': true, submitted_at: { $gte: monthStart } })

// 5. Sentiment breakdown — last 30 days
Response.aggregate([
  { $match: { business_id, 'ai_analysis.status': 'done', submitted_at: { $gte: thirtyDaysAgo } } },
  { $group: { _id: '$ai_analysis.overall_sentiment', count: { $sum: 1 } } }
])

// 6. Sentiment breakdown — previous 30 days (30-60 days ago, for delta calculation)
Response.aggregate([
  { $match: { business_id, 'ai_analysis.status': 'done',
              submitted_at: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } } },
  { $group: { _id: '$ai_analysis.overall_sentiment', count: { $sum: 1 } } }
])

// 7. Urgency breakdown — last 30 days
Response.aggregate([
  { $match: { business_id, 'ai_analysis.status': 'done', submitted_at: { $gte: thirtyDaysAgo } } },
  { $group: { _id: '$ai_analysis.urgency', count: { $sum: 1 } } }
])

// 8. Top 6 topics — last 30 days
Response.aggregate([
  { $match: { business_id, 'ai_analysis.status': 'done',
              'ai_analysis.dominant_topic': { $exists: true, $ne: null },
              submitted_at: { $gte: thirtyDaysAgo } } },
  { $group: { _id: '$ai_analysis.dominant_topic', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 6 }
])
```

**Post-processing in Node:**
- Converts sentiment aggregation array `[{_id: 'positive', count: 58}, ...]` → object `{ positive: 58, neutral: 15, negative: 7 }`
- Calculates `positive_rate` as percentage: `(positive / total) * 100` for both current and previous 30-day windows
- Computes `delta` = current rate − previous rate

### 8.2 Sentiment Trend (`getSentimentTrend`)

```javascript
const match = {
  business_id: businessId,
  'ai_analysis.status': 'done',
  submitted_at: { $gte: startDate }
};
if (req.query.form_id) match.form_id = req.query.form_id;  // optional filter

Response.aggregate([
  { $match: match },
  { $group: {
      _id: {
        date: { $dateToString: { format: '%Y-%m-%d', date: '$submitted_at' } },
        sentiment: '$ai_analysis.overall_sentiment'
      },
      count: { $sum: 1 }
  }},
  { $sort: { '_id.date': 1 } }
])
```

**Post-processing:**
1. Pivots results into `{ date, positive, neutral, negative }` objects
2. Generates complete date range using `generateDateRange()` helper
3. Zero-fills missing dates: `dateMap[date] || { date, positive: 0, neutral: 0, negative: 0 }`

### 8.3 Forms Performance (`getFormsPerformance`)

**Step 1 — MySQL**: Fetch all forms for this business
```sql
SELECT form_id, title, is_active FROM feedback_forms WHERE business_id = ?
```

**Step 2 — MongoDB** (2 aggregations):
```javascript
// Per-form sentiment + complaint counts (analyzed responses only)
Response.aggregate([
  { $match: { business_id, 'ai_analysis.status': 'done' } },
  { $group: {
      _id: { form_id: '$form_id', sentiment: '$ai_analysis.overall_sentiment' },
      count: { $sum: 1 },
      complaint_count: { $sum: { $cond: [{ $eq: ['$ai_analysis.is_complaint', true] }, 1, 0] } },
      last_response_at: { $max: '$submitted_at' }
  }}
])

// Total counts per form (all responses, including unanalyzed)
Response.aggregate([
  { $match: { business_id } },
  { $group: { _id: '$form_id', total_responses: { $sum: 1 }, last_response_at: { $max: '$submitted_at' } } }
])
```

**Step 3 — Merge**: Joins MySQL form titles with MongoDB stats; calculates `positive_pct`.

### 8.4 Recent Responses (`getRecentResponses`)

```javascript
// MongoDB — top N newest responses
Response.find({ business_id }).sort({ submitted_at: -1 }).limit(limit).lean()
```

Then batch-fetches form titles from MySQL:
```sql
SELECT form_id, title FROM feedback_forms WHERE form_id IN (?, ?, ...)
```

Maps each response to `{ response_id, form_id, form_title, submitted_at, sentiment, urgency, is_complaint, dominant_topic, summary }`.

### 8.5 Form Analytics (`getFormAnalytics`)

Form-scoped deep analytics with **6 parallel MongoDB queries**:

```javascript
Promise.all([
  Response.countDocuments({ form_id: formId }),
  // Sentiment aggregation
  Response.aggregate([
    { $match: { form_id: formId, 'ai_analysis.status': 'done' } },
    { $group: { _id: '$ai_analysis.overall_sentiment', count: { $sum: 1 } } }
  ]),
  // Urgency aggregation
  Response.aggregate([
    { $match: { form_id: formId, 'ai_analysis.status': 'done' } },
    { $group: { _id: '$ai_analysis.urgency', count: { $sum: 1 } } }
  ]),
  // Complaint count
  Response.countDocuments({ form_id: formId, 'ai_analysis.is_complaint': true }),
  // Top 10 topics
  Response.aggregate([
    { $match: { form_id: formId, 'ai_analysis.status': 'done',
                'ai_analysis.dominant_topic': { $exists: true, $ne: null } } },
    { $group: { _id: '$ai_analysis.dominant_topic', count: { $sum: 1 } } },
    { $sort: { count: -1 } }, { $limit: 10 }
  ]),
  // All responses for rating_distribution
  Response.find({ form_id: formId }).select('answers').lean()
])
```

**`rating_distribution`** is computed in Node (not in MongoDB aggregation):
```javascript
allResponses.forEach(doc => {
  Object.values(doc.answers).forEach(answer => {
    if (answer.type === 'rating' && answer.label && answer.value != null) {
      if (!rating_distribution[answer.label])
        rating_distribution[answer.label] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      rating_distribution[answer.label][String(answer.value)]++;
    }
  });
});
```

---

## 9. Chat Proxy — SSE Streaming

### 9.1 Why Node Doesn't Generate Chat Responses

The Node.js backend does **not** directly interact with any LLM. The FastAPI AI microservice owns:
- The vector store (FAISS/ChromaDB) with embedded response data
- The LLM integration (Google Gemini / OpenAI)
- RAG (Retrieval-Augmented Generation) logic
- Chat history management within threads

Node acts purely as an **authenticated proxy**: it verifies the business owner's JWT, forwards the request to FastAPI, and streams the response back.

### 9.2 SSE Pipe Implementation (`chatMessage`)

```javascript
const chatMessage = async (req, res, next) => {
  const { thread_id, form_id, message } = req.body;
  const business_id = req.business.business_id;

  // 1. Set SSE headers BEFORE piping
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // ← CRITICAL for Render/nginx

  // 2. Call FastAPI with responseType: 'stream'
  const fastApiResponse = await axios.post(
    `${process.env.AI_SERVICE_URL}/chat/message`,
    { thread_id, form_id, business_id, message },
    {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET },
      responseType: 'stream',
      timeout: 60000
    }
  );

  // 3. Pipe the stream directly — zero buffering in Node
  fastApiResponse.data.pipe(res);

  // 4. Handle stream lifecycle
  fastApiResponse.data.on('end', () => res.end());
  fastApiResponse.data.on('error', (err) => {
    console.error('[Chat] Stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed.' });
  });
};
```

**Key design decisions:**
- `X-Accel-Buffering: no` tells Render's nginx reverse proxy to **not** buffer the response — without this, the entire stream arrives at once
- `responseType: 'stream'` in axios returns a Node.js Readable stream instead of buffering the full response
- `.pipe(res)` connects the FastAPI stream directly to the client response — Node does not parse or buffer any SSE data

### 9.3 Chat History — Who Reads, Who Writes

| Operation | Handled by | Database |
|---|---|---|
| **Create thread** | FastAPI (via `/chat/thread`) | Writes to MongoDB `chat_threads` |
| **Add messages** | FastAPI (via `/chat/message`) | Writes to MongoDB `chat_threads` |
| **List threads** | Node (via `GET /api/chat/threads`) | Reads from MongoDB directly |
| **Get thread** | Node (via `GET /api/chat/thread/:form_id`) | Reads from MongoDB directly |

FastAPI writes; Node reads. No duplication, no sync issues.

### 9.4 Thread Creation (`getOrCreateThread`)

```javascript
// 1. Validate form exists and belongs to this business (MySQL)
const [rows] = await pool.query(
  'SELECT title, business_id FROM feedback_forms WHERE form_id = ?', [form_id]
);
if (rows[0].business_id !== business_id)
  return res.status(403).json({ error: 'Unauthorized: Form does not belong to this business.' });

// 2. Proxy to FastAPI
const fastApiResponse = await axios.post(
  `${AI_SERVICE_URL}/chat/thread`,
  { business_id, form_id, form_title: rows[0].title },
  { headers: { 'X-Internal-Secret': INTERNAL_SECRET }, timeout: 15000 }
);

res.json(fastApiResponse.data);
```

---

## 10. Changes from Original Plan

### Change 1: MySQL-only Responses → MongoDB Responses

| Aspect | Original | Current |
|---|---|---|
| Storage | MySQL `feedback_responses` + `answers` tables | MongoDB `responses` collection |
| Reason | Response schema is dynamic (different questions per form) | MongoDB's flexible schema handles this naturally |
| Remnants | `feedback.model.js` still exists but only has `getPublicForm`; `feedback.controller.js` only has `getFormForCustomer` |
| Old code | `submitFeedback`, `createResponse`, `createAnswer`, `saveAnalysis` — all removed |

### Change 2: QR Image Generation Removed

| Aspect | Original | Current |
|---|---|---|
| Generation | `qrcode` npm package generated PNG files saved to `/uploads/qrcodes/` | Only `public_url` stored in DB |
| Storage | `qr_codes` table had `qr_image_path`, `qr_data_url` columns | Only `qr_id`, `form_id`, `public_url`, `created_at` |
| Rendering | Backend returned base64 data URL | Frontend generates QR image client-side using `qrcode.js` library |
| Note | `qrcode` npm package was removed from `package.json` | `uploads/qrcodes/` directory still exists but is empty |

### Change 3: `/api/ai/*` Routes Replaced by `/api/chat/*`

| Aspect | Old (`ai.controller.js`) | New (`chat.controller.js`) |
|---|---|---|
| Approach | Session-based, multi-session per business | Thread-per-form, one thread per (business_id, form_id) pair |
| Data model | `AIQuery` + `ChatSession` Mongoose schemas defined inline | `ChatThread` schema in separate `chat_thread.model.js` |
| Streaming | No streaming — waited for full response | SSE streaming via `pipe()` |
| Registration | `ai.routes.js` NOT registered in `app.js` | `chat.routes.js` registered at `/api/chat` |
| Files | `ai.controller.js` and `ai.routes.js` still exist on disk | Active code lives in `chat.controller.js` and `chat.routes.js` |

### Change 4: Reports Endpoint Is a Placeholder

- `POST /api/reports/generate` exists and is functional
- It creates a placeholder text file (`"Report placeholder"`) instead of a real PDF
- It attempts to call `FastAPI /summary` for AI-generated text, but that endpoint may not exist on FastAPI
- No PDF generation library was integrated (e.g., no `pdfkit` or `puppeteer`)
- `GET /api/reports` and `GET /api/reports/:report_id/download` work correctly with the placeholder files

### Change 5: Admin Panel Built but Not Featured

- All admin routes, controllers, middleware, and model functions are complete and functional
- Admin login, business listing, platform stats, suspend, and delete all work
- Dropped from the final product scope to simplify demonstration
- **Known issue**: Admin login compares password as plain text instead of using bcrypt

---

## 11. Problems Faced & How They Were Solved

### Problem 1: `question_id` Integers vs UUIDs

**What happened**: Initially, the `questions` table used auto-increment integer IDs. When MongoDB response documents used these as answer map keys (e.g., `answers: { "1": {...}, "2": {...} }`), it created ambiguity — integer keys could collide across forms and were not globally unique.

**Solution**: Changed `question_id` from `INT AUTO_INCREMENT` to `VARCHAR(36) DEFAULT (UUID())`. This ensures each question has a globally unique UUID that serves as a reliable key in MongoDB's answer map.

**Impact**: Required updating all existing data and any code referencing integer question IDs.

### Problem 2: MySQL `DEFAULT (UUID())` Requires MySQL 8.0+

**What happened**: The `DEFAULT (UUID())` expression syntax is only supported in MySQL 8.0 and later. Earlier versions of MySQL do not support function calls in DEFAULT clauses.

**Solution**: Ensured the AlwaysData cloud MySQL instance runs MySQL 8.0+. For environments with older MySQL, the UUID generation would need to be moved to the application layer (Node.js `crypto.randomUUID()`).

### Problem 3: MongoDB `$set` Update Stripping `per_text_analysis`

**What happened**: When FastAPI used `$set` to update the `ai_analysis` field in MongoDB, the `per_text_analysis` sub-field was being written successfully to MongoDB but was **stripped when read through Mongoose** because the schema didn't include it.

**Root cause**: Mongoose enforces schema by default — any field not defined in the schema is silently dropped when reading documents.

**Solution**: Added `per_text_analysis` as `mongoose.Schema.Types.Mixed` in `response.model.js`:
```javascript
per_text_analysis: {
  type: mongoose.Schema.Types.Mixed,
  default: null
}
```

### Problem 4: `alerts.routes.js` Route Conflict

**What happened**: `PATCH /:alert_id/read` was registered before `PATCH /read-all`. When the frontend called `PATCH /api/alerts/read-all`, Express matched it as `/:alert_id/read` with `alert_id = "read-all"`, which returned a 404.

**Solution**: Reordered the routes in `alerts.routes.js` — `/read-all` is now registered **before** `/:alert_id/read`:
```javascript
router.patch('/read-all', verifyToken, alertsController.markAllAlertsRead);     // ← FIRST
router.patch('/:alert_id/read', verifyToken, alertsController.markAlertRead);   // ← SECOND
```

### Problem 5: CORS in Production

**What happened**: The Vercel frontend (`https://insight-loop-svvv.vercel.app`) could not call the Render backend due to CORS policy blocking cross-origin requests.

**Solution**: Configured CORS in `app.js`:
```javascript
app.use(cors());  // Currently allows all origins
```

For production hardening, this should be restricted to:
```javascript
app.use(cors({ origin: process.env.FRONTEND_BASE_URL }));
```

### Problem 6: SSE Responses Buffered by Render's Nginx

**What happened**: Chat streaming responses from FastAPI were arriving at the frontend **all at once** instead of token-by-token. The SSE stream was being buffered by Render's nginx reverse proxy.

**Solution**: Added the `X-Accel-Buffering: no` header in the chat controller:
```javascript
res.setHeader('X-Accel-Buffering', 'no');
```

This nginx-specific header instructs the proxy to pass through chunks immediately without buffering.

---

## 12. Deployment

### 12.1 Platform Architecture

| Component | Hosting | Tier |
|---|---|---|
| **Node.js Backend** | Render (Web Service) | Free |
| **MySQL Database** | AlwaysData Cloud | Free |
| **MongoDB Database** | MongoDB Atlas | Free (M0 Shared) |
| **FastAPI AI Service** | Render (Web Service) | Free |
| **Frontend** | Vercel | Free |

### 12.2 Render Configuration

- **Build Command**: `npm install`
- **Start Command**: `node src/app.js`
- **Environment Variables**: Set in Render Dashboard (same as `.env` but with production values)
  - `AI_SERVICE_URL` → Render URL of FastAPI service
  - `FRONTEND_BASE_URL` → `https://insight-loop-svvv.vercel.app/`
  - `INTERNAL_SECRET` → shared secret with FastAPI
  - `MONGO_URI` → Atlas connection string
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` → AlwaysData credentials

### 12.3 Cold Start Behaviour

Render free tier spins down services after 15 minutes of inactivity. The first request after idle triggers a **cold start** that takes approximately 15-30 seconds:
1. Render provisions the container
2. `npm install` runs (cached)
3. Node process starts
4. MySQL and MongoDB connections are established
5. Express begins listening

Subsequent requests are fast (~100-500ms).

### 12.4 MySQL (AlwaysData)

- **Host**: `mysql-shub.alwaysdata.net`
- **Port**: 3306
- **Connection pool**: 10 connections max, queue unlimited
- The connection pool is created at startup via `connectMySQL()` and reused for all requests

### 12.5 MongoDB (Atlas)

- **Cluster**: `mongo-insight.l9wwcnw.mongodb.net`
- **Database**: `insightloop`
- **Collections**: `responses`, `chat_threads`
- Connection established at startup via `connectMongo()` (Mongoose)
- Automatic reconnection handled by Mongoose's built-in event listeners

---

## 13. What Was Skipped or Dropped

| Feature | Status | Reason |
|---|---|---|
| **MySQL-based response storage** | Replaced by MongoDB | Dynamic schema requirement — different questions per form |
| **Report PDF generation** | Placeholder only | No PDF generation library integrated; no file storage solution set up |
| **Admin panel** | Built, not featured | Dropped from final scope to simplify demonstration |
| **Email OTP verification** | `nodemailer` installed, not used | Registration flow simplified to email+password only |
| **Logo upload** | `multer` installed, not used | Profile accepts `logo_url` string but no file upload endpoint exists |
| **Rate limiting** | `express-rate-limit` installed, not wired | Not configured in middleware stack |
| **Server-rendered feedback form** | `public.routes.js` exists (725 lines) | Replaced by Vercel-hosted `feedback.html`; route not registered in `app.js` |
| **Old AI session routes** | `ai.routes.js` + `ai.controller.js` exist | Replaced by `chat.routes.js` + `chat.controller.js` |
| **Token blacklisting** | Comment in `logout` controller | JWT is stateless; logout only returns success message |

---

> **End of Document**  
> This documentation covers the complete InsightLoop Node.js backend as of 17 May 2026.  
> For frontend API integration details, refer to the separate Frontend API Guide.  
> For AI microservice documentation, refer to the FastAPI Service Guide.
