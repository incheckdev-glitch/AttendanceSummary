const Receipts = {
  RECEIPT_ALLOWED_COLUMNS: new Set([
    'id',
    'receipt_id',
    'receipt_number',
    'invoice_id',
    'invoice_number',
    'client_id',
    'client_name',
    'invoice_total',
    'old_paid_total',
    'paid_now',
    'received_amount',
    'amount_received',
    'new_paid_total',
    'pending_amount',
    'payment_state',
    'payment_conclusion',
    'payment_method',
    'payment_reference',
    'payment_notes',
    'status',
    'notes',
    'currency',
    'support_email',
    'customer_name',
    'customer_legal_name',
    'customer_address',
    'amount_in_words',
    'is_settlement',
    'created_at',
    'updated_at',
    'receipt_date'
  ]),
  receiptFields: [
    'id',
    'receipt_id',
    'receipt_number',
    'invoice_id',
    'client_id',
    'invoice_number',
    'agreement_id',
    'customer_name',
    'customer_legal_name',
    'customer_address',
    'customer_contact_name',
    'customer_contact_email',
    'receipt_date',
    'currency',
    'subtotal_locations',
    'subtotal_one_time',
    'invoice_total',
    'old_paid_total',
    'paid_now',
    'new_paid_total',
    'payment_conclusion',
    'amount_received',
    'pending_amount',
    'payment_state',
    'amount_in_words',
    'payment_notes',
    'provider_legal_name',
    'provider_address',
    'support_email',
    'status',
    'generated_by',
    'created_at',
    'updated_at'
  ],
  state: {
    rows: [],
    filteredRows: [],
    loading: false,
    loadError: '',
    initialized: false,
    search: '',
    invoiceNumber: '',
    customerName: '',
    status: 'All',
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    total: 0,
    kpiFilter: 'total',
    selectedReceipt: null,
    items: [],
    saveInFlight: false,
    detailCacheById: {},
    detailCacheTtlMs: 90 * 1000,
    openingReceiptIds: new Set(),
    rowActionInFlight: new Set()
  },
  toNumberSafe(value) {
    return U.toMoneyNumber(value);
  },
  normalizeMoney(value) {
    return this.toNumberSafe(value);
  },
  formatMoney(value) {
    return this.toNumberSafe(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  },
  sanitizeText(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return '';
    const lower = normalized.toLowerCase();
    if (lower === 'undefined' || lower === 'null' || lower === 'n/a') return '';
    return normalized;
  },
  normalizeInvoiceFinancials(invoice = {}) {
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    const invoiceTotal = this.toNumberSafe(pickDefined(invoice.invoice_total, invoice.grand_total, invoice.total_amount));
    const amountPaid = this.toNumberSafe(pickDefined(invoice.amount_paid, invoice.received_amount, invoice.paid_amount));
    const pendingInput = pickDefined(invoice.pending_amount, invoice.amount_due, invoice.balance_due, invoice.balance_after);
    const pendingAmount = pendingInput === undefined ? Math.max(0, invoiceTotal - amountPaid) : this.toNumberSafe(pendingInput);
    return {
      invoice_total: invoiceTotal,
      amount_paid: amountPaid,
      pending_amount: pendingAmount,
      payment_state: U.calculatePaymentState(invoiceTotal, amountPaid)
    };
  },
  receiptAmountInWords(value, currency = 'USD', fallbackAmount = 0) {
    const explicit = this.sanitizeText(value);
    if (explicit) return explicit;
    const amountInWords = window.Invoices?.amountToWords?.(fallbackAmount, currency);
    if (typeof amountInWords === 'string' && amountInWords.trim()) return amountInWords.trim();
    return `${this.money(currency, fallbackAmount)} only`;
  },
  normalizeReceipt(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    const normalized = {};
    this.receiptFields.forEach(field => {
      const camel = field.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
      const value = source[field] ?? source[camel] ?? '';
      normalized[field] = typeof value === 'string' ? value.trim() : value;
    });
    normalized.id = String(source.id || '').trim();
    normalized.receipt_id = String(normalized.receipt_id || '').trim();
    normalized.receipt_number = String(normalized.receipt_number || '').trim();
    normalized.currency = String(normalized.currency || '').trim() || 'USD';
    normalized.status = String(normalized.status || '').trim() || 'Issued';
    const normalizedReceiptDate = this.normalizeDateValue(
      pickDefined(source.receipt_date, source.receiptDate, source.created_at, source.createdAt)
    );
    normalized.receipt_date = normalizedReceiptDate || String(normalized.receipt_date || '').trim();
    normalized.receiptDate = normalized.receipt_date;
    normalized.invoice_total = this.toNumberSafe(normalized.invoice_total ?? source.invoice_grand_total ?? source.grand_total);
    const amountReceived = this.getReceiptAmountValue({
      amount_received: normalized.amount_received,
      received_amount: normalized.received_amount,
      paid_now: normalized.paid_now
    });
    normalized.old_paid_total = this.toNumberSafe(normalized.old_paid_total);
    normalized.paid_now = this.toNumberSafe(
      normalized.paid_now !== '' && normalized.paid_now !== null && normalized.paid_now !== undefined
        ? normalized.paid_now
        : amountReceived
    );
    const snapshot = this.calculatePaymentSnapshot({
      invoiceTotal: normalized.invoice_total,
      oldPaidTotal: normalized.old_paid_total,
      paidNow: normalized.paid_now
    });
    normalized.new_paid_total = this.toNumberSafe(
      normalized.new_paid_total !== '' && normalized.new_paid_total !== null && normalized.new_paid_total !== undefined
        ? normalized.new_paid_total
        : snapshot.new_paid_total
    );
    const receivedAmountValue = this.getReceiptAmountValue({
      amount_received: normalized.amount_received,
      received_amount: normalized.received_amount,
      paid_now: normalized.paid_now
    });
    normalized.amount_received = this.toNumberSafe(receivedAmountValue || normalized.paid_now);
    normalized.received_amount = normalized.amount_received;
    const pendingAmountValue =
      normalized.pending_amount !== '' && normalized.pending_amount !== null && normalized.pending_amount !== undefined
        ? normalized.pending_amount
        : null;
    normalized.pending_amount = pendingAmountValue === null ? snapshot.pending_amount : this.toNumberSafe(pendingAmountValue);
    normalized.payment_state = String(normalized.payment_state || '').trim() || snapshot.payment_state;
    normalized.payment_conclusion = String(normalized.payment_conclusion || '').trim() || snapshot.payment_conclusion;
    return normalized;
  },
  isSettlementReceipt(receipt = {}) {
    const status = this.normalizeText(receipt?.status);
    const pendingAmount = this.toNumberSafe(receipt?.pending_amount);
    const paymentState = this.normalizeText(receipt?.payment_state);
    return status === 'settlement' || receipt?.is_settlement === true || pendingAmount === 0 || paymentState === 'fully paid';
  },
  receiptTypeLabel(receipt = {}) {
    return this.isSettlementReceipt(receipt) ? 'Settlement' : 'Receipt';
  },
  isOneTimeSection(section) {
    const raw = String(section || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ['one_time_fee', 'one_time', 'setup', 'non_recurring'].includes(raw);
  },
  normalizeItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => values.find(v => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === ''));
    const rawSection = pick(source.section, source.item_section, source.itemSection, source.type, source.category);
    const section = this.isOneTimeSection(rawSection) ? 'one_time_fee' : 'location_details';
    const description = this.sanitizeText(pick(source.description));
    const parsedLocationAndModule = description.includes(' - ')
      ? description.split(' - ').map(part => part.trim())
      : [];
    const parsedLocation = parsedLocationAndModule[0] || '';
    const parsedModule = parsedLocationAndModule.slice(1).join(' - ') || '';
    return {
      id: String(pick(source.id)).trim(),
      receipt_item_id: String(pick(source.receipt_item_id, source.receiptItemId)).trim(),
      receipt_id: String(pick(source.receipt_id, source.receiptId)).trim(),
      invoice_item_id: String(pick(source.invoice_item_id, source.invoiceItemId)).trim(),
      section,
      line_no: this.toNumberSafe(pick(source.line_no, source.lineNo, source.line)),
      location_name: this.sanitizeText(pick(source.location_name, source.locationName, parsedLocation)),
      location_address: this.sanitizeText(pick(source.location_address, source.locationAddress)),
      service_start_date: this.normalizeDateValue(pick(source.service_start_date, source.serviceStartDate)),
      service_end_date: this.normalizeDateValue(pick(source.service_end_date, source.serviceEndDate)),
      modules: this.sanitizeText(pick(source.modules, source.item_name, source.itemName, parsedModule, description)),
      description,
      item_name: this.sanitizeText(pick(source.item_name, source.itemName, parsedModule, description)),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discounted_unit_price: this.toNumberSafe(pick(source.discounted_unit_price, source.discountedUnitPrice)),
      discount_percent: this.toNumberSafe(pick(source.discount_percent, source.discountPercent)),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty)),
      line_total: this.toNumberSafe(pick(source.line_total, source.lineTotal, source.amount)),
      amount: this.toNumberSafe(pick(source.amount, source.line_total, source.lineTotal)),
      capability_name: this.sanitizeText(pick(source.capability_name, source.capabilityName)),
      capability_value: this.sanitizeText(pick(source.capability_value, source.capabilityValue)),
      currency: this.sanitizeText(pick(source.currency)),
      notes: this.sanitizeText(pick(source.notes))
    };
  },
  receiptDbId(value) {
    return String(value || '').trim();
  },
  receiptDisplayId(receipt = {}) {
    return String(receipt?.receipt_number || receipt?.receipt_id || '').trim();
  },
  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  extractRows(response) {
    const candidates = [response, response?.receipts, response?.items, response?.rows, response?.data, response?.result, response?.payload];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  },
  extractListResult(response) {
    if (response && typeof response === 'object' && Array.isArray(response.rows)) {
      const total = Number(response.total ?? response.rows.length) || response.rows.length;
      const returned = Number(response.returned ?? response.rows.length) || response.rows.length;
      const limit = Number(response.limit || this.state.limit || 50);
      const page = Number(response.page || this.state.page || 1);
      const offset = Number(response.offset ?? Math.max(0, (page - 1) * limit));
      const hasMore = response.hasMore !== undefined
        ? Boolean(response.hasMore)
        : response.has_more !== undefined
          ? Boolean(response.has_more)
          : offset + returned < total;
      return { rows: response.rows, total, returned, hasMore, page, limit, offset };
    }
    const rows = this.extractRows(response);
    const limit = Number(this.state.limit || 50);
    const page = Number(this.state.page || 1);
    const returned = rows.length;
    const offset = Math.max(0, (page - 1) * limit);
    return {
      rows,
      total: rows.length,
      returned,
      hasMore: false,
      page,
      limit,
      offset
    };
  },
  extractReceiptAndItems(response, fallbackId = '') {
    const parseJsonIfNeeded = value => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
      try {
        return JSON.parse(trimmed);
      } catch (_error) {
        return value;
      }
    };

    const candidates = [
      response,
      response?.data,
      response?.result,
      response?.payload,
      response?.item,
      response?.receipt,
      response?.created_receipt
    ];

    let receipt = null;
    let items = [];

    for (const rawCandidate of candidates) {
      const candidate = parseJsonIfNeeded(rawCandidate);
      if (!candidate) continue;

      if (Array.isArray(candidate)) {
        const first = candidate[0];
        if (!receipt && first && typeof first === 'object') {
          receipt = first;
        }
        if (!items.length && Array.isArray(first?.items)) {
          items = first.items;
        }
        continue;
      }

      if (typeof candidate !== 'object') continue;

      if (!receipt) {
        if (candidate.item && typeof candidate.item === 'object') receipt = candidate.item;
        else if (candidate.receipt && typeof candidate.receipt === 'object') receipt = candidate.receipt;
        else if (candidate.created_receipt && typeof candidate.created_receipt === 'object') receipt = candidate.created_receipt;
        else if (Array.isArray(candidate.data) && candidate.data[0] && typeof candidate.data[0] === 'object') receipt = candidate.data[0];
        else if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)) receipt = candidate.data;
        else if (candidate.receipt_id || candidate.receipt_number || candidate.invoice_id) receipt = candidate;
      }

      if (!items.length) {
        if (Array.isArray(candidate.items)) items = candidate.items;
        else if (Array.isArray(candidate.receipt_items)) items = candidate.receipt_items;
        else if (Array.isArray(candidate.created_receipt_items)) items = candidate.created_receipt_items;
        else if (candidate.item && Array.isArray(candidate.item.items)) items = candidate.item.items;
        else if (candidate.receipt && Array.isArray(candidate.receipt.items)) items = candidate.receipt.items;
        else if (candidate.created_receipt && Array.isArray(candidate.created_receipt.items)) items = candidate.created_receipt.items;
        else if (Array.isArray(candidate.data) && Array.isArray(candidate.data[0]?.items)) items = candidate.data[0].items;
        else if (candidate.data && Array.isArray(candidate.data.items)) items = candidate.data.items;
      }
    }

    return {
      receipt: this.normalizeReceipt(receipt || { receipt_id: fallbackId }),
      items: Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : []
    };
  },
  getCachedDetail(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    const cached = this.state.detailCacheById[key];
    if (!cached) return null;
    if (Date.now() - Number(cached.cachedAt || 0) > this.state.detailCacheTtlMs) return null;
    return cached;
  },
  setCachedDetail(id, receipt, items, invoice = null, invoiceReceipts = null) {
    const key = String(id || '').trim();
    if (!key) return;
    this.state.detailCacheById[key] = {
      receipt: this.normalizeReceipt(receipt || { receipt_id: key }),
      items: Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [],
      invoice: invoice && typeof invoice === 'object' ? { ...invoice } : null,
      invoiceReceipts: Array.isArray(invoiceReceipts) ? invoiceReceipts.map(row => this.normalizeReceipt(row)) : null,
      cachedAt: Date.now()
    };
  },
  setTriggerBusy(trigger, busy) {
    if (!trigger || !('disabled' in trigger)) return;
    trigger.disabled = !!busy;
  },
  setFormDetailLoading(loading) {
    if (!E.receiptForm) return;
    if (loading) E.receiptForm.setAttribute('data-detail-loading', 'true');
    else E.receiptForm.removeAttribute('data-detail-loading');
    if (E.receiptFormTitle) {
      const baseTitle = String(E.receiptFormTitle.textContent || '').replace(/\s+\u00b7\s+Loading details…$/, '').trim();
      E.receiptFormTitle.textContent = loading ? `${baseTitle || 'Receipt'} · Loading details…` : baseTitle;
    }
  },
  async runRowAction(actionKey, trigger, fn) {
    const key = String(actionKey || '').trim();
    if (!key) return;
    if (this.state.rowActionInFlight.has(key)) return;
    this.state.rowActionInFlight.add(key);
    this.setTriggerBusy(trigger, true);
    try {
      await fn();
    } finally {
      this.state.rowActionInFlight.delete(key);
      this.setTriggerBusy(trigger, false);
    }
  },
  applyFilters() {
    this.state.filteredRows = this.state.rows.filter(row => {
      if (!this.matchesKpiFilter(row)) return false;
      return true;
    });
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeReceipt(row);
    const normalizedDbId = this.receiptDbId(normalized.id);
    const idx = this.state.rows.findIndex(item => {
      const itemDbId = this.receiptDbId(item.id);
      if (itemDbId && normalizedDbId) return itemDbId === normalizedDbId;
      return String(item.receipt_id || '') === String(normalized.receipt_id || '');
    });
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.rerenderVisibleTable();
    return normalized;
  },
  removeLocalRow(id) {
    const target = String(id || '').trim();
    const before = this.state.rows.length;
    this.state.rows = this.state.rows.filter(item => this.receiptDbId(item.id) !== target && String(item.receipt_id || '').trim() !== target);
    if (this.state.rows.length !== before) this.rerenderVisibleTable();
  },
  rerenderVisibleTable() {
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  matchesKpiFilter(row = {}) {
    const filter = this.state.kpiFilter || 'total';
    const status = this.normalizeText(row?.status);
    if (filter === 'total') return true;
    if (filter === 'issued') return status === 'issued';
    if (filter === 'paid') return status === 'paid';
    if (filter === 'grand-total') return this.toNumberSafe(row?.invoice_total) > 0;
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.applyFilters();
    this.render();
  },
  renderSummary() {
    if (!E.receiptSummary) return;
    const total = this.state.rows.length;
    const issued = this.state.rows.filter(r => this.normalizeText(r.status) === 'issued').length;
    const paid = this.state.rows.filter(r => this.normalizeText(r.status) === 'paid').length;
    const totalAmount = this.state.rows.reduce((sum, row) => sum + this.toNumberSafe(row.invoice_total), 0);
    E.receiptSummary.innerHTML = [
      { label: 'Total Receipts', value: total, filter: 'total' },
      { label: 'Issued', value: issued, filter: 'issued' },
      { label: 'Paid', value: paid, filter: 'paid' },
      { label: 'Grand Total', value: this.formatMoney(totalAmount), filter: 'grand-total' }
    ]
      .map(card => {
        const active = (this.state.kpiFilter || 'total') === card.filter;
        return `<div class="card kpi${active ? ' kpi-filter-active' : ''}" data-kpi-filter="${U.escapeAttr(card.filter)}" role="button" tabindex="0" aria-pressed="${active ? 'true' : 'false'}"><div class="label">${U.escapeHtml(card.label)}</div><div class="value">${U.escapeHtml(String(card.value))}</div></div>`;
      })
      .join('');
  },
  renderFilters() {
    if (!E.receiptsStatusFilter) return;
    const statuses = ['All', ...new Set(this.state.rows.map(row => String(row.status || '').trim()).filter(Boolean))];
    E.receiptsStatusFilter.innerHTML = statuses.map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
    E.receiptsStatusFilter.value = statuses.includes(this.state.status) ? this.state.status : 'All';
  },
  render() {
    if (!E.receiptsTbody || !E.receiptsState) return;
    if (this.state.loading) {
      this.renderPagination();
      E.receiptsState.textContent = 'Loading receipts…';
      E.receiptsTbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;">Loading receipts…</td></tr>';
      return;
    }
    if (this.state.loadError) {
      this.renderPagination();
      E.receiptsState.textContent = this.state.loadError;
      E.receiptsTbody.innerHTML = `<tr><td colspan="10" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    this.renderSummary();
    this.renderPagination();
    const rows = this.state.filteredRows;
    E.receiptsState.textContent = `${rows.length} item(s) • Page ${this.state.page}${this.state.total ? ` • ${this.state.total} total` : ''}`;
    if (!rows.length) {
      E.receiptsTbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;">No receipts found.</td></tr>';
      return;
    }
    E.receiptsTbody.innerHTML = rows
      .map(row => {
        const rowUuid = U.escapeAttr(row.id || row.receipt_id || '');
        const typeLabel = this.receiptTypeLabel(row);
        const settlementBadge = this.isSettlementReceipt(row) ? ' <span class="pill">Settlement</span>' : '';
        return `<tr>
          <td><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span>${U.escapeHtml(row.receipt_number || row.receipt_id || '—')}</span><span class="pill">${U.escapeHtml(typeLabel)}</span>${settlementBadge}</div></td>
          <td>${U.escapeHtml(row.invoice_number || '—')}</td>
          <td>${U.escapeHtml(row.customer_name || '—')}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.receipt_date))}</td>
          <td>${U.escapeHtml(row.currency || '—')}</td>
          <td>${this.formatMoney(row.amount_received ?? row.invoice_total)}</td>
          <td>${U.escapeHtml(row.payment_state || '—')}</td>
          <td>${U.escapeHtml(row.status || '—')}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.updated_at))}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn ghost sm" type="button" data-receipt-view="${rowUuid}">View</button>
            ${Permissions.canUpdateReceipt() ? `<button class="btn ghost sm" type="button" data-receipt-edit="${rowUuid}">Edit</button>` : ''}
            ${Permissions.canPreviewReceipt() ? `<button class="btn ghost sm" type="button" data-receipt-preview="${rowUuid}">Preview</button>` : ''}
            ${Permissions.canDeleteReceipt() ? `<button class="btn ghost sm" type="button" data-receipt-delete="${rowUuid}">Delete</button>` : ''}
          </div></td>
        </tr>`;
      })
      .join('');
  },
  renderPagination() {
    const host = U.ensurePaginationHost({
      hostId: 'receiptsPagination',
      anchor: E.receiptsState?.closest?.('.card')
    });
    U.renderPaginationControls({
      host,
      moduleKey: 'receipts',
      page: this.state.page,
      pageSize: this.state.limit,
      hasMore: this.state.hasMore,
      returned: this.state.returned,
      loading: this.state.loading,
      pageSizeOptions: [25, 50, 100],
      countText: this.state.total ? `${this.state.total} total` : '',
      onPageChange: nextPage => {
        this.state.page = U.normalizePageNumber(nextPage, this.state.page);
        this.refresh(true);
      },
      onPageSizeChange: nextSize => {
        this.state.limit = U.normalizePageSize(nextSize, 50, 200);
        this.state.page = 1;
        this.refresh(true);
      }
    });
  },
  renderItems(items = []) {
    const locations = items.filter(item => item.section === 'location_details');
    const oneTime = items.filter(item => this.isOneTimeSection(item.section));
    const renderLocationRow = item => `<tr>
      <td>${U.escapeHtml(item.location_name || '—')}</td>
      <td>${U.escapeHtml(item.location_address || '—')}</td>
      <td class="cell-center">${U.escapeHtml(U.fmtDisplayDate(item.service_start_date) || '—')}</td>
      <td class="cell-center">${U.escapeHtml(U.fmtDisplayDate(item.service_end_date) || '—')}</td>
      <td>${U.escapeHtml(item.item_name || item.modules || item.description || '—')}</td>
      <td class="cell-center">${U.escapeHtml(String(item.quantity ?? 0))}</td>
      <td class="cell-right">${this.formatMoney(item.unit_price ?? 0)}</td>
      <td class="cell-center">${U.escapeHtml(String(item.discount_percent ?? 0))}%</td>
      <td class="cell-right">${this.formatMoney(item.discounted_unit_price ?? 0)}</td>
      <td class="cell-right">${this.formatMoney(item.line_total ?? item.amount ?? 0)}</td>
      <td>${U.escapeHtml(item.notes || '—')}</td>
    </tr>`;
    const renderOneTimeRow = item => `<tr>
      <td>${U.escapeHtml(item.item_name || item.modules || item.description || '—')}</td>
      <td class="cell-center">${U.escapeHtml(U.fmtDisplayDate(item.service_start_date) || '—')}</td>
      <td class="cell-center">${U.escapeHtml(U.fmtDisplayDate(item.service_end_date) || '—')}</td>
      <td class="cell-center">${U.escapeHtml(String(item.quantity ?? 0))}</td>
      <td class="cell-right">${this.formatMoney(item.unit_price ?? 0)}</td>
      <td class="cell-center">${U.escapeHtml(String(item.discount_percent ?? 0))}%</td>
      <td class="cell-right">${this.formatMoney(item.line_total ?? item.amount ?? 0)}</td>
      <td>${U.escapeHtml(item.notes || '—')}</td>
    </tr>`;
    if (E.receiptLocationItemsTbody) {
      E.receiptLocationItemsTbody.innerHTML = locations.length
        ? locations.map(renderLocationRow).join('')
        : '<tr><td colspan="11" class="muted cell-center">No location detail rows.</td></tr>';
    }
    if (E.receiptOneTimeItemsTbody) {
      E.receiptOneTimeItemsTbody.innerHTML = oneTime.length
        ? oneTime.map(renderOneTimeRow).join('')
        : '<tr><td colspan="8" class="muted cell-center">No one-time fee rows.</td></tr>';
    }
  },
  populateForm(receipt, items, readOnly = false, linkedInvoice = null, invoiceReceipts = null) {
    const set = (id, value) => {
      const el = E[id];
      if (el) el.value = value ?? '';
    };
    const invoiceSource = linkedInvoice && typeof linkedInvoice === 'object' ? linkedInvoice : {};
    const paymentSnapshot = this.resolveReceiptPaymentSnapshot(receipt, invoiceSource, invoiceReceipts);
    const effectiveInvoiceTotal = paymentSnapshot.invoice_total;
    const effectiveOldPaidTotal = paymentSnapshot.old_paid_total;
    const effectivePaidNow = paymentSnapshot.paid_now;
    const effectiveReceivedAmount = paymentSnapshot.received_amount;
    const effectiveNewPaidTotal = paymentSnapshot.new_paid_total;
    const effectivePendingAmount = paymentSnapshot.pending_amount;
    const effectivePaymentState = String(receipt.payment_state || invoiceSource.payment_state || '').trim() || paymentSnapshot.payment_state;
    const effectivePaymentConclusion = String(receipt.payment_conclusion || '').trim() || paymentSnapshot.payment_conclusion;
    set('receiptFormReceiptId', receipt.receipt_id);
    set('receiptFormReceiptNumber', receipt.receipt_number);
    set('receiptFormInvoiceId', receipt.invoice_id);
    set('receiptFormInvoiceNumber', receipt.invoice_number);
    set('receiptFormReceiptDate', receipt.receipt_date);
    set('receiptFormCustomerName', receipt.customer_name);
    set('receiptFormCustomerLegalName', receipt.customer_legal_name);
    set('receiptFormCustomerAddress', receipt.customer_address);
    set('receiptFormCurrency', receipt.currency);
    set('receiptFormStatus', receipt.status);
    set('receiptFormAmountInWords', this.receiptAmountInWords(receipt.amount_in_words, receipt.currency, effectiveReceivedAmount));
    set('receiptFormInvoiceGrandTotal', effectiveInvoiceTotal);
    set('receiptFormOldPaidTotal', effectiveOldPaidTotal);
    set('receiptFormPaidNow', effectivePaidNow);
    set('receiptFormNewPaidTotal', effectiveNewPaidTotal);
    set('receiptFormReceivedAmount', effectiveReceivedAmount);
    set('receiptFormPendingAmount', effectivePendingAmount);
    set('receiptFormPaymentState', effectivePaymentState);
    set('receiptFormPaymentConclusion', effectivePaymentConclusion);
    set('receiptFormPaymentNotes', receipt.payment_notes);
    set('receiptFormSupportEmail', receipt.support_email);
    if (E.receiptForm) E.receiptForm.dataset.id = receipt.id || '';
    if (E.receiptFormTitle) E.receiptFormTitle.textContent = receipt.receipt_id ? `Receipt · ${receipt.receipt_id}` : 'Create Receipt';
    if (E.receiptFormDeleteBtn) E.receiptFormDeleteBtn.style.display = !readOnly && receipt.id && Permissions.canDeleteReceipt() ? '' : 'none';
    if (E.receiptFormSaveBtn) E.receiptFormSaveBtn.style.display = !readOnly && Permissions.canUpdateReceipt() ? '' : 'none';
    this.renderItems(items);
    if (E.receiptForm) {
      E.receiptForm.querySelectorAll('input, textarea').forEach(el => {
        if (el.id === 'receiptFormReceiptId') return;
        el.disabled = readOnly;
      });
      ['receiptFormInvoiceGrandTotal', 'receiptFormOldPaidTotal', 'receiptFormNewPaidTotal', 'receiptFormReceivedAmount', 'receiptFormPendingAmount', 'receiptFormPaymentState', 'receiptFormPaymentConclusion']
        .forEach(id => {
          const el = E[id];
          if (el) el.readOnly = true;
        });
      if (E.receiptFormPaidNow) E.receiptFormPaidNow.readOnly = !!readOnly;
    }
    if (E.receiptFormModal) {
      E.receiptFormModal.classList.add('open');
      E.receiptFormModal.setAttribute('aria-hidden', 'false');
    }
    this.recalculatePaymentFields();
  },
  closeForm() {
    if (E.receiptFormModal) {
      E.receiptFormModal.classList.remove('open');
      E.receiptFormModal.setAttribute('aria-hidden', 'true');
    }
    if (E.receiptForm) {
      delete E.receiptForm.dataset.mode;
      delete E.receiptForm.dataset.sourceInvoiceUuid;
      delete E.receiptForm.dataset.clientId;
      delete E.receiptForm.dataset.paymentMethod;
      delete E.receiptForm.dataset.paymentReference;
    }
    if (E.receiptFormPreviewBtn) E.receiptFormPreviewBtn.style.display = '';
  },
  setFormBusy(value) {
    const busy = !!value;
    if (E.receiptFormSaveBtn) E.receiptFormSaveBtn.disabled = busy;
    if (E.receiptFormDeleteBtn) E.receiptFormDeleteBtn.disabled = busy;
    if (E.receiptFormPreviewBtn) E.receiptFormPreviewBtn.disabled = busy;
  },
  getSupabaseClient() {
    const clientFactory = window.SupabaseClient?.getClient;
    if (typeof clientFactory !== 'function') return null;
    const client = clientFactory.call(window.SupabaseClient);
    return typeof client?.from === 'function' ? client : null;
  },
  requireSupabaseClient() {
    const client = this.getSupabaseClient();
    console.log('supabase client check', client, typeof client?.from);
    if (!client) throw new Error('Supabase client unavailable.');
    return client;
  },
  normalizeAmountInput(value) {
    if (value === null || value === undefined) return null;
    const asString = String(value).trim();
    if (!asString) return null;
    const normalized = asString.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  },
  todayInputValue() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },
  normalizeDateValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const prefixMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (prefixMatch) return prefixMatch[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  },
  buildReceiptItemSavePayload(items = []) {
    return (Array.isArray(items) ? items : []).map((item, index) => {
      const normalized = this.normalizeItem(item);
      return {
        section: this.isOneTimeSection(normalized.section) ? 'one_time_fee' : 'location_details',
        line_no: this.toNumberSafe(normalized.line_no) || index + 1,
        location_name: normalized.location_name || null,
        location_address: normalized.location_address || null,
        item_name: normalized.item_name || normalized.modules || normalized.description || null,
        description: normalized.description || normalized.item_name || normalized.modules || null,
        quantity: this.toNumberSafe(normalized.quantity),
        unit_price: this.toNumberSafe(normalized.unit_price),
        discount_percent: this.toNumberSafe(normalized.discount_percent),
        discounted_unit_price: this.toNumberSafe(normalized.discounted_unit_price),
        line_total: this.toNumberSafe(normalized.line_total || normalized.amount),
        amount: this.toNumberSafe(normalized.amount || normalized.line_total),
        capability_name: normalized.capability_name || null,
        capability_value: normalized.capability_value || null,
        notes: normalized.notes || null,
        service_start_date: this.normalizeDateValue(normalized.service_start_date) || null,
        service_end_date: this.normalizeDateValue(normalized.service_end_date) || null,
        currency: normalized.currency || null
      };
    });
  },
  deriveReceiptPaymentState({ pending_amount = 0, received_amount = 0, invoice_total = 0 } = {}) {
    return U.calculatePaymentState(invoice_total, Math.max(0, this.toNumberSafe(invoice_total) - this.toNumberSafe(pending_amount)));
  },
  derivePaymentConclusion({ pending_amount = 0 } = {}) {
    return this.toNumberSafe(pending_amount) <= 0 ? 'Settled' : 'Pending Settlement';
  },
  calculatePaymentSnapshot({ invoiceTotal = 0, oldPaidTotal = 0, paidNow = 0 } = {}) {
    return U.calculateInvoicePaymentSnapshot({ invoiceTotal, oldPaidTotal, paidNow });
  },
  getReceiptInvoiceKey(receipt = {}) {
    return String(receipt?.invoice_id || '').trim() || String(receipt?.invoice_number || '').trim();
  },
  getReceiptUniqueKey(receipt = {}) {
    return String(receipt?.id || '').trim() || String(receipt?.receipt_id || '').trim();
  },
  getReceiptAmountValue(receipt = {}) {
    const receiptAmount = this.normalizeMoney(
      receipt.received_amount ??
      receipt.amount_received ??
      receipt.paid_now ??
      0
    );
    return receiptAmount;
  },
  isReceiptVoided(receipt = {}) {
    const status = this.normalizeText(receipt?.status);
    if (!status) return false;
    return status.includes('cancel') || status.includes('void') || status.includes('delete');
  },
  async fetchInvoiceReceiptsLedger({ invoiceId = '', invoiceNumber = '' } = {}) {
    const id = String(invoiceId || '').trim();
    const number = String(invoiceNumber || '').trim();
    if (!id && !number) return [];
    const client = this.getSupabaseClient();
    if (!client) return [];
    const baseQuery = () => client
      .from('receipts')
      .select('id,receipt_id,invoice_id,invoice_number,receipt_date,created_at,status,amount_received,received_amount,paid_now,old_paid_total,new_paid_total,pending_amount,invoice_total')
      .order('receipt_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true, nullsFirst: false });
    const [byId, byNumber] = await Promise.all([
      id ? baseQuery().eq('invoice_id', id) : Promise.resolve({ data: [], error: null }),
      number ? baseQuery().eq('invoice_number', number) : Promise.resolve({ data: [], error: null })
    ]);
    const error = byId?.error || byNumber?.error;
    if (error) throw new Error(error.message || 'Unable to load invoice receipts.');
    const merged = [...(Array.isArray(byId?.data) ? byId.data : []), ...(Array.isArray(byNumber?.data) ? byNumber.data : [])];
    const deduped = [];
    const seen = new Set();
    merged.forEach(row => {
      const key = this.getReceiptUniqueKey(row) || JSON.stringify([row?.invoice_id || '', row?.invoice_number || '', row?.receipt_date || '', row?.created_at || '']);
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (!this.isReceiptVoided(row)) deduped.push(row);
    });
    return deduped;
  },
  parseOrderTimestamp(value) {
    const normalized = this.normalizeDateValue(value);
    if (normalized) {
      const time = Date.parse(normalized);
      if (!Number.isNaN(time)) return time;
    }
    const parsed = Date.parse(String(value || '').trim());
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  },
  getReceiptOrderMeta(receipt = {}) {
    const receiptDateTs = this.parseOrderTimestamp(receipt?.receipt_date);
    const createdAtTs = this.parseOrderTimestamp(receipt?.created_at);
    const idRaw = String(receipt?.id || receipt?.receipt_id || '').trim();
    const idNum = Number(idRaw);
    return { receiptDateTs, createdAtTs, idRaw, idNum: Number.isFinite(idNum) ? idNum : Number.NaN };
  },
  compareReceiptOrder(left = {}, right = {}) {
    const a = this.getReceiptOrderMeta(left);
    const b = this.getReceiptOrderMeta(right);
    const compareTs = (x, y) => {
      const xValid = Number.isFinite(x);
      const yValid = Number.isFinite(y);
      if (xValid && yValid && x !== y) return x - y;
      if (xValid && !yValid) return -1;
      if (!xValid && yValid) return 1;
      return 0;
    };
    const receiptCmp = compareTs(a.receiptDateTs, b.receiptDateTs);
    if (receiptCmp !== 0) return receiptCmp;
    const createdCmp = compareTs(a.createdAtTs, b.createdAtTs);
    if (createdCmp !== 0) return createdCmp;
    if (Number.isFinite(a.idNum) && Number.isFinite(b.idNum) && a.idNum !== b.idNum) return a.idNum - b.idNum;
    return a.idRaw.localeCompare(b.idRaw);
  },
  calculateReceiptSnapshot(receipt = {}, invoice = {}, allReceiptsForInvoice = null) {
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    const invoiceTotal = this.toNumberSafe(
      pickDefined(
        invoice.invoice_total,
        invoice.grand_total,
        invoice.total_amount,
        receipt.invoice_total,
        receipt.invoice_grand_total,
        receipt.grand_total
      )
    );
    const paidNow = Math.max(0, this.getReceiptAmountValue(receipt));
    const currentInvoiceKey = this.getReceiptInvoiceKey({ ...invoice, ...receipt });
    const currentUniqueKey = this.getReceiptUniqueKey(receipt);
    let oldPaidBeforeReceipt = null;
    if (Array.isArray(allReceiptsForInvoice)) {
      const normalizedRows = allReceiptsForInvoice
        .map(row => this.normalizeReceipt(row))
        .filter(row => this.getReceiptInvoiceKey(row) === currentInvoiceKey);
      if (normalizedRows.length) {
        const sorted = [...normalizedRows].sort((a, b) => this.compareReceiptOrder(a, b));
        const currentIndex = sorted.findIndex(row => this.getReceiptUniqueKey(row) === currentUniqueKey);
        const previousRows = currentIndex >= 0
          ? sorted.slice(0, currentIndex)
          : sorted.filter(row => this.compareReceiptOrder(row, receipt) < 0);
        oldPaidBeforeReceipt = previousRows.reduce((sum, row) => sum + this.getReceiptAmountValue(row), 0);
      } else {
        oldPaidBeforeReceipt = 0;
      }
    }
    if (oldPaidBeforeReceipt === null) {
      const explicitOldPaidTotal = this.normalizeAmountInput(receipt.old_paid_total);
      const explicitNewPaidTotal = this.normalizeAmountInput(receipt.new_paid_total);
      const invoiceAmountPaid = this.normalizeAmountInput(
        pickDefined(invoice.amount_paid, invoice.received_amount, invoice.amount_received)
      );
      if (explicitOldPaidTotal !== null) oldPaidBeforeReceipt = explicitOldPaidTotal;
      else if (explicitNewPaidTotal !== null) oldPaidBeforeReceipt = explicitNewPaidTotal - paidNow;
      else if (invoiceAmountPaid !== null) oldPaidBeforeReceipt = invoiceAmountPaid - paidNow;
      else oldPaidBeforeReceipt = 0;
    }
    oldPaidBeforeReceipt = Math.max(0, this.toNumberSafe(oldPaidBeforeReceipt));
    const newPaidTotal = this.toNumberSafe(oldPaidBeforeReceipt + paidNow);
    const pendingAmount = this.toNumberSafe(Math.max(invoiceTotal - newPaidTotal, 0));
    let paymentState = 'Unpaid';
    if (newPaidTotal > 0 && newPaidTotal < invoiceTotal) paymentState = 'Partially Paid';
    if (newPaidTotal >= invoiceTotal) paymentState = 'Paid';
    return {
      invoice_total: invoiceTotal,
      old_paid_total: oldPaidBeforeReceipt,
      paid_now: paidNow,
      received_amount: paidNow,
      new_paid_total: newPaidTotal,
      pending_amount: pendingAmount,
      payment_state: paymentState,
      payment_conclusion: pendingAmount > 0 ? 'Pending Settlement' : 'Settled'
    };
  },
  resolveReceiptPaymentSnapshot(receipt = {}, invoice = {}, allReceiptsForInvoice = null) {
    return this.calculateReceiptSnapshot(receipt, invoice, allReceiptsForInvoice);
  },
  getReceiptSortColumn() {
    return this.RECEIPT_ALLOWED_COLUMNS.has('receipt_date') ? 'receipt_date' : 'created_at';
  },
  applyReceiptSort(query, { ascending = true } = {}) {
    const safePrimarySort = this.getReceiptSortColumn();
    let sortedQuery = query.order(safePrimarySort, { ascending, nullsFirst: false });
    if (safePrimarySort !== 'created_at' && this.RECEIPT_ALLOWED_COLUMNS.has('created_at')) {
      sortedQuery = sortedQuery.order('created_at', { ascending, nullsFirst: false });
    }
    return sortedQuery;
  },
  filterReceiptColumns(record = {}) {
    if (!record || typeof record !== 'object') return {};
    return Object.fromEntries(
      Object.entries(record).filter(([key]) => this.RECEIPT_ALLOWED_COLUMNS.has(String(key || '').trim()))
    );
  },
  recalculatePaymentFields() {
    const invoiceTotal = this.toNumberSafe(E.receiptFormInvoiceGrandTotal?.value);
    const oldPaidTotal = this.toNumberSafe(E.receiptFormOldPaidTotal?.value);
    const paidNow = this.toNumberSafe(E.receiptFormPaidNow?.value);
    const snapshot = this.calculatePaymentSnapshot({ invoiceTotal, oldPaidTotal, paidNow });
    if (E.receiptFormReceivedAmount) E.receiptFormReceivedAmount.value = snapshot.received_amount;
    if (E.receiptFormNewPaidTotal) E.receiptFormNewPaidTotal.value = snapshot.new_paid_total;
    if (E.receiptFormPendingAmount) E.receiptFormPendingAmount.value = snapshot.pending_amount;
    if (E.receiptFormPaymentState) E.receiptFormPaymentState.value = snapshot.payment_state;
    if (E.receiptFormPaymentConclusion) E.receiptFormPaymentConclusion.value = snapshot.payment_conclusion;
    if (E.receiptFormAmountInWords) {
      const currency = String(E.receiptFormCurrency?.value || 'USD').trim() || 'USD';
      E.receiptFormAmountInWords.value = this.receiptAmountInWords(E.receiptFormAmountInWords.value, currency, snapshot.received_amount);
    }
    return snapshot;
  },
  async computeReceiptSnapshot(invoiceUuid, paidNowInput) {
    const invoiceId = String(invoiceUuid || '').trim();
    if (!invoiceId) throw new Error('Invoice UUID is required to compute receipt settlement snapshot.');
    const client = this.requireSupabaseClient();
    const [{ data: invoiceRow, error: invoiceError }] = await Promise.all([
      client
        .from('invoices')
        .select('id,invoice_id,invoice_number,subtotal_locations,subtotal_one_time,invoice_total,amount_paid,received_amount,paid_now,pending_amount,payment_state')
        .eq('id', invoiceId)
        .maybeSingle()
    ]);
    if (invoiceError) throw new Error(invoiceError.message || 'Unable to load invoice before creating receipt.');
    if (!invoiceRow) throw new Error('Linked invoice was not found before creating receipt.');
    const receiptRows = await this.fetchInvoiceReceiptsLedger({
      invoiceId,
      invoiceNumber: invoiceRow?.invoice_number
    });
    const normalizedInvoice = this.normalizeInvoiceFinancials(invoiceRow);
    const invoiceTotal = this.toNumberSafe(normalizedInvoice.invoice_total);
    const paidNow = this.toNumberSafe(paidNowInput);
    return this.calculateReceiptSnapshot({
      id: '',
      receipt_id: '',
      invoice_id: invoiceId,
      receipt_date: this.todayInputValue(),
      created_at: new Date().toISOString(),
      paid_now: paidNow,
      received_amount: paidNow,
      invoice_total: invoiceTotal
    }, normalizedInvoice, Array.isArray(receiptRows) ? receiptRows : []);
  },
  async fetchReceiptsForInvoice(invoice = {}) {
    const invoiceId = String(invoice?.id || invoice?.invoice_id || '').trim();
    const invoiceNumber = String(invoice?.invoice_number || '').trim();
    return this.fetchInvoiceReceiptsLedger({ invoiceId, invoiceNumber });
  },
  normalizeReceiptWithLedger(receipt = {}, invoice = {}, invoiceReceipts = null) {
    const normalizedReceipt = this.normalizeReceipt(receipt);
    const snapshot = this.resolveReceiptPaymentSnapshot(normalizedReceipt, invoice, invoiceReceipts);
    return this.normalizeReceipt({
      ...normalizedReceipt,
      invoice_total: snapshot.invoice_total,
      old_paid_total: snapshot.old_paid_total,
      paid_now: snapshot.paid_now,
      amount_received: snapshot.received_amount,
      received_amount: snapshot.received_amount,
      new_paid_total: snapshot.new_paid_total,
      pending_amount: snapshot.pending_amount,
      payment_state: snapshot.payment_state,
      payment_conclusion: snapshot.payment_conclusion
    });
  },
  buildReceiptDescriptionFromInvoiceItem(item = {}) {
    const location = String(item.location_name || item.locationName || '').trim();
    const itemName = String(item.item_name || item.itemName || item.modules || '').trim();
    if (location && itemName) return `${location} - ${itemName}`;
    return location || itemName || String(item.description || '').trim() || 'Invoice Item';
  },
  mapInvoiceItemToReceiptItem(item = {}) {
    const section = this.isOneTimeSection(item.section || item.item_section || item.itemSection) ? 'one_time_fee' : 'location_details';
    const lineNo = this.toNumberSafe(item.line_no ?? item.lineNo);
    const amount = this.toNumberSafe(item.line_total ?? item.lineTotal ?? item.amount);
    const description = this.buildReceiptDescriptionFromInvoiceItem(item);
    const itemName = String(item.item_name || item.itemName || item.modules || '').trim();
    return this.normalizeItem({
      section,
      line_no: lineNo > 0 ? lineNo : 0,
      location_name: String(item.location_name || item.locationName || '').trim(),
      location_address: String(item.location_address || item.locationAddress || '').trim(),
      service_start_date: this.normalizeDateValue(item.service_start_date || item.serviceStartDate),
      service_end_date: this.normalizeDateValue(item.service_end_date || item.serviceEndDate),
      modules: description,
      item_name: itemName || description,
      quantity: this.toNumberSafe(item.quantity ?? item.qty),
      unit_price: this.toNumberSafe(item.unit_price ?? item.unitPrice),
      discount_percent: this.toNumberSafe(item.discount_percent ?? item.discountPercent),
      discounted_unit_price: this.toNumberSafe(item.discounted_unit_price ?? item.discountedUnitPrice),
      line_total: amount,
      capability_name: String(item.capability_name || item.capabilityName || '').trim(),
      capability_value: String(item.capability_value || item.capabilityValue || '').trim(),
      currency: String(item.currency || '').trim(),
      notes: String(item.notes || '').trim()
    });
  },
  async hydrateInvoiceReceiptDraft(invoice = {}) {
    const invoiceUuid = String(invoice?.id || '').trim();
    if (!invoiceUuid) return { invoice: {}, items: [] };
    try {
      const response = await Api.getInvoice(invoiceUuid);
      const detail = window.Invoices?.extractInvoiceAndItems?.(response, invoiceUuid) || {};
      return {
        invoice: detail?.invoice || {},
        items: Array.isArray(detail?.items) ? detail.items : []
      };
    } catch (_error) {
      return { invoice: {}, items: [] };
    }
  },
  async openCreateFromInvoice(invoice = {}) {
    const invoiceUuid = String(invoice?.id || '').trim();
    if (!invoiceUuid) {
      UI.toast('Invoice UUID is required to create a receipt.');
      return;
    }
    const hydrated = await this.hydrateInvoiceReceiptDraft(invoice);
    const sourceInvoice = { ...(invoice || {}), ...(hydrated.invoice || {}) };
    const financials = this.normalizeInvoiceFinancials(sourceInvoice);
    const invoiceTotal = this.toNumberSafe(financials.invoice_total);
    const pendingAmount = this.toNumberSafe(financials.pending_amount);
    const suggestedPaidNow = this.toNumberSafe(sourceInvoice?.paid_now);
    const paidNow = suggestedPaidNow > 0 ? Math.min(suggestedPaidNow, pendingAmount || suggestedPaidNow) : (pendingAmount > 0 ? pendingAmount : 0);
    const invoiceReceipts = await this.fetchReceiptsForInvoice({ id: invoiceUuid }).catch(() => []);
    const snapshot = this.calculateReceiptSnapshot({
      id: '',
      receipt_id: '',
      invoice_id: invoiceUuid,
      receipt_date: this.todayInputValue(),
      created_at: new Date().toISOString(),
      paid_now: paidNow,
      received_amount: paidNow,
      invoice_total: invoiceTotal
    }, financials, invoiceReceipts);
    const draft = {
      receipt_id: '',
      receipt_number: '',
      invoice_id: invoiceUuid,
      invoice_number: String(sourceInvoice?.invoice_number || sourceInvoice?.invoice_id || '').trim(),
      client_id: String(sourceInvoice?.client_id || '').trim(),
      receipt_date: this.todayInputValue(),
      customer_name: String(sourceInvoice?.customer_name || '').trim(),
      customer_legal_name: String(sourceInvoice?.customer_legal_name || '').trim(),
      customer_address: String(sourceInvoice?.customer_address || '').trim(),
      issue_date: this.normalizeDateValue(sourceInvoice?.issue_date),
      due_date: this.normalizeDateValue(sourceInvoice?.due_date),
      billing_frequency: String(sourceInvoice?.billing_frequency || '').trim(),
      payment_term: String(sourceInvoice?.payment_term || '').trim(),
      currency: String(sourceInvoice?.currency || '').trim() || 'USD',
      status: 'Issued',
      old_paid_total: snapshot.old_paid_total,
      paid_now: snapshot.paid_now,
      new_paid_total: snapshot.new_paid_total,
      pending_amount: snapshot.pending_amount,
      payment_state: snapshot.payment_state,
      payment_conclusion: snapshot.payment_conclusion,
      payment_notes: String(sourceInvoice?.notes || '').trim(),
      amount_received: snapshot.received_amount,
      invoice_total: snapshot.invoice_total
    };
    const mappedItems = Array.isArray(hydrated.items) ? hydrated.items.map(item => this.mapInvoiceItemToReceiptItem(item)) : [];
    this.state.selectedReceipt = null;
    this.state.items = mappedItems;
    this.populateForm(draft, mappedItems, false, sourceInvoice, invoiceReceipts);
    if (E.receiptForm) {
      E.receiptForm.dataset.id = '';
      E.receiptForm.dataset.mode = 'create_from_invoice';
      E.receiptForm.dataset.sourceInvoiceUuid = invoiceUuid;
      E.receiptForm.dataset.clientId = String(sourceInvoice?.client_id || '').trim();
      E.receiptForm.dataset.paymentMethod = '';
      E.receiptForm.dataset.paymentReference = '';
    }
    if (E.receiptFormTitle) {
      const label = String(draft.invoice_number || invoiceUuid).trim();
      E.receiptFormTitle.textContent = `Create Receipt · ${label}`;
    }
    if (E.receiptFormDeleteBtn) E.receiptFormDeleteBtn.style.display = 'none';
    if (E.receiptFormPreviewBtn) E.receiptFormPreviewBtn.style.display = 'none';
    if (E.receiptFormSaveBtn) E.receiptFormSaveBtn.style.display = Permissions.canCreateReceiptFromInvoice() ? '' : 'none';
  },
  resolveReceiptUuid(ref) {
    const raw = String(ref || '').trim();
    if (!raw) return '';
    if (this.isUuid(raw)) return raw;
    const local = this.state.rows.find(row => {
      const dbId = this.receiptDbId(row.id);
      return dbId === raw || String(row.receipt_id || '').trim() === raw || String(row.receipt_number || '').trim() === raw;
    });
    return this.receiptDbId(local?.id);
  },
  async loadReceiptAndItemsByUuid(receiptUuid) {
    const id = String(receiptUuid || '').trim();
    const client = this.getSupabaseClient();
    if (!client || !id) return null;
    const [{ data: receiptRow, error: receiptError }, { data: itemRows, error: itemError }] = await Promise.all([
      client.from('receipts').select('*').eq('id', id).maybeSingle(),
      client.from('receipt_items').select('*').eq('receipt_id', id).order('line_no', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true, nullsFirst: false })
    ]);
    if (receiptError) throw new Error(`Unable to load receipt: ${receiptError.message || 'Unknown error'}`);
    if (!receiptRow) throw new Error('Receipt was not found.');
    if (itemError) throw new Error(`Unable to load receipt items: ${itemError.message || 'Unknown error'}`);
    let invoice = null;
    const invoiceUuid = String(receiptRow?.invoice_id || '').trim();
    if (invoiceUuid) {
      const { data: invoiceRow, error: invoiceError } = await client.from('invoices').select('*').eq('id', invoiceUuid).maybeSingle();
      if (invoiceError) throw new Error(`Unable to load linked invoice: ${invoiceError.message || 'Unknown error'}`);
      if (invoiceRow) invoice = invoiceRow;
    }
    const invoiceReceipts = invoiceUuid ? await this.fetchReceiptsForInvoice({ id: invoiceUuid }).catch(() => []) : [];
    return {
      receipt: this.normalizeReceiptWithLedger(receiptRow, invoice || {}, invoiceReceipts),
      items: Array.isArray(itemRows) ? itemRows.map(item => this.normalizeItem(item)) : [],
      invoice,
      invoiceReceipts
    };
  },
  async openReceiptById(receiptId, { readOnly = false, trigger = null } = {}) {
    const id = String(receiptId || '').trim();
    const receiptUuid = this.resolveReceiptUuid(id);
    if (!receiptUuid) return;
    if (this.state.openingReceiptIds.has(receiptUuid)) return;
    this.state.openingReceiptIds.add(receiptUuid);
    this.setTriggerBusy(trigger, true);
    console.time('receipt-open');
    if (E.receiptForm) {
      delete E.receiptForm.dataset.mode;
      delete E.receiptForm.dataset.sourceInvoiceUuid;
    }
    if (E.receiptFormPreviewBtn) E.receiptFormPreviewBtn.style.display = '';
    const localSummary = this.state.rows.find(row => this.receiptDbId(row.id) === receiptUuid) || this.state.rows.find(row => String(row.receipt_id || '').trim() === id);
    this.populateForm(localSummary ? { ...localSummary, id: receiptUuid } : { id: receiptUuid }, [], readOnly);
    this.setFormDetailLoading(true);
    try {
      const cached = this.getCachedDetail(receiptUuid);
      if (cached) {
        this.state.selectedReceipt = cached.receipt;
        this.state.items = cached.items;
        this.populateForm(cached.receipt, cached.items, readOnly, cached.invoice, cached.invoiceReceipts);
      }
      const directLoad = await this.loadReceiptAndItemsByUuid(receiptUuid).catch(() => null);
      const detail = directLoad || this.extractReceiptAndItems(await Api.getReceipt(receiptUuid), receiptUuid);
      const linkedInvoice = detail?.invoice || null;
      const invoiceReceipts = Array.isArray(detail?.invoiceReceipts)
        ? detail.invoiceReceipts
        : await this.fetchReceiptsForInvoice(linkedInvoice || detail?.receipt || {}).catch(() => []);
      const receipt = this.normalizeReceiptWithLedger({ ...(detail?.receipt || {}), id: detail?.receipt?.id || receiptUuid }, linkedInvoice || {}, invoiceReceipts);
      const items = Array.isArray(detail?.items) ? detail.items.map(item => this.normalizeItem(item)) : [];
      this.setCachedDetail(receiptUuid, receipt, items, linkedInvoice, invoiceReceipts);
      this.state.selectedReceipt = receipt;
      this.state.items = items;
      if (String(E.receiptForm?.dataset.id || '').trim() === receiptUuid) {
        this.populateForm(receipt, items, readOnly, linkedInvoice, invoiceReceipts);
      }
    } catch (error) {
      UI.toast('Unable to load receipt: ' + (error?.message || 'Unknown error'));
    } finally {
      this.state.openingReceiptIds.delete(receiptUuid);
      this.setTriggerBusy(trigger, false);
      this.setFormDetailLoading(false);
      console.timeEnd('receipt-open');
    }
  },
  collectUpdates() {
    const get = id => String(E[id]?.value || '').trim();
    return {
      receipt_id: get('receiptFormReceiptId'),
      receipt_number: get('receiptFormReceiptNumber'),
      invoice_id: get('receiptFormInvoiceId'),
      invoice_number: get('receiptFormInvoiceNumber'),
      receipt_date: get('receiptFormReceiptDate'),
      customer_name: get('receiptFormCustomerName'),
      customer_legal_name: get('receiptFormCustomerLegalName'),
      customer_address: get('receiptFormCustomerAddress'),
      currency: get('receiptFormCurrency'),
      status: get('receiptFormStatus'),
      amount_in_words: get('receiptFormAmountInWords'),
      invoice_total: get('receiptFormInvoiceGrandTotal'),
      old_paid_total: get('receiptFormOldPaidTotal'),
      paid_now: get('receiptFormPaidNow'),
      new_paid_total: get('receiptFormNewPaidTotal'),
      amount_received: get('receiptFormReceivedAmount'),
      pending_amount: get('receiptFormPendingAmount'),
      payment_state: get('receiptFormPaymentState'),
      payment_conclusion: get('receiptFormPaymentConclusion'),
      payment_notes: get('receiptFormPaymentNotes'),
      support_email: get('receiptFormSupportEmail')
    };
  },
  buildReceiptHeaderPayload(formValues = {}, { existing = {}, invoiceUuid = '', linkedInvoice = null, invoiceReceipts = null } = {}) {
    const invoiceId = String(formValues.invoice_id || existing.invoice_id || invoiceUuid || '').trim();
    const clientId = String(
      E.receiptForm?.dataset.clientId ||
      existing.client_id ||
      formValues.client_id ||
      ''
    ).trim();
    const normalizedPaidNow = this.getReceiptAmountValue({
      received_amount: formValues.received_amount,
      amount_received: formValues.amount_received,
      paid_now: formValues.paid_now
    });
    const mergedReceipt = {
      ...existing,
      ...formValues,
      id: String(existing.id || formValues.id || '').trim(),
      invoice_id: invoiceId || null,
      paid_now: normalizedPaidNow ?? this.getReceiptAmountValue(existing),
      received_amount: normalizedPaidNow ?? this.getReceiptAmountValue(existing),
      amount_received: normalizedPaidNow ?? this.getReceiptAmountValue(existing)
    };
    const paymentSnapshot = this.resolveReceiptPaymentSnapshot(mergedReceipt, linkedInvoice || {}, invoiceReceipts);
    const normalizedNewPaidTotal = paymentSnapshot.new_paid_total;
    const normalizedPendingAmount = paymentSnapshot.pending_amount;
    const normalizedPaymentState = String(formValues.payment_state || existing.payment_state || '').trim() || paymentSnapshot.payment_state;
    const normalizedPaymentConclusion = String(formValues.payment_conclusion || existing.payment_conclusion || '').trim() || paymentSnapshot.payment_conclusion;
    return {
      receipt_id: String(formValues.receipt_id || existing.receipt_id || '').trim() || null,
      receipt_number: String(formValues.receipt_number || existing.receipt_number || '').trim() || null,
      invoice_id: invoiceId || null,
      client_id: clientId || null,
      receipt_date: String(formValues.receipt_date || existing.receipt_date || '').trim() || null,
      amount_received: paymentSnapshot.received_amount,
      received_amount: paymentSnapshot.received_amount,
      payment_method: String(E.receiptForm?.dataset.paymentMethod || existing.payment_method || '').trim() || null,
      payment_reference: String(E.receiptForm?.dataset.paymentReference || existing.payment_reference || '').trim() || null,
      is_settlement: this.isSettlementReceipt({
        ...existing,
        ...formValues,
        pending_amount: normalizedPendingAmount
      }),
      notes: String(formValues.notes || existing.notes || '').trim() || null,
      status: String(formValues.status || existing.status || '').trim() || 'Issued',
      invoice_number: String(formValues.invoice_number || existing.invoice_number || '').trim() || null,
      currency: String(formValues.currency || existing.currency || '').trim() || 'USD',
      support_email: String(formValues.support_email || existing.support_email || '').trim() || null,
      customer_name: String(formValues.customer_name || existing.customer_name || '').trim() || null,
      customer_legal_name: String(formValues.customer_legal_name || existing.customer_legal_name || '').trim() || null,
      customer_address: String(formValues.customer_address || existing.customer_address || '').trim() || null,
      amount_in_words: String(formValues.amount_in_words || existing.amount_in_words || '').trim() || null,
      invoice_total: paymentSnapshot.invoice_total,
      old_paid_total: paymentSnapshot.old_paid_total,
      paid_now: paymentSnapshot.paid_now,
      new_paid_total: normalizedNewPaidTotal,
      pending_amount: normalizedPendingAmount,
      payment_state: normalizedPaymentState,
      payment_conclusion: normalizedPaymentConclusion,
      payment_notes: String(formValues.payment_notes || existing.payment_notes || '').trim() || null
    };
  },
  async applyReceiptToInvoice({ invoiceId = '', oldPaidTotal = 0, paidNow = 0, invoiceTotal = 0 } = {}) {
    const targetInvoiceId = String(invoiceId || '').trim();
    if (!targetInvoiceId) return;
    const linkedInvoice = await this.hydrateInvoiceReceiptDraft({ id: targetInvoiceId }).then(result => result?.invoice || {}).catch(() => ({}));
    const ledgerReceipts = await this.fetchInvoiceReceiptsLedger({
      invoiceId: targetInvoiceId,
      invoiceNumber: linkedInvoice?.invoice_number
    }).catch(() => []);
    const normalizedInvoiceTotal = this.normalizeMoney(
      linkedInvoice?.grand_total ??
      linkedInvoice?.invoice_total ??
      linkedInvoice?.total_amount ??
      invoiceTotal ??
      0
    );
    const cumulativePaid = this.normalizeMoney(
      ledgerReceipts.reduce((sum, receipt) => sum + this.getReceiptAmountValue(receipt), 0)
    );
    const fallbackSnapshot = this.calculatePaymentSnapshot({ invoiceTotal: normalizedInvoiceTotal, oldPaidTotal, paidNow });
    const paidAmount = cumulativePaid > 0 ? cumulativePaid : this.normalizeMoney(fallbackSnapshot.amount_paid);
    const pendingAmount = Math.max(0, this.normalizeMoney(normalizedInvoiceTotal - paidAmount));
    const paymentState = paidAmount <= 0 ? 'Unpaid' : pendingAmount > 0 ? 'Partially Paid' : 'Paid';
    const paymentConclusion = pendingAmount <= 0 ? 'Settled' : 'Pending Settlement';
    const invoicePayload = {
      old_paid_total: this.normalizeMoney(Math.max(0, paidAmount - this.normalizeMoney(paidNow))),
      paid_now: this.normalizeMoney(paidNow),
      amount_paid: paidAmount,
      received_amount: paidAmount,
      pending_amount: pendingAmount,
      payment_state: paymentState,
      payment_conclusion: paymentConclusion
    };
    await Api.updateInvoice(targetInvoiceId, invoicePayload);
  },
  async saveForm() {
    if (this.state.saveInFlight) return;
    const id = String(E.receiptForm?.dataset.id || '').trim();
    const mode = String(E.receiptForm?.dataset.mode || '').trim();
    const updates = this.collectUpdates();
    if (mode === 'create_from_invoice') {
      if (!Permissions.canCreateReceiptFromInvoice()) {
        UI.toast('You do not have permission to create receipts.');
        return;
      }
      const invoiceUuid = String(E.receiptForm?.dataset.sourceInvoiceUuid || updates.invoice_id || '').trim();
      const normalizedAmount = this.normalizeAmountInput(updates.paid_now);
      if (!invoiceUuid) {
        UI.toast('Invoice UUID is required to create a receipt.');
        return;
      }
      if (normalizedAmount === null || normalizedAmount < 0) {
        UI.toast('Paid Now must be a valid non-negative amount before saving the receipt.');
        return;
      }
      this.state.saveInFlight = true;
      this.setFormBusy(true);
      console.time('entity-save');
      try {
        const snapshot = await this.computeReceiptSnapshot(invoiceUuid, normalizedAmount);
        const response = await Api.createReceiptFromInvoice(invoiceUuid, {
          amount: normalizedAmount,
          payment_method: String(E.receiptForm?.dataset.paymentMethod || '').trim() || null,
          payment_reference: String(E.receiptForm?.dataset.paymentReference || '').trim() || null
        });
        const parsed = this.extractReceiptAndItems(response);
        const receipt =
          parsed?.receipt ||
          response?.receipt ||
          response?.data?.receipt ||
          response?.result?.receipt ||
          response?.payload?.receipt ||
          response?.item ||
          response;
        const normalized = this.upsertLocalRow(receipt);
        const receiptUuid = String(normalized?.id || receipt?.id || response?.id || '').trim();
        if (receiptUuid) {
          const [linkedInvoice, invoiceReceipts] = await Promise.all([
            this.hydrateInvoiceReceiptDraft({ id: invoiceUuid }).then(result => result?.invoice || {}).catch(() => ({})),
            this.fetchReceiptsForInvoice({ id: invoiceUuid }).catch(() => [])
          ]);
          const sourcePendingAmount =
            this.normalizeAmountInput(snapshot.pending_amount ?? updates.pending_amount ?? normalized?.pending_amount ?? receipt?.pending_amount) ?? 0;
          const sourceInvoiceTotal =
            this.normalizeAmountInput(snapshot.invoice_total ?? normalized?.invoice_total ?? receipt?.invoice_total ?? updates.invoice_total) ?? 0;
          const calculatedPendingAmount = sourcePendingAmount;
          const headerPayload = this.buildReceiptHeaderPayload({
            ...updates,
            paid_now: normalizedAmount,
            invoice_total: sourceInvoiceTotal,
            old_paid_total: snapshot.old_paid_total,
            paid_now: snapshot.paid_now,
            new_paid_total: snapshot.new_paid_total,
            pending_amount: calculatedPendingAmount,
            payment_state: snapshot.payment_state,
            payment_conclusion: snapshot.payment_conclusion,
            amount_in_words: this.receiptAmountInWords(updates.amount_in_words, updates.currency, normalizedAmount)
          }, {
            existing: normalized || receipt || {},
            invoiceUuid,
            linkedInvoice,
            invoiceReceipts
          });
          await Api.updateReceipt(receiptUuid, this.filterReceiptColumns(headerPayload));
          await this.applyReceiptToInvoice({
            invoiceId: invoiceUuid,
            oldPaidTotal: snapshot.old_paid_total,
            paidNow: snapshot.paid_now,
            invoiceTotal: snapshot.invoice_total
          });
        }
        const receiptDisplay = String(normalized?.receipt_id || receipt?.receipt_id || '').trim();
        let normalizedDetailItems = parsed?.items || [];
        if (receiptUuid) {
          try {
            const reloaded = await this.loadReceiptAndItemsByUuid(receiptUuid);
            if (reloaded?.receipt) {
              this.upsertLocalRow(reloaded.receipt);
              normalizedDetailItems = Array.isArray(reloaded.items) ? reloaded.items : [];
              this.setCachedDetail(receiptUuid, reloaded.receipt, normalizedDetailItems, reloaded.invoice, reloaded.invoiceReceipts);
            } else {
              this.setCachedDetail(receiptUuid, normalized || receipt, normalizedDetailItems);
            }
          } catch (reloadError) {
            console.warn('[receipts] create_from_invoice: failed to reload receipt from DB after create', reloadError);
            this.setCachedDetail(receiptUuid, normalized || receipt, normalizedDetailItems);
          }
        } else {
          this.setCachedDetail(receiptUuid, normalized || receipt, normalizedDetailItems);
        }
        await window.Invoices?.syncAfterReceiptMutation?.({
          invoiceId: normalized?.invoice_id || receipt?.invoice_id || invoiceUuid,
          receipt: normalized || receipt
        });
        window.dispatchEvent(new CustomEvent('clients:refresh-totals', { detail: { reason: 'receipt-created' } }));
        UI.toast(receiptDisplay ? `Receipt ${receiptDisplay} created.` : 'Receipt created from invoice.');
        if (receiptUuid) {
          await this.openReceiptById(receiptUuid, { readOnly: false });
        } else {
          this.closeForm();
        }
      } catch (error) {
        UI.toast('Unable to create receipt: ' + (error?.message || 'Unknown error'));
      } finally {
        console.timeEnd('entity-save');
        this.state.saveInFlight = false;
        this.setFormBusy(false);
      }
      return;
    }
    if (!id) return;
    const paidNowValue = this.normalizeAmountInput(updates.paid_now);
    if (!String(updates.invoice_id || '').trim()) {
      UI.toast('Linked invoice is required before saving the receipt.');
      return;
    }
    if (paidNowValue === null || paidNowValue < 0) {
      UI.toast('Paid Now must be a valid non-negative amount.');
      E.receiptFormPaidNow?.focus();
      return;
    }
    const currentRecord = this.state.rows.find(row => this.receiptDbId(row.id) === id) || {};
    const workflowCheck = await window.WorkflowEngine?.enforceBeforeSave?.('receipts', currentRecord, {
      receipt_id: id,
      current_status: currentRecord?.status || '',
      requested_status: updates.status || '',
      requested_changes: { receipt: updates }
    });
    if (workflowCheck && !workflowCheck.allowed) {
      if (workflowCheck.pendingApproval === true && workflowCheck.approvalCreated === true) {
        UI.toast('Approval request submitted successfully.');
        return;
      }
      UI.toast(window.WorkflowEngine.composeDeniedMessage(workflowCheck, 'Receipt save blocked.'));
      return;
    }
    this.state.saveInFlight = true;
    this.setFormBusy(true);
    console.time('entity-save');
    try {
      const [linkedInvoice, invoiceReceipts] = await Promise.all([
        this.hydrateInvoiceReceiptDraft({ id: updates.invoice_id || currentRecord.invoice_id }).then(result => result?.invoice || {}).catch(() => ({})),
        this.fetchReceiptsForInvoice({ id: updates.invoice_id || currentRecord.invoice_id }).catch(() => [])
      ]);
      const headerPayload = this.buildReceiptHeaderPayload(updates, {
        existing: currentRecord,
        linkedInvoice,
        invoiceReceipts
      });
      const receiptItemsPayload = this.buildReceiptItemSavePayload(this.state.items);
      const response = await Api.updateReceipt(id, this.filterReceiptColumns(headerPayload), receiptItemsPayload);
      await this.applyReceiptToInvoice({
        invoiceId: headerPayload.invoice_id || currentRecord.invoice_id,
        oldPaidTotal: headerPayload.old_paid_total,
        paidNow: headerPayload.paid_now,
        invoiceTotal: headerPayload.invoice_total
      });
      const parsed = this.extractReceiptAndItems(response, id);
      const persisted = parsed?.receipt?.id ? parsed.receipt : { ...updates, id, receipt_id: currentRecord?.receipt_id || id };
      const normalized = this.upsertLocalRow(persisted);
      this.setCachedDetail(normalized?.id || id, persisted, parsed?.items || this.state.items, linkedInvoice, invoiceReceipts);
      if (normalized?.id && this.state.selectedReceipt?.id === normalized.id) {
        this.state.selectedReceipt = normalized;
        this.state.items = parsed?.items || this.state.items;
      }
      await window.Invoices?.syncAfterReceiptMutation?.({ invoiceId: normalized?.invoice_id || persisted?.invoice_id, receipt: normalized });
      window.dispatchEvent(new CustomEvent('clients:refresh-totals', { detail: { reason: 'receipt-saved' } }));
      UI.toast(`Receipt ${this.receiptDisplayId(normalized || persisted) || id} saved.`);
      this.closeForm();
    } catch (error) {
      UI.toast('Unable to save receipt: ' + (error?.message || 'Unknown error'));
    } finally {
      console.timeEnd('entity-save');
      this.state.saveInFlight = false;
      this.setFormBusy(false);
    }
  },
  async deleteReceipt(receiptId) {
    const id = this.resolveReceiptUuid(receiptId);
    if (!id) return;
    const displayId = this.receiptDisplayId(this.state.rows.find(row => this.receiptDbId(row.id) === id)) || id;
    if (!window.confirm(`Delete receipt ${displayId}? This cannot be undone.`)) return;
    this.setFormBusy(true);
    try {
      const deletedInvoiceId = String(
        this.state.rows.find(row => this.receiptDbId(row.id) === id)?.invoice_id ||
          this.state.selectedReceipt?.invoice_id ||
          ''
      ).trim();
      await Api.deleteReceipt(id);
      delete this.state.detailCacheById[id];
      this.removeLocalRow(id);
      if (deletedInvoiceId) await window.Invoices?.syncAfterReceiptMutation?.({ invoiceId: deletedInvoiceId });
      UI.toast(`Receipt ${displayId} deleted.`);
      if (String(E.receiptForm?.dataset.id || '').trim() === id) this.closeForm();
    } catch (error) {
      UI.toast('Unable to delete receipt: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  money(currency, value) {
    const amount = this.toNumberSafe(value);
    return `${String(currency || 'USD').toUpperCase()} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
  async loadReceiptPreviewData(receiptRef) {
    const receiptUuid = this.resolveReceiptUuid(receiptRef);
    if (!receiptUuid) throw new Error('Receipt UUID could not be resolved from the selected record.');
    const detail = await this.loadReceiptAndItemsByUuid(receiptUuid);
    if (!detail?.receipt) throw new Error('Receipt data was not found.');
    const client = this.getSupabaseClient();
    let invoice = null;
    let invoiceItems = [];
    const invoiceUuid = String(detail.receipt.invoice_id || '').trim();
    if (client && invoiceUuid) {
      const [{ data: invoiceRow }, { data: invoiceItemRows }] = await Promise.all([
        client.from('invoices').select('*').eq('id', invoiceUuid).maybeSingle(),
        client.from('invoice_items').select('*').eq('invoice_id', invoiceUuid)
      ]);
      invoice = invoiceRow || null;
      invoiceItems = Array.isArray(invoiceItemRows) ? invoiceItemRows : [];
    }
    const invoiceReceipts = Array.isArray(detail?.invoiceReceipts)
      ? detail.invoiceReceipts
      : await this.fetchReceiptsForInvoice(invoice || detail.receipt || {}).catch(() => []);
    const normalizedReceipt = this.normalizeReceiptWithLedger(detail.receipt, invoice || {}, invoiceReceipts);
    return { receiptUuid, receipt: normalizedReceipt, items: detail.items, invoice, invoiceItems, invoiceReceipts };
  },
  buildReceiptPreviewHtml(receipt = {}, items = [], invoice = null, invoiceItems = [], invoiceReceipts = null) {
    const r = this.normalizeReceipt(receipt || {});
    const normalizedItems = (Array.isArray(items) ? items : []).map(item => this.normalizeItem(item));
    const fallbackItems = (Array.isArray(invoiceItems) ? invoiceItems : []).map(item => this.normalizeItem(item));
    const sourceItems = normalizedItems.length ? normalizedItems : fallbackItems;
    const isOneTime = section => this.isOneTimeSection(section);
    const locationItems = sourceItems.filter(item => !isOneTime(item.section));
    const oneTimeItems = sourceItems.filter(item => isOneTime(item.section));
    const currency = r.currency || invoice?.currency || 'USD';
    const text = value => {
      const v = String(value ?? '').trim();
      return v ? U.escapeHtml(v) : '—';
    };
    const date = value => {
      const v = String(value || '').trim();
      if (!v) return '—';
      return U.escapeHtml(U.fmtDisplayDate(v));
    };
    const buildDetailRow = item => `<tr>
      <td>${text(item.location_name)}</td>
      <td>${text(item.location_address)}</td>
      <td class="cell-center">${date(item.service_start_date)}</td>
      <td class="cell-center">${date(item.service_end_date)}</td>
      <td>${text(item.item_name || item.modules || item.description)}</td>
      <td class="cell-center">${U.escapeHtml(String(item.quantity ?? 0))}</td>
      <td class="cell-right">${this.money(currency, item.unit_price ?? 0)}</td>
      <td class="cell-center">${U.escapeHtml(String(item.discount_percent ?? 0))}%</td>
      <td class="cell-right">${this.money(currency, item.discounted_unit_price ?? 0)}</td>
      <td class="cell-right">${this.money(currency, item.line_total ?? item.amount ?? 0)}</td>
      <td>${text(item.notes)}</td>
    </tr>`;
    const buildOneTimeRow = item => `<tr>
      <td>${text(item.item_name || item.modules || item.description)}</td>
      <td class="cell-center">${date(item.service_start_date)}</td>
      <td class="cell-center">${date(item.service_end_date)}</td>
      <td class="cell-center">${U.escapeHtml(String(item.quantity ?? 0))}</td>
      <td class="cell-right">${this.money(currency, item.unit_price ?? 0)}</td>
      <td class="cell-center">${U.escapeHtml(String(item.discount_percent ?? 0))}%</td>
      <td class="cell-right">${this.money(currency, item.line_total ?? item.amount ?? 0)}</td>
      <td>${text(item.notes)}</td>
    </tr>`;
    const oneTimeRows = oneTimeItems.length ? oneTimeItems.map(buildOneTimeRow).join('') : '<tr><td colspan="8" class="muted cell-center">No one-time fee rows.</td></tr>';
    const locationRows = locationItems.length ? locationItems.map(buildDetailRow).join('') : '<tr><td colspan="11" class="muted cell-center">No location detail rows.</td></tr>';
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    const hasLocationRows = locationItems.length > 0;
    const hasOneTimeRows = oneTimeItems.length > 0;
    const calculatedSubtotalLocations = locationItems.reduce((sum, item) => sum + this.toNumberSafe(item.line_total), 0);
    const calculatedSubtotalOneTime = oneTimeItems.reduce((sum, item) => sum + this.toNumberSafe(item.line_total), 0);
    const subtotalLocations = this.toNumberSafe(
      pickDefined(hasLocationRows ? calculatedSubtotalLocations : undefined, r.subtotal_locations, invoice?.subtotal_locations, 0)
    );
    const subtotalOneTime = this.toNumberSafe(
      pickDefined(hasOneTimeRows ? calculatedSubtotalOneTime : undefined, r.subtotal_one_time, invoice?.subtotal_one_time, 0)
    );
    const invoiceTotal = subtotalLocations + subtotalOneTime;
    const resolvedSnapshot = this.resolveReceiptPaymentSnapshot(r, { ...invoice, invoice_total: invoiceTotal }, invoiceReceipts);
    const oldPaidTotal = resolvedSnapshot.old_paid_total;
    const paidNow = resolvedSnapshot.paid_now;
    const newPaidTotal = resolvedSnapshot.new_paid_total;
    const pendingAmount = resolvedSnapshot.pending_amount;
    const paymentState = String(r.payment_state || '').trim() || resolvedSnapshot.payment_state;
    const paymentConclusion = String(r.payment_conclusion || '').trim() || resolvedSnapshot.payment_conclusion;
    const receivedAmount = resolvedSnapshot.received_amount;
    const amountInWords = this.receiptAmountInWords(r.amount_in_words, currency, receivedAmount);
    return `<!doctype html><html><head><meta charset="utf-8" /><title>Receipt Preview</title><style>
      :root{color-scheme:light;}*{box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:16px;background:#f3f4f6;color:#111827;}
      .receipt-sheet{max-width:1020px;margin:0 auto;background:#fff;border:1px solid #d1d5db;padding:22px;}
      .header-top{text-align:center;border-bottom:1px solid #111827;padding-bottom:10px}.company-title{font-size:26px;font-weight:700;letter-spacing:.04em;margin:0}
      .meta-grid{display:grid;grid-template-columns:1fr 300px;gap:20px;margin-top:16px}.voucher-title{margin:0;font-size:34px;font-weight:700}
      .meta-box{border:1px solid #111827}.meta-row{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #d1d5db}.meta-row:last-child{border-bottom:none}
      .meta-row span{padding:8px 10px;font-size:12px}.label{font-weight:700;background:#f9fafb;border-right:1px solid #d1d5db}
      .address-block{margin-top:10px;border:1px solid #d1d5db;padding:10px}.notice{margin-top:12px;padding:8px 10px;border:1px solid #dbeafe;background:#f8fbff;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #d1d5db;padding:7px 8px;font-size:12px;vertical-align:middle}th{background:#f9fafb}
      .section{margin-top:16px}.section h3{margin:0 0 6px;font-size:14px}.cell-right{text-align:right}.cell-center{text-align:center}.muted{color:#6b7280}
      .summary{margin-top:14px;font-size:12px;line-height:1.5}.totals-wrap{display:flex;justify-content:flex-end;margin-top:12px}.totals{width:320px;border:1px solid #111827}
      .totals .row{display:grid;grid-template-columns:1fr auto;border-bottom:1px solid #d1d5db}.totals .row:last-child{border-bottom:none}.totals .row span{padding:7px 10px;font-size:12px}
      .footer{margin-top:20px;border-top:1px solid #d1d5db;padding-top:8px;font-size:11px;color:#4b5563;text-align:center}
      @media print{body{background:#fff;padding:0}.receipt-sheet{border:none;max-width:none;padding:16px}}
    </style></head><body><article class="receipt-sheet">
      <header class="header-top"><h1 class="company-title">${text(r.provider_legal_name || invoice?.provider_legal_name || 'INCHECK360')}</h1></header>
      <section class="meta-grid"><div><div><strong>${text(r.provider_legal_name || invoice?.provider_legal_name || 'Company')}</strong></div><div>${text(r.provider_address || invoice?.provider_address || 'Principal office')}</div></div>
        <div><h2 class="voucher-title">RECEIPT VOUCHER</h2><div class="meta-box">
          <div class="meta-row"><span class="label">Receipt No.</span><span>${text(r.receipt_number || r.receipt_id)}</span></div>
          <div class="meta-row"><span class="label">Receipt Date</span><span>${date(r.receipt_date)}</span></div>
          <div class="meta-row"><span class="label">Invoice No.</span><span>${text(r.invoice_number || invoice?.invoice_number || r.invoice_id)}</span></div>
        </div></div></section>
      <section class="address-block"><div><strong>${text(r.customer_legal_name || r.customer_name || invoice?.customer_legal_name || invoice?.customer_name)}</strong></div><div>${text(r.customer_address || invoice?.customer_address)}</div></section>
      <div class="notice">If you have any questions about this Invoice, please contact: ${text(r.support_email || invoice?.support_email || 'support@incheck360.com')}</div>
      <section class="section"><h3>Location Details</h3><table><thead><tr><th>Location Name</th><th>Location Address</th><th>Service Start Date</th><th>Service End Date</th><th>Modules / Item Name</th><th>Qty</th><th>Unit Price</th><th>Discount %</th><th>Discounted Unit Price</th><th>Line Total</th><th>Notes</th></tr></thead><tbody>${locationRows}</tbody></table></section>
      <section class="section"><h3>One-time Fees</h3><table><thead><tr><th>Item Name</th><th>Service Start Date</th><th>Service End Date</th><th>Qty</th><th>Unit Price</th><th>Discount %</th><th>Line Total</th><th>Notes</th></tr></thead><tbody>${oneTimeRows}</tbody></table></section>
      <p class="summary">We have received from ${text(r.customer_legal_name || r.customer_name || invoice?.customer_legal_name || invoice?.customer_name)} the sum of ${text(amountInWords)} being partial payment on account of ${text(r.invoice_number || invoice?.invoice_number || r.invoice_id)}. Pending amount: ${this.money(currency, pendingAmount)}.</p>
      <div class="totals-wrap"><div class="totals">
        <div class="row"><span>Subtotal Locations</span><span>${this.money(currency, subtotalLocations)}</span></div>
        <div class="row"><span>Subtotal One Time</span><span>${this.money(currency, subtotalOneTime)}</span></div>
        <div class="row"><span>Invoice Total</span><span>${this.money(currency, invoiceTotal)}</span></div>
        <div class="row"><span>Old Paid Total</span><span>${this.money(currency, oldPaidTotal)}</span></div>
        <div class="row"><span>Paid Now</span><span>${this.money(currency, paidNow)}</span></div>
        <div class="row"><span>Received Amount</span><span>${this.money(currency, receivedAmount)}</span></div>
        <div class="row"><span>New Paid Total</span><span>${this.money(currency, newPaidTotal)}</span></div>
        <div class="row"><span>Pending Amount</span><span>${this.money(currency, pendingAmount)}</span></div>
        <div class="row"><span>Payment State</span><span>${text(paymentState || r.status)}</span></div>
        <div class="row"><span>Payment Conclusion</span><span>${text(paymentConclusion)}</span></div>
        <div class="row"><span>Amount in Words</span><span>${text(amountInWords)}</span></div>
      </div></div>
      <footer class="footer">This document is computer generated and does not require a signature.</footer>
    </article></body></html>`;
  },
  async previewReceipt(receiptId) {
    const id = this.resolveReceiptUuid(receiptId);
    if (!id) return;
    try {
      const { receipt, items, invoice, invoiceItems, invoiceReceipts } = await this.loadReceiptPreviewData(id);
      const html = this.buildReceiptPreviewHtml(receipt, items, invoice, invoiceItems, invoiceReceipts);
      const brandedHtml = U.addIncheckDocumentLogo(U.formatPreviewHtmlDates(html));
      const label = this.receiptDisplayId(receipt) || id;
      if (E.receiptPreviewTitle) E.receiptPreviewTitle.textContent = `RECEIPT VOUCHER · ${label}`;
      if (E.receiptPreviewFrame) E.receiptPreviewFrame.srcdoc = brandedHtml;
      if (E.receiptPreviewModal) {
        E.receiptPreviewModal.classList.add('open');
        E.receiptPreviewModal.setAttribute('aria-hidden', 'false');
      }
    } catch (error) {
      UI.toast('Unable to preview receipt: ' + (error?.message || 'Unknown error'));
    }
  },
  closePreview() {
    if (!E.receiptPreviewModal) return;
    E.receiptPreviewModal.classList.remove('open');
    E.receiptPreviewModal.setAttribute('aria-hidden', 'true');
    if (E.receiptPreviewFrame) E.receiptPreviewFrame.srcdoc = '';
  },
  exportPreviewPdf() {
    const frame = E.receiptPreviewFrame;
    const previewTitle = String(E.receiptPreviewTitle?.textContent || 'Receipt Preview').trim();
    if (!frame || !String(frame.srcdoc || '').trim()) {
      UI.toast('Open receipt preview first to extract PDF.');
      return;
    }
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      UI.toast('Unable to access receipt preview content.');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    UI.toast(`Print dialog opened for ${previewTitle}. Choose "Save as PDF" to extract.`);
  },
  async refresh(force = false) {
    if (this.state.loading && !force) return;
    if (!Permissions.canViewReceipts()) {
      this.state.rows = [];
      this.state.filteredRows = [];
      this.render();
      return;
    }
    this.state.loading = true;
    this.state.loadError = '';
    this.render();
    try {
      const filters = {};
      if (this.state.search) filters.receipt_number = this.state.search;
      if (this.state.invoiceNumber) filters.invoice_number = this.state.invoiceNumber;
      if (this.state.customerName) filters.customer_name = this.state.customerName;
      if (this.state.status && this.state.status !== 'All') filters.status = this.state.status;
      const response = await Api.listReceipts(filters, {
        limit: this.state.limit,
        page: this.state.page,
        summary_only: true,
        forceRefresh: force
      });
      const normalized = this.extractListResult(response);
      this.state.rows = normalized.rows.map(row => this.normalizeReceipt(row));
      this.state.total = normalized.total;
      this.state.returned = normalized.returned;
      this.state.hasMore = normalized.hasMore;
      this.state.page = normalized.page;
      this.state.limit = normalized.limit;
      this.state.offset = normalized.offset;
    } catch (error) {
      this.state.rows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load receipts.';
    } finally {
      this.state.loading = false;
      this.applyFilters();
      this.renderFilters();
      this.render();
    }
  },
  init() {
    if (this.state.initialized) return;
    const bind = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        this.state.page = 1;
        this.refresh(true);
      };
      if (el.tagName === 'INPUT') el.addEventListener('input', debounce(sync, 250));
      el.addEventListener('change', sync);
    };
    bind(E.receiptsSearchInput, 'search');
    bind(E.receiptsInvoiceFilter, 'invoiceNumber');
    bind(E.receiptsCustomerFilter, 'customerName');
    bind(E.receiptsStatusFilter, 'status');
    if (E.receiptSummary) {
      const activate = card => {
        if (!card) return;
        const filter = card.getAttribute('data-kpi-filter');
        if (!filter) return;
        this.applyKpiFilter(filter);
      };
      E.receiptSummary.addEventListener('click', event => {
        activate(event.target?.closest?.('[data-kpi-filter]'));
      });
      E.receiptSummary.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target?.closest?.('[data-kpi-filter]');
        if (!card) return;
        event.preventDefault();
        activate(card);
      });
    }

    if (E.receiptsRefreshBtn) E.receiptsRefreshBtn.addEventListener('click', () => this.refresh(true));
    if (E.receiptsTbody) {
      E.receiptsTbody.addEventListener('click', event => {
        const trigger = event.target?.closest?.('button[data-receipt-view],button[data-receipt-edit],button[data-receipt-preview],button[data-receipt-delete]');
        if (!trigger) return;
        const viewId = trigger.getAttribute('data-receipt-view');
        if (viewId) return this.runRowAction(`view:${viewId}`, trigger, () => this.openReceiptById(viewId, { readOnly: true, trigger }));
        const editId = trigger.getAttribute('data-receipt-edit');
        if (editId) return this.runRowAction(`edit:${editId}`, trigger, () => this.openReceiptById(editId, { readOnly: false, trigger }));
        const previewId = trigger.getAttribute('data-receipt-preview');
        if (previewId) return this.runRowAction(`preview:${previewId}`, trigger, () => this.previewReceipt(previewId));
        const deleteId = trigger.getAttribute('data-receipt-delete');
        if (deleteId) return this.runRowAction(`delete:${deleteId}`, trigger, () => this.deleteReceipt(deleteId));
      });
    }
    if (E.receiptForm) {
      E.receiptForm.addEventListener('submit', event => {
        event.preventDefault();
        this.saveForm();
      });
      E.receiptForm.addEventListener('input', event => {
        if (['receiptFormPaidNow', 'receiptFormInvoiceGrandTotal', 'receiptFormOldPaidTotal'].includes(event.target?.id)) {
          this.recalculatePaymentFields();
        }
      });
      E.receiptForm.addEventListener('change', event => {
        if (['receiptFormPaidNow', 'receiptFormInvoiceGrandTotal', 'receiptFormOldPaidTotal'].includes(event.target?.id)) {
          this.recalculatePaymentFields();
        }
      });
    }
    if (E.receiptFormCloseBtn) E.receiptFormCloseBtn.addEventListener('click', () => this.closeForm());
    if (E.receiptFormCancelBtn) E.receiptFormCancelBtn.addEventListener('click', () => this.closeForm());
    if (E.receiptFormDeleteBtn) E.receiptFormDeleteBtn.addEventListener('click', () => this.deleteReceipt(E.receiptForm?.dataset.id || ''));
    if (E.receiptFormPreviewBtn) E.receiptFormPreviewBtn.addEventListener('click', () => this.previewReceipt(E.receiptForm?.dataset.id || ''));
    if (E.receiptFormModal) E.receiptFormModal.addEventListener('click', event => {
      if (event.target === E.receiptFormModal) this.closeForm();
    });
    if (E.receiptPreviewCloseBtn) E.receiptPreviewCloseBtn.addEventListener('click', () => this.closePreview());
    if (E.receiptPreviewExportPdfBtn) E.receiptPreviewExportPdfBtn.addEventListener('click', () => this.exportPreviewPdf());
    if (E.receiptPreviewModal) E.receiptPreviewModal.addEventListener('click', event => {
      if (event.target === E.receiptPreviewModal) this.closePreview();
    });
    this.state.initialized = true;
  }
};

window.Receipts = Receipts;
