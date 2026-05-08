/** InsightLoop — Form Builder JS (stub) */
import { requireAuth, apiFetch, loadComponent } from './config.js';

requireAuth();
loadComponent('#sidebar-container', '../components/sidebar.html');
loadComponent('#navbar-container', '../components/navbar.html');

// TODO: Dynamic question builder, form create/edit, question type select
