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
  'the','a','an','and','or','but','for','with','this','that','from','into','onto',
  'when','what','where','how','why','can','could','should','would','will','just',
  'have','has','had','been','are','is','was','were','to','in','on','of','at','by',
  'as','it','its','be','we','you','they','our','your','their','not','no','if','else',
  'then','than','about','after','before','more','less','also','only','very','get',
  'got','see','seen','use','used','using','user','issue','bug','ticket','inc'
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
   Release Planner – F&B / Middle East (enhanced)
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

  /**
   * Build a semantic "release signature" from:
   *  - selected modules
   *  - selected tickets (all fields: title/desc/log/module/type/priority/status)
   *  - planner description text
   */
  buildReleaseSignature({ modules, ticketIds, description }) {
    const moduleSet = new Set(
      (modules || [])
        .map(m => (m || '').toLowerCase())
        .filter(Boolean)
    );

    const textParts = [(description || '')];
    const selectedIssues = [];
    let selectedRiskSum = 0;

    (ticketIds || []).forEach(id => {
      const r = DataStore.byId.get(id);
      if (!r) return;
      selectedIssues.push(r);

      if (r.module) moduleSet.add((r.module || '').toLowerCase());

      textParts.push(
        r.id || '',
        r.module || '',
        r.title || '',
        r.desc || '',
        r.log || '',
        r.type || '',
        r.priority || '',
        r.status || ''
      );

      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      selectedRiskSum += risk;
    });

    const modulesFromText = (modules || [])
      .map(m => (m || '').toLowerCase())
      .filter(Boolean);
    modulesFromText.forEach(m => moduleSet.add(m));

    const text = textParts.join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    const tokens = new Set(
      text
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOPWORDS.has(t))
    );

    const avgSelectedRisk =
      selectedIssues.length ? selectedRiskSum / selectedIssues.length : 0;

    return {
      modules: Array.from(moduleSet),
      moduleSet,
      tokens,
      selectedIssues,
      avgSelectedRisk
    };
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
   * How much recent bug pressure is around this release signature
   * (modules + text + selected tickets).
   */
  computeBugPressure(signature, horizonDays) {
    const now = new Date();
    const lookback = U.dateAddDays(now, -90);
    const modSet = signature.moduleSet || new Set();
    const sigTokens = signature.tokens || new Set();

    // If we have literally no signal, treat as low background risk.
    if (!modSet.size && !sigTokens.size && !signature.selectedIssues.length) {
      return { raw: 0, risk: 0.5 };
    }

    let sum = 0;

    DataStore.rows.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (isNaN(d) || d < lookback) return;

      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      if (!risk) return;

      const mod = (r.module || '').toLowerCase();

      const body = [
        r.title || '',
        r.desc || '',
        r.log || '',
        r.module || '',
        r.type || '',
        r.priority || ''
      ]
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ');

      const issueTokens = new Set(
        body
          .split(/\s+/)
          .filter(t => t.length > 2 && !STOPWORDS.has(t))
      );

      const tokenOverlap = Array.from(sigTokens).filter(t => issueTokens.has(t));

      let related = false;
      if (!modSet.size && !sigTokens.size) {
        related = true;
      } else if (mod && modSet.has(mod)) {
        related = true;
      } else if (tokenOverlap.length) {
        related = true;
      }

      if (!related) return;

      const ageDays = (now.getTime() - d.getTime()) / 86400000;
      let w = 1;
      if (ageDays <= 7) w = 1.4;
      else if (ageDays <= 30) w = 1.1;
      else w = 0.7;

      // Slight extra weight if this exact issue is explicitly in the release scope.
      if (signature.selectedIssues.some(s => s.id === r.id)) {
        w *= 1.4;
      }

      sum += risk * w;
    });

    // Base normalization
    let bugRisk = Math.max(0, Math.min(6, sum / 40));

    // Inject "how hot" the selected tickets are.
    if (signature.avgSelectedRisk) {
      bugRisk += Math.min(2, signature.avgSelectedRisk / 10);
    }

    bugRisk = Math.max(0, Math.min(6, bugRisk));
    return { raw: sum, risk: bugRisk };
  },

  bugLabel(risk) {
    if (risk <= 1.5) return 'light recent bug history';
    if (risk <= 3.5) return 'moderate bug pressure';
    return 'heavy bug pressure';
  },

  /**
   * "Bomb bug" = old, high-risk incidents that look textually similar
   * (and/or share modules) and could resurface.
   */
  computeBombBugRisk(signature) {
    const now = new Date();
    const lookback = U.dateAddDays(now, -365); // last year

    const modSet = signature.moduleSet || new Set();
    const sigTokens = signature.tokens || new Set();

    // No signature -> no strong bomb pattern.
    if (!modSet.size && !sigTokens.size && !signature.selectedIssues.length) {
      return { raw: 0, risk: 0, examples: [] };
    }

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

      const bodyTokens = new Set(
        body
          .replace(/[^a-z0-9]+/g, ' ')
          .split(/\s+/)
          .filter(t => t.length > 2 && !STOPWORDS.has(t))
      );

      const tokenOverlap = Array.from(sigTokens).filter(t => bodyTokens.has(t));

      let related = false;
      if (!modSet.size && !sigTokens.size) {
        related = true;
      } else if (mod && modSet.has(mod)) {
        related = true;
      } else if (tokenOverlap.length) {
        related = true;
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
        ageDays,
        module: r.module || '',
        tokens: tokenOverlap.slice(0, 6)
      });
    });

    const normalized = raw / 60; // tuning constant
    let bombRisk = Math.max(0, Math.min(6, normalized));

    // If the selected tickets are very hot and we have *some* bomb signal, push a bit up.
    if (signature.avgSelectedRisk && bombRisk > 0) {
      bombRisk += Math.min(2, signature.avgSelectedRisk / 12);
    }

    bombRisk = Math.max(0, Math.min(6, bombRisk));

    examples.sort((a, b) => b.risk - a.risk);
    return { raw, risk: bombRisk, examples: examples.slice(0, 3) };
  },

  bombLabel(risk) {
    if (risk <= 1) return 'no strong historical bomb-bug pattern';
    if (risk <= 3) return 'some historical blast patterns in similar changes';
    return 'strong historical bomb-bug pattern, treat as high risk';
  },

  computeEventsPenalty(date, env, signature, region) {
    const dt = date instanceof Date ? date : new Date(date);
    const center = dt.getTime();
    const windowMs = 2 * 60 * 60 * 1000; // +/- 2h for normal changes

    const mods = signature.moduleSet || new Set();

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

      const evMods = Array.isArray(ev.modules)
        ? ev.modules
        : typeof ev.modules === 'string'
        ? ev.modules.split(',').map(x => x.trim())
        : [];

      const evModsLower = evMods.map(m => (m || '').toLowerCase());
      const overlap =
        mods.size && evModsLower.some(m => mods.has(m));

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
    const { region, env, releaseType, bugRisk, bombBugRisk, signature } = ctx;
    const rushRisk = this.computeRushScore(region, date);
    const envRisk = this.envWeight[env] ?? 1;
    const typeRisk = this.releaseTypeWeight[releaseType] ?? 2;

    const {
      penalty: eventsRisk,
      count: eventCount,
      holidayCount
    } = this.computeEventsPenalty(date, env, signature, region);

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

  suggestSlots({ region, env, modules, horizonDays, releaseType, description, slotsPerDay, ticketIds }) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const horizon = Math.max(1, horizonDays || 7);
    const signature = this.buildReleaseSignature({ modules, ticketIds, description });

    const bug = this.computeBugPressure(signature, horizon);
    const bomb = this.computeBombBugRisk(signature);

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
          releaseType,
          bugRisk: bug.risk,
          bombBugRisk: bomb.risk,
          signature
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

    return { bug, bomb, signature, slots: slots.slice(0, maxSlots) };
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

/* =========================================================
   Release Planner UI helpers
   ========================================================= */

let LAST_PLANNER_CONTEXT = null;
let LAST_PLANNER_RESULT = null;

function renderPlannerResults(result, context) {
  if (!E.plannerResults) return;
  const { slots, bug, bomb, signature } = result;
  const { env, modules, releaseType, horizonDays, region, description, ticketIds } = context;

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
  const selectedCount = (ticketIds || []).length;

  const intro = `
    <div style="margin-bottom:6px;">
      Top ${slots.length} suggested windows for a <strong>${U.escapeHtml(
        releaseType
      )}</strong> release on <strong>${U.escapeHtml(
    env
  )}</strong><br/>
      Scope: <strong>${selectedCount}</strong> selected ticket${
    selectedCount === 1 ? '' : 's'
  } · Modules: <strong>${U.escapeHtml(
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
        const overlapTokens = ex.tokens && ex.tokens.length ? ex.tokens.join(', ') : '';
        const overlapText = overlapTokens
          ? `Overlap on: ${U.escapeHtml(overlapTokens)}`
          : 'General behaviour / module match';
        const prodHint =
          env === 'Prod'
            ? 'If this release goes to Prod, similar symptoms could reappear under comparable traffic / business flows.'
            : 'Risk is mostly operational / internal for this non-Prod environment.';

        return `<li>
          <strong>${U.escapeHtml(ex.id)}</strong> — ${U.escapeHtml(
          ex.title || ''
        )} <span class="muted">(risk ${ex.risk}, ~${days}d old)</span><br/>
          <span class="muted">${overlapText}</span><br/>
          <span class="muted">${prodHint}</span>
        </li>`;
      })
      .join('');
    bombExamplesHtml = `
      <div class="muted" style="font-size:11px;margin-bottom:4px;">
        Historical incidents that look similar to this release:
        <ul style="margin:4px 0 0 18px;padding:0;">
          ${items}
        </ul>
      </div>`;
  }

  const slotsHtml = slots
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

  E.plannerResults.innerHTML = `${intro}${bombExamplesHtml}${slotsHtml}`;

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
        issueId: (ticketIds || []).join(', '),
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
      refreshPlannerReleasePlans(context);
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

    // NEW: use selected tickets as part of the release signature
    const ticketIds = Array.from(E.plannerTickets?.selectedOptions || [])
      .map(o => o.value)
      .filter(Boolean);

    const context = {
      region,
      env,
      modules,
      releaseType,
      horizonDays,
      slotsPerDay,
      description,
      ticketIds
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
        issueId: (context.ticketIds || []).join(', '),
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
/* =========================================================
   Modals (Issue + Event)
   ========================================================= */

UI.Modals = {
  openIssue(id) {
    if (!E.issueModal || !E.modalBody || !E.modalTitle) return;
    const issue = DataStore.byId.get(id);
    if (!issue) return;

    const meta = DataStore.computed.get(issue.id) || {};
    const risk = meta.risk || {};
    const suggestions = meta.suggestions || {};
    const categories = suggestions.categories || [];
    const prioSuggestion = suggestions.priority || issue.priority;

    const riskBadgeClass = CalendarLink.riskBadgeClass(risk.total || 0);
    const reasons =
      risk.reasons && risk.reasons.length
        ? risk.reasons.join(', ')
        : 'No specific signals detected';

    E.modalTitle.textContent = `${issue.id} · ${issue.title || ''}`;

    const catHtml = categories.length
      ? categories
          .slice(0, 5)
          .map(c => `<span class="pill pill-soft">${U.escapeHtml(c.label)}</span>`)
          .join(' ')
      : '<span class="muted">No categories suggested.</span>';

    const priorityGap = prioGap(prioSuggestion, issue.priority);
    const priorityNote =
      priorityGap > 0
        ? `<span class="pill priority-high">AI suggests raising to ${prioSuggestion}</span>`
        : priorityGap < 0
        ? `<span class="pill priority-low">AI suggests lowering to ${prioSuggestion}</span>`
        : `<span class="pill priority-medium">Priority looks aligned (${prioSuggestion || 'n/a'})</span>`;

    E.modalBody.innerHTML = `
      <section class="modal-section">
        <h3>Summary</h3>
        <table class="kv">
          <tr><th>ID</th><td>${U.escapeHtml(issue.id || '-')}</td></tr>
          <tr><th>Module</th><td>${U.escapeHtml(issue.module || '-')}</td></tr>
          <tr><th>Type</th><td>${U.escapeHtml(issue.type || '-')}</td></tr>
          <tr><th>Priority</th><td>${U.escapeHtml(issue.priority || '-')} · ${priorityNote}</td></tr>
          <tr><th>Status</th><td>${U.escapeHtml(issue.status || '-')}</td></tr>
          <tr><th>Date</th><td>${U.escapeHtml(issue.date || '-')}</td></tr>
        </table>
      </section>

      <section class="modal-section">
        <h3>Risk profile</h3>
        <div class="risk-badge ${riskBadgeClass}">
          Total risk: ${risk.total != null ? risk.total.toFixed(1) : 'n/a'}
        </div>
        <div class="risk-grid">
          <div>Technical: <strong>${risk.technical ?? '-'}</strong></div>
          <div>Business: <strong>${risk.business ?? '-'}</strong></div>
          <div>Operational: <strong>${risk.operational ?? '-'}</strong></div>
          <div>Severity: <strong>${risk.severity ?? '-'}</strong></div>
          <div>Impact: <strong>${risk.impact ?? '-'}</strong></div>
          <div>Urgency: <strong>${risk.urgency ?? '-'}</strong></div>
        </div>
        <div class="muted" style="margin-top:4px;">Signals: ${U.escapeHtml(reasons)}</div>
      </section>

      <section class="modal-section">
        <h3>Description</h3>
        <pre class="mono">${U.escapeHtml(issue.desc || '(no description)')}</pre>
      </section>

      <section class="modal-section">
        <h3>Log / Notes</h3>
        <pre class="mono">${U.escapeHtml(issue.log || '(no log)')}</pre>
      </section>

      <section class="modal-section">
        <h3>Suggested labels</h3>
        <div>${catHtml}</div>
      </section>

      ${
        issue.file
          ? `<section class="modal-section">
              <h3>Attachment</h3>
              <a href="${U.escapeAttr(
                issue.file
              )}" target="_blank" rel="noopener noreferrer">Open attached link</a>
            </section>`
          : ''
      }
    `;

    if (E.copyId) {
      E.copyId.onclick = async () => {
        try {
          await navigator.clipboard.writeText(issue.id || '');
          UI.toast('Issue ID copied');
        } catch {
          UI.toast('Could not copy ID');
        }
      };
    }

    if (E.copyLink) {
      E.copyLink.onclick = async () => {
        const url = location.href.split('#')[0] + `#issue-${encodeURIComponent(issue.id)}`;
        try {
          await navigator.clipboard.writeText(url);
          UI.toast('Deep link copied');
        } catch {
          UI.toast('Could not copy link');
        }
      };
    }

    E.issueModal.style.display = 'block';
  },

  closeIssue() {
    if (E.issueModal) E.issueModal.style.display = 'none';
  },

  openEvent(eventObj) {
    if (!E.eventModal || !E.eventForm) return;
    const ev = eventObj || {
      id: '',
      title: '',
      type: 'Deployment',
      issueId: '',
      start: '',
      end: '',
      description: '',
      allDay: false,
      env: 'Prod',
      owner: '',
      status: 'Planned',
      modules: '',
      impactType: '',
      notificationStatus: ''
    };

    E.eventModalTitle.textContent = ev.id ? 'Edit Change Event' : 'Add Change Event';

    if (E.eventTitle) E.eventTitle.value = ev.title || '';
    if (E.eventType) E.eventType.value = ev.type || 'Deployment';
    if (E.eventIssueId) E.eventIssueId.value = ev.issueId || '';
    if (E.eventStart) E.eventStart.value = ev.start ? toLocalInputValue(ev.start) : '';
    if (E.eventEnd) E.eventEnd.value = ev.end ? toLocalInputValue(ev.end) : '';
    if (E.eventDescription) E.eventDescription.value = ev.description || '';
    if (E.eventEnv) E.eventEnv.value = ev.env || 'Prod';
    if (E.eventOwner) E.eventOwner.value = ev.owner || '';
    if (E.eventStatus) E.eventStatus.value = ev.status || 'Planned';
    if (E.eventModules)
      E.eventModules.value = Array.isArray(ev.modules)
        ? ev.modules.join(', ')
        : ev.modules || '';
    if (E.eventImpactType) E.eventImpactType.value = ev.impactType || '';
    if (E.eventAllDay) E.eventAllDay.checked = !!ev.allDay;

    if (E.eventDelete) {
      E.eventDelete.style.display = ev.id ? '' : 'none';
      E.eventDelete.disabled = !ev.id;
    }

    E.eventModal.dataset.eventId = ev.id || '';
    E.eventModal.style.display = 'block';

    UI.Modals.updateEventIssueLinkedInfo(ev.issueId || '');
  },

  closeEvent() {
    if (E.eventModal) E.eventModal.style.display = 'none';
  },

  updateEventIssueLinkedInfo(issueIdsRaw) {
    if (!E.eventIssueLinkedInfo) return;
    const ids = (issueIdsRaw || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!ids.length) {
      E.eventIssueLinkedInfo.innerHTML =
        '<span class="muted">No issues linked to this change.</span>';
      return;
    }
    const items = ids
      .map(id => {
        const r = DataStore.byId.get(id);
        if (!r) return `<li>${U.escapeHtml(id)} <span class="muted">(not found)</span></li>`;
        const risk = DataStore.computed.get(id)?.risk?.total || 0;
        const cls = CalendarLink.riskBadgeClass(risk);
        return `<li><strong>${U.escapeHtml(id)}</strong> — ${U.escapeHtml(
          r.title || ''
        )} <span class="pill ${cls}">R${risk.toFixed(1)}</span></li>`;
      })
      .join('');
    E.eventIssueLinkedInfo.innerHTML = `<ul>${items}</ul>`;
  }
};

/* =========================================================
   Events cache + networking
   ========================================================= */

const EventsCache = {
  load() {
    try {
      const raw = localStorage.getItem(LS_KEYS.events);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : null;
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

function saveEventsCache() {
  EventsCache.save(DataStore.events || []);
}

/**
 * Normalize row from calendar Apps Script or local edits
 */
function normalizeEventRow(raw) {
  if (!raw) return null;
  const lower = {};
  for (const k in raw) {
    if (!k) continue;
    lower[k.toLowerCase()] = raw[k];
  }
  const pick = (...keys) => {
    for (const key of keys) {
      if (lower[key] != null) return lower[key];
    }
    return '';
  };

  let modules = pick('modules') || '';
  if (Array.isArray(modules)) {
    // OK
  } else if (typeof modules === 'string') {
    modules = modules
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  } else {
    modules = [];
  }

  const allDay = !!pick('allday');

  return {
    id: String(pick('id') || pick('eventid') || ''),
    title: String(pick('title') || pick('summary') || ''),
    type: String(pick('type') || 'Other'),
    issueId: String(pick('issueid') || pick('issue_id') || ''),
    start: String(pick('start') || pick('starttime') || ''),
    end: String(pick('end') || pick('endtime') || ''),
    description: String(pick('description') || pick('details') || ''),
    allDay,
    env: String(pick('env') || pick('environment') || 'Prod'),
    owner: String(pick('owner') || pick('createdby') || ''),
    status: String(pick('status') || 'Planned'),
    modules,
    impactType: String(pick('impacttype') || pick('impact') || ''),
    notificationStatus: String(pick('notificationstatus') || pick('notify') || '')
  };
}

/**
 * Save / delete events via Apps Script
 */
async function saveEventToSheet(eventObj) {
  try {
    const payload = { action: 'save', event: eventObj };
    const resp = await fetch(CONFIG.CALENDAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const savedRaw = data.event || data;
    const saved = normalizeEventRow(savedRaw);
    if (!saved) throw new Error('Bad event response');
    return saved;
  } catch (e) {
    console.error('saveEventToSheet error', e);
    UI.toast('Could not sync event with calendar backend.');
    return null;
  }
}

async function deleteEventFromSheet(id) {
  try {
    const payload = { action: 'delete', id };
    const resp = await fetch(CONFIG.CALENDAR_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return true;
  } catch (e) {
    console.error('deleteEventFromSheet error', e);
    UI.toast('Could not delete event from calendar backend.');
    return false;
  }
}

/* =========================================================
   Calendar rendering
   ========================================================= */

const CalendarState = {
  typeFilter: {
    Deployment: true,
    Maintenance: true,
    Release: true,
    Other: true
  }
};

function getFilteredEventsForCalendar() {
  const events = DataStore.events || [];
  return events.filter(ev => {
    const type = (ev.type || 'Other').toLowerCase();
    if (type.includes('deploy')) return CalendarState.typeFilter.Deployment;
    if (type.includes('maint')) return CalendarState.typeFilter.Maintenance;
    if (type.includes('release')) return CalendarState.typeFilter.Release;
    return CalendarState.typeFilter.Other;
  });
}

function renderCalendarEvents() {
  const container = document.getElementById('calendarEventsList');
  if (!container) return;

  const events = getFilteredEventsForCalendar();
  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  const change = computeChangeCollisions(DataStore.rows || [], DataStore.events || []);
  const flagsById = change.flagsById || new Map();

  if (!sorted.length) {
    container.innerHTML =
      '<div class="muted" style="padding:8px;">No change events in the selected filters.</div>';
    return;
  }

  const html = sorted
    .map(ev => {
      const d = ev.start ? new Date(ev.start) : null;
      const when = d && !isNaN(d)
        ? d.toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '(no date)';
      const type = ev.type || 'Other';
      const env = ev.env || 'Prod';

      const modsLabel = (ev.modules || [])
        .map(m => String(m))
        .join(', ');

      const flags = flagsById.get(ev.id) || {};
      const flagChips = [];
      if (flags.collision)
        flagChips.push('<span class="pill pill-soft pill-warn">Collision</span>');
      if (flags.freeze)
        flagChips.push('<span class="pill pill-soft pill-warn">Freeze window</span>');
      if (flags.hotIssues)
        flagChips.push('<span class="pill pill-soft pill-danger">Hot issues nearby</span>');

      return `
        <div class="event-card" data-event-id="${U.escapeAttr(ev.id || '')}">
          <div class="event-card-header">
            <span class="event-title">${U.escapeHtml(ev.title || '(no title)')}</span>
            <span class="event-meta">${U.escapeHtml(type)} · ${U.escapeHtml(env)}</span>
          </div>
          <div class="event-card-body">
            <div>${U.escapeHtml(when)}</div>
            ${
              modsLabel
                ? `<div class="muted">Modules: ${U.escapeHtml(modsLabel)}</div>`
                : ''
            }
            ${
              ev.impactType
                ? `<div class="muted">Impact: ${U.escapeHtml(ev.impactType)}</div>`
                : ''
            }
            ${
              flagChips.length
                ? `<div class="event-flags">${flagChips.join(' ')}</div>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = html;

  container.querySelectorAll('[data-event-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-event-id');
      const ev = (DataStore.events || []).find(e => e.id === id);
      UI.Modals.openEvent(ev || null);
    });
  });
}

/* =========================================================
   Analytics / Insights
   ========================================================= */

const Analytics = {
  refresh(list) {
    const issues = list && list.length ? list : DataStore.rows || [];
    const events = DataStore.events || [];

    this.renderScope(issues);
    this.renderRisks(issues);
    this.renderLabels(issues);
    this.renderModulesTable(issues);
    this.renderTriageList(issues);
    this.renderTrends(issues);
    this.renderEvents(events, issues);
    this.renderEmergingStable(issues);
  },

  renderScope(issues) {
    if (!E.aiScopeText) return;
    const total = DataStore.rows.length;
    const filtered = issues.length;
    E.aiScopeText.textContent = `${filtered} issues in current scope (out of ${total} total).`;
  },

  renderRisks(issues) {
    if (!E.aiRisksList) return;
    let low = 0,
      med = 0,
      high = 0,
      crit = 0;
    issues.forEach(r => {
      const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
      if (risk >= CONFIG.RISK.critRisk) crit++;
      else if (risk >= CONFIG.RISK.highRisk) high++;
      else if (risk >= 6) med++;
      else low++;
    });

    E.aiRisksList.innerHTML = `
      <li><strong>${crit}</strong> critical-risk issues</li>
      <li><strong>${high}</strong> high-risk issues</li>
      <li><strong>${med}</strong> medium-risk issues</li>
      <li><strong>${low}</strong> low / background issues</li>
    `;
  },

  renderLabels(issues) {
    if (!E.aiLabelsList) return;
    const counts = new Map();
    issues.forEach(r => {
      const categories = Risk.suggestCategories(r);
      categories.forEach(c => {
        counts.set(c.label, (counts.get(c.label) || 0) + c.score);
      });
    });
    const arr = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!arr.length) {
      E.aiLabelsList.innerHTML =
        '<li class="muted">No strong label patterns detected yet.</li>';
      return;
    }
    E.aiLabelsList.innerHTML = arr
      .map(([label, score]) => `<li>${U.escapeHtml(label)} <span class="muted">(score ${score})</span></li>`)
      .join('');
  },

  renderModulesTable(issues) {
    if (!E.aiModulesTableBody) return;
    const byModule = new Map();
    issues.forEach(r => {
      const key = r.module || 'Unspecified';
      const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
      let m = byModule.get(key);
      if (!m) {
        m = { count: 0, open: 0, riskSum: 0, high: 0 };
        byModule.set(key, m);
      }
      m.count++;
      const st = (r.status || '').toLowerCase();
      const closed = st.startsWith('resolved') || st.startsWith('rejected');
      if (!closed) m.open++;
      if (risk >= CONFIG.RISK.highRisk) m.high++;
      m.riskSum += risk;
    });
    const rows = Array.from(byModule.entries())
      .map(([mod, v]) => ({
        module: mod,
        ...v,
        avgRisk: v.count ? v.riskSum / v.count : 0
      }))
      .sort((a, b) => b.avgRisk - a.avgRisk);

    if (!rows.length) {
      E.aiModulesTableBody.innerHTML = `
        <tr><td colspan="4" class="muted">No module stats available.</td></tr>`;
      return;
    }

    E.aiModulesTableBody.innerHTML = rows
      .slice(0, 10)
      .map(
        r => `
        <tr>
          <td>${U.escapeHtml(r.module)}</td>
          <td>${r.count}</td>
          <td>${r.open}</td>
          <td>${r.high}</td>
          <td>${r.avgRisk.toFixed(1)}</td>
        </tr>
      `
      )
      .join('');
  },

  renderTriageList(issues) {
    if (!E.aiTriageList) return;
    const openIssues = issues.filter(r => {
      const st = (r.status || '').toLowerCase();
      return !(st.startsWith('resolved') || st.startsWith('rejected'));
    });
    const sorted = openIssues
      .map(r => ({
        row: r,
        risk: DataStore.computed.get(r.id)?.risk?.total || 0
      }))
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 12);

    if (!sorted.length) {
      E.aiTriageList.innerHTML =
        '<li class="muted">No open issues in current scope.</li>';
      return;
    }

    E.aiTriageList.innerHTML = sorted
      .map(
        x => `
        <li data-id="${U.escapeAttr(x.row.id)}">
          <strong>${U.escapeHtml(x.row.id)}</strong> — ${U.escapeHtml(
          x.row.title || ''
        )}
          <span class="muted">[${x.row.priority || '-'} · ${x.row.status || '-'}]</span>
          <span class="pill ${CalendarLink.riskBadgeClass(
            x.risk
          )}">R${x.risk.toFixed(1)}</span>
        </li>
      `
      )
      .join('');

    E.aiTriageList.querySelectorAll('li[data-id]').forEach(li => {
      li.addEventListener('click', () =>
        UI.Modals.openIssue(li.getAttribute('data-id'))
      );
    });
  },

  renderTrends(issues) {
    if (!E.aiTrendsList) return;

    const now = new Date();
    const recentFrom = U.daysAgo(CONFIG.TREND_DAYS_RECENT);
    const windowFrom = U.daysAgo(CONFIG.TREND_DAYS_WINDOW);

    const inRange = (r, from, to) => {
      if (!r.date) return false;
      return U.isBetween(r.date, from, to);
    };

    const recent = issues.filter(r => inRange(r, recentFrom, null));
    const baseline = issues.filter(r => inRange(r, windowFrom, recentFrom));

    const recentPerDay =
      CONFIG.TREND_DAYS_RECENT > 0
        ? recent.length / CONFIG.TREND_DAYS_RECENT
        : 0;
    const baselineDays = CONFIG.TREND_DAYS_WINDOW - CONFIG.TREND_DAYS_RECENT;
    const baselinePerDay = baselineDays > 0 ? baseline.length / baselineDays : 0;

    let trendText = 'Stable volume';
    if (baselinePerDay > 0) {
      const deltaPct = ((recentPerDay - baselinePerDay) / baselinePerDay) * 100;
      if (deltaPct > 20) trendText = `Up ${Math.round(deltaPct)}% vs baseline`;
      else if (deltaPct < -20) trendText = `Down ${Math.round(-deltaPct)}% vs baseline`;
    }

    E.aiTrendsList.innerHTML = `
      <li>Last ${CONFIG.TREND_DAYS_RECENT}d: <strong>${recent.length}</strong> issues (${recentPerDay.toFixed(
      1
    )}/day)</li>
      <li>Prior window: <strong>${baseline.length}</strong> issues (${baselinePerDay.toFixed(
      1
    )}/day)</li>
      <li><strong>${trendText}</strong></li>
    `;
  },

  renderEvents(events, issues) {
    if (!E.aiEventsList && !E.aiIncidentsList) return;
    const significant = computeEventsRisk(issues || DataStore.rows || [], events || []);

    if (E.aiEventsList) {
      if (!significant.length) {
        E.aiEventsList.innerHTML =
          '<li class="muted">No risky upcoming change events in the next week.</li>';
      } else {
        E.aiEventsList.innerHTML = significant
          .map(x => {
            const ev = x.event;
            const d = ev.start ? new Date(ev.start) : null;
            const when = d && !isNaN(d)
              ? d.toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : '(no date)';
            const mods = x.modules && x.modules.length ? x.modules.join(', ') : 'n/a';
            return `
            <li>
              <strong>${U.escapeHtml(ev.title || 'Event')}</strong>
              <span class="muted">[${U.escapeHtml(ev.env || 'Prod')} · ${U.escapeHtml(
              when
            )}]</span><br/>
              <span class="muted">Modules: ${U.escapeHtml(
                mods
              )} · Linked issues: ${x.issues.length} · Risk bundle: ${x.risk.toFixed(
              1
            )}</span>
            </li>`;
          })
          .join('');
      }
    }

    if (E.aiIncidentsList) {
      const change = computeChangeCollisions(issues || DataStore.rows || [], events || []);
      const hot = [];
      (events || []).forEach(ev => {
        const flags = change.flagsById.get(ev.id) || {};
        if (flags.collision || flags.hotIssues || flags.freeze) hot.push({ ev, flags });
      });
      if (!hot.length) {
        E.aiIncidentsList.innerHTML =
          '<li class="muted">No overlapping / risky change windows detected.</li>';
      } else {
        E.aiIncidentsList.innerHTML = hot
          .slice(0, 10)
          .map(x => {
            const ev = x.ev;
            const flags = [];
            if (x.flags.collision) flags.push('collision');
            if (x.flags.hotIssues) flags.push('hot issues');
            if (x.flags.freeze) flags.push('freeze window');
            const d = ev.start ? new Date(ev.start) : null;
            const when = d && !isNaN(d)
              ? d.toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : '(no date)';
            return `
              <li>
                <strong>${U.escapeHtml(ev.title || 'Event')}</strong>
                <span class="muted">[${U.escapeHtml(ev.env || 'Prod')} · ${U.escapeHtml(
              when
            )}]</span>
                <span class="muted"> · ${U.escapeHtml(flags.join(', '))}</span>
              </li>
            `;
          })
          .join('');
      }
    }
  },

  renderEmergingStable(issues) {
    if (!E.aiEmergingStable) return;
    const now = new Date();
    const recent = issues.filter(r => U.isBetween(r.date, U.daysAgo(14), null));
    const old = issues.filter(r => U.isBetween(r.date, null, U.daysAgo(30)));

    const byModuleRecent = new Map();
    const byModuleOld = new Map();

    recent.forEach(r => {
      const key = r.module || 'Unspecified';
      byModuleRecent.set(key, (byModuleRecent.get(key) || 0) + 1);
    });
    old.forEach(r => {
      const key = r.module || 'Unspecified';
      byModuleOld.set(key, (byModuleOld.get(key) || 0) + 1);
    });

    const emerging = [];
    byModuleRecent.forEach((cnt, mod) => {
      const baseline = byModuleOld.get(mod) || 0;
      if (cnt >= 3 && cnt > baseline) emerging.push({ mod, cnt, baseline });
    });
    emerging.sort((a, b) => b.cnt - a.cnt);

    if (!emerging.length) {
      E.aiEmergingStable.textContent =
        'No modules show strong emerging issue patterns. Overall landscape looks stable.';
    } else {
      const top = emerging[0];
      E.aiEmergingStable.textContent = `Emerging hotspots: ${emerging
        .slice(0, 3)
        .map(
          e =>
            `${e.mod} (${e.cnt} recent vs ${e.baseline} older issues)`
        )
        .join(' · ')}. Pay special attention to ${top.mod}.`;
    }
  }
};

/* =========================================================
   AI Query (DSL) wiring
   ========================================================= */

function renderAiQueryResults(results, q) {
  if (!E.aiQueryResults) return;
  if (!results.length) {
    E.aiQueryResults.innerHTML =
      '<div class="muted">No issues matched your query. Try relaxing a condition.</div>';
    return;
  }

  const rows = results.slice(0, 120);
  const total = results.length;

  const htmlRows = rows
    .map(r => {
      const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
      const cls = CalendarLink.riskBadgeClass(risk);
      return `
        <tr data-id="${U.escapeAttr(r.id)}">
          <td>${U.escapeHtml(r.id)}</td>
          <td>${U.escapeHtml(r.module || '-')}</td>
          <td>${U.escapeHtml(r.title || '-')}</td>
          <td>${U.escapeHtml(r.priority || '-')}</td>
          <td>${U.escapeHtml(r.status || '-')}</td>
          <td><span class="pill ${cls}">R${risk.toFixed(1)}</span></td>
        </tr>
      `;
    })
    .join('');

  E.aiQueryResults.innerHTML = `
    <div class="muted" style="margin-bottom:4px;">
      ${total} matching issue${total === 1 ? '' : 's'}. Showing top ${rows.length}.
    </div>
    <div class="table-wrapper">
      <table class="grid compact">
        <thead>
          <tr>
            <th>ID</th><th>Module</th><th>Title</th><th>Priority</th><th>Status</th><th>Risk</th>
          </tr>
        </thead>
        <tbody>${htmlRows}</tbody>
      </table>
    </div>
  `;

  E.aiQueryResults.querySelectorAll('tbody tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () =>
      UI.Modals.openIssue(tr.getAttribute('data-id'))
    );
  });
}

function runAiQuery(applyFiltersAfter = false) {
  if (!E.aiQueryInput) return;
  const txt = (E.aiQueryInput.value || '').trim();
  if (!txt) {
    if (E.aiQueryResults)
      E.aiQueryResults.innerHTML =
        '<div class="muted">Type conditions like <code>status:open priority:H risk>10</code> and press Run.</div>';
    return;
  }
  const q = DSL.parse(txt);
  const results = DataStore.rows.filter(r =>
    DSL.matches(r, DataStore.computed.get(r.id) || {}, q)
  );
  renderAiQueryResults(results, q);

  if (applyFiltersAfter) {
    // Apply parts of the DSL to global filters
    if (q.module && E.moduleFilter) {
      const opt = Array.from(E.moduleFilter.options).find(o =>
        (o.value || '').toLowerCase().includes(q.module)
      );
      Filters.state.module = opt ? opt.value : 'All';
    }
    if (q.priority && E.priorityFilter) {
      const p = q.priority[0].toUpperCase();
      const val = p === 'H' ? 'High' : p === 'M' ? 'Medium' : p === 'L' ? 'Low' : 'All';
      Filters.state.priority = val;
    }
    if (q.status && E.statusFilter) {
      if (q.status === 'open') Filters.state.status = 'Not Started Yet';
      else if (q.status === 'closed') Filters.state.status = 'Resolved';
      else Filters.state.status = '';
    }
    Filters.save();
    UI.refreshAll();
  }
}

/* =========================================================
   Global UI.refreshAll
   ========================================================= */

UI.refreshAll = function () {
  const list = UI.Issues.applyFilters();
  UI.Issues.renderSummary(list);
  UI.Issues.renderKPIs(list);
  UI.Issues.renderTable(list);
  UI.Issues.renderCharts(list);
  UI.Issues.renderFilterChips();
  Analytics.refresh(list);
  refreshPlannerTickets(list);
  refreshPlannerReleasePlans(LAST_PLANNER_CONTEXT);
};

/* =========================================================
   Issues + Events loading
   ========================================================= */

async function loadIssues() {
  UI.spinner(true);
  Filters.load();
  try {
    const cached = IssuesCache.load();
    if (cached && cached.length) {
      DataStore.hydrateFromRows(cached);
      UI.setSync(
        'issues',
        true,
        new Date(localStorage.getItem(LS_KEYS.issuesLastUpdated) || Date.now())
      );
      UI.refreshAll();
    }

    const resp = await fetch(CONFIG.SHEET_URL);
    const text = await resp.text();
    DataStore.hydrate(text);
    IssuesCache.save(DataStore.rows);
    UI.setSync('issues', true, new Date());
    UI.refreshAll();
  } catch (e) {
    console.error('loadIssues error', e);
    UI.toast('Could not refresh issues from sheet; using cached data if available.');
    const cached = IssuesCache.load();
    if (cached && (!DataStore.rows || !DataStore.rows.length)) {
      DataStore.hydrateFromRows(cached);
      UI.refreshAll();
    }
    UI.setSync('issues', false, null);
  } finally {
    UI.spinner(false);
  }
}

async function loadEvents() {
  try {
    const cached = EventsCache.load();
    if (cached && cached.length) {
      DataStore.events = cached.map(normalizeEventRow).filter(Boolean);
      UI.setSync('events', true, new Date());
      renderCalendarEvents();
      Analytics.refresh(UI.Issues.applyFilters());
    }

    const resp = await fetch(CONFIG.CALENDAR_API_URL);
    const json = await resp.json();
    let events = [];
    if (Array.isArray(json.events)) events = json.events;
    else if (Array.isArray(json)) events = json;
    else if (json && Array.isArray(json.items)) events = json.items;
    DataStore.events = events.map(normalizeEventRow).filter(Boolean);
    saveEventsCache();
    UI.setSync('events', true, new Date());
    renderCalendarEvents();
    Analytics.refresh(UI.Issues.applyFilters());
  } catch (e) {
    console.error('loadEvents error', e);
    if (!DataStore.events || !DataStore.events.length) {
      const cached = EventsCache.load();
      if (cached) DataStore.events = cached.map(normalizeEventRow).filter(Boolean);
    }
    if (DataStore.events && DataStore.events.length) {
      UI.setSync('events', false, null);
      renderCalendarEvents();
      Analytics.refresh(UI.Issues.applyFilters());
    } else {
      UI.setSync('events', false, null);
    }
  }
}

/* =========================================================
   Theme + layout
   ========================================================= */

function applyTheme(theme) {
  const root = document.documentElement;
  if (!theme) theme = 'system';
  root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(LS_KEYS.theme, theme);
  } catch {}
  if (E.themeSelect) E.themeSelect.value = theme;
}

function restoreTheme() {
  let theme = 'system';
  try {
    theme = localStorage.getItem(LS_KEYS.theme) || 'system';
  } catch {}
  applyTheme(theme);
}

function applyAccent(color) {
  if (!color) return;
  document.documentElement.style.setProperty('--accent', color);
  try {
    localStorage.setItem(LS_KEYS.accentColorStorage, color);
  } catch {}
  if (E.accentColor) E.accentColor.value = color;
}

function restoreAccent() {
  let color = '';
  try {
    color = localStorage.getItem(LS_KEYS.accentColorStorage) || '';
  } catch {}
  if (color) applyAccent(color);
}

/* =========================================================
   Tabs + filters + misc wiring
   ========================================================= */

function setView(view) {
  const show = id => {
    if (id === 'issues') {
      if (E.issuesView) E.issuesView.style.display = '';
      if (E.calendarView) E.calendarView.style.display = 'none';
      if (E.insightsView) E.insightsView.style.display = 'none';
      if (E.issuesTab) E.issuesTab.classList.add('active');
      if (E.calendarTab) E.calendarTab.classList.remove('active');
      if (E.insightsTab) E.insightsTab.classList.remove('active');
    } else if (id === 'calendar') {
      if (E.issuesView) E.issuesView.style.display = 'none';
      if (E.calendarView) E.calendarView.style.display = '';
      if (E.insightsView) E.insightsView.style.display = 'none';
      if (E.issuesTab) E.issuesTab.classList.remove('active');
      if (E.calendarTab) E.calendarTab.classList.add('active');
      if (E.insightsTab) E.insightsTab.classList.remove('active');
      renderCalendarEvents();
    } else if (id === 'insights') {
      if (E.issuesView) E.issuesView.style.display = 'none';
      if (E.calendarView) E.calendarView.style.display = 'none';
      if (E.insightsView) E.insightsView.style.display = '';
      if (E.issuesTab) E.issuesTab.classList.remove('active');
      if (E.calendarTab) E.calendarTab.classList.remove('active');
      if (E.insightsTab) E.insightsTab.classList.add('active');
      Analytics.refresh(UI.Issues.applyFilters());
    }
  };
  show(view);
  try {
    localStorage.setItem(LS_KEYS.view, view);
  } catch {}
}

function restoreView() {
  let view = 'issues';
  try {
    view = localStorage.getItem(LS_KEYS.view) || 'issues';
  } catch {}
  setView(view);
}

function wireFilters() {
  if (E.searchInput) {
    E.searchInput.value = Filters.state.search || '';
    E.searchInput.addEventListener('input', () => {
      Filters.state.search = E.searchInput.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.moduleFilter) {
    E.moduleFilter.value = Filters.state.module || 'All';
    E.moduleFilter.addEventListener('change', () => {
      Filters.state.module = E.moduleFilter.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.priorityFilter) {
    E.priorityFilter.value = Filters.state.priority || 'All';
    E.priorityFilter.addEventListener('change', () => {
      Filters.state.priority = E.priorityFilter.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.statusFilter) {
    E.statusFilter.value = Filters.state.status || 'All';
    E.statusFilter.addEventListener('change', () => {
      Filters.state.status = E.statusFilter.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.startDateFilter) {
    E.startDateFilter.value = Filters.state.start || '';
    E.startDateFilter.addEventListener('change', () => {
      Filters.state.start = E.startDateFilter.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.endDateFilter) {
    E.endDateFilter.value = Filters.state.end || '';
    E.endDateFilter.addEventListener('change', () => {
      Filters.state.end = E.endDateFilter.value;
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
}

function wireGridPaging() {
  if (E.pageSize) {
    E.pageSize.value = String(GridState.pageSize);
    E.pageSize.addEventListener('change', () => {
      const v = parseInt(E.pageSize.value, 10) || 20;
      GridState.pageSize = v;
      try {
        localStorage.setItem(LS_KEYS.pageSize, String(v));
      } catch {}
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
      if (GridState.page > 1) GridState.page--;
      UI.refreshAll();
    });
  if (E.nextPage)
    E.nextPage.addEventListener('click', () => {
      GridState.page++;
      UI.refreshAll();
    });
  if (E.lastPage)
    E.lastPage.addEventListener('click', () => {
      // We'll clamp inside renderTable
      GridState.page = 9999;
      UI.refreshAll();
    });

  const header = U.q('#issuesTable thead');
  if (header) {
    header.addEventListener('click', ev => {
      const th = ev.target.closest('th[data-key]');
      if (!th) return;
      const key = th.getAttribute('data-key');
      if (!key) return;
      if (GridState.sortKey === key) GridState.sortAsc = !GridState.sortAsc;
      else {
        GridState.sortKey = key;
        GridState.sortAsc = true;
      }
      UI.refreshAll();
    });
  }
}

function wireTabs() {
  if (E.issuesTab) E.issuesTab.addEventListener('click', () => setView('issues'));
  if (E.calendarTab) E.calendarTab.addEventListener('click', () => setView('calendar'));
  if (E.insightsTab) E.insightsTab.addEventListener('click', () => setView('insights'));
}

function wireDrawer() {
  if (E.drawerBtn && E.sidebar) {
    E.drawerBtn.addEventListener('click', () => {
      E.sidebar.classList.toggle('open');
    });
  }
}

function wireThemeControls() {
  if (E.themeSelect) {
    E.themeSelect.addEventListener('change', () => {
      applyTheme(E.themeSelect.value || 'system');
    });
  }
  if (E.accentColor) {
    E.accentColor.addEventListener('change', () => {
      applyAccent(E.accentColor.value || '');
    });
  }
}

function wireEventsUi() {
  if (E.addEventBtn) {
    E.addEventBtn.addEventListener('click', () => UI.Modals.openEvent(null));
  }
  if (E.eventModalClose) {
    E.eventModalClose.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventCancel) {
    E.eventCancel.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventIssueId) {
    E.eventIssueId.addEventListener('input', () =>
      UI.Modals.updateEventIssueLinkedInfo(E.eventIssueId.value || '')
    );
  }
  if (E.eventForm) {
    E.eventForm.addEventListener('submit', async e => {
      e.preventDefault();
      const id = E.eventModal?.dataset.eventId || '';
      const title = E.eventTitle?.value || '';
      const type = E.eventType?.value || 'Deployment';
      const issueId = E.eventIssueId?.value || '';
      const start = E.eventStart?.value || '';
      const end = E.eventEnd?.value || '';
      const description = E.eventDescription?.value || '';
      const env = E.eventEnv?.value || 'Prod';
      const owner = E.eventOwner?.value || '';
      const status = E.eventStatus?.value || 'Planned';
      const modulesStr = E.eventModules?.value || '';
      const modules = modulesStr
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const impactType = E.eventImpactType?.value || '';
      const allDay = !!(E.eventAllDay && E.eventAllDay.checked);

      const toIsoIfLocal = v => {
        if (!v) return '';
        const d = new Date(v);
        if (isNaN(d)) return v;
        return d.toISOString();
      };

      const ev = {
        id,
        title,
        type,
        issueId,
        start: toIsoIfLocal(start),
        end: toIsoIfLocal(end),
        description,
        env,
        owner,
        status,
        modules,
        impactType,
        allDay,
        notificationStatus: ''
      };

      const saved = await saveEventToSheet(ev);
      if (!saved) return;

      const idx = DataStore.events.findIndex(x => x.id === saved.id);
      if (idx === -1) DataStore.events.push(saved);
      else DataStore.events[idx] = saved;

      saveEventsCache();
      renderCalendarEvents();
      Analytics.refresh(UI.Issues.applyFilters());
      refreshPlannerReleasePlans(LAST_PLANNER_CONTEXT);

      UI.Modals.closeEvent();
      UI.toast('Event saved');
    });
  }
  if (E.eventDelete) {
    E.eventDelete.addEventListener('click', async () => {
      const id = E.eventModal?.dataset.eventId || '';
      if (!id) {
        UI.toast('No event selected to delete.');
        return;
      }
      const ok = await deleteEventFromSheet(id);
      if (!ok) return;
      DataStore.events = (DataStore.events || []).filter(ev => ev.id !== id);
      saveEventsCache();
      renderCalendarEvents();
      Analytics.refresh(UI.Issues.applyFilters());
      refreshPlannerReleasePlans(LAST_PLANNER_CONTEXT);

      UI.Modals.closeEvent();
      UI.toast('Event deleted');
    });
  }

  // Event type filters in calendar
  const bindTypeFilter = (el, key) => {
    if (!el) return;
    el.classList.toggle('active', CalendarState.typeFilter[key]);
    el.addEventListener('click', () => {
      CalendarState.typeFilter[key] = !CalendarState.typeFilter[key];
      el.classList.toggle('active', CalendarState.typeFilter[key]);
      renderCalendarEvents();
    });
  };
  bindTypeFilter(E.eventFilterDeployment, 'Deployment');
  bindTypeFilter(E.eventFilterMaintenance, 'Maintenance');
  bindTypeFilter(E.eventFilterRelease, 'Release');
  bindTypeFilter(E.eventFilterOther, 'Other');
}

function wireIssueModal() {
  if (E.modalClose) {
    E.modalClose.addEventListener('click', () => UI.Modals.closeIssue());
  }
  if (E.issueModal) {
    E.issueModal.addEventListener('click', e => {
      if (e.target === E.issueModal) UI.Modals.closeIssue();
    });
  }
  if (E.eventModal) {
    E.eventModal.addEventListener('click', e => {
      if (e.target === E.eventModal) UI.Modals.closeEvent();
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (E.issueModal && E.issueModal.style.display === 'block') UI.Modals.closeIssue();
      if (E.eventModal && E.eventModal.style.display === 'block') UI.Modals.closeEvent();
    }
  });
}

function wireAiControls() {
  if (E.aiQueryRun) {
    E.aiQueryRun.addEventListener('click', () => runAiQuery(false));
  }
  if (E.aiQueryApplyFilters) {
    E.aiQueryApplyFilters.addEventListener('click', () => runAiQuery(true));
  }
  if (E.aiQueryInput) {
    E.aiQueryInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        e.preventDefault();
        runAiQuery(false);
      }
    });
  }
  if (E.aiQueryExport) {
    E.aiQueryExport.addEventListener('click', () => {
      if (!E.aiQueryInput) return;
      const txt = (E.aiQueryInput.value || '').trim();
      const q = DSL.parse(txt);
      const results = DataStore.rows.filter(r =>
        DSL.matches(r, DataStore.computed.get(r.id) || {}, q)
      );
      if (!results.length) {
        UI.toast('Nothing to export for this query.');
        return;
      }
      const headers = [
        'ID',
        'Module',
        'Title',
        'Priority',
        'Status',
        'Date',
        'Risk',
        'Type'
      ];
      const lines = [
        headers.join(',')
      ].concat(
        results.map(r => {
          const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
          const cells = [
            r.id,
            r.module,
            r.title,
            r.priority,
            r.status,
            r.date,
            risk.toFixed(1),
            r.type
          ];
          return cells
            .map(v =>
              `"${String(v || '')
                .replace(/"/g, '""')
                .replace(/\r?\n/g, ' ')}"`
            )
            .join(',');
        })
      );
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'incheck-query-export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
}

function wireMisc() {
  if (E.refreshNow) {
    E.refreshNow.addEventListener('click', () => {
      loadIssues();
      loadEvents();
    });
  }
  if (E.exportCsv) {
    E.exportCsv.addEventListener('click', () => {
      if (!DataStore.rows || !DataStore.rows.length) {
        UI.toast('No issues to export.');
        return;
      }
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
        'File'
      ];
      const lines = [
        headers.join(',')
      ].concat(
        DataStore.rows.map(r => {
          const cells = [
            r.id,
            r.module,
            r.title,
            r.desc,
            r.priority,
            r.status,
            r.type,
            r.date,
            r.log,
            r.file
          ];
          return cells
            .map(v =>
              `"${String(v || '')
                .replace(/"/g, '""')
                .replace(/\r?\n/g, ' ')}"`
            )
            .join(',');
        })
      );
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'incheck-issues-export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  if (E.createTicketBtn) {
    E.createTicketBtn.addEventListener('click', () => {
      UI.toast('Ticket creation is not wired to a backend yet.');
    });
  }
  if (E.onlineStatusChip) {
    const update = () => {
      const online = navigator.onLine;
      E.onlineStatusChip.textContent = online ? 'Online' : 'Offline';
      E.onlineStatusChip.className = 'online-chip ' + (online ? 'ok' : 'err');
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
  }
  if (E.shortcutsHelp) {
    E.shortcutsHelp.addEventListener('click', () => {
      UI.toast('Shortcuts: / focus search · ? open help · Esc close modals.');
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      e.preventDefault();
      if (E.searchInput) E.searchInput.focus();
    }
    if (e.key === '?' && e.shiftKey) {
      e.preventDefault();
      UI.toast('Shortcuts: / focus search · ? open help · Esc close modals.');
    }
  });
}

/* =========================================================
   Boot
   ========================================================= */

async function initApp() {
  cacheEls();
  restoreTheme();
  restoreAccent();
  UI.spinner(true);

  wireTabs();
  wireDrawer();
  wireThemeControls();
  wireFilters();
  wireGridPaging();
  wireEventsUi();
  wireIssueModal();
  wireAiControls();
  wireMisc();
  wirePlanner();

  UI.Issues.renderFilters();
  UI.Issues.renderFilterChips();

  restoreView();

  await loadIssues();
  await loadEvents();

  UI.spinner(false);
}

window.addEventListener('DOMContentLoaded', initApp);
