/**
 * InsightLoop — Dashboard Page Controller
 * =========================================
 * Orchestrates all data fetching and rendering for pages/dashboard.html.
 *
 * Sections handled:
 *   A  → Stat Cards          renderStatCards(data)
 *   B  → Sentiment Trend     renderTrendChart(trend)
 *   C  → Urgency Donut       renderUrgencyChart(data)
 *   D  → Top Topics Bar      renderTopicsChart(data)
 *   E  → Form Performance    renderFormsTable(forms)
 *   F  → Recent Responses    renderRecentTable(responses)
 *   G  → Alerts Panel        renderAlerts(alerts)
 *
 * Error strategy:
 *   Each section is independently try/catched.
 *   Network failures show an inline error state — no mock data.
 *
 * APIs consumed (all require JWT via apiFetch):
 *   GET /api/analytics/dashboard
 *   GET /api/analytics/sentiment-trend?days=N
 *   GET /api/analytics/forms-performance
 *   GET /api/analytics/recent-responses?limit=15
 *   GET /api/alerts
 *   PATCH /api/alerts/:id/read
 *   PATCH /api/alerts/read-all
 */

import { requireAuth, apiFetch, loadComponent } from './config.js';

// ── Auth guard — redirect to login if no token ──────────────────────────────
requireAuth();

// ── Inject shared components ────────────────────────────────────────────────
loadComponent('#sidebar-container', '../components/sidebar.html').then(() => {
    // Lucide must re-render after components are injected into DOM
    if (window.lucide) window.lucide.createIcons();
});
loadComponent('#navbar-container', '../components/navbar.html').then(() => {
    if (window.lucide) window.lucide.createIcons();
});

// ── Chart.js instances (kept at module scope for update/destroy) ─────────────
let sentimentChart = null;
let urgencyChart = null;
let topicsChart = null;

// ── Current trend period (days) ──────────────────────────────────────────────
let activeTrendDays = 7;


/* ═══════════════════════════════════════════════════════════════════════════
   CHART.JS GLOBAL DEFAULTS
   Applied once so all charts share the app's dark theme.
   ═══════════════════════════════════════════════════════════════════════════ */

function applyChartDefaults() {
    const style = getComputedStyle(document.documentElement);
    const textMuted = style.getPropertyValue('--text-muted').trim() || '#64748b';
    const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#94a3b8';
    const borderColor = style.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.06)';
    const bgRaised = style.getPropertyValue('--bg-raised').trim() || '#12121a';

    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = textSecondary;
    Chart.defaults.borderColor = borderColor;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = bgRaised;
    Chart.defaults.plugins.tooltip.borderColor = borderColor;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = '#f1f5f9';
    Chart.defaults.plugins.tooltip.bodyColor = textSecondary;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
}


/* ═══════════════════════════════════════════════════════════════════════════
   UTILITY HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Convert an ISO timestamp into a human-readable relative string.
 * e.g. "2 hours ago", "Yesterday", "3 days ago"
 * @param {string} isoString
 * @returns {string}
 */
function timeAgo(isoString) {
    if (!isoString) return '—';
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
}

/**
 * Format a large number with comma separators.
 * @param {number} n
 * @returns {string}
 */
function fmt(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString();
}

/**
 * Format a percentage to one decimal place with a % suffix.
 * @param {number} n
 * @returns {string}
 */
function pct(n) {
    if (n === null || n === undefined) return '—';
    return `${Number(n).toFixed(1)}%`;
}

/**
 * Truncate a string to maxLen characters, appending '…' if needed.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen = 70) {
    if (!str) return '—';
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/**
 * Render a standardised error/empty state box into a container element.
 * @param {HTMLElement} container - The element to replace with the state box
 * @param {'error'|'empty'} type
 * @param {string} message - User-facing message
 * @param {string} [ctaText] - Optional call-to-action link text
 * @param {string} [ctaHref] - Optional CTA href
 */
function showStateBox(container, type, message, ctaText, ctaHref) {
    const icon = type === 'error' ? 'wifi-off' : 'inbox';
    container.innerHTML = `
    <div class="state-box ${type === 'error' ? 'error' : ''}">
      <i data-lucide="${icon}"></i>
      <p>${message}</p>
      ${ctaText ? `<a href="${ctaHref || '#'}" class="state-cta">${ctaText}</a>` : ''}
    </div>`;
    if (window.lucide) window.lucide.createIcons();
}


/* ═══════════════════════════════════════════════════════════════════════════
   SECTION A — STAT CARDS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Render the six stat cards from dashboard API data.
 * Clicking the alerts card scrolls to #section-alerts.
 *
 * @param {Object} data - Response from GET /api/analytics/dashboard
 */
function renderStatCards(data) {
    const grid = document.getElementById('stat-grid');
    if (!grid) return;

    const s = data.stat_cards;
    const pr = data.positive_rate;

    // Delta arrow for positive rate card
    const deltaUp = pr.delta >= 0;
    const deltaIcon = deltaUp ? 'trending-up' : 'trending-down';
    const deltaClass = deltaUp ? 'up' : 'down';
    const deltaSign = deltaUp ? '+' : '';

    const cards = [
        {
            id: 'card-total',
            icon: 'message-square',
            value: fmt(s.total_responses),
            label: 'Total Responses',
            context: `+${fmt(s.responses_this_week)} this week`,
        },
        {
            id: 'card-forms',
            icon: 'layout-template',
            value: fmt(s.active_forms),
            label: 'Active Forms',
            context: 'collecting feedback',
        },
        {
            id: 'card-complaints',
            icon: 'alert-triangle',
            value: fmt(s.complaints_this_month),
            valueCls: s.complaints_this_month > 0 ? 'danger' : '',
            label: 'Complaints',
            context: 'this month',
        },
        {
            id: 'card-alerts',
            icon: 'bell',
            value: fmt(s.unread_alerts),
            valueCls: s.unread_alerts > 0 ? 'danger' : '',
            label: 'Unread Alerts',
            context: s.unread_alerts > 0 ? 'Click to view' : 'All clear',
            badge: s.unread_alerts > 0 ? s.unread_alerts : null,
            clickable: true,
            onclick: "document.getElementById('section-alerts')?.scrollIntoView({behavior:'smooth'})",
        },
        {
            id: 'card-posrate',
            icon: 'percent',
            value: pct(pr.current_30d),
            label: 'Positive Rate',
            delta: { value: `${deltaSign}${pct(pr.delta)} vs last month`, cls: deltaClass, icon: deltaIcon },
        },
        {
            id: 'card-today',
            icon: 'calendar',
            value: fmt(s.responses_today),
            label: 'Responses Today',
            context: s.responses_today === 0 ? 'No responses yet today' : 'since midnight',
        },
    ];

    grid.innerHTML = cards.map(c => `
    <div class="stat-card ${c.clickable ? 'clickable' : ''}"
         id="${c.id}"
         ${c.onclick ? `onclick="${c.onclick}" role="button" tabindex="0"` : ''}>
      <div class="stat-card-header">
        <div class="stat-card-icon"><i data-lucide="${c.icon}"></i></div>
        ${c.badge ? `<span class="stat-badge">${c.badge}</span>` : ''}
      </div>
      <div class="stat-card-value ${c.valueCls || ''}">${c.value}</div>
      <div class="stat-card-footer">
        <span class="stat-card-label">${c.label}</span>
        ${c.delta
            ? `<span class="stat-delta ${c.delta.cls}">
               <i data-lucide="${c.delta.icon}"></i>${c.delta.value}
             </span>`
            : `<span class="stat-card-context">${c.context || ''}</span>`}
      </div>
    </div>`).join('');

    if (window.lucide) window.lucide.createIcons();

    // Also update the navbar alert badge
    const navBadge = document.getElementById('topbar-alert-badge');
    if (navBadge) {
        if (s.unread_alerts > 0) {
            navBadge.textContent = s.unread_alerts;
            navBadge.style.display = 'flex';
        } else {
            navBadge.style.display = 'none';
        }
    }
}

/**
 * Show skeleton rows in the stat grid while loading.
 */
function showStatCardSkeletons() {
    const grid = document.getElementById('stat-grid');
    if (!grid) return;
    grid.innerHTML = Array(6).fill('<div class="stat-card skeleton"></div>').join('');
}


/* ═══════════════════════════════════════════════════════════════════════════
   SECTION B — SENTIMENT TREND LINE CHART
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Render (or update) the sentiment trend line chart.
 * Destroys existing chart instance before re-creating.
 *
 * @param {Array<{date:string, positive:number, neutral:number, negative:number}>} trend
 */
function renderTrendChart(trend) {
    const wrapper = document.getElementById('trend-chart-wrapper');
    if (!wrapper) return;

    if (!trend || trend.length === 0) {
        showStateBox(wrapper, 'empty', 'No data for this period.');
        return;
    }

    // Restore canvas if it was replaced by a state-box
    if (!wrapper.querySelector('canvas')) {
        wrapper.innerHTML = '<canvas id="sentiment-trend-chart"></canvas>';
    }

    const canvas = document.getElementById('sentiment-trend-chart');
    if (!canvas) return;

    if (sentimentChart) {
        sentimentChart.destroy();
        sentimentChart = null;
    }

    sentimentChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: trend.map(d => d.date),
            datasets: [
                {
                    label: 'Positive',
                    data: trend.map(d => d.positive),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.08)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                },
                {
                    label: 'Neutral',
                    data: trend.map(d => d.neutral),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.08)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                },
                {
                    label: 'Negative',
                    data: trend.map(d => d.negative),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239,68,68,0.08)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: { usePointStyle: true, pointStyleWidth: 8, boxHeight: 8, font: { size: 11 } },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 8, font: { size: 11 } },
                },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0, font: { size: 11 } },
                },
            },
        },
    });
}

/**
 * Handle period tab clicks (7d / 30d / 90d).
 * Re-fetches only the trend endpoint on switch.
 */
function initPeriodTabs() {
    const tabs = document.getElementById('period-tabs');
    if (!tabs) return;

    tabs.addEventListener('click', async (e) => {
        const btn = e.target.closest('.period-tab');
        if (!btn) return;

        const days = parseInt(btn.dataset.days, 10);
        if (days === activeTrendDays) return;

        // Update active tab UI
        tabs.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        activeTrendDays = days;

        try {
            const data = await apiFetch(`/api/analytics/sentiment-trend?days=${days}`);
            renderTrendChart(data.trend);
        } catch (err) {
            const wrapper = document.getElementById('trend-chart-wrapper');
            showStateBox(wrapper, 'error', `Failed to load trend data: ${err.message}`);
        }
    });
}

/* ---------------------------------------------------------------------------
   SECTION C � URGENCY DONUT CHART
   --------------------------------------------------------------------------- */

function renderUrgencyChart(urgency) {
    const wrapper = document.getElementById('urgency-chart-wrapper');
    const legend = document.getElementById('urgency-legend');
    if (!wrapper) return;
    const total = (urgency.low || 0) + (urgency.medium || 0) + (urgency.high || 0);
    if (total === 0) { showStateBox(wrapper, 'empty', 'No urgency data for the last 30 days.'); return; }
    if (!wrapper.querySelector('canvas')) wrapper.innerHTML = '<canvas id="urgency-donut-chart"></canvas>';
    const canvas = document.getElementById('urgency-donut-chart');
    if (!canvas) return;
    if (urgencyChart) { urgencyChart.destroy(); urgencyChart = null; }
    const COLORS = ['#3b82f6', '#f59e0b', '#ef4444'];
    const labels = ['Low', 'Medium', 'High'];
    const values = [urgency.low || 0, urgency.medium || 0, urgency.high || 0];
    urgencyChart = new Chart(canvas, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: COLORS, borderWidth: 0, hoverOffset: 6 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} (${((ctx.raw / total) * 100).toFixed(1)}%)` } },
            },
        },
    });
    if (legend) {
        legend.innerHTML = labels.map((lbl, i) => `
      <div class="donut-legend-item">
        <div class="donut-legend-left"><span class="donut-dot" style="background:${COLORS[i]}"></span>${lbl}</div>
        <div class="donut-legend-right">${values[i]}<span class="donut-legend-pct">(${total ? ((values[i] / total) * 100).toFixed(0) : 0}%)</span></div>
      </div>`).join('');
    }
}

/* ---------------------------------------------------------------------------
   SECTION D � TOP TOPICS HORIZONTAL BAR CHART
   --------------------------------------------------------------------------- */

function renderTopicsChart(topics) {
    const wrapper = document.getElementById('topics-chart-wrapper');
    if (!wrapper) return;
    if (!topics || topics.length === 0) { showStateBox(wrapper, 'empty', 'Topics will appear once feedback is analyzed.'); return; }
    if (!wrapper.querySelector('canvas')) wrapper.innerHTML = '<canvas id="topics-bar-chart"></canvas>';
    const canvas = document.getElementById('topics-bar-chart');
    if (!canvas) return;
    if (topicsChart) { topicsChart.destroy(); topicsChart = null; }
    topicsChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: topics.map(t => t.topic),
            datasets: [{ data: topics.map(t => t.count), backgroundColor: 'rgba(99,102,241,0.7)', hoverBackgroundColor: 'rgba(99,102,241,1)', borderRadius: 4, borderSkipped: false }],
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
                y: { ticks: { font: { size: 12 } }, grid: { display: false } },
            },
        },
    });
}

/* ---------------------------------------------------------------------------
   SECTION E � FORM PERFORMANCE TABLE
   --------------------------------------------------------------------------- */

function renderFormsTable(forms) {
    const wrapper = document.getElementById('forms-table-wrapper');
    const tbody = document.getElementById('forms-table-body');
    if (!tbody) return;
    if (!forms || forms.length === 0) {
        showStateBox(wrapper, 'empty', 'No forms created yet.', 'Create your first form', 'form-builder.html');
        return;
    }
    tbody.innerHTML = forms.map(f => {
        const negPct = f.total_responses > 0 ? ((f.negative_count / f.total_responses) * 100).toFixed(1) : '0.0';
        return `<tr>
      <td><div class="table-form-name" title="${f.title}">${f.title}</div></td>
      <td><span class="status-pill ${f.is_active ? 'active' : 'inactive'}">${f.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>${fmt(f.total_responses)}</td>
      <td class="pct-positive">${pct(f.positive_pct)}</td>
      <td class="pct-negative">${negPct}%</td>
      <td class="${f.complaint_count > 0 ? 'complaint-count' : ''}">${fmt(f.complaint_count)}</td>
      <td>${timeAgo(f.last_response_at)}</td>
      <td><a href="form-detail.html?form_id=${f.form_id}" class="table-action">View <i data-lucide="arrow-right"></i></a></td>
    </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

function showFormsTableSkeleton() {
    const tbody = document.getElementById('forms-table-body');
    if (!tbody) return;
    tbody.innerHTML = Array(3).fill(`<tr>${Array(8).fill('<td><div class="skeleton" style="height:14px;border-radius:4px;"></div></td>').join('')}</tr>`).join('');
}

/* ---------------------------------------------------------------------------
   SECTION F � RECENT RESPONSES TABLE
   --------------------------------------------------------------------------- */

function renderRecentTable(responses) {
    const wrapper = document.getElementById('recent-table-wrapper');
    const tbody = document.getElementById('recent-table-body');
    if (!tbody) return;
    if (!responses || responses.length === 0) {
        showStateBox(wrapper, 'empty', 'No feedback received yet. Share your QR code to start collecting.');
        return;
    }
    tbody.innerHTML = responses.map(r => `<tr>
    <td class="table-form-name" title="${r.form_title || ''}" style="max-width:140px;">${r.form_title || '�'}</td>
    <td style="white-space:nowrap;">${timeAgo(r.submitted_at)}</td>
    <td><span class="badge badge-${r.sentiment || 'neutral'}">${r.sentiment || '�'}</span></td>
    <td><span class="badge badge-${r.urgency || 'low'}">${r.urgency || '�'}</span></td>
    <td>${r.dominant_topic || '�'}</td>
    <td class="summary-cell" title="${r.summary || ''}">${truncate(r.summary, 70)}</td>
    <td><a href="form-detail.html?response_id=${r.response_id}" class="table-action">View <i data-lucide="arrow-right"></i></a></td>
  </tr>`).join('');
    if (window.lucide) window.lucide.createIcons();
}

function showRecentTableSkeleton() {
    const tbody = document.getElementById('recent-table-body');
    if (!tbody) return;
    tbody.innerHTML = Array(5).fill(`<tr>${Array(7).fill('<td><div class="skeleton" style="height:14px;border-radius:4px;"></div></td>').join('')}</tr>`).join('');
}

/* ---------------------------------------------------------------------------
   SECTION G � ALERTS PANEL
   --------------------------------------------------------------------------- */

function renderAlerts(alerts) {
    const section = document.getElementById('section-alerts');
    const list = document.getElementById('alerts-list');
    const title = document.getElementById('alerts-panel-title');
    if (!section || !list) return;
    if (!alerts || alerts.length === 0) { section.style.display = 'none'; return; }
    section.style.display = '';
    if (title) title.textContent = `${alerts.length} Unread Alert${alerts.length > 1 ? 's' : ''}`;
    list.innerHTML = alerts.map(a => `
    <div class="alert-card" id="alert-${a.alert_id}">
      <div class="alert-card-icon"><i data-lucide="zap"></i></div>
      <div class="alert-card-body">
        <div class="alert-type">${formatAlertType(a.alert_type)}</div>
        <div class="alert-message">${a.message}</div>
        <div class="alert-meta">
          <span class="alert-form-name">${a.form_title || 'Unknown form'}</span>
          <span>${timeAgo(a.created_at)}</span>
        </div>
      </div>
      <button class="btn-dismiss" onclick="dismissAlert('${a.alert_id}')" aria-label="Mark as read">
        <i data-lucide="check"></i> Mark as Read
      </button>
    </div>`).join('');
    if (window.lucide) window.lucide.createIcons();
    const markAllBtn = document.getElementById('btn-mark-all-read');
    if (markAllBtn) markAllBtn.onclick = markAllAlertsRead;
}

function formatAlertType(type) {
    if (!type) return 'Alert';
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function dismissAlert(alertId) {
    const card = document.getElementById(`alert-${alertId}`);
    try { await apiFetch(`/api/alerts/${alertId}/read`, { method: 'PATCH' }); }
    catch (err) { console.error('Failed to mark alert as read:', err.message); }
    if (card) {
        card.classList.add('dismissed');
        card.addEventListener('animationend', () => { card.remove(); checkAlertsEmpty(); }, { once: true });
    }
    decrementAlertBadge();
}

async function markAllAlertsRead() {
    try { await apiFetch('/api/alerts/read-all', { method: 'PATCH' }); }
    catch (err) { console.error('Failed to mark all alerts as read:', err.message); }
    document.querySelectorAll('.alert-card').forEach(c => c.classList.add('dismissed'));
    setTimeout(() => {
        const section = document.getElementById('section-alerts');
        if (section) section.style.display = 'none';
        const badge = document.getElementById('topbar-alert-badge');
        if (badge) badge.style.display = 'none';
    }, 400);
}

function checkAlertsEmpty() {
    const list = document.getElementById('alerts-list');
    const section = document.getElementById('section-alerts');
    if (list && list.children.length === 0 && section) section.style.display = 'none';
}

function decrementAlertBadge() {
    const badge = document.getElementById('topbar-alert-badge');
    if (!badge) return;
    const current = parseInt(badge.textContent, 10) - 1;
    if (current <= 0) badge.style.display = 'none';
    else badge.textContent = current;
}

/* ---------------------------------------------------------------------------
   MAIN INITIALISATION
   All 5 API calls run in parallel via Promise.allSettled.
   One failing API does not block the rest of the dashboard.
   --------------------------------------------------------------------------- */

async function initDashboard() {
    applyChartDefaults();
    initPeriodTabs();
    showStatCardSkeletons();
    showFormsTableSkeleton();
    showRecentTableSkeleton();

    const [dashResult, trendResult, formsResult, recentResult, alertsResult] = await Promise.allSettled([
        apiFetch('/api/analytics/dashboard'),
        apiFetch(`/api/analytics/sentiment-trend?days=${activeTrendDays}`),
        apiFetch('/api/analytics/forms-performance'),
        apiFetch('/api/analytics/recent-responses?limit=15'),
        apiFetch('/api/alerts'),
    ]);

    if (dashResult.status === 'fulfilled') {
        renderStatCards(dashResult.value);
        renderUrgencyChart(dashResult.value.urgency_breakdown_30d || {});
        renderTopicsChart(dashResult.value.top_topics_30d || []);
    } else {
        const msg = dashResult.reason?.message || 'API unavailable';
        showStateBox(document.getElementById('stat-grid'), 'error', `Could not load dashboard stats: ${msg}`);
        showStateBox(document.getElementById('urgency-chart-wrapper'), 'error', `API unavailable: ${msg}`);
        showStateBox(document.getElementById('topics-chart-wrapper'), 'error', `API unavailable: ${msg}`);
    }

    if (trendResult.status === 'fulfilled') {
        renderTrendChart(trendResult.value.trend || []);
    } else {
        showStateBox(document.getElementById('trend-chart-wrapper'), 'error',
            `Could not load trend data: ${trendResult.reason?.message || 'API unavailable'}`);
    }

    if (formsResult.status === 'fulfilled') {
        renderFormsTable(formsResult.value.forms || []);
    } else {
        showStateBox(document.getElementById('forms-table-wrapper'), 'error',
            `Could not load form data: ${formsResult.reason?.message || 'API unavailable'}`);
    }

    if (recentResult.status === 'fulfilled') {
        renderRecentTable(recentResult.value.responses || []);
    } else {
        showStateBox(document.getElementById('recent-table-wrapper'), 'error',
            `Could not load responses: ${recentResult.reason?.message || 'API unavailable'}`);
    }

    if (alertsResult.status === 'fulfilled') renderAlerts(alertsResult.value.alerts || []);

    if (window.lucide) window.lucide.createIcons();
}

window.dismissAlert = dismissAlert;
initDashboard();
