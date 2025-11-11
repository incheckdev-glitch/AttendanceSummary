/**
 * InCheck Pro Dashboard — Issues · Ops · AI Copilot
 * Single-file architecture:
 *  - CONFIG / LS_KEYS
 *  - DataStore (issues + text analytics)
 *  - Domain risk engine (technical + biz + ops + severity/impact/urgency)
 *  - DSL query parser & matcher
 *  - Calendar risk (events + collisions + freezes + hot issues)
 *  - Release planner (F&B / Middle East)
 */

const CONFIG = {
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
    // legacy weights still used in some places (e.g. trends)
    priorityWeight: { Urgent: 4, High: 3, Medium: 2, Low: 1, '': 2 },
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

    // domain risk model pieces
    statusFactor: {
      closed: 0.3,      // Resolved / Rejected
      staging: 0.8,     // On Stage / Tested on Staging
      active: 1.0       // Under Dev / On Hold / Not Started Yet / New Futures / others
    },
    moduleFactor: {
      'mobile app': 1.3,
      reporting: 1.2,
      checklist: 1.1,
      journal: 1.0,
      employee: 0.9,
      roles: 0.9,
      locations: 0.9,
      unspecified: 1.0
    },
    typeBonus: {
      bug: 1,
      'new futures': -0.5
    },
    keywordBuckets: {
      dataIntegrity: {
        score: 3,
        patterns: [
          'historical data',
          'history data',
          'historical log',
          'journal entries not showing',
          'deleted',
          'being deleted',
          'disappear',
          'not showing in report',
          'not showing on report',
          'missing in report',
          'wrong %',
          'wrong percentage',
          'wrong completion',
          'timezone',
          'time zone',
          'arabic',
          'encoding',
          'â€œ??????â€',
          '???',
          'garbled text'
        ]
      },
      checklistBlocked: {
        score: 3,
        patterns: [
          'checklists not appearing on app',
          'checklist not appearing on app',
          'checklists not appearing',
          'checklist not appearing',
          'checklist didn’t submit completely',
          'checklists didn’t submit completely',
          'did not submit completely',
          'cannot submit',
          'can’t submit',
          'error when submitting',
          'internal server error',
          '500 internal',
          'not found',
          '404',
          'instances not appearing',
          'instances not visible',
          'cannot execute checklist'
        ]
      },
      exportFailure: {
        score: 2,
        patterns: [
          'export',
          'export issues',
          'export report',
          'pdf',
          'csv',
          'excel',
          'xlsx',
          'json',
          'unexpected token',
          'white page',
          'blank page',
          'download failed'
        ]
      },
      performanceScaling: {
        score: 2,
        patterns: [
          'long loading time',
          'long loading',
          'takes long time',
          'failed fetch',
          'failed to fetch',
          'data pagination',
          'pagination',
          'many instances',
          'large amount of data',
          'large data',
          'slow loading'
        ]
      },
      releaseRegression: {
        score: 1,
        patterns: [
          'after new release',
          'after the new release',
          'before release was working',
          'before release it was working',
          'staging vs live',
          'staging vs production',
          'on stage',
          'tested on staging'
        ]
      }
    },

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
  }
};

const LS_KEYS = {
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

const STOPWORDS = new Set([
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

// Domain keyword dictionary for patterns (AI tab)
const DOMAIN_TERMS = {
  'export / CSV / PDF': [
    'export',
    'pdf',
    'csv',
    'excel',
    'xlsx',
    'json',
    'unexpected token',
    'white page',
    'blank page'
  ],
  'filters / navigation': [
    'filter',
    'filtered',
    'client filter',
    'group mode',
    'redirection',
    'redirect',
    'list view',
    'grid view',
    'list/grid',
    'navigation',
    'switch view'
  ],
  'on-demand & schedule': [
    'on demand',
    'on-demand',
    'schedule',
    'scheduled',
    'display time',
    'due time',
    'instances',
    'checklist schedule',
    'active/inactive'
  ],
  'sublist & sections': [
    'sublist',
    'sub-list',
    'section',
    'sections',
    'sub section'
  ],
  'tags & N/A / OOO': [
    'tags',
    'tagging',
    'n/a',
    'N/A',
    'ooo',
    'out of office'
  ],
  'historical log & data': [
    'historical data',
    'historical log',
    'history',
    'journal entries',
    'logbook',
    'log book',
    'log',
    'entries not showing',
    'data being deleted',
    'deleted'
  ],
  'geofencing & location': [
    'geofencing',
    'geofacing',
    'geofence',
    'location access',
    'location permission',
    'gps'
  ],
  'roles & access': [
    'role',
    'roles',
    'client access',
    'role based',
    'role-based',
    'permissions',
    'permission'
  ],
  'shared devices & QR': [
    'shared device',
    'shared devices',
    'qr code',
    'qr',
    'device admin'
  ],
  'encoding / language': [
    'arabic',
    'encoding',
    'charset',
    'language',
    '???',
    'â€œ??????â€'
  ]
};

const U = {
  q: (s, r = document) => r.querySelector(s),
  qAll: (s, r = document) => Array.from(r.querySelectorAll(s)),
  now: () => Date.now(),
  fmtTS: d => {
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x)) return '—';
    return x.toISOString().replace('T', ' ').slice(0, 16);
  },
  escapeHtml: s =>
    String(s).replace(/[&<>"']/g, m => (
      {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m]
    )),
  escapeAttr: s =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;'),
  pad: n => String(n).padStart(2, '0'),
  dateAddDays: (d, days) => {
    const base = d instanceof Date ? d : new Date(d);
    return new Date(base.getTime() + days * 86400000);
  },
  daysAgo: n => new Date(Date.now() - n * 86400000),
  isBetween: (d, a, b) => {
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x)) return false;
    const min = a ? (a instanceof Date ? a : new Date(a)) : null;
    const max = b ? (b instanceof Date ? b : new Date(b)) : null;
    if (min && x < min) return false;
    if (max && x >= max) return false;
    return true;
  }
};

/** Filters persisted */
const Filters = {
  state: {
    search: '',
    module: 'All',
    priority: 'All',
    status: 'All',
    start: '',
    end: ''
  },
  load() {
    try {
      const raw = localStorage.getItem(LS_KEYS.filters);
      if (raw) this.state = JSON.parse(raw);
    } catch {}
  },
  save() {
    try {
      localStorage.setItem(LS_KEYS.filters, JSON.stringify(this.state));
    } catch {}
  }
};

function UndefaultCount(arr) {
  const m = new Map();
  arr.forEach(t => m.set(t, (m.get(t) || 0) + 1));
  return m;
}

/** DataStore */
const DataStore = {
  rows: [],
  computed: new Map(), // id -> { tokens:Set, tf:Map, idf:Map, risk, suggestions, domainCategory }
  byId: new Map(),
  byModule: new Map(),
  byStatus: new Map(),
  byPriority: new Map(),
  df: new Map(),
  N: 0,
  events: [],
  etag: null,

  normalizeStatus(s) {
    const i = (s || '').trim().toLowerCase();
    if (!i) return 'Not Started Yet';
    if (i.startsWith('resolved')) return 'Resolved';
    if (i.startsWith('rejected')) return 'Rejected';
    if (i.startsWith('on hold')) return 'On Hold';
    if (i.startsWith('not started')) return 'Not Started Yet';
    if (i.startsWith('new futures')) return 'New Futures';
    if (i.startsWith('under')) return 'Under Development';
    if (i.startsWith('tested on staging')) return 'Tested on Staging';
    if (i.startsWith('on stage')) return 'On Stage';
    if (i.startsWith('sent')) return 'Sent';
    return s || 'Not Started Yet';
  },
  normalizePriority(p) {
    const i = (p || '').trim().toLowerCase();
    if (!i) return '';
    if (i.startsWith('u') || i.includes('urgent') || i.includes('p0')) return 'Urgent';
    if (i.startsWith('h') || i.includes('p1')) return 'High';
    if (i.startsWith('m')) return 'Medium';
    if (i.startsWith('l')) return 'Low';
    return p;
  },
  normalizeModule(m) {
    const i = (m || '').trim().toLowerCase();
    if (!i) return 'Unspecified';
    if (i.startsWith('mobile')) return 'Mobile App';
    if (i.startsWith('report')) return 'Reporting';
    if (i.startsWith('check')) return 'Checklist';
    if (i.startsWith('journal')) return 'Journal';
    if (i.startsWith('employee')) return 'Employee';
    if (i.startsWith('role')) return 'Roles';
    if (i.startsWith('location')) return 'Locations';
    return m;
  },
  normalizeType(t) {
    const i = (t || '').trim().toLowerCase();
    if (!i) return '';
    if (i.startsWith('bug')) return 'Bug';
    if (i.startsWith('enh')) return 'Enhancement';
    if (i.startsWith('new futures')) return 'New Futures';
    return t;
  },
  normalizeRow(raw) {
    const lower = {};
    for (const k in raw) {
      if (!k) continue;
      lower[k.toLowerCase().replace(/\s+/g, ' ').trim()] = String(raw[k] ?? '').trim();
    }
    const pick = (...keys) => {
      for (const key of keys) {
        if (lower[key]) return lower[key];
      }
      return '';
    };
    const module = this.normalizeModule(
      pick('impacted module', 'module', 'issue location')
    );
    const type = this.normalizeType(pick('category', 'type'));
    const priority = this.normalizePriority(pick('priority'));

    return {
      id: pick('ticket id', 'id'),
      module: module || 'Unspecified',
      title: pick('title'),
      desc: pick('description'),
      file: pick('file upload', 'link', 'url'),
      priority,
      status: this.normalizeStatus(pick('status') || 'Not Started Yet'),
      type,
      date: pick('timestamp', 'date', 'created at'),
      log: pick('log', 'logs', 'comment', 'notes')
    };
  },
  tokenize(issue) {
    const text = [issue.title, issue.desc, issue.log]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return text
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(w => w && w.length > 2 && !STOPWORDS.has(w));
  },
  hydrate(csvText) {
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    }).data
      .map(DataStore.normalizeRow.bind(DataStore))
      .filter(r => r.id && r.id.trim() !== '');
    this.hydrateFromRows(parsed);
  },
  hydrateFromRows(parsed) {
    this.rows = parsed || [];
    this.byId.clear();
    this.byModule.clear();
    this.byStatus.clear();
    this.byPriority.clear();
    this.computed.clear();
    this.df.clear();
    this.N = this.rows.length;

    this.rows.forEach(r => {
      this.byId.set(r.id, r);
      if (!this.byModule.has(r.module)) this.byModule.set(r.module, []);
      this.byModule.get(r.module).push(r);
      if (!this.byStatus.has(r.status)) this.byStatus.set(r.status, []);
      this.byStatus.get(r.status).push(r);
      if (!this.byPriority.has(r.priority)) this.byPriority.set(r.priority, []);
      this.byPriority.get(r.priority).push(r);

      const toks = DataStore.tokenize(r);
      const uniq = new Set(toks);
      uniq.forEach(t => this.df.set(t, (this.df.get(t) || 0) + 1));
      this.computed.set(r.id, { tokens: new Set(toks), tf: UndefaultCount(toks) });
    });

    const idf = new Map();
    this.df.forEach((df, term) => idf.set(term, Math.log((this.N + 1) / (df + 1)) + 1));
    this.computed.forEach(meta => (meta.idf = idf));

    // risk & suggestions + domain categories
    this.rows.forEach(r => {
      const risk = Risk.computeRisk(r);
      const domainCategory = Risk.assignDomainCategory(r);
      const categories = domainCategory ? [{ label: domainCategory, score: 1 }] : [];
      const sPrio = Risk.suggestPriority(r, risk.total);
      const reasons = Risk.explainRisk(r);
      const meta = this.computed.get(r.id);
      meta.risk = { ...risk, reasons };
      meta.suggestions = { priority: sPrio, categories };
      meta.domainCategory = domainCategory;
    });

    // invalidate regression index
    RegressionIndex = null;
  }
};

const IssuesCache = {
  load() {
    try {
      const storedVersion = localStorage.getItem(LS_KEYS.dataVersion);
      if (storedVersion && storedVersion !== CONFIG.DATA_VERSION) return null;
      const raw = localStorage.getItem(LS_KEYS.issues);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : null;
    } catch {
      return null;
    }
  },
  save(rows) {
    try {
      localStorage.setItem(LS_KEYS.issues, JSON.stringify(rows || []));
      localStorage.setItem(LS_KEYS.issuesLastUpdated, new Date().toISOString());
      localStorage.setItem(LS_KEYS.dataVersion, CONFIG.DATA_VERSION);
    } catch {}
  },
  lastLabel() {
    const iso = localStorage.getItem(LS_KEYS.issuesLastUpdated);
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `Last updated: ${d.toLocaleString()}`;
  }
};

function prioMap(p) {
  return { Urgent: 4, High: 3, Medium: 2, Low: 1 }[p] || 0;
}
function prioGap(suggested, current) {
  return prioMap(suggested) - prioMap(current);
}

/** Risk engine (domain-specific; risk.total is 1..10) */
const Risk = {
  priorityBase(priority) {
    if (!priority) return 2;
    return CONFIG.RISK.priorityWeight[priority] || 2;
  },
  statusFactor(status) {
    const s = (status || '').toLowerCase();
    if (!s) return CONFIG.RISK.statusFactor.active;
    if (s.startsWith('resolved') || s.startsWith('rejected')) {
      return CONFIG.RISK.statusFactor.closed;
    }
    if (s.startsWith('on stage') || s.startsWith('tested on staging')) {
      return CONFIG.RISK.statusFactor.staging;
    }
    return CONFIG.RISK.statusFactor.active;
  },
  moduleFactor(module) {
    const m = (module || 'Unspecified').toLowerCase();
    if (m.includes('mobile')) return CONFIG.RISK.moduleFactor['mobile app'];
    if (m.includes('report')) return CONFIG.RISK.moduleFactor.reporting;
    if (m.includes('check')) return CONFIG.RISK.moduleFactor.checklist;
    if (m.includes('journal')) return CONFIG.RISK.moduleFactor.journal;
    if (m.includes('employee')) return CONFIG.RISK.moduleFactor.employee;
    if (m.includes('role')) return CONFIG.RISK.moduleFactor.roles;
    if (m.includes('location')) return CONFIG.RISK.moduleFactor.locations;
    return CONFIG.RISK.moduleFactor.unspecified;
  },
  typeBonus(type) {
    const t = (type || '').toLowerCase();
    if (t.startsWith('bug')) return CONFIG.RISK.typeBonus.bug;
    if (t.startsWith('new futures')) return CONFIG.RISK.typeBonus['new futures'];
    return 0;
  },
  keywordBonus(text) {
    const lower = (text || '').toLowerCase();
    let bonus = 0;
    const matchedReasons = [];
    Object.entries(CONFIG.RISK.keywordBuckets).forEach(([key, bucket]) => {
      const hit = bucket.patterns.some(p => lower.includes(p.toLowerCase()));
      if (hit) {
        bonus += bucket.score;
        matchedReasons.push(key);
      }
    });
    return { bonus, matchedReasons };
  },
  computeRisk(issue) {
    const txt = [issue.title, issue.desc, issue.log].filter(Boolean).join(' ');
    const lower = txt.toLowerCase();

    const priorityBase = this.priorityBase(issue.priority);
    const statusFactor = this.statusFactor(issue.status);
    const moduleFactor = this.moduleFactor(issue.module);
    const typeBonus = this.typeBonus(issue.type);
    const { bonus: keywordBonus, matchedReasons } = this.keywordBonus(txt);

    let raw =
      (priorityBase * 2 + typeBonus + keywordBonus) * statusFactor * moduleFactor;

    // clamp to 1..10
    let riskScore = Math.round(raw);
    if (riskScore < 1) riskScore = 1;
    if (riskScore > 10) riskScore = 10;

    // simple sub-dimensions for UI
    let severity = priorityBase;
    if (matchedReasons.includes('dataIntegrity')) severity += 2;
    if (matchedReasons.includes('checklistBlocked')) severity += 2;
    if (matchedReasons.includes('exportFailure')) severity += 1;

    let impact = 1;
    if (/report|export|journal|historical/i.test(lower)) impact += 2;
    if (/mobile app|checklist/i.test(lower)) impact += 1;
    if (/roles|employee|location|geofencing|geofacing/i.test(lower)) impact += 1;

    let urgency = 1;
    if (/urgent|asap|today|now|immediately|sla/i.test(lower)) urgency += 1.5;
    if (issue.priority === 'Urgent') urgency += 1;
    if (issue.status && /on stage|tested on staging/i.test(issue.status)) {
      urgency += 0.5;
    }

    // normalize severity/impact/urgency to small ints
    const sevScore = Math.max(1, Math.min(5, Math.round(severity)));
    const impScore = Math.max(1, Math.min(5, Math.round(impact)));
    const urgScore = Math.max(1, Math.min(5, Math.round(urgency)));

    // legacy components kept for compatibility
    return {
      technical: priorityBase,
      business: 0,
      operational: 0,
      time: 0,
      total: riskScore,
      severity: sevScore,
      impact: impScore,
      urgency: urgScore,
      matchedReasons
    };
  },
  assignDomainCategory(issue) {
    const mod = (issue.module || '').toLowerCase();
    const text = [issue.title, issue.desc, issue.log]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const has = (...terms) => terms.some(t => text.includes(t.toLowerCase()));

    // 1) Reporting – Filters & Navigation
    if (
      mod.includes('report') &&
      has(
        'filter',
        'filtered',
        'client filter',
        'group mode',
        'redirection',
        'redirect',
        'list view',
        'grid view',
        'list/grid',
        'pagination',
        'page size',
        'view mode'
      )
    ) {
      return 'Reporting – Filters & Navigation';
    }

    // 2) Reporting – Exports & Data Format
    if (
      mod.includes('report') &&
      has(
        'export',
        'pdf',
        'csv',
        'excel',
        'xlsx',
        'unexpected token',
        'json',
        'white page',
        'blank page',
        'encoding',
        'arabic'
      )
    ) {
      return 'Reporting – Exports & Data Format';
    }

    // 3) Checklist – Schedule & Instances
    if (
      mod.includes('checklist') ||
      ((mod.includes('report') || mod.includes('mobile')) &&
        has(
          'schedule',
          'scheduled',
          'on demand',
          'on-demand',
          'display time',
          'due time',
          'instances',
          'instance'
        ))
    ) {
      return 'Checklist – Schedule & Instances';
    }

    // 4) Sublist, Tags & Completion Logic
    if (
      has(
        'sublist',
        'sub-list',
        'section',
        'sections',
        'tags',
        'tagging',
        'n/a',
        'ooo',
        'out of office',
        'partially done',
        'partial done',
        'completion %',
        'completion%',
        'list completion',
        'score',
        'distribution'
      )
    ) {
      return 'Sublist, Tags & Completion Logic';
    }

    // 5) Mobile App UX & Workflow
    if (mod.includes('mobile') && !mod.includes('report')) {
      return 'Mobile App UX & Workflow';
    }

    // 6) Access & Permissions
    if (
      mod.includes('employee') ||
      mod.includes('roles') ||
      mod.includes('role') ||
      mod.includes('location') ||
      has(
        'client access',
        'role based',
        'role-based',
        'permissions',
        'permission',
        'geofencing',
        'geofacing',
        'device admin',
        'shared device',
        'transfer employees'
      )
    ) {
      return 'Access & Permissions';
    }

    // 7) Journal & Logging
    if (
      mod.includes('journal') ||
      has('journal entries', 'logbook', 'log book', 'log', 'history', 'historical log')
    ) {
      return 'Journal & Logging';
    }

    return null;
  },
  suggestCategories(issue) {
    const cat = this.assignDomainCategory(issue);
    return cat ? [{ label: cat, score: 1 }] : [];
  },
  suggestPriority(issue, totalRisk) {
    if (issue.priority) return issue.priority;
    const s = totalRisk != null ? totalRisk : this.computeRisk(issue).total;
    if (s >= 9) return 'Urgent';
    if (s >= 7) return 'High';
    if (s >= 4) return 'Medium';
    return 'Low';
  },
  explainRisk(issue) {
    const txt = [issue.title, issue.desc, issue.log]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const reasons = [];

    const addIf = (cond, label) => {
      if (cond) reasons.push(label);
    };

    addIf(issue.priority === 'Urgent', 'priority urgent');
    addIf(issue.priority === 'High', 'priority high');

    const k = CONFIG.RISK.keywordBuckets;
    if (k.dataIntegrity.patterns.some(p => txt.includes(p.toLowerCase()))) {
      reasons.push('data integrity / audit risk');
    }
    if (k.checklistBlocked.patterns.some(p => txt.includes(p.toLowerCase()))) {
      reasons.push('checklist submission blocked');
    }
    if (k.exportFailure.patterns.some(p => txt.includes(p.toLowerCase()))) {
      reasons.push('exports / reporting failing');
    }
    if (k.performanceScaling.patterns.some(p => txt.includes(p.toLowerCase()))) {
      reasons.push('performance / scaling');
    }
    if (k.releaseRegression.patterns.some(p => txt.includes(p.toLowerCase()))) {
      reasons.push('release / staging regression hint');
    }

    const s = (issue.status || '').toLowerCase();
    addIf(s.startsWith('on stage') || s.startsWith('tested on staging'), 'staging only');
    addIf(
      s.startsWith('on hold') || s.startsWith('on stage'),
      'stuck in intermediate status'
    );

    const cat = this.assignDomainCategory(issue);
    if (cat) reasons.push(cat);

    return Array.from(new Set(reasons)).slice(0, 6);
  }
};

/** Command DSL parser */
const DSL = {
  parse(text) {
    const lowerFull = (text || '').toLowerCase();
    let w = ' ' + lowerFull + ' ';
    const out = {
      module: null,
      status: null,
      priority: null,
      id: null,
      type: null,
      missing: null,
      category: null,
      regression: false,
      riskOp: null,
      riskVal: null,
      severityOp: null,
      severityVal: null,
      impactOp: null,
      impactVal: null,
      urgencyOp: null,
      urgencyVal: null,
      ageOp: null,
      ageVal: null,
      lastDays: null,
      cluster: null,
      sort: null,
      eventScope: null,
      words: []
    };
    const eat = (re, key, fn = v => v) => {
      const m = w.match(re);
      if (m) {
        out[key] = fn(m[1].trim());
        w = w.replace(m[0], ' ');
      }
    };
    eat(/\bmodule:([^\s]+)/, 'module');
    eat(/\bstatus:([^\s]+)/, 'status');
    eat(/\bpriority:([^\s]+)/, 'priority');
    eat(/\bid:([^\s]+)/, 'id');
    eat(/\btype:([^\s]+)/, 'type');
    eat(/\bmissing:([^\s]+)/, 'missing');
    eat(/\bcategory:([^\s]+)/, 'category');
    eat(/\bregression:(yes|true|1)/, 'regression', () => true);

    const rv = lowerFull.match(/\brisk([><=]{1,2})(\d+)/);
    if (rv) {
      out.riskOp = rv[1];
      out.riskVal = +rv[2];
      w = w.replace(rv[0], ' ');
    }

    const sv = lowerFull.match(/\bseverity([><=]{1,2})(\d+)/);
    if (sv) {
      out.severityOp = sv[1];
      out.severityVal = +sv[2];
      w = w.replace(sv[0], ' ');
    }
    const iv = lowerFull.match(/\bimpact([><=]{1,2})(\d+)/);
    if (iv) {
      out.impactOp = iv[1];
      out.impactVal = +iv[2];
      w = w.replace(iv[0], ' ');
    }
    const uv = lowerFull.match(/\burgency([><=]{1,2})(\d+)/);
    if (uv) {
      out.urgencyOp = uv[1];
      out.urgencyVal = +uv[2];
      w = w.replace(uv[0], ' ');
    }

    eat(/\blast:(\d+)d/, 'lastDays', n => +n);
    const av = lowerFull.match(/\bage([><=]{1,2})(\d+)d/);
    if (av) {
      out.ageOp = av[1];
      out.ageVal = +av[2];
      w = w.replace(av[0], ' ');
    }

    eat(/\bcluster:([^\s]+)/, 'cluster');
    eat(/\bsort:(risk|date|priority)/, 'sort');
    eat(/\bevent:(\S+)/, 'eventScope');

    out.words = w
      .split(/\s+/)
      .filter(Boolean)
      .filter(t => t.length > 2 && !STOPWORDS.has(t));

    // bare "bug" / "enhancement" shorthand
    if (!out.type) {
      if (/\bbug\b/.test(lowerFull)) out.type = 'bug';
      else if (/\benh(ancement)?\b/.test(lowerFull)) out.type = 'enhancement';
    }

    return out;
  },
  matches(issue, meta, q) {
    if (q.module && !(issue.module || '').toLowerCase().includes(q.module)) return false;

    if (q.priority) {
      const p = q.priority[0].toUpperCase();
      if (['U', 'H', 'M', 'L'].includes(p)) {
        const ip = (issue.priority || '')[0] || '';
        if (ip !== p) return false;
      } else if (!(issue.priority || '').toLowerCase().includes(q.priority)) return false;
    }

    if (q.status) {
      const st = (issue.status || '').toLowerCase();
      if (q.status === 'open') {
        const closed = st.startsWith('resolved') || st.startsWith('rejected');
        if (closed) return false;
      } else if (q.status === 'closed') {
        const closed = st.startsWith('resolved') || st.startsWith('rejected');
        if (!closed) return false;
      } else if (!st.includes(q.status)) return false;
    }

    if (q.id && !(issue.id || '').toLowerCase().includes(q.id)) return false;

    if (q.type) {
      const desired = q.type.toLowerCase();
      const it = (issue.type || '').toLowerCase();
      if (!it.includes(desired)) return false;
    }

    if (q.missing) {
      const m = q.missing;
      if (m === 'priority' && issue.priority) return false;
      if (m === 'module' && issue.module && issue.module !== 'Unspecified') return false;
      if (m === 'type' && issue.type) return false;
    }

    if (q.lastDays) {
      const after = U.daysAgo(q.lastDays);
      if (!U.isBetween(issue.date, after, null)) return false;
    }

    if (q.ageOp && q.ageVal != null) {
      if (!issue.date) return false;
      const d = new Date(issue.date);
      if (isNaN(d)) return false;
      const ageDays = (Date.now() - d.getTime()) / 86400000;
      const op = q.ageOp;
      const b = q.ageVal;
      let pass = false;
      if (op === '>') pass = ageDays > b;
      else if (op === '>=') pass = ageDays >= b;
      else if (op === '<') pass = ageDays < b;
      else if (op === '<=') pass = ageDays <= b;
      else if (op === '=' || op === '==') pass = Math.round(ageDays) === b;
      if (!pass) return false;
    }

    if (q.cluster) {
      const t = q.cluster.toLowerCase();
      if (!meta.tokens || !Array.from(meta.tokens).some(x => x.includes(t))) return false;
    }

    const risk = meta.risk || {};

    if (q.riskOp) {
      const rv = risk.total || 0;
      const op = q.riskOp;
      const b = q.riskVal;
      let pass = false;
      if (op === '>') pass = rv > b;
      else if (op === '>=') pass = rv >= b;
      else if (op === '<') pass = rv < b;
      else if (op === '<=') pass = rv <= b;
      else if (op === '=' || op === '==') pass = rv === b;
      if (!pass) return false;
    }

    const cmpNum = (val, op, b) => {
      const v = val || 0;
      if (op === '>') return v > b;
      if (op === '>=') return v >= b;
      if (op === '<') return v < b;
      if (op === '<=') return v <= b;
      if (op === '=' || op === '==') return v === b;
      return true;
    };
    if (q.severityOp && !cmpNum(risk.severity, q.severityOp, q.severityVal)) return false;
    if (q.impactOp && !cmpNum(risk.impact, q.impactOp, q.impactVal)) return false;
    if (q.urgencyOp && !cmpNum(risk.urgency, q.urgencyOp, q.urgencyVal)) return false;

    if (q.category) {
      const desiredKey = q.category.toLowerCase();
      const cat = (meta.domainCategory || '').toLowerCase();
      const map = {
        exports: 'exports & data format',
        filters: 'filters & navigation',
        schedule: 'schedule & instances',
        sublist: 'sublist, tags & completion logic',
        access: 'access & permissions',
        journal: 'journal & logging'
      };

      const target =
        desiredKey in map
          ? map[desiredKey]
          : desiredKey.replace(/[-_]/g, ' ');

      if (!cat || !cat.includes(target)) return false;
    }

    if (q.regression) {
      if (!isRegressionIssue(issue.id)) return false;
    }

    if (q.words && q.words.length) {
      const txt = [issue.title, issue.desc, issue.log]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      for (const w of q.words) {
        if (!txt.includes(w)) return false;
      }
    }
    return true;
  }
};

/** Calendar helpers */
const CalendarLink = {
  riskBadgeClass(score) {
    if (score >= CONFIG.RISK.critRisk) return 'risk-crit';
    if (score >= CONFIG.RISK.highRisk) return 'risk-high';
    if (score >= 6) return 'risk-med';
    return 'risk-low';
  }
};

/** Events + risk (issues + events) */
function computeEventsRisk(issues, events) {
  const now = new Date();
  const limit = U.dateAddDays(now, 7);

  const openIssues = issues.filter(i => {
    const st = (i.status || '').toLowerCase();
    return !(st.startsWith('resolved') || st.startsWith('rejected'));
  });

  const modules = Array.from(new Set(openIssues.map(i => i.module).filter(Boolean)));

  const res = [];
  events.forEach(ev => {
    if (!ev.start) return;
    const d = new Date(ev.start);
    if (isNaN(d) || d < now || d > limit) return;

    const title = (ev.title || '').toLowerCase();
    const desc = (ev.description || '').toLowerCase();
    const text = title + ' ' + desc;

    const impacted = modules.filter(m => title.includes((m || '').toLowerCase()));
    let rel = [];

    if (impacted.length) {
      rel = openIssues.filter(i => impacted.includes(i.module));
    } else if ((ev.type || '').toLowerCase() !== 'other') {
      const recentOpen = openIssues.filter(i => U.isBetween(i.date, U.daysAgo(14), null));
      rel = recentOpen.filter(
        i => (DataStore.computed.get(i.id)?.risk?.total || 0) >= CONFIG.RISK.highRisk - 1
      );
    }

    if (!rel.length) return;

    let risk = 0;
    let hasDataLoss = false;
    let hasStagingOnly = false;

    rel.forEach(i => {
      const meta = DataStore.computed.get(i.id) || {};
      const r = meta.risk?.total || 0;
      risk += r;

      const t = [i.title, i.desc, i.log]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (
        /historical data|historical log|deleted|data being deleted|journal entries not showing|wrong %/i.test(
          t
        )
      ) {
        hasDataLoss = true;
      }
      const st = (i.status || '').toLowerCase();
      if (st.startsWith('on stage') || st.startsWith('tested on staging')) {
        hasStagingOnly = true;
      }
    });

    // extra bump for data-loss + staging regression pushing to Prod
    if (hasDataLoss) risk += 10;
    if (hasStagingOnly && (ev.env || 'Prod').toLowerCase() === 'prod') risk += 5;

    res.push({ event: ev, modules: impacted, issues: rel, risk, date: d });
  });

  res.sort((a, b) => b.risk - a.risk);
  return res.slice(0, 5);
}

/** Change collisions, freeze windows, hot issues flags */
function computeChangeCollisions(issues, events) {
  const flagsById = new Map();
  const byId = id => {
    let f = flagsById.get(id);
    if (!f) {
      f = { collision: false, freeze: false, hotIssues: false };
      flagsById.set(id, f);
    }
    return f;
  };
  if (!events || !events.length) return { collisions: [], flagsById };

  const openIssues = issues.filter(i => {
    const st = (i.status || '').toLowerCase();
    return !(st.startsWith('resolved') || st.startsWith('rejected'));
  });

  const highRiskIssues = openIssues.filter(i => {
    const meta = DataStore.computed.get(i.id) || {};
    const risk = meta.risk?.total || 0;
    if (risk < CONFIG.RISK.highRisk) return false;
    if (!i.date) return true;
    const d = new Date(i.date);
    if (isNaN(d)) return true;
    return U.isBetween(d, U.daysAgo(CONFIG.CHANGE.hotIssueRecentDays), null);
  });

  const normalized = events
    .map(ev => {
      const start = ev.start ? new Date(ev.start) : null;
      const end = ev.end ? new Date(ev.end) : null;
      return { ...ev, _start: start, _end: end };
    })
    .filter(ev => ev._start && !isNaN(ev._start));
  normalized.sort((a, b) => a._start - b._start);

  const collisions = [];
  const defaultDurMs = CONFIG.CHANGE.overlapLookbackMinutes * 60000;
  for (let i = 0; i < normalized.length; i++) {
    const a = normalized[i];
    const aEnd = a._end || new Date(a._start.getTime() + defaultDurMs);
    for (let j = i + 1; j < normalized.length; j++) {
      const b = normalized[j];
      if (a.env && b.env && a.env !== b.env) continue;
      if (b._start >= aEnd) break;
      const bEnd = b._end || new Date(b._start.getTime() + defaultDurMs);
      if (b._start < aEnd && a._start < bEnd) {
        collisions.push([a.id, b.id]);
        byId(a.id).collision = true;
        byId(b.id).collision = true;
      }
    }
  }

  if (CONFIG.CHANGE.freezeWindows && CONFIG.CHANGE.freezeWindows.length) {
    events.forEach(ev => {
      if (!ev.start) return;
      const d = new Date(ev.start);
      if (isNaN(d)) return;
      const dow = d.getDay(); // 0=Sun
      const hour = d.getHours();
      const inFreeze = CONFIG.CHANGE.freezeWindows.some(
        win => win.dow.includes(dow) && hour >= win.startHour && hour < win.endHour
      );
      if (inFreeze) byId(ev.id).freeze = true;
    });
  }

  events.forEach(ev => {
    const flags = byId(ev.id);
    const modulesArr = Array.isArray(ev.modules)
      ? ev.modules
      : typeof ev.modules === 'string'
      ? ev.modules
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    let rel = [];
    if (modulesArr.length) {
      rel = highRiskIssues.filter(i => modulesArr.includes(i.module));
    } else {
      const title = (ev.title || '').toLowerCase();
      rel = highRiskIssues.filter(
        i => (i.module || '') && title.includes((i.module || '').toLowerCase())
      );
    }
    if (rel.length) flags.hotIssues = true;
  });

  return { collisions, flagsById };
}

function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(
    d.getDate()
  )}T${U.pad(d.getHours())}:${U.pad(d.getMinutes())}`;
}
function toLocalDateValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
}

/* =========================================================
   Release Planner – F&B / Middle East
   ========================================================= */

const ReleasePlanner = {
  envWeight: {
    Prod: 2.5,
    Staging: 1.2,
    Dev: 0.6,
    Other: 1
  },
  releaseTypeWeight: {
    minor: 1,
    feature: 2,
    major: 3
  },
  regionKey(region) {
    if (!region) return 'gulf';
    const r = region.toLowerCase();
    if (r.includes('lev')) return 'levant';
    if (r.includes('af')) return 'northafrica';
    return 'gulf';
  },
  computeRushScore(region, date) {
    const d = date instanceof Date ? date : new Date(date);
    const hour = d.getHours();
    const dow = d.getDay(); // 0=Sun
    const key = this.regionKey(region);
    const weekend = new Set(CONFIG.FNB.WEEKEND[key] || [5, 6]);

    let score = 0;

    CONFIG.FNB.BUSY_WINDOWS.forEach(win => {
      if (hour >= win.start && hour < win.end) score += win.weight;
    });

    CONFIG.FNB.OFFPEAK_WINDOWS.forEach(win => {
      if (hour >= win.start && hour < win.end) score += win.weight;
    });

    if (weekend.has(dow)) {
      score += 1.5;
      if (hour >= 19 && hour < 23) score += 1.5;
    }

    // Late-night service tends to be sensitive for Gulf
    if (key === 'gulf' && (hour >= 23 || hour < 2)) score += 1.5;

    // Very early morning is usually safer
    if (hour < 5) score += 0.8;

    return Math.max(0, Math.min(6, score));
  },
  rushLabel(score) {
    if (score <= 1) return 'off-peak';
    if (score <= 3) return 'moderate service';
    return 'rush / busy service';
  },
  buildTicketContext(ticketIds, fallbackModules, fallbackDescription) {
    const ids = Array.isArray(ticketIds) ? ticketIds : [];
    const issues = ids.map(id => DataStore.byId.get(id)).filter(Boolean);

    const modulesSet = new Set(
      (fallbackModules || []).map(m => (m || '').toLowerCase())
    );

    let totalRisk = 0;
    let maxRisk = 0;
    const parts = [fallbackDescription || ''];

    issues.forEach(issue => {
      if (issue.module) modulesSet.add(issue.module.toLowerCase());
      const meta = DataStore.computed.get(issue.id) || {};
      const risk = meta.risk?.total || 0;
      totalRisk += risk;
      if (risk > maxRisk) maxRisk = risk;

      parts.push(
        issue.title || '',
        issue.desc || '',
        issue.log || '',
        issue.module || '',
        issue.type || '',
        issue.status || '',
        issue.priority || ''
      );
    });

    const avgRisk = issues.length ? totalRisk / issues.length : 0;
    const modules = Array.from(modulesSet).filter(Boolean);
    const text = parts.filter(Boolean).join(' ');

    return {
      ticketIds: ids,
      issues,
      modules,
      maxRisk,
      avgRisk,
      totalRisk,
      text
    };
  },
  computeBugPressure(modules, horizonDays, ticketContext) {
    const now = new Date();
    const lookback = U.dateAddDays(now, -90);
    const modSet = new Set((modules || []).map(m => (m || '').toLowerCase()));
    let sum = 0;

    DataStore.rows.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (isNaN(d) || d < lookback) return;

      const mod = (r.module || '').toLowerCase();
      const title = (r.title || '').toLowerCase();
      const desc = (r.desc || '').toLowerCase();
      let related = false;

      if (!modSet.size) related = true;
      else if (modSet.has(mod)) related = true;
      else {
        related = Array.from(modSet).some(m => title.includes(m) || desc.includes(m));
      }
      if (!related) return;

      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      if (!risk) return;

      const ageDays = (now.getTime() - d.getTime()) / 86400000;
      let w = 1;
      if (ageDays <= 7) w = 1.4;
      else if (ageDays <= 30) w = 1.1;
      else w = 0.7;

      sum += risk * w;
    });

    const normalized = sum / 25; // tuning for 1..10 risk
    let bugRisk = Math.max(0, Math.min(6, normalized));

    const tc = ticketContext || {};
    const maxTicketRisk = tc.maxRisk || 0;
    if (maxTicketRisk) {
      const boost = 1 + Math.min(maxTicketRisk / 10, 1) * 0.25;
      bugRisk = Math.max(0, Math.min(6, bugRisk * boost));
    }

    return { raw: sum, risk: bugRisk };
  },
  bugLabel(risk) {
    if (risk <= 1.5) return 'light recent bug history';
    if (risk <= 3.5) return 'moderate bug pressure';
    return 'heavy bug pressure';
  },
  computeBombBugRisk(modules, description, ticketContext) {
    const now = new Date();
    const lookback = U.dateAddDays(now, -365);
    const modSet = new Set((modules || []).map(m => (m || '').toLowerCase()));

    const text = (description || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ');
    const tokens = new Set(
      text
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOPWORDS.has(t))
    );

    let raw = 0;
    const examples = [];

    DataStore.rows.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (isNaN(d) || d < lookback) return;

      const ageDays = (now.getTime() - d.getTime()) / 86400000;
      if (ageDays <= 30) return;

      const st = (r.status || '').toLowerCase();
      const isClosed = st.startsWith('resolved') || st.startsWith('rejected');
      if (!isClosed) return;

      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      if (risk < CONFIG.RISK.highRisk) return;

      const mod = (r.module || '').toLowerCase();
      const title = (r.title || '').toLowerCase();
      const desc = (r.desc || '').toLowerCase();
      const log = (r.log || '').toLowerCase();
      const body = `${title} ${desc} ${log}`;

      let related = false;
      if (!modSet.size) related = true;
      else if (modSet.has(mod)) related = true;
      else {
        related = Array.from(tokens).some(t => body.includes(t));
      }
      if (!related) return;

      const ageFactor = Math.max(0.4, 1.3 - ageDays / 365);
      const score = risk * ageFactor;
      raw += score;

      examples.push({
        id: r.id,
        title: r.title || '',
        risk,
        ageDays
      });
    });

    const normalized = raw / 30;
    let bombRisk = Math.max(0, Math.min(6, normalized));

    const tc = ticketContext || {};
    if (tc.avgRisk) {
      const boost = 1 + Math.min(tc.avgRisk / 10, 1) * 0.3;
      bombRisk = Math.max(0, Math.min(6, bombRisk * boost));
    }

    examples.sort((a, b) => b.risk - a.risk);
    return { raw, risk: bombRisk, examples: examples.slice(0, 3) };
  },
  bombLabel(risk) {
    if (risk <= 1) return 'no strong historical bomb-bug pattern';
    if (risk <= 3) return 'some historical blast patterns in similar changes';
    return 'strong historical bomb-bug pattern, treat as high risk';
  },
  computeEventsPenalty(date, env, modules, region) {
    const dt = date instanceof Date ? date : new Date(date);
    const center = dt.getTime();
    const windowMs = 2 * 60 * 60 * 1000;
    const mods = new Set((modules || []).map(m => (m || '').toLowerCase()));

    let penalty = 0;
    let count = 0;
    let holidayCount = 0;

    DataStore.events.forEach(ev => {
      if (!ev.start) return;

      const start = new Date(ev.start);
      if (isNaN(start)) return;

      const title = (ev.title || '').toLowerCase();
      const impact = (ev.impactType || '').toLowerCase();
      const type = (ev.type || '').toLowerCase();

      const isHoliday =
        type === 'holiday' ||
        /holiday|eid|ramadan|ramadhan|ramzan|iftar|suhoor|ashura|national day|founding day/i.test(
          title
        ) ||
        /holiday|public holiday/i.test(impact);

      const evEnv = ev.env || 'Prod';

      if (!isHoliday && env && evEnv && evEnv !== env) return;

      const diffMs = Math.abs(start.getTime() - center);
      const maxWindowMs = isHoliday ? 24 * 60 * 60 * 1000 : windowMs;
      if (diffMs > maxWindowMs) return;

      const evMods = Array.isArray(ev.modules)
        ? ev.modules
        : typeof ev.modules === 'string'
        ? ev.modules.split(',').map(x => x.trim())
        : [];
      const overlap =
        mods.size &&
        evMods.some(m => mods.has((m || '').toLowerCase()));

      let contribution = 0;
      if (isHoliday) {
        holidayCount++;
        contribution = 4.5;
        if (overlap) contribution += 1.5;
      } else {
        count++;
        if (type === 'deployment' || type === 'maintenance' || type === 'release') {
          contribution = overlap ? 3 : 1.5;
        } else {
          contribution = overlap ? 2 : 1;
        }
      }

      penalty += contribution;
    });

    return { penalty, count, holidayCount };
  },
  computeSlotScore(date, ctx) {
    const { region, env, modules, releaseType, bugRisk, bombBugRisk, ticketRisk } = ctx;

    const rushRisk = this.computeRushScore(region, date);
    const envRaw = this.envWeight[env] ?? 1;
    const typeRaw = this.releaseTypeWeight[releaseType] ?? 2;

    const { penalty: eventsRisk, count: eventCount, holidayCount } =
      this.computeEventsPenalty(date, env, modules, region);

    const bugRaw = bugRisk || 0;
    const bombRaw = bombBugRisk || 0;
    const ticketsRaw = ticketRisk || 0;

    const clamp01 = v => Math.max(0, Math.min(1, v));

    const nRush = clamp01(rushRisk / 6);
    const nBug = clamp01(bugRaw / 6);
    const nBomb = clamp01(bombRaw / 6);
    const nTickets = clamp01(ticketsRaw / 6);
    const nEnv = clamp01(envRaw / 2.5);
    const nType = clamp01(typeRaw / 3);
    const nEvents = clamp01(eventsRisk / 6);

    const wRush = 0.15;
    const wBug = 0.2;
    const wBomb = 0.15;
    const wEvents = 0.2;
    const wTickets = 0.15;
    const wEnv = 0.075;
    const wType = 0.075;

    const combined =
      wRush * nRush +
      wBug * nBug +
      wBomb * nBomb +
      wEvents * nEvents +
      wTickets * nTickets +
      wEnv * nEnv +
      wType * nType;

    const totalRisk = Math.max(0, Math.min(10, combined * 10));
    const safetyScore = 10 - totalRisk;

    return {
      totalRisk,
      safetyScore,
      rushRisk,
      bugRisk: bugRaw,
      bombRisk: bombRaw,
      envRisk: envRaw,
      typeRisk: typeRaw,
      eventsRisk,
      eventCount,
      holidayCount,
      ticketsRisk: ticketsRaw
    };
  },
  riskBucket(totalRisk) {
    if (totalRisk < 3.5) {
      return { label: 'Low', className: 'planner-score-low' };
    }
    if (totalRisk < 7) {
      return { label: 'Medium', className: 'planner-score-med' };
    }
    return { label: 'High', className: 'planner-score-high' };
  },
  suggestSlots({
    region,
    env,
    modules,
    horizonDays,
    releaseType,
    description,
    slotsPerDay,
    tickets
  }) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const ticketContext = this.buildTicketContext(
      tickets || [],
      modules || [],
      description || ''
    );

    const effectiveModules =
      (ticketContext.modules && ticketContext.modules.length
        ? ticketContext.modules
        : modules) || [];
    const combinedDescription = ticketContext.text || description || '';

    const horizon = Math.max(1, horizonDays || 7);

    const bug = this.computeBugPressure(effectiveModules, horizon, ticketContext);
    const bomb = this.computeBombBugRisk(
      effectiveModules,
      combinedDescription,
      ticketContext
    );

    let ticketRiskComponent = 0;
    if (ticketContext.avgRisk) {
      ticketRiskComponent = Math.min(ticketContext.avgRisk / 2, 6);
    }

    const slots = [];
    const hoursProd = [6, 10, 15, 23];
    const hoursNonProd = [10, 15, 18];
    const hours = env === 'Prod' ? hoursProd : hoursNonProd;

    for (let dayOffset = 0; dayOffset < horizon; dayOffset++) {
      const base = U.dateAddDays(startOfToday, dayOffset);
      hours.forEach(h => {
        const dt = new Date(base.getTime());
        dt.setHours(h, 0, 0, 0);
        if (dt <= now) return;

        const score = this.computeSlotScore(dt, {
          region,
          env,
          modules: effectiveModules,
          releaseType,
          bugRisk: bug.risk,
          bombBugRisk: bomb.risk,
          ticketRisk: ticketRiskComponent
        });

        slots.push({
          ...score,
          start: dt,
          end: new Date(dt.getTime() + 60 * 60 * 1000)
        });
      });
    }

    slots.sort((a, b) => a.totalRisk - b.totalRisk);
    const perDay = Math.max(1, slotsPerDay || 3);
    const maxSlots = Math.min(slots.length, horizon * perDay);

    return { bug, bomb, slots: slots.slice(0, maxSlots), ticketContext };
  }
};

/* ---------- Elements cache ---------- */
const E = {};
function cacheEls() {
  [
    'issuesTable',
    'issuesTbody',
    'tbodySkeleton',
    'rowCount',
    'moduleFilter',
    'priorityFilter',
    'statusFilter',
    'resetBtn',
    'refreshNow',
    'exportCsv',
    'kpis',
    'issueModal',
    'modalBody',
    'modalTitle',
    'copyId',
    'copyLink',
    'modalClose',
    'drawerBtn',
    'sidebar',
    'spinner',
    'toast',
    'searchInput',
    'themeSelect',
    'firstPage',
    'prevPage',
    'nextPage',
    'lastPage',
    'pageInfo',
    'pageSize',
    'createTicketBtn',
    'startDateFilter',
    'endDateFilter',
    'issuesTab',
    'calendarTab',
    'insightsTab',
    'issuesView',
    'calendarView',
    'insightsView',
    'addEventBtn',
    'eventModal',
    'eventModalTitle',
    'eventModalClose',
    'eventForm',
    'eventTitle',
    'eventType',
    'eventIssueId',
    'eventStart',
    'eventEnd',
    'eventDescription',
    'eventSave',
    'eventCancel',
    'eventDelete',
    'eventIssueLinkedInfo',
    'aiPatternsList',
    'aiLabelsList',
    'aiRisksList',
    'aiClusters',
    'aiScopeText',
    'aiSignalsText',
    'aiTrendsList',
    'aiModulesTableBody',
    'aiTriageList',
    'aiEventsList',
    'aiQueryInput',
    'aiQueryRun',
    'aiQueryResults',
    'aiQueryApplyFilters',
    'aiIncidentsList',
    'aiEmergingStable',
    'aiOpsCockpit',
    'syncIssuesText',
    'syncIssuesDot',
    'syncEventsText',
    'syncEventsDot',
    'aiAnalyzing',
    'eventFilterDeployment',
    'eventFilterMaintenance',
    'eventFilterRelease',
    'eventFilterOther',
    'loadingStatus',
    'issuesSummaryText',
    'activeFiltersChips',
    'calendarTz',
    'onlineStatusChip',
    'accentColor',
    'shortcutsHelp',
    'aiQueryExport',
    'eventAllDay',
    'eventEnv',
    'eventOwner',
    'eventStatus',
    'eventModules',
    'eventImpactType',
    // Release Planner IDs
    'plannerRegion',
    'plannerEnv',
    'plannerModules',
    'plannerHorizon',
    'plannerReleaseType',
    'plannerRun',
    'plannerResults',
    'plannerDescription',
    'plannerSlotsPerDay',
    'plannerReleasePlan',
    'plannerTickets',
    'plannerAssignBtn',
    'plannerAddEvent'
  ].forEach(id => (E[id] = document.getElementById(id)));
}

/** UI helpers */
const UI = {
  toast(msg, ms = 3500) {
    if (!E.toast) return;
    E.toast.textContent = msg;
    E.toast.style.display = 'block';
    setTimeout(() => {
      if (E.toast) E.toast.style.display = 'none';
    }, ms);
  },
  spinner(v = true) {
    if (E.spinner) E.spinner.style.display = v ? 'flex' : 'none';
    if (E.loadingStatus)
      E.loadingStatus.textContent = v ? 'Loading…' : '';
  },
  setSync(which, ok, when) {
    const txt = which === 'issues' ? E.syncIssuesText : E.syncEventsText;
    const dot = which === 'issues' ? E.syncIssuesDot : E.syncEventsDot;
    if (!txt || !dot) return;
    txt.textContent = `${which === 'issues' ? 'Issues' : 'Events'}: ${
      when ? U.fmtTS(when) : 'never'
    }`;
    dot.className = 'dot ' + (ok ? 'ok' : 'err');
  },
  setAnalyzing(v) {
    if (E.aiAnalyzing) E.aiAnalyzing.style.display = v ? 'block' : 'none';
  },
  skeleton(show) {
    if (!E.issuesTbody || !E.tbodySkeleton) return;
    E.tbodySkeleton.style.display = show ? '' : 'none';
    E.issuesTbody.style.display = show ? 'none' : '';
  }
};

const GridState = {
  sortKey: null,
  sortAsc: true,
  page: 1,
  pageSize: +(localStorage.getItem(LS_KEYS.pageSize) || 20)
};

/** Issues UI */
UI.Issues = {
  renderFilters() {
    const uniq = a =>
      [...new Set(a.filter(Boolean).map(v => v.trim()))].sort((a, b) =>
        a.localeCompare(b)
      );
    if (E.moduleFilter)
      E.moduleFilter.innerHTML =
        ['All', ...uniq(DataStore.rows.map(r => r.module))]
          .map(v => `<option>${v}</option>`)
          .join('');
    if (E.priorityFilter)
      E.priorityFilter.innerHTML =
        ['All', ...uniq(DataStore.rows.map(r => r.priority))]
          .map(v => `<option>${v}</option>`)
          .join('');
    if (E.statusFilter)
      E.statusFilter.innerHTML =
        ['All', ...uniq(DataStore.rows.map(r => r.status))]
          .map(v => `<option>${v}</option>`)
          .join('');
  },
  applyFilters() {
    const s = Filters.state;
    const qstr = (s.search || '').toLowerCase().trim();
    const terms = qstr ? qstr.split(/\s+/).filter(Boolean) : [];
    const start = s.start ? new Date(s.start) : null;
    const end = s.end ? U.dateAddDays(s.end, 1) : null;

    return DataStore.rows.filter(r => {
      const hay = [r.id, r.module, r.title, r.desc, r.log]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (terms.length && !terms.every(t => hay.includes(t))) return false;

      let keepDate = true;
      if (r.date) {
        const d = new Date(r.date);
        if (!isNaN(d)) {
          if (start && d < start) keepDate = false;
          if (end && d >= end) keepDate = false;
        }
      } else if (start || end) {
        keepDate = false;
      }

      return (
        (!s.module || s.module === 'All' || r.module === s.module) &&
        (!s.priority || s.priority === 'All' || r.priority === s.priority) &&
        (!s.status || s.status === 'All' || r.status === s.status) &&
        keepDate
      );
    });
  },
  renderKPIs(list) {
    if (!E.kpis) return;
    const total = list.length;
    const counts = {};
    list.forEach(r => (counts[r.status] = (counts[r.status] || 0) + 1));
    E.kpis.innerHTML = '';

    const add = (label, val) => {
      const pct = total ? Math.round((val * 100) / total) : 0;
      const d = document.createElement('div');
      d.className = 'card kpi';
      d.tabIndex = 0;
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', `${label}: ${val} (${pct} percent)`);
      d.innerHTML = `
        <div class="label">${label}</div>
        <div class="value">${val}</div>
        <div class="sub">${pct}%</div>`;
      d.onclick = () => {
        if (label === 'Total Issues') {
          Filters.state = {
            search: '',
            module: 'All',
            priority: 'All',
            status: 'All',
            start: '',
            end: ''
          };
        } else {
          Filters.state.status = label;
          Filters.state.search = '';
        }
        Filters.save();
        UI.refreshAll();
      };
      d.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          d.click();
        }
      });
      E.kpis.appendChild(d);
    };

    add('Total Issues', total);
    Object.entries(counts).forEach(([s, v]) => add(s, v));
  },
  renderTable(list) {
    if (!E.issuesTbody) return;
    const { sortKey, sortAsc } = GridState;
    const sorted = sortKey
      ? [...list].sort((a, b) => {
          const va = a[sortKey] || '';
          const vb = b[sortKey] || '';
          if (sortKey === 'date') {
            const da = new Date(va);
            const db = new Date(vb);
            if (isNaN(da) && isNaN(db)) return 0;
            if (isNaN(da)) return 1;
            if (isNaN(db)) return -1;
            return da - db;
          }
          return String(va).localeCompare(String(vb), undefined, {
            numeric: true,
            sensitivity: 'base'
          });
        })
      : list;
    const rows = sortAsc ? sorted : sorted.reverse();

    const total = rows.length;
    const size = GridState.pageSize;
    const page = GridState.page;
    const pages = Math.max(1, Math.ceil(total / size));
    if (GridState.page > pages) GridState.page = pages;

    const start = (GridState.page - 1) * size;
    const pageData = rows.slice(start, start + size);

    const firstRow = total ? start + 1 : 0;
    const lastRow = total ? Math.min(total, start + pageData.length) : 0;

    if (E.rowCount) {
      E.rowCount.textContent = total
        ? `Showing ${firstRow}-${lastRow} of ${total}`
        : 'No rows';
    }
    if (E.pageInfo) E.pageInfo.textContent = `Page ${GridState.page} / ${pages}`;
    ['firstPage', 'prevPage', 'nextPage', 'lastPage'].forEach(id => {
      const btn = E[id];
      if (!btn) return;
      const atFirst = GridState.page <= 1;
      const atLast = GridState.page >= pages;
      if (id === 'firstPage' || id === 'prevPage') btn.disabled = atFirst;
      else btn.disabled = atLast;
      if (btn.disabled) btn.setAttribute('disabled', 'true');
      else btn.removeAttribute('disabled');
    });

    const badgeStatus = s =>
      `<span class="pill status-${(s || '').replace(/\s/g, '\\ ')}">${U.escapeHtml(
        s || '-'
      )}</span>`;
    const badgePrio = p =>
      `<span class="pill priority-${p || ''}">${U.escapeHtml(p || '-')}</span>`;

    if (pageData.length) {
      E.issuesTbody.innerHTML = pageData
        .map(
          r => `
        <tr role="button" tabindex="0" aria-label="Open issue ${U.escapeHtml(
          r.id || ''
        )}" data-id="${U.escapeAttr(r.id)}">
          <td>${U.escapeHtml(r.id || '-')}</td>
          <td>${U.escapeHtml(r.module || '-')}</td>
          <td>${U.escapeHtml(r.title || '-')}</td>
          <td>${badgePrio(r.priority || '-')}</td>
          <td>${badgeStatus(r.status || '-')}</td>
          <td>${U.escapeHtml(r.date || '-')}</td>
          <td>${U.escapeHtml(r.log || '-')}</td>
          <td>${
            r.file
              ? `<a href="${U.escapeAttr(
                  r.file
                )}" target="_blank" rel="noopener noreferrer" aria-label="Open attachment link">🔗</a>`
              : '-'
          }</td>
        </tr>`
        )
        .join('');
    } else {
      const parts = [];
      if (Filters.state.search) parts.push(`search "${Filters.state.search}"`);
      if (Filters.state.module && Filters.state.module !== 'All')
        parts.push(`module = ${Filters.state.module}`);
      if (Filters.state.priority && Filters.state.priority !== 'All')
        parts.push(`priority = ${Filters.state.priority}`);
      if (Filters.state.status && Filters.state.status !== 'All')
        parts.push(`status = ${Filters.state.status}`);
      if (Filters.state.start) parts.push(`from ${Filters.state.start}`);
      if (Filters.state.end) parts.push(`to ${Filters.state.end}`);
      const desc = parts.length ? parts.join(', ') : 'no filters';
      E.issuesTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center;color:var(--muted)">
            No issues found for ${U.escapeHtml(desc)}.
            <button type="button" class="btn sm" id="clearFiltersBtn" style="margin-left:8px">Clear filters</button>
          </td>
        </tr>`;
      const clearBtn = document.getElementById('clearFiltersBtn');
      if (clearBtn)
        clearBtn.addEventListener('click', () => {
          Filters.state = {
            search: '',
            module: 'All',
            priority: 'All',
            status: 'All',
            start: '',
            end: ''
          };
          Filters.save();
          if (E.searchInput) E.searchInput.value = '';
          if (E.startDateFilter) E.startDateFilter.value = '';
          if (E.endDateFilter) E.endDateFilter.value = '';
          UI.Issues.renderFilters();
          UI.refreshAll();
        });
    }

    E.issuesTbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          UI.Modals.openIssue(tr.getAttribute('data-id'));
        }
      });
      tr.addEventListener('click', e => {
        if (!e.target.closest('a')) UI.Modals.openIssue(tr.getAttribute('data-id'));
      });
    });

    U.qAll('#issuesTable thead th').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      th.setAttribute('aria-sort', 'none');
    });
    if (GridState.sortKey) {
      const th = U.q(`#issuesTable thead th[data-key="${GridState.sortKey}"]`);
      if (th) {
        th.classList.add(GridState.sortAsc ? 'sorted-asc' : 'sorted-desc');
        th.setAttribute('aria-sort', GridState.sortAsc ? 'ascending' : 'descending');
      }
    }
  },
  renderCharts(list) {
    if (typeof Chart === 'undefined') return;
    const cssVar = n =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const statusColors = {
      Resolved: cssVar('--status-resolved'),
      'Under Development': cssVar('--status-underdev'),
      Rejected: cssVar('--status-rejected'),
      'On Hold': cssVar('--status-onhold'),
      'Not Started Yet': cssVar('--status-notstarted'),
      Sent: cssVar('--status-sent'),
      'On Stage': cssVar('--status-onstage'),
      'Tested on Staging': cssVar('--status-onstage')
    };
    const priorityColors = {
      Urgent: cssVar('--priority-urgent'),
      High: cssVar('--priority-high'),
      Medium: cssVar('--priority-medium'),
      Low: cssVar('--priority-low')
    };
    const group = (arr, k) =>
      arr.reduce((m, r) => {
        const key = r[k] || 'Unspecified';
        m[key] = (m[key] || 0) + 1;
        return m;
      }, {});
    const make = (id, type, data, colors = {}) => {
      const el = U.q('#' + id);
      if (!el) return;
      UI._charts = UI._charts || {};
      if (UI._charts[id]) UI._charts[id].destroy();
      const labels = Object.keys(data);
      const values = Object.values(data);
      UI._charts[id] = new Chart(el, {
        type,
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: labels.map(l => colors[l] || cssVar('--accent'))
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: type !== 'bar' },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const total = values.reduce((a, b) => a + b, 0) || 1;
                  return `${ctx.raw} (${Math.round((ctx.raw * 100) / total)}%)`;
                }
              }
            }
          },
          scales:
            type === 'bar'
              ? {
                  x: { grid: { color: 'rgba(128,128,128,.1)' } },
                  y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(128,128,128,.12)' }
                  }
                }
              : {}
        }
      });
    };
    make('byModule', 'bar', group(list, 'module'));
    make('byPriority', 'doughnut', group(list, 'priority'), priorityColors);
    make('byStatus', 'bar', group(list, 'status'), statusColors);
    make('byType', 'bar', group(list, 'type'));
  }
};

UI.Issues.renderFilterChips = function () {
  if (!E.activeFiltersChips) return;
  const chips = [];
  const addChip = (label, value, key) => {
    if (!value) return;
    chips.push(
      `<button type="button" class="filter-chip" data-filter-key="${key}">
        <span>${label}: ${U.escapeHtml(value)}</span>
        <span aria-hidden="true">✕</span>
      </button>`
    );
  };
  const s = Filters.state;
  if (s.search) addChip('Search', s.search, 'search');
  if (s.module && s.module !== 'All') addChip('Module', s.module, 'module');
  if (s.priority && s.priority !== 'All') addChip('Priority', s.priority, 'priority');
  if (s.status && s.status !== 'All') addChip('Status', s.status, 'status');
  if (s.start) addChip('From', s.start, 'start');
  if (s.end) addChip('To', s.end, 'end');

  if (chips.length) {
    E.activeFiltersChips.innerHTML = chips.join('');
  } else {
    E.activeFiltersChips.innerHTML =
      '<span class="muted" style="font-size:11px;">No filters applied.</span>';
  }

  E.activeFiltersChips.querySelectorAll('[data-filter-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-filter-key');
      if (!key) return;
      if (key === 'search') Filters.state.search = '';
      if (key === 'module') Filters.state.module = 'All';
      if (key === 'priority') Filters.state.priority = 'All';
      if (key === 'status') Filters.state.status = 'All';
      if (key === 'start') Filters.state.start = '';
      if (key === 'end') Filters.state.end = '';

      Filters.save();
      if (E.searchInput && key === 'search') E.searchInput.value = '';
      if (E.moduleFilter && key === 'module') E.moduleFilter.value = 'All';
      if (E.priorityFilter && key === 'priority') E.priorityFilter.value = 'All';
      if (E.statusFilter && key === 'status') E.statusFilter.value = 'All';
      if (E.startDateFilter && key === 'start') E.startDateFilter.value = '';
      if (E.endDateFilter && key === 'end') E.endDateFilter.value = '';

      UI.refreshAll();
    });
  });
};

UI.Issues.renderSummary = function (list) {
  if (!E.issuesSummaryText) return;
  const total = list.length;
  let open = 0;
  let highRisk = 0;
  list.forEach(r => {
    const st = (r.status || '').toLowerCase();
    const isClosed = st.startsWith('resolved') || st.startsWith('rejected');
    if (!isClosed) open++;
    const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
    if (risk >= CONFIG.RISK.highRisk) highRisk++;
  });
  const last = IssuesCache.lastLabel();
  E.issuesSummaryText.textContent =
    `${total} issue${total === 1 ? '' : 's'} · ${open} open · ${highRisk} high-risk` +
    (last ? ` · ${last}` : '');
};

/** Clusters + regression index */
let RegressionIndex = null;

function buildClustersWeighted(list) {
  const max = Math.min(list.length, 400);
  const docs = list.slice(-max).map(r => {
    const meta = DataStore.computed.get(r.id) || {};
    return {
      issue: r,
      tokens: meta.tokens || new Set(),
      idf: meta.idf || new Map()
    };
  });

  const visited = new Set();
  const clusters = [];

  const wj = (A, IA, B, IB) => {
    let inter = 0;
    let sumA = 0;
    let sumB = 0;
    const all = new Set([...A, ...B]);
    all.forEach(t => {
      const wa = A.has(t) ? IA.get(t) || 1 : 0;
      const wb = B.has(t) ? IB.get(t) || 1 : 0;
      inter += Math.min(wa, wb);
      sumA += wa;
      sumB += wb;
    });
    const union = sumA + sumB - inter;
    return union ? inter / union : 0;
  };

  for (let i = 0; i < docs.length; i++) {
    if (visited.has(i)) continue;
    const base = docs[i];
    const c = [base];
    visited.add(i);
    for (let j = i + 1; j < docs.length; j++) {
      if (visited.has(j)) continue;
      const other = docs[j];
      if (wj(base.tokens, base.idf, other.tokens, other.idf) >= 0.65) {
        visited.add(j);
        c.push(other);
      }
    }
    if (c.length >= 2) {
      const freq = new Map();
      c.forEach(d => d.tokens.forEach(t => freq.set(t, (freq.get(t) || 0) + 1)));
      const sig = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t)
        .join(' ');
      clusters.push({ signature: sig, issues: c.map(x => x.issue) });
    }
  }

  clusters.sort((a, b) => b.issues.length - a.issues.length);
  return clusters.slice(0, 12);
}

function buildRegressionIndex() {
  const clusters = buildClustersWeighted(DataStore.rows);
  const set = new Set();

  clusters.forEach(c => {
    let hasOldClosed = false;
    let hasNewOpen = false;
    let latestOpenDate = null;
    let earliestClosedDate = null;

    c.issues.forEach(issue => {
      const st = (issue.status || '').toLowerCase();
      const isClosed = st.startsWith('resolved') || st.startsWith('rejected');
      const d = issue.date ? new Date(issue.date) : null;
      if (isClosed) {
        hasOldClosed = true;
        if (d && (!earliestClosedDate || d < earliestClosedDate)) {
          earliestClosedDate = d;
        }
      } else {
        hasNewOpen = true;
        if (d && (!latestOpenDate || d > latestOpenDate)) {
          latestOpenDate = d;
        }
      }
    });

    if (hasOldClosed && hasNewOpen) {
      c.issues.forEach(issue => {
        const st = (issue.status || '').toLowerCase();
        const isClosed = st.startsWith('resolved') || st.startsWith('rejected');
        if (!isClosed) set.add(issue.id);
      });
    }
  });

  RegressionIndex = set;
}

function isRegressionIssue(id) {
  if (!RegressionIndex) buildRegressionIndex();
  return RegressionIndex.has(id);
}

/** Analytics (AI tab) */
const Analytics = {
  _debounce: null,
  refresh(list) {
    clearTimeout(this._debounce);
    UI.setAnalyzing(true);
    this._debounce = setTimeout(() => this._render(list), 80);
  },
  _render(list) {
    // recent slice for "right now" signals
    const recentCut = CONFIG.TREND_DAYS_RECENT;
    const recent = list.filter(r => U.isBetween(r.date, U.daysAgo(recentCut), null));

    // -------- Top domain patterns (aiPatternsList) --------
    const termStats = new Map(); // label -> { count, modules:Set }
    const addTermStat = (label, mod) => {
      if (!termStats.has(label)) {
        termStats.set(label, { count: 0, modules: new Map() });
      }
      const s = termStats.get(label);
      s.count++;
      const m = mod || 'Unspecified';
      s.modules.set(m, (s.modules.get(m) || 0) + 1);
    };

    recent.forEach(r => {
      const text = [r.title, r.desc, r.log]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const mod = r.module || 'Unspecified';
      Object.entries(DOMAIN_TERMS).forEach(([label, variants]) => {
        if (variants.some(v => text.includes(v.toLowerCase()))) {
          addTermStat(label, mod);
        }
      });
    });

    const topPatterns = Array.from(termStats.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    if (E.aiPatternsList) {
      E.aiPatternsList.innerHTML = topPatterns.length
        ? topPatterns
            .map(([label, stat]) => {
              const total = stat.count;
              const modulesSorted = Array.from(stat.modules.entries()).sort(
                (a, b) => b[1] - a[1]
              );
              const topModules = modulesSorted
                .slice(0, 2)
                .map(([m]) => m)
                .join(', ');
              return `<li><strong>${U.escapeHtml(label)}</strong> – ${total} issue${
                total === 1 ? '' : 's'
              }${topModules ? ` · mostly ${U.escapeHtml(topModules)}` : ''}</li>`;
            })
            .join('')
        : '<li>No strong domain patterns recently.</li>';
    }

    // -------- Suggested categories (aiLabelsList) --------
    const catMap = new Map();
    list.forEach(r => {
      const meta = DataStore.computed.get(r.id) || {};
      const cat = meta.domainCategory;
      if (!cat) return;
      if (!catMap.has(cat)) {
        catMap.set(cat, {
          name: cat,
          total: 0,
          open: 0,
          modules: new Map(),
          examples: []
        });
      }
      const s = catMap.get(cat);
      s.total++;
      const st = (r.status || '').toLowerCase();
      const isClosed = st.startsWith('resolved') || st.startsWith('rejected');
      if (!isClosed) s.open++;
      const mod = r.module || 'Unspecified';
      s.modules.set(mod, (s.modules.get(mod) || 0) + 1);
      if (s.examples.length < 3) s.examples.push(r);
    });

    const catsSorted = Array.from(catMap.values()).sort(
      (a, b) => b.open - a.open || b.total - a.total
    );

    if (E.aiLabelsList) {
      E.aiLabelsList.innerHTML = catsSorted.length
        ? catsSorted
            .map(cat => {
              const mods = Array.from(cat.modules.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2)
                .map(([m]) => m)
                .join(', ');
              const exStr = cat.examples
                .map(r => U.escapeHtml(r.id))
                .join(', ');
              return `<li>
                <strong>${U.escapeHtml(cat.name)}</strong> – ${cat.open}/${
                cat.total
              } open · modules: ${U.escapeHtml(mods || '—')}
                <span class="muted"> · e.g. ${exStr || '—'}</span>
              </li>`;
            })
            .join('')
        : '<li>No category assignments yet.</li>';
    }

    // Scope & signals
    if (E.aiScopeText) {
      E.aiScopeText.textContent = `Analyzing ${list.length} issues (${recent.length} recent, ~last ${recentCut} days).`;
    }
    const signals = ['export', 'filter', 'schedule', 'sublist', 'tags', 'geofencing'].filter(
      t => {
        const label = Object.keys(DOMAIN_TERMS).find(key =>
          DOMAIN_TERMS[key].some(v => v.toLowerCase().includes(t))
        );
        return label && termStats.has(label);
      }
    );
    if (E.aiSignalsText) {
      E.aiSignalsText.textContent = signals.length
        ? `Recent domain signals: ${signals.join(', ')}.`
        : 'No strong recurring domain signals.';
    }

    // Trends (token-based, kept simple)
    const oldStart = U.daysAgo(CONFIG.TREND_DAYS_WINDOW);
    const mid = U.daysAgo(CONFIG.TREND_DAYS_RECENT);
    const oldCounts = new Map();
    const newCounts = new Map();
    const inHalf = r => {
      const d = new Date(r.date);
      if (isNaN(d)) return null;
      if (d < mid && d >= oldStart) return 'old';
      if (d >= mid) return 'new';
      return null;
    };
    list.forEach(r => {
      const half = inHalf(r);
      if (!half) return;
      const toks = DataStore.computed.get(r.id)?.tokens || new Set();
      const tgt = half === 'old' ? oldCounts : newCounts;
      new Set(toks).forEach(t => tgt.set(t, (tgt.get(t) || 0) + 1));
    });
    const trendTerms = new Set([...oldCounts.keys(), ...newCounts.keys()]);
    const trend = [];
    trendTerms.forEach(t => {
      const a = oldCounts.get(t) || 0;
      const b = newCounts.get(t) || 0;
      const d = b - a;
      const ratio = a === 0 ? (b >= 2 ? Infinity : 0) : b / a;
      if ((b >= 2 && ratio >= 2) || d >= 2) trend.push({ t, old: a, new: b, delta: d, ratio });
    });
    trend.sort(
      (x, y) =>
        (y.ratio === Infinity) - (x.ratio === Infinity) ||
        y.delta - x.delta ||
        y.new - x.new
    );
    if (E.aiTrendsList) {
      E.aiTrendsList.innerHTML = trend.length
        ? trend
            .slice(0, 8)
            .map(
              o =>
                `<li><strong>${U.escapeHtml(o.t)}</strong> – ${o.new} vs ${
                  o.old
                } <span class="muted">(Δ ${
                  o.delta >= 0 ? `+${o.delta}` : o.delta
                })</span></li>`
            )
            .join('')
        : '<li>No strong increases.</li>';
    }

    // Incident-like issues (4.1)
    const isIncidentLike = (issue, meta) => {
      if ((issue.type || '').toLowerCase() !== 'bug') return false;
      if (!['Urgent', 'High'].includes(issue.priority)) return false;
      const st = (issue.status || '').toLowerCase();
      if (st.startsWith('resolved') || st.startsWith('rejected')) return false;

      const txt = [issue.title, issue.desc, issue.log]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const patterns = [
        'not appearing',
        'not showing',
        'historical data being deleted',
        'historical data deleted',
        'internal server error',
        'not found',
        'failed fetch',
        'failed to fetch',
        'long loading time',
        'spinner',
        'geofencing not working',
        'geofacing not working',
        'timezone',
        'time zone',
        'duplicate instances',
        'triplicate instances',
        'submission error',
        'error when exporting',
        'error exporting'
      ];
      if (!patterns.some(p => txt.includes(p))) return false;

      return (meta.risk?.total || 0) >= 7;
    };

    const incidentCandidates = list
      .map(r => ({ r, meta: DataStore.computed.get(r.id) || {} }))
      .filter(({ r, meta }) => isIncidentLike(r, meta))
      .sort((a, b) => (b.meta.risk?.total || 0) - (a.meta.risk?.total || 0))
      .slice(0, 10);

    if (E.aiIncidentsList) {
      E.aiIncidentsList.innerHTML = incidentCandidates.length
        ? incidentCandidates
            .map(({ r, meta }) => {
              const risk = meta.risk?.total || 0;
              const badgeClass = CalendarLink.riskBadgeClass(risk);
              return `<li style="margin-bottom:4px;">
                <strong>[Risk ${risk}] ${U.escapeHtml(
                  r.module || 'Unspecified'
                )} – ${U.escapeHtml(r.title || '')}</strong>
                <span class="event-risk-badge ${badgeClass}">R${risk}</span>
                <br><span class="muted">${U.escapeHtml(
                  r.id
                )} · ${U.escapeHtml(r.status || '-')} · ${U.escapeHtml(
                r.priority || '-'
              )}</span>
              </li>`;
            })
            .join('')
        : '<li>No incident-like issues detected.</li>';
    }

    // Emerging vs Stable themes (category-based, 6.2)
    const newCut = U.daysAgo(14);
    const oldCutStart = U.daysAgo(28);
    const catOld = new Map();
    const catNew = new Map();

    list.forEach(r => {
      const meta = DataStore.computed.get(r.id) || {};
      const cat = meta.domainCategory;
      if (!cat || !r.date) return;
      const d = new Date(r.date);
      if (isNaN(d)) return;

      if (d >= newCut) {
        catNew.set(cat, (catNew.get(cat) || 0) + 1);
      } else if (d >= oldCutStart && d < newCut) {
        catOld.set(cat, (catOld.get(cat) || 0) + 1);
      }
    });

    const categoriesAll = new Set([...catOld.keys(), ...catNew.keys()]);
    const emerging = [];
    const stable = [];
    const cooling = [];

    categoriesAll.forEach(cat => {
      const oldCount = catOld.get(cat) || 0;
      const newCount = catNew.get(cat) || 0;
      if (!newCount && !oldCount) return;

      if (newCount >= 2 && (oldCount === 0 || newCount >= 2 * oldCount)) {
        emerging.push({ cat, oldCount, newCount });
      } else if (oldCount >= 3 && newCount <= oldCount / 2) {
        cooling.push({ cat, oldCount, newCount });
      } else if (newCount > 0 && oldCount > 0) {
        stable.push({ cat, oldCount, newCount });
      }
    });

    const fmtList = arr =>
      arr
        .map(
          x =>
            `${U.escapeHtml(x.cat)} (${x.newCount || 0} vs ${x.oldCount || 0})`
        )
        .join(', ');

    if (E.aiEmergingStable) {
      E.aiEmergingStable.innerHTML = `
        <li><strong>Emerging:</strong> ${
          emerging.length ? fmtList(emerging) : '—'
        }</li>
        <li><strong>Stable:</strong> ${
          stable.length ? fmtList(stable) : '—'
        }</li>
        <li><strong>Cooling:</strong> ${
          cooling.length ? fmtList(cooling) : '—'
        }</li>`;
    }

    // Ops cockpit (6.1)
    const bullets = [];

    // Reporting exports/filters
    const reportingHigh = list.filter(r => {
      const meta = DataStore.computed.get(r.id) || {};
      const cat = meta.domainCategory || '';
      const risk = meta.risk?.total || 0;
      const st = (r.status || '').toLowerCase();
      const open = !(st.startsWith('resolved') || st.startsWith('rejected'));
      return (
        open &&
        risk >= 7 &&
        (cat.includes('reporting – filters') || cat.includes('exports & data format'))
      );
    });
    if (reportingHigh.length >= 3) {
      bullets.push(
        `Reporting is highest-risk – ${reportingHigh.length} open high-risk bugs around filters, navigation and export/data format.`
      );
    }

    // Data integrity
    const dataLossIssues = list.filter(r => {
      const txt = [r.title, r.desc, r.log]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        txt.includes('historical data') ||
        txt.includes('historical log') ||
        txt.includes('journal entries') ||
        txt.includes('completion %') ||
        txt.includes('wrong %') ||
        txt.includes('being deleted')
      );
    });
    if (dataLossIssues.length >= 3) {
      bullets.push(
        `Data integrity: ${dataLossIssues.length} issues mention historical data, journal entries or wrong completion %, review audit readiness.`
      );
    }

    // Mobile App + geofencing/app reports
    const mobileGeo = list.filter(r => {
      const meta = DataStore.computed.get(r.id) || {};
      const txt = [r.title, r.desc, r.log]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        (r.module || '').toLowerCase().includes('mobile') &&
        (txt.includes('app report') ||
          txt.includes('geofencing') ||
          txt.includes('geofacing') ||
          txt.includes('location permission'))
      );
    });
    if (mobileGeo.length >= 2) {
      bullets.push(
        `Mobile App: app report & geofencing – multiple issues around mobile reports and location permissions.`
      );
    }

    // Staging vs live drift
    const stagingDrift = list.filter(r => {
      const txt = [r.title, r.desc, r.log]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        txt.includes('staging vs live') ||
        txt.includes('staging vs production') ||
        txt.includes('on stage') ||
        txt.includes('tested on staging') ||
        txt.includes('before release was working') ||
        txt.includes('after new release')
      );
    });
    if (stagingDrift.length >= 2) {
      bullets.push(
        `Staging vs Live drift – ${stagingDrift.length} bugs explicitly mention staging/live differences or post-release regression.`
      );
    }

    if (!bullets.length) {
      bullets.push('No major ops alerts detected from current metrics.');
    }

    if (E.aiOpsCockpit) {
      E.aiOpsCockpit.innerHTML = bullets
        .map(b => `<li>${U.escapeHtml(b)}</li>`)
        .join('');
    }

    // Module insights table
    const modules = (() => {
      const map = new Map();
      list.forEach(r => {
        let m = map.get(r.module);
        if (!m) {
          m = {
            module: r.module,
            total: 0,
            open: 0,
            high: 0,
            risk: 0,
            tokens: new Map()
          };
          map.set(r.module, m);
        }
        m.total++;
        const st = (r.status || '').toLowerCase();
        const open = !st.startsWith('resolved') && !st.startsWith('rejected');
        if (open) {
          m.open++;
          if (['Urgent', 'High'].includes(r.priority)) m.high++;
        }
        const rs = DataStore.computed.get(r.id)?.risk?.total || 0;
        m.risk += rs;
        (DataStore.computed.get(r.id)?.tokens || new Set()).forEach(t =>
          m.tokens.set(t, (m.tokens.get(t) || 0) + 1)
        );
      });
      return Array.from(map.values())
        .map(m => {
          const tt = m.tokens.size
            ? Array.from(m.tokens.entries()).sort((a, b) => b[1] - a[1])[0][0]
            : '';
          return {
            module: m.module,
            open: m.open,
            high: m.high,
            risk: m.risk,
            topTerm: tt
          };
        })
        .sort((a, b) => b.risk - a.risk || b.open - a.open)
        .slice(0, 8);
    })();

    const maxModuleRisk = modules.reduce((max, m) => Math.max(max, m.risk), 0) || 1;

    if (E.aiModulesTableBody) {
      E.aiModulesTableBody.innerHTML = modules.length
        ? modules
            .map(m => {
              const ratio = m.risk / maxModuleRisk;
              return `
        <tr>
          <td>${U.escapeHtml(m.module)}</td>
          <td>${m.open}</td>
          <td>${m.high}</td>
          <td>
            ${m.risk}
            <div class="risk-bar-wrap"><div class="risk-bar" style="transform:scaleX(${ratio.toFixed(
              2
            )});"></div></div>
          </td>
          <td>${U.escapeHtml(m.topTerm || '-')}</td>
        </tr>`;
            })
            .join('')
        : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No modules.</td></tr>';
    }

    // Top risks (recent)
    const topRisks = recent
      .map(r => ({ r, score: DataStore.computed.get(r.id)?.risk?.total || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .filter(x => x.score >= 6);
    if (E.aiRisksList) {
      E.aiRisksList.innerHTML = topRisks.length
        ? topRisks
            .map(({ r, score }) => {
              const badgeClass = CalendarLink.riskBadgeClass(score);
              const meta = DataStore.computed.get(r.id)?.risk || {};
              return `
        <li style="margin-bottom:4px;">
          <strong>[${U.escapeHtml(r.priority || '-')} ] ${U.escapeHtml(
          r.id || ''
        )}</strong>
          <span class="event-risk-badge ${badgeClass}">RISK ${score}</span>
          <span class="muted"> · sev ${meta.severity ?? 0} · imp ${
          meta.impact ?? 0
        } · urg ${meta.urgency ?? 0}</span>
          <br><span class="muted">Status ${U.escapeHtml(r.status || '-')}</span>
          <br>${U.escapeHtml(r.title || '')}
        </li>`;
            })
            .join('')
        : '<li>No high-risk recent issues.</li>';
    }

    // Clusters (5 + regression badge)
    const clusters = buildClustersWeighted(list);
    if (E.aiClusters) {
      E.aiClusters.innerHTML = clusters.length
        ? clusters
            .map(c => {
              const regression =
                c.issues.filter(i => isRegressionIssue(i.id)).length > 0;
              return `
      <div class="card" style="padding:10px;">
        <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">
          Pattern: <strong>${U.escapeHtml(
            c.signature || '(no pattern)'
          )}</strong> • ${c.issues.length} issues
          ${
            regression
              ? '<span class="pill regression-pill">Regression</span>'
              : ''
          }
        </div>
        <ul style="margin:0;padding-left:18px;font-size:13px;">
          ${c.issues
            .slice(0, 5)
            .map(
              i => `
            <li>
              <button class="btn sm" style="padding:3px 6px;margin-right:4px;" data-open="${U.escapeAttr(
                i.id
              )}">${U.escapeHtml(i.id)}</button>
              ${U.escapeHtml(i.title || '')}
            </li>`
            )
            .join('')}
          ${
            c.issues.length > 5
              ? `<li class="muted">+ ${c.issues.length - 5} more…</li>`
              : ''
          }
        </ul>
        ${
          regression
            ? '<div class="muted" style="font-size:11px;margin-top:4px;">Signal: recurring pattern with older resolved and newer open tickets.</div>'
            : ''
        }
      </div>`;
            })
            .join('')
        : '<div class="muted">No similar issue groups ≥2.</div>';
    }

    // Triage queue (4.2)
    const tri = list
      .filter(r => {
        const meta = DataStore.computed.get(r.id) || {};
        const risk = meta.risk?.total || 0;
        const st = (r.status || '').toLowerCase();
        const isClosed = st.startsWith('resolved') || st.startsWith('rejected');
        if (isClosed) return false;
        if (risk < 7) return false;

        const text = [r.title, r.desc, r.log]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const severeKeyword =
          text.includes('data being deleted') ||
          text.includes('historical data') ||
          text.includes('checklists not appearing') ||
          text.includes('checklist not appearing') ||
          text.includes('internal server error') ||
          text.includes('not appearing on app') ||
          text.includes('not showing on app');

        const stStuck =
          (st.startsWith('on hold') || st.startsWith('on stage') || st.startsWith(
            'tested on staging'
          )) && r.date;

        let stuckTooLong = false;
        if (stStuck) {
          const d = new Date(r.date);
          if (!isNaN(d)) {
            const ageDays = (Date.now() - d.getTime()) / 86400000;
            if (ageDays >= 7) stuckTooLong = true;
          }
        }

        const inRegression = isRegressionIssue(r.id);

        const priorityProblem =
          (!r.priority || r.priority === 'Low') && severeKeyword;

        return priorityProblem || stuckTooLong || inRegression;
      })
      .sort(
        (a, b) =>
          (DataStore.computed.get(b.id)?.risk?.total || 0) -
          (DataStore.computed.get(a.id)?.risk?.total || 0)
      )
      .slice(0, 20);

    if (E.aiTriageList) {
      E.aiTriageList.innerHTML = tri.length
        ? tri
            .map(i => {
              const meta = DataStore.computed.get(i.id) || {};
              const risk = meta.risk?.total || 0;
              const cat = meta.domainCategory || '—';
              const reasons = [];

              if (!i.priority || i.priority === 'Low') {
                reasons.push('priority too low vs content');
              }
              const st = (i.status || '').toLowerCase();
              if (
                (st.startsWith('on hold') ||
                  st.startsWith('on stage') ||
                  st.startsWith('tested on staging')) &&
                i.date
              ) {
                const d = new Date(i.date);
                if (!isNaN(d)) {
                  const ageDays = (Date.now() - d.getTime()) / 86400000;
                  if (ageDays >= 7) reasons.push(`stuck in ${i.status} for ~${Math.round(
                    ageDays
                  )}d`);
                }
              }
              if (isRegressionIssue(i.id)) reasons.push('regression cluster');

              return `<li style="margin-bottom:6px;">
        <strong>${U.escapeHtml(i.id)}</strong> – ${U.escapeHtml(i.title || '')}
        <div class="muted">Risk ${risk} · ${U.escapeHtml(
                i.module || ''
              )} · ${U.escapeHtml(i.priority || '-')} · ${U.escapeHtml(
                cat
              )}</div>
        <div class="muted">Reason: ${U.escapeHtml(
          reasons.join(' + ') || 'high risk / important'
        )}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn sm" data-open="${U.escapeAttr(i.id)}">Open</button>
        </div>
      </li>`;
            })
            .join('')
        : '<li>No issues requiring triage.</li>';
    }

    // Upcoming risky events
    const evs = computeEventsRisk(DataStore.rows, DataStore.events);
    if (E.aiEventsList) {
      E.aiEventsList.innerHTML = evs.length
        ? evs
            .map(r => {
              const badge = CalendarLink.riskBadgeClass(r.risk);
              const ev = r.event;
              return `<li style="margin-bottom:6px;">
        <strong>${U.escapeHtml(ev.title || '(no title)')}</strong>
        <span class="event-risk-badge ${badge}">RISK ${r.risk}</span>
        <div class="muted">${U.fmtTS(r.date)} · Env: ${U.escapeHtml(
          ev.env || 'Prod'
        )} · Modules: ${
                r.modules.length
                  ? r.modules.map(U.escapeHtml).join(', ')
                  : 'n/a'
              } · Related issues: ${r.issues.length}</div>
      </li>`;
            })
            .join('')
        : '<li>No notable risk in next 7 days.</li>';
    }

    // Wire AI buttons
    U.qAll('[data-open]').forEach(b =>
      b.addEventListener('click', () =>
        UI.Modals.openIssue(b.getAttribute('data-open'))
      )
    );

    UI.setAnalyzing(false);
  }
};

/** Modals */
UI.Modals = {
  selectedIssue: null,
  lastFocus: null,
  lastEventFocus: null,
  openIssue(id) {
    const r = DataStore.byId.get(id);
    if (!r || !E.issueModal) return;
    this.selectedIssue = r;
    this.lastFocus = document.activeElement;
    const meta = DataStore.computed.get(r.id) || {};
    const risk = meta.risk || {
      technical: 0,
      business: 0,
      operational: 0,
      time: 0,
      total: 0,
      severity: 0,
      impact: 0,
      urgency: 0,
      reasons: []
    };
    const reasons = risk.reasons?.length
      ? 'Reasons: ' + risk.reasons.join(', ')
      : '—';

    const linkedReleases = DataStore.events.filter(ev => {
      const ids = (ev.issueId || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      return ids.includes(r.id);
    });
    let linkedSection = '';
    if (linkedReleases.length) {
      const items = linkedReleases
        .slice()
        .sort((a, b) => new Date(a.start) - new Date(b.start))
        .map(ev => {
          const when = ev.start ? U.fmtTS(ev.start) : '(no date)';
          return `<li>${U.escapeHtml(ev.title || '(release)')} – ${U.escapeHtml(
            when
          )} · ${U.escapeHtml(ev.env || 'Prod')}</li>`;
        })
        .join('');
      linkedSection = `
        <p><b>Linked releases:</b>
          <ul style="margin:4px 0 0 18px;padding:0;font-size:13px;">
            ${items}
          </ul>
        </p>`;
    }

    E.modalTitle.textContent = r.title || r.id || 'Issue';
    E.modalBody.innerHTML =
      `<p><b>ID:</b> ${U.escapeHtml(r.id || '-')}</p>` +
      `<p><b>Module:</b> ${U.escapeHtml(r.module || '-')}</p>` +
      `<p><b>Priority:</b> ${U.escapeHtml(r.priority || '-')}</p>` +
      `<p><b>Status:</b> ${U.escapeHtml(r.status || '-')}</p>` +
      `<p><b>Type:</b> ${U.escapeHtml(r.type || '-')}</p>` +
      `<p><b>Date:</b> ${U.escapeHtml(r.date || '-')}</p>` +
      `<p><b>Risk:</b> ${risk.total}` +
      `<br><span class="muted">Severity ${risk.severity}, Impact ${risk.impact}, Urgency ${risk.urgency}</span>` +
      `<br><span class="muted">${U.escapeHtml(reasons)}</span>` +
      `</p>` +
      `<p><b>Description:</b><br>${U.escapeHtml(r.desc || '-')}</p>` +
      `<p><b>Log:</b><br>${U.escapeHtml(r.log || '-')}</p>` +
      (r.file
        ? `<p><b>Attachment:</b> <a href="${U.escapeAttr(
            r.file
          )}" target="_blank" rel="noopener noreferrer">Open link</a></p>`
        : '') +
      `<div style="margin-top:10px" class="muted">
        Suggested: priority <b>${U.escapeHtml(
          meta.suggestions?.priority || '-'
        )}</b>;
        categories: ${
          (meta.suggestions?.categories || [])
            .slice(0, 3)
            .map(c => U.escapeHtml(c.label))
            .join(', ') || '—'
        }.
      </div>` +
      linkedSection;

    E.issueModal.style.display = 'flex';
    if (E.copyId) E.copyId.focus();
  },
  closeIssue() {
    if (!E.issueModal) return;
    E.issueModal.style.display = 'none';
    this.selectedIssue = null;
    if (this.lastFocus?.focus) this.lastFocus.focus();
  },
  openEvent(ev) {
    this.lastEventFocus = document.activeElement;
    const isEdit = !!(ev && ev.id);
    if (E.eventForm) E.eventForm.dataset.id = isEdit ? ev.id : '';
    if (E.eventModalTitle)
      E.eventModalTitle.textContent = isEdit ? 'Edit Event' : 'Add Event';
    if (E.eventDelete) E.eventDelete.style.display = isEdit ? 'inline-flex' : 'none';

    const allDay = !!ev.allDay;
    if (E.eventAllDay) E.eventAllDay.checked = allDay;

    if (E.eventTitle) E.eventTitle.value = ev.title || '';
    if (E.eventType) E.eventType.value = ev.type || 'Deployment';
    if (E.eventEnv) E.eventEnv.value = ev.env || 'Prod';
    if (E.eventStatus) E.eventStatus.value = ev.status || 'Planned';
    if (E.eventOwner) E.eventOwner.value = ev.owner || '';
    if (E.eventModules) {
      const val = Array.isArray(ev.modules)
        ? ev.modules.join(', ')
        : ev.modules || '';
      E.eventModules.value = val;
    }
    if (E.eventImpactType)
      E.eventImpactType.value = ev.impactType || 'No downtime expected';
    if (E.eventIssueId) E.eventIssueId.value = ev.issueId || '';

    if (E.eventStart) {
      E.eventStart.type = allDay ? 'date' : 'datetime-local';
      E.eventStart.value = ev.start
        ? allDay
          ? toLocalDateValue(ev.start)
          : toLocalInputValue(ev.start)
        : '';
    }
    if (E.eventEnd) {
      E.eventEnd.type = allDay ? 'date' : 'datetime-local';
      E.eventEnd.value = ev.end
        ? allDay
          ? toLocalDateValue(ev.end)
          : toLocalInputValue(ev.end)
        : '';
    }
    if (E.eventDescription) E.eventDescription.value = ev.description || '';

    if (E.eventIssueLinkedInfo) {
      const issueIdStr = ev.issueId || '';
      if (issueIdStr) {
        const ids = issueIdStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const uniqueIds = Array.from(new Set(ids));
        const issues = uniqueIds
          .map(id => DataStore.byId.get(id))
          .filter(Boolean);

        E.eventIssueLinkedInfo.style.display = 'block';

        if (issues.length) {
          const items = issues
            .slice(0, 3)
            .map(issue => {
              const meta = DataStore.computed.get(issue.id) || {};
              const r = meta.risk?.total || 0;
              const badgeClass = r ? CalendarLink.riskBadgeClass(r) : '';
              return `
                <li>
                  <button type="button" class="btn sm" data-open-issue="${U.escapeAttr(
                    issue.id
                  )}">${U.escapeHtml(issue.id)}</button>
                  ${U.escapeHtml(issue.title || '')}
                  ${
                    r
                      ? `<span class="event-risk-badge ${badgeClass}">RISK ${r}</span>`
                      : ''
                  }
                </li>`;
            })
            .join('');

          const extra = uniqueIds.length - issues.length;
          const extraHtml =
            extra > 0
              ? `<li class="muted">${extra} linked ID(s) not in current dataset</li>`
              : '';

          const more =
            uniqueIds.length > issues.length
              ? uniqueIds
                  .filter(id => !issues.find(i => i.id === id))
                  .join(', ')
              : '';

          E.eventIssueLinkedInfo.innerHTML = `
            Linked ticket(s):
            <ul style="margin:4px 0 0 18px;padding:0;font-size:12px;">
              ${items}
              ${extraHtml}
            </ul>
            ${
              more
                ? `<div class="muted" style="margin-top:4px;">Missing from dataset: ${U.escapeHtml(
                    more
                  )}</div>`
                : ''
            }`;
        } else {
          E.eventIssueLinkedInfo.innerHTML = `Linked ticket ID(s): ${U.escapeHtml(
            issueIdStr
          )} (not found in current dataset)`;
        }

        E.eventIssueLinkedInfo
          .querySelectorAll('[data-open-issue]')
          .forEach(btn => {
            btn.addEventListener('click', () => {
              const id = btn.getAttribute('data-open-issue');
              UI.Modals.openIssue(id);
            });
          });
      } else {
        E.eventIssueLinkedInfo.style.display = 'none';
        E.eventIssueLinkedInfo.textContent = '';
      }
    }

    if (E.eventModal) {
      E.eventModal.style.display = 'flex';
      if (E.eventTitle) E.eventTitle.focus();
    }
  },
  closeEvent() {
    if (!E.eventModal) return;
    E.eventModal.style.display = 'none';
    if (E.eventForm) E.eventForm.dataset.id = '';
    if (this.lastEventFocus?.focus) this.lastEventFocus.focus();
  }
};

function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function trapFocus(container, e) {
  const focusables = container.querySelectorAll(
    'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

function setActiveView(view) {
  const names = ['issues', 'calendar', 'insights'];
  names.forEach(name => {
    const tab =
      name === 'issues'
        ? E.issuesTab
        : name === 'calendar'
        ? E.calendarTab
        : E.insightsTab;
    const panel =
      name === 'issues'
        ? E.issuesView
        : name === 'calendar'
        ? E.calendarView
        : E.insightsView;
    const active = name === view;
    if (tab) {
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (panel) panel.classList.toggle('active', active);
  });
  try {
    localStorage.setItem(LS_KEYS.view, view);
  } catch {}
  if (view === 'calendar') {
    ensureCalendar();
    renderCalendarEvents();
  }
  if (view === 'insights') Analytics.refresh(UI.Issues.applyFilters());
}

/* ---------- Calendar wiring ---------- */
let calendar = null;
let calendarReady = false;

function wireCalendar() {
  if (E.addEventBtn)
    E.addEventBtn.addEventListener('click', () => {
      const now = new Date();
      UI.Modals.openEvent({
        start: now,
        end: new Date(now.getTime() + 60 * 60 * 1000),
        allDay: false,
        env: 'Prod',
        status: 'Planned'
      });
    });

  [E.eventFilterDeployment, E.eventFilterMaintenance, E.eventFilterRelease, E.eventFilterOther].forEach(
    input => {
      if (input) input.addEventListener('change', renderCalendarEvents);
    }
  );

  if (E.calendarTz) {
    try {
      const tz =
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
      E.calendarTz.textContent = `Times shown in: ${tz}`;
    } catch {
      E.calendarTz.textContent = '';
    }
  }
}

function ensureCalendar() {
  if (calendarReady) return;
  const el = document.getElementById('calendar');
  if (!el || typeof FullCalendar === 'undefined') {
    UI.toast('Calendar library failed to load');
    return;
  }
  calendar = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    selectable: true,
    editable: true,
    height: 'auto',
    headerToolbar: {
      left: 'title',
      center: '',
      right: 'dayGridMonth,timeGridWeek,listWeek today prev,next'
    },
    select: info =>
      UI.Modals.openEvent({
        start: info.start,
        end: info.end,
        allDay: info.allDay,
        env: 'Prod',
        status: 'Planned'
      }),
    eventClick: info => {
      const ev =
        DataStore.events.find(e => e.id === info.event.id) || {
          id: info.event.id,
          title: info.event.title,
          type: info.event.extendedProps.type || 'Other',
          start: info.event.start,
          end: info.event.end,
          description: info.event.extendedProps.description || '',
          issueId: info.event.extendedProps.issueId || '',
          allDay: info.event.allDay,
          env: info.event.extendedProps.env || 'Prod',
          status: info.event.extendedProps.status || 'Planned',
          owner: info.event.extendedProps.owner || '',
          modules: info.event.extendedProps.modules || [],
          impactType: info.event.extendedProps.impactType || 'No downtime expected',
          notificationStatus: info.event.extendedProps.notificationStatus || ''
        };
      UI.Modals.openEvent(ev);
    },
    eventDrop: async info => {
      const ev = DataStore.events.find(e => e.id === info.event.id);
      if (!ev) {
        info.revert();
        return;
      }
      const updated = {
        ...ev,
        start: info.event.start,
        end: info.event.end,
        allDay: info.event.allDay
      };
      const saved = await saveEventToSheet(updated);
      if (!saved) {
        info.revert();
        return;
      }
      const idx = DataStore.events.findIndex(e => e.id === saved.id);
      if (idx > -1) DataStore.events[idx] = saved;
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
    },
    eventDidMount(info) {
      const ext = info.event.extendedProps || {};
      const riskSum = ext.risk || 0;
      if (riskSum) {
        const span = document.createElement('span');
        span.className = 'event-risk-badge ' + CalendarLink.riskBadgeClass(riskSum);
        span.textContent = `RISK ${riskSum}`;
        const titleEl = info.el.querySelector('.fc-event-title');
        if (titleEl) titleEl.appendChild(span);
      }

      const env = ext.env || 'Prod';
      const status = ext.status || 'Planned';

      let tooltip = ext.description || '';
      if (ext.issueId) {
        const idStr = ext.issueId;
        const ids = idStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const issues = ids
          .map(id => DataStore.byId.get(id))
          .filter(Boolean);
        if (issues.length) {
          const first = issues[0];
          const meta = DataStore.computed.get(first.id) || {};
          const r = meta.risk?.total || 0;
          tooltip =
            `${first.id} – ${first.title || ''}\nStatus: ${
              first.status || '-'
            } · Priority: ${first.priority || '-'} · Risk: ${r}` +
            (issues.length > 1
              ? `\n+ ${issues.length - 1} more linked ticket(s)`
              : '') +
            (tooltip ? `\n\n${tooltip}` : '');
        } else {
          tooltip =
            `Linked ticket(s): ${idStr}` + (tooltip ? `\n\n${tooltip}` : '');
        }
      }

      tooltip += `\nEnvironment: ${env} · Change status: ${status}`;
      if (ext.collision || ext.freeze || ext.hotIssues) {
        tooltip += `\n⚠️ Change risk signals:`;
        if (ext.collision) tooltip += ` overlaps with other change(s)`;
        if (ext.freeze) tooltip += ` · in freeze window`;
        if (ext.hotIssues) tooltip += ` · high-risk open issues`;
      }

      if (tooltip.trim()) info.el.setAttribute('title', tooltip);
    }
  });
  calendarReady = true;
  renderCalendarEvents();
  calendar.render();
}

function renderCalendarEvents() {
  if (!calendar) return;
  const activeTypes = new Set();
  if (E.eventFilterDeployment && E.eventFilterDeployment.checked)
    activeTypes.add('Deployment');
  if (E.eventFilterMaintenance && E.eventFilterMaintenance.checked)
    activeTypes.add('Maintenance');
  if (E.eventFilterRelease && E.eventFilterRelease.checked)
    activeTypes.add('Release');
  if (E.eventFilterOther && E.eventFilterOther.checked)
    activeTypes.add('Other');

  const links = computeEventsRisk(DataStore.rows, DataStore.events);
  const riskMap = new Map(links.map(r => [r.event.id, r.risk]));
  const { flagsById } = computeChangeCollisions(DataStore.rows, DataStore.events);

  calendar.removeAllEvents();
  DataStore.events.forEach(ev => {
    const type = ev.type || 'Other';
    if (activeTypes.size && !activeTypes.has(type)) return;
    const risk = riskMap.get(ev.id) || 0;

    const env = ev.env || 'Prod';
    const status = ev.status || 'Planned';
    const owner = ev.owner || '';
    const modules = Array.isArray(ev.modules)
      ? ev.modules
      : typeof ev.modules === 'string'
      ? ev.modules
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    const impactType = ev.impactType || '';

    const flags = flagsById.get(ev.id) || {};
    const classNames = [
      'event-type-' + type.toLowerCase().replace(/\s+/g, '-'),
      'event-env-' + env.toLowerCase()
    ];
    if (flags.collision) classNames.push('event-collision');
    if (flags.freeze) classNames.push('event-freeze');
    if (flags.hotIssues) classNames.push('event-hot');

    calendar.addEvent({
      id: ev.id,
      title: ev.title,
      start: ev.start,
      end: ev.end || null,
      allDay: !!ev.allDay,
      extendedProps: {
        type,
        description: ev.description,
        issueId: ev.issueId || '',
        risk,
        env,
        status,
        owner,
        modules,
        impactType,
        notificationStatus: ev.notificationStatus || '',
        collision: !!flags.collision,
        freeze: !!flags.freeze,
        hotIssues: !!flags.hotIssues
      },
      classNames
    });
  });
}

/* ---------- Networking & data loading ---------- */
async function safeFetchText(url, opts = {}) {
  const res = await fetch(url, { cache: 'no-store', ...opts });
  if (!res.ok)
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

function loadEventsCache() {
  try {
    const raw = localStorage.getItem(LS_KEYS.events);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
function saveEventsCache() {
  try {
    localStorage.setItem(LS_KEYS.events, JSON.stringify(DataStore.events || []));
  } catch {}
}

async function loadIssues(force = false) {
  if (!force && !DataStore.rows.length) {
    const cached = IssuesCache.load();
    if (cached && cached.length) {
      DataStore.hydrateFromRows(cached);
      UI.Issues.renderFilters();
      setIfOptionExists(E.moduleFilter, Filters.state.module);
      setIfOptionExists(E.priorityFilter, Filters.state.priority);
      setIfOptionExists(E.statusFilter, Filters.state.status);
      UI.skeleton(false);
      UI.refreshAll();
    }
  }

  try {
    UI.spinner(true);
    UI.skeleton(true);
    const text = await safeFetchText(CONFIG.SHEET_URL);
    DataStore.hydrate(text);
    IssuesCache.save(DataStore.rows);
    UI.Issues.renderFilters();
    setIfOptionExists(E.moduleFilter, Filters.state.module);
    setIfOptionExists(E.priorityFilter, Filters.state.priority);
    setIfOptionExists(E.statusFilter, Filters.state.status);
    UI.refreshAll();
    UI.setSync('issues', true, new Date());
  } catch (e) {
    if (!DataStore.rows.length && E.issuesTbody) {
      E.issuesTbody.innerHTML = `
        <tr>
          <td colspan="8" style="color:#ffb4b4;text-align:center">
            Error loading data and no cached data found.
            <button type="button" id="retryLoad" class="btn sm" style="margin-left:8px">Retry</button>
          </td>
        </tr>`;
      const retryBtn = document.getElementById('retryLoad');
      if (retryBtn) retryBtn.addEventListener('click', () => loadIssues(true));
    }
    UI.toast('Error loading issues: ' + e.message);
    UI.setSync('issues', !!DataStore.rows.length, null);
  } finally {
    UI.spinner(false);
    UI.skeleton(false);
  }
}

async function loadEvents(force = false) {
  const cached = loadEventsCache();
  if (cached && cached.length && !force) {
    DataStore.events = cached;
    ensureCalendar();
    renderCalendarEvents();
    refreshPlannerReleasePlans();
    Analytics.refresh(UI.Issues.applyFilters());
    UI.setSync('events', true, new Date());
  }

  if (!CONFIG.CALENDAR_API_URL) return;

  try {
    UI.spinner(true);
    const res = await fetch(CONFIG.CALENDAR_API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Events API failed: ${res.status}`);
    const data = await res.json().catch(() => ({}));
    const events = Array.isArray(data.events) ? data.events : [];

    const normalized = events.map(ev => {
      const modulesArr = Array.isArray(ev.modules)
        ? ev.modules
        : typeof ev.modules === 'string'
        ? ev.modules
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [];
      return {
        id:
          ev.id ||
          'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        title: ev.title || '',
        type: ev.type || 'Other',
        start: ev.start || ev.startDate || '',
        end: ev.end || ev.endDate || '',
        allDay: !!ev.allDay,
        description: ev.description || '',
        issueId: ev.issueId || '',
        env: ev.env || ev.environment || 'Prod',
        status: ev.status || 'Planned',
        owner: ev.owner || '',
        modules: modulesArr,
        impactType: ev.impactType || ev.impact || 'No downtime expected',
        notificationStatus: ev.notificationStatus || ''
      };
    });

    DataStore.events = normalized;
    saveEventsCache();
    ensureCalendar();
    renderCalendarEvents();
    refreshPlannerReleasePlans();
    Analytics.refresh(UI.Issues.applyFilters());
    UI.setSync('events', true, new Date());
  } catch (e) {
    DataStore.events = cached || [];
    ensureCalendar();
    renderCalendarEvents();
    refreshPlannerReleasePlans();
    UI.setSync('events', !!DataStore.events.length, null);
    UI.toast(
      DataStore.events.length
        ? 'Using cached events (API error)'
        : 'Unable to load calendar events'
    );
  } finally {
    UI.spinner(false);
  }
}

/* ---------- Save/Delete to Apps Script ---------- */
async function saveEventToSheet(event) {
  UI.spinner(true);
  try {
    const evId =
      event.id && String(event.id).trim()
        ? String(event.id).trim()
        : 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const modulesArr = Array.isArray(event.modules)
      ? event.modules
      : typeof event.modules === 'string'
      ? event.modules
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    const payload = {
      id: evId,
      title: event.title || '',
      type: event.type || 'Deployment',

      env: event.env || event.environment || 'Prod',
      status: event.status || 'Planned',
      owner: event.owner || '',
      modules: modulesArr,
      impactType: event.impactType || event.impact || 'No downtime expected',
      issueId: event.issueId || '',

      start: event.start || '',
      end: event.end || '',
      description: event.description || '',

      notificationStatus: event.notificationStatus || '',
      allDay: !!event.allDay
    };

    const res = await fetch(CONFIG.CALENDAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', event: payload })
    });

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      console.error('Invalid JSON from calendar backend', jsonErr);
      const text = await res.text();
      console.error('Raw response:', text);
      UI.toast('Calendar: invalid JSON from backend, using local event');
      return payload;
    }

    if (data.ok) {
      UI.toast('Event saved');
      const savedEvent = data.event || payload;
      if (!savedEvent.notificationStatus && payload.notificationStatus) {
        savedEvent.notificationStatus = payload.notificationStatus;
      }
      return savedEvent;
    } else {
      UI.toast('Error saving event: ' + (data.error || 'Unknown error'));
      return null;
    }
  } catch (e) {
    UI.toast('Network error saving event: ' + e.message);
    return null;
  } finally {
    UI.spinner(false);
  }
}

async function deleteEventFromSheet(id) {
  UI.spinner(true);
  try {
    const res = await fetch(CONFIG.CALENDAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', event: { id } })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Delete failed');
    UI.toast('Event deleted');
    return true;
  } catch (e) {
    UI.toast('Error deleting event: ' + e.message);
    return false;
  } finally {
    UI.spinner(false);
  }
}

/* ---------- CSV export ---------- */
function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportIssuesToCsv(rows, suffix) {
  if (!rows.length) return UI.toast('Nothing to export (no rows).');
  const headers = [
    'ID',
    'Module',
    'Title',
    'Description',
    'Priority',
    'Status',
    'Type',
    'Date',
    'Log',
    'Link',
    'RiskTotal',
    'RiskSeverity',
    'RiskImpact',
    'RiskUrgency'
  ];
  const lines = [headers.join(',')];
  rows.forEach(r => {
    const meta = DataStore.computed.get(r.id) || {};
    const risk = meta.risk || {};
    const arr = [
      r.id,
      r.module,
      r.title,
      r.desc,
      r.priority,
      r.status,
      r.type,
      r.date,
      r.log,
      r.file,
      risk.total ?? '',
      risk.severity ?? '',
      risk.impact ?? '',
      risk.urgency ?? ''
    ].map(csvEscape);
    lines.push(arr.join(','));
  });
  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `incheck_issues_${suffix || 'filtered'}_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  UI.toast('Exported CSV');
}

function exportFilteredCsv() {
  const rows = UI.Issues.applyFilters();
  exportIssuesToCsv(rows, 'filtered');
}

/* ---------- Release Planner wiring & rendering ---------- */

let LAST_PLANNER_CONTEXT = null;
let LAST_PLANNER_RESULT = null;
let LAST_AI_QUERY_RESULT = null;

function renderPlannerResults(result, context) {
  if (!E.plannerResults) return;
  const { slots, bug, bomb, ticketContext } = result;
  const { env, modules, releaseType, horizonDays, region } = context;

  if (!slots.length) {
    E.plannerResults.innerHTML =
      '<span>No suitable windows found in the selected horizon. Try widening the horizon or targeting fewer modules.</span>';
    if (E.plannerAddEvent) E.plannerAddEvent.disabled = true;
    return;
  }

  const regionLabel =
    region === 'gulf'
      ? 'Gulf (KSA / UAE / Qatar)'
      : region === 'levant'
      ? 'Levant'
      : 'North Africa';

  const modulesLabel = modules && modules.length ? modules.join(', ') : 'All modules';
  const bugLabel = ReleasePlanner.bugLabel(bug.risk);
  const bombLabel = ReleasePlanner.bombLabel(bomb.risk);

  const ticketIssues = (ticketContext && ticketContext.issues) || [];
  const ticketsCount = ticketIssues.length;
  const maxTicketRisk = ticketContext?.maxRisk || 0;
  const avgTicketRisk = ticketContext?.avgRisk || 0;
  const ticketsLine = ticketsCount
    ? `Tickets in scope: ${ticketsCount} issue(s), max risk ${maxTicketRisk.toFixed(
        1
      )}, avg risk ${avgTicketRisk.toFixed(1)}.`
    : 'No specific tickets selected – using module + description only.';

  const intro = `
    <div style="margin-bottom:6px;">
      Top ${slots.length} suggested windows for a <strong>${U.escapeHtml(
        releaseType
      )}</strong> release on <strong>${U.escapeHtml(
    env
  )}</strong> touching <strong>${U.escapeHtml(
    modulesLabel
  )}</strong><br/>
      Horizon: next ${horizonDays} day(s), region profile: ${U.escapeHtml(
  
        regionLabel
      )}<br/>
      Bug history: ${U.escapeHtml(bugLabel)}; Bomb-bug history: ${U.escapeHtml(
        bombLabel
      )}.<br/>
      ${U.escapeHtml(ticketsLine)}
    </div>
  `;

  const buildPlan = slot => {
    const when = U.fmtTS(slot.start);
    const bucket = ReleasePlanner.riskBucket(slot.totalRisk);
    const rushText = ReleasePlanner.rushLabel(slot.rushRisk);

    const mods = modules && modules.length ? modules.join(', ') : 'all relevant modules';

    return [
      `Proposed release window: ${when} (${regionLabel}, ${env})`,
      `Scope: ${releaseType} change touching ${mods}.`,
      `Overall risk: ${bucket.label} (${slot.totalRisk.toFixed(
        1
      )}/10) · safety ${slot.safetyScore.toFixed(1)}/10.`,
      `Service load: ${rushText} (rush index ${slot.rushRisk.toFixed(1)}/6).`,
      `Recent bug pressure: ${bugLabel} (${bug.risk.toFixed(1)}/6).`,
      `Historical bomb-bug risk: ${bombLabel} (${bomb.risk.toFixed(1)}/6).`,
      `Change calendar risk: ${slot.eventsRisk.toFixed(1)}/6 (nearby events: ${
        slot.eventCount || 0
      }${slot.holidayCount ? `, holidays: ${slot.holidayCount}` : ''}).`,
      ticketsLine
    ].join('\n');
  };

  const slotRows = slots
    .map((slot, idx) => {
      const bucket = ReleasePlanner.riskBucket(slot.totalRisk);
      const rushText = ReleasePlanner.rushLabel(slot.rushRisk);
      const dateLabel = U.fmtTS(slot.start);
      const details = [
        `safety ${slot.safetyScore.toFixed(1)}/10`,
        `rush ${slot.rushRisk.toFixed(1)}/6 (${rushText})`,
        `bug ${slot.bugRisk.toFixed(1)}/6`,
        `bomb ${slot.bombRisk.toFixed(1)}/6`,
        `calendar ${slot.eventsRisk.toFixed(1)}/6`,
        `nearby events: ${slot.eventCount || 0}${
          slot.holidayCount ? ` (holidays: ${slot.holidayCount})` : ''
        }`
      ].join(' · ');

      return `
        <div class="planner-slot ${bucket.className}">
          <div class="planner-slot-header">
            <div class="planner-slot-title">
              <strong>${U.escapeHtml(dateLabel)}</strong>
              <span class="planner-slot-badge">Risk ${bucket.label} (${slot.totalRisk.toFixed(
        1
      )}/10)</span>
            </div>
            <div class="planner-slot-cta">
              <button type="button" class="btn sm" data-planner-slot="${idx}">
                Use this slot
              </button>
            </div>
          </div>
          <div class="planner-slot-meta">
            ${U.escapeHtml(details)}
          </div>
        </div>
      `;
    })
    .join('');

  E.plannerResults.innerHTML = intro + slotRows;

  // Default to first slot in the plan text
  const firstSlot = slots[0];
  if (E.plannerReleasePlan) {
    E.plannerReleasePlan.value = buildPlan(firstSlot);
    E.plannerReleasePlan.dataset.slotIndex = '0';
  }

  if (E.plannerAddEvent) {
    E.plannerAddEvent.disabled = false;
  }

  // Wire “Use this slot” buttons
  E.plannerResults
    .querySelectorAll('[data-planner-slot]')
    .forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.getAttribute('data-planner-slot');
        if (Number.isNaN(idx) || !slots[idx]) return;
        if (E.plannerReleasePlan) {
          E.plannerReleasePlan.value = buildPlan(slots[idx]);
          E.plannerReleasePlan.dataset.slotIndex = String(idx);
        }
      });
    });
}

function refreshPlannerReleasePlans() {
  if (!LAST_PLANNER_CONTEXT || !LAST_PLANNER_RESULT) return;
  // Recompute slots against latest events/issues (calendar risk may have changed)
  const ctx = LAST_PLANNER_CONTEXT;
  const res = ReleasePlanner.suggestSlots({
    region: ctx.region,
    env: ctx.env,
    modules: ctx.modules,
    horizonDays: ctx.horizonDays,
    releaseType: ctx.releaseType,
    description: ctx.description,
    slotsPerDay: ctx.slotsPerDay,
    tickets: ctx.tickets
  });
  LAST_PLANNER_RESULT = res;
  renderPlannerResults(res, ctx);
}

/* ---------- AI query / DSL wiring ---------- */

function runAiQuery() {
  if (!E.aiQueryInput || !E.aiQueryResults) return;
  const text = (E.aiQueryInput.value || '').trim();
  if (!text) {
    E.aiQueryResults.innerHTML =
      '<div class="muted">Enter a query (e.g. <code>module:checklist risk>=7 last:14d bug</code>).</div>';
    LAST_AI_QUERY_RESULT = null;
    return;
  }

  const parsed = DSL.parse(text);
  const matches = [];
  DataStore.rows.forEach(r => {
    const meta = DataStore.computed.get(r.id) || {};
    if (DSL.matches(r, meta, parsed)) {
      matches.push({ issue: r, meta });
    }
  });

  LAST_AI_QUERY_RESULT = { text, parsed, rows: matches.map(x => x.issue) };

  if (!matches.length) {
    E.aiQueryResults.innerHTML =
      '<div class="muted">No issues matched this query.</div>';
    return;
  }

  const top = matches
    .slice()
    .sort(
      (a, b) =>
        (b.meta.risk?.total || 0) - (a.meta.risk?.total || 0) ||
        (b.issue.date || '').localeCompare(a.issue.date || '')
    )
    .slice(0, 40);

  const rowsHtml = top
    .map(({ issue, meta }) => {
      const r = meta.risk || {};
      const badgeClass = CalendarLink.riskBadgeClass(r.total || 0);
      return `
        <tr>
          <td>
            <button type="button" class="btn sm" data-open="${U.escapeAttr(
              issue.id
            )}">${U.escapeHtml(issue.id)}</button>
          </td>
          <td>${U.escapeHtml(issue.module || '-')}</td>
          <td>${U.escapeHtml(issue.title || '')}</td>
          <td>${U.escapeHtml(issue.priority || '-')}</td>
          <td>${U.escapeHtml(issue.status || '-')}</td>
          <td>${U.escapeHtml(issue.date || '-')}</td>
          <td>
            <span class="event-risk-badge ${badgeClass}">R${r.total ?? 0}</span>
            <span class="muted">S${r.severity ?? 0}/I${r.impact ?? 0}/U${r.urgency ?? 0}</span>
          </td>
        </tr>
      `;
    })
    .join('');

  E.aiQueryResults.innerHTML = `
    <div class="muted" style="margin-bottom:4px;">
      ${matches.length} issue${matches.length === 1 ? '' : 's'} matched.
      Showing top ${top.length}.
    </div>
    <div class="table-wrap">
      <table class="tbl sm">
        <thead>
          <tr>
            <th>ID</th>
            <th>Module</th>
            <th>Title</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Date</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  // Wire open buttons
  E.aiQueryResults.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-open');
      if (id) UI.Modals.openIssue(id);
    });
  });
}

function wireAiQuery() {
  if (E.aiQueryRun) {
    E.aiQueryRun.addEventListener('click', runAiQuery);
  }
  if (E.aiQueryInput) {
    E.aiQueryInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runAiQuery();
      }
    });
  }
  if (E.aiQueryApplyFilters) {
    E.aiQueryApplyFilters.addEventListener('click', () => {
      if (!LAST_AI_QUERY_RESULT || !LAST_AI_QUERY_RESULT.parsed) {
        UI.toast('Run a query first.');
        return;
      }
      const q = LAST_AI_QUERY_RESULT.parsed;

      if (q.words && q.words.length) {
        Filters.state.search = q.words.join(' ');
        if (E.searchInput) E.searchInput.value = Filters.state.search;
      }
      if (q.module) {
        Filters.state.module = 'All';
        const modName = DataStore.rows.find(r =>
          (r.module || '').toLowerCase().includes(q.module)
        )?.module;
        if (modName) Filters.state.module = modName;
      }
      if (q.priority) {
        const p = q.priority[0].toUpperCase();
        const map = { U: 'Urgent', H: 'High', M: 'Medium', L: 'Low' };
        Filters.state.priority = map[p] || 'All';
      }
      if (q.status) {
        if (q.status === 'open' || q.status === 'closed') {
          // leave status as All; "open/closed" is derived state
          Filters.state.status = 'All';
        } else {
          const stName = DataStore.rows.find(r =>
            (r.status || '').toLowerCase().includes(q.status)
          )?.status;
          Filters.state.status = stName || 'All';
        }
      }

      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
      UI.toast('Applied query as grid filters.');
    });
  }
  if (E.aiQueryExport) {
    E.aiQueryExport.addEventListener('click', () => {
      if (!LAST_AI_QUERY_RESULT || !LAST_AI_QUERY_RESULT.rows?.length) {
        UI.toast('Nothing to export – run a query first.');
        return;
      }
      exportIssuesToCsv(LAST_AI_QUERY_RESULT.rows, 'aiquery');
    });
  }
}

/* ---------- Core refresh helpers ---------- */

UI.refreshAll = function () {
  const list = UI.Issues.applyFilters();
  UI.Issues.renderSummary(list);
  UI.Issues.renderKPIs(list);
  UI.Issues.renderTable(list);
  UI.Issues.renderCharts(list);
  UI.Issues.renderFilterChips();

  if (E.insightsView && E.insightsView.classList.contains('active')) {
    Analytics.refresh(list);
  }
};

/* ---------- Misc helpers ---------- */

function setIfOptionExists(selectEl, value) {
  if (!selectEl || !value) return;
  const opts = Array.from(selectEl.options || []).map(o => o.value);
  if (opts.includes(value)) selectEl.value = value;
}

function updateOnlineStatus() {
  if (!E.onlineStatusChip) return;
  const online = navigator.onLine;
  E.onlineStatusChip.textContent = online ? 'Online' : 'Offline';
  E.onlineStatusChip.classList.toggle('offline', !online);
}

/* ---------- Release Planner wiring ---------- */

function runPlanner() {
  if (!DataStore.rows.length) {
    UI.toast('Issues not loaded yet.');
    return;
  }
  const region = E.plannerRegion ? E.plannerRegion.value || 'gulf' : 'gulf';
  const env = E.plannerEnv ? E.plannerEnv.value || 'Prod' : 'Prod';
  const modules =
    E.plannerModules && E.plannerModules.value
      ? E.plannerModules.value
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
  const horizonDays = E.plannerHorizon
    ? Math.max(1, parseInt(E.plannerHorizon.value, 10) || 7)
    : 7;
  const releaseType = E.plannerReleaseType
    ? E.plannerReleaseType.value || 'feature'
    : 'feature';
  const description = E.plannerDescription
    ? E.plannerDescription.value || ''
    : '';
  const slotsPerDay = E.plannerSlotsPerDay
    ? Math.max(1, parseInt(E.plannerSlotsPerDay.value, 10) || 3)
    : 3;
  const tickets =
    E.plannerTickets && E.plannerTickets.value
      ? E.plannerTickets.value
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];

  const ctx = {
    region,
    env,
    modules,
    horizonDays,
    releaseType,
    description,
    slotsPerDay,
    tickets
  };

  const res = ReleasePlanner.suggestSlots({
    region,
    env,
    modules,
    horizonDays,
    releaseType,
    description,
    slotsPerDay,
    tickets
  });

  LAST_PLANNER_CONTEXT = ctx;
  LAST_PLANNER_RESULT = res;
  renderPlannerResults(res, ctx);
}

function wirePlanner() {
  if (E.plannerRun) {
    E.plannerRun.addEventListener('click', runPlanner);
  }
  if (E.plannerAddEvent) {
    E.plannerAddEvent.disabled = true;
    E.plannerAddEvent.addEventListener('click', () => {
      if (!LAST_PLANNER_RESULT || !LAST_PLANNER_RESULT.slots?.length) {
        UI.toast('No suggested slot – run the planner first.');
        return;
      }
      const idx =
        (E.plannerReleasePlan &&
          parseInt(E.plannerReleasePlan.dataset.slotIndex || '0', 10)) ||
        0;
      const slot =
        LAST_PLANNER_RESULT.slots[idx] || LAST_PLANNER_RESULT.slots[0];
      const env = E.plannerEnv ? E.plannerEnv.value || 'Prod' : 'Prod';
      const releaseType = E.plannerReleaseType
        ? E.plannerReleaseType.value || 'feature'
        : 'feature';
      const modules =
        E.plannerModules && E.plannerModules.value
          ? E.plannerModules.value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : [];

      const issueIdStr = E.plannerTickets ? E.plannerTickets.value || '' : '';
      const title = `${releaseType} release (${env})`;
      const description = E.plannerReleasePlan
        ? E.plannerReleasePlan.value || ''
        : '';

      UI.Modals.openEvent({
        id: '',
        title,
        type: 'Deployment',
        env,
        status: 'Planned',
        owner: '',
        modules,
        impactType: 'No downtime expected',
        issueId: issueIdStr,
        start: slot.start,
        end: slot.end,
        allDay: false,
        description
      });
    });
  }
  if (E.plannerAssignBtn) {
    E.plannerAssignBtn.addEventListener('click', async () => {
      if (!E.plannerReleasePlan || !E.plannerReleasePlan.value.trim()) {
        UI.toast('Nothing to copy – run the planner first.');
        return;
      }
      try {
        await navigator.clipboard.writeText(E.plannerReleasePlan.value);
        UI.toast('Release plan copied to clipboard.');
      } catch {
        UI.toast('Unable to copy – select the text manually.');
      }
    });
  }
}

/* ---------- Core UI wiring ---------- */

function wireCore() {
  // Filters
  if (E.searchInput) {
    E.searchInput.value = Filters.state.search || '';
    const onSearch = debounce(() => {
      Filters.state.search = E.searchInput.value || '';
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    }, 200);
    E.searchInput.addEventListener('input', onSearch);
  }

  ['module', 'priority', 'status'].forEach(key => {
    const el =
      key === 'module'
        ? E.moduleFilter
        : key === 'priority'
        ? E.priorityFilter
        : E.statusFilter;
    if (!el) return;
    el.addEventListener('change', () => {
      Filters.state[key] = el.value || 'All';
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  });

  if (E.startDateFilter) {
    E.startDateFilter.value = Filters.state.start || '';
    E.startDateFilter.addEventListener('change', () => {
      Filters.state.start = E.startDateFilter.value || '';
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.endDateFilter) {
    E.endDateFilter.value = Filters.state.end || '';
    E.endDateFilter.addEventListener('change', () => {
      Filters.state.end = E.endDateFilter.value || '';
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }

  if (E.resetBtn) {
    E.resetBtn.addEventListener('click', () => {
      Filters.state = {
        search: '',
        module: 'All',
        priority: 'All',
        status: 'All',
        start: '',
        end: ''
      };
      Filters.save();
      if (E.searchInput) E.searchInput.value = '';
      if (E.moduleFilter) E.moduleFilter.value = 'All';
      if (E.priorityFilter) E.priorityFilter.value = 'All';
      if (E.statusFilter) E.statusFilter.value = 'All';
      if (E.startDateFilter) E.startDateFilter.value = '';
      if (E.endDateFilter) E.endDateFilter.value = '';
      GridState.page = 1;
      UI.refreshAll();
    });
  }

  if (E.refreshNow) {
    E.refreshNow.addEventListener('click', () => {
      loadIssues(true);
      loadEvents(true);
    });
  }

  if (E.exportCsv) {
    E.exportCsv.addEventListener('click', exportFilteredCsv);
  }

  // Sorting
  U.qAll('#issuesTable thead th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (!key) return;
      if (GridState.sortKey === key) {
        GridState.sortAsc = !GridState.sortAsc;
      } else {
        GridState.sortKey = key;
        GridState.sortAsc = true;
      }
      GridState.page = 1;
      UI.refreshAll();
    });
  });

  // Pagination
  function setPage(newPage) {
    GridState.page = Math.max(1, newPage || 1);
    UI.refreshAll();
  }
  if (E.firstPage) E.firstPage.addEventListener('click', () => setPage(1));
  if (E.prevPage)
    E.prevPage.addEventListener('click', () => setPage(GridState.page - 1));
  if (E.nextPage)
    E.nextPage.addEventListener('click', () => setPage(GridState.page + 1));
  if (E.lastPage) {
    E.lastPage.addEventListener('click', () => {
      const total = UI.Issues.applyFilters().length;
      const pages = Math.max(1, Math.ceil(total / GridState.pageSize));
      setPage(pages);
    });
  }

  if (E.pageSize) {
    E.pageSize.value = String(GridState.pageSize);
    E.pageSize.addEventListener('change', () => {
      const n = parseInt(E.pageSize.value, 10) || 20;
      GridState.pageSize = Math.max(5, n);
      try {
        localStorage.setItem(LS_KEYS.pageSize, String(GridState.pageSize));
      } catch {}
      GridState.page = 1;
      UI.refreshAll();
    });
  }

  // Sidebar drawer
  if (E.drawerBtn && E.sidebar) {
    E.drawerBtn.addEventListener('click', () => {
      E.sidebar.classList.toggle('open');
    });
  }

  // Theme & accent
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
  }
  const savedTheme = (() => {
    try {
      return localStorage.getItem(LS_KEYS.theme);
    } catch {
      return null;
    }
  })();
  if (savedTheme) applyTheme(savedTheme);
  if (E.themeSelect) {
    if (savedTheme) E.themeSelect.value = savedTheme;
    E.themeSelect.addEventListener('change', () => {
      const theme = E.themeSelect.value || 'auto';
      applyTheme(theme);
      try {
        localStorage.setItem(LS_KEYS.theme, theme);
      } catch {}
    });
  }

  if (E.accentColor) {
    let savedAccent = null;
    try {
      savedAccent =
        localStorage.getItem(LS_KEYS.accentColor) ||
        localStorage.getItem(LS_KEYS.accentColorStorage);
    } catch {}
    if (savedAccent) {
      E.accentColor.value = savedAccent;
      document.documentElement.style.setProperty('--accent', savedAccent);
    }
    E.accentColor.addEventListener('input', () => {
      const val = E.accentColor.value;
      document.documentElement.style.setProperty('--accent', val);
      try {
        localStorage.setItem(LS_KEYS.accentColor, val);
        localStorage.setItem(LS_KEYS.accentColorStorage, val);
      } catch {}
    });
  }

  // Tab navigation
  if (E.issuesTab) {
    E.issuesTab.addEventListener('click', () => setActiveView('issues'));
  }
  if (E.calendarTab) {
    E.calendarTab.addEventListener('click', () => setActiveView('calendar'));
  }
  if (E.insightsTab) {
    E.insightsTab.addEventListener('click', () => setActiveView('insights'));
  }

  // Issue modal buttons
  if (E.copyId) {
    E.copyId.addEventListener('click', async () => {
      const r = UI.Modals.selectedIssue;
      if (!r || !r.id) return;
      try {
        await navigator.clipboard.writeText(r.id);
        UI.toast('Ticket ID copied.');
      } catch {
        UI.toast('Unable to copy ID.');
      }
    });
  }
  if (E.copyLink) {
    E.copyLink.addEventListener('click', async () => {
      const r = UI.Modals.selectedIssue;
      if (!r || !r.file) {
        UI.toast('No attachment link for this ticket.');
        return;
      }
      try {
        await navigator.clipboard.writeText(r.file);
        UI.toast('Attachment link copied.');
      } catch {
        UI.toast('Unable to copy link.');
      }
    });
  }
  if (E.modalClose) {
    E.modalClose.addEventListener('click', () => UI.Modals.closeIssue());
  }
  if (E.issueModal) {
    E.issueModal.addEventListener('click', e => {
      if (e.target === E.issueModal) UI.Modals.closeIssue();
    });
  }

  // Event modal buttons
  if (E.eventModalClose) {
    E.eventModalClose.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventCancel) {
    E.eventCancel.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventAllDay) {
    E.eventAllDay.addEventListener('change', () => {
      const allDay = E.eventAllDay.checked;
      const currentStart = E.eventStart?.value || '';
      const currentEnd = E.eventEnd?.value || '';

      if (E.eventStart) {
        E.eventStart.type = allDay ? 'date' : 'datetime-local';
        if (currentStart) {
          const d = new Date(currentStart);
          E.eventStart.value = allDay ? toLocalDateValue(d) : toLocalInputValue(d);
        }
      }
      if (E.eventEnd) {
        E.eventEnd.type = allDay ? 'date' : 'datetime-local';
        if (currentEnd) {
          const d = new Date(currentEnd);
          E.eventEnd.value = allDay ? toLocalDateValue(d) : toLocalInputValue(d);
        }
      }
    });
  }

  if (E.eventSave) {
    E.eventSave.addEventListener('click', async e => {
      e.preventDefault();
      if (!E.eventForm) return;

      const id = E.eventForm.dataset.id || '';
      const allDay = E.eventAllDay && E.eventAllDay.checked;
      const modules =
        E.eventModules && E.eventModules.value
          ? E.eventModules.value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          : [];

      const ev = {
        id,
        title: E.eventTitle?.value || '',
        type: E.eventType?.value || 'Deployment',
        env: E.eventEnv?.value || 'Prod',
        status: E.eventStatus?.value || 'Planned',
        owner: E.eventOwner?.value || '',
        modules,
        impactType: E.eventImpactType?.value || 'No downtime expected',
        issueId: E.eventIssueId?.value || '',
        start: E.eventStart?.value || '',
        end: E.eventEnd?.value || '',
        description: E.eventDescription?.value || '',
        allDay,
        notificationStatus: ''
      };

      // Convert date strings back to ISO if needed
      if (ev.start) {
        const d = new Date(ev.start);
        if (!isNaN(d)) ev.start = d.toISOString();
      }
      if (ev.end) {
        const d = new Date(ev.end);
        if (!isNaN(d)) ev.end = d.toISOString();
      }

      const saved = CONFIG.CALENDAR_API_URL
        ? await saveEventToSheet(ev)
        : { ...ev, id: ev.id || 'ev_' + Date.now() };

      if (!saved) return;

      const idxExisting = DataStore.events.findIndex(x => x.id === saved.id);
      if (idxExisting > -1) DataStore.events[idxExisting] = saved;
      else DataStore.events.push(saved);

      saveEventsCache();
      ensureCalendar();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
      UI.Modals.closeEvent();
    });
  }

  if (E.eventDelete) {
    E.eventDelete.addEventListener('click', async () => {
      if (!E.eventForm || !E.eventForm.dataset.id) {
        UI.Modals.closeEvent();
        return;
      }
      const id = E.eventForm.dataset.id;
      let ok = true;
      if (CONFIG.CALENDAR_API_URL) {
        ok = await deleteEventFromSheet(id);
      }
      if (!ok) return;
      const idx = DataStore.events.findIndex(e => e.id === id);
      if (idx > -1) DataStore.events.splice(idx, 1);
      saveEventsCache();
      ensureCalendar();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      UI.Modals.closeEvent();
    });
  }

  // Keyboard & focus management
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (E.issueModal && E.issueModal.style.display === 'flex') {
        UI.Modals.closeIssue();
      } else if (E.eventModal && E.eventModal.style.display === 'flex') {
        UI.Modals.closeEvent();
      }
    }
    if (e.key === 'Tab') {
      if (E.issueModal && E.issueModal.style.display === 'flex' && E.issueModal.contains(e.target)) {
        trapFocus(E.issueModal, e);
      }
      if (E.eventModal && E.eventModal.style.display === 'flex' && E.eventModal.contains(e.target)) {
        trapFocus(E.eventModal, e);
      }
    }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (E.shortcutsHelp) {
        E.shortcutsHelp.classList.toggle('visible');
      } else {
        UI.toast('Shortcuts: ? = this help, / = focus search, Esc = close modals.');
      }
    }
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (E.searchInput) {
        e.preventDefault();
        E.searchInput.focus();
        E.searchInput.select();
      }
    }
  });

  // Create ticket button – placeholder hook
  if (E.createTicketBtn) {
    E.createTicketBtn.addEventListener('click', () => {
      UI.toast('Configure this button to open your ticketing system.');
    });
  }

  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

/* ---------- Bootstrap ---------- */

document.addEventListener('DOMContentLoaded', () => {
  cacheEls();
  wireCore();
  wireCalendar();
  wirePlanner();
  wireAiQuery();

  // Restore previously active view
  let view = 'issues';
  try {
    view = localStorage.getItem(LS_KEYS.view) || 'issues';
  } catch {}
  setActiveView(view);

  // Initial load
  loadIssues(false);
  loadEvents(false);
});
