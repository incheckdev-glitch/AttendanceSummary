// config.js
// Core configuration, enums, LS keys, stopwords

export const STATUSES = {
  RESOLVED: 'Resolved',
  UNDER_DEV: 'Under Development',
  REJECTED: 'Rejected',
  ON_HOLD: 'On Hold',
  NOT_STARTED: 'Not Started Yet',
  SENT: 'Sent',
  ON_STAGE: 'On Stage'
};

export const PRIORITIES = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low'
};

export const EVENT_TYPES = {
  DEPLOYMENT: 'Deployment',
  MAINTENANCE: 'Maintenance',
  RELEASE: 'Release',
  OTHER: 'Other'
};

export const ENVS = {
  PROD: 'Prod',
  STAGING: 'Staging',
  DEV: 'Dev',
  OTHER: 'Other'
};

export const CONFIG = {
  // bump version to invalidate old cached issues if needed
  DATA_VERSION: '3',

  // Issues CSV (read-only)
  SHEET_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTRwAjNAQxiPP8uR15t_vx03JkjgEBjgUwp2bpx8rsHx-JJxVDBZyf5ap77rAKrYHfgkVMwLJVm6pGn/pub?output=csv",

  // Calendar Apps Script web app URL (wrapped via corsproxy to handle CORS)
  CALENDAR_API_URL:
    "https://corsproxy.io/?" +
    encodeURIComponent(
      "https://script.google.com/macros/s/AKfycbyzvLTrplAeh9YFmF7a59eFS4jitj5GftBRrDLd_K9cUiIv3vjizxYN6juNEfeRfEAD8w/exec"
    ),

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
   */
  FNB: {
    WEEKEND: {
      gulf: [5, 6], // Fri, Sat
      levant: [5], // Fri
      northafrica: [5] // Fri
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

export const LS_KEYS = {
  filters: 'incheckFilters',
  theme: 'theme',
  events: 'incheckEvents',
  issues: 'incheckIssues',
  issuesLastUpdated: 'incheckIssuesLastUpdated',
  dataVersion: 'incheckDataVersion',
  pageSize: 'pageSize',
  view: 'incheckView',
  accentColor: 'incheckAccent',
  accentColorStorage: 'incheckAccentColor'
};

export const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'for',
  'with',
  'this',
  'that',
  'from',
  'into',
  'onto',
  'when',
  'what',
  'where',
  'how',
  'why',
  'can',
  'could',
  'should',
  'would',
  'will',
  'just',
  'have',
  'has',
  'had',
  'been',
  'are',
  'is',
  'was',
  'were',
  'to',
  'in',
  'on',
  'of',
  'at',
  'by',
  'as',
  'it',
  'its',
  'be',
  'we',
  'you',
  'they',
  'our',
  'your',
  'their',
  'not',
  'no',
  'if',
  'else',
  'then',
  'than',
  'about',
  'after',
  'before',
  'more',
  'less',
  'also',
  'only',
  'very',
  'get',
  'got',
  'see',
  'seen',
  'use',
  'used',
  'using',
  'user',
  'issue',
  'bug',
  'ticket',
  'inc'
]);
