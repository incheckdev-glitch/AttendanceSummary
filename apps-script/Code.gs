const CONFIG = {
  SHEET_NAME: 'Form Responses 1',
  HEADER_ROW: 1,
  PASSWORD_PROPERTY: 'EDIT_PASSWORD_HASH',
  CLEAR_CLOSURE_DATE_ON_REOPEN: true,
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100
};

function doGet(e) {
  try {
    const action = String((e.parameter && e.parameter.action) || 'summary').toLowerCase();

    if (action === 'summary') {
      return jsonResponse_({ ok: true, data: buildSummary_() });
    }

    if (action === 'issues') {
      return jsonResponse_({ ok: true, data: getIssues_(e.parameter || {}) });
    }

    if (action === 'analytics') {
      return jsonResponse_({ ok: true, data: buildAnalytics_() });
    }

    return jsonResponse_({ ok: false, error: 'Unknown GET action' });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '').toLowerCase();

    if (action === 'updateissue') {
      if (!isValidEditPassword_(body.editPassword)) {
        return jsonResponse_({ ok: false, error: 'Invalid edit password' });
      }

      return jsonResponse_({ ok: true, data: updateIssue_(body) });
    }

    return jsonResponse_({ ok: false, error: 'Unknown POST action' });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message });
  }
}

function setEditPassword_() {
  const password = 'CHANGE_ME_TO_A_STRONG_PASSWORD';
  const hash = sha256_(password);
  PropertiesService.getScriptProperties().setProperty(CONFIG.PASSWORD_PROPERTY, hash);
}

function isValidEditPassword_(plainPassword) {
  const savedHash = PropertiesService.getScriptProperties().getProperty(CONFIG.PASSWORD_PROPERTY);
  if (!savedHash) throw new Error('Edit password is not configured. Run setEditPassword_() first.');
  return sha256_(String(plainPassword || '')) === savedHash;
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    const v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function buildSummary_() {
  const issues = getAllIssues_();

  const summary = {
    total: issues.length,
    open: 0,
    resolvedClosed: 0,
    escalated: 0,
    highCritical: 0,
    byStatus: {},
    byPriority: {},
    byCategory: {}
  };

  issues.forEach(function (issue) {
    const status = normalizeValue_(issue.finalStatus);
    const priority = normalizeValue_(issue.priorityLevel);
    const category = issue.issueCategory || 'Blank';
    const escalated = normalizeValue_(issue.escalationRequired);

    if (!status || ['open', 'in progress', 'waiting for cs', 'waiting for customer', 'escalated to development'].indexOf(status) > -1) {
      summary.open++;
    }

    if (['resolved', 'closed'].indexOf(status) > -1) summary.resolvedClosed++;
    if (escalated === 'yes' || status === 'escalated to development') summary.escalated++;
    if (['high', 'critical'].indexOf(priority) > -1) summary.highCritical++;

    summary.byStatus[issue.finalStatus || 'Blank'] = (summary.byStatus[issue.finalStatus || 'Blank'] || 0) + 1;
    summary.byPriority[issue.priorityLevel || 'Blank'] = (summary.byPriority[issue.priorityLevel || 'Blank'] || 0) + 1;
    summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
  });

  return summary;
}

function getIssues_(params) {
  const allIssues = getAllIssues_();
  const filtered = allIssues.filter(function (issue) {
    return matchesIssue_(issue, params);
  });

  filtered.sort(function (a, b) {
    return safeDateValue_(b.requestDate || b.timestamp) - safeDateValue_(a.requestDate || a.timestamp);
  });

  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(CONFIG.MAX_PAGE_SIZE, Math.max(1, Number(params.pageSize || CONFIG.DEFAULT_PAGE_SIZE)));
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items: items,
    pagination: {
      total: filtered.length,
      page: page,
      pageSize: pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize))
    }
  };
}

function buildAnalytics_() {
  const issues = getAllIssues_();
  const resolutionDays = [];
  const trendMap = {};
  const agingMap = { '0-2 days': 0, '3-7 days': 0, '8-14 days': 0, '15+ days': 0 };
  const topCompanies = {};
  const topModules = {};
  let openIssues = 0;
  let resolvedIssues = 0;

  issues.forEach(function (issue) {
    const status = normalizeValue_(issue.finalStatus);
    const createdKey = toPeriodKey_(issue.requestDate || issue.timestamp);
    const resolvedKey = toPeriodKey_(issue.resolutionClosureDate);

    ensureTrendPeriod_(trendMap, createdKey);
    if (createdKey) trendMap[createdKey].created++;

    if (['resolved', 'closed'].indexOf(status) > -1) {
      resolvedIssues++;
      if (resolvedKey) {
        ensureTrendPeriod_(trendMap, resolvedKey);
        trendMap[resolvedKey].resolved++;
      }
      const days = getResolutionDays_(issue);
      if (days !== null) resolutionDays.push(days);
    } else {
      openIssues++;
      const bucket = getAgingBucket_(issue);
      if (bucket) agingMap[bucket]++;
    }

    incrementCounter_(topCompanies, issue.companyName || 'Blank');
    incrementCounter_(topModules, issue.productModuleAffected || 'Blank');
  });

  return {
    trend: Object.keys(trendMap).sort().map(function (key) {
      return trendMap[key];
    }),
    aging: Object.keys(agingMap).map(function (key) {
      return { label: key, count: agingMap[key] };
    }),
    topCompanies: topN_(topCompanies, 6),
    topModules: topN_(topModules, 6),
    averageResolutionDays: average_(resolutionDays),
    medianResolutionDays: median_(resolutionDays),
    openIssues: openIssues,
    resolvedIssues: resolvedIssues
  };
}

function getAllIssues_() {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < CONFIG.HEADER_ROW) return [];

  const headers = values[CONFIG.HEADER_ROW - 1];
  const map = headerMap_(headers);
  const issues = [];

  for (var i = CONFIG.HEADER_ROW; i < values.length; i++) {
    issues.push(rowToIssue_(values[i], i + 1, map));
  }

  return issues;
}

function matchesIssue_(issue, params) {
  const q = normalizeValue_(params.q || '');
  const statusFilter = normalizeValue_(params.status || '');
  const priorityFilter = normalizeValue_(params.priority || '');
  const categoryFilter = normalizeValue_(params.category || '');
  const companyFilter = normalizeValue_(params.company || '');
  const moduleFilter = normalizeValue_(params.module || '');
  const escalatedFilter = normalizeValue_(params.escalated || '');

  if (statusFilter && normalizeValue_(issue.finalStatus) !== statusFilter) return false;
  if (priorityFilter && normalizeValue_(issue.priorityLevel) !== priorityFilter) return false;
  if (categoryFilter && normalizeValue_(issue.issueCategory) !== categoryFilter) return false;
  if (companyFilter && normalizeValue_(issue.companyName).indexOf(companyFilter) === -1) return false;
  if (moduleFilter && normalizeValue_(issue.productModuleAffected).indexOf(moduleFilter) === -1) return false;
  if (escalatedFilter && normalizeValue_(issue.escalationRequired) !== escalatedFilter) return false;

  if (q) {
    const haystack = [
      issue.companyName,
      issue.issueTitle,
      issue.issueCategory,
      issue.detailedDescription,
      issue.productModuleAffected,
      issue.developmentTicket,
      issue.reportedChannel,
      issue.sourceOfIssue,
      issue.internalNotes,
      issue.initialAssessment
    ].join(' ').toLowerCase();

    if (haystack.indexOf(q) === -1) return false;
  }

  return true;
}

function updateIssue_(body) {
  const rowNumber = Number(body.id);
  if (!rowNumber || rowNumber <= CONFIG.HEADER_ROW) throw new Error('Invalid issue row ID');

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const sheet = getSheet_();
    const headers = sheet.getRange(CONFIG.HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
    const map = headerMap_(headers);

    const updates = {
      'Initial assessment': body.initialAssessment,
      'Root cause type': body.rootCauseType,
      'Internal notes': body.internalNotes,
      'Escalation required?': body.escalationRequired,
      'Development ticket': body.developmentTicket,
      'Final status': body.finalStatus,
      'Was CS informed?': body.wasCsInformed
    };

    Object.keys(updates).forEach(function (header) {
      const value = updates[header];
      const col = map[normalizeHeader_(header)];
      if (col && value !== undefined) sheet.getRange(rowNumber, col).setValue(value);
    });

    handleClosureDate_(sheet, rowNumber, map);
    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    return rowToIssue_(row, rowNumber, map);
  } finally {
    lock.releaseLock();
  }
}

function handleClosureDate_(sheet, rowNumber, map) {
  const finalStatusCol = map[normalizeHeader_('Final status')];
  const closureDateCol = map[normalizeHeader_('Resolution / Closure date')];
  if (!finalStatusCol || !closureDateCol) return;

  const statusValue = normalizeValue_(sheet.getRange(rowNumber, finalStatusCol).getValue());
  const closureCell = sheet.getRange(rowNumber, closureDateCol);

  if (statusValue === 'resolved' || statusValue === 'closed') {
    if (closureCell.isBlank()) closureCell.setValue(new Date());
  } else if (CONFIG.CLEAR_CLOSURE_DATE_ON_REOPEN) {
    closureCell.clearContent();
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + CONFIG.SHEET_NAME);
  return sheet;
}

function rowToIssue_(row, rowNumber, map) {
  return {
    id: rowNumber,
    timestamp: getByHeader_(row, map, 'Timestamp'),
    requestDate: getByHeader_(row, map, 'Request date'),
    submittedBy: getByHeader_(row, map, 'Submitted by'),
    companyName: getByHeader_(row, map, 'Company name'),
    issueTitle: getByHeader_(row, map, 'Issue title'),
    issueCategory: getByHeader_(row, map, 'Issue category'),
    detailedDescription: getByHeader_(row, map, 'Detailed description'),
    issuePattern: getByHeader_(row, map, 'Is the issue ongoing or intermittent?'),
    priorityLevel: getByHeader_(row, map, 'Priority level'),
    impactType: getByHeader_(row, map, 'Impact type'),
    workaroundAvailable: getByHeader_(row, map, 'Is there a workaround available?'),
    workaroundDetails: getByHeader_(row, map, 'Workaround details  (If Applicable)'),
    environment: getByHeader_(row, map, 'Environment'),
    productModuleAffected: getByHeader_(row, map, 'Product / module affected'),
    browserDeviceOs: getByHeader_(row, map, 'Browser / device / OS'),
    errorMessage: getByHeader_(row, map, 'Error message (if Available)'),
    attachmentUpload: getByHeader_(row, map, 'Attachment upload'),
    reportedChannel: getByHeader_(row, map, 'Reported Channel'),
    sourceOfIssue: getByHeader_(row, map, 'Source of Issue'),
    initialAssessment: getByHeader_(row, map, 'Initial assessment'),
    rootCauseType: getByHeader_(row, map, 'Root cause type'),
    internalNotes: getByHeader_(row, map, 'Internal notes'),
    escalationRequired: getByHeader_(row, map, 'Escalation required?'),
    developmentTicket: getByHeader_(row, map, 'Development ticket'),
    finalStatus: getByHeader_(row, map, 'Final status'),
    resolutionClosureDate: getByHeader_(row, map, 'Resolution / Closure date'),
    wasCsInformed: getByHeader_(row, map, 'Was CS informed?')
  };
}

function getByHeader_(row, map, headerName) {
  const col = map[normalizeHeader_(headerName)];
  return col ? row[col - 1] : '';
}

function headerMap_(headers) {
  const map = {};
  headers.forEach(function (header, index) {
    map[normalizeHeader_(header)] = index + 1;
  });
  return map;
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeValue_(value) {
  return String(value || '').trim().toLowerCase();
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safeDateValue_(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function toPeriodKey_(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');
}

function ensureTrendPeriod_(trendMap, key) {
  if (!key) return;
  if (!trendMap[key]) {
    trendMap[key] = { period: key, created: 0, resolved: 0 };
  }
}

function getResolutionDays_(issue) {
  const start = new Date(issue.requestDate || issue.timestamp);
  const end = new Date(issue.resolutionClosureDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

function getAgingBucket_(issue) {
  const start = new Date(issue.requestDate || issue.timestamp);
  if (Number.isNaN(start.getTime())) return '';
  const ageDays = (new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 2) return '0-2 days';
  if (ageDays <= 7) return '3-7 days';
  if (ageDays <= 14) return '8-14 days';
  return '15+ days';
}

function incrementCounter_(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function topN_(map, limit) {
  return Object.keys(map)
    .map(function (key) { return { label: key, count: map[key] }; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, limit);
}

function average_(values) {
  if (!values.length) return null;
  return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
}

function median_(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort(function (a, b) { return a - b; });
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}
