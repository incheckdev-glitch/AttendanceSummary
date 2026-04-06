/**
 * AttendanceSummary Apps Script backend.
 *
 * This file extends the existing single-script doGet/doPost router with:
 *  - resource=renewals
 *  - resource=expenses
 *  - resource=finance
 *
 * It also adds automatic finance consolidation refresh after API writes and
 * after manual edits to the Renewals/Expenses sheets.
 */

var CONFIG = typeof CONFIG !== 'undefined' ? CONFIG : {};

CONFIG.SPREADSHEET_ID = CONFIG.SPREADSHEET_ID || '';
CONFIG.SHEETS = CONFIG.SHEETS || {};
CONFIG.SHEETS.RENEWALS = CONFIG.SHEETS.RENEWALS || 'Subscription Renewals';
CONFIG.SHEETS.EXPENSES = CONFIG.SHEETS.EXPENSES || 'Expense Reports';
CONFIG.SHEETS.FINANCE = CONFIG.SHEETS.FINANCE || 'Finance Consolidation';

CONFIG.HEADERS = CONFIG.HEADERS || {};
CONFIG.HEADERS.RENEWALS = CONFIG.HEADERS.RENEWALS || [
  'id',
  'subscription',
  'department',
  'amount',
  'currency',
  'renewal date',
  'billing cycle',
  'status',
  'paid by',
  'notes',
  'created at',
  'updated at'
];
CONFIG.HEADERS.EXPENSES = CONFIG.HEADERS.EXPENSES || [
  'id',
  'date',
  'description',
  'department',
  'category',
  'amount dollar',
  'amount euro',
  'paid by',
  'payment method',
  'reference',
  'notes',
  'created at',
  'updated at'
];

/**
 * One-time initializer.
 * Creates missing finance-related sheets and required headers.
 */
function setupFinanceSheets() {
  var ss = getSpreadsheet_();

  ensureSheetWithHeaders_(ss, CONFIG.SHEETS.RENEWALS, CONFIG.HEADERS.RENEWALS);
  ensureSheetWithHeaders_(ss, CONFIG.SHEETS.EXPENSES, CONFIG.HEADERS.EXPENSES);

  var financeSheet = ss.getSheetByName(CONFIG.SHEETS.FINANCE);
  if (!financeSheet) {
    financeSheet = ss.insertSheet(CONFIG.SHEETS.FINANCE);
  }

  rebuildFinanceConsolidation_();

  return jsonResponse_({
    ok: true,
    message: 'Finance sheets are ready',
    sheets: [CONFIG.SHEETS.RENEWALS, CONFIG.SHEETS.EXPENSES, CONFIG.SHEETS.FINANCE]
  });
}

/**
 * Manual edit trigger.
 * Refreshes consolidation whenever Renewals or Expenses tabs are edited.
 */
function onEdit(e) {
  if (!e || !e.range) {
    return;
  }

  var sheetName = e.range.getSheet().getName();
  if (sheetName === CONFIG.SHEETS.RENEWALS || sheetName === CONFIG.SHEETS.EXPENSES) {
    rebuildFinanceConsolidation_();
  }
}

/**
 * Optional install helper for manual-edit trigger.
 */
function installFinanceTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var hasEditTrigger = triggers.some(function (t) {
    return t.getHandlerFunction() === 'onEdit';
  });

  if (!hasEditTrigger) {
    ScriptApp.newTrigger('onEdit').forSpreadsheet(getSpreadsheet_()).onEdit().create();
  }

  return jsonResponse_({ ok: true, message: 'Trigger installation checked' });
}

/**
 * Extends existing doGet routing with new finance resources.
 * Existing tickets/events logic is delegated to existing handlers unchanged.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var resource = normalize_(params.resource);

  if (resource === 'renewals') {
    return jsonResponse_(handleRenewalsGet_(params));
  }

  if (resource === 'expenses') {
    return jsonResponse_(handleExpensesGet_(params));
  }

  if (resource === 'finance') {
    if (toBoolean_(params.refresh)) {
      rebuildFinanceConsolidation_();
    }
    return jsonResponse_(handleFinanceGet_(params));
  }

  return delegateExistingDoGet_(e, resource);
}

/**
 * Extends existing doPost routing with new finance resources.
 * Existing tickets/events logic is delegated to existing handlers unchanged.
 */
function doPost(e) {
  var payload = parsePostBody_(e) || {};
  var resource = normalize_(payload.resource || (e && e.parameter && e.parameter.resource));

  if (resource === 'renewals') {
    return jsonResponse_(handleRenewalsPost_(payload));
  }

  if (resource === 'expenses') {
    return jsonResponse_(handleExpensesPost_(payload));
  }

  if (resource === 'finance') {
    var action = normalize_(payload.action) || 'refresh';
    if (action === 'refresh' || action === 'rebuild') {
      rebuildFinanceConsolidation_();
      return jsonResponse_({ ok: true, message: 'Finance consolidation refreshed' });
    }
    return jsonResponse_({ ok: false, error: 'Unsupported finance action: ' + action });
  }

  return delegateExistingDoPost_(e, payload, resource);
}

function handleRenewalsGet_(params) {
  var rows = getRecords_(CONFIG.SHEETS.RENEWALS, CONFIG.HEADERS.RENEWALS);
  var idFilter = normalize_(params.id);
  var departmentFilter = normalize_(params.department);
  var statusFilter = normalize_(params.status);

  var data = rows.filter(function (row) {
    if (idFilter && normalize_(row.id) !== idFilter) return false;
    if (departmentFilter && normalize_(row.department) !== departmentFilter) return false;
    if (statusFilter && normalize_(row.status) !== statusFilter) return false;
    return true;
  });

  return { ok: true, count: data.length, renewals: data };
}

function handleRenewalsPost_(payload) {
  var action = normalize_(payload.action);
  var renewal = payload.renewal || {};

  if (action === 'create') {
    var created = createRenewal_(renewal);
    rebuildFinanceConsolidation_();
    return { ok: true, renewal: created };
  }

  if (action === 'update') {
    var updated = updateRenewal_(renewal);
    rebuildFinanceConsolidation_();
    return { ok: true, renewal: updated };
  }

  if (action === 'delete') {
    var deleted = deleteRenewal_(renewal.id || payload.id);
    rebuildFinanceConsolidation_();
    return { ok: true, deleted: deleted };
  }

  return { ok: false, error: 'Unsupported renewals action: ' + action };
}

function handleExpensesGet_(params) {
  var rows = getRecords_(CONFIG.SHEETS.EXPENSES, CONFIG.HEADERS.EXPENSES);
  var idFilter = normalize_(params.id);
  var departmentFilter = normalize_(params.department);
  var categoryFilter = normalize_(params.category);

  var data = rows.filter(function (row) {
    if (idFilter && normalize_(row.id) !== idFilter) return false;
    if (departmentFilter && normalize_(row.department) !== departmentFilter) return false;
    if (categoryFilter && normalize_(row.category) !== categoryFilter) return false;
    return true;
  });

  return { ok: true, count: data.length, expenses: data };
}

function handleExpensesPost_(payload) {
  var action = normalize_(payload.action);
  var expense = payload.expense || {};

  if (action === 'create') {
    var created = createExpense_(expense);
    rebuildFinanceConsolidation_();
    return { ok: true, expense: created };
  }

  if (action === 'update') {
    var updated = updateExpense_(expense);
    rebuildFinanceConsolidation_();
    return { ok: true, expense: updated };
  }

  if (action === 'delete') {
    var deleted = deleteExpense_(expense.id || payload.id);
    rebuildFinanceConsolidation_();
    return { ok: true, deleted: deleted };
  }

  return { ok: false, error: 'Unsupported expenses action: ' + action };
}

function handleFinanceGet_(params) {
  var includeDetails = params.includeDetails !== 'false';
  return { ok: true, finance: buildFinanceModel_(includeDetails) };
}

function createRenewal_(input) {
  var now = toIsoString_(new Date());
  var record = {
    id: safeString_(input.id) || buildId_('REN'),
    subscription: safeString_(input.subscription),
    department: safeString_(input.department),
    amount: safeString_(input.amount),
    currency: safeString_(input.currency || inferCurrencyFromText_(input.amount) || 'USD'),
    'renewal date': normalizeDateInput_(input.renewalDate || input['renewal date']),
    'billing cycle': safeString_(input.billingCycle || input['billing cycle']),
    status: safeString_(input.status),
    'paid by': safeString_(input.paidBy || input['paid by']),
    notes: safeString_(input.notes),
    'created at': now,
    'updated at': now
  };

  appendRecord_(CONFIG.SHEETS.RENEWALS, CONFIG.HEADERS.RENEWALS, record);
  return record;
}

function updateRenewal_(input) {
  var id = safeString_(input.id);
  if (!id) throw new Error('renewal.id is required for update');

  var updated = updateRecordById_(CONFIG.SHEETS.RENEWALS, CONFIG.HEADERS.RENEWALS, id, function (current) {
    var next = shallowCopy_(current);

    if (input.subscription !== undefined) next.subscription = safeString_(input.subscription);
    if (input.department !== undefined) next.department = safeString_(input.department);
    if (input.amount !== undefined) next.amount = safeString_(input.amount);
    if (input.currency !== undefined) next.currency = safeString_(input.currency);
    if (input.renewalDate !== undefined || input['renewal date'] !== undefined) {
      next['renewal date'] = normalizeDateInput_(input.renewalDate || input['renewal date']);
    }
    if (input.billingCycle !== undefined || input['billing cycle'] !== undefined) {
      next['billing cycle'] = safeString_(input.billingCycle || input['billing cycle']);
    }
    if (input.status !== undefined) next.status = safeString_(input.status);
    if (input.paidBy !== undefined || input['paid by'] !== undefined) {
      next['paid by'] = safeString_(input.paidBy || input['paid by']);
    }
    if (input.notes !== undefined) next.notes = safeString_(input.notes);

    if (!next.currency) {
      next.currency = inferCurrencyFromText_(next.amount) || 'USD';
    }

    next['updated at'] = toIsoString_(new Date());
    return next;
  });

  return updated;
}

function deleteRenewal_(id) {
  var targetId = safeString_(id);
  if (!targetId) throw new Error('renewal id is required for delete');
  return deleteRecordById_(CONFIG.SHEETS.RENEWALS, targetId);
}

function createExpense_(input) {
  var now = toIsoString_(new Date());
  var record = {
    id: safeString_(input.id) || buildId_('EXP'),
    date: normalizeDateInput_(input.date),
    description: safeString_(input.description),
    department: safeString_(input.department),
    category: safeString_(input.category),
    'amount dollar': safeString_(input.amountDollar || input['amount dollar']),
    'amount euro': safeString_(input.amountEuro || input['amount euro']),
    'paid by': safeString_(input.paidBy || input['paid by']),
    'payment method': safeString_(input.paymentMethod || input['payment method']),
    reference: safeString_(input.reference),
    notes: safeString_(input.notes),
    'created at': now,
    'updated at': now
  };

  appendRecord_(CONFIG.SHEETS.EXPENSES, CONFIG.HEADERS.EXPENSES, record);
  return record;
}

function updateExpense_(input) {
  var id = safeString_(input.id);
  if (!id) throw new Error('expense.id is required for update');

  var updated = updateRecordById_(CONFIG.SHEETS.EXPENSES, CONFIG.HEADERS.EXPENSES, id, function (current) {
    var next = shallowCopy_(current);

    if (input.date !== undefined) next.date = normalizeDateInput_(input.date);
    if (input.description !== undefined) next.description = safeString_(input.description);
    if (input.department !== undefined) next.department = safeString_(input.department);
    if (input.category !== undefined) next.category = safeString_(input.category);
    if (input.amountDollar !== undefined || input['amount dollar'] !== undefined) {
      next['amount dollar'] = safeString_(input.amountDollar || input['amount dollar']);
    }
    if (input.amountEuro !== undefined || input['amount euro'] !== undefined) {
      next['amount euro'] = safeString_(input.amountEuro || input['amount euro']);
    }
    if (input.paidBy !== undefined || input['paid by'] !== undefined) {
      next['paid by'] = safeString_(input.paidBy || input['paid by']);
    }
    if (input.paymentMethod !== undefined || input['payment method'] !== undefined) {
      next['payment method'] = safeString_(input.paymentMethod || input['payment method']);
    }
    if (input.reference !== undefined) next.reference = safeString_(input.reference);
    if (input.notes !== undefined) next.notes = safeString_(input.notes);

    next['updated at'] = toIsoString_(new Date());
    return next;
  });

  return updated;
}

function deleteExpense_(id) {
  var targetId = safeString_(id);
  if (!targetId) throw new Error('expense id is required for delete');
  return deleteRecordById_(CONFIG.SHEETS.EXPENSES, targetId);
}

function rebuildFinanceConsolidation_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.FINANCE);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.FINANCE);
  }

  var model = buildFinanceModel_(true);
  var rows = [];

  rows.push(['Finance Consolidation']);
  rows.push(['last refreshed at', model.lastRefreshedAt]);
  rows.push([]);

  rows.push(['Summary']);
  rows.push(['metric', 'value']);
  rows.push(['total renewals amount', model.summary.totalRenewalsAmount]);
  rows.push(['total expenses USD', model.summary.totalExpensesUsd]);
  rows.push(['total expenses EUR', model.summary.totalExpensesEur]);
  rows.push(['combined total record count', model.summary.totalRecords]);
  rows.push(['last refreshed at', model.lastRefreshedAt]);
  rows.push([]);

  rows.push(['Monthly Summary']);
  rows.push(['month', 'renewals total', 'expenses USD total', 'expenses EUR total', 'total records']);
  model.monthlySummary.forEach(function (m) {
    rows.push([m.month, m.renewalsTotal, m.expensesUsdTotal, m.expensesEurTotal, m.totalRecords]);
  });
  rows.push([]);

  rows.push(['Department Summary']);
  rows.push(['department', 'renewals total', 'expenses USD total', 'expenses EUR total', 'total records']);
  model.departmentSummary.forEach(function (d) {
    rows.push([d.department, d.renewalsTotal, d.expensesUsdTotal, d.expensesEurTotal, d.totalRecords]);
  });
  rows.push([]);

  rows.push(['Detailed Transactions']);
  rows.push(['source type', 'id', 'date', 'department', 'title / description', 'amount usd', 'amount eur', 'status', 'notes']);
  model.details.forEach(function (detail) {
    rows.push([
      detail.sourceType,
      detail.id,
      detail.date,
      detail.department,
      detail.title,
      detail.amountUsd,
      detail.amountEur,
      detail.status,
      detail.notes
    ]);
  });

  sheet.clearContents();
  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, getMaxColumns_(rows)).setValues(padRows_(rows));
  }

  sheet.autoResizeColumns(1, 9);
  return model;
}

function buildFinanceModel_(includeDetails) {
  var now = toIsoString_(new Date());
  var renewals = getRecords_(CONFIG.SHEETS.RENEWALS, CONFIG.HEADERS.RENEWALS).map(normalizeRenewalRecord_);
  var expenses = getRecords_(CONFIG.SHEETS.EXPENSES, CONFIG.HEADERS.EXPENSES).map(normalizeExpenseRecord_);

  var details = [];
  renewals.forEach(function (r) {
    details.push({
      sourceType: 'Renewal',
      id: r.id,
      date: r.date,
      month: extractMonth_(r.date),
      department: r.department || 'Unassigned',
      title: r.title,
      amountUsd: r.amountUsd,
      amountEur: r.amountEur,
      status: r.status,
      notes: r.notes
    });
  });

  expenses.forEach(function (x) {
    details.push({
      sourceType: 'Expense',
      id: x.id,
      date: x.date,
      month: extractMonth_(x.date),
      department: x.department || 'Unassigned',
      title: x.title,
      amountUsd: x.amountUsd,
      amountEur: x.amountEur,
      status: 'Recorded',
      notes: x.notes
    });
  });

  details.sort(function (a, b) {
    return new Date(a.date || '1970-01-01') - new Date(b.date || '1970-01-01');
  });

  var summary = {
    totalRenewalsAmount: round2_(sumBy_(renewals, 'baseAmount')),
    totalExpensesUsd: round2_(sumBy_(expenses, 'amountUsd')),
    totalExpensesEur: round2_(sumBy_(expenses, 'amountEur')),
    totalRecords: details.length
  };

  var monthMap = {};
  details.forEach(function (d) {
    var key = d.month || 'Unknown';
    monthMap[key] = monthMap[key] || {
      month: key,
      renewalsTotal: 0,
      expensesUsdTotal: 0,
      expensesEurTotal: 0,
      totalRecords: 0
    };

    if (d.sourceType === 'Renewal') {
      monthMap[key].renewalsTotal += toNumber_(d.amountUsd || d.amountEur);
    } else {
      monthMap[key].expensesUsdTotal += toNumber_(d.amountUsd);
      monthMap[key].expensesEurTotal += toNumber_(d.amountEur);
    }
    monthMap[key].totalRecords += 1;
  });

  var monthlySummary = objectValues_(monthMap)
    .sort(function (a, b) { return a.month.localeCompare(b.month); })
    .map(function (m) {
      return {
        month: m.month,
        renewalsTotal: round2_(m.renewalsTotal),
        expensesUsdTotal: round2_(m.expensesUsdTotal),
        expensesEurTotal: round2_(m.expensesEurTotal),
        totalRecords: m.totalRecords
      };
    });

  var deptMap = {};
  details.forEach(function (d) {
    var key = d.department || 'Unassigned';
    deptMap[key] = deptMap[key] || {
      department: key,
      renewalsTotal: 0,
      expensesUsdTotal: 0,
      expensesEurTotal: 0,
      totalRecords: 0
    };

    if (d.sourceType === 'Renewal') {
      deptMap[key].renewalsTotal += toNumber_(d.amountUsd || d.amountEur);
    } else {
      deptMap[key].expensesUsdTotal += toNumber_(d.amountUsd);
      deptMap[key].expensesEurTotal += toNumber_(d.amountEur);
    }
    deptMap[key].totalRecords += 1;
  });

  var departmentSummary = objectValues_(deptMap)
    .sort(function (a, b) { return a.department.localeCompare(b.department); })
    .map(function (d) {
      return {
        department: d.department,
        renewalsTotal: round2_(d.renewalsTotal),
        expensesUsdTotal: round2_(d.expensesUsdTotal),
        expensesEurTotal: round2_(d.expensesEurTotal),
        totalRecords: d.totalRecords
      };
    });

  return {
    lastRefreshedAt: now,
    summary: summary,
    monthlySummary: monthlySummary,
    departmentSummary: departmentSummary,
    details: includeDetails ? details : []
  };
}

function normalizeRenewalRecord_(row) {
  var rawAmount = row.amount;
  var amountNumeric = parseAmount_(rawAmount);
  var currency = normalize_(row.currency || inferCurrencyFromText_(rawAmount) || 'USD').toUpperCase();

  return {
    id: safeString_(row.id),
    date: normalizeDateInput_(row['renewal date']),
    department: safeString_(row.department),
    title: safeString_(row.subscription),
    status: safeString_(row.status),
    notes: safeString_(row.notes),
    baseAmount: amountNumeric,
    amountUsd: currency === 'EUR' ? 0 : amountNumeric,
    amountEur: currency === 'EUR' ? amountNumeric : 0
  };
}

function normalizeExpenseRecord_(row) {
  return {
    id: safeString_(row.id),
    date: normalizeDateInput_(row.date),
    department: safeString_(row.department),
    title: safeString_(row.description),
    notes: safeString_(row.notes),
    amountUsd: parseAmount_(row['amount dollar']),
    amountEur: parseAmount_(row['amount euro'])
  };
}

function parseAmount_(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return round2_(value);

  var text = String(value);
  var numericMatch = text.match(/-?\d{1,3}(?:[\s,]\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);
  if (!numericMatch) return 0;

  var normalized = numericMatch[0].replace(/[\s,](?=\d{3}(\D|$))/g, '');
  var parsed = parseFloat(normalized);
  if (isNaN(parsed)) return 0;
  return round2_(parsed);
}

function inferCurrencyFromText_(value) {
  var text = normalize_(value);
  if (!text) return '';
  if (text.indexOf('€') >= 0 || text.indexOf('eur') >= 0 || text.indexOf('euro') >= 0) {
    return 'EUR';
  }
  if (text.indexOf('$') >= 0 || text.indexOf('usd') >= 0 || text.indexOf('dollar') >= 0) {
    return 'USD';
  }
  return '';
}

function ensureSheetWithHeaders_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  var currentHeaderRange = sheet.getRange(1, 1, 1, headers.length);
  var currentHeaders = currentHeaderRange.getValues()[0];
  var needsWrite = headers.some(function (h, i) {
    return String(currentHeaders[i] || '').trim() !== h;
  });

  if (needsWrite) {
    currentHeaderRange.setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
}

function getRecords_(sheetName, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return data
    .filter(function (row) {
      return row.some(function (cell) { return String(cell || '').trim() !== ''; });
    })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (header, idx) {
        obj[header] = row[idx];
      });
      return obj;
    });
}

function appendRecord_(sheetName, headers, record) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  var row = headers.map(function (h) { return record[h] !== undefined ? record[h] : ''; });
  sheet.appendRow(row);
}

function updateRecordById_(sheetName, headers, id, updaterFn) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var idColumnIndex = headers.indexOf('id') + 1;
  if (idColumnIndex <= 0) throw new Error('id header not found in sheet: ' + sheetName);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('No rows to update in sheet: ' + sheetName);

  var ids = sheet.getRange(2, idColumnIndex, lastRow - 1, 1).getValues().map(function (r) { return safeString_(r[0]); });
  var offset = ids.findIndex(function (cellId) { return cellId === id; });
  if (offset < 0) throw new Error('Record not found for id: ' + id);

  var rowNumber = offset + 2;
  var currentRowValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var current = {};
  headers.forEach(function (h, i) { current[h] = currentRowValues[i]; });

  var next = updaterFn(current);
  var nextValues = headers.map(function (h) { return next[h] !== undefined ? next[h] : ''; });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([nextValues]);

  return next;
}

function deleteRecordById_(sheetName, id) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) {
    return String(h || '').trim();
  });
  var idColumnIndex = headers.indexOf('id') + 1;
  if (idColumnIndex <= 0) throw new Error('id header not found in sheet: ' + sheetName);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('No rows to delete in sheet: ' + sheetName);

  var ids = sheet.getRange(2, idColumnIndex, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i += 1) {
    if (safeString_(ids[i][0]) === id) {
      sheet.deleteRow(i + 2);
      return { id: id };
    }
  }

  throw new Error('Record not found for id: ' + id);
}

function delegateExistingDoGet_(e, resource) {
  if (resource === 'tickets' && typeof getTickets === 'function') {
    return getTickets(e);
  }
  if (resource === 'events' && typeof getEvents === 'function') {
    return getEvents(e);
  }
  if (typeof doGetExisting === 'function') {
    return doGetExisting(e);
  }
  return jsonResponse_({ ok: false, error: 'Unsupported resource: ' + (resource || '') });
}

function delegateExistingDoPost_(e, payload, resource) {
  if (resource === 'tickets' && typeof postTickets === 'function') {
    return postTickets(e, payload);
  }
  if (resource === 'events' && typeof postEvents === 'function') {
    return postEvents(e, payload);
  }
  if (typeof doPostExisting === 'function') {
    return doPostExisting(e);
  }
  return jsonResponse_({ ok: false, error: 'Unsupported resource: ' + (resource || '') });
}

function getSpreadsheet_() {
  return CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function parsePostBody_(e) {
  try {
    var body = e && e.postData && e.postData.contents;
    return body ? JSON.parse(body) : {};
  } catch (err) {
    return {};
  }
}

function normalizeDateInput_(value) {
  if (!value) return '';
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return safeString_(value);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function buildId_(prefix) {
  return prefix + '-' + Utilities.getUuid().slice(0, 8) + '-' + Date.now();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function extractMonth_(dateText) {
  if (!dateText) return 'Unknown';
  var date = new Date(dateText);
  if (isNaN(date.getTime())) return 'Unknown';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');
}

function toIsoString_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function toNumber_(value) {
  if (value === null || value === undefined || value === '') return 0;
  var n = Number(value);
  return isNaN(n) ? 0 : n;
}

function sumBy_(rows, key) {
  return rows.reduce(function (acc, row) {
    return acc + toNumber_(row[key]);
  }, 0);
}

function round2_(value) {
  return Math.round(toNumber_(value) * 100) / 100;
}

function shallowCopy_(obj) {
  var clone = {};
  Object.keys(obj || {}).forEach(function (k) { clone[k] = obj[k]; });
  return clone;
}

function safeString_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalize_(value) {
  return safeString_(value).toLowerCase();
}

function toBoolean_(value) {
  return ['true', '1', 'yes', 'y'].indexOf(normalize_(value)) >= 0;
}

function objectValues_(obj) {
  return Object.keys(obj).map(function (k) { return obj[k]; });
}

function getMaxColumns_(rows) {
  return rows.reduce(function (max, row) {
    return Math.max(max, row.length);
  }, 0);
}

function padRows_(rows) {
  var width = getMaxColumns_(rows);
  return rows.map(function (row) {
    if (row.length === width) return row;
    var next = row.slice();
    while (next.length < width) next.push('');
    return next;
  });
}
