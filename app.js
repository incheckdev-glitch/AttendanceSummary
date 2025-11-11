// app.js – InCheck internal Issues / Ops / AI Copilot
// CHUNK 1: config, state, utilities, enrichment, CSV loading

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------

  // IMPORTANT:
  // - If you already have ISSUES_CSV_URL defined elsewhere (your real Sheet link),
  //   KEEP YOUR VERSION and remove this placeholder.
  // - This is only a fallback example.
  //
  // Example for Google Sheets:
  // const ISSUES_CSV_URL = 'https://docs.google.com/spreadsheets/d/.../export?format=csv';
  const ISSUES_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTRwAjNAQxiPP8uR15t_vx03JkjgEBjgUwp2bpx8rsHx-JJxVDBZyf5ap77rAKrYHfgkVMwLJVm6pGn/pub?output=csv"; // <-- replace with your real CSV export URL if needed

  const LOCAL_STORAGE_ISSUES_KEY = 'incheck.issues.v1';
  const LOCAL_STORAGE_ISSUES_SYNC_KEY = 'incheck.issues.lastSync.v1';
  const LOCAL_STORAGE_EVENTS_KEY = 'incheck.events.v1';
  const LOCAL_STORAGE_EVENTS_SYNC_KEY = 'incheck.events.lastSync.v1';

  // Internal modules ( ops, no POS, internal-only)
  const KNOWN_MODULES = [
    'Checklist',
    'Reference Material',
    'Journal',
    'Reporting',
    'Mobile App',
    'Employee',
    'Roles',
    'Locations',
    'Unspecified'
  ];

  // ---------------------------------------------------------------------------
  // GLOBAL STATE
  // ---------------------------------------------------------------------------

  const state = {
    issues: [],            // enriched issues
    filteredIssues: [],    // after filters + search
    events: [],            // calendar events (local-only, internal)
    currentPage: 1,
    pageSize: 20,
    currentSort: { key: 'date', direction: 'desc' },

    charts: {
      byModule: null,
      byPriority: null,
      byStatus: null,
      byType: null
    },

    ai: {
      moduleStats: [],
      patterns: [],
      labels: [],
      signals: [],
      trends: [],
      incidents: [],
      emergingStable: [],
      opsCockpit: [],
      risks: [],
      clusters: [],
      triage: [],
      eventRisks: [],
      lastScopeText: ''
    }
  };

  // small cache of DOM elements – filled in later chunks
  const els = {};

  // ---------------------------------------------------------------------------
  // UTILITIES
  // ---------------------------------------------------------------------------

  const getEl = (id) => {
    if (els[id]) return els[id];
    const el = document.getElementById(id);
    if (el) els[id] = el;
    return el;
  };

  const now = () => new Date();

  const parseIssueDate = (raw) => {
    if (!raw) return null;
    const str = String(raw).trim();
    if (!str) return null;

    // Try native first
    let d = new Date(str);
    if (!Number.isNaN(d.getTime())) return d;

    // Try dd-mm-yy / dd-mm-yyyy etc.
    const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(.*)$/);
    if (m) {
      let [, dd, mm, yy, rest] = m;
      let day = parseInt(dd, 10);
      let month = parseInt(mm, 10);
      let year = parseInt(yy, 10);
      if (year < 100) year += 2000;
      const iso =
        `${year.toString().padStart(4, '0')}-` +
        `${month.toString().padStart(2, '0')}-` +
        `${day.toString().padStart(2, '0')}` +
        rest;
      d = new Date(iso);
      if (!Number.isNaN(d.getTime())) return d;
    }

    return null;
  };

  const formatDateTime = (date) => {
    if (!date || Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  };

  const daysBetween = (d1, d2) => {
    if (!d1 || !d2) return null;
    const ms = d2.getTime() - d1.getTime();
    return ms / (1000 * 60 * 60 * 24);
  };

  const showToast = (msg, timeout = 3200) => {
    const toast = getEl('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.style.display = 'none';
    }, timeout);
  };

  const downloadCsv = (rows, filename = 'incheck_export.csv') => {
    if (!rows || !rows.length) {
      showToast('Nothing to export.');
      return;
    }
    const headers = Object.keys(rows[0]);
    const escape = (value) => {
      if (value == null) return '';
      const s = String(value);
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // TEXT PROCESSING / KEYWORDS
  // ---------------------------------------------------------------------------

  const STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'from', 'this', 'then', 'into',
    'when', 'after', 'before', 'into', 'while', 'also', 'than', 'only',
    'but', 'are', 'was', 'were', 'will', 'would', 'can', 'could', 'should',
    'not', 'have', 'has', 'had', 'any', 'all', 'each', 'every', 'such',
    'list', 'checklist', 'report', 'reports', 'reporting',
    'mobile', 'app', 'apps', 'web', 'page', 'pages',
    'data', 'info', 'information',
    'issue', 'bug', 'error', 'errors', 'enhancement',
    'live', 'staging', 'prod', 'production',
    'must', 'need', 'needed', 'needs', 'required',
    'user', 'users'
  ]);

  const extractKeywordsFromText = (text, max = 10) => {
    if (!text) return [];
    const tokens = String(text)
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter(Boolean);

    const counts = new Map();
    for (const t of tokens) {
      if (t.length < 3) continue;
      if (/^\d+$/.test(t)) continue;
      if (STOPWORDS.has(t)) continue;
      const current = counts.get(t) || 0;
      counts.set(t, current + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([token]) => token);
  };

  // ---------------------------------------------------------------------------
  // NORMALISATION HELPERS
  // ---------------------------------------------------------------------------

  const normalizeModule = (raw) => {
    if (!raw) return 'Unspecified';
    const s = String(raw).trim();
    if (!s) return 'Unspecified';

    const lower = s.toLowerCase();

    if (lower.includes('checklist')) return 'Checklist';
    if (lower.includes('journal') || lower.includes('logbook')) return 'Journal';
    if (lower.includes('report')) return 'Reporting';
    if (lower.includes('mobile') || lower.includes('app')) return 'Mobile App';
    if (lower.includes('employee')) return 'Employee';
    if (lower.includes('role')) return 'Roles';
    if (lower.includes('location')) return 'Locations';
    if (lower.includes('reference')) return 'Reference Material';

    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const normalizePriority = (raw) => {
    if (!raw) return 'medium';
    const s = String(raw).trim().toLowerCase();
    if (!s) return 'medium';
    if (s.startsWith('urg')) return 'urgent';
    if (s.startsWith('hi')) return 'high';
    if (s.startsWith('med')) return 'medium';
    if (s.startsWith('low')) return 'low';
    return 'medium';
  };

  const normalizeStatus = (raw) => {
    if (!raw) return 'Unspecified';
    const s = String(raw).trim();
    if (!s) return 'Unspecified';
    const lower = s.toLowerCase();

    if (lower.includes('resolved')) return 'Resolved';
    if (lower.includes('rejected')) return 'Rejected';
    if (lower.includes('on stage')) return 'On Stage';
    if (lower.includes('under development')) return 'Under Development';
    if (lower.includes('on hold')) return 'On Hold';
    if (lower.includes('tested on staging')) return 'Tested on Staging';
    if (lower.includes('not started')) return 'Not Started Yet';

    return s;
  };

  const normalizeType = (raw) => {
    if (!raw) return 'Bug';
    const s = String(raw).trim().toLowerCase();
    if (!s) return 'Bug';
    if (s.includes('bug')) return 'Bug';
    if (s.includes('enhancement')) return 'Enhancement';
    if (s.includes('new futur') || s.includes('new feature')) return 'New Feature';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // ---------------------------------------------------------------------------
  // RISK SCORING (internal, heuristic)
  // ---------------------------------------------------------------------------

  const computeKeywordBonus = (text) => {
    if (!text) return 0;
    const lower = text.toLowerCase();
    const bonusWords = [
      'not working',
      'cannot',
      "can't",
      'fails',
      'error',
      'crash',
      'crashes',
      'white page',
      'not saving',
      'deleted',
      'data loss',
      'historical data',
      'not appear',
      'not appearing',
      'duplicat',
      'triplicate',
      'infinite',
      'loop',
      'unexpected token',
      'faild fetch',
      'gray',
      'forbidden',
      'not allowed',
      'wrong',
      'incorrect',
      'not accurate',
      'timezone',
      'geofacing',
      'geofencing'
    ];

    let bonus = 0;
    for (const word of bonusWords) {
      if (lower.includes(word)) {
        bonus += 1;
      }
    }
    return bonus;
  };

  const computeRiskScore = (issue) => {
    // Baseline from priority
    let base = 4;
    switch (issue.priorityNorm) {
      case 'urgent':
        base = 9;
        break;
      case 'high':
        base = 7;
        break;
      case 'medium':
        base = 5;
        break;
      case 'low':
        base = 2;
        break;
      default:
        base = 4;
    }

    // Type
    if (issue.typeNorm === 'Bug') base += 2;
    if (issue.typeNorm === 'Enhancement') base -= 1;

    // Module weight
    switch (issue.moduleNorm) {
      case 'Reporting':
      case 'Checklist':
        base += 1.5;
        break;
      case 'Mobile App':
        base += 1;
        break;
      case 'Employee':
      case 'Roles':
      case 'Locations':
        base += 0.5;
        break;
      default:
        break;
    }

    // Age (only if not closed)
    if (!issue.isClosed && issue.ageDays != null) {
      if (issue.ageDays > 60) base += 1.5;
      else if (issue.ageDays > 30) base += 1;
      else if (issue.ageDays > 14) base += 0.5;
    }

    // Status
    const status = issue.statusNorm;
    if (/on hold/i.test(status)) base += 0.5;
    if (/under development/i.test(status)) base += 0.5;
    if (/on stage/i.test(status) || /tested on staging/i.test(status)) base += 0.5;

    // Text signals
    const text = `${issue.title || ''} ${issue.description || ''}`.trim();
    base += computeKeywordBonus(text);

    // Clamp
    const clamped = Math.max(1, Math.min(10, base));
    return Math.round(clamped * 10) / 10;
  };

  const inferCategory = (issue) => {
    const text = `${issue.title || ''} ${issue.description || ''}`.toLowerCase();

    if (text.includes('timezone')) return 'Timezone / locale';
    if (text.includes('arabic') || text.includes('????')) return 'i18n / encoding';
    if (text.includes('export') || text.includes('excel') || text.includes('pdf')) {
      return 'Exports & reporting output';
    }
    if (text.includes('schedule') || text.includes('on demand') || text.includes('display time')) {
      return 'Scheduling & instances';
    }
    if (text.includes('notification') || text.includes('push') || text.includes('email')) {
      return 'Notifications';
    }
    if (text.includes('roles') || text.includes('role based') || text.includes('access')) {
      return 'Access control / roles';
    }
    if (text.includes('employee')) return 'Employee management';
    if (text.includes('journal') || text.includes('logbook')) return 'Journal / logbook';
    if (text.includes('geofac') || text.includes('geofenc')) return 'Geofencing';
    if (text.includes('camera') || text.includes('photo') || text.includes('video')) {
      return 'Media / attachments';
    }

    return 'General';
  };

  // ---------------------------------------------------------------------------
  // ENRICH RAW CSV ROWS INTO INTERNAL ISSUE OBJECTS
  // ---------------------------------------------------------------------------

  const enrichIssues = (rawRows) => {
    const today = now();

    return rawRows
      .filter((row) => {
        const id = row.ID || row.Id || row.id || '';
        return String(id).trim() !== '';
      })
      .map((row, index) => {
        const id =
          row.ID ||
          row.Id ||
          row.id ||
          `ROW#${index + 1}`;

        const moduleRaw = row.Module || row.module || '';
        const title = row.Title || row.title || '';
        const description = row.Description || row.description || '';
        const priorityRaw = row.Priority || row.priority || '';
        const statusRaw = row.Status || row.status || '';
        const typeRaw = row.Type || row.type || '';
        const dateRaw = row.Date || row.date || '';
        const log = row.Log || row.log || '';
        const link = row.Link || row.link || '';

        const moduleNorm = normalizeModule(moduleRaw);
        const priorityNorm = normalizePriority(priorityRaw);
        const statusNorm = normalizeStatus(statusRaw);
        const typeNorm = normalizeType(typeRaw);

        const dateObj = parseIssueDate(dateRaw);
        const ageDays = dateObj ? Math.floor(daysBetween(dateObj, today) ?? 0) : null;

        const isClosed =
          /resolved/i.test(statusNorm) ||
          /rejected/i.test(statusNorm) ||
          /completed/i.test(statusNorm);

        const keywords = extractKeywordsFromText(
          `${title} ${description}`.trim(),
          8
        );

        const category = inferCategory({
          title,
          description
        });

        const riskScore = computeRiskScore({
          title,
          description,
          moduleNorm,
          priorityNorm,
          typeNorm,
          statusNorm,
          ageDays,
          isClosed
        });

        let severity = 2;
        if (riskScore >= 9) severity = 3;
        else if (riskScore <= 4) severity = 1;

        let impact = severity;
        if (['Reporting', 'Checklist', 'Mobile App'].includes(moduleNorm)) {
          impact = Math.min(3, impact + 1);
        }

        let urgency = 2;
        if (priorityNorm === 'urgent') urgency = 3;
        else if (priorityNorm === 'low') urgency = 1;

        return {
          raw: row,

          id: String(id).trim(),
          module: moduleRaw || 'Unspecified',
          moduleNorm,
          title,
          description,
          priority: priorityRaw || '',
          priorityNorm,
          status: statusRaw || '',
          statusNorm,
          type: typeRaw || '',
          typeNorm,
          dateRaw,
          date: dateObj,
          ageDays,
          log,
          link: link || '',

          keywords,
          category,
          riskScore,
          severity,
          impact,
          urgency,
          isClosed
        };
      });
  };

  // ---------------------------------------------------------------------------
  // SYNC METADATA HELPERS (issues/events chips in header)
  // ---------------------------------------------------------------------------

  const setSyncStatusLabel = (type, timestampMs) => {
    const chipId = type === 'issues' ? 'syncIssuesText' : 'syncEventsText';
    const dotId = type === 'issues' ? 'syncIssuesDot' : 'syncEventsDot';

    const chip = getEl(chipId);
    const dot = getEl(dotId);

    if (!chip || !dot) return;

    if (!timestampMs) {
      chip.textContent = `${type === 'issues' ? 'Issues' : 'Events'}: never`;
      dot.classList.remove('ok', 'warn');
      dot.classList.add('err');
      return;
    }

    const ts = new Date(timestampMs);
    const diffMin = Math.round(
      (now().getTime() - ts.getTime()) / (1000 * 60)
    );

    let label = 'just now';
    if (diffMin >= 60 * 24) {
      const days = Math.round(diffMin / (60 * 24));
      label = `${days}d ago`;
    } else if (diffMin >= 60) {
      const hours = Math.round(diffMin / 60);
      label = `${hours}h ago`;
    } else if (diffMin > 1) {
      label = `${diffMin}m ago`;
    }

    chip.textContent = `${type === 'issues' ? 'Issues' : 'Events'}: ${label}`;
    dot.classList.remove('err');
    dot.classList.add('ok');
  };

  const updateSyncBadgesFromStorage = () => {
    try {
      const issuesTs = window.localStorage.getItem(LOCAL_STORAGE_ISSUES_SYNC_KEY);
      const eventsTs = window.localStorage.getItem(LOCAL_STORAGE_EVENTS_SYNC_KEY);
      setSyncStatusLabel('issues', issuesTs ? Number(issuesTs) : null);
      setSyncStatusLabel('events', eventsTs ? Number(eventsTs) : null);
    } catch (e) {
      setSyncStatusLabel('issues', null);
      setSyncStatusLabel('events', null);
    }
  };

  // ---------------------------------------------------------------------------
  // CSV LOADING (issues)
  // ---------------------------------------------------------------------------

  const loadIssuesFromCsv = () => {
    const loading = getEl('loadingStatus');
    if (loading) {
      loading.textContent = 'Loading issues from CSV…';
    }

    if (!window.Papa) {
      console.error('PapaParse is not available. Check script include.');
      showToast('PapaParse library missing – cannot load issues.');
      return;
    }

    if (!ISSUES_CSV_URL) {
      console.warn('ISSUES_CSV_URL is empty – please configure it in app.js');
      showToast('Configure ISSUES_CSV_URL in app.js to load issues.');
      return;
    }

    window.Papa.parse(ISSUES_CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data || [];
          const enriched = enrichIssues(rows);

          state.issues = enriched;
          state.filteredIssues = enriched.slice();
          state.currentPage = 1;

          try {
            window.localStorage.setItem(
              LOCAL_STORAGE_ISSUES_KEY,
              JSON.stringify(rows)
            );
            window.localStorage.setItem(
              LOCAL_STORAGE_ISSUES_SYNC_KEY,
              String(now().getTime())
            );
          } catch (e) {
            // ignore storage errors
          }

          setSyncStatusLabel('issues', now().getTime());

          if (loading) {
            loading.textContent = `Loaded ${enriched.length} issues.`;
          }

          // These will be defined in later chunks
          if (typeof applyFiltersAndRender === 'function') {
            applyFiltersAndRender();
          }
          if (typeof runAiInsights === 'function') {
            runAiInsights();
          }
        } catch (err) {
          console.error('Error enriching issues:', err);
          showToast('Error while processing issues CSV.');
        }
      },
      error: (err) => {
        console.error('Error loading CSV:', err);
        showToast('Failed to load issues CSV.');

        try {
          const cached = window.localStorage.getItem(LOCAL_STORAGE_ISSUES_KEY);
          if (cached) {
            const rows = JSON.parse(cached);
            const enriched = enrichIssues(rows);
            state.issues = enriched;
            state.filteredIssues = enriched.slice();
            state.currentPage = 1;
            if (typeof applyFiltersAndRender === 'function') {
              applyFiltersAndRender();
            }
            if (typeof runAiInsights === 'function') {
              runAiInsights();
            }
            showToast('Using cached issues (offline mode).');
          }
        } catch (e) {
          console.error('Failed to use cached issues:', e);
        }
      }
    });
  };

  // NOTE: DO NOT close the IIFE here; it will be closed in the final chunk.
  // document.addEventListener('DOMContentLoaded', () => {
  //   updateSyncBadgesFromStorage();
  //   loadIssuesFromCsv();
  //   ...
  // });

  // })();  <-- this comes in the last chunk
  // ---------------------------------------------------------------------------
  // FILTERS, KPIs, CHARTS, TABLE
  // ---------------------------------------------------------------------------

  const filterState = {
    module: 'All',
    priority: 'All',
    status: 'All',
    startDate: null,
    endDate: null,
    search: ''
  };

  const isIssueOpen = (issue) => !issue.isClosed;

  const buildUniqueOptions = (items, key) => {
    const set = new Set();
    for (const it of items) {
      const val = it[key];
      if (val && String(val).trim()) set.add(String(val).trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  };

  const initFiltersFromIssues = () => {
    const moduleSelect = getEl('moduleFilter');
    const prioritySelect = getEl('priorityFilter');
    const statusSelect = getEl('statusFilter');

    if (moduleSelect && prioritySelect && statusSelect) {
      // Module
      const modules = buildUniqueOptions(state.issues, 'moduleNorm');
      moduleSelect.innerHTML =
        '<option value="All">All modules</option>' +
        modules
          .map((m) => `<option value="${m}">${m}</option>`)
          .join('');

      // Priority – use normalized labels
      const priorities = ['Urgent', 'High', 'Medium', 'Low'];
      prioritySelect.innerHTML =
        '<option value="All">All priorities</option>' +
        priorities
          .map((p) => `<option value="${p.toLowerCase()}">${p}</option>`)
          .join('');

      // Status
      const statuses = buildUniqueOptions(state.issues, 'statusNorm');
      statusSelect.innerHTML =
        '<option value="All">All status</option>' +
        statuses
          .map((s) => `<option value="${s}">${s}</option>`)
          .join('');
    }
  };

  const resetFilters = () => {
    filterState.module = 'All';
    filterState.priority = 'All';
    filterState.status = 'All';
    filterState.startDate = null;
    filterState.endDate = null;
    filterState.search = '';

    const moduleSelect = getEl('moduleFilter');
    const prioritySelect = getEl('priorityFilter');
    const statusSelect = getEl('statusFilter');
    const startDateInput = getEl('startDateFilter');
    const endDateInput = getEl('endDateFilter');
    const searchInput = getEl('searchInput');

    if (moduleSelect) moduleSelect.value = 'All';
    if (prioritySelect) prioritySelect.value = 'All';
    if (statusSelect) statusSelect.value = 'All';
    if (startDateInput) startDateInput.value = '';
    if (endDateInput) endDateInput.value = '';
    if (searchInput) searchInput.value = '';

    state.currentPage = 1;
    applyFiltersAndRender();
  };

  const parseDateInputValue = (val, endOfDay = false) => {
    if (!val) return null;
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return null;
    if (endOfDay) {
      d.setHours(23, 59, 59, 999);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d;
  };

  const renderActiveFilterChips = () => {
    const container = getEl('activeFiltersChips');
    if (!container) return;

    const chips = [];

    if (filterState.search) {
      chips.push({
        key: 'search',
        label: `Search: "${filterState.search}"`
      });
    }
    if (filterState.module !== 'All') {
      chips.push({
        key: 'module',
        label: `Module: ${filterState.module}`
      });
    }
    if (filterState.priority !== 'All') {
      chips.push({
        key: 'priority',
        label: `Priority: ${filterState.priority}`
      });
    }
    if (filterState.status !== 'All') {
      chips.push({
        key: 'status',
        label: `Status: ${filterState.status}`
      });
    }
    if (filterState.startDate || filterState.endDate) {
      let text = 'Date: ';
      if (filterState.startDate) text += `from ${filterState.startDate} `;
      if (filterState.endDate) text += `to ${filterState.endDate}`;
      chips.push({ key: 'date', label: text.trim() });
    }

    if (!chips.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = chips
      .map(
        (c) =>
          `<button class="filter-chip" data-filter-key="${c.key}">
            ${c.label} <span aria-hidden="true">✕</span>
          </button>`
      )
      .join('');
  };

  const badgeStatus = (issue) => {
    const label = issue.statusNorm || 'Unspecified';
    const slug = label.replace(/\s+/g, '-');
    return `<span class="pill status-${slug}">${label}</span>`;
  };

  const badgePriority = (issue) => {
    const norm = issue.priorityNorm || 'medium';
    if (!norm) return '';
    let label = norm.charAt(0).toUpperCase() + norm.slice(1);
    let cssKey = label;

    if (norm === 'urgent') {
      cssKey = 'High';
      label = 'Urgent';
    } else if (norm === 'high') {
      cssKey = 'High';
    } else if (norm === 'medium') {
      cssKey = 'Medium';
    } else if (norm === 'low') {
      cssKey = 'Low';
    }

    return `<span class="pill priority-${cssKey}">${label}</span>`;
  };

  const riskBarHtml = (issue) => {
    const score = issue.riskScore || 0;
    const pct = Math.max(0, Math.min(100, (score / 10) * 100));

    let colorClass = '';
    if (score >= 9) colorClass = 'risk-crit';
    else if (score >= 7) colorClass = 'risk-high';
    else if (score >= 5) colorClass = 'risk-med';
    else colorClass = 'risk-low';

    return `
      <div class="risk-bar-wrap">
        <div class="risk-bar ${colorClass}" style="width:${pct}%;"></div>
      </div>
    `;
  };

  const renderSummaryBar = () => {
    const el = getEl('issuesSummaryText');
    if (!el) return;

    const total = state.issues.length;
    const visible = state.filteredIssues.length;

    const openAll = state.issues.filter(isIssueOpen).length;
    const openVisible = state.filteredIssues.filter(isIssueOpen).length;

    const today = now();
    let minDate = null;
    let maxDate = null;
    for (const issue of state.issues) {
      if (!issue.date) continue;
      if (!minDate || issue.date < minDate) minDate = issue.date;
      if (!maxDate || issue.date > maxDate) maxDate = issue.date;
    }

    let rangeText = '';
    if (minDate && maxDate) {
      const days = Math.max(
        1,
        Math.round(daysBetween(minDate, maxDate) || 0)
      );
      rangeText = ` · ${days}d history`;
    }

    const filtersActive =
      filterState.module !== 'All' ||
      filterState.priority !== 'All' ||
      filterState.status !== 'All' ||
      !!filterState.search ||
      !!filterState.startDate ||
      !!filterState.endDate;

    const filtersText = filtersActive ? ' · filters active' : '';

    el.textContent = `${visible}/${total} issues visible · ${openVisible} open (of ${openAll})${rangeText}${filtersText}`;
  };

  const renderKpis = () => {
    const container = getEl('kpis');
    if (!container) return;

    const total = state.filteredIssues.length;
    const open = state.filteredIssues.filter(isIssueOpen);
    const openCount = open.length;

    const highUrgentOpen = open.filter(
      (i) => i.priorityNorm === 'high' || i.priorityNorm === 'urgent'
    );
    const highUrgentCount = highUrgentOpen.length;

    const checklistMobileOpenBugs = open.filter(
      (i) =>
        i.typeNorm === 'Bug' &&
        (i.moduleNorm === 'Checklist' || i.moduleNorm === 'Mobile App')
    );
    const checklistMobileCount = checklistMobileOpenBugs.length;

    let avgRisk = 0;
    if (open.length) {
      avgRisk =
        open.reduce((sum, i) => sum + (i.riskScore || 0), 0) / open.length;
      avgRisk = Math.round(avgRisk * 10) / 10;
    }

    const kpiHtml = [
      {
        id: 'kpi-total',
        label: 'Total issues',
        value: total,
        sub: 'Click to reset all filters'
      },
      {
        id: 'kpi-open',
        label: 'Open issues',
        value: openCount,
        sub: 'Non-resolved / non-rejected'
      },
      {
        id: 'kpi-high',
        label: 'Open high / urgent',
        value: highUrgentCount,
        sub: 'Priority ≥ High'
      },
      {
        id: 'kpi-risk',
        label: 'Avg risk (open)',
        value: avgRisk || '–',
        sub: '0–10 internal score'
      }
    ]
      .map(
        (k) => `
        <button class="card kpi" data-kpi-id="${k.id}" type="button">
          <div class="label">${k.label}</div>
          <div class="value">${k.value}</div>
          <div class="sub">${k.sub}</div>
        </button>`
      )
      .join('');

    container.innerHTML = kpiHtml;
  };

  const buildChartData = () => {
    const issues = state.filteredIssues;

    const countBy = (key) => {
      const map = new Map();
      for (const i of issues) {
        const v = i[key] || 'Unspecified';
        const cur = map.get(v) || 0;
        map.set(v, cur + 1);
      }
      return map;
    };

    return {
      byModule: countBy('moduleNorm'),
      byPriority: countBy('priorityNorm'),
      byStatus: countBy('statusNorm'),
      byType: countBy('typeNorm')
    };
  };

  const ensureChart = (canvasId, chartKey, label, map) => {
    const canvas = getEl(canvasId);
    if (!canvas || !window.Chart) return;

    if (state.charts[chartKey]) {
      state.charts[chartKey].destroy();
      state.charts[chartKey] = null;
    }

    const labels = Array.from(map.keys());
    const values = Array.from(map.values());

    state.charts[chartKey] = new window.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            label,
            data: values
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 10
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const l = ctx.label || '';
                const v = ctx.parsed || 0;
                return `${l}: ${v}`;
              }
            }
          }
        }
      }
    });
  };

  const updateCharts = () => {
    const data = buildChartData();
    ensureChart('byModule', 'byModule', 'By module', data.byModule);
    ensureChart('byPriority', 'byPriority', 'By priority', data.byPriority);
    ensureChart('byStatus', 'byStatus', 'By status', data.byStatus);
    ensureChart('byType', 'byType', 'By type', data.byType);
  };

  // ---------------------------------------------------------------------------
  // TABLE RENDERING & SORT / PAGING
  // ---------------------------------------------------------------------------

  const sortIssues = (issues) => {
    const { key, direction } = state.currentSort;
    const dir = direction === 'asc' ? 1 : -1;

    return issues.slice().sort((a, b) => {
      let va = a[key];
      let vb = b[key];

      if (key === 'date') {
        const ta = a.date ? a.date.getTime() : 0;
        const tb = b.date ? b.date.getTime() : 0;
        return (ta - tb) * dir;
      }

      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();

      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  };

  const renderRowCount = () => {
    const rowCount = getEl('rowCount');
    if (!rowCount) return;
    const total = state.filteredIssues.length;
    rowCount.textContent = `${total} issue${total === 1 ? '' : 's'} found`;
  };

  const renderPaginationControls = () => {
    const info = getEl('pageInfo');
    const prev = getEl('prevPage');
    const next = getEl('nextPage');
    const first = getEl('firstPage');
    const last = getEl('lastPage');

    const total = state.filteredIssues.length;
    const pageSize = state.pageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(state.currentPage, totalPages);

    state.currentPage = currentPage;

    if (info) {
      const start = (currentPage - 1) * pageSize + 1;
      const end = Math.min(total, currentPage * pageSize);
      info.textContent = `${start}-${end} of ${total}`;
    }

    const disablePrev = currentPage <= 1;
    const disableNext = currentPage >= totalPages;

    if (prev) prev.disabled = disablePrev;
    if (first) first.disabled = disablePrev;
    if (next) next.disabled = disableNext;
    if (last) last.disabled = disableNext;
  };

  const renderTable = () => {
    const skeletonBody = getEl('tbodySkeleton');
    const tbody = getEl('issuesTbody');
    if (!tbody) return;

    if (skeletonBody) skeletonBody.style.display = 'none';
    tbody.style.display = '';

    const sorted = sortIssues(state.filteredIssues);
    const pageSize = state.pageSize;
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(state.currentPage, totalPages);
    state.currentPage = currentPage;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(total, startIndex + pageSize);
    const slice = sorted.slice(startIndex, endIndex);

    const html = slice
      .map((issue) => {
        const dateText = issue.date ? formatDateTime(issue.date) : issue.dateRaw || '';
        const logText = issue.log || '';
        const shortLog =
          logText.length > 120 ? logText.slice(0, 117) + '…' : logText;

        let linksHtml = '';
        if (issue.link) {
          const parts = String(issue.link)
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          linksHtml = parts
            .map(
              (p, idx) =>
                `<a href="${encodeURI(p)}" target="_blank" rel="noopener noreferrer">Link ${idx + 1}</a>`
            )
            .join('<br/>');
        }

        const titleSafe = issue.title || '(no title)';
        const descSafe = issue.description || '';

        const tooltip = descSafe
          ? titleSafe + ' — ' + descSafe.substring(0, 140)
          : titleSafe;

        return `
          <tr data-issue-id="${issue.id}">
            <td>${issue.id}</td>
            <td>${issue.moduleNorm}</td>
            <td>
              <div title="${tooltip.replace(/"/g, '&quot;')}">
                ${titleSafe}
              </div>
              <div class="muted" style="font-size:11px;margin-top:2px;">
                ${issue.category} · risk ${issue.riskScore}
              </div>
              ${riskBarHtml(issue)}
            </td>
            <td>${badgePriority(issue)}</td>
            <td>${badgeStatus(issue)}</td>
            <td>${dateText}</td>
            <td>${shortLog}</td>
            <td>${linksHtml || ''}</td>
          </tr>
        `;
      })
      .join('');

    tbody.innerHTML = html || `
      <tr><td colspan="8" style="text-align:center;color:var(--muted);padding:18px 0;">
        No issues match the current filters.
      </td></tr>
    `;

    renderRowCount();
    renderPaginationControls();
  };

  // ---------------------------------------------------------------------------
  // APPLY FILTERS (MAIN ENTRY POINT)
  // ---------------------------------------------------------------------------

  function applyFiltersAndRender() {
    const issues = state.issues;
    const s = filterState;

    const startDateVal = getEl('startDateFilter')?.value || '';
    const endDateVal = getEl('endDateFilter')?.value || '';

    s.startDate = startDateVal || null;
    s.endDate = endDateVal || null;

    const startDate = parseDateInputValue(s.startDate, false);
    const endDate = parseDateInputValue(s.endDate, true);

    const search = (s.search || '').toLowerCase();

    const filtered = issues.filter((issue) => {
      if (s.module !== 'All' && issue.moduleNorm !== s.module) return false;

      if (s.priority !== 'All') {
        const norm = issue.priorityNorm || 'medium';
        if (s.priority === 'high') {
          if (!(norm === 'high' || norm === 'urgent')) return false;
        } else if (norm !== s.priority) {
          return false;
        }
      }

      if (s.status !== 'All' && issue.statusNorm !== s.status) return false;

      if (startDate && issue.date && issue.date < startDate) return false;
      if (endDate && issue.date && issue.date > endDate) return false;

      if (search) {
        const haystack = [
          issue.id,
          issue.moduleNorm,
          issue.title,
          issue.description,
          issue.log
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    state.filteredIssues = filtered;
    renderActiveFilterChips();
    renderSummaryBar();
    renderKpis();
    updateCharts();
    renderTable();

    if (typeof runAiInsights === 'function') {
      runAiInsights();
    }
  }

  // ---------------------------------------------------------------------------
  // ISSUE MODAL
  // ---------------------------------------------------------------------------

  const findIssueById = (id) =>
    state.issues.find((i) => i.id === id) ||
    state.filteredIssues.find((i) => i.id === id);

  const openIssueModal = (id) => {
    const issue = findIssueById(id);
    if (!issue) return;

    const modal = getEl('issueModal');
    const body = getEl('modalBody');
    const titleEl = getEl('modalTitle');

    if (!modal || !body || !titleEl) return;

    titleEl.textContent = `${issue.id} · ${issue.moduleNorm}`;

    const dateText = issue.date ? formatDateTime(issue.date) : issue.dateRaw || '';
    const linksBlock = (() => {
      if (!issue.link) return '<span class="muted">No attachments / links.</span>';
      const parts = String(issue.link)
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      if (!parts.length) return '<span class="muted">No attachments / links.</span>';
      return parts
        .map(
          (p, idx) =>
            `<a href="${encodeURI(p)}" target="_blank" rel="noopener noreferrer">Link ${idx + 1}</a>`
        )
        .join('<br/>');
    })();

    const keywords = (issue.keywords || []).join(', ') || '—';

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
        <div>
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Title</div>
          <div style="margin-top:2px;font-weight:500;">${issue.title || '(no title)'}</div>
        </div>

        <div>
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Description</div>
          <div style="margin-top:2px;white-space:pre-wrap;">${issue.description || '—'}</div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;">
          <div>
            <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Module</div>
            <div style="margin-top:2px;">${issue.moduleNorm}</div>
          </div>
          <div>
            <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Priority</div>
            <div style="margin-top:2px;">${badgePriority(issue)}</div>
          </div>
          <div>
            <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Status</div>
            <div style="margin-top:2px;">${badgeStatus(issue)}</div>
          </div>
          <div>
            <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Type</div>
            <div style="margin-top:2px;">${issue.typeNorm}</div>
          </div>
          <div>
            <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Date</div>
            <div style="margin-top:2px;">${dateText}</div>
          </div>
          <div>
            <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Risk</div>
            <div style="margin-top:2px;">${issue.riskScore} / 10 · severity ${issue.severity}, impact ${issue.impact}, urgency ${issue.urgency}</div>
            ${riskBarHtml(issue)}
          </div>
        </div>

        <div>
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Category</div>
          <div style="margin-top:2px;">${issue.category}</div>
        </div>

        <div>
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Keywords</div>
          <div style="margin-top:2px;">${keywords}</div>
        </div>

        <div>
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Log</div>
          <div style="margin-top:2px;white-space:pre-wrap;">${issue.log || '—'}</div>
        </div>

        <div>
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;">Links</div>
          <div style="margin-top:2px;">${linksBlock}</div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    const copyIdBtn = getEl('copyId');
    const copyLinkBtn = getEl('copyLink');

    if (copyIdBtn) {
      copyIdBtn.onclick = () => {
        navigator.clipboard
          .writeText(issue.id)
          .then(() => showToast(`Copied ${issue.id}`))
          .catch(() => showToast('Unable to copy ID.'));
      };
    }

    if (copyLinkBtn) {
      copyLinkBtn.onclick = () => {
        const firstLink = issue.link
          ? String(issue.link)
              .split(',')
              .map((p) => p.trim())
              .filter(Boolean)[0]
          : '';

        const valueToCopy = firstLink || window.location.href;

        navigator.clipboard
          .writeText(valueToCopy)
          .then(() => showToast('Link copied to clipboard.'))
          .catch(() => showToast('Unable to copy link.'));
      };
    }
  };

  const closeIssueModal = () => {
    const modal = getEl('issueModal');
    if (modal) modal.style.display = 'none';
  };

  // NOTE: DOM listeners for filters, table clicks, modal close etc.
  // will be wired in the final chunk (Chunk 3+) inside DOMContentLoaded.

  // ---------------------------------------------------------------------------
  // AI INSIGHTS – HEURISTICS ON LOCAL DATA
  // ---------------------------------------------------------------------------

  const STOPWORDS = new Set([
    'the','and','for','with','that','this','was','are','not','but','from','when',
    'then','into','onto','our','your','their','them','they','you','all','any',
    'can','cant','cannot','could','should','would','will','just','very','have',
    'has','had','been','being','were','its','it','app','web','issue','bug',
    'checklist','report','reports','reporting','mobile','app','list','lists',
    'view','views','error','errors','page','white','data','items','item'
  ]);

  const tokenize = (text) => {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  };

  const buildAiDataset = () => {
    const allIssues = state.issues || [];
    const filtered = state.filteredIssues && state.filteredIssues.length
      ? state.filteredIssues
      : allIssues;

    const nowDate = now();
    const last14dCutoff = new Date(nowDate.getTime() - 14 * 86400000);
    const last30dCutoff = new Date(nowDate.getTime() - 30 * 86400000);

    const recent14 = filtered.filter(
      (i) => i.date && i.date >= last14dCutoff
    );
    const recent30 = filtered.filter(
      (i) => i.date && i.date >= last30dCutoff
    );

    return {
      allIssues,
      filtered,
      recent14,
      recent30
    };
  };

  const buildTermStats = (issues) => {
    const freq = new Map();
    const perModule = new Map();
    const perType = new Map();

    for (const issue of issues) {
      const text = [issue.title, issue.description, issue.log]
        .filter(Boolean)
        .join(' ');
      const tokens = tokenize(text);
      const seenInIssue = new Set();

      for (const tok of tokens) {
        if (!tok) continue;
        const cur = freq.get(tok) || 0;
        freq.set(tok, cur + 1);

        if (!seenInIssue.has(tok)) {
          seenInIssue.add(tok);

          if (issue.moduleNorm) {
            const modMap = perModule.get(tok) || new Map();
            modMap.set(issue.moduleNorm, (modMap.get(issue.moduleNorm) || 0) + 1);
            perModule.set(tok, modMap);
          }

          if (issue.typeNorm) {
            const typeMap = perType.get(tok) || new Map();
            typeMap.set(issue.typeNorm, (typeMap.get(issue.typeNorm) || 0) + 1);
            perType.set(tok, typeMap);
          }
        }
      }
    }

    return { freq, perModule, perType };
  };

  const topTermsList = (stats, limit = 12) => {
    const entries = Array.from(stats.freq.entries())
      .filter(([term]) => term.length > 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    return entries.map(([term, count]) => {
      const modulesMap = stats.perModule.get(term) || new Map();
      const typesMap = stats.perType.get(term) || new Map();

      const topMod = Array.from(modulesMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([m, c]) => `${m} (${c})`)
        .join(', ') || 'mixed';

      const topType = Array.from(typesMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([t, c]) => `${t} (${c})`)
        .join(', ') || 'mixed';

      return { term, count, topMod, topType };
    });
  };

  const computeModuleRiskRows = () => {
    const openIssues = (state.issues || []).filter(isIssueOpen);
    const byModule = new Map();

    for (const issue of openIssues) {
      const mod = issue.moduleNorm || 'Unspecified';
      const entry =
        byModule.get(mod) || {
          module: mod,
          open: 0,
          highP: 0,
          riskSum: 0,
          terms: new Map()
        };

      entry.open += 1;
      if (issue.priorityNorm === 'high' || issue.priorityNorm === 'urgent') {
        entry.highP += 1;
      }
      entry.riskSum += issue.riskScore || 0;

      const text = [issue.title, issue.description, issue.log]
        .filter(Boolean)
        .join(' ');
      for (const tok of tokenize(text)) {
        entry.terms.set(tok, (entry.terms.get(tok) || 0) + 1);
      }

      byModule.set(mod, entry);
    }

    const rows = Array.from(byModule.values())
      .map((entry) => {
        const topTerm =
          Array.from(entry.terms.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
        return {
          module: entry.module,
          open: entry.open,
          highP: entry.highP,
          riskSum: entry.riskSum,
          topTerm
        };
      })
      .sort((a, b) => b.riskSum - a.riskSum || b.open - a.open);

    return rows;
  };

  const renderModuleRiskTable = () => {
    const tbody = getEl('aiModulesTableBody');
    if (!tbody) return;

    const rows = computeModuleRiskRows();
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No data yet.</td></tr>';
      return;
    }

    const maxRiskSum = Math.max(...rows.map((r) => r.riskSum || 0)) || 1;

    tbody.innerHTML = rows
      .map((row) => {
        const pct = Math.max(4, Math.round((row.riskSum / maxRiskSum) * 100));
        return `
          <tr>
            <td>${row.module}</td>
            <td>${row.open}</td>
            <td>${row.highP}</td>
            <td>
              ${row.riskSum.toFixed(1)}
              <div class="risk-bar-wrap">
                <div class="risk-bar" style="width:${pct}%;"></div>
              </div>
            </td>
            <td>${row.topTerm}</td>
          </tr>
        `;
      })
      .join('');
  };

  const findIncidentLikeIssues = (issues) => {
    return issues
      .filter((i) => {
        const risk = i.riskScore || 0;
        if (risk < 7) return false;
        if (i.typeNorm !== 'Bug') return false;
        return true;
      })
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      .slice(0, 10);
  };

  const buildEmergingStableThemes = (dataset) => {
    const { allIssues } = dataset;
    if (!allIssues.length) return { emerging: [], stable: [] };

    const sortedByDate = allIssues
      .filter((i) => i.date)
      .sort((a, b) => a.date - b.date);
    if (!sortedByDate.length) return { emerging: [], stable: [] };

    const midIndex = Math.floor(sortedByDate.length / 2);
    const older = sortedByDate.slice(0, midIndex);
    const newer = sortedByDate.slice(midIndex);

    const olderStats = buildTermStats(older);
    const newerStats = buildTermStats(newer);

    const emerging = [];
    const stable = [];

    for (const [term, newCount] of newerStats.freq.entries()) {
      const oldCount = olderStats.freq.get(term) || 0;
      if (newCount < 3) continue;

      const growth = newCount - oldCount;
      const ratio = oldCount ? newCount / oldCount : newCount;

      if (growth >= 2 && ratio >= 1.5) {
        emerging.push({ term, newCount, oldCount, ratio });
      } else if (newCount >= 4 && Math.abs(newCount - oldCount) <= 2) {
        stable.push({ term, newCount, oldCount });
      }
    }

    emerging.sort((a, b) => b.newCount - a.newCount).splice(8);
    stable.sort((a, b) => b.newCount - a.newCount).splice(8);

    return { emerging, stable };
  };

  const clusterIssuesByKeyword = (issues) => {
    const clusters = [
      { key: 'schedule', label: 'Scheduling & instances', keywords: ['schedule','display time','due time','on demand','instance'] },
      { key: 'export', label: 'Export & reports', keywords: ['export','excel','pdf','json'] },
      { key: 'filters', label: 'Filters & drilldown', keywords: ['filter','filters','grid view','list view'] },
      { key: 'mobile-ux', label: 'Mobile UX & inputs', keywords: ['ios','android','keyboard','entry','cursor','long entry','short entry','flash'] },
      { key: 'tags', label: 'Tags, MCQ & scoring', keywords: ['tag','tags','multiple choice','mcq','score','rating'] },
      { key: 'journal', label: 'Journal & logbook', keywords: ['journal','logbook','chat log'] },
      { key: 'access', label: 'Roles & access control', keywords: ['role','roles','access','client access','permission'] },
      { key: 'geo', label: 'Geofencing & location', keywords: ['geofacing','geofencing','location','gps'] }
    ];

    const result = clusters.map((c) => ({ ...c, issues: [] }));

    for (const issue of issues) {
      const text = [issue.title, issue.description, issue.log]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      for (const cluster of result) {
        if (cluster.issues.length >= 7) continue;
        if (cluster.keywords.some((kw) => text.includes(kw))) {
          cluster.issues.push(issue);
        }
      }
    }

    return result.filter((c) => c.issues.length);
  };

  const buildTriageQueue = (issues) => {
    const nowDate = now();
    return issues
      .filter(isIssueOpen)
      .map((i) => {
        const reasons = [];
        if (!i.priorityNorm || i.priorityNorm === 'medium') {
          if ((i.riskScore || 0) >= 7) {
            reasons.push('risk high but priority medium/unspecified');
          }
        }
        if (!i.typeNorm || i.typeNorm === 'Bug') {
          const txt = (i.title || '') + ' ' + (i.description || '');
          if (txt.toLowerCase().includes('after release')) {
            reasons.push('possible regression after release');
          }
        }
        const ageDays =
          i.date && !Number.isNaN(i.date.getTime())
            ? Math.round(daysBetween(i.date, nowDate))
            : null;
        if (ageDays !== null && ageDays > 21 && (i.riskScore || 0) >= 5) {
          reasons.push(`aged ${ageDays}d and still open`);
        }

        const missing = [];
        if (!i.priorityNorm) missing.push('priority');
        if (!i.typeNorm) missing.push('type');
        if (!i.moduleNorm || i.moduleNorm === 'Unspecified') missing.push('module');
        if (missing.length) reasons.push(`missing: ${missing.join(', ')}`);

        return {
          issue: i,
          ageDays,
          reasons,
          score: (i.riskScore || 0) + (ageDays || 0) / 7 + reasons.length
        };
      })
      .filter((r) => r.reasons.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
  };

  const renderAiList = (id, itemsHtml) => {
    const el = getEl(id);
    if (!el) return;
    el.innerHTML = itemsHtml || '';
  };

  const runAiInsights = () => {
    const bar = getEl('aiAnalyzing');
    if (bar) bar.style.display = 'block';

    const dataset = buildAiDataset();
    const { filtered, recent14, recent30, allIssues } = dataset;

    const total = allIssues.length;
    const bugs = allIssues.filter((i) => i.typeNorm === 'Bug').length;
    const enh = allIssues.filter((i) => i.typeNorm === 'Enhancement' || i.typeNorm === 'New Futures').length;

    // Top terms on recent data
    const recentStats = buildTermStats(recent30.length ? recent30 : filtered);
    const topTerms = topTermsList(recentStats, 10);
    renderAiList(
      'aiPatternsList',
      topTerms
        .map(
          (t) =>
            `<li><strong>${t.term}</strong> – ${t.count} mentions · mostly ${t.topMod} · ${t.topType}</li>`
        )
        .join('')
    );

    // Suggested categories, rough mapping by module + text
    const catCounts = {
      'Scheduling & instances': 0,
      'Reporting correctness & UX': 0,
      'Mobile UX & performance': 0,
      'Journal & log integrity': 0,
      'Employee & role management': 0
    };

    for (const i of filtered) {
      const txt = (
        (i.title || '') +
        ' ' +
        (i.description || '') +
        ' ' +
        (i.log || '')
      ).toLowerCase();
      const mod = i.moduleNorm;

      if (mod === 'Reporting' || /report/.test(txt)) {
        catCounts['Reporting correctness & UX']++;
      }
      if (mod === 'Mobile App' || /ios|android|app/.test(txt)) {
        catCounts['Mobile UX & performance']++;
      }
      if (mod === 'Journal') {
        catCounts['Journal & log integrity']++;
      }
      if (mod === 'Employee' || mod === 'Roles') {
        catCounts['Employee & role management']++;
      }
      if (/schedule|instance|on demand|display time|due time/.test(txt)) {
        catCounts['Scheduling & instances']++;
      }
    }

    renderAiList(
      'aiLabelsList',
      Object.entries(catCounts)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `<li><strong>${name}</strong> – ${count} issues</li>`)
        .join('')
    );

    // Scope text
    const filtersActive =
      filterState.module !== 'All' ||
      filterState.priority !== 'All' ||
      filterState.status !== 'All' ||
      !!filterState.search ||
      !!filterState.startDate ||
      !!filterState.endDate;

    const scopePieces = [];
    scopePieces.push(`${total} total issues (${bugs} bugs, ${enh} enhancements/new features).`);
    scopePieces.push(
      `AI insights are computed on <strong>${
        filtered.length
      } issues</strong> (respecting current filters).`
    );
    if (filtersActive) {
      scopePieces.push('Filters are active; clear them to see global patterns.');
    }

    const scopeEl = getEl('aiScopeText');
    if (scopeEl) scopeEl.innerHTML = scopePieces.join(' ');

    // Signals
    const openHigh = allIssues.filter(
      (i) => isIssueOpen(i) && (i.priorityNorm === 'high' || i.priorityNorm === 'urgent')
    );
    const reportingOpenHigh = openHigh.filter((i) => i.moduleNorm === 'Reporting');
    const mobileOpenHigh = openHigh.filter((i) => i.moduleNorm === 'Mobile App');

    const signalsChunks = [];
    if (openHigh.length) {
      signalsChunks.push(
        `${openHigh.length} open high/urgent issues (${reportingOpenHigh.length} in Reporting, ${mobileOpenHigh.length} in Mobile App).`
      );
    }
    const slowPerf = filtered.filter((i) =>
      /loading time|failed fetch|slow|performance|spinner/i.test(
        (i.title || '') + ' ' + (i.description || '') + ' ' + (i.log || '')
      )
    );
    if (slowPerf.length) {
      signalsChunks.push(`${slowPerf.length} issues mention slow loading / fetch failures.`);
    }

    const signalsEl = getEl('aiSignalsText');
    if (signalsEl) {
      signalsEl.textContent = signalsChunks.join(' ');
    }

    // Trends & bursts (last 14 days)
    const recent14Stats = buildTermStats(recent14);
    const recentTop = topTermsList(recent14Stats, 8);
    renderAiList(
      'aiTrendsList',
      recentTop
        .map(
          (t) =>
            `<li><strong>${t.term}</strong> trending in ${t.topMod} · ${t.topType}</li>`
        )
        .join('')
    );

    // Incident-like issues
    const incidentIssues = findIncidentLikeIssues(filtered);
    renderAiList(
      'aiIncidentsList',
      incidentIssues
        .map(
          (i) =>
            `<li><strong>${i.id}</strong> · ${i.moduleNorm} · risk ${i.riskScore} · ${i.title || ''}</li>`
        )
        .join('')
    );

    // Emerging vs stable
    const { emerging, stable } = buildEmergingStableThemes(dataset);
    renderAiList(
      'aiEmergingStable',
      [
        ...emerging.map(
          (e) =>
            `<li><strong>Emerging:</strong> ${e.term} (new ${e.newCount}, old ${e.oldCount})</li>`
        ),
        ...stable.map(
          (s) =>
            `<li><strong>Stable:</strong> ${s.term} (recent ${s.newCount}, old ${s.oldCount})</li>`
        )
      ].join('')
    );

    // Ops cockpit – high-level bullets
    const cockpitItems = [];
    if (reportingOpenHigh.length >= 3) {
      cockpitItems.push(
        `<li>Reporting has <strong>${reportingOpenHigh.length}</strong> open high/urgent issues – validate exports, filters & date logic before risky releases.</li>`
      );
    }
    if (mobileOpenHigh.length >= 3) {
      cockpitItems.push(
        `<li>Mobile App has <strong>${mobileOpenHigh.length}</strong> open high/urgent issues – especially around submission, pop-ups and app reports.</li>`
      );
    }
    if (!cockpitItems.length) {
      cockpitItems.push('<li>No critical clusters detected beyond normal backlog.</li>');
    }
    renderAiList('aiOpsCockpit', cockpitItems.join(''));

    // Per-module risk table
    renderModuleRiskTable();

    // Top risks this week – highest risk open issues from last 7 days
    const sevenDaysAgo = new Date(now().getTime() - 7 * 86400000);
    const recentOpen = filtered.filter(
      (i) => isIssueOpen(i) && i.date && i.date >= sevenDaysAgo
    );
    const topRisks = recentOpen
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      .slice(0, 10);

    renderAiList(
      'aiRisksList',
      topRisks
        .map(
          (i) =>
            `<li><strong>${i.id}</strong> · ${i.moduleNorm} · risk ${i.riskScore} – ${i.title || ''}</li>`
        )
        .join('')
    );

    // Clusters
    const clusters = clusterIssuesByKeyword(filtered);
    const clustersContainer = getEl('aiClusters');
    if (clustersContainer) {
      clustersContainer.innerHTML = clusters
        .map((c) => {
          const items = c.issues
            .slice(0, 6)
            .map(
              (i) =>
                `<li><strong>${i.id}</strong> · ${i.moduleNorm} · ${i.statusNorm} · ${i.title || ''}</li>`
            )
            .join('');
          return `
            <div class="card" style="padding:8px 10px;">
              <div style="font-weight:600;font-size:13px;">${c.label}</div>
              <ul class="muted" style="font-size:13px;margin-top:4px;padding-left:18px;">
                ${items}
              </ul>
            </div>
          `;
        })
        .join('');
    }

    // Triage queue
    const triage = buildTriageQueue(filtered);
    renderAiList(
      'aiTriageList',
      triage
        .map((t) => {
          const reasonText = t.reasons.slice(0, 3).join(' · ');
          return `<li><strong>${t.issue.id}</strong> · ${t.issue.moduleNorm} · risk ${
            t.issue.riskScore
          } – ${reasonText}</li>`;
        })
        .join('')
    );

    // Upcoming risky events – this will be filled after calendar/events logic hooks in
    // runAiInsights may be called again once events are loaded to refresh #aiEventsList

    if (bar) bar.style.display = 'none';
  };

  // ---------------------------------------------------------------------------
  // AI QUERY LANGUAGE
  // ---------------------------------------------------------------------------

  const lastAiQueryState = {
    raw: '',
    parsed: null,
    results: []
  };

  const parseAiQuery = (value) => {
    const q = (value || '').trim();
    const tokens = q.split(/\s+/).filter(Boolean);

    const parsed = {
      textTerms: [],
      module: null,
      status: null,
      priority: null,
      type: null,
      id: null,
      minRisk: null,
      minSeverity: null,
      minImpact: null,
      minUrgency: null,
      lastDays: null,
      minAgeDays: null,
      missingField: null,
      sort: 'risk'
    };

    for (const token of tokens) {
      const low = token.toLowerCase();

      if (low.startsWith('module:')) {
        parsed.module = token.slice(7);
      } else if (low.startsWith('status:')) {
        parsed.status = token.slice(7);
      } else if (low.startsWith('priority:')) {
        parsed.priority = token.slice(9);
      } else if (low.startsWith('type:')) {
        parsed.type = token.slice(5);
      } else if (low.startsWith('id:')) {
        parsed.id = token.slice(3);
      } else if (low.startsWith('missing:')) {
        parsed.missingField = token.slice(8);
      } else if (low.startsWith('risk>=')) {
        parsed.minRisk = parseFloat(token.slice(6));
      } else if (low.startsWith('severity>=')) {
        parsed.minSeverity = parseFloat(token.slice(10));
      } else if (low.startsWith('impact>=')) {
        parsed.minImpact = parseFloat(token.slice(8));
      } else if (low.startsWith('urgency>=')) {
        parsed.minUrgency = parseFloat(token.slice(9));
      } else if (low.startsWith('last:')) {
        const v = low.slice(5);
        const m = v.match(/^(\d+)d$/);
        if (m) parsed.lastDays = parseInt(m[1], 10) || null;
      } else if (low.startsWith('age>')) {
        const v = low.slice(4);
        const m = v.match(/^(\d+)d$/);
        if (m) parsed.minAgeDays = parseInt(m[1], 10) || null;
      } else if (low.startsWith('sort:')) {
        parsed.sort = low.slice(5);
      } else {
        parsed.textTerms.push(token);
      }
    }

    return parsed;
  };

  const filterIssuesByAiQuery = (parsed) => {
    const base = state.issues || [];
    const nowDate = now();

    return base.filter((issue) => {
      if (parsed.module) {
        const mod = (issue.moduleNorm || '').toLowerCase();
        if (!mod.includes(parsed.module.toLowerCase())) return false;
      }
      if (parsed.status) {
        const st = (issue.statusNorm || '').toLowerCase();
        if (!st.includes(parsed.status.toLowerCase())) return false;
      }
      if (parsed.priority) {
        const pr = (issue.priorityNorm || '').toLowerCase();
        if (!pr.includes(parsed.priority.toLowerCase())) return false;
      }
      if (parsed.type) {
        const tp = (issue.typeNorm || '').toLowerCase();
        if (!tp.includes(parsed.type.toLowerCase())) return false;
      }
      if (parsed.id) {
        if (!String(issue.id).toLowerCase().includes(parsed.id.toLowerCase()))
          return false;
      }

      if (parsed.minRisk != null) {
        if ((issue.riskScore || 0) < parsed.minRisk) return false;
      }
      if (parsed.minSeverity != null) {
        if ((issue.severity || 0) < parsed.minSeverity) return false;
      }
      if (parsed.minImpact != null) {
        if ((issue.impact || 0) < parsed.minImpact) return false;
      }
      if (parsed.minUrgency != null) {
        if ((issue.urgency || 0) < parsed.minUrgency) return false;
      }

      if (parsed.lastDays != null) {
        if (!issue.date) return false;
        const delta =
          (nowDate.getTime() - issue.date.getTime()) / 86400000;
        if (delta > parsed.lastDays) return false;
      }

      if (parsed.minAgeDays != null) {
        if (!issue.date) return false;
        const delta =
          (nowDate.getTime() - issue.date.getTime()) / 86400000;
        if (delta < parsed.minAgeDays) return false;
      }

      if (parsed.missingField) {
        const field = parsed.missingField.toLowerCase();
        if (field === 'priority' && issue.priorityNorm) return false;
        if (field === 'status' && issue.statusNorm) return false;
        if (field === 'module' && issue.moduleNorm && issue.moduleNorm !== 'Unspecified') return false;
        if (field === 'type' && issue.typeNorm) return false;
      }

      if (parsed.textTerms.length) {
        const haystack = [
          issue.id,
          issue.moduleNorm,
          issue.title,
          issue.description,
          issue.log
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        for (const term of parsed.textTerms) {
          if (!haystack.includes(term.toLowerCase())) {
            return false;
          }
        }
      }

      return true;
    });
  };

  const sortIssuesForAi = (issues, parsed) => {
    const sortKey = parsed.sort || 'risk';
    const sorted = issues.slice();

    if (sortKey === 'date') {
      sorted.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
    } else if (sortKey === 'priority') {
      const order = { urgent: 3, high: 2, medium: 1, low: 0 };
      sorted.sort((a, b) => {
        const pa = order[a.priorityNorm] || 0;
        const pb = order[b.priorityNorm] || 0;
        return pb - pa;
      });
    } else {
      sorted.sort(
        (a, b) => (b.riskScore || 0) - (a.riskScore || 0)
      );
    }

    return sorted;
  };

  const renderAiQueryResults = (query, parsed, issues) => {
    const container = getEl('aiQueryResults');
    if (!container) return;

    if (!query.trim()) {
      container.innerHTML =
        '<span class="muted">Type a query like <code>module:reporting risk&gt;=8 last:7d sort:risk</code> or <code>missing:priority module:mobile</code>.</span>';
      return;
    }

    if (!issues.length) {
      container.innerHTML =
        `<div>No issues matched <code>${query.replace(/</g, '&lt;')}</code>.</div>`;
      return;
    }

    const maxShow = 50;
    const displayIssues = issues.slice(0, maxShow);

    const listHtml = displayIssues
      .map((i) => {
        const dateText = i.date ? formatDateTime(i.date) : i.dateRaw || '';
        return `
          <li>
            <button type="button" class="btn ghost sm" data-ai-open-issue="${i.id}">
              <strong>${i.id}</strong> · ${i.moduleNorm} · ${i.statusNorm} ·
              priority ${i.priorityNorm || 'n/a'} · risk ${i.riskScore} ·
              <span class="muted">${dateText}</span>
            </button>
          </li>
        `;
      })
      .join('');

    container.innerHTML = `
      <div style="font-size:12px;margin-bottom:6px;">
        ${issues.length} issue${issues.length === 1 ? '' : 's'} match
        <code>${query.replace(/</g, '&lt;')}</code>.
        Showing ${displayIssues.length}${issues.length > maxShow ? ` of ${issues.length}` : ''}.
      </div>
      <ul style="list-style:none;padding-left:0;display:grid;gap:4px;">
        ${listHtml}
      </ul>
    `;
  };

  const runAiQuery = () => {
    const input = getEl('aiQueryInput');
    if (!input) return;

    const value = input.value || '';
    const parsed = parseAiQuery(value);
    const filteredIssues = filterIssuesByAiQuery(parsed);
    const sorted = sortIssuesForAi(filteredIssues, parsed);

    lastAiQueryState.raw = value;
    lastAiQueryState.parsed = parsed;
    lastAiQueryState.results = sorted;

    renderAiQueryResults(value, parsed, sorted);
  };

  const applyAiQueryToIssuesFilters = () => {
    if (!lastAiQueryState.parsed) return;

    const p = lastAiQueryState.parsed;

    // Only map the parts that cleanly align with the standard filters
    if (p.module) {
      filterState.module = p.module.trim();
      const moduleSelect = getEl('moduleFilter');
      if (moduleSelect) {
        moduleSelect.value = filterState.module;
      }
    }
    if (p.status) {
      filterState.status = p.status.trim();
      const statusSelect = getEl('statusFilter');
      if (statusSelect) {
        statusSelect.value = filterState.status;
      }
    }
    if (p.priority) {
      // normalize to lower-case underlying values
      filterState.priority = p.priority.toLowerCase();
      const prioritySelect = getEl('priorityFilter');
      if (prioritySelect) {
        prioritySelect.value = filterState.priority;
      }
    }

    if (p.lastDays != null) {
      const start = new Date(now().getTime() - p.lastDays * 86400000);
      const iso = start.toISOString().slice(0, 10);
      const startInput = getEl('startDateFilter');
      if (startInput) startInput.value = iso;
    }

    if (p.minAgeDays != null) {
      const end = new Date(now().getTime() - p.minAgeDays * 86400000);
      const iso = end.toISOString().slice(0, 10);
      const endInput = getEl('endDateFilter');
      if (endInput) endInput.value = iso;
    }

    // Text terms → global search
    if (p.textTerms.length) {
      const term = p.textTerms.join(' ');
      filterState.search = term;
      const searchInput = getEl('searchInput');
      if (searchInput) searchInput.value = term;
    }

    state.currentPage = 1;
    applyFiltersAndRender();
    showToast('AI query applied to Issues filters.');
  };

  const exportAiQueryResultsAsCsv = () => {
    if (!window.Papa) {
      showToast('CSV export is not available (PapaParse missing).');
      return;
    }
    const results = lastAiQueryState.results || [];
    if (!results.length) {
      showToast('No AI query results to export.');
      return;
    }

    const rows = results.map((i) => ({
      ID: i.id,
      Module: i.moduleNorm,
      Title: i.title,
      Description: i.description,
      Priority: i.priority,
      Status: i.status,
      Type: i.type,
      Date: i.dateRaw,
      RiskScore: i.riskScore,
      Severity: i.severity,
      Impact: i.impact,
      Urgency: i.urgency,
      Category: i.category,
      Log: i.log,
      Link: i.link
    }));

    const csv = window.Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'incheck_ai_query_results.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${results.length} AI query result(s) as CSV.`);
  };
  // ---------------------------------------------------------------------------
  // Calendar & Events (FullCalendar + localStorage)
  // ---------------------------------------------------------------------------

  const EVENT_STORAGE_KEY = 'incheck_events_v1';
  const RELEASE_ASSIGNMENTS_KEY = 'incheck_release_assignments_v1';

  let calendarInstance = null;
  let releaseAssignments = {};

  const _ensureEventsArrayOnState = () => {
    if (!state.events) state.events = [];
  };

  const _loadEventsFromStorage = () => {
    try {
      const raw = localStorage.getItem(EVENT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((ev) => {
        // Normalize dates
        if (ev.start && !(ev.start instanceof Date)) ev.start = new Date(ev.start);
        if (ev.end && !(ev.end instanceof Date)) ev.end = new Date(ev.end);
        return ev;
      });
    } catch (e) {
      console.error('Failed to load events from storage', e);
      return [];
    }
  };

  const _saveEventsToStorage = () => {
    try {
      _ensureEventsArrayOnState();
      const serializable = state.events.map((ev) => ({
        ...ev,
        start: ev.start ? ev.start.toISOString() : null,
        end: ev.end ? ev.end.toISOString() : null
      }));
      localStorage.setItem(EVENT_STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
      console.error('Failed to save events', e);
    }
  };

  const _loadReleaseAssignments = () => {
    try {
      const raw = localStorage.getItem(RELEASE_ASSIGNMENTS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
      return {};
    } catch (e) {
      console.error('Failed to load release assignments', e);
      return {};
    }
  };

  const _saveReleaseAssignments = () => {
    try {
      localStorage.setItem(RELEASE_ASSIGNMENTS_KEY, JSON.stringify(releaseAssignments || {}));
    } catch (e) {
      console.error('Failed to save release assignments', e);
    }
  };

  const _toLocalInputValue = (date) => {
    if (!date || Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d}T${hh}:${mm}`;
  };

  const _fromLocalInputValue = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  const _splitModules = (modulesText) =>
    (modulesText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const _computeEventRiskScore = (ev) => {
    const envWeightMap = { Prod: 3, Staging: 2, Dev: 1, Other: 1 };
    const typeWeightMap = { Deployment: 3, Maintenance: 2, Release: 2, Other: 1 };

    let risk =
      (envWeightMap[ev.env] || 1) +
      (typeWeightMap[ev.type] || 1);

    if (ev.impactType === 'High risk change') risk += 3;
    else if (ev.impactType === 'Customer visible') risk += 2;
    else if (ev.impactType === 'Internal only') risk += 1;

    const modulesLower = _splitModules(ev.modules).map((m) => m.toLowerCase());
    const openIssues = (state.issues || []).filter(isIssueOpen);

    if (modulesLower.length && openIssues.length) {
      const related = openIssues.filter((i) =>
        modulesLower.includes((i.moduleNorm || '').toLowerCase())
      );
      if (related.length) {
        const high = related.filter((i) => (i.riskScore || 0) >= 7);
        risk += high.length * 0.7 + (related.length - high.length) * 0.35;
      }
    }

    if (ev.issueId && state.issues && state.issues.length) {
      const linked = state.issues.find((i) =>
        String(i.id).toLowerCase() === String(ev.issueId).toLowerCase()
      );
      if (linked && (linked.riskScore || 0) >= 7) {
        risk += 1.5;
      }
    }

    return Math.round(risk * 10) / 10;
  };

  const _detectEventCollisions = () => {
    _ensureEventsArrayOnState();
    const events = state.events;
    const collidingIds = new Set();

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i];
        const b = events[j];
        if (!a.start || !b.start) continue;
        if (a.env !== b.env) continue;

        const aStart = a.start.getTime();
        const aEnd = (a.end || a.start).getTime();
        const bStart = b.start.getTime();
        const bEnd = (b.end || b.start).getTime();

        const overlap = aStart <= bEnd && bStart <= aEnd;
        if (overlap) {
          collidingIds.add(a.id);
          collidingIds.add(b.id);
        }
      }
    }

    return collidingIds;
  };

  const _buildCalendarEvent = (ev, collidingIds) => {
    const classNames = [];

    const typeClass = String(ev.type || '').toLowerCase();
    if (typeClass === 'deployment') classNames.push('event-type-deployment');
    else if (typeClass === 'maintenance') classNames.push('event-type-maintenance');
    else if (typeClass === 'release') classNames.push('event-type-release');
    else classNames.push('event-type-other');

    const envClass = String(ev.env || '').toLowerCase();
    if (envClass === 'prod') classNames.push('event-env-prod');
    else if (envClass === 'staging') classNames.push('event-env-staging');
    else if (envClass === 'dev') classNames.push('event-env-dev');
    else classNames.push('event-env-other');

    const risk = ev.riskScore != null ? ev.riskScore : _computeEventRiskScore(ev);
    if (risk >= 10) classNames.push('event-hot');
    else if (risk >= 7) classNames.push('event-collision');

    if (collidingIds && collidingIds.has(ev.id)) {
      classNames.push('event-collision');
    }

    const riskClass =
      risk >= 11 ? 'risk-crit' :
      risk >= 8 ? 'risk-high' :
      risk >= 5 ? 'risk-med' : 'risk-low';

    const riskBadge =
      `<span class="event-risk-badge ${riskClass}">R${risk}</span>`;

    return {
      id: ev.id,
      title: `${ev.title || '(no title)'} ${riskBadge}`,
      start: ev.start,
      end: ev.end,
      allDay: !!ev.allDay,
      classNames,
      extendedProps: {
        ...ev,
        risk
      }
    };
  };

  const _getEventTypeFilterState = () => ({
    Deployment: !!(getEl('eventFilterDeployment') || {}).checked,
    Maintenance: !!(getEl('eventFilterMaintenance') || {}).checked,
    Release: !!(getEl('eventFilterRelease') || {}).checked,
    Other: !!(getEl('eventFilterOther') || {}).checked
  });

  const _refreshCalendarEvents = () => {
    if (!calendarInstance) return;
    _ensureEventsArrayOnState();
    const filters = _getEventTypeFilterState();
    const collidingIds = _detectEventCollisions();

    calendarInstance.removeAllEvents();
    state.events.forEach((ev) => {
      if (!filters[ev.type || 'Other']) return;
      const fcEvent = _buildCalendarEvent(ev, collidingIds);
      calendarInstance.addEvent(fcEvent);
    });
  };

  const _updateCalendarTimezoneText = () => {
    const tzEl = getEl('calendarTz');
    if (!tzEl) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
      tzEl.textContent = `Calendar timezone: ${tz} (browser)`;
    } catch {
      tzEl.textContent = 'Calendar timezone: local';
    }
  };

  let _activeEventId = null;

  const _findEventById = (id) => {
    _ensureEventsArrayOnState();
    return state.events.find((e) => String(e.id) === String(id));
  };

  const _updateEventIssueLinkedInfo = () => {
    const infoEl = getEl('eventIssueLinkedInfo');
    const input = getEl('eventIssueId');
    if (!infoEl || !input) return;

    const value = (input.value || '').trim();
    if (!value || !state.issues || !state.issues.length) {
      infoEl.style.display = 'none';
      infoEl.textContent = '';
      return;
    }

    const issue = state.issues.find(
      (i) => String(i.id).toLowerCase() === value.toLowerCase()
    );
    if (!issue) {
      infoEl.style.display = 'block';
      infoEl.textContent = `No issue found with ID ${value}.`;
      return;
    }

    infoEl.style.display = 'block';
    infoEl.textContent =
      `Linked to ${issue.id} · ${issue.moduleNorm} · ${issue.statusNorm} · ` +
      `priority ${issue.priorityNorm || 'n/a'} · risk ${issue.riskScore || 0}.`;
  };

  const _openEventModal = (eventModel) => {
    const modal = getEl('eventModal');
    if (!modal) return;

    const titleEl = getEl('eventModalTitle');
    const form = getEl('eventForm');

    const isEdit = !!eventModel && !!eventModel.id;
    _activeEventId = isEdit ? eventModel.id : null;

    if (titleEl) {
      titleEl.textContent = isEdit ? 'Edit Event' : 'Add Event';
    }

    const fields = {
      title: getEl('eventTitle'),
      type: getEl('eventType'),
      env: getEl('eventEnv'),
      status: getEl('eventStatus'),
      owner: getEl('eventOwner'),
      modules: getEl('eventModules'),
      impactType: getEl('eventImpactType'),
      issueId: getEl('eventIssueId'),
      start: getEl('eventStart'),
      allDay: getEl('eventAllDay'),
      end: getEl('eventEnd'),
      description: getEl('eventDescription')
    };

    const defaultStart = now();
    defaultStart.setMinutes(0, 0, 0);

    const model = eventModel || {
      id: null,
      title: '',
      type: 'Deployment',
      env: 'Prod',
      status: 'Planned',
      owner: '',
      modules: '',
      impactType: 'No downtime expected',
      issueId: '',
      start: defaultStart,
      allDay: false,
      end: null,
      description: ''
    };

    if (fields.title) fields.title.value = model.title || '';
    if (fields.type) fields.type.value = model.type || 'Deployment';
    if (fields.env) fields.env.value = model.env || 'Prod';
    if (fields.status) fields.status.value = model.status || 'Planned';
    if (fields.owner) fields.owner.value = model.owner || '';
    if (fields.modules) fields.modules.value = model.modules || '';
    if (fields.impactType) fields.impactType.value = model.impactType || 'No downtime expected';
    if (fields.issueId) fields.issueId.value = model.issueId || '';
    if (fields.start) fields.start.value = _toLocalInputValue(model.start || defaultStart);
    if (fields.allDay) fields.allDay.checked = !!model.allDay;
    if (fields.end) fields.end.value = _toLocalInputValue(model.end || null);
    if (fields.description) fields.description.value = model.description || '';

    const deleteBtn = getEl('eventDelete');
    if (deleteBtn) {
      deleteBtn.style.display = isEdit ? 'inline-flex' : 'none';
    }

    _updateEventIssueLinkedInfo();

    modal.style.display = 'flex';
    if (form) form.querySelector('input,select,textarea')?.focus();
  };

  const _closeEventModal = () => {
    const modal = getEl('eventModal');
    if (!modal) return;
    modal.style.display = 'none';
    _activeEventId = null;
  };

  const _gatherEventFromForm = () => {
    const title = (getEl('eventTitle') || {}).value || '';
    const type = (getEl('eventType') || {}).value || 'Deployment';
    const env = (getEl('eventEnv') || {}).value || 'Prod';
    const status = (getEl('eventStatus') || {}).value || 'Planned';
    const owner = (getEl('eventOwner') || {}).value || '';
    const modules = (getEl('eventModules') || {}).value || '';
    const impactType = (getEl('eventImpactType') || {}).value || 'No downtime expected';
    const issueId = (getEl('eventIssueId') || {}).value || '';
    const start = _fromLocalInputValue((getEl('eventStart') || {}).value);
    const allDay = !!((getEl('eventAllDay') || {}).checked);
    const end = _fromLocalInputValue((getEl('eventEnd') || {}).value);
    const description = (getEl('eventDescription') || {}).value || '';

    if (!title.trim()) throw new Error('Title is required.');
    if (!start) throw new Error('Start date/time is required.');

    const id = _activeEventId || `EVT-${Date.now()}`;

    const model = {
      id,
      title: title.trim(),
      type,
      env,
      status,
      owner,
      modules,
      impactType,
      issueId: issueId.trim(),
      start,
      allDay,
      end,
      description
    };

    model.riskScore = _computeEventRiskScore(model);
    return model;
  };

  const _handleEventFormSubmit = (e) => {
    e.preventDefault();
    try {
      const model = _gatherEventFromForm();
      _ensureEventsArrayOnState();

      const existingIdx = state.events.findIndex(
        (ev) => String(ev.id) === String(model.id)
      );
      if (existingIdx >= 0) {
        state.events[existingIdx] = model;
        showToast('Event updated.');
      } else {
        state.events.push(model);
        showToast('Event created.');
      }

      _saveEventsToStorage();
      _refreshCalendarEvents();
      _renderAiUpcomingEvents();
      _updatePlannerReleasePlanOptions();

      _closeEventModal();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not save event.');
    }
  };

  const _handleEventDelete = () => {
    if (!_activeEventId) return;
    if (!confirm('Delete this event?')) return;

    _ensureEventsArrayOnState();
    state.events = state.events.filter(
      (ev) => String(ev.id) !== String(_activeEventId)
    );
    _saveEventsToStorage();
    _refreshCalendarEvents();
    _renderAiUpcomingEvents();
    _updatePlannerReleasePlanOptions();

    showToast('Event deleted.');
    _closeEventModal();
  };

  const _initCalendar = () => {
    const calendarEl = getEl('calendar');
    if (!calendarEl || typeof FullCalendar === 'undefined') return;

    _ensureEventsArrayOnState();
    if (!state.events.length) {
      state.events = _loadEventsFromStorage();
    }
    releaseAssignments = _loadReleaseAssignments();

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      height: 'auto',
      selectable: true,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
      },
      eventClick: (info) => {
        const model = _findEventById(info.event.id);
        if (model) {
          _openEventModal(model);
        }
      },
      dateClick: (info) => {
        const start = info.date;
        _openEventModal({
          id: null,
          title: '',
          type: 'Deployment',
          env: 'Prod',
          status: 'Planned',
          owner: '',
          modules: '',
          impactType: 'No downtime expected',
          issueId: '',
          start,
          allDay: false,
          end: null,
          description: ''
        });
      }
    });

    _refreshCalendarEvents();
    calendarInstance.render();
    _updateCalendarTimezoneText();

    const addEventBtn = getEl('addEventBtn');
    if (addEventBtn) {
      addEventBtn.addEventListener('click', () => _openEventModal(null));
    }

    ['Deployment', 'Maintenance', 'Release', 'Other'].forEach((type) => {
      const id =
        type === 'Deployment'
          ? 'eventFilterDeployment'
          : type === 'Maintenance'
          ? 'eventFilterMaintenance'
          : type === 'Release'
          ? 'eventFilterRelease'
          : 'eventFilterOther';
      const cb = getEl(id);
      if (cb) {
        cb.addEventListener('change', () => _refreshCalendarEvents());
      }
    });

    const eventModalClose = getEl('eventModalClose');
    if (eventModalClose) {
      eventModalClose.addEventListener('click', _closeEventModal);
    }
    const eventCancel = getEl('eventCancel');
    if (eventCancel) {
      eventCancel.addEventListener('click', (e) => {
        e.preventDefault();
        _closeEventModal();
      });
    }
    const eventDelete = getEl('eventDelete');
    if (eventDelete) {
      eventDelete.addEventListener('click', _handleEventDelete);
    }
    const eventForm = getEl('eventForm');
    if (eventForm) {
      eventForm.addEventListener('submit', _handleEventFormSubmit);
    }
    const eventIssueInput = getEl('eventIssueId');
    if (eventIssueInput) {
      eventIssueInput.addEventListener('blur', _updateEventIssueLinkedInfo);
    }
  };

  // ---------------------------------------------------------------------------
  // Release Planner – F&B Middle East (internal-only heuristics)
  // ---------------------------------------------------------------------------

  let _plannerTopSuggestion = null;

  const _buildPlannerSlots = (horizonDays) => {
    const slots = [];
    const base = now();
    base.setMinutes(0, 0, 0);

    for (let d = 0; d < horizonDays; d++) {
      const day = new Date(base.getTime() + d * 86400000);
      const y = day.getFullYear();
      const m = day.getMonth();
      const dt = day.getDate();

      // We'll consider windows at 06:00, 10:00, 15:00, 22:00
      const hours = [6, 10, 15, 22];
      hours.forEach((h) => {
        const start = new Date(y, m, dt, h, 0, 0, 0);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        slots.push({ start, end });
      });
    }
    return slots;
  };

  const _scorePlannerSlot = (slot, ctx) => {
    const hour = slot.start.getHours();
    const day = slot.start.getDay(); // 0=Sun

    // Base from env
    const envBase = { Prod: 4, Staging: 2.5, Dev: 1.5, Other: 1.5 }[ctx.env] || 2;

    // Rush hours – for F&B, especially lunch/dinner local time
    const isLunch = hour >= 11 && hour <= 15;
    const isDinner = hour >= 18 && hour <= 22;
    const isWeekend = day === 5 || day === 6; // Fri/Sat

    let rushPenalty = 0;
    if (isLunch || isDinner) rushPenalty += 3;
    if (isWeekend) rushPenalty += 1;

    // Release type
    const typePenalty =
      ctx.releaseType === 'major'
        ? 3
        : ctx.releaseType === 'feature'
        ? 2
        : 1;

    // Open high-risk issues in related modules
    const modulesLower = ctx.modulesLower;
    let issuesPenalty = 0;
    if (modulesLower.length && state.issues && state.issues.length) {
      const openIssues = state.issues.filter(isIssueOpen);
      const related = openIssues.filter((i) =>
        modulesLower.includes((i.moduleNorm || '').toLowerCase())
      );
      if (related.length) {
        const high = related.filter((i) => (i.riskScore || 0) >= 7);
        issuesPenalty += high.length * 0.6 + (related.length - high.length) * 0.3;
      }
    }

    // Event collisions within 2 hours around this slot
    let collisionPenalty = 0;
    if (state.events && state.events.length) {
      const windowStart = new Date(slot.start.getTime() - 2 * 60 * 60 * 1000);
      const windowEnd = new Date(slot.end.getTime() + 2 * 60 * 60 * 1000);
      state.events.forEach((ev) => {
        if (!ev.start) return;
        if (ev.env !== ctx.env) return;
        const evStart = ev.start.getTime();
        const evEnd = (ev.end || ev.start).getTime();
        const overlap =
          windowStart.getTime() <= evEnd && windowEnd.getTime() >= evStart;
        if (overlap) {
          collisionPenalty += 1.5;
        }
      });
    }

    // Description match – if release description mentions hot terms in AI patterns
    let textPenalty = 0;
    if (ctx.descriptionTokens && ctx.descriptionTokens.length) {
      const txt = ctx.descriptionTokens.join(' ');
      const riskyTerms = ['schedule', 'report', 'export', 'timezone', 'geofence', 'filter'];
      if (riskyTerms.some((t) => txt.includes(t))) {
        textPenalty += 1;
      }
    }

    const score = envBase + rushPenalty + typePenalty + issuesPenalty + collisionPenalty + textPenalty;
    return Math.round(score * 10) / 10;
  };

  const _buildPlannerContext = () => {
    const env = (getEl('plannerEnv') || {}).value || 'Prod';
    const region = (getEl('plannerRegion') || {}).value || 'gulf';
    const releaseType = (getEl('plannerReleaseType') || {}).value || 'feature';
    const modulesText = (getEl('plannerModules') || {}).value || '';
    const description = (getEl('plannerDescription') || {}).value || '';
    const horizon = parseInt((getEl('plannerHorizon') || {}).value || '3', 10) || 3;
    const slotsPerDay = parseInt((getEl('plannerSlotsPerDay') || {}).value || '4', 10) || 4;

    const tokens = tokenize(description);
    const modulesLower = _splitModules(modulesText).map((m) => m.toLowerCase());

    return {
      env,
      region,
      releaseType,
      modulesText,
      modulesLower,
      descriptionTokens: tokens,
      horizon,
      slotsPerDay
    };
  };

  const _suggestReleaseWindows = () => {
    const ctx = _buildPlannerContext();
    const slots = _buildPlannerSlots(ctx.horizon);
    if (!slots.length) return [];

    const scored = slots.map((slot) => {
      const score = _scorePlannerSlot(slot, ctx);
      return { ...slot, score };
    });

    // Lower score = safer
    scored.sort((a, b) => a.score - b.score);

    const byDayCount = new Map();
    const result = [];

    for (const s of scored) {
      const key = s.start.toISOString().slice(0, 10);
      const count = byDayCount.get(key) || 0;
      if (count >= ctx.slotsPerDay) continue;
      byDayCount.set(key, count + 1);
      result.push(s);
      if (result.length >= ctx.slotsPerDay * ctx.horizon) break;
    }

    return result;
  };

  const _renderPlannerResults = (suggestions) => {
    const container = getEl('plannerResults');
    const btnAdd = getEl('plannerAddEvent');
    if (!container) return;

    if (!suggestions || !suggestions.length) {
      container.innerHTML = 'No suggestions generated yet.';
      if (btnAdd) {
        btnAdd.disabled = true;
      }
      _plannerTopSuggestion = null;
      return;
    }

    const rows = suggestions.map((s, idx) => {
      const dateStr = formatDateTime(s.start).split(' ')[0];
      const timeStr = formatDateTime(s.start).split(' ').slice(1).join(' ');
      const scoreClass =
        s.score <= 5 ? 'planner-score-low' :
        s.score <= 8 ? 'planner-score-med' :
        'planner-score-high';

      return `
        <div class="planner-slot">
          <div class="planner-slot-header">
            <span>${dateStr} · ${timeStr}</span>
            <span class="planner-slot-score ${scoreClass}">Score ${s.score}</span>
          </div>
          <div class="planner-slot-meta">
            ${idx === 0 ? '<strong>Top suggestion</strong> · ' : ''}
            Env: ${(getEl('plannerEnv') || {}).value || 'Prod'} ·
            Type: ${(getEl('plannerReleaseType') || {}).value || 'feature'}
          </div>
        </div>
      `;
    });

    container.innerHTML = rows.join('');
    _plannerTopSuggestion = suggestions[0] || null;

    if (btnAdd) {
      btnAdd.disabled = !_plannerTopSuggestion;
    }
  };

  const _handlePlannerRun = () => {
    const suggestions = _suggestReleaseWindows();
    _renderPlannerResults(suggestions);
    showToast(
      suggestions.length
        ? `Generated ${suggestions.length} suggested windows.`
        : 'No release suggestions generated.'
    );
  };

  const _handlePlannerAddSuggestionAsEvent = () => {
    if (!_plannerTopSuggestion) return;
    const ctx = _buildPlannerContext();

    const title =
      ctx.releaseType === 'major'
        ? 'Major Release'
        : ctx.releaseType === 'feature'
        ? 'Feature Release'
        : 'Minor Patch';

    const description = (getEl('plannerDescription') || {}).value || '';

    _openEventModal({
      id: null,
      title,
      type: 'Release',
      env: ctx.env,
      status: 'Planned',
      owner: '',
      modules: ctx.modulesText,
      impactType:
        ctx.releaseType === 'major'
          ? 'High risk change'
          : ctx.releaseType === 'feature'
          ? 'Customer visible'
          : 'Internal only',
      issueId: '',
      start: _plannerTopSuggestion.start,
      allDay: false,
      end: _plannerTopSuggestion.end,
      description
    });
  };

  const _updatePlannerReleasePlanOptions = () => {
    const select = getEl('plannerReleasePlan');
    if (!select) return;

    _ensureEventsArrayOnState();
    const releases = state.events.filter((ev) => ev.type === 'Release');

    if (!releases.length) {
      select.innerHTML =
        '<option value="">No release events yet</option>';
      return;
    }

    const options = releases
      .sort((a, b) => (a.start?.getTime() || 0) - (b.start?.getTime() || 0))
      .map((ev) => {
        const label = `${ev.title || 'Release'} (${formatDateTime(ev.start)})`;
        return `<option value="${ev.id}">${label}</option>`;
      })
      .join('');

    select.innerHTML = `<option value="">Select release event…</option>${options}`;
  };

  const _updatePlannerTicketsOptions = () => {
    const select = getEl('plannerTickets');
    if (!select) return;

    const issues = state.filteredIssues && state.filteredIssues.length
      ? state.filteredIssues
      : state.issues || [];

    if (!issues.length) {
      select.innerHTML = '<option value="">No tickets in current filters</option>';
      return;
    }

    const opts = issues
      .slice()
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      .map((i) => {
        const label = `[${i.id}] ${i.moduleNorm} · ${i.title || ''} (risk ${
          i.riskScore
        }, ${i.priorityNorm || 'n/a'})`;
        return `<option value="${i.id}">${label}</option>`;
      })
      .join('');

    select.innerHTML = opts;
  };

  const _handlePlannerAssignTickets = () => {
    const releaseSelect = getEl('plannerReleasePlan');
    const ticketsSelect = getEl('plannerTickets');
    if (!releaseSelect || !ticketsSelect) return;

    const releaseId = releaseSelect.value;
    if (!releaseId) {
      showToast('Select a release event first.');
      return;
    }

    const selectedIds = Array.from(ticketsSelect.selectedOptions || []).map(
      (opt) => opt.value
    );
    if (!selectedIds.length) {
      showToast('Select at least one ticket to assign.');
      return;
    }

    const current = releaseAssignments[releaseId] || [];
    const merged = Array.from(new Set([...current, ...selectedIds]));
    releaseAssignments[releaseId] = merged;
    _saveReleaseAssignments();

    showToast(`Assigned ${selectedIds.length} ticket(s) to release.`);
  };

  // ---------------------------------------------------------------------------
  // AI Events – Upcoming risky events (next 7 days)
  // ---------------------------------------------------------------------------

  const _computeUpcomingRiskyEvents = () => {
    _ensureEventsArrayOnState();
    if (!state.events || !state.events.length) return [];

    const nowDate = now();
    const horizon = new Date(nowDate.getTime() + 7 * 86400000);

    const openIssues = (state.issues || []).filter(isIssueOpen);
    const modulesForIssue = (issue) => (issue.moduleNorm || '').toLowerCase();

    const result = state.events
      .filter((ev) => {
        if (!ev.start) return false;
        const t = ev.start.getTime();
        return t >= nowDate.getTime() && t <= horizon.getTime();
      })
      .map((ev) => {
        const modulesLower = _splitModules(ev.modules).map((m) => m.toLowerCase());
        const relatedIssues = modulesLower.length
          ? openIssues.filter((i) =>
              modulesLower.includes(modulesForIssue(i))
            )
          : [];

        const highRiskRelated = relatedIssues.filter(
          (i) => (i.riskScore || 0) >= 7
        );

        const baseRisk = _computeEventRiskScore(ev);
        let risk = baseRisk;
        risk += highRiskRelated.length * 0.8;

        const signals = [];
        if (highRiskRelated.length) {
          signals.push(
            `${highRiskRelated.length} high-risk open issue(s) in related modules`
          );
        }
        if (ev.impactType === 'High risk change') {
          signals.push('High risk change');
        }
        if (ev.env === 'Prod') {
          signals.push('Production environment');
        }

        return {
          ev,
          risk: Math.round(risk * 10) / 10,
          relatedIssues,
          highRiskRelated,
          signals
        };
      })
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 10);

    return result;
  };

  const _renderAiUpcomingEvents = () => {
    const listEl = getEl('aiEventsList');
    if (!listEl) return;

    const items = _computeUpcomingRiskyEvents();
    if (!items.length) {
      listEl.innerHTML =
        '<li>No calendar events with notable risk in the next 7 days.</li>';
      return;
    }

    const html = items
      .map((entry) => {
        const ev = entry.ev;
        const dateText = ev.start ? formatDateTime(ev.start) : '';
        const signalsText = entry.signals.length
          ? entry.signals.join(' · ')
          : 'Normal risk window';

        const relatedText = entry.highRiskRelated
          .slice(0, 3)
          .map((i) => i.id)
          .join(', ');

        return `
          <li>
            <strong>${ev.title || '(no title)'}</strong>
            · ${ev.type} · ${ev.env}
            · risk ${entry.risk}
            · <span class="muted">${dateText}</span>
            <div class="muted" style="font-size:11px;margin-top:2px;">
              ${signalsText}
              ${
                relatedText
                  ? ` · related high-risk issues: ${relatedText}`
                  : ''
              }
            </div>
          </li>
        `;
      })
      .join('');

    listEl.innerHTML = html;
  };

  // ---------------------------------------------------------------------------
  // Tabs, drawer, keyboard shortcuts, AI query hookups
  // ---------------------------------------------------------------------------

  const _switchMainView = (view) => {
    const tabs = document.querySelectorAll('.view-tab');
    const views = document.querySelectorAll('.view');

    tabs.forEach((tab) => {
      const isActive = tab.dataset.view === view;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    views.forEach((v) => {
      const isActive = v.id === `${view}View`;
      v.classList.toggle('active', isActive);
    });
  };

  const _initTabsAndDrawer = () => {
    const issuesTab = getEl('issuesTab');
    const calendarTab = getEl('calendarTab');
    const insightsTab = getEl('insightsTab');

    if (issuesTab) {
      issuesTab.addEventListener('click', () => _switchMainView('issues'));
    }
    if (calendarTab) {
      calendarTab.addEventListener('click', () => _switchMainView('calendar'));
    }
    if (insightsTab) {
      insightsTab.addEventListener('click', () => _switchMainView('insights'));
    }

    const drawerBtn = getEl('drawerBtn');
    const sidebar = getEl('sidebar');
    if (drawerBtn && sidebar) {
      drawerBtn.addEventListener('click', () => {
        const isOpen = sidebar.classList.toggle('open');
        drawerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }
  };

  const _globalKeyHandler = (e) => {
    const activeTag = document.activeElement?.tagName;
    const inInput =
      activeTag === 'INPUT' ||
      activeTag === 'TEXTAREA' ||
      activeTag === 'SELECT';

    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!inInput) {
        e.preventDefault();
        const search = getEl('searchInput');
        if (search) search.focus();
      }
      return;
    }

    if (!inInput) {
      if (e.key === '1') {
        _switchMainView('issues');
      } else if (e.key === '2') {
        _switchMainView('calendar');
      } else if (e.key === '3') {
        _switchMainView('insights');
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      _switchMainView('insights');
      const aiInput = getEl('aiQueryInput');
      if (aiInput) aiInput.focus();
    }

    if (e.key === 'Escape') {
      const sidebar = getEl('sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
      }
      const issueModal = getEl('issueModal');
      if (issueModal && issueModal.style.display === 'flex') {
        const closeBtn = getEl('modalClose');
        closeBtn?.click();
      }
      const eventModal = getEl('eventModal');
      if (eventModal && eventModal.style.display === 'flex') {
        _closeEventModal();
      }
    }
  };

  const _initAiQueryUi = () => {
    const runBtn = getEl('aiQueryRun');
    const applyBtn = getEl('aiQueryApplyFilters');
    const exportBtn = getEl('aiQueryExport');
    const input = getEl('aiQueryInput');

    if (runBtn) {
      runBtn.addEventListener('click', () => runAiQuery());
    }
    if (applyBtn) {
      applyBtn.addEventListener('click', () => applyAiQueryToIssuesFilters());
    }
    if (exportBtn) {
      exportBtn.addEventListener('click', () => exportAiQueryResultsAsCsv());
    }
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          runAiQuery();
        }
      });
    }

    const resultsContainer = getEl('aiQueryResults');
    if (resultsContainer) {
      resultsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-ai-open-issue]');
        if (!btn) return;
        const id = btn.getAttribute('data-ai-open-issue');
        if (!id) return;
        const issue = (state.issues || []).find(
          (i) => String(i.id) === String(id)
        );
        if (!issue) return;
        if (typeof openIssueModal === 'function') {
          openIssueModal(issue);
        }
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Bootstrap – run once DOM is ready
  // ---------------------------------------------------------------------------

  const _bootstrapIncheckInternal = () => {
    _initTabsAndDrawer();
    _initCalendar();
    _initAiQueryUi();
    document.addEventListener('keydown', _globalKeyHandler);

    // Wait until issues are loaded by the earlier CSV logic, then run AI + planner wiring.
    const tryWireAiAndPlanner = () => {
      if (state.issues && state.issues.length) {
        try {
          runAiInsights();
        } catch (e) {
          console.warn('runAiInsights failed', e);
        }

        try {
          _updatePlannerTicketsOptions();
          _updatePlannerReleasePlanOptions();
          _renderAiUpcomingEvents();
        } catch (e) {
          console.warn('Planner / AI events wiring failed', e);
        }
      } else {
        setTimeout(tryWireAiAndPlanner, 700);
      }
    };
    tryWireAiAndPlanner();

    const plannerRunBtn = getEl('plannerRun');
    if (plannerRunBtn) {
      plannerRunBtn.addEventListener('click', _handlePlannerRun);
    }

    const plannerAddBtn = getEl('plannerAddEvent');
    if (plannerAddBtn) {
      plannerAddBtn.addEventListener('click', _handlePlannerAddSuggestionAsEvent);
    }

    const plannerAssignBtn = getEl('plannerAssignBtn');
    if (plannerAssignBtn) {
      plannerAssignBtn.addEventListener('click', _handlePlannerAssignTickets);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootstrapIncheckInternal);
  } else {
    _bootstrapIncheckInternal();
  }

})();
