const Agreements = {
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
    'agreement_length',
    'account_number',
    'billing_frequency',
    'payment_term',
    'po_number',
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
    'customer_signatory_name',
    'customer_signatory_title',
    'provider_signatory_name_primary',
    'provider_signatory_title_primary',
    'provider_signatory_name_secondary',
    'provider_signatory_title_secondary',
    'provider_sign_date',
    'customer_sign_date',
    'generated_by',
    'notes'
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
    currentAgreementId: '',
    saveInFlight: false,
    detailCacheById: {},
    detailCacheTtlMs: 90 * 1000,
    openingAgreementIds: new Set(),
    rowActionInFlight: new Set()
  },
  toNumberSafe(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  },
  normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
  },
  hasConflictError(error, conflictCode = '') {
    const message = String(error?.message || '').toUpperCase();
    const code = String(conflictCode || '').trim().toUpperCase();
    return message.includes('HTTP 409') && (!code || message.includes(code));
  },
  markProposalAsConvertedToAgreement(proposalId, agreementId = '') {
    const id = String(proposalId || '').trim();
    if (!id || !window.Proposals?.state?.rows) return;
    const proposal = window.Proposals.state.rows.find(row => String(row?.proposal_id || '').trim() === id);
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
  normalizeAgreement(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const normalized = {};
    this.agreementFields.forEach(field => {
      const camel = field.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
      const value = source[field] ?? source[camel] ?? '';
      normalized[field] = typeof value === 'string' ? value.trim() : value;
    });
    normalized.agreement_id = String(normalized.agreement_id || source.id || '').trim();
    normalized.agreement_number = String(normalized.agreement_number || '').trim();
    normalized.agreement_title = String(normalized.agreement_title || '').trim();
    normalized.customer_name = String(normalized.customer_name || '').trim();
    normalized.status = String(normalized.status || '').trim() || 'Draft';
    normalized.currency = String(normalized.currency || '').trim();
    return normalized;
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
      service_start_date: String(pick(source.service_start_date, source.serviceStartDate)).trim(),
      service_end_date: String(pick(source.service_end_date, source.serviceEndDate)).trim(),
      item_name: String(pick(source.item_name, source.itemName, source.name)).trim(),
      unit_price: this.toNumberSafe(pick(source.unit_price, source.unitPrice)),
      discount_percent: this.toNumberSafe(pick(source.discount_percent, source.discountPercent)),
      discounted_unit_price: this.toNumberSafe(pick(source.discounted_unit_price, source.discountedUnitPrice)),
      quantity: this.toNumberSafe(pick(source.quantity, source.qty)),
      line_total: this.toNumberSafe(pick(source.line_total, source.lineTotal)),
      capability_name: String(pick(source.capability_name, source.capabilityName)).trim(),
      capability_value: String(pick(source.capability_value, source.capabilityValue)).trim(),
      notes: String(pick(source.notes)).trim(),
      updated_at: String(pick(source.updated_at, source.updatedAt)).trim()
    };
    if (section === 'annual_saas' || section === 'one_time_fee') {
      const discountRatio = normalized.discount_percent > 1 ? normalized.discount_percent / 100 : normalized.discount_percent;
      if (!normalized.discounted_unit_price) normalized.discounted_unit_price = normalized.unit_price * (1 - discountRatio);
      if (!normalized.line_total) normalized.line_total = normalized.discounted_unit_price * (normalized.quantity || 0);
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
      agreement_date: '', effective_date: '', service_start_date: '', agreement_length: '', account_number: '',
      billing_frequency: '', payment_term: '', po_number: '', currency: '', customer_name: '',
      customer_legal_name: '', customer_address: '', customer_contact_name: '', customer_contact_mobile: '',
      customer_contact_email: '', provider_name: '', provider_legal_name: '', provider_address: '',
      provider_contact_name: '', provider_contact_mobile: '', provider_contact_email: '', status: 'Draft',
      terms_conditions: '', customer_signatory_name: '', customer_signatory_title: '',
      provider_signatory_name_primary: '', provider_signatory_title_primary: '',
      provider_signatory_name_secondary: '', provider_signatory_title_secondary: '', provider_sign_date: '',
      customer_sign_date: '', generated_by: '', notes: ''
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
    const idx = this.state.rows.findIndex(item => String(item.agreement_id || '') === String(normalized.agreement_id || ''));
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  removeLocalRow(id) {
    this.state.rows = this.state.rows.filter(item => String(item.agreement_id || '') !== String(id || ''));
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
  async createAgreementFromProposal(proposalId) { return Api.createAgreementFromProposal(proposalId); },
  async generateAgreementHtml(agreementId) { return Api.generateAgreementHtml(agreementId); },
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
      const response = await Api.postAuthenticated('agreements', 'request_technical_admin', { agreement_id: id });
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
    return this.normalizeText(status).includes('signed');
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
    return {
      customer_name: String(agreement.customer_name || '').trim(),
      customer_legal_name: String(agreement.customer_legal_name || '').trim(),
      customer_contact_name: String(agreement.customer_contact_name || '').trim(),
      customer_contact_email: String(agreement.customer_contact_email || '').trim(),
      customer_contact_mobile: String(agreement.customer_contact_mobile || '').trim(),
      company_address: String(agreement.customer_address || '').trim(),
      account_status: 'Signed',
      contract_term: String(agreement.agreement_length || '').trim(),
      billing_frequency: String(agreement.billing_frequency || '').trim(),
      payment_terms: String(agreement.payment_term || '').trim(),
      currency: String(agreement.currency || '').trim(),
      latest_grand_total: this.toNumberSafe(agreement.grand_total),
      total_signed_value: this.toNumberSafe(agreement.grand_total),
      signed_agreements_count: 1,
      active_agreements_count: 1,
      latest_signed_date: String(agreement.customer_sign_date || agreement.agreement_date || '').trim(),
      latest_agreement_id: String(agreementId || agreement.agreement_id || '').trim(),
      latest_proposal_id: String(agreement.proposal_id || '').trim(),
      latest_deal_id: String(agreement.deal_id || '').trim(),
      latest_lead_id: String(agreement.lead_id || '').trim()
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
    const sameAgreement = this.isSameAgreement(existing, signedClient);
    const existingFirstSigned = String(existing.first_signed_date || '').trim();
    const incomingLatestSigned = String(signedClient.latest_signed_date || '').trim();
    const existingFirstDate = this.parseDateValue(existingFirstSigned);
    const incomingLatestDate = this.parseDateValue(incomingLatestSigned);
    const firstSignedDate = existingFirstDate && incomingLatestDate
      ? (incomingLatestDate < existingFirstDate ? incomingLatestSigned : existingFirstSigned)
      : (existingFirstSigned || incomingLatestSigned);

    const existingLatestDate = this.parseDateValue(existing.latest_signed_date);
    const shouldUseIncomingAsLatest = !existingLatestDate || (incomingLatestDate && incomingLatestDate >= existingLatestDate);
    const incomingLatestAgreementId = String(signedClient.latest_agreement_id || '').trim();

    const nextSignedCount = sameAgreement
      ? this.toNumberSafe(existing.signed_agreements_count)
      : this.toNumberSafe(existing.signed_agreements_count) + 1;
    const nextAgreementsCount = Math.max(
      this.toNumberSafe(existing.agreements_count),
      nextSignedCount
    );
    const nextActiveCount = Math.max(
      this.toNumberSafe(existing.active_agreements_count),
      sameAgreement ? this.toNumberSafe(existing.active_agreements_count) : this.toNumberSafe(existing.active_agreements_count) + 1
    );

    return {
      customer_name: this.mergeClientValue(existing.customer_name, signedClient.customer_name),
      customer_legal_name: this.mergeClientValue(existing.customer_legal_name, signedClient.customer_legal_name),
      customer_contact_name: this.mergeClientValue(existing.customer_contact_name, signedClient.customer_contact_name),
      customer_contact_email: this.mergeClientValue(existing.customer_contact_email, signedClient.customer_contact_email),
      customer_contact_mobile: this.mergeClientValue(existing.customer_contact_mobile, signedClient.customer_contact_mobile),
      company_address: this.mergeClientValue(existing.company_address, signedClient.company_address),
      account_status: this.mergeClientValue(existing.account_status, signedClient.account_status),
      contract_term: this.mergeClientValue(existing.contract_term, signedClient.contract_term),
      billing_frequency: this.mergeClientValue(existing.billing_frequency, signedClient.billing_frequency),
      payment_terms: this.mergeClientValue(existing.payment_terms, signedClient.payment_terms),
      currency: this.mergeClientValue(existing.currency, signedClient.currency),
      latest_grand_total: this.toNumberSafe(signedClient.latest_grand_total) || this.toNumberSafe(existing.latest_grand_total),
      total_signed_value: sameAgreement
        ? this.toNumberSafe(existing.total_signed_value)
        : this.toNumberSafe(existing.total_signed_value) + this.toNumberSafe(signedClient.latest_grand_total),
      agreements_count: nextAgreementsCount,
      signed_agreements_count: nextSignedCount,
      active_agreements_count: nextActiveCount,
      first_signed_date: firstSignedDate,
      latest_signed_date: shouldUseIncomingAsLatest
        ? (incomingLatestSigned || String(existing.latest_signed_date || '').trim())
        : String(existing.latest_signed_date || '').trim(),
      latest_agreement_id: shouldUseIncomingAsLatest
        ? (incomingLatestAgreementId || String(existing.latest_agreement_id || '').trim())
        : String(existing.latest_agreement_id || '').trim(),
      latest_proposal_id: shouldUseIncomingAsLatest
        ? this.mergeClientValue(existing.latest_proposal_id, signedClient.latest_proposal_id)
        : String(existing.latest_proposal_id || '').trim(),
      latest_deal_id: shouldUseIncomingAsLatest
        ? this.mergeClientValue(existing.latest_deal_id, signedClient.latest_deal_id)
        : String(existing.latest_deal_id || '').trim(),
      latest_lead_id: shouldUseIncomingAsLatest
        ? this.mergeClientValue(existing.latest_lead_id, signedClient.latest_lead_id)
        : String(existing.latest_lead_id || '').trim()
    };
  },
  async syncSignedAgreementToClient(agreement = {}, agreementId = '') {
    if (!this.isSignedStatus(agreement.status)) return;
    const signedClient = this.buildClientFromAgreement(agreement, agreementId);
    const response = await this.listClients();
    const rows = this.extractClientRows(response);
    const targetEmail = this.normalizeText(agreement.customer_contact_email);
    const targetName = this.normalizeText(agreement.customer_name);
    const existing = rows.find(row => {
      const latestAgreementId = String(row?.latest_agreement_id || '').trim();
      if (latestAgreementId && latestAgreementId === signedClient.latest_agreement_id) return true;
      const email = this.normalizeText(row?.customer_contact_email);
      if (targetEmail && email && email === targetEmail) return true;
      const name = this.normalizeText(row?.customer_name);
      return targetName && name && name === targetName;
    });
    const existingId = String(existing?.client_id || '').trim();
    if (existingId) {
      const mergedPayload = this.mergeExistingClientWithSignedAgreement(existing, signedClient);
      await this.updateClient(existingId, mergedPayload);
      return;
    }
    await this.createClient(signedClient);
  },
  applyFilters() {
    const terms = String(this.state.search || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    const relationTerms = String(this.state.proposalOrDeal || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    this.state.filteredRows = this.state.rows.filter(row => {
      if (this.state.status !== 'All' && String(row.status || '').trim() !== this.state.status) return false;
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
    const statusMatch = (row, tokens) => tokens.some(t => this.normalizeText(row.status).includes(t));
    const sentReviewAwaiting = countBy(row => statusMatch(row, ['sent', 'under review', 'awaiting signature']));
    const signedActive = countBy(row => statusMatch(row, ['signed', 'active']));
    const expiredCancelled = countBy(row => statusMatch(row, ['expired', 'cancelled', 'canceled']));
    const totalValue = rows.reduce((sum, row) => sum + this.toNumberSafe(row.grand_total), 0);
    const proposalLinked = countBy(row => String(row.proposal_id || '').trim());
    const draftCount = countBy(row => this.normalizeText(row.status) === 'draft');
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
    E.agreementsState.textContent = `${rows.length} agreement${rows.length === 1 ? '' : 's'}`;
    this.renderSummary();
    if (!rows.length) {
      E.agreementsTbody.innerHTML = '<tr><td colspan="15" class="muted" style="text-align:center;">No agreements found.</td></tr>';
      return;
    }
    const textCell = value => U.escapeHtml(String(value ?? '').trim() || '—');
    E.agreementsTbody.innerHTML = rows.map(row => {
      const id = U.escapeAttr(row.agreement_id || '');
      return `<tr>
        <td>${textCell(row.agreement_id)}</td><td>${textCell(row.agreement_number)}</td><td>${textCell(row.agreement_title)}</td>
        <td>${textCell(row.customer_name)}</td><td>${textCell(row.proposal_id)}</td><td>${textCell(row.deal_id)}</td>
        <td>${U.escapeHtml(U.fmtDisplayDate(row.service_start_date))}</td><td>${textCell(row.agreement_length)}</td><td>${textCell(row.billing_frequency)}</td>
        <td>${textCell(row.payment_term)}</td><td>${textCell(row.currency)}</td><td>${textCell(this.formatMoney(row.grand_total))}</td>
        <td>${textCell(row.status)}</td><td>${U.escapeHtml(U.fmtDisplayDate(row.updated_at))}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn ghost sm" type="button" data-agreement-view="${id}">View</button>
        ${Permissions.canUpdateAgreement() ? `<button class=\"btn ghost sm\" type=\"button\" data-agreement-edit=\"${id}\">Edit</button>` : ''}
        ${Permissions.canViewTechnicalAdmin() ? `<button class=\"btn ghost sm\" type=\"button\" data-agreement-request-technical=\"${id}\">Request Technical</button>` : ''}
        ${Permissions.canGenerateAgreementHtml() ? `<button class=\"btn ghost sm\" type=\"button\" data-agreement-preview=\"${id}\">View Agreement</button>` : ''}
        ${this.isSignedStatus(row.status) && Permissions.canCreateInvoiceFromAgreement() ? `<button class=\"btn ghost sm\" type=\"button\" data-agreement-create-invoice=\"${id}\">Create Invoice</button>` : ''}
        ${Permissions.canDeleteAgreement() ? `<button class=\"btn ghost sm\" type=\"button\" data-agreement-delete=\"${id}\">Delete</button>` : ''}
        </div></td></tr>`;
    }).join('');
  },
  collectFormValues() {
    const v = id => String(document.getElementById(id)?.value || '').trim();
    const agreement = {};
    this.agreementFields.forEach(field => {
      const inputId = `agreementForm${field.replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase())}`;
      agreement[field] = v(inputId);
    });
    agreement.account_number = String(agreement.account_number || '').trim();
    const items = this.collectItems();
    const totals = this.calculateTotals(items);
    agreement.saas_total = totals.saas_total;
    agreement.one_time_total = totals.one_time_total;
    agreement.grand_total = totals.grand_total;
    return { agreement, items };
  },
  calculateTotals(items = []) {
    const safeItems = Array.isArray(items) ? items : [];
    const saas_total = safeItems.filter(i => i.section === 'annual_saas').reduce((sum, i) => sum + this.toNumberSafe(i.line_total), 0);
    const one_time_total = safeItems.filter(i => i.section === 'one_time_fee').reduce((sum, i) => sum + this.toNumberSafe(i.line_total), 0);
    return { saas_total, one_time_total, grand_total: saas_total + one_time_total };
  },
  collectItems() {
    const rows = Array.from(E.agreementForm?.querySelectorAll('tr[data-item-row]') || []);
    return rows.map((tr, index) => {
      const section = String(tr.getAttribute('data-item-row') || '').trim();
      const get = key => String(tr.querySelector(`[data-item-field="${key}"]`)?.value || '').trim();
      let baseItem = {};
      try {
        baseItem = JSON.parse(tr.getAttribute('data-item-payload') || '{}');
      } catch (_error) {
        baseItem = {};
      }
      const mergedItem = {
        ...baseItem,
        section,
        line_no: index + 1,
        location_name: get('location_name'),
        location_address: get('location_address'),
        service_start_date: get('service_start_date'),
        service_end_date: get('service_end_date'),
        item_name: get('item_name'),
        unit_price: this.toNumberSafe(get('unit_price')),
        discount_percent: this.toNumberSafe(get('discount_percent')),
        discounted_unit_price: this.toNumberSafe(get('discounted_unit_price')),
        quantity: this.toNumberSafe(get('quantity')),
        line_total: this.toNumberSafe(get('line_total')),
        capability_name: get('capability_name'),
        capability_value: get('capability_value'),
        notes: get('notes')
      };
      const item = { ...baseItem, ...this.normalizeItem(mergedItem, section) };
      if (section === 'annual_saas' || section === 'one_time_fee') {
        const discount = item.discount_percent > 1 ? item.discount_percent / 100 : item.discount_percent;
        item.discounted_unit_price = item.unit_price * (1 - Math.max(0, discount));
        item.line_total = item.discounted_unit_price * (item.quantity || 0);
      }
      return item;
    });
  },
  renderItemRows(items = []) {
    const grouped = this.groupedItems(items);
    const rowHtml = (section, item, index) => {
      const payload = U.escapeAttr(JSON.stringify(item || {}));
      if (section === 'capability') {
        return `<tr data-item-row="capability" data-item-payload="${payload}"><td><input class="input" data-item-field="capability_name" value="${U.escapeAttr(item.capability_name || '')}" /></td><td><input class="input" data-item-field="capability_value" value="${U.escapeAttr(item.capability_value || '')}" /></td><td><input class="input" data-item-field="notes" value="${U.escapeAttr(item.notes || '')}" /></td><td><button type="button" class="btn ghost sm" data-item-remove="capability" data-item-index="${index}">Remove</button></td></tr>`;
      }
      return `<tr data-item-row="${section}" data-item-payload="${payload}">
      <td><input class="input" data-item-field="location_name" value="${U.escapeAttr(item.location_name || '')}" /></td>
      <td><input class="input" data-item-field="location_address" value="${U.escapeAttr(item.location_address || '')}" /></td>
      <td><input class="input" type="date" data-item-field="service_start_date" value="${U.escapeAttr(item.service_start_date || '')}" /></td>
      <td><input class="input" type="date" data-item-field="service_end_date" value="${U.escapeAttr(item.service_end_date || '')}" /></td>
      <td><input class="input" data-item-field="item_name" value="${U.escapeAttr(item.item_name || '')}" /></td>
      <td><input class="input" data-item-field="unit_price" type="number" step="0.01" value="${U.escapeAttr(item.unit_price || '')}" /></td>
      <td><input class="input" data-item-field="discount_percent" type="number" step="0.01" value="${U.escapeAttr(item.discount_percent || '')}" /></td>
      <td><input class="input" data-item-field="quantity" type="number" step="0.01" value="${U.escapeAttr(item.quantity || '')}" /></td>
      <td><input class="input" data-item-field="discounted_unit_price" type="number" step="0.01" value="${U.escapeAttr(item.discounted_unit_price || '')}" /></td>
      <td><input class="input" data-item-field="line_total" type="number" step="0.01" value="${U.escapeAttr(item.line_total || '')}" /></td>
      <td><button type="button" class="btn ghost sm" data-item-remove="${section}" data-item-index="${index}">Remove</button></td>
      </tr>`;
    };
    if (E.agreementAnnualItemsTbody) E.agreementAnnualItemsTbody.innerHTML = grouped.annual_saas.map((item, idx) => rowHtml('annual_saas', item, idx)).join('');
    if (E.agreementOneTimeItemsTbody) E.agreementOneTimeItemsTbody.innerHTML = grouped.one_time_fee.map((item, idx) => rowHtml('one_time_fee', item, idx)).join('');
    if (E.agreementCapabilityItemsTbody) E.agreementCapabilityItemsTbody.innerHTML = grouped.capability.map((item, idx) => rowHtml('capability', item, idx)).join('');
    const totals = this.calculateTotals(items);
    if (E.agreementSaasTotal) E.agreementSaasTotal.textContent = this.formatMoney(totals.saas_total);
    if (E.agreementOneTimeTotal) E.agreementOneTimeTotal.textContent = this.formatMoney(totals.one_time_total);
    if (E.agreementGrandTotal) E.agreementGrandTotal.textContent = this.formatMoney(totals.grand_total);
  },
  assignFormValues(agreement = {}) {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value ?? '';
    };
    this.agreementFields.forEach(field => {
      const id = `agreementForm${field.replace(/(^|_)([a-z])/g, (_, __, ch) => ch.toUpperCase())}`;
      set(id, agreement[field] ?? '');
    });
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
      if ('disabled' in el && !/agreementForm(Delete|Save)Btn/.test(el.id)) el.disabled = readOnly;
    });
  },
  openAgreementForm(agreement = this.emptyAgreement(), items = [], { readOnly = false } = {}) {
    if (!E.agreementFormModal || !E.agreementForm) return;
    this.assignFormValues(agreement);
    this.renderItemRows(items);
    E.agreementForm.dataset.id = agreement.agreement_id || '';
    E.agreementForm.dataset.mode = agreement.agreement_id ? 'edit' : 'create';
    if (E.agreementFormTitle) E.agreementFormTitle.textContent = agreement.agreement_id ? (readOnly ? 'View Agreement' : 'Edit Agreement') : 'Create Agreement';
    if (E.agreementFormDeleteBtn) E.agreementFormDeleteBtn.style.display = !readOnly && agreement.agreement_id && Permissions.canDeleteAgreement() ? '' : 'none';
    if (E.agreementFormSaveBtn) {
      const canSave = agreement.agreement_id ? Permissions.canUpdateAgreement() : Permissions.canCreateAgreement();
      E.agreementFormSaveBtn.style.display = !readOnly && canSave ? '' : 'none';
    }
    this.setFormReadOnly(readOnly);
    this.state.currentAgreementId = String(agreement.agreement_id || '').trim();
    E.agreementFormModal.classList.add('open');
    E.agreementFormModal.setAttribute('aria-hidden', 'false');
  },
  closeAgreementForm() {
    if (!E.agreementFormModal || !E.agreementForm) return;
    E.agreementFormModal.classList.remove('open');
    E.agreementFormModal.setAttribute('aria-hidden', 'true');
    E.agreementForm.reset();
    E.agreementForm.dataset.id = '';
    this.state.currentAgreementId = '';
    this.renderItemRows([]);
  },
  setFormBusy(busy) {
    const inFlight = !!busy;
    if (E.agreementFormSaveBtn) E.agreementFormSaveBtn.disabled = inFlight;
    if (E.agreementFormDeleteBtn) E.agreementFormDeleteBtn.disabled = inFlight;
  },
  addRow(section) {
    const items = this.collectItems();
    if (section === 'capability') items.push({ section: 'capability', capability_name: '', capability_value: '', notes: '' });
    else items.push({ section, location_name: '', location_address: '', service_start_date: '', service_end_date: '', item_name: '', unit_price: 0, discount_percent: 0, quantity: 1, discounted_unit_price: 0, line_total: 0 });
    this.renderItemRows(items);
  },
  removeRow(section, index) {
    const grouped = this.groupedItems(this.collectItems());
    grouped[section] = grouped[section].filter((_, idx) => idx !== index);
    this.renderItemRows([...grouped.annual_saas, ...grouped.one_time_fee, ...grouped.capability]);
  },
  async openAgreementFormById(agreementId, { readOnly = false, trigger = null } = {}) {
    const id = String(agreementId || '').trim();
    if (!id) return;
    if (this.state.openingAgreementIds.has(id)) return;
    this.state.openingAgreementIds.add(id);
    this.setTriggerBusy(trigger, true);
    console.time('agreement-open');
    const localSummary = this.state.rows.find(row => String(row.agreement_id || '').trim() === id);
    this.openAgreementForm(
      localSummary ? { ...this.emptyAgreement(), ...localSummary, agreement_id: id } : { agreement_id: id },
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
      const { agreement, items } = this.extractAgreementAndItems(response, id);
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
    const { agreement, items } = this.collectFormValues();
    const currentRecord = this.state.rows.find(row => String(row.agreement_id || '') === id) || {};
    const requestedDiscount = items.reduce((max, item) => Math.max(max, this.toNumberSafe(item.discount_percent)), 0);
    const workflowCheck = await window.WorkflowEngine?.enforceBeforeSave?.('agreements', currentRecord, {
      agreement_id: id,
      current_status: currentRecord?.status || '',
      requested_status: agreement.status || '',
      discount_percent: requestedDiscount,
      requested_changes: { agreement, items }
    });
    if (workflowCheck && !workflowCheck.allowed) {
      UI.toast(window.WorkflowEngine.composeDeniedMessage(workflowCheck, 'Agreement save blocked.'));
      return;
    }
    this.state.saveInFlight = true;
    this.setFormBusy(true);
    console.time('entity-save');
    try {
      const saveResponse = id
        ? await this.updateAgreement(id, agreement, items)
        : await this.createAgreement(agreement, items);
      const persistedAgreement = this.extractAgreementAndItems(saveResponse, id).agreement;
      const persistedAgreementId = String(persistedAgreement?.agreement_id || id || '').trim();
      this.setCachedDetail(persistedAgreementId, persistedAgreement, items);
      try {
        await this.syncSignedAgreementToClient({ ...agreement, ...persistedAgreement }, persistedAgreementId);
      } catch (clientSyncError) {
        UI.toast(`Agreement saved, but client sync failed: ${clientSyncError?.message || 'Unknown error'}`);
      }
      if (persistedAgreement) {
        this.upsertLocalRow(persistedAgreement);
        if (!id && persistedAgreement.proposal_id) {
          this.markProposalAsConvertedToAgreement(persistedAgreement.proposal_id, persistedAgreementId);
        }
      }
      this.closeAgreementForm();
      UI.toast(id ? 'Agreement updated.' : 'Agreement created.');
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
    if (!id || !window.confirm(`Delete agreement ${id}?`)) return;
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
      const response = await this.generateAgreementHtml(agreementId);
      const html = String(response?.html || response?.agreement_html || response?.content || response || '').trim();
      if (!html) {
        UI.toast('No agreement HTML was returned by backend.');
        return;
      }
      const brandedHtml = U.addIncheckDocumentLogo(U.formatPreviewHtmlDates(html));
      if (E.agreementPreviewTitle) E.agreementPreviewTitle.textContent = `Agreement Preview · ${agreementId}`;
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
    const id = String(proposalId || '').trim();
    if (!id) {
      UI.toast('Proposal ID is required.');
      return;
    }
    const localProposal = window.Proposals?.state?.rows?.find(row => String(row?.proposal_id || '').trim() === id);
    if (window.Proposals?.isAgreementAlreadyCreated?.(localProposal)) {
      UI.toast('This proposal has already been converted to an agreement.');
      return;
    }
    try {
      const proposalResponse = await window.Proposals?.getProposal?.(id);
      const extracted = window.Proposals?.extractProposalAndItems?.(proposalResponse, id) || {};
      const proposal = extracted.proposal && typeof extracted.proposal === 'object'
        ? extracted.proposal
        : { proposal_id: id };
      if (window.Proposals?.isAgreementAlreadyCreated?.(proposal)) {
        UI.toast('This proposal has already been converted to an agreement.');
        return;
      }
      const proposalItems = Array.isArray(extracted.items) ? extracted.items : [];
      const draftAgreement = this.normalizeAgreement({
        ...this.emptyAgreement(),
        proposal_id: String(proposal.proposal_id || id).trim(),
        deal_id: String(proposal.deal_id || '').trim(),
        lead_id: String(proposal.lead_id || '').trim(),
        agreement_title: String(proposal.proposal_title || '').trim(),
        service_start_date: String(proposal.service_start_date || '').trim(),
        agreement_length: String(proposal.contract_term || '').trim(),
        account_number: String(proposal.account_number || '').trim(),
        billing_frequency: String(proposal.billing_frequency || '').trim(),
        payment_term: String(proposal.payment_term || '').trim(),
        po_number: String(proposal.po_number || '').trim(),
        currency: String(proposal.currency || '').trim(),
        customer_name: String(proposal.customer_name || '').trim(),
        customer_address: String(proposal.customer_address || '').trim(),
        customer_contact_name: String(proposal.customer_contact_name || '').trim(),
        customer_contact_mobile: String(proposal.customer_contact_mobile || '').trim(),
        customer_contact_email: String(proposal.customer_contact_email || '').trim(),
        provider_contact_name: String(proposal.provider_contact_name || '').trim(),
        provider_contact_mobile: String(proposal.provider_contact_mobile || '').trim(),
        provider_contact_email: String(proposal.provider_contact_email || '').trim(),
        terms_conditions: String(proposal.terms_conditions || '').trim(),
        customer_signatory_name: String(proposal.customer_signatory_name || '').trim(),
        customer_signatory_title: String(proposal.customer_signatory_title || '').trim(),
        provider_signatory_name_primary: String(proposal.provider_signatory_name || '').trim(),
        provider_signatory_title_primary: String(proposal.provider_signatory_title || '').trim()
      });
      const mappedItems = proposalItems.map(item => this.normalizeItem(item, item?.section || 'annual_saas'));
      this.openAgreementForm(draftAgreement, mappedItems, { readOnly: false });
      UI.toast(
        `Agreement draft opened from proposal ${id}. Review mapped fields, complete missing details, and save when ready.`
      );
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
  async loadAndRefresh({ force = false } = {}) {
    if (this.state.loading && !force) return;
    const hasWarmCache = this.state.loaded && Date.now() - this.state.lastLoadedAt <= this.state.cacheTtlMs;
    if (hasWarmCache && !force) {
      this.applyFilters();
      this.renderFilters();
      this.render();
      return;
    }
    this.state.loading = true;
    this.state.loadError = '';
    this.render();
    try {
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
      this.state.rows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load agreements.';
    } finally {
      this.state.loading = false;
      this.applyFilters();
      this.renderFilters();
      this.render();
    }
  },
  wire() {
    if (this.state.initialized) return;
    const bindState = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        this.applyFilters();
        this.render();
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

    if (E.agreementsRefreshBtn) E.agreementsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    if (E.agreementsCreateBtn) E.agreementsCreateBtn.addEventListener('click', () => {
      if (!Permissions.canCreateAgreement()) return UI.toast('Login is required to save agreements.');
      this.openAgreementForm();
    });
    if (E.agreementsCreateFromProposalBtn) E.agreementsCreateFromProposalBtn.addEventListener('click', () => {
      this.createFromProposalFlow(E.agreementsCreateFromProposalInput?.value || '');
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
        if (!Permissions.canViewTechnicalAdmin()) return UI.toast('You do not have permission to request Technical Admin.');
        return this.runRowAction(`request-technical:${requestTechnicalId}`, trigger, () => this.requestTechnicalAdminFlow(requestTechnicalId));
      }
      const previewId = trigger.getAttribute('data-agreement-preview');
      if (previewId) return this.runRowAction(`preview:${previewId}`, trigger, () => this.previewAgreementHtml(previewId));
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
      E.agreementForm.addEventListener('submit', event => { event.preventDefault(); this.submitForm(); });
      E.agreementForm.addEventListener('click', event => {
        const trigger = event.target?.closest?.('button[data-item-remove]');
        if (!trigger) return;
        const section = trigger.getAttribute('data-item-remove');
        const index = Number(trigger.getAttribute('data-item-index'));
        if (section && Number.isInteger(index) && index >= 0) this.removeRow(section, index);
      });
      E.agreementForm.addEventListener('input', event => {
        if (!event.target?.getAttribute('data-item-field')) return;
        this.renderItemRows(this.collectItems());
      });
    }
    if (E.agreementFormDeleteBtn) E.agreementFormDeleteBtn.addEventListener('click', () => this.deleteById(E.agreementForm?.dataset.id || ''));
    if (E.agreementFormPreviewBtn) E.agreementFormPreviewBtn.addEventListener('click', () => {
      const id = String(E.agreementForm?.dataset.id || '').trim();
      if (!id) return UI.toast('Save the agreement first to preview backend-generated HTML.');
      this.previewAgreementHtml(id);
    });

    if (E.agreementAddAnnualRowBtn) E.agreementAddAnnualRowBtn.addEventListener('click', () => this.addRow('annual_saas'));
    if (E.agreementAddOneTimeRowBtn) E.agreementAddOneTimeRowBtn.addEventListener('click', () => this.addRow('one_time_fee'));
    if (E.agreementAddCapabilityRowBtn) E.agreementAddCapabilityRowBtn.addEventListener('click', () => this.addRow('capability'));
    if (E.agreementPreviewExportPdfBtn) E.agreementPreviewExportPdfBtn.addEventListener('click', () => this.exportPreviewPdf());
    if (E.agreementPreviewCloseBtn) E.agreementPreviewCloseBtn.addEventListener('click', () => this.closePreviewModal());
    if (E.agreementPreviewModal) E.agreementPreviewModal.addEventListener('click', event => {
      if (event.target === E.agreementPreviewModal) this.closePreviewModal();
    });
    this.state.initialized = true;
  }
};

window.Agreements = Agreements;
