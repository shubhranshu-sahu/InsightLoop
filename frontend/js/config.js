/**
 * InsightLoop — Frontend Configuration & API Layer
 * =================================================
 * Central config for all API communication.
 * Every page imports this for auth + fetch operations.
 *
 * Usage:
 *   import { apiFetch, getToken, logout } from './config.js';
 *   const data = await apiFetch('/api/forms');
 */

// ── Constants ───────────────────────────────────────────────────────────────

/** Node.js backend base URL */
export const API_BASE = 'https://insightloop-backend.onrender.com';

/** Key used to store JWT in localStorage */
const TOKEN_KEY = 'insightloop_token';

/** Key used to store business info in localStorage */
const USER_KEY = 'insightloop_user';


// ── Token Management ────────────────────────────────────────────────────────

/**
 * Get the stored JWT token.
 * @returns {string|null} JWT string or null if not logged in
 */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Save JWT token + business info after login/register.
 * @param {string} token - JWT token
 * @param {Object} business - Business object from login response
 */
export function saveAuth(token, business) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(business));
}

/**
 * Get the stored business user info.
 * @returns {Object|null} Business object or null
 */
export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clear all auth data and redirect to login.
 */
export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.location.href = 'login.html';
}

/**
 * Check if user is authenticated. If not, redirect to login.
 * Call this at the top of every protected page's JS.
 * @returns {boolean}
 */
export function requireAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}


// ── API Fetch Wrapper ───────────────────────────────────────────────────────

/**
 * Wrapper around fetch() that:
 *   1. Prepends API_BASE to the URL
 *   2. Adds Authorization header with JWT token
 *   3. Adds Content-Type: application/json for POST/PUT/PATCH
 *   4. Parses JSON response
 *   5. Handles 401 → auto logout + redirect
 *   6. Throws on non-OK responses with the error message from backend
 *
 * @param {string} endpoint - API path (e.g. '/api/forms')
 * @param {Object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} On non-OK response, with backend error message
 *
 * @example
 *   // GET request
 *   const data = await apiFetch('/api/forms');
 *
 *   // POST request
 *   const result = await apiFetch('/api/forms', {
 *     method: 'POST',
 *     body: JSON.stringify({ title: 'My Form', questions: [...] })
 *   });
 */
export async function apiFetch(endpoint, options = {}) {
  const token = getToken();

  // Build headers
  const headers = {
    ...options.headers,
  };

  // Add auth header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add content-type for requests with body
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 — session expired or invalid token
  // Do not redirect if we are currently trying to log in (wrong password returns 401)
  if (response.status === 401 && endpoint !== '/api/auth/login') {
    logout();
    throw new Error('Session expired. Please log in again.');
  }

  // Parse response
  const data = await response.json().catch(() => ({}));

  // Throw on error responses
  if (!response.ok) {
    const message = data.error || data.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}


// ── Toast Notifications ─────────────────────────────────────────────────────

/**
 * Show a toast notification at the top-right corner.
 * @param {string} message - Text to display
 * @param {'success'|'error'|'warning'|'info'} type - Toast type
 * @param {number} duration - Auto-dismiss in milliseconds (default 4000)
 */
export function showToast(message, type = 'info', duration = 4000) {
  // Ensure container exists
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}


// ── Component Loader ────────────────────────────────────────────────────────

/**
 * Load an HTML partial into a container element.
 * Used for sidebar and navbar that repeat across pages.
 *
 * @param {string} selector - CSS selector of the container element
 * @param {string} url - Path to the HTML partial file
 *
 * @example
 *   loadComponent('#sidebar-container', '../components/sidebar.html');
 */
export async function loadComponent(selector, url) {
  const container = document.querySelector(selector);
  if (!container) return;

  try {
    const response = await fetch(url);
    if (response.ok) {
      container.innerHTML = await response.text();
    }
  } catch (err) {
    console.warn(`Failed to load component: ${url}`, err);
  }
}
