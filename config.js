/**
 * Runtime frontend configuration.
 * Set API_BASE_URL to your backend/proxy endpoint (NOT GitHub Pages URL).
 *
 * IMPORTANT: keep this as a same-origin relative path for Vercel deployments
 * so previews/custom domains do not trigger cross-origin login requests.
 */
window.RUNTIME_CONFIG = {
  API_BASE_URL: '/api/proxy'
};

// Use the backend/proxy endpoint for writes to avoid browser CORS failures.

const LS_KEYS = {
  filters: 'incheckFilters',
  theme: 'theme',
  events: 'incheckEvents',
  issues: 'incheckIssues',
  issuesLastUpdated: 'incheckIssuesLastUpdated',
  eventsLastUpdated: 'incheckEventsLastUpdated',
  dataVersion: 'incheckDataVersion',
  pageSize: 'pageSize',
  view: 'incheckView',
  accentColor: 'incheckAccent',
  accentColorStorage: 'incheckAccentColor',
  savedViews: 'incheckSavedViews',
  columns: 'incheckColumns',
  freezeWindows: 'incheckFreezeWindows',
  session: 'incheckSession'
};

const ROLES = Object.freeze({
  ADMIN: 'admin',
  VIEWER: 'viewer'
});
