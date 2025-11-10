// datastore.js
// Filters + DataStore + Issues cache

import { CONFIG, LS_KEYS, STOPWORDS, STATUSES, PRIORITIES } from './config.js';
import { U, UndefaultCount } from './utils.js';
import { Risk } from './risk.js';

export const Filters = {
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

export const DataStore = {
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
    if (!i) return STATUSES.NOT_STARTED;
    if (i.startsWith('resolved')) return STATUSES.RESOLVED;
    if (i.startsWith('under')) return STATUSES.UNDER_DEV;
    if (i.startsWith('rejected')) return STATUSES.REJECTED;
    if (i.startsWith('on hold')) return STATUSES.ON_HOLD;
    if (i.startsWith('not started')) return STATUSES.NOT_STARTED;
    if (i.startsWith('sent')) return STATUSES.SENT;
    if (i.startsWith('on stage')) return STATUSES.ON_STAGE;
    return STATUSES.NOT_STARTED;
  },
  normalizePriority(p) {
    const i = (p || '').trim().toLowerCase();
    if (!i) return '';
    if (i.startsWith('h')) return PRIORITIES.HIGH;
    if (i.startsWith('m')) return PRIORITIES.MEDIUM;
    if (i.startsWith('l')) return PRIORITIES.LOW;
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
      priority: this.normalizePriority(pick('priority')),
      status: this.normalizeStatus(pick('status') || 'Not Started Yet'),
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
    /* Papa is global */
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data
      .map(raw => this.normalizeRow(raw))
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

      const toks = this.tokenize(r);
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

export const IssuesCache = {
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
