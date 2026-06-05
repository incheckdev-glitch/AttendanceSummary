(function initBinersModule(global) {
  'use strict';

  const PAGE_SIZE = 10;
  const state = {
    initialized: false,
    activeTab: 'overview',
    entries: [],
    schedules: [],
    forecast: [],
    payments: [],
    companies: [],
    summary: null,
    filters: { search: '', status: 'all', paymentStatus: 'all', currency: 'all' },
    pagination: {
      overview: { page: 1, total: 0 },
      entries: { page: 1, total: 0 },
      scheduled_payments: { page: 1, total: 0 },
      forecast: { page: 1, total: 0 },
      payments_history: { page: 1, total: 0 }
    }
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  const norm = value => String(value ?? '').trim().toLowerCase();
  const num = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const money = (value, currency = 'USD') => `${String(currency || 'USD').toUpperCase()} ${num(value).toLocaleString(undefined, { minimumFractionDigits: num(value) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
  const date = value => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return esc(value);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  };
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const auth = () => (global.Session?.authContext?.() || {});
  const can = (action = 'view') => Boolean(global.Permissions?.canPerformAction?.('biners', action) || global.Permissions?.canPerformAction?.('biners', 'manage') || global.Permissions?.hasAdminOverride?.());

  async function request(action, payload = {}) {
    if (global.Api?.requestWithSession) return global.Api.requestWithSession('biners', action, payload);
    if (global.SupabaseData?.dispatch) return global.SupabaseData.dispatch({ resource: 'biners', action, ...payload });
    throw new Error('Biners data API is not available.');
  }

  function setState(message = '', cls = 'muted') {
    const el = $('binersState');
    if (!el) return;
    el.className = `${cls} pf-state`;
    el.textContent = message || '';
  }

  function setActiveTab(tab) {
    state.activeTab = tab || 'overview';
    document.querySelectorAll('[data-biners-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.binersTab === state.activeTab);
    });
    renderActiveTab();
  }

  function getClientName(row = {}) {
    return row.client_name || row.client_legal_name || row.company_name || '—';
  }

  function calculateSummary() {
    const forecastRows = state.forecast || [];
    const entries = state.entries || [];
    const remaining = forecastRows.reduce((sum, row) => sum + num(row.remaining_amount), 0);
    const gross = forecastRows.reduce((sum, row) => sum + num(row.scheduled_amount), 0) || entries.reduce((sum, row) => sum + num(row.total_payable_amount), 0);
    const paid = forecastRows.reduce((sum, row) => sum + num(row.paid_amount), 0);
    const overdue = forecastRows.filter(row => norm(row.forecast_status) === 'overdue').reduce((sum, row) => sum + num(row.remaining_amount), 0);
    const dueWeek = forecastRows.filter(row => daysUntil(row.due_date) >= 0 && daysUntil(row.due_date) <= 7 && num(row.remaining_amount) > 0).reduce((sum, row) => sum + num(row.remaining_amount), 0);
    const dueMonth = forecastRows.filter(row => {
      const d = new Date(row.due_date);
      const now = new Date();
      return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && num(row.remaining_amount) > 0;
    }).reduce((sum, row) => sum + num(row.remaining_amount), 0);
    const next30 = forecastRows.filter(row => daysUntil(row.due_date) >= 0 && daysUntil(row.due_date) <= 30 && num(row.remaining_amount) > 0).reduce((sum, row) => sum + num(row.remaining_amount), 0);
    const next90 = forecastRows.filter(row => daysUntil(row.due_date) >= 0 && daysUntil(row.due_date) <= 90 && num(row.remaining_amount) > 0).reduce((sum, row) => sum + num(row.remaining_amount), 0);
    return {
      total_entries: entries.length,
      active_entries: entries.filter(row => norm(row.entry_status) === 'active').length,
      total_locations: entries.reduce((sum, row) => sum + Math.max(0, Number(row.number_of_locations || 0)), 0),
      scheduled_rows: forecastRows.length,
      gross_payable: gross,
      paid_amount: paid,
      remaining_payable: remaining,
      overdue_amount: overdue,
      due_this_week: dueWeek,
      due_this_month: dueMonth,
      next_30_days: next30,
      next_90_days: next90,
      currency: forecastRows[0]?.currency || entries[0]?.currency || 'USD'
    };
  }

  function daysUntil(value) {
    if (!value) return 999999;
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 999999;
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((d.getTime() - todayDate.getTime()) / 86400000);
  }

  function renderSummary() {
    const el = $('binersSummary');
    if (!el) return;
    const s = state.summary || calculateSummary();
    const currency = s.currency || 'USD';
    const cards = [
      ['Total Entries', s.total_entries ?? state.entries.length, 'Biners records'],
      ['Active Entries', s.active_entries ?? state.entries.filter(r => norm(r.entry_status) === 'active').length, 'Currently active'],
      ['Total Locations', s.total_locations ?? state.entries.reduce((sum, r) => sum + num(r.number_of_locations), 0), 'Tracked locations'],
      ['Gross Payable', money(s.gross_payable, currency), 'Before payments'],
      ['Paid Amount', money(s.paid_amount, currency), 'Paid to Biners'],
      ['Remaining Payable', money(s.remaining_payable, currency), 'Outstanding payable'],
      ['Overdue Amount', money(s.overdue_amount, currency), 'Needs follow-up'],
      ['Due This Week', money(s.due_this_week, currency), 'Next 7 days'],
      ['Due This Month', money(s.due_this_month, currency), 'Current month'],
      ['Next 30 Days', money(s.next_30_days, currency), 'Near-term payable'],
      ['Next 90 Days', money(s.next_90_days, currency), 'Quarter forecast']
    ];
    el.innerHTML = cards.map(([label, value, hint]) => `
      <article class="payment-forecast-summary-card biners-summary-card">
        <div class="summary-label">${esc(label)}</div>
        <div class="summary-value">${esc(value)}</div>
        <div class="summary-subtitle">${esc(hint)}</div>
      </article>
    `).join('');
  }

  function currentRows() {
    const tab = state.activeTab;
    let rows = tab === 'entries' || tab === 'overview'
      ? state.entries
      : tab === 'scheduled_payments'
        ? state.schedules
        : tab === 'payments_history'
          ? state.payments
          : state.forecast;
    rows = Array.isArray(rows) ? [...rows] : [];
    const f = state.filters;
    const search = norm(f.search);
    if (search) {
      rows = rows.filter(row => norm(JSON.stringify(row)).includes(search));
    }
    if (f.status !== 'all') rows = rows.filter(row => norm(row.entry_status || row.status || row.forecast_status) === f.status);
    if (f.paymentStatus !== 'all') rows = rows.filter(row => norm(row.payment_status || row.entry_payment_status) === f.paymentStatus);
    if (f.currency !== 'all') rows = rows.filter(row => norm(row.currency) === f.currency);
    return rows;
  }

  function paginate(rows) {
    const pageState = state.pagination[state.activeTab] || { page: 1, total: 0 };
    const total = rows.length;
    pageState.total = total;
    const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pageState.page > maxPage) pageState.page = 1;
    const start = (pageState.page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }

  function renderPagination() {
    const el = $('binersPagination');
    if (!el) return;
    const pageState = state.pagination[state.activeTab] || { page: 1, total: 0 };
    const total = pageState.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = total ? ((pageState.page - 1) * PAGE_SIZE) + 1 : 0;
    const end = Math.min(pageState.page * PAGE_SIZE, total);
    el.innerHTML = `
      <div class="pf-pagination">
        <span>Showing ${start}–${end} of ${total}</span>
        <span>10 rows per page</span>
        <button class="btn ghost sm" type="button" data-biners-page="prev" ${pageState.page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${pageState.page} of ${totalPages}</span>
        <button class="btn ghost sm" type="button" data-biners-page="next" ${pageState.page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>`;
  }

  function badge(value) {
    const label = String(value || 'scheduled').replace(/_/g, ' ');
    return `<span class="pf-status-badge pf-status-${esc(norm(value).replace(/_/g, '-'))}">${esc(label)}</span>`;
  }

  function renderActiveTab() {
    renderSummary();
    const body = $('binersTabBody');
    if (!body) return;
    const rows = currentRows();
    const visible = paginate(rows);
    if (state.activeTab === 'overview') renderOverview(body, visible, rows.length);
    else if (state.activeTab === 'entries') renderEntries(body, visible);
    else if (state.activeTab === 'scheduled_payments') renderSchedules(body, visible);
    else if (state.activeTab === 'forecast') renderForecast(body, visible);
    else renderPayments(body, visible);
    renderPagination();
    setState(`${rows.length} ${state.activeTab.replace(/_/g, ' ')} row(s) loaded.`);
  }

  function table(headers, rowsHtml, emptyText = 'No data found.') {
    return `<div class="table-wrap biners-table-wrap"><table class="biners-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rowsHtml || `<tr><td colspan="${headers.length}" class="muted">${esc(emptyText)}</td></tr>`}</tbody></table></div>`;
  }

  function renderOverview(body, visible, total) {
    body.innerHTML = `
      <div class="card biners-overview-card">
        <strong>Biners payable overview</strong>
        <p class="muted">Showing ${total} entry row(s). Use the sub-tabs for scheduled payments, forecast, and payment history.</p>
      </div>
      ${renderEntriesTable(visible)}
    `;
  }

  function renderEntries(body, rows) { body.innerHTML = renderEntriesTable(rows); }
  function renderEntriesTable(rows) {
    const html = rows.map(row => `
      <tr data-biners-entry-id="${esc(row.id)}">
        <td><strong>${esc(row.biners_entry_number || 'Auto')}</strong></td>
        <td>${esc(String(row.entry_type || '').replace(/_/g, ' '))}</td>
        <td>${esc(getClientName(row))}</td>
        <td>${esc(row.module_name || '—')}</td>
        <td>${esc(row.number_of_locations || 0)}</td>
        <td>${esc(row.license_length_months || '—')} mo</td>
        <td>${date(row.service_start_date)}</td>
        <td>${date(row.service_end_date)}</td>
        <td>${money(row.total_payable_amount, row.currency)}</td>
        <td>${badge(row.payment_status)}</td>
        <td>${badge(row.entry_status)}</td>
        <td><button class="btn ghost xs" type="button" data-biners-view-entry="${esc(row.id)}">View</button></td>
      </tr>`).join('');
    return table(['Entry #','Type','Client','Module','Locations','License','Start','End','Gross Payable','Payment','Entry Status','Actions'], html, 'No Biners entries found.');
  }

  function renderSchedules(body, rows) {
    const html = rows.map(row => `
      <tr>
        <td>${esc(getEntry(row.biners_entry_id)?.client_name || row.client_name || '—')}</td>
        <td>${esc(getEntry(row.biners_entry_id)?.biners_entry_number || row.biners_entry_id || '—')}</td>
        <td>${esc(row.schedule_no || '—')}</td>
        <td>${date(row.due_date)}</td>
        <td>${money(row.scheduled_amount, row.currency)}</td>
        <td>${money(row.paid_amount, row.currency)}</td>
        <td>${money(row.remaining_amount, row.currency)}</td>
        <td>${badge(row.payment_status)}</td>
        <td><button class="btn ghost xs" type="button" data-biners-record-payment="${esc(row.id)}">Record Payment</button></td>
      </tr>`).join('');
    body.innerHTML = table(['Client','Entry #','Schedule #','Due Date','Scheduled','Paid','Remaining','Status','Actions'], html, 'No scheduled payments found.');
  }

  function renderForecast(body, rows) {
    const html = rows.map(row => `
      <tr>
        <td>${esc(row.client_name || '—')}</td>
        <td>${esc(row.biners_entry_number || '—')}</td>
        <td>${esc(row.location_name || '—')}</td>
        <td>${esc(row.module_name || '—')}</td>
        <td>${esc(row.license_type || '—')}</td>
        <td>${esc(row.schedule_no || '—')}</td>
        <td>${date(row.due_date)}</td>
        <td>${money(row.scheduled_amount, row.currency)}</td>
        <td>${money(row.paid_amount, row.currency)}</td>
        <td>${money(row.remaining_amount, row.currency)}</td>
        <td>${badge(row.forecast_status)}</td>
        <td>${row.forecast_status === 'overdue' ? `${esc(row.days_overdue || 0)} days overdue` : `${esc(row.days_until_due || 0)} days`}</td>
      </tr>`).join('');
    body.innerHTML = table(['Client','Entry #','Location','Module','License','Schedule #','Due Date','Scheduled','Paid','Remaining','Forecast','Days'], html, 'No forecast rows found.');
  }

  function renderPayments(body, rows) {
    const html = rows.map(row => `
      <tr>
        <td><strong>${esc(row.payment_number || 'Auto')}</strong></td>
        <td>${date(row.payment_date)}</td>
        <td>${esc(getEntry(row.biners_entry_id)?.client_name || '—')}</td>
        <td>${esc(getEntry(row.biners_entry_id)?.biners_entry_number || row.biners_entry_id || '—')}</td>
        <td>${money(row.payment_amount, row.currency)}</td>
        <td>${esc(row.payment_method || '—')}</td>
        <td>${esc(row.payment_reference || '—')}</td>
        <td>${esc(row.notes || '—')}</td>
      </tr>`).join('');
    body.innerHTML = table(['Payment #','Date','Client','Entry #','Amount','Method','Reference','Notes'], html, 'No Biners payment history found.');
  }

  function getEntry(id) { return state.entries.find(row => String(row.id) === String(id)) || null; }

  async function refresh() {
    if (!can('view')) {
      setState('You do not have permission to view Biners.', 'error');
      return;
    }
    init();
    setState('Loading Biners data...');
    try {
      const [entries, schedules, forecast, payments, summary] = await Promise.all([
        request('list', { limit: 2000 }).catch(() => []),
        request('list_schedules', { limit: 2000 }).catch(() => []),
        request('list_forecast', { limit: 2000 }).catch(() => []),
        request('list_payments', { limit: 2000 }).catch(() => []),
        request('summary', {}).catch(() => null)
      ]);
      state.entries = Array.isArray(entries) ? entries : [];
      state.schedules = Array.isArray(schedules) ? schedules : [];
      state.forecast = Array.isArray(forecast) ? forecast : [];
      state.payments = Array.isArray(payments) ? payments : [];
      state.summary = summary || null;
      populateCurrencies();
      await loadCompanies();
      renderActiveTab();
    } catch (error) {
      console.error('[Biners] refresh failed', error);
      setState(`Unable to load Biners: ${error.message || error}`, 'error');
    }
  }

  async function loadCompanies() {
    try {
      const client = global.SupabaseClient?.getClient?.();
      if (!client) return;
      const { data } = await client.from('companies').select('id,company_id,legal_name,company_name,name,country,city,address,main_email,main_phone').order('created_at', { ascending: false }).limit(1000);
      state.companies = Array.isArray(data) ? data : [];
      const select = $('binersExistingClient');
      if (select) {
        select.innerHTML = '<option value="">Select existing client...</option>' + state.companies.map(c => `<option value="${esc(c.id)}">${esc(c.legal_name || c.company_name || c.name || c.company_id || c.id)}</option>`).join('');
      }
    } catch (error) {
      console.warn('[Biners] companies load skipped', error);
    }
  }

  function populateCurrencies() {
    const select = $('binersCurrencyFilter');
    if (!select) return;
    const currencies = [...new Set([...state.entries, ...state.forecast, ...state.schedules, ...state.payments].map(row => row.currency).filter(Boolean))].sort();
    const current = select.value || 'all';
    select.innerHTML = '<option value="all">All currencies</option>' + currencies.map(c => `<option value="${esc(norm(c))}">${esc(c)}</option>`).join('');
    select.value = currencies.map(norm).includes(current) ? current : 'all';
  }

  function applyFiltersFromInputs() {
    state.filters.search = $('binersSearchInput')?.value || '';
    state.filters.status = norm($('binersStatusFilter')?.value || 'all') || 'all';
    state.filters.paymentStatus = norm($('binersPaymentStatusFilter')?.value || 'all') || 'all';
    state.filters.currency = norm($('binersCurrencyFilter')?.value || 'all') || 'all';
    Object.values(state.pagination).forEach(p => { p.page = 1; });
    renderActiveTab();
  }

  function openEntryModal() {
    if (!can('create')) { setState('You do not have permission to create Biners entries.', 'error'); return; }
    const modal = $('binersEntryModal');
    const form = $('binersEntryForm');
    if (!modal || !form) return;
    form.reset();
    $('binersLicenseLength').value = '12';
    $('binersLocationCount').value = '1';
    $('binersCurrency').value = 'USD';
    $('binersCostPerLocation').value = '0';
    $('binersTotalPayable').value = '0';
    $('binersScheduleRows').innerHTML = '';
    addScheduleRow({ schedule_no: 1, due_date: today(), scheduled_amount: 0 });
    modal.hidden = false;
    updateEntryTypeVisibility();
    updateTotalPayable();
  }

  function closeEntryModal() { const modal = $('binersEntryModal'); if (modal) modal.hidden = true; }
  function closePaymentModal() { const modal = $('binersPaymentModal'); if (modal) modal.hidden = true; }

  function updateEntryTypeVisibility() {
    const type = $('binersEntryType')?.value || 'existing_client_new_location';
    const existing = $('binersExistingClient');
    if (existing) existing.closest('label').style.display = type === 'existing_client_new_location' ? '' : 'none';
  }

  function updateTotalPayable() {
    const locations = Math.max(1, Number($('binersLocationCount')?.value || 1));
    const cost = num($('binersCostPerLocation')?.value || 0);
    const total = locations * cost;
    if ($('binersTotalPayable')) $('binersTotalPayable').value = total.toFixed(2);
    const rows = document.querySelectorAll('.biners-schedule-row');
    if (rows.length === 1) {
      const amount = rows[0].querySelector('[data-biners-schedule-amount]');
      if (amount && (!amount.value || Number(amount.value) === 0)) amount.value = total.toFixed(2);
    }
  }

  function addScheduleRow(data = {}) {
    const wrap = $('binersScheduleRows');
    if (!wrap) return;
    const index = wrap.querySelectorAll('.biners-schedule-row').length + 1;
    const div = document.createElement('div');
    div.className = 'biners-schedule-row';
    div.innerHTML = `
      <label>#<input class="input" type="number" min="1" data-biners-schedule-no value="${esc(data.schedule_no || index)}"></label>
      <label>Due Date<input class="input" type="date" data-biners-schedule-due value="${esc(data.due_date || '')}"></label>
      <label>Amount<input class="input" type="number" min="0" step="0.01" data-biners-schedule-amount value="${esc(data.scheduled_amount || 0)}"></label>
      <label>Status<select class="select" data-biners-schedule-status><option value="scheduled">Scheduled</option><option value="due_soon">Due soon</option><option value="overdue">Overdue</option><option value="paid">Paid</option></select></label>
      <button class="btn ghost xs" type="button" data-biners-remove-schedule>Remove</button>
    `;
    wrap.appendChild(div);
    const status = div.querySelector('[data-biners-schedule-status]');
    if (status) status.value = data.payment_status || 'scheduled';
  }

  function scheduleRowsPayload(currency) {
    return [...document.querySelectorAll('.biners-schedule-row')].map((row, idx) => ({
      schedule_no: Number(row.querySelector('[data-biners-schedule-no]')?.value || idx + 1),
      due_date: row.querySelector('[data-biners-schedule-due]')?.value || today(),
      currency,
      scheduled_amount: num(row.querySelector('[data-biners-schedule-amount]')?.value),
      payment_status: row.querySelector('[data-biners-schedule-status]')?.value || 'scheduled',
      created_by: auth().id || null,
      created_by_email: auth().email || ''
    })).filter(row => row.scheduled_amount > 0 || row.due_date);
  }

  async function saveEntry(event) {
    event.preventDefault();
    const btn = $('binersSaveEntryBtn');
    if (btn?.disabled) return;
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      const type = $('binersEntryType')?.value || 'existing_client_new_location';
      const company = state.companies.find(c => String(c.id) === String($('binersExistingClient')?.value || '')) || null;
      const currency = String($('binersCurrency')?.value || 'USD').trim().toUpperCase() || 'USD';
      const locations = Math.max(1, Number($('binersLocationCount')?.value || 1));
      const costPerLocation = num($('binersCostPerLocation')?.value);
      const clientName = String($('binersClientName')?.value || company?.legal_name || company?.company_name || company?.name || '').trim();
      if (!clientName) throw new Error('Client name is required.');
      const entry = {
        entry_type: type,
        company_id: company?.id || null,
        company_name: company?.legal_name || company?.company_name || company?.name || '',
        client_name: clientName,
        client_legal_name: $('binersClientLegalName')?.value || clientName,
        client_country: $('binersClientCountry')?.value || company?.country || '',
        client_city: $('binersClientCity')?.value || company?.city || '',
        client_address: $('binersClientAddress')?.value || company?.address || '',
        client_contact_name: $('binersContactName')?.value || '',
        client_contact_email: $('binersContactEmail')?.value || company?.main_email || '',
        client_contact_phone: $('binersContactPhone')?.value || company?.main_phone || '',
        module_name: $('binersModuleName')?.value || '',
        license_type: $('binersLicenseType')?.value || '',
        license_length_months: Number($('binersLicenseLength')?.value || 12),
        number_of_locations: locations,
        service_start_date: $('binersServiceStart')?.value || null,
        service_end_date: $('binersServiceEnd')?.value || null,
        currency,
        cost_per_location: costPerLocation,
        total_payable_amount: locations * costPerLocation,
        entry_status: 'active',
        payment_status: 'unpaid',
        description: $('binersDescription')?.value || '',
        internal_notes: $('binersInternalNotes')?.value || '',
        created_by: auth().id || null,
        created_by_email: auth().email || ''
      };
      const locationRows = Array.from({ length: locations }).map((_, i) => ({
        location_name: `${clientName} Location ${i + 1}`,
        module_name: entry.module_name,
        license_type: entry.license_type,
        license_length_months: entry.license_length_months,
        service_start_date: entry.service_start_date,
        service_end_date: entry.service_end_date,
        currency,
        cost_amount: costPerLocation,
        status: 'active'
      }));
      await request('create', { entry, locations: locationRows, schedules: scheduleRowsPayload(currency) });
      closeEntryModal();
      await refresh();
      global.UI?.toast?.('Biners entry created.');
    } catch (error) {
      console.error('[Biners] save failed', error);
      setState(error.message || String(error), 'error');
      global.UI?.toast?.(error.message || 'Unable to save Biners entry.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Entry'; }
    }
  }

  function openPaymentModal(scheduleId) {
    if (!can('record_payment')) { setState('You do not have permission to record Biners payments.', 'error'); return; }
    const schedule = state.schedules.find(row => String(row.id) === String(scheduleId)) || state.forecast.find(row => String(row.schedule_id) === String(scheduleId));
    if (!schedule) return;
    const entry = getEntry(schedule.biners_entry_id);
    $('binersPaymentScheduleId').value = schedule.id || schedule.schedule_id || '';
    $('binersPaymentEntryId').value = schedule.biners_entry_id || '';
    $('binersPaymentDate').value = today();
    $('binersPaymentAmount').value = num(schedule.remaining_amount || schedule.scheduled_amount).toFixed(2);
    $('binersPaymentMethod').value = '';
    $('binersPaymentReference').value = '';
    $('binersPaymentNotes').value = '';
    $('binersPaymentContext').textContent = `${entry?.biners_entry_number || ''} · ${entry?.client_name || schedule.client_name || ''} · Schedule #${schedule.schedule_no || ''}`;
    $('binersPaymentModal').hidden = false;
  }

  async function savePayment(event) {
    event.preventDefault();
    const btn = $('binersSavePaymentBtn');
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      await request('record_payment', {
        schedule_id: $('binersPaymentScheduleId')?.value,
        biners_entry_id: $('binersPaymentEntryId')?.value,
        payment_date: $('binersPaymentDate')?.value || today(),
        payment_amount: num($('binersPaymentAmount')?.value),
        payment_method: $('binersPaymentMethod')?.value || '',
        payment_reference: $('binersPaymentReference')?.value || '',
        notes: $('binersPaymentNotes')?.value || '',
        created_by: auth().id || null,
        created_by_email: auth().email || ''
      });
      closePaymentModal();
      await refresh();
      global.UI?.toast?.('Biners payment recorded.');
    } catch (error) {
      console.error('[Biners] payment failed', error);
      setState(error.message || String(error), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Payment'; }
    }
  }

  function viewEntry(id) {
    const entry = getEntry(id);
    if (!entry) return;
    const schedules = state.schedules.filter(row => String(row.biners_entry_id) === String(id));
    const details = [
      `Entry: ${entry.biners_entry_number || ''}`,
      `Client: ${entry.client_name || ''}`,
      `Module: ${entry.module_name || ''}`,
      `Locations: ${entry.number_of_locations || 0}`,
      `Total: ${money(entry.total_payable_amount, entry.currency)}`,
      `Schedules: ${schedules.length}`
    ].join('\n');
    alert(details);
  }

  function exportCsv() {
    const rows = currentRows();
    const csv = rows.map(row => Object.values(row).map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const headers = rows[0] ? Object.keys(rows[0]).join(',') : '';
    const blob = new Blob([headers, '\n', csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `biners-${state.activeTab}-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bind() {
    $('binersRefreshBtn')?.addEventListener('click', () => refresh());
    $('binersCreateBtn')?.addEventListener('click', () => openEntryModal());
    $('binersExportBtn')?.addEventListener('click', () => exportCsv());
    document.querySelectorAll('[data-biners-tab]').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.binersTab)));
    ['binersSearchInput','binersStatusFilter','binersPaymentStatusFilter','binersCurrencyFilter'].forEach(id => $(id)?.addEventListener(id === 'binersSearchInput' ? 'input' : 'change', applyFiltersFromInputs));
    $('binersClearFiltersBtn')?.addEventListener('click', () => {
      ['binersSearchInput'].forEach(id => { if ($(id)) $(id).value = ''; });
      ['binersStatusFilter','binersPaymentStatusFilter','binersCurrencyFilter'].forEach(id => { if ($(id)) $(id).value = 'all'; });
      applyFiltersFromInputs();
    });
    document.querySelectorAll('[data-biners-close-entry]').forEach(btn => btn.addEventListener('click', closeEntryModal));
    document.querySelectorAll('[data-biners-close-payment]').forEach(btn => btn.addEventListener('click', closePaymentModal));
    $('binersEntryForm')?.addEventListener('submit', saveEntry);
    $('binersPaymentForm')?.addEventListener('submit', savePayment);
    $('binersEntryType')?.addEventListener('change', updateEntryTypeVisibility);
    $('binersExistingClient')?.addEventListener('change', () => {
      const company = state.companies.find(c => String(c.id) === String($('binersExistingClient').value));
      if (!company) return;
      $('binersClientName').value = company.legal_name || company.company_name || company.name || '';
      $('binersClientLegalName').value = company.legal_name || company.company_name || company.name || '';
      $('binersClientCountry').value = company.country || '';
      $('binersClientCity').value = company.city || '';
      $('binersClientAddress').value = company.address || '';
      $('binersContactEmail').value = company.main_email || '';
      $('binersContactPhone').value = company.main_phone || '';
    });
    ['binersLocationCount','binersCostPerLocation'].forEach(id => $(id)?.addEventListener('input', updateTotalPayable));
    $('binersAddScheduleRowBtn')?.addEventListener('click', () => addScheduleRow({ due_date: today(), scheduled_amount: 0 }));
    document.addEventListener('click', event => {
      const removeBtn = event.target.closest('[data-biners-remove-schedule]');
      if (removeBtn) removeBtn.closest('.biners-schedule-row')?.remove();
      const pageBtn = event.target.closest('[data-biners-page]');
      if (pageBtn) {
        const p = state.pagination[state.activeTab];
        if (pageBtn.dataset.binersPage === 'prev') p.page = Math.max(1, p.page - 1);
        if (pageBtn.dataset.binersPage === 'next') p.page += 1;
        renderActiveTab();
      }
      const recordBtn = event.target.closest('[data-biners-record-payment]');
      if (recordBtn) openPaymentModal(recordBtn.dataset.binersRecordPayment);
      const viewBtn = event.target.closest('[data-biners-view-entry]');
      if (viewBtn) viewEntry(viewBtn.dataset.binersViewEntry);
    });
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    bind();
  }

  global.Biners = { init, refresh, setActiveTab, openCreate: openEntryModal };
})(window);
