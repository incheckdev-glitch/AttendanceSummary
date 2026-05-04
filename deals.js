const Deals = {
  columns: [
    'deal_id',
    'lead_id',
    'lead_code',
    'full_name',
    'company_name',
    'phone',
    'email',
    'country',
    'lead_source',
    'service_interest',
    'stage',
    'status',
    'priority',
    'estimated_value',
    'currency',
    'assigned_to',
    'proposal_needed',
    'agreement_needed',
    'converted_at',
    'converted_by',
    'notes',
    'created_at',
    'updated_at'
  ],
  formDropdownDefaults: {
    lead_source: ['Website', 'Referral', 'LinkedIn', 'Email', 'Call', 'WhatsApp', 'Event', 'Other'],
    service_interest: ['Software', 'Other', 'Consulting'],
    stage: ['Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'],
    status: ['Open', 'Won', 'Lost', 'On Hold'],
    priority: ['High', 'Medium', 'Low'],
    currency: ['USD', 'EUR', 'GBP', 'AED']
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
    stage: 'All',
    status: 'All',
    priority: 'All',
    serviceInterest: 'All',
    leadSource: 'All',
    assignedTo: 'All',
    proposalNeeded: 'All',
    agreementNeeded: 'All',
    convertedFrom: '',
    convertedTo: '',
    kpiFilter: 'total',
    saveInFlight: false,
    rowActionInFlight: new Set(),
    page: 1,
    limit: 50,
    offset: 0,
    total: 0,
    returned: 0,
    hasMore: false,
    form: { mode: 'create', selectedLead: null, selectedCompany: null, selectedContact: null, companyId: '', contactId: '', lockLinks: false }
  },
  normalizeBool(value) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return 'yes';
    if (['false', '0', 'no', 'n'].includes(normalized)) return 'no';
    return '';
  },
  boolLabel(value) {
    if (value === 'yes') return 'Yes';
    if (value === 'no') return 'No';
    return '—';
  },
  normalizeCompany(company = {}) {
    const c = company && typeof company === 'object' ? company : {};
    return {
      id: c.id || '',
      company_id: String(c.company_id || c.companyId || '').trim(),
      company_name: String(c.company_name || c.companyName || '').trim(),
      legal_name: String(c.legal_name || c.legalName || '').trim(),
      company_type: String(c.company_type || c.companyType || '').trim(),
      industry: String(c.industry || '').trim(),
      website: String(c.website || '').trim(),
      main_email: String(c.main_email || c.mainEmail || '').trim(),
      main_phone: String(c.main_phone || c.mainPhone || '').trim(),
      country: String(c.country || '').trim(),
      city: String(c.city || '').trim(),
      address: String(c.address || '').trim(),
      tax_number: String(c.tax_number || c.taxNumber || '').trim(),
      company_status: String(c.company_status || c.companyStatus || '').trim(),
      notes: String(c.notes || '').trim()
    };
  },
  normalizeContact(contact = {}) {
    const c = contact && typeof contact === 'object' ? contact : {};
    const phone = String(c.phone || '').trim();
    const mobile = String(c.mobile || '').trim();
    return {
      id: c.id || '',
      contact_id: String(c.contact_id || c.contactId || '').trim(),
      company_id: String(c.company_id || c.companyId || '').trim(),
      company_name: String(c.company_name || c.companyName || '').trim(),
      first_name: String(c.first_name || c.firstName || '').trim(),
      last_name: String(c.last_name || c.lastName || '').trim(),
      full_name: String(
        c.full_name || c.fullName || [c.first_name || c.firstName, c.last_name || c.lastName].filter(Boolean).join(' ') || ''
      ).trim(),
      job_title: String(c.job_title || c.jobTitle || '').trim(),
      department: String(c.department || '').trim(),
      email: String(c.email || '').trim(),
      phone,
      mobile,
      decision_role: String(c.decision_role || c.decisionRole || '').trim(),
      is_primary_contact: Boolean(c.is_primary_contact ?? c.isPrimaryContact),
      contact_status: String(c.contact_status || c.contactStatus || '').trim()
    };
  },
  formatCompanyType(value) {
    const map = { single_branch: 'Single Branch', chain: 'Chain', franchise: 'Franchise', enterprise: 'Enterprise', sme: 'SME', distributor: 'Distributor', partner: 'Partner', other: 'Other' };
    return map[String(value || '').trim()] || String(value || '').trim() || '—';
  },
  formatCompanyIndustry(value) {
    const map = { fnb: 'F&B', retail: 'Retail', hospitality: 'Hospitality', healthcare: 'Healthcare', education: 'Education', real_estate: 'Real Estate', logistics: 'Logistics', manufacturing: 'Manufacturing', technology: 'Technology', security: 'Security', finance: 'Finance', other: 'Other' };
    return map[String(value || '').trim()] || String(value || '').trim() || '—';
  },
  normalizeDeal(raw = {}) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const lead = source.lead && typeof source.lead === 'object' ? source.lead : {};
    const pick = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };

    const id = String(raw.id || '').trim();
    const dealId = String(raw.deal_id || raw.dealId || '').trim();
    return {
      id,
      deal_id: dealId,
      lead_code: String(pick(source.lead_code, source.leadCode, lead.lead_id, lead.leadId)).trim(),
      lead_id: String(pick(source.lead_id, source.leadId, lead.lead_id, lead.leadId)).trim(),
      full_name: String(pick(source.full_name, source.fullName, lead.full_name, lead.fullName)).trim(),
      company_id: String(pick(source.company_id, source.companyId, lead.company_id, lead.companyId)).trim(),
      company_name: String(
        pick(source.company_name, source.companyName, lead.company_name, lead.companyName)
      ).trim(),
      customer_name: String(pick(source.customer_name, source.customerName, lead.customer_name, lead.customerName)).trim(),
      customer_legal_name: U.getCustomerLegalName(
        { legal_name: pick(source.company?.legal_name, source.company?.legalName), company_name: pick(source.company_name, source.companyName, lead.company_name, lead.companyName) },
        {
          customer_legal_name: pick(source.customer_legal_name, source.customerLegalName, lead.customer_legal_name, lead.customerLegalName),
          customer_name: pick(source.customer_name, source.customerName, lead.customer_name, lead.customerName),
          company_name: pick(source.company_name, source.companyName, lead.company_name, lead.companyName)
        }
      ),
      customer_address: String(pick(source.customer_address, source.customerAddress, lead.customer_address, lead.customerAddress)).trim(),
      contact_id: String(pick(source.contact_id, source.contactId, lead.contact_id, lead.contactId)).trim(),
      contact_name: String(pick(source.contact_name, source.contactName, lead.contact_name, lead.contactName, source.full_name)).trim(),
      contact_email: String(pick(source.contact_email, source.contactEmail, lead.contact_email, lead.contactEmail, source.email)).trim(),
      contact_phone: String(pick(source.contact_phone, source.contactPhone, lead.contact_phone, lead.contactPhone, source.phone)).trim(),
      phone: String(pick(source.phone, lead.phone)).trim(),
      email: String(pick(source.email, lead.email)).trim(),
      country: String(pick(source.country, lead.country)).trim(),
      lead_source: String(
        pick(source.lead_source, source.leadSource, lead.lead_source, lead.leadSource)
      ).trim(),
      service_interest: String(
        pick(source.service_interest, source.serviceInterest, lead.service_interest, lead.serviceInterest)
      ).trim(),
      stage: String(pick(source.stage)).trim(),
      status: String(pick(source.status, lead.status)).trim(),
      priority: String(pick(source.priority, lead.priority)).trim(),
      estimated_value: pick(
        source.estimated_value,
        source.estimatedValue,
        lead.estimated_value,
        lead.estimatedValue
      ),
      currency: String(pick(source.currency, lead.currency)).trim(),
      assigned_to: String(pick(source.assigned_to, source.assignedTo, lead.assigned_to, lead.assignedTo)).trim(),
      proposal_needed: this.normalizeBool(
        pick(source.proposal_needed, source.proposalNeeded, lead.proposal_needed, lead.proposalNeeded)
      ),
      proposal_id: String(pick(source.proposal_id, source.proposalId, lead.proposal_id, lead.proposalId)).trim(),
      agreement_needed: this.normalizeBool(
        pick(source.agreement_needed, source.agreementNeeded, lead.agreement_needed, lead.agreementNeeded)
      ),
      converted_at: pick(source.converted_at, source.convertedAt, lead.converted_at, lead.convertedAt),
      converted_by: String(
        pick(source.converted_by, source.convertedBy, lead.converted_by, lead.convertedBy)
      ).trim(),
      notes: String(pick(source.notes, lead.notes)).trim(),
      created_at: pick(source.created_at, source.createdAt, lead.created_at, lead.createdAt),
      updated_at: pick(source.updated_at, source.updatedAt, lead.updated_at, lead.updatedAt)
    };
  },
  generateDealId() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `DEAL-${yyyy}${mm}${dd}-${rand}`;
  },
  backendDeal(deal, { ensureDealId = false } = {}) {
    const hasOwn = key => Object.prototype.hasOwnProperty.call(deal || {}, key);
    const toTextOrEmpty = keys => {
      const hasAny = keys.some(hasOwn);
      if (!hasAny) return undefined;
      const value = keys.map(key => deal[key]).find(value => value !== undefined);
      if (value === undefined || value === null) return '';
      return String(value).trim();
    };
    const toNumberOrNull = keys => {
      const hasAny = keys.some(hasOwn);
      if (!hasAny) return undefined;
      const value = keys.map(key => deal[key]).find(value => value !== undefined);
      if (value === undefined || value === null || String(value).trim() === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const toDateOrNull = keys => {
      const hasAny = keys.some(hasOwn);
      if (!hasAny) return undefined;
      const value = keys.map(key => deal[key]).find(value => value !== undefined);
      if (value === undefined || value === null) return null;
      const text = String(value).trim();
      return text || null;
    };
    const toBoolOrNull = keys => {
      const hasAny = keys.some(hasOwn);
      if (!hasAny) return undefined;
      return this.normalizeBool(keys.map(key => deal[key]).find(value => value !== undefined)) === 'yes'
        ? true
        : this.normalizeBool(keys.map(key => deal[key]).find(value => value !== undefined)) === 'no'
          ? false
          : null;
    };
    const mapped = {
      deal_id: toTextOrEmpty(['deal_id', 'dealId']),
      lead_id: toTextOrEmpty(['lead_id', 'leadId']),
      lead_code: toTextOrEmpty(['lead_code', 'leadCode']),
      source_lead_uuid: toTextOrEmpty(['source_lead_uuid', 'sourceLeadUuid', 'lead_uuid', 'leadUuid']),
      full_name: toTextOrEmpty(['full_name', 'fullName']),
      company_id: toTextOrEmpty(['company_id', 'companyId']),
      company_name: toTextOrEmpty(['company_name', 'companyName']),
      contact_id: toTextOrEmpty(['contact_id', 'contactId']),
      contact_name: toTextOrEmpty(['contact_name', 'contactName']),
      contact_email: toTextOrEmpty(['contact_email', 'contactEmail']),
      contact_phone: toTextOrEmpty(['contact_phone', 'contactPhone']),
      phone: toTextOrEmpty(['phone']),
      email: toTextOrEmpty(['email']),
      country: toTextOrEmpty(['country']),
      lead_source: toTextOrEmpty(['lead_source', 'leadSource']),
      service_interest: toTextOrEmpty(['service_interest', 'serviceInterest']),
      stage: toTextOrEmpty(['stage']),
      status: toTextOrEmpty(['status']),
      priority: toTextOrEmpty(['priority']),
      estimated_value: toNumberOrNull(['estimated_value', 'estimatedValue']),
      currency: toTextOrEmpty(['currency']),
      assigned_to: toTextOrEmpty(['assigned_to', 'assignedTo']),
      proposal_needed: toBoolOrNull(['proposal_needed', 'proposalNeeded']),
      agreement_needed: toBoolOrNull(['agreement_needed', 'agreementNeeded']),
      converted_by: toTextOrEmpty(['converted_by', 'convertedBy']),
      converted_at: toDateOrNull(['converted_at', 'convertedAt']),
      notes: toTextOrEmpty(['notes']),
      created_at: toDateOrNull(['created_at', 'createdAt']),
      updated_at: toDateOrNull(['updated_at', 'updatedAt'])
    };
    return {
      ...mapped,
      ...(ensureDealId ? { deal_id: mapped.deal_id || this.generateDealId() } : {})
    };
  },
  extractRows(response) {
    const candidates = [
      response,
      response?.deals,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.deals,
      response?.result?.deals,
      response?.payload?.deals
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
    return [];
  },
  getClient() {
    return SupabaseClient.getClient();
  },
  async getCurrentUserId() {
    try {
      const { data, error } = await this.getClient().auth.getUser();
      if (error) return '';
      return String(data?.user?.id || '').trim();
    } catch {
      return '';
    }
  },
  toSupabaseError(prefix, error) {
    const message = String(error?.message || error?.error_description || 'Unknown error').trim();
    return new Error(`${prefix}: ${message}`);
  },
  async listDeals(options = {}) {
    const client = this.getClient();
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.max(1, Math.min(200, Number(options.limit || options.pageSize) || 50));
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    let query = client.from('deals').select('*').order('updated_at', { ascending: false });
    const term = String(this.state.search || '').replace(/[%_]/g, ' ').trim();
    if (term) {
      query = query.or(
        `deal_id.ilike.%${term}%,lead_id.ilike.%${term}%,lead_code.ilike.%${term}%,full_name.ilike.%${term}%,company_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,country.ilike.%${term}%,lead_source.ilike.%${term}%,service_interest.ilike.%${term}%,assigned_to.ilike.%${term}%,notes.ilike.%${term}%`
      );
    }
    query = query.range(from, to);
    const { data, error } = await query;
    if (error) throw this.toSupabaseError('Unable to load deals', error);
    const fetched = Array.isArray(data) ? data : [];
    const hasMore = fetched.length > pageSize;
    const rows = hasMore ? fetched.slice(0, pageSize) : fetched;
    return {
      rows,
      total: from + rows.length + (hasMore ? 1 : 0),
      returned: rows.length,
      hasMore,
      page,
      limit: pageSize,
      offset: from
    };
  },
  upsertLocalRow(row) {
    const normalized = this.normalizeDeal(row);
    const idx = this.state.rows.findIndex(item => item.id === normalized.id);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.rerenderVisibleTable();
  },
  removeLocalRow(id) {
    this.state.rows = this.state.rows.filter(item => item.id !== id);
    this.rerenderVisibleTable();
  },
  rerenderVisibleTable() {
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  async getDeal(id) {
    const { data, error } = await this.getClient().from('deals').select('*').eq('id', id).single();
    if (error) throw this.toSupabaseError('Unable to load deal details', error);
    return data;
  },
  async createDeal(deal) {
    const userId = await this.getCurrentUserId();
    const payload = {
      ...this.backendDeal(deal, { ensureDealId: true }),
      created_by: userId || undefined,
      updated_by: userId || undefined
    };
    const data = await Api.requestWithSession('deals', 'create', payload, { requireAuth: true });
    await Api.safeSendBusinessPwaPush({
      resource: 'deals',
      action: 'deal_created',
      recordId: Api.extractBusinessRecordId(data, payload.deal_id || deal?.deal_id || ''),
      title: 'New deal created',
      body: 'New deal created for ' + (payload.company_name || payload.company || payload.client_name || payload.name || 'a customer') + '.',
      roles: ['admin', 'hoo'],
      url: '/#deals'
    });
    return data;
  },
  async updateDeal(dealId, updates) {
    const userId = await this.getCurrentUserId();
    const payload = {
      ...this.backendDeal(updates),
      updated_by: userId || undefined
    };
    const data = await Api.requestWithSession('deals', 'update', {
      id: dealId,
      updates: payload
    }, { requireAuth: true });
    const stageKeys = ['stage', 'deal_stage', 'status'];
    const isStageUpdate = stageKeys.some(key => Object.prototype.hasOwnProperty.call(payload || {}, key));
    await Api.safeSendBusinessPwaPush({
      resource: 'deals',
      action: isStageUpdate ? 'deal_stage_changed' : 'deal_updated',
      recordId: Api.extractBusinessRecordId(data, dealId),
      title: isStageUpdate ? 'Deal stage changed' : 'Deal updated',
      body: 'Deal ' + (dealId || '') + ' was updated.',
      roles: ['admin', 'hoo'],
      url: dealId ? '/#deals?id=' + encodeURIComponent(dealId) : '/#deals'
    });
    return data;
  },
  async deleteDeal(dealId) {
    const { error } = await this.getClient().from('deals').delete().eq('id', dealId);
    if (error) throw this.toSupabaseError('Unable to delete deal', error);
    return { ok: true };
  },
  formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return U.escapeHtml(String(value));
    return U.escapeHtml(U.fmtDisplayDate(value));
  },
  formatDateTime(value) {
    if (!value) return '—';
    const formatted = U.formatDateTimeMMDDYYYYHHMM(value);
    if (formatted === '—') return U.escapeHtml(String(value));
    return U.escapeHtml(formatted);
  },
  formatDateTimeMMDDYYYYHHMM(value) {
    if (!value) return '';
    const formatted = U.formatDateTimeMMDDYYYYHHMM(value);
    return formatted === '—' ? '' : formatted;
  },
  getDealValue(row, ...keys) {
    if (!row || typeof row !== 'object') return '';
    for (const key of keys) {
      if (!key) continue;
      if (row[key] !== undefined && row[key] !== null) return row[key];
    }
    return '';
  },
  displayLeadId(row = {}, relatedLead = null) {
    return String(
      this.getDealValue(row, 'lead_code', 'leadCode') ||
        this.getDealValue(relatedLead, 'lead_id', 'leadId') ||
        this.getDealValue(row, 'lead_id', 'leadId')
    ).trim();
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
  updateExportButtonState() {
    if (!E.dealsExportCsvBtn) return;
    const canExport = Permissions.canExport('deals');
    E.dealsExportCsvBtn.style.display = canExport ? '' : 'none';
    E.dealsExportCsvBtn.disabled = this.state.loading || !canExport;
    if (!canExport) {
      E.dealsExportCsvBtn.title = 'You do not have permission to export this data.';
    } else {
      E.dealsExportCsvBtn.removeAttribute('title');
    }
  },
  updateCreateButtonState() {
    if (!E.dealsCreateBtn) return;
    const allowed = this.canCreate();
    E.dealsCreateBtn.style.display = allowed ? '' : 'none';
    E.dealsCreateBtn.disabled = !allowed;
    if (!allowed) E.dealsCreateBtn.title = 'You do not have permission to create deals.';
    else E.dealsCreateBtn.removeAttribute('title');
  },
  exportDealsCsv() {
    if (!Permissions.canExport('deals')) {
      UI.toast('You do not have permission to export deals.');
      return;
    }
    const rows = Array.isArray(this.state.filteredRows) ? this.state.filteredRows : [];
    if (!rows.length) {
      UI.toast('No deals match the current filters.');
      return;
    }
    const headers = [
      'Deal ID',
      'Lead ID',
      'Contact Name',
      'Company Name',
      'Phone',
      'Email',
      'Country',
      'Lead Source',
      'Service Interest',
      'Stage',
      'Status',
      'Priority',
      'Estimated Value',
      'Currency',
      'Assigned To',
      'Converted By',
      'Converted At',
      'Proposal Needed',
      'Agreement Needed',
      'Notes',
      'Created At',
      'Updated At'
    ];
    const lines = [
      headers.map(value => this.csvEscape(value)).join(','),
      ...rows.map(row =>
        [
          this.getDealValue(row, 'deal_id', 'dealId'),
          this.getDealValue(row, 'lead_code', 'leadCode') ||
            this.getDealValue(row, 'leadId', 'lead_id'),
          this.getDealValue(row, 'full_name', 'fullName'),
          this.getDealValue(row, 'company_name', 'companyName'),
          this.getDealValue(row, 'phone'),
          this.getDealValue(row, 'email'),
          this.getDealValue(row, 'country'),
          this.getDealValue(row, 'lead_source', 'leadSource'),
          this.getDealValue(row, 'service_interest', 'serviceInterest'),
          this.getDealValue(row, 'stage'),
          this.getDealValue(row, 'status'),
          this.getDealValue(row, 'priority'),
          this.getDealValue(row, 'estimated_value', 'estimatedValue'),
          this.getDealValue(row, 'currency'),
          this.getDealValue(row, 'assigned_to', 'assignedTo'),
          this.getDealValue(row, 'converted_by', 'convertedBy'),
          this.formatDateTimeMMDDYYYYHHMM(this.getDealValue(row, 'converted_at', 'convertedAt')),
          this.boolLabel(this.normalizeBool(this.getDealValue(row, 'proposal_needed', 'proposalNeeded'))),
          this.boolLabel(this.normalizeBool(this.getDealValue(row, 'agreement_needed', 'agreementNeeded'))),
          this.getDealValue(row, 'notes'),
          this.formatDateTimeMMDDYYYYHHMM(this.getDealValue(row, 'created_at', 'createdAt')),
          this.formatDateTimeMMDDYYYYHHMM(this.getDealValue(row, 'updated_at', 'updatedAt'))
        ]
          .map(value => this.csvEscape(value))
          .join(',')
      )
    ];
    const now = new Date();
    const filename = `deals-export-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.csv`;
    this.downloadCsv(filename, lines.join('\n'));
  },
  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || '').trim()
    );
  },
  async hydrateLeadCodeFromLeadUuid(row = {}) {
    if (!row?.id || !E.dealFormLeadId || !this.isUuid(row.lead_id)) return;
    if (String(row.lead_code || '').trim()) return;
    try {
      const { data, error } = await this.getClient()
        .from('leads')
        .select('lead_id')
        .eq('id', row.lead_id)
        .limit(1);
      if (error) return;
      const relatedLead = Array.isArray(data) ? data[0] : null;
      const displayLeadId = this.displayLeadId(row, relatedLead);
      if (displayLeadId) E.dealFormLeadId.value = displayLeadId;
      const leadCode = String(relatedLead?.lead_id || '').trim();
      if (leadCode) {
        E.dealFormLeadId.dataset.leadCode = leadCode;
        const existing = this.state.rows.find(item => item.id === row.id);
        if (existing) existing.lead_code = leadCode;
      }
    } catch {
      // best-effort for display only
    }
  },
  canCreate() {
    return canAnyPermission([['deals', 'create'], ['deals', 'manage']]);
  },
  canEdit() {
    return canAnyPermission([['deals', 'update'], ['deals', 'manage']]);
  },
  canDelete() {
    return canAnyPermission([['deals', 'delete'], ['deals', 'manage']]);
  },
  canEditDelete() {
    return this.canEdit() || this.canDelete();
  },
  canCreateProposalFromDeal() {
    return canAnyPermission([['deals', 'convert_to_proposal'], ['proposals', 'create_from_deal'], ['proposals', 'create'], ['proposals', 'manage']]);
  },
  isProposalAlreadyCreated(row = {}) {
    const proposalId = String(row?.proposal_id || '').trim();
    if (proposalId) return true;
    const stage = this.normalizeText(row?.stage);
    const status = this.normalizeText(row?.status);
    if (stage.includes('proposal')) return true;
    if (status.includes('proposal created')) return true;
    return false;
  },
  uniqueSorted(values = []) {
    return [...new Set(values.filter(Boolean).map(value => String(value).trim()))].sort((a, b) =>
      a.localeCompare(b)
    );
  },
  syncDealFormDropdowns(selected = {}) {
    const assign = (el, options = [], selectedValue = '') => {
      if (!el) return;
      const values = this.uniqueSorted(options);
      const finalOptions = ['', ...values];
      el.innerHTML = finalOptions
        .map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(value || '—')}</option>`)
        .join('');
      if (finalOptions.includes(selectedValue)) {
        el.value = selectedValue;
        return;
      }
      if (selectedValue) {
        el.innerHTML += `<option value="${U.escapeAttr(selectedValue)}">${U.escapeHtml(selectedValue)}</option>`;
        el.value = selectedValue;
      }
    };

    const sourceValues = this.formDropdownDefaults.lead_source.concat(
      this.state.rows.map(row => row.lead_source)
    );
    const serviceValues = this.formDropdownDefaults.service_interest.concat(
      this.state.rows.map(row => row.service_interest)
    );
    const stageValues = this.formDropdownDefaults.stage.concat(this.state.rows.map(row => row.stage));
    const statusValues = this.formDropdownDefaults.status.concat(this.state.rows.map(row => row.status));
    const priorityValues = this.formDropdownDefaults.priority.concat(
      this.state.rows.map(row => row.priority)
    );
    const currencyValues = this.formDropdownDefaults.currency.concat(
      this.state.rows.map(row => row.currency)
    );

    assign(E.dealFormLeadSource, sourceValues, selected.lead_source || '');
    assign(E.dealFormServiceInterest, serviceValues, selected.service_interest || '');
    assign(E.dealFormStage, stageValues, selected.stage || '');
    assign(E.dealFormStatus, statusValues, selected.status || '');
    assign(E.dealFormPriority, priorityValues, selected.priority || '');
    assign(E.dealFormCurrency, currencyValues, selected.currency || '');
  },
  normalizeText(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  },
  parseDateOnly(value) {
    const normalized = String(value || '').trim().slice(0, 10);
    if (!normalized) return null;
    const dt = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  },
  toNumberSafe(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(
      String(value)
        .replace(/,/g, '')
        .trim()
    );
    return Number.isFinite(parsed) ? parsed : 0;
  },
  matchesWonStatus(status) {
    const normalized = this.normalizeText(status);
    return normalized === 'won' || normalized.includes('closed won');
  },
  matchesLostStatus(status) {
    const normalized = this.normalizeText(status);
    return normalized === 'lost' || normalized.includes('closed lost');
  },
  matchesOpenStatus(status) {
    const normalized = this.normalizeText(status);
    if (!normalized || this.matchesWonStatus(normalized) || this.matchesLostStatus(normalized)) return false;
    return ['open', 'active', 'in progress', 'negotiation'].some(token => normalized.includes(token));
  },
  normalizeStage(stage) {
    const normalized = this.normalizeText(stage);
    if (!normalized) return 'Unknown';
    if (normalized.includes('prospect')) return 'Prospect';
    if (normalized.includes('qualif')) return 'Qualified';
    if (normalized.includes('proposal')) return 'Proposal Sent';
    if (normalized.includes('negotiat')) return 'Negotiation';
    if (normalized.includes('verbal') || normalized.includes('commit')) return 'Verbal Commit';
    if (this.matchesWonStatus(normalized) || normalized === 'won') return 'Won';
    if (this.matchesLostStatus(normalized) || normalized === 'lost') return 'Lost';
    return String(stage || '').trim() || 'Unknown';
  },
  formatValue(value, currency = '', hasMixedCurrencies = false) {
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
  matchesKpiFilter(row = {}) {
    const filter = this.state.kpiFilter || 'total';
    const status = this.normalizeText(row?.status);
    const priority = this.normalizeText(row?.priority);
    const value = this.toNumberSafe(row?.estimated_value);
    if (filter === 'total') return true;
    if (filter === 'open') return this.matchesOpenStatus(status);
    if (filter === 'won' || filter === 'win-rate' || filter === 'average-won-deal-size')
      return this.matchesWonStatus(status);
    if (filter === 'lost') return this.matchesLostStatus(status);
    if (filter === 'proposal-needed') return this.normalizeBool(row?.proposal_needed) === 'yes';
    if (filter === 'agreement-needed') return this.normalizeBool(row?.agreement_needed) === 'yes';
    if (filter === 'high-priority') return priority === 'high' || priority === 'urgent';
    if (filter === 'pipeline-value' || filter === 'weighted-pipeline' || filter === 'average-deal-size')
      return value > 0;
    if (filter === 'converted-from-leads')
      return !!String(row?.lead_id || '').trim() || !!String(row?.converted_at || '').trim();
    if (filter === 'unique-companies') return !!String(row?.company_name || '').trim();
    if (filter === 'unique-assignees') return !!String(row?.assigned_to || '').trim();
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.applyFilters();
    this.render();
  },
  syncKpiCardState() {
    const cards = document.querySelectorAll('#dealsAnalyticsGrid [data-kpi-filter]');
    cards.forEach(card => {
      const isActive = (card.getAttribute('data-kpi-filter') || 'total') === (this.state.kpiFilter || 'total');
      card.classList.toggle('kpi-filter-active', isActive);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
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
  computeDealAnalytics(deals = []) {
    const rows = Array.isArray(deals) ? deals : [];
    const stageBreakdown = {
      Prospect: 0,
      Qualified: 0,
      'Proposal Sent': 0,
      Negotiation: 0,
      'Verbal Commit': 0,
      Won: 0,
      Lost: 0
    };
    const statusBreakdown = {};
    const assigneeMap = {};
    const serviceMap = {};
    const sourceMap = {};
    const uniqueCompanies = new Set();
    const uniqueAssignees = new Set();
    const currencies = new Set();
    const stageProbability = {
      Prospect: 0.1,
      Qualified: 0.3,
      'Proposal Sent': 0.5,
      Negotiation: 0.7,
      'Verbal Commit': 0.85,
      Won: 1,
      Lost: 0
    };
    let openDeals = 0;
    let wonDeals = 0;
    let lostDeals = 0;
    let proposalNeededCount = 0;
    let agreementNeededCount = 0;
    let highPriorityCount = 0;
    let pipelineValue = 0;
    let weightedPipelineValue = 0;
    let validValueCount = 0;
    let wonValueTotal = 0;
    let wonValueCount = 0;
    let convertedFromLeadsCount = 0;

    rows.forEach(row => {
      const status = this.normalizeText(row?.status);
      const stage = this.normalizeStage(row?.stage);
      const value = this.toNumberSafe(row?.estimated_value);
      const priority = this.normalizeText(row?.priority);
      const statusLabel = String(row?.status || '').trim() || 'Unspecified';
      const companyName = String(row?.company_name || '').trim().toLowerCase();
      const assignee = String(row?.assigned_to || '').trim().toLowerCase();

      if (this.matchesOpenStatus(status)) openDeals += 1;
      if (this.matchesWonStatus(status)) wonDeals += 1;
      if (this.matchesLostStatus(status)) lostDeals += 1;
      if (this.normalizeBool(row?.proposal_needed) === 'yes') proposalNeededCount += 1;
      if (this.normalizeBool(row?.agreement_needed) === 'yes') agreementNeededCount += 1;
      if (priority === 'high' || priority === 'urgent') highPriorityCount += 1;
      if (String(row?.lead_id || '').trim() || String(row?.converted_at || '').trim()) convertedFromLeadsCount += 1;

      pipelineValue += value;
      if (value > 0) validValueCount += 1;
      if (this.matchesWonStatus(status) && value > 0) {
        wonValueTotal += value;
        wonValueCount += 1;
      }
      weightedPipelineValue += value * (stageProbability[stage] ?? 0);

      if (companyName) uniqueCompanies.add(companyName);
      if (assignee) uniqueAssignees.add(assignee);
      this.incrementMap(statusBreakdown, statusLabel);
      if (row?.assigned_to) this.incrementMap(assigneeMap, row.assigned_to);
      if (row?.service_interest) this.incrementMap(serviceMap, row.service_interest);
      if (row?.lead_source) this.incrementMap(sourceMap, row.lead_source);
      if (stageBreakdown[stage] === undefined) stageBreakdown[stage] = 0;
      stageBreakdown[stage] += 1;

      const currency = String(row?.currency || '')
        .trim()
        .toUpperCase();
      if (currency) currencies.add(currency);
    });

    const denominator = wonDeals + lostDeals;
    return {
      totalDeals: rows.length,
      openDeals,
      wonDeals,
      lostDeals,
      proposalNeededCount,
      agreementNeededCount,
      highPriorityCount,
      pipelineValue,
      weightedPipelineValue,
      winRate: denominator > 0 ? (wonDeals / denominator) * 100 : 0,
      averageDealSize: validValueCount > 0 ? pipelineValue / validValueCount : 0,
      averageWonDealSize: wonValueCount > 0 ? wonValueTotal / wonValueCount : 0,
      convertedFromLeadsCount,
      uniqueCompanies: uniqueCompanies.size,
      uniqueAssignees: uniqueAssignees.size,
      stageBreakdown,
      statusBreakdown,
      assigneeBreakdown: this.buildTopBreakdown(assigneeMap, 7),
      serviceBreakdown: this.buildTopBreakdown(serviceMap, 7),
      sourceBreakdown: this.buildTopBreakdown(sourceMap, 7),
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
  renderDealAnalytics(analytics) {
    const safe = analytics || this.computeDealAnalytics([]);
    const setText = (el, value) => {
      if (el) el.textContent = value;
    };

    setText(E.dealsKpiTotal, String(safe.totalDeals || 0));
    setText(E.dealsKpiOpen, String(safe.openDeals || 0));
    setText(E.dealsKpiWon, String(safe.wonDeals || 0));
    setText(E.dealsKpiLost, String(safe.lostDeals || 0));
    setText(E.dealsKpiProposalNeeded, String(safe.proposalNeededCount || 0));
    setText(E.dealsKpiAgreementNeeded, String(safe.agreementNeededCount || 0));
    setText(E.dealsKpiHighPriority, String(safe.highPriorityCount || 0));
    setText(E.dealsKpiWinRate, `${(safe.winRate || 0).toFixed(1)}%`);
    setText(E.dealsKpiConvertedFromLeads, String(safe.convertedFromLeadsCount || 0));
    setText(E.dealsKpiUniqueCompanies, String(safe.uniqueCompanies || 0));
    setText(E.dealsKpiUniqueAssignees, String(safe.uniqueAssignees || 0));

    setText(E.dealsKpiPipelineValue, this.formatValue(safe.pipelineValue, safe.pipelineCurrency, safe.hasMixedCurrencies));
    setText(
      E.dealsKpiWeightedPipelineValue,
      this.formatValue(safe.weightedPipelineValue, safe.pipelineCurrency, safe.hasMixedCurrencies)
    );
    setText(E.dealsKpiAverageDealSize, this.formatValue(safe.averageDealSize, safe.pipelineCurrency, safe.hasMixedCurrencies));
    setText(
      E.dealsKpiAverageWonDealSize,
      this.formatValue(safe.averageWonDealSize, safe.pipelineCurrency, safe.hasMixedCurrencies)
    );
    setText(
      E.dealsKpiPipelineSub,
      safe.pipelineCurrency && !safe.hasMixedCurrencies
        ? `Visible estimated value (${safe.pipelineCurrency})`
        : `Visible estimated value${safe.hasMixedCurrencies ? ' (mixed currencies)' : ''}`
    );
    setText(
      E.dealsKpiWeightedPipelineSub,
      safe.pipelineCurrency && !safe.hasMixedCurrencies
        ? `Stage weighted (${safe.pipelineCurrency})`
        : `Stage weighted${safe.hasMixedCurrencies ? ' (mixed currencies)' : ''}`
    );

    const stageOrder = ['Prospect', 'Qualified', 'Proposal Sent', 'Negotiation', 'Verbal Commit', 'Won', 'Lost'];
    const stageEntries = stageOrder.map(label => [label, safe.stageBreakdown?.[label] || 0]);
    const statusEntries = Object.entries(safe.statusBreakdown || {}).sort((a, b) => b[1] - a[1]);
    this.renderDistribution(E.dealsStageDistribution, stageEntries, safe.totalDeals || 0);
    this.renderDistribution(E.dealsStatusDistribution, statusEntries, safe.totalDeals || 0);
    this.renderDistribution(E.dealsAssigneeBreakdown, safe.assigneeBreakdown || [], safe.totalDeals || 0);
    this.renderDistribution(E.dealsServiceBreakdown, safe.serviceBreakdown || [], safe.totalDeals || 0);
    this.renderDistribution(E.dealsSourceBreakdown, safe.sourceBreakdown || [], safe.totalDeals || 0);
    this.syncKpiCardState();
  },
  applyFilters() {
    const convertedFrom = this.parseDateOnly(this.state.convertedFrom);
    const convertedTo = this.parseDateOnly(this.state.convertedTo);
    const searchTerms = String(this.state.search || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    this.state.filteredRows = this.state.rows.filter(row => {
      if (this.state.stage !== 'All' && row.stage !== this.state.stage) return false;
      if (this.state.status !== 'All' && row.status !== this.state.status) return false;
      if (this.state.priority !== 'All' && row.priority !== this.state.priority) return false;
      if (this.state.serviceInterest !== 'All' && row.service_interest !== this.state.serviceInterest)
        return false;
      if (this.state.leadSource !== 'All' && row.lead_source !== this.state.leadSource) return false;
      if (this.state.assignedTo !== 'All' && row.assigned_to !== this.state.assignedTo) return false;
      if (this.state.proposalNeeded !== 'All' && row.proposal_needed !== this.state.proposalNeeded)
        return false;
      if (this.state.agreementNeeded !== 'All' && row.agreement_needed !== this.state.agreementNeeded)
        return false;
      if (!this.matchesKpiFilter(row)) return false;
      if (convertedFrom || convertedTo) {
        const rowDate = this.parseDateOnly(row.converted_at);
        if (!rowDate) return false;
        if (convertedFrom && rowDate < convertedFrom) return false;
        if (convertedTo && rowDate > convertedTo) return false;
      }
      if (!searchTerms.length) return true;
      const hay = this.columns
        .map(column => String(row[column] ?? ''))
        .join(' ')
        .toLowerCase();
      return searchTerms.every(term => hay.includes(term));
    });
  },
  renderFilters() {
    const assign = (el, values = [], selected = 'All') => {
      if (!el) return;
      const options = ['All', ...this.uniqueSorted(values)];
      el.innerHTML = options.map(option => `<option>${U.escapeHtml(option)}</option>`).join('');
      if (options.includes(selected)) el.value = selected;
    };

    assign(E.dealsStageFilter, this.state.rows.map(row => row.stage), this.state.stage);
    assign(E.dealsStatusFilter, this.state.rows.map(row => row.status), this.state.status);
    assign(E.dealsPriorityFilter, this.state.rows.map(row => row.priority), this.state.priority);
    assign(
      E.dealsServiceInterestFilter,
      this.state.rows.map(row => row.service_interest),
      this.state.serviceInterest
    );
    assign(E.dealsLeadSourceFilter, this.state.rows.map(row => row.lead_source), this.state.leadSource);
    assign(E.dealsAssignedToFilter, this.state.rows.map(row => row.assigned_to), this.state.assignedTo);

    if (E.dealsProposalNeededFilter) E.dealsProposalNeededFilter.value = this.state.proposalNeeded;
    if (E.dealsAgreementNeededFilter) E.dealsAgreementNeededFilter.value = this.state.agreementNeeded;
    if (E.dealsStartDateFilter) E.dealsStartDateFilter.value = this.state.convertedFrom;
    if (E.dealsEndDateFilter) E.dealsEndDateFilter.value = this.state.convertedTo;
    if (E.dealsSidebarSearchInput) E.dealsSidebarSearchInput.value = this.state.search;
    if (E.dealsSearchInput) E.dealsSearchInput.value = this.state.search;
  },
  handleFilterChange() {
    this.applyFilters();
    this.render();
  },
  render() {
    if (!E.dealsState || !E.dealsTbody) return;
    this.updateExportButtonState();
    this.updateCreateButtonState();

    if (this.state.loading) {
      E.dealsState.textContent = 'Loading deals…';
      this.renderDealAnalytics(this.computeDealAnalytics([]));
      E.dealsTbody.innerHTML = Array.from({ length: 6 })
        .map(() => '<tr class="skeleton-row"><td colspan="23"><div class="skeleton-line" style="height:12px;margin:6px 0;"></div></td></tr>')
        .join('');
      return;
    }

    if (this.state.loadError) {
      E.dealsState.textContent = this.state.loadError;
      this.renderDealAnalytics(this.computeDealAnalytics([]));
      E.dealsTbody.innerHTML = `<tr><td colspan="23" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(
        this.state.loadError
      )}</td></tr>`;
      return;
    }

    const rows = this.state.filteredRows;
    this.renderDealAnalytics(this.computeDealAnalytics(rows));
    E.dealsState.textContent = `${rows.length} deal${rows.length === 1 ? '' : 's'} · page ${this.state.page}`;
    const paginationHost = U.ensurePaginationHost({ hostId: 'dealsPaginationControls', anchor: E.dealsState });
    U.renderPaginationControls({
      host: paginationHost,
      moduleKey: 'deals',
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
      E.dealsTbody.innerHTML = '<tr><td colspan="23" class="muted" style="text-align:center;">No deals found.</td></tr>';
      this.updateCreateButtonState();
      return;
    }

    const renderCell = (row, column) => {
      if (column === 'lead_id') return U.escapeHtml(this.displayLeadId(row) || '—');
      if (column === 'lead_code') return undefined;
      if (['converted_at', 'created_at', 'updated_at'].includes(column)) return this.formatDateTime(row[column]);
      if (column === 'proposal_needed' || column === 'agreement_needed') return U.escapeHtml(this.boolLabel(row[column]));
      const value = row[column];
      return U.escapeHtml(value === '' || value == null ? '—' : String(value));
    };

    E.dealsTbody.innerHTML = rows
      .map(row => {
        const actionButtons = [];
        if (this.canEdit()) {
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-deal-edit="${U.escapeAttr(row.id)}" data-permission-resource="deals" data-permission-action="update">Edit</button>`
          );
        }
        if (this.canDelete()) {
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-deal-delete="${U.escapeAttr(row.id)}" data-permission-resource="deals" data-permission-action="delete">Delete</button>`
          );
        }
        if (row.id && !this.isProposalAlreadyCreated(row) && this.canCreateProposalFromDeal()) {
          const inFlight = this.state.rowActionInFlight.has(`create-proposal:${row.id}`);
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-deal-create-proposal="${U.escapeAttr(
              row.id
            )}" data-permission-resource="proposals" data-permission-action="create" data-permission-resource="proposals" data-permission-action="create_from_deal" ${inFlight ? 'disabled' : ''}>Create Proposal</button>`
          );
        }
        const actions = actionButtons.length ? actionButtons.join(' ') : '<span class="muted">—</span>';
        return `<tr>${this.columns
          .filter(column => column !== 'lead_code')
          .map(column => `<td>${renderCell(row, column)}</td>`)
          .join('')}<td>${actions}</td></tr>`;
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
      const response = await this.listDeals({ forceRefresh: force, page: this.state.page, limit: this.state.limit });
      const responseRows = Array.isArray(response?.rows) ? response.rows : this.extractRows(response);
      this.state.rows = responseRows.map(item => this.normalizeDeal(item));
      this.state.returned = Number(response?.returned ?? this.state.rows.length) || this.state.rows.length;
      this.state.hasMore = Boolean(response?.hasMore);
      this.state.page = Number(response?.page || this.state.page || 1);
      this.state.limit = Number(response?.limit || this.state.limit || 50);
      this.state.offset = Number(response?.offset ?? Math.max(0, (this.state.page - 1) * this.state.limit));
      this.state.total = Number(response?.total ?? (this.state.offset + this.state.returned + (this.state.hasMore ? 1 : 0)));
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.syncDealFormDropdowns();
      this.renderFilters();
      this.applyFilters();
      this.render();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      this.state.rows = [];
      this.state.filteredRows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load deals right now.';
      this.render();
      UI.toast(this.state.loadError);
    } finally {
      this.state.loading = false;
      this.render();
    }
  },
  setFormBusy(v) {
    if (E.dealFormSaveBtn) {
      E.dealFormSaveBtn.disabled = !!v;
      E.dealFormSaveBtn.textContent = v ? 'Saving…' : 'Save';
    }
    if (E.dealFormDeleteBtn) E.dealFormDeleteBtn.disabled = !!v;
  },
  async getFullCompanyRecord(companyIdOrRecord) {
    if (!companyIdOrRecord) return null;
    if (typeof companyIdOrRecord === 'object') {
      const has = companyIdOrRecord.company_type || companyIdOrRecord.companyType || companyIdOrRecord.industry || companyIdOrRecord.website || companyIdOrRecord.main_email || companyIdOrRecord.mainEmail || companyIdOrRecord.main_phone || companyIdOrRecord.mainPhone || companyIdOrRecord.country || companyIdOrRecord.city || companyIdOrRecord.address || companyIdOrRecord.company_status || companyIdOrRecord.companyStatus;
      if (has) return this.normalizeCompany(companyIdOrRecord);
    }
    const companyId = typeof companyIdOrRecord === 'object' ? (companyIdOrRecord.company_id || companyIdOrRecord.companyId) : companyIdOrRecord;
    if (!companyId) return null;
    const response = await Api.requestWithSession('companies','list',{ filters:{ company_id: companyId }, limit:1 },{ requireAuth:true });
    const rows = response?.rows || response?.items || response?.data || [];
    const row = Array.isArray(rows) ? (rows[0] || null) : (rows || null);
    return row ? this.normalizeCompany(row) : null;
  },
  async getFullContactRecord(contactIdOrRecord) {
    if (!contactIdOrRecord) return null;
    if (typeof contactIdOrRecord === 'object') {
      const has = contactIdOrRecord.first_name || contactIdOrRecord.firstName || contactIdOrRecord.last_name || contactIdOrRecord.lastName || contactIdOrRecord.job_title || contactIdOrRecord.jobTitle || contactIdOrRecord.department || contactIdOrRecord.decision_role || contactIdOrRecord.decisionRole || contactIdOrRecord.contact_status || contactIdOrRecord.contactStatus;
      if (has) return this.normalizeContact(contactIdOrRecord);
    }
    const contactId = typeof contactIdOrRecord === 'object' ? (contactIdOrRecord.contact_id || contactIdOrRecord.contactId) : contactIdOrRecord;
    if (!contactId) return null;
    const response = await Api.requestWithSession('contacts','list',{ filters:{ contact_id: contactId }, limit:1 },{ requireAuth:true });
    const rows = response?.rows || response?.items || response?.data || [];
    const row = Array.isArray(rows) ? (rows[0] || null) : (rows || null);
    return row ? this.normalizeContact(row) : null;
  },
  setReadonlyField(node, value) {
    if (!node) return;
    node.value = value || '';
    node.readOnly = true;
    node.classList.add('readonly-field', 'locked-field');
    node.setAttribute('aria-readonly', 'true');
  },
  lockInput(node) {
    if (!node) return;
    node.readOnly = true;
    node.classList.add('readonly-field', 'locked-field');
    node.setAttribute('aria-readonly', 'true');
  },
  lockSelect(node) {
    if (!node) return;
    node.disabled = true;
    node.classList.add('readonly-field', 'locked-field');
    node.setAttribute('aria-disabled', 'true');
  },
  unlockSelect(node) {
    if (!node) return;
    node.disabled = false;
    node.classList.remove('readonly-field', 'locked-field');
    node.removeAttribute('aria-disabled');
  },
  lockCompanyContactFields({ lockCompanySelector = true, lockContactSelector = true } = {}) {
    [E.dealFormCompanyId, E.dealFormContactId, E.dealFormCompanyName, E.dealFormPhone, E.dealFormEmail, E.dealFormCountry].forEach(node => this.lockInput(node));
    if (lockCompanySelector) this.lockSelect(E.dealFormCompanySelector);
    if (lockContactSelector) this.lockSelect(E.dealFormContactSelector);
  },
  resetForm() {
    if (!E.dealForm) return;
    E.dealForm.reset();
    if (E.dealFormDealId) E.dealFormDealId.value = '';
    if (E.dealFormConvertedAt) {
      E.dealFormConvertedAt.value = '';
      E.dealFormConvertedAt.dataset.rawValue = '';
    }
    if (E.dealFormProposalNeeded) E.dealFormProposalNeeded.value = '';
    if (E.dealFormAgreementNeeded) E.dealFormAgreementNeeded.value = '';
    this.state.form.selectedLead = null;
    this.state.form.selectedCompany = null;
    this.state.form.selectedContact = null;
    this.state.form.companyId = '';
    this.state.form.contactId = '';
    this.state.form.lockLinks = false;
    if (E.dealFormCompanySelector) E.dealFormCompanySelector.value = '';
    if (E.dealFormContactSelector) E.dealFormContactSelector.value = '';
    if (E.dealFormCompanyId) E.dealFormCompanyId.value = '';
    if (E.dealFormContactId) E.dealFormContactId.value = '';
    [
      E.dealCompanyIdDisplay, E.dealCompanyNameDisplay, E.dealCompanyLegalNameDisplay, E.dealCompanyTypeDisplay, E.dealCompanyIndustryDisplay,
      E.dealCompanyWebsiteDisplay, E.dealCompanyMainEmailDisplay, E.dealCompanyMainPhoneDisplay, E.dealCompanyCountryDisplay,
      E.dealCompanyCityDisplay, E.dealCompanyAddressDisplay, E.dealCompanyTaxNumberDisplay, E.dealCompanyStatusDisplay,
      E.dealContactIdDisplay, E.dealContactFirstNameDisplay, E.dealContactLastNameDisplay,
      E.dealContactJobTitleDisplay, E.dealContactDepartmentDisplay, E.dealContactEmailDisplay, E.dealContactPhoneDisplay,
      E.dealContactMobileDisplay, E.dealContactDecisionRoleDisplay, E.dealContactPrimaryDisplay, E.dealContactStatusDisplay
    ].forEach(node => this.setReadonlyField(node, ''));
    this.lockCompanyContactFields({ lockCompanySelector: false, lockContactSelector: false });
    this.syncDealFormDropdowns();
  },
  currentUserAssignee() {
    return String(Session.displayName() || Session.username() || Session.user()?.email || '').trim();
  },
  async openForm(row = null) {
    if (!E.dealFormModal || !E.dealForm) return;
    const isEdit = !!row;
    E.dealForm.dataset.mode = isEdit ? 'edit' : 'create';
    E.dealForm.dataset.id = row?.id || '';
    if (E.dealFormTitle) E.dealFormTitle.textContent = isEdit ? 'Edit Deal' : 'Create Deal';
    this.resetForm();

    if (row) {
      this.state.form.selectedCompany = row.company_id ? { company_id: row.company_id, company_name: row.company_name || '' } : null;
      this.state.form.selectedContact = row.contact_id
        ? {
            contact_id: row.contact_id,
            full_name: row.contact_name || '',
            email: row.contact_email || '',
            phone: row.contact_phone || ''
          }
        : null;
      this.state.form.companyId = row.company_id || '';
      this.state.form.contactId = row.contact_id || '';
      this.state.form.lockLinks = true;
      if (E.dealFormDealId) E.dealFormDealId.value = row.deal_id || '';
      if (E.dealFormLeadId) {
        E.dealFormLeadId.dataset.leadUuid = row.lead_id || '';
        E.dealFormLeadId.dataset.leadCode = row.lead_code || '';
        E.dealFormLeadId.value = this.displayLeadId(row);
      }
            if (E.dealFormCompanyName) E.dealFormCompanyName.value = row.company_name || '';
      if (E.dealFormPhone) E.dealFormPhone.value = row.phone || '';
      if (E.dealFormEmail) E.dealFormEmail.value = row.email || '';
      if (E.dealFormCountry) E.dealFormCountry.value = row.country || '';
      if (E.dealFormLeadSource) E.dealFormLeadSource.value = row.lead_source || '';
      if (E.dealFormServiceInterest) E.dealFormServiceInterest.value = row.service_interest || '';
      if (E.dealFormStage) E.dealFormStage.value = row.stage || '';
      if (E.dealFormStatus) E.dealFormStatus.value = row.status || '';
      if (E.dealFormPriority) E.dealFormPriority.value = row.priority || '';
      if (E.dealFormEstimatedValue) {
        E.dealFormEstimatedValue.value = row.estimated_value === '' ? '' : String(row.estimated_value);
      }
      if (E.dealFormCurrency) E.dealFormCurrency.value = row.currency || '';
      if (E.dealFormAssignedTo) E.dealFormAssignedTo.value = row.assigned_to || '';
      if (E.dealFormProposalNeeded) E.dealFormProposalNeeded.value = row.proposal_needed || '';
      if (E.dealFormAgreementNeeded) E.dealFormAgreementNeeded.value = row.agreement_needed || '';
      if (E.dealFormConvertedBy) E.dealFormConvertedBy.value = row.converted_by || '';
      if (E.dealFormConvertedAt) {
        const convertedAtRaw = row.converted_at || '';
        E.dealFormConvertedAt.dataset.rawValue = convertedAtRaw;
        E.dealFormConvertedAt.value = convertedAtRaw ? U.formatDateTimeMMDDYYYYHHMM(convertedAtRaw) : '';
      }
      if (E.dealFormNotes) E.dealFormNotes.value = row.notes || '';
      this.hydrateLeadCodeFromLeadUuid(row);
      const companyId = row.company_id || row.companyId || '';
      const contactId = row.contact_id || row.contactId || '';
      if (companyId) {
        const company = await this.getFullCompanyRecord(companyId);
        this.hydrateDealFromCompany(company || { company_id: companyId, company_name: row.company_name || row.companyName || '', country: row.country || '' });
      }
      if (contactId) {
        const contact = await this.getFullContactRecord(contactId);
        this.hydrateDealFromContact(contact || { contact_id: contactId, full_name: row.contact_name || row.contactName || row.full_name || '', email: row.contact_email || row.contactEmail || row.email || '', phone: row.contact_phone || row.contactPhone || row.phone || '' });
      }
      this.lockCompanyContactFields();
      this.syncDealFormDropdowns({
        lead_source: row.lead_source || '',
        service_interest: row.service_interest || '',
        stage: row.stage || '',
        status: row.status || '',
        priority: row.priority || '',
        currency: row.currency || ''
      });
    } else {
      if (E.dealFormDealId) E.dealFormDealId.value = 'Auto-generated';
      if (E.dealFormLeadId) {
        E.dealFormLeadId.dataset.leadUuid = '';
        E.dealFormLeadId.dataset.leadCode = '';
      }
      if (E.dealFormConvertedAt) {
        E.dealFormConvertedAt.dataset.rawValue = '';
        E.dealFormConvertedAt.value = '';
      }
      if (E.dealFormAssignedTo) E.dealFormAssignedTo.value = this.currentUserAssignee();
      this.unlockSelect(E.dealFormCompanySelector);
      this.unlockSelect(E.dealFormContactSelector);
      this.lockCompanyContactFields({ lockCompanySelector: false, lockContactSelector: false });
      this.syncDealFormDropdowns();
    }

    if (E.dealFormDeleteBtn) E.dealFormDeleteBtn.style.display = isEdit && this.canEditDelete() ? '' : 'none';
    if (E.dealFormSaveBtn) E.dealFormSaveBtn.disabled = false;
    E.dealFormModal.style.display = 'flex';
    E.dealFormModal.setAttribute('aria-hidden', 'false');
    if (window.setAppHashRoute && window.buildRecordHashRoute) setAppHashRoute(buildRecordHashRoute('deals', row || {}));
  },
  hydrateDealFromCompany(company = {}) {
    const c = this.normalizeCompany(company);
    this.state.form.selectedCompany = c.company_id ? c : null;
    this.state.form.companyId = c.company_id || '';
    if (E.dealFormCompanyId) E.dealFormCompanyId.value = c.company_id || '';
    if (E.dealFormCompanySelector) E.dealFormCompanySelector.value = c.company_id || '';
    if (E.dealFormCompanyName) E.dealFormCompanyName.value = c.company_name || '';
    if (E.dealFormCountry) E.dealFormCountry.value = c.country || '';
    this.setReadonlyField(E.dealCompanyIdDisplay, c.company_id);
    this.setReadonlyField(E.dealCompanyNameDisplay, c.company_name);
    this.setReadonlyField(E.dealCompanyLegalNameDisplay, U.getCustomerLegalName(c, c));
    this.setReadonlyField(E.dealCompanyTypeDisplay, this.formatCompanyType(c.company_type));
    this.setReadonlyField(E.dealCompanyIndustryDisplay, this.formatCompanyIndustry(c.industry));
    this.setReadonlyField(E.dealCompanyWebsiteDisplay, c.website);
    this.setReadonlyField(E.dealCompanyMainEmailDisplay, c.main_email);
    this.setReadonlyField(E.dealCompanyMainPhoneDisplay, c.main_phone);
    this.setReadonlyField(E.dealCompanyCountryDisplay, c.country);
    this.setReadonlyField(E.dealCompanyCityDisplay, c.city);
    this.setReadonlyField(E.dealCompanyAddressDisplay, c.address);
    this.setReadonlyField(E.dealCompanyTaxNumberDisplay, c.tax_number);
    this.setReadonlyField(E.dealCompanyStatusDisplay, c.company_status);
    const shouldLockPartySelectors = E.dealForm?.dataset.mode === 'edit' || this.state.form.lockLinks;
    this.lockCompanyContactFields({ lockCompanySelector: shouldLockPartySelectors && !!c.company_id, lockContactSelector: shouldLockPartySelectors && !!this.state.form.contactId });
  },
  hydrateDealFromContact(contact = {}) {
    const c = this.normalizeContact(contact);
    this.state.form.selectedContact = c.contact_id ? c : null;
    this.state.form.contactId = c.contact_id || '';
    if (E.dealFormContactId) E.dealFormContactId.value = c.contact_id || '';
    if (E.dealFormContactSelector) E.dealFormContactSelector.value = c.contact_id || '';
        if (E.dealFormPhone) E.dealFormPhone.value = c.phone || c.mobile || '';
    if (E.dealFormEmail) E.dealFormEmail.value = c.email || '';
    this.setReadonlyField(E.dealContactIdDisplay, c.contact_id);
        this.setReadonlyField(E.dealContactFirstNameDisplay, c.first_name);
    this.setReadonlyField(E.dealContactLastNameDisplay, c.last_name);
    this.setReadonlyField(E.dealContactJobTitleDisplay, c.job_title);
    this.setReadonlyField(E.dealContactDepartmentDisplay, c.department);
    this.setReadonlyField(E.dealContactEmailDisplay, c.email);
    this.setReadonlyField(E.dealContactPhoneDisplay, c.phone);
    this.setReadonlyField(E.dealContactMobileDisplay, c.mobile);
    this.setReadonlyField(E.dealContactDecisionRoleDisplay, c.decision_role);
    this.setReadonlyField(E.dealContactPrimaryDisplay, c.is_primary_contact ? 'Yes' : 'No');
    this.setReadonlyField(E.dealContactStatusDisplay, c.contact_status);
    const shouldLockPartySelectors = E.dealForm?.dataset.mode === 'edit' || this.state.form.lockLinks;
    this.lockCompanyContactFields({ lockCompanySelector: shouldLockPartySelectors && !!this.state.form.companyId, lockContactSelector: shouldLockPartySelectors && !!c.contact_id });
  },
  closeForm() {
    if (!E.dealFormModal) return;
    E.dealFormModal.style.display = 'none';
    E.dealFormModal.setAttribute('aria-hidden', 'true');
    if (window.setAppHashRoute) setAppHashRoute('#crm?tab=deals');
  },
  collectFormData() {
    const mode = E.dealForm?.dataset.mode === 'edit' ? 'edit' : 'create';
    const leadField = E.dealFormLeadId;
    const editLeadUuid = String(leadField?.dataset?.leadUuid || '').trim();
    const editLeadCode = String(leadField?.dataset?.leadCode || '').trim();
    const selectedCompany = this.normalizeCompany(this.state.form.selectedCompany || {});
    const selectedContact = this.normalizeContact(this.state.form.selectedContact || {});
    const companyId = selectedCompany.company_id || this.state.form.companyId || E.dealFormCompanyId?.value || E.dealFormCompanySelector?.value || '';
    const companyName = selectedCompany.company_name || E.dealFormCompanyName?.value || '';
    const contactId = selectedContact.contact_id || this.state.form.contactId || E.dealFormContactId?.value || E.dealFormContactSelector?.value || '';
    const contactName = U.buildContactDisplayName(selectedContact); 
    const customerName = U.getCustomerLegalName(selectedCompany, { company_name: companyName });
    const contactEmail = selectedContact.email || E.dealFormEmail?.value || '';
    const contactPhone = selectedContact.phone || selectedContact.mobile || E.dealFormPhone?.value || '';
    return {
      deal_id:
        String(E.dealFormDealId?.value || '').trim() === 'Auto-generated'
          ? ''
          : String(E.dealFormDealId?.value || '').trim(),
      lead_id: mode === 'edit' ? editLeadUuid : String(E.dealFormLeadId?.value || '').trim(),
      lead_code: mode === 'edit' ? editLeadCode : '',
      full_name: String(contactName || '').trim(),
      company_id: String(companyId).trim(),
      company_name: String(companyName).trim(),
      customer_name: customerName,
      customer_legal_name: customerName,
      customer_address: String(selectedCompany.address || '').trim(),
      contact_id: String(contactId).trim(),
      contact_name: String(contactName).trim(),
      contact_email: String(contactEmail).trim(),
      contact_phone: String(contactPhone).trim(),
      phone: String(contactPhone).trim(),
      email: String(contactEmail).trim(),
      country: String(selectedCompany.country || E.dealFormCountry?.value || '').trim(),
      lead_source: String(E.dealFormLeadSource?.value || '').trim(),
      service_interest: String(E.dealFormServiceInterest?.value || '').trim(),
      stage: String(E.dealFormStage?.value || '').trim(),
      status: String(E.dealFormStatus?.value || '').trim(),
      priority: String(E.dealFormPriority?.value || '').trim(),
      estimated_value: String(E.dealFormEstimatedValue?.value || '').trim(),
      currency: String(E.dealFormCurrency?.value || '').trim(),
      assigned_to: String(E.dealFormAssignedTo?.value || '').trim(),
      proposal_needed: this.normalizeBool(E.dealFormProposalNeeded?.value || ''),
      agreement_needed: this.normalizeBool(E.dealFormAgreementNeeded?.value || ''),
      converted_by: String(E.dealFormConvertedBy?.value || '').trim(),
      converted_at: String(E.dealFormConvertedAt?.dataset?.rawValue || '').trim(),
      notes: String(E.dealFormNotes?.value || '').trim()
    };
  },
  async ensureCompanyContactHydratedBeforeSave() {
    const companyId = this.state.form.selectedCompany?.company_id || this.state.form.companyId || E.dealFormCompanyId?.value || E.dealFormCompanySelector?.value || '';
    const contactId = this.state.form.selectedContact?.contact_id || this.state.form.contactId || E.dealFormContactId?.value || E.dealFormContactSelector?.value || '';
    if (companyId && !this.state.form.selectedCompany?.company_name) {
      const company = await this.getFullCompanyRecord(companyId);
      if (company) this.hydrateDealFromCompany(company);
    }
    if (contactId && !this.state.form.selectedContact?.full_name) {
      const contact = await this.getFullContactRecord(contactId);
      if (contact) this.hydrateDealFromContact(contact);
    }
  },
  async submitForm() {
    if (this.state.saveInFlight) return;
    const mode = E.dealForm?.dataset.mode === 'edit' ? 'edit' : 'create';
    if (mode === 'edit' && !canAnyPermission([['deals', 'update'], ['deals', 'manage']])) {
      UI.toast('You do not have permission to update deals.');
      return;
    }
    if (mode !== 'edit' && !this.canCreate()) {
      UI.toast('You do not have permission to create deals.');
      return;
    }

    const dealId = String(E.dealForm?.dataset.id || '').trim();
    await this.ensureCompanyContactHydratedBeforeSave();
    const deal = this.collectFormData();
    const isDirectCreate = mode !== 'edit' && !String(deal.lead_id || '').trim();
    if (isDirectCreate && !String(deal.company_id || '').trim()) {
      UI.toast('Please select a company.');
      return;
    }
    if (isDirectCreate && !String(deal.contact_id || '').trim()) {
      UI.toast('Please select a contact.');
      return;
    }
    if (!deal.full_name && !deal.company_name) {
      UI.toast('Full name or company name is required.');
      return;
    }

    this.setFormBusy(true);
    this.state.saveInFlight = true;
    console.time('entity-save');
    try {
      if (mode === 'edit') {
        console.log('[deal edit] save payload', deal);
        const response = await this.updateDeal(dealId, deal);
        this.upsertLocalRow(response || { ...deal, id: dealId });
        UI.toast('Deal updated.');
      } else {
        console.log('[deal edit] save payload', deal);
        const response = await this.createDeal(deal);
        this.upsertLocalRow(response || deal);
        UI.toast('Deal created.');
      }
      this.closeForm();
      this.rerenderVisibleTable();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to save deal: ' + (error?.message || 'Unknown error'));
    } finally {
      console.timeEnd('entity-save');
      this.state.saveInFlight = false;
      this.setFormBusy(false);
    }
  },
  async deleteDealById(dealUuid) {
    if (!this.canEditDelete()) {
      UI.toast('Only admin/dev can delete deals.');
      return;
    }
    const row = this.state.rows.find(item => item.id === dealUuid);
    const label = row?.deal_id || dealUuid;
    const confirmed = window.confirm(`Delete deal ${label}?`);
    if (!confirmed) return;

    this.setFormBusy(true);
    try {
      await this.deleteDeal(dealUuid);
      this.removeLocalRow(dealUuid);
      UI.toast('Deal deleted.');
      this.closeForm();
      this.rerenderVisibleTable();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to delete deal: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  wire() {
    if (this.state.initialized) return;

    const bindState = (el, key) => {
      if (!el) return;
      const sync = () => {
        this.state[key] = String(el.value || '').trim();
        if (key === 'search') {
          if (E.dealsSidebarSearchInput && el !== E.dealsSidebarSearchInput)
            E.dealsSidebarSearchInput.value = this.state.search;
          if (E.dealsSearchInput && el !== E.dealsSearchInput) E.dealsSearchInput.value = this.state.search;
        }
        this.state.page = 1;
        this.loadAndRefresh({ force: true });
      };
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    };

    bindState(E.dealsSearchInput, 'search');
    bindState(E.dealsSidebarSearchInput, 'search');
    bindState(E.dealsStageFilter, 'stage');
    bindState(E.dealsStatusFilter, 'status');
    bindState(E.dealsPriorityFilter, 'priority');
    bindState(E.dealsServiceInterestFilter, 'serviceInterest');
    bindState(E.dealsLeadSourceFilter, 'leadSource');
    bindState(E.dealsAssignedToFilter, 'assignedTo');
    bindState(E.dealsProposalNeededFilter, 'proposalNeeded');
    bindState(E.dealsAgreementNeededFilter, 'agreementNeeded');
    bindState(E.dealsStartDateFilter, 'convertedFrom');
    bindState(E.dealsEndDateFilter, 'convertedTo');

    if (E.dealsResetBtn) {
      E.dealsResetBtn.addEventListener('click', () => {
        this.state.search = '';
        this.state.stage = 'All';
        this.state.status = 'All';
        this.state.priority = 'All';
        this.state.serviceInterest = 'All';
        this.state.leadSource = 'All';
        this.state.assignedTo = 'All';
        this.state.proposalNeeded = 'All';
        this.state.agreementNeeded = 'All';
        this.state.convertedFrom = '';
        this.state.convertedTo = '';
        this.state.kpiFilter = 'total';
        this.state.page = 1;
        this.loadAndRefresh({ force: true });
      });
    }

    if (E.dealsRefreshBtn) {
      E.dealsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    }
    if (E.dealsExportCsvBtn) {
      E.dealsExportCsvBtn.addEventListener('click', () => this.exportDealsCsv());
    }

    if (E.dealsCreateBtn) {
      E.dealsCreateBtn.addEventListener('click', () => {
        if (!this.canCreate()) {
          UI.toast('You do not have permission to create deals.');
          return;
        }
        this.openForm();
      });
    }

    if (E.dealsTbody) {
      E.dealsTbody.addEventListener('click', event => {
        const editId = event.target?.getAttribute('data-deal-edit');
        if (editId) {
          if (!this.canEdit()) return UI.toast('You do not have permission to edit deals.');
          const row = this.state.rows.find(item => item.id === editId);
          if (row) this.openForm(row);
          return;
        }
        const deleteId = event.target?.getAttribute('data-deal-delete');
        if (deleteId) {
          if (!this.canDelete()) return UI.toast('You do not have permission to delete deals.');
          this.deleteDealById(deleteId);
        }
        const createProposalDealId = event.target?.getAttribute('data-deal-create-proposal');
        if (createProposalDealId && window.Proposals?.createFromDealFlow) {
          if (!this.canCreateProposalFromDeal()) return UI.toast('You do not have permission to create proposals from deals.');
          const actionKey = `create-proposal:${createProposalDealId}`;
          if (this.state.rowActionInFlight.has(actionKey)) return;
          this.state.rowActionInFlight.add(actionKey);
          const trigger = event.target?.closest?.('button');
          if (trigger && 'disabled' in trigger) trigger.disabled = true;
          Promise.resolve(
            Proposals.createFromDealFlow(createProposalDealId, { openAfterCreate: true })
          ).finally(() => {
            this.state.rowActionInFlight.delete(actionKey);
            if (trigger && 'disabled' in trigger) trigger.disabled = false;
            this.render();
          });
        }
      });
    }
    const dealsAnalyticsGrid = document.getElementById('dealsAnalyticsGrid');
    if (dealsAnalyticsGrid) {
      const activate = card => {
        if (!card) return;
        const filter = card.getAttribute('data-kpi-filter');
        if (!filter) return;
        this.applyKpiFilter(filter);
      };
      dealsAnalyticsGrid.addEventListener('click', event => {
        activate(event.target?.closest?.('[data-kpi-filter]'));
      });
      dealsAnalyticsGrid.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target?.closest?.('[data-kpi-filter]');
        if (!card) return;
        event.preventDefault();
        activate(card);
      });
    }

    if (E.dealFormCloseBtn) E.dealFormCloseBtn.addEventListener('click', () => this.closeForm());
    if (E.dealFormCancelBtn) E.dealFormCancelBtn.addEventListener('click', () => this.closeForm());
    if (E.dealFormModal) {
      E.dealFormModal.addEventListener('click', event => {
        if (event.target === E.dealFormModal) this.closeForm();
      });
    }
    if (E.dealForm) {
      E.dealForm.addEventListener('submit', event => {
        event.preventDefault();
        this.submitForm();
      });
    }
    if (E.dealFormDeleteBtn) {
      E.dealFormDeleteBtn.addEventListener('click', () => {
        const id = String(E.dealForm?.dataset.id || '').trim();
        if (id) this.deleteDealById(id);
      });
    }
    if (E.dealFormCompanySelector) {
      E.dealFormCompanySelector.addEventListener('change', async () => {
        const companyId = String(E.dealFormCompanySelector.value || '').trim();
        if (!companyId) return;
        const company = await this.getFullCompanyRecord(companyId);
        if (!company) return;
        this.hydrateDealFromCompany(company);
        if (E.dealForm?.dataset.mode !== 'edit') {
          this.unlockSelect(E.dealFormCompanySelector);
          this.unlockSelect(E.dealFormContactSelector);
        }
        window.CrmCompanyContactSelectors?.refresh?.().catch?.(() => {});
      });
    }
    if (E.dealFormContactSelector) {
      E.dealFormContactSelector.addEventListener('change', async () => {
        const contactId = String(E.dealFormContactSelector.value || '').trim();
        if (!contactId) return;
        const contact = await this.getFullContactRecord(contactId);
        if (!contact) return;
        this.hydrateDealFromContact(contact);
        if (E.dealForm?.dataset.mode !== 'edit') {
          this.unlockSelect(E.dealFormCompanySelector);
          this.unlockSelect(E.dealFormContactSelector);
        }
      });
    }

    this.state.initialized = true;
  }
};

window.Deals = Deals;
