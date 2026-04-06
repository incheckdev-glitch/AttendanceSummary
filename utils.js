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
    if (Session.role() !== ROLES.VIEWER) return true;
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
