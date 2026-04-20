const Receipts = {
  receiptFields: [
    'receipt_id',
    'receipt_number',
    'invoice_id',
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
    'grand_total',
    'invoice_grand_total',
    'received_amount',
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
    const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  formatMoney(value) {
    return this.toNumberSafe(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  },
  normalizeReceipt(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const normalized = {};
    this.receiptFields.forEach(field => {
      const camel = field.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
      const value = source[field] ?? source[camel] ?? '';
      normalized[field] = typeof value === 'string' ? value.trim() : value;
    });
    normalized.receipt_id = String(normalized.receipt_id || source.id || '').trim();
    normalized.receipt_number = String(normalized.receipt_number || '').trim();
    normalized.currency = String(normalized.currency || '').trim() || 'USD';
    normalized.status = String(normalized.status || '').trim() || 'Issued';
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
  normalizeItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
    const rawSection = String(pick(source.section, source.item_section, source.itemSection)).trim().toLowerCase();
    const section = rawSection === 'one_time_fee' ? 'one_time_fee' : 'location_details';
    return {
      receipt_item_id: String(pick(source.receipt_item_id, source.receiptItemId)).trim(),
      receipt_id: String(pick(source.receipt_id, source.receiptId)).trim(),
      section,
      line_no: this.toNumberSafe(pick(source.line_no, source.lineNo, source.line)),
      location_name: String(pick(source.location_name, source.locationName)).trim(),
      location_address: String(pick(source.location_address, source.locationAddress)).trim(),
      service_start_date: String(pick(source.service_start_date, source.serviceStartDate)).trim(),
      service_end_date: String(pick(source.service_end_date, source.serviceEndDate)).trim(),
      modules: String(pick(source.modules, source.item_name, source.itemName)).trim(),
      item_name: String(pick(source.item_name, source.itemName)).trim(),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.toNumberSafe(pick(source.discount_percent, source.discountPercent)),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty)),
      line_total: this.toNumberSafe(pick(source.line_total, source.lineTotal)),
      notes: String(pick(source.notes)).trim()
    };
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
  setCachedDetail(id, receipt, items) {
    const key = String(id || '').trim();
    if (!key) return;
    this.state.detailCacheById[key] = {
      receipt: this.normalizeReceipt(receipt || { receipt_id: key }),
      items: Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [],
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
    const q = this.normalizeText(this.state.search);
    const invoiceQ = this.normalizeText(this.state.invoiceNumber);
    const customerQ = this.normalizeText(this.state.customerName);
    this.state.filteredRows = this.state.rows.filter(row => {
      if (this.state.status !== 'All' && String(row.status || '').trim() !== this.state.status) return false;
      if (!this.matchesKpiFilter(row)) return false;
      if (q && !this.normalizeText(row.receipt_number).includes(q)) return false;
      if (invoiceQ && !this.normalizeText(row.invoice_number).includes(invoiceQ)) return false;
      if (customerQ && !this.normalizeText(row.customer_name).includes(customerQ)) return false;
      return true;
    });
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeReceipt(row);
    const idx = this.state.rows.findIndex(item => String(item.receipt_id || '') === String(normalized.receipt_id || ''));
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.rerenderVisibleTable();
    return normalized;
  },
  removeLocalRow(id) {
    const before = this.state.rows.length;
    this.state.rows = this.state.rows.filter(item => String(item.receipt_id || '') !== String(id || ''));
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
    if (filter === 'grand-total') return this.toNumberSafe(row?.grand_total) > 0;
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
    const totalAmount = this.state.rows.reduce((sum, row) => sum + this.toNumberSafe(row.grand_total), 0);
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
      E.receiptsState.textContent = 'Loading receipts…';
      E.receiptsTbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;">Loading receipts…</td></tr>';
      return;
    }
    if (this.state.loadError) {
      E.receiptsState.textContent = this.state.loadError;
      E.receiptsTbody.innerHTML = `<tr><td colspan="10" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    this.renderSummary();
    const rows = this.state.filteredRows;
    E.receiptsState.textContent = `${rows.length} of ${this.state.rows.length} receipts`;
    if (!rows.length) {
      E.receiptsTbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;">No receipts found.</td></tr>';
      return;
    }
    E.receiptsTbody.innerHTML = rows
      .map(row => {
        const id = U.escapeAttr(row.receipt_id || '');
        const typeLabel = this.receiptTypeLabel(row);
        const settlementBadge = this.isSettlementReceipt(row) ? ' <span class="pill">Settlement</span>' : '';
        return `<tr>
          <td><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><span>${U.escapeHtml(row.receipt_number || row.receipt_id || '—')}</span><span class="pill">${U.escapeHtml(typeLabel)}</span>${settlementBadge}</div></td>
          <td>${U.escapeHtml(row.invoice_number || '—')}</td>
          <td>${U.escapeHtml(row.customer_name || '—')}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.receipt_date))}</td>
          <td>${U.escapeHtml(row.currency || '—')}</td>
          <td>${this.formatMoney(row.received_amount || row.grand_total)}</td>
          <td>${U.escapeHtml(row.payment_state || '—')}</td>
          <td>${U.escapeHtml(row.status || '—')}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.updated_at))}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn ghost sm" type="button" data-receipt-view="${id}">View</button>
            ${Permissions.canUpdateReceipt() ? `<button class="btn ghost sm" type="button" data-receipt-edit="${id}">Edit</button>` : ''}
            ${Permissions.canPreviewReceipt() ? `<button class="btn ghost sm" type="button" data-receipt-preview="${id}">Preview</button>` : ''}
            ${Permissions.canDeleteReceipt() ? `<button class="btn ghost sm" type="button" data-receipt-delete="${id}">Delete</button>` : ''}
          </div></td>
        </tr>`;
      })
      .join('');
  },
  renderItems(items = []) {
    const locations = items.filter(item => item.section === 'location_details');
    const oneTime = items.filter(item => item.section === 'one_time_fee');
    if (E.receiptLocationItemsTbody) {
      E.receiptLocationItemsTbody.innerHTML = locations.length
        ? locations
            .map(item => `<tr><td>${U.escapeHtml(item.location_name || '—')}</td><td>${U.escapeHtml(item.location_address || '—')}</td><td>${U.escapeHtml(U.fmtDisplayDate(item.service_start_date))}</td><td>${U.escapeHtml(U.fmtDisplayDate(item.service_end_date))}</td><td>${U.escapeHtml(item.modules || item.item_name || '—')}</td><td>${this.formatMoney(item.line_total)}</td><td>${U.escapeHtml(item.notes || '—')}</td></tr>`)
            .join('')
        : '<tr><td colspan="7" class="muted" style="text-align:center;">No location detail rows.</td></tr>';
    }
    if (E.receiptOneTimeItemsTbody) {
      E.receiptOneTimeItemsTbody.innerHTML = oneTime.length
        ? oneTime
            .map(item => `<tr><td>${U.escapeHtml(item.item_name || item.modules || '—')}</td><td>${U.escapeHtml(String(item.quantity || 0))}</td><td>${this.formatMoney(item.unit_price)}</td><td>${U.escapeHtml(String(item.discount_percent || 0))}</td><td>${this.formatMoney(item.line_total)}</td><td>${U.escapeHtml(item.notes || '—')}</td></tr>`)
            .join('')
        : '<tr><td colspan="6" class="muted" style="text-align:center;">No one-time fee rows.</td></tr>';
    }
  },
  populateForm(receipt, items, readOnly = false) {
    const set = (id, value) => {
      const el = E[id];
      if (el) el.value = value ?? '';
    };
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
    set('receiptFormAmountInWords', receipt.amount_in_words);
    set('receiptFormInvoiceGrandTotal', receipt.invoice_grand_total);
    set('receiptFormReceivedAmount', receipt.received_amount || receipt.grand_total);
    set('receiptFormPendingAmount', receipt.pending_amount);
    set('receiptFormPaymentState', receipt.payment_state);
    set('receiptFormPaymentNotes', receipt.payment_notes);
    set('receiptFormSupportEmail', receipt.support_email);
    if (E.receiptForm) E.receiptForm.dataset.id = receipt.receipt_id || '';
    if (E.receiptFormTitle) E.receiptFormTitle.textContent = receipt.receipt_id ? `Receipt · ${receipt.receipt_id}` : 'Create Receipt';
    if (E.receiptFormDeleteBtn) E.receiptFormDeleteBtn.style.display = !readOnly && receipt.receipt_id && Permissions.canDeleteReceipt() ? '' : 'none';
    if (E.receiptFormSaveBtn) E.receiptFormSaveBtn.style.display = !readOnly && Permissions.canUpdateReceipt() ? '' : 'none';
    this.renderItems(items);
    if (E.receiptForm) {
      E.receiptForm.querySelectorAll('input, textarea').forEach(el => {
        if (el.id === 'receiptFormReceiptId') return;
        el.disabled = readOnly;
      });
    }
    if (E.receiptFormModal) {
      E.receiptFormModal.classList.add('open');
      E.receiptFormModal.setAttribute('aria-hidden', 'false');
    }
  },
  closeForm() {
    if (E.receiptFormModal) {
      E.receiptFormModal.classList.remove('open');
      E.receiptFormModal.setAttribute('aria-hidden', 'true');
    }
  },
  setFormBusy(value) {
    const busy = !!value;
    if (E.receiptFormSaveBtn) E.receiptFormSaveBtn.disabled = busy;
    if (E.receiptFormDeleteBtn) E.receiptFormDeleteBtn.disabled = busy;
    if (E.receiptFormPreviewBtn) E.receiptFormPreviewBtn.disabled = busy;
  },
  async openReceiptById(receiptId, { readOnly = false, trigger = null } = {}) {
    const id = String(receiptId || '').trim();
    if (!id) return;
    if (this.state.openingReceiptIds.has(id)) return;
    this.state.openingReceiptIds.add(id);
    this.setTriggerBusy(trigger, true);
    console.time('receipt-open');
    const localSummary = this.state.rows.find(row => String(row.receipt_id || '').trim() === id);
    this.populateForm(localSummary ? { ...localSummary, receipt_id: id } : { receipt_id: id }, [], readOnly);
    this.setFormDetailLoading(true);
    try {
      const cached = this.getCachedDetail(id);
      if (cached) {
        this.state.selectedReceipt = cached.receipt;
        this.state.items = cached.items;
        this.populateForm(cached.receipt, cached.items, readOnly);
        return;
      }
      const response = await Api.getReceipt(id);
      const { receipt, items } = this.extractReceiptAndItems(response, id);
      this.setCachedDetail(id, receipt, items);
      this.state.selectedReceipt = receipt;
      this.state.items = items;
      if (String(E.receiptForm?.dataset.id || '').trim() === id) {
        this.populateForm(receipt, items, readOnly);
      }
    } catch (error) {
      UI.toast('Unable to load receipt: ' + (error?.message || 'Unknown error'));
    } finally {
      this.state.openingReceiptIds.delete(id);
      this.setTriggerBusy(trigger, false);
      this.setFormDetailLoading(false);
      console.timeEnd('receipt-open');
    }
  },
  collectUpdates() {
    const get = id => String(E[id]?.value || '').trim();
    return {
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
      invoice_grand_total: get('receiptFormInvoiceGrandTotal'),
      received_amount: get('receiptFormReceivedAmount'),
      pending_amount: get('receiptFormPendingAmount'),
      payment_state: get('receiptFormPaymentState'),
      payment_notes: get('receiptFormPaymentNotes'),
      support_email: get('receiptFormSupportEmail')
    };
  },
  async saveForm() {
    if (this.state.saveInFlight) return;
    const id = String(E.receiptForm?.dataset.id || '').trim();
    if (!id) return;
    const updates = this.collectUpdates();
    const currentRecord = this.state.rows.find(row => String(row.receipt_id || '') === id) || {};
    const workflowCheck = await window.WorkflowEngine?.enforceBeforeSave?.('receipts', currentRecord, {
      receipt_id: id,
      current_status: currentRecord?.status || '',
      requested_status: updates.status || '',
      requested_changes: { receipt: updates }
    });
    if (workflowCheck && !workflowCheck.allowed) {
      UI.toast(window.WorkflowEngine.composeDeniedMessage(workflowCheck, 'Receipt save blocked.'));
      return;
    }
    this.state.saveInFlight = true;
    this.setFormBusy(true);
    console.time('entity-save');
    try {
      const response = await Api.updateReceipt(id, updates);
      const parsed = this.extractReceiptAndItems(response, id);
      const persisted = parsed?.receipt?.receipt_id ? parsed.receipt : { ...updates, receipt_id: id };
      const normalized = this.upsertLocalRow(persisted);
      this.setCachedDetail(normalized?.receipt_id || id, persisted, parsed?.items || this.state.items);
      if (normalized?.receipt_id && this.state.selectedReceipt?.receipt_id === normalized.receipt_id) {
        this.state.selectedReceipt = normalized;
        this.state.items = parsed?.items || this.state.items;
      }
      await window.Invoices?.syncAfterReceiptMutation?.({ invoiceId: normalized?.invoice_id || persisted?.invoice_id, receipt: normalized });
      UI.toast(`Receipt ${id} saved.`);
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
    const id = String(receiptId || '').trim();
    if (!id) return;
    if (!window.confirm(`Delete receipt ${id}? This cannot be undone.`)) return;
    this.setFormBusy(true);
    try {
      const deletedInvoiceId = String(
        this.state.rows.find(row => String(row.receipt_id || '').trim() === id)?.invoice_id ||
          this.state.selectedReceipt?.invoice_id ||
          ''
      ).trim();
      await Api.deleteReceipt(id);
      delete this.state.detailCacheById[id];
      this.removeLocalRow(id);
      if (deletedInvoiceId) await window.Invoices?.syncAfterReceiptMutation?.({ invoiceId: deletedInvoiceId });
      UI.toast(`Receipt ${id} deleted.`);
      if (String(E.receiptForm?.dataset.id || '').trim() === id) this.closeForm();
    } catch (error) {
      UI.toast('Unable to delete receipt: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  formatReceiptPreviewHtml(html) {
    const branded = U.addIncheckDocumentLogo(html);
    if (!branded || /data-incheck360-receipt-style/i.test(branded)) return branded;

    const styleTag = `<style data-incheck360-receipt-style>
      body{font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.45;color:#0f172a;padding:24px;}
      h1,h2,h3,h4{margin:0 0 10px;color:#0f172a;}
      p{margin:0 0 8px;}
      table{width:100%;border-collapse:collapse;margin:14px 0 18px;}
      th,td{border:1px solid #dbe2ea;padding:8px 10px;vertical-align:top;text-align:left;}
      th{background:#f8fafc;font-weight:600;}
      .section,.block,.panel{margin-bottom:14px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;}
    </style>`;

    if (/<\/head>/i.test(branded)) return branded.replace(/<\/head>/i, `${styleTag}</head>`);
    return `${styleTag}${branded}`;
  },
  async previewReceipt(receiptId) {
    const id = String(receiptId || '').trim();
    if (!id) return;
    try {
      const response = await Api.previewReceipt(id);
      const html = String(response?.html || response?.receipt_html || response?.content || response || '').trim();
      if (!html) return UI.toast('No receipt HTML was returned by backend.');
      const formattedHtml = this.formatReceiptPreviewHtml(U.formatPreviewHtmlDates(html));
      if (E.receiptPreviewTitle) E.receiptPreviewTitle.textContent = `RECEIPT VOUCHER · ${id}`;
      if (E.receiptPreviewFrame) E.receiptPreviewFrame.srcdoc = formattedHtml;
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
        this.applyFilters();
        this.render();
      };
      el.addEventListener('input', sync);
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
