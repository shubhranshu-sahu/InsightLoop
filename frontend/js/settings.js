/** InsightLoop — Settings JS (stub) */
import { requireAuth, apiFetch, loadComponent } from './config.js';

requireAuth();
loadComponent('#sidebar-container', '../components/sidebar.html');
loadComponent('#navbar-container', '../components/navbar.html');

// TODO: Profile update form, password change
