/**
 * InsightLoop — Auth Page Handlers (Login + Register)
 * ====================================================
 * Handles form submission, validation, and API calls for auth pages.
 * Each page includes this script and calls the appropriate init function.
 *
 * Login flow:  POST /api/auth/login → save token → redirect to dashboard
 * Register flow: POST /api/auth/register → redirect to login with success message
 */

import { apiFetch, saveAuth, getToken, showToast } from './config.js';


// ── If already logged in, redirect to dashboard ─────────────────────────────

if (getToken()) {
  window.location.href = '/pages/dashboard.html';
}


// ── Login Handler ───────────────────────────────────────────────────────────

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = loginForm.querySelector('button[type="submit"]');
    const alertEl = document.getElementById('auth-alert');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    // Client-side validation
    if (!email || !password) {
      showAlert(alertEl, 'Please fill in all fields.', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert(alertEl, 'Please enter a valid email address.', 'error');
      return;
    }

    // Disable button + show loading
    setLoading(btn, true);
    hideAlert(alertEl);

    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // Save token + business info
      saveAuth(data.token, data.business);

      // Redirect to dashboard
      window.location.href = '/pages/dashboard.html';

    } catch (err) {
      showAlert(alertEl, err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}


// ── Register Handler ────────────────────────────────────────────────────────

const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = registerForm.querySelector('button[type="submit"]');
    const alertEl = document.getElementById('auth-alert');

    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const industry = document.getElementById('reg-industry').value;
    const phone    = document.getElementById('reg-phone').value.trim();

    // Client-side validation
    if (!name || !email || !password) {
      showAlert(alertEl, 'Please fill in all required fields.', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert(alertEl, 'Please enter a valid email address.', 'error');
      return;
    }

    if (phone) {
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(phone)) {
        showAlert(alertEl, 'Phone number must be exactly 10 digits.', 'error');
        return;
      }
    }

    if (password.length < 6) {
      showAlert(alertEl, 'Password must be at least 6 characters.', 'error');
      return;
    }

    if (password !== confirm) {
      showAlert(alertEl, 'Passwords do not match.', 'error');
      return;
    }

    // Disable button + show loading
    setLoading(btn, true);
    hideAlert(alertEl);

    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, industry, phone }),
      });

      // Redirect to login with success message
      window.location.href = '/pages/login.html?registered=true';

    } catch (err) {
      showAlert(alertEl, err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });
}


// ── Password Toggle ─────────────────────────────────────────────────────────

document.querySelectorAll('.password-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.innerHTML = isPassword ? '🙈' : '👁️';
  });
});


// ── Show "Registration successful" toast if redirected from register ────────

if (window.location.search.includes('registered=true')) {
  showToast('Account created successfully! Please log in.', 'success', 5000);
  // Clean URL
  history.replaceState(null, '', window.location.pathname);
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function showAlert(el, message, type) {
  if (!el) return;
  el.textContent = message;
  el.className = `auth-alert ${type}`;
}

function hideAlert(el) {
  if (!el) return;
  el.className = 'auth-alert';
  el.textContent = '';
}

function setLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Please wait...';
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
  }
}
