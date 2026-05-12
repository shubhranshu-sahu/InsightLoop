# Backend Analytics API Bugfix Report
**For:** Purvi (Node Developer) & Antigravity (AI Assistant)
**Context:** The frontend `analysis.html` page has been built strictly according to `backend_updated_guide.md`, but the current backend API responses are either missing data, formatted incorrectly, or ignoring query parameters. 

Please address the following issues:

## 1. Bug: `sentiment-trend` endpoint ignores `form_id` filter
**Endpoint:** `GET /api/analytics/sentiment-trend?form_id={uuid}&days=7`
**The Issue:** When passing a specific `form_id`, the API returns the sentiment trend data for **ALL** forms belonging to the business rather than isolating the data to the requested form. Even if a form has only 1 response, the trend line returns dozens of responses.
**What was in the guide:** The guide explicitly instructed to filter the aggregation based on the `form_id`.
**Required Fix:**
In the controller for this endpoint, ensure that the MongoDB aggregation pipeline includes a `$match` stage for the `form_id` if it is provided in the `req.query`:
```javascript
const match = {
  business_id: businessId,
  'ai_analysis.status': 'done',
  submitted_at: { $gte: startDate }
};
if (req.query.form_id) match.form_id = req.query.form_id; // Add this line!

const raw = await Response.aggregate([ { $match: match }, ... ]);
```

## 2. Bug: `form/:form_id` analytics missing data and wrong structure
**Endpoint:** `GET /api/analytics/form/:form_id`
**The Issue:** The endpoint is completely missing several critical data fields required to draw the frontend charts, and it changed the expected data structure for the breakdown fields.
**What was in the guide:**
According to `backend_updated_guide.md` (Section 5.4), the response should look like this:
```json
{
  "form_id": "uuid",
  "stats": {
    "total_responses": 142,
    "complaint_count": 14
  },
  "sentiment_breakdown": {
    "positive": 89,
    "neutral": 31,
    "negative": 22
  },
  "urgency_breakdown": {
    "low": 112,
    "medium": 22,
    "high": 8
  },
  "top_topics": [
    { "topic": "Food Quality", "count": 34 }
  ],
  "rating_distribution": {
    "How was your overall experience?": { "1": 8, "2": 14, "3": 31, "4": 52, "5": 37 }
  }
}
```

**What is currently happening:**
1. **Missing Fields:** `csat_score`, `top_topics`, and `rating_distribution` are completely absent from the response. The guide provided exact Javascript logic (iterating through `answers` where `type === 'rating'`) to calculate the rating distribution.
2. **Wrong Format:** The `sentiment_breakdown` and `urgency_breakdown` are being returned as arrays (e.g., `[{"_id":"positive", "count":1}]`) instead of the requested object maps (e.g., `{"positive": 1}`). 
3. **Flattened Stats:** `total_responses` and `complaint_count` were flattened into the root object instead of being placed inside a `stats` wrapper as documented.

**Required Fix:**
Update the `GET /api/analytics/form/:form_id` controller to match the exact JSON schema defined in the `backend_updated_guide.md`. Implement the missing `top_topics` and `rating_distribution` logic, and map the breakdown arrays into proper Javascript objects before sending the JSON response.

---

## 3. CRITICAL SECURITY BUG: Cross-Tenant Data Leak in Chat Creation
**Endpoint:** `POST /api/chat/thread` (handled by `getOrCreateThread` in `chat.controller.js`)
**The Issue:** The backend currently allows any logged-in business to create a chat thread mapped to a `form_id` that **belongs to a different business**. Because ownership of the `form_id` isn't verified in MySQL before passing the data to the FastAPI service, FastAPI mistakenly creates a thread linking Business A to Business B's form.
As a consequence, when `GET /api/chat/threads` lists all threads for Business A, the leaked thread is returned and displayed in the frontend Sidebar.

**Required Fix:**
In `chat.controller.js -> getOrCreateThread`, verify the `business_id` from the MySQL database before proceeding to call the AI service. Update the SQL query logic to look like this:

```javascript
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
    
    // 3. Then proceed to call FastAPI...
```
