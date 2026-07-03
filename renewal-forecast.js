const RenewalForecast = {
  PAGE_SIZE: 10,
  state: {
    loading: false,
    rows: [],
    filteredRows: [],
    monthSummaries: [],
    detailsCache: {},
    manualRenewals: [],
    noRenewalNeededOverrides: [],
    noRenewalNeededRow: null,
    actionLoadingId: '',
    overviewPage: 1,
    detailPage: 1,
    detailRows: [],
    filters: {
      dateFrom: '',
      dateTo: '',
      client: 'all',
      country: 'all',
      status: 'all',
      agreement: 'all',
      owner: 'all'
    },
    selectedMonth: '',
    error: '',
    warning: ''
  },

  text(value) { return String(value ?? '').trim(); },
  n(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; },
  date(value) { return this.text(value).slice(0, 10); },
  today() { return new Date().toISOString().slice(0, 10); },
  key(value) { return this.text(value).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); },
  statusKey(value) { return this.key(value).replace(/\s+/g, '_'); },
  monthKey(value) { const date = this.date(value); return date ? date.slice(0, 7) : ''; },
  monthDate(value) { const date = this.date(value); return date ? `${date.slice(0, 7)}-01` : ''; },
  pick(row, fields) { for (const field of fields) if (this.text(row?.[field])) return row[field]; return ''; },

  addDays(days) {
    const date = new Date(`${this.today()}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  },

  addMonths(value, months) {
    const source = new Date(`${this.date(value)}T00:00:00Z`);
    const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(source.getUTCDate(), lastDay));
    return target.toISOString().slice(0, 10);
  },

  defaultDateRange() {
    const monthStart = `${this.today().slice(0, 7)}-01`;
    return {
      dateFrom: this.addMonths(monthStart, -12),
      dateTo: this.addMonths(this.today(), 12)
    };
  },

  ensureDefaultDateRange() {
    if (this._defaultDateRangeSet) return;
    this._defaultDateRangeSet = true;
    const range = this.defaultDateRange();
    if (!this.state.filters.dateFrom) this.state.filters.dateFrom = range.dateFrom;
    if (!this.state.filters.dateTo) this.state.filters.dateTo = range.dateTo;
    this.syncDateInputs();
  },

  syncDateInputs() {
    [['renewalForecastDateFrom', 'dateFrom'], ['renewalForecastDateTo', 'dateTo']].forEach(([id, key]) => {
      const input = document.getElementById?.(id);
      if (input) input.value = this.state.filters[key];
    });
  },

  monthsBetween(start, end) {
    const startDate = new Date(`${this.date(start)}T00:00:00Z`);
    const endDate = new Date(`${this.date(end)}T00:00:00Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 12;
    const months = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + (endDate.getUTCMonth() - startDate.getUTCMonth()) + 1;
    return Math.min(Math.max(months, 1), 60);
  },

  money(value, currency = 'USD') {
    const code = this.text(currency || 'USD').toUpperCase() || 'USD';
    return `${code} ${U.fmtNumber(this.n(value))}`;
  },

  formatMonth(value) {
    const month = this.monthKey(value);
    if (!month) return '—';
    const date = new Date(`${month}-01T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? U.escapeHtml(month) : date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  },

  getRenewalForecastMonth(row = {}) { return this.monthDate(row.renewal_month || row.month || row.service_end_date); },
  getRenewalForecastClientName(row = {}) { return this.text(row.client_name || row.company_name || row.customer_name || 'Unknown Client'); },
  getRenewalForecastAgreementNumber(row = {}) { return this.text(row.agreement_number || row.agreement_no || row.agreement_ref || '—'); },
  getRenewalForecastInvoiceNumber(row = {}) { return this.text(row.invoice_number || row.invoice_no || row.invoice_ref || '—'); },
  getRenewalForecastServiceStart(row = {}) { return this.date(row.service_start_date || row.start_date); },
  getRenewalForecastServiceEnd(row = {}) { return this.date(row.service_end_date || row.end_date || row.renewal_month); },
  getRenewalForecastValue(row = {}) { return this.n(row.expected_renewal_amount || row.expected_renewal_value || row.amount || row.total_amount); },
  getRenewalForecastStatus(row = {}) { return this.statusKey(row.renewal_status || row.status || 'upcoming') || 'upcoming'; },
  getRenewalForecastOwner(row = {}) { return this.text(row.owner || row.assigned_to || row.assigned_owner || row.csm_name || '—'); },

  getRenewalForecastPaginatedRows({ rows, filterFn, sortFn, page, pageSize }) {
    const allRows = Array.isArray(rows) ? rows : [];
    const filteredRows = filterFn ? allRows.filter(filterFn) : allRows;
    const sortedRows = sortFn ? [...filteredRows].sort(sortFn) : filteredRows;
    const totalRows = sortedRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(Math.max(1, this.n(page) || 1), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    return { rows: sortedRows.slice(start, end), totalRows, totalPages, page: safePage, startItem: totalRows ? start + 1 : 0, endItem: Math.min(end, totalRows) };
  },

  formatDate(value) {
    const date = this.date(value);
    return date ? U.fmtDate(date) : '—';
  },

  getClient() {
    const client = window.SupabaseClient?.getClient?.();
    if (!client) throw new Error('Supabase is not configured.');
    return client;
  },

  hasPermission(action) {
    return !window.Permissions || window.Permissions.canPerformAction?.('monthly_renewal_forecast', action) || window.Permissions.can?.('monthly_renewal_forecast', action);
  },

  requirePermission(action, message) {
    if (this.hasPermission(action)) return true;
    UI.toast(message || 'You do not have permission for this Monthly Renewal Forecast action.');
    return false;
  },

  renderAccessDenied() {
    const message = 'Access denied. You need permission to view Monthly Renewal Forecast.';
    const state = document.getElementById?.('renewalForecastState');
    const body = document.getElementById?.('renewalForecastBody');
    if (state) state.textContent = message;
    if (body) body.innerHTML = '';
  },

  denyAccess() {
    this.state.rows = [];
    this.state.filteredRows = [];
    this.state.monthSummaries = [];
    this.state.error = 'Access denied. You need permission to view Monthly Renewal Forecast.';
    this.closeDrawer();
    this.renderAccessDenied();
    UI.toast(this.state.error);
    return false;
  },

  requireView() {
    return this.hasPermission('view') || this.denyAccess();
  },

  rpcRange() {
    this.ensureDefaultDateRange();
    const dateFrom = this.state.filters.dateFrom || this.defaultDateRange().dateFrom;
    const dateTo = this.state.filters.dateTo || this.defaultDateRange().dateTo;
    return { dateFrom, dateTo, months: this.monthsBetween(dateFrom, dateTo) };
  },

  async fetchMonthSummaries() {
    if (!this.requireView()) return [];
    const { dateFrom, months } = this.rpcRange();
    const { data, error } = await this.getClient().rpc('crm_get_monthly_renewal_forecast', {
      p_start_date: dateFrom,
      p_months: months
    });
    if (error) throw error;
    return Array.isArray(data) ? data.map(row => this.normalizeMonthSummary(row)) : [];
  },

  async fetchMonthDetails(month) {
    if (!this.requirePermission('view_details', 'You do not have permission to view renewal details.')) return [];
    const monthDate = this.monthDate(month);
    if (!monthDate) return [];
    if (this.state.detailsCache[monthDate]) return this.state.detailsCache[monthDate];

    const { data, error } = await this.getClient().rpc('crm_get_monthly_renewal_forecast_details', {
      p_month: monthDate
    });
    if (error) throw error;

    const rows = Array.isArray(data) ? data.map((row, index) => this.normalizeDetailRow(row, monthDate, index)) : [];
    this.state.detailsCache[monthDate] = rows;
    return rows;
  },

  async fetchAllDetails(monthSummaries) {
    if (!this.requirePermission('view_details', 'You do not have permission to view renewal details.')) return [];
    const months = [...new Set(monthSummaries.map(row => this.monthDate(row.renewal_month)).filter(Boolean))];
    const batches = await Promise.all(months.map(async month => {
      try { return await this.fetchMonthDetails(month); }
      catch (error) {
        console.warn('[renewal forecast] unable to load month details', month, error);
        this.state.warning = error.message || 'Unable to load one or more renewal detail months.';
        return [];
      }
    }));
    return batches.flat();
  },

  normalizeMonthSummary(row = {}) {
    return {
      renewal_month: this.monthDate(row.renewal_month || row.month),
      client_count: this.n(row.client_count),
      location_count: this.n(row.location_count || row.locations),
      expected_renewal_value: this.n(row.expected_renewal_value),
      renewed_count: this.n(row.renewed_count),
      pending_count: this.n(row.pending_count),
      overdue_count: this.n(row.overdue_count),
      no_renewal_needed_count: this.n(row.no_renewal_needed_count)
    };
  },

  normalizeDetailRow(row = {}, monthDate = '', index = 0) {
    const end = this.date(row.service_end_date);
    const start = this.date(row.service_start_date);
    const status = this.statusKey(row.renewal_status || 'upcoming') || 'upcoming';
    const invoiceNumber = this.text(row.invoice_number || row.invoice_ref);
    const agreementNumber = this.text(row.agreement_number || row.agreement_ref);
    const clientName = this.text(row.client_name || row.customer_name || row.company_name || 'Unknown Client');
    const saasItem = this.text(row.saas_item || row.location_name || row.item_name || row.description || 'Annual SaaS');
    const currentPeriodAmount = this.n(row.current_period_amount || row.current_invoice_row_amount || row.line_total || row.total_amount);
    const currentAnnualPrice = this.n(row.current_annual_price || row.unit_price || row.license_price);
    const expectedRenewalAmount = this.n(row.expected_renewal_amount) || currentAnnualPrice;
    const days = this.text(row.days_until_renewal) ? this.n(row.days_until_renewal) : Math.ceil((new Date(`${end}T00:00:00Z`) - new Date(`${this.today()}T00:00:00Z`)) / 86400000);

    return {
      ...row,
      source_table: 'invoice_items',
      opportunity_id: this.text(row.opportunity_id || `renewal:${invoiceNumber}:${agreementNumber}:${clientName}:${saasItem}:${start}:${end}:${index}`),
      invoice_item_id: this.text(row.invoice_item_id || row.id || row.item_id),
      client_id: this.text(row.client_id || row.company_id || row.company_uuid || clientName),
      client_name: clientName,
      invoice_number: invoiceNumber,
      agreement_number: agreementNumber,
      agreement_uuid: this.text(row.agreement_uuid || row.agreement_id || agreementNumber),
      location_name: saasItem,
      service_start_date: start,
      service_end_date: end,
      days_until_renewal: Number.isFinite(days) ? days : 0,
      current_invoice_row_amount: currentPeriodAmount,
      current_annual_price: currentAnnualPrice,
      current_discount: this.n(row.current_discount || row.discount_percent || row.discount),
      expected_renewal_amount: expectedRenewalAmount,
      renewal_status: status,
      currency: this.text(row.currency || 'USD'),
      country: this.text(row.country || row.billing_country),
      owner: this.text(row.owner || row.assigned_owner || row.csm_name),
      renewal_month: monthDate || this.monthDate(end)
    };
  },

  renewalRowKey(row = {}) {
    return this.text(row?.invoice_item_id || row?.agreement_item_id || row?.renewal_key || row?.id || row?.opportunity_id);
  },

  manualKey(row = {}) {
    const existing = this.text(row.opportunity_id || row.opportunity_key || row.manual_renewal_key);
    if (existing) return existing;
    return `renewal:${this.text(row.invoice_number || row.invoice_ref)}:${this.text(row.agreement_number || row.agreement_ref)}:${this.text(row.client_name)}:${this.text(row.location_name || row.saas_item)}:${this.date(row.service_start_date)}:${this.date(row.service_end_date)}`;
  },

  normalizeManualRenewal(row = {}) {
    return {
      ...row,
      opportunity_key: this.text(row.opportunity_key || row.renewal_opportunity_key || row.opportunity_id),
      source_invoice_number: this.text(row.source_invoice_number || row.invoice_number || row.invoice_ref),
      source_agreement_number: this.text(row.source_agreement_number || row.agreement_number || row.agreement_ref),
      client_name: this.text(row.client_name || row.customer_name || row.company_name),
      location_name: this.text(row.location_name || row.saas_item || row.item_name),
      service_start_date: this.date(row.service_start_date),
      service_end_date: this.date(row.service_end_date),
      renewal_agreement_ref: this.text(row.renewal_agreement_ref || row.manual_renewal_agreement_ref),
      renewal_invoice_ref: this.text(row.renewal_invoice_ref || row.manual_renewal_invoice_ref),
      note: this.text(row.note || row.notes || row.manual_renewal_note),
      marked_at: this.text(row.marked_at || row.created_at),
      marked_by_name: this.text(row.marked_by_name || row.marked_by || row.created_by_name)
    };
  },

  async fetchManualRenewals() {
    if (!this.requirePermission('view_details', 'You do not have permission to view renewal details.')) return [];
    const { dateFrom, dateTo } = this.rpcRange();
    try {
      const { data, error } = await this.getClient().rpc('crm_get_manual_renewal_overrides', {
        p_start_date: dateFrom,
        p_end_date: dateTo
      });
      if (error) throw error;
      return Array.isArray(data) ? data.map(row => this.normalizeManualRenewal(row)).filter(row => row.opportunity_key) : [];
    } catch (error) {
      const message = this.text(error?.message || error);
      console.warn('[renewal forecast] manual renewal override RPC unavailable or failed', error);
      if (!/function .*crm_get_manual_renewal_overrides|Could not find the function|schema cache/i.test(message)) {
        this.state.warning = message || 'Unable to load manual renewal overrides.';
      }
      return [];
    }
  },

  findManualRenewal(row, manualRenewals = this.state.manualRenewals) {
    const key = this.manualKey(row);
    const exact = manualRenewals.find(item => item.opportunity_key === key);
    if (exact) return exact;
    const end = this.date(row.service_end_date);
    const start = this.date(row.service_start_date);
    const client = this.key(row.client_name);
    const location = this.key(row.location_name);
    const invoice = this.key(row.invoice_number);
    return manualRenewals.find(item =>
      (!item.service_end_date || item.service_end_date === end) &&
      (!item.service_start_date || item.service_start_date === start) &&
      (!item.source_invoice_number || this.key(item.source_invoice_number) === invoice) &&
      (!item.client_name || this.key(item.client_name) === client) &&
      (!item.location_name || this.key(item.location_name) === location)
    );
  },

  applyManualRenewal(row, manualRenewals = this.state.manualRenewals) {
    const manual = this.findManualRenewal(row, manualRenewals);
    if (!manual) return row;
    return {
      ...row,
      renewal_status: 'renewed',
      manual_renewal: true,
      manual_renewal_note: manual.note,
      manual_renewal_agreement_ref: manual.renewal_agreement_ref,
      manual_renewal_invoice_ref: manual.renewal_invoice_ref,
      manual_renewal_marked_at: manual.marked_at,
      manual_renewal_marked_by: manual.marked_by_name,
      renewal_method: 'manual'
    };
  },

  mergeManualRenewals(rows, manualRenewals = this.state.manualRenewals) {
    return rows.map(row => this.applyManualRenewal(row, manualRenewals));
  },

  normalizeNoRenewalNeededOverride(row = {}) {
    return {
      ...row,
      invoice_item_id: this.text(row.invoice_item_id),
      reason: this.text(row.reason),
      note: this.text(row.note),
      marked_at: this.text(row.marked_at || row.updated_at || row.created_at),
      marked_by_name: this.text(row.marked_by_name || row.marked_by || row.updated_by_name)
    };
  },

  async fetchNoRenewalNeededOverrides() {
    if (!this.requirePermission('view_details', 'You do not have permission to view renewal details.')) return [];
    const { dateFrom, dateTo } = this.rpcRange();
    const { data, error } = await this.getClient().rpc('crm_get_renewal_no_needed_overrides', {
      p_start_date: dateFrom,
      p_end_date: dateTo
    });
    if (error) throw error;
    return Array.isArray(data) ? data.map(row => this.normalizeNoRenewalNeededOverride(row)).filter(row => row.invoice_item_id) : [];
  },

  applyNoRenewalNeededOverride(row, overrides = this.state.noRenewalNeededOverrides) {
    const override = overrides.find(item => item.invoice_item_id === this.text(row.invoice_item_id));
    if (!override) return row;
    return {
      ...row,
      renewal_status: 'no_renewal_needed',
      manual_no_renewal_needed: true,
      no_renewal_needed_reason: override.reason,
      no_renewal_needed_note: override.note,
      no_renewal_needed_marked_at: override.marked_at,
      no_renewal_needed_marked_by: override.marked_by_name,
      renewal_method: 'manual_override'
    };
  },

  mergeOverrides(rows, manualRenewals = this.state.manualRenewals, noRenewalNeededOverrides = this.state.noRenewalNeededOverrides) {
    return rows.map(row => this.applyNoRenewalNeededOverride(this.applyManualRenewal(row, manualRenewals), noRenewalNeededOverrides));
  },

  openNoRenewalNeededModal(row) {
    if (!this.requirePermission('mark_no_renewal_needed', 'You do not have permission to mark No Renewal Needed.') || !['upcoming', 'due_soon', 'overdue'].includes(row.renewal_status) || !this.renewalRowKey(row)) return;
    this.state.noRenewalNeededRow = row;
    const modal = document.getElementById('renewalNoNeededModal');
    const reason = document.getElementById('renewalNoNeededReason');
    const note = document.getElementById('renewalNoNeededNote');
    const context = document.getElementById('renewalNoNeededContext');
    if (!modal || !reason || !note) return;
    reason.value = '';
    note.value = '';
    if (context) context.textContent = `${row.client_name} · ${row.location_name} · ${row.invoice_number || 'No invoice number'}`;
    modal.hidden = false;
    document.body.classList.add('pf-modal-open');
    reason.focus();
  },

  closeNoRenewalNeededModal() {
    const modal = document.getElementById('renewalNoNeededModal');
    if (modal) modal.hidden = true;
    this.state.noRenewalNeededRow = null;
    if (document.getElementById('renewalForecastDetailsDrawer')?.hidden !== false) document.body.classList.remove('pf-modal-open');
  },

  async confirmNoRenewalNeeded() {
    if (!this.requirePermission('mark_no_renewal_needed', 'You do not have permission to mark No Renewal Needed.')) return;
    const row = this.state.noRenewalNeededRow;
    const rowKey = this.renewalRowKey(row);
    const reason = this.text(document.getElementById('renewalNoNeededReason')?.value) || 'No renewal needed';
    const note = this.text(document.getElementById('renewalNoNeededNote')?.value);
    if (!row || !rowKey) return UI.toast('Unable to mark renewal: missing unique renewal row key.');

    this.state.actionLoadingId = rowKey;
    this.renderMonthDetails();
    try {
      const { error } = await this.getClient().rpc('crm_mark_monthly_renewal_no_renewal_needed', {
        p_invoice_item_id: rowKey,
        p_reason: reason,
        p_note: note || null,
        p_invoice_number: row.invoice_number || null,
        p_client_name: row.client_name || null,
        p_location_name: row.location_name || null,
        p_service_start_date: row.service_start_date || null,
        p_service_end_date: row.service_end_date || null
      });
      if (error) throw error;

      const applySavedState = item => this.renewalRowKey(item) === rowKey ? this.applyNoRenewalNeededOverride(item, [{ invoice_item_id: rowKey, reason, note }]) : item;
      this.state.rows = this.state.rows.map(applySavedState);
      this.state.detailRows = this.state.detailRows.map(applySavedState);
      Object.keys(this.state.detailsCache).forEach(month => { this.state.detailsCache[month] = this.state.detailsCache[month].map(applySavedState); });
      this.applyFilters();
      this.closeNoRenewalNeededModal();
      UI.toast('Renewal marked as No Renewal Needed.');
      await this.refresh();
      if (this.state.selectedMonth) this.state.detailRows = this.filtered().filter(item => this.monthKey(item.service_end_date || item.renewal_month) === this.state.selectedMonth && !item._summaryOnly);
      this.renderMonthDetails();
    } catch (error) {
      console.error('Failed to mark renewal as no renewal needed:', error);
      UI.toast(error?.message || 'Failed to mark renewal as No Renewal Needed.');
    } finally {
      this.state.actionLoadingId = '';
      this.renderMonthDetails();
    }
  },

  async undoNoRenewalNeeded(row) {
    if (!this.requirePermission('undo_override', 'You do not have permission to undo renewal overrides.') || !this.renewalRowKey(row) || !window.confirm?.('Undo the No Renewal Needed mark for this location?')) return;
    const { error } = await this.getClient().rpc('crm_unmark_renewal_override', { p_invoice_item_id: this.renewalRowKey(row) });
    if (error) throw error;
    UI.toast('No Renewal Needed mark removed.');
    await this.refresh();
  },

  async markManualRenewed(row) {
    if (!this.requirePermission('mark_renewed', 'You do not have permission to mark renewals as renewed.')) return;
    const renewalAgreementRef = window.prompt?.('Enter the manual renewal agreement/reference already created for this location:', row.manual_renewal_agreement_ref || '') ?? null;
    if (renewalAgreementRef === null) return;
    const renewalInvoiceRef = window.prompt?.('Optional: enter renewal invoice reference if available:', row.manual_renewal_invoice_ref || '') ?? '';
    const note = window.prompt?.('Optional: add a note for this manual renewal mark:', row.manual_renewal_note || 'Manually marked as renewed because renewal was created before automation.') ?? '';

    const payload = {
      p_opportunity_key: this.manualKey(row),
      p_source_invoice_number: row.invoice_number || null,
      p_source_agreement_number: row.agreement_number || null,
      p_client_name: row.client_name || null,
      p_location_name: row.location_name || null,
      p_service_start_date: row.service_start_date || null,
      p_service_end_date: row.service_end_date || null,
      p_renewal_agreement_ref: this.text(renewalAgreementRef) || null,
      p_renewal_invoice_ref: this.text(renewalInvoiceRef) || null,
      p_note: this.text(note) || null
    };

    const { error } = await this.getClient().rpc('crm_mark_manual_renewal', payload);
    if (error) throw error;
    UI.toast('Location marked as manually renewed.');
    await this.refresh();
  },

  async unmarkManualRenewed(row) {
    if (!this.requirePermission('undo_override', 'You do not have permission to undo renewal overrides.')) return;
    if (!window.confirm?.('Remove the manual renewed mark for this location?')) return;
    const { error } = await this.getClient().rpc('crm_unmark_manual_renewal', {
      p_opportunity_key: this.manualKey(row)
    });
    if (error) throw error;
    UI.toast('Manual renewed mark removed.');
    await this.refresh();
  },

  refreshFallbackRowsFromSummaries(monthSummaries) {
    return monthSummaries.map((summary, index) => ({
      opportunity_id: `summary:${summary.renewal_month}:${index}`,
      source_table: 'monthly_summary',
      client_id: `summary:${summary.renewal_month}`,
      client_name: `${summary.client_count} client(s)`,
      invoice_number: '—',
      agreement_number: '—',
      agreement_uuid: '',
      location_name: `${summary.location_count} Annual SaaS row(s)`,
      service_start_date: '',
      service_end_date: summary.renewal_month,
      renewal_month: summary.renewal_month,
      days_until_renewal: 0,
      current_invoice_row_amount: 0,
      current_annual_price: 0,
      current_discount: 0,
      expected_renewal_amount: summary.expected_renewal_value,
      renewal_status: summary.overdue_count > 0 ? 'overdue' : 'upcoming',
      currency: 'USD',
      country: '',
      owner: '',
      _summaryOnly: true
    }));
  },

  async refresh() {
    if (!this.requireView() || this.state.loading) return;
    this.ensureDefaultDateRange();
    this.state.loading = true;
    this.state.error = '';
    this.state.warning = '';
    this.state.detailsCache = {};
    this.state.manualRenewals = [];
    this.state.noRenewalNeededOverrides = [];
    this.render();

    try {
      const monthSummaries = await this.fetchMonthSummaries();
      this.state.monthSummaries = monthSummaries;
      const [manualRenewals, noRenewalNeededOverrides] = await Promise.all([this.fetchManualRenewals(), this.fetchNoRenewalNeededOverrides()]);
      this.state.manualRenewals = manualRenewals;
      this.state.noRenewalNeededOverrides = noRenewalNeededOverrides;
      const detailRows = this.mergeOverrides(await this.fetchAllDetails(monthSummaries), manualRenewals, noRenewalNeededOverrides);
      this.state.rows = detailRows.length ? detailRows : this.refreshFallbackRowsFromSummaries(monthSummaries);
      this.populateFilters();
      this.applyFilters();
    } catch (error) {
      this.state.rows = [];
      this.state.filteredRows = [];
      this.state.monthSummaries = [];
      this.state.error = error.message || 'Unable to load renewal forecast.';
      UI.toast(this.state.error);
    } finally {
      this.state.loading = false;
      this.render();
    }
  },

  filtered() { return this.state.filteredRows; },

  applyFilters() {
    const f = this.state.filters;
    this.state.overviewPage = 1;
    this.state.detailPage = 1;
    this.state.filteredRows = this.state.rows.filter(row =>
      (!f.dateFrom || !row.service_end_date || row.service_end_date >= f.dateFrom) &&
      (!f.dateTo || !row.service_end_date || row.service_end_date <= f.dateTo) &&
      (f.client === 'all' || row.client_id === f.client || row.client_name === f.client) &&
      (f.country === 'all' || row.country === f.country) &&
      (f.status === 'all' || row.renewal_status === f.status) &&
      (f.agreement === 'all' || row.agreement_number === f.agreement) &&
      (f.owner === 'all' || row.owner === f.owner)
    );
    this.render();
  },

  activeFilters() {
    const f = this.state.filters;
    return [
      ['Service end from', f.dateFrom],
      ['Service end to', f.dateTo],
      ['Client', f.client],
      ['Country', f.country],
      ['Status', f.status],
      ['Agreement', f.agreement],
      ['Owner', f.owner]
    ].filter(([, value]) => value && value !== 'all').map(([label, value]) => `${label}: ${value}`);
  },

  emptyState() {
    const message = this.state.rows.length
      ? 'No renewal opportunities match your filters.'
      : 'No renewal forecast rows found.';
    const filters = this.activeFilters();
    return `${message}${filters.length ? `<br><span class="rf-muted">Active filters: ${filters.map(filter => U.escapeHtml(filter)).join(' · ')}</span>` : '<br><span class="rf-muted">Active filters: none</span>'}`;
  },

  summary() {
    const rows = this.filtered().filter(row => !row._summaryOnly);
    const actionableRows = rows.filter(row => row.renewal_status !== 'no_renewal_needed');
    const today = this.today();
    const month = this.monthKey(today);
    const d30 = this.addDays(30);
    const d90 = this.addDays(90);
    if (rows.length) {
      return {
        month: actionableRows.filter(row => this.monthKey(row.service_end_date) === month).length,
        next30: actionableRows.filter(row => row.service_end_date >= today && row.service_end_date <= d30).length,
        next90: actionableRows.filter(row => row.service_end_date >= today && row.service_end_date <= d90).length,
        value: actionableRows.reduce((sum, row) => sum + this.n(row.expected_renewal_amount), 0),
        overdue: actionableRows.filter(row => row.service_end_date < today && row.renewal_status !== 'renewed').length,
        noRenewalNeeded: rows.filter(row => row.renewal_status === 'no_renewal_needed').length
      };
    }
    const summaries = this.monthlyRows();
    return {
      month: summaries.find(row => this.monthKey(row.month) === month)?.locations || 0,
      next30: 0,
      next90: 0,
      value: summaries.reduce((sum, row) => sum + this.n(row.value), 0),
      overdue: summaries.reduce((sum, row) => sum + this.n(row.overdue), 0),
      noRenewalNeeded: summaries.reduce((sum, row) => sum + this.n(row.noRenewalNeeded), 0)
    };
  },

  monthlyRows() {
    const rows = this.filtered();
    if (!rows.length && this.state.monthSummaries.length) {
      return this.state.monthSummaries.map(summary => ({
        month: this.monthKey(summary.renewal_month),
        clients: { size: summary.client_count },
        locations: summary.location_count,
        value: summary.expected_renewal_value,
        renewed: summary.renewed_count,
        pending: summary.pending_count,
        overdue: summary.overdue_count,
        noRenewalNeeded: summary.no_renewal_needed_count
      })).sort((a, b) => a.month.localeCompare(b.month));
    }

    const groups = new Map();
    rows.forEach(row => {
      const month = this.monthKey(row.renewal_month || row.service_end_date);
      if (!month) return;
      if (!groups.has(month)) groups.set(month, { month, clients: new Set(), locations: 0, value: 0, renewed: 0, pending: 0, overdue: 0, noRenewalNeeded: 0 });
      const group = groups.get(month);
      group.clients.add(row.client_id || row.client_name);
      group.locations += this.n(row._summaryOnly ? row.location_count : 1) || 1;
      if (row.renewal_status !== 'no_renewal_needed') group.value += this.n(row.expected_renewal_amount);
      if (row.renewal_status === 'renewed') group.renewed++;
      else if (row.renewal_status === 'no_renewal_needed') group.noRenewalNeeded++;
      else group.pending++;
      if (row.service_end_date < this.today() && !['renewed', 'no_renewal_needed'].includes(row.renewal_status)) group.overdue++;
    });
    return [...groups.values()].sort((a, b) => a.month.localeCompare(b.month));
  },

  populateSelect(id, values, current, label) {
    const select = document.getElementById(id);
    if (!select) return;
    const unique = [...new Set(values.filter(Boolean))].sort();
    select.innerHTML = `<option value="all">All ${label}</option>` + unique.map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(value)}</option>`).join('');
    select.value = unique.includes(current) ? current : 'all';
  },

  populateFilters() {
    this.populateSelect('renewalForecastClientFilter', this.state.rows.map(row => row.client_id || row.client_name), this.state.filters.client, 'clients');
    this.populateSelect('renewalForecastCountryFilter', this.state.rows.map(row => row.country), this.state.filters.country, 'countries');
    this.populateSelect('renewalForecastAgreementFilter', this.state.rows.map(row => row.agreement_number), this.state.filters.agreement, 'agreements');
    this.populateSelect('renewalForecastOwnerFilter', this.state.rows.map(row => row.owner), this.state.filters.owner, 'owners');
  },

  canCreateInvoice() {
    return this.hasPermission('create_renewal_invoice');
  },

  statusBadge(status) {
    const normalized = this.statusKey(status);
    const canonical = ({
      renewed_manually: 'renewed',
      renewed: 'renewed',
      no_renewal_needed: 'no-renewal',
      no_renewal: 'no-renewal',
      cancelled: 'canceled',
      canceled: 'canceled',
      overdue: 'overdue',
      due_soon: 'pending',
      pending: 'pending',
      upcoming: 'upcoming',
      expired: 'canceled'
    })[normalized] || 'pending';
    const label = (canonical === 'no-renewal' ? 'No Renewal Needed' : canonical).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<span class="rf-status-badge rf-status-${canonical}">${U.escapeHtml(label || 'Upcoming')}</span>`;
  },


  setupShell() {
    const view = document.getElementById('renewalForecastView');
    if (!view || view.dataset.rfShellReady) return;
    view.dataset.rfShellReady = '1';
    view.classList.add('renewal-forecast-page', 'monthly-renewal-shell');
    const header = view.querySelector('.pf-page-header');
    if (header) {
      header.className = 'renewal-forecast-header';
      const eyebrow = header.querySelector('.pf-eyebrow');
      if (eyebrow) eyebrow.className = 'renewal-forecast-eyebrow';
      const actions = header.querySelector('.pf-header-actions');
      if (actions) actions.className = 'renewal-forecast-header-actions';
      const refresh = document.getElementById('renewalForecastRefreshBtn');
      const exportBtn = document.getElementById('renewalForecastExportBtn');
      if (refresh) refresh.className = 'rf-action-btn';
      if (exportBtn) exportBtn.className = 'rf-primary-btn';
    }
    const filter = view.querySelector('section[aria-label="Renewal forecast filters"]');
    if (filter) {
      filter.className = 'rf-filter-card';
      const grid = filter.querySelector('.pf-filter-grid');
      if (grid) grid.className = 'rf-filter-grid';
      filter.querySelectorAll('input, select').forEach(el => el.classList.add(el.tagName === 'SELECT' ? 'rf-select' : 'rf-input'));
      const ids = [['renewalForecastDateFrom','Start Date'],['renewalForecastDateTo','End Date'],['renewalForecastClientFilter','Client'],['renewalForecastCountryFilter','Country'],['renewalForecastStatusFilter','Status'],['renewalForecastAgreementFilter','Agreement'],['renewalForecastOwnerFilter','Owner']];
      ids.forEach(([id,label]) => { const el = document.getElementById(id); if (el && !el.closest('.rf-filter-field')) { const wrap = document.createElement('label'); wrap.className = 'rf-filter-field'; wrap.innerHTML = `<span>${label}</span>`; el.parentNode.insertBefore(wrap, el); wrap.appendChild(el); } });
      const quick = filter.querySelector('.pf-quick-filters');
      if (quick) quick.className = 'rf-filter-actions';
      const clear = document.getElementById('renewalForecastClearBtn');
      if (clear) clear.className = 'rf-action-btn';
    }
    if (document.getElementById('renewalForecastState')) document.getElementById('renewalForecastState').className = 'rf-state';
    if (document.getElementById('renewalForecastBody')) document.getElementById('renewalForecastBody').className = 'renewal-forecast-content';
  },

  renderSummary() {
    const el = document.getElementById('renewalForecastSummary');
    if (!el) return;
    if (this.state.loading) {
      el.className = 'renewal-forecast-kpi-grid';
      el.innerHTML = Array.from({ length: 6 }, () => '<article class="rf-kpi-card rf-skeleton-card" aria-hidden="true"></article>').join('');
      return;
    }
    const s = this.summary();
    const cards = [
      ['📅', 'Renewals This Month', s.month || 0, 'Current calendar month', 'primary'],
      ['⏱️', 'Upcoming 30 Days', s.next30 || 0, 'Due from today through 30 days', 'warning'],
      ['🗓️', 'Upcoming 90 Days', s.next90 || 0, 'Near-term renewal pipeline', 'purple'],
      ['💵', 'Expected Renewal Value', this.money(s.value || 0), 'Filtered expected value', 'success'],
      ['⚠️', 'Overdue Renewals', s.overdue || 0, 'Past service end and not renewed', 'danger'],
      ['✅', 'No Renewal Needed', s.noRenewalNeeded || 0, 'Manually excluded opportunities', 'muted']
    ];
    el.className = 'renewal-forecast-kpi-grid';
    el.innerHTML = cards.map(([icon, label, value, helper, tone]) => `<article class="rf-kpi-card rf-kpi-${tone}"><div class="rf-kpi-icon" aria-hidden="true">${icon}</div><div><div class="rf-kpi-label">${U.escapeHtml(label)}</div><div class="rf-kpi-value">${U.escapeHtml(String(value ?? 0))}</div><div class="rf-kpi-helper">${U.escapeHtml(helper)}</div></div></article>`).join('');
  },

  pagination(page, total) {
    const totalPages = Math.max(1, Math.ceil(total / this.PAGE_SIZE));
    const currentPage = Math.min(Math.max(1, this.n(page) || 1), totalPages);
    const startIndex = (currentPage - 1) * this.PAGE_SIZE;
    return {
      currentPage,
      totalPages,
      start: total === 0 ? 0 : startIndex + 1,
      end: Math.min(startIndex + this.PAGE_SIZE, total),
      rowsStart: startIndex,
      rowsEnd: startIndex + this.PAGE_SIZE
    };
  },

  renderPagination(scope, page, total, noun = 'renewals') {
    const data = this.getRenewalForecastPaginatedRows({ rows: Array.from({ length: total }, (_, index) => index), page, pageSize: this.PAGE_SIZE });
    return `<div class="rf-pagination" aria-label="Monthly renewal forecast pagination"><div class="rf-pagination-showing">Showing ${data.startItem}–${data.endItem} of ${total} ${noun}</div><span class="rf-pagination-size">${this.PAGE_SIZE} rows per page</span><button class="rf-action-btn" type="button" data-rf-page="previous" data-rf-page-scope="${scope}" ${data.page <= 1 ? 'disabled' : ''}>Previous</button><span class="rf-page-number">Page ${data.page} of ${data.totalPages}</span><button class="rf-action-btn" type="button" data-rf-page="next" data-rf-page-scope="${scope}" ${data.page >= data.totalPages ? 'disabled' : ''}>Next</button></div>`;
  },

  render() {
    if (!this.hasPermission('view')) { this.renderAccessDenied(); return; }
    this.setupShell();
    const state = document.getElementById('renewalForecastState');
    const body = document.getElementById('renewalForecastBody');
    if (!state || !body) return;
    this.renderSummary();

    if (this.state.loading) {
      state.textContent = 'Loading Monthly Renewal Forecast…';
      body.innerHTML = `<section class="rf-table-card"><div class="rf-table-heading"><div><h3>Monthly Renewal Opportunities</h3><p>Grouped by Annual SaaS service end month.</p></div></div><div class="rf-table-wrap"><table class="rf-table"><tbody>${Array.from({ length: 6 }, () => '<tr class="rf-skeleton-row"><td colspan="9"></td></tr>').join('')}</tbody></table></div></section>`;
      return;
    }
    if (this.state.error) {
      state.textContent = 'Unable to load Monthly Renewal Forecast. Please refresh.';
      body.innerHTML = '<section class="rf-error-card">Unable to load Monthly Renewal Forecast. Please refresh.</section>';
      return;
    }

    const months = this.monthlyRows();
    const paginated = this.getRenewalForecastPaginatedRows({ rows: months, sortFn: (a, b) => a.month.localeCompare(b.month), page: this.state.overviewPage, pageSize: this.PAGE_SIZE });
    this.state.overviewPage = paginated.page;
    const warning = this.state.warning ? ` · ${this.state.warning}` : '';
    state.textContent = `${this.filtered().length} renewal opportunities from invoice SaaS service end dates.${warning}`;
    body.innerHTML = `<section class="rf-table-card"><div class="rf-table-heading"><div><h3>Monthly Renewal Opportunities</h3><p>Grouped by Annual SaaS service end month.</p></div></div><div class="rf-table-wrap"><table class="rf-table"><thead><tr><th>Month</th><th>Number of Clients</th><th>SaaS Rows / Locations</th><th>Expected Renewal Value</th><th>Renewed Count</th><th>Pending Count</th><th>Overdue Count</th><th>No Renewal Needed</th><th>Actions</th></tr></thead><tbody>${paginated.rows.length ? paginated.rows.map(group => `<tr class="rf-clickable-row" data-rf-month="${U.escapeAttr(group.month)}" tabindex="0"><td><strong>${U.escapeHtml(this.formatMonth(group.month))}</strong><small>${U.escapeHtml(group.month)}</small></td><td>${group.clients.size}</td><td>${group.locations}</td><td class="rf-money">${this.money(group.value)}</td><td>${this.countBadge('renewed', group.renewed)}</td><td>${this.countBadge('pending', group.pending)}</td><td>${this.countBadge('overdue', group.overdue)}</td><td>${this.countBadge('no-renewal', group.noRenewalNeeded || 0)}</td><td><button class="rf-ghost-btn" type="button" data-rf-month="${U.escapeAttr(group.month)}">View details</button></td></tr>`).join('') : `<tr><td colspan="9" class="rf-empty">${this.emptyState()}</td></tr>`}</tbody></table></div>${this.renderPagination('overview', paginated.page, months.length, 'months')}</section>`;
  },

  countBadge(type, value) {
    return `<span class="rf-status-badge rf-status-${type}">${this.n(value)}</span>`;
  },

  detailStatus(row) {
    const manual = row.manual_renewal || row.manual_no_renewal_needed;
    const context = row.manual_no_renewal_needed ? row.no_renewal_needed_reason : row.manual_renewal_agreement_ref;
    return `${this.statusBadge(row.renewal_status)}${manual ? `<div><span class="rf-status-badge rf-status-pending">Manual</span>${context ? ` <span class="rf-muted">· ${U.escapeHtml(context)}</span>` : ''}</div>` : ''}`;
  },

  detailActions(row) {
    if (!this.hasPermission('view_details')) return '';
    const canFollowUp = ['upcoming', 'due_soon', 'overdue'].includes(row.renewal_status);
    const canMarkRenewed = canFollowUp && this.hasPermission('mark_renewed');
    const canMarkNoRenewal = canFollowUp && this.hasPermission('mark_no_renewal_needed');
    const canUndo = this.hasPermission('undo_override');
    return `<div class="rf-actions">${canFollowUp && this.canCreateInvoice() ? `<button class="rf-primary-btn" data-rf-action="renew" data-id="${U.escapeAttr(row.opportunity_id)}">Renew</button>` : ''}${canMarkRenewed ? `<button class="rf-action-btn" data-rf-action="manual-renewed" data-id="${U.escapeAttr(row.opportunity_id)}">Mark Renewed</button>` : ''}${canMarkNoRenewal ? `<button class="rf-action-btn" data-rf-action="no-renewal-needed" data-id="${U.escapeAttr(row.opportunity_id)}" ${this.state.actionLoadingId === this.renewalRowKey(row) ? 'disabled' : ''}>${this.state.actionLoadingId === this.renewalRowKey(row) ? 'Saving...' : 'Mark as No Renewal Needed'}</button>` : ''}${row.manual_renewal && canUndo ? `<button class="rf-action-btn" data-rf-action="unmark-renewed" data-id="${U.escapeAttr(row.opportunity_id)}">Unmark Renewed</button>` : ''}${row.manual_no_renewal_needed && canUndo ? `<button class="rf-action-btn" data-rf-action="undo-no-renewal-needed" data-id="${U.escapeAttr(row.opportunity_id)}">Undo No Renewal Needed</button>` : ''}<button class="rf-action-btn" data-rf-action="agreement" data-id="${U.escapeAttr(row.opportunity_id)}">View Agreement</button><button class="rf-action-btn" data-rf-action="client" data-id="${U.escapeAttr(row.opportunity_id)}">View Client</button>${canFollowUp && this.canCreateInvoice() ? `<button class="rf-action-btn" data-rf-action="invoice" data-id="${U.escapeAttr(row.opportunity_id)}">Create Renewal Invoice</button>` : ''}</div>${row.manual_renewal_note ? `<div class="rf-muted">Note: ${U.escapeHtml(row.manual_renewal_note)}</div>` : ''}${row.no_renewal_needed_note ? `<div class="rf-muted">Note: ${U.escapeHtml(row.no_renewal_needed_note)}</div>` : ''}`;
  },

  renderMonthDetails() {
    const content = document.getElementById('renewalForecastDetailsContent');
    if (!content) return;
    const rows = this.state.detailRows;
    if (!rows.length) {
      content.innerHTML = '<div class="rf-empty">No renewal opportunities match your filters.</div>';
      return;
    }

    const paginated = this.getRenewalForecastPaginatedRows({ rows, sortFn: (a, b) => this.getRenewalForecastServiceEnd(a).localeCompare(this.getRenewalForecastServiceEnd(b)), page: this.state.detailPage, pageSize: this.PAGE_SIZE });
    this.state.detailPage = paginated.page;
    const totalClients = new Set(rows.map(row => row.client_id || this.getRenewalForecastClientName(row)).filter(Boolean)).size;
    const totalLocations = rows.length;
    const expectedValue = rows.reduce((sum, row) => sum + this.getRenewalForecastValue(row), 0);
    const monthName = this.formatMonth(this.state.selectedMonth);
    content.innerHTML = `<div class="rf-detail-summary"><button class="rf-ghost-btn" type="button" data-rf-close-details>← Back to monthly summary</button><div><span>Month</span><strong>${U.escapeHtml(monthName)}</strong></div><div><span>Total clients</span><strong>${totalClients}</strong></div><div><span>Total locations</span><strong>${totalLocations}</strong></div><div><span>Expected value</span><strong>${this.money(expectedValue, rows[0]?.currency || 'USD')}</strong></div></div><div class="rf-table-wrap"><table class="rf-table rf-detail-table"><thead><tr><th>Client / Company</th><th>Agreement #</th><th>Invoice #</th><th>Location / SaaS Row</th><th>Service Start</th><th>Service End</th><th>Renewal Status</th><th>Expected Renewal Value</th><th>Owner</th><th>Actions</th></tr></thead><tbody>${paginated.rows.map(row => `<tr><td><strong>${U.escapeHtml(this.getRenewalForecastClientName(row))}</strong></td><td>${U.escapeHtml(this.getRenewalForecastAgreementNumber(row))}</td><td>${U.escapeHtml(this.getRenewalForecastInvoiceNumber(row))}</td><td>${U.escapeHtml(row.location_name || row.item_description || 'Annual SaaS')}</td><td>${this.formatDate(this.getRenewalForecastServiceStart(row))}</td><td>${this.formatDate(this.getRenewalForecastServiceEnd(row))}</td><td>${this.detailStatus(row)}</td><td class="rf-money">${this.money(this.getRenewalForecastValue(row), row.currency)}</td><td>${U.escapeHtml(this.getRenewalForecastOwner(row))}</td><td>${this.detailActions(row)}</td></tr>`).join('')}</tbody></table></div>${this.renderPagination('details', paginated.page, rows.length)}`;
  },

  async openMonth(month) {
    if (!this.requirePermission('view_details', 'You do not have permission to view renewal details.')) return;
    this.state.selectedMonth = month;
    this.state.detailPage = 1;
    this.state.detailRows = [];
    const drawer = document.getElementById('renewalForecastDetailsDrawer');
    const title = document.getElementById('renewalForecastDetailsTitle');
    const content = document.getElementById('renewalForecastDetailsContent');
    if (!drawer || !content) return;

    title.textContent = `${this.formatMonth(month)} Renewal Details`;
    const drawerPanel = drawer.querySelector('.payment-forecast-details-panel');
    if (drawerPanel) drawerPanel.classList.add('renewal-forecast-details-panel');
    drawer.querySelectorAll('.pf-eyebrow').forEach(el => { el.className = 'renewal-forecast-eyebrow'; });
    drawer.querySelectorAll('.payment-forecast-details-header').forEach(el => { el.classList.add('renewal-forecast-details-header'); });
    drawer.querySelectorAll('[data-rf-close-details]').forEach(el => { if (el.tagName === 'BUTTON' && !el.classList.contains('payment-forecast-details-backdrop')) el.className = 'rf-action-btn'; });
    content.innerHTML = '<div class="rf-empty">Loading renewal details…</div>';
    drawer.hidden = false;
    document.body.classList.add('pf-modal-open');

    let rows = this.filtered().filter(row => this.monthKey(row.service_end_date || row.renewal_month) === month && !row._summaryOnly);
    if (!rows.length) {
      try {
        rows = this.mergeOverrides(await this.fetchMonthDetails(`${month}-01`));
      } catch (error) {
        content.innerHTML = `<div class="rf-error-card">${U.escapeHtml(error.message || 'Unable to load renewal details.')}</div>`;
        return;
      }
    }

    this.state.detailRows = rows;
    this.renderMonthDetails();
  },

  closeDrawer() {
    this.state.detailPage = 1;
    this.state.detailRows = [];
    const drawer = document.getElementById('renewalForecastDetailsDrawer');
    if (drawer) drawer.hidden = true;
    document.body.classList.remove('pf-modal-open');
  },

  async action(action, id) {
    if (!this.requirePermission('view_details', 'You do not have permission to view renewal details.')) return;
    const row = this.state.detailRows.find(item => item.opportunity_id === id) || this.state.rows.find(item => item.opportunity_id === id) || Object.values(this.state.detailsCache).flat().find(item => item.opportunity_id === id);
    if (!row) return;
    if (action === 'manual-renewed') return this.markManualRenewed(row);
    if (action === 'unmark-renewed') return this.unmarkManualRenewed(row);
    if (action === 'no-renewal-needed') return this.openNoRenewalNeededModal(row);
    if (action === 'undo-no-renewal-needed') return this.undoNoRenewalNeeded(row);
    if (action === 'agreement') return window.Agreements?.openAgreementFormById?.(row.agreement_uuid || row.agreement_number, { readOnly: true });
    if (action === 'client') { window.setActiveView?.('clients'); return UI.toast(`Client: ${row.client_name}`); }
    if (['invoice', 'renew'].includes(action) && !this.canCreateInvoice()) return UI.toast('You do not have permission to create renewal invoices.');
    if (['invoice', 'renew'].includes(action)) {
      if (window.Clients?.openRenewalFlow_) {
        return Clients.openRenewalFlow_([{ ...row, row_id: row.opportunity_id, agreement_id: row.agreement_uuid || row.agreement_number, annual_license_price: row.current_annual_price || row.current_invoice_row_amount, discount_percent: row.current_discount }]);
      }
      return window.Agreements?.openAgreementFormById?.(row.agreement_uuid || row.agreement_number, { readOnly: false });
    }
  },

  exportCsv() {
    if (!this.requirePermission('export', 'You do not have permission to export Monthly Renewal Forecast.')) return;
    const header = ['Client Name','Invoice Number','Agreement Number','SaaS Item / Location Name','Service Start Date','Service End Date','Days Until Renewal','Current Invoice SaaS Row Amount','Current Annual Price','Current Discount','Expected Renewal Amount','Renewal Status','Manual Renewal','Manual Renewal Agreement','Manual Renewal Invoice','Manual Renewal Note','No Renewal Needed Reason','No Renewal Needed Note'];
    const values = this.filtered().map(row => [row.client_name,row.invoice_number,row.agreement_number,row.location_name,row.service_start_date,row.service_end_date,row.days_until_renewal,row.current_invoice_row_amount,row.current_annual_price,row.current_discount,row.expected_renewal_amount,row.renewal_status,row.manual_renewal ? 'Yes' : 'No',row.manual_renewal_agreement_ref,row.manual_renewal_invoice_ref,row.manual_renewal_note,row.no_renewal_needed_reason,row.no_renewal_needed_note]);
    const csv = [header, ...values].map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `monthly-renewal-forecast-${this.today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  },

  wire() {
    if (this._wired) return;
    this._wired = true;
    document.getElementById('renewalForecastRefreshBtn')?.addEventListener('click', () => this.refresh());
    document.getElementById('renewalForecastExportBtn')?.addEventListener('click', () => this.exportCsv());
    document.getElementById('renewalNoNeededConfirmBtn')?.addEventListener('click', () => this.confirmNoRenewalNeeded());
    document.getElementById('renewalForecastClearBtn')?.addEventListener('click', () => {
      const range = this.defaultDateRange();
      this.state.filters = { dateFrom: range.dateFrom, dateTo: range.dateTo, client: 'all', country: 'all', status: 'all', agreement: 'all', owner: 'all' };
      this.syncDateInputs();
      ['renewalForecastClientFilter','renewalForecastCountryFilter','renewalForecastStatusFilter','renewalForecastAgreementFilter','renewalForecastOwnerFilter'].forEach(id => { const el = document.getElementById(id); if (el) el.value = 'all'; });
      this.refresh();
    });
    [['renewalForecastDateFrom','dateFrom'],['renewalForecastDateTo','dateTo']].forEach(([id, key]) => document.getElementById(id)?.addEventListener('change', event => {
      this.state.filters[key] = event.target.value;
      this.refresh();
    }));
    [['renewalForecastClientFilter','client'],['renewalForecastCountryFilter','country'],['renewalForecastStatusFilter','status'],['renewalForecastAgreementFilter','agreement'],['renewalForecastOwnerFilter','owner']].forEach(([id, key]) => document.getElementById(id)?.addEventListener('change', event => {
      this.state.filters[key] = event.target.value;
      this.applyFilters();
    }));
    document.addEventListener('click', event => {
      const pageButton = event.target.closest('[data-rf-page]');
      if (pageButton) {
        const scope = pageButton.dataset.rfPageScope;
        const pageKey = scope === 'details' ? 'detailPage' : 'overviewPage';
        const total = scope === 'details' ? this.state.detailRows.length : this.monthlyRows().length;
        const pagination = this.pagination(this.state[pageKey], total);
        this.state[pageKey] = pageButton.dataset.rfPage === 'previous'
          ? Math.max(1, pagination.currentPage - 1)
          : Math.min(pagination.totalPages, pagination.currentPage + 1);
        return scope === 'details' ? this.renderMonthDetails() : this.render();
      }
      const closeNoNeeded = event.target.closest('[data-rf-close-no-needed]');
      if (closeNoNeeded) return this.closeNoRenewalNeededModal();
      const close = event.target.closest('[data-rf-close-details]');
      if (close) return this.closeDrawer();
      const month = event.target.closest('[data-rf-month]')?.dataset.rfMonth;
      if (month) return this.openMonth(month);
      const action = event.target.closest('[data-rf-action]');
      if (action) return this.action(action.dataset.rfAction, action.dataset.id);
    });
  }
};

window.RenewalForecast = RenewalForecast;
