// main.js
// =========== APP ENTRY ===========
// Handles startup, theme setup, and lazy-loads heavy modules when needed.

import { initTheme, initToolbar, showToast } from './utils.js';

// ---- 1. INITIALIZE BASE UI ----
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initToolbar();
  showToast('InCheck dashboard loaded.');

  // Load the Issues view first (default)
  const { initIssues } = await import('./issues.js');
  initIssues();
});

// ---- 2. TAB SWITCHING & LAZY LOADING ----
const tabs = document.querySelectorAll('.view-tab');
tabs.forEach(tab => {
  tab.addEventListener('click', async e => {
    const view = e.currentTarget.dataset.view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));

    e.currentTarget.classList.add('active');
    document.getElementById(`${view}View`).classList.add('active');

    // Lazy-load each module only when its tab is opened
    if (view === 'issues') {
      const { initIssues } = await import('./issues.js');
      initIssues();
    } else if (view === 'calendar') {
      const { initCalendar } = await import('./calendar.js');
      initCalendar();
    } else if (view === 'insights') {
      const { initInsights } = await import('./insights.js');
      initInsights();
    }
  });
});
