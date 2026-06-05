const PaymentForecast = {
  tabs: ['overview', 'upcoming', 'overdue', 'client_distribution', 'monthly_forecast', 'collection_follow_up'],
  tabAliases: { clients: 'client_distribution', monthly: 'monthly_forecast', followup: 'collection_follow_up' },
  followUpStatuses: ['not_started', 'contacted', 'promised_to_pay', 'disputed', 'escalated', 'closed'],
  pageSizes: [10],
  fixedPageSize: 10,
  state: {
    activeTab: 'overview',
    summary: null,
    rowsByTab: {
      overview: [],
      upcoming: [],
      overdue: [],
      client_distribution: [],
      monthly_forecast: [],
      collection_follow_up: []
    },
    pagination: {
      overview: { page: 1, pageSize: 10, total: 0 },
      upcoming: { page: 1, pageSize: 10, total: 0 },
      overdue: { page: 1, pageSize: 10, total: 0 },
      client_distribution: { page: 1, pageSize: 10, total: 0 },
      monthly_forecast: { page: 1, pageSize: 10, total: 0 },
      collection_follow_up: { page: 1, pageSize: 10, total: 0 }
    },
    loading: { summary: false, rows: false },
    filters: {
      search: '', status: 'all', client: 'all', paymentTerm: 'all', currency: 'all',
      dateFrom: '', dateTo: '', overdueOnly: false, dueThisWeek: false, dueThisMonth: false,
      onlyUnpaid: false, followUpStatus: 'all'
    },
    followups: [], summaryError: '', rowsError: ''
  },
  text(value) { return String(value ?? '').trim(); },
  n(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; },
  date(value) { return this.text(value).slice(0, 10); },
  today() { return new Date().toISOString().slice(0, 10); },
  addDays(days) { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); },
  money(value, currency = 'USD') { return `${this.text(currency || 'USD').toUpperCase()} ${U.fmtNumber(this.n(value))}`; },
  canonicalTab(tab = this.state.activeTab) { return this.tabAliases[tab] || tab; },
  activePagination() { return this.state.pagination[this.canonicalTab()] || null; },
  resetPages() { Object.values(this.state.pagination).forEach(pagination => { pagination.page = 1; }); },
  canView() { return !window.Permissions || Permissions.can('payment_forecast', 'view') || Permissions.can('payment_forecast', 'manage') || Permissions.hasAdminOverride?.(); },
  canManage() { return !window.Permissions || Permissions.can('payment_forecast', 'manage') || Permissions.hasAdminOverride?.(); },
  canExport() { return this.canManage() || !window.Permissions || Permissions.can('payment_forecast', 'export'); },
  canCreateReceipt() { return this.canManage() || !window.Permissions || Permissions.can('payment_forecast', 'create_receipt'); },
  getClient() { const client = window.SupabaseClient?.getClient?.(); if (!client) throw new Error('Supabase is not configured.'); return client; },
  async fetchTable(table, orderColumn = null, ascending = true, limit = 3000) {
    let query = this.getClient().from(table).select('*').limit(limit);
    if (orderColumn) query = query.order(orderColumn, { ascending, nullsFirst: false });
    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },
  followupKey(row) { return `${row.invoice_id || row.invoice_number || ''}::${row.payment_no || ''}`; },
  normalizeRow(row = {}) {
    const due = this.date(row.scheduled_due_date || row.due_date);
    const remaining = this.n(row.remaining_amount);
    let status = this.text(row.forecast_status || row.status || 'scheduled').toLowerCase() || 'scheduled';
    if (remaining <= 0 && this.n(row.allocated_credit_amount) > 0 && this.n(row.paid_amount) <= 0) status = 'credited';
    else if (remaining <= 0) status = 'paid';
    else if (due && due < this.today()) status = 'overdue';
    else if (due && due <= this.addDays(7)) status = 'due_soon';
    const followup = this.state.followups.find(item => `${item.invoice_id || item.invoice_number || ''}::${item.schedule_no || ''}` === `${row.invoice_id || row.invoice_number || ''}::${row.payment_no || row.schedule_no || ''}`) || {};
    return {
      ...row, ...followup,
      forecast_row_id: this.text(row.forecast_row_id || `${row.invoice_id || row.invoice_number || ''}-${row.payment_no || row.schedule_no || ''}`),
      invoice_id: this.text(row.invoice_id), invoice_number: this.text(row.invoice_number || row.invoice_business_id || row.invoice_id),
      agreement_number: this.text(row.agreement_number || row.agreement_id),
      client_id: this.text(row.client_id || row.company_id), client_name: this.text(row.client_name || row.customer_name || row.company_name || 'Unknown Client'),
      scheduled_due_date: due, payment_no: this.text(row.payment_no || row.schedule_no), payment_term: this.text(row.payment_term || row.schedule_label),
      currency: this.text(row.currency || 'USD') || 'USD', scheduled_amount: this.n(row.scheduled_amount), paid_amount: this.n(row.paid_amount),
      allocated_credit_amount: this.n(row.allocated_credit_amount), remaining_amount: remaining, forecast_status: status,
      follow_up_status: this.text(followup.follow_up_status || row.follow_up_status || 'not_started') || 'not_started'
    };
  },
  rpcFilters(tab = this.state.activeTab) {
    const value = key => this.state.filters[key] === 'all' ? null : this.state.filters[key];
    return {
      p_search: this.text(this.state.filters.search) || null,
      p_status: value('status'), p_client: value('client'), p_payment_term: value('paymentTerm'), p_currency: value('currency'),
      p_date_from: this.state.filters.dateFrom || null, p_date_to: this.state.filters.dateTo || null,
      p_overdue_only: Boolean(this.state.filters.overdueOnly), p_due_this_week: Boolean(this.state.filters.dueThisWeek),
      p_due_this_month: Boolean(this.state.filters.dueThisMonth), p_only_unpaid: Boolean(this.state.filters.onlyUnpaid),
      p_follow_up_status: value('followUpStatus'), p_view: this.canonicalTab(tab)
    };
  },
  clearTabBody() {
    const body = document.getElementById('paymentForecastTabBody');
    if (body) body.innerHTML = '';
    const pagination = document.getElementById('paymentForecastPagination');
    if (pagination) { pagination.innerHTML = ''; pagination.style.display = 'none'; }
  },
  clearTabRows(tab = this.canonicalTab()) {
    if (this.state.rowsByTab[tab]) this.state.rowsByTab[tab] = [];
    this.state.rowsError = '';
  },
  async loadPage({ renderLoading = true } = {}) {
    const tab = this.canonicalTab();
    const pagination = this.state.pagination[tab];
    if (!pagination || !['overview', 'upcoming', 'overdue'].includes(tab)) return;
    const requestId = (this._rowsRequestId || 0) + 1;
    this._rowsRequestId = requestId;
    this.state.loading.rows = true;
    this.state.rowsError = '';
    this.state.rowsByTab[tab] = [];
    console.log('[PaymentForecast] loading source', 'get_payment_forecast_page');
    if (renderLoading) this.renderActiveTab();
    try {
      const pageFilters = this.rpcFilters(tab);
      if (tab === 'overview') pageFilters.p_view = 'all';
      const data = await Api.getPaymentForecastPage({ ...pageFilters, p_page: pagination.page, p_page_size: this.fixedPageSize });
      if (requestId !== this._rowsRequestId || tab !== this.canonicalTab()) return;
      const items = Array.isArray(data) ? data : [];
      const rows = items.map(item => item?.row_data).filter(Boolean).map(row => this.normalizeRow(row));
      const total = this.n(items[0]?.total_count);
      console.log('[PaymentForecast] rows', rows.length, 'total', total);
      pagination.total = total;
      if (!rows.length && total > 0 && pagination.page > 1) { pagination.page = 1; return this.loadPage({ renderLoading: false }); }
      this.state.rowsByTab[tab] = rows;
      this.populateFilters(rows);
    } catch (error) {
      if (requestId !== this._rowsRequestId) return;
      console.error('[PaymentForecast] page load failed', error);
      this.state.rowsByTab[tab] = [];
      pagination.total = 0;
      this.state.rowsError = error.message || 'Unable to load payment forecast.';
      UI.toast(this.state.rowsError);
    } finally {
      if (requestId === this._rowsRequestId) { this.state.loading.rows = false; this.renderActiveTab(); }
    }
  },
  summaryMetric(summary, key) {
    const value = summary?.[key];
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  },
  normalizeSummary(data) {
    const summary = Array.isArray(data) ? (data?.[0] || {}) : (data || {});
    const values = summary.summary_data || summary.row_data || summary;
    return {
      scheduled_rows: this.summaryMetric(values, 'scheduled_rows'),
      gross_scheduled: this.summaryMetric(values, 'gross_scheduled'),
      paid_amount: this.summaryMetric(values, 'paid_amount'),
      credit_adjusted: this.summaryMetric(values, 'credit_adjusted'),
      remaining_forecast: this.summaryMetric(values, 'remaining_forecast'),
      overdue_amount: this.summaryMetric(values, 'overdue_amount'),
      due_this_week: this.summaryMetric(values, 'due_this_week'),
      due_this_month: this.summaryMetric(values, 'due_this_month'),
      next_30_days: this.summaryMetric(values, 'next_30_days'),
      next_90_days: this.summaryMetric(values, 'next_90_days'),
      collection_risk_percent: this.summaryMetric(values, 'collection_risk_percent'),
      currency: this.text(values.currency || values.display_currency || 'USD') || 'USD'
    };
  },
  normalizeGroupedRow(row = {}, type) {
    const source = row.row_data || row;
    return {
      ...source,
      client_id: this.text(source.client_id || source.company_id),
      client_name: this.text(source.client_name || source.client || source.customer_name || 'Unknown Client'),
      forecast_month: this.text(source.forecast_month || source.month || source.month_start || source.due_month),
      currency: this.text(source.currency || 'USD') || 'USD',
      scheduled_payment_count: this.n(source.scheduled_payment_count),
      invoice_count: this.n(source.invoice_count),
      gross_scheduled_amount: this.n(source.gross_scheduled_amount),
      paid_amount: this.n(source.paid_amount),
      credit_adjustment_amount: this.n(source.credit_adjustment_amount),
      net_expected_amount: this.n(source.net_expected_amount),
      overdue_amount: this.n(source.overdue_amount),
      due_soon_amount: this.n(source.due_soon_amount),
      next_due_date: this.date(source.next_due_date),
      group_type: type
    };
  },
  hasSummaryData() {
    const summary = this.state.summary || {};
    return ['scheduled_rows','gross_scheduled','paid_amount','credit_adjusted','remaining_forecast','overdue_amount','due_this_week','due_this_month','next_30_days','next_90_days','collection_risk_percent']
      .some(key => summary[key] !== undefined && summary[key] !== null && summary[key] !== '');
  },
  async fetchAllForecastRows(filters = {}, maxPages = 50) {
    const rows = [];
    let page = 1;
    let total = Infinity;
    const baseFilters = { ...filters, p_view: 'all' };
    while (rows.length < total && page <= maxPages) {
      const data = await Api.getPaymentForecastPage({ ...baseFilters, p_page: page, p_page_size: 100 });
      const items = Array.isArray(data) ? data : [];
      if (!items.length) break;
      total = this.n(items[0]?.total_count);
      rows.push(...items.map(item => item?.row_data || item).filter(Boolean).map(row => this.normalizeRow(row)));
      if (total === 0 || rows.length >= total) break;
      page += 1;
    }
    return rows;
  },
  buildSummaryFromRows(rows = []) {
    const currency = rows.find(row => row.currency)?.currency || 'USD';
    const sum = field => rows.reduce((total, row) => total + this.n(row[field]), 0);
    const today = this.today();
    const next7 = this.addDays(7);
    const next30 = this.addDays(30);
    const next90 = this.addDays(90);
    const month = today.slice(0, 7);
    const remaining = sum('remaining_amount');
    const overdue = rows.reduce((total, row) => total + (row.forecast_status === 'overdue' ? this.n(row.remaining_amount) : 0), 0);
    return {
      scheduled_rows: rows.length,
      gross_scheduled: sum('scheduled_amount'),
      paid_amount: sum('paid_amount'),
      credit_adjusted: sum('allocated_credit_amount'),
      remaining_forecast: remaining,
      overdue_amount: overdue,
      due_this_week: rows.reduce((total, row) => total + (row.remaining_amount > 0 && row.scheduled_due_date >= today && row.scheduled_due_date <= next7 ? this.n(row.remaining_amount) : 0), 0),
      due_this_month: rows.reduce((total, row) => total + (row.remaining_amount > 0 && row.scheduled_due_date?.slice(0, 7) === month ? this.n(row.remaining_amount) : 0), 0),
      next_30_days: rows.reduce((total, row) => total + (row.remaining_amount > 0 && row.scheduled_due_date >= today && row.scheduled_due_date <= next30 ? this.n(row.remaining_amount) : 0), 0),
      next_90_days: rows.reduce((total, row) => total + (row.remaining_amount > 0 && row.scheduled_due_date >= today && row.scheduled_due_date <= next90 ? this.n(row.remaining_amount) : 0), 0),
      collection_risk_percent: remaining > 0 ? Number(((overdue / remaining) * 100).toFixed(2)) : 0,
      currency
    };
  },
  groupClientRows(rows = []) {
    const map = new Map();
    rows.forEach(row => {
      const key = `${row.client_id || row.client_name}::${row.currency}`;
      const current = map.get(key) || { client_name: row.client_name || 'Unknown Client', client_id: row.client_id || '', company_id: row.company_id || row.client_id || '', currency: row.currency || 'USD', scheduled_payment_count: 0, invoice_ids: new Set(), gross_scheduled_amount: 0, paid_amount: 0, credit_adjustment_amount: 0, net_expected_amount: 0, overdue_amount: 0, next_due_date: '' };
      current.scheduled_payment_count += 1;
      if (row.invoice_id || row.invoice_number) current.invoice_ids.add(row.invoice_id || row.invoice_number);
      current.gross_scheduled_amount += this.n(row.scheduled_amount);
      current.paid_amount += this.n(row.paid_amount);
      current.credit_adjustment_amount += this.n(row.allocated_credit_amount);
      current.net_expected_amount += this.n(row.remaining_amount);
      if (row.forecast_status === 'overdue') current.overdue_amount += this.n(row.remaining_amount);
      if (row.remaining_amount > 0 && row.scheduled_due_date && (!current.next_due_date || row.scheduled_due_date < current.next_due_date)) current.next_due_date = row.scheduled_due_date;
      map.set(key, current);
    });
    return [...map.values()].map(row => ({ ...row, invoice_count: row.invoice_ids.size })).sort((a, b) => this.n(b.net_expected_amount) - this.n(a.net_expected_amount) || this.n(b.overdue_amount) - this.n(a.overdue_amount) || a.client_name.localeCompare(b.client_name));
  },
  groupMonthlyRows(rows = []) {
    const map = new Map();
    rows.forEach(row => {
      const month = row.scheduled_due_date?.slice(0, 7) || 'Unknown';
      const key = `${month}::${row.currency}`;
      const current = map.get(key) || { forecast_month: month, currency: row.currency || 'USD', scheduled_payment_count: 0, gross_scheduled_amount: 0, paid_amount: 0, credit_adjustment_amount: 0, net_expected_amount: 0, overdue_amount: 0, due_soon_amount: 0 };
      current.scheduled_payment_count += 1;
      current.gross_scheduled_amount += this.n(row.scheduled_amount);
      current.paid_amount += this.n(row.paid_amount);
      current.credit_adjustment_amount += this.n(row.allocated_credit_amount);
      current.net_expected_amount += this.n(row.remaining_amount);
      if (row.forecast_status === 'overdue') current.overdue_amount += this.n(row.remaining_amount);
      if (row.forecast_status === 'due_soon') current.due_soon_amount += this.n(row.remaining_amount);
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => String(a.forecast_month).localeCompare(String(b.forecast_month)) || String(a.currency).localeCompare(String(b.currency)));
  },
  async loadSummary() {
    const requestId = (this._summaryRequestId || 0) + 1;
    this._summaryRequestId = requestId;
    this.state.loading.summary = true;
    this.state.summaryError = '';
    console.log('[PaymentForecast] loading source', 'get_payment_forecast_summary');
    this.renderActiveTab();
    try {
      const data = await Api.getPaymentForecastSummary(this.rpcFilters('overview'));
      if (requestId !== this._summaryRequestId) return;
      const summary = this.normalizeSummary(data);
      this.state.summary = summary;
      this.state.summaryError = '';
      if (!this.hasSummaryData()) {
        const fallbackRows = await this.fetchAllForecastRows(this.rpcFilters('overview'));
        if (requestId !== this._summaryRequestId) return;
        this.state.summary = this.buildSummaryFromRows(fallbackRows);
      }
    } catch (error) {
      if (requestId !== this._summaryRequestId) return;
      console.error('[payment-forecast] summary load failed', error);
      try {
        const fallbackRows = await this.fetchAllForecastRows(this.rpcFilters('overview'));
        if (requestId !== this._summaryRequestId) return;
        this.state.summary = this.buildSummaryFromRows(fallbackRows);
        this.state.summaryError = '';
      } catch (fallbackError) {
        if (requestId !== this._summaryRequestId) return;
        console.error('[payment-forecast] summary fallback failed', fallbackError);
        this.state.summary = {};
        this.state.summaryError = fallbackError.message || error.message || 'Unable to load payment forecast summary.';
        UI.toast(this.state.summaryError);
      }
    } finally {
      if (requestId === this._summaryRequestId) { this.state.loading.summary = false; this.renderActiveTab(); }
    }
  },
  async loadGrouped(type = this.canonicalTab()) {
    const tab = this.canonicalTab(type);
    const pagination = this.state.pagination[tab];
    if (!pagination || !['client_distribution', 'monthly_forecast'].includes(tab)) return;
    const requestId = (this._rowsRequestId || 0) + 1;
    this._rowsRequestId = requestId;
    this.state.loading.rows = true;
    this.clearTabRows(tab);
    const sourceName = tab === 'client_distribution' ? 'get_payment_forecast_client_distribution' : 'get_payment_forecast_monthly_summary';
    console.log('[PaymentForecast] loading source', sourceName);
    this.renderActiveTab();
    try {
      const groupedParams = { ...this.rpcFilters(tab), p_page: pagination.page, p_page_size: this.fixedPageSize };
      const data = tab === 'client_distribution'
        ? await Api.getPaymentForecastClientDistribution(groupedParams)
        : await Api.getPaymentForecastMonthlySummary(groupedParams);
      if (requestId !== this._rowsRequestId || tab !== this.canonicalTab()) return;
      const items = Array.isArray(data) ? data : [];
      let groupedRows = items.map(item => item?.row_data || item).filter(Boolean);
      const serverTotal = this.n(items[0]?.total_count);
      if (!groupedRows.length && serverTotal === 0) {
        console.log('[PaymentForecast] loading source', `${sourceName} fallback get_payment_forecast_page`);
        const rawRows = await this.fetchAllForecastRows(this.rpcFilters(tab));
        if (requestId !== this._rowsRequestId || tab !== this.canonicalTab()) return;
        const allGroupedRows = tab === 'client_distribution' ? this.groupClientRows(rawRows) : this.groupMonthlyRows(rawRows);
        pagination.total = allGroupedRows.length;
        const start = (pagination.page - 1) * this.fixedPageSize;
        groupedRows = allGroupedRows.slice(start, start + this.fixedPageSize);
      } else {
        pagination.total = serverTotal || groupedRows.length;
      }
      this.state.rowsByTab[tab] = groupedRows.map(row => this.normalizeGroupedRow(row, tab));
      if (!this.state.rowsByTab[tab].length && pagination.total > 0 && pagination.page > 1) { pagination.page = 1; return this.loadGrouped(tab); }
      console.log('[PaymentForecast] rows', this.state.rowsByTab[tab].length, 'total', pagination.total);
    } catch (error) {
      if (requestId !== this._rowsRequestId) return;
      console.error(`[PaymentForecast] ${sourceName} failed`, error);
      try {
        console.log('[PaymentForecast] loading source', `${sourceName} fallback get_payment_forecast_page`);
        const rawRows = await this.fetchAllForecastRows(this.rpcFilters(tab));
        if (requestId !== this._rowsRequestId || tab !== this.canonicalTab()) return;
        const allGroupedRows = tab === 'client_distribution' ? this.groupClientRows(rawRows) : this.groupMonthlyRows(rawRows);
        pagination.total = allGroupedRows.length;
        if (pagination.page > Math.max(1, Math.ceil(pagination.total / this.fixedPageSize))) pagination.page = 1;
        const start = (pagination.page - 1) * this.fixedPageSize;
        this.state.rowsByTab[tab] = allGroupedRows.slice(start, start + this.fixedPageSize).map(row => this.normalizeGroupedRow(row, tab));
        this.state.rowsError = '';
        console.log('[PaymentForecast] rows', this.state.rowsByTab[tab].length, 'total', pagination.total);
      } catch (fallbackError) {
        if (requestId !== this._rowsRequestId) return;
        console.error(`[PaymentForecast] ${tab} fallback failed`, fallbackError);
        this.state.rowsByTab[tab] = [];
        pagination.total = 0;
        this.state.rowsError = fallbackError.message || error.message || `Unable to load payment forecast ${this.label(tab)}.`;
        UI.toast(this.state.rowsError);
      }
    } finally {
      if (requestId === this._rowsRequestId) { this.state.loading.rows = false; this.renderActiveTab(); }
    }
  },
  async loadActiveTab() {
    const tab = this.canonicalTab();
    console.log('[PaymentForecast] activeTab', tab);
    this.state.rowsError = '';
    this.clearTabBody();
    this.renderActiveTab();
    if (tab === 'overview') return this.loadPage();
    if (tab === 'collection_follow_up') {
      this._rowsRequestId = (this._rowsRequestId || 0) + 1;
      this.state.loading.rows = false;
      this.state.rowsByTab.collection_follow_up = [];
      this.state.pagination.collection_follow_up.total = 0;
      return this.renderPaymentForecastFollowUp();
    }
    if (tab === 'client_distribution' || tab === 'monthly_forecast') return this.loadGrouped(tab);
    return this.loadPage();
  },
  async refresh(force = false) {
    if ((this.state.loading.rows || this.state.loading.summary) && !force) return;
    if (!this.canView()) { this.state.rowsError = 'You do not have permission to view Payment Forecast.'; this.renderActiveTab(); return; }
    this.state.followups = await this.fetchTable('payment_forecast_followups', 'updated_at', false, 3000).catch(() => []);
    await Promise.all([this.loadSummary(), this.loadActiveTab()]);
  },
  async filtersChanged() {
    this.resetPages();
    Object.keys(this.state.rowsByTab).forEach(tab => { this.state.rowsByTab[tab] = []; });
    await Promise.all([this.loadSummary(), this.loadActiveTab()]);
  },
  label(value = '') { const key = this.text(value).toLowerCase(); return ({ due_soon: 'Due Soon', not_started: 'Not Started', promised_to_pay: 'Promised to Pay', client_distribution: 'Client Distribution', monthly_forecast: 'Monthly Forecast', collection_follow_up: 'Collection Follow-up' })[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Scheduled'; },
  statusClass(status = '') { const key = this.text(status).toLowerCase(); if (['overdue', 'escalated', 'disputed'].includes(key)) return 'status-badge bad'; if (['due_soon', 'promised_to_pay'].includes(key)) return 'status-badge warn'; if (['paid', 'closed', 'contacted'].includes(key)) return 'status-badge ok'; if (key === 'credited') return 'status-badge info'; return 'status-badge'; },
  populateFilters(rows = []) {
    const populate = (id, values, allLabel, current) => { const el = document.getElementById(id); if (!el) return; const existing = [...el.options].map(option => option.value).filter(value => value !== 'all'); const options = [...new Set([...existing, ...values.filter(Boolean), ...(current !== 'all' ? [current] : [])])].sort(); el.innerHTML = `<option value="all">${allLabel}</option>` + options.map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(this.label(value))}</option>`).join(''); el.value = current; };
    populate('paymentForecastStatusFilter', rows.map(row => row.forecast_status), 'All statuses', this.state.filters.status);
    populate('paymentForecastClientFilter', rows.map(row => row.client_name), 'All clients', this.state.filters.client);
    populate('paymentForecastTermFilter', rows.map(row => row.payment_term), 'All payment terms', this.state.filters.paymentTerm);
    populate('paymentForecastCurrencyFilter', rows.map(row => row.currency), 'All currencies', this.state.filters.currency);
    populate('paymentForecastFollowupFilter', this.followUpStatuses, 'All follow-up statuses', this.state.filters.followUpStatus);
  },
  renderSummary() {
    const el = document.getElementById('paymentForecastSummary'); if (!el) return;
    if (this.state.loading.summary && !this.hasSummaryData()) { el.innerHTML = '<div class="muted pf-summary-message">Loading payment forecast summary…</div>'; return; }
    if (this.state.summaryError && !this.hasSummaryData()) { el.innerHTML = `<div class="pf-error pf-summary-message">${U.escapeHtml(this.state.summaryError)}</div>`; return; }
    const s = this.state.summary || {}, currency = s.currency || 'USD';
    const moneyMetric = value => value === undefined ? '—' : U.escapeHtml(this.money(value, currency));
    const countMetric = value => value === undefined ? '—' : U.escapeHtml(U.fmtNumber(value));
    const percentMetric = value => value === undefined ? '—' : `${value.toFixed(1)}%`;
    const cards = [
      ['Scheduled Payments', countMetric(s.scheduled_rows), 'Scheduled payment rows', ''], ['Gross Scheduled', moneyMetric(s.gross_scheduled), 'Before payments and credits', ''],
      ['Paid Amount', moneyMetric(s.paid_amount), 'Receipts allocated', 'is-positive'], ['Credit Adjusted', moneyMetric(s.credit_adjusted), 'Credits allocated', 'is-info'],
      ['Net Expected', moneyMetric(s.remaining_forecast), 'Receivables outstanding', 'is-highlighted'], ['Overdue Amount', moneyMetric(s.overdue_amount), 'Immediate collection attention', 'is-overdue'],
      ['Due This Week', moneyMetric(s.due_this_week), 'Next 7 days', 'is-warning'], ['Due This Month', moneyMetric(s.due_this_month), 'Current calendar month', ''],
      ['Next 30 Days', moneyMetric(s.next_30_days), 'Near-term forecast', ''], ['Next 90 Days', moneyMetric(s.next_90_days), 'Quarter forecast', ''],
      ['Collection Risk %', percentMetric(s.collection_risk_percent), 'Backend collection risk', (s.collection_risk_percent ?? 0) > 25 ? 'is-overdue' : '']
    ];
    el.innerHTML = cards.map(([label, value, subtitle, cls]) => `<article class="payment-forecast-summary-card ${cls}"><div class="summary-label">${label}</div><div class="summary-value">${value}</div><div class="summary-subtitle">${subtitle}</div></article>`).join('');
  },
  actionButtons(row) { const id = U.escapeAttr(row.forecast_row_id), client = U.escapeAttr(row.client_id), invoice = U.escapeAttr(row.invoice_id || row.invoice_number); return `<div class="pf-actions"><button class="btn ghost xs" data-pf-action="invoice" data-value="${invoice}">Open Invoice</button>${this.canCreateReceipt() && row.remaining_amount > 0 ? `<button class="btn xs" data-pf-action="receipt" data-value="${id}">Create Receipt</button>` : ''}<button class="btn ghost xs" data-pf-action="client" data-value="${client}">Open Client</button><button class="btn ghost xs" data-pf-action="statement" data-value="${client}">Open Statement</button>${this.canManage() ? `<button class="btn ghost xs" data-pf-action="note" data-value="${id}">Add Follow-up Note</button><button class="btn ghost xs" data-pf-action="followed" data-value="${id}">Mark as Followed Up</button>` : ''}</div>`; },
  table(headers, body, colspan) { return `<div class="table-scroll"><table id="paymentForecastTable"><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${colspan}" class="muted pf-empty">No payment forecast rows match these filters.</td></tr>`}</tbody></table></div>`; },
  renderPaymentRowsTable(rows) {
    const head = ['Client','Invoice #','Agreement #','Payment #','Due Date','Payment Term','Scheduled Amount','Paid Amount','Credit Adjustment','Remaining Amount','Status','Days Until Due / Days Overdue','Follow-up Status','Actions'];
    const body = rows.map(row => { const days = row.scheduled_due_date ? Math.ceil((new Date(`${row.scheduled_due_date}T00:00:00Z`) - new Date(`${this.today()}T00:00:00Z`)) / 86400000) : 0; return `<tr class="${row.forecast_status === 'overdue' ? 'pf-overdue-row' : row.forecast_status === 'due_soon' ? 'pf-due-soon-row' : ''}"><td><strong>${U.escapeHtml(row.client_name)}</strong></td><td>${U.escapeHtml(row.invoice_number || '—')}</td><td>${U.escapeHtml(row.agreement_number || '—')}</td><td>${U.escapeHtml(row.payment_no || '—')}</td><td>${U.escapeHtml(row.scheduled_due_date || '—')}</td><td>${U.escapeHtml(row.payment_term || '—')}</td>${['scheduled_amount','paid_amount','allocated_credit_amount','remaining_amount'].map(field => `<td class="num">${U.escapeHtml(this.money(row[field], row.currency))}</td>`).join('')}<td><span class="${this.statusClass(row.forecast_status)}">${U.escapeHtml(this.label(row.forecast_status))}</span></td><td>${days < 0 ? `${Math.abs(days)} days overdue` : `${days} days until due`}</td><td><span class="${this.statusClass(row.follow_up_status)}">${U.escapeHtml(this.label(row.follow_up_status))}</span></td><td class="actions-cell">${this.actionButtons(row)}</td></tr>`; }).join('');
    return this.table(head, body, head.length);
  },
  groupedPageRows(tab) { return this.state.rowsByTab[tab] || []; },
  renderPaymentForecastOverview() { const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = '<h3 class="pf-section-title">All Scheduled Payments</h3>' + this.renderPaymentRowsTable(this.state.rowsByTab.overview || []); },
  renderPaymentForecastUpcoming() { const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = this.renderPaymentRowsTable(this.state.rowsByTab.upcoming); },
  renderPaymentForecastOverdue() { const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = this.renderPaymentRowsTable(this.state.rowsByTab.overdue); },
  renderPaymentForecastClientDistribution() {
    const head = ['Client','Currency','Scheduled Payment Count','Invoice Count','Gross Scheduled','Paid','Credit Adjusted','Net Expected','Overdue','Next Due Date','Actions'];
    const rows = this.groupedPageRows('client_distribution');
    const tableBody = rows.map(row => `<tr><td><strong>${U.escapeHtml(row.client_name)}</strong></td><td>${U.escapeHtml(row.currency)}</td><td class="num">${U.escapeHtml(U.fmtNumber(row.scheduled_payment_count))}</td><td class="num">${U.escapeHtml(U.fmtNumber(row.invoice_count))}</td>${['gross_scheduled_amount','paid_amount','credit_adjustment_amount','net_expected_amount','overdue_amount'].map(field => `<td class="num">${U.escapeHtml(this.money(row[field], row.currency))}</td>`).join('')}<td>${U.escapeHtml(row.next_due_date || '—')}</td><td class="actions-cell"><button class="btn ghost xs" data-pf-action="client" data-value="${U.escapeAttr(row.client_id)}" ${row.client_id ? '' : 'disabled'}>Open Client</button></td></tr>`).join('');
    const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = this.table(head, tableBody, head.length);
  },
  renderPaymentForecastMonthlyForecast() {
    const head = ['Month','Currency','Scheduled Payment Count','Gross Scheduled','Paid','Credit Adjusted','Net Expected','Overdue','Due Soon'];
    const rows = this.groupedPageRows('monthly_forecast');
    const tableBody = rows.map(row => `<tr><td><strong>${U.escapeHtml(row.forecast_month || '—')}</strong></td><td>${U.escapeHtml(row.currency)}</td><td class="num">${U.escapeHtml(U.fmtNumber(row.scheduled_payment_count))}</td>${['gross_scheduled_amount','paid_amount','credit_adjustment_amount','net_expected_amount','overdue_amount','due_soon_amount'].map(field => `<td class="num">${U.escapeHtml(this.money(row[field], row.currency))}</td>`).join('')}</tr>`).join('');
    const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = this.table(head, tableBody, head.length);
  },
  renderPaymentForecastFollowUp() { const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = '<div class="muted pf-empty">Collection follow-up tracking is not configured yet.</div>'; },
  renderPagination() {
    const tab = this.canonicalTab(), pagination = this.state.pagination[tab];
    if (!pagination || (tab === 'collection_follow_up' && pagination.total === 0)) return '';
    const pageSize = this.fixedPageSize;
    const total = this.n(pagination.total);
    const page = Math.max(1, this.n(pagination.page) || 1);
    const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
    const end = Math.min(page * pageSize, total);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return `<div class="pf-pagination" aria-label="Payment forecast pagination"><div class="pf-pagination-showing">Showing ${start}–${end} of ${total}</div><span>10 rows per page</span><button class="btn ghost sm" data-pf-page="previous" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${totalPages}</span><button class="btn ghost sm" data-pf-page="next" ${page >= totalPages ? 'disabled' : ''}>Next</button></div>`;
  },
  renderActiveTab() {
    const summary = document.getElementById('paymentForecastSummary'), body = document.getElementById('paymentForecastTabBody'), paginationEl = document.getElementById('paymentForecastPagination'), state = document.getElementById('paymentForecastState');
    if (!body || !state) return;
    const tab = this.canonicalTab();
    body.innerHTML = '';
    if (paginationEl) { paginationEl.innerHTML = ''; paginationEl.style.display = 'none'; }
    document.querySelectorAll('[data-pf-tab]').forEach(button => { const active = button.dataset.pfTab === tab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    this.renderSummary(); summary?.classList.toggle('is-hidden', tab !== 'overview');
    if (tab === 'overview') {
      const pagination = this.state.pagination.overview;
      if (this.state.loading.rows && !(this.state.rowsByTab.overview || []).length) {
        state.textContent = 'Loading scheduled payment rows…';
        body.innerHTML = '<div class="muted pf-empty">Loading scheduled payment rows…</div>';
        return;
      }
      if (this.state.rowsError) {
        state.textContent = this.state.rowsError;
        body.innerHTML = `<div class="pf-error pf-empty">${U.escapeHtml(this.state.rowsError)}</div>`;
        return;
      }
      state.textContent = this.state.summaryError && !this.hasSummaryData() ? this.state.summaryError : `${pagination.total || this.state.summary?.scheduled_rows || 0} scheduled payment row${(pagination.total || this.state.summary?.scheduled_rows || 0) === 1 ? '' : 's'} loaded.`;
      this.renderPaymentForecastOverview();
      if (paginationEl) { paginationEl.innerHTML = this.renderPagination(); paginationEl.style.display = ''; }
      return;
    }
    if (tab === 'collection_follow_up') { state.textContent = 'Collection follow-up tracking is not configured yet.'; this.renderPaymentForecastFollowUp(); return; }
    if (this.state.loading.rows) { state.textContent = 'Loading payment forecast rows…'; body.innerHTML = '<div class="muted pf-empty">Loading payment forecast rows…</div>'; return; }
    if (this.state.rowsError) { state.textContent = this.state.rowsError; body.innerHTML = `<div class="pf-error pf-empty">${U.escapeHtml(this.state.rowsError)}</div>`; return; }
    const pagination = this.state.pagination[tab], grouped = ['client_distribution', 'monthly_forecast'].includes(tab);
    state.textContent = `${pagination.total} filtered ${grouped ? 'grouped forecast' : 'payment schedule'} row${pagination.total === 1 ? '' : 's'}.`;
    const renderers = { upcoming: 'renderPaymentForecastUpcoming', overdue: 'renderPaymentForecastOverdue', client_distribution: 'renderPaymentForecastClientDistribution', monthly_forecast: 'renderPaymentForecastMonthlyForecast' };
    this[renderers[tab]]();
    if (paginationEl) { paginationEl.innerHTML = this.renderPagination(); paginationEl.style.display = ''; }
  },
  render() { this.renderActiveTab(); },
  async openInvoice(value) { if (window.Invoices?.openInvoiceById) return Invoices.openInvoiceById(value, { readOnly: true }).catch(error => UI.toast(error.message)); UI.toast('Invoice module is not ready.'); },
  async createReceiptForRow(id) { const row = (this.state.rowsByTab[this.canonicalTab()] || []).find(item => item.forecast_row_id === id); if (!row || !this.canCreateReceipt()) return UI.toast('Receipt creation is not available for this row.'); return Receipts?.openCreateFromInvoice?.({ id: row.invoice_id, invoice_uuid: row.invoice_id, invoice_id: row.invoice_number, invoice_number: row.invoice_number, customer_name: row.client_name, client_id: row.client_id, agreement_number: row.agreement_number, due_date: row.scheduled_due_date, payment_term: row.payment_term, currency: row.currency, balance_due: row.remaining_amount, paid_now: row.remaining_amount, payment_notes: `Payment Forecast schedule #${row.payment_no} due ${row.scheduled_due_date}` }); },
  async openClient(id, statement = false) { if (!id) return UI.toast('No client is linked to this scheduled payment.'); if (window.showView) showView('clients'); if (window.Clients?.selectClient) { await Clients.selectClient(id); if (statement && Clients.setDetailTab) Clients.setDetailTab('statement'); } },
  async saveFollowup(row, patch) { if (!this.canManage()) return UI.toast('You do not have permission to manage follow-ups.'); const user = Permissions.getResolvedCurrentUser?.() || Session?.authContext?.()?.profile || {}; const payload = { invoice_id: row.invoice_id || null, invoice_number: row.invoice_number, schedule_no: Number(row.payment_no) || null, client_name: row.client_name, assigned_to: user.id || user.user_id || null, assigned_to_email: user.email || '', created_by: user.id || user.user_id || null, created_by_email: user.email || '', updated_at: new Date().toISOString(), ...patch }; const existing = this.state.followups.find(item => `${item.invoice_id || item.invoice_number || ''}::${item.schedule_no || ''}` === this.followupKey(row)); const query = existing?.id ? this.getClient().from('payment_forecast_followups').update(payload).eq('id', existing.id) : this.getClient().from('payment_forecast_followups').insert(payload); const { error } = await query; if (error) throw error; UI.toast('Collection follow-up updated.'); await this.refresh(true); },
  async addFollowupNote(id) { const row = (this.state.rowsByTab[this.canonicalTab()] || []).find(item => item.forecast_row_id === id); if (!row) return; const notes = window.prompt('Add a collection follow-up note:', row.follow_up_notes || ''); if (notes === null) return; const status = window.prompt(`Follow-up status (${this.followUpStatuses.join(', ')}):`, row.follow_up_status || 'contacted'); if (status === null) return; const nextAt = window.prompt('Next follow-up date (YYYY-MM-DD, optional):', this.date(row.next_follow_up_at)); if (nextAt === null) return; const normalized = this.followUpStatuses.includes(status.trim().toLowerCase()) ? status.trim().toLowerCase() : 'contacted'; await this.saveFollowup(row, { follow_up_notes: notes, follow_up_status: normalized, last_follow_up_at: new Date().toISOString(), next_follow_up_at: nextAt ? `${nextAt}T09:00:00Z` : null }).catch(error => UI.toast(error.message || 'Unable to save follow-up.')); },
  downloadCsv(rows) { const headers = ['Client','Invoice #','Agreement #','Payment #','Due Date','Payment Term','Currency','Scheduled Amount','Paid Amount','Credit Adjustment','Remaining Amount','Status','Follow-up Status']; const csv = [headers, ...rows.map(row => [row.client_name,row.invoice_number,row.agreement_number,row.payment_no,row.scheduled_due_date,row.payment_term,row.currency,row.scheduled_amount,row.paid_amount,row.allocated_credit_amount,row.remaining_amount,this.label(row.forecast_status),this.label(row.follow_up_status)])].map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `receivables_${this.today()}.csv`; a.click(); URL.revokeObjectURL(a.href); },
  async exportCsv() { if (!this.canExport()) return UI.toast('You do not have permission to export Payment Forecast.'); const rows = []; let page = 1, total = Infinity; UI.toast('Preparing filtered Payment Forecast export…'); try { while (rows.length < total) { const data = await Api.getPaymentForecastPage({ ...this.rpcFilters(), p_page: page, p_page_size: 100 }); const items = Array.isArray(data) ? data : []; total = this.n(items[0]?.total_count); rows.push(...items.map(item => item?.row_data).filter(Boolean).map(row => this.normalizeRow(row))); if (!items.length) break; page += 1; } this.downloadCsv(rows); } catch (error) { UI.toast(error.message || 'Unable to export Payment Forecast.'); } },
  async clearFilters() { Object.assign(this.state.filters, { search: '', status: 'all', client: 'all', paymentTerm: 'all', currency: 'all', dateFrom: '', dateTo: '', overdueOnly: false, dueThisWeek: false, dueThisMonth: false, onlyUnpaid: false, followUpStatus: 'all' }); document.querySelectorAll('#paymentForecastFilters input').forEach(input => { input.type === 'checkbox' ? input.checked = false : input.value = ''; }); document.querySelectorAll('#paymentForecastFilters select').forEach(select => { select.value = 'all'; }); await this.filtersChanged(); },
  bind() {
    if (this._bound) return; this._bound = true;
    const map = { paymentForecastSearchInput: 'search', paymentForecastStatusFilter: 'status', paymentForecastClientFilter: 'client', paymentForecastTermFilter: 'paymentTerm', paymentForecastCurrencyFilter: 'currency', paymentForecastDateFrom: 'dateFrom', paymentForecastDateTo: 'dateTo', paymentForecastFollowupFilter: 'followUpStatus', paymentForecastOverdueOnly: 'overdueOnly', paymentForecastDueWeek: 'dueThisWeek', paymentForecastDueMonth: 'dueThisMonth', paymentForecastOnlyUnpaid: 'onlyUnpaid' };
    Object.entries(map).forEach(([id, key]) => document.getElementById(id)?.addEventListener(id.includes('Search') ? 'input' : 'change', event => { this.state.filters[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; clearTimeout(this._filterTimer); this._filterTimer = setTimeout(() => this.filtersChanged(), id.includes('Search') ? 300 : 0); }));
    document.getElementById('paymentForecastRefreshBtn')?.addEventListener('click', () => this.refresh(true)); document.getElementById('paymentForecastExportBtn')?.addEventListener('click', () => this.exportCsv()); document.getElementById('paymentForecastClearBtn')?.addEventListener('click', () => this.clearFilters());
    document.getElementById('paymentForecastView')?.addEventListener('click', event => { const rawTab = event.target.closest('[data-pf-tab]')?.dataset.pfTab; if (rawTab) { const tab = this.canonicalTab(rawTab); if (tab === this.canonicalTab()) return; this.state.activeTab = tab; this.clearTabBody(); this.loadActiveTab(); return; } const direction = event.target.closest('[data-pf-page]')?.dataset.pfPage; if (direction) { const pagination = this.activePagination(); if (!pagination) return; const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize)); pagination.page = direction === 'next' ? Math.min(totalPages, pagination.page + 1) : Math.max(1, pagination.page - 1); this.loadActiveTab(); return; } const target = event.target.closest('[data-pf-action]'); if (!target) return; const { pfAction: action, value } = target.dataset; if (action === 'invoice') this.openInvoice(value); if (action === 'receipt') this.createReceiptForRow(value); if (action === 'client') this.openClient(value); if (action === 'statement') this.openClient(value, true); if (action === 'note') this.addFollowupNote(value); if (action === 'followed') { const row = (this.state.rowsByTab[this.canonicalTab()] || []).find(item => item.forecast_row_id === value); if (row) this.saveFollowup(row, { follow_up_status: 'contacted', last_follow_up_at: new Date().toISOString() }).catch(error => UI.toast(error.message)); } });
  },
  init() { this.bind(); this.renderActiveTab(); }
};
window.PaymentForecast = PaymentForecast;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => PaymentForecast.init()); else PaymentForecast.init();
