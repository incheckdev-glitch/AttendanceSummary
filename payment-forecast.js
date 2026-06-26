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
    followups: [], activityRow: null, activityLogs: [], activityLoading: false, activityError: '', detailsContext: null, details: null, detailsLoading: false, detailsError: '', summaryError: '', rowsError: ''
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
      followup_id: this.text(followup.id || row.followup_id || row.follow_up_id || row.followupId || row.id),
      follow_up_status: this.text(followup.follow_up_status || row.follow_up_status || 'not_started') || 'not_started',
      follow_up_notes: this.text(followup.follow_up_notes || followup.notes || row.follow_up_notes || row.notes),
      last_follow_up_at: followup.last_follow_up_at || row.last_follow_up_at || '',
      next_follow_up_at: followup.next_follow_up_at || row.next_follow_up_at || '',
      assigned_to: this.text(followup.assigned_to_name || followup.assigned_to_email || followup.assigned_to || row.assigned_to_name || row.assigned_to_email || row.assigned_to)
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
  normalizeClientDistributionName(value) {
    const raw = this.text(value);
    if (!raw || raw.toLowerCase() === 'unknown client') return '';
    const normalized = raw.normalize ? raw.normalize('NFKC') : raw;
    return normalized.toLowerCase().replace(/[\u0640]/g, '').replace(/\s+/g, ' ').trim();
  },
  clientDistributionKey(row = {}) {
    const currency = this.text(row.currency || 'USD').toUpperCase() || 'USD';
    const normalizedName = this.normalizeClientDistributionName(row.client_name || row.customer_name || row.company_name);
    const fallbackId = this.text(row.company_id || row.client_id || row.customer_id || row.invoice_id || row.invoice_number);
    return `${normalizedName || fallbackId || 'unknown-client'}::${currency}`;
  },
  groupClientRows(rows = []) {
    const map = new Map();
    rows.forEach(row => {
      const key = this.clientDistributionKey(row);
      const rowName = this.text(row.client_name || row.customer_name || row.company_name || 'Unknown Client') || 'Unknown Client';
      const rowClientId = this.text(row.company_id || row.client_id || row.customer_id);
      const current = map.get(key) || { client_name: rowName, client_id: rowClientId || '', company_id: rowClientId || '', currency: (this.text(row.currency || 'USD').toUpperCase() || 'USD'), scheduled_payment_count: 0, invoice_ids: new Set(), gross_scheduled_amount: 0, paid_amount: 0, credit_adjustment_amount: 0, net_expected_amount: 0, overdue_amount: 0, next_due_date: '' };
      if (rowClientId && !current.client_id) current.client_id = rowClientId;
      if (rowClientId && !current.company_id) current.company_id = rowClientId;
      if (rowName && (current.client_name === 'Unknown Client' || rowName.length > current.client_name.length)) current.client_name = rowName;
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
  pageRows(rows = [], pagination = this.activePagination()) {
    const page = Math.max(1, this.n(pagination?.page) || 1);
    const size = this.n(pagination?.pageSize) || this.fixedPageSize;
    const start = (page - 1) * size;
    return rows.slice(start, start + size);
  },
  async buildClientDistributionFromRawRows(tab, pagination, requestId) {
    // Client Distribution gross scheduled must be calculated from the actual schedule rows,
    // not from the grouped RPC cache. This keeps each client total equal to SUM(scheduled_amount)
    // before receipts and credit-note adjustments.
    console.log('[PaymentForecast] loading source', 'get_payment_forecast_page client_distribution_gross_source');
    const rawRows = await this.fetchAllForecastRows(this.rpcFilters(tab));
    if (requestId !== this._rowsRequestId || tab !== this.canonicalTab()) return null;
    const allGroupedRows = this.groupClientRows(rawRows);
    pagination.total = allGroupedRows.length;
    if (pagination.page > Math.max(1, Math.ceil(pagination.total / this.fixedPageSize))) pagination.page = 1;
    return this.pageRows(allGroupedRows, pagination);
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
      let groupedRows = [];
      if (tab === 'client_distribution') {
        groupedRows = await this.buildClientDistributionFromRawRows(tab, pagination, requestId);
        if (!groupedRows) return;
      } else {
        const groupedParams = { ...this.rpcFilters(tab), p_page: pagination.page, p_page_size: this.fixedPageSize };
        const data = await Api.getPaymentForecastMonthlySummary(groupedParams);
        if (requestId !== this._rowsRequestId || tab !== this.canonicalTab()) return;
        const items = Array.isArray(data) ? data : [];
        groupedRows = items.map(item => item?.row_data || item).filter(Boolean);
        const serverTotal = this.n(items[0]?.total_count);
        if (!groupedRows.length && serverTotal === 0) {
          console.log('[PaymentForecast] loading source', `${sourceName} fallback get_payment_forecast_page`);
          const rawRows = await this.fetchAllForecastRows(this.rpcFilters(tab));
          if (requestId !== this._rowsRequestId || tab !== this.canonicalTab()) return;
          const allGroupedRows = this.groupMonthlyRows(rawRows);
          pagination.total = allGroupedRows.length;
          groupedRows = this.pageRows(allGroupedRows, pagination);
        } else {
          pagination.total = serverTotal || groupedRows.length;
        }
      }
      this.state.rowsByTab[tab] = groupedRows.map(row => this.normalizeGroupedRow(row, tab));
      if (!this.state.rowsByTab[tab].length && pagination.total > 0 && pagination.page > 1) { pagination.page = 1; return this.loadGrouped(tab); }
      console.log('[PaymentForecast] rows', this.state.rowsByTab[tab].length, 'total', pagination.total);
    } catch (error) {
      if (requestId !== this._rowsRequestId) return;
      console.error(`[PaymentForecast] ${sourceName} failed`, error);
      try {
        if (tab === 'client_distribution') {
          const groupedRows = await this.buildClientDistributionFromRawRows(tab, pagination, requestId);
          if (!groupedRows) return;
          this.state.rowsByTab[tab] = groupedRows.map(row => this.normalizeGroupedRow(row, tab));
        } else {
          console.log('[PaymentForecast] loading source', `${sourceName} fallback get_payment_forecast_page`);
          const rawRows = await this.fetchAllForecastRows(this.rpcFilters(tab));
          if (requestId !== this._rowsRequestId || tab !== this.canonicalTab()) return;
          const allGroupedRows = this.groupMonthlyRows(rawRows);
          pagination.total = allGroupedRows.length;
          if (pagination.page > Math.max(1, Math.ceil(pagination.total / this.fixedPageSize))) pagination.page = 1;
          this.state.rowsByTab[tab] = this.pageRows(allGroupedRows, pagination).map(row => this.normalizeGroupedRow(row, tab));
        }
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
  async loadFollowupsPage({ renderLoading = true } = {}) {
    const tab = 'collection_follow_up';
    const pagination = this.state.pagination[tab];
    const requestId = (this._rowsRequestId || 0) + 1;
    this._rowsRequestId = requestId;
    this.state.loading.rows = true;
    this.clearTabRows(tab);
    console.log('[PaymentForecast] loading source', 'get_payment_forecast_followups_page');
    if (renderLoading) this.renderActiveTab();
    try {
      const data = await Api.getPaymentForecastFollowupsPage({ ...this.rpcFilters(tab), p_page: pagination.page, p_page_size: this.fixedPageSize });
      if (requestId !== this._rowsRequestId || tab !== this.canonicalTab()) return;
      const rows = data.map(item => item.row_data);
      const total = data?.[0]?.total_count || 0;
      pagination.total = this.n(total);
      if (!rows.length && total > 0 && pagination.page > 1) { pagination.page = 1; return this.loadFollowupsPage({ renderLoading: false }); }
      this.state.rowsByTab[tab] = rows.map(row => this.normalizeRow(row));
      this.populateFilters(this.state.rowsByTab[tab]);
      console.log('[PaymentForecast] rows', this.state.rowsByTab[tab].length, 'total', total);
    } catch (error) {
      if (requestId !== this._rowsRequestId) return;
      console.error('[PaymentForecast] follow-up page load failed', error);
      this.state.rowsByTab[tab] = [];
      pagination.total = 0;
      this.state.rowsError = error.message || 'Unable to load collection follow-ups.';
      UI.toast(this.state.rowsError);
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
    if (tab === 'collection_follow_up') return this.loadFollowupsPage();
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
      ['scheduled_rows','Scheduled Payments', countMetric(s.scheduled_rows), 'Scheduled payment rows', ''], ['gross_scheduled','Gross Scheduled', moneyMetric(s.gross_scheduled), 'Before payments and credits', ''],
      ['paid_amount','Paid Amount', moneyMetric(s.paid_amount), 'Receipts allocated', 'is-positive'], ['credit_adjusted','Credit Adjusted', moneyMetric(s.credit_adjusted), 'Credits allocated', 'is-info'],
      ['net_expected','Net Expected', moneyMetric(s.remaining_forecast), 'Receivables outstanding', 'is-highlighted'], ['overdue_amount','Overdue Amount', moneyMetric(s.overdue_amount), 'Immediate collection attention', 'is-overdue'],
      ['due_this_week','Due This Week', moneyMetric(s.due_this_week), 'Next 7 days', 'is-warning'], ['due_this_month','Due This Month', moneyMetric(s.due_this_month), 'Current calendar month', ''],
      ['next_30_days','Next 30 Days', moneyMetric(s.next_30_days), 'Near-term forecast', ''], ['next_90_days','Next 90 Days', moneyMetric(s.next_90_days), 'Quarter forecast', ''],
      ['collection_risk_percent','Collection Risk %', percentMetric(s.collection_risk_percent), 'Backend collection risk', (s.collection_risk_percent ?? 0) > 25 ? 'is-overdue' : '']
    ];
    el.innerHTML = cards.map(([metric, label, value, subtitle, cls]) => `<article class="payment-forecast-summary-card ${cls}" data-drilldown-metric="${metric}" tabindex="0" role="button"><div class="summary-label">${label}</div><div class="summary-value">${value}</div><div class="summary-subtitle">${subtitle}</div></article>`).join('');
  },
  actionButtons(row) { const id = U.escapeAttr(row.forecast_row_id), client = U.escapeAttr(row.client_id), invoice = U.escapeAttr(row.invoice_id || row.invoice_number); return `<div class="pf-actions"><button class="btn ghost xs" data-pf-action="invoice" data-value="${invoice}">Open Invoice</button>${this.canCreateReceipt() && row.remaining_amount > 0 ? `<button class="btn xs" data-pf-action="receipt" data-value="${id}">Create Receipt</button>` : ''}<button class="btn ghost xs" data-pf-action="client" data-value="${client}">Open Client</button><button class="btn ghost xs" data-pf-action="statement" data-value="${client}">Open Statement</button>${this.canManage() ? `<button class="btn ghost xs" data-pf-action="note" data-value="${id}">Add Follow-up Note</button><button class="btn ghost xs" data-pf-action="followed" data-value="${id}">Mark as Followed Up</button>` : ''}</div>`; },
  table(headers, body, colspan) { return `<div class="table-scroll"><table id="paymentForecastTable"><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${colspan}" class="muted pf-empty">No payment forecast rows match these filters.</td></tr>`}</tbody></table></div>`; },
  renderPaymentRowsTable(rows) {
    const head = ['Client','Invoice #','Agreement #','Payment #','Due Date','Payment Term','Scheduled Amount','Paid Amount','Credit Adjustment','Remaining Amount','Status','Days Until Due / Days Overdue','Follow-up Status','Actions'];
    const body = rows.map((row, index) => { const days = row.scheduled_due_date ? Math.ceil((new Date(`${row.scheduled_due_date}T00:00:00Z`) - new Date(`${this.today()}T00:00:00Z`)) / 86400000) : 0; return `<tr class="pf-clickable-row ${row.forecast_status === 'overdue' ? 'pf-overdue-row' : row.forecast_status === 'due_soon' ? 'pf-due-soon-row' : ''}" data-pf-drilldown="row" data-pf-row-index="${index}" tabindex="0"><td><strong>${U.escapeHtml(row.client_name)}</strong></td><td>${U.escapeHtml(row.invoice_number || '—')}</td><td>${U.escapeHtml(row.agreement_number || '—')}</td><td>${U.escapeHtml(row.payment_no || '—')}</td><td>${U.escapeHtml(row.scheduled_due_date || '—')}</td><td>${U.escapeHtml(row.payment_term || '—')}</td>${['scheduled_amount','paid_amount','allocated_credit_amount','remaining_amount'].map(field => `<td class="num">${U.escapeHtml(this.money(row[field], row.currency))}</td>`).join('')}<td><span class="${this.statusClass(row.forecast_status)}">${U.escapeHtml(this.label(row.forecast_status))}</span></td><td>${days < 0 ? `${Math.abs(days)} days overdue` : `${days} days until due`}</td><td><span class="${this.statusClass(row.follow_up_status)}">${U.escapeHtml(this.label(row.follow_up_status))}</span></td><td class="actions-cell">${this.actionButtons(row)}</td></tr>`; }).join('');
    return this.table(head, body, head.length);
  },
  groupedPageRows(tab) { return this.state.rowsByTab[tab] || []; },
  renderPaymentForecastOverview() { const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = '<h3 class="pf-section-title">All Scheduled Payments</h3>' + this.renderPaymentRowsTable(this.state.rowsByTab.overview || []); },
  renderPaymentForecastUpcoming() { const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = this.renderPaymentRowsTable(this.state.rowsByTab.upcoming); },
  renderPaymentForecastOverdue() { const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = this.renderPaymentRowsTable(this.state.rowsByTab.overdue); },
  renderPaymentForecastClientDistribution() {
    const head = ['Client','Currency','Scheduled Payment Count','Invoice Count','Gross Scheduled','Paid','Credit Adjusted','Net Expected','Overdue','Next Due Date','Actions'];
    const rows = this.groupedPageRows('client_distribution');
    const tableBody = rows.map((row, index) => `<tr class="pf-clickable-row" data-pf-drilldown="client" data-pf-row-index="${index}" tabindex="0"><td><strong>${U.escapeHtml(row.client_name)}</strong></td><td>${U.escapeHtml(row.currency)}</td><td class="num">${U.escapeHtml(U.fmtNumber(row.scheduled_payment_count))}</td><td class="num">${U.escapeHtml(U.fmtNumber(row.invoice_count))}</td>${['gross_scheduled_amount','paid_amount','credit_adjustment_amount','net_expected_amount','overdue_amount'].map(field => `<td class="num">${U.escapeHtml(this.money(row[field], row.currency))}</td>`).join('')}<td>${U.escapeHtml(row.next_due_date || '—')}</td><td class="actions-cell"><button class="btn ghost xs" data-pf-action="client" data-value="${U.escapeAttr(row.client_id)}" ${row.client_id ? '' : 'disabled'}>Open Client</button></td></tr>`).join('');
    const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = this.table(head, tableBody, head.length);
  },
  renderPaymentForecastMonthlyForecast() {
    const head = ['Month','Currency','Scheduled Payment Count','Gross Scheduled','Paid','Credit Adjusted','Net Expected','Overdue','Due Soon'];
    const rows = this.groupedPageRows('monthly_forecast');
    const tableBody = rows.map((row, index) => `<tr class="pf-clickable-row" data-pf-drilldown="month" data-pf-row-index="${index}" tabindex="0"><td><strong>${U.escapeHtml(row.forecast_month || '—')}</strong></td><td>${U.escapeHtml(row.currency)}</td><td class="num">${U.escapeHtml(U.fmtNumber(row.scheduled_payment_count))}</td>${['gross_scheduled_amount','paid_amount','credit_adjustment_amount','net_expected_amount','overdue_amount','due_soon_amount'].map(field => `<td class="num">${U.escapeHtml(this.money(row[field], row.currency))}</td>`).join('')}</tr>`).join('');
    const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = this.table(head, tableBody, head.length);
  },
  followupActionButtons(row) { const id = U.escapeAttr(row.followup_id || row.forecast_row_id), client = U.escapeAttr(row.client_id), invoice = U.escapeAttr(row.invoice_id || row.invoice_number); return `<div class="pf-actions"><button class="btn ghost xs" data-pf-action="invoice" data-value="${invoice}">Open Invoice</button><button class="btn ghost xs" data-pf-action="client" data-value="${client}">Open Client</button><button class="btn ghost xs" data-pf-action="statement" data-value="${client}">Open Statement</button><button class="btn ghost xs" data-pf-action="activity" data-value="${id}">Activity</button>${this.canView() ? `<button class="btn ghost xs" data-pf-action="add-note" data-value="${id}">Add Note</button>` : ''}${this.canManage() ? `<button class="btn ghost xs" data-pf-action="edit-followup" data-value="${id}">Edit Follow-up</button><button class="btn ghost xs" data-pf-action="followed" data-value="${id}">Mark as Followed Up</button>` : ''}</div>`; },
  renderPaymentForecastFollowUp() {
    const head = ['Client','Invoice #','Agreement #','Payment #','Scheduled Due Date','Scheduled Amount','Remaining Amount','Follow-up Status','Last Follow-up','Next Follow-up','Notes','Assigned To','Actions'];
    const rows = this.state.rowsByTab.collection_follow_up || [];
    const tableBody = rows.map((row, index) => `<tr class="pf-clickable-row" data-pf-drilldown="followup" data-pf-row-index="${index}" tabindex="0"><td><strong>${U.escapeHtml(row.client_name)}</strong></td><td>${U.escapeHtml(row.invoice_number || '—')}</td><td>${U.escapeHtml(row.agreement_number || '—')}</td><td>${U.escapeHtml(row.payment_no || '—')}</td><td>${U.escapeHtml(row.scheduled_due_date || '—')}</td><td class="num">${U.escapeHtml(this.money(row.scheduled_amount, row.currency))}</td><td class="num">${U.escapeHtml(this.money(row.remaining_amount, row.currency))}</td><td><span class="${this.statusClass(row.follow_up_status)}">${U.escapeHtml(this.label(row.follow_up_status))}</span></td><td>${U.escapeHtml(this.date(row.last_follow_up_at) || '—')}</td><td>${U.escapeHtml(this.date(row.next_follow_up_at) || '—')}</td><td>${U.escapeHtml(row.follow_up_notes || '—')}</td><td>${U.escapeHtml(row.assigned_to || '—')}</td><td class="actions-cell">${this.followupActionButtons(row)}</td></tr>`).join('');
    const body = document.getElementById('paymentForecastTabBody'); if (body) body.innerHTML = this.table(head, tableBody, head.length);
  },
  renderPagination() {
    const tab = this.canonicalTab(), pagination = this.state.pagination[tab];
    if (!pagination) return '';
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
    if (this.state.loading.rows) { const label = tab === 'collection_follow_up' ? 'collection follow-ups' : 'payment forecast rows'; state.textContent = `Loading ${label}…`; body.innerHTML = `<div class="muted pf-empty">Loading ${label}…</div>`; return; }
    if (this.state.rowsError) { state.textContent = this.state.rowsError; body.innerHTML = `<div class="pf-error pf-empty">${U.escapeHtml(this.state.rowsError)}</div>`; return; }
    const pagination = this.state.pagination[tab], grouped = ['client_distribution', 'monthly_forecast'].includes(tab), followups = tab === 'collection_follow_up';
    state.textContent = `${pagination.total} filtered ${followups ? 'collection follow-up' : grouped ? 'grouped forecast' : 'payment schedule'} row${pagination.total === 1 ? '' : 's'}.`;
    const renderers = { upcoming: 'renderPaymentForecastUpcoming', overdue: 'renderPaymentForecastOverdue', client_distribution: 'renderPaymentForecastClientDistribution', monthly_forecast: 'renderPaymentForecastMonthlyForecast', collection_follow_up: 'renderPaymentForecastFollowUp' };
    this[renderers[tab]]();
    if (paginationEl) { paginationEl.innerHTML = this.renderPagination(); paginationEl.style.display = ''; }
  },
  render() { this.renderActiveTab(); },
  detailsTitle(context = {}) { if (context.type === 'client') return 'Client Receivables Breakdown'; if (context.type === 'month') return 'Monthly Forecast Breakdown'; if (context.type === 'followup') return 'Follow-up Activity'; if (context.metric === 'overdue_amount' || context.row?.forecast_status === 'overdue') return 'Overdue Details'; return 'Payment Forecast Details'; },
  detailsSubtitle(context = {}) { if (context.type === 'client') return context.client_name || context.row?.client_name || ''; if (context.type === 'month') return [context.month || context.row?.forecast_month, context.currency || context.row?.currency].filter(Boolean).join(' · '); if (context.type === 'metric') return this.label(context.metric); return [context.row?.client_name, context.row?.invoice_number, context.row?.payment_no ? `Payment ${context.row.payment_no}` : ''].filter(Boolean).join(' · '); },
  openPaymentForecastDetailsDrawer(context = {}) {
    const drawer = document.getElementById('paymentForecastDetailsDrawer'); if (!drawer) return;
    this.state.detailsContext = context; drawer.hidden = false; document.body.classList.add('pf-modal-open');
    const title = document.getElementById('paymentForecastDetailsTitle'), subtitle = document.getElementById('paymentForecastDetailsSubtitle');
    if (title) title.textContent = this.detailsTitle(context); if (subtitle) subtitle.textContent = this.detailsSubtitle(context);
    this.loadPaymentForecastDetails(context);
  },
  closePaymentForecastDetailsDrawer() { const drawer = document.getElementById('paymentForecastDetailsDrawer'); if (drawer) drawer.hidden = true; document.body.classList.remove('pf-modal-open'); this.state.detailsContext = null; },
  async loadPaymentForecastDetails(context = {}) {
    this.state.detailsLoading = true; this.state.detailsError = ''; this.renderPaymentForecastDetails();
    try {
      const details = await Api.getPaymentForecastDrilldown(context);
      details.rows = (details.rows || []).map(row => this.normalizeRow(row));
      this.state.details = details;
    } catch (error) { this.state.details = null; this.state.detailsError = error.message || 'Unable to load payment forecast details.'; }
    finally { this.state.detailsLoading = false; this.renderPaymentForecastDetails(); }
  },
  detailSection(title, content, cls = '') { return `<section class="payment-forecast-details-section ${cls}"><h3>${U.escapeHtml(title)}</h3>${content}</section>`; },
  detailTable(headers, rows, empty = 'No related records.') { return `<div class="payment-forecast-mini-table"><table><thead><tr>${headers.map(header => `<th>${U.escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="muted">${U.escapeHtml(empty)}</td></tr>`}</tbody></table></div>`; },
  renderPaymentForecastDetailsSummary(details = {}) {
    const rows = details.rows || [], currency = rows[0]?.currency || this.state.detailsContext?.currency || 'USD';
    const clients = new Set(rows.map(row => row.client_id || row.client_name).filter(Boolean)).size, invoices = new Set(rows.map(row => row.invoice_id || row.invoice_number).filter(Boolean)).size;
    const sum = field => rows.reduce((total, row) => total + this.n(row[field]), 0), overdue = rows.filter(row => row.forecast_status === 'overdue').reduce((total, row) => total + this.n(row.remaining_amount), 0);
    const cards = [['Clients', clients], ['Invoices', invoices], ['Scheduled Payments', rows.length], ['Gross Scheduled', this.money(sum('scheduled_amount'), currency)], ['Paid', this.money(sum('paid_amount'), currency)], ['Credit Adjusted', this.money(sum('allocated_credit_amount'), currency)], ['Remaining', this.money(sum('remaining_amount'), currency)], ['Overdue', this.money(overdue, currency)]];
    return this.detailSection('Summary', `<div class="payment-forecast-details-grid">${cards.map(([label,value]) => `<div class="payment-forecast-details-card"><span>${U.escapeHtml(label)}</span><strong>${U.escapeHtml(value)}</strong></div>`).join('')}</div>`);
  },
  renderPaymentForecastDetailsScheduleRows(rows = []) {
    const headers = ['Client','Invoice #','Payment #','Due Date','Scheduled Amount','Paid','Credit','Remaining','Status'];
    const body = rows.map(row => `<tr><td>${U.escapeHtml(row.client_name || '—')}</td><td>${U.escapeHtml(row.invoice_number || '—')}</td><td>${U.escapeHtml(row.payment_no || '—')}</td><td>${U.escapeHtml(row.scheduled_due_date || '—')}</td>${['scheduled_amount','paid_amount','allocated_credit_amount','remaining_amount'].map(field => `<td>${U.escapeHtml(this.money(row[field], row.currency))}</td>`).join('')}<td><span class="${this.statusClass(row.forecast_status)}">${U.escapeHtml(this.label(row.forecast_status))}</span></td></tr>`).join('');
    return this.detailSection('Schedule Breakdown', this.detailTable(headers, body, 'No scheduled payments match this breakdown.'));
  },
  renderPaymentForecastDetailsReceipts(receipts = []) {
    const body = receipts.map(item => `<tr><td>${U.escapeHtml(item.receipt_number || item.receipt_no || item.reference || '—')}</td><td>${U.escapeHtml(this.date(item.receipt_date || item.date || item.created_at) || '—')}</td><td>${U.escapeHtml(this.money(item.amount || item.receipt_amount || item.allocated_amount, item.currency))}</td><td>${U.escapeHtml(item.invoice_number || item.invoice_no || '—')}</td></tr>`).join('');
    return this.detailSection('Receipts', this.detailTable(['Receipt #','Date','Amount','Invoice #'], body, 'No receipts are applied to these invoices.'));
  },
  renderPaymentForecastDetailsCreditNotes(creditNotes = []) {
    const body = creditNotes.map(item => `<tr><td>${U.escapeHtml(item.credit_note_number || item.credit_note_no || item.reference || '—')}</td><td>${U.escapeHtml(this.date(item.credit_note_date || item.date || item.created_at) || '—')}</td><td>${U.escapeHtml(this.money(item.amount || item.total_amount || item.allocated_amount, item.currency))}</td><td>${U.escapeHtml(item.description || item.reason || '—')}</td><td>${U.escapeHtml(this.label(item.status || '—'))}</td></tr>`).join('');
    return this.detailSection('Credit Notes', this.detailTable(['Credit Note #','Date','Amount','Description','Status'], body, 'No credit notes are applied to these invoices.'));
  },
  renderPaymentForecastDetailsFollowups(followups = []) {
    const body = followups.map(item => `<tr><td>${U.escapeHtml(item.client_name || '—')}</td><td>${U.escapeHtml(item.invoice_number || '—')}</td><td>${U.escapeHtml(item.schedule_no || '—')}</td><td><span class="${this.statusClass(item.follow_up_status)}">${U.escapeHtml(this.label(item.follow_up_status))}</span></td><td>${U.escapeHtml(this.date(item.last_follow_up_at) || '—')}</td><td>${U.escapeHtml(this.date(item.next_follow_up_at) || '—')}</td><td>${U.escapeHtml(item.follow_up_notes || item.notes || '—')}</td></tr>`).join('');
    return this.detailSection('Follow-up Activity', this.detailTable(['Client','Invoice #','Payment #','Status','Last Follow-up','Next Follow-up','Notes'], body, 'No follow-up records are linked to these payments.'));
  },
  renderPaymentForecastDetailsLogs(logs = []) {
    if (!logs.length) return '';
    const body = `<div class="payment-forecast-log-timeline">${logs.map(item => { const actionType = this.text(item.action_type || item.action || 'activity').toLowerCase(); const statusAtTime = item.status_at_time || item.new_status || item.old_status || '—'; const statusChange = actionType === 'status_changed' || (item.old_status && item.new_status && item.old_status !== item.new_status); return `<div class="payment-forecast-log-item"><strong>${U.escapeHtml(this.date(item.created_at) || '—')}</strong><span>${U.escapeHtml(this.label(actionType))}</span><span class="${this.statusClass(statusAtTime)}">${U.escapeHtml(this.label(statusAtTime))}</span>${statusChange ? `<span>${U.escapeHtml(this.label(item.old_status || '—'))} → ${U.escapeHtml(this.label(item.new_status || '—'))}</span>` : ''}<div>${U.escapeHtml(item.note || '—')}</div><small class="muted">${U.escapeHtml(item.created_by_email || item.created_by_name || item.created_by || 'System')}</small></div>`; }).join('')}</div>`;
    return this.detailSection('Activity Logs', body, 'payment-forecast-log-timeline-section');
  },
  renderPaymentForecastDetailsActions(details = {}) {
    const row = details.rows?.[0]; if (!row) return '';
    return this.detailSection('Actions', `<div class="payment-forecast-detail-actions">${this.actionButtons(row)}${this.state.detailsContext?.type === 'followup' && this.canManage() ? `<button class="btn ghost xs" data-pf-action="edit-followup" data-value="${U.escapeAttr(row.forecast_row_id)}">Edit Follow-up</button>` : ''}</div>`);
  },
  renderPaymentForecastDetails() {
    const content = document.getElementById('paymentForecastDetailsContent'); if (!content) return;
    if (this.state.detailsLoading) { content.innerHTML = '<div class="pf-detail-loading">Loading related clients, invoices, schedules, receipts, credits, and follow-up activity…</div>'; return; }
    if (this.state.detailsError) { content.innerHTML = `<div class="pf-detail-empty pf-error">${U.escapeHtml(this.state.detailsError)}</div>`; return; }
    const details = this.state.details || {}, rows = details.rows || [];
    const invoiceRows = [...new Map(rows.map(row => [row.invoice_id || row.invoice_number, row])).values()].map(row => `<tr><td>${U.escapeHtml(row.client_name || '—')}</td><td>${U.escapeHtml(row.invoice_number || '—')}</td><td>${U.escapeHtml(row.agreement_number || '—')}</td><td>${U.escapeHtml(row.currency || '—')}</td><td>${U.escapeHtml(this.money(row.remaining_amount, row.currency))}</td></tr>`).join('');
    content.innerHTML = this.renderPaymentForecastDetailsSummary(details) + this.detailSection('Client / Invoice Details', this.detailTable(['Client','Invoice #','Agreement #','Currency','Remaining'], invoiceRows, 'No related invoices.')) + this.renderPaymentForecastDetailsScheduleRows(rows) + this.renderPaymentForecastDetailsReceipts(details.receipts || []) + this.renderPaymentForecastDetailsCreditNotes(details.credit_notes || []) + this.renderPaymentForecastDetailsFollowups(details.followups || []) + this.renderPaymentForecastDetailsLogs(details.logs || []) + this.renderPaymentForecastDetailsActions(details);
  },
  async openInvoice(value) { if (window.Invoices?.openInvoiceById) return Invoices.openInvoiceById(value, { readOnly: true }).catch(error => UI.toast(error.message)); UI.toast('Invoice module is not ready.'); },
  async createReceiptForRow(id) { const row = (this.state.rowsByTab[this.canonicalTab()] || []).find(item => item.forecast_row_id === id); if (!row || !this.canCreateReceipt()) return UI.toast('Receipt creation is not available for this row.'); return Receipts?.openCreateFromInvoice?.({ id: row.invoice_id, invoice_uuid: row.invoice_id, invoice_id: row.invoice_number, invoice_number: row.invoice_number, customer_name: row.client_name, client_id: row.client_id, agreement_number: row.agreement_number, due_date: row.scheduled_due_date, payment_term: row.payment_term, currency: row.currency, balance_due: row.remaining_amount, paid_now: row.remaining_amount, payment_notes: `Payment Forecast schedule #${row.payment_no} due ${row.scheduled_due_date}` }); },
  async openClient(id, statement = false) { if (!id) return UI.toast('No client is linked to this scheduled payment.'); if (window.showView) showView('clients'); if (window.Clients?.selectClient) { await Clients.selectClient(id); if (statement && Clients.setDetailTab) Clients.setDetailTab('statement'); } },
  currentUser() { return Permissions.getResolvedCurrentUser?.() || Session?.authContext?.()?.profile || {}; },
  findFollowupRow(id) { return (this.state.rowsByTab.collection_follow_up || []).find(item => item.forecast_row_id === id || item.followup_id === id) || null; },
  followupPayload(row, patch = {}) { const user = this.currentUser(); return { followup_id: row.followup_id || row.id || null, invoice_id: row.invoice_id || null, invoice_number: row.invoice_number, schedule_no: Number(row.payment_no) || null, client_name: row.client_name, assigned_to: user.id || user.user_id || null, assigned_to_email: user.email || '', created_by: user.id || user.user_id || null, created_by_email: user.email || '', updated_at: new Date().toISOString(), ...patch }; },
  followupLogPayload(row, patch = {}) { const user = this.currentUser(); return { followup_id: row.followup_id || row.id || null, invoice_id: row.invoice_id || null, invoice_number: row.invoice_number || '', client_name: row.client_name || '', created_by: user.id || user.user_id || null, created_by_email: user.email || '', ...patch }; },
  async saveFollowup(row, patch) { if (!this.canManage()) return UI.toast('You do not have permission to manage follow-ups.'); await Api.savePaymentForecastFollowup(this.followupPayload(row, patch)); UI.toast('Collection follow-up updated.'); await this.refresh(true); },
  openPaymentForecastAddFollowupNote(row) { if (!this.canView()) return UI.toast('You do not have permission to add follow-up notes.'); if (!row?.followup_id) return UI.toast('This follow-up does not have an ID yet. Edit the follow-up before adding activity.'); this.state.noteRow = row; const modal = document.getElementById('paymentForecastAddNoteModal'), textarea = document.getElementById('paymentForecastAddNoteText'); if (!modal || !textarea) return; textarea.value = ''; modal.hidden = false; document.body.classList.add('pf-modal-open'); setTimeout(() => textarea.focus(), 0); },
  closePaymentForecastAddFollowupNote() { const modal = document.getElementById('paymentForecastAddNoteModal'); if (modal) modal.hidden = true; this.state.noteRow = null; if (document.getElementById('paymentForecastActivityModal')?.hidden !== false) document.body.classList.remove('pf-modal-open'); },
  async savePaymentForecastFollowupNote(row, note) { const cleanNote = this.text(note); if (!cleanNote) throw new Error('A note is required.'); if (!row?.followup_id) throw new Error('Follow-up ID is required to save a note.'); const currentStatus = this.text(row.follow_up_status) || 'not_started'; await Api.createPaymentForecastFollowupLog(this.followupLogPayload(row, { action_type: 'note', note: cleanNote, status_at_time: currentStatus, new_status: currentStatus })); if (this.state.activityRow?.followup_id === row.followup_id) await this.loadPaymentForecastFollowupLogs(row.followup_id); },
  async addFollowupNote(id) { const row = this.findFollowupRow(id); if (row) this.openPaymentForecastAddFollowupNote(row); },
  async editFollowup(id) { if (!this.canManage()) return UI.toast('You do not have permission to manage follow-ups.'); const row = this.findFollowupRow(id); if (!row) return; const status = window.prompt(`Follow-up status (${this.followUpStatuses.join(', ')}):`, row.follow_up_status || 'contacted'); if (status === null) return; const nextAt = window.prompt('Next follow-up date (YYYY-MM-DD, optional):', this.date(row.next_follow_up_at)); if (nextAt === null) return; const customNote = window.prompt('Optional note for this update:', row.follow_up_notes || ''); if (customNote === null) return; const normalized = this.followUpStatuses.includes(status.trim().toLowerCase()) ? status.trim().toLowerCase() : 'contacted'; const patch = { follow_up_status: normalized, next_follow_up_at: nextAt ? `${nextAt}T09:00:00Z` : null }; if (this.text(customNote) !== this.text(row.follow_up_notes)) patch.follow_up_notes = this.text(customNote); await Api.savePaymentForecastFollowup(this.followupPayload(row, patch)); UI.toast('Collection follow-up updated.'); await this.refresh(true); },
  async markFollowedUp(id) { if (!this.canManage()) return UI.toast('You do not have permission to manage follow-ups.'); const row = this.findFollowupRow(id); if (!row) return; if (!row.followup_id) return UI.toast('Follow-up ID is required to mark this row as followed up.'); const currentStatus = this.text(row.follow_up_status) || 'not_started'; await Api.markPaymentForecastFollowedUp(this.followupPayload(row, { last_follow_up_at: new Date().toISOString(), follow_up_status: currentStatus, status_at_time: currentStatus, new_status: currentStatus })); UI.toast('Marked as followed up.'); if (this.state.activityRow?.followup_id === row.followup_id) await this.loadPaymentForecastFollowupLogs(row.followup_id); await this.refresh(true); },
  formatDateTime(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? this.text(value) : date.toLocaleString(); },
  renderPaymentForecastFollowupLogs(logs = []) { if (!logs.length) return '<div class="pf-activity-state muted">No activity logs yet.</div>'; const rowStatus = this.state.activityRow?.follow_up_status; return `<div class="pf-activity-timeline">${logs.map(log => { const creator = log.created_by_name || log.created_by_email || log.created_by || 'Unknown user'; const actionType = this.text(log.action_type || 'activity').toLowerCase(); const action = this.label(actionType); const statusAtTime = this.text(log.status_at_time || log.new_status || log.old_status || rowStatus || '—') || '—'; const isStatusChange = actionType === 'status_changed' || (this.text(log.old_status) && this.text(log.new_status) && this.text(log.old_status) !== this.text(log.new_status)); const statusChange = isStatusChange ? `<div class="pf-activity-entry-status-change"><span>${U.escapeHtml(this.label(log.old_status || '—'))}</span><span aria-hidden="true">→</span><span>${U.escapeHtml(this.label(log.new_status || '—'))}</span></div>` : ''; const note = this.text(log.note) ? `<p class="pf-activity-entry-note">${U.escapeHtml(log.note)}</p>` : ''; return `<article class="pf-activity-entry"><div class="pf-activity-entry-time">${U.escapeHtml(this.formatDateTime(log.created_at || log.logged_at || log.action_at))}</div><div class="pf-activity-entry-title"><span>${U.escapeHtml(action)}</span><span class="muted">by ${U.escapeHtml(creator)}</span><span class="pf-activity-entry-status ${this.statusClass(statusAtTime)}" title="Status at time of activity">${U.escapeHtml(this.label(statusAtTime))}</span></div>${statusChange}${note}</article>`; }).join('')}</div>`; },
  renderActivityModal() { const modal = document.getElementById('paymentForecastActivityModal'), row = this.state.activityRow, content = document.getElementById('paymentForecastActivityContent'); if (!modal || !content || !row) return; document.getElementById('paymentForecastActivityClient').textContent = row.client_name || '—'; document.getElementById('paymentForecastActivityInvoice').textContent = row.invoice_number || '—'; document.getElementById('paymentForecastActivityAgreement').textContent = row.agreement_number || '—'; document.getElementById('paymentForecastActivityPayment').textContent = row.payment_no || '—'; const status = document.getElementById('paymentForecastActivityStatus'); status.textContent = this.label(row.follow_up_status); status.className = this.statusClass(row.follow_up_status); if (this.state.activityLoading) { content.innerHTML = '<div class="pf-activity-state muted">Loading activity…</div>'; return; } if (this.state.activityError) { content.innerHTML = `<div class="pf-activity-state pf-error">${U.escapeHtml(this.state.activityError)}</div>`; return; } content.innerHTML = this.renderPaymentForecastFollowupLogs(this.state.activityLogs || []); },
  async loadPaymentForecastFollowupLogs(followupId) { if (!followupId) { this.state.activityLogs = []; this.state.activityError = 'Follow-up ID is required to load activity.'; this.state.activityLoading = false; this.renderActivityModal(); return []; } this.state.activityLoading = true; this.state.activityError = ''; this.renderActivityModal(); try { this.state.activityLogs = (await Api.getPaymentForecastFollowupLogs(followupId)).map(item => item?.row_data || item).filter(Boolean); return this.state.activityLogs; } catch (error) { this.state.activityLogs = []; this.state.activityError = error.message || 'Unable to load follow-up activity.'; return []; } finally { this.state.activityLoading = false; this.renderActivityModal(); } },
  async openPaymentForecastFollowupActivity(row) { if (!this.canView()) return UI.toast('You do not have permission to view follow-up activity.'); if (!row) return; this.state.activityRow = row; this.state.activityLogs = []; this.state.activityError = ''; const modal = document.getElementById('paymentForecastActivityModal'); if (modal) { modal.hidden = false; document.body.classList.add('pf-modal-open'); } this.renderActivityModal(); await this.loadPaymentForecastFollowupLogs(row.followup_id || row.id); },
  async openActivity(id) { return this.openPaymentForecastFollowupActivity(this.findFollowupRow(id)); },
  closeActivity() { const modal = document.getElementById('paymentForecastActivityModal'); if (modal) modal.hidden = true; if (document.getElementById('paymentForecastAddNoteModal')?.hidden !== false) document.body.classList.remove('pf-modal-open'); this.state.activityRow = null; this.state.activityLogs = []; this.state.activityError = ''; },
  downloadCsv(rows) { const headers = ['Client','Invoice #','Agreement #','Payment #','Due Date','Payment Term','Currency','Scheduled Amount','Paid Amount','Credit Adjustment','Remaining Amount','Status','Follow-up Status']; const csv = [headers, ...rows.map(row => [row.client_name,row.invoice_number,row.agreement_number,row.payment_no,row.scheduled_due_date,row.payment_term,row.currency,row.scheduled_amount,row.paid_amount,row.allocated_credit_amount,row.remaining_amount,this.label(row.forecast_status),this.label(row.follow_up_status)])].map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `receivables_${this.today()}.csv`; a.click(); URL.revokeObjectURL(a.href); },
  async exportCsv() { if (!this.canExport()) return UI.toast('You do not have permission to export Payment Forecast.'); const rows = []; let page = 1, total = Infinity; UI.toast('Preparing filtered Payment Forecast export…'); try { while (rows.length < total) { const data = await Api.getPaymentForecastPage({ ...this.rpcFilters(), p_page: page, p_page_size: 100 }); const items = Array.isArray(data) ? data : []; total = this.n(items[0]?.total_count); rows.push(...items.map(item => item?.row_data).filter(Boolean).map(row => this.normalizeRow(row))); if (!items.length) break; page += 1; } this.downloadCsv(rows); } catch (error) { UI.toast(error.message || 'Unable to export Payment Forecast.'); } },
  async clearFilters() { Object.assign(this.state.filters, { search: '', status: 'all', client: 'all', paymentTerm: 'all', currency: 'all', dateFrom: '', dateTo: '', overdueOnly: false, dueThisWeek: false, dueThisMonth: false, onlyUnpaid: false, followUpStatus: 'all' }); document.querySelectorAll('#paymentForecastFilters input').forEach(input => { input.type === 'checkbox' ? input.checked = false : input.value = ''; }); document.querySelectorAll('#paymentForecastFilters select').forEach(select => { select.value = 'all'; }); await this.filtersChanged(); },
  bind() {
    if (this._bound) return; this._bound = true;
    const map = { paymentForecastSearchInput: 'search', paymentForecastStatusFilter: 'status', paymentForecastClientFilter: 'client', paymentForecastTermFilter: 'paymentTerm', paymentForecastCurrencyFilter: 'currency', paymentForecastDateFrom: 'dateFrom', paymentForecastDateTo: 'dateTo', paymentForecastFollowupFilter: 'followUpStatus', paymentForecastOverdueOnly: 'overdueOnly', paymentForecastDueWeek: 'dueThisWeek', paymentForecastDueMonth: 'dueThisMonth', paymentForecastOnlyUnpaid: 'onlyUnpaid' };
    Object.entries(map).forEach(([id, key]) => document.getElementById(id)?.addEventListener(id.includes('Search') ? 'input' : 'change', event => { this.state.filters[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; clearTimeout(this._filterTimer); this._filterTimer = setTimeout(() => this.filtersChanged(), id.includes('Search') ? 300 : 0); }));
    document.getElementById('paymentForecastRefreshBtn')?.addEventListener('click', () => this.refresh(true)); document.getElementById('paymentForecastExportBtn')?.addEventListener('click', () => this.exportCsv()); document.getElementById('paymentForecastClearBtn')?.addEventListener('click', () => this.clearFilters());
    document.getElementById('paymentForecastActivityModal')?.addEventListener('click', event => { if (event.target.closest('[data-pf-close-activity]')) this.closeActivity(); });
    document.getElementById('paymentForecastAddNoteModal')?.addEventListener('click', event => { if (event.target.closest('[data-pf-close-note]')) this.closePaymentForecastAddFollowupNote(); });
    document.getElementById('paymentForecastAddNoteForm')?.addEventListener('submit', async event => { event.preventDefault(); const row = this.state.noteRow, note = document.getElementById('paymentForecastAddNoteText')?.value; const save = document.getElementById('paymentForecastAddNoteSave'); if (!row || save?.disabled) return; if (save) save.disabled = true; try { await this.savePaymentForecastFollowupNote(row, note); UI.toast('Follow-up note added.'); this.closePaymentForecastAddFollowupNote(); } catch (error) { UI.toast(error.message || 'Unable to add note.'); } finally { if (save) save.disabled = false; } });
    const runAction = (target, event) => { if (!target) return false; event?.stopPropagation(); const { pfAction: action, value } = target.dataset; if (action === 'invoice') this.openInvoice(value); if (action === 'receipt') this.createReceiptForRow(value); if (action === 'client') this.openClient(value); if (action === 'statement') this.openClient(value, true); if (action === 'activity') this.openActivity(value); if (action === 'note' || action === 'add-note') this.addFollowupNote(value).catch(error => UI.toast(error.message || 'Unable to add note.')); if (action === 'edit-followup') this.editFollowup(value).catch(error => UI.toast(error.message || 'Unable to edit follow-up.')); if (action === 'followed') this.markFollowedUp(value).catch(error => UI.toast(error.message || 'Unable to mark as followed up.')); return true; };
    document.getElementById('paymentForecastDetailsDrawer')?.addEventListener('click', event => { if (event.target.closest('[data-pf-close-details]')) return this.closePaymentForecastDetailsDrawer(); runAction(event.target.closest('[data-pf-action]'), event); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (document.getElementById('paymentForecastDetailsDrawer')?.hidden === false) this.closePaymentForecastDetailsDrawer(); else if (document.getElementById('paymentForecastAddNoteModal')?.hidden === false) this.closePaymentForecastAddFollowupNote(); else if (document.getElementById('paymentForecastActivityModal')?.hidden === false) this.closeActivity(); return; } if (!['Enter',' '].includes(event.key)) return; const target = event.target.closest?.('[data-drilldown-metric],[data-pf-drilldown]'); if (target) { event.preventDefault(); target.click(); } });
    document.getElementById('paymentForecastView')?.addEventListener('click', event => { const rawTab = event.target.closest('[data-pf-tab]')?.dataset.pfTab; if (rawTab) { const tab = this.canonicalTab(rawTab); if (tab === this.canonicalTab()) return; this.state.activeTab = tab; this.clearTabBody(); this.loadActiveTab(); return; } const direction = event.target.closest('[data-pf-page]')?.dataset.pfPage; if (direction) { const pagination = this.activePagination(); if (!pagination) return; const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize)); pagination.page = direction === 'next' ? Math.min(totalPages, pagination.page + 1) : Math.max(1, pagination.page - 1); this.loadActiveTab(); return; } if (runAction(event.target.closest('[data-pf-action]'), event)) return; const metric = event.target.closest('[data-drilldown-metric]')?.dataset.drilldownMetric; if (metric) return this.openPaymentForecastDetailsDrawer({ type: 'metric', metric }); const drilldown = event.target.closest('[data-pf-drilldown]'); if (!drilldown) return; const row = (this.state.rowsByTab[this.canonicalTab()] || [])[this.n(drilldown.dataset.pfRowIndex)]; if (!row) return; const type = drilldown.dataset.pfDrilldown; if (type === 'client') return this.openPaymentForecastDetailsDrawer({ type, row, client_name: row.client_name, client_id: row.client_id, company_id: row.company_id }); if (type === 'month') return this.openPaymentForecastDetailsDrawer({ type, row, month: row.forecast_month, currency: row.currency }); this.openPaymentForecastDetailsDrawer({ type, row, followup_id: row.followup_id }); });
  },
  init() { this.bind(); this.renderActiveTab(); }
};
window.PaymentForecast = PaymentForecast;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => PaymentForecast.init()); else PaymentForecast.init();
