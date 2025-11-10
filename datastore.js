// datastore.js
// Issues data + text analytics core

import { LS_KEYS, STOPWORDS, PRIORITIES } from './config.js';
import { U, safeDate, normalizeModules, UndefaultCount } from './utils.js';

/* =========================================================
   Filters (persisted in localStorage)
   ========================================================= */

const FILTERS_KEY = (LS_KEYS && LS_KEYS.filters) || 'incheck_filters';

const DEFAULT_FILTERS = {
  search: '',
  module: 'All',
  priority: 'All',
  status: 'All',
  start: '',
  end: ''
};

export const Filters = {
  state: { ...DEFAULT_FILTERS },

  load() {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        this.state = { ...DEFAULT_FILTERS, ...obj };
      }
    } catch {
      this.state = { ...DEFAULT_FILTERS };
    }
  },

  save() {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(this.state));
    } catch {
      // ignore
    }
  }
};

// initialize on module load
Filters.load();

/* =========================================================
   Issue risk + suggestions
   ========================================================= */

function buildTokens(issue) {
  const text = [
    issue.id,
    issue.module,
    issue.title,
    issue.desc,
    issue.log
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');

  const tokens = text
    .split(/\s+/)
    .filter(
      t => t.length > 2 && !STOPWORDS.has(t)
    );

  return new Set(tokens);
}

function computeRisk(issue, tokens) {
  const text = [
    issue.title,
    issue.desc,
    issue.log
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const bump = (v, amt) => Math.max(0, Math.min(6, v + amt));
  const addReason = (arr, msg) => {
    if (!msg) return;
    if (!arr.includes(msg)) arr.push(msg);
  };

  let severity = 1;
  let impact = 1;
  let urgency = 1;
  let technical = 1;
  let business = 1;
  let operational = 1;
  let time = 1;
  const reasons = [];

  // Priority-based base
  const pr = String(issue.priority || '').toLowerCase();
  if (pr.startsWith('p0')) {
    severity = 5;
    impact = 5;
    urgency = 5;
    addReason(reasons, 'P0 priority');
  } else if (pr.startsWith('p1') || pr.includes('high')) {
    severity = 4;
    impact = 4;
    urgency = 4;
    addReason(reasons, 'High priority');
  } else if (pr.startsWith('p2') || pr.includes('medium')) {
    severity = 3;
    impact = 3;
    urgency = 3;
    addReason(reasons, 'Medium priority');
  } else if (pr.startsWith('p3') || pr.includes('low')) {
    severity = 2;
    impact = 2;
    urgency = 2;
    addReason(reasons, 'Low priority');
  }

  // Critical outage / data / security
  if (
    /outage|site down|system down|not working|cannot |can't |failed|failure|crash|crashed|data loss|security|breach|ransom/.test(
      text
    )
  ) {
    severity = bump(severity, 2);
    impact = bump(impact, 2);
    urgency = bump(urgency, 1);
    addReason(reasons, 'Critical outage / data / security keywords');
  }

  // Payments / POS / orders
  if (
    /payment|checkout|card|visa|mastercard|gateway|billing|invoice|order|pos|terminal|kitchen|restaurant/.test(
      text
    )
  ) {
    impact = bump(impact, 2);
    business = bump(business, 2);
    addReason(reasons, 'Payments / POS / order flow');
  }

  // Performance / latency
  if (/slow|slowness|latenc|timeout|time-out|degraded|delay|lag/.test(text)) {
    severity = bump(severity, 1);
    impact = bump(impact, 1);
    operational = bump(operational, 2);
    addReason(reasons, 'Performance / latency issues');
  }

  // Auth / login
  if (/login|log in|auth|authentication|password|pwd|2fa|otp|sso|session/.test(text)) {
    severity = bump(severity, 1);
    impact = bump(impact, 1);
    business = bump(business, 1);
    addReason(reasons, 'Login / authentication problems');
  }

  // Peak / holiday / busy times
  if (
    /weekend|friday|saturday|eid|ramadan|ramadhan|ramzan|iftar|suhoor|holiday|national day|peak|rush/.test(
      text
    )
  ) {
    urgency = bump(urgency, 2);
    time = bump(time, 2);
    addReason(reasons, 'Peak period / holiday context');
  }

  // Deployment / blocker
  if (/blocker|blocked|cannot deploy|deployment failed|release blocked/.test(text)) {
    urgency = bump(urgency, 2);
    time = bump(time, 1);
    addReason(reasons, 'Deployment / release blocker');
  }

  // Date-based recency
  if (issue.date) {
    const d = safeDate(issue.date);
    if (d) {
      const ageDays = (Date.now() - d.getTime()) / 86400000;
      if (ageDays <= 7) {
        urgency = bump(urgency, 1);
        time = bump(time, 1);
        addReason(reasons, 'Recent issue (<=7d)');
      } else if (ageDays > 90) {
        urgency = Math.max(1, urgency - 1);
        time = Math.max(1, time - 1);
        addReason(reasons, 'Old issue (>90d)');
      }
    }
  }

  // Status influence
  const st = String(issue.status || '').toLowerCase();
  const isClosed = st.startsWith('resolved') || st.startsWith('rejected');
  if (isClosed) {
    urgency = Math.max(1, urgency - 2);
    time = Math.max(1, time - 2);
    addReason(reasons, 'Issue resolved / closed');
  } else {
    addReason(reasons, 'Issue not fully closed');
  }

  // Technical indicators
  if (/exception|stack trace|stacktrace|sql|database|db |redis|kafka|api|integration|network|socket|http/.test(text)) {
    technical = bump(technical, 2);
    addReason(reasons, 'Technical error keywords');
  }

  // Align cross-dimensions
  technical = Math.max(technical, severity);
  business = Math.max(business, impact);
  operational = Math.max(operational, Math.floor((severity + impact) / 2));
  time = Math.max(time, urgency);

  const weighted =
    severity * 0.9 +
    impact * 1.0 +
    urgency * 0.8 +
    technical * 0.8 +
    business * 0.9 +
    operational * 0.7 +
    time * 0.7;

  const total = Math.max(0, Math.min(24, Math.round(weighted)));

  return {
    technical,
    business,
    operational,
    time,
    total,
    severity,
    impact,
    urgency,
    reasons
  };
}

function computeSuggestions(issue, tokens, risk) {
  const text = [
    issue.title,
    issue.desc,
    issue.log
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Priority suggestion from risk.total
  let suggestedPriority;
  if (risk.total >= 16) {
    suggestedPriority = (PRIORITIES && PRIORITIES.HIGH) || 'High';
  } else if (risk.total >= 9) {
    suggestedPriority = (PRIORITIES && PRIORITIES.MEDIUM) || 'Medium';
  } else {
    suggestedPriority = (PRIORITIES && PRIORITIES.LOW) || 'Low';
  }

  const categories = [];
  const pushCat = (label, score) => {
    if (!label) return;
    if (categories.some(c => c.label === label)) return;
    categories.push({ label, score });
  };

  if (/payment|checkout|card|visa|mastercard|gateway|refund|billing|invoice/.test(text)) {
    pushCat('Payments', 0.9);
  }
  if (/pos|terminal|printer|device|hardware|scanner|kitchen/.test(text)) {
    pushCat('POS / Hardware', 0.8);
  }
  if (/login|auth|password|2fa|otp|sso|session/.test(text)) {
    pushCat('Authentication', 0.8);
  }
  if (/report|dashboard|kpi|analytics|insight|metric/.test(text)) {
    pushCat('Reporting', 0.6);
  }
  if (/api|integration|webhook|callback|partner/.test(text)) {
    pushCat('Integration', 0.7);
  }
  if (/performance|slow|slowness|latency|timeout|degraded/.test(text)) {
    pushCat('Performance', 0.7);
  }
  if (/incident|outage|p0|p1|sla/.test(text)) {
    pushCat('Incidents', 0.8);
  }

  // Basic "Missing fields" style category
  const missingFields = [];
  if (!issue.priority) missingFields.push('priority');
  if (!issue.module || issue.module === 'Unspecified') missingFields.push('module');
  if (!issue.type) missingFields.push('type');
  if (missingFields.length) {
    pushCat(`Needs triage: ${missingFields.join('/')}`, 0.5);
  }

  return {
    priority: suggestedPriority,
    categories
  };
}

/* =========================================================
   DataStore
   ========================================================= */

export const DataStore = {
  rows: [],
  byId: new Map(),
  computed: new Map(),
  events: [],

  _normalizeIssue(row) {
    const out = { ...row };

    out.id = String(out.id || '').trim();
    out.module = String(out.module || 'Unspecified').trim() || 'Unspecified';
    out.title = String(out.title || '').trim();
    out.desc = String(out.desc || '').trim();
    out.priority = String(out.priority || '').trim();
    out.status = String(out.status || '').trim();
    out.type = String(out.type || '').trim();
    out.date = out.date ? String(out.date).trim() : '';
    out.log = String(out.log || '').trim();
    out.file = String(out.file || '').trim();

    return out;
  },

  _computeAllMeta() {
    this.computed = new Map();

    const n = this.rows.length;
    if (!n) return;

    // First pass: tokens + risk + suggestions
    this.rows.forEach(issue => {
      const tokens = buildTokens(issue);
      const risk = computeRisk(issue, tokens);
      const suggestions = computeSuggestions(issue, tokens, risk);

      this.computed.set(issue.id, {
        tokens,
        risk,
        suggestions
        // idf: optional; clusters fall back to 1 if missing
      });
    });
  },

  hydrateFromRows(rows) {
    const arr = Array.isArray(rows) ? rows : [];
    this.rows = arr.map(r => this._normalizeIssue(r));
    this.byId = new Map();
    this.rows.forEach(r => this.byId.set(r.id, r));
    this._computeAllMeta();
  },

  hydrate(csvText) {
    if (!csvText) {
      this.rows = [];
      this.byId = new Map();
      this.computed = new Map();
      return;
    }

    const rows = parseCsv(csvText);
    if (!rows.length) {
      this.rows = [];
      this.byId = new Map();
      this.computed = new Map();
      return;
    }

    const header = rows[0].map(h => String(h || '').trim());
    const body = rows.slice(1);

    const idx = nameCandidates => {
      const lower = header.map(h => h.toLowerCase());
      for (const cand of nameCandidates) {
        const i = lower.indexOf(cand.toLowerCase());
        if (i !== -1) return i;
      }
      return -1;
    };

    const idIdx = idx(['id', 'issue id', 'ticket id', 'ticket']);
    const moduleIdx = idx(['module', 'area', 'component', 'module name']);
    const titleIdx = idx(['title', 'summary', 'subject']);
    const descIdx = idx(['description', 'desc', 'details', 'body']);
    const priorityIdx = idx(['priority', 'prio']);
    const statusIdx = idx(['status', 'state']);
    const typeIdx = idx(['type', 'category', 'issue type']);
    const dateIdx = idx(['date', 'created', 'logged at', 'opened at', 'timestamp', 'time']);
    const logIdx = idx(['log', 'notes', 'note', 'comment', 'comments', 'history']);
    const fileIdx = idx(['link', 'url', 'file', 'attachment']);

    const issues = [];

    body.forEach(cells => {
      if (!cells || !cells.length) return;

      const issue = {
        id: idIdx >= 0 ? cells[idIdx] : '',
        module: moduleIdx >= 0 ? cells[moduleIdx] : '',
        title: titleIdx >= 0 ? cells[titleIdx] : '',
        desc: descIdx >= 0 ? cells[descIdx] : '',
        priority: priorityIdx >= 0 ? cells[priorityIdx] : '',
        status: statusIdx >= 0 ? cells[statusIdx] : '',
        type: typeIdx >= 0 ? cells[typeIdx] : '',
        date: dateIdx >= 0 ? cells[dateIdx] : '',
        log: logIdx >= 0 ? cells[logIdx] : '',
        file: fileIdx >= 0 ? cells[fileIdx] : ''
      };

      const norm = this._normalizeIssue(issue);
      if (!norm.id) return;
      issues.push(norm);
    });

    this.rows = issues;
    this.byId = new Map();
    this.rows.forEach(r => this.byId.set(r.id, r));
    this._computeAllMeta();
  }
};

/* =========================================================
   Issues cache (localStorage)
   ========================================================= */

const ISSUES_CACHE_KEY =
  (LS_KEYS && LS_KEYS.issues) || 'incheck_issues_cache';
const ISSUES_CACHE_TS_KEY = ISSUES_CACHE_KEY + '_ts';

export const IssuesCache = {
  load() {
    try {
      const raw = localStorage.getItem(ISSUES_CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return null;
      return data;
    } catch {
      return null;
    }
  },

  save(rows) {
    try {
      const arr = Array.isArray(rows) ? rows : [];
      localStorage.setItem(ISSUES_CACHE_KEY, JSON.stringify(arr));
      localStorage.setItem(ISSUES_CACHE_TS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  },

  lastLabel() {
    try {
      const raw = localStorage.getItem(ISSUES_CACHE_TS_KEY);
      if (!raw) return '';
      const ts = parseInt(raw, 10);
      if (!ts) return '';
      const diffMs = Date.now() - ts;
      const diffMin = Math.round(diffMs / 60000);
      if (diffMin < 1) return 'cache: just now';
      if (diffMin < 60) return `cache: ${diffMin} min ago`;
      const diffHr = Math.round(diffMin / 60);
      if (diffHr < 24) return `cache: ${diffHr}h ago`;
      const diffDays = Math.round(diffHr / 24);
      return `cache: ${diffDays}d ago`;
    } catch {
      return '';
    }
  }
};

/* =========================================================
   Simple CSV parser
   ========================================================= */

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        // Escaped quote
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      field += c;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}
