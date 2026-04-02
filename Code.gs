/**
 * AttendanceSummary - Google Apps Script backend
 * Resources:
 *  - tickets
 *  - calendar_events
 *  - monitor_health
 *  - contabo_monitor
 */

const SHEET_NAMES = Object.freeze({
  TICKETS: 'Tickets',
  CALENDAR_EVENTS: 'CalendarEvents',
  MONITOR_HEALTH: 'Monitor Health',
  CONTABO_MONITOR: 'Contabo Server Monitoring'
});

const MONITOR_HEADERS = Object.freeze([
  'checked_at_utc',
  'target_label',
  'target_url',
  'is_up',
  'latency_ms',
  'failure_note',
  'timeout_ms',
  'check_interval_ms',
  'environment',
  'region',
  'tcp_connect_ms',
  'tls_handshake_ms',
  'ttfb_ms',
  'content_check_passed',
  'ssl_expiry_days',
  'consecutive_failures',
  'alert_sent',
  'downtime_active',
  'downtime_window',
  'downtime_start_utc',
  'downtime_end_utc'
]);

const MONITOR_CONFIG = Object.freeze({
  ALERT_TO: getAlertTo_(),
  HEALTH: {
    SHEET_NAME: SHEET_NAMES.MONITOR_HEALTH,
    TARGET_LABEL: 'app.incheck360.com',
    TARGET_URL: 'https://app.incheck360.com/',
    ENVIRONMENT: 'production',
    REGION: 'us-east-1',
    TIMEOUT_MS: 30000,
    CHECK_INTERVAL_MS: 300000,
    EXPECTED_STRING: ''
  },
  CONTABO: {
    SHEET_NAME: SHEET_NAMES.CONTABO_MONITOR,
    TARGET_LABEL: 'Contabo Server',
    TARGET_URL: 'http://194.163.186.158:19999/',
    ENVIRONMENT: 'production',
    REGION: 'eu-west-1',
    TIMEOUT_MS: 30000,
    CHECK_INTERVAL_MS: 300000,
    EXPECTED_STRING: ''
  }
});

/**
 * Entry point: GET /exec?resource=...
 */
function doGet(e) {
  const resource = getParam_(e, 'resource', '').toLowerCase();

  if (resource === 'tickets') return jsonResponse_(readSheetObjects_(getTicketsSheet_()));
  if (resource === 'calendar_events') return jsonResponse_(readSheetObjects_(getCalendarSheet_()));
  if (resource === 'monitor_health') return jsonResponse_(readSheetObjects_(getMonitorHealthSheet_()));
  if (resource === 'contabo_monitor') return jsonResponse_(readSheetObjects_(getContaboMonitorSheet_()));

  return jsonResponse_({
    ok: true,
    resources: ['tickets', 'calendar_events', 'monitor_health', 'contabo_monitor']
  });
}

/**
 * Entry point: POST /exec?resource=...
 */
function doPost(e) {
  const resource = getParam_(e, 'resource', '').toLowerCase();
  const payload = parseJsonBody_(e);

  if (resource === 'tickets') {
    const result = appendRowsFromPayload_(getTicketsSheet_(), payload);
    return jsonResponse_(result);
  }

  if (resource === 'calendar_events') {
    const result = appendRowsFromPayload_(getCalendarSheet_(), payload);
    return jsonResponse_(result);
  }

  if (resource === 'monitor_health') {
    ensureMonitorHealthHeaders_();
    const result = appendRowsFromPayload_(getMonitorHealthSheet_(), payload, MONITOR_HEADERS);
    return jsonResponse_(result);
  }

  if (resource === 'contabo_monitor') {
    ensureContaboMonitorHeaders_();
    const result = appendRowsFromPayload_(getContaboMonitorSheet_(), payload, MONITOR_HEADERS);
    return jsonResponse_(result);
  }

  return jsonResponse_({ ok: false, error: 'Unsupported resource' });
}

/**
 * Scheduler entrypoint - run once per minute by trigger.
 */
function runScheduledChecks() {
  runMonitorHealthCheckIfDue_();
  runContaboMonitorCheckIfDue_();
}

/**
 * Monitor health (existing tab)
 */
function runMonitorHealthCheckIfDue_() {
  runSingleMonitorCheckIfDue_(MONITOR_CONFIG.HEALTH, 'monitor_health');
}

function runMonitorHealthCheck() {
  return runSingleMonitorCheck_(MONITOR_CONFIG.HEALTH, 'monitor_health');
}

/**
 * Contabo dedicated monitor (new 4th tab)
 */
function getContaboMonitorSheet_() {
  return getOrCreateSheet_(SHEET_NAMES.CONTABO_MONITOR);
}

function ensureContaboMonitorHeaders_() {
  ensureHeaders_(getContaboMonitorSheet_(), MONITOR_HEADERS);
}

function runContaboMonitorCheckIfDue_() {
  runSingleMonitorCheckIfDue_(MONITOR_CONFIG.CONTABO, 'contabo_monitor');
}

function runContaboMonitorCheck() {
  return runSingleMonitorCheck_(MONITOR_CONFIG.CONTABO, 'contabo_monitor');
}

/**
 * Optional setup helper.
 */
function setupAllSheetsAndTrigger() {
  getTicketsSheet_();
  getCalendarSheet_();
  ensureMonitorHealthHeaders_();
  ensureContaboMonitorHeaders_();
  ensureMinuteTrigger_('runScheduledChecks');
}

function ensureMinuteTrigger_(handlerName) {
  const exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === handlerName;
  });
  if (!exists) {
    ScriptApp.newTrigger(handlerName).timeBased().everyMinutes(1).create();
  }
}

function getTicketsSheet_() {
  return getOrCreateSheet_(SHEET_NAMES.TICKETS);
}

function getCalendarSheet_() {
  return getOrCreateSheet_(SHEET_NAMES.CALENDAR_EVENTS);
}

function getMonitorHealthSheet_() {
  return getOrCreateSheet_(SHEET_NAMES.MONITOR_HEALTH);
}

function ensureMonitorHealthHeaders_() {
  ensureHeaders_(getMonitorHealthSheet_(), MONITOR_HEADERS);
}

function runSingleMonitorCheckIfDue_(monitorCfg, monitorKey) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    const lastMs = Number(props.getProperty(lastRunKey_(monitorKey)) || 0);
    if (now - lastMs < Number(monitorCfg.CHECK_INTERVAL_MS || 300000)) return;
    const result = runSingleMonitorCheck_(monitorCfg, monitorKey);
    props.setProperty(lastRunKey_(monitorKey), String(now));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function runSingleMonitorCheck_(monitorCfg, monitorKey) {
  const sheet = monitorCfg.SHEET_NAME === SHEET_NAMES.CONTABO_MONITOR
    ? getContaboMonitorSheet_()
    : getMonitorHealthSheet_();

  ensureHeaders_(sheet, MONITOR_HEADERS);

  const downtime = getCurrentDowntimeWindow_(monitorKey);
  const check = performHttpCheck_(monitorCfg);
  const previous = getLastRowObject_(sheet);
  const prevFailures = Number(previous && previous.consecutive_failures ? previous.consecutive_failures : 0);
  const consecutiveFailures = check.is_up ? 0 : prevFailures + 1;
  const shouldAlert = !check.is_up && consecutiveFailures >= 2 && !downtime.active;
  const alertSent = shouldAlert ? sendMonitorAlert_(monitorCfg, check, consecutiveFailures) : false;

  const rowObj = {
    checked_at_utc: new Date().toISOString(),
    target_label: monitorCfg.TARGET_LABEL,
    target_url: monitorCfg.TARGET_URL,
    is_up: check.is_up,
    latency_ms: check.latency_ms,
    failure_note: check.failure_note,
    timeout_ms: monitorCfg.TIMEOUT_MS,
    check_interval_ms: monitorCfg.CHECK_INTERVAL_MS,
    environment: monitorCfg.ENVIRONMENT,
    region: monitorCfg.REGION,
    tcp_connect_ms: check.tcp_connect_ms,
    tls_handshake_ms: check.tls_handshake_ms,
    ttfb_ms: check.ttfb_ms,
    content_check_passed: check.content_check_passed,
    ssl_expiry_days: check.ssl_expiry_days,
    consecutive_failures: consecutiveFailures,
    alert_sent: alertSent,
    downtime_active: downtime.active,
    downtime_window: downtime.window,
    downtime_start_utc: downtime.start_utc,
    downtime_end_utc: downtime.end_utc
  };

  appendObjectRow_(sheet, MONITOR_HEADERS, rowObj);
  return rowObj;
}

function performHttpCheck_(monitorCfg) {
  const started = Date.now();
  const result = {
    is_up: false,
    latency_ms: '',
    failure_note: '',
    tcp_connect_ms: '',
    tls_handshake_ms: '',
    ttfb_ms: '',
    content_check_passed: true,
    ssl_expiry_days: ''
  };

  try {
    const response = UrlFetchApp.fetch(monitorCfg.TARGET_URL, {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true,
      method: 'get',
      contentType: 'text/plain',
      escaping: false,
      timeout: Number(monitorCfg.TIMEOUT_MS || 30000)
    });

    const code = response.getResponseCode();
    const body = response.getContentText() || '';
    const latency = Date.now() - started;

    result.latency_ms = latency;
    result.ttfb_ms = latency;

    const expected = String(monitorCfg.EXPECTED_STRING || '');
    if (expected) {
      result.content_check_passed = body.indexOf(expected) !== -1;
    }

    result.is_up = code >= 200 && code < 400 && result.content_check_passed;
    if (!result.is_up) {
      result.failure_note = expected && !result.content_check_passed
        ? 'Expected string not found'
        : 'HTTP ' + code;
    }
  } catch (err) {
    result.is_up = false;
    result.latency_ms = Date.now() - started;
    result.failure_note = safeErrMessage_(err);
    result.content_check_passed = false;
  }

  return result;
}

function sendMonitorAlert_(monitorCfg, checkResult, consecutiveFailures) {
  const alertTo = MONITOR_CONFIG.ALERT_TO;
  if (!alertTo) return false;

  const subject = '[ALERT] ' + monitorCfg.TARGET_LABEL + ' is DOWN';
  const body = [
    'Monitor target is failing.',
    '',
    'Target: ' + monitorCfg.TARGET_LABEL,
    'URL: ' + monitorCfg.TARGET_URL,
    'Environment: ' + monitorCfg.ENVIRONMENT,
    'Region: ' + monitorCfg.REGION,
    'Checked at (UTC): ' + new Date().toISOString(),
    'Consecutive failures: ' + consecutiveFailures,
    'Latency ms: ' + checkResult.latency_ms,
    'Failure note: ' + checkResult.failure_note
  ].join('\n');

  MailApp.sendEmail(alertTo, subject, body);
  return true;
}

function getCurrentDowntimeWindow_(monitorKey) {
  const raw = PropertiesService.getScriptProperties().getProperty(downtimeKey_(monitorKey));
  if (!raw) {
    return {
      active: false,
      window: '',
      start_utc: '',
      end_utc: ''
    };
  }

  try {
    const obj = JSON.parse(raw);
    const now = Date.now();
    const startMs = obj.start_utc ? Date.parse(obj.start_utc) : NaN;
    const endMs = obj.end_utc ? Date.parse(obj.end_utc) : NaN;
    const active = !isNaN(startMs) && !isNaN(endMs) && now >= startMs && now <= endMs;
    return {
      active: !!active,
      window: obj.window || '',
      start_utc: obj.start_utc || '',
      end_utc: obj.end_utc || ''
    };
  } catch (_e) {
    return {
      active: false,
      window: '',
      start_utc: '',
      end_utc: ''
    };
  }
}

/**
 * Helper to set downtime windows through script editor or API extension.
 */
function setDowntimeWindow(monitorKey, windowLabel, startUtcIso, endUtcIso) {
  const payload = JSON.stringify({
    window: windowLabel || '',
    start_utc: startUtcIso || '',
    end_utc: endUtcIso || ''
  });
  PropertiesService.getScriptProperties().setProperty(downtimeKey_(monitorKey), payload);
}

function clearDowntimeWindow(monitorKey) {
  PropertiesService.getScriptProperties().deleteProperty(downtimeKey_(monitorKey));
}

function appendRowsFromPayload_(sheet, payload, preferredHeaders) {
  const rows = Array.isArray(payload && payload.rows)
    ? payload.rows
    : payload
      ? [payload]
      : [];

  if (!rows.length) return { ok: false, appended: 0, message: 'No rows in payload' };

  const headers = preferredHeaders && preferredHeaders.length
    ? preferredHeaders
    : getOrInferHeaders_(sheet, rows[0]);

  ensureHeaders_(sheet, headers);

  rows.forEach(function (rowObj) {
    appendObjectRow_(sheet, headers, rowObj || {});
  });

  return { ok: true, appended: rows.length };
}

function appendObjectRow_(sheet, headers, obj) {
  const row = headers.map(function (h) {
    const v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  sheet.appendRow(row);
}

function readSheetObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (h, idx) {
      obj[h] = row[idx];
    });
    return obj;
  });
}

function getLastRowObject_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return null;
  const headers = values[0].map(String);
  const row = values[values.length - 1];
  const obj = {};
  headers.forEach(function (h, i) {
    obj[h] = row[i];
  });
  return obj;
}

function ensureHeaders_(sheet, headers) {
  const needed = headers || [];
  if (!needed.length) return;

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, needed.length).setValues([needed]);
    return;
  }

  const currentWidth = Math.max(sheet.getLastColumn(), needed.length);
  const current = sheet.getRange(1, 1, 1, currentWidth).getValues()[0].map(function (v) {
    return String(v || '');
  });

  const same = needed.every(function (h, i) { return current[i] === h; });
  if (!same) {
    sheet.getRange(1, 1, 1, needed.length).setValues([needed]);
  }
}

function getOrInferHeaders_(sheet, sampleRow) {
  const lastCol = sheet.getLastColumn();
  if (lastCol > 0) {
    const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(Boolean);
    if (existing.length) return existing;
  }
  return Object.keys(sampleRow || {});
}

function getOrCreateSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (_err) {
    return {};
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getParam_(e, key, fallback) {
  if (!e || !e.parameter || e.parameter[key] === undefined) return fallback;
  return e.parameter[key];
}

function safeErrMessage_(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  return JSON.stringify(err);
}

function getAlertTo_() {
  const props = PropertiesService.getScriptProperties();
  return (
    props.getProperty('MONITOR_ALERT_TO') ||
    props.getProperty('ALERT_TO') ||
    Session.getActiveUser().getEmail() ||
    ''
  );
}

function lastRunKey_(monitorKey) {
  return 'LAST_RUN_MS_' + String(monitorKey || '').toUpperCase();
}

function downtimeKey_(monitorKey) {
  return 'DOWNTIME_WINDOW_' + String(monitorKey || '').toUpperCase();
}
