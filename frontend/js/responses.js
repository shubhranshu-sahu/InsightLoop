import { requireAuth, apiFetch, loadComponent, getUser } from './config.js';

// Require authentication
requireAuth();

// ── Inject shared components ──────────────────────────────────────────────────
loadComponent('#sidebar-container', '../components/sidebar.html').then(() => {
  if (window.lucide) window.lucide.createIcons();
});
loadComponent('#navbar-container', '../components/navbar.html').then(() => {
  if (window.lucide) window.lucide.createIcons();
});

// Expose lucide icons render
if (window.lucide) {
  window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', () => {
  const business = getUser();
  if (business) {
    const brandEl = document.querySelector('.sidebar-brand');
    if (brandEl) {
      // You can update brand or do other things
    }
  }

  init();
});

let allResponses = [];
let activeFilters = { sentiment: 'all', urgency: 'all', complaints: false };
let responseModalInstance = null;

async function init() {
  responseModalInstance = new bootstrap.Modal(document.getElementById('responseModal'));

  setupEventListeners();
  await loadForms();
}

function setupEventListeners() {
  document.getElementById('formSelector').addEventListener('change', e => {
    if (e.target.value) {
      loadResponses(e.target.value);
    } else {
      document.getElementById('filterBar').style.display = 'none';
      document.getElementById('statsBar').style.display = 'none';
      document.getElementById('responsesList').innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <p>Please select a form to view responses.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
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
  
  // Modal close via our custom button
  document.querySelector('#responseModal .btn-ghost').addEventListener('click', () => {
    responseModalInstance.hide();
  });
  
  // Attach event delegation for response tile clicks
  document.getElementById('responsesList').addEventListener('click', e => {
    const tile = e.target.closest('.response-tile');
    if (tile && tile.dataset.responseId) {
      openModal(tile.dataset.responseId);
    }
  });
}

async function loadForms() {
  try {
    const select = document.getElementById('formSelector');
    // Set a loading option
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
    } else {
      select.innerHTML = '<option value="">No forms found</option>';
      select.disabled = true;
    }
  } catch (err) {
    console.error('Failed to load forms', err);
    document.getElementById('formSelector').innerHTML = '<option value="">Error loading forms</option>';
  }
}

async function loadResponses(formId) {
  document.getElementById('filterBar').style.display = 'flex';
  document.getElementById('statsBar').style.display = 'flex';
  
  // Show skeleton loader
  const list = document.getElementById('responsesList');
  list.innerHTML = `
    <div class="skeleton-row">
      <div class="skel-left"><div class="skeleton" style="height:24px;border-radius:12px;"></div><div class="skeleton" style="height:24px;border-radius:12px;"></div></div>
      <div class="skel-center"><div class="skeleton" style="height:18px;width:100%;"></div><div class="skeleton" style="height:12px;width:40%;"></div></div>
    </div>
    <div class="skeleton-row">
      <div class="skel-left"><div class="skeleton" style="height:24px;border-radius:12px;"></div><div class="skeleton" style="height:24px;border-radius:12px;"></div></div>
      <div class="skel-center"><div class="skeleton" style="height:18px;width:90%;"></div><div class="skeleton" style="height:12px;width:30%;"></div></div>
    </div>
    <div class="skeleton-row">
      <div class="skel-left"><div class="skeleton" style="height:24px;border-radius:12px;"></div><div class="skeleton" style="height:24px;border-radius:12px;"></div></div>
      <div class="skel-center"><div class="skeleton" style="height:18px;width:95%;"></div><div class="skeleton" style="height:12px;width:50%;"></div></div>
    </div>
  `;

  try {
    const data = await apiFetch(`/api/responses/form/${formId}`);
    allResponses = data.responses || [];
    updateStats();
    applyFilters();
  } catch (err) {
    console.error('Failed to load responses', err);
    list.innerHTML = `
      <div class="empty-state">
        <i data-lucide="alert-circle" style="color:var(--negative)"></i>
        <p>Failed to load responses: ${err.message}</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
}

function updateStats() {
  const total = allResponses.length;
  const positive = allResponses.filter(r => r.ai_analysis?.overall_sentiment === 'positive').length;
  const posPct = total ? Math.round((positive / total) * 100) : 0;
  const complaints = allResponses.filter(r => r.ai_analysis?.is_complaint).length;
  const pending = allResponses.filter(r => !r.ai_analysis || r.ai_analysis.status === 'pending').length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statPositive').textContent = posPct + '%';
  document.getElementById('statComplaint').textContent = complaints;
  document.getElementById('statPending').textContent = pending;
}

function applyFilters() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;

  const filtered = allResponses.filter(r => {
    const ai = r.ai_analysis || {};
    const s = ai.overall_sentiment || 'neutral';
    const u = ai.urgency || 'low';
    const ic = ai.is_complaint || false;
    const summary = (ai.summary || '').toLowerCase();
    const date = new Date(r.submitted_at);

    if (activeFilters.sentiment !== 'all' && s !== activeFilters.sentiment) return false;
    if (activeFilters.urgency !== 'all' && u !== activeFilters.urgency) return false;
    if (activeFilters.complaints && !ic) return false;
    if (search && !summary.includes(search)) return false;
    if (dateFrom && date < new Date(dateFrom)) return false;
    if (dateTo && date > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  renderResponses(filtered);
}

function renderResponses(responses) {
  const list = document.getElementById('responsesList');
  if (!responses.length) {
    list.innerHTML = `
      <div class="empty-state">
        <i data-lucide="inbox"></i>
        <p>No responses match your filters.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }
  
  list.innerHTML = responses.map(r => buildTileHTML(r)).join('');
  if (window.lucide) window.lucide.createIcons();
}

function buildTileHTML(r) {
  const ai = r.ai_analysis || {};
  const isPending = !ai.status || ai.status === 'pending';
  const summary = ai.summary ? ai.summary.slice(0, 150) + (ai.summary.length > 150 ? '...' : '') : 'AI analysis in progress...';
  const sentiment = ai.overall_sentiment || 'neutral';
  const urgency = ai.urgency || 'low';
  const topic = ai.dominant_topic || '';
  const dateObj = new Date(r.submitted_at);
  const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (isPending) {
    return `
      <div class="response-tile pending" data-response-id="${r.response_id}">
        <div class="response-tile-left">
          <span class="pending-badge"><i data-lucide="loader-2" class="spin" style="width:12px;height:12px;"></i> Analyzing</span>
        </div>
        <div class="response-tile-center">
          <p class="response-summary">${summary}</p>
          <div class="response-meta">
            <span class="response-date"><i data-lucide="clock"></i> ${dateStr} · ${timeStr}</span>
          </div>
        </div>
        <div class="response-tile-right"><i data-lucide="chevron-right"></i></div>
      </div>
    `;
  }

  return `
    <div class="response-tile" data-response-id="${r.response_id}">
      <div class="response-tile-left">
        <span class="badge-sentiment ${sentiment}">${capitalize(sentiment)}</span>
      </div>
      <div class="response-tile-center">
        <p class="response-summary">${escapeHTML(summary)}</p>
        <div class="response-meta">
          ${topic ? `<span class="response-topic"><i data-lucide="tag"></i> ${escapeHTML(topic)}</span>` : ''}
          <span class="response-date"><i data-lucide="clock"></i> ${dateStr} · ${timeStr}</span>
        </div>
      </div>
      <div class="response-tile-right">
        <span class="badge-urgency ${urgency}">${capitalize(urgency)}</span>
        <i data-lucide="chevron-right" class="chevron-icon"></i>
      </div>
    </div>
  `;
}

function openModal(responseId) {
  const response = allResponses.find(r => r.response_id === responseId);
  if (!response) return;

  const ai = response.ai_analysis || {};
  const isPending = !ai.status || ai.status === 'pending';
  
  // Populate badges
  const sentEl = document.getElementById('modalSentiment');
  const urgEl = document.getElementById('modalUrgency');
  const compEl = document.getElementById('modalComplaint');
  
  if (isPending) {
    sentEl.textContent = 'Pending';
    sentEl.className = 'badge-sentiment neutral';
    urgEl.style.display = 'none';
    compEl.style.display = 'none';
    document.getElementById('modalSummary').textContent = 'AI analysis in progress...';
    document.getElementById('modalTopic').textContent = '—';
    document.getElementById('keyPhrasesSection').style.display = 'none';
  } else {
    sentEl.textContent = capitalize(ai.overall_sentiment || 'neutral');
    sentEl.className = `badge-sentiment ${ai.overall_sentiment || 'neutral'}`;
    
    urgEl.style.display = 'inline-flex';
    urgEl.textContent = capitalize(ai.urgency || 'low');
    urgEl.className = `badge-urgency ${ai.urgency || 'low'}`;
    
    compEl.style.display = ai.is_complaint ? 'inline-flex' : 'none';
    
    document.getElementById('modalSummary').textContent = ai.summary || 'No summary available.';
    document.getElementById('modalTopic').textContent = ai.dominant_topic || '—';
    
    // Key phrases
    const phrases = ai.key_phrases || [];
    const kpSection = document.getElementById('keyPhrasesSection');
    const kpContainer = document.getElementById('modalKeyPhrases');
    
    if (phrases.length > 0) {
      kpContainer.innerHTML = phrases.map(p => `<span class="key-phrase-chip">${escapeHTML(p)}</span>`).join('');
      kpSection.style.display = 'block';
    } else {
      kpSection.style.display = 'none';
    }
  }

  // Date
  const dateObj = new Date(response.submitted_at);
  document.getElementById('modalDate').textContent = `${dateObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} at ${dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

  // Answers
  renderModalAnswers(response);

  if (window.lucide) window.lucide.createIcons();
  responseModalInstance.show();
}

function renderModalAnswers(response) {
  const container = document.getElementById('modalAnswers');
  container.innerHTML = '';

  const answers = response.answers || {};
  const perText = response.ai_analysis?.per_text_analysis || {};

  Object.entries(answers).forEach(([qId, ans]) => {
    const block = document.createElement('div');
    block.className = 'answer-block';

    const label = document.createElement('p');
    label.className = 'answer-label';
    label.textContent = ans.label || 'Question';
    block.appendChild(label);

    if (ans.type === 'rating') {
      const stars = document.createElement('div');
      stars.className = 'answer-stars';
      const val = parseInt(ans.value, 10) || 0;
      for (let i = 1; i <= 5; i++) {
        stars.innerHTML += `<i data-lucide="star" class="${i <= val ? 'star-filled' : 'star-empty'}"></i>`;
      }
      stars.innerHTML += `<span class="answer-rating-num">${val}/5</span>`;
      block.appendChild(stars);
    } 
    else if (ans.type === 'text') {
      const p = document.createElement('p');
      p.className = 'answer-text';
      p.textContent = `"${ans.value}"`;
      block.appendChild(p);

      if (perText[qId]) {
        const aiData = perText[qId];
        const aiBox = document.createElement('div');
        aiBox.className = 'per-text-ai';
        aiBox.innerHTML = `
          <span class="badge-sentiment ${aiData.sentiment || 'neutral'}">${capitalize(aiData.sentiment || 'neutral')}</span>
          <span class="per-text-intent">${capitalize(aiData.intent || 'info')}</span>
          ${aiData.topics && aiData.topics.length ? `<span class="per-text-topics">${escapeHTML(aiData.topics.join(', '))}</span>` : ''}
        `;
        block.appendChild(aiBox);
      }
    } 
    else if (ans.type === 'yesno') {
      const p = document.createElement('p');
      p.className = 'answer-yesno ' + (ans.value ? 'yes' : 'no');
      p.innerHTML = ans.value 
        ? `<i data-lucide="check-circle-2"></i> Yes` 
        : `<i data-lucide="x-circle"></i> No`;
      block.appendChild(p);
    }

    container.appendChild(block);
  });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
