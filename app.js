/**
 * InCheck Pro Dashboard — Issues · Ops · AI Copilot
 * Includes:
 *  - Issues grid + filters + CSV export
 *  - Risk engine (severity / impact / urgency)
 *  - AI DSL query + insights
 *  - Change calendar (local events)
 *  - F&B Release Planner (MENA) with bug-history awareness
 */

/* -------------------------------------------------------
   CONFIG
-------------------------------------------------------- */

const CONFIG = {
  DATA_VERSION: "2",

  // Issues CSV (read-only)
  SHEET_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTRwAjNAQxiPP8uR15t_vx03JkjgEBjgUwp2bpx8rsHx-JJxVDBZyf5ap77rAKrYHfgkVMwLJVm6pGn/pub?output=csv",

  // Not used in this version (events are local in browser).
  CALENDAR_API_URL: "",

  TREND_DAYS_RECENT: 7,
  TREND_DAYS_WINDOW: 14,

  RISK: {
    priorityWeight: { High: 3, Medium: 2, Low: 1, "": 1 },
    techBoosts: [
      ["timeout", 3],
      ["time out", 3],
      ["latency", 2],
      ["slow", 2],
      ["performance", 2],
      ["crash", 3],
      ["error", 2],
      ["exception", 2],
      ["down", 3],
    ],
    bizBoosts: [
      ["payment", 3],
      ["payments", 3],
      ["billing", 2],
      ["invoice", 1],
      ["checkout", 2],
      ["refund", 2],
      ["revenue", 3],
      ["vip", 2],
    ],
    opsBoosts: [
      ["prod ", 2],
      ["production", 2],
      ["deploy", 2],
      ["deployment", 2],
      ["rollback", 2],
      ["incident", 3],
      ["p0", 3],
      ["p1", 2],
      ["sla", 2],
    ],
    statusBoosts: { "on stage": 2, under: 1 },
    misalignedDelta: 1,
    highRisk: 9,
    critRisk: 13,
    staleDays: 10,
  },

  LABEL_KEYWORDS: {
    "Authentication / Login": [
      "login",
      "signin",
      "sign in",
      "password",
      "auth",
      "token",
      "session",
      "otp",
    ],
    "Payments / Billing": [
      "payment",
      "payments",
      "billing",
      "invoice",
      "card",
      "credit",
      "charge",
      "checkout",
      "refund",
    ],
    "Performance / Latency": [
      "slow",
      "slowness",
      "latency",
      "performance",
      "perf",
      "timeout",
      "time out",
      "lag",
    ],
    "Reliability / Errors": [
      "error",
      "errors",
      "exception",
      "500",
      "503",
      "fail",
      "failed",
      "crash",
      "down",
      "unavailable",
    ],
    "UI / UX": [
      "button",
      "screen",
      "page",
      "layout",
      "css",
      "ui",
      "ux",
      "alignment",
      "typo",
    ],
    "Data / Sync": [
      "sync",
      "synchron",
      "cache",
      "cached",
      "replica",
      "replication",
      "consistency",
      "out of date",
    ],
  },

  CHANGE: {
    overlapLookbackMinutes: 60,
    hotIssueRecentDays: 7,
    freezeWindows: [
      { dow: [5], startHour: 16, endHour: 23 }, // Friday evening
      { dow: [6], startHour: 0, endHour: 23 }, // Saturday
    ],
  },

  /**
   * F&B specific heuristics for MENA
   */
  FNB: {
    lookbackDays: 60,
    weekendDays: [5, 6], // Fri, Sat
    rushWindows: [
      { startHour: 12, endHour: 15, weight: 3, label: "Lunch rush" },
      { startHour: 19, endHour: 23, weight: 4, label: "Dinner / evening rush" },
    ],
    quietWindows: [
      { startHour: 3, endHour: 6, weight: -3, label: "Pre-opening quiet" },
      { startHour: 9, endHour: 11, weight: -1, label: "Late morning" },
      { startHour: 15, endHour: 17, weight: -1, label: "Mid-afternoon" },
    ],
    weekendWeight: 2,
    holidayWeight: 3,
    preferredSlotsLocal: [
      { hour: 3, minute: 0 },
      { hour: 9, minute: 30 },
      { hour: 15, minute: 0 },
      { hour: 17, minute: 0 },
    ],
    fixedHolidays: [
      { month: 1, day: 1, name: "New Year" },
      { month: 2, day: 14, name: "Valentine’s Day" },
      { month: 3, day: 21, name: "Mother’s Day (Arab world)" },
      { month: 12, day: 31, name: "New Year’s Eve" },
    ],
    keywordHolidayHints: [
      "ramadan",
      "eid",
      "iftar",
      "suhoor",
      "national day",
      "new year",
      "valentine",
      "mother's day",
    ],
  },
};

const LS_KEYS = {
  filters: "incheckFilters",
  theme: "theme",
  events: "incheckEvents",
  issues: "incheckIssues",
  issuesLastUpdated: "incheckIssuesLastUpdated",
  dataVersion: "incheckDataVersion",
  pageSize: "pageSize",
  view: "incheckView",
  accentColor: "incheckAccent",
  accentColorStorage: "incheckAccentColor",
};

/* -------------------------------------------------------
   Helpers
-------------------------------------------------------- */

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "onto",
  "when",
  "what",
  "where",
  "how",
  "why",
  "can",
  "could",
  "should",
  "would",
  "will",
  "just",
  "have",
  "has",
  "had",
  "been",
  "are",
  "is",
  "was",
  "were",
  "to",
  "in",
  "on",
  "of",
  "at",
  "by",
  "as",
  "it",
  "its",
  "be",
  "we",
  "you",
  "they",
  "our",
  "your",
  "their",
  "not",
  "no",
  "if",
  "else",
  "then",
  "than",
  "about",
  "after",
  "before",
  "more",
  "less",
  "also",
  "only",
  "very",
  "get",
  "got",
  "see",
  "seen",
  "use",
  "used",
  "using",
  "user",
  "issue",
  "bug",
  "ticket",
  "inc",
]);

const FNB_KEYWORDS = [
  "restaurant",
  "branch",
  "store",
  "table",
  "dine in",
  "dining",
  "delivery",
  "rider",
  "order",
  "orders",
  "menu",
  "kitchen",
  "kds",
  "pos",
  "cashier",
  "bill",
  "cheque",
  "check",
  "f&b",
  "food",
  "beverage",
  "queue",
  "drive thru",
  "drive-thru",
  "pickup",
  "aggregator",
  "talabat",
  "hungerstation",
  "jahez",
  "careem",
];

const U = {
  q: (s, r = document) => r.querySelector(s),
  qAll: (s, r = document) => Array.from(r.querySelectorAll(s)),
  now: () => Date.now(),
  fmtTS: (d) => {
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x)) return "—";
    return x.toISOString().replace("T", " ").slice(0, 16);
  },
  escapeHtml: (s) =>
    String(s).replace(/[&<>"']/g, (m) =>
      (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m]
      )
    ),
  escapeAttr: (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;"),
  pad: (n) => String(n).padStart(2, "0"),
  dateAddDays: (d, days) => {
    const base = d instanceof Date ? d : new Date(d);
    return new Date(base.getTime() + days * 86400000);
  },
  daysAgo: (n) => new Date(Date.now() - n * 86400000),
  isBetween: (d, a, b) => {
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x)) return false;
    const min = a ? (a instanceof Date ? a : new Date(a)) : null;
    const max = b ? (b instanceof Date ? b : new Date(b)) : null;
    if (min && x < min) return false;
    if (max && x >= max) return false;
    return true;
  },
};

function UndefaultCount(arr) {
  const m = new Map();
  arr.forEach((t) => m.set(t, (m.get(t) || 0) + 1));
  return m;
}

/* -------------------------------------------------------
   Filters state
-------------------------------------------------------- */

const Filters = {
  state: {
    search: "",
    module: "All",
    priority: "All",
    status: "All",
    start: "",
    end: "",
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
  },
};

/* -------------------------------------------------------
   DataStore
-------------------------------------------------------- */

const DataStore = {
  rows: [],
  computed: new Map(), // id -> { tokens, tf, idf, risk, suggestions }
  byId: new Map(),
  byModule: new Map(),
  byStatus: new Map(),
  byPriority: new Map(),
  df: new Map(),
  N: 0,
  events: [],

  normalizeStatus(s) {
    const i = (s || "").trim().toLowerCase();
    if (!i) return "Not Started Yet";
    if (i.startsWith("resolved")) return "Resolved";
    if (i.startsWith("under")) return "Under Development";
    if (i.startsWith("rejected")) return "Rejected";
    if (i.startsWith("on hold")) return "On Hold";
    if (i.startsWith("not started")) return "Not Started Yet";
    if (i.startsWith("sent")) return "Sent";
    if (i.startsWith("on stage")) return "On Stage";
    return s || "Not Started Yet";
  },
  normalizePriority(p) {
    const i = (p || "").trim().toLowerCase();
    if (!i) return "";
    if (i.startsWith("h")) return "High";
    if (i.startsWith("m")) return "Medium";
    if (i.startsWith("l")) return "Low";
    return p;
  },
  normalizeRow(raw) {
    const lower = {};
    for (const k in raw) {
      if (!k) continue;
      lower[k.toLowerCase().replace(/\s+/g, " ").trim()] = String(
        raw[k] ?? ""
      ).trim();
    }
    const pick = (...keys) => {
      for (const key of keys) {
        if (lower[key]) return lower[key];
      }
      return "";
    };
    return {
      id: pick("ticket id", "id"),
      module: pick("impacted module", "module", "issue location") || "Unspecified",
      title: pick("title"),
      desc: pick("description"),
      file: pick("file upload", "link", "url"),
      priority: DataStore.normalizePriority(pick("priority")),
      status: DataStore.normalizeStatus(pick("status") || "Not Started Yet"),
      type: pick("category", "type"),
      date: pick("timestamp", "date", "created at"),
      log: pick("log", "logs", "comment", "notes"),
    };
  },
  tokenize(issue) {
    const text = [issue.title, issue.desc, issue.log]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((w) => w && w.length > 2 && !STOPWORDS.has(w));
  },
  hydrate(csvText) {
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    }).data
      .map(DataStore.normalizeRow)
      .filter((r) => r.id && r.id.trim() !== "");
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

    this.rows.forEach((r) => {
      this.byId.set(r.id, r);
      if (!this.byModule.has(r.module)) this.byModule.set(r.module, []);
      this.byModule.get(r.module).push(r);
      if (!this.byStatus.has(r.status)) this.byStatus.set(r.status, []);
      this.byStatus.get(r.status).push(r);
      if (!this.byPriority.has(r.priority))
        this.byPriority.set(r.priority, []);
      this.byPriority.get(r.priority).push(r);

      const toks = DataStore.tokenize(r);
      const uniq = new Set(toks);
      uniq.forEach((t) => this.df.set(t, (this.df.get(t) || 0) + 1));
      this.computed.set(r.id, { tokens: new Set(toks), tf: UndefaultCount(toks) });
    });

    const idf = new Map();
    this.df.forEach((df, term) =>
      idf.set(term, Math.log((this.N + 1) / (df + 1)) + 1)
    );
    this.computed.forEach((meta) => (meta.idf = idf));

    this.rows.forEach((r) => {
      const risk = Risk.computeRisk(r);
      const categories = Risk.suggestCategories(r);
      const sPrio = Risk.suggestPriority(r, risk.total);
      const reasons = Risk.explainRisk(r);
      const meta = this.computed.get(r.id);
      meta.risk = { ...risk, reasons };
      meta.suggestions = { priority: sPrio, categories };
    });
  },
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
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return `Last updated: ${d.toLocaleString()}`;
  },
};

/* -------------------------------------------------------
   Risk engine (severity / impact / urgency)
-------------------------------------------------------- */

function prioMap(p) {
  return { High: 3, Medium: 2, Low: 1 }[p] || 0;
}
function prioGap(suggested, current) {
  return prioMap(suggested) - prioMap(current);
}

const Risk = {
  scoreFromBoosts(text, rules) {
    let s = 0;
    for (const [kw, val] of rules) {
      if (text.includes(kw)) s += val;
    }
    return s;
  },
  computeRisk(issue) {
    const txt =
      [issue.title, issue.desc, issue.log].filter(Boolean).join(" ").toLowerCase() +
      " ";
    const basePriority = CONFIG.RISK.priorityWeight[issue.priority || ""] || 1;

    const tech = basePriority + this.scoreFromBoosts(txt, CONFIG.RISK.techBoosts);
    const biz = this.scoreFromBoosts(txt, CONFIG.RISK.bizBoosts);
    const ops = this.scoreFromBoosts(txt, CONFIG.RISK.opsBoosts);

    let total = tech + biz + ops;

    const st = (issue.status || "").toLowerCase();
    for (const k in CONFIG.RISK.statusBoosts) {
      if (st.startsWith(k)) total += CONFIG.RISK.statusBoosts[k];
    }

    let timeRisk = 0;
    let ageDays = null;
    const isOpen = !(st.startsWith("resolved") || st.startsWith("rejected"));

    if (issue.date) {
      const d = new Date(issue.date);
      if (!isNaN(d)) {
        ageDays = (Date.now() - d.getTime()) / 86400000;
        if (isOpen && total >= CONFIG.RISK.highRisk) {
          if (ageDays <= 14) timeRisk += 2;
          if (ageDays >= 30) timeRisk += 3;
        }
      }
    }
    total += timeRisk;

    let severity = basePriority;
    if (/p0|sev0|outage|down|data loss|breach|security/i.test(txt)) severity += 3;
    if (/p1|sev1|incident|sla/i.test(txt)) severity += 2;
    if (/p2|degraded/i.test(txt)) severity += 1;

    let impact = 1;
    if (/payment|billing|checkout|revenue|invoice|subscription|signup|onboarding/i.test(
      txt
    ))
      impact += 2;
    if (/login|auth|authentication|token|session/i.test(txt)) impact += 1.5;
    if (/admin|internal|report/i.test(txt)) impact += 0.5;

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
      urgency: urgScore,
    };
  },
  suggestCategories(issue) {
    const text = [issue.title, issue.desc, issue.log]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const res = [];
    Object.entries(CONFIG.LABEL_KEYWORDS).forEach(([label, kws]) => {
      let hits = 0;
      kws.forEach((k) => {
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
    if (s >= CONFIG.RISK.highRisk) return "High";
    if (s >= 6) return "Medium";
    return "Low";
  },
  explainRisk(issue) {
    const txt =
      [issue.title, issue.desc, issue.log].filter(Boolean).join(" ").toLowerCase() +
      " ";
    const picks = [];
    const push = (kw) => {
      if (txt.includes(kw)) picks.push(kw);
    };
    [...CONFIG.RISK.techBoosts, ...CONFIG.RISK.bizBoosts, ...CONFIG.RISK.opsBoosts].forEach(
      ([kw]) => push(kw)
    );
    if ((issue.status || "").toLowerCase().startsWith("on stage")) picks.push("on stage");
    if ((issue.status || "").toLowerCase().startsWith("under"))
      picks.push("under development");

    if (issue.date) {
      const d = new Date(issue.date);
      if (!isNaN(d)) {
        const ageDays = (Date.now() - d.getTime()) / 86400000;
        if (ageDays <= 14) picks.push("recent");
        else if (ageDays >= 30) picks.push("stale");
      }
    }

    return Array.from(new Set(picks)).slice(0, 6);
  },
};

/* -------------------------------------------------------
   DSL
-------------------------------------------------------- */

const DSL = {
  parse(text) {
    const lower = (text || "").toLowerCase();
    let w = " " + lower + " ";
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
      words: [],
    };
    const eat = (re, key, fn = (v) => v) => {
      const m = w.match(re);
      if (m) {
        out[key] = fn(m[1].trim());
        w = w.replace(m[0], " ");
      }
    };
    eat(/\bmodule:([^\s]+)/, "module");
    eat(/\bstatus:([^\s]+)/, "status");
    eat(/\bpriority:([^\s]+)/, "priority");
    eat(/\bid:([^\s]+)/, "id");
    eat(/\btype:([^\s]+)/, "type");
    eat(/\bmissing:([^\s]+)/, "missing");

    const rv = lower.match(/\brisk([><=]{1,2})(\d+)/);
    if (rv) {
      out.riskOp = rv[1];
      out.riskVal = +rv[2];
      w = w.replace(rv[0], " ");
    }
    const sv = lower.match(/\bseverity([><=]{1,2})(\d+)/);
    if (sv) {
      out.severityOp = sv[1];
      out.severityVal = +sv[2];
      w = w.replace(sv[0], " ");
    }
    const iv = lower.match(/\bimpact([><=]{1,2})(\d+)/);
    if (iv) {
      out.impactOp = iv[1];
      out.impactVal = +iv[2];
      w = w.replace(iv[0], " ");
    }
    const uv = lower.match(/\burgency([><=]{1,2})(\d+)/);
    if (uv) {
      out.urgencyOp = uv[1];
      out.urgencyVal = +uv[2];
      w = w.replace(uv[0], " ");
    }

    eat(/\blast:(\d+)d/, "lastDays", (n) => +n);
    const av = lower.match(/\bage([><=]{1,2})(\d+)d/);
    if (av) {
      out.ageOp = av[1];
      out.ageVal = +av[2];
      w = w.replace(av[0], " ");
    }

    eat(/\bcluster:([^\s]+)/, "cluster");
    eat(/\bsort:(risk|date|priority)/, "sort");
    eat(/\bevent:(\S+)/, "eventScope");

    out.words = w
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t));
    return out;
  },
  matches(issue, meta, q) {
    if (q.module && !(issue.module || "").toLowerCase().includes(q.module))
      return false;
    if (q.priority) {
      const p = q.priority[0].toUpperCase();
      if (["H", "M", "L"].includes(p)) {
        if ((issue.priority || "")[0] !== p) return false;
      } else if (!(issue.priority || "").toLowerCase().includes(q.priority))
        return false;
    }
    if (q.status) {
      const st = (issue.status || "").toLowerCase();
      if (q.status === "open") {
        const closed = st.startsWith("resolved") || st.startsWith("rejected");
        if (closed) return false;
      } else if (q.status === "closed") {
        const closed = st.startsWith("resolved") || st.startsWith("rejected");
        if (!closed) return false;
      } else if (!st.includes(q.status)) return false;
    }
    if (q.id && !(issue.id || "").toLowerCase().includes(q.id)) return false;
    if (q.type && !(issue.type || "").toLowerCase().includes(q.type)) return false;
    if (q.missing) {
      const m = q.missing;
      if (m === "priority" && issue.priority) return false;
      if (m === "module" && issue.module && issue.module !== "Unspecified")
        return false;
      if (m === "type" && issue.type) return false;
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
      if (op === ">") pass = ageDays > b;
      else if (op === ">=") pass = ageDays >= b;
      else if (op === "<") pass = ageDays < b;
      else if (op === "<=") pass = ageDays <= b;
      else if (op === "=" || op === "==") pass = Math.round(ageDays) === b;
      if (!pass) return false;
    }
    if (q.cluster) {
      const t = q.cluster.toLowerCase();
      if (!meta.tokens || !Array.from(meta.tokens).some((x) => x.includes(t)))
        return false;
    }
    const risk = meta.risk || {};
    if (q.riskOp) {
      const rv = risk.total || 0;
      const op = q.riskOp,
        b = q.riskVal;
      let pass = false;
      if (op === ">") pass = rv > b;
      else if (op === ">=") pass = rv >= b;
      else if (op === "<") pass = rv < b;
      else if (op === "<=") pass = rv <= b;
      else if (op === "=" || op === "==") pass = rv === b;
      if (!pass) return false;
    }
    const cmpNum = (val, op, b) => {
      const v = val || 0;
      if (op === ">") return v > b;
      if (op === ">=") return v >= b;
      if (op === "<") return v < b;
      if (op === "<=") return v <= b;
      if (op === "=" || op === "==") return v === b;
      return true;
    };
    if (q.severityOp && !cmpNum(risk.severity, q.severityOp, q.severityVal))
      return false;
    if (q.impactOp && !cmpNum(risk.impact, q.impactOp, q.impactVal)) return false;
    if (q.urgencyOp && !cmpNum(risk.urgency, q.urgencyOp, q.urgencyVal))
      return false;

    if (q.words && q.words.length) {
      const txt = [issue.title, issue.desc, issue.log]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      for (const w of q.words) {
        if (!txt.includes(w)) return false;
      }
    }
    return true;
  },
};

/* -------------------------------------------------------
   Calendar helpers
-------------------------------------------------------- */

const CalendarLink = {
  riskBadgeClass(score) {
    if (score >= CONFIG.RISK.critRisk) return "risk-crit";
    if (score >= CONFIG.RISK.highRisk) return "risk-high";
    if (score >= 6) return "risk-med";
    return "risk-low";
  },
};

function computeChangeCollisions(issues, events) {
  const flagsById = new Map();
  const byId = (id) => {
    let f = flagsById.get(id);
    if (!f) {
      f = { collision: false, freeze: false, hotIssues: false };
      flagsById.set(id, f);
    }
    return f;
  };
  if (!events || !events.length) return { collisions: [], flagsById };

  const openIssues = issues.filter((i) => {
    const st = (i.status || "").toLowerCase();
    return !(st.startsWith("resolved") || st.startsWith("rejected"));
  });

  const highRiskIssues = openIssues.filter((i) => {
    const meta = DataStore.computed.get(i.id) || {};
    const risk = meta.risk?.total || 0;
    if (risk < CONFIG.RISK.highRisk) return false;
    if (!i.date) return true;
    const d = new Date(i.date);
    if (isNaN(d)) return true;
    return U.isBetween(d, U.daysAgo(CONFIG.CHANGE.hotIssueRecentDays), null);
  });

  const normalized = events
    .map((ev) => {
      const start = ev.start ? new Date(ev.start) : null;
      const end = ev.end ? new Date(ev.end) : null;
      return { ...ev, _start: start, _end: end };
    })
    .filter((ev) => ev._start && !isNaN(ev._start));
  normalized.sort((a, b) => a._start - b._start);

  const collisions = [];
  const defaultDurMs = CONFIG.CHANGE.overlapLookbackMinutes * 60000;
  for (let i = 0; i < normalized.length; i++) {
    const a = normalized[i];
    const aEnd = a._end || new Date(a._start.getTime() + defaultDurMs);
    for (let j = i + 1; j < normalized.length; j++) {
      const b = normalized[j];
      const envA = (a.env || a.environment || "Prod").toLowerCase();
      const envB = (b.env || b.environment || "Prod").toLowerCase();
      if (envA !== envB) continue;
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
    events.forEach((ev) => {
      if (!ev.start) return;
      const d = new Date(ev.start);
      if (isNaN(d)) return;
      const dow = d.getDay();
      const hour = d.getHours();
      const inFreeze = CONFIG.CHANGE.freezeWindows.some(
        (win) => win.dow.includes(dow) && hour >= win.startHour && hour < win.endHour
      );
      if (inFreeze) byId(ev.id).freeze = true;
    });
  }

  events.forEach((ev) => {
    const flags = byId(ev.id);
    const modulesArr = Array.isArray(ev.modules)
      ? ev.modules
      : typeof ev.modules === "string"
      ? ev.modules.split(",").map((s) => s.trim())
      : [];
    let rel = [];
    if (modulesArr.length) {
      rel = highRiskIssues.filter((i) => modulesArr.includes(i.module));
    } else {
      const title = (ev.title || "").toLowerCase();
      rel = highRiskIssues.filter(
        (i) => (i.module || "") && title.includes((i.module || "").toLowerCase())
      );
    }
    if (rel.length) flags.hotIssues = true;
  });

  return { collisions, flagsById };
}

function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}T${U.pad(
    d.getHours()
  )}:${U.pad(d.getMinutes())}`;
}
function toLocalDateValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
}

/* -------------------------------------------------------
   DOM cache
-------------------------------------------------------- */

const E = {};
function cacheEls() {
  [
    "issuesTable",
    "issuesTbody",
    "tbodySkeleton",
    "rowCount",
    "moduleFilter",
    "priorityFilter",
    "statusFilter",
    "resetBtn",
    "refreshNow",
    "exportCsv",
    "kpis",
    "issueModal",
    "modalBody",
    "modalTitle",
    "copyId",
    "copyLink",
    "modalClose",
    "drawerBtn",
    "sidebar",
    "spinner",
    "toast",
    "searchInput",
    "themeSelect",
    "firstPage",
    "prevPage",
    "nextPage",
    "lastPage",
    "pageInfo",
    "pageSize",
    "createTicketBtn",
    "startDateFilter",
    "endDateFilter",
    "issuesTab",
    "calendarTab",
    "insightsTab",
    "issuesView",
    "calendarView",
    "insightsView",
    "addEventBtn",
    "eventModal",
    "eventModalTitle",
    "eventModalClose",
    "eventForm",
    "eventTitle",
    "eventType",
    "eventIssueId",
    "eventStart",
    "eventEnd",
    "eventDescription",
    "eventSave",
    "eventCancel",
    "eventDelete",
    "eventIssueLinkedInfo",
    "aiPatternsList",
    "aiLabelsList",
    "aiRisksList",
    "aiClusters",
    "aiScopeText",
    "aiSignalsText",
    "aiTrendsList",
    "aiModulesTableBody",
    "aiTriageList",
    "aiEventsList",
    "aiQueryInput",
    "aiQueryRun",
    "aiQueryResults",
    "aiQueryApplyFilters",
    "aiIncidentsList",
    "aiEmergingStable",
    "aiOpsCockpit",
    "syncIssuesText",
    "syncIssuesDot",
    "syncEventsText",
    "syncEventsDot",
    "aiAnalyzing",
    "eventFilterDeployment",
    "eventFilterMaintenance",
    "eventFilterRelease",
    "eventFilterOther",
    "loadingStatus",
    "issuesSummaryText",
    "activeFiltersChips",
    "calendarTz",
    "onlineStatusChip",
    "accentColor",
    "shortcutsHelp",
    "aiQueryExport",
    "eventAllDay",
    "eventEnv",
    "eventOwner",
    "eventStatus",
    "eventModules",
    "eventImpactType",
    "fnbModuleSelect",
    "fnbDateInput",
    "fnbDurationInput",
    "fnbHorizonSelect",
    "fnbScopeInput",
    "fnbSuggestBtn",
    "fnbSlotsList",
  ].forEach((id) => (E[id] = document.getElementById(id)));
}

/* -------------------------------------------------------
   UI helpers
-------------------------------------------------------- */

const UI = {
  toast(msg, ms = 3500) {
    if (!E.toast) return;
    E.toast.textContent = msg;
    E.toast.style.display = "block";
    setTimeout(() => {
      if (E.toast) E.toast.style.display = "none";
    }, ms);
  },
  spinner(v = true) {
    if (E.spinner) E.spinner.style.display = v ? "flex" : "none";
    if (E.loadingStatus) E.loadingStatus.textContent = v ? "Loading…" : "";
  },
  setSync(which, ok, when) {
    const txt = which === "issues" ? E.syncIssuesText : E.syncEventsText;
    const dot = which === "issues" ? E.syncIssuesDot : E.syncEventsDot;
    if (!txt || !dot) return;
    txt.textContent = `${which === "issues" ? "Issues" : "Events"}: ${
      when ? U.fmtTS(when) : "local"
    }`;
    dot.className = "dot " + (ok ? "ok" : "err");
  },
  setAnalyzing(v) {
    if (E.aiAnalyzing) E.aiAnalyzing.style.display = v ? "block" : "none";
  },
  skeleton(show) {
    if (!E.issuesTbody || !E.tbodySkeleton) return;
    E.tbodySkeleton.style.display = show ? "" : "none";
    E.issuesTbody.style.display = show ? "none" : "";
  },
};

/* -------------------------------------------------------
   Grid state
-------------------------------------------------------- */

const GridState = {
  sortKey: null,
  sortAsc: true,
  page: 1,
  pageSize: +(localStorage.getItem(LS_KEYS.pageSize) || 20),
};

/* -------------------------------------------------------
   Issues UI
-------------------------------------------------------- */

UI.Issues = {
  renderFilters() {
    const uniq = (a) =>
      [...new Set(a.filter(Boolean).map((v) => v.trim()))].sort((a, b) =>
        a.localeCompare(b)
      );
    if (E.moduleFilter)
      E.moduleFilter.innerHTML = ["All", ...uniq(DataStore.rows.map((r) => r.module))]
        .map((v) => `<option>${v}</option>`)
        .join("");
    if (E.priorityFilter)
      E.priorityFilter.innerHTML = [
        "All",
        ...uniq(DataStore.rows.map((r) => r.priority)),
      ]
        .map((v) => `<option>${v}</option>`)
        .join("");
    if (E.statusFilter)
      E.statusFilter.innerHTML = ["All", ...uniq(DataStore.rows.map((r) => r.status))]
        .map((v) => `<option>${v}</option>`)
        .join("");
  },
  applyFilters() {
    const s = Filters.state;
    const qstr = (s.search || "").toLowerCase().trim();
    const terms = qstr ? qstr.split(/\s+/).filter(Boolean) : [];
    const start = s.start ? new Date(s.start) : null;
    const end = s.end ? U.dateAddDays(s.end, 1) : null;

    return DataStore.rows.filter((r) => {
      const hay = [r.id, r.module, r.title, r.desc, r.log]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (terms.length && !terms.every((t) => hay.includes(t))) return false;

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
        (!s.module || s.module === "All" || r.module === s.module) &&
        (!s.priority || s.priority === "All" || r.priority === s.priority) &&
        (!s.status || s.status === "All" || r.status === s.status) &&
        keepDate
      );
    });
  },
  renderKPIs(list) {
    if (!E.kpis) return;
    const total = list.length,
      counts = {};
    list.forEach((r) => (counts[r.status] = (counts[r.status] || 0) + 1));
    E.kpis.innerHTML = "";
    const add = (label, val) => {
      const pct = total ? Math.round((val * 100) / total) : 0;
      const d = document.createElement("div");
      d.className = "card kpi";
      d.tabIndex = 0;
      d.setAttribute("role", "button");
      d.setAttribute("aria-label", `${label}: ${val} (${pct} percent)`);

      const isTotal = label === "Total Issues";
      d.innerHTML = `
        <div class="label">${label}</div>
        <div class="value">${val}</div>
        <div class="sub">${pct}%</div>
      `;

      d.onclick = () => {
        if (isTotal) {
          Filters.state = {
            search: "",
            module: "All",
            priority: "All",
            status: "All",
            start: "",
            end: "",
          };
        } else {
          Filters.state.status = label;
          Filters.state.search = "";
        }
        Filters.save();
        UI.refreshAll();
      };
      d.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          d.click();
        }
      });
      E.kpis.appendChild(d);
    };
    add("Total Issues", total);
    Object.entries(counts).forEach(([s, v]) => add(s, v));
  },
  renderTable(list) {
    if (!E.issuesTbody) return;
    const { sortKey, sortAsc } = GridState;
    const sorted = sortKey
      ? [...list].sort((a, b) => {
          const va = a[sortKey] || "",
            vb = b[sortKey] || "";
          if (sortKey === "date") {
            const da = new Date(va),
              db = new Date(vb);
            if (isNaN(da) && isNaN(db)) return 0;
            if (isNaN(da)) return 1;
            if (isNaN(db)) return -1;
            return da - db;
          }
          return String(va).localeCompare(String(vb), undefined, {
            numeric: true,
            sensitivity: "base",
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
        : "No rows";
    }
    if (E.pageInfo) E.pageInfo.textContent = `Page ${GridState.page} / ${pages}`;
    ["firstPage", "prevPage", "nextPage", "lastPage"].forEach((id) => {
      const btn = E[id];
      if (!btn) return;
      const atFirst = GridState.page <= 1,
        atLast = GridState.page >= pages;
      if (id === "firstPage" || id === "prevPage") btn.disabled = atFirst;
      else btn.disabled = atLast;
      if (btn.disabled) btn.setAttribute("disabled", "true");
      else btn.removeAttribute("disabled");
    });

    const badgeStatus = (s) =>
      `<span class="pill status-${(s || "").replace(/\s/g, "\\ ")}">${U.escapeHtml(
        s || "-"
      )}</span>`;
    const badgePrio = (p) =>
      `<span class="pill priority-${p || ""}">${U.escapeHtml(p || "-")}</span>`;

    if (pageData.length) {
      E.issuesTbody.innerHTML = pageData
        .map(
          (r) => `
        <tr role="button" tabindex="0" aria-label="Open issue ${U.escapeHtml(
          r.id || ""
        )}" data-id="${U.escapeAttr(r.id)}">
          <td>${U.escapeHtml(r.id || "-")}</td>
          <td>${U.escapeHtml(r.module || "-")}</td>
          <td>${U.escapeHtml(r.title || "-")}</td>
          <td>${badgePrio(r.priority || "-")}</td>
          <td>${badgeStatus(r.status || "-")}</td>
          <td>${U.escapeHtml(r.date || "-")}</td>
          <td>${U.escapeHtml(r.log || "-")}</td>
          <td>${
            r.file
              ? `<a href="${U.escapeAttr(
                  r.file
                )}" target="_blank" rel="noopener noreferrer" aria-label="Open attachment link">🔗</a>`
              : "-"
          }</td>
        </tr>
      `
        )
        .join("");
    } else {
      const parts = [];
      if (Filters.state.search) parts.push(`search "${Filters.state.search}"`);
      if (Filters.state.module && Filters.state.module !== "All")
        parts.push(`module = ${Filters.state.module}`);
      if (Filters.state.priority && Filters.state.priority !== "All")
        parts.push(`priority = ${Filters.state.priority}`);
      if (Filters.state.status && Filters.state.status !== "All")
        parts.push(`status = ${Filters.state.status}`);
      if (Filters.state.start) parts.push(`from ${Filters.state.start}`);
      if (Filters.state.end) parts.push(`to ${Filters.state.end}`);
      const desc = parts.length ? parts.join(", ") : "no filters";
      E.issuesTbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center;color:var(--muted)">
            No issues found for ${U.escapeHtml(desc)}.
            <button type="button" class="btn sm" id="clearFiltersBtn" style="margin-left:8px">Clear filters</button>
          </td>
        </tr>`;
      const clearBtn = document.getElementById("clearFiltersBtn");
      if (clearBtn)
        clearBtn.addEventListener("click", () => {
          Filters.state = {
            search: "",
            module: "All",
            priority: "All",
            status: "All",
            start: "",
            end: "",
          };
          Filters.save();
          if (E.searchInput) E.searchInput.value = "";
          if (E.startDateFilter) E.startDateFilter.value = "";
          if (E.endDateFilter) E.endDateFilter.value = "";
          UI.Issues.renderFilters();
          UI.refreshAll();
        });
    }

    E.issuesTbody.querySelectorAll("tr[data-id]").forEach((tr) => {
      tr.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          UI.Modals.openIssue(tr.getAttribute("data-id"));
        }
      });
      tr.addEventListener("click", (e) => {
        if (!e.target.closest("a")) UI.Modals.openIssue(tr.getAttribute("data-id"));
      });
    });

    U.qAll("#issuesTable thead th").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      th.setAttribute("aria-sort", "none");
    });
    if (GridState.sortKey) {
      const th = U.q(`#issuesTable thead th[data-key="${GridState.sortKey}"]`);
      if (th) {
        th.classList.add(GridState.sortAsc ? "sorted-asc" : "sorted-desc");
        th.setAttribute("aria-sort", GridState.sortAsc ? "ascending" : "descending");
      }
    }
  },
  renderCharts(list) {
    if (typeof Chart === "undefined") return;
    const cssVar = (n) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const statusColors = {
      Resolved: cssVar("--status-resolved"),
      "Under Development": cssVar("--status-underdev"),
      Rejected: cssVar("--status-rejected"),
      "On Hold": cssVar("--status-onhold"),
      "Not Started Yet": cssVar("--status-notstarted"),
      Sent: cssVar("--status-sent"),
      "On Stage": cssVar("--status-onstage"),
    };
    const priorityColors = {
      High: cssVar("--priority-high"),
      Medium: cssVar("--priority-medium"),
      Low: cssVar("--priority-low"),
    };
    const group = (arr, k) =>
      arr.reduce((m, r) => {
        const key = r[k] || "Unspecified";
        m[key] = (m[key] || 0) + 1;
        return m;
      }, {});
    const make = (id, type, data, colors = {}) => {
      const el = U.q("#" + id);
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
              backgroundColor: labels.map((l) => colors[l] || cssVar("--accent")),
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: type !== "bar" },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const total = values.reduce((a, b) => a + b, 0) || 1;
                  return `${ctx.raw} (${Math.round((ctx.raw * 100) / total)}%)`;
                },
              },
            },
          },
          scales:
            type === "bar"
              ? {
                  x: { grid: { color: "rgba(128,128,128,.1)" } },
                  y: {
                    beginAtZero: true,
                    grid: { color: "rgba(128,128,128,.12)" },
                  },
                }
              : {},
        },
      });
    };
    make("byModule", "bar", group(list, "module"));
    make("byPriority", "doughnut", group(list, "priority"), priorityColors);
    make("byStatus", "bar", group(list, "status"), statusColors);
    make("byType", "bar", group(list, "type"));
  },
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
  if (s.search) addChip("Search", s.search, "search");
  if (s.module && s.module !== "All") addChip("Module", s.module, "module");
  if (s.priority && s.priority !== "All") addChip("Priority", s.priority, "priority");
  if (s.status && s.status !== "All") addChip("Status", s.status, "status");
  if (s.start) addChip("From", s.start, "start");
  if (s.end) addChip("To", s.end, "end");

  if (chips.length) {
    E.activeFiltersChips.innerHTML = chips.join("");
  } else {
    E.activeFiltersChips.innerHTML =
      '<span class="muted" style="font-size:11px;">No filters applied.</span>';
  }

  E.activeFiltersChips.querySelectorAll("[data-filter-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-filter-key");
      if (!key) return;
      if (key === "search") Filters.state.search = "";
      if (key === "module") Filters.state.module = "All";
      if (key === "priority") Filters.state.priority = "All";
      if (key === "status") Filters.state.status = "All";
      if (key === "start") Filters.state.start = "";
      if (key === "end") Filters.state.end = "";

      Filters.save();
      if (E.searchInput && key === "search") E.searchInput.value = "";
      if (E.moduleFilter && key === "module") E.moduleFilter.value = "All";
      if (E.priorityFilter && key === "priority") E.priorityFilter.value = "All";
      if (E.statusFilter && key === "status") E.statusFilter.value = "All";
      if (E.startDateFilter && key === "start") E.startDateFilter.value = "";
      if (E.endDateFilter && key === "end") E.endDateFilter.value = "";

      UI.refreshAll();
    });
  });
};

UI.Issues.renderSummary = function (list) {
  if (!E.issuesSummaryText) return;
  const total = list.length;
  let open = 0;
  let highRisk = 0;
  list.forEach((r) => {
    const st = (r.status || "").toLowerCase();
    const isClosed = st.startsWith("resolved") || st.startsWith("rejected");
    if (!isClosed) open++;
    const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
    if (risk >= CONFIG.RISK.highRisk) highRisk++;
  });
  const last = IssuesCache.lastLabel();
  E.issuesSummaryText.textContent =
    `${total} issue${total === 1 ? "" : "s"} · ${open} open · ${highRisk} high-risk` +
    (last ? ` · ${last}` : "");
};

/* -------------------------------------------------------
   AI Analytics
-------------------------------------------------------- */

const Analytics = {
  _debounce: null,
  refresh(list) {
    clearTimeout(this._debounce);
    UI.setAnalyzing(true);
    this._debounce = setTimeout(() => this._render(list), 80);
  },
  _render(list) {
    if (!list || !list.length) {
      if (E.aiPatternsList) E.aiPatternsList.innerHTML = "<li>No data yet.</li>";
      if (E.aiLabelsList) E.aiLabelsList.innerHTML = "<li>No data yet.</li>";
      if (E.aiTrendsList) E.aiTrendsList.innerHTML = "<li>No data yet.</li>";
      if (E.aiRisksList) E.aiRisksList.innerHTML = "<li>No data yet.</li>";
      if (E.aiModulesTableBody)
        E.aiModulesTableBody.innerHTML =
          '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No modules.</td></tr>';
      if (E.aiOpsCockpit)
        E.aiOpsCockpit.innerHTML = "<li>No ops signals yet.</li>";
      FNBPlanner.refresh(DataStore.rows || []);
      UI.setAnalyzing(false);
      return;
    }

    // Patterns
    const recentCut = CONFIG.TREND_DAYS_RECENT;
    const recent = list.filter((r) => U.isBetween(r.date, U.daysAgo(recentCut), null));
    const termCounts = new Map();
    recent.forEach((r) => {
      const t = DataStore.computed.get(r.id)?.tokens || new Set();
      t.forEach((w) => termCounts.set(w, (termCounts.get(w) || 0) + 1));
    });
    if (E.aiPatternsList) {
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
            .join("")
        : "<li>No strong repeated terms recently.</li>";
    }

    // Suggested labels
    if (E.aiLabelsList) {
      const catCount = new Map();
      list.forEach((r) => {
        const cats = DataStore.computed.get(r.id)?.suggestions?.categories || [];
        cats.forEach((c) => catCount.set(c.label, (catCount.get(c.label) || 0) + 1));
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
            .join("")
        : "<li>No clear category suggestions yet.</li>";
    }

    // Scope text
    if (E.aiScopeText)
      E.aiScopeText.textContent = `Analyzing ${list.length} issues (${recent.length} recent, ~last ${recentCut} days).`;
    if (E.aiSignalsText) {
      const signals = [
        "timeout",
        "payments",
        "billing",
        "login",
        "auth",
        "error",
        "crash",
      ].filter((t) => termCounts.has(t));
      E.aiSignalsText.textContent = signals.length
        ? `Recent mentions: ${signals.join(", ")}.`
        : "No strong recurring signals.";
    }

    // Trends
    if (E.aiTrendsList) {
      const oldStart = U.daysAgo(CONFIG.TREND_DAYS_WINDOW),
        mid = U.daysAgo(CONFIG.TREND_DAYS_RECENT);
      const oldCounts = new Map(),
        newCounts = new Map();
      const inHalf = (r) => {
        const d = new Date(r.date);
        if (isNaN(d)) return null;
        if (d < mid && d >= oldStart) return "old";
        if (d >= mid) return "new";
        return null;
      };
      list.forEach((r) => {
        const half = inHalf(r);
        if (!half) return;
        const toks = DataStore.computed.get(r.id)?.tokens || new Set();
        const tgt = half === "old" ? oldCounts : newCounts;
        new Set(toks).forEach((t) => tgt.set(t, (tgt.get(t) || 0) + 1));
      });
      const trendTerms = new Set([...oldCounts.keys(), ...newCounts.keys()]);
      const trend = [];
      trendTerms.forEach((t) => {
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
              (o) =>
                `<li><strong>${U.escapeHtml(o.t)}</strong> – ${o.new} vs ${o.old} <span class="muted">(Δ ${
                  o.delta >= 0 ? `+${o.delta}` : o.delta
                })</span></li>`
            )
            .join("")
        : "<li>No strong increases.</li>";
    }

    // Incidents
    if (E.aiIncidentsList) {
      const incidentWords = ["incident", "outage", "p0", "p1", "major", "sla"];
      const incidents = list
        .filter((r) => {
          const txt = [r.title, r.desc, r.log].filter(Boolean).join(" ").toLowerCase();
          return incidentWords.some((w) => txt.includes(w));
        })
        .slice(0, 10);
      E.aiIncidentsList.innerHTML = incidents.length
        ? incidents
            .map(
              (r) => `
      <li><button class="btn sm" data-open="${U.escapeAttr(
        r.id
      )}">${U.escapeHtml(r.id)}</button> ${U.escapeHtml(r.title || "")}</li>`
            )
            .join("")
        : "<li>No incident-like issues detected.</li>";
    }

    // Emerging vs stable
    if (E.aiEmergingStable) {
      const oldStart = U.daysAgo(CONFIG.TREND_DAYS_WINDOW),
        mid = U.daysAgo(CONFIG.TREND_DAYS_RECENT);
      const oldCounts = new Map(),
        newCounts = new Map();
      const inHalf = (r) => {
        const d = new Date(r.date);
        if (isNaN(d)) return null;
        if (d < mid && d >= oldStart) return "old";
        if (d >= mid) return "new";
        return null;
      };
      list.forEach((r) => {
        const half = inHalf(r);
        if (!half) return;
        const toks = DataStore.computed.get(r.id)?.tokens || new Set();
        const tgt = half === "old" ? oldCounts : newCounts;
        new Set(toks).forEach((t) => tgt.set(t, (tgt.get(t) || 0) + 1));
      });

      const recentCut = CONFIG.TREND_DAYS_RECENT;
      const recent = list.filter((r) => U.isBetween(r.date, U.daysAgo(recentCut), null));
      const termCounts = new Map();
      recent.forEach((r) => {
        const t = DataStore.computed.get(r.id)?.tokens || new Set();
        t.forEach((w) => termCounts.set(w, (termCounts.get(w) || 0) + 1));
      });
      const topTerms = Array.from(termCounts.entries())
        .filter(([, c]) => c >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const trendTerms = new Set([...oldCounts.keys(), ...newCounts.keys()]);
      const trend = [];
      trendTerms.forEach((t) => {
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

      const emerg = trend.slice(0, 5).map((t) => t.t);
      const stable = topTerms
        .filter(([t]) => !emerg.includes(t))
        .slice(0, 5)
        .map(([t]) => t);
      E.aiEmergingStable.innerHTML = `
      <li><strong>Emerging:</strong> ${
        emerg.length ? emerg.map((x) => U.escapeHtml(x)).join(", ") : "—"
      }</li>
      <li><strong>Stable:</strong> ${
        stable.length ? stable.map((x) => U.escapeHtml(x)).join(", ") : "—"
      }</li>`;
    }

    // Ops cockpit
    if (E.aiOpsCockpit) {
      const misaligned = list.filter((r) => {
        const meta = DataStore.computed.get(r.id);
        if (!meta) return false;
        const gap = prioGap(meta.suggestions?.priority, r.priority);
        return gap >= CONFIG.RISK.misalignedDelta;
      });
      const missingPriority = list.filter((r) => !r.priority);
      const missingModule = list.filter(
        (r) => !r.module || r.module === "Unspecified"
      );
      const staleHigh = list.filter((r) => {
        const meta = DataStore.computed.get(r.id);
        if (!meta) return false;
        const risk = meta.risk?.total || 0;
        const old = U.daysAgo(CONFIG.RISK.staleDays);
        const st = (r.status || "").toLowerCase();
        return (
          risk >= CONFIG.RISK.highRisk &&
          U.isBetween(r.date, null, old) &&
          !(st.startsWith("resolved") || st.startsWith("rejected"))
        );
      });
      E.aiOpsCockpit.innerHTML = `
      <li>Untagged issues (missing category/type): ${
        list.filter((r) => !r.type).length
      }</li>
      <li>Missing priority: ${missingPriority.length}</li>
      <li>Missing module: ${missingModule.length}</li>
      <li>Misaligned priority: ${misaligned.length}</li>
      <li>Stale high-risk (&gt;=${CONFIG.RISK.highRisk}) &gt; ${
        CONFIG.RISK.staleDays
      }d: ${staleHigh.length}</li>`;
    }

    // Module risk table
    if (E.aiModulesTableBody) {
      const modules = (() => {
        const map = new Map();
        list.forEach((r) => {
          let m = map.get(r.module);
          if (!m) {
            m = {
              module: r.module,
              total: 0,
              open: 0,
              high: 0,
              risk: 0,
              tokens: new Map(),
            };
            map.set(r.module, m);
          }
          m.total++;
          const st = (r.status || "").toLowerCase();
          if (!st.startsWith("resolved") && !st.startsWith("rejected")) {
            m.open++;
            if (r.priority === "High") m.high++;
          }
          const rs = DataStore.computed.get(r.id)?.risk?.total || 0;
          m.risk += rs;
          (DataStore.computed.get(r.id)?.tokens || new Set()).forEach((t) =>
            m.tokens.set(t, (m.tokens.get(t) || 0) + 1)
          );
        });
        return Array.from(map.values())
          .map((m) => {
            const tt = m.tokens.size
              ? Array.from(m.tokens.entries()).sort((a, b) => b[1] - a[1])[0][0]
              : "";
            return {
              module: m.module,
              open: m.open,
              high: m.high,
              risk: m.risk,
              topTerm: tt,
            };
          })
          .sort((a, b) => b.risk - a.risk || b.open - a.open)
          .slice(0, 8);
      })();

      const maxModuleRisk =
        modules.reduce((max, m) => Math.max(max, m.risk), 0) || 1;

      E.aiModulesTableBody.innerHTML = modules.length
        ? modules
            .map((m) => {
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
          <td>${U.escapeHtml(m.topTerm || "-")}</td>
        </tr>`;
            })
            .join("")
        : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No modules.</td></tr>';
    }

    // Top risks
    if (E.aiRisksList) {
      const recentCut = CONFIG.TREND_DAYS_RECENT;
      const recent = list.filter((r) => U.isBetween(r.date, U.daysAgo(recentCut), null));
      const topRisks = recent
        .map((r) => ({ r, score: DataStore.computed.get(r.id)?.risk?.total || 0 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .filter((x) => x.score > 2);
      E.aiRisksList.innerHTML = topRisks.length
        ? topRisks
            .map(({ r, score }) => {
              const badgeClass = CalendarLink.riskBadgeClass(score);
              const meta = DataStore.computed.get(r.id)?.risk || {};
              return `
        <li style="margin-bottom:4px;">
          <strong>[${U.escapeHtml(r.priority || "-")} ] ${U.escapeHtml(
          r.id || ""
        )}</strong>
          <span class="event-risk-badge ${badgeClass}">RISK ${score}</span>
          <span class="muted"> · sev ${meta.severity ?? 0} · imp ${
          meta.impact ?? 0
        } · urg ${meta.urgency ?? 0}</span>
          <br><span class="muted">Status ${U.escapeHtml(r.status || "-")}</span>
          <br>${U.escapeHtml(r.title || "")}
        </li>`;
            })
            .join("")
        : "<li>No high-risk recent issues.</li>";
    }

    // Clusters
    if (E.aiClusters) {
      const clusters = buildClustersWeighted(list);
      E.aiClusters.innerHTML = clusters.length
        ? clusters
            .map(
              (c) => `
      <div class="card" style="padding:10px;">
        <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">
          Pattern: <strong>${U.escapeHtml(c.signature || "(no pattern)")}</strong> • ${
                c.issues.length
              } issues
        </div>
        <ul style="margin:0;padding-left:18px;font-size:13px;">
          ${c.issues
            .slice(0, 5)
            .map(
              (i) => `
            <li><button class="btn sm" style="padding:3px 6px;margin-right:4px;" data-open="${U.escapeAttr(
              i.id
            )}">${U.escapeHtml(i.id)}</button> ${U.escapeHtml(i.title || "")}</li>`
            )
            .join("")}
          ${
            c.issues.length > 5
              ? `<li class="muted">+ ${c.issues.length - 5} more…</li>`
              : ""
          }
        </ul>
      </div>`
            )
            .join("")
        : '<div class="muted">No similar issue groups ≥2.</div>';
    }

    // Triage queue
    if (E.aiTriageList) {
      const tri = list
        .filter((r) => {
          const meta = DataStore.computed.get(r.id) || {};
          const missing =
            !r.priority || !r.module || r.module === "Unspecified" || !r.type;
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
            .map((i) => {
              const meta = DataStore.computed.get(i.id) || {};
              const miss = [];
              if (!i.priority) miss.push("priority");
              if (!i.module || i.module === "Unspecified") miss.push("module");
              if (!i.type) miss.push("type");
              const cats =
                (meta.suggestions?.categories || [])
                  .slice(0, 2)
                  .map((c) => c.label)
                  .join(", ") || "n/a";
              const note = `Suggested priority: ${
                meta.suggestions?.priority || "-"
              }; categories: ${cats}`;
              return `<li style="margin-bottom:6px;">
        <strong>${U.escapeHtml(i.id)}</strong> — ${U.escapeHtml(i.title || "")}
        <div class="muted">Missing: ${miss.join(", ") || "—"} · ${U.escapeHtml(
                note
              )}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn sm" data-open="${U.escapeAttr(i.id)}">Open</button>
          <button class="btn ghost sm" data-copy="${U.escapeAttr(
            i.id
          )}">Copy suggestion</button>
        </div>
      </li>`;
            })
            .join("")
        : "<li>No issues requiring triage.</li>";
    }

    // Upcoming change risk (next 7d) -- uses events
    if (E.aiEventsList) {
      const eventsRisk = (() => {
        const now = new Date(),
          limit = U.dateAddDays(now, 7);
        const openIssues = DataStore.rows.filter((i) => {
          const st = (i.status || "").toLowerCase();
          return !(st.startsWith("resolved") || st.startsWith("rejected"));
        });
        const modules = Array.from(
          new Set(openIssues.map((i) => i.module).filter(Boolean))
        );
        const res = [];
        DataStore.events.forEach((ev) => {
          if (!ev.start) return;
          const d = new Date(ev.start);
          if (isNaN(d) || d < now || d > limit) return;
          const title = (ev.title || "").toLowerCase();
          const impacted = modules.filter((m) =>
            title.includes((m || "").toLowerCase())
          );
          let rel = [];
          if (impacted.length)
            rel = openIssues.filter((i) => impacted.includes(i.module));
          else if ((ev.type || "").toLowerCase() !== "other") {
            const recentOpen = openIssues.filter((i) =>
              U.isBetween(i.date, U.daysAgo(7), null)
            );
            rel = recentOpen.filter(
              (i) => (DataStore.computed.get(i.id)?.risk?.total || 0) >= CONFIG.RISK.highRisk
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
      })();
      E.aiEventsList.innerHTML = eventsRisk.length
        ? eventsRisk
            .map((r) => {
              const ev = r.event;
              const badge = CalendarLink.riskBadgeClass(r.risk);
              return `<li style="margin-bottom:6px;">
        <strong>${U.escapeHtml(ev.title || "(no title)")}</strong>
        <span class="event-risk-badge ${badge}">RISK ${r.risk}</span>
        <div class="muted">${U.fmtTS(r.date)} · Env: ${U.escapeHtml(
                ev.env || "Prod"
              )} · Modules: ${
                r.modules.length ? r.modules.map(U.escapeHtml).join(", ") : "n/a"
              } · Related issues: ${r.issues.length}</div>
      </li>`;
            })
            .join("")
        : "<li>No notable risk in next 7 days.</li>";
    }

    // Wire AI buttons
    U.qAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () =>
        UI.Modals.openIssue(b.getAttribute("data-open"))
      )
    );
    U.qAll("[data-copy]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-copy");
        const r = DataStore.byId.get(id);
        const meta = DataStore.computed.get(id) || {};
        const text = `Issue ${r.id}
Title: ${r.title}
Suggested Priority: ${meta.suggestions?.priority}
Suggested Categories: ${(meta.suggestions?.categories || [])
          .map((c) => c.label)
          .join(", ")}
Reasons: ${(meta.risk?.reasons || []).join(", ")}`;
        navigator.clipboard
          .writeText(text)
          .then(() => UI.toast("Suggestion copied"))
          .catch(() => UI.toast("Clipboard blocked"));
      })
    );

    FNBPlanner.refresh(DataStore.rows || list || []);

    UI.setAnalyzing(false);
  },
};

function buildClustersWeighted(list) {
  const max = Math.min(list.length, 400);
  const docs = list.slice(-max).map((r) => {
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
    all.forEach((t) => {
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
      c.forEach((d) => d.tokens.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1)));
      const sig = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t)
        .join(" ");
      clusters.push({ signature: sig, issues: c.map((x) => x.issue) });
    }
  }
  clusters.sort((a, b) => b.issues.length - a.issues.length);
  return clusters.slice(0, 6);
}

/* -------------------------------------------------------
   F&B helpers & planner
-------------------------------------------------------- */

function isFnbIssue(issue) {
  const module = (issue.module || "").toLowerCase();
  const text = [issue.title, issue.desc, issue.log]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    FNB_KEYWORDS.some((k) => module.includes(k)) ||
    FNB_KEYWORDS.some((k) => text.includes(k))
  );
}

function fnbDowName(dow) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow] || "";
}

const FNBPlanner = {
  _initialized: false,
  _model: null,
  _hasSuggestedOnce: false,
  _lastSlots: null,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    if (E.fnbSuggestBtn) {
      E.fnbSuggestBtn.addEventListener("click", () => this.suggestSlots(false));
    }
  },

  refresh(allIssues) {
    if (!E.fnbSlotsList) return;
    const rows = Array.isArray(allIssues) && allIssues.length ? allIssues : DataStore.rows || [];
    if (!rows.length) {
      E.fnbSlotsList.innerHTML =
        '<li class="fnb-slot-row"><span class="muted">No tickets yet — planner will learn from incidents and release history as data arrives.</span></li>';
      this._model = null;
      return;
    }

    const now = new Date();
    const lookbackFrom = U.daysAgo(CONFIG.FNB.lookbackDays);

    const fnbIssues = rows.filter((r) => {
      if (!r.date) return false;
      const d = new Date(r.date);
      if (isNaN(d)) return false;
      if (!U.isBetween(d, lookbackFrom, now)) return false;
      return isFnbIssue(r);
    });

    const effectiveIssues = fnbIssues.length ? fnbIssues : rows;

    const heat = this._buildHeat(effectiveIssues);
    const moduleStats = this._buildModuleStats(effectiveIssues);
    const holidayHints = this._buildHolidayHints(rows, DataStore.events || []);

    this._model = {
      rows,
      fnbIssues,
      effectiveIssues,
      heat,
      moduleStats,
      holidayHints,
      builtAt: now,
    };

    this._populateModuleSelect(moduleStats);

    if (!this._hasSuggestedOnce) {
      this._hasSuggestedOnce = true;
      this.suggestSlots(true);
    }
  },

  _buildHeat(issues) {
    const buckets = new Map();
    let maxHigh = 0;
    let maxAvgRisk = 0;

    issues.forEach((r) => {
      if (!r.date) return;
      const d = new Date(r.date);
      if (isNaN(d)) return;
      const dow = d.getDay();
      const hour = d.getHours();
      const key = `${dow}-${hour}`;
      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      const high = risk >= CONFIG.RISK.highRisk ? 1 : 0;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { total: 0, high: 0, sumRisk: 0 };
        buckets.set(key, bucket);
      }
      bucket.total += 1;
      bucket.high += high;
      bucket.sumRisk += risk;
    });

    buckets.forEach((b) => {
      const avg = b.total ? b.sumRisk / b.total : 0;
      if (b.high > maxHigh) maxHigh = b.high;
      if (avg > maxAvgRisk) maxAvgRisk = avg;
    });

    return {
      buckets,
      maxHigh: maxHigh || 1,
      maxAvgRisk: maxAvgRisk || 1,
    };
  },

  _buildModuleStats(issues) {
    const map = new Map();
    const now = new Date();
    const recentCut = U.daysAgo(30);

    issues.forEach((r) => {
      const mod = r.module || "Unspecified";
      let m = map.get(mod);
      if (!m) {
        m = {
          module: mod,
          total: 0,
          recentHigh: 0,
          lastIncident: null,
          sumRisk: 0,
        };
        map.set(mod, m);
      }
      m.total++;
      const meta = DataStore.computed.get(r.id) || {};
      const risk = meta.risk?.total || 0;
      const d = r.date ? new Date(r.date) : null;
      if (!isNaN(d)) {
        if (!m.lastIncident || d > m.lastIncident) m.lastIncident = d;
        if (risk >= CONFIG.RISK.highRisk && U.isBetween(d, recentCut, now))
          m.recentHigh++;
      }
      m.sumRisk += risk;
    });

    map.forEach((m) => {
      m.avgRisk = m.total ? m.sumRisk / m.total : 0;
      m.lastIncidentDaysAgo = m.lastIncident
        ? Math.round((now.getTime() - m.lastIncident.getTime()) / 86400000)
        : null;
    });

    return map;
  },

  _buildHolidayHints(issues, events) {
    const kws = CONFIG.FNB.keywordHolidayHints;
    const mark = new Map();
    const touch = (dateStr, reason) => {
      if (!dateStr) return;
      let d;
      try {
        d = new Date(dateStr);
      } catch {
        return;
      }
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(
        d.getDate()
      )}`;
      let v = mark.get(key);
      if (!v) {
        v = { score: 0, reasons: [] };
        mark.set(key, v);
      }
      v.score += 1;
      if (reason && !v.reasons.includes(reason)) v.reasons.push(reason);
    };

    issues.forEach((r) => {
      const txt = [r.title, r.desc, r.log].filter(Boolean).join(" ").toLowerCase();
      if (!kws.some((k) => txt.includes(k))) return;
      if (r.date) touch(r.date, "Ticket mentions seasonal/holiday context");
    });

    (events || []).forEach((ev) => {
      const txt = [ev.title, ev.description].filter(Boolean).join(" ").toLowerCase();
      if (!kws.some((k) => txt.includes(k))) return;
      if (ev.start) touch(ev.start, "Calendar event mentions seasonal/holiday context");
    });

    CONFIG.FNB.fixedHolidays.forEach((h) => {
      const nowYear = new Date().getFullYear();
      const d = new Date(nowYear, h.month - 1, h.day);
      const key = `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(
        d.getDate()
      )}`;
      let v = mark.get(key);
      if (!v) {
        v = { score: 0, reasons: [] };
        mark.set(key, v);
      }
      v.score += 2;
      if (!v.reasons.includes(h.name)) v.reasons.push(h.name);
    });

    return mark;
  },

  _populateModuleSelect(moduleStats) {
    if (!E.fnbModuleSelect) return;
    const prev = E.fnbModuleSelect.value || "All F&B";
    const modules = Array.from(moduleStats.keys())
      .filter((m) => m && m !== "Unspecified")
      .sort((a, b) => a.localeCompare(b));
    const opts = ["All F&B", ...modules];
    E.fnbModuleSelect.innerHTML = opts
      .map((m) => `<option value="${U.escapeAttr(m)}">${U.escapeHtml(m)}</option>`)
      .join("");
    if (opts.includes(prev)) E.fnbModuleSelect.value = prev;
  },

  _slotScore(start, end, moduleName) {
    const d = start;
    const dow = d.getDay();
    const hour = d.getHours() + d.getMinutes() / 60;
    const isWeekend = CONFIG.FNB.weekendDays.includes(dow);

    let score = 0;
    const reasons = [];

    // Rush vs quiet
    CONFIG.FNB.rushWindows.forEach((w) => {
      if (hour >= w.startHour && hour < w.endHour) {
        score += w.weight;
        reasons.push(`${w.label} (high traffic)`);
      }
    });
    CONFIG.FNB.quietWindows.forEach((w) => {
      if (hour >= w.startHour && hour < w.endHour) {
        score += w.weight;
        reasons.push(`${w.label} (quieter window)`);
      }
    });

    if (isWeekend) {
      score += CONFIG.FNB.weekendWeight;
      reasons.push("Weekend (Fri/Sat) — usually busier for F&B");
    }

    // Bug-bomb history (incident heat)
    if (this._model && this._model.heat) {
      const key = `${dow}-${d.getHours()}`;
      const bucket = this._model.heat.buckets.get(key);
      if (bucket && bucket.total) {
        const highRatio = bucket.high / this._model.heat.maxHigh;
        const avgRatio =
          (bucket.sumRisk / bucket.total) / this._model.heat.maxAvgRisk;
        const histScore = (highRatio + avgRatio) * 2;
        score += histScore;
        reasons.push(
          `Bug history around this hour: ${bucket.high} high-risk / ${bucket.total} total incidents (last ${CONFIG.FNB.lookbackDays}d)`
        );
        if (bucket.high >= 3) {
          reasons.push(
            "Multiple high-risk incidents around this hour — potential bug-bomb window after changes."
          );
        } else if (bucket.high >= 1) {
          reasons.push("At least one high-risk incident seen around this hour in the past.");
        }
      } else {
        reasons.push("No F&B ticket history at this exact hour (neutral).");
      }
    }

    // Module seasoning
    if (this._model && this._model.moduleStats) {
      const mod =
        moduleName && moduleName !== "All F&B"
          ? this._model.moduleStats.get(moduleName)
          : null;
      if (mod) {
        if (mod.recentHigh >= 3) {
          score += 3;
          reasons.push(
            `${mod.recentHigh} recent high-risk incidents on ${mod.module} (last 30d)`
          );
        } else if (mod.recentHigh >= 1) {
          score += 2;
          reasons.push(
            `${mod.recentHigh} high-risk incident on ${mod.module} (last 30d)`
          );
        }
        if (mod.lastIncidentDaysAgo != null && mod.lastIncidentDaysAgo <= 7) {
          score += 1.5;
          reasons.push(
            `Last incident on this module ~${mod.lastIncidentDaysAgo} day(s) ago`
          );
        } else if (mod.lastIncidentDaysAgo != null && mod.lastIncidentDaysAgo > 30) {
          score -= 1;
          reasons.push("Module appears stable (no recent incidents).");
        }
      }
    }

    // Holiday hints
    let holidayLabel = "Normal day";
    if (this._model && this._model.holidayHints) {
      const key = `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(
        d.getDate()
      )}`;
      const hints = this._model.holidayHints.get(key);
      if (hints && hints.score) {
        score += CONFIG.FNB.holidayWeight;
        holidayLabel = `F&B-sensitive day: ${hints.reasons.join(", ")}`;
        reasons.push(holidayLabel);
      }
    }

    // Check collisions only with Prod deployments
    let hasCollision = false;
    let hasSameModuleChange = false;
    if (DataStore.events && DataStore.events.length) {
      const slotStart = d;
      const slotEnd = end;
      const modLower = (moduleName || "").toLowerCase();
      DataStore.events.forEach((ev) => {
        if (!ev.start) return;

        const env = (ev.env || ev.environment || "Prod").toLowerCase();
        if (env !== "prod") return;

        const type = (ev.type || "").toLowerCase();
        if (type && type !== "deployment") return;

        const es = new Date(ev.start);
        if (isNaN(es)) return;
        const ee = ev.end ? new Date(ev.end) : new Date(es.getTime() + 60 * 60000);
        if (ee <= slotStart || es >= slotEnd) return;

        hasCollision = true;
        score += 2;

        const modulesArr = Array.isArray(ev.modules)
          ? ev.modules
          : typeof ev.modules === "string"
          ? ev.modules.split(",").map((s) => s.trim())
          : [];
        if (
          modulesArr.some((m) => (m || "").toLowerCase() === modLower) ||
          (!modulesArr.length && (ev.title || "").toLowerCase().includes(modLower))
        ) {
          hasSameModuleChange = true;
          score += 1;
        }
      });
    }
    if (hasCollision) {
      reasons.push("Overlaps with existing Prod deployment / maintenance event.");
      if (hasSameModuleChange) {
        reasons.push("Overlaps event on the same module.");
      }
    }

    return {
      score,
      reasons,
      dow,
      holidayLabel,
    };
  },

  _formatSlot(start, end) {
    const d = start;
    const dow = fnbDowName(d.getDay());
    const datePart = `${dow} ${d.getFullYear()}-${U.pad(
      d.getMonth() + 1
    )}-${U.pad(d.getDate())}`;
    const t = (x) => `${U.pad(x.getHours())}:${U.pad(x.getMinutes())}`;
    return `${datePart} · ${t(start)} – ${t(end)}`;
  },

  suggestSlots(isAuto = false) {
    if (!this._model) {
      if (!isAuto) {
        UI.toast(
          "Planner is still loading data — try again after issues & events load."
        );
      }
      return;
    }
    if (!E.fnbSlotsList) return;

    const minutes =
      (E.fnbDurationInput && Number(E.fnbDurationInput.value)) || 30;
    const durMs = Math.max(5, Math.min(minutes, 240)) * 60000;

    const moduleName =
      (E.fnbModuleSelect && E.fnbModuleSelect.value) || "All F&B";

    let daysToScan = 7;
    if (E.fnbHorizonSelect && E.fnbHorizonSelect.value) {
      const v = parseInt(E.fnbHorizonSelect.value, 10);
      if (!isNaN(v)) {
        daysToScan = Math.max(1, Math.min(v, 30));
      }
    }

    let baseDate;
    if (E.fnbDateInput && E.fnbDateInput.value) {
      baseDate = new Date(E.fnbDateInput.value + "T00:00");
    } else {
      baseDate = U.dateAddDays(new Date(), 1);
    }
    if (isNaN(baseDate)) baseDate = U.dateAddDays(new Date(), 1);

    const scopeRaw = (E.fnbScopeInput && E.fnbScopeInput.value) || "";
    const scopeIds = scopeRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const scopeIssues = scopeIds.map((id) => DataStore.byId.get(id)).filter(Boolean);

    let scopeRiskSum = 0;
    let scopeHigh = 0;
    const scopeModulesSet = new Set();
    scopeIssues.forEach((issue) => {
      const meta = DataStore.computed.get(issue.id) || {};
      const risk = meta.risk?.total || 0;
      scopeRiskSum += risk;
      if (risk >= CONFIG.RISK.highRisk) scopeHigh++;
      if (issue.module) scopeModulesSet.add(issue.module);
    });
    const scopeModulesLabel = scopeModulesSet.size
      ? Array.from(scopeModulesSet).join(", ")
      : "";

    const candidates = [];
    for (let i = 0; i < daysToScan; i++) {
      const day = U.dateAddDays(baseDate, i);
      CONFIG.FNB.preferredSlotsLocal.forEach((slot) => {
        const start = new Date(
          day.getFullYear(),
          day.getMonth(),
          day.getDate(),
          slot.hour,
          slot.minute || 0,
          0,
          0
        );
        const end = new Date(start.getTime() + durMs);
        const { score, reasons, dow, holidayLabel } = this._slotScore(
          start,
          end,
          moduleName
        );
        candidates.push({
          start,
          end,
          score,
          reasons,
          dow,
          holidayLabel,
        });
      });
    }

    if (!candidates.length) {
      E.fnbSlotsList.innerHTML =
        '<li class="fnb-slot-row"><span class="muted">No candidate windows generated.</span></li>';
      return;
    }

    candidates.sort((a, b) => a.score - b.score);
    const bestScore = candidates[0].score;
    const worstScore = candidates[candidates.length - 1].score || 1;
    const span = Math.max(1, worstScore - bestScore);

    const top = candidates.slice(0, 7);

    this._lastSlots = {
      top,
      moduleName,
      scopeIds,
      scopeIssues,
      scopeRiskSum,
      scopeHigh,
      scopeModulesLabel,
      horizonDays: daysToScan,
    };

    let headerHtml = "";

    if (!this._model.fnbIssues || !this._model.fnbIssues.length) {
      headerHtml += `<li class="fnb-slot-row">
        <span class="muted">
          No F&amp;B-specific tickets detected in the last ${CONFIG.FNB.lookbackDays} days —
          using all issues as a proxy for traffic and bug history.
        </span>
      </li>`;
    }

    headerHtml += `<li class="fnb-slot-row">
      <div class="fnb-slot-main">
        <div class="fnb-slot-meta">
          Planning horizon: next ${daysToScan} day(s) · Environment: <strong>Prod</strong>
          ${
            moduleName && moduleName !== "All F&B"
              ? ` · Module: ${U.escapeHtml(moduleName)}`
              : ""
          }
        </div>
        ${
          scopeIds.length
            ? `<div class="fnb-slot-meta">
                 Scope: ${scopeIds.length} ticket${
                scopeIds.length === 1 ? "" : "s"
              }
                 ${scopeHigh ? ` · high-risk: ${scopeHigh}` : ""}
                 ${scopeRiskSum ? ` · risk sum: ${scopeRiskSum}` : ""}
                 ${
                   scopeModulesLabel
                     ? ` · modules: ${U.escapeHtml(scopeModulesLabel)}`
                     : ""
                 }
               </div>`
            : '<div class="fnb-slot-meta">Scope: none selected — planner uses global F&amp;B history only.</div>'
        }
      </div>
    </li>`;

    const slotsHtml = top
      .map((c, idx) => {
        const normalized = (c.score - bestScore) / span;
        let band = "Low";
        if (normalized >= 0.66) band = "High";
        else if (normalized >= 0.33) band = "Medium";

        const highlightClass = idx === 0 ? "highlight" : "";
        const bandLabel =
          band === "Low"
            ? "Recommended (quieter & safer based on traffic and bug history)"
            : band === "Medium"
            ? "Acceptable with some risk — keep an eye on monitoring & on-call"
            : "Avoid if possible (busy / stacked with historical issues or changes)";

        return `
      <li class="fnb-slot-row ${highlightClass}">
        <div class="fnb-slot-header">
          <div class="fnb-slot-time">
            <strong>${U.escapeHtml(this._formatSlot(c.start, c.end))}</strong>
          </div>
          <div class="fnb-slot-badges">
            <span class="fnb-slot-badge">
              <span>${
                band === "Low" ? "🟢" : band === "Medium" ? "🟠" : "🔴"
              }</span> ${U.escapeHtml(band)} risk
            </span>
            <span class="fnb-slot-badge">
              <span>🍽</span> ${U.escapeHtml(c.holidayLabel || "Normal day")}
            </span>
          </div>
        </div>
        <div class="fnb-slot-risk" style="margin-top:4px;">
          ${U.escapeHtml(bandLabel)}
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
          <div class="fnb-slot-risk-bar">
            <div class="fnb-slot-risk-bar-inner" style="transform:scaleX(${(
              0.15 + normalized * 0.85
            ).toFixed(2)});"></div>
          </div>
          <span class="muted" style="font-size:11px;">Score ${c.score.toFixed(
            1
          )}</span>
        </div>
        <div class="fnb-slot-reasons">
          ${c.reasons.map((r) => `• ${U.escapeHtml(r)}`).join("<br>")}
        </div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="btn sm fnb-slot-plan-btn" data-slot-index="${idx}">
            Plan Prod deployment here
          </button>
        </div>
      </li>`;
      })
      .join("");

    E.fnbSlotsList.innerHTML = headerHtml + slotsHtml;

    this._wireSlotButtons();

    if (!isAuto) {
      UI.toast("F&B release windows recalculated");
    }
  },

  _wireSlotButtons() {
    if (!this._lastSlots || !E.fnbSlotsList) return;

    const { top, moduleName, scopeIds, scopeModulesLabel, horizonDays } =
      this._lastSlots;

    const modulesLabel =
      scopeModulesLabel ||
      (moduleName && moduleName !== "All F&B" ? moduleName : "F&B");
    const scopeIdString = scopeIds.join(", ");

    U.qAll(".fnb-slot-plan-btn", E.fnbSlotsList).forEach((btn) => {
      const idx = parseInt(btn.getAttribute("data-slot-index"), 10);
      if (isNaN(idx) || !top[idx]) return;
      const slot = top[idx];

      btn.addEventListener("click", () => {
        const count = scopeIds.length;
        const titleBase = modulesLabel;
        const title =
          `Prod release – ${titleBase}` +
          (count ? ` (${count} ticket${count === 1 ? "" : "s"})` : "");
        const modulesField = modulesLabel;
        const issueIdField = scopeIdString;

        UI.Modals.openEvent({
          title,
          type: "Deployment",
          env: "Prod",
          status: "Planned",
          owner: "",
          modules: modulesField,
          impactType: "Customer visible",
          issueId: issueIdField,
          start: slot.start,
          end: slot.end,
          allDay: false,
          description: `Planned F&B Prod release from planner. Horizon ${horizonDays}d.`,
        });
      });
    });
  },
};

/* -------------------------------------------------------
   Modals
-------------------------------------------------------- */

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
    const risk =
      meta.risk || {
        technical: 0,
        business: 0,
        operational: 0,
        time: 0,
        total: 0,
        severity: 0,
        impact: 0,
        urgency: 0,
        reasons: [],
      };
    const reasons = risk.reasons?.length
      ? "Reasons: " + risk.reasons.join(", ")
      : "—";
    E.modalTitle.textContent = r.title || r.id || "Issue";
    E.modalBody.innerHTML = `
      <p><b>ID:</b> ${U.escapeHtml(r.id || "-")}</p>
      <p><b>Module:</b> ${U.escapeHtml(r.module || "-")}</p>
      <p><b>Priority:</b> ${U.escapeHtml(r.priority || "-")}</p>
      <p><b>Status:</b> ${U.escapeHtml(r.status || "-")}</p>
      <p><b>Date:</b> ${U.escapeHtml(r.date || "-")}</p>
      <p><b>Risk:</b> ${risk.total}
         <br><span class="muted">Tech ${risk.technical}, Biz ${risk.business}, Ops ${
      risk.operational
    }, Time ${risk.time}</span>
         <br><span class="muted">Severity ${risk.severity}, Impact ${
      risk.impact
    }, Urgency ${risk.urgency}</span>
         <br><span class="muted">${U.escapeHtml(reasons)}</span>
      </p>
      <p><b>Description:</b><br>${U.escapeHtml(r.desc || "-")}</p>
      <p><b>Log:</b><br>${U.escapeHtml(r.log || "-")}</p>
      ${
        r.file
          ? `<p><b>Attachment:</b> <a href="${U.escapeAttr(
              r.file
            )}" target="_blank" rel="noopener noreferrer">Open link</a></p>`
          : ""
      }
      <div style="margin-top:10px" class="muted">
        Suggested: priority <b>${U.escapeHtml(
          meta.suggestions?.priority || "-"
        )}</b>;
        categories: ${
          (meta.suggestions?.categories || [])
            .slice(0, 3)
            .map((c) => U.escapeHtml(c.label))
            .join(", ") || "—"
        }.
      </div>
    `;
    E.issueModal.style.display = "flex";
    E.copyId?.focus();
  },
  closeIssue() {
    if (!E.issueModal) return;
    E.issueModal.style.display = "none";
    this.selectedIssue = null;
    if (this.lastFocus?.focus) this.lastFocus.focus();
  },
  openEvent(ev) {
    this.lastEventFocus = document.activeElement;
    const isEdit = !!(ev && ev.id);
    if (E.eventForm) E.eventForm.dataset.id = isEdit ? ev.id : "";
    if (E.eventModalTitle)
      E.eventModalTitle.textContent = isEdit ? "Edit Event" : "Add Event";
    if (E.eventDelete) E.eventDelete.style.display = isEdit ? "inline-flex" : "none";

    const allDay = !!ev.allDay;
    if (E.eventAllDay) E.eventAllDay.checked = allDay;

    if (E.eventTitle) E.eventTitle.value = ev.title || "";
    if (E.eventType) E.eventType.value = ev.type || "Deployment";
    if (E.eventEnv) E.eventEnv.value = ev.env || "Prod";
    if (E.eventStatus) E.eventStatus.value = ev.status || "Planned";
    if (E.eventOwner) E.eventOwner.value = ev.owner || "";
    if (E.eventModules) {
      const val = Array.isArray(ev.modules)
        ? ev.modules.join(", ")
        : ev.modules || "";
      E.eventModules.value = val;
    }
    if (E.eventImpactType)
      E.eventImpactType.value = ev.impactType || "No downtime expected";
    if (E.eventIssueId) E.eventIssueId.value = ev.issueId || "";

    if (E.eventStart) {
      E.eventStart.type = allDay ? "date" : "datetime-local";
      E.eventStart.value = ev.start
        ? allDay
          ? toLocalDateValue(ev.start)
          : toLocalInputValue(ev.start)
        : "";
    }
    if (E.eventEnd) {
      E.eventEnd.type = allDay ? "date" : "datetime-local";
      E.eventEnd.value = ev.end
        ? allDay
          ? toLocalDateValue(ev.end)
          : toLocalInputValue(ev.end)
        : "";
    }
    if (E.eventDescription) E.eventDescription.value = ev.description || "";

    if (E.eventIssueLinkedInfo) {
      const issueId = ev.issueId || "";
      if (issueId) {
        const issue = DataStore.byId.get(issueId);
        if (issue) {
          const meta = DataStore.computed.get(issue.id) || {};
          const riskTotal = meta.risk?.total || 0;
          const badgeClass = CalendarLink.riskBadgeClass(riskTotal);
          E.eventIssueLinkedInfo.style.display = "block";
          E.eventIssueLinkedInfo.innerHTML = `
            Linked issue: <strong>${U.escapeHtml(issue.id)}</strong> – ${U.escapeHtml(
            issue.title || ""
          )}
            <br><span class="muted">Status: ${U.escapeHtml(
              issue.status || "-"
            )} · Priority: ${U.escapeHtml(issue.priority || "-")}</span>
            ${
              riskTotal
                ? `<span class="event-risk-badge ${badgeClass}">RISK ${riskTotal}</span>`
                : ""
            }
            <div style="margin-top:4px;">
              <button type="button" class="btn sm" id="eventOpenIssueBtn">Open issue</button>
            </div>
          `;
          const btn = document.getElementById("eventOpenIssueBtn");
          if (btn) btn.addEventListener("click", () => UI.Modals.openIssue(issue.id));
        } else {
          E.eventIssueLinkedInfo.style.display = "block";
          E.eventIssueLinkedInfo.textContent = `Linked issue ID: ${issueId} (not found in current dataset)`;
        }
      } else {
        E.eventIssueLinkedInfo.style.display = "none";
        E.eventIssueLinkedInfo.textContent = "";
      }
    }

    if (E.eventModal) {
      E.eventModal.style.display = "flex";
      E.eventTitle?.focus();
    }
  },
  closeEvent() {
    if (!E.eventModal) return;
    E.eventModal.style.display = "none";
    if (E.eventForm) E.eventForm.dataset.id = "";
    if (this.lastEventFocus?.focus) this.lastEventFocus.focus();
  },
};

/* -------------------------------------------------------
   Utils
-------------------------------------------------------- */

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

/* -------------------------------------------------------
   View switching
-------------------------------------------------------- */

let currentView = "issues";

function setActiveView(view) {
  currentView = view;
  const names = ["issues", "calendar", "insights"];
  names.forEach((name) => {
    const tab =
      name === "issues"
        ? E.issuesTab
        : name === "calendar"
        ? E.calendarTab
        : E.insightsTab;
    const panel =
      name === "issues"
        ? E.issuesView
        : name === "calendar"
        ? E.calendarView
        : E.insightsView;
    const active = name === view;
    if (tab) {
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
    if (panel) panel.classList.toggle("active", active);
  });
  try {
    localStorage.setItem(LS_KEYS.view, view);
  } catch {}
  if (view === "calendar") {
    ensureCalendar();
    renderCalendarEvents();
  }
  if (view === "insights") Analytics.refresh(UI.Issues.applyFilters());
}

/* -------------------------------------------------------
   Calendar (local events)
-------------------------------------------------------- */

let calendar = null;
let calendarReady = false;

function wireCalendar() {
  if (E.addEventBtn)
    E.addEventBtn.addEventListener("click", () => {
      const now = new Date();
      UI.Modals.openEvent({
        start: now,
        end: new Date(now.getTime() + 60 * 60 * 1000),
        allDay: false,
        env: "Prod",
        status: "Planned",
        type: "Deployment",
      });
    });

  [
    E.eventFilterDeployment,
    E.eventFilterMaintenance,
    E.eventFilterRelease,
    E.eventFilterOther,
  ].forEach((input) => {
    if (input) input.addEventListener("change", renderCalendarEvents);
  });

  if (E.calendarTz) {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
      E.calendarTz.textContent = `Times shown in: ${tz}`;
    } catch {
      E.calendarTz.textContent = "";
    }
  }
}

function ensureCalendar() {
  if (calendarReady) return;
  const el = document.getElementById("calendar");
  if (!el || typeof FullCalendar === "undefined") return;

  calendar = new FullCalendar.Calendar(el, {
    initialView: "timeGridWeek",
    height: 520,
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    },
    selectable: true,
    dateClick(info) {
      UI.Modals.openEvent({
        title: "",
        type: "Deployment",
        env: "Prod",
        status: "Planned",
        owner: "",
        modules: "",
        impactType: "No downtime expected",
        issueId: "",
        start: info.date,
        end: null,
        allDay: info.allDay,
        description: "",
      });
    },
    eventClick(info) {
      const id = info.event.id;
      const ev = DataStore.events.find((e) => e.id === id);
      if (ev) {
        UI.Modals.openEvent(ev);
      }
    },
  });

  calendar.render();
  calendarReady = true;
}

function normalizeEvent(raw) {
  return {
    id:
      raw.id ||
      `ev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: raw.title || "",
    start: raw.start ? new Date(raw.start).toISOString() : null,
    end: raw.end ? new Date(raw.end).toISOString() : null,
    allDay: !!raw.allDay,
    type: raw.type || "Deployment",
    env: raw.env || raw.environment || "Prod",
    status: raw.status || "Planned",
    owner: raw.owner || "",
    modules: raw.modules || "",
    impactType: raw.impactType || "No downtime expected",
    issueId: raw.issueId || "",
    description: raw.description || "",
  };
}

function saveEventsToStorage() {
  try {
    localStorage.setItem(LS_KEYS.events, JSON.stringify(DataStore.events || []));
    UI.setSync("events", true, new Date());
  } catch {}
}

function loadEventsFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEYS.events);
    if (!raw) {
      DataStore.events = [];
      UI.setSync("events", true, null);
      return;
    }
    const arr = JSON.parse(raw) || [];
    DataStore.events = arr.map(normalizeEvent);
    const ts = new Date();
    UI.setSync("events", true, ts);
  } catch {
    DataStore.events = [];
    UI.setSync("events", false, null);
  }
}

function renderCalendarEvents() {
  if (!calendar || !calendarReady) return;
  const { flagsById } = computeChangeCollisions(DataStore.rows, DataStore.events);

  const eventsFiltered = DataStore.events.filter((ev) => {
    const t = (ev.type || "Other").toLowerCase();
    if (t === "deployment" && E.eventFilterDeployment && !E.eventFilterDeployment.checked)
      return false;
    if (t === "maintenance" && E.eventFilterMaintenance && !E.eventFilterMaintenance.checked)
      return false;
    if (t === "release" && E.eventFilterRelease && !E.eventFilterRelease.checked)
      return false;
    if (
      t !== "deployment" &&
      t !== "maintenance" &&
      t !== "release" &&
      E.eventFilterOther &&
      !E.eventFilterOther.checked
    )
      return false;
    return true;
  });

  calendar.removeAllEvents();
  eventsFiltered.forEach((ev) => {
    const flags = flagsById.get(ev.id) || {};
    const type = (ev.type || "other").toLowerCase();
    const env = (ev.env || ev.environment || "Prod").toLowerCase();
    const classNames = [
      `event-type-${type}`,
      `event-env-${env}`,
      flags.collision ? "event-collision" : "",
      flags.freeze ? "event-freeze" : "",
      flags.hotIssues ? "event-hot" : "",
    ].filter(Boolean);

    calendar.addEvent({
      id: ev.id,
      title: ev.title || "(no title)",
      start: ev.start,
      end: ev.end,
      allDay: !!ev.allDay,
      classNames,
      extendedProps: {
        env: ev.env || "Prod",
        type: ev.type || "Deployment",
        status: ev.status || "Planned",
        owner: ev.owner || "",
        modules: ev.modules || "",
        impactType: ev.impactType || "",
        issueId: ev.issueId || "",
      },
    });
  });
}

/* -------------------------------------------------------
   AI query UI
-------------------------------------------------------- */

let lastAiQuery = null;
let lastAiResults = [];

function runAiQuery() {
  if (!E.aiQueryInput || !E.aiQueryResults) return;
  const qText = E.aiQueryInput.value.trim();
  if (!qText) {
    E.aiQueryResults.innerHTML =
      'Type a query with keywords and filters like <code>module:payments risk>=9</code>.';
    lastAiQuery = null;
    lastAiResults = [];
    return;
  }
  const parsed = DSL.parse(qText);
  const matches = DataStore.rows.filter((r) =>
    DSL.matches(r, DataStore.computed.get(r.id) || {}, parsed)
  );

  lastAiQuery = parsed;
  lastAiResults = matches;

  const sorted =
    parsed.sort === "risk"
      ? [...matches].sort(
          (a, b) =>
            (DataStore.computed.get(b.id)?.risk?.total || 0) -
            (DataStore.computed.get(a.id)?.risk?.total || 0)
        )
      : parsed.sort === "date"
      ? [...matches].sort(
          (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
        )
      : parsed.sort === "priority"
      ? [...matches].sort(
          (a, b) => prioMap(b.priority) - prioMap(a.priority)
        )
      : matches;

  if (!sorted.length) {
    E.aiQueryResults.innerHTML = `<span class="muted">No issues matched this query.</span>`;
    return;
  }

  const html = sorted
    .slice(0, 50)
    .map((r) => {
      const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
      return `<div style="margin-bottom:4px;">
        <button type="button" class="btn sm" data-open="${U.escapeAttr(
          r.id
        )}">${U.escapeHtml(r.id)}</button>
        <span class="muted">[${U.escapeHtml(
          r.priority || "-"
        )}] · ${U.escapeHtml(r.module || "-")} · risk ${risk}</span>
        <br>${U.escapeHtml(r.title || "")}
      </div>`;
    })
    .join("");

  E.aiQueryResults.innerHTML = html;

  U.qAll("#aiQueryResults [data-open]").forEach((btn) =>
    btn.addEventListener("click", () =>
      UI.Modals.openIssue(btn.getAttribute("data-open"))
    )
  );
}

/* -------------------------------------------------------
   Export helpers
-------------------------------------------------------- */

function exportCsvFromRows(rows, filename) {
  if (!rows || !rows.length) {
    UI.toast("No rows to export");
    return;
  }
  const header = [
    "ID",
    "Module",
    "Title",
    "Priority",
    "Status",
    "Type",
    "Date",
    "RiskTotal",
    "RiskSeverity",
    "RiskImpact",
    "RiskUrgency",
    "Log",
    "Link",
  ];
  const csvRows = rows.map((r) => {
    const meta = DataStore.computed.get(r.id) || {};
    const risk = meta.risk || {};
    return [
      r.id,
      r.module,
      r.title,
      r.priority,
      r.status,
      r.type,
      r.date,
      risk.total || 0,
      risk.severity || 0,
      risk.impact || 0,
      risk.urgency || 0,
      r.log,
      r.file,
    ];
  });
  const csv = Papa.unparse({ fields: header, data: csvRows });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------
   Theme & accent
-------------------------------------------------------- */

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.dataset.theme = "dark";
  else if (theme === "light") root.dataset.theme = "light";
  else {
    // system
    const prefersDark = window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = prefersDark ? "dark" : "light";
  }
  try {
    localStorage.setItem(LS_KEYS.theme, theme);
  } catch {}
}

function applyAccent(color) {
  if (!color) return;
  document.documentElement.style.setProperty("--accent", color);
  try {
    localStorage.setItem(LS_KEYS.accentColorStorage, color);
  } catch {}
}

/* -------------------------------------------------------
   Online/offline
-------------------------------------------------------- */

function updateOnlineStatus() {
  if (!E.onlineStatusChip) return;
  const online = navigator.onLine;
  E.onlineStatusChip.textContent = online ? "Online" : "Offline";
  E.onlineStatusChip.classList.toggle("online", online);
  E.onlineStatusChip.classList.toggle("offline", !online);
}

/* -------------------------------------------------------
   Main refresh
-------------------------------------------------------- */

UI.refreshAll = function () {
  const list = UI.Issues.applyFilters();
  UI.Issues.renderKPIs(list);
  UI.Issues.renderTable(list);
  UI.Issues.renderCharts(list);
  UI.Issues.renderSummary(list);
  UI.Issues.renderFilterChips();
  if (currentView === "insights") Analytics.refresh(list);
};

/* -------------------------------------------------------
   Data loading
-------------------------------------------------------- */

async function fetchIssues() {
  UI.spinner(true);
  try {
    const res = await fetch(CONFIG.SHEET_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    DataStore.hydrate(text);
    IssuesCache.save(DataStore.rows);
    UI.setSync("issues", true, new Date());
    UI.Issues.renderFilters();
    UI.refreshAll();
  } catch (e) {
    console.error("Failed to fetch issues", e);
    UI.toast("Failed to refresh issues — using cached data if available");
    const cached = IssuesCache.load();
    if (cached) {
      DataStore.hydrateFromRows(cached);
      UI.Issues.renderFilters();
      UI.refreshAll();
      UI.setSync("issues", false, new Date());
    } else {
      UI.setSync("issues", false, null);
    }
  } finally {
    UI.spinner(false);
  }
}

/* -------------------------------------------------------
   Event form handling
-------------------------------------------------------- */

function hookEventForm() {
  if (!E.eventForm) return;

  E.eventForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = E.eventForm.dataset.id || null;
    const allDay = E.eventAllDay && E.eventAllDay.checked;

    const base = {
      id,
      title: E.eventTitle?.value || "",
      type: E.eventType?.value || "Deployment",
      env: E.eventEnv?.value || "Prod",
      status: E.eventStatus?.value || "Planned",
      owner: E.eventOwner?.value || "",
      modules: E.eventModules?.value || "",
      impactType: E.eventImpactType?.value || "No downtime expected",
      issueId: E.eventIssueId?.value || "",
      description: E.eventDescription?.value || "",
      allDay,
    };

    let startValue = E.eventStart?.value || "";
    let endValue = E.eventEnd?.value || "";

    let start = null;
    let end = null;

    if (allDay) {
      if (startValue) start = new Date(startValue + "T00:00");
      if (endValue) end = new Date(endValue + "T00:00");
    } else {
      if (startValue) start = new Date(startValue);
      if (endValue) end = new Date(endValue);
    }

    const eventObj = normalizeEvent({
      ...base,
      start,
      end,
    });

    if (id) {
      const idx = DataStore.events.findIndex((e) => e.id === id);
      if (idx >= 0) DataStore.events[idx] = eventObj;
      else DataStore.events.push(eventObj);
    } else {
      DataStore.events.push(eventObj);
    }

    saveEventsToStorage();
    renderCalendarEvents();
    UI.Modals.closeEvent();
    UI.toast("Event saved");
  });

  if (E.eventCancel) {
    E.eventCancel.addEventListener("click", () => UI.Modals.closeEvent());
  }

  if (E.eventDelete) {
    E.eventDelete.addEventListener("click", () => {
      const id = E.eventForm.dataset.id;
      if (!id) {
        UI.Modals.closeEvent();
        return;
      }
      DataStore.events = DataStore.events.filter((e) => e.id !== id);
      saveEventsToStorage();
      renderCalendarEvents();
      UI.Modals.closeEvent();
      UI.toast("Event deleted");
    });
  }

  if (E.eventAllDay) {
    E.eventAllDay.addEventListener("change", () => {
      const allDay = E.eventAllDay.checked;
      if (E.eventStart) E.eventStart.type = allDay ? "date" : "datetime-local";
      if (E.eventEnd) E.eventEnd.type = allDay ? "date" : "datetime-local";
    });
  }
}

/* -------------------------------------------------------
   Keyboard shortcuts
-------------------------------------------------------- */

function hookShortcuts() {
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    const isInput =
      tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;
    if (!isInput && (e.key === "1" || e.key === "2" || e.key === "3")) {
      if (e.key === "1") setActiveView("issues");
      if (e.key === "2") setActiveView("calendar");
      if (e.key === "3") setActiveView("insights");
    }
    if (!isInput && e.key === "/") {
      e.preventDefault();
      E.searchInput?.focus();
    }
    if (e.key === "Escape") {
      if (E.issueModal && E.issueModal.style.display === "flex") {
        UI.Modals.closeIssue();
        return;
      }
      if (E.eventModal && E.eventModal.style.display === "flex") {
        UI.Modals.closeEvent();
        return;
      }
    }
    if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      E.aiQueryInput?.focus();
    }
  });

  if (E.issueModal) {
    E.issueModal.addEventListener("keydown", (e) => {
      if (e.key === "Tab") trapFocus(E.issueModal, e);
    });
  }
  if (E.eventModal) {
    E.eventModal.addEventListener("keydown", (e) => {
      if (e.key === "Tab") trapFocus(E.eventModal, e);
    });
  }
}

/* -------------------------------------------------------
   DOMContentLoaded
-------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  cacheEls();
  FNBPlanner.init();
  wireCalendar();
  hookEventForm();
  hookShortcuts();

  // Load theme
  const savedTheme = localStorage.getItem(LS_KEYS.theme) || "system";
  if (E.themeSelect) {
    E.themeSelect.value = savedTheme;
    E.themeSelect.addEventListener("change", () => {
      applyTheme(E.themeSelect.value);
    });
  }
  applyTheme(savedTheme);

  const savedAccent = localStorage.getItem(LS_KEYS.accentColorStorage);
  if (savedAccent && E.accentColor) {
    E.accentColor.value = savedAccent;
    applyAccent(savedAccent);
  }
  if (E.accentColor) {
    E.accentColor.addEventListener("input", () =>
      applyAccent(E.accentColor.value)
    );
  }

  // Online/offline
  updateOnlineStatus();
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

  // Filters initial
  Filters.load();
  if (E.searchInput) {
    E.searchInput.value = Filters.state.search || "";
    E.searchInput.addEventListener(
      "input",
      debounce(() => {
        Filters.state.search = E.searchInput.value;
        Filters.save();
        GridState.page = 1;
        UI.refreshAll();
      }, 200)
    );
  }
  if (E.moduleFilter) {
    E.moduleFilter.addEventListener("change", () => {
      Filters.state.module = E.moduleFilter.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.priorityFilter) {
    E.priorityFilter.addEventListener("change", () => {
      Filters.state.priority = E.priorityFilter.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.statusFilter) {
    E.statusFilter.addEventListener("change", () => {
      Filters.state.status = E.statusFilter.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.startDateFilter) {
    E.startDateFilter.value = Filters.state.start || "";
    E.startDateFilter.addEventListener("change", () => {
      Filters.state.start = E.startDateFilter.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.endDateFilter) {
    E.endDateFilter.value = Filters.state.end || "";
    E.endDateFilter.addEventListener("change", () => {
      Filters.state.end = E.endDateFilter.value;
      Filters.save();
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.resetBtn) {
    E.resetBtn.addEventListener("click", () => {
      Filters.state = {
        search: "",
        module: "All",
        priority: "All",
        status: "All",
        start: "",
        end: "",
      };
      Filters.save();
      if (E.searchInput) E.searchInput.value = "";
      if (E.moduleFilter) E.moduleFilter.value = "All";
      if (E.priorityFilter) E.priorityFilter.value = "All";
      if (E.statusFilter) E.statusFilter.value = "All";
      if (E.startDateFilter) E.startDateFilter.value = "";
      if (E.endDateFilter) E.endDateFilter.value = "";
      GridState.page = 1;
      UI.refreshAll();
    });
  }

  // Sorting
  U.qAll("#issuesTable thead th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (!key) return;
      if (GridState.sortKey === key) GridState.sortAsc = !GridState.sortAsc;
      else {
        GridState.sortKey = key;
        GridState.sortAsc = true;
      }
      GridState.page = 1;
      UI.refreshAll();
    });
  });

  // Pagination
  if (E.pageSize) {
    E.pageSize.value = String(GridState.pageSize);
    E.pageSize.addEventListener("change", () => {
      GridState.pageSize = +E.pageSize.value || 20;
      try {
        localStorage.setItem(LS_KEYS.pageSize, String(GridState.pageSize));
      } catch {}
      GridState.page = 1;
      UI.refreshAll();
    });
  }
  if (E.firstPage)
    E.firstPage.addEventListener("click", () => {
      GridState.page = 1;
      UI.refreshAll();
    });
  if (E.prevPage)
    E.prevPage.addEventListener("click", () => {
      if (GridState.page > 1) GridState.page--;
      UI.refreshAll();
    });
  if (E.nextPage)
    E.nextPage.addEventListener("click", () => {
      GridState.page++;
      UI.refreshAll();
    });
  if (E.lastPage)
    E.lastPage.addEventListener("click", () => {
      const list = UI.Issues.applyFilters();
      const pages = Math.max(1, Math.ceil(list.length / GridState.pageSize));
      GridState.page = pages;
      UI.refreshAll();
    });

  // Drawer
  if (E.drawerBtn && E.sidebar) {
    E.drawerBtn.addEventListener("click", () => {
      const open = !E.sidebar.classList.contains("open");
      E.sidebar.classList.toggle("open", open);
      E.drawerBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // Modal buttons
  if (E.modalClose) E.modalClose.addEventListener("click", () => UI.Modals.closeIssue());
  if (E.copyId)
    E.copyId.addEventListener("click", () => {
      if (!UI.Modals.selectedIssue) return;
      navigator.clipboard
        .writeText(UI.Modals.selectedIssue.id)
        .then(() => UI.toast("ID copied"))
        .catch(() => UI.toast("Clipboard blocked"));
    });
  if (E.copyLink)
    E.copyLink.addEventListener("click", () => {
      if (!UI.Modals.selectedIssue) return;
      const text = `${UI.Modals.selectedIssue.id} — ${UI.Modals.selectedIssue.title}`;
      navigator.clipboard
        .writeText(text)
        .then(() => UI.toast("Copied"))
        .catch(() => UI.toast("Clipboard blocked"));
    });

  if (E.eventModalClose)
    E.eventModalClose.addEventListener("click", () => UI.Modals.closeEvent());

  // Tabs
  if (E.issuesTab)
    E.issuesTab.addEventListener("click", () => setActiveView("issues"));
  if (E.calendarTab)
    E.calendarTab.addEventListener("click", () => setActiveView("calendar"));
  if (E.insightsTab)
    E.insightsTab.addEventListener("click", () => setActiveView("insights"));

  // AI query
  if (E.aiQueryRun) E.aiQueryRun.addEventListener("click", runAiQuery);
  if (E.aiQueryInput) {
    E.aiQueryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runAiQuery();
      }
    });
  }
  if (E.aiQueryApplyFilters) {
    E.aiQueryApplyFilters.addEventListener("click", () => {
      if (!lastAiQuery || !lastAiResults.length) {
        UI.toast("Run a query first");
        return;
      }
      const q = lastAiQuery;
      if (q.module) Filters.state.module = q.module;
      if (q.priority) Filters.state.priority = q.priority[0].toUpperCase() === "H"
        ? "High"
        : q.priority[0].toUpperCase() === "M"
        ? "Medium"
        : q.priority[0].toUpperCase() === "L"
        ? "Low"
        : Filters.state.priority;
      if (q.status && (q.status === "open" || q.status === "closed")) {
        Filters.state.status = "All";
      } else if (q.status) {
        Filters.state.status = q.status;
      }
      if (q.lastDays) {
        Filters.state.start = toLocalDateValue(U.daysAgo(q.lastDays));
        Filters.state.end = "";
      }
      Filters.save();

      if (E.moduleFilter) E.moduleFilter.value = Filters.state.module;
      if (E.priorityFilter) E.priorityFilter.value = Filters.state.priority;
      if (E.statusFilter) E.statusFilter.value = Filters.state.status;
      if (E.startDateFilter) E.startDateFilter.value = Filters.state.start;
      if (E.endDateFilter) E.endDateFilter.value = Filters.state.end;

      GridState.page = 1;
      setActiveView("issues");
      UI.refreshAll();
      UI.toast("AI filter applied to Issues tab");
    });
  }

  if (E.aiQueryExport) {
    E.aiQueryExport.addEventListener("click", () => {
      if (!lastAiResults.length) {
        UI.toast("No AI query results to export");
        return;
      }
      exportCsvFromRows(lastAiResults, "ai_query_results.csv");
    });
  }

  // CSV export for current filters
  if (E.exportCsv) {
    E.exportCsv.addEventListener("click", () => {
      const list = UI.Issues.applyFilters();
      exportCsvFromRows(list, "issues_filtered.csv");
    });
  }

  // Refresh button
  if (E.refreshNow) {
    E.refreshNow.addEventListener("click", () => {
      fetchIssues();
    });
  }

  // "New Ticket" button (simple link/placeholder)
  if (E.createTicketBtn) {
    E.createTicketBtn.addEventListener("click", () => {
      UI.toast("Hook this to your ticket creation flow (e.g. form or link).");
    });
  }

  // Initial view
  const storedView = localStorage.getItem(LS_KEYS.view) || "issues";
  setActiveView(storedView);

  // Load events from local storage
  loadEventsFromStorage();

  // Load issues: use cache first if present, then refresh in background
  const cached = IssuesCache.load();
  if (cached && cached.length) {
    DataStore.hydrateFromRows(cached);
    UI.setSync("issues", true, new Date(localStorage.getItem(LS_KEYS.issuesLastUpdated)));
    UI.Issues.renderFilters();
    UI.refreshAll();
    UI.spinner(false);
    // Background refresh
    fetchIssues();
  } else {
    fetchIssues();
  }
});
