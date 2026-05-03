# InsightLoop – Complete Implementation Blueprint

> This document is the single source of truth for building InsightLoop.  
> It covers every page, every database table, every API route, and every service.  
> No definitions. No theory. Just what to build and how.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository & Folder Structure](#2-repository--folder-structure)
3. [Database Design](#3-database-design)
   - [MySQL Schemas](#31-mysql-schemas)
   - [MongoDB Collections](#32-mongodb-collections)
4. [Frontend Pages](#4-frontend-pages)
   - [Public Pages](#41-public-pages-no-login-required)
   - [Business Owner Pages](#42-business-owner-pages-login-required)
   - [Admin Pages](#43-admin-pages)
   - [Public Feedback Form Page](#44-public-feedback-submission-page-customers)
5. [Node/Express Backend](#5-nodeexpress-backend)
   - [Project Structure](#51-project-structure)
   - [All API Routes](#52-all-api-routes)
   - [Middleware](#53-middleware)
6. [FastAPI AI Microservice](#6-fastapi-ai-microservice)
   - [Project Structure](#61-project-structure)
   - [All AI Endpoints](#62-all-ai-endpoints)
   - [LangGraph Pipeline](#63-langgraph-pipeline)
   - [RAG System](#64-rag-system)
7. [Communication Between Services](#7-communication-between-services)
8. [Environment Variables](#8-environment-variables)
9. [Build Order / What to Build First](#9-build-order--what-to-build-first)

---

## 1. System Overview

InsightLoop has **three separate parts** that run independently and talk to each other:

| Part | Technology | Who Builds | Responsibility |
|---|---|---|---|
| Frontend | HTML, CSS, JS, Bootstrap, GSAP | Purvi + Samia | All UI pages |
| Backend | Node.js + Express | Purvi | Auth, forms, QR, storage, business logic |
| AI Microservice | Python + FastAPI | Shubhranshu | NLP, embeddings, RAG, agents |

**Data flow in one line:**  
Customer scans QR → fills form → Node backend saves to MySQL → calls FastAPI → FastAPI analyzes, stores embeddings in vector DB → Business owner sees insights on dashboard → can query via AI chat

---

## 2. Repository & Folder Structure

One GitHub repo, three folders.

```
insightloop/
│
├── frontend/                   # All HTML/CSS/JS files (Purvi + Samia)
│   ├── public/
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── register.html
│   │   ├── dashboard.html
│   │   ├── forms.html
│   │   ├── form-builder.html
│   │   ├── form-preview.html
│   │   ├── analytics.html
│   │   ├── ai-chat.html
│   │   ├── reports.html
│   │   ├── profile.html
│   │   ├── feedback.html          ← PUBLIC: customer fills this
│   │   └── admin/
│   │       ├── admin-login.html
│   │       └── admin-dashboard.html
│   ├── assets/
│   │   ├── css/
│   │   │   ├── main.css
│   │   │   ├── dashboard.css
│   │   │   └── feedback.css
│   │   ├── js/
│   │   │   ├── auth.js
│   │   │   ├── dashboard.js
│   │   │   ├── form-builder.js
│   │   │   ├── analytics.js
│   │   │   ├── ai-chat.js
│   │   │   ├── feedback.js
│   │   │   └── admin.js
│   │   └── img/
│
├── backend/                    # Node.js + Express (Purvi)
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js             ← MySQL connection
│   │   │   └── mongo.js          ← MongoDB connection
│   │   ├── middleware/
│   │   │   ├── auth.js           ← JWT verification
│   │   │   ├── adminAuth.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── forms.routes.js
│   │   │   ├── feedback.routes.js
│   │   │   ├── analytics.routes.js
│   │   │   ├── ai.routes.js      ← Proxy to FastAPI
│   │   │   ├── reports.routes.js
│   │   │   ├── qr.routes.js
│   │   │   └── admin.routes.js
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── forms.controller.js
│   │   │   ├── feedback.controller.js
│   │   │   ├── analytics.controller.js
│   │   │   ├── ai.controller.js
│   │   │   ├── reports.controller.js
│   │   │   └── admin.controller.js
│   │   ├── models/               ← MySQL query functions
│   │   │   ├── business.model.js
│   │   │   ├── form.model.js
│   │   │   ├── feedback.model.js
│   │   │   └── admin.model.js
│   │   └── app.js
│   ├── .env
│   └── package.json
│
├── ai-service/                 # FastAPI Python (Shubhranshu)
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── routes/
│   │   │   ├── analyze.py
│   │   │   ├── embed.py
│   │   │   ├── query.py
│   │   │   └── summary.py
│   │   ├── agents/
│   │   │   ├── sentiment_agent.py
│   │   │   ├── classification_agent.py
│   │   │   ├── urgency_agent.py
│   │   │   ├── alert_agent.py
│   │   │   ├── rag_agent.py
│   │   │   └── summary_agent.py
│   │   ├── pipelines/
│   │   │   └── feedback_pipeline.py  ← LangGraph orchestrator
│   │   ├── rag/
│   │   │   ├── embedder.py
│   │   │   ├── retriever.py
│   │   │   └── vector_store.py
│   │   ├── schemas/
│   │   │   ├── feedback.py
│   │   │   └── query.py
│   │   └── utils/
│   │       └── llm.py
│   ├── .env
│   └── requirements.txt
│
└── README.md
```

---

## 3. Database Design

### 3.1 MySQL Schemas

MySQL handles all **structured relational data** — businesses, forms, questions, responses, analysis results.

---

#### Table: `businesses`

Stores registered business owner accounts.

```sql
CREATE TABLE businesses (
    business_id     VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    industry        VARCHAR(100),
    logo_url        VARCHAR(500),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

#### Table: `feedback_forms`

Each business can create multiple forms.

```sql
CREATE TABLE feedback_forms (
    form_id         VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    business_id     VARCHAR(36) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE
);
```

---

#### Table: `questions`

Questions inside a form. Supports multiple types.

```sql
CREATE TABLE questions (
    question_id     VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    form_id         VARCHAR(36) NOT NULL,
    question_text   TEXT NOT NULL,
    question_type   ENUM('rating', 'text', 'mcq', 'yes_no') NOT NULL,
    options         JSON,              -- for MCQ: ["Option A", "Option B", "Option C"]
    is_required     BOOLEAN DEFAULT TRUE,
    order_index     INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

---

#### Table: `qr_codes`

One QR code per form. Stores the public URL customers visit.

```sql
CREATE TABLE qr_codes (
    qr_id           VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    form_id         VARCHAR(36) NOT NULL UNIQUE,
    public_url      VARCHAR(500) NOT NULL,   -- e.g. https://yourapp.com/feedback/{form_id}
    qr_image_url    VARCHAR(500),            -- path to the saved QR image
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

---

#### Table: `feedback_responses`

Each customer submission is one row here.

```sql
CREATE TABLE feedback_responses (
    response_id     VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    form_id         VARCHAR(36) NOT NULL,
    submitted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address      VARCHAR(50),       -- optional, for spam prevention
    device_info     VARCHAR(255),      -- optional

    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

---

#### Table: `answers`

Individual answers inside a response. One row per question answered.

```sql
CREATE TABLE answers (
    answer_id       VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    response_id     VARCHAR(36) NOT NULL,
    question_id     VARCHAR(36) NOT NULL,
    answer_value    TEXT NOT NULL,     -- "4" for rating, "Food was cold" for text, "Option A" for MCQ

    FOREIGN KEY (response_id) REFERENCES feedback_responses(response_id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(question_id) ON DELETE CASCADE
);
```

---

#### Table: `ai_analysis`

Stores AI-processed insights for each response. Filled by FastAPI after processing.

```sql
CREATE TABLE ai_analysis (
    analysis_id     VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    response_id     VARCHAR(36) NOT NULL UNIQUE,
    sentiment       ENUM('positive', 'neutral', 'negative') NOT NULL,
    sentiment_score FLOAT,             -- e.g. 0.87 confidence
    topic           VARCHAR(255),      -- e.g. "Food Quality", "Staff Behavior"
    urgency         ENUM('low', 'medium', 'high') NOT NULL,
    is_complaint    BOOLEAN DEFAULT FALSE,
    key_phrases     JSON,              -- ["cold food", "slow service"]
    summary         TEXT,             -- 1-2 line AI summary of this response
    processed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (response_id) REFERENCES feedback_responses(response_id) ON DELETE CASCADE
);
```

---

#### Table: `alerts`

Auto-generated alerts when complaint thresholds are hit.

```sql
CREATE TABLE alerts (
    alert_id        VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    business_id     VARCHAR(36) NOT NULL,
    form_id         VARCHAR(36),
    alert_type      VARCHAR(100),      -- e.g. "High Urgency Spike", "Recurring Complaint"
    message         TEXT NOT NULL,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE
);
```

---

#### Table: `reports`

Metadata for generated reports. Actual report files saved to disk/cloud.

```sql
CREATE TABLE reports (
    report_id       VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    business_id     VARCHAR(36) NOT NULL,
    form_id         VARCHAR(36),
    title           VARCHAR(255) NOT NULL,
    report_type     ENUM('weekly', 'monthly', 'custom') DEFAULT 'custom',
    file_path       VARCHAR(500),      -- path to generated PDF
    generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE
);
```

---

#### Table: `admins`

Platform-level admin accounts (separate from business owners).

```sql
CREATE TABLE admins (
    admin_id        VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 3.2 MongoDB Collections

MongoDB handles **flexible, document-based data** — AI chat sessions and query history.

---

#### Collection: `ai_queries`

Each time a business owner asks a question in the AI chat.

```js
{
  _id: ObjectId,
  business_id: "uuid-string",       // links to MySQL businesses table
  form_id: "uuid-string",           // optional: scoped to a specific form
  query_text: "What are the main complaints this month?",
  retrieved_chunks: [               // what RAG retrieved
    "Feedback: Food was cold. Sentiment: Negative.",
    "Feedback: Service was slow. Urgency: High."
  ],
  response_text: "The main complaints this month are about food temperature and slow service...",
  model_used: "claude-sonnet-4-6",
  token_count: 1240,
  created_at: ISODate("2026-03-15T10:30:00Z")
}
```

---

#### Collection: `chat_sessions`

Stores full multi-turn conversation history per session.

```js
{
  _id: ObjectId,
  business_id: "uuid-string",
  session_id: "unique-session-uuid",
  form_id: "uuid-string",           // optional scope
  messages: [
    {
      role: "user",
      content: "What are common complaints?",
      timestamp: ISODate("2026-03-15T10:30:00Z")
    },
    {
      role: "assistant",
      content: "Based on your feedback data, the top complaints are...",
      timestamp: ISODate("2026-03-15T10:30:05Z")
    },
    {
      role: "user",
      content: "Which of these are most urgent?",
      timestamp: ISODate("2026-03-15T10:30:20Z")
    }
  ],
  created_at: ISODate("2026-03-15T10:30:00Z"),
  updated_at: ISODate("2026-03-15T10:35:00Z")
}
```

---

## 4. Frontend Pages

### 4.1 Public Pages (No Login Required)

---

#### `index.html` — Landing Page

**Purpose:** Showcase InsightLoop to potential customers. The first thing anyone sees.

**Sections to build:**
- Navbar with logo + Login + Get Started buttons
- Hero section — headline, subheadline, animated demo screenshot or mockup, CTA button "Start Free"
- Features section — 6 feature cards (Form Builder, QR Collection, AI Analysis, Smart Alerts, AI Chat, Reports)
- How It Works section — 3 steps with icons (Create Form → Collect Feedback → Get Insights)
- Who is it for? — Grid of business types (Restaurant, Clinic, Gym, College etc.)
- Testimonials section (can be static/dummy)
- Footer with links

**Tech notes:**
- Use GSAP for scroll animations on feature cards and hero text
- Use Bootstrap grid for layout
- Sticky navbar that changes appearance on scroll

---

#### `login.html` — Business Owner Login

**Purpose:** Let registered business owners log in.

**What to build:**
- Two-column layout — left side has branding/illustration, right side has the form
- Form fields: Email, Password
- "Remember me" checkbox
- "Forgot password?" link (can be placeholder for now)
- Submit button → POST to `/api/auth/login`
- On success: save JWT token to `localStorage`, redirect to `dashboard.html`
- On error: show error message below form
- Link to `register.html`

---

#### `register.html` — Business Owner Registration

**Purpose:** New business owner creates an account.

**What to build:**
- Same two-column layout as login
- Form fields: Business Name, Email, Password, Confirm Password, Industry (dropdown), Phone (optional)
- Password strength indicator
- Submit button → POST to `/api/auth/register`
- On success: redirect to `login.html` with a success message
- On error: show inline validation errors
- Link back to `login.html`

---

### 4.2 Business Owner Pages (Login Required)

All these pages must check for a valid JWT token in `localStorage` at page load. If not found, redirect to `login.html`.

---

#### `dashboard.html` — Main Dashboard

**Purpose:** The first page after login. Overview of everything.

**What to build:**

Top stats cards row:
- Total Feedback Received (all time)
- Positive / Neutral / Negative % (donut chart)
- Active Forms count
- Unread Alerts count (with red badge)

Sentiment trend chart:
- Line chart showing positive/negative/neutral count per day for last 30 days
- Use Chart.js or Recharts
- Date range filter (Last 7 days / 30 days / 90 days)

Recent Feedback table:
- Columns: Form Name, Submitted At, Sentiment, Topic, Urgency, Action
- Urgency shown as colored badge (Red=High, Yellow=Medium, Green=Low)
- Clicking a row shows full feedback details in a modal

Alerts sidebar or panel:
- List of unread alerts (e.g. "5 high-urgency complaints in last 24 hours")
- Mark as read button

Topic Breakdown:
- Horizontal bar chart or pie chart
- Shows which topics appear most in feedback (Food, Service, Staff, Billing, etc.)

Navbar/Sidebar:
- Logo
- Links: Dashboard, My Forms, Analytics, AI Chat, Reports, Profile
- Logout button

---

#### `forms.html` — My Forms List

**Purpose:** View, manage, and navigate to all feedback forms.

**What to build:**
- "Create New Form" button (top right) → links to `form-builder.html`
- Grid or table of all forms for this business
- Each form card shows:
  - Form title
  - Status toggle (Active / Inactive) — PATCH `/api/forms/:id/status`
  - Number of responses received
  - Date created
  - Buttons: View Analytics | Edit | View QR | Delete

---

#### `form-builder.html` — Create / Edit Feedback Form

**Purpose:** Build a custom feedback form.

**What to build:**

Left panel — Question List:
- Shows all added questions in order
- Drag to reorder (use SortableJS library)
- Click to edit, click X to delete

Right panel — Question Editor:
- Question text input
- Question type dropdown: Rating (1-5 stars), Text (open), MCQ (add options), Yes/No
- If MCQ selected: show "Add Option" fields dynamically with JS
- "Is Required?" toggle
- "Add Question" button

Top section:
- Form title input
- Form description input
- "Save Form" button → POST `/api/forms` or PUT `/api/forms/:id`

On save:
- Form is saved to backend
- QR code is auto-generated by backend
- Show success message with a preview of the QR code
- Option to download QR image

---

#### `analytics.html` — Analytics for a Specific Form

**Purpose:** Deep-dive into feedback data for one form.

**What to build:**

Page takes `form_id` from URL query params (`?form_id=xxx`).

Summary cards:
- Total responses for this form
- Average rating (if rating question exists)
- Positive % / Negative % / Neutral %
- Complaint count

Charts section:
- Sentiment over time (line chart)
- Topic distribution (pie chart)
- Urgency breakdown (bar chart — Low / Medium / High counts)
- Rating distribution (bar chart — 1★ to 5★ count)

Response Table:
- All responses for this form
- Filterable by: Sentiment, Urgency, Topic, Date range
- Each row expandable to show full answers and AI analysis

---

#### `ai-chat.html` — AI Insights Chat

**Purpose:** Business owner types questions in natural language and gets AI answers about their feedback data.

**What to build:**

Left sidebar:
- Dropdown to select which form to query (or "All Forms")
- Chat history — list of previous sessions
- "New Chat" button

Main chat area:
- Messages displayed like a chat interface (user message on right, AI on left)
- AI messages should show "Sources" section at the bottom — small pills showing which feedback entries were retrieved
- Input box at bottom + Send button
- Send → POST to `/api/ai/query` → which proxies to FastAPI `/query`
- Show typing indicator while waiting for AI response
- Streaming response if possible (SSE or websocket)

Example queries to show as suggested prompts:
- "What are the top 3 complaints this month?"
- "Are ratings improving or declining?"
- "What do customers say about staff?"
- "Which issues are most urgent right now?"

---

#### `reports.html` — Reports

**Purpose:** Generate and download feedback reports.

**What to build:**
- Form to configure report: Select form, date range, report type (Weekly / Monthly / Custom)
- "Generate Report" button → POST `/api/reports/generate`
- Show progress indicator while generating
- On completion: show download link for PDF
- Table of previously generated reports with download links

---

#### `profile.html` — Business Profile Settings

**Purpose:** Update business info and account settings.

**What to build:**
- Business name input
- Industry dropdown
- Phone input
- Logo upload input
- Change password section (Current Password, New Password, Confirm New Password)
- Save button → PUT `/api/auth/profile`

---

### 4.3 Admin Pages

Completely separate login. Admin credentials are set manually in the DB.

---

#### `admin/admin-login.html` — Admin Login

- Simple centered login form
- Email + Password
- POST to `/api/admin/login`
- On success: save admin JWT, redirect to `admin-dashboard.html`

---

#### `admin/admin-dashboard.html` — Admin Dashboard

**Purpose:** Monitor the entire platform.

**What to build:**

Stats cards:
- Total registered businesses
- Total feedback forms created
- Total feedback responses (all businesses)
- Total AI queries made today

Businesses table:
- Columns: Business Name, Email, Industry, Date Registered, Forms Count, Responses Count, Status (Active/Inactive), Actions
- Actions: View Details | Suspend | Delete

System usage section:
- Total AI API calls made (read from MongoDB query count)
- Storage usage indicator (feedback, embeddings)

---

### 4.4 Public Feedback Submission Page (Customers)

---

#### `feedback.html` — Customer Feedback Form

**Purpose:** This is the public page customers land on after scanning QR. No login needed.

URL format: `feedback.html?form_id=abc123`

**What to build:**

On page load:
- Fetch form config from GET `/api/feedback/form/:form_id` (public, no auth)
- Dynamically render all questions using JS
- Show business name and form title at top

Question rendering by type:
- **Rating:** Render 5 star icons, user clicks to rate. Highlight selected stars.
- **Text:** Render a `<textarea>`
- **MCQ:** Render radio buttons or styled button group
- **Yes/No:** Render two large styled buttons — Yes / No

Submit button:
- Collect all answers
- POST to `/api/feedback/submit`
- On success: show a "Thank You" screen — animated, friendly message
- Do NOT redirect, replace form content with thank you message in place
- Form is single-page, mobile-first, no navbar needed

**Design notes:**
- Mobile-first — most users scan QR on phone
- Clean, minimal, fast-loading
- Business branding if logo is set
- No GSAP needed here — keep it lightweight

---

## 5. Node/Express Backend

### 5.1 Project Structure

```
backend/
├── src/
│   ├── app.js                    ← Express app setup, middleware, route registration
│   ├── config/
│   │   ├── db.js                 ← MySQL pool using mysql2
│   │   └── mongo.js              ← Mongoose connection
│   ├── middleware/
│   │   ├── auth.js               ← verifyToken: checks JWT in Authorization header
│   │   ├── adminAuth.js          ← verifyAdminToken
│   │   └── errorHandler.js       ← global error handler
│   ├── routes/                   ← Route definitions (thin, delegate to controllers)
│   ├── controllers/              ← Business logic lives here
│   └── models/                   ← Raw SQL query functions (no ORM)
├── .env
└── package.json
```

**Key packages:**
```
express
mysql2
mongoose
bcryptjs
jsonwebtoken
qrcode          ← generates QR code images
axios           ← calls FastAPI
cors
dotenv
helmet
express-rate-limit
multer          ← file uploads (logo)
```

---

### 5.2 All API Routes

#### Auth Routes — `/api/auth`

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Register new business |
| POST | `/api/auth/login` | None | Login, returns JWT |
| POST | `/api/auth/logout` | JWT | Invalidate token (optional) |
| GET | `/api/auth/me` | JWT | Get current business profile |
| PUT | `/api/auth/profile` | JWT | Update business profile |
| PUT | `/api/auth/change-password` | JWT | Change password |

**POST /api/auth/register — Request Body:**
```json
{
  "name": "ABC Restaurant",
  "email": "owner@abc.com",
  "password": "strongpassword",
  "industry": "Restaurant",
  "phone": "9876543210"
}
```

**POST /api/auth/login — Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "business": {
    "business_id": "uuid",
    "name": "ABC Restaurant",
    "email": "owner@abc.com"
  }
}
```

---

#### Form Routes — `/api/forms`

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/forms` | JWT | Get all forms for logged-in business |
| POST | `/api/forms` | JWT | Create a new form |
| GET | `/api/forms/:form_id` | JWT | Get a single form with its questions |
| PUT | `/api/forms/:form_id` | JWT | Update form title/description |
| DELETE | `/api/forms/:form_id` | JWT | Delete a form |
| PATCH | `/api/forms/:form_id/status` | JWT | Toggle active/inactive |
| GET | `/api/forms/:form_id/qr` | JWT | Get QR code for form |

**POST /api/forms — Request Body:**
```json
{
  "title": "Dining Experience Feedback",
  "description": "Help us improve your experience",
  "questions": [
    {
      "question_text": "How would you rate your overall experience?",
      "question_type": "rating",
      "is_required": true,
      "order_index": 0
    },
    {
      "question_text": "What did you enjoy most?",
      "question_type": "mcq",
      "options": ["Food Quality", "Service", "Ambience", "Value for Money"],
      "is_required": true,
      "order_index": 1
    },
    {
      "question_text": "Any additional comments?",
      "question_type": "text",
      "is_required": false,
      "order_index": 2
    }
  ]
}
```

**What the controller does on form creation:**
1. Insert into `feedback_forms`
2. Insert each question into `questions`
3. Generate QR code using `qrcode` package pointing to `{BASE_URL}/feedback.html?form_id={form_id}`
4. Save QR image to `/uploads/qr/` folder
5. Insert into `qr_codes`
6. Return the created form + QR image URL

---

#### Feedback Routes — `/api/feedback`

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/feedback/form/:form_id` | None | **PUBLIC** — get form schema for customer |
| POST | `/api/feedback/submit` | None | **PUBLIC** — submit feedback response |
| GET | `/api/feedback/responses/:form_id` | JWT | Get all responses for a form |
| GET | `/api/feedback/response/:response_id` | JWT | Get one full response with answers |

**POST /api/feedback/submit — Request Body:**
```json
{
  "form_id": "uuid",
  "answers": [
    { "question_id": "uuid", "answer_value": "4" },
    { "question_id": "uuid", "answer_value": "Food Quality" },
    { "question_id": "uuid", "answer_value": "The biryani was amazing but service was a bit slow." }
  ]
}
```

**What the controller does on submit:**
1. Insert into `feedback_responses` — get back `response_id`
2. Insert all answers into `answers`
3. Call FastAPI AI service asynchronously: POST `{AI_SERVICE_URL}/analyze`
4. FastAPI responds with AI analysis — insert into `ai_analysis`
5. Check alert thresholds (if high urgency count in last 24h exceeds limit, insert into `alerts`)
6. Return success to frontend immediately (don't wait for AI if you want faster UX — use fire-and-forget)

---

#### Analytics Routes — `/api/analytics`

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/analytics/dashboard` | JWT | Summary stats for dashboard (all forms) |
| GET | `/api/analytics/form/:form_id` | JWT | Deep analytics for one form |
| GET | `/api/analytics/sentiment-trend` | JWT | Sentiment over time (query param: `form_id`, `days`) |
| GET | `/api/analytics/topics` | JWT | Topic breakdown (query param: `form_id`) |

**GET /api/analytics/dashboard — Response:**
```json
{
  "total_responses": 432,
  "sentiment_breakdown": {
    "positive": 265,
    "neutral": 98,
    "negative": 69
  },
  "active_forms": 3,
  "unread_alerts": 2,
  "top_topics": ["Food Quality", "Service Speed", "Staff Behavior"],
  "avg_rating": 3.8
}
```

---

#### AI Routes — `/api/ai`

These routes proxy to the FastAPI service. Node backend acts as a middleman, adds `business_id` from JWT, then calls FastAPI.

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/ai/query` | JWT | Send a chat query to RAG system |
| GET | `/api/ai/sessions` | JWT | Get all chat sessions for this business |
| GET | `/api/ai/session/:session_id` | JWT | Get full chat history of one session |
| DELETE | `/api/ai/session/:session_id` | JWT | Delete a chat session |

**POST /api/ai/query — Request Body:**
```json
{
  "query": "What are the most common complaints this month?",
  "form_id": "uuid-optional",
  "session_id": "uuid-optional"
}
```

**What the controller does:**
1. Extract `business_id` from JWT
2. POST to `{AI_SERVICE_URL}/query` with `{ query, business_id, form_id, session_id }`
3. FastAPI returns answer + sources
4. Save to MongoDB `ai_queries` and `chat_sessions`
5. Return response to frontend

---

#### Alerts Routes — `/api/alerts`

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/alerts` | JWT | Get all alerts for business |
| PATCH | `/api/alerts/:alert_id/read` | JWT | Mark alert as read |
| DELETE | `/api/alerts/:alert_id` | JWT | Delete alert |

---

#### Reports Routes — `/api/reports`

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/reports/generate` | JWT | Generate a PDF report |
| GET | `/api/reports` | JWT | List all generated reports |
| GET | `/api/reports/:report_id/download` | JWT | Download report PDF |

**POST /api/reports/generate — Request Body:**
```json
{
  "form_id": "uuid",
  "report_type": "monthly",
  "date_from": "2026-03-01",
  "date_to": "2026-03-31"
}
```

---

#### Admin Routes — `/api/admin`

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/login` | None | Admin login |
| GET | `/api/admin/businesses` | Admin JWT | Get all businesses |
| GET | `/api/admin/stats` | Admin JWT | Platform-wide stats |
| PATCH | `/api/admin/businesses/:id/suspend` | Admin JWT | Suspend a business |
| DELETE | `/api/admin/businesses/:id` | Admin JWT | Delete a business |

---

### 5.3 Middleware

#### `auth.js` — JWT Verification

```js
// Attach this to any protected route
// Extracts business_id and attaches to req.business

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]  // "Bearer <token>"

  if (!token) return res.status(401).json({ error: 'Access denied. No token.' })

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' })
    req.business = decoded   // { business_id, email, name }
    next()
  })
}
```

#### Token Structure (what you put inside JWT when logging in):
```js
const token = jwt.sign(
  {
    business_id: business.business_id,
    email: business.email,
    name: business.name
  },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
)
```

---

## 6. FastAPI AI Microservice

### 6.1 Project Structure

```
ai-service/
├── app/
│   ├── main.py              ← FastAPI app, CORS, router registration
│   ├── config.py            ← Loads env vars (LLM key, DB connection, vector DB path)
│   ├── routes/
│   │   ├── analyze.py       ← POST /analyze  — process a single feedback
│   │   ├── embed.py         ← POST /embed    — manually trigger embedding (optional)
│   │   ├── query.py         ← POST /query    — RAG query
│   │   └── summary.py       ← POST /summary  — generate form-level summary
│   ├── agents/
│   │   ├── sentiment_agent.py
│   │   ├── classification_agent.py
│   │   ├── urgency_agent.py
│   │   ├── alert_agent.py
│   │   ├── rag_agent.py
│   │   └── summary_agent.py
│   ├── pipelines/
│   │   └── feedback_pipeline.py   ← LangGraph state graph
│   ├── rag/
│   │   ├── embedder.py            ← converts text to vector
│   │   ├── retriever.py           ← similarity search
│   │   └── vector_store.py        ← FAISS/Chroma setup
│   ├── schemas/
│   │   ├── feedback.py            ← Pydantic models for /analyze
│   │   └── query.py               ← Pydantic models for /query
│   └── utils/
│       └── llm.py                 ← LLM client setup (Anthropic/OpenAI)
├── .env
└── requirements.txt
```

**Key packages (`requirements.txt`):**
```
fastapi
uvicorn
langchain
langchain-anthropic
langgraph
langsmith
faiss-cpu
chromadb
sentence-transformers
pydantic
python-dotenv
httpx
```

---

### 6.2 All AI Endpoints

#### POST `/analyze` — Analyze a Single Feedback Response

Called by Node backend right after a feedback submission is saved.

**Request body:**
```json
{
  "response_id": "uuid",
  "business_id": "uuid",
  "form_id": "uuid",
  "text_answers": [
    "The food was cold and arrived late",
    "Staff were unfriendly"
  ],
  "rating": 2
}
```

**What it does:**
1. Concatenates all text answers into one feedback string
2. Runs it through the LangGraph feedback pipeline (sentiment → topic → urgency → complaint flag)
3. Embeds the feedback text and stores it in the vector DB tagged with `business_id` and `form_id`
4. Returns structured analysis

**Response:**
```json
{
  "response_id": "uuid",
  "sentiment": "negative",
  "sentiment_score": 0.91,
  "topic": "Food Quality",
  "urgency": "high",
  "is_complaint": true,
  "key_phrases": ["cold food", "arrived late", "unfriendly staff"],
  "summary": "Customer experienced cold food with late delivery and unfriendly staff behavior."
}
```

---

#### POST `/query` — RAG-Based Natural Language Query

Called by Node backend when a business owner sends a message in the AI chat.

**Request body:**
```json
{
  "query": "What are the top complaints about food this month?",
  "business_id": "uuid",
  "form_id": "uuid-or-null",
  "chat_history": [
    { "role": "user", "content": "previous message" },
    { "role": "assistant", "content": "previous answer" }
  ]
}
```

**What it does:**
1. Embed the query
2. Search the vector DB filtered by `business_id` (and optionally `form_id`)
3. Retrieve top-K most relevant feedback chunks
4. Build a prompt: `[System instructions] + [Retrieved chunks] + [Chat history] + [Current query]`
5. Call the LLM
6. Return the answer with source references

**Response:**
```json
{
  "answer": "Based on the feedback collected this month, the top complaints about food are: (1) Food arriving cold, mentioned in 12 responses, (2) Portion sizes being too small, mentioned in 8 responses...",
  "sources": [
    {
      "response_id": "uuid",
      "snippet": "Food was cold and arrived late",
      "submitted_at": "2026-03-12T14:30:00Z"
    }
  ],
  "token_usage": 870
}
```

---

#### POST `/summary` — Generate a Form-Level Summary

Called when a report is being generated, or on demand.

**Request body:**
```json
{
  "business_id": "uuid",
  "form_id": "uuid",
  "date_from": "2026-03-01",
  "date_to": "2026-03-31"
}
```

**What it does:**
1. Retrieves all feedback embeddings for this `form_id` in the date range from vector DB
2. Builds a prompt asking for a structured summary
3. Returns a multi-section report text

**Response:**
```json
{
  "summary": {
    "overview": "Your restaurant received 142 feedback responses in March 2026. Overall sentiment was 64% positive, 21% neutral, and 15% negative.",
    "top_positives": ["Food quality praised frequently", "Ambience rated highly"],
    "top_complaints": ["Slow service during peak hours", "Cold food on busy days"],
    "urgent_issues": ["3 customers reported billing errors"],
    "recommendations": ["Consider hiring additional staff for weekends", "Implement food temperature checks before serving"]
  }
}
```

---

### 6.3 LangGraph Pipeline

The feedback pipeline is a **LangGraph state graph**. Each node does one job. If a node fails, it can retry. The graph is deterministic and observable via LangSmith.

**State object flowing through the graph:**

```python
class FeedbackState(TypedDict):
    response_id: str
    business_id: str
    form_id: str
    raw_text: str           # concatenated text answers
    rating: int
    preprocessed_text: str
    sentiment: str
    sentiment_score: float
    topic: str
    urgency: str
    is_complaint: bool
    key_phrases: list[str]
    summary: str
    embedding_stored: bool
    error: str
```

**Graph nodes (in order):**

```
START
  │
  ▼
[preprocess_node]
  Cleans text, normalizes, removes noise
  │
  ▼
[sentiment_node]
  LLM call: classify sentiment as positive/neutral/negative
  Returns: sentiment, sentiment_score
  │
  ▼
[classification_node]
  LLM call: classify topic (Food Quality, Service, Staff, Billing, etc.)
  Returns: topic
  │
  ▼
[urgency_node]
  LLM call: determine urgency level based on keywords and sentiment
  Returns: urgency (low/medium/high)
  │
  ▼
[complaint_flag_node]
  Rule-based + LLM: is_complaint = True if negative + high urgency
  Returns: is_complaint
  │
  ▼
[key_phrases_node]
  Extract key phrases from the feedback text
  Returns: key_phrases list
  │
  ▼
[summary_node]
  Generate a 1-2 sentence human-readable summary
  Returns: summary
  │
  ▼
[embed_and_store_node]
  Embed preprocessed_text + store in vector DB
  Metadata: { response_id, business_id, form_id, sentiment, topic, urgency, submitted_at }
  Returns: embedding_stored = True
  │
  ▼
END
```

**Each node is a Python function** with signature:
```python
def sentiment_node(state: FeedbackState) -> FeedbackState:
    # call LLM, update state, return updated state
    ...
```

---

### 6.4 RAG System

#### How Feedback is Stored in Vector DB

When `embed_and_store_node` runs, it creates a vector document like this:

```python
document = Document(
    page_content=f"Feedback: {state['preprocessed_text']}",
    metadata={
        "response_id": state["response_id"],
        "business_id": state["business_id"],
        "form_id": state["form_id"],
        "sentiment": state["sentiment"],
        "topic": state["topic"],
        "urgency": state["urgency"],
        "submitted_at": datetime.utcnow().isoformat()
    }
)
vector_store.add_documents([document])
```

#### How a Query is Answered

```python
def answer_query(query: str, business_id: str, form_id: str = None, chat_history: list = []):

    # 1. Embed the query
    query_embedding = embedder.embed_query(query)

    # 2. Build filter for this business (and optionally this form)
    filter_dict = {"business_id": business_id}
    if form_id:
        filter_dict["form_id"] = form_id

    # 3. Retrieve top 10 most similar feedback chunks
    retrieved_docs = vector_store.similarity_search_with_filter(
        query_embedding,
        k=10,
        filter=filter_dict
    )

    # 4. Build context string
    context = "\n".join([
        f"- Feedback: {doc.page_content} | Sentiment: {doc.metadata['sentiment']} | Topic: {doc.metadata['topic']} | Urgency: {doc.metadata['urgency']}"
        for doc in retrieved_docs
    ])

    # 5. Build prompt
    system_prompt = """
    You are an AI analytics assistant for InsightLoop.
    You help business owners understand their customer feedback.
    Answer questions strictly based on the feedback data provided.
    Be specific, data-driven, and concise.
    If the data doesn't support an answer, say so honestly.
    """

    # 6. Call LLM with context + chat history + query
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        *chat_history,
        HumanMessage(content=f"Feedback Data:\n{context}\n\nQuestion: {query}")
    ])

    return {
        "answer": response.content,
        "sources": [{"response_id": doc.metadata["response_id"], "snippet": doc.page_content[:100]} for doc in retrieved_docs]
    }
```

---

## 7. Communication Between Services

```
Frontend (Browser)
    │
    │  HTTP (REST API calls, JWT in header)
    ▼
Node/Express Backend  (Port 5000)
    │
    │  Internal HTTP calls using axios (no JWT, uses shared secret or internal network)
    ▼
FastAPI AI Service  (Port 8000)
    │
    ├── FAISS/Chroma Vector DB (local files or managed)
    └── LLM API (Anthropic Claude via API key)
```

**Node calls FastAPI like this:**

```js
const response = await axios.post(`${process.env.AI_SERVICE_URL}/analyze`, {
  response_id,
  business_id,
  form_id,
  text_answers,
  rating
}, {
  headers: { 'X-Internal-Secret': process.env.INTERNAL_SECRET }
})
```

**FastAPI verifies the internal secret:**

```python
@app.middleware("http")
async def verify_internal_secret(request: Request, call_next):
    secret = request.headers.get("X-Internal-Secret")
    if secret != settings.INTERNAL_SECRET:
        return JSONResponse(status_code=403, content={"error": "Forbidden"})
    return await call_next(request)
```

This ensures the FastAPI service is never directly accessible from the internet — only Node can call it.

---

## 8. Environment Variables

#### `backend/.env`

```env
PORT=5000

# MySQL
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=insightloop

# MongoDB
MONGO_URI=mongodb://localhost:27017/insightloop

# JWT
JWT_SECRET=your_super_secret_jwt_key_here

# AI Service
AI_SERVICE_URL=http://localhost:8000
INTERNAL_SECRET=shared_internal_secret_key

# App
BASE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000
```

#### `ai-service/.env`

```env
PORT=8000

# LLM
ANTHROPIC_API_KEY=sk-ant-...

# Internal security
INTERNAL_SECRET=shared_internal_secret_key

# Vector DB
VECTOR_DB_TYPE=faiss          # or "chroma"
VECTOR_DB_PATH=./data/vectorstore

# Embeddings model
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

# LangSmith (monitoring)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=ls__...
LANGCHAIN_PROJECT=insightloop
```

---

## 9. Build Order / What to Build First

Follow this order. Each phase is a working, testable milestone.

---

### Phase 1 — Foundation (Week 1-2)

**Backend (Purvi):**
- [ ] Set up Node/Express project, connect MySQL and MongoDB
- [ ] Create all MySQL tables (run the SQL from Section 3.1)
- [ ] POST `/api/auth/register` — hash password with bcryptjs, insert into businesses
- [ ] POST `/api/auth/login` — verify password, return JWT
- [ ] `auth.js` middleware — JWT verification
- [ ] GET `/api/auth/me` — return logged-in business info

**Frontend (Purvi + Samia):**
- [ ] Build `index.html` — full landing page with GSAP animations
- [ ] Build `register.html` — form + JS to call `/api/auth/register`
- [ ] Build `login.html` — form + JS to call `/api/auth/login`, save token to localStorage
- [ ] Basic `dashboard.html` shell — navbar, sidebar, empty content area

**Test:** Register a business, login, get profile. ✅

---

### Phase 2 — Forms & QR (Week 2-3)

**Backend (Purvi):**
- [ ] POST `/api/forms` — create form with questions, auto-generate QR code
- [ ] GET `/api/forms` — list forms for logged-in business
- [ ] GET `/api/forms/:form_id` — get form details with questions
- [ ] PUT `/api/forms/:form_id` — update
- [ ] DELETE `/api/forms/:form_id`
- [ ] PATCH `/api/forms/:form_id/status`
- [ ] GET `/api/feedback/form/:form_id` — public endpoint for customer to get form

**Frontend (Purvi + Samia):**
- [ ] Build `forms.html` — list of forms, create button
- [ ] Build `form-builder.html` — dynamic question adding, drag to reorder, save
- [ ] Build `feedback.html` — public page that dynamically renders form from API
- [ ] QR code display on form save — show image, download button

**Test:** Create a form, scan QR on phone, see the form render correctly. ✅

---

### Phase 3 — Feedback Collection (Week 3)

**Backend (Purvi):**
- [ ] POST `/api/feedback/submit` — save response + answers to MySQL
- [ ] For now, skip AI call — just save and return success
- [ ] GET `/api/feedback/responses/:form_id`

**Frontend (Samia):**
- [ ] Complete `feedback.html` — all question types render and submit correctly
- [ ] Thank you screen after submit

**Test:** Submit feedback via the form page. See it saved in MySQL. ✅

---

### Phase 4 — AI Pipeline (Week 4-5)

**AI Service (Shubhranshu):**
- [ ] Set up FastAPI project, basic health check endpoint GET `/health`
- [ ] Set up FAISS vector store
- [ ] Set up embedding model
- [ ] Build LangGraph feedback pipeline (all nodes from Section 6.3)
- [ ] POST `/analyze` endpoint — full pipeline, return structured analysis
- [ ] POST embedding to vector store on every analysis

**Backend (Purvi):**
- [ ] After saving feedback response, call `/analyze` via axios
- [ ] Save returned `ai_analysis` data to MySQL
- [ ] Alert check logic — if `high` urgency count in last 24h for a business > threshold, insert alert

**Test:** Submit feedback → see AI analysis appear in `ai_analysis` table. ✅

---

### Phase 5 — Dashboard & Analytics (Week 5-6)

**Backend (Purvi):**
- [ ] GET `/api/analytics/dashboard` — aggregate queries on MySQL
- [ ] GET `/api/analytics/form/:form_id`
- [ ] GET `/api/analytics/sentiment-trend`
- [ ] GET `/api/analytics/topics`
- [ ] GET `/api/alerts`

**Frontend (Purvi + Samia):**
- [ ] Complete `dashboard.html` — stat cards + charts using Chart.js
- [ ] Build `analytics.html` — per-form deep analytics
- [ ] Response table with filters

**Test:** See live sentiment charts populated from real submitted feedback. ✅

---

### Phase 6 — AI Chat (Week 6-7)

**AI Service (Shubhranshu):**
- [ ] POST `/query` — RAG query with chat history (Section 6.4)
- [ ] POST `/summary` — form-level summary

**Backend (Purvi):**
- [ ] POST `/api/ai/query` — proxy to FastAPI, save to MongoDB
- [ ] GET `/api/ai/sessions` — list sessions from MongoDB
- [ ] GET `/api/ai/session/:session_id` — full history

**Frontend (Purvi + Samia):**
- [ ] Build `ai-chat.html` — full chat interface, session management, sources display

**Test:** Ask "What are the top complaints?" and get a real AI answer from your data. ✅

---

### Phase 7 — Reports, Admin, Polish (Week 7-8)

- [ ] Report generation (PDF using `pdfkit` in Node or similar)
- [ ] Admin login + dashboard
- [ ] Profile page
- [ ] Alert display on dashboard
- [ ] LangSmith monitoring for AI service
- [ ] Final UI polish, mobile responsiveness
- [ ] Deploy to Render / Railway / Vercel

---

*End of InsightLoop Implementation Blueprint*