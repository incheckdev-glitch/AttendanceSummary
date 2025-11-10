'use strict';

/**
 * InCheck Pro Dashboard — Issues · Ops · AI Copilot
 * Single-file architecture:
 *  - CONFIG / LS_KEYS
 *  - DataStore (issues + text analytics)
 *  - Risk engine (technical + biz + ops + severity/impact/urgency)
 *  - DSL query parser & matcher
 *  - Calendar risk (events + collisions + freezes + hot issues)
 *  - Release planner (F&B / Middle East)
 */

const CONFIG = {
  DATA_VERSION: '2',

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

// Normalize calendar event type into canonical values
function normalizeEventType(type) {
  const t = (type || '').toString().toLowerCase().trim();
  if (t.startsWith('deploy')) return 'Deployment';
  if (t.startsWith('maint')) return 'Maintenance';
  if (t.startsWith('release')) return 'Release';
  if (t.startsWith('holiday')) return 'Holiday';
  if (!t) return 'Other';
  return 'Other';
}

// Normalize modules into a clean string[]
function normalizeModules(modules) {
  if (Array.isArray(modules)) {
    return modules
      .map(m => String(m).trim())
      .filter(Boolean);
  }
  if (typeof modules === 'string') {
    return modules
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

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
  state: { search: '', module: 'All', priority: 'All', status: 'All', start: '', end: '' },
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
  computed: new Map(), // id -> { tokens:Set, tf:Map, idf:Map, risk, suggestions }
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
    if (i.startsWith('under')) return 'Under Development';
    if (i.startsWith('rejected')) return 'Rejected';
    if (i.startsWith('on hold')) return 'On Hold';
    if (i.startsWith('not started')) return 'Not Started Yet';
    if (i.startsWith('sent')) return 'Sent';
    if (i.startsWith('on stage')) return 'On Stage';
    return s || 'Not Started Yet';
  },
  normalizePriority(p) {
    const i = (p || '').trim().toLowerCase();
    if (!i) return '';
    if (i.startsWith('h')) return 'High';
    if (i.startsWith('m')) return 'Medium';
    if (i.startsWith('l')) return 'Low';
    return p;
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
    return {
      id: pick('ticket id', 'id'),
      module: pick('impacted module', 'module', 'issue location') || 'Unspecified',
      title: pick('title'),
      desc: pick('description'),
      file: pick('file upload', 'link', 'url'),
      priority: DataStore.normalizePriority(pick('priority')),
      status: DataStore.normalizeStatus(pick('status') || 'Not Started Yet'),
      type: pick('category', 'type'),
      date: pick('timestamp', 'date', 'created at'),
      log: pick('log', 'logs', 'comment', 'notes')
    };
  },
  tokenize(issue) {
    const text = [issue.title, issue.desc, issue.log].filter(Boolean).join(' ').toLowerCase();
    return text
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(w => w && w.length > 2 && !STOPWORDS.has(w));
  },
  hydrate(csvText) {
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data
      .map(DataStore.normalizeRow)
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

    // risk & suggestions
    this.rows.forEach(r => {
      const risk = Risk.computeRisk(r);
      const categories = Risk.suggestCategories(r);
      const sPrio = Risk.suggestPriority(r, risk.total);
      const reasons = Risk.explainRisk(r);
      const meta = this.computed.get(r.id);
      meta.risk = { ...risk, reasons };
      meta.suggestions = { priority: sPrio, categories };
    });
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
  return { High: 3, Medium: 2, Low: 1 }[p] || 0;
}
function prioGap(suggested, current) {
  return prioMap(suggested) - prioMap(current);
}

/** Risk engine (with severity / impact / urgency) */
const Risk = {
  scoreFromBoosts(text, rules) {
    let s = 0;
    for (const [kw, val] of rules) {
      if (text.includes(kw)) s += val;
    }
    return s;
  },
  computeRisk(issue) {
    const txt = [issue.title, issue.desc, issue.log].filter(Boolean).join(' ').toLowerCase() + ' ';
    const basePriority = CONFIG.RISK.priorityWeight[issue.priority || ''] || 1;

    const tech = basePriority + this.scoreFromBoosts(txt, CONFIG.RISK.techBoosts);
    const biz = this.scoreFromBoosts(txt, CONFIG.RISK.bizBoosts);
    const ops = this.scoreFromBoosts(txt, CONFIG.RISK.opsBoosts);

    let total = tech + biz + ops;

    const st = (issue.status || '').toLowerCase();
    for (const k in CONFIG.RISK.statusBoosts) {
      if (st.startsWith(k)) total += CONFIG.RISK.statusBoosts[k];
    }

    let timeRisk = 0;
    let ageDays = null;
    let isOpen = !(st.startsWith('resolved') || st.startsWith('rejected'));

    if (issue.date) {
      const d = new Date(issue.date);
      if (!isNaN(d)) {
        ageDays = (Date.now() - d.getTime()) / 86400000;
        if (isOpen && total >= CONFIG.RISK.highRisk) {
          if (ageDays <= 14) timeRisk += 2; // fresh risky
          if (ageDays >= 30) timeRisk += 3; // stale high-risk
        }
      }
    }
    total += timeRisk;

    // severity: how bad is the scenario
    let severity = basePriority;
    if (/p0|sev0|outage|down|data loss|breach|security/i.test(txt)) severity += 3;
    if (/p1|sev1|incident|sla/i.test(txt)) severity += 2;
    if (/p2|degraded/i.test(txt)) severity += 1;

    // impact: how much money / users
    let impact = 1;
    if (/payment|billing|checkout|revenue|invoice|subscription|signup|onboarding/i.test(txt))
      impact += 2;
    if (/login|auth|authentication|token|session/i.test(txt)) impact += 1.5;
    if (/admin|internal|report/i.test(txt)) impact += 0.5;

    // urgency: time sensitivity
    let urgency = 1;
    if (/today|now|immediately|urgent|sla/i.test(txt)) urgency += 1.5;
    if (ageDays != null) {
      if (ageDays <= 1) urgency += 1;
      if (ageDays >= 14 && isOpen) urgency += 0.5;
    }

    const sevScore = Math.round(severity);
    const impScore = Math.round(impact * 1.5);
    const urgScore = Math.round(urgency * 1.5);

    total += sevScore + impScore + urgScore;

    return {
      technical: tech,
      business: biz,
      operational: ops,
      time: timeRisk,
      total,
      severity: sevScore,
      impact: impScore,
      urgency: urgScore
    };
  },
  suggestCategories(issue) {
    const text = [issue.title, issue.desc, issue.log].filter(Boolean).join(' ').toLowerCase();
    const res = [];
    Object.entries(CONFIG.LABEL_KEYWORDS).forEach(([label, kws]) => {
      let hits = 0;
      kws.forEach(k => {
        if (text.includes(k)) hits++;
      });
      if (hits) res.push({ label, score: hits });
    });
    res.sort((a, b) => b.score - a.score);
    return res;
  },
  suggestPriority(issue, totalRisk) {
    if (issue.priority) return issue.priority;
    const s = totalRisk != null ? totalRisk : this.computeRisk(issue).total;
    if (s >= CONFIG.RISK.highRisk) return 'High';
    if (s >= 6) return 'Medium';
    return 'Low';
  },
  explainRisk(issue) {
    const txt = [issue.title, issue.desc, issue.log].filter(Boolean).join(' ').toLowerCase() + ' ';
    const picks = [];
    const push = kw => {
      if (txt.includes(kw)) picks.push(kw);
    };
    [...CONFIG.RISK.techBoosts, ...CONFIG.RISK.bizBoosts, ...CONFIG.RISK.opsBoosts].forEach(
      ([kw]) => push(kw)
    );
    if ((issue.status || '').toLowerCase().startsWith('on stage')) picks.push('on stage');
    if ((issue.status || '').toLowerCase().startsWith('under')) picks.push('under development');

    if (issue.date) {
      const d = new Date(issue.date);
      if (!isNaN(d)) {
        const ageDays = (Date.now() - d.getTime()) / 86400000;
        if (ageDays <= 14) picks.push('recent');
        else if (ageDays >= 30) picks.push('stale');
      }
    }

    return Array.from(new Set(picks)).slice(0, 6);
  }
};

/** Command DSL parser */
const DSL = {
  parse(text) {
    const lower = (text || '').toLowerCase();
    let w = ' ' + lower + ' ';
    const out = {
      module: null,
      status: null,
      priority: null,
      id: null,
      type: null,
      missing: null,
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

    const rv = lower.match(/\brisk([><=]{1,2})(\d+)/);
    if (rv) {
      out.riskOp = rv[1];
      out.riskVal = +rv[2];
      w = w.replace(rv[0], ' ');
    }

    const sv = lower.match(/\bseverity([><=]{1,2})(\d+)/);
    if (sv) {
      out.severityOp = sv[1];
      out.severityVal = +sv[2];
      w = w.replace(sv[0], ' ');
    }
    const iv = lower.match(/\bimpact([><=]{1,2})(\d+)/);
    if (iv) {
      out.impactOp = iv[1];
      out.impactVal = +iv[2];
      w = w.replace(iv[0], ' ');
    }
    const uv = lower.match(/\burgency([><=]{1,2})(\d+)/);
    if (uv) {
      out.urgencyOp = uv[1];
      out.urgencyVal = +uv[2];
      w = w.replace(uv[0], ' ');
    }

    eat(/\blast:(\d+)d/, 'lastDays', n => +n);
    const av = lower.match(/\bage([><=]{1,2})(\d+)d/);
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
    return out;
  },
  matches(issue, meta, q) {
    if (q.module && !(issue.module || '').toLowerCase().includes(q.module)) return false;
    if (q.priority) {
      const p = q.priority[0].toUpperCase();
      if (['H', 'M', 'L'].includes(p)) {
        if ((issue.priority || '')[0] !== p) return false;
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
    if (q.type && !(issue.type || '').toLowerCase().includes(q.type)) return false;
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
      const op = q.ageOp,
        b = q.ageVal;
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
      const op = q.riskOp,
        b = q.riskVal;
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

    if (q.words && q.words.length) {
      const txt = [issue.title, issue.desc, issue.log].filter(Boolean).join(' ').toLowerCase();
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
  const now = new Date(),
    limit = U.dateAddDays(now, 7);
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
    const impacted = modules.filter(m => title.includes((m || '').toLowerCase()));
    let rel = [];
    if (impacted.length) rel = openIssues.filter(i => impacted.includes(i.module));
    else if ((ev.type || '').toLowerCase() !== 'other') {
      const recentOpen = openIssues.filter(i => U.isBetween(i.date, U.daysAgo(7), null));
      rel = recentOpen.filter(
        i => (DataStore.computed.get(i.id)?.risk?.total || 0) >= CONFIG.RISK.highRisk
      );
    }
    if (!rel.length) return;
    const risk = rel.reduce(
      (s, i) => s + (DataStore.computed.get(i.id)?.risk?.total || 0),
      0
    );
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
    const modulesArr = normalizeModules(ev.modules);
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
  /**
   * Build context from selected tickets:
   * - merged modules
   * - combined text (title/desc/log + other fields)
   * - aggregated risk (max/avg/total)
   */
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

    const normalized = sum / 40; // tuning constant
    let bugRisk = Math.max(0, Math.min(6, normalized));

    // Boost bug pressure slightly when selected tickets are very risky
    const tc = ticketContext || {};
    const maxTicketRisk = tc.maxRisk || 0;
    if (maxTicketRisk) {
      const boost = 1 + Math.min(maxTicketRisk / 20, 1) * 0.25; // up to +25%
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
    // "Bomb bug" = old, high-risk incidents that are textually close to this release
    const now = new Date();
    const lookback = U.dateAddDays(now, -365); // last year
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
      if (ageDays <= 30) return; // we want "old" tickets

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

      // Soft decay: more recent old bugs weigh a bit more
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

    const normalized = raw / 60; // tuning constant
    let bombRisk = Math.max(0, Math.min(6, normalized));

    // Also let current ticket risk slightly boost bomb-bug signal
    const tc = ticketContext || {};
    if (tc.avgRisk) {
      const boost = 1 + Math.min(tc.avgRisk / 20, 1) * 0.3; // up to +30%
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
    const windowMs = 2 * 60 * 60 * 1000; // +/- 2h for normal changes
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

      // For holidays, ignore env filter (they affect all envs operationally)
      if (!isHoliday && env && evEnv && evEnv !== env) return;

      const diffMs = Math.abs(start.getTime() - center);
      const maxWindowMs = isHoliday ? 24 * 60 * 60 * 1000 : windowMs;
      if (diffMs > maxWindowMs) return;

      // Collision with other changes near this time
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
        // Strong penalty for public / religious holidays around MENA service hours
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

    // Raw component scores
    const rushRisk = this.computeRushScore(region, date);               // 0–6
    const envRaw   = this.envWeight[env] ?? 1;                          // ~0.6–2.5
    const typeRaw  = this.releaseTypeWeight[releaseType] ?? 2;          // 1–3

    const { penalty: eventsRisk, count: eventCount, holidayCount } =
      this.computeEventsPenalty(date, env, modules, region);            // 0+

    const bugRaw     = bugRisk || 0;                                    // 0–6
    const bombRaw    = bombBugRisk || 0;                                // 0–6
    const ticketsRaw = ticketRisk || 0;                                 // 0–6

    // ---- Normalize each factor to 0–1 ----
    const clamp01 = v => Math.max(0, Math.min(1, v));

    const nRush    = clamp01(rushRisk / 6);
    const nBug     = clamp01(bugRaw / 6);
    const nBomb    = clamp01(bombRaw / 6);
    const nTickets = clamp01(ticketsRaw / 6);
    const nEnv     = clamp01(envRaw / 2.5);  // Prod ≈ 1
    const nType    = clamp01(typeRaw / 3);
    const nEvents  = clamp01(eventsRisk / 6); // 0–6+ → 0–1

    // ---- Weighted combination into a 0–10 score ----
    const wRush    = 0.15;
    const wBug     = 0.20;
    const wBomb    = 0.15;
    const wEvents  = 0.20;
    const wTickets = 0.15;
    const wEnv     = 0.075;
    const wType    = 0.075;

    const combined =
      wRush    * nRush    +
      wBug     * nBug     +
      wBomb    * nBomb    +
      wEvents  * nEvents  +
      wTickets * nTickets +
      wEnv     * nEnv     +
      wType    * nType;

    // Final risk: 0–10
    const totalRisk   = Math.max(0, Math.min(10, combined * 10));
    const safetyScore = 10 - totalRisk; // 0–10 (10 = safest)

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
    // totalRisk is now 0–10
    if (totalRisk < 3.5) {
      return { label: 'Low', className: 'planner-score-low' };
    }
    if (totalRisk < 7.0) {
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

    // Build a richer context from selected tickets (scope + text + risk)
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

    // Ticket risk component: normalize avg risk onto a 0–6 scale
    let ticketRiskComponent = 0;
    if (ticketContext.avgRisk) {
      ticketRiskComponent = Math.min(ticketContext.avgRisk / 4, 6);
    }

    const slots = [];
    const hoursProd = [6, 10, 15, 23]; // Prod: pre-service + between services + late
    const hoursNonProd = [10, 15, 18]; // Staging/Dev can tolerate slightly busier times
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
    if (E.loadingStatus) E.loadingStatus.textContent = v ? 'Loading…' : '';
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
      E.moduleFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.module))]
        .map(v => `<option>${v}</option>`)
        .join('');
    if (E.priorityFilter)
      E.priorityFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.priority))]
        .map(v => `<option>${v}</option>`)
        .join('');
    if (E.statusFilter)
      E.statusFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.status))]
        .map(v => `<option>${v}</option>`)
        .join('>');
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
    const total = list.length,
      counts = {};
    list.forEach(r => (counts[r.status] = (counts[r.status] || 0) + 1));
    E.kpis.innerHTML = '';
    const add = (label, val) => {
      const pct = total ? Math.round((val * 100) / total) : 0;
      const d = document.createElement('div');
      d.className = 'card kpi';
      d.tabIndex = 0;
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', `${label}: ${val} (${pct} percent)`);      
      d.innerHTML = `<div class="label">${label}</div><div class="value">${val}</div><div class="sub">${pct}%</div>`;
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
          const va = a[sortKey] || '',
            vb = b[sortKey] || '';
          if (sortKey === 'date') {
            const da = new Date(va),
              db = new Date(vb);
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

    const total = rows.length,
      size = GridState.pageSize,
      page = GridState.page;
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
      const atFirst = GridState.page <= 1,
        atLast = GridState.page >= pages;
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
        </tr>
      `
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
      'On Stage': cssVar('--status-onstage')
    };
    const priorityColors = {
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
      const labels = Object.keys(data),
        values = Object.values(data);
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
    chips.push(`<button type="button" class="filter-chip" data-filter-key="${key}">
      <span>${label}: ${U.escapeHtml(value)}</span>
      <span aria-hidden="true">✕</span>
    </button>`);
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

const Analytics = {
  topTokens(limit = 12) {
    const freq = new Map();
    DataStore.rows.forEach(r => {
      const meta = DataStore.computed.get(r.id);
      if (!meta || !meta.tf) return;
      meta.tf.forEach((count, term) => {
        freq.set(term, (freq.get(term) || 0) + count);
      });
    });
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term, count]) => ({ term, count }));
  },

  topLabels(limit = 10) {
    const labelCounts = new Map();
    DataStore.rows.forEach(r => {
      const cats = Risk.suggestCategories(r) || [];
      if (!cats.length) return;
      const top = cats[0].label;
      labelCounts.set(top, (labelCounts.get(top) || 0) + 1);
    });
    return [...labelCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, count]) => ({ label, count }));
  },

  riskBands() {
    const bands = { low: 0, med: 0, high: 0, crit: 0 };
    DataStore.rows.forEach(r => {
      const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
      if (risk >= CONFIG.RISK.critRisk) bands.crit++;
      else if (risk >= CONFIG.RISK.highRisk) bands.high++;
      else if (risk >= 6) bands.med++;
      else bands.low++;
    });
    return bands;
  },

  modulesSummary(limit = 10) {
    const info = new Map();
    DataStore.rows.forEach(r => {
      const m = r.module || 'Unspecified';
      if (!info.has(m)) {
        info.set(m, {
          module: m,
          total: 0,
          open: 0,
          highRisk: 0,
          riskSum: 0
        });
      }
      const obj = info.get(m);
      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      obj.total++;
      const st = (r.status || '').toLowerCase();
      const closed = st.startsWith('resolved') || st.startsWith('rejected');
      if (!closed) {
        obj.open++;
        if (risk >= CONFIG.RISK.highRisk) obj.highRisk++;
      }
      obj.riskSum += risk;
    });

    const arr = [...info.values()].map(row => ({
      ...row,
      avgRisk: row.total ? row.riskSum / row.total : 0
    }));

    return arr
      .sort((a, b) => {
        if (b.highRisk !== a.highRisk) return b.highRisk - a.highRisk;
        return b.avgRisk - a.avgRisk;
      })
      .slice(0, limit);
  },

  hotIssues(limit = 20) {
    const open = [];
    DataStore.rows.forEach(r => {
      const st = (r.status || '').toLowerCase();
      const closed = st.startsWith('resolved') || st.startsWith('rejected');
      if (closed) return;
      const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
      if (risk >= CONFIG.RISK.highRisk) {
        open.push({ issue: r, risk });
      }
    });
    open.sort((a, b) => b.risk - a.risk);
    return open.slice(0, limit);
  },

  incidentCandidates(limit = 15) {
    const list = [];
    DataStore.rows.forEach(r => {
      const txt = [r.title, r.desc, r.log].filter(Boolean).join(' ').toLowerCase();
      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      const st = (r.status || '').toLowerCase();
      const isIncidentLike =
        /incident|p0|p1|outage|down|major|critical|sev0|sev1/i.test(txt) ||
        st.startsWith('on stage');
      if (!isIncidentLike) return;
      list.push({ issue: r, risk });
    });
    list.sort((a, b) => b.risk - a.risk);
    return list.slice(0, limit);
  },

  eventsOverview() {
    if (!DataStore.events || !DataStore.events.length) {
      return { riskyEvents: [], collisions: [], flagsById: new Map() };
    }
    const events = DataStore.events;
    const issues = DataStore.rows;
    const risky = computeEventsRisk(issues, events);
    const { collisions, flagsById } = computeChangeCollisions(issues, events);
    return { riskyEvents: risky, collisions, flagsById };
  },

  refreshAll() {
    if (!DataStore.rows || !DataStore.rows.length) return;
    UI.setAnalyzing(true);

    try {
      const tokens = this.topTokens();
      const labels = this.topLabels();
      const bands = this.riskBands();
      const modules = this.modulesSummary();
      const hot = this.hotIssues();
      const incidents = this.incidentCandidates();
      const eventsInfo = this.eventsOverview();

      // Patterns / tokens
      if (E.aiPatternsList) {
        E.aiPatternsList.innerHTML = tokens
          .map(
            t =>
              `<li><span class="token">${U.escapeHtml(
                t.term
              )}</span><span class="count">${t.count}</span></li>`
          )
          .join('') || '<li class="muted">No signal yet.</li>';
      }

      // Labels
      if (E.aiLabelsList) {
        E.aiLabelsList.innerHTML = labels
          .map(
            x =>
              `<li><span class="label">${U.escapeHtml(
                x.label
              )}</span><span class="count">${x.count}</span></li>`
          )
          .join('') || '<li class="muted">No categories inferred yet.</li>';
      }

      // Risk bands
      if (E.aiRisksList) {
        const total = DataStore.rows.length || 1;
        const items = [
          ['Low', bands.low],
          ['Medium', bands.med],
          ['High', bands.high],
          ['Critical', bands.crit]
        ];
        E.aiRisksList.innerHTML =
          items
            .map(([label, val]) => {
              const pct = Math.round((val * 100) / total);
              return `<li><span class="badge">${label}</span><span class="count">${val} · ${pct}%</span></li>`;
            })
            .join('') || '<li class="muted">No risk data.</li>';
      }

      // Modules table
      if (E.aiModulesTableBody) {
        E.aiModulesTableBody.innerHTML =
          modules
            .map(
              m => `
          <tr>
            <td>${U.escapeHtml(m.module)}</td>
            <td>${m.total}</td>
            <td>${m.open}</td>
            <td>${m.highRisk}</td>
            <td>${m.avgRisk.toFixed(1)}</td>
          </tr>`
            )
            .join('') || `<tr><td colspan="5" class="muted">No module data yet.</td></tr>`;
      }

      // Triage list (hot issues)
      if (E.aiTriageList) {
        E.aiTriageList.innerHTML =
          hot
            .map(({ issue, risk }) => {
              const reasons = (DataStore.computed.get(issue.id)?.risk?.reasons || []).join(
                ', '
              );
              return `<li>
                <div class="title">${U.escapeHtml(issue.id)} · ${U.escapeHtml(
                  issue.title || ''
                )}</div>
                <div class="meta">
                  <span class="pill">${U.escapeHtml(issue.module || 'Unspecified')}</span>
                  <span class="pill priority-${issue.priority || ''}">${U.escapeHtml(
                issue.priority || '-'
              )}</span>
                  <span class="pill ${CalendarLink.riskBadgeClass(
                    risk
                  )}">Risk ${risk}</span>
                </div>
                ${
                  reasons
                    ? `<div class="sub muted">Signals: ${U.escapeHtml(reasons)}</div>`
                    : ''
                }
              </li>`;
            })
            .join('') || '<li class="muted">No high-risk open issues.</li>';
      }

      // Events list (change / calendar risk)
      if (E.aiEventsList) {
        const { riskyEvents, collisions } = eventsInfo;
        const collisionSet = new Set(collisions.flat());
        E.aiEventsList.innerHTML =
          riskyEvents
            .map(({ event, risk, modules }) => {
              const flags = [];
              if (collisionSet.has(event.id)) flags.push('collision');
              return `<li>
                <div class="title">${U.escapeHtml(event.title || '')}</div>
                <div class="meta">
                  <span>${U.escapeHtml(event.type || '')} · ${U.fmtTS(event.start)}</span>
                  <span class="${CalendarLink.riskBadgeClass(risk)}">Linked risk: ${risk.toFixed(
                1
              )}</span>
                  ${
                    modules && modules.length
                      ? `<span class="pill">${modules
                          .map(m => U.escapeHtml(m))
                          .join(', ')}</span>`
                      : ''
                  }
                  ${
                    flags.length
                      ? `<span class="pill pill-warn">${flags
                          .map(f => U.escapeHtml(f))
                          .join(', ')}</span>`
                      : ''
                  }
                </div>
              </li>`;
            })
            .join('') || '<li class="muted">No upcoming risky changes.</li>';
      }

      // Incidents
      if (E.aiIncidentsList) {
        E.aiIncidentsList.innerHTML =
          incidents
            .map(({ issue, risk }) => {
              return `<li>
                <div class="title">${U.escapeHtml(issue.id)} · ${U.escapeHtml(
                issue.title || ''
              )}</div>
                <div class="meta">
                  <span class="pill">${U.escapeHtml(issue.status || '')}</span>
                  <span class="pill priority-${issue.priority || ''}">${U.escapeHtml(
                issue.priority || ''
              )}</span>
                  <span class="${CalendarLink.riskBadgeClass(
                    risk
                  )}">Risk ${risk}</span>
                </div>
              </li>`;
            })
            .join('') || '<li class="muted">No incident-like tickets detected.</li>';
      }

      // Small text summaries
      if (E.aiScopeText) {
        const total = DataStore.rows.length;
        const open = DataStore.rows.filter(r => {
          const st = (r.status || '').toLowerCase();
          return !(st.startsWith('resolved') || st.startsWith('rejected'));
        }).length;
        const hotCount = this.hotIssues().length;
        E.aiScopeText.textContent = `${total} total tickets · ${open} open · ${hotCount} high-risk open`;
      }

      if (E.aiSignalsText) {
        const labelsText = this
          .topLabels(5)
          .map(x => x.label)
          .join(', ');
        E.aiSignalsText.textContent = labelsText
          ? `Dominant themes: ${labelsText}`
          : 'No strong patterns yet.';
      }

      if (E.aiTrendsList) {
        const tokensShort = this.topTokens(8);
        E.aiTrendsList.innerHTML =
          tokensShort
            .map(t => `<li>${U.escapeHtml(t.term)} · ${t.count}</li>`)
            .join('') || '<li class="muted">No trend data.</li>';
      }

      if (E.aiEmergingStable) {
        const bands = this.riskBands();
        const total = DataStore.rows.length || 1;
        const highPct = Math.round(((bands.high + bands.crit) * 100) / total);
        E.aiEmergingStable.textContent =
          highPct >= 30
            ? 'Risk is skewed to the higher bands — new changes should be scheduled carefully.'
            : 'Risk is mostly low/medium — you have some room for safe changes.';
      }

      if (E.aiOpsCockpit) {
        const { riskyEvents } = eventsInfo;
        const hotCount = this.hotIssues().length;
        E.aiOpsCockpit.textContent =
          `Ops cockpit · ${hotCount} hot issues · ${riskyEvents.length} risky upcoming changes`;
      }
    } finally {
      UI.setAnalyzing(false);
    }
  }
};

/* =========================================================
   Calendar / Events loading & rendering
   ========================================================= */

const EventsCache = {
  load() {
    try {
      const raw = localStorage.getItem(LS_KEYS.events);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  save(events) {
    try {
      localStorage.setItem(LS_KEYS.events, JSON.stringify(events || []));
    } catch {}
  }
};

function normalizeEvent(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') raw = {};
  const id =
    raw.id ||
    raw.ID ||
    raw.Id ||
    `ev_${Date.now()}_${Math.random().toString(16).slice(2)}_${idx}`;
  const type = normalizeEventType(raw.type || raw.eventType || raw.category || '');
  const title = raw.title || raw.summary || raw.name || '';
  const env = raw.env || raw.environment || 'Prod';
  const owner = raw.owner || raw.createdBy || raw.author || '';
  const status = raw.status || 'Scheduled';
  const description = raw.description || raw.details || '';
  const impactType = raw.impactType || raw.impact || '';
  const allDay = raw.allDay === true || raw.allDay === 'true';

  const modules =
    raw.modules ||
    raw.module ||
    raw.impactedModules ||
    raw.components ||
    '';

  const start =
    raw.start ||
    raw.startTime ||
    raw.startDateTime ||
    raw.startDate ||
    '';
  const end =
    raw.end ||
    raw.endTime ||
    raw.endDateTime ||
    raw.endDate ||
    '';

  return {
    id: String(id),
    title,
    type,
    env,
    owner,
    status,
    description,
    impactType,
    start,
    end,
    allDay,
    modules: normalizeModules(modules)
  };
}

async function loadEvents(forceRefresh = false) {
  let events = null;

  if (!forceRefresh) {
    events = EventsCache.load();
    if (events && events.length) {
      DataStore.events = events;
      UI.setSync('events', true, new Date());
      renderCalendarEvents(events);
      Analytics.refreshAll();
      return;
    }
  }

  try {
    const resp = await fetch(CONFIG.CALENDAR_API_URL, { method: 'GET' });
    if (!resp.ok) throw new Error('Calendar API error');
    const data = await resp.json().catch(() => ({}));

    const rawEvents = Array.isArray(data)
      ? data
      : Array.isArray(data.events)
      ? data.events
      : [];
    events = rawEvents.map((e, i) => normalizeEvent(e, i));

    DataStore.events = events;
    EventsCache.save(events);
    UI.setSync('events', true, new Date());
    renderCalendarEvents(events);
    Analytics.refreshAll();
  } catch (err) {
    console.error('Failed to load events', err);
    UI.setSync('events', false, null);
    UI.toast('Failed to load calendar events.');
  }
}

async function saveEventToSheet(ev) {
  // Normalize before sending & storing
  const payload = {
    ...ev,
    type: normalizeEventType(ev.type),
    modules: normalizeModules(ev.modules)
  };

  try {
    const resp = await fetch(CONFIG.CALENDAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', event: payload })
    });

    const data = await resp.json().catch(() => ({}));
    // If backend returns full event list, prefer that
    let events = null;
    if (Array.isArray(data.events)) {
      events = data.events.map((e, i) => normalizeEvent(e, i));
    } else if (Array.isArray(data)) {
      events = data.map((e, i) => normalizeEvent(e, i));
    }

    if (!events) {
      // Fallback: update local event list
      const list = DataStore.events || [];
      const idx = list.findIndex(x => x.id === payload.id);
      if (idx >= 0) list[idx] = payload;
      else list.push(payload);
      events = list;
    }

    DataStore.events = events;
    EventsCache.save(events);
    UI.setSync('events', true, new Date());
    renderCalendarEvents(events);
    Analytics.refreshAll();
    UI.toast('Event saved.');
  } catch (err) {
    console.error('Failed to save event', err);
    UI.toast('Failed to save event (see console).');
  }
}

async function deleteEventFromSheet(eventId) {
  try {
    const resp = await fetch(CONFIG.CALENDAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: eventId })
    });

    const data = await resp.json().catch(() => ({}));
    let events = null;
    if (Array.isArray(data.events)) {
      events = data.events.map((e, i) => normalizeEvent(e, i));
    } else if (Array.isArray(data)) {
      events = data.map((e, i) => normalizeEvent(e, i));
    }

    if (!events) {
      // Fallback: local delete
      events = (DataStore.events || []).filter(e => e.id !== eventId);
    }

    DataStore.events = events;
    EventsCache.save(events);
    UI.setSync('events', true, new Date());
    renderCalendarEvents(events);
    Analytics.refreshAll();
    UI.toast('Event deleted.');
  } catch (err) {
    console.error('Failed to delete event', err);
    UI.toast('Failed to delete event.');
  }
}

function getFilteredEvents() {
  const events = DataStore.events || [];
  if (!events.length) return [];

  const typeFilters = {
    Deployment: E.eventFilterDeployment ? E.eventFilterDeployment.checked : true,
    Maintenance: E.eventFilterMaintenance ? E.eventFilterMaintenance.checked : true,
    Release: E.eventFilterRelease ? E.eventFilterRelease.checked : true,
    Other: E.eventFilterOther ? E.eventFilterOther.checked : true
  };

  return events.filter(ev => {
    const t = normalizeEventType(ev.type);
    if (!typeFilters[t]) return false;
    return true;
  });
}

function renderCalendarEvents(events) {
  const container = document.getElementById('calendarEventsList');
  if (!container) return;

  const list = events && events.length ? events : getFilteredEvents();
  const issues = DataStore.rows || [];
  const { collisions, flagsById } = computeChangeCollisions(issues, list);
  const collisionSet = new Set(collisions.flat());

  const upcomingRisk = computeEventsRisk(issues, list);
  const riskMap = new Map();
  upcomingRisk.forEach(x => riskMap.set(x.event.id, x.risk));

  if (!list.length) {
    container.innerHTML =
      '<div class="muted" style="padding:8px 0;">No upcoming events.</div>';
    return;
  }

  const tzLabel = E.calendarTz ? E.calendarTz.value || 'local' : 'local';
  const fmt = d => {
    const date = new Date(d);
    if (isNaN(date)) return '—';
    if (tzLabel === 'utc') {
      return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    }
    return date.toLocaleString();
  };

  container.innerHTML = list
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .map(ev => {
      const risk = riskMap.get(ev.id) || 0;
      const flags = flagsById.get(ev.id) || {};
      const pills = [];

      if (collisionSet.has(ev.id) || flags.collision) pills.push('Collision');
      if (flags.freeze) pills.push('Freeze window');
      if (flags.hotIssues) pills.push('Hot issues nearby');

      return `<article class="event-card" data-event-id="${U.escapeAttr(ev.id)}">
        <header>
          <h4>${U.escapeHtml(ev.title || '(untitled)')}</h4>
          <div class="event-meta">
            <span class="pill">${U.escapeHtml(ev.env || 'Prod')}</span>
            <span class="pill">${U.escapeHtml(ev.type || 'Other')}</span>
            ${
              risk
                ? `<span class="pill ${CalendarLink.riskBadgeClass(
                    risk
                  )}">Risk ${risk.toFixed(1)}</span>`
                : ''
            }
          </div>
        </header>
        <div class="event-body">
          <div class="times">
            <span>${fmt(ev.start)}</span>
            ${
              ev.end
                ? `<span class="muted">→ ${fmt(ev.end)}</span>`
                : ''
            }
            ${ev.allDay ? '<span class="pill">All day</span>' : ''}
          </div>
          ${
            ev.modules && ev.modules.length
              ? `<div class="muted small">Modules: ${ev.modules
                  .map(m => U.escapeHtml(m))
                  .join(', ')}</div>`
              : ''
          }
          ${
            ev.description
              ? `<div class="muted small">${U.escapeHtml(ev.description)}</div>`
              : ''
          }
          ${
            pills.length
              ? `<div class="flags">${pills
                  .map(p => `<span class="pill pill-warn">${U.escapeHtml(p)}</span>`)
                  .join(' ')}</div>`
              : ''
          }
        </div>
      </article>`;
    })
    .join('');

  container.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-event-id');
      UI.Modals.openEvent(id);
    });
  });
}

/* =========================================================
   Issues loading
   ========================================================= */

async function loadIssues(forceRefresh = false) {
  UI.skeleton(true);
  UI.setAnalyzing(true);

  try {
    let cached = null;
    if (!forceRefresh) {
      cached = IssuesCache.load();
    }

    if (cached && cached.length) {
      DataStore.hydrateFromRows(cached);
      const iso = localStorage.getItem(LS_KEYS.issuesLastUpdated);
      UI.setSync('issues', true, iso ? new Date(iso) : new Date());
      UI.refreshAll();
      return;
    }

    const resp = await fetch(CONFIG.SHEET_URL, { method: 'GET' });
    if (!resp.ok) throw new Error('Sheet fetch failed');
    const csv = await resp.text();

    DataStore.hydrate(csv);
    IssuesCache.save(DataStore.rows);
    UI.setSync('issues', true, new Date());
    UI.refreshAll();
  } catch (err) {
    console.error('Failed to load issues', err);
    UI.setSync('issues', false, null);
    UI.toast('Failed to load issues CSV.');
  } finally {
    UI.skeleton(false);
    UI.setAnalyzing(false);
  }
}

/* =========================================================
   Modals: Issues + Events
   ========================================================= */

UI.Modals = {
  currentIssueId: null,
  currentEventId: null,

  openIssue(id) {
    const issue = DataStore.byId.get(id);
    if (!issue || !E.issueModal) return;
    this.currentIssueId = id;

    const meta = DataStore.computed.get(id) || {};
    const risk = meta.risk || {};
    const reasons = risk.reasons || [];
    const cats = meta.suggestions?.categories || [];
    const prioGapVal = prioGap(meta.suggestions?.priority, issue.priority);

    if (E.modalTitle) {
      E.modalTitle.textContent = `${issue.id} · ${issue.title || ''}`;
    }

    if (E.modalBody) {
      E.modalBody.innerHTML = `
        <div class="issue-detail">
          <div class="section">
            <h4>Overview</h4>
            <p><strong>Module:</strong> ${U.escapeHtml(issue.module || 'Unspecified')}</p>
            <p><strong>Priority:</strong> ${U.escapeHtml(issue.priority || '-')} ${
        prioGapVal > 0
          ? `<span class="pill pill-warn" title="AI suggests higher priority">AI ↑ ${meta.suggestions.priority}</span>`
          : ''
      }</p>
            <p><strong>Status:</strong> ${U.escapeHtml(issue.status || '-')}</p>
            <p><strong>Date:</strong> ${U.escapeHtml(issue.date || '-')}</p>
          </div>
          <div class="section">
            <h4>Description</h4>
            <p>${U.escapeHtml(issue.desc || '—')}</p>
            ${
              issue.log
                ? `<h4>Log / Notes</h4><pre>${U.escapeHtml(issue.log)}</pre>`
                : ''
            }
            ${
              issue.file
                ? `<p><a href="${U.escapeAttr(
                    issue.file
                  )}" target="_blank" rel="noopener noreferrer">Open attachment</a></p>`
                : ''
            }
          </div>
          <div class="section">
            <h4>Risk breakdown</h4>
            <p><strong>Total risk:</strong> ${risk.total ?? 0}</p>
            <ul class="risk-breakdown">
              <li>Technical: ${risk.technical ?? 0}</li>
              <li>Business: ${risk.business ?? 0}</li>
              <li>Operational: ${risk.operational ?? 0}</li>
              <li>Time: ${risk.time ?? 0}</li>
              <li>Severity: ${risk.severity ?? 0}</li>
              <li>Impact: ${risk.impact ?? 0}</li>
              <li>Urgency: ${risk.urgency ?? 0}</li>
            </ul>
            ${
              reasons.length
                ? `<p class="muted small">Signals: ${U.escapeHtml(
                    reasons.join(', ')
                  )}</p>`
                : ''
            }
            ${
              cats.length
                ? `<p class="muted small">Likely categories: ${U.escapeHtml(
                    cats.map(c => c.label).join(', ')
                  )}</p>`
                : ''
            }
          </div>
        </div>`;
    }

    if (E.copyId) {
      E.copyId.onclick = () => {
        navigator.clipboard
          .writeText(issue.id)
          .then(() => UI.toast('Issue ID copied.'))
          .catch(() => UI.toast('Failed to copy.'));
      };
    }
    if (E.copyLink) {
      E.copyLink.onclick = () => {
        const url = location.href.split('#')[0] + '#issue-' + encodeURIComponent(issue.id);
        navigator.clipboard
          .writeText(url)
          .then(() => UI.toast('Deep link copied.'))
          .catch(() => UI.toast('Failed to copy.'));
      };
    }

    if (E.issueModal) E.issueModal.style.display = 'flex';
  },

  closeIssue() {
    this.currentIssueId = null;
    if (E.issueModal) E.issueModal.style.display = 'none';
  },

  _fillEventForm(ev) {
    if (!E.eventForm) return;
    E.eventTitle.value = ev?.title || '';
    E.eventType.value = normalizeEventType(ev?.type || '');
    E.eventIssueId.value = ev?.issueId || '';
    E.eventEnv.value = ev?.env || 'Prod';
    E.eventOwner.value = ev?.owner || '';
    E.eventStatus.value = ev?.status || 'Scheduled';
    E.eventImpactType.value = ev?.impactType || '';
    E.eventAllDay.checked = !!ev?.allDay;
    E.eventModules.value = (ev?.modules || []).join(', ');
    E.eventDescription.value = ev?.description || '';
    E.eventStart.value = ev?.start ? toLocalInputValue(ev.start) : '';
    E.eventEnd.value = ev?.end ? toLocalInputValue(ev.end) : '';

    if (E.eventIssueLinkedInfo) {
      const issue =
        ev?.issueId && DataStore.byId ? DataStore.byId.get(ev.issueId) : null;
      if (issue) {
        E.eventIssueLinkedInfo.textContent = `${issue.id} · ${issue.title || ''}`;
        E.eventIssueLinkedInfo.style.display = '';
      } else {
        E.eventIssueLinkedInfo.textContent = '';
        E.eventIssueLinkedInfo.style.display = 'none';
      }
    }
  },

  openEvent(id) {
    if (!E.eventModal) return;
    this.currentEventId = id;
    const ev = (DataStore.events || []).find(e => e.id === id);
    if (!ev) return;

    if (E.eventModalTitle) {
      E.eventModalTitle.textContent = 'Edit Event';
    }
    if (E.eventDelete) E.eventDelete.style.display = '';
    this._fillEventForm(ev);

    E.eventModal.style.display = 'flex';
  },

  newEvent(initial = {}) {
    if (!E.eventModal) return;
    this.currentEventId = null;
    if (E.eventModalTitle) {
      E.eventModalTitle.textContent = 'Add Event';
    }
    if (E.eventDelete) E.eventDelete.style.display = 'none';

    const ev = {
      title: '',
      type: 'Deployment',
      env: initial.env || 'Prod',
      allDay: false,
      modules: initial.modules || [],
      description: initial.description || '',
      start: initial.start || '',
      end: initial.end || '',
      owner: '',
      status: 'Scheduled',
      impactType: ''
    };
    this._fillEventForm(ev);

    E.eventModal.style.display = 'flex';
  },

  closeEvent() {
    this.currentEventId = null;
    if (E.eventModal) E.eventModal.style.display = 'none';
  }
};

/* =========================================================
   Release Planner UI
   ========================================================= */

UI.ReleasePlanner = {
  lastResult: null,

  _parseModules(str) {
    if (!str) return [];
    return str
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  },

  _parseTickets(str) {
    if (!str) return [];
    return str
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
  },

  run() {
    if (!E.plannerResults) return;
    const region = E.plannerRegion ? E.plannerRegion.value || 'Gulf' : 'Gulf';
    const env = E.plannerEnv ? E.plannerEnv.value || 'Prod' : 'Prod';
    const modules = this._parseModules(E.plannerModules?.value || '');
    const description = E.plannerDescription?.value || '';
    const horizon = parseInt(E.plannerHorizon?.value || '7', 10) || 7;
    const slotsPerDay = parseInt(E.plannerSlotsPerDay?.value || '3', 10) || 3;
    const tickets = this._parseTickets(E.plannerTickets?.value || '');

    const { bug, bomb, slots, ticketContext } = ReleasePlanner.suggestSlots({
      region,
      env,
      modules,
      horizonDays: horizon,
      releaseType: (E.plannerReleaseType?.value || 'feature').toLowerCase(),
      description,
      slotsPerDay,
      tickets
    });

    this.lastResult = { bug, bomb, slots, ticketContext, region, env, modules };

    const totalSlots = slots.length;
    if (!totalSlots) {
      E.plannerResults.innerHTML =
        '<div class="muted">No suitable slots found in the selected horizon.</div>';
      if (E.plannerReleasePlan) {
        E.plannerReleasePlan.textContent =
          'No safe window found; consider reducing scope or expanding the date range.';
      }
      return;
    }

    E.plannerResults.innerHTML = slots
      .map((slot, i) => {
        const bucket = ReleasePlanner.riskBucket(slot.totalRisk);
        return `
        <label class="planner-slot">
          <input type="radio" name="plannerSlot" value="${i}" ${
          i === 0 ? 'checked' : ''
        }>
          <div class="body">
            <div class="time">${U.escapeHtml(slot.start.toLocaleString())}</div>
            <div class="score ${bucket.className}">
              <span>${bucket.label} risk</span>
              <span>${slot.totalRisk.toFixed(1)} / 10</span>
            </div>
            <div class="sub">
              <span>Service load: ${ReleasePlanner.rushLabel(slot.rushRisk)}</span>
              <span>Bug pressure: ${ReleasePlanner.bugLabel(slot.bugRisk)}</span>
              <span>Historical blast radius: ${ReleasePlanner.bombLabel(
                slot.bombRisk
              )}</span>
              ${
                slot.eventCount || slot.holidayCount
                  ? `<span>Nearby events: ${slot.eventCount || 0}, holidays: ${
                      slot.holidayCount || 0
                    }</span>`
                  : ''
              }
            </div>
          </div>
        </label>`;
      })
      .join('');

    if (E.plannerReleasePlan) {
      const best = slots[0];
      const bucket = ReleasePlanner.riskBucket(best.totalRisk);
      E.plannerReleasePlan.textContent =
        `Best window: ${best.start.toLocaleString()} (${bucket.label} risk). ` +
        `Bug pressure: ${ReleasePlanner.bugLabel(
          bug.risk
        )}. Blast pattern: ${ReleasePlanner.bombLabel(
          bomb.risk
        )}. Use early-morning off-peak when possible.`;
    }
  },

  assignSelectedToEvent() {
    if (!this.lastResult || !this.lastResult.slots.length) return;
    const input = E.plannerResults?.querySelector('input[name="plannerSlot"]:checked');
    const idx = input ? parseInt(input.value, 10) || 0 : 0;
    const slot = this.lastResult.slots[idx] || this.lastResult.slots[0];
    if (!slot) return;

    const initial = {
      env: this.lastResult.env || 'Prod',
      modules: this.lastResult.modules || [],
      start: slot.start,
      end: slot.end,
      description: E.plannerDescription?.value || ''
    };

    UI.Modals.newEvent(initial);
  }
};

/* =========================================================
   AI Query (DSL) panel
   ========================================================= */

function runAiQuery() {
  if (!E.aiQueryInput || !E.aiQueryResults) return;
  const text = (E.aiQueryInput.value || '').trim();
  if (!text) {
    E.aiQueryResults.innerHTML =
      '<div class="muted">Type a query, e.g. <code>status:open risk>=9 module:payments</code></div>';
    return;
  }

  const q = DSL.parse(text);
  const matches = [];
  DataStore.rows.forEach(issue => {
    const meta = DataStore.computed.get(issue.id) || {};
    if (DSL.matches(issue, meta, q)) matches.push({ issue, meta });
  });

  const total = matches.length;
  if (!total) {
    E.aiQueryResults.innerHTML =
      '<div class="muted">No tickets matched this query.</div>';
    return;
  }

  const html = matches
    .slice(0, 200)
    .map(({ issue, meta }) => {
      const risk = meta.risk?.total || 0;
      const reasons = (meta.risk?.reasons || []).join(', ');
      return `<article class="ai-result" data-id="${U.escapeAttr(issue.id)}">
        <header>
          <h4>${U.escapeHtml(issue.id)} · ${U.escapeHtml(issue.title || '')}</h4>
          <div class="meta">
            <span class="pill">${U.escapeHtml(issue.module || 'Unspecified')}</span>
            <span class="pill priority-${issue.priority || ''}">${U.escapeHtml(
        issue.priority || '-'
      )}</span>
            <span class="pill">${U.escapeHtml(issue.status || '-')}</span>
            <span class="${CalendarLink.riskBadgeClass(risk)}">Risk ${risk}</span>
          </div>
        </header>
        <div class="body">
          ${
            issue.desc
              ? `<p class="muted small">${U.escapeHtml(issue.desc.slice(0, 260))}${
                  issue.desc.length > 260 ? '…' : ''
                }</p>`
              : ''
          }
          ${
            reasons
              ? `<p class="muted tiny">Signals: ${U.escapeHtml(reasons)}</p>`
              : ''
          }
        </div>
      </article>`;
    })
    .join('');

  E.aiQueryResults.innerHTML = `<div class="muted small">${total} tickets matched.</div>${html}`;

  E.aiQueryResults.querySelectorAll('.ai-result').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      UI.Modals.openIssue(id);
    });
  });
}

function applyAiQueryAsFilters() {
  if (!E.aiQueryInput) return;
  const text = (E.aiQueryInput.value || '').trim();
  if (!text) return;
  const q = DSL.parse(text);

  if (q.module) Filters.state.module = 'All'; // we use free-text match, not exact
  if (q.priority) Filters.state.priority = 'All';
  if (q.status === 'open' || q.status === 'closed') {
    // keep as search-only
  }

  // Use words and text as search string
  const parts = [];
  if (q.words && q.words.length) parts.push(...q.words);
  if (q.module) parts.push(q.module);
  if (q.type) parts.push(q.type);
  Filters.state.search = parts.join(' ');

  Filters.save();
  UI.refreshAll();
}

function exportAiQueryResults() {
  if (!E.aiQueryInput) return;
  const text = (E.aiQueryInput.value || '').trim();
  const q = DSL.parse(text || '');
  const matches = [];
  DataStore.rows.forEach(issue => {
    const meta = DataStore.computed.get(issue.id) || {};
    if (DSL.matches(issue, meta, q)) matches.push({ issue, meta });
  });
  if (!matches.length) {
    UI.toast('No results to export.');
    return;
  }

  const header = [
    'ID',
    'Module',
    'Title',
    'Priority',
    'Status',
    'Date',
    'Risk',
    'Severity',
    'Impact',
    'Urgency'
  ];
  const lines = [header.join(',')];
  matches.forEach(({ issue, meta }) => {
    const r = meta.risk || {};
    const row = [
      issue.id,
      issue.module,
      issue.title,
      issue.priority,
      issue.status,
      issue.date,
      r.total ?? '',
      r.severity ?? '',
      r.impact ?? '',
      r.urgency ?? ''
    ].map(v =>
      typeof v === 'string'
        ? `"${v.replace(/"/g, '""')}"`
        : v
    );
    lines.push(row.join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ai_query_results.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* =========================================================
   Shared refresh helper
   ========================================================= */

UI.refreshAll = function () {
  const list = UI.Issues.applyFilters();
  UI.Issues.renderKPIs(list);
  UI.Issues.renderTable(list);
  UI.Issues.renderCharts(list);
  UI.Issues.renderSummary(list);
  UI.Issues.renderFilterChips();
  Analytics.refreshAll();
};

/* =========================================================
   Theme / layout / misc UI wiring
   ========================================================= */

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('theme-dark');
    root.classList.remove('theme-light');
  } else if (theme === 'light') {
    root.classList.add('theme-light');
    root.classList.remove('theme-dark');
  } else {
    root.classList.remove('theme-light', 'theme-dark');
  }
}

function initTheme() {
  const stored = localStorage.getItem(LS_KEYS.theme) || 'system';
  applyTheme(stored);
  if (E.themeSelect) E.themeSelect.value = stored;
}

function initAccent() {
  const stored = localStorage.getItem(LS_KEYS.accentColorStorage);
  if (stored) {
    document.documentElement.style.setProperty('--accent', stored);
    if (E.accentColor) E.accentColor.value = stored;
  }
}

function updateOnlineStatus() {
  if (!E.onlineStatusChip) return;
  const online = navigator.onLine;
  E.onlineStatusChip.textContent = online ? 'Online' : 'Offline';
  E.onlineStatusChip.classList.toggle('offline', !online);
}

/* =========================================================
   Event listeners / bootstrap
   ========================================================= */

function initEventListeners() {
  // Filters
  if (E.searchInput) {
    E.searchInput.value = Filters.state.search || '';
    E.searchInput.addEventListener('input', () => {
      Filters.state.search = E.searchInput.value;
      Filters.save();
      UI.refreshAll();
    });
  }
  if (E.moduleFilter) {
    E.moduleFilter.value = Filters.state.module || 'All';
    E.moduleFilter.addEventListener('change', () => {
      Filters.state.module = E.moduleFilter.value;
      Filters.save();
      UI.refreshAll();
    });
  }
  if (E.priorityFilter) {
    E.priorityFilter.value = Filters.state.priority || 'All';
    E.priorityFilter.addEventListener('change', () => {
      Filters.state.priority = E.priorityFilter.value;
      Filters.save();
      UI.refreshAll();
    });
  }
  if (E.statusFilter) {
    E.statusFilter.value = Filters.state.status || 'All';
    E.statusFilter.addEventListener('change', () => {
      Filters.state.status = E.statusFilter.value;
      Filters.save();
      UI.refreshAll();
    });
  }
  if (E.startDateFilter) {
    E.startDateFilter.value = Filters.state.start || '';
    E.startDateFilter.addEventListener('change', () => {
      Filters.state.start = E.startDateFilter.value;
      Filters.save();
      UI.refreshAll();
    });
  }
  if (E.endDateFilter) {
    E.endDateFilter.value = Filters.state.end || '';
    E.endDateFilter.addEventListener('change', () => {
      Filters.state.end = E.endDateFilter.value;
      Filters.save();
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
      UI.refreshAll();
    });
  }

  // Pagination
  if (E.pageSize) {
    E.pageSize.value = String(GridState.pageSize || 20);
    E.pageSize.addEventListener('change', () => {
      const sz = parseInt(E.pageSize.value, 10) || 20;
      GridState.pageSize = sz;
      localStorage.setItem(LS_KEYS.pageSize, String(sz));
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.firstPage)
    E.firstPage.addEventListener('click', () => {
      GridState.page = 1;
      UI.refreshAll();
    });
  if (E.prevPage)
    E.prevPage.addEventListener('click', () => {
      GridState.page = Math.max(1, GridState.page - 1);
      UI.refreshAll();
    });
  if (E.nextPage)
    E.nextPage.addEventListener('click', () => {
      GridState.page += 1;
      UI.refreshAll();
    });
  if (E.lastPage)
    E.lastPage.addEventListener('click', () => {
      // we don't know pages here; refreshAll will clamp
      GridState.page = 9999;
      UI.refreshAll();
    });

  // Sorting
  const thead = document.querySelector('#issuesTable thead');
  if (thead) {
    thead.addEventListener('click', e => {
      const th = e.target.closest('th[data-key]');
      if (!th) return;
      const key = th.getAttribute('data-key');
      if (!key) return;
      if (GridState.sortKey === key) {
        GridState.sortAsc = !GridState.sortAsc;
      } else {
        GridState.sortKey = key;
        GridState.sortAsc = true;
      }
      UI.refreshAll();
    });
  }

  // Theme & accent
  if (E.themeSelect) {
    E.themeSelect.addEventListener('change', () => {
      const value = E.themeSelect.value || 'system';
      localStorage.setItem(LS_KEYS.theme, value);
      applyTheme(value);
    });
  }
  if (E.accentColor) {
    E.accentColor.addEventListener('input', () => {
      const v = E.accentColor.value;
      if (!v) return;
      document.documentElement.style.setProperty('--accent', v);
      localStorage.setItem(LS_KEYS.accentColorStorage, v);
    });
  }

  // Tabs
  if (E.issuesTab && E.calendarTab && E.insightsTab) {
    const showView = view => {
      if (!E.issuesView || !E.calendarView || !E.insightsView) return;
      E.issuesView.style.display = view === 'issues' ? '' : 'none';
      E.calendarView.style.display = view === 'calendar' ? '' : 'none';
      E.insightsView.style.display = view === 'insights' ? '' : 'none';

      E.issuesTab.classList.toggle('active', view === 'issues');
      E.calendarTab.classList.toggle('active', view === 'calendar');
      E.insightsTab.classList.toggle('active', view === 'insights');

      localStorage.setItem(LS_KEYS.view, view);
    };

    const lastView = localStorage.getItem(LS_KEYS.view) || 'issues';
    showView(lastView);

    E.issuesTab.addEventListener('click', () => showView('issues'));
    E.calendarTab.addEventListener('click', () => showView('calendar'));
    E.insightsTab.addEventListener('click', () => showView('insights'));
  }

  // Drawer
  if (E.drawerBtn && E.sidebar) {
    E.drawerBtn.addEventListener('click', () => {
      E.sidebar.classList.toggle('open');
    });
  }

  // Shortcuts help (simple)
  if (E.shortcutsHelp) {
    E.shortcutsHelp.addEventListener('click', () => {
      alert(
        [
          'Keyboard shortcuts:',
          '  / – focus search',
          '  i – Issues tab',
          '  c – Calendar tab',
          '  a – AI / Insights tab'
        ].join('\n')
      );
    });
  }

  // Create ticket (wire your own form URL here if needed)
  if (E.createTicketBtn) {
    E.createTicketBtn.addEventListener('click', () => {
      UI.toast('Wire this button to your ticket form URL.');
    });
  }

  // Refresh buttons
  if (E.refreshNow) {
    E.refreshNow.addEventListener('click', () => {
      loadIssues(true);
      loadEvents(true);
    });
  }

  if (E.exportCsv) {
    E.exportCsv.addEventListener('click', () => {
      const list = UI.Issues.applyFilters();
      if (!list.length) {
        UI.toast('No rows to export.');
        return;
      }
      const header = [
        'ID',
        'Module',
        'Title',
        'Priority',
        'Status',
        'Type',
        'Date',
        'Log',
        'File'
      ];
      const lines = [header.join(',')];
      list.forEach(r => {
        const row = [
          r.id,
          r.module,
          r.title,
          r.priority,
          r.status,
          r.type,
          r.date,
          r.log,
          r.file
        ].map(v =>
          typeof v === 'string'
            ? `"${v.replace(/"/g, '""')}"`
            : v
        );
        lines.push(row.join(','));
      });
      const blob = new Blob([lines.join('\n')], {
        type: 'text/csv;charset=utf-8;'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'issues_export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Modals close actions
  if (E.modalClose) {
    E.modalClose.addEventListener('click', () => UI.Modals.closeIssue());
  }
  if (E.issueModal) {
    E.issueModal.addEventListener('click', e => {
      if (e.target === E.issueModal) UI.Modals.closeIssue();
    });
  }

  if (E.eventModalClose) {
    E.eventModalClose.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventCancel) {
    E.eventCancel.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventModal) {
    E.eventModal.addEventListener('click', e => {
      if (e.target === E.eventModal) UI.Modals.closeEvent();
    });
  }

  if (E.addEventBtn) {
    E.addEventBtn.addEventListener('click', () => UI.Modals.newEvent());
  }

  if (E.eventForm) {
    E.eventForm.addEventListener('submit', e => {
      e.preventDefault();
      const id = UI.Modals.currentEventId;
      const ev = {
        id: id || undefined,
        title: E.eventTitle.value.trim(),
        type: E.eventType.value,
        issueId: E.eventIssueId.value.trim() || '',
        env: E.eventEnv.value,
        owner: E.eventOwner.value.trim(),
        status: E.eventStatus.value,
        impactType: E.eventImpactType.value.trim(),
        allDay: !!E.eventAllDay.checked,
        modules: normalizeModules(E.eventModules.value),
        description: E.eventDescription.value.trim(),
        start: E.eventStart.value
          ? new Date(E.eventStart.value).toISOString()
          : '',
        end: E.eventEnd.value
          ? new Date(E.eventEnd.value).toISOString()
          : ''
      };
      UI.Modals.closeEvent();
      saveEventToSheet(ev);
    });
  }

  if (E.eventDelete) {
    E.eventDelete.addEventListener('click', () => {
      if (!UI.Modals.currentEventId) return;
      if (!confirm('Delete this event?')) return;
      const id = UI.Modals.currentEventId;
      UI.Modals.closeEvent();
      deleteEventFromSheet(id);
    });
  }

  // Release planner
  if (E.plannerRun) {
    E.plannerRun.addEventListener('click', () => UI.ReleasePlanner.run());
  }
  if (E.plannerAssignBtn) {
    E.plannerAssignBtn.addEventListener('click', () =>
      UI.ReleasePlanner.assignSelectedToEvent()
    );
  }

  // AI query
  if (E.aiQueryRun) {
    E.aiQueryRun.addEventListener('click', () => runAiQuery());
  }
  if (E.aiQueryApplyFilters) {
    E.aiQueryApplyFilters.addEventListener('click', () =>
      applyAiQueryAsFilters()
    );
  }
  if (E.aiQueryExport) {
    E.aiQueryExport.addEventListener('click', () => exportAiQueryResults());
  }

  // Calendar TZ switch
  if (E.calendarTz) {
    E.calendarTz.addEventListener('change', () => {
      renderCalendarEvents(getFilteredEvents());
    });
  }

  // Online/offline
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === '/') {
      if (E.searchInput) {
        e.preventDefault();
        E.searchInput.focus();
      }
    } else if (e.key === 'i') {
      if (E.issuesTab) E.issuesTab.click();
    } else if (e.key === 'c') {
      if (E.calendarTab) E.calendarTab.click();
    } else if (e.key === 'a') {
      if (E.insightsTab) E.insightsTab.click();
    }
  });
}

/* =========================================================
   Bootstrap
   ========================================================= */

async function bootstrap() {
  cacheEls();
  Filters.load();
  initTheme();
  initAccent();
  updateOnlineStatus();
  initEventListeners();

  // Load issues & events
  await loadIssues(false);
  await loadEvents(false);
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap();
});

