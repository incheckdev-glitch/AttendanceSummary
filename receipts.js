const Receipts = {
  canUseAdminOverride() {
    return Boolean(window.AdminOverride?.canOverride?.() || Permissions?.isAdminLike?.());
  },
  applyAdminOverrideBanner(message = '') {
    if (!this.canUseAdminOverride() || !E.receiptForm) return;
    window.AdminOverride?.applyBanner?.(E.receiptForm, {
      active: true,
      message: message || 'Admin Override Mode: this receipt can be edited even if it is normally locked.'
    });
  },
  logAdminOverride(action = 'receipt_override', oldValues = null, newValues = null) {
    if (!this.canUseAdminOverride()) return;
    const recordId = String(E.receiptForm?.dataset?.id || newValues?.id || newValues?.receipt_id || '').trim();
    window.AdminOverride?.logOverride?.({
      resource: 'receipts',
      recordId,
      action,
      oldValues,
      newValues,
      reason: 'Admin override from Receipts module'
    });
  },
  RECEIPT_ALLOWED_COLUMNS: new Set([
    'id',
    'receipt_id',
    'receipt_number',
    'invoice_uuid',
    'invoice_id',
    'invoice_number',
    'client_id',
    'agreement_id',
    'agreement_number',
    'company_id',
    'company_name',
    'contact_id',
    'contact_name',
    'contact_email',
    'contact_phone',
    'contact_mobile',
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
    'receipt_status',
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
    'receipt_date',
    'payment_date',
    'amount_paid',
    'balance_due',
    'payment_status'
  ]),
  receiptFields: [
    'id',
    'receipt_id',
    'receipt_number',
    'invoice_uuid',
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
    'balance_due',
    'payment_status',
    'remaining_balance',
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

  columnMap: {
    receipt_no: { accessor: row => row.receipt_number || row.receipt_no || row.receipt_id, serverField: 'receipt_number' },
    invoice_no: { accessor: row => row.invoice_number || row.invoice_no || row.invoice_id, serverField: 'invoice_number' },
    customer: { accessor: row => row.customer_name || row.company_name || row.client_name, serverField: 'customer_name' },
    receipt_date: { accessor: row => row.receipt_date, serverField: 'receipt_date' },
    currency: { accessor: row => row.currency, serverField: 'currency' },
    received: { accessor: row => row.amount_received || row.received_amount || row.paid_now || row.receipt_amount || row.payment_amount || row.amount || 0, serverField: 'received_amount' },
    payment_state: { accessor: row => row.payment_state || row.payment_status, serverField: 'payment_state' },
    status: { accessor: row => row.status, serverField: 'status' },
    updated_at: { accessor: row => row.updated_at, serverField: 'updated_at' }
  },
  tableColumns: [
    { key: 'receipt_no', label: 'Receipt #' }, { key: 'invoice_no', label: 'Invoice #' }, { key: 'customer', label: 'Customer' },
    { key: 'receipt_date', label: 'Receipt Date' }, { key: 'currency', label: 'Currency' }, { key: 'received', label: 'Received' },
    { key: 'payment_state', label: 'Payment State' }, { key: 'status', label: 'Status' }, { key: 'updated_at', label: 'Updated At' }, null
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
    rowActionInFlight: new Set(),
    selectedDetailsId: '',
    openReceiptActionsMenu: null,
    openReceiptActionsTrigger: null
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
  isWorkflowValidationUnavailable(value, includeTechnicalErrors = false) {
    const text = String(value?.message || value?.reason || value || '').toLowerCase();
    const unavailableResult = Boolean(
      value?.unavailable === true ||
      value?.fallback === true ||
      text.includes('workflow validation is unavailable') ||
      text.includes('save blocked until workflow is reachable') ||
      text.includes('workflow service unavailable')
    );
    if (unavailableResult || !includeTechnicalErrors) return unavailableResult;
    return Boolean(
      text.includes('failed to fetch') ||
      text.includes('network error') ||
      text.includes('rpc') ||
      text.includes('service unavailable') ||
      text.includes('is not a function') ||
      text.includes('cannot read') ||
      text.includes('undefined is not')
    );
  },
  async validateReceiptWorkflowOrFallback(currentRecord = {}, requestedChanges = {}) {
    try {
      const workflowEngine = window.WorkflowEngine;
      if (!workflowEngine || typeof workflowEngine.enforceBeforeSave !== 'function') {
        console.warn('[Receipt] Workflow validation unavailable; continuing receipt save fallback.', {
          reason: 'Workflow helper is missing or enforceBeforeSave is not available.'
        });
        return { allowed: true, unavailable: true, fallback: true };
      }

      const workflowCheck = await workflowEngine.enforceBeforeSave('receipts', currentRecord, requestedChanges);
      if (this.isWorkflowValidationUnavailable(workflowCheck)) {
        console.warn('[Receipt] Workflow validation unavailable; continuing receipt save fallback.', workflowCheck);
        return { allowed: true, unavailable: true, fallback: true };
      }

      return workflowCheck;
    } catch (error) {
      if (this.isWorkflowValidationUnavailable(error, true)) {
        console.warn('[Receipt] Workflow validation unavailable; continuing receipt save fallback.', error);
        return { allowed: true, unavailable: true, fallback: true };
      }
      return {
        allowed: false,
        pendingApproval: false,
        approvalCreated: false,
        reason: error?.message || 'Workflow rejected this receipt change.'
      };
    }
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
  normalizeReceiptPaymentState(receipt = {}, linkedInvoice = null) {
    const rawState = String(
      receipt?.payment_state ||
      receipt?.paymentState ||
      ''
    ).trim();

    const receivedAmount = Number(
      receipt?.received_amount ??
      receipt?.payment_amount ??
      receipt?.amount_received ??
      receipt?.amount_paid ??
      receipt?.paid_now ??
      receipt?.amount ??
      0
    );

    const invoiceSource = linkedInvoice && typeof linkedInvoice === 'object' ? linkedInvoice : {};
    const hasLinkedInvoice = Boolean(
      String(receipt?.invoice_id || receipt?.invoice_uuid || receipt?.invoice_number || '').trim() ||
      String(invoiceSource?.id || invoiceSource?.invoice_id || invoiceSource?.invoice_number || '').trim()
    );
    const balanceSource =
      invoiceSource?.balance_due ??
      invoiceSource?.pending_amount ??
      invoiceSource?.remaining_balance ??
      receipt?.balance_due ??
      receipt?.pending_amount ??
      receipt?.remaining_balance;
    const hasBalanceSource = balanceSource !== undefined && balanceSource !== null && !(typeof balanceSource === 'string' && balanceSource.trim() === '');
    const invoiceBalance = Number(hasBalanceSource ? balanceSource : 0);

    const invoicePaymentStatus = String(
      invoiceSource?.payment_status ||
      invoiceSource?.payment_state ||
      invoiceSource?.status ||
      receipt?.payment_status ||
      ''
    ).trim().toLowerCase();

    const isInvoicePaid = hasLinkedInvoice && (
      (hasBalanceSource && invoiceBalance <= 0) ||
      ['paid', 'fully_paid', 'fully paid', 'settled', 'settlement'].includes(invoicePaymentStatus)
    );

    if (receivedAmount > 0 && isInvoicePaid) {
      return 'Settlement';
    }

    if (receivedAmount > 0 && hasLinkedInvoice && hasBalanceSource && invoiceBalance > 0) {
      return 'Partial Payment';
    }

    if (receivedAmount > 0) {
      return 'Received';
    }

    if (['not paid', 'unpaid', 'pending'].includes(rawState.toLowerCase())) {
      return 'Received';
    }

    return rawState || 'Received';
  },
  receiptPaymentStateFromSnapshot(snapshot = {}, linkedInvoice = null) {
    return this.normalizeReceiptPaymentState({
      ...snapshot,
      payment_state: snapshot.payment_state,
      received_amount: snapshot.received_amount ?? snapshot.paid_now,
      amount_received: snapshot.amount_received ?? snapshot.received_amount ?? snapshot.paid_now,
      pending_amount: snapshot.pending_amount,
      balance_due: snapshot.balance_due ?? snapshot.pending_amount
    }, linkedInvoice);
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
    if (explicit) return U.normalizeAmountWordsSentence(explicit);
    if (U?.formatAmountInWords) return U.formatAmountInWords(fallbackAmount, currency);
    const amountInWords = window.Invoices?.amountToWords?.(fallbackAmount, currency);
    if (typeof amountInWords === 'string' && amountInWords.trim()) return U.normalizeAmountWordsSentence(amountInWords.trim());
    return U.normalizeAmountWordsSentence(`${this.money(currency, fallbackAmount)} and 00/100`);
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
      pickDefined(source.receipt_date, source.receiptDate, source.payment_date, source.paymentDate)
    );
    normalized.receipt_date = normalizedReceiptDate || String(normalized.receipt_date || '').trim();
    normalized.receiptDate = normalized.receipt_date;
    normalized.invoice_total = this.toNumberSafe(normalized.invoice_total ?? source.invoice_grand_total ?? source.grand_total);
    const amountReceived = this.getReceiptAmountValue({
      amount_received: normalized.amount_received,
      received_amount: normalized.received_amount,
      paid_now: normalized.paid_now,
      receipt_amount: source.receipt_amount,
      payment_amount: source.payment_amount,
      amount_paid: source.amount_paid,
      amount: source.amount
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
      paid_now: normalized.paid_now,
      receipt_amount: source.receipt_amount,
      payment_amount: source.payment_amount,
      amount_paid: source.amount_paid,
      amount: source.amount
    });
    normalized.amount_received = this.toNumberSafe(receivedAmountValue || normalized.paid_now);
    normalized.received_amount = normalized.amount_received;
    const pendingAmountValue =
      normalized.pending_amount !== '' && normalized.pending_amount !== null && normalized.pending_amount !== undefined
        ? normalized.pending_amount
        : null;
    normalized.pending_amount = pendingAmountValue === null ? snapshot.pending_amount : this.toNumberSafe(pendingAmountValue);
    normalized.payment_state = this.normalizeReceiptPaymentState({
      ...normalized,
      payment_state: String(normalized.payment_state || '').trim() || snapshot.payment_state,
      pending_amount: normalized.pending_amount,
      balance_due: normalized.balance_due || normalized.pending_amount
    }, normalized);
    normalized.payment_conclusion = String(normalized.payment_conclusion || '').trim() || snapshot.payment_conclusion;
    return normalized;
  },
  isSettlementReceipt(receipt = {}) {
    const status = this.normalizeText(receipt?.status);
    const pendingAmount = this.toNumberSafe(receipt?.pending_amount);
    const paymentState = this.normalizeText(receipt?.payment_state);
    return status === 'settlement' || receipt?.is_settlement === true || pendingAmount === 0 || ['settlement', 'fully paid'].includes(paymentState);
  },
  receiptTypeLabel(receipt = {}) {
    return this.isSettlementReceipt(receipt) ? 'Settlement' : 'Receipt';
  },
  isHardwareSection(section) {
    const raw = String(section || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ['hardware', 'hardwares', 'hardwar', 'hardwars', 'device', 'devices', 'equipment'].includes(raw);
  },
  isOneTimeSection(section) {
    const raw = String(section || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ['one_time_fee', 'one_time', 'setup', 'non_recurring'].includes(raw);
  },
  normalizeItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => values.find(v => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === ''));
    const rawSection = pick(source.section, source.item_section, source.itemSection, source.type, source.category);
    const section = this.isHardwareSection(rawSection)
      ? 'hardware'
      : this.isOneTimeSection(rawSection)
        ? 'one_time_fee'
        : 'location_details';
    const description = this.sanitizeText(pick(source.description, source.item_description, source.itemDescription, source.note, source.notes, source.catalog_note, source.catalogNote, source.catalog_description, source.catalogDescription));
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
  isCapabilityItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const section = String(source.section || source.item_section || source.itemSection || source.type || source.category || '').trim().toLowerCase();
    return section === 'capability' || Boolean(String(source.capability_name || source.capabilityName || source.capability_value || source.capabilityValue || '').trim());
  },
  filterReceiptCommercialItems(items = []) {
    return (Array.isArray(items) ? items : []).filter(item => !this.isCapabilityItem(item));
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
      items: this.filterReceiptCommercialItems(items).map(item => this.normalizeItem(item))
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
    if (filter === 'paid') return this.isFullyPaidReceipt(row);
    if (filter === 'grand-total') return this.toNumberSafe(row?.invoice_total) > 0;
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.state.page = 1;
    this.refresh(true);
  },
  isFullyPaidReceipt(receipt = {}, linkedInvoice = null) {
    const paymentState = this.normalizeText(this.normalizeReceiptPaymentState(receipt, linkedInvoice || receipt));
    const invoiceStatus = this.normalizeText((linkedInvoice || receipt)?.payment_status || (linkedInvoice || receipt)?.payment_state);
    const balanceValue = (linkedInvoice || receipt)?.balance_due ?? (linkedInvoice || receipt)?.pending_amount ?? (linkedInvoice || receipt)?.remaining_balance;
    const hasBalance = balanceValue !== undefined && balanceValue !== null && !(typeof balanceValue === 'string' && balanceValue.trim() === '');
    const balanceDue = this.toNumberSafe(balanceValue);
    return paymentState === 'settlement' || invoiceStatus === 'paid' || invoiceStatus === 'fully paid' || (hasBalance && balanceDue <= 0 && this.getReceiptAmountValue(receipt) > 0);
  },
  renderSummary() {
    if (!E.receiptSummary) return;
    const total = this.state.rows.length;
    const issued = this.state.rows.filter(r => this.normalizeText(r.status) === 'issued').length;
    const paid = this.state.rows.filter(r => this.isFullyPaidReceipt(r)).length;
    const totalAmount = this.state.rows.reduce((sum, row) => sum + this.toNumberSafe(row.invoice_total), 0);
    const cards = [
      { label: 'Total Receipts', value: total, filter: 'total', icon: '🧾', tone: 'blue', sub: 'All receipt vouchers' },
      { label: 'Issued', value: issued, filter: 'issued', icon: '✓', tone: 'green', sub: 'Issued receipts' },
      { label: 'Fully Paid', value: paid, filter: 'paid', icon: '●', tone: 'purple', sub: 'Settled records' },
      { label: 'Grand Total', value: this.formatMoney(totalAmount), filter: 'grand-total', icon: '$', tone: 'amber', sub: 'Invoice total value' }
    ];
    E.receiptSummary.innerHTML = cards.map(card => {
      const active = (this.state.kpiFilter || 'total') === card.filter;
      return `<div class="receipt-kpi-card receipt-kpi-card--${U.escapeAttr(card.tone)}${active ? ' kpi-filter-active' : ''}" data-kpi-filter="${U.escapeAttr(card.filter)}" role="button" tabindex="0" aria-pressed="${active ? 'true' : 'false'}"><span class="receipt-kpi-icon">${U.escapeHtml(card.icon)}</span><div class="receipt-kpi-copy"><span class="receipt-kpi-label">${U.escapeHtml(card.label)}</span><strong class="receipt-kpi-value">${U.escapeHtml(String(card.value))}</strong><span class="receipt-kpi-sub">${U.escapeHtml(card.sub)}</span></div></div>`;
    }).join('');
    this.renderDistributions();
  },
  renderDistributions() {
    const rows = this.state.rows || [];
    const renderProgress = (items, total) => items.map(item => {
      const pct = total ? Math.round((item.value / total) * 100) : 0;
      return `<div class="receipt-progress-row"><div><span>${U.escapeHtml(item.label)}</span><strong>${U.escapeHtml(String(item.value))}</strong></div><div class="receipt-progress-track"><span style="width:${pct}%"></span></div></div>`;
    }).join('');
    if (E.receiptsStatusDistribution) {
      const countStatus = label => rows.filter(r => this.normalizeText(r.status) === this.normalizeText(label)).length;
      E.receiptsStatusDistribution.innerHTML = renderProgress([
        { label: 'Issued', value: countStatus('Issued') },
        { label: 'Received', value: countStatus('Received') },
        { label: 'Cancelled', value: countStatus('Cancelled') }
      ], rows.length) || '<div class="muted">No receipts loaded.</div>';
    }
    if (E.receiptsTypeDistribution) {
      const settlement = rows.filter(r => this.isSettlementReceipt(r) || this.normalizeText(this.normalizeReceiptPaymentState(r, r)) === 'settlement').length;
      E.receiptsTypeDistribution.innerHTML = renderProgress([
        { label: 'Settlement', value: settlement },
        { label: 'Receipt', value: Math.max(rows.length - settlement, 0) }
      ], rows.length) || '<div class="muted">No receipts loaded.</div>';
    }
  },
  renderFilters() {
    if (!E.receiptsStatusFilter) return;
    const statuses = ['All', ...new Set(this.state.rows.map(row => String(row.status || '').trim()).filter(Boolean))];
    E.receiptsStatusFilter.innerHTML = statuses.map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
    E.receiptsStatusFilter.value = statuses.includes(this.state.status) ? this.state.status : 'All';
  },

  findDetailsRow(id) {
    const target = String(id || '').trim();
    if (!target) return null;
    const matches = row => [row?.id, row?.receipt_id, row?.receipt_number].some(value => String(value || '').trim() === target);
    return (this.state.rows || []).find(matches) || (this.state.filteredRows || []).find(matches) || null;
  },
  openDetailsDrawer(rowOrId) {
    const row = typeof rowOrId === 'string' ? this.findDetailsRow(rowOrId) : rowOrId;
    if (!row || !window.RecordDetailsDrawer) return;
    const id = String(row.id || row.receipt_id || row.receipt_number || '').trim();
    const paymentState = this.normalizeReceiptPaymentState(row, row);
    this.state.selectedDetailsId = id;
    window.RecordDetailsDrawer.open({
      eyebrow: 'Finance · Receipt',
      title: row.receipt_number || row.receipt_id || 'Receipt Details',
      subtitle: [row.customer_name, paymentState || row.status, row.currency].filter(Boolean).join(' · '),
      sections: [
        { title: 'Summary', cards: [
          ['Status', row.status],
          ['Payment State', paymentState],
          ['Type', this.receiptTypeLabel(row)],
          ['Currency', row.currency],
          ['Amount Received', this.formatMoney(row.amount_received ?? row.received_amount ?? row.paid_now)],
          ['Pending Amount', this.formatMoney(row.pending_amount ?? row.balance_due)]
        ] },
        { title: 'Customer & Invoice', fields: [
          ['Customer', row.customer_name],
          ['Invoice', row.invoice_number || row.invoice_id],
          ['Agreement', row.agreement_number || row.agreement_id],
          ['Company', row.company_name || row.company_id],
          ['Contact', row.contact_name],
          ['Receipt UUID', row.id]
        ] },
        { title: 'Payment Details', fields: [
          ['Receipt Date', U.fmtDisplayDate(row.receipt_date || row.payment_date)],
          ['Payment Method', row.payment_method],
          ['Payment Reference', row.payment_reference],
          ['Invoice Total', this.formatMoney(row.invoice_total)],
          ['Old Paid Total', this.formatMoney(row.old_paid_total)],
          ['New Paid Total', this.formatMoney(row.new_paid_total)]
        ] },
        { title: 'Notes', html: `<div class="lead-details-notes">${U.escapeHtml(row.payment_notes || row.notes || 'No notes added yet.')}</div>` }
      ],
      actions: [
        { label: 'View', variant: 'primary', permissionResource: 'receipts', permissionAction: 'view', onClick: btn => this.openReceiptById(id, { readOnly: true, trigger: btn }) },
        Permissions.canUpdateReceipt() ? { label: 'Edit', variant: 'ghost', permissionResource: 'receipts', permissionAction: 'update', onClick: btn => this.openReceiptById(id, { readOnly: false, trigger: btn }) } : null,
        Permissions.canPreviewReceipt() ? { label: 'Preview', variant: 'ghost', permissionResource: 'receipts', permissionAction: 'view', onClick: () => this.previewReceipt(id) } : null,
        Permissions.canDeleteReceipt() ? { label: 'Delete', variant: 'ghost', permissionResource: 'receipts', permissionAction: 'delete', onClick: () => this.deleteReceipt(id) } : null
      ].filter(Boolean)
    });
    this.render();
  },
  receiptPill(label, kind = 'status') {
    const text = String(label || '—').trim() || '—';
    const slug = this.normalizeText(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default';
    return `<span class="receipt-status-pill receipt-status-pill--${U.escapeAttr(slug)} receipt-status-pill--${U.escapeAttr(kind)}">${U.escapeHtml(text)}</span>`;
  },
  buildReceiptRowActionItems(row, id) {
    const communicationContext = JSON.stringify({ related_module: 'receipts', related_record_id: id, related_record_ref: row.receipt_number || row.receipt_id || id, related_record_title: row.customer_name || row.receipt_number || row.receipt_id || '' });
    return [
      Permissions.canUpdateReceipt() ? `<button class="invoice-row-menu-item" type="button" data-receipt-edit="${U.escapeAttr(id)}">Edit</button>` : '',
      Permissions.canPreviewReceipt() ? `<button class="invoice-row-menu-item" type="button" data-receipt-preview="${U.escapeAttr(id)}">Preview</button>` : '',
      `<button class="invoice-row-menu-item" type="button" data-create-communication="true" data-communication-context="${U.escapeAttr(communicationContext)}">Create Communication</button>`,
      Permissions.canDeleteReceipt() ? `<button class="invoice-row-menu-item danger" type="button" data-receipt-delete="${U.escapeAttr(id)}">Delete</button>` : ''
    ].filter(Boolean).join('') || '<span class="invoice-row-menu-empty">No actions available</span>';
  },
  positionReceiptActionsMenu(triggerBtn, menu) {
    if (!triggerBtn || !menu) return;
    const rect = triggerBtn.getBoundingClientRect();
    const menuWidth = 210;
    const menuHeight = Math.max(menu.offsetHeight || 180, 160);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    let top = rect.bottom + 8;
    if (top + menuHeight > viewportHeight - 12) top = Math.max(12, rect.top - menuHeight - 8);
    let left = rect.right - menuWidth;
    left = Math.max(12, Math.min(left, viewportWidth - menuWidth - 12));
    menu.style.top = `${top}px`; menu.style.left = `${left}px`; menu.style.width = `${menuWidth}px`;
  },
  closeReceiptActionsMenu() {
    if (this.state.openReceiptActionsMenu?.parentNode) this.state.openReceiptActionsMenu.parentNode.removeChild(this.state.openReceiptActionsMenu);
    this.state.openReceiptActionsTrigger?.setAttribute?.('aria-expanded', 'false');
    this.state.openReceiptActionsMenu = null; this.state.openReceiptActionsTrigger = null;
    document.removeEventListener('click', this.boundReceiptActionsOutsideClick, true);
    document.removeEventListener('keydown', this.boundReceiptActionsEscape, true);
    window.removeEventListener('resize', this.boundReceiptActionsReposition, true);
    window.removeEventListener('scroll', this.boundReceiptActionsReposition, true);
  },
  openReceiptActionsMenu(triggerBtn) {
    const sourcePanel = triggerBtn?.closest?.('.invoice-row-menu')?.querySelector?.('.invoice-row-menu-panel');
    this.closeReceiptActionsMenu();
    const menu = document.createElement('div');
    menu.className = 'invoice-actions-menu invoice-row-menu-panel floating receipt-actions-floating';
    menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Receipt actions');
    menu.innerHTML = sourcePanel?.innerHTML || '<span class="invoice-row-menu-empty">No actions available</span>';
    menu.addEventListener('click', event => this.handleReceiptActionMenuClick(event));
    document.body.appendChild(menu);
    this.state.openReceiptActionsMenu = menu; this.state.openReceiptActionsTrigger = triggerBtn;
    triggerBtn?.setAttribute?.('aria-expanded', 'true'); this.positionReceiptActionsMenu(triggerBtn, menu);
    requestAnimationFrame(() => {
      document.addEventListener('click', this.boundReceiptActionsOutsideClick, true);
      document.addEventListener('keydown', this.boundReceiptActionsEscape, true);
      window.addEventListener('resize', this.boundReceiptActionsReposition, true);
      window.addEventListener('scroll', this.boundReceiptActionsReposition, true);
    });
  },
  handleReceiptActionsOutsideClick(event) {
    const menu = this.state.openReceiptActionsMenu;
    if (menu && !menu.contains(event.target) && !event.target?.closest?.('[data-receipt-menu-toggle]')) this.closeReceiptActionsMenu();
  },
  handleReceiptActionsEscape(event) { if (event.key === 'Escape') this.closeReceiptActionsMenu(); },
  repositionReceiptActionsMenu() { if (this.state.openReceiptActionsMenu && this.state.openReceiptActionsTrigger) this.positionReceiptActionsMenu(this.state.openReceiptActionsTrigger, this.state.openReceiptActionsMenu); },
  handleReceiptActionMenuClick(event) {
    const trigger = event.target?.closest?.('[data-receipt-edit], [data-receipt-preview], [data-receipt-delete], [data-create-communication]');
    if (!trigger) return;
    this.closeReceiptActionsMenu();
    const editId = trigger.getAttribute('data-receipt-edit'); if (editId) return this.runRowAction(`edit:${editId}`, trigger, () => this.openReceiptById(editId, { readOnly: false, trigger }));
    const previewId = trigger.getAttribute('data-receipt-preview'); if (previewId) return this.runRowAction(`preview:${previewId}`, trigger, () => this.previewReceipt(previewId));
    const deleteId = trigger.getAttribute('data-receipt-delete'); if (deleteId) return this.runRowAction(`delete:${deleteId}`, trigger, () => this.deleteReceipt(deleteId));
    if (trigger.hasAttribute('data-create-communication')) {
      try {
        const raw = trigger.getAttribute('data-communication-context') || '';
        const context = raw ? JSON.parse(raw) : null;
        if (context && window.CommunicationCentre?.openCreateForRecord) window.CommunicationCentre.openCreateForRecord(context);
        else UI.toast('Communication Centre is unavailable.');
      } catch (_error) { UI.toast('Unable to open Communication Centre for this receipt.'); }
    }
  },
  exportCsv() {
    const rows = this.state.filteredRows || [];
    const headers = ['Receipt #','Invoice #','Customer','Receipt Date','Currency','Received','Payment State','Status','Updated At'];
    const esc = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.map(esc).join(','), ...rows.map(row => [row.receipt_number || row.receipt_id, row.invoice_number || row.invoice_id, row.customer_name, U.fmtDisplayDate(row.receipt_date), row.currency, this.formatMoney(row.amount_received ?? row.invoice_total), this.normalizeReceiptPaymentState(row, row), row.status, U.fmtDisplayDate(row.updated_at)].map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `receipts-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
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
    TableUtils?.ensureHeaders?.('receipts', E.receiptsTbody?.closest('table'), this.tableColumns);
    this.renderSummary();
    const rows = TableUtils?.processRows ? TableUtils.processRows('receipts', this.state.filteredRows, this.columnMap) : this.state.filteredRows;
    this.renderPagination();
    E.receiptsState.textContent = `${rows.length} item(s) • Page ${this.state.page}${this.state.total ? ` • ${this.state.total} total` : ''}`;
    if (!rows.length) {
      E.receiptsTbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;">No receipts found.</td></tr>';
      return;
    }
    E.receiptsTbody.innerHTML = rows
      .map(row => {
        const rowUuid = U.escapeAttr(row.id || row.receipt_id || '');
        const paymentState = this.normalizeReceiptPaymentState(row, row);
        const selected = String(this.state.selectedDetailsId || '') === String(row.id || row.receipt_id || row.receipt_number || '');
        const actions = this.buildReceiptRowActionItems(row, row.id || row.receipt_id || '');
        return `<tr class="entity-clickable-row${selected ? ' is-selected' : ''}" tabindex="0" data-receipt-row="${rowUuid}" aria-label="Open receipt ${U.escapeAttr(row.receipt_number || row.receipt_id || row.customer_name || '')} details">
          <td><a class="receipt-number-link" href="javascript:void(0)" data-receipt-view="${rowUuid}">${U.escapeHtml(row.receipt_number || row.receipt_id || '—')}</a></td>
          <td>${U.escapeHtml(row.invoice_number || row.invoice_id || '—')}</td>
          <td>${U.escapeHtml(row.customer_name || '—')}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.receipt_date))}</td>
          <td>${U.escapeHtml(row.currency || '—')}</td>
          <td>${this.formatMoney(row.amount_received ?? row.invoice_total)}</td>
          <td>${this.receiptPill(paymentState || '—', 'payment')}</td>
          <td>${this.receiptPill(row.status || '—', 'status')}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.updated_at))}</td>
          <td class="invoice-actions-cell receipt-actions-cell"><div class="invoice-row-actions receipt-row-actions">
            <button class="btn ghost sm invoice-action-view receipt-action-view" type="button" data-receipt-view="${rowUuid}">View</button>
            <span class="invoice-row-menu receipt-row-menu"><button class="btn ghost sm invoice-action-more receipt-action-more invoice-row-menu-trigger" type="button" title="More actions" aria-label="More receipt actions" aria-expanded="false" data-receipt-menu-toggle="${rowUuid}">⋮</button><div class="invoice-row-menu-panel" role="menu" aria-label="Receipt actions">${actions}</div></span>
          </div></td>
        </tr>`;
      })
      .join('');
  },
  renderPagination() {
    const tableCard = E.receiptsTbody?.closest?.('.receipt-table-card, .module-table-card');
    const tableWrap = E.receiptsTbody?.closest?.('.receipt-table-wrap, .table-wrap, .table-responsive');
    const host = U.ensurePaginationHost({
      hostId: 'receiptsPagination',
      anchor: tableWrap || tableCard || E.receiptsState?.closest?.('.card'),
      className: 'module-table-footer receipt-table-footer'
    });
    if (!host) return;
    host.className = 'module-table-footer receipt-table-footer';

    const currentPage = U.normalizePageNumber(this.state.page, 1);
    const pageSize = U.normalizePageSize(this.state.limit, 50, 200);
    const totalReceipts = Math.max(0, Number(this.state.total) || 0);
    const returned = Math.max(0, Number(this.state.returned || this.state.filteredRows?.length) || 0);
    const totalPages = Math.max(1, totalReceipts ? Math.ceil(totalReceipts / pageSize) : (this.state.hasMore ? currentPage + 1 : currentPage));
    const startItem = totalReceipts || returned ? ((currentPage - 1) * pageSize) + 1 : 0;
    const endItem = totalReceipts ? Math.min(currentPage * pageSize, totalReceipts) : ((currentPage - 1) * pageSize) + returned;

    host.innerHTML = `
      <div class="module-table-count">
        Showing ${U.escapeHtml(String(startItem))} to ${U.escapeHtml(String(endItem))} of ${U.escapeHtml(String(totalReceipts))} receipts
      </div>

      <div class="module-pagination" role="group" aria-label="Receipt pagination">
        <select class="module-page-size" data-action="receipt-page-size" ${this.state.loading ? 'disabled' : ''}>
          ${[10, 25, 50].map(size => `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size} / page</option>`).join('')}
        </select>

        <button type="button" data-action="receipt-prev-page" ${this.state.loading || currentPage <= 1 ? 'disabled' : ''}>
          Previous
        </button>

        <span class="module-page-indicator">
          Page ${U.escapeHtml(String(currentPage))} of ${U.escapeHtml(String(totalPages))}
        </span>

        <button type="button" data-action="receipt-next-page" ${this.state.loading || currentPage >= totalPages ? 'disabled' : ''}>
          Next
        </button>
      </div>
    `;

    host.querySelector('[data-action="receipt-prev-page"]')?.addEventListener('click', event => {
      event.preventDefault();
      if (currentPage <= 1) return;
      this.state.page = currentPage - 1;
      this.refresh(true);
    });
    host.querySelector('[data-action="receipt-next-page"]')?.addEventListener('click', event => {
      event.preventDefault();
      if (currentPage >= totalPages) return;
      this.state.page = currentPage + 1;
      this.refresh(true);
    });
    host.querySelector('[data-action="receipt-page-size"]')?.addEventListener('change', event => {
      this.state.limit = U.normalizePageSize(event.target.value || 10, 10, 200);
      this.state.page = 1;
      this.refresh(true);
    });
  },
  renderItems(items = []) {
    const safeItems = this.filterReceiptCommercialItems(items).map(item => this.normalizeItem(item));
    const locations = safeItems.filter(item => item.section === 'location_details');
    const hardware = safeItems.filter(item => this.isHardwareSection(item.section));
    const oneTime = safeItems.filter(item => this.isOneTimeSection(item.section));
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
    if (E.receiptHardwareItemsTbody) {
      E.receiptHardwareItemsTbody.innerHTML = hardware.length
        ? hardware.map(renderOneTimeRow).join('')
        : '<tr><td colspan="8" class="muted cell-center">No hardware rows.</td></tr>';
    }
    const subtotal = rows => rows.reduce((sum, item) => sum + this.toNumberSafe(item.line_total ?? item.amount ?? 0), 0);
    if (E.receiptLocationSubtotal) E.receiptLocationSubtotal.textContent = `Location Subtotal ${this.formatMoney(subtotal(locations))}`;
    if (E.receiptOneTimeSubtotal) E.receiptOneTimeSubtotal.textContent = `One-time Fees Subtotal ${this.formatMoney(subtotal(oneTime))}`;
    if (E.receiptHardwareSubtotal) E.receiptHardwareSubtotal.textContent = `Hardware Subtotal ${this.formatMoney(subtotal(hardware))}`;
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
    const effectivePaymentState = this.normalizeReceiptPaymentState({ ...receipt, ...paymentSnapshot }, invoiceSource);
    const effectivePaymentConclusion = String(paymentSnapshot.payment_conclusion || receipt.payment_conclusion || '').trim() || 'Pending Settlement';
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
    set('receiptFormSupportEmail', receipt.support_email || receipt.contact_email);
    set('receiptFormContactPhoneDisplay', receipt.contact_phone || receipt.contact_mobile);
    set('receiptFormPaymentMethodDisplay', receipt.payment_method);
    set('receiptFormPaymentReferenceDisplay', receipt.payment_reference);
    set('receiptFormDueDateDisplay', invoiceSource.due_date || invoiceSource.payment_due_date || receipt.due_date);
    if (E.receiptForm) E.receiptForm.dataset.id = receipt.id || '';
    if (E.receiptFormTitle) {
      const label = String(receipt.receipt_number || receipt.receipt_id || receipt.invoice_number || '').trim();
      E.receiptFormTitle.textContent = `${receipt.id ? 'Edit Receipt' : 'Create Receipt'}${label ? ` · ${label}` : ''}`;
    }
    if (E.receiptFormIdBadge) {
      const badgeText = receipt.receipt_number || receipt.receipt_id || '';
      E.receiptFormIdBadge.textContent = badgeText ? `Receipt # ${badgeText}` : '';
      E.receiptFormIdBadge.style.display = badgeText ? '' : 'none';
    }
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
          if (el) el.readOnly = !this.canUseAdminOverride();
        });
      if (E.receiptFormPaidNow) E.receiptFormPaidNow.readOnly = !!readOnly && !this.canUseAdminOverride();
      if (this.canUseAdminOverride() && receipt.id) this.applyAdminOverrideBanner();
    }
    if (E.receiptFormModal) {
      E.receiptFormModal.classList.add('open');
      E.receiptFormModal.setAttribute('aria-hidden', 'false');
      window.setTimeout(() => window.CrmCompanyContactSelectors?.initializeCompanyContactSelectorsForReceipt?.(), 0);
      if (window.setAppHashRoute && window.buildRecordHashRoute) setAppHashRoute(buildRecordHashRoute('receipts', this.state.selectedReceipt || {}));
    }
    this.recalculatePaymentFields();
  },
  closeForm() {
    if (E.receiptFormModal) {
      E.receiptFormModal.classList.remove('open');
      E.receiptFormModal.setAttribute('aria-hidden', 'true');
    if (window.setAppHashRoute) setAppHashRoute('#finance?tab=receipts');
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
  hasValidCurrencyPrecision(value) {
    const raw = String(value ?? '').trim().replace(/,/g, '');
    return /^\d+(?:\.\d{1,2})?$/.test(raw);
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
    const dmyNamedMatch = raw.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3,9})[-\/ ](\d{4})$/);
    if (dmyNamedMatch) {
      const [, dayRaw, monthRaw, yearRaw] = dmyNamedMatch;
      const monthKey = String(monthRaw || '').slice(0, 3).toLowerCase();
      const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      const month = monthMap[monthKey];
      const day = Number(dayRaw);
      const year = Number(yearRaw);
      if (month && Number.isInteger(day) && day >= 1 && day <= 31 && Number.isInteger(year) && year >= 1000) {
        return `${yearRaw.padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  },
  buildReceiptItemSavePayload(items = []) {
    return this.filterReceiptCommercialItems(items).map((item, index) => {
      const normalized = this.normalizeItem(item);
      return {
        section: this.isOneTimeSection(normalized.section) ? 'one_time_fee' : 'location_details',
        line_no: this.toNumberSafe(normalized.line_no) || index + 1,
        location_name: normalized.location_name || null,
        location_address: normalized.location_address || null,
        item_name: normalized.item_name || normalized.modules || normalized.description || null,
        description: normalized.description || normalized.note || normalized.catalog_note || '',
        quantity: this.toNumberSafe(normalized.quantity),
        unit_price: this.toNumberSafe(normalized.unit_price),
        discount_percent: this.toNumberSafe(normalized.discount_percent),
        discounted_unit_price: this.toNumberSafe(normalized.discounted_unit_price),
        line_total: this.toNumberSafe(normalized.line_total || normalized.amount),
        amount: this.toNumberSafe(normalized.amount || normalized.line_total),
        notes: normalized.notes || null,
        service_start_date: this.normalizeDateValue(normalized.service_start_date) || null,
        service_end_date: this.normalizeDateValue(normalized.service_end_date) || null,
        currency: normalized.currency || null
      };
    });
  },
  deriveReceiptPaymentState({ pending_amount = 0, received_amount = 0, invoice_total = 0 } = {}) {
    return this.normalizeReceiptPaymentState({
      invoice_total,
      pending_amount,
      balance_due: pending_amount,
      received_amount
    }, { pending_amount });
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
  receiptMatchesInvoice(receipt = {}, invoiceId = '', invoiceNumber = '') {
    const receiptInvoiceId = String(receipt?.invoice_id || '').trim();
    const receiptInvoiceNumber = String(receipt?.invoice_number || '').trim();
    if (invoiceId && receiptInvoiceId && receiptInvoiceId === invoiceId) return true;
    if (invoiceNumber && receiptInvoiceNumber && receiptInvoiceNumber === invoiceNumber) return true;
    if (invoiceId && receiptInvoiceNumber && receiptInvoiceNumber === invoiceId) return true;
    if (invoiceNumber && receiptInvoiceId && receiptInvoiceId === invoiceNumber) return true;
    if (!invoiceId && !invoiceNumber) return !!(receiptInvoiceId || receiptInvoiceNumber);
    return false;
  },
  getReceiptUniqueKey(receipt = {}) {
    return String(receipt?.id || '').trim() || String(receipt?.receipt_id || '').trim();
  },
  getReceiptPaymentAmount(receipt = {}, { includeInvoiceFallback = false } = {}) {
    const candidates = [
      receipt.paid_now,
      receipt.payment_amount,
      receipt.amount_paid,
      receipt.amount_received,
      receipt.receipt_amount,
      receipt.received_amount
    ];
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null || (typeof candidate === 'string' && candidate.trim() === '')) continue;
      const amount = this.normalizeMoney(candidate);
      if (Number.isFinite(amount) && amount >= 0) return amount;
    }
    if (includeInvoiceFallback) {
      const invoiceAmount = this.normalizeMoney(receipt.invoice_total ?? receipt.invoice_grand_total ?? receipt.grand_total ?? 0);
      if (Number.isFinite(invoiceAmount) && invoiceAmount >= 0) return invoiceAmount;
    }
    return 0;
  },
  getReceiptAmountValue(receipt = {}, options = {}) {
    return this.getReceiptPaymentAmount(receipt, options);
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
    const raw = String(value ?? '').trim();
    if (!raw) return Number.NaN;
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
    const normalizedDate = this.normalizeDateValue(raw);
    const fallback = normalizedDate ? Date.parse(normalizedDate) : Number.NaN;
    return Number.isNaN(fallback) ? Number.NaN : fallback;
  },
  getReceiptOrderMeta(receipt = {}) {
    const receiptDateTs = this.parseOrderTimestamp(receipt?.receipt_date);
    const createdAtTs = this.parseOrderTimestamp(receipt?.created_at);
    const idRaw = String(receipt?.id || receipt?.receipt_id || receipt?.receipt_number || '').trim();
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
    const invoiceAmountPaid = this.normalizeAmountInput(
      pickDefined(invoice.received_amount, invoice.amount_paid, invoice.amount_received)
    );
    const invoicePendingAmount = this.normalizeAmountInput(invoice.pending_amount ?? invoice.balance_due);
    const invoiceCreditNoteAmount = this.toNumberSafe(invoice.credit_note_amount ?? invoice.credit_amount ?? invoice.credited_amount);
    const currentInvoiceId = String(receipt?.invoice_id || invoice?.id || invoice?.invoice_id || '').trim();
    const currentInvoiceNumber = String(receipt?.invoice_number || invoice?.invoice_number || '').trim();
    const currentUniqueKey = this.getReceiptUniqueKey(receipt);
    let oldPaidBeforeReceipt = null;
    let cumulativePaidTotal = null;
    let currentReceiptInLedger = false;
    if (Array.isArray(allReceiptsForInvoice)) {
      const normalizedRows = allReceiptsForInvoice
        .map(row => this.normalizeReceipt(row))
        .filter(row => this.receiptMatchesInvoice(row, currentInvoiceId, currentInvoiceNumber))
        .filter(row => !this.isReceiptVoided(row));
      if (normalizedRows.length) {
        const sorted = [...normalizedRows].sort((a, b) => this.compareReceiptOrder(a, b));
        const currentIndex = currentUniqueKey
          ? sorted.findIndex(row => this.getReceiptUniqueKey(row) === currentUniqueKey)
          : -1;
        currentReceiptInLedger = currentIndex >= 0;
        if (!currentReceiptInLedger) {
          oldPaidBeforeReceipt = sorted.reduce((sum, row) => sum + this.getReceiptAmountValue(row), 0);
          cumulativePaidTotal = oldPaidBeforeReceipt + paidNow;
        }
      } else {
        oldPaidBeforeReceipt = 0;
      }
    }

    const hasPersistedReceipt = currentReceiptInLedger || !!String(receipt?.id || '').trim();
    const invoiceAlreadyIncludesReceipt = invoiceAmountPaid !== null && hasPersistedReceipt;
    if (invoiceAlreadyIncludesReceipt) {
      cumulativePaidTotal = this.toNumberSafe(invoiceAmountPaid);
      oldPaidBeforeReceipt = cumulativePaidTotal - paidNow;
    } else if (oldPaidBeforeReceipt === null) {
      const explicitOldPaidTotal = this.normalizeAmountInput(receipt.old_paid_total);
      const explicitNewPaidTotal = this.normalizeAmountInput(receipt.new_paid_total);
      if (explicitOldPaidTotal !== null) oldPaidBeforeReceipt = explicitOldPaidTotal;
      else if (explicitNewPaidTotal !== null) oldPaidBeforeReceipt = explicitNewPaidTotal - paidNow;
      else if (invoiceAmountPaid !== null) oldPaidBeforeReceipt = invoiceAmountPaid;
      else oldPaidBeforeReceipt = 0;
    }
    oldPaidBeforeReceipt = Math.max(0, this.toNumberSafe(oldPaidBeforeReceipt));
    const newPaidTotal = this.toNumberSafe(cumulativePaidTotal ?? oldPaidBeforeReceipt + paidNow);
    const pendingAmount = this.toNumberSafe(
      invoiceAlreadyIncludesReceipt && invoicePendingAmount !== null
        ? invoicePendingAmount
        : Math.max(invoiceTotal - newPaidTotal - invoiceCreditNoteAmount, 0)
    );
    let paymentState = 'Received';
    if (paidNow > 0 && pendingAmount > 0) paymentState = 'Partial Payment';
    if (paidNow > 0 && pendingAmount <= 0) paymentState = 'Settlement';
    return {
      invoice_total: invoiceTotal,
      old_paid_total: oldPaidBeforeReceipt,
      paid_now: paidNow,
      received_amount: paidNow,
      amount_received: paidNow,
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
    if (E.receiptFormPaymentState) E.receiptFormPaymentState.value = this.receiptPaymentStateFromSnapshot(snapshot);
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
        .select('id,invoice_id,invoice_number,subtotal_locations,subtotal_one_time,invoice_total,amount_paid,received_amount,paid_now,credit_note_amount,pending_amount,balance_due,payment_state,payment_status,status')
        .eq('id', invoiceId)
        .maybeSingle()
    ]);
    if (invoiceError) throw new Error(invoiceError.message || 'Unable to load invoice before creating receipt.');
    if (!invoiceRow) throw new Error('Linked invoice was not found before creating receipt.');
    const [receiptRows, scheduleRows] = await Promise.all([
      this.fetchInvoiceReceiptsLedger({
        invoiceId,
        invoiceNumber: invoiceRow?.invoice_number
      }),
      this.fetchInvoicePaymentScheduleRows(invoiceId)
    ]);
    const scheduleSummary = this.summarizeInvoicePaymentScheduleRows(scheduleRows);
    const normalizedInvoice = this.normalizeInvoiceFinancials(scheduleRows.length
      ? {
        ...invoiceRow,
        amount_paid: scheduleSummary.paid_amount,
        received_amount: scheduleSummary.paid_amount,
        pending_amount: scheduleSummary.balance_due,
        balance_due: scheduleSummary.balance_due
      }
      : invoiceRow);
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
  async syncInvoicePaymentSummaryFromReceipts(invoiceId, invoice = null) {
    const id = String(invoiceId || '').trim();
    if (!id) return null;
    const linkedInvoice = invoice || await this.hydrateInvoiceReceiptDraft({ id }).then(result => result?.invoice || null).catch(() => null);
    const invoiceTotal = this.toNumberSafe(linkedInvoice?.invoice_total ?? linkedInvoice?.grand_total ?? linkedInvoice?.total_amount);
    const receipts = await this.fetchReceiptsForInvoice({
      id,
      invoice_number: linkedInvoice?.invoice_number
    }).catch(() => []);
    const totalPaid = (Array.isArray(receipts) ? receipts : [])
      .filter(row => !this.isReceiptVoided(row))
      .reduce((sum, row) => sum + this.getReceiptAmountValue(row), 0);
    const pendingAmount = Math.max(invoiceTotal - totalPaid, 0);
    const paymentStatus = totalPaid <= 0 ? 'Unpaid' : pendingAmount > 0 ? 'Partially Paid' : 'Paid';
    const payload = {
      amount_paid: totalPaid,
      received_amount: totalPaid,
      pending_amount: pendingAmount,
      balance_due: pendingAmount,
      payment_status: paymentStatus,
      payment_state: paymentStatus,
      payment_conclusion: pendingAmount <= 0 ? 'Settled' : 'Pending Settlement'
    };
    if (typeof Api?.updateInvoice === 'function') await Api.updateInvoice(id, payload);
    return payload;
  },
  normalizeInvoiceScheduleRow(row = {}) {
    const scheduled = this.toNumberSafe(row.scheduled_amount);
    const paid = this.toNumberSafe(row.paid_amount ?? row.amount_paid);
    const scheduleNo = Number(row.schedule_no || row.no || 0) || 0;
    return {
      id: String(row.id || '').trim(),
      invoice_id: String(row.invoice_id || '').trim(),
      schedule_no: scheduleNo,
      label: String(row.schedule_label || row.label || `Payment ${scheduleNo || ''}`.trim()).trim(),
      due_date: this.normalizeDateValue(row.due_date || row.dueDate),
      scheduled_amount: scheduled,
      paid_amount: paid,
      balance_due: this.toNumberSafe(row.balance_due ?? Math.max(0, scheduled - paid)),
      status: String(row.status || '').trim() || 'unpaid'
    };
  },
  async fetchInvoicePaymentScheduleRows(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return [];
    try {
      const response = await Api.getInvoicePaymentSchedule(id);
      return (Array.isArray(response) ? response : [])
        .map(row => this.normalizeInvoiceScheduleRow(row))
        .filter(row => row.scheduled_amount || row.balance_due || row.schedule_no || row.due_date);
    } catch (error) {
      console.warn('[receipts] unable to load invoice payment schedule', error);
      return [];
    }
  },
  summarizeInvoicePaymentScheduleRows(rows = []) {
    const normalizedRows = (Array.isArray(rows) ? rows : []).map(row => this.normalizeInvoiceScheduleRow(row));
    const balanceDue = normalizedRows.reduce((sum, row) => sum + this.toNumberSafe(row.balance_due), 0);
    const scheduledAmount = normalizedRows.reduce((sum, row) => sum + this.toNumberSafe(row.scheduled_amount), 0);
    const paidAmount = normalizedRows.reduce((sum, row) => sum + this.toNumberSafe(row.paid_amount), 0);
    const nextDue = normalizedRows.find(row => this.toNumberSafe(row.balance_due) > 0) || normalizedRows[0] || null;
    return {
      rows: normalizedRows,
      scheduled_amount: scheduledAmount,
      paid_amount: paidAmount,
      balance_due: balanceDue,
      next_due_amount: nextDue ? this.toNumberSafe(nextDue.balance_due || nextDue.scheduled_amount) : 0,
      next_due_date: nextDue?.due_date || ''
    };
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
      payment_state: this.receiptPaymentStateFromSnapshot(snapshot, invoice),
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
    if (this.isCapabilityItem(item)) return null;
    const rawSection = item.section || item.item_section || item.itemSection;
    const section = this.isHardwareSection(rawSection) ? 'hardware' : this.isOneTimeSection(rawSection) ? 'one_time_fee' : 'location_details';
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
      description: this.getItemDescription(item),
      quantity: this.toNumberSafe(item.quantity ?? item.qty),
      unit_price: this.toNumberSafe(item.unit_price ?? item.unitPrice),
      discount_percent: this.toNumberSafe(item.discount_percent ?? item.discountPercent),
      discounted_unit_price: this.toNumberSafe(item.discounted_unit_price ?? item.discountedUnitPrice),
      line_total: amount,
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
    const [invoiceReceipts, scheduleRows] = await Promise.all([
      this.fetchReceiptsForInvoice({ id: invoiceUuid }).catch(() => []),
      this.fetchInvoicePaymentScheduleRows(invoiceUuid)
    ]);
    const scheduleSummary = this.summarizeInvoicePaymentScheduleRows(scheduleRows);
    const financials = this.normalizeInvoiceFinancials(scheduleRows.length
      ? {
        ...sourceInvoice,
        amount_paid: scheduleSummary.paid_amount,
        received_amount: scheduleSummary.paid_amount,
        pending_amount: scheduleSummary.balance_due,
        balance_due: scheduleSummary.balance_due
      }
      : sourceInvoice);
    const invoiceTotal = this.toNumberSafe(financials.invoice_total);
    const pendingAmount = this.toNumberSafe(financials.pending_amount);
    const suggestedPaidNow = this.toNumberSafe(sourceInvoice?.paid_now);
    const scheduledPaidNow = scheduleRows.length ? scheduleSummary.next_due_amount : 0;
    const paidNow = suggestedPaidNow > 0
      ? Math.min(suggestedPaidNow, pendingAmount || suggestedPaidNow)
      : (scheduledPaidNow > 0 ? Math.min(scheduledPaidNow, pendingAmount || scheduledPaidNow) : (pendingAmount > 0 ? pendingAmount : 0));
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
      invoice_uuid: String(sourceInvoice?.id || sourceInvoice?.invoice_uuid || sourceInvoice?.invoiceUuid || invoiceUuid || '').trim(),
      invoice_id: String(sourceInvoice?.invoice_id || sourceInvoice?.invoiceId || '').trim(),
      invoice_number: String(sourceInvoice?.invoice_number || sourceInvoice?.invoiceNumber || '').trim(),
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
      receipt_status: 'Issued',
      agreement_id: String(sourceInvoice?.agreement_id || '').trim(),
      agreement_number: String(sourceInvoice?.agreement_number || '').trim(),
      company_id: String(sourceInvoice?.company_id || '').trim(),
      company_name: String(sourceInvoice?.company_name || '').trim(),
      contact_id: String(sourceInvoice?.contact_id || '').trim(),
      contact_name: String(sourceInvoice?.contact_name || '').trim(),
      contact_email: String(sourceInvoice?.contact_email || '').trim(),
      contact_phone: String(sourceInvoice?.contact_phone || '').trim(),
      contact_mobile: String(sourceInvoice?.contact_mobile || '').trim(),
      payment_date: this.todayInputValue(),
      old_paid_total: snapshot.old_paid_total,
      paid_now: snapshot.paid_now,
      new_paid_total: snapshot.new_paid_total,
      pending_amount: snapshot.pending_amount,
      payment_state: this.receiptPaymentStateFromSnapshot(snapshot, sourceInvoice),
      payment_conclusion: snapshot.payment_conclusion,
      payment_notes: String(sourceInvoice?.notes || (scheduleRows.length ? `Next scheduled payment due${scheduleSummary.next_due_date ? ` on ${scheduleSummary.next_due_date}` : ''}.` : '') || '').trim(),
      amount_received: snapshot.received_amount,
      invoice_total: snapshot.invoice_total
    };
    const mappedItems = this.filterReceiptCommercialItems(hydrated.items).map(item => this.mapInvoiceItemToReceiptItem(item)).filter(Boolean);
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
    ['receiptFormInvoiceId','receiptFormInvoiceNumber','receiptFormCustomerName','receiptFormCustomerLegalName','receiptFormCustomerAddress']
      .forEach(fieldId => {
        const field = E[fieldId];
        if (field) field.readOnly = true;
      });
    if (E.receiptFormTitle) {
      const label = String(draft.invoice_number || invoiceUuid).trim();
      E.receiptFormTitle.textContent = `Create Receipt · ${label}`;
    }
    if (E.receiptFormDeleteBtn) E.receiptFormDeleteBtn.style.display = 'none';
    if (E.receiptFormPreviewBtn) E.receiptFormPreviewBtn.style.display = '';
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
      items: this.filterReceiptCommercialItems(itemRows).map(item => this.normalizeItem(item)),
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
      const items = this.filterReceiptCommercialItems(detail?.items).map(item => this.normalizeItem(item));
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
    const get = id => String(E[id]?.value || document.getElementById(id)?.value || '').trim();
    const form = E.receiptForm || document.getElementById('receiptForm');
    return {
      receipt_id: get('receiptFormReceiptId'),
      receipt_number: get('receiptFormReceiptNumber'),
      invoice_id: get('receiptFormInvoiceId'),
      invoice_number: get('receiptFormInvoiceNumber'),
      agreement_uuid: get('receiptFormAgreementUuid'),
      agreement_id: get('receiptFormAgreementId'),
      agreement_number: get('receiptFormAgreementNumber'),
      company_id: get('receiptFormCompanyId') || String(form?.dataset.companyId || '').trim(),
      company_name: get('receiptFormCompanyName') || String(form?.dataset.companyName || '').trim(),
      contact_id: get('receiptFormContactId') || String(form?.dataset.contactId || '').trim(),
      contact_name: get('receiptFormContactName') || String(form?.dataset.contactName || '').trim(),
      contact_email: get('receiptFormContactEmail') || String(form?.dataset.contactEmail || '').trim(),
      contact_phone: get('receiptFormContactPhone') || String(form?.dataset.contactPhone || '').trim(),
      contact_mobile: get('receiptFormContactMobile') || String(form?.dataset.contactMobile || '').trim(),
      receipt_date: this.normalizeDateValue(get('receiptFormReceiptDate')),
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
    const invoiceUuidValue = String(formValues.invoice_uuid || existing.invoice_uuid || invoiceUuid || '').trim();
    const invoiceId = String(formValues.invoice_id || existing.invoice_id || '').trim();
    const clientId = String(
      E.receiptForm?.dataset.clientId ||
      existing.client_id ||
      formValues.client_id ||
      ''
    ).trim();
    const customerLegalName = U.getCustomerLegalName(
      { legal_name: linkedInvoice?.customer_legal_name, company_name: linkedInvoice?.company_name },
      { ...linkedInvoice, ...existing, ...formValues }
    );
    const normalizedPaidNow = this.getReceiptAmountValue({
      paid_now: formValues.paid_now,
      amount_received: formValues.amount_received,
      received_amount: formValues.received_amount,
      receipt_amount: formValues.receipt_amount,
      payment_amount: formValues.payment_amount,
      amount_paid: formValues.amount_paid,
      amount: formValues.amount
    });
    const mergedReceipt = {
      ...existing,
      ...formValues,
      id: String(existing.id || formValues.id || '').trim(),
      invoice_uuid: invoiceUuidValue || null,
      invoice_id: invoiceId || null,
      paid_now: normalizedPaidNow ?? this.getReceiptAmountValue(existing),
      received_amount: normalizedPaidNow ?? this.getReceiptAmountValue(existing),
      amount_received: normalizedPaidNow ?? this.getReceiptAmountValue(existing)
    };
    const paymentSnapshot = this.resolveReceiptPaymentSnapshot(mergedReceipt, linkedInvoice || {}, invoiceReceipts);
    /*
      Receipt validation must be based on the balance BEFORE the current receipt,
      not on the invoice balance after the receipt has already been created/synced.

      Previously, create-from-invoice could succeed in the backend, then the local
      header sync reloaded the invoice with balance_due = 0 and blocked the receipt
      update with:
      "Receipt amount cannot exceed remaining invoice balance after credit notes (0)".

      The allowed amount is invoice total - old paid before this receipt - credit notes.
      For existing/persisted receipts, calculateReceiptSnapshot already subtracts the
      current receipt from the cumulative paid total to produce old_paid_total.
    */
    const invoiceCreditNoteAmount = this.toNumberSafe(
      (linkedInvoice || {}).credit_note_amount ??
      (linkedInvoice || {}).credit_amount ??
      (linkedInvoice || {}).credited_amount
    );
    const invoiceTotalForValidation = this.toNumberSafe(
      paymentSnapshot.invoice_total ??
      (linkedInvoice || {}).invoice_total ??
      (linkedInvoice || {}).grand_total ??
      (linkedInvoice || {}).total_amount ??
      formValues.invoice_total ??
      formValues.invoice_grand_total
    );
    const oldPaidBeforeThisReceipt = this.toNumberSafe(paymentSnapshot.old_paid_total);
    const balanceBeforeThisReceipt = Math.max(
      invoiceTotalForValidation - oldPaidBeforeThisReceipt - invoiceCreditNoteAmount,
      0
    );
    const linkedInvoiceBalanceDue = this.toNumberSafe(
      (linkedInvoice || {}).balance_due ??
      (linkedInvoice || {}).pending_amount ??
      0
    );
    const maxAllowedPaidNow = Math.max(
      balanceBeforeThisReceipt,
      linkedInvoiceBalanceDue,
      this.toNumberSafe(existing.paid_now ?? existing.received_amount ?? existing.amount_received)
    );
    if (
      !this.canUseAdminOverride() &&
      invoiceTotalForValidation > 0 &&
      normalizedPaidNow > maxAllowedPaidNow + 0.0001
    ) {
      throw new Error(`Receipt amount cannot exceed remaining invoice balance after credit notes (${U.fmtNumber(maxAllowedPaidNow)}).`);
    }
    const normalizedNewPaidTotal = paymentSnapshot.new_paid_total;
    const normalizedPendingAmount = paymentSnapshot.pending_amount;
    const normalizedPaymentState = this.receiptPaymentStateFromSnapshot(paymentSnapshot, linkedInvoice || {});
    const normalizedPaymentConclusion = String(paymentSnapshot.payment_conclusion || '').trim() || 'Pending Settlement';
    return {
      receipt_id: String(formValues.receipt_id || existing.receipt_id || '').trim() || null,
      receipt_number: String(formValues.receipt_number || existing.receipt_number || '').trim() || null,
      invoice_uuid: invoiceUuidValue || null,
      invoice_id: invoiceId || null,
      agreement_uuid: String(formValues.agreement_uuid || existing.agreement_uuid || linkedInvoice?.agreement_uuid || '').trim() || null,
      agreement_id: String(formValues.agreement_id || existing.agreement_id || linkedInvoice?.agreement_id || linkedInvoice?.agreement_number || '').trim() || null,
      agreement_number: String(formValues.agreement_number || existing.agreement_number || linkedInvoice?.agreement_number || linkedInvoice?.agreement_id || '').trim() || null,
      client_id: clientId || null,
      company_id: String(formValues.company_id || existing.company_id || linkedInvoice?.company_id || '').trim() || null,
      company_name: String(formValues.company_name || existing.company_name || linkedInvoice?.company_name || '').trim() || null,
      contact_id: String(formValues.contact_id || existing.contact_id || linkedInvoice?.contact_id || '').trim() || null,
      contact_name: String(formValues.contact_name || existing.contact_name || linkedInvoice?.contact_name || '').trim() || null,
      contact_email: String(formValues.contact_email || existing.contact_email || linkedInvoice?.contact_email || '').trim() || null,
      contact_phone: String(formValues.contact_phone || existing.contact_phone || linkedInvoice?.contact_phone || '').trim() || null,
      contact_mobile: String(formValues.contact_mobile || existing.contact_mobile || linkedInvoice?.contact_mobile || '').trim() || null,
      receipt_date: this.normalizeDateValue(formValues.receipt_date || existing.receipt_date || existing.payment_date) || null,
      payment_date: this.normalizeDateValue(formValues.receipt_date || formValues.payment_date || existing.payment_date || existing.receipt_date) || null,
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
      receipt_status: 'Issued',
      invoice_number: String(formValues.invoice_number || existing.invoice_number || '').trim() || null,
      currency: String(formValues.currency || existing.currency || '').trim() || 'USD',
      support_email: String(formValues.support_email || existing.support_email || '').trim() || null,
      customer_name: customerLegalName || null,
      customer_legal_name: customerLegalName || null,
      customer_address: String(linkedInvoice?.customer_address || formValues.customer_address || existing.customer_address || '').trim() || null,
      amount_in_words: this.receiptAmountInWords('', String(formValues.currency || existing.currency || '').trim() || 'USD', normalizedPaidNow),
      invoice_total: paymentSnapshot.invoice_total,
      old_paid_total: paymentSnapshot.old_paid_total,
      paid_now: paymentSnapshot.paid_now,
      amount_paid: paymentSnapshot.received_amount,
      balance_due: normalizedPendingAmount,
      payment_status: normalizedPaymentState,
      new_paid_total: normalizedNewPaidTotal,
      pending_amount: normalizedPendingAmount,
      payment_state: normalizedPaymentState,
      payment_conclusion: normalizedPaymentConclusion,
      payment_notes: String(formValues.payment_notes || existing.payment_notes || '').trim() || null
    };
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
      const invoiceUuid = String(E.receiptForm?.dataset.sourceInvoiceUuid || updates.invoice_uuid || '').trim();
      const normalizedAmount = this.normalizeAmountInput(updates.paid_now);
      if (!invoiceUuid) {
        UI.toast('Invoice UUID is required to create a receipt.');
        return;
      }
      if (normalizedAmount === null || normalizedAmount <= 0 || !this.hasValidCurrencyPrecision(updates.paid_now)) {
        UI.toast('Paid Now must be greater than 0 and have no more than 2 decimal places before saving the receipt.');
        return;
      }
      this.state.saveInFlight = true;
      this.setFormBusy(true);
      console.time('entity-save');
      try {
        const snapshot = await this.computeReceiptSnapshot(invoiceUuid, normalizedAmount);
        const balanceBeforeReceipt = Math.max(
          this.toNumberSafe(snapshot.invoice_total) - this.toNumberSafe(snapshot.old_paid_total),
          0
        );
        if (!this.canUseAdminOverride() && normalizedAmount > balanceBeforeReceipt + 0.0001) {
          UI.toast(`Receipt amount cannot exceed current invoice pending amount (${U.fmtNumber(balanceBeforeReceipt)}).`);
          return;
        }
        const selectedReceiptDate = this.normalizeDateValue(updates.receipt_date) || this.todayInputValue();
        const response = await Api.createReceiptFromInvoice(invoiceUuid, {
          amount: normalizedAmount,
          receipt_date: selectedReceiptDate,
          payment_date: selectedReceiptDate,
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
            payment_state: this.receiptPaymentStateFromSnapshot(snapshot, linkedInvoice),
            payment_conclusion: snapshot.payment_conclusion,
            amount_in_words: this.receiptAmountInWords(updates.amount_in_words, updates.currency, normalizedAmount)
          }, {
            existing: normalized || receipt || {},
            invoiceUuid,
            linkedInvoice,
            invoiceReceipts
          });
          await Api.updateReceipt(receiptUuid, this.filterReceiptColumns(headerPayload));
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
        const refreshedInvoiceId = String(normalized?.invoice_uuid || normalized?.invoice_id || receipt?.invoice_uuid || receipt?.invoice_id || invoiceUuid).trim();
        if (refreshedInvoiceId) {
          await this.syncInvoicePaymentSummaryFromReceipts(refreshedInvoiceId).catch(error => console.warn('[receipts] invoice payment summary sync failed', error));
          await window.Invoices?.syncAfterReceiptMutation?.({ invoiceId: refreshedInvoiceId, receipt: normalized || receipt });
        }
        if (refreshedInvoiceId) {
          const selectedInvoiceId = String(E.invoiceForm?.dataset.id || '').trim();
          if (selectedInvoiceId === refreshedInvoiceId && window.Invoices?.openInvoiceById) {
            await window.Invoices.openInvoiceById(refreshedInvoiceId, { readOnly: true });
          } else if (window.Invoices?.refreshInvoiceReceipts) {
            await window.Invoices.refreshInvoiceReceipts(refreshedInvoiceId, { force: true });
          }
        }
        await this.refresh(true);
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
    const isDirectCreate = !id;
    if (isDirectCreate && !String(updates.company_id || E.receiptForm?.dataset.companyId || '').trim()) {
      UI.toast('Please select a company.');
      return;
    }
    if (isDirectCreate && !String(updates.contact_id || E.receiptForm?.dataset.contactId || '').trim()) {
      UI.toast('Please select a contact.');
      return;
    }
    if (!id) return;
    const paidNowValue = this.normalizeAmountInput(updates.paid_now);
    if (!String(updates.invoice_id || '').trim()) {
      UI.toast('Linked invoice is required before saving the receipt.');
      return;
    }
    if (paidNowValue === null || paidNowValue <= 0 || !this.hasValidCurrencyPrecision(updates.paid_now)) {
      UI.toast('Paid Now must be greater than 0 and have no more than 2 decimal places.');
      E.receiptFormPaidNow?.focus();
      return;
    }
    const currentRecord = this.state.rows.find(row => this.receiptDbId(row.id) === id) || {};
    const workflowCheck = this.canUseAdminOverride()
      ? { allowed: true, skipped: true, reason: 'Admin override bypassed receipt workflow.' }
      : await this.validateReceiptWorkflowOrFallback(currentRecord, {
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
      const parsed = this.extractReceiptAndItems(response, id);
      const persisted = parsed?.receipt?.id ? parsed.receipt : { ...updates, id, receipt_id: currentRecord?.receipt_id || id };
      const normalized = this.upsertLocalRow(persisted);
      if (id && this.canUseAdminOverride()) this.logAdminOverride('receipt_update_override', currentRecord || null, normalized || persisted);
      this.setCachedDetail(normalized?.id || id, persisted, parsed?.items || this.state.items, linkedInvoice, invoiceReceipts);
      if (normalized?.id && this.state.selectedReceipt?.id === normalized.id) {
        this.state.selectedReceipt = normalized;
        this.state.items = parsed?.items || this.state.items;
      }
      const updatedInvoiceId = normalized?.invoice_id || persisted?.invoice_id;
      if (updatedInvoiceId) await this.syncInvoicePaymentSummaryFromReceipts(updatedInvoiceId, linkedInvoice).catch(error => console.warn('[receipts] invoice payment summary sync failed', error));
      await window.Invoices?.syncAfterReceiptMutation?.({ invoiceId: updatedInvoiceId, receipt: normalized });
      await this.refresh(true);
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
      if (deletedInvoiceId) {
        await this.syncInvoicePaymentSummaryFromReceipts(deletedInvoiceId).catch(error => console.warn('[receipts] invoice payment summary sync failed', error));
        await window.Invoices?.syncAfterReceiptMutation?.({ invoiceId: deletedInvoiceId });
      }
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
    return { receiptUuid, receipt: normalizedReceipt, items: this.filterReceiptCommercialItems(detail.items), invoice, invoiceItems: this.filterReceiptCommercialItems(invoiceItems), invoiceReceipts };
  },
  getItemDescription(item = {}) {
    return String(
      item?.description ||
      item?.item_description ||
      item?.note ||
      item?.notes ||
      item?.catalog_note ||
      item?.catalog_description ||
      ''
    ).trim();
  },
  renderDocumentItemCell(item = {}, fallbackName = '') {
    const itemName = String(item?.item_name || item?.name || item?.product_name || item?.modules || item?.capability_name || fallbackName || '').trim();
    const itemDescription = this.getItemDescription(item);
    const shouldShowDescription = itemDescription && itemDescription !== itemName;
    return `<div class="doc-item-name">${U.escapeHtml(itemName || '—')}</div>${shouldShowDescription ? `<div class="doc-item-description">${U.escapeHtml(itemDescription)}</div>` : ''}`;
  },
  buildReceiptPreviewHtml(receipt = {}, items = [], invoice = null, invoiceItems = [], invoiceReceipts = null) {
    const r = this.normalizeReceipt(receipt || {});
    const normalizedItems = this.filterReceiptCommercialItems(items).map(item => this.normalizeItem(item));
    const fallbackItems = this.filterReceiptCommercialItems(invoiceItems).map(item => this.normalizeItem(item));
    const sourceItems = normalizedItems.length ? normalizedItems : fallbackItems;
    const isOneTime = section => this.isOneTimeSection(section);
    const isHardware = section => this.isHardwareSection(section);
    const isNonRecurring = section => isOneTime(section) || isHardware(section);
    const locationItems = sourceItems.filter(item => !isNonRecurring(item.section));
    const hardwareItems = sourceItems.filter(item => isHardware(item.section));
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
    const quantity = value => {
      const amount = this.toNumberSafe(value);
      return amount ? U.escapeHtml(String(amount)) : '—';
    };
    const discount = value => `${U.escapeHtml(String(this.toNumberSafe(value)))}%`;
    const computeReceiptRow = item => {
      const unit = this.toNumberSafe(item.unit_price);
      const discountPercent = this.toNumberSafe(item.discount_percent);
      const qty = this.toNumberSafe(item.quantity);
      const discountRatio = discountPercent > 1 ? discountPercent / 100 : Math.max(0, discountPercent);
      const baseAmount = isNonRecurring(item.section) ? unit * qty : unit * (qty / 12);
      const fallbackTotal = Math.max(0, baseAmount * (1 - discountRatio));
      return {
        ...item,
        line_total: this.toNumberSafe(item.line_total || item.amount || fallbackTotal)
      };
    };
    const buildDetailRow = item => {
      const computed = computeReceiptRow(item);
      return `<tr>
        <td>${text(item.location_name)}</td>
        <td>${this.renderDocumentItemCell(item)}</td>
        <td class="cell-right">${this.money(currency, item.unit_price ?? 0)}</td>
        <td class="cell-center">${quantity(item.quantity)}</td>
        <td class="cell-center">${date(item.service_start_date)}</td>
        <td class="cell-center">${date(item.service_end_date)}</td>
        <td class="cell-center">${discount(item.discount_percent)}</td>
        <td class="cell-right">${this.money(currency, computed.line_total)}</td>
      </tr>`;
    };
    const buildOneTimeRow = item => {
      const computed = computeReceiptRow(item);
      return `<tr>
        <td>${text(item.location_name)}</td>
        <td>${this.renderDocumentItemCell(item)}</td>
        <td class="cell-right">${this.money(currency, item.unit_price ?? 0)}</td>
        <td class="cell-center">${discount(item.discount_percent)}</td>
        <td class="cell-center">${quantity(item.quantity)}</td>
        <td class="cell-right">${this.money(currency, computed.line_total)}</td>
      </tr>`;
    };
    const oneTimeRows = oneTimeItems.length ? oneTimeItems.map(buildOneTimeRow).join('') : '<tr><td colspan="6" class="muted cell-center">No one-time fee items found.</td></tr>';
    const hardwareRows = hardwareItems.map(buildOneTimeRow).join('');
    const hardwareSubtotal = hardwareItems.reduce((sum, item) => sum + this.toNumberSafe(computeReceiptRow(item).line_total), 0);
    const hardwareSectionHtml = hardwareItems.length ? `
      <section class="section">
        <h2>Hardware Items</h2>
        <div class="subhead">Hardware Rows</div>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Hardware / Product</th>
              <th style="width:16%">Unit Price</th>
              <th style="width:12%">Discount %</th>
              <th style="width:10%">Qty</th>
              <th style="width:16%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${hardwareRows}
            <tr class="total-row">
              <td colspan="5" class="cell-right">Total Hardware</td>
              <td class="cell-right">${this.money(currency, hardwareSubtotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>` : '';
    const locationRows = locationItems.length ? locationItems.map(buildDetailRow).join('') : '<tr><td colspan="8" class="muted cell-center">No annual SaaS items found.</td></tr>';
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    const pickMoneyTotal = (...values) => {
      const positive = values.find(value => this.toNumberSafe(value) > 0);
      return positive !== undefined && positive !== null ? positive : pickDefined(...values);
    };
    const hasLocationRows = locationItems.length > 0;
    const hasOneTimeRows = oneTimeItems.length > 0;
    const calculatedSubtotalLocations = locationItems.reduce((sum, item) => sum + this.toNumberSafe(computeReceiptRow(item).line_total), 0);
    const calculatedSubtotalOneTime = oneTimeItems.reduce((sum, item) => sum + this.toNumberSafe(computeReceiptRow(item).line_total), 0);
    const subtotalLocations = this.toNumberSafe(
      pickDefined(hasLocationRows ? calculatedSubtotalLocations : undefined, r.subtotal_locations, invoice?.subtotal_locations, invoice?.subtotal_subscription, 0)
    );
    const subtotalOneTime = this.toNumberSafe(
      hasOneTimeRows
        ? calculatedSubtotalOneTime
        : hardwareItems.length
          ? 0
          : pickDefined(r.subtotal_one_time, invoice?.subtotal_one_time, 0)
    );
    const calculatedInvoiceTotal = subtotalLocations + subtotalOneTime + hardwareSubtotal;
    const invoiceTotal = this.toNumberSafe(
      pickMoneyTotal(r.invoice_total, invoice?.invoice_total, invoice?.grand_total, calculatedInvoiceTotal)
    );
    const resolvedSnapshot = this.resolveReceiptPaymentSnapshot(r, { ...invoice, invoice_total: invoiceTotal }, invoiceReceipts);
    const oldPaidTotal = resolvedSnapshot.old_paid_total;
    const paidNow = resolvedSnapshot.paid_now;
    const newPaidTotal = resolvedSnapshot.new_paid_total;
    const pendingAmount = resolvedSnapshot.pending_amount;
    const paymentState = this.normalizeReceiptPaymentState({ ...r, ...resolvedSnapshot }, invoice || r);
    const receiptPaymentAmountSource = pickDefined(
      r.paid_now,
      r.amount_received,
      r.received_amount,
      r.receipt_amount,
      r.payment_amount,
      r.amount_paid,
      r.amount,
      resolvedSnapshot.paid_now,
      resolvedSnapshot.received_amount
    );
    const receiptPaymentAmount = this.toNumberSafe(receiptPaymentAmountSource);
    const amountInWords = this.receiptAmountInWords('', currency, receiptPaymentAmount);
    const customerName = r.customer_legal_name || r.customer_name || invoice?.customer_legal_name || invoice?.customer_name;
    const customerAddress = r.customer_address || invoice?.customer_address;
    const invoiceDisplay = r.invoice_number || r.invoice_id || invoice?.invoice_number || invoice?.invoice_id;
    const linkedPaymentTerm = String(invoice?.payment_term || '').trim();
    const linkedCustomPaymentTerms = String(invoice?.payment_term_custom ?? invoice?.payment_terms_custom ?? '').trim();
    const customPaymentTermsHtml = linkedPaymentTerm === 'Custom' && linkedCustomPaymentTerms
      ? `<section class="document-note-box custom-payment-terms-box"><h2>Custom Payment Terms</h2><div>${text(linkedCustomPaymentTerms)}</div></section>`
      : '';
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt Preview</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { font-family: Inter, "Segoe UI", Arial, Helvetica, sans-serif; margin: 0; padding: 12mm 0; color: #111827; background: #eef2f7; overflow-x: hidden; }
      .receipt-preview-page,
      .receipt-document-page {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: #fff;
        box-sizing: border-box;
        padding: 14mm 14mm 12mm;
        position: relative;
        overflow: visible;
        display: flex;
        flex-direction: column;
      }
      .receipt-preview-page,
      .receipt-document-page { border: 1px solid #dbe3ed; box-shadow: 0 14px 34px rgba(15, 23, 42, 0.13); }
      .document-body { flex: 1 0 auto; min-width: 0; }
      .doc-header { border-bottom: 1px solid #d8e1ec; padding-bottom: 7mm; margin-bottom: 8mm; }
      .receipt-document-header { display: grid; grid-template-columns: 44mm minmax(0, 1fr) 62mm; align-items: center; gap: 6mm; width: 100%; max-width: 100%; margin: 0; }
      .receipt-document-logo { display: flex; align-items: center; justify-content: flex-start; height: 28mm; min-width: 0; margin: 0; padding: 0; position: static; }
      .receipt-document-logo .incheck360-doc-logo-wrap { float: none; display: flex; align-items: center; justify-content: flex-start; margin: 0; padding: 0; width: 40mm; max-width: 40mm; height: 24mm; max-height: 24mm; text-align: left; position: static; transform: none; }
      .receipt-document-logo img,
      .receipt-document-logo svg { display: block; max-width: 40mm; max-height: 24mm; width: auto; height: auto; object-fit: contain; object-position: left center; margin: 0; padding: 0; position: static; transform: none; }
      .receipt-document-title-wrap { display: flex; align-items: center; justify-content: center; height: 28mm; min-width: 0; margin: 0; padding: 0; text-align: center; }
      .receipt-document-title { margin: 0; font-size: 22px; line-height: 1; font-weight: 800; text-align: center; letter-spacing: 0.01em; color: #0b214a; }
      .receipt-document-summary { display: flex; align-items: center; justify-content: flex-end; height: 28mm; min-width: 0; margin: 0; padding: 0; position: static; }
      .receipt-document-summary .meta-box { width: 100%; max-width: 62mm; }
      .meta-box { border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; background: #fbfdff; min-width: 0; width: 100%; max-width: 62mm; }
      .meta-row { display: grid; grid-template-columns: 27mm minmax(0, 1fr); border-bottom: 1px solid #e3eaf3; }
      .meta-row:last-child { border-bottom: 0; }
      .meta-row > div { padding: 1.6mm 2mm; font-size: 10.5px; min-width: 0; overflow-wrap: break-word; }
      .meta-row .meta-key { background: #f5f8fc; font-weight: 700; color: #334155; border-right: 1px solid #e3eaf3; }
      .info-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5mm; margin-top: 5mm; width: 100%; }
      .info-box { border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; background: #fff; min-width: 0; page-break-inside: avoid; break-inside: avoid; }
      .info-head { background: #f8fbff; border-bottom: 1px solid #e3eaf3; padding: 9px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #1e3a5f; }
      .info-body { padding: 12px; font-size: 12.5px; line-height: 1.55; }
      .info-body strong { font-weight: 700; color: #0f172a; }
      .muted { color: #6b7280; }
      .section { margin-top: 18px; page-break-inside: avoid; break-inside: avoid; }
      .section h2 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #d8e1ec; padding-bottom: 7px; }
      .section .subhead { font-size: 12px; margin: 6px 0 8px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.04em; }
      table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; overflow-wrap: anywhere; page-break-inside: auto; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      th, td { border: 1px solid #dde5ef; padding: 5px; font-size: 10px; vertical-align: middle; overflow-wrap: anywhere; word-break: break-word; }
      th { text-align: center; background: #f5f8fc; color: #0f172a; font-weight: 700; }
      .cell-center { text-align: center; vertical-align: middle; }
      .cell-right { text-align: right; vertical-align: middle; white-space: nowrap; }
      .doc-item-name { font-weight: 600; }
      .doc-item-description { margin-top: 3px; font-size: 10px; line-height: 1.35; color: #555; font-weight: 400; }
      .total-row td { font-weight: 700; background: #f7faff; }
      .document-note-box { width: 100%; max-width: 100%; margin-top: 12px; padding: 10px 12px; border: 1px solid #d7e1ed; border-radius: 6px; background: #fbfdff; color: #334155; page-break-inside: avoid; break-inside: avoid; }
      .document-note-box h2 { margin: 0 0 6px; padding: 0; border: 0; font-size: 13px; line-height: 1.25; font-weight: 800; color: #0b214a; letter-spacing: 0.02em; }
      .document-note-box div { font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
      .receipt-narrative { margin: 16px 0 0; font-size: 12.5px; line-height: 1.6; border: 1px solid #d7e1ed; border-radius: 6px; padding: 12px; background: #fbfdff; overflow-wrap: anywhere; page-break-inside: avoid; break-inside: avoid; }
      .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; page-break-inside: avoid; break-inside: avoid; }
      .totals-box { width: 96mm; max-width: 100%; border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; }
      .totals-row { display: flex; justify-content: space-between; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #e3eaf3; font-size: 13px; }
      .totals-row:last-child { border-bottom: 0; }
      .totals-row.grand { font-size: 15px; font-weight: 700; background: #edf4ff; color: #0b214a; }
      .totals-row span { min-width: 0; }
      .totals-row strong { flex: 1 1 auto; min-width: 0; text-align: right; overflow-wrap: anywhere; }
      .footer-note { position: static !important; margin-top: auto; padding-top: 10px; font-size: 11px; color: #64748b; border-top: 1px solid #e3eaf3; text-align: center; flex-shrink: 0; page-break-inside: avoid; break-inside: avoid; }
      @page { size: A4; margin: 12mm; }
      @media print {
        body { margin: 0; padding: 0; background: #fff; overflow: visible; }
        .receipt-preview-page,
        .receipt-document-page { width: auto; min-height: 273mm; margin: 0; padding: 0; box-shadow: none; page-break-after: auto; border: 0; overflow: visible; }
      }
    </style>
  </head>
  <body>
    <div class="receipt-preview-page receipt-document-page doc-sheet">
      <main class="document-body">
      <header class="doc-header">
        <section class="receipt-document-header">
          <div class="receipt-document-logo"><div data-incheck360-doc-logo-slot></div></div>
          <div class="receipt-document-title-wrap"><h1 class="receipt-document-title">Receipt</h1></div>
          <div class="receipt-document-summary">
            <div class="meta-box">
              <div class="meta-row"><div class="meta-key">Receipt No.</div><div>${text(r.receipt_number || r.receipt_id)}</div></div>
              <div class="meta-row"><div class="meta-key">Receipt Date</div><div>${date(r.receipt_date)}</div></div>
              <div class="meta-row"><div class="meta-key">Invoice No.</div><div>${text(invoiceDisplay)}</div></div>
              ${linkedPaymentTerm === 'Custom' ? `<div class="meta-row"><div class="meta-key">Payment Terms</div><div>Custom</div></div>` : ''}
            </div>
          </div>
        </section>
      </header>

      <section class="info-grid">
        <div class="info-box">
          <div class="info-head">RECEIVED FROM</div>
          <div class="info-body">
            <div><strong>${text(customerName)}</strong></div>
            <div class="muted">${text(customerAddress)}</div>
          </div>
        </div>
      </section>

      ${customPaymentTermsHtml}

      <section class="section">
        <h2>Annual SaaS</h2>
        <div class="subhead">SaaS / Subscription Rows</div>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>License</th>
              <th style="width:15%">License Price / Year</th>
              <th style="width:12%">License / Month</th>
              <th style="width:13%">Service Start Date</th>
              <th style="width:13%">Service End Date</th>
              <th style="width:10%">Discount %</th>
              <th style="width:12%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${locationRows}
            <tr class="total-row">
              <td colspan="7" class="cell-right">Total SaaS / Subscription</td>
              <td class="cell-right">${this.money(currency, subtotalLocations)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>One Time Fee</h2>
        <div class="subhead">One Time Fee Rows</div>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Item / Service</th>
              <th style="width:16%">Unit Price</th>
              <th style="width:12%">Discount %</th>
              <th style="width:10%">Qty</th>
              <th style="width:16%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${oneTimeRows}
            <tr class="total-row">
              <td colspan="5" class="cell-right">Total One Time Fees</td>
              <td class="cell-right">${this.money(currency, subtotalOneTime)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      ${hardwareSectionHtml}

      <p class="receipt-narrative">We have received from ${text(customerName)} the sum of ${text(amountInWords)} being partial payment on account of ${text(invoiceDisplay)}. Pending amount: ${this.money(currency, pendingAmount)}.</p>

      <section class="totals-wrap">
        <div class="totals-box">
          <div class="totals-row grand"><span>Grand Total</span><strong>${this.money(currency, invoiceTotal)}</strong></div>
          ${hardwareItems.length ? `<div class="totals-row"><span>Hardware</span><strong>${this.money(currency, hardwareSubtotal)}</strong></div>` : ``}
          <div class="totals-row"><span>Old Paid Total</span><strong>${this.money(currency, oldPaidTotal)}</strong></div>
          <div class="totals-row"><span>Paid Now</span><strong>${this.money(currency, paidNow)}</strong></div>
          <div class="totals-row amount-in-words"><span>Grand Amount in Words:</span><strong>${text(amountInWords)}</strong></div>
          <div class="totals-row"><span>Amount Paid (Cumulative)</span><strong>${this.money(currency, newPaidTotal)}</strong></div>
          <div class="totals-row"><span>Pending Amount</span><strong>${this.money(currency, pendingAmount)}</strong></div>
          <div class="totals-row"><span>Payment State</span><strong>${text(paymentState || r.status)}</strong></div>
        </div>
      </section>

      </main>
      <footer class="footer-note document-footer">This document is computer generated and does not require a signature.</footer>
    </div>
  </body>
</html>`;
    return U.stripInternalDocumentLinks(html);
  },
  previewReceiptFromDraft(receiptDraft = null) {
    const draft = receiptDraft || this.collectUpdates();
    const items = Array.isArray(this.state.items) ? this.state.items : [];
    const html = this.buildReceiptPreviewHtml(draft, items, null, [], []);
    const brandedHtml = U.addIncheckDocumentLogo(U.formatPreviewHtmlDates(html));
    const label = this.receiptDisplayId(draft) || draft.invoice_number || 'Draft';
    if (E.receiptPreviewTitle) E.receiptPreviewTitle.textContent = `RECEIPT VOUCHER · ${label}`;
    if (E.receiptPreviewFrame) E.receiptPreviewFrame.srcdoc = brandedHtml;
    if (E.receiptPreviewModal) {
      E.receiptPreviewModal.classList.add('open');
      E.receiptPreviewModal.setAttribute('aria-hidden', 'false');
    }
  },
  async previewReceipt(receiptId) {
    const id = this.resolveReceiptUuid(receiptId);
    if (!id) {
      this.previewReceiptFromDraft(this.collectUpdates());
      return;
    }
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
      const filters = { ...(TableUtils?.getServerColumnFilters?.('receipts', this.columnMap) || {}) };
      if (this.state.search) filters.search = this.state.search;
      if (this.state.invoiceNumber) filters.invoice_number = this.state.invoiceNumber;
      if (this.state.customerName) filters.customer_name = this.state.customerName;
      if (this.state.status && this.state.status !== 'All') filters.status = this.state.status;
      const response = await Api.listReceipts(filters, {
        limit: this.state.limit,
        page: this.state.page,
        summary_only: true,
        forceRefresh: force,
        ...(TableUtils?.getServerSort?.('receipts', this.columnMap) || {})
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

    this.boundReceiptActionsOutsideClick = event => this.handleReceiptActionsOutsideClick(event);
    this.boundReceiptActionsEscape = event => this.handleReceiptActionsEscape(event);
    this.boundReceiptActionsReposition = () => this.repositionReceiptActionsMenu();
    if (E.receiptsRefreshBtn) E.receiptsRefreshBtn.addEventListener('click', () => this.refresh(true));
    if (E.receiptsExportCsvBtn) E.receiptsExportCsvBtn.addEventListener('click', () => this.exportCsv());
    if (E.receiptsClearFiltersBtn) E.receiptsClearFiltersBtn.addEventListener('click', () => {
      this.state.search = ''; this.state.invoiceNumber = ''; this.state.customerName = ''; this.state.status = 'All'; this.state.kpiFilter = 'total'; this.state.page = 1;
      if (E.receiptsSearchInput) E.receiptsSearchInput.value = '';
      if (E.receiptsInvoiceFilter) E.receiptsInvoiceFilter.value = '';
      if (E.receiptsCustomerFilter) E.receiptsCustomerFilter.value = '';
      if (E.receiptsStatusFilter) E.receiptsStatusFilter.value = 'All';
      this.refresh(true);
    });
    if (E.receiptsCreateBtn) E.receiptsCreateBtn.addEventListener('click', () => UI.toast('Create receipts from an invoice to keep backend receipt calculations intact.'));
    if (E.receiptsTbody) {
      E.receiptsTbody.addEventListener('click', event => {
        const menuToggle = event.target?.closest?.('[data-receipt-menu-toggle]');
        if (menuToggle) { event.preventDefault(); event.stopPropagation(); if (this.state.openReceiptActionsTrigger === menuToggle && this.state.openReceiptActionsMenu) this.closeReceiptActionsMenu(); else this.openReceiptActionsMenu(menuToggle); return; }
        const trigger = event.target?.closest?.('[data-receipt-view],button[data-receipt-edit],button[data-receipt-preview],button[data-receipt-delete]');
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
      E.receiptsTbody.addEventListener('click', event => {
        if (event.target?.closest?.('button, a, .invoice-row-menu')) return;
        const detailsRow = event.target?.closest?.('tr[data-receipt-row]');
        const detailsId = detailsRow?.getAttribute('data-receipt-row');
        if (detailsId) this.openDetailsDrawer(detailsId);
      });
      E.receiptsTbody.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        const row = event.target?.closest?.('tr[data-receipt-row]');
        const id = row?.getAttribute('data-receipt-row');
        if (!id) return;
        event.preventDefault();
        this.openDetailsDrawer(id);
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
    if (E.receiptFormPreviewBtn) E.receiptFormPreviewBtn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const receiptDraft = this.collectUpdates();
      this.previewReceiptFromDraft(receiptDraft);
    });
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
