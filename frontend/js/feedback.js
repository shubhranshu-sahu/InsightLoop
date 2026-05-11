/**
 * InsightLoop — feedback.js
 * Public customer feedback form.
 * Reads ?form_id=uuid from URL, loads form, submits responses.
 */

const API_BASE = 'https://insightloop-backend.onrender.com';

// ── State ─────────────────────────────────────────────────────────────────────
let formData   = null;   // { form_id, title, description, business_name, questions[] }
let answers    = {};     // { question_id: value }
let answered   = 0;      // count of answered questions

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  show('state-loading');

  const params = new URLSearchParams(window.location.search);
  const formId = params.get('form_id');

  if (!formId) {
    showError('No form ID provided in the URL.');
    return;
  }

  try {
    const res  = await fetch(`${API_BASE}/api/feedback/form/${formId}`);
    const data = await res.json();

    if (res.status === 404) { showError('This form could not be found.'); return; }
    if (res.status === 410 || data?.form?.is_active === 0) { show('state-inactive'); return; }
    if (!res.ok) { showError(data?.error || 'Failed to load form.'); return; }

    formData = data.form;
    renderForm();

  } catch (e) {
    showError('Unable to connect. Please check your internet connection.');
  }
})();

// ── Render form ───────────────────────────────────────────────────────────────
function renderForm() {
  document.title = `${formData.title} — InsightLoop`;
  document.getElementById('fb-business-name').textContent = formData.business_name || 'Feedback Form';
  document.getElementById('fb-title').textContent         = formData.title;
  document.getElementById('fb-desc').textContent          = formData.description || '';

  const container = document.getElementById('fb-questions');
  const questions = [...formData.questions].sort((a, b) => a.order_index - b.order_index);

  questions.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'fb-card';
    card.id = `card-${q.question_id}`;

    const required = q.is_required ? '<span class="fb-required">Required</span>' : '';

    card.innerHTML = `
      <div class="fb-q-meta">
        <div class="fb-q-num">${i + 1}</div>
        <div class="fb-q-text">${q.question_text}</div>
        ${required}
      </div>
      <div class="fb-q-input" id="input-${q.question_id}"></div>
      <div class="fb-error-msg" id="err-${q.question_id}" style="display:none;">This question is required.</div>
    `;

    container.appendChild(card);

    const inputEl = document.getElementById(`input-${q.question_id}`);

    if (q.question_type === 'rating') {
      renderRating(inputEl, q.question_id);
    } else if (q.question_type === 'yesno') {
      renderYesNo(inputEl, q.question_id);
    } else {
      renderText(inputEl, q.question_id);
    }
  });

  show('state-form');
}

// ── Rating stars ──────────────────────────────────────────────────────────────
function renderRating(el, qId) {
  const row = document.createElement('div');
  row.className = 'star-row';

  for (let v = 1; v <= 5; v++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star-btn';
    btn.dataset.value = v;
    btn.setAttribute('aria-label', `${v} star${v > 1 ? 's' : ''}`);
    btn.innerHTML = starSVG();
    row.appendChild(btn);
  }

  el.appendChild(row);

  const stars = row.querySelectorAll('.star-btn');

  // Hover
  stars.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      const v = +btn.dataset.value;
      stars.forEach(s => {
        s.classList.toggle('hovered', +s.dataset.value <= v && !s.classList.contains('active'));
      });
    });
    btn.addEventListener('mouseleave', () => stars.forEach(s => s.classList.remove('hovered')));

    // Select
    btn.addEventListener('click', () => {
      const v = +btn.dataset.value;
      answers[qId] = v;
      stars.forEach(s => s.classList.toggle('active', +s.dataset.value <= v));
      markAnswered(qId);
    });
  });
}

function starSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`;
}

// ── Yes / No ──────────────────────────────────────────────────────────────────
function renderYesNo(el, qId) {
  el.innerHTML = `
    <div class="yn-row">
      <button type="button" class="yn-btn" id="yn-yes-${qId}" onclick="selectYN('${qId}', true)">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
        Yes
      </button>
      <button type="button" class="yn-btn" id="yn-no-${qId}" onclick="selectYN('${qId}', false)">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        No
      </button>
    </div>`;
}

function selectYN(qId, val) {
  answers[qId] = val;
  const yes = document.getElementById(`yn-yes-${qId}`);
  const no  = document.getElementById(`yn-no-${qId}`);
  yes.className = 'yn-btn' + (val === true  ? ' selected-yes' : '');
  no.className  = 'yn-btn' + (val === false ? ' selected-no'  : '');
  markAnswered(qId);
}

// ── Text ──────────────────────────────────────────────────────────────────────
function renderText(el, qId) {
  const ta = document.createElement('textarea');
  ta.className   = 'fb-textarea';
  ta.placeholder = 'Share your thoughts…';
  ta.rows        = 4;
  ta.addEventListener('input', () => {
    answers[qId] = ta.value.trim();
    if (ta.value.trim()) markAnswered(qId);
    else markUnanswered(qId);
  });
  el.appendChild(ta);
}

// ── Progress tracking ─────────────────────────────────────────────────────────
function markAnswered(qId) {
  const card = document.getElementById(`card-${qId}`);
  if (card && !card.classList.contains('answered')) {
    card.classList.add('answered');
    card.classList.remove('error');
    document.getElementById(`err-${qId}`).style.display = 'none';
    answered++;
    updateProgress();
  }
}

function markUnanswered(qId) {
  const card = document.getElementById(`card-${qId}`);
  if (card && card.classList.contains('answered')) {
    card.classList.remove('answered');
    answered--;
    updateProgress();
  }
}

function updateProgress() {
  const total = formData.questions.length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  document.getElementById('fb-progress').style.width = pct + '%';
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function submitFeedback() {
  // Validate required fields
  const questions = formData.questions;
  let valid = true;

  questions.forEach(q => {
    if (q.is_required && answers[q.question_id] === undefined) {
      const card = document.getElementById(`card-${q.question_id}`);
      const err  = document.getElementById(`err-${q.question_id}`);
      card.classList.add('error');
      err.style.display = 'block';
      valid = false;
      // Animate away error after 3s
      setTimeout(() => { card.classList.remove('error'); }, 3000);
    }
  });

  if (!valid) {
    const firstErr = document.querySelector('.fb-card.error');
    if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Build payload
  const payload = {
    form_id: formData.form_id,
    answers: {}
  };
  Object.entries(answers).forEach(([qId, val]) => {
    payload.answers[qId] = { value: val };
  });

  const btn = document.getElementById('fb-submit-btn');
  btn.disabled = true;
  btn.innerHTML = `<span style="width:20px;height:20px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.6s linear infinite;display:inline-block;"></span> Submitting…`;

  try {
    const res  = await fetch(`${API_BASE}/api/responses/submit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.status === 400) {
      btn.disabled = false;
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Submit Feedback`;
      alert(data?.error || 'Please fill in all required fields.');
      return;
    }

    if (!res.ok) throw new Error(data?.error || 'Submission failed.');

    // Success!
    show('state-success');

  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Try Again`;
    alert('Something went wrong. Please check your connection and try again.');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function show(id) {
  ['state-loading','state-error','state-inactive','state-success','state-form']
    .forEach(s => {
      const el = document.getElementById(s);
      if (el) el.style.display = s === id ? (s === 'state-form' ? 'block' : 'flex') : 'none';
    });
}

function showError(msg) {
  document.getElementById('error-msg').textContent = msg;
  show('state-error');
}
