const API_URL = "https://script.google.com/macros/s/AKfycbzeiw45H5PVs8_91N8x-u-COmmhzotE41vGgy40-NtEO6vKEMwNgott4VQ0SRy5WZf_/exec";
const UTIL_CAP_PCT = 140;

const FETCH_TIMEOUT_MS = 12000;
const JSONP_TIMEOUT_MS = 12000;
const API_RETRY_COUNT = 1;
const API_RETRY_DELAY_MS = 350;
const CACHE_TTL_MS = 5 * 60 * 1000;
const PERIODS_CACHE_TTL_MS = 60 * 60 * 1000;

const els = {
  period: document.getElementById("period"),
  from: document.getElementById("from"),
  to: document.getElementById("to"),
  csmFilter: document.getElementById("csmFilter"),
  clientFilter: document.getElementById("clientFilter"),
  locationsFilter: document.getElementById("locationsFilter"),

  atRiskToggle: document.getElementById("atRiskToggle"),
  overageOnlyToggle: document.getElementById("overageOnlyToggle"),

  addSessionBtn: document.getElementById("addSessionBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  exportClientsBtn: document.getElementById("exportClientsBtn"),
  exportSessionsBtn: document.getElementById("exportSessionsBtn"),

  overviewViewBtn: document.getElementById("overviewViewBtn"),
  plannerViewBtn: document.getElementById("plannerViewBtn"),
  overviewView: document.getElementById("overviewView"),
  plannerView: document.getElementById("plannerView"),
  plannerSummaryText: document.getElementById("plannerSummaryText"),
  plannerPeriodBadge: document.getElementById("plannerPeriodBadge"),
  plannerPriorityList: document.getElementById("plannerPriorityList"),
  plannerActionsList: document.getElementById("plannerActionsList"),
  plannerSnapshot: document.getElementById("plannerSnapshot"),

  connectionPill: document.getElementById("connectionPill"),
  connDot: document.getElementById("connDot"),
  connText: document.getElementById("connText"),
  lastRefreshed: document.getElementById("lastRefreshed"),
  overviewTitle: document.getElementById("overviewTitle"),
  overviewSubtitle: document.getElementById("overviewSubtitle"),
  heroPeriodValue: document.getElementById("heroPeriodValue"),
  heroRiskValue: document.getElementById("heroRiskValue"),
  heroActionsValue: document.getElementById("heroActionsValue"),
  overviewChips: document.getElementById("overviewChips"),

  k_totalSessions: document.getElementById("k_totalSessions"),
  k_totalMinutes: document.getElementById("k_totalMinutes"),
  k_avg: document.getElementById("k_avg"),
  k_clients: document.getElementById("k_clients"),
  k_committed: document.getElementById("k_committed"),
  k_over: document.getElementById("k_over"),
  k_over_amt: document.getElementById("k_over_amt"),
  k_quality: document.getElementById("k_quality"),

  attentionList: document.getElementById("attentionList"),
  attentionEmpty: document.getElementById("attentionEmpty"),

  actionsList: document.getElementById("actionsList"),
  actionsEmpty: document.getElementById("actionsEmpty"),
  copyActionsBtn: document.getElementById("copyActionsBtn"),

  clientSearch: document.getElementById("clientSearch"),
  sessionSearch: document.getElementById("sessionSearch"),
  clearClientSearch: document.getElementById("clearClientSearch"),
  clearSessionSearch: document.getElementById("clearSessionSearch"),

  clientsColsBtn: document.getElementById("clientsColsBtn"),
  clientsColsMenu: document.getElementById("clientsColsMenu"),
  sessionsColsBtn: document.getElementById("sessionsColsBtn"),
  sessionsColsMenu: document.getElementById("sessionsColsMenu"),

  friendlyError: document.getElementById("friendlyError"),
  friendlyErrorDetails: document.getElementById("friendlyErrorDetails"),
  jsonpTestLink: document.getElementById("jsonpTestLink"),
  copyDebugBtn: document.getElementById("copyDebugBtn"),

  drawerBackdrop: document.getElementById("drawerBackdrop"),
  drawer: document.getElementById("drawer"),
  drawerCloseBtn: document.getElementById("drawerCloseBtn"),
  drawerTitle: document.getElementById("drawerTitle"),
  drawerSub: document.getElementById("drawerSub"),
  drawerDot: document.getElementById("drawerDot"),
  drawerUtilText: document.getElementById("drawerUtilText"),
  drawerCommitted: document.getElementById("drawerCommitted"),
  drawerConsumed: document.getElementById("drawerConsumed"),
  drawerRemaining: document.getElementById("drawerRemaining"),
  drawerOverage: document.getElementById("drawerOverage"),
  drawerSessions: document.getElementById("drawerSessions"),
  drawerHints: document.getElementById("drawerHints"),
  drawerCopyBtn: document.getElementById("drawerCopyBtn"),
  drawerFocusBtn: document.getElementById("drawerFocusBtn"),
  drawerClearFocusBtn: document.getElementById("drawerClearFocusBtn"),

  modalBackdrop: document.getElementById("modalBackdrop"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  resetSettingsBtn: document.getElementById("resetSettingsBtn"),
  warnThreshold: document.getElementById("warnThreshold"),
  actionThreshold: document.getElementById("actionThreshold"),
  enableAlertsBtn: document.getElementById("enableAlertsBtn"),
  alertsDot: document.getElementById("alertsDot"),
  alertsText: document.getElementById("alertsText"),
  resetColsBtn: document.getElementById("resetColsBtn"),
};

let charts = { daily: null, topClients: null, clientTrend: null };
let tables = { clients: null, sessions: null };
let currentDrawerClient = null;
let activeRefreshController = null;
let refreshSequence = 0;

let state = {
  periods: [],
  rawSummary: null,
  rawSessions: [],
  lastDebug: null,
  currentView: null,
  activeUiView: "overview",
};

const LS = {
  settings: "csmDashSettings_v2",
  rates: "csmDashRates",
  alertSnapshot: "csmDashAlertSnapshot_v2",
  clientCols: "csmDashClientCols_v1",
  sessionCols: "csmDashSessionCols_v1",
  preferredTransport: "csmDashPreferredTransport_v1",
};

const defaultSettings = {
  warnThreshold: 0.80,
  actionThreshold: 0.92,
  alertsEnabled: false,
};

const cache = {
  periods: { value: null, ts: 0 },
  summaryByPeriod: new Map(),
  sessionsByKey: new Map(),
};

function nowMs() {
  return Date.now();
}

function isFresh(entry, ttl) {
  return !!entry && (nowMs() - entry.ts) < ttl;
}

function getMapCache(map, key, ttl) {
  const entry = map.get(key);
  return isFresh(entry, ttl) ? entry.value : null;
}

function setMapCache(map, key, value) {
  map.set(key, { value, ts: nowMs() });
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS.settings) || "null");
    return { ...defaultSettings, ...(s || {}) };
  } catch (e) {
    return { ...defaultSettings };
  }
}

function saveSettings(partial) {
  const cur = loadSettings();
  const next = { ...cur, ...partial };
  localStorage.setItem(LS.settings, JSON.stringify(next));
  return next;
}

function loadRates() {
  try {
    return JSON.parse(localStorage.getItem(LS.rates) || "{}");
  } catch (e) {
    return {};
  }
}

function saveRates(rates) {
  localStorage.setItem(LS.rates, JSON.stringify(rates || {}));
}

let SETTINGS = loadSettings();

const fmtInt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString();
const fmt1 = (n) => (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
const fmt2 = (n) => (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtPct = (x) => (x == null ? "—" : (x * 100).toFixed(1) + "%");

function fmtCurrency(amount, currency) {
  if (!Number.isFinite(amount)) return "—";
  try {
    return amount.toLocaleString(undefined, {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    });
  } catch (e) {
    return (currency || "") + " " + fmt2(amount);
  }
}

function todayPeriod() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function parsePeriod(period) {
  const [y, m] = String(period || "").split("-").map((x) => parseInt(x, 10));
  if (!y || !m) return null;
  return { y, m };
}

function startEndOfPeriod(period) {
  const p = parsePeriod(period);
  if (!p) return null;
  const start = new Date(p.y, p.m - 1, 1);
  const end = new Date(p.y, p.m, 0);
  return { start, end };
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMonths(period, delta) {
  const p = parsePeriod(period);
  if (!p) return period;
  const base = new Date(p.y, p.m - 1, 1);
  base.setMonth(base.getMonth() + delta);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

function clampDateToPeriod(dateIso, period) {
  const se = startEndOfPeriod(period);
  if (!se || !dateIso) return dateIso;
  const d = new Date(dateIso + "T00:00:00");
  if (d < se.start) return isoDate(se.start);
  if (d > se.end) return isoDate(se.end);
  return isoDate(d);
}

function setConnection(stateName, message) {
  els.connDot.className = "dot " + (stateName === "ok" ? "good" : stateName === "warn" ? "warn" : "bad");
  els.connText.textContent = message;
}

function setKPI(el, value) {
  el.textContent = value;
}

function utilClass(util) {
  if (util == null) return "good";
  if (util >= 1.0) return "bad";
  if (util >= SETTINGS.warnThreshold) return "warn";
  return "good";
}

function normalizeStr(s) {
  return String(s ?? "").trim();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(url) {
  try {
    const u = new URL(String(url || ""), window.location.href);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    return "";
  } catch (e) {
    return "";
  }
}

function sanitizeDateRangeInputs() {
  let from = els.from.value || "";
  let to = els.to.value || "";

  if (from && to && from > to) {
    const tmp = from;
    from = to;
    to = tmp;
    els.from.value = from;
    els.to.value = to;
  }

  const period = els.period.value || todayPeriod();
  if (from) {
    const clamped = clampDateToPeriod(from, period);
    if (clamped !== from) {
      from = clamped;
      els.from.value = clamped;
    }
  }
  if (to) {
    const clamped = clampDateToPeriod(to, period);
    if (clamped !== to) {
      to = clamped;
      els.to.value = clamped;
    }
  }

  if (from && to && from > to) {
    to = from;
    els.to.value = to;
  }

  return { from, to };
}

function getUiFilters() {
  return {
    period: els.period.value || todayPeriod(),
    from: els.from.value || "",
    to: els.to.value || "",
    csm: els.csmFilter.value || "all",
    client: els.clientFilter.value || "all",
    locationsMode: els.locationsFilter.value || "all",
    atRiskOnly: els.atRiskToggle.checked,
    overageOnly: els.overageOnlyToggle.checked,
  };
}

function summarizeTransport(transports) {
  const uniq = [...new Set((transports || []).filter(Boolean))];
  if (!uniq.length) return "Connected";
  if (uniq.every((t) => t.startsWith("cache"))) return "Loaded from cache";
  if (uniq.includes("jsonp")) return "Connected (fast path)";
  return "Connected";
}

function getPreferredTransport() {
  const value = localStorage.getItem(LS.preferredTransport);
  return value === "json" || value === "jsonp" ? value : "";
}

function rememberPreferredTransport(transport) {
  if (transport === "json" || transport === "jsonp") {
    localStorage.setItem(LS.preferredTransport, transport);
  }
}

function getPreferredTransports() {
  const stored = getPreferredTransport();
  if (stored === "jsonp") return ["jsonp", "json"];
  if (stored === "json") return ["json", "jsonp"];
  return ["jsonp", "json"];
}

function jsonp(url, options = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const sep = url.includes("?") ? "&" : "?";
    const src = url + sep + "__ts=" + Date.now() + "&callback=" + cb;
    const s = document.createElement("script");
    const signal = options.signal || null;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : JSONP_TIMEOUT_MS;

    let done = false;
    let timeoutId = null;
    let abortHandler = null;

    function cleanup() {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      if (abortHandler && signal) signal.removeEventListener("abort", abortHandler);
      try { delete window[cb]; } catch (e) {}
      s.remove();
    }

    if (signal?.aborted) {
      reject(new Error("Request aborted"));
      return;
    }

    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };

    abortHandler = () => {
      cleanup();
      reject(new Error("Request aborted"));
    };

    if (signal) signal.addEventListener("abort", abortHandler, { once: true });

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    s.async = true;
    s.src = src;
    s.onerror = () => {
      cleanup();
      reject(new Error("JSONP load error"));
    };

    document.head.appendChild(s);
  });
}

async function fetchJson(url, options = {}) {
  const sep = url.includes("?") ? "&" : "?";
  const ctrl = new AbortController();
  const externalSignal = options.signal || null;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : FETCH_TIMEOUT_MS;

  let timeoutTriggered = false;
  const timeoutId = setTimeout(() => {
    timeoutTriggered = true;
    ctrl.abort();
  }, timeoutMs);

  let onAbort = null;
  if (externalSignal) {
    if (externalSignal.aborted) ctrl.abort();
    else {
      onAbort = () => ctrl.abort();
      externalSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  try {
    const res = await fetch(url + sep + "__ts=" + Date.now(), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: ctrl.signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid JSON response");
    }
  } catch (e) {
    if (externalSignal?.aborted) throw new Error("Request aborted");
    if (timeoutTriggered) throw new Error("JSON timeout");
    throw e;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && onAbort) externalSignal.removeEventListener("abort", onAbort);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiCall(url, options = {}) {
  const transports = Array.isArray(options.preferredTransports) && options.preferredTransports.length
    ? options.preferredTransports
    : getPreferredTransports();

  const errors = [];
  const retries = Number.isFinite(options.retries) ? Number(options.retries) : API_RETRY_COUNT;
  
  for (const transport of transports) {
     for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (options.signal?.aborted) throw new Error("Request aborted");

     try {
        const data = transport === "jsonp"
          ? await jsonp(url, options)
          : await fetchJson(url, options);

              rememberPreferredTransport(transport);
        return { data, transport, errors };
      } catch (err) {
        if (options.signal?.aborted) throw new Error("Request aborted");

        const msg = String(err?.message || err);
        errors.push(`${transport} (attempt ${attempt + 1}/${retries + 1}): ${msg}`);

        const canRetry = attempt < retries && (msg.includes("timeout") || msg.includes("HTTP 5") || msg.includes("load error"));
        if (canRetry) {
          await sleep(API_RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        break;
      }
    }
  }

  const finalErr = new Error(errors.join(" | ") || "Request failed");
  finalErr.transportErrors = errors;
  throw finalErr;
}

function buildMetaFromSummary(summary) {
  const meta = new Map();
  (summary?.clients || []).forEach((c) => {
    const name = normalizeStr(c.client);
    if (!name) return;
    meta.set(name, {
      client: name,
      locations: Number(c.locations ?? 0),
      committedMinutes: Number(c.committedMinutes ?? 0),
      primaryCsm: normalizeStr(c.primaryCsm || ""),
      currency: normalizeStr(c.currency || ""),
      backendOverageAmount: Number(c.overageAmount ?? NaN),
    });
  });
  return meta;
}

function buildFilterOptionsFromRaw(summary, sessionsRaw) {
  const clients = new Set();
  const csms = new Set();

  (summary?.clients || []).forEach((c) => {
    const client = normalizeStr(c.client);
    const csm = normalizeStr(c.primaryCsm);
    if (client) clients.add(client);
    if (csm) csms.add(csm);
  });

  (sessionsRaw || []).forEach((s) => {
    const client = normalizeStr(s.client);
    const csm = normalizeStr(s.csm);
    if (client) clients.add(client);
    if (csm) csms.add(csm);
  });

  return {
    clients: Array.from(clients).sort((a, b) => a.localeCompare(b)),
    csms: Array.from(csms).sort((a, b) => a.localeCompare(b)),
  };
}

function setSelectOptions(selectEl, values, currentValue) {
  selectEl.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All";
  selectEl.appendChild(allOpt);

  values.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    selectEl.appendChild(opt);
  });

  const nextValue = values.includes(currentValue) ? currentValue : "all";
  selectEl.value = nextValue;
  return nextValue;
}

function populateCurrentFilterDropdowns(options) {
  const prevCsm = els.csmFilter.value || "all";
  const prevClient = els.clientFilter.value || "all";

  const nextCsm = setSelectOptions(els.csmFilter, options.csms, prevCsm);
  const nextClient = setSelectOptions(els.clientFilter, options.clients, prevClient);

  return {
    csmChanged: nextCsm !== prevCsm,
    clientChanged: nextClient !== prevClient,
  };
}

function filterByLocationsCount(locCount, mode) {
  if (mode === "all") return true;
  const n = Number(locCount ?? 0);
  if (mode === "1") return n === 1;
  if (mode === "2-3") return n >= 2 && n <= 3;
  if (mode === "4+") return n >= 4;
  return true;
}

function computeQualityScore({ sessionsCount, missingBriefs, missingCsm, missingClient }) {
  if (!sessionsCount) return { label: "—", pct: null };
  const penalty = (missingBriefs * 1.0) + (missingCsm * 1.5) + (missingClient * 2.0);
  const maxPenalty = sessionsCount * 2.0;
  const pct = Math.max(0, 1 - (penalty / maxPenalty));
  const label = pct >= 0.9 ? "Good" : pct >= 0.75 ? "OK" : "Needs work";
  return { label, pct };
}

function buildActions(clients, filters) {
  const actions = [];
  const actionThresh = Number(SETTINGS.actionThreshold || 0.92);
  const warnThresh = Number(SETTINGS.warnThreshold || 0.80);

  const sorted = [...clients].sort((a, b) => {
    const au = a.utilization ?? -1;
    const bu = b.utilization ?? -1;
    return bu - au;
  });

  for (const c of sorted) {
    if ((c.committedMinutes || 0) <= 0) continue;
    const util = c.utilization ?? 0;
    const remaining = c.remainingMinutes || 0;
    const last = c.lastSessionDate || "—";

    if (util >= 1.0) {
      actions.push({
        kind: "over",
        title: `${c.client} is over committed time`,
        sub: `${fmtInt(c.consumedMinutes)} / ${fmtInt(c.committedMinutes)} minutes (${fmtPct(util)}). Last: ${last}.`,
        client: c.client,
        suggestion: "Send overage notice and propose add-on minutes or a package change.",
      });
    } else if (util >= actionThresh) {
      actions.push({
        kind: "action",
        title: `${c.client} is likely to hit the limit soon`,
        sub: `${fmtInt(c.consumedMinutes)} / ${fmtInt(c.committedMinutes)} minutes (${fmtPct(util)}). Remaining ${fmtInt(remaining)} min. Last: ${last}.`,
        client: c.client,
        suggestion: "Proactively align on expectations and confirm remaining scope.",
      });
    } else if (util >= warnThresh) {
      actions.push({
        kind: "warn",
        title: `${c.client} is approaching the limit`,
        sub: `${fmtInt(c.consumedMinutes)} / ${fmtInt(c.committedMinutes)} minutes (${fmtPct(util)}). Remaining ${fmtInt(remaining)} min.`,
        client: c.client,
        suggestion: "Flag internally and watch the next sessions for scope creep.",
      });
    }
  }

  const se = startEndOfPeriod(filters.period);
  const endIso = filters.to || (se ? isoDate(se.end) : "");
  const startIso = filters.from || (se ? isoDate(se.start) : "");

  for (const c of clients) {
    if ((c.committedMinutes || 0) <= 0) continue;
    if ((c.consumedMinutes || 0) > 0) continue;
    actions.push({
      kind: "quiet",
      title: `${c.client} has committed time but no sessions`,
      sub: `Committed ${fmtInt(c.committedMinutes)} minutes. No sessions recorded in this view.`,
      client: c.client,
      suggestion: `Check in and schedule sessions or confirm the delivery plan. (${startIso} → ${endIso})`,
    });
  }

  return actions.slice(0, 10);
}

function buildViewData({ summary, sessionsRaw, filters, rates }) {
  const meta = buildMetaFromSummary(summary);

  const normalizedSessions = (sessionsRaw || []).map((s) => ({
    date: normalizeStr(s.date),
    client: normalizeStr(s.client),
    account: normalizeStr(s.account),
    csm: normalizeStr(s.csm),
    durationMinutes: Number(s.durationMinutes ?? 0),
    attendees: Number(s.attendees ?? 0),
    mainContact: normalizeStr(s.mainContact),
    briefUrl: normalizeStr(s.briefUrl),
    notes: normalizeStr(s.notes),
  }));

  const prelimSessions = normalizedSessions.filter((s) => {
    if (filters.from && s.date && s.date < filters.from) return false;
    if (filters.to && s.date && s.date > filters.to) return false;
    if (filters.client !== "all" && s.client !== filters.client) return false;
    if (filters.csm !== "all" && s.csm !== filters.csm) return false;

    if (!s.client) {
      if (filters.locationsMode !== "all") return false;
    } else {
      const m = meta.get(s.client);
      const locCount = m?.locations ?? 0;
      if (!filterByLocationsCount(locCount, filters.locationsMode)) return false;
    }

    return true;
  });

  const missingClient = prelimSessions.filter((s) => !s.client).length;
  const missingBriefs = prelimSessions.filter((s) => s.client && !s.briefUrl).length;
  const missingCsm = prelimSessions.filter((s) => s.client && !s.csm).length;

  const filteredSessions = prelimSessions.filter((s) => s.client);

  const byClient = new Map();
  for (const s of filteredSessions) {
    const k = s.client;
    if (!byClient.has(k)) {
      byClient.set(k, {
        client: k,
        consumedMinutes: 0,
        sessionsCount: 0,
        lastSessionDate: "",
        csms: new Set(),
        briefsMissing: 0,
      });
    }
    const row = byClient.get(k);
    row.consumedMinutes += Number(s.durationMinutes || 0);
    row.sessionsCount += 1;
    if (s.csm) row.csms.add(s.csm);
    if (!s.briefUrl) row.briefsMissing += 1;
    if (s.date && (!row.lastSessionDate || s.date > row.lastSessionDate)) row.lastSessionDate = s.date;
  }

  const clientNames = Array.from(new Set([
    ...Array.from(meta.keys()),
    ...Array.from(byClient.keys()),
  ]));

  const clients = clientNames.map((name) => {
    const m = meta.get(name) || { client: name, committedMinutes: 0, primaryCsm: "", locations: 0, currency: "" };
    const u = byClient.get(name) || { consumedMinutes: 0, sessionsCount: 0, lastSessionDate: "", briefsMissing: 0, csms: new Set() };

    const committed = Number(m.committedMinutes || 0);
    const consumed = Number(u.consumedMinutes || 0);
    const utilization = committed > 0 ? (consumed / committed) : null;
    const overageMinutes = Math.max(consumed - committed, 0);
    const remaining = Math.max(committed - consumed, 0);

    const rateInfo = rates[name] || {};
    const ratePerHour = Number(rateInfo.ratePerHour ?? NaN);
    const currency = normalizeStr(rateInfo.currency || m.currency || "EUR");

    let overageAmount = NaN;
    if (Number.isFinite(ratePerHour)) {
      overageAmount = (overageMinutes / 60) * ratePerHour;
    } else if (Number.isFinite(m.backendOverageAmount)) {
      overageAmount = m.backendOverageAmount;
    }

    const sessionCsms = Array.from(u.csms).filter(Boolean);
    const primaryCsm = m.primaryCsm || sessionCsms[0] || "";

    return {
      client: name,
      locations: Number(m.locations || 0),
      committedMinutes: committed,
      consumedMinutes: consumed,
      utilization,
      overageMinutes,
      remainingMinutes: remaining,
      sessionsCount: Number(u.sessionsCount || 0),
      lastSessionDate: u.lastSessionDate || "",
      primaryCsm,
      sessionCsms,
      briefsMissing: Number(u.briefsMissing || 0),
      ratePerHour: Number.isFinite(ratePerHour) ? ratePerHour : null,
      currency: currency || "EUR",
      overageAmount: Number.isFinite(overageAmount) ? overageAmount : null,
    };
  }).filter((c) => {
    if (filters.client !== "all" && c.client !== filters.client) return false;

    if (filters.csm !== "all") {
      const csmMatches = normalizeStr(c.primaryCsm) === filters.csm || c.sessionCsms.includes(filters.csm);
      if (!csmMatches) return false;
    }

    if (!filterByLocationsCount(c.locations, filters.locationsMode)) return false;
    if (filters.overageOnly && c.overageMinutes <= 0) return false;
    if (filters.atRiskOnly && !(c.utilization != null && c.utilization >= SETTINGS.warnThreshold)) return false;
    if ((c.committedMinutes || 0) <= 0 && (c.consumedMinutes || 0) <= 0) return false;
    return true;
  });

  const allowedClients = new Set(clients.map((x) => x.client));
  const sessions = filteredSessions.filter((s) => allowedClients.has(s.client));

  const sessionsByClient = new Map();
  for (const s of sessions) {
    if (!sessionsByClient.has(s.client)) sessionsByClient.set(s.client, []);
    sessionsByClient.get(s.client).push(s);
  }

  const dailyMap = new Map();
  for (const s of sessions) {
    const d = s.date || "";
    if (!d) continue;
    dailyMap.set(d, (dailyMap.get(d) || 0) + Number(s.durationMinutes || 0));
  }

  const daily = Array.from(dailyMap.entries())
    .map(([date, minutes]) => ({ date, minutes }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalMinutes = clients.reduce((sum, c) => sum + (c.consumedMinutes || 0), 0);
  const totalSessions = sessions.length;
  const avgDuration = totalSessions ? (totalMinutes / totalSessions) : 0;
  const uniqueClients = new Set(sessions.map((s) => s.client)).size || clients.filter((c) => c.consumedMinutes > 0).length;
  const totalCommitted = clients.reduce((sum, c) => sum + (c.committedMinutes || 0), 0);
  const totalOverage = clients.reduce((sum, c) => sum + (c.overageMinutes || 0), 0);

  const amountByCurrency = new Map();
  for (const c of clients) {
    if (!Number.isFinite(c.overageAmount)) continue;
    const cur = c.currency || "EUR";
    amountByCurrency.set(cur, (amountByCurrency.get(cur) || 0) + c.overageAmount);
  }

  const qualityScore = computeQualityScore({
    sessionsCount: prelimSessions.length,
    missingBriefs,
    missingCsm,
    missingClient,
  });

  return {
    filters,
    meta,
    clients,
    sessions,
    sessionsByClient,
    daily,
    totals: {
      totalMinutes,
      totalSessions,
      avgDuration,
      uniqueClients,
      totalCommitted,
      totalOverage,
      amountByCurrency,
      qualityScore,
      qualityDetail: { missingBriefs, missingCsm, missingClient },
    },
    actions: buildActions(clients, filters),
  };
}

function getCurrentView() {
  if (!state.rawSummary) return null;

  return buildViewData({
    summary: state.rawSummary,
    sessionsRaw: state.rawSessions,
    filters: getUiFilters(),
    rates: loadRates(),
  });
}

function loadVisibleCols(key) {
  try {
    const arr = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(arr) ? arr : null;
  } catch (e) {
    return null;
  }
}

function saveVisibleCols(key, fields) {
  try {
    localStorage.setItem(key, JSON.stringify(fields));
  } catch (e) {}
}

function applyColumnVisibility(table, colDefs, storageKey, requiredFields) {
  const allFields = colDefs.map((c) => c.field).filter(Boolean);
  const stored = loadVisibleCols(storageKey);
  const visible = new Set(stored && stored.length ? stored : allFields);

  (requiredFields || []).forEach((f) => visible.add(f));

  for (const f of allFields) {
    const col = table.getColumn(f);
    if (!col) continue;
    if (visible.has(f)) col.show();
    else col.hide();
  }
}

function openCloseMenu(menuEl, open) {
  if (!menuEl) return;
  menuEl.classList.toggle("open", !!open);
}

function buildColumnsMenu({ table, menuEl, colDefs, storageKey, requiredFields }) {
  const req = new Set(requiredFields || []);
  const allFields = colDefs.map((c) => c.field).filter(Boolean);

  menuEl.innerHTML = `
    <div class="head">
      <div class="hTitle">Columns</div>
      <button class="secondary miniBtn" data-action="reset">Reset</button>
    </div>
    <div class="muted">Show or hide columns for this table. Saved locally.</div>
    <div data-role="list"></div>
  `;

  const list = menuEl.querySelector('[data-role="list"]');

  for (const c of colDefs) {
    if (!c.field) continue;
    const isRequired = req.has(c.field);
    const col = table.getColumn(c.field);
    const isVisible = col ? col.isVisible() : true;

    const row = document.createElement("label");
    row.className = "item";
    row.innerHTML = `
      <input type="checkbox" ${isVisible ? "checked" : ""} ${isRequired ? "disabled" : ""} />
      <span>${escapeHtml(c.title || c.field)}</span>
    `;

    const cb = row.querySelector("input");
    cb.addEventListener("change", () => {
      const colObj = table.getColumn(c.field);
      if (!colObj) return;

      if (cb.checked) colObj.show();
      else colObj.hide();

      const visibleNow = [];
      for (const f of allFields) {
        const colX = table.getColumn(f);
        if (!colX) continue;
        if (colX.isVisible()) visibleNow.push(f);
      }

      for (const rf of req) {
        if (!visibleNow.includes(rf)) visibleNow.push(rf);
      }

      saveVisibleCols(storageKey, visibleNow);
    });

    list.appendChild(row);
  }

  menuEl.querySelector('[data-action="reset"]').addEventListener("click", () => {
    localStorage.removeItem(storageKey);
    for (const c of colDefs) {
      if (!c.field) continue;
      const col = table.getColumn(c.field);
      if (col) col.show();
    }
    buildColumnsMenu({ table, menuEl, colDefs, storageKey, requiredFields });
  });
}

function wireColumnsButton(btnEl, menuEl) {
  btnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = menuEl.classList.contains("open");
    openCloseMenu(els.clientsColsMenu, false);
    openCloseMenu(els.sessionsColsMenu, false);
    openCloseMenu(menuEl, !isOpen);
  });
}

document.addEventListener("click", () => {
  openCloseMenu(els.clientsColsMenu, false);
  openCloseMenu(els.sessionsColsMenu, false);
});

els.clientsColsMenu.addEventListener("click", (e) => e.stopPropagation());
els.sessionsColsMenu.addEventListener("click", (e) => e.stopPropagation());

function setActiveView(viewName) {
  const isPlanner = viewName === "planner";
  state.activeUiView = isPlanner ? "planner" : "overview";

  els.overviewView.classList.toggle("active", !isPlanner);
  els.plannerView.classList.toggle("active", isPlanner);
  els.overviewViewBtn.classList.toggle("active", !isPlanner);
  els.plannerViewBtn.classList.toggle("active", isPlanner);

  els.overviewViewBtn.setAttribute("aria-selected", String(!isPlanner));
  els.plannerViewBtn.setAttribute("aria-selected", String(isPlanner));
}

function renderPlannerView(view) {
  const filters = view.filters || {};
  const clients = [...(view.clients || [])]
    .filter((c) => c.utilization != null)
    .sort((a, b) => (b.utilization - a.utilization))
    .slice(0, 5);

  const actions = (view.actions || []).slice(0, 5);
  const atRiskCount = (view.clients || []).filter((c) => c.utilization != null && c.utilization >= SETTINGS.warnThreshold).length;

  els.plannerPeriodBadge.textContent = `Period: ${filters.period || "—"}`;
  els.plannerSummaryText.textContent = `${fmtInt(atRiskCount)} clients need attention. Use this planner to align outreach, prioritize at-risk accounts, and prepare next actions.`;

  els.plannerPriorityList.innerHTML = clients.length
    ? clients.map((c) => `
      <div class="plannerRow">
        <div class="title">${escapeHtml(c.client)}</div>
        <div class="meta">${fmtInt(c.consumedMinutes)} / ${fmtInt(c.committedMinutes)} min • Utilization ${fmtPct(c.utilization)}</div>
      </div>
    `).join("")
    : '<div class="plannerRow"><div class="meta">No priority clients in this filter.</div></div>';

  els.plannerActionsList.innerHTML = actions.length
    ? actions.map((a) => `
      <div class="plannerRow">
        <div class="title">${escapeHtml(a.title)}</div>
        <div class="meta">${escapeHtml(a.suggestion)}</div>
      </div>
    `).join("")
    : '<div class="plannerRow"><div class="meta">No urgent actions right now.</div></div>';

  const totals = view.totals || {};
  const msg = `In ${filters.period || "this period"}, your team logged ${fmtInt(totals.totalSessions)} sessions for ${fmtInt(totals.totalMinutes)} minutes across ${fmtInt(totals.uniqueClients)} clients.`;
  els.plannerSnapshot.textContent = msg;
}

function renderAll(view) {
  state.currentView = view;
  renderOverview(view);
  renderKPIs(view);
  renderAttention(view);
  renderActions(view);
  renderCharts(view);
  renderTables(view);
  renderPlannerView(view);

  if (currentDrawerClient) {
    const exists = view.clients.some((c) => c.client === currentDrawerClient);
    if (exists) openClientDrawer(currentDrawerClient, view);
    else closeDrawer();
  }
}

function renderOverview(view) {
  const filters = view.filters || {};
  const activeChips = [];
  const periodLabel = filters.period || "—";

  if (filters.from || filters.to) {
    activeChips.push(`Range: ${filters.from || "start"} → ${filters.to || "end"}`);
  }
  if (filters.csm && filters.csm !== "all") activeChips.push(`CSM: ${filters.csm}`);
  if (filters.client && filters.client !== "all") activeChips.push(`Client: ${filters.client}`);
  if (filters.locationsMode && filters.locationsMode !== "all") activeChips.push(`Locations: ${filters.locationsMode}`);
  if (filters.atRiskOnly) activeChips.push("At risk only");
  if (filters.overageOnly) activeChips.push("Overage only");
  if (!activeChips.length) activeChips.push("All clients and CSMs");

  const atRiskCount = (view.clients || []).filter((c) => c.utilization != null && c.utilization >= SETTINGS.warnThreshold).length;
  const actionCount = (view.actions || []).length;

  els.overviewTitle.textContent = `Your monthly service overview · ${periodLabel}`;
  els.overviewSubtitle.textContent = `A cleaner summary of client health, effort spent, and follow-up priorities for ${periodLabel}.`;
  els.heroPeriodValue.textContent = periodLabel;
  els.heroRiskValue.textContent = fmtInt(atRiskCount);
  els.heroActionsValue.textContent = fmtInt(actionCount);
  els.overviewChips.innerHTML = activeChips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("");
}

function renderKPIs(view) {
  const t = view.totals;
  setKPI(els.k_totalSessions, fmtInt(t.totalSessions));
  setKPI(els.k_totalMinutes, fmtInt(t.totalMinutes));
  setKPI(els.k_avg, fmt1(t.avgDuration));
  setKPI(els.k_clients, fmtInt(t.uniqueClients));
  setKPI(els.k_committed, fmtInt(t.totalCommitted));
  setKPI(els.k_over, fmtInt(t.totalOverage));

  const curEntries = Array.from(t.amountByCurrency.entries());
  let amtText = "—";
  if (curEntries.length === 1) {
    const [cur, amt] = curEntries[0];
    amtText = fmtCurrency(amt, cur);
  } else if (curEntries.length > 1) {
    amtText = curEntries.slice(0, 3).map(([cur, amt]) => `${cur} ${fmt2(amt)}`).join(" + ");
    if (curEntries.length > 3) amtText += " + …";
  }
  setKPI(els.k_over_amt, amtText);

  if (t.qualityScore.pct == null) {
    setKPI(els.k_quality, "—");
  } else {
    const pct = t.qualityScore.pct * 100;
    setKPI(els.k_quality, `${t.qualityScore.label} · ${pct.toFixed(0)}%`);
  }
}

function renderAttention(view) {
  const clients = [...(view.clients || [])]
    .filter((c) => c.utilization != null && (c.committedMinutes || 0) > 0)
    .sort((a, b) => (b.utilization - a.utilization))
    .filter((c) => c.utilization >= SETTINGS.warnThreshold)
    .slice(0, 10);

  els.attentionList.innerHTML = "";
  els.attentionEmpty.style.display = clients.length ? "none" : "block";

  clients.forEach((c) => {
    const cls = utilClass(c.utilization);
    const pct = Math.min(c.utilization * 100, UTIL_CAP_PCT);
    const item = document.createElement("div");
    item.className = "attentionItem";
    item.innerHTML = `
      <div class="left">
        <span class="dot ${cls}"></span>
        <div style="min-width:0;">
          <div class="name">${escapeHtml(c.client)}</div>
          <div class="meta">
            ${fmtInt(c.consumedMinutes)} / ${fmtInt(c.committedMinutes)} min •
            Remaining ${fmtInt(c.remainingMinutes)} •
            ${escapeHtml(c.primaryCsm || "No CSM")}
            ${c.lastSessionDate ? ` • Last ${escapeHtml(c.lastSessionDate)}` : ""}
          </div>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="bar"><div style="width:${pct}%; background:${cls === "bad" ? "var(--bad)" : cls === "warn" ? "var(--warn)" : "var(--good)"};"></div></div>
        <div style="width:66px; text-align:right; font-family:var(--mono); color:var(--muted);">
          ${fmtPct(c.utilization)}
        </div>
      </div>
    `;
    item.addEventListener("click", () => openClientDrawer(c.client, view));
    els.attentionList.appendChild(item);
  });
}

function renderActions(view) {
  const actions = view.actions || [];
  els.actionsList.innerHTML = "";
  els.actionsEmpty.style.display = actions.length ? "none" : "block";

  actions.forEach((a) => {
    const item = document.createElement("div");
    item.className = "actionItem";
    const dotClass = a.kind === "over" ? "bad" : (a.kind === "action" ? "warn" : "good");
    item.innerHTML = `
      <div style="min-width:0;">
        <div class="aTitle"><span class="dot ${dotClass}" style="display:inline-block; vertical-align:middle; margin-right:8px;"></span>${escapeHtml(a.title)}</div>
        <div class="aSub">${escapeHtml(a.sub)}</div>
        <div class="aSub" style="margin-top:6px;"><strong>Suggestion:</strong> ${escapeHtml(a.suggestion)}</div>
      </div>
      <div class="actionBtns">
        <button class="secondary miniBtn">Open</button>
        <button class="secondary miniBtn">Copy</button>
      </div>
    `;
    const [openBtn, copyBtn] = item.querySelectorAll("button");
    openBtn.addEventListener("click", () => openClientDrawer(a.client, view));
    copyBtn.addEventListener("click", async () => {
      await copyToClipboard(buildClientMessage(a.client, view));
    });
    els.actionsList.appendChild(item);
  });
}

function updateOrCreateChart(chartKey, canvasId, type, labels, data) {
  const chart = charts[chartKey];

  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update("none");
    return;
  }

  charts[chartKey] = new Chart(document.getElementById(canvasId), {
    type,
    data: {
      labels,
      datasets: [{ label: "Minutes", data }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: type === "bar" && chartKey === "clientTrend"
        ? { x: { ticks: { maxTicksLimit: 6 } } }
        : {},
    },
  });
}

function renderCharts(view) {
  const dLabels = view.daily.map((x) => x.date);
  const dData = view.daily.map((x) => x.minutes);
  updateOrCreateChart("daily", "chartDaily", "line", dLabels, dData);

  const top = [...view.clients]
    .sort((a, b) => (b.consumedMinutes - a.consumedMinutes))
    .slice(0, 10);

  const cLabels = top.map((x) => x.client);
  const cData = top.map((x) => x.consumedMinutes);
  updateOrCreateChart("topClients", "chartTopClients", "bar", cLabels, cData);
}

const CLIENT_COL_DEFS = [
  { title: "Client", field: "client", minWidth: 240, headerFilter: true },
  { title: "Primary CSM", field: "csm", width: 170, headerFilter: true },
  { title: "Locations", field: "locations", sorter: "number", hozAlign: "right", width: 110 },
  { title: "Committed", field: "committed", sorter: "number", hozAlign: "right", width: 120 },
  { title: "Consumed", field: "consumed", sorter: "number", hozAlign: "right", width: 120 },
  { title: "Remaining", field: "remaining", sorter: "number", hozAlign: "right", width: 120 },
  {
    title: "Utilization",
    field: "utilization",
    sorter: "number",
    width: 260,
    formatter: (cell) => {
      const v = cell.getValue();
      if (v == null) return "—";
      const pct = v * 100;
      const cls = v >= 1 ? "bad" : (v >= SETTINGS.warnThreshold ? "warn" : "good");
      const color = cls === "bad" ? "var(--bad)" : (cls === "warn" ? "var(--warn)" : "var(--good)");
      return `
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="dot ${cls}"></span>
          <div style="flex:1; min-width:120px; height:10px; border-radius:999px; background:rgba(15,23,42,.06); overflow:hidden;">
            <div style="height:100%; width:${Math.min(pct, UTIL_CAP_PCT)}%; background:${color};"></div>
          </div>
          <div style="width:66px; text-align:right; font-family:var(--mono); color:var(--muted);">${pct.toFixed(1)}%</div>
        </div>`;
    },
  },
  { title: "Overage", field: "overage", sorter: "number", hozAlign: "right", width: 110 },
  {
    title: "Rate/hr",
    field: "ratePerHour",
    sorter: "number",
    hozAlign: "right",
    width: 110,
    editor: "number",
    editorParams: { min: 0, step: 5 },
    formatter: (cell) => (cell.getValue() == null ? "—" : fmt2(cell.getValue())),
  },
  {
    title: "Overage amount",
    field: "overageAmount",
    sorter: "number",
    hozAlign: "right",
    width: 140,
    formatter: (cell) => {
      const v = cell.getValue();
      const row = cell.getRow().getData();
      if (v == null) return "—";
      return fmtCurrency(v, row.currency || "EUR");
    },
  },
  { title: "# Sessions", field: "sessions", sorter: "number", hozAlign: "right", width: 110 },
  { title: "Briefs missing", field: "briefsMissing", sorter: "number", hozAlign: "right", width: 130 },
  { title: "Last session", field: "last", sorter: "string", width: 130 },
];

const SESSION_COL_DEFS = [
  { title: "Date", field: "date", width: 120, sorter: "string", headerFilter: true },
  { title: "Client", field: "client", minWidth: 170, headerFilter: true },
  { title: "Account", field: "account", minWidth: 160, headerFilter: true },
  { title: "CSM", field: "csm", width: 160, headerFilter: true },
  { title: "Minutes", field: "minutes", sorter: "number", hozAlign: "right", width: 110 },
  { title: "Attendees", field: "attendees", sorter: "number", hozAlign: "right", width: 120 },
  { title: "Main Contact", field: "contact", minWidth: 180, headerFilter: true },
  {
    title: "Brief",
    field: "brief",
    width: 90,
    formatter: (cell) => {
      const url = safeUrl(cell.getValue());
      if (!url) return `<span style="color:rgba(91,103,128,.7); font-weight:850;">—</span>`;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="font-weight:900;">Open</a>`;
    },
  },
  { title: "Notes", field: "notes", minWidth: 320, formatter: "textarea" },
];

function renderTables(view) {
  const clientsData = (view.clients || []).map((c) => ({
    client: c.client,
    locations: c.locations,
    committed: c.committedMinutes,
    consumed: c.consumedMinutes,
    remaining: c.remainingMinutes,
    utilization: c.utilization,
    overage: c.overageMinutes,
    overageAmount: c.overageAmount,
    currency: c.currency,
    ratePerHour: c.ratePerHour,
    sessions: c.sessionsCount,
    last: c.lastSessionDate,
    csm: c.primaryCsm,
    briefsMissing: c.briefsMissing,
  }));

  if (!tables.clients) {
    tables.clients = new Tabulator("#clientsTable", {
      data: clientsData,
      layout: "fitColumns",
      height: "560px",
      placeholder: "No clients to show.",
      pagination: true,
      paginationSize: 15,
      paginationCounter: "rows",
      movableColumns: true,
      resizableColumns: true,
      columns: CLIENT_COL_DEFS,
      rowClick: (e, row) => {
        openClientDrawer(row.getData().client, state.currentView || view);
      },
      cellEdited: (cell) => {
        const field = cell.getField();
        if (field !== "ratePerHour") return;

        const row = cell.getRow().getData();
        const rates = loadRates();
        const client = row.client;
        const rawValue = cell.getValue();
        const numericValue = Number(rawValue);

        if (rawValue == null || rawValue === "" || !Number.isFinite(numericValue)) {
          if (rates[client]) delete rates[client].ratePerHour;
        } else {
          rates[client] = rates[client] || {};
          rates[client].ratePerHour = numericValue;
          rates[client].currency = row.currency || rates[client].currency || "EUR";
        }

        if (rates[client] && rates[client].ratePerHour == null && !rates[client].currency) {
          delete rates[client];
        }

        saveRates(rates);
        rerenderFromCurrentState();
      },
    });

    applyColumnVisibility(tables.clients, CLIENT_COL_DEFS, LS.clientCols, ["client"]);
    buildColumnsMenu({
      table: tables.clients,
      menuEl: els.clientsColsMenu,
      colDefs: CLIENT_COL_DEFS,
      storageKey: LS.clientCols,
      requiredFields: ["client"],
    });
    wireColumnsButton(els.clientsColsBtn, els.clientsColsMenu);
  } else {
    tables.clients.replaceData(clientsData);
    applyColumnVisibility(tables.clients, CLIENT_COL_DEFS, LS.clientCols, ["client"]);
  }

  const sessionsData = (view.sessions || []).map((s) => ({
    date: s.date,
    client: s.client,
    account: s.account,
    csm: s.csm,
    minutes: s.durationMinutes,
    attendees: s.attendees,
    contact: s.mainContact,
    brief: s.briefUrl,
    notes: s.notes,
  }));

  if (!tables.sessions) {
    tables.sessions = new Tabulator("#sessionsTable", {
      data: sessionsData,
      layout: "fitColumns",
      height: "620px",
      placeholder: "No sessions to show.",
      pagination: true,
      paginationSize: 15,
      paginationCounter: "rows",
      movableColumns: true,
      resizableColumns: true,
      columns: SESSION_COL_DEFS,
    });

    applyColumnVisibility(tables.sessions, SESSION_COL_DEFS, LS.sessionCols, ["date", "client"]);
    buildColumnsMenu({
      table: tables.sessions,
      menuEl: els.sessionsColsMenu,
      colDefs: SESSION_COL_DEFS,
      storageKey: LS.sessionCols,
      requiredFields: ["date", "client"],
    });
    wireColumnsButton(els.sessionsColsBtn, els.sessionsColsMenu);
  } else {
    tables.sessions.replaceData(sessionsData);
    applyColumnVisibility(tables.sessions, SESSION_COL_DEFS, LS.sessionCols, ["date", "client"]);
  }

  applyClientSearch();
  applySessionSearch();
}

function applyClientSearch() {
  const q = els.clientSearch.value.trim().toLowerCase();
  if (!tables.clients) return;

  if (!q) {
    tables.clients.clearFilter();
    return;
  }

  tables.clients.setFilter((row) => {
    return (row.client || "").toLowerCase().includes(q) || (row.csm || "").toLowerCase().includes(q);
  });
}

function applySessionSearch() {
  const q = els.sessionSearch.value.trim().toLowerCase();
  if (!tables.sessions) return;

  if (!q) {
    tables.sessions.clearFilter();
    return;
  }

  tables.sessions.setFilter((row) => {
    const hay = [row.date, row.client, row.account, row.csm, row.contact, row.notes].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function openClientDrawer(clientName, view) {
  const client = view.clients.find((c) => c.client === clientName);
  if (!client) return;

  currentDrawerClient = client.client;

  els.drawerTitle.textContent = client.client;
  els.drawerSub.textContent = `${client.primaryCsm || "No CSM"} • ${client.locations ? `${client.locations} locations` : "—"} • Last: ${client.lastSessionDate || "—"}`;

  const cls = utilClass(client.utilization);
  els.drawerDot.className = "dot " + cls;
  els.drawerUtilText.textContent = client.utilization == null ? "No commitment" : `${(client.utilization * 100).toFixed(1)}%`;

  els.drawerCommitted.textContent = fmtInt(client.committedMinutes) + " min";
  els.drawerConsumed.textContent = fmtInt(client.consumedMinutes) + " min";
  els.drawerRemaining.textContent = fmtInt(client.remainingMinutes) + " min";
  els.drawerOverage.textContent = fmtInt(client.overageMinutes) + " min";

  const clientSessions = view.sessionsByClient?.get(client.client) || (view.sessions || []).filter((s) => s.client === client.client);
  const sessions = [...clientSessions]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 5);

  els.drawerSessions.innerHTML = sessions.length ? "" : `<div class="row"><span><strong>No sessions</strong></span><span>—</span></div>`;
  for (const s of sessions) {
    const right = `${fmtInt(s.durationMinutes)} min`;
    const left = `<strong>${escapeHtml(s.date || "—")}</strong> • ${escapeHtml(s.account || "—")} ${s.briefUrl ? "• brief" : ""}`;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${left}</span><span style="font-family:var(--mono)">${right}</span>`;
    row.style.cursor = "pointer";
    row.addEventListener("click", () => {
      els.clientFilter.value = client.client;
      rerenderFromCurrentState();
      closeDrawer();
      scrollToTables();
    });
    els.drawerSessions.appendChild(row);
  }

  const hints = [];
  if (client.overageMinutes > 0) {
    hints.push(`Overage: ${fmtInt(client.overageMinutes)} minutes.`);
  } else if (client.utilization != null && client.utilization >= SETTINGS.actionThreshold) {
    hints.push(`Near limit: only ${fmtInt(client.remainingMinutes)} minutes remaining.`);
  }

  if (client.ratePerHour != null) {
    const amt = (client.overageMinutes / 60) * client.ratePerHour;
    hints.push(`Rate/hr: ${fmt2(client.ratePerHour)} → estimated overage ${fmtCurrency(amt, client.currency)}.`);
  } else {
    hints.push(`Tip: add rate/hr in the Clients table to auto-calculate overage amount.`);
  }

  if (client.briefsMissing > 0) {
    hints.push(`${fmtInt(client.briefsMissing)} session(s) missing a brief link in this view.`);
  }
  hints.push(`Use “Focus tables” to filter everything to this client.`);

  els.drawerHints.innerHTML = "";
  for (const h of hints) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${escapeHtml(h)}</span><span>→</span>`;
    els.drawerHints.appendChild(row);
  }

  const dailyMap = new Map();
  for (const s of clientSessions) {
    dailyMap.set(s.date, (dailyMap.get(s.date) || 0) + Number(s.durationMinutes || 0));
  }

  const daily = Array.from(dailyMap.entries())
    .map(([date, minutes]) => ({ date, minutes }))
    .sort((a, b) => a.date.localeCompare(b.date));

  updateOrCreateChart(
    "clientTrend",
    "chartClientTrend",
    "bar",
    daily.map((x) => x.date),
    daily.map((x) => x.minutes)
  );

  els.drawerCopyBtn.onclick = async () => {
    await copyToClipboard(buildClientMessage(client.client, view));
  };

  els.drawerFocusBtn.onclick = () => {
    els.clientFilter.value = client.client;
    rerenderFromCurrentState();
    closeDrawer();
    scrollToTables();
  };

  els.drawerClearFocusBtn.onclick = () => {
    els.clientFilter.value = "all";
    rerenderFromCurrentState();
  };

  els.drawerBackdrop.style.display = "block";
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.drawerBackdrop.style.display = "none";
  currentDrawerClient = null;
}

function scrollToTables() {
  const el = document.getElementById("clientsTable");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildClientMessage(clientName, view) {
  const c = view.clients.find((x) => x.client === clientName);
  if (!c) return "";

  const lines = [];
  lines.push(`Client: ${c.client}`);
  lines.push(`CSM: ${c.primaryCsm || "—"}`);
  lines.push(`Committed: ${fmtInt(c.committedMinutes)} min`);
  lines.push(`Consumed: ${fmtInt(c.consumedMinutes)} min`);
  lines.push(`Utilization: ${c.utilization == null ? "—" : fmtPct(c.utilization)}`);
  lines.push(`Remaining: ${fmtInt(c.remainingMinutes)} min`);
  lines.push(`Overage: ${fmtInt(c.overageMinutes)} min`);
  if (c.ratePerHour != null) {
    lines.push(`Rate/hr: ${fmt2(c.ratePerHour)} (${c.currency || "EUR"})`);
    if (c.overageMinutes > 0) {
      lines.push(`Estimated overage amount: ${fmtCurrency((c.overageMinutes / 60) * c.ratePerHour, c.currency || "EUR")}`);
    }
  }
  lines.push(`Last session: ${c.lastSessionDate || "—"}`);
  lines.push(`Sessions (view): ${fmtInt(c.sessionsCount)}`);
  if (c.briefsMissing > 0) lines.push(`Briefs missing (view): ${fmtInt(c.briefsMissing)}`);
  return lines.join("\n");
}

function updateAlertsUI() {
  const enabled = SETTINGS.alertsEnabled && ("Notification" in window);
  els.alertsDot.className = "dot " + (enabled ? "good" : "bad");
  els.alertsText.textContent = enabled ? "Enabled" : "Disabled";
}

function maybeNotifyAlerts(view) {
  if (!SETTINGS.alertsEnabled) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const snap = {};
  for (const c of view.clients) {
    if ((c.committedMinutes || 0) <= 0) continue;
    snap[c.client] = c.utilization ?? null;
  }

  let prev = {};
  try {
    prev = JSON.parse(localStorage.getItem(LS.alertSnapshot) || "{}");
  } catch (e) {
    prev = {};
  }

  const warn = SETTINGS.warnThreshold || 0.80;
  const action = SETTINGS.actionThreshold || 0.92;

  for (const [client, util] of Object.entries(snap)) {
    const prevUtil = prev[client];
    if (util == null) continue;

    const crossedWarn = (prevUtil == null || prevUtil < warn) && util >= warn;
    const crossedAction = (prevUtil == null || prevUtil < action) && util >= action;
    const crossedOver = (prevUtil == null || prevUtil < 1.0) && util >= 1.0;

    const title = crossedOver ? "Overage reached" : crossedAction ? "Approaching limit" : crossedWarn ? "At risk" : "";
    if (!title) continue;

    const body = `${client}: ${fmtPct(util)} utilization in the current refreshed view.`;
    try {
      new Notification(title, { body });
    } catch (e) {}
  }

  localStorage.setItem(LS.alertSnapshot, JSON.stringify(snap));
}

function openSettings() {
  els.warnThreshold.value = SETTINGS.warnThreshold;
  els.actionThreshold.value = SETTINGS.actionThreshold;
  updateAlertsUI();
  els.modalBackdrop.style.display = "block";
  els.settingsModal.style.display = "block";
}

function closeSettings() {
  els.modalBackdrop.style.display = "none";
  els.settingsModal.style.display = "none";
}

els.enableAlertsBtn.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    alert("This browser doesn’t support notifications.");
    return;
  }
  const perm = await Notification.requestPermission();
  SETTINGS = saveSettings({ alertsEnabled: (perm === "granted") });
  updateAlertsUI();
});

els.resetColsBtn.addEventListener("click", () => {
  if (!confirm("Reset Clients and Sessions columns to default?")) return;
  localStorage.removeItem(LS.clientCols);
  localStorage.removeItem(LS.sessionCols);

  if (tables.clients) {
    applyColumnVisibility(tables.clients, CLIENT_COL_DEFS, LS.clientCols, ["client"]);
    buildColumnsMenu({
      table: tables.clients,
      menuEl: els.clientsColsMenu,
      colDefs: CLIENT_COL_DEFS,
      storageKey: LS.clientCols,
      requiredFields: ["client"],
    });
  }

  if (tables.sessions) {
    applyColumnVisibility(tables.sessions, SESSION_COL_DEFS, LS.sessionCols, ["date", "client"]);
    buildColumnsMenu({
      table: tables.sessions,
      menuEl: els.sessionsColsMenu,
      colDefs: SESSION_COL_DEFS,
      storageKey: LS.sessionCols,
      requiredFields: ["date", "client"],
    });
  }
});

els.saveSettingsBtn.addEventListener("click", () => {
  const warn = Number(els.warnThreshold.value);
  const action = Number(els.actionThreshold.value);

  SETTINGS = saveSettings({
    warnThreshold: Number.isFinite(warn) ? warn : defaultSettings.warnThreshold,
    actionThreshold: Number.isFinite(action) ? action : defaultSettings.actionThreshold,
  });

  closeSettings();
  rerenderFromCurrentState();
});

els.resetSettingsBtn.addEventListener("click", () => {
  if (!confirm("Reset thresholds and alerts to defaults (keeps column preferences)?")) return;
  localStorage.setItem(LS.settings, JSON.stringify(defaultSettings));
  SETTINGS = loadSettings();
  updateAlertsUI();
  closeSettings();
  rerenderFromCurrentState();
});

function downloadCSV(filename, rows) {
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportClientsCSV() {
  const rows = [["Client", "PrimaryCSM", "Locations", "CommittedMinutes", "ConsumedMinutes", "RemainingMinutes", "Utilization", "OverageMinutes", "RatePerHour", "Currency", "OverageAmount", "#Sessions", "BriefsMissing", "LastSession"]];
  const data = tables.clients ? tables.clients.getData("active") : [];
  for (const c of data) {
    rows.push([
      c.client, c.csm, c.locations, c.committed, c.consumed, c.remaining, c.utilization,
      c.overage, c.ratePerHour, c.currency, c.overageAmount, c.sessions, c.briefsMissing, c.last,
    ]);
  }
  downloadCSV("clients.csv", rows);
}

function exportSessionsCSV() {
  const rows = [["Date", "Client", "Account", "CSM", "Minutes", "Attendees", "MainContact", "BriefURL", "Notes"]];
  const data = tables.sessions ? tables.sessions.getData("active") : [];
  for (const s of data) {
    rows.push([s.date, s.client, s.account, s.csm, s.minutes, s.attendees, s.contact, s.brief, s.notes]);
  }
  downloadCSV("sessions.csv", rows);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function showFriendlyError(err, debug) {
  els.friendlyError.style.display = "block";
  const msg = escapeHtml(err?.message || String(err || "Unknown error"));
  const details = debug ? escapeHtml(JSON.stringify(debug, null, 2)) : "";
  els.friendlyErrorDetails.innerHTML = `
    <div style="margin-bottom:6px;"><strong>Error:</strong> <span style="font-family:var(--mono)">${msg}</span></div>
    ${debug ? `<div style="margin-top:8px;"><strong>Debug:</strong><pre style="white-space:pre-wrap; font-family:var(--mono); font-size:11px; color:var(--muted); margin:6px 0 0;">${details}</pre></div>` : ""}
  `;
  const link = API_URL + "?action=periods&callback=TEST";
  els.jsonpTestLink.textContent = link;
  els.jsonpTestLink.onclick = () => window.open(link, "_blank");
}

function periodsUrl() {
  return API_URL + "?action=periods";
}

function buildSummaryUrl(period) {
  return API_URL + `?action=summary&period=${encodeURIComponent(period)}`;
}

function buildSessionsUrl(period, from, to) {
  return API_URL + `?action=sessions&period=${encodeURIComponent(period)}`
    + (from ? `&from=${encodeURIComponent(from)}` : "")
    + (to ? `&to=${encodeURIComponent(to)}` : "");
}

function getSessionsCacheKey(period, from, to) {
  return `${period}|${from || ""}|${to || ""}`;
}

async function loadPeriods(options = {}) {
  const cached = !options.force && isFresh(cache.periods, PERIODS_CACHE_TTL_MS) ? cache.periods.value : null;
  if (cached) {
    populatePeriods(cached);
    return "cache";
  }

  const res = await apiCall(periodsUrl(), { signal: options.signal });
  const payload = res.data;
  if (!payload || payload.ok !== true) throw new Error(payload?.error || "Could not load periods");

  const periods = (payload.periods || []).slice().sort((a, b) => b.localeCompare(a));
  cache.periods = { value: periods, ts: nowMs() };
  populatePeriods(periods);
  return res.transport;
}

function populatePeriods(periods) {
  state.periods = periods || [];
  const currentValue = els.period.value || "";
  const preferred = state.periods.includes(currentValue)
    ? currentValue
    : state.periods.includes(todayPeriod())
      ? todayPeriod()
      : (state.periods[0] || todayPeriod());

  els.period.innerHTML = "";
  state.periods.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    els.period.appendChild(opt);
  });

  if (!state.periods.length) {
    const opt = document.createElement("option");
    opt.value = todayPeriod();
    opt.textContent = todayPeriod();
    els.period.appendChild(opt);
  }

  els.period.value = preferred;
}

async function getSummaryPayload(period, options = {}) {
  const key = period;
  const cached = !options.force ? getMapCache(cache.summaryByPeriod, key, CACHE_TTL_MS) : null;
  if (cached) return { data: cached, transport: "cache" };

  const res = await apiCall(buildSummaryUrl(period), { signal: options.signal });
  setMapCache(cache.summaryByPeriod, key, res.data);
  return res;
}

async function getSessionsPayload(period, from, to, options = {}) {
  const key = getSessionsCacheKey(period, from, to);
  const cached = !options.force ? getMapCache(cache.sessionsByKey, key, CACHE_TTL_MS) : null;
  if (cached) return { data: cached, transport: "cache" };

  const res = await apiCall(buildSessionsUrl(period, from, to), { signal: options.signal });
  setMapCache(cache.sessionsByKey, key, res.data);
  return res;
}

async function fetchViewPayload(period, from, to, debug, label, options = {}) {
  const t0 = performance.now();

  const summaryUrl = buildSummaryUrl(period);
  const sessionsUrl = buildSessionsUrl(period, from, to);

  debug.endpoints[`${label}Summary`] = summaryUrl;
  debug.endpoints[`${label}Sessions`] = sessionsUrl;

  const [summaryRes, sessionsRes] = await Promise.all([
    getSummaryPayload(period, options),
    getSessionsPayload(period, from, to, options),
  ]);

  debug.transports[`${label}Summary`] = summaryRes.transport;
  debug.transports[`${label}Sessions`] = sessionsRes.transport;
  debug.timings[`${label}FetchMs`] = Math.round(performance.now() - t0);

  const summary = summaryRes.data;
  const sessionsPayload = sessionsRes.data;

  if (!summary?.ok) throw new Error(`${label} summary error: ` + (summary?.error || "Unknown"));
  if (!sessionsPayload?.ok) throw new Error(`${label} sessions error: ` + (sessionsPayload?.error || "Unknown"));

  return {
    summary,
    sessions: sessionsPayload.sessions || [],
    transports: [summaryRes.transport, sessionsRes.transport],
  };
}

async function refreshAll(options = {}) {
  if (activeRefreshController) activeRefreshController.abort();

  const refreshId = ++refreshSequence;
  const controller = new AbortController();
  activeRefreshController = controller;

  els.friendlyError.style.display = "none";
  els.refreshBtn.disabled = true;

  const { from, to } = sanitizeDateRangeInputs();
  const period = els.period.value || todayPeriod();
  const force = !!options.force;

  setConnection("warn", force ? "Refreshing data…" : "Loading data…");

  const debug = {
    mode: "smart-transport+cache",
    period,
    from: from || null,
    to: to || null,
    force,
    ts: new Date().toISOString(),
    endpoints: {},
    transports: {},
    timings: {},
  };

  try {
    const currentPayload = await fetchViewPayload(period, from, to, debug, "current", {
      signal: controller.signal,
      force,
    });

    if (refreshId !== refreshSequence) return;

    state.rawSummary = currentPayload.summary;
    state.rawSessions = currentPayload.sessions;

    populateCurrentFilterDropdowns(buildFilterOptionsFromRaw(state.rawSummary, state.rawSessions));

    const renderStart = performance.now();
    const view = getCurrentView();
    if (!view) throw new Error("Could not build the current view");

    renderAll(view);
    debug.timings.renderMs = Math.round(performance.now() - renderStart);

    maybeNotifyAlerts(view);

    const allTransports = Object.values(debug.transports);
    setConnection("ok", summarizeTransport(allTransports));
    els.lastRefreshed.textContent = "Last refreshed: " + new Date().toLocaleString();

    state.lastDebug = debug;
  } catch (e) {
    if (refreshId !== refreshSequence || controller.signal.aborted) return;
    setConnection("bad", "Couldn’t load data");
    state.lastDebug = debug;
    showFriendlyError(e, debug);
  } finally {
    if (activeRefreshController === controller) activeRefreshController = null;
    if (refreshId === refreshSequence) els.refreshBtn.disabled = false;
  }
}

function rerenderFromCurrentState() {
  const view = getCurrentView();
  if (!view) return;
  renderAll(view);
}

els.addSessionBtn.addEventListener("click", () => {
  window.open("https://forms.gle/6jtzeHebozTJfFRz5", "_blank", "noopener,noreferrer");
});

els.refreshBtn.addEventListener("click", () => refreshAll({ force: true }));

els.period.addEventListener("change", async () => {
  sanitizeDateRangeInputs();
  await refreshAll({ force: false });
});

els.from.addEventListener("change", async () => {
  sanitizeDateRangeInputs();
  await refreshAll({ force: false });
});

els.to.addEventListener("change", async () => {
  sanitizeDateRangeInputs();
  await refreshAll({ force: false });
});

[els.csmFilter, els.clientFilter, els.locationsFilter, els.atRiskToggle, els.overageOnlyToggle].forEach((el) => {
  el.addEventListener("change", rerenderFromCurrentState);
});

els.clientSearch.addEventListener("input", applyClientSearch);
els.sessionSearch.addEventListener("input", applySessionSearch);

els.clearClientSearch.addEventListener("click", () => {
  els.clientSearch.value = "";
  applyClientSearch();
});

els.clearSessionSearch.addEventListener("click", () => {
  els.sessionSearch.value = "";
  applySessionSearch();
});

els.exportClientsBtn.addEventListener("click", exportClientsCSV);
els.exportSessionsBtn.addEventListener("click", exportSessionsCSV);

els.copyActionsBtn.addEventListener("click", async () => {
  const view = getCurrentView();
  if (!view) return;

  const lines = ["Suggested actions (current view):"];
  (view.actions || []).forEach((a, i) => {
    lines.push(`${i + 1}. ${a.title} — ${a.sub} | Suggestion: ${a.suggestion}`);
  });
  if (!view.actions?.length) lines.push("— none —");
  await copyToClipboard(lines.join("\n"));
});

els.copyDebugBtn.addEventListener("click", async () => {
  const d = state.lastDebug || {};
  await copyToClipboard(JSON.stringify(d, null, 2));
});

els.drawerBackdrop.addEventListener("click", closeDrawer);
els.drawerCloseBtn.addEventListener("click", closeDrawer);

els.settingsBtn.addEventListener("click", openSettings);
els.modalBackdrop.addEventListener("click", closeSettings);
els.closeSettingsBtn.addEventListener("click", closeSettings);

els.overviewViewBtn.addEventListener("click", () => setActiveView("overview"));
els.plannerViewBtn.addEventListener("click", () => setActiveView("planner"));

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (els.settingsModal.style.display === "block") closeSettings();
    if (els.drawer.classList.contains("open")) closeDrawer();
  }
});

function initSettingsUI() {
  updateAlertsUI();
}

(async function init() {
  initSettingsUI();
  setActiveView("overview");

  try {
    setConnection("warn", "Connecting…");
    const transport = await loadPeriods();
    await refreshAll({ force: false });

    if (transport === "cache" && els.connText.textContent === "Connected") {
      setConnection("ok", "Loaded from cache");
    }
  } catch (e) {
    setConnection("bad", "Connection needs fixing");
    showFriendlyError(e, { init: true, mode: "smart-transport+cache" });
    els.period.innerHTML = `<option value="${todayPeriod()}">${todayPeriod()}</option>`;
  }
})();
