/**
 * InsightLoop — Forms Page Controller
 * =====================================
 * Handles all logic for pages/forms.html:
 *
 *   - Load & render form tiles (GET /api/forms + GET /api/analytics/forms-performance)
 *   - Create form modal (POST /api/forms)
 *   - View form modal  (GET /api/forms/:id)
 *   - QR code modal    (GET /api/qr/:id → client-side QR via QRCode.js)
 *   - Delete confirm   (DELETE /api/forms/:id)
 *
 * Question limits enforced client-side:
 *   rating: max 3 | text: max 2 | yesno: max 1
 */

import { requireAuth, apiFetch, loadComponent } from './config.js';

// ── Auth guard ────────────────────────────────────────────────────────────────
requireAuth();

// ── Inject shared components ──────────────────────────────────────────────────
loadComponent('#sidebar-container', '../components/sidebar.html').then(() => {
  if (window.lucide) window.lucide.createIcons();
});
loadComponent('#navbar-container', '../components/navbar.html').then(() => {
  if (window.lucide) window.lucide.createIcons();
});

// ── Bootstrap modal instances ─────────────────────────────────────────────────
// Initialised lazily after DOM is ready
let createModal, viewModal, qrModal, deleteModal;

// ── Question type limits ──────────────────────────────────────────────────────
const LIMITS = { rating: 3, text: 2, yesno: 1 };
const counts  = { rating: 0, text: 0, yesno: 0 };

// ── State for delete modal ────────────────────────────────────────────────────
let pendingDeleteId = null;

// ── QR canvas reference (kept to allow download) ──────────────────────────────
let qrInstance = null;


/* ═══════════════════════════════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Format ISO timestamp to "May 10, 2026" style.
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Show a dismissible alert inside the create modal.
 * @param {string} message
 * @param {'error'|'success'} type
 */
function showCreateAlert(message, type = 'error') {
  const el = document.getElementById('create-alert');
  if (!el) return;
  el.style.display = '';
  el.className = `alert alert-${type === 'error' ? 'danger' : 'success'} py-2 px-3`;
  el.style.fontSize = '0.8125rem';
  el.textContent = message;
}

function hideCreateAlert() {
  const el = document.getElementById('create-alert');
  if (el) el.style.display = 'none';
}

/**
 * Set a button into loading state (spinner + disabled).
 * @param {HTMLButtonElement} btn
 * @param {boolean} loading
 * @param {string} [label] - Restore label when loading=false
 */
function setLoading(btn, loading, label = '') {
  if (loading) {
    btn.disabled = true;
    btn.dataset.origHtml = btn.innerHTML;
    btn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Loading…`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.origHtml || label;
    if (window.lucide) window.lucide.createIcons();
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   LOAD & RENDER FORM TILES
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch forms and analytics in parallel, then render tiles.
 * Analytics provides total_responses per form (not in base forms list).
 */
async function loadForms() {
  const grid = document.getElementById('forms-grid');

  // Show skeleton while loading (already in HTML; keep them visible)

  const [formsResult, analyticsResult] = await Promise.allSettled([
    apiFetch('/api/forms'),
    apiFetch('/api/analytics/forms-performance'),
  ]);

  if (formsResult.status === 'rejected') {
    grid.innerHTML = `
      <div class="forms-empty" style="grid-column:1/-1;">
        <i data-lucide="wifi-off"></i>
        <h3>Could not load forms</h3>
        <p>${formsResult.reason?.message || 'API unavailable. Please try again.'}</p>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const forms = formsResult.value.forms || [];

  // Build a map of form_id → total_responses from analytics
  const responseMap = {};
  if (analyticsResult.status === 'fulfilled') {
    (analyticsResult.value.forms || []).forEach(f => {
      responseMap[f.form_id] = f.total_responses ?? 0;
    });
  }

  renderStatPills(forms, responseMap);
  renderFormTiles(forms, responseMap);
}

/**
 * Render the three summary stat pills in the page header.
 * @param {Array} forms
 * @param {Object} responseMap
 */
function renderStatPills(forms, responseMap) {
  const container = document.getElementById('forms-stat-pills');
  if (!container) return;

  const total    = forms.length;
  const active   = forms.filter(f => f.is_active).length;
  const responses = Object.values(responseMap).reduce((a, b) => a + b, 0);

  container.innerHTML = `
    <span class="stat-pill primary">
      <i data-lucide="file-text"></i>
      ${total} Form${total !== 1 ? 's' : ''}
    </span>
    <span class="stat-pill success">
      <i data-lucide="message-square"></i>
      ${responses} Response${responses !== 1 ? 's' : ''}
    </span>
    <span class="stat-pill info">
      <i data-lucide="activity"></i>
      ${active} Active
    </span>`;

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Render the form tile grid.
 * @param {Array} forms
 * @param {Object} responseMap - { form_id: total_responses }
 */
function renderFormTiles(forms, responseMap) {
  const grid = document.getElementById('forms-grid');
  if (!grid) return;

  if (forms.length === 0) {
    grid.innerHTML = `
      <div class="forms-empty">
        <i data-lucide="file-plus-2"></i>
        <h3>No forms yet</h3>
        <p>Create your first feedback form and generate a QR code for your customers.</p>
        <button class="btn-brand" onclick="document.getElementById('btn-open-create').click()"
          style="margin-top:0.5rem;font-size:0.8125rem;padding:0.625rem 1.25rem;">
          Create Your First Form
        </button>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  grid.innerHTML = forms.map(f => {
    const resp = responseMap[f.form_id] ?? '—';
    const isActive = Boolean(f.is_active);
    return `
      <div class="form-tile" id="tile-${f.form_id}"
           data-form-id="${f.form_id}"
           onclick="handleTileClick(event, '${f.form_id}')">
        <div class="form-tile-header">
          <div class="form-tile-title">${escHtml(f.title)}</div>
          <div class="form-tile-actions">
            <button class="tile-icon-btn qr"
              title="Show QR Code"
              aria-label="Show QR code for ${escHtml(f.title)}"
              onclick="event.stopPropagation(); openQRModal('${f.form_id}', '${escHtml(f.title)}')">
              <i data-lucide="qr-code"></i>
            </button>
            <button class="tile-icon-btn del"
              title="Delete Form"
              aria-label="Delete ${escHtml(f.title)}"
              onclick="event.stopPropagation(); openDeleteConfirm('${f.form_id}', '${escHtml(f.title)}')">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>

        ${f.description
          ? `<div class="form-tile-desc">${escHtml(f.description)}</div>`
          : '<div class="form-tile-desc" style="color:var(--text-disabled);font-style:italic;">No description</div>'}

        <div class="form-tile-meta">
          <span class="tile-status-badge ${isActive ? 'active' : 'inactive'}">
            ${isActive ? 'Active' : 'Inactive'}
          </span>
          <span class="tile-meta-item">
            <i data-lucide="message-square"></i>
            ${resp} response${resp !== 1 ? 's' : ''}
          </span>
          <span class="tile-meta-item">
            <i data-lucide="calendar"></i>
            ${formatDate(f.created_at)}
          </span>
        </div>
      </div>`;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

/**
 * Escape HTML to prevent XSS in dynamic content.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Tile body click → open view modal.
 * Action buttons call their own handlers with stopPropagation.
 */
function handleTileClick(event, formId) {
  openViewModal(formId);
}

// Expose globally for inline onclick
window.handleTileClick = handleTileClick;


/* ═══════════════════════════════════════════════════════════════════════════
   VIEW FORM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch form details and render them in the read-only view modal.
 * @param {string} formId
 */
async function openViewModal(formId) {
  const body = document.getElementById('view-form-body');
  if (!body) return;

  // Show skeleton while loading
  body.innerHTML = `
    <div class="skeleton" style="height:22px;width:50%;border-radius:4px;margin-bottom:0.75rem;"></div>
    <div class="skeleton" style="height:14px;width:85%;border-radius:4px;margin-bottom:1.5rem;"></div>
    <div class="skeleton" style="height:80px;border-radius:10px;margin-bottom:0.75rem;"></div>
    <div class="skeleton" style="height:80px;border-radius:10px;"></div>`;

  viewModal.show();

  try {
    const data = await apiFetch(`/api/forms/${formId}`);
    const form = data.form;
    const questions = form.questions || [];

    body.innerHTML = `
      <div class="view-form-meta">
        <span class="stat-pill primary"><i data-lucide="file-text"></i> ${escHtml(form.title)}</span>
        <span class="stat-pill ${form.is_active ? 'success' : 'info'}">
          <i data-lucide="${form.is_active ? 'activity' : 'pause-circle'}"></i>
          ${form.is_active ? 'Active' : 'Inactive'}
        </span>
        <span class="stat-pill"><i data-lucide="list"></i> ${questions.length} question${questions.length !== 1 ? 's' : ''}</span>
      </div>

      ${form.description
        ? `<p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:1.25rem;">${escHtml(form.description)}</p>`
        : ''}

      <div class="view-question-list">
        ${questions.length === 0
          ? `<p style="text-align:center;color:var(--text-muted);font-size:0.875rem;padding:1.5rem 0;">No questions added.</p>`
          : questions.sort((a, b) => a.order_index - b.order_index).map((q, i) => renderViewQuestion(q, i)).join('')}
      </div>`;

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    body.innerHTML = `
      <div style="text-align:center;padding:2rem;color:var(--danger);">
        <i data-lucide="wifi-off" style="width:32px;height:32px;opacity:0.6;"></i>
        <p style="margin-top:0.75rem;font-size:0.875rem;">Could not load form: ${err.message}</p>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Render a single question block for the view modal.
 * @param {Object} q - question object from API
 * @param {number} index
 * @returns {string} HTML string
 */
function renderViewQuestion(q, index) {
  const typeLabel = { rating: 'Rating', text: 'Text', yesno: 'Yes / No' }[q.question_type] || q.question_type;
  const typeTag   = { rating: 'type-tag-rating', text: 'type-tag-text', yesno: 'type-tag-yesno' }[q.question_type] || '';

  let preview = '';
  if (q.question_type === 'rating') {
    preview = `<div class="view-stars">${'<span>★</span>'.repeat(5)}</div>`;
  } else if (q.question_type === 'yesno') {
    preview = `<div class="view-yesno">
      <div class="yn-btn"><i data-lucide="check" style="width:12px;height:12px;"></i> Yes</div>
      <div class="yn-btn"><i data-lucide="x" style="width:12px;height:12px;"></i> No</div>
    </div>`;
  } else if (q.question_type === 'text') {
    preview = `<div class="view-text-box">Customer types their response here…</div>`;
  }

  return `
    <div class="view-question-item">
      <div class="view-q-header">
        <span class="question-type-tag ${typeTag}">${typeLabel}</span>
        <span class="view-q-text">${index + 1}. ${escHtml(q.question_text)}</span>
        ${q.is_required ? '<span class="view-q-required">Required</span>' : ''}
      </div>
      ${preview}
    </div>`;
}

window.openViewModal = openViewModal;


/* ═══════════════════════════════════════════════════════════════════════════
   QR CODE MODAL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch QR data and generate the QR image client-side.
 * @param {string} formId
 * @param {string} formTitle
 */
async function openQRModal(formId, formTitle) {
  const body = document.getElementById('qr-modal-body');
  if (!body) return;

  // Reset and show skeleton
  body.innerHTML = `
    <div class="qr-title">${escHtml(formTitle)}</div>
    <div class="skeleton" style="width:180px;height:180px;border-radius:12px;"></div>
    <div class="skeleton" style="height:14px;width:240px;border-radius:4px;"></div>`;

  qrModal.show();

  try {
    const data = await apiFetch(`/api/qr/${formId}`);
    const url  = data.public_url;

    body.innerHTML = `
      <div class="qr-title">${escHtml(data.form_title || formTitle)}</div>
      <div class="qr-canvas-wrap">
        <div id="qr-canvas-target"></div>
      </div>
      <div class="qr-url-row">
        <input class="qr-url-input" id="qr-url-display" readonly value="${escHtml(url)}" title="${escHtml(url)}">
        <button class="btn-copy" id="btn-copy-url">
          <i data-lucide="copy"></i> Copy
        </button>
      </div>
      <div class="qr-actions">
        <button class="btn-ghost" data-bs-dismiss="modal">Close</button>
        <button class="btn-brand" id="btn-download-qr">
          <i data-lucide="download"></i> Download PNG
        </button>
      </div>`;

    if (window.lucide) window.lucide.createIcons();

    // Generate QR using QRCode.js library
    qrInstance = new QRCode(document.getElementById('qr-canvas-target'), {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#0a0a0f',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });

    // Copy URL to clipboard
    document.getElementById('btn-copy-url').addEventListener('click', () => {
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('btn-copy-url');
        if (btn) { btn.innerHTML = '<i data-lucide="check"></i> Copied!'; if (window.lucide) window.lucide.createIcons(); }
        setTimeout(() => {
          if (btn) { btn.innerHTML = '<i data-lucide="copy"></i> Copy'; if (window.lucide) window.lucide.createIcons(); }
        }, 2000);
      });
    });

    // Download QR as PNG
    document.getElementById('btn-download-qr').addEventListener('click', () => {
      const img = document.querySelector('#qr-canvas-target img');
      const canvas = document.querySelector('#qr-canvas-target canvas');
      let src = img?.src || null;
      if (!src && canvas) src = canvas.toDataURL('image/png');
      if (!src) return;
      const a = document.createElement('a');
      a.href = src;
      a.download = `qr-${formId}.png`;
      a.click();
    });

  } catch (err) {
    body.innerHTML = `
      <div style="text-align:center;padding:2rem;color:var(--danger);">
        <i data-lucide="wifi-off" style="width:32px;height:32px;opacity:0.6;"></i>
        <p style="margin-top:0.75rem;font-size:0.875rem;">Could not load QR: ${err.message}</p>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
  }
}

window.openQRModal = openQRModal;


/* ═══════════════════════════════════════════════════════════════════════════
   DELETE CONFIRM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Show delete confirmation modal for a form.
 * @param {string} formId
 * @param {string} formTitle
 */
function openDeleteConfirm(formId, formTitle) {
  pendingDeleteId = formId;
  const nameEl = document.getElementById('delete-form-name');
  if (nameEl) nameEl.textContent = formTitle;
  deleteModal.show();
}

/**
 * Execute the delete after user confirms.
 */
async function confirmDelete() {
  if (!pendingDeleteId) return;
  const btn = document.getElementById('btn-confirm-delete');
  setLoading(btn, true);

  try {
    await apiFetch(`/api/forms/${pendingDeleteId}`, { method: 'DELETE' });
    deleteModal.hide();

    // Remove tile from DOM with a fade-out animation
    const tile = document.getElementById(`tile-${pendingDeleteId}`);
    if (tile) {
      tile.style.transition = 'opacity 0.3s, transform 0.3s';
      tile.style.opacity = '0';
      tile.style.transform = 'scale(0.95)';
      setTimeout(() => { tile.remove(); checkFormsEmpty(); }, 320);
    }
  } catch (err) {
    setLoading(btn, false);
    deleteModal.hide();
    // Surface error as a browser alert — simple but reliable
    alert(`Failed to delete form: ${err.message}`);
  } finally {
    pendingDeleteId = null;
  }
}

/**
 * If all tiles removed, show the empty state.
 */
function checkFormsEmpty() {
  const grid  = document.getElementById('forms-grid');
  const tiles = grid?.querySelectorAll('.form-tile');
  if (tiles && tiles.length === 0) {
    grid.innerHTML = `
      <div class="forms-empty">
        <i data-lucide="file-plus-2"></i>
        <h3>No forms yet</h3>
        <p>Create your first feedback form and generate a QR code for your customers.</p>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    // Also reset stat pills
    renderStatPills([], {});
  }
}

window.openDeleteConfirm = openDeleteConfirm;


/* ═══════════════════════════════════════════════════════════════════════════
   CREATE FORM MODAL — QUESTION BUILDER
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Reset the create modal to its initial blank state.
 * Called every time the modal opens.
 */
function resetCreateModal() {
  document.getElementById('form-title').value = '';
  document.getElementById('form-desc').value  = '';
  document.getElementById('title-count').textContent = '0';
  document.getElementById('desc-count').textContent  = '0';
  document.getElementById('questions-list').innerHTML = '';
  counts.rating = 0;
  counts.text   = 0;
  counts.yesno  = 0;
  updateDropdownState();
  updateQCountLabel();
  hideCreateAlert();
  closeQDropdown();

  // Always restore the submit button — prevents stuck-loading state on re-open
  const btn = document.getElementById('btn-submit-create');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="check" style="width:15px;height:15px;"></i> Create Form';
    if (window.lucide) window.lucide.createIcons();
  }
}

/**
 * Update the remaining-count labels and disabled states
 * in the question type dropdown.
 */
function updateDropdownState() {
  ['rating', 'text', 'yesno'].forEach(type => {
    const left = LIMITS[type] - counts[type];
    const rem  = document.getElementById(`remaining-${type}`);
    const opt  = document.querySelector(`.qtype-option[data-type="${type}"]`);
    if (!rem || !opt) return;
    const total = LIMITS[type];
    rem.textContent = left === 0 ? 'Limit reached' : `${left} of ${total} remaining`;
    rem.className   = left === 0 ? 'qtype-remaining none' : 'qtype-remaining';
    opt.classList.toggle('disabled', left === 0);
    opt.setAttribute('aria-disabled', String(left === 0));
  });
}

/**
 * Update the "N added" label above the questions list.
 */
function updateQCountLabel() {
  const total = counts.rating + counts.text + counts.yesno;
  const el    = document.getElementById('q-count-label');
  if (el) el.textContent = `${total} added`;
}

/** Open the custom question type dropdown. */
function openQDropdown() {
  const btn      = document.getElementById('btn-add-q');
  const dropdown = document.getElementById('q-type-dropdown');
  if (!btn || !dropdown) return;
  btn.classList.add('open');
  dropdown.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');
}

/** Close the custom question type dropdown. */
function closeQDropdown() {
  const btn      = document.getElementById('btn-add-q');
  const dropdown = document.getElementById('q-type-dropdown');
  if (!btn || !dropdown) return;
  btn.classList.remove('open');
  dropdown.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
}

/**
 * Add a question block to the list.
 * @param {'rating'|'text'|'yesno'} type
 */
function addQuestion(type) {
  if (counts[type] >= LIMITS[type]) return;
  counts[type]++;
  updateDropdownState();
  updateQCountLabel();
  closeQDropdown();

  const list  = document.getElementById('questions-list');
  const index = counts.rating + counts.text + counts.yesno; // sequential ID
  const uid   = `q-${type}-${Date.now()}`;
  const typeLabels = { rating: 'Rating', text: 'Text', yesno: 'Yes / No' };
  const tagClass   = { rating: 'type-tag-rating', text: 'type-tag-text', yesno: 'type-tag-yesno' };
  const placeholders = {
    rating: 'e.g. How would you rate the food quality?',
    text:   'e.g. Any additional comments or suggestions?',
    yesno:  'e.g. Would you recommend us to a friend?',
  };

  // Build star preview HTML (only for rating questions)
  const starPreview = type === 'rating' ? `
    <div class="star-preview" title="1–5 star rating (customer selects)">
      <span class="star">★</span>
      <span class="star">★</span>
      <span class="star">★</span>
      <span class="star">★</span>
      <span class="star">★</span>
    </div>` : '';

  // Yes/No visual preview
  const ynPreview = type === 'yesno' ? `
    <div class="view-yesno" style="margin-top:0.5rem;pointer-events:none;opacity:0.5;">
      <div class="yn-btn"><i data-lucide="check" style="width:12px;height:12px;"></i> Yes</div>
      <div class="yn-btn"><i data-lucide="x"     style="width:12px;height:12px;"></i> No</div>
    </div>` : '';

  const block = document.createElement('div');
  block.className = `question-block type-${type}`;
  block.dataset.type = type;
  block.dataset.uid  = uid;
  block.innerHTML = `
    <div class="question-block-header">
      <span class="question-type-tag ${tagClass[type]}">${typeLabels[type]}</span>
      <button type="button" class="remove-q" title="Remove question"
        onclick="removeQuestion(this)">
        <i data-lucide="x"></i>
      </button>
    </div>
    ${starPreview}
    <input
      type="text"
      class="form-input"
      placeholder="${placeholders[type]}"
      data-question-text
      maxlength="200"
      required
    >
    ${ynPreview}
    <div class="required-row">
      <label class="toggle-switch" for="req-${uid}">
        <input type="checkbox" id="req-${uid}" data-required>
        <span class="toggle-track"></span>
      </label>
      <label for="req-${uid}" style="font-size:0.75rem;color:var(--text-muted);cursor:pointer;">
        Required
      </label>
    </div>`;

  list.appendChild(block);
  if (window.lucide) window.lucide.createIcons();

  // Focus the text input
  block.querySelector('[data-question-text]')?.focus();
}

/**
 * Remove a question block when the ✕ button is clicked.
 * @param {HTMLElement} removeBtn - the button element inside the block
 */
function removeQuestion(removeBtn) {
  const block = removeBtn.closest('.question-block');
  if (!block) return;
  const type = block.dataset.type;
  if (counts[type] > 0) counts[type]--;
  block.style.transition = 'opacity 0.2s, transform 0.2s';
  block.style.opacity = '0';
  block.style.transform = 'translateY(-6px)';
  setTimeout(() => {
    block.remove();
    updateDropdownState();
    updateQCountLabel();
  }, 200);
}

// Expose for inline onclick
window.addQuestion    = addQuestion;
window.removeQuestion = removeQuestion;


/* ═══════════════════════════════════════════════════════════════════════════
   CREATE FORM — VALIDATE & SUBMIT
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Collect form data from the modal, validate, and POST to API.
 */
async function submitCreateForm() {
  hideCreateAlert();
  const btn   = document.getElementById('btn-submit-create');
  const title = document.getElementById('form-title').value.trim();
  const desc  = document.getElementById('form-desc').value.trim();

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!title) {
    showCreateAlert('Please enter a form title.');
    document.getElementById('form-title').focus();
    return;
  }

  const questionBlocks = document.querySelectorAll('#questions-list .question-block');
  if (questionBlocks.length === 0) {
    showCreateAlert('Add at least one question to the form.');
    return;
  }

  const questions = [];
  let orderIndex  = 1;
  let hasError    = false;

  questionBlocks.forEach(block => {
    if (hasError) return;
    const textInput = block.querySelector('[data-question-text]');
    const qText     = textInput?.value.trim();
    if (!qText) {
      showCreateAlert('Please fill in all question texts before submitting.');
      textInput?.focus();
      hasError = true;
      return;
    }
    const isRequired = Boolean(block.querySelector('[data-required]')?.checked);
    questions.push({
      question_text: qText,
      question_type: block.dataset.type,
      order_index:   orderIndex++,
      is_required:   isRequired,
    });
  });

  if (hasError) return;

  // ── Submit ─────────────────────────────────────────────────────────────────
  setLoading(btn, true);
  try {
    await apiFetch('/api/forms', {
      method: 'POST',
      body: JSON.stringify({ title, description: desc, questions }),
    });

    // Restore button BEFORE hiding — so resetCreateModal finds it clean
    setLoading(btn, false);
    createModal.hide();

    // Re-fetch grid so new tile appears with QR data
    await loadForms();
    showToast(`Form "${title}" created successfully!`);
  } catch (err) {
    showCreateAlert(`Failed to create form: ${err.message}`);
    setLoading(btn, false);
  }
}

/**
 * Show a brief success toast notification.
 * @param {string} message
 */
function showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed; bottom:2rem; right:2rem; z-index:9999;
    background:var(--success); color:white;
    padding:0.75rem 1.25rem; border-radius:var(--radius-lg);
    font-size:0.875rem; font-weight:600;
    box-shadow:var(--shadow-lg);
    display:flex; align-items:center; gap:0.5rem;
    animation:slideInToast 0.3s var(--ease-out);`;
  toast.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 6 9 17l-5-5"/></svg>${message}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 320);
  }, 3200);
}


/* ═══════════════════════════════════════════════════════════════════════════
   DOM READY — Wire everything up
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Bootstrap modal instances
  createModal = new bootstrap.Modal(document.getElementById('createFormModal'));
  viewModal   = new bootstrap.Modal(document.getElementById('viewFormModal'));
  qrModal     = new bootstrap.Modal(document.getElementById('qrModal'));
  deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));

  // Init Lucide icons
  if (window.lucide) window.lucide.createIcons();

  // ── Open create modal ──────────────────────────────────────────────────────
  document.getElementById('btn-open-create')?.addEventListener('click', () => {
    resetCreateModal();
    createModal.show();
  });

  // Reset when create modal closes (handles ESC + backdrop click too)
  document.getElementById('createFormModal')?.addEventListener('hidden.bs.modal', () => {
    resetCreateModal();
  });

  // ── "+ Add Question" button toggle ─────────────────────────────────────────
  document.getElementById('btn-add-q')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('q-type-dropdown');
    if (dropdown?.classList.contains('open')) {
      closeQDropdown();
    } else {
      openQDropdown();
    }
  });

  // ── Question type option click ─────────────────────────────────────────────
  document.querySelectorAll('.qtype-option').forEach(opt => {
    const handler = () => {
      if (opt.classList.contains('disabled')) return;
      addQuestion(opt.dataset.type);
    };
    opt.addEventListener('click', handler);
    // Keyboard support
    opt.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });

  // ── Close dropdown when clicking outside ───────────────────────────────────
  document.addEventListener('click', (e) => {
    const wrap = document.querySelector('.add-question-wrap');
    if (wrap && !wrap.contains(e.target)) closeQDropdown();
  });

  // ── Character counters ─────────────────────────────────────────────────────
  document.getElementById('form-title')?.addEventListener('input', function () {
    document.getElementById('title-count').textContent = this.value.length;
  });

  document.getElementById('form-desc')?.addEventListener('input', function () {
    document.getElementById('desc-count').textContent = this.value.length;
  });

  // ── Submit create form ─────────────────────────────────────────────────────
  document.getElementById('btn-submit-create')?.addEventListener('click', submitCreateForm);

  // Allow Enter key in title field to focus description
  document.getElementById('form-title')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('form-desc')?.focus(); }
  });

  // ── Delete confirm button ──────────────────────────────────────────────────
  document.getElementById('btn-confirm-delete')?.addEventListener('click', confirmDelete);

  // ── Load forms ─────────────────────────────────────────────────────────────
  loadForms();
});

// Inject toast keyframe if not already in CSS
const toastStyle = document.createElement('style');
toastStyle.textContent = `@keyframes slideInToast {
  from { opacity:0; transform:translateY(12px); }
  to   { opacity:1; transform:translateY(0); }
}`;
document.head.appendChild(toastStyle);
