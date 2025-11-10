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
/* =========================================================
   Events cache (optional, for offline fallback)
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

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const start =
    raw.start ||
    raw.startTime ||
    raw.start_date ||
    raw.startDate ||
    raw.startDateTime;
  const end =
    raw.end ||
    raw.endTime ||
    raw.end_date ||
    raw.endDate ||
    raw.endDateTime;

  return {
    id:
      raw.id ||
      raw.eventId ||
      raw.guid ||
      raw.uid ||
      ('ev-' + Math.random().toString(36).slice(2)),
    title: raw.title || raw.summary || raw.name || 'Untitled event',
    type: (raw.type || raw.category || 'other').toLowerCase(),
    env: raw.env || raw.environment || 'Prod',
    modules: raw.modules || raw.module || [],
    start,
    end,
    description: raw.description || raw.notes || '',
    owner: raw.owner || raw.createdBy || '',
    status: raw.status || '',
    impactType: raw.impactType || raw.impact || '',
    allDay: !!(raw.allDay || raw.allday)
  };
}

/* =========================================================
   Filtering, KPIs, table rendering
   ========================================================= */

function issueIsOpen(issue) {
  const st = (issue.status || '').toLowerCase();
  return !(st.startsWith('resolved') || st.startsWith('rejected'));
}

function getFilteredIssues() {
  const issues = DataStore.rows || [];
  if (!issues.length) return [];

  const state = Filters.state;
  const qText = (state.search || '').trim();
  const q = qText ? DSL.parse(qText) : null;

  return issues.filter(issue => {
    const meta = DataStore.computed.get(issue.id) || {};

    if (state.module && state.module !== 'All' && issue.module !== state.module) return false;
    if (state.priority && state.priority !== 'All' && issue.priority !== state.priority)
      return false;
    if (state.status && state.status !== 'All' && issue.status !== state.status) return false;

    if (state.start && !U.isBetween(issue.date, state.start, null)) return false;
    if (state.end && !U.isBetween(issue.date, null, state.end + 'T23:59:59')) return false;

    if (q && !DSL.matches(issue, meta, q)) return false;
    return true;
  });
}

function buildModuleFilterOptions() {
  if (!E.moduleFilter) return;
  const sel = E.moduleFilter;
  const prev = sel.value || 'All';
  const modules = Array.from(DataStore.byModule.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  sel.innerHTML =
    `<option value="All">All modules</option>` +
    modules.map(m => `<option value="${U.escapeAttr(m)}">${U.escapeHtml(m)}</option>`).join('');
  sel.value = modules.includes(prev) ? prev : 'All';
}

function renderKpis() {
  if (!E.kpis) return;

  const all = DataStore.rows || [];
  const filtered = getFilteredIssues();
  const openAll = all.filter(issueIsOpen);
  const openFiltered = filtered.filter(issueIsOpen);

  const highRiskOpen = openAll.filter(i => {
    const meta = DataStore.computed.get(i.id) || {};
    return (meta.risk?.total || 0) >= CONFIG.RISK.highRisk;
  });

  const critRiskOpen = openAll.filter(i => {
    const meta = DataStore.computed.get(i.id) || {};
    return (meta.risk?.total || 0) >= CONFIG.RISK.critRisk;
  });

  const recent = openAll.filter(i => U.isBetween(i.date, U.daysAgo(7), null));

  E.kpis.innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Open issues (filter / all)</div>
      <div class="kpi-value">${openFiltered.length} / ${openAll.length}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">High-risk open</div>
      <div class="kpi-value kpi-high">${highRiskOpen.length}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Critical open</div>
      <div class="kpi-value kpi-crit">${critRiskOpen.length}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">New in last 7 days</div>
      <div class="kpi-value">${recent.length}</div>
    </div>
  `;
}

function riskBadge(issue) {
  const meta = DataStore.computed.get(issue.id) || {};
  const r = meta.risk || {};
  const total = r.total || 0;
  const cls = CalendarLink.riskBadgeClass(total);
  return `<span class="risk-badge ${cls}">R${Math.round(total)}</span>`;
}

function renderActiveFilterChips() {
  if (!E.activeFiltersChips) return;
  const chips = [];
  const st = Filters.state;

  if (st.module && st.module !== 'All') chips.push(`Module: ${U.escapeHtml(st.module)}`);
  if (st.priority && st.priority !== 'All') chips.push(`Priority: ${U.escapeHtml(st.priority)}`);
  if (st.status && st.status !== 'All') chips.push(`Status: ${U.escapeHtml(st.status)}`);
  if (st.start) chips.push(`From: ${U.escapeHtml(st.start)}`);
  if (st.end) chips.push(`To: ${U.escapeHtml(st.end)}`);
  if (st.search) chips.push(`Query: ${U.escapeHtml(st.search)}`);

  if (!chips.length) {
    E.activeFiltersChips.innerHTML =
      `<span class="chip chip-muted">No filters · showing all issues</span>`;
    return;
  }

  E.activeFiltersChips.innerHTML = chips
    .map(text => `<span class="chip">${text}</span>`)
    .join('');
}

function issuesRowHtml(issue) {
  const meta = DataStore.computed.get(issue.id) || {};
  const risk = meta.risk || {};
  const prioGapVal = prioGap(meta.suggestions?.priority || '', issue.priority || '');
  const prioHint =
    prioGapVal > 0
      ? `<span class="hint hint-up">↑ ${meta.suggestions.priority}</span>`
      : '';

  return `
    <tr class="issue-row" data-id="${U.escapeAttr(issue.id)}">
      <td class="id-cell">
        <span class="issue-id">${U.escapeHtml(issue.id)}</span>
      </td>
      <td class="module-cell">${U.escapeHtml(issue.module || '—')}</td>
      <td class="title-cell">
        ${riskBadge(issue)}
        <span class="issue-title">${U.escapeHtml(issue.title || '—')}</span>
      </td>
      <td class="priority-cell">${U.escapeHtml(issue.priority || '—')}${prioHint}</td>
      <td class="status-cell">${U.escapeHtml(issue.status || '—')}</td>
      <td class="type-cell">${U.escapeHtml(issue.type || '—')}</td>
      <td class="date-cell">${issue.date ? U.fmtTS(issue.date) : '—'}</td>
    </tr>
  `;
}

function renderIssuesTable() {
  if (!E.issuesTbody) return;
  const list = getFilteredIssues();
  const total = list.length;

  let pageSize = GridState.pageSize || 20;
  if (E.pageSize) {
    const parsed = parseInt(E.pageSize.value || pageSize, 10);
    if (!isNaN(parsed) && parsed > 0) {
      pageSize = parsed;
      GridState.pageSize = parsed;
      localStorage.setItem(LS_KEYS.pageSize, String(parsed));
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (GridState.page > pages) GridState.page = pages;
  if (GridState.page < 1) GridState.page = 1;
  const startIdx = (GridState.page - 1) * pageSize;
  const slice = list.slice(startIdx, startIdx + pageSize);

  E.issuesTbody.innerHTML = slice.map(issuesRowHtml).join('');
  if (E.rowCount) E.rowCount.textContent = String(total);

  if (E.pageInfo) {
    E.pageInfo.textContent = total
      ? `Page ${GridState.page} of ${pages}`
      : 'No results';
  }
}

function renderAll() {
  renderKpis();
  buildModuleFilterOptions();
  renderIssuesTable();
  renderCalendar();
  renderInsights();
  renderPlannerTickets();
  renderPlannerReleasePlan();
}

/* =========================================================
   Calendar view
   ========================================================= */

function renderCalendar() {
  if (!E.calendarView) return;

  const events = DataStore.events || [];
  if (!events.length) {
    E.calendarView.innerHTML =
      `<p class="muted">No calendar events available yet. Add releases / maintenance to see them here.</p>`;
    return;
  }

  const allowedTypes = new Set();
  const addTypeIfChecked = (el, type) => {
    if (!el || el.checked) allowedTypes.add(type);
  };
  addTypeIfChecked(E.eventFilterDeployment, 'deployment');
  addTypeIfChecked(E.eventFilterMaintenance, 'maintenance');
  addTypeIfChecked(E.eventFilterRelease, 'release');
  addTypeIfChecked(E.eventFilterOther, 'other');

  const now = new Date();
  const horizon = U.dateAddDays(now, 21);

  const normalized = events
    .map(normalizeEvent)
    .filter(ev => {
      const start = ev.start ? new Date(ev.start) : null;
      if (!start || isNaN(start)) return false;
      if (start < now || start > horizon) return false;
      const t = (ev.type || 'other').toLowerCase();
      if (!allowedTypes.size) return true;
      if (allowedTypes.has(t)) return true;
      if (
        t !== 'deployment' &&
        t !== 'maintenance' &&
        t !== 'release' &&
        allowedTypes.has('other')
      )
        return true;
      return false;
    });

  const { flagsById } = computeChangeCollisions(DataStore.rows, normalized);

  const byDay = new Map();
  normalized.forEach(ev => {
    const d = new Date(ev.start);
    if (isNaN(d)) return;
    const key = toLocalDateValue(d);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(ev);
  });

  const days = Array.from(byDay.keys()).sort((a, b) => new Date(a) - new Date(b));
  if (!days.length) {
    E.calendarView.innerHTML =
      `<p class="muted">No events in the next 3 weeks for the selected filters.</p>`;
    return;
  }

  let html = '';
  days.forEach(day => {
    const d = new Date(day);
    const nice = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    html += `<div class="cal-day">
      <div class="cal-day-header">${nice}</div>
      <div class="cal-day-events">`;

    byDay
      .get(day)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .forEach(ev => {
        const start = new Date(ev.start);
        const time = ev.allDay ? 'All day' : start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const flags = flagsById.get(ev.id) || {};
        const badges = [];

        if (flags.collision)
          badges.push('<span class="badge badge-collision">Collision</span>');
        if (flags.freeze)
          badges.push('<span class="badge badge-freeze">Freeze window</span>');
        if (flags.hotIssues)
          badges.push('<span class="badge badge-hot">Near hot issues</span>');

        html += `<div class="cal-event cal-type-${(ev.type || 'other').toLowerCase()}">
          <div class="cal-event-main">
            <span class="cal-event-time">${time}</span>
            <span class="cal-event-title">${U.escapeHtml(ev.title || '')}</span>
          </div>
          <div class="cal-event-meta">
            <span class="cal-event-env">${U.escapeHtml(ev.env || 'Prod')}</span>
            ${badges.join(' ')}
          </div>
        </div>`;
      });

    html += '</div></div>';
  });

  E.calendarView.innerHTML = html;
}

/* =========================================================
   AI insights
   ========================================================= */

function renderInsights() {
  if (!E.insightsView) return;
  UI.setAnalyzing(true);

  const issues = DataStore.rows || [];
  const events = DataStore.events || [];

  if (!issues.length) {
    if (E.aiScopeText)
      E.aiScopeText.textContent = 'No issues loaded yet. Connect the sheet to get AI insights.';
    UI.setAnalyzing(false);
    return;
  }

  const now = new Date();
  const openIssues = issues.filter(issueIsOpen);
  const highRiskOpen = openIssues.filter(i => {
    const meta = DataStore.computed.get(i.id) || {};
    return (meta.risk?.total || 0) >= CONFIG.RISK.highRisk;
  });
  const critRiskOpen = openIssues.filter(i => {
    const meta = DataStore.computed.get(i.id) || {};
    return (meta.risk?.total || 0) >= CONFIG.RISK.critRisk;
  });
  const recent7 = openIssues.filter(i => U.isBetween(i.date, U.daysAgo(7), now));
  const recent14 = openIssues.filter(i => U.isBetween(i.date, U.daysAgo(14), now));

  if (E.aiScopeText) {
    E.aiScopeText.textContent =
      `Scope: ${openIssues.length} open issues (${highRiskOpen.length} high-risk, ` +
      `${critRiskOpen.length} critical). ` +
      `New in last 7 days: ${recent7.length}; last 14 days: ${recent14.length}.`;
  }

  // Patterns: most common tokens
  if (E.aiPatternsList) {
    const dfEntries = Array.from(DataStore.df.entries())
      .filter(([term]) => term.length > 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    E.aiPatternsList.innerHTML = dfEntries
      .map(
        ([term, df]) =>
          `<li><strong>${U.escapeHtml(term)}</strong> · in ${df} tickets</li>`
      )
      .join('');
  }

  // Labels: hottest categories
  if (E.aiLabelsList) {
    const counts = new Map();
    openIssues.forEach(issue => {
      const cats = Risk.suggestCategories(issue).slice(0, 2);
      cats.forEach(c =>
        counts.set(c.label, (counts.get(c.label) || 0) + c.score)
      );
    });
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    E.aiLabelsList.innerHTML = top
      .map(
        ([label, c]) =>
          `<li><strong>${U.escapeHtml(label)}</strong> · signal ${c}</li>`
      )
      .join('');
  }

  // Risks: top high-risk open issues
  if (E.aiRisksList) {
    const topRisk = openIssues
      .map(i => {
        const r = DataStore.computed.get(i.id)?.risk || {};
        return { issue: i, total: r.total || 0 };
      })
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    E.aiRisksList.innerHTML = topRisk
      .map(
        x =>
          `<li><span class="risk-pill risk-${CalendarLink.riskBadgeClass(
            x.total
          )}">R${Math.round(x.total)}</span> ` +
          `<strong>${U.escapeHtml(x.issue.id)}</strong> — ${U.escapeHtml(
            x.issue.title || ''
          )}</li>`
      )
      .join('');
  }

  // Events: risk-weighted upcoming events
  if (E.aiEventsList) {
    const topEv = computeEventsRisk(issues, events);
    if (!topEv.length) {
      E.aiEventsList.innerHTML =
        '<li>No high-risk calendar events in the next 7 days.</li>';
    } else {
      E.aiEventsList.innerHTML = topEv
        .map(item => {
          const d = item.date;
          const when = d.toLocaleString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          return `<li>
            <strong>${U.escapeHtml(item.event.title || '')}</strong>
            <span class="muted"> — ${when}</span>
            <div class="muted">Linked modules: ${
              item.modules.length ? item.modules.join(', ') : 'none'
            } · Hot issues: ${item.issues.length}</div>
          </li>`;
        })
        .join('');
    }
  }

  if (E.aiTrendsList) {
    const past = issues.filter(i => !U.isBetween(i.date, U.daysAgo(14), now));
    const olderRate = past.length ? past.length / Math.max(1, past.length / 30) : 0;
    const recentRate = recent14.length / 14;

    E.aiTrendsList.innerHTML = `
      <li>Average new issues in last 14 days: ${recent14.length} (≈${recentRate.toFixed(
      1
    )}/day)</li>
      <li>Older baseline (rough estimate): ${olderRate ? olderRate.toFixed(1) : '—'}/day</li>
    `;
  }

  UI.setAnalyzing(false);
}

/* =========================================================
   Release Planner UI
   ========================================================= */

const PlannerLinks = {
  links: {}, // eventId -> Set(ticketId)
  add(eventId, ticketIds) {
    if (!this.links[eventId]) this.links[eventId] = new Set();
    const set = this.links[eventId];
    ticketIds.forEach(id => set.add(id));
  },
  get(eventId) {
    return Array.from(this.links[eventId] || []);
  }
};

let plannerLast = null;

function plannerIssuePool() {
  // Use the *same filters* as issues tab, but only open items
  return getFilteredIssues().filter(issueIsOpen);
}

function renderPlannerTickets() {
  if (!E.plannerTickets) return;

  const pool = plannerIssuePool();
  if (!pool.length) {
    E.plannerTickets.innerHTML =
      `<option value="">No tickets in current filters</option>`;
    return;
  }

  const options = pool
    .map(issue => {
      const meta = DataStore.computed.get(issue.id) || {};
      const risk = meta.risk?.total || 0;
      const rLabel = `R${Math.round(risk)}`;
      const title = issue.title || '';
      return `<option value="${U.escapeAttr(issue.id)}">[${rLabel}] ${U.escapeHtml(
        issue.id
      )} — ${U.escapeHtml(title)}</option>`;
    })
    .join('');

  E.plannerTickets.innerHTML = options;
}

function plannerHorizonDays() {
  if (!E.plannerHorizon) return 7;
  const n = parseInt(E.plannerHorizon.value || '3', 10);
  return isNaN(n) || n <= 0 ? 3 : n;
}

function plannerSlotsPerDayVal() {
  if (!E.plannerSlotsPerDay) return 3;
  const n = parseInt(E.plannerSlotsPerDay.value || '3', 10);
  return isNaN(n) || n <= 0 ? 3 : n;
}

function plannerCombinedModules(description) {
  const manual = (E.plannerModules?.value || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

  const fromIssues = plannerIssuePool()
    .map(i => i.module)
    .filter(Boolean);

  const descTokens = (description || '')
    .toLowerCase()
    .split(/[,\n/]+/)
    .map(t => t.trim())
    .filter(t => t.length > 2 && !STOPWORDS.has(t));

  const all = [...manual, ...fromIssues, ...descTokens];
  const uniq = Array.from(new Set(all.map(x => x.toLowerCase())));

  return uniq;
}

function renderPlannerReleasePlan() {
  if (!E.plannerReleasePlan) return;

  const env = E.plannerEnv?.value || 'Prod';
  const horizon = plannerHorizonDays();
  const now = new Date();
  const limit = U.dateAddDays(now, horizon);

  const events = (DataStore.events || [])
    .map(normalizeEvent)
    .filter(ev => {
      const start = ev.start ? new Date(ev.start) : null;
      if (!start || isNaN(start)) return false;
      if (start < now || start > limit) return false;
      const type = (ev.type || '').toLowerCase();
      if (type !== 'release' && type !== 'deployment') return false;
      if (env && env !== 'All' && (ev.env || 'Prod') !== env) return false;
      return true;
    })
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  if (!events.length) {
    E.plannerReleasePlan.innerHTML =
      `<option value="">No Release events in horizon</option>`;
    return;
  }

  const opts = events
    .map(ev => {
      const start = new Date(ev.start);
      const when = start.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const count = PlannerLinks.get(ev.id).length;
      const suffix = count ? ` · ${count} ticket(s)` : '';
      return `<option value="${U.escapeAttr(ev.id)}">${U.escapeHtml(
        when
      )} — ${U.escapeHtml(ev.title || '')}${suffix}</option>`;
    })
    .join('');

  E.plannerReleasePlan.innerHTML = opts;
}

function renderPlannerSuggestions() {
  if (!E.plannerResults) return;

  if (!plannerLast || !plannerLast.slots || !plannerLast.slots.length) {
    E.plannerResults.innerHTML =
      '<p class="muted">Run “Suggest windows” to see recommended deployment slots.</p>';
    return;
  }

  const { slots, bug, bomb } = plannerLast;
  const bugLabel = ReleasePlanner.bugLabel(bug.risk);
  const bombLabel = ReleasePlanner.bombLabel(bomb.risk);

  let html = `
    <div class="planner-meta">
      <div>Recent bug pressure: <strong>${bugLabel}</strong> (score ${bug.risk.toFixed(
    1
  )})</div>
      <div>Bomb-bug pattern: <strong>${bombLabel}</strong> (score ${bomb.risk.toFixed(
    1
  )})</div>
  `;

  if (bomb.examples && bomb.examples.length) {
    html += `<div class="planner-bomb-examples">
      Possible bomb-bug candidates from history:
      <ul>`;
    bomb.examples.forEach(ex => {
      html += `<li><strong>${U.escapeHtml(ex.id)}</strong> — ${U.escapeHtml(
        ex.title
      )} (risk R${Math.round(ex.risk)}, ~${Math.round(ex.ageDays)} days old)</li>`;
    });
    html += `</ul></div>`;
  }

  html += `</div><div class="planner-slots">`;

  slots.forEach((slot, idx) => {
    const bucket = ReleasePlanner.riskBucket(slot.totalRisk);
    const start = slot.start;
    const end = slot.end;
    const when = start.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    html += `
      <div class="planner-slot ${bucket.className}">
        <label>
          <input type="radio" name="plannerSlot" value="${idx}" ${
      idx === 0 ? 'checked' : ''
    }>
          <div class="planner-slot-main">
            <div class="planner-slot-time">${when} → ${endTime}</div>
            <div class="planner-slot-risk">Overall: <strong>${
              bucket.label
            }</strong> (safety ${slot.safetyScore.toFixed(1)})</div>
          </div>
        </label>
        <div class="planner-slot-detail">
          Rush: ${slot.rushRisk.toFixed(1)} · Bugs: ${slot.bugRisk.toFixed(
      1
    )} · Bomb-bug: ${slot.bombRisk.toFixed(1)} ·
          Env: ${slot.envRisk.toFixed(1)} · Type: ${slot.typeRisk.toFixed(
      1
    )} · Events: ${slot.eventsRisk.toFixed(1)} (${slot.eventCount} events${
      slot.holidayCount ? ', ' + slot.holidayCount + ' holiday(s)' : ''
    })
        </div>
      </div>
    `;
  });

  html += '</div>';

  E.plannerResults.innerHTML = html;
}

function createEventFromBestSlotAndReturnId() {
  if (!plannerLast || !plannerLast.slots || !plannerLast.slots.length) return null;
  const slot = plannerLast.slots[0];

  const env = E.plannerEnv?.value || 'Prod';
  const region = E.plannerRegion?.value || '';
  const relType = E.plannerReleaseType?.value || 'Feature';
  const description = (E.plannerDescription?.value || '').trim();

  const ev = {
    id: 'rel-' + slot.start.getTime() + '-' + Math.random().toString(36).slice(2, 6),
    title: `Release — ${relType} (${region || env})`,
    type: 'release',
    env,
    modules: plannerLast.modules || [],
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    description,
    owner: '',
    status: 'Planned',
    impactType: 'Release',
    allDay: false
  };

  DataStore.events.push(ev);
  EventsCache.save(DataStore.events);
  renderCalendar();
  renderPlannerReleasePlan();
  UI.toast('Created release event from top suggestion.');
  return ev.id;
}

function handlePlannerRun() {
  if (!DataStore.rows.length) {
    UI.toast('Issues are still loading; try again in a moment.');
    return;
  }

  const region = E.plannerRegion?.value || '';
  const env = E.plannerEnv?.value || 'Prod';
  const releaseType = (E.plannerReleaseType?.value || 'Feature').toLowerCase();
  const description = (E.plannerDescription?.value || '').trim();
  const horizon = plannerHorizonDays();
  const slotsPerDay = plannerSlotsPerDayVal();
  const modules = plannerCombinedModules(description);

  const res = ReleasePlanner.suggestSlots({
    region,
    env,
    modules,
    horizonDays: horizon,
    releaseType,
    description,
    slotsPerDay
  });

  plannerLast = { ...res, env, region, releaseType, modules };
  renderPlannerSuggestions();
}

function handlePlannerAddEvent() {
  if (!plannerLast || !plannerLast.slots || !plannerLast.slots.length) {
    UI.toast('Run “Suggest windows” first.');
    return;
  }

  // Use selected radio slot if any
  let idx = 0;
  const checked = document.querySelector('input[name="plannerSlot"]:checked');
  if (checked && !isNaN(parseInt(checked.value, 10))) {
    idx = parseInt(checked.value, 10);
  }
  const slot = plannerLast.slots[idx] || plannerLast.slots[0];

  const env = E.plannerEnv?.value || 'Prod';
  const region = E.plannerRegion?.value || '';
  const relType = E.plannerReleaseType?.value || 'Feature';
  const description = (E.plannerDescription?.value || '').trim();

  const ev = {
    id:
      'rel-' +
      slot.start.getTime() +
      '-' +
      Math.random().toString(36).slice(2, 6),
    title: `Release — ${relType} (${region || env})`,
    type: 'release',
    env,
    modules: plannerLast.modules || [],
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    description,
    owner: '',
    status: 'Planned',
    impactType: 'Release',
    allDay: false
  };

  DataStore.events.push(ev);
  EventsCache.save(DataStore.events);
  renderCalendar();
  renderPlannerReleasePlan();
  UI.toast('Release window added to plan from selected suggestion.');
}

function handlePlannerAssignTickets() {
  if (!E.plannerTickets) return;

  const selectedTickets = Array.from(E.plannerTickets.selectedOptions || []).map(
    opt => opt.value
  );
  if (!selectedTickets.length) {
    UI.toast('Select at least one ticket to assign.');
    return;
  }

  let eventId = E.plannerReleasePlan?.value || '';
  if (!eventId) {
    // No explicit event chosen → create from top suggestion automatically.
    eventId = createEventFromBestSlotAndReturnId();
    if (!eventId) {
      UI.toast('No release event or suggestion available to assign tickets to.');
      return;
    }
    if (E.plannerReleasePlan) {
      E.plannerReleasePlan.value = eventId;
    }
  }

  PlannerLinks.add(eventId, selectedTickets);
  renderPlannerReleasePlan();
  UI.toast(`Assigned ${selectedTickets.length} ticket(s) to the selected release window.`);
}

/* =========================================================
   Issue modal
   ========================================================= */

function openIssueModal(id) {
  const issue = DataStore.byId.get(id);
  if (!issue || !E.issueModal || !E.modalBody || !E.modalTitle) return;

  const meta = DataStore.computed.get(issue.id) || {};
  const risk = meta.risk || {};
  const cats = meta.suggestions?.categories || [];
  const prioSuggestion = meta.suggestions?.priority || '';

  E.modalTitle.textContent = `${issue.id} — ${issue.title || ''}`;

  const reasons = (risk.reasons || []).map(r => `<span class="chip">${U.escapeHtml(r)}</span>`).join(' ');

  E.modalBody.innerHTML = `
    <div class="modal-section">
      <h4>Details</h4>
      <p><strong>Module:</strong> ${U.escapeHtml(issue.module || '—')}</p>
      <p><strong>Status:</strong> ${U.escapeHtml(issue.status || '—')}</p>
      <p><strong>Priority:</strong> ${U.escapeHtml(issue.priority || '—')}${
        prioSuggestion && !issue.priority
          ? ` <span class="hint hint-up">Suggested: ${U.escapeHtml(prioSuggestion)}</span>`
          : ''
      }</p>
      <p><strong>Type:</strong> ${U.escapeHtml(issue.type || '—')}</p>
      <p><strong>Date:</strong> ${issue.date ? U.fmtTS(issue.date) : '—'}</p>
    </div>

    <div class="modal-section">
      <h4>Description</h4>
      <pre class="monotext">${U.escapeHtml(issue.desc || '—')}</pre>
    </div>

    <div class="modal-section">
      <h4>Risk breakdown</h4>
      <p>Total risk: <strong>R${Math.round(risk.total || 0)}</strong></p>
      <ul class="risk-breakdown">
        <li>Technical: ${risk.technical || 0}</li>
        <li>Business: ${risk.business || 0}</li>
        <li>Operational: ${risk.operational || 0}</li>
        <li>Time: ${risk.time || 0}</li>
        <li>Severity: ${risk.severity || 0}</li>
        <li>Impact: ${risk.impact || 0}</li>
        <li>Urgency: ${risk.urgency || 0}</li>
      </ul>
      <div class="risk-reasons">${reasons}</div>
    </div>

    <div class="modal-section">
      <h4>Suggested labels</h4>
      ${
        cats.length
          ? '<ul>' +
            cats
              .slice(0, 6)
              .map(
                c =>
                  `<li><strong>${U.escapeHtml(c.label)}</strong> (score ${c.score})</li>`
              )
              .join('') +
            '</ul>'
          : '<p class="muted">No strong label suggestions.</p>'
      }
    </div>
  `;

  E.issueModal.classList.add('open');
}

function closeIssueModal() {
  if (E.issueModal) E.issueModal.classList.remove('open');
}

/* =========================================================
   Data loading
   ========================================================= */

async function initIssues() {
  UI.spinner(true);
  UI.skeleton(true);

  try {
    const res = await fetch(CONFIG.SHEET_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const csv = await res.text();
    DataStore.hydrate(csv);
    IssuesCache.save(DataStore.rows);
    UI.setSync('issues', true, new Date());
  } catch (err) {
    console.error('Failed to fetch issues; trying cache.', err);
    const cached = IssuesCache.load();
    if (cached) {
      DataStore.hydrateFromRows(cached);
      const label = IssuesCache.lastLabel() || '';
      UI.setSync('issues', false, label ? new Date(label.replace('Last updated: ', '')) : null);
      UI.toast('Using cached issues; live fetch failed.');
    } else {
      UI.toast('Unable to load issues. Check the sheet URL or network.');
    }
  } finally {
    UI.spinner(false);
    UI.skeleton(false);
    renderAll();
  }
}

async function initEvents() {
  UI.setSync('events', false, null);
  try {
    const res = await fetch(CONFIG.CALENDAR_API_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const list = Array.isArray(json.events)
      ? json.events
      : Array.isArray(json)
      ? json
      : [];
    DataStore.events = list.map(normalizeEvent);
    EventsCache.save(DataStore.events);
    UI.setSync('events', true, new Date());
  } catch (err) {
    console.error('Failed to fetch events; trying cache.', err);
    const cached = EventsCache.load();
    if (cached) {
      DataStore.events = cached.map(normalizeEvent);
      UI.setSync('events', false, new Date());
      UI.toast('Using cached events; live fetch failed.');
    } else {
      DataStore.events = [];
      UI.toast('Unable to load calendar events (check Apps Script or CORS proxy).');
    }
  }
  renderCalendar();
  renderInsights();
  renderPlannerReleasePlan();
}

/* =========================================================
   Theme & behavior
   ========================================================= */

function initTheme() {
  const stored = localStorage.getItem(LS_KEYS.theme) || 'dark';
  document.documentElement.dataset.theme = stored;
  if (E.themeSelect) E.themeSelect.value = stored;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(LS_KEYS.theme, theme);
}

function initAccent() {
  const stored = localStorage.getItem(LS_KEYS.accentColorStorage);
  if (stored && E.accentColor) {
    document.documentElement.style.setProperty('--accent', stored);
    E.accentColor.value = stored;
  }
}

/* =========================================================
   Event handlers
   ========================================================= */

function initEventHandlers() {
  if (E.issuesTbody) {
    E.issuesTbody.addEventListener('click', e => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      openIssueModal(tr.dataset.id);
    });
  }

  if (E.modalClose) E.modalClose.onclick = closeIssueModal;

  if (E.searchInput) {
    E.searchInput.value = Filters.state.search || '';
    E.searchInput.addEventListener('input', () => {
      Filters.state.search = E.searchInput.value;
      Filters.save();
      renderIssuesTable();
      renderPlannerTickets();
      renderInsights();
    });
  }

  if (E.moduleFilter) {
    E.moduleFilter.addEventListener('change', () => {
      Filters.state.module = E.moduleFilter.value;
      Filters.save();
      renderIssuesTable();
      renderPlannerTickets();
      renderInsights();
      renderActiveFilterChips();
    });
  }

  if (E.priorityFilter) {
    E.priorityFilter.addEventListener('change', () => {
      Filters.state.priority = E.priorityFilter.value;
      Filters.save();
      renderIssuesTable();
      renderPlannerTickets();
      renderInsights();
      renderActiveFilterChips();
    });
  }

  if (E.statusFilter) {
    E.statusFilter.addEventListener('change', () => {
      Filters.state.status = E.statusFilter.value;
      Filters.save();
      renderIssuesTable();
      renderPlannerTickets();
      renderInsights();
      renderActiveFilterChips();
    });
  }

  if (E.startDateFilter) {
    E.startDateFilter.value = Filters.state.start || '';
    E.startDateFilter.addEventListener('change', () => {
      Filters.state.start = E.startDateFilter.value || '';
      Filters.save();
      renderIssuesTable();
      renderPlannerTickets();
      renderInsights();
      renderActiveFilterChips();
    });
  }

  if (E.endDateFilter) {
    E.endDateFilter.value = Filters.state.end || '';
    E.endDateFilter.addEventListener('change', () => {
      Filters.state.end = E.endDateFilter.value || '';
      Filters.save();
      renderIssuesTable();
      renderPlannerTickets();
      renderInsights();
      renderActiveFilterChips();
    });
  }

  if (E.resetBtn) {
    E.resetBtn.addEventListener('click', () => {
      Filters.state = { search: '', module: 'All', priority: 'All', status: 'All', start: '', end: '' };
      Filters.save();
      if (E.searchInput) E.searchInput.value = '';
      if (E.moduleFilter) E.moduleFilter.value = 'All';
      if (E.priorityFilter) E.priorityFilter.value = 'All';
      if (E.statusFilter) E.statusFilter.value = 'All';
      if (E.startDateFilter) E.startDateFilter.value = '';
      if (E.endDateFilter) E.endDateFilter.value = '';
      renderAll();
      renderActiveFilterChips();
    });
  }

  if (E.pageSize) {
    E.pageSize.value = String(GridState.pageSize || 20);
    E.pageSize.addEventListener('change', () => {
      GridState.pageSize = parseInt(E.pageSize.value || '20', 10) || 20;
      localStorage.setItem(LS_KEYS.pageSize, String(GridState.pageSize));
      renderIssuesTable();
    });
  }

  if (E.firstPage) {
    E.firstPage.onclick = () => {
      GridState.page = 1;
      renderIssuesTable();
    };
  }
  if (E.prevPage) {
    E.prevPage.onclick = () => {
      GridState.page = Math.max(1, GridState.page - 1);
      renderIssuesTable();
    };
  }
  if (E.nextPage) {
    E.nextPage.onclick = () => {
      GridState.page += 1;
      renderIssuesTable();
    };
  }
  if (E.lastPage) {
    E.lastPage.onclick = () => {
      const total = getFilteredIssues().length;
      const pages = Math.max(
        1,
        Math.ceil(total / (GridState.pageSize || 20))
      );
      GridState.page = pages;
      renderIssuesTable();
    };
  }

  if (E.themeSelect) {
    E.themeSelect.addEventListener('change', () => setTheme(E.themeSelect.value));
  }

  if (E.accentColor) {
    E.accentColor.addEventListener('change', () => {
      const v = E.accentColor.value;
      document.documentElement.style.setProperty('--accent', v);
      localStorage.setItem(LS_KEYS.accentColorStorage, v);
    });
  }

  // Tabs
  if (E.issuesTab && E.calendarTab && E.insightsTab) {
    const setView = name => {
      if (E.issuesView) E.issuesView.style.display = name === 'issues' ? '' : 'none';
      if (E.calendarView) E.calendarView.style.display = name === 'calendar' ? '' : 'none';
      if (E.insightsView) E.insightsView.style.display = name === 'insights' ? '' : 'none';
      E.issuesTab.classList.toggle('active', name === 'issues');
      E.calendarTab.classList.toggle('active', name === 'calendar');
      E.insightsTab.classList.toggle('active', name === 'insights');
    };
    E.issuesTab.onclick = () => setView('issues');
    E.calendarTab.onclick = () => setView('calendar');
    E.insightsTab.onclick = () => setView('insights');
    setView('issues');
  }

  // Calendar type filters
  ['eventFilterDeployment', 'eventFilterMaintenance', 'eventFilterRelease', 'eventFilterOther'].forEach(
    id => {
      const el = E[id];
      if (el) el.addEventListener('change', renderCalendar);
    }
  );

  // Release planner controls
  if (E.plannerRun) E.plannerRun.onclick = handlePlannerRun;
  if (E.plannerAddEvent) E.plannerAddEvent.onclick = handlePlannerAddEvent;
  if (E.plannerAssignBtn) E.plannerAssignBtn.onclick = handlePlannerAssignTickets;
}

/* =========================================================
   Init
   ========================================================= */

async function initApp() {
  cacheEls();
  Filters.load();
  initTheme();
  initAccent();
  renderActiveFilterChips();
  initEventHandlers();
  await initIssues();
  await initEvents();
}

document.addEventListener('DOMContentLoaded', initApp);
