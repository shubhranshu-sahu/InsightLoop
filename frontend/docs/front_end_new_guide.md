# InsightLoop — Frontend: Remaining Pages Guide
> **For:** Frontend Developer (Antigravity)  
> **Purpose:** Build the remaining pages — Responses, Analysis, Settings, and Chat.  
> **Theme:** Follow existing dark theme exactly. Same sidebar, navbar, card styles, badge styles from `main.css` and `dashboard.css`.  
> **Base URL:** Already configured in `config.js` as `API_BASE`. Use `apiFetch()` for all authenticated calls.

---

## What Is Already Built

| File | Status |
|---|---|
| `index.html` | ✅ Done |
| `feedback.html` | ✅ Done |
| `pages/login.html` | ✅ Done |
| `pages/register.html` | ✅ Done |
| `pages/dashboard.html` | ✅ Done |
| `pages/forms.html` | ✅ Done |
| `pages/settings.html` | 🔴 Not built |
| `pages/chat.html` | 🔴 Not built |
| `js/settings.js` | 🔴 Not built |
| `js/chat.js` | 🔴 Not built (file exists but empty) |

**Missing pages to create:**
- `pages/responses.html` + `js/responses.js` + `css/responses.css`
- `pages/analysis.html` + `js/analysis.js` + `css/analysis.css`
- Complete `pages/settings.html` + `js/settings.js`
- Complete `pages/chat.html` + `js/chat.js`

---

## Sidebar Navigation — Update Required

The sidebar in `components/sidebar.html` or wherever it is defined must include all pages. Add any missing links:

```html
<a href="dashboard.html"  class="sidebar-nav-link" data-page="dashboard.html">
  <i class="bi bi-speedometer2"></i> Dashboard
</a>
<a href="forms.html"      class="sidebar-nav-link" data-page="forms.html">
  <i class="bi bi-ui-checks"></i> My Forms
</a>
<a href="responses.html"  class="sidebar-nav-link" data-page="responses.html">
  <i class="bi bi-chat-square-text"></i> Responses
</a>
<a href="analysis.html"   class="sidebar-nav-link" data-page="analysis.html">
  <i class="bi bi-bar-chart-line"></i> Analysis
</a>
<a href="chat.html"       class="sidebar-nav-link" data-page="chat.html">
  <i class="bi bi-stars"></i> AI Chat
</a>
<a href="settings.html"   class="sidebar-nav-link" data-page="settings.html">
  <i class="bi bi-gear"></i> Settings
</a>
```

---

## Page 1: `pages/responses.html`

### Purpose
Business owner views all feedback responses for a selected form. See raw customer answers alongside AI analysis. Filter and search across responses.

### Files to Create
- `pages/responses.html`
- `js/responses.js`
- `css/responses.css`

---

### Layout Structure

```
┌──────────────────────────────────────────────────────┐
│ Sidebar │ Navbar ("Responses")                       │
│         ├──────────────────────────────────────────  │
│         │ Form Selector + Stats Bar                  │
│         ├──────────────────────────────────────────  │
│         │ Filter Bar                                  │
│         ├──────────────────────────────────────────  │
│         │ Responses List (scrollable)                 │
│         │   [Response Tile]                          │
│         │   [Response Tile]                          │
│         │   [Response Tile]                          │
└─────────┴──────────────────────────────────────────  │
                       [Detail Modal when tile clicked] │
```

---

### Section 1 — Form Selector + Stats Bar

At the top, a row with two parts:

**Left — Form dropdown:**
```html
<select id="formSelector" class="il-input" style="max-width: 300px;">
  <option value="">Select a form...</option>
  <!-- populated from GET /api/forms -->
</select>
```

**Right — 4 mini stat chips (shown after form selected):**
```
[ Total: 142 ]  [ Positive: 63% ]  [ Complaints: 14 ]  [ Pending AI: 3 ]
```
Pending AI = responses where `ai_analysis.status === "pending"`. Shows the business owner that some responses haven't been analyzed yet.

Stats are populated from the response list itself — count on the frontend, no extra API call.

---

### Section 2 — Filter Bar

A row of filter controls. All filtering happens client-side on the already-fetched response array.

```html
<div class="filter-bar">
  <!-- Sentiment filter -->
  <div class="filter-group">
    <button class="filter-btn active" data-filter="sentiment" data-value="all">All</button>
    <button class="filter-btn" data-filter="sentiment" data-value="positive">Positive</button>
    <button class="filter-btn" data-filter="sentiment" data-value="neutral">Neutral</button>
    <button class="filter-btn" data-filter="sentiment" data-value="negative">Negative</button>
  </div>

  <!-- Urgency filter -->
  <div class="filter-group">
    <button class="filter-btn active" data-filter="urgency" data-value="all">All Urgency</button>
    <button class="filter-btn" data-filter="urgency" data-value="high">High</button>
    <button class="filter-btn" data-filter="urgency" data-value="medium">Medium</button>
    <button class="filter-btn" data-filter="urgency" data-value="low">Low</button>
  </div>

  <!-- Complaints only toggle -->
  <label class="toggle-label">
    <input type="checkbox" id="complaintsOnly"> Complaints only
  </label>

  <!-- Date range -->
  <input type="date" id="dateFrom" class="il-input" style="width: 150px;">
  <input type="date" id="dateTo"   class="il-input" style="width: 150px;">

  <!-- Search -->
  <input type="text" id="searchInput" class="il-input" placeholder="Search in summaries..." style="flex: 1; min-width: 200px;">
</div>
```

---

### Section 3 — Responses List

Each response is a horizontal card/tile. Cards stack vertically, scrollable.

**Response Tile HTML:**
```html
<div class="response-tile" data-response-id="uuid">
  <div class="response-tile-left">
    <span class="badge-sentiment negative">Negative</span>
    <span class="badge-urgency high">High</span>
  </div>

  <div class="response-tile-center">
    <p class="response-summary">Customer experienced cold food and long wait times despite appreciating the ambience...</p>
    <div class="response-meta">
      <span class="response-topic"><i class="bi bi-tag"></i> Food Quality</span>
      <span class="response-date"><i class="bi bi-clock"></i> May 10, 2026 · 2:30 PM</span>
    </div>
  </div>

  <div class="response-tile-right">
    <i class="bi bi-chevron-right"></i>
  </div>
</div>
```

**CSS for tile (`responses.css`):**
```css
.response-tile {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 16px 20px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  margin-bottom: 10px;
}
.response-tile:hover {
  border-color: var(--border-muted);
  background: var(--bg-hover);
}
.response-tile-left   { display: flex; flex-direction: column; gap: 6px; min-width: 90px; }
.response-tile-center { flex: 1; }
.response-tile-right  { color: var(--text-muted); }
.response-summary     { color: var(--text-secondary); font-size: 13px; margin: 0 0 6px; line-height: 1.5;
                        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.response-meta        { display: flex; gap: 16px; }
.response-topic, .response-date { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }

/* Pending analysis state */
.response-tile.pending .response-summary { color: var(--text-muted); font-style: italic; }
```

**For pending responses** (AI not yet processed), show:
- No sentiment/urgency badges — show a small `⏳ Analyzing...` text instead
- Summary text: "AI analysis in progress..."

---

### Response Detail Modal

Clicking any tile opens a full-screen modal (not a slide panel — simpler to build).

**Modal structure:**
```html
<div class="il-overlay" id="responseModal" style="display:none">
  <div class="il-modal" style="max-width: 680px;">

    <!-- Header -->
    <div class="modal-header">
      <div>
        <span class="badge-sentiment negative" id="modalSentiment">Negative</span>
        <span class="badge-urgency high"       id="modalUrgency">High</span>
        <span class="badge-complaint"          id="modalComplaint" style="display:none">⚠ Complaint</span>
      </div>
      <button onclick="closeResponseModal()" class="modal-close-btn">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    <!-- Submitted time -->
    <p class="modal-date" id="modalDate">May 10, 2026 at 2:30 PM</p>

    <!-- AI Summary -->
    <div class="modal-section">
      <span class="section-label">AI Summary</span>
      <p id="modalSummary" class="modal-summary-text">
        Customer experienced cold food and long wait times...
      </p>
    </div>

    <!-- Topic + Key Phrases -->
    <div class="modal-section">
      <span class="section-label">Topic</span>
      <p id="modalTopic">Food Quality</p>
    </div>

    <div class="modal-section" id="keyPhrasesSection">
      <span class="section-label">Key Phrases</span>
      <div id="modalKeyPhrases" class="key-phrases-row">
        <!-- chips like: <span class="key-phrase-chip">biryani arrived cold</span> -->
      </div>
    </div>

    <div class="il-divider"></div>

    <!-- Raw Answers -->
    <div class="modal-section">
      <span class="section-label">Customer Answers</span>
      <div id="modalAnswers">
        <!-- Dynamically rendered per answer type -->
      </div>
    </div>

    <!-- Per-text AI analysis (if available) -->
    <div id="modalPerTextSection"></div>

  </div>
</div>
```

**Rendering answers in the modal:**

```javascript
function renderModalAnswers(response) {
  const container = document.getElementById('modalAnswers');
  container.innerHTML = '';

  const answers = response.answers; // { "uuid-q1": { label, type, value }, ... }
  const perText = response.ai_analysis?.per_text_analysis || {};

  Object.entries(answers).forEach(([qId, ans]) => {
    const block = document.createElement('div');
    block.className = 'answer-block';

    // Question label
    const label = document.createElement('p');
    label.className = 'answer-label';
    label.textContent = ans.label;
    block.appendChild(label);

    // Answer value rendered by type
    if (ans.type === 'rating') {
      const stars = document.createElement('div');
      stars.className = 'answer-stars';
      for (let i = 1; i <= 5; i++) {
        const icon = document.createElement('i');
        icon.className = i <= ans.value ? 'bi bi-star-fill star-filled' : 'bi bi-star star-empty';
        stars.appendChild(icon);
      }
      const numLabel = document.createElement('span');
      numLabel.className = 'answer-rating-num';
      numLabel.textContent = `${ans.value}/5`;
      stars.appendChild(numLabel);
      block.appendChild(stars);
    }

    else if (ans.type === 'text') {
      const p = document.createElement('p');
      p.className = 'answer-text';
      p.textContent = `"${ans.value}"`;
      block.appendChild(p);

      // Per-text AI analysis if available
      if (perText[qId]) {
        const ai = perText[qId];
        const aiBox = document.createElement('div');
        aiBox.className = 'per-text-ai';
        aiBox.innerHTML = `
          <span class="badge-sentiment ${ai.sentiment}">${capitalize(ai.sentiment)}</span>
          <span class="per-text-intent">${capitalize(ai.intent)}</span>
          ${ai.topics.length ? `<span class="per-text-topics">${ai.topics.join(', ')}</span>` : ''}
        `;
        block.appendChild(aiBox);
      }
    }

    else if (ans.type === 'yesno') {
      const p = document.createElement('p');
      p.className = 'answer-yesno ' + (ans.value ? 'yes' : 'no');
      p.textContent = ans.value ? '✓ Yes' : '✗ No';
      block.appendChild(p);
    }

    container.appendChild(block);
  });
}
```

---

### `responses.js` — API Calls

```javascript
// responses.js

Auth.requireAuth();
setActiveSidebarItem();

let allResponses = [];
let activeFilters = { sentiment: 'all', urgency: 'all', complaints: false };

// Populate business name in sidebar/navbar
const business = Auth.getBusiness();
if (business) {
  document.getElementById('sidebarBusinessName').textContent = business.name;
  document.getElementById('navbarAvatar').textContent = business.name.charAt(0).toUpperCase();
}

// Load forms for selector
async function loadForms() {
  const data = await apiFetch('/api/forms');
  const select = document.getElementById('formSelector');
  data.forms.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.form_id;
    opt.textContent = f.title;
    select.appendChild(opt);
  });
}

// Load responses for selected form
async function loadResponses(formId) {
  document.getElementById('responsesList').innerHTML = '<div class="loading-text">Loading responses...</div>';
  const data = await apiFetch(`/api/responses/form/${formId}`);
  allResponses = data.responses;
  updateStats();
  applyFilters();
}

function updateStats() {
  const total    = allResponses.length;
  const positive = allResponses.filter(r => r.ai_analysis?.overall_sentiment === 'positive').length;
  const posPct   = total ? Math.round((positive / total) * 100) : 0;
  const complaints = allResponses.filter(r => r.ai_analysis?.is_complaint).length;
  const pending    = allResponses.filter(r => r.ai_analysis?.status === 'pending').length;

  document.getElementById('statTotal').textContent     = total;
  document.getElementById('statPositive').textContent  = posPct + '%';
  document.getElementById('statComplaint').textContent = complaints;
  document.getElementById('statPending').textContent   = pending;
  document.getElementById('statsBar').style.display    = 'flex';
}

function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo   = document.getElementById('dateTo').value;

  let filtered = allResponses.filter(r => {
    const s  = r.ai_analysis?.overall_sentiment;
    const u  = r.ai_analysis?.urgency;
    const ic = r.ai_analysis?.is_complaint;
    const summary = (r.ai_analysis?.summary || '').toLowerCase();
    const date    = new Date(r.submitted_at);

    if (activeFilters.sentiment !== 'all' && s !== activeFilters.sentiment) return false;
    if (activeFilters.urgency   !== 'all' && u !== activeFilters.urgency)   return false;
    if (activeFilters.complaints && !ic) return false;
    if (search && !summary.includes(search)) return false;
    if (dateFrom && date < new Date(dateFrom)) return false;
    if (dateTo   && date > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  renderResponses(filtered);
}

function renderResponses(responses) {
  const list = document.getElementById('responsesList');
  if (!responses.length) {
    list.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>No responses match your filters.</p></div>';
    return;
  }
  list.innerHTML = responses.map(r => buildTileHTML(r)).join('');
  // Attach click handlers
  list.querySelectorAll('.response-tile').forEach(tile => {
    tile.addEventListener('click', () => openModal(tile.dataset.responseId));
  });
}

function buildTileHTML(r) {
  const ai     = r.ai_analysis || {};
  const isPending = ai.status !== 'done';
  const summary   = ai.summary ? ai.summary.slice(0, 120) + '...' : 'AI analysis in progress...';
  const sentiment = ai.overall_sentiment || '';
  const urgency   = ai.urgency || '';
  const topic     = ai.dominant_topic || '';
  const date      = formatDate(r.submitted_at) + ' · ' + formatTime(r.submitted_at);

  if (isPending) {
    return `
      <div class="response-tile pending" data-response-id="${r.response_id}">
        <div class="response-tile-left"><span class="pending-badge">⏳ Analyzing</span></div>
        <div class="response-tile-center">
          <p class="response-summary">${summary}</p>
          <div class="response-meta"><span class="response-date"><i class="bi bi-clock"></i> ${date}</span></div>
        </div>
        <div class="response-tile-right"><i class="bi bi-chevron-right"></i></div>
      </div>`;
  }

  return `
    <div class="response-tile" data-response-id="${r.response_id}">
      <div class="response-tile-left">
        <span class="badge-sentiment ${sentiment}">${capitalize(sentiment)}</span>
        <span class="badge-urgency ${urgency}">${capitalize(urgency)}</span>
      </div>
      <div class="response-tile-center">
        <p class="response-summary">${summary}</p>
        <div class="response-meta">
          ${topic ? `<span class="response-topic"><i class="bi bi-tag"></i> ${topic}</span>` : ''}
          <span class="response-date"><i class="bi bi-clock"></i> ${date}</span>
        </div>
      </div>
      <div class="response-tile-right"><i class="bi bi-chevron-right"></i></div>
    </div>`;
}

async function openModal(responseId) {
  const response = allResponses.find(r => r.response_id === responseId);
  if (!response) return;

  const ai = response.ai_analysis || {};

  // Populate modal fields
  document.getElementById('modalSentiment').textContent = capitalize(ai.overall_sentiment || '');
  document.getElementById('modalSentiment').className   = `badge-sentiment ${ai.overall_sentiment || ''}`;
  document.getElementById('modalUrgency').textContent   = capitalize(ai.urgency || '');
  document.getElementById('modalUrgency').className     = `badge-urgency ${ai.urgency || ''}`;
  document.getElementById('modalComplaint').style.display = ai.is_complaint ? 'inline' : 'none';
  document.getElementById('modalDate').textContent    = formatDate(response.submitted_at) + ' at ' + formatTime(response.submitted_at);
  document.getElementById('modalSummary').textContent = ai.summary || 'Analysis pending.';
  document.getElementById('modalTopic').textContent   = ai.dominant_topic || '—';

  // Key phrases
  const phrases = ai.key_phrases || [];
  document.getElementById('modalKeyPhrases').innerHTML = phrases.map(p => `<span class="key-phrase-chip">${p}</span>`).join('');
  document.getElementById('keyPhrasesSection').style.display = phrases.length ? 'block' : 'none';

  // Render answers
  renderModalAnswers(response);

  document.getElementById('responseModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeResponseModal() {
  document.getElementById('responseModal').style.display = 'none';
  document.body.style.overflow = '';
}

// Event listeners
document.getElementById('formSelector').addEventListener('change', e => {
  if (e.target.value) loadResponses(e.target.value);
});
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const group = btn.dataset.filter;
    document.querySelectorAll(`[data-filter="${group}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilters[group] = btn.dataset.value;
    applyFilters();
  });
});
document.getElementById('complaintsOnly').addEventListener('change', e => {
  activeFilters.complaints = e.target.checked;
  applyFilters();
});
document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('dateFrom').addEventListener('change', applyFilters);
document.getElementById('dateTo').addEventListener('change', applyFilters);

// Init
loadForms();
```

---

## Page 2: `pages/analysis.html`

### Purpose
Per-form deep analytics with charts and visualizations. Business owner selects a form and sees aggregate data — trends, sentiment breakdown, topic distribution, rating distributions.

### Files to Create
- `pages/analysis.html`
- `js/analysis.js`
- `css/analysis.css`

---

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ Sidebar │ Navbar ("Analysis")                           │
│         ├────────────────────────────────────────────── │
│         │ Form Selector                                 │
│         ├────────────────────────────────────────────── │
│         │ Stats Row (5 cards)                           │
│         ├─────────────────────┬───────────────────────  │
│         │ Sentiment Donut     │ Urgency Bar Chart       │
│         ├─────────────────────┴───────────────────────  │
│         │ Sentiment Trend Line Chart (full width)       │
│         ├────────────────────────────────────────────── │
│         │ Top Topics Chart (horizontal bar)             │
│         ├────────────────────────────────────────────── │
│         │ Rating Distribution (one chart per rating Q) │
└─────────┴──────────────────────────────────────────────  │
```

---

### Section 1 — Form Selector

```html
<div class="analysis-header">
  <select id="formSelector" class="il-input" style="max-width: 320px;">
    <option value="">Select a form to analyze...</option>
  </select>
  <div class="trend-tabs" id="trendTabs" style="display:none">
    <button class="trend-tab active" data-days="7">7 days</button>
    <button class="trend-tab" data-days="30">30 days</button>
    <button class="trend-tab" data-days="90">90 days</button>
  </div>
</div>
```

On form select: show `trendTabs`, load data, render all sections.

---

### Section 2 — Stats Row

Five stat cards:

| Card | Value | Source field |
|---|---|---|
| Total Responses | Number | `stats.total_responses` |
| Positive % | `stats.positive_pct` + % | Calculated |
| Negative % | `stats.negative_pct` + % | Calculated |
| Complaints | `stats.complaint_count` | Direct |
| High Urgency | `stats.high_urgency_count` | Direct |

---

### Section 3 — Sentiment Donut + Urgency Bar (side by side)

**Left — Sentiment Donut (Chart.js):**
```javascript
new Chart(ctx, {
  type: 'doughnut',
  data: {
    labels: ['Positive', 'Neutral', 'Negative'],
    datasets: [{
      data: [positive, neutral, negative],
      backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
      borderWidth: 0,
      hoverOffset: 6
    }]
  },
  options: {
    responsive: true,
    cutout: '65%',
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 16, font: { family: 'Inter' } } }
    }
  }
});
```

**Right — Urgency Bar (Chart.js):**
```javascript
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['Low', 'Medium', 'High'],
    datasets: [{
      label: 'Responses',
      data: [low, medium, high],
      backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
      borderRadius: 6,
      borderSkipped: false
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#475569' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#475569', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  }
});
```

---

### Section 4 — Sentiment Trend Line Chart (full width)

Three lines: positive (green), neutral (amber), negative (red). X-axis = dates.

**Data source:** `GET /api/analytics/sentiment-trend?form_id=uuid&days=30`

```javascript
async function loadTrend(formId, days) {
  const data = await apiFetch(`/api/analytics/sentiment-trend?form_id=${formId}&days=${days}`);
  const labels   = data.trend.map(d => d.date);
  const positive = data.trend.map(d => d.positive);
  const neutral  = data.trend.map(d => d.neutral);
  const negative = data.trend.map(d => d.negative);
  renderTrendChart(labels, positive, neutral, negative);
}

function renderTrendChart(labels, positive, neutral, negative) {
  if (window.trendChartInstance) window.trendChartInstance.destroy();
  const ctx = document.getElementById('trendChart').getContext('2d');
  window.trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Positive', data: positive, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', tension: 0.4, fill: true, pointRadius: 3 },
        { label: 'Neutral',  data: neutral,  borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)',  tension: 0.4, fill: true, pointRadius: 3 },
        { label: 'Negative', data: negative, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)',   tension: 0.4, fill: true, pointRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Inter' } } } },
      scales: {
        x: { ticks: { color: '#475569' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#475569', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}
```

Tab switch (7d / 30d / 90d) only re-fetches trend data and re-renders this chart. Everything else stays.

---

### Section 5 — Top Topics (Horizontal Bar)

**Data source:** `top_topics` from `GET /api/analytics/form/:form_id`

```javascript
function renderTopicsChart(topics) {
  const ctx = document.getElementById('topicsChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   topics.map(t => t.topic),
      datasets: [{
        label: 'Mentions',
        data:  topics.map(t => t.count),
        backgroundColor: '#6366f1',
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',   // ← horizontal
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#475569', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#94a3b8' }, grid: { display: false } }
      }
    }
  });
}
```

---

### Section 6 — Rating Distribution

One bar chart per rating question on the form. Only shown if the form has rating questions.

**Data source:** `rating_distribution` from `GET /api/analytics/form/:form_id`

Structure: `{ "How was your overall experience?": { "1": 8, "2": 14, "3": 31, "4": 52, "5": 37 } }`

```javascript
function renderRatingCharts(ratingDistribution) {
  const container = document.getElementById('ratingChartsContainer');
  container.innerHTML = '';

  Object.entries(ratingDistribution).forEach(([questionLabel, dist]) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'rating-chart-card il-card';

    const title = document.createElement('p');
    title.className = 'rating-chart-title';
    title.textContent = questionLabel;
    wrapper.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.height = 120;
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);

    new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: ['1★', '2★', '3★', '4★', '5★'],
        datasets: [{
          data: [dist['1']||0, dist['2']||0, dist['3']||0, dist['4']||0, dist['5']||0],
          backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981'],
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#475569' }, grid: { display: false } },
          y: { ticks: { color: '#475569', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  });
}
```

---

### `analysis.js` — Main Load Function

```javascript
Auth.requireAuth();
setActiveSidebarItem();

let activeDays = 30;
let activeFormId = null;

async function loadForms() {
  const data = await apiFetch('/api/forms');
  const select = document.getElementById('formSelector');
  data.forms.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.form_id;
    opt.textContent = f.title;
    select.appendChild(opt);
  });
}

async function loadFormAnalysis(formId) {
  activeFormId = formId;
  document.getElementById('trendTabs').style.display = 'flex';

  // Parallel API calls
  const [analytics, trend] = await Promise.all([
    apiFetch(`/api/analytics/form/${formId}`),
    apiFetch(`/api/analytics/sentiment-trend?form_id=${formId}&days=${activeDays}`)
  ]);

  // Render stats
  renderStats(analytics.stats);

  // Render charts
  renderSentimentDonut(analytics.sentiment_breakdown);
  renderUrgencyBar(analytics.urgency_breakdown);
  renderTrendChart(...);
  renderTopicsChart(analytics.top_topics);
  renderRatingCharts(analytics.rating_distribution);

  document.getElementById('chartsSection').style.display = 'block';
}

document.getElementById('formSelector').addEventListener('change', e => {
  if (e.target.value) loadFormAnalysis(e.target.value);
});

document.querySelectorAll('.trend-tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    document.querySelectorAll('.trend-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeDays = parseInt(tab.dataset.days);
    if (activeFormId) {
      const trend = await apiFetch(`/api/analytics/sentiment-trend?form_id=${activeFormId}&days=${activeDays}`);
      renderTrendChart(
        trend.trend.map(d => d.date),
        trend.trend.map(d => d.positive),
        trend.trend.map(d => d.neutral),
        trend.trend.map(d => d.negative)
      );
    }
  });
});

loadForms();
```

---

## Page 3: `pages/settings.html`

### Purpose
Business owner updates their profile information and changes their password.

### Files
- `pages/settings.html` (exists, not built)
- `js/settings.js` (exists, not built)
- Add settings styles to `main.css` (no separate file needed)

---

### Layout

Two-column on desktop, stacked on mobile.

**Left column — Profile Info:**
```html
<div class="il-card">
  <h3 class="card-title">Business Profile</h3>
  <p class="card-subtitle">Update your business information.</p>
  <div class="il-divider"></div>

  <div class="il-form-group">
    <label class="il-label">Business Name</label>
    <input type="text" id="profileName" class="il-input">
  </div>
  <div class="il-form-group">
    <label class="il-label">Email Address</label>
    <input type="email" id="profileEmail" class="il-input" disabled>
    <small style="color: var(--text-muted); font-size: 11px;">Email cannot be changed.</small>
  </div>
  <div class="il-form-group">
    <label class="il-label">Industry</label>
    <select id="profileIndustry" class="il-input">
      <option>Restaurant</option>
      <option>Cafe</option>
      <option>Clinic</option>
      <option>Hospital</option>
      <option>Gym</option>
      <option>College</option>
      <option>Retail Store</option>
      <option>Service Center</option>
      <option>Other</option>
    </select>
  </div>
  <div class="il-form-group">
    <label class="il-label">Phone Number</label>
    <input type="tel" id="profilePhone" class="il-input">
  </div>

  <button id="saveProfileBtn" class="btn-primary-il">Save Changes</button>
</div>
```

**Right column — Change Password:**
```html
<div class="il-card">
  <h3 class="card-title">Change Password</h3>
  <p class="card-subtitle">Use a strong password.</p>
  <div class="il-divider"></div>

  <div class="il-form-group">
    <label class="il-label">Current Password</label>
    <input type="password" id="currentPassword" class="il-input">
  </div>
  <div class="il-form-group">
    <label class="il-label">New Password</label>
    <input type="password" id="newPassword" class="il-input">
  </div>
  <div class="il-form-group">
    <label class="il-label">Confirm New Password</label>
    <input type="password" id="confirmPassword" class="il-input">
  </div>

  <button id="changePasswordBtn" class="btn-primary-il">Update Password</button>
</div>
```

---

### `settings.js`

```javascript
Auth.requireAuth();
setActiveSidebarItem();

// Load current profile
async function loadProfile() {
  const data = await apiFetch('/api/auth/me');
  const b = data.business;
  document.getElementById('profileName').value     = b.name     || '';
  document.getElementById('profileEmail').value    = b.email    || '';
  document.getElementById('profilePhone').value    = b.phone    || '';
  const industrySelect = document.getElementById('profileIndustry');
  for (const opt of industrySelect.options) {
    if (opt.value === b.industry) { opt.selected = true; break; }
  }
}

// Save profile
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await apiFetch('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name:     document.getElementById('profileName').value.trim(),
        industry: document.getElementById('profileIndustry').value,
        phone:    document.getElementById('profilePhone').value.trim()
      })
    });

    // Update stored business info
    const updated = await apiFetch('/api/auth/me');
    Auth.setBusiness(updated.business);
    showToast('Profile updated successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});

// Change password
document.getElementById('changePasswordBtn').addEventListener('click', async () => {
  const np = document.getElementById('newPassword').value;
  const cp = document.getElementById('confirmPassword').value;

  if (np !== cp) {
    showToast('New passwords do not match.', 'error');
    return;
  }
  if (np.length < 8) {
    showToast('Password must be at least 8 characters.', 'error');
    return;
  }

  const btn = document.getElementById('changePasswordBtn');
  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    await apiFetch('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({
        current_password: document.getElementById('currentPassword').value,
        new_password:     np
      })
    });

    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value     = '';
    document.getElementById('confirmPassword').value = '';
    showToast('Password changed successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Password';
  }
});

loadProfile();
```

---

## Page 4: `pages/chat.html`

### Purpose
Business owner chats with the AI about a specific form's feedback. One thread per form, permanent. Responses stream in real-time like ChatGPT.

### Files
- `pages/chat.html` (exists, not built)
- `js/chat.js` (exists but empty)
- `css/chat.css` (exists)

---

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Main Sidebar │ Chat Left Panel (260px) │ Chat Main Area     │
│              │ ─────────────────────── │ ─────────────────  │
│              │ Form Selector Dropdown  │ Chat Header        │
│              │                         │ ─────────────────  │
│              │ ─── CONVERSATIONS ───   │ Messages Area      │
│              │ Dining Feedback  ✓      │ (scrollable)       │
│              │ Staff Survey            │                     │
│              │                         │ ─────────────────  │
│              │                         │ Input + Send Btn   │
└──────────────┴─────────────────────────┴────────────────────┘
```

On mobile: Chat Left Panel becomes a dropdown at the top, chat main takes full width.

---

### HTML Structure

```html
<div class="chat-container">

  <!-- Chat Left Panel -->
  <div class="chat-sidebar" id="chatSidebar">
    <div class="chat-sidebar-header">
      <span class="section-label">SELECT FORM</span>
      <select id="chatFormSelector" class="il-input">
        <option value="">Choose a form...</option>
      </select>
    </div>

    <div class="chat-sidebar-threads">
      <span class="section-label" style="padding: 0 16px;">CONVERSATIONS</span>
      <div id="threadsList"></div>
    </div>
  </div>

  <!-- Chat Main Area -->
  <div class="chat-main">

    <!-- Header -->
    <div class="chat-header" id="chatHeader">
      <div class="chat-header-info">
        <i class="bi bi-stars" style="color: var(--accent-light);"></i>
        <span id="chatFormTitle">Select a form to start</span>
      </div>
      <span id="chatResponseCount" class="chat-response-count"></span>
    </div>

    <!-- Messages -->
    <div class="chat-messages" id="chatMessages">
      <!-- Suggested prompts shown when empty -->
      <div class="suggested-prompts" id="suggestedPrompts">
        <p class="prompts-title">Ask anything about your feedback data</p>
        <div class="prompts-grid">
          <button class="prompt-chip" onclick="useSuggestedPrompt(this)">What are the most common complaints?</button>
          <button class="prompt-chip" onclick="useSuggestedPrompt(this)">How is sentiment trending this month?</button>
          <button class="prompt-chip" onclick="useSuggestedPrompt(this)">Which issues are most urgent?</button>
          <button class="prompt-chip" onclick="useSuggestedPrompt(this)">What do customers say about staff?</button>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="chat-input-area">
      <div class="chat-input-wrapper">
        <textarea
          id="chatInput"
          class="chat-textarea"
          placeholder="Ask about your feedback..."
          rows="1"
          maxlength="1000"
        ></textarea>
        <button id="sendBtn" class="chat-send-btn" disabled>
          <i class="bi bi-send-fill"></i>
        </button>
      </div>
      <div class="chat-input-meta">
        <span id="charCount" style="color: var(--text-muted); font-size: 12px;">0/1000</span>
        <span style="color: var(--text-muted); font-size: 12px;">Enter to send · Shift+Enter for new line</span>
      </div>
    </div>

  </div>
</div>
```

---

### `chat.css` — Key Styles

```css
.chat-container {
  display: flex;
  height: calc(100vh - var(--navbar-height));
  overflow: hidden;
}

.chat-sidebar {
  width: 260px;
  min-width: 260px;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.chat-sidebar-header { padding: 16px; border-bottom: 1px solid var(--border-subtle); }
.chat-sidebar-threads { flex: 1; padding-top: 12px; overflow-y: auto; }

.thread-item {
  padding: 10px 16px;
  cursor: pointer;
  border-radius: 8px;
  margin: 2px 8px;
  transition: background 0.15s;
}
.thread-item:hover    { background: var(--bg-hover); }
.thread-item.active   { background: var(--accent-glow); border: 1px solid rgba(99,102,241,0.25); }
.thread-item-title    { font-size: 13px; font-weight: 500; color: var(--text-primary); margin-bottom: 2px; }
.thread-item-preview  { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chat-header {
  height: 52px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--bg-elevated);
}
.chat-header-info { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px; }
.chat-response-count { font-size: 12px; color: var(--text-muted); }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Message bubbles */
.message { display: flex; gap: 10px; max-width: 80%; }
.message.user     { align-self: flex-end; flex-direction: row-reverse; }
.message.assistant { align-self: flex-start; }
.message-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.message.user .message-avatar      { background: var(--accent-glow); color: var(--accent-light); }
.message.assistant .message-avatar { background: var(--bg-hover); color: var(--text-secondary); }
.message-bubble {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  max-width: 100%;
}
.message.user .message-bubble      { background: var(--accent); color: white; border-bottom-right-radius: 4px; }
.message.assistant .message-bubble { background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--text-primary); border-bottom-left-radius: 4px; }
.message-text { white-space: pre-wrap; word-break: break-word; }

/* Sources / citations */
.message-sources    { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.source-chip {
  font-size: 11px;
  background: var(--bg-hover);
  border: 1px solid var(--border-muted);
  border-radius: 6px;
  padding: 3px 8px;
  color: var(--text-secondary);
  cursor: default;
}
.source-chip:hover { color: var(--text-primary); border-color: var(--accent-light); }

/* Typing indicator */
.typing-indicator { display: flex; gap: 4px; align-items: center; padding: 12px 14px; }
.typing-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--text-muted);
  animation: typingBounce 1.2s infinite;
}
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); }
  30%           { transform: translateY(-6px); }
}

/* Input area */
.chat-input-area {
  border-top: 1px solid var(--border-subtle);
  padding: 12px 20px 16px;
  background: var(--bg-elevated);
}
.chat-input-wrapper {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  background: var(--bg-card);
  border: 1px solid var(--border-muted);
  border-radius: 12px;
  padding: 10px 12px;
  transition: border-color 0.2s;
}
.chat-input-wrapper:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
.chat-textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  resize: none;
  max-height: 120px;
  overflow-y: auto;
}
.chat-textarea::placeholder { color: var(--text-muted); }
.chat-send-btn {
  background: var(--accent-grad);
  border: none;
  border-radius: 8px;
  width: 34px; height: 34px;
  color: white;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: opacity 0.2s;
}
.chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.chat-input-meta { display: flex; justify-content: space-between; margin-top: 6px; }

/* Suggested prompts */
.suggested-prompts { text-align: center; padding: 40px 20px; }
.prompts-title     { font-size: 15px; color: var(--text-secondary); margin-bottom: 20px; }
.prompts-grid      { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; max-width: 480px; margin: 0 auto; }
.prompt-chip {
  background: var(--bg-card);
  border: 1px solid var(--border-muted);
  border-radius: 10px;
  padding: 12px 16px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  font-family: 'Inter', sans-serif;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
  line-height: 1.4;
}
.prompt-chip:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--accent); }

/* Suggested prompts on mobile */
@media (max-width: 576px) {
  .prompts-grid { grid-template-columns: 1fr; }
}
```

---

### `chat.js` — Complete Implementation

```javascript
Auth.requireAuth();
setActiveSidebarItem();

const business = Auth.getBusiness();
if (business) {
  document.getElementById('sidebarBusinessName').textContent = business.name;
  document.getElementById('navbarAvatar').textContent = business.name.charAt(0).toUpperCase();
}

let activeThreadId = null;
let activeFormId   = null;
let isStreaming    = false;

// ── Init ────────────────────────────────────────────────────────────────────

async function init() {
  await Promise.all([loadForms(), loadThreads()]);
}

async function loadForms() {
  const data = await apiFetch('/api/forms');
  const sel  = document.getElementById('chatFormSelector');
  data.forms.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.form_id;
    opt.textContent = f.title;
    sel.appendChild(opt);
  });
}

async function loadThreads() {
  const data = await apiFetch('/api/chat/threads');
  renderThreadList(data.threads);
}

function renderThreadList(threads) {
  const container = document.getElementById('threadsList');
  if (!threads.length) {
    container.innerHTML = '<p style="padding: 12px 16px; color: var(--text-muted); font-size: 13px;">No chats yet. Select a form above.</p>';
    return;
  }
  container.innerHTML = threads.map(t => `
    <div class="thread-item ${t.form_id === activeFormId ? 'active' : ''}"
         data-form-id="${t.form_id}" data-thread-id="${t.thread_id}"
         onclick="openThread('${t.form_id}', '${t.form_title}')">
      <div class="thread-item-title">${t.form_title}</div>
      <div class="thread-item-preview">${t.last_message || 'No messages yet'}</div>
    </div>
  `).join('');
}

// ── Open / Create Thread ─────────────────────────────────────────────────────

async function openThread(formId, formTitle) {
  activeFormId = formId;
  document.getElementById('chatFormTitle').textContent     = formTitle;
  document.getElementById('chatFormSelector').value        = formId;
  document.getElementById('chatMessages').innerHTML        = '';
  document.getElementById('suggestedPrompts').style.display = 'none';

  try {
    // Get existing thread
    const data = await apiFetch(`/api/chat/thread/${formId}`);

    if (data.thread && data.thread.messages.length) {
      activeThreadId = data.thread.thread_id;
      renderMessageHistory(data.thread.messages);
      document.getElementById('chatResponseCount').textContent = `${data.thread.message_count} messages`;
    } else {
      // No thread or empty — create one
      const newThread = await apiFetch('/api/chat/thread', {
        method: 'POST',
        body: JSON.stringify({ form_id: formId })
      });
      activeThreadId = newThread.thread_id;
      showSuggestedPrompts();
    }
  } catch (err) {
    showToast('Could not load chat. Try again.', 'error');
  }

  document.getElementById('sendBtn').disabled = false;

  // Update active state in sidebar
  document.querySelectorAll('.thread-item').forEach(el => {
    el.classList.toggle('active', el.dataset.formId === formId);
  });
}

// ── Message History ──────────────────────────────────────────────────────────

function renderMessageHistory(messages) {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  messages.forEach(msg => {
    if (msg.role === 'user') {
      appendUserMessage(msg.content);
    } else {
      appendAssistantMessage(msg.content, msg.sources || []);
    }
  });
  scrollToBottom();
}

// ── Append Messages ──────────────────────────────────────────────────────────

function appendUserMessage(content) {
  hideSuggestedPrompts();
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `
    <div class="message-avatar"><i class="bi bi-person-fill"></i></div>
    <div class="message-bubble"><p class="message-text">${escapeHTML(content)}</p></div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function createAssistantBubble() {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-avatar"><i class="bi bi-stars"></i></div>
    <div class="message-bubble" id="activeBubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
  return div.querySelector('.message-bubble');
}

function appendAssistantMessage(content, sources) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML = `
    <div class="message-avatar"><i class="bi bi-stars"></i></div>
    <div class="message-bubble">
      <p class="message-text">${escapeHTML(content)}</p>
      ${renderSourcesHTML(sources)}
    </div>
  `;
  container.appendChild(div);
}

function renderSourcesHTML(sources) {
  if (!sources || !sources.length) return '';
  const chips = sources.map(s =>
    `<span class="source-chip" title="${escapeHTML(s.snippet)}">${s.submitted_at}</span>`
  ).join('');
  return `<div class="message-sources">${chips}</div>`;
}

// ── Send Message (Streaming) ─────────────────────────────────────────────────

async function sendMessage() {
  if (isStreaming || !activeFormId || !activeThreadId) return;
  const input   = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  isStreaming = true;
  input.value = '';
  document.getElementById('charCount').textContent = '0/1000';
  document.getElementById('sendBtn').disabled = true;
  autoResizeTextarea(input);

  appendUserMessage(message);
  const bubble = createAssistantBubble();
  let fullText = '';

  try {
    const response = await fetch(`${API_BASE}/api/chat/message`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${Auth.getToken()}`
      },
      body: JSON.stringify({
        thread_id: activeThreadId,
        form_id:   activeFormId,
        message:   message
      })
    });

    if (!response.ok) {
      throw new Error('Request failed: ' + response.status);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    // Clear typing indicator on first token
    let firstToken = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        try {
          const event = JSON.parse(line.slice(6));

          if (event.type === 'token') {
            if (firstToken) {
              bubble.innerHTML = '<p class="message-text"></p>';
              firstToken = false;
            }
            fullText += event.token;
            bubble.querySelector('.message-text').textContent = fullText;
            scrollToBottom();
          }

          if (event.type === 'chart') {
            // Phase 3 — inline Chart.js chart
            renderInlineChart(bubble, event.chart_type, event.data);
          }

          if (event.type === 'done') {
            // Append sources if any (Phase 2+)
            if (event.sources && event.sources.length) {
              const sourcesDiv = document.createElement('div');
              sourcesDiv.className = 'message-sources';
              sourcesDiv.innerHTML = renderSourcesHTML(event.sources);
              bubble.appendChild(sourcesDiv);
            }
            // Update message count display
            if (event.message_count) {
              document.getElementById('chatResponseCount').textContent = `${event.message_count} messages`;
            }
          }

          if (event.type === 'error') {
            bubble.innerHTML = `<p class="message-text" style="color:var(--negative)">${event.message}</p>`;
          }

        } catch (e) { /* skip

```
Claude's response was interrupted


