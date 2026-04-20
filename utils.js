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
  fmtDate: d => {
    if (!d) return '—';
    const x = d instanceof Date ? d : new Date(d);
    if (isNaN(x)) return '—';
    return x.toISOString().slice(0, 10);
  },
  fmtDisplayDateSafe: (value, fallback = '—') => {
    if (value === null || value === undefined) return fallback;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? fallback : value.toDateString();
    }
    const raw = String(value).trim();
    if (!raw) return fallback;

    const textualDateMatch = raw.match(
      /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\b/
    );
    if (textualDateMatch) {
      return `${textualDateMatch[1]} ${textualDateMatch[2]} ${String(textualDateMatch[3]).padStart(2, '0')} ${textualDateMatch[4]}`;
    }

    const isoDateMatch = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
    const normalized = isoDateMatch ? `${isoDateMatch[1]}T00:00:00` : raw;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toDateString();
  },
  fmtDisplayDate: value => U.fmtDisplayDateSafe(value, '—'),
  formatPreviewHtmlDates: html => {
    const rawHtml = String(html || '').trim();
    if (!rawHtml) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const textWalker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT);

    const datePattern =
      /\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?\s+GMT[+-]\d{4}(?:\s+\([^)]*\)|\s+[A-Za-z][A-Za-z\s/_-]*)?)?|\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;

    let node = textWalker.nextNode();
    while (node) {
      const parentTag = String(node.parentElement?.tagName || '').toLowerCase();
      if (parentTag !== 'script' && parentTag !== 'style') {
        node.nodeValue = String(node.nodeValue || '').replace(datePattern, match => {
          const formatted = U.fmtDisplayDate(match);
          return formatted === '—' ? match : formatted;
        });
      }
      node = textWalker.nextNode();
    }

    return doc.documentElement.outerHTML;
  },
  fmtNumber: value => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return '0';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(num);
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
  toStatusClass: status =>
    String(status || '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9_-]/g, ''),
  toTagClass: value =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, ''),
  safeExternalUrl: raw => {
    if (!raw) return '';
    try {
      const url = new URL(String(raw), window.location.href);
      const allowed = new Set(['http:', 'https:', 'mailto:']);
      if (!allowed.has(url.protocol)) return '';
      return url.toString();
    } catch {
      return '';
    }
  },
  isRecentIso: (iso, maxAgeHours) => {
    if (!iso) return false;
    const d = new Date(iso);
    if (isNaN(d)) return false;
    return Date.now() - d.getTime() <= maxAgeHours * 3600000;
  },
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
  },
  addIncheckDocumentLogo: html => {
    const raw = String(html || '').trim();
    if (!raw) return '';
    if (/data-incheck360-doc-logo/i.test(raw)) return raw;

    const styleTag = `<style data-incheck360-doc-logo-style>
      .incheck360-doc-logo-wrap{display:flex;justify-content:center;margin:0 0 16px;}
      .incheck360-doc-logo{width:220px;max-width:100%;height:auto;display:block;}
    </style>`;
    const logoMarkup =
      '<div class="incheck360-doc-logo-wrap" data-incheck360-doc-logo><img class="incheck360-doc-logo" src="assets/incheck-logo.svg" alt="InCheck 360 logo" /></div>';

    let output = raw;
    if (/<\/head>/i.test(output) && !/data-incheck360-doc-logo-style/i.test(output)) {
      output = output.replace(/<\/head>/i, `${styleTag}</head>`);
    } else if (!/data-incheck360-doc-logo-style/i.test(output)) {
      output = `${styleTag}${output}`;
    }

    if (/<body[^>]*>/i.test(output)) {
      output = output.replace(/<body([^>]*)>/i, `<body$1>${logoMarkup}`);
    } else {
      output = `${logoMarkup}${output}`;
    }
    return output;
  }
};

/** Filters persisted */
const Filters = {
  state: {
    search: '',
    module: 'All',
    category: 'All',
    priority: 'All',
    status: 'All',
    devTeamStatus: 'All',
    issueRelated: 'All',
    start: '',
    end: ''
  },
  load() {
    try {
      const raw = localStorage.getItem(LS_KEYS.filters);
      if (raw)
        this.state = {
          ...this.state,
          ...JSON.parse(raw)
        };
    } catch {}
  },
  save() {
    try {
      localStorage.setItem(LS_KEYS.filters, JSON.stringify(this.state));
    } catch {}
  }
};

const ColumnManager = {
  restrictedForViewer: new Set(['youtrackReference', 'devTeamStatus', 'issueRelated', 'notes']),
  defaultVisibleByRole: {
    [ROLES.ADMIN]: new Set([
      'id',
      'date',
      'title',
      'desc',
      'priority',
      'file',
      'type',
      'status',
      'youtrackReference',
      'devTeamStatus',
      'issueRelated',
      'notes'
    ]),
    [ROLES.DEV]: new Set([
      'id',
      'date',
      'title',
      'desc',
      'priority',
      'file',
      'type',
      'status',
      'youtrackReference',
      'devTeamStatus',
      'issueRelated',
      'notes'
    ])
  },
  columns: [
    { key: 'id', label: 'Ticket ID' },
    { key: 'date', label: 'Date' },
    { key: 'name', label: 'Name' },
    { key: 'department', label: 'Department' },
    { key: 'title', label: 'Title' },
    { key: 'desc', label: 'Description' },
    { key: 'priority', label: 'Priority' },
    { key: 'module', label: 'Module' },
    { key: 'file', label: 'Link' },
    { key: 'emailAddressee', label: 'Email Addressee' },
    { key: 'type', label: 'Category' },
    { key: 'status', label: 'Status' },
    { key: 'notificationSent', label: 'Notification Sent' },
    { key: 'youtrackReference', label: 'YouTrack Reference' },
    { key: 'devTeamStatus', label: 'Dev Team Status' },
    { key: 'issueRelated', label: 'Issue Related' },
    { key: 'notes', label: 'Notes' },
    { key: 'log', label: 'Log' },
    { key: 'notificationUnderReview', label: 'Notification Sent Under Review' }
  ],
  state: {},
  isColumnAllowed(colKey) {
    const role = Session.role();
    if (role === ROLES.ADMIN || role === ROLES.DEV) return true;
    return !this.restrictedForViewer.has(colKey);
  },
  getAvailableColumns() {
    return this.columns.filter(col => this.isColumnAllowed(col.key));
  },
  getVisibleColumns() {
    return this.getAvailableColumns().filter(col => this.state[col.key] !== false);
  },
  getVisibleColumnCount() {
    return this.getVisibleColumns().length || this.getAvailableColumns().length || 1;
  },
  buildDefaultState() {
    const role = Session.role();
    const preferredVisible = this.defaultVisibleByRole[role];
    if (!preferredVisible) {
      return this.columns.reduce((acc, col) => {
        acc[col.key] = true;
        return acc;
      }, {});
    }
    return this.columns.reduce((acc, col) => {
      acc[col.key] = preferredVisible.has(col.key);
      return acc;
    }, {});
  },
  load() {
    const defaults = this.buildDefaultState();
    try {
      const raw = localStorage.getItem(LS_KEYS.columns);
      const parsed = raw ? JSON.parse(raw) : null;
      this.state = { ...defaults, ...(parsed || {}) };
    } catch {
      this.state = defaults;
    }
  },
  save() {
    try {
      localStorage.setItem(LS_KEYS.columns, JSON.stringify(this.state));
    } catch {}
  },
  apply() {
    this.columns.forEach(col => {
      const visible = this.isColumnAllowed(col.key) && this.state[col.key] !== false;
      document.querySelectorAll(`[data-col="${col.key}"]`).forEach(el => {
        el.classList.toggle('col-hidden', !visible);
      });
    });
  },
  renderPanel() {
    if (!E.columnList) return;
    E.columnList.innerHTML = this.getAvailableColumns()
      .map(
        col => `
        <label>
          <input type="checkbox" data-col-toggle="${col.key}" ${
            this.state[col.key] !== false ? 'checked' : ''
          } />
          ${U.escapeHtml(col.label)}
        </label>
      `
      )
      .join('');

    E.columnList.querySelectorAll('[data-col-toggle]').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-col-toggle');
        if (!key) return;
        this.state[key] = input.checked;
        this.save();
        this.apply();
      });
    });
  },
  getState() {
    return { ...this.state };
  },
  setState(nextState) {
    const defaults = this.buildDefaultState();
    this.state = { ...defaults, ...(nextState || {}) };
    this.save();
    this.apply();
    this.renderPanel();
  }
};

const SavedViews = {
  views: {},
  load() {
    try {
      const raw = localStorage.getItem(LS_KEYS.savedViews);
      const parsed = raw ? JSON.parse(raw) : null;
      this.views = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.views = {};
    }
  },
  save() {
    try {
      localStorage.setItem(LS_KEYS.savedViews, JSON.stringify(this.views));
    } catch {}
  },
  refreshSelect() {
    if (!E.savedViews) return;
    const names = Object.keys(this.views).sort((a, b) => a.localeCompare(b));
    E.savedViews.innerHTML = [
      '<option value="">Saved views</option>',
      ...names.map(name => `<option value="${U.escapeAttr(name)}">${U.escapeHtml(name)}</option>`)
    ].join('');
  },
  add(name, payload) {
    this.views[name] = payload;
    this.save();
    this.refreshSelect();
  },
  remove(name) {
    if (!name || !this.views[name]) return;
    delete this.views[name];
    this.save();
    this.refreshSelect();
  },
  apply(name) {
    const view = this.views[name];
    if (!view) return false;
    Filters.state = { ...Filters.state, ...(view.filters || {}) };
    syncFilterInputs();
    Filters.save();
    if (view.sort) {
      GridState.sortKey = view.sort.key || null;
      GridState.sortAsc = view.sort.asc !== false;
    }
    ColumnManager.setState(view.columns || {});
    GridState.page = 1;
    UI.refreshAll();
    return true;
  }
};


function UndefaultCount(arr) {
  const m = new Map();
  arr.forEach(t => m.set(t, (m.get(t) || 0) + 1));
  return m;
}
