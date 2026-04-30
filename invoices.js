const Invoices = {
  invoiceFields: [
    'invoice_id',
    'invoice_number',
    'agreement_uuid',
    'agreement_id',
    'client_id',
    'issue_date',
    'due_date',
    'billing_frequency',
    'customer_name',
    'customer_legal_name',
    'customer_address',
    'customer_contact_name',
    'customer_contact_email',
    'provider_legal_name',
    'provider_address',
    'support_email',
    'payment_term',
    'currency',
    'status',
    'subtotal_locations',
    'subtotal_one_time',
    'invoice_total',
    'old_paid_total',
    'paid_now',
    'amount_paid',
    'received_amount',
    'pending_amount',
    'payment_state',
    'payment_conclusion',
    'amount_in_words',
    'notes',
    'updated_at'
  ],
  state: {
    rows: [],
    filteredRows: [],
    loading: false,
    loadError: '',
    initialized: false,
    search: '',
    status: 'All',
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    total: 0,
    kpiFilter: 'total',
    selectedInvoice: null,
    items: [],
    catalogLoading: false,
    saveInFlight: false,
    detailCacheById: {},
    detailCacheTtlMs: 90 * 1000,
    receiptsByInvoiceId: {},
    openingInvoiceIds: new Set(),
    loadingInvoiceReceiptIds: new Set(),
    rowActionInFlight: new Set()
  },
  statusOptions: ['Draft', 'Issued', 'Sent', 'Not Paid', 'Partially Paid', 'Fully Paid', 'Overdue', 'Cancelled'],
  toNumberSafe(value) {
    return U.toMoneyNumber(value);
  },
  formatMoney(value) {
    return this.toNumberSafe(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  },
  looksLikeUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  getInvoiceAgreementDisplay(invoice = {}) {
    const agreementNumber = String(invoice.agreement_number || invoice.agreementNumber || '').trim();
    const agreementBusinessId = String(invoice.agreement_id || invoice.agreementId || '').trim();
    if (agreementNumber && !this.looksLikeUuid(agreementNumber)) return agreementNumber;
    if (agreementBusinessId && !this.looksLikeUuid(agreementBusinessId)) return agreementBusinessId;
    return '—';
  },

  async getFullCompanyRecord(companyIdOrRecord) {
    if (!companyIdOrRecord) return null;
    if (typeof companyIdOrRecord === 'object' && companyIdOrRecord.company_id && companyIdOrRecord.company_name && companyIdOrRecord.address !== undefined) {
      return companyIdOrRecord;
    }
    const companyId = String((typeof companyIdOrRecord === 'object' ? companyIdOrRecord.company_id : companyIdOrRecord) || '').trim();
    if (!companyId) return null;
    const client = this.getSupabaseClient();
    if (!client) return typeof companyIdOrRecord === 'object' ? companyIdOrRecord : null;
    try {
      const { data, error } = await client.from('companies').select('*').eq('company_id', companyId).limit(1).maybeSingle();
      if (error) throw error;
      return data || (typeof companyIdOrRecord === 'object' ? companyIdOrRecord : null);
    } catch (_error) {
      return typeof companyIdOrRecord === 'object' ? companyIdOrRecord : null;
    }
  },
  async getFullContactRecord(contactIdOrRecord) {
    if (!contactIdOrRecord) return null;
    if (typeof contactIdOrRecord === 'object' && contactIdOrRecord.contact_id && (contactIdOrRecord.first_name || contactIdOrRecord.contact_name || contactIdOrRecord.full_name)) {
      return contactIdOrRecord;
    }
    const contactId = String((typeof contactIdOrRecord === 'object' ? contactIdOrRecord.contact_id : contactIdOrRecord) || '').trim();
    if (!contactId) return null;
    const client = this.getSupabaseClient();
    if (!client) return typeof contactIdOrRecord === 'object' ? contactIdOrRecord : null;
    try {
      const { data, error } = await client.from('contacts').select('*').eq('contact_id', contactId).limit(1).maybeSingle();
      if (error) throw error;
      return data || (typeof contactIdOrRecord === 'object' ? contactIdOrRecord : null);
    } catch (_error) {
      return typeof contactIdOrRecord === 'object' ? contactIdOrRecord : null;
    }
  },
  buildContactPersonName(contact = {}) {
    const first = String(contact?.first_name || '').trim();
    const last = String(contact?.last_name || '').trim();
    const full = `${first} ${last}`.trim();
    return full || String(contact?.contact_name || contact?.full_name || '').trim();
  },
  getCustomerLegalName(company = {}, record = {}) {
    return String(
      company?.legal_name ||
      company?.company_name ||
      record?.customer_legal_name ||
      record?.customer_name ||
      ''
    ).trim();
  },
  setReadonlyFieldValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value ?? '';
    el.readOnly = true;
    el.setAttribute('readonly', 'true');
    el.setAttribute('aria-readonly', 'true');
    el.classList.add('readonly-field', 'locked-field');
  },
  hydrateInvoiceCustomerSection({ agreement = {}, company = {}, contact = {} } = {}) {
    const customerName = this.getCustomerLegalName(company, agreement);
    const contactName = this.buildContactPersonName(contact) || String(agreement.contact_name || agreement.customer_contact_name || '').trim();
    this.setReadonlyFieldValue('invoiceFormCustomerName', customerName);
    this.setReadonlyFieldValue('invoiceFormCustomerLegalName', customerName);
    this.setReadonlyFieldValue('invoiceFormCustomerAddress', company?.address || agreement?.customer_address || '');
    this.setReadonlyFieldValue('invoiceFormCustomerContactName', contactName);
    this.setReadonlyFieldValue('invoiceFormCustomerContactEmail', contact?.email || agreement?.contact_email || agreement?.customer_contact_email || '');
  },
  normalizeInvoiceFinancials(invoice = {}) {
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    const invoiceTotal = this.toNumberSafe(
      pickDefined(invoice.invoice_total, invoice.grand_total, invoice.total_amount)
    );
    const amountPaid = this.toNumberSafe(
      pickDefined(invoice.amount_paid, invoice.received_amount, invoice.paid_amount)
    );
    const pendingInput = pickDefined(invoice.pending_amount, invoice.amount_due, invoice.balance_due);
    const pendingAmount = pendingInput === undefined
      ? Math.max(0, invoiceTotal - amountPaid)
      : this.toNumberSafe(pendingInput);
    return {
      invoice_total: invoiceTotal,
      amount_paid: amountPaid,
      pending_amount: pendingAmount,
      payment_state: U.calculatePaymentState(invoiceTotal, amountPaid, invoice.due_date || invoice.invoice_due_date || invoice.payment_due_date),
      payment_conclusion: U.calculatePaymentConclusion(invoiceTotal, amountPaid)
    };
  },
  normalizeStatus(value) {
    return String(value || '').trim().toLowerCase();
  },
  isInvoiceIssued(invoice = {}) {
    const status = this.normalizeStatus(invoice?.status || invoice?.invoice_status || invoice?.invoiceStatus);
    return status === 'issued';
  },
  getInvoicePaymentStatus(invoice = {}) {
    return String(
      invoice?.payment_status ||
      invoice?.paymentStatus ||
      invoice?.payment_state ||
      ''
    ).trim();
  },
  canCreateReceiptFromInvoice(invoice = {}) {
    if (!this.isInvoiceIssued(invoice)) return false;

    const paymentStatus = this.normalizeStatus(this.getInvoicePaymentStatus(invoice));
    if (paymentStatus === 'fully paid' || paymentStatus === 'paid') return false;

    const balanceDue = Number(
      invoice?.balance_due ??
      invoice?.balanceDue ??
      invoice?.pending_amount ??
      NaN
    );

    if (Number.isFinite(balanceDue)) return balanceDue > 0;

    const total = Number(
      invoice?.grand_total ??
      invoice?.total_amount ??
      invoice?.invoice_total ??
      invoice?.total ??
      0
    );

    const paid = Number(invoice?.amount_paid ?? invoice?.amountPaid ?? invoice?.received_amount ?? 0);

    if (total > 0) return paid < total;

    return true;
  },
  isIssuedInvoice(invoice = {}) {
    return this.isInvoiceIssued(invoice);
  },
  isSettlementReceipt(receipt = {}) {
    const status = this.normalizeText(receipt?.status);
    const paymentState = this.normalizeText(receipt?.payment_state);
    const pendingAmount = this.toNumberSafe(receipt?.pending_amount);
    return status === 'settlement' || receipt?.is_settlement === true || pendingAmount === 0 || paymentState === 'fully paid';
  },
  receiptTypeLabel(receipt = {}) {
    return this.isSettlementReceipt(receipt) ? 'Settlement' : 'Receipt';
  },
  sortReceiptsAscending(receipts = []) {
    const toTs = value => {
      const raw = String(value || '').trim();
      if (!raw) return Number.MAX_SAFE_INTEGER;
      const parsed = new Date(raw);
      const ts = parsed.getTime();
      return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
    };
    return [...receipts].sort((a, b) => {
      const aTs = toTs(a.receipt_date || a.created_at);
      const bTs = toTs(b.receipt_date || b.created_at);
      if (aTs !== bTs) return aTs - bTs;
      return String(a.receipt_id || '').localeCompare(String(b.receipt_id || ''));
    });
  },
  normalizeLinkedReceipt(raw = {}) {
    const source = window.Receipts?.normalizeReceipt ? window.Receipts.normalizeReceipt(raw) : { ...(raw || {}) };
    const amountReceived = this.toNumberSafe(
      source?.amount_received ??
      source?.received_amount ??
      source?.paid_now
    );
    return {
      id: String(source?.id || '').trim(),
      receipt_id: String(source?.receipt_id || '').trim(),
      receipt_number: String(source?.receipt_number || '').trim(),
      receipt_date: this.normalizeDateInputValue(source?.receipt_date),
      amount_received: amountReceived,
      received_amount: amountReceived,
      payment_method: String(source?.payment_method || '').trim(),
      payment_reference: String(source?.payment_reference || '').trim(),
      payment_state: String(source?.payment_state || '').trim(),
      status: String(source?.status || '').trim(),
      notes: String(source?.notes || source?.payment_notes || '').trim(),
      created_at: String(source?.created_at || '').trim()
    };
  },
  summarizeReceiptPayments(invoiceTotal, receipts = [], { baselinePaid = 0 } = {}) {
    const isVoided = receipt => {
      const status = this.normalizeText(receipt?.status);
      if (!status) return false;
      return status.includes('cancel') || status.includes('void') || status.includes('delete');
    };
    const normalized = (Array.isArray(receipts) ? receipts : [])
      .filter(receipt => !isVoided(receipt))
      .map(receipt => this.normalizeLinkedReceipt(receipt));
    const receiptsPaidAmount = normalized.reduce((sum, receipt) => sum + this.toNumberSafe(receipt.amount_received), 0);
    const cumulativePaidAmount = Math.max(this.toNumberSafe(baselinePaid), this.toNumberSafe(receiptsPaidAmount));
    const pendingAmount = Math.max(0, this.toNumberSafe(invoiceTotal) - cumulativePaidAmount);
    const paymentState = cumulativePaidAmount <= 0 ? 'Not Paid' : pendingAmount > 0 ? 'Partially Paid' : 'Fully Paid';
    const paymentConclusion = pendingAmount <= 0 ? 'Settled' : 'Pending Settlement';
    return {
      normalizedReceipts: normalized,
      received_amount: cumulativePaidAmount,
      amount_paid: cumulativePaidAmount,
      pending_amount: pendingAmount,
      payment_state: paymentState,
      payment_conclusion: paymentConclusion
    };
  },
  getInvoiceReceipts(invoiceId) {
    const key = String(invoiceId || '').trim();
    if (!key) return [];
    const rows = this.state.receiptsByInvoiceId[key];
    return Array.isArray(rows) ? rows : [];
  },
  setInvoiceReceipts(invoiceId, receipts = []) {
    const key = String(invoiceId || '').trim();
    if (!key) return [];
    const normalized = receipts.map(receipt => this.normalizeLinkedReceipt(receipt));
    const dedupedById = [];
    const seen = new Set();
    normalized.forEach(receipt => {
      const receiptId = String(receipt.id || receipt.receipt_id || '').trim();
      if (!receiptId || seen.has(receiptId)) return;
      seen.add(receiptId);
      dedupedById.push(receipt);
    });
    this.state.receiptsByInvoiceId[key] = this.sortReceiptsAscending(dedupedById);
    return this.state.receiptsByInvoiceId[key];
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
    if (!client) throw new Error('Supabase client is not available.');
    return client;
  },
  async resolveAgreementDisplayByUuid(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) return '';
    const client = this.getSupabaseClient();
    if (!client) return '';
    try {
      const { data, error } = await client.from('agreements').select('agreement_number,agreement_id').eq('id', id).limit(1).maybeSingle();
      if (error) throw error;
      return String(data?.agreement_number || data?.agreement_id || '').trim();
    } catch (_error) {
      return '';
    }
  },
  appendInvoiceReceipt(invoiceId, receipt) {
    const key = String(invoiceId || '').trim();
    if (!key || !receipt) return [];
    const existing = this.getInvoiceReceipts(key);
    return this.setInvoiceReceipts(key, [...existing, receipt]);
  },
  renderInvoiceReceipts(invoice = this.state.selectedInvoice) {
    if (!E.invoiceReceiptsTbody || !E.invoiceReceiptsState) return;
    const invoiceId = String(invoice?.id || '').trim();
    if (!invoiceId) {
      E.invoiceReceiptsState.textContent = 'Save invoice to attach receipts.';
      E.invoiceReceiptsTbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;">No receipts linked yet.</td></tr>';
      return;
    }
    if (this.state.loadingInvoiceReceiptIds.has(invoiceId)) {
      E.invoiceReceiptsState.textContent = 'Loading linked receipts…';
      E.invoiceReceiptsTbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;">Loading linked receipts…</td></tr>';
      return;
    }
    const receipts = this.getInvoiceReceipts(invoiceId);
    E.invoiceReceiptsState.textContent = receipts.length
      ? `${receipts.length} receipt${receipts.length === 1 ? '' : 's'} linked to this invoice.`
      : 'No receipts linked yet.';
    if (!receipts.length) {
      E.invoiceReceiptsTbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;">No receipts linked yet.</td></tr>';
      return;
    }
    E.invoiceReceiptsTbody.innerHTML = receipts
      .map(receipt => {
        return `<tr>
          <td>${U.escapeHtml(receipt.receipt_id || '—')}</td>
          <td>${U.escapeHtml(receipt.receipt_number || '—')}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(receipt.receipt_date))}</td>
          <td>${this.formatMoney(receipt.amount_received)}</td>
          <td>${U.escapeHtml(receipt.payment_method || '—')}</td>
          <td>${U.escapeHtml(receipt.payment_reference || '—')}</td>
          <td>${U.escapeHtml(receipt.status || '—')}</td>
          <td>${U.escapeHtml(receipt.notes || '—')}</td>
        </tr>`;
      })
      .join('');
  },
  applyReceiptPaymentSummary(invoice = this.state.selectedInvoice, { applyToForm = true } = {}) {
    if (!invoice) return;
    const invoiceId = String(invoice?.id || '').trim();
    const receipts = invoiceId ? this.getInvoiceReceipts(invoiceId) : [];
    const invoiceTotal = this.toNumberSafe(invoice?.invoice_total || invoice?.grand_total);
    const baselinePaid = this.toNumberSafe(invoice?.amount_paid ?? invoice?.received_amount ?? invoice?.old_paid_total);
    const paymentSummary = this.summarizeReceiptPayments(invoiceTotal, receipts, { baselinePaid });
    const merged = this.normalizeInvoice({
      ...invoice,
      ...paymentSummary,
      received_amount: paymentSummary.received_amount,
      pending_amount: paymentSummary.pending_amount,
      payment_state: paymentSummary.payment_state,
      payment_conclusion: paymentSummary.payment_conclusion
    });
    if (this.state.selectedInvoice && String(this.state.selectedInvoice.id || '').trim() === String(merged.id || '').trim()) {
      this.state.selectedInvoice = merged;
    }
    if (applyToForm && E.invoiceForm?.dataset.id === String(merged.id || '').trim()) {
      this.applyTotalsToForm(merged);
      this.syncPaymentConclusion(merged);
    }
    return merged;
  },
  syncPaymentConclusion(invoice = this.state.selectedInvoice) {
    if (!E.invoicePaymentConclusion) return;
    const pending = this.toNumberSafe(invoice?.pending_amount);
    E.invoicePaymentConclusion.textContent = pending <= 0 ? 'Settled' : 'Pending Settlement';
  },
  buildInvoiceSavePayload(invoice = {}) {
    const source = this.normalizeInvoice(invoice);
    const customerLegalName = U.getCustomerLegalName(
      { legal_name: source.customer_legal_name, company_name: source.company_name },
      source
    );
    const contactName = U.buildContactDisplayName(source);
    const contactPhone = String(source.contact_mobile || source.contact_phone || '').trim();
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    return {
      invoice_id: String(source.invoice_id || '').trim() || null,
      invoice_number: String(source.invoice_number || '').trim() || null,
      agreement_id: String(source.agreement_id || '').trim() || null,
      client_id: String(source.client_id || '').trim() || null,
      issue_date: this.normalizeDateInputValue(source.issue_date) || null,
      due_date: this.normalizeDateInputValue(source.due_date) || null,
      billing_frequency: String(source.billing_frequency || '').trim() || null,
      company_id: String(source.company_id || '').trim() || null,
      company_name: String(source.company_name || '').trim() || null,
      customer_name: customerLegalName || null,
      customer_legal_name: customerLegalName || null,
      customer_address: String(source.customer_address || '').trim() || null,
      contact_id: String(source.contact_id || '').trim() || null,
      contact_name: String(contactName || source.contact_name || '').trim() || null,
      contact_email: String(source.contact_email || '').trim() || null,
      contact_phone: contactPhone || null,
      contact_mobile: String(source.contact_mobile || '').trim() || null,
      customer_contact_name: String(source.customer_contact_name || '').trim() || null,
      customer_contact_email: String(source.customer_contact_email || '').trim() || null,
      provider_legal_name: String(source.provider_legal_name || '').trim() || null,
      provider_address: String(source.provider_address || '').trim() || null,
      support_email: String(source.support_email || '').trim() || null,
      payment_term: String(source.payment_term || '').trim() || null,
      currency: String(source.currency || 'USD').trim(),
      status: String(source.status || 'Draft').trim(),
      subtotal_locations: this.toNumberSafe(pickDefined(source.subtotal_locations, source.subtotal_subscription)),
      subtotal_one_time: this.toNumberSafe(source.subtotal_one_time),
      invoice_total: this.toNumberSafe(pickDefined(source.invoice_total, source.grand_total)),
      old_paid_total: this.toNumberSafe(source.old_paid_total),
      paid_now: this.toNumberSafe(source.paid_now),
      amount_paid: this.toNumberSafe(pickDefined(source.amount_paid, source.received_amount)),
      received_amount: this.toNumberSafe(pickDefined(source.received_amount, source.amount_paid)),
      pending_amount: this.toNumberSafe(source.pending_amount),
      payment_state: String(source.payment_state || '').trim() || 'Not Paid',
      payment_conclusion: String(source.payment_conclusion || '').trim() || this.derivePaymentConclusion(source),
      amount_in_words: String(source.amount_in_words || '').trim() || null,
      notes: String(source.notes || '').trim() || null
    };
  },
  async refreshInvoiceReceipts(invoiceId, { force = false } = {}) {
    const id = String(invoiceId || '').trim();
    if (!id) return;
    if (this.state.loadingInvoiceReceiptIds.has(id)) return;
    this.state.loadingInvoiceReceiptIds.add(id);
    this.renderInvoiceReceipts(this.state.selectedInvoice);
    try {
      const client = this.getSupabaseClient();
      let rows = [];
      const selected = this.state.rows.find(row => this.invoiceDbId(row.id) === id) || this.state.selectedInvoice || {};
      const invoiceNumber = String(selected?.invoice_number || '').trim();
      if (client) {
        const query = filter => client
          .from('receipts')
          .select('id,receipt_id,receipt_number,receipt_date,amount_received,received_amount,paid_now,payment_method,payment_reference,payment_state,status,notes,created_at,invoice_id,invoice_number')
          .match(filter)
          .order('receipt_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true, nullsFirst: false });
        const [byId, byNumber] = await Promise.all([
          query({ invoice_id: id }),
          invoiceNumber ? query({ invoice_number: invoiceNumber }) : Promise.resolve({ data: [], error: null })
        ]);
        const error = byId?.error || byNumber?.error;
        if (error) throw new Error(error.message || 'Unable to load receipts');
        rows = [...(Array.isArray(byId?.data) ? byId.data : []), ...(Array.isArray(byNumber?.data) ? byNumber.data : [])];
      } else {
        const responses = await Promise.all([
          Api.listReceipts({ invoice_id: id }, { page: 1, limit: 100, summary_only: true, forceRefresh: force }),
          invoiceNumber ? Api.listReceipts({ invoice_number: invoiceNumber }, { page: 1, limit: 100, summary_only: true, forceRefresh: force }) : Promise.resolve([])
        ]);
        rows = responses.flatMap(response => (window.Receipts?.extractRows ? window.Receipts.extractRows(response) : []));
      }
      this.setInvoiceReceipts(id, rows);
      this.applyReceiptPaymentSummary(this.state.selectedInvoice, { applyToForm: true });
    } catch (_error) {
      // Keep existing linked receipts visible.
    } finally {
      this.state.loadingInvoiceReceiptIds.delete(id);
      this.renderInvoiceReceipts(this.state.selectedInvoice);
    }
  },
  normalizeInvoice(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    const normalized = {};
    this.invoiceFields.forEach(field => {
      const camel = field.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
      const value = source[field] ?? source[camel] ?? '';
      normalized[field] = typeof value === 'string' ? value.trim() : value;
    });
    normalized.id = String(source.id || '').trim();
    normalized.invoice_id = String(normalized.invoice_id || '').trim();
    normalized.invoice_number = String(normalized.invoice_number || '').trim();
    normalized.status = String(normalized.status || '').trim() || 'Draft';
    normalized.currency = String(normalized.currency || '').trim() || 'USD';
    normalized.issue_date = this.normalizeDateInputValue(normalized.issue_date || source.issue_date || source.issueDate || source.invoice_date || source.invoiceDate);
    normalized.due_date = this.normalizeDateInputValue(normalized.due_date || source.due_date || source.dueDate);
    const subtotalLocations = pickDefined(
      normalized.subtotal_locations,
      source.subtotal_locations,
      source.subtotalLocations,
      source.subtotal_subscription,
      source.subtotalSubscription,
      source.saas_total,
      source.saasTotal
    );
    const subtotalOneTime = pickDefined(
      normalized.subtotal_one_time,
      source.subtotal_one_time,
      source.subtotalOneTime,
      source.one_time_total,
      source.oneTimeTotal
    );
    const invoiceTotal = pickDefined(
      normalized.invoice_total,
      source.invoice_total,
      source.invoiceTotal,
      source.grand_total,
      source.grandTotal
    );
    const oldPaidTotal = pickDefined(
      normalized.old_paid_total,
      source.old_paid_total,
      source.oldPaidTotal
    );
    const paidNow = pickDefined(
      normalized.paid_now,
      source.paid_now,
      source.paidNow
    );
    const amountPaid = pickDefined(
      normalized.amount_paid,
      source.amount_paid,
      source.amountPaid,
      normalized.received_amount,
      source.received_amount,
      source.receivedAmount
    );
    const pendingAmount = pickDefined(
      normalized.pending_amount,
      source.pending_amount,
      source.pendingAmount,
      source.balance_amount,
      source.balanceAmount
    );
    normalized.subtotal_locations = this.toNumberSafe(subtotalLocations);
    normalized.subtotal_one_time = this.toNumberSafe(subtotalOneTime);
    normalized.invoice_total = this.toNumberSafe(invoiceTotal);
    const hasOldPaid = oldPaidTotal !== undefined && oldPaidTotal !== null && String(oldPaidTotal).trim?.() !== '';
    const hasPaidNow = paidNow !== undefined && paidNow !== null && String(paidNow).trim?.() !== '';
    const hasAmountPaid = amountPaid !== undefined && amountPaid !== null && String(amountPaid).trim?.() !== '';
    const normalizedOldPaid = hasOldPaid ? this.toNumberSafe(oldPaidTotal) : null;
    const normalizedPaidNow = hasPaidNow ? this.toNumberSafe(paidNow) : null;
    const normalizedAmountPaid = hasAmountPaid ? this.toNumberSafe(amountPaid) : null;
    const derivedOldPaid = normalizedOldPaid ?? Math.max(0, this.toNumberSafe(normalizedAmountPaid) - this.toNumberSafe(normalizedPaidNow));
    const derivedPaidNow = normalizedPaidNow ?? 0;
    const snapshot = this.calculatePaymentSnapshot({
      invoiceTotal: normalized.invoice_total,
      oldPaidTotal: derivedOldPaid,
      paidNow: derivedPaidNow
    });
    const normalizedFinancials = this.normalizeInvoiceFinancials({
      invoice_total: normalized.invoice_total,
      amount_paid: normalizedAmountPaid ?? snapshot.amount_paid,
      pending_amount: pendingAmount
    });
    const finalAmountPaid = normalizedFinancials.amount_paid;
    normalized.old_paid_total = derivedOldPaid;
    normalized.paid_now = derivedPaidNow;
    normalized.amount_paid = finalAmountPaid;
    normalized.received_amount = finalAmountPaid;
    normalized.pending_amount = pendingAmount === undefined || pendingAmount === null || String(pendingAmount).trim?.() === ''
      ? snapshot.pending_amount
      : normalizedFinancials.pending_amount;
    normalized.payment_state = String(normalized.payment_state || source.paymentStatus || '').trim() || normalizedFinancials.payment_state;
    normalized.payment_conclusion = String(normalized.payment_conclusion || source.settlement_status || source.settlementStatus || '').trim() || normalizedFinancials.payment_conclusion;
    if (!normalized.amount_in_words && normalized.invoice_total > 0) {
      normalized.amount_in_words = this.amountToWords(normalized.invoice_total, normalized.currency);
    }
    return normalized;
  },
  invoiceDbId(value) {
    return String(value || '').trim();
  },
  invoiceDisplayId(invoice = {}) {
    return String(invoice?.invoice_number || invoice?.invoice_id || '').trim();
  },
  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  resolveInvoiceUuidForPreview(invoiceRef) {
    const ref = String(invoiceRef || '').trim();
    if (!ref) throw new Error('Missing invoice identifier.');
    if (this.isUuid(ref)) return ref;
    const localMatch = this.state.rows.find(row => {
      const rowId = String(row?.id || '').trim();
      const businessId = String(row?.invoice_id || '').trim();
      const number = String(row?.invoice_number || '').trim();
      return rowId === ref || businessId === ref || number === ref;
    });
    const resolvedId = String(localMatch?.id || '').trim();
    if (resolvedId && this.isUuid(resolvedId)) return resolvedId;
    throw new Error('Invoice UUID could not be resolved from the selected record.');
  },
  async loadInvoicePreviewData(invoiceRef) {
    const invoiceUuid = this.resolveInvoiceUuidForPreview(invoiceRef);
    const client = this.requireSupabaseClient();
    const [{ data: invoiceRow, error: invoiceError }, { data: itemRows, error: itemsError }] = await Promise.all([
      client.from('invoices').select('*').eq('id', invoiceUuid).maybeSingle(),
      client
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceUuid)
        .order('line_no', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true, nullsFirst: false })
    ]);
    if (invoiceError) throw new Error(`Unable to load invoice: ${invoiceError.message || 'Unknown error'}`);
    if (!invoiceRow) throw new Error('Invoice was not found.');
    if (itemsError) throw new Error(`Unable to load invoice items: ${itemsError.message || 'Unknown error'}`);
    const invoiceNumber = String(invoiceRow?.invoice_number || '').trim();
    const receiptQuery = filter => client
      .from('receipts')
      .select('id,receipt_id,receipt_number,receipt_date,amount_received,received_amount,paid_now,payment_method,payment_reference,payment_state,status,notes,created_at,invoice_id,invoice_number')
      .match(filter)
      .order('receipt_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true, nullsFirst: false });
    const [byId, byNumber] = await Promise.all([
      receiptQuery({ invoice_id: invoiceUuid }),
      invoiceNumber ? receiptQuery({ invoice_number: invoiceNumber }) : Promise.resolve({ data: [], error: null })
    ]);
    const receiptsError = byId?.error || byNumber?.error;
    if (receiptsError) throw new Error(`Unable to load linked receipts: ${receiptsError.message || 'Unknown error'}`);
    const receiptRows = [...(Array.isArray(byId?.data) ? byId.data : []), ...(Array.isArray(byNumber?.data) ? byNumber.data : [])];
    const normalizedInvoice = this.normalizeInvoice(invoiceRow);
    const paymentSummary = this.summarizeReceiptPayments(normalizedInvoice.invoice_total || normalizedInvoice.grand_total, receiptRows || [], {
      baselinePaid: normalizedInvoice.amount_paid ?? normalizedInvoice.received_amount ?? normalizedInvoice.old_paid_total
    });
    return {
      invoiceUuid,
      invoice: this.normalizeInvoice({ ...normalizedInvoice, ...paymentSummary }),
      items: Array.isArray(itemRows) ? itemRows.map(item => this.normalizeItem(item)) : [],
      receipts: paymentSummary.normalizedReceipts
    };
  },
  buildInvoicePreviewHtml(invoice = {}, items = [], receipts = []) {
    const invoiceData = invoice && typeof invoice === 'object' ? invoice : {};
    const normalizedItems = (Array.isArray(items) ? items : []).map((item, index) => {
      const normalized = this.normalizeItem(item);
      if (!normalized.line_no) normalized.line_no = index + 1;
      return normalized;
    });
    const currency = String(invoiceData.currency || 'USD').trim().toUpperCase();
    const money = value => {
      const amount = this.toNumberSafe(value);
      return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const sanitize = value => U.escapeHtml(String(value ?? '').trim());
    const textValue = value => {
      const text = String(value ?? '').trim();
      return text ? U.escapeHtml(text) : '—';
    };
    const dateValue = value => {
      const raw = String(value || '').trim();
      if (!raw) return '—';
      const formatted = U.fmtDisplayDate(raw);
      return formatted && formatted !== 'Invalid Date' ? formatted : U.escapeHtml(raw);
    };
    const numValue = value => {
      const amount = this.toNumberSafe(value);
      return Number.isFinite(amount) ? U.escapeHtml(String(amount)) : '—';
    };
    const itemTotals = this.calculateInvoiceTotals(normalizedItems);
    const subtotalLocations = this.toNumberSafe(
      invoiceData.subtotal_locations ?? invoiceData.subtotal_subscription ?? itemTotals.subtotal_locations
    );
    const subtotalOneTime = this.toNumberSafe(invoiceData.subtotal_one_time ?? itemTotals.subtotal_one_time);
    const invoiceTotal = this.toNumberSafe(invoiceData.invoice_total ?? invoiceData.grand_total ?? itemTotals.invoice_total);
    const baselinePaid = this.toNumberSafe(invoiceData.amount_paid ?? invoiceData.received_amount ?? invoiceData.old_paid_total);
    const receiptSummary = this.summarizeReceiptPayments(invoiceTotal, receipts, { baselinePaid });
    const paidAmount = this.toNumberSafe(receiptSummary.amount_paid);
    const paidNow = this.toNumberSafe(invoiceData.paid_now);
    const oldPaidTotal = Math.max(0, paidAmount - paidNow);
    const pendingAmount = this.toNumberSafe(receiptSummary.pending_amount);
    const paymentState = String(receiptSummary.payment_state || invoiceData.payment_state || 'Not Paid').trim();
    const amountInWords = String(invoiceData.amount_in_words || '').trim() || this.amountToWords(invoiceTotal, currency);
    const paymentConclusion = String(receiptSummary.payment_conclusion || invoiceData.payment_conclusion || '').trim() || this.derivePaymentConclusion({ pending_amount: pendingAmount });

    const subscriptionItems = normalizedItems.filter(item => this.isSubscriptionSection(item.section));
    const oneTimeItems = normalizedItems.filter(item => this.isOneTimeSection(item.section));

    const subscriptionRows = subscriptionItems.length
      ? subscriptionItems
          .map(item => {
            const computed = this.computeCommercialRow(item);
            return `<tr>
              <td>${textValue(item.location_name)}</td>
              <td>${textValue(item.location_address)}</td>
              <td class="cell-center">${dateValue(item.service_start_date)}</td>
              <td class="cell-center">${dateValue(item.service_end_date)}</td>
              <td>${textValue(item.item_name)}</td>
              <td class="cell-right">${money(computed.line_total)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="6" class="cell-center muted">No subscription items found.</td></tr>';

    const oneTimeRows = oneTimeItems.length
      ? oneTimeItems
          .map(item => {
            const computed = this.computeCommercialRow(item);
            return `<tr>
              <td>${textValue(item.location_name)}</td>
              <td>${textValue(item.location_address)}</td>
              <td>${textValue(item.item_name)}</td>
              <td class="cell-right">${money(item.unit_price)}</td>
              <td class="cell-center">${U.escapeHtml(String(this.toNumberSafe(item.discount_percent)))}%</td>
              <td class="cell-right">${money(computed.discounted_unit_price)}</td>
              <td class="cell-right">${money(computed.line_total)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="7" class="cell-center muted">No one-time fee items found.</td></tr>';
    const linkedReceipts = this.sortReceiptsAscending(receiptSummary.normalizedReceipts);
    const receiptsRows = linkedReceipts.length
      ? linkedReceipts
          .map(receipt => `<tr>
              <td>${textValue(receipt.receipt_id)}</td>
              <td>${textValue(receipt.receipt_number)}</td>
              <td class="cell-center">${dateValue(receipt.receipt_date)}</td>
              <td class="cell-right">${money(receipt.amount_received)}</td>
              <td>${textValue(receipt.payment_method)}</td>
              <td>${textValue(receipt.payment_reference)}</td>
              <td>${textValue(receipt.status)}</td>
              <td>${textValue(receipt.notes)}</td>
            </tr>`)
          .join('')
      : '<tr><td colspan="8" class="cell-center muted">No linked receipts found.</td></tr>';

    const companyTitle = String(invoiceData.company_name || invoiceData.company_legal_name || 'COMPANY NAME').trim();
    const companySubtitle = String(invoiceData.company_tagline || 'Business Software Services').trim();
    const agreementLabel = String(invoiceData.agreement_number || invoiceData.agreement_id || '—').trim();
    const customerName = String(invoiceData.customer_legal_name || invoiceData.customer_name || invoiceData.client_name || '').trim();
    const customerAddress = String(invoiceData.customer_address || '').trim();
    const paymentTerm = String(invoiceData.payment_term || '').trim() || 'Net 30';
    const footerNote = String(invoiceData.footer_note || invoiceData.notes || '').trim();
    const bankRows = [
      ['Bank Name', textValue(invoiceData.bank_name)],
      ['Account Name', textValue(invoiceData.bank_account_name)],
      ['Account Number', textValue(invoiceData.bank_account_number)],
      ['IBAN', textValue(invoiceData.bank_iban)],
      ['SWIFT / BIC', textValue(invoiceData.bank_swift)],
      ['Branch', textValue(invoiceData.bank_branch)],
      ['Beneficiary Address', textValue(invoiceData.bank_beneficiary_address)],
      ['Payment Reference', textValue(invoiceData.invoice_number || invoiceData.invoice_id)]
    ];

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice Preview</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 18px; color: #111827; background: #f3f4f6; }
      .invoice-sheet { max-width: 1020px; margin: 0 auto; background: #fff; border: 1px solid #d1d5db; padding: 22px; }
      .header-top { text-align: center; padding-bottom: 12px; border-bottom: 1px solid #111827; }
      .logo-title { margin: 0; font-size: 26px; letter-spacing: 0.04em; font-weight: 700; }
      .logo-subtitle { margin: 4px 0 0; color: #4b5563; font-size: 12px; }
      .invoice-head { display: grid; grid-template-columns: 1fr 300px; gap: 24px; margin-top: 16px; align-items: start; }
      .invoice-label { margin: 0; font-size: 38px; font-weight: 700; letter-spacing: 0.02em; }
      .meta-box { border: 1px solid #111827; }
      .meta-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #d1d5db; }
      .meta-row:last-child { border-bottom: 0; }
      .meta-row > div { padding: 7px 10px; font-size: 12.5px; }
      .meta-row .meta-key { background: #f9fafb; font-weight: 700; border-right: 1px solid #d1d5db; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
      .info-box { border: 1px solid #111827; min-height: 124px; }
      .info-head { background: #f3f4f6; border-bottom: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
      .info-body { padding: 10px; font-size: 12.5px; line-height: 1.45; }
      .muted { color: #6b7280; }
      .section { margin-top: 18px; }
      .section h2 { margin: 0; font-size: 16px; border-bottom: 1px solid #111827; padding-bottom: 5px; }
      .section .subhead { font-size: 12px; margin: 6px 0 8px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.04em; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #111827; padding: 7px 8px; font-size: 12px; vertical-align: middle; }
      th { text-align: center; background: #f9fafb; font-weight: 700; }
      .cell-center { text-align: center; vertical-align: middle; }
      .cell-right { text-align: right; vertical-align: middle; white-space: nowrap; }
      .total-row td { font-weight: 700; background: #f9fafb; }
      .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
      .totals-box { width: 380px; border: 1px solid #111827; }
      .totals-row { display: flex; justify-content: space-between; padding: 9px 10px; border-bottom: 1px solid #d1d5db; font-size: 13px; }
      .totals-row:last-child { border-bottom: 0; }
      .totals-row.grand { font-size: 15px; font-weight: 700; background: #f3f4f6; }
      .terms { margin-top: 14px; font-size: 12.5px; line-height: 1.5; }
      .terms .strong { font-weight: 700; }
      .bank { margin-top: 18px; }
      .bank h3 { margin: 0 0 8px; font-size: 15px; letter-spacing: 0.04em; }
      .bank-box { border: 1px solid #111827; }
      .bank-row { display: grid; grid-template-columns: 180px 1fr; border-bottom: 1px solid #d1d5db; }
      .bank-row:last-child { border-bottom: 0; }
      .bank-row > div { padding: 7px 9px; font-size: 12px; }
      .bank-key { background: #f9fafb; font-weight: 700; border-right: 1px solid #d1d5db; }
      .footer-note { margin-top: 16px; font-size: 11px; color: #4b5563; border-top: 1px solid #e5e7eb; padding-top: 8px; text-align: center; }
      @media print { body { margin: 0; padding: 0; background: #fff; } .invoice-sheet { border: 0; max-width: none; } }
    </style>
  </head>
  <body>
    <div class="invoice-sheet">
      <header class="header-top">
        <h1 class="logo-title">${sanitize(companyTitle || 'COMPANY NAME')}</h1>
        <div class="logo-subtitle">${sanitize(companySubtitle)}</div>
      </header>

      <section class="invoice-head">
        <h2 class="invoice-label">INVOICE</h2>
        <div class="meta-box">
          <div class="meta-row"><div class="meta-key">Invoice #</div><div>${textValue(invoiceData.invoice_number || invoiceData.invoice_id)}</div></div>
          <div class="meta-row"><div class="meta-key">Invoice Date</div><div>${dateValue(invoiceData.issue_date || invoiceData.invoice_date)}</div></div>
          <div class="meta-row"><div class="meta-key">Due Date</div><div>${dateValue(invoiceData.due_date)}</div></div>
        </div>
      </section>

      <section class="info-grid">
        <div class="info-box">
          <div class="info-head">BILL TO</div>
          <div class="info-body">
            <div><strong>${textValue(customerName)}</strong></div>
            <div class="muted">${textValue(customerAddress)}</div>
          </div>
        </div>
        <div class="info-box">
          <div class="info-head">INVOICE INFO</div>
          <div class="info-body">
            <div><strong>Related to:</strong> ${textValue(invoiceData.account_reference || invoiceData.related_to || agreementLabel)}</div>
            <div><strong>Payment Term:</strong> ${textValue(paymentTerm)}</div>
            <div><strong>Customer Contact:</strong> ${textValue(invoiceData.customer_contact_name)}</div>
            <div><strong>Email:</strong> ${textValue(invoiceData.customer_contact_email)}</div>
            <div><strong>Agreement #:</strong> ${textValue(agreementLabel)}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Subscription Details</h2>
        <div class="subhead">SaaS Details</div>
        <table>
          <thead>
            <tr>
              <th style="width:16%">Location Name</th>
              <th style="width:23%">Location Address</th>
              <th style="width:12%">Start Date</th>
              <th style="width:12%">End Date</th>
              <th>Modules / Item Name</th>
              <th style="width:14%">Price</th>
            </tr>
          </thead>
          <tbody>
            ${subscriptionRows}
            <tr class="total-row">
              <td colspan="5" class="cell-right">Total SaaS</td>
              <td class="cell-right">${money(subtotalLocations)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>One Time Fees Details</h2>
        <div class="subhead">One Time Fees</div>
        <table>
          <thead>
            <tr>
              <th style="width:14%">Location Name</th>
              <th style="width:22%">Location Address</th>
              <th style="width:17%">Service</th>
              <th style="width:11%">Price</th>
              <th style="width:9%">Discount %</th>
              <th style="width:13%">Disc. Price</th>
              <th style="width:14%">Price / Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${oneTimeRows}
            <tr class="total-row">
              <td colspan="6" class="cell-right">Total One Time Fees</td>
              <td class="cell-right">${money(subtotalOneTime)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="totals-wrap">
        <div class="totals-box">
          <div class="totals-row"><span>One Time Fees</span><strong>${money(subtotalOneTime)}</strong></div>
          <div class="totals-row"><span>Subscription Fees</span><strong>${money(subtotalLocations)}</strong></div>
          <div class="totals-row grand"><span>Grand Total</span><strong>${money(invoiceTotal)}</strong></div>
          <div class="totals-row"><span>Old Paid Total</span><strong>${money(oldPaidTotal)}</strong></div>
          <div class="totals-row"><span>Paid Now</span><strong>${money(paidNow)}</strong></div>
          <div class="totals-row"><span>Amount Paid (Cumulative)</span><strong>${money(paidAmount)}</strong></div>
          <div class="totals-row"><span>Pending Amount</span><strong>${money(pendingAmount)}</strong></div>
          <div class="totals-row"><span>Payment State</span><strong>${textValue(paymentState)}</strong></div>
          <div class="totals-row"><span>Payment Conclusion</span><strong>${textValue(paymentConclusion)}</strong></div>
        </div>
      </section>

      <section class="section">
        <h2>Linked Receipts / Payment History</h2>
        <table>
          <thead>
            <tr>
              <th style="width:12%">Receipt ID</th>
              <th style="width:13%">Receipt Number</th>
              <th style="width:12%">Date</th>
              <th style="width:12%">Amount Received</th>
              <th style="width:12%">Payment Method</th>
              <th style="width:14%">Payment Reference</th>
              <th style="width:10%">Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${receiptsRows}</tbody>
        </table>
      </section>

      <section class="terms">
        <div><span class="strong">Amount in Words:</span> ${textValue(amountInWords)}</div>
        <div><span class="strong">Payment Term:</span> ${textValue(paymentTerm)}</div>
        <div><span class="strong">Payment Note:</span> ${textValue(paymentConclusion)}</div>
        <div><span class="strong">Additional Notes:</span> ${textValue(invoiceData.notes)}</div>
      </section>

      <section class="bank">
        <h3>BANK DETAILS</h3>
        <div class="bank-box">
          ${bankRows
            .map(([label, value]) => `<div class="bank-row"><div class="bank-key">${U.escapeHtml(label)}</div><div>${value}</div></div>`)
            .join('')}
        </div>
      </section>

      <footer class="footer-note">${textValue(footerNote || 'For billing support, please contact accounts@company.com · +1 (000) 000-0000')}</footer>
    </div>
  </body>
</html>`;
  },
  normalizeSection(value) {
    const raw = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!raw) return '';
    if (['subscription', 'annual', 'annual_saas', 'annual saas', 'saas', 'recurring'].includes(raw)) return 'annual_saas';
    if (['one_time', 'one-time_fee', 'one_time_fee', 'one-time', 'one-time fee', 'one time fee', 'onetime', 'setup', 'non_recurring', 'non-recurring'].includes(raw))
      return 'one_time_fee';
    if (raw === 'capability') return 'capability';
    return raw;
  },
  normalizeDateInputValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const prefixMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (prefixMatch) return prefixMatch[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toISOString().slice(0, 10);
  },
  normalizeItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };
    const section = this.normalizeSection(
      pick(source.section, source.item_section, source.itemSection, source.type, source.item_type, source.itemType)
    );
    return {
      catalog_item_id: String(pick(source.catalog_item_id, source.catalogItemId)).trim(),
      section,
      line_no: this.toNumberSafe(pick(source.line_no, source.lineNo, source.line)) || 0,
      location_name: String(pick(source.location_name, source.locationName)).trim(),
      location_address: String(pick(source.location_address, source.locationAddress)).trim(),
      service_start_date: this.normalizeDateInputValue(pick(source.service_start_date, source.serviceStartDate)),
      service_end_date: this.normalizeDateInputValue(pick(source.service_end_date, source.serviceEndDate)),
      item_name: String(pick(source.item_name, source.itemName, source.name)).trim(),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.toNumberSafe(pick(source.discount_percent, source.discountPercent)),
      discounted_unit_price: this.toNumberSafe(
        pick(source.discounted_unit_price, source.discountedUnitPrice, source.discounted_price, source.discountedPrice)
      ),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty, source.units)),
      line_total: this.toNumberSafe(pick(source.line_total, source.lineTotal, source.amount, source.total)),
      capability_name: String(pick(source.capability_name, source.capabilityName)).trim(),
      capability_value: String(pick(source.capability_value, source.capabilityValue)).trim(),
      notes: String(pick(source.notes)).trim()
    };
  },
  normalizeCatalogItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };
    return {
      catalog_item_id: String(pick(source.catalog_item_id, source.catalogItemId, source.id)).trim(),
      section: this.normalizeSection(pick(source.section, source.item_section, source.type)),
      item_name: String(pick(source.item_name, source.itemName, source.name)).trim(),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.toNumberSafe(pick(source.discount_percent, source.discountPercent)),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty)),
      notes: String(pick(source.notes)).trim()
    };
  },
  async getProposalCatalogLookup() {
    try {
      let sourceRows = [];
      if (typeof window.ProposalCatalog?.ensureLookupLoaded === 'function') {
        sourceRows = await window.ProposalCatalog.ensureLookupLoaded();
      } else {
        const response = await Api.listProposalCatalogItems({ limit: 200, page: 1, summary_only: true });
        sourceRows = Array.isArray(response) ? response : response?.rows || response?.items || response?.data || response?.result || [];
      }
      const normalized = (Array.isArray(sourceRows) ? sourceRows : []).map(item => this.normalizeCatalogItem(item));
      const byId = new Map();
      const byName = new Map();
      normalized.forEach(item => {
        if (item.catalog_item_id) byId.set(item.catalog_item_id, item);
        if (item.item_name) byName.set(item.item_name.toLowerCase(), item);
      });
      return { byId, byName, names: normalized.map(item => item.item_name).filter(Boolean) };
    } catch (_error) {
      return { byId: new Map(), byName: new Map(), names: [] };
    }
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
  getCachedDetail(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    const cached = this.state.detailCacheById[key];
    if (!cached) return null;
    if (Date.now() - Number(cached.cachedAt || 0) > this.state.detailCacheTtlMs) return null;
    return cached;
  },
  setCachedDetail(id, invoice, items) {
    const key = String(id || '').trim();
    if (!key) return;
    this.state.detailCacheById[key] = {
      invoice: this.normalizeInvoice(invoice || { id: key }),
      items: Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [],
      cachedAt: Date.now()
    };
  },
  setTriggerBusy(trigger, busy) {
    if (!trigger || !('disabled' in trigger)) return;
    trigger.disabled = !!busy;
  },
  setFormDetailLoading(loading) {
    if (!E.invoiceForm) return;
    if (loading) E.invoiceForm.setAttribute('data-detail-loading', 'true');
    else E.invoiceForm.removeAttribute('data-detail-loading');
    if (E.invoiceFormTitle) {
      const baseTitle = String(E.invoiceFormTitle.textContent || '').replace(/\s+\u00b7\s+Loading details…$/, '').trim();
      E.invoiceFormTitle.textContent = loading ? `${baseTitle || 'Invoice'} · Loading details…` : baseTitle;
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
  mergeCatalogItem(invoiceItem = {}, catalogLookup = { byId: new Map(), byName: new Map() }) {
    const byId = catalogLookup?.byId instanceof Map ? catalogLookup.byId : new Map();
    const byName = catalogLookup?.byName instanceof Map ? catalogLookup.byName : new Map();
    const catalogItemId = String(invoiceItem.catalog_item_id || '').trim();
    const itemName = String(invoiceItem.item_name || '').trim().toLowerCase();
    const catalogMatch = (catalogItemId && byId.get(catalogItemId)) || (itemName && byName.get(itemName)) || null;
    const base = this.normalizeItem(invoiceItem);
    const merged = this.normalizeItem({
      ...base,
      ...(catalogMatch || {}),
      catalog_item_id: catalogItemId || catalogMatch?.catalog_item_id || '',
      section: this.normalizeSection(base.section || catalogMatch?.section),
      item_name: base.item_name || catalogMatch?.item_name || '',
      notes: base.notes || catalogMatch?.notes || ''
    });
    const hasDiscountedUnitPrice = invoiceItem?.discounted_unit_price !== undefined && invoiceItem?.discounted_unit_price !== null;
    const hasLineTotal = invoiceItem?.line_total !== undefined && invoiceItem?.line_total !== null;
    if (!hasDiscountedUnitPrice || !hasLineTotal) {
      const discountRatio =
        merged.discount_percent > 1 ? merged.discount_percent / 100 : Math.max(0, merged.discount_percent);
      if (!hasDiscountedUnitPrice) merged.discounted_unit_price = merged.unit_price * (1 - discountRatio);
      if (!hasLineTotal) merged.line_total = merged.discounted_unit_price * (merged.quantity || 0);
    }
    return merged;
  },
  copyInvoiceItemFields(sourceItem = {}, mergedItem = {}) {
    const merged = this.normalizeItem(mergedItem);
    const rawSource = sourceItem && typeof sourceItem === 'object' ? sourceItem : {};
    const pickProvided = (keys, mergedValue, { numeric = false, normalizeDate = false, normalizeSection = false } = {}) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      let provided = false;
      let value;
      keyList.forEach(key => {
        if (provided) return;
        if (Object.prototype.hasOwnProperty.call(rawSource, key)) {
          const candidate = rawSource[key];
          if (candidate === undefined || candidate === null) return;
          if (typeof candidate === 'string' && candidate.trim() === '') return;
          provided = true;
          value = candidate;
        }
      });
      if (!provided) return mergedValue;
      if (normalizeSection) return this.normalizeSection(value);
      if (normalizeDate) return this.normalizeDateInputValue(value);
      if (numeric) return this.toNumberSafe(value);
      return String(value).trim();
    };
    return this.normalizeItem({
      ...merged,
      section: pickProvided(['section', 'item_section', 'itemSection'], merged.section, { normalizeSection: true }),
      line_no: pickProvided(['line_no', 'lineNo', 'line'], merged.line_no, { numeric: true }),
      location_name: pickProvided(['location_name', 'locationName'], merged.location_name),
      location_address: pickProvided(['location_address', 'locationAddress'], merged.location_address),
      item_name: pickProvided(['item_name', 'itemName', 'description', 'name'], merged.item_name),
      unit_price: pickProvided(['unit_price', 'unitPrice'], merged.unit_price, { numeric: true }),
      discount_percent: pickProvided(['discount_percent', 'discountPercent'], merged.discount_percent, { numeric: true }),
      discounted_unit_price: pickProvided(['discounted_unit_price', 'discountedUnitPrice', 'discounted_price', 'discountedPrice'], merged.discounted_unit_price, { numeric: true }),
      quantity: pickProvided(['quantity', 'qty', 'units'], merged.quantity, { numeric: true }),
      line_total: pickProvided(['line_total', 'lineTotal', 'amount', 'total'], merged.line_total, { numeric: true }),
      capability_name: pickProvided(['capability_name', 'capabilityName'], merged.capability_name),
      capability_value: pickProvided(['capability_value', 'capabilityValue'], merged.capability_value),
      notes: pickProvided(['notes'], merged.notes),
      service_start_date: pickProvided(['service_start_date', 'serviceStartDate'], merged.service_start_date, { normalizeDate: true }),
      service_end_date: pickProvided(['service_end_date', 'serviceEndDate'], merged.service_end_date, { normalizeDate: true })
    });
  },
  isSubscriptionSection(section = '') {
    const normalized = this.normalizeSection(section);
    return ['annual_saas', 'subscription', 'recurring', 'saas'].includes(normalized);
  },
  isOneTimeSection(section = '') {
    const normalized = this.normalizeSection(section);
    return ['one_time_fee', 'one_time', 'setup', 'non_recurring', 'non-recurring'].includes(normalized);
  },
  calculateInvoiceTotals(items = []) {
    return (Array.isArray(items) ? items : []).reduce(
      (acc, rawItem) => {
        const item = this.normalizeItem(rawItem);
        const lineTotal = this.toNumberSafe(item.line_total);
        if (this.isSubscriptionSection(item.section)) acc.subtotal_locations += lineTotal;
        else if (this.isOneTimeSection(item.section)) acc.subtotal_one_time += lineTotal;
        acc.invoice_total += lineTotal;
        return acc;
      },
      { subtotal_locations: 0, subtotal_one_time: 0, invoice_total: 0 }
    );
  },
  amountToWords(value, currency = 'USD') {
    const amount = this.toNumberSafe(value);
    const whole = Math.floor(Math.max(0, amount));
    const cents = Math.round((amount - whole) * 100);
    const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const underThousand = n => {
      if (n < 20) return ones[n];
      if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ''}`;
      return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${underThousand(n % 100)}` : ''}`;
    };
    const toWords = n => {
      if (n === 0) return 'Zero';
      const chunks = [[1_000_000_000, 'Billion'], [1_000_000, 'Million'], [1_000, 'Thousand'], [1, '']];
      let remaining = n;
      const out = [];
      chunks.forEach(([size, label]) => {
        if (remaining < size) return;
        const chunk = Math.floor(remaining / size);
        remaining %= size;
        out.push(`${underThousand(chunk)}${label ? ` ${label}` : ''}`);
      });
      return out.join(' ');
    };
    const currencyLabel = String(currency || 'USD').trim().toUpperCase() === 'USD' ? 'Dollars' : String(currency || 'Currency').trim().toUpperCase();
    return `${toWords(whole)} ${currencyLabel} and ${String(cents).padStart(2, '0')}/100`;
  },
  derivePaymentConclusion(invoice = {}) {
    const pending = this.toNumberSafe(invoice.pending_amount);
    return pending <= 0 ? 'Settled' : 'Pending Settlement';
  },
  calculatePaymentSnapshot({ invoiceTotal = 0, oldPaidTotal = 0, paidNow = 0 } = {}) {
    return U.calculateInvoicePaymentSnapshot({ invoiceTotal, oldPaidTotal, paidNow });
  },
  normalizeInvoicePaymentForForm(invoice = {}, { resetForNew = false } = {}) {
    const total = this.toNumberSafe(invoice.invoice_total ?? invoice.grand_total);
    if (resetForNew) {
      return this.calculatePaymentSnapshot({ invoiceTotal: total, oldPaidTotal: 0, paidNow: 0 });
    }
    const rawAmountPaid = this.toNumberSafe(invoice.amount_paid ?? invoice.received_amount ?? invoice.amount_received);
    const rawPaidNow = this.toNumberSafe(invoice.paid_now);
    const hasLegacyPaidNow = rawPaidNow > 0 && rawAmountPaid <= 0;
    const cumulativePaid = hasLegacyPaidNow ? rawPaidNow : rawAmountPaid;
    return this.calculatePaymentSnapshot({ invoiceTotal: total, oldPaidTotal: cumulativePaid, paidNow: 0 });
  },
  deriveCalculatedSummary(invoice = {}, items = [], { preferInvoiceValues = false } = {}) {
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    const hasItems = Array.isArray(items) && items.length > 0;
    const itemTotals = this.calculateInvoiceTotals(items);
    const totals = preferInvoiceValues && !hasItems
      ? {
          subtotal_locations: this.toNumberSafe(
            pickDefined(invoice.subtotal_locations, invoice.subtotal_subscription, invoice.saas_total)
          ),
          subtotal_one_time: this.toNumberSafe(
            pickDefined(invoice.subtotal_one_time, invoice.one_time_total)
          ),
          invoice_total: this.toNumberSafe(
            pickDefined(invoice.invoice_total, invoice.grand_total)
          )
        }
      : itemTotals;
    totals.invoice_total = this.toNumberSafe(totals.subtotal_locations) + this.toNumberSafe(totals.subtotal_one_time);
    const invoiceId = String(invoice?.id || '').trim();
    const linkedReceipts = invoiceId ? this.getInvoiceReceipts(invoiceId) : [];
    const fallbackAmountPaid = this.toNumberSafe(pickDefined(invoice.amount_paid, invoice.received_amount, invoice.amount_received));
    const oldPaidInput = pickDefined(invoice.old_paid_total, fallbackAmountPaid - this.toNumberSafe(invoice.paid_now));
    const paidNowInput = pickDefined(invoice.paid_now, 0);
    const snapshot = this.calculatePaymentSnapshot({
      invoiceTotal: totals.invoice_total,
      oldPaidTotal: oldPaidInput,
      paidNow: paidNowInput
    });
    const receiptPaymentSummary = this.summarizeReceiptPayments(totals.invoice_total, linkedReceipts, { baselinePaid: snapshot.amount_paid });
    const derivedPayment = linkedReceipts.length
      ? {
          old_paid_total: this.toNumberSafe(receiptPaymentSummary.amount_paid) - this.toNumberSafe(invoice.paid_now),
          paid_now: this.toNumberSafe(invoice.paid_now),
          amount_paid: this.toNumberSafe(receiptPaymentSummary.amount_paid),
          received_amount: this.toNumberSafe(receiptPaymentSummary.amount_paid),
          pending_amount: this.toNumberSafe(receiptPaymentSummary.pending_amount),
          payment_state: String(receiptPaymentSummary.payment_state || '').trim() || U.calculatePaymentState(totals.invoice_total, receiptPaymentSummary.amount_paid),
          payment_conclusion: String(receiptPaymentSummary.payment_conclusion || '').trim() || U.calculatePaymentConclusion(totals.invoice_total, receiptPaymentSummary.amount_paid)
        }
      : snapshot;
    const amountInWords = this.amountToWords(totals.invoice_total, invoice.currency);
    return {
      ...totals,
      subtotal_subscription: totals.subtotal_locations,
      grand_total: totals.invoice_total,
      ...derivedPayment,
      amount_in_words: amountInWords,
      payment_conclusion: derivedPayment.payment_conclusion || this.derivePaymentConclusion(derivedPayment)
    };
  },
  applyTotalsToForm(summary = {}) {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = this.toNumberSafe(value);
    };
    set('invoiceFormSubtotalSubscription', summary.subtotal_locations);
    set('invoiceFormSubtotalOneTime', summary.subtotal_one_time);
    set('invoiceFormGrandTotal', summary.invoice_total);
    set('invoiceFormOldPaidTotal', summary.old_paid_total);
    set('invoiceFormPaidNow', summary.paid_now);
    set('invoiceFormAmountPaid', summary.received_amount ?? summary.amount_paid);
    set('invoiceFormPendingAmount', summary.pending_amount);
    if (E.invoiceFormPaymentState) E.invoiceFormPaymentState.value = String(summary.payment_state || 'Not Paid');
    if (E.invoiceFormAmountInWords) E.invoiceFormAmountInWords.value = String(summary.amount_in_words || '');
    if (E.invoicePaymentConclusion) E.invoicePaymentConclusion.textContent = String(summary.payment_conclusion || 'Pending Settlement');
  },
  todayIso() {
    return new Date().toISOString().slice(0, 10);
  },
  generateInvoiceNumber() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${datePart}-${randomPart}`;
  },
  ensureInvoiceNumber(value = '') {
    const existing = String(value || '').trim();
    return existing || this.generateInvoiceNumber();
  },
  getCatalogRowsForSection(section) {
    const rows = typeof window.ProposalCatalog?.getActiveCatalogItems === 'function'
      ? window.ProposalCatalog.getActiveCatalogItems(section)
      : Array.isArray(window.ProposalCatalog?.state?.rows)
        ? window.ProposalCatalog.state.rows
        : [];
    return rows
      .filter(row => row?.is_active !== false && String(row?.section || '').trim().toLowerCase() === section)
      .sort((a, b) => {
        const aSort = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
        const bSort = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
        if (aSort !== bSort) return aSort - bSort;
        return String(a?.item_name || '').localeCompare(String(b?.item_name || ''));
      });
  },
  renderCatalogOptionList(section) {
    const list = document.getElementById(`invoiceCatalogOptions-${section}`);
    if (!list) return;
    const seen = new Set();
    list.innerHTML = this.getCatalogRowsForSection(section)
      .filter(row => {
        const key = String(row?.item_name || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(row => `<option value="${U.escapeAttr(String(row?.item_name || '').trim())}"></option>`)
      .join('');
  },
  renderCatalogOptionLists() {
    this.renderCatalogOptionList('annual_saas');
    this.renderCatalogOptionList('one_time_fee');
  },
  async ensureCatalogLoaded() {
    this.renderCatalogOptionLists();
    const hasRows =
      this.getCatalogRowsForSection('annual_saas').length || this.getCatalogRowsForSection('one_time_fee').length;
    if (hasRows) return;
    if (this.state.catalogLoading || typeof window.ProposalCatalog?.ensureLookupLoaded !== 'function') return;
    this.state.catalogLoading = true;
    try {
      await window.ProposalCatalog.ensureLookupLoaded();
      this.renderCatalogOptionLists();
    } catch (_) {
      // Non-blocking: invoice form still allows manual item entry when catalog load fails.
    } finally {
      this.state.catalogLoading = false;
    }
  },
  extractRows(response) {
    const parseJsonIfNeeded = value => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return value;
      try {
        return JSON.parse(trimmed);
      } catch (_error) {
        return value;
      }
    };
    const coerceRows = value => {
      const parsed = parseJsonIfNeeded(value);
      if (Array.isArray(parsed)) return parsed;
      if (!parsed || typeof parsed !== 'object') return [];
      const values = Object.values(parsed).filter(Boolean);
      if (!values.length || !values.every(item => item && typeof item === 'object')) return [];
      const hasInvoiceLikeShape = values.some(
        item =>
          'invoice_id' in item ||
          'invoiceId' in item ||
          'invoice_number' in item ||
          'invoiceNumber' in item ||
          'agreement_id' in item ||
          'agreementId' in item
      );
      return hasInvoiceLikeShape ? values : [];
    };
    const candidates = [
      response,
      response?.invoices,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.invoices,
      response?.result?.invoices,
      response?.payload?.invoices
    ];
    for (const candidate of candidates) {
      const rows = coerceRows(candidate);
      if (rows.length) return rows;
    }
    return [];
  },
  extractInvoiceAndItems(response, fallbackId = '') {
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
      response?.invoice,
      response?.created_invoice
    ];

    let invoice = null;
    let items = [];

    for (const rawCandidate of candidates) {
      const candidate = parseJsonIfNeeded(rawCandidate);
      if (!candidate) continue;

      if (Array.isArray(candidate)) {
        const first = candidate[0];
        if (!invoice && first && typeof first === 'object') {
          invoice = first;
        }
        if (!items.length && Array.isArray(first?.items)) {
          items = first.items;
        }
        continue;
      }

      if (typeof candidate !== 'object') continue;

      if (!invoice) {
        if (candidate.item && typeof candidate.item === 'object') invoice = candidate.item;
        else if (candidate.invoice && typeof candidate.invoice === 'object') invoice = candidate.invoice;
        else if (candidate.created_invoice && typeof candidate.created_invoice === 'object') invoice = candidate.created_invoice;
        else if (Array.isArray(candidate.data) && candidate.data[0] && typeof candidate.data[0] === 'object') invoice = candidate.data[0];
        else if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)) invoice = candidate.data;
        else if (candidate.invoice_id || candidate.invoice_number) invoice = candidate;
      }

      if (!items.length) {
        if (Array.isArray(candidate.items)) items = candidate.items;
        else if (Array.isArray(candidate.invoice_items)) items = candidate.invoice_items;
        else if (Array.isArray(candidate.agreement_items)) items = candidate.agreement_items;
        else if (Array.isArray(candidate.created_invoice_items)) items = candidate.created_invoice_items;
        else if (candidate.item && Array.isArray(candidate.item.items)) items = candidate.item.items;
        else if (candidate.invoice && Array.isArray(candidate.invoice.items)) items = candidate.invoice.items;
        else if (candidate.created_invoice && Array.isArray(candidate.created_invoice.items)) items = candidate.created_invoice.items;
        else if (Array.isArray(candidate.data) && Array.isArray(candidate.data[0]?.items)) items = candidate.data[0].items;
        else if (candidate.data && Array.isArray(candidate.data.items)) items = candidate.data.items;
      }
    }

    return {
      invoice: this.normalizeInvoice(invoice || { id: fallbackId }),
      items: Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : []
    };
  },
  emptyInvoice() {
    return {
      invoice_id: '',
      invoice_number: this.generateInvoiceNumber(),
      agreement_id: '',
      issue_date: this.todayIso(),
      due_date: '',
      billing_frequency: '',
      customer_name: '',
      customer_legal_name: '',
      customer_address: '',
      customer_contact_name: '',
      customer_contact_email: '',
      provider_legal_name: '',
      provider_address: '',
      support_email: '',
      payment_term: '',
      currency: 'USD',
      status: 'Draft',
      subtotal_locations: '',
      subtotal_one_time: '',
      invoice_total: '',
      received_amount: 0,
      pending_amount: 0,
      payment_state: 'Not Paid',
      payment_conclusion: 'Pending Settlement',
      amount_in_words: '',
      notes: ''
    };
  },

  derivePaymentFields(invoice = {}) {
    const normalized = this.normalizeInvoiceFinancials(invoice);
    return {
      amount_paid: normalized.amount_paid,
      pending_amount: normalized.pending_amount,
      payment_state: normalized.payment_state
    };
  },
  syncPaymentFieldsInForm() {
    const grandTotal = this.toNumberSafe(E.invoiceFormGrandTotal?.value);
    const oldPaidTotal = Math.max(0, this.toNumberSafe(E.invoiceFormOldPaidTotal?.value));
    const paidNow = Math.max(0, this.toNumberSafe(E.invoiceFormPaidNow?.value));
    const snapshot = this.calculatePaymentSnapshot({ invoiceTotal: grandTotal, oldPaidTotal, paidNow });
    if (E.invoiceFormAmountPaidWrap) E.invoiceFormAmountPaidWrap.style.display = '';
    if (E.invoiceFormPendingAmountWrap) E.invoiceFormPendingAmountWrap.style.display = '';
    if (E.invoiceFormAmountPaid) {
      E.invoiceFormAmountPaid.value = snapshot.amount_paid;
      E.invoiceFormAmountPaid.readOnly = true;
    }
    if (E.invoiceFormPendingAmount) E.invoiceFormPendingAmount.value = snapshot.pending_amount;
    if (E.invoiceFormPaymentState) E.invoiceFormPaymentState.value = snapshot.payment_state;
    if (E.invoiceFormAmountInWords) E.invoiceFormAmountInWords.value = this.amountToWords(grandTotal, E.invoiceFormCurrency?.value || 'USD');
    this.syncPaymentConclusion(snapshot);
  },
  applyFilters() {
    this.state.filteredRows = this.state.rows.filter(row => {
      if (!this.matchesKpiFilter(row)) return false;
      return true;
    });
  },
  matchesKpiFilter(row = {}) {
    const filter = this.state.kpiFilter || 'total';
    const status = this.normalizeText(row?.status);
    if (filter === 'total') return true;
    if (filter === 'draft') return status === 'draft';
    if (filter === 'issued') return status === 'issued';
    if (filter === 'partially-paid') return status === 'partially paid';
    if (filter === 'paid') return status === 'paid';
    if (filter === 'overdue') return status === 'overdue';
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.applyFilters();
    this.render();
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeInvoice(row);
    const id = this.invoiceDbId(normalized.id);
    if (!id) return normalized;
    const idx = this.state.rows.findIndex(item => this.invoiceDbId(item.id) === id);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.rerenderVisibleTable();
    return normalized;
  },
  removeLocalRow(id) {
    const targetId = this.invoiceDbId(id);
    const before = this.state.rows.length;
    this.state.rows = this.state.rows.filter(item => this.invoiceDbId(item.id) !== targetId);
    if (this.state.rows.length !== before) this.rerenderVisibleTable();
  },
  rerenderVisibleTable() {
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  renderSummary() {
    if (!E.invoiceSummary) return;
    const rows = this.state.filteredRows;
    const count = label => rows.filter(row => this.normalizeText(row.status) === label.toLowerCase()).length;
    const cards = [
      ['Total Invoices', rows.length, 'total'],
      ['Draft', count('draft'), 'draft'],
      ['Issued', count('issued'), 'issued'],
      ['Partially Paid', count('partially paid'), 'partially-paid'],
      ['Fully Paid', count('paid'), 'paid'],
      ['Overdue', count('overdue'), 'overdue']
    ];
    E.invoiceSummary.innerHTML = cards
      .map(([label, value, filter]) => {
        const active = (this.state.kpiFilter || 'total') === filter;
        return `<div class="card kpi${active ? ' kpi-filter-active' : ''}" data-kpi-filter="${U.escapeAttr(filter)}" role="button" tabindex="0" aria-pressed="${active ? 'true' : 'false'}"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`;
      })
      .join('');
  },
  renderFilters() {
    if (E.invoicesSearchInput) E.invoicesSearchInput.value = this.state.search;
    if (E.invoicesStatusFilter) {
      const seen = [...new Set(this.state.rows.map(row => String(row.status || '').trim()).filter(Boolean))];
      const options = ['All', ...this.statusOptions, ...seen.filter(v => !this.statusOptions.includes(v))];
      E.invoicesStatusFilter.innerHTML = [...new Set(options)].map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
      E.invoicesStatusFilter.value = options.includes(this.state.status) ? this.state.status : 'All';
    }
  },
  render() {
    if (!E.invoicesState || !E.invoicesTbody) return;
    if (this.state.loading) {
      this.renderPagination();
      E.invoicesState.textContent = 'Loading invoices…';
      E.invoicesTbody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;">Loading invoices…</td></tr>';
      return;
    }
    if (this.state.loadError) {
      this.renderPagination();
      E.invoicesState.textContent = this.state.loadError;
      E.invoicesTbody.innerHTML = `<tr><td colspan="10" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    this.renderSummary();
    this.renderPagination();
    const rows = this.state.filteredRows;
    const totalRows = Number(this.state.total || 0);
    E.invoicesState.textContent = `${rows.length} item(s) • Page ${this.state.page}${totalRows ? ` • ${totalRows} total` : ''}`;
    if (!rows.length) {
      const emptyMessage = totalRows
        ? 'No invoices match the current search or filters.'
        : 'No invoices found. Create your first invoice to get started.';
      E.invoicesTbody.innerHTML = `<tr><td colspan="10" class="muted" style="text-align:center;">${U.escapeHtml(emptyMessage)}</td></tr>`;
      return;
    }
    const textCell = value => U.escapeHtml(String(value ?? '').trim() || '—');
    E.invoicesTbody.innerHTML = rows
      .map(row => {
        const id = U.escapeAttr(row.id || '');
        return `<tr>
          <td>${textCell(row.invoice_number || row.invoice_id)}</td>
          <td>${textCell(row.customer_name)}</td>
          <td>${textCell(this.getInvoiceAgreementDisplay(row))}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.issue_date))}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.due_date))}</td>
          <td>${textCell(row.currency)}</td>
          <td>${this.formatMoney(row.invoice_total)}</td>
          <td>${textCell(row.status)}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.updated_at))}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn ghost sm" type="button" data-invoice-view="${id}">Open</button>
            ${Permissions.canUpdateInvoice() ? `<button class="btn ghost sm" type="button" data-invoice-edit="${id}">Edit</button>` : ''}
            ${Permissions.canPreviewInvoice() ? `<button class="btn ghost sm" type="button" data-invoice-preview="${id}">Preview</button>` : ''}
            ${Permissions.canCreateReceiptFromInvoice() && this.canCreateReceiptFromInvoice(row) ? `<button class="btn ghost sm" type="button" data-invoice-create-receipt="${id}">Create Receipt</button>` : ''}
            ${Permissions.canDeleteInvoice() ? `<button class="btn ghost sm" type="button" data-invoice-delete="${id}">Delete</button>` : ''}
          </div></td>
        </tr>`;
      })
      .join('');
  },
  renderPagination() {
    const host = U.ensurePaginationHost({
      hostId: 'invoicesPagination',
      anchor: E.invoicesState?.closest?.('.card')
    });
    U.renderPaginationControls({
      host,
      moduleKey: 'invoices',
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
  computeCommercialRow(item = {}) {
    const unit = this.toNumberSafe(item.unit_price);
    const discount = this.toNumberSafe(item.discount_percent);
    const qty = this.toNumberSafe(item.quantity);
    const discountRatio = discount > 1 ? discount / 100 : Math.max(0, discount);
    const discounted = unit * (1 - discountRatio);
    const lineTotal = discounted * qty;
    return {
      ...item,
      discounted_unit_price: discounted,
      line_total: lineTotal
    };
  },
  groupedItems(items = []) {
    const groups = { annual_saas: [], one_time_fee: [], capability: [] };
    (Array.isArray(items) ? items : []).forEach((item, idx) => {
      const normalized = this.normalizeItem(item);
      const section = ['annual_saas', 'one_time_fee', 'capability'].includes(normalized.section)
        ? normalized.section
        : 'annual_saas';
      normalized.line_no = normalized.line_no || idx + 1;
      groups[section].push(normalized);
    });
    return groups;
  },
  getCatalogItemByName(section, itemName) {
    const target = this.normalizeText(itemName);
    if (!target) return null;
    return (
      this.getCatalogRowsForSection(section).find(row => this.normalizeText(row?.item_name) === target) || null
    );
  },
  applyCatalogSelectionToRow(tr, section) {
    if (!tr || section === 'capability') return;
    const itemInput = tr.querySelector('[data-item-field="item_name"]');
    const unitPriceInput = tr.querySelector('[data-item-field="unit_price"]');
    const locationInput = tr.querySelector('[data-item-field="location_name"]');
    if (!itemInput || !unitPriceInput) return;

    const selected = this.getCatalogItemByName(section, itemInput.value);
    if (!selected) {
      unitPriceInput.readOnly = false;
      unitPriceInput.removeAttribute('title');
      tr.dataset.priceLocked = 'false';
      return;
    }

    if (selected.unit_price !== null && selected.unit_price !== undefined) {
      unitPriceInput.value = String(selected.unit_price);
    }
    unitPriceInput.readOnly = true;
    unitPriceInput.title = 'Unit price is set from the proposal catalog.';
    tr.dataset.priceLocked = 'true';
    if (locationInput && !String(locationInput.value || '').trim() && selected.default_location_name) {
      locationInput.value = String(selected.default_location_name);
    }
  },
  renderSectionRows(section, rows = []) {
    const tbody =
      section === 'annual_saas'
        ? E.invoiceAnnualItemsTbody
        : section === 'one_time_fee'
        ? E.invoiceOneTimeItemsTbody
        : E.invoiceCapabilityItemsTbody;
    if (!tbody) return;

    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) {
      const colspan = section === 'capability' ? 4 : 12;
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="muted" style="text-align:center;">No rows yet.</td></tr>`;
      return;
    }

    if (section === 'capability') {
      tbody.innerHTML = safeRows
        .map(
          (row, index) => `<tr data-item-row="${section}">
          <td><input class="input" data-item-field="capability_name" value="${U.escapeAttr(row.capability_name || '')}" /></td>
          <td><input class="input" data-item-field="capability_value" value="${U.escapeAttr(row.capability_value || '')}" /></td>
          <td><input class="input" data-item-field="notes" value="${U.escapeAttr(row.notes || '')}" /></td>
          <td><button class="btn ghost sm" type="button" data-item-remove="${section}" data-item-index="${index}">Remove</button></td>
        </tr>`
        )
        .join('');
      return;
    }

    tbody.innerHTML = safeRows
      .map((row, index) => {
        const computed = this.computeCommercialRow(row);
        return `<tr data-item-row="${section}">
          <td><input class="input" data-item-field="location_name" value="${U.escapeAttr(computed.location_name || '')}" /></td>
          <td><input class="input" data-item-field="location_address" value="${U.escapeAttr(computed.location_address || '')}" /></td>
          <td><input class="input" type="date" data-item-field="service_start_date" value="${U.escapeAttr(computed.service_start_date || '')}" /></td>
          <td><input class="input" type="date" data-item-field="service_end_date" value="${U.escapeAttr(computed.service_end_date || '')}" /></td>
          <td><input class="input" data-item-field="item_name" list="invoiceCatalogOptions-${section}" value="${U.escapeAttr(computed.item_name || '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="unit_price" value="${U.escapeAttr(computed.unit_price ?? '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="discount_percent" value="${U.escapeAttr(computed.discount_percent ?? '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="quantity" value="${U.escapeAttr(computed.quantity ?? '')}" /></td>
          <td><span data-item-display="discounted_unit_price">${this.formatMoney(computed.discounted_unit_price)}</span></td>
          <td><span data-item-display="line_total">${this.formatMoney(computed.line_total)}</span></td>
          <td><input class="input" data-item-field="notes" value="${U.escapeAttr(computed.notes || '')}" /></td>
          <td><button class="btn ghost sm" type="button" data-item-remove="${section}" data-item-index="${index}">Remove</button></td>
        </tr>`;
      })
      .join('');
    [...tbody.querySelectorAll('tr[data-item-row]')].forEach(tr => this.applyCatalogSelectionToRow(tr, section));
  },
  renderItems(items = []) {
    this.renderCatalogOptionLists();
    const groups = this.groupedItems(items);
    this.renderSectionRows('annual_saas', groups.annual_saas);
    this.renderSectionRows('one_time_fee', groups.one_time_fee);
    this.renderSectionRows('capability', groups.capability);
  },
  assignFormValues(invoice = {}) {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      const safeValue =
        el.type === 'date'
          ? this.normalizeDateInputValue(value)
          : value ?? '';
      el.value = safeValue;
    };
    this.invoiceFields.forEach(field => {
      const id = `invoiceForm${field.replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase())}`;
      set(id, invoice[field] || '');
    });
  },
  collectSectionItems(section) {
    const tbody =
      section === 'annual_saas'
        ? E.invoiceAnnualItemsTbody
        : section === 'one_time_fee'
        ? E.invoiceOneTimeItemsTbody
        : E.invoiceCapabilityItemsTbody;
    if (!tbody) return [];
    const rows = [...tbody.querySelectorAll('tr[data-item-row]')];
    return rows
      .map((tr, idx) => {
        const get = field => tr.querySelector(`[data-item-field="${field}"]`)?.value ?? '';
        if (section === 'capability') {
          const capabilityName = String(get('capability_name')).trim();
          const capabilityValue = String(get('capability_value')).trim();
          const notes = String(get('notes')).trim();
          if (!capabilityName && !capabilityValue && !notes) return null;
          return { section, line_no: idx + 1, capability_name: capabilityName, capability_value: capabilityValue, notes };
        }
        const unitPrice = this.toNumberSafe(get('unit_price'));
        const discountPercent = this.toNumberSafe(get('discount_percent'));
        const quantity = this.toNumberSafe(get('quantity'));
        const computed = this.computeCommercialRow({ unit_price: unitPrice, discount_percent: discountPercent, quantity });
        const hasMeaningfulValue = [
          get('item_name'),
          get('location_name'),
          get('location_address'),
          get('service_start_date'),
          get('service_end_date'),
          get('notes')
        ].some(value => String(value || '').trim()) || unitPrice || quantity;
        if (!hasMeaningfulValue) return null;
        return this.normalizeItem({
          section,
          line_no: idx + 1,
          location_name: String(get('location_name')).trim(),
          location_address: String(get('location_address')).trim(),
          service_start_date: String(get('service_start_date')).trim(),
          service_end_date: String(get('service_end_date')).trim(),
          item_name: String(get('item_name')).trim(),
          unit_price: unitPrice,
          discount_percent: discountPercent,
          quantity,
          discounted_unit_price: computed.discounted_unit_price,
          line_total: computed.line_total,
          notes: String(get('notes')).trim()
        });
      })
      .filter(Boolean);
  },
  collectItems() {
    return [
      ...this.collectSectionItems('annual_saas'),
      ...this.collectSectionItems('one_time_fee'),
      ...this.collectSectionItems('capability')
    ];
  },
  collectFormValues() {
    const get = id => String(document.getElementById(id)?.value || '').trim();
    const invoice = {};
    const existingInvoice = this.state.selectedInvoice || {};
    this.invoiceFields.forEach(field => {
      const id = `invoiceForm${field.replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase())}`;
      const inputEl = document.getElementById(id);
      if (inputEl) invoice[field] = get(id);
      else invoice[field] = existingInvoice[field] ?? '';
    });
    invoice.issue_date = String(invoice.issue_date || invoice.invoice_date || '').trim();
    const items = this.collectItems();
    invoice.old_paid_total = this.toNumberSafe(E.invoiceFormOldPaidTotal?.value);
    invoice.paid_now = this.toNumberSafe(E.invoiceFormPaidNow?.value);
    const paymentSnapshot = this.calculatePaymentSnapshot({
      invoiceTotal: this.toNumberSafe(invoice.invoice_total),
      oldPaidTotal: invoice.old_paid_total,
      paidNow: invoice.paid_now
    });
    invoice.amount_paid = paymentSnapshot.amount_paid;
    invoice.received_amount = paymentSnapshot.amount_paid;
    invoice.pending_amount = paymentSnapshot.pending_amount;
    invoice.payment_state = paymentSnapshot.payment_state;
    invoice.payment_conclusion = paymentSnapshot.payment_conclusion;
    invoice.subtotal_locations = this.toNumberSafe(invoice.subtotal_locations);
    invoice.subtotal_one_time = this.toNumberSafe(invoice.subtotal_one_time);
    invoice.invoice_total = this.toNumberSafe(invoice.invoice_total);
    const selectedAgreement = this.state.selectedAgreement || {};
    const selectedCompany = this.state.selectedCompany || {};
    const selectedContact = this.state.selectedContact || {};
    const customerName = this.getCustomerLegalName(selectedCompany, selectedAgreement);
    const contactName = this.buildContactPersonName(selectedContact) || String(selectedAgreement.contact_name || selectedAgreement.customer_contact_name || '').trim();
    const contactPhone = String(selectedContact.mobile || selectedContact.phone || selectedAgreement.contact_phone || selectedAgreement.customer_contact_phone || '').trim();
    const agreementUuid = String(
      selectedAgreement.id ||
      selectedAgreement.uuid ||
      selectedAgreement.agreement_uuid ||
      selectedAgreement.agreementUuid ||
      this.state.form?.agreementUuid ||
      E.invoiceFormAgreementUuid?.value ||
      invoice.agreement_uuid ||
      ''
    ).trim();
    const agreementId = String(
      selectedAgreement.agreement_id ||
      selectedAgreement.agreementId ||
      selectedAgreement.agreement_number ||
      selectedAgreement.agreementNumber ||
      this.state.form?.agreementId ||
      E.invoiceFormAgreementId?.value ||
      invoice.agreement_id ||
      ''
    ).trim();
    const agreementNumber = String(
      selectedAgreement.agreement_number ||
      selectedAgreement.agreementNumber ||
      selectedAgreement.agreement_id ||
      selectedAgreement.agreementId ||
      E.invoiceAgreementNumber?.value ||
      E.invoiceFormAgreementNumber?.value ||
      invoice.agreement_number ||
      invoice.agreementNumber ||
      ''
    ).trim();
    invoice.agreement_uuid = agreementUuid;
    invoice.agreement_id = agreementId;
    invoice.agreement_number = agreementNumber;
    invoice.company_id = String(selectedCompany.company_id || selectedAgreement.company_id || invoice.company_id || '').trim();
    invoice.company_name = String(selectedCompany.company_name || selectedAgreement.company_name || invoice.company_name || '').trim();
    invoice.customer_name = customerName;
    invoice.customer_legal_name = customerName;
    invoice.customer_address = String(selectedCompany.address || selectedAgreement.customer_address || invoice.customer_address || '').trim();
    invoice.contact_id = String(selectedContact.contact_id || selectedAgreement.contact_id || invoice.contact_id || '').trim();
    invoice.contact_name = contactName;
    invoice.customer_contact_name = contactName;
    invoice.contact_email = String(selectedContact.email || selectedAgreement.contact_email || selectedAgreement.customer_contact_email || '').trim();
    invoice.customer_contact_email = invoice.contact_email;
    invoice.contact_phone = contactPhone;
    invoice.contact_mobile = String(selectedContact.mobile || selectedAgreement.contact_mobile || selectedAgreement.customer_contact_mobile || '').trim();
    return { invoice, items };
  },
  validateInvoice(invoice = {}) {
    const draft = invoice || {};
    const selectedAgreement = this.state.selectedAgreement || {};
    const hasAgreementLink = String(
      this.state.form?.agreementUuid ||
      selectedAgreement?.id ||
      draft.agreement_uuid ||
      this.state.form?.agreementId ||
      this.state.form?.agreementNumber ||
      draft.agreement_id ||
      draft.agreement_number ||
      ''
    ).trim();
    const agreementId = String(
      selectedAgreement?.agreement_id ||
      selectedAgreement?.uuid ||
      selectedAgreement?.agreement_id ||
      selectedAgreement?.agreementId ||
      E.invoiceAgreementId?.value ||
      E.invoiceFormAgreementId?.value ||
      draft.agreement_id ||
      draft.agreementId ||
      ''
    ).trim();
    const requiredFields = [
      ['invoice_number', 'Invoice Number'],
      ['issue_date', 'Invoice Date'],
      ['due_date', 'Due Date'],
      ['currency', 'Currency']
    ];
    const missing = requiredFields.filter(([field]) => !String(draft?.[field] || '').trim());
    if (!hasAgreementLink) {
      UI.toast('Invoice must be linked to an Agreement. Please create the invoice from an Agreement.');
      return false;
    }

    if (missing.length) {
      const firstFieldId = `invoiceForm${missing[0][0].replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase())}`;
      const firstFieldEl = document.getElementById(firstFieldId);
      if (firstFieldEl) firstFieldEl.focus();
      UI.toast(`Please fill required fields: ${missing.map(([, label]) => label).join(', ')}`);
      return false;
    }

    const status = String(invoice?.status || '').trim();
    const grandTotal = this.toNumberSafe(invoice?.invoice_total || invoice?.grand_total);
    const amountPaid = this.toNumberSafe(invoice?.received_amount || invoice?.amount_paid);
    const paidNow = this.toNumberSafe(invoice?.paid_now);
    if (paidNow < 0) {
      UI.toast('Paid Now cannot be negative.');
      E.invoiceFormPaidNow?.focus();
      return false;
    }
    if (amountPaid > grandTotal) {
      UI.toast('Amount Paid cannot exceed Invoice Total.');
      E.invoiceFormPaidNow?.focus();
      return false;
    }
    if (status === 'Partially Paid' && !(amountPaid > 0 && amountPaid < grandTotal)) {
      UI.toast('For Partially Paid invoices, Amount Paid must be greater than 0 and less than Grand Total.');
      E.invoiceFormPaidNow?.focus();
      return false;
    }
    return true;
  },
  openInvoice(invoice = this.emptyInvoice(), items = [], { readOnly = false } = {}) {
    if (!E.invoiceFormModal || !E.invoiceForm) return;
    this.state.selectedInvoice = this.normalizeInvoice(invoice);
    const isExistingInvoice = !!String(this.state.selectedInvoice?.id || '').trim();
    const normalizedFormPayment = this.normalizeInvoicePaymentForForm(this.state.selectedInvoice, {
      resetForNew: !isExistingInvoice
    });
    this.state.selectedInvoice = {
      ...this.state.selectedInvoice,
      old_paid_total: normalizedFormPayment.old_paid_total,
      paid_now: normalizedFormPayment.paid_now,
      amount_paid: normalizedFormPayment.amount_paid,
      received_amount: normalizedFormPayment.amount_paid,
      pending_amount: normalizedFormPayment.pending_amount,
      payment_state: normalizedFormPayment.payment_state,
      payment_conclusion: normalizedFormPayment.payment_conclusion
    };
    this.state.selectedInvoice.invoice_number = this.ensureInvoiceNumber(this.state.selectedInvoice.invoice_number);
    if (!this.state.selectedInvoice.issue_date) this.state.selectedInvoice.issue_date = this.todayIso();
    this.state.selectedInvoice.invoice_date = this.state.selectedInvoice.issue_date;
    this.state.items = Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [];
    this.assignFormValues(this.state.selectedInvoice);
    this.hydrateInvoiceCustomerSection({ agreement: this.state.selectedAgreement || this.state.selectedInvoice || {}, company: this.state.selectedCompany || {}, contact: this.state.selectedContact || {} });
    this.renderItems(this.state.items);
    const summary = this.deriveCalculatedSummary(this.state.selectedInvoice, this.state.items, { preferInvoiceValues: true });
    this.state.selectedInvoice = this.normalizeInvoice({ ...this.state.selectedInvoice, ...summary });
    this.applyTotalsToForm(summary);
    this.syncPaymentFieldsInForm();
    this.syncPaymentConclusion(summary);
    this.renderInvoiceReceipts(this.state.selectedInvoice);
    if (this.state.selectedInvoice.id) this.refreshInvoiceReceipts(this.state.selectedInvoice.id, { force: true });
    E.invoiceForm.dataset.id = this.state.selectedInvoice.id || '';
    if (E.invoiceFormTitle) {
      E.invoiceFormTitle.textContent = this.state.selectedInvoice.id
        ? readOnly
          ? 'Invoice Details'
          : 'Edit Invoice'
        : 'Create Invoice';
    }
    const canSave = this.state.selectedInvoice.id
      ? Permissions.canUpdateInvoice()
      : Permissions.canCreateInvoice();
    if (E.invoiceFormDeleteBtn) E.invoiceFormDeleteBtn.style.display = !readOnly && this.state.selectedInvoice.id && Permissions.canDeleteInvoice() ? '' : 'none';
    const isIssuedLocked = isExistingInvoice && this.isIssuedInvoice(this.state.selectedInvoice);
    if (E.invoiceFormSaveBtn) E.invoiceFormSaveBtn.style.display = !readOnly && !isIssuedLocked && canSave ? '' : 'none';
    E.invoiceForm.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.id === 'invoiceFormInvoiceId') {
        el.disabled = true;
        return;
      }
      el.disabled = readOnly || isIssuedLocked;
    });
    if (E.invoiceFormOldPaidTotal) E.invoiceFormOldPaidTotal.readOnly = true;
    if (E.invoiceFormAmountPaid) E.invoiceFormAmountPaid.readOnly = true;
    if (E.invoiceFormPendingAmount) E.invoiceFormPendingAmount.readOnly = true;
    if (E.invoiceFormPaymentState) E.invoiceFormPaymentState.readOnly = true;
    if (E.invoiceAddAnnualRowBtn) E.invoiceAddAnnualRowBtn.style.display = readOnly || isIssuedLocked ? 'none' : '';
    if (E.invoiceAddOneTimeRowBtn) E.invoiceAddOneTimeRowBtn.style.display = readOnly || isIssuedLocked ? 'none' : '';
    if (E.invoiceAddCapabilityRowBtn) E.invoiceAddCapabilityRowBtn.style.display = readOnly || isIssuedLocked ? 'none' : '';
    if (E.invoiceFormIssuedHelperText) {
      E.invoiceFormIssuedHelperText.textContent = isIssuedLocked
        ? 'This invoice is issued and cannot be edited. Create a receipt to record payment.'
        : '';
      E.invoiceFormIssuedHelperText.style.display = isIssuedLocked ? '' : 'none';
    }
    this.ensureCatalogLoaded();
    E.invoiceFormModal.classList.add('open');
    E.invoiceFormModal.setAttribute('aria-hidden', 'false');
  },
  closeForm() {
    if (!E.invoiceFormModal || !E.invoiceForm) return;
    E.invoiceFormModal.classList.remove('open');
    E.invoiceFormModal.setAttribute('aria-hidden', 'true');
    E.invoiceForm.reset();
    E.invoiceForm.dataset.id = '';
    this.state.selectedInvoice = null;
    this.state.items = [];
    this.renderItems([]);
    this.renderInvoiceReceipts({ invoice_id: '' });
  },
  setFormBusy(value) {
    const busy = !!value;
    if (E.invoiceFormSaveBtn) E.invoiceFormSaveBtn.disabled = busy;
    if (E.invoiceFormDeleteBtn) E.invoiceFormDeleteBtn.disabled = busy;
    if (E.invoiceFormPreviewBtn) E.invoiceFormPreviewBtn.disabled = busy;
  },
  extractAgreementAndItems(response, fallbackId = '') {
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
      response?.agreement
    ];
    let agreement = null;
    let items = [];
    for (const rawCandidate of candidates) {
      const candidate = parseJsonIfNeeded(rawCandidate);
      if (!candidate) continue;

      if (Array.isArray(candidate)) {
        const first = candidate[0];
        if (!agreement && first && typeof first === 'object') {
          agreement = first;
        }
        if (!items.length && Array.isArray(first?.items)) {
          items = first.items;
        }
        continue;
      }

      if (typeof candidate !== 'object') continue;

      if (!agreement) {
        if (candidate.item && typeof candidate.item === 'object') agreement = candidate.item;
        else if (candidate.agreement && typeof candidate.agreement === 'object') agreement = candidate.agreement;
        else if (Array.isArray(candidate.data) && candidate.data[0] && typeof candidate.data[0] === 'object')
          agreement = candidate.data[0];
        else if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data))
          agreement = candidate.data;
        else if (candidate.agreement_id || candidate.agreement_number || candidate.agreement_title)
          agreement = candidate;
      }
      if (!items.length) {
        if (Array.isArray(candidate.items)) items = candidate.items;
        else if (Array.isArray(candidate.agreement_items)) items = candidate.agreement_items;
        else if (candidate.item && Array.isArray(candidate.item.items)) items = candidate.item.items;
        else if (candidate.agreement && Array.isArray(candidate.agreement.items)) items = candidate.agreement.items;
        else if (Array.isArray(candidate.data) && Array.isArray(candidate.data[0]?.items))
          items = candidate.data[0].items;
        else if (candidate.data && Array.isArray(candidate.data.items)) items = candidate.data.items;
      }
    }
    const agreementStatus = this.normalizeText(agreement?.status || '');
    const isSignedAgreement = !agreementStatus || agreementStatus.includes('signed');
    return {
      agreement: agreement || { agreement_id: fallbackId },
      items: isSignedAgreement && Array.isArray(items) ? items : []
    };
  },
  async hydrateFromAgreement(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) return;
    try {
      const response = await Api.getAgreement(id);
      const { agreement, items } = this.extractAgreementAndItems(response, id);
      const currentFormInvoice = this.collectFormValues().invoice;
      const pickAgreementValue = (...values) => {
        for (const value of values) {
          if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
        return '';
      };
      const mappedInvoice = this.normalizeInvoice({
        ...currentFormInvoice,
        agreement_id: id,
        issue_date: currentFormInvoice.issue_date || currentFormInvoice.invoice_date,
        customer_name: pickAgreementValue(agreement.customer_name, agreement.customerName, agreement.customer?.name),
        customer_legal_name: pickAgreementValue(
          agreement.customer_legal_name,
          agreement.customerLegalName,
          agreement.customer?.legal_name,
          agreement.customer?.legalName
        ),
        customer_address: pickAgreementValue(
          agreement.customer_address,
          agreement.customerAddress,
          agreement.customer?.address
        ),
        customer_contact_name: pickAgreementValue(
          agreement.customer_contact_name,
          agreement.customerContactName,
          agreement.customer?.contact_name,
          agreement.customer?.contactName
        ),
        customer_contact_email: pickAgreementValue(
          agreement.customer_contact_email,
          agreement.customerContactEmail,
          agreement.customer?.contact_email,
          agreement.customer?.contactEmail
        ),
        provider_legal_name: pickAgreementValue(
          agreement.provider_legal_name,
          agreement.providerLegalName,
          agreement.provider?.legal_name,
          agreement.provider?.legalName
        ),
        provider_address: pickAgreementValue(
          agreement.provider_address,
          agreement.providerAddress,
          agreement.provider?.address
        ),
        support_email: pickAgreementValue(
          agreement.support_email,
          agreement.supportEmail,
          agreement.provider_contact_email,
          agreement.providerContactEmail
        ),
        billing_frequency: pickAgreementValue(agreement.billing_frequency, agreement.billingFrequency),
        payment_term: pickAgreementValue(
          agreement.payment_term,
          agreement.payment_terms,
          agreement.paymentTerm,
          agreement.paymentTerms
        ),
        currency: pickAgreementValue(agreement.currency, agreement.customer?.currency),
        subtotal_subscription: pickAgreementValue(
          agreement.saas_total,
          agreement.saasTotal,
          agreement.subtotal_subscription,
          agreement.subtotalSubscription
        ),
        subtotal_one_time: pickAgreementValue(
          agreement.one_time_total,
          agreement.oneTimeTotal,
          agreement.subtotal_one_time,
          agreement.subtotalOneTime
        ),
        grand_total: pickAgreementValue(agreement.grand_total, agreement.grandTotal, agreement.invoice_total, agreement.invoiceTotal),
        invoice_total: pickAgreementValue(agreement.invoice_total, agreement.invoiceTotal, agreement.grand_total, agreement.grandTotal),
        subtotal_locations: pickAgreementValue(
          agreement.subtotal_locations,
          agreement.subtotalLocations,
          agreement.saas_total,
          agreement.saasTotal
        ),
        received_amount: pickAgreementValue(agreement.received_amount, agreement.receivedAmount, agreement.amount_paid, agreement.amountPaid, 0),
        pending_amount: pickAgreementValue(agreement.pending_amount, agreement.pendingAmount),
        payment_state: pickAgreementValue(agreement.payment_state, agreement.paymentState),
        payment_conclusion: pickAgreementValue(agreement.payment_conclusion, agreement.paymentConclusion),
        amount_in_words: pickAgreementValue(agreement.amount_in_words, agreement.amountInWords),
        notes: agreement.notes
      });
      // Keep explicit user-entered invoice/due dates when hydrating from agreement.
      if (String(currentFormInvoice.issue_date || '').trim()) mappedInvoice.issue_date = currentFormInvoice.issue_date;
      if (String(currentFormInvoice.due_date || '').trim()) mappedInvoice.due_date = currentFormInvoice.due_date;
      mappedInvoice.invoice_number = this.ensureInvoiceNumber(mappedInvoice.invoice_number);
      const fullCompany = await this.getFullCompanyRecord(agreement.company_id || agreement.companyId || agreement.company || null);
      const fullContact = await this.getFullContactRecord(agreement.contact_id || agreement.contactId || agreement.contact || null);
      this.state.selectedAgreement = agreement || null;
      const agreementUuid = String(agreement?.id || agreement?.uuid || agreement?.agreement_uuid || agreement?.agreementUuid || '').trim();
      const agreementId = String(agreement?.agreement_id || agreement?.agreementId || agreement?.agreement_number || agreement?.agreementNumber || '').trim();
      const agreementNumber = String(agreement?.agreement_number || agreement?.agreementNumber || agreement?.agreement_id || agreement?.agreementId || '').trim();
      this.state.form = { ...(this.state.form || {}), selectedAgreement: agreement || null, agreementUuid, agreementId, agreementNumber };
      if (E.invoiceFormAgreementUuid) E.invoiceFormAgreementUuid.value = agreementUuid;
      if (E.invoiceFormAgreementId) E.invoiceFormAgreementId.value = agreementId;
      if (E.invoiceFormAgreementNumber) E.invoiceFormAgreementNumber.value = agreementNumber;
      this.state.selectedCompany = fullCompany || null;
      this.state.selectedContact = fullContact || null;
      this.assignFormValues(mappedInvoice);
      this.hydrateInvoiceCustomerSection({ agreement, company: fullCompany || {}, contact: fullContact || {} });
      const catalogLookup = await this.getProposalCatalogLookup();
      const normalizedItems = items.map(item => this.copyInvoiceItemFields(item, this.mergeCatalogItem(item, catalogLookup)));
      this.state.items = normalizedItems;
      this.renderItems(normalizedItems);
      const summary = this.deriveCalculatedSummary(mappedInvoice, normalizedItems);
      this.state.selectedInvoice = this.normalizeInvoice({ ...mappedInvoice, ...summary });
      this.applyTotalsToForm(summary);
      this.syncPaymentFieldsInForm();
      this.syncPaymentConclusion(summary);
    } catch (error) {
      UI.toast('Unable to auto-fill from agreement: ' + (error?.message || 'Unknown error'));
    }
  },
  async openInvoiceById(invoiceId, { readOnly = false, trigger = null } = {}) {
    const id = String(invoiceId || '').trim();
    if (!id) return;
    if (this.state.openingInvoiceIds.has(id)) return;
    this.state.openingInvoiceIds.add(id);
    this.setTriggerBusy(trigger, true);
    console.time('invoice-open');
    const localSummary = this.state.rows.find(row => this.invoiceDbId(row.id) === id);
    this.openInvoice(
      localSummary ? { ...this.emptyInvoice(), ...localSummary, id } : { id },
      [],
      { readOnly }
    );
    this.setFormDetailLoading(true);
    try {
      const cached = this.getCachedDetail(id);
      if (cached) {
        this.openInvoice(cached.invoice, cached.items, { readOnly });
        return;
      }
      const response = await Api.getInvoice(id);
      const { invoice, items } = this.extractInvoiceAndItems(response, id);
      const normalizedInvoice = this.normalizeInvoice(invoice || {});
      if (!String(normalizedInvoice.agreement_number || '').trim() && String(normalizedInvoice.agreement_uuid || '').trim()) {
        const agreementDisplay = await this.resolveAgreementDisplayByUuid(normalizedInvoice.agreement_uuid);
        if (agreementDisplay) normalizedInvoice.agreement_number = agreementDisplay;
      }
      this.setCachedDetail(id, normalizedInvoice, items);
      if (String(E.invoiceForm?.dataset.id || '').trim() === id) {
        this.openInvoice(normalizedInvoice, items, { readOnly });
      }
    } catch (error) {
      UI.toast('Unable to load invoice: ' + (error?.message || 'Unknown error'));
    } finally {
      this.state.openingInvoiceIds.delete(id);
      this.setTriggerBusy(trigger, false);
      this.setFormDetailLoading(false);
      console.timeEnd('invoice-open');
    }
  },
  async saveForm() {
    if (this.state.saveInFlight) return;
    const id = String(E.invoiceForm?.dataset.id || '').trim();
    const { invoice, items } = this.collectFormValues();
    if (!this.validateInvoice(invoice)) return;
    const summary = this.deriveCalculatedSummary(invoice, items);
    const normalizedInvoice = this.normalizeInvoice({
      ...invoice,
      ...summary,
      subtotal_subscription: summary.subtotal_locations,
      subtotal_one_time: summary.subtotal_one_time,
      invoice_total: summary.invoice_total
    });
    const payloadInvoice = this.buildInvoiceSavePayload(normalizedInvoice);
    this.assignFormValues(normalizedInvoice);
    const currentRecord = this.state.rows.find(row => this.invoiceDbId(row.id) === id) || {};
    if (id && this.isIssuedInvoice(currentRecord)) {
      UI.toast('Issued invoices cannot be edited. Create a receipt to record payment.');
      return;
    }
    const requestedDiscount = items.reduce((max, item) => Math.max(max, this.toNumberSafe(item.discount_percent)), 0);
    const workflowCheck = await window.WorkflowEngine?.enforceBeforeSave?.('invoices', currentRecord, {
      invoice_id: id,
      current_status: currentRecord?.status || '',
      requested_status: payloadInvoice.status || '',
      discount_percent: requestedDiscount,
      requested_changes: { invoice: payloadInvoice, items }
    });
    if (workflowCheck && !workflowCheck.allowed) {
      if (workflowCheck.pendingApproval === true && workflowCheck.approvalCreated === true) {
        UI.toast('Approval request submitted successfully.');
        return;
      }
      UI.toast(window.WorkflowEngine.composeDeniedMessage(workflowCheck, 'Invoice save blocked.'));
      return;
    }
    this.state.saveInFlight = true;
    this.setFormBusy(true);
    console.time('entity-save');
    try {
      let response;
      if (id) {
        if (!Permissions.canUpdateInvoice()) return UI.toast('You do not have permission to update invoices.');
        response = await Api.updateInvoice(id, payloadInvoice, items);
        UI.toast('Invoice updated.');
      } else {
        if (!Permissions.canCreateInvoice()) return UI.toast('You do not have permission to create invoices.');
        response = await Api.createInvoice(payloadInvoice, items);
        UI.toast('Invoice created.');
      }
      const parsed = this.extractInvoiceAndItems(response, id);
      const persistedItems = Array.isArray(parsed?.items) && parsed.items.length
        ? parsed.items.map(item => this.normalizeItem(item))
        : items;
      const persisted = this.normalizeInvoice({
        ...normalizedInvoice,
        ...(parsed?.invoice || {}),
        id: parsed?.invoice?.id || id || normalizedInvoice.id
      });
      const normalized = this.upsertLocalRow(persisted);
      this.setCachedDetail(normalized?.id || id, persisted, persistedItems);
      if (normalized?.id && this.state.selectedInvoice?.id === normalized.id) {
        this.state.selectedInvoice = normalized;
        this.state.items = persistedItems;
      }
      this.closeForm();
      window.dispatchEvent(new CustomEvent('clients:refresh-totals', { detail: { reason: 'invoice-saved' } }));
    } catch (error) {
      UI.toast('Unable to save invoice: ' + (error?.message || 'Unknown error'));
    } finally {
      console.timeEnd('entity-save');
      this.state.saveInFlight = false;
      this.setFormBusy(false);
    }
  },
  async deleteInvoice(invoiceId) {
    if (!Permissions.canDeleteInvoice()) return UI.toast('Insufficient permissions to delete invoices.');
    const id = String(invoiceId || '').trim();
    const displayInvoice =
      this.invoiceDisplayId(this.state.rows.find(row => this.invoiceDbId(row.id) === id)) || id;
    if (!id || !window.confirm(`Delete invoice ${displayInvoice}?`)) return;
    this.setFormBusy(true);
    try {
      await Api.deleteInvoice(id);
      delete this.state.detailCacheById[id];
      this.removeLocalRow(id);
      UI.toast('Invoice deleted.');
      this.closeForm();
    } catch (error) {
      UI.toast('Unable to delete invoice: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  async createReceiptFromInvoice(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return;
    if (!Permissions.canCreateReceiptFromInvoice()) {
      UI.toast('You do not have permission to create receipts.');
      return;
    }
    const currentRecord = this.state.rows.find(row => this.invoiceDbId(row.id) === id) || {};
    const workflowCheck = await window.WorkflowEngine?.enforceBeforeSave?.('receipts', currentRecord, {
      source_invoice_id: id,
      current_status: currentRecord?.status || '',
      requested_status: 'Issued',
      requested_changes: { create_from_invoice: true }
    });
    if (workflowCheck && !workflowCheck.allowed) {
      if (workflowCheck.pendingApproval === true && workflowCheck.approvalCreated === true) {
        UI.toast('Approval request submitted successfully.');
        return;
      }
      UI.toast(window.WorkflowEngine.composeDeniedMessage(workflowCheck, 'Receipt creation blocked.'));
      return;
    }
    const invoice =
      this.state.rows.find(row => this.invoiceDbId(row.id) === id) ||
      (String(this.state.selectedInvoice?.id || '').trim() === id ? this.state.selectedInvoice : null) ||
      null;
    if (!this.canCreateReceiptFromInvoice(invoice || {})) {
      UI.toast('Create Receipt is only available for issued invoices with outstanding balance.');
      return;
    }
    if (!window.Receipts?.openCreateFromInvoice) {
      UI.toast('Receipt form is not available right now. Please refresh and try again.');
      return;
    }
    await window.Receipts.openCreateFromInvoice({
      id,
      invoice_uuid: invoice?.id || invoice?.invoice_uuid || invoice?.invoiceUuid || '',
      invoice_id: invoice?.invoice_id || invoice?.invoiceId || '',
      invoice_number: invoice?.invoice_number || invoice?.invoiceNumber || '',
      agreement_uuid: invoice?.agreement_uuid || '',
      agreement_id: invoice?.agreement_id || '',
      agreement_number: invoice?.agreement_number || '',
      company_id: invoice?.company_id || '',
      company_name: invoice?.company_name || '',
      contact_id: invoice?.contact_id || '',
      contact_name: invoice?.contact_name || '',
      contact_email: invoice?.contact_email || '',
      contact_phone: invoice?.contact_phone || '',
      contact_mobile: invoice?.contact_mobile || '',
      client_id: invoice?.client_id || '',
      customer_name: invoice?.customer_name || '',
      customer_legal_name: invoice?.customer_legal_name || '',
      customer_address: invoice?.customer_address || '',
      currency: invoice?.currency || 'USD',
      invoice_total: invoice?.invoice_total ?? invoice?.grand_total ?? 0,
      amount_paid: invoice?.amount_paid ?? invoice?.received_amount ?? 0,
      balance_due: invoice?.balance_due ?? invoice?.pending_amount ?? Math.max(0, this.toNumberSafe(invoice?.invoice_total ?? 0) - this.toNumberSafe(invoice?.amount_paid ?? 0)),
      payment_status: invoice?.payment_status || invoice?.payment_state || ''
    });
  },
  async syncAfterReceiptMutation({ invoiceId, receipt = null } = {}) {
    const id = String(invoiceId || receipt?.invoice_id || '').trim();
    if (!id) return;
    if (receipt?.receipt_id) this.appendInvoiceReceipt(id, receipt);
    const selectedInvoiceId = String(E.invoiceForm?.dataset.id || '').trim();
    if (selectedInvoiceId === id) {
      await this.openInvoiceById(id, { readOnly: true });
      return;
    }
    await this.refreshInvoiceReceipts(id, { force: true });
    const summary = this.state.rows.find(row => this.invoiceDbId(row.id) === id);
    if (summary) {
      try {
        const response = await Api.getInvoice(id);
        const parsed = this.extractInvoiceAndItems(response, id);
        if (parsed?.invoice) this.upsertLocalRow(parsed.invoice);
      } catch (_error) {
        // Non-blocking summary refresh.
      }
    }
  },
  async previewInvoice(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return;
    if (!Permissions.canPreviewInvoice()) return UI.toast('You do not have permission to preview invoices.');
    try {
      const { invoiceUuid, invoice, items, receipts } = await this.loadInvoicePreviewData(id);
      const html = this.buildInvoicePreviewHtml(invoice, items, receipts);
      if (!String(html || '').trim()) return UI.toast('Unable to build invoice preview.');
      const brandedHtml = U.addIncheckDocumentLogo(U.formatPreviewHtmlDates(html));
      const previewLabel = String(invoice?.invoice_number || invoice?.invoice_id || invoiceUuid).trim();
      if (E.invoicePreviewTitle) E.invoicePreviewTitle.textContent = `Invoice Preview · ${previewLabel}`;
      if (E.invoicePreviewFrame) E.invoicePreviewFrame.srcdoc = brandedHtml;
      if (E.invoicePreviewModal) {
        E.invoicePreviewModal.classList.add('open');
        E.invoicePreviewModal.setAttribute('aria-hidden', 'false');
      }
    } catch (error) {
      UI.toast('Unable to preview invoice: ' + (error?.message || 'Unknown error'));
    }
  },
  closePreview() {
    if (!E.invoicePreviewModal) return;
    E.invoicePreviewModal.classList.remove('open');
    E.invoicePreviewModal.setAttribute('aria-hidden', 'true');
    if (E.invoicePreviewFrame) E.invoicePreviewFrame.srcdoc = '';
  },
  exportPreviewPdf() {
    const frame = E.invoicePreviewFrame;
    const previewTitle = String(E.invoicePreviewTitle?.textContent || 'Invoice Preview').trim();
    if (!frame || !String(frame.srcdoc || '').trim()) {
      UI.toast('Open invoice preview first to extract PDF.');
      return;
    }
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      UI.toast('Unable to access invoice preview content.');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    UI.toast(`Print dialog opened for ${previewTitle}. Choose "Save as PDF" to extract.`);
  },
  async openCreateFromAgreementResult(invoice) {
    const normalized = this.normalizeInvoice(invoice || {});
    if (typeof setActiveView === 'function') setActiveView('invoices');
    if (normalized?.id) this.upsertLocalRow(normalized);
    if (normalized.id) {
      await this.openInvoiceById(normalized.id, { readOnly: false });
    }
  },
  async openCreateFromAgreementTemplate(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) return;
    try {
      const response = await Api.createInvoiceFromAgreement(id);
      const { invoice, items } = this.extractInvoiceAndItems(response);
      const hasTemplateData = Boolean(invoice.invoice_id || invoice.customer_name || invoice.customer_legal_name || items.length);
      if (hasTemplateData) {
        const invoiceTemplate = this.normalizeInvoice({
          ...this.emptyInvoice(),
          ...invoice,
          agreement_uuid: String(invoice?.agreement_uuid || id || '').trim(),
          agreement_id: String(invoice?.agreement_id || invoice?.agreementId || invoice?.agreement_number || '').trim(),
          agreement_number: String(invoice?.agreement_number || invoice?.agreementNumber || invoice?.agreement_id || '').trim()
        });
        const catalogLookup = await this.getProposalCatalogLookup();
        const normalizedItems = (Array.isArray(items) ? items : []).map(item =>
          this.copyInvoiceItemFields(item, this.mergeCatalogItem(item, catalogLookup))
        );
        const summary = this.deriveCalculatedSummary(invoiceTemplate, normalizedItems);
        const hydratedTemplate = this.normalizeInvoice({ ...invoiceTemplate, ...summary });
        hydratedTemplate.invoice_number = this.ensureInvoiceNumber(hydratedTemplate.invoice_number || invoiceTemplate.invoice_number);
        if (hydratedTemplate.id) {
          this.openInvoice(hydratedTemplate, normalizedItems, { readOnly: false });
          return;
        }
        this.openInvoice(hydratedTemplate, normalizedItems, { readOnly: false });
        return;
      }
    } catch (_error) {
      // Fall back to local template hydration from the agreement record.
    }
    this.openInvoice(this.normalizeInvoice({ ...this.emptyInvoice(), agreement_uuid: id, agreement_id: '', agreement_number: '' }), [], { readOnly: false });
    await this.hydrateFromAgreement(id);
  },
  async refresh(force = false) {
    if (this.state.loading && !force) return;
    if (!Permissions.canViewInvoices()) {
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
      const status = String(this.state.status || '').trim();
      const search = String(this.state.search || '').trim();
      if (status && status !== 'All') filters.status = status;
      if (search) filters.search = search;
      const response = await Api.listInvoices(filters, {
        limit: this.state.limit,
        page: this.state.page,
        summary_only: true,
        forceRefresh: force
      });
      const normalized = this.extractListResult(response);
      this.state.rows = normalized.rows.map(row => this.normalizeInvoice(row));
      this.state.total = normalized.total;
      this.state.returned = normalized.returned;
      this.state.hasMore = normalized.hasMore;
      this.state.page = normalized.page;
      this.state.limit = normalized.limit;
      this.state.offset = normalized.offset;
    } catch (error) {
      this.state.rows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load invoices.';
    } finally {
      this.state.loading = false;
      this.applyFilters();
      this.renderFilters();
      this.render();
    }
  },
  init() {
    if (this.state.initialized) return;
    const bindState = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        this.state.page = 1;
        this.refresh(true);
      };
      if (el.tagName === 'INPUT') el.addEventListener('input', debounce(sync, 250));
      el.addEventListener('change', sync);
    };
    bindState(E.invoicesSearchInput, 'search');
    bindState(E.invoicesStatusFilter, 'status');
    if (E.invoiceSummary) {
      const activate = card => {
        if (!card) return;
        const filter = card.getAttribute('data-kpi-filter');
        if (!filter) return;
        this.applyKpiFilter(filter);
      };
      E.invoiceSummary.addEventListener('click', event => {
        activate(event.target?.closest?.('[data-kpi-filter]'));
      });
      E.invoiceSummary.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target?.closest?.('[data-kpi-filter]');
        if (!card) return;
        event.preventDefault();
        activate(card);
      });
    }

    if (E.invoicesRefreshBtn) E.invoicesRefreshBtn.addEventListener('click', () => this.refresh(true));
    if (E.invoicesCreateBtn) {
      E.invoicesCreateBtn.addEventListener('click', () => {
        if (!Permissions.canCreateInvoice()) return UI.toast('You do not have permission to create invoices.');
        this.openInvoice(this.emptyInvoice(), [], { readOnly: false });
      });
    }
    if (E.invoicesTbody) {
      E.invoicesTbody.addEventListener('click', event => {
        const trigger = event.target?.closest?.('button[data-invoice-view], button[data-invoice-edit], button[data-invoice-preview], button[data-invoice-create-receipt], button[data-invoice-delete]');
        if (!trigger) return;
        const viewId = trigger.getAttribute('data-invoice-view');
        if (viewId) return this.runRowAction(`view:${viewId}`, trigger, () => this.openInvoiceById(viewId, { readOnly: true, trigger }));
        const editId = trigger.getAttribute('data-invoice-edit');
        if (editId) return this.runRowAction(`edit:${editId}`, trigger, () => this.openInvoiceById(editId, { readOnly: false, trigger }));
        const previewId = trigger.getAttribute('data-invoice-preview');
        if (previewId) return this.runRowAction(`preview:${previewId}`, trigger, () => this.previewInvoice(previewId));
        const createReceiptId = trigger.getAttribute('data-invoice-create-receipt');
        if (createReceiptId) return this.runRowAction(`create-receipt:${createReceiptId}`, trigger, () => this.createReceiptFromInvoice(createReceiptId));
        const deleteId = trigger.getAttribute('data-invoice-delete');
        if (deleteId) return this.runRowAction(`delete:${deleteId}`, trigger, () => this.deleteInvoice(deleteId));
      });
    }
    if (E.invoiceForm) {
      E.invoiceForm.addEventListener('submit', event => {
        event.preventDefault();
        this.saveForm();
      });
      E.invoiceForm.addEventListener('click', event => {
        const removeBtn = event.target?.closest?.('button[data-item-remove]');
        if (!removeBtn) return;
        const section = removeBtn.getAttribute('data-item-remove');
        const index = Number(removeBtn.getAttribute('data-item-index'));
        if (!section || !Number.isInteger(index) || index < 0) return;
        const groups = this.groupedItems(this.collectItems());
        if (!groups[section]) return;
        groups[section] = groups[section].filter((_, idx) => idx !== index);
        const items = [...groups.annual_saas, ...groups.one_time_fee, ...groups.capability];
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
      E.invoiceForm.addEventListener('input', event => {
        if (['invoiceFormStatus', 'invoiceFormPaidNow', 'invoiceFormGrandTotal', 'invoiceFormOldPaidTotal', 'invoiceFormSubtotalSubscription', 'invoiceFormSubtotalOneTime'].includes(event.target?.id)) {
          this.syncPaymentFieldsInForm();
        }
        const field = event.target?.getAttribute('data-item-field');
        if (!field) return;
        const tr = event.target.closest('tr[data-item-row]');
        const section = tr?.getAttribute('data-item-row');
        if (!tr || !section || section === 'capability') {
          this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, this.collectItems()));
          this.syncPaymentFieldsInForm();
          return;
        }
        if (field === 'item_name') this.applyCatalogSelectionToRow(tr, section);
        const get = key => tr.querySelector(`[data-item-field="${key}"]`)?.value ?? '';
        const computed = this.computeCommercialRow({
          unit_price: get('unit_price'),
          discount_percent: get('discount_percent'),
          quantity: get('quantity')
        });
        const discountedEl = tr.querySelector('[data-item-display="discounted_unit_price"]');
        const lineTotalEl = tr.querySelector('[data-item-display="line_total"]');
        if (discountedEl) discountedEl.textContent = this.formatMoney(computed.discounted_unit_price);
        if (lineTotalEl) lineTotalEl.textContent = this.formatMoney(computed.line_total);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, this.collectItems()));
        this.syncPaymentFieldsInForm();
      });
      E.invoiceForm.addEventListener('change', event => {
        if (['invoiceFormStatus', 'invoiceFormPaidNow', 'invoiceFormGrandTotal', 'invoiceFormOldPaidTotal', 'invoiceFormSubtotalSubscription', 'invoiceFormSubtotalOneTime'].includes(event.target?.id)) {
          this.syncPaymentFieldsInForm();
        }
        const field = event.target?.getAttribute('data-item-field');
        if (field !== 'item_name') return;
        const tr = event.target.closest('tr[data-item-row]');
        const section = tr?.getAttribute('data-item-row');
        if (!tr || !section || section === 'capability') return;
        this.applyCatalogSelectionToRow(tr, section);
      });
    }
    if (E.invoiceAddAnnualRowBtn) {
      E.invoiceAddAnnualRowBtn.addEventListener('click', () => {
        const items = this.collectItems();
        items.push(this.normalizeItem({ section: 'annual_saas', quantity: 1 }));
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
    }
    if (E.invoiceAddOneTimeRowBtn) {
      E.invoiceAddOneTimeRowBtn.addEventListener('click', () => {
        const items = this.collectItems();
        items.push(this.normalizeItem({ section: 'one_time_fee', quantity: 1 }));
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
    }
    if (E.invoiceAddCapabilityRowBtn) {
      E.invoiceAddCapabilityRowBtn.addEventListener('click', () => {
        const items = this.collectItems();
        items.push(this.normalizeItem({ section: 'capability', capability_name: '', capability_value: '' }));
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
    }
    if (E.invoiceFormAgreementId) {
      E.invoiceFormAgreementId.readOnly = true;
      let agreementHydrateTimer = null;
      const hydrateAgreement = () => {
        if (agreementHydrateTimer) window.clearTimeout(agreementHydrateTimer);
        agreementHydrateTimer = window.setTimeout(() => {
          this.hydrateFromAgreement(E.invoiceFormAgreementId?.value || '');
        }, 250);
      };
      E.invoiceFormAgreementId.addEventListener('input', event => {
        event.preventDefault();
        hydrateAgreement();
      });
      E.invoiceFormAgreementId.addEventListener('change', () => {
        this.hydrateFromAgreement(E.invoiceFormAgreementId?.value || '');
      });
      E.invoiceFormAgreementId.addEventListener('blur', () => {
        this.hydrateFromAgreement(E.invoiceFormAgreementId?.value || '');
      });
    }
    if (E.invoiceFormCloseBtn) E.invoiceFormCloseBtn.addEventListener('click', () => this.closeForm());
    if (E.invoiceFormCancelBtn) E.invoiceFormCancelBtn.addEventListener('click', () => this.closeForm());
    if (E.invoiceFormDeleteBtn) E.invoiceFormDeleteBtn.addEventListener('click', () => this.deleteInvoice(E.invoiceForm?.dataset.id || ''));
    if (E.invoiceFormPreviewBtn) E.invoiceFormPreviewBtn.addEventListener('click', () => this.previewInvoice(E.invoiceForm?.dataset.id || ''));
    if (E.invoiceFormModal) E.invoiceFormModal.addEventListener('click', event => {
      if (event.target === E.invoiceFormModal) this.closeForm();
    });
    if (E.invoicePreviewExportPdfBtn) E.invoicePreviewExportPdfBtn.addEventListener('click', () => this.exportPreviewPdf());
    if (E.invoicePreviewCloseBtn) E.invoicePreviewCloseBtn.addEventListener('click', () => this.closePreview());
    if (E.invoicePreviewModal) E.invoicePreviewModal.addEventListener('click', event => {
      if (event.target === E.invoicePreviewModal) this.closePreview();
    });

    this.state.initialized = true;
    this.renderCatalogOptionLists();
  }
};

window.Invoices = Invoices;
