(function initBinersModule(global) {
  'use strict';

  const PAGE_SIZE = 10;
  const SAVE_TIMEOUT_MS = 20000;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase();
  function toNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const num = toNumber;
  function cleanPayload(payload) {
    return Object.fromEntries(Object.entries(payload || {}).filter(([, value]) => value !== undefined));
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const pickValue = (...values) => values.find(value => value !== null && value !== undefined && value !== '') || '—';
  const money = (value, currency = 'USD') => `${String(currency || 'USD').toUpperCase()} ${num(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '—';
  const monthLabel = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' }) : '—';
  const auth = () => global.Session?.authContext?.() || {};
  const isDevelopment = () => ['localhost', '127.0.0.1', '[::1]'].includes(global.location?.hostname) || global.location?.protocol === 'file:';
  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  }

  function makeRequestKey() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `biners-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function scheduleUniqueKey(row = {}, index = 0) {
    return String(row.schedule_id || row.biners_schedule_id || row.id || row.schedule_key || [
      row.biners_entry_id || row.entry_id || '',
      row.entry_number || row.biners_entry_number || '',
      row.location_reference || row.location_name || '',
      row.schedule_no || index + 1,
      row.due_date || '',
      row.scheduled_amount || ''
    ].join('|'));
  }

  function dedupeScheduleRows(rows = []) {
    const seen = new Set();
    return normalizeList(rows).filter((row, index) => {
      const key = scheduleUniqueKey(row, index);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const state = {
    initialized: false,
    activeTab: 'overview',
    forecastView: 'rows',
    entries: [],
    schedules: [],
    forecast: [],
    monthly: [],
    payments: [],
    clients: [],
    summary: null,
    drawer: null,
    filters: { search: '', status: 'all', paymentStatus: 'all', currency: 'all' },
    pages: {},
    savingEntry: false,
    selectedClient: null
  };

  async function request(action, payload = {}) {
    const cleanPayload = payload && typeof payload === 'object' ? payload : {};
    if (global.Api?.requestWithSession) {
      try {
        return await global.Api.requestWithSession('biners', action, cleanPayload);
      } catch (error) {
        if (isDevelopment()) console.warn('[Biners] Api request failed, trying direct Supabase dispatch fallback', action, error);
        if (!global.SupabaseData?.dispatch) throw error;
      }
    }
    if (global.SupabaseData?.dispatch) {
      const dispatched = await global.SupabaseData.dispatch({ resource: 'biners', action, ...cleanPayload });
      return dispatched?.handled ? dispatched.data : dispatched;
    }
    throw new Error('Biners data layer is not available.');
  }
  const can = action => Boolean(global.Permissions?.canPerformAction?.('biners', action) || global.Permissions?.canPerformAction?.('biners', 'manage') || global.Permissions?.hasAdminOverride?.());
  const entryId = row => row?.biners_entry_id || row?.entry_id || row?.binersEntryId || row?.id;
  const scheduleId = row => row?.schedule_id || row?.biners_schedule_id || row?.scheduleId || row?.id;
  const getEntry = row => state.entries.find(item => String(item.id) === String(entryId(row))) || row || {};
  const getForecastRow = row => state.forecast.find(item => String(scheduleId(item)) === String(scheduleId(row))) || {};
  const remaining = row => Math.max(0, num(row?.scheduled_amount) - num(row?.paid_amount));
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
    return days < 0 ? 'overdue' : 'upcoming';
  }

  function rowContext(row) {
    const entry = getEntry(row);
    const forecast = getForecastRow(row);
    return {
      ...entry,
      ...forecast,
      ...row,
      client_name: row?.client_name || forecast?.client_name || entry?.client_name || entry?.client_legal_name || entry?.company_name,
      biners_entry_number: row?.biners_entry_number || row?.entry_number || row?.reference || row?.biners_number || forecast?.biners_entry_number || forecast?.entry_number || forecast?.reference || entry?.biners_entry_number || entry?.entry_number || entry?.reference || entry?.biners_number,
      location_name: row?.location_name || row?.location || forecast?.location_name || forecast?.location,
      location_reference: row?.location_reference || row?.location_ref || row?.location_code || forecast?.location_reference || forecast?.location_ref || forecast?.location_code,
      module_name: row?.module || row?.module_name || forecast?.module || forecast?.module_name || entry?.module || entry?.module_name,
      license_type: row?.license || row?.license_type || forecast?.license || forecast?.license_type || entry?.license || entry?.license_type,
      license_length_months: row?.license_length_months || forecast?.license_length_months || entry?.license_length_months,
      number_of_locations: row?.number_of_locations || entry?.number_of_locations,
      currency: row?.currency || entry?.currency || 'USD'
    };
  }

  const clientLabel = row => pickValue(row?.client_name, row?.client_legal_name, row?.company_name);
  const locationLabel = row => pickValue(row?.location_name, row?.location, row?.site_name, 'Entry level / All locations');
  const moduleLabel = row => row?.module || row?.module_name || '—';
  const licenseLabel = row => row?.license || row?.license_type ? `${row?.license || row?.license_type} · ${row?.license_length_months ?? '—'} months` : '—';
  const timingLabel = row => {
    if (row?.days_overdue != null && num(row.days_overdue) > 0) return `${num(row.days_overdue)} days overdue`;
    if (row?.days_until_due != null) return `${num(row.days_until_due)} days until due`;
    const days = daysUntil(row?.due_date);
    return days == null ? '—' : days < 0 ? `${Math.abs(days)} days overdue` : `${days} days until due`;
  };

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
    return table(['Entry #', 'Client', 'Module', 'Locations', 'License', 'Gross Payable', 'Payment', 'Status', 'Actions'], rows.map(row => {
      const r = rowContext(row);
      const entryNumber = detailsEntryNumber(r);
      return clickable(`data-biners-open-entry="${esc(r.id)}"`, `<td><strong>${esc(entryNumber === '—' ? 'Auto' : entryNumber)}</strong></td><td>${esc(r.client_name || r.client_legal_name || '—')}</td><td>${esc(r.module_name || '—')}</td><td>${esc(r.number_of_locations || 0)}</td><td>${esc(r.license_type || '—')} · ${esc(r.license_length_months || '—')} mo</td><td>${money(r.total_payable_amount, r.currency)}</td><td>${badge(r.payment_status)}</td><td>${badge(r.entry_status)}</td><td>${stopAction('<button class="btn ghost xs" type="button" data-biners-open-entry="' + esc(r.id) + '">View</button>')}</td>`);
    }).join(''), 'No Biners entries found.');
  }

  function scheduleTable(rows, kind = 'schedule') {
    const showSelect = ['scheduled_payments', 'forecast'].includes(state.activeTab) && can('record_payment');
    const headers = [showSelect ? '<input type="checkbox" data-biners-select-all-schedules aria-label="Select all visible schedules">' : null, 'Entry #', 'Client', 'Location', 'Location Reference', 'Module', 'License', 'Schedule #', 'Due Date', 'Scheduled', 'Paid', 'Remaining', 'Status', 'Timing', 'Actions'].filter(Boolean);
    const body = rows.map(raw => {
      const r = rowContext(raw);
      const attrs = `data-biners-open-${kind}="${esc(scheduleId(raw))}"`;
      return clickable(attrs, `${showSelect ? `<td>${selectCell(raw)}</td>` : ''}<td><strong>${esc(r.biners_entry_number || '—')}</strong></td><td>${esc(clientLabel(r))}</td><td>${esc(locationLabel(r))}</td><td>${esc(r.location_reference || '—')}</td><td>${esc(moduleLabel(r))}</td><td>${esc(licenseLabel(r))}</td><td>${esc(r.schedule_no || '—')}</td><td>${date(r.due_date)}</td><td>${money(r.scheduled_amount, r.currency)}</td><td>${money(r.paid_amount, r.currency)}</td><td>${money(remaining(r), r.currency)}</td><td>${badge(r.forecast_status || statusFor(r))}</td><td>${esc(timingLabel(r))}</td><td>${stopAction(paymentButton(r))}</td>`);
    }).join('');
    return `${bulkToolbar(kind, rows)}${table(headers, body)}`;
  }

  function paymentsTable(rows) {
    return table(['Payment Date', 'Entry #', 'Client', 'Location', 'Location Reference', 'Module', 'License', 'Schedule #', 'Due Date', 'Scheduled', 'Paid', 'Remaining', 'Status', 'Payment Amount', 'Method', 'Reference', 'Notes'], rows.map(raw => {
      const r = rowContext(raw);
      return clickable(`data-biners-open-payment="${esc(raw.id)}"`, `<td>${date(r.payment_date)}</td><td>${esc(r.biners_entry_number || '—')}</td><td>${esc(clientLabel(r))}</td><td>${esc(locationLabel(r))}</td><td>${esc(r.location_reference || '—')}</td><td>${esc(moduleLabel(r))}</td><td>${esc(licenseLabel(r))}</td><td>${esc(r.schedule_no || '—')}</td><td>${date(r.due_date)}</td><td>${money(r.scheduled_amount, r.currency)}</td><td>${money(r.paid_amount, r.currency)}</td><td>${money(remaining(r), r.currency)}</td><td>${badge(r.forecast_status || statusFor(r))}</td><td>${money(r.payment_amount, r.currency)}</td><td>${esc(r.payment_method || '—')}</td><td>${esc(r.payment_reference || '—')}</td><td>${esc(r.notes || '—')}</td>`);
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
      schedules: state.forecast.filter(x => String(entryId(x)) === String(id) || (sid && String(scheduleId(x)) === String(sid))),
      payments: state.payments.filter(x => String(entryId(x)) === String(id) || (sid && String(x.schedule_id) === String(sid)))
    };
  }

  function miniTable(title, rows, columns) {
    return `<section class="biners-drawer-section"><h3>${esc(title)}</h3>${table(columns.map(x => esc(x[0])), (rows || []).map(r => `<tr>${columns.map(x => `<td>${x[2] === 'html' ? (x[1](r) || '—') : esc(x[1](r) ?? '—')}</td>`).join('')}</tr>`).join(''))}</section>`;
  }

  function formatDrawerValue(label, value, currency) {
    const countLabels = ['clients', 'entries', 'locations', 'scheduled rows', 'schedules'];
    const moneyLabels = ['gross payable', 'paid amount', 'remaining', 'overdue'];
    if (countLabels.includes(norm(label))) return esc(num(value).toLocaleString());
    if (moneyLabels.includes(norm(label))) return money(value, currency);
    return esc(value ?? '—');
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


  function getSupabaseClient() {
    return global.SupabaseClient?.getClient?.() || global.supabaseClient || null;
  }

  function detailsEntryNumber(entry = {}) {
    return pickValue(entry.entry_number, entry.biners_entry_number, entry.reference, entry.biners_number, entry.biners_entry_number);
  }

  function relatedToEntry(row = {}, entry = {}) {
    const id = entry.id;
    const number = detailsEntryNumber(entry);
    return [row.biners_entry_id, row.entry_id, row.biners_id].some(value => String(value || '') === String(id || ''))
      || [row.entry_number, row.reference, row.biners_entry_number].some(value => number !== '—' && String(value || '') === String(number));
  }

  async function queryBinersRelatedTable(supabase, tableName, entry, includeEntryNumber = false) {
    const entryIdValue = entry.id;
    if (!entryIdValue) return [];

    // Keep this query schema-safe. Earlier versions tried entry_id/biners_id/reference
    // in one .or() call, but PostgREST fails the whole request when any optional
    // column does not exist in the table schema cache. The final migration guarantees
    // biners_entry_id on Biners child tables, so use it as the stable relation key.
    let query = supabase.from(tableName).select('*').eq('biners_entry_id', entryIdValue);
    if (tableName === 'biners_payment_schedules') query = query.order('schedule_no', { ascending: true }).order('due_date', { ascending: true });
    const result = await query;
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function loadFromTableOptions(supabase, label, tableNames, entry, includeEntryNumber = false) {
    let lastError = null;
    for (const tableName of tableNames) {
      try {
        const rows = await queryBinersRelatedTable(supabase, tableName, entry, includeEntryNumber);
        return rows;
      } catch (error) {
        lastError = error;
        const code = String(error?.code || '');
        const message = String(error?.message || error || '');
        if (!/42P01|PGRST205|does not exist|Could not find the table/i.test(`${code} ${message}`)) throw error;
        if (isDevelopment()) console.warn(`[Biners] Optional ${label} table ${tableName} is unavailable`, error);
      }
    }
    if (lastError) throw lastError;
    return [];
  }

  async function loadBinersPayableDetails(entry) {
    const supabase = getSupabaseClient();
    if (!supabase?.from) throw new Error('Supabase client is not available for Biners payable details.');
    const entryIdValue = entry?.id;
    if (!entryIdValue) throw new Error('Unable to load Biners payable details without an entry id.');

    const [locations, schedule, payments] = await Promise.all([
      loadFromTableOptions(supabase, 'locations', ['biners_locations'], entry, false),
      loadFromTableOptions(supabase, 'schedule', ['biners_payment_schedules'], entry, true),
      loadFromTableOptions(supabase, 'payments', ['biners_payments', 'biners_receipts', 'biners_payment_history'], entry, true)
    ]);
    console.log('Biners entry id:', entry.id);
    console.log('Loaded Biners schedules:', schedule);

    return { entry, locations, schedule, payments };
  }

  function enrichBinersDetail(entry = {}, detail = {}) {
    const locations = normalizeList(detail.locations);
    const payments = normalizeList(detail.payments).filter(payment => relatedToEntry(payment, entry));
    const location = locations[0] || {};
    const paidAmount = payments.reduce((sum, payment) => sum + num(payment.amount ?? payment.payment_amount ?? payment.paid_amount), 0);
    const grossPayable = num(entry.gross_payable ?? entry.total_payable ?? entry.total_payable_amount ?? entry.amount ?? entry.scheduled_amount);
    const remainingAmount = Math.max(grossPayable - paidAmount, 0);
    const base = {
      ...entry,
      client_name: pickValue(entry.client_name, entry.client_legal_name, entry.company_name),
      biners_entry_number: detailsEntryNumber(entry),
      location_name: pickValue(entry.location_name, entry.location, location.location_name, location.location),
      location_reference: pickValue(entry.location_reference, entry.location_ref, entry.location_code, location.location_reference, location.location_ref, location.location_code),
      module_name: pickValue(entry.module, entry.module_name, location.module, location.module_name),
      license_type: pickValue(entry.license, entry.license_type, location.license, location.license_type),
      license_length_months: pickValue(entry.license_length_months, entry.license_period_months, entry.license_period, location.license_length_months),
      due_date: pickValue(entry.due_date, entry.schedule_due_date, entry.payment_due_date, entry.schedule_date),
      schedule_no: pickValue(entry.schedule_no, entry.installment_no, entry.installment_number),
      paid_amount: paidAmount || num(entry.paid_amount),
      remaining_payable: paidAmount ? remainingAmount : (entry.remaining_payable ?? entry.remaining_amount ?? remainingAmount),
      gross_payable: grossPayable,
      timing: pickValue(entry.timing, entry.payment_schedule, entry.schedule_timing)
    };
    let schedule = normalizeList(detail.schedule).map(row => rowContext(normalizeBinersScheduleRow(row, base)));
    if (!schedule.length && grossPayable > 0) {
      const status = remainingAmount <= 0 ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'unpaid';
      schedule = [{ ...base, schedule_no: base.schedule_no === '—' ? 1 : base.schedule_no, scheduled_amount: grossPayable, paid_amount: paidAmount, remaining_amount: remainingAmount, payment_status: status, status }];
    }
    const normalizedPayments = payments.map(payment => rowContext({ ...base, ...payment, payment_amount: payment.payment_amount ?? payment.amount ?? payment.paid_amount }));
    return { entry: base, locations, schedule, payments: normalizedPayments };
  }

  function openDrawer(row, type = 'entry', remote = {}) {
    const drawer = $('binersDetailsDrawer'), content = $('binersDetailsContent');
    if (!drawer || !content) return;
    const initial = rowContext(row || {}), local = detailRowsFor(initial), detail = normalizeDetail(remote);
    const enriched = type === 'entry' ? enrichBinersDetail({ ...local.entry, ...initial }, detail) : null;
    const r = enriched?.entry || initial;
    let schedules = dedupeScheduleRows(enriched?.schedule || detail.scheduled_payments || detail.schedule || detail.schedules || detail.rows || local.schedules);
    const payments = enriched?.payments || detail.payment_history || detail.payments || local.payments;
    const entries = detail.entries || (local.entry?.id ? [local.entry] : []);
    const locations = enriched?.locations || detail.locations || detail.related_locations || [];
    const aggregate = type === 'month' ? aggregateRows(schedules, r.currency) : null;
    state.drawer = { row: r, type, remote };

    const stats = type === 'month'
      ? [['Gross Payable', aggregate.gross_payable], ['Paid Amount', aggregate.paid_amount], ['Remaining', aggregate.remaining_payable], ['Overdue', aggregate.overdue_amount], ['Clients', aggregate.clients], ['Entries', aggregate.entries], ['Locations', aggregate.locations], ['Scheduled Rows', aggregate.scheduled_rows]]
      : [['Client', clientLabel(r)], ['Entry #', r.biners_entry_number || '—'], ['Location', locationLabel(r)], ['Module', moduleLabel(r)], ['Gross Payable', r.gross_payable ?? r.total_payable_amount ?? r.scheduled_amount], ['Paid Amount', r.paid_amount], ['Remaining', r.remaining_payable ?? r.remaining_amount ?? remaining(r)], ['Status', statusFor(r)]].filter(x => x[1] !== undefined && x[1] !== null);

    const detailsTitle = type === 'month' ? 'Monthly forecast details' : 'Client & entry details';
    const detailsHtml = type === 'month'
      ? `<dl class="biners-detail-list"><div><dt>Month</dt><dd>${esc(monthLabel(r.forecast_month || r.month || r.due_date))}</dd></div><div><dt>Currency</dt><dd>${esc(r.currency || 'USD')}</dd></div><div><dt>Clients</dt><dd>${esc(aggregate.clients)}</dd></div><div><dt>Entries</dt><dd>${esc(aggregate.entries)}</dd></div><div><dt>Locations</dt><dd>${esc(aggregate.locations)}</dd></div><div><dt>Scheduled Rows</dt><dd>${esc(aggregate.scheduled_rows)}</dd></div></dl>`
      : `<dl class="biners-detail-list"><div><dt>Client</dt><dd>${esc(clientLabel(r))}</dd></div><div><dt>Entry #</dt><dd>${esc(r.biners_entry_number || '—')}</dd></div><div><dt>Location</dt><dd>${esc(locationLabel(r))}</dd></div><div><dt>Location Reference</dt><dd>${esc(r.location_reference || '—')}</dd></div><div><dt>Module</dt><dd>${esc(moduleLabel(r))}</dd></div><div><dt>License</dt><dd>${esc(licenseLabel(r))}</dd></div><div><dt>Schedule / Due</dt><dd>#${esc(r.schedule_no || '—')} · ${date(r.due_date)}</dd></div><div><dt>Status</dt><dd>${badge(statusFor(r))}</dd></div><div><dt>Timing</dt><dd>${esc(r.timing && r.timing !== '—' ? r.timing : timingLabel(r))}</dd></div><div><dt>Created date</dt><dd>${date(r.created_at || r.created_date)}</dd></div><div><dt>Updated date</dt><dd>${date(r.updated_at || r.updated_date)}</dd></div>${pickValue(r.notes, r.description, r.internal_notes) !== '—' ? `<div><dt>Notes</dt><dd>${esc(pickValue(r.notes, r.description, r.internal_notes))}</dd></div>` : ''}</dl>${paymentButton(r) ? `<div class="biners-drawer-actions">${paymentButton(r)}</div>` : ''}`;

    content.innerHTML = `<div class="biners-drawer-summary">${stats.map(([a, b]) => `<article><span>${esc(a)}</span><strong>${formatDrawerValue(a, b, r.currency)}</strong></article>`).join('')}</div><section class="biners-drawer-section"><h3>${esc(detailsTitle)}</h3>${detailsHtml}</section>${miniTable('Scheduled payments', schedules, [['#', x => x.schedule_no], ['Client', x => clientLabel(x)], ['Entry #', x => x.biners_entry_number], ['Location', x => locationLabel(x)], ['Location Reference', x => x.location_reference || '—'], ['Module', x => moduleLabel(x)], ['License', x => licenseLabel(x)], ['Due date', x => date(x.due_date)], ['Scheduled amount', x => money(x.scheduled_amount, x.currency || r.currency)], ['Paid amount', x => money(x.paid_amount, x.currency || r.currency)], ['Remaining amount', x => money(remaining(x), x.currency || r.currency)], ['Status', x => badge(x.forecast_status || x.payment_status || statusFor(x)), 'html'], ['Notes', x => x.notes || x.description]])}${miniTable('Payment history', payments, [['Payment date', x => date(x.payment_date || x.created_at)], ['Amount', x => money(x.payment_amount ?? x.amount ?? x.paid_amount, x.currency || r.currency)], ['Method', x => x.payment_method || x.method], ['Reference', x => x.payment_reference || x.reference], ['Notes', x => x.notes], ['Created by / recorded by', x => x.created_by_email || x.created_by || x.recorded_by_email || x.recorded_by]])}${locations.length ? miniTable('Related clients / locations', locations, [['Client', x => x.client_name], ['Location', x => x.location_name || x.location], ['Module', x => x.module || x.module_name]]) : ''}${entries.length > 1 ? miniTable('Related entries', entries, [['Entry #', x => x.biners_entry_number], ['Client', x => x.client_name], ['Module', x => x.module || x.module_name]]) : ''}`;
    drawer.hidden = false;
  }

  async function loadDrawer(row, type) {
    let selected = row || {};
    if (type === 'entry') setState('Loading Biners payable details…');
    const sid = scheduleId(selected);
    if (sid && ['schedule', 'forecast', 'payment'].includes(type)) {
      const matches = normalizeList(await safeLoad('selected forecast row', (global.Api?.getBinersForecastRows?.({ schedule_id: sid }) || request('list_forecast', { schedule_id: sid })), []));
      selected = matches[0] ? { ...selected, ...matches[0] } : selected;
    }
    const id = entryId(selected);
    const schedules = id
      ? normalizeList(await safeLoad('related forecast rows', (global.Api?.getBinersForecastRows?.({ biners_entry_id: id }) || request('list_forecast', { biners_entry_id: id })), []))
      : [];
    try {
      const details = type === 'entry' ? await loadBinersPayableDetails(selected) : null;
      openDrawer(selected, type, details || (schedules.length ? { scheduled_payments: schedules } : {}));
      if (type === 'entry') setState('Biners payable details loaded.');
    } catch (error) {
      console.error('[Biners] Unable to load payable details', error);
      toast(error?.message || String(error));
      setState(error?.message || String(error), 'error');
      openDrawer(selected, type, schedules.length ? { scheduled_payments: schedules } : {});
    }
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

  const first = (row, keys) => {
    const source = row && typeof row === 'object' ? row : {};
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return '';
  };

  function normalizeClient(row = {}) {
    const legalName = first(row, ['customer_legal_name', 'company_name', 'legal_name', 'legal_company_name']);
    const customerName = first(row, ['customer_name', 'client_name', 'name']) || legalName;
    const clientUuid = [row.id, row.client_uuid, row.clientUuid, row.client_id, row.clientId].map(value => String(value || '').trim()).find(isUuid) || '';
    const companyUuid = [row.company_id, row.companyId, row.company_uuid, row.companyUuid, row.customer_company_id, row.client_company_id].map(value => String(value || '').trim()).find(isUuid) || '';
    const clientReference = first(row, ['client_number', 'clientNumber', 'reference', 'client_reference', 'clientReference', 'account_number', 'client_code', 'customer_number', 'registration_number']) || (!isUuid(row.client_id) ? first(row, ['client_id', 'clientId']) : '');
    return {
      ...row,
      id: clientUuid || companyUuid,
      client_id: clientUuid,
      company_id: companyUuid,
      company_uuid: companyUuid || first(row, ['company_uuid']),
      client_number: clientReference,
      reference: first(row, ['reference']) || clientReference,
      account_number: clientReference,
      customer_name: customerName,
      client_name: first(row, ['client_name']) || customerName,
      legal_name: legalName || customerName,
      country: first(row, ['country', 'client_country']),
      city: first(row, ['city', 'client_city']),
      address: first(row, ['address', 'company_address', 'customer_address', 'billing_address']),
      contact_name: first(row, ['primary_contact_name', 'contact_name', 'customer_contact_name']),
      contact_email: first(row, ['primary_contact_email', 'primary_email', 'contact_email', 'customer_contact_email', 'email']),
      contact_phone: first(row, ['primary_contact_phone', 'primary_phone', 'phone', 'contact_phone', 'customer_contact_phone', 'customer_contact_mobile', 'mobile']),
      currency: first(row, ['currency', 'currency_code'])
    };
  }

  function mergeClient(current, candidate) {
    const merged = { ...current };
    Object.entries(candidate).forEach(([key, value]) => {
      if ((merged[key] === undefined || merged[key] === null || String(merged[key]).trim() === '') && value !== undefined && value !== null && String(value).trim()) merged[key] = value;
    });
    return merged;
  }

  function dedupeClients(rows = []) {
    const clients = [];
    const keyToIndex = new Map();
    normalizeList(rows).map(normalizeClient).filter(client => client.id && (client.legal_name || client.customer_name)).forEach(client => {
      const identifierKeys = [client.company_id, client.company_uuid, client.client_id, client.account_number].filter(Boolean).map(value => `id:${norm(value)}`);
      const nameKey = norm(client.legal_name || client.customer_name).replace(/[^a-z0-9]+/g, ' ').trim();
      const keys = [...identifierKeys, ...(nameKey ? [`name:${nameKey}`] : [])];
      const existingIndex = keys.map(key => keyToIndex.get(key)).find(index => index !== undefined);
      if (existingIndex !== undefined) clients[existingIndex] = mergeClient(clients[existingIndex], client);
      else clients.push(client);
      const index = existingIndex !== undefined ? existingIndex : clients.length - 1;
      keys.forEach(key => keyToIndex.set(key, index));
    });
    return clients.sort((a, b) => (a.legal_name || a.customer_name).localeCompare(b.legal_name || b.customer_name));
  }

  async function loadClients() {
    if (!global.ClientsService?.getDashboardData) throw new Error('Clients module data source is not available.');
    const rows = [];
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 50) {
      const result = await global.ClientsService.getDashboardData({ page, limit: 200, summaryOnly: true, allowClientMutations: false });
      rows.push(...normalizeList(result));
      hasMore = Boolean(result?.hasMore ?? result?.has_more);
      page += 1;
    }
    return dedupeClients(rows);
  }

  const clientDisplayReference = client => client?.client_number || client?.reference || client?.account_number || '';

  const clientOptionLabel = client => {
    const reference = clientDisplayReference(client);
    const name = client.client_name || client.customer_name || client.legal_name || 'Client';
    return reference ? `${reference} - ${name}` : name;
  };

  function populateClients(search = '') {
    const select = $('binersExistingClientId');
    if (!select) return;
    const selected = select.value;
    const query = norm(search);
    const visible = state.clients.filter(client => !query || [client.legal_name, client.customer_name, client.account_number, client.contact_email].concat([client.client_name, clientDisplayReference(client)]).some(value => norm(value).includes(query)) || client.id === selected);
    select.innerHTML = '<option value="">Select existing client...</option>' + visible.map(client => `<option value="${esc(client.id)}" data-client-reference="${esc(clientDisplayReference(client))}">${esc(clientOptionLabel(client))}</option>`).join('');
    if (visible.some(client => client.id === selected)) select.value = selected;
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
    clearEntryErrors();
    state.selectedClient = null;
    populateClients('');
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
    $('binersPaymentEntryNumber').value = rows.length === 1 ? (first.biners_entry_number || '—') : 'Bulk payment';
    $('binersPaymentLocation').value = rows.length === 1 ? locationLabel(first) : 'Multiple';
    $('binersPaymentModule').value = rows.length === 1 ? moduleLabel(first) : 'Multiple';
    $('binersPaymentDueDate').value = rows.length === 1 ? date(first.due_date) : 'Multiple';
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

  function toast(message) {
    global.UI?.toast?.(message);
  }

  function withTimeout(promise, message = 'Save request timed out. Please try again.') {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = global.setTimeout(() => reject(new Error(message)), SAVE_TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => global.clearTimeout(timeoutId));
  }

  function clearEntryErrors() {
    $('binersEntryErrorBanner')?.setAttribute('hidden', '');
    const banner = $('binersEntryErrorBanner');
    if (banner) banner.textContent = '';
    values('#binersEntryForm [aria-invalid="true"]').forEach(input => input.removeAttribute('aria-invalid'));
    values('#binersEntryForm .biners-field-error').forEach(error => error.remove());
  }

  function showFieldError(input, message) {
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    const error = document.createElement('span');
    error.className = 'biners-field-error';
    error.textContent = message;
    input.insertAdjacentElement('afterend', error);
  }

  function validateEntry() {
    clearEntryErrors();
    const existingClientFlow = $('binersEntryType').value === 'existing_client_new_location';
    const rules = [
      [existingClientFlow ? $('binersExistingClientId') : $('binersClientName'), existingClientFlow ? 'Client is required.' : 'Manual client name is required.', value => Boolean(String(value).trim())],
      [$('binersModuleName'), 'Module name is required.', value => Boolean(String(value).trim())],
      [$('binersLicenseLengthMonths'), 'License length months is required.', value => num(value) > 0],
      [$('binersNumberOfLocations'), 'Number of locations is required.', value => num(value) > 0],
      [$('binersCostPerLocation'), 'Cost per location is required.', value => String(value).trim() !== '' && num(value) >= 0]
    ];
    if (existingClientFlow) rules.push(
      [$('binersClientLegalName'), 'Client legal name is required.', value => Boolean(String(value).trim())],
      [$('binersLicenseType'), 'License type is required.', value => Boolean(String(value).trim())],
      [$('binersServiceStartDate'), 'Service start date is required.', value => Boolean(value)],
      [$('binersServiceEndDate'), 'Service end date is required.', value => Boolean(value)],
      [$('binersCurrency'), 'Currency is required.', value => Boolean(String(value).trim())]
    );
    const validationErrors = [];
    rules.forEach(([input, message, valid]) => {
      if (!input || valid(input.value)) return;
      validationErrors.push(message);
      showFieldError(input, message);
    });
    const locationInputs = values('.biners-location-row [data-biners-location-name]');
    if (!locationInputs.some(input => input.value.trim())) {
      const message = 'At least one related location name is required.';
      validationErrors.push(message);
      showFieldError(locationInputs[0], message);
    }
    if (validationErrors.length) {
      const banner = $('binersEntryErrorBanner');
      if (banner) {
        banner.textContent = validationErrors.join(' ');
        banner.hidden = false;
      }
      validationErrors[0] && toast(validationErrors[0]);
      $('binersEntryForm')?.querySelector('[aria-invalid="true"]')?.focus();
    }
    return validationErrors;
  }

  function resolveSelectedClient() {
    const selectedValue = String($('binersExistingClientId')?.value || '').trim();
    if (!selectedValue) return null;
    return state.selectedClient
      || state.clients.find(item => String(item.id) === selectedValue)
      || state.clients.find(item => [item.client_number, item.reference, item.account_number].some(value => String(value || '').trim() === selectedValue))
      || null;
  }

  function buildBinersEntryPayload({ form, selectedClient, totals, requestKey }) {
    const clientId = selectedClient?.id || selectedClient?.value || null;
    if (clientId && !isUuid(clientId)) throw new Error(`Invalid client_id. Expected UUID but received: ${clientId}`);
    return cleanPayload({
      request_key: requestKey,
      client_id: clientId,
      client_reference: selectedClient?.client_number || selectedClient?.reference || selectedClient?.client_reference || selectedClient?.account_number || null,
      client_name: selectedClient?.client_name || selectedClient?.legal_name || selectedClient?.name || selectedClient?.customer_name || form.client_name || null,
      module: form.module || form.module_name || null,
      license: form.license || form.license_type || null,
      gross_payable: toNumber(totals.grossPayable),
      paid_amount: 0,
      due_date: form.due_date || form.payment_due_date || null,
      status: 'upcoming',
      notes: form.notes || null
    });
  }

  function buildBinersLocationPayload({ entry, location, form, selectedClient }) {
    return cleanPayload({
      biners_entry_id: entry.id,
      client_reference: selectedClient?.client_number || selectedClient?.reference || selectedClient?.client_reference || selectedClient?.account_number || null,
      client_name: selectedClient?.client_name || selectedClient?.legal_name || selectedClient?.name || selectedClient?.customer_name || form.client_name || null,
      location_name: location.location_name || location.name || location.label || null,
      location_reference: location.location_reference || location.reference || null,
      module: form.module || form.module_name || null,
      license: form.license || form.license_type || null,
      due_date: location.due_date || form.due_date || null,
      scheduled_amount: toNumber(location.amount || location.scheduled_amount),
      notes: location.notes || null
    });
  }

  function buildBinersSchedulePayload({ entry, schedule, selectedClient, form, index }) {
    const clientId = selectedClient?.id || selectedClient?.value || null;
    if (clientId && !isUuid(clientId)) throw new Error(`Invalid client_id. Expected UUID but received: ${clientId}`);
    const dueDate = schedule.due_date || schedule.payment_date || schedule.schedule_date || schedule.date || null;
    const scheduledAmount = toNumber(schedule.scheduled_amount || schedule.amount || schedule.value);
    return cleanPayload({
      schedule_key: `${entry.id}:schedule:${index}:${dueDate}:${scheduledAmount}`,
      biners_entry_id: entry.id,
      entry_number: entry.entry_number || entry.reference || null,
      client_id: clientId,
      client_reference: selectedClient?.client_number || selectedClient?.reference || selectedClient?.client_reference || null,
      client_name: selectedClient?.client_name || selectedClient?.legal_name || selectedClient?.name || form.client_name || null,
      location_name: schedule.location_name || form.location_name || 'All Locations',
      location_reference: schedule.location_reference || form.location_reference || null,
      module: form.module || null,
      license: form.license || null,
      due_date: dueDate,
      scheduled_amount: scheduledAmount,
      paid_amount: 0,
      status: 'upcoming',
      notes: schedule.notes || null
    });
  }

  function buildEntryPayload() {
    const selectedClient = resolveSelectedClient();
    const selectedValue = String($('binersExistingClientId')?.value || '').trim();
    if (selectedValue && !isUuid(selectedValue)) throw new Error(`Invalid client UUID: ${selectedValue}`);

    const moduleName = $('binersModuleName').value.trim();
    const licenseType = $('binersLicenseType').value.trim();
    const locationRows = values('.biners-location-row').map((row, index) => ({
      location_name: row.querySelector('[data-biners-location-name]').value.trim(),
      location_reference: row.querySelector('[data-biners-location-code]').value.trim(),
      due_date: $('binersServiceStartDate').value || $('binersServiceEndDate').value || today(),
      notes: '',
      row_index: index + 1
    })).filter(location => location.location_name || location.location_reference);

    const locationCount = Math.max(1, locationRows.length || toNumber($('binersNumberOfLocations').value));
    const annualPerLocation = toNumber($('binersCostPerLocation').value) * toNumber($('binersLicenseLengthMonths').value) / 12;
    const totalAmount = toNumber($('binersTotalPayableAmount').value) || annualPerLocation * locationCount;
    const amountMode = 'per_location';
    const amountPerLocation = amountMode === 'total' ? totalAmount / locationCount : annualPerLocation || totalAmount;
    const form = {
      client_name: $('binersClientName').value.trim() || selectedClient?.client_name || selectedClient?.customer_name || selectedClient?.legal_name || '',
      module: moduleName,
      license: licenseType,
      due_date: $('binersServiceStartDate').value || $('binersServiceEndDate').value || today(),
      amount_mode: amountMode,
      amount_per_location: amountPerLocation,
      total_amount: totalAmount,
      notes: $('binersInternalNotes').value || $('binersDescription').value || null
    };

    const entry = buildBinersEntryPayload({ form, selectedClient, totals: { grossPayable: totalAmount }, requestKey: makeRequestKey() });
    const locations = locationRows.map(location => buildBinersLocationPayload({ entry: { id: null }, location: { ...location, amount: amountPerLocation }, form, selectedClient }));
    const scheduledPayments = values('.biners-schedule-row').map(row => ({
      schedule_no: row.querySelector('[data-biners-schedule-no]')?.value,
      due_date: row.querySelector('[data-biners-schedule-due]')?.value,
      amount: row.querySelector('[data-biners-schedule-amount]')?.value,
      status: row.querySelector('[data-biners-schedule-status]')?.value || 'upcoming'
    }));
    const manualScheduleRows = scheduledPayments.filter(row => (
      row.due_date || row.payment_date || row.schedule_date || row.date || toNumber(row.amount || row.scheduled_amount) > 0
    ));
    const scheduleRowsToSave = manualScheduleRows.length > 0
      ? manualScheduleRows
      : [{ due_date: form.start_service_date || form.service_start_date || form.due_date, amount: totalAmount }];
    const schedules = scheduleRowsToSave.map((schedule, index) => buildBinersSchedulePayload({
      entry: { id: '__pending__', entry_number: null },
      schedule,
      selectedClient,
      form,
      index
    }));
    const scheduleTotal = schedules.reduce((sum, row) => sum + toNumber(row.scheduled_amount), 0);
    if (Math.abs(scheduleTotal - toNumber(totalAmount)) > 0.01) throw new Error(`Scheduled payments total (${scheduleTotal}) must equal gross payable (${totalAmount}).`);
    return { entry, locations, schedules };
  }

  function entrySaveErrorMessage(error) {
    const message = String(error?.message || error || 'Unknown error');
    return /forbidden|permission|row-level security|rls|42501/i.test(message)
      ? 'Access denied. You do not have permission to create Biners entries.'
      : message.startsWith('Unable to create Biners entry') ? message : `Unable to create Biners entry: ${message}`;
  }

  function showEntrySaveError(error) {
    if (isDevelopment()) console.error('Biners Entry Save Failed', error);
    const message = entrySaveErrorMessage(error);
    const banner = $('binersEntryErrorBanner');
    if (banner) { banner.textContent = message; banner.hidden = false; }
    setState(message, 'error');
    toast(message);
  }

  async function saveEntry(e) {
    e.preventDefault();
    if (state.savingEntry) return;

    const btn = $('binersSaveEntryBtn');
    state.savingEntry = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    if (isDevelopment()) console.log('Biners Save Clicked', { formState: new FormData($('binersEntryForm')) });

    try {
      updateServiceEnd();
      updateTotal();
      const validationErrors = validateEntry();
      if (validationErrors.length) return;

      const payload = buildEntryPayload();
      if (!payload.locations.length) throw new Error('At least one related location name is required.');
      if (isDevelopment()) console.log('Biners Save Payload', payload);

      const result = await withTimeout(request('create', payload));
      if (!result) throw new Error('No result returned while creating the Biners entry.');
      if (isDevelopment()) console.log('Biners Save Success', result);

      state.entries = [result, ...state.entries.filter(entry => String(entry.id) !== String(result.id))];
      render();
      try {
        await withTimeout(refresh(), 'Biners entry was created, but refreshing the list timed out. Please refresh the page.');
        if (!state.entries.some(entry => String(entry.id) === String(result.id))) state.entries.unshift(result);
        render();
      } catch (refreshError) {
        if (isDevelopment()) console.error('Unable to refresh Biners entries after save', refreshError);
        const refreshMessage = refreshError?.message || 'Biners entry was created, but the list could not refresh. Please refresh the page.';
        setState(refreshMessage, 'error');
        toast(refreshMessage);
      }
      closeEntry();
      toast('Biners entry created successfully.');
    } catch (error) {
      if (isDevelopment()) console.error('Biners Save Error', error);
      showEntrySaveError(error);
    } finally {
      state.savingEntry = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
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

  function updateServiceEnd() {
    const start = $('binersServiceStartDate')?.value;
    const months = num($('binersLicenseLengthMonths')?.value);
    if (!start || months <= 0) return;
    const startDate = new Date(`${start}T00:00:00Z`);
    const end = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months + 1, 0));
    end.setUTCDate(Math.min(startDate.getUTCDate(), end.getUTCDate()));
    end.setUTCDate(end.getUTCDate() - 1);
    $('binersServiceEndDate').value = end.toISOString().slice(0, 10);
  }

  function updateTotal() {
    const el = $('binersTotalPayableAmount');
    const explicitLocations = num($('binersNumberOfLocations')?.value);
    const locationRows = values('.biners-location-row [data-biners-location-name]').filter(input => String(input.value || '').trim()).length;
    const locationCount = Math.max(explicitLocations, locationRows || 0, 1);
    const total = locationCount * num($('binersCostPerLocation')?.value) * num($('binersLicenseLengthMonths')?.value) / 12;
    if (el) el.value = total.toFixed(2);
  }

  function normalizeList(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.rows)) return value.rows;
    return value ? [value] : [];
  }

  function ensureInitialized() {
    if (state.initialized) return;
    state.initialized = true;
    bind();
  }



  function normalizeBinersScheduleRow(row = {}, entry = {}) {
    const scheduled = num(row.scheduled_amount);
    const paid = num(row.paid_amount);
    return {
      ...entry,
      ...row,
      id: row.id,
      schedule_id: row.id || row.schedule_id || row.biners_schedule_id,
      biners_entry_id: row.biners_entry_id || entry.id,
      entry_number: row.entry_number || entry.entry_number,
      biners_entry_number: row.entry_number || row.biners_entry_number || detailsEntryNumber(entry),
      schedule_no: row.schedule_no,
      due_date: row.due_date,
      scheduled_amount: scheduled,
      paid_amount: paid,
      remaining_amount: Math.max(scheduled - paid, 0),
      status: row.status,
      payment_status: row.payment_status || row.status,
      forecast_status: row.forecast_status || row.status,
      notes: row.notes,
      currency: row.currency || entry.currency || 'USD'
    };
  }

  function fallbackRowsFromEntries(entries = []) {
    return normalizeList(entries).map((entry, idx) => {
      const scheduled = num(entry.scheduled_amount ?? entry.total_payable_amount ?? entry.gross_payable ?? entry.total_payable ?? entry.amount);
      const paid = num(entry.paid_amount);
      const due = entry.due_date || entry.payment_due_date || entry.start_service_date || entry.service_start_date || entry.service_end_date || entry.created_at || today();
      const remainingAmount = Math.max(0, scheduled - paid);
      const status = remainingAmount <= 0 ? 'paid' : paid > 0 ? 'partially_paid' : (String(due).slice(0, 10) < today() ? 'overdue' : 'upcoming');
      return {
        id: `entry-fallback-${entry.id || idx}`,
        schedule_id: null,
        biners_entry_id: entry.id,
        entry_number: detailsEntryNumber(entry),
        biners_entry_number: detailsEntryNumber(entry),
        client_name: entry.client_name || entry.client_legal_name || entry.company_name,
        client_reference: entry.client_reference,
        location_name: entry.location_name || 'Entry level / All locations',
        location_reference: entry.location_reference || '',
        module: entry.module || entry.module_name,
        license: entry.license || entry.license_type,
        license_length_months: entry.license_length_months,
        due_date: String(due).slice(0, 10),
        scheduled_amount: scheduled,
        paid_amount: paid,
        remaining_amount: remainingAmount,
        payment_status: status,
        forecast_status: status,
        status,
        currency: entry.currency || 'USD',
        schedule_no: 1,
        notes: entry.description || entry.internal_notes || ''
      };
    }).filter(row => row.scheduled_amount > 0);
  }

  async function safeLoad(label, promise, fallback) {
    try {
      return await promise;
    } catch (error) {
      console.warn(`[Biners] Unable to load ${label}`, error);
      toast(error?.message || `Unable to load ${label}`);
      return fallback;
    }
  }

  async function refresh() {
    ensureInitialized();
    setState('Loading Biners payable data…');
    try {
      let schedulesLoaded = true;
      let forecastLoaded = true;
      const [entries, schedules, forecast, payments, summary, monthly, clients] = await Promise.all([
        safeLoad('entries', request('list'), state.entries),
        (global.Api?.getBinersScheduleRows?.() || request('list_schedules')).catch(error => { schedulesLoaded = false; console.warn('[Biners] Unable to load scheduled payments', error); toast(error?.message || 'Unable to load scheduled payments'); return state.schedules; }),
        (global.Api?.getBinersForecastRows?.() || request('list_forecast')).catch(error => { forecastLoaded = false; console.warn('[Biners] Unable to load forecast rows', error); toast(error?.message || 'Unable to load forecast rows'); return state.forecast; }),
        safeLoad('payment history', request('list_payments'), state.payments),
        safeLoad('summary', request('summary'), state.summary),
        safeLoad('monthly forecast', (global.Api?.getBinersMonthlyForecast?.() || request('monthly_forecast')), state.monthly),
        safeLoad('clients', loadClients(), state.clients)
      ]);
      const normalizedEntries = normalizeList(entries);
      const fallbackForecast = fallbackRowsFromEntries(normalizedEntries);
      const normalizedSchedules = dedupeScheduleRows(schedules).map(row => normalizeBinersScheduleRow(row, getEntry(row)));
      const normalizedForecast = dedupeScheduleRows(forecast).map(row => normalizeBinersScheduleRow(row, getEntry(row)));
      Object.assign(state, {
        entries: normalizedEntries,
        schedules: normalizedSchedules.length ? normalizedSchedules : (schedulesLoaded ? fallbackForecast : []),
        forecast: normalizedForecast.length ? normalizedForecast : (normalizedSchedules.length ? normalizedSchedules : (forecastLoaded && schedulesLoaded ? fallbackForecast : [])),
        payments: normalizeList(payments),
        summary: summary && Array.isArray(summary) ? summary[0] : summary,
        monthly: normalizeList(monthly),
        clients: dedupeClients(clients)
      });
      populateClients($('binersExistingClientSearch')?.value || '');
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
    $('binersExistingClientSearch')?.addEventListener('input', event => populateClients(event.target.value));
    $('binersExistingClientId')?.addEventListener('change', () => {
      const client = state.clients.find(item => String(item.id) === String($('binersExistingClientId').value));
      state.selectedClient = client || null;
      if (!client) return;
      $('binersClientName').value = client.customer_name || client.legal_name || '';
      $('binersClientLegalName').value = client.legal_name || client.customer_name || '';
      $('binersClientCountry').value = client.country || '';
      $('binersClientCity').value = client.city || '';
      $('binersClientAddress').value = client.address || '';
      $('binersClientContactName').value = client.contact_name || '';
      $('binersClientContactEmail').value = client.contact_email || '';
      $('binersClientContactPhone').value = client.contact_phone || '';
      if (client.currency) $('binersCurrency').value = client.currency;
    });
    document.querySelectorAll('[data-biners-tab]').forEach(x => x.addEventListener('click', () => setActiveTab(x.dataset.binersTab)));
    document.querySelectorAll('[data-biners-close-entry]').forEach(x => x.addEventListener('click', closeEntry));
    document.querySelectorAll('[data-biners-close-payment]').forEach(x => x.addEventListener('click', closePayment));
    document.querySelectorAll('[data-biners-close-drawer]').forEach(x => x.addEventListener('click', closeDrawer));
    $('binersEntryForm')?.addEventListener('submit', e => saveEntry(e).catch(showEntrySaveError));
    $('binersRecordPaymentForm')?.addEventListener('submit', e => savePayment(e).catch(err => setState(err.message || String(err), 'error')));
    $('binersAddScheduleRowBtn')?.addEventListener('click', () => addScheduleRow());
    $('binersAddLocationRowBtn')?.addEventListener('click', () => { addLocationRow(); updateTotal(); });
    ['binersNumberOfLocations', 'binersCostPerLocation', 'binersLicenseLengthMonths'].forEach(id => $(id)?.addEventListener('input', updateTotal));
    ['binersServiceStartDate', 'binersLicenseLengthMonths'].forEach(id => $(id)?.addEventListener('input', updateServiceEnd));
    ['binersSearchInput', 'binersStatusFilter', 'binersPaymentStatusFilter', 'binersCurrencyFilter'].forEach(id => $(id)?.addEventListener(id === 'binersSearchInput' ? 'input' : 'change', () => {
      state.filters = { search: $('binersSearchInput').value, status: $('binersStatusFilter').value, paymentStatus: $('binersPaymentStatusFilter').value, currency: $('binersCurrencyFilter').value };
      state.pages = {};
      render();
    }));
    document.addEventListener('input', e => {
      if (e.target?.matches?.('[data-biners-location-name],[data-biners-location-code]')) updateTotal();
    });
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
      if (remove) { remove.parentElement.remove(); updateTotal(); return; }
      const bulk = e.target.closest('[data-biners-bulk-payment]');
      if (bulk) { const ids = selectedScheduleIds(); if (!ids.length) { setState('Select at least one scheduled payment first.', 'error'); return; } openPaymentModal(ids); return; }
      const pay = e.target.closest('[data-biners-record-payment]');
      if (pay) { openPaymentModal(pay.dataset.binersRecordPayment); return; }
      const view = e.target.closest('[data-biners-forecast-view]');
      if (view) { state.forecastView = view.dataset.binersForecastView; render(); return; }
      const month = e.target.closest('[data-biners-open-month]');
      if (month) { openMonthly(month.dataset.binersOpenMonth, month.dataset.binersCurrency); return; }
      const entry = e.target.closest('[data-biners-open-entry]');
      if (entry) { loadDrawer(state.entries.find(x => String(x.id) === String(entry.dataset.binersOpenEntry)), 'entry'); return; }
      const schedule = e.target.closest('[data-biners-open-schedule]');
      if (schedule) { loadDrawer(state.schedules.find(x => String(scheduleId(x)) === String(schedule.dataset.binersOpenSchedule)), 'schedule'); return; }
      const forecast = e.target.closest('[data-biners-open-forecast]');
      if (forecast) { loadDrawer(state.forecast.find(x => String(scheduleId(x)) === String(forecast.dataset.binersOpenForecast)), 'forecast'); return; }
      const payment = e.target.closest('[data-biners-open-payment]');
      if (payment) { loadDrawer(state.payments.find(x => String(x.id) === String(payment.dataset.binersOpenPayment)), 'payment'); return; }
      const page = e.target.closest('[data-biners-page]');
      if (page) { const key = pageKey(); state.pages[key] = Math.max(1, (state.pages[key] || 1) + (page.dataset.binersPage === 'next' ? 1 : -1)); render(); }
    });
  }

  function init() { ensureInitialized(); }
  global.Biners = { init, refresh, setActiveTab, openCreate: openEntryModal };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if ($('binersView')) init();
    }, { once: true });
  } else if ($('binersView')) {
    setTimeout(init, 0);
  }
})(window);
