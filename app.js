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
    statusBoosts: { 'on stage': 2, 'under': 1 },
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
      gulf: [5, 6],       // Fri, Sat
      levant: [5],        // Fri
      northafrica: [5]    // Fri
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
    String(s).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m])),
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
      .filter(r => r.id && r.id.trim() !== "");
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
    const basePriority = CONFIG.RISK.priorityWeight[issue.priority || ""] || 1;

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
  computeBugPressure(modules, horizonDays) {
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
    const bugRisk = Math.max(0, Math.min(6, normalized));
    return { raw: sum, risk: bugRisk };
  },
  bugLabel(risk) {
    if (risk <= 1.5) return 'light recent bug history';
    if (risk <= 3.5) return 'moderate bug pressure';
    return 'heavy bug pressure';
  },
  computeBombBugRisk(modules, description) {
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
    const bombRisk = Math.max(0, Math.min(6, normalized));

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
        /holiday|eid|ramadan|ramadhan|ramzan|iftar|suhoor|ashura|national day|founding day/i.test(title) ||
        /holiday|public holiday/i.test(impact);

      const evEnv = (ev.env || 'Prod');

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
    const { region, env, modules, releaseType, bugRisk, bombBugRisk } = ctx;
    const rushRisk = this.computeRushScore(region, date);
    const envRisk = this.envWeight[env] ?? 1;
    const typeRisk = this.releaseTypeWeight[releaseType] ?? 2;

    const { penalty: eventsRisk, count: eventCount, holidayCount } =
      this.computeEventsPenalty(date, env, modules, region);

    const bombRisk = bombBugRisk || 0;

    // Total risk for this slot
    const totalRisk = rushRisk + bugRisk + envRisk + typeRisk + eventsRisk + bombRisk;
    const safetyScore = Math.max(0, 20 - totalRisk);

    return {
      totalRisk,
      safetyScore,
      rushRisk,
      bugRisk,
      bombRisk,
      envRisk,
      typeRisk,
      eventsRisk,
      eventCount,
      holidayCount
    };
  },
  riskBucket(totalRisk) {
    if (totalRisk <= 7) return { label: 'Low', className: 'planner-score-low' };
    if (totalRisk <= 12) return { label: 'Medium', className: 'planner-score-med' };
    return { label: 'High', className: 'planner-score-high' };
  },
  suggestSlots({ region, env, modules, horizonDays, releaseType, description, slotsPerDay }) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const bug = this.computeBugPressure(modules, horizonDays || 7);
    const bomb = this.computeBombBugRisk(modules, description || '');

    const slots = [];
    const hoursProd = [6, 10, 15, 23]; // Prod: pre-service + between services + late
    const hoursNonProd = [10, 15, 18]; // Staging/Dev can tolerate slightly busier times
    const hours = env === 'Prod' ? hoursProd : hoursNonProd;

    const horizon = Math.max(1, horizonDays || 7);

    for (let dayOffset = 0; dayOffset < horizon; dayOffset++) {
      const base = U.dateAddDays(startOfToday, dayOffset);
      hours.forEach(h => {
        const dt = new Date(base.getTime());
        dt.setHours(h, 0, 0, 0);
        if (dt <= now) return;

        const score = this.computeSlotScore(dt, {
          region,
          env,
          modules,
          releaseType,
          bugRisk: bug.risk,
          bombBugRisk: bomb.risk
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

    return { bug, bomb, slots: slots.slice(0, maxSlots) };
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

/** Analytics (AI tab) */
const Analytics = {
  _debounce: null,
  refresh(list) {
    clearTimeout(this._debounce);
    UI.setAnalyzing(true);
    this._debounce = setTimeout(() => this._render(list), 80);
  },
  _render(list) {
    // Top terms recent
    const recentCut = CONFIG.TREND_DAYS_RECENT;
    const recent = list.filter(r => U.isBetween(r.date, U.daysAgo(recentCut), null));
    const termCounts = new Map();
    recent.forEach(r => {
      const t = DataStore.computed.get(r.id)?.tokens || new Set();
      t.forEach(w => termCounts.set(w, (termCounts.get(w) || 0) + 1));
    });
    const topTerms = Array.from(termCounts.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    E.aiPatternsList.innerHTML = topTerms.length
      ? topTerms
          .map(
            ([t, c]) =>
              `<li><strong>${U.escapeHtml(t)}</strong> – ${c}</li>`
          )
          .join('')
      : '<li>No strong repeated terms recently.</li>';

    // Suggested categories frequency
    const catCount = new Map();
    list.forEach(r => {
      const cats = DataStore.computed.get(r.id)?.suggestions?.categories || [];
      cats.forEach(c => catCount.set(c.label, (catCount.get(c.label) || 0) + 1));
    });
    const topCats = Array.from(catCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    E.aiLabelsList.innerHTML = topCats.length
      ? topCats
          .map(
            ([l, n]) =>
              `<li><strong>${U.escapeHtml(l)}</strong> – ${n}</li>`
          )
          .join('')
      : '<li>No clear category suggestions yet.</li>';

    // Scope & signals
    E.aiScopeText.textContent = `Analyzing ${list.length} issues (${recent.length} recent, ~last ${recentCut} days).`;
    const signals = ['timeout', 'payments', 'billing', 'login', 'auth', 'error', 'crash'].filter(
      t => termCounts.has(t)
    );
    E.aiSignalsText.textContent = signals.length
      ? `Recent mentions: ${signals.join(', ')}.`
      : 'No strong recurring signals.';

    // Trends
    const oldStart = U.daysAgo(CONFIG.TREND_DAYS_WINDOW),
      mid = U.daysAgo(CONFIG.TREND_DAYS_RECENT);
    const oldCounts = new Map(),
      newCounts = new Map();
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
      const a = oldCounts.get(t) || 0,
        b = newCounts.get(t) || 0;
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
    E.aiTrendsList.innerHTML = trend.length
      ? trend
          .slice(0, 8)
          .map(
            o =>
              `<li><strong>${U.escapeHtml(o.t)}</strong> – ${o.new} vs ${o.old} <span class="muted">(Δ ${
                o.delta >= 0 ? `+${o.delta}` : o.delta
              })</span></li>`
          )
          .join('')
      : '<li>No strong increases.</li>';

    // Incidents
    const incidentWords = ['incident', 'outage', 'p0', 'p1', 'major', 'sla'];
    const incidents = list
      .filter(r => {
        const txt = [r.title, r.desc, r.log].filter(Boolean).join(' ').toLowerCase();
        return incidentWords.some(w => txt.includes(w));
      })
      .slice(0, 10);
    E.aiIncidentsList.innerHTML = incidents.length
      ? incidents
          .map(
            r => `
      <li><button class="btn sm" data-open="${U.escapeAttr(
        r.id
      )}">${U.escapeHtml(r.id)}</button> ${U.escapeHtml(r.title || '')}</li>
    `
          )
          .join('')
      : '<li>No incident-like issues detected.</li>';

    // Emerging vs stable
    const emerg = trend.slice(0, 5).map(t => t.t);
    const stable = topTerms
      .filter(([t]) => !emerg.includes(t))
      .slice(0, 5)
      .map(([t]) => t);
    E.aiEmergingStable.innerHTML = `
      <li><strong>Emerging:</strong> ${
        emerg.length ? emerg.map(x => U.escapeHtml(x)).join(', ') : '—'
      }</li>
      <li><strong>Stable:</strong> ${
        stable.length ? stable.map(x => U.escapeHtml(x)).join(', ') : '—'
      }</li>
    `;

    // Ops cockpit
    const misaligned = list.filter(r => {
      const meta = DataStore.computed.get(r.id);
      if (!meta) return false;
      const gap = prioGap(meta.suggestions?.priority, r.priority);
      return gap >= CONFIG.RISK.misalignedDelta;
    });
    const missingPriority = list.filter(r => !r.priority);
    const missingModule = list.filter(r => !r.module || r.module === 'Unspecified');
    const staleHigh = list.filter(r => {
      const meta = DataStore.computed.get(r.id);
      if (!meta) return false;
      const risk = meta.risk?.total || 0;
      const old = U.daysAgo(CONFIG.RISK.staleDays);
      const st = (r.status || '').toLowerCase();
      return (
        risk >= CONFIG.RISK.highRisk &&
        U.isBetween(r.date, null, old) &&
        !(st.startsWith('resolved') || st.startsWith('rejected'))
      );
    });
    E.aiOpsCockpit.innerHTML = `
      <li>Untagged issues (missing category/type): ${
        list.filter(r => !r.type).length
      }</li>
      <li>Missing priority: ${missingPriority.length}</li>
      <li>Missing module: ${missingModule.length}</li>
      <li>Misaligned priority: ${misaligned.length}</li>
      <li>Stale high-risk (&gt;=${CONFIG.RISK.highRisk}) &gt; ${
      CONFIG.RISK.staleDays
    }d: ${staleHigh.length}</li>
    `;

    // Module insights
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
        if (!st.startsWith('resolved') && !st.startsWith('rejected')) {
          m.open++;
          if (r.priority === 'High') m.high++;
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
        </tr>
      `;
          })
          .join('')
      : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No modules.</td></tr>';

    // Top risks
    const topRisks = recent
      .map(r => ({ r, score: DataStore.computed.get(r.id)?.risk?.total || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .filter(x => x.score > 2);
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

    // Clusters
    const clusters = buildClustersWeighted(list);
    E.aiClusters.innerHTML = clusters.length
      ? clusters
          .map(
            c => `
      <div class="card" style="padding:10px;">
        <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">
          Pattern: <strong>${U.escapeHtml(c.signature || '(no pattern)')}</strong> • ${
              c.issues.length
            } issues
        </div>
        <ul style="margin:0;padding-left:18px;font-size:13px;">
          ${c.issues
            .slice(0, 5)
            .map(
              i => `
            <li><button class="btn sm" style="padding:3px 6px;margin-right:4px;" data-open="${U.escapeAttr(
              i.id
            )}">${U.escapeHtml(i.id)}</button> ${U.escapeHtml(i.title || '')}</li>
          `
            )
            .join('')}
          ${
            c.issues.length > 5
              ? `<li class="muted">+ ${c.issues.length - 5} more…</li>`
              : ''
          }
        </ul>
      </div>
    `
          )
          .join('')
      : '<div class="muted">No similar issue groups ≥2.</div>';

    // Triage queue
    const tri = list
      .filter(r => {
        const meta = DataStore.computed.get(r.id) || {};
        const missing =
          !r.priority || !r.module || r.module === 'Unspecified' || !r.type;
        const gap = prioGap(meta.suggestions?.priority, r.priority);
        return missing || gap >= CONFIG.RISK.misalignedDelta;
      })
      .sort(
        (a, b) =>
          (DataStore.computed.get(b.id)?.risk?.total || 0) -
          (DataStore.computed.get(a.id)?.risk?.total || 0)
      )
      .slice(0, 15);
    E.aiTriageList.innerHTML = tri.length
      ? tri
          .map(i => {
            const meta = DataStore.computed.get(i.id) || {};
            const miss = [];
            if (!i.priority) miss.push('priority');
            if (!i.module || i.module === 'Unspecified') miss.push('module');
            if (!i.type) miss.push('type');
            const cats =
              (meta.suggestions?.categories || [])
                .slice(0, 2)
                .map(c => c.label)
                .join(', ') || 'n/a';
            const note = `Suggested priority: ${
              meta.suggestions?.priority || '-'
            }; categories: ${cats}`;
            return `<li style="margin-bottom:6px;">
        <strong>${U.escapeHtml(i.id)}</strong> — ${U.escapeHtml(i.title || '')}
        <div class="muted">Missing: ${
          miss.join(', ') || '—'
        } · ${U.escapeHtml(note)}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn sm" data-open="${U.escapeAttr(i.id)}">Open</button>
          <button class="btn ghost sm" data-copy="${U.escapeAttr(
            i.id
          )}">Copy suggestion</button>
        </div>
      </li>`;
          })
          .join('')
      : '<li>No issues requiring triage.</li>';

    // Upcoming risky events
    const evs = computeEventsRisk(DataStore.rows, DataStore.events);
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

    // Wire AI buttons
    U.qAll('[data-open]').forEach(b =>
      b.addEventListener('click', () =>
        UI.Modals.openIssue(b.getAttribute('data-open'))
      )
    );
    U.qAll('[data-copy]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-copy');
        const r = DataStore.byId.get(id);
        const meta = DataStore.computed.get(id) || {};
        const text = `Issue ${r.id}
Title: ${r.title}
Suggested Priority: ${meta.suggestions?.priority}
Suggested Categories: ${(meta.suggestions?.categories || [])
          .map(c => c.label)
          .join(', ')}
Reasons: ${(meta.risk?.reasons || []).join(', ')}`;
        navigator.clipboard
          .writeText(text)
          .then(() => UI.toast('Suggestion copied'))
          .catch(() => UI.toast('Clipboard blocked'));
      })
    );

    UI.setAnalyzing(false);
  }
};

function buildClustersWeighted(list) {
  const max = Math.min(list.length, 400);
  const docs = list.slice(-max).map(r => {
    const meta = DataStore.computed.get(r.id) || {};
    return { issue: r, tokens: meta.tokens || new Set(), idf: meta.idf || new Map() };
  });
  const visited = new Set(),
    clusters = [];
  const wj = (A, IA, B, IB) => {
    let inter = 0,
      sumA = 0,
      sumB = 0;
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
      if (wj(base.tokens, base.idf, other.tokens, other.idf) >= 0.28) {
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
  return clusters.slice(0, 6);
}

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

    // Linked releases (events whose issueId list contains this ticket)
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
    E.modalBody.innerHTML = `
      <p><b>ID:</b> ${U.escapeHtml(r.id || '-')}</p>
      <p><b>Module:</b> ${U.escapeHtml(r.module || '-')}</p>
      <p><b>Priority:</b> ${U.escapeHtml(r.priority || '-')}</p>
      <p><b>Status:</b> ${U.escapeHtml(r.status || '-')}</p>
      <p><b>Date:</b> ${U.escapeHtml(r.date || '-')}</p>
      <p><b>Risk:</b> ${risk.total}
         <br><span class="muted">Tech ${risk.technical}, Biz ${risk.business}, Ops ${risk.operational}, Time ${risk.time}</span>
         <br><span class="muted">Severity ${risk.severity}, Impact ${risk.impact}, Urgency ${risk.urgency}</span>
         <br><span class="muted">${U.escapeHtml(reasons)}</span>
         </p>
      <p><b>Description:</b><br>${U.escapeHtml(r.desc || '-')}</p>
      <p><b>Log:</b><br>${U.escapeHtml(r.log || '-')}</p>
      ${
        r.file
          ? `<p><b>Attachment:</b> <a href="${U.escapeAttr(
              r.file
            )}" target="_blank" rel="noopener noreferrer">Open link</a></p>`
          : ''
      }
      <div style="margin-top:10px" class="muted">
        Suggested: priority <b>${U.escapeHtml(
          meta.suggestions?.priority || '-'
        )}</b>;
        categories: ${
          (meta.suggestions?.categories || [])
            .slice(0, 3)
            .map(c => U.escapeHtml(c.label))
            .join(', ') || '—'
        }.
      </div>
      ${linkedSection}
    `;
    E.issueModal.style.display = 'flex';
    E.copyId?.focus();
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
    if (E.eventModalTitle) E.eventModalTitle.textContent = isEdit ? 'Edit Event' : 'Add Event';
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
              const badgeClass = r
                ? CalendarLink.riskBadgeClass(r)
                : '';
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

          const remaining = uniqueIds.length - issues.length;
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
            }
          `;
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
      E.eventTitle?.focus();
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
  const first = focusables[0],
    last = focusables[focusables.length - 1];
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
let calendar = null,
  calendarReady = false;

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
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
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
  if (E.eventFilterOther && E.eventFilterOther.checked) activeTypes.add('Other');

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
        id: ev.id || 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2),
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
    // Ensure we always have a clean ID
    const evId =
      event.id && String(event.id).trim()
        ? String(event.id).trim()
        : 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    // Normalize modules into an array of strings
    const modulesArr = Array.isArray(event.modules)
      ? event.modules
      : typeof event.modules === 'string'
      ? event.modules
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];

    // Canonical payload with ALL fields Apps Script expects
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

    console.log('[InCheck] sending event payload to Apps Script:', payload);

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
      // Make sure we keep notificationStatus from server if set
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
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
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

function renderPlannerResults(result, context) {
  if (!E.plannerResults) return;
  const { slots, bug, bomb } = result;
  const { env, modules, releaseType, horizonDays, region, description } = context;

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

  const intro = `
    <div style="margin-bottom:6px;">
      Top ${slots.length} suggested windows for a <strong>${U.escapeHtml(
        releaseType
      )}</strong> release on <strong>${U.escapeHtml(
    env
  )}</strong> touching <strong>${U.escapeHtml(
    modulesLabel
  )}</strong><br/>
      Horizon: next ${horizonDays} day(s), region profile: ${U.escapeHtml(regionLabel)}.<br/>
      <span class="muted">Recent bug pressure: ${U.escapeHtml(
        bugLabel
      )}. Historical &ldquo;bomb bug&rdquo; pattern: ${U.escapeHtml(
    bombLabel
  )}.</span>
    </div>
  `;

  let bombExamplesHtml = '';
  if (bomb.examples && bomb.examples.length) {
    const items = bomb.examples
      .map(ex => {
        const days = Math.round(ex.ageDays);
        return `<li><strong>${U.escapeHtml(ex.id)}</strong> — ${U.escapeHtml(
          ex.title || ''
        )} <span class="muted">(risk ${ex.risk}, ~${days}d old)</span></li>`;
      })
      .join('');
    bombExamplesHtml = `
      <div class="muted" style="font-size:11px;margin-bottom:4px;">
        Related historical incidents:
        <ul style="margin:4px 0 0 18px;padding:0;">
          ${items}
        </ul>
      </div>`;
  }

  const htmlSlots = slots
    .map((slot, idx) => {
      const d = slot.start;
      const dateStr = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
      const timeStr = d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });

      const bucket = ReleasePlanner.riskBucket(slot.totalRisk);
      const rushLabel = ReleasePlanner.rushLabel(slot.rushRisk);
      const bugLabelPerSlot = ReleasePlanner.bugLabel(slot.bugRisk);
      const bombLabelPerSlot = ReleasePlanner.bombLabel(slot.bombRisk);
      const eventsLabelRaw = slot.eventCount
        ? `${slot.eventCount} overlapping change event(s)`
        : 'no overlapping change events';
      const holidayLabel = slot.holidayCount
        ? `${slot.holidayCount} holiday(s) in window`
        : 'no holidays in window';
      const eventsLabel = slot.holidayCount
        ? `${holidayLabel} · ${eventsLabelRaw}`
        : eventsLabelRaw;

      const safetyIndex = (slot.safetyScore / 20) * 100;
      const blastComment =
        bucket.label === 'Low'
          ? 'Low blast radius; safe default with rollback buffer.'
          : bucket.label === 'Medium'
          ? 'Medium blast radius; keep tight monitoring and rollback plan.'
          : 'High blast risk; only use with strict approvals and on-call coverage.';

      const startIso = d.toISOString();
      const endIso = slot.end.toISOString();

      return `
      <div class="planner-slot" data-index="${idx}">
        <div class="planner-slot-header">
          <span>#${idx + 1} · ${U.escapeHtml(dateStr)} · ${U.escapeHtml(timeStr)}</span>
          <span class="planner-slot-score ${bucket.className}">
            Risk ${slot.totalRisk.toFixed(1)} / 20 · ${bucket.label}
          </span>
        </div>
        <div class="planner-slot-meta">
          Rush: ${U.escapeHtml(rushLabel)} · Bugs: ${U.escapeHtml(
        bugLabelPerSlot
      )} · Bomb-bug: ${U.escapeHtml(
        bombLabelPerSlot
      )}<br/>Calendar: ${U.escapeHtml(
        eventsLabel
      )}<br/>Safety index: ${safetyIndex.toFixed(0)}%
        </div>
        <div class="planner-slot-meta">
          Expected effect on F&amp;B clients: ${U.escapeHtml(blastComment)}
        </div>
        <div class="planner-slot-meta">
          <button type="button"
                  class="btn sm"
                  data-add-release="${U.escapeAttr(startIso)}"
                  data-add-release-end="${U.escapeAttr(endIso)}">
            ➕ Add this window as Release event
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  E.plannerResults.innerHTML = `${intro}${bombExamplesHtml}${htmlSlots}`;

  if (E.plannerAddEvent) E.plannerAddEvent.disabled = !slots.length;

  // Wire per-slot "Add" buttons
  E.plannerResults.querySelectorAll('[data-add-release]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const startIso = btn.getAttribute('data-add-release');
      const endIso = btn.getAttribute('data-add-release-end');
      if (!startIso || !endIso) return;

      const startLocal = toLocalInputValue(new Date(startIso));
      const endLocal = toLocalInputValue(new Date(endIso));

      const modulesLabelLocal =
        modules && modules.length ? modules.join(', ') : 'General';

      const releaseDescription = (E.plannerDescription?.value || '').trim();

      const newEvent = {
        id: '',
        title: `Release – ${modulesLabelLocal} (${releaseType})`,
        type: 'Release',
        env: env,
        status: 'Planned',
        owner: '',
        modules: modules,
        impactType:
          env === 'Prod'
            ? 'High risk change'
            : 'Internal only',
        issueId: '',
        start: startLocal,
        end: endLocal,
        description:
          `Auto-scheduled by Release Planner. Region profile: ${regionLabel}. Modules: ${modulesLabelLocal}.` +
          (releaseDescription ? `\nRelease notes: ${releaseDescription}` : '') +
          `\nHeuristic risk index computed from F&B rush hours, bug history, holidays and existing calendar events.`,
        allDay: false,
        notificationStatus: ''
      };

      const saved = await saveEventToSheet(newEvent);
      if (!saved) {
        UI.toast('Could not save release event');
        return;
      }
      const idx = DataStore.events.findIndex(x => x.id === saved.id);
      if (idx === -1) DataStore.events.push(saved);
      else DataStore.events[idx] = saved;
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
    });
  });
}

function refreshPlannerTickets(currentList) {
  if (!E.plannerTickets) return;
  const list = currentList || UI.Issues.applyFilters();

  if (!list.length) {
    E.plannerTickets.innerHTML =
      '<option disabled>No tickets match the current filters</option>';
    return;
  }

  const max = 250;
  const subset = list.slice(0, max);

  E.plannerTickets.innerHTML = subset
    .map(r => {
      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      const label = `[${r.priority || '-'} | R${risk}] ${r.id} — ${
        r.title || ''
      }`.slice(0, 140);
      return `<option value="${U.escapeAttr(r.id)}">${U.escapeHtml(label)}</option>`;
    })
    .join('');
}

function refreshPlannerReleasePlans(context) {
  if (!E.plannerReleasePlan) return;
  const env = context?.env || (E.plannerEnv?.value || '');
  const horizonDays =
    context?.horizonDays ||
    parseInt(E.plannerHorizon?.value || '7', 10) ||
    7;

  const now = new Date();
  const horizonEnd = U.dateAddDays(now, horizonDays);

  const releaseEvents = (DataStore.events || []).filter(ev => {
    const type = (ev.type || '').toLowerCase();
    if (type !== 'release') return false;
    if (!ev.start) return false;
    const d = new Date(ev.start);
    if (isNaN(d)) return false;
    if (d < now) return false;
    if (d > horizonEnd) return false;

    const evEnv = ev.env || 'Prod';
    if (env && env !== 'Other' && evEnv && evEnv !== env) return false;

    return true;
  });

  releaseEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

  if (!releaseEvents.length) {
    E.plannerReleasePlan.innerHTML =
      '<option value="">No Release events in horizon</option>';
    return;
  }

  const options = releaseEvents
    .map(ev => {
      const d = ev.start ? new Date(ev.start) : null;
      const when = d && !isNaN(d)
        ? d.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '(no date)';
      const label = `[${when}] ${ev.title || 'Release'} (${ev.env || 'Prod'})`;
      return `<option value="${U.escapeAttr(ev.id)}">${U.escapeHtml(label)}</option>`;
    })
    .join('');

  E.plannerReleasePlan.innerHTML =
    '<option value="">Select a Release event…</option>' + options;
}

function wirePlanner() {
  if (!E.plannerRun) return;

  E.plannerRun.addEventListener('click', () => {
    if (!DataStore.rows.length) {
      UI.toast('Issues are still loading. Try again in a few seconds.');
      return;
    }

    const regionValue = (E.plannerRegion?.value || 'gulf').toLowerCase();
    const region = ReleasePlanner.regionKey(regionValue);

    const env = E.plannerEnv?.value || 'Prod';
    const modulesStr = (E.plannerModules?.value || '').trim();
    const modules = modulesStr
      ? modulesStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    const horizonDays =
      parseInt(E.plannerHorizon?.value || '7', 10) || 7;
    const releaseTypeValue =
      (E.plannerReleaseType?.value || 'feature').toLowerCase();
    const releaseType =
      releaseTypeValue === 'major' || releaseTypeValue === 'minor'
        ? releaseTypeValue
        : 'feature';
    const slotsPerDay =
      parseInt(E.plannerSlotsPerDay?.value || '4', 10) || 4;
    const description = (E.plannerDescription?.value || '').trim();

    const context = {
      region,
      env,
      modules,
      releaseType,
      horizonDays,
      slotsPerDay,
      description
    };

    const result = ReleasePlanner.suggestSlots(context);

    LAST_PLANNER_CONTEXT = context;
    LAST_PLANNER_RESULT = result;
    renderPlannerResults(result, context);
    refreshPlannerReleasePlans(context);
  });

  if (E.plannerAddEvent) {
    E.plannerAddEvent.addEventListener('click', async () => {
      if (!LAST_PLANNER_CONTEXT || !LAST_PLANNER_RESULT || !LAST_PLANNER_RESULT.slots.length) {
        UI.toast('Run the planner first to get suggestions.');
        return;
      }
      const context = LAST_PLANNER_CONTEXT;
      const slot = LAST_PLANNER_RESULT.slots[0];

      const startIso = slot.start.toISOString();
      const endIso = slot.end.toISOString();
      const startLocal = toLocalInputValue(new Date(startIso));
      const endLocal = toLocalInputValue(new Date(endIso));

      const regionLabel =
        context.region === 'gulf'
          ? 'Gulf (KSA / UAE / Qatar)'
          : context.region === 'levant'
          ? 'Levant'
          : 'North Africa';

      const modulesLabelLocal =
        context.modules && context.modules.length
          ? context.modules.join(', ')
          : 'General';
      const releaseDescription = (E.plannerDescription?.value || '').trim();

      const newEvent = {
        id: '',
        title: `Release – ${modulesLabelLocal} (${context.releaseType})`,
        type: 'Release',
        env: context.env,
        status: 'Planned',
        owner: '',
        modules: context.modules,
        impactType:
          context.env === 'Prod'
            ? 'High risk change'
            : 'Internal only',
        issueId: '',
        start: startLocal,
        end: endLocal,
        description:
          `Auto-scheduled by Release Planner (top suggestion). Region profile: ${regionLabel}. Modules: ${modulesLabelLocal}.` +
          (releaseDescription ? `\nRelease notes: ${releaseDescription}` : '') +
          `\nHeuristic risk index computed from F&B rush hours, bug history, holidays and existing calendar events.`,
        allDay: false,
        notificationStatus: ''
      };

      const saved = await saveEventToSheet(newEvent);
      if (!saved) {
        UI.toast('Could not save release event');
        return;
      }
      const idx = DataStore.events.findIndex(x => x.id === saved.id);
      if (idx === -1) DataStore.events.push(saved);
      else DataStore.events[idx] = saved;
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans(context);
      Analytics.refresh(UI.Issues.applyFilters());
    });
  }

  if (E.plannerEnv) {
    E.plannerEnv.addEventListener('change', () => {
      refreshPlannerReleasePlans();
    });
  }
  if (E.plannerHorizon) {
    E.plannerHorizon.addEventListener('change', () => {
      refreshPlannerReleasePlans();
    });
  }

  if (E.plannerAssignBtn) {
    E.plannerAssignBtn.addEventListener('click', async () => {
      const planId = E.plannerReleasePlan?.value || '';
      if (!planId) {
        UI.toast('Select a Release event first.');
        return;
      }
      const options = Array.from(E.plannerTickets?.selectedOptions || []);
      const ticketIds = options.map(o => o.value).filter(Boolean);
      if (!ticketIds.length) {
        UI.toast('Select at least one ticket to assign.');
        return;
      }

      const idx = DataStore.events.findIndex(ev => ev.id === planId);
      if (idx === -1) {
        UI.toast('Selected Release event not found. Try refreshing events.');
        return;
      }

      const ev = DataStore.events[idx];
      const existing = (ev.issueId || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...existing, ...ticketIds]));

      const updatedEvent = {
        ...ev,
        issueId: merged.join(', ')
      };

      const saved = await saveEventToSheet(updatedEvent);
      if (!saved) {
        UI.toast('Could not assign tickets to Release event.');
        return;
      }

      DataStore.events[idx] = saved;
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());

      UI.toast(
        `Assigned ${ticketIds.length} ticket${ticketIds.length > 1 ? 's' : ''} to the Release plan.`
      );
    });
  }
}

/* ---------- Misc wiring ---------- */
function setIfOptionExists(select, value) {
  if (!select || !value) return;
  const options = Array.from(select.options || []);
  if (options.some(o => o.value === value)) select.value = value;
}

function wireCore() {
  [E.issuesTab, E.calendarTab, E.insightsTab].forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => setActiveView(btn.dataset.view));
  });

  if (E.drawerBtn)
    E.drawerBtn.addEventListener('click', () => {
      const open = !E.sidebar.classList.contains('open');
      E.sidebar.classList.toggle('open');
      E.drawerBtn.setAttribute('aria-expanded', String(open));
    });

  if (E.searchInput)
    E.searchInput.addEventListener(
      'input',
      debounce(() => {
        Filters.state.search = E.searchInput.value || '';
        Filters.save();
        UI.refreshAll();
      }, 250)
    );

  if (E.refreshNow)
    E.refreshNow.addEventListener('click', () => {
      loadIssues(true);
      loadEvents(true);
    });
  if (E.exportCsv) E.exportCsv.addEventListener('click', exportFilteredCsv);
  if (E.createTicketBtn)
    E.createTicketBtn.addEventListener('click', () =>
      window.open(
        'https://forms.gle/PPnEP1AQneoBT79s5',
        '_blank',
        'noopener,noreferrer'
      )
    );

  if (E.shortcutsHelp) {
    E.shortcutsHelp.addEventListener('click', () => {
      UI.toast('Shortcuts: 1/2/3 switch tabs · / focus search · Ctrl+K AI query');
    });
  }

  UI.refreshAll = () => {
    const list = UI.Issues.applyFilters();
    UI.Issues.renderSummary(list);
    UI.Issues.renderFilterChips();
    UI.Issues.renderKPIs(list);
    UI.Issues.renderTable(list);
    UI.Issues.renderCharts(list);
    refreshPlannerTickets(list);
    if (E.insightsView.classList.contains('active')) Analytics.refresh(list);
  };
}

function wireSorting() {
  U.qAll('#issuesTable thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (GridState.sortKey === key) GridState.sortAsc = !GridState.sortAsc;
      else {
        GridState.sortKey = key;
        GridState.sortAsc = true;
      }
      UI.refreshAll();
    });
    th.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        th.click();
      }
    });
    th.tabIndex = 0;
    th.setAttribute('role', 'button');
    th.setAttribute('aria-label', `Sort by ${th.textContent}`);
  });
}

function wirePaging() {
  if (E.pageSize)
    E.pageSize.addEventListener('change', () => {
      GridState.pageSize = +E.pageSize.value;
      localStorage.setItem(LS_KEYS.pageSize, GridState.pageSize);
      GridState.page = 1;
      UI.refreshAll();
    });
  if (E.firstPage)
    E.firstPage.addEventListener('click', () => {
      GridState.page = 1;
      UI.refreshAll();
    });
  if (E.prevPage)
    E.prevPage.addEventListener('click', () => {
      if (GridState.page > 1) {
        GridState.page--;
        UI.refreshAll();
      }
    });
  if (E.nextPage)
    E.nextPage.addEventListener('click', () => {
      const list = UI.Issues.applyFilters();
      const pages = Math.max(1, Math.ceil(list.length / GridState.pageSize));
      if (GridState.page < pages) {
        GridState.page++;
        UI.refreshAll();
      }
    });
  if (E.lastPage)
    E.lastPage.addEventListener('click', () => {
      const list = UI.Issues.applyFilters();
      GridState.page = Math.max(1, Math.ceil(list.length / GridState.pageSize));
      UI.refreshAll();
    });
}

function wireFilters() {
  if (E.moduleFilter) {
    E.moduleFilter.addEventListener('change', () => {
      Filters.state.module = E.moduleFilter.value;
      Filters.save();
      UI.refreshAll();
    });
  }
  if (E.priorityFilter) {
    E.priorityFilter.addEventListener('change', () => {
      Filters.state.priority = E.priorityFilter.value;
      Filters.save();
      UI.refreshAll();
    });
  }
  if (E.statusFilter) {
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
  if (E.searchInput) E.searchInput.value = Filters.state.search || '';

  if (E.resetBtn)
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
      if (E.startDateFilter) E.startDateFilter.value = '';
      if (E.endDateFilter) E.endDateFilter.value = '';
      UI.Issues.renderFilters();
      UI.refreshAll();
    });
}

function wireTheme() {
  const media = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const applySystem = () => {
    if (media?.matches) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
  };
  const saved = localStorage.getItem(LS_KEYS.theme) || 'system';
  if (E.themeSelect) E.themeSelect.value = saved;
  if (saved === 'system') applySystem();
  else if (saved === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', 'light');

  media?.addEventListener('change', () => {
    if ((localStorage.getItem(LS_KEYS.theme) || 'system') === 'system')
      applySystem();
  });

  if (E.themeSelect)
    E.themeSelect.addEventListener('change', () => {
      const v = E.themeSelect.value;
      localStorage.setItem(LS_KEYS.theme, v);
      if (v === 'system') applySystem();
      else if (v === 'dark') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', 'light');
    });

  if (E.accentColor) {
    const rootStyle = getComputedStyle(document.documentElement);
    const defaultAccent = rootStyle.getPropertyValue('--accent').trim() || '#4f8cff';
    const savedAccent =
      localStorage.getItem(LS_KEYS.accentColorStorage) || defaultAccent;
    E.accentColor.value = savedAccent;
    document.documentElement.style.setProperty('--accent', savedAccent);

    E.accentColor.addEventListener('input', () => {
      const val = E.accentColor.value || defaultAccent;
      document.documentElement.style.setProperty('--accent', val);
      try {
        localStorage.setItem(LS_KEYS.accentColorStorage, val);
      } catch {}
      UI.Issues.renderCharts(UI.Issues.applyFilters());
    });
  }
}

function wireConnectivity() {
  if (!E.onlineStatusChip) return;
  const update = () => {
    const online = navigator.onLine !== false;
    E.onlineStatusChip.textContent = online ? 'Online' : 'Offline · using cache';
    E.onlineStatusChip.classList.toggle('online', online);
    E.onlineStatusChip.classList.toggle('offline', !online);
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function wireModals() {
  // Issue modal
  if (E.modalClose) {
    E.modalClose.addEventListener('click', () => UI.Modals.closeIssue());
  }
  if (E.issueModal) {
    E.issueModal.addEventListener('click', e => {
      // click outside panel closes
      if (e.target === E.issueModal) UI.Modals.closeIssue();
    });
    E.issueModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        UI.Modals.closeIssue();
      } else if (e.key === 'Tab') {
        trapFocus(E.issueModal, e);
      }
    });
  }
  if (E.copyId) {
    E.copyId.addEventListener('click', () => {
      const r = UI.Modals.selectedIssue;
      if (!r || !r.id) return;
      navigator.clipboard
        .writeText(r.id)
        .then(() => UI.toast('Issue ID copied'))
        .catch(() => UI.toast('Clipboard blocked'));
    });
  }
  if (E.copyLink) {
    E.copyLink.addEventListener('click', () => {
      const r = UI.Modals.selectedIssue;
      if (!r) return;
      const base = window.location.href.split('#')[0];
      const link = `${base}?issue=${encodeURIComponent(r.id || '')}`;
      navigator.clipboard
        .writeText(link)
        .then(() => UI.toast('Shareable link copied'))
        .catch(() => UI.toast('Clipboard blocked'));
    });
  }

  // Event modal
  if (E.eventModalClose) {
    E.eventModalClose.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventCancel) {
    E.eventCancel.addEventListener('click', e => {
      e.preventDefault();
      UI.Modals.closeEvent();
    });
  }
  if (E.eventModal) {
    E.eventModal.addEventListener('click', e => {
      if (e.target === E.eventModal) UI.Modals.closeEvent();
    });
    E.eventModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        UI.Modals.closeEvent();
      } else if (e.key === 'Tab') {
        trapFocus(E.eventModal, e);
      }
    });
  }

  if (E.eventAllDay) {
    E.eventAllDay.addEventListener('change', () => {
      const allDay = E.eventAllDay.checked;
      if (E.eventStart) {
        const current = E.eventStart.value;
        E.eventStart.type = allDay ? 'date' : 'datetime-local';
        if (!current && allDay) {
          E.eventStart.value = toLocalDateValue(new Date());
        }
      }
      if (E.eventEnd) {
        const current = E.eventEnd.value;
        E.eventEnd.type = allDay ? 'date' : 'datetime-local';
        if (!current && allDay) {
          E.eventEnd.value = toLocalDateValue(new Date());
        }
      }
    });
  }

  if (E.eventForm) {
    E.eventForm.addEventListener('submit', async e => {
      e.preventDefault();
      const idAttr = E.eventForm.dataset.id || '';
      const isEdit = !!idAttr;

      const allDay = !!(E.eventAllDay && E.eventAllDay.checked);
      const title = (E.eventTitle?.value || '').trim();
      if (!title) {
        UI.toast('Title is required');
        return;
      }

      const type = E.eventType?.value || 'Deployment';
      const env = E.eventEnv?.value || 'Prod';
      const status = E.eventStatus?.value || 'Planned';
      const owner = (E.eventOwner?.value || '').trim();

      const modulesStr = (E.eventModules?.value || '').trim();
      const modulesArr = modulesStr
        ? modulesStr
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
        : [];

      const impactType = E.eventImpactType?.value || 'No downtime expected';
      const issueId = (E.eventIssueId?.value || '').trim();

      const startRaw = E.eventStart?.value || '';
      const endRaw = E.eventEnd?.value || '';

      const description = (E.eventDescription?.value || '').trim();

      const eventObj = {
        id: isEdit ? idAttr : '',
        title,
        type,
        env,
        status,
        owner,
        modules: modulesArr,
        impactType,
        issueId,
        start: startRaw,
        end: endRaw,
        description,
        allDay,
        notificationStatus: ''
      };

      const saved = await saveEventToSheet(eventObj);
      if (!saved) return;

      const idx = DataStore.events.findIndex(ev => ev.id === saved.id);
      if (idx === -1) DataStore.events.push(saved);
      else DataStore.events[idx] = saved;

      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
      UI.Modals.closeEvent();
    });
  }

  if (E.eventDelete) {
    E.eventDelete.addEventListener('click', async e => {
      e.preventDefault();
      if (!E.eventForm) return;
      const idAttr = E.eventForm.dataset.id || '';
      if (!idAttr) {
        UI.toast('Nothing to delete');
        return;
      }
      if (!confirm('Delete this event?')) return;
      const ok = await deleteEventFromSheet(idAttr);
      if (!ok) return;
      const idx = DataStore.events.findIndex(ev => ev.id === idAttr);
      if (idx !== -1) DataStore.events.splice(idx, 1);
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      UI.Modals.closeEvent();
      Analytics.refresh(UI.Issues.applyFilters());
    });
  }
}

/* ---------- AI DSL query wiring ---------- */

let LAST_DSL_RESULT_IDS = [];

function runDslQuery() {
  if (!E.aiQueryInput || !E.aiQueryResults) return;
  const raw = (E.aiQueryInput.value || '').trim();
  if (!raw) {
    UI.toast('Type a query, e.g. "status:open risk>=9 payments last:7d"');
    return;
  }

  if (!DataStore.rows.length) {
    UI.toast('Issues are still loading, try again in a few seconds.');
    return;
  }

  const q = DSL.parse(raw);
  const matches = DataStore.rows.filter(r =>
    DSL.matches(r, DataStore.computed.get(r.id) || {}, q)
  );

  LAST_DSL_RESULT_IDS = matches.map(r => r.id);

  if (!matches.length) {
    E.aiQueryResults.innerHTML =
      '<div class="muted">No issues match this query.</div>';
    return;
  }

  const max = 50;
  const subset = matches.slice(0, max);

  const chips = [];
  if (q.module) chips.push(`module:${q.module}`);
  if (q.priority) chips.push(`priority:${q.priority}`);
  if (q.status) chips.push(`status:${q.status}`);
  if (q.lastDays) chips.push(`last:${q.lastDays}d`);
  if (q.riskOp && q.riskVal != null) chips.push(`risk${q.riskOp}${q.riskVal}`);
  if (q.severityOp && q.severityVal != null)
    chips.push(`severity${q.severityOp}${q.severityVal}`);
  if (q.impactOp && q.impactVal != null)
    chips.push(`impact${q.impactOp}${q.impactVal}`);
  if (q.urgencyOp && q.urgencyVal != null)
    chips.push(`urgency${q.urgencyOp}${q.urgencyVal}`);
  if (q.cluster) chips.push(`cluster:${q.cluster}`);

  const summary = `
    <div style="margin-bottom:6px;">
      ${matches.length} issue${matches.length === 1 ? '' : 's'} match this query.
      ${
        matches.length > max
          ? `Showing first ${max}.`
          : ''
      }
      ${
        chips.length
          ? `<br><span class="muted">Parsed filters: ${chips
              .map(c => U.escapeHtml(c))
              .join(' · ')}</span>`
          : ''
      }
    </div>
  `;

  const rowsHtml = subset
    .map(r => {
      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      const badge = CalendarLink.riskBadgeClass(risk);
      return `
        <li class="ai-query-row">
          <button type="button" class="btn sm" data-open="${U.escapeAttr(
            r.id
          )}">${U.escapeHtml(r.id)}</button>
          <span class="muted">[${U.escapeHtml(r.priority || '-')} · ${U.escapeHtml(
        r.status || '-'
      )}]</span>
          <span> ${U.escapeHtml(r.title || '')}</span>
          ${
            risk
              ? `<span class="event-risk-badge ${badge}">RISK ${risk}</span>`
              : ''
          }
        </li>`;
    })
    .join('');

  E.aiQueryResults.innerHTML = `
    ${summary}
    <ul class="ai-query-list">
      ${rowsHtml}
    </ul>
  `;

  // Wire open buttons
  E.aiQueryResults.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-open');
      UI.Modals.openIssue(id);
    });
  });
}

function wireAIQuery() {
  if (!E.aiQueryInput) return;

  if (E.aiQueryRun) {
    E.aiQueryRun.addEventListener('click', () => {
      runDslQuery();
    });
  }

  E.aiQueryInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runDslQuery();
    }
  });

  if (E.aiQueryApplyFilters) {
    E.aiQueryApplyFilters.addEventListener('click', () => {
      if (!E.aiQueryInput) return;
      const raw = (E.aiQueryInput.value || '').trim();
      if (!raw) {
        UI.toast('Nothing to apply – query is empty.');
        return;
      }
      const q = DSL.parse(raw);

      // Map DSL → basic filters where possible
      if (q.module) Filters.state.module = 'All'; // default
      if (q.module) {
        // if exact module exists, select it
        const moduleVal = Array.from(DataStore.byModule.keys()).find(m =>
          (m || '').toLowerCase().includes(q.module)
        );
        if (moduleVal) Filters.state.module = moduleVal;
      }

      if (q.priority) {
        const p = q.priority[0]?.toUpperCase();
        if (p === 'H') Filters.state.priority = 'High';
        else if (p === 'M') Filters.state.priority = 'Medium';
        else if (p === 'L') Filters.state.priority = 'Low';
      }

      if (q.status && q.status !== 'open' && q.status !== 'closed') {
        const statusVal = Array.from(DataStore.byStatus.keys()).find(s =>
          (s || '').toLowerCase().includes(q.status)
        );
        if (statusVal) Filters.state.status = statusVal;
      }

      if (q.lastDays) {
        const from = U.daysAgo(q.lastDays);
        Filters.state.start = toLocalDateValue(from);
      }

      Filters.save();

      if (E.moduleFilter) setIfOptionExists(E.moduleFilter, Filters.state.module);
      if (E.priorityFilter) setIfOptionExists(E.priorityFilter, Filters.state.priority);
      if (E.statusFilter) setIfOptionExists(E.statusFilter, Filters.state.status);
      if (E.startDateFilter) E.startDateFilter.value = Filters.state.start || '';

      setActiveView('issues');
      UI.refreshAll();
      UI.toast('Applied query filters to Issues grid');
    });
  }

  if (E.aiQueryExport) {
    E.aiQueryExport.addEventListener('click', () => {
      if (!LAST_DSL_RESULT_IDS.length) {
        UI.toast('Run a query first before exporting.');
        return;
      }
      const rows = LAST_DSL_RESULT_IDS.map(id => DataStore.byId.get(id)).filter(Boolean);
      if (!rows.length) {
        UI.toast('No matching rows to export.');
        return;
      }
      exportIssuesToCsv(rows, 'ai_query');
    });
  }
}

/* ---------- Keyboard shortcuts ---------- */

function wireKeyboardShortcuts() {
  const isTypingTarget = el => {
    if (!el) return false;
    const tag = el.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      el.isContentEditable
    );
  };

  document.addEventListener('keydown', e => {
    const active = document.activeElement;
    const typing = isTypingTarget(active);

    // Escape closes modals
    if (e.key === 'Escape') {
      if (E.issueModal && E.issueModal.style.display === 'flex') {
        UI.Modals.closeIssue();
        return;
      }
      if (E.eventModal && E.eventModal.style.display === 'flex') {
        UI.Modals.closeEvent();
        return;
      }
    }

    // Do not steal shortcuts when typing, except Esc above
    if (typing) return;

    // Tab switching
    if (e.key === '1') {
      setActiveView('issues');
    } else if (e.key === '2') {
      setActiveView('calendar');
    } else if (e.key === '3') {
      setActiveView('insights');
    }

    // Focus search
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (E.searchInput) E.searchInput.focus();
    }

    // AI query focus: Ctrl+K / Cmd+K
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setActiveView('insights');
      if (E.aiQueryInput) {
        E.aiQueryInput.focus();
        E.aiQueryInput.select();
      }
    }
  });
}

/* ---------- Bootstrap ---------- */

document.addEventListener('DOMContentLoaded', () => {
  cacheEls();
  Filters.load();

  if (E.pageSize) {
    E.pageSize.value = String(GridState.pageSize || 20);
  }

  wireCore();
  wireSorting();
  wirePaging();
  wireFilters();
  wireTheme();
  wireConnectivity();
  wireModals();
  wireCalendar();
  wirePlanner();
  wireAIQuery();
  wireKeyboardShortcuts();

  const savedView = localStorage.getItem(LS_KEYS.view) || 'issues';
  setActiveView(savedView);

  loadIssues(false);
  loadEvents(false);
});
