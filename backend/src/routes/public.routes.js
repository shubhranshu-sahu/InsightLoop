const express = require('express');
const router = express.Router();
const FormModel = require('../models/form.model');

/**
 * GET /form/:form_id
 * Public route — NO authentication required.
 * Serves a beautiful, self-contained HTML feedback form page.
 * This is the URL encoded in the QR code.
 */
router.get('/:form_id', async (req, res, next) => {
  try {
    const form = await FormModel.findById(req.params.form_id);

    if (!form) {
      return res.status(404).send(getErrorPage('Form Not Found', 'This feedback form does not exist or has been removed.'));
    }

    if (form.is_active === 0) {
      return res.status(410).send(getErrorPage('Form Closed', 'This feedback form is no longer accepting responses.'));
    }

    res.send(getFormPage(form));
  } catch (error) {
    next(error);
  }
});

/**
 * Generates a premium, mobile-first HTML feedback form page.
 */
function getFormPage(form) {
  const questionsHTML = form.questions.map((q, i) => {
    let inputHTML = '';

    switch (q.question_type) {
      case 'rating':
        inputHTML = `
          <div class="rating-group" data-question-id="${q.question_id}">
            ${[1, 2, 3, 4, 5].map(star => `
              <button type="button" class="star-btn" data-value="${star}" onclick="setRating(this)" aria-label="${star} star">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </button>
            `).join('')}
            <input type="hidden" name="q_${q.question_id}" value="" ${q.is_required ? 'required' : ''}>
          </div>`;
        break;

      case 'yesno':
        inputHTML = `
          <div class="yesno-group" data-question-id="${q.question_id}">
            <button type="button" class="yesno-btn" data-value="yes" onclick="setYesNo(this)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Yes
            </button>
            <button type="button" class="yesno-btn" data-value="no" onclick="setYesNo(this)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              No
            </button>
            <input type="hidden" name="q_${q.question_id}" value="" ${q.is_required ? 'required' : ''}>
          </div>`;
        break;

      case 'text':
      default:
        inputHTML = `
          <textarea
            name="q_${q.question_id}"
            class="text-input"
            placeholder="Type your response here..."
            rows="3"
            ${q.is_required ? 'required' : ''}
          ></textarea>`;
        break;
    }

    return `
      <div class="question-card" style="animation-delay: ${i * 0.08}s">
        <div class="question-header">
          <span class="question-number">${i + 1}</span>
          <label class="question-text">${escapeHtml(q.question_text)}</label>
          ${q.is_required ? '<span class="required-badge">Required</span>' : ''}
        </div>
        ${inputHTML}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(form.title)} — Feedback | InsightLoop</title>
  <meta name="description" content="${escapeHtml(form.description || 'Share your feedback')}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --bg-primary: #0a0a1a;
      --bg-card: rgba(255, 255, 255, 0.04);
      --bg-card-hover: rgba(255, 255, 255, 0.07);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(99, 102, 241, 0.6);
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-gradient: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7);
      --accent-solid: #8b5cf6;
      --accent-glow: rgba(139, 92, 246, 0.3);
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.3);
      --danger: #ef4444;
      --star-active: #fbbf24;
      --star-glow: rgba(251, 191, 36, 0.4);
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    /* Animated background */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background:
        radial-gradient(ellipse 600px 600px at 20% 10%, rgba(99, 102, 241, 0.12), transparent),
        radial-gradient(ellipse 500px 500px at 80% 80%, rgba(168, 85, 247, 0.1), transparent),
        radial-gradient(ellipse 400px 400px at 50% 50%, rgba(139, 92, 246, 0.06), transparent);
      pointer-events: none;
      z-index: 0;
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 640px;
      margin: 0 auto;
      padding: 24px 16px 80px;
    }

    /* Header */
    .form-header {
      text-align: center;
      margin-bottom: 36px;
      animation: fadeSlideUp 0.6s ease-out;
    }

    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 100px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 20px;
      backdrop-filter: blur(12px);
    }

    .brand-badge svg {
      width: 14px;
      height: 14px;
      color: var(--accent-solid);
    }

    .form-title {
      font-size: 28px;
      font-weight: 700;
      background: var(--accent-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 10px;
      line-height: 1.3;
    }

    .form-description {
      font-size: 15px;
      color: var(--text-secondary);
      max-width: 480px;
      margin: 0 auto;
    }

    /* Question Cards */
    .question-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 16px;
      backdrop-filter: blur(16px);
      transition: all 0.3s ease;
      animation: fadeSlideUp 0.5s ease-out both;
    }

    .question-card:hover {
      background: var(--bg-card-hover);
      border-color: rgba(255, 255, 255, 0.12);
      transform: translateY(-1px);
    }

    .question-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 18px;
    }

    .question-number {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--accent-gradient);
      font-size: 13px;
      font-weight: 700;
      color: white;
    }

    .question-text {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
      flex: 1;
      padding-top: 3px;
    }

    .required-badge {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 600;
      color: var(--danger);
      background: rgba(239, 68, 68, 0.1);
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.3px;
    }

    /* Text Input */
    .text-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 14px 16px;
      font-family: inherit;
      font-size: 14px;
      color: var(--text-primary);
      resize: vertical;
      min-height: 48px;
      transition: all 0.25s ease;
      outline: none;
    }

    .text-input::placeholder {
      color: var(--text-muted);
    }

    .text-input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px var(--accent-glow), inset 0 0 0 1px var(--border-focus);
      background: rgba(255, 255, 255, 0.05);
    }

    /* Star Rating */
    .rating-group {
      display: flex;
      gap: 8px;
    }

    .star-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 6px;
      border-radius: 10px;
      transition: all 0.2s ease;
      color: var(--text-muted);
    }

    .star-btn svg {
      width: 32px;
      height: 32px;
      transition: all 0.2s ease;
    }

    .star-btn:hover {
      transform: scale(1.15);
      color: var(--star-active);
    }

    .star-btn.active {
      color: var(--star-active);
      filter: drop-shadow(0 0 8px var(--star-glow));
    }

    .star-btn.active svg {
      fill: var(--star-active);
      stroke: var(--star-active);
    }

    /* Yes/No Buttons */
    .yesno-group {
      display: flex;
      gap: 12px;
    }

    .yesno-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 20px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.25s ease;
    }

    .yesno-btn svg {
      width: 18px;
      height: 18px;
    }

    .yesno-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .yesno-btn.active[data-value="yes"] {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.4);
      color: var(--success);
      box-shadow: 0 0 20px var(--success-glow);
    }

    .yesno-btn.active[data-value="no"] {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.4);
      color: var(--danger);
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);
    }

    /* Submit Button */
    .submit-section {
      margin-top: 28px;
      animation: fadeSlideUp 0.5s ease-out both;
      animation-delay: ${form.questions.length * 0.08 + 0.1}s;
    }

    .submit-btn {
      width: 100%;
      padding: 16px 32px;
      border: none;
      border-radius: 14px;
      background: var(--accent-gradient);
      color: white;
      font-family: inherit;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }

    .submit-btn::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .submit-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px var(--accent-glow);
    }

    .submit-btn:hover::before {
      opacity: 1;
    }

    .submit-btn:active {
      transform: translateY(0);
    }

    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    /* Success Overlay */
    .success-overlay {
      position: fixed;
      inset: 0;
      background: rgba(10, 10, 26, 0.92);
      backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.4s ease;
    }

    .success-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .success-content {
      text-align: center;
      animation: successPop 0.5s ease-out;
    }

    .success-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--success);
      box-shadow: 0 0 40px var(--success-glow);
    }

    .success-icon svg {
      width: 40px;
      height: 40px;
      color: var(--success);
      stroke-dasharray: 50;
      stroke-dashoffset: 50;
      animation: checkDraw 0.6s ease-out 0.3s forwards;
    }

    .success-content h2 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      background: var(--accent-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .success-content p {
      color: var(--text-secondary);
      font-size: 15px;
    }

    /* Animations */
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes successPop {
      from { opacity: 0; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes checkDraw {
      to { stroke-dashoffset: 0; }
    }

    /* Responsive */
    @media (max-width: 480px) {
      .container { padding: 16px 12px 60px; }
      .form-title { font-size: 22px; }
      .question-card { padding: 18px; }
      .star-btn svg { width: 28px; height: 28px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="form-header">
      <div class="brand-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        InsightLoop
      </div>
      <h1 class="form-title">${escapeHtml(form.title)}</h1>
      ${form.description ? `<p class="form-description">${escapeHtml(form.description)}</p>` : ''}
    </header>

    <form id="feedbackForm" onsubmit="handleSubmit(event)">
      ${questionsHTML}

      <div class="submit-section">
        <button type="submit" class="submit-btn" id="submitBtn">
          Submit Feedback
        </button>
      </div>
    </form>
  </div>

  <!-- Success Overlay -->
  <div class="success-overlay" id="successOverlay">
    <div class="success-content">
      <div class="success-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h2>Thank You!</h2>
      <p>Your feedback has been submitted successfully.</p>
    </div>
  </div>

  <script>
    // Star Rating
    function setRating(btn) {
      const group = btn.closest('.rating-group');
      const value = parseInt(btn.dataset.value);
      const hidden = group.querySelector('input[type="hidden"]');
      const stars = group.querySelectorAll('.star-btn');

      hidden.value = value;

      stars.forEach((star, i) => {
        if (i < value) {
          star.classList.add('active');
        } else {
          star.classList.remove('active');
        }
      });
    }

    // Yes/No
    function setYesNo(btn) {
      const group = btn.closest('.yesno-group');
      const hidden = group.querySelector('input[type="hidden"]');

      group.querySelectorAll('.yesno-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      hidden.value = btn.dataset.value;
    }

    // Form Submit — POST to /api/responses/submit (MongoDB Atlas)
    async function handleSubmit(e) {
      e.preventDefault();

      const form = e.target;
      const submitBtn = document.getElementById('submitBtn');

      // Basic validation for required hidden inputs (rating/yesno)
      const hiddenInputs = form.querySelectorAll('input[type="hidden"][required]');
      for (const input of hiddenInputs) {
        if (!input.value) {
          const card = input.closest('.question-card');
          card.style.borderColor = 'rgba(239, 68, 68, 0.5)';
          card.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.15)';
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            card.style.borderColor = '';
            card.style.boxShadow = '';
          }, 2500);
          return;
        }
      }

      // Disable button
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      // Collect answers keyed by question_id
      const answers = {};
      const formData = new FormData(form);
      for (const [key, val] of formData.entries()) {
        if (key.startsWith('q_')) {
          const questionId = key.replace('q_', '');
          // Convert numeric strings and yes/no to proper types
          let value = val;
          if (val === 'yes') value = true;
          else if (val === 'no') value = false;
          else if (!isNaN(val) && val !== '') value = Number(val);
          answers[questionId] = { value };
        }
      }

      try {
        const response = await fetch('/api/responses/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form_id: '${form.form_id}',
            answers
          }),
        });

        const data = await response.json();

        if (response.ok) {
          document.getElementById('successOverlay').classList.add('visible');
        } else {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Feedback';
          alert(data.error || 'Something went wrong. Please try again.');
        }
      } catch (err) {
        console.error('Submission error:', err);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Feedback';
        alert('Network error. Please check your connection and try again.');
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Renders a styled error/info page.
 */
function getErrorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — InsightLoop</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      background: #0a0a1a;
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: radial-gradient(ellipse 500px 500px at 50% 50%, rgba(99, 102, 241, 0.1), transparent);
      pointer-events: none;
    }
    .error-card {
      position: relative;
      text-align: center;
      padding: 48px 36px;
      max-width: 420px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      backdrop-filter: blur(16px);
    }
    .error-icon {
      width: 64px; height: 64px;
      margin: 0 auto 20px;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.12);
      display: flex; align-items: center; justify-content: center;
      border: 2px solid rgba(239, 68, 68, 0.4);
    }
    .error-icon svg { width: 28px; height: 28px; color: #ef4444; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
    p { color: #94a3b8; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="error-card">
    <div class="error-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    </div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

/**
 * HTML-escape user content to prevent XSS.
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = router;
