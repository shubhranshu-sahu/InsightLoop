/** InsightLoop — Forms JS (stub) */
import { requireAuth, apiFetch, loadComponent } from './config.js';

requireAuth();
loadComponent('#sidebar-container', '../components/sidebar.html');
loadComponent('#navbar-container', '../components/navbar.html');

// TODO: Fetch form list, render cards, delete handler, QR modal
