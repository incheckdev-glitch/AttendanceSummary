const Invoices = {
  canUseAdminOverride() {
    return Boolean(window.AdminOverride?.canOverride?.() || Permissions?.isAdminLike?.());
  },
  applyAdminOverrideBanner(message = '') {
    if (!this.canUseAdminOverride() || !E.invoiceForm) return;
    window.AdminOverride?.applyBanner?.(E.invoiceForm, {
      active: true,
      message: message || 'Admin Override Mode: this invoice can be edited even if it is issued, paid, or normally locked.'
    });
  },
  logAdminOverride(action = 'invoice_override', oldValues = null, newValues = null) {
    if (!this.canUseAdminOverride()) return;
    const recordId = String(E.invoiceForm?.dataset?.id || newValues?.id || newValues?.invoice_id || '').trim();
    window.AdminOverride?.logOverride?.({
      resource: 'invoices',
      recordId,
      action,
      oldValues,
      newValues,
      reason: 'Admin override from Invoices module'
    });
  },
  invoiceFields: [
    'invoice_id',
    'invoice_number',
    'agreement_uuid',
    'agreement_id',
    'client_id',
    'company_id',
    'company_name',
    'contact_id',
    'contact_name',
    'contact_email',
    'contact_phone',
    'contact_mobile',
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
    'payment_term_custom',
    'payment_schedule_mode',
    'is_poc',
    'poc_location_count',
    'poc_license_count',
    'poc_license_months',
    'poc_service_start_date',
    'poc_service_end_date',
    'poc_success_kpis',
    'poc_conversion_commitment',
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
    'account_setup_billing_mode',
    'is_renewal',
    'invoice_type',
    'source_type',
    'renewal_status',
    'renewal_due_date',
    'renewed_from_agreement_id',
    'renewed_from_invoice_id',
    'renewed_from_invoice_item_id',
    'renewed_from_location_name',
    'renewal_batch_id',
    'renewal_notes',
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
    paymentScheduleByInvoiceId: {},
    paymentScheduleReminderUsers: [],
    paymentScheduleReminderUsersLoaded: false,
    openingInvoiceIds: new Set(),
    loadingInvoiceReceiptIds: new Set(),
    rowActionInFlight: new Set(),
    selectedAgreementItemIds: new Set(),
    accountSetupBillingMode: 'per_selected_locations',
    agreementInvoiceSelection: null
  },
  statusOptions: ['Draft', 'Issued', 'Sent', 'Not Paid', 'Partially Paid', 'Fully Paid', 'Overdue', 'Cancelled'],
  isRenewalInvoice(invoiceOrContext) {
    return Boolean(
      invoiceOrContext?.is_renewal
      || invoiceOrContext?.invoice_type === 'renewal'
      || invoiceOrContext?.source_type === 'renewal'
      || invoiceOrContext?.renewal_batch_id
    );
  },
  getDefaultPocSuccessKpis() {
    return 'POC success is confirmed when the agreed POC scope is completed for the selected locations, the customer validates the delivered monitoring/reporting output, users confirm operational acceptance, and no critical blocker remains open by the POC end date.';
  },
  getDefaultPocConversionCommitment() {
    return 'If the POC success KPIs are achieved, the customer agrees to proceed with the full commercial subscription/agreement.';
  },
  toNumberSafe(value) {
    return U.toMoneyNumber(value);
  },
  formatMoney(value) {
    return this.toNumberSafe(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  getInCheckBankDetails() {
    return {
      bank_name: 'WISE US Inc',
      account_name: 'InCheck 360 Holding B.V.',
      account_number: '367413263110026',
      routing_number: '084009519',
      swift_bic: 'TRWIUS35XXX',
      bank_address: '108 W 13th St Wilmington 19801 - USA'
    };
  },
  getValidPaymentTerms() {
    return ['Net 7', 'Net 14', 'Net 21', 'Net 30', 'Custom'];
  },
  normalizePaymentTerm(value = '') {
    const raw = String(value || '').trim();
    const lookup = {
      'net7': 'Net 7',
      'net 7': 'Net 7',
      'monthly': 'Net 7',
      'net14': 'Net 14',
      'net 14': 'Net 14',
      'quarterly': 'Net 14',
      'quartely': 'Net 14',
      'net21': 'Net 21',
      'net 21': 'Net 21',
      'semi-annually': 'Net 21',
      'semi annually': 'Net 21',
      'semiannual': 'Net 21',
      'semi-annual': 'Net 21',
      'net30': 'Net 30',
      'net 30': 'Net 30',
      'annually': 'Net 30',
      'annual': 'Net 30',
      'custom': 'Custom'
    };
    return lookup[raw.toLowerCase().replace(/\s+/g, ' ')] || (this.getValidPaymentTerms().includes(raw) ? raw : 'Net 30');
  },

  resolveInvoicePaymentTerm(invoice = {}, agreement = {}, options = {}) {
    const mode = String(options?.mode || '').trim().toLowerCase();
    const isExisting = mode === 'existing';
    const priority = isExisting
      ? [
        invoice?.payment_term,
        agreement?.payment_term,
        agreement?.payment_terms,
        'Net 30'
      ]
      : [
        invoice?.payment_term,
        agreement?.payment_term,
        agreement?.payment_terms,
        'Net 30'
      ];
    const chosen = priority.find(value => String(value || '').trim());
    return this.normalizePaymentTerm(chosen || 'Net 30');
  },
  getPaymentTermDisplay(value = '') {
    const term = this.normalizePaymentTerm(value);
    const map = {
      'Net 7': 'Monthly',
      'Net 14': 'Quarterly',
      'Net 21': 'Semi-Annually',
      'Net 30': 'Annually'
    };
    return term === 'Custom' ? 'Custom' : (map[term] || term);
  },
  normalizePaymentScheduleMode(value = '', paymentTerm = '') {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'manual') return 'manual';
    if (raw === 'auto') return 'auto';
    return this.normalizePaymentTerm(paymentTerm) === 'Custom' ? 'manual' : 'auto';
  },
  getCurrentPaymentScheduleMode() {
    return this.normalizePaymentScheduleMode(E.invoiceFormPaymentScheduleMode?.value, E.invoiceFormPaymentTerm?.value || this.state.selectedInvoice?.payment_term);
  },
  isManualPaymentSchedule() {
    return this.getCurrentPaymentScheduleMode() === 'manual';
  },
  lockInvoicePaymentTermField() {
    const el = E.invoiceFormPaymentTerm || document.getElementById('invoiceFormPaymentTerm');
    if (!el) return;
    el.value = this.normalizePaymentTerm(el.value || this.state.selectedInvoice?.payment_term || 'Net 30');
    el.disabled = false;
    if ('readOnly' in el) el.readOnly = false;
    el.classList.remove('readonly-field', 'locked-field');
    el.removeAttribute('aria-readonly');
    el.title = 'Invoice payment terms can be edited before saving or issuing.';
    this.syncPaymentTermsControls();
  },
  isReceiptWorkflowValidationUnavailable(value, includeTechnicalErrors = false) {
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
      if (this.isReceiptWorkflowValidationUnavailable(workflowCheck)) {
        console.warn('[Receipt] Workflow validation unavailable; continuing receipt save fallback.', workflowCheck);
        return { allowed: true, unavailable: true, fallback: true };
      }

      return workflowCheck;
    } catch (error) {
      if (this.isReceiptWorkflowValidationUnavailable(error, true)) {
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
  normalizeLocationKey(value) {
    return String(value || '').trim().toLowerCase();
  },
  normalizeTruthy(value) {
    if (typeof value === 'boolean') return value;
    const raw = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(raw);
  },
  toNullableNumber(value) {
    if (value === null || value === undefined) return null;
    const raw = String(value).replace(/,/g, '').trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
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
    try {
      const data = await window.CrmCompanyContactSelectors?.loadCompanySafe?.(companyId);
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
    const c = contact && typeof contact === 'object' ? contact : {};
    const first = String(c.first_name || c.firstName || '').trim();
    const last = String(c.last_name || c.lastName || '').trim();
    const full = `${first} ${last}`.trim();
    return full || String(c.contact_name || c.contactName || c.full_name || c.fullName || '').trim();
  },
  getCustomerLegalName(company = {}, record = {}) {
    return U.getCustomerLegalName(record, company);
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
    const creditNoteAmount = this.toNumberSafe(pickDefined(invoice.credit_note_amount, invoice.creditNoteAmount));
    const pendingInput = pickDefined(invoice.pending_amount, invoice.amount_due, invoice.balance_due);
    const pendingAmount = pendingInput === undefined
      ? Math.max(0, invoiceTotal - amountPaid - creditNoteAmount)
      : this.toNumberSafe(pendingInput);
    return {
      invoice_total: invoiceTotal,
      amount_paid: amountPaid,
      credit_note_amount: creditNoteAmount,
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
    const cumulativePaidAmount = normalized.length
      ? this.toNumberSafe(receiptsPaidAmount)
      : this.toNumberSafe(baselinePaid);
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
    const paymentTerm = this.resolveInvoicePaymentTerm(source, this.state.selectedAgreement || {}, { mode: source.id ? 'existing' : 'new' });
    const paymentScheduleMode = this.normalizePaymentScheduleMode(source.payment_schedule_mode, paymentTerm);
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
      agreement_uuid: String(source.agreement_uuid || '').trim() || null,
      agreement_id: String(source.agreement_id || '').trim() || null,
      agreement_number: String(source.agreement_number || '').trim() || null,
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
      payment_term: paymentTerm,
      payment_term_custom: String(source.payment_term_custom ?? source.payment_terms_custom ?? '').trim() || null,
      payment_schedule_mode: paymentTerm === 'Custom' ? 'manual' : paymentScheduleMode,
      is_poc: this.normalizeTruthy(source.is_poc),
      poc_location_count: this.normalizeTruthy(source.is_poc) ? this.toNullableNumber(source.poc_location_count) : null,
      poc_license_count: this.normalizeTruthy(source.is_poc) ? this.toNullableNumber(source.poc_license_count) : null,
      poc_license_months: this.normalizeTruthy(source.is_poc) ? this.toNullableNumber(source.poc_license_months) : null,
      poc_service_start_date: this.normalizeTruthy(source.is_poc) ? (this.normalizeDateInputValue(source.poc_service_start_date) || null) : null,
      poc_service_end_date: this.normalizeTruthy(source.is_poc) ? (this.normalizeDateInputValue(source.poc_service_end_date) || null) : null,
      poc_success_kpis: this.normalizeTruthy(source.is_poc) ? String(source.poc_success_kpis || '').trim() : null,
      poc_conversion_commitment: this.normalizeTruthy(source.is_poc) ? String(source.poc_conversion_commitment || '').trim() : null,
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
      notes: String(source.notes || '').trim() || null,
      account_setup_billing_mode: this.normalizeSetupBillingMode(source.account_setup_billing_mode || this.state.accountSetupBillingMode)
    };
  },
  getInvoiceScheduleStartDate(invoice = {}, options = {}) {
    const includeFormValue = options?.includeFormValue !== false;
    // First scheduled payment date is the invoice Due Date.
    // Other aliases are only compatibility fallbacks for old/imported data.
    return String(
      (includeFormValue ? E.invoiceFormDueDate?.value : '') ||
      invoice.due_date ||
      invoice.dueDate ||
      invoice.invoice_due_date ||
      invoice.invoiceDueDate ||
      invoice.payment_due_date ||
      invoice.paymentDueDate ||
      invoice.initial_due_date ||
      invoice.initialDueDate ||
      ''
    ).trim();
  },
  getInvoicePaymentScheduleConfig(paymentTerm = '') {
    const term = String(paymentTerm || '').trim().toLowerCase();

    if (term === 'net 7' || term === 'monthly') {
      return { intervalMonths: 1, count: 12 };
    }

    if (term === 'net 14' || term === 'quarterly') {
      return { intervalMonths: 3, count: 4 };
    }

    if (term === 'net 21' || term === 'semi-annually' || term === 'semi annually' || term === 'semiannually') {
      return { intervalMonths: 6, count: 2 };
    }

    return { intervalMonths: 12, count: 1 };
  },
  parseDateOnly(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;

    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3])
    };
  },
  formatDateOnlyInput(parts) {
    if (!parts) return '';
    const yyyy = String(parts.year).padStart(4, '0');
    const mm = String(parts.month).padStart(2, '0');
    const dd = String(parts.day).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },
  addMonthsDateOnly(value, monthsToAdd = 0) {
    const parts = this.parseDateOnly(value);
    if (!parts) return '';

    const originalDay = parts.day;
    const date = new Date(parts.year, parts.month - 1, originalDay, 12, 0, 0);
    date.setMonth(date.getMonth() + Number(monthsToAdd || 0));

    if (date.getDate() !== originalDay) {
      date.setDate(0);
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  },
  formatDateOnlyDisplay(value) {
    const parts = this.parseDateOnly(value);
    if (!parts) return '—';

    const date = new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);

    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    });
  },
  addMonthsPreserveDay(dateValue, monthsToAdd) {
    return this.addMonthsDateOnly(dateValue, monthsToAdd);
  },
  buildPreviewPaymentSchedule(invoice = {}, items = [], agreement = {}) {
    if (this.normalizePaymentScheduleMode(invoice.payment_schedule_mode, invoice.payment_term) === 'manual') return [];
    const paymentTerm = this.normalizePaymentTerm(
      invoice.payment_term ||
      invoice.paymentTerm ||
      agreement.payment_term ||
      agreement.payment_terms ||
      agreement.paymentTerm ||
      'Net 30'
    );

    if (paymentTerm === 'Custom') return [];

    const config = this.getInvoicePaymentScheduleConfig(paymentTerm);
    const startDate = this.getInvoiceScheduleStartDate(invoice, { includeFormValue: false });

    if (!startDate) return [];

    const total = this.toNumberSafe(
      invoice.grand_total ||
      invoice.grand_tota ||
      invoice.total_amount ||
      invoice.total ||
      invoice.invoice_total ||
      0
    );

    const count = Math.max(1, config.count);
    const baseAmount = Math.floor((total / count) * 100) / 100;
    let remaining = total;

    return Array.from({ length: count }).map((_, index) => {
      const dueDate = this.addMonthsDateOnly(startDate, index * config.intervalMonths);
      const scheduledAmount = index === count - 1 ? remaining : baseAmount;

      remaining = Number((remaining - scheduledAmount).toFixed(2));

      return this.normalizeScheduleRow({
        line_no: index + 1,
        schedule_no: index + 1,
        due_date: dueDate,
        payment_percent: total ? Number(((scheduledAmount / total) * 100).toFixed(2)) : 0,
        payment_percent: total ? Number(((scheduledAmount / total) * 100).toFixed(2)) : 0,
        scheduled_amount: Number(scheduledAmount.toFixed(2)),
        paid_amount: 0,
        balance_due: Number(scheduledAmount.toFixed(2)),
        status: this.isDateBeforeToday?.(dueDate) ? 'overdue' : 'scheduled',
        receipts: []
      });
    });
  },
  buildInvoicePaymentSchedule(invoice = {}, items = [], agreement = {}) {
    if (this.normalizePaymentScheduleMode(invoice.payment_schedule_mode, invoice.payment_term || agreement.payment_term) === 'manual' || this.normalizePaymentTerm(invoice.payment_term || agreement.payment_term) === 'Custom') return [];
    const startDate = this.getInvoiceScheduleStartDate(invoice);

    if (!startDate) return [];

    const config = this.getInvoicePaymentScheduleConfig(
      E.invoiceFormPaymentTerm?.value ||
      invoice.payment_term ||
      agreement.payment_term ||
      agreement.payment_terms ||
      'Net 30'
    );

    const total = this.toNumberSafe(
      invoice.grand_total ||
      invoice.grand_tota ||
      invoice.total_amount ||
      invoice.total ||
      E.invoiceFormGrandTotal?.value ||
      0
    );

    const count = Math.max(1, config.count);
    const baseAmount = Math.floor((total / count) * 100) / 100;
    let remaining = total;

    return Array.from({ length: count }).map((_, index) => {
      const dueDate = this.addMonthsDateOnly(startDate, index * config.intervalMonths);
      const scheduledAmount = index === count - 1 ? remaining : baseAmount;

      remaining = Number((remaining - scheduledAmount).toFixed(2));

      return this.normalizeScheduleRow({
        line_no: index + 1,
        schedule_no: index + 1,
        due_date: dueDate,
        payment_percent: total ? Number(((scheduledAmount / total) * 100).toFixed(2)) : 0,
        payment_percent: total ? Number(((scheduledAmount / total) * 100).toFixed(2)) : 0,
        scheduled_amount: Number(scheduledAmount.toFixed(2)),
        paid_amount: 0,
        balance_due: Number(scheduledAmount.toFixed(2)),
        status: this.isDateBeforeToday?.(dueDate) ? 'overdue' : 'scheduled',
        receipts: []
      });
    });
  },
  rebuildInvoicePaymentScheduleWithPayments(invoiceData = {}, invoiceItems = [], linkedAgreement = {}, oldRows = []) {
    const savedRows = (Array.isArray(oldRows) ? oldRows : []).map(row => this.normalizeInvoiceScheduleRow(row));
    if (savedRows.length) return savedRows;

    const rebuiltRows = this.buildInvoicePaymentSchedule(invoiceData, invoiceItems, linkedAgreement);
    return rebuiltRows.map(row => this.normalizeInvoiceScheduleRow(row));
  },
  shouldCalculateInvoiceSchedule(invoice = {}) {
    if (this.normalizePaymentScheduleMode(invoice?.payment_schedule_mode, invoice?.payment_term) === 'manual' || this.normalizePaymentTerm(invoice?.payment_term) === 'Custom') return false;
    const status = this.normalizeText(invoice?.status || invoice?.payment_status || invoice?.payment_state);
    return !String(invoice?.id || '').trim() || !status || status === 'draft';
  },
  syncPaymentTermsControls() {
    const term = this.normalizePaymentTerm(E.invoiceFormPaymentTerm?.value || this.state.selectedInvoice?.payment_term || 'Net 30');
    const isCustom = term === 'Custom';
    if (E.invoiceFormPaymentTermsCustomWrap) E.invoiceFormPaymentTermsCustomWrap.style.display = isCustom ? '' : 'none';
    if (E.invoiceFormPaymentScheduleMode) {
      const current = String(E.invoiceFormPaymentScheduleMode.value || '').trim().toLowerCase();
      if (isCustom && current !== 'manual') E.invoiceFormPaymentScheduleMode.value = 'manual';
      if (!current) E.invoiceFormPaymentScheduleMode.value = isCustom ? 'manual' : 'auto';
    }
    if (E.invoicePaymentScheduleAddRowBtn) E.invoicePaymentScheduleAddRowBtn.style.display = this.getCurrentPaymentScheduleMode() === 'manual' ? '' : 'none';
  },
  getInvoiceGrandTotalForSchedule() {
    const formTotal = this.toNumberSafe(E.invoiceFormGrandTotal?.value);
    if (formTotal) return formTotal;
    const selected = this.state.selectedInvoice || {};
    return this.toNumberSafe(selected.invoice_total || selected.grand_total || selected.total_amount || selected.total);
  },
  getManualPaymentScheduleDraftRows() {
    const parseIdArray = value => {
      const raw = String(value || '').trim();
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(id => String(id || '').trim()).filter(Boolean);
      } catch (_error) {
        // Fall back to comma-separated IDs below.
      }
      return raw.split(',').map(id => id.trim()).filter(Boolean);
    };
    const rows = [...(E.invoicePaymentScheduleTbody?.querySelectorAll?.('tr[data-manual-schedule-row]') || [])];
    return rows.map((tr, index) => this.normalizeInvoiceScheduleRow({
      id: tr.getAttribute('data-schedule-id') || '',
      invoice_id: this.state.selectedInvoice?.id || E.invoiceForm?.dataset.id || '',
      schedule_no: index + 1,
      due_date: tr.querySelector('[data-schedule-field="due_date"]')?.value || '',
      payment_percent: this.toNumberSafe(tr.querySelector('[data-schedule-field="payment_percent"]')?.value),
      scheduled_amount: this.toNumberSafe(tr.querySelector('[data-schedule-field="scheduled_amount"]')?.value),
      paid_amount: this.toNumberSafe(tr.querySelector('[data-schedule-field="paid_amount"]')?.value),
      status: tr.querySelector('[data-schedule-field="status"]')?.value || 'scheduled',
      schedule_label: this.normalizePaymentTerm(E.invoiceFormPaymentTerm?.value) === 'Custom' ? 'Custom' : undefined,
      receipt_ids: parseIdArray(tr.getAttribute('data-receipt-ids') || '')
    })).filter(row => row.due_date || row.payment_percent || row.scheduled_amount);
  },
  seedManualPaymentScheduleRows(rows = []) {
    const safeRows = (Array.isArray(rows) ? rows : []).map(row => this.normalizeInvoiceScheduleRow(row));
    if (safeRows.length) return safeRows;
    const total = this.getInvoiceGrandTotalForSchedule();
    const dueDate = this.getInvoiceScheduleStartDate(this.collectFormValues?.().invoice || this.state.selectedInvoice || {}) || this.todayIso?.() || '';
    return [this.normalizeInvoiceScheduleRow({ schedule_no: 1, due_date: dueDate, payment_percent: 100, scheduled_amount: total, paid_amount: 0, balance_due: total, status: this.isDateBeforeToday?.(dueDate) ? 'overdue' : 'scheduled', schedule_label: this.normalizePaymentTerm(E.invoiceFormPaymentTerm?.value) === 'Custom' ? 'Custom' : 'Payment 1' })];
  },
  recalculateManualScheduleRow(tr, changedField = '') {
    if (!tr) return;
    const total = this.getInvoiceGrandTotalForSchedule();
    const percentEl = tr.querySelector('[data-schedule-field="payment_percent"]');
    const amountEl = tr.querySelector('[data-schedule-field="scheduled_amount"]');
    if (!percentEl || !amountEl || total <= 0) return;
    if (changedField === 'scheduled_amount') {
      const amount = this.toNumberSafe(amountEl.value);
      percentEl.value = ((amount / total) * 100).toFixed(2);
    } else {
      const percent = this.toNumberSafe(percentEl.value);
      amountEl.value = ((total * percent) / 100).toFixed(2);
    }
  },
  addManualPaymentScheduleRow(row = {}) {
    const existing = this.getManualPaymentScheduleDraftRows();
    const nextNo = existing.length + 1;
    const dueDate = row.due_date || this.getInvoiceScheduleStartDate(this.collectFormValues?.().invoice || this.state.selectedInvoice || {}) || '';
    const newRow = this.normalizeInvoiceScheduleRow({ schedule_no: nextNo, due_date: dueDate, payment_percent: 0, scheduled_amount: 0, paid_amount: 0, status: this.isDateBeforeToday?.(dueDate) ? 'overdue' : 'scheduled', schedule_label: this.normalizePaymentTerm(E.invoiceFormPaymentTerm?.value) === 'Custom' ? 'Custom' : `Payment ${nextNo}`, ...row });
    this.renderInvoicePaymentSchedule([...existing, newRow], { manual: true });
  },
  validateManualPaymentSchedule(invoice = {}) {
    if (this.normalizePaymentScheduleMode(invoice.payment_schedule_mode, invoice.payment_term) !== 'manual') return true;
    const rows = this.getManualPaymentScheduleDraftRows();
    const total = this.toNumberSafe(invoice.invoice_total || invoice.grand_total || E.invoiceFormGrandTotal?.value);
    const percentTotal = rows.reduce((sum, row) => sum + this.toNumberSafe(row.payment_percent), 0);
    const amountTotal = rows.reduce((sum, row) => sum + this.toNumberSafe(row.scheduled_amount), 0);
    const valid = rows.length > 0 && Math.abs(percentTotal - 100) <= 0.01 && Math.abs(amountTotal - total) <= 0.01;
    if (!valid) {
      UI.toast('Scheduled payments must total 100% and match the invoice total.');
      return false;
    }
    return true;
  },
  refreshPaymentSchedule() {
    this.syncPaymentTermsControls();
    const selectedInvoice = this.state.selectedInvoice || {};
    if (this.getCurrentPaymentScheduleMode() === 'manual') {
      const currentRows = this.getManualPaymentScheduleDraftRows();
      const savedRows = this.getInvoicePaymentScheduleRows(selectedInvoice?.id);
      this.renderInvoicePaymentSchedule(this.seedManualPaymentScheduleRows(currentRows.length ? currentRows : savedRows), { manual: true });
      return;
    }
    const savedRows = this.getInvoicePaymentScheduleRows(selectedInvoice?.id);
    if (savedRows.length) {
      this.renderInvoicePaymentSchedule(savedRows);
      return;
    }
    if (!this.shouldCalculateInvoiceSchedule(selectedInvoice)) {
      this.renderInvoicePaymentSchedule([]);
      return;
    }
    const invoiceData = this.collectFormValues().invoice || selectedInvoice;
    const invoiceItems = this.collectItems();
    const linkedAgreement = this.state.selectedAgreement || {};
    const scheduleRows = this.buildInvoicePaymentSchedule(invoiceData, invoiceItems, linkedAgreement);
    this.renderInvoicePaymentSchedule(scheduleRows);
  },
  getInvoiceScheduleCacheKey(invoiceId) {
    return String(invoiceId || '').trim();
  },
  getInvoicePaymentScheduleRows(invoiceId) {
    const key = this.getInvoiceScheduleCacheKey(invoiceId);
    return key ? (this.state.paymentScheduleByInvoiceId[key] || []) : [];
  },
  setInvoicePaymentScheduleRows(invoiceId, rows = []) {
    const key = this.getInvoiceScheduleCacheKey(invoiceId);
    if (!key) return;
    this.state.paymentScheduleByInvoiceId[key] = Array.isArray(rows) ? rows : [];
  },
  clearInvoiceScheduleCache(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return;
    delete this.state.detailCacheById[id];
    delete this.state.paymentScheduleByInvoiceId[id];
    try {
      localStorage.removeItem(`invoice_${id}`);
      localStorage.removeItem(`invoice_schedule_${id}`);
    } catch (_error) {
      // Ignore storage sandbox/quota failures.
    }
  },
  normalizeInvoiceScheduleRow(row = {}) {
    const parseIdArray = value => {
      if (Array.isArray(value)) return value.map(id => String(id || '').trim()).filter(Boolean);
      const raw = String(value || '').trim();
      if (!raw) return [];
      if (raw.startsWith('[')) {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed.map(id => String(id || '').trim()).filter(Boolean) : [];
        } catch (_error) {
          return [];
        }
      }
      return raw.split(',').map(id => id.trim()).filter(Boolean);
    };
    const scheduled = this.toNumberSafe(row.scheduled_amount);
    const paid = this.toNumberSafe(row.paid_amount ?? row.amount_paid);
    const scheduleNo = Number(row.schedule_no || row.no || 0) || 0;
    const label = String(row.schedule_label || row.label || `Payment ${scheduleNo || ''}`.trim()).trim();
    return {
      id: String(row.id || '').trim(),
      invoice_id: String(row.invoice_id || '').trim(),
      schedule_no: scheduleNo,
      label,
      due_date: this.normalizeDateInputValue(row.due_date || row.dueDate),
      payment_percent: this.toNumberSafe(row.payment_percent ?? row.percent ?? row.paymentPercent),
      scheduled_amount: scheduled,
      paid_amount: paid,
      balance_due: this.toNumberSafe(row.balance_due ?? Math.max(0, scheduled - paid)),
      status: String(row.status || '').trim() || 'unpaid',
      schedule_label: label,
      receipt_ids: parseIdArray(row.receipt_ids),
      reminder_enabled: row.reminder_enabled === true || String(row.reminder_enabled || '').trim().toLowerCase() === 'true',
      reminder_days: this.normalizeReminderDays(row.reminder_days),
      reminder_user_ids: this.normalizeReminderUserIds(row.reminder_user_ids),
      reminder_note: String(row.reminder_note || '').trim(),
      reminder_updated_at: row.reminder_updated_at || null,
      reminder_updated_by: row.reminder_updated_by || null
    };
  },
  normalizeScheduleRow(row = {}) {
    return this.normalizeInvoiceScheduleRow(row);
  },
  normalizeReminderDays(value) {
    const allowed = new Set([30, 14, 7]);
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    const days = [...new Set(source.map(day => Number(day)).filter(day => allowed.has(day)))];
    return days.length ? days : [30, 14, 7];
  },
  normalizeReminderUserIds(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(source.map(id => String(id || '').trim()).filter(Boolean))];
  },
  async ensurePaymentScheduleReminderUsers() {
    if (this.state.paymentScheduleReminderUsersLoaded) return this.state.paymentScheduleReminderUsers;
    const normalizeUser = row => {
      const id = String(row?.id || row?.user_id || row?.profile_id || '').trim();
      if (!id) return null;
      const name = String(row?.name || row?.full_name || row?.display_name || row?.username || row?.email || id).trim();
      const email = String(row?.email || '').trim();
      const active = row?.is_active !== false && row?.active !== false;
      return active ? { id, name, email } : null;
    };
    try {
      const client = window.SupabaseClient?.getClient?.() || window.supabase || null;
      if (client?.from) {
        const { data, error } = await client
          .from('profiles')
          .select('id,name,full_name,display_name,username,email,is_active,active')
          .order('name', { ascending: true, nullsFirst: false })
          .limit(1000);
        if (error) throw error;
        this.state.paymentScheduleReminderUsers = (Array.isArray(data) ? data : []).map(normalizeUser).filter(Boolean);
      } else {
        const response = await Api.requestWithSession('users', 'list', { limit: 1000 });
        const rows = this.extractRows(response);
        this.state.paymentScheduleReminderUsers = rows.map(normalizeUser).filter(Boolean);
      }
      this.state.paymentScheduleReminderUsersLoaded = true;
    } catch (error) {
      console.warn('[invoices] unable to load reminder users', error);
      this.state.paymentScheduleReminderUsers = [];
      this.state.paymentScheduleReminderUsersLoaded = true;
    }
    return this.state.paymentScheduleReminderUsers;
  },
  renderReminderUserOptions(selected = []) {
    const selectedSet = new Set(this.normalizeReminderUserIds(selected));
    return (this.state.paymentScheduleReminderUsers || []).map(user => {
      const label = user.email ? `${user.name} (${user.email})` : user.name;
      return `<option value="${U.escapeHtml(user.id)}" ${selectedSet.has(user.id) ? 'selected' : ''}>${U.escapeHtml(label)}</option>`;
    }).join('');
  },
  collectScheduleReminderPayload(rowEl) {
    const scheduleId = String(rowEl?.dataset?.scheduleId || '').trim();
    const selectedDays = [...rowEl.querySelectorAll('[data-reminder-day]:checked')].map(input => Number(input.value)).filter(Boolean);
    return {
      schedule_id: scheduleId,
      reminder_enabled: rowEl.querySelector('[data-reminder-enabled]')?.checked === true,
      reminder_days: this.normalizeReminderDays(selectedDays),
      reminder_user_ids: [...rowEl.querySelectorAll('[data-reminder-users] option:checked')].map(option => String(option.value || '').trim()).filter(Boolean)
    };
  },
  async savePaymentScheduleReminder(rowEl) {
    const payload = this.collectScheduleReminderPayload(rowEl);
    if (!payload.schedule_id) return UI.toast('Save the invoice payment schedule before configuring reminders.');
    try {
      const response = await Api.updateInvoicePaymentScheduleReminder(payload);
      const updated = this.normalizeInvoiceScheduleRow(response?.data || response || payload);
      const invoiceId = String(updated.invoice_id || this.state.selectedInvoice?.id || '').trim();
      const rows = this.getInvoicePaymentScheduleRows(invoiceId).map(row => String(row.id || '').trim() === payload.schedule_id ? { ...row, ...updated } : row);
      this.setInvoicePaymentScheduleRows(invoiceId, rows);
      if (this.state.selectedInvoice) {
        this.state.selectedInvoice.payment_schedule_rows = rows;
        this.state.selectedInvoice.payment_schedule = rows;
      }
      this.renderInvoicePaymentSchedule(rows);
      UI.toast('Payment reminder settings saved.');
    } catch (error) {
      console.warn('[invoices] unable to save payment reminder settings', error);
      UI.toast(String(error?.message || 'Unable to save payment reminder settings.'));
    }
  },
  async loadInvoicePaymentSchedule(invoiceId, { forceCreate = false } = {}) {
    const id = String(invoiceId || '').trim();
    if (!id) return [];
    try {
      let response = await Api.getInvoicePaymentSchedule(id);
      let rows = this.extractRows(response).map(row => this.normalizeInvoiceScheduleRow(row));
      const invoiceData = this.state.selectedInvoice || {};
      if (!rows.length && forceCreate && this.shouldCalculateInvoiceSchedule(invoiceData)) {
        response = await Api.createInvoicePaymentSchedule(id, false);
        rows = this.extractRows(response).map(row => this.normalizeInvoiceScheduleRow(row));
      }
      const displayRows = rows.length
        ? rows
        : (this.shouldCalculateInvoiceSchedule(invoiceData)
          ? this.buildInvoicePaymentSchedule(invoiceData, this.state.items || [], this.state.selectedAgreement || {})
          : []);
      if (this.state.selectedInvoice && String(this.state.selectedInvoice.id || '').trim() === id) {
        this.state.selectedInvoice.payment_schedule_rows = rows;
        this.state.selectedInvoice.payment_schedule = rows.length ? rows : displayRows;
      }
      this.setInvoicePaymentScheduleRows(id, displayRows);
      this.renderInvoicePaymentSchedule(displayRows);
      return displayRows;
    } catch (error) {
      console.warn('[invoices] unable to load payment schedule', error);
      this.renderInvoicePaymentSchedule([]);
      return [];
    }
  },
  renderInvoicePaymentSchedule(rows = this.getInvoicePaymentScheduleRows(this.state.selectedInvoice?.id), options = {}) {
    const tbody = E.invoicePaymentScheduleTbody;
    if (!tbody) return;
    const safeRows = (Array.isArray(rows) ? rows : []).map(row => this.normalizeScheduleRow(row));
    const manualMode = options.manual === true || this.getCurrentPaymentScheduleMode() === 'manual';
    if (E.invoicePaymentScheduleState) {
      E.invoicePaymentScheduleState.textContent = safeRows.length ? `${safeRows.length} scheduled payment${safeRows.length === 1 ? '' : 's'}.` : 'No payment schedule found yet.';
    }
    if (!safeRows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">No payment schedule found.</td></tr>';
      return;
    }
    const currency = String(this.state.selectedInvoice?.currency || E.invoiceFormCurrency?.value || 'USD').trim().toUpperCase();
    const money = value => `${currency} ${this.toNumberSafe(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (!this.state.paymentScheduleReminderUsersLoaded) {
      this.ensurePaymentScheduleReminderUsers().then(() => {
        if (E.invoicePaymentScheduleTbody === tbody) this.renderInvoicePaymentSchedule(this.getInvoicePaymentScheduleRows(this.state.selectedInvoice?.id));
      });
    }
    tbody.innerHTML = safeRows
      .sort((a, b) => Number(a.schedule_no || 0) - Number(b.schedule_no || 0))
      .map(row => {
        const receipts = row.receipt_ids.length ? row.receipt_ids.map(id => U.escapeHtml(String(id))).join('<br>') : '—';
        if (manualMode) {
          return `<tr data-manual-schedule-row data-schedule-id="${U.escapeHtml(row.id)}" data-receipt-ids="${U.escapeAttr(JSON.stringify(row.receipt_ids || []))}">
            <td>${U.escapeHtml(String(row.schedule_no || ''))}</td>
            <td><input class="input" type="date" data-schedule-field="due_date" value="${U.escapeAttr(row.due_date || '')}"></td>
            <td><input class="input" type="number" step="0.01" min="0" max="100" data-schedule-field="payment_percent" value="${U.escapeAttr(String(this.toNumberSafe(row.payment_percent)))}"></td>
            <td><input class="input" type="number" step="0.01" min="0" data-schedule-field="scheduled_amount" value="${U.escapeAttr(String(this.toNumberSafe(row.scheduled_amount)))}"></td>
            <td>${U.escapeHtml(money(row.paid_amount))}<input type="hidden" data-schedule-field="paid_amount" value="${U.escapeAttr(String(this.toNumberSafe(row.paid_amount)))}"></td>
            <td>${U.escapeHtml(money(row.balance_due))}</td>
            <td>${U.escapeHtml(row.status || 'scheduled')}<input type="hidden" data-schedule-field="status" value="${U.escapeAttr(row.status || 'scheduled')}"></td>
            <td>${receipts}</td>
            <td><button type="button" class="btn ghost sm" data-remove-manual-schedule-row>Remove</button></td>
          </tr>`;
        }
        const reminderDays = this.normalizeReminderDays(row.reminder_days);
        const reminderDisabled = row.id ? '' : 'disabled';
        const userOptions = this.renderReminderUserOptions(row.reminder_user_ids);
        return `<tr data-schedule-id="${U.escapeHtml(row.id)}">
          <td>${U.escapeHtml(String(row.schedule_no || ''))}</td>
          <td>${U.escapeHtml(this.formatDateOnlyDisplay(row.due_date))}</td>
          <td>${U.escapeHtml(String(row.payment_percent || '—'))}${row.payment_percent ? '%' : ''}</td>
          <td>${U.escapeHtml(money(row.scheduled_amount))}</td>
          <td>${U.escapeHtml(money(row.paid_amount))}</td>
          <td>${U.escapeHtml(money(row.balance_due))}</td>
          <td>${U.escapeHtml(row.status || 'scheduled')}</td>
          <td>${receipts}</td>
          <td>
            <div class="payment-reminder-settings">
              <label class="checkline"><input type="checkbox" data-reminder-enabled ${row.reminder_enabled ? 'checked' : ''} ${reminderDisabled}> Reminder Enabled</label>
              <div class="payment-reminder-days">
                ${[30, 14, 7].map(day => `<label class="checkline"><input type="checkbox" value="${day}" data-reminder-day ${reminderDays.includes(day) ? 'checked' : ''} ${reminderDisabled}> ${day} days before</label>`).join('')}
              </div>
              <select class="select" data-reminder-users multiple size="3" ${reminderDisabled}>${userOptions || '<option disabled>Loading users…</option>'}</select>
              <button type="button" class="btn sm ghost" data-save-schedule-reminder ${reminderDisabled}>Save Reminder</button>
            </div>
          </td>
        </tr>`;
      })
      .join('');
    tbody.querySelectorAll('[data-save-schedule-reminder]').forEach(button => {
      button.addEventListener('click', event => this.savePaymentScheduleReminder(event.target.closest('tr')));
    });
    tbody.querySelectorAll('[data-schedule-field="payment_percent"], [data-schedule-field="scheduled_amount"]').forEach(input => {
      input.addEventListener('input', event => this.recalculateManualScheduleRow(event.target.closest('tr'), event.target.getAttribute('data-schedule-field')));
    });
    tbody.querySelectorAll('[data-remove-manual-schedule-row]').forEach(button => {
      button.addEventListener('click', event => {
        const rows = this.getManualPaymentScheduleDraftRows().filter((_, index) => index !== [...tbody.querySelectorAll('tr[data-manual-schedule-row]')].indexOf(event.target.closest('tr')));
        this.renderInvoicePaymentSchedule(rows.map((row, index) => ({ ...row, schedule_no: index + 1 })), { manual: true });
      });
    });
  },
  async recalculateInvoicePaymentSchedule(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return [];
    const invoice = this.state.selectedInvoice || this.state.rows.find(row => this.invoiceDbId(row.id) === id) || {};
    if (this.normalizePaymentScheduleMode(invoice.payment_schedule_mode, invoice.payment_term) === 'manual') return this.getInvoicePaymentScheduleRows(id);
    try {
      this.clearInvoiceScheduleCache(id);
      const response = await Api.recalculateInvoicePaymentSchedule(id);
      const rows = this.extractRows(response).map(row => this.normalizeInvoiceScheduleRow(row));
      this.setInvoicePaymentScheduleRows(id, rows);
      if (String(E.invoiceForm?.dataset.id || '').trim() === id) this.renderInvoicePaymentSchedule(rows);
      return rows;
    } catch (error) {
      console.warn('[invoices] unable to recalculate payment schedule', error);
      return [];
    }
  },
  async saveManualInvoicePaymentSchedule(invoiceId, invoice = {}) {
    const id = String(invoiceId || '').trim();
    if (!id || this.normalizePaymentScheduleMode(invoice.payment_schedule_mode, invoice.payment_term) !== 'manual') return [];
    const savedRowsById = new Map(this.getInvoicePaymentScheduleRows(id).map(row => [String(row.id || '').trim(), row]));
    const savedRowsByNo = new Map(this.getInvoicePaymentScheduleRows(id).map(row => [String(row.schedule_no || '').trim(), row]));
    const rows = this.getManualPaymentScheduleDraftRows().map((row, index) => {
      const existing = savedRowsById.get(String(row.id || '').trim()) || savedRowsByNo.get(String(row.schedule_no || index + 1).trim()) || {};
      const receiptIds = Array.isArray(existing.receipt_ids) && existing.receipt_ids.length ? existing.receipt_ids : (Array.isArray(row.receipt_ids) ? row.receipt_ids : []);
      const paidAmount = receiptIds.length ? this.toNumberSafe(existing.paid_amount ?? row.paid_amount) : 0;
      const scheduledAmount = this.toNumberSafe(row.scheduled_amount);
      return {
        ...row,
        invoice_id: id,
        schedule_no: index + 1,
        schedule_label: this.normalizePaymentTerm(invoice.payment_term) === 'Custom' ? 'Custom' : (row.schedule_label || `Payment ${index + 1}`),
        paid_amount: paidAmount,
        status: receiptIds.length && paidAmount >= scheduledAmount && scheduledAmount > 0 ? 'paid' : (this.isDateBeforeToday?.(row.due_date) ? 'overdue' : 'scheduled'),
        receipt_ids: receiptIds
      };
    });
    const saved = await Api.saveInvoicePaymentSchedule(id, rows, { payment_term: invoice.payment_term, payment_term_custom: invoice.payment_term_custom || '', payment_schedule_mode: 'manual' });
    const normalized = this.extractRows(saved).map(row => this.normalizeInvoiceScheduleRow(row));
    this.setInvoicePaymentScheduleRows(id, normalized);
    return normalized;
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
    normalized.payment_term = this.normalizePaymentTerm(
      normalized.payment_term || source.payment_term || source.paymentTerm || 'Net 30'
    );
    normalized.payment_term_custom = String(source.payment_term_custom ?? source.paymentTermCustom ?? source.payment_terms_custom ?? source.paymentTermsCustom ?? normalized.payment_term_custom ?? '').trim();
    normalized.payment_terms_custom = normalized.payment_term_custom;
    normalized.payment_schedule_mode = this.normalizePaymentScheduleMode(source.payment_schedule_mode ?? source.paymentScheduleMode ?? normalized.payment_schedule_mode, normalized.payment_term);
    normalized.issue_date = this.normalizeDateInputValue(normalized.issue_date || source.issue_date || source.issueDate || source.invoice_date || source.invoiceDate);
    normalized.due_date = this.normalizeDateInputValue(normalized.due_date || source.due_date || source.dueDate);
    normalized.is_poc = this.normalizeTruthy(source.is_poc ?? source.isPoc ?? normalized.is_poc);
    normalized.poc_location_count = this.toNullableNumber(source.poc_location_count ?? source.pocLocationCount ?? normalized.poc_location_count);
    normalized.poc_license_count = this.toNullableNumber(source.poc_license_count ?? source.pocLicenseCount ?? normalized.poc_license_count);
    normalized.poc_license_months = this.toNullableNumber(source.poc_license_months ?? source.pocLicenseMonths ?? normalized.poc_license_months);
    normalized.poc_service_start_date = this.normalizeDateInputValue(source.poc_service_start_date ?? source.pocServiceStartDate ?? normalized.poc_service_start_date);
    normalized.poc_service_end_date = this.normalizeDateInputValue(source.poc_service_end_date ?? source.pocServiceEndDate ?? normalized.poc_service_end_date);
    normalized.poc_success_kpis = String(source.poc_success_kpis ?? source.pocSuccessKpis ?? normalized.poc_success_kpis ?? '').trim();
    normalized.poc_conversion_commitment = String(source.poc_conversion_commitment ?? source.pocConversionCommitment ?? normalized.poc_conversion_commitment ?? '').trim();
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
  isMissingCreditNotesTableError(error) {
    const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    const code = String(error?.code || '').trim().toUpperCase();
    return code === '42P01' || code === 'PGRST205' || (message.includes('credit_notes') && (message.includes('does not exist') || message.includes('could not find')));
  },
  async loadCreditNotesForInvoicePreview(invoice = {}) {
    const invoiceData = invoice && typeof invoice === 'object' ? invoice : {};
    const client = this.requireSupabaseClient();
    const invoiceUuid = this.isUuid(invoiceData.id) ? String(invoiceData.id).trim() : (this.isUuid(invoiceData.invoice_id) ? String(invoiceData.invoice_id).trim() : '');
    const invoiceNumber = String(invoiceData.invoice_number || invoiceData.invoiceNumber || '').trim();
    const selectColumns = 'id,credit_note_id,credit_note_number,credit_note_date,description,credit_amount,currency,status,created_at,invoice_id,invoice_number';
    const loadByColumn = async (column, value) => {
      if (!value) return [];
      const { data, error } = await client
        .from('credit_notes')
        .select(selectColumns)
        .eq(column, value)
        .neq('status', 'cancelled')
        .order('credit_note_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    };
    const rows = [];
    if (invoiceUuid) rows.push(...await loadByColumn('invoice_id', invoiceUuid));
    if (invoiceNumber) rows.push(...await loadByColumn('invoice_number', invoiceNumber));
    return rows
      .filter((row, index, all) => all.findIndex(item => String(item.id || item.credit_note_number) === String(row.id || row.credit_note_number)) === index)
      .filter(row => !['cancelled','canceled','void','voided'].includes(String(row.status || '').trim().toLowerCase()));
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
    const canViewCreditNoteDetails = !window.Permissions || Permissions.canViewCreditNotes?.();
    const [byId, byNumber, scheduleResult] = await Promise.all([
      receiptQuery({ invoice_id: invoiceUuid }),
      invoiceNumber ? receiptQuery({ invoice_number: invoiceNumber }) : Promise.resolve({ data: [], error: null }),
      Api.getInvoicePaymentSchedule(invoiceUuid).catch(() => [])
    ]);
    const receiptsError = byId?.error || byNumber?.error;
    if (receiptsError) throw new Error(`Unable to load linked receipts: ${receiptsError.message || 'Unknown error'}`);
    const receiptRows = [...(Array.isArray(byId?.data) ? byId.data : []), ...(Array.isArray(byNumber?.data) ? byNumber.data : [])];
    let creditNotes = [];
    if (canViewCreditNoteDetails) {
      try {
        creditNotes = await this.loadCreditNotesForInvoicePreview(invoiceRow);
      } catch (error) {
        if (!this.isMissingCreditNotesTableError(error)) console.warn('Unable to load invoice credit notes', error);
        creditNotes = [];
      }
    }
    const creditNoteTotal = creditNotes.reduce((sum, row) => sum + this.toNumberSafe(row.credit_amount), 0);
    const normalizedInvoice = this.normalizeInvoice(invoiceRow);
    const normalizedSchedule = this.extractRows(scheduleResult).map(row => this.normalizeInvoiceScheduleRow(row));
    normalizedInvoice.payment_schedule_rows = normalizedSchedule;
    normalizedInvoice.payment_schedule = normalizedSchedule.length
      ? normalizedSchedule
      : (Array.isArray(normalizedInvoice.payment_schedule) ? normalizedInvoice.payment_schedule : []);
    normalizedInvoice.credit_note_amount = this.toNumberSafe(creditNoteTotal);
    const paymentSummary = this.summarizeReceiptPayments(normalizedInvoice.invoice_total || normalizedInvoice.grand_total, receiptRows || [], {
      baselinePaid: normalizedInvoice.amount_paid ?? normalizedInvoice.received_amount ?? normalizedInvoice.old_paid_total
    });
    normalizedInvoice.amount_paid = paymentSummary.amount_paid;
    normalizedInvoice.received_amount = paymentSummary.received_amount;
    normalizedInvoice.pending_amount = Math.max(0, this.toNumberSafe(normalizedInvoice.invoice_total || normalizedInvoice.grand_total) - paymentSummary.amount_paid - creditNoteTotal);
    return {
      invoiceUuid,
      invoice: normalizedInvoice,
      items: Array.isArray(itemRows) ? itemRows.map(item => this.normalizeItem(item)) : [],
      receipts: paymentSummary.normalizedReceipts,
      creditNotes,
      canViewCreditNoteDetails,
      paymentSchedule: normalizedSchedule
    };
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
  renderInvoiceFooterNote() {
    const autoGeneratedNote = 'This is an auto-generated system document and is valid without a manual signature unless otherwise required.';
    const contactNote = 'If you have any questions about this Invoice, please contact: info@incheck360.nl';
    return `<footer class="footer-note document-footer document-footer-note"><div>${U.escapeHtml(autoGeneratedNote)}</div><div>${U.escapeHtml(contactNote)}</div></footer>`;
  },
  buildInvoicePreviewHtml(invoice = {}, items = [], receipts = [], paymentScheduleRows = [], creditNotes = [], options = {}) {
    const invoiceData = invoice && typeof invoice === 'object' ? invoice : {};
    const canViewCreditNoteDetails = options.canViewCreditNoteDetails !== false && (!window.Permissions || Permissions.canViewCreditNotes?.());
    const normalizedItems = this.filterInvoiceCommercialItems(items).map((item, index) => {
      const normalized = this.normalizeItem(item);
      if (!normalized.line_no) normalized.line_no = index + 1;
      return normalized;
    });
    const currency = String(invoiceData.currency || 'USD').trim().toUpperCase();
    const money = value => {
      const amount = this.toNumberSafe(value);
      return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
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
    const hasCommercialItems = normalizedItems.length > 0;
    const subtotalLocations = this.toNumberSafe(
      hasCommercialItems ? itemTotals.subtotal_locations : (invoiceData.subtotal_locations ?? invoiceData.subtotal_subscription ?? 0)
    );
    const subtotalOneTime = this.toNumberSafe(hasCommercialItems ? itemTotals.subtotal_one_time : (invoiceData.subtotal_one_time ?? 0));
    const pickDefined = (...values) => values.find(value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === ''));
    const invoiceTotal = this.toNumberSafe(hasCommercialItems
      ? itemTotals.invoice_total
      : pickDefined(invoiceData.grand_total, invoiceData.total_amount, invoiceData.total, invoiceData.amount_due, invoiceData.invoice_total, 0));
    const grandAmountInWords = U.formatAmountInWords(invoiceTotal, currency);
    const receiptPaidAmount = Array.isArray(receipts) && receipts.length
      ? receipts.reduce((sum, receipt) => sum + this.toNumberSafe(receipt.amount_received ?? receipt.received_amount ?? receipt.paid_now), 0)
      : this.toNumberSafe(invoiceData.received_amount ?? invoiceData.amount_paid ?? invoiceData.old_paid_total);
    const paidAmount = this.toNumberSafe(receiptPaidAmount);
    const creditNoteAmount = this.toNumberSafe(invoiceData.credit_note_amount) || (Array.isArray(creditNotes) ? creditNotes.filter(row => !['cancelled','canceled','void','voided'].includes(String(row.status || '').trim().toLowerCase())).reduce((sum, row) => sum + this.toNumberSafe(row.credit_amount), 0) : 0);
    const pendingAmount = Math.max(0, invoiceTotal - paidAmount - creditNoteAmount);
    const paymentState = String(invoiceData.payment_state || '').trim() || U.calculatePaymentState(invoiceTotal, paidAmount);
    const isPoc = this.normalizeTruthy(invoiceData.is_poc ?? invoiceData.isPoc);
    const pocDetailsHtml = isPoc ? `
      <section class="info-grid" style="margin-top:14px;grid-template-columns:1fr;">
        <div class="info-box" style="min-height:auto;">
          <div class="info-head">POC DETAILS</div>
          <div class="info-body" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px;">
            <div><strong>POC:</strong> Yes</div>
            <div><strong>Number of Locations:</strong> ${textValue(invoiceData.poc_location_count)}</div>
            <div><strong>License / Month:</strong> ${textValue(invoiceData.poc_license_months)}</div>
            <div><strong>Service Start Date:</strong> ${dateValue(invoiceData.poc_service_start_date)}</div>
            <div><strong>Service End Date:</strong> ${dateValue(invoiceData.poc_service_end_date)}</div>
            <div style="grid-column:1 / -1;"><strong>POC Success KPIs:</strong><br>${textValue(invoiceData.poc_success_kpis || this.getDefaultPocSuccessKpis())}</div>
            <div style="grid-column:1 / -1;"><strong>Commercial Commitment:</strong><br>${textValue(invoiceData.poc_conversion_commitment || this.getDefaultPocConversionCommitment())}</div>
          </div>
        </div>
      </section>` : '';

    const subscriptionItems = normalizedItems.filter(item => this.isSubscriptionSection(item.section));
    const oneTimeItems = normalizedItems.filter(item => this.isOneTimeSection(item.section));

    const subscriptionRows = subscriptionItems.length
      ? subscriptionItems
          .map(item => {
            const computed = this.computeCommercialRow(item);
            return `<tr>
              <td>${textValue(item.location_name)}</td>
              <td>${this.renderDocumentItemCell(item)}</td>
              <td class="cell-right">${money(item.unit_price)}</td>
              <td class="cell-center">${item.quantity ? U.escapeHtml(String(item.quantity)) : '—'}</td>
              <td class="cell-center">${dateValue(item.service_start_date)}</td>
              <td class="cell-center">${dateValue(item.service_end_date)}</td>
              <td class="cell-center">${U.escapeHtml(String(this.toNumberSafe(item.discount_percent)))}%</td>
              <td class="cell-right">${money(computed.line_total)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="8" class="cell-center muted">No annual SaaS items found.</td></tr>';

    const oneTimeRows = oneTimeItems.length
      ? oneTimeItems
          .map(item => {
            const computed = this.computeCommercialRow(item);
            return `<tr>
              <td>${textValue(item.location_name)}</td>
              <td>${this.renderDocumentItemCell(item)}</td>
              <td class="cell-right">${money(item.unit_price)}</td>
              <td class="cell-center">${U.escapeHtml(String(this.toNumberSafe(item.discount_percent)))}%</td>
              <td class="cell-center">${item.quantity ? U.escapeHtml(String(item.quantity)) : '—'}</td>
              <td class="cell-right">${money(computed.line_total)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="6" class="cell-center muted">No one-time fee items found.</td></tr>';
    const linkedAgreement = this.state.selectedAgreement || {};
    const savedScheduleRows = (Array.isArray(paymentScheduleRows) ? paymentScheduleRows : [])
      .map(row => this.normalizeInvoiceScheduleRow(row))
      .filter(row => row.scheduled_amount || row.balance_due || row.schedule_no || row.due_date);
    const paymentTermForSchedule = this.normalizePaymentTerm(invoiceData.payment_term);
    const scheduleMode = this.normalizePaymentScheduleMode(invoiceData.payment_schedule_mode, paymentTermForSchedule);
    const scheduleRows = savedScheduleRows.length
      ? savedScheduleRows
      : (scheduleMode !== 'manual' && paymentTermForSchedule !== 'Custom' && this.shouldCalculateInvoiceSchedule(invoiceData)
        ? this.buildPreviewPaymentSchedule(invoiceData, normalizedItems, linkedAgreement)
        : []);
    const paymentScheduleHtml = scheduleRows.length
      ? scheduleRows
          .sort((a, b) => Number(a.schedule_no || 0) - Number(b.schedule_no || 0))
          .map(row => `<tr>
              <td class="cell-center">${textValue(row.schedule_no)}</td>
              <td class="cell-center">${dateValue(row.due_date)}</td>
              <td class="cell-center">${textValue(row.payment_percent ? `${row.payment_percent}%` : '—')}</td>
              <td class="cell-right">${money(row.scheduled_amount)}</td>
              <td class="cell-right">${money(row.paid_amount)}</td>
              <td class="cell-right">${money(row.balance_due)}</td>
              <td>${textValue(row.status)}</td>
            </tr>`)
          .join('')
      : '<tr><td colspan="7" class="cell-center muted">No payment schedule found.</td></tr>';

    const isDraftInvoice = this.normalizeText(invoiceData.status) === 'draft';
    const customerName = String(invoiceData.customer_legal_name || invoiceData.customer_name || invoiceData.client_name || '').trim();
    const customerAddress = String(invoiceData.customer_address || '').trim();
    const bank = this.getInCheckBankDetails();
    const paymentReference = invoiceData.invoice_number || invoiceData.invoiceNumber || invoiceData.invoice_id || invoiceData.id || '—';
    const paymentTermValue = this.normalizePaymentTerm(invoiceData.payment_term || this.state.selectedAgreement?.payment_term);
    const customPaymentTerms = String(invoiceData.payment_term_custom ?? invoiceData.payment_terms_custom ?? '').trim();
    const customPaymentTermsHtml = paymentTermValue === 'Custom' && customPaymentTerms
      ? `<section class="document-note-box custom-payment-terms-box"><h2>Custom Payment Terms</h2><div>${textValue(customPaymentTerms)}</div></section>`
      : '';
    const bankRows = [
      ['Bank Name', textValue(bank.bank_name)],
      ['Account Name', textValue(bank.account_name)],
      ['Account Number', textValue(bank.account_number)],
      ['Routing Number', textValue(bank.routing_number)],
      ['SWIFT / BIC', textValue(bank.swift_bic)],
      ['Bank Address', textValue(bank.bank_address)],
      ['Payment Reference', textValue(paymentReference)]
    ];

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice Preview</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { font-family: Inter, "Segoe UI", Arial, Helvetica, sans-serif; margin: 0; padding: 12mm 0; color: #111827; background: #eef2f7; overflow-x: hidden; }
      .invoice-preview-page,
      .invoice-document-page {
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
      .invoice-preview-page,
      .invoice-document-page { border: 1px solid #dbe3ed; box-shadow: 0 14px 34px rgba(15, 23, 42, 0.13); }
      .invoice-preview-page > :not(.draft-watermark),
      .invoice-document-page > :not(.draft-watermark) { position: relative; z-index: 1; }
      .document-body { flex: 1 0 auto; min-width: 0; }
      .draft-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; font-size: 92px; font-weight: 800; letter-spacing: 0.16em; color: #0f172a; opacity: 0.055; transform: rotate(-28deg); text-transform: uppercase; user-select: none; }
      .doc-header { border-bottom: 1px solid #d8e1ec; padding-bottom: 7mm; margin-bottom: 8mm; }
      .invoice-document-header { display: grid; grid-template-columns: 44mm minmax(0, 1fr) 62mm; align-items: center; gap: 6mm; width: 100%; max-width: 100%; margin: 0; }
      .invoice-document-logo { display: flex; align-items: center; justify-content: flex-start; height: 28mm; min-width: 0; margin: 0; padding: 0; position: static; }
      .invoice-document-logo .incheck360-doc-logo-wrap { float: none; display: flex; align-items: center; justify-content: flex-start; margin: 0; padding: 0; width: 40mm; max-width: 40mm; height: 24mm; max-height: 24mm; text-align: left; position: static; transform: none; }
      .invoice-document-logo img,
      .invoice-document-logo svg { display: block; max-width: 40mm; max-height: 24mm; width: auto; height: auto; object-fit: contain; object-position: left center; margin: 0; padding: 0; position: static; transform: none; }
      .invoice-document-title-wrap { display: flex; align-items: center; justify-content: center; height: 28mm; min-width: 0; margin: 0; padding: 0; text-align: center; }
      .invoice-document-title { margin: 0; font-size: 22px; line-height: 1; font-weight: 800; text-align: center; letter-spacing: 0.01em; color: #0b214a; }
      .invoice-document-summary { display: flex; align-items: center; justify-content: flex-end; height: 28mm; min-width: 0; margin: 0; padding: 0; position: static; }
      .invoice-document-summary .meta-box { width: 100%; max-width: 62mm; }
      .meta-box { border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; background: #fbfdff; min-width: 0; width: 100%; max-width: 62mm; }
      .meta-row { display: grid; grid-template-columns: 25mm minmax(0, 1fr); border-bottom: 1px solid #e3eaf3; }
      .meta-row:last-child { border-bottom: 0; }
      .meta-row > div { padding: 1.6mm 2mm; font-size: 10.5px; min-width: 0; overflow-wrap: break-word; }
      .meta-row .meta-key { background: #f5f8fc; font-weight: 700; color: #334155; border-right: 1px solid #e3eaf3; }
      .info-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 5mm; margin-top: 5mm; width: 100%; }
      .info-grid.info-grid-single { grid-template-columns: minmax(0, 1fr); }
      .info-box { border: 1px solid #d7e1ed; min-height: 28mm; border-radius: 6px; overflow: hidden; background: #fff; min-width: 0; page-break-inside: avoid; break-inside: avoid; }
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
      .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; page-break-inside: avoid; break-inside: avoid; }
      .totals-box { width: 96mm; max-width: 100%; border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; }
      .totals-row { display: flex; justify-content: space-between; gap: 10px; padding: 10px 12px; border-bottom: 1px solid #e3eaf3; font-size: 13px; }
      .totals-row:last-child { border-bottom: 0; }
      .totals-row span { min-width: 0; }
      .totals-row strong { text-align: right; overflow-wrap: anywhere; }
      .totals-row.grand { font-size: 15px; font-weight: 700; background: #edf4ff; color: #0b214a; }
      .document-note-box { width: 100%; max-width: 100%; margin-top: 12px; padding: 10px 12px; border: 1px solid #d7e1ed; border-radius: 6px; background: #fbfdff; color: #334155; page-break-inside: avoid; break-inside: avoid; }
      .document-note-box h2 { margin: 0 0 6px; padding: 0; border: 0; font-size: 13px; line-height: 1.25; font-weight: 800; color: #0b214a; letter-spacing: 0.02em; }
      .document-note-box div { font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
      .terms { margin-top: 16px; font-size: 12.5px; line-height: 1.6; border: 1px solid #d7e1ed; border-radius: 6px; padding: 12px; background: #fbfdff; overflow-wrap: anywhere; }
      .terms .strong { font-weight: 700; color: #0f172a; }
      .bank { margin-top: 18px; page-break-inside: avoid; break-inside: avoid; }
      .bank h3 { margin: 0 0 8px; font-size: 15px; letter-spacing: 0.04em; }
      .bank-box { border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; }
      .bank-row { display: grid; grid-template-columns: 45mm minmax(0, 1fr); border-bottom: 1px solid #e3eaf3; }
      .bank-row:last-child { border-bottom: 0; }
      .bank-row > div { padding: 7px 9px; font-size: 12px; min-width: 0; overflow-wrap: anywhere; }
      .bank-key { background: #f5f8fc; font-weight: 700; border-right: 1px solid #e3eaf3; }
      .invoice-payment-note {
        margin-top: 10px;
        padding: 8px 10px;
        font-size: 11.5px;
        color: #334155;
        border: 1px solid #d7e1ed;
        border-radius: 6px;
        background: #f8fafc;
      }
      .footer-note { position: static !important; margin-top: auto; padding-top: 10px; font-size: 11px; color: #64748b; border-top: 1px solid #e3eaf3; text-align: center; flex-shrink: 0; page-break-inside: avoid; break-inside: avoid; }
      @page { size: A4; margin: 12mm; }
      @media print {
        body { margin: 0; padding: 0; background: #fff; overflow: visible; }
        .invoice-preview-page,
        .invoice-document-page { width: auto; min-height: 273mm; margin: 0; padding: 0; box-shadow: none; page-break-after: auto; border: 0; overflow: visible; }
      }
    </style>
  </head>
  <body>
    <div class="invoice-preview-page invoice-document-page doc-sheet">
      ${isDraftInvoice ? '<div class="draft-watermark" aria-hidden="true">DRAFT</div>' : ''}
      <main class="document-body">
      <header class="doc-header">
        <section class="invoice-document-header">
          <div class="invoice-document-logo"><div data-incheck360-doc-logo-slot></div></div>
          <div class="invoice-document-title-wrap"><h1 class="invoice-document-title">Invoice</h1></div>
          <div class="invoice-document-summary">
            <div class="meta-box">
              <div class="meta-row"><div class="meta-key">Invoice #</div><div>${textValue(invoiceData.invoice_number || invoiceData.invoice_id)}</div></div>
              <div class="meta-row"><div class="meta-key">Invoice Date</div><div>${dateValue(invoiceData.issue_date || invoiceData.invoice_date)}</div></div>
              <div class="meta-row"><div class="meta-key">Due Date</div><div>${dateValue(invoiceData.due_date)}</div></div>
              <div class="meta-row"><div class="meta-key">Payment Terms</div><div>${textValue(paymentTermValue)}</div></div>
            </div>
          </div>
        </section>
      </header>

      <section class="info-grid info-grid-single">
        <div class="info-box">
          <div class="info-head">BILL TO</div>
          <div class="info-body">
            <div><strong>${textValue(customerName)}</strong></div>
            <div class="muted">${textValue(customerAddress)}</div>
          </div>
        </div>
      </section>

      ${customPaymentTermsHtml}

      ${pocDetailsHtml}

      <section class="section">
        <h2>SaaS Subscription Details</h2>
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
            ${subscriptionRows}
            <tr class="total-row">
              <td colspan="7" class="cell-right">Total SaaS / Subscription</td>
              <td class="cell-right">${money(subtotalLocations)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>One Time Fee Items</h2>
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
              <td class="cell-right">${money(subtotalOneTime)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      ${canViewCreditNoteDetails && Array.isArray(creditNotes) && creditNotes.length ? `<section class="section"><h2>Credit Notes</h2><table><thead><tr><th>Credit Note #</th><th>Date</th><th>Description</th><th class="cell-right">Amount</th></tr></thead><tbody>${creditNotes.map(note => `<tr><td>${textValue(note.credit_note_number || note.credit_note_id)}</td><td>${dateValue(note.credit_note_date)}</td><td>${textValue(note.description)}</td><td class="cell-right">${money(note.credit_amount)}</td></tr>`).join('')}</tbody></table></section>` : ''}

      <section class="totals-wrap">
        <div class="totals-box">
          <div class="totals-row"><span>One Time Fees</span><strong>${money(subtotalOneTime)}</strong></div>
          <div class="totals-row"><span>Subscription Fees</span><strong>${money(subtotalLocations)}</strong></div>
          <div class="totals-row grand"><span>Grand Total</span><strong>${money(invoiceTotal)}</strong></div>
          <div class="totals-row amount-in-words"><span>Grand Amount in Words:</span><strong>${textValue(grandAmountInWords)}</strong></div>
          <div class="totals-row"><span>Amount Paid</span><strong>${money(paidAmount)}</strong></div>
          <div class="totals-row"><span>Credit Notes</span><strong>${money(creditNoteAmount)}</strong></div>
          <div class="totals-row"><span>Balance Due</span><strong>${money(pendingAmount)}</strong></div>
          <div class="totals-row"><span>Payment State</span><strong>${textValue(paymentState)}</strong></div>
        </div>
      </section>

      <section class="section">
        <h2>Payment Schedule</h2>
        <table>
          <thead>
            <tr>
              <th style="width:11%">Payment #</th>
              <th style="width:16%">Due Date</th>
              <th style="width:9%">%</th>
              <th style="width:18%">Amount</th>
              <th style="width:16%">Paid</th>
              <th style="width:16%">Balance</th>
              <th style="width:14%">Status</th>
            </tr>
          </thead>
          <tbody>${paymentScheduleHtml}</tbody>
        </table>
      </section>

      <section class="bank">
        <h3>BANK DETAILS</h3>
        <div class="bank-box">
          ${bankRows
            .map(([label, value]) => `<div class="bank-row"><div class="bank-key">${U.escapeHtml(label)}</div><div>${value}</div></div>`)
            .join('')}
        </div>
        <div class="invoice-payment-note">
          <strong>Payment Note:</strong> All Bank/Transfer Charges to Be Covered by Client
        </div>
      </section>

      </main>
      ${this.renderInvoiceFooterNote()}
    </div>
  </body>
</html>`;
    return U.stripInternalDocumentLinks(html);
  },
  normalizeSection(value) {
    const raw = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!raw) return '';
    if (['subscription', 'annual', 'annual_saas', 'annual saas', 'saas', 'recurring'].includes(raw) || (raw.includes('annual') && (raw.includes('saas') || raw.includes('subscription') || raw.includes('renewal')))) return 'annual_saas';
    if (['one_time', 'one-time_fee', 'one_time_fee', 'one-time', 'one-time fee', 'one time fee', 'onetime', 'setup', 'non_recurring', 'non-recurring'].includes(raw))
      return 'one_time_fee';
    if (raw === 'capability') return 'capability';
    return raw;
  },
  isCapabilityItem(item = {}) {
    const normalized = item && typeof item === 'object' ? item : {};
    const section = this.normalizeSection(normalized.section || normalized.item_section || normalized.itemSection || normalized.type || normalized.item_type || normalized.itemType);
    return section === 'capability' || Boolean(String(normalized.capability_name || normalized.capabilityName || normalized.capability_value || normalized.capabilityValue || '').trim());
  },
  filterInvoiceCommercialItems(items = []) {
    return (Array.isArray(items) ? items : []).filter(item => !this.isCapabilityItem(item));
  },
  normalizeDateInputValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const parts = this.parseDateOnly(raw);
    if (parts) return this.formatDateOnlyInput(parts);
    return raw;
  },
  normalizeItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };
    let section = this.normalizeSection(
      pick(source.section, source.item_section, source.itemSection, source.type, source.item_type, source.itemType)
    );
    const normalizedLocationName = String(pick(source.location_name, source.locationName)).trim();
    const normalizedServiceStartDate = this.normalizeDateInputValue(pick(source.service_start_date, source.serviceStartDate));
    const normalizedServiceEndDate = this.normalizeDateInputValue(pick(source.service_end_date, source.serviceEndDate));
    const normalizedItemName = String(pick(source.item_name, source.itemName, source.name)).trim();
    if (!section && !this.isCapabilityItem(source)) {
      if (normalizedServiceStartDate || normalizedServiceEndDate || normalizedLocationName) section = 'annual_saas';
      else if (normalizedItemName) section = 'one_time_fee';
    }
    return {
      id: String(pick(source.id)).trim(),
      item_id: String(pick(source.item_id, source.itemId)).trim(),
      catalog_item_id: String(pick(source.catalog_item_id, source.catalogItemId)).trim(),
      section,
      line_no: this.toNumberSafe(pick(source.line_no, source.lineNo, source.line)) || 0,
      location_name: normalizedLocationName,
      location_address: String(pick(source.location_address, source.locationAddress)).trim(),
      service_start_date: normalizedServiceStartDate,
      service_end_date: normalizedServiceEndDate,
      item_name: normalizedItemName,
      description: String(pick(source.description, source.item_description, source.itemDescription, source.note, source.notes, source.catalog_note, source.catalogNote, source.catalog_description, source.catalogDescription)).trim(),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.toNumberSafe(pick(source.discount_percent, source.discountPercent)),
      discounted_unit_price: this.toNumberSafe(
        pick(source.discounted_unit_price, source.discountedUnitPrice, source.discounted_price, source.discountedPrice)
      ),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty, source.units)),
      line_total: this.toNumberSafe(pick(source.line_total, source.lineTotal, source.amount, source.total)),
      capability_name: String(pick(source.capability_name, source.capabilityName)).trim(),
      capability_value: String(pick(source.capability_value, source.capabilityValue)).trim(),
      notes: String(pick(source.notes)).trim(),
      source_agreement_item_id: String(pick(source.source_agreement_item_id, source.sourceAgreementItemId)).trim(),
      source_agreement_id: String(pick(source.source_agreement_id, source.sourceAgreementId)).trim(),
      invoice_status: String(pick(source.invoice_status, source.invoiceStatus)).trim(),
      invoiced_invoice_id: String(pick(source.invoiced_invoice_id, source.invoicedInvoiceId)).trim(),
      invoiced_at: String(pick(source.invoiced_at, source.invoicedAt)).trim()
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
      notes: String(pick(source.notes, source.note, source.description, source.item_description, source.catalog_note, source.catalog_description, source.internal_note)).trim(),
      description: String(pick(source.description, source.item_description, source.note, source.notes, source.catalog_note, source.catalog_description)).trim()
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
      description: base.description || catalogMatch?.description || catalogMatch?.notes || '',
      notes: base.notes || catalogMatch?.notes || ''
    });
    const hasDiscountedUnitPrice = invoiceItem?.discounted_unit_price !== undefined && invoiceItem?.discounted_unit_price !== null;
    const hasLineTotal = invoiceItem?.line_total !== undefined && invoiceItem?.line_total !== null;
    if (!hasDiscountedUnitPrice || !hasLineTotal) {
      const discountRatio =
        merged.discount_percent > 1 ? merged.discount_percent / 100 : Math.max(0, merged.discount_percent);
      const baseAmount = this.isSubscriptionSection(merged.section)
        ? merged.unit_price * ((merged.quantity || 0) / 12)
        : merged.unit_price * (merged.quantity || 0);
      if (!hasDiscountedUnitPrice) merged.discounted_unit_price = this.isSubscriptionSection(merged.section) ? baseAmount * (1 - discountRatio) : merged.unit_price * (1 - discountRatio);
      if (!hasLineTotal) merged.line_total = Math.max(0, baseAmount * (1 - discountRatio));
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
      item_name: pickProvided(['item_name', 'itemName', 'name'], merged.item_name),
      description: pickProvided(['description', 'item_description', 'itemDescription', 'note', 'notes', 'catalog_note', 'catalogNote'], merged.description || merged.notes),
      unit_price: pickProvided(['unit_price', 'unitPrice'], merged.unit_price, { numeric: true }),
      discount_percent: pickProvided(['discount_percent', 'discountPercent'], merged.discount_percent, { numeric: true }),
      discounted_unit_price: pickProvided(['discounted_unit_price', 'discountedUnitPrice', 'discounted_price', 'discountedPrice'], merged.discounted_unit_price, { numeric: true }),
      quantity: pickProvided(['quantity', 'qty', 'units'], merged.quantity, { numeric: true }),
      line_total: pickProvided(['line_total', 'lineTotal', 'amount', 'total'], merged.line_total, { numeric: true }),
      capability_name: pickProvided(['capability_name', 'capabilityName'], merged.capability_name),
      capability_value: pickProvided(['capability_value', 'capabilityValue'], merged.capability_value),
      notes: pickProvided(['notes'], merged.notes),
      service_start_date: pickProvided(['service_start_date', 'serviceStartDate'], merged.service_start_date, { normalizeDate: true }),
      service_end_date: pickProvided(['service_end_date', 'serviceEndDate'], merged.service_end_date, { normalizeDate: true }),
      source_agreement_item_id: pickProvided(['source_agreement_item_id', 'sourceAgreementItemId'], merged.source_agreement_item_id),
      source_agreement_id: pickProvided(['source_agreement_id', 'sourceAgreementId'], merged.source_agreement_id)
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
  isGenericSetupLocation(value) {
    const key = this.normalizeLocationKey(value);
    return !key || key === 'all locations' || key === 'all location' || key === 'selected locations';
  },
  isOneTimeFeeItem(item = {}) {
    const source = item && typeof item === 'object' ? item : {};
    const text = [
      source.section,
      source.item_section,
      source.itemSection,
      source.type,
      source.item_type,
      source.itemType,
      source.category,
      source.item_category,
      source.itemCategory,
      source.item_name,
      source.itemName,
      source.name,
      source.description,
      source.notes
    ].map(value => String(value || '').toLowerCase()).join(' ');

    if (
      text.includes('annual') ||
      text.includes('subscription') ||
      text.includes('saas') ||
      text.includes('recurring') ||
      text.includes('license / month') ||
      text.includes('license/month')
    ) {
      if (!(
        text.includes('one_time') ||
        text.includes('one-time') ||
        text.includes('one time') ||
        text.includes('setup') ||
        text.includes('account setup') ||
        text.includes('implementation') ||
        text.includes('activation')
      )) return false;
    }

    return (
      text.includes('one_time') ||
      text.includes('one-time') ||
      text.includes('one time') ||
      text.includes('setup') ||
      text.includes('account setup') ||
      text.includes('implementation') ||
      text.includes('activation') ||
      text.includes('non recurring') ||
      text.includes('non_recurring') ||
      text.includes('non-recurring')
    );
  },
  getSelectedSetupLocationLabel(selectedAnnualItems = []) {
    const names = [...new Set(
      (Array.isArray(selectedAnnualItems) ? selectedAnnualItems : [])
        .map(item => String(item?.location_name || item?.locationName || item?.location || '').trim())
        .filter(Boolean)
    )];

    if (names.length === 1) return names[0];
    if (names.length > 1) return 'Selected Locations';
    return 'Selected Locations';
  },
  normalizeSetupBillingMode(value = '') {
    return String(value || '').trim() === 'full_first_batch' ? 'full_first_batch' : 'per_selected_locations';
  },
  getSetupBillingModeFromForm() {
    const checked = E.invoiceForm?.querySelector?.('input[name="invoiceAccountSetupBillingMode"]:checked');
    return this.normalizeSetupBillingMode(checked?.value || this.state.accountSetupBillingMode);
  },
  getAgreementItemLinkKeys(item = {}) {
    const values = [
      item.location_name, item.locationName, item.default_location_name, item.defaultLocationName,
      item.annual_saas_location_id, item.annualSaasLocationId, item.subscription_item_id, item.subscriptionItemId,
      item.parent_item_id, item.parentItemId, item.linked_agreement_item_id, item.linkedAgreementItemId,
      item.source_subscription_item_id, item.sourceSubscriptionItemId, item.location_id, item.locationId
    ];
    return new Set(values.map(value => this.normalizeText(value)).filter(Boolean));
  },
  setupItemMatchesSelectedSubscriptions(setupItem = {}, selectedSubscriptionItems = []) {
    const setupKeys = this.getAgreementItemLinkKeys(setupItem);
    if (!setupKeys.size) return false;
    return (Array.isArray(selectedSubscriptionItems) ? selectedSubscriptionItems : []).some(subscriptionItem => {
      const id = this.getAgreementItemRecordId(subscriptionItem);
      if (id && setupKeys.has(this.normalizeText(id))) return true;
      for (const key of this.getAgreementItemLinkKeys(subscriptionItem)) {
        if (setupKeys.has(key)) return true;
      }
      return false;
    });
  },
  buildSetupFeeItemsForInvoice({ agreementItems = [], selectedSubscriptionItemIds = [], setupBillingMode = 'per_selected_locations', alreadyInvoicedSetupItemIds = [] } = {}) {
    const mode = this.normalizeSetupBillingMode(setupBillingMode);
    const selectedIds = new Set((Array.isArray(selectedSubscriptionItemIds) ? selectedSubscriptionItemIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean));
    const normalizedAgreementItems = Array.isArray(agreementItems) ? agreementItems : [];
    const selectedSubscriptions = normalizedAgreementItems.filter(item => selectedIds.has(this.getAgreementItemRecordId(item)));
    const selectedLocationKeys = new Set(selectedSubscriptions
      .map(item => this.normalizeLocationKey(item?.location_name || item?.locationName || item?.location))
      .filter(Boolean));
    const alreadyInvoiced = new Set((Array.isArray(alreadyInvoicedSetupItemIds) ? alreadyInvoicedSetupItemIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean));
    const setupItems = normalizedAgreementItems.filter(item => this.isOneTimeFeeItem(item));
    const subscriptionItems = normalizedAgreementItems.filter(item => this.isSubscriptionSection(this.normalizeItem(item).section));
    let candidates = [];

    if (mode === 'full_first_batch') {
      candidates = setupItems;
    } else if (selectedSubscriptions.length) {
      candidates = setupItems.filter(item => {
        const locationKey = this.normalizeLocationKey(item?.location_name || item?.locationName || item?.location);
        return locationKey && selectedLocationKeys.has(locationKey) && !this.isGenericSetupLocation(locationKey);
      });

      if (!candidates.length) {
        candidates = setupItems.filter(item => this.setupItemMatchesSelectedSubscriptions(item, selectedSubscriptions));
      }

      if (!candidates.length && setupItems.length === subscriptionItems.length) {
        const selectedIndexSet = new Set(selectedSubscriptions
          .map(item => subscriptionItems.findIndex(subscriptionItem => this.getAgreementItemRecordId(subscriptionItem) === this.getAgreementItemRecordId(item)))
          .filter(index => index >= 0));
        candidates = setupItems.filter((_item, index) => selectedIndexSet.has(index));
      }

      if (!candidates.length) {
        const genericSetupItem = setupItems.find(item => {
          const itemId = this.getAgreementItemRecordId(item);
          if (itemId && alreadyInvoiced.has(itemId)) return false;
          return this.isGenericSetupLocation(item?.location_name || item?.locationName || item?.location);
        });

        if (genericSetupItem) {
          const computed = this.computeCommercialRow({
            ...genericSetupItem,
            section: 'one_time_fee',
            location_name: this.getSelectedSetupLocationLabel(selectedSubscriptions),
            quantity: selectedSubscriptions.length,
            source_agreement_item_id: ''
          });
          candidates = [{
            ...computed,
            source_agreement_item_id: '',
            __clearSourceAgreementItemId: true
          }];
        }
      }
    }

    const included = [];
    const skippedAlreadyInvoiced = [];
    candidates.forEach(item => {
      const itemId = this.getAgreementItemRecordId(item);
      if (!item.__clearSourceAgreementItemId && itemId && alreadyInvoiced.has(itemId)) {
        skippedAlreadyInvoiced.push(item);
        return;
      }
      included.push(item);
    });
    return { included, skippedAlreadyInvoiced, candidateCount: candidates.length, totalSetupCount: setupItems.length };
  },
  calculateInvoiceTotals(items = []) {
    return this.filterInvoiceCommercialItems(items).reduce(
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
    if (U?.formatAmountInWords) return U.formatAmountInWords(value, currency);
    const amount = this.toNumberSafe(value);
    const totalCents = Math.round(Math.max(0, amount) * 100);
    const whole = Math.floor(totalCents / 100);
    const cents = totalCents % 100;
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
    return `Only ${toWords(whole)} and ${String(cents).padStart(2, '0')}/100 USD`;
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
          old_paid_total: Math.max(0, this.toNumberSafe(receiptPaymentSummary.amount_paid) - this.toNumberSafe(invoice.paid_now)),
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
      payment_term: 'Net 30',
      payment_term_custom: '',
      payment_schedule_mode: 'auto',
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
        const id = U.escapeAttr(row.id || row.invoice_id || row.invoice_number || row.invoiceId || '');
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
    const section = this.normalizeSection(item.section);
    const baseAmount = this.isSubscriptionSection(section) ? unit * (qty / 12) : unit * qty;
    const discounted = this.isSubscriptionSection(section) ? baseAmount * (1 - discountRatio) : unit * (1 - discountRatio);
    const lineTotal = Math.max(0, baseAmount * (1 - discountRatio));
    return {
      ...item,
      discounted_unit_price: discounted,
      line_total: lineTotal
    };
  },
  groupedItems(items = []) {
    const groups = { annual_saas: [], one_time_fee: [] };
    this.filterInvoiceCommercialItems(items).forEach((item, idx) => {
      const normalized = this.normalizeItem(item);
      const section = normalized.section === 'one_time_fee' ? 'one_time_fee' : 'annual_saas';
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
    const descriptionInput = tr.querySelector('[data-item-field="description"]');
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
    const selectedDescription = this.getItemDescription(selected);
    if (descriptionInput) descriptionInput.value = selectedDescription;
  },
  renderSectionRows(section, rows = []) {
    const tbody =
      section === 'annual_saas'
        ? E.invoiceAnnualItemsTbody
        : E.invoiceOneTimeItemsTbody;
    if (!tbody) return;

    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) {
      const colspan = section === 'annual_saas' ? 8 : 6;
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="muted" style="text-align:center;">No rows yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = safeRows
      .map(row => {
        const rowDefaults = section === 'annual_saas'
          ? { ...row, quantity: row.quantity || 12 }
          : { ...row, quantity: row.quantity || 1 };
        const computed = this.computeCommercialRow({ ...rowDefaults, section });
        if (section === 'annual_saas') {
          return `<tr data-item-row="${section}">
            <td><input class="input" data-item-field="location_name" value="${U.escapeAttr(computed.location_name || '')}" /><input type="hidden" data-item-field="location_address" value="${U.escapeAttr(computed.location_address || '')}" /><input type="hidden" data-item-field="notes" value="${U.escapeAttr(computed.notes || '')}" /><input type="hidden" data-item-field="description" value="${U.escapeAttr(computed.description || '')}" /><input type="hidden" data-item-field="source_agreement_item_id" value="${U.escapeAttr(computed.source_agreement_item_id || '')}" /><input type="hidden" data-item-field="source_agreement_id" value="${U.escapeAttr(computed.source_agreement_id || '')}" /></td>
            <td><input type="hidden" data-item-field="catalog_item_id" value="${U.escapeAttr(computed.catalog_item_id || '')}" /><input class="input" data-item-field="item_name" list="invoiceCatalogOptions-${section}" value="${U.escapeAttr(computed.item_name || '')}" /></td>
            <td><input class="input" type="number" step="0.01" data-item-field="unit_price" value="${U.escapeAttr(computed.unit_price ?? '')}" /></td>
            <td><input class="input" type="number" step="0.01" min="0.01" max="12" data-item-field="quantity" value="${U.escapeAttr(computed.quantity ?? '')}" /></td>
            <td><input class="input" type="date" data-item-field="service_start_date" value="${U.escapeAttr(computed.service_start_date || '')}" /></td>
            <td><input class="input" type="date" data-item-field="service_end_date" value="${U.escapeAttr(computed.service_end_date || '')}" /></td>
            <td><input class="input" type="number" step="0.01" min="0" max="100" data-item-field="discount_percent" value="${U.escapeAttr(computed.discount_percent ?? '')}" /></td>
            <td><span data-item-display="line_total">${this.formatMoney(computed.line_total)}</span></td>
          </tr>`;
        }
        return `<tr data-item-row="${section}">
          <td><input class="input" data-item-field="location_name" value="${U.escapeAttr(computed.location_name || '')}" /><input type="hidden" data-item-field="location_address" value="${U.escapeAttr(computed.location_address || '')}" /><input type="hidden" data-item-field="service_start_date" value="${U.escapeAttr(computed.service_start_date || '')}" /><input type="hidden" data-item-field="service_end_date" value="${U.escapeAttr(computed.service_end_date || '')}" /><input type="hidden" data-item-field="notes" value="${U.escapeAttr(computed.notes || '')}" /><input type="hidden" data-item-field="description" value="${U.escapeAttr(computed.description || '')}" /><input type="hidden" data-item-field="source_agreement_item_id" value="${U.escapeAttr(computed.source_agreement_item_id || '')}" /><input type="hidden" data-item-field="source_agreement_id" value="${U.escapeAttr(computed.source_agreement_id || '')}" /></td>
          <td><input type="hidden" data-item-field="catalog_item_id" value="${U.escapeAttr(computed.catalog_item_id || '')}" /><input class="input" data-item-field="item_name" list="invoiceCatalogOptions-${section}" value="${U.escapeAttr(computed.item_name || '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="unit_price" value="${U.escapeAttr(computed.unit_price ?? '')}" /></td>
          <td><input class="input" type="number" step="0.01" min="0" max="100" data-item-field="discount_percent" value="${U.escapeAttr(computed.discount_percent ?? '')}" /></td>
          <td><input class="input" type="number" step="0.01" min="0.01" data-item-field="quantity" value="${U.escapeAttr(computed.quantity ?? '')}" /></td>
          <td><span data-item-display="line_total">${this.formatMoney(computed.line_total)}</span></td>
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
      if (field === 'payment_term') {
        set(id, this.normalizePaymentTerm(invoice[field] || invoice.paymentTerm || 'Net 30'));
      } else if (field === 'payment_schedule_mode') {
        set(id, this.normalizePaymentScheduleMode(invoice[field] || invoice.paymentScheduleMode, invoice.payment_term));
      } else {
        set(id, invoice[field] || '');
      }
    });
    set('invoiceFormInvoiceDate', invoice.issue_date || invoice.invoice_date || '');
    if (E.invoiceFormPaymentTermsCustom) E.invoiceFormPaymentTermsCustom.value = String(invoice.payment_term_custom ?? invoice.paymentTermCustom ?? invoice.payment_terms_custom ?? invoice.paymentTermsCustom ?? '');
    if (E.invoiceFormPaymentScheduleMode) E.invoiceFormPaymentScheduleMode.value = this.normalizePaymentScheduleMode(invoice.payment_schedule_mode || invoice.paymentScheduleMode, invoice.payment_term);
    this.lockInvoicePaymentTermField();
    this.syncPaymentTermsControls();
  },
  collectSectionItems(section) {
    const tbody =
      section === 'annual_saas'
        ? E.invoiceAnnualItemsTbody
        : E.invoiceOneTimeItemsTbody;
    if (!tbody) return [];
    const rows = [...tbody.querySelectorAll('tr[data-item-row]')];
    return rows
      .map((tr, idx) => {
        const get = field => tr.querySelector(`[data-item-field="${field}"]`)?.value ?? '';
        const unitPrice = this.toNumberSafe(get('unit_price'));
        const discountPercent = this.toNumberSafe(get('discount_percent'));
        const quantity = this.toNumberSafe(get('quantity'));
        const computed = this.computeCommercialRow({ section, unit_price: unitPrice, discount_percent: discountPercent, quantity });
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
          description: String(get('description') || get('notes') || '').trim(),
          unit_price: unitPrice,
          discount_percent: discountPercent,
          quantity,
          discounted_unit_price: computed.discounted_unit_price,
          line_total: computed.line_total,
          notes: String(get('notes')).trim(),
          source_agreement_item_id: String(get('source_agreement_item_id')).trim(),
          source_agreement_id: String(get('source_agreement_id')).trim()
        });
      })
      .filter(Boolean);
  },
  collectItems() {
    return [
      ...this.collectSectionItems('annual_saas'),
      ...this.collectSectionItems('one_time_fee')
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
    invoice.issue_date = this.normalizeDateInputValue(get('invoiceFormInvoiceDate') || invoice.issue_date || invoice.invoice_date);
    invoice.invoice_date = invoice.issue_date;
    const selectedAgreement = this.state.selectedAgreement || {};
    const isExistingInvoice = Boolean(String(existingInvoice?.id || E.invoiceForm?.dataset?.id || '').trim());
    const paymentTermFromForm = get('invoiceFormPaymentTerm');
    const formInvoiceForResolution = {
      ...existingInvoice,
      ...invoice,
      ...(paymentTermFromForm ? { payment_term: paymentTermFromForm } : {})
    };
    invoice.payment_term = this.resolveInvoicePaymentTerm(
      formInvoiceForResolution,
      selectedAgreement,
      { mode: isExistingInvoice ? 'existing' : 'new' }
    );
    invoice.payment_term_custom = get('invoiceFormPaymentTermsCustom') || String(existingInvoice.payment_term_custom ?? existingInvoice.payment_terms_custom ?? '').trim();
    invoice.payment_schedule_mode = this.normalizePaymentScheduleMode(get('invoiceFormPaymentScheduleMode') || existingInvoice.payment_schedule_mode, invoice.payment_term);
    if (invoice.payment_term === 'Custom') invoice.payment_schedule_mode = 'manual';
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
    invoice.is_poc = this.normalizeTruthy(invoice.is_poc || selectedAgreement.is_poc || existingInvoice.is_poc);
    if (invoice.is_poc) {
      invoice.poc_success_kpis = String(invoice.poc_success_kpis || selectedAgreement.poc_success_kpis || selectedAgreement.pocSuccessKpis || existingInvoice.poc_success_kpis || this.getDefaultPocSuccessKpis()).trim();
      invoice.poc_conversion_commitment = String(invoice.poc_conversion_commitment || selectedAgreement.poc_conversion_commitment || selectedAgreement.pocConversionCommitment || existingInvoice.poc_conversion_commitment || this.getDefaultPocConversionCommitment()).trim();
    }
    if (!invoice.is_poc) {
      invoice.poc_location_count = null;
      invoice.poc_license_count = null;
      invoice.poc_license_months = null;
      invoice.poc_service_start_date = null;
      invoice.poc_service_end_date = null;
      invoice.poc_success_kpis = null;
      invoice.poc_conversion_commitment = null;
    }
    return { invoice, items };
  },
  validateInvoice(invoice = {}) {
    const draft = invoice || {};
    const requiredFields = [
      ['invoice_number', 'Invoice Number'],
      ['issue_date', 'Invoice Date'],
      ['due_date', 'Due Date'],
      ['currency', 'Currency']
    ];
    const missing = requiredFields.filter(([field]) => !String(draft?.[field] || '').trim());
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
    if (this.normalizePaymentTerm(invoice.payment_term) === 'Custom' && !String(invoice.payment_term_custom ?? invoice.payment_terms_custom ?? '').trim()) {
      UI.toast('Please enter custom payment terms.');
      E.invoiceFormPaymentTermsCustom?.focus();
      return false;
    }
    if (!this.validateManualPaymentSchedule(invoice)) return false;
    return true;
  },
  openInvoice(invoice = this.emptyInvoice(), items = [], { readOnly = false } = {}) {
    if (!E.invoiceFormModal || !E.invoiceForm) return;
    this.state.selectedAgreementItemIds = new Set();
    this.state.accountSetupBillingMode = 'per_selected_locations';
    this.state.agreementInvoiceSelection = null;
    this.renderAgreementLocationSelection();
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
    this.state.items = this.filterInvoiceCommercialItems(items).map(item => this.normalizeItem(item));
    this.assignFormValues(this.state.selectedInvoice);
    this.hydrateInvoiceCustomerSection({ agreement: this.state.selectedAgreement || this.state.selectedInvoice || {}, company: this.state.selectedCompany || {}, contact: this.state.selectedContact || {} });
    this.renderItems(this.state.items);
    const summary = this.deriveCalculatedSummary(this.state.selectedInvoice, this.state.items, { preferInvoiceValues: true });
    this.state.selectedInvoice = this.normalizeInvoice({ ...this.state.selectedInvoice, ...summary });
    this.applyTotalsToForm(summary);
    this.syncPaymentFieldsInForm();
    this.syncPaymentConclusion(summary);
    this.renderInvoiceReceipts(this.state.selectedInvoice);
    this.refreshPaymentSchedule();
    if (this.state.selectedInvoice.id) {
      this.refreshInvoiceReceipts(this.state.selectedInvoice.id, { force: true });
      this.loadInvoicePaymentSchedule(this.state.selectedInvoice.id, { forceCreate: this.shouldCalculateInvoiceSchedule(this.state.selectedInvoice) });
    }
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
    const adminOverride = this.canUseAdminOverride();
    const isExistingLocked = isExistingInvoice && !adminOverride;
    const allowedExistingEditIds = new Set(['invoiceFormStatus', 'invoiceFormPaymentStatus', 'invoiceFormInvoiceDate', 'invoiceFormDueDate', 'invoiceFormPaymentTerm', 'invoiceFormPaymentTermsCustom', 'invoiceFormPaymentScheduleMode']);
    if (E.invoiceFormSaveBtn) E.invoiceFormSaveBtn.style.display = !readOnly && canSave ? '' : 'none';
    E.invoiceForm.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.id === 'invoiceFormInvoiceId') {
        el.disabled = true;
        return;
      }
      el.disabled = readOnly || (isExistingLocked && !allowedExistingEditIds.has(el.id));
      if (isExistingLocked && !allowedExistingEditIds.has(el.id) && ('readOnly' in el)) el.readOnly = true;
    });
    if (E.invoiceFormOldPaidTotal) E.invoiceFormOldPaidTotal.readOnly = true;
    if (E.invoiceFormAmountPaid) E.invoiceFormAmountPaid.readOnly = true;
    if (E.invoiceFormPendingAmount) E.invoiceFormPendingAmount.readOnly = true;
    if (E.invoiceFormPaymentState) E.invoiceFormPaymentState.readOnly = true;
    this.lockInvoicePaymentTermField();
    if (E.invoiceAddAnnualRowBtn) E.invoiceAddAnnualRowBtn.style.display = adminOverride ? '' : 'none';
    if (E.invoiceAddOneTimeRowBtn) E.invoiceAddOneTimeRowBtn.style.display = adminOverride ? '' : 'none';
    if (E.invoiceAddCapabilityRowBtn) E.invoiceAddCapabilityRowBtn.style.display = adminOverride ? '' : 'none';
    E.invoiceForm.querySelectorAll('[data-item-field]').forEach(el => {
      el.disabled = readOnly || isExistingLocked;
      if ('readOnly' in el) el.readOnly = readOnly || isExistingLocked;
    });
    E.invoiceForm.querySelectorAll('button[data-item-remove]').forEach(btn => { btn.style.display = readOnly || isExistingLocked ? 'none' : ''; });
    if (adminOverride && isExistingInvoice) this.applyAdminOverrideBanner();
    if (E.invoiceFormIssuedHelperText) {
      E.invoiceFormIssuedHelperText.textContent = isExistingLocked
        ? 'Invoice commercial details are locked after creation. Only status, invoice date, and due date can be edited.'
        : '';
      E.invoiceFormIssuedHelperText.style.display = isExistingLocked ? '' : 'none';
    }
    this.ensureCatalogLoaded();
    E.invoiceFormModal.classList.add('open');
    E.invoiceFormModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => window.CrmCompanyContactSelectors?.initializeCompanyContactSelectorsForInvoice?.(), 0);
    if (window.setAppHashRoute && window.buildRecordHashRoute) setAppHashRoute(buildRecordHashRoute('invoices', this.state.selectedInvoice || {}));
  },
  closeForm() {
    if (!E.invoiceFormModal || !E.invoiceForm) return;
    E.invoiceFormModal.classList.remove('open');
    E.invoiceFormModal.setAttribute('aria-hidden', 'true');
    if (window.setAppHashRoute) setAppHashRoute('#finance?tab=invoices');
    E.invoiceForm.reset();
    E.invoiceForm.dataset.id = '';
    this.state.selectedInvoice = null;
    this.state.items = [];
    this.state.selectedAgreementItemIds = new Set();
    this.state.accountSetupBillingMode = 'per_selected_locations';
    this.state.agreementInvoiceSelection = null;
    this.renderAgreementLocationSelection();
    this.renderItems([]);
    this.renderInvoiceReceipts({ invoice_id: '' });
    this.renderInvoicePaymentSchedule([]);
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
    return {
      agreement: agreement || { agreement_id: fallbackId },
      items: Array.isArray(items) ? items : []
    };
  },
  async loadAgreementItemsDirectForInvoice(agreement = {}, fallbackId = '') {
    const client = this.getSupabaseClient();
    if (!client) return [];
    const agreementUuid = String(
      agreement?.id ||
      agreement?.uuid ||
      agreement?.agreement_uuid ||
      agreement?.agreementUuid ||
      (this.looksLikeUuid(fallbackId) ? fallbackId : '') ||
      ''
    ).trim();
    if (!agreementUuid) return [];
    try {
      const { data, error } = await client
        .from('agreement_items')
        .select('*')
        .eq('agreement_id', agreementUuid)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[Invoice] Unable to directly load agreement_items for invoice selection.', error);
      return [];
    }
  },
  async getAlreadyInvoicedSetupAgreementItemIds(agreementId = '') {
    const id = String(agreementId || '').trim();
    const result = new Set();
    if (!id) return result;
    const client = this.getSupabaseClient();
    if (!client) return result;

    const addRows = rows => {
      (Array.isArray(rows) ? rows : []).forEach(row => {
        const sourceId = String(row?.source_agreement_item_id || row?.agreement_item_id || row?.id || '').trim();
        if (!sourceId) return;
        if (this.isOneTimeFeeItem(row)) result.add(sourceId);
      });
    };

    try {
      const { data, error } = await client
        .from('invoice_items')
        .select('source_agreement_item_id,source_agreement_id,section,item_name,notes')
        .eq('source_agreement_id', id);
      if (error) throw error;
      addRows(data);
    } catch (error) {
      console.warn('[Invoice] Unable to verify setup fees by source_agreement_id from invoice_items.', error);
    }

    try {
      const { data, error } = await client
        .from('invoice_items')
        .select('source_agreement_item_id,source_agreement_id,section,item_name,notes')
        .eq('agreement_id', id);
      if (error) throw error;
      addRows(data);
    } catch (error) {
      console.warn('[Invoice] invoice_items.agreement_id check skipped or failed.', error);
    }

    try {
      const { data, error } = await client
        .from('invoice_items')
        .select('agreement_item_id,source_agreement_id,section,item_name,notes')
        .eq('source_agreement_id', id);
      if (error) throw error;
      addRows(data);
    } catch (error) {
      console.warn('[Invoice] invoice_items.agreement_item_id setup-fee check skipped or failed.', error);
    }

    try {
      const { data, error } = await client
        .from('agreement_items')
        .select('*')
        .eq('agreement_id', id)
        .eq('invoice_status', 'invoiced');
      if (error) throw error;
      (Array.isArray(data) ? data : []).forEach(row => {
        const rowId = String(row?.id || '').trim();
        if (rowId && this.isOneTimeFeeItem(row)) result.add(rowId);
      });
    } catch (error) {
      console.warn('[Invoice] agreement_items.invoice_status setup-fee check skipped or failed.', error);
    }

    return result;
  },
  async getActualInvoicedAgreementItemMap(itemIds = []) {
    const ids = [...new Set((Array.isArray(itemIds) ? itemIds : [])
      .map(id => String(id || '').trim())
      .filter(Boolean))];
    const result = new Map();
    if (!ids.length) return result;
    const client = this.getSupabaseClient();
    if (!client) return result;
    try {
      const { data, error } = await client
        .from('invoice_items')
        .select('source_agreement_item_id,invoice_id')
        .in('source_agreement_item_id', ids);
      if (error) throw error;
      (Array.isArray(data) ? data : []).forEach(row => {
        const sourceId = String(row?.source_agreement_item_id || '').trim();
        const invoiceId = String(row?.invoice_id || '').trim();
        if (sourceId) result.set(sourceId, invoiceId || true);
      });
    } catch (error) {
      console.warn('[Invoice] Unable to verify actual invoiced agreement items from invoice_items.', error);
    }
    return result;
  },
  getAgreementItemRecordId(item = {}) {
    return String(item?.id || item?.source_agreement_item_id || '').trim();
  },
  isAnnualSaasItem(item = {}) {
    return String(item.section || item.item_section || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_') === 'annual_saas';
  },
  normalizeAgreementItemInvoiceStatus(item = {}) {
    return this.normalizeText(item?.invoice_status || item?.invoiceStatus || '')
      .replace(/[\s-]+/g, '_');
  },
  isAgreementItemInvoiced(item = {}) {
    const status = String(item.invoice_status || item.invoiceStatus || '').trim().toLowerCase();
    return ['invoiced', 'issued'].includes(status)
      || Boolean(item.invoiced_invoice_id || item.invoicedInvoiceId)
      || Boolean(item.invoiced_at || item.invoicedAt);
  },
  getUninvoicedAnnualSaasItems(agreement = {}, agreementItems = []) {
    const agreementId = String(agreement.id || agreement.agreement_id || '').trim();
    return (Array.isArray(agreementItems) ? agreementItems : [])
      .filter(item => {
        const itemAgreementId = String(item.agreement_id || item.agreementId || '').trim();
        return itemAgreementId === agreementId
          && this.isAnnualSaasItem(item)
          && !this.isAgreementItemInvoiced(item);
      });
  },
  hasUninvoicedAnnualSaasItems(agreement = {}, agreementItems = []) {
    return this.getUninvoicedAnnualSaasItems(agreement, agreementItems).length > 0;
  },
  isAgreementItemInvoiceable(item = {}) {
    return !this.isAgreementItemInvoiced(item);
  },
  renderAgreementLocationSelection() {
    const section = E.invoiceAgreementLocationSelectionSection;
    const body = E.invoiceAgreementLocationSelectionBody;
    const selection = this.state.agreementInvoiceSelection;
    if (!section || !body) return;
    if (!selection?.active) {
      section.style.display = 'none';
      if (E.invoiceAccountSetupBillingOptions) E.invoiceAccountSetupBillingOptions.style.display = 'none';
      if (E.invoiceAccountSetupBillingNote) E.invoiceAccountSetupBillingNote.style.display = 'none';
      body.innerHTML = '';
      return;
    }
    section.style.display = '';
    const setupRows = Array.isArray(selection.oneTimeItems) ? selection.oneTimeItems : [];
    const hasSetupRows = setupRows.some(item => this.isOneTimeFeeItem(item));
    if (E.invoiceAccountSetupBillingOptions) E.invoiceAccountSetupBillingOptions.style.display = hasSetupRows ? '' : 'none';
    const mode = this.normalizeSetupBillingMode(selection.setupBillingMode || this.state.accountSetupBillingMode);
    this.state.accountSetupBillingMode = mode;
    if (E.invoiceAccountSetupBillingPerSelected) E.invoiceAccountSetupBillingPerSelected.checked = mode !== 'full_first_batch';
    if (E.invoiceAccountSetupBillingFullFirst) E.invoiceAccountSetupBillingFullFirst.checked = mode === 'full_first_batch';
    if (E.invoiceAccountSetupBillingNote) {
      const skipped = Number(selection.setupFeesSkippedAlreadyInvoiced || 0);
      const showAlreadyInvoicedNote = hasSetupRows && mode === 'full_first_batch' && skipped > 0 && Number(selection.setupFeesIncluded || 0) === 0;
      E.invoiceAccountSetupBillingNote.textContent = showAlreadyInvoicedNote ? 'Account setup fee was already invoiced for this agreement.' : '';
      E.invoiceAccountSetupBillingNote.style.display = showAlreadyInvoicedNote ? '' : 'none';
    }
    E.invoiceForm?.querySelectorAll?.('input[name="invoiceAccountSetupBillingMode"]').forEach(input => {
      input.onchange = () => {
        this.state.accountSetupBillingMode = this.normalizeSetupBillingMode(input.value);
        this.rebuildAgreementInvoiceItemsFromSelection();
      };
    });
    const annualRows = Array.isArray(selection.annualItems) ? selection.annualItems : [];
    if (!annualRows.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted">No annual SaaS locations were found on this agreement. Reopen the agreement and confirm the Annual SaaS rows are saved.</td></tr>';
      if (E.invoiceFormSaveBtn) E.invoiceFormSaveBtn.disabled = true;
      return;
    }
    const allInvoicedMessage = !(selection.invoiceableItems || []).length
      ? '<tr><td colspan="7" class="muted">All agreement locations have already been invoiced.</td></tr>'
      : '';
    body.innerHTML = allInvoicedMessage + annualRows.map(item => {
      const itemId = this.getAgreementItemRecordId(item);
      const invoiceable = this.isAgreementItemInvoiceable(item);
      const checked = invoiceable && this.state.selectedAgreementItemIds.has(itemId);
      const computed = this.computeCommercialRow(item);
      const status = invoiceable ? 'Not Invoiced' : 'Invoiced';
      const invoiceRef = String(item?.invoiced_invoice_id || item?.invoicedInvoiceId || '').trim();
      const label = [item.location_name, item.item_name].map(value => String(value || '').trim()).filter(Boolean).join(' — ') || 'Agreement location';
      return `<tr>
        <td><input type="checkbox" data-agreement-item-id="${U.escapeAttr(itemId)}" ${checked ? 'checked' : ''} ${invoiceable ? '' : 'disabled'} /></td>
        <td>${U.escapeHtml(label)}</td>
        <td>${U.escapeHtml(String(item.quantity || ''))}</td>
        <td>${U.escapeHtml(this.normalizeDateInputValue(item.service_start_date) || '—')}</td>
        <td>${U.escapeHtml(this.normalizeDateInputValue(item.service_end_date) || '—')}</td>
        <td>${U.escapeHtml(this.formatMoney(computed.line_total))}</td>
        <td><span class="badge">${U.escapeHtml(status)}</span>${invoiceRef ? `<div class="muted">${U.escapeHtml(invoiceRef)}</div>` : ''}</td>
      </tr>`;
    }).join('');
    body.querySelectorAll('input[data-agreement-item-id]').forEach(input => {
      input.addEventListener('change', () => {
        const itemId = String(input.getAttribute('data-agreement-item-id') || '').trim();
        if (!itemId) return;
        if (input.checked) this.state.selectedAgreementItemIds.add(itemId);
        else this.state.selectedAgreementItemIds.delete(itemId);
        this.rebuildAgreementInvoiceItemsFromSelection();
      });
    });
    if (E.invoiceFormSaveBtn) E.invoiceFormSaveBtn.disabled = this.state.selectedAgreementItemIds.size === 0;
  },
  buildAgreementInvoiceItemsFromSelection() {
    const selection = this.state.agreementInvoiceSelection || {};
    const selectedIds = this.state.selectedAgreementItemIds || new Set();
    const agreementUuid = String(selection.agreementUuid || '').trim();
    const selectedAnnual = (selection.invoiceableItems || []).filter(item => selectedIds.has(this.getAgreementItemRecordId(item)));
    const setupBillingMode = this.getSetupBillingModeFromForm();
    const selectedSubscriptionItemIds = selectedAnnual.map(item => this.getAgreementItemRecordId(item)).filter(Boolean);
    const setupResult = this.buildSetupFeeItemsForInvoice({
      agreementItems: [
        ...(selection.annualItems || []),
        ...(selection.oneTimeItems || [])
      ],
      selectedSubscriptionItemIds,
      setupBillingMode,
      alreadyInvoicedSetupItemIds: [...(selection.alreadyInvoicedSetupItemIds || new Set())]
    });
    const oneTimeItems = setupResult.included.map(item => {
      const clearSetupSource = Boolean(item?.__clearSourceAgreementItemId);
      const quantity = item.quantity || 1;
      return this.computeCommercialRow({
        ...item,
        quantity,
        section: this.normalizeSection(item.section) || 'one_time_fee',
        source_agreement_item_id: clearSetupSource ? '' : this.getAgreementItemRecordId(item),
        source_agreement_id: agreementUuid
      });
    });
    this.state.accountSetupBillingMode = setupBillingMode;
    this.state.agreementInvoiceSelection = {
      ...selection,
      setupBillingMode,
      setupFeesIncluded: oneTimeItems.length,
      setupFeesSkippedAlreadyInvoiced: setupResult.skippedAlreadyInvoiced.length
    };
    console.log('[Invoice] Account setup billing mode:', setupBillingMode);
    console.log('[Invoice] Selected subscription count:', selectedAnnual.length);
    console.log('[Invoice] Setup fee rows included:', oneTimeItems.length);
    console.log('[Invoice] Setup fee rows skipped because already invoiced:', setupResult.skippedAlreadyInvoiced.length);
    return [
      ...selectedAnnual.map(item => ({
        ...item,
        source_agreement_item_id: this.getAgreementItemRecordId(item),
        source_agreement_id: agreementUuid
      })),
      ...oneTimeItems
    ].map((item, index) => this.normalizeItem({ ...item, line_no: index + 1 }));
  },
  rebuildAgreementInvoiceItemsFromSelection() {
    const invoice = this.collectFormValues().invoice;
    const items = this.buildAgreementInvoiceItemsFromSelection();
    this.state.items = items;
    this.renderItems(items);
    const summary = this.deriveCalculatedSummary(invoice, items);
    this.state.selectedInvoice = this.normalizeInvoice({ ...(this.state.selectedInvoice || {}), ...invoice, ...summary });
    this.applyTotalsToForm(summary);
    this.syncPaymentFieldsInForm();
    this.syncPaymentConclusion(summary);
    this.renderAgreementLocationSelection();
  },
  pickFirstOperationValue(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (String(value).trim() !== '') return value;
    }
    return '';
  },
  generateOperationsBatchId(prefix = 'OP') {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const random = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `${prefix}-${stamp}-${random}`;
  },
  getCurrentUserRequestLabel() {
    const currentUser = (window.Session?.currentUser && typeof window.Session.currentUser === 'object')
      ? window.Session.currentUser
      : {};
    return String(
      currentUser.name ||
      currentUser.full_name ||
      currentUser.email ||
      currentUser.user_id ||
      currentUser.id ||
      (typeof window.Session?.userId === 'function' ? window.Session.userId() : '') ||
      ''
    ).trim();
  },
  getUniqueTextList(values = []) {
    const out = [];
    const seen = new Set();
    (Array.isArray(values) ? values : []).forEach(value => {
      const text = String(value || '').trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  },
  getInvoiceOperationLocationLabel(item = {}, index = 0) {
    return String(
      item.location_name ||
      item.locationName ||
      item.default_location_name ||
      item.defaultLocationName ||
      item.item_name ||
      item.itemName ||
      `Location ${index + 1}`
    ).trim();
  },
  getInvoicedAgreementLocationItems(items = [], selectedAgreementItemIds = []) {
    const selectedIds = new Set((Array.isArray(selectedAgreementItemIds) ? selectedAgreementItemIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean));
    const normalizedItems = Array.isArray(items) ? items : [];
    return normalizedItems.filter(item => {
      if (!this.isSubscriptionSection(item?.section)) return false;
      const sourceId = String(item?.source_agreement_item_id || item?.sourceAgreementItemId || item?.id || '').trim();
      return !selectedIds.size || (sourceId && selectedIds.has(sourceId));
    });
  },
  getOperationServiceDate(items = [], field = 'service_start_date', direction = 'asc') {
    const dates = (Array.isArray(items) ? items : [])
      .map(item => this.normalizeDateInputValue(item?.[field] || ''))
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = new Date(a).getTime();
        const bTime = new Date(b).getTime();
        return direction === 'desc' ? bTime - aTime : aTime - bTime;
      });
    return dates[0] || '';
  },
  buildInvoiceOperationsTechnicalSeed(invoice = {}, persistedInvoice = {}, items = [], selectedAgreementItemIds = []) {
    const sourceInvoice = { ...(invoice || {}), ...(persistedInvoice || {}) };
    const selectedAgreement = this.state.selectedAgreement || {};
    const selectedCompany = this.state.selectedCompany || {};
    const locationItems = this.getInvoicedAgreementLocationItems(items, selectedAgreementItemIds);
    const locationNames = this.getUniqueTextList(locationItems.map((item, index) => this.getInvoiceOperationLocationLabel(item, index)));
    if (!locationNames.length) return null;

    const firstLocationItem = locationItems.find(item => item && typeof item === 'object') || {};
    const agreementUuidRaw = String(this.pickFirstOperationValue(
      sourceInvoice.agreement_uuid,
      sourceInvoice.agreementUuid,
      sourceInvoice.source_agreement_id,
      sourceInvoice.sourceAgreementId,
      selectedAgreement.id,
      selectedAgreement.uuid,
      selectedAgreement.agreement_uuid,
      selectedAgreement.agreementUuid,
      firstLocationItem.source_agreement_id,
      firstLocationItem.sourceAgreementId,
      firstLocationItem.agreement_uuid,
      firstLocationItem.agreementUuid,
      firstLocationItem.agreement_id,
      firstLocationItem.agreementId,
      firstLocationItem.parent_id,
      firstLocationItem.parentId,
      this.state.form?.agreementUuid
    )).trim();
    const agreementUuid = this.isUuid(agreementUuidRaw) ? agreementUuidRaw : '';
    const agreementNumber = String(this.pickFirstOperationValue(
      sourceInvoice.agreement_number,
      sourceInvoice.agreementNumber,
      selectedAgreement.agreement_number,
      selectedAgreement.agreementNumber,
      firstLocationItem.agreement_number,
      firstLocationItem.agreementNumber,
      firstLocationItem.source_agreement_number,
      firstLocationItem.sourceAgreementNumber,
      firstLocationItem.parent_number,
      firstLocationItem.parentNumber,
      sourceInvoice.agreement_id,
      selectedAgreement.agreement_id,
      selectedAgreement.agreementId,
      agreementUuidRaw
    )).trim();
    const invoiceUuidRaw = String(sourceInvoice.id || sourceInvoice.invoice_uuid || sourceInvoice.invoiceUuid || '').trim();
    const invoiceUuid = this.isUuid(invoiceUuidRaw) ? invoiceUuidRaw : '';
    const invoiceDisplay = String(this.pickFirstOperationValue(
      sourceInvoice.invoice_number,
      sourceInvoice.invoice_id,
      invoiceUuid
    )).trim();
    const clientName = String(this.pickFirstOperationValue(
      sourceInvoice.customer_legal_name,
      sourceInvoice.customer_name,
      sourceInvoice.company_name,
      selectedCompany.legal_name,
      selectedCompany.company_name,
      selectedAgreement.customer_legal_name,
      selectedAgreement.customer_name
    )).trim();
    const requestedAt = new Date().toISOString();
    const requestedBy = this.getCurrentUserRequestLabel();
    const locationText = locationNames.join(', ');
    const message = `Please proceed with the invoiced location${locationNames.length > 1 ? 's' : ''}: ${locationText}. Invoice ${invoiceDisplay || 'created'}${agreementNumber ? ` under Agreement ${agreementNumber}` : ''}.`;
    const sourceAgreementItemIds = this.getUniqueTextList(locationItems.map(item => String(item?.source_agreement_item_id || item?.sourceAgreementItemId || item?.id || '').trim()));
    const onboardingId = this.generateOperationsBatchId('OP');

    const shared = {
      agreement_id: agreementUuid || null,
      agreement_number: agreementNumber || null,
      // Do not send client_id here. operations_onboarding.client_id has a FK to public.clients,
      // while invoices/companies may carry a company UUID or legacy client reference. Sending it
      // can block the invoice-created onboarding row with operations_onboarding_client_id_fkey.
      // Client visibility is carried by client_name for this invoice-batch workflow.
      client_name: clientName || null,
      location_count: locationNames.length,
      locations_count: locationNames.length,
      number_of_locations: locationNames.length,
      invoiced_location_count: locationNames.length,
      service_start_date: this.getOperationServiceDate(locationItems, 'service_start_date', 'asc') || null,
      service_end_date: this.getOperationServiceDate(locationItems, 'service_end_date', 'desc') || null,
      billing_frequency: String(sourceInvoice.billing_frequency || selectedAgreement.billing_frequency || '').trim() || null,
      payment_term: this.normalizePaymentTerm(sourceInvoice.payment_term || selectedAgreement.payment_term || selectedAgreement.payment_terms || 'Net 30'),
      signed_date: this.normalizeDateInputValue(
        selectedAgreement.signed_date ||
        selectedAgreement.signedDate ||
        selectedAgreement.customer_sign_date ||
        selectedAgreement.customerSignDate ||
        selectedAgreement.customer_official_sign_date ||
        selectedAgreement.customerOfficialSignDate ||
        selectedAgreement.provider_official_signatory_2_sign_date ||
        selectedAgreement.providerOfficialSignatory2SignDate ||
        selectedAgreement.provider_sign_date ||
        selectedAgreement.providerSignDate ||
        ''
      ) || null,
      source_invoice_id: invoiceUuid || null,
      invoice_id: invoiceUuid || null,
      source_invoice_number: invoiceDisplay || null,
      invoice_number: invoiceDisplay || null,
      invoiced_location_names: locationText,
      invoiced_locations: locationText,
      location_names: locationText,
      invoiced_agreement_item_ids: sourceAgreementItemIds.join(', '),
      // Keep a draft/default message on the Operations row only.
      // The Technical Admin request itself must be created manually from Operations.
      request_type: 'Invoice Onboarding',
      technical_request_type: null,
      request_message: message,
      request_details: message,
      technical_request_details: null,
      request_status: 'Not Requested',
      technical_request_status: 'Not Requested',
      requested_by: requestedBy || null,
      requested_at: requestedAt,
      notes: message
    };

    return {
      onboarding_id: onboardingId,
      message,
      locations: locationNames,
      operationPayload: {
        ...shared,
        onboarding_id: onboardingId,
        onboarding_status: 'Pending',
        agreement_status: String(selectedAgreement.status || sourceInvoice.agreement_status || 'Signed').trim() || 'Signed'
      },
      technicalPayload: null
    };
  },
  async ensureOperationsOnboardingForIssuedInvoice(invoice = {}, items = []) {
    const normalizedInvoice = this.normalizeInvoice(invoice || {});
    if (this.isRenewalInvoice({ ...invoice, ...normalizedInvoice })) {
      console.info('[Renewal] Skipping Operations Onboarding for renewal invoice.');
      return null;
    }
    if (!this.isIssuedInvoice(normalizedInvoice)) return null;

    const invoiceIdCandidate = this.invoiceDbId(normalizedInvoice.id) || String(normalizedInvoice.id || '').trim();
    const invoiceId = this.isUuid(invoiceIdCandidate) ? invoiceIdCandidate : '';
    const invoiceNumber = String(normalizedInvoice.invoice_number || normalizedInvoice.invoice_id || '').trim();

    if (!invoiceId) {
      console.warn('[Invoice] Cannot create Operations onboarding for issued invoice because the internal invoice UUID is missing.', { invoiceNumber, invoiceIdCandidate });
      return null;
    }

    const client = this.getSupabaseClient?.();
    if (client) {
      try {
        let existingQuery = client
          .from('operations_onboarding')
          .select('id,onboarding_id,invoice_id,source_invoice_id,invoice_number,source_invoice_number')
          .limit(1);

        existingQuery = existingQuery.or(`invoice_id.eq.${invoiceId},source_invoice_id.eq.${invoiceId}`);

        const { data: existingRows, error: existingError } = await existingQuery;
        if (!existingError && Array.isArray(existingRows) && existingRows.length) {
          console.info('[Invoice] Operations onboarding already exists for issued invoice.', existingRows[0]);
          return existingRows[0];
        }
        if (existingError) {
          console.warn('[Invoice] Unable to check existing Operations onboarding row before create.', existingError);
        }
      } catch (checkError) {
        console.warn('[Invoice] Existing Operations onboarding check failed.', checkError);
      }
    }

    let invoiceItems = Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [];

    if (!invoiceItems.length && invoiceId && client) {
      try {
        const { data, error } = await client
          .from('invoice_items')
          .select('*')
          .eq('invoice_id', invoiceId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        invoiceItems = Array.isArray(data) ? data.map(item => this.normalizeItem(item)) : [];
      } catch (loadError) {
        console.warn('[Invoice] Unable to load invoice_items for issued invoice Operations onboarding.', loadError);
      }
    }

    const annualItems = invoiceItems.filter(item => this.isSubscriptionSection(item?.section));
    if (!annualItems.length) {
      console.info('[Invoice] Issued invoice has no Annual SaaS/subscription invoice items. Operations onboarding was not created.');
      return null;
    }

    const selectedAgreementItemIds = annualItems
      .map(item => String(item.source_agreement_item_id || item.sourceAgreementItemId || '').trim())
      .filter(Boolean);
    const setupAgreementItemIds = invoiceItems
      .filter(item => this.isOneTimeFeeItem(item))
      .map(item => String(item.source_agreement_item_id || item.sourceAgreementItemId || '').trim())
      .filter(Boolean);

    const created = await this.createOperationsAndTechnicalForInvoicedLocations(
      normalizedInvoice,
      normalizedInvoice,
      invoiceItems,
      selectedAgreementItemIds
    );

    const agreementItemIdsToMark = this.getUniqueTextList([...selectedAgreementItemIds, ...setupAgreementItemIds]);
    if (invoiceId && agreementItemIdsToMark.length) {
      await this.markSelectedAgreementItemsInvoiced(invoiceId, agreementItemIdsToMark).catch(error => {
        console.warn('[Invoice] Agreement item invoice-status update failed after issued invoice Operations row creation.', error);
        UI.toast('Operations onboarding was created, but agreement item invoice flags could not be updated.');
      });
    }

    return created;
  },
  async createOperationsAndTechnicalForInvoicedLocations(invoice = {}, persistedInvoice = {}, items = [], selectedAgreementItemIds = []) {
    const seed = this.buildInvoiceOperationsTechnicalSeed(invoice, persistedInvoice, items, selectedAgreementItemIds);
    if (!seed) {
      console.info('[Invoice] No invoiced Annual SaaS locations found; Operations/Technical request was not created.');
      return null;
    }
    let onboardingRecord = null;
    try {
      const onboardingResponse = await Api.saveOperationsOnboarding(seed.operationPayload);
      onboardingRecord = Api.unwrapApiPayload?.(onboardingResponse) || onboardingResponse || null;
      if (window.OperationsOnboarding?.upsertLocalRow) {
        const returnedRecord = onboardingRecord && typeof onboardingRecord === 'object' ? onboardingRecord : {};
        window.OperationsOnboarding.upsertLocalRow({
          ...returnedRecord,
          ...seed.operationPayload,
          id: returnedRecord.id || returnedRecord.db_id || seed.operationPayload.id || '',
          db_id: returnedRecord.db_id || returnedRecord.id || seed.operationPayload.db_id || '',
          onboarding_id: returnedRecord.onboarding_id || seed.operationPayload.onboarding_id
        });
      }
    } catch (error) {
      console.warn('[Invoice] Unable to create Operations onboarding row for invoiced locations.', error);
      UI.toast('Invoice created, but Operations onboarding row was not created: ' + (error?.message || 'Unknown error'));
      return null;
    }

    // Important: do NOT create a Technical Admin request automatically here.
    // The Operations user must click "Technical Admin Request" manually on the invoice-batch row.
    if (window.OperationsOnboarding?.loadAndRefresh) {
      Api.clearApiCache?.('operations_onboarding:list');
      window.OperationsOnboarding.loadAndRefresh({ force: true }).catch(error => console.warn('[Invoice] Operations refresh failed after invoiced-location request.', error));
    }
    return { ...seed, onboardingRecord, technicalPayload: null };
  },
  async markSelectedAgreementItemsInvoiced(invoiceId, itemIds = []) {
    const ids = [...new Set((Array.isArray(itemIds) ? itemIds : []).map(id => String(id || '').trim()).filter(Boolean))];
    const id = String(invoiceId || '').trim();
    if (!id || !ids.length) return;
    const client = this.requireSupabaseClient();
    const { error } = await client
      .from('agreement_items')
      .update({ invoice_status: 'invoiced', invoiced_invoice_id: id, invoiced_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw new Error(`Invoice saved, but agreement item invoice status update failed: ${error.message || 'Unknown error'}`);
  },
  async hydrateFromAgreement(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) return;
    try {
      const response = await Api.getAgreement(id);
      let { agreement, items } = this.extractAgreementAndItems(response, id);
      if (!Array.isArray(items) || !items.length) {
        const directItems = await this.loadAgreementItemsDirectForInvoice(agreement, id);
        if (directItems.length) items = directItems;
      }
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
        payment_term: this.resolveInvoicePaymentTerm({}, agreement, { mode: 'new' }),
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
        is_poc: this.normalizeTruthy(agreement.is_poc ?? agreement.isPoc),
        poc_location_count: this.toNullableNumber(agreement.poc_location_count ?? agreement.pocLocationCount),
        poc_license_count: this.toNullableNumber(agreement.poc_license_count ?? agreement.pocLicenseCount),
        poc_license_months: this.toNullableNumber(agreement.poc_license_months ?? agreement.pocLicenseMonths),
        poc_service_start_date: this.normalizeDateInputValue(agreement.poc_service_start_date ?? agreement.pocServiceStartDate),
        poc_service_end_date: this.normalizeDateInputValue(agreement.poc_service_end_date ?? agreement.pocServiceEndDate),
        poc_success_kpis: String(agreement.poc_success_kpis ?? agreement.pocSuccessKpis ?? this.getDefaultPocSuccessKpis()).trim(),
        poc_conversion_commitment: String(agreement.poc_conversion_commitment ?? agreement.pocConversionCommitment ?? '').trim(),
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
      const agreementPaymentTerm = this.resolveInvoicePaymentTerm({}, agreement || {}, { mode: 'new' });
      mappedInvoice.payment_term = agreementPaymentTerm;
      console.log('[invoice payment term sync]', {
        agreementPaymentTerm,
        invoicePaymentTerm: mappedInvoice.payment_term
      });
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
      const normalizedItems = this.filterInvoiceCommercialItems(items).map(item => this.copyInvoiceItemFields(item, this.mergeCatalogItem(item, catalogLookup)));
      let annualItems = normalizedItems.filter(item => this.isSubscriptionSection(item.section));
      const oneTimeItems = normalizedItems.filter(item => this.isOneTimeFeeItem(item));
      const alreadyInvoicedSetupItemIds = await this.getAlreadyInvoicedSetupAgreementItemIds(agreementUuid || id);
      const actualInvoicedMap = await this.getActualInvoicedAgreementItemMap(annualItems.map(item => this.getAgreementItemRecordId(item)));
      annualItems = annualItems.map(item => {
        const itemId = this.getAgreementItemRecordId(item);
        const actualInvoiceId = itemId ? actualInvoicedMap.get(itemId) : '';
        return {
          ...item,
          invoice_status: actualInvoiceId ? 'invoiced' : 'not_invoiced',
          invoiced_invoice_id: actualInvoiceId && actualInvoiceId !== true ? actualInvoiceId : ''
        };
      });
      const invoiceableItems = annualItems.filter(item => this.isAgreementItemInvoiceable(item) && this.getAgreementItemRecordId(item));
      const alreadyInvoicedItems = annualItems.filter(item => this.isAgreementItemInvoiced(item));
      this.state.selectedAgreementItemIds = new Set(invoiceableItems.map(item => this.getAgreementItemRecordId(item)).filter(Boolean));
      this.state.accountSetupBillingMode = 'per_selected_locations';
      this.state.agreementInvoiceSelection = {
        active: true,
        agreementUuid,
        annualItems,
        oneTimeItems,
        invoiceableItems,
        alreadyInvoicedItems,
        alreadyInvoicedSetupItemIds,
        setupBillingMode: 'per_selected_locations',
        setupFeesIncluded: 0,
        setupFeesSkippedAlreadyInvoiced: 0
      };
      if (E.invoiceAccountSetupBillingPerSelected) E.invoiceAccountSetupBillingPerSelected.checked = true;
      if (E.invoiceAccountSetupBillingFullFirst) E.invoiceAccountSetupBillingFullFirst.checked = false;
      const selectedItems = this.buildAgreementInvoiceItemsFromSelection();
      this.state.items = selectedItems;
      this.renderItems(selectedItems);
      this.renderAgreementLocationSelection();
      if (annualItems.length && !invoiceableItems.length) UI.toast('Invoice cannot be created because all Annual SaaS locations are already invoiced.');
      else if (!annualItems.length) UI.toast('No annual SaaS locations were found on this agreement.');
      const summary = this.deriveCalculatedSummary(mappedInvoice, selectedItems);
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
  buildInvoiceMetadataUpdatePayload() {
    const status = String(E.invoiceFormStatus?.value || this.state.selectedInvoice?.status || '').trim();
    const issueDate = this.normalizeDateInputValue(E.invoiceFormInvoiceDate?.value || this.state.selectedInvoice?.issue_date || this.state.selectedInvoice?.invoice_date);
    const dueDate = this.normalizeDateInputValue(E.invoiceFormDueDate?.value || this.state.selectedInvoice?.due_date);
    const paymentTerm = this.normalizePaymentTerm(E.invoiceFormPaymentTerm?.value || this.state.selectedInvoice?.payment_term || 'Net 30');
    const paymentScheduleMode = paymentTerm === 'Custom' ? 'manual' : this.normalizePaymentScheduleMode(E.invoiceFormPaymentScheduleMode?.value || this.state.selectedInvoice?.payment_schedule_mode, paymentTerm);
    return {
      status: status || 'Draft',
      payment_status: status || null,
      issue_date: issueDate || null,
      due_date: dueDate || null,
      payment_term: paymentTerm,
      payment_term_custom: String(E.invoiceFormPaymentTermsCustom?.value || this.state.selectedInvoice?.payment_term_custom || this.state.selectedInvoice?.payment_terms_custom || '').trim() || null,
      payment_schedule_mode: paymentScheduleMode
    };
  },
  isInvoiceWorkflowUnavailableResult(result) {
    if (!result || typeof result !== 'object') return false;
    if (result.unavailable === true || result.workflowUnavailable === true || result.fallback === true) return true;
    const reason = String(result.reason || result.message || '').trim().toLowerCase();
    return reason.includes('workflow validation is unavailable') ||
      reason.includes('save blocked until workflow is reachable') ||
      reason.includes('workflow service unavailable');
  },
  isInvoiceWorkflowTechnicalUnavailableError(error) {
    if (!error) return true;
    if (error instanceof TypeError || error instanceof ReferenceError) return true;
    const message = String(error?.message || error || '').trim().toLowerCase();
    return !message ||
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('rpc') ||
      message.includes('unavailable') ||
      message.includes('service unavailable') ||
      message.includes('does not exist') ||
      message.includes('not found') ||
      message.includes('undefined') ||
      message.includes('is not a function');
  },
  async enforceInvoiceWorkflowBeforeSave(currentRecord, workflowPayload) {
    const workflowEngine = window.WorkflowEngine;
    if (!workflowEngine || typeof workflowEngine.enforceBeforeSave !== 'function') {
      console.warn('[Invoice] Workflow validation unavailable; continuing invoice save fallback.', {
        reason: 'WorkflowEngine.enforceBeforeSave is unavailable.'
      });
      return { allowed: true, workflowUnavailable: true, fallback: true };
    }
    try {
      const workflowCheck = await workflowEngine.enforceBeforeSave('invoices', currentRecord, workflowPayload);
      if (this.isInvoiceWorkflowUnavailableResult(workflowCheck)) {
        console.warn('[Invoice] Workflow validation unavailable; continuing invoice save fallback.', workflowCheck);
        return { allowed: true, workflowUnavailable: true, fallback: true, originalWorkflowCheck: workflowCheck };
      }
      return workflowCheck;
    } catch (error) {
      if (this.isInvoiceWorkflowTechnicalUnavailableError(error)) {
        console.warn('[Invoice] Workflow validation unavailable; continuing invoice save fallback.', error);
        return { allowed: true, workflowUnavailable: true, fallback: true };
      }
      throw error;
    }
  },
  async saveExistingInvoiceMetadata(id) {
    if (!Permissions.canUpdateInvoice()) return UI.toast('You do not have permission to update invoices.');
    const payloadInvoice = this.buildInvoiceMetadataUpdatePayload();
    const currentRecord = this.state.rows.find(row => this.invoiceDbId(row.id) === id) || this.state.selectedInvoice || {};
    const wasIssuedBeforeSave = this.isIssuedInvoice(currentRecord);
    const workflowCheck = this.canUseAdminOverride() ? { allowed: true, skipped: true, reason: 'Admin override bypassed invoice workflow.' } : await this.enforceInvoiceWorkflowBeforeSave(currentRecord, {
      invoice_id: id,
      current_status: currentRecord?.status || '',
      requested_status: payloadInvoice.status || '',
      requested_changes: { invoice: payloadInvoice }
    });
    if (workflowCheck && !workflowCheck.allowed) {
      if (workflowCheck.pendingApproval === true && workflowCheck.approvalCreated === true) {
        UI.toast('Approval request submitted successfully.');
        return;
      }
      UI.toast(window.WorkflowEngine.composeDeniedMessage(workflowCheck, 'Invoice save blocked.'));
      return;
    }
    if (!this.validateManualPaymentSchedule(payloadInvoice)) return;
    this.state.saveInFlight = true;
    this.setFormBusy(true);
    console.time('entity-save');
    try {
      const response = await Api.updateInvoice(id, payloadInvoice);
      const parsed = this.extractInvoiceAndItems(response, id);
      const persisted = this.normalizeInvoice({
        ...(this.state.selectedInvoice || {}),
        ...payloadInvoice,
        ...(parsed?.invoice || {}),
        id: parsed?.invoice?.id || id
      });
      const persistedItems = this.state.items || [];
      const isIssuedAfterSave = this.isIssuedInvoice(persisted);
      const operationsResult = !wasIssuedBeforeSave && isIssuedAfterSave
        ? await this.ensureOperationsOnboardingForIssuedInvoice(persisted, persistedItems)
        : null;
      const normalized = this.upsertLocalRow(persisted);
      if (id && this.canUseAdminOverride()) this.logAdminOverride('invoice_metadata_update_override', currentRecord || null, normalized || persisted);
      const updatedInvoiceId = this.invoiceDbId(normalized?.id || persisted?.id || id);
      const isManualScheduleSave = this.normalizePaymentScheduleMode(payloadInvoice.payment_schedule_mode, payloadInvoice.payment_term) === 'manual';
      if (updatedInvoiceId) {
        if (isManualScheduleSave) {
          await this.saveManualInvoicePaymentSchedule(updatedInvoiceId, payloadInvoice);
        } else {
          await Api.recalculateInvoicePaymentSchedule(updatedInvoiceId).catch(error => {
            console.warn('[invoices] payment schedule recalculation failed after invoice metadata update', error);
          });
          this.clearInvoiceScheduleCache(updatedInvoiceId);
        }
      }
      if (!isManualScheduleSave) this.clearInvoiceScheduleCache(normalized?.id || id);
      this.setCachedDetail(normalized?.id || id, persisted, persistedItems);
      this.state.selectedInvoice = normalized || persisted;
      this.state.items = persistedItems;
      UI.toast(operationsResult?.onboardingRecord ? 'Invoice issued and Operations onboarding created.' : 'Invoice updated.');
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
  async saveForm() {
    if (this.state.saveInFlight) return;
    const id = String(E.invoiceForm?.dataset.id || '').trim();
    if (id) return this.saveExistingInvoiceMetadata(id);
    const { invoice, items } = this.collectFormValues();
    if (this.state.agreementInvoiceSelection?.active) {
      invoice.account_setup_billing_mode = this.getSetupBillingModeFromForm();
    }
    const sourceAgreementId = String(E.invoiceForm?.dataset.agreementId || invoice.agreement_id || '').trim();
    const isDirectCreate = !id && !sourceAgreementId;
    if (isDirectCreate && !String(invoice.company_id || '').trim()) {
      UI.toast('Please select a company.');
      return;
    }
    if (isDirectCreate && !String(invoice.contact_id || '').trim()) {
      UI.toast('Please select a contact.');
      return;
    }
    const agreementSelectionActive = !!this.state.agreementInvoiceSelection?.active;
    const selectedAgreementItemIds = agreementSelectionActive
      ? [...(this.state.selectedAgreementItemIds || new Set()).values()].map(value => String(value || '').trim()).filter(Boolean)
      : [];
    if (agreementSelectionActive && !selectedAgreementItemIds.length) {
      const hasInvoiceable = (this.state.agreementInvoiceSelection?.invoiceableItems || []).length > 0;
      UI.toast(hasInvoiceable ? 'Please select at least one agreement location to invoice.' : 'Invoice cannot be created because all Annual SaaS locations are already invoiced.');
      return;
    }
    let loadedSelection;
    try {
      loadedSelection = await window.CrmCompanyContactSelectors.validateCompanyContactSelection({ companyId: invoice.company_id, contactId: invoice.contact_id, moduleName: 'invoice' });
      Object.assign(invoice, window.CrmCompanyContactSelectors.applyLoadedCompanySnapshot(invoice, loadedSelection.loadedCompany, loadedSelection.loadedContact));
      console.log('[SAVE CHECK] final payload:', invoice);
    } catch (error) {
      UI.toast(error?.message || 'Selected company data mismatch. Please reselect the company.');
      return;
    }
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
    if (id && this.isIssuedInvoice(currentRecord) && !this.canUseAdminOverride()) {
      UI.toast('Issued invoices cannot be edited. Create a receipt to record payment.');
      return;
    }
    const requestedDiscount = items.reduce((max, item) => Math.max(max, this.toNumberSafe(item.discount_percent)), 0);
    const workflowCheck = this.canUseAdminOverride()
      ? { allowed: true, skipped: true, reason: 'Admin override bypassed invoice workflow.' }
      : await this.enforceInvoiceWorkflowBeforeSave(currentRecord, {
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
    if (!this.validateManualPaymentSchedule(payloadInvoice)) return;
    this.state.saveInFlight = true;
    this.setFormBusy(true);
    console.time('entity-save');
    try {
      let response;
      if (id) {
        if (!Permissions.canUpdateInvoice()) return UI.toast('You do not have permission to update invoices.');
        response = await Api.updateInvoice(id, payloadInvoice, items);
      } else {
        if (!Permissions.canCreateInvoice()) return UI.toast('You do not have permission to create invoices.');
        response = await Api.createInvoice(payloadInvoice, items);
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
      if (id && this.canUseAdminOverride()) this.logAdminOverride('invoice_update_override', currentRecord || null, normalized || persisted);
      if (!id) {
        const createdInvoiceId = this.invoiceDbId(
          normalized?.id ||
          persisted?.id ||
          parsed?.invoice?.id ||
          normalizedInvoice?.id ||
          ''
        );
        const invoiceForFollowUp = this.normalizeInvoice({
          ...normalizedInvoice,
          ...persisted,
          ...normalized,
          id: createdInvoiceId || normalized?.id || persisted?.id || normalizedInvoice?.id || '',
          invoice_id: normalized?.invoice_id || persisted?.invoice_id || normalizedInvoice?.invoice_id || '',
          invoice_number: normalized?.invoice_number || persisted?.invoice_number || normalizedInvoice?.invoice_number || ''
        });

        if (createdInvoiceId) {
          if (this.normalizePaymentScheduleMode(payloadInvoice.payment_schedule_mode, payloadInvoice.payment_term) !== 'manual') this.clearInvoiceScheduleCache(createdInvoiceId);
          if (this.normalizePaymentScheduleMode(payloadInvoice.payment_schedule_mode, payloadInvoice.payment_term) === 'manual') {
            await this.saveManualInvoicePaymentSchedule(createdInvoiceId, payloadInvoice);
          } else {
            await Api.recalculateInvoicePaymentSchedule(createdInvoiceId).catch(error => {
              console.warn('[invoices] payment schedule recalculation failed after invoice creation', error);
            });
          }
        }

        // Create the Operations row from the selected issued invoice batch first.
        // This must happen even if the agreement_items status update is blocked by RLS,
        // because Operations visibility must follow the invoice batch that was just created.
        const operationsResult = await this.ensureOperationsOnboardingForIssuedInvoice(invoiceForFollowUp, persistedItems);
        if (operationsResult?.onboardingRecord) {
          UI.toast('Invoice issued and Operations onboarding created.');
        } else {
          UI.toast('Invoice created.');
        }
      }
      if (this.normalizePaymentScheduleMode(payloadInvoice.payment_schedule_mode, payloadInvoice.payment_term) !== 'manual') this.clearInvoiceScheduleCache(normalized?.id || id);
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
    const workflowCheck = await this.validateReceiptWorkflowOrFallback(currentRecord, {
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
    await this.recalculateInvoicePaymentSchedule(id);
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
      const { invoiceUuid, invoice, items, receipts, paymentSchedule, creditNotes, canViewCreditNoteDetails } = await this.loadInvoicePreviewData(id);
      const html = this.buildInvoicePreviewHtml(invoice, items, receipts, paymentSchedule, creditNotes, { canViewCreditNoteDetails });
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
    this.openInvoice(this.normalizeInvoice({ ...this.emptyInvoice(), agreement_uuid: id, agreement_id: '', agreement_number: '' }), [], { readOnly: false });
    await this.hydrateFromAgreement(id);
    const selection = this.state.agreementInvoiceSelection || {};
    if (selection.active && !(selection.invoiceableItems || []).length) {
      UI.toast('Invoice cannot be created because all Annual SaaS locations are already invoiced.');
      this.closeForm();
    }
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
        if (String(E.invoiceForm?.dataset.id || '').trim()) return;
        const section = removeBtn.getAttribute('data-item-remove');
        const index = Number(removeBtn.getAttribute('data-item-index'));
        if (!section || !Number.isInteger(index) || index < 0) return;
        const groups = this.groupedItems(this.collectItems());
        if (!groups[section]) return;
        groups[section] = groups[section].filter((_, idx) => idx !== index);
        const items = [...groups.annual_saas, ...groups.one_time_fee];
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
      E.invoiceForm.addEventListener('input', event => {
        if (['invoiceFormStatus', 'invoiceFormPaidNow', 'invoiceFormGrandTotal', 'invoiceFormOldPaidTotal', 'invoiceFormSubtotalSubscription', 'invoiceFormSubtotalOneTime'].includes(event.target?.id)) {
          this.syncPaymentFieldsInForm();
        }
        if (['invoiceFormGrandTotal', 'invoiceFormDueDate'].includes(event.target?.id)) {
          this.refreshPaymentSchedule();
        }
        const field = event.target?.getAttribute('data-item-field');
        if (!field) return;
        if (String(E.invoiceForm?.dataset.id || '').trim()) return;
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
          quantity: get('quantity'),
          section
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
        if (event.target?.id === 'invoiceFormPaymentTerm' && E.invoiceFormPaymentScheduleMode) {
          E.invoiceFormPaymentScheduleMode.value = this.normalizePaymentTerm(event.target.value) === 'Custom' ? 'manual' : 'auto';
        }
        if (event.target?.id === 'invoiceFormPaymentTerm' && E.invoiceFormPaymentScheduleMode) {
          E.invoiceFormPaymentScheduleMode.value = this.normalizePaymentTerm(event.target.value) === 'Custom' ? 'manual' : 'auto';
        }
        if (['invoiceFormDueDate', 'invoiceFormPaymentTerm', 'invoiceFormGrandTotal', 'invoiceFormPaymentScheduleMode'].includes(event.target?.id)) {
          this.refreshPaymentSchedule();
        }
        const field = event.target?.getAttribute('data-item-field');
        if (field !== 'item_name') return;
        if (String(E.invoiceForm?.dataset.id || '').trim()) return;
        const tr = event.target.closest('tr[data-item-row]');
        const section = tr?.getAttribute('data-item-row');
        if (!tr || !section || section === 'capability') return;
        this.applyCatalogSelectionToRow(tr, section);
      });
    }
    if (E.invoicePaymentScheduleAddRowBtn) {
      E.invoicePaymentScheduleAddRowBtn.addEventListener('click', () => this.addManualPaymentScheduleRow());
    }
    if (E.invoiceAddAnnualRowBtn) {
      E.invoiceAddAnnualRowBtn.addEventListener('click', () => {
        if (String(E.invoiceForm?.dataset.id || '').trim()) return;
        const items = this.collectItems();
        items.push(this.normalizeItem({ section: 'annual_saas', quantity: 12 }));
        this.renderItems(items);
        this.applyTotalsToForm(this.deriveCalculatedSummary(this.collectFormValues().invoice, items));
      });
    }
    if (E.invoiceAddOneTimeRowBtn) {
      E.invoiceAddOneTimeRowBtn.addEventListener('click', () => {
        if (String(E.invoiceForm?.dataset.id || '').trim()) return;
        const items = this.collectItems();
        items.push(this.normalizeItem({ section: 'one_time_fee', quantity: 1 }));
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
