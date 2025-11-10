// InCheck — Issues · Ops · AI Copilot
// ---------------------------------------
// Optional config (can be set in index.html BEFORE app.js):
//
// <script>
//   window.INCHECK_CONFIG = {
//     ISSUES_CSV_URL: 'https://.../export?format=csv', // your sheet CSV
//     NEW_TICKET_URL: 'https://your-tool/new-ticket'
//   };
// </script>

(() => {
  'use strict';

  // ---------------------------------------
  // Config / LocalStorage keys
  // ---------------------------------------
  const CONFIG = Object.assign(
    {
      ISSUES_CSV_URL: null,
      NEW_TICKET_URL: null
    },
    (typeof window !== 'undefined' && window.INCHECK_CONFIG) || {}
  );

  const LS_KEYS = {
    THEME: 'incheck_theme',
    ACCENT: 'incheck_accent',
    ACTIVE_TAB: 'incheck_active_tab',
    FILTERS: 'incheck_filters_v1',
    SORT: 'incheck_sort_v1',
    PAGE: 'incheck_page_v1',
    ISSUES_CACHE: 'incheck_issues_cache_v1',
    EVENTS: 'incheck_events_v1',
    EVENT_ISSUES: 'incheck_event_issues_v1'
  };

  const STOPWORDS = new Set([
    'the','a','an','and','or','for','to','of','in','on','at','by','with','is','are','was','were','be',
    'this','that','it','as','from','into','via','when','then','if','not','no','yes',
    'issue','bug','ticket','inc','error','failed','failure'
  ]);

  // ---------------------------------------
  // Sample data (fallback only)
  // ---------------------------------------
  const SAMPLE_ISSUES = [
    {
      id: 'INC-101',
      module: 'Payments',
      title: 'Card payments failing on POS v3 (evening peak)',
      priority: 'High',
      status: 'Under Development',
      date: isoDaysAgo(2),
      type: 'Bug',
      log: 'Customers in KSA stores cannot pay by card; intermittent gateway 502 and timeouts around 7–10pm.',
      link: ''
    },
    {
      id: 'INC-102',
      module: 'Kitchen',
      title: 'KDS screen freezing randomly',
      priority: 'High',
      status: 'On Hold',
      date: isoDaysAgo(5),
      type: 'Incident',
      log: 'Kitchen screens freeze for 20–30s in Dubai locations; correlated with promo days and large orders.',
      link: ''
    },
    {
      id: 'INC-103',
      module: 'Reports',
      title: 'End-of-day sales report totals mismatch',
      priority: 'Medium',
      status: 'Not Started Yet',
      date: isoDaysAgo(10),
      type: 'Bug',
      log: 'Reports show different totals than POS Z-report for some UAE stores; rounding & timezone suspicion.',
      link: ''
    },
    {
      id: 'INC-104',
      module: 'Auth',
      title: 'On-call cannot log in to admin panel (2FA)',
      priority: 'High',
      status: 'Resolved',
      date: isoDaysAgo(1),
      type: 'Incident',
      log: '2FA SMS delays from provider caused on-call to be locked out for ~10 min during incident.',
      link: ''
    },
    {
      id: 'INC-105',
      module: 'POS',
      title: 'Slow POS performance during lunch rush',
      priority: 'Medium',
      status: 'Under Development',
      date: isoDaysAgo(7),
      type: 'Performance',
      log: 'POS UI becomes very slow (2–3s per action) for Jeddah stores during 12–3pm; CPU spikes.',
      link: ''
    },
    {
      id: 'INC-106',
      module: 'Integrations',
      title: 'Aggregator orders delayed to kitchen',
      priority: 'High',
      status: 'On Stage',
      date: isoDaysAgo(3),
      type: 'Incident',
      log: 'Talabat / HungerStation orders arrive 5–10 minutes late to KDS in some branches.',
      link: ''
    },
    {
      id: 'INC-107',
      module: 'Payments',
      title: 'Apple Pay occasionally unavailable',
      priority: 'Low',
      status: 'Sent',
      date: isoDaysAgo(15),
      type: 'Bug',
      log: 'Apple Pay button sometimes missing on QR ordering; refresh usually fixes.',
      link: ''
    },
    {
      id: 'INC-108',
      module: 'Reports',
      title: 'Dashboard widgets not loading (timeout)',
      priority: 'Medium',
      status: 'Under Development',
      date: isoDaysAgo(4),
      type: 'Bug',
      log: 'Ops dashboard cards spin forever for large groups; backend takes >10s for some tenants.',
      link: ''
    }
  ];

  const SAMPLE_EVENTS = (() => {
    const now = new Date();
    const mk = (daysAhead, hourStart, durationHours, cfg) => {
      const start = new Date(now);
      start.setDate(start.getDate() + daysAhead);
      start.setHours(hourStart, 0, 0, 0);
      const end = new Date(start);
      end.setHours(end.getHours() + durationHours);
      return {
        id: `evt-sample-${daysAhead}-${hourStart}`,
        title: cfg.title,
        type: cfg.type,
        env: cfg.env,
        status: cfg.status || 'Planned',
        owner: cfg.owner || '',
        modules: cfg.modules || [],
        impactType: cfg.impactType || 'No downtime expected',
        issueId: cfg.issueId || '',
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: false,
        notes: cfg.notes || ''
      };
    };
    return [
      mk(2, 3, 2, {
        title: 'Prod deployment v2.3 — Payments refactor',
        type: 'Deployment',
        env: 'Prod',
        modules: ['Payments', 'POS'],
        impactType: 'Customer visible',
        issueId: 'INC-101',
        notes: 'Core payments refactor; staged rollout for Gulf F&B.'
      }),
      mk(3, 6, 2, {
        title: 'Kitchen hardware maintenance (KSA cluster)',
        type: 'Maintenance',
        env: 'Prod',
        modules: ['Kitchen'],
        impactType: 'Internal only'
      }),
      mk(4, 22, 2, {
        title: 'Release 2025.02 — F&B dashboards',
        type: 'Release',
        env: 'Prod',
        modules: ['Reports'],
        impactType: 'Customer visible'
      })
    ];
  })();

  // ---------------------------------------
  // App state
  // ---------------------------------------
  const state = {
    rawIssues: [],
    filteredIssues: [],
    issues: [],
    events: [],
    filters: {
      module: null,
      priority: null,
      status: null,
      startDate: null,
      endDate: null,
      search: ''
    },
    sort: {
      key: 'date',
      direction: 'desc'
    },
    pagination: {
      page: 1,
      pageSize: 20
    },
    charts: {
      byModule: null,
      byPriority: null,
      byStatus: null,
      byType: null
    },
    calendar: null,
    ui: {
      theme: 'system',
      accent: null,
      activeTab: 'issues'
    },
    ai: {
      lastQueryIssues: null,
      lastQueryFilters: null
    },
    linkage: {
      eventIssues: {} // eventId -> [issueId]
    },
    planner: {
      suggestions: [],
      topSuggestion: null
    }
  };

  let els = {};
  let currentIssueForModal = null;
  let currentEventId = null;

  // ---------------------------------------
  // Helpers
  // ---------------------------------------
  function isoDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, ' ')
      .split(/\s+/)
      .filter((w) => w && w.length > 2 && !STOPWORDS.has(w));
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c
    ));
  }

  function daysBetween(a, b) {
    const d1 = a instanceof Date ? a : new Date(a);
    const d2 = b instanceof Date ? b : new Date(b);
    return Math.abs(d2 - d1) / (1000 * 60 * 60 * 24);
  }

  function formatDate(date, withTime) {
    if (!(date instanceof Date)) date = new Date(date);
    if (Number.isNaN(date.getTime())) return '';
    if (withTime) {
      return date.toLocaleString(undefined, {
        year: '2-digit',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return date.toLocaleDateString(undefined, {
      year: '2-digit',
      month: 'short',
      day: '2-digit'
    });
  }

  function isOpenIssue(issue) {
    const s = (issue.status || '').toLowerCase();
    return !(s.includes('resolved') || s.includes('rejected') || s.includes('closed'));
  }

  function computeIssueRisk(issue) {
    let score = 0;

    // Priority weight
    const prio = (issue.priority || '').toLowerCase();
    if (prio === 'high') score += 4;
    else if (prio === 'medium') score += 2.5;
    else if (prio === 'low') score += 1;
    else score += 1.5;

    // Open vs resolved
    if (isOpenIssue(issue)) score += 2;
    else score -= 0.5;

    // Age
    if (issue.dateObj instanceof Date && !Number.isNaN(issue.dateObj)) {
      const age = daysBetween(issue.dateObj, new Date());
      if (isOpenIssue(issue)) {
        if (age <= 2) score += 1.5;
        else if (age <= 7) score += 1;
        else if (age <= 30) score += 0.5;
        else score += 0.2;
      } else {
        score -= 0.3;
      }
    }

    // Text signals
    const text = `${issue.title || ''} ${issue.log || ''}`.toLowerCase();
    if (/outage|down|unavailable|major incident|sev1|sev 1|sev2|sev 2|p1|p0|p 0|p 1/.test(text)) {
      score += 4;
    } else if (/timeout|latency|slow|degraded|error|failing|failure|crash|hang|freeze/.test(text)) {
      score += 2;
    } else if (/typo|cosmetic|spacing|copy/.test(text)) {
      score -= 1;
    }

    if (/payments?|checkout|card|apple pay|tap/.test(text)) score += 1.5;
    if (/kitchen|kds|printer/.test(text)) score += 1;
    if (/auth|login|2fa|sso/.test(text)) score += 1.2;

    if (/peak|rush|dinner|lunch|iftar|ramadan|eid/.test(text)) score += 1.3;

    // Boundaries
    if (score < 0) score = 0;
    if (score > 10) score = 10;
    return Number(score.toFixed(1));
  }

  function parseIssueDate(str) {
    if (!str) return null;
    const direct = new Date(str);
    if (!Number.isNaN(direct.getTime())) return direct;

    // Try dd/mm/yyyy
    const m = String(str).match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const y = Number(m[3] < 100 ? 2000 + Number(m[3]) : m[3]);
      const dt = new Date(y, mo, d);
      if (!Number.isNaN(dt.getTime())) return dt;
    }
    return null;
  }

  function normalizeHeaderName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function idFromTitle(title) {
    // For events: quick ID generator
    const base = 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    if (!title) return base;
    return base;
  }

  function isoToLocalInputValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function localInputValueToIso(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function showSpinner(msg) {
    if (els.spinner) {
      els.spinner.style.display = 'flex';
    }
    if (els.loadingStatus && msg) {
      els.loadingStatus.textContent = msg;
    }
  }

  function hideSpinner() {
    if (els.spinner) els.spinner.style.display = 'none';
    if (els.loadingStatus) els.loadingStatus.textContent = '';
  }

  let toastTimeout = null;
  function showToast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.style.display = 'block';
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      els.toast.style.display = 'none';
    }, 3500);
  }

  function updateOnlineStatus() {
    const online = navigator.onLine;
    if (!els.onlineStatusChip) return;
    els.onlineStatusChip.textContent = online ? 'Online' : 'Offline';
    els.onlineStatusChip.classList.toggle('online', online);
    els.onlineStatusChip.classList.toggle('offline', !online);
  }

  function humanTimeAgo(date) {
    if (!date) return 'never';
    if (!(date instanceof Date)) date = new Date(date);
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 0) return 'just now';
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d ago`;
  }

  // ---------------------------------------
  // Data loading (issues)
  // ---------------------------------------
  function loadIssuesFromCache() {
    try {
      const raw = localStorage.getItem(LS_KEYS.ISSUES_CACHE);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.issues)) return null;
      return obj;
    } catch {
      return null;
    }
  }

  function saveIssuesToCache(issues) {
    try {
      const payload = {
        updatedAt: new Date().toISOString(),
        issues
      };
      localStorage.setItem(LS_KEYS.ISSUES_CACHE, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  function enrichIssue(issue) {
    const copy = Object.assign({}, issue);
    copy.id = copy.id || copy.ID || copy.IssueId || copy.IssueID || '';
    copy.module = copy.module || copy.Module || copy['Module Name'] || '';
    copy.title = copy.title || copy.Title || copy.Summary || '';
    copy.priority = copy.priority || copy.Priority || '';
    copy.status = copy.status || copy.Status || '';
    copy.type = copy.type || copy.Type || copy.Category || '';
    copy.log = copy.log || copy.Log || copy.Description || copy.Details || '';
    copy.link = copy.link || copy.Link || copy.URL || copy.Url || '';

    const dateRaw = copy.date || copy.Date || copy.Created || copy['Created At'];
    copy.date = dateRaw || '';
    copy.dateObj = parseIssueDate(dateRaw);
    copy.risk = computeIssueRisk(copy);
    return copy;
  }

  function normalizeIssues(rawArr) {
    return rawArr
      .map(enrichIssue)
      .filter((i) => i.id || i.title || i.module || i.log);
  }

  async function fetchIssuesFromCsv() {
    if (!CONFIG.ISSUES_CSV_URL || !window.Papa) {
      return null;
    }

    return new Promise((resolve, reject) => {
      window.Papa.parse(CONFIG.ISSUES_CSV_URL, {
        download: true,
        header: true,
        dynamicTyping: false,
        skipEmptyLines: true,
        complete: (res) => {
          if (res.errors && res.errors.length) {
            console.warn('CSV parse errors', res.errors);
          }
          const rows = res.data || [];
          const issues = normalizeIssues(rows);
          resolve(issues);
        },
        error: (err) => reject(err)
      });
    });
  }

  async function loadIssues(initial) {
    showSpinner(initial ? 'Loading issues…' : 'Refreshing issues…');
    if (els.syncIssuesText) {
      els.syncIssuesText.textContent = 'Issues: loading…';
      els.syncIssuesDot?.classList.remove('ok', 'warn', 'err');
      els.syncIssuesDot?.classList.add('warn');
    }

    try {
      let issues = null;

      // If offline, try cache first
      if (!navigator.onLine) {
        const cached = loadIssuesFromCache();
        if (cached) {
          issues = cached.issues;
          if (els.syncIssuesText) {
            els.syncIssuesText.textContent = `Issues: cache (${humanTimeAgo(cached.updatedAt)})`;
            els.syncIssuesDot?.classList.remove('ok', 'warn', 'err');
            els.syncIssuesDot?.classList.add('warn');
          }
        }
      }

      // Try CSV if online / configured
      if (!issues && CONFIG.ISSUES_CSV_URL && window.Papa) {
        try {
          const fetched = await fetchIssuesFromCsv();
          if (fetched && fetched.length) {
            issues = fetched;
            saveIssuesToCache(issues);
            if (els.syncIssuesText) {
              els.syncIssuesText.textContent = 'Issues: just now';
              els.syncIssuesDot?.classList.remove('ok', 'warn', 'err');
              els.syncIssuesDot?.classList.add('ok');
            }
          }
        } catch (err) {
          console.warn('CSV fetch failed', err);
        }
      }

      // Fallback to cache again
      if (!issues) {
        const cached = loadIssuesFromCache();
        if (cached) {
          issues = cached.issues;
          if (els.syncIssuesText) {
            els.syncIssuesText.textContent = `Issues: cache (${humanTimeAgo(cached.updatedAt)})`;
            els.syncIssuesDot?.classList.remove('ok', 'warn', 'err');
            els.syncIssuesDot?.classList.add('warn');
          }
        }
      }

      // Final fallback: sample issues
      if (!issues) {
        issues = normalizeIssues(SAMPLE_ISSUES);
        if (els.syncIssuesText) {
          els.syncIssuesText.textContent = 'Issues: sample data';
          els.syncIssuesDot?.classList.remove('ok', 'warn', 'err');
          els.syncIssuesDot?.classList.add('err');
        }
      }

      state.rawIssues = normalizeIssues(issues);
      applyFiltersAndSort(true);
      populateFilterOptions();
      updateIssuesSummary();
      updateKpis();
      updateCharts();
      renderTable();
      updateActiveFilterChips();
      updatePlannerTicketsDropdown();
      runAiInsights();

      // Hide skeleton
      if (els.tbodySkeleton && els.issuesTbody) {
        els.tbodySkeleton.style.display = 'none';
        els.issuesTbody.style.display = '';
      }
    } finally {
      hideSpinner();
    }
  }

  // ---------------------------------------
  // Data loading (events)
  // ---------------------------------------
  function loadEventsFromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEYS.EVENTS);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      return arr;
    } catch {
      return null;
    }
  }

  function saveEventsToStorage() {
    try {
      localStorage.setItem(LS_KEYS.EVENTS, JSON.stringify(state.events));
      if (els.syncEventsText) {
        els.syncEventsText.textContent = 'Events: local';
        els.syncEventsDot?.classList.remove('ok', 'warn', 'err');
        els.syncEventsDot?.classList.add('ok');
      }
    } catch {
      // ignore
    }
  }

  function loadEventIssueLinks() {
    try {
      const raw = localStorage.getItem(LS_KEYS.EVENT_ISSUES);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        state.linkage.eventIssues = obj;
      }
    } catch {
      // ignore
    }
  }

  function saveEventIssueLinks() {
    try {
      localStorage.setItem(LS_KEYS.EVENT_ISSUES, JSON.stringify(state.linkage.eventIssues));
    } catch {
      // ignore
    }
  }

  function initEvents() {
    const stored = loadEventsFromStorage();
    if (stored && stored.length) {
      state.events = stored;
    } else {
      state.events = SAMPLE_EVENTS.slice();
      saveEventsToStorage();
    }
    loadEventIssueLinks();
    if (els.syncEventsText) {
      els.syncEventsText.textContent = 'Events: local';
      els.syncEventsDot?.classList.remove('ok', 'warn', 'err');
      els.syncEventsDot?.classList.add('ok');
    }
  }

  // ---------------------------------------
  // Filters / sort / pagination
  // ---------------------------------------
  function loadUiFromStorage() {
    try {
      const theme = localStorage.getItem(LS_KEYS.THEME);
      if (theme) state.ui.theme = theme;
      const accent = localStorage.getItem(LS_KEYS.ACCENT);
      if (accent) state.ui.accent = accent;
      const activeTab = localStorage.getItem(LS_KEYS.ACTIVE_TAB);
      if (activeTab) state.ui.activeTab = activeTab;

      const filters = localStorage.getItem(LS_KEYS.FILTERS);
      if (filters) {
        const obj = JSON.parse(filters);
        if (obj) Object.assign(state.filters, obj);
      }
      const sort = localStorage.getItem(LS_KEYS.SORT);
      if (sort) {
        const obj = JSON.parse(sort);
        if (obj && obj.key) state.sort = obj;
      }
      const page = localStorage.getItem(LS_KEYS.PAGE);
      if (page) {
        const obj = JSON.parse(page);
        if (obj && obj.pageSize) state.pagination.pageSize = obj.pageSize;
      }
    } catch {
      // ignore
    }
  }

  function saveFiltersToStorage() {
    try {
      localStorage.setItem(LS_KEYS.FILTERS, JSON.stringify(state.filters));
    } catch {}
  }

  function saveSortToStorage() {
    try {
      localStorage.setItem(LS_KEYS.SORT, JSON.stringify(state.sort));
    } catch {}
  }

  function savePageToStorage() {
    try {
      localStorage.setItem(LS_KEYS.PAGE, JSON.stringify(state.pagination));
    } catch {}
  }

  function applyFiltersAndSort(resetPage) {
    const { rawIssues, filters, sort } = state;
    let list = rawIssues.slice();

    // Search
    if (filters.search && filters.search.trim()) {
      const tokens = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((issue) => {
        const hay = (
          (issue.id || '') + ' ' +
          (issue.module || '') + ' ' +
          (issue.title || '') + ' ' +
          (issue.priority || '') + ' ' +
          (issue.status || '') + ' ' +
          (issue.type || '') + ' ' +
          (issue.log || '')
        ).toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }

    // Module / priority / status
    if (filters.module) {
      const m = filters.module.toLowerCase();
      list = list.filter((i) => (i.module || '').toLowerCase() === m);
    }
    if (filters.priority) {
      const p = filters.priority.toLowerCase();
      list = list.filter((i) => (i.priority || '').toLowerCase() === p);
    }
    if (filters.status) {
      const s = filters.status.toLowerCase();
      list = list.filter((i) => (i.status || '').toLowerCase() === s);
    }

    // Dates
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      list = list.filter((i) => {
        if (!i.dateObj) return false;
        return i.dateObj >= start;
      });
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      // make inclusive
      end.setHours(23, 59, 59, 999);
      list = list.filter((i) => {
        if (!i.dateObj) return false;
        return i.dateObj <= end;
      });
    }

    state.filteredIssues = list;

    // Sort
    const dir = sort.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let va, vb;
      switch (sort.key) {
        case 'id':
          va = a.id || '';
          vb = b.id || '';
          break;
        case 'module':
          va = a.module || '';
          vb = b.module || '';
          break;
        case 'title':
          va = a.title || '';
          vb = b.title || '';
          break;
        case 'priority':
          va = a.priority || '';
          vb = b.priority || '';
          break;
        case 'status':
          va = a.status || '';
          vb = b.status || '';
          break;
        case 'date':
          va = a.dateObj ? a.dateObj.getTime() : 0;
          vb = b.dateObj ? b.dateObj.getTime() : 0;
          break;
        case 'log':
          va = a.log || '';
          vb = b.log || '';
          break;
        default:
          va = a.dateObj ? a.dateObj.getTime() : 0;
          vb = b.dateObj ? b.dateObj.getTime() : 0;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    state.issues = list;
    if (resetPage) state.pagination.page = 1;
  }

  function resetFilters() {
    state.filters = {
      module: null,
      priority: null,
      status: null,
      startDate: null,
      endDate: null,
      search: ''
    };
    if (els.moduleFilter) els.moduleFilter.value = '';
    if (els.priorityFilter) els.priorityFilter.value = '';
    if (els.statusFilter) els.statusFilter.value = '';
    if (els.startDateFilter) els.startDateFilter.value = '';
    if (els.endDateFilter) els.endDateFilter.value = '';
    if (els.searchInput) els.searchInput.value = '';
    saveFiltersToStorage();
    applyFiltersAndSort(true);
    updateIssuesSummary();
    updateKpis();
    updateCharts();
    renderTable();
    updateActiveFilterChips();
    updatePlannerTicketsDropdown();
    runAiInsights();
  }

  // ---------------------------------------
  // Filter dropdown options
  // ---------------------------------------
  function populateFilterOptions() {
    const modules = new Set();
    const prios = new Set();
    const statuses = new Set();

    state.rawIssues.forEach((i) => {
      if (i.module) modules.add(i.module);
      if (i.priority) prios.add(i.priority);
      if (i.status) statuses.add(i.status);
    });

    function fillSelect(selectEl, values, current) {
      if (!selectEl) return;
      const prev = selectEl.value;
      selectEl.innerHTML = '';
      const optAll = document.createElement('option');
      optAll.value = '';
      optAll.textContent = 'All';
      selectEl.appendChild(optAll);

      Array.from(values)
        .sort((a, b) => a.localeCompare(b))
        .forEach((v) => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          selectEl.appendChild(opt);
        });

      const val = current || prev;
      if (val) selectEl.value = val;
    }

    fillSelect(els.moduleFilter, modules, state.filters.module);
    fillSelect(els.priorityFilter, prios, state.filters.priority);
    fillSelect(els.statusFilter, statuses, state.filters.status);
  }

  // ---------------------------------------
  // Summary & KPIs
  // ---------------------------------------
  function updateIssuesSummary() {
    if (!els.issuesSummaryText) return;
    const total = state.rawIssues.length;
    const open = state.rawIssues.filter(isOpenIssue).length;
    const highOpen = state.rawIssues.filter((i) => isOpenIssue(i) && String(i.priority).toLowerCase() === 'high').length;

    let latestDate = null;
    state.rawIssues.forEach((i) => {
      if (i.dateObj && !Number.isNaN(i.dateObj)) {
        if (!latestDate || i.dateObj > latestDate) latestDate = i.dateObj;
      }
    });

    const parts = [];
    parts.push(`${total} issues total`);
    parts.push(`${open} open`);
    parts.push(`${highOpen} high priority open`);
    if (latestDate) {
      parts.push(`latest: ${formatDate(latestDate, false)}`);
    }

    els.issuesSummaryText.textContent = parts.join(' · ');
  }

  function updateKpis() {
    if (!els.kpis) return;
    const issues = state.filteredIssues;

    const total = issues.length;
    const open = issues.filter(isOpenIssue).length;
    const resolved = issues.filter((i) => !isOpenIssue(i)).length;
    const highOpen = issues.filter((i) => isOpenIssue(i) && (i.priority || '').toLowerCase() === 'high').length;

    const now = new Date();
    const last7 = issues.filter((i) => i.dateObj && daysBetween(i.dateObj, now) <= 7).length;

    const avgRisk = issues.length
      ? (issues.reduce((acc, i) => acc + (i.risk || 0), 0) / issues.length).toFixed(1)
      : '–';

    els.kpis.innerHTML = '';

    const kpis = [
      {
        label: 'Total Issues',
        value: total,
        sub: `${last7} in the last 7 days`,
        onClick: () => resetFilters()
      },
      {
        label: 'Open',
        value: open,
        sub: `${resolved} resolved`,
        filter: { status: 'open' },
        onClick: () => {
          state.filters.status = 'open';
          saveFiltersToStorage();
          applyFiltersAndSort(true);
          updateIssuesSummary();
          updateKpis();
          updateCharts();
          renderTable();
          updateActiveFilterChips();
          updatePlannerTicketsDropdown();
          runAiInsights();
        }
      },
      {
        label: 'High Priority Open',
        value: highOpen,
        sub: 'High + Open only',
        filter: { priority: 'high', status: 'open' },
        onClick: () => {
          state.filters.priority = 'high';
          state.filters.status = 'open';
          saveFiltersToStorage();
          applyFiltersAndSort(true);
          updateIssuesSummary();
          updateKpis();
          updateCharts();
          renderTable();
          updateActiveFilterChips();
          updatePlannerTicketsDropdown();
          runAiInsights();
        }
      },
      {
        label: 'Average Risk',
        value: avgRisk,
        sub: '0–10 heuristic score',
        onClick: () => {
          // filter to risk >= 7
          const risky = state.rawIssues.filter((i) => (i.risk || 0) >= 7);
          state.filteredIssues = risky;
          state.issues = risky.slice();
          state.pagination.page = 1;
          renderTable();
          updateActiveFilterChips();
          updatePlannerTicketsDropdown();
          runAiInsights();
        }
      }
    ];

    kpis.forEach((k) => {
      const card = document.createElement('div');
      card.className = 'card kpi';
      card.tabIndex = 0;
      card.innerHTML = `
        <div class="label">${escapeHtml(k.label)}</div>
        <div class="value">${escapeHtml(String(k.value))}</div>
        <div class="sub">${escapeHtml(k.sub || '')}</div>
      `;
      card.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof k.onClick === 'function') k.onClick();
      });
      card.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (typeof k.onClick === 'function') k.onClick();
        }
      });
      els.kpis.appendChild(card);
    });
  }

  // ---------------------------------------
  // Charts
  // ---------------------------------------
  function buildCounts(key) {
    const map = new Map();
    state.filteredIssues.forEach((i) => {
      const v = (i[key] || 'Unknown').trim() || 'Unknown';
      map.set(v, (map.get(v) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }

  function createOrUpdateChart(name, canvasId, type, counts, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    const ctx = canvas.getContext('2d');

    const labels = counts.map(([k]) => k);
    const dataVals = counts.map(([, v]) => v);

    const accent = getCssVar('--accent') || '#2563eb';
    const muted = getCssVar('--muted') || '#9ca3af';

    const config = {
      type,
      data: {
        labels,
        datasets: [
          {
            label,
            data: dataVals,
            backgroundColor: accent,
            borderColor: accent,
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { intersect: false, mode: 'index' }
        },
        scales: type === 'bar'
          ? {
              x: { ticks: { color: muted }, grid: { display: false } },
              y: {
                ticks: { color: muted, precision: 0 },
                grid: { color: 'rgba(148,163,184,.25)' },
                beginAtZero: true
              }
            }
          : {}
      }
    };

    if (state.charts[name]) {
      state.charts[name].data = config.data;
      state.charts[name].options = config.options;
      state.charts[name].update();
    } else {
      state.charts[name] = new window.Chart(ctx, config);
    }
  }

  function updateCharts() {
    const byModule = buildCounts('module').slice(0, 10);
    const byPriority = buildCounts('priority');
    const byStatus = buildCounts('status');
    const byType = buildCounts('type');

    createOrUpdateChart('byModule', 'byModule', 'bar', byModule, 'Issues by module');
    createOrUpdateChart('byPriority', 'byPriority', 'bar', byPriority, 'Issues by priority');
    createOrUpdateChart('byStatus', 'byStatus', 'bar', byStatus, 'Issues by status');
    createOrUpdateChart('byType', 'byType', 'bar', byType, 'Issues by type');
  }

  // ---------------------------------------
  // Table rendering & pagination
  // ---------------------------------------
  function renderTable() {
    if (!els.issuesTbody) return;
    const { page, pageSize } = state.pagination;
    const total = state.issues.length;
    const totalPages = total ? Math.ceil(total / pageSize) : 1;
    const safePage = Math.min(Math.max(1, page), totalPages);
    state.pagination.page = safePage;

    const startIdx = (safePage - 1) * pageSize;
    const endIdx = startIdx + pageSize;

    const slice = state.issues.slice(startIdx, endIdx);
    els.issuesTbody.innerHTML = '';

    slice.forEach((issue) => {
      const tr = document.createElement('tr');
      tr.dataset.id = issue.id || '';

      const riskPercent = Math.min(100, Math.round((issue.risk || 0) * 10));

      const statusClass = issue.status
        ? 'status-' + issue.status.trim().replace(/\s+/g, '-')
        : '';
      const priorityClass = issue.priority
        ? 'priority-' + issue.priority.trim()
        : '';

      const dateText = issue.dateObj ? formatDate(issue.dateObj, false) : (issue.date || '');

      tr.innerHTML = `
        <td>${escapeHtml(issue.id || '')}</td>
        <td>${escapeHtml(issue.module || '')}</td>
        <td>
          <div>${escapeHtml(issue.title || '')}</div>
          <div class="risk-bar-wrap" aria-hidden="true">
            <div class="risk-bar" style="width:${riskPercent}%;"></div>
          </div>
        </td>
        <td>
          ${issue.priority ? `<span class="pill ${priorityClass}">${escapeHtml(issue.priority)}</span>` : ''}
        </td>
        <td>
          ${issue.status ? `<span class="pill ${statusClass}">${escapeHtml(issue.status)}</span>` : ''}
        </td>
        <td>${escapeHtml(dateText)}</td>
        <td>${escapeHtml(issue.log || '').slice(0, 120)}${issue.log && issue.log.length > 120 ? '…' : ''}</td>
        <td>
          ${issue.link
            ? `<a href="${escapeHtml(issue.link)}" target="_blank" rel="noopener noreferrer">Open</a>`
            : ''}
        </td>
      `;

      tr.addEventListener('click', (e) => {
        // avoid interfering with clicking the link
        if (e.target && e.target.tagName === 'A') return;
        openIssueModal(issue);
      });

      els.issuesTbody.appendChild(tr);
    });

    // Row count
    if (els.rowCount) {
      els.rowCount.textContent = `${slice.length} of ${total} issues`;
    }

    // Pagination controls
    if (els.pageInfo) {
      els.pageInfo.textContent = `Page ${safePage} of ${totalPages}`;
    }
    if (els.firstPage) els.firstPage.disabled = safePage <= 1;
    if (els.prevPage) els.prevPage.disabled = safePage <= 1;
    if (els.nextPage) els.nextPage.disabled = safePage >= totalPages;
    if (els.lastPage) els.lastPage.disabled = safePage >= totalPages;

    if (els.pageSize) {
      els.pageSize.value = String(state.pagination.pageSize);
    }

    savePageToStorage();
  }

  // ---------------------------------------
  // Active filter chips
  // ---------------------------------------
  function updateActiveFilterChips() {
    if (!els.activeFiltersChips) return;
    const chips = [];
    const { filters } = state;

    if (filters.module) chips.push({ key: 'module', label: `Module: ${filters.module}` });
    if (filters.priority) chips.push({ key: 'priority', label: `Priority: ${filters.priority}` });
    if (filters.status) chips.push({ key: 'status', label: `Status: ${filters.status}` });
    if (filters.startDate || filters.endDate) {
      chips.push({
        key: 'date',
        label: `Date: ${filters.startDate || '…'} → ${filters.endDate || '…'}`
      });
    }
    if (filters.search) chips.push({ key: 'search', label: `Search: ${filters.search}` });

    els.activeFiltersChips.innerHTML = '';

    chips.forEach((chip) => {
      const div = document.createElement('div');
      div.className = 'filter-chip';
      div.textContent = chip.label + ' ✕';
      div.dataset.key = chip.key;
      div.addEventListener('click', () => {
        if (chip.key === 'module') state.filters.module = null;
        if (chip.key === 'priority') state.filters.priority = null;
        if (chip.key === 'status') state.filters.status = null;
        if (chip.key === 'date') {
          state.filters.startDate = null;
          state.filters.endDate = null;
          if (els.startDateFilter) els.startDateFilter.value = '';
          if (els.endDateFilter) els.endDateFilter.value = '';
        }
        if (chip.key === 'search') state.filters.search = '';
        if (els.searchInput && chip.key === 'search') els.searchInput.value = '';

        saveFiltersToStorage();
        applyFiltersAndSort(true);
        updateIssuesSummary();
        updateKpis();
        updateCharts();
        renderTable();
        updateActiveFilterChips();
        updatePlannerTicketsDropdown();
        runAiInsights();
      });
      els.activeFiltersChips.appendChild(div);
    });
  }

  // ---------------------------------------
  // Issue modal
  // ---------------------------------------
  function openIssueModal(issue) {
    currentIssueForModal = issue;
    if (!els.issueModal || !els.modalBody || !els.modalTitle) return;

    els.modalTitle.textContent = `${issue.id || 'Issue'} · ${issue.title || ''}`;

    const risk = issue.risk || 0;
    const riskPercent = Math.min(100, Math.round(risk * 10));

    const statusClass = issue.status
      ? 'status-' + issue.status.trim().replace(/\s+/g, '-')
      : '';
    const priorityClass = issue.priority
      ? 'priority-' + issue.priority.trim()
      : '';

    const dateText = issue.dateObj ? formatDate(issue.dateObj, true) : (issue.date || '');

    const pillsHtml = `
      ${issue.module ? `<span class="pill">${escapeHtml(issue.module)}</span>` : ''}
      ${issue.priority ? `<span class="pill ${priorityClass}">${escapeHtml(issue.priority)}</span>` : ''}
      ${issue.status ? `<span class="pill ${statusClass}">${escapeHtml(issue.status)}</span>` : ''}
      ${issue.type ? `<span class="pill">${escapeHtml(issue.type)}</span>` : ''}
    `;

    els.modalBody.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
        ${pillsHtml}
      </div>
      <div class="muted" style="font-size:12px;margin-bottom:10px;">
        ID: <strong>${escapeHtml(issue.id || 'N/A')}</strong>
        ${dateText ? ` · Date: ${escapeHtml(dateText)}` : ''}
        · Risk: <strong>${escapeHtml(String(risk))}</strong>/10
      </div>
      <div class="risk-bar-wrap" style="margin-bottom:8px;">
        <div class="risk-bar" style="width:${riskPercent}%;"></div>
      </div>
      <h3 style="margin:6px 0 4px;font-size:14px;">Description / Log</h3>
      <div style="font-size:13px;white-space:pre-wrap;">${escapeHtml(issue.log || '(no log)')}</div>
      ${issue.link ? `
        <div style="margin-top:8px;font-size:13px;">
          Link: <a href="${escapeHtml(issue.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(issue.link)}</a>
        </div>` : ''}
    `;

    els.issueModal.style.display = 'flex';
  }

  function closeIssueModal() {
    if (!els.issueModal) return;
    els.issueModal.style.display = 'none';
    currentIssueForModal = null;
  }

  function copyIssueId() {
    if (!currentIssueForModal) return;
    const text = currentIssueForModal.id || '';
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => showToast(`Copied ID ${text}`),
      () => showToast('Could not copy ID')
    );
  }

  function copyIssueLink() {
    if (!currentIssueForModal || !currentIssueForModal.link) {
      showToast('No link on this issue');
      return;
    }
    const text = currentIssueForModal.link;
    navigator.clipboard?.writeText(text).then(
      () => showToast('Copied link'),
      () => showToast('Could not copy link')
    );
  }

  // ---------------------------------------
  // Calendar & events
  // ---------------------------------------
  function eventTypeEnabled(type) {
    const t = (type || '').toLowerCase();
    if (t === 'deployment') return els.eventFilterDeployment?.checked !== false;
    if (t === 'maintenance') return els.eventFilterMaintenance?.checked !== false;
    if (t === 'release') return els.eventFilterRelease?.checked !== false;
    return els.eventFilterOther?.checked !== false;
  }

  function getCalendarEvents() {
    return state.events
      .filter((e) => eventTypeEnabled(e.type))
      .map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end || e.start,
        allDay: !!e.allDay,
        extendedProps: {
          type: e.type,
          env: e.env,
          status: e.status,
          owner: e.owner,
          modules: e.modules,
          impactType: e.impactType,
          issueId: e.issueId,
          notes: e.notes
        }
      }));
  }

  function computeEventRisk(event) {
    // Very simple heuristic:
    let score = 2;

    const type = (event.type || '').toLowerCase();
    const env = (event.env || '').toLowerCase();
    if (type === 'deployment') score += 2;
    if (type === 'release') score += 3;
    if (env === 'prod') score += 2;
    if (env === 'staging') score += 1;

    const impact = (event.impactType || '').toLowerCase();
    if (impact.includes('high risk')) score += 2;
    if (impact.includes('customer visible')) score += 1;

    // Align with open high-risk issues in same modules
    const modules = event.modules || [];
    if (modules.length) {
      const affectedIssues = state.rawIssues.filter((i) => {
        const m = (i.module || '').toLowerCase();
        return modules.some((mod) => m === mod.toLowerCase());
      });

      const highOpen = affectedIssues.filter(
        (i) => isOpenIssue(i) && (i.priority || '').toLowerCase() === 'high'
      );
      score += highOpen.length * 0.8;

      const avgRisk =
        affectedIssues.length
          ? affectedIssues.reduce((acc, i) => acc + (i.risk || 0), 0) / affectedIssues.length
          : 0;
      score += avgRisk / 5;
    }

    // Linked issues mapping
    const linked = state.linkage.eventIssues[event.id] || [];
    if (linked.length >= 3) score += 1.5;
    if (linked.length >= 5) score += 1;

    if (score < 0) score = 0;
    if (score > 10) score = 10;
    return Number(score.toFixed(1));
  }

  function riskBadgeLabel(score) {
    if (score >= 8) return { label: 'Critical', className: 'risk-crit' };
    if (score >= 6) return { label: 'High', className: 'risk-high' };
    if (score >= 4) return { label: 'Medium', className: 'risk-med' };
    return { label: 'Low', className: 'risk-low' };
  }

  function initCalendar() {
    if (!window.FullCalendar || !els.calendar) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (els.calendarTz) {
      els.calendarTz.textContent = `Timezone: ${tz}`;
    }

    const calendar = new window.FullCalendar.Calendar(els.calendar, {
      initialView: 'dayGridMonth',
      height: 'auto',
      contentHeight: 550,
      selectable: true,
      timezone: 'local',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
      },
      events: (info, success) => {
        success(getCalendarEvents());
      },
      eventClassNames: (arg) => {
        const { type, env } = arg.event.extendedProps;
        const classes = [];
        if (type) classes.push('event-type-' + type.toLowerCase());
        if (env) classes.push('event-env-' + env.toLowerCase());

        // Risk based styling
        const ev = state.events.find((e) => e.id === arg.event.id);
        if (ev) {
          const r = computeEventRisk(ev);
          if (r >= 8) classes.push('event-hot');
          else if (r >= 6) classes.push('event-collision');
          else if (r >= 4) classes.push('event-freeze');
        }
        return classes;
      },
      eventDidMount: (info) => {
        const ev = state.events.find((e) => e.id === info.event.id);
        if (!ev) return;
        const risk = computeEventRisk(ev);
        const badgeInfo = riskBadgeLabel(risk);
        const el = info.el.querySelector('.fc-event-title');
        if (el) {
          const span = document.createElement('span');
          span.className = 'event-risk-badge ' + badgeInfo.className;
          span.textContent = `${badgeInfo.label} · ${risk}`;
          el.appendChild(span);
        }
      },
      eventClick: (info) => {
        const ev = state.events.find((e) => e.id === info.event.id);
        if (ev) openEventModal(ev);
      },
      dateClick: (info) => {
        // Create new event starting at clicked date
        const base = {
          id: idFromTitle('New Event'),
          title: '',
          type: 'Deployment',
          env: 'Prod',
          status: 'Planned',
          owner: '',
          modules: [],
          impactType: 'No downtime expected',
          issueId: '',
          start: info.dateStr,
          end: '',
          allDay: true,
          notes: ''
        };
        openEventModal(base, true);
      }
    });

    calendar.render();
    state.calendar = calendar;
  }

  function openEventModal(event, isNew) {
    if (!els.eventModal) return;
    currentEventId = event.id || idFromTitle(event.title);

    els.eventTitle.value = event.title || '';
    els.eventType.value = event.type || 'Deployment';
    els.eventEnv.value = event.env || 'Prod';
    els.eventStatus.value = event.status || 'Planned';
    els.eventOwner.value = event.owner || '';
    els.eventModules.value = (event.modules || []).join(', ');
    els.eventImpactType.value = event.impactType || 'No downtime expected';
    els.eventIssueId.value = event.issueId || '';
    els.eventStart.value = isoToLocalInputValue(event.start || new Date().toISOString());
    els.eventAllDay.checked = !!event.allDay;
    els.eventEnd.value = event.end ? isoToLocalInputValue(event.end) : '';
    els.eventDescription.value = event.notes || '';

    const linked = state.linkage.eventIssues[currentEventId] || [];
    if (linked.length) {
      els.eventIssueLinkedInfo.style.display = 'block';
      els.eventIssueLinkedInfo.textContent = `Linked tickets: ${linked.join(', ')}`;
    } else {
      els.eventIssueLinkedInfo.style.display = 'none';
    }

    els.eventDelete.style.display = isNew ? 'none' : 'inline-flex';
    els.eventModal.style.display = 'flex';
  }

  function closeEventModal() {
    if (!els.eventModal) return;
    els.eventModal.style.display = 'none';
    currentEventId = null;
  }

  function saveEventFromForm() {
    const id = currentEventId || idFromTitle(els.eventTitle.value);
    const existingIdx = state.events.findIndex((e) => e.id === id);

    const modules = els.eventModules.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const startIso = localInputValueToIso(els.eventStart.value);
    const endIso = els.eventEnd.value ? localInputValueToIso(els.eventEnd.value) : '';

    const event = {
      id,
      title: els.eventTitle.value || '(no title)',
      type: els.eventType.value || 'Deployment',
      env: els.eventEnv.value || 'Prod',
      status: els.eventStatus.value || 'Planned',
      owner: els.eventOwner.value || '',
      modules,
      impactType: els.eventImpactType.value || 'No downtime expected',
      issueId: els.eventIssueId.value || '',
      start: startIso || new Date().toISOString(),
      end: endIso || '',
      allDay: !!els.eventAllDay.checked,
      notes: els.eventDescription.value || ''
    };

    if (existingIdx >= 0) {
      state.events[existingIdx] = event;
    } else {
      state.events.push(event);
    }

    saveEventsToStorage();
    if (state.calendar) {
      state.calendar.refetchEvents();
    }
    updatePlannerReleasePlans();
    runAiInsights();
    showToast('Event saved');
    closeEventModal();
  }

  function deleteCurrentEvent() {
    if (!currentEventId) return;
    const idx = state.events.findIndex((e) => e.id === currentEventId);
    if (idx >= 0) {
      state.events.splice(idx, 1);
      saveEventsToStorage();
      if (state.calendar) state.calendar.refetchEvents();
      delete state.linkage.eventIssues[currentEventId];
      saveEventIssueLinks();
      updatePlannerReleasePlans();
      runAiInsights();
      showToast('Event deleted');
    }
    closeEventModal();
  }

  // ---------------------------------------
  // Release Planner (F&B / MENA)
  // ---------------------------------------
  function computeTimeOfDayRisk(hour, region) {
    // Coarse mapping tailored for F&B rush hours
    const h = hour;
    let score = 2;
    const r = region || 'gulf';

    if (r === 'gulf') {
      // Lunch 13–15, dinner 20–23, late-night peaks 0–2 during Ramadan
      if ((h >= 13 && h <= 15) || (h >= 20 && h <= 23)) score += 4;
      else if (h >= 11 && h <= 12) score += 2.5;
      else if (h >= 0 && h <= 2) score += 3;
      else if (h >= 6 && h <= 9) score += 1;
    } else if (r === 'levant') {
      if ((h >= 12 && h <= 14) || (h >= 19 && h <= 22)) score += 3.5;
      else if (h >= 10 && h <= 11) score += 2;
      else if (h >= 6 && h <= 9) score += 1;
    } else {
      // North Africa / default
      if ((h >= 12 && h <= 14) || (h >= 20 && h <= 23)) score += 3.5;
      else if (h >= 10 && h <= 11) score += 2;
      else if (h >= 6 && h <= 9) score += 1;
    }

    return score;
  }

  function buildPlannerSuggestions() {
    const env = els.plannerEnv.value || 'Prod';
    const region = els.plannerRegion.value || 'gulf';
    const releaseType = els.plannerReleaseType.value || 'feature';
    const modulesInput = els.plannerModules.value || '';
    const desc = els.plannerDescription.value || '';
    const horizonDays = Number(els.plannerHorizon.value || 3);
    const slotsPerDay = Number(els.plannerSlotsPerDay.value || 4);

    const modules = modulesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const now = new Date();
    const candidates = [];

    // Candidate slots: every 3 hours from 06:00 to 23:00
    for (let d = 0; d < horizonDays; d++) {
      const day = new Date(now);
      day.setDate(day.getDate() + d);
      for (let hour = 6; hour <= 23; hour += 3) {
        const start = new Date(day);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(start);
        end.setHours(end.getHours() + 2);

        const base = computeTimeOfDayRisk(hour, region);

        let score = base;

        // Environment weight
        const envLower = env.toLowerCase();
        if (envLower === 'prod') score += 3;
        else if (envLower === 'staging') score += 1.5;
        else if (envLower === 'dev') score += 0.5;

        // Release type
        if (releaseType === 'major') score += 4;
        else if (releaseType === 'feature') score += 2;
        else if (releaseType === 'minor') score += 1;

        // Hot issues overlap for modules
        const textHint = desc.toLowerCase();
        const relevantIssues = state.rawIssues.filter((i) => {
          const mod = (i.module || '').toLowerCase();
          let modMatch = true;
          if (modules.length) {
            modMatch = modules.some((m) => mod === m.toLowerCase());
          }
          const t = `${i.title || ''} ${i.log || ''}`.toLowerCase();
          const textMatch = !textHint || t.includes(textHint.split(/\s+/)[0] || '');
          return isOpenIssue(i) && modMatch && textMatch;
        });

        const highOpen = relevantIssues.filter(
          (i) => (i.priority || '').toLowerCase() === 'high'
        );
        const avgRisk =
          relevantIssues.length
            ? relevantIssues.reduce((acc, i) => acc + (i.risk || 0), 0) / relevantIssues.length
            : 0;

        score += highOpen.length * 0.7;
        score += avgRisk / 4;

        // Collision with existing events
        const windowEvents = state.events.filter((e) => {
          const es = new Date(e.start);
          return (
            es.getFullYear() === start.getFullYear() &&
            es.getMonth() === start.getMonth() &&
            es.getDate() === start.getDate() &&
            Math.abs(es.getHours() - start.getHours()) <= 2
          );
        });

        if (windowEvents.length) {
          score += windowEvents.length * 2;
        }

        // Lower score is safer window
        candidates.push({
          start,
          end,
          score,
          env,
          region,
          releaseType,
          modules,
          issues: relevantIssues,
          collisions: windowEvents
        });
      }
    }

    // Normalise / sort ascending by score (safer = first)
    candidates.sort((a, b) => a.score - b.score);

    // Limit per day
    const byDay = new Map();
    for (const c of candidates) {
      const key = c.start.toISOString().slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, []);
      const arr = byDay.get(key);
      if (arr.length < slotsPerDay) {
        arr.push(c);
      }
    }

    const final = [];
    [...byDay.values()].forEach((arr) => final.push(...arr));
    final.sort((a, b) => a.start - b.start);

    state.planner.suggestions = final;
    state.planner.topSuggestion = final[0] || null;
  }

  function renderPlannerResults() {
    if (!els.plannerResults) return;
    const sugg = state.planner.suggestions || [];
    if (!sugg.length) {
      els.plannerResults.innerHTML = '<span class="muted">No suggestions. Try widening the horizon or loosening filters.</span>';
      els.plannerAddEvent.disabled = true;
      return;
    }

    const horizonText = els.plannerHorizon.value === '1'
      ? 'next 24 hours'
      : `next ${els.plannerHorizon.value} days`;

    let html = `<div class="muted" style="font-size:12px;margin-bottom:4px;">
      Suggested windows (${horizonText}) · lower score = safer
    </div>`;

    sugg.forEach((s, idx) => {
      const riskLabel = riskBadgeLabel(s.score);
      const isTop = idx === 0;
      const startTxt = formatDate(s.start, true);
      const endTxt = formatDate(s.end, true);

      html += `
        <div class="planner-slot">
          <div class="planner-slot-header">
            <span>${escapeHtml(startTxt)} → ${escapeHtml(endTxt)}${isTop ? ' · <strong>Top suggestion</strong>' : ''}</span>
            <span class="planner-slot-score planner-score-${riskLabel.label.toLowerCase()}">
              ${escapeHtml(riskLabel.label)} · ${s.score.toFixed(1)}
            </span>
          </div>
          <div class="planner-slot-meta">
            Env: ${escapeHtml(s.env)} · Type: ${escapeHtml(els.plannerReleaseType.value)}
            ${s.modules?.length ? ` · Modules: ${escapeHtml(s.modules.join(', '))}` : ''}
            ${s.issues?.length ? ` · Related open issues: ${s.issues.length}` : ''}
            ${s.collisions?.length ? ` · Calendar collisions: ${s.collisions.length}` : ''}
          </div>
        </div>
      `;
    });

    els.plannerResults.innerHTML = html;
    els.plannerAddEvent.disabled = !state.planner.topSuggestion;
  }

  function plannerSuggestWindows() {
    buildPlannerSuggestions();
    renderPlannerResults();
    showToast('Release windows suggested');
  }

  function plannerAddTopSuggestionAsEvent() {
    const s = state.planner.topSuggestion;
    if (!s) return;
    // Pre-fill event modal from suggestion
    const env = els.plannerEnv.value || 'Prod';
    const releaseType = els.plannerReleaseType.value || 'feature';
    const title = `Release - ${releaseType} (${env})`;

    const modules = (els.plannerModules.value || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    const ev = {
      id: idFromTitle(title),
      title,
      type: 'Release',
      env,
      status: 'Planned',
      owner: '',
      modules,
      impactType: 'Customer visible',
      issueId: '',
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      allDay: false,
      notes: els.plannerDescription.value || ''
    };

    openEventModal(ev, true);
  }

  function updatePlannerReleasePlans() {
    if (!els.plannerReleasePlan) return;
    const releases = state.events.filter(
      (e) => (e.type || '').toLowerCase() === 'release'
    );
    els.plannerReleasePlan.innerHTML = '';
    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = releases.length ? 'Select a release…' : 'No release events';
    els.plannerReleasePlan.appendChild(optNone);

    releases.forEach((e) => {
      const opt = document.createElement('option');
      opt.value = e.id;
      const datePart = e.start ? formatDate(new Date(e.start), false) : '';
      opt.textContent = `${datePart ? datePart + ' · ' : ''}${e.title}`;
      els.plannerReleasePlan.appendChild(opt);
    });
  }

  function updatePlannerTicketsDropdown() {
    if (!els.plannerTickets) return;
    els.plannerTickets.innerHTML = '';
    const issues = state.filteredIssues;
    if (!issues.length) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.textContent = 'No tickets in current filters';
      els.plannerTickets.appendChild(opt);
      return;
    }
    issues.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = `${i.id || 'N/A'} · ${i.title || ''}`;
      els.plannerTickets.appendChild(opt);
    });
  }

  function assignTicketsToReleasePlan() {
    const planId = els.plannerReleasePlan.value;
    if (!planId) {
      showToast('Select a release plan first');
      return;
    }
    const selected = Array.from(els.plannerTickets.selectedOptions).map((o) => o.value);
    if (!selected.length) {
      showToast('Select one or more tickets');
      return;
    }
    if (!state.linkage.eventIssues[planId]) {
      state.linkage.eventIssues[planId] = [];
    }
    const set = new Set(state.linkage.eventIssues[planId]);
    selected.forEach((id) => set.add(id));
    state.linkage.eventIssues[planId] = Array.from(set);
    saveEventIssueLinks();
    showToast('Tickets linked to release plan');
    runAiInsights();
  }

  // ---------------------------------------
  // AI Insights (heuristic, local)
  // ---------------------------------------
  function runAiInsights() {
    if (!els.aiAnalyzing) return;
    const issues = state.rawIssues;

    if (!issues.length) {
      els.aiAnalyzing.style.display = 'none';
      return;
    }
    els.aiAnalyzing.style.display = 'block';

    // Scope
    const dates = issues
      .map((i) => i.dateObj)
      .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
    let minDate = null;
    let maxDate = null;
    dates.forEach((d) => {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    });

    if (els.aiScopeText) {
      const parts = [];
      parts.push(`${issues.length} issues total`);
      const open = issues.filter(isOpenIssue).length;
      parts.push(`${open} open`);
      if (minDate && maxDate) {
        parts.push(`range: ${formatDate(minDate, false)} → ${formatDate(maxDate, false)}`);
      }
      els.aiScopeText.textContent = parts.join(' · ');
    }

    // Tokens / term counts (last 14 days)
    const now = new Date();
    const last14 = issues.filter((i) => i.dateObj && daysBetween(i.dateObj, now) <= 14);
    const termCounts = new Map();

    last14.forEach((i) => {
      const tokens = tokenize(`${i.title || ''} ${i.log || ''}`);
      tokens.forEach((t) => termCounts.set(t, (termCounts.get(t) || 0) + 1));
    });

    const topTerms = Array.from(termCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    if (els.aiPatternsList) {
      els.aiPatternsList.innerHTML = '';
      topTerms.forEach(([term, count]) => {
        const li = document.createElement('li');
        li.textContent = `${term} · ${count}`;
        els.aiPatternsList.appendChild(li);
      });
    }

    // Suggested categories (very simple keyword mapping)
    const categories = {
      Payments: /payment|card|visa|mastercard|gateway|apple pay|checkout|qr/,
      Auth: /login|auth|2fa|sso|otp|session/,
      POS: /pos|cashier|terminal/,
      Kitchen: /kds|kitchen|printer|expo/,
      Reports: /report|dashboard|bi|analytics/,
      Integrations: /integrat|aggregator|talabat|uber|hungerstation/,
      Performance: /slow|latency|timeout|perf|sluggish/,
      Infra: /server|db|database|redis|queue|kafka|k8s|pod/
    };

    const categoryCounts = {};
    Object.keys(categories).forEach((k) => (categoryCounts[k] = 0));

    issues.forEach((i) => {
      const text = `${i.title || ''} ${i.log || ''}`.toLowerCase();
      Object.entries(categories).forEach(([name, re]) => {
        if (re.test(text)) categoryCounts[name] += 1;
      });
    });

    if (els.aiLabelsList) {
      els.aiLabelsList.innerHTML = '';
      Object.entries(categoryCounts)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, count]) => {
          const li = document.createElement('li');
          li.textContent = `${name}: ${count} issues`;
          els.aiLabelsList.appendChild(li);
        });
    }

    // Signals
    if (els.aiSignalsText) {
      const open = issues.filter(isOpenIssue);
      const highOpen = open.filter((i) => (i.priority || '').toLowerCase() === 'high');
      const avgRisk = open.length
        ? (open.reduce((acc, i) => acc + (i.risk || 0), 0) / open.length).toFixed(1)
        : '–';
      const oldOpen = open.filter((i) => i.dateObj && daysBetween(i.dateObj, now) > 14).length;

      els.aiSignalsText.innerHTML =
        `<ul style="padding-left:18px;margin:0;">
          <li>${open.length} open issues (${highOpen.length} high priority)</li>
          <li>Average risk on open: ${avgRisk}/10</li>
          <li>${oldOpen} open for &gt; 14 days</li>
        </ul>`;
    }

    // Trends (last 14 days, by module)
    const last14ByModule = new Map();
    last14.forEach((i) => {
      const m = i.module || 'Unknown';
      last14ByModule.set(m, (last14ByModule.get(m) || 0) + 1);
    });

    if (els.aiTrendsList) {
      els.aiTrendsList.innerHTML = '';
      Array.from(last14ByModule.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .forEach(([m, c]) => {
          const li = document.createElement('li');
          li.textContent = `${m}: ${c} new in last 14d`;
          els.aiTrendsList.appendChild(li);
        });
    }

    // Incident-like issues
    const incidents = issues.filter((i) => {
      const t = `${i.title || ''} ${i.log || ''}`.toLowerCase();
      return (
        (i.type || '').toLowerCase() === 'incident' ||
        /outage|down|unavailable|major incident|sev1|sev 1|sev2|sev 2/.test(t)
      );
    });

    if (els.aiIncidentsList) {
      els.aiIncidentsList.innerHTML = '';
      incidents.slice(0, 8).forEach((i) => {
        const li = document.createElement('li');
        li.textContent = `${i.id || ''} · ${i.module || ''} · ${i.title || ''}`;
        els.aiIncidentsList.appendChild(li);
      });
    }

    // Emerging vs stable themes (by module)
    const byModule = new Map();
    issues.forEach((i) => {
      const m = i.module || 'Unknown';
      if (!byModule.has(m)) byModule.set(m, { recent: 0, old: 0 });
      const obj = byModule.get(m);
      const age = i.dateObj ? daysBetween(i.dateObj, now) : 999;
      if (age <= 7) obj.recent += 1;
      else obj.old += 1;
    });

    if (els.aiEmergingStable) {
      els.aiEmergingStable.innerHTML = '';
      const emerging = [];
      const stable = [];
      byModule.forEach((v, m) => {
        if (v.recent > v.old) emerging.push({ module: m, ...v });
        else stable.push({ module: m, ...v });
      });

      emerging.sort((a, b) => (b.recent + b.old) - (a.recent + a.old));
      stable.sort((a, b) => (b.recent + b.old) - (a.recent + a.old));

      emerging.slice(0, 3).forEach((e) => {
        const li = document.createElement('li');
        li.textContent = `Emerging: ${e.module} (${e.recent} recent / ${e.old} old)`;
        els.aiEmergingStable.appendChild(li);
      });
      stable.slice(0, 3).forEach((e) => {
        const li = document.createElement('li');
        li.textContent = `Stable: ${e.module} (${e.recent} recent / ${e.old} old)`;
        els.aiEmergingStable.appendChild(li);
      });
    }

    // Ops cockpit (simple modules summary)
    if (els.aiOpsCockpit) {
      els.aiOpsCockpit.innerHTML = '';
      const rows = [];
      byModule.forEach((v, m) => {
        const open = state.rawIssues.filter((i) => isOpenIssue(i) && (i.module || 'Unknown') === m);
        const highOpen = open.filter(
          (i) => (i.priority || '').toLowerCase() === 'high'
        );
        rows.push({ module: m, open: open.length, highOpen: highOpen.length });
      });

      rows
        .sort((a, b) => b.open - a.open)
        .slice(0, 6)
        .forEach((r) => {
          const li = document.createElement('li');
          li.textContent = `${r.module}: ${r.open} open (${r.highOpen} high)`;
          els.aiOpsCockpit.appendChild(li);
        });
    }

    // Per-module risk table
    if (els.aiModulesTableBody) {
      els.aiModulesTableBody.innerHTML = '';
      const modules = {};
      state.rawIssues.forEach((i) => {
        const m = i.module || 'Unknown';
        if (!modules[m]) {
          modules[m] = {
            module: m,
            open: 0,
            high: 0,
            riskSum: 0,
            issues: []
          };
        }
        const bucket = modules[m];
        bucket.issues.push(i);
        if (isOpenIssue(i)) bucket.open += 1;
        if (isOpenIssue(i) && (i.priority || '').toLowerCase() === 'high') bucket.high += 1;
        bucket.riskSum += i.risk || 0;
      });

      const list = Object.values(modules).sort((a, b) => b.riskSum - a.riskSum);
      list.forEach((m) => {
        const topTokens = new Map();
        m.issues.forEach((i) => {
          tokenize(`${i.title || ''} ${i.log || ''}`).forEach((t) => {
            topTokens.set(t, (topTokens.get(t) || 0) + 1);
          });
        });
        const topTerm = Array.from(topTokens.entries())
          .sort((a, b) => b[1] - a[1])[0];

        const tr = document.createElement('tr');
        const riskAvg = m.issues.length ? (m.riskSum / m.issues.length).toFixed(1) : '–';
        const riskPercent = m.issues.length ? Math.min(100, Math.round((m.riskSum / m.issues.length) * 10)) : 0;
        tr.innerHTML = `
          <td>${escapeHtml(m.module)}</td>
          <td>${m.open}</td>
          <td>${m.high}</td>
          <td>
            ${escapeHtml(String(riskAvg))}
            <div class="risk-bar-wrap">
              <div class="risk-bar" style="width:${riskPercent}%;"></div>
            </div>
          </td>
          <td>${topTerm ? escapeHtml(topTerm[0]) : ''}</td>
        `;
        els.aiModulesTableBody.appendChild(tr);
      });
    }

    // Top risks this week
    const recentOpen = issues.filter(
      (i) => isOpenIssue(i) && i.dateObj && daysBetween(i.dateObj, now) <= 7
    );

    const topRisk = recentOpen
      .slice()
      .sort((a, b) => (b.risk || 0) - (a.risk || 0))
      .slice(0, 8);

    if (els.aiRisksList) {
      els.aiRisksList.innerHTML = '';
      topRisk.forEach((i) => {
        const li = document.createElement('li');
        li.textContent = `${i.id || ''} · ${i.module || ''} · risk ${i.risk || 0} · ${i.title || ''}`;
        els.aiRisksList.appendChild(li);
      });
    }

    // Similar issue clusters (very rough by keyword)
    if (els.aiClusters) {
      els.aiClusters.innerHTML = '';
      const clusterKeywords = [
        { key: 'payments', re: /payment|card|checkout|apple pay|gateway/ },
        { key: 'auth', re: /login|auth|2fa|sso|otp/ },
        { key: 'kitchen', re: /kds|kitchen|printer/ },
        { key: 'performance', re: /slow|latency|timeout|perf|sluggish/ }
      ];

      clusterKeywords.forEach((c) => {
        const match = issues.filter((i) => {
          const t = `${i.title || ''} ${i.log || ''}`.toLowerCase();
          return c.re.test(t);
        });
        if (!match.length) return;
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<strong>${escapeHtml(c.key)}</strong>`;
        const ul = document.createElement('ul');
        ul.className = 'muted';
        ul.style.fontSize = '13px';
        ul.style.marginTop = '4px';
        ul.style.paddingLeft = '18px';
        match.slice(0, 6).forEach((i) => {
          const li = document.createElement('li');
          li.textContent = `${i.id || ''} · ${i.title || ''}`;
          ul.appendChild(li);
        });
        div.appendChild(ul);
        els.aiClusters.appendChild(div);
      });
    }

    // Triage queue: missing fields / misaligned priority
    if (els.aiTriageList) {
      const triage = issues.filter((i) => {
        if (!i.priority || !i.status || !i.module) return true;
        const t = `${i.title || ''} ${i.log || ''}`.toLowerCase();
        if ((i.priority || '').toLowerCase() === 'low' && /outage|down|unavailable|sev1|sev 1/.test(t)) {
          return true;
        }
        if ((i.priority || '').toLowerCase() === 'high' && /typo|cosmetic|copy/.test(t)) {
          return true;
        }
        return false;
      });

      triage.sort((a, b) => (b.risk || 0) - (a.risk || 0));

      els.aiTriageList.innerHTML = '';
      triage.slice(0, 10).forEach((i) => {
        const li = document.createElement('li');
        const reasons = [];
        if (!i.priority) reasons.push('missing priority');
        if (!i.status) reasons.push('missing status');
        if (!i.module) reasons.push('missing module');
        const t = `${i.title || ''} ${i.log || ''}`.toLowerCase();
        if ((i.priority || '').toLowerCase() === 'low' && /outage|down|unavailable|sev1|sev 1/.test(t)) {
          reasons.push('priority too low vs text');
        }
        if ((i.priority || '').toLowerCase() === 'high' && /typo|cosmetic|copy/.test(t)) {
          reasons.push('priority maybe too high');
        }
        li.textContent = `${i.id || ''} · ${i.module || ''} · risk ${i.risk || 0} — ${reasons.join(', ') || 'check completeness'}`;
        els.aiTriageList.appendChild(li);
      });
    }

    // Upcoming risky events (next 7 days)
    if (els.aiEventsList) {
      const nowDate = new Date();
      const next7 = new Date();
      next7.setDate(nowDate.getDate() + 7);
      const events = state.events.filter((e) => {
        const s = new Date(e.start);
        return s >= nowDate && s <= next7;
      });

      const withRisk = events.map((e) => {
        const risk = computeEventRisk(e);
        const modules = e.modules || [];
        const linked = state.linkage.eventIssues[e.id] || [];

        // combine open high risk issues for modules
        const modIssues = modules.length
          ? state.rawIssues.filter((i) =>
              modules.some(
                (m) => (i.module || '').toLowerCase() === m.toLowerCase()
              )
            )
          : [];

        const highOpen = modIssues.filter(
          (i) => isOpenIssue(i) && (i.priority || '').toLowerCase() === 'high'
        );

        return {
          event: e,
          risk,
          linkedCount: linked.length,
          highOpen: highOpen.length
        };
      });

      withRisk.sort((a, b) => b.risk - a.risk);

      els.aiEventsList.innerHTML = '';
      withRisk.slice(0, 8).forEach((r) => {
        const e = r.event;
        const li = document.createElement('li');
        const date = e.start ? formatDate(new Date(e.start), true) : '';
        li.textContent =
          `${date ? date + ' · ' : ''}${e.title} (${e.type || ''}, ${e.env || ''}) — risk ${r.risk}` +
          (r.linkedCount ? ` · linked tickets: ${r.linkedCount}` : '') +
          (r.highOpen ? ` · open high issues in modules: ${r.highOpen}` : '');
        els.aiEventsList.appendChild(li);
      });
    }

    els.aiAnalyzing.style.display = 'none';
  }

  // ---------------------------------------
  // AI Query Language
  // ---------------------------------------
  function parseAiQuery(q) {
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    const filters = {
      module: null,
      status: null,
      priority: null,
      type: null,
      id: null,
      riskMin: null,
      lastDays: null,
      ageMinDays: null,
      missing: null,
      sort: null,
      textTerms: [],
      eventScope: null // 'next7d' / 'today'
    };

    tokens.forEach((t) => {
      const [k, rawVal] = t.split(':');
      if (!rawVal) {
        // no colon, treat as text search
        filters.textTerms.push(t.toLowerCase());
        return;
      }
      const val = rawVal.toLowerCase();

      switch (k.toLowerCase()) {
        case 'module':
          filters.module = val;
          break;
        case 'status':
          filters.status = val;
          break;
        case 'priority':
          filters.priority = val;
          break;
        case 'type':
          filters.type = val;
          break;
        case 'id':
          filters.id = rawVal;
          break;
        case 'risk>=':
        case 'risk':
          filters.riskMin = parseFloat(val.replace(/[^\d.]/g, '')) || 0;
          break;
        case 'last':
          filters.lastDays = parseInt(val.replace(/[^\d]/g, ''), 10) || null;
          break;
        case 'age>':
        case 'age>=':
          filters.ageMinDays = parseInt(val.replace(/[^\d]/g, ''), 10) || null;
          break;
        case 'missing':
          filters.missing = val; // priority / status / module
          break;
        case 'sort':
          if (['risk', 'date', 'priority'].includes(val)) filters.sort = val;
          break;
        case 'event':
          if (val === 'next7d' || val === 'today') filters.eventScope = val;
          break;
        default:
          filters.textTerms.push(t.toLowerCase());
      }
    });

    return filters;
  }

  function runAiQuery() {
    const q = els.aiQueryInput.value.trim();
    if (!q) {
      els.aiQueryResults.textContent = 'Enter a query (e.g. "payments risk>=8 last:7d sort:risk").';
      return;
    }

    const filters = parseAiQuery(q);
    const now = new Date();

    // Events query
    if (filters.eventScope) {
      const events = state.events.filter((e) => {
        const date = new Date(e.start);
        if (filters.eventScope === 'today') {
          const today = new Date();
          return (
            date.getFullYear() === today.getFullYear() &&
            date.getMonth() === today.getMonth() &&
            date.getDate() === today.getDate()
          );
        }
        if (filters.eventScope === 'next7d') {
          const next7 = new Date();
          next7.setDate(now.getDate() + 7);
          return date >= now && date <= next7;
        }
        return false;
      });

      const results = events
        .map((e) => {
          const risk = computeEventRisk(e);
          return { e, risk };
        })
        .sort((a, b) => b.risk - a.risk);

      let html = `<div><strong>${results.length} events match</strong></div><ul style="padding-left:18px;font-size:13px;margin-top:4px;">`;
      results.slice(0, 20).forEach((r) => {
        html += `<li>${formatDate(new Date(r.e.start), true)} · ${escapeHtml(r.e.title)} (${escapeHtml(r.e.type || '')}, ${escapeHtml(r.e.env || '')}) — risk ${r.risk}</li>`;
      });
      html += '</ul>';
      els.aiQueryResults.innerHTML = html;
      state.ai.lastQueryIssues = null;
      state.ai.lastQueryFilters = filters;
      return;
    }

    // Issues query
    let list = state.rawIssues.slice();

    if (filters.module) {
      const m = filters.module;
      list = list.filter((i) =>
        (i.module || '').toLowerCase().includes(m.toLowerCase())
      );
    }
    if (filters.status) {
      const s = filters.status;
      if (s === 'open') list = list.filter((i) => isOpenIssue(i));
      else list = list.filter((i) => (i.status || '').toLowerCase().includes(s));
    }
    if (filters.priority) {
      const p = filters.priority;
      list = list.filter((i) => (i.priority || '').toLowerCase().includes(p));
    }
    if (filters.type) {
      const t = filters.type;
      list = list.filter((i) => (i.type || '').toLowerCase().includes(t));
    }
    if (filters.id) {
      const id = filters.id.toLowerCase();
      list = list.filter((i) => (i.id || '').toLowerCase().includes(id));
    }
    if (filters.riskMin != null) {
      list = list.filter((i) => (i.risk || 0) >= filters.riskMin);
    }
    if (filters.lastDays != null) {
      list = list.filter(
        (i) =>
          i.dateObj &&
          daysBetween(i.dateObj, now) <= filters.lastDays
      );
    }
    if (filters.ageMinDays != null) {
      list = list.filter(
        (i) =>
          i.dateObj &&
          daysBetween(i.dateObj, now) >= filters.ageMinDays
      );
    }
    if (filters.missing) {
      const f = filters.missing;
      list = list.filter((i) => {
        if (f === 'priority') return !i.priority;
        if (f === 'status') return !i.status;
        if (f === 'module') return !i.module;
        return false;
      });
    }
    if (filters.textTerms && filters.textTerms.length) {
      list = list.filter((i) => {
        const text = `${i.title || ''} ${i.log || ''}`.toLowerCase();
        return filters.textTerms.every((t) => text.includes(t));
      });
    }

    // Sort
    if (filters.sort === 'risk') {
      list.sort((a, b) => (b.risk || 0) - (a.risk || 0));
    } else if (filters.sort === 'date') {
      list.sort((a, b) => {
        const ta = a.dateObj ? a.dateObj.getTime() : 0;
        const tb = b.dateObj ? b.dateObj.getTime() : 0;
        return tb - ta;
      });
    } else if (filters.sort === 'priority') {
      const rank = { high: 3, medium: 2, low: 1 };
      list.sort((a, b) => {
        const pa = rank[(a.priority || '').toLowerCase()] || 0;
        const pb = rank[(b.priority || '').toLowerCase()] || 0;
        return pb - pa;
      });
    }

    state.ai.lastQueryIssues = list;
    state.ai.lastQueryFilters = filters;

    let html = `<div><strong>${list.length} issues match</strong></div>`;
    html += '<ul style="padding-left:18px;font-size:13px;margin-top:4px;">';
    list.slice(0, 30).forEach((i) => {
      html += `<li>${escapeHtml(i.id || '')} · ${escapeHtml(i.module || '')} · ${escapeHtml(i.title || '')} (risk ${i.risk || 0})</li>`;
    });
    if (list.length > 30) {
      html += `<li>… and ${list.length - 30} more</li>`;
    }
    html += '</ul>';
    els.aiQueryResults.innerHTML = html;
  }

  function applyAiQueryToIssues() {
    const issues = state.ai.lastQueryIssues;
    const filters = state.ai.lastQueryFilters;
    if (!issues || !filters) {
      showToast('Run a query on issues first');
      return;
    }
    state.filteredIssues = issues.slice();
    state.issues = issues.slice();
    state.pagination.page = 1;
    renderTable();
    updateActiveFilterChips();
    updatePlannerTicketsDropdown();

    // Switch to Issues tab
    setActiveTab('issues');
    showToast('Query applied to Issues view');
  }

  function exportAiQueryCsv() {
    const issues = state.ai.lastQueryIssues;
    if (!issues || !issues.length) {
      showToast('No query results to export');
      return;
    }
    const rows = [];
    const header = ['ID','Module','Title','Priority','Status','Date','Type','Risk','Log','Link'];
    rows.push(header.join(','));

    issues.forEach((i) => {
      const cols = [
        i.id || '',
        i.module || '',
        i.title || '',
        i.priority || '',
        i.status || '',
        i.date || '',
        i.type || '',
        i.risk != null ? String(i.risk) : '',
        (i.log || '').replace(/\n/g, ' ').replace(/"/g, '""'),
        i.link || ''
      ];
      const line = cols
        .map((c) => `"${c.replace(/"/g, '""')}"`)
        .join(',');
      rows.push(line);
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'incheck-ai-query.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported CSV for AI query');
  }

  // ---------------------------------------
  // Export filtered issues
  // ---------------------------------------
  function exportFilteredCsv() {
    const issues = state.issues;
    if (!issues.length) {
      showToast('No issues to export');
      return;
    }
    const rows = [];
    const header = ['ID','Module','Title','Priority','Status','Date','Type','Risk','Log','Link'];
    rows.push(header.join(','));

    issues.forEach((i) => {
      const cols = [
        i.id || '',
        i.module || '',
        i.title || '',
        i.priority || '',
        i.status || '',
        i.date || '',
        i.type || '',
        i.risk != null ? String(i.risk) : '',
        (i.log || '').replace(/\n/g, ' ').replace(/"/g, '""'),
        i.link || ''
      ];
      const line = cols
        .map((c) => `"${c.replace(/"/g, '""')}"`)
        .join(',');
      rows.push(line);
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'incheck-issues-filtered.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported filtered issues as CSV');
  }

  // ---------------------------------------
  // Theme / accent / tabs
  // ---------------------------------------
  function applyTheme() {
    const root = document.documentElement;
    const theme = state.ui.theme;
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      root.removeAttribute('data-theme');
    } else {
      // system
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', 'light');
    }

    if (els.themeSelect) {
      els.themeSelect.value = theme;
    }
  }

  function applyAccent() {
    if (!state.ui.accent) return;
    const root = document.documentElement;
    root.style.setProperty('--accent', state.ui.accent);
    if (els.accentColor) {
      els.accentColor.value = state.ui.accent;
    }
    updateCharts();
  }

  function setActiveTab(tab) {
    state.ui.activeTab = tab;
    try {
      localStorage.setItem(LS_KEYS.ACTIVE_TAB, tab);
    } catch {}

    ['issues','calendar','insights'].forEach((t) => {
      const btn = document.getElementById(t + 'Tab');
      const view = document.getElementById(t + 'View');
      if (btn) {
        btn.classList.toggle('active', t === tab);
        btn.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      }
      if (view) {
        view.classList.toggle('active', t === tab);
      }
    });
  }

  // ---------------------------------------
  // Event wiring
  // ---------------------------------------
  function setupDomRefs() {
    els = {
      drawerBtn: document.getElementById('drawerBtn'),
      sidebar: document.getElementById('sidebar'),
      searchInput: document.getElementById('searchInput'),
      themeSelect: document.getElementById('themeSelect'),
      accentColor: document.getElementById('accentColor'),
      refreshNow: document.getElementById('refreshNow'),
      exportCsv: document.getElementById('exportCsv'),
      createTicketBtn: document.getElementById('createTicketBtn'),
      shortcutsHelp: document.getElementById('shortcutsHelp'),
      onlineStatusChip: document.getElementById('onlineStatusChip'),
      syncIssuesText: document.getElementById('syncIssuesText'),
      syncIssuesDot: document.getElementById('syncIssuesDot'),
      syncEventsText: document.getElementById('syncEventsText'),
      syncEventsDot: document.getElementById('syncEventsDot'),
      loadingStatus: document.getElementById('loadingStatus'),
      moduleFilter: document.getElementById('moduleFilter'),
      priorityFilter: document.getElementById('priorityFilter'),
      statusFilter: document.getElementById('statusFilter'),
      startDateFilter: document.getElementById('startDateFilter'),
      endDateFilter: document.getElementById('endDateFilter'),
      resetBtn: document.getElementById('resetBtn'),
      issuesSummaryText: document.getElementById('issuesSummaryText'),
      kpis: document.getElementById('kpis'),
      issuesTbody: document.getElementById('issuesTbody'),
      tbodySkeleton: document.getElementById('tbodySkeleton'),
      rowCount: document.getElementById('rowCount'),
      activeFiltersChips: document.getElementById('activeFiltersChips'),
      firstPage: document.getElementById('firstPage'),
      prevPage: document.getElementById('prevPage'),
      nextPage: document.getElementById('nextPage'),
      lastPage: document.getElementById('lastPage'),
      pageInfo: document.getElementById('pageInfo'),
      pageSize: document.getElementById('pageSize'),
      issueModal: document.getElementById('issueModal'),
      modalBody: document.getElementById('modalBody'),
      modalTitle: document.getElementById('modalTitle'),
      modalClose: document.getElementById('modalClose'),
      copyId: document.getElementById('copyId'),
      copyLink: document.getElementById('copyLink'),
      calendar: document.getElementById('calendar'),
      calendarTz: document.getElementById('calendarTz'),
      eventFilterDeployment: document.getElementById('eventFilterDeployment'),
      eventFilterMaintenance: document.getElementById('eventFilterMaintenance'),
      eventFilterRelease: document.getElementById('eventFilterRelease'),
      eventFilterOther: document.getElementById('eventFilterOther'),
      addEventBtn: document.getElementById('addEventBtn'),
      eventModal: document.getElementById('eventModal'),
      eventModalTitle: document.getElementById('eventModalTitle'),
      eventModalClose: document.getElementById('eventModalClose'),
      eventForm: document.getElementById('eventForm'),
      eventTitle: document.getElementById('eventTitle'),
      eventType: document.getElementById('eventType'),
      eventEnv: document.getElementById('eventEnv'),
      eventStatus: document.getElementById('eventStatus'),
      eventOwner: document.getElementById('eventOwner'),
      eventModules: document.getElementById('eventModules'),
      eventImpactType: document.getElementById('eventImpactType'),
      eventIssueId: document.getElementById('eventIssueId'),
      eventStart: document.getElementById('eventStart'),
      eventAllDay: document.getElementById('eventAllDay'),
      eventEnd: document.getElementById('eventEnd'),
      eventDescription: document.getElementById('eventDescription'),
      eventIssueLinkedInfo: document.getElementById('eventIssueLinkedInfo'),
      eventSave: document.getElementById('eventSave'),
      eventCancel: document.getElementById('eventCancel'),
      eventDelete: document.getElementById('eventDelete'),
      spinner: document.getElementById('spinner'),
      toast: document.getElementById('toast'),
      issuesTab: document.getElementById('issuesTab'),
      calendarTab: document.getElementById('calendarTab'),
      insightsTab: document.getElementById('insightsTab'),
      plannerEnv: document.getElementById('plannerEnv'),
      plannerRegion: document.getElementById('plannerRegion'),
      plannerReleaseType: document.getElementById('plannerReleaseType'),
      plannerModules: document.getElementById('plannerModules'),
      plannerDescription: document.getElementById('plannerDescription'),
      plannerHorizon: document.getElementById('plannerHorizon'),
      plannerSlotsPerDay: document.getElementById('plannerSlotsPerDay'),
      plannerRun: document.getElementById('plannerRun'),
      plannerAddEvent: document.getElementById('plannerAddEvent'),
      plannerResults: document.getElementById('plannerResults'),
      plannerReleasePlan: document.getElementById('plannerReleasePlan'),
      plannerTickets: document.getElementById('plannerTickets'),
      plannerAssignBtn: document.getElementById('plannerAssignBtn'),
      aiAnalyzing: document.getElementById('aiAnalyzing'),
      aiPatternsList: document.getElementById('aiPatternsList'),
      aiLabelsList: document.getElementById('aiLabelsList'),
      aiScopeText: document.getElementById('aiScopeText'),
      aiSignalsText: document.getElementById('aiSignalsText'),
      aiTrendsList: document.getElementById('aiTrendsList'),
      aiIncidentsList: document.getElementById('aiIncidentsList'),
      aiEmergingStable: document.getElementById('aiEmergingStable'),
      aiOpsCockpit: document.getElementById('aiOpsCockpit'),
      aiModulesTableBody: document.getElementById('aiModulesTableBody'),
      aiRisksList: document.getElementById('aiRisksList'),
      aiClusters: document.getElementById('aiClusters'),
      aiTriageList: document.getElementById('aiTriageList'),
      aiEventsList: document.getElementById('aiEventsList'),
      aiQueryInput: document.getElementById('aiQueryInput'),
      aiQueryRun: document.getElementById('aiQueryRun'),
      aiQueryApplyFilters: document.getElementById('aiQueryApplyFilters'),
      aiQueryExport: document.getElementById('aiQueryExport'),
      aiQueryResults: document.getElementById('aiQueryResults')
    };
  }

  function wireEvents() {
    // Drawer
    if (els.drawerBtn && els.sidebar) {
      els.drawerBtn.addEventListener('click', () => {
        const open = !els.sidebar.classList.contains('open');
        els.sidebar.classList.toggle('open', open);
        els.drawerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    // Search
    if (els.searchInput) {
      els.searchInput.value = state.filters.search || '';
      els.searchInput.addEventListener('input', () => {
        state.filters.search = els.searchInput.value;
        saveFiltersToStorage();
        applyFiltersAndSort(true);
        updateIssuesSummary();
        updateKpis();
        updateCharts();
        renderTable();
        updateActiveFilterChips();
        updatePlannerTicketsDropdown();
        runAiInsights();
      });
    }

    // Filters
    if (els.moduleFilter) {
      els.moduleFilter.addEventListener('change', () => {
        state.filters.module = els.moduleFilter.value || null;
        saveFiltersToStorage();
        applyFiltersAndSort(true);
        updateIssuesSummary();
        updateKpis();
        updateCharts();
        renderTable();
        updateActiveFilterChips();
        updatePlannerTicketsDropdown();
        runAiInsights();
      });
    }
    if (els.priorityFilter) {
      els.priorityFilter.addEventListener('change', () => {
        state.filters.priority = els.priorityFilter.value || null;
        saveFiltersToStorage();
        applyFiltersAndSort(true);
        updateIssuesSummary();
        updateKpis();
        updateCharts();
        renderTable();
        updateActiveFilterChips();
        updatePlannerTicketsDropdown();
        runAiInsights();
      });
    }
    if (els.statusFilter) {
      els.statusFilter.addEventListener('change', () => {
        state.filters.status = els.statusFilter.value || null;
        saveFiltersToStorage();
        applyFiltersAndSort(true);
        updateIssuesSummary();
        updateKpis();
        updateCharts();
        renderTable();
        updateActiveFilterChips();
        updatePlannerTicketsDropdown();
        runAiInsights();
      });
    }
    if (els.startDateFilter) {
      els.startDateFilter.value = state.filters.startDate || '';
      els.startDateFilter.addEventListener('change', () => {
        state.filters.startDate = els.startDateFilter.value || null;
        saveFiltersToStorage();
        applyFiltersAndSort(true);
        updateIssuesSummary();
        updateKpis();
        updateCharts();
        renderTable();
        updateActiveFilterChips();
        updatePlannerTicketsDropdown();
        runAiInsights();
      });
    }
    if (els.endDateFilter) {
      els.endDateFilter.value = state.filters.endDate || '';
      els.endDateFilter.addEventListener('change', () => {
        state.filters.endDate = els.endDateFilter.value || null;
        saveFiltersToStorage();
        applyFiltersAndSort(true);
        updateIssuesSummary();
        updateKpis();
        updateCharts();
        renderTable();
        updateActiveFilterChips();
        updatePlannerTicketsDropdown();
        runAiInsights();
      });
    }

    if (els.resetBtn) {
      els.resetBtn.addEventListener('click', () => {
        resetFilters();
      });
    }

    // Theme & accent
    if (els.themeSelect) {
      els.themeSelect.addEventListener('change', () => {
        state.ui.theme = els.themeSelect.value;
        try {
          localStorage.setItem(LS_KEYS.THEME, state.ui.theme);
        } catch {}
        applyTheme();
      });
    }
    if (els.accentColor) {
      if (state.ui.accent) {
        els.accentColor.value = state.ui.accent;
      }
      els.accentColor.addEventListener('input', () => {
        const val = els.accentColor.value;
        state.ui.accent = val;
        try {
          localStorage.setItem(LS_KEYS.ACCENT, val);
        } catch {}
        applyAccent();
      });
    }

    // Refresh / export / create ticket / shortcuts
    if (els.refreshNow) {
      els.refreshNow.addEventListener('click', () => loadIssues(false));
    }
    if (els.exportCsv) {
      els.exportCsv.addEventListener('click', exportFilteredCsv);
    }
    if (els.createTicketBtn) {
      els.createTicketBtn.addEventListener('click', () => {
        if (CONFIG.NEW_TICKET_URL) {
          window.open(CONFIG.NEW_TICKET_URL, '_blank', 'noopener');
        } else {
          showToast('Configure NEW_TICKET_URL to open your ticket tool.');
        }
      });
    }
    if (els.shortcutsHelp) {
      els.shortcutsHelp.addEventListener('click', () => {
        alert(
          [
            'Keyboard shortcuts:',
            '· 1 / 2 / 3 – switch tabs (Issues / Calendar / AI)',
            '· / – focus search',
            '· Ctrl + K (Cmd + K on Mac) – focus AI query',
            '· Esc – close modals'
          ].join('\n')
        );
      });
    }

    // Issue modal
    if (els.modalClose) {
      els.modalClose.addEventListener('click', closeIssueModal);
    }
    if (els.issueModal) {
      els.issueModal.addEventListener('click', (e) => {
        if (e.target === els.issueModal) closeIssueModal();
      });
    }
    if (els.copyId) {
      els.copyId.addEventListener('click', copyIssueId);
    }
    if (els.copyLink) {
      els.copyLink.addEventListener('click', copyIssueLink);
    }

    // Pagination
    if (els.firstPage) {
      els.firstPage.addEventListener('click', () => {
        state.pagination.page = 1;
        renderTable();
      });
    }
    if (els.prevPage) {
      els.prevPage.addEventListener('click', () => {
        if (state.pagination.page > 1) {
          state.pagination.page -= 1;
          renderTable();
        }
      });
    }
    if (els.nextPage) {
      els.nextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(
          (state.issues.length || 0) / state.pagination.pageSize
        );
        if (state.pagination.page < totalPages) {
          state.pagination.page += 1;
          renderTable();
        }
      });
    }
    if (els.lastPage) {
      els.lastPage.addEventListener('click', () => {
        const totalPages = Math.ceil(
          (state.issues.length || 0) / state.pagination.pageSize
        );
        state.pagination.page = totalPages || 1;
        renderTable();
      });
    }
    if (els.pageSize) {
      els.pageSize.value = String(state.pagination.pageSize);
      els.pageSize.addEventListener('change', () => {
        state.pagination.pageSize = Number(els.pageSize.value || 20);
        state.pagination.page = 1;
        savePageToStorage();
        renderTable();
      });
    }

    // Sorting (table head)
    const ths = document.querySelectorAll('#issuesTable thead th.sortable');
    ths.forEach((th) => {
      const key = th.dataset.key;
      th.addEventListener('click', () => {
        if (!key) return;
        if (state.sort.key === key) {
          state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort.key = key;
          state.sort.direction = key === 'date' ? 'desc' : 'asc';
        }
        saveSortToStorage();
        ths.forEach((other) => {
          other.classList.remove('sorted-asc', 'sorted-desc');
        });
        th.classList.add(
          state.sort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc'
        );
        applyFiltersAndSort(false);
        renderTable();
      });

      // initial sort classes
      if (state.sort.key === key) {
        th.classList.add(
          state.sort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc'
        );
      }
    });

    // Tabs
    if (els.issuesTab) {
      els.issuesTab.addEventListener('click', () => setActiveTab('issues'));
    }
    if (els.calendarTab) {
      els.calendarTab.addEventListener('click', () => setActiveTab('calendar'));
    }
    if (els.insightsTab) {
      els.insightsTab.addEventListener('click', () => setActiveTab('insights'));
    }

    // Calendar filters
    [els.eventFilterDeployment, els.eventFilterMaintenance, els.eventFilterRelease, els.eventFilterOther].forEach(
      (cb) => {
        if (!cb) return;
        cb.addEventListener('change', () => {
          if (state.calendar) state.calendar.refetchEvents();
          runAiInsights();
        });
      }
    );

    // Add event button
    if (els.addEventBtn) {
      els.addEventBtn.addEventListener('click', () => {
        const base = {
          id: idFromTitle('New Event'),
          title: '',
          type: 'Deployment',
          env: 'Prod',
          status: 'Planned',
          owner: '',
          modules: [],
          impactType: 'No downtime expected',
          issueId: '',
          start: new Date().toISOString(),
          end: '',
          allDay: false,
          notes: ''
        };
        openEventModal(base, true);
      });
    }

    // Event modal actions
    if (els.eventModalClose) {
      els.eventModalClose.addEventListener('click', closeEventModal);
    }
    if (els.eventCancel) {
      els.eventCancel.addEventListener('click', closeEventModal);
    }
    if (els.eventModal) {
      els.eventModal.addEventListener('click', (e) => {
        if (e.target === els.eventModal) closeEventModal();
      });
    }
    if (els.eventForm) {
      els.eventForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveEventFromForm();
      });
    }
    if (els.eventDelete) {
      els.eventDelete.addEventListener('click', () => {
        if (confirm('Delete this event?')) deleteCurrentEvent();
      });
    }

    // Release planner
    if (els.plannerRun) {
      els.plannerRun.addEventListener('click', plannerSuggestWindows);
    }
    if (els.plannerAddEvent) {
      els.plannerAddEvent.addEventListener('click', plannerAddTopSuggestionAsEvent);
    }
    if (els.plannerAssignBtn) {
      els.plannerAssignBtn.addEventListener('click', assignTicketsToReleasePlan);
    }

    // AI query
    if (els.aiQueryRun) {
      els.aiQueryRun.addEventListener('click', runAiQuery);
    }
    if (els.aiQueryApplyFilters) {
      els.aiQueryApplyFilters.addEventListener('click', applyAiQueryToIssues);
    }
    if (els.aiQueryExport) {
      els.aiQueryExport.addEventListener('click', exportAiQueryCsv);
    }
    if (els.aiQueryInput) {
      els.aiQueryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          runAiQuery();
        }
      });
    }

    // Online status
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Global shortcuts: /, ctrl+k, numbers
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        els.searchInput?.focus();
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        els.aiQueryInput?.focus();
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === '1') setActiveTab('issues');
        if (e.key === '2') setActiveTab('calendar');
        if (e.key === '3') setActiveTab('insights');
      }

      if (e.key === 'Escape') {
        if (els.issueModal && els.issueModal.style.display === 'flex') closeIssueModal();
        if (els.eventModal && els.eventModal.style.display === 'flex') closeEventModal();
      }
    });
  }

  // ---------------------------------------
  // Init
  // ---------------------------------------
  function init() {
    setupDomRefs();
    loadUiFromStorage();
    applyTheme();
    applyAccent();
    setActiveTab(state.ui.activeTab || 'issues');
    updateOnlineStatus();

    initEvents();
    updatePlannerReleasePlans();
    updatePlannerTicketsDropdown();
    initCalendar();
    wireEvents();

    loadIssues(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
