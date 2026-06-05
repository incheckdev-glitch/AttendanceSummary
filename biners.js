(function initBinersModule(global) {
  'use strict';

  const PAGE_SIZE = 10;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase();
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const today = () => new Date().toISOString().slice(0, 10);
  const money = (value, currency = 'USD') => `${String(currency || 'USD').toUpperCase()} ${num(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '—';
  const monthLabel = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : '—';
  const auth = () => global.Session?.authContext?.() || {};

  const state = {
    initialized: false,
    activeTab: 'overview',
    forecastView: 'rows',
    entries: [],
    schedules: [],
    forecast: [],
    monthly: [],
    payments: [],
    companies: [],
    summary: null,
    drawer: null,
    filters: { search: '', status: 'all', paymentStatus: 'all', currency: 'all' },
    pages: {}
  };

  const request = (action, payload = {}) => {
    if (global.Api?.requestWithSession) return global.Api.requestWithSession('biners', action, payload);
    return global.SupabaseData.dispatch({ resource: 'biners', action, ...payload });
  };
  const can = action => Boolean(global.Permissions?.canPerformAction?.('biners', action) || global.Permissions?.canPerformAction?.('biners', 'manage') || global.Permissions?.hasAdminOverride?.());
  const entryId = row => row?.biners_entry_id || row?.entry_id || row?.binersEntryId || row?.id;
  const scheduleId = row => row?.schedule_id || row?.biners_schedule_id || row?.scheduleId || row?.id;
  const getEntry = row => state.entries.find(item => String(item.id) === String(entryId(row))) || row || {};
  const remaining = row => row?.remaining_amount ?? Math.max(0, num(row?.scheduled_amount) - num(row?.paid_amount));
  const currencyOf = row => row?.currency || getEntry(row)?.currency || 'USD';
  const badge = value => `<span class="pf-status-badge pf-status-${esc(norm(value || 'scheduled').replace(/_/g, '-'))}">${esc(String(value || 'scheduled').replace(/_/g, ' '))}</span>`;
  const stopAction = html => `<span class="biners-row-actions">${html}</span>`;

  function setState(message = '', cls = 'muted') {
    const el = $('binersState');
    if (el) {
      el.className = `${cls} pf-state`;
      el.textContent = message;
    }
  }

  function daysUntil(value) {
    if (!value) return null;
    const due = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((due - base) / 86400000);
  }

  function statusFor(row) {
    const explicit = norm(row?.forecast_status || row?.payment_status || row?.status);
    if (explicit === 'cancelled' || explicit === 'canceled') return 'cancelled';
    if (num(remaining(row)) <= 0) return 'paid';
    if (num(row?.paid_amount) > 0) return 'partially_paid';
    const days = daysUntil(row?.due_date);
    if (days == null) return explicit || 'scheduled';
    return days < 0 ? 'overdue' : days <= 7 ? 'due_soon' : 'scheduled';
  }

  function rowContext(row) {
    const entry = getEntry(row);
    return {
      ...entry,
      ...row,
      client_name: row?.client_name || entry?.client_name || entry?.client_legal_name || entry?.company_name,
      biners_entry_number: row?.biners_entry_number || entry?.biners_entry_number,
      module_name: row?.module_name || entry?.module_name,
      license_type: row?.license_type || entry?.license_type,
      license_length_months: row?.license_length_months || entry?.license_length_months,
      number_of_locations: row?.number_of_locations || entry?.number_of_locations,
      currency: row?.currency || entry?.currency || 'USD'
    };
  }

  function table(headers, body, empty = 'No data found.') {
    return `<div class="table-wrap biners-table-wrap"><table class="biners-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${headers.length}" class="muted">${esc(empty)}</td></tr>`}</tbody></table></div>`;
  }

  function paymentButton(row) {
    const id = scheduleId(row);
    return can('record_payment') && id && num(remaining(row)) > 0
      ? `<button class="btn ghost xs" type="button" data-biners-record-payment="${esc(id)}">Record Payment</button>`
      : '';
  }

  function clickable(attrs, cells) {
    return `<tr class="biners-clickable-row" tabindex="0" ${attrs}>${cells}</tr>`;
  }

  function calculateSummary() {
    const rows = state.forecast.length ? state.forecast : state.schedules;
    const entries = state.entries || [];
    return {
      total_entries: entries.length,
      active_entries: entries.filter(x => !['cancelled', 'canceled', 'completed'].includes(norm(x.entry_status))).length,
      total_locations: entries.reduce((s, x) => s + num(x.number_of_locations), 0) || new Set(rows.map(x => x.biners_location_id || x.location_reference || x.location_name).filter(Boolean)).size,
      gross_payable: rows.reduce((s, x) => s + num(x.scheduled_amount), 0),
      paid_amount: rows.reduce((s, x) => s + num(x.paid_amount), 0),
      remaining_payable: rows.reduce((s, x) => s + num(remaining(x)), 0),
      overdue_amount: rows.filter(x => statusFor(x) === 'overdue').reduce((s, x) => s + num(remaining(x)), 0),
      due_this_week: rows.filter(x => { const d = daysUntil(x.due_date); return d != null && d >= 0 && d <= 7 && num(remaining(x)) > 0; }).reduce((s, x) => s + num(remaining(x)), 0),
      due_this_month: rows.filter(x => {
        if (!x.due_date || num(remaining(x)) <= 0) return false;
        const d = new Date(`${String(x.due_date).slice(0, 10)}T00:00:00`), now = new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).reduce((s, x) => s + num(remaining(x)), 0),
      next_30_days: rows.filter(x => { const d = daysUntil(x.due_date); return d != null && d >= 0 && d <= 30 && num(remaining(x)) > 0; }).reduce((s, x) => s + num(remaining(x)), 0),
      next_90_days: rows.filter(x => { const d = daysUntil(x.due_date); return d != null && d >= 0 && d <= 90 && num(remaining(x)) > 0; }).reduce((s, x) => s + num(remaining(x)), 0),
      currency: rows[0]?.currency || entries[0]?.currency || 'USD'
    };
  }

  function renderSummary() {
    const el = $('binersSummary');
    if (!el) return;
    const calculated = calculateSummary();
    const rpc = state.summary || {};
    const s = { ...calculated, ...rpc };
    // The RPC returns payable totals only. Keep operational counts from calculated data when RPC does not provide them.
    s.total_entries = s.total_entries ?? calculated.total_entries;
    s.active_entries = s.active_entries ?? calculated.active_entries;
    s.total_locations = s.total_locations ?? calculated.total_locations;
    const c = s.currency || calculated.currency || 'USD';
    const cards = [
      ['Total Entries', s.total_entries, 'Entries tracked', 'count'],
      ['Active Entries', s.active_entries, 'Open/active records', 'count'],
      ['Total Locations', s.total_locations, 'Locations covered', 'count'],
      ['Gross Payable', money(s.gross_payable, c), 'Scheduled payable', 'text'],
      ['Paid Amount', money(s.paid_amount, c), 'Already paid', 'text'],
      ['Remaining Payable', money(s.remaining_payable, c), 'Still outstanding', 'text'],
      ['Overdue Amount', money(s.overdue_amount, c), 'Needs follow-up', 'text'],
      ['Due This Week', money(s.due_this_week, c), 'Next 7 days', 'text'],
      ['Due This Month', money(s.due_this_month, c), 'Current month', 'text'],
      ['Next 30 Days', money(s.next_30_days, c), 'Near-term payable', 'text'],
      ['Next 90 Days', money(s.next_90_days, c), 'Quarter forecast', 'text']
    ];
    el.innerHTML = cards.map(([label, value, helper]) => `<article class="payment-forecast-summary-card biners-summary-card"><div class="summary-label">${esc(label)}</div><div class="summary-value">${esc(value ?? 0)}</div><div class="summary-subtitle">${esc(helper)}</div></article>`).join('');
  }

  function filtered(rows) {
    const f = state.filters, q = norm(f.search);
    return (rows || []).filter(row => {
      const status = norm(row.entry_status || row.status || row.forecast_status);
      const paymentStatus = norm(row.payment_status || statusFor(row));
      return (!q || norm(JSON.stringify(row)).includes(q))
        && (f.status === 'all' || status === f.status)
        && (f.paymentStatus === 'all' || paymentStatus === f.paymentStatus)
        && (f.currency === 'all' || norm(row.currency) === f.currency);
    });
  }

  function pageKey() { return state.activeTab + (state.activeTab === 'forecast' ? `_${state.forecastView}` : ''); }
  function paged(key, rows) {
    const page = state.pages[key] || 1;
    const max = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.pages[key] = Math.min(Math.max(1, page), max);
    return rows.slice((state.pages[key] - 1) * PAGE_SIZE, state.pages[key] * PAGE_SIZE);
  }
  function renderPagination(key, total) {
    const el = $('binersPagination');
    if (!el) return;
    const page = state.pages[key] || 1, max = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = total ? ((page - 1) * PAGE_SIZE) + 1 : 0;
    const end = Math.min(page * PAGE_SIZE, total);
    el.innerHTML = `<div class="pf-pagination"><span>Showing ${start}–${end} of ${total} · 10 rows per page</span><button class="btn ghost sm" data-biners-page="prev" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${max}</span><button class="btn ghost sm" data-biners-page="next" ${page >= max ? 'disabled' : ''}>Next</button></div>`;
  }

  function bulkToolbar(type, rows) {
    if (!['scheduled_payments', 'forecast'].includes(state.activeTab) || !can('record_payment')) return '';
    const eligible = rows.filter(r => scheduleId(r) && num(remaining(r)) > 0).length;
    return `<div class="biners-bulk-toolbar"><div><strong>Bulk payment</strong><span class="muted"> Select scheduled rows and record one payment batch.</span></div><button class="btn sm" type="button" data-biners-bulk-payment ${eligible ? '' : 'disabled'}>Record Selected Payments</button></div>`;
  }

  function selectCell(row) {
    const id = scheduleId(row);
    return id && num(remaining(row)) > 0 ? `<input type="checkbox" data-biners-select-schedule="${esc(id)}" aria-label="Select schedule">` : '';
  }

  function entriesTable(rows) {
    return table(['Entry #', 'Client', 'Module', 'Locations', 'License', 'Gross Payable', 'Payment', 'Status', 'Actions'], rows.map(r => clickable(`data-biners-open-entry="${esc(r.id)}"`, `<td><strong>${esc(r.biners_entry_number || 'Auto')}</strong></td><td>${esc(r.client_name || r.client_legal_name || '—')}</td><td>${esc(r.module_name || '—')}</td><td>${esc(r.number_of_locations || 0)}</td><td>${esc(r.license_type || '—')} · ${esc(r.license_length_months || '—')} mo</td><td>${money(r.total_payable_amount, r.currency)}</td><td>${badge(r.payment_status)}</td><td>${badge(r.entry_status)}</td><td>${stopAction('<button class="btn ghost xs" type="button" data-biners-open-entry="' + esc(r.id) + '">View</button>')}</td>`)).join(''), 'No Biners entries found.');
  }

  function scheduleTable(rows, kind = 'schedule') {
    const showSelect = ['scheduled_payments', 'forecast'].includes(state.activeTab) && can('record_payment');
    const headers = [showSelect ? '<input type="checkbox" data-biners-select-all-schedules aria-label="Select all visible schedules">' : null, 'Entry #', 'Client', 'Location', 'Module', 'License', 'Schedule #', 'Due Date', 'Scheduled', 'Paid', 'Remaining', 'Status', 'Timing', 'Actions'].filter(Boolean);
    const body = rows.map(raw => {
      const r = rowContext(raw);
      const timing = daysUntil(r.due_date) == null ? '—' : daysUntil(r.due_date) < 0 ? `${Math.abs(daysUntil(r.due_date))} days overdue` : `${daysUntil(r.due_date)} days until due`;
      const attrs = `data-biners-open-${kind}="${esc(scheduleId(raw))}"`;
      return clickable(attrs, `${showSelect ? `<td>${selectCell(raw)}</td>` : ''}<td><strong>${esc(r.biners_entry_number || '—')}</strong></td><td>${esc(r.client_name || '—')}</td><td>${esc(r.location_name || r.location_reference || r.location || '—')}</td><td>${esc(r.module_name || '—')}</td><td>${esc(r.license_type || '—')} · ${esc(r.license_length_months || '—')} mo</td><td>${esc(r.schedule_no || '—')}</td><td>${date(r.due_date)}</td><td>${money(r.scheduled_amount, r.currency)}</td><td>${money(r.paid_amount, r.currency)}</td><td>${money(remaining(r), r.currency)}</td><td>${badge(statusFor(r))}</td><td>${esc(timing)}</td><td>${stopAction(paymentButton(r))}</td>`);
    }).join('');
    return `${bulkToolbar(kind, rows)}${table(headers, body)}`;
  }

  function paymentsTable(rows) {
    return table(['Date', 'Entry #', 'Client', 'Schedule #', 'Amount', 'Method', 'Reference', 'Notes'], rows.map(raw => {
      const r = rowContext(raw);
      return clickable(`data-biners-open-payment="${esc(raw.id)}"`, `<td>${date(r.payment_date)}</td><td>${esc(r.biners_entry_number || '—')}</td><td>${esc(r.client_name || '—')}</td><td>${esc(r.schedule_no || '—')}</td><td>${money(r.payment_amount, r.currency)}</td><td>${esc(r.payment_method || '—')}</td><td>${esc(r.payment_reference || '—')}</td><td>${esc(r.notes || '—')}</td>`);
    }).join(''));
  }

  function monthlyTable(rows) {
    return table(['Month', 'Currency', 'Scheduled Rows', 'Clients', 'Entries', 'Locations', 'Gross Payable', 'Paid Amount', 'Remaining Payable', 'Overdue Amount', 'Due Soon Amount', 'Actions'], rows.map(r => clickable(`data-biners-open-month="${esc(r.forecast_month || r.month)}" data-biners-currency="${esc(r.currency)}"`, `<td><strong>${esc(monthLabel(r.forecast_month || r.month))}</strong></td><td>${esc(r.currency || 'USD')}</td><td>${esc(r.scheduled_rows || r.schedule_count || 0)}</td><td>${esc(r.client_count || r.clients || 0)}</td><td>${esc(r.entry_count || r.entries || 0)}</td><td>${esc(r.location_count || r.locations || 0)}</td><td>${money(r.gross_payable, r.currency)}</td><td>${money(r.paid_amount, r.currency)}</td><td>${money(r.remaining_payable, r.currency)}</td><td>${money(r.overdue_amount, r.currency)}</td><td>${money(r.due_soon_amount, r.currency)}</td><td>${stopAction('<button class="btn ghost xs" type="button" data-biners-open-month="' + esc(r.forecast_month || r.month) + '" data-biners-currency="' + esc(r.currency) + '">View</button>')}</td>`)).join(''));
  }

  function render() {
    renderSummary();
    const body = $('binersTabBody');
    if (!body) return;
    let key = state.activeTab, rows = [];
    if (key === 'overview' || key === 'entries') rows = filtered(state.entries);
    else if (key === 'scheduled_payments') rows = filtered(state.schedules);
    else if (key === 'payments_history') rows = filtered(state.payments);
    else rows = filtered(state.forecastView === 'monthly' ? state.monthly : state.forecast);
    const keyName = pageKey();
    const visible = paged(keyName, rows);

    if (key === 'overview') {
      body.innerHTML = `<div class="card biners-overview-card"><strong>Biners payable overview</strong><p class="muted">Outgoing payments to Biners only. Invoices, receipts, and client statements are not affected.</p></div>${entriesTable(visible)}`;
    } else if (key === 'entries') {
      body.innerHTML = entriesTable(visible);
    } else if (key === 'scheduled_payments') {
      body.innerHTML = scheduleTable(visible, 'schedule');
    } else if (key === 'payments_history') {
      body.innerHTML = paymentsTable(visible);
    } else {
      body.innerHTML = `<nav class="biners-forecast-tabs"><button class="btn ${state.forecastView === 'rows' ? '' : 'ghost'} sm" data-biners-forecast-view="rows">Forecast Rows</button><button class="btn ${state.forecastView === 'monthly' ? '' : 'ghost'} sm" data-biners-forecast-view="monthly">Monthly Forecast</button></nav>${state.forecastView === 'monthly' ? monthlyTable(visible) : scheduleTable(visible, 'forecast')}`;
    }
    renderPagination(keyName, rows.length);
    setState(`${rows.length} ${key.replace(/_/g, ' ')} row(s) loaded.`);
  }

  function normalizeDetail(data) {
    if (Array.isArray(data)) return { rows: data };
    return data && typeof data === 'object' ? data : {};
  }

  function detailRowsFor(row) {
    const id = entryId(row), sid = scheduleId(row);
    return {
      entry: getEntry(row),
      schedules: state.schedules.filter(x => String(entryId(x)) === String(id) || (sid && String(scheduleId(x)) === String(sid))),
      payments: state.payments.filter(x => String(entryId(x)) === String(id) || (sid && String(x.schedule_id) === String(sid)))
    };
  }

  function miniTable(title, rows, columns) {
    return `<section class="biners-drawer-section"><h3>${esc(title)}</h3>${table(columns.map(x => esc(x[0])), (rows || []).map(r => `<tr>${columns.map(x => `<td>${x[2] === 'html' ? (x[1](r) || '—') : esc(x[1](r) ?? '—')}</td>`).join('')}</tr>`).join(''))}</section>`;
  }

  function formatDrawerValue(label, value, currency) {
    const countLabels = ['clients', 'entries', 'locations', 'scheduled rows', 'schedules'];
    if (countLabels.includes(norm(label))) return esc(num(value).toLocaleString());
    return money(value, currency);
  }

  function aggregateRows(rows, currency = 'USD') {
    const list = rows || [];
    return {
      currency,
      gross_payable: list.reduce((s, x) => s + num(x.scheduled_amount), 0),
      paid_amount: list.reduce((s, x) => s + num(x.paid_amount), 0),
      remaining_payable: list.reduce((s, x) => s + num(remaining(x)), 0),
      overdue_amount: list.filter(x => statusFor(x) === 'overdue').reduce((s, x) => s + num(remaining(x)), 0),
      clients: new Set(list.map(x => x.client_name).filter(Boolean)).size,
      entries: new Set(list.map(x => x.biners_entry_id).filter(Boolean)).size,
      locations: new Set(list.map(x => x.biners_location_id || x.location_name).filter(Boolean)).size,
      scheduled_rows: list.length
    };
  }

  function openDrawer(row, type = 'entry', remote = {}) {
    const drawer = $('binersDetailsDrawer'), content = $('binersDetailsContent');
    if (!drawer || !content) return;
    const r = rowContext(row || {}), local = detailRowsFor(r), detail = normalizeDetail(remote);
    let schedules = detail.scheduled_payments || detail.schedules || detail.rows || local.schedules;
    const payments = detail.payment_history || detail.payments || local.payments;
    const entries = detail.entries || (local.entry?.id ? [local.entry] : []);
    const locations = detail.locations || detail.related_locations || [];
    const aggregate = type === 'month' ? aggregateRows(schedules, r.currency) : null;
    state.drawer = { row: r, type, remote };

    const stats = type === 'month'
      ? [['Gross Payable', aggregate.gross_payable], ['Paid Amount', aggregate.paid_amount], ['Remaining', aggregate.remaining_payable], ['Overdue', aggregate.overdue_amount], ['Clients', aggregate.clients], ['Entries', aggregate.entries], ['Locations', aggregate.locations], ['Scheduled Rows', aggregate.scheduled_rows]]
      : [['Gross Payable', r.gross_payable ?? r.total_payable_amount ?? r.scheduled_amount], ['Paid Amount', r.paid_amount], ['Remaining', r.remaining_payable ?? remaining(r)], ['Overdue', r.overdue_amount], ['Clients', r.client_count], ['Entries', r.entry_count], ['Locations', r.location_count ?? r.number_of_locations]].filter(x => x[1] !== undefined && x[1] !== null);

    const detailsTitle = type === 'month' ? 'Monthly forecast details' : 'Client & entry details';
    const detailsHtml = type === 'month'
      ? `<dl class="biners-detail-list"><div><dt>Month</dt><dd>${esc(monthLabel(r.forecast_month || r.month || r.due_date))}</dd></div><div><dt>Currency</dt><dd>${esc(r.currency || 'USD')}</dd></div><div><dt>Clients</dt><dd>${esc(aggregate.clients)}</dd></div><div><dt>Entries</dt><dd>${esc(aggregate.entries)}</dd></div><div><dt>Locations</dt><dd>${esc(aggregate.locations)}</dd></div><div><dt>Scheduled Rows</dt><dd>${esc(aggregate.scheduled_rows)}</dd></div></dl>`
      : `<dl class="biners-detail-list"><div><dt>Client</dt><dd>${esc(r.client_name || '—')}</dd></div><div><dt>Entry #</dt><dd>${esc(r.biners_entry_number || '—')}</dd></div><div><dt>Location</dt><dd>${esc(r.location_name || r.location_reference || r.location || '—')}</dd></div><div><dt>Module</dt><dd>${esc(r.module_name || '—')}</dd></div><div><dt>License</dt><dd>${esc(r.license_type || '—')} · ${esc(r.license_length_months || '—')} months</dd></div><div><dt>Schedule / Due</dt><dd>#${esc(r.schedule_no || '—')} · ${date(r.due_date)}</dd></div><div><dt>Status</dt><dd>${badge(statusFor(r))}</dd></div><div><dt>Timing</dt><dd>${daysUntil(r.due_date) == null ? '—' : daysUntil(r.due_date) < 0 ? `${Math.abs(daysUntil(r.due_date))} days overdue` : `${daysUntil(r.due_date)} days until due`}</dd></div></dl>${paymentButton(r) ? `<div class="biners-drawer-actions">${paymentButton(r)}</div>` : ''}`;

    content.innerHTML = `<div class="biners-drawer-summary">${stats.map(([a, b]) => `<article><span>${esc(a)}</span><strong>${formatDrawerValue(a, b, r.currency)}</strong></article>`).join('')}</div><section class="biners-drawer-section"><h3>${esc(detailsTitle)}</h3>${detailsHtml}</section>${miniTable('Scheduled payments', schedules, [['#', x => x.schedule_no], ['Client', x => x.client_name], ['Location', x => x.location_name || x.location_reference], ['Module', x => x.module_name], ['Due', x => date(x.due_date)], ['Scheduled', x => money(x.scheduled_amount, x.currency || r.currency)], ['Paid', x => money(x.paid_amount, x.currency || r.currency)], ['Remaining', x => money(remaining(x), x.currency || r.currency)], ['Status', x => badge(statusFor(x)), 'html']])}${miniTable('Payment history', payments, [['Date', x => date(x.payment_date)], ['Amount', x => money(x.payment_amount, x.currency || r.currency)], ['Method', x => x.payment_method], ['Reference', x => x.payment_reference], ['Notes', x => x.notes]])}${locations.length ? miniTable('Related clients / locations', locations, [['Client', x => x.client_name], ['Location', x => x.location_name || x.location], ['Module', x => x.module_name]]) : ''}${entries.length > 1 ? miniTable('Related entries', entries, [['Entry #', x => x.biners_entry_number], ['Client', x => x.client_name], ['Module', x => x.module_name]]) : ''}`;
    drawer.hidden = false;
  }

  async function openMonthly(month, currency) {
    setState('Loading monthly forecast details…');
    try {
      const detail = await (global.Api?.getBinersMonthlyForecastDetails?.(month, currency) || request('monthly_forecast_details', { forecast_month: month, currency }));
      const base = state.monthly.find(x => String(x.forecast_month || x.month) === String(month) && String(x.currency) === String(currency)) || { forecast_month: month, currency };
      openDrawer({ ...base, due_date: month }, 'month', detail);
      setState('Monthly forecast details loaded.');
    } catch (e) {
      setState(e.message || String(e), 'error');
    }
  }

  function closeDrawer() { const drawer = $('binersDetailsDrawer'); if (drawer) drawer.hidden = true; state.drawer = null; }

  function populateCompanies() {
    const select = $('binersExistingClientId');
    if (select) select.innerHTML = '<option value="">Select existing client...</option>' + state.companies.map(c => `<option value="${esc(c.id)}">${esc(c.legal_name || c.company_name || c.name || 'Client')}</option>`).join('');
  }

  function addScheduleRow(data = {}) {
    const el = document.createElement('div');
    el.className = 'biners-schedule-row';
    el.innerHTML = `<label>#<input class="input" type="number" min="1" data-biners-schedule-no value="${esc(data.schedule_no || $('binersScheduleRowsContainer').children.length + 1)}"></label><label>Due Date<input class="input" type="date" data-biners-schedule-due value="${esc(data.due_date || today())}"></label><label>Amount<input class="input" type="number" min="0" step="0.01" data-biners-schedule-amount value="${esc(data.scheduled_amount || 0)}"></label><label>Status<select class="select" data-biners-schedule-status><option>scheduled</option><option>due_soon</option><option>overdue</option></select></label><button class="btn ghost xs" type="button" data-biners-remove-row>Remove</button>`;
    $('binersScheduleRowsContainer').append(el);
  }

  function addLocationRow(data = {}) {
    const el = document.createElement('div');
    el.className = 'biners-location-row';
    el.innerHTML = `<input class="input" data-biners-location-name placeholder="Location name" value="${esc(data.location_name || '')}"><input class="input" data-biners-location-code placeholder="Location reference" value="${esc(data.location_reference || data.location_code || '')}"><button class="btn ghost xs" type="button" data-biners-remove-row>Remove</button>`;
    $('binersLocationRowsContainer').append(el);
  }

  function openEntryModal() {
    const form = $('binersEntryForm');
    form.reset();
    $('binersCurrency').value = 'USD';
    $('binersLicenseLengthMonths').value = 12;
    $('binersNumberOfLocations').value = 1;
    $('binersLocationRowsContainer').innerHTML = '';
    $('binersScheduleRowsContainer').innerHTML = '';
    addLocationRow();
    addScheduleRow();
    updateTotal();
    $('binersEntryModal').hidden = false;
  }

  function selectedScheduleIds() {
    return [...document.querySelectorAll('[data-biners-select-schedule]:checked')].map(x => x.dataset.binersSelectSchedule).filter(Boolean);
  }

  function findSchedule(id) {
    return [...state.schedules, ...state.forecast].find(x => String(scheduleId(x)) === String(id));
  }

  function openPaymentModal(ids) {
    const idList = Array.isArray(ids) ? ids : [ids];
    const rows = idList.map(findSchedule).filter(Boolean);
    if (!rows.length) return;
    const totalRemaining = rows.reduce((s, r) => s + num(remaining(r)), 0);
    const first = rowContext(rows[0]);
    $('binersRecordPaymentForm').reset();
    $('binersPaymentScheduleId').value = idList.join(',');
    $('binersPaymentClient').value = rows.length === 1 ? (first.client_name || '') : `${rows.length} schedules selected`;
    $('binersPaymentEntryNumber').value = rows.length === 1 ? (first.biners_entry_number || '') : 'Bulk payment';
    $('binersPaymentScheduleNo').value = rows.length === 1 ? (first.schedule_no || '') : 'Multiple';
    $('binersPaymentScheduledAmount').value = rows.reduce((s, r) => s + num(r.scheduled_amount), 0).toFixed(2);
    $('binersPaymentAlreadyPaid').value = rows.reduce((s, r) => s + num(r.paid_amount), 0).toFixed(2);
    $('binersPaymentRemainingAmount').value = totalRemaining.toFixed(2);
    $('binersPaymentAmount').value = totalRemaining.toFixed(2);
    $('binersPaymentAmount').max = totalRemaining;
    $('binersPaymentDate').value = today();
    const ctx = $('binersPaymentContext');
    if (ctx) ctx.textContent = rows.length === 1 ? `Paying one scheduled payment for ${first.client_name || 'client'}.` : `Bulk payment for ${rows.length} selected scheduled payments. Amount will be allocated oldest/visible order first.`;
    $('binersRecordPaymentModal').hidden = false;
  }

  function closeEntry() { $('binersEntryModal').hidden = true; }
  function closePayment() { $('binersRecordPaymentModal').hidden = true; }
  const values = selector => [...document.querySelectorAll(selector)];

  async function saveEntry(e) {
    e.preventDefault();
    const company = state.companies.find(c => String(c.id) === String($('binersExistingClientId').value));
    const payload = {
      entry: {
        entry_type: $('binersEntryType').value,
        company_id: company?.id || null,
        client_name: $('binersClientName').value || company?.company_name || company?.legal_name,
        client_legal_name: $('binersClientLegalName').value,
        client_country: $('binersClientCountry').value,
        client_city: $('binersClientCity').value,
        client_address: $('binersClientAddress').value,
        client_contact_name: $('binersClientContactName').value,
        client_contact_email: $('binersClientContactEmail').value,
        client_contact_phone: $('binersClientContactPhone').value,
        module_name: $('binersModuleName').value,
        license_type: $('binersLicenseType').value,
        license_length_months: num($('binersLicenseLengthMonths').value),
        number_of_locations: num($('binersNumberOfLocations').value),
        service_start_date: $('binersServiceStartDate').value || null,
        service_end_date: $('binersServiceEndDate').value || null,
        currency: $('binersCurrency').value || 'USD',
        total_payable_amount: num($('binersTotalPayableAmount').value),
        cost_per_location: num($('binersCostPerLocation').value),
        description: $('binersDescription').value,
        internal_notes: $('binersInternalNotes').value,
        entry_status: 'active',
        payment_status: 'unpaid',
        created_by: auth().id || null,
        created_by_email: auth().email || ''
      },
      locations: values('.biners-location-row').map(x => ({
        location_name: x.querySelector('[data-biners-location-name]').value,
        location_reference: x.querySelector('[data-biners-location-code]').value,
        module_name: $('binersModuleName').value,
        license_type: $('binersLicenseType').value,
        license_length_months: num($('binersLicenseLengthMonths').value),
        service_start_date: $('binersServiceStartDate').value || null,
        service_end_date: $('binersServiceEndDate').value || null,
        currency: $('binersCurrency').value || 'USD',
        cost_amount: num($('binersCostPerLocation').value)
      })).filter(x => x.location_name || x.location_reference),
      schedules: values('.biners-schedule-row').map(x => ({
        schedule_no: num(x.querySelector('[data-biners-schedule-no]').value),
        due_date: x.querySelector('[data-biners-schedule-due]').value,
        scheduled_amount: num(x.querySelector('[data-biners-schedule-amount]').value),
        payment_status: x.querySelector('[data-biners-schedule-status]').value,
        currency: $('binersCurrency').value || 'USD',
        created_by: auth().id || null,
        created_by_email: auth().email || ''
      })).filter(x => x.due_date && x.scheduled_amount > 0)
    };
    await request('create', payload);
    closeEntry();
    await refresh();
    global.UI?.toast?.('Biners entry created.');
  }

  async function recordOneSchedulePayment(row, amount, basePayload) {
    if (!row || amount <= 0) return null;
    return global.Api?.recordBinersScheduledPayment?.({ ...basePayload, schedule_id: scheduleId(row), payment_amount: amount }) || request('record_scheduled_payment', { ...basePayload, schedule_id: scheduleId(row), payment_amount: amount });
  }

  async function savePayment(e) {
    e.preventDefault();
    let amount = num($('binersPaymentAmount').value), max = num($('binersPaymentRemainingAmount').value);
    if (amount <= 0 || amount > max) { setState(`Payment amount must be greater than 0 and no more than ${max.toFixed(2)}.`, 'error'); return; }
    if (!$('binersPaymentDate').value) { setState('Payment date is required.', 'error'); return; }
    const ids = $('binersPaymentScheduleId').value.split(',').map(x => x.trim()).filter(Boolean);
    const rows = ids.map(findSchedule).filter(Boolean);
    const basePayload = { payment_date: $('binersPaymentDate').value, payment_method: $('binersPaymentMethod').value, payment_reference: $('binersPaymentReference').value, notes: $('binersPaymentNotes').value, created_by: auth().id || null, created_by_email: auth().email || '' };
    const btn = $('binersSavePaymentBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    try {
      for (const row of rows) {
        if (amount <= 0) break;
        const applied = Math.min(amount, num(remaining(row)));
        if (applied > 0) await recordOneSchedulePayment(row, applied, basePayload);
        amount -= applied;
      }
      closePayment();
      const drawer = state.drawer;
      await refresh();
      if (drawer) {
        if (drawer.type === 'month') await openMonthly(drawer.row.forecast_month || drawer.row.month || drawer.row.due_date, drawer.row.currency);
        else openDrawer([...state.schedules, ...state.forecast, ...state.entries, ...state.payments].find(x => String(scheduleId(x)) === String(scheduleId(drawer.row)) || String(x.id) === String(drawer.row.id)) || drawer.row, drawer.type);
      }
      global.UI?.toast?.(ids.length > 1 ? 'Bulk Biners payment recorded.' : 'Scheduled payment recorded.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Payment'; }
    }
  }

  function updateTotal() { const el = $('binersTotalPayableAmount'); if (el) el.value = (num($('binersNumberOfLocations').value) * num($('binersCostPerLocation').value)).toFixed(2); }

  function normalizeList(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.rows)) return value.rows;
    return value ? [value] : [];
  }

  async function refresh() {
    setState('Loading Biners payable data…');
    try {
      const [entries, schedules, forecast, payments, summary, monthly, companies] = await Promise.all([
        request('list'),
        request('list_schedules'),
        request('list_forecast'),
        request('list_payments'),
        request('summary').catch(() => null),
        (global.Api?.getBinersMonthlyForecast?.() || request('monthly_forecast')).catch(() => []),
        (global.Api?.requestWithSession?.('companies', 'list', { limit: 1000 }).catch(() => []) || Promise.resolve([]))
      ]);
      Object.assign(state, {
        entries: normalizeList(entries),
        schedules: normalizeList(schedules),
        forecast: normalizeList(forecast),
        payments: normalizeList(payments),
        summary: summary && Array.isArray(summary) ? summary[0] : summary,
        monthly: normalizeList(monthly),
        companies: Array.isArray(companies) ? companies : (companies?.rows || [])
      });
      populateCompanies();
      const currencies = [...new Set([...state.entries, ...state.forecast, ...state.monthly].map(x => x.currency).filter(Boolean))];
      if ($('binersCurrencyFilter')) $('binersCurrencyFilter').innerHTML = '<option value="all">All currencies</option>' + currencies.map(x => `<option>${esc(x)}</option>`).join('');
      render();
    } catch (e) {
      console.error('[Biners]', e);
      setState(e.message || String(e), 'error');
    }
  }

  function setActiveTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('[data-biners-tab]').forEach(x => x.classList.toggle('active', x.dataset.binersTab === tab));
    render();
  }

  function exportCsv() {
    const source = state.activeTab === 'payments_history' ? state.payments : state.activeTab === 'scheduled_payments' ? state.schedules : state.activeTab === 'forecast' ? (state.forecastView === 'monthly' ? state.monthly : state.forecast) : state.entries;
    const rows = filtered(source);
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const csv = [keys.join(','), ...rows.map(row => keys.map(key => '"' + String(row[key] ?? '').replace(/"/g, '""') + '"').join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `biners-${state.activeTab}-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bind() {
    $('binersRefreshBtn')?.addEventListener('click', refresh);
    $('binersCreateBtn')?.addEventListener('click', openEntryModal);
    $('binersExportBtn')?.addEventListener('click', exportCsv);
    $('binersClearFiltersBtn')?.addEventListener('click', () => {
      $('binersSearchInput').value = '';
      $('binersStatusFilter').value = 'all';
      $('binersPaymentStatusFilter').value = 'all';
      $('binersCurrencyFilter').value = 'all';
      state.filters = { search: '', status: 'all', paymentStatus: 'all', currency: 'all' };
      state.pages = {};
      render();
    });
    $('binersExistingClientId')?.addEventListener('change', () => {
      const c = state.companies.find(x => String(x.id) === String($('binersExistingClientId').value));
      if (!c) return;
      $('binersClientName').value = c.company_name || c.legal_name || c.name || '';
      $('binersClientLegalName').value = c.legal_name || c.company_name || c.name || '';
      $('binersClientCountry').value = c.country || '';
      $('binersClientCity').value = c.city || '';
      $('binersClientAddress').value = c.address || '';
      $('binersClientContactEmail').value = c.main_email || '';
      $('binersClientContactPhone').value = c.main_phone || '';
    });
    document.querySelectorAll('[data-biners-tab]').forEach(x => x.addEventListener('click', () => setActiveTab(x.dataset.binersTab)));
    document.querySelectorAll('[data-biners-close-entry]').forEach(x => x.addEventListener('click', closeEntry));
    document.querySelectorAll('[data-biners-close-payment]').forEach(x => x.addEventListener('click', closePayment));
    document.querySelectorAll('[data-biners-close-drawer]').forEach(x => x.addEventListener('click', closeDrawer));
    $('binersEntryForm')?.addEventListener('submit', e => saveEntry(e).catch(err => setState(err.message || String(err), 'error')));
    $('binersRecordPaymentForm')?.addEventListener('submit', e => savePayment(e).catch(err => setState(err.message || String(err), 'error')));
    $('binersAddScheduleRowBtn')?.addEventListener('click', () => addScheduleRow());
    $('binersAddLocationRowBtn')?.addEventListener('click', () => addLocationRow());
    ['binersNumberOfLocations', 'binersCostPerLocation'].forEach(id => $(id)?.addEventListener('input', updateTotal));
    ['binersSearchInput', 'binersStatusFilter', 'binersPaymentStatusFilter', 'binersCurrencyFilter'].forEach(id => $(id)?.addEventListener(id === 'binersSearchInput' ? 'input' : 'change', () => {
      state.filters = { search: $('binersSearchInput').value, status: $('binersStatusFilter').value, paymentStatus: $('binersPaymentStatusFilter').value, currency: $('binersCurrencyFilter').value };
      state.pages = {};
      render();
    }));
    document.addEventListener('change', e => {
      const all = e.target.closest('[data-biners-select-all-schedules]');
      if (all) {
        document.querySelectorAll('[data-biners-select-schedule]').forEach(x => { x.checked = all.checked; });
      }
    });
    document.addEventListener('click', e => {
      const actionEl = e.target.closest('button,a,input,label');
      if (actionEl?.closest('.biners-row-actions') || actionEl?.matches('[data-biners-record-payment],[data-biners-select-schedule],[data-biners-select-all-schedules]')) e.stopPropagation();
      const remove = e.target.closest('[data-biners-remove-row]');
      if (remove) { remove.parentElement.remove(); return; }
      const bulk = e.target.closest('[data-biners-bulk-payment]');
      if (bulk) { const ids = selectedScheduleIds(); if (!ids.length) { setState('Select at least one scheduled payment first.', 'error'); return; } openPaymentModal(ids); return; }
      const pay = e.target.closest('[data-biners-record-payment]');
      if (pay) { openPaymentModal(pay.dataset.binersRecordPayment); return; }
      const view = e.target.closest('[data-biners-forecast-view]');
      if (view) { state.forecastView = view.dataset.binersForecastView; render(); return; }
      const month = e.target.closest('[data-biners-open-month]');
      if (month) { openMonthly(month.dataset.binersOpenMonth, month.dataset.binersCurrency); return; }
      const entry = e.target.closest('[data-biners-open-entry]');
      if (entry) { openDrawer(state.entries.find(x => String(x.id) === String(entry.dataset.binersOpenEntry)), 'entry'); return; }
      const schedule = e.target.closest('[data-biners-open-schedule]');
      if (schedule) { openDrawer(state.schedules.find(x => String(scheduleId(x)) === String(schedule.dataset.binersOpenSchedule)), 'schedule'); return; }
      const forecast = e.target.closest('[data-biners-open-forecast]');
      if (forecast) { openDrawer(state.forecast.find(x => String(scheduleId(x)) === String(forecast.dataset.binersOpenForecast)), 'forecast'); return; }
      const payment = e.target.closest('[data-biners-open-payment]');
      if (payment) { openDrawer(state.payments.find(x => String(x.id) === String(payment.dataset.binersOpenPayment)), 'payment'); return; }
      const page = e.target.closest('[data-biners-page]');
      if (page) { const key = pageKey(); state.pages[key] = Math.max(1, (state.pages[key] || 1) + (page.dataset.binersPage === 'next' ? 1 : -1)); render(); }
    });
  }

  function init() { if (state.initialized) return; state.initialized = true; bind(); }
  global.Biners = { init, refresh, setActiveTab, openCreate: openEntryModal };
})(window);
