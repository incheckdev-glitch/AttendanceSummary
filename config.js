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

const SUPABASE_URL =
  runtimeConfig.SUPABASE_URL ||
  runtimeConfig.NEXT_PUBLIC_SUPABASE_URL ||
  'https://ghvceonzwcvdxccdtoua.supabase.co';
const SUPABASE_ANON_KEY =
  runtimeConfig.SUPABASE_ANON_KEY ||
  runtimeConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_0neF-7OK8rdNA_Lxuwoaww_dSL7TNwL';
window.SUPABASE_URL = String(SUPABASE_URL || '').trim();
window.SUPABASE_ANON_KEY = String(SUPABASE_ANON_KEY || '').trim();

window.resolveApiEndpoint = resolveApiEndpoint;
window.API_RUNTIME_DIAGNOSTICS = Object.freeze({
  apiBaseUrl: '',
  resolvedEndpoint: '',
  notificationHubEndpoint: '',
  isProxy: false,
  isSameOriginWithLocalProxy: false,
  isMalformed: false,
  mode: 'supabase-only'
});
window.BACKEND_ENDPOINTS = Object.freeze({
  proxyBaseUrl: ''
});

window.CONFIG = {
  DATA_VERSION: '5',
  DATA_STALE_HOURS: 6,

  CALENDAR_API_URL: runtimeConfig.CALENDAR_API_URL || '',
  CALENDAR_TABLE: 'events',
  DEALS_TABLE: 'deals',
  PROPOSAL_CATALOG_TABLE: runtimeConfig.PROPOSAL_CATALOG_TABLE || 'proposal_catalog_items',
  ROLES_TABLE: runtimeConfig.ROLES_TABLE || 'roles',
  ROLE_PERMISSIONS_TABLE: runtimeConfig.ROLE_PERMISSIONS_TABLE || 'role_permissions',
  RECEIPTS_TABLE: runtimeConfig.RECEIPTS_TABLE || 'receipts',
  RECEIPT_ITEMS_TABLE: runtimeConfig.RECEIPT_ITEMS_TABLE || 'receipt_items',

  WORKFLOWS_TABLE: runtimeConfig.WORKFLOWS_TABLE || 'workflow_rules',
  WORKFLOW_RULES_TABLE: runtimeConfig.WORKFLOW_RULES_TABLE || 'workflow_rules',
  WORKFLOW_APPROVALS_TABLE: runtimeConfig.WORKFLOW_APPROVALS_TABLE || 'workflow_approvals',
  WORKFLOW_AUDIT_LOG_TABLE: runtimeConfig.WORKFLOW_AUDIT_LOG_TABLE || 'workflow_audit_log',
  OPERATIONS_ONBOARDING_TABLE:
    runtimeConfig.OPERATIONS_ONBOARDING_TABLE || 'operations_onboarding',

  ISSUE_API_URL: runtimeConfig.ISSUE_API_URL || '',
  PUSH_VAPID_PUBLIC_KEY: runtimeConfig.PUSH_VAPID_PUBLIC_KEY || runtimeConfig.VAPID_PUBLIC_KEY || '',

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
  csmActivity: 'incheckCsmActivity',
  lastKnownRole: 'incheckLastKnownRole'
};

const LS_KEYS = window.LS_KEYS;

window.ROLES = Object.freeze({
  ADMIN: 'admin',
  VIEWER: 'viewer',
  HOO: 'hoo',
  DEV: 'dev'
});

const ROLES = window.ROLES;
