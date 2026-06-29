const Leads = {
  formDropdownDefaults: {
    lead_source: ['Website', 'Referral', 'LinkedIn', 'Email', 'Call', 'WhatsApp', 'Event', 'Other'],
    service_interest: ['Software' , 'Other' , 'Consulting'],
    status: ['not contacted yet', 'not available', 'negotiation', 'lost', 'qualified'],
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
    currentLead: null,
    selectedLeadId: '',
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
  emptyStringToNull(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return value;
  },
  cleanUuidValue(value) {
    const cleaned = this.emptyStringToNull(value);
    if (cleaned === undefined || cleaned === null) return cleaned;
    return String(cleaned).trim();
  },
  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  cleanUuidOrUndefined(value) {
    const cleaned = this.cleanUuidValue(value);
    if (cleaned === undefined || cleaned === null) return undefined;
    return this.isUuid(cleaned) ? cleaned : undefined;
  },
  normalizeCompany(raw = {}) {
    return { ...raw, company_uuid: this.cleanUuidValue(raw.company_uuid ?? raw.companyUuid ?? raw.id), company_id: String(this.pick(raw, 'company_id', 'companyId')).trim(), company_name: String(this.pick(raw, 'company_name', 'companyName')).trim(), legal_name: String(this.pick(raw, 'legal_name', 'legalName')).trim(), company_type: String(this.pick(raw, 'company_type', 'companyType')).trim(), industry: String(this.pick(raw, 'industry')).trim(), website: String(this.pick(raw, 'website')).trim(), main_email: String(this.pick(raw, 'main_email', 'mainEmail')).trim(), main_phone: String(this.pick(raw, 'main_phone', 'mainPhone')).trim(), country: String(this.pick(raw, 'country')).trim(), city: String(this.pick(raw, 'city')).trim(), address: String(this.pick(raw, 'address')).trim(), tax_number: String(this.pick(raw, 'tax_number', 'taxNumber')).trim(), company_status: String(this.pick(raw, 'company_status', 'companyStatus')).trim(), source: String(this.pick(raw, 'source')).trim(), owner_name: String(this.pick(raw, 'owner_name', 'ownerName')).trim(), owner_email: String(this.pick(raw, 'owner_email', 'ownerEmail')).trim(), notes: String(this.pick(raw, 'notes')).trim() };
  },
  normalizeContact(raw = {}) {
    const fullName = U.buildContactDisplayName(raw);
    const contactUuid = this.cleanUuidValue(raw.contact_uuid ?? raw.contactUuid ?? raw.id ?? raw.contact_id ?? raw.contactId);
    const selectedCompanyUuid = this.cleanUuidValue(raw.selected_company_uuid ?? raw.selectedCompanyUuid ?? raw.company_uuid ?? raw.companyUuid ?? raw.company_id ?? raw.companyId);
    return {
      ...raw,
      contact_uuid: contactUuid,
      contact_id: contactUuid || String(this.pick(raw, 'contact_id', 'contactId')).trim(),
      contact_ref: String(raw.contact_ref || raw.contactRef || raw.contact_number || raw.contactNumber || raw.contact_code || raw.contactCode || '').trim(),
      company_uuid: selectedCompanyUuid,
      company_id: selectedCompanyUuid || String(this.pick(raw, 'company_id', 'companyId')).trim(),
      company_ref: String(raw.selected_company_ref || raw.selectedCompanyRef || raw.company_ref || raw.companyRef || '').trim(),
      company_name: String(raw.selected_company_name || raw.selectedCompanyName || this.pick(raw, 'company_name', 'companyName')).trim(),
      first_name: String(this.pick(raw, 'first_name', 'firstName')).trim(),
      last_name: String(this.pick(raw, 'last_name', 'lastName')).trim(),
      full_name: fullName || String(raw.contact_name || raw.contactName || '').trim(),
      job_title: String(raw.contact_position || raw.contactPosition || this.pick(raw, 'job_title', 'jobTitle')).trim(),
      department: String(this.pick(raw, 'department')).trim(),
      email: String(this.pick(raw, 'email')).trim(),
      phone: String(this.pick(raw, 'phone')).trim(),
      mobile: String(this.pick(raw, 'mobile')).trim(),
      decision_role: String(this.pick(raw, 'decision_role', 'decisionRole')).trim(),
      is_primary_contact: Boolean(raw?.is_primary_contact ?? raw?.isPrimaryContact ?? raw?.is_primary),
      contact_status: String(this.pick(raw, 'contact_status', 'contactStatus')).trim(),
      notes: String(this.pick(raw, 'notes')).trim()
    };
  },

  getLeadContactId(lead = {}) {
    return (
      lead.contact_id ||
      lead.customer_contact_id ||
      lead.client_contact_id ||
      lead.primary_contact_id ||
      lead.selected_contact_id ||
      null
    );
  },
  async loadLeadContactForDealConversion(lead = {}) {
    const leadContactId = this.getLeadContactId(lead);
    if (!leadContactId) return null;
    const contactsTable = 'contacts';
    const { data, error } = await this.getClient()
      .from(contactsTable)
      .select('*')
      .eq('id', leadContactId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load lead contact during deal conversion:', error);
    }

    return data || null;
  },
  normalizeBool(value) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return 'yes';
    if (['false', '0', 'no', 'n'].includes(normalized)) return 'no';
    return '';
  },
  allowedLeadStatuses() {
    return this.formDropdownDefaults.status;
  },
  normalizeLeadStatus(status) {
    const value = String(status || '').trim().toLowerCase();

    const map = {
      '': 'not contacted yet',
      'new': 'not contacted yet',
      'open': 'not contacted yet',
      'not contacted': 'not contacted yet',
      'not contacted yet': 'not contacted yet',
      'not_contacted_yet': 'not contacted yet',

      'not available': 'not available',
      'not_available': 'not available',
      'unavailable': 'not available',

      'negotiation': 'negotiation',
      'negotiating': 'negotiation',
      'in negotiation': 'negotiation',
      'in_negotiation': 'negotiation',
      'negotiations': 'negotiation',

      'lost': 'lost',
      'closed lost': 'lost',
      'closed_lost': 'lost',

      'qualified': 'qualified',
      'qualify': 'qualified',
      'converted': 'qualified',
      'converted to deal': 'qualified',
      'converted_to_deal': 'qualified',
      'coverted to deal': 'qualified',
      'coverted_to_deal': 'qualified'
    };

    return map[value] || 'not contacted yet';
  },
  pickNextFollowUpValue(lead = {}) {
    return String(
      lead.next_follow_up_at ||
        lead.nextFollowUpAt ||
        lead.next_follow_up_date ||
        lead.nextFollowUpDate ||
        lead.next_follow_up ||
        lead.nextFollowUp ||
        lead.next_followup_date ||
        lead.nextFollowupDate ||
        ''
    ).trim();
  },
  formatDateTimeLocalValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}))?/);
      return match ? `${match[1]}T${match[2] || '00:00'}` : '';
    }
    const yyyy = String(date.getFullYear()).padStart(4, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  },
  dateTimeLocalToIso(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  },
  leadNextFollowUpInput() {
    return E.leadNextFollowUpAtInput || E.leadFormNextFollowupDate || document.getElementById('leadNextFollowUpAtInput') || document.getElementById('leadFormNextFollowupDate');
  },
  hasLeadConversionPermission() {
    return Boolean(
      Permissions.can('leads', 'convert') ||
        Permissions.can('leads', 'convert_to_deal') ||
        Permissions.can('deals', 'create') ||
        Permissions.canCreate?.('deals') ||
        Permissions.can('deals', 'manage') ||
        Permissions.can('leads', 'manage')
    );
  },
  validateLeadWorkflow(lead = {}) {
    const status = this.normalizeLeadStatus(lead.status);
    if (!this.allowedLeadStatuses().includes(status)) {
      UI.toast('Please select a valid lead status.');
      return false;
    }
    const nextFollowUp = this.pickNextFollowUpValue(lead);
    if (!nextFollowUp) {
      UI.toast('Next follow-up is required for every lead change.');
      return false;
    }
    const nextFollowUpIso = this.dateTimeLocalToIso(nextFollowUp) || nextFollowUp;
    lead.status = status;
    lead.next_follow_up = nextFollowUpIso;
    lead.next_follow_up_at = nextFollowUpIso;
    return true;
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
      company_uuid: this.cleanUuidValue(raw.company_uuid ?? raw.companyUuid),
      contact_id: String(raw.contact_id || raw.contactId || '').trim(),
      contact_uuid: this.cleanUuidValue(raw.contact_uuid ?? raw.contactUuid),
      contact_name: String(raw.contact_name || raw.contactName || '').trim(),
      contact_email: String(raw.contact_email || raw.contactEmail || '').trim(),
      contact_phone: String(raw.contact_phone || raw.contactPhone || '').trim(),
      phone: String(raw.phone || '').trim(),
      email: String(raw.email || '').trim(),
      country: String(raw.country || '').trim(),
      lead_source: String(raw.lead_source || raw.leadSource || '').trim(),
      service_interest: String(raw.service_interest || raw.serviceInterest || '').trim(),
      status: this.normalizeLeadStatus(raw.status),
      priority: String(raw.priority || '').trim(),
      estimated_value: raw.estimated_value ?? raw.estimatedValue ?? '',
      currency: String(raw.currency || '').trim(),
      assigned_to: String(raw.assigned_to ?? raw.assignedTo ?? '').trim(),
      next_follow_up: this.pickNextFollowUpValue(raw),
      next_follow_up_at: this.pickNextFollowUpValue(raw),
      last_contact:
        raw.last_contact ||
        raw.lastContact ||
        raw.last_contact_date ||
        raw.lastContactDate ||
        '',
      notes: String(raw.notes || '').trim(),
      updated_at: raw.updated_at || raw.updatedAt || '',
      converted_at: raw.converted_at || raw.convertedAt || '',
      deal_id: String(raw.deal_id || raw.converted_to_deal_id || raw.deal_id_ref || raw.converted_deal_id || '').trim(),
      converted_deal_uuid: this.cleanUuidValue(raw.converted_deal_uuid ?? raw.convertedDealUuid),
      converted_by: this.cleanUuidValue(raw.converted_by ?? raw.convertedBy),
      owner_id: this.cleanUuidValue(raw.owner_id ?? raw.ownerId),
      last_updated_by: this.cleanUuidValue(raw.last_updated_by ?? raw.lastUpdatedBy)
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
    return this.cleanLeadUuidPayload({
      ...(includeLeadId ? { lead_id: leadIdValue || null } : {}),
      full_name: String(lead.full_name || ''),
      company_name: String(lead.company_name || ''),
      company_uuid: this.cleanUuidOrUndefined(lead.company_uuid ?? lead.companyUuid),
      customer_name: String(lead.customer_name || ''),
      customer_legal_name: String(lead.customer_legal_name || ''),
      customer_address: String(lead.customer_address || ''),
      company_id: String(lead.company_id || ''),
      contact_id: String(lead.contact_id || ''),
      contact_uuid: this.cleanUuidOrUndefined(lead.contact_uuid ?? lead.contactUuid),
      contact_name: String(lead.contact_name || ''),
      contact_email: String(lead.contact_email || ''),
      contact_phone: String(lead.contact_phone || ''),
      phone: String(lead.phone || ''),
      email: String(lead.email || ''),
      country: String(lead.country || ''),
      lead_source: String(lead.lead_source || ''),
      service_interest: String(lead.service_interest || ''),
      status: this.normalizeLeadStatus(lead.status),
      priority: String(lead.priority || ''),
      estimated_value: Number.isFinite(estimatedValueParsed) ? estimatedValueParsed : null,
      currency: String(lead.currency || ''),
      assigned_to: String(lead.assigned_to ?? lead.assignedTo ?? '').trim(),
      owner_id: this.cleanUuidOrUndefined(lead.owner_id ?? lead.ownerId),
      next_follow_up: this.pickNextFollowUpValue(lead) || null,
      next_follow_up_at: this.pickNextFollowUpValue(lead) || null,
      last_contact: lead.last_contact || null,
      notes: String(lead.notes || ''),
      converted_at: lead.converted_at || lead.convertedAt || null,
      converted_to_deal_id: this.cleanUuidOrUndefined(lead.converted_to_deal_id ?? lead.convertedDealId),
      converted_deal_uuid: this.cleanUuidOrUndefined(lead.converted_deal_uuid ?? lead.convertedDealUuid),
      converted_by: this.cleanUuidOrUndefined(lead.converted_by ?? lead.convertedBy),
      last_updated_by: this.cleanUuidOrUndefined(lead.last_updated_by ?? lead.lastUpdatedBy)
    });
  },
  cleanLeadUuidPayload(payload = {}) {
    const cleaned = { ...(payload && typeof payload === 'object' ? payload : {}) };
    const uuidFields = [
      'id',
      'company_uuid',
      'contact_uuid',
      'owner_id',
      'created_by',
      'updated_by',
      'converted_to_deal_id',
      'converted_deal_uuid',
      'converted_by',
      'last_updated_by'
    ];
    uuidFields.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(cleaned, field)) {
        cleaned[field] = this.cleanUuidOrUndefined(cleaned[field]);
      }
    });
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key] === undefined) delete cleaned[key];
    });
    return cleaned;
  },
  debugLeadPayload(label, payload) {
    try {
      const host = String(window.location.hostname || '').toLowerCase();
      if (window.RUNTIME_CONFIG?.DEBUG_API || host === 'localhost' || host === '127.0.0.1') {
        console.debug(label, payload);
      }
    } catch {}
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
  getUserDisplayName(userId, usersById = new Map()) {
    const id = String(userId || '').trim();
    if (!id) return 'Unknown user';
    const user = usersById.get(id) || usersById.get(String(userId));
    if (!user) return 'Unknown user';
    return String(
      user.full_name ||
        user.fullName ||
        user.name ||
        user.display_name ||
        user.displayName ||
        user.email ||
        ''
    ).trim() || 'Unknown user';
  },
  addUserLookup(usersById, user = {}) {
    if (!usersById || !user || typeof user !== 'object') return;
    ['id', 'auth_user_id', 'authUserId', 'user_id', 'userId'].forEach(key => {
      const value = String(user?.[key] || '').trim();
      if (value && !usersById.has(value)) usersById.set(value, user);
    });
  },
  addCurrentUserLookup(usersById, userIds = []) {
    const currentUser = Session?.user?.() || {};
    const authUser = currentUser.user || {};
    const profile = currentUser.profile || {};
    const currentUserId = String(currentUser.user_id || authUser.id || profile.id || '').trim();
    const currentUserIdentifiers = [currentUser.user_id, authUser.id, profile.id]
      .map(value => String(value || '').trim())
      .filter(Boolean);
    if (!currentUserIdentifiers.some(id => userIds.includes(id))) return;
    this.addUserLookup(usersById, {
      ...profile,
      id: profile.id || currentUserId,
      auth_user_id: authUser.id || currentUserId,
      user_id: currentUserId,
      full_name: profile.full_name || currentUser.name,
      name: profile.name || currentUser.name,
      display_name: profile.display_name || currentUser.name,
      email: profile.email || currentUser.email || authUser.email
    });
  },
  addLogUserHints(usersById, logs = []) {
    logs.forEach(log => {
      const createdBy = String(log?.created_by || '').trim();
      if (!createdBy || usersById.has(createdBy)) return;
      const hintedUser = {
        id: createdBy,
        full_name: log?.user_name || log?.created_by_name,
        name: log?.user_name || log?.created_by_name,
        email: log?.created_by_email
      };
      if (this.getUserDisplayName(createdBy, new Map([[createdBy, hintedUser]])) !== createdBy) {
        this.addUserLookup(usersById, hintedUser);
      }
    });
  },
  async loadLeadNoteUsersById(logs = []) {
    const userIds = [...new Set((Array.isArray(logs) ? logs : [])
      .map(log => String(log?.created_by || '').trim())
      .filter(Boolean))];
    const usersById = new Map();
    if (!userIds.length) return usersById;

    this.addCurrentUserLookup(usersById, userIds);
    this.addLogUserHints(usersById, logs);

    const queryProfiles = async field => {
      const { data, error } = await this.getClient()
        .from('profiles')
        .select('*')
        .in(field, userIds);
      if (error) {
        console.warn(`[leads] unable to resolve note users by profiles.${field}`, error);
        return;
      }
      (Array.isArray(data) ? data : []).forEach(user => this.addUserLookup(usersById, user));
    };

    await queryProfiles('id');
    const unresolvedIds = () => userIds.filter(id => !usersById.has(id));
    if (unresolvedIds().length) await queryProfiles('auth_user_id');
    if (unresolvedIds().length) await queryProfiles('user_id');

    return usersById;
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
    if (String(this.state.selectedLeadId || '') === String(normalized.id || '')) this.renderLeadDetails(normalized);
    return normalized;
  },
  removeLocalRow(id) {
    const before = this.state.rows.length;
    this.state.rows = this.state.rows.filter(item => item.id !== id);
    if (String(this.state.selectedLeadId || '') === String(id || '')) this.closeDetails();
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
    const payload = this.cleanLeadUuidPayload({
      ...this.backendLead(lead),
      created_by: this.isUuid(userId) ? userId : undefined,
      updated_by: this.isUuid(userId) ? userId : undefined
    });
    payload.status = this.normalizeLeadStatus(payload.status);
    this.debugLeadPayload('[leads] create payload', payload);
    const data = await Api.requestWithSession('leads', 'create', payload, { requireAuth: true });
    console.log('[leads] saved row', data);
    this.refreshCompanyLifecycleStatus(data || payload, 'Lead');
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
    if (!this.isUuid(leadId)) {
      UI.toast('Lead database ID is missing. Please refresh and reopen the lead.');
      return null;
    }
    const userId = await this.getCurrentUserId();
    const payload = this.cleanLeadUuidPayload({
      ...this.backendLead(updates),
      updated_by: this.isUuid(userId) ? userId : undefined
    });
    payload.status = this.normalizeLeadStatus(payload.status);
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) delete payload[key];
    });
    [
      'id',
      'company_uuid',
      'contact_uuid',
      'created_by',
      'updated_by',
      'converted_to_deal_id',
      'converted_deal_uuid',
      'converted_by',
      'last_updated_by'
    ].forEach(key => {
      if (payload[key] === '') delete payload[key];
    });
    this.debugLeadPayload('[leads] update payload', payload);
    const data = await Api.requestWithSession('leads', 'update', {
      id: leadId,
      updates: payload
    }, { requireAuth: true });
    console.log('[leads] saved row', data);
    this.refreshCompanyLifecycleStatus(data || payload, 'Lead');
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

  refreshCompanyLifecycleStatus(row = {}, stage = 'Lead') {
    const companyId = String(row?.company_id || row?.companyId || '').trim();
    if (!companyId) return;
    window.Companies?.refreshCompanyLifecycleStatusByBusinessId?.(companyId, { stage }).catch(error => {
      console.error('[leads] company lifecycle refresh failed', error);
      UI?.toast?.('Lead saved, but company lifecycle status could not be refreshed');
    });
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
  buildDealFromLead(lead, company = {}, selectedContact = null) {
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
      company_id: lead.company_id || lead.customer_company_id || lead.client_company_id || company.company_id || null,
      customer_name: legalCustomerName,
      customer_legal_name: legalCustomerName,
      customer_address: String(company.address || lead.customer_address || '').trim(),
      contact_id: this.getLeadContactId(lead),
      customer_contact_id: this.getLeadContactId(lead),
      contact_name:
        selectedContact?.full_name ||
        selectedContact?.contact_name ||
        selectedContact?.name ||
        [selectedContact?.first_name, selectedContact?.last_name].filter(Boolean).join(' ') ||
        lead.contact_name ||
        lead.customer_contact_name ||
        '',
      contact_email:
        selectedContact?.email ||
        selectedContact?.contact_email ||
        selectedContact?.work_email ||
        lead.contact_email ||
        lead.customer_contact_email ||
        '',
      contact_phone:
        selectedContact?.phone ||
        selectedContact?.mobile ||
        selectedContact?.mobile_number ||
        lead.contact_phone ||
        lead.customer_contact_phone ||
        '',
      contact_title:
        selectedContact?.title ||
        selectedContact?.job_title ||
        selectedContact?.position ||
        selectedContact?.designation ||
        lead.contact_title ||
        lead.customer_contact_title ||
        '',
      phone: lead.phone,
      email: lead.email,
      country: lead.country,
      lead_source: lead.lead_source,
      service_interest: lead.service_interest,
      stage: 'New',
      priority: lead.priority || '',
      estimated_value: Number.isFinite(estimatedValueNumber) ? estimatedValueNumber : null,
      currency: lead.currency || '',
      assigned_to: lead.assigned_to || '',
      next_follow_up_at: this.pickNextFollowUpValue(lead) || '',
      last_contacted_date: String(lead.last_contact || lead.lastContact || lead.last_contact_date || lead.lastContactDate || '').slice(0, 10),
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
    const normalized = this.normalizeLead(row || {});
    return (
      this.hasLeadConversionPermission() &&
      normalized.status === 'qualified' &&
      !this.isConvertedLead(normalized) &&
      !!String(normalized.id || '').trim()
    );
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
  formatNoteLogDate(value) {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    }).replace(',', '');
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
          this.normalizeLeadStatus(this.getLeadValue(row, 'status')),
          this.getLeadValue(row, 'priority'),
          this.getLeadValue(row, 'estimated_value', 'estimatedValue'),
          this.getLeadValue(row, 'currency'),
          this.getLeadValue(row, 'assigned_to', 'assignedTo'),
          this.formatDateMMDDYYYY(nextFollowUp),
          this.formatDateMMDDYYYY(lastContact),
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
    const assign = (el, values, selected, labels = {}) => {
      if (!el) return;
      const options = ['All', ...values];
      el.innerHTML = options
        .map(option => `<option value="${U.escapeAttr(option)}">${U.escapeHtml(labels[option] || option)}</option>`)
        .join('');
      if (options.includes(selected)) el.value = selected;
    };

    const uniq = values =>
      [...new Set(values.filter(Boolean).map(value => String(value).trim()))].sort((a, b) =>
        a.localeCompare(b)
      );

    if (E.leadsSearchInput) E.leadsSearchInput.value = this.state.search || '';
    if (this.state.status !== 'All' && !this.allowedLeadStatuses().includes(this.state.status)) this.state.status = 'All';
    assign(E.leadsStatusFilter, this.allowedLeadStatuses(), this.state.status, { All: 'All Statuses' });
    assign(
      E.leadsServiceInterestFilter,
      uniq(this.state.rows.map(row => row.service_interest)),
      this.state.serviceInterest
    );
    assign(E.leadsAssignedToFilter, uniq(this.state.rows.map(row => row.assigned_to)), this.state.assignedTo);

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
      const values = el === E.leadFormStatus ? options : this.uniqueSorted(options);
      const finalOptions = el === E.leadFormStatus ? values : ['', ...values];
      el.innerHTML = finalOptions
        .map(value => `<option value="${U.escapeAttr(value)}">${U.escapeHtml(value || '—')}</option>`)
        .join('');
      selectedValue = el === E.leadFormStatus ? this.normalizeLeadStatus(selectedValue) : selectedValue;
      if (finalOptions.includes(selectedValue)) {
        el.value = selectedValue;
        return;
      }
      if (selectedValue && el !== E.leadFormStatus) {
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
    const statusValues = this.formDropdownDefaults.status;
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
  leadInitials(row = {}) {
    const source = String(row.full_name || row.contact_name || row.company_name || row.lead_id || '').trim();
    if (!source) return 'L';
    const words = source.split(/\s+/).filter(Boolean);
    const initials = words.length > 1 ? `${words[0][0] || ''}${words[1][0] || ''}` : source.slice(0, 2);
    return initials.toUpperCase();
  },
  leadAvatarClass(row = {}) {
    const source = String(row.full_name || row.company_name || row.lead_id || 'lead');
    const sum = [...source].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return ['violet', 'blue', 'green', 'orange'][sum % 4];
  },
  leadChip(label = '', variant = 'neutral') {
    const text = String(label || '').trim() || '—';
    return `<span class="lead-chip lead-chip--${U.escapeAttr(variant)}">${U.escapeHtml(text)}</span>`;
  },
  leadStatusChip(status = '') {
    const normalized = this.normalizeLeadStatus(status);
    const variants = {
      'qualified': 'success',
      'negotiation': 'info',
      'not contacted yet': 'neutral',
      'not available': 'warning',
      'lost': 'danger'
    };
    return this.leadChip(normalized, variants[normalized] || 'neutral');
  },
  leadPriorityChip(priority = '') {
    const normalized = String(priority || '').trim();
    const lower = normalized.toLowerCase();
    const variant = lower === 'high' || lower === 'urgent' ? 'danger' : lower === 'medium' ? 'info' : lower === 'low' ? 'success' : 'neutral';
    return this.leadChip(normalized || '—', variant);
  },
  leadAssigneePill(name = '') {
    const display = String(name || '').trim();
    if (!display) return '—';
    const initials = display.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
    return `<span class="lead-assignee-pill"><span>${U.escapeHtml(initials)}</span>${U.escapeHtml(display)}</span>`;
  },
  formatLeadMoneyCell(row = {}) {
    const amount = Number(row.estimated_value);
    if (!Number.isFinite(amount)) return '—';
    const currency = String(row.currency || '').trim().toUpperCase();
    if (currency) {
      try {
        return U.escapeHtml(amount.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }));
      } catch (_) {
        return U.escapeHtml(`${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
      }
    }
    return U.escapeHtml(amount.toLocaleString(undefined, { maximumFractionDigits: 2 }));
  },
  compactLeadDate(value) {
    const normalized = this.normalizeComparableLeadDate(value);
    return normalized ? U.escapeHtml(normalized) : '—';
  },
  truncateLeadNotes(value = '') {
    const text = String(value || '').trim();
    if (!text) return '—';
    return U.escapeHtml(text.length > 150 ? `${text.slice(0, 147)}...` : text);
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
    if (filter === 'not-contacted-yet') return status === 'not contacted yet';
    if (filter === 'not-available') return status === 'not available';
    if (filter === 'negotiation') return status === 'negotiation';
    if (filter === 'qualified' || filter === 'conversion-rate') return status === 'qualified';
    if (filter === 'lost') return status === 'lost';
    if (filter === 'high-priority') return priority === 'high' || priority === 'urgent';
    if (filter === 'pipeline-value') return estimatedValue > 0;
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
    const statusKeys = ['not contacted yet', 'not available', 'negotiation', 'lost', 'qualified'];
    const statusBreakdown = Object.fromEntries(statusKeys.map(key => [key, 0]));
    const currencyTotals = new Set();
    let pipelineValue = 0;
    let highPriorityCount = 0;

    rows.forEach(row => {
      const status = this.normalizeText(row?.status);
      if (statusBreakdown[status] !== undefined) statusBreakdown[status] += 1;

      const priority = this.normalizeText(row?.priority);
      if (priority === 'high' || priority === 'urgent') highPriorityCount += 1;

      pipelineValue += this.parseEstimatedValue(row?.estimated_value);
      const currency = String(row?.currency || '')
        .trim()
        .toUpperCase();
      if (currency) currencyTotals.add(currency);
    });

    const total = rows.length;
    const wonCount = statusBreakdown.qualified || 0;
    const conversionRate = total > 0 ? (wonCount / total) * 100 : 0;
    const currencies = [...currencyTotals];
    const pipelineCurrency = currencies.length === 1 ? currencies[0] : '';

    return {
      total,
      newCount: statusBreakdown['not contacted yet'] || 0,
      notAvailableCount: statusBreakdown['not available'] || 0,
      negotiationCount: statusBreakdown.negotiation || 0,
      qualifiedCount: statusBreakdown.qualified || 0,
      proposalSentCount: 0,
      wonCount,
      lostCount: statusBreakdown.lost || 0,
      highPriorityCount,
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
    setText(E.leadsKpiProposalSent, String(safe.notAvailableCount || 0));
    setText(E.leadsKpiWon, String(safe.negotiationCount || 0));
    setText(E.leadsKpiLost, String(safe.lostCount || 0));
    setText(E.leadsKpiHighPriority, String(safe.highPriorityCount || 0));
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
        ['Not Contacted Yet', 'not contacted yet'],
        ['Not Available', 'not available'],
        ['Negotiation', 'negotiation'],
        ['Lost', 'lost'],
        ['Qualified', 'qualified']
      ];
      const total = safe.total || 0;
      const statusRows = statuses
        .map(([label, key]) => {
          const count = safe.statusBreakdown?.[key] || 0;
          const percent = total > 0 ? (count / total) * 100 : 0;
          return `<div class="leads-status-row" data-status="${U.escapeAttr(key)}">
            <div class="leads-status-label"><span class="leads-status-dot"></span>${U.escapeHtml(label)}</div>
            <div class="leads-status-count">${count}</div>
            <div class="leads-status-track"><span class="leads-status-fill" style="width:${Math.min(100, percent).toFixed(1)}%"></span></div>
            <div class="leads-status-meta">${percent.toFixed(1)}%</div>
          </div>`;
        })
        .join('');
      E.leadsStatusDistribution.innerHTML = `${statusRows}<div class="leads-status-row leads-status-row--total" data-status="total">
        <div class="leads-status-label"><span class="leads-status-dot"></span>Total Leads</div>
        <div class="leads-status-count">${total}</div>
        <div class="leads-status-track"><span class="leads-status-fill" style="width:${total ? 100 : 0}%"></span></div>
        <div class="leads-status-meta">${total ? '100%' : '0.0%'}</div>
      </div>`;
    }
    this.syncKpiCardState();
  },
  findLeadById(id) {
    const target = String(id || '').trim();
    if (!target) return null;
    return (
      this.state.rows.find(item => String(item.id || '') === target) ||
      this.state.filteredRows.find(item => String(item.id || '') === target) ||
      null
    );
  },
  leadDisplay(value, fallback = '—') {
    const text = String(value ?? '').trim();
    return text || fallback;
  },
  formatLeadDateTime(value) {
    if (!value) return '—';
    try { return U.formatDateTimeMMDDYYYYHHMM(value); } catch { return this.normalizeComparableLeadDate(value) || '—'; }
  },
  formatLeadMoney(row = {}) {
    const amount = Number(row.estimated_value);
    if (!Number.isFinite(amount)) return '—';
    const currency = String(row.currency || '').trim();
    return `${currency ? `${currency.toUpperCase()} ` : ''}${U.fmtNumber(amount)}`;
  },
  leadDetailsSection(title, content, cls = '') {
    return `<section class="payment-forecast-details-section lead-details-section ${cls}"><h3>${U.escapeHtml(title)}</h3>${content}</section>`;
  },
  leadDetailsField(label, value) {
    return `<div class="lead-details-field"><span>${U.escapeHtml(label)}</span><strong>${U.escapeHtml(this.leadDisplay(value))}</strong></div>`;
  },
  leadDetailsGrid(items = []) {
    return `<div class="lead-details-fields">${items.map(([label, value]) => this.leadDetailsField(label, value)).join('')}</div>`;
  },
  leadDetailsActions(row = {}) {
    const id = U.escapeAttr(row.id || '');
    const actions = [];
    if (this.canEditDelete()) actions.push(`<button class="btn primary sm" type="button" data-lead-details-edit="${id}">Edit Lead</button>`);
    if (this.canConvertLead(row)) actions.push(`<button class="btn ghost sm" type="button" data-lead-details-convert="${id}">Convert to Deal</button>`);
    if (this.canEditDelete()) actions.push(`<button class="btn ghost sm" type="button" data-lead-details-delete="${id}">Delete</button>`);
    actions.push('<button class="btn ghost sm" type="button" data-lead-close-details>Close</button>');
    return this.leadDetailsSection('Actions', `<div class="lead-details-actions">${actions.join('')}</div>`);
  },
  renderLeadDetails(row = null) {
    const content = document.getElementById('leadDetailsContent');
    if (!content) return;
    const lead = row ? this.normalizeLead(row) : this.findLeadById(this.state.selectedLeadId);
    if (!lead) {
      content.innerHTML = '<div class="pf-detail-empty">Lead details are not available. Refresh the list and try again.</div>';
      return;
    }
    const title = document.getElementById('leadDetailsTitle');
    const subtitle = document.getElementById('leadDetailsSubtitle');
    if (title) title.textContent = lead.lead_id || 'Lead Details';
    if (subtitle) subtitle.textContent = [lead.company_name, lead.full_name, lead.status].filter(Boolean).join(' · ');
    const summary = this.leadDetailsSection('Summary', `<div class="payment-forecast-details-grid">
      ${[
        ['Status', lead.status],
        ['Priority', lead.priority],
        ['Next Follow-up', this.formatLeadDateTime(lead.next_follow_up || lead.next_follow_up_at)],
        ['Estimated Value', this.formatLeadMoney(lead)],
        ['Assigned To', lead.assigned_to],
        ['Last Contact', this.normalizeComparableLeadDate(lead.last_contact) || '—']
      ].map(([label, value]) => `<div class="payment-forecast-details-card"><span>${U.escapeHtml(label)}</span><strong>${U.escapeHtml(this.leadDisplay(value))}</strong></div>`).join('')}
    </div>`);
    const companyContact = this.leadDetailsSection('Company & Contact', this.leadDetailsGrid([
      ['Company', lead.company_name || lead.customer_legal_name || lead.customer_name],
      ['Contact', lead.full_name || lead.contact_name],
      ['Email', lead.email || lead.contact_email],
      ['Phone', lead.phone || lead.contact_phone],
      ['Country', lead.country],
      ['Company UUID', lead.company_id || lead.company_uuid]
    ]));
    const leadInfo = this.leadDetailsSection('Lead Information', this.leadDetailsGrid([
      ['Lead Source', lead.lead_source],
      ['Service Interest', lead.service_interest],
      ['Currency', lead.currency],
      ['Created At', this.formatLeadDateTime(lead.created_at)],
      ['Updated At', this.formatLeadDateTime(lead.updated_at)],
      ['Converted Deal', lead.deal_id || lead.converted_deal_uuid || (lead.converted_at ? 'Converted' : '')]
    ]));
    const notes = this.leadDetailsSection('Notes', `<div class="lead-details-notes">${U.escapeHtml(lead.notes || 'No notes added yet.')}</div>`);
    content.innerHTML = `${summary}${companyContact}${leadInfo}${notes}${this.leadDetailsActions(lead)}`;
  },
  openDetails(rowOrId) {
    const row = typeof rowOrId === 'string' ? this.findLeadById(rowOrId) : rowOrId;
    if (!row) {
      UI.toast('Lead details are not available. Refresh the list and try again.');
      return;
    }
    const lead = this.normalizeLead(row);
    this.state.selectedLeadId = lead.id || '';
    const drawer = document.getElementById('leadDetailsDrawer');
    if (!drawer) return;
    drawer.hidden = false;
    document.body.classList.add('pf-modal-open');
    this.renderLeadDetails(lead);
    this.render();
  },
  closeDetails() {
    const drawer = document.getElementById('leadDetailsDrawer');
    if (drawer) drawer.hidden = true;
    document.body.classList.remove('pf-modal-open');
    this.state.selectedLeadId = '';
    this.render();
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
            '<td colspan="19"><div class="skeleton-line" style="height:12px;margin:6px 0;"></div></td>' +
            '</tr>'
        )
        .join('');
      return;
    }
    if (this.state.loadError) {
      E.leadsState.textContent = this.state.loadError;
      this.renderLeadAnalytics(this.computeLeadAnalytics([]));
      E.leadsTbody.innerHTML = `<tr><td colspan="19" class="muted" style="text-align:center;color:#ffb4b4;">${U.escapeHtml(this.state.loadError)}</td></tr>`;
      return;
    }

    const rows = this.state.filteredRows;
    this.renderLeadAnalytics(this.computeLeadAnalytics(rows));
    const shownFrom = rows.length ? (Number(this.state.offset) || 0) + 1 : 0;
    const shownTo = rows.length ? (Number(this.state.offset) || 0) + rows.length : 0;
    const totalEstimate = Number(this.state.total) || rows.length;
    const totalLabel = this.state.hasMore ? `${totalEstimate}+` : String(totalEstimate || rows.length);
    E.leadsState.textContent = rows.length
      ? `Showing ${shownFrom}-${shownTo} of ${totalLabel} records`
      : 'No records to show';
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
      E.leadsTbody.innerHTML = '<tr><td colspan="19" class="muted leads-empty-row">No leads found for current filters.</td></tr>';
      return;
    }

    E.leadsTbody.innerHTML = rows
      .map(row => {
        const rowId = U.escapeAttr(row.id || '');
        const actionButtons = [];
        if (this.canConvertLead(row)) {
          actionButtons.push(
            `<button class="lead-menu-item" type="button" data-lead-convert="${rowId}">Convert to Deal</button>`
          );
        }
        if (this.canEditDelete()) {
          actionButtons.push(
            `<button class="lead-menu-item" type="button" data-lead-edit="${rowId}">Edit</button>`
          );
          actionButtons.push(
            `<button class="lead-menu-item danger" type="button" data-lead-delete="${rowId}">Delete</button>`
          );
        }
        const menu = actionButtons.length
          ? `<details class="lead-actions-menu"><summary class="lead-more-btn" aria-label="More lead actions">⋮</summary><div class="lead-actions-popover">${actionButtons.join('')}</div></details>`
          : '';
        const actions = `<div class="lead-row-actions"><button class="lead-view-btn" type="button" data-lead-view="${rowId}">View</button>${menu}</div>`;
        const isSelected = String(this.state.selectedLeadId || '') === String(row.id || '');
        return `<tr class="lead-clickable-row${isSelected ? ' is-selected' : ''}" tabindex="0" data-lead-row="${rowId}" aria-label="Open lead ${U.escapeAttr(row.lead_id || row.company_name || row.full_name || '')} details">
          <td class="lead-id-cell">${U.escapeHtml(row.lead_id || '—')}</td>
          <td>${this.formatDate(row.created_at)}</td>
          <td class="lead-name-cell"><div class="lead-name-wrap"><span class="lead-avatar lead-avatar--${this.leadAvatarClass(row)}">${U.escapeHtml(this.leadInitials(row))}</span><span>${U.escapeHtml(row.full_name || '—')}</span></div></td>
          <td>${U.escapeHtml(row.company_name || '—')}</td>
          <td>${U.escapeHtml(row.phone || '—')}</td>
          <td class="lead-email-cell">${U.escapeHtml(row.email || '—')}</td>
          <td>${U.escapeHtml(row.country || '—')}</td>
          <td>${U.escapeHtml(row.lead_source || '—')}</td>
          <td>${U.escapeHtml(row.service_interest || '—')}</td>
          <td>${this.leadStatusChip(row.status)}</td>
          <td>${this.leadPriorityChip(row.priority)}</td>
          <td class="lead-money-cell">${this.formatLeadMoneyCell(row)}</td>
          <td>${U.escapeHtml(row.currency || '—')}</td>
          <td>${this.leadAssigneePill(row.assigned_to)}</td>
          <td>${this.compactLeadDate(row.next_follow_up || row.next_follow_up_at)}</td>
          <td>${this.compactLeadDate(row.last_contact)}</td>
          <td class="lead-notes-cell">${this.truncateLeadNotes(row.notes)}</td>
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
  resetLeadSelectionState({ clearCurrentLead = false } = {}) {
    if (clearCurrentLead) this.state.currentLead = null;
    this.state.selectedCompany = null;
    this.state.selectedContact = null;
    this.state.companyPickerRows = [];
    this.state.contactPickerRows = [];

    [
      'leadFormCompanyId', 'leadFormCompanyName', 'leadCompanyLegalName', 'leadCompanyType',
      'leadCompanyIndustry', 'leadCompanyWebsite', 'leadCompanyMainEmail', 'leadCompanyMainPhone',
      'leadCompanyCountry', 'leadCompanyCity', 'leadCompanyAddress', 'leadCompanyTaxNumber',
      'leadCompanyStatus', 'leadFormContactId', 'leadFormContactName', 'leadFormContactEmail',
      'leadFormContactPhone', 'leadContactFirstName', 'leadContactLastName', 'leadContactJobTitle',
      'leadContactDepartment', 'leadContactMobile', 'leadContactDecisionRole', 'leadContactPrimary',
      'leadContactStatus'
    ].forEach(id => {
      const node = this.el(id);
      if (node) node.value = '';
    });

    const companyList = document.getElementById('leadCompanyPicker');
    const contactList = document.getElementById('leadContactPicker');
    if (companyList) companyList.innerHTML = '';
    if (contactList) contactList.innerHTML = '';
    const noContactsHint = document.getElementById('leadNoContactsHint');
    if (noContactsHint) noContactsHint.style.display = 'none';
  },
  resetLeadFormState() {
    this.resetLeadSelectionState({ clearCurrentLead: true });
  },
  resetForm() {
    if (!E.leadForm) return;
    E.leadForm.reset();
    if (E.leadFormLeadId) E.leadFormLeadId.value = '';
    if (E.leadFormCreatedAt) E.leadFormCreatedAt.value = '';
    if (E.leadFormUpdatedAt) E.leadFormUpdatedAt.value = '';
    this.resetLeadSelectionState({ clearCurrentLead: true });
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
    delete E.leadForm.dataset.convertAfterSave;
    if (E.leadFormTitle) E.leadFormTitle.textContent = isEdit ? 'Edit Lead' : 'Create Lead';
    this.resetForm();
    this.state.currentLead = row ? this.normalizeLead(row) : null;
    await this.loadLeadPickerOptions('');

    if (row) {
      if (E.leadFormLeadId) E.leadFormLeadId.value = row.lead_id || '';
      if (E.leadFormCreatedAt) E.leadFormCreatedAt.value = row.created_at ? U.formatDateTimeMMDDYYYYHHMM(row.created_at) : '';
      if (E.leadFormPhone) E.leadFormPhone.value = row.phone || '';
      if (E.leadFormEmail) E.leadFormEmail.value = row.email || '';
      if (E.leadFormCountry) E.leadFormCountry.value = row.country || '';
      if (E.leadFormLeadSource) E.leadFormLeadSource.value = row.lead_source || '';
      if (E.leadFormServiceInterest) E.leadFormServiceInterest.value = row.service_interest || '';
      if (E.leadFormStatus) E.leadFormStatus.value = this.normalizeLeadStatus(row.status);
      if (E.leadFormPriority) E.leadFormPriority.value = row.priority || '';
      if (E.leadFormEstimatedValue) E.leadFormEstimatedValue.value = row.estimated_value === '' ? '' : String(row.estimated_value);
      if (E.leadFormCurrency) E.leadFormCurrency.value = row.currency || '';
      if (E.leadFormAssignedTo) E.leadFormAssignedTo.value = row.assigned_to || '';
      const nextFollowUpInput = this.leadNextFollowUpInput();
      if (nextFollowUpInput) nextFollowUpInput.value = this.formatDateTimeLocalValue(this.pickNextFollowUpValue(row));
      if (E.leadFormLastContactDate) E.leadFormLastContactDate.value = String(row.last_contact || '').slice(0, 10);
      if (E.leadFormNotes) E.leadFormNotes.value = '';
      if (E.leadFormUpdatedAt) E.leadFormUpdatedAt.value = row.updated_at ? U.formatDateTimeMMDDYYYYHHMM(row.updated_at) : '';
      this.syncLeadFormDropdowns({
        lead_source: row.lead_source || '',
        service_interest: row.service_interest || '',
        status: this.normalizeLeadStatus(row.status),
        priority: row.priority || '',
        currency: row.currency || ''
      });
    } else {
      if (E.leadFormLeadId) E.leadFormLeadId.value = 'Auto-generated';
      if (E.leadFormCreatedAt) E.leadFormCreatedAt.value = U.formatDateTimeMMDDYYYYHHMM(new Date());
      if (E.leadFormAssignedTo) E.leadFormAssignedTo.value = this.currentUserAssignee();
      this.syncLeadFormDropdowns({ status: 'not contacted yet' });
      if (E.leadFormStatus) E.leadFormStatus.value = 'not contacted yet';
      if (E.leadFormNotes) E.leadFormNotes.value = '';
    }

    if (E.leadFormDeleteBtn) E.leadFormDeleteBtn.style.display = isEdit && this.canEditDelete() ? '' : 'none';
    if (E.leadFormSaveBtn) E.leadFormSaveBtn.disabled = false;
    E.leadFormModal.style.display = 'flex';
    E.leadFormModal.setAttribute('aria-hidden', 'false');
    window.ModalScrollLock?.lock?.() || document.body.classList.add('modal-open');
    if (window.setAppHashRoute && window.buildRecordHashRoute) setAppHashRoute(buildRecordHashRoute('leads', row || {}));
    if (row) {
      await this.hydrateLeadLinkedDetails(row);
      await this.refreshLeadNoteHistory(row);
    } else {
      this.renderLeadNoteHistory([]);
    }
  },
  async loadLeadNoteLogs(lead = {}) {
    const leadUuid = String(lead?.id || '').trim();
    const leadId = String(lead?.lead_id || lead?.leadId || '').trim();
    if (!leadUuid && !leadId) return [];
    let query = this.getClient().from('lead_note_logs').select('*').order('created_at', { ascending: false });
    if (leadUuid && leadId) {
      query = query.or(`lead_uuid.eq.${leadUuid},lead_id.eq.${leadId}`);
    } else if (leadUuid) {
      query = query.eq('lead_uuid', leadUuid);
    } else {
      query = query.eq('lead_id', leadId);
    }
    const { data, error } = await query;
    if (error) throw this.toSupabaseError('Unable to load lead note history', error);
    return Array.isArray(data) ? data : [];
  },
  renderLeadNoteHistory(logs = [], { loading = false, error = '', usersById = new Map() } = {}) {
    const host = document.getElementById('leadNotesHistoryList');
    if (!host) return;
    if (loading) {
      host.innerHTML = '<div class="muted">Loading note history…</div>';
      return;
    }
    if (error) {
      host.innerHTML = `<div class="muted" style="color:#ffb4b4;">${U.escapeHtml(error)}</div>`;
      return;
    }
    if (!Array.isArray(logs) || !logs.length) {
      host.innerHTML = '<div class="muted">No note history yet.</div>';
      return;
    }
    host.innerHTML = logs.map(log => {
      const user = this.getUserDisplayName(log.created_by, usersById);
      const canShowDebugUserId = Boolean(Session?.isAdmin?.());
      const userTitle = canShowDebugUserId && log?.created_by ? ` title="${U.escapeAttr(String(log.created_by))}"` : '';
      const previousNote = String(log.previous_note || log.old_note || '').trim() || '—';
      const newNote = String(log.new_note || log.note || '').trim() || '—';
      return `<article class="card" style="padding:10px;margin:8px 0;background:rgba(255,255,255,0.03);">
        <div class="muted" style="font-size:12px;display:flex;gap:10px;flex-wrap:wrap;">
          <span>${U.escapeHtml(this.formatNoteLogDate(log.created_at))}</span><span${userTitle}>User: ${U.escapeHtml(user)}</span>
        </div>
        <div style="margin-top:8px;"><strong>Previous note</strong><div>${U.escapeHtml(previousNote)}</div></div>
        <div style="margin-top:8px;"><strong>New note</strong><div>${U.escapeHtml(newNote)}</div></div>
      </article>`;
    }).join('');
  },
  async refreshLeadNoteHistory(row = {}) {
    if (!row?.id && !row?.lead_id) {
      this.renderLeadNoteHistory([]);
      return;
    }
    this.renderLeadNoteHistory([], { loading: true });
    try {
      const logs = await this.loadLeadNoteLogs(row);
      const usersById = await this.loadLeadNoteUsersById(logs);
      this.renderLeadNoteHistory(logs, { usersById });
    } catch (error) {
      console.error('[leads] note history load failed', error);
      this.renderLeadNoteHistory([], { error: 'Unable to load note history.' });
    }
  },
  closeForm() {
    if (!E.leadFormModal) return;
    E.leadFormModal.style.display = 'none';
    E.leadFormModal.setAttribute('aria-hidden', 'true');
    window.ModalScrollLock?.unlock?.() || document.body.classList.remove('modal-open');
    this.resetLeadSelectionState({ clearCurrentLead: true });
    if (window.setAppHashRoute) setAppHashRoute('#crm?tab=leads');
  },
  validateLeadNewNote(lead = {}, mode = 'create') {
    const newNote = String(lead.notes || '').trim();
    if (newNote) return true;
    UI.toast(mode === 'edit' ? 'New note is required for every lead edit.' : 'New note is required.');
    if (E.leadFormNotes) E.leadFormNotes.focus();
    return false;
  },
  collectFormData() {
    const estimatedValueRaw = String(E.leadFormEstimatedValue?.value || '').trim();
    const selectedCompany = this.getCurrentLeadCompanySync();
    const selectedContact = this.getCurrentLeadContactSync();
    const companyUuid = this.cleanUuidOrUndefined(selectedCompany.id ?? selectedCompany.company_uuid ?? selectedCompany.companyUuid ?? selectedCompany.company_id);
    const contactUuid = this.cleanUuidOrUndefined(selectedContact.id ?? selectedContact.contact_uuid ?? selectedContact.contactUuid ?? selectedContact.contact_id);
    const companyId = companyUuid || '';
    const contactId = contactUuid || '';
    const contactName = String(U.buildContactDisplayName(selectedContact) || E.leadFormContactName?.value || '').trim();
    const customerName = U.getCustomerLegalName(selectedCompany, {}) || String(E.leadFormCompanyName?.value || '').trim();
    const contactEmail = String(selectedContact.email || '').trim();
    const contactPhone = String(selectedContact.phone || selectedContact.mobile || '').trim();
    const nextFollowUpValue = String(this.leadNextFollowUpInput()?.value || '').trim();
    const nextFollowUpIso = this.dateTimeLocalToIso(nextFollowUpValue);
    return {
      lead_id: String(E.leadFormLeadId?.value || '').trim() === 'Auto-generated' ? '' : String(E.leadFormLeadId?.value || '').trim(),
      full_name: contactName,
      company_id: companyId,
      company_uuid: companyUuid,
      company_name: String(selectedCompany.legal_name || selectedCompany.company_name || selectedCompany.name || E.leadFormCompanyName?.value || '').trim(),
      customer_name: customerName,
      customer_legal_name: customerName,
      customer_address: String(selectedCompany.address || '').trim(),
      contact_id: contactId,
      contact_uuid: contactUuid,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      phone: contactPhone,
      email: contactEmail,
      country: String(selectedCompany.country || '').trim(),
      lead_source: String(E.leadFormLeadSource?.value || '').trim(),
      service_interest: String(E.leadFormServiceInterest?.value || '').trim(),
      status: this.normalizeLeadStatus(E.leadFormStatus?.value || ''),
      priority: String(E.leadFormPriority?.value || '').trim(),
      estimated_value: estimatedValueRaw === '' ? '' : Number(estimatedValueRaw),
      currency: String(E.leadFormCurrency?.value || '').trim(),
      assigned_to: String(E.leadFormAssignedTo?.value || '').trim(),
      next_follow_up: nextFollowUpIso,
      next_follow_up_at: nextFollowUpIso,
      last_contact: String(E.leadFormLastContactDate?.value || '').trim(),
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
      status: this.normalizeLeadStatus(lead.status),
      priority: String(lead.priority || '').trim(),
      estimated_value: String(lead.estimated_value ?? '').trim(),
      currency: String(lead.currency || '').trim(),
      assigned_to: String(lead.assigned_to || '').trim(),
      next_follow_up: this.normalizeComparableLeadDate(this.pickNextFollowUpValue(lead)),
      last_contact: this.normalizeComparableLeadDate(lead.last_contact),
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
    const mode = E.leadForm?.dataset.mode === 'edit' ? 'edit' : 'create';
    if (mode === 'edit' && !Permissions.canUpdateLead()) {
      UI.toast('You do not have permission to update leads.');
      return;
    }
    if (mode !== 'edit' && !Permissions.canCreateLead()) {
      UI.toast('You do not have permission to create leads.');
      return;
    }
    const leadId = String(E.leadForm?.dataset.id || '').trim();
    const selectedCompanyId = String(E.leadFormCompanyId?.value || '').trim();
    const selectedContactId = String(E.leadFormContactId?.value || '').trim();
    let loadedSelection;
    try {
      loadedSelection = await window.CrmCompanyContactSelectors.validateCompanyContactSelection({ companyId: selectedCompanyId, contactId: selectedContactId, moduleName: 'lead' });
    } catch (error) {
      UI.toast(error?.message || 'Selected company data mismatch. Please reselect the company.');
      return;
    }
    this.hydrateLeadFromCompany(this.normalizeCompany(loadedSelection.loadedCompany));
    let lead = this.collectFormData();
    lead = window.CrmCompanyContactSelectors.applyLoadedCompanySnapshot(lead, loadedSelection.loadedCompany, loadedSelection.loadedContact);
    console.log('[SAVE CHECK] final payload:', lead);
    if (!this.validateLeadWorkflow(lead)) return;
    if (!this.validateLeadNewNote(lead, mode)) return;
    if (!this.isUuid(lead.company_id)) {
      UI.toast('Please select a company from the list before saving.');
      E.leadFormCompanyName?.focus?.();
      return;
    }
    if (!this.isUuid(lead.contact_id)) {
      UI.toast('Please select a contact from the list before saving.');
      E.leadFormContactName?.focus?.();
      return;
    }
    if (mode === 'edit' && !this.isUuid(leadId)) {
      UI.toast('Lead database ID is missing. Please refresh and reopen the lead.');
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
        await this.refreshLeadNoteHistory(resolvedRow);
        if (E.leadForm?.dataset.convertAfterSave === 'true') {
          delete E.leadForm.dataset.convertAfterSave;
          await this.convertLeadById(leadId, { skipNoteGate: true });
        }
      } else {
        const tempLeadId = this.generateLeadId();
        if (E.leadFormLeadId) E.leadFormLeadId.value = tempLeadId;
        const created = await this.createLead(lead);
        const createdId = String(created?.id || created?.row?.id || created?.data?.id || '').trim();
        const savedLead = createdId ? await this.getLead(createdId) : created;
        this.upsertLocalRow(savedLead);
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
  getRecordUuid(record = {}, type = 'company') {
    const uuidKey = type === 'contact' ? 'contact_uuid' : 'company_uuid';
    const uuidCamel = type === 'contact' ? 'contactUuid' : 'companyUuid';
    const idKey = type === 'contact' ? 'contact_id' : 'company_id';
    const idCamel = type === 'contact' ? 'contactId' : 'companyId';
    return this.cleanUuidOrUndefined(record.id ?? record[uuidKey] ?? record[uuidCamel] ?? record[idKey] ?? record[idCamel]) || '';
  },
  getCompanyDisplayName(company = {}) {
    return String(company.legal_name || company.legalName || company.company_name || company.companyName || company.name || '').trim();
  },
  getContactDisplayName(contact = {}) {
    return String(U.buildContactDisplayName(contact) || contact.full_name || contact.fullName || [contact.first_name || contact.firstName, contact.last_name || contact.lastName].filter(Boolean).join(' ')).trim();
  },
  sameIdentifier(a, b) {
    const left = String(a || '').trim().toLowerCase();
    const right = String(b || '').trim().toLowerCase();
    return Boolean(left && right && left === right);
  },
  debugLeadSelection(label, details = {}, level = 'debug') {
    try {
      const host = String(window.location.hostname || '').toLowerCase();
      const isDev = Boolean(window.RUNTIME_CONFIG?.DEBUG_API || host === 'localhost' || host === '127.0.0.1');
      if (!isDev) return;
      const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug;
      logger(label, details);
    } catch {}
  },
  logInvalidLeadSelection(type, value) {
    this.debugLeadSelection('Lead form selection bug: dropdown value is not a company/contact UUID', { type, value }, 'error');
  },
  isSelectControl(node) {
    return Boolean(node && String(node.tagName || '').toUpperCase() === 'SELECT');
  },
  setControlValue(node, value = '') {
    if (!node) return;
    node.value = value || '';
  },
  setLeadCompanyControlValue(company = {}) {
    const node = E.leadFormCompanyName;
    const uuid = this.getRecordUuid(company, 'company');
    const label = this.getCompanyDisplayName(company);
    this.setControlValue(node, this.isSelectControl(node) ? uuid : label);
  },
  setLeadContactControlValue(contact = {}) {
    const node = E.leadFormContactName;
    const uuid = this.getRecordUuid(contact, 'contact');
    const label = this.getContactDisplayName(contact);
    this.setControlValue(node, this.isSelectControl(node) ? uuid : label);
  },
  dedupeLeadRows(rows = [], type = 'company') {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .filter(Boolean)
      .map(row => type === 'contact' ? this.normalizeContact(row) : this.normalizeCompany(row))
      .filter(row => {
        const uuid = this.getRecordUuid(row, type);
        if (!uuid || seen.has(uuid)) return false;
        seen.add(uuid);
        return true;
      });
  },
  ensureSelectedCompanyInOptions(companies = []) {
    const rows = Array.isArray(companies) ? [...companies] : [];
    const selected = this.state.selectedCompany;
    const selectedId = this.getRecordUuid(selected || {}, 'company');
    if (selectedId && !rows.some(c => this.sameIdentifier(this.getRecordUuid(c, 'company'), selectedId))) {
      rows.unshift(selected);
    }
    return this.dedupeLeadRows(rows, 'company');
  },
  ensureSelectedContactInOptions(contacts = []) {
    const rows = Array.isArray(contacts) ? [...contacts] : [];
    const selected = this.state.selectedContact;
    const selectedId = this.getRecordUuid(selected || {}, 'contact');
    if (selectedId && !rows.some(c => this.sameIdentifier(this.getRecordUuid(c, 'contact'), selectedId))) {
      rows.unshift(selected);
    }
    return this.dedupeLeadRows(rows, 'contact');
  },
  getCurrentLeadCompanySync() {
    const stateCompanyId = this.getRecordUuid(this.state.selectedCompany || {}, 'company');
    if (stateCompanyId) return this.state.selectedCompany;
    const fieldId = String(E.leadFormCompanyId?.value || E.leadFormCompanyName?.value || '').trim();
    if (!fieldId) return {};
    return (this.state.companyPickerRows || []).find(c => this.sameIdentifier(this.getRecordUuid(c, 'company'), fieldId)) || { id: this.cleanUuidOrUndefined(fieldId) || '' };
  },
  getCurrentLeadContactSync() {
    const stateContactId = this.getRecordUuid(this.state.selectedContact || {}, 'contact');
    if (stateContactId) return this.state.selectedContact;
    const fieldId = String(E.leadFormContactId?.value || E.leadFormContactName?.value || '').trim();
    if (!fieldId) return {};
    return (this.state.contactPickerRows || []).find(c => this.sameIdentifier(this.getRecordUuid(c, 'contact'), fieldId)) || { id: this.cleanUuidOrUndefined(fieldId) || '' };
  },
  applyLeadSelectionControlValues() {
    if (this.state.selectedCompany) this.hydrateLeadFromCompany(this.state.selectedCompany);
    else this.setLeadCompanyControlValue({});
    if (this.state.selectedContact) this.hydrateLeadFromContact(this.state.selectedContact);
    else this.setLeadContactControlValue({});
  },
  renderLeadCompanyOptions(companies = []) {
    const node = E.leadFormCompanyName;
    const rows = this.ensureSelectedCompanyInOptions(companies);
    const selectedId = this.getRecordUuid(this.state.selectedCompany || {}, 'company') || String(E.leadFormCompanyId?.value || '').trim();
    if (this.isSelectControl(node)) {
      node.removeAttribute('list');
      node.innerHTML = '<option value="">Select company…</option>' + rows.map(c => {
        const uuid = this.getRecordUuid(c, 'company');
        const name = this.getCompanyDisplayName(c) || uuid;
        return `<option value="${U.escapeAttr(uuid)}">${U.escapeHtml(name)}</option>`;
      }).join('');
      node.value = selectedId && rows.some(c => this.sameIdentifier(this.getRecordUuid(c, 'company'), selectedId)) ? selectedId : '';
      if (E.leadFormCompanyId) E.leadFormCompanyId.value = node.value || '';
      return;
    }
    if (node) node.setAttribute('list', 'leadCompanyPicker');
    const companyList = document.getElementById('leadCompanyPicker');
    if (companyList) companyList.innerHTML = rows.map(c => {
      const uuid = this.getRecordUuid(c, 'company');
      const name = this.getCompanyDisplayName(c);
      return `<option value="${U.escapeAttr(uuid)}" label="${U.escapeAttr(name)}" data-company-id="${U.escapeAttr(uuid)}"></option>`;
    }).join('');
  },
  renderLeadContactOptions(contacts = []) {
    const node = E.leadFormContactName;
    const rows = this.ensureSelectedContactInOptions(contacts);
    const selectedId = this.getRecordUuid(this.state.selectedContact || {}, 'contact') || String(E.leadFormContactId?.value || '').trim();
    if (this.isSelectControl(node)) {
      node.removeAttribute('list');
      node.innerHTML = '<option value="">Select contact…</option>' + rows.map(c => {
        const uuid = this.getRecordUuid(c, 'contact');
        const name = this.getContactDisplayName(c) || uuid;
        const secondary = String(c.email || c.phone || c.contact_position || c.contact_ref || '').trim();
        const label = [name, secondary].filter(Boolean).join(' — ');
        return `<option value="${U.escapeAttr(uuid)}">${U.escapeHtml(label)}</option>`;
      }).join('');
      node.value = selectedId && rows.some(c => this.sameIdentifier(this.getRecordUuid(c, 'contact'), selectedId)) ? selectedId : '';
      if (E.leadFormContactId) E.leadFormContactId.value = node.value || '';
      return;
    }
    if (node) node.setAttribute('list', 'leadContactPicker');
    const contactList = document.getElementById('leadContactPicker');
    if (contactList) contactList.innerHTML = rows.map(c => {
      const uuid = this.getRecordUuid(c, 'contact');
      const name = this.getContactDisplayName(c);
      const secondary = String(c.email || c.phone || c.contact_position || c.contact_ref || '').trim();
      const label = [name, secondary].filter(Boolean).join(' — ');
      return `<option value="${U.escapeAttr(uuid)}" label="${U.escapeAttr(label)}" data-contact-id="${U.escapeAttr(uuid)}" data-company-id="${U.escapeAttr(c.company_id || c.company_uuid || '')}"></option>`;
    }).join('');
  },
  async loadLeadPickerOptions(companyId = '', searchText = '') {
    const requestId = (this._leadPickerLoadRequestId || 0) + 1;
    this._leadPickerLoadRequestId = requestId;
    const normalizedCompanyId = this.cleanUuidOrUndefined(companyId) || this.getRecordUuid(this.state.selectedCompany || {}, 'company') || '';
    const rowsFrom = res => Array.isArray(res?.rows) ? res.rows : (Array.isArray(res?.items) ? res.items : (Array.isArray(res?.data) ? res.data : []));
    let companies = [];
    try {
      const companyRows = await window.CrmCompanyContactSelectors?.loadCompanyOptions?.(searchText || '', normalizedCompanyId);
      if (!companyRows) throw new Error('Shared company option loader is unavailable.');
      companies = companyRows
        .map(c => this.normalizeCompany(c))
        .filter(c => this.getRecordUuid(c, 'company'));
    } catch (error) {
      console.error('[leads] fresh company picker query failed', error);
      const companyControl = E.leadFormCompanyName;
      if (this.isSelectControl(companyControl)) companyControl.innerHTML = '<option value="">Unable to load companies — retry</option>';
      UI?.toast?.('Unable to load companies. Please retry.', 'error');
    }

    // Newly created companies may not be present in the cached/list endpoint yet.
    // Keep the already-resolved selected company in the options so the required select remains valid.
    if (this.state.selectedCompany) companies.unshift(this.state.selectedCompany);
    if (normalizedCompanyId && !companies.some(c => this.sameIdentifier(this.getRecordUuid(c, 'company'), normalizedCompanyId))) {
      try {
        const fetchedCompany = await this.getFullCompanyRecord(normalizedCompanyId);
        if (fetchedCompany) companies.unshift(fetchedCompany);
      } catch (error) {
        console.warn('[leads] selected company injection lookup failed', error);
      }
    }
    companies = this.dedupeLeadRows(companies, 'company');

    let contacts = [];
    if (normalizedCompanyId) {
      const selectedCompany = companies.find(c => this.sameIdentifier(this.getRecordUuid(c, 'company'), normalizedCompanyId)) || this.state.selectedCompany || {};
      if (selectedCompany && this.getRecordUuid(selectedCompany, 'company') && !this.state.selectedCompany) {
        this.state.selectedCompany = selectedCompany;
      }
      try {
        const contactRows = await window.CrmCompanyContactSelectors?.loadContactsForCompany?.(normalizedCompanyId);
        if (!contactRows) throw new Error('Shared contact loader is unavailable.');
        contacts = contactRows.map(c => this.normalizeContact(c));
      } catch (error) {
        console.error('[leads] contact lookup by company UUID failed', error);
        contacts = [];
      }
    }

    // Company-scoped RPC rows are the only contacts rendered by the picker.
    contacts = this.dedupeLeadRows(contacts, 'contact');

    // Ignore an older async response after the user has selected a different company.
    if (requestId !== this._leadPickerLoadRequestId) return;

    this.state.companyPickerRows = companies;
    this.state.contactPickerRows = contacts;
    this.renderLeadCompanyOptions(companies);
    this.renderLeadContactOptions(contacts);

    // Re-apply the selected values after async option rendering; this prevents "Select company…" after prefill.
    if (this.state.selectedCompany) this.hydrateLeadFromCompany(this.state.selectedCompany);
    if (this.state.selectedContact) this.hydrateLeadFromContact(this.state.selectedContact);

    const noContactsHint = document.getElementById('leadNoContactsHint');
    if (noContactsHint) {
      noContactsHint.style.display = normalizedCompanyId && contacts.length === 0 ? '' : 'none';
      noContactsHint.textContent = 'No contacts found for this company.';
    }
  },
  hydrateLeadFromCompany(company = {}) {
    const c = this.normalizeCompany(company);
    const uuid = this.getRecordUuid(c, 'company');
    this.state.selectedCompany = uuid ? c : null;

    const set = (id, value) => {
      const node = this.el(id);
      if (node) node.value = value || '';
    };

    set('leadFormCompanyId', uuid);
    this.setLeadCompanyControlValue(uuid ? c : {});
    set('leadCompanyLegalName', uuid ? c.legal_name : '');
    set('leadCompanyType', uuid ? (window.Companies?.formatCompanyType?.(c.company_type) || c.company_type) : '');
    set('leadCompanyIndustry', uuid ? (window.Companies?.formatCompanyIndustry?.(c.industry) || c.industry) : '');
    set('leadCompanyWebsite', uuid ? c.website : '');
    set('leadCompanyMainEmail', uuid ? c.main_email : '');
    set('leadCompanyMainPhone', uuid ? c.main_phone : '');
    set('leadCompanyCountry', uuid ? c.country : '');
    set('leadCompanyCity', uuid ? c.city : '');
    set('leadCompanyAddress', uuid ? c.address : '');
    set('leadCompanyTaxNumber', uuid ? c.tax_number : '');
    set('leadCompanyStatus', uuid ? c.company_status : '');
  },
  hydrateLeadFromContact(contact = {}) {
    const c = this.normalizeContact(contact);
    const uuid = this.getRecordUuid(c, 'contact');
    this.state.selectedContact = uuid ? c : null;

    const set = (id, value) => {
      const node = this.el(id);
      if (node) node.value = value || '';
    };

    set('leadFormContactId', uuid);
    this.setLeadContactControlValue(uuid ? c : {});
    set('leadFormContactEmail', uuid ? c.email : '');
    set('leadFormContactPhone', uuid ? (c.phone || c.mobile) : '');
    set('leadContactFirstName', uuid ? c.first_name : '');
    set('leadContactLastName', uuid ? c.last_name : '');
    set('leadContactJobTitle', uuid ? c.job_title : '');
    set('leadContactDepartment', uuid ? c.department : '');
    set('leadContactMobile', uuid ? c.mobile : '');
    set('leadContactDecisionRole', uuid ? c.decision_role : '');
    set('leadContactPrimary', uuid ? (c.is_primary_contact ? 'Yes' : 'No') : '');
    set('leadContactStatus', uuid ? c.contact_status : '');
  },
  async getFullCompanyRecord(companyIdOrRecord) {
    if (!companyIdOrRecord) return null;
    if (typeof companyIdOrRecord === 'object') {
      const normalized = this.normalizeCompany(companyIdOrRecord);
      if (this.getRecordUuid(normalized, 'company')) return normalized;
    }
    const id = String(companyIdOrRecord || '').trim();
    if (!id) return null;

    const localExact = (this.state.companyPickerRows || [])
      .map(c => this.normalizeCompany(c))
      .find(c => this.sameIdentifier(this.getRecordUuid(c, 'company'), id) || this.sameIdentifier(c.company_id, id));
    if (localExact) return localExact;

    const rowsFrom = res => Array.isArray(res?.rows) ? res.rows : (Array.isArray(res?.items) ? res.items : (Array.isArray(res?.data) ? res.data : []));
    const safelyLoaded = await window.CrmCompanyContactSelectors?.loadCompanySafe?.(id);
    if (safelyLoaded) return this.normalizeCompany(safelyLoaded);
    if (this.isUuid(id)) {
      try {
        const client = this.getClient?.();
        if (client?.from) {
          const { data, error } = await client.from('companies').select('*').eq('id', id).maybeSingle();
          if (!error && data) return this.normalizeCompany(data);
        }
      } catch (error) {
        console.warn('[leads] direct company lookup failed', error);
      }
    }

    const filtersToTry = this.isUuid(id) ? [{ id }, { company_uuid: id }] : [{ company_id: id }];
    for (const filters of filtersToTry) {
      try {
        const res = await Api.requestWithSession('companies', 'list', { page: 1, limit: 50, filters }, { requireAuth: true });
        const row = rowsFrom(res).map(c => this.normalizeCompany(c)).find(c => (
          this.sameIdentifier(this.getRecordUuid(c, 'company'), id)
          || this.sameIdentifier(c.company_id, id)
        ));
        if (row) return row;
      } catch (error) {
        console.warn('[leads] company lookup failed', filters, error);
      }
    }
    return null;
  },
  async getFullContactRecord(contactIdOrRecord) {
    if (!contactIdOrRecord) return null;
    if (typeof contactIdOrRecord === 'object') {
      const normalized = this.normalizeContact(contactIdOrRecord);
      if (this.getRecordUuid(normalized, 'contact')) return normalized;
    }
    const id = String(contactIdOrRecord || '').trim();
    if (!id) return null;

    const localExact = (this.state.contactPickerRows || [])
      .map(c => this.normalizeContact(c))
      .find(c => this.sameIdentifier(this.getRecordUuid(c, 'contact'), id) || this.sameIdentifier(c.contact_id, id));
    if (localExact) return localExact;

    const safelyLoaded = await window.CrmCompanyContactSelectors?.loadContactByUuid?.(id);
    return safelyLoaded ? this.normalizeContact(safelyLoaded) : null;
  },
  async fetchFullCompany(companyId = '') { return this.getFullCompanyRecord(companyId); },
  async fetchFullContact(contactId = '') { return this.getFullContactRecord(contactId); },
  resolveUniqueCompanyByName(name = '') {
    const value = String(name || '').trim();
    if (!value) return null;
    const matches = (this.state.companyPickerRows || []).filter(c =>
      this.sameIdentifier(this.getCompanyDisplayName(c), value)
      || this.sameIdentifier(c.company_name, value)
      || this.sameIdentifier(c.legal_name, value)
    );
    return matches.length === 1 ? matches[0] : null;
  },
  resolveUniqueContactByName(name = '') {
    const value = String(name || '').trim();
    if (!value) return null;
    const matches = (this.state.contactPickerRows || []).filter(c => this.sameIdentifier(this.getContactDisplayName(c), value));
    return matches.length === 1 ? matches[0] : null;
  },
  async hydrateLeadLinkedDetails(lead = {}) {
    this.resetLeadSelectionState();
    await this.loadLeadPickerOptions('');

    const companyId = this.cleanUuidOrUndefined(lead.company_id || lead.companyId || lead.company_uuid || lead.companyUuid) || '';
    const companyName = String(lead.company_name || lead.companyName || '').trim();
    let linkedCompany = companyId ? await this.getFullCompanyRecord(companyId) : null;
    if (!linkedCompany && !companyId && companyName) linkedCompany = this.resolveUniqueCompanyByName(companyName);
    if (linkedCompany) {
      this.hydrateLeadFromCompany(linkedCompany);
      await this.loadLeadPickerOptions(this.getRecordUuid(linkedCompany, 'company'));
      this.hydrateLeadFromCompany(linkedCompany);
    } else {
      this.hydrateLeadFromCompany({});
      await this.loadLeadPickerOptions('');
    }

    const contactId = this.cleanUuidOrUndefined(lead.contact_id || lead.contactId || lead.contact_uuid || lead.contactUuid) || '';
    const contactName = String(lead.contact_name || lead.contactName || lead.full_name || lead.fullName || '').trim();
    let linkedContact = contactId
      ? (this.state.contactPickerRows || []).find(row => this.sameIdentifier(this.getRecordUuid(row, 'contact'), contactId)) || null
      : null;
    if (!linkedContact && !contactId && contactName) linkedContact = this.resolveUniqueContactByName(contactName);
    this.hydrateLeadFromContact(linkedContact || {});
  },
  findCompanyForInput(inputValue = '') {
    const selectedCompanyId = String(inputValue || '').trim();
    if (!selectedCompanyId) return null;
    if (!this.isUuid(selectedCompanyId)) {
      this.logInvalidLeadSelection('company', selectedCompanyId);
      return null;
    }
    return (this.state.companyPickerRows || []).find(c => String(this.getRecordUuid(c, 'company')) === String(selectedCompanyId)) || null;
  },
  findContactForInput(inputValue = '') {
    const selectedContactId = String(inputValue || '').trim();
    if (!selectedContactId) return null;
    if (!this.isUuid(selectedContactId)) {
      this.logInvalidLeadSelection('contact', selectedContactId);
      return null;
    }
    return (this.state.contactPickerRows || []).find(c => String(this.getRecordUuid(c, 'contact')) === String(selectedContactId)) || null;
  },
  clearLeadContactSelection() {
    this.state.selectedContact = null;
    this.hydrateLeadFromContact({});
  },
  handleLeadCompanyInput(event) {
    if (this.isSelectControl(event?.target)) return;
    const value = String(event?.target?.value || '').trim();
    const selectedName = this.getCompanyDisplayName(this.state.selectedCompany || {});
    const selectedId = this.getRecordUuid(this.state.selectedCompany || {}, 'company');
    if (selectedId && value !== selectedName && value !== selectedId) {
      this.clearLeadContactSelection();
      this.hydrateLeadFromCompany({});
      if (E.leadFormCompanyName) E.leadFormCompanyName.value = value;
      this.state.contactPickerRows = [];
      const contactList = document.getElementById('leadContactPicker');
      if (contactList) contactList.innerHTML = '';
    }
  },
  handleLeadContactInput(event) {
    if (this.isSelectControl(event?.target)) return;
    const value = String(event?.target?.value || '').trim();
    const selectedName = this.getContactDisplayName(this.state.selectedContact || {});
    const selectedId = this.getRecordUuid(this.state.selectedContact || {}, 'contact');
    if (selectedId && value !== selectedName && value !== selectedId) {
      this.clearLeadContactSelection();
      if (E.leadFormContactName) E.leadFormContactName.value = value;
    }
  },
  async handleLeadCompanyChange(event) {
    const selectedCompanyId = String(event?.target?.value || E.leadFormCompanyId?.value || '').trim();
    console.log('[Company changed] selectedCompanyId:', selectedCompanyId);
    console.log('[Company changed] clearing contact');
    const availableCompanies = [...(this.state.companyPickerRows || [])];
    this.resetLeadSelectionState();
    this.state.companyPickerRows = availableCompanies;
    this.state.contactPickerRows = [];
    this.renderLeadContactOptions([]);
    if (E.leadFormCompanyName) E.leadFormCompanyName.value = selectedCompanyId;
    if (!selectedCompanyId) {
      this.hydrateLeadFromCompany({});
      await this.loadLeadPickerOptions('');
      this.debugLeadSelection('[leads] company changed', { selectedDropdownValue: '', resolvedCompanyId: '', resolvedCompanyName: '' });
      return;
    }
    const selectedCompany = this.findCompanyForInput(selectedCompanyId);
    if (!selectedCompany) {
      this.hydrateLeadFromCompany({});
      await this.loadLeadPickerOptions('');
      this.debugLeadSelection('[leads] company changed', { selectedDropdownValue: selectedCompanyId, resolvedCompanyId: '', resolvedCompanyName: '' });
      return;
    }
    const fullCompany = await this.fetchFullCompany(this.getRecordUuid(selectedCompany, 'company')) || selectedCompany;
    this.hydrateLeadFromCompany(fullCompany);
    const resolvedCompanyId = this.getRecordUuid(this.state.selectedCompany || fullCompany, 'company');
    await this.loadLeadPickerOptions(resolvedCompanyId);
    console.log('[Contacts loaded]', this.state.contactPickerRows || []);
    this.debugLeadSelection('[leads] company changed', {
      selectedDropdownValue: selectedCompanyId,
      resolvedCompanyId,
      resolvedCompanyName: this.getCompanyDisplayName(this.state.selectedCompany || fullCompany)
    });
  },
  async handleLeadContactChange(event) {
    const selectedContactId = String(event?.target?.value || E.leadFormContactId?.value || '').trim();
    if (!selectedContactId) {
      this.clearLeadContactSelection();
      this.debugLeadSelection('[leads] contact changed', { selectedDropdownValue: '', resolvedContactId: '', resolvedContactName: '', contactCompanyId: '', selectedCompanyId: this.getRecordUuid(this.state.selectedCompany || {}, 'company') });
      return;
    }
    const selectedContact = this.findContactForInput(selectedContactId);
    if (!selectedContact) {
      this.clearLeadContactSelection();
      this.debugLeadSelection('[leads] contact changed', { selectedDropdownValue: selectedContactId, resolvedContactId: '', resolvedContactName: '', contactCompanyId: '', selectedCompanyId: this.getRecordUuid(this.state.selectedCompany || {}, 'company') });
      return;
    }
    const fullContact = await this.fetchFullContact(this.getRecordUuid(selectedContact, 'contact')) || selectedContact;
    const selectedCompanyId = this.getRecordUuid(this.state.selectedCompany || {}, 'company');
    const contactCompanyId = String(fullContact.selected_company_uuid || fullContact.company_uuid || fullContact.company_id || '').trim();
    // This contact came from the company-scoped picker RPC, so do not reject it using legacy contact company fields.
    this.hydrateLeadFromContact(fullContact);
    this.debugLeadSelection('[leads] contact changed', {
      selectedDropdownValue: selectedContactId,
      resolvedContactId: this.getRecordUuid(this.state.selectedContact || fullContact, 'contact'),
      resolvedContactName: this.getContactDisplayName(this.state.selectedContact || fullContact),
      contactCompanyId,
      selectedCompanyId
    });
  },
  lockCompanyContactDisplayFields() {
    [E.leadFormContactEmail, E.leadFormContactPhone].forEach(el => {
      if (el) {
        el.readOnly = true;
        el.classList.add('readonly');
      }
    });
  },
  getFirstArrayValue(value) {
    if (Array.isArray(value)) return String(value[0] || '').trim();
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.startsWith('{') && text.endsWith('}')) return text.slice(1, -1).split(',').map(v => v.replace(/^"|"$/g, '').trim()).filter(Boolean)[0] || '';
    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return String(parsed[0] || '').trim();
      } catch {}
    }
    return text.split(',').map(v => v.trim()).filter(Boolean)[0] || text;
  },
  async resolveCompanyForLeadPrefill(companySeed = {}, contactSeed = {}, fullContact = null) {
    const normalizedCompanySeed = companySeed && Object.keys(companySeed || {}).length ? this.normalizeCompany(companySeed) : null;
    if (normalizedCompanySeed && this.getRecordUuid(normalizedCompanySeed, 'company')) return normalizedCompanySeed;

    const contact = fullContact ? this.normalizeContact(fullContact) : this.normalizeContact(contactSeed || {});
    const candidates = [];
    const push = value => {
      const text = String(value || '').trim();
      if (text && !candidates.some(item => this.sameIdentifier(item, text))) candidates.push(text);
    };

    push(companySeed?.id);
    push(companySeed?.company_uuid || companySeed?.companyUuid);
    push(companySeed?.company_id || companySeed?.companyId);
    push(this.getFirstArrayValue(companySeed?.company_ids || companySeed?.companyIds));

    push(contact.company_uuid || contact.companyUuid);
    push(contact.company_id || contact.companyId);
    push(this.getFirstArrayValue(contact.company_ids || contact.companyIds));

    for (const candidate of candidates) {
      const resolved = await this.getFullCompanyRecord(candidate);
      if (resolved && this.getRecordUuid(resolved, 'company')) return resolved;
    }

    const names = [];
    const pushName = value => {
      const text = String(value || '').trim();
      if (text && !names.some(item => this.sameIdentifier(item, text))) names.push(text);
    };
    pushName(companySeed?.legal_name || companySeed?.legalName);
    pushName(companySeed?.company_name || companySeed?.companyName || companySeed?.name);
    pushName(contact.company_name || contact.companyName);
    pushName(this.getFirstArrayValue(contact.company_names || contact.companyNames));

    for (const name of names) {
      const resolved = this.resolveUniqueCompanyByName(name);
      if (resolved && this.getRecordUuid(resolved, 'company')) return resolved;
    }

    return null;
  },
  async openLeadCreateFormWithPrefill(prefill = {}) {
    await this.openForm(null);

    const explicitCompanySeed = prefill.company || null;
    const contactSeed = prefill.contact || prefill;

    let contact = null;
    const contactId = this.getRecordUuid(contactSeed, 'contact') || this.cleanUuidOrUndefined(contactSeed?.id || contactSeed?.contact_uuid || contactSeed?.contactUuid) || '';
    if (contactId) contact = await this.getFullContactRecord(contactId);
    if (!contact && prefill.contact) contact = this.normalizeContact(prefill.contact);

    let company = await this.resolveCompanyForLeadPrefill(explicitCompanySeed || {}, contactSeed || {}, contact);

    if (company) {
      this.hydrateLeadFromCompany(company);
      await this.loadLeadPickerOptions(this.getRecordUuid(company, 'company'));
      this.hydrateLeadFromCompany(company);
    } else {
      await this.loadLeadPickerOptions('');
      this.hydrateLeadFromCompany({});
    }

    if (contact) {
      // If the contact gave us a company but the first resolution failed, try once more after the full contact is loaded.
      if (!company) {
        company = await this.resolveCompanyForLeadPrefill({}, contact, contact);
        if (company) {
          this.hydrateLeadFromCompany(company);
          await this.loadLeadPickerOptions(this.getRecordUuid(company, 'company'));
          this.hydrateLeadFromCompany(company);
        }
      }

      const contactUuid = this.getRecordUuid(contact, 'contact');
      const pickerContact = (this.state.contactPickerRows || []).find(row => this.sameIdentifier(this.getRecordUuid(row, 'contact'), contactUuid)) || null;
      if (pickerContact) {
        this.hydrateLeadFromContact(pickerContact);
      } else {
        this.hydrateLeadFromContact({});
        UI?.toast?.('The selected contact is not available for the resolved company. Please select the company/contact manually.', 'warning');
      }
    } else {
      this.hydrateLeadFromContact({});
    }

    this.applyLeadSelectionControlValues();
    this.lockCompanyContactDisplayFields();
  },
  async deleteLeadById(leadUuid) {
    if (!this.canEditDelete()) {
      UI.toast('You do not have permission to delete leads.');
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
  async convertLeadById(leadUuid, { skipNoteGate = false } = {}) {
    if (!this.hasLeadConversionPermission()) {
      UI.toast('You do not have permission to convert leads.');
      return;
    }
    const row = this.state.rows.find(item => item.id === leadUuid);
    if (!skipNoteGate) {
      if (row) {
        await this.openForm(row);
        if (E.leadForm) E.leadForm.dataset.convertAfterSave = 'true';
      }
      UI.toast('New note is required before converting this lead.');
      if (E.leadFormNotes) E.leadFormNotes.focus();
      return;
    }
    if (this.normalizeLeadStatus(row?.status) !== 'qualified') {
      UI.toast('Lead must be qualified before converting to deal.');
      return;
    }
    if (!this.pickNextFollowUpValue(row)) {
      UI.toast('Next follow-up is required before converting this lead to deal.');
      return;
    }
    if (!this.canConvertLead(row)) {
      UI.toast('This lead is already converted or unavailable.');
      return;
    }
    this.setFormBusy(true);
    try {
      const sourceLead = this.normalizeLead(await this.getLead(leadUuid));
      if (sourceLead.status !== 'qualified') {
        UI.toast('Lead must be qualified before converting to deal.');
        return;
      }
      if (!this.pickNextFollowUpValue(sourceLead)) {
        UI.toast('Next follow-up is required before converting this lead to deal.');
        return;
      }
      if (!String(sourceLead.lead_id || '').trim()) {
        UI.toast('Unable to convert lead: missing business Lead ID.');
        return;
      }
      console.log('[deal conversion] source lead', sourceLead);
      console.log('[deal conversion] existing deal check lead uuid', sourceLead.id);
      console.log('[deal conversion] business lead code', sourceLead.lead_id);
      const existingDeal = await this.findDealByLeadUuid(sourceLead.id);
      const fullCompany = sourceLead.company_id ? await this.getFullCompanyRecord(sourceLead.company_id) : null;
      const selectedContact = await this.loadLeadContactForDealConversion(sourceLead);
      const payload = this.sanitizeDealCreatePayloadForConversion(this.buildDealFromLead(sourceLead, fullCompany || {}, selectedContact));
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
        deal_id: normalizedSavedDeal.deal_id || payload.deal_id || sourceLead.deal_id,
        converted_to_deal_id: this.isUuid(normalizedSavedDeal.id) ? normalizedSavedDeal.id : sourceLead.converted_to_deal_id,
        converted_deal_uuid: this.isUuid(normalizedSavedDeal.id) ? normalizedSavedDeal.id : sourceLead.converted_deal_uuid
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
    bindState(E.leadsStartDateFilter, 'createdFrom');
    bindState(E.leadsEndDateFilter, 'createdTo');

    if (E.leadsResetBtn) {
      E.leadsResetBtn.addEventListener('click', () => {
        this.state.search = '';
        this.state.status = 'All';
        this.state.serviceInterest = 'All';
        this.state.assignedTo = 'All';
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
    document.querySelectorAll('[data-leads-export-proxy]').forEach(button => {
      button.addEventListener('click', () => this.exportLeadsCsv());
    });

    if (E.leadsTbody) {
      E.leadsTbody.addEventListener('click', event => {
        const editId = event.target?.closest?.('[data-lead-edit]')?.getAttribute('data-lead-edit');
        if (editId) {
          const row = this.findLeadById(editId);
          if (row) this.openForm(row);
          return;
        }
        const deleteId = event.target?.closest?.('[data-lead-delete]')?.getAttribute('data-lead-delete');
        if (deleteId) {
          this.deleteLeadById(deleteId);
          return;
        }
        const convertId = event.target?.closest?.('[data-lead-convert]')?.getAttribute('data-lead-convert');
        if (convertId) {
          this.convertLeadById(convertId);
          return;
        }
        if (event.target?.closest?.('.lead-actions-menu')) return;
        const row = event.target?.closest?.('tr[data-lead-row]');
        const id = row?.getAttribute('data-lead-row');
        if (id) this.openDetails(id);
      });
      E.leadsTbody.addEventListener('keydown', event => {
        if (!['Enter', ' '].includes(event.key)) return;
        if (event.target?.closest?.('.lead-actions-menu')) return;
        const row = event.target?.closest?.('tr[data-lead-row]');
        const id = row?.getAttribute('data-lead-row');
        if (!id) return;
        event.preventDefault();
        this.openDetails(id);
      });
    }
    document.getElementById('leadDetailsDrawer')?.addEventListener('click', event => {
      if (event.target.closest('[data-lead-close-details]')) {
        this.closeDetails();
        return;
      }
      const editId = event.target.closest('[data-lead-details-edit]')?.getAttribute('data-lead-details-edit');
      if (editId) {
        const row = this.findLeadById(editId);
        this.closeDetails();
        if (row) this.openForm(row);
        return;
      }
      const deleteId = event.target.closest('[data-lead-details-delete]')?.getAttribute('data-lead-details-delete');
      if (deleteId) {
        this.deleteLeadById(deleteId);
        return;
      }
      const convertId = event.target.closest('[data-lead-details-convert]')?.getAttribute('data-lead-details-convert');
      if (convertId) this.convertLeadById(convertId);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById('leadDetailsDrawer')?.hidden === false) this.closeDetails();
    });

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
    if (E.leadFormCompanyName) {
      E.leadFormCompanyName.addEventListener('focus', () => this.loadLeadPickerOptions(this.getRecordUuid(this.state.selectedCompany || {}, 'company'), '').catch(error => console.error('[leads] company picker refresh on open failed', error)));
      window.CrmCompanyContactSelectors?.bindCompanyRemoteSearch?.(E.leadFormCompanyName, searchText => this.loadLeadPickerOptions(this.getRecordUuid(this.state.selectedCompany || {}, 'company'), searchText));
      E.leadFormCompanyName.addEventListener('input', event => this.handleLeadCompanyInput(event));
      E.leadFormCompanyName.addEventListener('change', event => this.handleLeadCompanyChange(event));
    }
    if (E.leadFormContactName) {
      E.leadFormContactName.addEventListener('input', event => this.handleLeadContactInput(event));
      E.leadFormContactName.addEventListener('change', event => this.handleLeadContactChange(event));
    }
    if (E.leadFormDeleteBtn) {
      E.leadFormDeleteBtn.addEventListener('click', () => {
        const id = String(E.leadForm?.dataset.id || '').trim();
        if (id) this.deleteLeadById(id);
      });
    }

    window.addEventListener('crm:company-saved', async event => {
      if (E.leadFormModal?.getAttribute('aria-hidden') === 'true') return;
      const companyId = String(event?.detail?.companyId || event?.detail?.company?.id || '').trim();
      await this.loadLeadPickerOptions(companyId);
      const company = companyId ? await this.getFullCompanyRecord(companyId) : null;
      if (company) this.hydrateLeadFromCompany(company);
    });

    this.state.initialized = true;
  }
};

window.Leads = Leads;
