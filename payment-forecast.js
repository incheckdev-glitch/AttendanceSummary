const PaymentForecast = {
  state: {
    rows: [],
    monthly: [],
    clientDistribution: [],
    statusSummary: [],
    loading: false,
    search: '',
    status: 'all',
    client: 'all',
    dateFrom: '',
    dateTo: '',
    onlyUnpaid: false,
    error: ''
  },
  text(value) { return String(value ?? '').trim(); },
  n(value) { const num = Number(value); return Number.isFinite(num) ? num : 0; },
  date(value) { return this.text(value).slice(0, 10); },
  money(value, currency = 'USD') { return `${this.text(currency || 'USD').toUpperCase()} ${U.fmtNumber(this.n(value))}`; },
  canView() {
    return !window.Permissions || Permissions.can('payment_forecast', 'view') || Permissions.can('payment_forecast', 'manage') || Permissions.hasAdminOverride?.();
  },
  canExport() {
    return !window.Permissions || Permissions.can('payment_forecast', 'export') || Permissions.can('payment_forecast', 'manage') || Permissions.hasAdminOverride?.();
  },
  canCreateReceipt() {
    return !window.Permissions || Permissions.can('payment_forecast', 'create_receipt') || Permissions.can('payment_forecast', 'manage') || Permissions.hasAdminOverride?.();
  },
  getClient() {
    const client = window.SupabaseClient?.getClient?.();
    if (!client) throw new Error('Supabase is not configured.');
    return client;
  },
  async fetchView(view, orderColumn = null, ascending = true, limit = 2000) {
    let query = this.getClient().from(view).select('*').limit(limit);
    if (orderColumn) query = query.order(orderColumn, { ascending, nullsFirst: false });
    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },
  async refresh(force = false) {
    if (this.state.loading && !force) return;
    if (!this.canView()) {
      this.state.error = 'You do not have permission to view Payment Forecast.';
      this.render();
      return;
    }
    this.state.loading = true;
    this.state.error = '';
    this.render();
    try {
      const [rows, monthly, clients, statuses] = await Promise.all([
        this.fetchView('payment_forecast_rows', 'scheduled_due_date', true, 3000),
        this.fetchView('payment_forecast_monthly_summary', 'forecast_month', true, 120).catch(() => []),
        this.fetchView('payment_forecast_client_distribution', 'net_expected_amount', false, 500).catch(() => []),
        this.fetchView('payment_forecast_status_summary', 'forecast_status', true, 50).catch(() => [])
      ]);
      this.state.rows = rows.map(row => this.normalizeRow(row));
      this.state.monthly = monthly;
      this.state.clientDistribution = clients;
      this.state.statusSummary = statuses;
      this.populateFilters();
    } catch (error) {
      console.error('[payment-forecast] load failed', error);
      this.state.error = `${error.message || 'Unable to load payment forecast.'} Run PAYMENT_FORECAST_FINAL_SETUP.sql if this is the first deployment.`;
      UI.toast(this.state.error);
    } finally {
      this.state.loading = false;
      this.render();
    }
  },
  normalizeRow(row = {}) {
    const remaining = this.n(row.remaining_amount);
    const status = this.text(row.forecast_status || row.status || 'scheduled').toLowerCase() || 'scheduled';
    return {
      ...row,
      forecast_row_id: this.text(row.forecast_row_id || `${row.invoice_id || row.invoice_number || ''}-${row.payment_no || row.schedule_no || ''}`),
      invoice_id: this.text(row.invoice_id),
      invoice_number: this.text(row.invoice_number || row.invoice_business_id || row.invoice_id),
      agreement_number: this.text(row.agreement_number || row.agreement_id),
      client_name: this.text(row.client_name || row.customer_name || row.company_name || 'Unknown Client'),
      scheduled_due_date: this.date(row.scheduled_due_date || row.due_date),
      payment_no: this.text(row.payment_no || row.schedule_no),
      payment_term: this.text(row.payment_term || row.schedule_label || ''),
      currency: this.text(row.currency || 'USD') || 'USD',
      scheduled_amount: this.n(row.scheduled_amount),
      paid_amount: this.n(row.paid_amount),
      allocated_credit_amount: this.n(row.allocated_credit_amount),
      remaining_amount: remaining,
      forecast_status: status,
      days_overdue: this.n(row.days_overdue),
      days_until_due: this.n(row.days_until_due)
    };
  },
  filteredRows() {
    const q = this.state.search.toLowerCase().trim();
    const status = this.text(this.state.status || 'all').toLowerCase();
    const client = this.text(this.state.client || 'all').toLowerCase();
    const from = this.date(this.state.dateFrom);
    const to = this.date(this.state.dateTo);
    return this.state.rows.filter(row => {
      if (status && status !== 'all' && row.forecast_status !== status) return false;
      if (client && client !== 'all' && row.client_name.toLowerCase() !== client) return false;
      if (from && row.scheduled_due_date && row.scheduled_due_date < from) return false;
      if (to && row.scheduled_due_date && row.scheduled_due_date > to) return false;
      if (this.state.onlyUnpaid && row.remaining_amount <= 0) return false;
      if (!q) return true;
      return [row.client_name, row.invoice_number, row.agreement_number, row.payment_term, row.forecast_status, row.currency]
        .some(value => String(value || '').toLowerCase().includes(q));
    }).sort((a, b) => String(a.scheduled_due_date || '').localeCompare(String(b.scheduled_due_date || '')) || a.client_name.localeCompare(b.client_name));
  },
  populateFilters() {
    const statusEl = E.paymentForecastStatusFilter || document.getElementById('paymentForecastStatusFilter');
    const clientEl = E.paymentForecastClientFilter || document.getElementById('paymentForecastClientFilter');
    if (statusEl) {
      const current = this.state.status || statusEl.value || 'all';
      const statuses = Array.from(new Set(this.state.rows.map(row => row.forecast_status).filter(Boolean))).sort();
      statusEl.innerHTML = ['all', ...statuses].map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(value === 'all' ? 'All Statuses' : this.labelStatus(value))}</option>`).join('');
      statusEl.value = Array.from(statusEl.options).some(o => o.value === current) ? current : 'all';
      this.state.status = statusEl.value;
    }
    if (clientEl) {
      const current = this.state.client || clientEl.value || 'all';
      const clients = Array.from(new Set(this.state.rows.map(row => row.client_name).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      clientEl.innerHTML = ['all', ...clients].map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(value === 'all' ? 'All Clients' : value)}</option>`).join('');
      clientEl.value = Array.from(clientEl.options).some(o => o.value === current) ? current : 'all';
      this.state.client = clientEl.value;
    }
  },
  labelStatus(value = '') {
    const key = this.text(value).toLowerCase();
    return ({ due_soon: 'Due Soon', scheduled: 'Scheduled', overdue: 'Overdue', paid: 'Paid', credited: 'Credited' })[key] || (key ? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Scheduled');
  },
  statusClass(status = '') {
    const key = this.text(status).toLowerCase();
    if (key === 'overdue') return 'status-badge bad';
    if (key === 'due_soon') return 'status-badge warn';
    if (key === 'paid' || key === 'credited') return 'status-badge ok';
    return 'status-badge';
  },
  calcSummary(rows = this.filteredRows()) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const addDays = days => new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
    const month = todayStr.slice(0, 7);
    const sumWhere = fn => rows.filter(fn).reduce((sum, row) => sum + this.n(row.remaining_amount), 0);
    const totalScheduledGross = rows.reduce((sum, row) => sum + this.n(row.scheduled_amount), 0);
    const totalPaid = rows.reduce((sum, row) => sum + this.n(row.paid_amount), 0);
    const totalCredit = rows.reduce((sum, row) => sum + this.n(row.allocated_credit_amount), 0);
    const totalRemaining = rows.reduce((sum, row) => sum + this.n(row.remaining_amount), 0);
    const collectedThisMonth = rows.filter(row => String(row.scheduled_due_date || '').slice(0, 7) === month).reduce((sum, row) => sum + this.n(row.paid_amount), 0);
    return {
      rows: rows.length,
      totalScheduledGross,
      totalPaid,
      totalCredit,
      totalRemaining,
      overdue: sumWhere(row => row.forecast_status === 'overdue'),
      dueThisWeek: sumWhere(row => row.remaining_amount > 0 && row.scheduled_due_date >= todayStr && row.scheduled_due_date <= addDays(7)),
      dueThisMonth: sumWhere(row => row.remaining_amount > 0 && String(row.scheduled_due_date || '').slice(0, 7) === month),
      next30: sumWhere(row => row.remaining_amount > 0 && row.scheduled_due_date >= todayStr && row.scheduled_due_date <= addDays(30)),
      next60: sumWhere(row => row.remaining_amount > 0 && row.scheduled_due_date >= todayStr && row.scheduled_due_date <= addDays(60)),
      next90: sumWhere(row => row.remaining_amount > 0 && row.scheduled_due_date >= todayStr && row.scheduled_due_date <= addDays(90)),
      collectedThisMonth
    };
  },
  renderSummary(rows) {
    const el = E.paymentForecastSummary || document.getElementById('paymentForecastSummary');
    if (!el) return;
    const s = this.calcSummary(rows);
    const currency = rows.find(row => row.currency)?.currency || 'USD';
    el.classList.add('payment-forecast-summary');
    const card = (label, value, subtitle, emphasis = '') => `
      <article class="payment-forecast-summary-card${emphasis ? ` ${U.escapeAttr(emphasis)}` : ''}">
        <div class="summary-label">${U.escapeHtml(label)}</div>
        <div class="summary-value">${U.escapeHtml(value)}</div>
        <div class="summary-subtitle">${U.escapeHtml(subtitle)}</div>
      </article>`;
    el.innerHTML = `<div class="payment-forecast-summary-grid">${[
      card('Scheduled Rows', U.fmtNumber(s.rows), 'All clients'),
      card('Gross Scheduled', this.money(s.totalScheduledGross, currency), 'Before payments/credits', 'is-highlighted'),
      card('Remaining Forecast', this.money(s.totalRemaining, currency), 'Net expected', 'is-highlighted'),
      card('Overdue Amount', this.money(s.overdue, currency), 'Needs follow-up', 'is-overdue'),
      card('Due This Week', this.money(s.dueThisWeek, currency), 'Next 7 days'),
      card('Due This Month', this.money(s.dueThisMonth, currency), 'Current month'),
      card('Next 30 Days', this.money(s.next30, currency), 'Upcoming receivables'),
      card('Next 90 Days', this.money(s.next90, currency), 'Longer horizon')
    ].join('')}</div>`;
  },
  renderAnalytics(rows) {
    const el = E.paymentForecastAnalytics || document.getElementById('paymentForecastAnalytics');
    if (!el) return;
    const currency = rows.find(row => row.currency)?.currency || 'USD';
    const topClients = Array.from(rows.reduce((map, row) => {
      const key = row.client_name || 'Unknown Client';
      map.set(key, (map.get(key) || 0) + this.n(row.remaining_amount));
      return map;
    }, new Map()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const byStatus = Array.from(rows.reduce((map, row) => {
      const key = this.labelStatus(row.forecast_status);
      map.set(key, (map.get(key) || 0) + this.n(row.remaining_amount));
      return map;
    }, new Map()).entries()).sort((a, b) => b[1] - a[1]);
    const byMonth = Array.from(rows.reduce((map, row) => {
      const key = String(row.scheduled_due_date || '').slice(0, 7) || 'No date';
      map.set(key, (map.get(key) || 0) + this.n(row.remaining_amount));
      return map;
    }, new Map()).entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 8);
    const list = items => items.length ? items.map(([label, amount]) => `<div class="pf-mini-row"><span>${U.escapeHtml(label)}</span><strong>${U.escapeHtml(this.money(amount, currency))}</strong></div>`).join('') : '<div class="muted">No data.</div>';
    el.innerHTML = `
      <div class="card pf-analytics-card"><strong>Top Clients by Upcoming Amount</strong>${list(topClients)}</div>
      <div class="card pf-analytics-card"><strong>Distribution by Status</strong>${list(byStatus)}</div>
      <div class="card pf-analytics-card"><strong>Monthly Forecast</strong>${list(byMonth)}</div>
    `;
  },
  render() {
    const stateEl = E.paymentForecastState || document.getElementById('paymentForecastState');
    const tbody = E.paymentForecastTbody || document.getElementById('paymentForecastTbody');
    if (!tbody || !stateEl) return;
    const rows = this.filteredRows();
    this.renderSummary(rows);
    this.renderAnalytics(rows);
    if (this.state.loading) {
      stateEl.textContent = 'Loading payment forecast…';
      tbody.innerHTML = '<tr><td colspan="13" class="muted" style="text-align:center;">Loading payment forecast…</td></tr>';
      return;
    }
    if (this.state.error) {
      stateEl.textContent = this.state.error;
      tbody.innerHTML = `<tr><td colspan="13" class="muted" style="text-align:center;">${U.escapeHtml(this.state.error)}</td></tr>`;
      return;
    }
    stateEl.textContent = `${rows.length} scheduled payment${rows.length === 1 ? '' : 's'} shown across all clients.`;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="13" class="muted" style="text-align:center;">No scheduled payments found. Run the SQL setup and make sure invoice_payment_schedule has rows.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(row => {
      const balance = this.n(row.remaining_amount);
      const canReceipt = this.canCreateReceipt() && balance > 0 && row.invoice_id;
      return `<tr>
        <td>${U.escapeHtml(row.client_name)}</td>
        <td>${U.escapeHtml(row.invoice_number)}</td>
        <td>${U.escapeHtml(row.agreement_number || '—')}</td>
        <td>${U.escapeHtml(row.payment_no || '—')}</td>
        <td>${U.escapeHtml(row.scheduled_due_date || '—')}</td>
        <td>${U.escapeHtml(row.payment_term || row.schedule_label || '—')}</td>
        <td class="num">${U.escapeHtml(this.money(row.scheduled_amount, row.currency))}</td>
        <td class="num">${U.escapeHtml(this.money(row.paid_amount, row.currency))}</td>
        <td class="num">${U.escapeHtml(this.money(row.allocated_credit_amount, row.currency))}</td>
        <td class="num"><strong>${U.escapeHtml(this.money(balance, row.currency))}</strong></td>
        <td><span class="${this.statusClass(row.forecast_status)}">${U.escapeHtml(this.labelStatus(row.forecast_status))}</span></td>
        <td>${U.escapeHtml(row.forecast_status === 'overdue' ? `${row.days_overdue} overdue` : `${row.days_until_due} days`)}</td>
        <td class="actions-cell">
          <button class="btn ghost xs" type="button" data-payment-forecast-open-invoice="${U.escapeAttr(row.invoice_id || row.invoice_number)}">Invoice</button>
          ${canReceipt ? `<button class="btn xs" type="button" data-payment-forecast-create-receipt="${U.escapeAttr(row.forecast_row_id)}">Receipt</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  },
  exportCsv() {
    if (!this.canExport()) return UI.toast('You do not have permission to export Payment Forecast.');
    const rows = this.filteredRows();
    const headers = ['Client','Invoice #','Agreement #','Payment #','Due Date','Payment Term','Currency','Scheduled Amount','Paid Amount','Credit Adjustment','Remaining Amount','Status','Days Overdue','Days Until Due'];
    const body = rows.map(row => [row.client_name, row.invoice_number, row.agreement_number, row.payment_no, row.scheduled_due_date, row.payment_term, row.currency, row.scheduled_amount, row.paid_amount, row.allocated_credit_amount, row.remaining_amount, this.labelStatus(row.forecast_status), row.days_overdue, row.days_until_due]);
    const csv = [headers, ...body].map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `payment_forecast_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  async openInvoice(value) {
    const id = this.text(value);
    if (!id) return;
    if (window.Invoices?.openInvoiceById) {
      await Invoices.openInvoiceById(id, { readOnly: true }).catch(error => UI.toast(error.message || 'Unable to open invoice.'));
      return;
    }
    UI.toast('Invoice module is not ready.');
  },
  async createReceiptForRow(rowId) {
    const row = this.state.rows.find(item => item.forecast_row_id === rowId);
    if (!row) return UI.toast('Scheduled payment row not found.');
    if (!this.canCreateReceipt()) return UI.toast('You do not have permission to create receipts from Payment Forecast.');
    if (window.Receipts?.openCreateFromInvoice) {
      await Receipts.openCreateFromInvoice({
        id: row.invoice_id,
        invoice_uuid: row.invoice_id,
        invoice_id: row.invoice_business_id || row.invoice_number,
        invoice_number: row.invoice_number,
        customer_name: row.client_name,
        customer_legal_name: row.client_name,
        company_id: row.company_id,
        client_id: row.client_id,
        agreement_id: row.agreement_id,
        agreement_number: row.agreement_number,
        due_date: row.invoice_due_date || row.scheduled_due_date,
        payment_term: row.payment_term,
        currency: row.currency,
        grand_total: row.invoice_total,
        amount_paid: row.invoice_amount_paid,
        balance_due: row.remaining_amount,
        paid_now: row.remaining_amount,
        payment_notes: `Payment Forecast schedule #${row.payment_no || ''} due ${row.scheduled_due_date || ''}`
      });
      return;
    }
    UI.toast('Receipt creation is not available yet.');
  },
  bind() {
    if (this._bound) return;
    if (typeof cacheEls === 'function') cacheEls();
    this._bound = true;
    const byId = id => (typeof E !== 'undefined' && E[id]) || document.getElementById(id);
    byId('paymentForecastRefreshBtn')?.addEventListener('click', () => this.refresh(true));
    byId('paymentForecastExportBtn')?.addEventListener('click', () => this.exportCsv());
    byId('paymentForecastSearchInput')?.addEventListener('input', e => { this.state.search = e.target.value || ''; this.render(); });
    byId('paymentForecastStatusFilter')?.addEventListener('change', e => { this.state.status = e.target.value || 'all'; this.render(); });
    byId('paymentForecastClientFilter')?.addEventListener('change', e => { this.state.client = e.target.value || 'all'; this.render(); });
    byId('paymentForecastDateFrom')?.addEventListener('change', e => { this.state.dateFrom = e.target.value || ''; this.render(); });
    byId('paymentForecastDateTo')?.addEventListener('change', e => { this.state.dateTo = e.target.value || ''; this.render(); });
    byId('paymentForecastOnlyUnpaid')?.addEventListener('change', e => { this.state.onlyUnpaid = Boolean(e.target.checked); this.render(); });
    byId('paymentForecastTbody')?.addEventListener('click', e => {
      const invoice = e.target.closest('[data-payment-forecast-open-invoice]')?.dataset.paymentForecastOpenInvoice;
      const receipt = e.target.closest('[data-payment-forecast-create-receipt]')?.dataset.paymentForecastCreateReceipt;
      if (invoice) this.openInvoice(invoice);
      if (receipt) this.createReceiptForRow(receipt);
    });
  },
  init() { this.bind(); this.render(); }
};
window.PaymentForecast = PaymentForecast;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => PaymentForecast.init());
else PaymentForecast.init();
