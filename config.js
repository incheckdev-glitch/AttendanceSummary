window.RUNTIME_CONFIG = {
  API_BASE_URL: '/api/proxy'
};

const API_BASE_URL = String(
  (window.RUNTIME_CONFIG && (
    window.RUNTIME_CONFIG.API_BASE_URL ||
    window.RUNTIME_CONFIG.PROXY_API_BASE_URL ||
    window.RUNTIME_CONFIG.BACKEND_API_BASE_URL
  )) || '/api/proxy'
).trim();

function resolveApiEndpoint(endpoint = '') {
  const rawEndpoint = String(endpoint || '').trim();
  if (!rawEndpoint) return '';
  try {
    return new URL(rawEndpoint, window.location.origin).toString();
  } catch (_) {
    return rawEndpoint;
  }
}

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
