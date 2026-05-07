# InsightLoop - Frontend API Integration Guide & Status Report

This document contains everything needed for the frontend developer to start building out the interfaces for InsightLoop. It includes the current status of the backend, what is fully working, what needs to be built, and a comprehensive API reference.

---

## 📊 Project Status Report

### ✅ What is Fully Implemented (Backend)
The Node.js/Express backend is structurally complete for core features:
1. **Database & Models:** MySQL is set up for structured data (Users, Forms, Responses), and MongoDB is set up for unstructured data (AI Chat Sessions).
2. **Authentication:** Business Owner Registration, Login, and JWT generation are fully working with `bcryptjs`.
3. **Form Management:** Creating, reading, updating, and deleting forms is fully operational. When a form is created, it also supports adding a dynamic list of questions.
4. **QR Code Generation:** Automatically generates and saves a QR code image whenever a new form is created.
5. **Customer Feedback (Public):** The backend serves a fully styled HTML form for customers (via the scanned QR code), and the API for submitting feedback works.
6. **Analytics & Dashboard Routes:** The SQL queries and endpoints for fetching dashboard stats, sentiment breakdowns, and form analytics are implemented.

### 🚧 What is Partially Implemented / Pending (Backend)
1. **AI Chat System (`/api/ai/*`):** The Node.js backend routes and database schemas are built, but they rely on an external Python FastAPI service (`AI_SERVICE_URL`) to generate answers. The Python service itself is **not yet implemented** (the `ai-service` directory is empty).
2. **Report Generation (`/api/reports/generate`):** The endpoint exists but currently generates a placeholder text file instead of a real PDF.
3. **Email OTP Verification:** Discussed previously, but currently, the standard registration API is working without the OTP verification step blocking it.

### 📝 What Needs to be Done (Frontend Tasks)
1. **Auth Pages:** Registration and Login screens.
2. **Dashboard:** Main landing view showing `total_responses`, `active_forms`, and charts for sentiment.
3. **Form Builder:** An interface to input form `title`, `description`, and a dynamic array of `questions` (type, text, is_required).
4. **Form List & Details:** A page showing all active forms and a way to view responses/analytics for a specific form.
5. **QR Code View:** A modal or page to display the generated QR code (`qr_data_url` or `qr_image_url`) so the business owner can print it.
6. **Chat Interface:** A messaging UI to interact with the AI (even though the backend AI service is pending, the UI can be built to call the endpoints).
7. **Settings/Profile:** Updating business info and changing passwords.

---

## 🔌 API Documentation

### Base URL
By default, the local backend runs on:
\`\`\`text
http://localhost:5000
\`\`\`

### Authentication Header
Most routes require a JWT token obtained from the `/api/auth/login` route. Include it in the header like this:
\`\`\`json
{
  "Authorization": "Bearer <YOUR_JWT_TOKEN>"
}
\`\`\`

---

### 1. Authentication APIs

#### Register Business
- **Endpoint:** \`POST /api/auth/register\`
- **Auth Required:** No
- **Request Body:**
\`\`\`json
{
  "name": "Acme Corp",
  "email": "owner@acmecorp.com",
  "password": "securepassword123",
  "industry": "Retail",
  "phone": "1234567890"
}
\`\`\`
- **Success Response (201 Created):**
\`\`\`json
{
  "message": "Registration successful.",
  "business": {
    "business_id": "uuid-string",
    "name": "Acme Corp",
    "email": "owner@acmecorp.com"
  }
}
\`\`\`

#### Login
- **Endpoint:** \`POST /api/auth/login\`
- **Auth Required:** No
- **Request Body:**
\`\`\`json
{
  "email": "owner@acmecorp.com",
  "password": "securepassword123"
}
\`\`\`
- **Success Response (200 OK):**
\`\`\`json
{
  "token": "eyJhbGciOiJIUzI...",
  "business": {
    "business_id": "uuid-string",
    "name": "Acme Corp",
    "email": "owner@acmecorp.com"
  }
}
\`\`\`

#### Get Current Profile
- **Endpoint:** \`GET /api/auth/me\`
- **Auth Required:** Yes
- **Success Response (200 OK):**
\`\`\`json
{
  "business": {
    "business_id": "uuid",
    "name": "Acme Corp",
    "email": "owner@acmecorp.com",
    "industry": "Retail",
    "phone": "1234567890",
    "logo_url": null,
    "is_active": 1,
    "created_at": "2026-05-06T10:00:00.000Z"
  }
}
\`\`\`

---

### 2. Form Management APIs

#### Get All Forms
- **Endpoint:** \`GET /api/forms\`
- **Auth Required:** Yes
- **Success Response (200 OK):**
\`\`\`json
{
  "forms": [
    {
      "form_id": "uuid",
      "business_id": "uuid",
      "title": "Customer Satisfaction Survey",
      "description": "Please let us know how we did.",
      "is_active": 1,
      "created_at": "2026-05-06T10:00:00.000Z"
    }
  ]
}
\`\`\`

#### Create a New Form
- **Endpoint:** \`POST /api/forms\`
- **Auth Required:** Yes
- **Request Body:**
\`\`\`json
{
  "title": "Store Experience Survey",
  "description": "Tell us about your visit.",
  "questions": [
    {
      "question_text": "How would you rate your experience?",
      "question_type": "rating",
      "order_index": 1,
      "is_required": true
    },
    {
      "question_text": "Would you recommend us?",
      "question_type": "yesno",
      "order_index": 2,
      "is_required": true
    },
    {
      "question_text": "Any other feedback?",
      "question_type": "text",
      "order_index": 3,
      "is_required": false
    }
  ]
}
\`\`\`
- **Success Response (201 Created):**
\`\`\`json
{
  "message": "Form created successfully.",
  "form": {
    "form_id": "uuid",
    "business_id": "uuid",
    "title": "Store Experience Survey",
    "description": "Tell us about your visit.",
    "is_active": 1,
    "created_at": "...",
    "questions": [
      {
        "question_id": 1,
        "form_id": "uuid",
        "question_text": "How would you rate your experience?",
        "question_type": "rating",
        "order_index": 1,
        "is_required": 1
      }
    ]
  },
  "qr_code": {
    "qr_id": 1,
    "public_url": "http://localhost:5000/form/uuid",
    "qr_image_url": "http://localhost:5000/uploads/qrcodes/qr_uuid.png",
    "qr_data_url": "data:image/png;base64,iVBORw0KGgo...",
    "created_at": "..."
  }
}
\`\`\`

#### Get Form By ID (includes questions)
- **Endpoint:** \`GET /api/forms/:form_id\`
- **Auth Required:** Yes
- **Success Response (200 OK):**
\`\`\`json
{
  "form": {
    "form_id": "uuid",
    "title": "Store Experience Survey",
    "description": "Tell us about your visit.",
    "questions": [
      {
        "question_id": 1,
        "question_text": "How would you rate your experience?",
        "question_type": "rating",
        "is_required": 1,
        "order_index": 1
      }
    ]
  }
}
\`\`\`

---

### 3. QR Code API

#### Get QR Code for Form
- **Endpoint:** \`GET /api/qr/:form_id\`
- **Auth Required:** Yes
- **Success Response (200 OK):**
\`\`\`json
{
  "qr_id": 1,
  "form_id": "uuid",
  "form_title": "Store Experience Survey",
  "public_url": "http://localhost:5000/form/uuid",
  "qr_image_url": "http://localhost:5000/uploads/qrcodes/qr_uuid.png",
  "qr_data_url": "data:image/png;base64,iVBORw0KGgo...",
  "created_at": "2026-05-06T10:00:00.000Z"
}
\`\`\`

---

### 4. Feedback / Public Facing APIs
*These are for the end customer scanning the QR code. The frontend dashboard might not need these unless building a custom form renderer, as the backend serves an HTML page at `/form/:form_id`.*

#### Get Form Schema (Public JSON)
- **Endpoint:** \`GET /api/feedback/form/:form_id\`
- **Auth Required:** No
- **Success Response (200 OK):** Returns form details, business logo, and questions array.

#### Submit Feedback (Public)
- **Endpoint:** \`POST /api/feedback/submit\`
- **Auth Required:** No
- **Request Body:**
\`\`\`json
{
  "form_id": "uuid",
  "answers": [
    { "question_id": 1, "answer_value": "5" },
    { "question_id": 2, "answer_value": "yes" },
    { "question_id": 3, "answer_value": "Great service!" }
  ]
}
\`\`\`
- **Success Response (201 Created):**
\`\`\`json
{
  "message": "Thank you for your feedback!",
  "response_id": "uuid"
}
\`\`\`

#### Get Responses for a Form (Business Owner)
- **Endpoint:** \`GET /api/feedback/responses/:form_id\`
- **Auth Required:** Yes
- **Success Response (200 OK):**
\`\`\`json
{
  "responses": [
    {
      "response_id": "uuid",
      "form_id": "uuid",
      "submitted_at": "2026-05-06T10:15:00.000Z",
      "sentiment": "positive",
      "topic": "service",
      "urgency": "low",
      "is_complaint": 0,
      "summary": "Customer praised the great service."
    }
  ]
}
\`\`\`

#### Get Single Full Response
- **Endpoint:** \`GET /api/feedback/response/:response_id\`
- **Auth Required:** Yes
- **Success Response (200 OK):** Returns the full response data, AI analysis summary, and the exact `answers` array with the question text.

---

### 5. Analytics & Dashboard APIs

#### Main Dashboard Stats
- **Endpoint:** \`GET /api/analytics/dashboard\`
- **Auth Required:** Yes
- **Success Response (200 OK):**
\`\`\`json
{
  "total_responses": 142,
  "sentiment_breakdown": {
    "positive": 95,
    "neutral": 30,
    "negative": 17
  },
  "active_forms": 3,
  "unread_alerts": 2,
  "top_topics": ["Wait time", "Staff behavior", "Cleanliness", "Product availability"]
}
\`\`\`

#### Form Specific Analytics
- **Endpoint:** \`GET /api/analytics/form/:form_id\`
- **Auth Required:** Yes
- **Success Response (200 OK):** Returns similar data tailored to a specific form, plus `urgency_breakdown` and `complaint_count`.

#### Sentiment Trend Over Time
- **Endpoint:** \`GET /api/analytics/sentiment-trend?days=30&form_id=optional_uuid\`
- **Auth Required:** Yes
- **Success Response (200 OK):**
\`\`\`json
{
  "trend": [
    { "date": "2026-05-01T00:00:00.000Z", "sentiment": "positive", "count": 5 },
    { "date": "2026-05-01T00:00:00.000Z", "sentiment": "negative", "count": 1 }
  ]
}
\`\`\`

---

### 6. AI Chat Interface (Pending Backend AI Service)

#### Send a Query
- **Endpoint:** \`POST /api/ai/query\`
- **Auth Required:** Yes
- **Request Body:**
\`\`\`json
{
  "query": "What are customers saying about the waiting time?",
  "form_id": "optional_uuid",
  "session_id": "optional_if_continuing_chat"
}
\`\`\`
- **Success Response (200 OK):**
\`\`\`json
{
  "answer": "Most customers are satisfied, but 10% mentioned the wait time was too long on weekends.",
  "sources": [ { "snippet": "..." } ],
  "session_id": "mongo-object-id",
  "token_usage": 150
}
\`\`\`

#### Get Chat Sessions
- **Endpoint:** \`GET /api/ai/sessions\`
- **Auth Required:** Yes
- **Success Response (200 OK):** Array of session objects `[{ session_id, form_id, updated_at }]`

#### Get Session History
- **Endpoint:** \`GET /api/ai/session/:session_id\`
- **Auth Required:** Yes
- **Success Response (200 OK):** Returns the session object containing the full `messages` array (user and assistant roles).

---

### Additional Notes for Frontend
- **QR Display:** You can use \`<img src={qr_data_url} />\` to render the QR code instantly without needing to fetch the image file from the server.
- **Error Handling:** All error responses return a JSON object with an `error` key (e.g., `{ "error": "Invalid email or password." }`). Look for status codes `400`, `401`, `403`, `404`, and `500`.
- **CORS:** CORS is enabled on the backend, so local React/Vue/Next servers (like `localhost:3000` or `localhost:5173`) should be able to make requests without issues.
