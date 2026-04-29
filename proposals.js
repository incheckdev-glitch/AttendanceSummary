const Proposals = {
  proposalFields: [
    'proposal_id',
    'ref_number',
    'created_at',
    'deal_id',
    'lead_id',
    'proposal_title',
    'proposal_date',
    'valid_until',
    'customer_name',
    'customer_address',
    'customer_contact_name',
    'customer_contact_mobile',
    'customer_contact_email',
    'provider_contact_name',
    'provider_contact_mobile',
    'provider_contact_email',
    'service_start_date',
    'contract_term',
    'account_number',
    'billing_frequency',
    'payment_term',
    'po_number',
    'currency',
    'saas_total',
    'one_time_total',
    'grand_total',
    'terms_conditions',
    'customer_signatory_name',
    'customer_signatory_title',
    'customer_sign_date',
    'provider_signatory_name',
    'provider_signatory_title',
    'provider_sign_date',
    'status',
    'generated_by',
    'updated_at'
  ],
  state: {
    rows: [],
    filteredRows: [],
    loading: false,
    loadError: '',
    loaded: false,
    lastLoadedAt: 0,
    cacheTtlMs: 2 * 60 * 1000,
    initialized: false,
    search: '',
    customer: '',
    status: 'All',
    kpiFilter: 'total',
    page: 1,
    limit: 50,
    offset: 0,
    total: 0,
    returned: 0,
    hasMore: false,
    formMode: 'create',
    formReadOnly: false,
    currentProposalId: '',
    currentItems: [],
    catalogLoading: false,
    saveInFlight: false,
    detailCacheById: {},
    detailCacheTtlMs: 90 * 1000,
    openingProposalIds: new Set(),
    rowActionInFlight: new Set()
  },
  toNumberSafe(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  normalizeDiscountPercentValue(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) continue;
        return this.toNumberSafe(trimmed.replace(/%/g, ''));
      }
      return this.toNumberSafe(value);
    }
    return 0;
  },
  getNormalizedItemDiscountPercent(item = {}) {
    const safe = item && typeof item === 'object' ? item : {};
    return this.normalizeDiscountPercentValue(
      safe.discount_percent,
      safe.discountPercent,
      safe.discount,
      safe.item_discount,
      safe.itemDiscount
    );
  },
  normalizeProposalItemForSave(item = {}) {
    const safe = item && typeof item === 'object' ? item : {};
    const unitPrice = this.toNumberSafe(safe.unit_price ?? safe.unitPrice);
    const quantity = Math.max(0, this.toNumberSafe(safe.quantity ?? safe.qty) || (safe.quantity === 0 ? 0 : 1));
    const discountPercent = this.getNormalizedItemDiscountPercent(safe);
    const computed = this.computeCommercialRow({
      unit_price: unitPrice,
      discount_percent: discountPercent,
      quantity
    });
    return {
      ...safe,
      discount_percent: discountPercent,
      discountPercent,
      unit_price: unitPrice,
      quantity,
      discounted_unit_price: this.toNumberSafe(
        safe.discounted_unit_price ?? safe.discountedUnitPrice ?? computed.discounted_unit_price
      ),
      line_total: this.toNumberSafe(safe.line_total ?? safe.lineTotal ?? computed.line_total),
      section: String(safe.section || safe.item_section || safe.type || '').trim().toLowerCase(),
      category: String(safe.category || '').trim(),
      type: String(safe.type || '').trim(),
      billing_frequency: String(safe.billing_frequency || safe.billingFrequency || '').trim(),
      is_recurring: this.normalizeTruthy(safe.is_recurring),
      is_saas: this.normalizeTruthy(safe.is_saas),
      one_time: this.normalizeTruthy(safe.one_time)
    };
  },
  normalizeDiscount(value) {
    const raw = this.toNumberSafe(value);
    if (raw > 1) return raw / 100;
    if (raw < 0) return 0;
    return raw;
  },
  normalizeTruthy(value) {
    if (typeof value === 'boolean') return value;
    const normalized = this.normalizeText(value);
    return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
  },
  normalizeSectionLabel(...values) {
    for (const value of values) {
      const normalized = this.normalizeText(value).replace(/[\s-]+/g, '_');
      if (normalized) return normalized;
    }
    return '';
  },
  classifyProposalItemBilling(item = {}) {
    const safe = item && typeof item === 'object' ? item : {};
    const section = this.normalizeSectionLabel(safe.section, safe.item_section);
    const category = this.normalizeSectionLabel(safe.category);
    const billingFrequency = this.normalizeSectionLabel(safe.billing_frequency, safe.billingFrequency);
    const type = this.normalizeSectionLabel(safe.type);
    const textHaystack = [
      section,
      category,
      billingFrequency,
      type,
      this.normalizeText(safe.item_name),
      this.normalizeText(safe.capability_name),
      this.normalizeText(safe.notes)
    ]
      .filter(Boolean)
      .join(' ');

    if (this.normalizeTruthy(safe.one_time)) return 'one_time';
    if (this.normalizeTruthy(safe.is_saas) || this.normalizeTruthy(safe.is_recurring)) return 'saas';

    const oneTimeTokens = [
      'one_time',
      'one_time_fee',
      'one_time_fees',
      'one_time_cost',
      'one_time_costs',
      'setup',
      'implementation',
      'hardware',
      'training',
      'professional_service',
      'service_fee'
    ];
    const recurringTokens = [
      'annual_saas',
      'saas',
      'subscription',
      'recurring',
      'annual',
      'monthly',
      'yearly'
    ];
    const hasToken = tokens => tokens.some(token => textHaystack.includes(token));
    if (hasToken(oneTimeTokens)) return 'one_time';
    if (hasToken(recurringTokens)) return 'saas';
    if (section === 'capability' || type === 'capability') return 'capability';
    return 'unclassified';
  },
  calculateProposalTotals(items = []) {
    const safeItems = Array.isArray(items) ? items : [];
    const totals = {
      subtotal: 0,
      subtotal_locations: 0,
      subtotal_one_time: 0,
      discount_total: 0,
      total_discount: 0,
      saas_total: 0,
      one_time_total: 0,
      grand_total: 0
    };
    safeItems.forEach(item => {
      const safe = item && typeof item === 'object' ? item : {};
      const sectionType = this.classifyProposalItemBilling(safe);
      if (sectionType === 'capability') return;

      const quantity = Math.max(
        0,
        this.toNumberSafe(safe.quantity ?? safe.qty) || (safe.quantity === 0 ? 0 : 1)
      );
      const unitPrice = this.toNumberSafe(safe.unit_price ?? safe.unitPrice);
      const discountPercent = this.getNormalizedItemDiscountPercent(safe);
      const base = quantity * unitPrice;
      const discountAmount = (base * discountPercent) / 100;
      const lineTotal = Math.max(0, base - discountAmount);

      totals.subtotal += base;
      totals.discount_total += discountAmount;
      totals.total_discount += discountAmount;
      totals.grand_total += lineTotal;

      if (sectionType === 'saas') {
        totals.saas_total += lineTotal;
        totals.subtotal_locations += lineTotal;
      } else {
        totals.one_time_total += lineTotal;
        totals.subtotal_one_time += lineTotal;
      }
    });
    return totals;
  },
  withCalculatedTotalsFallback(proposal = {}, items = []) {
    const normalizedProposal = this.normalizeProposal(proposal);
    const calculated = this.calculateProposalTotals(items);
    const headerSaas = this.toNumberSafe(
      normalizedProposal.saas_total ?? normalizedProposal.subtotal_locations
    );
    const headerOneTime = this.toNumberSafe(
      normalizedProposal.one_time_total ?? normalizedProposal.subtotal_one_time
    );
    const headerGrand = this.toNumberSafe(normalizedProposal.grand_total);
    const shouldFallback =
      calculated.grand_total > 0 &&
      headerGrand <= 0 &&
      headerSaas <= 0 &&
      headerOneTime <= 0;
    if (!shouldFallback) return normalizedProposal;

    return {
      ...normalizedProposal,
      saas_total: calculated.saas_total,
      one_time_total: calculated.one_time_total,
      subtotal_locations: calculated.saas_total,
      subtotal_one_time: calculated.one_time_total,
      total_discount: calculated.total_discount,
      grand_total: calculated.grand_total
    };
  },
  formatMoney(value) {
    const num = this.toNumberSafe(value);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  formatMoneyWithCurrency(value, currency = '', hasMixedCurrencies = false) {
    const numericValue = Number.isFinite(value) ? value : 0;
    if (currency && !hasMixedCurrencies) {
      let formatted = numericValue.toLocaleString(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2
      });
      if (formatted === 'NaN') formatted = `${currency} ${numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      return formatted;
    }
    return numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  },
  getProposalCustomerName(proposal = {}) {
    return (
      String(
        proposal.company_name ||
          proposal.client_name ||
          proposal.customer_name ||
          proposal.lead_company_name ||
          proposal.deal_company_name ||
          proposal.companyName ||
          proposal.clientName ||
          proposal.customerName ||
          proposal.full_name ||
          proposal.fullName ||
          'Customer'
      ).trim() || 'Customer'
    );
  },
  getProposalValue(proposal = {}, ...keys) {
    if (!proposal || typeof proposal !== 'object') return '';
    for (const key of keys) {
      if (!key) continue;
      if (proposal[key] !== undefined && proposal[key] !== null && String(proposal[key]).trim() !== '') {
        return proposal[key];
      }
    }
    return '';
  },
  formatDateMMDDYYYY(value) {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[2]}/${match[3]}/${match[1]}`;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
  },
  formatDateTimeMMDDYYYYHHMM(value) {
    if (!value) return '';
    const formatted = U.formatDateTimeMMDDYYYYHHMM(value);
    if (!formatted || formatted === '—' || formatted === 'Invalid Date') return '';
    return formatted;
  },
  csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  },
  downloadCsv(filename, csvText) {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },
  getFilteredProposalRows() {
    return Array.isArray(this.state.filteredRows) ? this.state.filteredRows : [];
  },
  exportProposalsCsv() {
    if (!Permissions.canPreviewProposal()) {
      UI.toast('You do not have permission to view proposals.');
      return;
    }
    const rows = this.getFilteredProposalRows();
    if (!rows.length) {
      UI.toast('No proposals match the current filters.');
      return;
    }
    const headers = [
      'Proposal ID',
      'Proposal Number',
      'Customer / Company',
      'Contact Name',
      'Email',
      'Phone',
      'Status',
      'Proposal Date',
      'Valid Until',
      'Subtotal Locations',
      'Subtotal One Time',
      'Discount Percent',
      'Discount Amount',
      'Proposal Total',
      'Currency',
      'Owner / Assigned To',
      'Approval Status',
      'Created At',
      'Updated At',
      'Notes'
    ];
    const lines = [
      headers.map(value => this.csvEscape(value)).join(','),
      ...rows.map(proposal => {
        const discountPercent = this.getProposalValue(proposal, 'discount_percent', 'discountPercent');
        const discountAmount = this.getProposalValue(
          proposal,
          'discount_amount',
          'discountAmount',
          'total_discount',
          'totalDiscount'
        );
        const subtotalLocations = this.getProposalValue(
          proposal,
          'subtotal_locations',
          'subtotalLocations',
          'saas_total',
          'saasTotal'
        );
        const subtotalOneTime = this.getProposalValue(
          proposal,
          'subtotal_one_time',
          'subtotalOneTime',
          'one_time_total',
          'oneTimeTotal'
        );
        const values = [
          this.getProposalValue(proposal, 'proposal_id', 'proposalId', 'id'),
          this.getProposalValue(proposal, 'proposal_number', 'proposalNumber', 'ref_number', 'refNumber'),
          this.getProposalCustomerName(proposal),
          this.getProposalValue(proposal, 'contact_name', 'contactName', 'customer_contact_name', 'customerContactName'),
          this.getProposalValue(proposal, 'email', 'customer_contact_email', 'customerContactEmail'),
          this.getProposalValue(proposal, 'phone', 'customer_contact_mobile', 'customerContactMobile'),
          this.getProposalValue(proposal, 'status'),
          this.formatDateMMDDYYYY(this.getProposalValue(proposal, 'proposal_date', 'proposalDate')),
          this.formatDateMMDDYYYY(
            this.getProposalValue(
              proposal,
              'proposal_valid_until',
              'proposalValidUntil',
              'valid_until',
              'validUntil'
            )
          ),
          subtotalLocations,
          subtotalOneTime,
          discountPercent,
          discountAmount,
          this.getProposalValue(proposal, 'proposal_total', 'proposalTotal', 'total', 'grand_total', 'grandTotal'),
          this.getProposalValue(proposal, 'currency'),
          this.getProposalValue(proposal, 'owner', 'assigned_to', 'assignedTo', 'generated_by', 'generatedBy'),
          this.getProposalValue(proposal, 'approval_status', 'approvalStatus'),
          this.formatDateTimeMMDDYYYYHHMM(this.getProposalValue(proposal, 'created_at', 'createdAt')),
          this.formatDateTimeMMDDYYYYHHMM(this.getProposalValue(proposal, 'updated_at', 'updatedAt')),
          this.getProposalValue(proposal, 'notes')
        ];
        return values.map(value => this.csvEscape(value)).join(',');
      })
    ];
    const now = new Date();
    const filename = `proposals-export-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.csv`;
    this.downloadCsv(filename, lines.join('\n'));
  },
  generateRefNumber() {
    return `${Date.now()}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;
  },
  generateProposalId() {
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
      date.getDate()
    ).padStart(2, '0')}`;
    const suffix = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, '0');
    return `PR-${stamp}-${suffix}`;
  },

  normalizeCompany(company = {}) {
    const c = company && typeof company === 'object' ? company : {};
    return {
      company_id: String(c.company_id || c.companyId || '').trim(),
      company_name: String(c.company_name || c.companyName || '').trim(),
      legal_name: String(c.legal_name || c.legalName || '').trim(),
      main_email: String(c.main_email || c.mainEmail || '').trim(),
      main_phone: String(c.main_phone || c.mainPhone || '').trim(),
      country: String(c.country || '').trim(),
      city: String(c.city || '').trim(),
      address: String(c.address || '').trim(),
      tax_number: String(c.tax_number || c.taxNumber || '').trim(),
      company_type: String(c.company_type || c.companyType || '').trim(),
      industry: String(c.industry || '').trim(),
      website: String(c.website || '').trim(),
      company_status: String(c.company_status || c.companyStatus || '').trim()
    };
  },
  normalizeContact(contact = {}) {
    const c = contact && typeof contact === 'object' ? contact : {};
    return { contact_id:String(c.contact_id||c.contactId||'').trim(), company_id:String(c.company_id||c.companyId||'').trim(), first_name:String(c.first_name||c.firstName||'').trim(), last_name:String(c.last_name||c.lastName||'').trim(), job_title:String(c.job_title||c.jobTitle||'').trim(), department:String(c.department||'').trim(), email:String(c.email||'').trim(), phone:String(c.phone||'').trim(), mobile:String(c.mobile||'').trim(), decision_role:String(c.decision_role||c.decisionRole||'').trim(), contact_status:String(c.contact_status||c.contactStatus||'').trim() };
  },
  buildContactDisplayName(contact = {}) {
    const first = String(contact.first_name || contact.firstName || '').trim();
    const last = String(contact.last_name || contact.lastName || '').trim();
    const name = [first, last].filter(Boolean).join(' ').trim();
    return name || String(contact.contact_name || contact.contactName || contact.full_name || contact.fullName || '').trim();
  },
  getContactPosition(contact = {}) {
    return String(contact.job_title || contact.jobTitle || contact.position || contact.title || '').trim();
  },
  isUsefulProviderValue(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    const lower = text.toLowerCase();
    return !['user', 'admin', 'viewer', 'dev', 'hoo', 'authenticated'].includes(lower);
  },
  firstUsefulProviderValue(...values) {
    for (const value of values) {
      if (this.isUsefulProviderValue(value)) return String(value).trim();
    }
    return '';
  },
  getSignedInUserForProposal() {
    const sessionApi = window.Session || {};
    const appState = window.AppState || {};
    const auth = window.Auth || {};

    const sessionUser =
      typeof sessionApi.user === 'function'
        ? sessionApi.user()
        : {};

    const sessionState = sessionApi.state || {};

    const authContext =
      typeof sessionApi.authContext === 'function'
        ? sessionApi.authContext()
        : {};

    const rawAuthUser =
      sessionState.user ||
      sessionUser.user ||
      authContext.user ||
      appState.user ||
      auth.user ||
      {};

    const profile =
      sessionState.profile ||
      sessionUser.profile ||
      authContext.profile ||
      appState.profile ||
      rawAuthUser.profile ||
      {};

    const displayNameFromMethod =
      typeof sessionApi.displayName === 'function'
        ? sessionApi.displayName()
        : '';

    const roleFromMethod =
      typeof sessionApi.role === 'function'
        ? sessionApi.role()
        : '';

    const usernameFromMethod =
      typeof sessionApi.username === 'function'
        ? sessionApi.username()
        : '';

    const isUseful = (value) => {
      const text = String(value || '').trim();
      if (!text) return false;

      const lower = text.toLowerCase();
      return ![
        'user',
        'admin',
        'viewer',
        'dev',
        'hoo',
        'authenticated',
        'null',
        'undefined'
      ].includes(lower);
    };

    const firstUseful = (...values) => {
      for (const value of values) {
        if (isUseful(value)) return String(value).trim();
      }
      return '';
    };

    const email = String(
      sessionUser.email ||
      sessionState.email ||
      rawAuthUser.email ||
      rawAuthUser.user_email ||
      rawAuthUser.userEmail ||
      profile.email ||
      profile.user_email ||
      profile.userEmail ||
      ''
    ).trim();

    const username = firstUseful(
      sessionUser.username,
      sessionState.username,
      usernameFromMethod,
      profile.username,
      profile.user_name,
      profile.userName,
      rawAuthUser.username,
      rawAuthUser.user_metadata?.username
    );

    const name =
      firstUseful(
        sessionUser.name,
        sessionState.name,
        displayNameFromMethod,
        profile.full_name,
        profile.fullName,
        profile.name,
        profile.display_name,
        profile.displayName,
        rawAuthUser.user_metadata?.full_name,
        rawAuthUser.user_metadata?.name,
        rawAuthUser.displayName,
        rawAuthUser.display_name,
        rawAuthUser.name,
        rawAuthUser.full_name,
        rawAuthUser.fullName,
        username
      ) ||
      (email ? email.split('@')[0] : '');

    const roleRaw = String(
      roleFromMethod ||
      sessionUser.role ||
      sessionState.role ||
      profile.role_name ||
      profile.roleName ||
      profile.role_label ||
      profile.roleLabel ||
      profile.role_key ||
      profile.roleKey ||
      profile.role ||
      rawAuthUser.role_name ||
      rawAuthUser.roleName ||
      rawAuthUser.role_key ||
      rawAuthUser.roleKey ||
      rawAuthUser.role ||
      ''
    ).trim();

    const roleLabelMap = {
      admin: 'Admin',
      dev: 'Dev',
      hoo: 'HOO',
      viewer: 'Viewer',
      client: 'Client'
    };

    const role =
      roleLabelMap[roleRaw.toLowerCase()] ||
      roleRaw
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

    const mobile = String(
      sessionUser.mobile ||
      sessionUser.phone ||
      sessionState.mobile ||
      sessionState.phone ||
      profile.mobile ||
      profile.phone ||
      profile.phone_number ||
      profile.phoneNumber ||
      rawAuthUser.phone ||
      rawAuthUser.phone_number ||
      rawAuthUser.phoneNumber ||
      ''
    ).trim();

    return {
      name,
      email,
      mobile,
      role
    };
  },
  applyProposalProviderSessionFields(target = {}) {
    const provider = this.getSignedInUserForProposal();
    if (window?.AppState?.debugMode) console.debug('[Proposal Provider Session]', provider);

    const providerName = provider.name || provider.email?.split('@')?.[0] || '';
    const providerEmail = provider.email || '';
    const providerMobile = provider.mobile || '';
    const providerRole = provider.role || '';

    const mapped = {
      ...target,

      provider_contact_name: providerName,
      providerContactName: providerName,

      provider_contact_email: providerEmail,
      providerContactEmail: providerEmail,

      provider_contact_mobile: providerMobile,
      providerContactMobile: providerMobile,

      provider_signatory_name: providerName,
      providerSignatoryName: providerName,

      provider_signatory_title: providerRole,
      providerSignatoryTitle: providerRole
    };

    return mapped;
  },
  getCurrentProviderContact() {
    const signedInUser = this.getSignedInUserForProposal();
    return { provider_contact_name: signedInUser.name, provider_contact_mobile: signedInUser.mobile, provider_contact_email: signedInUser.email };
  },
  hydrateMappedProposalFields(proposal = {}, selectedCompany = {}, selectedContact = {}) {
    const customerAddress = String(selectedCompany?.address || '').trim();
    const contactPersonName = this.buildContactDisplayName(selectedContact);
    const contactPosition = this.getContactPosition(selectedContact);
    return this.applyProposalProviderSessionFields({
      ...proposal,
      customer_address: customerAddress,
      customerAddress: customerAddress,
      customer_signatory_name: contactPersonName,
      customerSignatoryName: contactPersonName,
      customer_signatory_title: contactPosition,
      customerSignatoryTitle: contactPosition
    });
  },
  async getFullCompanyRecord(companyIdOrRecord) { const seed = typeof companyIdOrRecord === 'object' ? companyIdOrRecord : {}; const companyId = typeof companyIdOrRecord === 'object' ? (seed.company_id || seed.companyId) : companyIdOrRecord; const hasFullFields = seed.legal_name || seed.legalName || seed.company_type || seed.companyType || seed.industry || seed.website || seed.main_email || seed.mainEmail || seed.main_phone || seed.mainPhone || seed.country || seed.city || seed.address || seed.company_status || seed.companyStatus; if (hasFullFields) return this.normalizeCompany(seed); if (!companyId) return null; const response = await Api.requestWithSession('companies','list',{ filters:{ company_id: companyId }, limit:1 },{ requireAuth:true }); const rows = response?.rows || response?.items || response?.data || []; const row = Array.isArray(rows) ? rows[0] : rows; return row ? this.normalizeCompany(row) : null; },
  async getFullContactRecord(contactIdOrRecord) { const seed = typeof contactIdOrRecord === 'object' ? contactIdOrRecord : {}; const contactId = typeof contactIdOrRecord === 'object' ? (seed.contact_id || seed.contactId) : contactIdOrRecord; const hasFullFields = seed.first_name || seed.firstName || seed.last_name || seed.lastName || seed.job_title || seed.jobTitle || seed.department || seed.email || seed.phone || seed.mobile || seed.decision_role || seed.decisionRole || seed.contact_status || seed.contactStatus; if (hasFullFields) return this.normalizeContact(seed); if (!contactId) return null; const response = await Api.requestWithSession('contacts','list',{ filters:{ contact_id: contactId }, limit:1 },{ requireAuth:true }); const rows = response?.rows || response?.items || response?.data || []; const row = Array.isArray(rows) ? rows[0] : rows; return row ? this.normalizeContact(row) : null; },
  ensureProposalId(value = '') {
    const trimmed = String(value ?? '').trim();
    return trimmed || this.generateProposalId();
  },
  buildBusinessProposalIdentifiers(proposal = {}, { ensureProposalId = false, ensureRefNumber = false } = {}) {
    const source = proposal && typeof proposal === 'object' ? proposal : {};
    const identifiers = {};
    if (ensureProposalId) identifiers.proposal_id = this.ensureProposalId(source.proposal_id);
    if (ensureRefNumber) identifiers.ref_number = this.ensureRefNumber(source.ref_number);
    return identifiers;
  },
  sanitizeRefNumber(value = '') {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^\d+(?:\.0+)?$/.test(raw)) return raw.split('.')[0];
    const digitsOnly = raw.replace(/\D+/g, '');
    return digitsOnly;
  },
  ensureRefNumber(value = '') {
    const sanitized = this.sanitizeRefNumber(value);
    return sanitized || this.generateRefNumber();
  },
  normalizeProposal(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const normalized = {};
    this.proposalFields.forEach(field => {
      const camel = field.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
      const value = source[field] ?? source[camel] ?? '';
      normalized[field] = typeof value === 'string' ? value.trim() : value;
    });
    normalized.id = String(source.id || normalized.id || '').trim();
    normalized.proposal_id = String(
      normalized.proposal_id ||
      source.proposalId ||
      source.proposal_number ||
      source.proposalNumber ||
      ''
    ).trim();
    normalized.proposal_number = String(
      source.proposal_number ||
      source.proposalNumber ||
      normalized.ref_number ||
      source.refNumber ||
      ''
    ).trim();
    normalized.ref_number = this.ensureRefNumber(normalized.ref_number || normalized.proposal_number || '');
    normalized.proposal_title = String(normalized.proposal_title || '').trim();
    normalized.customer_name = String(normalized.customer_name || '').trim();
    normalized.status = String(normalized.status || '').trim();
    normalized.currency = String(normalized.currency || source.currency || '').trim();
    normalized.deal_id = String(normalized.deal_id || '').trim();
    normalized.deal_code = String(source.deal_code || source.dealCode || '').trim();
    if (!normalized.deal_code && normalized.deal_id) {
      const localRows = Array.isArray(window.Deals?.state?.rows) ? window.Deals.state.rows : [];
      const linkedDeal = localRows.find(row => String(row?.id || '').trim() === normalized.deal_id);
      normalized.deal_code = String(linkedDeal?.deal_id || '').trim();
    }
    normalized.proposal_valid_until = String(source.proposal_valid_until || source.proposalValidUntil || normalized.valid_until || '').trim();
    normalized.valid_until = String(normalized.valid_until || normalized.proposal_valid_until || '').trim();
    normalized.saas_total = this.toNumberSafe(
      source.subtotal_locations ?? source.subtotalLocations ?? normalized.saas_total
    );
    normalized.one_time_total = this.toNumberSafe(
      source.subtotal_one_time ?? source.subtotalOneTime ?? normalized.one_time_total
    );
    normalized.grand_total = this.toNumberSafe(source.grand_total ?? source.grandTotal ?? normalized.grand_total);
    normalized.total_discount = this.toNumberSafe(
      source.total_discount ?? source.totalDiscount ?? normalized.total_discount
    );
    normalized.agreement_id = String(source.agreement_id ?? source.agreementId ?? normalized.agreement_id ?? '').trim();
    normalized.generated_by = String(
      normalized.generated_by || source.generatedBy || source.created_by || source.createdBy || ''
    ).trim();
    return normalized;
  },
  hasConflictError(error, conflictCode = '') {
    const message = String(error?.message || '').toUpperCase();
    const code = String(conflictCode || '').trim().toUpperCase();
    return message.includes('HTTP 409') && (!code || message.includes(code));
  },
  isAgreementAlreadyCreated(row = {}) {
    const agreementId = String(row?.agreement_id || '').trim();
    if (agreementId) return true;
    const status = this.normalizeText(row?.status);
    return status.includes('agreement drafted') || status.includes('agreement created');
  },
  markDealAsConvertedToProposal(dealId, proposalId = '') {
    const id = String(dealId || '').trim();
    if (!id || !window.Deals?.state?.rows) return;
    const deal = window.Deals.state.rows.find(row => String(row?.id || '').trim() === id);
    if (!deal) return;
    window.Deals.upsertLocalRow?.({
      ...deal,
      proposal_id: String(proposalId || deal.proposal_id || '').trim(),
      proposal_needed: 'yes',
      stage: String(deal.stage || '').trim() || 'Proposal',
      status: String(deal.status || '').trim() || 'Proposal Created'
    });
  },
  async proposalDraftFromDeal(rawDeal = {}) {
    const deal = rawDeal && typeof rawDeal === 'object' ? rawDeal : {};
    const companyName = String(deal.company_name || deal.companyName || '').trim();
    const legalName = String(deal.legal_name || deal.legalName || companyName).trim();
    const fullName = String(deal.full_name || deal.fullName || '').trim();
    const serviceInterest = String(deal.service_interest || deal.serviceInterest || '').trim();
    const titleParts = [companyName || fullName, serviceInterest].filter(Boolean);
    const selectedCompany = await this.getFullCompanyRecord(deal.company_id || deal.companyId || {});
    const selectedContact = await this.getFullContactRecord(deal.contact_id || deal.contactId || {});
    const draft = {
      ...this.emptyProposal(),
      deal_id: String(deal.id || '').trim(),
      deal_code: String(deal.deal_id || deal.dealId || '').trim(),
      lead_id: String(deal.lead_id || deal.leadId || '').trim(),
      proposal_title: titleParts.length ? `${titleParts.join(' · ')} Proposal` : '',
      customer_name: legalName || companyName || fullName,
      customer_legal_name: legalName || companyName || fullName,
      customer_contact_name: fullName,
      customer_contact_mobile: String(deal.contact_phone || deal.contactPhone || deal.phone || '').trim(),
      customer_contact_email: String(deal.contact_email || deal.contactEmail || deal.email || '').trim(),
      company_id: String(deal.company_id || deal.companyId || '').trim(),
      company_name: String(deal.company_name || deal.companyName || '').trim(),
      contact_id: String(deal.contact_id || deal.contactId || '').trim(),
      contact_name: String(deal.contact_name || deal.contactName || fullName || '').trim(),
      contact_email: String(deal.contact_email || deal.contactEmail || deal.email || '').trim(),
      contact_phone: String(deal.contact_phone || deal.contactPhone || deal.phone || '').trim(),
      currency: String(deal.currency || '').trim(),
      company_id: String(selectedCompany?.company_id || deal.company_id || deal.companyId || '').trim(),
      company_name: String(selectedCompany?.company_name || deal.company_name || deal.companyName || '').trim(),
      contact_id: String(selectedContact?.contact_id || deal.contact_id || deal.contactId || '').trim(),
      contact_name: this.buildContactDisplayName(selectedContact || {}) || fullName,
      contact_email: String(selectedContact?.email || deal.contact_email || deal.contactEmail || deal.email || '').trim(),
      contact_phone: String(selectedContact?.mobile || selectedContact?.phone || deal.contact_phone || deal.contactPhone || deal.phone || '').trim(),
      contact_mobile: String(selectedContact?.mobile || '').trim(),
      customer_contact_name: this.buildContactDisplayName(selectedContact || {}) || fullName,
      customer_contact_mobile: String(selectedContact?.mobile || selectedContact?.phone || deal.contact_phone || deal.contactPhone || deal.phone || '').trim(),
      customer_contact_email: String(selectedContact?.email || deal.contact_email || deal.contactEmail || deal.email || '').trim()
    };
    return this.hydrateMappedProposalFields(draft, selectedCompany || {}, selectedContact || {});
  },
  async resolveDealForProposal(dealId) {
    const trimmedDealId = String(dealId || '').trim();
    if (!trimmedDealId) return null;

    const localRows = Array.isArray(window.Deals?.state?.rows) ? window.Deals.state.rows : [];
    const localMatch = localRows.find(row => String(row?.id || '').trim() === trimmedDealId);
    if (localMatch) return localMatch;

    if (typeof window.Deals?.getDeal === 'function') {
      try {
        const response = await window.Deals.getDeal(trimmedDealId);
        const candidate = response?.deal || response?.data?.deal || response?.result?.deal || response;
        if (candidate && typeof window.Deals.normalizeDeal === 'function') {
          return window.Deals.normalizeDeal(candidate);
        }
        return candidate && typeof candidate === 'object' ? candidate : null;
      } catch (_) {
        return null;
      }
    }
    return null;
  },
  resolveDealUuid(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const localRows = Array.isArray(window.Deals?.state?.rows) ? window.Deals.state.rows : [];
    const matchedDeal = localRows.find(
      row => String(row?.id || '').trim() === raw || String(row?.deal_id || '').trim() === raw
    );
    if (matchedDeal?.id) return String(matchedDeal.id).trim();
    return raw;
  },
  normalizeItem(raw = {}, sectionFallback = '') {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };
    const section = String(
      pick(source.section, source.item_section, source.type, sectionFallback)
    )
      .trim()
      .toLowerCase();
    const normalized = {
      id: String(source.id || '').trim(),
      item_id: String(pick(source.item_id, source.itemId)).trim(),
      proposal_id: String(pick(source.proposal_id, source.proposalId)).trim(),
      catalog_item_id: String(pick(source.catalog_item_id, source.catalogItemId)).trim(),
      section,
      category: String(pick(source.category)).trim(),
      type: String(pick(source.type)).trim(),
      billing_frequency: String(pick(source.billing_frequency, source.billingFrequency)).trim(),
      is_recurring: this.normalizeTruthy(pick(source.is_recurring, source.isRecurring)),
      is_saas: this.normalizeTruthy(pick(source.is_saas, source.isSaas)),
      one_time: this.normalizeTruthy(pick(source.one_time, source.oneTime)),
      line_no: this.toNumberSafe(pick(source.line_no, source.lineNo, source.line)) || 0,
      location_name: String(pick(source.location_name, source.locationName)).trim(),
      item_name: String(pick(source.item_name, source.itemName, source.name)).trim(),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.normalizeDiscountPercentValue(
        pick(
          source.discount_percent,
          source.discountPercent,
          source.discount,
          source.item_discount,
          source.itemDiscount
        )
      ),
      discounted_unit_price: this.toNumberSafe(
        pick(source.discounted_unit_price, source.discountedUnitPrice)
      ),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty, source.count)),
      line_total: this.toNumberSafe(pick(source.line_total, source.lineTotal)),
      capability_name: String(pick(source.capability_name, source.capabilityName)).trim(),
      capability_value: String(pick(source.capability_value, source.capabilityValue)).trim(),
      notes: String(pick(source.notes)).trim(),
      updated_at: pick(source.updated_at, source.updatedAt)
    };
    normalized.discountPercent = normalized.discount_percent;

    if (section === 'annual_saas' || section === 'one_time_fee') {
      const discountRatio = this.normalizeDiscount(normalized.discount_percent);
      if (!normalized.discounted_unit_price) {
        normalized.discounted_unit_price = normalized.unit_price * (1 - discountRatio);
      }
      if (!normalized.line_total) {
        normalized.line_total = normalized.discounted_unit_price * (normalized.quantity || 0);
      }
    }

    return normalized;
  },
  extractRows(response) {
    const candidates = [
      response,
      response?.proposals,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.proposals,
      response?.result?.proposals,
      response?.payload?.proposals
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  },
  extractListResult(response) {
    const rows = this.extractRows(response);
    if (response && typeof response === 'object' && Array.isArray(response.rows)) {
      const total = Number(response.total ?? rows.length) || rows.length;
      const returned = Number(response.returned ?? rows.length) || rows.length;
      const limit = Number(response.limit || this.state.limit || 50);
      const page = Number(response.page || this.state.page || 1);
      const offset = Number(response.offset ?? Math.max(0, (page - 1) * limit));
      const hasMore = response.hasMore !== undefined
        ? Boolean(response.hasMore)
        : offset + returned < total;
      return { rows: response.rows, total, returned, hasMore, page, limit, offset };
    }
    const limit = Number(this.state.limit || 50);
    const page = Number(this.state.page || 1);
    const returned = rows.length;
    const offset = Math.max(0, (page - 1) * limit);
    return { rows, total: offset + returned, returned, hasMore: false, page, limit, offset };
  },
  extractProposalAndItems(response, fallbackId = '') {
    const parseJsonIfNeeded = value => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
      try { return JSON.parse(trimmed); } catch { return value; }
    };

    const candidates = [
      response,
      response?.data,
      response?.result,
      response?.payload,
      response?.item,
      response?.proposal
    ];

    let proposal = null;
    let items = [];

    for (const rawCandidate of candidates) {
      const candidate = parseJsonIfNeeded(rawCandidate);
      if (!candidate) continue;

      if (Array.isArray(candidate)) {
        const first = candidate[0];
        if (!proposal && first && typeof first === 'object') {
          proposal = first;
        }
        if (!items.length && Array.isArray(first?.items)) {
          items = first.items;
        }
        continue;
      }

      if (typeof candidate !== 'object') continue;

      if (!proposal) {
        if (candidate.item && typeof candidate.item === 'object') proposal = candidate.item;
        else if (candidate.proposal && typeof candidate.proposal === 'object') proposal = candidate.proposal;
        else if (Array.isArray(candidate.data) && candidate.data[0] && typeof candidate.data[0] === 'object') proposal = candidate.data[0];
        else if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)) proposal = candidate.data;
        else if (
          candidate.proposal_id ||
          candidate.proposal_number ||
          candidate.ref_number ||
          candidate.proposal_title
        ) proposal = candidate;
      }

      if (!items.length) {
        if (Array.isArray(candidate.items)) items = candidate.items;
        else if (Array.isArray(candidate.proposal_items)) items = candidate.proposal_items;
        else if (candidate.item && Array.isArray(candidate.item.items)) items = candidate.item.items;
        else if (candidate.proposal && Array.isArray(candidate.proposal.items)) items = candidate.proposal.items;
        else if (Array.isArray(candidate.data) && Array.isArray(candidate.data[0]?.items)) items = candidate.data[0].items;
        else if (candidate.data && Array.isArray(candidate.data.items)) items = candidate.data.items;
      }
    }

    const normalizedItems = Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [];
    const normalizedProposal = this.withCalculatedTotalsFallback(proposal || { id: fallbackId }, normalizedItems);
    return {
      proposal: normalizedProposal,
      items: normalizedItems
    };
  },
  getCachedDetail(id) {
    const cacheKey = String(id || '').trim();
    if (!cacheKey) return null;
    const cached = this.state.detailCacheById[cacheKey];
    if (!cached) return null;
    if (Date.now() - Number(cached.cachedAt || 0) > this.state.detailCacheTtlMs) return null;
    return cached;
  },
  setCachedDetail(id, proposal, items) {
    const cacheKey = String(id || '').trim();
    if (!cacheKey) return;
    const normalizedItems = Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [];
    const normalizedProposal = this.withCalculatedTotalsFallback(proposal || { id: cacheKey }, normalizedItems);
    this.state.detailCacheById[cacheKey] = {
      proposal: normalizedProposal,
      items: normalizedItems,
      cachedAt: Date.now()
    };
  },
  setTriggerBusy(trigger, busy) {
    if (!trigger || !('disabled' in trigger)) return;
    trigger.disabled = !!busy;
  },
  setFormDetailLoading(loading) {
    if (!E.proposalForm) return;
    if (loading) E.proposalForm.setAttribute('data-detail-loading', 'true');
    else E.proposalForm.removeAttribute('data-detail-loading');
    if (E.proposalFormTitle) {
      const baseTitle = String(E.proposalFormTitle.textContent || '').replace(/\s+\u00b7\s+Loading details…$/, '').trim();
      E.proposalFormTitle.textContent = loading ? `${baseTitle || 'Proposal'} · Loading details…` : baseTitle;
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
  async listProposals(options = {}) {
    return Api.requestCached(
      'proposals',
      'list',
      {
        limit: Number(options.limit || 50),
        page: Number(options.page || 1),
        sort_by: options.sortBy || 'updated_at',
        sort_dir: options.sortDir || 'desc',
        search: this.state.search || '',
        summary_only: true
      },
      { forceRefresh: options.forceRefresh === true }
    );
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeProposal(row);
    const idx = this.state.rows.findIndex(item => String(item.id || '') === String(normalized.id || ''));
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.rerenderVisibleTable();
  },
  removeLocalRow(id) {
    this.state.rows = this.state.rows.filter(item => String(item.id || '') !== String(id || ''));
    this.rerenderVisibleTable();
  },
  rerenderVisibleTable() {
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  async getProposal(proposalId) {
    return Api.requestWithSession('proposals', 'get', { id: proposalId });
  },
  async createProposal(proposal, items) {
    const preparedProposal = this.buildProposalForPersist(proposal, items, { ensureBusinessProposalId: true });
    const preparedItems = (Array.isArray(items) ? items : []).map(item => this.normalizeProposalItemForSave(item));
    const response = await Api.requestWithSession('proposals', 'create', {
      proposal: this.prepareProposalForSave(preparedProposal),
      items: preparedItems
    });
    const recordId = Api.extractBusinessRecordId(response, preparedProposal.proposal_id || preparedProposal.ref_number || '');
    await Api.safeSendBusinessPwaPush({
      resource: 'proposals',
      action: 'proposal_created',
      recordId,
      title: 'Proposal created',
      body: 'Proposal ' + (preparedProposal.ref_number || preparedProposal.proposal_id || recordId || '') + ' was created.',
      roles: ['admin', 'hoo'],
      url: recordId ? '/#proposals?id=' + encodeURIComponent(recordId) : '/#proposals'
    });
    return response;
  },
  async saveProposal(proposal, items) {
    const preparedProposal = this.buildProposalForPersist(proposal, items, { ensureBusinessProposalId: true });
    const preparedItems = (Array.isArray(items) ? items : []).map(item => this.normalizeProposalItemForSave(item));
    const response = await Api.requestWithSession('proposals', 'save', {
      proposal: this.prepareProposalForSave(preparedProposal),
      items: preparedItems
    });
    const recordId = Api.extractBusinessRecordId(response, preparedProposal.id || preparedProposal.proposal_id || preparedProposal.ref_number || '');
    await Api.safeSendBusinessPwaPush({
      resource: 'proposals',
      action: preparedProposal.id ? 'proposal_updated' : 'proposal_created',
      recordId,
      title: preparedProposal.id ? 'Proposal updated' : 'Proposal created',
      body: 'Proposal ' + (preparedProposal.ref_number || preparedProposal.proposal_id || recordId || '') + ' was saved.',
      roles: ['admin', 'hoo'],
      url: recordId ? '/#proposals?id=' + encodeURIComponent(recordId) : '/#proposals'
    });
    return response;
  },
  async updateProposal(proposalId, updates, items) {
    const preparedUpdates = this.buildProposalForPersist(updates, items, { ensureBusinessProposalId: false });
    const preparedItems = (Array.isArray(items) ? items : []).map(item => this.normalizeProposalItemForSave(item));
    const preparedForSave = this.prepareProposalForSave(preparedUpdates);
    const response = await Api.requestWithSession('proposals', 'update', {
      id: proposalId,
      updates: preparedForSave,
      items: preparedItems
    });
    const statusKeys = ['status', 'proposal_status'];
    const isStatusUpdate = statusKeys.some(key => Object.prototype.hasOwnProperty.call(preparedForSave || {}, key));
    await Api.safeSendBusinessPwaPush({
      resource: 'proposals',
      action: isStatusUpdate ? 'proposal_status_changed' : 'proposal_updated',
      recordId: Api.extractBusinessRecordId(response, proposalId),
      title: isStatusUpdate ? 'Proposal status changed' : 'Proposal updated',
      body: 'Proposal ' + (proposalId || '') + ' was updated.',
      roles: ['admin', 'hoo'],
      url: proposalId ? '/#proposals?id=' + encodeURIComponent(proposalId) : '/#proposals'
    });
    return response;
  },
  normalizeDateForSave(value) {
    const trimmed = String(value ?? '').trim();
    return trimmed || null;
  },
  prepareProposalForSave(proposal = {}) {
    const sanitized = { ...(proposal && typeof proposal === 'object' ? proposal : {}) };
    [
      'proposal_date',
      'proposal_valid_until',
      'valid_until',
      'service_start_date',
      'customer_sign_date',
      'provider_sign_date'
    ].forEach(field => {
      if (Object.prototype.hasOwnProperty.call(sanitized, field)) {
        sanitized[field] = this.normalizeDateForSave(sanitized[field]);
      }
    });
    return sanitized;
  },
  buildProposalForPersist(proposal = {}, items = [], { ensureBusinessProposalId = false } = {}) {
    const base = { ...(proposal && typeof proposal === 'object' ? proposal : {}) };
    const totals = this.calculateTotalsFromItems(items);
    const proposalValidUntil = String(base.proposal_valid_until || base.valid_until || '').trim();
    const generatedByFallback = String(
      base.generated_by || Session?.state?.name || Session?.state?.email || Session?.state?.username || ''
    ).trim();
    const businessIdentifiers = this.buildBusinessProposalIdentifiers(base, {
      ensureProposalId: ensureBusinessProposalId,
      ensureRefNumber: ensureBusinessProposalId
    });
    return {
      ...base,
      ...businessIdentifiers,
      proposal_valid_until: proposalValidUntil,
      valid_until: proposalValidUntil,
      generated_by: generatedByFallback,
      ...totals
    };
  },
  async deleteProposal(proposalId) {
    return Api.requestWithSession('proposals', 'delete', { id: proposalId });
  },
  async createFromDeal(dealId) {
    const response = await Api.requestWithSession('proposals', 'create_from_deal', { id: dealId });
    const recordId = Api.extractBusinessRecordId(response, dealId);
    await Api.safeSendBusinessPwaPush({
      resource: 'proposals',
      action: 'proposal_created_from_deal',
      recordId,
      title: 'Proposal created from deal',
      body: 'Proposal was created from deal ' + (dealId || '') + '.',
      roles: ['admin', 'hoo'],
      url: recordId ? '/#proposals?id=' + encodeURIComponent(recordId) : '/#proposals'
    });
    return response;
  },
  async loadProposalPreviewData(proposalUuid) {
    const id = String(proposalUuid || '').trim();
    if (!id) throw new Error('Missing proposal UUID.');
    const client = window.SupabaseClient?.getClient?.();
    if (!client) throw new Error('Supabase client is not available.');

    let proposal = null;
    let proposalError = null;
    ({ data: proposal, error: proposalError } = await client.from('proposals').select('*').eq('id', id).maybeSingle());
    if (proposalError) {
      const fallback = await client.from('proposals').select('*').eq('proposal_id', id).maybeSingle();
      proposal = fallback.data || null;
      proposalError = fallback.error || null;
    }
    if (proposalError) throw new Error(`Unable to load proposal: ${proposalError.message || 'Unknown error'}`);
    if (!proposal) throw new Error('Proposal was not found.');

    const proposalRowId = String(proposal.id || id).trim();
    const { data: items, error: itemsError } = await client
      .from('proposal_items')
      .select('*')
      .eq('proposal_id', proposalRowId)
      .order('line_no', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true, nullsFirst: false });

    if (itemsError) throw new Error(`Unable to load proposal items: ${itemsError.message || 'Unknown error'}`);

    const normalizedItems = Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [];
    return {
      proposal: this.withCalculatedTotalsFallback(proposal, normalizedItems),
      items: normalizedItems
    };
  },
  buildProposalPreviewHtml(proposal = {}, items = []) {
    const proposalData = proposal && typeof proposal === 'object' ? proposal : {};
    const normalizedItems = (Array.isArray(items) ? items : []).map((item, index) => {
      const normalized = this.normalizeItem(item);
      if (!normalized.line_no) normalized.line_no = index + 1;
      return normalized;
    });
    const currency = String(proposalData.currency || 'USD').trim().toUpperCase();
    const money = value => this.formatMoneyWithCurrency(this.toNumberSafe(value), currency, false);
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
    const computeRow = item => {
      const quantity = this.toNumberSafe(item.quantity);
      const unitPrice = this.toNumberSafe(item.unit_price);
      const discountPercent = this.toNumberSafe(item.discount_percent);
      const discountRatio = this.normalizeDiscount(discountPercent);
      const discountedUnitPrice = this.toNumberSafe(item.discounted_unit_price) || unitPrice * (1 - discountRatio);
      const lineTotal = this.toNumberSafe(item.line_total) || discountedUnitPrice * quantity;
      return {
        quantity,
        unitPrice,
        discountPercent,
        discountedUnitPrice,
        lineTotal
      };
    };

    const subscriptionItems = normalizedItems.filter(item => this.classifyProposalItemBilling(item) === 'saas');
    const oneTimeItems = normalizedItems.filter(item => this.classifyProposalItemBilling(item) === 'one_time');
    const otherItems = normalizedItems.filter(item => {
      const type = this.classifyProposalItemBilling(item);
      return type !== 'saas' && type !== 'one_time' && type !== 'capability';
    });

    const renderSubscriptionRows = rows => (rows.length
      ? rows
          .map(item => {
            const computed = computeRow(item);
            return `<tr>
              <td class="cell-center">${textValue(item.line_no)}</td>
              <td>${textValue(item.location_name)}</td>
              <td class="cell-center">${dateValue(item.service_start_date || proposalData.service_start_date)}</td>
              <td class="cell-center">${dateValue(item.service_end_date)}</td>
              <td>${textValue(item.item_name || item.capability_name)}</td>
              <td class="cell-center">${computed.quantity ? U.escapeHtml(String(computed.quantity)) : '—'}</td>
              <td class="cell-right">${money(computed.unitPrice)}</td>
              <td class="cell-center">${U.escapeHtml(String(computed.discountPercent || 0))}%</td>
              <td class="cell-right">${money(computed.discountedUnitPrice)}</td>
              <td class="cell-right">${money(computed.lineTotal)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="10" class="cell-center muted">No SaaS / subscription items found.</td></tr>');

    const renderOneTimeRows = rows => (rows.length
      ? rows
          .map(item => {
            const computed = computeRow(item);
            return `<tr>
              <td class="cell-center">${textValue(item.line_no)}</td>
              <td>${textValue(item.location_name)}</td>
              <td>${textValue(item.item_name || item.capability_name)}</td>
              <td class="cell-center">${dateValue(item.service_start_date || proposalData.service_start_date)}</td>
              <td class="cell-center">${dateValue(item.service_end_date)}</td>
              <td class="cell-center">${computed.quantity ? U.escapeHtml(String(computed.quantity)) : '—'}</td>
              <td class="cell-right">${money(computed.unitPrice)}</td>
              <td class="cell-center">${U.escapeHtml(String(computed.discountPercent || 0))}%</td>
              <td class="cell-right">${money(computed.discountedUnitPrice)}</td>
              <td class="cell-right">${money(computed.lineTotal)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="10" class="cell-center muted">No one-time fee items found.</td></tr>');

    const calculatedTotals = this.calculateProposalTotals(normalizedItems);
    const headerSaas = this.toNumberSafe(proposalData.subtotal_locations ?? proposalData.saas_total);
    const headerOneTime = this.toNumberSafe(proposalData.subtotal_one_time ?? proposalData.one_time_total);
    const headerGrand = this.toNumberSafe(proposalData.grand_total);
    const hasCalculatedTotals = calculatedTotals.grand_total > 0;
    const subtotalLocations = hasCalculatedTotals ? calculatedTotals.saas_total : headerSaas;
    const subtotalOneTime = hasCalculatedTotals ? calculatedTotals.one_time_total : headerOneTime;
    const grandTotal = hasCalculatedTotals
      ? calculatedTotals.grand_total
      : this.toNumberSafe(headerGrand || subtotalLocations + subtotalOneTime);

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Proposal Preview · ${U.escapeHtml(String(proposalData.proposal_id || proposalData.id || ''))}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 18px; color: #111827; background: #f3f4f6; }
      .doc-sheet { max-width: 1020px; margin: 0 auto; background: #fff; border: 1px solid #d1d5db; padding: 22px; }
      .header-top { text-align: center; padding-bottom: 12px; border-bottom: 1px solid #111827; }
      .logo-title { margin: 0; font-size: 26px; letter-spacing: 0.04em; font-weight: 700; }
      .logo-subtitle { margin: 4px 0 0; color: #4b5563; font-size: 12px; }
      .doc-head { display: grid; grid-template-columns: 1fr 320px; gap: 24px; margin-top: 16px; align-items: start; }
      .doc-label { margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 0.02em; }
      .meta-box { border: 1px solid #111827; }
      .meta-row { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #d1d5db; }
      .meta-row:last-child { border-bottom: 0; }
      .meta-row > div { padding: 7px 10px; font-size: 12.5px; }
      .meta-row .meta-key { background: #f9fafb; font-weight: 700; border-right: 1px solid #d1d5db; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
      .info-box { border: 1px solid #111827; min-height: 132px; }
      .info-head { background: #f3f4f6; border-bottom: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
      .info-body { padding: 10px; font-size: 12.5px; line-height: 1.45; }
      .muted { color: #6b7280; }
      .section { margin-top: 18px; }
      .section h2 { margin: 0; font-size: 16px; border-bottom: 1px solid #111827; padding-bottom: 5px; }
      .section .subhead { font-size: 12px; margin: 6px 0 8px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.04em; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #111827; padding: 8px; font-size: 12px; vertical-align: middle; }
      th { text-align: center; background: #f9fafb; font-weight: 700; }
      .cell-center { text-align: center; vertical-align: middle; }
      .cell-right { text-align: right; vertical-align: middle; white-space: nowrap; }
      .total-row td { font-weight: 700; background: #f9fafb; }
      .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
      .totals-box { width: 380px; border: 1px solid #111827; }
      .totals-row { display: flex; justify-content: space-between; padding: 9px 10px; border-bottom: 1px solid #d1d5db; font-size: 13px; }
      .totals-row:last-child { border-bottom: 0; }
      .totals-row.grand { font-size: 15px; font-weight: 700; background: #f3f4f6; }
      .terms { margin-top: 14px; font-size: 12.5px; line-height: 1.5; border: 1px solid #111827; padding: 10px; }
      .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
      .signature-box { border: 1px solid #111827; min-height: 124px; }
      .signature-head { background: #f9fafb; border-bottom: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; font-weight: 700; }
      .signature-body { padding: 10px; font-size: 12px; line-height: 1.45; }
      .footer-note { margin-top: 14px; font-size: 11px; color: #4b5563; border-top: 1px solid #e5e7eb; padding-top: 8px; text-align: center; }
      @media print { body { margin: 0; padding: 0; background: #fff; } .doc-sheet { border: 0; max-width: none; } }
    </style>
  </head>
  <body>
    <div class="doc-sheet">
      <header class="header-top">
        <h1 class="logo-title">${textValue(this.getProposalCustomerName(proposalData))}</h1>
        <div class="logo-subtitle">${textValue(proposalData.provider_address || proposalData.provider_contact_email || 'Commercial Services')}</div>
      </header>

      <section class="doc-head">
        <div>
          <h2 class="doc-label">COMMERCIAL PROPOSAL</h2>
          <div class="muted" style="margin-top:6px;font-size:13px;">${textValue(proposalData.proposal_title || proposalData.proposal_id || proposalData.ref_number)}</div>
        </div>
        <div class="meta-box">
          <div class="meta-row"><div class="meta-key">Proposal ID</div><div>${textValue(proposalData.proposal_id || 'Missing ID')}</div></div>
          <div class="meta-row"><div class="meta-key">Reference #</div><div>${textValue(proposalData.ref_number)}</div></div>
          <div class="meta-row"><div class="meta-key">Proposal Date</div><div>${dateValue(proposalData.proposal_date)}</div></div>
          <div class="meta-row"><div class="meta-key">Valid Until</div><div>${dateValue(proposalData.proposal_valid_until || proposalData.valid_until)}</div></div>
          <div class="meta-row"><div class="meta-key">Status</div><div>${textValue(proposalData.status || 'Draft')}</div></div>
        </div>
      </section>

      <section class="info-grid">
        <div class="info-box">
          <div class="info-head">CUSTOMER DETAILS</div>
          <div class="info-body">
            <div><strong>${textValue(proposalData.customer_legal_name || proposalData.customer_name)}</strong></div>
            <div class="muted">${textValue(proposalData.customer_address)}</div>
            <div><strong>Contact:</strong> ${textValue(proposalData.customer_contact_name)}</div>
            <div><strong>Mobile:</strong> ${textValue(proposalData.customer_contact_mobile)}</div>
            <div><strong>Email:</strong> ${textValue(proposalData.customer_contact_email)}</div>
          </div>
        </div>
        <div class="info-box">
          <div class="info-head">PROVIDER DETAILS</div>
          <div class="info-body">
            <div><strong>Contact:</strong> ${textValue(proposalData.provider_contact_name)}</div>
            <div><strong>Mobile:</strong> ${textValue(proposalData.provider_contact_mobile)}</div>
            <div><strong>Email:</strong> ${textValue(proposalData.provider_contact_email)}</div>
            <div><strong>Service Start:</strong> ${dateValue(proposalData.service_start_date)}</div>
            <div><strong>Contract Term:</strong> ${textValue(proposalData.contract_term)}</div>
          </div>
        </div>
      </section>

      <section class="info-grid" style="margin-top:14px;">
        <div class="info-box">
          <div class="info-head">COMMERCIAL TERMS</div>
          <div class="info-body">
            <div><strong>Billing Frequency:</strong> ${textValue(proposalData.billing_frequency)}</div>
            <div><strong>Payment Term:</strong> ${textValue(proposalData.payment_term)}</div>
            <div><strong>PO Number:</strong> ${textValue(proposalData.po_number)}</div>
            <div><strong>Account Number:</strong> ${textValue(proposalData.account_number)}</div>
          </div>
        </div>
        <div class="info-box">
          <div class="info-head">DOCUMENT CONTROLS</div>
          <div class="info-body">
            <div><strong>Currency:</strong> ${textValue(currency)}</div>
            <div><strong>Generated By:</strong> ${textValue(proposalData.generated_by)}</div>
            <div><strong>Provider Sign Date:</strong> ${dateValue(proposalData.provider_sign_date)}</div>
            <div><strong>Customer Legal Address:</strong> ${textValue(proposalData.customer_address)}</div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Subscription Details</h2>
        <div class="subhead">SaaS / Subscription Rows</div>
        <table>
          <thead>
            <tr>
              <th style="width:6%">Line</th>
              <th style="width:15%">Location</th>
              <th style="width:11%">Service Start</th>
              <th style="width:11%">Service End</th>
              <th>Item / Module</th>
              <th style="width:7%">Qty</th>
              <th style="width:11%">Unit Price</th>
              <th style="width:8%">Discount</th>
              <th style="width:11%">Disc. Unit</th>
              <th style="width:12%">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${renderSubscriptionRows(subscriptionItems)}
            <tr class="total-row">
              <td colspan="9" class="cell-right">Total SaaS / Subscription</td>
              <td class="cell-right">${money(subtotalLocations)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="section">
        <h2>One Time Fees Details</h2>
        <div class="subhead">One Time Fee Rows</div>
        <table>
          <thead>
            <tr>
              <th style="width:6%">Line</th>
              <th style="width:16%">Location</th>
              <th>Service / Item</th>
              <th style="width:11%">Service Start</th>
              <th style="width:11%">Service End</th>
              <th style="width:7%">Qty</th>
              <th style="width:11%">Unit Price</th>
              <th style="width:8%">Discount</th>
              <th style="width:11%">Disc. Unit</th>
              <th style="width:12%">Line Total</th>
            </tr>
          </thead>
          <tbody>
            ${renderOneTimeRows(oneTimeItems.length ? oneTimeItems : otherItems)}
            <tr class="total-row">
              <td colspan="9" class="cell-right">Total One Time Fees</td>
              <td class="cell-right">${money(subtotalOneTime)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="totals-wrap">
        <div class="totals-box">
          <div class="totals-row"><span>One Time Fees</span><strong>${money(subtotalOneTime)}</strong></div>
          <div class="totals-row"><span>Subscription Fees</span><strong>${money(subtotalLocations)}</strong></div>
          <div class="totals-row grand"><span>Grand Total</span><strong>${money(grandTotal)}</strong></div>
        </div>
      </section>

      <section class="terms">
        <div><strong>Terms & Conditions:</strong></div>
        <div style="white-space: pre-wrap;">${textValue(proposalData.terms_conditions)}</div>
      </section>

      <section class="signature-grid">
        <div class="signature-box">
          <div class="signature-head">CUSTOMER SIGNATORY</div>
          <div class="signature-body">
            <div><strong>Name:</strong> ${textValue(proposalData.customer_signatory_name)}</div>
            <div><strong>Title:</strong> ${textValue(proposalData.customer_signatory_title)}</div>
            <div><strong>Sign Date:</strong> ${dateValue(proposalData.customer_sign_date)}</div>
          </div>
        </div>
        <div class="signature-box">
          <div class="signature-head">PROVIDER SIGNATORY</div>
          <div class="signature-body">
            <div><strong>Name:</strong> ${textValue(proposalData.provider_signatory_name)}</div>
            <div><strong>Title:</strong> ${textValue(proposalData.provider_signatory_title)}</div>
            <div><strong>Sign Date:</strong> ${dateValue(proposalData.provider_sign_date)}</div>
          </div>
        </div>
      </section>

      <footer class="footer-note">Proposal preview is print-ready and aligned to invoice document style.</footer>
    </div>
  </body>
</html>`;
  },
  applyFilters() {
    const terms = String(this.state.search || '')
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const customerTerms = String(this.state.customer || '')
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    this.state.filteredRows = this.state.rows.filter(row => {
      const status = String(row?.status || '').trim();
      if (this.state.status !== 'All' && status !== this.state.status) return false;
      if (!this.matchesKpiFilter(row)) return false;

      const hay = [
        row.proposal_id,
        row.ref_number,
        row.proposal_title,
        row.customer_name,
        row.deal_id,
        row.deal_code,
        row.status,
        row.currency,
        row.generated_by
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (terms.length && !terms.every(term => hay.includes(term))) return false;
      if (
        customerTerms.length &&
        !customerTerms.every(term => String(row.customer_name || '').toLowerCase().includes(term))
      )
        return false;
      return true;
    });
  },
  matchesKpiFilter(row = {}) {
    const filter = this.state.kpiFilter || 'total';
    const statusLabel = this.normalizeStatusLabel(row?.status);
    const grandTotal = this.toNumberSafe(row?.grand_total);
    const saasTotal = this.toNumberSafe(row?.saas_total);
    const oneTimeTotal = this.toNumberSafe(row?.one_time_total);
    if (filter === 'total') return true;
    if (filter === 'draft') return statusLabel === 'Draft';
    if (filter === 'sent') return statusLabel === 'Sent';
    if (filter === 'approved') return statusLabel === 'Approved';
    if (filter === 'rejected') return statusLabel === 'Rejected';
    if (filter === 'expired') return statusLabel === 'Expired';
    if (filter === 'unique-customers') return !!String(row?.customer_name || '').trim();
    if (filter === 'linked-deals') return !!String(row?.deal_id || '').trim();
    if (filter === 'avg-grand-total' || filter === 'grand-total') return grandTotal > 0;
    if (filter === 'saas-total') return saasTotal > 0;
    if (filter === 'one-time-total') return oneTimeTotal > 0;
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.applyFilters();
    this.render();
  },
  syncKpiCardState() {
    const cards = document.querySelectorAll('#proposalsAnalyticsGrid [data-kpi-filter]');
    cards.forEach(card => {
      const isActive = (card.getAttribute('data-kpi-filter') || 'total') === (this.state.kpiFilter || 'total');
      card.classList.toggle('kpi-filter-active', isActive);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  },
  normalizeStatusLabel(value = '') {
    const status = String(value || '')
      .trim()
      .toLowerCase();
    if (!status) return 'Unspecified';
    if (status.includes('draft')) return 'Draft';
    if (status.includes('sent') || status.includes('submitted')) return 'Sent';
    if (status.includes('approve') || status.includes('accept') || status.includes('won'))
      return 'Approved';
    if (status.includes('reject') || status.includes('declin') || status.includes('lost'))
      return 'Rejected';
    if (status.includes('expire')) return 'Expired';
    return String(value || '').trim() || 'Unspecified';
  },
  incrementMap(map, key) {
    const label = String(key || '').trim() || 'Unspecified';
    map[label] = (map[label] || 0) + 1;
  },
  buildTopBreakdown(map = {}, max = 7) {
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, max);
  },
  computeProposalAnalytics(proposals = []) {
    const rows = Array.isArray(proposals) ? proposals : [];
    const statusBreakdown = {};
    const currencyBreakdown = {};
    const generatedByBreakdown = {};
    const customers = new Set();
    const currencies = new Set();
    let draftCount = 0;
    let sentCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let expiredCount = 0;
    let linkedDeals = 0;
    let grandTotal = 0;
    let saasTotal = 0;
    let oneTimeTotal = 0;
    let rowsWithGrandTotal = 0;

    rows.forEach(row => {
      const statusLabel = this.normalizeStatusLabel(row?.status);
      if (statusLabel === 'Draft') draftCount += 1;
      if (statusLabel === 'Sent') sentCount += 1;
      if (statusLabel === 'Approved') approvedCount += 1;
      if (statusLabel === 'Rejected') rejectedCount += 1;
      if (statusLabel === 'Expired') expiredCount += 1;
      this.incrementMap(statusBreakdown, statusLabel);

      const grand = this.toNumberSafe(row?.grand_total);
      const saas = this.toNumberSafe(row?.saas_total);
      const oneTime = this.toNumberSafe(row?.one_time_total);
      grandTotal += grand;
      saasTotal += saas;
      oneTimeTotal += oneTime;
      if (grand > 0) rowsWithGrandTotal += 1;

      if (String(row?.deal_id || '').trim()) linkedDeals += 1;
      if (String(row?.customer_name || '').trim()) customers.add(String(row.customer_name).trim().toLowerCase());

      const currency = String(row?.currency || '')
        .trim()
        .toUpperCase();
      this.incrementMap(currencyBreakdown, currency || 'Unspecified');
      if (currency) currencies.add(currency);

      this.incrementMap(generatedByBreakdown, row?.generated_by || 'Unspecified');
    });

    return {
      total: rows.length,
      draftCount,
      sentCount,
      approvedCount,
      rejectedCount,
      expiredCount,
      uniqueCustomers: customers.size,
      linkedDeals,
      grandTotal,
      saasTotal,
      oneTimeTotal,
      avgGrandTotal: rowsWithGrandTotal > 0 ? grandTotal / rowsWithGrandTotal : 0,
      statusBreakdown: this.buildTopBreakdown(statusBreakdown, 10),
      currencyBreakdown: this.buildTopBreakdown(currencyBreakdown, 8),
      generatedByBreakdown: this.buildTopBreakdown(generatedByBreakdown, 8),
      pipelineCurrency: currencies.size === 1 ? [...currencies][0] : '',
      hasMixedCurrencies: currencies.size > 1
    };
  },
  renderDistribution(el, entries = [], total = 0) {
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = '<div class="muted">No data for current filters.</div>';
      return;
    }
    el.innerHTML = entries
      .map(([label, count]) => {
        const percent = total > 0 ? (count / total) * 100 : 0;
        return `<div class="deals-status-row">
          <div class="deals-status-label">${U.escapeHtml(label)}</div>
          <div class="leads-status-track"><span class="deals-status-fill" style="width:${Math.min(100, percent).toFixed(1)}%"></span></div>
          <div class="deals-status-meta">${count} · ${percent.toFixed(1)}%</div>
        </div>`;
      })
      .join('');
  },
  renderProposalAnalytics(analytics) {
    const safe = analytics || this.computeProposalAnalytics([]);
    const setText = (el, value) => {
      if (el) el.textContent = value;
    };
    setText(E.proposalsKpiTotal, String(safe.total || 0));
    setText(E.proposalsKpiDraft, String(safe.draftCount || 0));
    setText(E.proposalsKpiSent, String(safe.sentCount || 0));
    setText(E.proposalsKpiApproved, String(safe.approvedCount || 0));
    setText(E.proposalsKpiRejected, String(safe.rejectedCount || 0));
    setText(E.proposalsKpiExpired, String(safe.expiredCount || 0));
    setText(E.proposalsKpiUniqueCustomers, String(safe.uniqueCustomers || 0));
    setText(E.proposalsKpiLinkedDeals, String(safe.linkedDeals || 0));
    setText(
      E.proposalsKpiAvgGrandTotal,
      this.formatMoneyWithCurrency(safe.avgGrandTotal, safe.pipelineCurrency, safe.hasMixedCurrencies)
    );
    setText(
      E.proposalsKpiGrandTotal,
      this.formatMoneyWithCurrency(safe.grandTotal, safe.pipelineCurrency, safe.hasMixedCurrencies)
    );
    setText(
      E.proposalsKpiSaasTotal,
      this.formatMoneyWithCurrency(safe.saasTotal, safe.pipelineCurrency, safe.hasMixedCurrencies)
    );
    setText(
      E.proposalsKpiOneTimeTotal,
      this.formatMoneyWithCurrency(safe.oneTimeTotal, safe.pipelineCurrency, safe.hasMixedCurrencies)
    );

    const currencySuffix = safe.pipelineCurrency && !safe.hasMixedCurrencies
      ? ` (${safe.pipelineCurrency})`
      : safe.hasMixedCurrencies
        ? ' (mixed currencies)'
        : '';
    setText(E.proposalsKpiGrandTotalSub, `Sum of grand total${currencySuffix}`);
    setText(E.proposalsKpiSaasTotalSub, `Sum of SaaS totals${currencySuffix}`);
    setText(E.proposalsKpiOneTimeTotalSub, `Sum of one-time totals${currencySuffix}`);
    this.syncKpiCardState();
    this.renderDistribution(E.proposalsStatusDistribution, safe.statusBreakdown, safe.total || 0);
    this.renderDistribution(E.proposalsCurrencyDistribution, safe.currencyBreakdown, safe.total || 0);
    this.renderDistribution(E.proposalsGeneratedByDistribution, safe.generatedByBreakdown, safe.total || 0);
  },
  renderFilters() {
    const statusValues = [...new Set(this.state.rows.map(row => String(row.status || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    if (E.proposalsStatusFilter) {
      const options = ['All', ...statusValues];
      E.proposalsStatusFilter.innerHTML = options.map(v => `<option>${U.escapeHtml(v)}</option>`).join('');
      E.proposalsStatusFilter.value = options.includes(this.state.status) ? this.state.status : 'All';
    }
    if (E.proposalsSearchInput) E.proposalsSearchInput.value = this.state.search;
    if (E.proposalsCustomerFilter) E.proposalsCustomerFilter.value = this.state.customer;
    if (E.proposalsExportCsvBtn) {
      const canView = Permissions.canPreviewProposal();
      E.proposalsExportCsvBtn.style.display = canView ? '' : 'none';
      E.proposalsExportCsvBtn.disabled = this.state.loading || !canView;
    }
  },
  render() {
    if (!E.proposalsState || !E.proposalsTbody) return;

    if (this.state.loading) {
      E.proposalsState.textContent = 'Loading proposals…';
      this.renderProposalAnalytics(this.computeProposalAnalytics([]));
      E.proposalsTbody.innerHTML = '<tr><td colspan="14" class="muted" style="text-align:center;">Loading proposals…</td></tr>';
      return;
    }

    if (this.state.loadError) {
      E.proposalsState.textContent = this.state.loadError;
      this.renderProposalAnalytics(this.computeProposalAnalytics([]));
      E.proposalsTbody.innerHTML = `<tr><td colspan="14" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(
        this.state.loadError
      )}</td></tr>`;
      return;
    }

    const rows = this.state.filteredRows;
    this.renderProposalAnalytics(this.computeProposalAnalytics(rows));
    E.proposalsState.textContent = `${rows.length} proposal${rows.length === 1 ? '' : 's'} · page ${this.state.page}`;
    const paginationHost = U.ensurePaginationHost({ hostId: 'proposalsPaginationControls', anchor: E.proposalsState });
    U.renderPaginationControls({
      host: paginationHost,
      moduleKey: 'proposals',
      page: this.state.page,
      pageSize: this.state.limit,
      hasMore: this.state.hasMore,
      returned: this.state.returned,
      loading: this.state.loading,
      onPageChange: nextPage => {
        this.state.page = Math.max(1, nextPage);
        this.loadAndRefresh({ force: true });
      },
      onPageSizeChange: nextSize => {
        this.state.limit = Math.max(1, Math.min(200, Number(nextSize) || 50));
        this.state.page = 1;
        this.loadAndRefresh({ force: true });
      }
    });
    if (!rows.length) {
      E.proposalsTbody.innerHTML =
        '<tr><td colspan="14" class="muted" style="text-align:center;">No proposals found.</td></tr>';
      return;
    }

    const textCell = value => U.escapeHtml(String(value ?? '').trim() || '—');
    const proposalIdCell = row => {
      const displayValue = String(row?.proposal_id || row?.proposalId || '').trim();
      return U.escapeHtml(displayValue || 'Missing ID');
    };

    E.proposalsTbody.innerHTML = rows
      .map(row => {
        const id = U.escapeAttr(row.id || '');
        return `<tr>
          <td>${proposalIdCell(row)}</td>
          <td>${textCell(row.ref_number)}</td>
          <td>${textCell(row.proposal_title)}</td>
          <td>${textCell(row.customer_name)}</td>
          <td>${textCell(row.deal_code || row.deal_id)}</td>
          <td>${textCell(row.status)}</td>
          <td>${textCell(row.currency)}</td>
          <td>${this.formatMoney(row.saas_total)}</td>
          <td>${this.formatMoney(row.one_time_total)}</td>
          <td>${this.formatMoney(row.grand_total)}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.proposal_date))}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.valid_until))}</td>
          <td>${textCell(row.generated_by)}</td>
          <td>
            <button class="btn ghost sm" type="button" data-proposal-view="${id}">View</button>
            ${Permissions.canUpdateProposal() ? `<button class="btn ghost sm" type="button" data-proposal-edit="${id}">Edit</button>` : ''}
            ${Permissions.canPreviewProposal() ? `<button class="btn ghost sm" type="button" data-proposal-preview="${id}">Preview</button>` : ''}
            ${Permissions.canCreateAgreementFromProposal() && !this.isAgreementAlreadyCreated(row)
              ? `<button class="btn ghost sm" type="button" data-proposal-convert-agreement="${id}">Convert to Agreement</button>`
              : ''}
            ${Permissions.canDeleteProposal() ? `<button class="btn ghost sm" type="button" data-proposal-delete="${id}">Delete</button>` : ''}
          </td>
        </tr>`;
      })
      .join('');
  },
  async loadAndRefresh({ force = false } = {}) {
    if (!Session.isAuthenticated()) return;
    if (this.state.loading && !force) return;
    const hasWarmCache = this.state.loaded && Date.now() - this.state.lastLoadedAt <= this.state.cacheTtlMs;
    if (hasWarmCache && !force) {
      this.rerenderVisibleTable();
      return;
    }
    this.state.loading = true;
    this.state.loadError = '';
    this.render();

    try {
      const response = await this.listProposals({ forceRefresh: force, page: this.state.page, limit: this.state.limit });
      const normalizedList = this.extractListResult(response);
      this.state.rows = normalizedList.rows.map(raw => this.normalizeProposal(raw));
      this.state.total = normalizedList.total;
      this.state.returned = normalizedList.returned;
      this.state.hasMore = normalizedList.hasMore;
      this.state.page = normalizedList.page;
      this.state.limit = normalizedList.limit;
      this.state.offset = normalizedList.offset;
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.renderFilters();
      this.applyFilters();
      this.render();
    } catch (error) {
      if (typeof isPermissionError === 'function' && isPermissionError(error)) {
        console.log('[auth-check] permission error preserved session', error?.message);
        this.state.rows = [];
        this.state.filteredRows = [];
        this.state.loadError = 'Proposals are not available for your role.';
        this.render();
        return;
      }
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      this.state.rows = [];
      this.state.filteredRows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load proposals.';
      this.render();
      UI.toast(this.state.loadError);
    } finally {
      this.state.loading = false;
      this.render();
    }
  },
  emptyProposal() {
    return {
      proposal_id: this.generateProposalId(),
      ref_number: this.generateRefNumber(),
      proposal_title: '',
      deal_id: '',
      lead_id: '',
      proposal_date: '',
      valid_until: '',
      status: 'Draft',
      currency: '',
      customer_name: '',
      customer_address: '',
      customer_contact_name: '',
      customer_contact_mobile: '',
      customer_contact_email: '',
      provider_contact_name: '',
      provider_contact_mobile: '',
      provider_contact_email: '',
      service_start_date: '',
      contract_term: '',
      account_number: '',
      billing_frequency: 'Annual',
      payment_term: 'Net 30',
      po_number: '',
      customer_signatory_name: '',
      customer_signatory_title: '',
      customer_sign_date: '',
      provider_signatory_name: '',
      provider_signatory_title: '',
      provider_sign_date: '',
      terms_conditions: ''
    };
  },
  generateAccountNumber() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}`;
    const randomPart = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `ACC-${datePart}-${randomPart}`;
  },
  ensureAccountNumber(value = '') {
    const trimmed = String(value || '').trim();
    return trimmed || this.generateAccountNumber();
  },
  resetForm() {
    if (!E.proposalForm) return;
    E.proposalForm.reset();
    if (E.proposalFormProposalId) E.proposalFormProposalId.value = '';
    E.proposalForm.dataset.refNumber = '';
    this.state.currentProposalId = '';
    this.state.currentItems = [];
    if (E.proposalFormDeleteBtn) E.proposalFormDeleteBtn.style.display = 'none';
    if (E.proposalFormSaveBtn) E.proposalFormSaveBtn.disabled = false;
    if (E.proposalFormPreviewBtn) E.proposalFormPreviewBtn.disabled = false;
  },
  setFormReadOnly(readOnly) {
    this.state.formReadOnly = !!readOnly;
    if (!E.proposalForm) return;
    E.proposalForm.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.id === 'proposalFormProposalId') return;
      el.disabled = !!readOnly;
    });
    [E.proposalAddAnnualRowBtn, E.proposalAddOneTimeRowBtn, E.proposalAddCapabilityRowBtn].forEach(btn => {
      if (!btn) return;
      btn.style.display = readOnly ? 'none' : '';
    });
    E.proposalForm?.querySelectorAll('[data-item-remove]').forEach(btn => {
      btn.style.display = readOnly ? 'none' : '';
    });
    if (E.proposalFormSaveBtn) E.proposalFormSaveBtn.style.display = readOnly ? 'none' : '';
    const lockedIds=['proposalFormCustomerName','proposalFormCustomerAddress','proposalFormCustomerContactName','proposalFormCustomerContactMobile','proposalFormCustomerContactEmail','proposalFormProviderContactName','proposalFormProviderContactMobile','proposalFormProviderContactEmail','proposalFormCustomerSignatoryName','proposalFormCustomerSignatoryTitle','proposalFormProviderSignatoryName','proposalFormProviderSignatoryTitle'];
    lockedIds.forEach(id=>{const el=document.getElementById(id); if(!el) return; el.readOnly=true; el.classList.add('readonly-field','locked-field'); el.setAttribute('aria-readonly','true');});
    if (E.proposalFormDeleteBtn && readOnly) E.proposalFormDeleteBtn.style.display = 'none';
  },
  assignFormValues(proposal = {}) {
    proposal = this.applyProposalProviderSessionFields(proposal || {});
    const set = (el, value) => {
      if (el) el.value = String(value ?? '');
    };
    set(E.proposalFormProposalId, proposal.proposal_id || '');
    set(E.proposalFormTitleField, proposal.proposal_title || '');
    set(E.proposalFormDealId, proposal.deal_id || '');
    set(E.proposalFormProposalDate, proposal.proposal_date || '');
    set(E.proposalFormValidUntil, proposal.valid_until || '');
    set(E.proposalFormStatus, proposal.status || 'Draft');
    set(E.proposalFormCurrency, proposal.currency || '');
    set(E.proposalFormCustomerName, proposal.customer_name || '');
    set(E.proposalFormCustomerAddress, proposal.customer_address || '');
    set(E.proposalFormCustomerContactName, proposal.customer_contact_name || '');
    set(E.proposalFormCustomerContactMobile, proposal.customer_contact_mobile || '');
    set(E.proposalFormCustomerContactEmail, proposal.customer_contact_email || '');
    set(E.proposalFormProviderContactName, proposal.provider_contact_name || '');
    set(E.proposalFormProviderContactMobile, proposal.provider_contact_mobile || '');
    set(E.proposalFormProviderContactEmail, proposal.provider_contact_email || '');
    set(E.proposalFormServiceStartDate, proposal.service_start_date || '');
    set(E.proposalFormContractTerm, proposal.contract_term || '');
    set(E.proposalFormAccountNumber, proposal.account_number || '');
    set(E.proposalFormBillingFrequency, 'Annual');
    set(E.proposalFormPaymentTerm, ['Net 7', 'Net 14', 'Net 21', 'Net 30'].includes(proposal.payment_term) ? proposal.payment_term : 'Net 30');
    set(E.proposalFormPoNumber, proposal.po_number || '');
    set(E.proposalFormCustomerSignatoryName, proposal.customer_signatory_name || '');
    set(E.proposalFormCustomerSignatoryTitle, proposal.customer_signatory_title || '');
    set(E.proposalFormCustomerSignDate, proposal.customer_sign_date || '');
    set(E.proposalFormProviderSignatoryName, proposal.provider_signatory_name || '');
    set(E.proposalFormProviderSignatoryTitle, proposal.provider_signatory_title || '');
    set(E.proposalFormProviderSignDate, proposal.provider_sign_date || '');
    set(E.proposalFormTerms, proposal.terms_conditions || '');
  },
  computeCommercialRow(item) {
    const unit = this.toNumberSafe(item.unit_price);
    const discountRatio = this.normalizeDiscount(item.discount_percent);
    const qty = this.toNumberSafe(item.quantity);
    const discounted = unit * (1 - discountRatio);
    const lineTotal = discounted * qty;
    return {
      ...item,
      discounted_unit_price: discounted,
      line_total: lineTotal
    };
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
  getCatalogItemById(section, catalogItemId) {
    const targetId = String(catalogItemId || '').trim();
    if (!targetId) return null;
    return (
      this.getCatalogRowsForSection(section).find(row => String(row?.id || '').trim() === targetId) || null
    );
  },
  renderCatalogOptionList(section) {
    const listEl = document.getElementById(`proposalCatalogOptions-${section}`);
    if (!listEl) return;
    const rows = this.getCatalogRowsForSection(section);
    const seen = new Set();
    listEl.innerHTML = rows
      .filter(row => {
        const key = String(row?.item_name || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(row => {
        const itemName = String(row?.item_name || '').trim();
        const category = String(row?.category || '').trim();
        const location = String(row?.default_location_name || '').trim();
        const meta = [category, location].filter(Boolean).join(' · ');
        return `<option value="${U.escapeAttr(itemName)}">${U.escapeHtml(meta)}</option>`;
      })
      .join('');
  },
  renderCatalogOptionLists() {
    this.renderCatalogOptionList('annual_saas');
    this.renderCatalogOptionList('one_time_fee');
  },
  getCatalogItemByName(section, itemName) {
    const target = this.normalizeText(itemName);
    if (!target) return null;
    return (
      this.getCatalogRowsForSection(section).find(
        row => this.normalizeText(row?.item_name) === target
      ) || null
    );
  },
  resolveCatalogSelectionForRow(tr, section) {
    if (!tr || section === 'capability') return { selected: null, matchedBy: '' };
    const itemInput = tr.querySelector('[data-item-field="item_name"]');
    const catalogIdInput = tr.querySelector('[data-item-field="catalog_item_id"]');
    const catalogItemId = String(catalogIdInput?.value || '').trim();
    const byId = this.getCatalogItemById(section, catalogItemId);
    if (byId) return { selected: byId, matchedBy: 'id' };
    const byName = this.getCatalogItemByName(section, itemInput?.value || '');
    if (byName) return { selected: byName, matchedBy: 'name' };
    return { selected: null, matchedBy: '' };
  },
  applyCatalogSelectionToRow(tr, section, options = {}) {
    if (!tr || section === 'capability') return;
    const { fromUserInput = false } = options;
    const itemInput = tr.querySelector('[data-item-field="item_name"]');
    const catalogIdInput = tr.querySelector('[data-item-field="catalog_item_id"]');
    const unitPriceInput = tr.querySelector('[data-item-field="unit_price"]');
    const discountPercentInput = tr.querySelector('[data-item-field="discount_percent"]');
    const quantityInput = tr.querySelector('[data-item-field="quantity"]');
    const locationInput = tr.querySelector('[data-item-field="location_name"]');
    if (!itemInput || !unitPriceInput || !catalogIdInput) return;

    const { selected, matchedBy } = this.resolveCatalogSelectionForRow(tr, section);
    if (!selected) {
      if (fromUserInput) catalogIdInput.value = '';
      unitPriceInput.readOnly = false;
      unitPriceInput.removeAttribute('title');
      tr.dataset.priceLocked = 'false';
      return;
    }

    catalogIdInput.value = String(selected.id || '');
    if (matchedBy === 'id' && !String(itemInput.value || '').trim() && selected.item_name) {
      itemInput.value = String(selected.item_name);
    } else if (matchedBy === 'name' && selected.item_name) {
      itemInput.value = String(selected.item_name);
    }

    if (selected.unit_price !== null && selected.unit_price !== undefined) {
      unitPriceInput.value = String(selected.unit_price);
    }
    const hasCatalogDiscount = ['discount_percent', 'discountPercent', 'discount', 'item_discount', 'itemDiscount'].some(
      key => selected[key] !== undefined && selected[key] !== null && String(selected[key]).trim() !== ''
    );
    const selectedDiscountPercent = this.getNormalizedItemDiscountPercent(selected);
    const hasExistingDiscount = discountPercentInput && String(discountPercentInput.value ?? '').trim() !== '';
    if (discountPercentInput && hasCatalogDiscount && (fromUserInput || !hasExistingDiscount)) {
      discountPercentInput.value = String(selectedDiscountPercent);
    }
    if (quantityInput && selected.quantity !== null && selected.quantity !== undefined) {
      quantityInput.value = String(selected.quantity);
    }
    unitPriceInput.readOnly = true;
    unitPriceInput.title = 'Unit price is set from the proposal catalog.';
    tr.dataset.priceLocked = 'true';

    if (locationInput && !String(locationInput.value || '').trim() && selected.default_location_name) {
      locationInput.value = String(selected.default_location_name);
    }
  },
  async ensureCatalogLoaded() {
    this.renderCatalogOptionLists();
    const hasRows = this.getCatalogRowsForSection('annual_saas').length || this.getCatalogRowsForSection('one_time_fee').length;
    if (hasRows) return;
    if (this.state.catalogLoading || typeof window.ProposalCatalog?.ensureLookupLoaded !== 'function') return;

    this.state.catalogLoading = true;
    try {
      await window.ProposalCatalog.ensureLookupLoaded();
      this.renderCatalogOptionLists();
      [E.proposalAnnualItemsTbody, E.proposalOneTimeItemsTbody].forEach(tbody => {
        if (!tbody) return;
        [...tbody.querySelectorAll('tr[data-item-row]')].forEach(tr => {
          const section = String(tr.getAttribute('data-item-row') || '').trim();
          this.applyCatalogSelectionToRow(tr, section);
        });
      });
      this.renderTotalsPreview();
    } catch (_) {
      // Non-blocking: proposal form still allows manual item entry when catalog load fails.
    } finally {
      this.state.catalogLoading = false;
    }
  },
  groupedItems(items = []) {
    const groups = {
      annual_saas: [],
      one_time_fee: [],
      capability: []
    };
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
  renderSectionRows(section, rows = []) {
    const tbody =
      section === 'annual_saas'
        ? E.proposalAnnualItemsTbody
        : section === 'one_time_fee'
        ? E.proposalOneTimeItemsTbody
        : E.proposalCapabilityItemsTbody;
    if (!tbody) return;

    const safeRows = Array.isArray(rows) ? rows : [];
    if (!safeRows.length) {
      const colspan = section === 'capability' ? 3 : 8;
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="muted" style="text-align:center;">No rows yet.</td></tr>`;
      return;
    }

    if (section === 'capability') {
      tbody.innerHTML = safeRows
        .map((row, index) => `<tr data-item-row="${section}">
          <td><input class="input" data-item-field="capability_name" value="${U.escapeAttr(row.capability_name || '')}" /></td>
          <td><input class="input" data-item-field="capability_value" value="${U.escapeAttr(row.capability_value || '')}" /></td>
          <td>
            <button class="btn ghost sm" type="button" data-item-remove="${section}" data-item-index="${index}">Remove</button>
          </td>
        </tr>`)
        .join('');
      return;
    }

    tbody.innerHTML = safeRows
      .map((row, index) => {
        const computed = this.computeCommercialRow(row);
        return `<tr data-item-row="${section}">
          <td><input type="hidden" data-item-field="catalog_item_id" value="${U.escapeAttr(computed.catalog_item_id || '')}" /><input class="input" data-item-field="location_name" value="${U.escapeAttr(computed.location_name || '')}" /></td>
          <td><input class="input" data-item-field="item_name" list="proposalCatalogOptions-${section}" value="${U.escapeAttr(computed.item_name || '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="unit_price" value="${U.escapeAttr(computed.unit_price ?? '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="discount_percent" value="${U.escapeAttr(computed.discount_percent ?? '')}" /></td>
          <td><input class="input" type="number" step="0.01" data-item-field="quantity" value="${U.escapeAttr(computed.quantity ?? '')}" /></td>
          <td><span data-item-display="discounted_unit_price">${this.formatMoney(computed.discounted_unit_price)}</span></td>
          <td><span data-item-display="line_total">${this.formatMoney(computed.line_total)}</span></td>
          <td>
            <button class="btn ghost sm" type="button" data-item-remove="${section}" data-item-index="${index}">Remove</button>
          </td>
        </tr>`;
      })
      .join('');
    [...tbody.querySelectorAll('tr[data-item-row]')].forEach(tr => this.applyCatalogSelectionToRow(tr, section));
  },
  renderProposalItems(items = []) {
    this.renderCatalogOptionLists();
    const groups = this.groupedItems(items);
    this.renderSectionRows('annual_saas', groups.annual_saas);
    this.renderSectionRows('one_time_fee', groups.one_time_fee);
    this.renderSectionRows('capability', groups.capability);
    this.renderTotalsPreview();
    this.setFormReadOnly(this.state.formReadOnly);
  },
  collectSectionItems(section) {
    const tbody =
      section === 'annual_saas'
        ? E.proposalAnnualItemsTbody
        : section === 'one_time_fee'
        ? E.proposalOneTimeItemsTbody
        : E.proposalCapabilityItemsTbody;
    if (!tbody) return [];
    const rows = [...tbody.querySelectorAll('tr[data-item-row]')];
    return rows
      .map((tr, idx) => {
        const get = field => tr.querySelector(`[data-item-field="${field}"]`)?.value ?? '';
        if (section === 'capability') {
          const capabilityName = String(get('capability_name')).trim();
          const capabilityValue = String(get('capability_value')).trim();
          if (!capabilityName && !capabilityValue) return null;
          return {
            section,
            line_no: idx + 1,
            capability_name: capabilityName,
            capability_value: capabilityValue
          };
        }
        const unitPrice = this.toNumberSafe(get('unit_price'));
        const discountPercent = this.normalizeDiscountPercentValue(get('discount_percent'));
        const quantity = Math.max(0, this.toNumberSafe(get('quantity')) || 1);
        const computed = this.computeCommercialRow({ unit_price: unitPrice, discount_percent: discountPercent, quantity });
        if (!get('item_name') && !get('location_name') && !unitPrice && !quantity) return null;
        return {
          section,
          line_no: idx + 1,
          catalog_item_id: String(get('catalog_item_id')).trim(),
          location_name: String(get('location_name')).trim(),
          item_name: String(get('item_name')).trim(),
          unit_price: unitPrice,
          discount_percent: discountPercent,
          quantity,
          discounted_unit_price: computed.discounted_unit_price,
          line_total: computed.line_total
        };
      })
      .filter(Boolean);
  },
  collectProposalItems() {
    return [
      ...this.collectSectionItems('annual_saas'),
      ...this.collectSectionItems('one_time_fee'),
      ...this.collectSectionItems('capability')
    ];
  },
  collectProposalFormData() {
    const existingRefNumber = String(E.proposalForm?.dataset.refNumber || '').trim();
    const selectedCompany = this.normalizeCompany({
      company_id: E.proposalForm?.dataset.companyId || '',
      company_name: E.proposalForm?.dataset.companyName || '',
      address: E.proposalForm?.dataset.companyAddress || ''
    });
    const selectedContact = this.normalizeContact({
      contact_id: E.proposalForm?.dataset.contactId || '',
      first_name: E.proposalForm?.dataset.contactFirstName || '',
      last_name: E.proposalForm?.dataset.contactLastName || '',
      contact_name: E.proposalForm?.dataset.contactName || '',
      full_name: E.proposalForm?.dataset.contactName || '',
      job_title: E.proposalForm?.dataset.contactJobTitle || '',
      email: E.proposalForm?.dataset.contactEmail || '',
      phone: E.proposalForm?.dataset.contactPhone || '',
      mobile: E.proposalForm?.dataset.contactMobile || ''
    });
    const mapped = this.hydrateMappedProposalFields({}, selectedCompany, selectedContact);
    const provider = this.getSignedInUserForProposal();
    const providerName = provider.name || provider.email?.split('@')?.[0] || '';
    const providerEmail = provider.email || '';
    const providerMobile = provider.mobile || '';
    const providerRole = provider.role || '';
    const contactPersonName = this.buildContactDisplayName(selectedContact);
    return {
      proposal_id: String(E.proposalFormProposalId?.value || '').trim(),
      ref_number: this.ensureRefNumber(existingRefNumber),
      proposal_title: String(E.proposalFormTitleField?.value || '').trim(),
      deal_id: this.resolveDealUuid(E.proposalFormDealId?.value || ''),
      proposal_date: String(E.proposalFormProposalDate?.value || '').trim(),
      proposal_valid_until: String(E.proposalFormValidUntil?.value || '').trim(),
      status: String(E.proposalFormStatus?.value || '').trim(),
      currency: String(E.proposalFormCurrency?.value || '').trim(),
      customer_name: U.getCustomerLegalName(selectedCompany, mapped),
      customer_legal_name: U.getCustomerLegalName(selectedCompany, mapped),
      customer_address: mapped.customer_address || '',
      customer_contact_name: String(E.proposalFormCustomerContactName?.value || '').trim(),
      customer_contact_mobile: String(E.proposalFormCustomerContactMobile?.value || '').trim(),
      customer_contact_email: String(E.proposalFormCustomerContactEmail?.value || '').trim(),
      provider_contact_name: providerName,
      provider_contact_mobile: providerMobile,
      provider_contact_email: providerEmail,
      service_start_date: String(E.proposalFormServiceStartDate?.value || '').trim(),
      contract_term: String(E.proposalFormContractTerm?.value || '').trim(),
      account_number: String(E.proposalFormAccountNumber?.value || '').trim(),
      billing_frequency: 'Annual',
      payment_term: (() => { const term = String(E.proposalFormPaymentTerm?.value || '').trim(); return ['Net 7', 'Net 14', 'Net 21', 'Net 30'].includes(term) ? term : 'Net 30'; })(),
      po_number: String(E.proposalFormPoNumber?.value || '').trim(),
      customer_signatory_name: mapped.customer_signatory_name || '',
      customer_signatory_title: mapped.customer_signatory_title || '',
      customer_sign_date: String(E.proposalFormCustomerSignDate?.value || '').trim(),
      provider_signatory_name: providerName,
      provider_signatory_title: providerRole,
      provider_sign_date: String(E.proposalFormProviderSignDate?.value || '').trim(),
      terms_conditions: String(E.proposalFormTerms?.value || '').trim(),
      company_id: selectedCompany.company_id || '',
      company_name: selectedCompany.company_name || '',
      contact_id: selectedContact.contact_id || '',
      contact_name: contactPersonName || '',
      contact_email: String(selectedContact.email || '').trim(),
      contact_phone: String(selectedContact.mobile || selectedContact.phone || '').trim(),
      contact_mobile: String(selectedContact.mobile || '').trim()
    };
  },
  calculateTotalsFromItems(items = []) {
    return this.calculateProposalTotals(items);
  },
  renderTotalsPreview() {
    const items = this.collectProposalItems();
    const totals = this.calculateTotalsFromItems(items);
    const saasTotal = this.toNumberSafe(totals.subtotal_locations);
    const oneTimeTotal = this.toNumberSafe(totals.subtotal_one_time);
    const grandTotal = this.toNumberSafe(totals.grand_total);

    if (E.proposalSaasTotal) E.proposalSaasTotal.textContent = this.formatMoney(saasTotal);
    if (E.proposalOneTimeTotal) E.proposalOneTimeTotal.textContent = this.formatMoney(oneTimeTotal);
    if (E.proposalGrandTotal) E.proposalGrandTotal.textContent = this.formatMoney(grandTotal);
  },
  async openProposalFormById(proposalId, { readOnly = false, trigger = null } = {}) {
    const id = String(proposalId || '').trim();
    if (!id) return;
    if (this.state.openingProposalIds.has(id)) return;
    this.state.openingProposalIds.add(id);
    this.setTriggerBusy(trigger, true);
    console.time('proposal-open');
    const localSummary = this.state.rows.find(row => String(row.id || '').trim() === id);
    this.openProposalForm(
      localSummary ? { ...this.emptyProposal(), ...localSummary, id } : { id },
      [],
      { readOnly }
    );
    this.setFormDetailLoading(true);
    try {
      const cached = this.getCachedDetail(id);
      if (cached) {
        this.openProposalForm(cached.proposal, cached.items, { readOnly });
        return;
      }
      const response = await this.getProposal(id);
      const { proposal, items } = this.extractProposalAndItems(response, id);
      this.setCachedDetail(id, proposal, items);
      if (String(E.proposalForm?.dataset.id || '').trim() === id) {
        this.openProposalForm(proposal, items, { readOnly });
      }
    } catch (error) {
      if (typeof isPermissionError === 'function' && isPermissionError(error)) {
        console.log('[auth-check] permission error preserved session', error?.message);
        this.state.rows = [];
        this.state.filteredRows = [];
        this.state.loadError = 'Proposals are not available for your role.';
        this.render();
        return;
      }
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to load proposal details: ' + (error?.message || 'Unknown error'));
    } finally {
      this.state.openingProposalIds.delete(id);
      this.setTriggerBusy(trigger, false);
      this.setFormDetailLoading(false);
      console.timeEnd('proposal-open');
    }
  },
  openProposalForm(proposal = null, items = [], { readOnly = false } = {}) {
    if (!E.proposalFormModal || !E.proposalForm) return;
    const base = proposal ? this.normalizeProposal(proposal) : this.emptyProposal();
    const mode = base.id ? 'edit' : 'create';
    this.resetForm();
    this.state.formMode = mode;
    this.state.formReadOnly = !!readOnly;
    this.state.currentProposalId = base.id || '';
    this.state.currentItems = Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [];

    E.proposalForm.dataset.mode = mode;
    E.proposalForm.dataset.id = base.id || '';
    E.proposalForm.dataset.refNumber = base.ref_number || '';
    E.proposalForm.dataset.companyId = String(base.company_id || '').trim();
    E.proposalForm.dataset.companyName = String(base.company_name || '').trim();
    E.proposalForm.dataset.companyAddress = String(base.customer_address || '').trim();
    E.proposalForm.dataset.contactId = String(base.contact_id || '').trim();
    E.proposalForm.dataset.contactName = String(base.contact_name || base.customer_contact_name || '').trim();
    E.proposalForm.dataset.contactJobTitle = String(base.customer_signatory_title || '').trim();
    E.proposalForm.dataset.contactEmail = String(base.contact_email || base.customer_contact_email || '').trim();
    E.proposalForm.dataset.contactPhone = String(base.contact_phone || '').trim();
    E.proposalForm.dataset.contactMobile = String(base.contact_mobile || base.customer_contact_mobile || '').trim();
    const hydratedBase = this.hydrateMappedProposalFields(
      base,
      { address: E.proposalForm.dataset.companyAddress },
      {
        contact_name: E.proposalForm.dataset.contactName,
        job_title: E.proposalForm.dataset.contactJobTitle,
        email: E.proposalForm.dataset.contactEmail,
        phone: E.proposalForm.dataset.contactPhone,
        mobile: E.proposalForm.dataset.contactMobile
      }
    );
    this.assignFormValues(hydratedBase);
    this.renderProposalItems(this.state.currentItems);
    this.ensureCatalogLoaded();

    if (E.proposalFormTitle) {
      if (readOnly) E.proposalFormTitle.textContent = 'View Proposal';
      else E.proposalFormTitle.textContent = mode === 'edit' ? 'Edit Proposal' : 'Create Proposal';
    }
    if (E.proposalFormDeleteBtn)
      E.proposalFormDeleteBtn.style.display = mode === 'edit' && !readOnly && Permissions.canDeleteProposal() ? '' : 'none';
    if (E.proposalFormSaveBtn) {
      const canSave = mode === 'edit' ? Permissions.canUpdateProposal() : Permissions.canCreateProposal();
      E.proposalFormSaveBtn.style.display = !readOnly && canSave ? '' : 'none';
    }

    this.setFormReadOnly(readOnly);

    E.proposalFormModal.style.display = 'flex';
    E.proposalFormModal.setAttribute('aria-hidden', 'false');
  },
  closeProposalForm() {
    if (!E.proposalFormModal) return;
    E.proposalFormModal.style.display = 'none';
    E.proposalFormModal.setAttribute('aria-hidden', 'true');
  },
  setFormBusy(value) {
    const busy = !!value;
    if (E.proposalFormSaveBtn) E.proposalFormSaveBtn.disabled = busy;
    if (E.proposalFormDeleteBtn) E.proposalFormDeleteBtn.disabled = busy;
    if (E.proposalFormPreviewBtn) E.proposalFormPreviewBtn.disabled = busy;
  },
  async submitForm() {
    if (this.state.saveInFlight) return;
    const mode = E.proposalForm?.dataset.mode === 'edit' ? 'edit' : 'create';
    if (mode === 'edit' && !Permissions.canUpdateProposal()) {
      UI.toast('You do not have permission to update proposals.');
      return;
    }
    if (mode !== 'edit' && !Permissions.canCreateProposal()) {
      UI.toast('Login is required to manage proposals.');
      return;
    }
    const proposalId = String(E.proposalForm?.dataset.id || '').trim();
    const proposal = this.collectProposalFormData();
    if (mode !== 'edit') {
      proposal.proposal_id = this.ensureProposalId(proposal.proposal_id);
      if (!proposal.proposal_id) {
        UI.toast('Unable to generate proposal ID. Please retry.');
        return;
      }
      if (E.proposalFormProposalId) E.proposalFormProposalId.value = proposal.proposal_id;
    }
    const items = this.collectProposalItems();
    const currentRecord = this.state.rows.find(row => String(row.id || '') === proposalId) || {};
    const requestedDiscount = items.reduce((max, item) => Math.max(max, this.toNumberSafe(item.discount_percent)), 0);
    const currentStatus = String(currentRecord?.status || '').trim();
    const requestedStatus = String(proposal.status || '').trim();
    const shouldValidateWorkflow = this.shouldValidateWorkflowBeforeSave({
      proposalId,
      currentStatus,
      requestedStatus
    });
    if (shouldValidateWorkflow) {
      const workflowCheck = await window.WorkflowEngine?.enforceBeforeSave?.('proposals', currentRecord, {
        id: proposalId,
        current_status: currentStatus,
        requested_status: requestedStatus,
        discount_percent: requestedDiscount,
        requested_changes: { proposal, items }
      });
      try { console.info('[workflow] final decision', workflowCheck); } catch {}
      if (workflowCheck?.allowed === true) {
        // continue normal save
      } else if (workflowCheck?.pendingApproval === true && workflowCheck?.approvalCreated === true) {
        UI.toast('Approval request submitted successfully.');
        return;
      } else if (workflowCheck?.pendingApproval === true && workflowCheck?.approvalCreated !== true) {
        UI.toast('Approval is required, but the approval request could not be created yet. Please retry.');
        return;
      } else {
        UI.toast(window.WorkflowEngine.composeDeniedMessage(workflowCheck, 'Proposal save blocked.'));
        return;
      }
    }

    if (!proposal.proposal_title) {
      UI.toast('Proposal title is required.');
      return;
    }

    this.setFormBusy(true);
    this.state.saveInFlight = true;
    console.time('entity-save');
    try {
      let response;
      if (mode === 'edit' && proposalId) {
        response = await this.updateProposal(proposalId, proposal, items);
      } else {
        response = await this.createProposal(proposal, items);
      }

      const parsed = this.extractProposalAndItems(response, proposalId);
      const savedProposal = parsed?.proposal && typeof parsed.proposal === 'object' ? parsed.proposal : null;
      if (!savedProposal) throw new Error('Proposal save returned no proposal record.');
      const savedBusinessId = String(savedProposal.proposal_id || '').trim();
      const savedProposalNumber = String(savedProposal.ref_number || savedProposal.proposal_number || '').trim();
      const savedUuid = String(savedProposal.id || '').trim();
      if (!savedBusinessId || !savedProposalNumber) {
        throw new Error('Proposal save failed because no proposal ID/number was returned.');
      }
      if (!savedUuid) {
        throw new Error('Proposal save failed because no internal proposal ID was returned.');
      }
      if (parsed?.proposal) {
        this.upsertLocalRow(parsed.proposal);
        this.setCachedDetail(parsed.proposal.id || proposalId, parsed.proposal, parsed.items);
        if (mode !== 'edit' && parsed.proposal.deal_id) {
          this.markDealAsConvertedToProposal(parsed.proposal.deal_id, parsed.proposal.proposal_id);
        }
      }
      UI.toast(mode === 'edit' ? 'Proposal updated.' : 'Proposal created.');
      if (parsed?.proposal) this.openProposalForm(parsed.proposal, parsed.items, { readOnly: false });
      else this.closeProposalForm();
    } catch (error) {
      if (typeof isPermissionError === 'function' && isPermissionError(error)) {
        console.log('[auth-check] permission error preserved session', error?.message);
        this.state.rows = [];
        this.state.filteredRows = [];
        this.state.loadError = 'Proposals are not available for your role.';
        this.render();
        return;
      }
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      if (this.hasConflictError(error, 'DEAL_ALREADY_CONVERTED_TO_PROPOSAL')) {
        UI.toast('This deal has already been converted to a proposal.');
        return;
      }
      UI.toast('Unable to save proposal: ' + (error?.message || 'Unknown error'));
    } finally {
      console.timeEnd('entity-save');
      this.state.saveInFlight = false;
      this.setFormBusy(false);
    }
  },
  async deleteById(proposalId) {
    if (!Permissions.canDeleteProposal()) {
      UI.toast('You do not have permission to delete proposals.');
      return;
    }
    if (!proposalId) return;
    const confirmed = window.confirm(`Delete proposal ${proposalId}?`);
    if (!confirmed) return;

    this.setFormBusy(true);
    try {
      await this.deleteProposal(proposalId);
      delete this.state.detailCacheById[String(proposalId || '').trim()];
      this.removeLocalRow(proposalId);
      UI.toast('Proposal deleted.');
      this.closeProposalForm();
      this.rerenderVisibleTable();
    } catch (error) {
      if (typeof isPermissionError === 'function' && isPermissionError(error)) {
        console.log('[auth-check] permission error preserved session', error?.message);
        this.state.rows = [];
        this.state.filteredRows = [];
        this.state.loadError = 'Proposals are not available for your role.';
        this.render();
        return;
      }
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to delete proposal: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  extractHtml(response) {
    const candidates = [
      response,
      response?.html,
      response?.proposal_html,
      response?.data,
      response?.data?.html,
      response?.result,
      response?.result?.html,
      response?.payload,
      response?.payload?.html
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
      if (candidate && typeof candidate === 'object') {
        if (typeof candidate.html === 'string' && candidate.html.trim()) return candidate.html;
        if (typeof candidate.proposal_html === 'string' && candidate.proposal_html.trim())
          return candidate.proposal_html;
      }
    }
    return '';
  },
  closePreviewModal() {
    if (!E.proposalPreviewModal) return;
    E.proposalPreviewModal.style.display = 'none';
    E.proposalPreviewModal.setAttribute('aria-hidden', 'true');
    if (E.proposalPreviewFrame) E.proposalPreviewFrame.srcdoc = '';
  },
  exportPreviewPdf() {
    const frame = E.proposalPreviewFrame;
    const previewTitle = String(E.proposalPreviewTitle?.textContent || 'Proposal Preview').trim();
    if (!frame || !String(frame.srcdoc || '').trim()) {
      UI.toast('Open proposal preview first to extract PDF.');
      return;
    }
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      UI.toast('Unable to access proposal preview content.');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    UI.toast(`Print dialog opened for ${previewTitle}. Choose "Save as PDF" to extract.`);
  },
  async previewProposalHtml(proposalId) {
    if (!proposalId) {
      UI.toast('Missing proposal ID for preview.');
      return;
    }
    if (!Permissions.canPreviewProposal()) {
      UI.toast('You do not have permission to preview proposals.');
      return;
    }
    try {
      const { proposal, items } = await this.loadProposalPreviewData(proposalId);
      const html = this.buildProposalPreviewHtml(proposal, items);
      if (!html) {
        UI.toast('Unable to build proposal preview.');
        return;
      }
      const brandedHtml = U.addIncheckDocumentLogo(U.formatPreviewHtmlDates(html));
      if (E.proposalPreviewFrame) E.proposalPreviewFrame.srcdoc = brandedHtml;
      const previewLabel = String(proposal?.proposal_id || proposal?.id || proposalId).trim();
      if (E.proposalPreviewTitle) E.proposalPreviewTitle.textContent = `Proposal Preview · ${previewLabel}`;
      if (E.proposalPreviewModal) {
        E.proposalPreviewModal.style.display = 'flex';
        E.proposalPreviewModal.setAttribute('aria-hidden', 'false');
      }
    } catch (error) {
      if (typeof isPermissionError === 'function' && isPermissionError(error)) {
        console.log('[auth-check] permission error preserved session', error?.message);
        this.state.rows = [];
        this.state.filteredRows = [];
        this.state.loadError = 'Proposals are not available for your role.';
        this.render();
        return;
      }
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to preview proposal: ' + (error?.message || 'Unknown error'));
    }
  },
  getCreatedProposalId(response) {
    const parseJsonIfNeeded = value => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    };
    const isUuid = value =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || '').trim()
      );
    const fromDirectString = String(response || '').trim();
    if (isUuid(fromDirectString)) return fromDirectString;

    const candidates = [
      parseJsonIfNeeded(response),
      parseJsonIfNeeded(response?.data),
      parseJsonIfNeeded(response?.result),
      parseJsonIfNeeded(response?.payload),
      parseJsonIfNeeded(response?.proposal),
      parseJsonIfNeeded(response?.data?.proposal),
      parseJsonIfNeeded(response?.result?.proposal),
      parseJsonIfNeeded(response?.payload?.proposal),
      parseJsonIfNeeded(response?.created_proposal),
      parseJsonIfNeeded(response?.createdProposal)
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        for (const entry of candidate) {
          if (!entry || typeof entry !== 'object') continue;
          const arrayId = String(
            entry.id || entry.proposal_uuid || entry.proposal_id_uuid || entry.created_proposal_uuid || ''
          ).trim();
          if (isUuid(arrayId)) return arrayId;
        }
        continue;
      }
      if (!candidate || typeof candidate !== 'object') continue;
      const id = String(
        candidate.id ||
          candidate.proposal_uuid ||
          candidate.proposal_id_uuid ||
          candidate.created_proposal_uuid ||
          candidate.created_uuid ||
          ''
      ).trim();
      if (isUuid(id)) return id;
    }
    return '';
  },
  async findCreatedProposalUuidByDealId(dealUuid) {
    const id = String(dealUuid || '').trim();
    if (!id) return '';
    const response = await Api.requestWithSession('proposals', 'list', {
      deal_id: id,
      limit: 1,
      page: 1,
      sort_by: 'created_at',
      sort_dir: 'desc'
    });
    const rows = this.extractRows(response);
    const first = Array.isArray(rows) && rows.length ? this.normalizeProposal(rows[0]) : null;
    return String(first?.id || '').trim();
  },
  async createFromDealFlow(dealId, { openAfterCreate = true } = {}) {
    if (!Permissions.canCreateProposalFromDeal()) {
      UI.toast('You do not have permission to create proposals from deals.');
      return;
    }
    const trimmedDealId = String(dealId || '').trim();
    if (!trimmedDealId) {
      UI.toast('Deal ID is required.');
      return;
    }
    const deal = await this.resolveDealForProposal(trimmedDealId);
    if (!deal) {
      UI.toast('Unable to load deal details for proposal draft.');
      return;
    }
    if (window.Deals?.isProposalAlreadyCreated?.(deal)) {
      UI.toast('This deal has already been converted to a proposal.');
      return;
    }
    try {
      if (openAfterCreate) {
        const proposalDraft = await this.proposalDraftFromDeal(deal);
        this.openProposalForm(proposalDraft, [], { readOnly: false });
      }
      UI.toast('Prefilled proposal draft opened. Save to create the proposal.');
    } catch (error) {
      if (this.hasConflictError(error, 'DEAL_ALREADY_CONVERTED_TO_PROPOSAL')) {
        UI.toast('This deal has already been converted to a proposal.');
        return;
      }
      UI.toast('Unable to open proposal draft from deal: ' + (error?.message || 'Unknown error'));
    }
  },
  shouldValidateWorkflowBeforeSave({ proposalId = '', currentStatus = '', requestedStatus = '' } = {}) {
    const fromStatus = String(currentStatus || '').trim().toLowerCase();
    const toStatus = String(requestedStatus || '').trim().toLowerCase();
    return Boolean(toStatus || fromStatus || proposalId);
  },
  addRow(section) {
    const groups = this.groupedItems(this.collectProposalItems());
    if (section === 'capability') {
      groups.capability.push({ section: 'capability', capability_name: '', capability_value: '' });
    } else {
      groups[section].push({
        section,
        location_name: '',
        item_name: '',
        unit_price: 0,
        discount_percent: 0,
        quantity: 1,
        discounted_unit_price: 0,
        line_total: 0
      });
    }
    this.renderProposalItems([...groups.annual_saas, ...groups.one_time_fee, ...groups.capability]);
  },
  removeRow(section, index) {
    const groups = this.groupedItems(this.collectProposalItems());
    if (!groups[section]) return;
    groups[section] = groups[section].filter((_, idx) => idx !== index);
    this.renderProposalItems([...groups.annual_saas, ...groups.one_time_fee, ...groups.capability]);
  },
  wire() {
    if (this.state.initialized) return;

    if (!E.proposalFormCustomerSignDate) E.proposalFormCustomerSignDate = document.getElementById('proposalFormCustomerSignDate');

    const bindState = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        this.state.page = 1;
        this.loadAndRefresh({ force: true });
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    };

    bindState(E.proposalsSearchInput, 'search');
    bindState(E.proposalsCustomerFilter, 'customer');
    bindState(E.proposalsStatusFilter, 'status');

    if (E.proposalsRefreshBtn) {
      E.proposalsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    }
    if (E.proposalsExportCsvBtn) {
      E.proposalsExportCsvBtn.addEventListener('click', () => this.exportProposalsCsv());
    }
    if (E.proposalsCreateBtn) {
      E.proposalsCreateBtn.addEventListener('click', () => {
        if (!Permissions.canCreateProposal()) return UI.toast('Login is required to manage proposals.');
        this.openProposalForm();
      });
    }

    if (E.proposalsTbody) {
      E.proposalsTbody.addEventListener('click', event => {
        const getActionValue = action => event.target?.closest?.(`[${action}]`)?.getAttribute(action) || '';
        const trigger = event.target?.closest?.('button');
        const viewId = getActionValue('data-proposal-view');
        if (viewId) {
          this.runRowAction(`view:${viewId}`, trigger, () =>
            this.openProposalFormById(viewId, { readOnly: true, trigger })
          );
          return;
        }
        const editId = getActionValue('data-proposal-edit');
        if (editId) {
          if (!Permissions.canUpdateProposal()) return UI.toast('You do not have permission to edit proposals.');
          this.runRowAction(`edit:${editId}`, trigger, () =>
            this.openProposalFormById(editId, { readOnly: false, trigger })
          );
          return;
        }
        const previewId = getActionValue('data-proposal-preview');
        if (previewId) {
          this.runRowAction(`preview:${previewId}`, trigger, () => this.previewProposalHtml(previewId));
          return;
        }
        const convertAgreementId = getActionValue('data-proposal-convert-agreement');
        if (convertAgreementId) {
          this.runRowAction(`convert-agreement:${convertAgreementId}`, trigger, async () => {
            if (typeof setActiveView === 'function') setActiveView('agreements');
            if (window.Agreements?.createFromProposalFlow) {
              await window.Agreements.createFromProposalFlow(convertAgreementId);
            } else {
              UI.toast('Agreements module is unavailable.');
            }
          });
          return;
        }
        const deleteId = getActionValue('data-proposal-delete');
        if (deleteId) this.runRowAction(`delete:${deleteId}`, trigger, () => this.deleteById(deleteId));
      });
    }
    const proposalsAnalyticsGrid = document.getElementById('proposalsAnalyticsGrid');
    if (proposalsAnalyticsGrid) {
      const activate = card => {
        if (!card) return;
        const filter = card.getAttribute('data-kpi-filter');
        if (!filter) return;
        this.applyKpiFilter(filter);
      };
      proposalsAnalyticsGrid.addEventListener('click', event => {
        activate(event.target?.closest?.('[data-kpi-filter]'));
      });
      proposalsAnalyticsGrid.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target?.closest?.('[data-kpi-filter]');
        if (!card) return;
        event.preventDefault();
        activate(card);
      });
    }

    if (E.proposalFormCloseBtn) E.proposalFormCloseBtn.addEventListener('click', () => this.closeProposalForm());
    if (E.proposalFormCancelBtn) E.proposalFormCancelBtn.addEventListener('click', () => this.closeProposalForm());
    if (E.proposalFormModal) {
      E.proposalFormModal.addEventListener('click', event => {
        if (event.target === E.proposalFormModal) this.closeProposalForm();
      });
    }
    if (E.proposalForm) {
      E.proposalForm.addEventListener('submit', event => {
        event.preventDefault();
        this.submitForm();
      });
      E.proposalForm.addEventListener('input', event => {
        const field = event.target?.getAttribute('data-item-field');
        if (field) {
          const tr = event.target.closest('tr[data-item-row]');
          if (tr) {
            const section = tr.getAttribute('data-item-row');
            if (section !== 'capability') {
              if (field === 'item_name') this.applyCatalogSelectionToRow(tr, section, { fromUserInput: true });
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
            }
          }
          this.renderTotalsPreview();
        }
      });
      E.proposalForm.addEventListener('change', event => {
        const field = event.target?.getAttribute('data-item-field');
        if (field !== 'item_name') return;
        const tr = event.target.closest('tr[data-item-row]');
        const section = tr?.getAttribute('data-item-row');
        if (!tr || !section || section === 'capability') return;
        this.applyCatalogSelectionToRow(tr, section, { fromUserInput: true });
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
        this.renderTotalsPreview();
      });
      E.proposalForm.addEventListener('click', event => {
        const section = event.target?.getAttribute('data-item-remove');
        const index = Number(event.target?.getAttribute('data-item-index'));
        if (section && Number.isInteger(index) && index >= 0) {
          this.removeRow(section, index);
        }
      });
    }

    if (E.proposalFormDeleteBtn) {
      E.proposalFormDeleteBtn.addEventListener('click', () => {
        const id = String(E.proposalForm?.dataset.id || '').trim();
        if (id) this.deleteById(id);
      });
    }
    if (E.proposalFormPreviewBtn) {
      E.proposalFormPreviewBtn.addEventListener('click', () => {
        const id = String(E.proposalForm?.dataset.id || '').trim();
        if (!id) {
          UI.toast('Save the proposal first to preview backend-generated HTML.');
          return;
        }
        this.previewProposalHtml(id);
      });
    }

    if (E.proposalAddAnnualRowBtn)
      E.proposalAddAnnualRowBtn.addEventListener('click', () => this.addRow('annual_saas'));
    if (E.proposalAddOneTimeRowBtn)
      E.proposalAddOneTimeRowBtn.addEventListener('click', () => this.addRow('one_time_fee'));
    if (E.proposalAddCapabilityRowBtn)
      E.proposalAddCapabilityRowBtn.addEventListener('click', () => this.addRow('capability'));

    window.addEventListener('proposal-catalog-lookup-invalidated', () => {
      if (E.proposalFormModal?.style?.display === 'flex') this.ensureCatalogLoaded();
    });

    if (E.proposalPreviewCloseBtn) E.proposalPreviewCloseBtn.addEventListener('click', () => this.closePreviewModal());
    if (E.proposalPreviewExportPdfBtn) {
      E.proposalPreviewExportPdfBtn.addEventListener('click', () => this.exportPreviewPdf());
    }
    if (E.proposalPreviewModal) {
      E.proposalPreviewModal.addEventListener('click', event => {
        if (event.target === E.proposalPreviewModal) this.closePreviewModal();
      });
    }

    this.state.initialized = true;
  }
};

window.Proposals = Proposals;
