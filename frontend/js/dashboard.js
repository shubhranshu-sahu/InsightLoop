/** InsightLoop — Dashboard JS (stub) */
import { requireAuth, apiFetch, loadComponent } from './config.js';

requireAuth();
loadComponent('#sidebar-container', '../components/sidebar.html');
loadComponent('#navbar-container', '../components/navbar.html');

// TODO: Fetch dashboard stats, render Chart.js charts
