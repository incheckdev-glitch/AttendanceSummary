function normalizeAgreementStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function isAgreementSigned(agreement) {
  return normalizeAgreementStatus(agreement?.status) === "signed";
}

function agreementHasSignedDocument(agreement) {
  return Boolean(
    agreement?.signed_document_path ||
    agreement?.signed_agreement_document_path ||
    agreement?.signed_document_url ||
    agreement?.signed_agreement_document_url
  );
}

const Agreements = {
  signedDocumentBucket: 'agreement-signed-documents',
  agreementFields: [
    'agreement_id',
    'agreement_number',
    'created_at',
    'updated_at',
    'proposal_id',
    'deal_id',
    'lead_id',
    'agreement_title',
    'agreement_date',
    'effective_date',
    'service_start_date',
    'service_end_date',
    'agreement_length',
    'account_number',
    'billing_frequency',
    'payment_term',
    'po_number',
    'is_poc',
    'poc_location_count',
    'poc_license_count',
    'poc_license_months',
    'poc_service_start_date',
    'poc_service_end_date',
    'poc_success_kpis',
    'poc_conversion_commitment',
    'currency',
    'customer_name',
    'customer_legal_name',
    'customer_address',
    'customer_contact_name',
    'customer_contact_mobile',
    'customer_contact_email',
    'provider_name',
    'provider_legal_name',
    'provider_address',
    'provider_contact_name',
    'provider_contact_mobile',
    'provider_contact_email',
    'status',
    'saas_total',
    'one_time_total',
    'grand_total',
    'terms_conditions',
    'customer_official_signatory_name',
    'customer_official_signatory_title',
    'customer_official_sign_date',
    'customer_signatory_name',
    'customer_signatory_title',
    'provider_official_signatory_1_name',
    'provider_official_signatory_1_title',
    'provider_official_signatory_1_sign_date',
    'provider_official_signatory_2_name',
    'provider_official_signatory_2_title',
    'provider_official_signatory_2_sign_date',
    'provider_signatory_name_primary',
    'provider_signatory_title_primary',
    'provider_signatory_name_secondary',
    'provider_signatory_title_secondary',
    'provider_sign_date',
    'customer_sign_date',
    'gm_signed',
    'financial_controller_signed',
    'signed_date',
    'signed_document_path',
    'signed_document_name',
    'signed_document_uploaded_at',
    'signed_document_uploaded_by',
    'signed_document_url',
    'signed_agreement_document_path',
    'signed_agreement_document_name',
    'signed_agreement_document_uploaded_at',
    'signed_agreement_document_uploaded_by',
    'signed_agreement_document_url',
    'total_discount',
    'generated_by',
    'company_id','company_name','contact_id','contact_name','contact_email','contact_phone','contact_mobile','customer_contact_phone','company_email','company_phone','country','city','tax_number','customer_signatory_email','customer_signatory_phone','provider_signatory_name','provider_signatory_title','provider_signatory_email','provider_primary_signatory_name','provider_primary_signatory_title','provider_secondary_signatory_name','provider_secondary_signatory_title',
    'notes'
  ],
  shouldSkipAgreementWorkflow({ currentStatus, nextStatus, action, payload } = {}) {
    const current = String(currentStatus || '').trim().toLowerCase();
    const next = String(nextStatus || payload?.status || '').trim().toLowerCase();
    const normalizedAction = String(action || payload?.action || '').trim().toLowerCase();
    const isSaveAction = ['create', 'save', 'update'].includes(normalizedAction);

    if (next === 'draft' && (current === '' || current === 'draft') && isSaveAction) {
      return true;
    }

    if (current && next && current === next) {
      return true;
    }

    return false;
  },
  isAgreementWorkflowUnavailableDecision(decision = {}) {
    if (!decision || typeof decision !== 'object') return false;
    if (decision.unavailable === true || decision.fallback === true) return true;
    const reason = String(decision.reason || decision.message || '').trim().toLowerCase();
    return reason.includes('workflow validation is unavailable') ||
      reason.includes('save blocked until workflow is reachable') ||
      reason.includes('validation unavailable');
  },
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
    status: 'All',
    proposalOrDeal: '',
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    total: 0,
    kpiFilter: 'total',
    formReadOnly: false,
    currentItems: [],
    currentAgreement: null,
    currentAgreementId: '',
    saveInFlight: false,
    detailCacheById: {},
    detailCacheTtlMs: 90 * 1000,
    openingAgreementIds: new Set(),
    rowActionInFlight: new Set(),
    selectedAgreementCompanyForVerification: null
  },

  providerIdentityDefaults: {
    legalName: 'InCheck 360 Holding BV',
    name: 'InCheck 360 Holding BV',
    address: 'Pyrmontstraat 5, 7513 BN, Enschede, The Netherlands',
    contactName: 'InCheck 360 Holding BV',
    contactMobile: '+31 97 010280855',
    contactEmail: 'Info@incheck360.nl',
    primarySignatoryName: 'Simon Moujaly',
    primarySignatoryTitle: 'Senior Financial Controller',
    secondarySignatoryName: 'Hanna Khattar',
    secondarySignatoryTitle: 'General Manager'
  },

  toNumberSafe(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  toDbBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const raw = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'signed', 'on'].includes(raw)) return true;
    if (['false', '0', 'no', 'n', 'unsigned', 'off'].includes(raw)) return false;
    return fallback;
  },
  toNullableNumber(value) {
    if (value === null || value === undefined) return null;
    const raw = String(value).replace(/,/g, '').trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },
  normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  },
  normalizeAgreementStatus(value) {
    return normalizeAgreementStatus(value);
  },
  isAgreementSigned(agreement = {}) {
    return isAgreementSigned(agreement);
  },
  agreementHasSignedDocument(agreement = {}) {
    return agreementHasSignedDocument(agreement);
  },
  getSupabaseClient() {
    return window.SupabaseClient?.getClient?.() || window.supabaseClient || window.supabase || null;
  },
  getAgreementRowIdentity(agreement = {}) {
    return String(agreement?.id || agreement?.agreement_id || agreement?.agreement_number || '').trim();
  },
  hasConflictError(error, conflictCode = '') {
    const message = String(error?.message || '').toUpperCase();
    const code = String(conflictCode || '').trim().toUpperCase();
    return message.includes('HTTP 409') && (!code || message.includes(code));
  },
  markProposalAsConvertedToAgreement(proposalId, agreementId = '') {
    const id = String(proposalId || '').trim();
    if (!id || !window.Proposals?.state?.rows) return;
    const proposal = window.Proposals.state.rows.find(row =>
      String(row?.id || '').trim() === id || String(row?.proposal_id || '').trim() === id
    );
    if (!proposal) return;
    window.Proposals.upsertLocalRow?.({
      ...proposal,
      agreement_id: String(agreementId || proposal.agreement_id || '').trim(),
      status: String(proposal.status || '').trim() || 'Agreement Drafted'
    });
  },
  formatMoney(value) {
    const num = this.toNumberSafe(value);
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  },
  getPaymentTermDisplay(value = '') {
    const raw = String(value || '').trim();
    const map = {
      'net 7': 'Monthly',
      'net 14': 'Quarterly',
      'net 21': 'Semi-Annually',
      'net 30': 'Annually'
    };
    return map[raw.toLowerCase()] || raw;
  },
  formatMoneyWithCurrency(value, currency = '', includeZeroDecimals = false) {
    const amount = this.toNumberSafe(value);
    const normalizedCurrency = String(currency || '').trim().toUpperCase();
    const options = {
      minimumFractionDigits: includeZeroDecimals ? 2 : 0,
      maximumFractionDigits: 2
    };
    const formatted = amount.toLocaleString(undefined, options);
    return normalizedCurrency ? `${normalizedCurrency} ${formatted}` : formatted;
  },

  normalizeDiscount(value) {
    const raw = this.toNumberSafe(value);
    if (raw > 1) return raw / 100;
    if (raw < 0) return 0;
    return raw;
  },
  getTodayDateInputValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
  calculateServiceEndDate(startDateValue, monthsValue) {
    const startValue = this.normalizeDateInputValue(startDateValue);
    if (!startValue) return '';

    const months = Number(monthsValue || 0);
    if (!Number.isFinite(months) || months <= 0) return '';

    const start = new Date(`${startValue}T00:00:00`);
    if (Number.isNaN(start.getTime())) return '';

    const wholeMonths = Math.trunc(months);
    const fractionalMonths = months - wholeMonths;

    const endExclusive = new Date(start);
    if (wholeMonths > 0) {
      endExclusive.setMonth(endExclusive.getMonth() + wholeMonths);
    }

    if (fractionalMonths > 0) {
      const anchorMonth = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), 1);
      const daysInAnchorMonth = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth() + 1, 0).getDate();
      const extraDays = Math.max(1, Math.round(daysInAnchorMonth * fractionalMonths));
      endExclusive.setDate(endExclusive.getDate() + extraDays);
    }

    endExclusive.setDate(endExclusive.getDate() - 1);

    const endYear = endExclusive.getFullYear();
    const endMonth = String(endExclusive.getMonth() + 1).padStart(2, '0');
    const endDay = String(endExclusive.getDate()).padStart(2, '0');
    return `${endYear}-${endMonth}-${endDay}`;
  },
  parseAgreementLengthMonths(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 0;
    const numeric = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) return numeric <= 10 ? numeric * 12 : numeric;
    const match = raw.match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!match) return 0;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (/year|yr|annual|annually|annum/.test(raw)) return amount * 12;
    if (/week/.test(raw)) return amount / 4.345;
    if (/day/.test(raw)) return amount / 30.4375;
    return amount;
  },
  getAgreementCalculatedServiceEndDate(agreement = {}) {
    const start = this.normalizeDateInputValue(agreement.service_start_date || agreement.serviceStartDate || '');
    const length = agreement.agreement_length || agreement.agreementLength || agreement.contract_term || agreement.contractTerm || '';
    const months = this.parseAgreementLengthMonths(length);
    return this.calculateServiceEndDate(start, months);
  },
  applyAgreementDerivedDates(agreement = {}) {
    const next = agreement && typeof agreement === 'object' ? { ...agreement } : {};
    next.service_start_date = this.normalizeDateInputValue(next.service_start_date || next.serviceStartDate || '');
    const calculatedEnd = this.getAgreementCalculatedServiceEndDate(next);
    if (calculatedEnd) next.service_end_date = calculatedEnd;
    return next;
  },
  syncAgreementServiceEndDate() {
    const startInput = document.getElementById('agreementFormServiceStartDate');
    const lengthInput = document.getElementById('agreementFormAgreementLength');
    const endInput = document.getElementById('agreementFormServiceEndDate');
    if (!endInput) return '';
    const calculated = this.calculateServiceEndDate(
      this.normalizeDateInputValue(startInput?.value || ''),
      this.parseAgreementLengthMonths(lengthInput?.value || '')
    );
    endInput.value = calculated || '';
    endInput.readOnly = true;
    endInput.setAttribute('aria-readonly', 'true');
    endInput.classList.add('readonly-field', 'locked-field');
    return calculated;
  },
  isAgreementFromProposalContext(agreement = this.state.currentAgreement || {}) {
    const formSource = String(E.agreementForm?.dataset?.source || '').trim().toLowerCase();
    const formProposalUuid = String(E.agreementForm?.dataset?.proposalUuid || '').trim();
    return formSource === 'proposal' || !!formProposalUuid || !!String(agreement?.proposal_id || agreement?.proposalId || '').trim();
  },
  isProposalLockedAgreementContext(agreement = this.state.currentAgreement || {}) {
    return this.isAgreementFromProposalContext(agreement);
  },
  addMonthsMinusOneDay(startValue, monthsValue) {
    return this.calculateServiceEndDate(startValue, monthsValue);
  },
  getDefaultAnnualServiceStartDate() {
    return this.normalizeDateInputValue(document.getElementById('agreementFormAgreementDate')?.value || document.getElementById('agreementFormServiceStartDate')?.value) || this.getTodayDateInputValue();
  },
  getDefaultOfficialSignDate(agreement = {}) {
    // Signature dates must never default from agreement/proposal dates or today's date.
    // They stay empty unless the user explicitly enters a signature date.
    return '';
  },
  getCompanyAuthorizedSignatory(company = {}) {
    return {
      name: String(company?.authorized_signatory_full_name || company?.authorizedSignatoryFullName || '').trim(),
      title: String(company?.authorized_signatory_title || company?.authorizedSignatoryTitle || '').trim()
    };
  },
  hasCompanyAuthorizedSignatory(company = {}) {
    const signatory = this.getCompanyAuthorizedSignatory(company);
    return Boolean(signatory.name && signatory.title);
  },
  applyOfficialSignatoryDefaults(agreement = {}, company = null) {
    const next = agreement && typeof agreement === 'object' ? { ...agreement } : {};
    const explicitDate = (...values) => {
      for (const value of values) {
        const normalized = this.normalizeDateInputValue(value || '');
        if (normalized) return normalized;
      }
      return '';
    };
    const companySignatory = company ? this.getCompanyAuthorizedSignatory(company) : { name: '', title: '' };
    const customerName = companySignatory.name
      || String(next.customer_official_signatory_name || next.customerOfficialSignatoryName || next.customer_signatory_name || next.customerSignatoryName || '').trim();
    const customerTitle = companySignatory.title
      || String(next.customer_official_signatory_title || next.customerOfficialSignatoryTitle || next.customer_signatory_title || next.customerSignatoryTitle || '').trim();
    next.customer_official_signatory_name = customerName;
    next.customer_official_signatory_title = customerTitle;
    next.customer_official_sign_date = explicitDate(next.customer_official_sign_date, next.customerOfficialSignDate, next.customer_sign_date, next.customerSignDate);
    next.customer_signatory_name = customerName;
    next.customer_signatory_title = customerTitle;
    next.customer_sign_date = next.customer_official_sign_date;
    const primaryProviderSignDate = explicitDate(
      next.provider_official_signatory_1_sign_date,
      next.providerOfficialSignatory1SignDate,
      next.provider_sign_date,
      next.providerSignDate
    );
    const secondaryProviderSignDate = explicitDate(
      next.provider_official_signatory_2_sign_date,
      next.providerOfficialSignatory2SignDate
    );
    next.provider_official_signatory_1_name = this.providerIdentityDefaults.primarySignatoryName;
    next.provider_official_signatory_1_title = this.providerIdentityDefaults.primarySignatoryTitle;
    next.provider_official_signatory_1_sign_date = primaryProviderSignDate;
    next.provider_official_signatory_2_name = this.providerIdentityDefaults.secondarySignatoryName;
    next.provider_official_signatory_2_title = this.providerIdentityDefaults.secondarySignatoryTitle;
    next.provider_official_signatory_2_sign_date = secondaryProviderSignDate;
    next.provider_primary_signatory_name = next.provider_official_signatory_1_name;
    next.provider_primary_signatory_title = next.provider_official_signatory_1_title;
    next.provider_secondary_signatory_name = next.provider_official_signatory_2_name;
    next.provider_secondary_signatory_title = next.provider_official_signatory_2_title;
    next.provider_signatory_name_primary = next.provider_official_signatory_1_name;
    next.provider_signatory_title_primary = next.provider_official_signatory_1_title;
    next.provider_signatory_name_secondary = next.provider_official_signatory_2_name;
    next.provider_signatory_title_secondary = next.provider_official_signatory_2_title;
    next.provider_signatory_name = next.provider_official_signatory_1_name;
    next.provider_signatory_title = next.provider_official_signatory_1_title;
    next.provider_sign_date = primaryProviderSignDate;
    return next;
  },
  applyOfficialSignatoryDefaultsToForm(company = this.state.selectedAgreementCompanyForVerification || null) {
    const current = this.collectFormValues?.().agreement || {};
    const next = this.applyOfficialSignatoryDefaults(current, company);
    this.assignFormValues(next);
    this.updateAgreementCompanyVerificationUi(company);
  },
  computeCommercialRow(item = {}) {
    const section = String(item?.section || '').trim().toLowerCase();
    const unit = this.toNumberSafe(item.unit_price);
    let qty = this.toNumberSafe(item.quantity);
    if (!qty && section === 'annual_saas') qty = 12;
    if (!qty && section === 'one_time_fee') qty = 1;
    const rawDiscountRatio = this.normalizeDiscount(item.discount_percent);
    const discountRatio = section === 'annual_saas' && qty < 12 ? 0 : rawDiscountRatio;
    const baseAmount = section === 'annual_saas' ? unit * (qty / 12) : unit * qty;
    const discountedUnitPrice = section === 'annual_saas' ? baseAmount * (1 - discountRatio) : unit * (1 - discountRatio);
    return { ...item, quantity: qty, discount_percent: section === 'annual_saas' && qty < 12 ? 0 : item.discount_percent, discounted_unit_price: discountedUnitPrice, line_total: Math.max(0, baseAmount * (1 - discountRatio)) };
  },
  canExportAgreements() {
    return Permissions.canExport('agreements');
  },
  getFilteredAgreementRows() {
    return Array.isArray(this.state.filteredRows) ? [...this.state.filteredRows] : [];
  },
  getAgreementCustomerName(agreement = {}) {
    return String(
      agreement.customer_name ||
      agreement.customerName ||
      agreement.company_name ||
      agreement.companyName ||
      agreement.client_name ||
      agreement.clientName ||
      agreement.full_name ||
      agreement.fullName ||
      ''
    ).trim();
  },
  formatDateMMDDYYYY(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear());
    return `${month}/${day}/${year}`;
  },
  formatDateTimeMMDDYYYYHHMM(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = String(date.getFullYear());
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hour}:${minute}`;
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
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  exportAgreementsCsv() {
    if (!this.canExportAgreements()) {
      UI.toast('You do not have permission to export agreements.');
      return;
    }
    const rows = this.getFilteredAgreementRows();
    if (!rows.length) {
      UI.toast('No agreements match the current filters.');
      return;
    }
    const headers = [
      'Agreement ID', 'Agreement Number', 'Proposal ID', 'Proposal Number', 'Customer / Company', 'Contact Name', 'Email', 'Phone', 'Status',
      'Agreement Date', 'Effective Date', 'Service Start Date', 'Service End Date', 'Contract Length', 'Billing Cycle', 'Payment Terms',
      'Subtotal Locations', 'Subtotal One Time', 'Discount Percent', 'Discount Amount', 'Agreement Total', 'Currency', 'GM Signed',
      'Financial Controller Signed', 'Signed Date', 'Owner / Assigned To', 'Created At', 'Updated At', 'Notes'
    ];
    const pick = (row, keys = []) => {
      for (const key of keys) {
        if (row?.[key] !== undefined && row?.[key] !== null && String(row[key]).trim() !== '') return row[key];
      }
      return '';
    };
    const numericOrBlank = value => {
      if (value === null || value === undefined || String(value).trim() === '') return '';
      const numeric = Number(String(value).replace(/,/g, '').trim());
      return Number.isFinite(numeric) ? String(numeric) : '';
    };
    const yesNo = value => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (['true', '1', 'yes', 'y', 'signed'].includes(normalized)) return 'Yes';
      return 'No';
    };
    const bodyRows = rows.map(row => {
      const record = {
        agreementId: pick(row, ['agreement_id', 'agreementId']),
        agreementNumber: pick(row, ['agreement_number', 'agreementNumber']),
        proposalId: pick(row, ['proposal_id', 'proposalId']),
        proposalNumber: pick(row, ['proposal_number', 'proposalNumber']),
        customerName: this.getAgreementCustomerName(row),
        contactName: pick(row, ['contact_name', 'contactName', 'customer_contact_name', 'customerContactName']),
        email: pick(row, ['email', 'customer_contact_email', 'customerContactEmail']),
        phone: pick(row, ['phone', 'customer_contact_mobile', 'customerContactMobile']),
        status: pick(row, ['status']),
        agreementDate: this.formatDateMMDDYYYY(pick(row, ['agreement_date', 'agreementDate'])),
        effectiveDate: this.formatDateMMDDYYYY(pick(row, ['effective_date', 'effectiveDate'])),
        serviceStartDate: this.formatDateMMDDYYYY(pick(row, ['service_start_date', 'serviceStartDate'])),
        serviceEndDate: this.formatDateMMDDYYYY(pick(row, ['service_end_date', 'serviceEndDate'])),
        contractLength: pick(row, ['contract_length', 'contractLength', 'agreement_length', 'agreementLength']),
        billingCycle: pick(row, ['billing_cycle', 'billingCycle', 'billing_frequency', 'billingFrequency']),
        paymentTerms: this.getPaymentTermDisplay(pick(row, ['payment_terms', 'paymentTerms', 'payment_term', 'paymentTerm'])),
        subtotalLocations: numericOrBlank(pick(row, ['subtotal_locations', 'subtotalLocations', 'saas_total', 'saasTotal'])),
        subtotalOneTime: numericOrBlank(pick(row, ['subtotal_one_time', 'subtotalOneTime', 'one_time_total', 'oneTimeTotal'])),
        discountPercent: numericOrBlank(pick(row, ['discount_percent', 'discountPercent', 'total_discount_percent', 'totalDiscountPercent'])),
        discountAmount: numericOrBlank(pick(row, ['discount_amount', 'discountAmount', 'total_discount', 'totalDiscount'])),
        agreementTotal: numericOrBlank(this.calculateTotalsFromAgreementRecord(row).grand_total),
        currency: pick(row, ['currency']),
        gmSigned: yesNo(pick(row, ['gm_signed', 'gmSigned'])),
        financialControllerSigned: yesNo(pick(row, ['financial_controller_signed', 'financialControllerSigned'])),
        signedDate: this.formatDateMMDDYYYY(pick(row, ['signed_date', 'signedDate'])),
        owner: pick(row, ['owner', 'assigned_to', 'assignedTo', 'generated_by', 'generatedBy']),
        createdAt: this.formatDateTimeMMDDYYYYHHMM(pick(row, ['created_at', 'createdAt'])),
        updatedAt: this.formatDateTimeMMDDYYYYHHMM(pick(row, ['updated_at', 'updatedAt'])),
        notes: pick(row, ['notes'])
      };
      const values = [
        record.agreementId, record.agreementNumber, record.proposalId, record.proposalNumber, record.customerName, record.contactName, record.email, record.phone,
        record.status, record.agreementDate, record.effectiveDate, record.serviceStartDate, record.serviceEndDate, record.contractLength, record.billingCycle,
        record.paymentTerms, record.subtotalLocations, record.subtotalOneTime, record.discountPercent, record.discountAmount, record.agreementTotal, record.currency,
        record.gmSigned, record.financialControllerSigned, record.signedDate, record.owner, record.createdAt, record.updatedAt, record.notes
      ];
      return values.map(value => this.csvEscape(value)).join(',');
    });
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const csvText = `${headers.map(header => this.csvEscape(header)).join(',')}\n${bodyRows.join('\n')}`;
    this.downloadCsv(`agreements-export-${stamp}.csv`, csvText);
    UI.toast(`Exported ${rows.length} agreement${rows.length === 1 ? '' : 's'} to CSV.`);
  },
  agreementFieldToFormInputId(field = '') {
    return `agreementForm${String(field || '').split('_').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`;
  },
  normalizeDateFieldsForSave(record = {}, dateFields = []) {
    const next = record && typeof record === 'object' ? { ...record } : {};
    (Array.isArray(dateFields) ? dateFields : []).forEach(field => {
      const raw = next[field];
      const trimmed = typeof raw === 'string' ? raw.trim() : raw;
      next[field] = trimmed ? trimmed : null;
    });
    return next;
  },
  normalizeAgreement(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const normalized = {};
    this.agreementFields.forEach(field => {
      const camel = field.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
      const value = source[field] ?? source[camel] ?? '';
      normalized[field] = typeof value === 'string' ? value.trim() : value;
    });
    normalized.id = String(source.id || normalized.id || '').trim();
    normalized.agreement_id = String(normalized.agreement_id || source.agreementId || '').trim();
    normalized.agreement_number = String(normalized.agreement_number || '').trim();
    normalized.agreement_title = String(normalized.agreement_title || '').trim();
    normalized.agreement_length = String(normalized.agreement_length || source.contract_term || '').trim();
    normalized.service_end_date = String(
      normalized.service_end_date || source.serviceEndDate || source.contract_end_date || source.contractEndDate || ''
    ).trim();
    normalized.provider_signatory_name_primary = String(
      normalized.provider_signatory_name_primary || source.provider_signatory_name || ''
    ).trim();
    normalized.provider_signatory_name_secondary = String(
      normalized.provider_signatory_name_secondary || source.provider_signatory_secondary || ''
    ).trim();
    normalized.provider_signatory_title_primary = String(
      normalized.provider_signatory_title_primary || source.provider_signatory_title || ''
    ).trim();
    const normalizedTotals = this.calculateTotalsFromAgreementRecord({ ...source, ...normalized });
    normalized.saas_total = normalizedTotals.saas_total;
    normalized.one_time_total = normalizedTotals.one_time_total;
    normalized.subtotal_locations = normalizedTotals.saas_total;
    normalized.subtotal_one_time = normalizedTotals.one_time_total;
    normalized.total_discount = this.toNumberSafe(source.total_discount ?? normalized.total_discount);
    normalized.grand_total = normalizedTotals.grand_total;
    normalized.gm_signed = this.toDbBoolean(source.gm_signed ?? source.gmSigned ?? normalized.gm_signed, false);
    normalized.financial_controller_signed = this.toDbBoolean(
      source.financial_controller_signed ?? source.financialControllerSigned ?? normalized.financial_controller_signed,
      false
    );
    normalized.customer_name = String(normalized.customer_name || '').trim();
    normalized.contact_name = this.buildContactPersonName({ ...source, contact_name: normalized.contact_name || normalized.customer_contact_name }) || String(normalized.contact_name || '').trim();
    normalized.customer_contact_name = this.buildContactPersonName({ ...source, contact_name: normalized.customer_contact_name || normalized.contact_name }) || String(normalized.customer_contact_name || '').trim();
    normalized.status = String(normalized.status || '').trim() || 'Draft';
    normalized.currency = String(normalized.currency || '').trim();
    normalized.billing_frequency = 'Annual';
    normalized.is_poc = this.toDbBoolean(source.is_poc ?? source.isPoc ?? normalized.is_poc, false);
    normalized.poc_location_count = this.toNullableNumber(source.poc_location_count ?? source.pocLocationCount ?? normalized.poc_location_count);
    normalized.poc_license_count = this.toNullableNumber(source.poc_license_count ?? source.pocLicenseCount ?? normalized.poc_license_count);
    normalized.poc_license_months = this.toNullableNumber(source.poc_license_months ?? source.pocLicenseMonths ?? normalized.poc_license_months);
    normalized.poc_service_start_date = this.normalizeDateInputValue(source.poc_service_start_date ?? source.pocServiceStartDate ?? normalized.poc_service_start_date);
    normalized.poc_service_end_date = this.normalizeDateInputValue(source.poc_service_end_date ?? source.pocServiceEndDate ?? normalized.poc_service_end_date);
    normalized.poc_success_kpis = String(source.poc_success_kpis ?? source.pocSuccessKpis ?? normalized.poc_success_kpis ?? '').trim();
    normalized.poc_conversion_commitment = String(source.poc_conversion_commitment ?? source.pocConversionCommitment ?? normalized.poc_conversion_commitment ?? '').trim();
    const validPaymentTerms = ['Net 7', 'Net 14', 'Net 21', 'Net 30'];
    normalized.payment_term = validPaymentTerms.includes(String(normalized.payment_term || '').trim())
      ? String(normalized.payment_term || '').trim()
      : 'Net 30';
    normalized.provider_legal_name = this.providerIdentityDefaults.legalName;
    normalized.provider_name = this.providerIdentityDefaults.name;
    normalized.provider_address = this.providerIdentityDefaults.address;
    normalized.provider_contact_name = this.providerIdentityDefaults.contactName;
    normalized.provider_contact_mobile = this.providerIdentityDefaults.contactMobile;
    normalized.provider_contact_email = this.providerIdentityDefaults.contactEmail;
    normalized.customer_official_signatory_name = String(normalized.customer_official_signatory_name || source.customerOfficialSignatoryName || normalized.customer_signatory_name || source.customerSignatoryName || '').trim();
    normalized.customer_official_signatory_title = String(normalized.customer_official_signatory_title || source.customerOfficialSignatoryTitle || normalized.customer_signatory_title || source.customerSignatoryTitle || '').trim();
    normalized.customer_official_sign_date = this.normalizeDateInputValue(normalized.customer_official_sign_date || source.customerOfficialSignDate || normalized.customer_sign_date || source.customerSignDate || '');
    normalized.customer_signatory_name = normalized.customer_official_signatory_name;
    normalized.customer_signatory_title = normalized.customer_official_signatory_title;
    normalized.customer_sign_date = normalized.customer_official_sign_date || this.normalizeDateInputValue(normalized.customer_sign_date || source.customerSignDate || '');
    normalized.customer_signatory_email = String(normalized.customer_signatory_email || '').trim()
      || String(normalized.customer_contact_email || normalized.contact_email || '').trim();
    normalized.customer_signatory_phone = String(normalized.customer_signatory_phone || '').trim()
      || String(normalized.customer_contact_mobile || normalized.contact_mobile || normalized.customer_contact_phone || normalized.contact_phone || '').trim();
    normalized.provider_primary_signatory_name = String(normalized.provider_primary_signatory_name || normalized.provider_signatory_name_primary || '').trim()
      || this.providerIdentityDefaults.primarySignatoryName;
    normalized.provider_primary_signatory_title = String(normalized.provider_primary_signatory_title || normalized.provider_signatory_title_primary || '').trim()
      || this.providerIdentityDefaults.primarySignatoryTitle;
    normalized.provider_secondary_signatory_name = String(normalized.provider_secondary_signatory_name || normalized.provider_signatory_name_secondary || '').trim()
      || this.providerIdentityDefaults.secondarySignatoryName;
    normalized.provider_secondary_signatory_title = String(normalized.provider_secondary_signatory_title || normalized.provider_signatory_title_secondary || '').trim()
      || this.providerIdentityDefaults.secondarySignatoryTitle;
    return this.applyOfficialSignatoryDefaults(normalized);
  },
  getCompanyLegalName(company = {}) {
    return String(company?.legal_name || company?.legalName || company?.company_name || company?.companyName || '').trim();
  },
  async getFullCompanyRecord(companyIdOrRecord) {
    const seed = companyIdOrRecord && typeof companyIdOrRecord === 'object' ? companyIdOrRecord : {};
    const companyId = companyIdOrRecord && typeof companyIdOrRecord === 'object' ? (seed.company_id || seed.companyId) : companyIdOrRecord;
    const hasFullFields = seed.legal_name || seed.legalName || seed.address || seed.company_name || seed.companyName;
    if (hasFullFields) return seed;
    if (!companyId) return null;
    const response = await Api.requestWithSession('companies', 'list', { filters: { company_id: companyId }, limit: 1 }, { requireAuth: true });
    const rows = response?.rows || response?.items || response?.data || [];
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row && typeof row === 'object' ? row : null;
  },
  async applyCompanyIdentityToAgreement(agreement = {}, { allowFallbackToAgreement = false } = {}) {
    const next = agreement && typeof agreement === 'object' ? { ...agreement } : {};
    const selectedCompany = await this.getFullCompanyRecord(next.company_id || next.companyId || {});
    const customerLegalName = this.getCompanyLegalName(selectedCompany || {});
    if (selectedCompany) {
      next.company_id = String(selectedCompany.company_id || selectedCompany.companyId || next.company_id || '').trim();
      next.company_name = String(selectedCompany.company_name || selectedCompany.companyName || '').trim();
      next.customer_address = String(selectedCompany.address || '').trim();
      next.customer_legal_name = customerLegalName;
      next.customer_name = customerLegalName;
      return this.applyOfficialSignatoryDefaults(next, selectedCompany);
    }
    if (allowFallbackToAgreement) {
      const fallback = String(next.customer_legal_name || '').trim();
      next.customer_legal_name = fallback;
      next.customer_name = fallback || String(next.customer_name || '').trim();
    }
    return this.applyOfficialSignatoryDefaults(next);
  },

  normalizeProposalStatusForConversion(proposal = {}) {
    return String(proposal?.status || '').trim().toLowerCase();
  },
  isProposalAcceptedForConversion(proposal = {}) {
    return this.normalizeProposalStatusForConversion(proposal) === 'accepted';
  },
  isCompanyVerified(company = {}) {
    const verified = company?.documents_verified === true || company?.documentsVerified === true;
    const status = String(
      company?.documents_verification_status ||
      company?.documentsVerificationStatus ||
      ''
    ).trim().toLowerCase();

    return verified && status === 'verified';
  },
  getCompanyVerificationBadgeLabel(company = {}) {
    if (!company || typeof company !== 'object' || !Object.keys(company).length) return '';
    if (this.isCompanyVerified(company)) return 'Verified';
    const status = String(company.documents_verification_status || company.documentsVerificationStatus || '').trim().toLowerCase();
    const hasVerificationSignal = Boolean(company.documents_verified || company.documentsVerified || status);
    if (hasVerificationSignal && status && status !== 'not_verified') return 'Needs re-verification';
    return 'Not verified';
  },
  updateAgreementCompanyVerificationUi(company = null) {
    const statusEl = document.getElementById('agreementCompanyVerificationStatus');
    const warningEl = document.getElementById('agreementCompanyVerificationWarning');
    const signatoryWarningEl = document.getElementById('agreementCompanySignatoryWarning');
    if (!statusEl && !warningEl && !signatoryWarningEl) return;
    const label = company ? this.getCompanyVerificationBadgeLabel(company) : '';
    const verified = company ? this.isCompanyVerified(company) : false;
    if (statusEl) {
      if (!label) {
        statusEl.innerHTML = '';
      } else {
        const color = verified ? '#15803d' : label === 'Needs re-verification' ? '#b45309' : '#b91c1c';
        const background = verified ? 'rgba(21,128,61,.10)' : label === 'Needs re-verification' ? 'rgba(180,83,9,.12)' : 'rgba(185,28,28,.10)';
        statusEl.innerHTML = `<span class="badge" style="color:${color};background:${background};border:1px solid ${color};">${U.escapeHtml(label)}</span>`;
      }
    }
    if (warningEl) warningEl.style.display = company && !verified ? '' : 'none';
    if (signatoryWarningEl) signatoryWarningEl.style.display = company && !this.hasCompanyAuthorizedSignatory(company) ? '' : 'none';
  },
  hasCompanyVerificationFields(record = {}) {
    const hasVerifiedFlag = Object.prototype.hasOwnProperty.call(record, 'documents_verified')
      || Object.prototype.hasOwnProperty.call(record, 'documentsVerified');
    const hasVerificationStatus = Object.prototype.hasOwnProperty.call(record, 'documents_verification_status')
      || Object.prototype.hasOwnProperty.call(record, 'documentsVerificationStatus');
    return hasVerifiedFlag && hasVerificationStatus;
  },
  showBlockingDialog(title, message) {
    const safeTitle = U.escapeHtml(String(title || 'Action blocked'));
    const safeMessage = U.escapeHtml(String(message || '').trim());
    let modal = document.getElementById('agreementBlockingDialog');
    if (!modal) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="agreementBlockingDialog" class="modal" role="dialog" aria-modal="true" aria-hidden="true">
          <div class="modal-content" style="max-width:560px;">
            <div class="modal-header">
              <h2 id="agreementBlockingDialogTitle" style="margin:0;font-size:20px"></h2>
              <button class="modal-close" id="agreementBlockingDialogClose" type="button" aria-label="Close dialog">✕</button>
            </div>
            <p id="agreementBlockingDialogMessage" style="margin:12px 0 0;"></p>
            <div class="actions" style="justify-content:flex-end;margin-top:16px;">
              <button id="agreementBlockingDialogOk" type="button" class="btn primary">OK</button>
            </div>
          </div>
        </div>`);
      modal = document.getElementById('agreementBlockingDialog');
    }
    const titleEl = document.getElementById('agreementBlockingDialogTitle');
    const messageEl = document.getElementById('agreementBlockingDialogMessage');
    if (titleEl) titleEl.innerHTML = safeTitle;
    if (messageEl) messageEl.innerHTML = safeMessage;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    return new Promise(resolve => {
      let resolved = false;
      const close = () => {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      };
      const closeBtn = document.getElementById('agreementBlockingDialogClose');
      const okBtn = document.getElementById('agreementBlockingDialogOk');
      if (closeBtn) closeBtn.onclick = close;
      if (okBtn) okBtn.onclick = close;
      modal.onclick = event => { if (event.target === modal) close(); };
    });
  },
  async queryCompanyForVerification(column, value) {
    const lookupValue = String(value || '').trim();
    if (!lookupValue) return null;
    const client = window.SupabaseClient?.getClient?.() || window.supabaseClient || window.supabase;
    if (client?.from) {
      let query = client.from('companies').select('*').limit(1);
      if (column === 'legal_name' || column === 'company_name') query = query.ilike(column, lookupValue);
      else query = query.eq(column, lookupValue);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (data && typeof data === 'object') return data;
    }
    if (window.Api?.requestWithSession) {
      const response = await Api.requestWithSession('companies', 'list', { filters: { [column]: lookupValue }, limit: 1 }, { requireAuth: true });
      const rows = response?.rows || response?.items || response?.data || [];
      const row = Array.isArray(rows) ? rows[0] : rows;
      return row && typeof row === 'object' ? row : null;
    }
    return null;
  },
  async getCompanyForAgreementVerification(companyOrAgreementPayload = {}) {
    const source = companyOrAgreementPayload && typeof companyOrAgreementPayload === 'object' ? companyOrAgreementPayload : {};
    const embeddedCompany = source.company && typeof source.company === 'object' ? source.company : null;
    const selectedCompany = this.state.selectedAgreementCompanyForVerification && typeof this.state.selectedAgreementCompanyForVerification === 'object'
      ? this.state.selectedAgreementCompanyForVerification
      : null;
    const candidates = [source, embeddedCompany, selectedCompany].filter(candidate => candidate && typeof candidate === 'object');
    const firstText = keys => {
      for (const candidate of candidates) {
        for (const key of keys) {
          const value = String(candidate?.[key] || '').trim();
          if (value) return value;
        }
      }
      return '';
    };

    const companyUuid = String(
      source.company_uuid || source.companyUuid || embeddedCompany?.id || selectedCompany?.id || ''
    ).trim();
    if (companyUuid) {
      const byUuid = await this.queryCompanyForVerification('id', companyUuid);
      if (byUuid) return byUuid;
    }

    const companyId = firstText(['company_id', 'companyId']);
    if (companyId) {
      const byCompanyId = await this.queryCompanyForVerification('company_id', companyId);
      if (byCompanyId) return byCompanyId;
    }

    const legalName = String(
      source.legal_company_name || source.legalCompanyName || source.legal_name || source.legalName
      || source.customer_legal_name || source.customerLegalName || embeddedCompany?.legal_company_name || embeddedCompany?.legalCompanyName
      || embeddedCompany?.legal_name || embeddedCompany?.legalName || selectedCompany?.legal_company_name || selectedCompany?.legalCompanyName
      || selectedCompany?.legal_name || selectedCompany?.legalName || ''
    ).trim();
    if (legalName) {
      const byLegalName = await this.queryCompanyForVerification('legal_name', legalName);
      if (byLegalName) return byLegalName;
    }

    const companyName = String(source.company_name || source.companyName || source.customer_name || source.customerName || embeddedCompany?.company_name || embeddedCompany?.companyName || selectedCompany?.company_name || selectedCompany?.companyName || '').trim();
    if (companyName) {
      const byCompanyName = await this.queryCompanyForVerification('company_name', companyName);
      if (byCompanyName) return byCompanyName;
    }

    return null;
  },
  async getProposalCompanyForVerification(proposal = {}) {
    return this.getCompanyForAgreementVerification(proposal);
  },
  async ensureCompanyVerifiedBeforeAgreement(companyOrAgreementPayload = {}) {
    const source = companyOrAgreementPayload && typeof companyOrAgreementPayload === 'object' ? companyOrAgreementPayload : {};
    const hasAnyCompanyReference = Boolean(
      String(source.company_uuid || source.companyUuid || source.company?.id || '').trim()
      || String(source.company_id || source.companyId || source.company?.company_id || source.company?.companyId || '').trim()
      || String(source.legal_company_name || source.legalCompanyName || source.legal_name || source.legalName || source.customer_legal_name || source.customerLegalName || source.company?.legal_name || source.company?.legalName || '').trim()
      || String(source.company_name || source.companyName || source.customer_name || source.customerName || source.company?.company_name || source.company?.companyName || '').trim()
    );
    if (!hasAnyCompanyReference) {
      await this.showBlockingDialog('Company Required', 'Please select a company before creating an agreement.');
      return false;
    }
    const company = await this.getCompanyForAgreementVerification(source);
    if (!company) {
      await this.showBlockingDialog(
        'Company Verification Required',
        'Unable to confirm the company verification status. Please open the company profile, upload the required documents, and make sure an admin verifies them before creating an agreement.'
      );
      return false;
    }
    if (!this.isCompanyVerified(company)) {
      await this.showBlockingDialog(
        'Company Not Verified',
        'The company is still not verified. Please upload the company documents and make sure an admin verifies them before converting this proposal to an agreement.'
      );
      return false;
    }
    if (!this.hasCompanyAuthorizedSignatory(company)) {
      await this.showBlockingDialog(
        'Company Authorized Signatory Required',
        'Company authorized signatory details are missing. Please update the company profile before creating the agreement.'
      );
      return false;
    }
    return true;
  },
  async guardProposalConversionAllowed(proposal = {}) {
    if (!this.isProposalAcceptedForConversion(proposal)) {
      UI.toast('Proposal must be accepted before converting to agreement.');
      return false;
    }
    if (!String(proposal?.signed_document_path || proposal?.signedDocumentPath || '').trim()) {
      UI.toast('You should upload the signed document before converting it to an agreement.');
      return false;
    }
    return this.ensureCompanyVerifiedBeforeAgreement(proposal);
  },
  normalizeItem(raw = {}, sectionFallback = '') {
    const source = raw && typeof raw === 'object' ? raw : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };
    const section = String(pick(source.section, source.type, sectionFallback)).trim().toLowerCase();
    const normalized = {
      item_id: String(pick(source.item_id, source.itemId, source.id)).trim(),
      agreement_id: String(pick(source.agreement_id, source.agreementId)).trim(),
      section,
      line_no: this.toNumberSafe(pick(source.line_no, source.lineNo, source.line)),
      location_name: String(pick(source.location_name, source.locationName)).trim(),
      location_address: String(pick(source.location_address, source.locationAddress)).trim(),
      service_start_date: this.normalizeDateInputValue(pick(source.service_start_date, source.serviceStartDate)),
      service_end_date: this.normalizeDateInputValue(pick(source.service_end_date, source.serviceEndDate)),
      item_name: String(pick(source.item_name, source.itemName, source.name)).trim(),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.toNumberSafe(pick(source.discount_percent, source.discountPercent)),
      discounted_unit_price: this.toNumberSafe(pick(source.discounted_unit_price, source.discountedUnitPrice)),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty)),
      line_total: this.toNumberSafe(pick(source.line_total, source.lineTotal)),
      capability_name: String(pick(source.capability_name, source.capabilityName)).trim(),
      capability_value: String(pick(source.capability_value, source.capabilityValue)).trim(),
      notes: String(pick(source.notes)).trim(),
      updated_at: String(pick(source.updated_at, source.updatedAt)).trim(),
      invoice_status: String(pick(source.invoice_status, source.invoiceStatus) || 'not_invoiced').trim(),
      invoiced_invoice_id: String(pick(source.invoiced_invoice_id, source.invoicedInvoiceId)).trim(),
      invoiced_at: String(pick(source.invoiced_at, source.invoicedAt)).trim()
    };
    if (section === 'annual_saas') {
      if (!normalized.quantity) normalized.quantity = 12;
      if (!normalized.service_start_date) normalized.service_start_date = this.getDefaultAnnualServiceStartDate();
      if (!normalized.service_end_date) normalized.service_end_date = this.calculateServiceEndDate(normalized.service_start_date, normalized.quantity);
    } else if (section === 'one_time_fee' && !normalized.quantity) {
      normalized.quantity = 1;
    }
    if (section === 'annual_saas' || section === 'one_time_fee') {
      const computed = this.computeCommercialRow(normalized);
      if (!normalized.discounted_unit_price) normalized.discounted_unit_price = computed.discounted_unit_price;
      if (!normalized.line_total) normalized.line_total = computed.line_total;
    }
    return normalized;
  },
  groupedItems(items = []) {
    const grouped = { annual_saas: [], one_time_fee: [], capability: [] };
    (Array.isArray(items) ? items : []).forEach(raw => {
      const item = this.normalizeItem(raw);
      if (item.section === 'capability') grouped.capability.push(item);
      else if (item.section === 'one_time_fee') grouped.one_time_fee.push(item);
      else grouped.annual_saas.push({ ...item, section: 'annual_saas' });
    });
    return grouped;
  },
  emptyAgreement() {
    return {
      agreement_id: '', agreement_number: '', proposal_id: '', deal_id: '', lead_id: '', agreement_title: '',
      agreement_date: '', effective_date: '', service_start_date: '', service_end_date: '', agreement_length: '', account_number: '',
      billing_frequency: 'Annual', payment_term: 'Net 30', po_number: '', currency: '', customer_name: '',
      customer_legal_name: '', customer_address: '', customer_contact_name: '', customer_contact_mobile: '',
      customer_contact_email: '', provider_name: '', provider_legal_name: '', provider_address: '',
      provider_contact_name: '', provider_contact_mobile: '', provider_contact_email: '', status: 'Draft',
      terms_conditions: '', customer_official_signatory_name: '', customer_official_signatory_title: '', customer_official_sign_date: '',
      customer_signatory_name: '', customer_signatory_title: '',
      provider_official_signatory_1_name: this.providerIdentityDefaults.primarySignatoryName, provider_official_signatory_1_title: this.providerIdentityDefaults.primarySignatoryTitle, provider_official_signatory_1_sign_date: '',
      provider_official_signatory_2_name: this.providerIdentityDefaults.secondarySignatoryName, provider_official_signatory_2_title: this.providerIdentityDefaults.secondarySignatoryTitle, provider_official_signatory_2_sign_date: '',
      provider_signatory_name_primary: this.providerIdentityDefaults.primarySignatoryName, provider_signatory_title_primary: this.providerIdentityDefaults.primarySignatoryTitle,
      provider_signatory_name_secondary: this.providerIdentityDefaults.secondarySignatoryName, provider_signatory_title_secondary: this.providerIdentityDefaults.secondarySignatoryTitle, provider_sign_date: '',
      customer_sign_date: '', gm_signed: false, financial_controller_signed: false, signed_date: '', total_discount: '',
      generated_by: '', notes: ''
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
  generateAgreementBusinessId() {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const suffix = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `AG-${stamp}-${suffix}`;
  },
  generateAgreementNumber() {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const suffix = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `AGR-${stamp}-${suffix}`;
  },
  ensureAgreementBusinessIdentifiers(agreement = {}) {
    const next = agreement && typeof agreement === 'object' ? { ...agreement } : {};
    next.agreement_id = String(next.agreement_id || '').trim() || this.generateAgreementBusinessId();
    next.agreement_number = String(next.agreement_number || '').trim() || this.generateAgreementNumber();
    return next;
  },
  generateAgreementItemId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `agr-item-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  },
  prepareAgreementItemForSave(item = {}) {
    const section = String(item?.section || '').trim().toLowerCase();
    const next = { ...(item && typeof item === 'object' ? item : {}) };
    next.section = section || 'annual_saas';
    delete next.created_at;
    delete next.updated_at;
    const blankText = value => value === undefined || value === null || String(value).trim() === '';
    if (blankText(next.invoiced_at)) delete next.invoiced_at;
    if (next.section === 'annual_saas') {
      next.service_start_date = this.normalizeDateInputValue(next.service_start_date);
      next.service_end_date = this.calculateServiceEndDate(next.service_start_date, next.quantity);
    } else {
      delete next.service_start_date;
      delete next.service_end_date;
    }
    Object.keys(next).forEach(key => {
      if (next[key] === undefined || (typeof next[key] === 'string' && next[key].trim() === '')) {
        if (['service_start_date', 'service_end_date', 'invoiced_at'].includes(key)) delete next[key];
      }
    });
    return next;
  },
  hydrateItemIdsForSave(items = [], { isCreate = false } = {}) {
    return (Array.isArray(items) ? items : []).map((item, index) => {
      const normalized = this.normalizeItem({ ...item, line_no: index + 1 }, item?.section || '');
      const next = { ...normalized, line_no: index + 1 };
      if (isCreate || !String(next.item_id || '').trim()) {
        next.item_id = this.generateAgreementItemId();
      }
      return this.prepareAgreementItemForSave(next);
    });
  },
  mapProposalItemToAgreementDraftItem(item = {}, index = 0) {
    const source = item && typeof item === 'object' ? item : {};
    const section = String(source.section || source.item_section || source.type || 'annual_saas').trim().toLowerCase() || 'annual_saas';
    return this.normalizeItem(
      {
        section,
        line_no: Number(source.line_no || index + 1) || index + 1,
        location_name: source.location_name || source.locationName || '',
        location_address: source.location_address || source.locationAddress || '',
        service_start_date: source.service_start_date || source.serviceStartDate || '',
        service_end_date: source.service_end_date || source.serviceEndDate || '',
        item_name: source.item_name || source.itemName || source.name || '',
        unit_price: source.unit_price ?? source.unitPrice ?? 0,
        discount_percent: source.discount_percent ?? source.discountPercent ?? 0,
        discounted_unit_price: source.discounted_unit_price ?? source.discountedUnitPrice ?? 0,
        quantity: source.quantity ?? source.qty ?? 0,
        line_total: source.line_total ?? source.lineTotal ?? 0,
        capability_name: source.capability_name || source.capabilityName || '',
        capability_value: source.capability_value || source.capabilityValue || '',
        notes: source.notes || ''
      },
      section
    );
  },
  buildDraftAgreementFromProposal(proposal = {}, proposalItems = []) {
    const source = proposal && typeof proposal === 'object' ? proposal : {};
    const proposalUuid = String(source.id || source.proposal_uuid || '').trim();
    const draft = this.normalizeAgreement({
      ...this.emptyAgreement(),
      proposal_id: proposalUuid,
      deal_id: String(source.deal_id || source.dealId || '').trim(),
      lead_id: String(source.lead_id || source.leadId || '').trim(),
      agreement_title: String(source.proposal_title || source.title || '').trim(),
      agreement_date: String(source.proposal_date || '').trim(),
      effective_date: String(source.proposal_date || '').trim(),
      service_start_date: String(source.service_start_date || source.serviceStartDate || '').trim(),
      service_end_date: this.normalizeDateInputValue(source.service_end_date || source.serviceEndDate || ''),
      agreement_length: String(source.contract_term || source.agreement_length || source.agreementLength || '').trim(),
      account_number: this.ensureAccountNumber(source.account_number || source.accountNumber || ''),
      billing_frequency: String(source.billing_frequency || source.billingFrequency || '').trim(),
      payment_term: String(source.payment_term || source.paymentTerm || '').trim(),
      po_number: String(source.po_number || source.poNumber || '').trim(),
      is_poc: this.toDbBoolean(source.is_poc ?? source.isPoc, false),
      poc_location_count: this.toNullableNumber(source.poc_location_count ?? source.pocLocationCount),
      poc_license_count: this.toNullableNumber(source.poc_license_count ?? source.pocLicenseCount),
      poc_license_months: this.toNullableNumber(source.poc_license_months ?? source.pocLicenseMonths),
      poc_service_start_date: this.normalizeDateInputValue(source.poc_service_start_date ?? source.pocServiceStartDate),
      poc_service_end_date: this.normalizeDateInputValue(source.poc_service_end_date ?? source.pocServiceEndDate),
      poc_success_kpis: String(source.poc_success_kpis ?? source.pocSuccessKpis ?? this.getDefaultPocSuccessKpis()).trim(),
      poc_conversion_commitment: String(source.poc_conversion_commitment ?? source.pocConversionCommitment ?? this.getDefaultPocConversionCommitment()).trim(),
      currency: String(source.currency || '').trim(),
      company_id: String(source.company_id || source.companyId || '').trim(),
      company_name: String(source.company_name || source.companyName || '').trim(),
      contact_id: String(source.contact_id || source.contactId || '').trim(),
      contact_name: String(source.contact_name || source.contactName || '').trim(),
      contact_email: String(source.contact_email || source.contactEmail || '').trim(),
      contact_phone: String(source.contact_phone || source.contactPhone || '').trim(),
      contact_mobile: String(source.contact_mobile || source.contactMobile || '').trim(),
      customer_name: String(source.customer_name || source.customerName || '').trim(),
      customer_legal_name: String(source.customer_legal_name || source.customerLegalName || source.company_name || source.companyName || source.customer_name || '').trim(),
      customer_address: String(source.customer_address || source.customerAddress || '').trim(),
      customer_contact_name: this.buildContactPersonName(source),
      customer_contact_mobile: String(source.customer_contact_mobile || source.customerContactMobile || '').trim(),
      customer_contact_email: String(source.customer_contact_email || source.customerContactEmail || '').trim(),
      provider_name: String(source.provider_name || source.providerName || '').trim(),
      provider_legal_name: String(source.provider_legal_name || source.providerLegalName || '').trim(),
      provider_address: String(source.provider_address || source.providerAddress || '').trim(),
      provider_contact_name: this.providerIdentityDefaults.contactName,
      provider_contact_mobile: this.providerIdentityDefaults.contactMobile,
      provider_contact_email: this.providerIdentityDefaults.contactEmail,
      terms_conditions: String(source.terms_conditions || source.termsConditions || '').trim(),
      customer_official_signatory_name: '',
      customer_official_signatory_title: '',
      customer_signatory_name: '',
      customer_signatory_title: '',
      provider_official_signatory_1_name: this.providerIdentityDefaults.primarySignatoryName,
      provider_official_signatory_1_title: this.providerIdentityDefaults.primarySignatoryTitle,
      provider_official_signatory_1_sign_date: '',
      provider_official_signatory_2_name: this.providerIdentityDefaults.secondarySignatoryName,
      provider_official_signatory_2_title: this.providerIdentityDefaults.secondarySignatoryTitle,
      provider_official_signatory_2_sign_date: '',
      provider_signatory_name_primary: this.providerIdentityDefaults.primarySignatoryName,
      provider_signatory_title_primary: this.providerIdentityDefaults.primarySignatoryTitle,
      provider_signatory_name_secondary: this.providerIdentityDefaults.secondarySignatoryName,
      provider_signatory_title_secondary: this.providerIdentityDefaults.secondarySignatoryTitle,
      provider_sign_date: '',
      customer_official_sign_date: '',
      customer_sign_date: '',
      gm_signed: this.toDbBoolean(source.gm_signed ?? source.gmSigned, false),
      financial_controller_signed: this.toDbBoolean(
        source.financial_controller_signed ?? source.financialControllerSigned,
        false
      ),
      generated_by: String(source.generated_by || source.generatedBy || '').trim(),
      status: 'Draft'
    });
    Object.assign(draft, this.applyAgreementDerivedDates(draft));
    const mappedItems = (Array.isArray(proposalItems) ? proposalItems : []).map((item, index) =>
      this.mapProposalItemToAgreementDraftItem(item, index)
    );
    const lockedGroups = this.syncOneTimeFeeRowsWithAnnualCount(this.groupedItems(mappedItems));
    const draftItems = [...lockedGroups.annual_saas, ...lockedGroups.one_time_fee];
    const totals = this.calculateTotals(draftItems);
    draft.saas_total = totals.saas_total;
    draft.one_time_total = totals.one_time_total;
    draft.grand_total = totals.grand_total;
    return { agreement: draft, items: draftItems };
  },

  buildContactPersonName(contact = {}) {
    const first = String(contact.first_name || contact.firstName || '').trim();
    const last = String(contact.last_name || contact.lastName || '').trim();
    const name = [first, last].filter(Boolean).join(' ').trim();
    if (name) return name;
    const stripEmailSuffix = value => String(value || '').trim().replace(/\s+[—-]\s+\S+@\S+$/u, '').trim();
    return stripEmailSuffix(contact.full_name || contact.fullName)
      || stripEmailSuffix(contact.name)
      || stripEmailSuffix(contact.contact_name || contact.contactName)
      || String(contact.email || '').trim();
  },
  getContactPosition(contact = {}) {
    return String(contact.job_title || contact.jobTitle || contact.position || contact.title || '').trim();
  },
  getSignedInUserForAgreement() {
    const sessionApi = window.Session || {}; const appState = window.AppState || {}; const auth = window.Auth || {};
    const sessionUser = typeof sessionApi.user === 'function' ? sessionApi.user() : {};
    const sessionState = sessionApi.state || {};
    const authContext = typeof sessionApi.authContext === 'function' ? sessionApi.authContext() : {};
    const rawAuthUser = sessionState.user || sessionUser.user || authContext.user || appState.user || auth.user || {};
    const profile = sessionState.profile || sessionUser.profile || authContext.profile || appState.profile || rawAuthUser.profile || {};
    const firstUseful = (...values) => values.map(v=>String(v||'').trim()).find(v=>v && !['user','authenticated','null','undefined'].includes(v.toLowerCase())) || '';
    const email = String(sessionUser.email || sessionState.email || rawAuthUser.email || profile.email || '').trim();
    const username = firstUseful(sessionUser.username, sessionState.username, typeof sessionApi.username === 'function' ? sessionApi.username() : '', profile.username, rawAuthUser.username);
    const name = firstUseful(sessionUser.name, sessionState.name, typeof sessionApi.displayName === 'function' ? sessionApi.displayName() : '', profile.full_name, profile.name, rawAuthUser.name, username) || (email ? email.split('@')[0] : '');
    const mobile = String(sessionUser.mobile || sessionUser.phone || sessionState.mobile || sessionState.phone || profile.mobile || profile.phone || rawAuthUser.phone || '').trim();
    const roleRaw = String((typeof sessionApi.role === 'function' ? sessionApi.role() : '') || sessionUser.role || sessionState.role || profile.role || rawAuthUser.role || '').trim();
    return { name, email, mobile, role: roleRaw };
  },
  normalizeAgreementRoleKey(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  },
  getCurrentAgreementRoleKey() {
    const sessionApi = window.Session || {};
    const sessionUser = typeof sessionApi.user === 'function' ? sessionApi.user() : {};
    const sessionState = sessionApi.state || {};
    const profile = sessionState.profile || sessionUser.profile || {};
    const roleRaw = String(
      (typeof sessionApi.role === 'function' ? sessionApi.role() : '') ||
      sessionState.role ||
      sessionUser.role ||
      profile.role_key ||
      profile.roleKey ||
      profile.role ||
      ''
    ).trim();
    return this.normalizeAgreementRoleKey(roleRaw);
  },
  canEditProviderOfficialSignatory1SignDate() {
    const role = this.getCurrentAgreementRoleKey();
    return ['senior_financial_controller', 'financial_controller', 'senior_fc', 'sfc'].includes(role);
  },
  canEditProviderOfficialSignatory2SignDate() {
    const role = this.getCurrentAgreementRoleKey();
    return ['general_manager', 'gm'].includes(role);
  },
  getProviderSignDateLockRules() {
    return [
      {
        inputId: 'agreementFormProviderOfficialSignatory1SignDate',
        field: 'provider_official_signatory_1_sign_date',
        label: 'Provider Official Signatory 1 Sign Date',
        requiredRoleLabel: 'Senior Financial Controller',
        canEdit: this.canEditProviderOfficialSignatory1SignDate()
      },
      {
        inputId: 'agreementFormProviderOfficialSignatory2SignDate',
        field: 'provider_official_signatory_2_sign_date',
        label: 'Provider Official Signatory 2 Sign Date',
        requiredRoleLabel: 'General Manager',
        canEdit: this.canEditProviderOfficialSignatory2SignDate()
      }
    ];
  },
  captureProviderSignDateOriginalValues() {
    this.getProviderSignDateLockRules().forEach(rule => {
      const el = document.getElementById(rule.inputId);
      if (!el) return;
      el.dataset.originalValue = this.normalizeDateInputValue(el.value || '');
    });
  },
  applyProviderSignDateRoleLocks() {
    const formReadOnly = String(E.agreementForm?.dataset?.readOnly || '').trim() === 'true';
    this.getProviderSignDateLockRules().forEach(rule => {
      const el = document.getElementById(rule.inputId);
      if (!el) return;
      const locked = formReadOnly || !rule.canEdit;
      el.disabled = locked;
      el.readOnly = locked;
      el.classList.toggle('locked-field', locked);
      el.classList.toggle('readonly-field', locked);
      if (locked) {
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('aria-readonly', 'true');
        el.title = `${rule.label} can only be filled by the ${rule.requiredRoleLabel} role.`;
      } else {
        el.removeAttribute('aria-disabled');
        el.removeAttribute('aria-readonly');
        el.title = `Only the ${rule.requiredRoleLabel} role should fill this sign date.`;
      }
    });
  },
  validateProviderSignDateRoleChanges() {
    for (const rule of this.getProviderSignDateLockRules()) {
      const el = document.getElementById(rule.inputId);
      if (!el) continue;
      const currentValue = this.normalizeDateInputValue(el.value || '');
      const originalValue = this.normalizeDateInputValue(el.dataset.originalValue || '');
      if (currentValue !== originalValue && !rule.canEdit) {
        UI.toast(`${rule.label} can only be filled or changed by the ${rule.requiredRoleLabel} role.`);
        return false;
      }
    }
    return true;
  },
  extractRows(response) {
    const candidates = [response, response?.agreements, response?.items, response?.rows, response?.data, response?.result, response?.payload, response?.data?.agreements, response?.result?.agreements, response?.payload?.agreements];
    for (const candidate of candidates) if (Array.isArray(candidate)) return candidate;
    return [];
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
        if (!agreement && first && typeof first === 'object') agreement = first;
        if (!items.length && Array.isArray(first?.items)) items = first.items;
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
      agreement: this.normalizeAgreement(agreement || { agreement_id: fallbackId }),
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
  setCachedDetail(id, agreement, items) {
    const key = String(id || '').trim();
    if (!key) return;
    this.state.detailCacheById[key] = {
      agreement: this.normalizeAgreement(agreement || { agreement_id: key }),
      items: Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [],
      cachedAt: Date.now()
    };
  },
  setTriggerBusy(trigger, busy) {
    if (!trigger || !('disabled' in trigger)) return;
    trigger.disabled = !!busy;
  },
  setFormDetailLoading(loading) {
    if (!E.agreementForm) return;
    if (loading) E.agreementForm.setAttribute('data-detail-loading', 'true');
    else E.agreementForm.removeAttribute('data-detail-loading');
    if (E.agreementFormTitle) {
      const baseTitle = String(E.agreementFormTitle.textContent || '').replace(/\s+\u00b7\s+Loading details…$/, '').trim();
      E.agreementFormTitle.textContent = loading ? `${baseTitle || 'Agreement'} · Loading details…` : baseTitle;
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
  async listAgreements(options = {}) { return Api.listAgreements(options); },
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
  upsertLocalRow(row) {
    const normalized = this.normalizeAgreement(row);
    const idx = this.state.rows.findIndex(item => String(item.id || '') === String(normalized.id || ''));
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  removeLocalRow(id) {
    this.state.rows = this.state.rows.filter(item => String(item.id || '') !== String(id || ''));
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  async getAgreement(id) { return Api.getAgreement(id); },
  async createAgreement(agreement, items) { return Api.createAgreement(agreement, items); },
  async updateAgreement(id, updates, items) { return Api.updateAgreement(id, updates, items); },
  async deleteAgreement(id) { return Api.deleteAgreement(id); },
  async listClients() { return Api.listClients(); },
  async createClient(client) { return Api.createClient(client); },
  async updateClient(clientId, updates) { return Api.updateClient(clientId, updates); },
  async createAgreementFromProposal(proposalId) {
    const proposalRef = String(proposalId || '').trim();
    const proposalResponse = await window.Proposals?.getProposal?.(proposalRef);
    const extracted = window.Proposals?.extractProposalAndItems?.(proposalResponse, proposalRef) || {};
    const proposal = extracted.proposal && typeof extracted.proposal === 'object' ? extracted.proposal : { id: proposalRef };
    if (!(await this.guardProposalConversionAllowed(proposal))) return null;
    return Api.createAgreementFromProposal(proposalRef);
  },
  async generateAgreementHtml(agreementId) { return Api.generateAgreementHtml(agreementId); },
  async loadAgreementPreviewData(agreementUuid) {
    const id = String(agreementUuid || '').trim();
    if (!id) throw new Error('Missing agreement UUID.');
    const client = window.SupabaseClient?.getClient?.();
    if (!client) throw new Error('Supabase client is not available.');

    const [{ data: agreement, error: agreementError }, { data: items, error: itemsError }] = await Promise.all([
      client.from('agreements').select('*').eq('id', id).maybeSingle(),
      client
        .from('agreement_items')
        .select('*')
        .eq('agreement_id', id)
        .order('line_no', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true, nullsFirst: false })
    ]);

    if (agreementError) throw new Error(`Unable to load agreement: ${agreementError.message || 'Unknown error'}`);
    if (!agreement) throw new Error('Agreement was not found.');
    if (itemsError) throw new Error(`Unable to load agreement items: ${itemsError.message || 'Unknown error'}`);

    return {
      agreement: this.normalizeAgreement(agreement),
      items: Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : []
    };
  },
  buildAgreementPreviewHtml(agreement = {}, items = []) {
    const agreementData = agreement && typeof agreement === 'object' ? agreement : {};
    const normalizedItems = (Array.isArray(items) ? items : []).map((item, index) => {
      const normalized = this.normalizeItem(item);
      if (!normalized.line_no) normalized.line_no = index + 1;
      return normalized;
    });
    const currency = String(agreementData.currency || 'USD').trim().toUpperCase();
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
    const sectionKey = value => String(value || '').trim().toLowerCase();
    const isSubscription = value => {
      const key = sectionKey(value);
      return key === 'annual_saas' || key === 'subscription' || key === 'saas';
    };
    const isOneTime = value => {
      const key = sectionKey(value);
      return key === 'one_time_fee' || key === 'one-time-fee' || key === 'one_time';
    };
    const computeRow = item => {
      const section = String(item?.section || '').trim().toLowerCase();
      const quantity = this.toNumberSafe(item.quantity) || (section === 'annual_saas' ? 12 : 1);
      const unitPrice = this.toNumberSafe(item.unit_price);
      const discountPercent = this.toNumberSafe(item.discount_percent);
      const computed = this.computeCommercialRow({ ...item, section, quantity, unit_price: unitPrice, discount_percent: discountPercent });
      return {
        quantity,
        unitPrice,
        discountPercent,
        lineTotal: computed.line_total
      };
    };

    const subscriptionItems = normalizedItems.filter(item => isSubscription(item.section));
    const oneTimeItems = normalizedItems.filter(item => isOneTime(item.section));
    const otherItems = normalizedItems.filter(item => !isSubscription(item.section) && !isOneTime(item.section) && sectionKey(item.section) !== 'capability');

    const subscriptionRows = subscriptionItems.length
      ? subscriptionItems
          .map(item => {
            const computed = computeRow(item);
            return `<tr>
              <td>${textValue(item.location_name || item.locationName)}</td>
              <td>${textValue(item.item_name || item.capability_name)}</td>
              <td class="cell-right">${money(computed.unitPrice)}</td>
              <td class="cell-center">${computed.quantity ? U.escapeHtml(String(computed.quantity)) : '—'}</td>
              <td class="cell-center">${dateValue(item.service_start_date || agreementData.service_start_date)}</td>
              <td class="cell-center">${dateValue(item.service_end_date || agreementData.service_end_date)}</td>
              <td class="cell-center">${U.escapeHtml(String(computed.discountPercent || 0))}%</td>
              <td class="cell-right">${money(computed.lineTotal)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="8" class="cell-center muted">No SaaS / subscription items found.</td></tr>';

    const oneTimeRows = (oneTimeItems.length ? oneTimeItems : otherItems).length
      ? (oneTimeItems.length ? oneTimeItems : otherItems)
          .map(item => {
            const computed = computeRow(item);
            return `<tr>
              <td>${textValue(item.location_name || item.locationName)}</td>
              <td>${textValue(item.item_name || item.capability_name)}</td>
              <td class="cell-right">${money(computed.unitPrice)}</td>
              <td class="cell-center">${U.escapeHtml(String(computed.discountPercent || 0))}%</td>
              <td class="cell-center">${computed.quantity ? U.escapeHtml(String(computed.quantity)) : '—'}</td>
              <td class="cell-right">${money(computed.lineTotal)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="6" class="cell-center muted">No one-time fee items found.</td></tr>';

    const calculatedTotals = this.calculateTotals(normalizedItems);
    const subtotalLocations = calculatedTotals.grand_total > 0 ? calculatedTotals.saas_total : this.toNumberSafe(agreementData.subtotal_locations || agreementData.saas_total);
    const subtotalOneTime = calculatedTotals.grand_total > 0 ? calculatedTotals.one_time_total : this.toNumberSafe(agreementData.subtotal_one_time || agreementData.one_time_total);
    const grandTotal = calculatedTotals.grand_total > 0 ? calculatedTotals.grand_total : this.toNumberSafe(agreementData.grand_total || subtotalLocations + subtotalOneTime);
    const grandTotalInWords = U.amountToWords(grandTotal, currency);
    const isPoc = this.toDbBoolean(agreementData.is_poc ?? agreementData.isPoc, false);
    const pocDetailsHtml = isPoc ? `
      <section class="info-grid" style="margin-top:14px;grid-template-columns:1fr;">
        <div class="info-box" style="min-height:auto;">
          <div class="info-head">POC DETAILS</div>
          <div class="info-body" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px;">
            <div><strong>POC:</strong> Yes</div>
            <div><strong>Number of Locations:</strong> ${textValue(agreementData.poc_location_count)}</div>
            <div><strong>License / Month:</strong> ${textValue(agreementData.poc_license_months)}</div>
            <div><strong>Service Start Date:</strong> ${dateValue(agreementData.poc_service_start_date)}</div>
            <div><strong>Service End Date:</strong> ${dateValue(agreementData.poc_service_end_date)}</div>
            <div style="grid-column:1 / -1;"><strong>POC Success KPIs:</strong><br>${textValue(agreementData.poc_success_kpis || this.getDefaultPocSuccessKpis())}</div>
            <div style="grid-column:1 / -1;"><strong>Commercial Commitment:</strong><br>${textValue(agreementData.poc_conversion_commitment || this.getDefaultPocConversionCommitment())}</div>
          </div>
        </div>
      </section>` : '';

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Commercial Agreement · ${U.escapeHtml(String(agreementData.agreement_id || agreementData.agreement_number || agreementData.id || ''))}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { font-family: Inter, "Segoe UI", Arial, Helvetica, sans-serif; margin: 0; padding: 12mm 0; color: #111827; background: #eef2f7; }
      .doc-sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; border: 1px solid #dbe3ed; padding: 14mm 14mm 12mm; position: relative; overflow: hidden; box-sizing: border-box; }
      .doc-sheet.is-draft::before { content: "DRAFT"; position: absolute; inset: 36% auto auto 50%; transform: translate(-50%, -50%) rotate(-24deg); font-size: 44mm; font-weight: 900; letter-spacing: 0.08em; color: rgba(15, 23, 42, 0.055); z-index: 0; pointer-events: none; white-space: nowrap; }
      .doc-sheet > * { position: relative; z-index: 1; }
      .doc-header { border-bottom: 1px solid #d8e1ec; padding-bottom: 8mm; margin-bottom: 6mm; }
      .agreement-document-header { display: grid; grid-template-columns: 34mm 1fr 68mm; align-items: center; gap: 8mm; width: 100%; margin: 0; }
      .agreement-document-logo { display: flex; align-items: center; justify-content: flex-start; min-height: 24mm; }
      .agreement-document-logo .incheck360-doc-logo-wrap { float: none; margin: 0; width: 32mm; max-width: 32mm; height: 20mm; max-height: 20mm; position: static !important; transform: none !important; }
      .agreement-document-title-wrap { display: flex; align-items: center; justify-content: center; min-height: 24mm; }
      .doc-label { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.02em; color: #0b214a; line-height: 1; text-align: center; }
      .agreement-document-summary { display: flex; align-items: center; justify-content: flex-end; min-height: 24mm; }
      .meta-box { width: 100%; border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; background: #fbfdff; }
      .meta-row { display: grid; grid-template-columns: 130px 1fr; border-bottom: 1px solid #e3eaf3; }
      .meta-row:last-child { border-bottom: 0; }
      .meta-row > div { padding: 8px 11px; font-size: 12.5px; }
      .meta-row .meta-key { background: #f5f8fc; font-weight: 700; color: #334155; border-right: 1px solid #e3eaf3; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
      .info-box { border: 1px solid #d7e1ed; min-height: 132px; border-radius: 6px; overflow: hidden; background: #fff; }
      .info-head { background: #f8fbff; border-bottom: 1px solid #e3eaf3; padding: 9px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #1e3a5f; }
      .info-body { padding: 12px; font-size: 12.5px; line-height: 1.55; }
      .muted { color: #6b7280; }
      .section { margin-top: 22px; }
      .section h2 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #d8e1ec; padding-bottom: 7px; }
      .section .subhead { font-size: 12px; margin: 6px 0 8px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.04em; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #dde5ef; padding: 8px; font-size: 12px; vertical-align: middle; }
      th { text-align: center; background: #f5f8fc; color: #0f172a; font-weight: 700; }
      .cell-center { text-align: center; vertical-align: middle; }
      .cell-right { text-align: right; vertical-align: middle; white-space: nowrap; }
      .total-row td { font-weight: 700; background: #f9fafb; }
      .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
      .totals-box { width: 460px; max-width: 100%; border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; }
      .totals-row { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e3eaf3; font-size: 13px; }
      .totals-row:last-child { border-bottom: 0; }
      .totals-row span { min-width: 0; }
      .totals-row strong { text-align: right; overflow-wrap: anywhere; }
      .totals-row.grand { font-size: 15px; font-weight: 700; background: #edf4ff; color: #0b214a; }
      .totals-row.grand-total-words-row { align-items: flex-start; gap: 12px; background: #f8fbff; color: #334155; font-size: 12px; font-weight: 500; }
      .totals-row.grand-total-words-row span { flex: 0 0 auto; font-weight: 600; white-space: nowrap; }
      .totals-row.grand-total-words-row strong { flex: 1 1 auto; min-width: 0; font-weight: 500; line-height: 1.4; text-align: right; overflow-wrap: anywhere; }
      .terms { margin-top: 16px; font-size: 12.5px; line-height: 1.6; border: 1px solid #d7e1ed; border-radius: 6px; padding: 12px; }
      .signature-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "customer provider1" "customer provider2"; gap: 14px; margin-top: 12px; align-items: start; }
      .signature-box { border: 1px solid #d7e1ed; min-height: 140px; border-radius: 6px; overflow: hidden; }
      .signature-box-customer { grid-area: customer; }
      .signature-box-provider-1 { grid-area: provider1; }
      .signature-box-provider-2 { grid-area: provider2; }
      .signature-head { background: #f8fbff; border-bottom: 1px solid #e3eaf3; padding: 8px 10px; font-size: 11px; letter-spacing: 0.08em; font-weight: 700; color: #1e3a5f; }
      .signature-body { padding: 11px; font-size: 12px; line-height: 1.5; }
      .footer-note { margin-top: 16px; font-size: 11px; color: #64748b; border-top: 1px solid #e3eaf3; padding-top: 10px; text-align: center; }
      @page { size: A4; margin: 0; }
      @media print { body { margin: 0; padding: 0; background: #fff; } .doc-sheet { width: 210mm; min-height: 297mm; margin: 0; border: 0; box-shadow: none; page-break-after: always; } }
    </style>
  </head>
  <body>
    <div class="doc-sheet ${this.normalizeText(agreementData.status) === 'draft' ? 'is-draft' : ''}">
      <header class="doc-header">
        <section class="agreement-document-header">
          <div class="agreement-document-logo"><div data-incheck360-doc-logo-slot></div></div>
          <div class="agreement-document-title-wrap"><h2 class="doc-label">Commercial Agreement</h2></div>
          <div class="agreement-document-summary">
            <div class="meta-box">
              <div class="meta-row"><div class="meta-key">Agreement ID</div><div>${textValue(agreementData.agreement_id)}</div></div>
              <div class="meta-row"><div class="meta-key">Agreement #</div><div>${textValue(agreementData.agreement_number)}</div></div>
              <div class="meta-row"><div class="meta-key">Agreement Date</div><div>${dateValue(agreementData.agreement_date)}</div></div>
              <div class="meta-row"><div class="meta-key">Effective Date</div><div>${dateValue(agreementData.effective_date)}</div></div>
            </div>
          </div>
        </section>
      </header>

      <section class="info-grid">
        <div class="info-box">
          <div class="info-head">CUSTOMER DETAILS</div>
          <div class="info-body">
            <div><strong>${textValue(agreementData.customer_name || agreementData.customer_legal_name)}</strong></div>
            <div class="muted">${textValue(agreementData.customer_address)}</div>
            <div><strong>Contact:</strong> ${textValue(agreementData.customer_contact_name)}</div>
            <div><strong>Mobile:</strong> ${textValue(agreementData.customer_contact_mobile)}</div>
            <div><strong>Email:</strong> ${textValue(agreementData.customer_contact_email)}</div>
          </div>
        </div>
        <div class="info-box">
          <div class="info-head">PROVIDER DETAILS</div>
          <div class="info-body">
            <div><strong>${textValue(agreementData.provider_name || agreementData.provider_legal_name)}</strong></div>
            <div class="muted">${textValue(agreementData.provider_address)}</div>
            <div><strong>Contact:</strong> ${textValue(agreementData.provider_contact_name)}</div>
            <div><strong>Mobile:</strong> ${textValue(agreementData.provider_contact_mobile)}</div>
            <div><strong>Email:</strong> ${textValue(agreementData.provider_contact_email)}</div>
          </div>
        </div>
      </section>

      <section class="info-grid" style="margin-top:14px;grid-template-columns:1fr;">
        <div class="info-box" style="min-height:auto;">
          <div class="info-head">SERVICE & BILLING TERMS</div>
          <div class="info-body" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px;">
            <div><strong>Service Start Date:</strong> ${dateValue(agreementData.service_start_date)}</div>
            <div><strong>Service End Date:</strong> ${dateValue(agreementData.service_end_date)}</div>
            <div><strong>Contract Term:</strong> ${textValue(agreementData.contract_term || agreementData.agreement_length)}</div>
            <div><strong>Billing Frequency:</strong> ${textValue(agreementData.billing_frequency)}</div>
            <div><strong>Payment Term:</strong> ${textValue(this.getPaymentTermDisplay(agreementData.payment_term))}</div>
            <div><strong>PO Number:</strong> ${textValue(agreementData.po_number)}</div>
            <div><strong>Currency:</strong> ${textValue(currency)}</div>
          </div>
        </div>
      </section>

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
        <h2>One Time Fees Details</h2>
        <div class="subhead">One Time Fee Rows</div>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>Item / Service</th>
              <th style="width:14%">Unit Price</th>
              <th style="width:10%">Discount %</th>
              <th style="width:8%">Qty</th>
              <th style="width:14%">Total</th>
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

      <section class="totals-wrap">
        <div class="totals-box">
          <div class="totals-row"><span>One Time Fees</span><strong>${money(subtotalOneTime)}</strong></div>
          <div class="totals-row"><span>Subscription Fees</span><strong>${money(subtotalLocations)}</strong></div>
          <div class="totals-row grand"><span>Grand Total</span><strong>${money(grandTotal)}</strong></div>
          <div class="totals-row grand-total-words-row"><span>Grand Total in Words</span><strong>${U.escapeHtml(grandTotalInWords)}</strong></div>
        </div>
      </section>

      ${pocDetailsHtml}

      <section class="terms">
        <div><strong>Terms & Conditions:</strong></div>
        <div style="white-space: pre-wrap;">${textValue(agreementData.terms_conditions)}</div>
      </section>

      <section class="signature-grid">
        <div class="signature-box signature-box-customer">
          <div class="signature-head">Customer Official Signatory</div>
          <div class="signature-body">
            <div><strong>Name:</strong> ${textValue(agreementData.customer_official_signatory_name || agreementData.customer_signatory_name)}</div>
            <div><strong>Title:</strong> ${textValue(agreementData.customer_official_signatory_title || agreementData.customer_signatory_title)}</div>
            <div><strong>Date:</strong> ${dateValue(agreementData.customer_official_sign_date || agreementData.customer_sign_date)}</div>
          </div>
        </div>
        <div class="signature-box signature-box-provider-1">
          <div class="signature-head">Provider Official Signatory 1</div>
          <div class="signature-body">
            <div><strong>Name:</strong> ${textValue(agreementData.provider_official_signatory_1_name || agreementData.provider_signatory_name_primary || agreementData.provider_signatory_name)}</div>
            <div><strong>Title:</strong> ${textValue(agreementData.provider_official_signatory_1_title || agreementData.provider_signatory_title_primary || agreementData.provider_signatory_title)}</div>
            <div><strong>Date:</strong> ${dateValue(agreementData.provider_official_signatory_1_sign_date || agreementData.provider_sign_date)}</div>
          </div>
        </div>
        <div class="signature-box signature-box-provider-2">
          <div class="signature-head">Provider Official Signatory 2</div>
          <div class="signature-body">
            <div><strong>Name:</strong> ${textValue(agreementData.provider_official_signatory_2_name || agreementData.provider_signatory_name_secondary)}</div>
            <div><strong>Title:</strong> ${textValue(agreementData.provider_official_signatory_2_title || agreementData.provider_signatory_title_secondary)}</div>
            <div><strong>Date:</strong> ${dateValue(agreementData.provider_official_signatory_2_sign_date || agreementData.provider_sign_date)}</div>
          </div>
        </div>
      </section>

      <footer class="footer-note">This is an auto-generated system document and is valid without a manual signature unless otherwise required.</footer>
    </div>
  </body>
</html>`;
  },
  async createInvoiceFromAgreement(agreementId) { return Api.createInvoiceFromAgreement(agreementId); },
  extractTechnicalRequest(response) {
    const payload = Api.unwrapApiPayload(response);
    const candidates = [
      payload?.technical_request,
      payload?.technicalAdminRequest,
      payload?.request,
      payload,
      response?.technical_request,
      response?.request
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const requestId = String(candidate.technical_request_id || candidate.technicalRequestId || '').trim();
      if (requestId) return candidate;
    }
    return null;
  },
  async requestTechnicalAdminFlow(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) return UI.toast('Agreement ID is required.');
    try {
      const response = await Api.requestAgreementTechnicalAdmin(id);
      const technicalRequest = this.extractTechnicalRequest(response);
      if (technicalRequest && window.TechnicalAdmin?.upsertLocalRow) {
        TechnicalAdmin.upsertLocalRow(technicalRequest);
      }
      if (window.TechnicalAdmin?.loadAndRefresh) TechnicalAdmin.loadAndRefresh({ force: !technicalRequest });
      UI.toast(`Technical Admin request sent for agreement ${id}.`);
    } catch (error) {
      UI.toast('Unable to request Technical Admin: ' + (error?.message || 'Unknown error'));
    }
  },
  isSignedStatus(status) {
    return normalizeAgreementStatus(status) === 'signed';
  },
  todayDateString() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  hasValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  },
  getAgreementOfficialSignDateValues(agreement = {}) {
    const source = agreement && typeof agreement === 'object' ? agreement : {};
    const firstNonBlank = (...values) => {
      for (const value of values) {
        const normalized = this.normalizeDateInputValue(value);
        if (normalized) return normalized;
        if (this.hasValue(value)) return String(value || '').trim();
      }
      return '';
    };
    return {
      customer: firstNonBlank(source.customer_official_sign_date, source.customerOfficialSignDate, source.customer_sign_date, source.customerSignDate),
      provider1: firstNonBlank(source.provider_official_signatory_1_sign_date, source.providerOfficialSignatory1SignDate, source.provider_sign_date, source.providerSignDate),
      provider2: firstNonBlank(source.provider_official_signatory_2_sign_date, source.providerOfficialSignatory2SignDate)
    };
  },
  hasAllAgreementSignatoryDates(agreement = {}) {
    const dates = this.getAgreementOfficialSignDateValues(agreement);
    return Boolean(dates.customer && dates.provider1 && dates.provider2);
  },
  getLatestAgreementSignDate(agreement = {}) {
    const dates = Object.values(this.getAgreementOfficialSignDateValues(agreement)).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : '';
  },
  normalizeAgreementSignatoryDateAliases(agreement = {}) {
    const next = agreement && typeof agreement === 'object' ? agreement : {};
    const dates = this.getAgreementOfficialSignDateValues(next);
    if (dates.customer) {
      next.customer_official_sign_date = dates.customer;
      next.customer_sign_date = dates.customer;
    }
    if (dates.provider1) {
      next.provider_official_signatory_1_sign_date = dates.provider1;
      next.provider_sign_date = dates.provider1;
    }
    if (dates.provider2) next.provider_official_signatory_2_sign_date = dates.provider2;
    if (this.hasAllAgreementSignatoryDates(next)) {
      next.status = 'Signed';
      next.signed_date = next.signed_date || this.getLatestAgreementSignDate(next);
      next.gm_signed = true;
      next.financial_controller_signed = true;
    }
    return next;
  },
  syncAgreementStatusFromSignatoryDates() {
    if (!E.agreementForm) return;
    const read = id => document.getElementById(id)?.value || '';
    const snapshot = {
      status: document.getElementById('agreementFormStatus')?.value || '',
      customer_official_sign_date: read('agreementFormCustomerOfficialSignDate'),
      customer_sign_date: read('agreementFormCustomerSignDate'),
      provider_official_signatory_1_sign_date: read('agreementFormProviderOfficialSignatory1SignDate'),
      provider_sign_date: read('agreementFormProviderSignDate'),
      provider_official_signatory_2_sign_date: read('agreementFormProviderOfficialSignatory2SignDate'),
      signed_date: read('agreementFormSignedDate')
    };
    this.normalizeAgreementSignatoryDateAliases(snapshot);
    const customerHidden = document.getElementById('agreementFormCustomerSignDate');
    const providerHidden = document.getElementById('agreementFormProviderSignDate');
    const signedDateInput = document.getElementById('agreementFormSignedDate');
    if (customerHidden) customerHidden.value = snapshot.customer_sign_date || '';
    if (providerHidden) providerHidden.value = snapshot.provider_sign_date || '';
    if (signedDateInput && snapshot.signed_date) signedDateInput.value = snapshot.signed_date;
    const statusInput = document.getElementById('agreementFormStatus');
    if (statusInput && this.hasAllAgreementSignatoryDates(snapshot)) statusInput.value = 'Signed';
  },
  getAgreementEndDateValue(agreement = {}) {
    const source = agreement && typeof agreement === 'object' ? agreement : {};
    return this.normalizeDateInputValue(
      source.service_end_date ||
      source.serviceEndDate ||
      source.contract_end_date ||
      source.contractEndDate ||
      source.agreement_end_date ||
      source.agreementEndDate ||
      ''
    );
  },
  isAgreementExpired(agreement = {}) {
    const status = normalizeAgreementStatus(agreement?.status);
    if (status === 'expired') return true;
    const endDate = this.getAgreementEndDateValue(agreement);
    if (!endDate) return false;
    return endDate < this.todayDateString();
  },
  resolveAgreementStatus(agreement = {}) {
    const raw = String(agreement?.status || '').trim();
    const normalized = normalizeAgreementStatus(raw);
    if (normalized === 'expired') return 'Expired';
    if (normalized === 'accepted' || normalized === 'signed' || this.hasAllAgreementSignatoryDates(agreement)) return 'Signed';
    if (this.isAgreementExpired(agreement)) return 'Expired';
    return raw || 'Draft';
  },
  hasSignedSignal(agreement = {}) {
    const statusSigned = this.isSignedStatus(agreement.status);
    const signedDate = String(agreement.signed_date || '').trim();
    return statusSigned || Boolean(signedDate) || this.hasAllAgreementSignatoryDates(agreement);
  },
  buildOperationsOnboardingFromAgreement(agreement = {}, agreementId = '') {
    const agreementUuid = String(agreementId || agreement.id || '').trim();
    const signedDate = String(agreement.signed_date || agreement.customer_sign_date || '').trim();
    const requestedAt = String(agreement.updated_at || agreement.created_at || '').trim();
    return {
      agreement_id: agreementUuid,
      agreement_number: String(agreement.agreement_number || agreement.agreement_id || '').trim(),
      client_name: String(agreement.customer_name || agreement.customer_legal_name || '').trim(),
      agreement_status: String(agreement.status || '').trim(),
      signed_date: signedDate || null,
      onboarding_status: 'Pending',
      technical_request_type: '',
      technical_request_details: '',
      technical_request_status: '',
      requested_by: String(agreement.generated_by || window.Session?.currentUser?.email || '').trim(),
      requested_at: requestedAt || null,
      csm_assigned_to: '',
      csm_assigned_at: null,
      priority: '',
      open_client_request: '',
      add_locations_request: '',
      create_users_request: '',
      module_setup_request: '',
      training_request: '',
      go_live_target_date: null,
      handover_note: '',
      notes: String(agreement.notes || '').trim(),
      completed_at: null,
      created_at: String(agreement.created_at || '').trim() || null,
      updated_at: String(agreement.updated_at || '').trim() || null
    };
  },
  unwrapOperationsOnboardingRow(response) {
    if (!response) return null;
    const candidates = [
      response?.onboarding,
      response?.item,
      response?.data,
      response?.result,
      response?.payload,
      response
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate[0] && typeof candidate[0] === 'object') return candidate[0];
      if (candidate && typeof candidate === 'object') return candidate;
    }
    return null;
  },
  async syncSignedAgreementToOperationsOnboarding(agreement = {}, agreementId = '') {
    const agreementUuid = String(agreementId || agreement.id || '').trim();
    if (!agreementUuid || !this.hasSignedSignal(agreement)) return;

    const onboardingPayload = this.buildOperationsOnboardingFromAgreement(agreement, agreementUuid);
    try {
      const detailResponse = await Api.getOperationsOnboarding({ agreement_id: agreementUuid });
      const existing = this.unwrapOperationsOnboardingRow(detailResponse);
      const onboardingId = String(existing?.onboarding_id || existing?.id || '').trim();
      if (onboardingId) {
        await Api.updateOperationsOnboarding(onboardingId, onboardingPayload);
      } else {
        await Api.saveOperationsOnboarding(onboardingPayload);
      }
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      const notFound = message.includes('not found') || message.includes('row not found');
      if (!notFound) throw error;
      await Api.saveOperationsOnboarding(onboardingPayload);
    }

    if (window.OperationsOnboarding?.state?.loaded) {
      await window.OperationsOnboarding.loadAndRefresh({ force: true });
    }
  },
  extractClientRows(response) {
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
  buildClientFromAgreement(agreement = {}, agreementId = '') {
    const companyName = String(agreement.customer_legal_name || agreement.customer_name || '').trim();
    const displayName = String(agreement.customer_name || agreement.customer_legal_name || '').trim();
    return {
      client_name: displayName,
      company_name: companyName,
      primary_email: String(agreement.customer_contact_email || '').trim(),
      primary_phone: String(agreement.customer_contact_mobile || '').trim(),
      status: 'Signed',
      billing_frequency: String(agreement.billing_frequency || '').trim(),
      payment_term: String(agreement.payment_term || '').trim(),
      source_agreement_id: String(agreementId || agreement.id || agreement.agreement_id || '').trim(),
      total_agreements: 1,
      total_value: this.toNumberSafe(agreement.grand_total),
      total_paid: 0,
      total_due: this.toNumberSafe(agreement.grand_total)
    };
  },
  mergeClientValue(existingValue, incomingValue) {
    const incoming = typeof incomingValue === 'string' ? incomingValue.trim() : incomingValue;
    if (incoming === '' || incoming === null || incoming === undefined) return existingValue;
    return incoming;
  },
  parseDateValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },
  isSameAgreement(existing = {}, signedClient = {}) {
    const existingAgreementId = String(existing.latest_agreement_id || '').trim();
    const incomingAgreementId = String(signedClient.latest_agreement_id || '').trim();
    return !!existingAgreementId && !!incomingAgreementId && existingAgreementId === incomingAgreementId;
  },
  mergeExistingClientWithSignedAgreement(existing = {}, signedClient = {}) {
    const sameAgreement = String(existing.source_agreement_id || '').trim() === String(signedClient.source_agreement_id || '').trim();
    return {
      client_name: this.mergeClientValue(existing.client_name || existing.customer_name, signedClient.client_name),
      company_name: this.mergeClientValue(existing.company_name || existing.customer_legal_name, signedClient.company_name),
      primary_email: this.mergeClientValue(existing.primary_email || existing.customer_contact_email, signedClient.primary_email),
      primary_phone: this.mergeClientValue(existing.primary_phone || existing.customer_contact_mobile, signedClient.primary_phone),
      status: this.mergeClientValue(existing.status || existing.account_status, signedClient.status),
      billing_frequency: this.mergeClientValue(existing.billing_frequency, signedClient.billing_frequency),
      payment_term: this.mergeClientValue(existing.payment_term || existing.payment_terms, signedClient.payment_term),
      source_agreement_id: signedClient.source_agreement_id || existing.source_agreement_id,
      total_agreements: sameAgreement
        ? this.toNumberSafe(existing.total_agreements || existing.signed_agreements_count)
        : this.toNumberSafe(existing.total_agreements || existing.signed_agreements_count) + 1,
      total_value: sameAgreement
        ? this.toNumberSafe(existing.total_value || existing.total_signed_value)
        : this.toNumberSafe(existing.total_value || existing.total_signed_value) + this.toNumberSafe(signedClient.total_value),
      total_paid: this.toNumberSafe(existing.total_paid),
      total_due: sameAgreement
        ? this.toNumberSafe(existing.total_due)
        : this.toNumberSafe(existing.total_due) + this.toNumberSafe(signedClient.total_due)
    };
  },

  refreshCompanyLifecycleStatus(row = {}, stageOverride = '') {
    const companyId = String(row?.company_id || row?.companyId || '').trim();
    if (!companyId) return;
    const stage = stageOverride || (this.hasSignedSignal(row) ? 'Signed' : 'Agreement');
    window.Companies?.refreshCompanyLifecycleStatusByBusinessId?.(companyId, { stage }).catch(error => {
      console.error('[agreements] company lifecycle refresh failed', error);
      UI?.toast?.('Agreement saved, but company lifecycle status could not be refreshed');
    });
  },
  async syncSignedAgreementToClient(agreement = {}, agreementId = '') {
    if (!this.isSignedStatus(agreement.status)) return;
    const signedClient = this.buildClientFromAgreement(agreement, agreementId);
    // temporary lookup fallback - keep wider client fetch for selector hydration; replace with dedicated searchable lookup endpoint
    const response = await window.ClientsService.listClients({ page: 1, limit: 500 });
    const rows = this.extractClientRows(response);
    const targetEmail = this.normalizeText(agreement.customer_contact_email);
    const targetName = this.normalizeText(agreement.customer_legal_name || agreement.customer_name);
    const existing = rows.find(row => {
      const latestAgreementId = String(row?.source_agreement_id || '').trim();
      if (latestAgreementId && latestAgreementId === signedClient.source_agreement_id) return true;
      const email = this.normalizeText(row?.primary_email || row?.customer_contact_email);
      if (targetEmail && email && email === targetEmail) return true;
      const name = this.normalizeText(row?.company_name || row?.customer_legal_name || row?.client_name || row?.customer_name);
      return targetName && name && name === targetName;
    });
    const existingId = String(existing?.id || '').trim();
    if (existingId) {
      const mergedPayload = this.mergeExistingClientWithSignedAgreement(existing, signedClient);
      await window.ClientsService.updateClient(existingId, mergedPayload);
      return;
    }
    await window.ClientsService.createClient(signedClient);
  },
  applyFilters() {
    const terms = String(this.state.search || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const relationTerms = String(this.state.proposalOrDeal || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    this.state.filteredRows = this.state.rows.filter(row => {
      if (this.state.status !== 'All' && this.resolveAgreementStatus(row) !== this.state.status) return false;
      if (!this.matchesKpiFilter(row)) return false;
      const hay = [row.agreement_id, row.agreement_number, row.customer_name, row.customer_contact_email, row.agreement_title, row.proposal_id, row.deal_id, row.status]
        .filter(Boolean).join(' ').toLowerCase();
      if (terms.length && !terms.every(t => hay.includes(t))) return false;
      if (relationTerms.length) {
        const relationHay = [row.proposal_id, row.deal_id].filter(Boolean).join(' ').toLowerCase();
        if (!relationTerms.every(t => relationHay.includes(t))) return false;
      }
      return true;
    });
  },
  matchesKpiFilter(row = {}) {
    const filter = this.state.kpiFilter || 'total';
    const status = this.normalizeText(row?.status);
    if (filter === 'total') return true;
    if (filter === 'draft') return status === 'draft';
    if (filter === 'sent-review-awaiting')
      return ['sent', 'under review', 'awaiting signature'].some(token => status.includes(token));
    if (filter === 'signed-active') return ['signed', 'active'].some(token => status.includes(token));
    if (filter === 'expired-cancelled')
      return ['expired', 'cancelled', 'canceled'].some(token => status.includes(token));
    if (filter === 'contract-value') return this.toNumberSafe(row?.grand_total) > 0;
    if (filter === 'proposal-linked') return !!String(row?.proposal_id || '').trim();
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.applyFilters();
    this.render();
  },
  renderSummary() {
    if (!E.agreementsSummary) return;
    const rows = this.state.filteredRows;
    const countBy = fn => rows.filter(fn).length;
    const statusMatch = (row, tokens) => tokens.some(t => this.normalizeText(this.resolveAgreementStatus(row)).includes(t));
    const sentReviewAwaiting = countBy(row => statusMatch(row, ['sent', 'under review', 'awaiting signature']));
    const signedActive = countBy(row => statusMatch(row, ['signed', 'active']));
    const expiredCancelled = countBy(row => statusMatch(row, ['expired', 'cancelled', 'canceled']));
    const totalValue = rows.reduce((sum, row) => sum + this.toNumberSafe(this.calculateTotalsFromAgreementRecord(row).grand_total), 0);
    const proposalLinked = countBy(row => String(row.proposal_id || '').trim());
    const draftCount = countBy(row => this.normalizeText(this.resolveAgreementStatus(row)) === 'draft');
    const cards = [
      ['Total Agreements', rows.length, 'total'],
      ['Draft Agreements', draftCount, 'draft'],
      ['Sent / Under Review / Awaiting Signature', sentReviewAwaiting, 'sent-review-awaiting'],
      ['Signed / Active', signedActive, 'signed-active'],
      ['Expired / Cancelled', expiredCancelled, 'expired-cancelled'],
      ['Total Contract Value', this.formatMoney(totalValue), 'contract-value'],
      ['Proposal-linked Agreements', proposalLinked, 'proposal-linked']
    ];
    E.agreementsSummary.innerHTML = cards
      .map(([label, value, filter]) => {
        const active = (this.state.kpiFilter || 'total') === filter;
        return `<div class="card kpi${active ? ' kpi-filter-active' : ''}" data-kpi-filter="${U.escapeAttr(filter)}" role="button" tabindex="0" aria-pressed="${active ? 'true' : 'false'}"><div class="label">${U.escapeHtml(label)}</div><div class="value">${U.escapeHtml(String(value))}</div></div>`;
      })
      .join('');
  },
  renderFilters() {
    const statuses = [...new Set(this.state.rows.map(r => String(r.status || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    if (E.agreementsStatusFilter) {
      const options = ['All', ...statuses];
      E.agreementsStatusFilter.innerHTML = options.map(v=>`<option>${U.escapeHtml(v)}</option>`).join('');
      E.agreementsStatusFilter.value = options.includes(this.state.status) ? this.state.status : 'All';
    }
    if (E.agreementsSearchInput) E.agreementsSearchInput.value = this.state.search;
    if (E.agreementsProposalDealFilter) E.agreementsProposalDealFilter.value = this.state.proposalOrDeal;
    if (E.agreementsExportCsvBtn) {
      const canExport = this.canExportAgreements();
      E.agreementsExportCsvBtn.style.display = canExport ? '' : 'none';
      E.agreementsExportCsvBtn.disabled = this.state.loading || !canExport;
      if (!canExport) {
        E.agreementsExportCsvBtn.title = 'You do not have permission to export this data.';
      } else {
        E.agreementsExportCsvBtn.removeAttribute('title');
      }
    }
  },
  render() {
    if (!E.agreementsState || !E.agreementsTbody) return;
    if (this.state.loading) {
      E.agreementsState.textContent = 'Loading agreements…';
      E.agreementsTbody.innerHTML = '<tr><td colspan="15" class="muted" style="text-align:center;">Loading agreements…</td></tr>';
      return;
    }
    if (this.state.loadError) {
      E.agreementsState.textContent = this.state.loadError;
      E.agreementsTbody.innerHTML = `<tr><td colspan="15" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }
    const rows = this.state.filteredRows;
    E.agreementsState.textContent = `${rows.length} agreement${rows.length === 1 ? '' : 's'} · page ${this.state.page}`;
    this.renderSummary();
    if (!rows.length) {
      E.agreementsTbody.innerHTML = '<tr><td colspan="15" class="muted" style="text-align:center;">No agreements found.</td></tr>';
      return;
    }
    const textCell = value => U.escapeHtml(String(value ?? '').trim() || '—');
    E.agreementsTbody.innerHTML = rows.map(row => {
      const id = U.escapeAttr(row.id || row.agreement_id || row.agreement_number || row.agreementId || '');
      const rowTotals = this.calculateTotalsFromAgreementRecord(row);
      return `<tr>
        <td>${textCell(row.agreement_id)}</td><td>${textCell(row.agreement_number)}</td><td>${textCell(row.agreement_title)}</td>
        <td>${textCell(row.customer_name)}</td><td>${textCell(row.proposal_id)}</td><td>${textCell(row.deal_id)}</td>
        <td>${U.escapeHtml(U.fmtDisplayDate(row.service_start_date))}</td><td>${textCell(row.agreement_length)}</td><td>${textCell(row.billing_frequency)}</td>
        <td>${textCell(this.getPaymentTermDisplay(row.payment_term))}</td><td>${textCell(row.currency)}</td><td>${textCell(this.formatMoney(rowTotals.grand_total))}</td>
        <td>${textCell(this.resolveAgreementStatus(row))}</td><td>${U.escapeHtml(U.fmtDisplayDate(row.updated_at))}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${Permissions.canView('agreements') ? `<button class="btn ghost sm" type="button" data-agreement-view="${id}">View</button>` : ''}
        ${Permissions.canUpdateAgreement() ? `<button class=\"btn ghost sm\" type=\"button\" data-permission-resource="agreements" data-permission-action="update" data-agreement-edit=\"${id}\" data-permission-resource=\"agreements\" data-permission-action=\"update\">Edit</button>` : ''}
        ${Permissions.canRequestTechnicalAdmin() ? `<button class=\"btn ghost sm\" type=\"button\" data-agreement-request-technical=\"${id}\" data-permission-resource=\"technical_admin_requests\" data-permission-action=\"create\">Request Technical</button>` : ''}
        ${Permissions.canGenerateAgreementHtml() ? `<button class=\"btn ghost sm\" type=\"button\" data-permission-resource="agreements" data-permission-action="view" data-agreement-preview=\"${id}\">View Agreement</button>` : ''}
        ${this.isSignedStatus(row.status) && Permissions.canCreateInvoiceFromAgreement() ? `<button class=\"btn ghost sm\" type=\"button\" data-permission-resource="invoices" data-permission-action="create_from_agreement" data-agreement-create-invoice=\"${id}\" data-permission-resource=\"invoices\" data-permission-action=\"create\">Create Invoice</button>` : ''}
        ${Permissions.canDeleteAgreement() ? `<button class=\"btn ghost sm\" type=\"button\" data-permission-resource="agreements" data-permission-action="delete" data-agreement-delete=\"${id}\" data-permission-resource=\"agreements\" data-permission-action=\"delete\">Delete</button>` : ''}
        </div></td></tr>`;
    }).join('');
    const paginationHost = U.ensurePaginationHost({
      hostId: 'agreementsPagination',
      anchor: E.agreementsTbody?.closest?.('.table-wrap')
    });
    U.renderPaginationControls({
      host: paginationHost,
      moduleKey: 'agreements',
      page: this.state.page,
      pageSize: this.state.limit,
      hasMore: this.state.hasMore,
      returned: this.state.returned,
      loading: this.state.loading,
      pageSizeOptions: [25, 50, 100],
      onPageChange: nextPage => {
        this.state.page = U.normalizePageNumber(nextPage, 1);
        this.loadAndRefresh({ force: true });
      },
      onPageSizeChange: nextSize => {
        this.state.limit = U.normalizePageSize(nextSize, 50, 200);
        this.state.page = 1;
        this.loadAndRefresh({ force: true });
      }
    });
  },
  collectFormValues() {
    const pocToggle = document.getElementById('agreementFormIsPocToggle');
    const pocHidden = document.getElementById('agreementFormIsPoc');
    if (pocHidden) pocHidden.value = pocToggle?.checked ? 'true' : 'false';
    const v = id => String(document.getElementById(id)?.value || '').trim();
    const agreement = {};
    this.agreementFields.forEach(field => {
      const inputId = this.agreementFieldToFormInputId(field);
      agreement[field] = v(inputId);
    });
    const agreementDateFields = ['agreement_date', 'effective_date', 'service_start_date', 'service_end_date', 'poc_service_start_date', 'poc_service_end_date', 'customer_official_sign_date', 'provider_official_signatory_1_sign_date', 'provider_official_signatory_2_sign_date', 'provider_sign_date', 'customer_sign_date', 'signed_date'];
    const normalizedAgreement = this.normalizeDateFieldsForSave(agreement, agreementDateFields);
    this.normalizeAgreementSignatoryDateAliases(normalizedAgreement);
    Object.assign(normalizedAgreement, this.applyAgreementDerivedDates(normalizedAgreement));
    this.normalizeAgreementSignatoryDateAliases(normalizedAgreement);
    normalizedAgreement.status = this.resolveAgreementStatus(normalizedAgreement);
    normalizedAgreement.account_number = String(normalizedAgreement.account_number || '').trim();
    const items = this.collectItems();
    const totals = this.calculateTotals(items);
    normalizedAgreement.saas_total = totals.saas_total;
    normalizedAgreement.one_time_total = totals.one_time_total;
    normalizedAgreement.grand_total = totals.grand_total;
    normalizedAgreement.contract_term = String(normalizedAgreement.agreement_length || '').trim();
    normalizedAgreement.subtotal_locations = this.toNumberSafe(normalizedAgreement.saas_total);
    normalizedAgreement.subtotal_one_time = this.toNumberSafe(normalizedAgreement.one_time_total);
    if (pocToggle) {
      normalizedAgreement.is_poc = !!pocToggle.checked;
      if (pocHidden) pocHidden.value = normalizedAgreement.is_poc ? 'true' : 'false';
    } else {
      normalizedAgreement.is_poc = this.toDbBoolean(normalizedAgreement.is_poc || this.state.currentAgreement?.is_poc, false);
    }
    if (!normalizedAgreement.is_poc) {
      normalizedAgreement.poc_location_count = null;
      normalizedAgreement.poc_license_count = null;
      normalizedAgreement.poc_license_months = null;
      normalizedAgreement.poc_service_start_date = null;
      normalizedAgreement.poc_service_end_date = null;
      normalizedAgreement.poc_success_kpis = null;
      normalizedAgreement.poc_conversion_commitment = null;
    } else {
      normalizedAgreement.poc_license_count = null;
      const calculatedPocEnd = this.calculateServiceEndDate(normalizedAgreement.poc_service_start_date, normalizedAgreement.poc_license_months);
      if (calculatedPocEnd) normalizedAgreement.poc_service_end_date = calculatedPocEnd;
    }
    return { agreement: normalizedAgreement, items };
  },
  calculateTotals(items = []) {
    const safeItems = Array.isArray(items) ? items : [];
    const saas_total = safeItems
      .filter(i => i.section === 'annual_saas')
      .reduce((sum, i) => sum + this.toNumberSafe(this.computeCommercialRow({ ...i, section: 'annual_saas' }).line_total), 0);
    const one_time_total = safeItems
      .filter(i => i.section === 'one_time_fee')
      .reduce((sum, i) => sum + this.toNumberSafe(this.computeCommercialRow({ ...i, section: 'one_time_fee' }).line_total), 0);
    return { saas_total, one_time_total, grand_total: saas_total + one_time_total };
  },
  calculateTotalsFromAgreementRecord(record = {}) {
    const source = record && typeof record === 'object' ? record : {};
    const directSaas = this.toNumberSafe(source.saas_total ?? source.saasTotal ?? source.subtotal_locations ?? source.subtotalLocations);
    const directOneTime = this.toNumberSafe(source.one_time_total ?? source.oneTimeTotal ?? source.subtotal_one_time ?? source.subtotalOneTime);
    const directGrand = this.toNumberSafe(source.grand_total ?? source.grandTotal ?? source.agreement_total ?? source.agreementTotal ?? source.total);
    const rawItems = Array.isArray(source.items)
      ? source.items
      : Array.isArray(source.agreement_items)
        ? source.agreement_items
        : [];
    if (rawItems.length) {
      const normalizedItems = rawItems.map(item => this.normalizeItem(item, item?.section || item?.type || ''));
      const itemTotals = this.calculateTotals(normalizedItems);
      if (itemTotals.grand_total > 0 && directGrand <= 0) return itemTotals;
      if (itemTotals.grand_total > 0 && (!directSaas || !directOneTime)) {
        return {
          saas_total: directSaas || itemTotals.saas_total,
          one_time_total: directOneTime || itemTotals.one_time_total,
          grand_total: directGrand || itemTotals.grand_total
        };
      }
    }
    return {
      saas_total: directSaas,
      one_time_total: directOneTime,
      grand_total: directGrand || directSaas + directOneTime
    };
  },
  collectItems() {
    const rows = Array.from(E.agreementForm?.querySelectorAll('tr[data-item-row]') || []);
    const linkedOneTimeQuantity = Math.max(1, this.getAnnualSaasRowCountFromDom() || 1);
    return rows.map((tr, index) => {
      const section = String(tr.getAttribute('data-item-row') || '').trim();
      const get = key => String(tr.querySelector(`[data-item-field="${key}"]`)?.value || '').trim();
      let baseItem = {};
      try {
        baseItem = JSON.parse(tr.getAttribute('data-item-payload') || '{}');
      } catch (_error) {
        baseItem = {};
      }
      let quantity = this.toNumberSafe(get('quantity'));
      if (!quantity && section === 'annual_saas') quantity = 12;
      if (section === 'one_time_fee') quantity = linkedOneTimeQuantity;
      let discountPercent = this.toNumberSafe(get('discount_percent'));
      if (section === 'annual_saas' && quantity < 12) discountPercent = 0;
      const unitPrice = this.toNumberSafe(get('unit_price'));
      const itemName = get('item_name');
      const locationName = get('location_name');
      if (section !== 'capability' && !itemName && !locationName && !unitPrice) return null;
      const computed = this.computeCommercialRow({ ...baseItem, section, unit_price: unitPrice, discount_percent: discountPercent, quantity });
      return {
        ...baseItem,
        section,
        line_no: index + 1,
        location_name: locationName,
        location_address: get('location_address'),
        service_start_date: section === 'annual_saas' ? this.normalizeDateInputValue(get('service_start_date')) : '',
        service_end_date: section === 'annual_saas' ? this.calculateServiceEndDate(get('service_start_date'), quantity) : '',
        item_name: itemName,
        unit_price: unitPrice,
        discount_percent: discountPercent,
        discounted_unit_price: this.toNumberSafe(get('discounted_unit_price')) || this.toNumberSafe(computed.discounted_unit_price),
        quantity,
        line_total: this.toNumberSafe(get('line_total')) || this.toNumberSafe(computed.line_total),
        capability_name: get('capability_name'),
        capability_value: get('capability_value'),
        notes: get('notes')
      };
    }).filter(Boolean);
  },
  getDefaultPocSuccessKpis() {
    return 'POC success is confirmed when the agreed POC scope is completed for the selected locations, the customer validates the delivered monitoring/reporting output, users confirm operational acceptance, and no critical blocker remains open by the POC end date.';
  },
  getDefaultPocConversionCommitment() {
    return 'If the POC success KPIs are achieved, the customer agrees to proceed with the full commercial subscription/agreement.';
  },
  syncAgreementPocVisibility() {
    const toggle = document.getElementById('agreementFormIsPocToggle');
    const details = document.getElementById('agreementPocDetails');
    const hidden = document.getElementById('agreementFormIsPoc');
    const enabled = !!toggle?.checked;
    if (hidden) hidden.value = enabled ? 'true' : 'false';
    if (details) details.style.display = enabled ? 'grid' : 'none';
    if (enabled) {
      const success = document.getElementById('agreementFormPocSuccessKpis');
      const commitment = document.getElementById('agreementFormPocConversionCommitment');
      if (success && !String(success.value || '').trim()) success.value = this.getDefaultPocSuccessKpis();
      if (commitment && !String(commitment.value || '').trim()) commitment.value = this.getDefaultPocConversionCommitment();
    }
    ['agreementFormPocLocationCount', 'agreementFormPocLicenseMonths', 'agreementFormPocServiceStartDate', 'agreementFormPocServiceEndDate', 'agreementFormPocSuccessKpis', 'agreementFormPocConversionCommitment'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const proposalLocked = this.isProposalLockedAgreementContext();
      el.disabled = !enabled || proposalLocked || String(E.agreementForm?.dataset?.readOnly || '').trim() === 'true';
      if (proposalLocked) {
        if ('readOnly' in el) el.readOnly = true;
        el.setAttribute('aria-readonly', 'true');
        el.setAttribute('aria-disabled', 'true');
        el.classList.add('readonly-field', 'locked-field', 'proposal-locked-field');
      }
    });
  },
  syncAgreementPocServiceEndDate() {
    const toggle = document.getElementById('agreementFormIsPocToggle');
    if (toggle && !toggle.checked) return;
    const start = this.normalizeDateInputValue(document.getElementById('agreementFormPocServiceStartDate')?.value || '');
    const months = document.getElementById('agreementFormPocLicenseMonths')?.value || '';
    const endInput = document.getElementById('agreementFormPocServiceEndDate');
    const calculated = this.calculateServiceEndDate(start, months);
    if (endInput && calculated) endInput.value = calculated;
  },
  getAnnualSaasRowCountFromItems(items = []) {
    return (Array.isArray(items) ? items : []).filter(item => String(item?.section || '').trim().toLowerCase() === 'annual_saas').length;
  },
  getAnnualSaasRowCountFromDom() {
    return Array.from(E.agreementAnnualItemsTbody?.querySelectorAll?.('tr[data-item-row="annual_saas"]') || []).length;
  },
  syncOneTimeFeeRowsWithAnnualCount(groups = {}) {
    const annualRows = Array.isArray(groups.annual_saas) ? groups.annual_saas : [];
    const annualCount = annualRows.length;
    const linkedQuantity = Math.max(1, annualCount || 1);
    let oneTimeRows = Array.isArray(groups.one_time_fee) ? groups.one_time_fee : [];
    oneTimeRows = oneTimeRows.map(row => ({ ...row, section: 'one_time_fee', quantity: linkedQuantity }));
    if (annualCount > 0 && !oneTimeRows.length) {
      oneTimeRows = [{ section: 'one_time_fee', quantity: linkedQuantity, discount_percent: 0, unit_price: 0, line_total: 0 }];
    }
    return { ...groups, annual_saas: annualRows, one_time_fee: oneTimeRows };
  },
  refreshOneTimeFeeQuantityInputs() {
    const linkedQuantity = Math.max(1, this.getAnnualSaasRowCountFromDom() || 1);
    Array.from(E.agreementOneTimeItemsTbody?.querySelectorAll?.('tr[data-item-row="one_time_fee"]') || []).forEach(tr => {
      const quantityInput = tr.querySelector('[data-item-field="quantity"]');
      if (quantityInput) quantityInput.value = String(linkedQuantity);
      const get = key => tr.querySelector(`[data-item-field="${key}"]`)?.value ?? '';
      const computed = this.computeCommercialRow({
        section: 'one_time_fee',
        unit_price: get('unit_price'),
        discount_percent: get('discount_percent'),
        quantity: linkedQuantity
      });
      const lineTotalEl = tr.querySelector('[data-item-field="line_total"]');
      if (lineTotalEl) lineTotalEl.value = computed.line_total;
    });
  },
  renderItemRows(items = []) {
    const grouped = this.syncOneTimeFeeRowsWithAnnualCount(this.groupedItems(items));
    const editLocked = this.isAgreementItemsLocked();
    const lockAttr = editLocked ? ' readonly disabled aria-readonly="true" aria-disabled="true"' : '';
    const removeCell = (section, index) => editLocked
      ? '<td class="muted cell-center">Locked</td>'
      : `<td><button type="button" class="btn ghost sm" data-item-remove="${section}" data-item-index="${index}">Remove</button></td>`;
    const rowHtml = (section, item, index) => {
      const payload = U.escapeAttr(JSON.stringify(item || {}));
      if (section === 'capability') {
        return `<tr data-item-row="capability" data-item-payload="${payload}"><td><input class="input" data-item-field="capability_name" value="${U.escapeAttr(item.capability_name || '')}"${lockAttr} /></td><td><input class="input" data-item-field="capability_value" value="${U.escapeAttr(item.capability_value || '')}"${lockAttr} /></td><td><input class="input" data-item-field="notes" value="${U.escapeAttr(item.notes || '')}"${lockAttr} /></td>${removeCell('capability', index)}</tr>`;
      }
      const rowDefaults = section === 'annual_saas'
        ? { ...item, quantity: item.quantity || 12, service_start_date: item.service_start_date || this.getDefaultAnnualServiceStartDate() }
        : { ...item, quantity: item.quantity || 1 };
      if (section === 'annual_saas' && !rowDefaults.service_end_date) rowDefaults.service_end_date = this.calculateServiceEndDate(rowDefaults.service_start_date, rowDefaults.quantity);
      const computed = this.computeCommercialRow({ ...rowDefaults, section });
      const serviceDateCells = section === 'annual_saas'
        ? `<td><input class="input" type="date" data-item-field="service_start_date" value="${U.escapeAttr(computed.service_start_date || '')}"${lockAttr} /></td>
      <td><input class="input readonly-field locked-field" type="date" data-item-field="service_end_date" value="${U.escapeAttr(computed.service_end_date || '')}" readonly aria-readonly="true"${lockAttr} /></td>`
        : '';
      const annualDiscountLocked = section === 'annual_saas' && this.toNumberSafe(computed.quantity) < 12;
      const oneTimeQuantityLocked = section === 'one_time_fee';
      const discountLockAttr = annualDiscountLocked ? ' readonly aria-readonly="true" title="Discount is only available when License / Month is 12."' : '';
      const quantityLockAttr = oneTimeQuantityLocked ? ' readonly aria-readonly="true" title="Quantity is linked to the number of SaaS subscription rows."' : '';
      const discountCell = `<td><input class="input" data-item-field="discount_percent" type="number" min="0" max="100" step="0.01" value="${U.escapeAttr(annualDiscountLocked ? 0 : (computed.discount_percent ?? ''))}"${discountLockAttr}${lockAttr} /></td>`;
      const quantityCell = `<td><input class="input" data-item-field="quantity" type="number" min="0.01" ${section === 'annual_saas' ? 'max="12"' : ''} step="0.01" value="${U.escapeAttr(oneTimeQuantityLocked ? (computed.quantity || 1) : (computed.quantity ?? ''))}"${quantityLockAttr}${lockAttr} /></td>`;
      const commercialCells = section === 'annual_saas'
        ? `${quantityCell}${serviceDateCells}${discountCell}`
        : `${discountCell}${quantityCell}`;
      const invoiceStatusKey = String(computed.invoice_status || item.invoice_status || 'not_invoiced').trim().toLowerCase();
      const invoiceStatusLabel = invoiceStatusKey === 'invoiced' ? 'Invoiced' : 'Not Invoiced';
      const invoiceStatusCell = section === 'annual_saas' ? `<td><span class="badge">${U.escapeHtml(invoiceStatusLabel)}</span></td>` : '';
      return `<tr data-item-row="${section}" data-item-payload="${payload}">
      <td><input class="input" data-item-field="location_name" value="${U.escapeAttr(computed.location_name || '')}"${lockAttr} /><input type="hidden" data-item-field="location_address" value="${U.escapeAttr(computed.location_address || '')}" /></td>
      <td><input class="input" data-item-field="item_name" value="${U.escapeAttr(computed.item_name || '')}"${lockAttr} /></td>
      <td><input class="input" data-item-field="unit_price" type="number" step="0.01" value="${U.escapeAttr(computed.unit_price ?? '')}"${lockAttr} /></td>
      ${commercialCells}
      <td><input class="input" data-item-field="line_total" type="number" step="0.01" value="${U.escapeAttr(computed.line_total ?? '')}" readonly${lockAttr} /></td>
      ${invoiceStatusCell}
      ${removeCell(section, index)}
      </tr>`;
    };
    if (E.agreementAnnualItemsTbody) E.agreementAnnualItemsTbody.innerHTML = grouped.annual_saas.map((item, idx) => rowHtml('annual_saas', item, idx)).join('');
    if (E.agreementOneTimeItemsTbody) E.agreementOneTimeItemsTbody.innerHTML = grouped.one_time_fee.map((item, idx) => rowHtml('one_time_fee', item, idx)).join('');
    this.refreshOneTimeFeeQuantityInputs();
    if (E.agreementCapabilityItemsTbody) E.agreementCapabilityItemsTbody.innerHTML = '';
    const totals = this.calculateTotals([...grouped.annual_saas, ...grouped.one_time_fee]);
    if (E.agreementSaasTotal) E.agreementSaasTotal.textContent = this.formatMoney(totals.saas_total);
    if (E.agreementOneTimeTotal) E.agreementOneTimeTotal.textContent = this.formatMoney(totals.one_time_total);
    if (E.agreementGrandTotal) E.agreementGrandTotal.textContent = this.formatMoney(totals.grand_total);
    this.applyAgreementItemLocks();
  },
  assignFormValues(agreement = {}) {
    const normalizedAgreement = this.applyAgreementDerivedDates(this.normalizeAgreement(
      this.applyOfficialSignatoryDefaults(agreement, this.state.selectedAgreementCompanyForVerification)
    ));
    normalizedAgreement.status = this.resolveAgreementStatus(normalizedAgreement);
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value ?? '';
    };
    this.agreementFields.forEach(field => {
      const id = this.agreementFieldToFormInputId(field);
      set(id, normalizedAgreement[field] ?? '');
    });
    const pocToggle = document.getElementById('agreementFormIsPocToggle');
    if (pocToggle) pocToggle.checked = this.toDbBoolean(normalizedAgreement.is_poc ?? normalizedAgreement.isPoc, false);
    const pocHidden = document.getElementById('agreementFormIsPoc');
    if (pocHidden) pocHidden.value = this.toDbBoolean(normalizedAgreement.is_poc ?? normalizedAgreement.isPoc, false) ? 'true' : 'false';
    this.syncAgreementPocVisibility();
  },
  initializeProviderSignDateDefaultTracking(agreement = {}) {
    const isCreateMode = !String(agreement?.id || E.agreementForm?.dataset.id || '').trim();
    ['ProviderOfficialSignatory1SignDate','ProviderOfficialSignatory2SignDate'].forEach(suffix => {
      const field = document.getElementById(`agreementForm${suffix}`);
      if (!field) return;
      if (!isCreateMode) {
        delete field.dataset.autoSignDateDefault;
        return;
      }
      field.dataset.autoSignDateDefault = 'true';
    });
  },
  bindProviderSignDateDefaultTracking() {
    ['ProviderOfficialSignatory1SignDate','ProviderOfficialSignatory2SignDate'].forEach(suffix => {
      const field = document.getElementById(`agreementForm${suffix}`);
      if (!field || field.dataset.signDateTrackingBound === 'true') return;
      field.addEventListener('input', () => {
        field.dataset.autoSignDateDefault = 'false';
      });
      field.addEventListener('change', () => {
        field.dataset.autoSignDateDefault = 'false';
      });
      field.dataset.signDateTrackingBound = 'true';
    });
  },
  applyIdentityFieldLocks() {
    const locked = ['customer_official_signatory_name','customer_official_signatory_title','customer_signatory_name','customer_signatory_title','provider_official_signatory_1_name','provider_official_signatory_1_title','provider_official_signatory_2_name','provider_official_signatory_2_title','provider_signatory_name_primary','provider_signatory_title_primary','provider_signatory_name_secondary','provider_signatory_title_secondary','company_id','company_name','customer_name','customer_legal_name','customer_address','contact_id','contact_name','contact_email','contact_phone','contact_mobile','customer_contact_name','customer_contact_email','customer_contact_phone','customer_contact_mobile','provider_legal_name','provider_name','provider_address','provider_contact_name','provider_contact_email','provider_contact_mobile','billing_frequency'];
    locked.forEach(field => {
      const id = this.agreementFieldToFormInputId(field);
      const el = document.getElementById(id);
      if (!el) return;
      el.readOnly = true; el.setAttribute('aria-readonly','true'); el.classList.add('readonly-field','locked-field');
    });
  },
  isAgreementSignedDocumentControl(el) {
    const id = String(el?.id || '').trim();
    return [
      'agreementSignedDocumentFile',
      'agreementSignedDocumentUploadBtn',
      'agreementSignedDocumentOpenBtn'
    ].includes(id) || Boolean(el?.closest?.('#agreementSignedDocumentSection'));
  },
  getSignedDocumentAgreementSnapshot(agreement = {}) {
    const source = agreement && typeof agreement === 'object' ? agreement : {};
    return {
      ...source,
      id: String(source.id || E.agreementForm?.dataset.id || this.state.currentAgreementId || '').trim(),
      agreement_id: String(source.agreement_id || E.agreementFormAgreementId?.value || '').trim(),
      agreement_number: String(source.agreement_number || E.agreementFormAgreementNumber?.value || '').trim(),
      status: String(source.status || E.agreementFormStatus?.value || '').trim(),
      signed_document_path: String(source.signed_document_path || source.signed_agreement_document_path || E.agreementForm?.dataset.signedDocumentPath || '').trim(),
      signed_document_name: String(source.signed_document_name || source.signed_agreement_document_name || E.agreementForm?.dataset.signedDocumentName || '').trim(),
      signed_document_uploaded_at: String(source.signed_document_uploaded_at || source.signed_agreement_document_uploaded_at || E.agreementForm?.dataset.signedDocumentUploadedAt || '').trim(),
      signed_document_uploaded_by: String(source.signed_document_uploaded_by || source.signed_agreement_document_uploaded_by || E.agreementForm?.dataset.signedDocumentUploadedBy || '').trim(),
      signed_document_url: String(source.signed_document_url || source.signed_agreement_document_url || '').trim()
    };
  },
  refreshSignedAgreementDocumentUi(agreement = {}) {
    const section = E.agreementSignedDocumentSection || document.getElementById('agreementSignedDocumentSection');
    if (!section) return;
    const snapshot = this.getSignedDocumentAgreementSnapshot(agreement);
    const signed = this.isAgreementSigned(snapshot);
    const persisted = Boolean(snapshot.id);
    const hasDocument = this.agreementHasSignedDocument(snapshot);
    section.style.display = signed ? '' : 'none';
    if (E.agreementSignedDocumentFile) E.agreementSignedDocumentFile.disabled = !signed || !persisted;
    if (E.agreementSignedDocumentUploadBtn) E.agreementSignedDocumentUploadBtn.disabled = !signed || !persisted;
    if (E.agreementSignedDocumentOpenBtn) E.agreementSignedDocumentOpenBtn.style.display = hasDocument ? '' : 'none';
    if (E.agreementSignedDocumentState) {
      if (!signed) {
        E.agreementSignedDocumentState.textContent = 'Signed agreement document upload is available only after status is Signed.';
      } else if (!persisted) {
        E.agreementSignedDocumentState.textContent = 'Save this agreement before uploading the signed agreement document.';
      } else if (hasDocument) {
        const uploaded = snapshot.signed_document_uploaded_at ? ` · Uploaded ${U.fmtTS(snapshot.signed_document_uploaded_at)}` : '';
        E.agreementSignedDocumentState.textContent = `${snapshot.signed_document_name || 'Signed agreement document'}${uploaded}`;
      } else {
        E.agreementSignedDocumentState.textContent = 'Upload the signed agreement document before creating an invoice.';
      }
    }
  },
  getSignedDocumentTimestamp(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  },
  getFileExtension(fileName = '') {
    const cleanName = String(fileName || '').split(/[\\/]/).pop() || '';
    const match = cleanName.match(/\.([A-Za-z0-9]{1,16})$/);
    return match ? match[1].toLowerCase() : 'pdf';
  },
  buildSignedAgreementDocumentPath(agreement = {}, file = {}) {
    const agreementBusinessId = String(agreement.agreement_id || agreement.agreement_number || agreement.id || '').trim();
    if (!agreementBusinessId) throw new Error('Agreement ID is required to upload the signed agreement document.');
    return `agreements/${agreementBusinessId}/signed-agreement-${this.getSignedDocumentTimestamp()}.${this.getFileExtension(file.name || 'pdf')}`;
  },
  async getCurrentUserIdForSignedAgreementDocument(client = null) {
    const sessionApi = window.Session || {};
    const sessionUser = typeof sessionApi.user === 'function' ? sessionApi.user() : {};
    const authContext = typeof sessionApi.authContext === 'function' ? sessionApi.authContext() : {};
    const profile = sessionApi.state?.profile || sessionUser.profile || authContext.profile || {};
    const localId = sessionUser.user_id || sessionUser.id || authContext.user?.id || profile.auth_user_id || profile.user_id || profile.id;
    if (localId) return String(localId).trim();
    const authClient = client || this.getSupabaseClient();
    const { data } = await authClient?.auth?.getUser?.() || {};
    return String(data?.user?.id || '').trim();
  },
  async reloadLatestAgreementRow(agreementId) {
    const id = String(agreementId || '').trim();
    if (!id) return null;
    const response = await this.getAgreement(id);
    const { agreement } = this.extractAgreementAndItems(response, id);
    return agreement && typeof agreement === 'object' ? agreement : null;
  },
  async uploadSignedAgreementDocument() {
    const agreement = this.getSignedDocumentAgreementSnapshot(this.state.currentAgreement || {});
    if (!agreement.id) { UI.toast('Save this agreement before uploading the signed agreement document.'); return; }
    if (!this.isAgreementSigned(agreement)) { UI.toast('Upload the signed agreement document only after the agreement status is signed.'); return; }
    const file = E.agreementSignedDocumentFile?.files?.[0];
    if (!file) { UI.toast('Choose a signed agreement document to upload.'); return; }
    const client = this.getSupabaseClient();
    if (!client?.storage?.from || !client?.from) { UI.toast('Supabase Storage is not available.'); return; }
    const currentUserId = await this.getCurrentUserIdForSignedAgreementDocument(client);
    if (!currentUserId) { UI.toast('Unable to identify the current user. Please log in again.'); return; }
    this.setFormBusy(true);
    try {
      const latestAgreement = await this.reloadLatestAgreementRow(agreement.id) || agreement;
      if (!this.isAgreementSigned(latestAgreement)) {
        UI.toast('Upload the signed agreement document only after the agreement status is signed.');
        return;
      }
      const path = this.buildSignedAgreementDocumentPath(latestAgreement, file);
      const { error: uploadError } = await client.storage
        .from(this.signedDocumentBucket)
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const updates = {
        signed_document_path: path,
        signed_document_name: file.name,
        signed_document_uploaded_at: new Date().toISOString(),
        signed_document_uploaded_by: currentUserId
      };
      let { data, error: updateError } = await client
        .from('agreements')
        .update(updates)
        .eq('id', agreement.id)
        .select('*')
        .maybeSingle();
      if (updateError && String(updateError.message || '').toLowerCase().includes('signed_document')) {
        const legacyUpdates = {
          signed_agreement_document_path: path,
          signed_agreement_document_name: file.name,
          signed_agreement_document_uploaded_at: updates.signed_document_uploaded_at,
          signed_agreement_document_uploaded_by: currentUserId
        };
        const legacyResult = await client
          .from('agreements')
          .update(legacyUpdates)
          .eq('id', agreement.id)
          .select('*')
          .maybeSingle();
        data = legacyResult.data;
        updateError = legacyResult.error;
        if (!updateError) Object.assign(updates, legacyUpdates);
      }
      if (updateError) throw updateError;
      const updatedAgreement = this.normalizeAgreement({ ...(this.state.currentAgreement || {}), ...(latestAgreement || {}), ...(data || {}), ...updates });
      this.state.currentAgreement = updatedAgreement;
      if (E.agreementForm) {
        E.agreementForm.dataset.signedDocumentPath = updates.signed_document_path;
        E.agreementForm.dataset.signedDocumentName = updates.signed_document_name;
        E.agreementForm.dataset.signedDocumentUploadedAt = updates.signed_document_uploaded_at;
        E.agreementForm.dataset.signedDocumentUploadedBy = updates.signed_document_uploaded_by;
      }
      this.upsertLocalRow(updatedAgreement);
      this.setCachedDetail(updatedAgreement.id || agreement.id, updatedAgreement, this.state.currentItems);
      if (E.agreementSignedDocumentFile) E.agreementSignedDocumentFile.value = '';
      this.refreshSignedAgreementDocumentUi(updatedAgreement);
      UI.toast('Signed agreement document uploaded.');
    } catch (error) {
      UI.toast('Unable to upload signed agreement document: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  async openSignedAgreementDocument() {
    const agreement = this.getSignedDocumentAgreementSnapshot(this.state.currentAgreement || {});
    const path = agreement.signed_document_path || agreement.signed_agreement_document_path;
    if (!path && !agreement.signed_document_url && !agreement.signed_agreement_document_url) { UI.toast('No signed agreement document has been uploaded.'); return; }
    if (agreement.signed_document_url || agreement.signed_agreement_document_url) {
      window.open(agreement.signed_document_url || agreement.signed_agreement_document_url, '_blank', 'noopener');
      return;
    }
    const client = this.getSupabaseClient();
    if (!client?.storage?.from) { UI.toast('Supabase Storage is not available.'); return; }
    this.setFormBusy(true);
    try {
      const { data, error } = await client.storage
        .from(this.signedDocumentBucket)
        .createSignedUrl(path, 60 * 10);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Supabase did not return a signed URL.');
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch (error) {
      UI.toast('Unable to open signed agreement document: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  setFormReadOnly(readOnly) {
    if (!E.agreementForm) return;
    E.agreementForm.querySelectorAll('input, select, textarea, button').forEach(el => {
      if (el.id === 'agreementFormAgreementId' || el.id === 'agreementFormAgreementNumber') return;
      if (el.type === 'button' && /Preview|Cancel/i.test(el.textContent || '')) return;
      if (el.id === 'agreementFormPreviewBtn') return;
      if (el.id === 'agreementFormCancelBtn') return;
      if (el.id === 'agreementFormCloseBtn') return;
      if (el.id === 'agreementFormDeleteBtn') return;
      if (el.id === 'agreementFormSaveBtn') return;
      if (this.isAgreementSignedDocumentControl(el)) return;
      if ('disabled' in el && !/agreementForm(Delete|Save)Btn/.test(el.id)) el.disabled = readOnly;
    });
  },
  isAgreementEditMode() {
    return String(E.agreementForm?.dataset?.mode || '').trim() === 'edit'
      || !!String(E.agreementForm?.dataset?.id || this.state.currentAgreementId || '').trim();
  },
  isAgreementItemsLocked(agreement = this.state.currentAgreement || {}) {
    const readOnlyMode = String(E.agreementForm?.dataset?.readOnly || '').trim() === 'true';
    return readOnlyMode || this.isAgreementEditMode() || this.isProposalLockedAgreementContext(agreement);
  },
  applyAgreementItemLocks() {
    if (!E.agreementForm) return;
    const lockItems = this.isAgreementItemsLocked();
    E.agreementForm.classList.toggle('agreement-items-locked', lockItems);
    [E.agreementAddAnnualRowBtn, E.agreementAddOneTimeRowBtn].forEach(btn => {
      if (!btn) return;
      btn.style.display = lockItems ? 'none' : '';
      btn.disabled = lockItems;
      btn.setAttribute('aria-disabled', lockItems ? 'true' : 'false');
    });
    const containers = [E.agreementAnnualItemsTbody, E.agreementOneTimeItemsTbody, E.agreementCapabilityItemsTbody].filter(Boolean);
    containers.forEach(container => {
      container.querySelectorAll('input, select, textarea, button').forEach(el => {
        if (String(el.type || '').toLowerCase() === 'hidden') return;
        if (lockItems) {
          if ('readOnly' in el) el.readOnly = true;
          if ('disabled' in el) el.disabled = true;
          el.setAttribute('aria-readonly', 'true');
          el.setAttribute('aria-disabled', 'true');
          el.classList.add('readonly-field', 'locked-field', 'agreement-item-locked-field');
        } else if (el.classList.contains('agreement-item-locked-field')) {
          if ('disabled' in el) el.disabled = false;
          if ('readOnly' in el && !el.classList.contains('readonly-field')) el.readOnly = false;
          el.removeAttribute('aria-readonly');
          el.removeAttribute('aria-disabled');
          el.classList.remove('locked-field', 'agreement-item-locked-field');
        }
      });
    });
  },
  isAgreementEditableInEditMode(el) {
    if (!el) return false;
    if (el.id === 'agreementFormStatus') return true;
    if (el.closest?.('.signatory-section')) return true;
    return false;
  },
  applyAgreementEditLocks() {
    if (!E.agreementForm) return;
    const isEditMode = this.isAgreementEditMode();
    const readOnlyMode = String(E.agreementForm?.dataset?.readOnly || '').trim() === 'true';
    const proposalLocked = this.isProposalLockedAgreementContext();
    const lockItems = isEditMode || readOnlyMode || proposalLocked;
    E.agreementForm.classList.toggle('agreement-edit-locked', lockItems);
    if (E.agreementAddAnnualRowBtn) {
      E.agreementAddAnnualRowBtn.style.display = lockItems ? 'none' : '';
      E.agreementAddAnnualRowBtn.disabled = lockItems;
    }
    if (E.agreementAddOneTimeRowBtn) {
      E.agreementAddOneTimeRowBtn.style.display = lockItems ? 'none' : '';
      E.agreementAddOneTimeRowBtn.disabled = lockItems;
    }
    E.agreementForm.querySelectorAll('input, select, textarea').forEach(el => {
      const allowed = !readOnlyMode && (!isEditMode || this.isAgreementEditableInEditMode(el));
      const isHidden = String(el.type || '').toLowerCase() === 'hidden';
      if (isHidden || this.isAgreementSignedDocumentControl(el)) return;
      if (!allowed) {
        el.disabled = true;
        el.setAttribute('aria-disabled', 'true');
        el.classList.add('locked-field');
        return;
      }
      el.disabled = false;
      el.removeAttribute('aria-disabled');
      if (!el.classList.contains('readonly-field')) el.classList.remove('locked-field');
      if (el.classList.contains('readonly-field') || el.hasAttribute('readonly')) {
        el.readOnly = true;
        el.setAttribute('aria-readonly', 'true');
      }
    });
    this.applyAgreementItemLocks();
  },
  applyAgreementProposalLocks() {
    if (!E.agreementForm) return;
    const proposalLocked = this.isProposalLockedAgreementContext();
    const readOnlyMode = String(E.agreementForm?.dataset?.readOnly || '').trim() === 'true';
    const alwaysLocked = ['agreementFormServiceEndDate'];
    const proposalLockedIds = [
      'agreementFormPaymentTerm',
      'agreementFormIsPocToggle',
      'agreementFormPocLocationCount',
      'agreementFormPocLicenseMonths',
      'agreementFormPocServiceStartDate',
      'agreementFormPocServiceEndDate',
      'agreementFormPocSuccessKpis',
      'agreementFormPocConversionCommitment'
    ];
    const lockElement = el => {
      if (!el) return;
      if (String(el.type || '').toLowerCase() === 'hidden') return;
      if ('disabled' in el && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.tagName === 'TEXTAREA')) el.disabled = true;
      if ('readOnly' in el) el.readOnly = true;
      el.setAttribute('aria-readonly', 'true');
      el.setAttribute('aria-disabled', 'true');
      el.classList.add('readonly-field', 'locked-field', 'proposal-locked-field');
    };
    const unlockElement = el => {
      if (!el || readOnlyMode) return;
      if (el.id === 'agreementFormServiceEndDate') return;
      if (!el.classList.contains('proposal-locked-field')) return;
      if ('disabled' in el) el.disabled = false;
      if ('readOnly' in el) el.readOnly = false;
      el.removeAttribute('aria-readonly');
      el.removeAttribute('aria-disabled');
      el.classList.remove('readonly-field', 'locked-field', 'proposal-locked-field');
    };
    alwaysLocked.forEach(id => lockElement(document.getElementById(id)));
    proposalLockedIds.forEach(id => {
      const el = document.getElementById(id);
      if (proposalLocked) lockElement(el);
      else unlockElement(el);
    });
    this.applyAgreementItemLocks();
  },
  buildAgreementEditableUpdate(agreement = {}) {
    const allowedFields = [
      'status',
      'customer_official_signatory_name',
      'customer_official_signatory_title',
      'customer_official_sign_date',
      'customer_signatory_name',
      'customer_signatory_title',
      'customer_sign_date',
      'provider_official_signatory_1_name',
      'provider_official_signatory_1_title',
      'provider_official_signatory_1_sign_date',
      'provider_official_signatory_2_name',
      'provider_official_signatory_2_title',
      'provider_official_signatory_2_sign_date',
      'provider_signatory_name_primary',
      'provider_signatory_title_primary',
      'provider_signatory_name_secondary',
      'provider_signatory_title_secondary',
      'provider_sign_date',
      'provider_signatory_name',
      'provider_signatory_title',
      'gm_signed',
      'financial_controller_signed',
      'signed_date'
    ];
    return allowedFields.reduce((out, field) => {
      if (Object.prototype.hasOwnProperty.call(agreement, field)) out[field] = agreement[field];
      return out;
    }, {});
  },
  openAgreementForm(agreement = this.emptyAgreement(), items = [], { readOnly = false } = {}) {
    if (!E.agreementFormModal || !E.agreementForm) return;
    const signedLocked = this.isAgreementSigned(agreement);
    const effectiveReadOnly = readOnly || signedLocked;
    E.agreementForm.dataset.id = agreement.id || '';
    E.agreementForm.dataset.mode = agreement.id ? 'edit' : 'create';
    E.agreementForm.dataset.source = agreement.id ? '' : String(agreement.proposal_id || '').trim() ? 'proposal' : '';
    E.agreementForm.dataset.proposalUuid = String(agreement.proposal_id || '').trim();
    E.agreementForm.dataset.readOnly = effectiveReadOnly ? 'true' : 'false';
    E.agreementForm.dataset.signedLocked = signedLocked ? 'true' : 'false';
    E.agreementForm.dataset.signedDocumentPath = String(agreement.signed_document_path || agreement.signed_agreement_document_path || '').trim();
    E.agreementForm.dataset.signedDocumentName = String(agreement.signed_document_name || agreement.signed_agreement_document_name || '').trim();
    E.agreementForm.dataset.signedDocumentUploadedAt = String(agreement.signed_document_uploaded_at || agreement.signed_agreement_document_uploaded_at || '').trim();
    E.agreementForm.dataset.signedDocumentUploadedBy = String(agreement.signed_document_uploaded_by || agreement.signed_agreement_document_uploaded_by || '').trim();
    this.state.currentAgreementId = String(agreement.id || '').trim();
    this.state.currentAgreement = agreement && typeof agreement === 'object' ? { ...agreement } : null;
    this.state.currentItems = Array.isArray(items) ? [...items] : [];
    this.assignFormValues(agreement);
    this.syncAgreementStatusFromSignatoryDates();
    this.captureProviderSignDateOriginalValues();
    this.initializeProviderSignDateDefaultTracking(agreement);
    this.renderItemRows(items);
    this.state.selectedAgreementCompanyForVerification = this.hasCompanyVerificationFields(agreement) ? agreement : null;
    this.updateAgreementCompanyVerificationUi(this.state.selectedAgreementCompanyForVerification);
    if (E.agreementFormTitle) E.agreementFormTitle.textContent = agreement.id ? (effectiveReadOnly ? 'View Agreement' : 'Edit Agreement') : 'Create Agreement';
    if (E.agreementSignedLockMessage) E.agreementSignedLockMessage.style.display = signedLocked ? '' : 'none';
    if (E.agreementFormDeleteBtn) E.agreementFormDeleteBtn.style.display = !effectiveReadOnly && agreement.id && Permissions.canDeleteAgreement() ? '' : 'none';
    if (E.agreementFormSaveBtn) {
      const canSave = agreement.id ? Permissions.canUpdateAgreement() : Permissions.canCreateAgreement();
      E.agreementFormSaveBtn.style.display = !effectiveReadOnly && canSave ? '' : 'none';
    }
    this.setFormReadOnly(effectiveReadOnly);
    this.applyIdentityFieldLocks();
    this.syncAgreementServiceEndDate();
    this.applyAgreementEditLocks();
    this.applyAgreementProposalLocks();
    this.applyProviderSignDateRoleLocks();
    this.refreshSignedAgreementDocumentUi(agreement);
    E.agreementFormModal.classList.add('open');
    E.agreementFormModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => {
      window.CrmCompanyContactSelectors?.initializeCompanyContactSelectorsForAgreement?.();
      this.syncAgreementServiceEndDate();
      this.applyAgreementEditLocks();
      this.applyAgreementProposalLocks();
      this.applyProviderSignDateRoleLocks();
      this.refreshSignedAgreementDocumentUi(this.state.currentAgreement || agreement);
    }, 0);
    if (window.setAppHashRoute && window.buildRecordHashRoute) setAppHashRoute(buildRecordHashRoute('agreements', agreement || {}));
  },
  closeAgreementForm() {
    if (!E.agreementFormModal || !E.agreementForm) return;
    E.agreementFormModal.classList.remove('open');
    E.agreementFormModal.setAttribute('aria-hidden', 'true');
    if (window.setAppHashRoute) setAppHashRoute('#crm?tab=agreements');
    E.agreementForm.reset();
    E.agreementForm.dataset.id = '';
    E.agreementForm.dataset.source = '';
    E.agreementForm.dataset.proposalUuid = '';
    E.agreementForm.dataset.readOnly = '';
    E.agreementForm.dataset.signedLocked = '';
    E.agreementForm.dataset.signedDocumentPath = '';
    E.agreementForm.dataset.signedDocumentName = '';
    E.agreementForm.dataset.signedDocumentUploadedAt = '';
    E.agreementForm.dataset.signedDocumentUploadedBy = '';
    E.agreementForm.classList.remove('agreement-edit-locked');
    this.state.currentAgreementId = '';
    this.state.currentAgreement = null;
    this.state.currentItems = [];
    this.state.selectedAgreementCompanyForVerification = null;
    this.updateAgreementCompanyVerificationUi(null);
    if (E.agreementSignedLockMessage) E.agreementSignedLockMessage.style.display = 'none';
    this.refreshSignedAgreementDocumentUi({});
    this.renderItemRows([]);
  },
  setFormBusy(busy) {
    const inFlight = !!busy;
    if (E.agreementFormSaveBtn) E.agreementFormSaveBtn.disabled = inFlight;
    if (E.agreementFormDeleteBtn) E.agreementFormDeleteBtn.disabled = inFlight;
    if (inFlight) {
      if (E.agreementSignedDocumentUploadBtn) E.agreementSignedDocumentUploadBtn.disabled = true;
      if (E.agreementSignedDocumentOpenBtn) E.agreementSignedDocumentOpenBtn.disabled = true;
    } else {
      this.refreshSignedAgreementDocumentUi(this.state.currentAgreement || {});
      if (E.agreementSignedDocumentOpenBtn) E.agreementSignedDocumentOpenBtn.disabled = false;
    }
  },
  recalculateAnnualServiceEndDateForEvent(event) {
    const field = event.target?.getAttribute('data-item-field');
    if (field !== 'quantity' && field !== 'service_start_date') return false;
    const tr = event.target.closest('tr[data-item-row]');
    const section = tr?.getAttribute('data-item-row');
    if (!tr || section !== 'annual_saas') return false;
    const get = key => tr.querySelector(`[data-item-field="${key}"]`)?.value ?? '';
    const endInput = tr.querySelector('[data-item-field="service_end_date"]');
    if (endInput) endInput.value = this.calculateServiceEndDate(get('service_start_date'), get('quantity'));
    return true;
  },
  addRow(section) {
    if (this.isAgreementItemsLocked()) {
      UI.toast('Agreement items are locked.');
      return;
    }
    const items = this.collectItems();
    if (section === 'capability') return;
    items.push({ section, location_name: '', location_address: '', service_start_date: section === 'annual_saas' ? this.getDefaultAnnualServiceStartDate() : '', service_end_date: section === 'annual_saas' ? this.calculateServiceEndDate(this.getDefaultAnnualServiceStartDate(), 12) : '', item_name: '', unit_price: 0, discount_percent: 0, quantity: section === 'annual_saas' ? 12 : Math.max(1, this.getAnnualSaasRowCountFromDom() || 1), discounted_unit_price: 0, line_total: 0 });
    this.renderItemRows(items);
  },
  removeRow(section, index) {
    if (this.isAgreementItemsLocked()) {
      UI.toast('Agreement items are locked.');
      return;
    }
    const grouped = this.groupedItems(this.collectItems());
    grouped[section] = grouped[section].filter((_, idx) => idx !== index);
    this.renderItemRows([...grouped.annual_saas, ...grouped.one_time_fee]);
  },
  async openAgreementFormById(agreementId, { readOnly = false, trigger = null } = {}) {
    const id = String(agreementId || '').trim();
    if (!Permissions.canPreviewAgreement()) {
      UI.toast('You do not have permission to view agreements.');
      return;
    }
    if (!id) return;
    if (this.state.openingAgreementIds.has(id)) return;
    this.state.openingAgreementIds.add(id);
    this.setTriggerBusy(trigger, true);
    console.time('agreement-open');
    const localSummary = this.state.rows.find(row => String(row.id || '').trim() === id);
    this.openAgreementForm(
      localSummary ? { ...this.emptyAgreement(), ...localSummary, id } : { id },
      [],
      { readOnly }
    );
    this.setFormDetailLoading(true);
    try {
      const cached = this.getCachedDetail(id);
      if (cached) {
        this.openAgreementForm(cached.agreement, cached.items, { readOnly });
        return;
      }
      const response = await this.getAgreement(id);
      const { agreement: rawAgreement, items } = this.extractAgreementAndItems(response, id);
      const agreement = await this.applyCompanyIdentityToAgreement(rawAgreement, { allowFallbackToAgreement: true });
      this.setCachedDetail(id, agreement, items);
      if (String(E.agreementForm?.dataset.id || '').trim() === id) {
        this.openAgreementForm(agreement, items, { readOnly });
      }
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to load agreement: ' + (error?.message || 'Unknown error'));
    } finally {
      this.state.openingAgreementIds.delete(id);
      this.setTriggerBusy(trigger, false);
      this.setFormDetailLoading(false);
      console.timeEnd('agreement-open');
    }
  },

  validateCommercialItems(items = []) {
    const safeItems = Array.isArray(items) ? items : [];
    const hasInvalidAnnual = safeItems.some(item => {
      if (String(item?.section || '').trim().toLowerCase() !== 'annual_saas') return false;
      const unit = this.toNumberSafe(item.unit_price);
      const qty = this.toNumberSafe(item.quantity);
      const discount = this.toNumberSafe(item.discount_percent);
      const start = this.normalizeDateInputValue(item.service_start_date);
      const end = this.normalizeDateInputValue(item.service_end_date);
      return unit < 0 || qty <= 0 || qty > 12 || discount < 0 || discount > 100 || !start || !end || end <= start;
    });
    if (hasInvalidAnnual) {
      UI.toast('Please complete the annual SaaS service dates and license months.');
      return false;
    }
    const hasInvalidOneTime = safeItems.some(item => {
      if (String(item?.section || '').trim().toLowerCase() !== 'one_time_fee') return false;
      const unit = this.toNumberSafe(item.unit_price);
      const qty = this.toNumberSafe(item.quantity);
      const discount = this.toNumberSafe(item.discount_percent);
      return unit < 0 || qty <= 0 || discount < 0 || discount > 100;
    });
    if (hasInvalidOneTime) {
      UI.toast('Please enter valid one-time fee unit prices, quantities, and discounts.');
      return false;
    }
    return true;
  },
  async submitForm() {
    if (this.state.saveInFlight) return;
    const id = String(E.agreementForm?.dataset.id || '').trim();
    if (id && !Permissions.canUpdateAgreement()) {
      UI.toast('You do not have permission to update agreements.');
      return;
    }
    if (!id && !Permissions.canCreateAgreement()) {
      UI.toast('Login is required to save agreements.');
      return;
    }
    const source = String(E.agreementForm?.dataset.source || '').trim();
    const formProposalUuid = String(E.agreementForm?.dataset.proposalUuid || '').trim();
    const { agreement, items } = this.collectFormValues();
    let latestExistingAgreement = null;
    if (id) {
      try {
        latestExistingAgreement = await this.reloadLatestAgreementRow(id);
      } catch (error) {
        UI.toast('Unable to verify agreement lock status: ' + (error?.message || 'Unknown error'));
        return;
      }
      if (this.isAgreementSigned(latestExistingAgreement)) {
        UI.toast('Signed agreements are locked and cannot be edited.');
        return;
      }
    }
    if (!this.validateProviderSignDateRoleChanges()) return;
    if (!id && !this.validateCommercialItems(items)) return;
    const isDirectCreate = !id && source !== 'create_from_proposal' && !String(formProposalUuid || agreement.proposal_id || '').trim();
    const provider = this.getSignedInUserForAgreement();
    agreement.billing_frequency = 'Annual';
    const validPaymentTerms = ['Net 7', 'Net 14', 'Net 21', 'Net 30'];
    agreement.payment_term = validPaymentTerms.includes(String(agreement.payment_term || agreement.payment_terms || '').trim()) ? String(agreement.payment_term || agreement.payment_terms || '').trim() : 'Net 30';
    agreement.payment_terms = agreement.payment_term;
    agreement.provider_legal_name = this.providerIdentityDefaults.legalName;
    agreement.provider_name = this.providerIdentityDefaults.name;
    agreement.provider_address = this.providerIdentityDefaults.address;
    agreement.provider_contact_name = this.providerIdentityDefaults.contactName;
    agreement.provider_contact_email = this.providerIdentityDefaults.contactEmail;
    agreement.provider_contact_mobile = this.providerIdentityDefaults.contactMobile;
    agreement.contact_name = this.buildContactPersonName({ ...agreement, contact_name: agreement.contact_name || agreement.customer_contact_name }) || String(agreement.contact_name || '').trim();
    agreement.customer_contact_name = this.buildContactPersonName({ ...agreement, contact_name: agreement.customer_contact_name || agreement.contact_name }) || String(agreement.customer_contact_name || '').trim();
    agreement.customer_signatory_email = String(agreement.customer_signatory_email || agreement.customer_contact_email || agreement.contact_email || '').trim();
    agreement.customer_signatory_phone = String(agreement.customer_signatory_phone || agreement.customer_contact_mobile || agreement.contact_mobile || agreement.customer_contact_phone || agreement.contact_phone || '').trim();
    const companyHydratedAgreement = await this.applyCompanyIdentityToAgreement(agreement, { allowFallbackToAgreement: true });
    agreement.company_id = companyHydratedAgreement.company_id;
    agreement.company_name = companyHydratedAgreement.company_name;
    agreement.customer_address = companyHydratedAgreement.customer_address;
    agreement.customer_legal_name = String(companyHydratedAgreement.customer_legal_name || agreement.customer_legal_name || '').trim();
    agreement.customer_name = agreement.customer_legal_name;
    Object.assign(agreement, this.applyOfficialSignatoryDefaults(companyHydratedAgreement, this.state.selectedAgreementCompanyForVerification || companyHydratedAgreement.company || null));
    this.normalizeAgreementSignatoryDateAliases(agreement);
    agreement.status = this.resolveAgreementStatus(agreement);
    agreement.provider_signatory_email = String(provider.email || '').trim();
    if (!String(agreement.customer_official_signatory_name || '').trim() || !String(agreement.customer_official_signatory_title || '').trim()) {
      this.showBlockingDialog(
        'Company Authorized Signatory Required',
        'Company authorized signatory details are missing. Please update the company profile before creating the agreement.'
      );
      return;
    }

    if (!id && !(await this.ensureCompanyVerifiedBeforeAgreement({
      ...agreement,
      company: this.state.selectedAgreementCompanyForVerification || agreement.company
    }))) {
      return;
    }
    if (isDirectCreate && !String(agreement.contact_id || '').trim()) {
      UI.toast('Please select a contact.');
      return;
    }

    if (!id) {
      agreement.proposal_id = String(agreement.proposal_id || formProposalUuid || '').trim();
      const withBusinessIds = this.ensureAgreementBusinessIdentifiers(agreement);
      agreement.agreement_id = withBusinessIds.agreement_id;
      agreement.agreement_number = withBusinessIds.agreement_number;
    }
    const preparedItems = id ? null : this.hydrateItemIdsForSave(items, { isCreate: true });
    const currentRecord = latestExistingAgreement || this.state.rows.find(row => String(row.id || '') === id) || {};
    const agreementUpdatePayload = id ? this.buildAgreementEditableUpdate(agreement) : agreement;
    const requestedDiscount = items.reduce((max, item) => Math.max(max, this.toNumberSafe(item.discount_percent)), 0);
    const currentStatus = this.resolveAgreementStatus(currentRecord || {});
    this.normalizeAgreementSignatoryDateAliases(agreement);
    agreement.status = this.resolveAgreementStatus({ ...agreement, status: agreement.status || currentStatus || 'Draft' });
    if (agreementUpdatePayload && typeof agreementUpdatePayload === 'object') {
      this.normalizeAgreementSignatoryDateAliases(agreementUpdatePayload);
      agreementUpdatePayload.status = agreement.status;
      if (agreement.signed_date) agreementUpdatePayload.signed_date = agreement.signed_date;
      if (agreement.gm_signed !== undefined) agreementUpdatePayload.gm_signed = agreement.gm_signed;
      if (agreement.financial_controller_signed !== undefined) agreementUpdatePayload.financial_controller_signed = agreement.financial_controller_signed;
    }
    const workflowAction = id ? 'update' : 'create';
    let workflowDecision = null;
    if (this.shouldSkipAgreementWorkflow({
      currentStatus,
      nextStatus: agreement.status,
      action: workflowAction,
      payload: agreementUpdatePayload
    })) {
      workflowDecision = {
        allowed: true,
        ok: true,
        skipped: true,
        reason: 'Draft/no-change agreement save does not require workflow approval.'
      };
    } else {
      try {
        workflowDecision = await window.WorkflowEngine?.enforceBeforeSave?.('agreements', currentRecord, {
          agreement_id: id,
          id,
          action: workflowAction,
          current_status: currentStatus,
          requested_status: agreement.status || '',
          discount_percent: requestedDiscount,
          requested_changes: { agreement: agreementUpdatePayload, items: preparedItems || [] }
        });
      } catch (error) {
        console.warn('[Agreement] Workflow validation unavailable; continuing agreement save fallback.', error);
        workflowDecision = {
          allowed: true,
          ok: true,
          unavailable: true,
          fallback: true
        };
      }
    }

    if (this.isAgreementWorkflowUnavailableDecision(workflowDecision)) {
      console.warn('[Agreement] Workflow validation unavailable; continuing agreement save fallback.', workflowDecision);
      workflowDecision = {
        ...workflowDecision,
        allowed: true,
        ok: true,
        unavailable: true,
        fallback: true
      };
    }

    if (workflowDecision && workflowDecision.ok === false) {
      UI.toast(workflowDecision.message || workflowDecision.reason || 'Workflow rejected this agreement change.');
      return;
    }

    if (workflowDecision?.requiresApproval || workflowDecision?.pendingApproval) {
      if (workflowDecision.approvalCreated === true) {
        UI.toast('Approval request submitted successfully.');
        return;
      }
      UI.toast(window.WorkflowEngine?.composeDeniedMessage?.(workflowDecision, 'Agreement save blocked.') || workflowDecision.reason || 'Agreement save blocked by workflow approval.');
      return;
    }

    if (workflowDecision && workflowDecision.allowed === false) {
      UI.toast(window.WorkflowEngine?.composeDeniedMessage?.(workflowDecision, 'Agreement save blocked.') || workflowDecision.reason || 'Workflow rejected this agreement change.');
      return;
    }
    this.state.saveInFlight = true;
    this.setFormBusy(true);
    console.time('entity-save');
    try {
      const saveResponse = id
        ? await this.updateAgreement(id, agreementUpdatePayload, null)
        : await this.createAgreement(agreement, preparedItems);
      const persistedAgreement = this.extractAgreementAndItems(saveResponse, id).agreement;
      const persistedAgreementUuid = String(persistedAgreement?.id || id || '').trim();
      this.refreshCompanyLifecycleStatus({ ...agreement, ...persistedAgreement });
      this.setCachedDetail(persistedAgreementUuid, persistedAgreement, preparedItems || items);
      try {
        await this.syncSignedAgreementToClient({ ...agreement, ...persistedAgreement }, String(persistedAgreement?.id || persistedAgreement?.agreement_id || '').trim());
      } catch (clientSyncError) {
        UI.toast(`Agreement saved, but client sync failed: ${clientSyncError?.message || 'Unknown error'}`);
      }
      try {
        await this.syncSignedAgreementToOperationsOnboarding(
          { ...agreement, ...persistedAgreement },
          String(persistedAgreement?.id || '').trim()
        );
        if (this.hasSignedSignal({ ...agreement, ...persistedAgreement })) this.refreshCompanyLifecycleStatus({ ...agreement, ...persistedAgreement }, 'Onboarding');
      } catch (operationsSyncError) {
        UI.toast(`Agreement saved, but operations onboarding sync failed: ${operationsSyncError?.message || 'Unknown error'}`);
      }
      if (persistedAgreement) {
        this.upsertLocalRow(persistedAgreement);
        if (!id && persistedAgreement.proposal_id) {
          this.markProposalAsConvertedToAgreement(persistedAgreement.proposal_id, String(persistedAgreement.agreement_id || '').trim());
        }
      }
      const savedAgreement = { ...agreement, ...(persistedAgreement || {}) };
      const savedAgreementId = String(persistedAgreement?.id || id || '').trim();
      if (this.isAgreementSigned(savedAgreement) && savedAgreementId) {
        const refreshedAgreement = await this.reloadLatestAgreementRow(savedAgreementId).catch(() => null);
        const lockedAgreement = refreshedAgreement || savedAgreement;
        this.openAgreementForm(lockedAgreement, preparedItems || items, { readOnly: true });
      } else {
        this.closeAgreementForm();
      }
      window.dispatchEvent(new CustomEvent('clients:refresh-totals', { detail: { reason: 'agreement-saved' } }));
      UI.toast(id ? 'Agreement updated.' : source === 'proposal' ? 'Agreement created from proposal.' : 'Agreement created.');
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      if (this.hasConflictError(error, 'PROPOSAL_ALREADY_CONVERTED_TO_AGREEMENT')) {
        UI.toast('This proposal has already been converted to an agreement.');
        return;
      }
      UI.toast('Unable to save agreement: ' + (error?.message || 'Unknown error'));
    } finally {
      console.timeEnd('entity-save');
      this.state.saveInFlight = false;
      this.setFormBusy(false);
    }
  },
  async deleteById(agreementId) {
    if (!Permissions.canDeleteAgreement()) {
      UI.toast('Insufficient permissions to delete agreements.');
      return;
    }
    const id = String(agreementId || '').trim();
    const row = this.state.rows.find(entry => String(entry?.id || '').trim() === id);
    const label = String(row?.agreement_id || row?.agreement_number || id).trim();
    if (!id || !window.confirm(`Delete agreement ${label}?`)) return;
    try {
      await this.deleteAgreement(id);
      delete this.state.detailCacheById[id];
      this.removeLocalRow(id);
      this.closeAgreementForm();
      UI.toast('Agreement deleted.');
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to delete agreement: ' + (error?.message || 'Unknown error'));
    }
  },
  async previewAgreementHtml(id) {
    const agreementId = String(id || '').trim();
    if (!agreementId) return;
    if (!Permissions.canGenerateAgreementHtml()) {
      UI.toast('You do not have permission to preview agreements.');
      return;
    }
    try {
      const { agreement, items } = await this.loadAgreementPreviewData(agreementId);
      const html = this.buildAgreementPreviewHtml(agreement, items);
      if (!html) {
        UI.toast('Unable to build agreement preview.');
        return;
      }
      const brandedHtml = U.addIncheckDocumentLogo(U.formatPreviewHtmlDates(html));
      const previewLabel = String(agreement?.agreement_id || agreement?.agreement_number || agreement?.id || agreementId).trim();
      if (E.agreementPreviewTitle) E.agreementPreviewTitle.textContent = `Agreement Preview · ${previewLabel}`;
      if (E.agreementPreviewFrame) E.agreementPreviewFrame.srcdoc = brandedHtml;
      if (E.agreementPreviewModal) {
        E.agreementPreviewModal.classList.add('open');
        E.agreementPreviewModal.setAttribute('aria-hidden', 'false');
      }
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to preview agreement: ' + (error?.message || 'Unknown error'));
    }
  },
  closePreviewModal() {
    if (!E.agreementPreviewModal) return;
    E.agreementPreviewModal.classList.remove('open');
    E.agreementPreviewModal.setAttribute('aria-hidden', 'true');
    if (E.agreementPreviewFrame) E.agreementPreviewFrame.srcdoc = '';
  },
  exportPreviewPdf() {
    const frame = E.agreementPreviewFrame;
    const previewTitle = String(E.agreementPreviewTitle?.textContent || 'Agreement Preview').trim();
    if (!frame || !String(frame.srcdoc || '').trim()) {
      UI.toast('Open agreement preview first to extract PDF.');
      return;
    }
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      UI.toast('Unable to access agreement preview content.');
      return;
    }
    frameWindow.focus();
    frameWindow.print();
    UI.toast(`Print dialog opened for ${previewTitle}. Choose "Save as PDF" to extract.`);
  },
  async createFromProposalFlow(proposalId) {
    if (!Permissions.canCreateAgreementFromProposal()) {
      UI.toast('You do not have permission to create agreements from proposals.');
      return;
    }
    const proposalRef = String(proposalId || '').trim();
    if (!proposalRef) {
      UI.toast('Proposal ID is required.');
      return;
    }
    const localProposal = window.Proposals?.state?.rows?.find(row =>
      String(row?.id || '').trim() === proposalRef || String(row?.proposal_id || '').trim() === proposalRef
    );
    if (window.Proposals?.isAgreementAlreadyCreated?.(localProposal)) {
      UI.toast('This proposal has already been converted to an agreement.');
      return;
    }
    try {
      const isUuid = value =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
      const proposalUuid = String(localProposal?.id || proposalRef).trim();
      if (!isUuid(proposalUuid)) {
        UI.toast('Proposal UUID is required. Select a proposal that is loaded in the proposals list.');
        return;
      }
      // Reload the latest proposal before conversion so signed-document requirements are checked against current data.
      const proposalResponse = await window.Proposals?.getProposal?.(proposalUuid);
      const extracted = window.Proposals?.extractProposalAndItems?.(proposalResponse, proposalUuid) || {};
      const proposal = extracted.proposal && typeof extracted.proposal === 'object' ? extracted.proposal : { id: proposalUuid };
      const resolvedProposalUuid = String(proposal.id || proposalUuid).trim();
      if (window.Proposals?.isAgreementAlreadyCreated?.(proposal)) {
        UI.toast('This proposal has already been converted to an agreement.');
        return;
      }
      if (!(await this.guardProposalConversionAllowed(proposal))) return;
      const proposalItems = Array.isArray(extracted.items) ? extracted.items : [];
      let draft = this.buildDraftAgreementFromProposal(
        { ...proposal, id: resolvedProposalUuid },
        proposalItems
      );
      draft = { ...draft, agreement: await this.applyCompanyIdentityToAgreement(draft.agreement) };
      if (typeof setActiveView === 'function') setActiveView('agreements');
      this.openAgreementForm(draft.agreement, draft.items, { readOnly: false });
      UI.toast(`Agreement form prefilled from proposal ${String(proposal.proposal_id || proposalRef).trim()}. Save to create.`);
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to create from proposal: ' + (error?.message || 'Unknown error'));
    }
  },

  async createInvoiceFromAgreementFlow(agreementId) {
    if (!Permissions.canCreateInvoiceFromAgreement()) {
      UI.toast('You do not have permission to create invoices from agreements.');
      return;
    }
    const id = String(agreementId || '').trim();
    if (!id) {
      UI.toast('Agreement ID is required.');
      return;
    }
    try {
      const latestAgreement = await this.reloadLatestAgreementRow(id);
      if (!this.isAgreementSigned(latestAgreement)) {
        UI.toast('Only signed agreements can be invoiced.');
        return;
      }
      if (!this.agreementHasSignedDocument(latestAgreement)) {
        UI.toast('You should upload the signed agreement document before creating an invoice.');
        return;
      }
      if (typeof setActiveView === 'function') setActiveView('invoices');
      if (window.Invoices?.openCreateFromAgreementTemplate) {
        await window.Invoices.openCreateFromAgreementTemplate(id);
        UI.toast(`Invoice template opened from agreement ${id}. Verify details, then save to create the invoice.`);
      }
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to create invoice from agreement: ' + (error?.message || 'Unknown error'));
    }
  },
  safeRender(context = 'agreements') {
    try {
      this.render();
    } catch (error) {
      console.error(`[Agreements] render failed during ${context}`, error);
      try {
        if (E?.agreementsState) E.agreementsState.textContent = 'Unable to render agreements. Please refresh.';
      } catch {}
    }
  },
  async loadAndRefresh({ force = false } = {}) {
    try {
      if (this.state.loading && !force) return;
      const hasWarmCache = this.state.loaded && Date.now() - this.state.lastLoadedAt <= this.state.cacheTtlMs;
      if (hasWarmCache && !force) {
        this.applyFilters();
        this.renderFilters();
        this.safeRender('warm-cache');
        return;
      }
      this.state.loading = true;
      this.state.loadError = '';
      this.safeRender('loading');

      const response = await this.listAgreements({
        limit: this.state.limit,
        page: this.state.page,
        sort_by: 'updated_at',
        sort_dir: 'desc',
        search: this.state.search || '',
        summary_only: true,
        forceRefresh: force
      });
      const normalized = this.extractListResult(response);
      this.state.rows = normalized.rows.map(row => this.normalizeAgreement(row));
      this.state.total = normalized.total;
      this.state.returned = normalized.returned;
      this.state.hasMore = normalized.hasMore;
      this.state.page = normalized.page;
      this.state.limit = normalized.limit;
      this.state.offset = normalized.offset;
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
    } catch (error) {
      if (typeof isAuthError === 'function' && isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      console.error('[Agreements] load failed', error);
      this.state.rows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load agreements.';
    } finally {
      this.state.loading = false;
      try { this.applyFilters(); } catch (error) { console.error('[Agreements] filter failed', error); }
      try { this.renderFilters(); } catch (error) { console.error('[Agreements] filter render failed', error); }
      this.safeRender('final');
    }
  },
  wire() {
    if (this.state.initialized) return;
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
    if (E.agreementsSummary) {
      const activate = card => {
        if (!card) return;
        const filter = card.getAttribute('data-kpi-filter');
        if (!filter) return;
        this.applyKpiFilter(filter);
      };
      E.agreementsSummary.addEventListener('click', event => {
        activate(event.target?.closest?.('[data-kpi-filter]'));
      });
      E.agreementsSummary.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target?.closest?.('[data-kpi-filter]');
        if (!card) return;
        event.preventDefault();
        activate(card);
      });
    }
    bindState(E.agreementsSearchInput, 'search');
    bindState(E.agreementsStatusFilter, 'status');
    bindState(E.agreementsProposalDealFilter, 'proposalOrDeal');
    if (E.agreementsExportCsvBtn) E.agreementsExportCsvBtn.addEventListener('click', () => this.exportAgreementsCsv());

    if (E.agreementsRefreshBtn) E.agreementsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    if (E.agreementsCreateBtn) E.agreementsCreateBtn.addEventListener('click', () => {
      if (!Permissions.canCreateAgreement()) return UI.toast('Login is required to save agreements.');
      this.openAgreementForm();
    });
    if (E.agreementsTbody) E.agreementsTbody.addEventListener('click', event => {
      const trigger = event.target?.closest?.('button[data-agreement-view], button[data-agreement-edit], button[data-agreement-request-technical], button[data-agreement-preview], button[data-agreement-create-invoice], button[data-agreement-delete]');
      if (!trigger) return;
      const viewId = trigger.getAttribute('data-agreement-view');
      if (viewId) return this.runRowAction(`view:${viewId}`, trigger, () => this.openAgreementFormById(viewId, { readOnly: true, trigger }));
      const editId = trigger.getAttribute('data-agreement-edit');
      if (editId) {
        if (!Permissions.canUpdateAgreement()) return UI.toast('You do not have permission to edit agreements.');
        return this.runRowAction(`edit:${editId}`, trigger, () => this.openAgreementFormById(editId, { readOnly: false, trigger }));
      }
      const requestTechnicalId = trigger.getAttribute('data-agreement-request-technical');
      if (requestTechnicalId) {
        if (!Permissions.canRequestTechnicalAdmin()) return UI.toast('You do not have permission to request Technical Admin.');
        return this.runRowAction(`request-technical:${requestTechnicalId}`, trigger, () => this.requestTechnicalAdminFlow(requestTechnicalId));
      }
      const previewId = trigger.getAttribute('data-agreement-preview');
      if (previewId) { if (!Permissions.canGenerateAgreementHtml()) return UI.toast('You do not have permission to preview agreements.'); return this.runRowAction(`preview:${previewId}`, trigger, () => this.previewAgreementHtml(previewId)); }
      const createInvoiceId = trigger.getAttribute('data-agreement-create-invoice');
      if (createInvoiceId) return this.runRowAction(`create-invoice:${createInvoiceId}`, trigger, () => this.createInvoiceFromAgreementFlow(createInvoiceId));
      const deleteId = trigger.getAttribute('data-agreement-delete');
      if (deleteId) return this.runRowAction(`delete:${deleteId}`, trigger, () => this.deleteById(deleteId));
    });

    if (E.agreementFormCloseBtn) E.agreementFormCloseBtn.addEventListener('click', () => this.closeAgreementForm());
    if (E.agreementFormCancelBtn) E.agreementFormCancelBtn.addEventListener('click', () => this.closeAgreementForm());
    if (E.agreementFormModal) E.agreementFormModal.addEventListener('click', event => {
      if (event.target === E.agreementFormModal) this.closeAgreementForm();
    });
    if (E.agreementForm) {
      this.bindProviderSignDateDefaultTracking();
      E.agreementForm.addEventListener('submit', event => { event.preventDefault(); this.submitForm(); });
      E.agreementForm.addEventListener('crm-company-selected', event => {
        const company = event?.detail?.company && typeof event.detail.company === 'object' ? event.detail.company : null;
        this.state.selectedAgreementCompanyForVerification = company;
        this.applyOfficialSignatoryDefaultsToForm(company);
      });
      const agreementCompanySelect = document.getElementById('agreementFormCompanySelector');
      const agreementDateInput = document.getElementById('agreementFormAgreementDate');
      const agreementServiceStartDate = document.getElementById('agreementFormServiceStartDate');
      const agreementLengthInput = document.getElementById('agreementFormAgreementLength');
      const agreementPocToggle = document.getElementById('agreementFormIsPocToggle');
      const agreementPocStartDate = document.getElementById('agreementFormPocServiceStartDate');
      const agreementPocMonths = document.getElementById('agreementFormPocLicenseMonths');
      if (agreementPocToggle && !agreementPocToggle.dataset.bound) {
        agreementPocToggle.addEventListener('change', () => this.syncAgreementPocVisibility());
        agreementPocToggle.dataset.bound = 'true';
      }
      if (agreementPocStartDate && !agreementPocStartDate.dataset.bound) {
        agreementPocStartDate.addEventListener('change', () => this.syncAgreementPocServiceEndDate());
        agreementPocStartDate.dataset.bound = 'true';
      }
      if (agreementPocMonths && !agreementPocMonths.dataset.bound) {
        agreementPocMonths.addEventListener('input', () => this.syncAgreementPocServiceEndDate());
        agreementPocMonths.addEventListener('change', () => this.syncAgreementPocServiceEndDate());
        agreementPocMonths.dataset.bound = 'true';
      }
      ['agreementFormCustomerOfficialSignDate', 'agreementFormProviderOfficialSignatory1SignDate', 'agreementFormProviderOfficialSignatory2SignDate'].forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.dataset.signStatusBound === 'true') return;
        el.addEventListener('input', () => this.syncAgreementStatusFromSignatoryDates());
        el.addEventListener('change', () => this.syncAgreementStatusFromSignatoryDates());
        el.dataset.signStatusBound = 'true';
      });
      [agreementServiceStartDate, agreementLengthInput].forEach(el => {
        if (!el || el.dataset.serviceEndBound === 'true') return;
        el.addEventListener('input', () => this.syncAgreementServiceEndDate());
        el.addEventListener('change', () => this.syncAgreementServiceEndDate());
        el.dataset.serviceEndBound = 'true';
      });
      if (agreementDateInput) agreementDateInput.addEventListener('change', () => {
        // Do not copy agreement date into any signature date field.
        // Signature dates are manual-only and must remain blank unless explicitly entered.
        this.applyOfficialSignatoryDefaultsToForm(this.state.selectedAgreementCompanyForVerification);
      });
      if (agreementCompanySelect) agreementCompanySelect.addEventListener('change', event => {
        if (!String(event.target?.value || '').trim()) {
          this.state.selectedAgreementCompanyForVerification = null;
          this.updateAgreementCompanyVerificationUi(null);
        }
      });
      E.agreementForm.addEventListener('click', event => {
        const trigger = event.target?.closest?.('button[data-item-remove]');
        if (!trigger) return;
        const section = trigger.getAttribute('data-item-remove');
        const index = Number(trigger.getAttribute('data-item-index'));
        if (section && Number.isInteger(index) && index >= 0) this.removeRow(section, index);
      });
      const handleAgreementItemChange = event => {
        if (!event.target?.getAttribute('data-item-field')) return;
        if (this.isAgreementItemsLocked()) {
          event.preventDefault();
          event.stopPropagation();
          this.applyAgreementItemLocks();
          return;
        }
        this.recalculateAnnualServiceEndDateForEvent(event);
        this.renderItemRows(this.collectItems());
      };
      E.agreementForm.addEventListener('input', handleAgreementItemChange);
      E.agreementForm.addEventListener('change', handleAgreementItemChange);
    }
    if (E.agreementFormDeleteBtn) E.agreementFormDeleteBtn.addEventListener('click', () => this.deleteById(E.agreementForm?.dataset.id || ''));
    if (E.agreementFormPreviewBtn) E.agreementFormPreviewBtn.addEventListener('click', () => {
      const id = String(E.agreementForm?.dataset.id || '').trim();
      if (!id) return UI.toast('Save the agreement first to preview.');
      this.previewAgreementHtml(id);
    });
    if (E.agreementSignedDocumentUploadBtn) {
      E.agreementSignedDocumentUploadBtn.addEventListener('click', () => this.uploadSignedAgreementDocument());
    }
    if (E.agreementSignedDocumentOpenBtn) {
      E.agreementSignedDocumentOpenBtn.addEventListener('click', () => this.openSignedAgreementDocument());
    }

    if (E.agreementAddAnnualRowBtn) E.agreementAddAnnualRowBtn.addEventListener('click', () => this.addRow('annual_saas'));
    if (E.agreementAddOneTimeRowBtn) E.agreementAddOneTimeRowBtn.addEventListener('click', () => this.addRow('one_time_fee'));
    if (E.agreementPreviewExportPdfBtn) E.agreementPreviewExportPdfBtn.addEventListener('click', () => this.exportPreviewPdf());
    if (E.agreementPreviewCloseBtn) E.agreementPreviewCloseBtn.addEventListener('click', () => this.closePreviewModal());
    if (E.agreementPreviewModal) E.agreementPreviewModal.addEventListener('click', event => {
      if (event.target === E.agreementPreviewModal) this.closePreviewModal();
    });
    this.state.initialized = true;
  }
};

window.Agreements = Agreements;
