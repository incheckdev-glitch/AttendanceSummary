const Clients = {
  canViewClientSection(resource) {
    return Permissions.canView(resource);
  },
  canViewClientRenewals() {
    // Client profile renewals timeline is controlled by clients:view_renewals, not agreements:view.
    return Permissions.canViewClientRenewals();
  },
  canViewClientStatement() {
    return Permissions.canViewClientStatement();
  },
  canEditClient() {
    return Permissions.canPerformAction('clients', 'update') || Permissions.canPerformAction('clients', 'manage');
  },
  canExportClientStatement() {
    return Permissions.canExportClientStatement();
  },
  canImportOldClient() {
    return Boolean(Permissions?.isAdmin?.() || Permissions?.canPerformAction?.('clients', 'import_old'));
  },
  parseImportMeta_(client = {}) { try { return JSON.parse(String(client.notes || '{}')); } catch (_) { return {}; } },
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
    agreements: [],
    agreementItems: [],
    invoices: [],
    invoiceItems: [],
    receipts: [],
    receiptItems: [],
    companies: [],
    contacts: [],
    companiesById: new Map(),
    companiesByName: new Map(),
    contactsById: new Map(),
    agreementsByIdOrNumber: new Map(),
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
    activeDetailTab: 'intelligence_hub',
    initialized: false,
    selectedClientId: null,
    loadedTabsByClient: new Map(),
    tabCache: new Map(),
    pagination: new Map(),
    clientPanelLoading: false,
    statementFilters: { status: 'all', dateFrom: '', dateTo: '', searchDoc: '' },
    renewalsFilters: { dateFrom: '', dateTo: '' },
    scheduledPaymentsFilter: 'all',
    scheduledPaymentRowsById: new Map(),
    selectedRenewalRowIds: new Set(),
    activeRenewalRows: [],
    renewalRowsById: new Map()
  },
  getField(raw = {}, ...keys) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const found = keys.find(key => source[key] !== undefined && source[key] !== null);
    return found ? source[found] : '';
  },
  isUuid(value) {
    return typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
  },
  normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  },
  getCompanyIdKeys(company = {}) {
    return [company.id, company.company_id, company.company_uuid, company.uuid, company.companyId, company.companyUuid]
      .map(value => String(value || '').trim())
      .filter(Boolean);
  },
  getCompanyNameKeys(company = {}) {
    return [
      company.legal_company_name,
      company.legalCompanyName,
      company.legal_name,
      company.legalName,
      company.company_name,
      company.companyName,
      company.customer_name,
      company.customerName,
      company.client_name,
      company.clientName,
      company.name
    ].map(value => this.normalizeText(value)).filter(Boolean);
  },
  rebuildCompanyLookupMaps(companies = []) {
    this.state.companiesById = new Map();
    this.state.companiesByName = new Map();
    (Array.isArray(companies) ? companies : []).filter(Boolean).forEach(company => {
      this.getCompanyIdKeys(company).forEach(key => {
        if (!this.state.companiesById.has(key)) this.state.companiesById.set(key, company);
      });
      this.getCompanyNameKeys(company).forEach(key => {
        if (!this.state.companiesByName.has(key)) this.state.companiesByName.set(key, company);
      });
    });
  },
  getCompanyLegalDisplay(company = null, fallback = {}) {
    return String(
      company?.legal_company_name ||
      company?.legalCompanyName ||
      company?.legal_name ||
      company?.legalName ||
      fallback?.legal_company_name ||
      fallback?.legalCompanyName ||
      fallback?.customer_legal_name ||
      fallback?.customerLegalName ||
      fallback?.legal_name ||
      fallback?.legalName ||
      fallback?.customer_name ||
      fallback?.customerName ||
      company?.company_name ||
      company?.companyName ||
      fallback?.company_name ||
      fallback?.companyName ||
      fallback?.client_name ||
      fallback?.clientName ||
      ''
    ).trim();
  },
  buildContactPersonName(contact = {}) {
    const c = contact && typeof contact === 'object' ? contact : {};
    const first = String(c.first_name || c.firstName || '').trim();
    const last = String(c.last_name || c.lastName || '').trim();
    return [first, last].filter(Boolean).join(' ').trim() ||
      String(c.contact_name || c.contactName || c.full_name || c.fullName || '').trim();
  },
  normalizeMatchValue(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/s\.?a\.?l\.?/gi, 'sal')
      .replace(/\s+/g, ' ');
  },
  compactValues(values = []) {
    return values.filter(value => String(value || '').trim());
  },

  normalizeClientName(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[()（）]/g, '')
      .replace(/\s+/g, ' ');
  },
  getCompanyKeySetForClient(client = {}, companies = []) {
    const keys = new Set();

    const add = value => {
      const text = String(value || '').trim();
      if (text) keys.add(text);
    };

    // Do not use the client table UUID as a company key.
    // If the client is not linked to a company yet, using client.id here prevents
    // safe exact-name fallback against invoices/receipts that do have company_id.
    add(client.company_id);
    add(client.companyId);
    add(client.customer_company_id);
    add(client.customerCompanyId);
    add(client.client_company_id);
    add(client.clientCompanyId);

    const selectedName = this.normalizeClientName(
      client.legal_name ||
      client.company_name ||
      client.name ||
      client.customer_name ||
      ''
    );

    for (const company of Array.isArray(companies) ? companies : []) {
      const companyName = this.normalizeClientName(
        company.legal_name ||
        company.company_name ||
        company.name ||
        ''
      );

      if (
        selectedName &&
        companyName &&
        selectedName === companyName
      ) {
        add(company.id);
        add(company.company_id);
        add(company.companyId);
      }
    }

    return keys;
  },
  getLinkedContactsForClient(client = {}, contacts = [], companies = []) {
    const companyKeys = this.getCompanyKeySetForClient(client, companies);

    return (Array.isArray(contacts) ? contacts : []).filter(contact => {
      const contactCompanyKeys = [
        contact.company_id,
        contact.companyId,
        contact.customer_company_id,
        contact.client_company_id
      ].map(value => String(value || '').trim()).filter(Boolean);

      return contactCompanyKeys.some(key => companyKeys.has(key));
    });
  },
  getPrimaryContactForClient(client = {}, contacts = [], companies = []) {
    const linkedContacts = this.getLinkedContactsForClient(client, contacts, companies);

    if (!linkedContacts.length) return null;

    return linkedContacts.find(contact =>
      contact.is_primary === true ||
      String(contact.is_primary).toLowerCase() === 'true'
    ) || linkedContacts[0];
  },
  valuesMatch(left, right) {
    const l = this.normalizeMatchValue(left);
    const r = this.normalizeMatchValue(right);
    return Boolean(l && r && l === r);
  },
  normalizeAgreementForClient(agreement = {}) {
    const source = agreement && typeof agreement === 'object' ? agreement : {};
    return {
      ...source,
      client_name:
        source.client_name ||
        source.customer_name ||
        source.customer_legal_name ||
        source.provider_name ||
        '',
      client_email:
        source.client_email ||
        source.customer_contact_email ||
        '',
      client_phone:
        source.client_phone ||
        source.customer_contact_mobile ||
        '',
      number_of_locations:
        source.number_of_locations ||
        source.locations_count ||
        source.location_count ||
        source.subtotal_locations ||
        '',
      payment_terms:
        source.payment_terms ||
        source.payment_term ||
        '',
      payment_term:
        source.payment_term ||
        source.payment_terms ||
        '',
      service_start_date:
        source.service_start_date ||
        source.effective_date ||
        source.agreement_date ||
        '',
      service_end_date:
        source.service_end_date ||
        '',
      total_value:
        this.toNumberSafe(
          source.grand_total ||
            source.total_value ||
            source.total_amount ||
            source.amount ||
            0
        )
    };
  },
  getClientKeys(client = {}) {
    client = client && typeof client === 'object' ? client : {};
    return this.compactValues([
      client.client_id,
      client.id,
      client.client_name,
      client.company_name,
      client.customer_name,
      client.customer_legal_name,
      client.legal_name,
      client.name,
      client.primary_contact_email,
      client.primary_email,
      client.email,
      client.client_email,
      client.phone,
      client.mobile,
      ...(Array.isArray(client.source_client_ids) ? client.source_client_ids : [])
    ]);
  },
  getAgreementKeys(agreement = {}) {
    agreement = agreement && typeof agreement === 'object' ? agreement : {};
    const normalizedAgreement = this.normalizeAgreementForClient(agreement);
    return this.compactValues([
      agreement.id,
      agreement.agreement_id,
      agreement.agreement_number,
      normalizedAgreement.client_name,
      normalizedAgreement.client_email,
      normalizedAgreement.client_phone,
      agreement.customer_name,
      agreement.customer_contact_email,
      agreement.customer_contact_mobile
    ]);
  },
  getClientCompanyId(client = {}) {
    return String(
      client.company_id ||
      client.companyId ||
      client.customer_company_id ||
      client.customerCompanyId ||
      client.client_company_id ||
      client.clientCompanyId ||
      ''
    ).trim();
  },
  getAgreementCompanyId(agreement = {}) {
    return String(
      agreement.company_id ||
      agreement.companyId ||
      agreement.customer_company_id ||
      agreement.customerCompanyId ||
      agreement.client_company_id ||
      agreement.clientCompanyId ||
      ''
    ).trim();
  },
  getClientLegalName(client = {}) {
    return String(client.customer_legal_name || client.company_name || client.customer_name || client.client_name || client.name || '').trim();
  },
  getAgreementLegalName(agreement = {}) {
    return String(agreement.customer_legal_name || agreement.company_name || agreement.customer_name || agreement.client_name || '').trim();
  },
  getRawCompanyIdValues_(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    return [
      source.company_id,
      source.companyId,
      source.company_uuid,
      source.companyUuid,
      source.customer_company_id,
      source.customerCompanyId,
      source.client_company_id,
      source.clientCompanyId
    ].map(value => String(value || '').trim()).filter(Boolean);
  },
  findCompanyForRecord_(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    const rawIds = this.getRawCompanyIdValues_(source);
    for (const id of rawIds) {
      const company = this.state.companiesById?.get?.(id);
      if (company) return company;
    }

    const names = [
      source.customer_legal_name,
      source.customerLegalName,
      source.legal_name,
      source.legalName,
      source.company_name,
      source.companyName,
      source.customer_name,
      source.customerName,
      source.client_name,
      source.clientName,
      source.name
    ].map(value => this.normalizeCompanyKey(value)).filter(Boolean);

    for (const name of names) {
      const company = this.state.companiesByName?.get?.(name);
      if (company) return company;
    }

    return null;
  },

  getExpandedCompanyIdKeys_(record = {}) {
    const keys = new Set(this.getRawCompanyIdValues_(record));
    const company = this.findCompanyForRecord_(record);
    if (company) {
      this.getCompanyIdKeys(company).forEach(key => keys.add(key));
    }
    return keys;
  },
  companyKeySetsIntersect_(left = new Set(), right = new Set()) {
    for (const key of left) if (right.has(key)) return true;
    return false;
  },
  hasStrictClientOwnership(agreement = {}, client = {}) {
    const clientCompanyKeys = this.getCompanyKeySetForClient(client, this.state?.companies || this.companies || []);
    this.getExpandedCompanyIdKeys_(client).forEach(key => clientCompanyKeys.add(key));
    const agreementCompanyKeys = this.getExpandedCompanyIdKeys_(agreement);

    if (clientCompanyKeys.size && agreementCompanyKeys.size) {
      return this.companyKeySetsIntersect_(clientCompanyKeys, agreementCompanyKeys);
    }

    // Historical/imported/client-panel records can have the client row missing company_id
    // while the invoice/agreement/receipt has company_id. In that case exact normalized
    // legal/company name matching is the safest fallback. Never use partial includes.
    const agreementName = this.normalizeCompanyKey(this.getAgreementLegalName(agreement));
    const clientName = this.normalizeCompanyKey(this.getClientLegalName(client));
    return Boolean(agreementName && clientName && agreementName === clientName);
  },
  agreementBelongsToClient(agreement = {}, client = {}) {
    return this.hasStrictClientOwnership(agreement, client);
  },
  invoiceBelongsToClient(invoice = {}, client = {}, relatedAgreements = []) {
    if (this.hasStrictClientOwnership(invoice, client)) return true;
    return relatedAgreements.some(agreement =>
      this.valuesMatch(invoice.agreement_id, agreement.id) ||
      this.valuesMatch(invoice.agreement_id, agreement.agreement_id) ||
      this.valuesMatch(invoice.agreement_number, agreement.agreement_number) ||
      this.valuesMatch(invoice.source_agreement_id, agreement.id) ||
      this.valuesMatch(invoice.source_agreement_id, agreement.agreement_id) ||
      this.valuesMatch(invoice.source_agreement_number, agreement.agreement_number) ||
      this.valuesMatch(invoice.proposal_id, agreement.proposal_id)
    );
  },
  receiptBelongsToClient(receipt = {}, client = {}, relatedAgreements = [], relatedInvoices = []) {
    if (this.hasStrictClientOwnership(receipt, client)) return true;
    const invoiceMatch = relatedInvoices.some(invoice =>
      this.valuesMatch(receipt.invoice_id, invoice.id) ||
      this.valuesMatch(receipt.invoice_id, invoice.invoice_id) ||
      this.valuesMatch(receipt.invoice_number, invoice.invoice_number) ||
      this.valuesMatch(receipt.invoice_number, invoice.id)
    );
    if (invoiceMatch) return true;
    return relatedAgreements.some(agreement =>
      this.valuesMatch(receipt.agreement_id, agreement.id) ||
      this.valuesMatch(receipt.agreement_id, agreement.agreement_id) ||
      this.valuesMatch(receipt.agreement_number, agreement.agreement_number) ||
      this.valuesMatch(receipt.proposal_id, agreement.proposal_id)
    );
  },
  isDebugMode_() {
    return Boolean(window.DEBUG || window.__DEBUG__ || localStorage.getItem('clients_debug') === '1');
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
      .normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/s\.?\s*a\.?\s*l\.?/gi, 'sal')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the)\b/gi, ' ')
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
      client_uuid: String(raw.client_uuid || raw.clientUuid || raw.id || '').trim(),
      client_id: String(raw.client_id || raw.clientId || raw.id || '').trim(),
      company_id: String(raw.company_id || raw.companyId || raw.customer_company_id || raw.customerCompanyId || raw.client_company_id || raw.clientCompanyId || '').trim(),
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
      proposal_id: String(raw.proposal_id || raw.proposalId || raw.source_proposal_id || '').trim(),
      source_agreement_id: String(raw.source_agreement_id || raw.sourceAgreementId || '').trim(),
      source_agreement_number: String(raw.source_agreement_number || raw.sourceAgreementNumber || '').trim(),
      client_id: String(raw.client_id || raw.clientId || '').trim(),
      client_uuid: String(raw.client_uuid || raw.clientUuid || '').trim(),
      customer_id: String(raw.customer_id || raw.customerId || '').trim(),
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      customer_company_id: String(raw.customer_company_id || raw.customerCompanyId || '').trim(),
      client_company_id: String(raw.client_company_id || raw.clientCompanyId || '').trim(),
      client_name: String(raw.client_name || raw.clientName || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      email: String(raw.email || '').trim(),
      client_email: String(raw.client_email || raw.clientEmail || raw.customer_contact_email || '').trim(),
      phone: String(raw.phone || '').trim(),
      client_phone: String(raw.client_phone || raw.clientPhone || raw.customer_contact_mobile || '').trim(),
      status: String(raw.status || '').trim(),
      grand_total: this.toNumberSafe(raw.grand_total ?? raw.grand_tota ?? raw.grandTotal ?? raw.total_amount ?? raw.total),
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
      ...raw,
      id: String(raw.id || raw.item_id || raw.itemId || '').trim(),
      agreement_id: String(raw.agreement_id || raw.agreementId || raw.parent_agreement_id || raw.parentAgreementId || '').trim(),
      agreement_number: String(raw.agreement_number || raw.agreementNumber || raw.parent_agreement_number || raw.parentAgreementNumber || '').trim(),
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      is_superseded: raw.is_superseded === true || String(raw.is_superseded || raw.isSuperseded || '').trim().toLowerCase() === 'true',
      superseded_at: String(raw.superseded_at || raw.supersededAt || '').trim(),
      superseded_by_agreement_id: String(raw.superseded_by_agreement_id || raw.supersededByAgreementId || '').trim(),
      superseded_by_agreement_number: String(raw.superseded_by_agreement_number || raw.supersededByAgreementNumber || '').trim(),
      renewal_key: String(raw.renewal_key || raw.renewalKey || '').trim(),
      superseded_by_item_id: String(raw.superseded_by_item_id || raw.supersededByItemId || '').trim(),
      renewed_from_item_id: String(raw.renewed_from_item_id || raw.renewedFromItemId || '').trim(),
      parent_agreement_id: String(raw.parent_agreement_id || raw.parentAgreementId || '').trim(),
      parent_agreement_number: String(raw.parent_agreement_number || raw.parentAgreementNumber || '').trim(),
      source_agreement_id: String(raw.source_agreement_id || raw.sourceAgreementId || '').trim(),
      source_agreement_number: String(raw.source_agreement_number || raw.sourceAgreementNumber || '').trim(),
      invoice_id: String(raw.invoice_id || raw.invoiceId || raw.invoiced_invoice_id || raw.invoicedInvoiceId || raw.source_invoice_id || raw.sourceInvoiceId || '').trim(),
      invoice_number: String(raw.invoice_number || raw.invoiceNumber || raw.invoiced_invoice_number || raw.invoicedInvoiceNumber || raw.source_invoice_number || raw.sourceInvoiceNumber || '').trim(),
      invoiced_invoice_id: String(raw.invoiced_invoice_id || raw.invoicedInvoiceId || raw.invoice_id || raw.invoiceId || '').trim(),
      invoiced_invoice_number: String(raw.invoiced_invoice_number || raw.invoicedInvoiceNumber || raw.invoice_number || raw.invoiceNumber || '').trim(),
      invoice_status: String(raw.invoice_status || raw.invoiceStatus || '').trim(),
      invoiced_at: String(raw.invoiced_at || raw.invoicedAt || '').trim(),
      section: String(raw.section || raw.category || raw.type || raw.section_name || raw.section_label || '').trim(),
      category: String(raw.category || raw.section || raw.type || '').trim(),
      location_name: String(raw.location_name || raw.locationName || raw.location || raw.site || raw.site_name || raw.branch || raw.branch_name || raw.store_name || '').trim(),
      item_name: String(raw.item_name || raw.itemName || raw.product_name || raw.productName || raw.service_name || raw.serviceName || raw.module || raw.module_name || raw.moduleName || raw.description || '').trim(),
      module_name: String(raw.module_name || raw.moduleName || raw.module || raw.service_name || raw.serviceName || raw.product_name || raw.productName || raw.item_name || raw.itemName || '').trim(),
      billing_frequency: String(raw.billing_frequency || raw.billingFrequency || raw.billing_cycle || raw.billingCycle || raw.frequency || '').trim(),
      payment_term: String(raw.payment_term || raw.payment_terms || raw.paymentTerm || raw.paymentTerms || '').trim(),
      service_start_date: String(raw.service_start_date || raw.serviceStartDate || raw.start_date || raw.startDate || '').trim(),
      service_end_date: String(raw.service_end_date || raw.serviceEndDate || raw.end_date || raw.endDate || raw.renewal_date || raw.renewalDate || '').trim(),
      renewal_date: String(raw.renewal_date || raw.renewalDate || raw.service_end_date || raw.serviceEndDate || raw.end_date || raw.endDate || '').trim(),
      unit_price: this.toNumberSafe(raw.unit_price ?? raw.unitPrice ?? raw.license_price_year ?? raw.licensePriceYear ?? raw.annual_license_price ?? raw.annualLicensePrice),
      discount_percent: this.toNumberSafe(raw.discount_percent ?? raw.discountPercent),
      quantity: this.toNumberSafe(raw.quantity ?? raw.qty ?? raw.license_months ?? raw.licenseMonths),
      line_total: this.toNumberSafe(raw.line_total ?? raw.lineTotal ?? raw.total ?? raw.amount ?? raw.price ?? raw.unit_price),
      created_at: String(raw.created_at || raw.createdAt || '').trim()
    };
  },
  normalizeInvoiceItem(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      ...source,
      id: String(source.id || source.item_id || source.itemId || source.invoice_item_id || source.invoiceItemId || '').trim(),
      invoice_id: String(source.invoice_id || source.invoiceId || source.invoice_uuid || source.invoiceUuid || source.parent_invoice_id || source.parentInvoiceId || '').trim(),
      invoice_number: String(source.invoice_number || source.invoiceNumber || source.invoice_no || source.invoiceNo || source.parent_invoice_number || source.parentInvoiceNumber || source.source_invoice_number || source.sourceInvoiceNumber || '').trim(),
      invoice_no: String(source.invoice_no || source.invoiceNo || source.invoice_number || source.invoiceNumber || '').trim(),
      agreement_id: String(source.agreement_id || source.agreementId || source.parent_agreement_id || source.parentAgreementId || source.source_agreement_id || source.sourceAgreementId || '').trim(),
      agreement_number: String(source.agreement_number || source.agreementNumber || source.parent_agreement_number || source.parentAgreementNumber || source.source_agreement_number || source.sourceAgreementNumber || source.agreement_reference || source.agreementReference || source.linked_agreement_number || source.linkedAgreementNumber || '').trim(),
      agreement_reference: String(source.agreement_reference || source.agreementReference || source.agreement_ref || source.agreementRef || source.linked_agreement_number || source.linkedAgreementNumber || '').trim(),
      company_id: String(source.company_id || source.companyId || '').trim(),
      section: String(source.section || source.item_section || source.itemSection || source.category || source.type || '').trim(),
      category: String(source.category || source.section || source.type || '').trim(),
      line_no: source.line_no ?? source.lineNo ?? source.sort_order ?? source.sortOrder ?? '',
      location_name: String(source.location_name || source.locationName || source.location || source.site || source.site_name || source.branch || source.branch_name || source.store_name || '').trim(),
      item_name: String(source.item_name || source.itemName || source.product_name || source.productName || source.service_name || source.serviceName || source.module || source.module_name || source.moduleName || source.description || '').trim(),
      module_name: String(source.module_name || source.moduleName || source.module || source.service_name || source.serviceName || source.product_name || source.productName || source.item_name || source.itemName || '').trim(),
      service_start_date: String(source.service_start_date || source.serviceStartDate || source.start_service_date || source.startServiceDate || source.start_date || source.startDate || '').trim(),
      service_end_date: String(source.service_end_date || source.serviceEndDate || source.end_service_date || source.endServiceDate || source.end_date || source.endDate || source.renewal_date || source.renewalDate || '').trim(),
      renewal_date: String(source.renewal_date || source.renewalDate || source.service_end_date || source.serviceEndDate || source.end_date || source.endDate || '').trim(),
      unit_price: this.toNumberSafe(source.unit_price ?? source.unitPrice ?? source.license_price_year ?? source.licensePriceYear ?? source.annual_license_price ?? source.annualLicensePrice),
      discount_percent: this.toNumberSafe(source.discount_percent ?? source.discountPercent),
      quantity: this.toNumberSafe(source.quantity ?? source.qty ?? source.license_months ?? source.licenseMonths),
      license_quantity: this.toNumberSafe(source.license_quantity ?? source.licenseQuantity),
      line_total: this.toNumberSafe(source.line_total ?? source.lineTotal ?? source.total ?? source.amount ?? source.price ?? source.unit_price),
      currency: String(source.currency || source.currency_code || source.currencyCode || '').trim(),
      created_at: String(source.created_at || source.createdAt || '').trim(),
      updated_at: String(source.updated_at || source.updatedAt || '').trim()
    };
  },
  normalizeInvoice(raw = {}) {
    return {
      ...raw,
      id: String(raw.id || '').trim(),
      invoice_id: String(raw.invoice_id || raw.invoiceId || '').trim(),
      invoice_number: String(raw.invoice_number || raw.invoiceNumber || '').trim(),
      agreement_id: String(raw.agreement_id || raw.agreementId || '').trim(),
      agreement_number: String(raw.agreement_number || raw.agreementNumber || '').trim(),
      proposal_id: String(raw.proposal_id || raw.proposalId || raw.source_proposal_id || '').trim(),
      source_agreement_id: String(raw.source_agreement_id || raw.sourceAgreementId || '').trim(),
      source_agreement_number: String(raw.source_agreement_number || raw.sourceAgreementNumber || '').trim(),
      client_id: String(raw.client_id || raw.clientId || '').trim(),
      client_uuid: String(raw.client_uuid || raw.clientUuid || '').trim(),
      customer_id: String(raw.customer_id || raw.customerId || '').trim(),
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      customer_company_id: String(raw.customer_company_id || raw.customerCompanyId || '').trim(),
      client_company_id: String(raw.client_company_id || raw.clientCompanyId || '').trim(),
      client_name: String(raw.client_name || raw.clientName || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      email: String(raw.email || raw.customer_contact_email || '').trim(),
      client_email: String(raw.client_email || raw.clientEmail || raw.customer_contact_email || '').trim(),
      customer_contact_email: String(raw.customer_contact_email || raw.customerContactEmail || '').trim(),
      customer_contact_mobile: String(raw.customer_contact_mobile || raw.customerContactMobile || '').trim(),
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
      ...raw,
      id: String(raw.id || '').trim(),
      receipt_id: String(raw.receipt_id || raw.receiptId || '').trim(),
      receipt_number: String(raw.receipt_number || raw.receiptNumber || '').trim(),
      invoice_id: String(raw.invoice_id || raw.invoiceId || '').trim(),
      invoice_number: String(raw.invoice_number || raw.invoiceNumber || '').trim(),
      agreement_id: String(raw.agreement_id || raw.agreementId || '').trim(),
      agreement_number: String(raw.agreement_number || raw.agreementNumber || '').trim(),
      proposal_id: String(raw.proposal_id || raw.proposalId || raw.source_proposal_id || '').trim(),
      source_agreement_id: String(raw.source_agreement_id || raw.sourceAgreementId || '').trim(),
      source_agreement_number: String(raw.source_agreement_number || raw.sourceAgreementNumber || '').trim(),
      client_id: String(raw.client_id || raw.clientId || '').trim(),
      client_uuid: String(raw.client_uuid || raw.clientUuid || '').trim(),
      customer_id: String(raw.customer_id || raw.customerId || '').trim(),
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      customer_company_id: String(raw.customer_company_id || raw.customerCompanyId || '').trim(),
      client_company_id: String(raw.client_company_id || raw.clientCompanyId || '').trim(),
      client_name: String(raw.client_name || raw.clientName || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      email: String(raw.email || raw.customer_contact_email || '').trim(),
      client_email: String(raw.client_email || raw.clientEmail || raw.customer_contact_email || '').trim(),
      customer_contact_email: String(raw.customer_contact_email || raw.customerContactEmail || '').trim(),
      customer_contact_mobile: String(raw.customer_contact_mobile || raw.customerContactMobile || '').trim(),
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
  resolveCompanyForClient(client = {}, context = {}) {
    const { companiesById = new Map(), companiesByName = new Map(), agreements = [], invoices = [], receipts = [] } = context;
    const directCompanyId = String(client.company_id || client.company_uuid || client.companyId || client.companyUuid || '').trim();
    if (directCompanyId && companiesById.has(directCompanyId)) return companiesById.get(directCompanyId);
    const clientAgreementKeys = [
      client.agreement_uuid, client.agreementUuid, client.agreement_id, client.agreementId, client.agreement_number, client.agreementNumber
    ].map(value => String(value || '').trim()).filter(Boolean);
    if (clientAgreementKeys.length) {
      const agreement = agreements.find(a => {
        const keys = [a.id, a.agreement_uuid, a.agreementUuid, a.agreement_id, a.agreementId, a.agreement_number, a.agreementNumber]
          .map(value => String(value || '').trim()).filter(Boolean);
        return keys.some(key => clientAgreementKeys.includes(key));
      });
      const companyId = String(agreement?.company_id || agreement?.company_uuid || agreement?.companyId || agreement?.companyUuid || '').trim();
      if (companyId && companiesById.has(companyId)) return companiesById.get(companyId);
    }
    const latestAgreement = agreements
      .filter(a => this.agreementBelongsToClient(a, client))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0];
    const latestAgreementCompanyId = String(latestAgreement?.company_id || latestAgreement?.company_uuid || latestAgreement?.companyId || latestAgreement?.companyUuid || '').trim();
    if (latestAgreementCompanyId && companiesById.has(latestAgreementCompanyId)) return companiesById.get(latestAgreementCompanyId);
    const relatedInvoice = invoices
      .filter(invoice => this.invoiceBelongsToClient(invoice, client, agreements))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0];
    const invoiceCompanyId = String(relatedInvoice?.company_id || relatedInvoice?.company_uuid || relatedInvoice?.companyId || relatedInvoice?.companyUuid || '').trim();
    if (invoiceCompanyId && companiesById.has(invoiceCompanyId)) return companiesById.get(invoiceCompanyId);
    const relatedReceipt = receipts
      .filter(receipt => this.receiptBelongsToClient(receipt, client, agreements, invoices))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0];
    const receiptCompanyId = String(relatedReceipt?.company_id || relatedReceipt?.company_uuid || relatedReceipt?.companyId || relatedReceipt?.companyUuid || '').trim();
    if (receiptCompanyId && companiesById.has(receiptCompanyId)) return companiesById.get(receiptCompanyId);
    const possibleNames = [client.legal_company_name, client.legalCompanyName, client.customer_legal_name, client.customerLegalName, client.legal_name, client.legalName, client.customer_name, client.customerName, client.company_name, client.companyName, client.client_name, client.clientName]
      .filter(Boolean);
    for (const name of possibleNames) {
      const key = this.normalizeText(name);
      if (key && companiesByName.has(key)) return companiesByName.get(key);
    }
    return null;
  },
  resolveContactForClient(client = {}, linkedCompany = null, context = {}) {
    const contacts = Array.isArray(context.contacts) ? context.contacts : [];
    const companies = Array.isArray(context.companies) ? context.companies : [];
    return this.getPrimaryContactForClient(client, contacts, companies);
  },
  canRunClientAction_(action) {
    if (action === 'proposal') return canAnyPermission([['proposals','create'], ['proposals','create_from_client'], ['proposals','manage']]);
    if (action === 'agreement' || action === 'clone') return canAnyPermission([['agreements','create'], ['agreements','create_from_client'], ['agreements','manage']]);
    if (action === 'invoice') return canAnyPermission([['invoices','create'], ['invoices','create_from_client'], ['invoices','manage']]);
    if (action === 'receipt') return canAnyPermission([['receipts','create'], ['receipts','create_from_invoice'], ['receipts','manage']]);
    return false;
  },
  applyClientActionVisibility_() {
    const mappings = [
      [E.clientActionProposalBtn, 'proposal'],
      [E.clientActionAgreementBtn, 'agreement'],
      [E.clientActionInvoiceBtn, 'invoice'],
      [E.clientActionCloneBtn, 'clone']
    ];
    mappings.forEach(([button, action]) => {
      if (!button) return;
      const allowed = this.canRunClientAction_(action);
      button.style.display = allowed ? '' : 'none';
      button.disabled = !allowed;
      button.setAttribute('aria-hidden', String(!allowed));
    });
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
    const clientKeys = this.getClientKeys(client);
    const recordKeys = this.compactValues([
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
    ]);
    return recordKeys.some(recordKey => clientKeys.some(clientKey => this.valuesMatch(recordKey, clientKey)));
  },
  matchesClientAgreement_(agreement = {}, client = {}) {
    agreement = agreement && typeof agreement === 'object' ? agreement : {};
    client = client && typeof client === 'object' ? client : {};
    if (this.agreementBelongsToClient(agreement, client)) return true;

    const sourceAgreementId = String(client.source_agreement_id || '').trim();
    if (!sourceAgreementId) return false;

    const sourceMatches = [agreement.id, agreement.agreement_id, agreement.agreement_number]
      .map(value => String(value || '').trim())
      .some(value => value && value === sourceAgreementId);
    if (!sourceMatches) return false;

    const clientCompanyId = this.getClientCompanyId(client);
    const agreementCompanyId = this.getAgreementCompanyId(agreement);
    if (clientCompanyId || agreementCompanyId) return Boolean(clientCompanyId && agreementCompanyId && clientCompanyId === agreementCompanyId);

    return this.agreementBelongsToClient(agreement, client);
  },
  listClientRelatedAgreements_(clientId) {
    const client = this.state.rows.find(row => row.client_id === clientId);
    if (!client) return [];
    const cachedAgreements = this.getCachedClientDetailRows_(clientId, 'agreements');
    if (cachedAgreements.length) return cachedAgreements;
    const matchedAgreements = (Array.isArray(this.state.agreements) ? this.state.agreements : []).filter(Boolean).filter(item => this.matchesClientAgreement_(item, client));
    console.log('[AgreementMapping] matched agreements for client', {
      clientName: client?.client_name || client?.company_name || client?.name || client?.customer_name,
      matched: matchedAgreements.length
    });
    return matchedAgreements;
  },
  getAgreementMatchKeys_(agreement = {}) {
    agreement = agreement && typeof agreement === 'object' ? agreement : {};
    return [agreement.id, agreement.agreement_id, agreement.agreement_number, agreement.source_agreement_id, agreement.source_agreement_number]
      .map(value => String(value || '').trim())
      .filter(Boolean);
  },
  getAgreementItemMatchKeys_(item = {}) {
    item = item && typeof item === 'object' ? item : {};
    return [
      item.agreement_id,
      item.agreement_number,
      item.parent_agreement_id,
      item.parent_agreement_number,
      item.source_agreement_id,
      item.source_agreement_number
    ]
      .map(value => String(value || '').trim())
      .filter(Boolean);
  },
  findAgreementForItem_(item = {}, agreements = []) {
    item = item && typeof item === 'object' ? item : {};
    const safeAgreements = Array.isArray(agreements) ? agreements.filter(Boolean) : [];
    const itemKeys = this.getAgreementItemMatchKeys_(item);
    return safeAgreements.find(agreement => {
      const agreementKeys = this.getAgreementMatchKeys_(agreement);
      return itemKeys.some(itemKey => agreementKeys.some(agreementKey => this.valuesMatch(itemKey, agreementKey)));
    }) || {};
  },
  listClientAgreementLocationItems_(clientId) {
    const linkedAgreements = this.listClientRelatedAgreements_(clientId);
    const linkedAgreementKeys = linkedAgreements.flatMap(item => this.getAgreementMatchKeys_(item));
    const cachedAgreementItems = this.getCachedClientDetailRows_(clientId, 'agreementItems');
    const sourceAgreementItems = cachedAgreementItems.length ? cachedAgreementItems : (Array.isArray(this.state.agreementItems) ? this.state.agreementItems : []);
    return sourceAgreementItems
      .filter(Boolean)
      .filter(item => {
        const itemKeys = this.getAgreementItemMatchKeys_(item);
        return itemKeys.some(key => linkedAgreementKeys.some(agreementKey => this.valuesMatch(key, agreementKey)));
      })
      .filter(item => this.isAnnualSaasClientLocationItem(item));
  },
  listClientRelatedInvoices_(clientId) {
    const client = this.state.rows.find(row => row.client_id === clientId);
    if (!client) return [];
    const cachedInvoices = this.getCachedClientDetailRows_(clientId, 'invoices');
    if (cachedInvoices.length) return cachedInvoices;
    const linkedAgreements = this.listClientRelatedAgreements_(clientId);
    const relatedInvoices = (Array.isArray(this.state.invoices) ? this.state.invoices : []).filter(Boolean).filter(item => this.invoiceBelongsToClient(item, client, linkedAgreements));
    if (this.isDebugMode_()) {
      const unmatched = this.state.invoices.filter(item => !this.invoiceBelongsToClient(item, client, linkedAgreements)).slice(0, 20);
      if (unmatched.length) console.debug('[ClientsDetail] unmatched invoices', unmatched);
    }
    return relatedInvoices;
  },
  listClientRelatedReceipts_(clientId) {
    const client = this.state.rows.find(row => row.client_id === clientId);
    if (!client) return [];
    const cachedReceipts = this.getCachedClientDetailRows_(clientId, 'receipts');
    if (cachedReceipts.length) return cachedReceipts;
    const linkedAgreements = this.listClientRelatedAgreements_(clientId);
    const linkedInvoices = this.listClientRelatedInvoices_(clientId);
    const relatedReceipts = (Array.isArray(this.state.receipts) ? this.state.receipts : []).filter(Boolean).filter(item => this.receiptBelongsToClient(item, client, linkedAgreements, linkedInvoices));
    if (this.isDebugMode_()) {
      const unmatched = this.state.receipts.filter(item => !this.receiptBelongsToClient(item, client, linkedAgreements, linkedInvoices)).slice(0, 20);
      if (unmatched.length) console.debug('[ClientsDetail] unmatched receipts', unmatched);
    }
    return relatedReceipts;
  },
  getInvoiceMatchKeys_(invoice = {}) {
    invoice = invoice && typeof invoice === 'object' ? invoice : {};
    return [
      invoice.id,
      invoice.invoice_id,
      invoice.invoiceId,
      invoice.invoice_uuid,
      invoice.invoiceUuid,
      invoice.invoice_number,
      invoice.invoiceNumber,
      invoice.invoice_no,
      invoice.invoiceNo
    ]
      .map(value => String(value || '').trim())
      .filter(Boolean);
  },
  getInvoiceItemMatchKeys_(item = {}) {
    item = item && typeof item === 'object' ? item : {};
    return [
      item.invoice_id,
      item.invoiceId,
      item.invoice_uuid,
      item.invoiceUuid,
      item.invoice_number,
      item.invoiceNumber,
      item.invoice_no,
      item.invoiceNo,
      item.parent_invoice_id,
      item.parent_invoice_number,
      item.source_invoice_id,
      item.source_invoice_number
    ]
      .map(value => String(value || '').trim())
      .filter(Boolean);
  },
  getAgreementLinkKeysFromInvoiceItem_(item = {}) {
    item = item && typeof item === 'object' ? item : {};
    return [
      item.agreement_id,
      item.agreementId,
      item.agreement_uuid,
      item.agreementUuid,
      item.agreement_number,
      item.agreementNumber,
      item.agreement_reference,
      item.agreementReference,
      item.agreement_ref,
      item.agreementRef,
      item.linked_agreement_number,
      item.linkedAgreementNumber,
      item.source_agreement_id,
      item.sourceAgreementId,
      item.source_agreement_number,
      item.sourceAgreementNumber
    ].map(value => String(value || '').trim()).filter(Boolean);
  },
  getInvoiceKeysFromAgreementItem_(item = {}) {
    item = item && typeof item === 'object' ? item : {};
    return [
      item.invoice_id,
      item.invoiceId,
      item.invoice_uuid,
      item.invoiceUuid,
      item.invoice_number,
      item.invoiceNumber,
      item.invoice_no,
      item.invoiceNo,
      item.invoiced_invoice_id,
      item.invoicedInvoiceId,
      item.invoiced_invoice_number,
      item.invoicedInvoiceNumber,
      item.source_invoice_id,
      item.sourceInvoiceId,
      item.source_invoice_number,
      item.sourceInvoiceNumber
    ].map(value => String(value || '').trim()).filter(Boolean);
  },
  isAgreementItemInvoiced_(item = {}) {
    const status = String(item?.invoice_status || item?.invoiceStatus || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (['not_invoiced', 'notinvoiced', 'none', ''].includes(status)) {
      return Boolean(String(item?.invoiced_invoice_id || item?.invoicedInvoiceId || item?.invoice_id || item?.invoiceId || item?.invoiced_at || item?.invoicedAt || '').trim());
    }
    if (['invoiced', 'issued', 'partially_invoiced', 'partially_paid', 'paid', 'settled'].includes(status)) return true;
    return Boolean(String(item?.invoiced_invoice_id || item?.invoicedInvoiceId || item?.invoice_id || item?.invoiceId || item?.invoiced_at || item?.invoicedAt || '').trim());
  },
  findInvoiceForAgreementItem_(item = {}, invoices = []) {
    const itemInvoiceKeys = this.getInvoiceKeysFromAgreementItem_(item);
    const directInvoice = (Array.isArray(invoices) ? invoices : []).find(invoice => {
      const invoiceKeys = this.getInvoiceMatchKeys_(invoice);
      return itemInvoiceKeys.some(itemKey => invoiceKeys.some(invoiceKey => this.valuesMatch(itemKey, invoiceKey)));
    });
    if (directInvoice) return directInvoice;

    const itemAgreementKeys = this.getAgreementItemMatchKeys_(item);
    const sameAgreementInvoices = (Array.isArray(invoices) ? invoices : []).filter(invoice => {
      const invoiceAgreementKeys = [
        invoice.agreement_id,
        invoice.agreementId,
        invoice.agreement_uuid,
        invoice.agreementUuid,
        invoice.agreement_number,
        invoice.agreementNumber,
        invoice.agreement_reference,
        invoice.agreementReference,
        invoice.source_agreement_id,
        invoice.sourceAgreementId,
        invoice.source_agreement_number,
        invoice.sourceAgreementNumber
      ].map(value => String(value || '').trim()).filter(Boolean);
      return itemAgreementKeys.some(itemKey => invoiceAgreementKeys.some(invoiceKey => this.valuesMatch(itemKey, invoiceKey)));
    });

    return sameAgreementInvoices.length === 1 ? sameAgreementInvoices[0] : null;
  },
  findAgreementItemForInvoiceItem_(invoiceItem = {}, agreementItems = []) {
    const item = invoiceItem && typeof invoiceItem === 'object' ? invoiceItem : {};
    const itemAgreementKeys = this.getAgreementLinkKeysFromInvoiceItem_(item);
    const locationKey = this.normalizeLocationKey(item.location_name || item.locationName || item.location || '');
    const itemKey = this.normalizeLocationKey(item.item_name || item.itemName || item.module_name || item.moduleName || item.license || '');

    return (Array.isArray(agreementItems) ? agreementItems : []).find(agreementItem => {
      const agreementKeys = this.getAgreementItemMatchKeys_(agreementItem);
      const agreementMatches = !itemAgreementKeys.length || itemAgreementKeys.some(key => agreementKeys.some(agreementKey => this.valuesMatch(key, agreementKey)));
      if (!agreementMatches) return false;
      const agreementLocationKey = this.normalizeLocationKey(agreementItem.location_name || agreementItem.locationName || agreementItem.location || '');
      const agreementItemKey = this.normalizeLocationKey(agreementItem.item_name || agreementItem.itemName || agreementItem.module_name || agreementItem.moduleName || agreementItem.license || '');
      return Boolean(locationKey && locationKey === agreementLocationKey && (!itemKey || !agreementItemKey || itemKey === agreementItemKey));
    }) || null;
  },
  findInvoiceForItem_(item = {}, invoices = []) {
    item = item && typeof item === 'object' ? item : {};
    const itemKeys = this.getInvoiceItemMatchKeys_(item);
    return (Array.isArray(invoices) ? invoices : []).find(invoice => {
      const invoiceKeys = this.getInvoiceMatchKeys_(invoice);
      return itemKeys.some(itemKey => invoiceKeys.some(invoiceKey => this.valuesMatch(itemKey, invoiceKey)));
    }) || null;
  },
  listClientRelatedInvoiceItems_(clientId) {
    const invoices = this.listClientRelatedInvoices_(clientId);
    const invoiceIds = new Set(invoices.flatMap(item => this.getInvoiceMatchKeys_(item)));
    const cachedInvoiceItems = this.getCachedClientDetailRows_(clientId, 'invoiceItems');
    const sourceInvoiceItems = cachedInvoiceItems.length ? cachedInvoiceItems : (Array.isArray(this.state.invoiceItems) ? this.state.invoiceItems : []);
    const seen = new Set();
    const rows = [];

    const pushItem = item => {
      if (!item || typeof item !== 'object') return;
      const itemKey = String(item.id || `${item.invoice_id || item.invoice_number}-${item.line_no}-${item.location_name}`).trim();
      if (seen.has(itemKey)) return;
      seen.add(itemKey);
      rows.push(item);
    };

    invoices.forEach(invoice => {
      const nested = Array.isArray(invoice.items)
        ? invoice.items
        : Array.isArray(invoice.invoice_items)
          ? invoice.invoice_items
          : [];
      nested.forEach(pushItem);
    });

    sourceInvoiceItems
      .filter(Boolean)
      .filter(item => {
        const links = this.getInvoiceItemMatchKeys_(item);
        return links.some(link => invoiceIds.has(link));
      })
      .forEach(pushItem);

    return rows;
  },
  listClientRelatedReceiptItems_(clientId) {
    const receipts = this.listClientRelatedReceipts_(clientId);
    const receiptIds = new Set(receipts.flatMap(item => [item.id, item.receipt_id, item.receipt_number]).map(v => String(v || '').trim()).filter(Boolean));
    const cachedReceiptItems = this.getCachedClientDetailRows_(clientId, 'receiptItems');
    const sourceReceiptItems = cachedReceiptItems.length ? cachedReceiptItems : (Array.isArray(this.state.receiptItems) ? this.state.receiptItems : []);
    return sourceReceiptItems.filter(item => {
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
  getNormalizedSection_(item = {}) {
    return String(item?.section || item?.item_section || item?.itemSection || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  },
  isSaasAnnualItem(item = {}) {
    const section = this.getNormalizedSection_(item);
    if (section === 'annual_saas') return true;

    const normalizedType = this.normalizeText(item.agreement_item_type || item.item_class || item.plan_type || item.planType || item.item_type || item.itemType);
    if (normalizedType === 'saas_annual' || normalizedType === 'saas annual' || normalizedType === 'annual_saas') return true;

    const text = this.normalizeText([
      item.section,
      item.item_section,
      item.itemSection,
      item.item_type,
      item.itemType,
      item.category,
      item.product_type,
      item.productType,
      item.service_type,
      item.serviceType,
      item.billing_frequency,
      item.billingFrequency,
      item.name,
      item.item_name,
      item.itemName,
      item.description,
      item.module,
      item.module_name,
      item.moduleName
    ].filter(Boolean).join(' '));
    return text.includes('annual_saas') || text.includes('saas annual') || (text.includes('saas') && text.includes('annual'));
  },
  isAnnualSaasClientLocationItem(item = {}) {
    const section = this.getNormalizedSection_(item);
    if (section === 'annual_saas') return true;
    if (!this.isSaasAnnualItem(item)) return false;

    const text = this.normalizeText([
      item.section,
      item.category,
      item.type,
      item.section_name,
      item.section_label,
      item.item_type,
      item.item_name,
      item.itemName,
      item.product_name,
      item.productType,
      item.product_name,
      item.service_name,
      item.serviceName,
      item.module,
      item.module_name,
      item.moduleName,
      item.description,
      item.billing_frequency,
      item.billingFrequency,
      item.billing_cycle,
      item.billingCycle,
      item.frequency
    ].filter(Boolean).join(' '));
    if (!text) return true;
    return !['one_time_fee', 'one_time', 'one time', 'one-time', 'setup', 'implementation', 'onboarding'].some(token => text.includes(token));
  },

  parseDateOnly_(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  },
  getTodayDateOnly_() {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
  },

  normalizeLocationKey(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFKC')
      .replace(/\s+/g, ' ');
  },
  isAnnualSaasItem(item = {}) {
    return this.getNormalizedSection_(item) === 'annual_saas';
  },
  isSupersededRecord(record = {}) {
    return record.is_superseded === true
      || record.isSuperseded === true
      || String(record.is_superseded || '').trim().toLowerCase() === 'true'
      || String(record.isSuperseded || '').trim().toLowerCase() === 'true'
      || Boolean(record.superseded_by_agreement_id || record.supersededByAgreementId)
      || Boolean(record.superseded_by_agreement_number || record.supersededByAgreementNumber);
  },
  isSupersededItem(item = {}) {
    return this.isSupersededRecord(item)
      || Boolean(item?.superseded_by_item_id || item?.supersededByItemId);
  },
  getLocationRowRankTime_(item = {}) {
    const serviceEndAt = new Date(item?.service_end_date || item?.serviceEndDate || 0).getTime() || 0;
    const updatedAt = new Date(item?.updated_at || item?.updatedAt || item?.agreement_date || item?.agreementDate || item?.signed_date || item?.customer_sign_date || item?.created_at || 0).getTime() || 0;
    return { serviceEndAt, updatedAt };
  },
  buildUniqueCurrentLocationRows(items = []) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (!this.isAnnualSaasItem(item)) continue;
      if (this.isSupersededItem(item)) continue;
      const locationKey = this.normalizeLocationKey(item?.location_name || item?.locationName || item?.location || '');
      if (!locationKey) continue;
      const itemKey = this.normalizeLocationKey(item?.item_name || item?.itemName || item?.license || item?.module_name || item?.moduleName || '');
      const key = `${locationKey}::${itemKey}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        continue;
      }
      const existingRank = this.getLocationRowRankTime_(existing);
      const itemRank = this.getLocationRowRankTime_(item);
      if (itemRank.serviceEndAt > existingRank.serviceEndAt) {
        map.set(key, item);
        continue;
      }
      if (itemRank.serviceEndAt === existingRank.serviceEndAt && itemRank.updatedAt >= existingRank.updatedAt) map.set(key, item);
    }
    return Array.from(map.values());
  },
  isActiveAnnualSaasLocationItem(item = {}) {
    item = item && typeof item === 'object' ? item : {};
    const start = this.parseDateOnly_(item.service_start_date || item.serviceStartDate || '');
    const end = this.parseDateOnly_(item.service_end_date || item.serviceEndDate || '');
    if (!start || !end) return false;
    const today = this.getTodayDateOnly_();
    return start.getTime() <= today.getTime() && today.getTime() <= end.getTime();
  },
  buildUniqueActiveServiceLocationRows(items = []) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (!this.isAnnualSaasItem(item)) continue;
      if (!this.isActiveAnnualSaasLocationItem(item)) continue;

      const locationKey = this.normalizeLocationKey(item?.location_name || item?.locationName || item?.location || '');
      if (!locationKey) continue;
      const itemKey = this.normalizeLocationKey(item?.item_name || item?.itemName || item?.license || item?.module_name || item?.moduleName || '');
      const key = `${locationKey}::${itemKey}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        continue;
      }
      const existingEnd = this.parseDateOnly_(existing?.service_end_date || existing?.serviceEndDate || '');
      const itemEnd = this.parseDateOnly_(item?.service_end_date || item?.serviceEndDate || '');
      if ((itemEnd?.getTime() || 0) >= (existingEnd?.getTime() || 0)) map.set(key, item);
    }
    return Array.from(map.values());
  },
  buildUniqueAnnualSaasLocationRows_(items = []) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (!this.isAnnualSaasClientLocationItem(item)) continue;
      if (this.isSupersededItem(item)) continue;
      const locationKey = this.normalizeLocationKey(item?.location_name || item?.locationName || item?.location || item?.site || item?.site_name || item?.branch || item?.branch_name || '');
      if (!locationKey) continue;
      const itemKey = this.normalizeLocationKey(item?.item_name || item?.itemName || item?.license || item?.module_name || item?.moduleName || item?.product_name || item?.service_name || 'annual_saas');
      const key = `${locationKey}::${itemKey || 'annual_saas'}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        continue;
      }
      const existingRank = this.getLocationRowRankTime_(existing);
      const itemRank = this.getLocationRowRankTime_(item);
      if (itemRank.serviceEndAt > existingRank.serviceEndAt || (itemRank.serviceEndAt === existingRank.serviceEndAt && itemRank.updatedAt >= existingRank.updatedAt)) {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  },
  isInvoiceActiveForClientLocation_(invoice = {}) {
    const status = String(invoice?.status || invoice?.invoice_status || invoice?.payment_state || invoice?.payment_status || '').trim().toLowerCase().replace(/\s+/g, '_');
    return !['draft', 'void', 'voided', 'cancelled', 'canceled', 'failed', 'error', 'deleted'].includes(status);
  },
  buildUniqueInvoicedAnnualSaasLocationRows_(clientId = '') {
    const invoices = this.listClientRelatedInvoices_(clientId).filter(invoice => this.isInvoiceActiveForClientLocation_(invoice));
    const invoiceItems = this.listClientRelatedInvoiceItems_(clientId).filter(item => {
      const invoice = this.findInvoiceForItem_(item, invoices);
      return invoice && this.isInvoiceActiveForClientLocation_(invoice);
    });
    const fromInvoiceItems = this.buildUniqueAnnualSaasLocationRows_(invoiceItems);
    if (fromInvoiceItems.length) return fromInvoiceItems;

    // Fallback for older/imported data where invoice_items are missing, but agreement_items
    // carry invoice_id / invoice_number / invoice_status metadata.
    const invoicedAgreementItems = this.listClientAgreementLocationItems_(clientId).filter(item => {
      if (!this.isAgreementItemInvoiced_(item)) return false;
      const invoice = this.findInvoiceForAgreementItem_(item, invoices);
      return !invoice || this.isInvoiceActiveForClientLocation_(invoice);
    });
    return this.buildUniqueAnnualSaasLocationRows_(invoicedAgreementItems);
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
  agreementHasCurrentAnnualSaasItems(agreement = {}) {
    const items = Array.isArray(agreement?.items)
      ? agreement.items
      : Array.isArray(agreement?.agreement_items)
        ? agreement.agreement_items
        : Array.isArray(agreement?.line_items)
          ? agreement.line_items
          : [];
    return items.some(item => this.isAnnualSaasItem(item) && !this.isSupersededItem(item));
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
    const signedAgreements = agreements.filter(agreement => {
      const status = String(agreement?.status || '').trim().toLowerCase();
      if (['signed', 'active'].includes(status)) return true;
      return this.isSignedAgreement(agreement);
    });
    const locationItems = this.listClientAgreementLocationItems_(clientId);
    const currentLocationRows = this.buildUniqueCurrentLocationRows(locationItems);

    const currentAgreementMap = new Map();
    currentLocationRows.forEach(item => {
      const agreement = this.findAgreementForItem_(item, signedAgreements);
      const key = String(agreement?.id || agreement?.agreement_id || agreement?.agreement_number || '').trim();
      if (key) currentAgreementMap.set(key, agreement);
    });

    const fallbackCurrentAgreements = signedAgreements.filter(agreement => this.agreementHasCurrentAnnualSaasItems(agreement));
    fallbackCurrentAgreements.forEach(agreement => {
      const key = String(agreement?.id || agreement?.agreement_id || agreement?.agreement_number || '').trim();
      if (key && !currentAgreementMap.has(key)) currentAgreementMap.set(key, agreement);
    });

    const currentAgreements = Array.from(currentAgreementMap.values());

    if (this.isDebugMode_()) console.debug('[client current agreement debug]', agreements.map(agreement => {
      const agreementItems = locationItems.filter(item => {
        const agreementKeys = this.getAgreementMatchKeys_(agreement);
        const itemKeys = this.getAgreementItemMatchKeys_(item);
        return itemKeys.some(itemKey => agreementKeys.some(agreementKey => this.valuesMatch(itemKey, agreementKey)));
      });
      return {
        agreement_number: agreement.agreement_number,
        status: agreement.status,
        attached_item_count: (agreement.items || agreement.agreement_items || []).length,
        matched_location_item_count: agreementItems.length,
        active_annual_saas_items: agreementItems.filter(item =>
          this.isAnnualSaasItem(item) && !this.isSupersededItem(item)
        ).length,
        superseded_annual_saas_items: agreementItems.filter(item =>
          this.isAnnualSaasItem(item) && this.isSupersededItem(item)
        ).length
      };
    }));
    // Total locations are all current/non-superseded Annual SaaS rows from the agreement.
    // Active locations in the Client Panel means invoiced Annual SaaS locations, not merely
    // locations present on the agreement and not merely rows whose service dates include today.
    const activeLocationItems = this.buildUniqueInvoicedAnnualSaasLocationRows_(clientId);
    const serviceDateActiveLocationItems = this.buildUniqueActiveServiceLocationRows(locationItems);
    const today = this.getTodayDateOnly_();

    const totalLocations = currentLocationRows.length;
    const activeLocations = activeLocationItems.length || serviceDateActiveLocationItems.length;

    const totalAgreementValue = agreements.reduce((sum, item) => sum + this.toNumberSafe(item.grand_total), 0);
    const totalInvoicedValue = invoices.reduce((sum, item) => sum + this.toNumberSafe(item.grand_total), 0);
    const totalPaidFromReceipts = receipts.reduce((sum, item) => sum + this.toNumberSafe(item.received_amount), 0);
    const fallbackInvoicePaid = receipts.length
      ? 0
      : invoices.reduce((sum, item) => sum + this.toNumberSafe(item.amount_paid ?? item.received_amount ?? item.paid_amount), 0);
    const totalPaidAmount = totalPaidFromReceipts + fallbackInvoicePaid;
    const totalDueAmount = Math.max(totalInvoicedValue - totalPaidAmount, 0);

    const latestAgreementDate = this.maxDate(...agreements.map(item => item.signed_date || item.customer_sign_date || item.updated_at));
    const latestInvoiceDate = this.maxDate(...invoices.map(item => item.issued_date || item.created_at || item.updated_at));
    const latestReceiptDate = this.maxDate(...receipts.map(item => item.receipt_date || item.created_at || item.updated_at));

    const renewalRows = this.getInvoiceAnnualSaasRenewalRows({ ...client, invoices });
    const renewalCandidates = renewalRows
      .map(item => String(item.renewal_date || item.service_end_date || '').trim())
      .filter(Boolean)
      .filter(value => {
        const date = this.parseDateOnly_(value);
        return date && date.getTime() >= today.getTime();
      })
      .sort((a, b) => (this.parseDateOnly_(a)?.getTime() || 0) - (this.parseDateOnly_(b)?.getTime() || 0));

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
      total_agreements: currentAgreements.length,
      signed_agreements: signedAgreements.length,
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
      next_renewal_date: renewalCandidates[0] || '',
      currency: this.getClientCurrency_(clientId)
    };
  },
  buildTimeline_(clientId) {
    const events = [];
    const renewalRows = this.buildClientRenewalRows({ client_id: clientId });
    console.log('[client renewal source check]', renewalRows.map(row => ({
      location: row.location_name,
      item: row.item_name || row.module_name,
      service_start_date: row.service_start_date,
      service_end_date: row.service_end_date,
      renewal_date: row.renewal_date,
      invoice_date: row.invoice_date,
      due_date: row.due_date
    })));
    renewalRows.forEach(item => {
      const renewalDate = item.service_end_date || item.renewal_date || item.renewal_due_date;
      if (!item.service_end_date || !renewalDate) return;
      events.push({
        type: 'renewal_item',
        date: renewalDate,
        label: `${item.location_name || 'Location'} · ${item.module_name || item.item_name || 'Annual SaaS'} renewal`
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
    const parsed = this.parseDateOnly_(value) || new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const today = this.getTodayDateOnly_();
    parsed.setHours(12, 0, 0, 0);
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
  isStatementReceiptRow_(row = {}) {
    const rowType = String(row.type || row.document_type || row.entry_type || '').trim().toLowerCase();
    const documentNo = String(row.document_no || row.documentNo || row.document_number || row.receipt_number || '').toLowerCase();
    return rowType === 'receipt' || Boolean(row.receipt_id) || documentNo.includes('receipt');
  },
  getStatementRowStatus(row = {}) {
    const rawStatus = String(row.status || row.payment_status || row.payment_state || '').trim();
    if (this.isStatementReceiptRow_(row)) {
      const normalized = rawStatus.toLowerCase();
      if (['void', 'voided', 'cancelled', 'canceled', 'reversed'].includes(normalized)) return rawStatus;
      return 'Received';
    }
    return rawStatus || this.getPaymentStatus(row) || 'Not Paid';
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
  isAgreementStillActive(agreement) {
    const status = String(agreement?.status || '').trim().toLowerCase();
    const activeStatuses = ['active', 'signed', 'accepted', 'renewed'];
    const endRaw = agreement?.service_end_date
      || agreement?.end_service_date
      || agreement?.expiry_date
      || agreement?.expiration_date
      || agreement?.valid_until
      || '';
    const endDate = endRaw ? new Date(endRaw) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!activeStatuses.includes(status)) return false;
    if (endDate && !Number.isNaN(endDate.getTime())) {
      endDate.setHours(0, 0, 0, 0);
      if (today > endDate) return false;
    }
    return true;
  },
  isRenewalInvoice(invoiceOrContext) {
    return Boolean(
      invoiceOrContext?.is_renewal
      || invoiceOrContext?.invoice_type === 'renewal'
      || invoiceOrContext?.source_type === 'renewal'
      || invoiceOrContext?.renewal_batch_id
    );
  },
  getCanonicalClientCompanyKey_(row = {}) {
    const companyId = String(row.company_id || row.companyId || row.company_uuid || row.companyUuid || '').trim();
    if (companyId) return `company:${companyId}`;
    const legalName = this.normalizeCompanyKey(row.customer_legal_name || row.legal_name || row.legalName || row.company_name || row.companyName || '');
    if (legalName) return `legal:${legalName}`;
    const companyName = this.normalizeCompanyKey(row.customer_name || row.client_name || row.clientName || row.name || '');
    if (companyName) return `company_name:${companyName}`;
    const clientId = String(row.client_id || row.clientId || '').trim();
    return clientId ? `client:${clientId}` : '';
  },
  mergeLatestDate_(left = '', right = '') {
    const leftTime = left ? new Date(left).getTime() : 0;
    const rightTime = right ? new Date(right).getTime() : 0;
    if (!Number.isFinite(leftTime) || rightTime > leftTime) return right || left || '';
    return left || right || '';
  },
  pickBestClientField_(current = '', incoming = '') {
    const left = String(current || '').trim();
    const right = String(incoming || '').trim();
    if (!left) return right;
    if (!right) return left;
    return right.length > left.length ? right : left;
  },
  getClientRawActivityDate_(row = {}) {
    return row.updated_at || row.created_at || row.analytics?.latest_activity_date || '';
  },
  groupClientIntelligenceRows(rows = [], { log = false } = {}) {
    const groups = new Map();
    const rawRows = Array.isArray(rows) ? rows : [];
    rawRows.forEach(row => {
      const key = this.getCanonicalClientCompanyKey_(row);
      if (!key) return;
      if (!groups.has(key)) {
        groups.set(key, {
          ...row,
          source_client_ids: [],
          _source_client_id_set: new Set(),
          _agreement_id_set: new Set(),
          _invoice_id_set: new Set(),
          _receipt_id_set: new Set(),
          _raw_rows: []
        });
      }
      const group = groups.get(key);
      group._raw_rows.push(row);
      [row.client_id, row.id, ...(Array.isArray(row.source_client_ids) ? row.source_client_ids : [])]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .forEach(value => group._source_client_id_set.add(value));
      const rowTime = new Date(this.getClientRawActivityDate_(row) || 0).getTime() || 0;
      const groupTime = new Date(this.getClientRawActivityDate_(group) || 0).getTime() || 0;
      group.customer_name = this.pickBestClientField_(group.customer_name, row.customer_name);
      group.customer_legal_name = this.pickBestClientField_(group.customer_legal_name, row.customer_legal_name);
      group.primary_contact_name = this.pickBestClientField_(group.primary_contact_name, row.primary_contact_name);
      group.primary_contact_email = this.pickBestClientField_(group.primary_contact_email, row.primary_contact_email);
      group.phone = this.pickBestClientField_(group.phone, row.phone);
      if (rowTime >= groupTime) {
        ['status', 'updated_at', 'created_at', 'source_agreement_id', 'billing_frequency', 'payment_term'].forEach(field => {
          if (row[field]) group[field] = row[field];
        });
      }
      const analytics = row.analytics || {};
      const groupAnalytics = group.analytics || {};
      groupAnalytics.total_locations = Math.max(this.toNumberSafe(groupAnalytics.total_locations), this.toNumberSafe(analytics.total_locations ?? row.total_locations));
      groupAnalytics.total_agreements = Math.max(this.toNumberSafe(groupAnalytics.total_agreements), this.toNumberSafe(analytics.total_agreements ?? row.total_agreements));
      groupAnalytics.total_invoiced_value = Math.max(this.toNumberSafe(groupAnalytics.total_invoiced_value), this.toNumberSafe(analytics.total_invoiced_value ?? row.total_value));
      groupAnalytics.total_paid_amount = Math.max(this.toNumberSafe(groupAnalytics.total_paid_amount), this.toNumberSafe(analytics.total_paid_amount ?? row.total_paid));
      groupAnalytics.total_due_amount = Math.max(this.toNumberSafe(groupAnalytics.total_due_amount), this.toNumberSafe(analytics.total_due_amount ?? row.total_due));
      groupAnalytics.latest_activity_date = this.mergeLatestDate_(groupAnalytics.latest_activity_date, analytics.latest_activity_date || row.updated_at || row.created_at);
      group.analytics = groupAnalytics;
    });
    const duplicateGroups = [];
    const groupedRows = [...groups.entries()].map(([key, group]) => {
      const rawCount = group._raw_rows.length;
      const sourceClientIds = [...group._source_client_id_set];
      if (rawCount > 1) {
        const legalName = group.customer_legal_name || group.company_name || '';
        const agreementIds = [...new Set(group._raw_rows.flatMap(row => [row.source_agreement_id, row.agreement_id, row.agreement_number]).map(value => String(value || '').trim()).filter(Boolean))];
        const invoiceIds = [...new Set(group._raw_rows.flatMap(row => [row.invoice_id, row.invoice_number]).map(value => String(value || '').trim()).filter(Boolean))];
        duplicateGroups.push({ key, legalName, rawCount, clientIds: sourceClientIds, agreementIds, invoiceIds });
      }
      const normalized = {
        ...group,
        client_id: group.client_id || sourceClientIds[0] || '',
        source_client_ids: sourceClientIds,
        normalized_company_key: group.normalized_company_key || this.normalizeCompanyKey(group.customer_legal_name || group.customer_name)
      };
      delete normalized._source_client_id_set;
      delete normalized._agreement_id_set;
      delete normalized._invoice_id_set;
      delete normalized._receipt_id_set;
      delete normalized._raw_rows;
      return normalized;
    });
    if (log) {
      console.info('[ClientsHub] client rows grouped', { rawRowCount: rawRows.length, groupedRowCount: groupedRows.length, duplicateGroupCount: duplicateGroups.length });
      duplicateGroups.forEach(group => console.warn('[ClientsHub] Duplicate client group merged', group));
    }
    return groupedRows;
  },
  normalizeRenewalSnapshotRows(rows = []) {
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const key = this.getCanonicalClientCompanyKey_(row);
      if (!key) return;
      const analytics = row.analytics || {};
      if (!groups.has(key)) {
        groups.set(key, {
          ...row,
          analytics: { ...analytics },
          _source_client_ids: new Set(),
          _agreement_keys: new Set(),
          _location_keys: new Set(),
          _invoice_keys: new Set(),
          _receipt_keys: new Set()
        });
      }
      const group = groups.get(key);
      const groupAnalytics = group.analytics || {};
      const rowUpdated = row.updated_at || row.created_at || analytics.latest_activity_date || '';
      const groupUpdated = group.updated_at || group.created_at || groupAnalytics.latest_activity_date || '';
      if ((new Date(rowUpdated).getTime() || 0) > (new Date(groupUpdated).getTime() || 0)) {
        ['status', 'updated_at', 'created_at', 'source_agreement_id', 'billing_frequency', 'payment_term'].forEach(field => {
          if (row[field]) group[field] = row[field];
        });
      }
      [row.client_id, row.id].map(value => String(value || '').trim()).filter(Boolean).forEach(value => group._source_client_ids.add(value));
      const agreementCount = this.toNumberSafe(analytics.total_agreements ?? row.total_agreements);
      for (let i = 0; i < agreementCount; i += 1) group._agreement_keys.add(`${key}:agreement:${i + 1}`);
      const locationCount = this.toNumberSafe(analytics.total_locations ?? row.total_locations);
      for (let i = 0; i < locationCount; i += 1) group._location_keys.add(`${key}:location:${i + 1}`);
      const invoiced = this.toNumberSafe(analytics.total_invoiced_value ?? analytics.total_value ?? row.total_value);
      const paid = this.toNumberSafe(analytics.total_paid_amount ?? row.total_paid);
      const due = this.toNumberSafe(analytics.total_due_amount ?? row.total_due);
      groupAnalytics.total_value = Math.max(this.toNumberSafe(groupAnalytics.total_value), invoiced);
      groupAnalytics.total_invoiced_value = Math.max(this.toNumberSafe(groupAnalytics.total_invoiced_value), invoiced);
      groupAnalytics.total_paid_amount = Math.max(this.toNumberSafe(groupAnalytics.total_paid_amount), paid);
      groupAnalytics.total_due_amount = Math.max(this.toNumberSafe(groupAnalytics.total_due_amount), due);
      groupAnalytics.latest_activity_date = this.mergeLatestDate_(groupAnalytics.latest_activity_date, analytics.latest_activity_date || row.updated_at || row.created_at);
      group.analytics = groupAnalytics;
    });
    return [...groups.values()].map(group => {
      const analytics = { ...(group.analytics || {}) };
      analytics.total_agreements = Math.max(this.toNumberSafe(analytics.total_agreements), group._agreement_keys.size);
      analytics.total_locations = Math.max(this.toNumberSafe(analytics.total_locations), group._location_keys.size);
      return {
        ...group,
        analytics,
        source_client_ids: [...group._source_client_ids],
        _source_client_ids: undefined,
        _agreement_keys: undefined,
        _location_keys: undefined,
        _invoice_keys: undefined,
        _receipt_keys: undefined
      };
    });
  },
  getRenewalRowId_(row = {}) {
    return [row.client_id, row.agreement_id, row.invoice_id, row.invoice_item_id, row.source_agreement_item_id, row.location_name, row.service_end_date]
      .map(value => String(value || '').trim().replace(/\s+/g, '_'))
      .filter(Boolean)
      .join('__');
  },
  addMonthsMinusOneDay_(dateValue, months = 12) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const end = new Date(date);
    end.setMonth(end.getMonth() + Math.max(1, Number(months) || 12));
    end.setDate(end.getDate() - 1);
    return end.toISOString().slice(0, 10);
  },
  nextDay_(dateValue) {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  },
  getRenewalLicenseMonths_(row = {}) {
    const explicitMonths = this.toNumberSafe(row.renewal_months ?? row.license_months ?? row.new_license_months);
    if (explicitMonths > 0) return Math.min(12, Math.max(1, explicitMonths));
    const quantityMonths = this.toNumberSafe(row.quantity ?? row.qty);
    if (quantityMonths > 1) return Math.min(12, Math.max(1, quantityMonths));
    const term = String(row.contract_term || row.billing_frequency || row.payment_term || '').toLowerCase();
    const match = term.match(/(\d+)\s*(month|months|mo|mos)/);
    if (match) return Math.min(12, Math.max(1, Number(match[1]) || 12));
    if (term.includes('quarter')) return 3;
    if (term.includes('semi')) return 6;
    if (term.includes('month')) return 1;
    return 12;
  },
  getRenewalAnnualLicensePrice_(row = {}) {
    const directAnnual = this.toNumberSafe(
      row.annual_license_price ??
      row.license_price_year ??
      row.license_price_per_year ??
      row.yearly_license_price ??
      row.catalog_annual_price
    );
    if (directAnnual > 0) return directAnnual;

    const unitPrice = this.toNumberSafe(row.unit_price ?? row.unitPrice);
    if (unitPrice > 0) return unitPrice;

    const itemName = this.normalizeText(row.item_name || row.itemName || row.module_name || row.moduleName || row.name);
    const catalogRows = typeof window !== 'undefined' && Array.isArray(window.ProposalCatalog?.state?.rows)
      ? window.ProposalCatalog.state.rows
      : [];
    const catalogMatch = catalogRows.find(item => {
      const section = this.normalizeText(item?.section || item?.category || item?.type);
      const name = this.normalizeText(item?.item_name || item?.itemName || item?.name);
      return item?.is_active !== false && itemName && name === itemName && (section.includes('annual') || section.includes('saas'));
    });
    const catalogPrice = this.toNumberSafe(catalogMatch?.unit_price ?? catalogMatch?.unitPrice);
    if (catalogPrice > 0) return catalogPrice;

    const previousQuantity = this.toNumberSafe(row.quantity ?? row.qty ?? row.previous_license_months);
    const previousLineTotal = this.toNumberSafe(row.line_total ?? row.lineTotal ?? row.total ?? row.amount ?? row.price);
    const previousDiscount = Math.min(100, Math.max(0, this.toNumberSafe(row.discount_percent ?? row.discountPercent)));
    if (previousLineTotal > 0 && previousQuantity > 0 && previousQuantity <= 12) {
      const undiscountedLine = previousDiscount >= 100 ? previousLineTotal : previousLineTotal / (1 - (previousDiscount / 100));
      return undiscountedLine * (12 / previousQuantity);
    }

    return previousLineTotal > 0 ? previousLineTotal : this.toNumberSafe(row.amount_due);
  },
  calculateRenewalLineTotal_(row = {}, months = this.getRenewalLicenseMonths_(row), discountPercent = 0) {
    const annualPrice = this.getRenewalAnnualLicensePrice_(row);
    const safeMonths = Math.min(12, Math.max(1, this.toNumberSafe(months) || 12));
    const discountRatio = Math.min(100, Math.max(0, this.toNumberSafe(discountPercent))) / 100;
    return Math.max(0, annualPrice * (safeMonths / 12) * (1 - discountRatio));
  },
  getRenewalPrice_(row = {}) {
    return this.calculateRenewalLineTotal_(row, this.getRenewalLicenseMonths_(row), row.discount_percent ?? 0);
  },
  formatCurrency_(amount = 0, currency = 'USD') {
    const code = this.normalizeCurrencyCode_(currency || 'USD');
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(this.toNumberSafe(amount));
    } catch (error) {
      return `${code} ${this.toNumberSafe(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    }
  },
  isRenewalRowRenewable_(row = {}) {
    const status = String(row.renewal_status || row.status || '').trim().toLowerCase();
    if (['renewed', 'renewal invoice created', 'renewal proposal created', 'renewal agreement created', 'cancelled', 'canceled', 'not renewed'].includes(status)) return false;
    const locationStatus = String(row.location_status || row.invoice_status || row.payment_status || '').trim().toLowerCase();
    const alreadyInvoiced = Boolean(row.invoice_id || row.invoice_number || ['active', 'invoiced', 'fully paid', 'paid', 'partially paid', 'not paid', 'overdue', 'open'].some(token => locationStatus.includes(token)));
    if (!alreadyInvoiced) return false;
    const days = this.getDaysLeft(row.renewal_date || row.service_end_date);
    return days === null || days <= 60;
  },
  getRenewalActionLabel_(row = {}) {
    const renewalStatus = String(row.renewal_status || '').trim().toLowerCase();
    if (renewalStatus === 'renewed') return '<span class="badge ok">Renewed</span>';
    if (renewalStatus.includes('proposal')) return '<span class="badge info">View Renewal Proposal</span>';
    if (renewalStatus.includes('agreement')) return '<span class="badge info">View Renewal Agreement</span>';
    if (!this.isRenewalRowRenewable_(row)) return '<span class="muted">—</span>';
    return `<button class="btn ghost sm" type="button" data-renew-row="${U.escapeHtml(row.row_id || '')}">Renew</button>`;
  },
  validateRenewalSelection_(rows = [], { allowDifferentDates = false } = {}) {
    if (!rows.length) return { ok: false, message: 'Select at least one renewable location.' };
    const clientIds = [...new Set(rows.map(row => String(row.client_id || '').trim()).filter(Boolean))];
    if (clientIds.length > 1) return { ok: false, message: 'Only locations from the same client can be renewed together.' };
    const agreementIds = [...new Set(rows.map(row => String(row.agreement_id || row.agreement_number || '').trim()).filter(Boolean))];
    if (agreementIds.length > 1) return { ok: false, message: 'Selected locations belong to different agreements. Please renew them separately.' };
    const dueDates = [...new Set(rows.map(row => String(row.service_end_date || row.renewal_date || '').trim()).filter(Boolean))];
    if (dueDates.length > 1 && !allowDifferentDates) {
      return { ok: false, confirmDifferentDates: true, message: 'Selected locations have different renewal dates. Do you want to continue with one renewal batch?' };
    }
    return { ok: true };
  },
  findAgreementForRenewalRow_(row = {}) {
    const keys = [row.agreement_uuid, row.agreement_id, row.agreement_reference, row.agreement_number]
      .map(value => String(value || '').trim())
      .filter(Boolean);
    return (this.state.agreements || []).find(agreement => keys.some(key => [
      agreement.id,
      agreement.uuid,
      agreement.agreement_uuid,
      agreement.agreement_id,
      agreement.agreement_reference,
      agreement.agreement_number
    ].some(value => this.valuesMatch(key, value)))) || {};
  },
  buildRenewalDraft_(rows = []) {
    const batchId = `REN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const enrichedRows = rows.map(row => {
      const oldEnd = row.service_end_date || row.renewal_date || '';
      const newStart = this.nextDay_(oldEnd);
      const months = this.getRenewalLicenseMonths_(row);
      const annualPrice = this.getRenewalAnnualLicensePrice_(row);
      return {
        ...row,
        annual_license_price: annualPrice,
        license_months: months,
        new_service_start_date: newStart,
        new_service_end_date: this.addMonthsMinusOneDay_(newStart, months),
        renewal_price: this.calculateRenewalLineTotal_({ ...row, annual_license_price: annualPrice }, months, 0)
      };
    });
    return { renewal_batch_id: batchId, rows: enrichedRows, notes: '' };
  },
  openRenewalFlow_(rows = [], options = {}) {
    const validation = this.validateRenewalSelection_(rows, options);
    if (!validation.ok) {
      if (validation.confirmDifferentDates && window.confirm(validation.message)) return this.openRenewalFlow_(rows, { allowDifferentDates: true });
      return UI.toast(validation.message);
    }
    const agreement = this.findAgreementForRenewalRow_(rows[0] || {});
    const draft = this.buildRenewalDraft_(rows);
    this.state.activeRenewalRows = draft.rows;
    if (this.isAgreementStillActive(agreement)) this.showDirectRenewalModal_(draft, agreement);
    else this.showAgreementRenewalChoiceModal_(draft, agreement);
  },
  showDirectRenewalModal_(draft = {}, agreement = {}) {
    const modal = this.ensureRenewalModal_();
    const rowsHtml = draft.rows.map(row => `<tr><td>${U.escapeHtml(row.location_name || '—')}</td><td>${U.escapeHtml(U.fmtDisplayDate(row.service_end_date) || '—')}</td><td><input class="input" type="date" data-renew-new-start="${U.escapeHtml(row.row_id)}" value="${U.escapeHtml(row.new_service_start_date)}"></td><td><input class="input" type="date" data-renew-new-end="${U.escapeHtml(row.row_id)}" value="${U.escapeHtml(row.new_service_end_date)}"></td><td>${U.escapeHtml(String(row.license_months || 12))}</td><td>${U.escapeHtml(this.formatCurrency_(row.renewal_price || 0, row.currency || 'USD'))}</td></tr>`).join('');
    modal.innerHTML = `<div class="modal-content wide"><button class="modal-close" type="button" data-renew-modal-close>&times;</button><h2>Renew Selected Location(s)</h2><p class="muted">This will renew the selected existing location(s). It will not create a new Technical Admin request or open a new location.</p><div class="grid cols-2"><div><strong>Client legal name</strong><br>${U.escapeHtml(draft.rows[0]?.client_name || '—')}</div><div><strong>Agreement reference</strong><br>${U.escapeHtml(agreement.agreement_number || draft.rows[0]?.agreement_number || '—')}</div></div><div class="table-wrap" style="margin-top:12px;"><table><thead><tr><th>Selected location(s)</th><th>Current service end date</th><th>New service start date</th><th>New service end date</th><th>License months</th><th>Renewal price</th></tr></thead><tbody>${rowsHtml}</tbody></table></div><label class="field" style="margin-top:12px;"><span>Notes</span><textarea class="input" data-renew-notes rows="3" placeholder="Renewal notes"></textarea></label><div class="modal-actions"><button class="btn ghost" type="button" data-renew-modal-close>Cancel</button><button class="btn primary" type="button" data-confirm-direct-renewal="${U.escapeHtml(draft.renewal_batch_id)}">Create Renewal Invoice Draft</button></div></div>`;
    modal.classList.add('open');
  },
  showAgreementRenewalChoiceModal_(draft = {}, agreement = {}) {
    const modal = this.ensureRenewalModal_();
    modal.innerHTML = `<div class="modal-content"><button class="modal-close" type="button" data-renew-modal-close>&times;</button><h2>Agreement Renewal Required</h2><p class="muted">The related agreement is expired or no longer active. Choose how you want to continue the renewal.</p><div class="card"><strong>${U.escapeHtml(draft.rows[0]?.client_name || '—')}</strong><br><span class="muted">${U.escapeHtml(agreement.agreement_number || draft.rows[0]?.agreement_number || 'Agreement not linked')} · ${draft.rows.length} selected location(s)</span></div><div class="modal-actions stacked"><button class="btn primary" type="button" data-renew-path="proposal" data-renew-batch="${U.escapeHtml(draft.renewal_batch_id)}">Create Renewal Proposal &amp; Agreement</button><button class="btn ghost" type="button" data-renew-path="agreement" data-renew-batch="${U.escapeHtml(draft.renewal_batch_id)}">Renew Agreement Directly</button></div></div>`;
    modal.classList.add('open');
  },
  ensureRenewalModal_() {
    let modal = document.getElementById('clientRenewalModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'clientRenewalModal';
      modal.className = 'modal';
      document.body.appendChild(modal);
      modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest?.('[data-renew-modal-close]')) this.closeRenewalModal_();
        const direct = event.target.closest?.('[data-confirm-direct-renewal]');
        if (direct) this.createDirectRenewalInvoice_(String(direct.getAttribute('data-confirm-direct-renewal') || '').trim());
        const pathBtn = event.target.closest?.('[data-renew-path]');
        if (pathBtn) this.createCommercialRenewalPath_(pathBtn.getAttribute('data-renew-path'), String(pathBtn.getAttribute('data-renew-batch') || '').trim());
      });
      modal.addEventListener('change', event => {
        const start = event.target.closest?.('[data-renew-new-start]');
        const end = event.target.closest?.('[data-renew-new-end]');
        if (!start && !end) return;
        const id = String((start || end).getAttribute(start ? 'data-renew-new-start' : 'data-renew-new-end') || '').trim();
        const row = this.state.activeRenewalRows.find(item => item.row_id === id);
        if (!row) return;
        if (start) {
          row.new_service_start_date = start.value;
          row.new_service_end_date = this.addMonthsMinusOneDay_(start.value, row.license_months || 12);
          const endInput = modal.querySelector(`[data-renew-new-end="${CSS.escape(id)}"]`);
          if (endInput) endInput.value = row.new_service_end_date;
        }
        if (end) row.new_service_end_date = end.value;
      });
    }
    return modal;
  },
  closeRenewalModal_() {
    const modal = document.getElementById('clientRenewalModal');
    if (modal) modal.classList.remove('open');
  },
  buildRenewalInvoicePayload_(batchId = '') {
    const rows = this.state.activeRenewalRows || [];
    const total = rows.reduce((sum, row) => sum + this.calculateRenewalLineTotal_(row, row.license_months || this.getRenewalLicenseMonths_(row), row.discount_percent || 0), 0);
    const first = rows[0] || {};
    const agreement = this.findAgreementForRenewalRow_(first);
    const agreementUuid = [
      agreement?.id,
      agreement?.uuid,
      agreement?.agreement_uuid,
      first.agreement_uuid,
      first.agreement_id
    ].map(value => String(value || '').trim()).find(value => this.isUuid(value)) || '';
    const agreementReference = [
      agreement?.agreement_reference,
      agreement?.agreement_id,
      agreement?.display_id,
      first.agreement_reference,
      first.agreement_number,
      first.agreement_id
    ].map(value => String(value || '').trim()).find(value => value && !this.isUuid(value)) || '';
    const clientUuid = [first.client_uuid, first.client_id].map(value => String(value || '').trim()).find(value => this.isUuid(value)) || '';
    const companyUuid = [agreement?.company_id, first.company_id].map(value => String(value || '').trim()).find(value => this.isUuid(value)) || '';
    const contactUuid = [agreement?.contact_id, first.contact_id].map(value => String(value || '').trim()).find(value => this.isUuid(value)) || '';
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const notes = String(document.querySelector('#clientRenewalModal [data-renew-notes]')?.value || '').trim();
    return {
      invoice: {
        invoice_number: `REN-INV-${now}`,
        invoice_id: `REN-INV-${now}`,
        client_id: clientUuid,
        agreement_uuid: agreementUuid,
        agreement_id: agreementUuid,
        agreement_number: agreementReference || first.agreement_number || '',
        company_id: companyUuid,
        contact_id: contactUuid,
        issue_date: today,
        due_date: today,
        billing_frequency: first.billing_frequency || 'Annual',
        payment_term: first.payment_term || 'Net 30',
        customer_name: first.client_name || '',
        customer_legal_name: first.client_name || '',
        subtotal_locations: total,
        subtotal_one_time: 0,
        invoice_total: total,
        pending_amount: total,
        amount_paid: 0,
        payment_state: 'Not Paid',
        status: 'Draft',
        currency: first.currency || 'USD',
        notes: [notes, `Renewal invoice for existing invoiced location(s). Batch ${batchId}. No onboarding/technical-admin request.`].filter(Boolean).join('\n'),
        is_renewal: true,
        invoice_type: 'renewal',
        source_type: 'renewal',
        renewal_batch_id: batchId
      },
      items: rows.map((row, index) => ({
        item_id: `REN-ITEM-${Date.now()}-${index + 1}`,
        section: 'annual_saas',
        line_no: index + 1,
        location_name: row.location_name || '',
        item_name: `${row.module_name || 'Annual SaaS'} renewal`,
        unit_price: this.getRenewalAnnualLicensePrice_(row),
        discount_percent: this.toNumberSafe(row.discount_percent),
        discounted_unit_price: this.getRenewalAnnualLicensePrice_(row) * (1 - (Math.min(100, Math.max(0, this.toNumberSafe(row.discount_percent))) / 100)),
        quantity: row.license_months || this.getRenewalLicenseMonths_(row),
        line_total: this.calculateRenewalLineTotal_(row, row.license_months || this.getRenewalLicenseMonths_(row), row.discount_percent || 0),
        service_start_date: row.new_service_start_date || '',
        service_end_date: row.new_service_end_date || '',
        source_agreement_item_id: row.source_agreement_item_id || '',
        agreement_id: agreementUuid,
        agreement_reference: agreementReference,
        source_agreement_id: agreementUuid,
        source_agreement_reference: agreementReference,
        client_id: clientUuid,
        company_id: companyUuid,
        contact_id: contactUuid,
        location_id: this.isUuid(String(row.location_id || '').trim()) ? String(row.location_id || '').trim() : null,
        notes: `Renewal annual SaaS line. Annual license price ${this.getRenewalAnnualLicensePrice_(row)}; renewed months ${row.license_months || this.getRenewalLicenseMonths_(row)}.`,
        renewal_batch_id: batchId,
        renewed_from_invoice_id: this.isUuid(String(row.invoice_uuid || row.invoice_id || '').trim()) ? String(row.invoice_uuid || row.invoice_id || '').trim() : null,
        renewed_from_invoice_item_id: row.invoice_item_id || '',
        renewed_from_location_name: row.location_name || ''
      }))
    };
  },
  async createDirectRenewalInvoice_(batchId = '') {
    try {
      const payload = this.buildRenewalInvoicePayload_(batchId || `REN-${Date.now()}`);
      const response = await Api.requestWithSession('invoices', 'create', { invoice: payload.invoice, items: payload.items }, { requireAuth: true });
      await this.persistRenewalHistory_(payload.invoice.renewal_batch_id, 'direct_location_renewal', 'Renewal Invoice Created', response).catch(error => console.warn('[Renewal] Optional renewal history save failed.', error));
      const reusedDraft = Boolean(response?.data?._renewal_draft_reused || response?._renewal_draft_reused);
      UI.toast(reusedDraft
        ? 'A draft renewal invoice already exists for this client and renewal period. The existing draft has been opened for update.'
        : 'Renewal invoice draft created. Operations onboarding and Technical Admin were not created.');
      this.closeRenewalModal_();
      this.invalidateClientTabCache(this.state.selectedClientId, ['overview', 'renewals', 'statement', 'scheduledPayments', 'invoices']);
      if (this.state.selectedClientId) await this.loadClientSubTab(this.state.selectedClientId, this.state.activeDetailTab || 'overview', { force: true }).catch(() => {});
      this.render();
    } catch (error) {
      console.warn('[Renewal] Unable to create renewal invoice draft.', error);
      const message = String(error?.message || 'Unknown error');
      UI.toast(message.includes('Renewal invoice draft was created, but annual SaaS items could not be saved') ? message : 'Unable to create renewal invoice draft: ' + message);
    }
  },
  buildCommercialRenewalPayload_(batchId = '', path = 'proposal') {
    const rows = this.state.activeRenewalRows || [];
    const first = rows[0] || {};
    const agreement = this.findAgreementForRenewalRow_(first);
    const total = rows.reduce((sum, row) => sum + this.calculateRenewalLineTotal_(row, row.license_months || this.getRenewalLicenseMonths_(row), row.discount_percent || 0), 0);
    const startDates = rows.map(row => row.new_service_start_date).filter(Boolean).sort();
    const endDates = rows.map(row => row.new_service_end_date).filter(Boolean).sort();
    const today = new Date().toISOString().slice(0, 10);
    const common = {
      company_id: agreement.company_id || first.client_id || '',
      company_name: agreement.company_name || first.client_name || '',
      contact_id: agreement.contact_id || '',
      contact_name: agreement.contact_name || agreement.customer_contact_name || '',
      contact_email: agreement.contact_email || agreement.customer_contact_email || '',
      customer_name: agreement.customer_name || first.client_name || '',
      customer_legal_name: agreement.customer_legal_name || first.client_name || '',
      customer_address: agreement.customer_address || '',
      customer_contact_name: agreement.customer_contact_name || agreement.contact_name || '',
      customer_contact_email: agreement.customer_contact_email || agreement.contact_email || '',
      provider_name: agreement.provider_name || '',
      provider_legal_name: agreement.provider_legal_name || '',
      provider_address: agreement.provider_address || '',
      service_start_date: startDates[0] || today,
      service_end_date: endDates[endDates.length - 1] || '',
      contract_term: first.contract_term || '12 months',
      billing_frequency: first.billing_frequency || agreement.billing_frequency || 'Annual',
      payment_term: first.payment_term || agreement.payment_term || agreement.payment_terms || 'Net 30',
      currency: first.currency || agreement.currency || 'USD',
      subtotal_locations: total,
      subtotal_one_time: 0,
      grand_total: total,
      notes: `Renewal commercial path ${batchId}. Selected existing locations only. Do not create Operations Onboarding, Technical Admin request, or new locations.`,
      source_type: 'renewal',
      renewal_batch_id: batchId,
      renewed_from_agreement_id: first.agreement_id || agreement.id || ''
    };
    const items = rows.map((row, index) => ({
      item_id: `REN-COM-${Date.now()}-${index + 1}`,
      section: 'annual_saas',
      line_no: index + 1,
      location_name: row.location_name || '',
      item_name: `${row.module_name || 'Annual SaaS'} renewal`,
      unit_price: this.getRenewalAnnualLicensePrice_(row),
      discount_percent: this.toNumberSafe(row.discount_percent),
      discounted_unit_price: this.getRenewalAnnualLicensePrice_(row) * (1 - (Math.min(100, Math.max(0, this.toNumberSafe(row.discount_percent))) / 100)),
      quantity: row.license_months || this.getRenewalLicenseMonths_(row),
      line_total: this.calculateRenewalLineTotal_(row, row.license_months || this.getRenewalLicenseMonths_(row), row.discount_percent || 0),
      service_start_date: row.new_service_start_date || '',
      service_end_date: row.new_service_end_date || '',
      notes: 'Renewal for existing invoiced location; no setup fee.'
    }));
    if (path === 'proposal') {
      return {
        proposal: {
          ...common,
          proposal_title: `Renewal Proposal - ${first.client_name || common.customer_name || 'Client'}`,
          proposal_date: today,
          proposal_valid_until: common.service_start_date,
          status: 'Draft'
        },
        items
      };
    }
    return {
      agreement: {
        ...common,
        agreement_number: `REN-AGR-${Date.now()}`,
        agreement_date: today,
        effective_date: common.service_start_date,
        status: 'Draft'
      },
      items
    };
  },
  async createCommercialRenewalPath_(path = '', batchId = '') {
    const selectedBatchId = batchId || `REN-${Date.now()}`;
    const renewalPath = path === 'proposal' ? 'renewal_proposal_agreement' : 'direct_agreement_renewal';
    const status = path === 'proposal' ? 'Renewal Proposal Created' : 'Renewal Agreement Created';
    try {
      const payload = this.buildCommercialRenewalPayload_(selectedBatchId, path === 'proposal' ? 'proposal' : 'agreement');
      const response = path === 'proposal'
        ? await Api.requestWithSession('proposals', 'create', payload, { requireAuth: true })
        : await Api.requestWithSession('agreements', 'create', payload, { requireAuth: true });
      await this.persistRenewalHistory_(selectedBatchId, renewalPath, status, response).catch(error => console.warn('[Renewal] Optional renewal history save failed.', error));
      UI.toast(path === 'proposal' ? 'Renewal proposal created for selected locations only.' : 'Renewal agreement draft created for selected locations only.');
      this.closeRenewalModal_();
      this.invalidateClientTabCache(this.state.selectedClientId, ['overview', 'renewals', 'statement', 'agreements']);
      if (this.state.selectedClientId) await this.loadClientSubTab(this.state.selectedClientId, this.state.activeDetailTab || 'overview', { force: true }).catch(() => {});
      this.render();
    } catch (error) {
      console.warn('[Renewal] Unable to create commercial renewal path.', error);
      UI.toast('Unable to create renewal path: ' + (error?.message || 'Unknown error'));
    }
  },
  async persistRenewalHistory_(batchId = '', renewalPath = '', renewalStatus = '', response = null) {
    const client = window.SupabaseClient?.getClient?.() || window.supabaseClient || null;
    const rows = this.state.activeRenewalRows || [];
    if (!client?.from || !rows.length) return null;
    const now = new Date().toISOString();
    const invoice = response?.data || response?.invoice || response || {};
    const records = rows.map(row => ({
      renewal_batch_id: batchId,
      client_id: row.client_id || null,
      client_name: row.client_name || null,
      agreement_id: row.agreement_id || null,
      agreement_number: row.agreement_number || null,
      invoice_id: invoice.id || invoice.invoice_id || row.invoice_id || null,
      invoice_number: invoice.invoice_number || row.invoice_number || null,
      invoice_item_id: row.invoice_item_id || null,
      location_name: row.location_name || null,
      old_service_start_date: row.service_start_date || null,
      old_service_end_date: row.service_end_date || null,
      new_service_start_date: row.new_service_start_date || null,
      new_service_end_date: row.new_service_end_date || null,
      renewal_status: renewalStatus,
      renewal_path: renewalPath,
      created_at: now,
      updated_at: now,
      notes: 'Commercial renewal only; no onboarding or Technical Admin request.'
    }));
    try {
      for (const record of records) {
        let query = client.from('renewals').select('id,renewal_batch_id,updated_at').limit(1);
        if (record.client_id) query = query.eq('client_id', record.client_id);
        if (record.agreement_id) query = query.eq('agreement_id', record.agreement_id);
        if (record.location_name) query = query.ilike('location_name', record.location_name);
        if (record.new_service_start_date) query = query.eq('new_service_start_date', record.new_service_start_date);
        if (record.new_service_end_date) query = query.eq('new_service_end_date', record.new_service_end_date);
        const { data: existingRows, error: selectError } = await query;
        if (selectError) throw selectError;
        const existing = Array.isArray(existingRows) ? existingRows[0] : null;
        if (existing?.id) {
          const updateRecord = { ...record };
          delete updateRecord.created_at;
          const { error: updateError } = await client.from('renewals').update(updateRecord).eq('id', existing.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await client.from('renewals').insert(record);
          if (insertError) throw insertError;
        }
      }
      return true;
    } catch (error) {
      console.info('[Renewal] renewals table unavailable or schema mismatch; continuing without blocking.', error);
      return false;
    }
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
    const invoices = this.listClientRelatedInvoices_(clientId);
    const receipts = this.listClientRelatedReceipts_(clientId);
    const invoiceRows = invoices.map(item => ({
      date: item.invoice_date || item.issued_date || item.issue_date || item.created_at || item.updated_at,
      type: 'Invoice',
      document_no: item.invoice_number || item.invoice_id || item.id || '—',
      document_id: item.invoice_id || item.id,
      reference: item.reference || item.agreement_number || item.agreement_id || item.proposal_id || '',
      debit: this.pickAmount_(item, ['grand_total', 'total_amount', 'invoice_total', 'total', 'amount_due', 'value', 'amount']),
      credit: 0,
      due_date: item.due_date || item.payment_due_date || '',
      status: this.getPaymentStatus(item),
      notes: item.notes || item.status || item.payment_state || '',
      currency: String(item.currency || '').trim() || 'USD'
    }));
    const receiptRows = receipts.map(item => ({
      date: item.payment_date || item.receipt_date || item.received_at || item.created_at || item.updated_at,
      type: 'Receipt',
      document_no: item.receipt_number || item.receipt_id || item.id || '—',
      document_id: item.receipt_id || item.id,
      reference: item.reference || item.payment_reference || item.invoice_number || item.invoice_id || item.agreement_number || '',
      debit: 0,
      credit: this.pickAmount_(item, ['received_amount', 'amount_received', 'amount_paid', 'paid_amount', 'receipt_total', 'amount', 'total_amount']),
      due_date: '',
      status: this.getStatementRowStatus({ ...item, type: 'Receipt' }),
      notes: item.notes || item.payment_method || '',
      currency: String(item.currency || '').trim() || 'USD'
    }));
    return this.computeRunningBalance([...invoiceRows, ...receiptRows]);
  },

  getAnnualSaasServiceDates_(item = {}) {
    const serviceStart = String(
      item?.service_start_date ||
      item?.serviceStartDate ||
      item?.start_service_date ||
      item?.startServiceDate ||
      ''
    ).trim();

    const serviceEnd = String(
      item?.service_end_date ||
      item?.serviceEndDate ||
      item?.end_service_date ||
      item?.endServiceDate ||
      ''
    ).trim();

    return {
      service_start_date: serviceStart,
      service_end_date: serviceEnd,
      renewal_date: serviceEnd,
      renewal_due_date: serviceEnd
    };
  },
  isInvoiceStatusExcludedFromRenewals_(invoice = {}) {
    const status = String(invoice?.status || '').trim().toLowerCase().replace(/\s+/g, '_');
    return ['cancelled', 'canceled', 'void', 'deleted', 'rejected'].includes(status);
  },
  normalizeSectionKey_(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s\-]+/g, '_');
  },
  isAnnualSaasInvoiceItem_(item = {}) {
    const section = this.normalizeSectionKey_(item?.section || item?.item_section || item?.itemSection || item?.category || item?.type || '');
    if (['annual_saas', 'saas_annual', 'subscription_annual', 'annual_subscription'].includes(section)) return true;

    const itemText = String([
      item?.item_name,
      item?.itemName,
      item?.module_name,
      item?.moduleName,
      item?.product_name,
      item?.productName,
      item?.service_name,
      item?.serviceName,
      item?.description
    ].filter(Boolean).join(' ')).toLowerCase();

    if (section.includes('one_time') || section.includes('setup') || itemText.includes('account setup') || itemText.includes('one time')) return false;

    const hasServiceDates = Boolean(String(item?.service_start_date || item?.serviceStartDate || '').trim() || String(item?.service_end_date || item?.serviceEndDate || '').trim());
    const hasLicenseFields = item?.license_quantity !== undefined || item?.licenseQuantity !== undefined || item?.license_months !== undefined || item?.licenseMonths !== undefined;
    const looksLikeSaas = itemText.includes('incheck') || itemText.includes('license') || itemText.includes('subscription') || itemText.includes('saas');

    return Boolean(hasServiceDates && (hasLicenseFields || looksLikeSaas));
  },
  getClientInvoiceAnnualSaasItems_(clientId) {
    const invoices = this.listClientRelatedInvoices_(clientId).filter(invoice => !this.isInvoiceStatusExcludedFromRenewals_(invoice));
    const invoiceItems = this.listClientRelatedInvoiceItems_(clientId);
    return invoiceItems
      .filter(item => this.isAnnualSaasInvoiceItem_(item))
      .map(item => {
        const invoice = this.findInvoiceForItem_(item, invoices) || {};
        return { ...item, _invoice: invoice };
      });
  },

  getInvoiceAnnualSaasRenewalRows(client = {}) {
    const safeClient = client && typeof client === 'object' ? client : {};
    const clientId = String(safeClient.client_id || safeClient.clientId || this.state.selectedClientId || '').trim();
    const invoices = (Array.isArray(safeClient.invoices) && safeClient.invoices.length
      ? safeClient.invoices
      : this.listClientRelatedInvoices_(clientId))
      .filter(invoice => !this.isInvoiceStatusExcludedFromRenewals_(invoice));

    const invoiceKeys = new Set();
    invoices.forEach(invoice => this.getInvoiceMatchKeys_(invoice).forEach(key => invoiceKeys.add(String(key || '').trim())));

    const agreementItems = this.listClientAgreementLocationItems_(clientId)
      .filter(item => this.isAnnualSaasInvoiceItem_(item));

    const seenItems = new Set();
    const collectItems = [];

    const pushItem = (item, invoice = {}, source = 'invoice_item') => {
      if (!item || typeof item !== 'object') return;
      const normalized = source === 'agreement_item'
        ? this.normalizeAgreementItem(item)
        : (this.normalizeInvoiceItem ? this.normalizeInvoiceItem(item) : item);

      const invoiceForItem = invoice && Object.keys(invoice).length
        ? invoice
        : (source === 'agreement_item'
          ? this.findInvoiceForAgreementItem_(normalized, invoices)
          : this.findInvoiceForItem_(normalized, invoices));

      if (!invoiceForItem || !Object.keys(invoiceForItem).length) return;
      if (this.isInvoiceStatusExcludedFromRenewals_(invoiceForItem)) return;

      if (!this.isAnnualSaasInvoiceItem_(normalized)) return;

      let enriched = { ...normalized };
      if (source !== 'agreement_item') {
        const matchingAgreementItem = this.findAgreementItemForInvoiceItem_(normalized, agreementItems);
        if (matchingAgreementItem) {
          enriched = {
            ...matchingAgreementItem,
            ...normalized,
            service_start_date: normalized.service_start_date || matchingAgreementItem.service_start_date || '',
            service_end_date: normalized.service_end_date || matchingAgreementItem.service_end_date || '',
            location_name: normalized.location_name || matchingAgreementItem.location_name || '',
            item_name: normalized.item_name || matchingAgreementItem.item_name || matchingAgreementItem.module_name || '',
            line_total: this.toNumberSafe(normalized.line_total || matchingAgreementItem.line_total || 0),
            currency: normalized.currency || matchingAgreementItem.currency || ''
          };
        }
      }

      const invoiceIdentity = String(invoiceForItem.id || invoiceForItem.invoice_id || invoiceForItem.invoice_number || '').trim();
      const locationKey = this.normalizeLocationKey(enriched.location_name || enriched.locationName || enriched.location || '');
      const itemKey = this.normalizeLocationKey(enriched.item_name || enriched.itemName || enriched.module_name || enriched.moduleName || '');
      const sourceId = String(enriched.id || '').trim();
      const itemIdentity = sourceId || `${invoiceIdentity}-${locationKey}-${itemKey}-${enriched.line_no || ''}`;
      if (itemIdentity && seenItems.has(itemIdentity)) return;
      if (itemIdentity) seenItems.add(itemIdentity);

      collectItems.push({ item: enriched, invoice: invoiceForItem, source });
    };

    invoices.forEach(invoice => {
      const nestedItems = Array.isArray(invoice?.items)
        ? invoice.items
        : Array.isArray(invoice?.invoice_items)
          ? invoice.invoice_items
          : [];
      nestedItems.forEach(item => pushItem(item, invoice, 'invoice_item'));
    });

    const explicitInvoiceItems = Array.isArray(safeClient.invoiceItems)
      ? safeClient.invoiceItems
      : Array.isArray(safeClient.invoice_items)
        ? safeClient.invoice_items
        : [];

    explicitInvoiceItems.forEach(item => pushItem(item, this.findInvoiceForItem_(item, invoices) || {}, 'invoice_item'));

    // State-level invoice_items can be old/imported and may only link by invoice number/UUID/agreement.
    (Array.isArray(this.state.invoiceItems) ? this.state.invoiceItems : [])
      .filter(Boolean)
      .forEach(item => {
        const normalized = this.normalizeInvoiceItem ? this.normalizeInvoiceItem(item) : item;
        const invoice = this.findInvoiceForItem_(normalized, invoices);
        if (invoice) pushItem(normalized, invoice, 'invoice_item');
      });

    // Final reliable fallback: agreement_items that were actually invoiced.
    // This still follows the business rule: renewals are based on invoiced Annual SaaS locations,
    // not on all agreement Annual SaaS rows.
    agreementItems.forEach(item => {
      if (!this.isAgreementItemInvoiced_(item)) return;
      const invoice = this.findInvoiceForAgreementItem_(item, invoices);
      if (!invoice) return;
      pushItem(item, invoice, 'agreement_item');
    });

    const rows = [];
    collectItems.forEach(({ item, invoice, source }) => {
      const serviceStart = String(item?.service_start_date || item?.serviceStartDate || '').trim();
      const serviceEnd = String(item?.service_end_date || item?.serviceEndDate || item?.renewal_date || item?.renewalDate || '').trim();
      if (!serviceEnd) return;

      rows.push(this.normalizeRenewalRow({
        id: item?.id || `${invoice?.id || invoice?.invoice_number || item?.invoice_id}-${item?.line_no || item?.location_name}`,
        row_id: `${source}:${item?.id || invoice?.id || invoice?.invoice_number || item?.line_no || item?.location_name}`,
        source,
        location_name: item?.location_name || item?.locationName || '',
        item_name: item?.item_name || item?.itemName || item?.module_name || item?.moduleName || '',
        agreement_id: invoice?.agreement_id || invoice?.agreementId || item?.agreement_id || item?.agreementId || '',
        agreement_number: invoice?.agreement_number || invoice?.agreementNumber || invoice?.agreement_reference || item?.agreement_number || item?.agreementNumber || item?.agreement_reference || '',
        invoice_id: invoice?.id || invoice?.invoice_id || item?.invoice_id || '',
        invoice_number: invoice?.invoice_number || invoice?.invoiceNumber || invoice?.invoice_no || item?.invoice_number || item?.invoiceNumber || '',
        service_start_date: serviceStart,
        service_end_date: serviceEnd,
        renewal_date: serviceEnd,
        renewal_due_date: serviceEnd,
        due_date: invoice?.due_date || invoice?.dueDate || '',
        payment_status: invoice?.payment_status || invoice?.paymentStatus || invoice?.status || '',
        renewal_status: this.getRenewalStatusFromDate ? this.getRenewalStatusFromDate(serviceEnd) : '',
        amount_due: this.toNumberSafe(item?.line_total || item?.total || item?.amount || 0),
        line_total: this.toNumberSafe(item?.line_total || item?.total || item?.amount || 0),
        currency: this.getField(item, 'currency', 'currency_code') || this.getField(invoice, 'currency') || this.getClientCurrency_(clientId)
      }));
    });

    const uniqueRows = this.buildUniqueInvoiceRenewalRows_(rows);

    console.debug('[client invoice renewal rows]', {
      clientId,
      invoices: invoices.length,
      invoiceItemsState: Array.isArray(this.state.invoiceItems) ? this.state.invoiceItems.length : 0,
      agreementItems: agreementItems.length,
      collectedItems: collectItems.length,
      annualSaasRows: uniqueRows.length,
      invoiceNumbers: invoices.map(invoice => invoice.invoice_number || invoice.invoice_id || invoice.id).slice(0, 10)
    });

    return uniqueRows.sort((a, b) => new Date(a.renewal_date || a.service_end_date).getTime() - new Date(b.renewal_date || b.service_end_date).getTime());
  },
  buildUniqueInvoiceRenewalRows_(items = []) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const hasRenewalDates = Boolean(String(item.service_end_date || item.serviceEndDate || item.renewal_date || '').trim());
      if (!hasRenewalDates) continue;
      if (!this.isAnnualSaasInvoiceItem_(item) && !String(item.source || '').includes('agreement_item') && !String(item.source || '').includes('invoice_item')) continue;
      const locationKey = this.normalizeLocationKey(item.location_name || item.locationName || item.location || '');
      const itemKey = this.normalizeLocationKey(item.item_name || item.itemName || item.module_name || item.moduleName || item.license || item.product_name || '');
      if (!locationKey) continue;
      const invoice = item._invoice || {};
      const key = `${locationKey}::${itemKey}::${String(invoice.id || invoice.invoice_id || invoice.invoice_number || item.invoice_id || item.invoice_number || '').trim()}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        continue;
      }
      const existingEnd = new Date(existing.service_end_date || existing.serviceEndDate || 0).getTime();
      const itemEnd = new Date(item.service_end_date || item.serviceEndDate || 0).getTime();
      if (itemEnd >= existingEnd) map.set(key, item);
    }
    return Array.from(map.values());
  },
  buildClientRenewalRows(client) {
    const safeClient = client && typeof client === 'object' ? client : {};
    const clientId = String(safeClient.client_id || '').trim();
    const clientWithInvoices = {
      ...safeClient,
      client_id: clientId,
      invoices: Array.isArray(safeClient.invoices) && safeClient.invoices.length
        ? safeClient.invoices
        : this.listClientRelatedInvoices_(clientId)
    };
    return this.getInvoiceAnnualSaasRenewalRows(clientWithInvoices);
  },
  normalizeRenewalRow(raw = {}) {
    const serviceEnd = String(this.getField(raw, 'service_end_date', 'serviceEndDate') || '').trim();
    const renewalDate = serviceEnd || String(this.getField(raw, 'renewal_date', 'renewalDate', 'next_renewal_date', 'nextRenewalDate') || '').trim();
    const paymentStatus = String(this.getField(raw, 'payment_status', 'paymentStatus') || '').trim();
    return {
      row_id: String(this.getField(raw, 'row_id', 'rowId') || '').trim(),
      client_id: String(this.getField(raw, 'client_id', 'clientId') || '').trim(),
      source_agreement_item_id: String(this.getField(raw, 'source_agreement_item_id', 'sourceAgreementItemId') || '').trim(),
      invoice_item_id: String(this.getField(raw, 'invoice_item_id', 'invoiceItemId') || '').trim(),
      agreement_uuid: String(this.getField(raw, 'agreement_uuid', 'agreementUuid') || '').trim(),
      agreement_id: String(this.getField(raw, 'agreement_id', 'agreementId') || '').trim(),
      agreement_reference: String(this.getField(raw, 'agreement_reference', 'agreementReference', 'agreement_display_id', 'agreementDisplayId') || '').trim(),
      agreement_number: String(this.getField(raw, 'agreement_number', 'agreementNo', 'agreementNumber') || '').trim(),
      invoice_uuid: String(this.getField(raw, 'invoice_uuid', 'invoiceUuid') || '').trim(),
      invoice_id: String(this.getField(raw, 'invoice_id', 'invoiceId') || '').trim(),
      invoice_number: String(this.getField(raw, 'invoice_no', 'invoiceNo', 'invoice_number', 'invoiceNumber') || '').trim(),
      client_uuid: String(this.getField(raw, 'client_uuid', 'clientUuid') || '').trim(),
      company_id: String(this.getField(raw, 'company_id', 'companyId') || '').trim(),
      contact_id: String(this.getField(raw, 'contact_id', 'contactId') || '').trim(),
      location_id: String(this.getField(raw, 'location_id', 'locationId') || '').trim(),
      client_name: String(this.getField(raw, 'client', 'client_name', 'customer_name', 'customerName') || '').trim(),
      location_name: String(this.getField(raw, 'location_name', 'locationName') || '').trim(),
      module_name: String(this.getField(raw, 'module_name', 'moduleName', 'item_name', 'name') || '').trim(),
      service_start_date: String(this.getField(raw, 'service_start_date', 'serviceStartDate') || '').trim(),
      service_end_date: serviceEnd,
      due_date: String(this.getField(raw, 'due_date', 'dueDate') || '').trim(),
      renewal_date: renewalDate,
      billing_frequency: String(this.getField(raw, 'billing_frequency', 'billingFrequency') || '').trim(),
      payment_term: String(this.getField(raw, 'payment_term', 'paymentTerm', 'payment_terms') || '').trim(),
      contract_term: String(this.getField(raw, 'contract_term', 'contractTerm') || '').trim(),
      days_left: this.getDaysLeft(renewalDate),
      amount_due: this.toNumberSafe(this.getField(raw, 'amount_due', 'pending_amount', 'pendingAmount')),
      status: String(this.getField(raw, 'status') || '').trim(),
      payment_status: paymentStatus || this.getPaymentStatus(raw),
      agreement_status: String(this.getField(raw, 'agreement_status', 'agreementStatus') || '').trim(),
      agreement_service_start_date: String(this.getField(raw, 'agreement_service_start_date', 'agreementServiceStartDate') || '').trim(),
      agreement_service_end_date: String(this.getField(raw, 'agreement_service_end_date', 'agreementServiceEndDate') || '').trim(),
      agreement_expiry_date: String(this.getField(raw, 'agreement_expiry_date', 'agreementExpiryDate', 'expiry_date', 'expiration_date') || '').trim(),
      renewal_status: String(this.getField(raw, 'renewal_status', 'renewalStatus') || '').trim(),
      renewal_due_date: serviceEnd || String(this.getField(raw, 'renewal_due_date', 'renewalDueDate', 'renewal_date', 'renewalDate') || '').trim(),
      renewal_batch_id: String(this.getField(raw, 'renewal_batch_id', 'renewalBatchId') || '').trim(),
      renewal_notes: String(this.getField(raw, 'renewal_notes', 'renewalNotes') || '').trim(),
      annual_license_price: this.toNumberSafe(this.getField(raw, 'annual_license_price', 'annualLicensePrice', 'license_price_year', 'licensePriceYear', 'license_price_per_year', 'yearly_license_price')),
      unit_price: this.toNumberSafe(this.getField(raw, 'unit_price', 'unitPrice', 'annual_license_price', 'annualLicensePrice', 'license_price_year', 'licensePriceYear')),
      quantity: this.toNumberSafe(this.getField(raw, 'quantity', 'qty', 'license_months', 'licenseMonths')),
      discount_percent: this.toNumberSafe(this.getField(raw, 'discount_percent', 'discountPercent')),
      line_total: this.toNumberSafe(this.getField(raw, 'line_total', 'lineTotal', 'total', 'amount', 'price')),
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
  getClientTabCacheKey(clientId, tabKey, page = 1, pageSize = 25) {
    return `${clientId || 'none'}:${tabKey}:p${page}:s${pageSize}`;
  },
  getClientTabPageState(tabKey) {
    const key = `${this.state.selectedClientId || 'none'}:${tabKey}`;
    return this.state.pagination.get(key) || { page: 1, pageSize: 25 };
  },
  setClientTabPageState(tabKey, page = 1, pageSize = 25) {
    const key = `${this.state.selectedClientId || 'none'}:${tabKey}`;
    this.state.pagination.set(key, { page: Math.max(Number(page || 1), 1), pageSize: Math.max(Number(pageSize || 25), 1) });
  },
  normalizeClientTabKey(tab = 'overview') {
    const key = String(tab || 'overview').trim();
    const aliases = { scheduled_payments: 'scheduledPayments', statement_of_account: 'statement', renewals_payments: 'renewals' };
    return aliases[key] || key;
  },
  setDetailTab(tab = 'overview', options = {}) {
    const normalizedTab = this.normalizeClientTabKey(tab);
    let nextTab = normalizedTab;
    if (nextTab === 'statement' && !this.canViewClientStatement()) nextTab = 'overview';
    if (nextTab === 'renewals' && !this.canViewClientRenewals()) nextTab = 'overview';
    this.state.activeDetailTab = ['overview', 'statement', 'renewals', 'scheduledPayments', 'intelligence_hub'].includes(nextTab) ? nextTab : 'overview';
    if (E.clientOverviewSection) E.clientOverviewSection.style.display = this.state.activeDetailTab === 'overview' ? '' : 'none';
    if (E.clientStatementSection) E.clientStatementSection.style.display = this.state.activeDetailTab === 'statement' && this.canViewClientStatement() ? '' : 'none';
    if (E.clientRenewalsSection) E.clientRenewalsSection.style.display = this.state.activeDetailTab === 'renewals' && this.canViewClientRenewals() ? '' : 'none';
    if (E.clientScheduledPaymentsSection) E.clientScheduledPaymentsSection.style.display = this.state.activeDetailTab === 'scheduledPayments' ? '' : 'none';
    if (E.clientDetailTabButtons) {
      E.clientDetailTabButtons.querySelectorAll('[data-client-detail-tab]').forEach(btn => {
        const tabName = btn.getAttribute('data-client-detail-tab');
        if (tabName === 'statement') btn.style.display = this.canViewClientStatement() ? '' : 'none';
        if (tabName === 'renewals') btn.style.display = this.canViewClientRenewals() ? '' : 'none';
        const selected = tabName === this.state.activeDetailTab;
        btn.classList.toggle('primary', selected);
        btn.classList.toggle('ghost', !selected);
      });
    }
    if (!options.skipLoad && this.state.selectedClientId && this.state.activeDetailTab !== 'overview') {
      const { page, pageSize } = this.getClientTabPageState(this.state.activeDetailTab);
      this.loadClientSubTab(this.state.selectedClientId, this.state.activeDetailTab, { page, pageSize, force: false }).catch(error => {
        console.warn('[Clients] lazy sub-tab load failed', error);
        UI.toast(error?.message || 'Unable to load client tab.');
      });
    }
  },
  renderSubTabLoading(tabKey) {
    const skeleton = '<tr><td colspan="12"><div class="skeleton" style="height:30px;"></div></td></tr>';
    if (tabKey === 'statement' && E.clientStatementTbody) E.clientStatementTbody.innerHTML = skeleton;
    if (tabKey === 'renewals' && E.clientRenewalsTbody) E.clientRenewalsTbody.innerHTML = skeleton;
    if (tabKey === 'scheduledPayments' && E.clientScheduledPaymentsTbody) E.clientScheduledPaymentsTbody.innerHTML = skeleton;
    if (tabKey === 'overview') {
      if (E.clientRelatedAgreementsTbody) E.clientRelatedAgreementsTbody.innerHTML = skeleton;
      if (E.clientRelatedInvoicesTbody) E.clientRelatedInvoicesTbody.innerHTML = skeleton;
      if (E.clientRelatedReceiptsTbody) E.clientRelatedReceiptsTbody.innerHTML = skeleton;
    }
  },
  invalidateClientTabCache(clientId, tabKeys = []) {
    for (const key of this.state.tabCache.keys()) {
      const shouldDelete = key.startsWith(`${clientId}:`) && (!tabKeys.length || tabKeys.some(tab => key.includes(`:${this.normalizeClientTabKey(tab)}:`)));
      if (shouldDelete) this.state.tabCache.delete(key);
    }
    if (!tabKeys.length) delete this.state.detailCache[clientId];
  },
  renderClientPagination_(tabKey, result = {}) {
    const total = Number(result.total || 0);
    const page = Math.max(Number(result.page || 1), 1);
    const pageSize = Math.max(Number(result.pageSize || 25), 1);
    const totalPages = Math.max(Number(result.totalPages || Math.ceil(total / pageSize) || 1), 1);
    const start = total ? ((page - 1) * pageSize) + 1 : 0;
    const end = Math.min(page * pageSize, total);
    const sectionByTab = { statement: E.clientStatementSection, renewals: E.clientRenewalsSection, scheduledPayments: E.clientScheduledPaymentsSection, overview: E.clientOverviewSection };
    const section = sectionByTab[tabKey];
    if (!section) return;
    let mount = section.querySelector(`[data-client-pagination="${CSS.escape(tabKey)}"]`);
    if (!mount) {
      mount = document.createElement('div');
      mount.setAttribute('data-client-pagination', tabKey);
      mount.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;margin-top:8px;';
      section.appendChild(mount);
    }
    mount.innerHTML = `<span class="muted">Showing ${U.escapeHtml(String(start))}–${U.escapeHtml(String(end))} of ${U.escapeHtml(String(total))} · Page ${U.escapeHtml(String(page))} of ${U.escapeHtml(String(totalPages))}</span><button class="btn ghost sm" type="button" data-client-tab-page="${U.escapeAttr(tabKey)}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button><button class="btn ghost sm" type="button" data-client-tab-page="${U.escapeAttr(tabKey)}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next</button><select class="select" data-client-tab-page-size="${U.escapeAttr(tabKey)}">${[25, 50, 100].map(size => `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>`).join('')}</select><button class="btn ghost sm" type="button" data-client-tab-refresh="${U.escapeAttr(tabKey)}">Refresh</button>`;
  },
  getClientDetailResultRows_(value = null) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object' && Array.isArray(value.rows)) return value.rows;
    return [];
  },
  getCachedClientDetailRows_(clientId = '', key = '') {
    const detail = this.state.detailCache?.[clientId] || {};
    const aliases = {
      agreements: ['agreements', 'agreementRows'],
      agreementItems: ['agreementItems', 'agreement_items'],
      invoices: ['invoices', 'invoiceRows'],
      invoiceItems: ['invoiceItems', 'invoice_items'],
      receipts: ['receipts', 'receiptRows'],
      receiptItems: ['receiptItems', 'receipt_items']
    };
    const keys = aliases[key] || [key];
    for (const candidateKey of keys) {
      const rows = this.getClientDetailResultRows_(detail[candidateKey]);
      if (rows.length) return rows;
    }
    return [];
  },
  getClientLinkedRowKey_(row = {}) {
    return String(
      row?.id || row?.uuid || row?.agreement_uuid || row?.invoice_uuid || row?.receipt_uuid ||
      row?.agreement_id || row?.invoice_id || row?.receipt_id || row?.agreement_number || row?.invoice_number || row?.receipt_number ||
      row?.schedule_id || row?.row_id || JSON.stringify(row || {})
    ).trim();
  },
  mergeClientLinkedRows_(existing = [], incoming = []) {
    const byKey = new Map();
    [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]
      .filter(Boolean)
      .forEach(row => {
        const key = this.getClientLinkedRowKey_(row);
        if (!key) return;
        if (!byKey.has(key)) byKey.set(key, row);
        else byKey.set(key, { ...byKey.get(key), ...row });
      });
    return [...byKey.values()];
  },
  mergeRowsIntoStateCollection_(stateKey = '', rows = []) {
    if (!stateKey || !Array.isArray(rows) || !rows.length) return;
    const current = Array.isArray(this.state[stateKey]) ? this.state[stateKey] : [];
    this.state[stateKey] = this.mergeClientLinkedRows_(current, rows);
  },
  mergeLinkedClientRowsFromResult_(current = {}, result = {}) {
    const linked = {
      agreements: this.getClientDetailResultRows_(result.agreements),
      agreementItems: this.getClientDetailResultRows_(result.agreementItems || result.agreement_items),
      invoices: this.getClientDetailResultRows_(result.invoices),
      invoiceItems: this.getClientDetailResultRows_(result.invoiceItems || result.invoice_items),
      receipts: this.getClientDetailResultRows_(result.receipts),
      receiptItems: this.getClientDetailResultRows_(result.receiptItems || result.receipt_items)
    };

    if (linked.agreements.length) {
      current.agreements = this.mergeClientLinkedRows_(current.agreements, linked.agreements);
      this.mergeRowsIntoStateCollection_('agreements', linked.agreements);
    }
    if (linked.agreementItems.length) {
      current.agreementItems = this.mergeClientLinkedRows_(current.agreementItems, linked.agreementItems);
      this.mergeRowsIntoStateCollection_('agreementItems', linked.agreementItems);
    }
    if (linked.invoices.length) {
      current.invoices = this.mergeClientLinkedRows_(current.invoices, linked.invoices);
      this.mergeRowsIntoStateCollection_('invoices', linked.invoices);
    }
    if (linked.invoiceItems.length) {
      current.invoiceItems = this.mergeClientLinkedRows_(current.invoiceItems, linked.invoiceItems);
      this.mergeRowsIntoStateCollection_('invoiceItems', linked.invoiceItems);
    }
    if (linked.receipts.length) {
      current.receipts = this.mergeClientLinkedRows_(current.receipts, linked.receipts);
      this.mergeRowsIntoStateCollection_('receipts', linked.receipts);
    }
    if (linked.receiptItems.length) {
      current.receiptItems = this.mergeClientLinkedRows_(current.receiptItems, linked.receiptItems);
      this.mergeRowsIntoStateCollection_('receiptItems', linked.receiptItems);
    }
    return current;
  },
  mergeClientTabResult_(clientId, tabKey, result = {}) {
    let current = this.state.detailCache[clientId] || { detail: this.state.rows.find(row => row.client_id === clientId) || {}, loadedAt: Date.now() };
    current = this.mergeLinkedClientRowsFromResult_(current, result);
    if (result.detail) current.detail = { ...(current.detail || {}), ...result.detail };
    if (tabKey === 'scheduledPayments') current.scheduledPayments = result.rows || [];
    if (tabKey === 'statement') current.statementRows = result.statementRows || result.rows || [];
    if (tabKey === 'renewals') current.renewalRows = result.renewalRows || result.renewal_rows || [];

    const rowClient = this.state.rows.find(row => row.client_id === clientId) || current.detail || {};
    const computedAnalytics = this.computeClientAnalytics_({ ...rowClient, ...(current.detail || {}) });
    current.analytics = { ...(rowClient.analytics || {}), ...(current.analytics || {}), ...computedAnalytics };
    this.state.detailCache[clientId] = { ...current, loadedAt: Date.now() };
  },
  renderClientSubTab(tabKey, result = {}) {
    const clientId = this.state.selectedClientId;
    const client = this.state.rows.find(row => row.client_id === clientId) || {};
    this.mergeClientTabResult_(clientId, tabKey, result);
    const detailData = this.state.detailCache[clientId] || {};
    if (tabKey === 'overview') this.renderDetail();
    if (tabKey === 'scheduledPayments') this.renderScheduledPaymentsSection_(detailData, client);
    if (tabKey === 'statement') this.renderStatementSection_(detailData);
    if (tabKey === 'renewals') this.renderRenewalsSection_(detailData, client);
    this.renderClientPagination_(tabKey, result);
    this.setDetailTab(tabKey, { skipLoad: true });
  },
  normalizeDashboardLinkedRows_(dashboard = {}) {
    const mapRows = (rows, mapper) => (Array.isArray(rows) ? rows : []).map(row => {
      try { return typeof mapper === 'function' ? mapper.call(this, row) : row; }
      catch (_) { return row; }
    });
    return {
      agreements: mapRows(dashboard.agreements, this.normalizeAgreement),
      agreementItems: mapRows(dashboard.agreement_items || dashboard.agreementItems, this.normalizeAgreementItem),
      invoices: mapRows(dashboard.invoices, this.normalizeInvoice),
      invoiceItems: mapRows(dashboard.invoice_items || dashboard.invoiceItems, this.normalizeInvoiceItem),
      receipts: mapRows(dashboard.receipts, this.normalizeReceipt),
      receiptItems: Array.isArray(dashboard.receipt_items || dashboard.receiptItems) ? (dashboard.receipt_items || dashboard.receiptItems) : [],
      companies: Array.isArray(dashboard.companies) ? dashboard.companies : [],
      contacts: Array.isArray(dashboard.contacts) ? dashboard.contacts : []
    };
  },
  mergeDashboardLinkedRowsIntoState_(dashboard = {}) {
    const linked = this.normalizeDashboardLinkedRows_(dashboard);
    this.mergeRowsIntoStateCollection_('agreements', linked.agreements);
    this.mergeRowsIntoStateCollection_('agreementItems', linked.agreementItems);
    this.mergeRowsIntoStateCollection_('invoices', linked.invoices);
    this.mergeRowsIntoStateCollection_('invoiceItems', linked.invoiceItems);
    this.mergeRowsIntoStateCollection_('receipts', linked.receipts);
    this.mergeRowsIntoStateCollection_('receiptItems', linked.receiptItems);
    if (linked.companies.length) {
      this.state.companies = this.mergeClientLinkedRows_(this.state.companies || [], linked.companies);
      this.rebuildCompanyLookupMaps(this.state.companies);
    }
    if (linked.contacts.length) {
      this.state.contacts = this.mergeClientLinkedRows_(this.state.contacts || [], linked.contacts);
      this.state.contactsById = new Map((this.state.contacts || []).map(contact => [String(contact.id || contact.contact_id || '').trim(), contact]).filter(([id]) => id));
    }
    return linked;
  },
  clientTabResultLooksIncomplete_(clientId = '', tabKey = '', result = {}) {
    const client = this.state.rows.find(row => row.client_id === clientId) || {};
    const analytics = client.analytics || {};
    const resultRows = this.getClientDetailResultRows_(result.rows);
    const resultInvoices = this.getClientDetailResultRows_(result.invoices);
    const resultReceipts = this.getClientDetailResultRows_(result.receipts);
    const resultAgreements = this.getClientDetailResultRows_(result.agreements);
    const hasExpectedMoney = this.toNumberSafe(analytics.total_invoiced_value || client.total_value || client.total_due || client.total_paid) > 0;
    const hasExpectedLocations = this.toNumberSafe(analytics.total_locations || client.total_locations) > 0;
    if (tabKey === 'overview') return (hasExpectedMoney || hasExpectedLocations) && !resultInvoices.length && !resultAgreements.length && !resultReceipts.length;
    if (tabKey === 'statement') return hasExpectedMoney && !(result.statementRows || resultRows || []).length;
    if (tabKey === 'renewals') return hasExpectedLocations && !(result.renewalRows || resultRows || []).length && !this.listClientRelatedInvoiceItems_(clientId).length;
    if (tabKey === 'scheduledPayments') return hasExpectedMoney && !resultRows.length;
    return false;
  },
  async ensureFullClientLinkedSnapshot_(clientId = '') {
    if (!window.ClientsService?.getDashboardData) return null;
    const now = Date.now();
    if (this.state.fullLinkedSnapshotLoadedAt && now - this.state.fullLinkedSnapshotLoadedAt < 60000) return null;
    const dashboard = await window.ClientsService.getDashboardData({
      limit: Math.max(this.state.limit || 50, 50),
      page: this.state.page || 1,
      search: this.state.search || '',
      status: this.state.status,
      allowClientMutations: false,
      summaryOnly: false
    });
    this.state.fullLinkedSnapshotLoadedAt = now;
    return this.mergeDashboardLinkedRowsIntoState_(dashboard);
  },
  async loadClientSubTab(clientId, tabKey, options = {}) {
    const normalizedTab = this.normalizeClientTabKey(tabKey);
    const client = this.state.rows.find(row => row.client_id === clientId) || {};
    const page = Math.max(Number(options.page || 1), 1);
    const pageSize = Math.max(Number(options.pageSize || 25), 1);
    const force = options.force === true;
    const cacheKey = this.getClientTabCacheKey(clientId, normalizedTab, page, pageSize);
    this.setClientTabPageState(normalizedTab, page, pageSize);
    if (!force && this.state.tabCache.has(cacheKey)) {
      this.renderClientSubTab(normalizedTab, this.state.tabCache.get(cacheKey));
      return this.state.tabCache.get(cacheKey);
    }
    this.renderSubTabLoading(normalizedTab);
    this.state.clientPanelLoading = true;
    let result;
    try {
      switch (normalizedTab) {
        case 'overview':
          result = await Api.getClientOverview(client);
          break;
        case 'renewals':
          result = await Api.getClientRenewalsPayments(client, { page, pageSize });
          break;
        case 'scheduledPayments':
          result = await Api.getClientScheduledPayments(client, { page, pageSize });
          break;
        case 'statement':
          result = await Api.getClientStatementOfAccount(client, { page, pageSize });
          break;
        case 'agreements':
          result = await Api.getClientAgreements(client, { page, pageSize });
          break;
        case 'invoices':
          result = await Api.getClientInvoices(client, { page, pageSize });
          break;
        case 'receipts':
          result = await Api.getClientReceipts(client, { page, pageSize });
          break;
        default:
          result = { rows: [], total: 0, page, pageSize, totalPages: 0 };
      }
      if (this.clientTabResultLooksIncomplete_(clientId, normalizedTab, result)) {
        await this.ensureFullClientLinkedSnapshot_(clientId).catch(error => console.warn('[Clients] full linked snapshot fallback failed', error));
        if (normalizedTab === 'overview') {
          result = { ...(result || {}), agreements: { rows: this.listClientRelatedAgreements_(clientId) }, invoices: { rows: this.listClientRelatedInvoices_(clientId) }, receipts: { rows: this.listClientRelatedReceipts_(clientId) }, agreementItems: { rows: this.listClientAgreementLocationItems_(clientId) }, invoiceItems: { rows: this.listClientRelatedInvoiceItems_(clientId) }, receiptItems: { rows: this.listClientRelatedReceiptItems_(clientId) } };
        } else if (normalizedTab === 'statement') {
          result = { ...(result || {}), rows: this.buildClientStatementRows(client), statementRows: this.buildClientStatementRows(client), invoices: { rows: this.listClientRelatedInvoices_(clientId) }, receipts: { rows: this.listClientRelatedReceipts_(clientId) } };
        } else if (normalizedTab === 'renewals') {
          const renewalRows = this.buildClientRenewalRows({ ...client, invoices: this.listClientRelatedInvoices_(clientId), invoice_items: this.listClientRelatedInvoiceItems_(clientId) });
          result = { ...(result || {}), rows: renewalRows, renewalRows, invoices: { rows: this.listClientRelatedInvoices_(clientId) }, invoiceItems: { rows: this.listClientRelatedInvoiceItems_(clientId) } };
        } else if (normalizedTab === 'scheduledPayments') {
          const scheduledRows = this.buildClientScheduledPaymentRowsFromInvoices_(clientId);
          result = { ...(result || {}), rows: scheduledRows, scheduledPayments: scheduledRows, invoices: { rows: this.listClientRelatedInvoices_(clientId) } };
        }
      }
      this.state.tabCache.set(cacheKey, result);
      const loaded = this.state.loadedTabsByClient.get(clientId) || new Set();
      loaded.add(normalizedTab);
      this.state.loadedTabsByClient.set(clientId, loaded);
      this.renderClientSubTab(normalizedTab, result);
      return result;
    } finally {
      this.state.clientPanelLoading = false;
    }
  },
  async loadClientDetailData_(clientId, { force = false, tabKey = 'overview', page = 1, pageSize = 25 } = {}) {
    return this.loadClientSubTab(clientId, tabKey, { force, page, pageSize });
  },
  getFilteredStatementRows_(rows = []) {
    const { status, dateFrom, dateTo, searchDoc } = this.state.statementFilters;
    return rows.filter(row => {
      const rowStatus = this.normalizeText(this.getStatementRowStatus(row));
      if (status === 'open' && !rowStatus.includes('open') && !rowStatus.includes('partial')) return false;
      if (status === 'overdue' && !rowStatus.includes('overdue')) return false;
      if (status === 'received' && !rowStatus.includes('received')) return false;
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
      const dateValue = String(row.service_end_date || row.renewal_date || row.renewal_due_date || '').trim();
      if (!dateValue) return true;
      const parsedDate = this.parseFlexibleDate_(dateValue);
      if (dateFrom && parsedDate && new Date(parsedDate).getTime() < new Date(dateFrom).getTime()) return false;
      if (dateTo && parsedDate && new Date(parsedDate).getTime() > new Date(dateTo).getTime()) return false;
      return true;
    });
  },
  normalizeScheduledPayment_(row = {}) {
    const rawReference = String(row.invoice_number || row.invoice_reference || row.invoice_reference_fallback || row.invoice_id || '').trim();
    const displayReference = rawReference && !this.isUuid(rawReference) ? rawReference : (String(row.invoice_number || '').trim() || 'Invoice');
    const scheduleNo = row.schedule_no ?? row.payment_no ?? row.installment_no ?? '';
    const invoiceContext = row.raw && typeof row.raw === 'object' ? row.raw : {};
    const invoiceDueDate = String(invoiceContext.due_date || invoiceContext.payment_due_date || invoiceContext.invoice_due_date || '').trim();
    const resolvedDueDate = String(row.due_date || row.payment_due_date || '').trim() || invoiceDueDate;
    return {
      schedule_id: String(row.schedule_id || row.id || row.invoice_payment_schedule_id || `${row.invoice_id || ''}:${scheduleNo}:${resolvedDueDate || ''}`).trim(),
      invoice_id: String(row.invoice_id || row.invoice_uuid || '').trim(),
      invoice_reference: displayReference,
      schedule_no: scheduleNo,
      schedule_label: String(row.schedule_label || row.label || `Payment ${scheduleNo || ''}`.trim() || 'Payment').trim(),
      due_date: resolvedDueDate,
      scheduled_amount: Number(row.scheduled_amount ?? row.amount ?? row.payment_amount ?? 0),
      payment_percent: Number(row.payment_percent ?? row.percent ?? row.paymentPercent ?? 0),
      paid_amount: Number(row.paid_amount ?? row.amount_paid ?? row.received_amount ?? 0),
      balance_due: Number(row.balance_due ?? row.pending_amount ?? Math.max(0, Number(row.scheduled_amount ?? 0) - Number(row.paid_amount ?? 0))),
      status: String(row.status || row.payment_status || row.payment_state || 'unpaid').trim().toLowerCase(),
      reminder_enabled: row.reminder_enabled !== false,
      reminder_days: Array.isArray(row.reminder_days) ? row.reminder_days : (String(row.reminder_days || '').split(',').map(day => day.trim()).filter(Boolean)),
      reminder_user_ids: Array.isArray(row.reminder_user_ids) ? row.reminder_user_ids : (String(row.reminder_user_ids || '').split(',').map(id => id.trim()).filter(Boolean)),
      currency: String(row.currency || 'USD').trim() || 'USD',
      invoice_status: String(row.invoice_status || row.invoice_state || '').trim(),
      raw: row
    };
  },
  getScheduledPaymentBadge_(row = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = row.due_date ? new Date(row.due_date) : null;
    const balance = this.toNumberSafe(row.balance_due);
    const paid = this.toNumberSafe(row.paid_amount);
    const status = String(row.status || '').toLowerCase();
    if (status === 'paid' || (balance <= 0 && paid > 0)) return { label: 'Paid', className: 'ok' };
    if (status === 'partial' || (paid > 0 && balance > 0)) return { label: 'Partial', className: 'warn' };
    if (dueDate && dueDate < today && balance > 0) return { label: 'Overdue', className: 'danger' };
    if (dueDate && dueDate > today && balance > 0) return { label: 'Upcoming', className: 'info' };
    return { label: status ? status.replace(/_/g, ' ') : 'Unpaid', className: '' };
  },
  getFilteredScheduledPaymentRows_(rows = []) {
    const filter = this.state.scheduledPaymentsFilter || 'all';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = row => {
      if (!row.due_date) return null;
      const due = new Date(row.due_date);
      due.setHours(0, 0, 0, 0);
      return Math.ceil((due.getTime() - today.getTime()) / 86400000);
    };
    return rows.filter(row => {
      const badge = this.getScheduledPaymentBadge_(row).label.toLowerCase();
      const days = daysUntil(row);
      const balance = this.toNumberSafe(row.balance_due);
      if (filter === 'upcoming') return days !== null && days > 0 && balance > 0;
      if (filter === 'due7') return days !== null && days >= 0 && days <= 7 && balance > 0;
      if (filter === 'due14') return days !== null && days >= 0 && days <= 14 && balance > 0;
      if (filter === 'due30') return days !== null && days >= 0 && days <= 30 && balance > 0;
      if (filter === 'overdue') return badge === 'overdue';
      if (filter === 'paid') return badge === 'paid';
      if (filter === 'open') return balance > 0;
      return true;
    });
  },
  getClientPaymentScheduleConfig_(paymentTerm = '') {
    const text = String(paymentTerm || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (text.includes('net 7') || text === '7') return { count: 12, monthsStep: 1 };
    if (text.includes('net 14') || text === '14') return { count: 4, monthsStep: 3 };
    if (text.includes('net 21') || text === '21') return { count: 2, monthsStep: 6 };
    return { count: 1, monthsStep: 12 };
  },
  addMonthsToDateString_(dateValue = '', months = 0) {
    const parsed = this.parseDateOnly_(dateValue);
    if (!parsed) return '';
    const date = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    date.setUTCMonth(date.getUTCMonth() + Number(months || 0));
    return date.toISOString().slice(0, 10);
  },
  buildClientScheduledPaymentRowsFromInvoices_(clientId = '') {
    const invoices = this.listClientRelatedInvoices_(clientId).filter(invoice => this.isInvoiceActiveForClientLocation_(invoice));
    const rows = [];
    invoices.forEach(invoice => {
      const total = this.pickAmount_(invoice, ['grand_total', 'invoice_total', 'total_amount', 'amount']);
      if (total <= 0) return;
      const dueDate = String(invoice.due_date || invoice.payment_due_date || invoice.invoice_due_date || invoice.issue_date || invoice.invoice_date || invoice.created_at || '').trim();
      if (!dueDate) return;
      const paidTotal = this.pickAmount_(invoice, ['amount_paid', 'paid_amount', 'received_amount']);
      const config = this.getClientPaymentScheduleConfig_(invoice.payment_term || invoice.payment_terms || invoice.paymentTerm || invoice.paymentTerms);
      const count = Math.max(Number(config.count || 1), 1);
      const baseAmount = Math.floor((total / count) * 100) / 100;
      let remainder = Math.round((total - (baseAmount * count)) * 100) / 100;
      let paidRemaining = paidTotal;
      for (let i = 0; i < count; i += 1) {
        const scheduledAmount = Math.round((baseAmount + (i === count - 1 ? remainder : 0)) * 100) / 100;
        const paidAmount = Math.max(0, Math.min(scheduledAmount, paidRemaining));
        paidRemaining = Math.max(0, paidRemaining - paidAmount);
        const balanceDue = Math.max(0, Math.round((scheduledAmount - paidAmount) * 100) / 100);
        rows.push({
          schedule_id: `fallback:${invoice.id || invoice.invoice_id || invoice.invoice_number}:${i + 1}`,
          invoice_id: invoice.id || invoice.invoice_id || '',
          invoice_number: invoice.invoice_number || invoice.invoice_id || '',
          invoice_reference: invoice.invoice_number || invoice.invoice_id || 'Invoice',
          schedule_no: i + 1,
          schedule_label: `Payment ${i + 1}`,
          due_date: i === 0 ? dueDate : this.addMonthsToDateString_(dueDate, i * Number(config.monthsStep || 1)),
          scheduled_amount: scheduledAmount,
          paid_amount: paidAmount,
          balance_due: balanceDue,
          status: balanceDue <= 0 && paidAmount > 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
          currency: invoice.currency || 'USD',
          invoice_status: invoice.status || invoice.payment_state || '',
          reminder_enabled: false,
          raw: invoice
        });
      }
    });
    return rows;
  },
  renderScheduledPaymentsSection_(detailData = {}, client = {}) {
    const currency = this.normalizeCurrencyCode_(this.getClientCurrency_(client.client_id || this.state.selectedClientId));
    const clientId = client.client_id || this.state.selectedClientId;
    const scheduledSourceRows = Array.isArray(detailData.scheduledPayments) && detailData.scheduledPayments.length
      ? detailData.scheduledPayments
      : this.buildClientScheduledPaymentRowsFromInvoices_(clientId);
    const rows = scheduledSourceRows
      .map(row => this.normalizeScheduledPayment_(row))
      .sort((a, b) => {
        const timeA = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const timeB = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        if (timeA !== timeB) return timeA - timeB;
        return Number(a.schedule_no || 0) - Number(b.schedule_no || 0);
      });
    const filteredRows = this.getFilteredScheduledPaymentRows_(rows);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalScheduled = rows.reduce((sum, row) => sum + this.toNumberSafe(row.scheduled_amount), 0);
    const totalPaid = rows.reduce((sum, row) => sum + this.toNumberSafe(row.paid_amount), 0);
    const totalBalance = rows.reduce((sum, row) => sum + this.toNumberSafe(row.balance_due), 0);
    const overdueBalance = rows.reduce((sum, row) => {
      const due = row.due_date ? new Date(row.due_date) : null;
      return due && due < today ? sum + this.toNumberSafe(row.balance_due) : sum;
    }, 0);
    const nextDueDate = rows.find(row => {
      const due = row.due_date ? new Date(row.due_date) : null;
      return due && due >= today && this.toNumberSafe(row.balance_due) > 0;
    })?.due_date || '';
    if (E.clientScheduledPaymentCards) {
      E.clientScheduledPaymentCards.innerHTML = [
        ['Total Scheduled', this.formatMoneyWithCurrency_(totalScheduled, rows[0]?.currency || currency)],
        ['Total Paid', this.formatMoneyWithCurrency_(totalPaid, rows[0]?.currency || currency)],
        ['Total Balance Due', this.formatMoneyWithCurrency_(totalBalance, rows[0]?.currency || currency)],
        ['Overdue Balance', this.formatMoneyWithCurrency_(overdueBalance, rows[0]?.currency || currency)],
        ['Next Due Date', U.fmtDisplayDate(nextDueDate) || '—']
      ].map(([label, value]) => `<div class="card kpi"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`).join('');
    }
    if (E.clientScheduledPaymentFilters) {
      E.clientScheduledPaymentFilters.querySelectorAll('[data-scheduled-payment-filter]').forEach(btn => {
        const selected = btn.getAttribute('data-scheduled-payment-filter') === (this.state.scheduledPaymentsFilter || 'all');
        btn.classList.toggle('primary', selected);
        btn.classList.toggle('ghost', !selected);
      });
    }
    if (E.clientScheduledPaymentsTbody) {
      this.state.scheduledPaymentRowsById = new Map();
      rows.forEach(row => { if (row.schedule_id) this.state.scheduledPaymentRowsById.set(row.schedule_id, row); });
      E.clientScheduledPaymentsTbody.innerHTML = filteredRows.length
        ? filteredRows.map(row => {
          const badge = this.getScheduledPaymentBadge_(row);
          const reminders = row.reminder_enabled
            ? `Enabled · ${row.reminder_days.length ? row.reminder_days.join(', ') + ' days' : 'default days'}${row.reminder_user_ids.length ? ` · ${row.reminder_user_ids.length} user(s)` : ''}`
            : 'Disabled';
          const canReminder = Permissions.canPerformAction('invoice_payment_schedule', 'update') || Permissions.canPerformAction('invoices', 'update') || Permissions.canPerformAction('invoices', 'manage');
          const canReceipt = Permissions.canCreateReceiptFromInvoice() && this.toNumberSafe(row.balance_due) > 0;
          return `<tr>
            <td>${U.escapeHtml(row.invoice_reference || 'Invoice')}</td>
            <td>${U.escapeHtml(row.schedule_label || 'Payment')}</td>
            <td>${U.escapeHtml(U.fmtDisplayDate(row.due_date) || '—')}</td>
            <td>${U.escapeHtml(this.formatMoneyWithCurrency_(row.scheduled_amount, row.currency || currency))}</td>
            <td>${U.escapeHtml(row.payment_percent ? `${row.payment_percent}%` : '—')}</td>
            <td>${U.escapeHtml(this.formatMoneyWithCurrency_(row.paid_amount, row.currency || currency))}</td>
            <td>${U.escapeHtml(this.formatMoneyWithCurrency_(row.balance_due, row.currency || currency))}</td>
            <td><span class="chip ${U.escapeAttr(badge.className)}">${U.escapeHtml(badge.label)}</span></td>
            <td>${U.escapeHtml(reminders)}</td>
            <td>${U.escapeHtml(row.invoice_status || '—')}</td>
            <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${row.invoice_id && Permissions.canView('invoices') ? `<button class="btn ghost sm" type="button" data-invoice-view="${U.escapeAttr(row.invoice_id)}">Open Invoice</button>` : ''}
              ${canReminder ? `<button class="btn ghost sm" type="button" data-scheduled-payment-reminder="${U.escapeAttr(row.schedule_id)}">Configure Reminder</button>` : ''}
              ${canReceipt ? `<button class="btn ghost sm" type="button" data-scheduled-payment-receipt="${U.escapeAttr(row.schedule_id)}">Create Receipt</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')
        : '<tr><td colspan="11" class="muted" style="text-align:center;">No scheduled payments found for this client.</td></tr>';
    }
  },
  renderStatementSection_(detailData = {}) {
    const fallbackClient = this.state.rows.find(row => row.client_id === this.state.selectedClientId) || {};
    const baseStatementRows = Array.isArray(detailData.statementRows) && detailData.statementRows.length
      ? detailData.statementRows
      : this.buildClientStatementRows(fallbackClient);
    const rows = this.getFilteredStatementRows_(baseStatementRows);
    const clientCurrency = this.getClientCurrency_(this.state.selectedClientId);
    const totalInvoiced = rows.reduce((sum, item) => sum + this.toNumberSafe(item.debit), 0);
    const totalPaid = rows.reduce((sum, item) => sum + this.toNumberSafe(item.credit), 0);
    const totalDue = Math.max(totalInvoiced - totalPaid, 0);
    const lastPayment = rows.find(item => this.toNumberSafe(item.credit) > 0)?.date || '';
    const nextRenewal = ((Array.isArray(detailData.renewalRows) && detailData.renewalRows.length ? detailData.renewalRows : this.buildClientRenewalRows(fallbackClient)) || [])
      .map(item => item.service_end_date || item.renewal_date || item.renewal_due_date)
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
          : 'No invoice or receipt statement rows found.';
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
              <td>${U.escapeHtml(this.getStatementRowStatus(row))}</td>
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
            <td>${U.escapeHtml(this.getStatementRowStatus(row))}</td>
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
    const baseRows = Array.isArray(detailData.statementRows) && detailData.statementRows.length ? detailData.statementRows : this.buildClientStatementRows(client);
    const rows = this.getFilteredStatementRows_(baseRows);
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
    if (!this.canExportClientStatement()) { UI.toast('You do not have permission to export statements.'); return; }
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
    const fallbackClient = client && client.client_id ? client : (this.state.rows.find(row => row.client_id === this.state.selectedClientId) || {});
    let baseRenewalRows = Array.isArray(detailData.renewalRows) && detailData.renewalRows.length
      ? detailData.renewalRows
      : this.buildClientRenewalRows(fallbackClient);
    if (!baseRenewalRows.length) {
      const clientId = String(fallbackClient.client_id || this.state.selectedClientId || '').trim();
      baseRenewalRows = this.getInvoiceAnnualSaasRenewalRows({
        ...fallbackClient,
        client_id: clientId,
        invoices: this.listClientRelatedInvoices_(clientId),
        invoice_items: this.listClientRelatedInvoiceItems_(clientId)
      });
    }
    const rows = this.getFilteredRenewalRows_(baseRenewalRows);
    console.log('[client renewal source check]', baseRenewalRows.map(row => ({
      location: row.location_name,
      item: row.item_name || row.module_name,
      service_start_date: row.service_start_date,
      service_end_date: row.service_end_date,
      renewal_date: row.renewal_date,
      invoice_date: row.invoice_date,
      due_date: row.due_date
    })));
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
      this.state.renewalRowsById = new Map();
      rows.forEach(row => {
        row.row_id = row.row_id || this.getRenewalRowId_(row);
        this.state.renewalRowsById.set(row.row_id, row);
      });
      const selectedCount = rows.filter(row => this.state.selectedRenewalRowIds.has(row.row_id)).length;
      const bulkHtml = `<tr><td colspan="11"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><button class="btn primary sm" type="button" data-renew-selected ${selectedCount ? '' : 'disabled'}>Renew Selected</button><span class="muted">${selectedCount} selected</span></div></td></tr>`;
      E.clientRenewalsTbody.innerHTML = rows.length
        ? bulkHtml + rows
            .map(row => {
              const renewable = this.isRenewalRowRenewable_(row);
              const selected = this.state.selectedRenewalRowIds.has(row.row_id);
              return `<tr>
                <td>${renewable ? `<input type="checkbox" data-renew-select="${U.escapeHtml(row.row_id)}" ${selected ? 'checked' : ''} aria-label="Select renewal ${U.escapeHtml(row.location_name || '')}">` : ''}</td>
                <td>${U.escapeHtml(row.location_name || '—')}</td>
                <td>${U.escapeHtml(row.agreement_number || row.agreement_id || '—')}</td>
                <td>${U.escapeHtml(row.invoice_number || row.invoice_id || '—')}</td>
                <td>${U.escapeHtml(U.fmtDisplayDate(row.service_start_date) || '—')}</td>
                <td>${U.escapeHtml(U.fmtDisplayDate(row.service_end_date) || '—')}</td>
                <td>${U.escapeHtml(U.fmtDisplayDate(row.renewal_due_date || row.renewal_date) || (this.dateValueForSort_(row) ? '—' : 'Date not set'))}</td>
                <td>${U.escapeHtml(row.payment_status || this.getPaymentStatus(row) || '—')}</td>
                <td>${U.escapeHtml(row.renewal_status || this.getRenewalStatus(row) || '—')}</td>
                <td>${U.escapeHtml(this.formatCurrency_(this.getRenewalPrice_(row), row.currency || 'USD'))}</td>
                <td>${this.getRenewalActionLabel_(row)}</td>
              </tr>`;
            })
            .join('')
        : `<tr><td colspan="11" class="muted" style="text-align:center;">${U.escapeHtml(detailData.statementError ? 'Unable to load statement data.' : detailData.noLinkedRows ? 'No linked rows found. Check client ID/name mapping.' : 'No renewals or payments timeline rows.')}</td></tr>`;
    }
    if (E.clientRenewalEvents) {
      const milestones = this.getMilestoneValues_({ ...detailData, renewalRows: baseRenewalRows }, fallbackClient);
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
  async configureScheduledPaymentReminder_(row = {}) {
    if (!(Permissions.canPerformAction('invoice_payment_schedule', 'update') || Permissions.canPerformAction('invoices', 'update') || Permissions.canPerformAction('invoices', 'manage'))) {
      return UI.toast('You do not have permission to configure scheduled payment reminders.');
    }
    const currentDays = Array.isArray(row.reminder_days) && row.reminder_days.length ? row.reminder_days.join(',') : '30,14,7';
    const daysInput = window.prompt('Reminder days before due date (comma separated):', currentDays);
    if (daysInput === null) return;
    const usersInput = window.prompt('Reminder user IDs (comma separated, optional):', (row.reminder_user_ids || []).join(','));
    if (usersInput === null) return;
    const enabledInput = window.confirm('Enable reminders for this scheduled payment? Press Cancel to disable reminders.');
    try {
      await Api.updateInvoicePaymentScheduleReminder({
        schedule_id: row.schedule_id,
        reminder_enabled: enabledInput,
        reminder_days: String(daysInput || '').split(',').map(value => Number(value.trim())).filter(Number.isFinite),
        reminder_user_ids: String(usersInput || '').split(',').map(value => value.trim()).filter(Boolean)
      });
      if (this.state.selectedClientId) {
        this.invalidateClientTabCache(this.state.selectedClientId, ['scheduledPayments']);
        const { page, pageSize } = this.getClientTabPageState('scheduledPayments');
        await this.loadClientSubTab(this.state.selectedClientId, 'scheduledPayments', { page, pageSize, force: true });
      }
      this.render();
      UI.toast('Reminder settings saved.');
    } catch (error) {
      console.error('[Client Scheduled Payments] reminder save failed', error);
      UI.toast(error?.message || 'Unable to save reminder settings.');
    }
  },
  async createReceiptFromScheduledPayment_(row = {}) {
    if (!Permissions.canCreateReceiptFromInvoice()) return UI.toast('You do not have permission to create receipts.');
    if (this.toNumberSafe(row.balance_due) <= 0) return UI.toast('This scheduled payment has no open balance.');
    if (!window.Receipts?.openCreateFromInvoice) return UI.toast('Receipt form is not available right now. Please refresh and try again.');
    const invoice = this.state.invoices.find(item => String(item.id || item.invoice_id || '').trim() === String(row.invoice_id || '').trim()) || row.raw || {};
    await window.Receipts.openCreateFromInvoice({
      id: row.invoice_id,
      invoice_uuid: row.invoice_id,
      invoice_id: invoice.invoice_id || row.invoice_id,
      invoice_number: row.invoice_reference,
      company_id: invoice.company_id || '',
      company_name: invoice.company_name || invoice.client_name || '',
      client_id: invoice.client_id || '',
      customer_name: invoice.customer_name || invoice.client_name || '',
      customer_legal_name: invoice.customer_legal_name || invoice.client_name || '',
      currency: row.currency || invoice.currency || 'USD',
      invoice_total: invoice.invoice_total ?? invoice.grand_total ?? row.scheduled_amount,
      amount_paid: invoice.amount_paid ?? invoice.received_amount ?? row.paid_amount,
      balance_due: row.balance_due,
      payment_status: row.status || invoice.payment_status || invoice.payment_state || ''
    });
  },
  renderList() {
    if (!E.clientsTbody) return;
    if (this.state.loadError) {
      E.clientsTbody.innerHTML = `<tr><td colspan="9" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    if (this.state.loading && !this.state.filteredRows.length) {
      E.clientsTbody.innerHTML = '<tr><td colspan="9"><div class="skeleton" style="height:34px;"></div></td></tr>';
      return;
    }
    if (!this.state.filteredRows.length) {
      E.clientsTbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center;">No clients found.</td></tr>';
      return;
    }
    const snapshotRows = this.normalizeRenewalSnapshotRows(this.state.filteredRows);
    E.clientsTbody.innerHTML = snapshotRows
      .map(client => {
        const analytics = client.analytics || {};
        const activeClass = this.state.selectedClientId === client.client_id ? ' style="background:rgba(59,130,246,.08);"' : '';
        return `<tr data-client-row="${U.escapeAttr(client.client_id)}"${activeClass}>
          <td>${U.escapeHtml(client.customer_name || '—')} ${this.parseImportMeta_(client).is_historical_client ? '<span class="chip" style="margin-left:6px;">Historical Client</span>' : ''}</td>
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
    this.applyClientActionVisibility_();
    const detailData = this.state.detailCache[client.client_id] || {};
    const analytics = detailData.analytics || client.analytics || this.computeClientAnalytics_(client);
    if (E.clientStatementFiltersStatus) E.clientStatementFiltersStatus.value = this.state.statementFilters.status || 'all';
    if (E.clientStatementDateFrom) E.clientStatementDateFrom.value = this.state.statementFilters.dateFrom || '';
    if (E.clientStatementDateTo) E.clientStatementDateTo.value = this.state.statementFilters.dateTo || '';
    if (E.clientStatementSearchDoc) E.clientStatementSearchDoc.value = this.state.statementFilters.searchDoc || '';
    if (E.clientRenewalsDateFrom) E.clientRenewalsDateFrom.value = this.state.renewalsFilters.dateFrom || '';
    if (E.clientRenewalsDateTo) E.clientRenewalsDateTo.value = this.state.renewalsFilters.dateTo || '';
    const linkedCompany = this.resolveCompanyForClient(client, this.state);
    const primaryContact = this.getPrimaryContactForClient(client, this.state.contacts || [], this.state.companies || []);
    const title = this.getCompanyLegalDisplay(linkedCompany, client) || '—';
    const subtitle = String(linkedCompany?.company_name || linkedCompany?.companyName || '').trim();
    const subtitleValue = subtitle && this.normalizeText(subtitle) !== this.normalizeText(title) ? subtitle : '';
    if (E.clientDetailName) E.clientDetailName.textContent = title;
    if (E.clientDetailMeta) E.clientDetailMeta.textContent = `${subtitleValue || client.customer_legal_name || 'No legal name'} • ${this.buildContactPersonName(primaryContact) || 'No contact'} • ${(String(primaryContact?.email || primaryContact?.contact_email || '').trim()) || '—'}`;
    if (E.clientDetailStatus) E.clientDetailStatus.textContent = client.status || 'Unknown';
    if (E.clientDetailOverview) {
      const latestAgreement = this.resolveLatestAgreementContext_(client.client_id).preferred;
      const latestInvoice = this.listClientRelatedInvoices_(client.client_id)
        .slice().sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())[0];
      const billing = client.billing_frequency || client.billingFrequency || latestAgreement?.billing_frequency || latestAgreement?.billingFrequency || latestInvoice?.billing_frequency || latestInvoice?.billingFrequency || '—';
      const warning = linkedCompany ? '' : 'Company details are not linked yet. | ';
      const importMeta = this.parseImportMeta_(client); const importInfo = importMeta?.is_historical_client ? ` | Imported From: ${importMeta.imported_from || '—'} | Imported At: ${U.fmtDisplayDate(importMeta.imported_at) || '—'} | Imported By: ${importMeta.imported_by || '—'} | Legacy Client Ref: ${importMeta.legacy_client_ref || '—'}` : ''; E.clientDetailOverview.textContent = `${warning}Main Email: ${linkedCompany?.main_email || linkedCompany?.email || client.main_email || client.contact_email || '—'} | Main Phone: ${linkedCompany?.main_phone || linkedCompany?.phone || client.contact_phone || client.phone || '—'} | Country: ${linkedCompany?.country || client.country || '—'} | City: ${linkedCompany?.city || client.city || '—'} | Address: ${linkedCompany?.address || client.customer_address || client.address || '—'} | Billing: ${billing} | Tax: ${linkedCompany?.tax_number || linkedCompany?.taxNumber || linkedCompany?.vat_number || linkedCompany?.vatNumber || client.tax_number || '—'} | Industry: ${linkedCompany?.industry || client.industry || '—'} | Source: ${linkedCompany?.source || linkedCompany?.lead_source || client.source || '—'} | Notes: ${linkedCompany?.notes || client.notes || '—'} | Contact: ${this.buildContactPersonName(primaryContact) || '—'} | Contact Email: ${(String(primaryContact?.email || primaryContact?.contact_email || '').trim()) || '—'} | Contact Phone: ${(String(primaryContact?.phone || primaryContact?.mobile || primaryContact?.contact_phone || '').trim()) || '—'}${importInfo}`;
    }

    const displayCurrency = this.normalizeCurrencyCode_(analytics.currency || this.getClientCurrency_(client.client_id));
    const analyticsCards = [
      ['Locations', analytics.active_locations === null || analytics.active_locations === undefined
        ? `${analytics.total_locations || 0}`
        : `${analytics.total_locations || 0} (${analytics.active_locations || 0} active)`],
      ['Current Agreements', `${analytics.total_agreements || 0} (${analytics.signed_agreements || 0} total signed)`],
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
              <td>${item.id && Permissions.canView('agreements') ? `<button class="btn ghost sm" type="button" data-permission-resource="agreements" data-permission-action="view" data-agreement-view="${U.escapeAttr(item.id)}">Open</button>` : '—'}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="6" class="muted" style="text-align:center;">No agreements.</td></tr>';
    }
    if (E.clientRelatedInvoicesTbody) {
      E.clientRelatedInvoicesTbody.innerHTML = invoices.length
        ? invoices
            .map(item => `<tr>
              <td>${U.escapeHtml(item.invoice_number || item.invoice_id || item.id || '—')}</td>
              <td><span class="chip ${this.badgeClassFromInvoice_(item)}">${U.escapeHtml(item.status || item.payment_state || '—')}</span></td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(this.pickAmount_(item, ['grand_total', 'total_amount', 'amount', 'invoice_total']), item.currency || displayCurrency))}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(this.pickAmount_(item, ['amount_paid', 'paid_amount', 'received_amount']), item.currency || displayCurrency))}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(this.pickAmount_(item, ['pending_amount', 'balance_due', 'amount_due']), item.currency || displayCurrency))}</td>
              <td>${item.id && Permissions.canView('invoices') ? `<button class="btn ghost sm" type="button" data-permission-resource="invoices" data-permission-action="view" data-invoice-view="${U.escapeAttr(item.id)}">Open</button>` : '—'}</td>
            </tr>`)
            .join('')
        : '<tr><td colspan="6" class="muted" style="text-align:center;">No invoices.</td></tr>';
    }
    if (E.clientRelatedReceiptsTbody) {
      E.clientRelatedReceiptsTbody.innerHTML = receipts.length
        ? receipts
            .map(item => `<tr>
              <td>${U.escapeHtml(item.receipt_number || item.receipt_id || item.id || '—')}</td>
              <td>${U.escapeHtml(item.payment_state || item.status || '—')}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(this.pickAmount_(item, ['received_amount', 'amount_paid', 'paid_amount', 'amount', 'total_amount']), item.currency || displayCurrency))}</td>
              <td>${U.escapeHtml(this.formatMoneyWithCurrency_(this.pickAmount_(item, ['pending_amount', 'balance_due', 'amount_due']), item.currency || displayCurrency))}</td>
              <td>${item.id && Permissions.canView('receipts') ? `<button class="btn ghost sm" type="button" data-permission-resource="receipts" data-permission-action="view" data-receipt-view="${U.escapeAttr(item.id)}">Open</button>` : '—'}</td>
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
    const loadedTabs = this.state.loadedTabsByClient.get(client.client_id) || new Set(['overview']);
    if (this.state.activeDetailTab === 'statement' || loadedTabs.has('statement')) this.renderStatementSection_(detailData);
    if (this.state.activeDetailTab === 'renewals' || loadedTabs.has('renewals')) this.renderRenewalsSection_(detailData, client);
    if (this.state.activeDetailTab === 'scheduledPayments' || loadedTabs.has('scheduledPayments')) this.renderScheduledPaymentsSection_(detailData, client);
    this.setDetailTab(this.state.activeDetailTab === 'intelligence_hub' ? 'overview' : this.state.activeDetailTab, { skipLoad: true });
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
      const snapshotRows = this.normalizeRenewalSnapshotRows(this.state.rows);
      const allRenewals = snapshotRows.flatMap(client => this.buildClientRenewalRows(client));
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
    if (E.clientScheduledPaymentsTbody) {
      E.clientScheduledPaymentsTbody.innerHTML = '<tr><td colspan="10"><div class="skeleton" style="height:30px;"></div></td></tr>';
    }
  },
  async selectClient(clientId, options = {}) {
    const nextClientId = String(clientId || '').trim();
    const clientChanged = this.state.selectedClientId !== nextClientId;
    this.state.selectedClientId = nextClientId;
    this.state.activeDetailTab = 'overview';
    this.state.selectedRenewalRowIds = new Set();
    this.state.scheduledPaymentRowsById = new Map();
    if (clientChanged && nextClientId) {
      this.state.pagination.forEach((_, key) => { if (key.startsWith(`${nextClientId}:`)) this.state.pagination.delete(key); });
    }
    if (window.setAppHashRoute) setAppHashRoute(this.state.selectedClientId ? `#clients?id=${encodeURIComponent(this.state.selectedClientId)}` : "#clients");
    this.render();
    if (!this.state.selectedClientId) return;
    this.state.detailLoading = true;
    this.renderSubTabLoading('overview');
    try {
      await this.loadClientSubTab(this.state.selectedClientId, 'overview', { page: 1, pageSize: 25, force: options.force === true });
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
        status: this.state.status,
        allowClientMutations: this.canEditClient(),
        summaryOnly: false
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
      const linkedRows = this.mergeDashboardLinkedRowsIntoState_(clientsRes);
      this.state.agreements = linkedRows.agreements;
      this.state.agreementItems = linkedRows.agreementItems;
      this.state.invoices = linkedRows.invoices;
      this.state.invoiceItems = linkedRows.invoiceItems;
      this.state.receipts = linkedRows.receipts;
      this.state.receiptItems = linkedRows.receiptItems;
      this.state.companies = linkedRows.companies;
      this.state.contacts = linkedRows.contacts;
      this.rebuildCompanyLookupMaps(this.state.companies || []);
      this.state.contactsById = new Map((this.state.contacts || []).map(contact => [String(contact.id || contact.contact_id || '').trim(), contact]).filter(([id]) => id));
      this.state.rows = this.groupClientIntelligenceRows(this.state.rows, { log: false });
      this.state.rows = this.state.rows.map(row => ({ ...row, analytics: this.computeClientAnalytics_(row) }));
      if (this.state.selectedClientId && !this.state.rows.some(row => row.client_id === this.state.selectedClientId)) {
        const selectedGroup = this.state.rows.find(row => Array.isArray(row.source_client_ids) && row.source_client_ids.includes(this.state.selectedClientId));
        if (selectedGroup?.client_id) this.state.selectedClientId = selectedGroup.client_id;
      }
      this.state.initialized = true;
      if (this.state.selectedClientId && !this.state.rows.some(row => row.client_id === this.state.selectedClientId)) {
        this.state.selectedClientId = '';
        this.state.activeDetailTab = 'intelligence_hub';
      }
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.render();
    } catch (error) {
      this.state.rows = [];
      this.state.loadError = error?.message || 'Failed to load clients.';
      this.render();
    } finally {
      this.state.loading = false;
    }
  },
  triggerLinkedDataRefresh_(reason = 'linked-data-change') {
    console.debug('[Clients] linked data cache invalidation requested', reason);
    const clientId = this.state.selectedClientId;
    if (!clientId) return;
    this.invalidateClientTabCache(clientId, ['overview', 'statement', 'renewals', 'scheduledPayments', 'agreements', 'invoices', 'receipts']);
    const activeTab = this.state.activeDetailTab === 'intelligence_hub' ? 'overview' : this.state.activeDetailTab;
    const { page, pageSize } = this.getClientTabPageState(activeTab);
    this.loadClientSubTab(clientId, activeTab, { page, pageSize, force: true }).catch(error => console.warn('[Clients] active tab refresh after linked data change failed', error));
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

  createImportAnnualRow_() {
    return { item_type: 'annual_saas', item_name: '', catalog_item_id: null, license_quantity: 1, unit_price: 0, quantity: 12, service_start_date: '', service_end_date: '', discount_percent: 0, line_total: 0 };
  },
  createImportOneTimeRow_() {
    return { item_type: 'one_time_fee', item_name: '', catalog_item_id: null, quantity: 1, unit_price: 0, discount_percent: 0, line_total: 0 };
  },
  ensureImportOldAgreementState_() {
    if (!this.importOldAgreementState) this.importOldAgreementState = { annualSaasItems: [], oneTimeFeeItems: [] };
    return this.importOldAgreementState;
  },
  openImportOldClientModal() {
    const modal = E.importOldClientModal || document.getElementById('importOldClientModal');
    if (!modal) {
      console.warn('[Clients] Import Old Client Agreement modal is missing from the DOM.');
      UI.toast?.('Import modal is unavailable. Please refresh and try again.');
      return;
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    const firstInput = modal.querySelector('input, select, textarea, button');
    if (firstInput && typeof firstInput.focus === 'function') setTimeout(() => firstInput.focus(), 0);
    const state = this.ensureImportOldAgreementState_();
    if (!state.annualSaasItems.length) state.annualSaasItems.push(this.createImportAnnualRow_());
    if (!state.oneTimeFeeItems.length) state.oneTimeFeeItems.push(this.createImportOneTimeRow_());
    this.renderImportAgreementItems_();
  },
  closeImportOldClientModal() {
    const modal = E.importOldClientModal || document.getElementById('importOldClientModal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    const form = E.importOldClientForm || document.getElementById('importOldClientForm');
    if (form) form.reset();
    const annualTbody = document.getElementById('importOldAnnualItemsTbody');
    const oneTimeTbody = document.getElementById('importOldOneTimeItemsTbody');
    if (annualTbody) annualTbody.innerHTML = '';
    if (oneTimeTbody) oneTimeTbody.innerHTML = '';
    this.importOldAgreementState = { annualSaasItems: [], oneTimeFeeItems: [] };
  },
  collectImportOldClientFormData() {
    if (!E.importOldClientForm) return null;
    const fd = new FormData(E.importOldClientForm);
    const payload = {};
    fd.forEach((value, key) => {
      if (value instanceof File) {
        if (value.name) payload[key] = value;
        return;
      }
      payload[key] = String(value || '').trim();
    });
    payload.annual_saas_items_json = document.getElementById('importOldAnnualItemsJson')?.value || '[]';
    payload.one_time_fee_items_json = document.getElementById('importOldOneTimeItemsJson')?.value || '[]';
    return payload;
  },
  getImportCatalogRows_(section) {
    const rows = typeof window.ProposalCatalog?.getActiveCatalogItems === 'function'
      ? window.ProposalCatalog.getActiveCatalogItems(section)
      : Array.isArray(window.ProposalCatalog?.state?.rows) ? window.ProposalCatalog.state.rows : [];
    return rows.filter(row => String(row?.section || '').trim().toLowerCase() === section);
  },
  addImportItemRow_(section) {
    const state = this.ensureImportOldAgreementState_();
    if (section === 'annual_saas') state.annualSaasItems.push(this.createImportAnnualRow_());
    else state.oneTimeFeeItems.push(this.createImportOneTimeRow_());
    this.renderImportAgreementItems_();
  },
  renderImportAgreementItems_() {
    const state = this.ensureImportOldAgreementState_();
    const annualTbody = document.getElementById('importOldAnnualItemsTbody');
    const oneTimeTbody = document.getElementById('importOldOneTimeItemsTbody');
    if (!annualTbody || !oneTimeTbody) return;
    const optionsAnnual = this.getImportCatalogRows_('annual_saas').map(r => `<option value="${U.escapeAttr(r.item_name||'')}" data-id="${U.escapeAttr(r.id||'')}" data-price="${U.escapeAttr(r.unit_price ?? 0)}">${U.escapeHtml(r.item_name||'')}</option>`).join('');
    const optionsOne = this.getImportCatalogRows_('one_time_fee').map(r => `<option value="${U.escapeAttr(r.item_name||'')}" data-id="${U.escapeAttr(r.id||'')}" data-price="${U.escapeAttr(r.unit_price ?? 0)}">${U.escapeHtml(r.item_name||'')}</option>`).join('');
    annualTbody.innerHTML = state.annualSaasItems.map((row, i) => `<tr><td><input type="hidden" data-section="annual_saas" data-index="${i}" data-field="catalog_item_id" value="${U.escapeAttr(row.catalog_item_id||'')}"/><select class="input" data-section="annual_saas" data-index="${i}" data-field="item_name"><option value="">Select item…</option>${optionsAnnual}</select></td><td><input class="input" type="number" min="1" data-section="annual_saas" data-index="${i}" data-field="license_quantity" value="${row.license_quantity ?? 1}"/></td><td><input class="input" type="number" min="0" step="0.01" data-section="annual_saas" data-index="${i}" data-field="unit_price" value="${row.unit_price ?? 0}"/></td><td><input class="input" type="number" min="1" max="12" data-section="annual_saas" data-index="${i}" data-field="quantity" value="${row.quantity ?? 12}"/></td><td><input class="input" type="date" data-section="annual_saas" data-index="${i}" data-field="service_start_date" value="${U.escapeAttr(row.service_start_date||'')}"/></td><td><input class="input" type="date" data-section="annual_saas" data-index="${i}" data-field="service_end_date" value="${U.escapeAttr(row.service_end_date||'')}"/></td><td><input class="input" type="number" min="0" max="100" step="0.01" data-section="annual_saas" data-index="${i}" data-field="discount_percent" value="${row.discount_percent ?? 0}"/></td><td><input class="input" readonly value="${(Number(row.line_total||0)).toFixed(2)}"/></td><td><button type="button" class="btn ghost sm" data-import-agreement-action="remove-annual-saas-row" data-index="${i}">Remove</button></td></tr>`).join('');
    oneTimeTbody.innerHTML = state.oneTimeFeeItems.map((row, i) => `<tr><td><input type="hidden" data-section="one_time_fee" data-index="${i}" data-field="catalog_item_id" value="${U.escapeAttr(row.catalog_item_id||'')}"/><select class="input" data-section="one_time_fee" data-index="${i}" data-field="item_name"><option value="">Select item…</option>${optionsOne}</select></td><td><input class="input" type="number" min="1" data-section="one_time_fee" data-index="${i}" data-field="quantity" value="${row.quantity ?? 1}"/></td><td><input class="input" type="number" min="0" step="0.01" data-section="one_time_fee" data-index="${i}" data-field="unit_price" value="${row.unit_price ?? 0}"/></td><td><input class="input" type="number" min="0" max="100" step="0.01" data-section="one_time_fee" data-index="${i}" data-field="discount_percent" value="${row.discount_percent ?? 0}"/></td><td><input class="input" readonly value="${(Number(row.line_total||0)).toFixed(2)}"/></td><td><button type="button" class="btn ghost sm" data-import-agreement-action="remove-one-time-fee-row" data-index="${i}">Remove</button></td></tr>`).join('');
    annualTbody.querySelectorAll('select[data-field="item_name"]').forEach((el,i)=>el.value=state.annualSaasItems[i]?.item_name||'');
    oneTimeTbody.querySelectorAll('select[data-field="item_name"]').forEach((el,i)=>el.value=state.oneTimeFeeItems[i]?.item_name||'');
    const annualItems = state.annualSaasItems.map(r=>{const gross=(+r.unit_price||0)*(+r.license_quantity||1)*((+r.quantity||12)/12);const line=Math.max(0,gross-(gross*(+r.discount_percent||0)/100));r.line_total=line;return r;}).filter(r=>r.item_name||r.unit_price||r.line_total);
    const oneItems = state.oneTimeFeeItems.map(r=>{const gross=(+r.unit_price||0)*(+r.quantity||1);const line=Math.max(0,gross-(gross*(+r.discount_percent||0)/100));r.line_total=line;return r;}).filter(r=>r.item_name||r.unit_price||r.line_total);
    const a=annualItems.reduce((s,r)=>s+(+r.line_total||0),0), o=oneItems.reduce((s,r)=>s+(+r.line_total||0),0,);
    document.getElementById('importOldAnnualSubtotal').value = a.toFixed(2); document.getElementById('importOldOneTimeSubtotal').value=o.toFixed(2); document.getElementById('importOldGrandTotal').value=(a+o).toFixed(2);
    document.getElementById('importOldAnnualItemsJson').value=JSON.stringify(annualItems); document.getElementById('importOldOneTimeItemsJson').value=JSON.stringify(oneItems);
    const total = Number(E.importOldClientForm?.querySelector('[name="total_amount"]')?.value||0); const warning=document.getElementById('importOldTotalsWarning'); if (warning) warning.textContent = total>0 && Math.abs(total-(a+o))>0.01 ? 'Entered total amount does not match item totals. You can continue because this is a historical imported agreement.' : '';
  },
  bindImportOldClientAgreementFallback_() {
    if (document.body?.dataset?.importOldClientAgreementFallbackBound === 'true') return;
    if (document.body?.dataset) document.body.dataset.importOldClientAgreementFallbackBound = 'true';

    document.addEventListener('click', event => {
      const trigger = event.target?.closest?.('#importOldClientBtn, #agreementsImportOldClientBtn, [data-import-old-client-agreement]');
      if (!trigger) return;

      event.preventDefault();
      event.stopPropagation();

      if (!this.canImportOldClient()) {
        UI.toast?.('You do not have permission to import old client agreements.');
        return;
      }

      this.openImportOldClientModal();
    }, true);
  },
  async runClientAction(action) {
    const clientId = String(this.state.selectedClientId || '').trim();
    if (!clientId) {
      UI.toast('Select a client first.');
      return;
    }
    const client = this.state.rows.find(item => item.client_id === clientId);
    if (!client) return;
    if (!this.canRunClientAction_(action)) { UI.toast('You do not have permission for this client action.'); return; }
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
          if (!Permissions.canView('clients')) return UI.toast('You do not have permission to view clients.');
          const selectedId = String(row.getAttribute('data-client-row') || '').trim();
          this.selectClient(selectedId);
        }
      });
    }
    if (E.clientDetailTabButtons) {
      E.clientDetailTabButtons.addEventListener('click', event => {
        const trigger = event.target?.closest?.('[data-client-detail-tab]');
        if (!trigger) return;
        const tab = trigger.getAttribute('data-client-detail-tab');
        if (tab === 'statement' && !this.canViewClientStatement()) return UI.toast('You do not have permission to view client statements.');
        if (tab === 'renewals' && !this.canViewClientRenewals()) return UI.toast('You do not have permission to view renewals.');
        this.setDetailTab(tab);
      });
    }
    if (E.clientsDetailPanel) {
      E.clientsDetailPanel.addEventListener('click', event => {
        const pageBtn = event.target?.closest?.('[data-client-tab-page]');
        if (pageBtn) {
          const tabKey = this.normalizeClientTabKey(pageBtn.getAttribute('data-client-tab-page'));
          const page = Math.max(Number(pageBtn.getAttribute('data-page') || 1), 1);
          const { pageSize } = this.getClientTabPageState(tabKey);
          if (this.state.selectedClientId) this.loadClientSubTab(this.state.selectedClientId, tabKey, { page, pageSize, force: true });
          return;
        }
        const refreshBtn = event.target?.closest?.('[data-client-tab-refresh]');
        if (refreshBtn) {
          const tabKey = this.normalizeClientTabKey(refreshBtn.getAttribute('data-client-tab-refresh'));
          const { page, pageSize } = this.getClientTabPageState(tabKey);
          if (this.state.selectedClientId) this.loadClientSubTab(this.state.selectedClientId, tabKey, { page, pageSize, force: true });
        }
      });
      E.clientsDetailPanel.addEventListener('change', event => {
        const sizeSelect = event.target?.closest?.('[data-client-tab-page-size]');
        if (!sizeSelect) return;
        const tabKey = this.normalizeClientTabKey(sizeSelect.getAttribute('data-client-tab-page-size'));
        const pageSize = Math.max(Number(sizeSelect.value || 25), 1);
        if (this.state.selectedClientId) this.loadClientSubTab(this.state.selectedClientId, tabKey, { page: 1, pageSize, force: true });
      });
    }
    if (E.clientScheduledPaymentFilters) {
      E.clientScheduledPaymentFilters.addEventListener('click', event => {
        const trigger = event.target?.closest?.('[data-scheduled-payment-filter]');
        if (!trigger) return;
        this.state.scheduledPaymentsFilter = trigger.getAttribute('data-scheduled-payment-filter') || 'all';
        this.render();
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
        if (this.state.selectedClientId) {
          const { pageSize } = this.getClientTabPageState('statement');
          await this.loadClientSubTab(this.state.selectedClientId, 'statement', { page: 1, pageSize, force: true });
        }
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
        if (this.state.selectedClientId) {
          const { pageSize } = this.getClientTabPageState('statement');
          await this.loadClientSubTab(this.state.selectedClientId, 'statement', { page: 1, pageSize, force: true });
        }
        this.render();
      });
    }
    if (E.clientStatementExportPdfBtn) {
      E.clientStatementExportPdfBtn.setAttribute('data-permission-resource', 'clients');
      E.clientStatementExportPdfBtn.setAttribute('data-permission-action', 'statement_export');
      E.clientStatementExportPdfBtn.style.display = this.canExportClientStatement() ? '' : 'none';
      E.clientStatementExportPdfBtn.addEventListener('click', () => {
        if (!this.canExportClientStatement()) return UI.toast('You do not have permission to export client statements.');
        this.previewStatementPdf();
      });
    }
    if (E.clientStatementPreviewCloseBtn) {
      E.clientStatementPreviewCloseBtn.addEventListener('click', () => this.closeStatementPreviewModal());
    }
    if (E.clientStatementPreviewExportPdfBtn) {
      E.clientStatementPreviewExportPdfBtn.setAttribute('data-permission-resource', 'clients');
      E.clientStatementPreviewExportPdfBtn.setAttribute('data-permission-action', 'statement_export');
      E.clientStatementPreviewExportPdfBtn.addEventListener('click', () => {
        if (!this.canExportClientStatement()) return UI.toast('You do not have permission to export client statements.');
        this.exportStatementPdf();
      });
    }
    if (E.clientStatementPreviewModal) {
      E.clientStatementPreviewModal.addEventListener('click', event => {
        if (event.target === E.clientStatementPreviewModal) this.closeStatementPreviewModal();
      });
    }
    if (E.clientRenewalsApplyFiltersBtn) {
      E.clientRenewalsApplyFiltersBtn.addEventListener('click', async () => {
        this.state.renewalsFilters = { dateFrom: E.clientRenewalsDateFrom?.value || '', dateTo: E.clientRenewalsDateTo?.value || '' };
        if (this.state.selectedClientId) {
          const { pageSize } = this.getClientTabPageState('renewals');
          await this.loadClientSubTab(this.state.selectedClientId, 'renewals', { page: 1, pageSize, force: true });
        }
        this.render();
      });
    }
    if (E.clientRenewalsResetFiltersBtn) {
      E.clientRenewalsResetFiltersBtn.addEventListener('click', async () => {
        this.state.renewalsFilters = { dateFrom: '', dateTo: '' };
        if (E.clientRenewalsDateFrom) E.clientRenewalsDateFrom.value = '';
        if (E.clientRenewalsDateTo) E.clientRenewalsDateTo.value = '';
        if (this.state.selectedClientId) {
          const { pageSize } = this.getClientTabPageState('renewals');
          await this.loadClientSubTab(this.state.selectedClientId, 'renewals', { page: 1, pageSize, force: true });
        }
        this.render();
      });
    }
    if (E.clientRenewalsTbody) {
      E.clientRenewalsTbody.addEventListener('change', event => {
        const checkbox = event.target?.closest?.('[data-renew-select]');
        if (!checkbox) return;
        const rowId = String(checkbox.getAttribute('data-renew-select') || '').trim();
        const row = this.state.renewalRowsById?.get(rowId);
        if (!row || !this.isRenewalRowRenewable_(row)) {
          checkbox.checked = false;
          return UI.toast('This renewal line is not eligible for renewal.');
        }
        const currentlySelected = [...this.state.selectedRenewalRowIds].map(id => this.state.renewalRowsById.get(id)).filter(Boolean);
        const candidateRows = checkbox.checked ? [...currentlySelected, row] : currentlySelected.filter(item => item.row_id !== rowId);
        const validation = this.validateRenewalSelection_(candidateRows, { allowDifferentDates: true });
        if (!validation.ok) {
          checkbox.checked = false;
          return UI.toast(validation.message);
        }
        if (checkbox.checked) this.state.selectedRenewalRowIds.add(rowId);
        else this.state.selectedRenewalRowIds.delete(rowId);
        this.render();
      });
      E.clientRenewalsTbody.addEventListener('click', event => {
        const renewBtn = event.target?.closest?.('[data-renew-row]');
        if (renewBtn) {
          const rowId = String(renewBtn.getAttribute('data-renew-row') || '').trim();
          const row = this.state.renewalRowsById?.get(rowId);
          if (!row) return UI.toast('Renewal row was not found.');
          return this.openRenewalFlow_([row]);
        }
        const bulkBtn = event.target?.closest?.('[data-renew-selected]');
        if (bulkBtn) {
          const rows = [...this.state.selectedRenewalRowIds].map(id => this.state.renewalRowsById.get(id)).filter(Boolean);
          return this.openRenewalFlow_(rows);
        }
      });
    }
    if (E.clientsCreateBtn) {
      const canCreateClient = () => canAnyPermission([['clients','create'], ['clients','manage']]);
      E.clientsCreateBtn.style.display = canCreateClient() ? '' : 'none';
      E.clientsCreateBtn.disabled = !canCreateClient();
      E.clientsCreateBtn.addEventListener('click', () => {
        if (!canCreateClient()) return UI.toast('You do not have permission to create clients.');
        this.openNewClientModal();
      });
    }
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
        if (!canAnyPermission([['clients','create'], ['clients','manage']])) { UI.toast('You do not have permission to create clients.'); return; }
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
    if (E.importOldClientBtn) {
      E.importOldClientBtn.style.display = this.canImportOldClient() ? '' : 'none';
      E.importOldClientBtn.disabled = false;
      E.importOldClientBtn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.canImportOldClient()) return UI.toast('You do not have permission to import old client agreements.');
        this.openImportOldClientModal();
      });
    }
    this.bindImportOldClientAgreementFallback_();
    if (E.importOldClientCloseBtn) E.importOldClientCloseBtn.addEventListener('click', () => this.closeImportOldClientModal());
    if (E.importOldClientCancelBtn) E.importOldClientCancelBtn.addEventListener('click', () => this.closeImportOldClientModal());
    if (E.importOldClientModal) E.importOldClientModal.addEventListener('click', e => { if (e.target === E.importOldClientModal) this.closeImportOldClientModal(); });
    document.getElementById('importOldAddAnnualRowBtn')?.addEventListener('click', () => this.addImportItemRow_('annual_saas'));
    document.getElementById('importOldAddOneTimeRowBtn')?.addEventListener('click', () => this.addImportItemRow_('one_time_fee'));
    E.importOldClientForm?.addEventListener('click', event => {
      const actionEl = event.target?.closest?.('[data-import-agreement-action]');
      if (!actionEl) return;
      const action = actionEl.getAttribute('data-import-agreement-action');
      const state = this.ensureImportOldAgreementState_();
      const idx = Number(actionEl.getAttribute('data-index') || -1);
      if (action === 'add-annual-saas-row') this.addImportItemRow_('annual_saas');
      if (action === 'add-one-time-fee-row') this.addImportItemRow_('one_time_fee');
      if (action === 'remove-annual-saas-row' && idx >= 0) { state.annualSaasItems.splice(idx, 1); this.renderImportAgreementItems_(); }
      if (action === 'remove-one-time-fee-row' && idx >= 0) { state.oneTimeFeeItems.splice(idx, 1); this.renderImportAgreementItems_(); }
    });
    const handleImportItemFieldChange = event => {
      const input = event.target?.closest?.('[data-field]');
      if (!input) return;
      const section = input.getAttribute('data-section');
      const idx = Number(input.getAttribute('data-index') || -1);
      const field = input.getAttribute('data-field');
      if (idx < 0 || !field) return;
      const state = this.ensureImportOldAgreementState_();
      const list = section === 'annual_saas' ? state.annualSaasItems : state.oneTimeFeeItems;
      const row = list[idx]; if (!row) return;
      row[field] = input.type === 'number' ? (Number(input.value || 0) || 0) : input.value;
      if (field === 'item_name' && input.tagName === 'SELECT') {
        const opt = input.selectedOptions?.[0];
        row.catalog_item_id = opt?.getAttribute('data-id') || '';
        if (Number(row.unit_price || 0) <= 0) row.unit_price = Number(opt?.getAttribute('data-price') || 0) || 0;
      }
      this.renderImportAgreementItems_();
    };
    E.importOldClientForm?.addEventListener('change', handleImportItemFieldChange);
    E.importOldClientForm?.addEventListener('input', event => {
      if (event.target?.getAttribute?.('name') === 'total_amount') this.renderImportAgreementItems_();
      handleImportItemFieldChange(event);
    });
    if (E.importOldClientForm) E.importOldClientForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!this.canImportOldClient()) return UI.toast('You do not have permission to import old client agreements.');
      const submitBtn = E.importOldClientForm.querySelector('button[type="submit"]');
      const originalText = submitBtn?.textContent || '';
      try {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Importing…'; }
        const payload = this.collectImportOldClientFormData();
        const duplicates = await window.ClientsService.findOldClientImportDuplicates(payload);
        if (duplicates.length && !window.confirm(`Possible duplicate company found (${duplicates.length}). Continue and reuse/update existing company?`)) return;
        const result = await window.ClientsService.importOldClient(payload);
        if (result?.client) this.state.rows.unshift(this.normalizeClient(result.client));
        this.closeImportOldClientModal();
        await this.loadAndRefresh({ force: true });
        if (window.Agreements?.loadAndRefresh) window.Agreements.loadAndRefresh({ force: true }).catch(error => console.warn('[Clients] agreement refresh after historical import failed', error));
        UI.toast('Historical Company + Contact + Agreement imported without workflow automation.');
      } catch (error) {
        console.error('[Clients] historical agreement import failed', error);
        UI.toast(error?.message || 'Unable to import old client agreement.');
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText || 'Import Old Agreement'; }
      }
    });
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
        const reminderBtn = event.target?.closest?.('[data-scheduled-payment-reminder]');
        if (reminderBtn) {
          const rowId = reminderBtn.getAttribute('data-scheduled-payment-reminder');
          const row = this.state.scheduledPaymentRowsById?.get(rowId);
          if (!row) return UI.toast('Scheduled payment row was not found.');
          return this.configureScheduledPaymentReminder_(row);
        }
        const receiptFromScheduleBtn = event.target?.closest?.('[data-scheduled-payment-receipt]');
        if (receiptFromScheduleBtn) {
          const rowId = receiptFromScheduleBtn.getAttribute('data-scheduled-payment-receipt');
          const row = this.state.scheduledPaymentRowsById?.get(rowId);
          if (!row) return UI.toast('Scheduled payment row was not found.');
          return this.createReceiptFromScheduledPayment_(row);
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
