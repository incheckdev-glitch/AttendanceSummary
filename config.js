window.RUNTIME_CONFIG = window.RUNTIME_CONFIG || {};
const runtimeConfig = window.RUNTIME_CONFIG;

function normalizeEndpointPathname(pathname = '/') {
  const withLeadingSlash = String(pathname || '/').startsWith('/')
    ? String(pathname || '/')
    : `/${String(pathname || '/')}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  if (collapsed === '/') return '/';
  return collapsed.replace(/\/+$/g, '') || '/';
}

function normalizeApiBaseUrl(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const looksLikeAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (looksLikeAbsolute) {
    try {
      const url = new URL(trimmed);
      url.pathname = normalizeEndpointPathname(url.pathname || '/');
      return url.toString();
    } catch {
      return trimmed.replace(/\/+$/g, '');
    }
  }

  const sanitized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalizeEndpointPathname(sanitized);
}

function isLikelyMalformedApiBaseUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return true;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return !/^https?:$/i.test(parsed.protocol);
    } catch {
      return true;
    }
  }
  return !raw.startsWith('/');
}

function resolveApiEndpoint(endpoint = '') {
  const normalized = normalizeApiBaseUrl(endpoint);
  if (!normalized) return '';
  try {
    const resolved = new URL(normalized, window.location.origin);
    resolved.pathname = normalizeEndpointPathname(resolved.pathname || '/');
    return resolved.toString();
  } catch {
    return normalized;
  }
}

const rawApiBaseUrl =
  runtimeConfig.API_BASE_URL ||
  runtimeConfig.PROXY_API_BASE_URL ||
  runtimeConfig.BACKEND_API_BASE_URL ||
  '/api/proxy';

// Deployment notes:
// - Vercel deployment: /api/proxy must exist and APPS_SCRIPT_WEBAPP_URL must point to the Apps Script /exec URL.
// - Static frontend deployment (without Vercel functions): set API_BASE_URL to a live backend endpoint; do not rely on /api/proxy.
window.API_BASE_URL = normalizeApiBaseUrl(rawApiBaseUrl) || '/api/proxy';
const API_BASE_URL = window.API_BASE_URL;

const RESOLVED_API_ENDPOINT = resolveApiEndpoint(API_BASE_URL);
const LOCAL_PROXY_ENDPOINT = new URL('/api/proxy', window.location.origin);
const resolvedApiUrl = RESOLVED_API_ENDPOINT ? new URL(RESOLVED_API_ENDPOINT, window.location.origin) : null;
const normalizedResolvedPathname = resolvedApiUrl
  ? normalizeEndpointPathname(resolvedApiUrl.pathname)
  : '';
const localProxyPathname = normalizeEndpointPathname(LOCAL_PROXY_ENDPOINT.pathname);
const isProxyPath = Boolean(normalizedResolvedPathname) && normalizedResolvedPathname === localProxyPathname;
const isSameOriginWithLocalProxy =
  !!resolvedApiUrl &&
  resolvedApiUrl.origin === LOCAL_PROXY_ENDPOINT.origin &&
  isProxyPath;
const usingProxy = isProxyPath;
const notificationHubEndpoint = RESOLVED_API_ENDPOINT;

window.resolveApiEndpoint = resolveApiEndpoint;
window.API_RUNTIME_DIAGNOSTICS = Object.freeze({
  apiBaseUrl: API_BASE_URL,
  resolvedEndpoint: RESOLVED_API_ENDPOINT,
  notificationHubEndpoint,
  isProxy: usingProxy,
  isSameOriginWithLocalProxy,
  isMalformed: isLikelyMalformedApiBaseUrl(rawApiBaseUrl)
});
window.BACKEND_ENDPOINTS = Object.freeze({
  proxyBaseUrl: API_BASE_URL
});

window.CONFIG = {
  DATA_VERSION: '5',
  DATA_STALE_HOURS: 6,

  SHEET_URL:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vTRwAjNAQxiPP8uR15t_vx03JkjgEBjgUwp2bpx8rsHx-JJxVDBZyf5ap77rAKrYHfgkVMwLJVm6pGn/pub?output=csv',

  CALENDAR_API_URL: runtimeConfig.CALENDAR_API_URL || window.BACKEND_ENDPOINTS.proxyBaseUrl,
  CALENDAR_SHEET_NAME: 'CalendarEvents',
  DEALS_SHEET_NAME: 'Deals',
  PROPOSAL_CATALOG_SHEET_NAME: runtimeConfig.PROPOSAL_CATALOG_SHEET_NAME || 'Proposal Catalog',
  ROLES_SHEET_NAME: runtimeConfig.ROLES_SHEET_NAME || 'Roles',
  ROLE_PERMISSIONS_SHEET_NAME: runtimeConfig.ROLE_PERMISSIONS_SHEET_NAME || 'Role Permissions',
  RECEIPTS_SHEET_NAME: runtimeConfig.RECEIPTS_SHEET_NAME || 'Receipts',
  RECEIPT_ITEMS_SHEET_NAME: runtimeConfig.RECEIPT_ITEMS_SHEET_NAME || 'Receipt Items',

  WORKFLOWS_SHEET_NAME: runtimeConfig.WORKFLOWS_SHEET_NAME || 'Workflows',
  WORKFLOW_RULES_SHEET_NAME: runtimeConfig.WORKFLOW_RULES_SHEET_NAME || 'Workflow Rules',
  WORKFLOW_APPROVALS_SHEET_NAME: runtimeConfig.WORKFLOW_APPROVALS_SHEET_NAME || 'Workflow Approvals',
  WORKFLOW_AUDIT_LOG_SHEET_NAME: runtimeConfig.WORKFLOW_AUDIT_LOG_SHEET_NAME || 'Workflow Audit Log',
  OPERATIONS_ONBOARDING_SHEET_NAME:
    runtimeConfig.OPERATIONS_ONBOARDING_SHEET_NAME || 'Operations Onboarding',

  ISSUE_API_URL: runtimeConfig.ISSUE_API_URL || window.BACKEND_ENDPOINTS.proxyBaseUrl,

  TREND_DAYS_RECENT: 7,
  TREND_DAYS_WINDOW: 14,

  RISK: {
    priorityWeight: { High: 3, Medium: 2, Low: 1, '': 1 },
    techBoosts: [
      ['timeout', 3],
      ['time out', 3],
      ['latency', 2],
      ['slow', 2],
      ['performance', 2],
      ['crash', 3],
      ['error', 2],
      ['exception', 2],
      ['down', 3]
    ],
    bizBoosts: [
      ['payment', 3],
      ['payments', 3],
      ['billing', 2],
      ['invoice', 1],
      ['checkout', 2],
      ['refund', 2],
      ['revenue', 3],
      ['vip', 2]
    ],
    opsBoosts: [
      ['prod ', 2],
      ['production', 2],
      ['deploy', 2],
      ['deployment', 2],
      ['rollback', 2],
      ['incident', 3],
      ['p0', 3],
      ['p1', 2],
      ['sla', 2]
    ],
    statusBoosts: { 'on stage': 2, under: 1 },
    misalignedDelta: 1,
    highRisk: 9,
    critRisk: 13,
    staleDays: 10
  },

  LABEL_KEYWORDS: {
    'Authentication / Login': [
      'login',
      'signin',
      'sign in',
      'password',
      'auth',
      'token',
      'session',
      'otp'
    ],
    'Payments / Billing': [
      'payment',
      'payments',
      'billing',
      'invoice',
      'card',
      'credit',
      'charge',
      'checkout',
      'refund'
    ],
    'Performance / Latency': [
      'slow',
      'slowness',
      'latency',
      'performance',
      'perf',
      'timeout',
      'time out',
      'lag'
    ],
    'Reliability / Errors': [
      'error',
      'errors',
      'exception',
      '500',
      '503',
      'fail',
      'failed',
      'crash',
      'down',
      'unavailable'
    ],
    'UI / UX': ['button', 'screen', 'page', 'layout', 'css', 'ui', 'ux', 'alignment', 'typo'],
    'Data / Sync': [
      'sync',
      'synchron',
      'cache',
      'cached',
      'replica',
      'replication',
      'consistency',
      'out of date'
    ]
  },

  CATEGORY_ORDER: [
    'Authentication / Login',
    'Payments / Billing',
    'Performance / Latency',
    'Reliability / Errors',
    'UI / UX',
    'Data / Sync'
  ],

  CHANGE: {
    overlapLookbackMinutes: 60,
    hotIssueRecentDays: 7,
    freezeWindows: [
      { dow: [5], startHour: 16, endHour: 23 },
      { dow: [6], startHour: 0, endHour: 23 }
    ]
  },

  FNB: {
    WEEKEND: {
      gulf: [5, 6],
      levant: [5],
      northafrica: [5]
    },
    BUSY_WINDOWS: [
      { start: 12, end: 15, weight: 3, label: 'lunch rush' },
      { start: 19, end: 23, weight: 4, label: 'dinner rush' }
    ],
    OFFPEAK_WINDOWS: [
      { start: 6, end: 10, weight: -1, label: 'pre-service' },
      { start: 15, end: 18, weight: -0.5, label: 'between lunch & dinner' }
    ]
  }
};

const CONFIG = window.CONFIG;

window.LS_KEYS = {
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
  session: 'incheckSession',
  persistentSession: 'incheckPersistentSession',
  csmActivity: 'incheckCsmActivity'
};

const LS_KEYS = window.LS_KEYS;

window.ROLES = Object.freeze({
  ADMIN: 'admin',
  VIEWER: 'viewer',
  HOO: 'hoo',
  DEV: 'dev'
});

const ROLES = window.ROLES;
