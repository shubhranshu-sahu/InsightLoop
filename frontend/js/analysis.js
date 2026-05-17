import { requireAuth, apiFetch, loadComponent, getUser } from './config.js';

requireAuth();

// ── Inject shared components ──────────────────────────────────────────────────
loadComponent('#sidebar-container', '../components/sidebar.html').then(() => {
  if (window.lucide) window.lucide.createIcons();
});
loadComponent('#navbar-container', '../components/navbar.html').then(() => {
  if (window.lucide) window.lucide.createIcons();
});

if (window.lucide) {
  window.lucide.createIcons();
}

let activeFormId = null;
let activeDays = 7;
let charts = {}; // store chart instances

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  setupEventListeners();
  await loadForms();

  // Set Chart.js global defaults for dark theme
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.06)';
  Chart.defaults.font.family = "'Inter', sans-serif";
}

function setupEventListeners() {
  document.getElementById('formSelector').addEventListener('change', e => {
    activeFormId = e.target.value;
    if (activeFormId) {
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('analysisContent').style.display = 'block';
      document.getElementById('timeTabs').style.display = 'flex';
      loadAnalytics();
    } else {
      document.getElementById('emptyState').style.display = 'block';
      document.getElementById('analysisContent').style.display = 'none';
      document.getElementById('timeTabs').style.display = 'none';
    }
  });

  document.querySelectorAll('.time-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeDays = parseInt(btn.dataset.days);
      loadAnalytics();
    });
  });
}

async function loadForms() {
  try {
    const select = document.getElementById('formSelector');
    select.innerHTML = '<option value="">Loading forms...</option>';

    const data = await apiFetch('/api/forms');

    select.innerHTML = '<option value="">Select a form...</option>';
    if (data.forms && data.forms.length > 0) {
      data.forms.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.form_id;
        opt.textContent = f.title;
        select.appendChild(opt);
      });
      
      // Auto-select from URL
      const urlParams = new URLSearchParams(window.location.search);
      const formIdFromUrl = urlParams.get('form_id');
      if (formIdFromUrl && select.querySelector(`option[value="${formIdFromUrl}"]`)) {
        select.value = formIdFromUrl;
        select.dispatchEvent(new Event('change'));
      }
    } else {
      select.innerHTML = '<option value="">No forms found</option>';
      select.disabled = true;
    }
  } catch (err) {
    console.error('Failed to load forms', err);
    document.getElementById('formSelector').innerHTML = '<option value="">Error loading forms</option>';
  }
}

async function loadAnalytics() {
  showSkeletons();

  try {
    const [overall, trend] = await Promise.all([
      apiFetch(`/api/analytics/form/${activeFormId}?days=${activeDays}`),
      apiFetch(`/api/analytics/sentiment-trend?form_id=${activeFormId}&days=${activeDays}`)
    ]);

    renderStats(overall);
    renderCharts(overall, trend.trend);
    hideSkeletons();
  } catch (err) {
    console.error('Failed to load analytics', err);
    // You could show an error toast here
  }
}

function showSkeletons() {
  document.querySelectorAll('.chart-container').forEach(c => c.classList.remove('loaded'));
  document.getElementById('statTotal').textContent = '-';
  document.getElementById('statCSAT').textContent = '-';
  document.getElementById('statPositive').textContent = '-';
  document.getElementById('statComplaints').textContent = '-';
}

function hideSkeletons() {
  document.querySelectorAll('.chart-container').forEach(c => c.classList.add('loaded'));
}

function renderStats(analytics) {
  document.getElementById('statTotal').textContent = analytics.total_responses || 0;

  // If the backend doesn't provide csat_score yet, we can default to N/A
  const csat = analytics.csat_score ? parseFloat(analytics.csat_score).toFixed(1) : 'N/A';
  document.getElementById('statCSAT').textContent = csat;

  const sentimentObj = analytics.sentiment_breakdown || {};
  
  const pos = sentimentObj.positive || 0;
  const tot = analytics.total_responses || Object.values(sentimentObj).reduce((a, b) => a + b, 0);
  const posPct = tot > 0 ? Math.round((pos / tot) * 100) : 0;
  document.getElementById('statPositive').textContent = `${posPct}%`;

  const complaints = analytics.complaint_count || analytics.total_complaints || 0;
  const compPct = tot > 0 ? Math.round((complaints / tot) * 100) : 0;
  document.getElementById('statComplaints').textContent = `${compPct}%`;
}

function renderCharts(analytics, trend) {
  const sentimentObj = analytics.sentiment_breakdown || {};
  const urgencyObj = analytics.urgency_breakdown || {};
  
  renderSentimentDonut(sentimentObj);
  renderUrgencyBar(urgencyObj);
  renderTopicsBar(analytics.top_topics || []);
  renderRatingBar(analytics.rating_distribution || {});
  renderTrendLine(trend);
}

function createOrUpdateChart(id, type, data, options) {
  const ctx = document.getElementById(id);
  if (charts[id]) {
    charts[id].destroy();
  }
  charts[id] = new Chart(ctx, { type, data, options });
}

function renderSentimentDonut(dist) {
  const data = {
    labels: ['Positive', 'Neutral', 'Negative'],
    datasets: [{
      data: [dist?.positive || 0, dist?.neutral || 0, dist?.negative || 0],
      backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
      borderWidth: 0,
      hoverOffset: 4
    }]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { position: 'bottom' }
    }
  };
  createOrUpdateChart('sentimentDonut', 'doughnut', data, options);
}

function renderUrgencyBar(dist) {
  const data = {
    labels: ['Low', 'Medium', 'High'],
    datasets: [{
      label: 'Responses',
      data: [dist?.low || 0, dist?.medium || 0, dist?.high || 0],
      backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(239, 68, 68, 0.8)'],
      borderRadius: 4
    }]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };
  createOrUpdateChart('urgencyBar', 'bar', data, options);
}

function renderTopicsBar(topicsData) {
  const topics = topicsData || [];
  const data = {
    labels: topics.map(t => t.topic),
    datasets: [{
      label: 'Mentions',
      data: topics.map(t => t.count),
      backgroundColor: '#6366f1',
      borderRadius: 4
    }]
  };
  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
  };
  createOrUpdateChart('topicsBar', 'bar', data, options);
}

function renderRatingBar(dist) {
  // Guide format: { "Question 1": { "1": 5, "5": 10 }, "Question 2": { ... } }
  // We need to sum them up, or if the backend returns a flat object, handle that too.
  let ones=0, twos=0, threes=0, fours=0, fives=0;
  
  if (dist) {
    Object.values(dist).forEach(val => {
      if (typeof val === 'object' && val !== null) {
        // It's nested by question
        ones += val['1'] || 0;
        twos += val['2'] || 0;
        threes += val['3'] || 0;
        fours += val['4'] || 0;
        fives += val['5'] || 0;
      } else {
        // Flat object fallback just in case
        ones = dist['1'] || 0;
        twos = dist['2'] || 0;
        threes = dist['3'] || 0;
        fours = dist['4'] || 0;
        fives = dist['5'] || 0;
      }
    });
  }

  const data = {
    labels: ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'],
    datasets: [{
      label: 'Count',
      data: [ones, twos, threes, fours, fives],
      backgroundColor: '#f59e0b',
      borderRadius: 4
    }]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
  };
  createOrUpdateChart('ratingBar', 'bar', data, options);
}

function renderTrendLine(trend) {
  const dates = trend.map(t => t.date);
  const data = {
    labels: dates,
    datasets: [
      {
        label: 'Positive',
        data: trend.map(t => t.positive || 0),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'Negative',
        data: trend.map(t => t.negative || 0),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top' } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };
  createOrUpdateChart('sentimentTrend', 'line', data, options);
}
