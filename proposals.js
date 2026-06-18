const Proposals = {
  canUseAdminOverride() {
    return Boolean(window.AdminOverride?.canOverride?.() || Permissions?.isAdminLike?.());
  },
  applyAdminOverrideBanner(message = '') {
    if (!this.canUseAdminOverride() || !E.proposalForm) return;
    window.AdminOverride?.applyBanner?.(E.proposalForm, {
      active: true,
      message: message || 'Admin Override Mode: this proposal can be edited even if it is accepted, expired, or normally locked.'
    });
  },
  logAdminOverride(action = 'proposal_override', oldValues = null, newValues = null) {
    if (!this.canUseAdminOverride()) return;
    const recordId = String(E.proposalForm?.dataset?.id || this.state.currentProposalId || newValues?.id || newValues?.proposal_id || '').trim();
    window.AdminOverride?.logOverride?.({
      resource: 'proposals',
      recordId,
      action,
      oldValues,
      newValues,
      reason: 'Admin override from Proposals module'
    });
  },
  signedDocumentBucket: 'proposal-signed-documents',
  providerContactDefaults: {
    name: 'InCheck 360 Holding BV',
    address: 'Pyrmontstraat 5, 7513 BN, Enschede, The Netherlands',
    mobile: '+31 97 010280855',
    email: 'Info@incheck360.nl'
  },
  defaultProposalTermsAndConditions: `1. SaaS Cost is an annual recurring cost, while Account Setup is a one-time fee.
2. Customer Support is continuous during the subscription term with an unlimited quantity of requests.
3. InCheck's Privacy Policy can be found at https://incheck360.com/privacy-policy
4. InCheck's Terms of Use can be found at https://incheck360.com/terms-of-use`,
  renderProposalTermsHtml(terms = '') {
    const rawTerms = String(terms ?? '').trim();
    if (!rawTerms) return '—';
    const linkify = text => U.escapeHtml(String(text ?? '')).replace(
      /https:\/\/incheck360\.com\/(?:privacy-policy|terms-of-use)/g,
      url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
    const lines = rawTerms.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const numberedItems = lines.map(line => line.match(/^\d+\.\s+(.+)$/));
    if (lines.length && numberedItems.every(Boolean)) {
      return `<ol class="proposal-terms-list">${numberedItems.map(match => `<li>${linkify(match[1])}</li>`).join('')}</ol>`;
    }
    return `<div class="proposal-terms-text">${linkify(rawTerms)}</div>`;
  },
  resetProposalTermsToDefault() {
    if (!E.proposalFormTerms || this.state.formReadOnly) return;
    E.proposalFormTerms.value = this.defaultProposalTermsAndConditions;
    E.proposalFormTerms.focus?.();
  },
  finalStatusOptions: ['draft', 'pending_approval', 'sent', 'accepted', 'rejected', 'expired'],
  proposalFields: [
    'proposal_id',
    'ref_number',
    'created_at',
    'deal_id',
    'lead_id',
    'proposal_title',
    'proposal_date',
    'valid_until',
    'proposal_valid_until',
    'customer_name',
    'customer_legal_name',
    'company_id',
    'company_name',
    'contact_id',
    'contact_name',
    'contact_email',
    'contact_phone',
    'contact_mobile',
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
    'is_poc',
    'poc_location_count',
    'poc_license_count',
    'poc_license_months',
    'poc_service_start_date',
    'poc_service_end_date',
    'poc_success_kpis',
    'poc_conversion_commitment',
    'currency',
    'saas_total',
    'one_time_total',
    'grand_total',
    'terms_conditions',
    'internal_notes',
    'customer_signatory_name',
    'customer_signatory_title',
    'customer_signature_name',
    'customer_signature_title',
    'customer_sign_date',
    'customer_signed_at',
    'provider_signatory_user_id',
    'provider_signatory_name',
    'provider_signatory_title',
    'provider_sign_date',
    'status',
    'approved_annual_saas_discount_percent',
    'approved_one_time_fee_discount_percent',
    'approved_discount_percent',
    'discount_approval_status',
    'discount_approved_at',
    'discount_approved_by',
    'last_discount_approval_request_id',
    'approval_required_reason',
    'signed_document_path',
    'signed_document_name',
    'signed_document_uploaded_at',
    'signed_document_uploaded_by',
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
    currentProposal: null,
    openingProposalIds: new Set(),
    rowActionInFlight: new Set(),
    selectedCompanyId: '',
    selectedContactId: '',
    loadedCompany: null,
    loadedContact: null,
    createLoadToken: 0
  },
  toNumberSafe(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  toNullableNumber(value) {
    if (value === null || value === undefined) return null;
    const raw = String(value).replace(/,/g, '').trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },
  getAnnualSaasMonths(item = {}) {
    const safe = item && typeof item === 'object' ? item : {};
    const value =
      safe.license_months ??
      safe.license_month ??
      safe.duration_months ??
      safe.months ??
      safe.quantity ??
      safe.qty ??
      12;

    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 12;
  },

  isPersistedProposalLineItem(item = {}) {
    return Boolean(
      String(item?.id || '').trim() ||
      String(item?.proposal_item_id || item?.proposalItemId || '').trim()
    );
  },
  hasSavedForcedAnnualDiscount(item = {}) {
    const section = String(item?.section || '').trim().toLowerCase();
    const discount = this.toNumberSafe(item?.discount_percent ?? item?.discountPercent);
    return section === 'annual_saas'
      && this.isPersistedProposalLineItem(item)
      && discount > 0;
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
    const section = String(safe.section || safe.item_section || safe.type || '').trim().toLowerCase();
    const quantity = section === 'annual_saas'
      ? this.getAnnualSaasMonths(safe)
      : Math.max(0, this.toNumberSafe(safe.quantity ?? safe.qty) || (safe.quantity === 0 ? 0 : 1));
    const serviceStartDate = this.normalizeDateInputValue(safe.service_start_date ?? safe.serviceStartDate);
    const serviceEndDate = section === 'annual_saas'
      ? this.calculateServiceEndDate(serviceStartDate, quantity)
      : this.normalizeDateInputValue(safe.service_end_date ?? safe.serviceEndDate);
    const discountPercent = this.getNormalizedItemDiscountPercent(safe);
    const computed = this.computeCommercialRow({
      section,
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
      qty: section === 'annual_saas' ? quantity : (safe.qty ?? quantity),
      months: section === 'annual_saas' ? quantity : safe.months,
      license_months: section === 'annual_saas' ? quantity : safe.license_months,
      duration_months: section === 'annual_saas' ? quantity : safe.duration_months,
      service_start_date: serviceStartDate,
      service_end_date: serviceEndDate,
      discounted_unit_price: this.toNumberSafe(
        safe.discounted_unit_price ?? safe.discountedUnitPrice ?? computed.discounted_unit_price
      ),
      line_total: this.toNumberSafe(safe.line_total ?? safe.lineTotal ?? computed.line_total),
      section,
      category: String(safe.category || '').trim(),
      type: String(safe.type || '').trim(),
      billing_frequency: String(safe.billing_frequency || safe.billingFrequency || '').trim(),
      is_recurring: this.normalizeTruthy(safe.is_recurring),
      is_saas: this.normalizeTruthy(safe.is_saas),
      one_time: this.normalizeTruthy(safe.one_time)
    };
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
  normalizePaymentTerm(value = '', fallback = '') {
    const raw = String(value || '').trim();
    const displayToValue = {
      monthly: 'Net 7',
      quarterly: 'Net 14',
      'semi-annually': 'Net 21',
      semiannually: 'Net 21',
      annually: 'Net 30',
      annual: 'Net 30'
    };

    if (['Net 7', 'Net 14', 'Net 21', 'Net 30'].includes(raw)) return raw;

    const mapped = displayToValue[raw.toLowerCase()];
    if (mapped) return mapped;

    return fallback || '';
  },
  getPaymentTermDisplay(value = '') {
    const normalized = this.normalizePaymentTerm(value, '');
    const map = {
      'Net 7': 'Monthly',
      'Net 14': 'Quarterly',
      'Net 21': 'Semi-Annually',
      'Net 30': 'Annually'
    };
    return map[normalized] || String(value || '').trim();
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
  addMonthsMinusOneDay(startValue, monthsValue) {
    return this.calculateServiceEndDate(startValue, monthsValue);
  },
  getDefaultAnnualServiceStartDate() {
    return this.normalizeDateInputValue(E.proposalFormProposalDate?.value || E.proposalFormServiceStartDate?.value) || this.getTodayDateInputValue();
  },
  syncEmptyAnnualServiceStartDates() {
    const defaultStartDate = this.getDefaultAnnualServiceStartDate();
    if (!E.proposalAnnualItemsTbody) return;
    E.proposalAnnualItemsTbody.querySelectorAll('tr[data-item-row="annual_saas"]').forEach(tr => {
      const startInput = tr.querySelector('[data-item-field="service_start_date"]');
      const endInput = tr.querySelector('[data-item-field="service_end_date"]');
      const monthsInput = tr.querySelector('[data-item-field="quantity"]');
      if (startInput && !startInput.value && defaultStartDate) startInput.value = defaultStartDate;
      if (endInput) {
        endInput.readOnly = true;
        endInput.classList.add('readonly-field', 'locked-field');
        endInput.setAttribute('aria-readonly', 'true');
        endInput.title = 'Auto-calculated from Service Start Date and License / Month.';
        endInput.value = this.calculateServiceEndDate(startInput?.value, monthsInput?.value);
      }
    });
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

      const section = sectionType === 'saas'
        ? 'annual_saas'
        : sectionType === 'one_time'
          ? 'one_time_fee'
          : String(safe.section || '').trim().toLowerCase();
      const quantity = section === 'annual_saas'
        ? this.getAnnualSaasMonths(safe)
        : Math.max(0, this.toNumberSafe(safe.quantity ?? safe.qty) || 1);
      const unitPrice = this.toNumberSafe(safe.unit_price ?? safe.unitPrice);
      const discountPercent = this.getNormalizedItemDiscountPercent(safe);
      const isAnnualUserBased = section === 'annual_saas' && this.isAnnualSaasUserItem(safe);
      const licenseQuantity = isAnnualUserBased
        ? Math.max(1, Math.round(this.toNumberSafe(safe.license_quantity ?? safe.licenseQuantity ?? safe.user_quantity ?? safe.userQuantity ?? safe.item_quantity ?? safe.itemQuantity) || 1))
        : 1;
      const discountRatio = Math.max(0, Math.min(100, discountPercent)) / 100;
      const base = section === 'annual_saas'
        ? unitPrice * licenseQuantity * (quantity / 12)
        : quantity * unitPrice;
      const computed = this.computeCommercialRow({
        ...safe,
        section,
        unit_price: unitPrice,
        discount_percent: discountPercent,
        quantity,
        license_quantity: licenseQuantity
      });
      const lineTotal = this.toNumberSafe(computed.line_total);
      const discountAmount = Math.max(0, base - lineTotal) || (base * discountRatio);

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
  getProposalCreatorDisplayName(creator = {}) {
    if (!creator || typeof creator !== 'object') return '';
    return String(
      creator.full_name ||
      creator.fullName ||
      creator.name ||
      creator.display_name ||
      creator.displayName ||
      creator.email ||
      ''
    ).trim();
  },
  getProposalCreatorTitle(creator = {}) {
    if (!creator || typeof creator !== 'object') return '';
    return String(
      creator.title ||
      creator.job_title ||
      creator.jobTitle ||
      creator.position ||
      creator.role_title ||
      creator.roleTitle ||
      creator.role_name ||
      creator.roleName ||
      creator.role_label ||
      creator.roleLabel ||
      creator.role_key ||
      creator.roleKey ||
      creator.role ||
      ''
    ).trim();
  },
  getProposalCreatorUserId(creator = {}) {
    if (!creator || typeof creator !== 'object') return '';
    return String(
      creator.auth_user_id ||
      creator.authUserId ||
      creator.user_id ||
      creator.userId ||
      creator.id ||
      creator.profile_id ||
      creator.profileId ||
      ''
    ).trim();
  },
  getProviderSignatoryCreator(proposal = {}) {
    const sessionProvider = this.getSignedInUserForProposal();
    const explicitCreator =
      proposal.__providerSignatoryCreator ||
      proposal.creator ||
      proposal.created_by_profile ||
      proposal.createdByProfile ||
      proposal.provider_signatory_user ||
      proposal.providerSignatoryUser ||
      null;
    if (explicitCreator) return explicitCreator;

    const rawSavedName = this.getProposalValue(proposal, 'provider_signatory_name', 'providerSignatoryName');
    const cleanSavedName = this.getCleanProviderSignatoryValue(rawSavedName, proposal);
    return cleanSavedName ? {} : sessionProvider;
  },
  isRawUuidValue(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || '').trim()
    );
  },
  getCleanProviderSignatoryValue(value, proposal = {}) {
    const text = String(value || '').trim();
    if (!text || this.isRawUuidValue(text)) return '';
    const providerNames = [
      this.providerContactDefaults.name,
      proposal.provider_legal_name,
      proposal.providerLegalName,
      proposal.provider_name,
      proposal.providerName,
      proposal.company_name,
      proposal.companyName
    ]
      .map(name => String(name || '').trim().toLowerCase())
      .filter(Boolean);
    return providerNames.includes(text.toLowerCase()) ? '' : text;
  },
  getProposalProviderSignatoryName(proposal = {}) {
    const savedName = this.getCleanProviderSignatoryValue(
      this.getProposalValue(proposal, 'provider_signatory_name', 'providerSignatoryName'),
      proposal
    );
    if (savedName) return savedName;
    const creator = this.getProviderSignatoryCreator(proposal);
    return this.getCleanProviderSignatoryValue(this.getProposalCreatorDisplayName(creator), proposal);
  },
  getProposalProviderSignatoryTitle(proposal = {}) {
    const savedName = this.getCleanProviderSignatoryValue(
      this.getProposalValue(proposal, 'provider_signatory_name', 'providerSignatoryName'),
      proposal
    );
    const savedTitle = String(this.getProposalValue(proposal, 'provider_signatory_title', 'providerSignatoryTitle') || '').trim();
    if (savedName && savedTitle) return savedTitle;
    const creator = this.getProviderSignatoryCreator(proposal);
    return this.getProposalCreatorTitle(creator) || savedTitle;
  },
  addProposalUserLookup(usersById, user = {}) {
    if (!usersById || !user || typeof user !== 'object') return;
    ['id', 'auth_user_id', 'authUserId', 'user_id', 'userId', 'profile_id', 'profileId'].forEach(key => {
      const value = String(user?.[key] || '').trim();
      if (value && !usersById.has(value)) usersById.set(value, user);
    });
  },
  async resolveProposalCreatorProfile(client, proposal = {}) {
    if (!client || !proposal || typeof proposal !== 'object') return null;
    const rawIds = [
      proposal.created_by,
      proposal.createdBy,
      proposal.user_id,
      proposal.userId,
      proposal.auth_user_id,
      proposal.authUserId,
      proposal.profile_id,
      proposal.profileId
    ];
    const generatedBy = String(proposal.generated_by || proposal.generatedBy || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generatedBy)) rawIds.push(generatedBy);
    const userIds = [...new Set(rawIds.map(value => String(value || '').trim()).filter(Boolean))];
    if (!userIds.length) return null;

    const usersById = new Map();
    const currentProvider = this.getSignedInUserForProposal();
    const currentUser = Session?.user?.() || {};
    const authUser = currentUser.user || {};
    const profile = currentUser.profile || {};
    this.addProposalUserLookup(usersById, {
      ...profile,
      id: profile.id || currentUser.user_id || authUser.id || '',
      auth_user_id: authUser.id || currentUser.user_id || profile.auth_user_id || '',
      user_id: currentUser.user_id || authUser.id || profile.id || '',
      full_name: profile.full_name || currentProvider.name || currentUser.name,
      name: profile.name || currentProvider.name || currentUser.name,
      display_name: profile.display_name || currentProvider.name || currentUser.name,
      email: profile.email || currentProvider.email || currentUser.email || authUser.email,
      role: profile.role || currentProvider.role
    });

    const queryProfiles = async field => {
      const unresolved = userIds.filter(id => !usersById.has(id));
      if (!unresolved.length) return;
      const { data, error } = await client.from('profiles').select('*').in(field, unresolved);
      if (error) {
        console.warn(`[proposals] unable to resolve proposal creator via profiles.${field}`, error);
        return;
      }
      (Array.isArray(data) ? data : []).forEach(user => this.addProposalUserLookup(usersById, user));
    };

    await queryProfiles('id');
    await queryProfiles('auth_user_id');
    await queryProfiles('user_id');
    return userIds.map(id => usersById.get(id)).find(Boolean) || null;
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
    if (!(Permissions.can('proposals','export') || Permissions.can('proposals','manage'))) {
      UI.toast('You do not have permission to export proposals.');
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
          this.normalizeProposalStatus(this.getProposalValue(proposal, 'status')),
          this.formatDateMMDDYYYY(this.getProposalValue(proposal, 'proposal_date', 'proposalDate')),
          this.formatDateMMDDYYYY(this.getProposalValue(proposal, 'valid_until', 'proposal_valid_until', 'validUntil', 'proposalValidUntil') || this.getAutoValidUntil(this.getProposalValue(proposal, 'proposal_date', 'proposalDate'))),
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

  isUuid(value = '') {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  normalizeCompany(company = {}) {
    const rawCompany = company?.raw_company && typeof company.raw_company === 'object' ? company.raw_company : {};
    const c = { ...rawCompany, ...(company && typeof company === 'object' ? company : {}) };
    const uuid = String(c.id || c.company_uuid || c.companyUuid || '').trim();
    const businessId = String(c.company_business_id || c.companyBusinessId || c.company_ref || c.companyRef || c.company_id || c.companyId || c.company_number || c.companyNumber || c.company_code || c.companyCode || '').trim();
    return {
      ...c,
      id: uuid,
      company_id: uuid || businessId,
      company_uuid: uuid,
      company_business_id: businessId,
      company_name: String(c.company_name || c.companyName || c.name || '').trim(),
      legal_name: String(c.legal_name || c.legalName || c.company_name || c.companyName || c.name || '').trim(),
      main_email: String(c.main_email || c.mainEmail || c.email || c.company_email || c.billing_email || '').trim(),
      main_phone: String(c.main_phone || c.mainPhone || c.phone || c.phone_number || c.mobile || '').trim(),
      country: String(c.country || '').trim(),
      city: String(c.city || '').trim(),
      address: String(c.address || c.company_address || c.customer_address || '').trim(),
      tax_number: String(c.tax_number || c.taxNumber || c.registration_number || c.company_registration_number || '').trim(),
      company_type: String(c.company_type || c.companyType || '').trim(),
      industry: String(c.industry || '').trim(),
      website: String(c.website || '').trim(),
      company_status: String(c.company_status || c.companyStatus || c.status || '').trim(),
      authorized_signatory_full_name: String(c.authorized_signatory_full_name || c.authorizedSignatoryFullName || c.authorized_signatory_name || c.authorizedSignatoryName || c.signatory_name || c.signatoryName || c.customer_signatory_name || c.customerSignatoryName || c.customer_authorized_signatory_name || c.customerAuthorizedSignatoryName || c.authorized_person_name || c.authorizedPersonName || '').trim(),
      authorized_signatory_name: String(c.authorized_signatory_name || c.authorizedSignatoryName || c.authorized_signatory_full_name || c.authorizedSignatoryFullName || c.signatory_name || c.signatoryName || c.customer_signatory_name || c.customerSignatoryName || c.customer_authorized_signatory_name || c.customerAuthorizedSignatoryName || c.authorized_person_name || c.authorizedPersonName || '').trim(),
      authorized_signatory_title: String(c.authorized_signatory_title || c.authorizedSignatoryTitle || c.signatory_title || c.signatoryTitle || c.customer_signatory_title || c.customerSignatoryTitle || c.customer_authorized_signatory_title || c.customerAuthorizedSignatoryTitle || c.authorized_person_title || c.authorizedPersonTitle || '').trim(),
      customer_signatory_name: String(c.customer_signatory_name || c.customerSignatoryName || '').trim(),
      customer_signatory_title: String(c.customer_signatory_title || c.customerSignatoryTitle || '').trim(),
      authorized_person_name: String(c.authorized_person_name || c.authorizedPersonName || '').trim(),
      authorized_person_title: String(c.authorized_person_title || c.authorizedPersonTitle || '').trim()
    };
  },
  normalizeContact(contact = {}) {
    const rawContact = contact?.raw_contact && typeof contact.raw_contact === 'object' ? contact.raw_contact : {};
    const c = { ...rawContact, ...(contact && typeof contact === 'object' ? contact : {}) };
    const uuid = [c.id, c.contact_uuid, c.contactUuid, c.contact_id, c.contactId].map(value => String(value || '').trim()).find(value => this.isUuid(value)) || '';
    const companyCandidate = String(c.company_id || c.companyId || '').trim();
    const companyUuid = String(c.company_uuid || c.companyUuid || c.selected_company_uuid || c.selectedCompanyUuid || (this.isUuid(companyCandidate) ? companyCandidate : '')).trim();
    return { ...c, id: uuid, contact_id: uuid || String(c.contact_id || c.contactId || c.contact_ref || c.contactRef || '').trim(), company_id: companyUuid || companyCandidate, company_uuid: companyUuid, first_name:String(c.first_name||c.firstName||'').trim(), last_name:String(c.last_name||c.lastName||'').trim(), full_name:String(c.contact_name||c.contactName||c.full_name||c.fullName||c.name||'').trim(), name:String(c.name||'').trim(), contact_name:String(c.contact_name||c.contactName||'').trim(), position:String(c.contact_position||c.contactPosition||c.position||'').trim(), job_title:String(c.contact_position||c.contactPosition||c.position||c.job_title||c.jobTitle||c.title||'').trim(), title:String(c.title||'').trim(), department:String(c.department||'').trim(), email:String(c.email||c.contact_email||'').trim(), phone:String(c.phone||c.phone_number||'').trim(), mobile:String(c.mobile||'').trim(), decision_role:String(c.decision_role||c.decisionRole||'').trim(), contact_status:String(c.contact_status||c.contactStatus||c.status||'').trim() };
  },

  getContactDisplayName(contact) {
    if (!contact) return '';
    const fullName = String(contact.full_name || contact.fullName || contact.name || '').trim();
    if (fullName) return fullName;
    return `${contact.first_name || contact.firstName || ''} ${contact.last_name || contact.lastName || ''}`.trim();
  },
  getContactTitle(contact) {
    return String(
      contact?.position ||
      contact?.job_title ||
      contact?.jobTitle ||
      contact?.title ||
      ''
    ).trim();
  },
  buildContactDisplayName(contact = {}) {
    const c = contact && typeof contact === 'object' ? contact : {};
    const stripEmailSuffix = value => String(value || '').trim().replace(/\s+[—-]\s+\S+@\S+$/u, '').trim();
    return stripEmailSuffix(this.getContactDisplayName(c))
      || stripEmailSuffix(c.contact_name || c.contactName)
      || String(c.email || '').trim();
  },
  normalizeProposalStatus(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (normalized === 'viewed') return 'sent';
    if (normalized === 'approved') return 'accepted';
    return normalized;
  },
  isProposalAccepted(proposal = {}) {
    const status = this.normalizeProposalStatus(proposal?.status);
    return status === 'accepted' || this.wasProposalAcceptedBeforeExpiry(proposal);
  },
  getProposalValidUntilValue(proposal = {}) {
    const source = proposal && typeof proposal === 'object' ? proposal : {};
    return this.normalizeDateInputValue(source.valid_until || source.proposal_valid_until || source.validUntil || source.proposalValidUntil || '');
  },
  getProposalAcceptanceDateValue(proposal = {}) {
    const source = proposal && typeof proposal === 'object' ? proposal : {};
    const customerSignDate = this.normalizeDateInputValue(source.customer_sign_date || source.customerSignDate || '');
    const providerSignDate = this.normalizeDateInputValue(source.provider_sign_date || source.providerSignDate || '');
    const acceptedAt = this.normalizeDateInputValue(source.accepted_at || source.acceptedAt || source.approved_at || source.approvedAt || '');

    // A proposal is accepted only when BOTH customer and provider sign dates are filled.
    // One sign date alone must never move the proposal to accepted or lock it as accepted.
    if (!customerSignDate || !providerSignDate) return '';

    const dates = [customerSignDate, providerSignDate, acceptedAt].filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : '';
  },
  areProposalSignDatesComplete(proposal = {}) {
    return Boolean(
      this.normalizeDateInputValue(proposal?.customer_sign_date || proposal?.customerSignDate || '') &&
      this.normalizeDateInputValue(proposal?.provider_sign_date || proposal?.providerSignDate || '')
    );
  },
  wasProposalAcceptedBeforeExpiry(proposal = {}) {
    const validUntil = this.getProposalValidUntilValue(proposal);
    const acceptanceDate = this.getProposalAcceptanceDateValue(proposal);
    if (!acceptanceDate) return false;
    if (validUntil) return acceptanceDate <= validUntil;
    return true;
  },
  isProposalExpired(proposal = {}) {
    const status = this.normalizeProposalStatus(proposal?.status);
    if (this.wasProposalAcceptedBeforeExpiry(proposal)) return false;
    if (status === 'rejected' || status === 'declined' || status === 'lost') return false;
    if (status === 'expired') return true;
    const validUntil = this.getProposalValidUntilValue(proposal);
    if (!validUntil) return false;
    return validUntil < this.todayDateString();
  },
  getEffectiveProposalStatus(proposal = {}) {
    if (this.wasProposalAcceptedBeforeExpiry(proposal)) return 'accepted';
    return this.isProposalExpired(proposal) ? 'expired' : this.normalizeProposalStatus(proposal?.status);
  },
  syncProposalStatusFromSignDates() {
    if (!E.proposalFormStatus) return;
    const customerSignDate = this.normalizeDateInputValue(E.proposalFormCustomerSignDate?.value || '');
    const providerSignDate = this.normalizeDateInputValue(E.proposalFormProviderSignDate?.value || '');
    const formSnapshot = {
      ...(this.state.currentProposal || {}),
      status: E.proposalFormStatus.value,
      valid_until: E.proposalFormValidUntil?.value || '',
      proposal_valid_until: E.proposalFormValidUntil?.value || ''
    };
    if (customerSignDate && providerSignDate) {
      const acceptedSnapshot = { ...formSnapshot, customer_sign_date: customerSignDate, provider_sign_date: providerSignDate, status: 'accepted' };
      if (this.wasProposalAcceptedBeforeExpiry(acceptedSnapshot)) {
        E.proposalFormStatus.value = 'accepted';
        this.refreshSignedDocumentUi(acceptedSnapshot);
        return;
      }
    } else if (this.normalizeProposalStatus(E.proposalFormStatus.value) === 'accepted') {
      E.proposalFormStatus.value = 'sent';
      this.refreshSignedDocumentUi({ ...formSnapshot, status: 'sent', customer_sign_date: customerSignDate, provider_sign_date: providerSignDate });
      return;
    }
    if (this.isProposalExpired(formSnapshot)) {
      E.proposalFormStatus.value = 'expired';
      this.refreshSignedDocumentUi({ ...formSnapshot, status: 'expired' });
      return;
    }
  },
  getProposalStatusLabel(value = '') {
    const labels = {
      draft: 'Draft',
      pending_approval: 'Pending Approval',
      sent: 'Sent',
      accepted: 'Accepted',
      rejected: 'Rejected',
      expired: 'Expired'
    };
    const normalized = this.normalizeProposalStatus(value);
    return labels[normalized] || String(value || '').trim() || '—';
  },
  getProposalLockMessageElement() {
    if (!E.proposalForm) return null;
    let message = E.proposalForm.querySelector('[data-proposal-accepted-lock-message]');
    if (message) return message;
    message = document.createElement('div');
    message.setAttribute('data-proposal-accepted-lock-message', 'true');
    message.className = 'proposal-lock-message';
    message.textContent = 'This proposal is locked because it is accepted or expired. Expired proposals cannot be edited or converted.';
    E.proposalForm.prepend(message);
    return message;
  },
  syncProposalAcceptedLockMessage(locked) {
    const message = this.getProposalLockMessageElement();
    if (!message) return;
    message.style.display = locked ? '' : 'none';
  },
  canShowConvertToAgreement(proposal = {}) {
    return this.isProposalAccepted(proposal) && !this.isProposalExpired(proposal) && Permissions.canCreateAgreementFromProposal();
  },
  PROPOSAL_DEFAULT_VALIDITY_DAYS: 14,
  PROPOSAL_MAX_VALIDITY_DAYS: 30,
  todayDateString() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  normalizeDateInput(value) {
    const source = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return null;
    const [year, month, day] = source.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  },
  formatDateInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  addDays(date, days) {
    const source = date instanceof Date ? new Date(date) : this.normalizeDateInput(date);
    if (!source) return null;
    source.setDate(source.getDate() + Number(days || 0));
    return source;
  },
  diffDays(startDate, endDate) {
    const start = this.normalizeDateInput(startDate);
    const end = this.normalizeDateInput(endDate);
    if (!start || !end) return Number.NaN;
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  },
  addDaysToDateString(value = '', days = 14) {
    return this.formatDateInput(this.addDays(value, days));
  },
  getProposalDateOrToday(value = '') {
    return String(value || '').trim() || this.todayDateString();
  },
  getAutoValidUntil(proposalDate = '') {
    const date = this.getProposalDateOrToday(proposalDate);
    return this.addDaysToDateString(date, this.PROPOSAL_DEFAULT_VALIDITY_DAYS);
  },
  getMaxValidUntil(proposalDate = '') {
    const date = this.getProposalDateOrToday(proposalDate);
    return this.addDaysToDateString(date, this.PROPOSAL_MAX_VALIDITY_DAYS);
  },
  resolveProposalValidUntil(proposalDate, currentValidUntil, options = {}) {
    const baseDate = this.normalizeDateInput(proposalDate) || this.normalizeDateInput(this.todayDateString()) || new Date();
    const defaultValidUntil = this.addDays(baseDate, this.PROPOSAL_DEFAULT_VALIDITY_DAYS);
    const maxValidUntil = this.addDays(baseDate, this.PROPOSAL_MAX_VALIDITY_DAYS);
    if (!currentValidUntil) return this.formatDateInput(defaultValidUntil);
    const selected = this.normalizeDateInput(currentValidUntil);
    if (!selected) return this.formatDateInput(defaultValidUntil);
    if (selected > maxValidUntil) return this.formatDateInput(maxValidUntil);
    if (selected < baseDate) return this.formatDateInput(defaultValidUntil);
    return this.formatDateInput(selected);
  },
  getValidatedProposalValidUntil(proposalDateValue = '', validUntilValue = '', { showToast = false } = {}) {
    const proposalDate = this.getProposalDateOrToday(proposalDateValue);
    const rawValidUntil = String(validUntilValue || '').trim();
    const validUntil = this.resolveProposalValidUntil(proposalDate, rawValidUntil);
    const days = this.diffDays(proposalDate, validUntil);
    const rawDays = this.diffDays(proposalDate, rawValidUntil);
    if (!rawValidUntil || Number.isNaN(days)) {
      if (showToast) UI.toast('Valid Until is required.');
      return '';
    }
    if (!Number.isNaN(rawDays) && rawDays < 0) {
      if (showToast) UI.toast('Proposal validity cannot be before the proposal date.');
      return '';
    }
    if (!Number.isNaN(rawDays) && rawDays > this.PROPOSAL_MAX_VALIDITY_DAYS) {
      if (showToast) UI.toast('Proposal validity cannot exceed 30 days from the proposal date.');
      return '';
    }
    if (days < 0 || days > this.PROPOSAL_MAX_VALIDITY_DAYS) {
      if (showToast) UI.toast('Proposal validity cannot exceed 30 days from the proposal date.');
      return '';
    }
    return validUntil;
  },
  syncProposalValidityLimits() {
    if (!E.proposalFormProposalDate || !E.proposalFormValidUntil) return;
    const proposalDate = this.getProposalDateOrToday(E.proposalFormProposalDate.value);
    E.proposalFormProposalDate.value = proposalDate;
    E.proposalFormValidUntil.min = proposalDate;
    E.proposalFormValidUntil.max = this.getMaxValidUntil(proposalDate);
  },
  syncValidUntilFromProposalDate({ forceDefault = false } = {}) {
    if (!E.proposalFormProposalDate || !E.proposalFormValidUntil) return;
    const proposalDate = this.getProposalDateOrToday(E.proposalFormProposalDate.value);
    const oldAuto = String(E.proposalFormValidUntil.dataset.autoValidUntil || '').trim();
    const current = String(E.proposalFormValidUntil.value || '').trim();
    const nextAuto = this.getAutoValidUntil(proposalDate);
    E.proposalFormProposalDate.value = proposalDate;
    this.syncProposalValidityLimits();
    const shouldRecalc = forceDefault || !current || (oldAuto && current === oldAuto);
    const resolved = shouldRecalc ? nextAuto : this.resolveProposalValidUntil(proposalDate, current);
    E.proposalFormValidUntil.value = resolved;
    E.proposalFormValidUntil.dataset.autoValidUntil = nextAuto;
    E.proposalFormValidUntil.title = 'Defaults to 14 days after proposal date; extendable up to 30 days.';
  },
  syncValidUntilManualEdit() {
    if (!E.proposalFormProposalDate || !E.proposalFormValidUntil) return;
    E.proposalFormValidUntil.value = this.resolveProposalValidUntil(E.proposalFormProposalDate.value, E.proposalFormValidUntil.value);
  },
  getContactPosition(contact = {}) {
    return this.getContactTitle(contact);
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

    const userId = String(
      rawAuthUser.id ||
      sessionUser.user_id ||
      sessionUser.userId ||
      sessionState.user_id ||
      sessionState.userId ||
      profile.auth_user_id ||
      profile.authUserId ||
      profile.user_id ||
      profile.userId ||
      profile.id ||
      ''
    ).trim();

    return {
      id: userId,
      user_id: userId,
      auth_user_id: userId,
      name,
      full_name: name,
      display_name: name,
      email,
      mobile,
      title: role,
      role
    };
  },
  applyProposalProviderSessionFields(target = {}) {
    const provider = this.getSignedInUserForProposal();
    const creator = this.getProviderSignatoryCreator(target);
    if (window?.AppState?.debugMode) console.debug('[Proposal Provider Session]', provider, creator);

    const creatorName = this.getProposalCreatorDisplayName(creator) || provider.name || provider.email?.split('@')?.[0] || '';
    const creatorTitle = this.getProposalCreatorTitle(creator) || provider.role || '';
    const creatorUserId = this.getProposalCreatorUserId(creator) || this.getProposalValue(target, 'provider_signatory_user_id', 'providerSignatoryUserId') || provider.id || '';
    const savedSignatoryName = this.getCleanProviderSignatoryValue(
      this.getProposalValue(target, 'provider_signatory_name', 'providerSignatoryName'),
      target
    );
    const savedSignatoryTitle = String(this.getProposalValue(target, 'provider_signatory_title', 'providerSignatoryTitle') || '').trim();
    const providerSignatoryName = savedSignatoryName || creatorName;
    const providerSignatoryTitle = savedSignatoryName && savedSignatoryTitle ? savedSignatoryTitle : creatorTitle || savedSignatoryTitle;

    const mapped = {
      ...target,

      provider_contact_name: this.providerContactDefaults.name,
      providerContactName: this.providerContactDefaults.name,
      provider_name: this.providerContactDefaults.name,
      provider_legal_name: this.providerContactDefaults.name,

      provider_contact_email: this.providerContactDefaults.email,
      providerContactEmail: this.providerContactDefaults.email,

      provider_contact_mobile: this.providerContactDefaults.mobile,
      providerContactMobile: this.providerContactDefaults.mobile,

      provider_signatory_user_id: creatorUserId,
      providerSignatoryUserId: creatorUserId,

      provider_signatory_name: providerSignatoryName,
      providerSignatoryName: providerSignatoryName,

      provider_signatory_title: providerSignatoryTitle,
      providerSignatoryTitle: providerSignatoryTitle
    };

    return mapped;
  },
  getCurrentProviderContact() {
    return {
      provider_contact_name: this.providerContactDefaults.name,
      provider_contact_mobile: this.providerContactDefaults.mobile,
      provider_contact_email: this.providerContactDefaults.email
    };
  },
  isSignedOrAcceptedDocument(record = {}) {
    const status = String(record.status || '').trim().toLowerCase().replace(/\s+/g, '_');
    return ['accepted', 'signed', 'active', 'issued', 'paid', 'partially_paid', 'expired'].includes(status);
  },
  resolveCompanyAuthorizedSignatory(company = {}) {
    return {
      name: String(
        company?.authorized_signatory_name ||
        company?.authorizedSignatoryName ||
        company?.authorized_signatory_full_name ||
        company?.authorizedSignatoryFullName ||
        company?.signatory_name ||
        company?.signatoryName ||
        company?.customer_signatory_name ||
        company?.customerSignatoryName ||
        company?.customer_authorized_signatory_name ||
        company?.customerAuthorizedSignatoryName ||
        company?.authorized_person_name ||
        company?.authorizedPersonName ||
        ''
      ).trim(),
      title: String(
        company?.authorized_signatory_title ||
        company?.authorizedSignatoryTitle ||
        company?.signatory_title ||
        company?.signatoryTitle ||
        company?.customer_signatory_title ||
        company?.customerSignatoryTitle ||
        company?.customer_authorized_signatory_title ||
        company?.customerAuthorizedSignatoryTitle ||
        company?.authorized_person_title ||
        company?.authorizedPersonTitle ||
        ''
      ).trim()
    };
  },
  resolveContactSignatory(contact = {}) {
    return {
      name: String(
        contact?.full_name ||
        contact?.fullName ||
        contact?.contact_name ||
        contact?.contactName ||
        contact?.name ||
        [contact?.first_name || contact?.firstName, contact?.last_name || contact?.lastName].filter(Boolean).join(' ') ||
        ''
      ).trim(),
      title: String(
        contact?.title ||
        contact?.job_title ||
        contact?.jobTitle ||
        contact?.position ||
        contact?.designation ||
        contact?.contact_title ||
        contact?.contactTitle ||
        contact?.role ||
        ''
      ).trim()
    };
  },
  resolveProposalCustomerSignatory(proposal = {}, contact = {}) {
    const contactSignatory = this.resolveContactSignatory(contact);
    return {
      name: String(
        proposal?.customer_signatory_name ||
        proposal?.customer_signatory_Name ||
        proposal?.customerSignatoryName ||
        proposal?.customer_authorized_signatory_name ||
        proposal?.customerAuthorizedSignatoryName ||
        proposal?.customer_signature_name ||
        proposal?.customerSignatureName ||
        proposal?.authorized_signatory_name ||
        proposal?.authorizedSignatoryName ||
        contactSignatory.name ||
        ''
      ).trim(),
      title: String(
        proposal?.customer_signatory_title ||
        proposal?.customerSignatoryTitle ||
        proposal?.customer_authorized_signatory_title ||
        proposal?.customerAuthorizedSignatoryTitle ||
        proposal?.customer_signature_title ||
        proposal?.customerSignatureTitle ||
        proposal?.authorized_signatory_title ||
        proposal?.authorizedSignatoryTitle ||
        contactSignatory.title ||
        ''
      ).trim()
    };
  },
  resolveCustomerSignatorySnapshot(record = {}, company = {}, contact = {}) {
    const locked = this.isSignedOrAcceptedDocument(record);
    const existingName = String(
      record.customer_signatory_name ||
      record.customer_signatory_Name ||
      record.customer_signature_name ||
      record.customer_authorized_signatory_name ||
      record.customer_official_signatory_name ||
      record.authorized_signatory_name ||
      ''
    ).trim();
    const existingTitle = String(
      record.customer_signatory_title ||
      record.customer_signature_title ||
      record.customer_authorized_signatory_title ||
      record.authorized_signatory_title ||
      ''
    ).trim();
    if (locked) return { name: existingName, title: existingTitle };
    const contactSigner = this.resolveContactSignatory(contact);
    return {
      name: existingName || contactSigner.name,
      title: existingTitle || contactSigner.title
    };
  },
  applyProposalContactSignatory(contact) {
    const signatoryNameInput = document.querySelector('[name="customer_signatory_name"], [data-proposal-customer-signatory-name], #proposalFormCustomerSignatoryName');
    const signatoryTitleInput = document.querySelector('[name="customer_signatory_title"], [data-proposal-customer-signatory-title], #proposalFormCustomerSignatoryTitle');
    if (!signatoryNameInput || !signatoryTitleInput) return;
    const signatory = this.resolveContactSignatory(contact);
    if (signatory.name && !signatoryNameInput.value) signatoryNameInput.value = signatory.name;
    if (signatory.title && !signatoryTitleInput.value) signatoryTitleInput.value = signatory.title;
  },
  hydrateMappedProposalFields(proposal = {}, selectedCompany = {}, selectedContact = {}) {
    const customerAddress = String(selectedCompany?.address || '').trim();
    const contactPersonName = this.buildContactDisplayName(selectedContact);
    const signatorySnapshot = this.resolveCustomerSignatorySnapshot(proposal, selectedCompany, selectedContact);
    return this.applyProposalProviderSessionFields({
      ...proposal,
      customer_address: customerAddress,
      customerAddress: customerAddress,
      customer_signatory_name: signatorySnapshot.name || '',
      customer_signatory_Name: signatorySnapshot.name || '',
      customerSignatoryName: signatorySnapshot.name || '',
      customer_signatory_title: signatorySnapshot.title || '',
      customerSignatoryTitle: signatorySnapshot.title || '',
      customer_authorized_signatory_name: signatorySnapshot.name || '',
      customer_authorized_signatory_title: signatorySnapshot.title || ''
    });
  },
  async loadCompanyByUuid(companyUuid) {
    const id = String(companyUuid || '').trim();
    if (!this.isUuid(id)) return null;
    const row = await window.CrmCompanyContactSelectors?.loadCompanySafe?.(id);
    return row ? this.normalizeCompany(row) : null;
  },
  async resolveCompanyUuid(companyKey) {
    return window.CrmCompanyContactSelectors?.resolveCompanyUuid?.(companyKey) || null;
  },
  async loadCompanySafe(companyKey) {
    const row = await window.CrmCompanyContactSelectors?.loadCompanySafe?.(companyKey);
    return row ? this.normalizeCompany(row) : null;
  },
  async resolveContactUuid(contactKey) {
    return window.CrmCompanyContactSelectors?.resolveContactUuid?.(contactKey) || null;
  },
  async contactBelongsToCompany(contactKey, companyKey) {
    return await window.CrmCompanyContactSelectors?.contactBelongsToCompany?.(contactKey, companyKey) === true;
  },
  getContactOptionsForCompany(companyKey) {
    return window.CrmCompanyContactSelectors?.getContactOptionsForCompany?.(companyKey) || [];
  },
  getContactOptionForCompany(contactKey, companyKey) {
    return window.CrmCompanyContactSelectors?.getContactOptionForCompany?.(contactKey, companyKey) || null;
  },
  async clearSelectedContactForCompany(companyId) {
    this.state.selectedContactId = '';
    this.state.loadedContact = null;
    if (E.proposalForm) E.proposalForm.dataset.contactId = '';
    if (E.proposalFormContactId) E.proposalFormContactId.value = '';
    await window.CrmCompanyContactSelectors?.clearSelectedContactForCompany?.(companyId, 'proposal');
  },
  async loadContactByUuid(contactKey) {
    const row = await window.CrmCompanyContactSelectors?.loadContactSafe?.(contactKey);
    return row ? this.normalizeContact(row) : null;
  },
  getProposalContactId(proposal = {}) {
    return String(
      proposal?.contact_id ||
      proposal?.customer_contact_id ||
      proposal?.client_contact_id ||
      proposal?.primary_contact_id ||
      proposal?.selected_contact_id ||
      ''
    ).trim();
  },
  async loadProposalContactForPreview(client, proposal = {}) {
    const contactId = this.getProposalContactId(proposal);
    if (!client || !contactId) return null;
    const { data, error } = await client
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .maybeSingle();

    if (error) {
      console.warn('[Proposal Preview] Contact could not be loaded from proposal contact id; using saved proposal snapshot.', { contactId, error });
      return null;
    }

    return data ? this.normalizeContact(data) : null;
  },
  async getFullCompanyRecord(companyIdOrRecord) {
    const id = typeof companyIdOrRecord === 'object' ? (companyIdOrRecord.id || companyIdOrRecord.company_uuid || companyIdOrRecord.companyUuid) : companyIdOrRecord;
    return this.loadCompanyByUuid(id);
  },
  async getFullContactRecord(contactIdOrRecord) {
    const id = typeof contactIdOrRecord === 'object' ? (contactIdOrRecord.id || contactIdOrRecord.contact_uuid || contactIdOrRecord.contactUuid) : contactIdOrRecord;
    return this.loadContactByUuid(id);
  },
  applyLoadedCustomerToForm(company, contact = null) {
    if (!E.proposalForm || !company || company.id !== this.state.selectedCompanyId) return false;
    const companyName = String(company.company_name || company.legal_name || '').trim();
    const legalName = String(company.legal_name || company.company_name || '').trim();
    E.proposalForm.dataset.companyId = company.id;
    E.proposalForm.dataset.companyName = companyName;
    E.proposalForm.dataset.companyLegalName = legalName;
    E.proposalForm.dataset.companyAddress = String(company.address || '').trim();
    if (E.proposalFormCompanyId) E.proposalFormCompanyId.value = company.id;
    if (E.proposalFormCustomerName) E.proposalFormCustomerName.value = legalName;
    if (E.proposalFormCustomerAddress) E.proposalFormCustomerAddress.value = String(company.address || '').trim();
    if (contact) {
      E.proposalForm.dataset.contactId = contact.id;
      E.proposalForm.dataset.contactName = this.buildContactDisplayName(contact);
      E.proposalForm.dataset.contactJobTitle = this.getContactTitle(contact);
      E.proposalForm.dataset.contactEmail = String(contact.email || '').trim();
      E.proposalForm.dataset.contactPhone = String(contact.phone || '').trim();
      E.proposalForm.dataset.contactMobile = String(contact.mobile || '').trim();
      if (E.proposalFormContactId) E.proposalFormContactId.value = contact.id;
      if (E.proposalFormCustomerContactName) E.proposalFormCustomerContactName.value = this.buildContactDisplayName(contact);
      if (E.proposalFormCustomerContactMobile) E.proposalFormCustomerContactMobile.value = String(contact.mobile || contact.phone || '').trim();
      if (E.proposalFormCustomerContactEmail) E.proposalFormCustomerContactEmail.value = String(contact.email || '').trim();
      this.applyProposalContactSignatory(contact, { contactChanged: true });
    } else {
      E.proposalForm.dataset.contactId = '';
      if (E.proposalFormCustomerContactName) E.proposalFormCustomerContactName.value = '';
      if (E.proposalFormCustomerContactMobile) E.proposalFormCustomerContactMobile.value = '';
      if (E.proposalFormCustomerContactEmail) E.proposalFormCustomerContactEmail.value = '';
      if (E.proposalFormCustomerSignatoryName && !E.proposalFormCustomerSignatoryName.value) E.proposalFormCustomerSignatoryName.value = '';
      if (E.proposalFormCustomerSignatoryTitle && !E.proposalFormCustomerSignatoryTitle.value) E.proposalFormCustomerSignatoryTitle.value = '';
    }
    return true;
  },
  async hydrateCreateCustomerByUuid(companyId, contactId = '', source = 'direct') {
    const token = ++this.state.createLoadToken;
    this.state.selectedCompanyId = String(companyId || '').trim();
    this.state.selectedContactId = String(contactId || '').trim();
    if (!this.state.selectedCompanyId) {
      this.state.loadedCompany = null;
      this.state.loadedContact = null;
      if (E.proposalForm) {
        E.proposalForm.dataset.companyId = '';
        E.proposalForm.dataset.contactId = '';
      }
      return true;
    }
    console.log('[Proposal Create] source:', source);
    console.log('[Proposal Create] selectedCompanyId:', this.state.selectedCompanyId);
    const loadedCompany = await this.loadCompanyByUuid(this.state.selectedCompanyId);
    console.log('[Proposal Create] loadedCompany:', loadedCompany);
    if (token !== this.state.createLoadToken) return false;
    if (!loadedCompany || loadedCompany.id !== this.state.selectedCompanyId) throw new Error('Selected company data mismatch. Please reselect the company.');
    let loadedContact = null;
    if (this.state.selectedContactId) {
      const resolvedContactId = await this.resolveContactUuid(this.state.selectedContactId);
      if (!resolvedContactId) throw new Error('Selected contact could not be resolved. Please reselect the contact.');
      const selectedContactFromOptions = this.getContactOptionForCompany(resolvedContactId, loadedCompany.id);
      loadedContact = selectedContactFromOptions || await this.loadContactByUuid(resolvedContactId);
      if (!loadedContact || String(loadedContact.id || loadedContact.contact_uuid || '').trim() !== resolvedContactId) throw new Error('Selected contact could not be resolved. Please reselect the contact.');
      console.log('[Save] selectedContactFromOptions:', selectedContactFromOptions);
      if (!selectedContactFromOptions) {
        const belongs = await this.contactBelongsToCompany(resolvedContactId, loadedCompany.id);
        console.log('[Save] contact belongs:', belongs);
        if (!belongs) {
          await this.clearSelectedContactForCompany(loadedCompany.id);
          throw new Error('Selected contact does not belong to the selected company. Please reselect the contact.');
        }
      }
      this.state.selectedContactId = resolvedContactId;
    }
    console.log('[Proposal Create] selectedContactId:', this.state.selectedContactId);
    console.log('[Proposal Create] loadedContact:', loadedContact);
    this.state.loadedCompany = loadedCompany;
    this.state.loadedContact = loadedContact;
    return this.applyLoadedCustomerToForm(loadedCompany, loadedContact);
  },
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
    normalized.customer_name = String(
      normalized.customer_name ||
      source.customerName ||
      source.customer_legal_name ||
      source.customerLegalName ||
      source.company_name ||
      source.companyName ||
      ''
    ).trim();
    normalized.customer_legal_name = String(
      source.customer_legal_name ||
      source.customerLegalName ||
      normalized.customer_name ||
      source.company_name ||
      source.companyName ||
      ''
    ).trim();
    normalized.company_id = String(source.company_id || source.companyId || '').trim();
    normalized.company_name = String(source.company_name || source.companyName || normalized.customer_legal_name || normalized.customer_name || '').trim();
    normalized.contact_id = String(source.contact_id || source.contactId || '').trim();
    normalized.contact_name = this.buildContactDisplayName(source) || String(source.contact_name || source.contactName || normalized.customer_contact_name || '').trim();
    normalized.customer_contact_name = this.buildContactDisplayName({ ...source, contact_name: normalized.customer_contact_name || normalized.contact_name }) || normalized.customer_contact_name;
    normalized.contact_email = String(source.contact_email || source.contactEmail || normalized.customer_contact_email || '').trim();
    normalized.contact_phone = String(source.contact_phone || source.contactPhone || normalized.customer_contact_mobile || '').trim();
    normalized.contact_mobile = String(source.contact_mobile || source.contactMobile || normalized.customer_contact_mobile || '').trim();
    normalized.customer_signatory_name = String(source.customer_signatory_name || source.customer_signatory_Name || source.customer_signature_name || source.customerSignatoryName || normalized.customer_signatory_name || '').trim();
    normalized.customer_signatory_title = String(source.customer_signatory_title || source.customer_signature_title || source.customerSignatoryTitle || normalized.customer_signatory_title || '').trim();
    normalized.customer_sign_date = String(source.customer_sign_date || source.customer_signed_at || source.customerSignDate || normalized.customer_sign_date || '').trim();
    normalized.internal_notes = String(source.internal_notes ?? source.proposal_notes ?? source.internal_note ?? source.notes ?? normalized.internal_notes ?? '').trim();
    normalized.status = this.normalizeProposalStatus(normalized.status);
    normalized.provider_contact_name = this.providerContactDefaults.name;
    normalized.provider_contact_mobile = this.providerContactDefaults.mobile;
    normalized.provider_contact_email = this.providerContactDefaults.email;
    normalized.provider_name = this.providerContactDefaults.name;
    normalized.provider_legal_name = this.providerContactDefaults.name;
    normalized.provider_signatory_user_id = String(source.provider_signatory_user_id || source.providerSignatoryUserId || normalized.provider_signatory_user_id || '').trim();
    normalized.provider_signatory_name = this.getProposalProviderSignatoryName({ ...source, ...normalized }) || '';
    normalized.provider_signatory_title = this.getProposalProviderSignatoryTitle({ ...source, ...normalized }) || '';
    normalized.currency = String(normalized.currency || source.currency || '').trim();
    normalized.is_poc = this.normalizeTruthy(source.is_poc ?? source.isPoc ?? normalized.is_poc);
    normalized.poc_location_count = this.toNullableNumber(source.poc_location_count ?? source.pocLocationCount ?? normalized.poc_location_count);
    normalized.poc_license_count = this.toNullableNumber(source.poc_license_count ?? source.pocLicenseCount ?? normalized.poc_license_count);
    normalized.poc_license_months = this.toNullableNumber(source.poc_license_months ?? source.pocLicenseMonths ?? normalized.poc_license_months);
    normalized.poc_service_start_date = this.normalizeDateInputValue(source.poc_service_start_date ?? source.pocServiceStartDate ?? normalized.poc_service_start_date);
    normalized.poc_service_end_date = this.normalizeDateInputValue(source.poc_service_end_date ?? source.pocServiceEndDate ?? normalized.poc_service_end_date);
    normalized.poc_success_kpis = String(source.poc_success_kpis ?? source.pocSuccessKpis ?? normalized.poc_success_kpis ?? '').trim();
    normalized.poc_conversion_commitment = String(source.poc_conversion_commitment ?? source.pocConversionCommitment ?? normalized.poc_conversion_commitment ?? '').trim();
    normalized.deal_id = String(normalized.deal_id || '').trim();
    normalized.deal_code = String(source.deal_code || source.dealCode || '').trim();
    if (!normalized.deal_code && normalized.deal_id) {
      const localRows = Array.isArray(window.Deals?.state?.rows) ? window.Deals.state.rows : [];
      const linkedDeal = localRows.find(row => String(row?.id || '').trim() === normalized.deal_id);
      normalized.deal_code = String(linkedDeal?.deal_id || '').trim();
    }
    normalized.proposal_date = this.getProposalDateOrToday(normalized.proposal_date || source.proposalDate || source.proposal_date);
    normalized.proposal_valid_until = this.resolveProposalValidUntil(normalized.proposal_date, normalized.proposal_valid_until || source.proposal_valid_until || source.valid_until);
    normalized.valid_until = normalized.proposal_valid_until;
    if (this.isProposalExpired(normalized)) normalized.status = 'expired';
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
    normalized.approved_annual_saas_discount_percent =
      source.approved_annual_saas_discount_percent ??
      source.approvedAnnualSaasDiscountPercent ??
      normalized.approved_annual_saas_discount_percent ??
      '';
    normalized.approved_one_time_fee_discount_percent =
      source.approved_one_time_fee_discount_percent ??
      source.approvedOneTimeFeeDiscountPercent ??
      normalized.approved_one_time_fee_discount_percent ??
      '';
    normalized.approved_discount_percent =
      source.approved_discount_percent ??
      source.approvedDiscountPercent ??
      normalized.approved_discount_percent ??
      '';
    normalized.discount_approval_status = String(
      source.discount_approval_status ||
      source.discountApprovalStatus ||
      normalized.discount_approval_status ||
      ''
    ).trim();
    normalized.discount_approved_at = String(
      source.discount_approved_at ||
      source.discountApprovedAt ||
      normalized.discount_approved_at ||
      ''
    ).trim();
    normalized.discount_approved_by = String(
      source.discount_approved_by ||
      source.discountApprovedBy ||
      normalized.discount_approved_by ||
      ''
    ).trim();
    normalized.last_discount_approval_request_id = String(
      source.last_discount_approval_request_id ||
      source.lastDiscountApprovalRequestId ||
      normalized.last_discount_approval_request_id ||
      ''
    ).trim();
    normalized.approval_required_reason = String(
      source.approval_required_reason ||
      source.approvalRequiredReason ||
      normalized.approval_required_reason ||
      ''
    ).trim();
    normalized.signed_document_path = String(source.signed_document_path || source.signedDocumentPath || normalized.signed_document_path || '').trim();
    normalized.signed_document_name = String(source.signed_document_name || source.signedDocumentName || normalized.signed_document_name || '').trim();
    normalized.signed_document_uploaded_at = String(source.signed_document_uploaded_at || source.signedDocumentUploadedAt || normalized.signed_document_uploaded_at || '').trim();
    normalized.signed_document_uploaded_by = String(source.signed_document_uploaded_by || source.signedDocumentUploadedBy || normalized.signed_document_uploaded_by || '').trim();
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
      stage: String(deal.stage || '').trim() || 'Qualified'
    });
  },
  async proposalDraftFromDeal(rawDeal = {}) {
    const deal = rawDeal && typeof rawDeal === 'object' ? rawDeal : {};
    const companyName = String(deal.company_name || deal.companyName || '').trim();
    const fullName = String(deal.full_name || deal.fullName || '').trim();
    const serviceInterest = String(deal.service_interest || deal.serviceInterest || '').trim();
    const titleParts = [companyName || fullName, serviceInterest].filter(Boolean);
    const selectedCompany = await this.getFullCompanyRecord(deal.company_id || deal.companyId || {});
    const legalName = U.getCustomerLegalName(selectedCompany || {}, deal);
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
      company_id: String(selectedCompany?.id || deal.company_id || deal.companyId || '').trim(),
      company_name: String(selectedCompany?.company_name || deal.company_name || deal.companyName || '').trim(),
      contact_id: String(selectedContact?.id || deal.contact_id || deal.contactId || '').trim(),
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
    const rawDiscountedUnitPrice = pick(source.discounted_unit_price, source.discountedUnitPrice);
    const rawLineTotal = pick(source.line_total, source.lineTotal);
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
      location_address: String(pick(source.location_address, source.locationAddress)).trim(),
      item_name: String(pick(source.item_name, source.itemName, source.name)).trim(),
      description: String(pick(source.description, source.item_description, source.itemDescription, source.note, source.notes, source.catalog_note, source.catalogNote, source.catalog_description, source.catalogDescription)).trim(),
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
      discounted_unit_price: rawDiscountedUnitPrice === '' ? '' : this.toNumberSafe(rawDiscountedUnitPrice),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty, source.count)),
      qty: this.toNumberSafe(pick(source.qty, source.quantity, source.count)),
      months: this.toNumberSafe(pick(source.months, source.license_months, source.license_month, source.duration_months, source.quantity, source.qty)),
      license_months: this.toNumberSafe(pick(source.license_months, source.license_month, source.duration_months, source.months, source.quantity, source.qty)),
      duration_months: this.toNumberSafe(pick(source.duration_months, source.license_months, source.license_month, source.months, source.quantity, source.qty)),
      license_quantity: this.toNumberSafe(pick(source.license_quantity, source.licenseQuantity, source.user_quantity, source.userQuantity, source.item_quantity, source.itemQuantity)),
      service_start_date: this.normalizeDateInputValue(pick(source.service_start_date, source.serviceStartDate)),
      service_end_date: this.normalizeDateInputValue(pick(source.service_end_date, source.serviceEndDate)),
      line_total: rawLineTotal === '' ? '' : this.toNumberSafe(rawLineTotal),
      capability_name: String(pick(source.capability_name, source.capabilityName)).trim(),
      capability_value: String(pick(source.capability_value, source.capabilityValue)).trim(),
      notes: String(pick(source.notes)).trim(),
      updated_at: pick(source.updated_at, source.updatedAt)
    };
    normalized.discountPercent = normalized.discount_percent;

    if (section === 'annual_saas') {
      const months = this.getAnnualSaasMonths({ ...source, ...normalized });
      normalized.quantity = months;
      normalized.qty = months;
      normalized.months = months;
      normalized.license_months = months;
      normalized.duration_months = months;
      normalized.license_quantity = Math.max(1, normalized.license_quantity || 1);
      if (!normalized.service_start_date) normalized.service_start_date = this.getDefaultAnnualServiceStartDate();
      normalized.service_end_date = this.addMonthsMinusOneDay(normalized.service_start_date, months);
    } else if (section === 'one_time_fee') {
      const inCheckBasicCount = this.getInCheckBasicAnnualRowCountFromDom?.() || 0;
      normalized.quantity = inCheckBasicCount > 0
        ? Math.max(1, inCheckBasicCount)
        : Math.max(1, normalized.quantity || 1);
    }

    if (section === 'annual_saas' || section === 'one_time_fee') {
      const computed = this.computeCommercialRow(normalized);
      if (normalized.discounted_unit_price === '') normalized.discounted_unit_price = computed.discounted_unit_price;
      if (normalized.line_total === '') normalized.line_total = computed.line_total;
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
    this.refreshCompanyLifecycleStatus(preparedProposal, 'Proposal');
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
    this.refreshCompanyLifecycleStatus(preparedProposal, 'Proposal');
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
    this.refreshCompanyLifecycleStatus(preparedForSave, 'Proposal');
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

  refreshCompanyLifecycleStatus(row = {}, stage = 'Proposal') {
    const companyId = String(row?.company_id || row?.companyId || '').trim();
    if (!companyId) return;
    window.Companies?.refreshCompanyLifecycleStatusByBusinessId?.(companyId, { stage }).catch(error => {
      console.error('[proposals] company lifecycle refresh failed', error);
      UI?.toast?.('Proposal saved, but company lifecycle status could not be refreshed');
    });
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
      'customer_signed_at',
      'provider_sign_date',
      'poc_service_start_date',
      'poc_service_end_date'
    ].forEach(field => {
      if (Object.prototype.hasOwnProperty.call(sanitized, field)) {
        sanitized[field] = this.normalizeDateForSave(sanitized[field]);
      }
    });
    sanitized.internal_notes = String(sanitized.internal_notes ?? sanitized.proposal_notes ?? sanitized.internal_note ?? sanitized.notes ?? '').trim() || null;
    delete sanitized.proposal_notes;
    delete sanitized.internal_note;
    delete sanitized.notes;
    sanitized.is_poc = this.normalizeTruthy(sanitized.is_poc);
    if (!sanitized.is_poc) {
      sanitized.poc_location_count = null;
      sanitized.poc_license_count = null;
      sanitized.poc_license_months = null;
      sanitized.poc_service_start_date = null;
      sanitized.poc_service_end_date = null;
      sanitized.poc_success_kpis = null;
      sanitized.poc_conversion_commitment = null;
    }
    return sanitized;
  },
  buildProposalForPersist(proposal = {}, items = [], { ensureBusinessProposalId = false } = {}) {
    const base = { ...(proposal && typeof proposal === 'object' ? proposal : {}) };
    const totals = this.calculateTotalsFromItems(items);
    const hasProposalDate = Object.prototype.hasOwnProperty.call(base, 'proposal_date') || Object.prototype.hasOwnProperty.call(base, 'proposalDate');
    const hasValidUntil = Object.prototype.hasOwnProperty.call(base, 'proposal_valid_until') || Object.prototype.hasOwnProperty.call(base, 'valid_until');
    const proposalDate = hasProposalDate || ensureBusinessProposalId ? this.getProposalDateOrToday(base.proposal_date || base.proposalDate) : '';
    const proposalValidUntil = proposalDate ? this.resolveProposalValidUntil(proposalDate, base.proposal_valid_until || base.valid_until) : '';
    const hasStatus = Object.prototype.hasOwnProperty.call(base, 'status');
    const generatedByFallback = String(
      base.generated_by || Session?.state?.name || Session?.state?.email || Session?.state?.username || ''
    ).trim();
    const businessIdentifiers = this.buildBusinessProposalIdentifiers(base, {
      ensureProposalId: ensureBusinessProposalId,
      ensureRefNumber: ensureBusinessProposalId
    });
    const prepared = {
      ...base,
      ...businessIdentifiers,
      provider_contact_name: this.providerContactDefaults.name,
      provider_contact_mobile: this.providerContactDefaults.mobile,
      provider_contact_email: this.providerContactDefaults.email,
      provider_name: this.providerContactDefaults.name,
      provider_legal_name: this.providerContactDefaults.name,
      provider_signatory_user_id: base.provider_signatory_user_id || base.providerSignatoryUserId || this.getSignedInUserForProposal().id || '',
      provider_signatory_name: this.getProposalProviderSignatoryName(base),
      provider_signatory_title: this.getProposalProviderSignatoryTitle(base),
      generated_by: generatedByFallback,
      ...totals
    };
    if (proposalDate) {
      prepared.proposal_date = proposalDate;
      prepared.proposal_valid_until = proposalValidUntil;
      prepared.valid_until = proposalValidUntil;
    } else if (!hasValidUntil) {
      delete prepared.proposal_valid_until;
      delete prepared.valid_until;
    }
    if (hasStatus || ensureBusinessProposalId) prepared.status = this.normalizeProposalStatus(base.status) || 'draft';
    const signDatesComplete = this.areProposalSignDatesComplete(prepared);
    if (!signDatesComplete && this.normalizeProposalStatus(prepared.status) === 'accepted') {
      prepared.status = 'sent';
    }
    if (signDatesComplete) {
      const acceptedSnapshot = { ...prepared, status: 'accepted' };
      prepared.status = this.wasProposalAcceptedBeforeExpiry(acceptedSnapshot) ? 'accepted' : prepared.status;
    }
    if (this.isProposalExpired(prepared)) prepared.status = 'expired';
    return prepared;
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
    const normalizedProposal = this.normalizeProposal(proposal);
    const proposalWithTotals = this.withCalculatedTotalsFallback({ ...proposal, ...normalizedProposal }, normalizedItems);
    const [creatorProfile, previewContact] = await Promise.all([
      this.resolveProposalCreatorProfile(client, proposalWithTotals),
      this.loadProposalContactForPreview(client, proposalWithTotals)
    ]);
    return {
      proposal: {
        ...proposalWithTotals,
        ...(creatorProfile ? { __providerSignatoryCreator: creatorProfile } : {}),
        ...(previewContact ? { contact: previewContact } : {})
      },
      items: normalizedItems
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
    const itemName = String(item?.item_name || item?.name || item?.product_name || item?.capability_name || fallbackName || '').trim();
    const itemDescription = this.getItemDescription(item);
    const shouldShowDescription = itemDescription && itemDescription !== itemName;
    return `<div class="doc-item-name">${U.escapeHtml(itemName || '—')}</div>${shouldShowDescription ? `<div class="doc-item-description">${U.escapeHtml(itemDescription)}</div>` : ''}`;
  },

  resolveProposalCustomerDetails(proposal = {}, company = null, contact = null) {
    const saved = proposal && typeof proposal === 'object' ? proposal : {};
    const companyData = company && typeof company === 'object' ? company : {};
    const contactData = contact && typeof contact === 'object' ? contact : {};
    const firstText = (...values) => {
      for (const value of values) {
        const text = String(value ?? '').trim();
        if (text) return text;
      }
      return '—';
    };
    const contactName = this.buildContactDisplayName(contactData) || String(contactData.name || contactData.full_name || contactData.contact_name || '').trim();
    return {
      companyName: firstText(
        saved.customer_company_name,
        saved.company_name,
        saved.client_name,
        saved.customer_legal_name,
        saved.customer_name,
        companyData.legal_name,
        companyData.name,
        companyData.company_name
      ),
      contactName: firstText(
        saved.customer_contact_name,
        saved.contact_name,
        contactName,
        contactData.name,
        contactData.full_name
      ),
      email: firstText(saved.customer_email, saved.contact_email, saved.customer_contact_email, contactData.email),
      phone: firstText(saved.customer_phone, saved.contact_phone, saved.customer_contact_mobile, contactData.phone, contactData.mobile),
      address: firstText(saved.customer_address, saved.company_address, companyData.address, companyData.street_address),
      signatoryName: this.resolveProposalCustomerSignatory(saved, contactData).name || firstText(contactName, contactData.name),
      signatoryTitle: this.resolveProposalCustomerSignatory(saved, contactData).title
    };
  },
  buildSafePreviewProposal(proposal = {}, company = null, contact = null) {
    const previewContact = contact || proposal?.contact || null;
    const details = this.resolveProposalCustomerDetails(proposal, company, previewContact);
    const companyId = String(company?.id || proposal?.company_id || '').trim();
    const contactId = String(previewContact?.id || this.getProposalContactId(proposal)).trim();
    const signatory = this.resolveProposalCustomerSignatory(proposal, previewContact);
    return {
      ...proposal,
      company_id: companyId,
      company_name: details.companyName,
      customer_company_name: details.companyName,
      customer_name: details.companyName,
      customer_legal_name: details.companyName,
      customer_address: details.address,
      contact_id: contactId,
      contact_name: details.contactName,
      contact_email: details.email,
      contact_phone: details.phone,
      customer_contact_name: details.contactName,
      customer_contact_email: details.email,
      customer_contact_mobile: details.phone,
      customer_email: details.email,
      customer_phone: details.phone,
      customer_signatory_name: signatory.name,
      customer_signatory_title: signatory.title,
      customer_authorized_signatory_name: signatory.name,
      customer_authorized_signatory_title: signatory.title,
      contact: previewContact
    };
  },
  buildProposalDocumentHtml(proposal = {}, items = [], options = {}) {
    const proposalData = proposal && typeof proposal === 'object' ? proposal : {};
    const normalizedItems = (Array.isArray(items) ? items : []).map((item, index) => {
      const normalized = this.normalizeItem(item);
      if (!normalized.line_no) normalized.line_no = index + 1;
      return normalized;
    });
    const currency = String(proposalData.currency || 'USD').trim().toUpperCase();
    const normalizedStatus = this.normalizeProposalStatus(proposalData.status);
    const watermarkText =
      normalizedStatus === 'draft'
        ? 'DRAFT'
        : normalizedStatus === 'pending_approval'
          ? 'PENDING APPROVAL'
          : '';
    const showStatusWatermark = Boolean(watermarkText);
    const providerCompanyName = this.providerContactDefaults.name;
    const providerAddress = this.providerContactDefaults.address;
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
      const section = String(item?.section || '').trim().toLowerCase();
      const quantity = section === 'annual_saas'
        ? this.getAnnualSaasMonths(item)
        : (this.toNumberSafe(item.quantity) || 1);
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
              <td>${textValue(item.location_name || item.locationName)}</td>
              <td>${this.renderDocumentItemCell(item)}</td>
              <td class="cell-right">${money(computed.unitPrice)}</td>
              <td class="cell-center">${computed.quantity ? U.escapeHtml(String(computed.quantity)) : '—'}</td>
              <td class="cell-center">${dateValue(item.service_start_date || proposalData.service_start_date)}</td>
              <td class="cell-center">${dateValue(item.service_end_date)}</td>
              <td class="cell-center">${U.escapeHtml(String(computed.discountPercent || 0))}%</td>
              <td class="cell-right">${money(computed.lineTotal)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="8" class="cell-center muted">No SaaS / subscription items found.</td></tr>');

    const renderOneTimeRows = rows => (rows.length
      ? rows
          .map(item => {
            const computed = computeRow(item);
            return `<tr>
              <td>${textValue(item.location_name || item.locationName)}</td>
              <td>${this.renderDocumentItemCell(item)}</td>
              <td class="cell-right">${money(computed.unitPrice)}</td>
              <td class="cell-center">${U.escapeHtml(String(computed.discountPercent || 0))}%</td>
              <td class="cell-center">${computed.quantity ? U.escapeHtml(String(computed.quantity)) : '—'}</td>
              <td class="cell-right">${money(computed.lineTotal)}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="6" class="cell-center muted">No one-time fee items found.</td></tr>');

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
    const grandTotalInWords = U.formatAmountInWords(grandTotal, currency);
    const providerSignatoryName = this.getProposalProviderSignatoryName(proposalData);
    const providerSignatoryTitle = this.getProposalProviderSignatoryTitle(proposalData);
    const proposalContact = proposalData.contact || {
      full_name: proposalData.contact_name || proposalData.customer_contact_name || '',
      position: proposalData.contact_position || proposalData.position || '',
      job_title: proposalData.contact_job_title || proposalData.job_title || ''
    };
    const customerSignatory = this.resolveProposalCustomerSignatory(proposalData, proposalContact);
    const customerSignatoryName = String(customerSignatory.name || '').trim();
    const customerSignatoryTitle = String(customerSignatory.title || '').trim();
    const isPoc = this.normalizeTruthy(proposalData.is_poc || proposalData.isPoc);
    const pocDetailsHtml = isPoc ? `
      <section class="info-grid" style="margin-top:14px;grid-template-columns:1fr;">
        <div class="info-box" style="min-height:auto;">
          <div class="info-head">POC DETAILS</div>
          <div class="info-body" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px;">
            <div><strong>POC:</strong> Yes</div>
            <div><strong>Number of Locations:</strong> ${textValue(proposalData.poc_location_count)}</div>
            <div><strong>License / Month:</strong> ${textValue(proposalData.poc_license_months)}</div>
            <div><strong>Service Start Date:</strong> ${dateValue(proposalData.poc_service_start_date)}</div>
            <div><strong>Service End Date:</strong> ${dateValue(proposalData.poc_service_end_date)}</div>
            <div style="grid-column:1 / -1;"><strong>POC Success KPIs:</strong><br>${textValue(proposalData.poc_success_kpis || this.getDefaultPocSuccessKpis())}</div>
            <div style="grid-column:1 / -1;"><strong>Commercial Commitment:</strong><br>${textValue(proposalData.poc_conversion_commitment || this.getDefaultPocConversionCommitment())}</div>
          </div>
        </div>
      </section>` : '';

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Commercial Proposal · ${U.escapeHtml(String(proposalData.proposal_id || proposalData.id || ''))}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { font-family: Inter, "Segoe UI", Arial, Helvetica, sans-serif; margin: 0; padding: 12mm 0; color: #111827; background: #eef2f7; overflow-x: hidden; }
      .proposal-preview-page,
      .proposal-document-page {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: #fff;
        box-sizing: border-box;
        padding: 14mm 14mm 12mm;
        position: relative;
        overflow: hidden;
      }
      .proposal-preview-page,
      .proposal-document-page { border: 1px solid #dbe3ed; box-shadow: 0 14px 34px rgba(15, 23, 42, 0.13); }
      .proposal-preview-page > :not(.draft-watermark),
      .proposal-document-page > :not(.draft-watermark) { position: relative; z-index: 1; }
      .draft-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; font-size: 92px; font-weight: 800; letter-spacing: 0.16em; color: #0f172a; opacity: 0.055; transform: rotate(-28deg); text-transform: uppercase; user-select: none; }
      .doc-header { border-bottom: 1px solid #d8e1ec; padding-bottom: 7mm; margin-bottom: 8mm; }
      .proposal-preview-header,
      .proposal-document-header {
        display: grid;
        grid-template-columns: 44mm 1fr 68mm;
        align-items: center;
        gap: 8mm;
        width: 100%;
        max-width: 100%;
        margin: 0 0 8mm 0;
      }
      .proposal-preview-header__logo,
      .proposal-document-header__logo,
      .proposal-preview-logo,
      .proposal-document-logo {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        height: 28mm;
        min-width: 0;
        margin: 0;
        padding: 0;
        position: static;
      }
      .proposal-preview-header__logo .incheck360-doc-logo-wrap,
      .proposal-document-header__logo .incheck360-doc-logo-wrap,
      .proposal-preview-logo .incheck360-doc-logo-wrap,
      .proposal-document-logo .incheck360-doc-logo-wrap {
        float: none;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        margin: 0;
        padding: 0;
        width: 40mm;
        max-width: 40mm;
        height: 24mm;
        max-height: 24mm;
        text-align: left;
        position: static;
        transform: none;
      }
      .proposal-preview-header__logo img,
      .proposal-preview-header__logo svg,
      .proposal-document-header__logo img,
      .proposal-document-header__logo svg,
      .proposal-preview-logo img,
      .proposal-preview-logo svg,
      .proposal-document-logo img,
      .proposal-document-logo svg {
        display: block;
        max-width: 40mm;
        max-height: 24mm;
        width: auto;
        height: auto;
        object-fit: contain;
        object-position: left center;
        margin: 0;
        padding: 0;
        position: static;
        transform: none;
      }
      .commercial-terms-box { grid-column: 1 / -1; min-height: auto; }
      .proposal-preview-header__title-wrap,
      .proposal-document-header__title-wrap,
      .proposal-preview-title-block {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 28mm;
        min-width: 0;
        margin: 0;
        padding: 0;
        text-align: center;
      }
      .proposal-preview-header__title,
      .proposal-document-header__title,
      .proposal-preview-title,
      .proposal-document-title {
        margin: 0;
        font-size: 22px;
        line-height: 1;
        font-weight: 800;
        text-align: center;
        letter-spacing: 0.01em;
        color: #0b214a;
      }
      .proposal-preview-header__summary,
      .proposal-document-header__summary,
      .proposal-preview-summary,
      .proposal-document-summary {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        height: 28mm;
        min-width: 0;
        margin: 0;
        padding: 0;
        position: static;
      }
      .proposal-preview-header__summary .meta-box,
      .proposal-document-header__summary .meta-box { width: 100%; }
      .meta-box { border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; background: #fbfdff; min-width: 0; width: 100%; }
      .meta-row { display: grid; grid-template-columns: 26mm minmax(0, 1fr); border-bottom: 1px solid #e3eaf3; }
      .meta-row:last-child { border-bottom: 0; }
      .meta-row > div { padding: 2mm 2.4mm; font-size: 11px; min-width: 0; overflow-wrap: anywhere; }
      .meta-row .meta-key { background: #f5f8fc; font-weight: 700; color: #334155; border-right: 1px solid #e3eaf3; }
      .info-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 5mm; margin-top: 5mm; width: 100%; }
      .info-box { border: 1px solid #d7e1ed; min-height: 36mm; border-radius: 6px; overflow: hidden; background: #fff; min-width: 0; }
      .info-head { background: #f8fbff; border-bottom: 1px solid #e3eaf3; padding: 9px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; color: #1e3a5f; }
      .info-body { padding: 12px; font-size: 12.5px; line-height: 1.55; }
      .info-body strong { font-weight: 700; color: #0f172a; }
      .muted { color: #6b7280; }
      .section { margin-top: 22px; }
      .section h2 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #d8e1ec; padding-bottom: 7px; }
      .section .subhead { font-size: 12px; margin: 6px 0 8px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.04em; }
      table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; overflow-wrap: anywhere; page-break-inside: auto; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      th, td { border: 1px solid #dde5ef; padding: 6px; font-size: 10.5px; vertical-align: middle; overflow-wrap: anywhere; }
      th { text-align: center; background: #f5f8fc; color: #0f172a; font-weight: 700; }
      .cell-center { text-align: center; vertical-align: middle; }
      .cell-right { text-align: right; vertical-align: middle; white-space: nowrap; }
      .doc-item-name { font-weight: 600; }
      .doc-item-description { margin-top: 3px; font-size: 10px; line-height: 1.35; color: #555; font-weight: 400; }
      .total-row td { font-weight: 700; background: #f7faff; }
      .totals-wrap { display: flex; justify-content: flex-end; margin-top: 16px; }
      .totals-box { width: 96mm; max-width: 100%; border: 1px solid #d7e1ed; border-radius: 6px; overflow: hidden; }
      .totals-row { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e3eaf3; font-size: 13px; }
      .totals-row:last-child { border-bottom: 0; }
      .totals-row span { min-width: 0; }
      .totals-row strong { text-align: right; overflow-wrap: anywhere; }
      .totals-row.grand { font-size: 15px; font-weight: 700; background: #edf4ff; color: #0b214a; }
      .totals-row.grand-total-words-row { align-items: flex-start; gap: 12px; background: #f8fbff; color: #334155; font-size: 12px; font-weight: 500; }
      .totals-row.grand-total-words-row span { flex: 0 0 auto; font-weight: 600; white-space: nowrap; }
      .totals-row.grand-total-words-row strong { flex: 1 1 auto; min-width: 0; font-weight: 500; line-height: 1.4; text-align: right; overflow-wrap: anywhere; }
      .terms { margin-top: 16px; font-size: 12.5px; line-height: 1.6; border: 1px solid #d7e1ed; border-radius: 6px; padding: 12px; }
      .proposal-terms-list { margin: 8px 0 0; padding-left: 22px; }
      .proposal-terms-list li + li { margin-top: 5px; }
      .proposal-terms-text { margin-top: 8px; white-space: pre-wrap; }
      .terms a { color: inherit; text-decoration: underline; overflow-wrap: anywhere; }
      .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 12px; }
      .signature-box { border: 1px solid #d7e1ed; min-height: 124px; border-radius: 6px; overflow: hidden; }
      .signature-head { background: #f8fbff; border-bottom: 1px solid #e3eaf3; padding: 8px 10px; font-size: 11px; letter-spacing: 0.08em; font-weight: 700; color: #1e3a5f; }
      .signature-body { padding: 11px; font-size: 12px; line-height: 1.5; }
      .footer-note { margin-top: 16px; font-size: 11px; color: #64748b; border-top: 1px solid #e3eaf3; padding-top: 10px; text-align: center; }
      @page { size: A4; margin: 0; }
      @media print {
        body {
          margin: 0;
          padding: 0;
          background: #fff;
          overflow: visible;
        }

        .proposal-preview-page,
        .proposal-document-page {
          width: 210mm;
          min-height: 297mm;
          margin: 0;
          box-shadow: none;
          page-break-after: always;
          border: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="proposal-preview-page proposal-document-page doc-sheet">
      ${showStatusWatermark ? `<div class="draft-watermark" aria-hidden="true">${U.escapeHtml(watermarkText)}</div>` : ''}
      <header class="doc-header">
        <section class="proposal-preview-header proposal-document-header">
          <div class="proposal-preview-header__logo proposal-document-header__logo proposal-preview-logo proposal-document-logo"><div data-incheck360-doc-logo-slot></div></div>
          <div class="proposal-preview-header__title-wrap proposal-document-header__title-wrap proposal-preview-title-block">
            <h1 class="proposal-preview-header__title proposal-document-header__title proposal-preview-title proposal-document-title">Commercial Proposal</h1>
          </div>
          <div class="proposal-preview-header__summary proposal-document-header__summary proposal-preview-summary proposal-document-summary">
            <div class="meta-box">
              <div class="meta-row"><div class="meta-key">Proposal ID</div><div>${textValue(proposalData.proposal_id || 'Missing ID')}</div></div>
              <div class="meta-row"><div class="meta-key">Reference #</div><div>${textValue(proposalData.ref_number)}</div></div>
              <div class="meta-row"><div class="meta-key">Proposal Date</div><div>${dateValue(proposalData.proposal_date)}</div></div>
              <div class="meta-row"><div class="meta-key">Valid Until</div><div>${dateValue(proposalData.valid_until || proposalData.proposal_valid_until || this.getAutoValidUntil(proposalData.proposal_date))}</div></div>
            </div>
          </div>
        </section>
      </header>

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
            <div><strong>${textValue(providerCompanyName)}</strong></div>
            <div class="muted">${textValue(providerAddress)}</div>
            <div><strong>Mobile:</strong> ${textValue(proposalData.provider_contact_mobile || this.providerContactDefaults.mobile)}</div>
            <div><strong>Email:</strong> ${textValue(proposalData.provider_contact_email || this.providerContactDefaults.email)}</div>
          </div>
        </div>
      </section>

      <section class="info-grid" style="margin-top:14px;">
        <div class="info-box commercial-terms-box">
          <div class="info-head">COMMERCIAL TERMS</div>
          <div class="info-body">
            <div><strong>Billing Frequency:</strong> ${textValue(proposalData.billing_frequency)}</div>
            <div><strong>Payment Term:</strong> ${textValue(this.getPaymentTermDisplay(proposalData.payment_term))}</div>
            <div><strong>PO Number:</strong> ${textValue(proposalData.po_number)}</div>
            <div><strong>Account Number:</strong> ${textValue(proposalData.account_number)}</div>
            <div><strong>Service Start Date:</strong> ${dateValue(proposalData.service_start_date)}</div>
            <div><strong>Contract Term:</strong> ${textValue(proposalData.contract_term)}</div>
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
            ${renderSubscriptionRows(subscriptionItems)}
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
            ${renderOneTimeRows(oneTimeItems.length ? oneTimeItems : otherItems)}
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
        ${this.renderProposalTermsHtml(proposalData.terms_conditions)}
      </section>

      <section class="signature-grid">
        <div class="signature-box">
          <div class="signature-head">CUSTOMER SIGNATORY</div>
          <div class="signature-body">
            <div><strong>Name:</strong> ${textValue(customerSignatoryName)}</div>
            <div><strong>Title:</strong> ${textValue(customerSignatoryTitle)}</div>
            <div><strong>Sign Date:</strong> ${dateValue(proposalData.customer_sign_date || proposalData.customer_signed_at)}</div>
          </div>
        </div>
        <div class="signature-box">
          <div class="signature-head">PROVIDER SIGNATORY</div>
          <div class="signature-body">
            <div><strong>Name:</strong> ${textValue(providerSignatoryName)}</div>
            <div><strong>Title:</strong> ${textValue(providerSignatoryTitle)}</div>
            <div><strong>Sign Date:</strong> ${dateValue(proposalData.provider_sign_date)}</div>
          </div>
        </div>
      </section>

      <footer class="footer-note">This is an auto-generated system document and is valid without a manual signature unless otherwise required.</footer>
    </div>
  </body>
</html>`;
    return U.stripInternalDocumentLinks(html);
  },
  buildProposalPreviewHtml(proposal = {}, items = []) {
    return this.buildProposalDocumentHtml(proposal, items, { mode: 'preview' });
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
      const status = this.getEffectiveProposalStatus(row);
      if (this.state.status !== 'All' && status !== this.state.status) return false;
      if (!this.matchesKpiFilter(row)) return false;

      const hay = [
        row.proposal_id,
        row.ref_number,
        row.proposal_title,
        row.customer_name,
        row.deal_id,
        row.deal_code,
        this.normalizeProposalStatus(row.status),
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
    const statusLabel = this.normalizeStatusLabel(this.getEffectiveProposalStatus(row));
    const grandTotal = this.toNumberSafe(row?.grand_total);
    const saasTotal = this.toNumberSafe(row?.saas_total);
    const oneTimeTotal = this.toNumberSafe(row?.one_time_total);
    if (filter === 'total') return true;
    if (filter === 'draft') return statusLabel === 'Draft';
    if (filter === 'sent') return statusLabel === 'Sent';
    if (filter === 'approved') return statusLabel === 'Accepted';
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
    if (status === 'viewed') return 'Sent';
    if (status.includes('pending') && status.includes('approval')) return 'Pending Approval';
    if (status.includes('draft')) return 'Draft';
    if (status.includes('sent') || status.includes('submitted')) return 'Sent';
    if (status.includes('approve') || status.includes('accept') || status.includes('won'))
      return 'Accepted';
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
      const statusLabel = this.normalizeStatusLabel(this.getEffectiveProposalStatus(row));
      if (statusLabel === 'Draft') draftCount += 1;
      if (statusLabel === 'Sent') sentCount += 1;
      if (statusLabel === 'Accepted') approvedCount += 1;
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
    const allowedStatuses = this.finalStatusOptions;
    const statusValues = [...new Set(this.state.rows.map(row => this.normalizeProposalStatus(row.status)).filter(Boolean))]
      .filter(status => allowedStatuses.includes(status))
      .sort((a, b) => allowedStatuses.indexOf(a) - allowedStatuses.indexOf(b));

    if (E.proposalsStatusFilter) {
      const options = ['All', ...statusValues];
      E.proposalsStatusFilter.innerHTML = options
        .map(v => v === 'All'
          ? '<option value="All">All</option>'
          : `<option value="${U.escapeAttr(v)}">${U.escapeHtml(this.getProposalStatusLabel(v))}</option>`)
        .join('');
      E.proposalsStatusFilter.value = options.includes(this.state.status) ? this.state.status : 'All';
    }
    if (E.proposalsSearchInput) E.proposalsSearchInput.value = this.state.search;
    if (E.proposalsCustomerFilter) E.proposalsCustomerFilter.value = this.state.customer;
    if (E.proposalsExportCsvBtn) {
      const canExport = Permissions.canExport('proposals');
      E.proposalsExportCsvBtn.style.display = canExport ? '' : 'none';
      E.proposalsExportCsvBtn.disabled = this.state.loading || !canExport;
      E.proposalsExportCsvBtn.setAttribute('data-permission-resource', 'proposals');
      E.proposalsExportCsvBtn.setAttribute('data-permission-action', 'export');
    }
    if (E.proposalsCreateBtn) {
      const canCreate = Permissions.canCreateProposal();
      E.proposalsCreateBtn.style.display = canCreate ? '' : 'none';
      E.proposalsCreateBtn.disabled = !canCreate;
      E.proposalsCreateBtn.setAttribute('data-permission-resource', 'proposals');
      E.proposalsCreateBtn.setAttribute('data-permission-action', 'create');
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
        const id = U.escapeAttr(row.id || row.proposal_id || row.proposalId || '');
        const isAccepted = this.isProposalAccepted(row);
        const isExpired = this.isProposalExpired(row);
        const isLocked = isAccepted || isExpired;
        return `<tr>
          <td>${proposalIdCell(row)}</td>
          <td>${textCell(row.ref_number)}</td>
          <td>${textCell(row.proposal_title)}</td>
          <td>${textCell(row.customer_name)}</td>
          <td>${textCell(row.deal_code || row.deal_id)}</td>
          <td>${textCell(this.getProposalStatusLabel(this.getEffectiveProposalStatus(row)))}</td>
          <td>${textCell(row.currency)}</td>
          <td>${this.formatMoney(row.saas_total)}</td>
          <td>${this.formatMoney(row.one_time_total)}</td>
          <td>${this.formatMoney(row.grand_total)}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.proposal_date))}</td>
          <td>${U.escapeHtml(U.fmtDisplayDate(row.valid_until || row.proposal_valid_until || this.getAutoValidUntil(row.proposal_date)))}</td>
          <td>${textCell(row.generated_by)}</td>
          <td>
            ${Permissions.canPreviewProposal() ? `<button class="btn ghost sm" type="button" data-proposal-view="${id}" data-permission-resource="proposals" data-permission-action="view">View</button>` : ''}
            ${Permissions.canUpdateProposal() && (!isLocked || this.canUseAdminOverride()) ? `<button class="btn ghost sm" type="button" data-proposal-edit="${id}" data-permission-resource="proposals" data-permission-action="update">${isLocked && this.canUseAdminOverride() ? 'Admin Edit' : 'Edit'}</button>` : ''}
            ${Permissions.canPreviewProposal() ? `<button class="btn ghost sm" type="button" data-proposal-preview="${id}" data-permission-resource="proposals" data-permission-action="view">Preview</button>` : ''}
            ${this.canShowConvertToAgreement(row) && !this.isAgreementAlreadyCreated(row)
              ? `<button class="btn ghost sm" type="button" data-proposal-convert-agreement="${id}" data-permission-resource="agreements" data-permission-action="create_from_proposal">Convert to Agreement</button>`
              : ''}
            ${Permissions.canDeleteProposal() ? `<button class="btn ghost sm" type="button" data-proposal-delete="${id}" data-permission-resource="proposals" data-permission-action="delete" data-permission-resource="proposals" data-permission-action="delete">Delete</button>` : ''}
          </td>
        </tr>`;
      })
      .join('');
    applyPermissionVisibility(E.proposalsTbody);
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
      proposal_date: this.todayDateString(),
      valid_until: this.getAutoValidUntil(this.todayDateString()),
      status: 'draft',
      currency: '',
      customer_name: '',
      customer_legal_name: '',
      company_id: '',
      company_name: '',
      contact_id: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      contact_mobile: '',
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
      is_poc: false,
      poc_location_count: null,
      poc_license_count: null,
      poc_license_months: null,
      poc_service_start_date: '',
      poc_service_end_date: '',
      customer_signatory_name: '',
      customer_signatory_title: '',
      customer_sign_date: '',
      provider_signatory_name: '',
      provider_signatory_title: '',
      provider_sign_date: '',
      terms_conditions: this.defaultProposalTermsAndConditions,
      internal_notes: '',
      approved_annual_saas_discount_percent: '',
      approved_one_time_fee_discount_percent: '',
      approved_discount_percent: '',
      discount_approval_status: '',
      discount_approved_at: '',
      discount_approved_by: '',
      last_discount_approval_request_id: '',
      approval_required_reason: '',
      signed_document_path: '',
      signed_document_name: '',
      signed_document_uploaded_at: '',
      signed_document_uploaded_by: ''
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
  getDefaultPocSuccessKpis() {
    return 'POC success is confirmed when the agreed POC scope is completed for the selected locations, the customer validates the delivered monitoring/reporting output, users confirm operational acceptance, and no critical blocker remains open by the POC end date.';
  },
  getDefaultPocConversionCommitment() {
    return 'If the POC success KPIs are achieved, the customer agrees to proceed with the full commercial subscription/agreement.';
  },
  syncPocDetailsVisibility() {
    const enabled = !!E.proposalFormIsPoc?.checked;
    if (E.proposalPocDetails) E.proposalPocDetails.style.display = enabled ? 'grid' : 'none';
    if (enabled) {
      if (E.proposalFormPocSuccessKpis && !String(E.proposalFormPocSuccessKpis.value || '').trim()) {
        E.proposalFormPocSuccessKpis.value = this.getDefaultPocSuccessKpis();
      }
      if (E.proposalFormPocConversionCommitment && !String(E.proposalFormPocConversionCommitment.value || '').trim()) {
        E.proposalFormPocConversionCommitment.value = this.getDefaultPocConversionCommitment();
      }
    }
    [
      E.proposalFormPocLocationCount,
      E.proposalFormPocLicenseMonths,
      E.proposalFormPocServiceStartDate,
      E.proposalFormPocServiceEndDate,
      E.proposalFormPocSuccessKpis,
      E.proposalFormPocConversionCommitment
    ].forEach(el => {
      if (!el) return;
      el.disabled = this.state.formReadOnly || !enabled;
    });
    this.lockPocServiceEndDateInput();
  },
  lockPocServiceEndDateInput() {
    if (!E.proposalFormPocServiceEndDate) return;
    E.proposalFormPocServiceEndDate.readOnly = true;
    E.proposalFormPocServiceEndDate.setAttribute('aria-readonly', 'true');
    E.proposalFormPocServiceEndDate.title = 'Auto-calculated from POC Service Start Date and License / Month.';
    E.proposalFormPocServiceEndDate.classList.add('readonly-field', 'locked-field');
  },
  syncPocServiceEndDate() {
    if (!E.proposalFormIsPoc?.checked) return;
    this.lockPocServiceEndDateInput();
    const start = this.normalizeDateInputValue(E.proposalFormPocServiceStartDate?.value || '');
    const months = E.proposalFormPocLicenseMonths?.value || '';
    const calculated = this.calculateServiceEndDate(start, months);
    if (E.proposalFormPocServiceEndDate) {
      E.proposalFormPocServiceEndDate.value = calculated || '';
    }
  },
  getProposalPocPayload() {
    const isPoc = !!E.proposalFormIsPoc?.checked;
    if (!isPoc) {
      return {
        is_poc: false,
        poc_location_count: null,
        poc_license_count: null,
        poc_license_months: null,
        poc_service_start_date: null,
        poc_service_end_date: null,
        poc_success_kpis: null,
        poc_conversion_commitment: null
      };
    }
    const pocServiceStartDate = this.normalizeDateInputValue(E.proposalFormPocServiceStartDate?.value || '');
    const pocLicenseMonths = this.toNullableNumber(E.proposalFormPocLicenseMonths?.value);
    const pocServiceEndDate = this.calculateServiceEndDate(pocServiceStartDate, pocLicenseMonths);
    if (E.proposalFormPocServiceEndDate) E.proposalFormPocServiceEndDate.value = pocServiceEndDate || '';
    return {
      is_poc: true,
      poc_location_count: this.toNullableNumber(E.proposalFormPocLocationCount?.value),
      poc_license_count: null,
      poc_license_months: pocLicenseMonths,
      poc_service_start_date: pocServiceStartDate,
      poc_service_end_date: pocServiceEndDate || null,
      poc_success_kpis: String(E.proposalFormPocSuccessKpis?.value || this.getDefaultPocSuccessKpis()).trim(),
      poc_conversion_commitment: String(E.proposalFormPocConversionCommitment?.value || this.getDefaultPocConversionCommitment()).trim()
    };
  },
  validatePocDetails(proposal = {}) {
    if (!this.normalizeTruthy(proposal.is_poc)) return true;
    if (!(this.toNumberSafe(proposal.poc_location_count) > 0)) { UI.toast('Please enter the POC number of locations.'); E.proposalFormPocLocationCount?.focus?.(); return false; }    if (!(this.toNumberSafe(proposal.poc_license_months) > 0)) { UI.toast('Please enter the POC license / month value.'); E.proposalFormPocLicenseMonths?.focus?.(); return false; }
    if (!this.normalizeDateInputValue(proposal.poc_service_start_date)) { UI.toast('Please select the POC service start date.'); E.proposalFormPocServiceStartDate?.focus?.(); return false; }
    if (!this.normalizeDateInputValue(proposal.poc_service_end_date)) { UI.toast('Please select the POC service end date.'); E.proposalFormPocServiceEndDate?.focus?.(); return false; }
    if (!String(proposal.poc_success_kpis || '').trim()) { UI.toast('Please enter the POC success KPIs.'); E.proposalFormPocSuccessKpis?.focus?.(); return false; }
    if (!String(proposal.poc_conversion_commitment || '').trim()) { UI.toast('Please enter the POC commercial commitment.'); E.proposalFormPocConversionCommitment?.focus?.(); return false; }
    return true;
  },
  resetForm() {
    if (!E.proposalForm) return;
    E.proposalForm.reset();
    if (E.proposalFormProposalId) E.proposalFormProposalId.value = '';
    ['id', 'refNumber', 'companyId', 'companyName', 'companyLegalName', 'companyAddress', 'contactId', 'contactName', 'contactFirstName', 'contactLastName', 'contactJobTitle', 'contactEmail', 'contactPhone', 'contactMobile', 'source', 'sourceCompanyId', 'sourceContactId'].forEach(key => { delete E.proposalForm.dataset[key]; });
    ['proposalFormCompanyId', 'proposalFormContactId', 'proposalFormCompanyNameHidden', 'proposalFormContactNameHidden'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['proposalFormCompanySelector', 'proposalFormContactSelector'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['proposalDraft', 'cachedProposal', 'currentProposalDraft', 'proposalFormState'].forEach(key => { try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch {} });
    this.state.currentProposalId = '';
    this.state.currentProposal = null;
    this.state.currentItems = [];
    this.state.selectedCompanyId = '';
    this.state.selectedContactId = '';
    this.state.loadedCompany = null;
    this.state.loadedContact = null;
    this.state.createLoadToken += 1;
    if (E.proposalFormDeleteBtn) E.proposalFormDeleteBtn.style.display = 'none';
    if (E.proposalFormSaveBtn) E.proposalFormSaveBtn.disabled = false;
    if (E.proposalFormPreviewBtn) E.proposalFormPreviewBtn.disabled = false;
    if (E.proposalSignedDocumentFile) E.proposalSignedDocumentFile.value = '';
    if (E.proposalSignedDocumentSection) E.proposalSignedDocumentSection.style.display = 'none';
    if (E.proposalFormIsPoc) E.proposalFormIsPoc.checked = false;
    if (E.proposalFormPocLocationCount) E.proposalFormPocLocationCount.value = '';
    if (E.proposalFormPocLicenseMonths) E.proposalFormPocLicenseMonths.value = '';
    if (E.proposalFormPocServiceStartDate) E.proposalFormPocServiceStartDate.value = '';
    if (E.proposalFormPocServiceEndDate) E.proposalFormPocServiceEndDate.value = '';
    if (E.proposalFormPocSuccessKpis) E.proposalFormPocSuccessKpis.value = '';
    if (E.proposalFormPocConversionCommitment) E.proposalFormPocConversionCommitment.value = '';
    if (E.proposalFormInternalNotes) E.proposalFormInternalNotes.value = '';
    this.syncPocDetailsVisibility();
    this.syncProposalAcceptedLockMessage(false);
  },
  setFormReadOnly(readOnly) {
    this.state.formReadOnly = !!readOnly;
    if (!E.proposalForm) return;
    E.proposalForm.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.id === 'proposalSignedDocumentFile') return;
      el.disabled = !!readOnly;
    });
    [E.proposalAddAnnualRowBtn, E.proposalAddOneTimeRowBtn, E.proposalAddCapabilityRowBtn, E.proposalResetTermsBtn].forEach(btn => {
      if (!btn) return;
      btn.style.display = readOnly ? 'none' : '';
    });
    E.proposalForm?.querySelectorAll('[data-item-remove]').forEach(btn => {
      btn.style.display = readOnly ? 'none' : '';
    });
    if (E.proposalFormSaveBtn) E.proposalFormSaveBtn.style.display = readOnly ? 'none' : '';
    this.syncProposalAcceptedLockMessage(readOnly && (this.isProposalAccepted(this.state.currentProposal || {}) || this.isProposalExpired(this.state.currentProposal || {})));
    const lockedIds=['proposalFormCustomerName','proposalFormCustomerAddress','proposalFormCustomerContactName','proposalFormCustomerContactMobile','proposalFormCustomerContactEmail','proposalFormProviderContactName','proposalFormProviderContactMobile','proposalFormProviderContactEmail','proposalFormCustomerSignatoryName','proposalFormCustomerSignatoryTitle','proposalFormProviderSignatoryName','proposalFormProviderSignatoryTitle'];
    lockedIds.forEach(id=>{const el=document.getElementById(id); if(!el) return; el.readOnly=true; el.classList.add('readonly-field','locked-field'); el.setAttribute('aria-readonly','true');});
    this.refreshSignedDocumentUi(this.state.currentProposal || {});
    this.syncPocDetailsVisibility();
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
    const proposalDate = this.getProposalDateOrToday(proposal.proposal_date);
    const validUntil = this.resolveProposalValidUntil(proposalDate, proposal.valid_until || proposal.proposal_valid_until);
    set(E.proposalFormProposalDate, proposalDate);
    set(E.proposalFormValidUntil, validUntil);
    this.syncProposalValidityLimits();
    if (E.proposalFormValidUntil) E.proposalFormValidUntil.dataset.autoValidUntil = this.getAutoValidUntil(proposalDate);
    set(E.proposalFormStatus, this.getEffectiveProposalStatus(proposal) || 'draft');
    set(E.proposalFormCurrency, proposal.currency || '');
    set(E.proposalFormCustomerName, proposal.customer_legal_name || proposal.customer_name || proposal.company_name || '');
    set(E.proposalFormCustomerAddress, proposal.customer_address || '');
    set(E.proposalFormCustomerContactName, proposal.customer_contact_name || '');
    set(E.proposalFormCustomerContactMobile, proposal.customer_contact_mobile || '');
    set(E.proposalFormCustomerContactEmail, proposal.customer_contact_email || '');
    set(E.proposalFormProviderContactName, this.providerContactDefaults.name);
    set(E.proposalFormProviderContactMobile, this.providerContactDefaults.mobile);
    set(E.proposalFormProviderContactEmail, this.providerContactDefaults.email);
    set(E.proposalFormServiceStartDate, proposal.service_start_date || '');
    set(E.proposalFormContractTerm, proposal.contract_term || '');
    set(E.proposalFormAccountNumber, proposal.account_number || '');
    set(E.proposalFormBillingFrequency, 'Annual');
    set(E.proposalFormPaymentTerm, this.normalizePaymentTerm(proposal.payment_term || proposal.payment_terms, 'Net 30'));
    set(E.proposalFormPoNumber, proposal.po_number || '');
    const isPoc = this.normalizeTruthy(proposal.is_poc ?? proposal.isPoc);
    if (E.proposalFormIsPoc) E.proposalFormIsPoc.checked = isPoc;
    set(E.proposalFormPocLocationCount, proposal.poc_location_count ?? '');
    set(E.proposalFormPocLicenseMonths, proposal.poc_license_months ?? '');
    set(E.proposalFormPocServiceStartDate, this.normalizeDateInputValue(proposal.poc_service_start_date || ''));
    set(E.proposalFormPocServiceEndDate, this.normalizeDateInputValue(proposal.poc_service_end_date || ''));
    set(E.proposalFormPocSuccessKpis, proposal.poc_success_kpis || (isPoc ? this.getDefaultPocSuccessKpis() : ''));
    set(E.proposalFormPocConversionCommitment, proposal.poc_conversion_commitment || (isPoc ? this.getDefaultPocConversionCommitment() : ''));
    this.syncPocDetailsVisibility();
    this.syncPocServiceEndDate();
    set(E.proposalFormCustomerSignatoryName, proposal.customer_signatory_name || '');
    set(E.proposalFormCustomerSignatoryTitle, proposal.customer_signatory_title || '');
    // Signature dates must stay blank unless explicitly entered by the user.
    set(E.proposalFormCustomerSignDate, this.normalizeDateInputValue(proposal.customer_sign_date || ''));
    set(E.proposalFormProviderSignatoryName, this.getProposalProviderSignatoryName(proposal));
    set(E.proposalFormProviderSignatoryTitle, this.getProposalProviderSignatoryTitle(proposal));
    set(E.proposalFormProviderSignDate, this.normalizeDateInputValue(proposal.provider_sign_date || ''));
    set(E.proposalFormInternalNotes, proposal.internal_notes || proposal.proposal_notes || proposal.internal_note || proposal.notes || '');
    set(E.proposalFormTerms, proposal.terms_conditions || '');
    this.refreshSignedDocumentUi(proposal);
  },
  computeCommercialRow(item) {
    const section = String(item?.section || '').trim().toLowerCase();
    const unit = this.toNumberSafe(item.unit_price);
    const isAnnualUserBased = section === 'annual_saas' && this.isAnnualSaasUserItem(item);
    let qty = section === 'annual_saas'
      ? this.getAnnualSaasMonths(item)
      : this.toNumberSafe(item.quantity);
    if (!qty && section === 'one_time_fee') qty = 1;
    const licenseQty = isAnnualUserBased ? Math.max(1, Math.round(this.toNumberSafe(item.license_quantity ?? item.user_quantity ?? item.item_quantity) || 1)) : 1;
    const rawDiscountRatio = this.normalizeDiscount(item.discount_percent);
    const hasSavedForcedDiscount = this.hasSavedForcedAnnualDiscount(item);
    const shouldForceNoDiscount =
      section === 'annual_saas'
      && qty < 12
      && !hasSavedForcedDiscount;
    const discountRatio = shouldForceNoDiscount ? 0 : rawDiscountRatio;
    const baseAmount = section === 'annual_saas' ? unit * licenseQty * (qty / 12) : unit * qty;
    const discounted = section === 'annual_saas' ? baseAmount * (1 - discountRatio) : unit * (1 - discountRatio);
    const lineTotal = Math.max(0, baseAmount * (1 - discountRatio));
    return {
      ...item,
      quantity: qty,
      qty: section === 'annual_saas' ? qty : item.qty,
      months: section === 'annual_saas' ? qty : item.months,
      license_months: section === 'annual_saas' ? qty : item.license_months,
      duration_months: section === 'annual_saas' ? qty : item.duration_months,
      license_quantity: licenseQty,
      discount_percent: shouldForceNoDiscount ? 0 : item.discount_percent,
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
  buildCatalogSelectOptions(section, selectedItemName = '') {
    const rows = this.getCatalogRowsForSection(section);
    const selectedNormalized = this.normalizeText(selectedItemName);
    const seen = new Set();
    let selectedFound = false;
    const options = rows
      .filter(row => {
        const key = this.normalizeText(row?.item_name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(row => {
        const itemName = String(row?.item_name || '').trim();
        const normalizedName = this.normalizeText(itemName);
        const isSelected = normalizedName && normalizedName === selectedNormalized;
        if (isSelected) selectedFound = true;
        return `<option value="${U.escapeAttr(itemName)}"${isSelected ? ' selected' : ''}>${U.escapeHtml(itemName)}</option>`;
      })
      .join('');
    const inactiveSelectedOption = selectedNormalized && !selectedFound
      ? `<option value="${U.escapeAttr(selectedItemName)}" selected>${U.escapeHtml(selectedItemName)} (Inactive catalog item)</option>`
      : '';
    const placeholderSelected = !selectedNormalized ? ' selected' : '';
    return `<option value=""${placeholderSelected}>Select item…</option>${inactiveSelectedOption}${options}`;
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
    const descriptionInput = tr.querySelector('[data-item-field="description"]');
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
    const selectedDescription = this.getItemDescription(selected);
    if (descriptionInput) descriptionInput.value = selectedDescription;
    try {
      const payload = JSON.parse(tr.getAttribute('data-item-payload') || '{}');
      tr.setAttribute('data-item-payload', JSON.stringify({ ...payload, description: selectedDescription }));
    } catch (_error) {
      tr.setAttribute('data-item-payload', JSON.stringify({ description: selectedDescription }));
    }
    const hasCatalogDiscount = ['discount_percent', 'discountPercent', 'discount', 'item_discount', 'itemDiscount'].some(
      key => selected[key] !== undefined && selected[key] !== null && String(selected[key]).trim() !== ''
    );
    const selectedDiscountPercent = this.getNormalizedItemDiscountPercent(selected);
    const hasExistingDiscount = discountPercentInput && String(discountPercentInput.value ?? '').trim() !== '';
    if (discountPercentInput && hasCatalogDiscount && (fromUserInput || !hasExistingDiscount)) {
      discountPercentInput.value = String(selectedDiscountPercent);
    }
    if (quantityInput) {
      if (section === 'one_time_fee') {
        const inCheckBasicCount = this.getInCheckBasicAnnualRowCountFromDom?.() || 0;
        const shouldAutoLinkOneTimeFees = inCheckBasicCount > 0;
        if (shouldAutoLinkOneTimeFees && !this.isCsHoursItem({ item_name: itemInput.value })) {
          quantityInput.value = String(Math.max(1, inCheckBasicCount));
          quantityInput.readOnly = true;
          quantityInput.setAttribute('aria-readonly', 'true');
          quantityInput.title = 'Quantity is linked to the number of InCheck Basic Annual SaaS rows.';
          quantityInput.classList.add('readonly-field', 'locked-field');
        } else {
          quantityInput.readOnly = false;
          quantityInput.removeAttribute('readonly');
          quantityInput.removeAttribute('aria-readonly');
          quantityInput.removeAttribute('title');
          quantityInput.classList.remove('readonly-field', 'locked-field');
        }
      } else if (section === 'annual_saas') {
        const currentMonths = this.getAnnualSaasMonths({ quantity: quantityInput.value });
        const selectedMonths = this.getAnnualSaasMonths(selected);
        quantityInput.value = String(fromUserInput || !String(quantityInput.value || '').trim() ? selectedMonths : currentMonths);
      } else if (selected.quantity !== null && selected.quantity !== undefined) {
        const selectedQuantity = this.toNumberSafe(selected.quantity) || 1;
        quantityInput.value = String(selectedQuantity);
      }
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
    const hasUserBasedAnnualSaas = section === 'annual_saas' && safeRows.some(item => this.isAnnualSaasUserItem(item));
    if (!safeRows.length) {
      const colspan = section === 'capability' ? 3 : section === 'annual_saas' ? (hasUserBasedAnnualSaas ? 10 : 9) : 7;
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
        const inCheckBasicCount = this.getInCheckBasicAnnualRowCountFromDom?.() || this.getInCheckBasicAnnualRowCountFromItems?.(this.collectSectionItems?.('annual_saas') || []) || 0;
        const linkedOneTimeQuantity = Math.max(1, inCheckBasicCount || 1);
        const shouldAutoLinkOneTimeFees = inCheckBasicCount > 0;
        const isAnnualUserBased = section === 'annual_saas' && this.isAnnualSaasUserItem(row);
        const months = section === 'annual_saas' ? this.getAnnualSaasMonths(row) : 0;
        const rowDefaults = section === 'annual_saas'
          ? { ...row, quantity: months, qty: months, months, license_months: months, duration_months: months, license_quantity: row.license_quantity || row.user_quantity || row.item_quantity || 1, service_start_date: row.service_start_date || this.getDefaultAnnualServiceStartDate() }
          : { ...row, quantity: shouldAutoLinkOneTimeFees && !this.isCsHoursItem(row) ? linkedOneTimeQuantity : (row.quantity || 1) };
        if (section === 'annual_saas') {
          rowDefaults.service_end_date = this.addMonthsMinusOneDay(rowDefaults.service_start_date, rowDefaults.quantity);
        }
        const computed = this.computeCommercialRow({ ...rowDefaults, section });
        const serviceDateCells = section === 'annual_saas'
          ? `<td><input class="input" type="date" data-item-field="service_start_date" value="${U.escapeAttr(computed.service_start_date || '')}" /></td>
          <td><input class="input readonly-field locked-field" type="date" data-item-field="service_end_date" value="${U.escapeAttr(computed.service_end_date || '')}" readonly aria-readonly="true" title="Auto-calculated from Service Start Date and License / Month." /></td>`
          : '';
        const hasSavedForcedDiscount = this.hasSavedForcedAnnualDiscount({ ...rowDefaults, ...computed, section });
        const annualDiscountLocked = section === 'annual_saas' && this.toNumberSafe(computed.quantity) < 12 && !hasSavedForcedDiscount;
        const oneTimeQuantityLocked = section === 'one_time_fee' && shouldAutoLinkOneTimeFees && !this.isCsHoursItem(computed);
        const discountLockAttr = annualDiscountLocked ? ' readonly aria-readonly="true" title="Discount is only available when License / Month is 12 or higher."' : '';
        const quantityLockAttr = oneTimeQuantityLocked ? ' readonly aria-readonly="true" title="Quantity is linked to the number of InCheck Basic Annual SaaS rows."' : '';
        const discountValue = annualDiscountLocked ? 0 : (computed.discount_percent ?? rowDefaults.discount_percent ?? '');
        const discountCell = `<td><input class="input" type="number" step="0.01" min="0" max="100" data-item-field="discount_percent" value="${U.escapeAttr(discountValue)}"${discountLockAttr} /></td>`;
        const quantityCell = `<td><input class="input" type="number" step="0.01" min="1" ${section === 'annual_saas' ? 'max="12"' : ''} data-item-field="quantity" value="${U.escapeAttr(oneTimeQuantityLocked ? (computed.quantity || 1) : (computed.quantity ?? ''))}"${quantityLockAttr} /></td>`;
        const licenseQtyCell = hasUserBasedAnnualSaas
          ? `<td><input class="input${isAnnualUserBased ? '' : ' readonly-field locked-field'}" type="number" step="1" min="1" data-item-field="license_quantity" value="${U.escapeAttr(isAnnualUserBased ? (computed.license_quantity || 1) : 1)}"${isAnnualUserBased ? '' : ' readonly aria-readonly="true" title="Location based Annual SaaS rows always use Qty 1."'} /></td>`
          : '';
        const commercialCells = section === 'annual_saas'
          ? `${quantityCell}${serviceDateCells}${discountCell}`
          : `${discountCell}${quantityCell}`;
        return `<tr data-item-row="${section}" data-item-payload="${U.escapeAttr(JSON.stringify(row || {}))}">
          <td><input class="input" data-item-field="location_name" value="${U.escapeAttr(computed.location_name || '')}" /><input type="hidden" data-item-field="location_address" value="${U.escapeAttr(computed.location_address || '')}" /></td>
          <td><input type="hidden" data-item-field="catalog_item_id" value="${U.escapeAttr(computed.catalog_item_id || '')}" /><input type="hidden" data-item-field="description" value="${U.escapeAttr(computed.description || '')}" /><select class="input" data-item-field="item_name">${this.buildCatalogSelectOptions(section, computed.item_name || '')}</select></td>
          ${section === 'annual_saas' ? licenseQtyCell : ''}
          <td><input class="input" type="number" step="0.01" data-item-field="unit_price" value="${U.escapeAttr(computed.unit_price ?? '')}" /></td>
          ${commercialCells}
          <td><span data-item-display="line_total">${this.formatMoney(computed.line_total)}</span></td>
          <td>
            <button class="btn ghost sm" type="button" data-item-remove="${section}" data-item-index="${index}">Remove</button>
          </td>
        </tr>`;
      })
      .join('');
    [...tbody.querySelectorAll('tr[data-item-row]')].forEach(tr => {
      this.applyCatalogSelectionToRow(tr, section);
      this.syncAnnualDiscountLockForRow(tr);
    });
  },
  isInCheckBasicAnnualItem(item = {}) {
    const value = [
      item?.name,
      item?.item_name,
      item?.title,
      item?.description,
      item?.sku,
      item?.catalog_label,
      item?.product_name,
      item?.license,
      item?.license_name,
      item?.license_type
    ].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();

    return value.includes('incheck basic')
      || value.includes('incheck 360 basic')
      || value.includes('incheck360 basic');
  },
  getInCheckBasicAnnualRowCountFromItems(items = []) {
    return (Array.isArray(items) ? items : [])
      .filter(item =>
        String(item?.section || '').trim().toLowerCase() === 'annual_saas'
        && this.isInCheckBasicAnnualItem(item)
      ).length;
  },
  getInCheckBasicAnnualRowCountFromDom() {
    const tbody = E.proposalAnnualItemsTbody;
    return Array.from(tbody?.querySelectorAll?.('tr[data-item-row="annual_saas"]') || [])
      .filter(tr => {
        const itemName = tr.querySelector('[data-item-field="item_name"]')?.value ?? '';
        return this.isInCheckBasicAnnualItem({ item_name: itemName });
      }).length;
  },
  isCsHoursItem(item = {}) {
    const value = [
      item?.name,
      item?.item_name,
      item?.title,
      item?.description,
      item?.sku,
      item?.catalog_label,
      item?.product_name
    ].filter(Boolean).join(' ').toLowerCase();
    return value.includes('cs hours')
      || value.includes('cs hour')
      || value.includes('customer success hours')
      || value.includes('customer success')
      || value.includes('cs_hours')
      || value.includes('customer_success_hours');
  },
  isAnnualSaasUserItem(item = {}) {
    const value = [
      item?.license,
      item?.license_name,
      item?.license_type,
      item?.name,
      item?.item_name,
      item?.title,
      item?.description,
      item?.sku,
      item?.catalog_label,
      item?.product_name,
      item?.billing_unit,
      item?.unit_type
    ].filter(Boolean).join(' ').toLowerCase().trim();
    return value.includes('user(s)')
      || value.includes('users')
      || value.includes('user license')
      || value.includes('user subscription')
      || value.includes('annual users')
      || value.includes('saas users')
      || value.includes('additional users')
      || value === 'user'
      || value === 'user(s)';
  },
  updateAnnualSaasHeaderForProposal(hasUserBasedAnnualSaas) {
    const headerRow = E.proposalAnnualItemsTbody?.closest('table')?.querySelector('thead tr');
    if (!headerRow) return;
    const qtyHeader = '<th>Qty</th>';
    const hasQtyHeader = headerRow.innerHTML.includes(qtyHeader);
    if (hasUserBasedAnnualSaas && !hasQtyHeader) {
      headerRow.innerHTML = headerRow.innerHTML.replace('<th>License Price / Year</th>', `${qtyHeader}<th>License Price / Year</th>`);
    } else if (!hasUserBasedAnnualSaas && hasQtyHeader) {
      headerRow.innerHTML = headerRow.innerHTML.replace(qtyHeader, '');
    }
  },
  syncOneTimeFeeRowsWithAnnualCount(groups = {}) {
    const annualRows = Array.isArray(groups.annual_saas) ? groups.annual_saas : [];
    const inCheckBasicCount = this.getInCheckBasicAnnualRowCountFromItems(annualRows);
    const linkedQuantity = Math.max(1, inCheckBasicCount || 1);
    const shouldAutoLinkOneTimeFees = inCheckBasicCount > 0;
    let oneTimeRows = Array.isArray(groups.one_time_fee) ? groups.one_time_fee : [];
    oneTimeRows = oneTimeRows.map((row) => {
      const isCsHours = this.isCsHoursItem(row);
      if (!shouldAutoLinkOneTimeFees || isCsHours) return { ...row, section: 'one_time_fee' };
      return { ...row, section: 'one_time_fee', quantity: linkedQuantity };
    });
    if (shouldAutoLinkOneTimeFees && !oneTimeRows.length) {
      oneTimeRows = [{ section: 'one_time_fee', quantity: linkedQuantity, discount_percent: 0, unit_price: 0, line_total: 0 }];
    }
    return { ...groups, annual_saas: annualRows, one_time_fee: oneTimeRows };
  },
  refreshOneTimeFeeQuantityInputs() {
    const inCheckBasicCount = this.getInCheckBasicAnnualRowCountFromDom();
    const linkedQuantity = Math.max(1, inCheckBasicCount || 1);
    const shouldAutoLinkOneTimeFees = inCheckBasicCount > 0;
    Array.from(E.proposalOneTimeItemsTbody?.querySelectorAll?.('tr[data-item-row="one_time_fee"]') || []).forEach(tr => {
      const quantityInput = tr.querySelector('[data-item-field="quantity"]');
      const itemName = tr.querySelector('[data-item-field="item_name"]')?.value ?? '';
      const isCsHours = this.isCsHoursItem({ item_name: itemName });
      const rowQuantity = isCsHours
        ? Math.max(0, this.toNumberSafe(quantityInput?.value) || 1)
        : shouldAutoLinkOneTimeFees
          ? linkedQuantity
          : Math.max(1, this.toNumberSafe(quantityInput?.value) || 1);
      if (quantityInput) {
        quantityInput.value = String(rowQuantity);
        if (isCsHours) {
          quantityInput.readOnly = false;
          quantityInput.removeAttribute('readonly');
          quantityInput.removeAttribute('aria-readonly');
          quantityInput.removeAttribute('title');
          quantityInput.classList.remove('readonly-field', 'locked-field');
        } else if (shouldAutoLinkOneTimeFees) {
          quantityInput.readOnly = true;
          quantityInput.setAttribute('aria-readonly', 'true');
          quantityInput.title = 'Quantity is linked to the number of InCheck Basic Annual SaaS rows.';
          quantityInput.classList.add('readonly-field', 'locked-field');
        } else {
          quantityInput.readOnly = false;
          quantityInput.removeAttribute('readonly');
          quantityInput.removeAttribute('aria-readonly');
          quantityInput.removeAttribute('title');
          quantityInput.classList.remove('readonly-field', 'locked-field');
        }
      }
      const get = key => tr.querySelector(`[data-item-field="${key}"]`)?.value ?? '';
      const computed = this.computeCommercialRow({
        section: 'one_time_fee',
        unit_price: get('unit_price'),
        discount_percent: get('discount_percent'),
        quantity: rowQuantity
      });
      const lineTotalEl = tr.querySelector('[data-item-display="line_total"]');
      if (lineTotalEl) lineTotalEl.textContent = this.formatMoney(computed.line_total);
    });
  },
  renderProposalItems(items = []) {
    this.renderCatalogOptionLists();
    const groups = this.syncOneTimeFeeRowsWithAnnualCount(this.groupedItems(items));
    this.updateAnnualSaasHeaderForProposal((groups.annual_saas || []).some(item => this.isAnnualSaasUserItem(item)));
    this.renderSectionRows('annual_saas', groups.annual_saas);
    this.renderSectionRows('one_time_fee', groups.one_time_fee);
    this.refreshOneTimeFeeQuantityInputs();
    if (E.proposalCapabilityItemsTbody) E.proposalCapabilityItemsTbody.innerHTML = '';
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
    const inCheckBasicCount = this.getInCheckBasicAnnualRowCountFromDom();
    const linkedOneTimeQuantity = Math.max(1, inCheckBasicCount || 1);
    const shouldAutoLinkOneTimeFees = inCheckBasicCount > 0;
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
        const annualRowDraft = {
          item_name: get('item_name'),
          license: get('item_name'),
          quantity: get('quantity')
        };
        const isAnnualUserBased = section === 'annual_saas' && this.isAnnualSaasUserItem(annualRowDraft);
        const months = section === 'annual_saas'
          ? this.getAnnualSaasMonths({ quantity: get('quantity') })
          : 0;
        let quantity = section === 'annual_saas'
          ? months
          : Math.max(1, this.toNumberSafe(get('quantity')) || 1);
        const licenseQuantity = section === 'annual_saas' && isAnnualUserBased ? Math.max(1, Math.round(this.toNumberSafe(get('license_quantity')) || 1)) : 1;
        if (section === 'one_time_fee' && shouldAutoLinkOneTimeFees && !this.isCsHoursItem({ item_name: get('item_name') })) quantity = linkedOneTimeQuantity;
        let baseItem = {};
        try {
          baseItem = JSON.parse(tr.getAttribute('data-item-payload') || '{}');
        } catch (_error) {
          baseItem = {};
        }
        let discountPercent = this.normalizeDiscountPercentValue(get('discount_percent'));
        const hasSavedForcedDiscount = this.hasSavedForcedAnnualDiscount({
          ...baseItem,
          section,
          discount_percent: discountPercent
        });
        if (section === 'annual_saas' && quantity < 12 && !hasSavedForcedDiscount) discountPercent = 0;
        const serviceStartDate = this.normalizeDateInputValue(get('service_start_date'));
        const serviceEndDate = section === 'annual_saas'
          ? this.calculateServiceEndDate(serviceStartDate, quantity)
          : this.normalizeDateInputValue(get('service_end_date'));
        const itemName = String(get('item_name')).trim();
        const locationName = String(get('location_name')).trim();
        if (!itemName && !locationName && !unitPrice) return null;
        const computed = this.computeCommercialRow({ ...baseItem, section, unit_price: unitPrice, discount_percent: discountPercent, quantity, license_quantity: licenseQuantity });
        return {
          ...baseItem,
          section,
          line_no: idx + 1,
          catalog_item_id: String(get('catalog_item_id')).trim(),
          location_name: locationName,
          location_address: String(get('location_address')).trim(),
          item_name: itemName,
          description: String(get('description') || baseItem.description || baseItem.note || baseItem.catalog_note || '').trim(),
          unit_price: unitPrice,
          discount_percent: discountPercent,
          quantity,
          qty: section === 'annual_saas' ? quantity : (baseItem.qty ?? quantity),
          months: section === 'annual_saas' ? quantity : baseItem.months,
          license_months: section === 'annual_saas' ? quantity : baseItem.license_months,
          duration_months: section === 'annual_saas' ? quantity : baseItem.duration_months,
          license_quantity: licenseQuantity,
          service_start_date: serviceStartDate,
          service_end_date: serviceEndDate,
          discounted_unit_price: computed.discounted_unit_price,
          line_total: computed.line_total
        };
      })
      .filter(Boolean);
  },
  collectProposalItems() {
    return [
      ...this.collectSectionItems('annual_saas'),
      ...this.collectSectionItems('one_time_fee')
    ];
  },
  collectProposalFormData() {
    const existingRefNumber = String(E.proposalForm?.dataset.refNumber || '').trim();
    const selectedCompany = this.normalizeCompany({
      company_id: E.proposalForm?.dataset.companyId || '',
      company_name:
        E.proposalForm?.dataset.companyName ||
        E.proposalFormCustomerName?.value ||
        '',
      legal_name:
        E.proposalForm?.dataset.companyLegalName ||
        E.proposalFormCustomerName?.value ||
        E.proposalForm?.dataset.companyName ||
        '',
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
    const providerName = this.providerContactDefaults.name;
    const providerEmail = this.providerContactDefaults.email;
    const providerMobile = this.providerContactDefaults.mobile;
    const providerRole = provider.role || '';
    const providerUserName = provider.name || provider.email?.split('@')?.[0] || '';
    const contactPersonName = this.buildContactDisplayName(selectedContact);
    const pocPayload = this.getProposalPocPayload();
    const customerSignDate = String(E.proposalFormCustomerSignDate?.value || '').trim();
    const providerSignDate = String(E.proposalFormProviderSignDate?.value || '').trim();
    const currentStatus = this.normalizeProposalStatus(E.proposalFormStatus?.value) || 'draft';
    const customerSignDateValue = this.normalizeDateInputValue(customerSignDate);
    const providerSignDateValue = this.normalizeDateInputValue(providerSignDate);
    const autoAcceptedStatus = Boolean(customerSignDateValue && providerSignDateValue);
    const requestedStatus = autoAcceptedStatus ? 'accepted' : (currentStatus === 'accepted' ? 'sent' : currentStatus);
    const proposalDateValue = this.getProposalDateOrToday(E.proposalFormProposalDate?.value);
    const proposalValidUntilValue = this.getValidatedProposalValidUntil(proposalDateValue, E.proposalFormValidUntil?.value, { showToast: true });
    if (!proposalValidUntilValue) throw new Error('Invalid proposal validity period.');
    const acceptedBeforeExpiry = this.wasProposalAcceptedBeforeExpiry({
      ...(this.state.currentProposal || {}),
      status: requestedStatus,
      customer_sign_date: customerSignDateValue,
      provider_sign_date: providerSignDateValue,
      valid_until: proposalValidUntilValue,
      proposal_valid_until: proposalValidUntilValue
    });
    const isExpiredByValidity = proposalValidUntilValue && proposalValidUntilValue < this.todayDateString() && !acceptedBeforeExpiry;
    const resolvedCustomerName =
      U.getCustomerLegalName(selectedCompany, mapped) ||
      String(E.proposalFormCustomerName?.value || '').trim() ||
      String(selectedCompany.legal_name || selectedCompany.company_name || '').trim();
    const currentLockedSnapshot = this.isSignedOrAcceptedDocument(this.state.currentProposal || {});
    const contactSignatory = this.resolveContactSignatory(selectedContact);
    const customerSignatoryNameValue = currentLockedSnapshot
      ? String(this.state.currentProposal?.customer_signatory_name || this.state.currentProposal?.customer_signatory_Name || this.state.currentProposal?.customer_signature_name || '').trim()
      : (String(E.proposalFormCustomerSignatoryName?.value || '').trim() || contactSignatory.name);
    const customerSignatoryTitleValue = currentLockedSnapshot
      ? String(this.state.currentProposal?.customer_signatory_title || this.state.currentProposal?.customer_signature_title || '').trim()
      : (String(E.proposalFormCustomerSignatoryTitle?.value || '').trim() || contactSignatory.title);
    return {
      proposal_id: String(E.proposalFormProposalId?.value || '').trim(),
      ref_number: this.ensureRefNumber(existingRefNumber),
      proposal_title: String(E.proposalFormTitleField?.value || '').trim(),
      deal_id: this.resolveDealUuid(E.proposalFormDealId?.value || ''),
      proposal_date: proposalDateValue,
      proposal_valid_until: proposalValidUntilValue,
      valid_until: proposalValidUntilValue,
      status: acceptedBeforeExpiry ? 'accepted' : (isExpiredByValidity ? 'expired' : requestedStatus),
      currency: String(E.proposalFormCurrency?.value || '').trim(),
      customer_name: resolvedCustomerName,
      customer_legal_name: resolvedCustomerName,
      customer_address: mapped.customer_address || '',
      customer_contact_name: String(E.proposalFormCustomerContactName?.value || '').trim(),
      customer_contact_mobile: String(E.proposalFormCustomerContactMobile?.value || '').trim(),
      customer_contact_email: String(E.proposalFormCustomerContactEmail?.value || '').trim(),
      provider_contact_name: providerName,
      provider_contact_mobile: providerMobile,
      provider_contact_email: providerEmail,
      provider_signatory_user_id: provider.id || '',
      service_start_date: String(E.proposalFormServiceStartDate?.value || '').trim(),
      contract_term: String(E.proposalFormContractTerm?.value || '').trim(),
      account_number: String(E.proposalFormAccountNumber?.value || '').trim(),
      billing_frequency: 'Annual',
      payment_term: this.normalizePaymentTerm(E.proposalFormPaymentTerm?.value, 'Net 30'),
      payment_terms: this.normalizePaymentTerm(E.proposalFormPaymentTerm?.value, 'Net 30'),
      po_number: String(E.proposalFormPoNumber?.value || '').trim(),
      ...pocPayload,
      customer_signatory_name: customerSignatoryNameValue,
      customer_signatory_title: customerSignatoryTitleValue,
      customer_authorized_signatory_name: customerSignatoryNameValue,
      customer_authorized_signatory_title: customerSignatoryTitleValue,
      customer_signature_name: customerSignatoryNameValue,
      customer_signature_title: customerSignatoryTitleValue,
      customer_sign_date: customerSignDateValue || null,
      customer_signed_at: customerSignDateValue || null,
      provider_signatory_name: this.getCleanProviderSignatoryValue(
        E.proposalFormProviderSignatoryName?.value || mapped.provider_signatory_name || mapped.providerSignatoryName || providerUserName,
        mapped
      ) || providerUserName,
      provider_signatory_title: String(E.proposalFormProviderSignatoryTitle?.value || mapped.provider_signatory_title || mapped.providerSignatoryTitle || providerRole).trim(),
      provider_sign_date: providerSignDateValue,
      terms_conditions: String(E.proposalFormTerms?.value || '').trim(),
      internal_notes: String(E.proposalFormInternalNotes?.value || '').trim() || null,
      company_id: selectedCompany.company_id || '',
      company_name: selectedCompany.company_name || resolvedCustomerName || '',
      contact_id: selectedContact.contact_id || '',
      contact_name: contactPersonName || '',
      contact_email: String(selectedContact.email || '').trim(),
      contact_phone: String(selectedContact.mobile || selectedContact.phone || '').trim(),
      contact_mobile: String(selectedContact.mobile || '').trim()
    };
  },
  async validateAndRefreshProposalCustomer(proposal = {}) {
    const companyKey = String(proposal.company_id || '').trim();
    const selectedCompanyKey = String(this.state.selectedCompanyId || E.proposalForm?.dataset.companyId || '').trim();
    const sourceCompanyKey = String(E.proposalForm?.dataset.sourceCompanyId || '').trim();
    const sourceContactId = String(E.proposalForm?.dataset.sourceContactId || '').trim();
    const companyId = await this.resolveCompanyUuid(companyKey);
    console.log('[Save] resolvedCompanyId:', companyId);
    const selectedCompanyId = selectedCompanyKey ? await this.resolveCompanyUuid(selectedCompanyKey) : '';
    const sourceCompanyId = sourceCompanyKey ? await this.resolveCompanyUuid(sourceCompanyKey) : '';
    if (!companyId || (selectedCompanyKey && !selectedCompanyId) || (sourceCompanyKey && !sourceCompanyId)) throw new Error('Selected company could not be resolved. Please reselect the company.');
    if (selectedCompanyId && selectedCompanyId !== companyId) throw new Error('Selected company data mismatch. Please reselect the company.');
    if (sourceCompanyId && sourceCompanyId !== companyId) throw new Error('Source company does not match the selected company. Save blocked.');
    const loadedCompany = await this.loadCompanySafe(companyId);
    if (!loadedCompany || loadedCompany.id !== companyId) throw new Error('Selected company could not be resolved. Please reselect the company.');
    const contactKey = String(proposal.contact_id || '').trim();
    const contactId = contactKey ? await this.resolveContactUuid(contactKey) : '';
    console.log('[Save] resolvedContactId:', contactId);
    const resolvedSourceContactId = sourceContactId ? await this.resolveContactUuid(sourceContactId) : '';
    if (contactKey && !contactId) throw new Error('Selected contact could not be resolved. Please reselect the contact.');
    if (sourceContactId && !resolvedSourceContactId) throw new Error('Selected contact could not be resolved. Please reselect the contact.');
    if (resolvedSourceContactId && resolvedSourceContactId !== contactId) throw new Error('Source contact does not match the selected contact. Save blocked.');
    let loadedContact = null;
    if (contactId) {
      const selectedContactFromOptions = this.getContactOptionForCompany(contactId, companyId);
      loadedContact = selectedContactFromOptions || await this.loadContactByUuid(contactId);
      if (!loadedContact || String(loadedContact.id || loadedContact.contact_uuid || '').trim() !== contactId) throw new Error('Selected contact could not be resolved. Please reselect the contact.');
      console.log('[Save] contactOptions:', this.getContactOptionsForCompany(companyId));
      console.log('[Save] selectedContactFromOptions:', selectedContactFromOptions);
      if (!selectedContactFromOptions) {
        const belongs = await this.contactBelongsToCompany(contactId, companyId);
        console.log('[Save] contact belongs:', belongs);
        if (!belongs) {
          await this.clearSelectedContactForCompany(companyId);
          throw new Error('Selected contact does not belong to the selected company. Please reselect the contact.');
        }
      }
    }
    const legalName = String(loadedCompany.legal_name || loadedCompany.company_name || '').trim();
    proposal.company_id = loadedCompany.id;
    proposal.company_name = String(loadedCompany.company_name || legalName).trim();
    proposal.customer_name = legalName;
    proposal.customer_legal_name = legalName;
    proposal.customer_address = String(loadedCompany.address || '').trim();
    const signatory = this.resolveContactSignatory(loadedContact || {});
    proposal.customer_signatory_name = proposal.customer_signatory_name || signatory.name || '';
    proposal.customer_signatory_title = proposal.customer_signatory_title || signatory.title || '';
    proposal.customer_authorized_signatory_name = proposal.customer_signatory_name || '';
    proposal.customer_authorized_signatory_title = proposal.customer_signatory_title || '';
    if (loadedContact) {
      proposal.contact_id = loadedContact.id;
      proposal.contact_name = this.buildContactDisplayName(loadedContact);
      proposal.contact_email = String(loadedContact.email || '').trim();
      proposal.contact_phone = String(loadedContact.mobile || loadedContact.phone || '').trim();
      proposal.contact_mobile = String(loadedContact.mobile || '').trim();
      proposal.customer_contact_name = proposal.contact_name;
      proposal.customer_contact_email = proposal.contact_email;
      proposal.customer_contact_mobile = proposal.contact_phone;
    }
    this.state.selectedCompanyId = loadedCompany.id;
    this.state.selectedContactId = loadedContact?.id || '';
    this.state.loadedCompany = loadedCompany;
    this.state.loadedContact = loadedContact;
    console.log('[Proposal Create] proposal payload:', proposal);
    return proposal;
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
    if (!Permissions.canPreviewProposal()) {
      UI.toast('You do not have permission to view proposals.');
      return;
    }
    if (!id) return;
    if (this.state.openingProposalIds.has(id)) return;
    this.state.openingProposalIds.add(id);
    this.setTriggerBusy(trigger, true);
    console.time('proposal-open');
    const localSummary = this.state.rows.find(row => String(row.id || '').trim() === id);
    const localProposal = localSummary ? { ...this.emptyProposal(), ...localSummary, id } : { id };
    this.openProposalForm(
      localProposal,
      [],
      { readOnly: readOnly || this.isProposalAccepted(localProposal) || this.isProposalExpired(localProposal) }
    );
    this.setFormDetailLoading(true);
    try {
      const cached = this.getCachedDetail(id);
      if (cached) {
        this.openProposalForm(cached.proposal, cached.items, { readOnly: readOnly || this.isProposalAccepted(cached.proposal) || this.isProposalExpired(cached.proposal) });
        return;
      }
      const response = await this.getProposal(id);
      const { proposal, items } = this.extractProposalAndItems(response, id);
      this.setCachedDetail(id, proposal, items);
      if (String(E.proposalForm?.dataset.id || '').trim() === id) {
        this.openProposalForm(proposal, items, { readOnly: readOnly || this.isProposalAccepted(proposal) || this.isProposalExpired(proposal) });
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
    const incoming = proposal ? this.normalizeProposal(proposal) : this.emptyProposal();
    const mode = incoming.id ? 'edit' : 'create';
    const sourceCompanyId = mode === 'create' ? String(incoming.company_id || '').trim() : '';
    const sourceContactId = mode === 'create' ? String(incoming.contact_id || '').trim() : '';
    const source = mode === 'create' ? (incoming.deal_id ? 'deal' : incoming.lead_id ? 'lead' : incoming.client_id ? 'client' : sourceCompanyId ? 'company/contact' : 'direct') : 'edit';
    const base = mode === 'create' && sourceCompanyId ? {
      ...incoming,
      customer_name: '', customer_legal_name: '', customer_address: '', company_name: '',
      customer_contact_name: '', customer_contact_mobile: '', customer_contact_email: '',
      contact_name: '', contact_email: '', contact_phone: '', contact_mobile: ''
    } : incoming;
    const acceptedLocked = this.isProposalAccepted(base);
    const expiredLocked = this.isProposalExpired(base);
    const adminOverride = this.canUseAdminOverride();
    const effectiveReadOnly = adminOverride ? !!readOnly : (!!readOnly || acceptedLocked || expiredLocked);
    this.resetForm();
    this.state.formMode = mode;
    this.state.formReadOnly = effectiveReadOnly;
    this.state.currentProposalId = base.id || '';
    this.state.currentProposal = base;
    this.state.currentItems = Array.isArray(items) ? items.map(item => this.normalizeItem(item)) : [];

    E.proposalForm.dataset.mode = mode;
    E.proposalForm.dataset.id = base.id || '';
    E.proposalForm.dataset.source = source;
    E.proposalForm.dataset.sourceCompanyId = sourceCompanyId;
    E.proposalForm.dataset.sourceContactId = sourceContactId;
    E.proposalForm.dataset.refNumber = base.ref_number || '';
    E.proposalForm.dataset.signedDocumentPath = base.signed_document_path || '';
    E.proposalForm.dataset.signedDocumentName = base.signed_document_name || '';
    E.proposalForm.dataset.signedDocumentUploadedAt = base.signed_document_uploaded_at || '';
    E.proposalForm.dataset.signedDocumentUploadedBy = base.signed_document_uploaded_by || '';
    E.proposalForm.dataset.companyId = String(base.company_id || '').trim();
    E.proposalForm.dataset.companyName = String(
      base.company_name ||
      base.customer_legal_name ||
      base.customer_name ||
      ''
    ).trim();
    E.proposalForm.dataset.companyLegalName = String(
      base.customer_legal_name ||
      base.company_legal_name ||
      base.legal_name ||
      base.customer_name ||
      base.company_name ||
      ''
    ).trim();
    E.proposalForm.dataset.companyAddress = String(base.customer_address || '').trim();
    E.proposalForm.dataset.contactId = String(base.contact_id || '').trim();
    E.proposalForm.dataset.contactFirstName = String(base.first_name || base.firstName || '').trim();
    E.proposalForm.dataset.contactLastName = String(base.last_name || base.lastName || '').trim();
    E.proposalForm.dataset.contactName = this.buildContactDisplayName(base) || String(base.contact_name || base.customer_contact_name || '').trim();
    E.proposalForm.dataset.contactJobTitle = String(base.contact_job_title || base.job_title || base.jobTitle || base.position || base.customer_signatory_title || '').trim();
    E.proposalForm.dataset.contactEmail = String(base.contact_email || base.customer_contact_email || '').trim();
    E.proposalForm.dataset.contactPhone = String(base.contact_phone || '').trim();
    E.proposalForm.dataset.contactMobile = String(base.contact_mobile || base.customer_contact_mobile || '').trim();
    const hydratedBase = this.hydrateMappedProposalFields(
      base,
      {
        company_id: E.proposalForm.dataset.companyId,
        company_name: E.proposalForm.dataset.companyName,
        legal_name: E.proposalForm.dataset.companyLegalName,
        address: E.proposalForm.dataset.companyAddress
      },
      {
        contact_name: E.proposalForm.dataset.contactName,
        job_title: E.proposalForm.dataset.contactJobTitle,
        email: E.proposalForm.dataset.contactEmail,
        phone: E.proposalForm.dataset.contactPhone,
        mobile: E.proposalForm.dataset.contactMobile
      }
    );
    this.assignFormValues(hydratedBase);
    if (!effectiveReadOnly) this.applyProposalContactSignatory(hydratedBase);
    this.renderProposalItems(this.state.currentItems);
    this.ensureCatalogLoaded();

    if (E.proposalFormTitle) {
      if (effectiveReadOnly) E.proposalFormTitle.textContent = acceptedLocked ? 'View Locked Proposal' : expiredLocked ? 'View Expired Proposal' : 'View Proposal';
      else E.proposalFormTitle.textContent = mode === 'edit' ? 'Edit Proposal' : 'Create Proposal';
    }
    if (E.proposalFormDeleteBtn)
      E.proposalFormDeleteBtn.style.display = mode === 'edit' && !effectiveReadOnly && Permissions.canDeleteProposal() ? '' : 'none';
    if (E.proposalFormSaveBtn) {
      const canSave = mode === 'edit' ? Permissions.canUpdateProposal() : Permissions.canCreateProposal();
      E.proposalFormSaveBtn.style.display = !effectiveReadOnly && canSave ? '' : 'none';
    }

    this.syncProposalAcceptedLockMessage((acceptedLocked || expiredLocked) && !adminOverride);
    if (adminOverride && mode === 'edit' && (acceptedLocked || expiredLocked || readOnly)) this.applyAdminOverrideBanner();
    this.setFormReadOnly(effectiveReadOnly);

    E.proposalFormModal.style.display = 'flex';
    E.proposalFormModal.setAttribute('aria-hidden', 'false');
    if (mode === 'create' && sourceCompanyId) {
      if (!this.isUuid(sourceCompanyId) || (sourceContactId && !this.isUuid(sourceContactId))) {
        UI.toast('Proposal source is missing a valid company/contact UUID. Please reselect the company.');
      } else {
        this.hydrateCreateCustomerByUuid(sourceCompanyId, sourceContactId, source).catch(error => UI.toast(error?.message || 'Unable to load selected company.'));
      }
    }
    window.setTimeout(() => window.CrmCompanyContactSelectors?.initializeCompanyContactSelectorsForProposal?.(), 0);
    if (window.setAppHashRoute && window.buildRecordHashRoute) setAppHashRoute(buildRecordHashRoute('proposals', base || {}));
  },
  closeProposalForm() {
    if (!E.proposalFormModal) return;
    E.proposalFormModal.style.display = 'none';
    E.proposalFormModal.setAttribute('aria-hidden', 'true');
    if (window.setAppHashRoute) setAppHashRoute('#crm?tab=proposals');
  },
  setFormBusy(value) {
    const busy = !!value;
    if (E.proposalFormSaveBtn) E.proposalFormSaveBtn.disabled = busy;
    if (E.proposalFormDeleteBtn) E.proposalFormDeleteBtn.disabled = busy;
    if (E.proposalFormPreviewBtn) E.proposalFormPreviewBtn.disabled = busy;
    if (busy) {
      if (E.proposalSignedDocumentUploadBtn) E.proposalSignedDocumentUploadBtn.disabled = true;
      if (E.proposalSignedDocumentOpenBtn) E.proposalSignedDocumentOpenBtn.disabled = true;
    } else {
      this.refreshSignedDocumentUi(this.state.currentProposal || {});
      if (E.proposalSignedDocumentOpenBtn) E.proposalSignedDocumentOpenBtn.disabled = false;
    }
  },
  getSupabaseClient() {
    return window.SupabaseClient?.getClient?.() || window.supabaseClient || window.supabase || null;
  },
  getSignedDocumentProposalSnapshot(proposal = {}) {
    const source = proposal && typeof proposal === 'object' ? proposal : {};
    return {
      ...source,
      id: String(source.id || E.proposalForm?.dataset.id || this.state.currentProposalId || '').trim(),
      proposal_id: String(source.proposal_id || E.proposalFormProposalId?.value || '').trim(),
      status: this.normalizeProposalStatus(source.status || ''),
      signed_document_path: String(source.signed_document_path || E.proposalForm?.dataset.signedDocumentPath || '').trim(),
      signed_document_name: String(source.signed_document_name || E.proposalForm?.dataset.signedDocumentName || '').trim(),
      signed_document_uploaded_at: String(source.signed_document_uploaded_at || E.proposalForm?.dataset.signedDocumentUploadedAt || '').trim(),
      signed_document_uploaded_by: String(source.signed_document_uploaded_by || E.proposalForm?.dataset.signedDocumentUploadedBy || '').trim()
    };
  },
  refreshSignedDocumentUi(proposal = {}) {
    if (!E.proposalSignedDocumentSection) return;
    const snapshot = this.getSignedDocumentProposalSnapshot(proposal);
    const isPersisted = Boolean(snapshot.id);
    const isAccepted = this.isProposalAccepted(snapshot) && !this.isProposalExpired(snapshot);
    const hasDocument = Boolean(snapshot.signed_document_path);
    E.proposalSignedDocumentSection.style.display = isPersisted ? '' : 'none';
    if (E.proposalSignedDocumentUploadBtn) E.proposalSignedDocumentUploadBtn.disabled = !isPersisted || !isAccepted;
    if (E.proposalSignedDocumentFile) E.proposalSignedDocumentFile.disabled = !isPersisted || !isAccepted;
    if (E.proposalSignedDocumentOpenBtn) E.proposalSignedDocumentOpenBtn.style.display = hasDocument ? '' : 'none';
    if (E.proposalSignedDocumentState) {
      if (!isPersisted) {
        E.proposalSignedDocumentState.textContent = 'Save this proposal before uploading a signed document.';
      } else if (!isAccepted) {
        E.proposalSignedDocumentState.textContent = 'Signed documents can be uploaded only after the proposal status is Accepted.';
      } else if (hasDocument) {
        const uploaded = snapshot.signed_document_uploaded_at ? ` · Uploaded ${U.fmtTS(snapshot.signed_document_uploaded_at)}` : '';
        E.proposalSignedDocumentState.textContent = `${snapshot.signed_document_name || 'Signed document'}${uploaded}`;
      } else {
        E.proposalSignedDocumentState.textContent = 'Upload the accepted signed proposal document before converting to an agreement.';
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
  buildSignedDocumentPath(proposal = {}, file = {}) {
    const proposalBusinessId = String(proposal.proposal_id || E.proposalFormProposalId?.value || '').trim();
    if (!proposalBusinessId) throw new Error('Proposal ID is required to upload the signed document.');
    const extension = this.getFileExtension(file.name || 'pdf');
    return `proposals/${proposalBusinessId}/signed-proposal-${this.getSignedDocumentTimestamp()}.${extension}`;
  },
  async getCurrentUserIdForSignedDocument(client = null) {
    const localUser = this.getSignedInUserForProposal();
    if (localUser?.id) return String(localUser.id).trim();
    const authClient = client || this.getSupabaseClient();
    const { data } = await authClient?.auth?.getUser?.() || {};
    return String(data?.user?.id || '').trim();
  },
  async uploadSignedProposalDocument() {
    const proposal = this.getSignedDocumentProposalSnapshot(this.state.currentProposal || {});
    if (!proposal.id) { UI.toast('Save this proposal before uploading a signed document.'); return; }
    if (!this.isProposalAccepted(proposal) || this.isProposalExpired(proposal)) { UI.toast('Upload the signed document only after the proposal status is accepted and before it expires.'); return; }
    const file = E.proposalSignedDocumentFile?.files?.[0];
    if (!file) { UI.toast('Choose a signed proposal document to upload.'); return; }
    const client = this.getSupabaseClient();
    if (!client?.storage?.from || !client?.from) { UI.toast('Supabase Storage is not available.'); return; }
    const currentUserId = await this.getCurrentUserIdForSignedDocument(client);
    if (!currentUserId) { UI.toast('Unable to identify the current user. Please log in again.'); return; }
    this.setFormBusy(true);
    try {
      const { data: latestProposal, error: latestError } = await client
        .from('proposals')
        .select('*')
        .eq('proposal_id', proposal.proposal_id)
        .maybeSingle();
      if (latestError) throw latestError;
      if (!this.isProposalAccepted(latestProposal || proposal) || this.isProposalExpired(latestProposal || proposal)) {
        UI.toast('Upload the signed document only after the proposal status is accepted and before it expires.');
        return;
      }
      const path = this.buildSignedDocumentPath(latestProposal || proposal, file);
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
      const { data, error: updateError } = await client
        .from('proposals')
        .update(updates)
        .eq('proposal_id', proposal.proposal_id)
        .select('*')
        .maybeSingle();
      if (updateError) throw updateError;
      const updatedProposal = this.normalizeProposal({ ...(this.state.currentProposal || {}), ...(data || {}), ...updates });
      this.state.currentProposal = updatedProposal;
      if (E.proposalForm) {
        E.proposalForm.dataset.signedDocumentPath = updates.signed_document_path;
        E.proposalForm.dataset.signedDocumentName = updates.signed_document_name;
        E.proposalForm.dataset.signedDocumentUploadedAt = updates.signed_document_uploaded_at;
        E.proposalForm.dataset.signedDocumentUploadedBy = updates.signed_document_uploaded_by;
      }
      this.upsertLocalRow(updatedProposal);
      this.setCachedDetail(updatedProposal.id || proposal.id, updatedProposal, this.state.currentItems);
      if (E.proposalSignedDocumentFile) E.proposalSignedDocumentFile.value = '';
      this.refreshSignedDocumentUi(updatedProposal);
      UI.toast('Signed proposal document uploaded.');
    } catch (error) {
      UI.toast('Unable to upload signed proposal document: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  async openSignedProposalDocument() {
    const proposal = this.getSignedDocumentProposalSnapshot(this.state.currentProposal || {});
    if (!proposal.signed_document_path) { UI.toast('No signed proposal document has been uploaded.'); return; }
    const client = this.getSupabaseClient();
    if (!client?.storage?.from) { UI.toast('Supabase Storage is not available.'); return; }
    this.setFormBusy(true);
    try {
      const { data, error } = await client.storage
        .from(this.signedDocumentBucket)
        .createSignedUrl(proposal.signed_document_path, 60 * 10);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Supabase did not return a signed URL.');
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch (error) {
      UI.toast('Unable to open signed proposal document: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },

  syncAnnualDiscountLockForRow(tr) {
    if (!tr || String(tr.getAttribute('data-item-row') || '').trim() !== 'annual_saas') return;
    const qty = this.toNumberSafe(tr.querySelector('[data-item-field="quantity"]')?.value || 0);
    const discountInput = tr.querySelector('[data-item-field="discount_percent"]');
    if (!discountInput) return;
    let payload = {};
    try {
      payload = JSON.parse(tr.getAttribute('data-item-payload') || '{}');
    } catch (_error) {
      payload = {};
    }
    const hasSavedForcedDiscount = this.hasSavedForcedAnnualDiscount({
      ...payload,
      section: 'annual_saas',
      discount_percent: discountInput.value
    });
    if (qty < 12 && !hasSavedForcedDiscount) {
      discountInput.value = '0';
      discountInput.readOnly = true;
      discountInput.setAttribute('aria-readonly', 'true');
      discountInput.title = 'Discount is only available when License / Month is 12 or higher.';
      discountInput.classList.add('readonly-field');
    } else {
      discountInput.readOnly = false;
      discountInput.removeAttribute('readonly');
      discountInput.removeAttribute('aria-readonly');
      discountInput.removeAttribute('title');
      discountInput.classList.remove('readonly-field');
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
      const hasSavedForcedDiscount = this.hasSavedForcedAnnualDiscount(item);
      return unit < 0 || qty <= 0 || qty > 12 || discount < 0 || discount > 100 || (qty < 12 && discount > 0 && !hasSavedForcedDiscount) || !start || !end || end <= start;
    });
    if (hasInvalidAnnual) {
      UI.toast('Please complete the annual SaaS service dates and license months. Discount must be 0% when License / Month is below 12.');
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
    this.syncValidUntilFromProposalDate({ forceDefault: true });
    const proposal = this.collectProposalFormData();
    try {
      await this.validateAndRefreshProposalCustomer(proposal);
      console.log('[SAVE CHECK] module:', 'proposal');
      console.log('[SAVE CHECK] form.company_id:', proposal.company_id);
      console.log('[SAVE CHECK] selectedCompanyId:', this.state.selectedCompanyId);
      console.log('[SAVE CHECK] form.contact_id:', proposal.contact_id);
      console.log('[SAVE CHECK] final payload:', proposal);
    } catch (error) {
      UI.toast(error?.message || 'Selected company data mismatch. Please reselect the company.');
      return;
    }
    if (mode === 'edit' && this.isProposalExpired({ ...(this.state.currentProposal || {}), ...proposal }) && !this.canUseAdminOverride()) {
      UI.toast('This proposal has expired and cannot be edited.');
      return;
    }
    const sourceDealId = String(E.proposalFormDealId?.value || '').trim();
    const isDirectCreate = mode !== 'edit' && !sourceDealId;
    if (isDirectCreate && !String(proposal.company_id || '').trim()) {
      UI.toast('Please select a company.');
      return;
    }
    if (isDirectCreate && !String(proposal.contact_id || '').trim()) {
      UI.toast('Please select a contact.');
      return;
    }
    if (mode !== 'edit') {
      proposal.proposal_id = this.ensureProposalId(proposal.proposal_id);
      if (!proposal.proposal_id) {
        UI.toast('Unable to generate proposal ID. Please retry.');
        return;
      }
      if (E.proposalFormProposalId) E.proposalFormProposalId.value = proposal.proposal_id;
    }
    if (!this.validatePocDetails(proposal)) return;
    const items = this.collectProposalItems();
    if (!this.canUseAdminOverride() && !this.validateCommercialItems(items)) return;
    let currentRecord = {};
    let latestItems = this.state.currentItems;
    if (mode === 'edit' && proposalId) {
      try {
        const latestResponse = await this.getProposal(proposalId);
        const latest = this.extractProposalAndItems(latestResponse, proposalId);
        currentRecord = latest?.proposal || {};
        latestItems = Array.isArray(latest?.items) ? latest.items : latestItems;
        if (latest?.proposal) {
          this.upsertLocalRow(latest.proposal);
          this.setCachedDetail(latest.proposal.id || proposalId, latest.proposal, latest.items);
          this.state.currentProposal = latest.proposal;
        }
      } catch (error) {
        UI.toast('Unable to verify proposal status before saving: ' + (error?.message || 'Unknown error'));
        return;
      }
      if (this.isProposalAccepted(currentRecord) && !this.canUseAdminOverride()) {
        UI.toast('Accepted proposals are locked and cannot be edited.');
        this.openProposalForm(currentRecord, latestItems, { readOnly: true });
        return;
      }
    }
    if (!currentRecord?.id) {
      const cachedDetail = this.getCachedDetail(proposalId);
      currentRecord = cachedDetail?.proposal || this.state.rows.find(row => String(row.id || '') === proposalId) || {};
    }
    const requestedDiscount = typeof getProposalCurrentDiscountPercent === 'function'
      ? getProposalCurrentDiscountPercent({ ...currentRecord, ...proposal }, items)
      : items.reduce((max, item) => Math.max(max, this.toNumberSafe(item.discount_percent)), 0);
    const currentStatus = this.normalizeProposalStatus(currentRecord?.status);
    const requestedStatus = this.normalizeProposalStatus(proposal.status);
    if (currentStatus === 'pending_approval' && requestedStatus && requestedStatus !== 'pending_approval' && !this.canUseAdminOverride()) {
      UI.toast('This proposal is already pending approval. Approval must be approved or rejected before changing to another status.');
      if (E.proposalFormStatus) E.proposalFormStatus.value = 'pending_approval';
      return;
    }
    console.log('[Proposal workflow current baseline]', {
      proposalId,
      currentStatus,
      requestedStatus,
      approvedAnnual: currentRecord?.approved_annual_saas_discount_percent,
      approvedOneTime: currentRecord?.approved_one_time_fee_discount_percent,
      approvedGeneric: currentRecord?.approved_discount_percent,
      approvalStatus: currentRecord?.discount_approval_status
    });
    const shouldValidateWorkflow = !this.canUseAdminOverride() && this.shouldValidateWorkflowBeforeSave({
      proposalId,
      currentStatus,
      requestedStatus,
      currentRecord,
      proposal,
      items
    });
    if (shouldValidateWorkflow) {
      let workflowCheck = null;
      try {
        const workflowEngine = window.WorkflowEngine;
        if (!workflowEngine || typeof workflowEngine.enforceBeforeSave !== 'function') {
          workflowCheck = { allowed: true, unavailable: true, fallback: true, reason: 'Workflow helper is unavailable; continuing proposal save fallback.' };
        } else {
          workflowCheck = await workflowEngine.enforceBeforeSave('proposals', currentRecord, {
            id: proposalId,
            current_status: currentStatus,
            requested_status: requestedStatus,
            discount_percent: requestedDiscount,
            requested_changes: { proposal, items }
          });
        }
      } catch (error) {
        if (this.isWorkflowValidationUnavailable(error, true)) {
          console.warn('[Proposal] Workflow validation unavailable; continuing proposal save fallback.', error);
          workflowCheck = { allowed: true, unavailable: true, fallback: true, reason: 'Workflow validation unavailable; continuing proposal save fallback.' };
        } else {
          throw error;
        }
      }
      if (this.isWorkflowValidationUnavailable(workflowCheck)) {
        console.warn('[Proposal] Workflow validation unavailable; continuing proposal save fallback.', workflowCheck);
        workflowCheck = { ...(workflowCheck || {}), allowed: true, unavailable: true, fallback: true };
      }
      try { console.info('[workflow] final decision', workflowCheck); } catch {}
      if (workflowCheck?.allowed === true) {
        if (workflowCheck.discountApprovalUpdates && typeof workflowCheck.discountApprovalUpdates === 'object') {
          Object.entries(workflowCheck.discountApprovalUpdates).forEach(([key, value]) => {
            if (value !== null && value !== undefined) proposal[key] = value;
          });
        }
      } else if (workflowCheck?.pendingApproval === true && workflowCheck?.approvalCreated === true) {
        const pendingUpdates = {
          status: 'pending_approval',
          discount_approval_status: 'pending',
          approval_required_reason: workflowCheck?.reason || 'Proposal sent for approval.',
          last_discount_approval_request_id: workflowCheck?.approvalId || undefined
        };
        const pendingResponse = await Api.requestWithSession('proposals', 'update', { id: proposalId, updates: pendingUpdates });
        const parsedPending = this.extractProposalAndItems(pendingResponse, proposalId);
        const pendingProposal = parsedPending?.proposal && typeof parsedPending.proposal === 'object'
          ? parsedPending.proposal
          : { ...currentRecord, ...pendingUpdates };
        if (pendingProposal) {
          this.upsertLocalRow(pendingProposal);
          this.state.currentProposal = pendingProposal;
          this.setCachedDetail(pendingProposal.id || proposalId, pendingProposal, parsedPending?.items || latestItems || items);
        }
        if (E.proposalFormStatus) E.proposalFormStatus.value = 'pending_approval';
        this.refreshSignedDocumentUi?.(pendingProposal);
        UI.toast(String(workflowCheck?.reason || '').toLowerCase().includes('already pending') ? 'This proposal is already pending approval.' : 'Proposal sent for approval.');
        await this.loadAndRefresh({ force: true });
        return;
      } else if (workflowCheck?.pendingApproval === true && workflowCheck?.approvalCreated !== true) {
        UI.toast('Approval is required, but the approval request could not be created yet. Please retry.');
        return;
      } else {
        UI.toast(window.WorkflowEngine?.composeDeniedMessage?.(workflowCheck, 'Proposal save blocked.') || workflowCheck?.reason || 'Proposal save blocked by workflow.');
        return;
      }
    }

    if (!proposal.proposal_title) {
      UI.toast('Proposal title is required.');
      return;
    }

    console.log('[Proposal save payload customer fields]', {
      customer_name: proposal.customer_name,
      customer_legal_name: proposal.customer_legal_name,
      company_id: proposal.company_id,
      company_name: proposal.company_name,
      customer_sign_date: proposal.customer_sign_date
    });

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

      let parsed = this.extractProposalAndItems(response, proposalId);
      const responseSavedUuid = String(parsed?.proposal?.id || proposalId || '').trim();
      if (responseSavedUuid) {
        parsed = this.extractProposalAndItems(await this.getProposal(responseSavedUuid), responseSavedUuid);
      }
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
      if (mode === 'edit' && this.canUseAdminOverride()) this.logAdminOverride('proposal_update_override', currentRecord || null, savedProposal);
      if (parsed?.proposal) {
        this.upsertLocalRow(parsed.proposal);
        this.setCachedDetail(parsed.proposal.id || proposalId, parsed.proposal, parsed.items);
        if (mode !== 'edit' && parsed.proposal.deal_id) {
          this.markDealAsConvertedToProposal(parsed.proposal.deal_id, parsed.proposal.proposal_id);
        }
      }
      UI.toast(mode === 'edit' ? 'Proposal updated.' : 'Proposal created.');
      if (parsed?.proposal) this.openProposalForm(parsed.proposal, parsed.items, { readOnly: !this.canUseAdminOverride() && (this.isProposalAccepted(parsed.proposal) || this.isProposalExpired(parsed.proposal)) });
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
      const companyKey = String(proposal?.company_id || '').trim();
      const contactKey = this.getProposalContactId(proposal);
      let loadedCompany = null;
      let loadedContact = null;
      let resolvedCompanyId = '';
      let resolvedContactId = '';

      if (companyKey) {
        resolvedCompanyId = await this.resolveCompanyUuid(companyKey) || '';
        loadedCompany = resolvedCompanyId ? await this.loadCompanySafe(resolvedCompanyId) : null;
        if (!loadedCompany) console.warn('[Proposal Preview] Company could not be resolved; using saved proposal snapshot.', { proposalId, companyKey });
      } else {
        console.warn('[Proposal Preview] Proposal has no company_id; using saved proposal snapshot.', { proposalId });
      }

      if (contactKey) {
        resolvedContactId = await this.resolveContactUuid(contactKey) || '';
        loadedContact = resolvedContactId ? await this.loadContactByUuid(resolvedContactId) : null;
        if (!loadedContact) console.warn('[Proposal Preview] Contact could not be resolved; using saved proposal snapshot.', { proposalId, contactKey });
      }

      if (loadedCompany && loadedContact) {
        const belongs = await this.contactBelongsToCompany(loadedContact.id, loadedCompany.id);
        if (!belongs) {
          console.warn('[Proposal Preview] Contact no longer belongs to proposal company; using saved proposal snapshot where available.', { proposalId, companyKey, contactKey });
          loadedContact = null;
        }
      }

      const previewProposal = this.buildSafePreviewProposal(proposal, loadedCompany, loadedContact);
      const html = this.buildProposalDocumentHtml(previewProposal, items, { mode: 'preview' });
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
    if (String(deal.stage || '').trim() !== 'Qualified') {
      UI.toast('Deal must be qualified before converting to proposal.');
      return;
    }
    if (!String(deal.next_follow_up_at || deal.nextFollowUpAt || deal.next_follow_up_date || deal.nextFollowUpDate || '').trim()) {
      UI.toast('Next follow-up is required for every deal change.');
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
  shouldValidateWorkflowBeforeSave({ proposalId = '', currentStatus = '', requestedStatus = '', currentRecord = {}, proposal = {}, items = [] } = {}) {
    const fromStatus = String(currentStatus || '').trim().toLowerCase();
    const toStatus = String(requestedStatus || '').trim().toLowerCase();
    if (!toStatus) return false;
    if (toStatus === 'draft' && (!fromStatus || fromStatus === 'draft')) return false;
    if (fromStatus === toStatus) {
      // Same-stage proposal edits must still pass discount workflow validation.
      // If approved baseline is 15%, saving 14% is allowed, but saving >15% creates a new approval.
      if (toStatus && toStatus !== 'draft') return true;
      return false;
    }
    return true;
  },
  addRow(section) {
    const groups = this.groupedItems(this.collectProposalItems());
    if (section === 'capability') return;
    groups[section].push({
      section,
      location_name: '',
      location_address: '',
      item_name: '',
      unit_price: 0,
      discount_percent: 0,
      quantity: section === 'annual_saas' ? 12 : 1,
      service_start_date: section === 'annual_saas' ? this.getDefaultAnnualServiceStartDate() : '',
      service_end_date: section === 'annual_saas' ? this.calculateServiceEndDate(this.getDefaultAnnualServiceStartDate(), 12) : '',
      discounted_unit_price: 0,
      line_total: 0
    });
    this.renderProposalItems([...groups.annual_saas, ...groups.one_time_fee]);
  },
  removeRow(section, index) {
    const groups = this.groupedItems(this.collectProposalItems());
    if (!groups[section]) return;
    groups[section] = groups[section].filter((_, idx) => idx !== index);
    this.renderProposalItems([...groups.annual_saas, ...groups.one_time_fee]);
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

    if (E.proposalFormProposalDate) {
      const syncProposalDateDependents = () => {
        this.syncValidUntilFromProposalDate();
        this.syncEmptyAnnualServiceStartDates();
      };
      E.proposalFormProposalDate.addEventListener('change', syncProposalDateDependents);
      E.proposalFormProposalDate.addEventListener('input', syncProposalDateDependents);
    }
    if (E.proposalFormValidUntil) {
      E.proposalFormValidUntil.addEventListener('change', () => this.syncValidUntilManualEdit());
      E.proposalFormValidUntil.addEventListener('input', () => this.syncValidUntilManualEdit());
      E.proposalFormValidUntil.readOnly = false;
      E.proposalFormValidUntil.classList.remove('readonly-field', 'locked-field');
      E.proposalFormValidUntil.removeAttribute('aria-readonly');
      E.proposalFormValidUntil.title = 'Defaults to 14 days after proposal date; extendable up to 30 days.';
    }
    if (E.proposalFormStatus) {
      E.proposalFormStatus.addEventListener('change', () => this.refreshSignedDocumentUi(this.state.currentProposal || {}));
    }
    if (E.proposalResetTermsBtn) {
      E.proposalResetTermsBtn.addEventListener('click', () => this.resetProposalTermsToDefault());
    }
    [E.proposalFormCustomerSignDate, E.proposalFormProviderSignDate].forEach(el => {
      if (!el) return;
      el.addEventListener('input', () => this.syncProposalStatusFromSignDates());
      el.addEventListener('change', () => this.syncProposalStatusFromSignDates());
    });
    this.lockPocServiceEndDateInput();
    if (E.proposalFormIsPoc) {
      E.proposalFormIsPoc.addEventListener('change', () => {
        this.syncPocDetailsVisibility();
        this.syncPocServiceEndDate();
      });
    }
    [E.proposalFormPocServiceStartDate, E.proposalFormPocLicenseMonths].forEach(el => {
      if (!el) return;
      el.addEventListener('input', () => this.syncPocServiceEndDate());
      el.addEventListener('change', () => this.syncPocServiceEndDate());
    });

    if (E.proposalsRefreshBtn) {
      E.proposalsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    }
    if (E.proposalsExportCsvBtn) {
      E.proposalsExportCsvBtn.addEventListener('click', () => this.exportProposalsCsv());
    }
    if (E.proposalsCreateBtn) {
      E.proposalsCreateBtn.addEventListener('click', () => {
        if (!Permissions.canCreateProposal()) return UI.toast('You do not have permission to create proposals.');
        this.openProposalForm();
      });
    }

    if (E.proposalsTbody) {
      E.proposalsTbody.addEventListener('click', event => {
        const getActionValue = action => {
          const actionEl = event.target?.closest?.(`[${action}]`);
          return String(actionEl?.getAttribute(action) || '').trim();
        };
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
              if (section === 'annual_saas' && (field === 'quantity' || field === 'service_start_date')) {
                const endInput = tr.querySelector('[data-item-field="service_end_date"]');
                if (endInput) endInput.value = this.calculateServiceEndDate(get('service_start_date'), get('quantity'));
              }
              if (section === 'annual_saas') {
                if (field === 'item_name') {
                  this.renderProposalItems([...this.collectSectionItems('annual_saas'), ...this.collectSectionItems('one_time_fee')]);
                  return;
                }
                this.syncAnnualDiscountLockForRow(tr);
                this.refreshOneTimeFeeQuantityInputs();
              } else if (section === 'one_time_fee') {
                this.refreshOneTimeFeeQuantityInputs();
              }
              const computed = this.computeCommercialRow({
                section,
                item_name: get('item_name'),
                license: get('item_name'),
                unit_price: get('unit_price'),
                discount_percent: get('discount_percent'),
                quantity: section === 'one_time_fee' && !this.isCsHoursItem({ item_name: get('item_name') })
                  ? Math.max(1, this.getInCheckBasicAnnualRowCountFromDom() || 1)
                  : get('quantity'),
                license_quantity: get('license_quantity')
              });
              const lineTotalEl = tr.querySelector('[data-item-display="line_total"]');
              if (lineTotalEl) lineTotalEl.textContent = this.formatMoney(computed.line_total);
            }
          }
          this.renderTotalsPreview();
        }
      });
      E.proposalForm.addEventListener('change', event => {
        const field = event.target?.getAttribute('data-item-field');
        if (!field) return;
        const tr = event.target.closest('tr[data-item-row]');
        const section = tr?.getAttribute('data-item-row');
        if (!tr || !section || section === 'capability') return;
        if (field === 'item_name') this.applyCatalogSelectionToRow(tr, section, { fromUserInput: true });
        const get = key => tr.querySelector(`[data-item-field="${key}"]`)?.value ?? '';
        if (section === 'annual_saas' && (field === 'quantity' || field === 'service_start_date')) {
          const endInput = tr.querySelector('[data-item-field="service_end_date"]');
          if (endInput) endInput.value = this.calculateServiceEndDate(get('service_start_date'), get('quantity'));
        }
        if (section === 'annual_saas') {
          if (field === 'item_name') {
            this.renderProposalItems([...this.collectSectionItems('annual_saas'), ...this.collectSectionItems('one_time_fee')]);
            return;
          }
          this.syncAnnualDiscountLockForRow(tr);
          this.refreshOneTimeFeeQuantityInputs();
        } else if (section === 'one_time_fee') {
          this.refreshOneTimeFeeQuantityInputs();
        }
        const computed = this.computeCommercialRow({
          section,
          item_name: get('item_name'),
          license: get('item_name'),
          unit_price: get('unit_price'),
          discount_percent: get('discount_percent'),
          quantity: section === 'one_time_fee' && !this.isCsHoursItem({ item_name: get('item_name') })
            ? Math.max(1, this.getInCheckBasicAnnualRowCountFromDom() || 1)
            : get('quantity'),
          license_quantity: get('license_quantity')
        });
        const lineTotalEl = tr.querySelector('[data-item-display="line_total"]');
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
    if (E.proposalSignedDocumentUploadBtn) {
      E.proposalSignedDocumentUploadBtn.addEventListener('click', () => this.uploadSignedProposalDocument());
    }
    if (E.proposalSignedDocumentOpenBtn) {
      E.proposalSignedDocumentOpenBtn.addEventListener('click', () => this.openSignedProposalDocument());
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
