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
  freezeWindows: [],
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
    const normalizeHeaderKey = key =>
      String(key || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    const values = Object.values(raw).map(v => String(v ?? '').trim());
    for (const k in raw) {
      if (!k) continue;
      lower[normalizeHeaderKey(k)] = String(raw[k] ?? '').trim();
    }

    const pick = (...keys) => {
      for (const key of keys) {
        const normalized = normalizeHeaderKey(key);
        if (lower[normalized]) return lower[normalized];
      }
      return '';
    };
    const pickByIndex = idx => (idx >= 0 && idx < values.length ? values[idx] : '');

    // Column K in the source sheet holds the category dropdown values.
    // Keep a positional fallback because sheet header names can drift.
    const columnKCategory = pickByIndex(10);
    const resolvedType =
      pick(
        'category',
        'type',
        'issue category',
        'ticket category',
        'category/type',
        'category / type',
        'column k',
        'k'
      ) || columnKCategory;
    
    return {
      id: pick('ticket id', 'id'),
      name: pick('name', 'requester', 'requester name'),
      department: pick('department', 'dept'),
      module: pick('impacted module', 'module', 'issue location') || 'Unspecified',
      title: pick('title'),
      desc: pick('description'),
      file: pick('file upload', 'link', 'url'),
      emailAddressee: pick('email addressee', 'email', 'email address'),
      notificationSent: pick('notification sent'),
      notificationUnderReview: pick('notification sent under review'),
      youtrackReference: pick('youtrack reference', 'you track reference', 'youtrack', 'youtrack ref'),
      // Keep positional fallbacks aligned with export order:
      // R (index 17) = Dev Team Status, S (index 18) = Issue Related.
      devTeamStatus:
        pick('dev team status', 'development team status', 'dev status', 'dev_team_status') ||
        String(raw.__col_17 ?? '').trim(),
      issueRelated:
        pick('issue related', 'related issue', 'related issues', 'issue relation', 'issue_related') ||
        String(raw.__col_18 ?? '').trim(),
      notes: pick('notes'),
       // Always prefer Google Sheet column L (index 11) for priority when duplicate
      // "Priority" headers exist.
      priority: DataStore.normalizePriority(String(raw.__col_11 ?? '').trim() || pick('priority')),
      status: DataStore.normalizeStatus(pick('status') || 'Not Started Yet'),
      type: resolvedType,
      date: pick('timestamp', 'date', 'created at'),
      log: pick('log', 'logs', 'comment')
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
    const matrix = Papa.parse(csvText, { header: false, skipEmptyLines: true }).data;
    const [headers = [], ...rows] = matrix;
    const parsed = rows
      .map(values => {
        const obj = {};
        headers.forEach((header, idx) => {
          const key = String(header ?? '').trim() || `column_${idx + 1}`;
          const val = String(values[idx] ?? '').trim();
          if (obj[key] === undefined) obj[key] = val;
          else obj[`${key} (${idx + 1})`] = val;
          obj[`__col_${idx}`] = val;
        });
        return obj;
      })
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
  SCHEMA_VERSION: '2',
  schemaKey: 'incheckIssuesCacheSchemaVersion',
  clear() {
    try {
      localStorage.removeItem(LS_KEYS.issues);
      localStorage.removeItem(LS_KEYS.issuesLastUpdated);
      localStorage.removeItem(LS_KEYS.dataVersion);
      localStorage.removeItem(this.schemaKey);
    } catch {}
  },
  migrateIfNeeded() {
    try {
      const schema = localStorage.getItem(this.schemaKey);
      if (schema === this.SCHEMA_VERSION) return;
      this.clear();
      localStorage.setItem(this.schemaKey, this.SCHEMA_VERSION);
    } catch {}
  },
  load() {
    try {
      this.migrateIfNeeded();
      const storedVersion = localStorage.getItem(LS_KEYS.dataVersion);
      if (storedVersion && storedVersion !== CONFIG.DATA_VERSION) return null;
      const lastUpdated = localStorage.getItem(LS_KEYS.issuesLastUpdated);
      if (!U.isRecentIso(lastUpdated, CONFIG.DATA_STALE_HOURS)) return null;
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
      this.migrateIfNeeded();
      localStorage.setItem(LS_KEYS.issues, JSON.stringify(Array.isArray(rows) ? rows : []));
      localStorage.setItem(LS_KEYS.issuesLastUpdated, new Date().toISOString());
      localStorage.setItem(LS_KEYS.dataVersion, CONFIG.DATA_VERSION);
    } catch {}
  },
  lastUpdated() {
    const iso = localStorage.getItem(LS_KEYS.issuesLastUpdated);
    if (!iso) return null;
    const d = new Date(iso);
  return isNaN(d) ? null : d;
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
