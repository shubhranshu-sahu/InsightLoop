# InsightLoop — Complete Database Design

> Single source of truth for all database structure decisions.  
> Read this before writing any backend code.

---

## Quick Reference

| What | Database | Why |
|---|---|---|
| Business accounts | MySQL | Structured, relational, auth |
| Feedback forms config | MySQL | Structured, relational |
| Questions (form schema) | MySQL | Structured, ordered, relational |
| QR codes | MySQL | Simple key-value, relational |
| Alerts | MySQL | Structured, queryable |
| Reports metadata | MySQL | Structured |
| Admin accounts | MySQL | Structured, auth |
| Feedback responses + AI analysis | **MongoDB** | Variable shape per form |
| AI chat sessions | **MongoDB** | Variable length, document-style |
| AI query log | **MongoDB** | Document-style, flexible |

---

## The Split in One Sentence

**MySQL** owns everything that has a fixed, predictable schema — config, auth, relationships.  
**MongoDB** owns everything whose shape depends on what the business owner decided to put in their form.

---

---

## Part 1 — MySQL Tables

### Table: `businesses`

Business owner accounts. One row per registered business.

```sql
CREATE TABLE businesses (
    business_id     VARCHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    name            VARCHAR(255)    NOT NULL,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,
    phone           VARCHAR(20),
    industry        VARCHAR(100),
    logo_url        VARCHAR(500),
    is_active       BOOLEAN         DEFAULT TRUE,
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

| Column | Notes |
|---|---|
| `business_id` | UUID. Primary key. Used as tenant identifier in all other tables and MongoDB. |
| `email` | Unique. Used for login. |
| `password_hash` | bcryptjs hash. Never store plain text. |
| `industry` | Free text. "Restaurant", "Clinic", "Gym" etc. |
| `logo_url` | Path to uploaded logo file. Nullable. |
| `is_active` | Admin can set false to suspend a business. |

---

### Table: `feedback_forms`

Forms created by business owners. One business can have many forms.

```sql
CREATE TABLE feedback_forms (
    form_id         VARCHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    business_id     VARCHAR(36)     NOT NULL,
    title           VARCHAR(255)    NOT NULL,
    description     TEXT,
    is_active       BOOLEAN         DEFAULT TRUE,
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE
);
```

| Column | Notes |
|---|---|
| `form_id` | UUID. This is the key that links everything — QR, questions, responses. |
| `business_id` | FK to businesses. Tenant isolation: always filter by this. |
| `is_active` | Inactive forms reject new submissions. QR still exists but shows "form closed". |

---

### Table: `questions`

The schema of a form. Each row is one question. This is what the LLM reads to understand what data exists for a form.

```sql
CREATE TABLE questions (
    question_id     VARCHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    form_id         VARCHAR(36)     NOT NULL,
    question_text   VARCHAR(500)    NOT NULL,
    question_type   ENUM(
                        'rating',
                        'text',
                        'yesno'
                    )               NOT NULL,
    order_index     TINYINT         NOT NULL DEFAULT 0,
    is_required     BOOLEAN         DEFAULT TRUE,
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

| Column | Notes |
|---|---|
| `question_id` | UUID. This is used as the key inside MongoDB's `answers` map. Critical link. |
| `question_text` | The label written by the business owner. e.g. "Rate the food quality". This label is what becomes the column name when pandas flattens data, and what the LLM sees as context. |
| `question_type` | Enum. Only three types: `rating` (1–5 int), `text` (string), `yesno` (boolean). |
| `order_index` | Display order on the form. 0-based. |

**Limits enforced at application layer (not DB constraint):**
- Max 5 `rating` questions per form
- Max 3 `text` questions per form
- Max 1 `yesno` question per form

---

### Table: `qr_codes`

One QR code per form. Created automatically when a form is saved.

```sql
CREATE TABLE qr_codes (
    qr_id           VARCHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    form_id         VARCHAR(36)     NOT NULL UNIQUE,
    public_url      VARCHAR(500)    NOT NULL,
    qr_image_path   VARCHAR(500),
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE CASCADE
);
```

| Column | Notes |
|---|---|
| `form_id` | UNIQUE — one form, one QR. |
| `public_url` | The URL encoded in the QR. Format: `{BASE_URL}/feedback?form_id={form_id}` |
| `qr_image_path` | Server path to the generated PNG file. e.g. `/uploads/qr/form_id.png` |

---

### Table: `alerts`

Auto-generated by FastAPI when thresholds are crossed. Shown on business owner dashboard.

```sql
CREATE TABLE alerts (
    alert_id        VARCHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    business_id     VARCHAR(36)     NOT NULL,
    form_id         VARCHAR(36),
    alert_type      VARCHAR(100)    NOT NULL,
    message         TEXT            NOT NULL,
    is_read         BOOLEAN         DEFAULT FALSE,
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE,
    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE SET NULL
);
```

| Column | Notes |
|---|---|
| `alert_type` | Short code. e.g. `"high_urgency_spike"`, `"recurring_complaint"`, `"low_rating_drop"` |
| `message` | Human-readable. e.g. `"5 high-urgency complaints received in the last 6 hours for form: Dining Feedback"` |
| `form_id` | Nullable. Alert may be form-specific or business-wide. |
| `is_read` | Dashboard shows unread count. Business owner marks as read. |

**Who writes alerts:**
- FastAPI writes alerts to MySQL directly after processing a response, if thresholds are crossed.
- Example threshold: if `urgency = "high"` count for a form in last 6 hours >= 3, create an alert.

---

### Table: `reports`

Metadata for generated reports. Actual PDF files saved to disk.

```sql
CREATE TABLE reports (
    report_id       VARCHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    business_id     VARCHAR(36)     NOT NULL,
    form_id         VARCHAR(36),
    title           VARCHAR(255)    NOT NULL,
    date_from       DATE,
    date_to         DATE,
    file_path       VARCHAR(500),
    generated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id) REFERENCES businesses(business_id) ON DELETE CASCADE,
    FOREIGN KEY (form_id) REFERENCES feedback_forms(form_id) ON DELETE SET NULL
);
```

| Column | Notes |
|---|---|
| `file_path` | Server path to generated PDF. e.g. `/uploads/reports/report_id.pdf` |
| `date_from / date_to` | The date range this report covers. |
| `form_id` | Nullable. Reports are always scoped to one form. |

---

### Table: `admins`

Platform-level administrator accounts. Completely separate from business owners.

```sql
CREATE TABLE admins (
    admin_id        VARCHAR(36)     PRIMARY KEY DEFAULT (UUID()),
    email           VARCHAR(255)    NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
);
```

No FK to businesses. Admin is a separate role with a separate JWT secret.

---

## Part 2 — MongoDB Collections

### Collection: `responses`

**The most important collection.** One document per customer submission.  
Purvi's Node backend creates it. FastAPI enriches it. Neither ever touches the other's fields.

---

#### Document Structure

```js
{
  // ── IDENTIFIERS ──────────────────────────────────────────────
  "response_id":    "uuid-abc123",         // same UUID as used in MySQL if cross-referencing
  "form_id":        "uuid-form456",        // FK to MySQL feedback_forms
  "business_id":    "uuid-biz789",         // FK to MySQL businesses (tenant isolation)
  "submitted_at":   ISODate("2026-04-15T14:30:00Z"),

  // ── RAW ANSWERS — WRITTEN BY NODE (PURVI) ────────────────────
  // Keys are question_id values from MySQL questions table.
  // This is the link: question_id in MySQL === key in answers map here.
  "answers": {
    "uuid-question-1": {
      "label":    "How was your overall experience?",   // copied from MySQL at submit time
      "type":     "rating",
      "value":    4                                      // integer 1-5
    },
    "uuid-question-2": {
      "label":    "Rate the food quality",
      "type":     "rating",
      "value":    2
    },
    "uuid-question-3": {
      "label":    "Rate the service speed",
      "type":     "rating",
      "value":    1
    },
    "uuid-question-4": {
      "label":    "What could we do better?",
      "type":     "text",
      "value":    "The biryani arrived cold and we waited almost 40 minutes."
    },
    "uuid-question-5": {
      "label":    "What did you enjoy most?",
      "type":     "text",
      "value":    "The ambience was really nice and staff greeted us well."
    },
    "uuid-question-6": {
      "label":    "Would you recommend us to a friend?",
      "type":     "yesno",
      "value":    false
    }
  },

  // ── AI ANALYSIS — WRITTEN BY FASTAPI (SHUBHRANSHU) ───────────
  // Node creates this block with status "pending".
  // FastAPI updates it after processing. Node never modifies this after creation.
  "ai_analysis": {

    "status":   "done",          // "pending" | "done" | "failed"

    // Overall derived fields — always present when status = "done"
    "overall_sentiment":   "negative",       // "positive" | "neutral" | "negative"
    "sentiment_score":     0.81,             // float 0.0 – 1.0 (confidence)
    "urgency":             "high",           // "low" | "medium" | "high"
    "is_complaint":        true,             // boolean
    "dominant_topic":      "Food Quality",   // single most prominent topic

    // Per-text-question analysis — one entry per text question answered
    // Key matches the question_id from the answers map above
    "per_text_analysis": {
      "uuid-question-4": {
        "sentiment":       "negative",
        "sentiment_score": 0.88,
        "topics":          ["food temperature", "wait time"],
        "key_phrases":     ["biryani arrived cold", "waited almost 40 minutes"],
        "intent":          "complaint",      // "complaint" | "compliment" | "suggestion" | "neutral"
        "emotions":        ["frustration", "disappointment"]
      },
      "uuid-question-5": {
        "sentiment":       "positive",
        "sentiment_score": 0.76,
        "topics":          ["ambience", "staff behavior"],
        "key_phrases":     ["really nice ambience", "greeted us well"],
        "intent":          "compliment",
        "emotions":        ["satisfaction"]
      }
    },

    "processed_at":  ISODate("2026-04-15T14:30:07Z"),
    "retry_count":   0           // incremented on each retry attempt, for debugging
  }
}
```

---

#### What Node (Purvi) Writes on Submit

```js
// This is what Purvi inserts into MongoDB immediately on submit
{
  "response_id":  "uuid-abc123",
  "form_id":      "uuid-form456",
  "business_id":  "uuid-biz789",
  "submitted_at": new Date(),
  "answers": {
    // ... built from what customer submitted, labels copied from MySQL questions
  },
  "ai_analysis": {
    "status":       "pending",
    "processed_at": null,
    "retry_count":  0
  }
}
```

---

#### What FastAPI Writes After Processing

FastAPI does a `$set` update. It only touches the `ai_analysis` field.

```python
await db.responses.update_one(
    {"response_id": response_id},
    {"$set": {
        "ai_analysis.status":            "done",
        "ai_analysis.overall_sentiment": "negative",
        "ai_analysis.sentiment_score":   0.81,
        "ai_analysis.urgency":           "high",
        "ai_analysis.is_complaint":      True,
        "ai_analysis.dominant_topic":    "Food Quality",
        "ai_analysis.per_text_analysis": { ... },
        "ai_analysis.processed_at":      datetime.utcnow()
    }}
)
```

---

#### Document When Something Fails

```js
{
  "response_id": "uuid-abc123",
  "answers": { ... },    // safe — always written first
  "ai_analysis": {
    "status":      "failed",
    "error":       "LLM API timeout after 30s",
    "retry_count": 1,
    "processed_at": null
  }
}
```

Retry query: find all documents where `ai_analysis.status` is `"pending"` or `"failed"` and `submitted_at` is older than 5 minutes.

---

#### MongoDB Indexes for `responses`

Create these indexes. Without them, queries get slow as data grows.

```js
// Primary query patterns
db.responses.createIndex({ "form_id": 1, "submitted_at": -1 })
db.responses.createIndex({ "business_id": 1, "submitted_at": -1 })
db.responses.createIndex({ "ai_analysis.status": 1 })
db.responses.createIndex({ "form_id": 1, "ai_analysis.overall_sentiment": 1 })
db.responses.createIndex({ "form_id": 1, "ai_analysis.urgency": 1 })
db.responses.createIndex({ "form_id": 1, "ai_analysis.is_complaint": 1 })
db.responses.createIndex({ "response_id": 1 }, { unique: true })
```

---

### Collection: `chat_sessions`

One document per conversation session. A business owner opens AI chat → scoped to one form → one session document.

```js
{
  "session_id":   "uuid-session-xyz",
  "business_id":  "uuid-biz789",
  "form_id":      "uuid-form456",       // always scoped to one form
  "form_title":   "Dining Experience Feedback",   // denormalized for display
  "created_at":   ISODate("2026-04-15T10:00:00Z"),
  "updated_at":   ISODate("2026-04-15T10:25:00Z"),

  "messages": [
    {
      "role":       "user",
      "content":    "What are the most common complaints this month?",
      "timestamp":  ISODate("2026-04-15T10:00:00Z")
    },
    {
      "role":       "assistant",
      "content":    "The most common complaints this month are about food temperature (14 responses) and slow service (9 responses)...",
      "timestamp":  ISODate("2026-04-15T10:00:06Z"),
      "sources": [
        {
          "response_id":  "uuid-abc123",
          "submitted_at": "2026-04-12",
          "snippet":      "biryani arrived cold and we waited 40 minutes"
        },
        {
          "response_id":  "uuid-def456",
          "submitted_at": "2026-04-11",
          "snippet":      "food was cold by the time it reached us"
        }
      ]
    },
    {
      "role":      "user",
      "content":   "Which of these is most urgent?",
      "timestamp": ISODate("2026-04-15T10:01:00Z")
    },
    {
      "role":       "assistant",
      "content":    "Food temperature complaints are more urgent — 6 of those 14 responses also had low ratings of 1 or 2...",
      "timestamp":  ISODate("2026-04-15T10:01:05Z"),
      "sources": [ ... ]
    }
  ]
}
```

| Field | Notes |
|---|---|
| `session_id` | UUID. Created when business owner starts a new chat. |
| `form_id` | Every session is locked to one form. No cross-form chat. |
| `form_title` | Denormalized from MySQL. Avoids a join just to display the session name in sidebar. |
| `messages` | Array grows with each turn. Role is `"user"` or `"assistant"`. |
| `sources` | Only on assistant messages. What the RAG system retrieved. Shown as citations in UI. |

**Index:**
```js
db.chat_sessions.createIndex({ "business_id": 1, "updated_at": -1 })
db.chat_sessions.createIndex({ "session_id": 1 }, { unique: true })
```

---

### Collection: `ai_queries`

A log of every individual AI query made. Useful for monitoring token usage, debugging bad answers, and admin dashboard stats. One document per query (not per session — every message pair gets a log entry).

```js
{
  "query_id":           "uuid-query-111",
  "session_id":         "uuid-session-xyz",
  "business_id":        "uuid-biz789",
  "form_id":            "uuid-form456",
  "query_text":         "What are the most common complaints this month?",
  "response_text":      "The most common complaints are...",
  "retrieved_chunks":   3,          // how many vector chunks were retrieved
  "prompt_tokens":      842,
  "completion_tokens":  310,
  "total_tokens":       1152,
  "model_used":         "claude-sonnet-4-6",
  "latency_ms":         3240,       // how long the LLM call took
  "created_at":         ISODate("2026-04-15T10:00:00Z")
}
```

| Field | Notes |
|---|---|
| `retrieved_chunks` | How many vector DB results were used. For debugging RAG quality. |
| `latency_ms` | How long the full query took. Useful for performance monitoring. |
| `total_tokens` | For cost tracking. Admin dashboard can show total token usage per business. |

**Index:**
```js
db.ai_queries.createIndex({ "business_id": 1, "created_at": -1 })
db.ai_queries.createIndex({ "form_id": 1, "created_at": -1 })
```

---

## Part 3 — Vector Store (FAISS / Chroma)

Not a traditional database — a file-based index. Managed entirely by FastAPI.

**One vector document per feedback response (after AI processing).**

```python
Document(
    page_content = """
        Form: Dining Experience Feedback
        Submitted: 2026-04-15

        Ratings:
        - How was your overall experience?: 4/5
        - Rate the food quality: 2/5
        - Rate the service speed: 1/5

        Q: What could we do better?
        A: "The biryani arrived cold and we waited almost 40 minutes."
        → Sentiment: Negative | Topics: food temperature, wait time | Intent: Complaint

        Q: What did you enjoy most?
        A: "The ambience was really nice and staff greeted us well."
        → Sentiment: Positive | Topics: ambience, staff | Intent: Compliment

        Would recommend: No
        Overall: Negative | Urgency: High | Complaint: Yes
    """,

    metadata = {
        "response_id":          "uuid-abc123",
        "form_id":              "uuid-form456",
        "business_id":          "uuid-biz789",
        "submitted_at":         "2026-04-15T14:30:00Z",
        "overall_sentiment":    "negative",
        "urgency":              "high",
        "is_complaint":         True,
        "dominant_topic":       "Food Quality"
    }
)
```

**Why the `page_content` is written as natural language prose:**
The embedding model converts this text into a vector. Natural language retrieves better than raw JSON. When the business owner asks "complaints about cold food", the embedding similarity between that query and "biryani arrived cold" in the document is what retrieves it.

**Filtering on retrieval:**
```python
# Only search within this business's responses for this form
results = vector_store.similarity_search(
    query=query_embedding,
    k=10,
    filter={
        "business_id": business_id,
        "form_id": form_id
    }
)
```

**Storage path:** `ai-service/data/vectorstore/` — checked into `.gitignore`, regenerated from MongoDB if lost.

---

## Part 4 — Who Writes What, Summary Table

| Data | Written by | Read by |
|---|---|---|
| MySQL: businesses | Node (register) | Node (auth, dashboard) |
| MySQL: feedback_forms | Node (form builder) | Node, FastAPI (schema context) |
| MySQL: questions | Node (form builder) | Node (render form), FastAPI (schema context for LLM) |
| MySQL: qr_codes | Node (on form save) | Node (QR display page) |
| MySQL: alerts | **FastAPI** (after processing) | Node (dashboard alert panel) |
| MySQL: reports | Node (on generate) | Node (reports page) |
| MySQL: admins | Manual seed | Node (admin auth) |
| MongoDB: responses.answers | **Node** (on submit) | Node (raw view), FastAPI (to process) |
| MongoDB: responses.ai_analysis | **FastAPI** (after processing) | Node (analytics queries) |
| MongoDB: chat_sessions | **FastAPI** (saves messages) | Node (proxies to frontend) |
| MongoDB: ai_queries | **FastAPI** (logs every query) | Node (admin stats) |
| Vector store | **FastAPI** (after processing) | FastAPI (RAG retrieval) |

---

## Part 5 — The Retry Query

This is what finds all unprocessed responses. FastAPI runs this on startup and on a schedule.

```python
from datetime import datetime, timedelta

# Find responses that need processing (pending or failed, older than 5 minutes)
unprocessed = await db.responses.find({
    "ai_analysis.status": {"$in": ["pending", "failed"]},
    "submitted_at": {"$lt": datetime.utcnow() - timedelta(minutes=5)},
    "ai_analysis.retry_count": {"$lt": 3}   # don't retry forever
}).to_list(length=100)

for doc in unprocessed:
    await process_response(doc)
```

---

## Part 6 — What Purvi Needs to Know Before Building

**1. When saving a response, copy the question labels from MySQL into the MongoDB answers map.**

Don't just save question_ids and values. Save the label too. This makes MongoDB documents self-describing and means FastAPI doesn't need to do a MySQL lookup just to know what "uuid-question-2" means.

```js
// Do this — self describing
"uuid-question-2": { "label": "Rate the food quality", "type": "rating", "value": 2 }

// Not this — requires a MySQL lookup to interpret
"uuid-question-2": { "type": "rating", "value": 2 }
```

**2. Always create the `ai_analysis` block with `status: "pending"` on insert.**

FastAPI expects this field to exist. It does `$set` updates, not inserts. If the field doesn't exist, the update still works, but having it present from the start lets Purvi's dashboard immediately show "analyzing..." state.

**3. MySQL `questions` table is the source of truth for form structure.**

When rendering the feedback form to a customer, fetch questions from MySQL ordered by `order_index`. When sending the response to FastAPI, include the answers built from those question_ids.

**4. FastAPI writes alerts directly to MySQL.**

Purvi's Node backend doesn't need to trigger alert creation. FastAPI handles it after processing. Node only reads alerts (to display on dashboard) and updates `is_read`.

**5. Shared MongoDB URI, separate concerns.**

Both Node and FastAPI connect to the same MongoDB instance. Node reads/writes `responses.answers`. FastAPI reads `responses.answers` and writes `responses.ai_analysis`. They never write to each other's fields.