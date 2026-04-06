const RUNTIME_CONFIG = window.RUNTIME_CONFIG || {};

const API_BASE_URL = String(
  RUNTIME_CONFIG.API_BASE_URL ||
  RUNTIME_CONFIG.PROXY_API_BASE_URL ||
  RUNTIME_CONFIG.BACKEND_API_BASE_URL ||
  '/api/proxy'
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

const CONFIG = {
  DATA_VERSION: '4',
   DATA_STALE_HOURS: 6,

  // Issues CSV (read-only)
  SHEET_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTRwAjNAQxiPP8uR15t_vx03JkjgEBjgUwp2bpx8rsHx-JJxVDBZyf5ap77rAKrYHfgkVMwLJVm6pGn/pub?output=csv",

  // Calendar backend/proxy URL
  CALENDAR_API_URL:
    RUNTIME_CONFIG.CALENDAR_API_URL ||
    API_BASE_URL,

  // Exact Google Sheet tab name used by the calendar backend
  CALENDAR_SHEET_NAME: 'CalendarEvents',
  
  // Issues backend/proxy URL (tickets resource)
  ISSUE_API_URL:
    RUNTIME_CONFIG.ISSUE_API_URL ||
    API_BASE_URL,
  CSM_DAILY_API_URL:
    RUNTIME_CONFIG.CSM_DAILY_API_URL || '',

  
  TREND_DAYS_RECENT: 7,
  TREND_DAYS_WINDOW: 14,

  RISK: {
    priorityWeight: { High: 3, Medium: 2, Low: 1, "": 1 },
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
    'UI / UX': [
      'button',
      'screen',
      'page',
      'layout',
      'css',
      'ui',
      'ux',
      'alignment',
      'typo'
    ],
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
      { dow: [5], startHour: 16, endHour: 23 }, // Friday evening
      { dow: [6], startHour: 0, endHour: 23 } // Saturday
    ]
  },

  /**
   * F&B / Middle East release-planning heuristics
   * Used by ReleasePlanner
   */
  FNB: {
    // Weekend patterns (0 = Sun)
    WEEKEND: {
      gulf: [5, 6], // Fri, Sat
      levant: [5], // Fri
      northafrica: [5] // Fri
    },
    // Typical busy windows (local time)
    BUSY_WINDOWS: [
      { start: 12, end: 15, weight: 3, label: 'lunch rush' },
      { start: 19, end: 23, weight: 4, label: 'dinner rush' }
    ],
    OFFPEAK_WINDOWS: [
      { start: 6, end: 10, weight: -1, label: 'pre-service' },
      { start: 15, end: 18, weight: -0.5, label: 'between lunch & dinner' }
    ]
    // Note: public / religious holidays are taken from the calendar feed
    // (events whose type or description indicate a holiday / Eid / Ramadan, etc.).
  },
  HEALTH_MONITOR: {
    TARGET_LABEL: 'app.incheck360.com',
    TARGET_URL: 'https://app.incheck360.com/',
    TARGETS: RUNTIME_CONFIG.HEALTH_MONITOR_TARGETS || [
      { label: 'app.incheck360.com', url: 'https://app.incheck360.com/' },
      { label: 'api.incheck360.com', url: 'https://api.incheck360.com/' }
    ],
    INTERVAL_MS: 60_000,
    TIMEOUT_MS: 10_000,
    MAX_HISTORY: 25,
    READ_URL:
      RUNTIME_CONFIG.HEALTH_MONITOR_READ_URL ||
      `${API_BASE_URL}?resource=monitor_health`,
    ENABLE_POST_TO_SHEET: RUNTIME_CONFIG.HEALTH_MONITOR_ENABLE_POST_TO_SHEET !== false,
    POST_URL:
      RUNTIME_CONFIG.HEALTH_MONITOR_POST_URL || API_BASE_URL,
    SHEET_NAME: RUNTIME_CONFIG.HEALTH_MONITOR_SHEET_NAME || 'Monitor Health',
    ENVIRONMENT: RUNTIME_CONFIG.HEALTH_MONITOR_ENVIRONMENT || 'prod',
    REGION: RUNTIME_CONFIG.HEALTH_MONITOR_REGION || 'us',
    WRITE_PASSCODE: RUNTIME_CONFIG.HEALTH_MONITOR_WRITE_PASSCODE || ''
  }
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
  session: 'incheckSession',
  csmDailyFilters: 'incheckCsmDailyFilters',
  csmDailyRows: 'incheckCsmDailyRows',
  csmDailyLastUpdated: 'incheckCsmDailyLastUpdated'
};

const ROLES = Object.freeze({
  ADMIN: 'admin',
  VIEWER: 'viewer'
});
