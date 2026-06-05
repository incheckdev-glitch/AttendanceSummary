const PaymentForecast = {
  tabs: ['overview', 'upcoming', 'overdue', 'clients', 'monthly', 'followup'],
  followUpStatuses: ['not_started', 'contacted', 'promised_to_pay', 'disputed', 'escalated', 'closed'],
  state: {
    rows: [], followups: [], activeTab: 'overview', loading: false, error: '',
    search: '', status: 'all', client: 'all', paymentTerm: 'all', currency: 'all',
    dateFrom: '', dateTo: '', overdueOnly: false, dueThisWeek: false, dueThisMonth: false,
    onlyUnpaid: false, followUpStatus: 'all'
  },
  text(value) { return String(value ?? '').trim(); },
  n(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; },
  date(value) { return this.text(value).slice(0, 10); },
  today() { return new Date().toISOString().slice(0, 10); },
  addDays(days) { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); },
  money(value, currency = 'USD') { return `${this.text(currency || 'USD').toUpperCase()} ${U.fmtNumber(this.n(value))}`; },
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
    const today = this.today();
    let status = this.text(row.forecast_status || row.status || 'scheduled').toLowerCase() || 'scheduled';
    if (remaining <= 0 && this.n(row.allocated_credit_amount) > 0 && this.n(row.paid_amount) <= 0) status = 'credited';
    else if (remaining <= 0) status = 'paid';
    else if (due && due < today) status = 'overdue';
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
      follow_up_status: this.text(followup.follow_up_status || 'not_started') || 'not_started'
    };
  },
  async refresh(force = false) {
    if (this.state.loading && !force) return;
    if (!this.canView()) { this.state.error = 'You do not have permission to view Payment Forecast.'; this.render(); return; }
    this.state.loading = true; this.state.error = ''; this.render();
    try {
      this.state.followups = await this.fetchTable('payment_forecast_followups', 'updated_at', false, 3000).catch(() => []);
      const rows = await this.fetchTable('payment_forecast_rows', 'scheduled_due_date', true, 5000);
      this.state.rows = rows.map(row => this.normalizeRow(row));
      this.populateFilters();
    } catch (error) {
      console.error('[payment-forecast] load failed', error);
      this.state.error = error.message || 'Unable to load payment forecast.';
      UI.toast(this.state.error);
    } finally { this.state.loading = false; this.render(); }
  },
  filteredRows() {
    const today = this.today(), week = this.addDays(7), month = today.slice(0, 7), q = this.state.search.toLowerCase().trim();
    return this.state.rows.filter(row => {
      if (this.state.status !== 'all' && row.forecast_status !== this.state.status) return false;
      if (this.state.client !== 'all' && row.client_name !== this.state.client) return false;
      if (this.state.paymentTerm !== 'all' && row.payment_term !== this.state.paymentTerm) return false;
      if (this.state.currency !== 'all' && row.currency !== this.state.currency) return false;
      if (this.state.followUpStatus !== 'all' && row.follow_up_status !== this.state.followUpStatus) return false;
      if (this.state.dateFrom && row.scheduled_due_date < this.state.dateFrom) return false;
      if (this.state.dateTo && row.scheduled_due_date > this.state.dateTo) return false;
      if (this.state.overdueOnly && !(row.remaining_amount > 0 && row.scheduled_due_date < today)) return false;
      if (this.state.dueThisWeek && !(row.remaining_amount > 0 && row.scheduled_due_date >= today && row.scheduled_due_date <= week)) return false;
      if (this.state.dueThisMonth && !(row.remaining_amount > 0 && row.scheduled_due_date.slice(0, 7) === month)) return false;
      if (this.state.onlyUnpaid && row.remaining_amount <= 0) return false;
      return !q || [row.client_name, row.invoice_number, row.agreement_number].some(value => this.text(value).toLowerCase().includes(q));
    });
  },
  tabRows(rows = this.filteredRows()) {
    const today = this.today();
    if (this.state.activeTab === 'upcoming') return rows.filter(row => row.remaining_amount > 0 && row.scheduled_due_date >= today);
    if (this.state.activeTab === 'overdue') return rows.filter(row => row.remaining_amount > 0 && row.scheduled_due_date < today).sort((a, b) => a.scheduled_due_date.localeCompare(b.scheduled_due_date));
    if (this.state.activeTab === 'followup') return rows.filter(row => row.remaining_amount > 0).sort((a, b) => (a.next_follow_up_at || '9999').localeCompare(b.next_follow_up_at || '9999'));
    return rows.sort((a, b) => a.scheduled_due_date.localeCompare(b.scheduled_due_date));
  },
  calcSummary(rows = this.filteredRows()) {
    const today = this.today(), week = this.addDays(7), next30 = this.addDays(30), next90 = this.addDays(90), month = today.slice(0, 7);
    const sum = (field, filter = () => true) => rows.filter(filter).reduce((total, row) => total + this.n(row[field]), 0);
    const net = sum('remaining_amount'), overdue = sum('remaining_amount', row => row.remaining_amount > 0 && row.scheduled_due_date < today);
    return { gross: sum('scheduled_amount'), paid: sum('paid_amount'), credit: sum('allocated_credit_amount'), net, overdue,
      week: sum('remaining_amount', row => row.remaining_amount > 0 && row.scheduled_due_date >= today && row.scheduled_due_date <= week),
      month: sum('remaining_amount', row => row.remaining_amount > 0 && row.scheduled_due_date.slice(0, 7) === month),
      next30: sum('remaining_amount', row => row.remaining_amount > 0 && row.scheduled_due_date >= today && row.scheduled_due_date <= next30),
      next90: sum('remaining_amount', row => row.remaining_amount > 0 && row.scheduled_due_date >= today && row.scheduled_due_date <= next90),
      risk: net ? overdue / net * 100 : 0 };
  },
  label(value = '') { const key = this.text(value).toLowerCase(); return ({ due_soon: 'Due Soon', not_started: 'Not Started', promised_to_pay: 'Promised to Pay' })[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Scheduled'; },
  statusClass(status = '') { const key = this.text(status).toLowerCase(); if (['overdue', 'escalated', 'disputed'].includes(key)) return 'status-badge bad'; if (['due_soon', 'promised_to_pay'].includes(key)) return 'status-badge warn'; if (['paid', 'closed', 'contacted'].includes(key)) return 'status-badge ok'; if (key === 'credited') return 'status-badge info'; return 'status-badge'; },
  populateFilters() {
    const populate = (id, values, allLabel, current) => { const el = document.getElementById(id); if (!el) return; el.innerHTML = `<option value="all">${allLabel}</option>` + [...new Set(values.filter(Boolean))].sort().map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(this.label(value))}</option>`).join(''); el.value = [...el.options].some(option => option.value === current) ? current : 'all'; };
    populate('paymentForecastStatusFilter', this.state.rows.map(row => row.forecast_status), 'All statuses', this.state.status);
    populate('paymentForecastClientFilter', this.state.rows.map(row => row.client_name), 'All clients', this.state.client);
    populate('paymentForecastTermFilter', this.state.rows.map(row => row.payment_term), 'All payment terms', this.state.paymentTerm);
    populate('paymentForecastCurrencyFilter', this.state.rows.map(row => row.currency), 'All currencies', this.state.currency);
    populate('paymentForecastFollowupFilter', this.followUpStatuses, 'All follow-up statuses', this.state.followUpStatus);
  },
  renderSummary(rows) {
    const el = document.getElementById('paymentForecastSummary'); if (!el) return;
    const s = this.calcSummary(rows), currency = rows[0]?.currency || 'USD';
    const cards = [['Gross Scheduled', s.gross, 'Before payments and credits', ''], ['Paid Amount', s.paid, 'Receipts allocated', 'is-positive'], ['Credit Adjusted', s.credit, 'Credits allocated', 'is-info'], ['Net Remaining', s.net, 'Receivables outstanding', 'is-highlighted'], ['Overdue Amount', s.overdue, 'Immediate collection attention', 'is-overdue'], ['Due This Week', s.week, 'Next 7 days', 'is-warning'], ['Due This Month', s.month, 'Current calendar month', ''], ['Next 30 Days', s.next30, 'Near-term forecast', ''], ['Next 90 Days', s.next90, 'Quarter forecast', ''], ['Collection Risk %', `${s.risk.toFixed(1)}%`, 'Overdue ÷ net remaining', s.risk > 25 ? 'is-overdue' : '']];
    el.innerHTML = cards.map(([label, value, subtitle, cls]) => `<article class="payment-forecast-summary-card ${cls}"><div class="summary-label">${label}</div><div class="summary-value">${typeof value === 'string' ? value : U.escapeHtml(this.money(value, currency))}</div><div class="summary-subtitle">${subtitle}</div></article>`).join('');
  },
  groupClients(rows) {
    const groups = new Map();
    rows.forEach(row => { const key = `${row.client_id}::${row.client_name}`; if (!groups.has(key)) groups.set(key, { client_id: row.client_id, client_name: row.client_name, currency: row.currency, gross: 0, paid: 0, credit: 0, remaining: 0, overdue: 0, next: '', invoices: new Set() }); const group = groups.get(key); group.gross += row.scheduled_amount; group.paid += row.paid_amount; group.credit += row.allocated_credit_amount; group.remaining += row.remaining_amount; if (row.remaining_amount > 0 && row.scheduled_due_date < this.today()) group.overdue += row.remaining_amount; if (row.remaining_amount > 0 && row.scheduled_due_date >= this.today() && (!group.next || row.scheduled_due_date < group.next)) group.next = row.scheduled_due_date; group.invoices.add(row.invoice_id || row.invoice_number); });
    return [...groups.values()].sort((a, b) => b.remaining - a.remaining);
  },
  groupMonths(rows) {
    const groups = new Map(); rows.forEach(row => { const key = row.scheduled_due_date.slice(0, 7) || 'No date'; if (!groups.has(key)) groups.set(key, { month: key, currency: row.currency, gross: 0, paid: 0, credit: 0, net: 0, overdue: 0, count: 0 }); const group = groups.get(key); group.gross += row.scheduled_amount; group.paid += row.paid_amount; group.credit += row.allocated_credit_amount; group.net += row.remaining_amount; if (row.remaining_amount > 0 && row.scheduled_due_date < this.today()) group.overdue += row.remaining_amount; group.count += 1; }); return [...groups.values()].sort((a, b) => a.month.localeCompare(b.month));
  },
  actionButtons(row, followup = false) { const id = U.escapeAttr(row.forecast_row_id), client = U.escapeAttr(row.client_id), invoice = U.escapeAttr(row.invoice_id || row.invoice_number); return `<div class="pf-actions"><button class="btn ghost xs" data-pf-action="invoice" data-value="${invoice}">Open Invoice</button>${this.canCreateReceipt() && row.remaining_amount > 0 ? `<button class="btn xs" data-pf-action="receipt" data-value="${id}">Create Receipt</button>` : ''}<button class="btn ghost xs" data-pf-action="client" data-value="${client}">Open Client</button><button class="btn ghost xs" data-pf-action="statement" data-value="${client}">Open Statement</button>${this.canManage() ? `<button class="btn ghost xs" data-pf-action="note" data-value="${id}">Add Follow-up Note</button><button class="btn ghost xs" data-pf-action="followed" data-value="${id}">Mark as Followed Up</button>` : ''}</div>`; },
  renderMainTable(rows) {
    const head = ['Client','Invoice #','Agreement #','Payment #','Due Date','Payment Term','Scheduled Amount','Paid Amount','Credit Adjustment','Remaining Amount','Status','Days Until Due / Days Overdue','Follow-up Status','Actions'];
    const body = rows.map(row => `<tr class="${row.forecast_status === 'overdue' ? 'pf-overdue-row' : row.forecast_status === 'due_soon' ? 'pf-due-soon-row' : ''}"><td><strong>${U.escapeHtml(row.client_name)}</strong></td><td>${U.escapeHtml(row.invoice_number)}</td><td>${U.escapeHtml(row.agreement_number || '—')}</td><td>${U.escapeHtml(row.payment_no || '—')}</td><td>${U.escapeHtml(row.scheduled_due_date || '—')}</td><td>${U.escapeHtml(row.payment_term || '—')}</td><td class="num">${U.escapeHtml(this.money(row.scheduled_amount, row.currency))}</td><td class="num">${U.escapeHtml(this.money(row.paid_amount, row.currency))}</td><td class="num">${U.escapeHtml(this.money(row.allocated_credit_amount, row.currency))}</td><td class="num"><strong>${U.escapeHtml(this.money(row.remaining_amount, row.currency))}</strong></td><td><span class="${this.statusClass(row.forecast_status)}">${U.escapeHtml(this.label(row.forecast_status))}</span></td><td>${row.forecast_status === 'overdue' ? `${Math.max(0, Math.floor((new Date(this.today()) - new Date(row.scheduled_due_date)) / 86400000))} days overdue` : `${Math.max(0, Math.ceil((new Date(row.scheduled_due_date) - new Date(this.today())) / 86400000))} days until due`}</td><td><span class="${this.statusClass(row.follow_up_status)}">${U.escapeHtml(this.label(row.follow_up_status))}</span></td><td>${this.actionButtons(row, true)}</td></tr>`).join('');
    return this.table(head, body, 14);
  },
  table(head, body, colspan) { return `<div class="table-scroll"><table id="paymentForecastTable"><thead><tr>${head.map(item => `<th>${item}</th>`).join('')}</tr></thead><tbody id="paymentForecastTbody">${body || `<tr><td colspan="${colspan}" class="muted pf-empty">No receivables match the selected filters.</td></tr>`}</tbody></table></div>`; },
  renderContent(rows) {
    if (this.state.activeTab === 'followup') return this.table(['Client','Invoice #','Payment #','Due Date','Remaining','Collection Status','Last Follow-up','Next Follow-up','Notes','Actions'], this.tabRows(rows).map(row => `<tr class="${row.forecast_status === 'overdue' ? 'pf-overdue-row' : ''}"><td><strong>${U.escapeHtml(row.client_name)}</strong></td><td>${U.escapeHtml(row.invoice_number)}</td><td>${U.escapeHtml(row.payment_no || '—')}</td><td>${U.escapeHtml(row.scheduled_due_date || '—')}</td><td class="num"><strong>${U.escapeHtml(this.money(row.remaining_amount, row.currency))}</strong></td><td><span class="${this.statusClass(row.follow_up_status)}">${U.escapeHtml(this.label(row.follow_up_status))}</span></td><td>${U.escapeHtml(this.date(row.last_follow_up_at) || '—')}</td><td>${U.escapeHtml(this.date(row.next_follow_up_at) || '—')}</td><td class="pf-notes-cell">${U.escapeHtml(row.follow_up_notes || '—')}</td><td>${this.actionButtons(row, true)}</td></tr>`).join(''), 10);
    if (['overview', 'upcoming', 'overdue'].includes(this.state.activeTab)) return this.renderMainTable(this.tabRows(rows));
    if (this.state.activeTab === 'clients') return this.table(['Client','Total Scheduled','Paid','Credit Adjusted','Remaining','Overdue','Next Due Date','Invoice Count','Actions'], this.groupClients(rows).map(group => `<tr><td><strong>${U.escapeHtml(group.client_name)}</strong></td>${['gross','paid','credit','remaining','overdue'].map(field => `<td class="num">${U.escapeHtml(this.money(group[field], group.currency))}</td>`).join('')}<td>${U.escapeHtml(group.next || '—')}</td><td>${group.invoices.size}</td><td><div class="pf-actions"><button class="btn ghost xs" data-pf-action="client" data-value="${U.escapeAttr(group.client_id)}">Open Client</button><button class="btn ghost xs" data-pf-action="statement" data-value="${U.escapeAttr(group.client_id)}">Open Statement</button></div></td></tr>`).join(''), 9);
    return this.table(['Month','Gross Scheduled','Paid','Credit Adjusted','Net Expected','Overdue','Number of Payments'], this.groupMonths(rows).map(group => `<tr><td><strong>${U.escapeHtml(group.month)}</strong></td>${['gross','paid','credit','net','overdue'].map(field => `<td class="num">${U.escapeHtml(this.money(group[field], group.currency))}</td>`).join('')}<td>${group.count}</td></tr>`).join(''), 7);
  },
  render() {
    const summary = document.getElementById('paymentForecastSummary'), content = document.getElementById('paymentForecastContent'), state = document.getElementById('paymentForecastState'); if (!content || !state) return;
    document.querySelectorAll('[data-pf-tab]').forEach(button => { const active = button.dataset.pfTab === this.state.activeTab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    const rows = this.filteredRows(); this.renderSummary(rows); summary?.classList.toggle('is-hidden', this.state.activeTab !== 'overview');
    if (this.state.loading) { state.textContent = 'Loading receivables dashboard…'; content.innerHTML = '<div class="muted pf-empty">Loading receivables dashboard…</div>'; return; }
    if (this.state.error) { state.textContent = this.state.error; content.innerHTML = `<div class="muted pf-empty">${U.escapeHtml(this.state.error)}</div>`; return; }
    state.textContent = `${this.tabRows(rows).length} payment schedule row${this.tabRows(rows).length === 1 ? '' : 's'} shown.`; content.innerHTML = this.renderContent(rows);
  },
  async openInvoice(value) { if (window.Invoices?.openInvoiceById) return Invoices.openInvoiceById(value, { readOnly: true }).catch(error => UI.toast(error.message)); UI.toast('Invoice module is not ready.'); },
  async createReceiptForRow(id) { const row = this.state.rows.find(item => item.forecast_row_id === id); if (!row || !this.canCreateReceipt()) return UI.toast('Receipt creation is not available for this row.'); return Receipts?.openCreateFromInvoice?.({ id: row.invoice_id, invoice_uuid: row.invoice_id, invoice_id: row.invoice_number, invoice_number: row.invoice_number, customer_name: row.client_name, client_id: row.client_id, agreement_number: row.agreement_number, due_date: row.scheduled_due_date, payment_term: row.payment_term, currency: row.currency, balance_due: row.remaining_amount, paid_now: row.remaining_amount, payment_notes: `Payment Forecast schedule #${row.payment_no} due ${row.scheduled_due_date}` }); },
  async openClient(id, statement = false) { if (!id) return UI.toast('No client is linked to this scheduled payment.'); if (window.showView) showView('clients'); if (window.Clients?.selectClient) { await Clients.selectClient(id); if (statement && Clients.setDetailTab) Clients.setDetailTab('statement'); } },
  async saveFollowup(row, patch) { if (!this.canManage()) return UI.toast('You do not have permission to manage follow-ups.'); const user = Permissions.getResolvedCurrentUser?.() || Session?.authContext?.()?.profile || {}; const payload = { invoice_id: row.invoice_id || null, invoice_number: row.invoice_number, schedule_no: Number(row.payment_no) || null, client_name: row.client_name, assigned_to: user.id || user.user_id || null, assigned_to_email: user.email || '', created_by: user.id || user.user_id || null, created_by_email: user.email || '', updated_at: new Date().toISOString(), ...patch }; const existing = this.state.followups.find(item => `${item.invoice_id || item.invoice_number || ''}::${item.schedule_no || ''}` === this.followupKey(row)); let query = existing?.id ? this.getClient().from('payment_forecast_followups').update(payload).eq('id', existing.id) : this.getClient().from('payment_forecast_followups').insert(payload); const { error } = await query; if (error) throw error; UI.toast('Collection follow-up updated.'); await this.refresh(true); },
  async addFollowupNote(id) { const row = this.state.rows.find(item => item.forecast_row_id === id); if (!row) return; const notes = window.prompt('Add a collection follow-up note:', row.follow_up_notes || ''); if (notes === null) return; const status = window.prompt(`Follow-up status (${this.followUpStatuses.join(', ')}):`, row.follow_up_status || 'contacted'); if (status === null) return; const nextAt = window.prompt('Next follow-up date (YYYY-MM-DD, optional):', this.date(row.next_follow_up_at)); if (nextAt === null) return; const normalized = this.followUpStatuses.includes(status.trim().toLowerCase()) ? status.trim().toLowerCase() : 'contacted'; await this.saveFollowup(row, { follow_up_notes: notes, follow_up_status: normalized, last_follow_up_at: new Date().toISOString(), next_follow_up_at: nextAt ? `${nextAt}T09:00:00Z` : null }).catch(error => UI.toast(error.message || 'Unable to save follow-up.')); },
  exportCsv() { if (!this.canExport()) return UI.toast('You do not have permission to export Payment Forecast.'); const rows = this.tabRows(); const headers = ['Client','Invoice #','Agreement #','Payment #','Due Date','Payment Term','Currency','Scheduled Amount','Paid Amount','Credit Adjustment','Remaining Amount','Status','Follow-up Status']; const csv = [headers, ...rows.map(row => [row.client_name,row.invoice_number,row.agreement_number,row.payment_no,row.scheduled_due_date,row.payment_term,row.currency,row.scheduled_amount,row.paid_amount,row.allocated_credit_amount,row.remaining_amount,this.label(row.forecast_status),this.label(row.follow_up_status)])].map(cols => cols.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `receivables_${this.today()}.csv`; a.click(); URL.revokeObjectURL(a.href); },
  clearFilters() { Object.assign(this.state, { search: '', status: 'all', client: 'all', paymentTerm: 'all', currency: 'all', dateFrom: '', dateTo: '', overdueOnly: false, dueThisWeek: false, dueThisMonth: false, onlyUnpaid: false, followUpStatus: 'all' }); document.querySelectorAll('#paymentForecastFilters input').forEach(input => { input.type === 'checkbox' ? input.checked = false : input.value = ''; }); this.populateFilters(); this.render(); },
  bind() {
    if (this._bound) return; this._bound = true;
    const map = { paymentForecastSearchInput: 'search', paymentForecastStatusFilter: 'status', paymentForecastClientFilter: 'client', paymentForecastTermFilter: 'paymentTerm', paymentForecastCurrencyFilter: 'currency', paymentForecastDateFrom: 'dateFrom', paymentForecastDateTo: 'dateTo', paymentForecastFollowupFilter: 'followUpStatus', paymentForecastOverdueOnly: 'overdueOnly', paymentForecastDueWeek: 'dueThisWeek', paymentForecastDueMonth: 'dueThisMonth', paymentForecastOnlyUnpaid: 'onlyUnpaid' };
    Object.entries(map).forEach(([id, key]) => document.getElementById(id)?.addEventListener(['overdueOnly','dueThisWeek','dueThisMonth','onlyUnpaid'].includes(key) ? 'change' : (id.includes('Search') ? 'input' : 'change'), event => { this.state[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; this.render(); }));
    document.getElementById('paymentForecastRefreshBtn')?.addEventListener('click', () => this.refresh(true)); document.getElementById('paymentForecastExportBtn')?.addEventListener('click', () => this.exportCsv()); document.getElementById('paymentForecastClearBtn')?.addEventListener('click', () => this.clearFilters());
    document.getElementById('paymentForecastView')?.addEventListener('click', event => { const tab = event.target.closest('[data-pf-tab]')?.dataset.pfTab; if (tab) { this.state.activeTab = tab; this.render(); return; } const target = event.target.closest('[data-pf-action]'); if (!target) return; const { pfAction: action, value } = target.dataset; if (action === 'invoice') this.openInvoice(value); if (action === 'receipt') this.createReceiptForRow(value); if (action === 'client') this.openClient(value); if (action === 'statement') this.openClient(value, true); if (action === 'note') this.addFollowupNote(value); if (action === 'followed') { const row = this.state.rows.find(item => item.forecast_row_id === value); if (row) this.saveFollowup(row, { follow_up_status: 'contacted', last_follow_up_at: new Date().toISOString() }).catch(error => UI.toast(error.message)); } });
  },
  init() { this.bind(); this.render(); }
};
window.PaymentForecast = PaymentForecast;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => PaymentForecast.init()); else PaymentForecast.init();
