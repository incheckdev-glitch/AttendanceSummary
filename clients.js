const Clients = {
  clientFields: [
    'client_id',
    'client_code',
    'customer_name',
    'customer_legal_name',
    'normalized_company_key',
    'primary_contact_name',
    'primary_contact_email',
    'phone',
    'country',
    'address',
    'billing_address',
    'tax_number',
    'industry',
    'status',
    'notes',
    'source',
    'created_at',
    'updated_at'
  ],
  state: {
    rows: [],
    filteredRows: [],
    selectedClientId: '',
    agreements: [],
    agreementItems: [],
    invoices: [],
    invoiceItems: [],
    receipts: [],
    receiptItems: [],
    loading: false,
    loadError: '',
    loaded: false,
    lastLoadedAt: 0,
    cacheTtlMs: 2 * 60 * 1000,
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    total: 0,
    search: '',
    status: 'All',
    sort: 'due_desc',
    detailCache: {},
    detailCacheTtlMs: 90 * 1000,
    detailLoading: false,
    activeDetailTab: 'overview',
    statementFilters: { status: 'all', dateFrom: '', dateTo: '', searchDoc: '' },
    renewalsFilters: { dateFrom: '', dateTo: '' }
  },
  getField(raw = {}, ...keys) {
    const found = keys.find(key => raw[key] !== undefined && raw[key] !== null);
    return found ? raw[found] : '';
  },
  normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  },
  normalizeMatchValue(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  },
  valuesMatch(left, right) {
    const l = this.normalizeMatchValue(left);
    const r = this.normalizeMatchValue(right);
    return Boolean(l && r && l === r);
  },
  normalizeAgreementForClient(agreement = {}) {
    return {
      ...agreement,
      client_name:
        agreement.client_name ||
        agreement.customer_name ||
        agreement.customer_legal_name ||
        agreement.provider_name ||
        '',
      client_email:
        agreement.client_email ||
        agreement.customer_contact_email ||
        '',
      client_phone:
        agreement.client_phone ||
        agreement.customer_contact_mobile ||
        '',
      number_of_locations:
        agreement.number_of_locations ||
        agreement.locations_count ||
        agreement.location_count ||
        agreement.subtotal_locations ||
        '',
      payment_terms:
        agreement.payment_terms ||
        agreement.payment_term ||
        '',
      payment_term:
        agreement.payment_term ||
        agreement.payment_terms ||
        '',
      service_start_date:
        agreement.service_start_date ||
        agreement.effective_date ||
        agreement.agreement_date ||
        '',
      service_end_date:
        agreement.service_end_date ||
        '',
      total_value:
        agreement.total_value ||
        agreement.grand_total ||
        agreement.subtotal_locations ||
        0
    };
  },
  agreementBelongsToClient(agreement = {}, client = {}) {
    const normalizedAgreement = this.normalizeAgreementForClient(agreement);
    const agreementKeys = [
      normalizedAgreement.client_name,
      normalizedAgreement.client_email,
      normalizedAgreement.client_phone,
      agreement.customer_name,
      agreement.customer_contact_email,
      agreement.customer_contact_mobile
    ].filter(Boolean);
    const clientKeys = [
      client.client_name,
      client.company_name,
      client.customer_name,
      client.name,
      client.email,
      client.phone,
      client.mobile,
      client.primary_contact_email,
      client.primary_email
    ].filter(Boolean);
    return agreementKeys.some(agreementKey => clientKeys.some(clientKey => this.valuesMatch(agreementKey, clientKey)));
  },
  collectClientMatchValues_(client = {}) {
    return [
      client.id,
      client.client_id,
      client.client_uuid,
      client.client_name,
      client.company_name,
      client.name,
      client.customer_name,
      client.customer_legal_name,
      client.primary_contact_email,
      client.email,
      client.phone
    ].filter(Boolean);
  },
  collectRecordMatchValues_(record = {}) {
    return [
      record.id,
      record.client_id,
      record.client_uuid,
      record.customer_id,
      record.company_id,
      record.client_name,
      record.company_name,
      record.customer_name,
      record.customer_legal_name,
      record.email,
      record.client_email,
      record.phone,
      record.client_phone,
      record.agreement_id,
      record.agreement_number,
      record.invoice_id,
      record.invoice_number,
      record.receipt_id,
      record.receipt_number
    ].filter(Boolean);
  },
  recordBelongsToClient(record = {}, client = {}) {
    const clientValues = this.collectClientMatchValues_(client);
    const recordValues = this.collectRecordMatchValues_(record);
    return recordValues.some(rv => clientValues.some(cv => this.valuesMatch(rv, cv)));
  },
  toNumberSafe(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  normalizeCompanyKey(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
  extractRows(response) {
    const candidates = [
      response,
      response?.clients,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.clients,
      response?.result?.clients,
      response?.payload?.clients
    ];
    for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
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
  normalizeClient(raw = {}) {
    const customerName = String(raw.customer_name || raw.customerName || raw.client_name || raw.clientName || '').trim();
    const legalName = String(raw.customer_legal_name || raw.customerLegalName || raw.company_name || raw.companyName || '').trim();
    const normalized = {
      id: String(raw.id || '').trim(),
      client_id: String(raw.client_id || raw.clientId || '').trim(),
      client_code: String(raw.client_code || raw.clientCode || '').trim(),
      customer_name: customerName,
      customer_legal_name: legalName,
      normalized_company_key: String(raw.normalized_company_key || raw.normalizedCompanyKey || '').trim(),
      primary_contact_name: String(raw.primary_contact_name || raw.primaryContactName || raw.customer_contact_name || '').trim(),
      primary_contact_email: String(raw.primary_contact_email || raw.primaryContactEmail || raw.customer_contact_email || raw.primary_email || raw.primaryEmail || '').trim(),
      phone: String(raw.phone || raw.customer_contact_mobile || raw.primary_phone || raw.primaryPhone || '').trim(),
      country: String(raw.country || '').trim(),
      address: String(raw.address || raw.company_address || raw.customer_address || '').trim(),
      billing_address: String(raw.billing_address || raw.billingAddress || '').trim(),
      tax_number: String(raw.tax_number || raw.taxNumber || '').trim(),
      industry: String(raw.industry || '').trim(),
      status: String(raw.status || raw.account_status || 'Active').trim(),
      source_agreement_id: String(raw.source_agreement_id || raw.sourceAgreementId || '').trim(),
      total_agreements: this.toNumberSafe(raw.total_agreements ?? raw.totalAgreements),
      total_locations: this.toNumberSafe(raw.total_locations ?? raw.totalLocations),
      total_value: this.toNumberSafe(raw.total_value ?? raw.totalValue),
      total_paid: this.toNumberSafe(raw.total_paid ?? raw.totalPaid),
      total_due: this.toNumberSafe(raw.total_due ?? raw.totalDue),
      notes: String(raw.notes || '').trim(),
      source: String(raw.source || '').trim(),
      created_at: String(raw.created_at || raw.createdAt || '').trim(),
      updated_at: String(raw.updated_at || raw.updatedAt || '').trim()
    };
    if (!normalized.normalized_company_key) {
      normalized.normalized_company_key = this.normalizeCompanyKey(legalName || customerName);
    }
    return normalized;
  },
  normalizeAgreement(raw = {}) {
    return this.normalizeAgreementForClient({
      id: String(raw.id || '').trim(),
      agreement_id: String(raw.agreement_id || raw.agreementId || raw.id || '').trim(),
      agreement_number: String(raw.agreement_number || raw.agreementNumber || '').trim(),
      client_id: String(raw.client_id || raw.clientId || '').trim(),
      client_uuid: String(raw.client_uuid || raw.clientUuid || '').trim(),
      customer_id: String(raw.customer_id || raw.customerId || '').trim(),
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      client_name: String(raw.client_name || raw.clientName || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      email: String(raw.email || '').trim(),
      client_email: String(raw.client_email || raw.clientEmail || raw.customer_contact_email || '').trim(),
      phone: String(raw.phone || '').trim(),
      client_phone: String(raw.client_phone || raw.clientPhone || raw.customer_contact_mobile || '').trim(),
      status: String(raw.status || '').trim(),
      grand_total: this.toNumberSafe(raw.grand_total ?? raw.grandTotal),
      currency: String(raw.currency || raw.currency_code || raw.currencyCode || '').trim() || 'USD',
      updated_at: String(raw.updated_at || raw.updatedAt || '').trim(),
      service_start_date: String(raw.service_start_date || raw.serviceStartDate || raw.effective_date || '').trim(),
      service_end_date: String(raw.service_end_date || raw.serviceEndDate || '').trim(),
      renewal_date: String(raw.renewal_date || raw.renewalDate || raw.next_renewal_date || raw.nextRenewalDate || '').trim(),
      customer_sign_date: String(raw.customer_sign_date || raw.customerSignDate || '').trim(),
      signed_date: String(raw.signed_date || raw.signedDate || raw.customer_sign_date || raw.customerSignDate || '').trim(),
      agreement_date: String(raw.agreement_date || raw.agreementDate || '').trim(),
      location_name: String(raw.location_name || raw.locationName || '').trim(),
      items: Array.isArray(raw.items)
        ? raw.items
        : Array.isArray(raw.agreement_items)
          ? raw.agreement_items
          : Array.isArray(raw.line_items)
            ? raw.line_items
            : []
    });
  },
  normalizeAgreementItem(raw = {}) {
    return {
      id: String(raw.id || raw.item_id || raw.itemId || '').trim(),
      agreement_id: String(raw.agreement_id || raw.agreementId || '').trim(),
      section: String(raw.section || raw.category || raw.type || '').trim(),
      location_name: String(raw.location_name || raw.locationName || '').trim(),
      item_name: String(raw.item_name || raw.itemName || raw.module || raw.module_name || raw.moduleName || '').trim(),
      billing_frequency: String(raw.billing_frequency || raw.billingFrequency || raw.frequency || '').trim(),
      service_start_date: String(raw.service_start_date || raw.serviceStartDate || '').trim(),
      service_end_date: String(raw.service_end_date || raw.serviceEndDate || '').trim(),
      line_total: this.toNumberSafe(raw.line_total ?? raw.lineTotal),
      created_at: String(raw.created_at || raw.createdAt || '').trim()
    };
  },
  normalizeInvoice(raw = {}) {
    return {
      id: String(raw.id || '').trim(),
      invoice_id: String(raw.invoice_id || raw.invoiceId || '').trim(),
      invoice_number: String(raw.invoice_number || raw.invoiceNumber || '').trim(),
      agreement_id: String(raw.agreement_id || raw.agreementId || '').trim(),
      agreement_number: String(raw.agreement_number || raw.agreementNumber || '').trim(),
      client_id: String(raw.client_id || raw.clientId || '').trim(),
      client_uuid: String(raw.client_uuid || raw.clientUuid || '').trim(),
      customer_id: String(raw.customer_id || raw.customerId || '').trim(),
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      client_name: String(raw.client_name || raw.clientName || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      email: String(raw.email || '').trim(),
      client_email: String(raw.client_email || raw.clientEmail || '').trim(),
      status: String(raw.status || raw.payment_state || '').trim(),
      grand_total: this.toNumberSafe(raw.invoice_total ?? raw.invoiceTotal ?? raw.grand_total ?? raw.grandTotal),
      currency: String(raw.currency || raw.currency_code || raw.currencyCode || '').trim() || 'USD',
      amount_paid: this.toNumberSafe(raw.received_amount ?? raw.receivedAmount ?? raw.amount_paid ?? raw.amountPaid),
      pending_amount: this.toNumberSafe(raw.pending_amount ?? raw.pendingAmount),
      updated_at: String(raw.updated_at || raw.updatedAt || '').trim(),
      issued_date: String(raw.issued_date || raw.issue_date || raw.invoice_date || '').trim(),
      due_date: String(raw.due_date || raw.dueDate || '').trim(),
      reference: String(raw.agreement_id || raw.agreementId || raw.reference || raw.ref || '').trim(),
      notes: String(raw.notes || '').trim(),
      location_name: String(raw.location_name || raw.locationName || '').trim(),
      created_at: String(raw.created_at || raw.createdAt || '').trim()
    };
  },
  normalizeReceipt(raw = {}) {
    return {
      id: String(raw.id || '').trim(),
      receipt_id: String(raw.receipt_id || raw.receiptId || '').trim(),
      receipt_number: String(raw.receipt_number || raw.receiptNumber || '').trim(),
      invoice_id: String(raw.invoice_id || raw.invoiceId || '').trim(),
      invoice_number: String(raw.invoice_number || raw.invoiceNumber || '').trim(),
      agreement_id: String(raw.agreement_id || raw.agreementId || '').trim(),
      agreement_number: String(raw.agreement_number || raw.agreementNumber || '').trim(),
      client_id: String(raw.client_id || raw.clientId || '').trim(),
      client_uuid: String(raw.client_uuid || raw.clientUuid || '').trim(),
      customer_id: String(raw.customer_id || raw.customerId || '').trim(),
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      client_name: String(raw.client_name || raw.clientName || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      email: String(raw.email || '').trim(),
      client_email: String(raw.client_email || raw.clientEmail || '').trim(),
      payment_state: String(raw.payment_state || raw.status || '').trim(),
      received_amount: this.toNumberSafe(raw.amount_received ?? raw.amountReceived ?? raw.received_amount ?? raw.receivedAmount ?? raw.amount_paid),
      pending_amount: this.toNumberSafe(raw.pending_amount ?? raw.pendingAmount),
      currency: String(raw.currency || raw.currency_code || raw.currencyCode || '').trim() || 'USD',
      updated_at: String(raw.updated_at || raw.updatedAt || '').trim(),
      created_at: String(raw.created_at || raw.createdAt || '').trim(),
      receipt_date: String(raw.receipt_date || raw.received_date || '').trim(),
      reference: String(raw.payment_reference || raw.reference || raw.ref || '').trim(),
      notes: String(raw.notes || '').trim()
    };
  },
  resolveLatestAgreementContext_(clientId = '') {
    const agreements = this.listClientRelatedAgreements_(clientId)
      .slice()
      .sort((a, b) => new Date(b.updated_at || b.service_start_date || 0).getTime() - new Date(a.updated_at || a.service_start_date || 0).getTime());
    const preferred =
      agreements.find(item => this.isActiveAgreement(item)) ||
      agreements[0] ||
      null;
    return { agreements, preferred };
  },
  buildClientActionPrefill_(client = {}) {
    const clientId = String(client.client_id || '').trim();
    const { agreements, preferred } = this.resolveLatestAgreementContext_(clientId);
    const legalName = String(client.customer_legal_name || '').trim();
    const displayName = String(client.customer_name || legalName || '').trim();
    const preferredBilling = String(preferred?.billing_frequency || '').trim();
    const preferredPaymentTerm = String(preferred?.payment_term || '').trim();
    return {
      clientId,
      agreements,
      preferredAgreement: preferred,
      customerName: displayName,
      customerLegalName: legalName || displayName,
      contactName: String(client.primary_contact_name || '').trim(),
      contactEmail: String(client.primary_contact_email || '').trim(),
      contactPhone: String(client.phone || '').trim(),
      address: String(client.address || client.billing_address || '').trim(),
      billingFrequency: preferredBilling,
      paymentTerm: preferredPaymentTerm
    };
  },
  buildProposalDraftFromClient_(client = {}) {
    const prefill = this.buildClientActionPrefill_(client);
    const base = window.Proposals?.emptyProposal ? window.Proposals.emptyProposal() : {};
    return {
      ...base,
      client_id: prefill.clientId,
      customer_name: prefill.customerName,
      customer_address: prefill.address,
      customer_contact_name: prefill.contactName,
      customer_contact_mobile: prefill.contactPhone,
      customer_contact_email: prefill.contactEmail,
      billing_frequency: prefill.billingFrequency,
      payment_term: prefill.paymentTerm
    };
  },
  buildAgreementDraftFromClient_(client = {}) {
    const prefill = this.buildClientActionPrefill_(client);
    const base = window.Agreements?.emptyAgreement ? window.Agreements.emptyAgreement() : {};
    return {
      ...base,
      id: '',
      agreement_id: '',
      agreement_number: '',
      client_id: prefill.clientId,
      customer_name: prefill.customerName,
      customer_legal_name: prefill.customerLegalName,
      customer_address: prefill.address,
      customer_contact_name: prefill.contactName,
      customer_contact_mobile: prefill.contactPhone,
      customer_contact_email: prefill.contactEmail,
      billing_frequency: prefill.billingFrequency,
      payment_term: prefill.paymentTerm,
      status: 'Draft'
    };
  },
  buildInvoiceDraftFromClient_(client = {}) {
    const prefill = this.buildClientActionPrefill_(client);
    const base = window.Invoices?.emptyInvoice ? window.Invoices.emptyInvoice() : {};
    return {
      ...base,
      id: '',
      invoice_id: '',
      client_id: prefill.clientId,
      agreement_id: String(prefill.preferredAgreement?.id || '').trim(),
      customer_name: prefill.customerName,
      customer_legal_name: prefill.customerLegalName,
      customer_address: prefill.address,
      customer_contact_name: prefill.contactName,
      customer_contact_email: prefill.contactEmail,
      billing_frequency: prefill.billingFrequency,
      payment_term: prefill.paymentTerm
    };
  },
  async openAgreementCloneDraft_(sourceAgreement = {}, client = {}) {
    const sourceUuid = String(sourceAgreement.id || '').trim();
    if (!sourceUuid || !window.Agreements?.openAgreementForm) return;
    const prefill = this.buildClientActionPrefill_(client);
    try {
      const response = await window.Agreements?.getAgreement?.(sourceUuid);
      const extracted = window.Agreements?.extractAgreementAndItems?.(response, sourceUuid) || {};
      const source = extracted.agreement || sourceAgreement;
      const sourceItems = Array.isArray(extracted.items) ? extracted.items : [];
      const cloned = {
        ...(window.Agreements.emptyAgreement ? window.Agreements.emptyAgreement() : {}),
        ...source,
        id: '',
        agreement_id: '',
        agreement_number: '',
        client_id: prefill.clientId,
        customer_name: source.customer_name || prefill.customerName,
        customer_legal_name: source.customer_legal_name || prefill.customerLegalName,
        customer_contact_name: source.customer_contact_name || prefill.contactName,
        customer_contact_mobile: source.customer_contact_mobile || prefill.contactPhone,
        customer_contact_email: source.customer_contact_email || prefill.contactEmail,
        customer_address: source.customer_address || prefill.address,
        status: 'Draft',
        signed_date: '',
        customer_sign_date: '',
        provider_sign_date: ''
      };
      const clonedItems = sourceItems.map(item => ({ ...item, item_id: '', agreement_id: '' }));
      console.debug('[Clients] opening create-from-previous-agreement draft', { sourceUuid, items: clonedItems.length });
      window.Agreements.openAgreementForm(cloned, clonedItems, { readOnly: false });
      UI.toast('Agreement draft opened from previous agreement.');
    } catch (error) {
      UI.toast(error?.message || 'Unable to open agreement draft from previous agreement.');
    }
  },
  matchesClient_(record = {}, client = {}) {
    return this.recordBelongsToClient(record, client);
  },
  matchesClientAgreement_(agreement = {}, client = {}) {
    const sourceAgreementId = String(client.source_agreement_id || '').trim();
    if (sourceAgreementId) {
      const agreementUuid = String(agreement.id || '').trim();
      const agreementBusinessId = String(agreement.agreement_id || '').trim();
      if (agreementUuid && agreementUuid === sourceAgreementId) return true;
      if (agreementBusinessId && agreementBusinessId === sourceAgreementId) return true;
    }
    return this.agreementBelongsToClient(agreement, client) || this.matchesClient_(agreement, client);
  },
  listClientRelatedAgreements_(clientId) {
    const client = this.state.rows.find(row => row.client_id === clientId);
    if (!client) return [];
    const matchedAgreements = this.state.agreements.filter(item => this.matchesClientAgreement_(item, client));
    console.log('[AgreementMapping] matched agreements for client', {
      clientName: client?.client_name || client?.company_name || client?.name || client?.customer_name,
      matched: matchedAgreements.length
    });
    return matchedAgreements;
  },
  listClientAgreementLocationItems_(clientId) {
    const linkedAgreements = this.listClientRelatedAgreements_(clientId);
    const linkedAgreementUuidSet = new Set(linkedAgreements.map(item => String(item.id || '').trim()).filter(Boolean));
    return this.state.agreementItems
      .filter(item => linkedAgreementUuidSet.has(String(item.agreement_id || '').trim()))
      .filter(item => this.isAnnualSaasClientLocationItem(item));
  },
  listClientRelatedInvoices_(clientId) {
    const client = this.state.rows.find(row => row.client_id === clientId);
    if (!client) return [];
    const linkedAgreements = this.listClientRelatedAgreements_(clientId);
    const linkedAgreementUuids = new Set(linkedAgreements.flatMap(item => [item.id, item.agreement_id]).map(v => String(v || '').trim()).filter(Boolean));
    const linkedAgreementNumbers = new Set(linkedAgreements.map(item => String(item.agreement_number || '').trim()).filter(Boolean));
    return this.state.invoices.filter(item => {
      if (this.matchesClient_(item, client)) return true;
      const invoiceAgreementUuid = String(item.agreement_id || '').trim();
      const invoiceAgreementNumber = String(item.agreement_number || '').trim();
      return Boolean(
        (invoiceAgreementUuid && linkedAgreementUuids.has(invoiceAgreementUuid)) ||
        (invoiceAgreementNumber && linkedAgreementNumbers.has(invoiceAgreementNumber))
      );
    });
  },
  listClientRelatedReceipts_(clientId) {
    const client = this.state.rows.find(row => row.client_id === clientId);
    if (!client) return [];
    const linkedInvoices = this.listClientRelatedInvoices_(clientId);
    const linkedInvoiceUuids = new Set(linkedInvoices.flatMap(item => [item.id, item.invoice_id]).map(v => String(v || '').trim()).filter(Boolean));
    const linkedInvoiceNumbers = new Set(linkedInvoices.map(item => String(item.invoice_number || '').trim()).filter(Boolean));
    return this.state.receipts.filter(item => {
      if (this.matchesClient_(item, client)) return true;
      const invoiceUuid = String(item.invoice_id || '').trim();
      const invoiceNumber = String(item.invoice_number || '').trim();
      return Boolean(
        (invoiceUuid && linkedInvoiceUuids.has(invoiceUuid)) ||
        (invoiceNumber && linkedInvoiceNumbers.has(invoiceNumber))
      );
    });
  },
  listClientRelatedInvoiceItems_(clientId) {
    const invoices = this.listClientRelatedInvoices_(clientId);
    const invoiceIds = new Set(invoices.flatMap(item => [item.id, item.invoice_id, item.invoice_number]).map(v => String(v || '').trim()).filter(Boolean));
    return this.state.invoiceItems.filter(item => {
      const links = [item.invoice_id, item.invoice_number, item.parent_invoice_id].map(v => String(v || '').trim()).filter(Boolean);
      return links.some(link => invoiceIds.has(link));
    });
  },
  listClientRelatedReceiptItems_(clientId) {
    const receipts = this.listClientRelatedReceipts_(clientId);
    const receiptIds = new Set(receipts.flatMap(item => [item.id, item.receipt_id, item.receipt_number]).map(v => String(v || '').trim()).filter(Boolean));
    return this.state.receiptItems.filter(item => {
      const links = [item.receipt_id, item.receipt_number, item.parent_receipt_id].map(v => String(v || '').trim()).filter(Boolean);
      return links.some(link => receiptIds.has(link));
    });
  },
  parseFlexibleDate_(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();
    const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      const year = Number(dmy[3]);
      const assumeDmy = day > 12;
      const first = assumeDmy ? month : day;
      const second = assumeDmy ? day : month;
      const parsed = new Date(Date.UTC(year, first - 1, second));
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return '';
  },
  dateValueForSort_(row = {}) {
    return this.parseFlexibleDate_(row.date || row.renewal_date || row.service_end_date || row.created_at || row.updated_at || '');
  },
  pickAmount_(raw = {}, fields = []) {
    const found = fields.find(key => raw[key] !== undefined && raw[key] !== null && raw[key] !== '');
    return this.toNumberSafe(found ? raw[found] : 0);
  },
  isSignedAgreement(agreement = {}) {
    return this.normalizeText(agreement.status).includes('signed') || Boolean(String(agreement.signed_date || agreement.customer_sign_date || '').trim());
  },
  isActiveAgreement(agreement = {}) {
    const token = this.normalizeText(agreement.status);
    return token.includes('active') || token.includes('signed');
  },
  findOrCreateClientFromSignedAgreement_(agreement = {}) {
    if (!this.isSignedAgreement(agreement)) return null;
    const key = this.normalizeCompanyKey(agreement.customer_legal_name || agreement.customer_name);
    let existing = this.state.rows.find(client => this.normalizeCompanyKey(client.customer_legal_name) === key);
    if (!existing) {
      existing = this.state.rows.find(client => this.normalizeCompanyKey(client.customer_name) === key);
    }
    if (existing) {
      if (!existing.customer_legal_name && agreement.customer_legal_name) existing.customer_legal_name = agreement.customer_legal_name;
      existing.updated_at = agreement.updated_at || existing.updated_at;
      return existing;
    }
    const fallbackName = String(agreement.customer_name || agreement.customer_legal_name || '').trim();
    const created = this.normalizeClient({
      client_id: `virtual-${key || Date.now()}`,
      customer_name: fallbackName,
      customer_legal_name: String(agreement.customer_legal_name || '').trim(),
      normalized_company_key: key,
      status: 'Active',
      source: 'signed_agreement',
      updated_at: agreement.updated_at,
      created_at: agreement.customer_sign_date || agreement.agreement_date
    });
    this.state.rows.push(created);
    return created;
  },
  maxDate(...values) {
    const valid = values
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .map(value => new Date(value))
      .filter(date => !Number.isNaN(date.getTime()));
    if (!valid.length) return '';
    return new Date(Math.max(...valid.map(date => date.getTime()))).toISOString();
  },
  hasBackendAnalytics_(analytics) {
    return Boolean(analytics && typeof analytics === 'object' && !Array.isArray(analytics) && Object.keys(analytics).length);
  },
  resolveBackendAnalytics_(payload = {}) {
    if (!payload || typeof payload !== 'object') return null;
    if (this.hasBackendAnalytics_(payload.analytics)) return payload.analytics;
    if (this.hasBackendAnalytics_(payload.data?.analytics)) return payload.data.analytics;
    if (this.hasBackendAnalytics_(payload.result?.analytics)) return payload.result.analytics;
    if (this.hasBackendAnalytics_(payload.payload?.analytics)) return payload.payload.analytics;
    if (this.hasBackendAnalytics_(payload)) return payload;
    return null;
  },
  isAnnualSaasClientLocationItem(item = {}) {
    const section = this.normalizeText(item.section || item.category || item.type || item.section_name || item.section_label);
    const billingFrequency = this.normalizeText(item.billing_frequency || item.billingFrequency || item.frequency);
    const itemName = this.normalizeText(item.item_name || item.itemName || item.module || item.module_name || item.moduleName);
    if (!section && !billingFrequency) return false;
    const isOneTimeOrSetup = ['one_time_fee', 'one_time', 'one time', 'one-time', 'setup', 'implementation', 'onboarding'].some(
      token => section.includes(token)
    );
    if (isOneTimeOrSetup) return false;
    const isSaasFamily = ['annual_saas', 'saas', 'subscription', 'recurring'].some(token => section.includes(token));
    if (!isSaasFamily) return false;
    const isAnnual = ['annual', 'yearly', '12 month', '12-month'].some(
      token => section.includes(token) || billingFrequency.includes(token) || itemName.includes(token)
    );
    return isAnnual;
  },
  isActiveAnnualSaasLocationItem(item = {}) {
    const startValue = String(item.service_start_date || item.serviceStartDate || '').trim();
    const endValue = String(item.service_end_date || item.serviceEndDate || '').trim();
    if (!startValue) return false;
    const start = new Date(startValue);
    if (Number.isNaN(start.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    if (today.getTime() < start.getTime()) return false;
    if (!endValue) return true;
    const end = new Date(endValue);
    if (Number.isNaN(end.getTime())) return false;
    end.setHours(0, 0, 0, 0);
    return today.getTime() <= end.getTime();
  },
  normalizeCurrencyCode_(value) {
    return String(value || '').trim().toUpperCase() || 'USD';
  },
  getClientCurrency_(clientId = '') {
    const agreements = this.listClientRelatedAgreements_(clientId);
    const invoices = this.listClientRelatedInvoices_(clientId);
    const receipts = this.listClientRelatedReceipts_(clientId);
    return this.normalizeCurrencyCode_(
      agreements.find(item => String(item.currency || '').trim())?.currency ||
        invoices.find(item => String(item.currency || '').trim())?.currency ||
        receipts.find(item => String(item.currency || '').trim())?.currency ||
        'USD'
    );
  },
  formatMoneyWithCurrency_(value, currency = 'USD') {
    return `${this.normalizeCurrencyCode_(currency)} ${U.fmtNumber(this.toNumberSafe(value))}`;
  },
  countAgreementAnnualSaasRowsForClientAnalytics(agreement = {}) {
    const items = Array.isArray(agreement.items)
      ? agreement.items
      : Array.isArray(agreement.agreement_items)
        ? agreement.agreement_items
        : Array.isArray(agreement.line_items)
          ? agreement.line_items
          : [];
    return items.filter(item => this.isAnnualSaasClientLocationItem(item)).length;
  },
  computeClientAnalytics_(client) {
    const clientId = String(client?.client_id || '').trim();
    const agreements = this.listClientRelatedAgreements_(clientId);
    const invoices = this.listClientRelatedInvoices_(clientId);
    const invoiceUuidSet = new Set(invoices.map(item => String(item.id || '').trim()).filter(Boolean));
    const receipts = this.listClientRelatedReceipts_(clientId).filter(receipt => {
      const invoiceUuid = String(receipt.invoice_id || '').trim();
      if (invoiceUuid && invoiceUuidSet.has(invoiceUuid)) return true;
      return !invoiceUuid;
    });
    const signedAgreements = agreements.filter(item => this.isSignedAgreement(item));
    const locationItems = this.listClientAgreementLocationItems_(clientId);
    const activeLocationItems = locationItems.filter(item => this.isActiveAnnualSaasLocationItem(item));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalLocations = locationItems.length;
    const activeLocations = activeLocationItems.length;

    const totalAgreementValue = agreements.reduce((sum, item) => sum + this.toNumberSafe(item.grand_total), 0);
    const totalInvoicedValue = invoices.reduce((sum, item) => sum + this.toNumberSafe(item.grand_total), 0);
    const totalPaidAmount = receipts.reduce((sum, item) => sum + this.toNumberSafe(item.received_amount), 0);
    const totalDueAmount = Math.max(totalInvoicedValue - totalPaidAmount, 0);

    const latestAgreementDate = this.maxDate(...agreements.map(item => item.signed_date || item.customer_sign_date || item.updated_at));
    const latestInvoiceDate = this.maxDate(...invoices.map(item => item.issued_date || item.created_at || item.updated_at));
    const latestReceiptDate = this.maxDate(...receipts.map(item => item.receipt_date || item.created_at || item.updated_at));

    const renewalCandidates = locationItems
      .map(item => String(item.service_end_date || item.serviceEndDate || '').trim())
      .filter(Boolean)
      .map(value => new Date(value))
      .filter(date => !Number.isNaN(date.getTime()) && date.getTime() >= today.getTime())
      .sort((a, b) => a.getTime() - b.getTime());

    const paymentBucket = invoices.reduce(
      (bucket, invoice) => {
        const due = this.toNumberSafe(invoice.pending_amount);
        const paid = this.toNumberSafe(invoice.amount_paid);
        if (due <= 0 && paid > 0) bucket.paid += 1;
        else if (paid > 0 && due > 0) bucket.partial += 1;
        else bucket.unpaid += 1;
        return bucket;
      },
      { unpaid: 0, partial: 0, paid: 0 }
    );

    return {
      total_locations: totalLocations,
      active_locations: activeLocations,
      total_agreements: agreements.length,
      signed_agreements: agreements.filter(item => this.isSignedAgreement(item) || item.signed_date || item.customer_sign_date).length,
      total_agreement_value: totalAgreementValue,
      total_invoiced_value: totalInvoicedValue,
      total_paid_amount: totalPaidAmount,
      total_due_amount: totalDueAmount,
      total_receipts_value: receipts.length,
      total_receipts_count: receipts.length,
      total_invoices_count: invoices.length,
      unpaid_invoices_count: paymentBucket.unpaid,
      partially_paid_invoices_count: paymentBucket.partial,
      paid_invoices_count: paymentBucket.paid,
      latest_agreement_date: latestAgreementDate,
      latest_invoice_date: latestInvoiceDate,
      latest_receipt_date: latestReceiptDate,
      latest_activity_date: this.maxDate(latestAgreementDate, latestInvoiceDate, latestReceiptDate),
      next_renewal_date: renewalCandidates.length ? renewalCandidates[0].toISOString() : '',
      currency: this.getClientCurrency_(clientId)
    };
  },
  buildTimeline_(clientId) {
    const events = [];
    this.buildClientRenewalRows({ client_id: clientId }).forEach(item => {
      events.push({
        type: 'renewal_item',
        date: item.renewal_date || item.service_end_date,
        label: `${item.location_name || 'Location'} · ${item.module_name || 'Annual SaaS'} renewal`
      });
    });
    this.listClientRelatedAgreements_(clientId).forEach(item => {
      const labelId = item.agreement_number || item.agreement_id || '—';
      events.push({
        type: 'agreement_signed',
        date: item.signed_date || item.customer_sign_date || item.updated_at,
        label: `Agreement ${labelId} Signed`
      });
    });
    this.listClientRelatedInvoices_(clientId).forEach(item => {
      const labelId = item.invoice_number || item.invoice_id || '—';
      events.push({
        type: 'invoice_issued',
        date: item.issued_date || item.created_at || item.updated_at,
        label: `Invoice ${labelId} Issued`
      });
    });
    this.listClientRelatedReceipts_(clientId).forEach(item => {
      const amount = this.toNumberSafe(item.received_amount);
      const pending = this.toNumberSafe(item.pending_amount);
      const paymentLabel = pending <= 0 && amount > 0 ? 'Paid' : amount > 0 ? 'Partially Paid' : 'Payment Received';
      const labelId = item.receipt_number || item.receipt_id || '—';
      events.push({
        type: 'receipt_received',
        date: item.receipt_date || item.created_at || item.updated_at,
        label: `Receipt ${labelId} ${paymentLabel}`
      });
    });
    return events
      .filter(item => item.date)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },
  normalizeEventToken_(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  },
  asArray_(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = [value.rows, value.data, value.timeline].find(Array.isArray);
      if (Array.isArray(nested)) return nested;
    }
    return [];
  },
  extractTimelineRows_(...sources) {
    const rows = [];
    sources.forEach(source => {
      this.asArray_(source).forEach(item => {
        if (item && typeof item === 'object') rows.push(item);
      });
    });
    return rows;
  },
  normalizeTimelineEvents_(events = []) {
    return events
      .map(item => {
        const date = String(
          this.getField(item, 'date', 'event_date', 'timeline_date', 'occurred_at', 'created_at', 'updated_at', 'value') || ''
        ).trim();
        return {
          ...item,
          type: String(this.getField(item, 'type', 'event_type', 'event', 'key', 'name', 'milestone') || item.type || '').trim(),
          date
        };
      })
      .filter(item => item.date || item.type || item.label || item.title);
  },
  getTimelineEventTokens_(event = {}) {
    const tokenFields = [
      event.type,
      event.event_type,
      event.event,
      event.key,
      event.name,
      event.label,
      event.title,
      event.milestone
    ];
    return tokenFields.map(value => this.normalizeEventToken_(value)).filter(Boolean);
  },
  getTimelineEventDate_(event = {}) {
    const candidates = [
      this.getField(event, 'date', 'event_date', 'timeline_date', 'occurred_at', 'created_at', 'updated_at'),
      event.value
    ]
      .map(value => String(value || '').trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) return candidate;
    }
    return '';
  },
  selectMilestoneDateFromTimeline_(timeline = [], aliases = []) {
    const normalizedAliases = aliases.map(alias => this.normalizeEventToken_(alias)).filter(Boolean);
    const matches = timeline
      .map(event => {
        const tokens = this.getTimelineEventTokens_(event);
        const matched = normalizedAliases.some(alias => tokens.some(token => token.includes(alias) || alias.includes(token)));
        return matched ? this.getTimelineEventDate_(event) : '';
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return matches[0] || '';
  },
  minDateFromRows_(rows = [], key) {
    const dates = rows
      .map(row => String(row?.[key] || '').trim())
      .filter(Boolean)
      .filter(value => !Number.isNaN(new Date(value).getTime()))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return dates[0] || '';
  },
  maxDateFromRows_(rows = [], key) {
    const dates = rows
      .map(row => String(row?.[key] || '').trim())
      .filter(Boolean)
      .filter(value => !Number.isNaN(new Date(value).getTime()))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return dates[0] || '';
  },
  getMilestoneValues_(detailData = {}, client = {}) {
    const detail = detailData.detail || {};
    const timeline = Array.isArray(detailData.timeline) ? detailData.timeline : [];
    const renewals = Array.isArray(detailData.renewalRows) ? detailData.renewalRows : [];
    const invoices = this.listClientRelatedInvoices_(client.client_id || '');
    const receipts = this.listClientRelatedReceipts_(client.client_id || '');
    const agreementSummary = detail.agreement || detail.agreement_summary || detail.agreementSummary || {};
    const fromTimeline = {
      agreement_signed: this.selectMilestoneDateFromTimeline_(timeline, ['agreement_signed', 'agreementSigned']),
      service_start: this.selectMilestoneDateFromTimeline_(timeline, ['service_start', 'serviceStart']),
      service_end: this.selectMilestoneDateFromTimeline_(timeline, ['service_end', 'serviceEnd']),
      invoice_issued: this.selectMilestoneDateFromTimeline_(timeline, ['invoice_issued', 'invoiceIssued']),
      invoice_due: this.selectMilestoneDateFromTimeline_(timeline, ['invoice_due', 'invoiceDue']),
      receipt_received: this.selectMilestoneDateFromTimeline_(timeline, ['receipt_received', 'receiptReceived'])
    };
    const fallback = {
      agreement_signed: String(
        detail.agreement_date ||
          detail.signed_at ||
          agreementSummary.agreement_date ||
          agreementSummary.signed_at ||
          ''
      ).trim(),
      service_start: this.minDateFromRows_(renewals, 'service_start_date'),
      service_end: this.maxDateFromRows_(renewals, 'service_end_date'),
      invoice_issued: this.maxDateFromRows_(invoices, 'issued_date'),
      invoice_due: this.maxDateFromRows_(invoices, 'due_date'),
      receipt_received: this.maxDateFromRows_(receipts, 'receipt_date')
    };
    const selected = {
      agreement_signed: fromTimeline.agreement_signed || fallback.agreement_signed,
      service_start: fromTimeline.service_start || fallback.service_start,
      service_end: fromTimeline.service_end || fallback.service_end,
      invoice_issued: fromTimeline.invoice_issued || fallback.invoice_issued,
      invoice_due: fromTimeline.invoice_due || fallback.invoice_due,
      receipt_received: fromTimeline.receipt_received || fallback.receipt_received
    };
    return selected;
  },
  getDaysLeft(date) {
    const value = String(date || '').trim();
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    return Math.round((parsed.getTime() - today.getTime()) / 86400000);
  },
  getPaymentStatus(row = {}) {
    const pending = this.toNumberSafe(row.pending_amount ?? row.amount_due ?? row.balance ?? 0);
    const paid = this.toNumberSafe(row.amount_paid ?? row.received_amount ?? row.credit ?? 0);
    const dueDate = String(row.due_date || row.dueDate || '').trim();
    const daysLeft = this.getDaysLeft(dueDate);
    if (pending <= 0 && paid > 0) return 'Paid';
    if (paid > 0 && pending > 0) return 'Partially Paid';
    if (daysLeft !== null && daysLeft < 0 && pending > 0) return 'Overdue';
    if (pending > 0) return 'Open';
    return 'Pending';
  },
  getRenewalStatus(row = {}) {
    const days = this.getDaysLeft(row.renewal_date || row.renewalDate || row.service_end_date);
    const paymentStatus = this.getPaymentStatus(row);
    if (days === null) return paymentStatus || 'Unknown';
    if (days < 0) return 'Renewal Overdue';
    if (days <= 7) return 'Renewal Due in 7 days';
    if (days <= 30) return 'Renewal Due in 30 days';
    if (days <= 60) return 'Renewal Due in 60 days';
    return paymentStatus === 'Overdue' ? 'Payment Overdue' : 'Scheduled';
  },
  computeRunningBalance(rows = []) {
    let running = 0;
    return rows
      .slice()
      .sort((a, b) => {
        const ad = this.dateValueForSort_(a);
        const bd = this.dateValueForSort_(b);
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        return new Date(ad).getTime() - new Date(bd).getTime();
      })
      .map(row => {
        const debit = this.toNumberSafe(row.debit);
        const credit = this.toNumberSafe(row.credit);
        running += debit - credit;
        return { ...row, debit, credit, running_balance: running };
      });
  },
  buildClientStatementRows(client) {
    const clientId = String(client?.client_id || '').trim();
    const agreements = this.listClientRelatedAgreements_(clientId);
    const invoices = this.listClientRelatedInvoices_(clientId);
    const receipts = this.listClientRelatedReceipts_(clientId);
    const agreementRows = agreements.map(item => ({
      date: item.signed_date || item.agreement_date || item.effective_date || item.created_at,
      type: 'Agreement',
      document_no: item.agreement_number || item.agreement_id || item.id || '—',
      document_id: item.agreement_id || item.id,
      reference: item.agreement_number || item.agreement_id || '',
      debit: this.pickAmount_(item, ['grand_total', 'total', 'total_amount', 'amount', 'value', 'estimated_value']),
      credit: 0,
      due_date: item.service_end_date || '',
      status: item.status || '',
      notes: [item.agreement_title || item.customer_name || item.status, item.customer_name].filter(Boolean).join(' • '),
      currency: String(item.currency || '').trim() || 'USD'
    }));
    const invoiceRows = invoices.map(item => ({
      date: item.issued_date || item.created_at || item.updated_at,
      type: 'Invoice',
      document_no: item.invoice_number || item.invoice_id || '—',
      document_id: item.invoice_id,
      reference: item.reference || item.agreement_number || item.agreement_id || '',
      debit: this.pickAmount_(item, ['grand_total', 'total_amount', 'invoice_total', 'total', 'amount_due', 'value']),
      credit: 0,
      due_date: item.due_date || '',
      status: this.getPaymentStatus(item),
      notes: item.notes || item.status || '',
      currency: String(item.currency || '').trim() || 'USD'
    }));
    const receiptRows = receipts.map(item => ({
      date: item.payment_date || item.receipt_date || item.created_at || item.updated_at,
      type: 'Receipt',
      document_no: item.receipt_number || item.receipt_id || '—',
      document_id: item.receipt_id,
      reference: item.reference || item.payment_reference || item.invoice_id || '',
      debit: 0,
      credit: this.pickAmount_(item, ['amount_paid', 'paid_amount', 'received_amount', 'receipt_total', 'amount', 'total_amount']),
      due_date: '',
      status: item.payment_state || 'Received',
      notes: item.notes || item.payment_method || '',
      currency: String(item.currency || '').trim() || 'USD'
    }));
    return this.computeRunningBalance([...agreementRows, ...invoiceRows, ...receiptRows]).sort((a, b) => {
      const ad = this.dateValueForSort_(a);
      const bd = this.dateValueForSort_(b);
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return new Date(bd).getTime() - new Date(ad).getTime();
    });
  },
  buildClientRenewalRows(client) {
    const clientId = String(client?.client_id || '').trim();
    const agreements = this.listClientRelatedAgreements_(clientId);
    const agreementByUuid = new Map(agreements.map(agreement => [String(agreement.id || '').trim(), agreement]));
    const rows = [];
    this.listClientAgreementLocationItems_(clientId).forEach(item => {
      const agreement = agreementByUuid.get(String(item.agreement_id || '').trim()) || {};
      const normalized = this.normalizeRenewalRow({
        ...item,
        agreement_id: agreement.agreement_id,
        agreement_number: agreement.agreement_number,
        client_name: client.customer_name || client.customer_legal_name || '—',
        renewal_date: this.getField(item, 'renewal_date', 'renewalDate', 'service_end_date', 'serviceEndDate'),
        service_start_date: this.getField(item, 'service_start_date', 'serviceStartDate'),
        service_end_date: this.getField(item, 'service_end_date', 'serviceEndDate'),
        location_name: this.getField(item, 'location_name', 'locationName'),
        payment_status: this.getField(item, 'payment_status', 'paymentStatus'),
        billing_frequency: this.getField(item, 'billing_frequency', 'billingFrequency', 'frequency') || agreement.billing_frequency,
        currency: this.getField(item, 'currency', 'currency_code') || agreement.currency || this.getClientCurrency_(clientId)
      });
      if (normalized.service_start_date || normalized.service_end_date || normalized.location_name || normalized.module_name) {
        rows.push(normalized);
      }
    });
    agreements.forEach(agreement => {
      rows.push(this.normalizeRenewalRow({
        agreement_id: agreement.agreement_id || agreement.id,
        agreement_number: agreement.agreement_number,
        client_name: agreement.customer_name || agreement.customer_legal_name || client.customer_name,
        service_start_date: agreement.service_start_date || agreement.effective_date || agreement.agreement_date,
        service_end_date: agreement.service_end_date,
        renewal_date: agreement.service_end_date,
        billing_frequency: agreement.billing_frequency,
        payment_term: agreement.payment_term,
        contract_term: agreement.contract_term,
        status: agreement.status,
        due_date: '',
        currency: agreement.currency || this.getClientCurrency_(clientId)
      }));
    });
    this.listClientRelatedInvoices_(clientId).forEach(invoice => {
      rows.push(this.normalizeRenewalRow({
        agreement_id: invoice.agreement_id,
        agreement_number: invoice.agreement_number,
        invoice_id: invoice.invoice_id || invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: invoice.customer_name || client.customer_name,
        due_date: invoice.due_date,
        renewal_date: invoice.due_date || invoice.issued_date || invoice.created_at,
        amount_due: this.pickAmount_(invoice, ['amount_due', 'pending_amount', 'balance_due', 'grand_total']),
        payment_status: this.getPaymentStatus(invoice),
        status: invoice.status,
        currency: invoice.currency || this.getClientCurrency_(clientId)
      }));
    });
    this.listClientRelatedReceipts_(clientId).forEach(receipt => {
      rows.push(this.normalizeRenewalRow({
        agreement_id: receipt.agreement_id,
        agreement_number: receipt.agreement_number,
        invoice_id: receipt.invoice_id,
        invoice_number: receipt.invoice_number,
        client_name: receipt.customer_name || client.customer_name,
        due_date: receipt.receipt_date || receipt.created_at,
        renewal_date: receipt.payment_date || receipt.receipt_date || receipt.created_at,
        amount_due: this.pickAmount_(receipt, ['amount_due', 'pending_amount', 'balance_due']),
        payment_status: receipt.payment_state || 'Paid',
        status: receipt.payment_state || receipt.status,
        currency: receipt.currency || this.getClientCurrency_(clientId)
      }));
    });
    return rows.sort((a, b) => {
      const ad = this.dateValueForSort_(a);
      const bd = this.dateValueForSort_(b);
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return new Date(ad).getTime() - new Date(bd).getTime();
    });
  },
  normalizeStatementRow(raw = {}) {
    return {
      date: String(this.getField(raw, 'date', 'entry_date', 'created_at') || '').trim(),
      type: String(this.getField(raw, 'type', 'entry_type') || '').trim(),
      document_no: String(this.getField(raw, 'document_no', 'documentNo', 'document_number', 'invoice_number', 'receipt_number') || '').trim(),
      document_id: String(this.getField(raw, 'document_id', 'documentId', 'invoice_id', 'receipt_id') || '').trim(),
      reference: String(this.getField(raw, 'reference', 'ref') || '').trim(),
      debit: this.toNumberSafe(this.getField(raw, 'debit', 'amount_debit')),
      credit: this.toNumberSafe(this.getField(raw, 'credit', 'amount_credit', 'amount_paid')),
      due_date: String(this.getField(raw, 'due_date', 'dueDate') || '').trim(),
      status: String(this.getField(raw, 'status', 'payment_state') || '').trim(),
      notes: String(this.getField(raw, 'notes', 'description') || '').trim(),
      currency: String(this.getField(raw, 'currency', 'currency_code', 'currencyCode') || '').trim() || 'USD'
    };
  },
  normalizeRenewalRow(raw = {}) {
    const renewalDate = String(this.getField(raw, 'renewal_date', 'renewalDate', 'next_renewal_date', 'nextRenewalDate', 'service_end_date', 'serviceEndDate') || '').trim();
    const paymentStatus = String(this.getField(raw, 'payment_status', 'paymentStatus') || '').trim();
    return {
      agreement_id: String(this.getField(raw, 'agreement_id', 'agreementId') || '').trim(),
      agreement_number: String(this.getField(raw, 'agreement_number', 'agreementNo', 'agreementNumber') || '').trim(),
      invoice_id: String(this.getField(raw, 'invoice_id', 'invoiceId') || '').trim(),
      invoice_number: String(this.getField(raw, 'invoice_no', 'invoiceNo', 'invoice_number', 'invoiceNumber') || '').trim(),
      client_name: String(this.getField(raw, 'client', 'client_name', 'customer_name', 'customerName') || '').trim(),
      location_name: String(this.getField(raw, 'location_name', 'locationName') || '').trim(),
      module_name: String(this.getField(raw, 'module_name', 'moduleName', 'item_name', 'name') || '').trim(),
      service_start_date: String(this.getField(raw, 'service_start_date', 'serviceStartDate') || '').trim(),
      service_end_date: String(this.getField(raw, 'service_end_date', 'serviceEndDate') || '').trim(),
      due_date: String(this.getField(raw, 'due_date', 'dueDate') || '').trim(),
      renewal_date: renewalDate,
      billing_frequency: String(this.getField(raw, 'billing_frequency', 'billingFrequency') || '').trim(),
      payment_term: String(this.getField(raw, 'payment_term', 'paymentTerm', 'payment_terms') || '').trim(),
      contract_term: String(this.getField(raw, 'contract_term', 'contractTerm') || '').trim(),
      days_left: this.getDaysLeft(renewalDate),
      amount_due: this.toNumberSafe(this.getField(raw, 'amount_due', 'pending_amount', 'pendingAmount')),
      status: String(this.getField(raw, 'status') || '').trim(),
      payment_status: paymentStatus || this.getPaymentStatus(raw),
      currency: this.normalizeCurrencyCode_(this.getField(raw, 'currency', 'currency_code', 'currencyCode') || 'USD')
    };
  },
  applyFilters() {
    const terms = String(this.state.search || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const status = String(this.state.status || 'All');
    const sorted = this.state.rows
      .filter(client => {
        if (status !== 'All' && String(client.status || '').trim() !== status) return false;
        if (!terms.length) return true;
        const haystack = [client.customer_name, client.customer_legal_name, client.primary_contact_name, client.primary_contact_email]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return terms.every(term => haystack.includes(term));
      })
      .sort((a, b) => {
        const aAnalytics = a.analytics || {};
        const bAnalytics = b.analytics || {};
        if (this.state.sort === 'paid_desc') return this.toNumberSafe(bAnalytics.total_paid_amount) - this.toNumberSafe(aAnalytics.total_paid_amount);
        if (this.state.sort === 'agreement_desc') return this.toNumberSafe(bAnalytics.total_agreement_value) - this.toNumberSafe(aAnalytics.total_agreement_value);
        return this.toNumberSafe(bAnalytics.total_due_amount) - this.toNumberSafe(aAnalytics.total_due_amount);
      });
    this.state.filteredRows = sorted;
  },
  badgeClassFromInvoice_(invoice = {}) {
    const due = this.toNumberSafe(invoice.pending_amount);
    const paid = this.toNumberSafe(invoice.amount_paid ?? invoice.received_amount);
    if (due <= 0 && paid > 0) return 'online';
    if (paid > 0 && due > 0) return 'offline';
    return '';
  },
  setDetailTab(tab = 'overview') {
    this.state.activeDetailTab = ['overview', 'statement', 'renewals'].includes(tab) ? tab : 'overview';
    if (E.clientOverviewSection) E.clientOverviewSection.style.display = this.state.activeDetailTab === 'overview' ? '' : 'none';
    if (E.clientStatementSection) E.clientStatementSection.style.display = this.state.activeDetailTab === 'statement' ? '' : 'none';
    if (E.clientRenewalsSection) E.clientRenewalsSection.style.display = this.state.activeDetailTab === 'renewals' ? '' : 'none';
    if (E.clientDetailTabButtons) {
      E.clientDetailTabButtons.querySelectorAll('[data-client-detail-tab]').forEach(btn => {
        const selected = btn.getAttribute('data-client-detail-tab') === this.state.activeDetailTab;
        btn.classList.toggle('primary', selected);
        btn.classList.toggle('ghost', !selected);
      });
    }
  },
  async loadClientDetailData_(clientId, { force = false } = {}) {
    const cache = this.state.detailCache[clientId];
    if (!force && cache && Date.now() - cache.loadedAt <= this.state.detailCacheTtlMs) return cache;
    const client = this.state.rows.find(row => row.client_id === clientId);
    console.log('[ClientStatement] selected client', {
      client_id: client?.client_id,
      id: client?.id,
      client_name: client?.client_name || client?.customer_name,
      company_name: client?.company_name || client?.customer_legal_name,
      email: client?.primary_contact_email || client?.email,
      phone: client?.phone
    });
    const agreements = this.listClientRelatedAgreements_(clientId);
    const invoices = this.listClientRelatedInvoices_(clientId);
    const receipts = this.listClientRelatedReceipts_(clientId);
    const agreementItems = this.listClientAgreementLocationItems_(clientId);
    const invoiceItems = this.listClientRelatedInvoiceItems_(clientId);
    const receiptItems = this.listClientRelatedReceiptItems_(clientId);
    console.log('[ClientStatement] source counts', {
      agreements: this.state.agreements.length,
      invoices: this.state.invoices.length,
      receipts: this.state.receipts.length,
      agreementItems: this.state.agreementItems.length,
      invoiceItems: this.state.invoiceItems.length,
      receiptItems: this.state.receiptItems.length
    });
    const normalizedStatement = [];
    const normalizedRenewals = [];
    const normalizedTimeline = [];
    const fallbackTimeline = this.buildTimeline_(clientId);
    const statementRows = normalizedStatement.length ? this.computeRunningBalance(normalizedStatement) : this.buildClientStatementRows(client);
    const renewalRows = normalizedRenewals.length ? normalizedRenewals : this.buildClientRenewalRows(client);
    console.log('[ClientStatement] matched counts', {
      matchedAgreements: agreements.length,
      matchedInvoices: invoices.length,
      matchedReceipts: receipts.length,
      statementRows: statementRows.length,
      timelineRows: renewalRows.length
    });
    const relationAttempts = Boolean(client && (this.state.agreements.length || this.state.invoices.length || this.state.receipts.length));
    const loadSuccess = !this.state.loadError;
    const noLinkedRows = relationAttempts && loadSuccess && !agreements.length && !invoices.length && !receipts.length;
    const detailBundle = {
      detail: client || {},
      analytics: client?.analytics || this.computeClientAnalytics_(client || {}),
      timeline: normalizedTimeline.length ? normalizedTimeline : fallbackTimeline,
      statementRows,
      renewalRows,
      statementError: loadSuccess ? '' : 'Unable to load statement data.',
      noLinkedRows,
      loadedAt: Date.now()
    };
    console.debug('[Clients] detail timeline source', {
      clientId,
      timelineEvents: detailBundle.timeline.length,
      renewalRows: detailBundle.renewalRows.length
    });
    this.state.detailCache[clientId] = detailBundle;
    return detailBundle;
  },
  getFilteredStatementRows_(rows = []) {
    const { status, dateFrom, dateTo, searchDoc } = this.state.statementFilters;
    return rows.filter(row => {
      const rowStatus = this.normalizeText(row.status || this.getPaymentStatus(row));
      if (status === 'open' && !rowStatus.includes('open') && !rowStatus.includes('partial')) return false;
      if (status === 'overdue' && !rowStatus.includes('overdue')) return false;
      const rowDate = String(row.date || '').trim();
      const parsedDate = this.parseFlexibleDate_(rowDate);
      if (dateFrom && parsedDate && new Date(parsedDate).getTime() < new Date(dateFrom).getTime()) return false;
      if (dateTo && parsedDate && new Date(parsedDate).getTime() > new Date(dateTo).getTime()) return false;
      if (searchDoc && !String(row.document_no || '').toLowerCase().includes(String(searchDoc).toLowerCase())) return false;
      return true;
    });
  },
  getFilteredRenewalRows_(rows = []) {
    const { dateFrom, dateTo } = this.state.renewalsFilters;
    return rows.filter(row => {
      const dateValue = String(row.renewal_date || '').trim();
      if (!dateValue) return true;
      const parsedDate = this.parseFlexibleDate_(dateValue);
      if (dateFrom && parsedDate && new Date(parsedDate).getTime() < new Date(dateFrom).getTime()) return false;
      if (dateTo && parsedDate && new Date(parsedDate).getTime() > new Date(dateTo).getTime()) return false;
      return true;
    });
  },
  renderStatementSection_(detailData = {}) {
    const rows = this.getFilteredStatementRows_(detailData.statementRows || []);
    const clientCurrency = this.getClientCurrency_(this.state.selectedClientId);
    const totalInvoiced = rows.reduce((sum, item) => sum + this.toNumberSafe(item.debit), 0);
    const totalPaid = rows.reduce((sum, item) => sum + this.toNumberSafe(item.credit), 0);
    const totalDue = Math.max(totalInvoiced - totalPaid, 0);
    const lastPayment = rows.find(item => this.toNumberSafe(item.credit) > 0)?.date || '';
    const nextRenewal = (detailData.renewalRows || [])
      .map(item => item.renewal_date)
      .filter(Boolean)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    if (E.clientStatementCards) {
      E.clientStatementCards.innerHTML = [
        ['Total Invoiced', this.formatMoneyWithCurrency_(totalInvoiced, clientCurrency)],
        ['Total Paid', this.formatMoneyWithCurrency_(totalPaid, clientCurrency)],
        ['Total Due', this.formatMoneyWithCurrency_(totalDue, clientCurrency)],
        ['Last Payment Date', U.fmtDisplayDate(lastPayment) || '—'],
        ['Next Renewal Date', U.fmtDisplayDate(nextRenewal) || '—']
      ]
        .map(([label, value]) => `<div class="card kpi"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`)
        .join('');
    }
    if (E.clientStatementTbody) {
      const emptyMessage = detailData.statementError
        ? 'Unable to load statement data.'
        : detailData.noLinkedRows
          ? 'No linked rows found. Check client ID/name mapping.'
          : 'No statement rows found.';
      E.clientStatementTbody.innerHTML = rows.length
        ? rows
            .map(row => `<tr>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.date) || '—')}</td>
              <td>${U.escapeHtml(row.type || '—')}</td>
              <td>${U.escapeHtml(row.document_no || '—')}</td>
              <td>${U.escapeHtml(row.reference || '—')}</td>
              <td>${U.escapeHtml(row.currency || 'USD')}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(row.debit || 0, row.currency || clientCurrency))}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(row.credit || 0, row.currency || clientCurrency))}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(row.running_balance || 0, row.currency || clientCurrency))}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.due_date) || '—')}</td>
              <td>${U.escapeHtml(row.status || this.getPaymentStatus(row))}</td>
              <td>${U.escapeHtml(row.notes || '—')}</td>
            </tr>`)
            .join('')
        : `<tr><td colspan="11" class="muted" style="text-align:center;">${U.escapeHtml(emptyMessage)}</td></tr>`;
    }
  },
  buildStatementExportHtml_(client = {}, rows = []) {
    const generatedOn = new Date();
    const customerName = client.customer_name || client.customer_legal_name || 'Client';
    const title = `Statement of Account · ${customerName}`;
    const baseHref = U.escapeAttr(window.location.href);
    const bodyRows = rows.length
      ? rows
          .map(row => `<tr>
            <td>${U.escapeHtml(U.fmtDisplayDate(row.date) || '—')}</td>
            <td>${U.escapeHtml(row.type || '—')}</td>
            <td>${U.escapeHtml(row.document_no || '—')}</td>
            <td>${U.escapeHtml(row.reference || '—')}</td>
            <td>${U.escapeHtml(row.currency || 'USD')}</td>
            <td style="text-align:right;">${U.escapeHtml(U.fmtNumber(row.debit || 0))}</td>
            <td style="text-align:right;">${U.escapeHtml(U.fmtNumber(row.credit || 0))}</td>
            <td style="text-align:right;">${U.escapeHtml(U.fmtNumber(row.running_balance || 0))}</td>
            <td>${U.escapeHtml(U.fmtDisplayDate(row.due_date) || '—')}</td>
            <td>${U.escapeHtml(row.status || this.getPaymentStatus(row))}</td>
            <td>${U.escapeHtml(row.notes || '—')}</td>
          </tr>`)
          .join('')
      : '<tr><td colspan="11" style="text-align:center;">No statement rows found.</td></tr>';
    const totalDebit = rows.reduce((sum, item) => sum + this.toNumberSafe(item.debit), 0);
    const totalCredit = rows.reduce((sum, item) => sum + this.toNumberSafe(item.credit), 0);
    const balance = Math.max(totalDebit - totalCredit, 0);
    const clientCurrency = this.getClientCurrency_(client.client_id);
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${U.escapeHtml(title)}</title>
          <base href="${baseHref}" />
          <link rel="stylesheet" href="styles.css" />
          <style>
            body { margin: 20px; background: #fff; color: #111; font-family: Inter, system-ui, -apple-system, sans-serif; }
            .meta { display:flex; gap:8px; flex-wrap:wrap; margin-bottom: 10px; }
            .meta span { padding: 4px 8px; border: 1px solid #ddd; border-radius: 999px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #ddd; padding: 6px; font-size: 12px; vertical-align: top; }
            th { background: #f5f5f5; text-align: left; }
            .totals { margin-top: 12px; display: grid; grid-template-columns: repeat(3, minmax(160px, 1fr)); gap: 8px; }
            .totals .item { border:1px solid #ddd; border-radius:8px; padding:8px; }
            .totals .label { font-size: 11px; color:#666; }
            .totals .value { font-weight: 700; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <h2 style="margin:0 0 6px;">Statement of Account</h2>
          <div style="margin-bottom:10px;">${U.escapeHtml(customerName)}</div>
          <div class="meta">
            <span>Generated: ${U.escapeHtml(U.fmtDisplayDate(generatedOn.toISOString().slice(0, 10)) || '—')}</span>
            <span>Client ID: ${U.escapeHtml(client.client_id || '—')}</span>
            <span>Rows: ${U.escapeHtml(String(rows.length))}</span>
          </div>
          <table>
            <thead>
              <tr><th>Date</th><th>Type</th><th>Document No</th><th>Reference</th><th>Currency</th><th>Debit</th><th>Credit</th><th>Running Balance</th><th>Due Date</th><th>Status</th><th>Notes</th></tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
          <div class="totals">
            <div class="item"><div class="label">Total Invoiced</div><div class="value">${U.escapeHtml(this.formatMoneyWithCurrency_(totalDebit, clientCurrency))}</div></div>
            <div class="item"><div class="label">Total Paid</div><div class="value">${U.escapeHtml(this.formatMoneyWithCurrency_(totalCredit, clientCurrency))}</div></div>
            <div class="item"><div class="label">Balance Due</div><div class="value">${U.escapeHtml(this.formatMoneyWithCurrency_(balance, clientCurrency))}</div></div>
          </div>
        </body>
      </html>
    `;
    return U.addIncheckDocumentLogo(html);
  },
  previewStatementPdf() {
    const client = this.state.rows.find(row => row.client_id === this.state.selectedClientId);
    if (!client) {
      UI.toast('Select a client first.');
      return;
    }
    const detailData = this.state.detailCache[client.client_id] || {};
    const rows = this.getFilteredStatementRows_(detailData.statementRows || []);
    const printableDoc = this.buildStatementExportHtml_(client, rows);
    const clientName = client.customer_name || client.customer_legal_name || client.client_id || 'Client';
    if (E.clientStatementPreviewTitle)
      E.clientStatementPreviewTitle.textContent = `Statement of Account Preview · ${clientName}`;
    if (E.clientStatementPreviewFrame) E.clientStatementPreviewFrame.srcdoc = printableDoc;
    if (E.clientStatementPreviewModal) {
      E.clientStatementPreviewModal.classList.add('open');
      E.clientStatementPreviewModal.setAttribute('aria-hidden', 'false');
    }
  },
  closeStatementPreviewModal() {
    if (!E.clientStatementPreviewModal) return;
    E.clientStatementPreviewModal.classList.remove('open');
    E.clientStatementPreviewModal.setAttribute('aria-hidden', 'true');
    if (E.clientStatementPreviewFrame) E.clientStatementPreviewFrame.srcdoc = '';
  },
  exportStatementPdf() {
    const frame = E.clientStatementPreviewFrame;
    const previewTitle = String(E.clientStatementPreviewTitle?.textContent || 'Statement of Account Preview').trim();
    if (!frame || !String(frame.srcdoc || '').trim()) {
      UI.toast('Open statement preview first to extract PDF.');
      return;
    }
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      UI.toast('Unable to access statement preview content.');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    UI.toast(`Print dialog opened for ${previewTitle}. Choose "Save as PDF" to extract.`);
  },
  renderRenewalsSection_(detailData = {}, client = {}) {
    const rows = this.getFilteredRenewalRows_(detailData.renewalRows || []);
    const buckets = { d7: 0, d30: 0, d60: 0, overdueRenewals: 0, overduePayments: 0 };
    rows.forEach(row => {
      const days = this.getDaysLeft(row.renewal_date);
      if (days !== null && days <= 7 && days >= 0) buckets.d7 += 1;
      if (days !== null && days <= 30 && days >= 0) buckets.d30 += 1;
      if (days !== null && days <= 60 && days >= 0) buckets.d60 += 1;
      if (days !== null && days < 0) buckets.overdueRenewals += 1;
      if (this.getPaymentStatus(row).includes('Overdue')) buckets.overduePayments += 1;
    });
    if (E.clientRenewalBuckets) {
      E.clientRenewalBuckets.innerHTML = [
        ['Due in 7 days', buckets.d7],
        ['Due in 30 days', buckets.d30],
        ['Due in 60 days', buckets.d60],
        ['Overdue renewals', buckets.overdueRenewals],
        ['Overdue payments', buckets.overduePayments]
      ]
        .map(([label, value]) => `<div class="card kpi"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`)
        .join('');
    }
    if (E.clientRenewalsTbody) {
      E.clientRenewalsTbody.innerHTML = rows.length
        ? rows
            .map(row => `<tr>
              <td>${U.escapeHtml(row.location_name || '—')}</td>
              <td>${U.escapeHtml(row.module_name || '—')}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.service_start_date) || '—')}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.service_end_date) || '—')}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(row.renewal_date) || (this.dateValueForSort_(row) ? '—' : 'Date not set'))}</td>
              <td>${U.escapeHtml(row.billing_frequency || '—')}</td>
              <td>${U.escapeHtml(row.payment_status || this.getPaymentStatus(row) || '—')}</td>
            </tr>`)
            .join('')
        : `<tr><td colspan="7" class="muted" style="text-align:center;">${U.escapeHtml(detailData.statementError ? 'Unable to load statement data.' : detailData.noLinkedRows ? 'No linked rows found. Check client ID/name mapping.' : 'No renewals or payments timeline rows.')}</td></tr>`;
    }
    if (E.clientRenewalEvents) {
      const milestones = this.getMilestoneValues_(detailData, client);
      const events = [
        { label: 'Agreement signed', value: milestones.agreement_signed },
        { label: 'Service start', value: milestones.service_start },
        { label: 'Service end', value: milestones.service_end },
        { label: 'Invoice issued', value: milestones.invoice_issued },
        { label: 'Invoice due', value: milestones.invoice_due },
        { label: 'Receipt received', value: milestones.receipt_received },
        { label: 'Renewal due soon', value: detailData?.detail?.next_renewal_date || detailData?.analytics?.next_renewal_date || '' },
        { label: 'Renewal overdue', value: detailData?.detail?.overdue_renewal_date || detailData?.analytics?.overdue_renewal_date || '' }
      ];
      console.debug('[Clients] milestone selection', {
        clientId: client.client_id,
        timelineEvents: (detailData.timeline || []).length,
        renewalRows: rows.length,
        milestones
      });
      E.clientRenewalEvents.innerHTML = events
        .map(event => {
          const displayValue = U.fmtDisplayDate(event.value) || '—';
          return `<div class="card kpi"><div class="label">${U.escapeHtml(event.label)}</div><div class="value">${U.escapeHtml(displayValue)}</div></div>`;
        })
        .join('');
    }
  },
  renderList() {
    if (!E.clientsTbody) return;
    if (this.state.loadError) {
      E.clientsTbody.innerHTML = `<tr><td colspan="9" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    if (!this.state.filteredRows.length) {
      E.clientsTbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">No clients found.</td></tr>';
      return;
    }
    E.clientsTbody.innerHTML = this.state.filteredRows
      .map(client => {
        const analytics = client.analytics || {};
        const activeClass = this.state.selectedClientId === client.client_id ? ' style="background:rgba(59,130,246,.08);"' : '';
        return `<tr data-client-row="${U.escapeAttr(client.client_id)}"${activeClass}>
          <td>${U.escapeHtml(client.customer_name || '—')}</td>
          <td>${U.escapeHtml(client.customer_legal_name || '—')}</td>
          <td>${U.escapeHtml(String(analytics.total_locations ?? 0))}</td>
          <td>${U.escapeHtml(String(analytics.total_agreements ?? 0))}</td>
          <td>${U.escapeHtml(U.fmtNumber(analytics.total_invoiced_value || 0))}</td>
          <td>${U.escapeHtml(U.fmtNumber(analytics.total_paid_amount || 0))}</td>
          <td>${U.escapeHtml(U.fmtNumber(analytics.total_due_amount || 0))}</td>
          <td><span class="chip">${U.escapeHtml(client.status || 'Unknown')}</span></td>
          <td>${U.escapeHtml(U.fmtDisplayDate(analytics.latest_activity_date) || '—')}</td>
        </tr>`;
      })
      .join('');
  },
  renderDetail() {
    const client = this.state.rows.find(row => row.client_id === this.state.selectedClientId);
    if (!client) {
      if (E.clientsDetailEmpty) E.clientsDetailEmpty.style.display = '';
      if (E.clientsDetailPanel) E.clientsDetailPanel.style.display = 'none';
      return;
    }
    if (E.clientsDetailEmpty) E.clientsDetailEmpty.style.display = 'none';
    if (E.clientsDetailPanel) E.clientsDetailPanel.style.display = '';
    const detailData = this.state.detailCache[client.client_id] || {};
    const analytics = detailData.analytics || client.analytics || this.computeClientAnalytics_(client);
    if (E.clientStatementFiltersStatus) E.clientStatementFiltersStatus.value = this.state.statementFilters.status || 'all';
    if (E.clientStatementDateFrom) E.clientStatementDateFrom.value = this.state.statementFilters.dateFrom || '';
    if (E.clientStatementDateTo) E.clientStatementDateTo.value = this.state.statementFilters.dateTo || '';
    if (E.clientStatementSearchDoc) E.clientStatementSearchDoc.value = this.state.statementFilters.searchDoc || '';
    if (E.clientRenewalsDateFrom) E.clientRenewalsDateFrom.value = this.state.renewalsFilters.dateFrom || '';
    if (E.clientRenewalsDateTo) E.clientRenewalsDateTo.value = this.state.renewalsFilters.dateTo || '';
    if (E.clientDetailName) E.clientDetailName.textContent = client.customer_name || '—';
    if (E.clientDetailMeta) E.clientDetailMeta.textContent = `${client.customer_legal_name || 'No legal name'} • ${client.primary_contact_name || 'No contact'} • ${client.primary_contact_email || 'No email'}`;
    if (E.clientDetailStatus) E.clientDetailStatus.textContent = client.status || 'Unknown';
    if (E.clientDetailOverview) {
      E.clientDetailOverview.textContent = `Phone: ${client.phone || '—'} | Country: ${client.country || '—'} | Address: ${client.address || '—'} | Billing: ${client.billing_address || '—'} | Tax: ${client.tax_number || '—'} | Industry: ${client.industry || '—'} | Source: ${client.source || '—'} | Notes: ${client.notes || '—'}`;
    }

    const displayCurrency = this.normalizeCurrencyCode_(analytics.currency || this.getClientCurrency_(client.client_id));
    const analyticsCards = [
      ['Locations', `${analytics.total_locations || 0} (${analytics.active_locations || 0} active)`],
      ['Agreements', `${analytics.total_agreements || 0} (${analytics.signed_agreements || 0} signed)`],
      ['Agreement Value', this.formatMoneyWithCurrency_(analytics.total_agreement_value || 0, displayCurrency)],
      ['Total Invoiced', this.formatMoneyWithCurrency_(analytics.total_invoiced_value || 0, displayCurrency)],
      ['Total Paid', this.formatMoneyWithCurrency_(analytics.total_paid_amount || 0, displayCurrency)],
      ['Total Due', this.formatMoneyWithCurrency_(analytics.total_due_amount || 0, displayCurrency)],
      ['Invoices / Receipts', `${analytics.total_invoices_count || 0} / ${analytics.total_receipts_count || 0}`],
      ['Next Renewal', U.fmtDisplayDate(analytics.next_renewal_date) || '—']
    ];
    if (E.clientAnalyticsCards) {
      E.clientAnalyticsCards.innerHTML = analyticsCards
        .map(([label, value]) => `<div class="card kpi"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`)
        .join('');
    }

    const agreements = this.listClientRelatedAgreements_(client.client_id);
    const invoices = this.listClientRelatedInvoices_(client.client_id);
    const receipts = this.listClientRelatedReceipts_(client.client_id);
    if (E.clientRelatedAgreementsTbody) {
      E.clientRelatedAgreementsTbody.innerHTML = agreements.length
        ? agreements
            .map(item => `<tr>
              <td>${U.escapeHtml(item.agreement_number || item.agreement_id || '—')}</td>
              <td>${U.escapeHtml(item.status || '—')}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(item.grand_total || 0, item.currency || displayCurrency))}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(item.service_start_date) || '—')}</td>
              <td>${U.escapeHtml(U.fmtDisplayDate(item.service_end_date) || '—')}</td>
              <td>${item.id ? `<button class="btn ghost sm" type="button" data-agreement-view="${U.escapeAttr(item.id)}">Open</button>` : '—'}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="6" class="muted" style="text-align:center;">No agreements.</td></tr>';
    }
    if (E.clientRelatedInvoicesTbody) {
      E.clientRelatedInvoicesTbody.innerHTML = invoices.length
        ? invoices
            .map(item => `<tr>
              <td>${U.escapeHtml(item.invoice_number || item.invoice_id || '—')}</td>
              <td><span class="chip ${this.badgeClassFromInvoice_(item)}">${U.escapeHtml(item.status || '—')}</span></td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(item.grand_total || 0, item.currency || displayCurrency))}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(item.amount_paid || 0, item.currency || displayCurrency))}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(item.pending_amount || 0, item.currency || displayCurrency))}</td>
              <td>${item.id ? `<button class="btn ghost sm" type="button" data-invoice-view="${U.escapeAttr(item.id)}">Open</button>` : '—'}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="6" class="muted" style="text-align:center;">No invoices.</td></tr>';
    }
    if (E.clientRelatedReceiptsTbody) {
      E.clientRelatedReceiptsTbody.innerHTML = receipts.length
        ? receipts
            .map(item => `<tr>
              <td>${U.escapeHtml(item.receipt_number || item.receipt_id || '—')}</td>
              <td>${U.escapeHtml(item.payment_state || '—')}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(item.received_amount || 0, item.currency || displayCurrency))}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(item.pending_amount || 0, item.currency || displayCurrency))}</td>
              <td>${item.id ? `<button class="btn ghost sm" type="button" data-receipt-view="${U.escapeAttr(item.id)}">Open</button>` : '—'}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="5" class="muted" style="text-align:center;">No receipts.</td></tr>';
    }

    if (E.clientTimeline) {
      const timeline = (detailData.timeline || this.buildTimeline_(client.client_id)).slice(0, 20);
      E.clientTimeline.innerHTML = timeline.length
        ? timeline
            .map(item => `<li><strong>${U.escapeHtml(U.fmtDisplayDate(item.date || item.event_date) || '—')}</strong> — ${U.escapeHtml(item.label || item.title || item.type || 'Activity')}</li>`)
            .join('')
        : '<li class="muted">No timeline activity yet.</li>';
    }
    this.renderStatementSection_(detailData);
    this.renderRenewalsSection_(detailData, client);
    this.setDetailTab(this.state.activeDetailTab);
  },
  render() {
    this.applyFilters();
    this.renderList();
    this.renderDetail();
    if (E.clientsState) {
      E.clientsState.textContent = this.state.loadError || `Loaded ${this.state.filteredRows.length} of ${this.state.rows.length} clients.`;
    }
    if (E.clientsStatusFilter) {
      const statuses = ['All', ...new Set(this.state.rows.map(item => item.status).filter(Boolean))];
      E.clientsStatusFilter.innerHTML = statuses.map(status => `<option>${U.escapeHtml(status)}</option>`).join('');
      E.clientsStatusFilter.value = statuses.includes(this.state.status) ? this.state.status : 'All';
    }
    if (E.clientsGlobalRenewals) {
      const allRenewals = this.state.rows.flatMap(client => this.buildClientRenewalRows(client));
      const overdueRenewals = allRenewals.filter(row => (this.getDaysLeft(row.renewal_date) ?? 1) < 0).length;
      const dueSoon = allRenewals.filter(row => {
        const days = this.getDaysLeft(row.renewal_date);
        return days !== null && days >= 0 && days <= 30;
      }).length;
      const overduePayments = allRenewals.filter(row => this.getPaymentStatus(row) === 'Overdue').length;
      E.clientsGlobalRenewals.textContent = `Global renewals snapshot: ${dueSoon} due in 30 days, ${overdueRenewals} overdue renewals, ${overduePayments} overdue payments.`;
    }
  },
  renderDetailSkeletons_() {
    if (E.clientStatementTbody) {
      E.clientStatementTbody.innerHTML = '<tr><td colspan="10"><div class="skeleton" style="height:30px;"></div></td></tr>';
    }
    if (E.clientRenewalsTbody) {
      E.clientRenewalsTbody.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height:30px;"></div></td></tr>';
    }
  },
  async selectClient(clientId, options = {}) {
    this.state.selectedClientId = String(clientId || '').trim();
    this.render();
    if (!this.state.selectedClientId) return;
    this.state.detailLoading = true;
    this.renderDetailSkeletons_();
    try {
      await this.loadClientDetailData_(this.state.selectedClientId, options);
    } finally {
      this.state.detailLoading = false;
      this.render();
    }
  },
  async loadAndRefresh(options = {}) {
    if (this.state.loading && !options.force) return;
    if (!Permissions.canViewClients()) return;
    const hasWarmCache = this.state.loaded && Date.now() - this.state.lastLoadedAt <= this.state.cacheTtlMs;
    if (hasWarmCache && !options.force) {
      this.render();
      return;
    }
    this.state.loading = true;
    this.state.loadError = '';
    if (E.clientsState) E.clientsState.textContent = 'Loading client intelligence…';
    try {
      const clientsRes = await window.ClientsService.getDashboardData({
        limit: this.state.limit,
        page: this.state.page,
        search: this.state.search || '',
        status: this.state.status
      });
      const clientsList = this.extractListResult(clientsRes);
      this.state.rows = clientsList.rows.map(item => {
        const normalized = this.normalizeClient(item);
        normalized.analytics = this.resolveBackendAnalytics_(item);
        return normalized;
      });
      this.state.total = clientsList.total;
      this.state.returned = clientsList.returned;
      this.state.hasMore = clientsList.hasMore;
      this.state.page = clientsList.page;
      this.state.limit = clientsList.limit;
      this.state.offset = clientsList.offset;
      this.state.agreements = this.extractListResult(clientsRes.agreements || []).rows.map(item => this.normalizeAgreement(item));
      this.state.agreementItems = this.extractListResult(clientsRes.agreement_items || []).rows.map(item => this.normalizeAgreementItem(item));
      this.state.invoices = this.extractListResult(clientsRes.invoices || []).rows.map(item => this.normalizeInvoice(item));
      this.state.invoiceItems = this.extractListResult(clientsRes.invoice_items || []).rows;
      this.state.receipts = this.extractListResult(clientsRes.receipts || []).rows.map(item => this.normalizeReceipt(item));
      this.state.receiptItems = this.extractListResult(clientsRes.receipt_items || []).rows;

      this.state.agreements.forEach(agreement => {
        this.findOrCreateClientFromSignedAgreement_(agreement);
      });
      this.state.rows.forEach(client => {
        client.analytics = this.computeClientAnalytics_(client);
      });
      if (!this.state.selectedClientId && this.state.rows[0]?.client_id) this.state.selectedClientId = this.state.rows[0].client_id;
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.render();
      if (this.state.selectedClientId) await this.selectClient(this.state.selectedClientId, { force: options.force });
    } catch (error) {
      this.state.rows = [];
      this.state.loadError = error?.message || 'Failed to load clients.';
      this.render();
    } finally {
      this.state.loading = false;
    }
  },
  triggerLinkedDataRefresh_(reason = 'linked-data-change') {
    if (this.state.loading) return;
    console.debug('[Clients] linked data refresh requested', reason);
    this.loadAndRefresh({ force: true });
  },
  collectNewClientFormData() {
    if (!E.newClientForm) return null;
    const fd = new FormData(E.newClientForm);
    const payload = {};
    this.clientFields.forEach(field => {
      const value = String(fd.get(field) || '').trim();
      if (value) payload[field] = value;
    });
    payload.customer_name = String(fd.get('customer_name') || '').trim();
    payload.customer_legal_name = String(fd.get('customer_legal_name') || '').trim();
    payload.primary_contact_name = String(fd.get('primary_contact_name') || '').trim();
    payload.primary_contact_email = String(fd.get('primary_contact_email') || '').trim();
    payload.normalized_company_key = this.normalizeCompanyKey(payload.customer_legal_name || payload.customer_name);
    payload.source = String(payload.source || 'manual').trim();
    return payload;
  },
  openNewClientModal() {
    if (!E.newClientModal) return;
    E.newClientModal.classList.add('open');
    E.newClientModal.setAttribute('aria-hidden', 'false');
  },
  closeNewClientModal() {
    if (!E.newClientModal) return;
    E.newClientModal.classList.remove('open');
    E.newClientModal.setAttribute('aria-hidden', 'true');
    if (E.newClientForm) E.newClientForm.reset();
  },
  async runClientAction(action) {
    const clientId = String(this.state.selectedClientId || '').trim();
    if (!clientId) {
      UI.toast('Select a client first.');
      return;
    }
    const client = this.state.rows.find(item => item.client_id === clientId);
    if (!client) return;
    try {
      if (action === 'proposal') {
        const proposalDraft = this.buildProposalDraftFromClient_(client);
        console.debug('[Clients] action proposal', { clientId, draft: proposalDraft });
        if (!window.Proposals?.openProposalForm) throw new Error('Proposal form helper is unavailable.');
        window.Proposals.openProposalForm(proposalDraft, [], { readOnly: false });
        UI.toast('Proposal form opened from client.');
      } else if (action === 'agreement') {
        const agreementDraft = this.buildAgreementDraftFromClient_(client);
        console.debug('[Clients] action agreement', { clientId, draft: agreementDraft });
        if (!window.Agreements?.openAgreementForm) throw new Error('Agreement form helper is unavailable.');
        window.Agreements.openAgreementForm(agreementDraft, [], { readOnly: false });
        UI.toast('Agreement form opened from client.');
      } else if (action === 'invoice') {
        const prefill = this.buildClientActionPrefill_(client);
        const agreementUuid = String(prefill.preferredAgreement?.id || '').trim();
        console.debug('[Clients] action invoice', { clientId, agreementUuid });
        if (agreementUuid && window.Invoices?.openCreateFromAgreementTemplate) {
          await window.Invoices.openCreateFromAgreementTemplate(agreementUuid);
          UI.toast('Invoice form opened from agreement template.');
          return;
        }
        const invoiceDraft = this.buildInvoiceDraftFromClient_(client);
        if (!window.Invoices?.openInvoice) throw new Error('Invoice form helper is unavailable.');
        window.Invoices.openInvoice(invoiceDraft, [], { readOnly: false });
        UI.toast('Invoice form opened from client.');
      } else if (action === 'clone') {
        const { agreements, preferred } = this.resolveLatestAgreementContext_(clientId);
        if (!agreements.length) {
          UI.toast('No previous agreements found for this client.');
          return;
        }
        if (!preferred?.id) {
          UI.toast('Previous agreement is missing UUID and cannot be opened.');
          return;
        }
        await this.openAgreementCloneDraft_(preferred, client);
      }
    } catch (error) {
      UI.toast(error?.message || 'Client quick action failed.');
    }
  },
  wire() {
    window.addEventListener('clients:refresh-totals', event => {
      this.triggerLinkedDataRefresh_(event?.detail?.reason || 'external-event');
    });
    if (E.clientsRefreshBtn) E.clientsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    if (E.clientsSearchInput) {
      E.clientsSearchInput.addEventListener('input', () => {
        this.state.search = E.clientsSearchInput.value;
        this.render();
      });
    }
    if (E.clientsStatusFilter) {
      E.clientsStatusFilter.addEventListener('change', () => {
        this.state.status = E.clientsStatusFilter.value;
        this.render();
      });
    }
    if (E.clientsSortSelect) {
      E.clientsSortSelect.addEventListener('change', () => {
        this.state.sort = E.clientsSortSelect.value;
        this.render();
      });
    }
    if (E.clientsTbody) {
      E.clientsTbody.addEventListener('click', event => {
        const row = event.target?.closest?.('[data-client-row]');
        if (row) {
          const selectedId = String(row.getAttribute('data-client-row') || '').trim();
          this.selectClient(selectedId);
        }
      });
    }
    if (E.clientDetailTabButtons) {
      E.clientDetailTabButtons.addEventListener('click', event => {
        const trigger = event.target?.closest?.('[data-client-detail-tab]');
        if (!trigger) return;
        this.setDetailTab(trigger.getAttribute('data-client-detail-tab'));
      });
    }
    if (E.clientStatementApplyFiltersBtn) {
      E.clientStatementApplyFiltersBtn.addEventListener('click', async () => {
        this.state.statementFilters = {
          status: E.clientStatementFiltersStatus?.value || 'all',
          dateFrom: E.clientStatementDateFrom?.value || '',
          dateTo: E.clientStatementDateTo?.value || '',
          searchDoc: E.clientStatementSearchDoc?.value || ''
        };
        if (this.state.selectedClientId) await this.loadClientDetailData_(this.state.selectedClientId, { force: true });
        this.render();
      });
    }
    if (E.clientStatementResetFiltersBtn) {
      E.clientStatementResetFiltersBtn.addEventListener('click', async () => {
        this.state.statementFilters = { status: 'all', dateFrom: '', dateTo: '', searchDoc: '' };
        if (E.clientStatementFiltersStatus) E.clientStatementFiltersStatus.value = 'all';
        if (E.clientStatementDateFrom) E.clientStatementDateFrom.value = '';
        if (E.clientStatementDateTo) E.clientStatementDateTo.value = '';
        if (E.clientStatementSearchDoc) E.clientStatementSearchDoc.value = '';
        if (this.state.selectedClientId) await this.loadClientDetailData_(this.state.selectedClientId, { force: true });
        this.render();
      });
    }
    if (E.clientStatementExportPdfBtn) {
      E.clientStatementExportPdfBtn.addEventListener('click', () => this.previewStatementPdf());
    }
    if (E.clientStatementPreviewCloseBtn) {
      E.clientStatementPreviewCloseBtn.addEventListener('click', () => this.closeStatementPreviewModal());
    }
    if (E.clientStatementPreviewExportPdfBtn) {
      E.clientStatementPreviewExportPdfBtn.addEventListener('click', () => this.exportStatementPdf());
    }
    if (E.clientStatementPreviewModal) {
      E.clientStatementPreviewModal.addEventListener('click', event => {
        if (event.target === E.clientStatementPreviewModal) this.closeStatementPreviewModal();
      });
    }
    if (E.clientRenewalsApplyFiltersBtn) {
      E.clientRenewalsApplyFiltersBtn.addEventListener('click', async () => {
        this.state.renewalsFilters = { dateFrom: E.clientRenewalsDateFrom?.value || '', dateTo: E.clientRenewalsDateTo?.value || '' };
        if (this.state.selectedClientId) await this.loadClientDetailData_(this.state.selectedClientId, { force: true });
        this.render();
      });
    }
    if (E.clientRenewalsResetFiltersBtn) {
      E.clientRenewalsResetFiltersBtn.addEventListener('click', async () => {
        this.state.renewalsFilters = { dateFrom: '', dateTo: '' };
        if (E.clientRenewalsDateFrom) E.clientRenewalsDateFrom.value = '';
        if (E.clientRenewalsDateTo) E.clientRenewalsDateTo.value = '';
        if (this.state.selectedClientId) await this.loadClientDetailData_(this.state.selectedClientId, { force: true });
        this.render();
      });
    }
    if (E.clientsCreateBtn) E.clientsCreateBtn.addEventListener('click', () => this.openNewClientModal());
    if (E.newClientCloseBtn) E.newClientCloseBtn.addEventListener('click', () => this.closeNewClientModal());
    if (E.newClientCancelBtn) E.newClientCancelBtn.addEventListener('click', () => this.closeNewClientModal());
    if (E.newClientModal) {
      E.newClientModal.addEventListener('click', event => {
        if (event.target === E.newClientModal) this.closeNewClientModal();
      });
    }
    if (E.newClientForm) {
      E.newClientForm.addEventListener('submit', async event => {
        event.preventDefault();
        const payload = this.collectNewClientFormData();
        if (!payload?.customer_name) {
          UI.toast('Company Name is required.');
          return;
        }
        try {
          const created = await window.ClientsService.createClient(payload);
          this.state.rows.unshift(this.normalizeClient(created));
          this.state.selectedClientId = this.state.rows[0]?.client_id || this.state.selectedClientId;
          this.closeNewClientModal();
          this.render();
          UI.toast('Client created successfully.');
        } catch (error) {
          UI.toast(error?.message || 'Failed to create client.');
        }
      });
    }
    if (E.clientActionProposalBtn) E.clientActionProposalBtn.addEventListener('click', () => this.runClientAction('proposal'));
    if (E.clientActionAgreementBtn) E.clientActionAgreementBtn.addEventListener('click', () => this.runClientAction('agreement'));
    if (E.clientActionInvoiceBtn) E.clientActionInvoiceBtn.addEventListener('click', () => this.runClientAction('invoice'));
    if (E.clientActionCloneBtn) E.clientActionCloneBtn.addEventListener('click', () => this.runClientAction('clone'));
    if (E.clientsDetailPanel) {
      E.clientsDetailPanel.addEventListener('click', event => {
        const agreementBtn = event.target?.closest?.('[data-agreement-view]');
        if (agreementBtn) {
          const id = agreementBtn.getAttribute('data-agreement-view');
          console.debug('[Clients] open agreement', { agreementUuid: id });
          if (id && window.Agreements?.openAgreementFormById) window.Agreements.openAgreementFormById(id, { readOnly: true });
          return;
        }
        const invoiceBtn = event.target?.closest?.('[data-invoice-view]');
        if (invoiceBtn) {
          const id = invoiceBtn.getAttribute('data-invoice-view');
          console.debug('[Clients] open invoice', { invoiceUuid: id });
          if (id && window.Invoices?.openInvoiceById) window.Invoices.openInvoiceById(id, { readOnly: true });
          return;
        }
        const receiptBtn = event.target?.closest?.('[data-receipt-view]');
        if (receiptBtn) {
          const id = receiptBtn.getAttribute('data-receipt-view');
          console.debug('[Clients] open receipt', { receiptUuid: id });
          if (id && window.Receipts?.openReceiptById) window.Receipts.openReceiptById(id, { readOnly: true });
        }
      });
    }
  }
};

window.Clients = Clients;
