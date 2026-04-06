window.RUNTIME_CONFIG = window.RUNTIME_CONFIG || {};
const runtimeConfig = window.RUNTIME_CONFIG;

window.API_BASE_URL = String(
  runtimeConfig.API_BASE_URL ||
    runtimeConfig.PROXY_API_BASE_URL ||
    runtimeConfig.BACKEND_API_BASE_URL ||
    '/api/proxy'
)
  .trim() || '/api/proxy';
 
const API_BASE_URL = window.API_BASE_URL;

function resolveApiEndpoint(endpoint = '') {
  const rawEndpoint = String(endpoint || '').trim();
  if (!rawEndpoint) return '';
  try {
    return new URL(rawEndpoint, window.location.origin).toString();
  } catch (_) {
    return rawEndpoint;
  }
}

window.resolveApiEndpoint = resolveApiEndpoint;

window.CONFIG = {
  DATA_VERSION: '5',
  DATA_STALE_HOURS: 6,

  SHEET_URL:
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vTRwAjNAQxiPP8uR15t_vx03JkjgEBjgUwp2bpx8rsHx-JJxVDBZyf5ap77rAKrYHfgkVMwLJVm6pGn/pub?output=csv',

  CALENDAR_API_URL: runtimeConfig.CALENDAR_API_URL || API_BASE_URL,
  CALENDAR_SHEET_NAME: 'CalendarEvents',

  ISSUE_API_URL: runtimeConfig.ISSUE_API_URL || API_BASE_URL,

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
  session: 'incheckSession'
};

const LS_KEYS = window.LS_KEYS;

window.ROLES = Object.freeze({
  ADMIN: 'admin',
  VIEWER: 'viewer'
});

const ROLES = window.ROLES;
