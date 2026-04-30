const Leads = {
  formDropdownDefaults: {
    lead_source: ['Website', 'Referral', 'LinkedIn', 'Email', 'Call', 'WhatsApp', 'Event', 'Other'],
    service_interest: ['Software' , 'Other' , 'Consulting'],
    status: ['New', 'Qualified', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'On Hold'],
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
    lastSyncedAt: '',
    search: '',
    status: 'All',
    serviceInterest: 'All',
    assignedTo: 'All',
    proposalNeeded: 'All',
    agreementNeeded: 'All',
    createdFrom: '',
    createdTo: '',
    kpiFilter: 'total',
    initialized: false,
    saveInFlight: false,
    page: 1,
    limit: 50,
    offset: 0,
    total: 0,
    returned: 0,
    hasMore: false,
    selectedCompany: null,
    selectedContact: null,
    companyPickerRows: [],
    contactPickerRows: []
  },

  el(idOrKey) {
    return E?.[idOrKey] || document.getElementById(idOrKey) || null;
  },
  pick(obj = {}, ...keys) {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  },
  normalizeCompany(raw = {}) {
    return { ...raw, company_id: String(this.pick(raw, 'company_id', 'companyId')).trim(), company_name: String(this.pick(raw, 'company_name', 'companyName')).trim(), legal_name: String(this.pick(raw, 'legal_name', 'legalName')).trim(), company_type: String(this.pick(raw, 'company_type', 'companyType')).trim(), industry: String(this.pick(raw, 'industry')).trim(), website: String(this.pick(raw, 'website')).trim(), main_email: String(this.pick(raw, 'main_email', 'mainEmail')).trim(), main_phone: String(this.pick(raw, 'main_phone', 'mainPhone')).trim(), country: String(this.pick(raw, 'country')).trim(), city: String(this.pick(raw, 'city')).trim(), address: String(this.pick(raw, 'address')).trim(), tax_number: String(this.pick(raw, 'tax_number', 'taxNumber')).trim(), company_status: String(this.pick(raw, 'company_status', 'companyStatus')).trim(), source: String(this.pick(raw, 'source')).trim(), owner_name: String(this.pick(raw, 'owner_name', 'ownerName')).trim(), owner_email: String(this.pick(raw, 'owner_email', 'ownerEmail')).trim(), notes: String(this.pick(raw, 'notes')).trim() };
  },
  normalizeContact(raw = {}) {
    const fullName = U.buildContactDisplayName(raw);
    return { ...raw, contact_id: String(this.pick(raw, 'contact_id', 'contactId')).trim(), company_id: String(this.pick(raw, 'company_id', 'companyId')).trim(), company_name: String(this.pick(raw, 'company_name', 'companyName')).trim(), first_name: String(this.pick(raw, 'first_name', 'firstName')).trim(), last_name: String(this.pick(raw, 'last_name', 'lastName')).trim(), full_name: fullName, job_title: String(this.pick(raw, 'job_title', 'jobTitle')).trim(), department: String(this.pick(raw, 'department')).trim(), email: String(this.pick(raw, 'email')).trim(), phone: String(this.pick(raw, 'phone')).trim(), mobile: String(this.pick(raw, 'mobile')).trim(), decision_role: String(this.pick(raw, 'decision_role', 'decisionRole')).trim(), is_primary_contact: Boolean(raw?.is_primary_contact ?? raw?.isPrimaryContact), contact_status: String(this.pick(raw, 'contact_status', 'contactStatus')).trim(), notes: String(this.pick(raw, 'notes')).trim() };
  },
  normalizeBool(value) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return 'yes';
    if (['false', '0', 'no', 'n'].includes(normalized)) return 'no';
    return '';
  },
  normalizeLead(raw = {}) {
    const id = String(raw.id || '').trim();
    const leadId = String(raw.lead_id || raw.leadId || '').trim();
    return {
      id,
      lead_id: leadId,
      created_at: raw.created_at || raw.createdAt || '',
      full_name: String(raw.full_name || raw.fullName || '').trim(),
      company_name: String(raw.company_name || raw.companyName || '').trim(),
      customer_name: String(raw.customer_name || raw.customerName || '').trim(),
      customer_legal_name: String(raw.customer_legal_name || raw.customerLegalName || '').trim(),
      customer_address: String(raw.customer_address || raw.customerAddress || '').trim(),
      company_id: String(raw.company_id || raw.companyId || '').trim(),
      contact_id: String(raw.contact_id || raw.contactId || '').trim(),
      contact_name: String(raw.contact_name || raw.contactName || '').trim(),
      contact_email: String(raw.contact_email || raw.contactEmail || '').trim(),
      contact_phone: String(raw.contact_phone || raw.contactPhone || '').trim(),
      phone: String(raw.phone || '').trim(),
      email: String(raw.email || '').trim(),
      country: String(raw.country || '').trim(),
      lead_source: String(raw.lead_source || raw.leadSource || '').trim(),
      service_interest: String(raw.service_interest || raw.serviceInterest || '').trim(),
      status: String(raw.status || '').trim(),
      priority: String(raw.priority || '').trim(),
      estimated_value: raw.estimated_value ?? raw.estimatedValue ?? '',
      currency: String(raw.currency || '').trim(),
      assigned_to: String(raw.assigned_to || raw.assignedTo || '').trim(),
      next_follow_up:
        raw.next_follow_up ||
        raw.nextFollowUp ||
        raw.next_followup_date ||
        raw.nextFollowupDate ||
        '',
      last_contact:
        raw.last_contact ||
        raw.lastContact ||
        raw.last_contact_date ||
        raw.lastContactDate ||
        '',
      proposal_needed: this.normalizeBool(raw.proposal_needed),
      agreement_needed: this.normalizeBool(raw.agreement_needed),
      notes: String(raw.notes || '').trim(),
      updated_at: raw.updated_at || raw.updatedAt || '',
      converted_at: raw.converted_at || raw.convertedAt || '',
      deal_id: String(raw.deal_id || raw.converted_to_deal_id || raw.deal_id_ref || raw.converted_deal_id || '').trim()
    };
  },
  generateLeadId() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `LEAD-${yyyy}${mm}${dd}-${Date.now()}-${rand}`;
  },
  backendLead(lead, { includeLeadId = true } = {}) {
    const leadIdValue = String(lead.lead_id || '').trim();
    const estimatedValueRaw = lead.estimated_value;
    const estimatedValueParsed =
      estimatedValueRaw === '' || estimatedValueRaw === null || estimatedValueRaw === undefined
        ? null
        : Number(estimatedValueRaw);
    return {
      ...(includeLeadId ? { lead_id: leadIdValue || null } : {}),
      full_name: String(lead.full_name || ''),
      company_name: String(lead.company_name || ''),
      customer_name: String(lead.customer_name || ''),
      customer_legal_name: String(lead.customer_legal_name || ''),
      customer_address: String(lead.customer_address || ''),
      company_id: String(lead.company_id || ''),
      contact_id: String(lead.contact_id || ''),
      contact_name: String(lead.contact_name || ''),
      contact_email: String(lead.contact_email || ''),
      contact_phone: String(lead.contact_phone || ''),
      phone: String(lead.phone || ''),
      email: String(lead.email || ''),
      country: String(lead.country || ''),
      lead_source: String(lead.lead_source || ''),
      service_interest: String(lead.service_interest || ''),
      status: String(lead.status || ''),
      priority: String(lead.priority || ''),
      estimated_value: Number.isFinite(estimatedValueParsed) ? estimatedValueParsed : null,
      currency: String(lead.currency || ''),
      assigned_to: String(lead.assigned_to || ''),
      next_follow_up: lead.next_follow_up || null,
      last_contact: lead.last_contact || null,
      proposal_needed: lead.proposal_needed ? lead.proposal_needed === 'yes' : null,
      agreement_needed: lead.agreement_needed ? lead.agreement_needed === 'yes' : null,
      notes: String(lead.notes || '')
    };
  },
  extractRows(response) {
    const candidates = [
      response,
      response?.leads,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.leads,
      response?.result?.leads,
      response?.payload?.leads
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
  collectServerFilters() {
    const filters = {};
    if (this.state.status !== 'All') filters.status = this.state.status;
    if (this.state.serviceInterest !== 'All') filters.service_interest = this.state.serviceInterest;
    if (this.state.assignedTo !== 'All') filters.assigned_to = this.state.assignedTo;
    if (this.state.proposalNeeded !== 'All') filters.proposal_needed = this.state.proposalNeeded === 'yes';
    if (this.state.agreementNeeded !== 'All') filters.agreement_needed = this.state.agreementNeeded === 'yes';
    if (this.state.search) filters.search = this.state.search;
    return filters;
  },
  async listLeads(options = {}) {
    const client = this.getClient();
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.max(1, Math.min(200, Number(options.limit || options.pageSize) || 50));
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    let query = client.from('leads').select('*').order('updated_at', { ascending: false });
    const filters = this.collectServerFilters();
    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'search') return;
      query = query.eq(key, value);
    });
    if (filters.search) {
      const term = String(filters.search).replace(/[%_]/g, ' ').trim();
      if (term) {
        query = query.or(
          `lead_id.ilike.%${term}%,full_name.ilike.%${term}%,company_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,country.ilike.%${term}%,lead_source.ilike.%${term}%,service_interest.ilike.%${term}%,assigned_to.ilike.%${term}%,notes.ilike.%${term}%`
        );
      }
    }
    query = query.range(from, to);
    const { data, error } = await query;
    if (error) throw this.toSupabaseError('Unable to load leads', error);
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
    const normalized = this.normalizeLead(row);
    const idx = this.state.rows.findIndex(item => item.id === normalized.id);
    if (idx === -1) this.state.rows.unshift(normalized);
    else this.state.rows[idx] = { ...this.state.rows[idx], ...normalized };
    this.rerenderVisibleTable();
    return normalized;
  },
  removeLocalRow(id) {
    const before = this.state.rows.length;
    this.state.rows = this.state.rows.filter(item => item.id !== id);
    if (this.state.rows.length !== before) this.rerenderVisibleTable();
  },
  rerenderVisibleTable() {
    this.applyFilters();
    this.renderFilters();
    this.render();
  },
  rerenderSummaryIfNeeded() {
    this.renderLeadAnalytics(this.computeLeadAnalytics(this.state.filteredRows));
  },
  async getLead(id) {
    const { data, error } = await this.getClient().from('leads').select('*').eq('id', id).single();
    if (error) throw this.toSupabaseError('Unable to load lead details', error);
    return data;
  },
  async createLead(lead) {
    const userId = await this.getCurrentUserId();
    const payload = {
      ...this.backendLead(lead),
      created_by: userId || undefined,
      updated_by: userId || undefined
    };
    console.log('[leads] create payload', payload);
    const data = await Api.requestWithSession('leads', 'create', payload, { requireAuth: true });
    console.log('[leads] saved row', data);
    await Api.safeSendBusinessPwaPush({
      resource: 'leads',
      action: 'lead_created',
      recordId: Api.extractBusinessRecordId(data, payload.lead_id || lead?.lead_id || ''),
      title: 'New lead created',
      body: 'New lead created for ' + (payload.company_name || payload.company || payload.client_name || payload.name || 'a customer') + '.',
      roles: ['admin', 'hoo'],
      url: '/#leads'
    });
    return data;
  },
  async updateLead(leadId, updates) {
    const userId = await this.getCurrentUserId();
    const payload = {
      ...this.backendLead(updates),
      updated_by: userId || undefined
    };
    console.log('[leads] update payload', payload);
    const data = await Api.requestWithSession('leads', 'update', {
      id: leadId,
      updates: payload
    }, { requireAuth: true });
    console.log('[leads] saved row', data);
    await Api.safeSendBusinessPwaPush({
      resource: 'leads',
      action: 'lead_updated',
      recordId: Api.extractBusinessRecordId(data, leadId),
      title: 'Lead updated',
      body: 'Lead ' + (leadId || '') + ' was updated.',
      roles: ['admin', 'hoo'],
      url: leadId ? '/#leads?id=' + encodeURIComponent(leadId) : '/#leads'
    });
    return data;
  },
  async deleteLead(leadId) {
    const { error } = await this.getClient().from('leads').delete().eq('id', leadId);
    if (error) throw this.toSupabaseError('Unable to delete lead', error);
    return { ok: true };
  },
  isUnsupportedConvertActionError(error) {
    const message = String(error?.message || '')
      .trim()
      .toLowerCase();
    if (!message) return false;
    return (
      message.includes('not found') ||
      message.includes('unknown action') ||
      message.includes('unsupported action') ||
      message.includes('invalid action') ||
      message.includes('no handler') ||
      message.includes('not implemented')
    );
  },
  async convertToDeal(leadId) {
    const data = await Api.requestWithSession('leads', 'convert_to_deal', { id: leadId, lead_id: leadId }, { requireAuth: true });
    await Api.safeSendBusinessPwaPush({
      resource: 'deals',
      action: 'deal_created_from_lead',
      recordId: Api.extractBusinessRecordId(data, leadId),
      title: 'Deal created from lead',
      body: 'A deal was created from lead ' + (leadId || '') + '.',
      roles: ['admin', 'hoo'],
      url: '/#deals'
    });
    return data;
  },
  currentConverterIdentity() {
    return String(Session.displayName() || Session.username() || Session.user()?.email || '').trim();
  },
  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || '').trim()
    );
  },
  async resolveLeadUuid(leadUuidOrBusinessId) {
    const candidate = String(leadUuidOrBusinessId || '').trim();
    if (!candidate) return '';
    if (this.isUuid(candidate)) return candidate;
    const { data, error } = await this.getClient()
      .from('leads')
      .select('id')
      .eq('lead_id', candidate)
      .limit(1);
    if (error) throw this.toSupabaseError('Unable to resolve lead UUID', error);
    return String(Array.isArray(data) && data[0]?.id ? data[0].id : '').trim();
  },
  async findDealByLeadUuid(leadUuidOrBusinessId) {
    const leadUuid = await this.resolveLeadUuid(leadUuidOrBusinessId);
    if (!leadUuid) return null;
    const { data, error } = await this.getClient()
      .from('deals')
      .select('*')
      .eq('lead_id', leadUuid)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw this.toSupabaseError('Unable to check existing deal', error);
    return Array.isArray(data) && data.length ? data[0] : null;
  },
  buildDealFromLead(lead, company = {}) {
    const converter = this.currentConverterIdentity();
    const convertedAt = new Date().toISOString();
    const estimatedValueNumber =
      lead.estimated_value === '' || lead.estimated_value === null || lead.estimated_value === undefined
        ? null
        : Number(lead.estimated_value);
    const legalCustomerName = U.getCustomerLegalName(company || {}, lead || {});
    return {
      lead_id: String(lead.id || '').trim(),
      lead_code: String(lead.lead_id || '').trim(),
      full_name: lead.full_name,
      company_name: company.company_name || lead.company_name,
      company_id: company.company_id || lead.company_id,
      customer_name: legalCustomerName,
      customer_legal_name: legalCustomerName,
      customer_address: String(company.address || lead.customer_address || '').trim(),
      contact_id: lead.contact_id,
      contact_name: lead.contact_name,
      contact_email: lead.contact_email,
      contact_phone: lead.contact_phone,
      phone: lead.phone,
      email: lead.email,
      country: lead.country,
      lead_source: lead.lead_source,
      service_interest: lead.service_interest,
      stage: 'new',
      status: lead.status || 'Contacted',
      priority: lead.priority || '',
      estimated_value: Number.isFinite(estimatedValueNumber) ? estimatedValueNumber : null,
      currency: lead.currency || '',
      assigned_to: lead.assigned_to || '',
      proposal_needed: lead.proposal_needed || '',
      agreement_needed: lead.agreement_needed || '',
      notes: lead.notes || '',
      converted_by: converter,
      converted_at: convertedAt
    };
  },
  sanitizeDealCreatePayloadForConversion(payload = {}) {
    const sanitized = { ...(payload && typeof payload === 'object' ? payload : {}) };
    const nowIso = new Date().toISOString();
    const normalizeTs = value => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : raw;
    };
    const dropIfEmpty = key => {
      if (!Object.prototype.hasOwnProperty.call(sanitized, key)) return;
      const value = sanitized[key];
      if (value === undefined || value === null || String(value).trim() === '') delete sanitized[key];
    };
    dropIfEmpty('source_lead_uuid');
    dropIfEmpty('lead_id');

    sanitized.created_at = normalizeTs(sanitized.created_at) || nowIso;
    sanitized.updated_at = normalizeTs(sanitized.updated_at) || nowIso;
    return sanitized;
  },
  isConvertedLead(row = {}) {
    const status = this.normalizeText(row.status);
    if (status.includes('converted') || status === 'won' || status === 'closed won') return true;
    if (String(row.deal_id || '').trim()) return true;
    return !!String(row.converted_at || '').trim();
  },
  canConvertLead(row = {}) {
    const canConvert = Permissions.can('leads', 'convert_to_deal', { fallback: Permissions.isAdminLike() });
    return canConvert && !this.isConvertedLead(row) && !!String(row.id || '').trim();
  },
  getConvertedDealId(response) {
    const directDealId = String(
      response?.deal_id || response?.dealId || response?.created_deal_id || response?.createdDealId || ''
    ).trim();
    if (directDealId) return directDealId;

    const dealCandidates = [
      response?.deal,
      response?.deals?.[0],
      response?.data?.deal,
      response?.result?.deal,
      response?.payload?.deal,
      response?.created_deal,
      response?.createdDeal,
      response?.data,
      response?.result,
      response?.payload
    ];
    for (const candidate of dealCandidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const dealId = String(candidate.deal_id || candidate.dealId || candidate.id || '').trim();
      if (dealId) return dealId;
    }
    return '';
  },
  applyFilters() {
    const parseDateOnly = value => {
      const normalized = String(value || '').trim().slice(0, 10);
      if (!normalized) return null;
      const dt = new Date(`${normalized}T00:00:00`);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };
    const createdFrom = parseDateOnly(this.state.createdFrom);
    const createdTo = parseDateOnly(this.state.createdTo);
    const searchTerms = String(this.state.search || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    this.state.filteredRows = this.state.rows.filter(row => {
      if (this.state.status !== 'All' && row.status !== this.state.status) return false;
      if (this.state.serviceInterest !== 'All' && row.service_interest !== this.state.serviceInterest)
        return false;
      if (this.state.assignedTo !== 'All' && row.assigned_to !== this.state.assignedTo) return false;
      if (this.state.proposalNeeded !== 'All' && row.proposal_needed !== this.state.proposalNeeded)
        return false;
      if (this.state.agreementNeeded !== 'All' && row.agreement_needed !== this.state.agreementNeeded)
        return false;
      if (!this.matchesKpiFilter(row)) return false;
      if (createdFrom || createdTo) {
        const rowDate = parseDateOnly(row.created_at);
        if (!rowDate) return false;
        if (createdFrom && rowDate < createdFrom) return false;
        if (createdTo && rowDate > createdTo) return false;
      }

      if (!searchTerms.length) return true;
      const hay = [
        row.lead_id,
        row.full_name,
        row.company_name,
        row.phone,
        row.email,
        row.country,
        row.lead_source,
        row.service_interest,
        row.status,
        row.priority,
        row.assigned_to,
        row.notes
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchTerms.every(term => hay.includes(term));
    });
  },
  getFilteredLeadRows() {
    return Array.isArray(this.state.filteredRows) ? this.state.filteredRows : [];
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
  formatDateTimeMMDDYYYYHHMM(value) {
    if (!value) return '';
    const formatted = U.formatDateTimeMMDDYYYYHHMM(value);
    return formatted === '—' ? '' : formatted;
  },
  formatDateMMDDYYYY(value) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = String(date.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  },
  getLeadValue(row, ...keys) {
    if (!row || typeof row !== 'object') return '';
    for (const key of keys) {
      if (!key) continue;
      if (row[key] !== undefined && row[key] !== null) return row[key];
    }
    return '';
  },
  updateExportButtonState() {
    if (!E.leadsExportCsvBtn) return;
    const canExport = Permissions.canExport('leads');
    E.leadsExportCsvBtn.style.display = canExport ? '' : 'none';
    E.leadsExportCsvBtn.disabled = this.state.loading || !canExport;
    if (!canExport) {
      E.leadsExportCsvBtn.title = 'You do not have permission to export this data.';
    } else {
      E.leadsExportCsvBtn.removeAttribute('title');
    }
  },
  exportLeadsCsv() {
    if (!Permissions.canExport('leads')) {
      UI.toast('You do not have permission to export leads.');
      return;
    }
    const filteredRows = this.getFilteredLeadRows();
    if (!filteredRows.length) {
      UI.toast('No leads match the current filters.');
      return;
    }

    const headers = [
      'Lead ID',
      'Created At',
      'Contact Name',
      'Company Name',
      'Phone',
      'Email',
      'Country',
      'Lead Source',
      'Service Interest',
      'Status',
      'Priority',
      'Estimated Value',
      'Currency',
      'Assigned To',
      'Next Follow-up',
      'Last Contact',
      'Proposal Needed',
      'Agreement Needed',
      'Notes',
      'Updated At'
    ];

    const csvLines = [
      headers.map(value => this.csvEscape(value)).join(','),
      ...filteredRows.map(row => {
        const createdAt = this.getLeadValue(row, 'created_at', 'createdAt');
        const updatedAt = this.getLeadValue(row, 'updated_at', 'updatedAt');
        const nextFollowUp = this.getLeadValue(row, 'next_follow_up', 'nextFollowUp');
        const lastContact = this.getLeadValue(row, 'last_contact', 'lastContact');
        return [
          this.getLeadValue(row, 'lead_id', 'leadId'),
          this.formatDateTimeMMDDYYYYHHMM(createdAt),
          this.getLeadValue(row, 'full_name', 'fullName'),
          this.getLeadValue(row, 'company_name', 'companyName'),
          this.getLeadValue(row, 'phone'),
          this.getLeadValue(row, 'email'),
          this.getLeadValue(row, 'country'),
          this.getLeadValue(row, 'lead_source', 'leadSource'),
          this.getLeadValue(row, 'service_interest', 'serviceInterest'),
          this.getLeadValue(row, 'status'),
          this.getLeadValue(row, 'priority'),
          this.getLeadValue(row, 'estimated_value', 'estimatedValue'),
          this.getLeadValue(row, 'currency'),
          this.getLeadValue(row, 'assigned_to', 'assignedTo'),
          this.formatDateMMDDYYYY(nextFollowUp),
          this.formatDateMMDDYYYY(lastContact),
          this.boolLabel(this.normalizeBool(this.getLeadValue(row, 'proposal_needed', 'proposalNeeded'))),
          this.boolLabel(this.normalizeBool(this.getLeadValue(row, 'agreement_needed', 'agreementNeeded'))),
          this.getLeadValue(row, 'notes'),
          this.formatDateTimeMMDDYYYYHHMM(updatedAt)
        ]
          .map(value => this.csvEscape(value))
          .join(',');
      })
    ];
    const now = new Date();
    const filename = `leads-export-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.csv`;
    this.downloadCsv(filename, csvLines.join('\n'));
  },
  renderFilters() {
    const assign = (el, values, selected) => {
      if (!el) return;
      const options = ['All', ...values];
      el.innerHTML = options.map(option => `<option>${U.escapeHtml(option)}</option>`).join('');
      if (options.includes(selected)) el.value = selected;
    };

    const uniq = values =>
      [...new Set(values.filter(Boolean).map(value => String(value).trim()))].sort((a, b) =>
        a.localeCompare(b)
      );

    assign(E.leadsStatusFilter, uniq(this.state.rows.map(row => row.status)), this.state.status);
    assign(
      E.leadsServiceInterestFilter,
      uniq(this.state.rows.map(row => row.service_interest)),
      this.state.serviceInterest
    );
    assign(E.leadsAssignedToFilter, uniq(this.state.rows.map(row => row.assigned_to)), this.state.assignedTo);

    if (E.leadsProposalNeededFilter) E.leadsProposalNeededFilter.value = this.state.proposalNeeded;
    if (E.leadsAgreementNeededFilter) E.leadsAgreementNeededFilter.value = this.state.agreementNeeded;
    if (E.leadsStartDateFilter) E.leadsStartDateFilter.value = this.state.createdFrom;
    if (E.leadsEndDateFilter) E.leadsEndDateFilter.value = this.state.createdTo;
  },
  uniqueSorted(values = []) {
    return [...new Set(values.filter(Boolean).map(value => String(value).trim()))].sort((a, b) =>
      a.localeCompare(b)
    );
  },
  syncLeadFormDropdowns(selected = {}) {
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
    const statusValues = this.formDropdownDefaults.status.concat(this.state.rows.map(row => row.status));
    const priorityValues = this.formDropdownDefaults.priority.concat(
      this.state.rows.map(row => row.priority)
    );
    const currencyValues = this.formDropdownDefaults.currency.concat(
      this.state.rows.map(row => row.currency)
    );

    assign(E.leadFormLeadSource, sourceValues, selected.lead_source || '');
    assign(E.leadFormServiceInterest, serviceValues, selected.service_interest || '');
    assign(E.leadFormStatus, statusValues, selected.status || '');
    assign(E.leadFormPriority, priorityValues, selected.priority || '');
    assign(E.leadFormCurrency, currencyValues, selected.currency || '');
  },
  formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return U.escapeHtml(String(value));
    return U.escapeHtml(U.formatDateTimeMMDDYYYYHHMM(value));
  },
  boolLabel(value) {
    if (value === 'yes') return 'Yes';
    if (value === 'no') return 'No';
    return '—';
  },
  normalizeText(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  },
  parseEstimatedValue(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value)
      .replace(/,/g, '')
      .trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  },
  matchesKpiFilter(row = {}) {
    const filter = this.state.kpiFilter || 'total';
    const status = this.normalizeText(row?.status);
    const priority = this.normalizeText(row?.priority);
    const estimatedValue = this.parseEstimatedValue(row?.estimated_value);
    if (filter === 'total') return true;
    if (filter === 'new') return status === 'new';
    if (filter === 'qualified') return status === 'qualified';
    if (filter === 'proposal-sent') return status === 'proposal sent';
    if (filter === 'won' || filter === 'conversion-rate') return status === 'won';
    if (filter === 'lost') return status === 'lost';
    if (filter === 'high-priority') return priority === 'high' || priority === 'urgent';
    if (filter === 'pipeline-value') return estimatedValue > 0;
    if (filter === 'proposal-needed') return this.normalizeBool(row?.proposal_needed) === 'yes';
    if (filter === 'agreement-needed') return this.normalizeBool(row?.agreement_needed) === 'yes';
    return true;
  },
  applyKpiFilter(filter) {
    const nextFilter = String(filter || 'total').trim() || 'total';
    this.state.kpiFilter = this.state.kpiFilter === nextFilter ? 'total' : nextFilter;
    this.applyFilters();
    this.render();
  },
  syncKpiCardState() {
    const cards = document.querySelectorAll('#leadsAnalyticsGrid [data-kpi-filter]');
    cards.forEach(card => {
      const isActive = (card.getAttribute('data-kpi-filter') || 'total') === (this.state.kpiFilter || 'total');
      card.classList.toggle('kpi-filter-active', isActive);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  },
  computeLeadAnalytics(leads = []) {
    const rows = Array.isArray(leads) ? leads : [];
    const statusKeys = ['new', 'qualified', 'proposal sent', 'negotiation', 'won', 'lost', 'on hold'];
    const statusBreakdown = Object.fromEntries(statusKeys.map(key => [key, 0]));
    const currencyTotals = new Set();
    let pipelineValue = 0;
    let proposalNeededCount = 0;
    let agreementNeededCount = 0;
    let highPriorityCount = 0;

    rows.forEach(row => {
      const status = this.normalizeText(row?.status);
      if (statusBreakdown[status] !== undefined) statusBreakdown[status] += 1;

      const priority = this.normalizeText(row?.priority);
      if (priority === 'high' || priority === 'urgent') highPriorityCount += 1;

      if (this.normalizeBool(row?.proposal_needed) === 'yes') proposalNeededCount += 1;
      if (this.normalizeBool(row?.agreement_needed) === 'yes') agreementNeededCount += 1;

      pipelineValue += this.parseEstimatedValue(row?.estimated_value);
      const currency = String(row?.currency || '')
        .trim()
        .toUpperCase();
      if (currency) currencyTotals.add(currency);
    });

    const total = rows.length;
    const wonCount = statusBreakdown.won || 0;
    const conversionRate = total > 0 ? (wonCount / total) * 100 : 0;
    const currencies = [...currencyTotals];
    const pipelineCurrency = currencies.length === 1 ? currencies[0] : '';

    return {
      total,
      newCount: statusBreakdown.new || 0,
      qualifiedCount: statusBreakdown.qualified || 0,
      proposalSentCount: statusBreakdown['proposal sent'] || 0,
      wonCount,
      lostCount: statusBreakdown.lost || 0,
      highPriorityCount,
      proposalNeededCount,
      agreementNeededCount,
      conversionRate,
      pipelineValue,
      pipelineCurrency,
      hasMixedCurrencies: currencies.length > 1,
      statusBreakdown
    };
  },
  renderLeadAnalytics(analytics) {
    const safe = analytics || this.computeLeadAnalytics([]);
    const setText = (el, value) => {
      if (el) el.textContent = value;
    };

    setText(E.leadsKpiTotal, String(safe.total || 0));
    setText(E.leadsKpiNew, String(safe.newCount || 0));
    setText(E.leadsKpiQualified, String(safe.qualifiedCount || 0));
    setText(E.leadsKpiProposalSent, String(safe.proposalSentCount || 0));
    setText(E.leadsKpiWon, String(safe.wonCount || 0));
    setText(E.leadsKpiLost, String(safe.lostCount || 0));
    setText(E.leadsKpiHighPriority, String(safe.highPriorityCount || 0));
    setText(E.leadsKpiProposalNeeded, String(safe.proposalNeededCount || 0));
    setText(E.leadsKpiAgreementNeeded, String(safe.agreementNeededCount || 0));
    setText(E.leadsKpiConversionRate, `${(safe.conversionRate || 0).toFixed(1)}%`);

    const valueNumber = Number.isFinite(safe.pipelineValue) ? safe.pipelineValue : 0;
    const hasSingleCurrency = !!safe.pipelineCurrency && !safe.hasMixedCurrencies;
    if (hasSingleCurrency) {
      let formatted = valueNumber.toLocaleString(undefined, {
        style: 'currency',
        currency: safe.pipelineCurrency,
        maximumFractionDigits: 2
      });
      if (formatted === 'NaN') formatted = `${safe.pipelineCurrency} ${valueNumber.toLocaleString()}`;
      setText(E.leadsKpiPipelineValue, formatted);
      setText(E.leadsKpiPipelineSub, `Total estimated value (${safe.pipelineCurrency})`);
    } else {
      setText(E.leadsKpiPipelineValue, valueNumber.toLocaleString(undefined, { maximumFractionDigits: 2 }));
      setText(
        E.leadsKpiPipelineSub,
        safe.hasMixedCurrencies ? 'Total estimated value (mixed currencies)' : 'Total estimated value'
      );
    }

    if (E.leadsStatusDistribution) {
      const statuses = [
        ['New', 'new'],
        ['Qualified', 'qualified'],
        ['Proposal Sent', 'proposal sent'],
        ['Negotiation', 'negotiation'],
        ['Won', 'won'],
        ['Lost', 'lost'],
        ['On Hold', 'on hold']
      ];
      const total = safe.total || 0;
      E.leadsStatusDistribution.innerHTML = statuses
        .map(([label, key]) => {
          const count = safe.statusBreakdown?.[key] || 0;
          const percent = total > 0 ? (count / total) * 100 : 0;
          return `<div class="leads-status-row">
            <div class="leads-status-label">${U.escapeHtml(label)}</div>
            <div class="leads-status-track"><span class="leads-status-fill" style="width:${Math.min(100, percent).toFixed(1)}%"></span></div>
            <div class="leads-status-meta">${count} · ${percent.toFixed(1)}%</div>
          </div>`;
        })
        .join('');
    }
    this.syncKpiCardState();
  },
  canEditDelete() {
    return Permissions.canEditDeleteLead();
  },
  render() {
    if (!E.leadsTbody || !E.leadsState) return;
    this.updateExportButtonState();
    if (this.state.loading) {
      E.leadsState.textContent = 'Loading leads…';
      this.renderLeadAnalytics(this.computeLeadAnalytics([]));
      E.leadsTbody.innerHTML = Array.from({ length: 6 })
        .map(
          () =>
            '<tr class="skeleton-row">' +
            '<td colspan="21"><div class="skeleton-line" style="height:12px;margin:6px 0;"></div></td>' +
            '</tr>'
        )
        .join('');
      return;
    }
    if (this.state.loadError) {
      E.leadsState.textContent = this.state.loadError;
      this.renderLeadAnalytics(this.computeLeadAnalytics([]));
      E.leadsTbody.innerHTML = `<tr><td colspan="21" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }

    const rows = this.state.filteredRows;
    this.renderLeadAnalytics(this.computeLeadAnalytics(rows));
    E.leadsState.textContent = `${rows.length} lead${rows.length === 1 ? '' : 's'} · page ${this.state.page}`;
    const paginationHost = U.ensurePaginationHost({ hostId: 'leadsPaginationControls', anchor: E.leadsState });
    U.renderPaginationControls({
      host: paginationHost,
      moduleKey: 'leads',
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
      E.leadsTbody.innerHTML = '<tr><td colspan="21" class="muted" style="text-align:center;">No leads found for current filters.</td></tr>';
      return;
    }

    E.leadsTbody.innerHTML = rows
      .map(row => {
        const actionButtons = [];
        if (this.canConvertLead(row)) {
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-lead-convert="${U.escapeAttr(row.id)}">Convert to Deal</button>`
          );
        }
        if (this.canEditDelete()) {
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-lead-edit="${U.escapeAttr(row.id)}">Edit</button>`
          );
          actionButtons.push(
            `<button class="btn ghost sm" type="button" data-lead-delete="${U.escapeAttr(row.id)}">Delete</button>`
          );
        }
        const actions = actionButtons.length ? actionButtons.join(' ') : '<span class="muted">—</span>';
        return `<tr>
          <td>${U.escapeHtml(row.lead_id || '—')}</td>
          <td>${this.formatDate(row.created_at)}</td>
          <td>${U.escapeHtml(row.full_name || '—')}</td>
          <td>${U.escapeHtml(row.company_name || '—')}</td>
          <td>${U.escapeHtml(row.phone || '—')}</td>
          <td>${U.escapeHtml(row.email || '—')}</td>
          <td>${U.escapeHtml(row.country || '—')}</td>
          <td>${U.escapeHtml(row.lead_source || '—')}</td>
          <td>${U.escapeHtml(row.service_interest || '—')}</td>
          <td>${U.escapeHtml(row.status || '—')}</td>
          <td>${U.escapeHtml(row.priority || '—')}</td>
          <td>${U.escapeHtml(row.estimated_value === '' ? '—' : String(row.estimated_value))}</td>
          <td>${U.escapeHtml(row.currency || '—')}</td>
          <td>${U.escapeHtml(row.assigned_to || '—')}</td>
          <td>${U.escapeHtml(this.normalizeComparableLeadDate(row.next_follow_up) || '—')}</td>
          <td>${U.escapeHtml(this.normalizeComparableLeadDate(row.last_contact) || '—')}</td>
          <td>${U.escapeHtml(this.boolLabel(row.proposal_needed))}</td>
          <td>${U.escapeHtml(this.boolLabel(row.agreement_needed))}</td>
          <td>${U.escapeHtml(row.notes || '—')}</td>
          <td>${this.formatDate(row.updated_at)}</td>
          <td>${actions}</td>
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
      const response = await this.listLeads({ forceRefresh: force, page: this.state.page, limit: this.state.limit });
      const responseRows = Array.isArray(response?.rows) ? response.rows : this.extractRows(response);
      this.state.rows = responseRows.map(item => this.normalizeLead(item));
      this.state.returned = Number(response?.returned ?? this.state.rows.length) || this.state.rows.length;
      this.state.hasMore = Boolean(response?.hasMore);
      this.state.page = Number(response?.page || this.state.page || 1);
      this.state.limit = Number(response?.limit || this.state.limit || 50);
      this.state.offset = Number(response?.offset ?? Math.max(0, (this.state.page - 1) * this.state.limit));
      this.state.total = Number(response?.total ?? (this.state.offset + this.state.returned + (this.state.hasMore ? 1 : 0)));
      this.state.loaded = true;
      this.state.lastLoadedAt = Date.now();
      this.state.lastSyncedAt = new Date().toISOString();
      this.renderFilters();
      this.applyFilters();
      this.render();
      this.state.initialized = true;
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      this.state.rows = [];
      this.state.filteredRows = [];
      this.state.loadError = String(error?.message || '').trim() || 'Unable to load leads right now.';
      this.render();
      UI.toast(this.state.loadError);
    } finally {
      this.state.loading = false;
      this.render();
    }
  },
  setFormBusy(v) {
    if (E.leadFormSaveBtn) {
      E.leadFormSaveBtn.disabled = !!v;
      E.leadFormSaveBtn.textContent = v ? 'Saving…' : 'Save';
    }
    if (E.leadFormDeleteBtn) E.leadFormDeleteBtn.disabled = !!v;
  },
  resetForm() {
    if (!E.leadForm) return;
    E.leadForm.reset();
    if (E.leadFormLeadId) E.leadFormLeadId.value = '';
    if (E.leadFormCreatedAt) E.leadFormCreatedAt.value = '';
    if (E.leadFormUpdatedAt) E.leadFormUpdatedAt.value = '';
    if (E.leadFormProposalNeeded) E.leadFormProposalNeeded.value = '';
    if (E.leadFormAgreementNeeded) E.leadFormAgreementNeeded.value = '';
    this.state.selectedCompany = null;
    this.state.selectedContact = null;
    this.syncLeadFormDropdowns();
  },
  currentUserAssignee() {
    return String(Session.displayName() || Session.username() || Session.user()?.email || '').trim();
  },
  async openForm(row = null) {
    if (!E.leadFormModal || !E.leadForm) return;
    const isEdit = !!row;
    E.leadForm.dataset.mode = isEdit ? 'edit' : 'create';
    E.leadForm.dataset.id = row?.id || '';
    if (E.leadFormTitle) E.leadFormTitle.textContent = isEdit ? 'Edit Lead' : 'Create Lead';
    this.resetForm();

    if (row) {
      if (E.leadFormLeadId) E.leadFormLeadId.value = row.lead_id || '';
      if (E.leadFormCreatedAt) E.leadFormCreatedAt.value = row.created_at ? U.formatDateTimeMMDDYYYYHHMM(row.created_at) : '';
            if (E.leadFormCompanyName) E.leadFormCompanyName.value = row.company_name || '';
      if (E.leadFormCompanyId) E.leadFormCompanyId.value = row.company_id || '';
      if (E.leadFormContactId) E.leadFormContactId.value = row.contact_id || '';
      if (E.leadFormContactName) E.leadFormContactName.value = row.contact_name || '';
      if (E.leadFormContactEmail) E.leadFormContactEmail.value = row.contact_email || '';
      if (E.leadFormContactPhone) E.leadFormContactPhone.value = row.contact_phone || '';
      if (E.leadFormPhone) E.leadFormPhone.value = row.phone || '';
      if (E.leadFormEmail) E.leadFormEmail.value = row.email || '';
      if (E.leadFormCountry) E.leadFormCountry.value = row.country || '';
      if (E.leadFormLeadSource) E.leadFormLeadSource.value = row.lead_source || '';
      if (E.leadFormServiceInterest) E.leadFormServiceInterest.value = row.service_interest || '';
      if (E.leadFormStatus) E.leadFormStatus.value = row.status || '';
      if (E.leadFormPriority) E.leadFormPriority.value = row.priority || '';
      if (E.leadFormEstimatedValue) E.leadFormEstimatedValue.value = row.estimated_value === '' ? '' : String(row.estimated_value);
      if (E.leadFormCurrency) E.leadFormCurrency.value = row.currency || '';
      if (E.leadFormAssignedTo) E.leadFormAssignedTo.value = row.assigned_to || '';
      if (E.leadFormNextFollowupDate) E.leadFormNextFollowupDate.value = String(row.next_follow_up || '').slice(0, 10);
      if (E.leadFormLastContactDate) E.leadFormLastContactDate.value = String(row.last_contact || '').slice(0, 10);
      if (E.leadFormProposalNeeded) E.leadFormProposalNeeded.value = row.proposal_needed || '';
      if (E.leadFormAgreementNeeded) E.leadFormAgreementNeeded.value = row.agreement_needed || '';
      if (E.leadFormNotes) E.leadFormNotes.value = row.notes || '';
      if (E.leadFormUpdatedAt) E.leadFormUpdatedAt.value = row.updated_at ? U.formatDateTimeMMDDYYYYHHMM(row.updated_at) : '';
      this.syncLeadFormDropdowns({
        lead_source: row.lead_source || '',
        service_interest: row.service_interest || '',
        status: row.status || '',
        priority: row.priority || '',
        currency: row.currency || ''
      });
    } else {
      if (E.leadFormLeadId) E.leadFormLeadId.value = 'Auto-generated';
      if (E.leadFormCreatedAt) E.leadFormCreatedAt.value = U.formatDateTimeMMDDYYYYHHMM(new Date());
      if (E.leadFormAssignedTo) E.leadFormAssignedTo.value = this.currentUserAssignee();
      this.syncLeadFormDropdowns();
    }

    if (E.leadFormDeleteBtn) E.leadFormDeleteBtn.style.display = isEdit && this.canEditDelete() ? '' : 'none';
    if (E.leadFormSaveBtn) E.leadFormSaveBtn.disabled = false;
    E.leadFormModal.style.display = 'flex';
    E.leadFormModal.setAttribute('aria-hidden', 'false');
    if (row) await this.hydrateLeadLinkedDetails(row);
  },
  closeForm() {
    if (!E.leadFormModal) return;
    E.leadFormModal.style.display = 'none';
    E.leadFormModal.setAttribute('aria-hidden', 'true');
  },
  collectFormData() {
    const estimatedValueRaw = String(E.leadFormEstimatedValue?.value || '').trim();
    const selectedCompany = this.state.selectedCompany || {};
    const selectedContact = this.state.selectedContact || {};
    const companyId = String(selectedCompany.company_id || E.leadFormCompanyId?.value || '').trim();
    const contactId = String(selectedContact.contact_id || E.leadFormContactId?.value || '').trim();
    const contactName = String(U.buildContactDisplayName(selectedContact) || '').trim();
    const customerName = U.getCustomerLegalName(selectedCompany, {});
    const contactEmail = String(selectedContact.email || '').trim();
    const contactPhone = String(selectedContact.phone || selectedContact.mobile || '').trim();
    return {
      lead_id: String(E.leadFormLeadId?.value || '').trim() === 'Auto-generated' ? '' : String(E.leadFormLeadId?.value || '').trim(),
      full_name: contactName,
      company_id: companyId,
      company_name: String(selectedCompany.company_name || '').trim(),
      customer_name: customerName,
      customer_legal_name: customerName,
      customer_address: String(selectedCompany.address || '').trim(),
      contact_id: contactId,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      phone: contactPhone,
      email: contactEmail,
      country: String(selectedCompany.country || '').trim(),
      lead_source: String(E.leadFormLeadSource?.value || '').trim(),
      service_interest: String(E.leadFormServiceInterest?.value || '').trim(),
      status: String(E.leadFormStatus?.value || '').trim(),
      priority: String(E.leadFormPriority?.value || '').trim(),
      estimated_value: estimatedValueRaw === '' ? '' : Number(estimatedValueRaw),
      currency: String(E.leadFormCurrency?.value || '').trim(),
      assigned_to: String(E.leadFormAssignedTo?.value || '').trim(),
      next_follow_up: String(E.leadFormNextFollowupDate?.value || '').trim(),
      last_contact: String(E.leadFormLastContactDate?.value || '').trim(),
      proposal_needed: this.normalizeBool(E.leadFormProposalNeeded?.value || ''),
      agreement_needed: this.normalizeBool(E.leadFormAgreementNeeded?.value || ''),
      notes: String(E.leadFormNotes?.value || '').trim()
    };
  },
  normalizeComparableLeadDate(value) {
    return String(value || '')
      .trim()
      .slice(0, 10);
  },
  didLeadUpdatePersist(latestLead, submittedLead) {
    const latest = this.normalizeLead(latestLead || {});
    const submitted = submittedLead || {};
    const toComparable = lead => ({
      full_name: String(lead.full_name || '').trim(),
      company_name: String(lead.company_name || '').trim(),
      company_id: String(lead.company_id || '').trim(),
      contact_id: String(lead.contact_id || '').trim(),
      contact_name: String(lead.contact_name || '').trim(),
      contact_email: String(lead.contact_email || '').trim(),
      contact_phone: String(lead.contact_phone || '').trim(),
      phone: String(lead.phone || '').trim(),
      email: String(lead.email || '').trim(),
      country: String(lead.country || '').trim(),
      lead_source: String(lead.lead_source || '').trim(),
      service_interest: String(lead.service_interest || '').trim(),
      status: String(lead.status || '').trim(),
      priority: String(lead.priority || '').trim(),
      estimated_value: String(lead.estimated_value ?? '').trim(),
      currency: String(lead.currency || '').trim(),
      assigned_to: String(lead.assigned_to || '').trim(),
      next_follow_up: this.normalizeComparableLeadDate(lead.next_follow_up),
      last_contact: this.normalizeComparableLeadDate(lead.last_contact),
      proposal_needed: this.normalizeBool(lead.proposal_needed),
      agreement_needed: this.normalizeBool(lead.agreement_needed),
      notes: String(lead.notes || '').trim()
    });

    const a = toComparable(latest);
    const b = toComparable(submitted);
    return Object.keys(b).every(key => a[key] === b[key]);
  },
  async updateLeadWithVerification(leadId, lead) {
    const response = await this.updateLead(leadId, lead);
    const resolvedRow = response || { ...lead, id: leadId };
    return { row: resolvedRow, verifiedAfterError: false };
  },
  formatLeadActionError(error, { resource = 'leads', action = 'unknown' } = {}) {
    const rawMessage = String(error?.message || '').trim() || 'Unknown error';
    const backendMessageMatch = rawMessage.match(/Backend message:\s*([^.]*)/i);
    const backendMessage = String(
      backendMessageMatch?.[1] || error?.backendMessage || rawMessage
    ).trim();
    return [
      `Unable to save lead.`,
      `Supabase: ${backendMessage}.`,
      `Request: resource=${resource} action=${action}.`
    ].join(' ');
  },
  async submitForm() {
    if (this.state.saveInFlight) return;
    if (!Permissions.canCreateLead()) {
      UI.toast('Login is required to manage leads.');
      return;
    }
    const mode = E.leadForm?.dataset.mode === 'edit' ? 'edit' : 'create';
    if (mode === 'edit' && !this.canEditDelete()) {
      UI.toast('Only admin/dev can update leads.');
      return;
    }
    const leadId = String(E.leadForm?.dataset.id || '').trim();
    const lead = this.collectFormData();
    if (!lead.company_id || !lead.contact_id) {
      UI.toast('Company and contact are required.');
      return;
    }
    if (mode === 'edit' && !leadId) {
      UI.toast('Lead ID is missing. Please reopen the lead and try again.');
      return;
    }

    this.setFormBusy(true);
    this.state.saveInFlight = true;
    console.time('entity-save');
    try {
      if (mode === 'edit') {
        const result = await this.updateLeadWithVerification(leadId, lead);
        const resolvedRow = result?.row || { ...lead, id: leadId };
        this.upsertLocalRow(resolvedRow);
        UI.toast(result?.verifiedAfterError ? 'Lead updated (verified).' : 'Lead updated.');
      } else {
        const tempLeadId = this.generateLeadId();
        if (E.leadFormLeadId) E.leadFormLeadId.value = tempLeadId;
        const created = await this.createLead(lead);
        this.upsertLocalRow(created);
        UI.toast('Lead created.');
      }
      this.closeForm();
      this.rerenderSummaryIfNeeded();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast(this.formatLeadActionError(error, { resource: 'leads', action: mode === 'edit' ? 'update' : 'create' }));
    } finally {
      console.timeEnd('entity-save');
      this.state.saveInFlight = false;
      this.setFormBusy(false);
    }
  },
  async loadLeadPickerOptions(companyId = '') {
    const [companiesRes, contactsRes] = await Promise.all([
      Api.requestWithSession('companies', 'list', { page: 1, limit: 200, sortBy: 'company_name', sortDir: 'asc' }, { requireAuth: true }),
      Api.requestWithSession('contacts', 'list', { page: 1, limit: 200, filters: companyId ? { company_id: companyId } : {}, sortBy: 'full_name', sortDir: 'asc' }, { requireAuth: true })
    ]);
    const companies = Array.isArray(companiesRes?.rows) ? companiesRes.rows : [];
    const contacts = Array.isArray(contactsRes?.rows) ? contactsRes.rows : [];
    if (E.leadFormCompanyName) E.leadFormCompanyName.setAttribute('list', 'leadCompanyPicker');
    if (E.leadFormContactName) E.leadFormContactName.setAttribute('list', 'leadContactPicker');
    const companyList = document.getElementById('leadCompanyPicker');
    const contactList = document.getElementById('leadContactPicker');
    if (companyList) companyList.innerHTML = companies.map(c => `<option value="${U.escapeAttr(c.company_name || '')}" data-company-id="${U.escapeAttr(c.company_id || '')}"></option>`).join('');
    if (contactList) contactList.innerHTML = contacts.map(c => `<option value="${U.escapeAttr(c.full_name || '')}" data-contact-id="${U.escapeAttr(c.contact_id || '')}" data-company-id="${U.escapeAttr(c.company_id || '')}" data-company-name="${U.escapeAttr(c.company_name || '')}" data-email="${U.escapeAttr(c.email || '')}" data-phone="${U.escapeAttr(c.phone || c.mobile || '')}" data-mobile="${U.escapeAttr(c.mobile || '')}" data-first-name="${U.escapeAttr(c.first_name || '')}" data-last-name="${U.escapeAttr(c.last_name || '')}" data-job-title="${U.escapeAttr(c.job_title || '')}" data-department="${U.escapeAttr(c.department || '')}" data-decision-role="${U.escapeAttr(c.decision_role || '')}" data-is-primary-contact="${U.escapeAttr(Boolean(c.is_primary_contact))}" data-contact-status="${U.escapeAttr(c.contact_status || '')}"></option>`).join('');
    this.state.companyPickerRows = companies;
    this.state.contactPickerRows = contacts;
    const noContactsHint = document.getElementById('leadNoContactsHint');
    if (noContactsHint) {
      noContactsHint.style.display = companyId && contacts.length === 0 ? '' : 'none';
    }
  },
  hydrateLeadFromCompany(company = {}) {
    const c = this.normalizeCompany(company);
    this.state.selectedCompany = c.company_id ? c : null;

    const set = (id, value) => {
      const node = this.el(id);
      if (node) node.value = value || '';
    };

    set('leadFormCompanyId', c.company_id);
    set('leadFormCompanyName', c.company_name);
    set('leadCompanyLegalName', c.legal_name);
    set('leadCompanyType', window.Companies?.formatCompanyType?.(c.company_type) || c.company_type);
    set('leadCompanyIndustry', window.Companies?.formatCompanyIndustry?.(c.industry) || c.industry);
    set('leadCompanyWebsite', c.website);
    set('leadCompanyMainEmail', c.main_email);
    set('leadCompanyMainPhone', c.main_phone);
    set('leadCompanyCountry', c.country);
    set('leadCompanyCity', c.city);
    set('leadCompanyAddress', c.address);
    set('leadCompanyTaxNumber', c.tax_number);
    set('leadCompanyStatus', c.company_status);
  },
  hydrateLeadFromContact(contact = {}) {
    const c = this.normalizeContact(contact);
    const fullName = c.full_name;
    this.state.selectedContact = c.contact_id ? c : null;

    const set = (id, value) => {
      const node = this.el(id);
      if (node) node.value = value || '';
    };

    set('leadFormContactId', c.contact_id);
    set('leadFormContactName', fullName);
    set('leadFormContactEmail', c.email);
    set('leadFormContactPhone', c.phone || c.mobile);

    set('leadContactFirstName', c.first_name);
    set('leadContactLastName', c.last_name);
    set('leadContactJobTitle', c.job_title);
    set('leadContactDepartment', c.department);
    set('leadContactMobile', c.mobile);
    set('leadContactDecisionRole', c.decision_role);
    set('leadContactPrimary', c.is_primary_contact ? 'Yes' : 'No');
    set('leadContactStatus', c.contact_status);

    if (!String(this.el('leadFormCompanyId')?.value || '').trim()) {
      set('leadFormCompanyId', c.company_id);
    }

    if (!String(this.el('leadFormCompanyName')?.value || '').trim()) {
      set('leadFormCompanyName', c.company_name);
    }
  },
  async getFullCompanyRecord(companyIdOrRecord) {
    if (!companyIdOrRecord) return null;
    if (typeof companyIdOrRecord === 'object') {
      const hasFullFields = companyIdOrRecord.company_type || companyIdOrRecord.companyType || companyIdOrRecord.industry || companyIdOrRecord.website || companyIdOrRecord.main_email || companyIdOrRecord.mainEmail || companyIdOrRecord.main_phone || companyIdOrRecord.mainPhone || companyIdOrRecord.country || companyIdOrRecord.city || companyIdOrRecord.address || companyIdOrRecord.company_status || companyIdOrRecord.companyStatus;
      if (hasFullFields) return this.normalizeCompany(companyIdOrRecord);
    }
    const companyId = typeof companyIdOrRecord === 'object' ? (companyIdOrRecord.company_id || companyIdOrRecord.companyId) : companyIdOrRecord;
    const id = String(companyId || '').trim();
    if (!id) return null;
    const res = await Api.requestWithSession('companies', 'list', { page: 1, limit: 1, filters: { company_id: id } }, { requireAuth: true });
    const rows = res?.rows || res?.items || res?.data || [];
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? this.normalizeCompany(row) : null;
  },
  async getFullContactRecord(contactIdOrRecord) {
    if (!contactIdOrRecord) return null;
    if (typeof contactIdOrRecord === 'object') {
      const hasFullFields = contactIdOrRecord.first_name || contactIdOrRecord.firstName || contactIdOrRecord.last_name || contactIdOrRecord.lastName || contactIdOrRecord.job_title || contactIdOrRecord.jobTitle || contactIdOrRecord.department || contactIdOrRecord.decision_role || contactIdOrRecord.decisionRole || contactIdOrRecord.contact_status || contactIdOrRecord.contactStatus;
      if (hasFullFields) return this.normalizeContact(contactIdOrRecord);
    }
    const contactId = typeof contactIdOrRecord === 'object' ? (contactIdOrRecord.contact_id || contactIdOrRecord.contactId) : contactIdOrRecord;
    const id = String(contactId || '').trim();
    if (!id) return null;
    const res = await Api.requestWithSession('contacts', 'list', { page: 1, limit: 1, filters: { contact_id: id } }, { requireAuth: true });
    const rows = res?.rows || res?.items || res?.data || [];
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? this.normalizeContact(row) : null;
  },
  async fetchFullCompany(companyId = '') { return this.getFullCompanyRecord(companyId); },
  async fetchFullContact(contactId = '') { return this.getFullContactRecord(contactId); },
  async hydrateLeadLinkedDetails(lead = {}) {
    const linkedCompany = await this.getFullCompanyRecord(lead.company_id || lead.companyId);
    this.hydrateLeadFromCompany(linkedCompany || { company_id: lead.company_id || '', company_name: lead.company_name || '' });
    const linkedContact = await this.getFullContactRecord(lead.contact_id || lead.contactId);
    this.hydrateLeadFromContact(linkedContact || { contact_id: lead.contact_id || '', full_name: lead.contact_name || lead.full_name || '', email: lead.contact_email || lead.email || '', phone: lead.contact_phone || lead.phone || '' });
  },
  lockCompanyContactDisplayFields() {
    [E.leadFormContactEmail, E.leadFormContactPhone].forEach(el => {
      if (el) {
        el.readOnly = true;
        el.classList.add('readonly');
      }
    });
  },
  async openLeadCreateFormWithPrefill(prefill = {}) {
    await this.openForm(null);

    const companySeed = prefill.company || prefill;
    const contactSeed = prefill.contact || prefill;

    let company = null;
    let contact = null;

    const companyId =
      companySeed.company_id ||
      companySeed.companyId ||
      contactSeed.company_id ||
      contactSeed.companyId ||
      '';

    const contactId =
      contactSeed.contact_id ||
      contactSeed.contactId ||
      '';

    if (companyId) {
      company = await this.getFullCompanyRecord(companyId);
    }

    if (!company && prefill.company) {
      company = this.normalizeCompany(prefill.company);
    }

    if (company) {
      this.hydrateLeadFromCompany(company);
    }

    await this.loadLeadPickerOptions(company?.company_id || companyId || '');

    if (contactId) {
      contact = await this.getFullContactRecord(contactId);
    }

    if (!contact && prefill.contact) {
      contact = this.normalizeContact(prefill.contact);
    }

    if (!contact && company?.company_id) {
      const primary = (this.state.contactPickerRows || []).find(c => Boolean(c.is_primary_contact));
      if (primary) {
        contact = await this.getFullContactRecord(primary.contact_id) || primary;
      }
    }

    if (contact) {
      this.hydrateLeadFromContact(contact);

      if (!company && contact.company_id) {
        const linkedCompany = await this.getFullCompanyRecord(contact.company_id);
        if (linkedCompany) this.hydrateLeadFromCompany(linkedCompany);
      }
    }

    this.lockCompanyContactDisplayFields();
  },
  async deleteLeadById(leadUuid) {
    if (!this.canEditDelete()) {
      UI.toast('Only admin/dev can delete leads.');
      return;
    }
    const row = this.state.rows.find(item => item.id === leadUuid);
    const label = row?.lead_id || leadUuid;
    const confirmed = window.confirm(`Delete lead ${label}?`);
    if (!confirmed) return;

    this.setFormBusy(true);
    try {
      await this.deleteLead(leadUuid);
      this.removeLocalRow(leadUuid);
      UI.toast('Lead deleted.');
      this.closeForm();
      this.rerenderSummaryIfNeeded();
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to delete lead: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  async convertLeadById(leadUuid) {
    if (!Permissions.can('leads', 'convert_to_deal', { fallback: Permissions.isAdminLike() })) {
      UI.toast('Only admin/dev can convert leads.');
      return;
    }
    const row = this.state.rows.find(item => item.id === leadUuid);
    if (!this.canConvertLead(row)) {
      UI.toast('This lead is already converted or unavailable.');
      return;
    }
    this.setFormBusy(true);
    try {
      const sourceLead = this.normalizeLead(await this.getLead(leadUuid));
      if (!String(sourceLead.lead_id || '').trim()) {
        UI.toast('Unable to convert lead: missing business Lead ID.');
        return;
      }
      console.log('[deal conversion] source lead', sourceLead);
      console.log('[deal conversion] existing deal check lead uuid', sourceLead.id);
      console.log('[deal conversion] business lead code', sourceLead.lead_id);
      const existingDeal = await this.findDealByLeadUuid(sourceLead.id);
      const fullCompany = sourceLead.company_id ? await this.getFullCompanyRecord(sourceLead.company_id) : null;
      const payload = this.sanitizeDealCreatePayloadForConversion(this.buildDealFromLead(sourceLead, fullCompany || {}));
      console.log('[lead->deal] sanitized deal payload', payload);
      const savedDeal =
        existingDeal ||
        (window.Deals?.createDeal
          ? await window.Deals.createDeal(payload)
          : await Api.requestWithSession('deals', 'create', payload, { requireAuth: true }));
      console.log('[deal conversion] saved deal', savedDeal);
      if (window.Deals?.upsertLocalRow && savedDeal) window.Deals.upsertLocalRow(savedDeal);
      const normalizedSavedDeal = window.Deals?.normalizeDeal ? window.Deals.normalizeDeal(savedDeal) : savedDeal || {};
      const leadUpdate = {
        ...sourceLead,
        converted_at: normalizedSavedDeal.converted_at || payload.converted_at,
        deal_id: normalizedSavedDeal.deal_id || payload.deal_id || sourceLead.deal_id
      };
      const leadUpdateResult = await this.updateLeadWithVerification(leadUuid, leadUpdate);
      this.upsertLocalRow(leadUpdateResult?.row || leadUpdate);
      const dealId = this.getConvertedDealId(savedDeal || normalizedSavedDeal) || leadUpdate.deal_id;
      UI.toast(dealId ? `Lead converted to deal ${dealId}.` : 'Lead converted to deal.');
    } catch (error) {
      if (isAuthError(error)) {
        handleExpiredSession('Session expired. Please log in again.');
        return;
      }
      UI.toast('Unable to convert lead: ' + (error?.message || 'Unknown error'));
    } finally {
      this.setFormBusy(false);
    }
  },
  handleFilterChange() {
    this.applyFilters();
    this.render();
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

    bindState(E.leadsSearchInput, 'search');
    bindState(E.leadsStatusFilter, 'status');
    bindState(E.leadsServiceInterestFilter, 'serviceInterest');
    bindState(E.leadsAssignedToFilter, 'assignedTo');
    bindState(E.leadsProposalNeededFilter, 'proposalNeeded');
    bindState(E.leadsAgreementNeededFilter, 'agreementNeeded');
    bindState(E.leadsStartDateFilter, 'createdFrom');
    bindState(E.leadsEndDateFilter, 'createdTo');

    if (E.leadsResetBtn) {
      E.leadsResetBtn.addEventListener('click', () => {
        this.state.search = '';
        this.state.status = 'All';
        this.state.serviceInterest = 'All';
        this.state.assignedTo = 'All';
        this.state.proposalNeeded = 'All';
        this.state.agreementNeeded = 'All';
        this.state.createdFrom = '';
        this.state.createdTo = '';
        this.state.kpiFilter = 'total';
        this.state.page = 1;
        this.loadAndRefresh({ force: true });
      });
    }

    if (E.leadsRefreshBtn) {
      E.leadsRefreshBtn.addEventListener('click', () => this.loadAndRefresh({ force: true }));
    }
    if (E.leadsCreateBtn) {
      E.leadsCreateBtn.addEventListener('click', () => {
        if (!Permissions.canCreateLead()) {
          UI.toast('Login is required to create leads.');
          return;
        }
        this.openForm();
      });
    }
    if (E.leadsExportCsvBtn) {
      E.leadsExportCsvBtn.addEventListener('click', () => this.exportLeadsCsv());
    }

    if (E.leadsTbody) {
      E.leadsTbody.addEventListener('click', event => {
        const editId = event.target?.getAttribute('data-lead-edit');
        if (editId) {
          const row = this.state.rows.find(item => item.id === editId);
          if (row) this.openForm(row);
          return;
        }
        const deleteId = event.target?.getAttribute('data-lead-delete');
        if (deleteId) {
          this.deleteLeadById(deleteId);
          return;
        }
        const convertId = event.target?.getAttribute('data-lead-convert');
        if (convertId) this.convertLeadById(convertId);
      });
    }
    const leadsAnalyticsGrid = document.getElementById('leadsAnalyticsGrid');
    if (leadsAnalyticsGrid) {
      const activate = card => {
        if (!card) return;
        const filter = card.getAttribute('data-kpi-filter');
        if (!filter) return;
        this.applyKpiFilter(filter);
      };
      leadsAnalyticsGrid.addEventListener('click', event => {
        activate(event.target?.closest?.('[data-kpi-filter]'));
      });
      leadsAnalyticsGrid.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target?.closest?.('[data-kpi-filter]');
        if (!card) return;
        event.preventDefault();
        activate(card);
      });
    }

    if (E.leadFormCloseBtn) E.leadFormCloseBtn.addEventListener('click', () => this.closeForm());
    if (E.leadFormCancelBtn) E.leadFormCancelBtn.addEventListener('click', () => this.closeForm());
    if (E.leadFormModal) {
      E.leadFormModal.addEventListener('click', event => {
        if (event.target === E.leadFormModal) this.closeForm();
      });
    }
    if (E.leadForm) {
      E.leadForm.addEventListener('submit', event => {
        event.preventDefault();
        this.submitForm();
      });
    }
    this.lockCompanyContactDisplayFields();
    if (E.leadFormCompanyName) E.leadFormCompanyName.addEventListener('change', async () => {
      const name = String(E.leadFormCompanyName.value || '').trim();
      const selected = [...(document.getElementById('leadCompanyPicker')?.options || [])].find(o => o.value === name);
      const companyId = selected?.dataset?.companyId || '';
      const company = await this.fetchFullCompany(companyId) || (this.state.companyPickerRows || []).find(c => String(c.company_id || '') === String(companyId || '')) || {};
      if (E.leadFormCompanyId) E.leadFormCompanyId.value = companyId;
      this.hydrateLeadFromCompany(company);
      this.state.selectedContact = null;
      this.hydrateLeadFromContact({});
      await this.loadLeadPickerOptions(companyId);
      const primary = (this.state.contactPickerRows || []).find(c => Boolean(c.is_primary_contact));
      if (primary) this.hydrateLeadFromContact(await this.fetchFullContact(primary.contact_id) || primary);
    });
    if (E.leadFormContactName) E.leadFormContactName.addEventListener('change', async () => {
      const name = String(E.leadFormContactName.value || '').trim();
      const selected = [...(document.getElementById('leadContactPicker')?.options || [])].find(o => o.value === name);
      if (!selected) return;
      const contactId = selected.dataset.contactId || '';
      const full = await this.fetchFullContact(contactId);
      this.hydrateLeadFromContact(full || {
        contact_id: contactId,
        full_name: name,
        company_id: selected.dataset.companyId || '',
        company_name: selected.dataset.companyName || ''
      });
      if (!this.state.selectedCompany && this.state.selectedContact?.company_id) {
        const linkedCompany = await this.fetchFullCompany(this.state.selectedContact.company_id);
        if (linkedCompany) this.hydrateLeadFromCompany(linkedCompany);
      }
    });
    if (E.leadFormDeleteBtn) {
      E.leadFormDeleteBtn.addEventListener('click', () => {
        const id = String(E.leadForm?.dataset.id || '').trim();
        if (id) this.deleteLeadById(id);
      });
    }

    this.state.initialized = true;
  }
};

window.Leads = Leads;
