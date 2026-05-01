
/**
 * ticketing Dashboard
 * Single-file architecture:
 *  - CONFIG / LS_KEYS
 *  - DataStore (issues + text analytics)
 *  - Risk engine (technical + biz + ops + severity/impact/urgency)
 *  - DSL query parser & matcher
 *  - Event risk (events + collisions + freezes + hot issues)
 *  - Release planner (F&B / Middle East)
 */

/* moved to config.js */


/* moved to api.js */


/* moved to session.js */


/* moved to permissions.js */


/* moved to utils.js */


/* moved to tickets.js */


/* moved to insights.js */

/* moved to calendar.js */
/* moved to planner.js */
/* moved to ui.js */


function issueDisplayId(issue) {
  return String(issue?.ticket_id || issue?.id || '').trim();
}

function getTicketBusinessId(ticket = {}) {
  return String(
    ticket.ticket_id ||
      ticket.ticketId ||
      ticket.ticket_number ||
      ticket.ticketNumber ||
      ticket.ticket_no ||
      ticket.ticketNo ||
      ticket.id ||
      ''
  ).trim();
}

function buildTicketDeepLink(ticket = {}) {
  const baseUrl = window.location.origin || 'https://monitor.app.incheck360.nl';
  const ticketBusinessId = getTicketBusinessId(ticket);

  if (!ticketBusinessId) {
    return `${baseUrl}/#tickets`;
  }

  return `${baseUrl}/#tickets?ticket_id=${encodeURIComponent(ticketBusinessId)}`;
}

let EVENT_TICKET_PICKER_SHOW_ALL = false;
let EVENT_TICKET_PICKER_ALL_ROWS = null;
const TicketPaginationState = {
  page: 1,
  limit: 50,
  offset: 0,
  returned: 0,
  total: 0,
  totalPages: 1,
  hasMore: false
};
const TicketSummaryState = {
  total: 0,
  open: 0,
  highRisk: 0,
  statusCounts: {},
  filterKey: '',
  loaded: false
};

function parseTicketDateForSort(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const native = Date.parse(text);
  if (Number.isFinite(native)) return native;
  const usMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (usMatch) {
    const month = Number(usMatch[1]) - 1;
    const day = Number(usMatch[2]);
    const year = Number(usMatch[3]);
    const hour = Number(usMatch[4] || 0);
    const minute = Number(usMatch[5] || 0);
    return new Date(year, month, day, hour, minute).getTime();
  }
  return null;
}

function extractLastNumberForSort(value) {
  const text = value == null ? '' : String(value);
  const matches = text.match(/\d+/g);
  if (!matches || !matches.length) return null;
  return Number(matches[matches.length - 1]);
}

function isEmptySortValue(value) {
  return value == null || String(value).trim() === '';
}

const TICKET_SORT_COLUMNS = {
  id: { type: 'ticketId', getValue: row => row.ticket_id || row.id },
  date: { type: 'date', getValue: row => row.date || row.createdAt },
  name: { type: 'text', getValue: row => row.name },
  department: { type: 'text', getValue: row => row.department },
  title: { type: 'text', getValue: row => row.title },
  desc: { type: 'text', getValue: row => row.desc },
  priority: { type: 'text', getValue: row => row.priority },
  module: { type: 'text', getValue: row => row.module },
  emailAddressee: { type: 'text', getValue: row => row.emailAddressee },
  type: { type: 'text', getValue: row => row.type },
  status: { type: 'text', getValue: row => row.status },
  notificationSent: { type: 'text', getValue: row => row.notificationSent },
  youtrackReference: { type: 'text', getValue: row => row.youtrackReference },
  devTeamStatus: { type: 'text', getValue: row => row.devTeamStatus },
  issueRelated: { type: 'text', getValue: row => row.issueRelated },
  notes: { type: 'text', getValue: row => row.notes },
  log: { type: 'text', getValue: row => row.log },
  notificationUnderReview: { type: 'text', getValue: row => row.notificationUnderReview },
  createdAt: { type: 'date', getValue: row => row.createdAt },
  updatedAt: { type: 'date', getValue: row => row.updatedAt }
};

function resolveTicketSortColumn(sortKey = '') {
  const key = String(sortKey || '').trim();
  const map = {
    id: 'ticket_id',
    date: 'date',
    name: 'name',
    department: 'department',
    title: 'title',
    desc: 'description',
    priority: 'priority',
    module: 'module',
    emailAddressee: 'email_addressee',
    type: 'category',
    status: 'status',
    notificationSent: 'notification_sent',
    notificationUnderReview: 'notification_sent_under_review',
    youtrackReference: 'youtrack_reference',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    devTeamStatus: 'dev_team_status',
    issueRelated: 'issue_related',
    notes: 'notes',
    log: 'log'
  };
  return map[key] || key || 'updated_at';
}

function compareTicketSortValues(aValue, bValue, type, direction) {
  const dir = direction === 'desc' ? -1 : 1;
  const emptyA = isEmptySortValue(aValue);
  const emptyB = isEmptySortValue(bValue);
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;

  if (type === 'date') {
    const aDate = parseTicketDateForSort(aValue);
    const bDate = parseTicketDateForSort(bValue);
    if (aDate == null && bDate == null) return 0;
    if (aDate == null) return 1;
    if (bDate == null) return -1;
    return (aDate - bDate) * dir;
  }

  if (type === 'number') {
    const aNum = Number(aValue);
    const bNum = Number(bValue);
    if (!Number.isFinite(aNum) && !Number.isFinite(bNum)) return 0;
    if (!Number.isFinite(aNum)) return 1;
    if (!Number.isFinite(bNum)) return -1;
    return (aNum - bNum) * dir;
  }

  if (type === 'ticketId') {
    const aNum = extractLastNumberForSort(aValue);
    const bNum = extractLastNumberForSort(bValue);
    if (aNum == null && bNum == null) {
      return String(aValue).trim().toLowerCase().localeCompare(String(bValue).trim().toLowerCase()) * dir;
    }
    if (aNum == null) return 1;
    if (bNum == null) return -1;
    return (aNum - bNum) * dir;
  }

  return String(aValue)
    .trim()
    .toLowerCase()
    .localeCompare(String(bValue).trim().toLowerCase(), undefined, { numeric: true, sensitivity: 'base' }) * dir;
}

function stableSortTickets(rows = [], sortKey = '', sortDirection = 'asc') {
  const cfg = TICKET_SORT_COLUMNS[sortKey];
  if (!cfg || !sortDirection) return Array.isArray(rows) ? rows : [];
  return [...(Array.isArray(rows) ? rows : [])]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const primary = compareTicketSortValues(cfg.getValue(a.row), cfg.getValue(b.row), cfg.type, sortDirection);
      if (primary !== 0) return primary;
      const created = compareTicketSortValues(a.row?.createdAt || a.row?.date, b.row?.createdAt || b.row?.date, 'date', 'asc');
      if (created !== 0) return created;
      const ticketId = compareTicketSortValues(issueDisplayId(a.row), issueDisplayId(b.row), 'ticketId', 'asc');
      if (ticketId !== 0) return ticketId;
      return a.index - b.index;
    })
    .map(item => item.row);
}


function buildTicketSummaryFilterKey(filters = {}) {
  const source = filters && typeof filters === 'object' ? filters : {};
  const ordered = Object.keys(source)
    .sort()
    .reduce((acc, key) => {
      acc[key] = source[key];
      return acc;
    }, {});
  return JSON.stringify(ordered);
}

function hasActiveTicketFilters() {
  const state = Filters?.state || {};
  return !!(
    (state.search && String(state.search).trim()) ||
    (state.module && state.module !== 'All') ||
    (state.category && state.category !== 'All') ||
    (state.priority && state.priority !== 'All') ||
    (state.status && state.status !== 'All') ||
    (state.start && String(state.start).trim()) ||
    (state.end && String(state.end).trim()) ||
    (Permissions.canUseInternalIssueFilters() &&
      ((state.devTeamStatus && state.devTeamStatus !== 'All') ||
        (state.issueRelated && state.issueRelated !== 'All')))
  );
}

function isRelevantOpenTicket(ticket = {}) {
  const status = String(ticket.status || '')
    .trim()
    .toLowerCase();
  if (!status) return true;
  return !['closed', 'resolved', 'done', 'completed', 'cancelled', 'canceled'].includes(status);
}

function ticketSortNewestFirst(a = {}, b = {}) {
  const parseTs = row => {
    const candidate = row.updated_at || row.updatedAt || row.date || row.created_at || row.createdAt;
    const ts = candidate ? new Date(candidate).getTime() : 0;
    return Number.isFinite(ts) ? ts : 0;
  };
  return parseTs(b) - parseTs(a);
}

function resolveTicketByIssueRef(ref = '') {
  const value = String(ref || '').trim();
  if (!value) return null;
  const lc = value.toLowerCase();
  return (
    (DataStore.rows || []).find(row => String(row.id || '').trim().toLowerCase() === lc) ||
    (DataStore.rows || []).find(row => String(issueDisplayId(row) || '').trim().toLowerCase() === lc) ||
    null
  );
}

function parseTicketIds(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map(v => String(v || '').trim())
          .filter(Boolean)
      )
    );
  }
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
    )
  );
}

function getEventTicketSelection() {
  if (!E.eventIssueId) return [];
  return Array.from(E.eventIssueId.selectedOptions || [])
    .map(option => String(option.value || '').trim())
    .filter(Boolean);
}

function ticketOptionLabel(ticket = {}) {
  const displayId = issueDisplayId(ticket) || ticket.id || '';
  const title = String(ticket.title || '').trim();
  return title ? `${displayId} — ${title}` : displayId;
}

function showServiceWorkerUpdateNotice() {
  const noticeId = 'swUpdateNotice';
  if (document.getElementById(noticeId)) return;

  const notice = document.createElement('div');
  notice.id = noticeId;
  notice.setAttribute('role', 'status');
  notice.style.position = 'fixed';
  notice.style.right = '16px';
  notice.style.bottom = '16px';
  notice.style.zIndex = '9999';
  notice.style.display = 'flex';
  notice.style.gap = '10px';
  notice.style.alignItems = 'center';
  notice.style.padding = '10px 14px';
  notice.style.borderRadius = '10px';
  notice.style.background = 'rgba(2, 6, 23, 0.94)';
  notice.style.color = '#e5e7eb';
  notice.style.border = '1px solid rgba(148, 163, 184, 0.35)';
  notice.style.boxShadow = '0 12px 28px rgba(2, 6, 23, 0.4)';
  notice.innerHTML = `
    <span>New version available. Refresh to activate push notifications.</span>
    <button type="button" class="btn ghost sm" id="swUpdateRefreshBtn" style="padding:6px 10px;">Refresh</button>
    <button type="button" class="btn ghost sm" id="swUpdateDismissBtn" style="padding:6px 10px;">Dismiss</button>
  `;

  document.body.appendChild(notice);
  notice.querySelector('#swUpdateRefreshBtn')?.addEventListener('click', () => {
    window.location.reload();
  });
  notice.querySelector('#swUpdateDismissBtn')?.addEventListener('click', () => {
    notice.remove();
  });
}

function registerServiceWorkerSafely() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    let hasSafeControllerReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasSafeControllerReloaded) return;
      hasSafeControllerReloaded = true;
      const activeElement = document.activeElement;
      const isEditing =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.isContentEditable);
      if (isEditing) {
        showServiceWorkerUpdateNotice();
        return;
      }
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
      .then(registration => {
        const announceUpdate = () => {
          const waitingWorker = registration.waiting;
          if (!waitingWorker) return;
          showServiceWorkerUpdateNotice();
        };

        if (registration.waiting) {
          announceUpdate();
        }

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.addEventListener('statechange', () => {
            if (
              installingWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              announceUpdate();
            }
          });
        });
      })
      .catch(error => {
        console.warn('[pwa] Service worker registration failed', error);
      });
  });
}

let deferredInstallPrompt = null;
let pwaInstallBannerEl = null;
let pwaInstallDelayTimer = null;
const PWA_INSTALL_RUNTIME_STATE = {
  beforeInstallPromptFired: false,
  appInstalledFired: false
};
window.__INCHECK360_PWA_INSTALL_STATE = { ...PWA_INSTALL_RUNTIME_STATE };

const PWA_INSTALL_STORAGE_KEYS = {
  snoozedUntil: 'incheck360_pwa_install_snoozed_until',
  installed: 'incheck360_pwa_installed'
};

function getPwaInstallDebugEnabled() {
  const host = String(window.location.hostname || '').toLowerCase();
  return Boolean(
    window.RUNTIME_CONFIG?.DEBUG ||
      window.RUNTIME_CONFIG?.DEBUG_PUSH ||
      host === 'localhost' ||
      host === '127.0.0.1'
  );
}

function isAndroidChromeFamily() {
  const ua = String(navigator.userAgent || '').toLowerCase();
  if (!ua.includes('android')) return false;
  if (ua.includes('firefox') || ua.includes('fxios')) return false;
  return ua.includes('chrome') || ua.includes('chromium');
}

function isIosDevice() {
  const ua = String(navigator.userAgent || '').toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function isPwaAlreadyInstalled() {
  const inStandaloneDisplayMode = window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  const iosStandalone = window.navigator?.standalone === true;
  const installedFlag = localStorage.getItem(PWA_INSTALL_STORAGE_KEYS.installed) === 'true';
  return inStandaloneDisplayMode || iosStandalone || installedFlag;
}

function isInstallBannerSnoozed() {
  const untilRaw = localStorage.getItem(PWA_INSTALL_STORAGE_KEYS.snoozedUntil);
  const until = Number(untilRaw || 0);
  return Number.isFinite(until) && until > Date.now();
}

function hideInstallAppBanner() {
  if (!pwaInstallBannerEl) return;
  pwaInstallBannerEl.classList.remove('show');
  pwaInstallBannerEl.setAttribute('aria-hidden', 'true');
}

function showInstallAppBanner() {
  if (!pwaInstallBannerEl) return;
  if (!deferredInstallPrompt) return;
  if (!isAndroidChromeFamily()) return;
  if (isPwaAlreadyInstalled()) return;
  if (isInstallBannerSnoozed()) return;

  pwaInstallBannerEl.classList.add('show');
  pwaInstallBannerEl.setAttribute('aria-hidden', 'false');
}

function snoozeInstallBannerForDays(days = 7) {
  const daysToUse = Number(days);
  const safeDays = Number.isFinite(daysToUse) && daysToUse > 0 ? daysToUse : 7;
  const snoozedUntil = Date.now() + safeDays * 24 * 60 * 60 * 1000;
  localStorage.setItem(PWA_INSTALL_STORAGE_KEYS.snoozedUntil, String(snoozedUntil));
}

function maybeScheduleInstallBanner() {
  if (!deferredInstallPrompt) return;
  if (!isAndroidChromeFamily()) return;
  if (isPwaAlreadyInstalled()) return;
  if (isInstallBannerSnoozed()) return;

  window.clearTimeout(pwaInstallDelayTimer);
  const isOnLogin = document.body.classList.contains('auth-locked');
  const delayMs = isOnLogin ? 2600 : 350;
  pwaInstallDelayTimer = window.setTimeout(() => {
    showInstallAppBanner();
  }, delayMs);
}

function wirePwaInstallBanner() {
  if (!document.body) return;

  if (!isAndroidChromeFamily()) {
    if (isIosDevice()) {
      // iOS Safari does not support beforeinstallprompt. Keep the UX non-intrusive.
      console.info('[pwa] iOS device detected; skipping install prompt banner.');
    }
    return;
  }

  const banner = document.createElement('section');
  banner.id = 'pwaInstallBanner';
  banner.className = 'pwa-install-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Install InCheck360 MonitorCore');
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-hidden', 'true');
  banner.innerHTML = `
    <div class="pwa-install-banner__surface">
      <img src="/icons/icon-192.png" alt="" width="40" height="40" class="pwa-install-banner__icon" />
      <div class="pwa-install-banner__content">
        <h3 class="pwa-install-banner__title">Install InCheck360 MonitorCore</h3>
        <p class="pwa-install-banner__body">Install the app on your device for faster access, full-screen mode, and better notification support.</p>
      </div>
      <div class="pwa-install-banner__actions">
        <button type="button" id="pwaInstallBtn" class="btn primary">Install App</button>
        <button type="button" id="pwaInstallNotNowBtn" class="btn ghost">Not now</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  pwaInstallBannerEl = banner;

  const installBtn = banner.querySelector('#pwaInstallBtn');
  const notNowBtn = banner.querySelector('#pwaInstallNotNowBtn');

  installBtn?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      hideInstallAppBanner();
      return;
    }
    try {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult?.outcome === 'accepted') {
        localStorage.setItem(PWA_INSTALL_STORAGE_KEYS.installed, 'true');
      } else {
        snoozeInstallBannerForDays(7);
      }
    } catch (error) {
      console.warn('[pwa] Install prompt flow failed', error);
    } finally {
      hideInstallAppBanner();
      deferredInstallPrompt = null;
    }
  });

  notNowBtn?.addEventListener('click', () => {
    snoozeInstallBannerForDays(7);
    hideInstallAppBanner();
  });

  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!pwaInstallBannerEl || !pwaInstallBannerEl.classList.contains('show')) return;
    hideInstallAppBanner();
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    PWA_INSTALL_RUNTIME_STATE.beforeInstallPromptFired = true;
    window.__INCHECK360_PWA_INSTALL_STATE = { ...PWA_INSTALL_RUNTIME_STATE };
    if (getPwaInstallDebugEnabled()) {
      console.log('[PWA Install] beforeinstallprompt fired');
    }
    deferredInstallPrompt = event;
    maybeScheduleInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    PWA_INSTALL_RUNTIME_STATE.appInstalledFired = true;
    window.__INCHECK360_PWA_INSTALL_STATE = { ...PWA_INSTALL_RUNTIME_STATE };
    if (getPwaInstallDebugEnabled()) {
      console.log('[PWA Install] appinstalled fired');
    }
    hideInstallAppBanner();
    localStorage.setItem(PWA_INSTALL_STORAGE_KEYS.installed, 'true');
    deferredInstallPrompt = null;
  });

  if (getPwaInstallDebugEnabled()) {
    window.InCheck360PWAInstallDebug = {
      resetInstallPromptSnooze() {
        localStorage.removeItem(PWA_INSTALL_STORAGE_KEYS.snoozedUntil);
        localStorage.removeItem(PWA_INSTALL_STORAGE_KEYS.installed);
      }
    };
  }
}

async function ensureTicketsForEventPicker() {
  if ((DataStore.rows || []).length) return DataStore.rows;
  const filtersPayload = hasActiveTicketFilters() ? buildTicketListFiltersPayload() : {};
  const response = await Api.requestWithSession(
    'tickets',
    'list',
    { filters: filtersPayload },
    { requireAuth: true }
  );
  const rawRows = extractEventsPayload(response);
  const rows = (rawRows || []).map(raw => DataStore.normalizeRow(raw));
  DataStore.hydrateFromRows(rows.filter(r => r.id && String(r.id).trim() !== ''));
  return DataStore.rows;
}

function renderEventIssueChips(selectedIds = []) {
  if (!E.eventIssueSelectedChips) return;
  if (!selectedIds.length) {
    E.eventIssueSelectedChips.innerHTML = '';
    if (E.eventIssueClearBtn) E.eventIssueClearBtn.style.display = 'none';
    return;
  }
  const chipHtml = selectedIds
    .map(id => {
      const ticket = resolveTicketByIssueRef(id);
      const label = ticket ? ticketOptionLabel(ticket) : id;
      return `<span class="event-issue-chip">${U.escapeHtml(label)}<button type="button" data-remove-event-ticket="${U.escapeAttr(
        id
      )}" aria-label="Remove ${U.escapeAttr(id)}">✕</button></span>`;
    })
    .join('');
  E.eventIssueSelectedChips.innerHTML = chipHtml;
  E.eventIssueSelectedChips.querySelectorAll('[data-remove-event-ticket]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = String(btn.getAttribute('data-remove-event-ticket') || '').trim();
      const nextSelection = selectedIds.filter(id => id !== targetId);
      refreshEventTicketSelect(nextSelection);
    });
  });
  if (E.eventIssueClearBtn) E.eventIssueClearBtn.style.display = 'inline-flex';
}

function refreshEventTicketSelect(selectedIssueIds = null) {
  if (!E.eventIssueId) return;
  const searchTerm = String(E.eventIssueSearch?.value || '')
    .trim()
    .toLowerCase();
  const selectedValues = Array.isArray(selectedIssueIds)
    ? parseTicketIds(selectedIssueIds)
    : parseTicketIds(getEventTicketSelection());
  const sourceRows =
    EVENT_TICKET_PICKER_SHOW_ALL && Array.isArray(EVENT_TICKET_PICKER_ALL_ROWS)
      ? EVENT_TICKET_PICKER_ALL_ROWS
      : DataStore.rows || [];
  const hasFilters = hasActiveTicketFilters();
  const baseList = EVENT_TICKET_PICKER_SHOW_ALL
    ? [...sourceRows]
    : hasFilters
      ? UI.Issues.applyFilters()
      : sourceRows.filter(isRelevantOpenTicket);
  const sortedBase = [...baseList].sort(ticketSortNewestFirst);
  const filteredList = searchTerm
    ? sortedBase.filter(ticket => {
        const hay = [
          issueDisplayId(ticket),
          ticket.title,
          ticket.status,
          ticket.module
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(searchTerm);
      })
    : sortedBase;

  const options = ['<option value="" disabled>Select one or more tickets</option>'];
  filteredList.forEach(ticket => {
    const value = issueDisplayId(ticket) || ticket.id || '';
    if (!value) return;
    options.push(
      `<option value="${U.escapeAttr(value)}">${U.escapeHtml(ticketOptionLabel(ticket))}</option>`
    );
  });

  selectedValues.forEach(selectedValue => {
    const exists = filteredList.some(t => {
      const v = String(issueDisplayId(t) || t.id || '').trim().toLowerCase();
      return v === selectedValue.toLowerCase();
    });
    if (exists) return;
    const selectedTicket = resolveTicketByIssueRef(selectedValue);
    const fallbackLabel = selectedTicket
      ? `${ticketOptionLabel(selectedTicket)} (outside current filters)`
      : `${selectedValue} (outside current filters)`;
    options.push(`<option value="${U.escapeAttr(selectedValue)}">${U.escapeHtml(fallbackLabel)}</option>`);
  });

  E.eventIssueId.innerHTML = options.join('');
  Array.from(E.eventIssueId.options || []).forEach(option => {
    option.selected = selectedValues.includes(String(option.value || '').trim());
  });
  renderEventIssueChips(selectedValues);

  const noMatches = !filteredList.length;
  if (E.eventIssueEmptyState) {
    E.eventIssueEmptyState.style.display = noMatches ? 'block' : 'none';
  }
  if (E.eventIssueShowAllBtn) {
    const allowShowAll = noMatches && (hasFilters || !EVENT_TICKET_PICKER_SHOW_ALL);
    E.eventIssueShowAllBtn.style.display = allowShowAll ? 'inline-flex' : 'none';
  }
}

/** Issues UI */
UI.Issues = {
  getFilteredList() {
    const filtered = this.applyFilters();
    if (!GridState.sortKey) return filtered;
    return stableSortTickets(filtered, GridState.sortKey, GridState.sortAsc ? 'asc' : 'desc');
  },
  renderTableOnly(list = this.getFilteredList()) {
    this.renderTable(list);
  },
  renderSummaryOnly(list = this.getFilteredList()) {
    this.renderSummary(list);
    this.renderFilterChips();
    this.renderKPIs(list);
    this.renderInternalWidgets(list);
  },
  refreshChartsOnly(list = this.getFilteredList()) {
    this.renderCharts(list);
  },
  lightRefresh(list = this.getFilteredList()) {
    this.renderSummaryOnly(list);
    this.renderTableOnly(list);
  },
  fullRefresh(list = this.getFilteredList()) {
    this.renderSummaryOnly(list);
    this.renderTableOnly(list);
    this.refreshChartsOnly(list);
  },
  renderFilters() {
    const uniq = a =>
      [...new Set(a.filter(Boolean).map(v => v.trim()))].sort((a, b) =>
        a.localeCompare(b)
      );
    
    if (E.moduleFilter)
      E.moduleFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.module))]
        .map(v => `<option>${v}</option>`)
        .join('');
      if (E.categoryFilter) {
      const categories = buildIssueCategoryOptions();
      E.categoryFilter.innerHTML = ['All', ...categories]
        .map(v => `<option>${v}</option>`)
        .join('');
    }
    if (E.priorityFilter)
      E.priorityFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.priority))]
        .map(v => `<option>${v}</option>`)
        .join('');
    if (E.statusFilter)
      E.statusFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.status))]
        .map(v => `<option>${v}</option>`)
        .join('');
    const allowInternalFilters = Permissions.canUseInternalIssueFilters();
    if (E.devTeamStatusFilter && allowInternalFilters)
      E.devTeamStatusFilter.innerHTML = ['All', ...uniq(DataStore.rows.map(r => r.devTeamStatus))]
        .map(v => `<option>${v}</option>`)
        .join('');
    if (E.issueRelatedFilter && allowInternalFilters) {
      const issueRelatedOptions = uniq(
        DataStore.rows.flatMap(r =>
          String(r.issueRelated || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean)
        )
      );
      E.issueRelatedFilter.innerHTML = ['All', ...issueRelatedOptions]
        .map(v => `<option>${v}</option>`)
        .join('');
    }
     setIfOptionExists(E.moduleFilter, Filters.state.module);
    setIfOptionExists(E.categoryFilter, Filters.state.category);
    setIfOptionExists(E.priorityFilter, Filters.state.priority);
    setIfOptionExists(E.statusFilter, Filters.state.status);
    if (allowInternalFilters) {
      setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
      setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
    }
  },
  applyFilters() {
    const s = Filters.state;
    const allowInternalFilters = Permissions.canUseInternalIssueFilters();
    const qstr = (s.search || '').toLowerCase().trim();
    const terms = qstr ? qstr.split(/\s+/).filter(Boolean) : [];
    const start = s.start ? new Date(s.start) : null;
    const end = s.end ? U.dateAddDays(s.end, 1) : null;

     const matchesCategory = r => {
      if (!s.category || s.category === 'All') return true;
      if (r.type && r.type === s.category) return true;
      const cats = DataStore.computed.get(r.id)?.suggestions?.categories || [];
      return cats.some(c => c.label === s.category);
    };

    return DataStore.rows.filter(r => {
      const hay = [
        r.id,
        r.module,
        r.title,
        r.desc,
        r.log,
        r.type,
        r.name,
        r.department,
        r.emailAddressee,
        r.notificationSent,
        r.notificationUnderReview
      ]
        .concat(
          allowInternalFilters ? [r.youtrackReference, r.devTeamStatus, r.issueRelated, r.notes] : []
        )
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
         matchesCategory(r) &&
        (!s.priority || s.priority === 'All' || r.priority === s.priority) &&
        (!s.status ||
          s.status === 'All' ||
          DataStore.normalizeStatus(r.status) === DataStore.normalizeStatus(s.status)) &&
        (!allowInternalFilters ||
          (!s.devTeamStatus ||
            s.devTeamStatus === 'All' ||
            (r.devTeamStatus || '') === s.devTeamStatus)) &&
        (!allowInternalFilters ||
          (!s.issueRelated ||
            s.issueRelated === 'All' ||
            String(r.issueRelated || '')
              .split(',')
              .map(v => v.trim())
              .includes(s.issueRelated))) &&
        keepDate
      );
    });
  },
  renderKPIs(list) {
    if (!E.kpis) return;
    const fallbackCounts = {};
    list.forEach(r => {
      const normalizedStatus = DataStore.normalizeStatus(r.status);
      fallbackCounts[normalizedStatus] = (fallbackCounts[normalizedStatus] || 0) + 1;
    });
    const hasSummaryCounts = Object.keys(TicketSummaryState.statusCounts || {}).length > 0;
    const counts = hasSummaryCounts ? TicketSummaryState.statusCounts : fallbackCounts;
    const total = Number(TicketSummaryState.total || 0) || list.length;
    const preferredOrder = [
      'New',
      'Not Started Yet',
      'Under Development',
      'On Stage',
      'On Hold',
      'Sent',
      'Resolved',
      'Rejected'
    ];
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
        if (label === 'Total Tickets') {
          Filters.state = {
            search: '',
            module: 'All',
            category: 'All',
            priority: 'All',
            status: 'All',
            devTeamStatus: 'All',
            issueRelated: 'All',
            start: '',
            end: ''
          };
        } else {
          Filters.state.status = label;
          Filters.state.search = '';
        }
        Filters.save();
        GridState.page = 1;
        TicketPaginationState.page = 1;
        loadIssues(true);
      };
      d.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          d.click();
        }
      });
      E.kpis.appendChild(d);
    };
    add('Total Tickets', total);
    const seen = new Set();
    preferredOrder.forEach(status => {
      const value = Number(counts[status] || 0);
      if (value > 0) {
        add(status, value);
        seen.add(status);
      }
    });
    Object.entries(counts)
      .filter(([status, value]) => !seen.has(status) && Number(value || 0) > 0)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .forEach(([status, value]) => add(status, Number(value || 0)));
  },
  renderTable(list) {
    if (!E.issuesTbody) return;
    const rows = Array.isArray(list) ? list : [];

    const total = rows.length;
    const pageData = rows;

    if (E.rowCount) {
      const serverTotal = Number(TicketPaginationState.total || 0);
      if (!total) E.rowCount.textContent = 'No rows';
      else {
        const start = TicketPaginationState.offset + 1;
        const end = TicketPaginationState.offset + total;
        E.rowCount.textContent = `Showing ${start}-${end} of ${serverTotal || end} records`;
      }
    }
    if (E.pageInfo) {
      const totalPages = Number(TicketPaginationState.totalPages || 1);
      E.pageInfo.textContent = totalPages > 1
        ? `Page ${TicketPaginationState.page} of ${totalPages}`
        : `Page ${TicketPaginationState.page}`;
    }
    ['firstPage', 'prevPage', 'nextPage', 'lastPage'].forEach(id => {
      const btn = E[id];
      if (!btn) return;
      const totalPages = Number(TicketPaginationState.totalPages || 1);
      const atFirst = TicketPaginationState.page <= 1,
        atLast = !TicketPaginationState.hasMore || TicketPaginationState.page >= totalPages;
      if (id === 'firstPage' || id === 'prevPage') btn.disabled = atFirst;
      else btn.disabled = atLast;
      if (btn.disabled) btn.setAttribute('disabled', 'true');
      else btn.removeAttribute('disabled');
    });

    const badgeStatus = s =>
      `<span class="pill status-${U.toStatusClass(s)}">${U.escapeHtml(s || '-')}</span>`;
    const badgePrio = p =>
      `<span class="pill priority-${p || ''}">${U.escapeHtml(p || '-')}</span>`;
    const badgeDevTeamStatus = value =>
      `<span class="pill dev-team-${U.toTagClass(value)}">${U.escapeHtml(value || '-')}</span>`;
    const badgeIssueRelated = value =>
      `<span class="pill issue-related-${U.toTagClass(value)}">${U.escapeHtml(value || '-')}</span>`;
    const badgeIssueRelatedGroup = value => {
      const tags = String(value || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      if (!tags.length) return '-';
      return tags.map(tag => badgeIssueRelated(tag)).join(' ');
    };

    const renderCell = (row, col) => {
      if (col.key === 'id') return U.escapeHtml(issueDisplayId(row) || '-');
      if (col.key === 'priority') return badgePrio(row.priority || '-');
      if (col.key === 'status') return badgeStatus(row.status || '-');
      if (col.key === 'devTeamStatus') return badgeDevTeamStatus(row.devTeamStatus || '-');
      if (col.key === 'issueRelated') return badgeIssueRelatedGroup(row.issueRelated || '');
      if (
        col.key === 'date' ||
        col.key === 'notificationSent' ||
        col.key === 'notificationUnderReview' ||
        col.key === 'createdAt' ||
        col.key === 'updatedAt'
      ) {
        return U.escapeHtml(U.formatDateTimeMMDDYYYYHHMM(row[col.key]));
      }
      if (col.key === 'file') {
        const safeUrl = U.safeExternalUrl(row.file);
        return row.file
          ? safeUrl
            ? `<a href="${U.escapeAttr(
                safeUrl
              )}" target="_blank" rel="noopener noreferrer" aria-label="Open attachment link">🔗</a>`
            : '<span class="muted">Invalid link</span>'
          : '-';
      }
      const value = row[col.key];
      return U.escapeHtml(value || '-');
    };

    if (pageData.length) {
      E.issuesTbody.innerHTML = pageData
      .map(r => {
          const cells = ColumnManager.getAvailableColumns()
            .map(
              col => `<td data-col="${col.key}">${renderCell(r, col)}</td>`
            )
            .join('');
        return `<tr role="button" tabindex="0" aria-label="Open ticket ${U.escapeHtml(
            issueDisplayId(r) || r.id || ''
          )}" data-id="${U.escapeAttr(r.id)}">
            ${cells}
          </tr>`;
        })
        .join('');
    } else {
      const parts = [];
      if (Filters.state.search) parts.push(`search "${Filters.state.search}"`);
      if (Filters.state.module && Filters.state.module !== 'All')
        parts.push(`module = ${Filters.state.module}`);
       if (Filters.state.category && Filters.state.category !== 'All')
        parts.push(`category = ${Filters.state.category}`);
      if (Filters.state.priority && Filters.state.priority !== 'All')
        parts.push(`priority = ${Filters.state.priority}`);
      if (Filters.state.status && Filters.state.status !== 'All')
        parts.push(`status = ${Filters.state.status}`);
      if (Filters.state.devTeamStatus && Filters.state.devTeamStatus !== 'All')
        parts.push(`dev team status = ${Filters.state.devTeamStatus}`);
      if (Filters.state.issueRelated && Filters.state.issueRelated !== 'All')
        parts.push(`ticket related = ${Filters.state.issueRelated}`);
      if (Filters.state.start) parts.push(`from ${Filters.state.start}`);
      if (Filters.state.end) parts.push(`to ${Filters.state.end}`);
      const desc = parts.length ? parts.join(', ') : 'no filters';
      E.issuesTbody.innerHTML = `
        <tr>
          <td colspan="${ColumnManager.getVisibleColumnCount()}" style="text-align:center;color:var(--muted)">
            No tickets found for ${U.escapeHtml(desc)}.
            <button type="button" class="btn sm" id="clearFiltersBtn" style="margin-left:8px">Clear filters</button>
          </td>
        </tr>`;
      const clearBtn = document.getElementById('clearFiltersBtn');
      if (clearBtn)
        clearBtn.addEventListener('click', () => {
          Filters.state = {
            search: '',
            module: 'All',
            category: 'All',
            priority: 'All',
            status: 'All',
            devTeamStatus: 'All',
            issueRelated: 'All',
            start: '',
            end: ''
          };
          Filters.save();
          if (E.searchInput) E.searchInput.value = '';
          if (E.categoryFilter) E.categoryFilter.value = 'All';
          if (E.startDateFilter) E.startDateFilter.value = '';
          if (E.endDateFilter) E.endDateFilter.value = '';
          UI.Issues.renderFilters();
          GridState.page = 1;
          TicketPaginationState.page = 1;
          loadIssues(true);
        });
    }
ColumnManager.apply();

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
     const palette = [
      cssVar('--accent'),
      cssVar('--danger'),
      cssVar('--ok'),
      cssVar('--warn'),
      cssVar('--info'),
      cssVar('--purple'),
      cssVar('--neutral'),
      cssVar('--status-onstage')
    ];
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
      const labels = Object.keys(data),
        values = Object.values(data);
      const dataset = {
        data: values,
        backgroundColor: labels.map((l, i) => colors[l] || palette[i % palette.length])
      };
      const existing = UI._charts[id];
      if (existing && existing.config?.type === type) {
        existing.data.labels = labels;
        existing.data.datasets = [dataset];
        existing.update('none');
        return;
      }
      if (existing) existing.destroy();
      UI._charts[id] = new Chart(el, {
        type,
        data: { labels, datasets: [dataset] },
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

    const categoryOptions = buildIssueCategoryOptions();
    const normalizedCategoryMap = new Map(
      categoryOptions.map(option => [option.toLowerCase(), option])
    );
    const byTypeCounts = list.reduce((acc, row) => {
      const normalized = String(row.type || '')
        .trim()
        .toLowerCase();
      const category = normalizedCategoryMap.get(normalized);
      if (!category) return acc;
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    const orderedByTypeCounts = categoryOptions.reduce((acc, category) => {
      if (!byTypeCounts[category]) return acc;
      acc[category] = byTypeCounts[category];
      return acc;
    }, {});
    make('byType', 'bar', orderedByTypeCounts);
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
  if (s.category && s.category !== 'All') addChip('Category', s.category, 'category');
  if (s.priority && s.priority !== 'All') addChip('Priority', s.priority, 'priority');
  if (s.status && s.status !== 'All') addChip('Status', s.status, 'status');
  if (s.devTeamStatus && s.devTeamStatus !== 'All')
    addChip('Dev Team Status', s.devTeamStatus, 'devTeamStatus');
  if (s.issueRelated && s.issueRelated !== 'All')
    addChip('Ticket Related', s.issueRelated, 'issueRelated');
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
      if (key === 'category') Filters.state.category = 'All';
      if (key === 'priority') Filters.state.priority = 'All';
      if (key === 'status') Filters.state.status = 'All';
      if (key === 'devTeamStatus') Filters.state.devTeamStatus = 'All';
      if (key === 'issueRelated') Filters.state.issueRelated = 'All';
      if (key === 'start') Filters.state.start = '';
      if (key === 'end') Filters.state.end = '';

      Filters.save();
      if (E.searchInput && key === 'search') E.searchInput.value = '';
      if (E.moduleFilter && key === 'module') E.moduleFilter.value = 'All';
      if (E.categoryFilter && key === 'category') E.categoryFilter.value = 'All';
      if (E.priorityFilter && key === 'priority') E.priorityFilter.value = 'All';
      if (E.statusFilter && key === 'status') E.statusFilter.value = 'All';
      if (E.devTeamStatusFilter && key === 'devTeamStatus') E.devTeamStatusFilter.value = 'All';
      if (E.issueRelatedFilter && key === 'issueRelated') E.issueRelatedFilter.value = 'All';
      if (E.startDateFilter && key === 'start') E.startDateFilter.value = '';
      if (E.endDateFilter && key === 'end') E.endDateFilter.value = '';

      TicketPaginationState.page = 1;
      loadIssues(true);
    });
  });
};

UI.Issues.renderSummary = function (list) {
  if (!E.issuesSummaryText) return;
  const fallbackTotal = list.length;
  const total = Number(TicketSummaryState.total || 0) || fallbackTotal;
  let open = Number(TicketSummaryState.open || 0);
  let highRisk = Number(TicketSummaryState.highRisk || 0);
  if (!open && total === fallbackTotal) {
    open = list.filter(r => {
      const st = String(r.status || '').toLowerCase();
      return !(st.startsWith('resolved') || st.startsWith('rejected'));
    }).length;
  }
  if (!highRisk && total === fallbackTotal) {
    list.forEach(r => {
      const risk = DataStore.computed.get(r.id)?.risk?.total || 0;
      if (risk >= CONFIG.RISK.highRisk) highRisk++;
    });
  }
  E.issuesSummaryText.textContent =
     `${total} ticket${total === 1 ? '' : 's'} · ${open} open · ${highRisk} high-risk`;

  if (E.issuesLastUpdated) {
    const lastUpdated = IssuesCache.lastUpdated();
    if (!lastUpdated) {
      E.issuesLastUpdated.textContent = 'Last updated: --';
      E.issuesLastUpdated.classList.remove('stale');
    } else {
      E.issuesLastUpdated.textContent = `Last updated: ${U.fmtDisplayDate(lastUpdated)}`;
      const ageHours = (Date.now() - lastUpdated.getTime()) / 36e5;
      E.issuesLastUpdated.classList.toggle('stale', ageHours > CONFIG.DATA_STALE_HOURS);
      E.issuesLastUpdated.title =
        ageHours > CONFIG.DATA_STALE_HOURS
          ? `Data is ${Math.round(ageHours)} hours old`
          : '';
    }
  }
};

UI.Issues.renderInternalWidgets = function () {
  if (!E.ticketInternalWidgets) return;
  E.ticketInternalWidgets.innerHTML = '';
};

/** Analytics (AI tab) */
const Analytics = {
  _debounce: null,
  _state: { dashboard: null, activeFilter: 'all' },
  filters: [
    { key: 'all', label: 'All' },
    { key: 'critical', label: 'Critical' },
    { key: 'high', label: 'High' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'events', label: 'Events' },
    { key: 'linked_ticket_event_risk', label: 'Linked Risks' },
    { key: 'data_quality', label: 'Data Quality' },
    { key: 'reviewed', label: 'Reviewed' },
    { key: 'dismissed', label: 'Dismissed' }
  ],
  refresh() {
    clearTimeout(this._debounce);
    UI.setAnalyzing(true);
    this.renderLoading();
    this._debounce = setTimeout(() => this._render(), 80);
  },
  renderLoading() {
    if (E.aiExecutiveOverview) {
      E.aiExecutiveOverview.innerHTML = Array.from({ length: 6 })
        .map(() => '<div class="card"><div class="skeleton" style="height:14px;width:60%;"></div><div class="skeleton" style="height:30px;margin-top:10px;"></div></div>')
        .join('');
    }
    if (E.aiInsightQueue) {
      E.aiInsightQueue.innerHTML = Array.from({ length: 4 })
        .map(() => '<article class="decision-card"><div class="skeleton" style="height:14px;width:30%;"></div><div class="skeleton" style="height:18px;margin-top:8px;width:70%;"></div><div class="skeleton" style="height:12px;margin-top:8px;"></div><div class="skeleton" style="height:12px;margin-top:6px;"></div></article>')
        .join('');
    }
  },
  async _render() {
    try {
      const dashboard = await window.AIDecisionService.generateDashboard();
      this._state.dashboard = dashboard;
      this.renderFilters();
      this.renderDashboard();
    } catch (error) {
      console.error('AI Insights v2 failed to render', error);
      if (E.aiInsightQueue) E.aiInsightQueue.innerHTML = '<div class="muted">Unable to load AI Insights data.</div>';
    } finally {
      UI.setAnalyzing(false);
    }
  },
  getFilteredInsights() {
    const insights = this._state.dashboard?.insights || [];
    const filter = this._state.activeFilter;
    if (filter === 'all') return insights;
    if (filter === 'critical' || filter === 'high') return insights.filter(i => i.severity === filter);
    if (filter === 'reviewed' || filter === 'dismissed') return insights.filter(i => i.status === filter);
    if (filter === 'tickets' || filter === 'events') return insights.filter(i => i.resource === filter);
    return insights.filter(i => String(i.category || '').toLowerCase() === filter);
  },
  renderFilters() {
    if (!E.aiInsightFilters) return;
    E.aiInsightFilters.innerHTML = this.filters
      .map(
        f =>
          `<button class="btn ghost sm ${this._state.activeFilter === f.key ? 'active' : ''}" type="button" data-ai-filter="${U.escapeAttr(f.key)}">${U.escapeHtml(f.label)}</button>`
      )
      .join('');
    E.aiInsightFilters.querySelectorAll('[data-ai-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._state.activeFilter = btn.getAttribute('data-ai-filter') || 'all';
        this.renderFilters();
        this.renderDashboard();
      });
    });
  },
  openTicketByRef(ticketRef) {
    const ref = String(ticketRef || '').trim();
    if (!ref) return;
    if (typeof resolveTicketByIssueRef === 'function') {
      const ticket = resolveTicketByIssueRef(ref);
      if (ticket) {
        UI.Modals.openIssue(ticket.id || ref);
        return;
      }
    }
    UI.toast(`Ticket ${ref} could not be resolved.`);
  },
  openEventByRef(eventRef) {
    const ref = String(eventRef || '').trim().toLowerCase();
    if (!ref) return;
    const events = Array.isArray(DataStore?.events) ? DataStore.events : [];
    const event = events.find(ev => {
      const id = String(ev.id || '').trim().toLowerCase();
      const code = String(ev.event_code || ev.eventCode || ev.displayId || '').trim().toLowerCase();
      return ref === id || ref === code;
    });
    if (event) {
      UI.Modals.openEvent(event);
      return;
    }
    setActiveView('calendar');
    UI.toast(`Open event ${eventRef}`);
  },
  evidenceListMarkup(evidence = []) {
    if (!Array.isArray(evidence) || !evidence.length) return '<li>No evidence available.</li>';
    return evidence
      .map(item => {
        if (item && typeof item === 'object') {
          const pairs = Object.entries(item)
            .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value ?? '—')}`)
            .join(' · ');
          return `<li>${U.escapeHtml(pairs)}</li>`;
        }
        return `<li>${U.escapeHtml(String(item))}</li>`;
      })
      .join('');
  },
  renderDashboard() {
    const dashboard = this._state.dashboard;
    if (!dashboard) return;
    const insights = this.getFilteredInsights();
    const summary = dashboard.summary || {};

    if (E.aiExecutiveOverview) {
      const cards = [
        ['Ticket Health Score', `${Math.round(summary.ticket_health_score || 0)}/100`],
        ['Open Ticket Risk', String(summary.open_ticket_risk || 0)],
        ['Events Risk', String(summary.events_risk || 0)],
        ['Linked Ticket/Event Risk', String(summary.linked_ticket_event_risk || 0)],
        ['Critical Insights', String(summary.critical_insights || 0)],
        ['High Priority Items', String(summary.high_priority_items || 0)]
      ];
      E.aiExecutiveOverview.innerHTML = cards
        .map(
          ([label, value]) =>
            `<div class="card"><div class="muted" style="font-size:12px;">${U.escapeHtml(label)}</div><div style="font-size:24px;font-weight:700;margin-top:6px;">${U.escapeHtml(value)}</div></div>`
        )
        .join('');
    }

    if (!E.aiInsightQueue) return;
    if (!insights.length) {
      E.aiInsightQueue.innerHTML = '<div class="muted">No active ticket or event risks found.</div>';
      return;
    }

    E.aiInsightQueue.innerHTML = insights
      .map(insight => {
        const sev = insight.severity || 'low';
        const isLinked = insight.category === 'linked_ticket_event_risk';
        const isEvent = insight.resource === 'events' || isLinked;
        const created = U.formatDateTimeMMDDYYYYHHMM(insight.created_at);

        const eventButton = isEvent
          ? `<button class="btn sm" data-ai-open-event="${U.escapeAttr(insight.resource_id || '')}">Open Event</button>`
          : '';
        const ticketButton = isLinked
          ? `<button class="btn sm" data-ai-open-tickets="${U.escapeAttr(insight.insight_id)}">Open Ticket(s)</button>`
          : insight.resource === 'tickets'
            ? `<button class="btn sm" data-ai-open-ticket="${U.escapeAttr(insight.resource_id || '')}">Open Ticket</button>`
            : '';

        return `<article class="decision-card">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">
            <span class="chip decision-sev-${U.escapeAttr(sev)}">${U.escapeHtml(sev.toUpperCase())}</span>
            <span class="chip">${U.escapeHtml(insight.category || 'recommendation')}</span>
            <span class="muted" style="margin-left:auto;">Confidence ${Math.round(insight.confidence_score || 0)}%</span>
          </div>
          <h4 style="margin:0 0 6px;">${U.escapeHtml(insight.title || 'Insight')}</h4>
          <div class="muted">${U.escapeHtml(insight.summary || '')}</div>
          <div style="margin-top:6px;"><strong>Why it matters:</strong> ${U.escapeHtml(insight.why_it_matters || '—')}</div>
          <div style="margin-top:4px;"><strong>Recommended action:</strong> ${U.escapeHtml(insight.recommended_action || '—')}</div>
          <div class="muted" style="margin-top:8px;">Affected ${insight.affected_count || 0} · Evidence records ${insight.evidence?.length || 0} · Created ${created} · Status ${U.escapeHtml(insight.status || 'new')}</div>
          <details style="margin-top:8px;"><summary>View Evidence</summary><ul style="margin:6px 0 0 16px;">${this.evidenceListMarkup(insight.evidence)}</ul></details>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
            ${eventButton}
            ${ticketButton}
            <button class="btn ghost sm" data-ai-evidence="${U.escapeAttr(insight.insight_id)}">View Evidence</button>
            <button class="btn ghost sm" data-ai-status="reviewed" data-ai-id="${U.escapeAttr(insight.insight_id)}">Mark Reviewed</button>
            <button class="btn ghost sm" data-ai-status="dismissed" data-ai-id="${U.escapeAttr(insight.insight_id)}">Dismiss</button>
          </div>
        </article>`;
      })
      .join('');

    E.aiInsightQueue.querySelectorAll('[data-ai-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-ai-id');
        const status = btn.getAttribute('data-ai-status');
        window.AIDecisionService.updateStatus(id, status);
        this.refresh();
      });
    });

    E.aiInsightQueue.querySelectorAll('[data-ai-open-ticket]').forEach(btn => {
      btn.addEventListener('click', () => this.openTicketByRef(btn.getAttribute('data-ai-open-ticket')));
    });

    E.aiInsightQueue.querySelectorAll('[data-ai-open-event]').forEach(btn => {
      btn.addEventListener('click', () => this.openEventByRef(btn.getAttribute('data-ai-open-event')));
    });

    E.aiInsightQueue.querySelectorAll('[data-ai-open-tickets]').forEach(btn => {
      btn.addEventListener('click', () => {
        const insightId = btn.getAttribute('data-ai-open-tickets');
        const insight = (dashboard.insights || []).find(i => i.insight_id === insightId);
        if (!insight) return;
        const ids = (insight.evidence || [])
          .map(ev => (ev && typeof ev === 'object' ? ev.ticket_id || ev.id : ''))
          .filter(Boolean);
        if (!ids.length) {
          UI.toast('No linked ticket references found.');
          return;
        }
        this.openTicketByRef(ids[0]);
        if (ids.length > 1) UI.toast(`Opened 1 of ${ids.length} linked tickets.`);
      });
    });

    E.aiInsightQueue.querySelectorAll('[data-ai-evidence]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('article');
        const details = card?.querySelector('details');
        if (!details) return;
        details.open = true;
        details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }
};


async function applySuggestedCategory(label) {
  if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can apply ticket category suggestions.'))
    return;

  const list = UI.Issues.applyFilters();
  const candidates = list.filter(issue => {
    if (issue.type && issue.type.trim()) return false;
    const meta = DataStore.computed.get(issue.id) || {};
    const suggestions = meta.suggestions?.categories || [];
    return suggestions.some(c => c.label === label);
  });

  if (!candidates.length) {
    UI.toast(`No untagged tickets match "${label}" in this view.`);
    return;
  }

  UI.spinner(true);
  let updated = 0;
  for (const issue of candidates) {
    const updatedIssue = { ...issue, type: label };
    const saved = await saveTicketRecord(updatedIssue, Session.authContext(), { silent: true });
    if (saved) {
      applyIssueUpdate({ ...updatedIssue, ...saved });
      updated++;
    }
  }
  UI.spinner(false);

  Analytics.refresh(UI.Issues.applyFilters());
  UI.toast(`Applied "${label}" to ${updated} ticket${updated === 1 ? '' : 's'}.`);
}

function buildClustersWeighted(list) {
  const max = Math.min(list.length, 400);
  const docs = list.slice(-max).map(r => {
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
    all.forEach(t => {
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
      c.forEach(d => d.tokens.forEach(t => freq.set(t, (freq.get(t) || 0) + 1)));
      const sig = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t)
        .join(' ');
      clusters.push({ signature: sig, issues: c.map(x => x.issue) });
    }
  }
  clusters.sort((a, b) => b.issues.length - a.issues.length);
  return clusters.slice(0, 6);
}

function getReadinessChecklistState() {
  const checks = {};
  U.qAll('[data-readiness]').forEach(input => {
    const key = input.getAttribute('data-readiness');
    if (key) checks[key] = !!input.checked;
  });
  return checks;
}

function setReadinessChecklistState(state = {}) {
  U.qAll('[data-readiness]').forEach(input => {
    const key = input.getAttribute('data-readiness');
    if (!key) return;
    input.checked = !!state[key];
  });
  updateChecklistStatus(state);
}

function readinessProgress(readiness = {}) {
  const keys = Object.keys(readiness);
  if (!keys.length) return { done: 0, total: 0 };
  const done = keys.filter(k => readiness[k]).length;
  return { done, total: keys.length };
}

function updateChecklistStatus(readiness = {}) {
  if (!E.eventChecklistStatus) return;
  const normalized =
    readiness && Object.keys(readiness).length ? readiness : getReadinessChecklistState();
  const state = readinessProgress(normalized);
  if (!state.total) {
    E.eventChecklistStatus.textContent = 'Checklist completion: 0/0';
    return;
  }
  E.eventChecklistStatus.textContent = `Checklist completion: ${state.done}/${state.total}`;
}

/** Modals */
UI.Modals = {
  selectedIssue: null,
  lastFocus: null,
  lastEventFocus: null,
  openIssue(id) {
    const r = DataStore.byId.get(id);
    if (!r || !E.issueModal) return;
    this.selectedIssue = r;
    const routeTicketId = getTicketBusinessId(r) || String(id || '').trim();
    if (routeTicketId) setAppHashRoute(`#tickets?ticket_id=${encodeURIComponent(routeTicketId)}`);
    this.lastFocus = document.activeElement;
    const ticketId = U.escapeHtml(issueDisplayId(r) || '-');
    const personName = U.escapeHtml(r.name || 'Unknown');
    const personInitial = U.escapeHtml((r.name || '?').trim().charAt(0).toUpperCase() || '?');
    const title = U.escapeHtml(r.title || 'Untitled ticket');
    const description = U.escapeHtml(r.desc || '-');
    const status = U.escapeHtml(r.status || '-');
    const priority = U.escapeHtml(r.priority || '-');
    const moduleName = U.escapeHtml(r.module || '-');
    const department = U.escapeHtml(r.department || '-');
    const dateValue = U.escapeHtml(U.formatDateTimeMMDDYYYYHHMM(r.date));
    const requesterEmail = U.escapeHtml(r.email || r.emailAddressee || '-');
    const category = U.escapeHtml(r.type || '-');
    const logValue = U.escapeHtml(r.log || '—');
    const youtrackReference = U.escapeHtml(r.youtrackReference || '—');
    const devTeamStatus = U.escapeHtml(r.devTeamStatus || '—');
    const issueRelated = U.escapeHtml(r.issueRelated || '—');
    const devTeamStatusBadge = `<span class="pill dev-team-${U.toTagClass(
      r.devTeamStatus || ''
    )}">${devTeamStatus}</span>`;
    const issueRelatedBadges = String(r.issueRelated || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
      .map(
        v => `<span class="pill issue-related-${U.toTagClass(v)}">${U.escapeHtml(v)}</span>`
      )
      .join(' ');
    const notesValue = U.escapeHtml(r.notes || '—');

    E.modalTitle.textContent = `TICKET:${issueDisplayId(r) || '-'}`;
    const internalMetaHtml = ColumnManager.isColumnAllowed('youtrackReference')
      ? `
            <p class="ticket-meta-item"><span class="ticket-label">🔗 YouTrack Ref:</span> <span>${youtrackReference}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">🧑‍💻 Dev Team Status:</span> <span>${devTeamStatusBadge}</span></p>
      `
      : '';
    const internalSectionsHtml = ColumnManager.isColumnAllowed('issueRelated')
      ? `
        <section class="ticket-description">
          <h5>Ticket Related</h5>
          <p>${issueRelatedBadges || issueRelated}</p>
        </section>
      `
      : '';
    const internalNotesHtml = ColumnManager.isColumnAllowed('notes')
      ? `
        <section class="ticket-description">
          <h5>Notes</h5>
          <p>${notesValue}</p>
        </section>
      `
      : '';

    E.modalBody.innerHTML = `
      <article class="ticket-detail">
        <section class="ticket-hero">
          <div class="ticket-person">
            <div class="ticket-avatar">${personInitial}</div>
            <div>
              <div class="ticket-id">TICKET:${ticketId}</div>
              <h3>${personName}</h3>
            </div>
          </div>
          <div class="ticket-status-pill">${status}</div>
        </section>

        <section class="ticket-title-row">
          <h4>${title}</h4>
          <span class="ticket-priority-pill">🔥 Priority: ${priority}</span>
        </section>

        <section class="ticket-grid">
          <div class="ticket-col">
            <p class="ticket-meta-item"><span class="ticket-label">🗓 Date:</span> <span>${dateValue}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">👤 Name:</span> <span>${personName}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">🏢 Department:</span> <span>${department}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">📦 Module:</span> <span>${moduleName}</span></p>
          </div>
          <div class="ticket-col">
            <p class="ticket-meta-item"><span class="ticket-label">🏷 Category:</span> <span>${category}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">📧 Email Address:</span> <span>${requesterEmail}</span></p>
            <p class="ticket-meta-item"><span class="ticket-label">📌 Status:</span> <span>${status}</span></p>
            ${internalMetaHtml}
            <p class="ticket-meta-item"><span class="ticket-label">🆔 Ticket #:</span> <span>${ticketId}</span></p>
          </div>
        </section>

        <section class="ticket-description">
          <h5>Description</h5>
          <p>${description}</p>
        </section>

        ${internalSectionsHtml}
        ${internalNotesHtml}

        <section class="ticket-log">
          <h5>Log</h5>
          <p>${logValue}</p>
        </section>
      </article>
    `;
    if (E.editIssueBtn) {
      E.editIssueBtn.disabled = !Permissions.canEditTicket();
      E.editIssueBtn.dataset.id = r.id || '';
    }
    if (E.replyRecipientLabel) E.replyRecipientLabel.textContent = `To: ${r.emailAddressee || r.email || '—'}`;
    E.issueModal.style.display = 'flex';
    E.exportIssuePdf?.focus();
  },
  closeIssue(options = {}) {
    if (!E.issueModal) return;
    E.issueModal.style.display = 'none';
    this.selectedIssue = null;
    IssueEditor.close();
    if (options?.userInitiated) setAppHashRoute('#tickets');
    if (this.lastFocus?.focus) this.lastFocus.focus();
  },
  async openEvent(ev) {
    this.lastEventFocus = document.activeElement;
    const isEdit = !!(ev && ev.id);
    const canManageEvents = Permissions.canManageEvents();
    if (E.eventForm) E.eventForm.dataset.id = isEdit ? ev.id : '';
    if (E.eventModalTitle)
      E.eventModalTitle.textContent = canManageEvents
        ? isEdit
          ? 'Edit Event'
          : 'New Event'
        : 'Event Details';
    if (E.eventDelete) E.eventDelete.style.display = canManageEvents && isEdit ? 'inline-flex' : 'none';

    const allDay = !!ev.allDay;
    if (E.eventAllDay) E.eventAllDay.checked = allDay;

    if (E.eventTitle) E.eventTitle.value = ev.title || '';
    if (E.eventType) E.eventType.value = ev.type || 'Deployment';
    if (E.eventEnv) E.eventEnv.value = ev.env || 'Prod';
    if (E.eventStatus) E.eventStatus.value = ev.status || 'Planned';
    if (E.eventOwner) E.eventOwner.value = ev.owner || '';
    if (E.eventModules) {
      const val = Array.isArray(ev.modules)
        ? ev.modules.join(', ')
        : ev.modules || '';
      E.eventModules.value = val;
    }
    if (E.eventImpactType)
      E.eventImpactType.value = ev.impactType || 'No downtime expected';
    if (E.eventIssueSearch) E.eventIssueSearch.value = '';
    EVENT_TICKET_PICKER_SHOW_ALL = false;
    const selectedTicketIds = parseTicketIds(ev.ticketIds || ev.issueId || ev.ticketId);
    try {
      await ensureTicketsForEventPicker();
    } catch (error) {
      console.warn('[event-ticket-picker] unable to load tickets', error);
    }
    refreshEventTicketSelect(selectedTicketIds);

    if (E.eventStart) {
      E.eventStart.type = allDay ? 'date' : 'datetime-local';
      E.eventStart.value = ev.start
        ? allDay
          ? toLocalDateValue(ev.start)
          : toLocalInputValue(ev.start)
        : '';
    }
    if (E.eventEnd) {
      E.eventEnd.type = allDay ? 'date' : 'datetime-local';
      E.eventEnd.value = ev.end
        ? allDay
          ? toLocalDateValue(ev.end)
          : toLocalInputValue(ev.end)
        : '';
    }
    if (E.eventDescription) E.eventDescription.value = ev.description || '';

    setReadinessChecklistState(ev.readiness || ev.checklist || {});
    
    if (E.eventIssueLinkedInfo) {
      const issueIdStr = (selectedTicketIds || []).join(', ');
      if (issueIdStr) {
        const ids = issueIdStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const uniqueIds = Array.from(new Set(ids));
        const issues = uniqueIds
          .map(id => DataStore.byId.get(id))
          .filter(Boolean);

        E.eventIssueLinkedInfo.style.display = 'block';

        if (issues.length) {
          const items = issues
            .slice(0, 3)
            .map(issue => {
              const meta = DataStore.computed.get(issue.id) || {};
              const r = meta.risk?.total || 0;
              const badgeClass = r
                ? CalendarLink.riskBadgeClass(r)
                : '';
              return `
                <li>
                  <button type="button" class="btn sm" data-open-issue="${U.escapeAttr(
                    issue.id
                  )}">${U.escapeHtml(issueDisplayId(issue) || issue.id)}</button>
                  ${U.escapeHtml(issue.title || '')}
                  ${
                    r
                      ? `<span class="event-risk-badge ${badgeClass}">RISK ${r}</span>`
                      : ''
                  }
                </li>`;
            })
            .join('');

          const extra = uniqueIds.length - issues.length;
          const extraHtml =
            extra > 0
              ? `<li class="muted">${extra} linked ID(s) not in current dataset</li>`
              : '';

          const more =
            uniqueIds.length > issues.length
              ? uniqueIds
                  .filter(id => !issues.find(i => i.id === id))
                  .join(', ')
              : '';

          E.eventIssueLinkedInfo.innerHTML = `
            Linked ticket(s):
            <ul style="margin:4px 0 0 18px;padding:0;font-size:12px;">
              ${items}
              ${extraHtml}
            </ul>
            ${
              more
                ? `<div class="muted" style="margin-top:4px;">Missing from dataset: ${U.escapeHtml(
                    more
                  )}</div>`
                : ''
            }
          `;
        } else {
          E.eventIssueLinkedInfo.innerHTML = `Linked ticket ID(s): ${U.escapeHtml(
            issueIdStr
          )} (not found in current dataset)`;
        }

        E.eventIssueLinkedInfo
          .querySelectorAll('[data-open-issue]')
          .forEach(btn => {
            btn.addEventListener('click', () => {
              const id = btn.getAttribute('data-open-issue');
              UI.Modals.openIssue(id);
            });
          });
      } else {
        E.eventIssueLinkedInfo.style.display = 'none';
        E.eventIssueLinkedInfo.textContent = '';
      }
    }

    if (E.eventModal) {
      E.eventModal.style.display = 'flex';
    if (window.setAppHashRoute && window.buildRecordHashRoute) setAppHashRoute(buildRecordHashRoute('events', ev || {}));
      if (!canManageEvents && E.eventForm) {
        E.eventForm
          .querySelectorAll('input,select,textarea,button[type="submit"]')
          .forEach(el => {
            if (el.id === 'eventCancel') return;
            if (el.id === 'eventModalClose') return;
            el.disabled = true;
          });
      } else if (E.eventForm) {
        E.eventForm.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(el => {
          el.disabled = false;
        });
      }
      (E.eventIssueSearch || E.eventTitle)?.focus();
    }
  },
  closeEvent() {
    if (!E.eventModal) return;
    E.eventModal.style.display = 'none';
    if (E.eventForm) E.eventForm.dataset.id = '';
    if (window.setAppHashRoute) setAppHashRoute('#events');
    if (this.lastEventFocus?.focus) this.lastEventFocus.focus();
  }
};

const IssueEditor = {
  issue: null,
  isOpening: false,
  isSaving: false,
  DEV_TEAM_STATUS_OPTIONS: [
    'Pending',
    'Under Review',
    'Under Development',
    'In QA',
    'Ready for Production',
    'Production',
    'Blocked',
    'Done',
    'Rejected'
  ],
  ISSUE_RELATED_OPTIONS: [
    'Backend',
    'Frontend',
    'Database',
    'PWA / Notifications',
    'Workflow',
    'Permissions',
    'Analytics',
    'UI / UX',
    'Other'
  ],
  syncSelectOptions(selectEl, values = [], selected = '', placeholder = 'Select option') {
    if (!selectEl) return;
    const uniqueValues = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
    const hasSelected = selected && uniqueValues.includes(selected);
    const finalValues = hasSelected ? uniqueValues : uniqueValues.concat(selected ? [selected] : []);
    selectEl.innerHTML = [`<option value="">${U.escapeHtml(placeholder)}</option>`]
      .concat(finalValues.map(v => `<option value="${U.escapeAttr(v)}">${U.escapeHtml(v)}</option>`))
      .join('');
    selectEl.value = selected || '';
  },
  syncMultiSelectOptions(selectEl, values = [], selectedValues = []) {
    if (!selectEl) return;
    const uniqueValues = [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
    const selectedSet = new Set(
      (Array.isArray(selectedValues) ? selectedValues : [])
        .map(v => String(v || '').trim())
        .filter(Boolean)
    );
    selectEl.innerHTML = uniqueValues
      .map(v => `<option value="${U.escapeAttr(v)}">${U.escapeHtml(v)}</option>`)
      .join('');
    Array.from(selectEl.options).forEach(option => {
      option.selected = selectedSet.has(option.value);
    });
  },
  parseIssueRelatedSelections(value = '') {
    return String(value || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
  },
  getSelectedMultiValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions || [])
      .map(option => String(option.value || '').trim())
      .filter(Boolean);
  },
  syncIssueDropdowns(selectedDevTeamStatus = '', selectedIssueRelated = '') {
    const rows = Array.isArray(DataStore.rows) ? DataStore.rows : [];
    const devTeamStatusValues = this.DEV_TEAM_STATUS_OPTIONS.concat(
      rows.map(r => r.devTeamStatus)
    );
    this.syncSelectOptions(
      E.editIssueDevTeamStatus,
      devTeamStatusValues,
      selectedDevTeamStatus,
      'Select dev team status'
    );
    this.syncMultiSelectOptions(
      E.editIssueRelated,
      this.ISSUE_RELATED_OPTIONS,
      this.parseIssueRelatedSelections(selectedIssueRelated)
    );
  },
  syncCategoryOptions(selected = '') {
    if (!E.editIssueType) return;
    const categories = buildIssueCategoryOptions(selected ? [selected] : []);
    E.editIssueType.innerHTML = ['<option value="">Select category</option>']
      .concat(categories.map(v => `<option value="${U.escapeAttr(v)}">${U.escapeHtml(v)}</option>`))
      .join('');
    if (selected && categories.includes(selected)) {
      E.editIssueType.value = selected;
    } else {
      E.editIssueType.value = '';
    }
  },
  open(issue) {
    if (!issue || !E.editIssueModal) return;
    this.issue = issue;
    const identity = TicketCreator.resolveCurrentIdentity();
    console.info('[IssueEditor] ticket form opened', { mode: 'edit', ticketId: issue.id || issue.ticket_id || '' });

    const setVal = (el, val = '') => {
      if (el) el.value = val || '';
    };

    setVal(E.editIssueTitleInput, issue.title || '');
    setVal(E.editIssueDesc, issue.desc || '');
    setVal(E.editIssueModule, issue.module || '');
    setVal(E.editIssuePriority, issue.priority || '');
    setVal(E.editIssueStatus, issue.status || '');
    this.syncCategoryOptions(issue.type || '');
    setVal(E.editIssueDepartment, issue.department || identity.department || '');
    setVal(E.editIssueName, issue.name || identity.name || '');
    setVal(E.editIssueEmail, issue.emailAddressee || identity.email || '');
    setVal(E.editIssueYoutrackReference, issue.youtrackReference || '');
    this.syncIssueDropdowns(issue.devTeamStatus || '', issue.issueRelated || '');
    setVal(E.editIssueFile, issue.file || '');

    if (E.editIssueDate) {
      const d = issue.date ? new Date(issue.date) : null;
      setVal(E.editIssueDate, d && !isNaN(d) ? toLocalDateValue(d) : '');
    }

    E.editIssueModal.style.display = 'flex';
    E.editIssueTitleInput?.focus?.();
  },
  close() {
    if (E.editIssueModal) E.editIssueModal.style.display = 'none';
    this.issue = null;
  },
  collectForm() {
    if (!this.issue) return null;
    return {
      id: this.issue.id,
      ticket_id: this.issue.ticket_id || '',
      title: (E.editIssueTitleInput?.value || '').trim(),
      desc: (E.editIssueDesc?.value || '').trim(),
      module: (E.editIssueModule?.value || '').trim() || 'Unspecified',
      priority: E.editIssuePriority?.value || '',
      status: E.editIssueStatus?.value || '',
      type: (E.editIssueType?.value || '').trim(),
      department: (E.editIssueDepartment?.value || '').trim(),
      name: (E.editIssueName?.value || '').trim(),
      emailAddressee: (E.editIssueEmail?.value || '').trim(),
      notificationSent: this.issue.notificationSent || '',
      notificationUnderReview: this.issue.notificationUnderReview || '',
      youtrackReference: (E.editIssueYoutrackReference?.value || '').trim(),
      devTeamStatus: (E.editIssueDevTeamStatus?.value || '').trim(),
      issueRelated: this.getSelectedMultiValues(E.editIssueRelated).join(', '),
      notes: this.issue.notes || '',
      log: this.issue.log || '',
      file: (E.editIssueFile?.value || '').trim(),
      date: E.editIssueDate?.value || ''
    };
  }
};

const TicketCreator = {
  isSubmitting: false,
  getCurrentUserDisplayName() {
    const authUser = Session.user?.() || {};
    const profile = authUser.profile || {};
    const sessionUser = authUser.user || {};
    const rawName =
      String(profile.name || profile.full_name || authUser.name || sessionUser?.user_metadata?.full_name || '').trim();
    if (rawName) return rawName;
    const username = String(profile.username || authUser.username || sessionUser?.user_metadata?.username || '').trim();
    if (username) return username;
    const email = String(profile.email || authUser.email || sessionUser.email || '').trim();
    return email.includes('@') ? email.split('@')[0] : '';
  },
  getCurrentUserEmail() {
    const authUser = Session.user?.() || {};
    const profile = authUser.profile || {};
    const sessionUser = authUser.user || {};
    return String(profile.email || authUser.email || sessionUser.email || '').trim();
  },
  getCurrentUserRole() {
    const authUser = Session.user?.() || {};
    const profile = authUser.profile || {};
    return String(profile.role_key || authUser.role || Session.role?.() || '').trim().toLowerCase();
  },
  formatRoleLabel(role = '') {
    return String(role || '')
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  },
  roleToDepartment(role = '') {
    const key = String(role || '').trim().toLowerCase();
    const map = {
      admin: 'Administration',
      viewer: 'Operations',
      hoo: 'Operations',
      dev: 'Development',
      sales_executive: 'Sales',
      financial_controller: 'Finance',
      gm: 'Management',
      accountant: 'Finance',
      csm: 'Customer Success'
    };
    if (map[key]) return map[key];
    const fallbackLabel = this.formatRoleLabel(key);
    return fallbackLabel || 'General';
  },
  resolveCurrentIdentity() {
    const name = this.getCurrentUserDisplayName();
    const email = this.getCurrentUserEmail();
    const role = this.getCurrentUserRole();
    const department = this.roleToDepartment(role);
    console.info('[TicketCreator] resolved current user name/email/role', { name, email, role });
    console.info('[TicketCreator] resolved department', { role, department });
    return { name, email, role, department };
  },
  applyIdentityFieldAccess() {
    const isAdmin = Boolean(Session.isAdmin?.());
    [E.createTicketName, E.createTicketEmail, E.createTicketDepartment].forEach(el => {
      if (!el) return;
      el.readOnly = !isAdmin;
      el.setAttribute('aria-readonly', !isAdmin ? 'true' : 'false');
    });
  },
  prefillIdentityFields({ preserveExisting = false } = {}) {
    const identity = this.resolveCurrentIdentity();
    const apply = (el, value) => {
      if (!el) return;
      if (preserveExisting && String(el.value || '').trim()) return;
      el.value = value || '';
    };
    apply(E.createTicketName, identity.name);
    apply(E.createTicketEmail, identity.email);
    apply(E.createTicketDepartment, identity.department);
    return identity;
  },
  open() {
    if (!E.createTicketModal) return;
    console.info('[TicketCreator] ticket form opened', { mode: 'create' });
    this.syncCategoryOptions();
    if (E.createTicketForm) E.createTicketForm.reset();
    this.applyIdentityFieldAccess();
    this.prefillIdentityFields();
    if (E.createTicketPriority) E.createTicketPriority.value = 'Medium';
    E.createTicketModal.style.display = 'flex';
    E.createTicketSubject?.focus?.();
  },
  close() {
    if (E.createTicketModal) E.createTicketModal.style.display = 'none';
  },
  syncCategoryOptions(selected = '') {
    if (!E.createTicketType) return;
    const categories = buildIssueCategoryOptions(selected ? [selected] : []);
    E.createTicketType.innerHTML = ['<option value="">Select category</option>']
      .concat(categories.map(v => `<option value="${U.escapeAttr(v)}">${U.escapeHtml(v)}</option>`))
      .join('');
    E.createTicketType.value = selected || '';
  },
  buildPayload() {
    const now = new Date().toISOString();
    const identity = this.prefillIdentityFields({ preserveExisting: true });
    return {
      name: (E.createTicketName?.value || '').trim() || identity.name,
      department: (E.createTicketDepartment?.value || '').trim() || identity.department,
      module: (E.createTicketModule?.value || '').trim() || 'Unspecified',
      impactedModule: (E.createTicketModule?.value || '').trim() || 'Unspecified',
      title: (E.createTicketSubject?.value || '').trim(),
      description: (E.createTicketDesc?.value || '').trim(),
      desc: (E.createTicketDesc?.value || '').trim(),
      category: (E.createTicketType?.value || '').trim(),
      type: (E.createTicketType?.value || '').trim(),
      priority: (E.createTicketPriority?.value || '').trim(),
      emailAddressee: (E.createTicketEmail?.value || '').trim() || identity.email,
      email: (E.createTicketEmail?.value || '').trim() || identity.email,
      file: (E.createTicketFile?.value || '').trim(),
      link: (E.createTicketFile?.value || '').trim(),
      status: 'new',
      date: now
    };
  }
};

async function createTicketInDatabase(ticketPayload) {
  const variants = [
    { body: { ticket: ticketPayload }, label: 'ticket envelope' },
    { body: { issue: ticketPayload }, label: 'issue envelope' },
    { body: { payload: ticketPayload }, label: 'payload envelope' },
    { body: { ...ticketPayload }, label: 'flat payload' }
  ];
  let lastError = null;
  for (const variant of variants) {
    try {
      return await Api.requestWithSession('tickets', 'create', variant.body, { requireAuth: true });
    } catch (error) {
      if (isAuthError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('Ticket create rejected by backend.');
}

function setButtonPendingState(buttonEl, isPending, pendingText, idleText) {
  if (!buttonEl) return;
  if (!buttonEl.dataset.defaultLabel) {
    buttonEl.dataset.defaultLabel = idleText || buttonEl.textContent.trim();
  }
  const defaultLabel = buttonEl.dataset.defaultLabel;
  buttonEl.disabled = !!isPending;
  buttonEl.setAttribute('aria-busy', isPending ? 'true' : 'false');
  buttonEl.textContent = isPending ? pendingText : defaultLabel;
}

function debugTicketCreateLog(label, payload) {
  try {
    const host = String(window.location.hostname || '').toLowerCase();
    if (window.RUNTIME_CONFIG?.DEBUG_API || host === 'localhost' || host === '127.0.0.1') {
      console.log(`[tickets/create] ${label}`, payload);
    }
  } catch {}
}

const BulkEditor = {
  parseIds(raw = '') {
    return Array.from(
      new Set(
        String(raw || '')
          .split(/[\n,]/g)
          .map(v => v.trim())
          .filter(Boolean)
      )
    );
  },
  open() {
    if (!E.bulkEditModal) return;
    if (E.bulkIssueIds) {
      const filtered = UI.Issues.applyFilters().map(r => r.id).filter(Boolean);
      E.bulkIssueIds.value = filtered.slice(0, 30).join(', ');
    }
    IssueEditor.syncSelectOptions(
      E.bulkDevTeamStatus,
      IssueEditor.DEV_TEAM_STATUS_OPTIONS.concat((DataStore.rows || []).map(r => r.devTeamStatus)),
      '',
      'Keep current'
    );
    if (E.bulkPriority) E.bulkPriority.value = '';
    if (E.bulkStatus) E.bulkStatus.value = '';
    if (E.bulkNotes) E.bulkNotes.value = '';
    E.bulkEditModal.style.display = 'flex';
    E.bulkIssueIds?.focus?.();
  },
  close() {
    if (E.bulkEditModal) E.bulkEditModal.style.display = 'none';
  }
};

function buildIssueReplyMail(issue) {
  const khaledEmail = 'khaled.yakan@incheck360.nl';
  const toEmail = khaledEmail;
  const safeTitle = issue?.title || '(no title)';
  const subject = `Re: Ticket ${issue?.id || ''} - ${safeTitle}`.trim();
  const body =
    `Hi,\n\n` +
    `Regarding ticket ${issue?.id || '-'} (${safeTitle}),\n\n` +
    `[Write your reply here]\n\n` +
    `Best regards,`;

  return {
    toEmail,
    subject,
    body
  };
}

function openReplyComposerForIssue(issue) {
  if (!issue) {
    UI.toast('Open a ticket first.');
    return;
  }

  const mail = buildIssueReplyMail(issue);

  const outlookCompose = new URL('https://outlook.office.com/mail/deeplink/compose');
  outlookCompose.searchParams.set('to', mail.toEmail);
  outlookCompose.searchParams.set('subject', mail.subject);
  outlookCompose.searchParams.set('body', mail.body);

  window.open(outlookCompose.toString(), '_blank', 'noopener,noreferrer');
}

function applyIssueUpdate(savedIssue) {
  if (!savedIssue) return;

  const normalized = normalizeIssueForStore(savedIssue, {
    includeRestrictedFields: Permissions.isAdminLike()
  });

  const rows = DataStore.rows.slice();
  const idx = rows.findIndex(r => r.id === normalized.id);

  if (idx === -1) rows.push(normalized);
  else rows[idx] = { ...rows[idx], ...normalized };

  DataStore.hydrateFromRows(rows);
  IssuesCache.save(DataStore.rows);

  const fresh = DataStore.byId.get(normalized.id) || normalized;

  if (UI.Modals?.selectedIssue?.id === fresh.id) {
    UI.Modals.selectedIssue = fresh;
  }

  if (IssueEditor?.issue?.id === fresh.id) {
    IssueEditor.issue = fresh;
  }

  if (E.editIssueBtn && String(E.editIssueBtn.dataset.id || '') === String(fresh.id || '')) {
    E.editIssueBtn.dataset.id = fresh.id || '';
  }
}

async function onEditIssueSubmit(event) {
  event.preventDefault();
  if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can edit tickets.')) return;
  if (IssueEditor.isSaving) return;

  const id = (IssueEditor.issue?.id || '').trim();
  const title = (E.editIssueTitleInput?.value || '').trim();
  const description = (E.editIssueDesc?.value || '').trim();
  const module = (E.editIssueModule?.value || '').trim();
  const priority = E.editIssuePriority?.value || '';
  const status = E.editIssueStatus?.value || '';
  const type = (E.editIssueType?.value || '').trim();
  const department = (E.editIssueDepartment?.value || '').trim();
  const name = (E.editIssueName?.value || '').trim();
  const emailAddressee = (E.editIssueEmail?.value || '').trim();
  const notificationSent = IssueEditor.issue?.notificationSent || '';
  const notificationUnderReview = IssueEditor.issue?.notificationUnderReview || '';
  const youtrackReference = (E.editIssueYoutrackReference?.value || '').trim();
  const devTeamStatus = (E.editIssueDevTeamStatus?.value || '').trim();
  const issueRelated = IssueEditor.getSelectedMultiValues(E.editIssueRelated).join(', ');
  const notes = IssueEditor.issue?.notes || '';
  const log = IssueEditor.issue?.log || '';
  const link = (E.editIssueFile?.value || '').trim();
  const date = E.editIssueDate?.value || '';

  const missingFields = [];
  if (!id) missingFields.push('Ticket ID');
  if (!title) missingFields.push('Title');
  if (!description) missingFields.push('Description');
  if (!module) missingFields.push('Module');
  if (!priority) missingFields.push('Priority');
  if (!status) missingFields.push('Status');

  if (missingFields.length) {
    console.warn('Edit blocked: missing fields', missingFields);
    UI.toast(`Please fill the required fields: ${missingFields.join(', ')}`);
    return;
  }

const issueUpdate = {
    id,
    title,
     desc: description,
    module,
    priority,
    status,
    type,
    department,
    name,
    emailAddressee,
    notificationSent,
    notificationUnderReview,
    youtrackReference,
    devTeamStatus,
    issueRelated,
    notes,
    log,
  file: link,
    date
  };

  IssueEditor.isSaving = true;
  const saveButton = event.target?.querySelector('button[type="submit"]');
  setButtonPendingState(saveButton, true, 'Saving...');
  try {
    const updatedIssue = await saveTicketRecord(issueUpdate, Session.authContext());
    if (!updatedIssue) {
      throw new Error('Ticket update did not return a response.');
    }

    applyIssueUpdate(updatedIssue);
    console.log('[ticket update] applied fresh issue', DataStore.byId.get(updatedIssue.id));

    const freshUpdatedIssue = DataStore.byId.get(updatedIssue.id) || updatedIssue;
    UI.Modals.selectedIssue = freshUpdatedIssue;
    IssueEditor.issue = freshUpdatedIssue;

    IssueEditor.close();
    UI.Modals.closeIssue();
    UI.refreshAll();
  } catch (error) {
    console.error('Failed to update ticket', error);
    UI.toast(`Failed to update ticket: ${error.message}`);
  } finally {
    IssueEditor.isSaving = false;
    setButtonPendingState(saveButton, false, 'Saving...');
  }
}

async function onBulkEditSubmit(event) {
  event.preventDefault();
  if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can bulk edit tickets.')) return;

  const ticketIds = BulkEditor.parseIds(E.bulkIssueIds?.value || '');
  const patch = {
    priority: E.bulkPriority?.value || '',
    status: E.bulkStatus?.value || '',
    devTeamStatus: (E.bulkDevTeamStatus?.value || '').trim(),
    notes: (E.bulkNotes?.value || '').trim()
  };
  const changedKeys = Object.keys(patch).filter(key => patch[key]);

  if (!ticketIds.length) {
    UI.toast('Enter at least one ticket ID.');
    return;
  }
  if (!changedKeys.length) {
    UI.toast('Choose at least one field to update.');
    return;
  }

  let success = 0;
  const failures = [];
  UI.spinner(true);
  try {
    for (const id of ticketIds) {
      const baseIssue = DataStore.byId.get(id);
      if (!baseIssue) {
        failures.push(`${id} (not found in dataset)`);
        continue;
      }
      const payload = {
        ...baseIssue,
        ...patch,
        id
      };
      try {
        const updated = await saveTicketRecord(payload, Session.authContext(), { silent: true });
        if (!updated) throw new Error('No response');
        applyIssueUpdate(updated);
        success += 1;
      } catch (error) {
        failures.push(`${id} (${error.message})`);
      }
    }
  } finally {
    UI.spinner(false);
  }

  BulkEditor.close();
  UI.refreshAll();
  if (!failures.length) {
    UI.toast(`Bulk update completed: ${success} ticket(s) updated.`);
    return;
  }
  UI.toast(`Bulk update done: ${success} updated, ${failures.length} failed.`);
  console.error('Bulk update failures', failures);
}


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


function ensureNotificationSetupMounted() {
  const card = document.getElementById('notificationSetupCard');
  const mount = document.getElementById('notificationSetupStandaloneMount');
  if (card && mount && card.parentElement !== mount) {
    mount.appendChild(card);
  }
  if (card) {
    card.style.display = Permissions.canManageNotificationSettings() ? '' : 'none';
  }
}
function setActiveView(view) {
 const names = ['issues', 'calendar', 'insights', 'csm', 'company', 'contacts', 'leads', 'deals', 'proposals', 'agreements', 'operationsOnboarding', 'technicalAdmin', 'invoices', 'receipts', 'lifecycleAnalytics', 'clients', 'proposalCatalog', 'notifications', 'notificationSetup', 'workflow', 'users', 'rolePermissions'];
 const firstAllowedView = names.find(name => Permissions.canAccessTab(name)) || 'issues';
 if (!Permissions.canAccessTab(view)) view = firstAllowedView;
  names.forEach(name => {
    const tab =
      name === 'issues'
        ? E.issuesTab
        : name === 'calendar'
        ? E.calendarTab
        : name === 'insights'
        ? E.insightsTab
        : name === 'csm'
        ? E.csmTab
        : name === 'company'
        ? E.companyTab
        : name === 'contacts'
        ? E.contactsTab
        : name === 'leads'
        ? E.leadsTab
        : name === 'deals'
        ? E.dealsTab
        : name === 'proposals'
        ? E.proposalsTab
        : name === 'agreements'
        ? E.agreementsTab
        : name === 'operationsOnboarding'
        ? E.operationsOnboardingTab
        : name === 'technicalAdmin'
        ? E.technicalAdminTab
        : name === 'invoices'
        ? E.invoicesTab
        : name === 'receipts'
        ? E.receiptsTab
        : name === 'lifecycleAnalytics'
        ? E.lifecycleAnalyticsTab
        : name === 'clients'
        ? E.clientsTab
        : name === 'proposalCatalog'
        ? E.proposalCatalogTab
        : name === 'notifications'
        ? E.notificationsTab
        : name === 'notificationSetup'
        ? E.notificationSetupTab
        : name === 'workflow'
        ? E.workflowTab
        : name === 'users'
        ? E.usersTab
        : E.rolePermissionsTab;
    const panel =
      name === 'issues'
        ? E.issuesView
        : name === 'calendar'
        ? E.calendarView
        : name === 'insights'
        ? E.insightsView
        : name === 'csm'
        ? E.csmView
        : name === 'company'
        ? E.companyView
        : name === 'contacts'
        ? E.contactsView
        : name === 'leads'
        ? E.leadsView
        : name === 'deals'
        ? E.dealsView
        : name === 'proposals'
        ? E.proposalsView
        : name === 'agreements'
        ? E.agreementsView
        : name === 'operationsOnboarding'
        ? E.operationsOnboardingView
        : name === 'technicalAdmin'
        ? E.technicalAdminView
        : name === 'invoices'
        ? E.invoicesView
        : name === 'receipts'
        ? E.receiptsView
        : name === 'lifecycleAnalytics'
        ? E.lifecycleAnalyticsView
        : name === 'clients'
        ? E.clientsView
        : name === 'proposalCatalog'
        ? E.proposalCatalogView
        : name === 'notifications'
        ? E.notificationsView
        : name === 'notificationSetup'
        ? E.notificationSetupView
        : name === 'workflow'
        ? E.workflowView
        : name === 'users'
        ? E.usersView
        : E.rolePermissionsView;
    const active = name === view;
    if (tab) {
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if (panel) panel.classList.toggle('active', active);
  });
  try {
    localStorage.setItem(LS_KEYS.view, view);
  } catch {}
  const moduleHash = getAppHashForView(view);
  if (moduleHash) setAppHashRoute(moduleHash);
  if (E.app) E.app.classList.toggle('csm-filters-only', view === 'csm');
  if (E.mainFiltersPanel)
    E.mainFiltersPanel.style.display =
      view === 'leads' || view === 'deals' || view === 'proposals' || view === 'agreements' || view === 'operationsOnboarding' || view === 'technicalAdmin' || view === 'invoices' || view === 'receipts' || view === 'lifecycleAnalytics' || view === 'clients' || view === 'proposalCatalog' || view === 'notifications' || view === 'notificationSetup' || view === 'workflow' ? 'none' : '';
  if (E.leadsFiltersPanel) E.leadsFiltersPanel.style.display = view === 'leads' ? '' : 'none';
  if (E.dealsFiltersPanel) E.dealsFiltersPanel.style.display = view === 'deals' ? '' : 'none';
  const isForbiddenError = error => {
    if (typeof window.isPermissionError === 'function') return window.isPermissionError(error);
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('forbidden') || message.includes('permission denied');
  };
  const runViewLoader = (label, loader) => {
    try {
      const maybePromise = loader();
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch(error => {
          if (isForbiddenError(error)) {
            console.log('[startup] permission error preserved session', error?.message);
            console.warn(`[setActiveView] ${label} loader forbidden for current role; keeping session active.`, error);
            return;
          }
          console.error(`[setActiveView] ${label} loader failed`, error);
          UI.toast(`Unable to load ${label}. Other tabs remain available.`);
        });
      }
    } catch (error) {
      if (isForbiddenError(error)) {
        console.log('[startup] permission error preserved session', error?.message);
        console.warn(`[setActiveView] ${label} loader forbidden for current role; keeping session active.`, error);
        return;
      }
      console.error(`[setActiveView] ${label} loader failed`, error);
      UI.toast(`Unable to load ${label}. Other tabs remain available.`);
    }
  };
  if (view === 'calendar') {
    runViewLoader('calendar', () => {
      ensureCalendar();
      renderCalendarEvents();
      scheduleCalendarResize();
    });
  }
  if (view === 'insights') runViewLoader('insights', () => Analytics.refresh(UI.Issues.applyFilters()));
  if (view === 'csm') runViewLoader('csm', () => CSMActivity.loadAndRefresh());
  if (view === 'company' && window.Companies?.loadAndRefresh) runViewLoader('company', () => Companies.loadAndRefresh());
  if (view === 'contacts' && window.Contacts?.loadAndRefresh) runViewLoader('contacts', () => Contacts.loadAndRefresh());
  if (view === 'leads' && window.Leads?.loadAndRefresh) runViewLoader('leads', () => Leads.loadAndRefresh());
  if (view === 'deals' && window.Deals?.loadAndRefresh) runViewLoader('deals', () => Deals.loadAndRefresh());
  if (view === 'proposals' && window.Proposals?.loadAndRefresh) runViewLoader('proposals', () => Proposals.loadAndRefresh());
  if (view === 'agreements' && window.Agreements?.loadAndRefresh) runViewLoader('agreements', () => Agreements.loadAndRefresh());
  if (view === 'operationsOnboarding' && window.OperationsOnboarding?.loadAndRefresh) runViewLoader('operations onboarding', () => OperationsOnboarding.loadAndRefresh());
  if (view === 'technicalAdmin' && window.TechnicalAdmin?.loadAndRefresh) runViewLoader('technical admin', () => TechnicalAdmin.loadAndRefresh());
  if (view === 'invoices' && window.Invoices?.refresh) runViewLoader('invoices', () => Invoices.refresh());
  if (view === 'receipts' && window.Receipts?.refresh) runViewLoader('receipts', () => Receipts.refresh());
  if (view === 'lifecycleAnalytics' && window.LifecycleAnalytics?.init) runViewLoader('lifecycle analytics', () => LifecycleAnalytics.init());
  if (view === 'clients' && window.Clients?.loadAndRefresh) runViewLoader('clients', () => Clients.loadAndRefresh());
  if (view === 'proposalCatalog' && window.ProposalCatalog?.loadAndRefresh) runViewLoader('proposal catalog', () => ProposalCatalog.loadAndRefresh());
  if (view === 'notifications' && window.Notifications?.loadHub) runViewLoader('notifications', () => Notifications.loadHub(true));
  if (view === 'notificationSetup') {
    runViewLoader('notification setup', async () => {
      ensureNotificationSetupMounted();
      if (window.NotificationSetup?.load && Permissions.canManageNotificationSettings()) {
        await NotificationSetup.load(true);
      }
    });
  }
  if (view === 'workflow' && window.Workflow?.loadAndRefresh) runViewLoader('workflow', () => Workflow.loadAndRefresh(true));
  if (view === 'users' && window.UserAdmin?.refresh) runViewLoader('users', () => UserAdmin.refresh());
  if (view === 'rolePermissions' && window.RolesAdmin?.loadAll) {
    runViewLoader('roles and permissions', async () => {
      await RolesAdmin.loadAll();
      if (window.NotificationSetup?.load && Permissions.canManageNotificationSettings()) {
        await NotificationSetup.load();
      }
    });
  }
  updatePrimaryActionButton(view);
  if (E.app) {
    const appTop = E.app.getBoundingClientRect().top + window.scrollY - 10;
    window.scrollTo({ top: Math.max(0, appTop), behavior: 'smooth' });
  }
}

function updatePrimaryActionButton(activeView) {
  if (!E.createTicketBtn) return;
  const isCsm = activeView === 'csm';
  const isLeads = activeView === 'leads';
  const isAgreements = activeView === 'agreements';
  const isInvoices = activeView === 'invoices';
  E.createTicketBtn.innerHTML = isCsm
    ? '<span class="icon" aria-hidden="true">➕</span> Add activity'
    : isLeads
    ? '<span class="icon" aria-hidden="true">➕</span> Create Lead'
    : isAgreements
    ? '<span class="icon" aria-hidden="true">➕</span> Create Agreement'
    : isInvoices
    ? '<span class="icon" aria-hidden="true">➕</span> Create Invoice'
    : '<span class="icon" aria-hidden="true">➕</span> Create Ticket';
  E.createTicketBtn.setAttribute(
    'aria-label',
    isCsm ? 'Add activity' : isLeads ? 'Create lead' : isAgreements ? 'Create agreement' : isInvoices ? 'Create invoice' : 'Create new ticket'
  );
}

/* ---------- Calendar wiring ---------- */
let calendar = null,
calendarReady = false,
  calendarResizeTimer = null,
  calendarResizeObserver = null,
  calendarResizeObservedEl = null;

function wireCalendar() {
  if (E.addEventBtn)
    E.addEventBtn.addEventListener('click', () => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin/dev can create events.')) return;
      const now = new Date();
      UI.Modals.openEvent({
        start: now,
        end: new Date(now.getTime() + 60 * 60 * 1000),
        allDay: false,
        env: 'Prod',
        status: 'Planned'
      });
    });

  [E.eventFilterDeployment, E.eventFilterMaintenance, E.eventFilterRelease, E.eventFilterOther].forEach(
    input => {
      if (input) input.addEventListener('change', renderCalendarEvents);
    }
  );

  if (E.calendarTz) {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
      E.calendarTz.textContent = `Times shown in: ${tz}`;
    } catch {
      E.calendarTz.textContent = '';
    }
  }

  observeCalendarContainer();
  window.addEventListener('resize', scheduleCalendarResize);
}

function wireFreezeWindows() {
  const openModal = () => {
    if (!E.freezeModal) return;
    E.freezeModal.style.display = 'flex';
    renderFreezeWindows();
  };
  const closeModal = () => {
    if (!E.freezeModal) return;
    E.freezeModal.style.display = 'none';
  };

  [E.freezeManageBtn, E.freezeManageBtnSecondary].forEach(btn => {
    if (btn)
      btn.addEventListener('click', () => {
        if (!requirePermission(() => Permissions.canManageFreezeWindows(), 'Only admin can manage freeze windows.'))
          return;
        openModal();
      });
  });

  if (E.freezeModalClose) {
    E.freezeModalClose.addEventListener('click', closeModal);
  }

  if (E.freezeModal) {
    E.freezeModal.addEventListener('click', e => {
      if (e.target === E.freezeModal) closeModal();
    });
  }

  if (E.freezeForm) {
    E.freezeForm.addEventListener('submit', e => {
      e.preventDefault();
      if (!requirePermission(() => Permissions.canManageFreezeWindows(), 'Only admin can change freeze windows.'))
        return;
      const days = Array.from(
        E.freezeForm.querySelectorAll('.freeze-day-grid input[type="checkbox"]:checked')
      ).map(input => Number(input.value));

      const startValue = E.freezeStart?.value || '';
      const endValue = E.freezeEnd?.value || '';
      const startHour = startValue ? Number(startValue.split(':')[0]) : NaN;
      const endHour = endValue ? Number(endValue.split(':')[0]) : NaN;

      if (!days.length) {
        UI.toast('Select at least one day for the freeze window.');
        return;
      }
      if (Number.isNaN(startHour) || Number.isNaN(endHour)) {
        UI.toast('Provide valid start and end times.');
        return;
      }
      if (endHour <= startHour) {
        UI.toast('End time must be after start time.');
        return;
      }

      const nextWindow = {
        id: `fw_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        dow: days,
        startHour,
        endHour
      };

      DataStore.freezeWindows = [...getFreezeWindows(), nextWindow];
      saveFreezeWindowsCache();
      renderFreezeWindows();
      renderCalendarEvents();
      E.freezeForm.reset();
    });
  }

  if (E.freezeReset) {
    E.freezeReset.addEventListener('click', () => {
      if (!requirePermission(() => Permissions.canManageFreezeWindows(), 'Only admin can reset freeze windows.'))
        return;
      DataStore.freezeWindows = withFreezeIds(CONFIG.CHANGE.freezeWindows || []);
      saveFreezeWindowsCache();
      renderFreezeWindows();
      renderCalendarEvents();
    });
  }
}

function scheduleCalendarResize() {
  if (!calendar) return;
  clearTimeout(calendarResizeTimer);
  calendarResizeTimer = setTimeout(() => {
    if (calendar) calendar.updateSize();
  }, 120);
}

function observeCalendarContainer() {
  const el = document.getElementById('calendar');
  const card = el ? el.closest('.card') || el : null;

  if (!card) return;
  if (calendarResizeObservedEl === card) return;

  if (calendarResizeObserver) {
    calendarResizeObserver.disconnect();
  }

  calendarResizeObservedEl = card;
  calendarResizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.contentRect && entry.contentRect.width > 0) {
        scheduleCalendarResize();
        break;
      }
    }
  });

  calendarResizeObserver.observe(card);
}

function scheduleCalendarResize() {
  if (!calendar) return;
  clearTimeout(calendarResizeTimer);
  calendarResizeTimer = setTimeout(() => {
    if (calendar) calendar.updateSize();
  }, 120);
}

function ensureCalendar() {
  if (calendarReady) return;
  const el = document.getElementById('calendar');
  if (!el || typeof FullCalendar === 'undefined') {
    UI.toast('Events library failed to load');
    return;
  }
  calendar = new FullCalendar.Calendar(el, {
    initialView: 'dayGridMonth',
    selectable: true,
    editable: Permissions.canManageEvents(),
    height: 'auto',
    headerToolbar: {
      left: 'title',
      center: '',
      right: 'dayGridMonth,timeGridWeek,listWeek today prev,next'
    },
    select: info => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin/dev can create events.')) return;
      UI.Modals.openEvent({
        start: info.start,
        end: info.end,
        allDay: info.allDay,
        env: 'Prod',
        status: 'Planned'
      });
    },
    eventClick: info => {
      const ev =
        DataStore.events.find(e => e.id === info.event.id) || {
          id: info.event.id,
          title: info.event.title,
          type: info.event.extendedProps.type || 'Other',
          start: info.event.start,
          end: info.event.end,
          description: info.event.extendedProps.description || '',
          issueId: info.event.extendedProps.issueId || '',
          allDay: info.event.allDay,
          env: info.event.extendedProps.env || 'Prod',
          status: info.event.extendedProps.status || 'Planned',
          owner: info.event.extendedProps.owner || '',
          modules: info.event.extendedProps.modules || [],
          impactType: info.event.extendedProps.impactType || 'No downtime expected',
          readiness:
            info.event.extendedProps.readiness ||
            info.event.extendedProps.checklist ||
            {},
          notificationStatus: info.event.extendedProps.notificationStatus || ''
        };
      UI.Modals.openEvent(ev);
    },
    eventDrop: async info => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin/dev can move events.')) {
        info.revert();
        return;
      }
      const ev = DataStore.events.find(e => e.id === info.event.id);
      if (!ev) {
        info.revert();
        return;
      }
      const updated = {
        ...ev,
        start: info.event.start,
        end: info.event.end,
        allDay: info.event.allDay
      };
      const saved = await saveEventRecord(updated);
      if (!saved) {
        info.revert();
        return;
      }
      const idx = DataStore.events.findIndex(e => e.id === saved.id);
      if (idx > -1) DataStore.events[idx] = saved;
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
    },
    eventDidMount(info) {
      const ext = info.event.extendedProps || {};
      const riskSum = ext.risk || 0;
      if (riskSum) {
        const span = document.createElement('span');
        span.className = 'event-risk-badge ' + CalendarLink.riskBadgeClass(riskSum);
        span.textContent = `RISK ${riskSum}`;
        const titleEl = info.el.querySelector('.fc-event-title');
        if (titleEl) titleEl.appendChild(span);
      }

      const env = ext.env || 'Prod';
      const status = ext.status || 'Planned';
const readiness = ext.readiness || ext.checklist || {};
      const readinessState = readinessProgress(readiness);
      
      let tooltip = ext.description || '';
      if (ext.issueId) {
        const idStr = ext.issueId;
        const ids = idStr
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const issues = ids
          .map(id => DataStore.byId.get(id))
          .filter(Boolean);
        if (issues.length) {
          const first = issues[0];
          const meta = DataStore.computed.get(first.id) || {};
          const r = meta.risk?.total || 0;
          tooltip =
            `${first.id} – ${first.title || ''}\nStatus: ${
              first.status || '-'
            } · Priority: ${first.priority || '-'} · Risk: ${r}` +
            (issues.length > 1
              ? `\n+ ${issues.length - 1} more linked ticket(s)`
              : '') +
            (tooltip ? `\n\n${tooltip}` : '');
        } else {
          tooltip =
            `Linked ticket(s): ${idStr}` + (tooltip ? `\n\n${tooltip}` : '');
        }
      }

      tooltip += `\nEnvironment: ${env} · Change status: ${status}`;
      if (readinessState.total) {
        tooltip += `\nReadiness: ${readinessState.done}/${readinessState.total} complete`;
      }
      if (ext.collision || ext.freeze || ext.hotIssues) {
        tooltip += `\n⚠️ Change risk signals:`;
        if (ext.collision) tooltip += ` overlaps with other change(s)`;
        if (ext.freeze) tooltip += ` · in freeze window`;
        if (ext.hotIssues) tooltip += ` · high-risk open tickets`;
      }

      if (tooltip.trim()) info.el.setAttribute('title', tooltip);
    }
  });
  calendarReady = true;
  renderCalendarEvents();
  calendar.render();
  scheduleCalendarResize();
}

 function renderCalendarEvents() {
  if (!calendar) return;
  const activeTypes = new Set();
  if (E.eventFilterDeployment && E.eventFilterDeployment.checked)
    activeTypes.add('Deployment');
  if (E.eventFilterMaintenance && E.eventFilterMaintenance.checked)
    activeTypes.add('Maintenance');
  if (E.eventFilterRelease && E.eventFilterRelease.checked)
    activeTypes.add('Release');
  if (E.eventFilterOther && E.eventFilterOther.checked) activeTypes.add('Other');

  const links = computeEventsRisk(DataStore.rows, DataStore.events);
  const riskMap = new Map(links.map(r => [r.event.id, r.risk]));
  const { flagsById } = computeChangeCollisions(DataStore.rows, DataStore.events);

  calendar.removeAllEvents();
      DataStore.events.forEach(ev => {
    const type = ev.type || 'Other';
    if (activeTypes.size && !activeTypes.has(type)) return;
    const risk = riskMap.get(ev.id) || 0;

    const env = ev.env || 'Prod';
    const status = ev.status || 'Planned';
    const owner = ev.owner || '';
    const modules = Array.isArray(ev.modules)
      ? ev.modules
      : typeof ev.modules === 'string'
      ? ev.modules
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [];
    const impactType = ev.impactType || '';
 const readiness = ev.readiness || ev.checklist || {};
        
    const flags = flagsById.get(ev.id) || {};
    const classNames = [
      'event-type-' + type.toLowerCase().replace(/\s+/g, '-'),
      'event-env-' + env.toLowerCase()
    ];
    if (flags.collision) classNames.push('event-collision');
    if (flags.freeze) classNames.push('event-freeze');
    if (flags.hotIssues) classNames.push('event-hot');

      calendar.addEvent({
      id: ev.id,
      title: ev.title,
      start: ev.start,
      end: ev.end || null,
      allDay: !!ev.allDay,
      extendedProps: {
        type,
        description: ev.description,
        issueId: ev.issueId || '',
        risk,
        env,
        status,
        owner,
        modules,
        impactType,
         readiness,
        notificationStatus: ev.notificationStatus || '',
        collision: !!flags.collision,
        freeze: !!flags.freeze,
        hotIssues: !!flags.hotIssues
      },
      classNames
    });    
    });
  scheduleCalendarResize();
  }

/* ---------- Networking & data loading ---------- */
async function safeFetchText(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-store', ...opts });
  } catch (error) {
    throw buildNetworkRequestError(url, error);
  }
  if (!res.ok)
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

function loadEventsCache() {
  try {
    const lastUpdated = localStorage.getItem(LS_KEYS.eventsLastUpdated);
    if (!U.isRecentIso(lastUpdated, CONFIG.DATA_STALE_HOURS)) return [];
    const raw = localStorage.getItem(LS_KEYS.events);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
function saveEventsCache() {
  try {
    localStorage.setItem(LS_KEYS.events, JSON.stringify(DataStore.events || []));
    localStorage.setItem(LS_KEYS.eventsLastUpdated, new Date().toISOString());
  } catch {}
}

function loadFreezeWindowsCache() {
  try {
    const raw = localStorage.getItem(LS_KEYS.freezeWindows);
    if (!raw) {
      DataStore.freezeWindows = withFreezeIds(CONFIG.CHANGE.freezeWindows || []);
      return;
    }
    const parsed = JSON.parse(raw);
    DataStore.freezeWindows = Array.isArray(parsed)
      ? withFreezeIds(parsed)
      : withFreezeIds(CONFIG.CHANGE.freezeWindows || []);
  } catch {
    DataStore.freezeWindows = withFreezeIds(CONFIG.CHANGE.freezeWindows || []);
  }
}

function saveFreezeWindowsCache() {
  try {
    localStorage.setItem(
      LS_KEYS.freezeWindows,
      JSON.stringify(DataStore.freezeWindows || [])
    );
  } catch {}
}

function renderFreezeWindows() {
  const windows = getFreezeWindows();
  const renderList = (el, allowRemove) => {
    if (!el) return;
    if (!windows.length) {
      el.innerHTML = '<div class="muted">No freeze windows configured.</div>';
      return;
    }
    el.innerHTML = windows
      .map(
        win => `
        <div class="freeze-window-item">
          <div class="freeze-window-tags">
            <span>${U.escapeHtml(formatFreezeWindow(win))}</span>
          </div>
          ${
            allowRemove
              ? `<button class="btn ghost sm" type="button" data-remove-freeze="${U.escapeAttr(
                  win.id || ''
                )}">Remove</button>`
              : ''
          }
        </div>
      `
      )
      .join('');
  };

  renderList(E.freezeWindowsList, false);
  renderList(E.freezeModalList, true);

  if (E.freezeModalList) {
    E.freezeModalList.querySelectorAll('[data-remove-freeze]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!requirePermission(() => Permissions.canManageFreezeWindows(), 'Only admin can remove freeze windows.'))
          return;
        const id = btn.getAttribute('data-remove-freeze');
        if (!id) return;
        DataStore.freezeWindows = getFreezeWindows().filter(win => win.id !== id);
        saveFreezeWindowsCache();
        renderFreezeWindows();
        renderCalendarEvents();
      });
    });
  }
}


function getIssueIdFromLink() {
  if (window.location.hash) return '';
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get('issue');
  if (fromQuery) return fromQuery;

  const rawHash = (window.location.hash || '').replace(/^#/, '');
  if (rawHash.startsWith('issue-')) {
    return decodeURIComponent(rawHash.slice('issue-'.length));
  }

  return '';
}

function openIssueFromLink() {
  const issueId = getIssueIdFromLink();
  if (!issueId || !DataStore.byId.has(issueId)) return;
  if (UI.Modals.selectedIssue?.id === issueId && E.issueModal?.style.display === 'flex') return;
  UI.Modals.openIssue(issueId);
}

function isPermissionErrorSafe(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('forbidden') ||
    message.includes('not permitted') ||
    message.includes('cannot list') ||
    message.includes('cannot get') ||
    message.includes('cannot create') ||
    message.includes('cannot save') ||
    message.includes('cannot update') ||
    message.includes('cannot delete') ||
    message.includes('cannot get_unread_count') ||
    message.includes('cannot mark_read') ||
    message.includes('cannot mark_all_read')
  );
}

async function loadIssues(force = false) {
  if (!force && !DataStore.rows.length) {
    const cached = IssuesCache.load();
    if (cached && cached.length) {
      DataStore.hydrateFromRows(cached.map(raw => DataStore.normalizeRow(raw)));
      UI.Issues.renderFilters();
      setIfOptionExists(E.moduleFilter, Filters.state.module);
      setIfOptionExists(E.categoryFilter, Filters.state.category);
      setIfOptionExists(E.priorityFilter, Filters.state.priority);
      setIfOptionExists(E.statusFilter, Filters.state.status);
      setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
      setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
      UI.skeleton(false);
      UI.refreshTableAndSummary();
      openIssueFromLink();
    }
  }

  const canListTickets =
    Permissions.can('tickets', 'list') ||
    Permissions.can('tickets', 'view') ||
    Permissions.can('tickets', 'manage');
  if (!canListTickets) {
    console.info('[loadIssues] skipped tickets.list due to permission guard', {
      role: Session.role(),
      checks: {
        list: Permissions.can('tickets', 'list'),
        view: Permissions.can('tickets', 'view'),
        manage: Permissions.can('tickets', 'manage')
      }
    });
    UI.setSync('issues', !!DataStore.rows.length, null);
    return;
  }

  try {
    UI.spinner(true);
    UI.skeleton(true);
    const sortBy = resolveTicketSortColumn(GridState.sortKey || 'updated_at');
    const sortDir = GridState.sortAsc ? 'asc' : 'desc';
    const filtersPayload = buildTicketListFiltersPayload();
    const summaryFilterKey = buildTicketSummaryFilterKey(filtersPayload);
    const ticketListPayload = {
      filters: filtersPayload,
      page: TicketPaginationState.page,
      limit: TicketPaginationState.limit,
      offset: (TicketPaginationState.page - 1) * TicketPaginationState.limit,
      sort_by: sortBy,
      sort_dir: sortDir
    };
    console.info('[loadIssues] tickets.list payload', ticketListPayload);
    const shouldReloadSummary =
      !TicketSummaryState.loaded || TicketSummaryState.filterKey !== summaryFilterKey;
    const response = await Api.requestWithSession(
      'tickets',
      'list',
      ticketListPayload,
      { requireAuth: true }
    );
    let summaryResponse = null;
    if (shouldReloadSummary) {
      summaryResponse = await Api.requestWithSession(
        'tickets',
        'summary',
        { filters: filtersPayload },
        { requireAuth: true }
      ).catch(() => null);
    }
    const paginationMeta = extractPagedListMeta(response, TicketPaginationState);
    TicketPaginationState.page = paginationMeta.page;
    TicketPaginationState.limit = paginationMeta.limit;
    TicketPaginationState.offset = paginationMeta.offset;
    TicketPaginationState.returned = paginationMeta.returned;
    TicketPaginationState.total = paginationMeta.total;
    TicketPaginationState.totalPages = paginationMeta.totalPages;
    TicketPaginationState.hasMore = paginationMeta.hasMore;
    if (summaryResponse) {
      TicketSummaryState.total = Number(summaryResponse?.total ?? paginationMeta.total ?? 0);
      TicketSummaryState.open = Number(summaryResponse?.open ?? 0);
      TicketSummaryState.highRisk = Number(summaryResponse?.highRisk ?? 0);
      TicketSummaryState.statusCounts =
        summaryResponse && typeof summaryResponse.statusCounts === 'object'
          ? { ...summaryResponse.statusCounts }
          : {};
      TicketSummaryState.filterKey = summaryFilterKey;
      TicketSummaryState.loaded = true;
    } else if (!TicketSummaryState.loaded) {
      TicketSummaryState.total = Number(paginationMeta.total ?? 0);
      TicketSummaryState.open = 0;
      TicketSummaryState.highRisk = 0;
      TicketSummaryState.statusCounts = {};
      TicketSummaryState.filterKey = summaryFilterKey;
    }
    const rawRows = extractEventsPayload(response);
    const rows = rawRows.map(raw => DataStore.normalizeRow(raw));
    DataStore.hydrateFromRows(rows.filter(r => r.id && String(r.id).trim() !== ''));
    const canCachePage =
      TicketPaginationState.page === 1 &&
      !hasActiveTicketFilters() &&
      sortBy === 'updated_at' &&
      sortDir === 'desc';
    if (canCachePage) IssuesCache.save(rawRows);
    UI.Issues.renderFilters();
    setIfOptionExists(E.moduleFilter, Filters.state.module);
    setIfOptionExists(E.categoryFilter, Filters.state.category);
    setIfOptionExists(E.priorityFilter, Filters.state.priority);
    setIfOptionExists(E.statusFilter, Filters.state.status);
    setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
    setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
    UI.refreshAll();
    openIssueFromLink();
    UI.setSync('issues', true, new Date());
  } catch (e) {
    if (isPermissionErrorSafe(e)) {
      console.log('[startup] permission error preserved session', e?.message);
      UI.toast('Some tickets are unavailable for your role. Your session is still active.');
      UI.setSync('issues', !!DataStore.rows.length, null);
      return;
    }
    if (isAuthError(e)) {
      await handleExpiredSession('Unable to restore your session. Please log in again.');
      return;
    }
    if (!DataStore.rows.length && E.issuesTbody) {
      E.issuesTbody.innerHTML = `
        <tr>
          <td colspan="${ColumnManager.getVisibleColumnCount()}" style="color:#ffb4b4;text-align:center">
            Error loading data and no cached data found.
            <button type="button" id="retryLoad" class="btn sm" style="margin-left:8px">Retry</button>
          </td>
        </tr>`;
      const retryBtn = document.getElementById('retryLoad');
      if (retryBtn) retryBtn.addEventListener('click', () => loadIssues(true));
    }
    UI.toast('Error loading tickets: ' + e.message);
    UI.setSync('issues', !!DataStore.rows.length, null);
  } finally {
    UI.spinner(false);
    UI.skeleton(false);
  }
}

async function loadEvents(force = false, options = {}) {
  const cached = loadEventsCache();
  if (cached && cached.length && !force) {
    DataStore.events = cached;
    ensureCalendar();
    renderCalendarEvents();
    refreshPlannerReleasePlans();
    Analytics.refresh(UI.Issues.applyFilters());
    UI.setSync('events', true, new Date());
  }

  try {
    UI.spinner(true);
    const normalized = (await EventsService.listEvents()).filter(ev => ev.start);

    DataStore.events = normalized;
    saveEventsCache();
    ensureCalendar();
    renderCalendarEvents();
    refreshPlannerReleasePlans();
    Analytics.refresh(UI.Issues.applyFilters());
    UI.setSync('events', true, new Date());
  } catch (e) {
    const errMsg = String(e?.message || 'Unknown error');
    if (isPermissionErrorSafe(e)) {
      console.log('[startup] permission error preserved session', e?.message);
      DataStore.events = cached || [];
      ensureCalendar();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      UI.setSync('events', !!DataStore.events.length, null);
      UI.toast('Events are restricted for your role. Your session is still active.');
      return;
    }
    if (isAuthError(e)) {
      await handleExpiredSession('Session expired while loading events.');
      return;
    }

    DataStore.events = cached || [];
    ensureCalendar();
    renderCalendarEvents();
    refreshPlannerReleasePlans();
    UI.setSync('events', !!DataStore.events.length, null);
    UI.toast(
      DataStore.events.length
        ? 'Using cached events (Supabase error)'
        : 'Unable to load events: ' + errMsg
    );
  } finally {
    UI.spinner(false);
  }
}


function parseApiJson(text, sourceName = 'API') {
  if (!text || !String(text).trim()) return {};

  const raw = String(text).trim();
  try {
    return JSON.parse(raw);
  } catch {}

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const candidate = raw.slice(first, last + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  // Some backends return URL-encoded objects (e.g. "ok=true&token=...").
  if (raw.includes('=') && !raw.includes('<')) {
    try {
      const params = new URLSearchParams(raw);
      if (Array.from(params.keys()).length) {
        const mapped = {};
        params.forEach((value, key) => {
          mapped[key] = value;
        });
        return mapped;
      }
    } catch {}
  }

  // Support simple "key: value" response bodies.
  if (/^[A-Za-z0-9_.-]+\s*:\s*.+$/m.test(raw) && !raw.includes('<')) {
    const mapped = {};
    raw.split(/\r?\n/).forEach(line => {
      const idx = line.indexOf(':');
      if (idx <= 0) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!key) return;
      mapped[key] = value;
    });
    if (Object.keys(mapped).length) return mapped;
  }

  const looksLikeHtml = /<!doctype html|<html[\s>]/i.test(raw);
  if (looksLikeHtml) {
    throw new Error(`${sourceName} returned HTML instead of JSON.`);
  }

  throw new Error(
    `${sourceName} returned a non-JSON response.`
  );
}

function extractEventsPayload(data) {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return extractEventsPayload(parsed);
    } catch {
      return [];
    }
  }
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  // Backend responses may nest JSON in different envelope keys.
  const candidates = [
    data.events,
    data.data,
    data.items,
    data.rows,
    data.result,
    data.payload,
    data.response,
    data.contents
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = extractEventsPayload(candidate);
      if (nested.length) return nested;
    }
    if (typeof candidate === 'string') {
      const nested = extractEventsPayload(candidate);
      if (nested.length) return nested;
    }
  }

  if (typeof data.events === 'string') {
    try {
      const parsed = JSON.parse(data.events);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  return [];
}

function extractPagedListMeta(data, fallback = {}) {
  if (!data || typeof data !== 'object') return { ...fallback };
  const page = Number(data.page ?? fallback.page ?? 1) || 1;
  const limit = Number(data.limit ?? data.pageSize ?? fallback.limit ?? 50) || 50;
  const returned = Number(data.returned ?? fallback.returned ?? 0) || 0;
  const offset = Number(data.offset ?? Math.max(0, (page - 1) * limit));
  const totalRaw = Number(data.total ?? fallback.total ?? offset + returned);
  const total = Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : offset + returned;
  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : Math.max(1, page);
  const hasMore = data.hasMore !== undefined
    ? Boolean(data.hasMore)
    : page < totalPages || (returned >= limit && total <= offset + returned);
  return { page, limit, returned, offset, total, totalPages, hasMore };
}

function normalizeEventDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  // FullCalendar parses ISO formats reliably; normalize common "YYYY-MM-DD HH:mm" values.
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(raw)) {
    return raw.replace(/\s+/, 'T');
  }
  return raw;
}

function getEventField(eventObj, aliases) {
  if (!eventObj || typeof eventObj !== 'object' || !Array.isArray(aliases)) return '';
  const normalize = value => String(value).replace(/[\s_-]+/g, '').toLowerCase();
  for (const alias of aliases) {
    if (!alias) continue;
    if (Object.prototype.hasOwnProperty.call(eventObj, alias) && eventObj[alias] != null) {
      return eventObj[alias];
    }
    const normalizedAlias = normalize(alias);
    const key = Object.keys(eventObj).find(
      k => normalize(k) === normalizedAlias
    );
    if (key && eventObj[key] != null) return eventObj[key];
  }
  return '';
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'y', 'up', 'online', 'ok', 'healthy', 'success'].includes(normalized);
}

const RESTRICTED_VIEWER_FIELDS = ['youtrackReference', 'devTeamStatus', 'issueRelated', 'notes'];

function getCurrentAuthToken() {
  return '';
}

function buildTicketListFiltersPayload() {
  const state = Filters?.state || {};
  const payload = {};
  if (state.search) payload.search = state.search;
  if (state.module && state.module !== 'All') payload.module = state.module;
  if (state.category && state.category !== 'All') payload.category = state.category;
  if (state.priority && state.priority !== 'All') payload.priority = state.priority;
  if (state.status && state.status !== 'All') payload.status = state.status;
  if (state.start) payload.start = state.start;
  if (state.end) payload.end = state.end;
  if (Permissions.canUseInternalIssueFilters()) {
    if (state.devTeamStatus && state.devTeamStatus !== 'All')
      payload.devTeamStatus = state.devTeamStatus;
    if (state.issueRelated && state.issueRelated !== 'All')
      payload.issueRelated = state.issueRelated;
  }
  return payload;
}

/* ---------- Ticket/Event persistence ---------- */
function normalizeIssueForStore(issue, options = {}) {
  const includeRestricted =
    options.includeRestrictedFields !== undefined
      ? !!options.includeRestrictedFields
      : Permissions.isAdminLike();
  const normalized = {
    id: issue.id || issue.ticket_uuid || '',
    ticket_id: issue.ticket_id || issue.ticketCode || issueDisplayId(issue) || '',
    name: issue.name || '',
    department: issue.department || '',
    module: issue.module || 'Unspecified',
    title: issue.title || '',
    desc: issue.desc || '',
    file: issue.file || '',
    emailAddressee: issue.emailAddressee || '',
    notificationSent: issue.notificationSent || '',
    notificationUnderReview: issue.notificationUnderReview || '',
    priority: DataStore.normalizePriority(issue.priority),
    status: DataStore.normalizeStatus(issue.status),
    type: issue.type || '',
    date: issue.date || '',
    log: issue.log || ''
  };
  if (includeRestricted) {
    normalized.youtrackReference = issue.youtrackReference || '';
    normalized.devTeamStatus = issue.devTeamStatus || '';
    normalized.issueRelated = issue.issueRelated || '';
    normalized.notes = issue.notes || '';
  }
  return normalized;
}

function buildPublicTicketUpdatePayload(payload = {}) {
  const publicPayload = {};
  const assignIfDefined = (key, value) => {
    if (value === undefined || value === null) return;
    publicPayload[key] = value;
  };

  assignIfDefined('date_submitted', payload.date);
  assignIfDefined('name', payload.name);
  assignIfDefined('department', payload.department);
  assignIfDefined('module', payload.module);
  assignIfDefined('title', payload.title);
  assignIfDefined('description', payload.desc);
  assignIfDefined('link', payload.file);
  assignIfDefined('email_addressee', payload.emailAddressee);
  assignIfDefined('notification_sent', payload.notificationSent);
  assignIfDefined('notification_sent_under_review', payload.notificationUnderReview);
  assignIfDefined('priority', payload.priority);
  assignIfDefined('status', payload.status);
  assignIfDefined('category', payload.type);
  assignIfDefined('log', payload.log);

  return publicPayload;
}

function buildTicketInternalUpdatePayload(payload = {}, ticketId = '') {
  const internalPayload = {
    ticket_id: String(ticketId || '').trim(),
    youtrack_reference: payload.youtrackReference ?? '',
    dev_team_status: payload.devTeamStatus ?? '',
    issue_related: payload.issueRelated ?? '',
    notes: payload.notes ?? ''
  };
  return internalPayload.ticket_id ? internalPayload : null;
}

async function sendTicketBusinessNotification({
  ticketId = '',
  ticketUuid = '',
  action = 'ticket_updated',
  title = 'Ticket updated',
  body = '',
  roles = ['admin', 'hoo'],
  changedFields = []
} = {}) {
  const normalizedTicketId = String(ticketId || ticketUuid || '').trim();
  if (!normalizedTicketId) {
    console.warn('[tickets:pwa] skipped direct push: missing ticket id');
    return null;
  }

  const ticketUrl = buildTicketDeepLink({ id: normalizedTicketId });
  const payload = {
    title,
    body: body || `Ticket ${normalizedTicketId} was updated.`,
    resource: 'tickets',
    action,
    record_id: normalizedTicketId,
    roles,
    url: ticketUrl,
    tag: `tickets-${action}-${normalizedTicketId}-${Date.now()}`,
    data: {
      resource: 'tickets',
      action,
      record_id: normalizedTicketId,
      url: ticketUrl,
      changed_fields: changedFields
    }
  };

  const result = await Api.safeSendBusinessPwaPush({
    resource: 'tickets',
    action,
    eventKey: `tickets.${action}`,
    recordId: normalizedTicketId,
    title,
    body: payload.body,
    roles,
    url: ticketUrl,
    data: payload.data
  });

  console.info('[tickets:pwa] business notification result', {
    ticketId: normalizedTicketId,
    action,
    result
  });

  return result;
}

async function saveTicketRecord(issue, auth = {}, options = {}) {
 const useSpinner = !options.silent;
  if (useSpinner) UI.spinner(true);
  try {
    const payload = normalizeIssueForStore(issue, { includeRestrictedFields: Permissions.isAdminLike() });
    const issueRowId = String(payload.id || issue.id || '').trim();
    if (!issueRowId) {
      throw new Error('Missing ticket UUID for update.');
    }

    const currentRole = String(Session.role?.() || '').toLowerCase();
    if (!['admin', 'dev'].includes(currentRole)) {
      throw new Error('Only admin/dev can update tickets.');
    }

    const client = SupabaseClient.getClient();
    const { data: previousTicketRow } = await client
      .from('tickets')
      .select('id,ticket_id,status,title,priority,module,category')
      .eq('id', issueRowId)
      .maybeSingle();

    let previousInternalRow = null;

    if (['admin', 'dev'].includes(currentRole)) {
      const { data: internalBefore } = await client
        .from('ticket_internal')
        .select('ticket_id,youtrack_reference,dev_team_status,issue_related,notes')
        .eq('ticket_id', issueRowId)
        .maybeSingle();

      previousInternalRow = internalBefore || null;
    }

    const publicUpdates = buildPublicTicketUpdatePayload(payload);
    const internalUpdates = buildTicketInternalUpdatePayload(payload, issueRowId);

    const updates = {
      ...publicUpdates,
      id: issueRowId
    };

    if (internalUpdates) {
      updates.youtrackReference = payload.youtrackReference ?? internalUpdates.youtrack_reference ?? '';
      updates.devTeamStatus = payload.devTeamStatus ?? internalUpdates.dev_team_status ?? '';
      updates.issueRelated = payload.issueRelated ?? internalUpdates.issue_related ?? '';
      updates.notes = payload.notes ?? internalUpdates.notes ?? '';
    }

    const changedKeys = Object.keys(updates).filter(key => key !== 'id');
    if (!changedKeys.length) {
      throw new Error('Ticket update payload is empty after schema mapping.');
    }

    console.info('[tickets:update] routing through SupabaseData ticket update', {
      ticket_id: payload.ticket_id || issue.ticket_id || '',
      id: issueRowId,
      changedKeys
    });

    const savedTicket = await Api.requestWithSession('tickets', 'update', {
      id: issueRowId,
      updates
    }, { requireAuth: true });

    const mergedTicket = savedTicket || {};

    const finalTicketId = String(
      mergedTicket?.ticket_id ||
      previousTicketRow?.ticket_id ||
      payload.ticket_id ||
      issue.ticket_id ||
      issueRowId ||
      ''
    ).trim();

    const previousStatus = String(previousTicketRow?.status || '').trim();
    const nextStatus = String(mergedTicket?.status || payload.status || '').trim();

    const previousDevStatus = String(previousInternalRow?.dev_team_status || '').trim();
    const nextDevStatus = String(mergedTicket?.dev_team_status || payload.devTeamStatus || '').trim();

    const previousIssueRelated = String(previousInternalRow?.issue_related || '').trim();
    const nextIssueRelated = String(mergedTicket?.issue_related || payload.issueRelated || '').trim();

    const previousYoutrack = String(previousInternalRow?.youtrack_reference || '').trim();
    const nextYoutrack = String(mergedTicket?.youtrack_reference || payload.youtrackReference || '').trim();

    let pwaAction = 'ticket_updated';
    let pwaTitle = 'Ticket updated';
    let pwaBody = `Ticket ${finalTicketId} was updated.`;
    const changedFields = [];

    if (previousStatus && nextStatus && previousStatus.toLowerCase() !== nextStatus.toLowerCase()) {
      pwaAction = 'ticket_status_changed';
      pwaTitle = 'Ticket status changed';
      pwaBody = `Ticket ${finalTicketId} status changed from ${previousStatus} to ${nextStatus}.`;
      changedFields.push('status');
    } else if (
      previousDevStatus &&
      nextDevStatus &&
      previousDevStatus.toLowerCase() !== nextDevStatus.toLowerCase()
    ) {
      pwaAction = 'dev_team_status_changed';
      pwaTitle = 'Dev team status changed';
      pwaBody = `Ticket ${finalTicketId} dev team status changed from ${previousDevStatus} to ${nextDevStatus}.`;
      changedFields.push('dev_team_status');
    } else if (
      previousIssueRelated &&
      nextIssueRelated &&
      previousIssueRelated.toLowerCase() !== nextIssueRelated.toLowerCase()
    ) {
      pwaAction = 'ticket_issue_related_changed';
      pwaTitle = 'Ticket issue relation changed';
      pwaBody = `Ticket ${finalTicketId} issue relation changed from ${previousIssueRelated} to ${nextIssueRelated}.`;
      changedFields.push('issue_related');
    } else if (previousYoutrack !== nextYoutrack) {
      pwaAction = 'ticket_youtrack_changed';
      pwaTitle = 'Ticket YouTrack reference changed';
      pwaBody = `Ticket ${finalTicketId} YouTrack reference was updated.`;
      changedFields.push('youtrack_reference');
    } else {
      Object.keys(publicUpdates || {}).forEach(key => changedFields.push(key));
    }

    await sendTicketBusinessNotification({
      ticketId: finalTicketId,
      ticketUuid: issueRowId,
      action: pwaAction,
      title: pwaTitle,
      body: pwaBody,
      roles: ['admin', 'hoo'],
      changedFields
    }).catch(error => {
      console.warn('[tickets:pwa] direct ticket PWA push failed', error);
    });

    UI.toast('Ticket updated');

    return normalizeIssueForStore({
      ...mergedTicket,
      id: mergedTicket?.id ?? issueRowId,
      ticket_id: mergedTicket?.ticket_id ?? payload.ticket_id ?? issue.ticket_id ?? '',
      date: mergedTicket?.date_submitted ?? payload.date,
      date_submitted: mergedTicket?.date_submitted ?? payload.date,
      desc: mergedTicket?.description ?? payload.desc,
      type: mergedTicket?.category ?? payload.type,
      file: mergedTicket?.link ?? payload.file,
      emailAddressee: mergedTicket?.email_addressee ?? payload.emailAddressee,
      notificationSent: mergedTicket?.notification_sent ?? payload.notificationSent,
      notificationUnderReview:
        mergedTicket?.notification_sent_under_review ?? payload.notificationUnderReview,
      youtrackReference:
        mergedTicket?.youtrack_reference ??
        mergedTicket?.youtrackReference ??
        payload.youtrackReference,
      devTeamStatus:
        mergedTicket?.dev_team_status ??
        mergedTicket?.devTeamStatus ??
        payload.devTeamStatus,
      issueRelated:
        mergedTicket?.issue_related ??
        mergedTicket?.issueRelated ??
        payload.issueRelated,
      notes: mergedTicket?.notes ?? payload.notes
    });
  } catch (e) {
    if (isAuthError(e)) {
      await handleExpiredSession('Session expired while updating ticket.');
      return null;
    }
    UI.toast('Error updating ticket: ' + e.message);
   throw e;
  } finally {
    if (useSpinner) UI.spinner(false);
  }
 }


async function saveEventRecord(event) {
  UI.spinner(true);
  try {
    const hasId = event.id && String(event.id).trim();
    const savedEvent = hasId
      ? await EventsService.updateEvent(event.id, event)
      : await EventsService.createEvent(event);
    UI.toast('Event saved');
    return savedEvent;
  } catch (e) {
    if (isAuthError(e)) {
      await handleExpiredSession('Session expired while saving event.');
      return null;
    }
    UI.toast('Error saving event: ' + e.message);
    return null;
  } finally {
    UI.spinner(false);
  }
}


async function deleteEventRecord(id) {
  UI.spinner(true);
  try {
    await EventsService.deleteEvent(id);
    UI.toast('Event deleted');
    return true;
  } catch (e) {
    if (isAuthError(e)) {
      await handleExpiredSession('Session expired while deleting event.');
      return false;
    }
    UI.toast('Error deleting event: ' + e.message);
    return false;
  } finally {
    UI.spinner(false);
  }
}


/* ---------- Excel export ---------- */
function buildIssueExportRow(issue) {
  const row = {
     'Ticket ID': issueDisplayId(issue) || issue.id,
    Date: issue.date,
    Name: issue.name,
    Department: issue.department,
    Title: issue.title,
    Description: issue.desc,
    Priority: issue.priority,
    Module: issue.module,
    Link: issue.file,
    'Email Addressee': issue.emailAddressee,
    Category: issue.type,
    Status: issue.status,
    'Notification Sent': issue.notificationSent,
    Log: issue.log,
    'Notification Sent Under Review': issue.notificationUnderReview
  };
  if (Permissions.isAdminLike()) {
    row['YouTrack Reference'] = issue.youtrackReference;
    row['Dev Team Status'] = issue.devTeamStatus;
    row['Ticket Related'] = issue.issueRelated;
    row.Notes = issue.notes;
  }
  return row;
}

const ISSUE_EXPORT_HEADERS = [
  'Ticket ID',
  'Date',
  'Name',
  'Department',
  'Title',
  'Description',
  'Priority',
  'Module',
  'Link',
  'Email Addressee',
  'Category',
  'Status',
  'Notification Sent',
  'Log',
  'Notification Sent Under Review'
];

const ISSUE_EXPORT_HEADERS_ADMIN_ONLY = [
  'YouTrack Reference',
  'Dev Team Status',
  'Ticket Related',
  'Notes'
];

function exportIssuesToExcel(rows, suffix) {
  if (!rows.length) return UI.toast('Nothing to export (no rows).');
    if (typeof XLSX === 'undefined') {
    UI.toast('Excel export unavailable (missing XLSX library).');
    return;
  }

 
  
  const issueRows = rows.map(buildIssueExportRow);
  const headers = Permissions.isAdminLike()
    ? [...ISSUE_EXPORT_HEADERS.slice(0, 13), ...ISSUE_EXPORT_HEADERS_ADMIN_ONLY, ...ISSUE_EXPORT_HEADERS.slice(13)]
    : ISSUE_EXPORT_HEADERS;
  const wsIssues = XLSX.utils.json_to_sheet([]);
  XLSX.utils.sheet_add_aoa(wsIssues, [headers]);
  XLSX.utils.sheet_add_json(wsIssues, issueRows, {
    header: headers,
    skipHeader: true,
    origin: 'A2'
  });
   wsIssues['!cols'] = headers.map(h => ({ wch: Math.max(12, h.length + 4) }));

  const statusCounts = rows.reduce((acc, r) => {
    const normalizedStatus = DataStore.normalizeStatus(r.status);
    acc[normalizedStatus] = (acc[normalizedStatus] || 0) + 1;
    return acc;
  }, {});
  const summaryRows = [
    ['Generated at', U.fmtDisplayDate(new Date())],
    ['Filter - Search', Filters.state.search || ''],
    ['Filter - Module', Filters.state.module || 'All'],
    ['Filter - Category', Filters.state.category || 'All'],
    ['Filter - Priority', Filters.state.priority || 'All'],
    ['Filter - Status', Filters.state.status || 'All'],
    ['Filter - Start Date', Filters.state.start || ''],
    ['Filter - End Date', Filters.state.end || ''],
    ['Total tickets (all)', DataStore.rows.length],
    ['Total tickets (filtered)', rows.length],
    [],
    ['Status breakdown', 'Count']
  ];
  Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => summaryRows.push([status, count]));
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  XLSX.utils.book_append_sheet(wb, wsIssues, 'Tickets');

  const ts = new Date().toISOString().slice(0, 10);
 const filename = `incheck_tickets_${suffix || 'filtered'}_${ts}.xlsx`;
  XLSX.writeFile(wb, filename);
  UI.toast('Exported Excel workbook');
}

function exportFilteredExcel() {
  if (!Permissions.canExport('tickets')) {
    UI.toast('You do not have permission to export tickets.');
    return;
  }
  const rows = UI.Issues.applyFilters();
 exportIssuesToExcel(rows, 'filtered');
}

function buildIssueDetailExportRows(issue, risk = {}, meta = {}) {
  const categories = (meta.suggestions?.categories || [])
    .slice(0, 3)
    .map(c => c.label)
    .join(', ') || '—';
  const reasons = risk.reasons?.length ? risk.reasons.join(', ') : '—';
  const rows = [
    ['Ticket', `TICKET:${issueDisplayId(issue) || issue.id || '-'}`],
    ['Name', issue.name || 'Unknown'],
    ['Title', issue.title || 'Untitled ticket'],
    ['Description', issue.desc || '—'],
    ['Status', issue.status || '—'],
    ['Priority', issue.priority || '—'],
    ['Risk Score', risk.total || 0],
    ['Submitted', issue.createdAt || issue.date || '—'],
    ['Date', issue.date || '—'],
    ['Department', issue.department || '—'],
    ['Module', issue.module || '—'],
    ['Email', issue.email || '—'],
    ['Email Addressee', issue.emailAddressee || '—'],
    ['Notification Sent', issue.notificationSent || '—'],
    ['Notification Under Review', issue.notificationUnderReview || '—'],
    ['Log', issue.log || '—'],
    ['Suggested Priority', meta.suggestions?.priority || '—'],
    ['Suggested Categories', categories],
    ['Risk Signals', `Tech ${risk.technical || 0}, Biz ${risk.business || 0}, Ops ${risk.operational || 0}, Time ${risk.time || 0}`],
    ['Severity / Impact / Urgency', `${risk.severity || 0} / ${risk.impact || 0} / ${risk.urgency || 0}`],
    ['Reasons', reasons]
  ];
  if (Permissions.isAdminLike()) {
    rows.splice(
      14,
      0,
      ['YouTrack Reference', issue.youtrackReference || '—'],
      ['Dev Team Status', issue.devTeamStatus || '—'],
      ['Ticket Related', issue.issueRelated || '—'],
      ['Notes', issue.notes || '—']
    );
  }
  return rows;
}

function exportSelectedIssueToExcel() {
  const issue = UI.Modals.selectedIssue;
  if (!issue) return UI.toast('Open a ticket before exporting.');
  if (typeof XLSX === 'undefined') {
    UI.toast('Excel export unavailable (missing XLSX library).');
    return;
  }

  const meta = DataStore.computed.get(issue.id) || {};
  const risk = meta.risk || {};
  const rows = buildIssueDetailExportRows(issue, risk, meta).map(([field, value]) => [
    field,
    value == null ? '' : String(value)
  ]);
  const ws = XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...rows]);
  ws['!cols'] = [{ wch: 30 }, { wch: 110 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ticket View');
  const safeId = String(issueDisplayId(issue) || issue.id || 'ticket').replace(/[^\w-]+/g, '_');
  XLSX.writeFile(wb, `ticket_${safeId}.xlsx`);
  UI.toast('Ticket exported as Excel');
}

function exportSelectedIssueToPdf() {
  const issue = UI.Modals.selectedIssue;
  if (!issue) return UI.toast('Open a ticket before exporting.');
  const detailHtml = E.modalBody?.innerHTML || '';
  if (!detailHtml.trim()) return UI.toast('Nothing to export.');

  const title = `TICKET:${issueDisplayId(issue) || issue.id || '-'}`;
  const baseHref = U.escapeAttr(window.location.href);
  const printableDoc = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${U.escapeHtml(title)}</title>
        <base href="${baseHref}" />
        <link rel="stylesheet" href="styles.css" />
        <style>
          body { margin: 24px; background: #fff; color: #111; }
          .ticket-detail { box-shadow: none; border: 1px solid #ddd; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>${detailHtml}</body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1080,height=900');
  if (printWindow) {
    printWindow.document.write(printableDoc);
    printWindow.document.close();
    const printNow = () => {
      printWindow.focus();
      printWindow.print();
      UI.toast('Use Save as PDF in the print dialog.');
    };
    if (printWindow.document.readyState === 'complete') {
      setTimeout(printNow, 150);
    } else {
      printWindow.addEventListener('load', () => setTimeout(printNow, 150), { once: true });
    }
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 1500);
  };

  const printFromFrame = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      UI.toast('Unable to open print dialog. Check browser print settings.');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    UI.toast('Pop-up blocked. Opened print dialog without a new window.');
    cleanup();
  };

  const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!frameDoc) {
    cleanup();
    UI.toast('Unable to prepare PDF export.');
    return;
  }
  frameDoc.open();
  frameDoc.write(printableDoc);
  frameDoc.close();

  if (frameDoc.readyState === 'complete') {
    setTimeout(printFromFrame, 150);
  } else {
    iframe.addEventListener('load', () => setTimeout(printFromFrame, 150), { once: true });
  }
}

/* ---------- Release Planner wiring & rendering ---------- */

let LAST_PLANNER_CONTEXT = null;
let LAST_PLANNER_RESULT = null;

function renderPlannerResults(result, context) {
  if (!E.plannerResults) return;
  const { slots, bug, bomb, ticketContext } = result;
  const { env, modules, releaseType, horizonDays, region, description, tickets } = context;
  const allowPlannerChanges = Permissions.canChangePlanner();

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

  const ticketIssues = (ticketContext && ticketContext.issues) || [];
  const ticketsCount = ticketIssues.length;
  const maxTicketRisk = ticketContext?.maxRisk || 0;
  const avgTicketRisk = ticketContext?.avgRisk || 0;
  const ticketsLine = ticketsCount
    ? `Tickets in scope: ${ticketsCount} ticket(s), max risk ${maxTicketRisk.toFixed(
        1
      )}, avg risk ${avgTicketRisk.toFixed(1)}.`
    : 'No specific tickets selected – using module + description only.';

  const intro = `
    <div style="margin-bottom:6px;">
      Top ${slots.length} suggested windows for a <strong>${U.escapeHtml(
        releaseType
      )}</strong> release on <strong>${U.escapeHtml(
    env
  )}</strong> touching <strong>${U.escapeHtml(
    modulesLabel
  )}</strong><br/>
      Horizon: next ${horizonDays} day(s), region profile: ${U.escapeHtml(regionLabel)}.<br/>
      <span class="muted">${U.escapeHtml(ticketsLine)}</span><br/>
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
        return `<li><strong>${U.escapeHtml(ex.id)}</strong> — ${U.escapeHtml(
          ex.title || ''
        )} <span class="muted">(risk ${ex.risk}, ~${days}d old)</span></li>`;
      })
      .join('');
    bombExamplesHtml = `
      <div class="muted" style="font-size:11px;margin-bottom:4px;">
        Related historical incidents:
        <ul style="margin:4px 0 0 18px;padding:0;">
          ${items}
        </ul>
      </div>`;
  }

  const htmlSlots = slots
    .map((slot, idx) => {
      const d = slot.start;
      const dateStr = U.fmtDisplayDate(d);
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

      const safetyIndex = (slot.safetyScore / 10) * 100;
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
            Risk ${slot.totalRisk.toFixed(1)} / 10 · ${bucket.label}
          </span>
        </div>
        <div class="planner-slot-meta">
          Rush: ${U.escapeHtml(rushLabel)} · Bugs: ${U.escapeHtml(
        bugLabelPerSlot
      )} · Bomb-bug: ${U.escapeHtml(
        bombLabelPerSlot
      )}<br/>Events: ${U.escapeHtml(
        eventsLabel
      )}<br/>Safety index: ${safetyIndex.toFixed(0)}%
        </div>
        <div class="planner-slot-meta">
          Expected effect on F&amp;B clients: ${U.escapeHtml(blastComment)}
        </div>
        ${
          allowPlannerChanges
            ? `<div class="planner-slot-meta">
          <button type="button"
                  class="btn sm"
                  data-add-release="${U.escapeAttr(startIso)}"
                  data-add-release-end="${U.escapeAttr(endIso)}">
            ➕ Add this window as Release event
          </button>
        </div>`
            : ''
        }
      </div>
    `;
    })
    .join('');

  E.plannerResults.innerHTML = `${intro}${bombExamplesHtml}${htmlSlots}`;

  if (E.plannerAddEvent) E.plannerAddEvent.disabled = !slots.length;

  // Wire per-slot "Add" buttons – include selected tickets as linked issue IDs
  E.plannerResults.querySelectorAll('[data-add-release]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin/dev can create planner events.'))
        return;
      const startIso = btn.getAttribute('data-add-release');
      const endIso = btn.getAttribute('data-add-release-end');
      if (!startIso || !endIso) return;

      const startLocal = toLocalInputValue(new Date(startIso));
      const endLocal = toLocalInputValue(new Date(endIso));

      const modulesLabelLocal =
        modules && modules.length ? modules.join(', ') : 'General';

      const releaseDescription = (E.plannerDescription?.value || '').trim();

      const ticketIds =
        (LAST_PLANNER_CONTEXT &&
          Array.isArray(LAST_PLANNER_CONTEXT.tickets) &&
          LAST_PLANNER_CONTEXT.tickets) ||
        [];

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
        issueId: ticketIds.join(', '),
        start: startLocal,
        end: endLocal,
        description:
          `Auto-scheduled by Release Planner. Region profile: ${regionLabel}. Modules: ${modulesLabelLocal}.` +
          (releaseDescription ? `\nRelease notes: ${releaseDescription}` : '') +
          `\nHeuristic risk index computed from F&B rush hours, bug history, holidays and existing events.` +
          `\nTickets in scope at scheduling time: ${
            ticketIds.length ? ticketIds.join(', ') : 'none explicitly selected.'
          }`,
        allDay: false,
        notificationStatus: ''
      };

      const saved = await saveEventRecord(newEvent);
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

function exportPlannerScorecard() {
  if (!LAST_PLANNER_CONTEXT || !LAST_PLANNER_RESULT) {
    UI.toast('Run the release planner before exporting.');
    return;
  }
  if (typeof XLSX === 'undefined') {
    UI.toast('Excel export unavailable (missing XLSX library).');
    return;
  }

  const { env, modules, releaseType, horizonDays, region, description, tickets } =
    LAST_PLANNER_CONTEXT;
  const { slots, bug, bomb, ticketContext } = LAST_PLANNER_RESULT;

  const summaryRows = [
    ['Generated at', U.fmtDisplayDate(new Date())],
    ['Environment', env],
    ['Region', region],
    ['Release type', releaseType],
    ['Horizon (days)', horizonDays],
    ['Modules', modules && modules.length ? modules.join(', ') : 'All modules'],
    ['Selected tickets', tickets && tickets.length ? tickets.join(', ') : 'None'],
    ['Release description', description || ''],
    ['Bug pressure risk', bug?.risk ?? 0],
    ['Bomb-bug risk', bomb?.risk ?? 0],
    ['Ticket risk avg', ticketContext?.avgRisk ?? 0],
    ['Ticket risk max', ticketContext?.maxRisk ?? 0]
  ];

  const slotsRows = [
    [
      'Rank',
      'Start',
      'End',
      'Total risk',
      'Safety score',
      'Rush risk',
      'Bug risk',
      'Bomb-bug risk',
      'Events count',
      'Holiday count'
    ]
  ];
  slots.forEach((slot, idx) => {
    slotsRows.push([
      idx + 1,
      slot.start ? U.fmtDisplayDate(slot.start) : '',
      slot.end ? U.fmtDisplayDate(slot.end) : '',
      Number(slot.totalRisk || 0).toFixed(2),
      Number(slot.safetyScore || 0).toFixed(2),
      Number(slot.rushRisk || 0).toFixed(2),
      Number(slot.bugRisk || 0).toFixed(2),
      Number(slot.bombRisk || 0).toFixed(2),
      slot.eventCount || 0,
      slot.holidayCount || 0
    ]);
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(slotsRows), 'Suggested Slots');

  const ts = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `release_scorecard_${ts}.xlsx`);
  UI.toast('Release scorecard exported');
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
      const label = `[${r.priority || '-'} | R${risk}] ${issueDisplayId(r) || r.id} — ${
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
      const when =
        d && !isNaN(d)
          ? U.fmtDisplayDate(d)
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
      UI.toast('Tickets are still loading. Try again in a few seconds.');
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

    const selectedTicketIds = Array.from(E.plannerTickets?.selectedOptions || [])
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
      tickets: selectedTicketIds
    };

    const result = ReleasePlanner.suggestSlots(context);

    LAST_PLANNER_CONTEXT = context;
    LAST_PLANNER_RESULT = result;
    renderPlannerResults(result, context);
    refreshPlannerReleasePlans(context);
  });

  if (E.plannerAddEvent) {
    E.plannerAddEvent.addEventListener('click', async () => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin/dev can create planner events.'))
        return;
      if (
        !LAST_PLANNER_CONTEXT ||
        !LAST_PLANNER_RESULT ||
        !LAST_PLANNER_RESULT.slots.length
      ) {
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
      const ticketIds = Array.isArray(context.tickets) ? context.tickets : [];

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
        issueId: ticketIds.join(', '),
        start: startLocal,
        end: endLocal,
        description:
          `Auto-scheduled by Release Planner (top suggestion). Region profile: ${regionLabel}. Modules: ${modulesLabelLocal}.` +
          (releaseDescription ? `\nRelease notes: ${releaseDescription}` : '') +
          `\nHeuristic risk index computed from F&B rush hours, bug history, holidays and existing events.` +
          `\nTickets in scope at scheduling time: ${
            ticketIds.length ? ticketIds.join(', ') : 'none explicitly selected.'
          }`,
        allDay: false,
        notificationStatus: ''
      };

      const saved = await saveEventRecord(newEvent);
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

  if (E.plannerExportScorecard) {
    E.plannerExportScorecard.addEventListener('click', () => {
      exportPlannerScorecard();
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
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin/dev can assign planner tickets.'))
        return;
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

      const saved = await saveEventRecord(updatedEvent);
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

/* ---------- Misc wiring ---------- */
function setIfOptionExists(select, value) {
  if (!select || !value) return;
  const options = Array.from(select.options || []);
  if (options.some(o => o.value === value)) select.value = value;
}

function syncFilterInputs() {
  if (E.searchInput) E.searchInput.value = Filters.state.search || '';
  if (E.moduleFilter) setIfOptionExists(E.moduleFilter, Filters.state.module);
  if (E.categoryFilter) setIfOptionExists(E.categoryFilter, Filters.state.category);
  if (E.priorityFilter) setIfOptionExists(E.priorityFilter, Filters.state.priority);
  if (E.statusFilter) setIfOptionExists(E.statusFilter, Filters.state.status);
  if (E.devTeamStatusFilter)
    setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
  if (E.issueRelatedFilter) setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
  if (E.startDateFilter) E.startDateFilter.value = Filters.state.start || '';
  if (E.endDateFilter) E.endDateFilter.value = Filters.state.end || '';
}


function wireCore() {
   [E.issuesTab, E.calendarTab, E.insightsTab, E.csmTab, E.companyTab, E.contactsTab, E.leadsTab, E.dealsTab, E.proposalsTab, E.agreementsTab, E.operationsOnboardingTab, E.technicalAdminTab, E.invoicesTab, E.receiptsTab, E.lifecycleAnalyticsTab, E.clientsTab, E.proposalCatalogTab, E.notificationsTab, E.notificationSetupTab, E.workflowTab, E.usersTab, E.rolePermissionsTab].forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => setActiveView(btn.dataset.view));
  });

  if (E.drawerBtn)
    E.drawerBtn.addEventListener('click', () => {
      const open = !E.sidebar.classList.contains('open');
      E.sidebar.classList.toggle('open');
      E.drawerBtn.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('drawer-open', open);
    });

  document.addEventListener('click', e => {
    if (!E.sidebar || !E.drawerBtn) return;
    if (window.innerWidth > 980) return;
    if (!E.sidebar.classList.contains('open')) return;
    const target = e.target;
    const insideSidebar = E.sidebar.contains(target);
    const onToggle = E.drawerBtn.contains(target);
    if (insideSidebar || onToggle) return;
    E.sidebar.classList.remove('open');
    E.drawerBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-open');
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!E.sidebar || !E.drawerBtn) return;
    if (!E.sidebar.classList.contains('open')) return;
    E.sidebar.classList.remove('open');
    E.drawerBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-open');
  });

  if (E.searchInput)
    E.searchInput.addEventListener(
      'input',
      debounce(() => {
        Filters.state.search = E.searchInput.value || '';
        Filters.save();
        GridState.page = 1;
        TicketPaginationState.page = 1;
        loadIssues(true);
      }, 250)
    );

  if (E.savedViews) {
    E.savedViews.addEventListener('change', () => {
      const name = E.savedViews.value;
      if (!name) return;
      const applied = SavedViews.apply(name);
      if (!applied) UI.toast('Saved view not found.');
    });
  }

  if (E.saveViewBtn) {
    E.saveViewBtn.addEventListener('click', () => {
      const name = window.prompt('Name this view');
      if (!name) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      if (SavedViews.views[trimmed]) {
        const overwrite = window.confirm(`Replace saved view "${trimmed}"?`);
        if (!overwrite) return;
      }
      SavedViews.add(trimmed, {
        filters: { ...Filters.state },
        columns: ColumnManager.getState(),
        sort: { key: GridState.sortKey, asc: GridState.sortAsc }
      });
      if (E.savedViews) E.savedViews.value = trimmed;
      UI.toast(`Saved view "${trimmed}"`);
    });
  }

  if (E.deleteViewBtn) {
    E.deleteViewBtn.addEventListener('click', () => {
      const name = E.savedViews?.value;
      if (!name) {
        UI.toast('Select a saved view to delete.');
        return;
      }
      const confirmed = window.confirm(`Delete saved view "${name}"?`);
      if (!confirmed) return;
      SavedViews.remove(name);
      if (E.savedViews) E.savedViews.value = '';
      UI.toast(`Deleted view "${name}"`);
    });
  }

  if (E.refreshNow)
    E.refreshNow.addEventListener('click', () => {
      loadIssues(true);
      loadEvents(true);
      if (E.csmView?.classList.contains('active')) CSMActivity.loadAndRefresh({ force: true });
      if (E.leadsView?.classList.contains('active') && window.Leads?.loadAndRefresh)
        Leads.loadAndRefresh({ force: true });
      if (E.dealsView?.classList.contains('active') && window.Deals?.loadAndRefresh)
        Deals.loadAndRefresh({ force: true });
      if (E.proposalsView?.classList.contains('active') && window.Proposals?.loadAndRefresh)
        Proposals.loadAndRefresh({ force: true });
      if (E.agreementsView?.classList.contains('active') && window.Agreements?.loadAndRefresh)
        Agreements.loadAndRefresh({ force: true });
      if (E.invoicesView?.classList.contains('active') && window.Invoices?.refresh)
        Invoices.refresh(true);
      if (E.receiptsView?.classList.contains('active') && window.Receipts?.refresh)
        Receipts.refresh(true);
      if (E.clientsView?.classList.contains('active') && window.Clients?.loadAndRefresh)
        Clients.loadAndRefresh({ force: true });
      if (E.proposalCatalogView?.classList.contains('active') && window.ProposalCatalog?.loadAndRefresh)
        ProposalCatalog.loadAndRefresh({ force: true });
      if (window.Notifications?.refreshAll) Notifications.refreshAll(true);
    });
  if (E.exportCsv)
    E.exportCsv.addEventListener('click', () => {
      exportFilteredExcel();
    });
  if (E.aiInsightsRefresh) {
    E.aiInsightsRefresh.addEventListener('click', () => {
      loadIssues(true);
      loadEvents(true);
      Analytics.refresh();
    });
  }
  if (E.createTicketBtn)
    E.createTicketBtn.addEventListener('click', () => {
      if (!requirePermission(() => Permissions.canCreateTicket(), 'Login is required to create a ticket.'))
        return;
      const isCsmView = E.csmView?.classList.contains('active');
      const isLeadsView = E.leadsView?.classList.contains('active');
      const isAgreementsView = E.agreementsView?.classList.contains('active');
      const isInvoicesView = E.invoicesView?.classList.contains('active');
      if (isLeadsView && window.Leads?.openForm) {
        if (!Permissions.canCreateLead()) {
          UI.toast('Login is required to create leads.');
          return;
        }
        Leads.openForm();
        return;
      }
      if (isAgreementsView && window.Agreements?.openAgreementForm) {
        if (!Permissions.canCreateAgreement()) {
          UI.toast('Login is required to create agreements.');
          return;
        }
        Agreements.openAgreementForm();
        return;
      }
      if (isInvoicesView && window.Invoices?.openInvoice) {
        if (!Permissions.canCreateInvoice()) {
          UI.toast('You do not have permission to create invoices.');
          return;
        }
        Invoices.openInvoice(Invoices.emptyInvoice(), [], { readOnly: false });
        return;
      }
      if (isCsmView) {
        if (!Permissions.canCreateCsmActivity()) {
          UI.toast('You do not have permission to create CSM activity.');
          return;
        }
        CSMActivity.openForm();
        return;
      }
      TicketCreator.open();
    });



  if (E.columnToggleBtn && E.columnPanel) {
    const setPanel = open => {
      E.columnPanel.classList.toggle('open', open);
      E.columnPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
      E.columnToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    E.columnToggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = !E.columnPanel.classList.contains('open');
      setPanel(open);
    });
    document.addEventListener('click', e => {
      if (!E.columnPanel.classList.contains('open')) return;
      if (E.columnPanel.contains(e.target) || E.columnToggleBtn.contains(e.target)) return;
      setPanel(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && E.columnPanel.classList.contains('open')) {
        setPanel(false);
      }
    });
  }
  
  UI.refreshTableAndSummary = () => {
    const list = UI.Issues.applyFilters();
    UI.Issues.lightRefresh(list);
    return list;
  };
  UI.refreshAll = () => {
    const list = UI.Issues.applyFilters();
    UI.Issues.fullRefresh(list);
    UI.updateHeroMetrics(DataStore.rows);
    refreshPlannerTickets(list);
    if (E.insightsView && E.insightsView.classList.contains('active')) {
      Analytics.refresh(list);
    }
    if (E.csmView && E.csmView.classList.contains('active')) {
      CSMActivity.refresh();
    }
  };
}

function wireSorting() {
  U.qAll('#issuesTable thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-key');
      if (GridState.sortKey === key) GridState.sortAsc = !GridState.sortAsc;
      else {
        GridState.sortKey = key;
        GridState.sortAsc = true;
      }
      TicketPaginationState.page = 1;
      loadIssues(true);
    });
    th.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        th.click();
      }
    });
    th.tabIndex = 0;
    th.setAttribute('role', 'button');
    th.setAttribute('aria-label', `Sort by ${th.textContent}`);
  });
}

function wirePaging() {
  if (E.pageSize)
    E.pageSize.addEventListener('change', () => {
      GridState.pageSize = +E.pageSize.value;
      TicketPaginationState.limit = U.normalizePageSize(GridState.pageSize, 50, 200);
      localStorage.setItem(LS_KEYS.pageSize, TicketPaginationState.limit);
      TicketPaginationState.page = 1;
      loadIssues(true);
    });
  if (E.firstPage)
    E.firstPage.addEventListener('click', () => {
      TicketPaginationState.page = 1;
      loadIssues(true);
    });
  if (E.prevPage)
    E.prevPage.addEventListener('click', () => {
      if (TicketPaginationState.page > 1) {
        TicketPaginationState.page--;
        loadIssues(true);
      }
    });
  if (E.nextPage)
    E.nextPage.addEventListener('click', () => {
      if (TicketPaginationState.hasMore) {
        TicketPaginationState.page++;
        loadIssues(true);
      }
    });
  if (E.lastPage)
    E.lastPage.addEventListener('click', () => {
      const totalPages = Number(TicketPaginationState.totalPages || 1);
      if (totalPages > TicketPaginationState.page) {
        TicketPaginationState.page = totalPages;
        loadIssues(true);
      } else if (TicketPaginationState.hasMore) {
        TicketPaginationState.page++;
        loadIssues(true);
      }
    });
}

function wireFilters() {
  const reloadWithPageReset = () => {
    TicketPaginationState.page = 1;
    loadIssues(true);
  };
  if (E.moduleFilter) {
    E.moduleFilter.addEventListener('change', () => {
      Filters.state.module = E.moduleFilter.value;
      Filters.save();
      reloadWithPageReset();
    });
    setIfOptionExists(E.moduleFilter, Filters.state.module);
  }
   if (E.categoryFilter) {
    E.categoryFilter.addEventListener('change', () => {
      Filters.state.category = E.categoryFilter.value;
      Filters.save();
      reloadWithPageReset();
    });
    setIfOptionExists(E.categoryFilter, Filters.state.category);
  }
  if (E.priorityFilter) {
    E.priorityFilter.addEventListener('change', () => {
      Filters.state.priority = E.priorityFilter.value;
      Filters.save();
      reloadWithPageReset();
    });
     setIfOptionExists(E.priorityFilter, Filters.state.priority);
  }
  if (E.statusFilter) {
    E.statusFilter.addEventListener('change', () => {
      Filters.state.status = E.statusFilter.value;
      Filters.save();
      reloadWithPageReset();
    });
    setIfOptionExists(E.statusFilter, Filters.state.status);
  }
  if (E.devTeamStatusFilter) {
    E.devTeamStatusFilter.addEventListener('change', () => {
      Filters.state.devTeamStatus = E.devTeamStatusFilter.value;
      Filters.save();
      reloadWithPageReset();
    });
    setIfOptionExists(E.devTeamStatusFilter, Filters.state.devTeamStatus);
  }
  if (E.issueRelatedFilter) {
    E.issueRelatedFilter.addEventListener('change', () => {
      Filters.state.issueRelated = E.issueRelatedFilter.value;
      Filters.save();
      reloadWithPageReset();
    });
    setIfOptionExists(E.issueRelatedFilter, Filters.state.issueRelated);
  }
  if (E.startDateFilter) {
    E.startDateFilter.value = Filters.state.start || '';
    E.startDateFilter.addEventListener('change', () => {
      Filters.state.start = E.startDateFilter.value;
      Filters.save();
      reloadWithPageReset();
    });
  }
  if (E.endDateFilter) {
    E.endDateFilter.value = Filters.state.end || '';
    E.endDateFilter.addEventListener('change', () => {
      Filters.state.end = E.endDateFilter.value;
      Filters.save();
      reloadWithPageReset();
    });
  }
  if (E.searchInput) E.searchInput.value = Filters.state.search || '';

  if (E.resetBtn)
    E.resetBtn.addEventListener('click', () => {
      Filters.state = {
        search: '',
        module: 'All',
        category: 'All',
        priority: 'All',
        status: 'All',
        devTeamStatus: 'All',
        issueRelated: 'All',
        start: '',
        end: ''
      };
      Filters.save();
      if (E.searchInput) E.searchInput.value = '';
      if (E.categoryFilter) E.categoryFilter.value = 'All';
      if (E.startDateFilter) E.startDateFilter.value = '';
      if (E.endDateFilter) E.endDateFilter.value = '';
      UI.Issues.renderFilters();
      GridState.page = 1;
      reloadWithPageReset();
    });
}

function wireTheme() {
  const media = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const isDarkModeActive = () => document.documentElement.getAttribute('data-theme') !== 'light';
  const updateThemeToggleUi = () => {
    if (!E.themeSelect) return;
    const darkMode = isDarkModeActive();
    E.themeSelect.innerHTML = darkMode ? '☀️' : '🌙';
    E.themeSelect.setAttribute('aria-label', darkMode ? 'Switch to light mode' : 'Switch to dark mode');
    E.themeSelect.setAttribute('title', darkMode ? 'Switch to light mode' : 'Switch to dark mode');
  };
  const applySystem = () => {
    if (media?.matches) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
    updateThemeToggleUi();
  };
  const saved = localStorage.getItem(LS_KEYS.theme) || 'system';
  if (saved === 'system') applySystem();
  else if (saved === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', 'light');
  updateThemeToggleUi();

  media?.addEventListener('change', () => {
    if ((localStorage.getItem(LS_KEYS.theme) || 'system') === 'system')
      applySystem();
  });

  if (E.themeSelect)
    E.themeSelect.addEventListener('click', () => {
      const nextTheme = isDarkModeActive() ? 'light' : 'dark';
      localStorage.setItem(LS_KEYS.theme, nextTheme);
      if (nextTheme === 'dark') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', 'light');
      updateThemeToggleUi();
    });

  if (E.accentColor) {
    const rootStyle = getComputedStyle(document.documentElement);
    const defaultAccent = rootStyle.getPropertyValue('--accent').trim() || '#4f8cff';
    const savedAccent =
      localStorage.getItem(LS_KEYS.accentColorStorage) || defaultAccent;
    E.accentColor.value = savedAccent;
    document.documentElement.style.setProperty('--accent', savedAccent);

    E.accentColor.addEventListener('input', () => {
      const val = E.accentColor.value || defaultAccent;
      document.documentElement.style.setProperty('--accent', val);
      try {
        localStorage.setItem(LS_KEYS.accentColorStorage, val);
      } catch {}
      UI.Issues.renderCharts(UI.Issues.applyFilters());
    });
  }
}

function wireConnectivity() {
  if (!E.onlineStatusChip) return;
  const update = () => {
    const online = navigator.onLine !== false;
    E.onlineStatusChip.textContent = online ? 'Online' : 'Offline · using cache';
    E.onlineStatusChip.classList.toggle('online', online);
    E.onlineStatusChip.classList.toggle('offline', !online);
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}


function setAppHashRoute(hash = '') {
  const nextHash = String(hash || '').trim();
  if (!nextHash) return;
  const normalizedHash = nextHash.startsWith('#') ? nextHash : `#${nextHash}`;
  if (normalizedHash === window.location.hash) return;
  try {
    const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));
    searchParams.delete('issue');
    const nextSearch = searchParams.toString();
    history.replaceState(null, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${normalizedHash}`);
  } catch {
    window.location.hash = normalizedHash;
  }
  console.info('[router] hash route set', { hash: normalizedHash });
}

function safeEncodeRouteId(value = '') { return encodeURIComponent(String(value || '').trim()); }
function getRecordValue(record = {}, keys = []) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}
function buildRecordHashRoute(resource = '', record = {}) {
  const normalizedResource = String(resource || '').trim();
  if (normalizedResource === 'leads') { const id = getRecordValue(record, ['lead_id', 'leadId', 'lead_number', 'leadNumber', 'id']); return id ? `#crm?tab=leads&id=${safeEncodeRouteId(id)}` : '#crm?tab=leads'; }
  if (normalizedResource === 'deals') { const id = getRecordValue(record, ['deal_id', 'dealId', 'deal_number', 'dealNumber', 'id']); return id ? `#crm?tab=deals&id=${safeEncodeRouteId(id)}` : '#crm?tab=deals'; }
  if (normalizedResource === 'proposals') { const id = getRecordValue(record, ['proposal_id', 'proposalId', 'proposal_number', 'proposalNumber', 'id']); return id ? `#crm?tab=proposals&id=${safeEncodeRouteId(id)}` : '#crm?tab=proposals'; }
  if (normalizedResource === 'agreements') { const id = getRecordValue(record, ['agreement_id', 'agreementId', 'agreement_number', 'agreementNumber', 'id']); return id ? `#crm?tab=agreements&id=${safeEncodeRouteId(id)}` : '#crm?tab=agreements'; }
  if (normalizedResource === 'invoices') { const id = getRecordValue(record, ['invoice_id', 'invoiceId', 'invoice_number', 'invoiceNumber', 'id']); return id ? `#finance?tab=invoices&id=${safeEncodeRouteId(id)}` : '#finance?tab=invoices'; }
  if (normalizedResource === 'receipts') { const id = getRecordValue(record, ['receipt_id', 'receiptId', 'receipt_number', 'receiptNumber', 'id']); return id ? `#finance?tab=receipts&id=${safeEncodeRouteId(id)}` : '#finance?tab=receipts'; }
  if (normalizedResource === 'clients') { const id = getRecordValue(record, ['client_id', 'clientId', 'company_id', 'companyId', 'id']); return id ? `#clients?id=${safeEncodeRouteId(id)}` : '#clients'; }
  if (normalizedResource === 'events') { const id = getRecordValue(record, ['event_id', 'eventId', 'event_code', 'eventCode', 'id']); return id ? `#events?id=${safeEncodeRouteId(id)}` : '#events'; }
  if (normalizedResource === 'operations_onboarding') { const id = getRecordValue(record, ['onboarding_id', 'onboardingId', 'agreement_id', 'agreementId', 'id']); return id ? `#operations-onboarding?onboarding_id=${safeEncodeRouteId(id)}` : '#operations-onboarding'; }
  if (normalizedResource === 'technical_admin_requests') { const id = getRecordValue(record, ['request_id', 'requestId', 'technical_request_id', 'technicalRequestId', 'id']); return id ? `#technical-admin?id=${safeEncodeRouteId(id)}` : '#technical-admin'; }
  if (normalizedResource === 'workflow') { const id = getRecordValue(record, ['approval_id', 'approvalId', 'workflow_approval_id', 'workflowApprovalId', 'id']); return id ? `#workflow?approval_id=${safeEncodeRouteId(id)}` : '#workflow'; }
  return `#${encodeURIComponent(normalizedResource)}`;
}
window.setAppHashRoute = window.setAppHashRoute || setAppHashRoute;
window.buildRecordHashRoute = window.buildRecordHashRoute || buildRecordHashRoute;

function getAppHashForView(view = '') {
  const map = {
    issues: '#tickets',
    calendar: '#events',
    workflow: '#workflow',
    operationsOnboarding: '#operations-onboarding',
    technicalAdmin: '#technical-admin',
    leads: '#crm?tab=leads',
    deals: '#crm?tab=deals',
    proposals: '#crm?tab=proposals',
    agreements: '#crm?tab=agreements',
    invoices: '#finance?tab=invoices',
    receipts: '#finance?tab=receipts',
    clients: '#clients',
    insights: '#analytics',
    notificationSetup: '#notification-settings',
    users: '#users',
    rolePermissions: '#role-permissions'
  };
  return map[String(view || '').trim()] || '';
}

function isNotificationDeepLinkHash(hash = '') {
  const value = String(hash || '').trim();
  if (!value || value === '#loginSection') return false;
  return /^#(tickets|workflow|operations-onboarding|technical-admin|crm|finance|leads|deals|proposals|agreements|invoices|receipts)/i.test(value);
}

function capturePendingDeepLink() {
  const hash = String(window.location.hash || '').trim();
  if (!isNotificationDeepLinkHash(hash)) return '';
  try {
    sessionStorage.setItem('incheckPendingDeepLink', hash);
  } catch {}
  console.info('[deep-link] captured pending hash', { hash });
  return hash;
}

function consumePendingDeepLink() {
  let value = '';
  try {
    value = sessionStorage.getItem('incheckPendingDeepLink') || '';
    sessionStorage.removeItem('incheckPendingDeepLink');
  } catch {}
  return String(value || '').trim();
}

function hasPendingDeepLink() {
  try {
    const hash = String(sessionStorage.getItem('incheckPendingDeepLink') || '').trim();
    return isNotificationDeepLinkHash(hash);
  } catch {}
  return false;
}

function parseAppHashRoute(hash = '') {
  const raw = String(hash || window.location.hash || '').replace(/^#/, '').trim();
  if (!raw) return null;
  const [routePart, queryPart = ''] = raw.split('?');
  const route = decodeURIComponent(routePart || '').trim();
  const params = new URLSearchParams(queryPart || '');
  if (route === 'tickets') return { module: 'tickets', resource: 'tickets', id: params.get('ticket_id') || params.get('id') || '' };
  if (route === 'events') return { module: 'events', resource: 'events', id: params.get('id') || params.get('event_id') || '' };
  if (route === 'workflow') return { module: 'workflow', resource: 'workflow', id: params.get('approval_id') || params.get('id') || '' };
  if (route === 'operations-onboarding') return { module: 'operations_onboarding', resource: 'operations_onboarding', id: params.get('onboarding_id') || params.get('id') || '' };
  if (route === 'technical-admin') return { module: 'technical_admin_requests', resource: 'technical_admin_requests', id: params.get('request_id') || params.get('id') || '' };
  if (route === 'crm') return { module: 'crm', resource: params.get('tab') || '', id: params.get('id') || '' };
  if (route === 'finance') return { module: 'finance', resource: params.get('tab') || '', id: params.get('id') || '' };
  return { module: route, resource: route, id: params.get('id') || '' };
}

function cleanupLegacyIssueQueryWhenHashExists() {
  const search = String(window.location.search || '');
  const hash = String(window.location.hash || '');
  if (!search.includes('issue=')) return;
  if (!hash || !hash.startsWith('#tickets')) return;
  const cleanUrl = `${window.location.pathname}${hash}`;
  history.replaceState(null, '', cleanUrl);
  console.info('[router] removed legacy issue query because hash route exists', { oldSearch: search, hash });
}

async function routeAppHashAfterReady() {
  cleanupLegacyIssueQueryWhenHashExists();
  const hash = consumePendingDeepLink() || String(window.location.hash || '').trim();
  if (!hash || hash === '#loginSection') return false;
  const target = parseAppHashRoute(hash);
  if (!target || !target.resource) return false;
  console.info('[router] parsed hash target', target);
  await new Promise(resolve => setTimeout(resolve, 300));
  if (window.Notifications?.routeToResourceTarget) {
    const opened = await window.Notifications.routeToResourceTarget(target.resource, target.id, {
      resource: target.resource,
      resource_id: target.id,
      meta: { source: 'hash_router', original_hash: hash }
    });
    console.info('[router] hash route result', { target, opened });
    return Boolean(opened);
  }
  console.warn('[router] routeToResourceTarget unavailable', target);
  return false;
}

function wireDashboardGate() {
  if (!E.app || !E.loginForm || !E.loginIdentifier || !E.loginPasscode) return;
  if (E.loginForm.dataset.dashboardGateSubmitBound === 'true') {
    console.info('[wireDashboardGate] submit handler already attached; skipping duplicate bind');
    return;
  }

  const getDefaultViewForRole = role => {
    if (role === ROLES.ADMIN || role === ROLES.DEV) return 'issues';
    if (role === ROLES.VIEWER) return 'calendar';
    return 'issues';
  };
  const getFirstAllowedView = preferredView => {
    const names = ['issues', 'calendar', 'insights', 'csm', 'company', 'contacts', 'leads', 'deals', 'proposals', 'agreements', 'operationsOnboarding', 'technicalAdmin', 'invoices', 'receipts', 'lifecycleAnalytics', 'clients', 'proposalCatalog', 'notifications', 'notificationSetup', 'workflow', 'users', 'rolePermissions'];
    const preferred = String(preferredView || '').trim();
    if (preferred && Permissions.canAccessTab(preferred)) return preferred;
    return names.find(name => Permissions.canAccessTab(name)) || 'issues';
  };

  const unlockApp = async () => {
    console.info('[wireDashboardGate.unlockApp] unlocking app UI');
    document.body.classList.remove('auth-locked');
    E.app.classList.remove('is-locked');
    E.app.setAttribute('aria-hidden', 'false');
    if (E.logoutBtn) E.logoutBtn.hidden = false;
    const role = Session.role();
    const defaultView = getDefaultViewForRole(role);
    if (window.Notifications?.onAuthStateChanged) Notifications.onAuthStateChanged();
    if (window.PushNotifications?.onAuthStateChanged) PushNotifications.onAuthStateChanged();
    let routed = false;
    try {
      routed = await routeAppHashAfterReady();
    } catch (error) {
      console.warn('[email deep link] route after unlock failed', error);
    }
    if (!routed && !hasPendingDeepLink()) setActiveView(getFirstAllowedView(defaultView));
    console.info('[wireDashboardGate.unlockApp] app unlocked');
  };

  const lockApp = () => {
    document.body.classList.add('auth-locked');
    E.app.classList.add('is-locked');
    E.app.setAttribute('aria-hidden', 'true');
    if (E.logoutBtn) E.logoutBtn.hidden = true;
    if (window.Notifications?.reset) Notifications.reset();
    if (window.PushNotifications?.onAuthStateChanged) PushNotifications.onAuthStateChanged();
    const preservedHash = capturePendingDeepLink();
    if (!preservedHash) window.location.hash = '#loginSection';
  };

  const refreshPermissionsForCurrentRole = async (force = false) => {
    await Permissions.loadMatrix(force);
  };
  const logPermissionSelfTest = () => {
    if (!Session.isAuthenticated()) return;
    console.info('[permission self-test]', {
      role: Session.role(),
      isAuthenticated: Session.isAuthenticated(),
      authContext: Session.authContext(),
      hasAppPermissions: Boolean(window.AppPermissions),
      ticketsList: Permissions.canPerformAction('tickets', 'list', Session.role()),
      proposalsList: Permissions.canPerformAction('proposals', 'list', Session.role()),
      notificationsList: Permissions.canPerformAction('notifications', 'list', Session.role()),
      notificationsUnread: Permissions.canPerformAction('notifications', 'get_unread_count', Session.role()),
      canLoadRuntimeMatrix: Permissions.canLoadRuntimeMatrix(Session.role())
    });
  };

  const syncAuthUi = () => {
    const isAuthenticated = Session.isAuthenticated();
    if (isAuthenticated) {
      refreshPermissionsForCurrentRole(true)
        .catch(error => {
          console.warn('[wireDashboardGate.syncAuthUi] permission matrix refresh failed', error);
        })
        .finally(() => {
          UI.applyRolePermissions();
          logPermissionSelfTest();
          unlockApp();
        });
      return;
    }
    UI.applyRolePermissions();
    lockApp();
  };

  const hasStartupAuth = Session.isAuthenticated();
  if (hasStartupAuth) {
    refreshPermissionsForCurrentRole(true)
      .catch(error => {
        console.warn('[wireDashboardGate] startup permission matrix refresh failed', error);
      })
      .finally(() => {
        UI.applyRolePermissions();
        logPermissionSelfTest();
        unlockApp();
      });
  } else {
    UI.applyRolePermissions();
    lockApp();
  }
  Session.subscribe(() => {
    syncAuthUi();
  });

  E.loginForm.noValidate = true;
  console.info('[wireDashboardGate] native form validation disabled for login form (manual validation is used)');
  E.loginForm.addEventListener('invalid', event => {
    const targetId = event?.target?.id || '(unknown)';
    console.warn('[wireDashboardGate.loginSubmit] native invalid event detected', { targetId });
  }, true);

  E.loginForm.addEventListener('submit', async event => {
    console.info('[wireDashboardGate.loginSubmit] submit event fired', {
      defaultPreventedBeforeHandler: event.defaultPrevented
    });
    event.preventDefault();
    console.info('[wireDashboardGate.loginSubmit] event.preventDefault() reached', {
      defaultPreventedAfterHandler: event.defaultPrevented
    });
    const identifier = String(E.loginIdentifier.value || '').trim();
    const passcode = String(E.loginPasscode.value || '');
    console.info('[wireDashboardGate.loginSubmit] credential presence', {
      hasIdentifier: Boolean(identifier),
      hasPasscode: Boolean(passcode.trim())
    });
    const defaultLoginBtnLabel = E.loginBtn?.dataset?.defaultLabel || E.loginBtn?.textContent || 'LOG IN';
    if (E.loginBtn) {
      E.loginBtn.dataset.defaultLabel = defaultLoginBtnLabel;
      E.loginBtn.disabled = true;
      E.loginBtn.textContent = 'Logging in…';
      E.loginBtn.setAttribute('aria-busy', 'true');
    }

    if (!identifier) {
      UI.toast('Email is required.');
      if (E.loginBtn) {
        E.loginBtn.disabled = false;
        E.loginBtn.textContent = defaultLoginBtnLabel;
        E.loginBtn.removeAttribute('aria-busy');
      }
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(identifier)) {
      UI.toast('Enter a valid email address.');
      if (E.loginBtn) {
        E.loginBtn.disabled = false;
        E.loginBtn.textContent = defaultLoginBtnLabel;
        E.loginBtn.removeAttribute('aria-busy');
      }
      return;
    }
    if (!passcode.trim()) {
      UI.toast('Password is required.');
      if (E.loginBtn) {
        E.loginBtn.disabled = false;
        E.loginBtn.textContent = defaultLoginBtnLabel;
        E.loginBtn.removeAttribute('aria-busy');
      }
      return;
    }

    try {
      console.info('[wireDashboardGate.loginSubmit] before Session.login()');
      const user = await Session.login(identifier, passcode);
      console.info('[wireDashboardGate.loginSubmit] after Session.login() resolved', {
        hasUser: Boolean(user),
        role: user?.role || null
      });
      await refreshPermissionsForCurrentRole(true);
      logPermissionSelfTest();
      UI.applyRolePermissions();
      E.loginIdentifier.value = '';
      E.loginPasscode.value = '';
      unlockApp();
      UI.toast(`Logged in as ${user.role}.`);
      const startupLoaders = [loadEvents(false)];
      if (
        Permissions.can('tickets', 'list') ||
        Permissions.can('tickets', 'view') ||
        Permissions.can('tickets', 'manage')
      ) {
        startupLoaders.unshift(loadIssues(false));
      }
      Promise.allSettled(startupLoaders).then(results => {
        const rejected = results.filter(result => result.status === 'rejected');
        if (rejected.length) {
          console.warn('Post-login data refresh failed', rejected);
          UI.toast('Logged in, but some dashboard data could not be refreshed.');
        }
      });
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();

      if (/invalid|credential|password|passcode|identifier|unauthorized|email/.test(message)) {
        UI.toast('Invalid credentials. Please check your email and password.');
      } else if (/inactive/.test(message)) {
        UI.toast('Your account is inactive. Please contact an administrator.');
      } else if (/failed before a response|network|cors|unreachable/.test(message)) {
        UI.toast('Login service is temporarily unavailable. Please try again in a moment.');
      } else {
        UI.toast(`Login failed: ${error.message}`);
      }
      console.error('[wireDashboardGate.loginSubmit] catch block reached', {
        message: error?.message || String(error)
      });
      return;
    } finally {
      console.info('[wireDashboardGate.loginSubmit] finally block reached');
      if (E.loginBtn) {
        E.loginBtn.disabled = false;
        E.loginBtn.textContent = defaultLoginBtnLabel;
        E.loginBtn.removeAttribute('aria-busy');
      }
    }
  });
  E.loginForm.dataset.dashboardGateSubmitBound = 'true';
  console.info('[wireDashboardGate] login submit handler attached');

  if (E.logoutBtn) {
    E.logoutBtn.addEventListener('click', () => {
      Session.logout();
      Permissions.reset();
      UI.applyRolePermissions();
      E.loginIdentifier.value = '';
      E.loginPasscode.value = '';
      lockApp();
      UI.toast('Logged out.');
    });
  }
}

function wireModals() {
  // Issue modal
  if (E.modalClose) {
    E.modalClose.addEventListener('click', () => UI.Modals.closeIssue({ userInitiated: true }));
  }
  if (E.createTicketClose) {
    E.createTicketClose.addEventListener('click', () => TicketCreator.close());
  }
  if (E.createTicketCancel) {
    E.createTicketCancel.addEventListener('click', () => TicketCreator.close());
  }
  if (E.createTicketModal) {
    E.createTicketModal.addEventListener('click', e => {
      if (e.target === E.createTicketModal) TicketCreator.close();
    });
    E.createTicketModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        TicketCreator.close();
      } else if (e.key === 'Tab') {
        trapFocus(E.createTicketModal, e);
      }
    });
  }
  if (E.createTicketForm) {
    E.createTicketForm.addEventListener('submit', async e => {
      e.preventDefault();
      if (!requirePermission(() => Permissions.canCreateTicket(), 'Login is required to create a ticket.'))
        return;
      if (TicketCreator.isSubmitting) return;
      TicketCreator.isSubmitting = true;
      setButtonPendingState(E.createTicketSubmit, true, 'Creating...');
      UI.spinner(true);
      try {
        const payload = TicketCreator.buildPayload();
        debugTicketCreateLog('raw form payload', payload);
        console.info('[TicketCreator] final create ticket payload identity fields', {
          name: payload.name || '',
          email_addressee: payload.emailAddressee || '',
          department: payload.department || ''
        });
        await createTicketInDatabase(payload);
        UI.toast('Ticket created successfully.');
        TicketCreator.close();
        await loadIssues(true);
      } catch (error) {
        if (isAuthError(error)) {
          await handleExpiredSession('Session expired while creating ticket.');
          return;
        }
        UI.toast(`Failed to create ticket: ${error.message}`);
      } finally {
        TicketCreator.isSubmitting = false;
        setButtonPendingState(E.createTicketSubmit, false, 'Creating...');
        UI.spinner(false);
      }
    });
  }
  if (E.issueModal) {
    E.issueModal.addEventListener('click', e => {
      // click outside panel closes
      if (e.target === E.issueModal) UI.Modals.closeIssue({ userInitiated: true });
    });
    E.issueModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        UI.Modals.closeIssue({ userInitiated: true });
            } else if (e.key === 'Tab') {
        trapFocus(E.issueModal, e);
      }
    });
  }

  if (E.exportIssuePdf) {
    E.exportIssuePdf.addEventListener('click', () => {
      exportSelectedIssueToPdf();
    });
  }

  if (E.exportIssueExcel) {
    E.exportIssueExcel.addEventListener('click', () => {
      exportSelectedIssueToExcel();
    });
  }

  if (E.copyLink) {
    E.copyLink.addEventListener('click', async () => {
      const ticket = UI.Modals.selectedIssue;
      if (!ticket) return;
      const ticketBusinessId = getTicketBusinessId(ticket);
      const link = buildTicketDeepLink(ticket);
      try {
        await navigator.clipboard.writeText(link);
        console.info('[tickets] copied canonical ticket link', {
          ticketId: ticketBusinessId,
          link
        });
        UI.toast('Ticket link copied');
      } catch {
        UI.toast('Clipboard blocked');
      }
    });
  }

  if (E.replyEmailBtn) {
    E.replyEmailBtn.addEventListener('click', () => {
      openReplyComposerForIssue(UI.Modals.selectedIssue);
    });
  }

  if (E.editIssueBtn) {
    E.editIssueBtn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (IssueEditor.isOpening) return;
      if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can edit tickets.')) return;
      IssueEditor.isOpening = true;
      setButtonPendingState(E.editIssueBtn, true, 'Opening...');
      const selectedIssue =
        DataStore.byId.get(E.editIssueBtn?.dataset?.id || '') ||
        UI.Modals.selectedIssue;
      console.log('[ticket edit] selected issue source', {
        fromStore: DataStore.byId.get(E.editIssueBtn?.dataset?.id || ''),
        fromModal: UI.Modals.selectedIssue
      });
      if (!selectedIssue) {
        UI.toast('Open a ticket before editing.');
        IssueEditor.isOpening = false;
        setButtonPendingState(E.editIssueBtn, false, 'Opening...');
        return;
      }
      try {
        await Promise.resolve();
        IssueEditor.open(selectedIssue);
      } finally {
        IssueEditor.isOpening = false;
        setButtonPendingState(E.editIssueBtn, false, 'Opening...');
      }
    });
  }

  if (E.editIssueClose) {
    E.editIssueClose.addEventListener('click', () => IssueEditor.close());
  }
  if (E.editIssueCancel) {
    E.editIssueCancel.addEventListener('click', () => IssueEditor.close());
  }
  if (E.editIssueModal) {
    E.editIssueModal.addEventListener('click', e => {
      if (e.target === E.editIssueModal) IssueEditor.close();
    });
    E.editIssueModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        IssueEditor.close();
      } else if (e.key === 'Tab') {
        trapFocus(E.editIssueModal, e);
      }
    });
  }

 const editIssueForm = document.getElementById('editIssueForm');
  if (editIssueForm) {
    editIssueForm.addEventListener('submit', onEditIssueSubmit);
  }
  if (E.bulkEditBtn) {
    E.bulkEditBtn.addEventListener('click', () => {
      if (!requirePermission(() => Permissions.canEditTicket(), 'Only admin can bulk edit tickets.')) return;
      BulkEditor.open();
    });
  }
  if (E.bulkEditClose) {
    E.bulkEditClose.addEventListener('click', () => BulkEditor.close());
  }
  if (E.bulkEditCancel) {
    E.bulkEditCancel.addEventListener('click', () => BulkEditor.close());
  }
  if (E.bulkEditModal) {
    E.bulkEditModal.addEventListener('click', e => {
      if (e.target === E.bulkEditModal) BulkEditor.close();
    });
    E.bulkEditModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        BulkEditor.close();
      } else if (e.key === 'Tab') {
        trapFocus(E.bulkEditModal, e);
      }
    });
  }
  if (E.bulkEditForm) {
    E.bulkEditForm.addEventListener('submit', onBulkEditSubmit);
  }
  // Event modal
  if (E.eventModalClose) {
    E.eventModalClose.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventCancel) {
    E.eventCancel.addEventListener('click', () => UI.Modals.closeEvent());
  }
  if (E.eventModal) {
    E.eventModal.addEventListener('click', e => {
      if (e.target === E.eventModal) UI.Modals.closeEvent();
    });
    E.eventModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        UI.Modals.closeEvent();
      } else if (e.key === 'Tab') {
        trapFocus(E.eventModal, e);
      }
    });
  }
  if (E.eventIssueSearch) {
    E.eventIssueSearch.addEventListener('input', () => {
      refreshEventTicketSelect();
    });
  }
  if (E.eventIssueId) {
    E.eventIssueId.addEventListener('change', () => {
      const selected = getEventTicketSelection();
      renderEventIssueChips(selected);
      if (E.eventIssueLinkedInfo && !selected.length) {
        E.eventIssueLinkedInfo.style.display = 'none';
        E.eventIssueLinkedInfo.textContent = '';
      }
    });
  }
  if (E.eventIssueClearBtn) {
    E.eventIssueClearBtn.addEventListener('click', () => {
      refreshEventTicketSelect([]);
      if (E.eventIssueLinkedInfo) {
        E.eventIssueLinkedInfo.style.display = 'none';
        E.eventIssueLinkedInfo.textContent = '';
      }
    });
  }
  if (E.eventIssueShowAllBtn) {
    E.eventIssueShowAllBtn.addEventListener('click', () => {
      EVENT_TICKET_PICKER_SHOW_ALL = true;
      if (EVENT_TICKET_PICKER_ALL_ROWS) {
        refreshEventTicketSelect();
        return;
      }
      Api.requestWithSession('tickets', 'list', { filters: {} }, { requireAuth: true })
        .then(response => {
          const rawRows = extractEventsPayload(response);
          EVENT_TICKET_PICKER_ALL_ROWS = (rawRows || []).map(raw => DataStore.normalizeRow(raw));
          refreshEventTicketSelect();
        })
        .catch(error => {
          console.warn('[event-ticket-picker] unable to load all tickets', error);
          refreshEventTicketSelect();
        });
    });
  }

  if (E.eventAllDay) {
    E.eventAllDay.addEventListener('change', () => {
      const allDay = E.eventAllDay.checked;
      if (E.eventStart) {
        const val = E.eventStart.value;
        const d = val ? new Date(val) : null;
        E.eventStart.type = allDay ? 'date' : 'datetime-local';
        if (d && !isNaN(d)) {
          E.eventStart.value = allDay ? toLocalDateValue(d) : toLocalInputValue(d);
        }
      }
      if (E.eventEnd) {
        const val = E.eventEnd.value;
        const d = val ? new Date(val) : null;
        E.eventEnd.type = allDay ? 'date' : 'datetime-local';
        if (d && !isNaN(d)) {
          E.eventEnd.value = allDay ? toLocalDateValue(d) : toLocalInputValue(d);
        }
      }
    });
  }

  U.qAll('[data-readiness]').forEach(input => {
    input.addEventListener('change', () => {
      updateChecklistStatus(getReadinessChecklistState());
    });
  });
  
  if (E.eventForm) {
    E.eventForm.addEventListener('submit', async e => {
      e.preventDefault();
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin/dev can create or edit events.'))
        return;
      const id = E.eventForm.dataset.id || '';
      const allDay = !!(E.eventAllDay && E.eventAllDay.checked);

      const title = (E.eventTitle?.value || '').trim();
      if (!title) {
        UI.toast('Title is required');
        return;
      }

      const readiness = getReadinessChecklistState();
      const impactType = E.eventImpactType?.value || 'No downtime expected';
      const readinessState = readinessProgress(readiness);

      if (
        impactType === 'High risk change' &&
        readinessState.total &&
        readinessState.done < readinessState.total
      ) {
        const proceed = window.confirm(
          'This event is marked as a high-risk change, but the checklist is incomplete. Save anyway?'
        );
        if (!proceed) return;
      }
      
      const ticketIds = getEventTicketSelection();
      const issueIdValue = ticketIds.join(', ');

      const ev = {
        id,
        title,
        type: E.eventType?.value || 'Deployment',
        env: E.eventEnv?.value || 'Prod',
        status: E.eventStatus?.value || 'Planned',
        owner: (E.eventOwner?.value || '').trim(),
        modules: E.eventModules?.value || '',
        impactType,
        issueId: issueIdValue,
        ticketId: ticketIds[0] || '',
        ticketIds,
        start: E.eventStart?.value || '',
        end: E.eventEnd?.value || '',
        description: (E.eventDescription?.value || '').trim(),
        readiness,
         checklist: readiness,
        allDay,
        notificationStatus: ''
      };

      const saved = await saveEventRecord(ev);
      if (!saved) return;

      const idx = DataStore.events.findIndex(x => x.id === saved.id);
      if (idx === -1) DataStore.events.push(saved);
      else DataStore.events[idx] = saved;

      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
      UI.Modals.closeEvent();
    });
  }

  if (E.eventDelete) {
    E.eventDelete.addEventListener('click', async () => {
      if (!requirePermission(() => Permissions.canManageEvents(), 'Only admin/dev can delete events.')) return;
      if (!E.eventForm) return;
      const id = E.eventForm.dataset.id;
      if (!id) {
        UI.Modals.closeEvent();
        return;
      }
      if (!window.confirm('Delete this event from events?')) return;
      const ok = await deleteEventRecord(id);
      if (!ok) return;
      const idx = DataStore.events.findIndex(ev => ev.id === id);
      if (idx > -1) DataStore.events.splice(idx, 1);
      saveEventsCache();
      renderCalendarEvents();
      refreshPlannerReleasePlans();
      Analytics.refresh(UI.Issues.applyFilters());
      UI.Modals.closeEvent();
    });
  }
}

/* ---------- AI query / DSL wiring ---------- */

let LAST_AI_QUERY = null;

function applyDSLToFilters(q) {
  if (!q) return;
  const next = {
    search: '',
    module: 'All',
    category: 'All',
    priority: 'All',
    status: 'All',
    start: '',
    end: ''
  };

  if (q.words && q.words.length) {
    next.search = q.words.join(' ');
  }

  if (q.module) {
    const modules = Array.from(DataStore.byModule.keys());
    const target = q.module.toLowerCase();
    const exact = modules.find(m => (m || '').toLowerCase() === target);
    if (exact) next.module = exact;
  }

  if (q.priority) {
    const p = q.priority[0]?.toUpperCase();
    if (p === 'H') next.priority = 'High';
    else if (p === 'M') next.priority = 'Medium';
    else if (p === 'L') next.priority = 'Low';
  }

  if (q.status && q.status !== 'open' && q.status !== 'closed') {
    const statuses = Array.from(DataStore.byStatus.keys());
    const target = q.status.toLowerCase();
    const match = statuses.find(s => (s || '').toLowerCase().includes(target));
    if (match) next.status = match;
  }

  if (q.lastDays && Number.isFinite(q.lastDays)) {
    const start = U.daysAgo(q.lastDays);
    next.start = toLocalDateValue(start);
    next.end = '';
  }

  Filters.state = next;
  Filters.save();
  UI.refreshAll();
}

function wireAIQuery() {
  if (!E.aiQueryInput || !E.aiQueryRun || !E.aiQueryResults) return;

  const renderHelp = () => {
    E.aiQueryResults.innerHTML = `
      <div class="muted" style="font-size:12px;">
        Examples:
        <ul style="margin:4px 0 0 16px;padding:0;">
          <li><code>status:open priority:h risk&gt;=10 last:7d</code></li>
          <li><code>module:payments severity&gt;=3 impact&gt;=3</code></li>
          <li><code>missing:priority last:30d</code></li>
          <li><code>cluster:timeout sort:risk</code></li>
        </ul>
      </div>`;
  };

  const runQuery = () => {
    const raw = (E.aiQueryInput.value || '').trim();
    if (!raw) {
      LAST_AI_QUERY = null;
      renderHelp();
      return;
    }
    if (!DataStore.rows.length) {
      UI.toast('Tickets are still loading; try again in a moment.');
      return;
    }

    const q = DSL.parse(raw);
    let rows = DataStore.rows.filter(r =>
      DSL.matches(r, DataStore.computed.get(r.id) || {}, q)
    );

    if (q.sort === 'risk') {
      rows = rows
        .map(r => ({
          r,
          risk: DataStore.computed.get(r.id)?.risk?.total || 0
        }))
        .sort((a, b) => b.risk - a.risk)
        .map(x => x.r);
    } else if (q.sort === 'date') {
      rows = rows.slice().sort((a, b) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        if (isNaN(da) && isNaN(db)) return 0;
        if (isNaN(da)) return 1;
        if (isNaN(db)) return -1;
        return db - da; // newest first
      });
    } else if (q.sort === 'priority') {
      rows = rows.slice().sort((a, b) => prioMap(b.priority) - prioMap(a.priority));
    }

    LAST_AI_QUERY = { text: raw, q, rows };

    if (!rows.length) {
      E.aiQueryResults.innerHTML = `<div>No tickets matched this query.</div>`;
      return;
    }

    const maxShow = 50;
    const slice = rows.slice(0, maxShow);

    const summary = `
      <div style="margin-bottom:4px;">
        Found <strong>${slice.length}</strong> of ${rows.length} matching ticket${
      rows.length === 1 ? '' : 's'
    } for query <code>${U.escapeHtml(raw)}</code>.
      </div>`;

    const items = slice
      .map(r => {
        const meta = DataStore.computed.get(r.id) || {};
        const risk = meta.risk || {};
        const riskScore = risk.total || 0;
        const badgeClass = CalendarLink.riskBadgeClass(riskScore);
        return `
        <li style="margin-bottom:6px;">
          <button class="btn sm" data-open="${U.escapeAttr(r.id)}">${U.escapeHtml(
          issueDisplayId(r) || r.id
        )}</button>
          <strong>${U.escapeHtml(r.title || '')}</strong>
          <div class="muted">
            Module: ${U.escapeHtml(r.module || '-')},
            Priority: ${U.escapeHtml(r.priority || '-')},
            Status: ${U.escapeHtml(r.status || '-')}
          </div>
          <div class="muted">
            <span class="event-risk-badge ${badgeClass}">RISK ${riskScore}</span>
            · sev ${risk.severity ?? 0} · imp ${risk.impact ?? 0} · urg ${risk.urgency ?? 0}
          </div>
        </li>`;
      })
      .join('');

    const overflow =
      rows.length > maxShow
        ? `<div class="muted" style="font-size:11px;">+ ${
            rows.length - maxShow
          } more not shown. Use "Export" to download all.</div>`
        : '';

    E.aiQueryResults.innerHTML = `
      ${summary}
      <ul style="margin:4px 0 0 16px;padding:0;font-size:13px;">
        ${items}
      </ul>
      ${overflow}
    `;

    E.aiQueryResults.querySelectorAll('[data-open]').forEach(btn => {
      btn.addEventListener('click', () =>
        UI.Modals.openIssue(btn.getAttribute('data-open'))
      );
    });
  };

  E.aiQueryRun.addEventListener('click', runQuery);
  E.aiQueryInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runQuery();
    }
  });

  if (E.aiQueryApplyFilters) {
    E.aiQueryApplyFilters.addEventListener('click', () => {
      if (!LAST_AI_QUERY || !LAST_AI_QUERY.q) {
        UI.toast('Run a query first.');
        return;
      }
      applyDSLToFilters(LAST_AI_QUERY.q);
      setActiveView('issues');
      UI.toast('Applied AI query filters to tickets table');
    });
  }

  if (E.aiQueryExport) {
    E.aiQueryExport.addEventListener('click', () => {
      if (!LAST_AI_QUERY || !LAST_AI_QUERY.rows?.length) {
        UI.toast('Nothing to export yet.');
        return;
      }
      exportIssuesToExcel(LAST_AI_QUERY.rows, 'aiquery');
    });
  }

  // Initial help
  renderHelp();
}

/* ---------- CSM Daily Activity ---------- */
const CSMActivity = {
  cacheTtlMs: 2 * 60 * 1000,
  rows: [],
  loaded: false,
  lastLoadedAt: 0,
  isLoading: false,
  isSaving: false,
  isLoadingClientOptions: false,
  clientOptions: [],
  loadError: '',
  page: 1,
  limit: 50,
  offset: 0,
  returned: 0,
  hasMore: false,
  state: {
    search: '',
    csmName: 'All',
    client: 'All',
    supportType: 'All',
    effort: 'All',
    channel: 'All',
    minMinutes: '',
    maxMinutes: '',
    startDate: '',
    endDate: ''
  },
  charts: {
    weekdayWorkload: null,
    weeklyTrend: null,
    effortMixByCsm: null,
    clientConcentration: null,
    workloadBalance: null
  },
  normalizeClientKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  },
  normalizeClientName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  },
  backendToView(raw = {}) {
    const timestamp = String(raw.timestamp || raw.date || raw.created_at || '').trim();
    const parsedDate = timestamp ? new Date(timestamp) : null;
    return {
      id: String(raw.id || '').trim(),
      timestamp,
      parsedDate: parsedDate && !isNaN(parsedDate) ? parsedDate : null,
      csmName: String(raw.csm_name || raw.csmName || '').trim(),
      csmUserId: String(raw.csm_user_id || raw.csmUserId || '').trim(),
      csmEmail: String(raw.csm_email || raw.csmEmail || '').trim(),
      clientId: String(raw.client_id || raw.clientId || '').trim(),
      clientName: String(raw.client_name || raw.clientName || raw.client || raw.company_name || raw.companyName || '').trim(),
      companyName: String(raw.company_name || raw.companyName || raw.client_name || raw.client || raw.clientName || '').trim(),
      agreementId: String(raw.agreement_id || raw.agreementId || '').trim(),
      onboardingId: String(raw.onboarding_id || raw.onboardingId || '').trim(),
      client: String(raw.client || raw.client_name || raw.clientName || raw.company_name || raw.companyName || '').trim(),
      timeSpentMinutes: Number.parseFloat(raw.time_spent_minutes ?? raw.timeSpentMinutes ?? 0) || 0,
      supportType: String(raw.type_of_support || raw.supportType || '').trim(),
      effortRequirement: String(raw.effort_requirement || raw.effortRequirement || '').trim(),
      supportChannel: String(raw.support_channel || raw.supportChannel || '').trim(),
      notes: String(raw.notes_optional || raw.notes || '').trim(),
      createdAt: String(raw.created_at || '').trim(),
      updatedAt: String(raw.updated_at || '').trim()
    };
  },
  viewToBackendActivity(row = {}) {
    const clientName = String(row.clientName || row.companyName || row.client || '').trim();
    return {
      csm_name: String(row.csmName || '').trim(),
      csm_user_id: String(row.csmUserId || '').trim(),
      csm_email: String(row.csmEmail || '').trim(),
      client: clientName,
      client_id: String(row.clientId || '').trim(),
      client_name: clientName,
      company_name: String(row.companyName || clientName).trim(),
      time_spent_minutes: Number(row.timeSpentMinutes) || 0,
      type_of_support: String(row.supportType || '').trim(),
      effort_requirement: String(row.effortRequirement || '').trim(),
      support_channel: String(row.supportChannel || '').trim(),
      notes: String(row.notes || '').trim()
    };
  },
  isAdminUser() {
    return String(Session.role() || '').trim().toLowerCase() === 'admin';
  },
  getCurrentCsmIdentity() {
    const identity = window.CsmActivityService?.getCurrentUserIdentity?.() || {};
    return {
      csmName: String(identity.csm_name || '').trim(),
      csmUserId: String(identity.csm_user_id || '').trim(),
      csmEmail: String(identity.csm_email || '').trim()
    };
  },
  async ensureClientOptions() {
    if (this.clientOptions.length) return this.clientOptions;
    this.isLoadingClientOptions = true;
    this.renderClientOptionsState();
    try {
      const options = await window.CsmActivityService.loadClientOptionsForCsmActivity();
      this.clientOptions = Array.isArray(options) ? options : [];
      return this.clientOptions;
    } finally {
      this.isLoadingClientOptions = false;
      this.renderClientOptionsState();
    }
  },
  renderClientOptionsState() {
    if (!E.csmFormClientState) return;
    if (this.isLoadingClientOptions) {
      E.csmFormClientState.textContent = 'Loading clients…';
      return;
    }
    E.csmFormClientState.textContent = this.clientOptions.length
      ? ''
      : 'No clients found. Please add the client first or check Operations Onboarding.';
  },
  getMatchingClientOptions(term = '') {
    const q = String(term || '').trim().toLowerCase();
    if (!q) return this.clientOptions.slice();
    return this.clientOptions.filter(option => String(option.search_text || '').includes(q));
  },
  populateClientSelect(selectedValue = '', searchTerm = '') {
    if (!E.csmFormClient) return;
    const normalizedSelected = String(selectedValue || '').trim();
    const results = this.getMatchingClientOptions(searchTerm);
    let options = results.slice();
    if (normalizedSelected && !options.some(item => item.value === normalizedSelected)) {
      const fromAll = this.clientOptions.find(item => item.value === normalizedSelected);
      if (fromAll) options = [fromAll, ...options];
    }
    E.csmFormClient.innerHTML = [
      '<option value="">Select Client</option>',
      ...options.map(option => `<option value="${U.escapeHtml(option.value || '')}">${U.escapeHtml(option.label || option.client_name || option.company_name || '')}</option>`)
    ].join('');
    if (normalizedSelected) E.csmFormClient.value = normalizedSelected;
  },
  applySelectedClientToForm(option = null) {
    const selectedName = String(option?.client_name || option?.company_name || option?.client || option?.label || '').trim();
    const selectedValue = String(option?.value || '').trim();
    if (E.csmFormClient && selectedValue) E.csmFormClient.value = selectedValue;
    if (E.csmFormCompanyName) E.csmFormCompanyName.value = selectedName;
    if (E.csmFormClientSearch) E.csmFormClientSearch.value = selectedName;
  },
  findSelectedClientOption(rawValue = '') {
    const value = String(rawValue || '').trim();
    if (!value) return null;
    return this.clientOptions.find(option => String(option.value || '').trim() === value) || null;
  },
  findClientOptionForRow(row = null) {
    if (!row) return null;
    const rowClientId = String(row.clientId || '').trim();
    if (rowClientId) {
      const byId = this.clientOptions.find(option => String(option.client_id || '').trim() === rowClientId);
      if (byId) return byId;
    }
    const rowName = this.normalizeClientName(row.client || row.clientName || row.companyName || '');
    if (!rowName) return null;
    return this.clientOptions.find(option =>
      this.normalizeClientName(option.client_name || option.company_name || option.client || option.label) === rowName
    ) || null;
  },
  extractRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
  },
  setBusySaving(v) {
    this.isSaving = !!v;
    const saveBtn = E.csmFormSaveBtn;
    const deleteBtn = E.csmFormDeleteBtn;
    const inlineSubmitBtn = E.csmInlineSubmitBtn;
    if (saveBtn) {
      saveBtn.disabled = !!v;
      saveBtn.textContent = v ? 'Saving…' : 'Save';
    }
    if (deleteBtn) deleteBtn.disabled = !!v;
    if (inlineSubmitBtn) {
      inlineSubmitBtn.disabled = !!v;
      inlineSubmitBtn.textContent = v ? 'Saving…' : 'Create Activity';
    }
    ['csmFormCsmName','csmFormClientSearch','csmFormClient','csmFormCompanyName','csmFormMinutes','csmFormSupportType','csmFormEffort','csmFormChannel','csmFormNotes']
      .forEach(id => { if (E[id]) E[id].disabled = !!v; });
    ['csmInlineTimestamp','csmInlineCsmName','csmInlineClient','csmInlineMinutes','csmInlineSupportType','csmInlineEffort','csmInlineChannel','csmInlineNotes']
      .forEach(id => { if (E[id]) E[id].disabled = !!v; });
  },
  canCreate() {
    return Permissions.canCreateCsmActivity();
  },
  canEditDelete() {
    return Permissions.canUpdateCsmActivity() || Permissions.canDeleteCsmActivity();
  },
  async loadAndRefresh(options = {}) {
    const force = !!options.force;
    if (this.isLoading) return;
    const hasWarmCache = this.loaded && Date.now() - this.lastLoadedAt <= this.cacheTtlMs;
    if (hasWarmCache && !force) {
      this.refresh();
      return;
    }
    this.isLoading = true;
    this.loadError = '';
    this.refresh();
    try {
      const response = await window.CsmActivityService.listActivities({
        page: this.page,
        limit: this.limit,
        search: this.state.search,
        csmName: this.state.csmName,
        client: this.state.client,
        supportType: this.state.supportType,
        effort: this.state.effort,
        channel: this.state.channel,
        startDate: this.state.startDate,
        endDate: this.state.endDate
      });
      const rows = Array.isArray(response?.rows) ? response.rows : [];
      this.rows = rows.filter(row => row.id || row.csmName || row.client || row.timestamp);
      this.page = Number(response?.page || this.page || 1);
      this.limit = U.normalizePageSize(response?.limit ?? this.limit, 50, 200);
      this.offset = Number(response?.offset ?? Math.max(0, (this.page - 1) * this.limit));
      this.returned = Number(response?.returned ?? this.rows.length);
      this.hasMore = Boolean(response?.hasMore);
      this.loaded = true;
      this.lastLoadedAt = Date.now();
      this.hydrateOptions();
      this.refresh();
    } catch (error) {
      if (isAuthError(error)) {
        await handleExpiredSession('Session expired while loading CSM activity.');
        return;
      }
      this.loadError = String(error?.message || 'Unknown backend error');
      this.rows = [];
      this.loaded = false;
      this.hydrateOptions();
      this.refresh();
      UI.toast('Error loading CSM activity: ' + this.loadError);
    } finally {
      this.isLoading = false;
      this.refresh();
    }
  },
  hydrateOptions() {
    const uniq = values =>
      [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      );
    const assign = (el, values, selected) => {
      if (!el) return;
      el.innerHTML = ['All', ...values].map(v => `<option value="${U.escapeHtml(v)}">${U.escapeHtml(v)}</option>`).join('');
      setIfOptionExists(el, selected || 'All');
    };
    assign(E.csmNameFilter, uniq(this.rows.map(r => r.csmName)), this.state.csmName);
    assign(E.csmClientFilter, uniq(this.rows.map(r => r.client)), this.state.client);
    assign(E.csmSupportTypeFilter, uniq(this.rows.map(r => r.supportType)), this.state.supportType);
    assign(E.csmEffortFilter, uniq(this.rows.map(r => r.effortRequirement)), this.state.effort);
    assign(E.csmChannelFilter, uniq(this.rows.map(r => r.supportChannel)), this.state.channel);
  },
  applyFilters() {
    const s = this.state;
    const terms = (s.search || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const minMinutes = s.minMinutes === '' ? null : Number(s.minMinutes);
    const maxMinutes = s.maxMinutes === '' ? null : Number(s.maxMinutes);
    const startDate = s.startDate ? new Date(`${s.startDate}T00:00:00`) : null;
    const endDate = s.endDate ? new Date(`${s.endDate}T23:59:59.999`) : null;
    return this.rows.filter(row => {
      const hay = [row.csmName, row.client, row.supportType, row.effortRequirement, row.supportChannel, row.notes]
        .join(' ')
        .toLowerCase();
      if (terms.length && !terms.every(term => hay.includes(term))) return false;
      if (s.csmName !== 'All' && row.csmName !== s.csmName) return false;
      if (s.client !== 'All' && row.client !== s.client) return false;
      if (s.supportType !== 'All' && row.supportType !== s.supportType) return false;
      if (s.effort !== 'All' && row.effortRequirement !== s.effort) return false;
      if (s.channel !== 'All' && row.supportChannel !== s.channel) return false;
      if (minMinutes != null && row.timeSpentMinutes < minMinutes) return false;
      if (maxMinutes != null && row.timeSpentMinutes > maxMinutes) return false;
      if (startDate || endDate) {
        if (!row.parsedDate) return false;
        if (startDate && row.parsedDate < startDate) return false;
        if (endDate && row.parsedDate > endDate) return false;
      }
      return true;
    });
  },
  getFilteredCsmActivityRows() {
    return this.applyFilters();
  },
  csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  },
  downloadCsv(filename, csvText) {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },
  exportCsmActivityCsv() {
    if (!Permissions.canExportCsmActivity()) {
      UI.toast('You do not have permission to export CSM activity.');
      return;
    }
    const filteredRows = this.getFilteredCsmActivityRows();
    if (!filteredRows.length) {
      UI.toast('No CSM activity rows match the current filters.');
      return;
    }
    const headers = [
      'Timestamp',
      'CSM Name',
      'Client',
      'Time Spent (Minutes)',
      'Type of Support',
      'Effort Requirement',
      'Support Channel',
      'Notes'
    ];
    const csvLines = [
      headers.map(value => this.csvEscape(value)).join(','),
      ...filteredRows.map(row => {
        const clientDisplay = row.client || row.clientName || row.companyName || '';
        const timestampValue = row.parsedDate || row.timestamp || row.createdAt || '';
        return [
          U.formatDateTimeMMDDYYYYHHMM(timestampValue),
          row.csmName || '',
          clientDisplay,
          Math.round(Number(row.timeSpentMinutes) || 0),
          row.supportType || '',
          row.effortRequirement || '',
          row.supportChannel || '',
          row.notes || ''
        ]
          .map(value => this.csvEscape(value))
          .join(',');
      })
    ];
    const now = new Date();
    const filename = `csm-activity-export-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.csv`;
    this.downloadCsv(filename, csvLines.join('\n'));
  },
  destroyChart(chart) {
    if (chart && typeof chart.destroy === 'function') chart.destroy();
  },
  upsertChart(existingChart, ctx, config) {
    if (existingChart && existingChart.config?.type === config.type) {
      existingChart.data = config.data;
      existingChart.options = config.options || existingChart.options;
      existingChart.update('none');
      return existingChart;
    }
    this.destroyChart(existingChart);
    return new Chart(ctx, config);
  },
  renderCharts(list) {
    const minutes = row => Number(row.timeSpentMinutes) || 0;
    const countByKey = key => {
      const map = new Map();
      list.forEach(row => {
        const label = String(row[key] || 'Unspecified').trim() || 'Unspecified';
        map.set(label, (map.get(label) || 0) + 1);
      });
      return map;
    };
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekdayIndex = date => (date.getUTCDay() + 6) % 7;
    const isoWeekLabel = date => {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    };
    const totalByKey = key => {
      const map = new Map();
      list.forEach(row => {
        const label = String(row[key] || 'Unspecified').trim() || 'Unspecified';
        map.set(label, (map.get(label) || 0) + minutes(row));
      });
      return map;
    };

    if (E.csmMinutesByClientChart?.getContext) {
      const byClient = [...totalByKey('client').entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      this.charts.minutesByClient = this.upsertChart(this.charts.minutesByClient, E.csmMinutesByClientChart.getContext('2d'), {
        type: 'bar',
        data: {
          labels: byClient.map(row => row[0]),
          datasets: [{ label: 'Minutes', data: byClient.map(row => Math.round(row[1])), backgroundColor: '#f59e0b' }]
        },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: true } }, scales: { x: { beginAtZero: true, title: { display: true, text: 'Minutes' } } } }
      });
    }

    if (E.csmTypeOfSupportChart?.getContext) {
      const bySupport = [...countByKey('supportType').entries()].sort((a, b) => b[1] - a[1]);
      this.charts.typeOfSupport = this.upsertChart(this.charts.typeOfSupport, E.csmTypeOfSupportChart.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: bySupport.map(row => row[0]),
          datasets: [{ data: bySupport.map(row => row[1]), backgroundColor: ['#2563eb', '#06b6d4', '#16a34a', '#f59e0b', '#8b5cf6', '#ef4444', '#94a3b8'] }]
        },
        options: { responsive: true, cutout: '50%' }
      });
    }

    if (E.csmEffortRequirementChart?.getContext) {
      const effortCounts = { Low: 0, Medium: 0, High: 0 };
      list.forEach(row => {
        const effort = String(row.effortRequirement || '').trim().toLowerCase();
        if (effort.startsWith('h')) effortCounts.High += 1;
        else if (effort.startsWith('m')) effortCounts.Medium += 1;
        else effortCounts.Low += 1;
      });
      this.charts.effortRequirement = this.upsertChart(this.charts.effortRequirement, E.csmEffortRequirementChart.getContext('2d'), {
        type: 'pie',
        data: {
          labels: ['Low', 'Medium', 'High'],
          datasets: [{ data: [effortCounts.Low, effortCounts.Medium, effortCounts.High], backgroundColor: ['#16a34a', '#f59e0b', '#ef4444'] }]
        },
        options: { responsive: true }
      });
    }

    if (E.csmSupportChannelsChart?.getContext) {
      const byChannel = [...countByKey('supportChannel').entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      this.charts.supportChannels = this.upsertChart(this.charts.supportChannels, E.csmSupportChannelsChart.getContext('2d'), {
        type: 'bar',
        data: {
          labels: byChannel.map(row => row[0]),
          datasets: [{ label: 'Tasks', data: byChannel.map(row => row[1]), backgroundColor: '#8b5cf6' }]
        },
        options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Tasks' } } } }
      });
    }

    if (E.csmWeekdayWorkloadChart?.getContext) {
      const weekdayMinutes = new Array(7).fill(0);
      list.forEach(row => {
        if (!row.parsedDate) return;
        weekdayMinutes[weekdayIndex(row.parsedDate)] += minutes(row);
      });
      this.charts.weekdayWorkload = this.upsertChart(this.charts.weekdayWorkload, E.csmWeekdayWorkloadChart.getContext('2d'), {
        type: 'bar',
        data: { labels: weekdays, datasets: [{ label: 'Minutes', data: weekdayMinutes.map(v => Math.round(v)), backgroundColor: '#0ea5e9' }] },
        options: { responsive: true, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutes' } } } }
      });
    }

    if (E.csmWeeklyTrendChart?.getContext) {
      const byWeek = new Map();
      list.forEach(row => {
        if (!row.parsedDate) return;
        const week = isoWeekLabel(row.parsedDate);
        byWeek.set(week, (byWeek.get(week) || 0) + minutes(row));
      });
      const weeklyRows = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
      this.charts.weeklyTrend = this.upsertChart(this.charts.weeklyTrend, E.csmWeeklyTrendChart.getContext('2d'), {
        type: 'line',
        data: { labels: weeklyRows.map(r => r[0]), datasets: [{ label: 'Minutes', data: weeklyRows.map(r => Math.round(r[1])), borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.15)', fill: true, tension: 0.35 }] },
        options: { responsive: true, scales: { y: { beginAtZero: false, title: { display: true, text: 'Minutes' } } } }
      });
    }

    if (E.csmEffortMixByCsmChart?.getContext) {
      const names = [...new Set(list.map(row => row.csmName || 'Unspecified'))];
      const byEffort = { Low: new Map(), Medium: new Map(), High: new Map() };
      list.forEach(row => {
        const csm = row.csmName || 'Unspecified';
        const effort = String(row.effortRequirement || '').trim().toLowerCase();
        const bucket = effort.startsWith('h') ? 'High' : effort.startsWith('m') ? 'Medium' : 'Low';
        byEffort[bucket].set(csm, (byEffort[bucket].get(csm) || 0) + 1);
      });
      this.charts.effortMixByCsm = this.upsertChart(this.charts.effortMixByCsm, E.csmEffortMixByCsmChart.getContext('2d'), {
        type: 'bar',
        data: {
          labels: names,
          datasets: [
            { label: 'Low', data: names.map(n => byEffort.Low.get(n) || 0), backgroundColor: '#16a34a' },
            { label: 'Medium', data: names.map(n => byEffort.Medium.get(n) || 0), backgroundColor: '#f59e0b' },
            { label: 'High', data: names.map(n => byEffort.High.get(n) || 0), backgroundColor: '#ef4444' }
          ]
        },
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Tasks' } } } }
      });
    }

    if (E.csmClientConcentrationChart?.getContext) {
      const byClient = [...totalByKey('client').entries()].sort((a, b) => b[1] - a[1]);
      const top = byClient.slice(0, 5);
      const otherMinutes = byClient.slice(5).reduce((sum, row) => sum + row[1], 0);
      if (otherMinutes > 0) top.push(['Others', otherMinutes]);
      this.charts.clientConcentration = this.upsertChart(this.charts.clientConcentration, E.csmClientConcentrationChart.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: top.map(r => r[0]),
          datasets: [{ data: top.map(r => Math.round(r[1])), backgroundColor: ['#2563eb', '#06b6d4', '#16a34a', '#f59e0b', '#8b5cf6', '#94a3b8'] }]
        },
        options: { responsive: true, cutout: '50%' }
      });
    }

    if (E.csmWorkloadBalanceChart?.getContext) {
      const byCsm = [...totalByKey('csmName').entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      const avg = byCsm.length ? byCsm.reduce((sum, row) => sum + row[1], 0) / byCsm.length : 0;
      this.charts.workloadBalance = this.upsertChart(this.charts.workloadBalance, E.csmWorkloadBalanceChart.getContext('2d'), {
        data: {
          labels: byCsm.map(r => r[0]),
          datasets: [
            { type: 'bar', label: 'Total Minutes', data: byCsm.map(r => Math.round(r[1])), backgroundColor: '#3b82f6' },
            { type: 'line', label: 'Average Minutes', data: byCsm.map(() => Math.round(avg)), borderColor: '#ef4444', borderWidth: 2, pointRadius: 0, tension: 0 }
          ]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutes' } } } }
      });
    }
  },
  renderTable(list) {
    if (!E.csmTableBody) return;
    if (this.isLoading) {
      E.csmTableBody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">Loading CSM activity…</td></tr>';
      if (E.csmRowCount) E.csmRowCount.textContent = 'Loading…';
      return;
    }
    if (this.loadError) {
      E.csmTableBody.innerHTML = `<tr><td colspan="9" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.loadError)}</td></tr>`;
      if (E.csmRowCount) E.csmRowCount.textContent = 'Error';
      return;
    }
    if (!list.length) {
      const msg = this.rows.length
        ? 'No activity rows match the current filters.'
        : 'No CSM activities found in backend yet.';
      E.csmTableBody.innerHTML = `<tr><td colspan="9" class="muted" style="text-align:center;">${U.escapeHtml(msg)}</td></tr>`;
      if (E.csmRowCount) E.csmRowCount.textContent = '0 rows';
      return;
    }
    E.csmTableBody.innerHTML = list
      .map(
        row => `<tr>
          <td>${U.escapeHtml(row.timestamp || '—')}</td>
          <td>${U.escapeHtml(row.csmName || '—')}</td>
          <td>${U.escapeHtml(row.client || row.clientName || row.companyName || '—')}</td>
          <td>${Math.round(Number(row.timeSpentMinutes) || 0)}</td>
          <td>${U.escapeHtml(row.supportType || '—')}</td>
          <td>${U.escapeHtml(row.effortRequirement || '—')}</td>
          <td>${U.escapeHtml(row.supportChannel || '—')}</td>
          <td>${U.escapeHtml(row.notes || '—')}</td>
          <td>${this.canEditDelete() ? `<button class="btn ghost sm" type="button" data-csm-edit="${U.escapeAttr(row.id)}">Edit</button> <button class="btn ghost sm" type="button" data-csm-delete="${U.escapeAttr(row.id)}">Delete</button>` : '<span class="muted">—</span>'}</td>
        </tr>`
      )
      .join('');
    if (E.csmRowCount) E.csmRowCount.textContent = `${list.length} row${list.length === 1 ? '' : 's'}`;
  },
  renderKPIs(list) {
    const totalActivities = list.length;
    const totalMinutes = list.reduce((sum, row) => sum + (Number(row.timeSpentMinutes) || 0), 0);
    const averageMinutes = totalActivities ? totalMinutes / totalActivities : 0;
    const byCsm = new Map();
    const clients = new Set();
    let weightedLoadScore = 0;
    let highEffortCount = 0;
    list.forEach(row => {
      const csmName = row.csmName || 'Unspecified';
      byCsm.set(csmName, (byCsm.get(csmName) || 0) + (Number(row.timeSpentMinutes) || 0));
      if (row.client) clients.add(row.client);
      const effort = String(row.effortRequirement || '').trim().toLowerCase();
      const effortScore = effort.startsWith('h') ? 3 : effort.startsWith('m') ? 2 : effort.startsWith('l') ? 1 : 0;
      weightedLoadScore += effortScore;
      if (effort.startsWith('h')) highEffortCount += 1;
    });
    const activeCsmCount = byCsm.size;
    const activeClientCount = clients.size;
    const highEffortShare = totalActivities ? (highEffortCount / totalActivities) * 100 : 0;
    const avgWeightedScore = totalActivities ? weightedLoadScore / totalActivities : 0;

    if (E.csmKpiActivities) E.csmKpiActivities.textContent = String(totalActivities);
    if (E.csmKpiActivitiesSub) E.csmKpiActivitiesSub.textContent = `${activeCsmCount} active CSM${activeCsmCount === 1 ? '' : 's'} in current view`;
    if (E.csmKpiMinutes) E.csmKpiMinutes.textContent = String(Math.round(totalMinutes));
    if (E.csmKpiMinutesSub) E.csmKpiMinutesSub.textContent = `${Math.round(totalMinutes)} tracked minutes`;
    if (E.csmKpiAvg) E.csmKpiAvg.textContent = averageMinutes ? averageMinutes.toFixed(1) : '0';
    if (E.csmKpiAvgSub) E.csmKpiAvgSub.textContent = 'Time spent efficiency snapshot';
    if (E.csmKpiActiveClients) E.csmKpiActiveClients.textContent = String(activeClientCount);
    if (E.csmKpiActiveClientsSub) E.csmKpiActiveClientsSub.textContent = `${activeClientCount} unique clients in current view`;
    if (E.csmKpiWeightedLoad) E.csmKpiWeightedLoad.textContent = String(weightedLoadScore);
    if (E.csmKpiWeightedLoadSub) E.csmKpiWeightedLoadSub.textContent = `Average score ${avgWeightedScore.toFixed(1)} per task (Low=1, Medium=2, High=3)`;
    if (E.csmKpiHighEffortShare) E.csmKpiHighEffortShare.textContent = `${highEffortShare.toFixed(1)}%`;
    if (E.csmKpiHighEffortShareSub) E.csmKpiHighEffortShareSub.textContent = `${highEffortCount} high-effort task${highEffortCount === 1 ? '' : 's'} in current filter`;
  },
  renderInsights(list) {
    const totalMinutes = list.reduce((sum, row) => sum + (Number(row.timeSpentMinutes) || 0), 0);
    const byCsm = new Map();
    const byClient = new Map();
    const bySupport = new Map();
    const byChannel = new Map();
    const byWeekday = new Map();
    const durations = [];
    list.forEach(row => {
      const mins = Number(row.timeSpentMinutes) || 0;
      byCsm.set(row.csmName || 'Unspecified', (byCsm.get(row.csmName || 'Unspecified') || 0) + mins);
      byClient.set(row.client || 'Unspecified', (byClient.get(row.client || 'Unspecified') || 0) + mins);
      bySupport.set(row.supportType || 'Unspecified', (bySupport.get(row.supportType || 'Unspecified') || 0) + 1);
      byChannel.set(row.supportChannel || 'Unspecified', (byChannel.get(row.supportChannel || 'Unspecified') || 0) + 1);
      durations.push(mins);
      if (row.timestamp) {
        const date = new Date(row.timestamp);
        if (!isNaN(date.getTime())) {
          const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
          byWeekday.set(weekday, (byWeekday.get(weekday) || 0) + mins);
        }
      }
    });
    const topCsm = [...byCsm.entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const topClient = [...byClient.entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const primarySupport = [...bySupport.entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const primaryChannel = [...byChannel.entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const top5ClientMinutes = [...byClient.values()]
      .sort((a, b) => b - a)
      .slice(0, 5)
      .reduce((sum, value) => sum + value, 0);
    const top5ClientShare = totalMinutes ? ((top5ClientMinutes / totalMinutes) * 100).toFixed(1) : '0.0';
    const peakWeekday = [...byWeekday.entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const orderedDurations = durations.slice().sort((a, b) => a - b);
    const medianMinutes = orderedDurations.length
      ? orderedDurations.length % 2 === 0
        ? (orderedDurations[orderedDurations.length / 2 - 1] + orderedDurations[orderedDurations.length / 2]) / 2
        : orderedDurations[Math.floor(orderedDurations.length / 2)]
      : 0;
    const meanMinutes = durations.length ? totalMinutes / durations.length : 0;
    const variance = durations.length
      ? durations.reduce((sum, mins) => sum + (mins - meanMinutes) ** 2, 0) / durations.length
      : 0;
    const stdDevMinutes = Math.sqrt(variance);
    const csmMinutes = [...byCsm.values()];
    const avgCsmMinutes = csmMinutes.length ? csmMinutes.reduce((sum, mins) => sum + mins, 0) / csmMinutes.length : 0;
    const overloadedCount = csmMinutes.filter(mins => mins > avgCsmMinutes * 1.25).length;

    if (E.csmInsightList) {
      const insights = [
        ['Busiest CSM', `${topCsm[0]} is carrying the heaviest visible load by minutes.`, `${Math.round(topCsm[1])} min`],
        ['Busiest Client', `${topClient[0]} consumes the most visible support time.`, `${Math.round(topClient[1])} min`],
        ['Client Concentration', `Top 5 clients share of visible workload minutes.`, `${top5ClientShare}%`],
        ['Dominant Work Type', `${primarySupport[0]} appears most often in the current filter.`, `${primarySupport[1]}`],
        ['Primary Channel', `${primaryChannel[0]} is the main route for submitted work.`, `${primaryChannel[1]}`],
        ['Peak Weekday', `${peakWeekday[0]} carries the highest visible workload minutes.`, `${Math.round(peakWeekday[1])} min`],
        ['Median Task Duration', `Middle task duration for visible records.`, `${Math.round(medianMinutes)} min`],
        ['Workload Variability', `Standard deviation of task duration (minutes).`, `${Math.round(stdDevMinutes)} min`],
        ['Overloaded CSMs', `CSMs above 125% of average visible CSM minutes.`, `${overloadedCount}`]
      ];
      E.csmInsightList.innerHTML = insights
        .map(
          ([label, text, value]) =>
            `<article class="csm-insight-item"><div><strong>${U.escapeHtml(label)}</strong><p class="muted">${U.escapeHtml(text)}</p></div><span class="csm-insight-value">${U.escapeHtml(value)}</span></article>`
        )
        .join('');
    }

    if (E.csmTopSnapshotBody) {
      const rows = [...byCsm.entries()]
        .map(([name, minutes]) => {
          const personRows = list.filter(item => (item.csmName || 'Unspecified') === name);
          const tasks = personRows.length;
          const avg = tasks ? minutes / tasks : 0;
          const clients = new Set(personRows.map(item => item.client).filter(Boolean)).size;
          return { name, tasks, minutes, avg, clients };
        })
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 8);
      E.csmTopSnapshotBody.innerHTML = rows.length
        ? rows
            .map(
              row => `<tr><td>${U.escapeHtml(row.name)}</td><td>${row.tasks}</td><td>${Math.round(row.minutes)}</td><td>${row.avg.toFixed(1)}</td><td>${row.clients}</td></tr>`
            )
            .join('')
        : '<tr><td colspan="5" class="muted" style="text-align:center;">No data for current filters.</td></tr>';
    }
  },
  refresh() {
    const canCreate = this.canCreate();
    const canView = Permissions.canViewCsmActivity();
    const canExport = Permissions.canExportCsmActivity();
    if (E.csmInlineSubmitBtn) {
      E.csmInlineSubmitBtn.style.display = canCreate ? '' : 'none';
    }
    if (E.csmExportCsvBtn) {
      E.csmExportCsvBtn.style.display = canExport ? '' : 'none';
      E.csmExportCsvBtn.disabled = this.isLoading || !canExport;
      if (!canExport) {
        E.csmExportCsvBtn.title = 'You do not have permission to export this data.';
      } else {
        E.csmExportCsvBtn.removeAttribute('title');
      }
    }
    ['csmInlineTimestamp','csmInlineCsmName','csmInlineClient','csmInlineMinutes','csmInlineSupportType','csmInlineEffort','csmInlineChannel','csmInlineNotes']
      .forEach(id => { if (E[id]) E[id].disabled = !canCreate || this.isSaving; });
    const filtered = this.getFilteredCsmActivityRows();
    this.renderKPIs(filtered);
    this.renderInsights(filtered);
    this.renderCharts(filtered);
    this.renderTable(filtered);
    const paginationHost = U.ensurePaginationHost({ hostId: 'csmPagination', anchor: E.csmTableBody?.closest?.('.table-wrap') });
    U.renderPaginationControls({
      host: paginationHost,
      moduleKey: 'csm',
      page: this.page,
      pageSize: this.limit,
      hasMore: this.hasMore,
      returned: this.returned,
      loading: this.isLoading,
      pageSizeOptions: [25, 50, 100],
      onPageChange: nextPage => {
        this.page = U.normalizePageNumber(nextPage, 1);
        this.loadAndRefresh({ force: true });
      },
      onPageSizeChange: nextSize => {
        this.limit = U.normalizePageSize(nextSize, 50, 200);
        this.page = 1;
        this.loadAndRefresh({ force: true });
      }
    });
  },
  async openForm(row = null) {
    if (!E.csmFormModal || !E.csmForm) return;
    const identity = this.getCurrentCsmIdentity();
    await this.ensureClientOptions();
    E.csmForm.dataset.mode = row ? 'edit' : 'create';
    E.csmForm.dataset.id = row?.id || '';
    E.csmForm.dataset.timestamp = row?.timestamp || '';
    if (E.csmFormTitle) E.csmFormTitle.textContent = row ? 'Edit CSM Daily Activity Tracker' : 'CSM Daily Activity Tracker';
    const shouldKeepRowCsm = row?.csmName && row.csmName.trim();
    if (E.csmFormCsmName) E.csmFormCsmName.value = shouldKeepRowCsm ? row.csmName : identity.csmName;
    if (E.csmFormCsmName) E.csmFormCsmName.readOnly = !this.isAdminUser();
    E.csmForm.dataset.csmUserId = row?.csmUserId || identity.csmUserId;
    E.csmForm.dataset.csmEmail = row?.csmEmail || identity.csmEmail;
    const selectedOption = this.findClientOptionForRow(row);
    const selectedClientValue = selectedOption?.value || '';
    const selectedClientName = selectedOption?.client_name || selectedOption?.company_name || selectedOption?.client || row?.client || row?.clientName || row?.companyName || '';
    if (!selectedOption && selectedClientName) {
      const normalizedSelectedName = this.normalizeClientName(selectedClientName);
      const exists = this.clientOptions.some(option =>
        this.normalizeClientName(option.client_name || option.company_name || option.client || option.label) === normalizedSelectedName
      );
      if (!exists) {
        this.clientOptions.push({
          value: normalizedSelectedName,
          label: selectedClientName,
          client_id: '',
          client_name: selectedClientName,
          company_name: selectedClientName,
          client: selectedClientName,
          metadata: { sources: ['csm_activities'], onboarding_ids: [], agreement_ids: [] },
          search_text: selectedClientName.toLowerCase()
        });
      }
    }
    this.populateClientSelect(selectedClientValue || this.normalizeClientName(selectedClientName), selectedClientName);
    this.applySelectedClientToForm(
      selectedOption || (selectedClientName ? { client_name: selectedClientName, value: this.normalizeClientName(selectedClientName) } : null)
    );
    if (E.csmFormCompanyName) E.csmFormCompanyName.readOnly = true;
    if (E.csmFormMinutes) E.csmFormMinutes.value = row ? String(Math.round(Number(row.timeSpentMinutes) || 0)) : '';
    if (E.csmFormSupportType) E.csmFormSupportType.value = row?.supportType || '';
    if (E.csmFormEffort) E.csmFormEffort.value = row?.effortRequirement || '';
    if (E.csmFormChannel) E.csmFormChannel.value = row?.supportChannel || '';
    if (E.csmFormNotes) E.csmFormNotes.value = row?.notes || '';
    if (E.csmFormDeleteBtn) E.csmFormDeleteBtn.style.display = row && this.canEditDelete() ? '' : 'none';
    this.setBusySaving(false);
    E.csmFormModal.style.display = 'flex';
    E.csmFormModal.setAttribute('aria-hidden', 'false');
  },
  closeForm() {
    if (!E.csmFormModal) return;
    E.csmFormModal.style.display = 'none';
    E.csmFormModal.setAttribute('aria-hidden', 'true');
  },
  readFormValues() {
    const selectedClientValue = String(E.csmFormClient?.value || '').trim();
    const selectedOption = this.findSelectedClientOption(selectedClientValue) || {};
    console.log('[csm activity] selected client', selectedOption);
    const selectedClientName = String(
      selectedOption.client_name ||
      selectedOption.company_name ||
      selectedOption.client ||
      selectedOption.label ||
      ''
    ).trim();
    console.log('[csm activity] selected client name', selectedClientName);
    const syncedCompanyName = selectedClientName;
    return {
      csmName: String(E.csmFormCsmName?.value || '').trim(),
      csmUserId: String(E.csmForm?.dataset.csmUserId || '').trim(),
      csmEmail: String(E.csmForm?.dataset.csmEmail || '').trim(),
      client: selectedClientName,
      clientId: String(selectedOption.client_id || '').trim(),
      clientName: selectedClientName,
      companyName: syncedCompanyName,
      timeSpentMinutes: Number(E.csmFormMinutes?.value || 0),
      supportType: String(E.csmFormSupportType?.value || '').trim(),
      effortRequirement: String(E.csmFormEffort?.value || '').trim(),
      supportChannel: String(E.csmFormChannel?.value || '').trim(),
      notes: String(E.csmFormNotes?.value || '').trim()
    };
  },
  readInlineFormValues() {
    return {
      timestamp: String(E.csmInlineTimestamp?.value || '').trim(),
      csmName: String(E.csmInlineCsmName?.value || '').trim(),
      client: String(E.csmInlineClient?.value || '').trim(),
      timeSpentMinutes: Number(E.csmInlineMinutes?.value || 0),
      supportType: String(E.csmInlineSupportType?.value || '').trim(),
      effortRequirement: String(E.csmInlineEffort?.value || '').trim(),
      supportChannel: String(E.csmInlineChannel?.value || '').trim(),
      notes: String(E.csmInlineNotes?.value || '').trim()
    };
  },
  clearInlineForm() {
    if (E.csmInlineCreateForm && typeof E.csmInlineCreateForm.reset === 'function') {
      E.csmInlineCreateForm.reset();
    }
  },
  validateForm(activity) {
    if (!activity.csmName || !activity.client || !activity.supportType || !activity.effortRequirement || !activity.supportChannel) {
      return 'Please complete all required fields.';
    }
    if (!Number.isFinite(activity.timeSpentMinutes) || activity.timeSpentMinutes < 1) {
      return 'Time spent minutes must be a valid number greater than or equal to 1.';
    }
    return '';
  },
  async submitForm() {
    const mode = E.csmForm?.dataset.mode === 'edit' ? 'edit' : 'create';
    const id = String(E.csmForm?.dataset.id || '').trim();
    const activity = this.readFormValues();
    const validationError = this.validateForm(activity);
    if (validationError) {
      UI.toast(validationError);
      return;
    }
    this.setBusySaving(true);
    try {
      if (mode === 'edit') {
        if (!Permissions.canUpdateCsmActivity()) throw new Error('You do not have permission to update CSM activity.');
        const existingTimestamp = String(E.csmForm?.dataset.timestamp || '').trim();
        await window.CsmActivityService.updateActivity(id, {
          ...this.viewToBackendActivity(activity),
          timestamp: existingTimestamp || undefined
        });
        UI.toast('CSM activity updated.');
      } else {
        if (!Permissions.canCreateCsmActivity()) throw new Error('You do not have permission to create CSM activity.');
        await window.CsmActivityService.createActivity({
          ...this.viewToBackendActivity(activity),
          timestamp: new Date().toISOString()
        });
        UI.toast('CSM activity created.');
      }
      this.closeForm();
      await this.loadAndRefresh({ force: true });
    } catch (error) {
      if (isAuthError(error)) {
        await handleExpiredSession('Session expired while saving CSM activity.');
        return;
      }
      UI.toast('Unable to save CSM activity: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setBusySaving(false);
    }
  },
  async submitInlineForm() {
    if (!Permissions.canCreateCsmActivity()) {
      UI.toast('You do not have permission to create CSM activity.');
      return;
    }
    const activity = this.readInlineFormValues();
    const validationError = this.validateForm(activity);
    if (validationError) {
      UI.toast(validationError);
      return;
    }
    this.setBusySaving(true);
    try {
      await window.CsmActivityService.createActivity({
        ...this.viewToBackendActivity(activity),
        timestamp: new Date().toISOString()
      });
      UI.toast('CSM activity created.');
      this.clearInlineForm();
      await this.loadAndRefresh({ force: true });
    } catch (error) {
      if (isAuthError(error)) {
        await handleExpiredSession('Session expired while creating CSM activity.');
        return;
      }
      UI.toast('Unable to create CSM activity: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setBusySaving(false);
    }
  },
  async deleteActivity(id) {
    if (!id || !Permissions.canDeleteCsmActivity()) return;
    const confirmed = window.confirm('Delete this CSM activity? This cannot be undone.');
    if (!confirmed) return;
    this.setBusySaving(true);
    try {
      await window.CsmActivityService.deleteActivity(id);
      UI.toast('CSM activity deleted.');
      this.closeForm();
      await this.loadAndRefresh({ force: true });
    } catch (error) {
      if (isAuthError(error)) {
        await handleExpiredSession('Session expired while deleting CSM activity.');
        return;
      }
      UI.toast('Unable to delete CSM activity: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setBusySaving(false);
    }
  }
};

function wireCSMActivity() {
  CSMActivity.hydrateOptions();
  CSMActivity.refresh();

  if (E.csmAddActivityBtn) {
    E.csmAddActivityBtn.addEventListener('click', () => {
      if (!Permissions.canCreateCsmActivity()) {
        UI.toast('You do not have permission to create CSM activity.');
        return;
      }
      CSMActivity.openForm();
    });
  }
  if (E.csmExportCsvBtn) {
    E.csmExportCsvBtn.addEventListener('click', () => {
      CSMActivity.exportCsmActivityCsv();
    });
  }

  const bindState = (element, key, type = 'value', { reload = false } = {}) => {
    if (!element) return;
    const sync = () => {
      CSMActivity.state[key] = type === 'valueAsNumber' ? element.valueAsNumber : element.value;
      if (type === 'valueAsNumber' && Number.isNaN(CSMActivity.state[key])) CSMActivity.state[key] = '';
      if (reload) {
        CSMActivity.page = 1;
        CSMActivity.loadAndRefresh({ force: true });
      } else {
        CSMActivity.refresh();
      }
    };
    element.addEventListener('input', sync);
    element.addEventListener('change', sync);
  };

  bindState(E.csmSearchInput, 'search', 'value', { reload: true });
  bindState(E.csmNameFilter, 'csmName', 'value', { reload: true });
  bindState(E.csmClientFilter, 'client', 'value', { reload: true });
  bindState(E.csmSupportTypeFilter, 'supportType', 'value', { reload: true });
  bindState(E.csmEffortFilter, 'effort', 'value', { reload: true });
  bindState(E.csmChannelFilter, 'channel', 'value', { reload: true });
  bindState(E.csmMinMinutesFilter, 'minMinutes');
  bindState(E.csmMaxMinutesFilter, 'maxMinutes');
  bindState(E.csmStartDateFilter, 'startDate', 'value', { reload: true });
  bindState(E.csmEndDateFilter, 'endDate', 'value', { reload: true });

  if (E.csmTableBody) {
    E.csmTableBody.addEventListener('click', event => {
      const editId = event.target?.getAttribute('data-csm-edit');
      if (editId) {
        const row = CSMActivity.rows.find(item => item.id === editId);
        if (row) CSMActivity.openForm(row);
        return;
      }
      const deleteId = event.target?.getAttribute('data-csm-delete');
      if (deleteId) {
        CSMActivity.deleteActivity(deleteId);
      }
    });
  }

  if (E.csmFormCloseBtn) E.csmFormCloseBtn.addEventListener('click', () => CSMActivity.closeForm());
  if (E.csmFormCancelBtn) E.csmFormCancelBtn.addEventListener('click', () => CSMActivity.closeForm());
  if (E.csmFormModal) {
    E.csmFormModal.addEventListener('click', event => {
      if (event.target === E.csmFormModal) CSMActivity.closeForm();
    });
  }
  if (E.csmForm) {
    E.csmForm.addEventListener('submit', event => {
      event.preventDefault();
      CSMActivity.submitForm();
    });
  }
  if (E.csmFormClientSearch) {
    E.csmFormClientSearch.addEventListener('input', () => {
      CSMActivity.populateClientSelect(E.csmFormClient?.value || '', E.csmFormClientSearch.value);
    });
  }
  if (E.csmFormClient) {
    E.csmFormClient.addEventListener('change', () => {
      const selected = CSMActivity.findSelectedClientOption(E.csmFormClient.value);
      CSMActivity.applySelectedClientToForm(selected);
    });
  }
  if (E.csmFormDeleteBtn) {
    E.csmFormDeleteBtn.addEventListener('click', () => {
      const id = String(E.csmForm?.dataset.id || '').trim();
      if (id) CSMActivity.deleteActivity(id);
    });
  }
  if (E.csmInlineCreateForm) {
    E.csmInlineCreateForm.addEventListener('submit', event => {
      event.preventDefault();
      CSMActivity.submitInlineForm();
    });
  }
}

/* ---------- Keyboard shortcuts ---------- */

function wireKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    const isInputLike =
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

    // Ctrl/Cmd + K → AI query box (Insights tab)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setActiveView('insights');
      if (E.aiQueryInput) {
        E.aiQueryInput.focus();
        if (E.aiQueryInput.select) E.aiQueryInput.select();
      }
      return;
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // "/" → focus search (when not already in an input)
    if (e.key === '/' && !isInputLike) {
      e.preventDefault();
      setActiveView('issues');
      if (E.searchInput) {
        E.searchInput.focus();
        if (E.searchInput.select) E.searchInput.select();
      }
      return;
    }

    if (isInputLike) return;

    // 1/2/3/4/5/6/7/8/9 → switch tabs
    if (e.key === '1') {
      setActiveView('issues');
    } else if (e.key === '2') {
      setActiveView('calendar');
    } else if (e.key === '3') {
      setActiveView('insights');
    } else if (e.key === '4') {
      setActiveView('csm');
    } else if (e.key === '5') {
      setActiveView('leads');
    } else if (e.key === '6') {
      setActiveView('deals');
    } else if (e.key === '7') {
      setActiveView('proposals');
    } else if (e.key === '8') {
      setActiveView('proposalCatalog');
    } else if (e.key === '9') {
      setActiveView('agreements');
    } else if (e.key === '0') {
      setActiveView('clients');
    } else if (e.key === '-' && Permissions.canAccessTab('users')) {
      setActiveView('users');
    } else if (e.key === '=' && Permissions.canAccessTab('rolePermissions')) {
      setActiveView('rolePermissions');
    } else if (e.key === '+' && Permissions.canAccessTab('notificationSetup')) {
      setActiveView('notificationSetup');
    }
  });
}

function logApiStartupDiagnostics() {
  console.info('[startup/auth] Supabase mode enabled', {
    hasSupabaseConfig: window.SupabaseClient?.hasConfig?.(),
    supabaseUrl: window.SupabaseClient?.getUrl?.() || ''
  });
}

function isResetPasswordRoute() {
  const normalizedPath = String(window.location.pathname || '/')
    .replace(/\/+$/, '')
    .toLowerCase();
  return normalizedPath === '/reset-password';
}

async function mountResetPasswordView() {
  if (!isResetPasswordRoute()) return false;
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:24px;">
      <section class="card" style="width:min(520px,100%);padding:20px;">
        <h1 style="margin:0 0 8px;">Reset Password</h1>
        <p id="passwordRecoveryMessage" class="muted" style="margin:0 0 16px;">Verifying your password recovery session…</p>
        <form id="passwordRecoveryForm" style="display:grid;gap:10px;">
          <label for="newPasswordInput">New Password</label>
          <input id="newPasswordInput" type="password" minlength="8" autocomplete="new-password" required />
          <label for="confirmPasswordInput">Confirm Password</label>
          <input id="confirmPasswordInput" type="password" minlength="8" autocomplete="new-password" required />
          <button class="btn" type="submit">Update Password</button>
        </form>
      </section>
    </main>
  `;

  const messageEl = document.getElementById('passwordRecoveryMessage');
  const formEl = document.getElementById('passwordRecoveryForm');
  const newPasswordEl = document.getElementById('newPasswordInput');
  const confirmPasswordEl = document.getElementById('confirmPasswordInput');
  const setMessage = (message = '') => {
    if (messageEl) messageEl.textContent = message;
  };
  const client = window.SupabaseClient?.getClient?.();
  if (!client) {
    setMessage('Unable to initialize password recovery because Supabase client is not available.');
    if (formEl) formEl.style.display = 'none';
    return true;
  }

  let hasRecoverySession = false;
  const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  if (hashParams.get('type') === 'recovery') hasRecoverySession = true;

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') hasRecoverySession = true;
    if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) hasRecoverySession = true;
  });

  try {
    const { data, error } = await client.auth.getSession();
    if (!error && data?.session?.user) hasRecoverySession = true;
  } catch (error) {
    console.warn('[reset-password] Unable to read session', error);
  }

  if (!hasRecoverySession) {
    setMessage('Password recovery session not found. Please open the latest reset link from your email.');
  } else {
    setMessage('Enter your new password below.');
  }

  formEl?.addEventListener('submit', async event => {
    event.preventDefault();
    const newPassword = String(newPasswordEl?.value || '');
    const confirmPassword = String(confirmPasswordEl?.value || '');
    if (!newPassword || !confirmPassword) {
      setMessage('Please enter and confirm your new password.');
      return;
    }
    if (newPassword.length < 8) {
      setMessage('Password should be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('New Password and Confirm Password must match.');
      return;
    }
    try {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await client.auth.signOut();
      setMessage('Password updated successfully. Please log in again.');
      formEl.reset();
    } catch (error) {
      setMessage(`Unable to update password: ${String(error?.message || 'Unknown error')}`);
    }
  });
  return true;
}

/* ---------- Bootstrapping ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  cacheEls();
  registerServiceWorkerSafely();
  wirePwaInstallBanner();
  const mountedRecoveryRoute = await mountResetPasswordView();
  if (mountedRecoveryRoute) return;
  logApiStartupDiagnostics();
  console.info('[deep-link] startup hash', { hash: window.location.hash });
  console.info('[router] startup url', {
    href: window.location.href,
    search: window.location.search,
    hash: window.location.hash
  });
  if (typeof Api?.runAuthProxyHealthCheck === 'function') {
    Api.runAuthProxyHealthCheck().catch(error => {
      console.warn('[startup/auth] Initial auth health check failed', error);
    });
  }
  capturePendingDeepLink();
  const restored = await Session.restore();
  console.info('[startup/auth] restore result', { restored });

  Filters.load();
  ColumnManager.load();
  SavedViews.load();
  ColumnManager.renderPanel();
  ColumnManager.apply();
  SavedViews.refreshSelect();
  
  if (E.pageSize) {
    E.pageSize.value = String(GridState.pageSize);
  }
  TicketPaginationState.limit = U.normalizePageSize(GridState.pageSize, 50, 200);
  GridState.pageSize = TicketPaginationState.limit;

  wireDashboardGate();
  wireCore();
  window.addEventListener('hashchange', () => {
    routeAppHashAfterReady().catch(error => {
      console.warn('[router] hashchange routing failed', error);
    });
  });
  if (window.UserAdmin?.wire) UserAdmin.wire();
  if (window.RolesAdmin?.wire) RolesAdmin.wire();
  ensureNotificationSetupMounted();
  if (window.NotificationSetup?.wire) NotificationSetup.wire();
  wireSorting();
  wirePaging();
  wireFilters();
  wireTheme();
  wireConnectivity();
  wireModals();
  wireCalendar();
  wireFreezeWindows();
  wirePlanner();
  wireAIQuery();
  wireCSMActivity();
  if (window.Leads?.wire) Leads.wire();
  if (window.Deals?.wire) Deals.wire();
  if (window.Proposals?.wire) Proposals.wire();
  if (window.Agreements?.wire) Agreements.wire();
  if (window.OperationsOnboarding?.wire) OperationsOnboarding.wire();
  if (window.TechnicalAdmin?.wire) TechnicalAdmin.wire();
  if (window.Invoices?.init) Invoices.init();
  if (window.Receipts?.init) Receipts.init();
  if (window.Clients?.wire) Clients.wire();
  if (window.ProposalCatalog?.wire) ProposalCatalog.wire();
  if (window.Workflow?.wire) Workflow.wire();
  wireKeyboardShortcuts();
  if (window.Notifications?.wire) Notifications.wire();
  if (window.PushNotifications?.wire) PushNotifications.wire();
  if (window.PushNotifications?.init) await PushNotifications.init();

  const isAuthenticated = Session.isAuthenticated();
  ensureNotificationSetupMounted();
  if (isAuthenticated) {
    const role = Session.role();
    if (!Permissions.canLoadRuntimeMatrix(role)) {
      // Runtime matrix is intentionally skipped for non-admin roles to prevent
      // startup failures when role_permissions is restricted.
      Permissions.reset();
      Permissions.state.loaded = true;
    } else {
      await Permissions.loadMatrix(true);
    }
    console.info('[permission self-test]', {
      role: Session.role(),
      isAuthenticated: Session.isAuthenticated(),
      authContext: Session.authContext(),
      hasAppPermissions: Boolean(window.AppPermissions),
      ticketsList: Permissions.canPerformAction('tickets', 'list', Session.role()),
      proposalsList: Permissions.canPerformAction('proposals', 'list', Session.role()),
      notificationsList: Permissions.canPerformAction('notifications', 'list', Session.role()),
      notificationsUnread: Permissions.canPerformAction('notifications', 'get_unread_count', Session.role()),
      canLoadRuntimeMatrix: Permissions.canLoadRuntimeMatrix(Session.role())
    });
    UI.applyRolePermissions();
  }

  loadFreezeWindowsCache();
  renderFreezeWindows();
  
  if (!Session.isAuthenticated()) {
    const view = localStorage.getItem(LS_KEYS.view) || 'issues';
    setActiveView(
      view === 'calendar' ||
        view === 'insights' ||
        view === 'csm' ||
        view === 'leads' ||
        view === 'deals' ||
        view === 'proposals' ||
        view === 'agreements' ||
        view === 'invoices' ||
        view === 'receipts' ||
        view === 'proposalCatalog' ||
        view === 'notifications' ||
        view === 'notificationSetup' ||
        view === 'workflow' ||
        view === 'users' ||
        view === 'rolePermissions'
        ? view
        : 'issues'
    );
  }

  if (isAuthenticated && Session.isAuthenticated()) {
    const startupLoaders = [loadEvents(false)];
    if (
      Permissions.can('tickets', 'list') ||
      Permissions.can('tickets', 'view') ||
      Permissions.can('tickets', 'manage')
    ) {
      startupLoaders.unshift(loadIssues(false));
    }
    const startupResults = await Promise.allSettled(startupLoaders);
    const rejected = startupResults.filter(result => result.status === 'rejected');
    if (rejected.length) {
      console.warn('Startup data refresh had module failures; preserving active session.', rejected);
      UI.toast('Some dashboard modules could not be loaded, but your session is still active.');
    }
  }
});
