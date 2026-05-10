# InsightLoop Frontend API Integration Guide

This document serves as a comprehensive guide for the frontend team to integrate with the InsightLoop backend APIs. It includes all available endpoints, their required payloads, and expected responses.

All endpoints prefixed with `(Protected)` require a valid JWT token in the `Authorization` header:
`Authorization: Bearer <your_jwt_token>`

---

## 1. Authentication APIs (`/api/auth`)

### 1.1 Register Business Owner
*   **Method:** `POST`
*   **Path:** `/api/auth/register`
*   **Auth Required:** No
*   **Request Body:**
    ```json
    {
      "name": "John Doe",
      "email": "john@example.com",
      "password": "securepassword",
      "industry": "Restaurant",
      "phone": "+1234567890"
    }
    ```
*   **Response (201 Created):**
    ```json
    {
      "message": "Registration successful.",
      "business": {
        "business_id": "uuid",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
    ```

### 1.2 Login
*   **Method:** `POST`
*   **Path:** `/api/auth/login`
*   **Auth Required:** No
*   **Request Body:**
    ```json
    {
      "email": "john@example.com",
      "password": "securepassword"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "token": "jwt.token.string",
      "business": {
        "business_id": "uuid",
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
    ```

### 1.3 Get Profile
*   **Method:** `GET`
*   **Path:** `/api/auth/me`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "business": {
        "business_id": "uuid",
        "name": "John Doe",
        "email": "john@example.com",
        "industry": "Restaurant",
        "phone": "+1234567890",
        "logo_url": "url",
        "created_at": "2026-05-10T12:00:00Z"
      }
    }
    ```

### 1.4 Update Profile
*   **Method:** `PUT`
*   **Path:** `/api/auth/profile`
*   **Auth Required:** Yes
*   **Request Body:**
    ```json
    {
      "name": "John Doe Updated",
      "industry": "Cafe",
      "phone": "+1987654321",
      "logo_url": "new_url"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "message": "Profile updated.",
      "business": { ...updated profile object... }
    }
    ```

### 1.5 Change Password
*   **Method:** `PUT`
*   **Path:** `/api/auth/change-password`
*   **Auth Required:** Yes
*   **Request Body:**
    ```json
    {
      "current_password": "oldpassword",
      "new_password": "newsecurepassword"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "message": "Password changed successfully."
    }
    ```

### 1.6 Logout
*   **Method:** `POST`
*   **Path:** `/api/auth/logout`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "message": "Logged out successfully."
    }
    ```

---

## 2. Dashboard Analytics APIs (`/api/analytics`)

### 2.1 Get Dashboard Overview Stats
*   **Method:** `GET`
*   **Path:** `/api/analytics/dashboard`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "stat_cards": {
        "total_responses": 150,
        "responses_this_week": 25,
        "responses_today": 5,
        "active_forms": 3,
        "complaints_this_month": 2,
        "unread_alerts": 1
      },
      "positive_rate": {
        "current_30d": 85.5,
        "previous_30d": 80.0,
        "delta": 5.5
      },
      "sentiment_breakdown_30d": {
        "positive": 100,
        "neutral": 30,
        "negative": 20
      },
      "urgency_breakdown_30d": {
        "low": 120,
        "medium": 20,
        "high": 10
      },
      "top_topics_30d": [
        { "topic": "Food Quality", "count": 45 },
        { "topic": "Service Speed", "count": 30 }
      ]
    }
    ```

### 2.2 Get Sentiment Trend
*   **Method:** `GET`
*   **Path:** `/api/analytics/sentiment-trend?days=30`
*   **Auth Required:** Yes
*   **Query Params:** `days` (optional, default 30, allowed: 7, 30, 90)
*   **Response (200 OK):**
    ```json
    {
      "days": 30,
      "trend": [
        { "date": "2026-05-01", "positive": 5, "neutral": 2, "negative": 1 },
        { "date": "2026-05-02", "positive": 8, "neutral": 1, "negative": 0 }
      ]
    }
    ```

### 2.3 Get Forms Performance
*   **Method:** `GET`
*   **Path:** `/api/analytics/forms-performance`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "forms": [
        {
          "form_id": "uuid",
          "title": "Customer Satisfaction Survey",
          "is_active": true,
          "total_responses": 50,
          "positive_count": 40,
          "neutral_count": 5,
          "negative_count": 5,
          "positive_pct": 80.0,
          "complaint_count": 2,
          "last_response_at": "2026-05-10T10:00:00Z"
        }
      ]
    }
    ```

### 2.4 Get Recent Responses
*   **Method:** `GET`
*   **Path:** `/api/analytics/recent-responses?limit=15`
*   **Auth Required:** Yes
*   **Query Params:** `limit` (optional, default 15, max 50)
*   **Response (200 OK):**
    ```json
    {
      "responses": [
        {
          "response_id": "uuid",
          "form_id": "uuid",
          "form_title": "Customer Satisfaction Survey",
          "submitted_at": "2026-05-10T11:00:00Z",
          "sentiment": "positive",
          "urgency": "low",
          "is_complaint": false,
          "dominant_topic": "Food Quality",
          "summary": "Customer loved the pizza."
        }
      ]
    }
    ```

### 2.5 Get Analytics for Specific Form
*   **Method:** `GET`
*   **Path:** `/api/analytics/form/:form_id`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "form_id": "uuid",
      "total_responses": 100,
      "sentiment_breakdown": [
        { "_id": "positive", "count": 70 },
        { "_id": "neutral", "count": 20 },
        { "_id": "negative", "count": 10 }
      ],
      "urgency_breakdown": [
        { "_id": "low", "count": 80 },
        { "_id": "high", "count": 20 }
      ],
      "complaint_count": 5
    }
    ```

---

## 3. Forms APIs (`/api/forms`)

### 3.1 Get All Forms
*   **Method:** `GET`
*   **Path:** `/api/forms`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "forms": [
        {
          "form_id": "uuid",
          "business_id": "uuid",
          "title": "Form Title",
          "description": "Form Description",
          "is_active": 1,
          "created_at": "2026-05-10T..."
        }
      ]
    }
    ```

### 3.2 Create Form
*   **Method:** `POST`
*   **Path:** `/api/forms`
*   **Auth Required:** Yes
*   **Request Body:**
    ```json
    {
      "title": "Dine-in Feedback",
      "description": "Please let us know how your visit was.",
      "questions": [
        {
          "question_text": "How was the food?",
          "question_type": "rating",
          "order_index": 1,
          "is_required": true
        },
        {
          "question_text": "Any additional comments?",
          "question_type": "text",
          "order_index": 2,
          "is_required": false
        }
      ]
    }
    ```
*   **Response (201 Created):**
    ```json
    {
      "message": "Form created successfully.",
      "form": { ...form details with questions... },
      "qr_code": {
        "qr_id": "uuid",
        "public_url": "http://localhost:3000/feedback.html?form_id=...",
        "created_at": "2026-05-10T..."
      }
    }
    ```

### 3.3 Get Form By ID
*   **Method:** `GET`
*   **Path:** `/api/forms/:form_id`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "form": {
        "form_id": "uuid",
        "title": "Title",
        "questions": [ ... ]
      }
    }
    ```

### 3.4 Update Form
*   **Method:** `PUT`
*   **Path:** `/api/forms/:form_id`
*   **Auth Required:** Yes
*   **Request Body:**
    ```json
    {
      "title": "Updated Title",
      "description": "Updated Description"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "message": "Form updated.",
      "form": { ... }
    }
    ```

### 3.5 Delete Form
*   **Method:** `DELETE`
*   **Path:** `/api/forms/:form_id`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "message": "Form deleted successfully."
    }
    ```

---

## 4. Public Form & Submission APIs

### 4.1 View Public Form (HTML)
*   **Method:** `GET`
*   **Path:** `/form/:form_id`
*   **Auth Required:** No
*   **Description:** Serves the actual HTML page for customers to fill out. The QR code points here.

### 4.2 Submit Feedback Response (MongoDB Storage)
*   **Method:** `POST`
*   **Path:** `/api/responses/submit`
*   **Auth Required:** No
*   **Description:** Submits customer feedback directly to MongoDB Atlas. Note that AI analysis is currently decoupled.
*   **Request Body:**
    ```json
    {
      "form_id": "uuid-of-form",
      "answers": {
        "uuid-of-question-1": { "value": 5 },
        "uuid-of-question-2": { "value": "Great service!" },
        "uuid-of-question-3": { "value": true }
      }
    }
    ```
*   **Response (201 Created):**
    ```json
    {
      "message": "Thank you for your feedback!",
      "response_id": "uuid",
      "submitted_at": "2026-05-10T12:00:00.000Z"
    }
    ```

---

## 5. "My Responses" APIs (`/api/responses`)

These APIs are for the business owner to view submitted responses.

### 5.1 Get Responses By Form
*   **Method:** `GET`
*   **Path:** `/api/responses/form/:form_id`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "count": 10,
      "responses": [
        {
          "response_id": "uuid",
          "form_id": "uuid",
          "business_id": "uuid",
          "submitted_at": "2026-05-10T12:00:00Z",
          "answers": { ... },
          "ai_analysis": {
            "status": "pending",
            "overall_sentiment": null,
            "summary": null
          }
        }
      ]
    }
    ```

### 5.2 Get Responses For All Forms (Business wide)
*   **Method:** `GET`
*   **Path:** `/api/responses/business/:business_id`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "count": 50,
      "responses": [ ... ]
    }
    ```

### 5.3 Get Single Response Detail
*   **Method:** `GET`
*   **Path:** `/api/responses/:response_id`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "response": { ... full response document ... }
    }
    ```

---

## 6. QR Code APIs (`/api/qr`)

### 6.1 Get QR Code Data
*   **Method:** `GET`
*   **Path:** `/api/qr/:form_id`
*   **Auth Required:** Yes
*   **Description:** Returns the public URL for the form. The frontend is responsible for generating the actual QR code image using this URL.
*   **Response (200 OK):**
    ```json
    {
      "qr_id": "uuid",
      "form_id": "uuid",
      "form_title": "Form Title",
      "public_url": "http://localhost:3000/feedback.html?form_id=...",
      "created_at": "2026-05-10T..."
    }
    ```

---

## 7. AI Chat APIs (`/api/ai`)

### 7.1 Query AI Assistant
*   **Method:** `POST`
*   **Path:** `/api/ai/query`
*   **Auth Required:** Yes
*   **Request Body:**
    ```json
    {
      "query": "What are the common complaints about the food?",
      "form_id": "uuid", 
      "session_id": "optional-uuid-to-continue-chat"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "answer": "Most customers complained about the soup being cold.",
      "sources": [ ... ],
      "session_id": "uuid",
      "token_usage": 150
    }
    ```

### 7.2 Get Chat Sessions
*   **Method:** `GET`
*   **Path:** `/api/ai/sessions`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "sessions": [
        {
          "session_id": "uuid",
          "form_id": "uuid",
          "created_at": "2026-05-10T...",
          "updated_at": "2026-05-10T..."
        }
      ]
    }
    ```

### 7.3 Get Specific Chat Session
*   **Method:** `GET`
*   **Path:** `/api/ai/session/:session_id`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "session": {
        "messages": [
          { "role": "user", "content": "Hello" },
          { "role": "assistant", "content": "Hi there!" }
        ]
      }
    }
    ```

### 7.4 Delete Chat Session
*   **Method:** `DELETE`
*   **Path:** `/api/ai/session/:session_id`
*   **Auth Required:** Yes

---

## 8. Alerts APIs (`/api/alerts`)

### 8.1 Get Unread Alerts
*   **Method:** `GET`
*   **Path:** `/api/alerts`
*   **Auth Required:** Yes
*   **Response (200 OK):**
    ```json
    {
      "alerts": [
        {
          "alert_id": "uuid",
          "form_id": "uuid",
          "form_title": "Title",
          "alert_type": "complaint",
          "message": "New critical complaint received.",
          "is_read": false,
          "created_at": "2026-05-10T..."
        }
      ],
      "unread_count": 1
    }
    ```

### 8.2 Mark Alert as Read
*   **Method:** `PATCH`
*   **Path:** `/api/alerts/:alert_id/read`
*   **Auth Required:** Yes

### 8.3 Mark All Alerts as Read
*   **Method:** `PATCH`
*   **Path:** `/api/alerts/read-all`
*   **Auth Required:** Yes

---

## 9. Reports APIs (`/api/reports`)

### 9.1 Generate Report
*   **Method:** `POST`
*   **Path:** `/api/reports/generate`
*   **Auth Required:** Yes
*   **Request Body:**
    ```json
    {
      "form_id": "uuid",
      "report_type": "monthly",
      "date_from": "2026-04-01",
      "date_to": "2026-04-30"
    }
    ```

### 9.2 List Reports
*   **Method:** `GET`
*   **Path:** `/api/reports`
*   **Auth Required:** Yes

### 9.3 Download Report
*   **Method:** `GET`
*   **Path:** `/api/reports/:report_id/download`
*   **Auth Required:** Yes
*   **Description:** Returns a PDF file download.

---

## Status Report & Pending Work

### Fully Implemented Backend Features ✅
*   **Auth:** Login, Register, Profile Management, Change Password.
*   **Dashboard:** Aggregated stats, sentiment trends, form performance, and recent responses are all functional.
*   **Forms Management:** Create, Read, Update (Title/Desc), Delete are fully working. (Deleting a form also cascades to questions and deletes associated records).
*   **QR Codes:** Endpoints to generate public URLs dynamically based on the environment variable `FRONTEND_BASE_URL` are working.
*   **Public Feedback Forms:** The public HTML form renderer is working.
*   **Responses Submissions:** Submissions are correctly saving to MongoDB Atlas.

### APIs Left to Implement / Polish 🛠️

**For the "My Responses" Page:**
While we have endpoints to fetch all responses for a form (`GET /api/responses/form/:form_id`) and for a business (`GET /api/responses/business/:business_id`), the backend currently lacks out-of-the-box querying for sorting, pagination, and filtering based on AI sentiment/attributes.
*   **Pending Implementation:** Add pagination (`page`, `limit`) and filtering (`?sentiment=positive`, `?is_complaint=true`) to the `getResponsesByForm` API in `responses.controller.js`.
*   **Pending Implementation:** We need a **Delete Response** API. Currently, there is no route to delete a single response document from MongoDB.

**For Feedback Submission & AI:**
*   Currently, the primary response submission API (`/api/responses/submit`) only saves the document to MongoDB.
*   It **does not** automatically trigger the AI analysis service. The `/analyze` endpoint (handled in a separate microservice/branch) needs to be hooked up asynchronously to process these new MongoDB documents, or a background worker needs to poll for `status: 'pending'` records.

**For Reports:**
*   `POST /api/reports/generate` creates a database record and fetches an AI summary, but the actual PDF generation is just creating a text placeholder. The PDF generation library (like `pdfkit` or `puppeteer`) needs to be fully integrated to export the visual charts.
