const RESOURCE_PRIMARY_KEY = {
  users: 'id',
  roles: 'role_key',
  role_permissions: 'permission_id',
  technical_admin_requests: 'id',
  operations_onboarding: 'id',
  clients: 'id',
  invoices: 'id',
  receipts: 'id',
  proposals: 'id',
  agreements: 'id',
  deals: 'id',
  leads: 'id',
  events: 'id',
  csm: 'id'
};

const Api = {
  getPrimaryKeyForResource(resource = '') {
    return RESOURCE_PRIMARY_KEY[String(resource || '').trim()] || 'id';
  },
  getEndpointDiagnostics() {
    return {
      configured: true,
      baseUrl: '',
      mode: 'supabase-only',
      endpoint: '',
      localProxyEndpoint: '',
      isProxy: false,
      notificationEndpoint: ''
    };
  },
  getAuthDiagnostics() {
    const diagnostics = this.getEndpointDiagnostics();
    return {
      endpoint: diagnostics.endpoint,
      localProxyEndpoint: diagnostics.localProxyEndpoint,
      isLocalProxy: diagnostics.isProxy
    };
  },
  async runAuthProxyHealthCheck() {
    const hasConfig = window.SupabaseClient?.hasConfig?.();
    return {
      ok: Boolean(hasConfig),
      status: hasConfig ? 200 : 0,
      endpoint: hasConfig ? window.SupabaseClient.getUrl() : '',
      data: { mode: 'supabase' },
      isLocalProxy: false,
      localProxyEndpoint: ''
    };
  },
  unwrapApiPayload(response) {
    let payload = response;
    const seen = new Set();
    while (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      if (seen.has(payload)) break;
      seen.add(payload);
      if ('data' in payload && payload.data !== undefined) {
        payload = payload.data;
        continue;
      }
      if ('result' in payload && payload.result !== undefined) {
        payload = payload.result;
        continue;
      }
      if ('payload' in payload && payload.payload !== undefined) {
        payload = payload.payload;
        continue;
      }
      if ('item' in payload && payload.item !== undefined) {
        payload = payload.item;
        continue;
      }
      break;
    }
    return payload;
  },
  buildPagedListPayload(resource = '', action = 'list', state = {}, filters = {}) {
    const safeState = state && typeof state === 'object' ? state : {};
    const safeFilters = filters && typeof filters === 'object' ? filters : {};
    const payload = {
      resource,
      action: action || 'list',
      page: Number(safeState.currentPage || safeState.page || 1),
      limit: Number(safeState.pageSize || safeState.limit || 50),
      summary_only: safeState.summary_only !== false
    };

    Object.entries(safeFilters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      payload[key] = value;
    });

    return payload;
  },
  buildSummaryListPayload(options = {}, fallbackFields = []) {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const payload = this.buildPagedListPayload(
      safeOptions.resource || '',
      safeOptions.action || 'list',
      {
        currentPage: safeOptions.page,
        pageSize: safeOptions.limit,
        summary_only: safeOptions.summary_only
      }
    );
    delete payload.resource;
    delete payload.action;
    delete payload.authToken;

    payload.sort_by = safeOptions.sort_by || 'updated_at';
    payload.sort_dir = safeOptions.sort_dir || 'desc';

    const searchValue = safeOptions.search;
    if (searchValue !== undefined && searchValue !== null && String(searchValue).trim() !== '') {
      payload.search = String(searchValue).trim();
    }
    const fields = Array.isArray(safeOptions.fields) && safeOptions.fields.length
      ? safeOptions.fields
      : (Array.isArray(fallbackFields) && fallbackFields.length ? fallbackFields : null);
    if (Array.isArray(fields) && fields.length) payload.fields = fields;
    if (safeOptions.updated_after !== undefined && safeOptions.updated_after !== null && safeOptions.updated_after !== '') {
      payload.updated_after = safeOptions.updated_after;
    }
    return payload;
  },
  mapPagedListResponse(response) {
    const payload = response && typeof response === 'object' ? response : null;
    const rows = (() => {
      if (Array.isArray(response)) return response;
      const candidates = [
        payload?.rows,
        payload?.items,
        payload?.data,
        payload?.result,
        payload?.payload,
        payload?.agreements,
        payload?.invoices,
        payload?.receipts,
        payload?.clients,
        payload?.roles,
        payload?.permissions,
        payload?.users,
        payload?.leads,
        payload?.deals,
        payload?.proposals,
        payload?.csm,
        payload?.data?.rows,
        payload?.data?.items
      ];
      for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
      }
      return [];
    })();
    const numberOr = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const limit = numberOr(payload?.limit ?? payload?.page_size ?? payload?.meta?.limit, 50);
    const page = numberOr(payload?.page ?? payload?.current_page ?? payload?.meta?.page, 1);
    const offset = numberOr(payload?.offset ?? payload?.meta?.offset, Math.max(0, (page - 1) * limit));
    const total = numberOr(payload?.total ?? payload?.total_count ?? payload?.meta?.total, rows.length);
    const returned = numberOr(payload?.returned ?? payload?.count ?? payload?.meta?.returned, rows.length);
    const hasMore = payload?.has_more !== undefined
      ? Boolean(payload.has_more)
      : payload?.hasMore !== undefined
        ? Boolean(payload.hasMore)
        : offset + returned < total;

    return {
      rows,
      total,
      returned,
      hasMore,
      has_more: hasMore,
      page,
      limit,
      offset
    };
  },
  normalizeListResponse(response) {
    return this.mapPagedListResponse(response);
  },
  async get() {
    throw new Error('Api.get is not supported in Supabase-only mode. Use Api.request with resource/action.');
  },

  isMigratedResource(resource = '') {
    return Boolean(window.SupabaseData?.isMigratedResource?.(resource));
  },
  requiresLegacyAuth(resource = '') {
    const normalized = String(resource || '').trim();
    if (!normalized) return false;
    if (normalized === 'auth') return false;
    return !this.isMigratedResource(normalized);
  },
  async request(resource, action, payload = {}) {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    return apiPost({
      ...safePayload,
      resource,
      action
    });
  },
  async requestWithSession(resource, action, payload = {}, options = {}) {
    void options;
    return this.request(resource, action, { ...payload });
  },

  getCacheConfig() {
    return {
      prefix: 'ticketing_dashboard_cache_v1',
      ttlMs: 2 * 60 * 1000
    };
  },
  buildCacheKey(resource, action, payload = {}) {
    const config = this.getCacheConfig();
    const cleanPayload = { ...(payload || {}) };
    delete cleanPayload.authToken;
    const cacheScope =
      (typeof Session?.userId === 'function' && Session.userId()) ||
      (typeof Session?.username === 'function' && Session.username()) ||
      (typeof Session?.role === 'function' && Session.role()) ||
      (Session?.state?.user_id || Session?.state?.username || Session?.state?.role || 'guest');
    const stableSerialize = value => {
      if (Array.isArray(value)) return `[${value.map(item => stableSerialize(item)).join(',')}]`;
      if (value && typeof value === 'object') {
        return `{${Object.keys(value)
          .sort()
          .map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
          .join(',')}}`;
      }
      return JSON.stringify(value);
    };
    const serialized = stableSerialize(cleanPayload);
    return `${config.prefix}:${cacheScope}:${resource}:${action}:${serialized}`;
  },
  readCachedValue(cacheKey) {
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const age = Date.now() - Number(parsed.savedAt || 0);
      const { ttlMs } = this.getCacheConfig();
      if (age > ttlMs) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  writeCachedValue(cacheKey, value, syncedAt = new Date().toISOString()) {
    if (!cacheKey) return;
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          savedAt: Date.now(),
          syncedAt,
          value
        })
      );
    } catch {
      // Ignore storage quota/sandbox failures.
    }
  },
  mergeIncrementalRows(resource = '', cachedRows = [], freshRows = []) {
    if (!Array.isArray(cachedRows)) return Array.isArray(freshRows) ? freshRows : [];
    if (!Array.isArray(freshRows) || !freshRows.length) return cachedRows;

    const idKeys = [
      this.getPrimaryKeyForResource(resource),
      'id',
      'uuid',
      'ticket_id',
      'deal_id',
      'client_id',
      'agreement_id',
      'technical_request_id',
      'invoice_id',
      'proposal_id',
      'user_id',
      'role_key',
      'permission_id',
      'role_id',
      'key'
    ];
    const getRowId = row => {
      if (!row || typeof row !== 'object') return '';
      const match = idKeys.find(key => row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '');
      return match ? `${match}:${String(row[match])}` : '';
    };
    const stableSerialize = value => {
      if (Array.isArray(value)) return `[${value.map(item => stableSerialize(item)).join(',')}]`;
      if (value && typeof value === 'object') {
        return `{${Object.keys(value)
          .sort()
          .map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
          .join(',')}}`;
      }
      return JSON.stringify(value);
    };

    const map = new Map();
    const noIdSignatures = new Set();
    cachedRows.forEach(row => {
      const id = getRowId(row);
      if (id) map.set(id, row);
      else noIdSignatures.add(stableSerialize(row));
    });

    const appended = [];
    freshRows.forEach(row => {
      const id = getRowId(row);
      if (id) {
        const previous = map.get(id) || {};
        map.set(id, { ...previous, ...row });
      } else {
        const signature = stableSerialize(row);
        if (noIdSignatures.has(signature)) return;
        noIdSignatures.add(signature);
        appended.push(row);
      }
    });

    const merged = cachedRows.map(row => {
      const id = getRowId(row);
      return id && map.has(id) ? map.get(id) : row;
    });

    map.forEach((row, id) => {
      if (!cachedRows.some(existing => getRowId(existing) === id)) {
        merged.push(row);
      }
    });

    if (appended.length) merged.push(...appended);
    return merged;
  },
  async requestCached(resource, action, payload = {}, options = {}) {
    const cacheKey = options?.cacheKey || this.buildCacheKey(resource, action, payload);
    const forceRefresh = options?.forceRefresh === true;
    const cached = this.readCachedValue(cacheKey);

    if (!forceRefresh && cached?.value !== undefined) {
      const ageMs = Date.now() - Number(cached.savedAt || 0);
      if (ageMs <= 15000) return cached.value;
    }

    const incrementalPayload = {
      ...payload
    };
    const isPaginatedQuery =
      incrementalPayload.limit !== undefined ||
      incrementalPayload.offset !== undefined ||
      incrementalPayload.summary_only === true ||
      incrementalPayload.fields !== undefined;
    if (cached?.syncedAt && !isPaginatedQuery) {
      incrementalPayload.updated_after = cached.syncedAt;
      incrementalPayload.if_modified_since = cached.syncedAt;
    }

    try {
      const fresh = await this.requestWithSession(resource, action, incrementalPayload, options);
      const shouldMerge = Array.isArray(cached?.value) && Array.isArray(fresh);
      const merged = shouldMerge ? this.mergeIncrementalRows(resource, cached.value, fresh) : fresh;
      this.writeCachedValue(cacheKey, merged);
      return merged;
    } catch (error) {
      if (cached?.value !== undefined) {
        return cached.value;
      }
      throw error;
    }
  },
  async listProposalCatalogItems(options = {}) {
    const payload = {
      ...this.buildSummaryListPayload(options)
    };
    const response = await this.requestCached('proposal_catalog', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getProposalCatalogItem(catalogItemId) {
    return this.requestWithSession('proposal_catalog', 'get', {
      id: catalogItemId
    });
  },
  async createProposalCatalogItem(item) {
    return this.requestWithSession('proposal_catalog', 'create', {
      item
    });
  },
  async updateProposalCatalogItem(catalogItemId, updates) {
    return this.requestWithSession('proposal_catalog', 'update', {
      id: catalogItemId,
      updates
    });
  },
  async deleteProposalCatalogItem(catalogItemId) {
    return this.requestWithSession('proposal_catalog', 'delete', {
      id: catalogItemId
    });
  },
  async listAgreements(options = {}) {
    const payload = this.buildSummaryListPayload(options);
    const response = await this.requestCached('agreements', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getAgreement(agreementId) {
    return this.requestWithSession('agreements', 'get', { id: agreementId });
  },
  async createAgreement(agreement, items = []) {
    return this.requestWithSession('agreements', 'create', { agreement, items });
  },
  async updateAgreement(agreementId, updates, items = []) {
    return this.requestWithSession('agreements', 'update', {
      id: agreementId,
      updates,
      items
    });
  },
  async deleteAgreement(agreementId) {
    return this.requestWithSession('agreements', 'delete', { id: agreementId });
  },
  async createAgreementFromProposal(proposalId) {
    return this.requestWithSession('agreements', 'create_from_proposal', { proposal_uuid: proposalId });
  },
  async generateAgreementHtml(agreementId) {
    return this.requestWithSession('agreements', 'generate_agreement_html', {
      agreement_id: agreementId
    });
  },
  async sendAgreementToOperations(agreementId) {
    return this.requestWithSession('agreements', 'send_to_operations', {
      agreement_id: agreementId
    });
  },
  async getAgreementOnboarding(agreementId) {
    return this.requestWithSession('agreements', 'get_onboarding', {
      agreement_id: agreementId
    });
  },
  async requestAgreementIncheckLite(agreementId) {
    const payload = {
      agreement_id: agreementId
    };
    try {
      return await this.requestWithSession('agreements', 'request_incheck_lite', payload);
    } catch (error) {
      if (!isOperationsOnboardingRowMissingError(error)) throw error;
      await this.saveOperationsOnboarding({
        agreement_id: agreementId
      });
      return this.requestWithSession('agreements', 'request_incheck_lite', payload);
    }
  },
  async requestAgreementIncheckFull(agreementId) {
    const payload = {
      agreement_id: agreementId
    };
    try {
      return await this.requestWithSession('agreements', 'request_incheck_full', payload);
    } catch (error) {
      if (!isOperationsOnboardingRowMissingError(error)) throw error;
      await this.saveOperationsOnboarding({
        agreement_id: agreementId
      });
      return this.requestWithSession('agreements', 'request_incheck_full', payload);
    }
  },
  async requestAgreementTechnicalAdmin(agreementId, message = '') {
    const normalizedAgreementId = String(agreementId || '').trim();
    if (!normalizedAgreementId) throw new Error('Agreement ID is required.');
    console.log('[operations onboarding] technical admin agreement', normalizedAgreementId);

    const technicalRequestDetails = String(message || '').trim() || `Please proceed with the following agreement ${normalizedAgreementId}.`;
    const currentUser = (window.Session?.currentUser && typeof window.Session.currentUser === 'object')
      ? window.Session.currentUser
      : {};
    const requestedBy = String(
      currentUser.email ||
      currentUser.user_id ||
      currentUser.id ||
      (typeof window.Session?.userId === 'function' ? window.Session.userId() : '') ||
      ''
    ).trim();
    const requestedAt = new Date().toISOString();

    const requestFields = {
      agreement_id: normalizedAgreementId,
      technical_request_type: 'Technical Admin',
      technical_request_details: technicalRequestDetails,
      technical_request_status: 'Requested',
      requested_by: requestedBy || null,
      requested_at: requestedAt
    };

    const onboardingListResponse = await this.listOperationsOnboarding({ agreement_id: normalizedAgreementId });
    const onboardingRows = this.normalizeListResponse(onboardingListResponse).rows || [];
    const matchingRows = onboardingRows.filter(row => String(row?.agreement_id || '').trim() === normalizedAgreementId);
    const sortableRows = matchingRows.length ? matchingRows : onboardingRows;
    const sortedRows = sortableRows.slice().sort((a, b) => {
      const aTime = new Date(a?.updated_at || a?.created_at || 0).getTime();
      const bTime = new Date(b?.updated_at || b?.created_at || 0).getTime();
      return bTime - aTime;
    });
    if (sortedRows.length > 1) {
      console.warn('[operations onboarding] duplicate rows found for agreement_id', normalizedAgreementId, sortedRows);
    }
    const existingOnboarding = sortedRows[0] || null;
    console.log('[operations onboarding] resolved existing onboarding', existingOnboarding);

    let onboardingRecord;
    if (existingOnboarding) {
      const rowId = String(existingOnboarding.id || existingOnboarding.db_id || '').trim();
      if (!rowId) throw new Error(`Operations onboarding row is missing id for agreement ${normalizedAgreementId}.`);
      onboardingRecord = await this.updateOperationsOnboarding(rowId, requestFields);
    } else {
      onboardingRecord = await this.saveOperationsOnboarding(requestFields);
    }

    let technicalRequest = null;
    if (this.isMigratedResource('technical_admin_requests')) {
      try {
        const technicalListResponse = await this.listTechnicalAdminRequests({ agreement_id: normalizedAgreementId });
        const technicalRows = this.normalizeListResponse(technicalListResponse).rows || [];
        const existingRequest = technicalRows.find(row => String(row?.agreement_id || '').trim() === normalizedAgreementId) || technicalRows[0] || null;
        const onboardingPayload = this.unwrapApiPayload(onboardingRecord) || onboardingRecord || {};
        const technicalPayload = {
          agreement_id: normalizedAgreementId,
          onboarding_id: onboardingPayload?.onboarding_id || onboardingPayload?.id || null,
          technical_request_type: 'Technical Admin',
          technical_request_details: technicalRequestDetails,
          technical_request_status: 'Requested',
          requested_by: requestedBy || null,
          requested_at: requestedAt
        };
        if (existingRequest) {
          const technicalRequestId = String(existingRequest.technical_request_id || existingRequest.id || '').trim();
          if (technicalRequestId) {
            technicalRequest = await this.requestWithSession('technical_admin_requests', 'update', {
              technical_request_id: technicalRequestId,
              updates: technicalPayload
            });
          }
        } else {
          technicalRequest = await this.requestWithSession('technical_admin_requests', 'save', {
            technical_admin_request: technicalPayload
          });
        }
      } catch (error) {
        console.warn('Unable to upsert technical_admin_requests row for agreement', normalizedAgreementId, error);
      }
    }

    return {
      agreement_id: normalizedAgreementId,
      operations_onboarding: this.unwrapApiPayload(onboardingRecord) || onboardingRecord,
      technical_request: this.unwrapApiPayload(technicalRequest) || technicalRequest || null
    };
  },
  async assignAgreementCsm(agreementId, assignment = {}) {
    return this.requestWithSession('agreements', 'assign_csm', {
      agreement_id: agreementId,
      csm_assigned_to: assignment.csm_assigned_to,
      handover_note: assignment.handover_note
    });
  },
  async updateAgreementOnboardingStatus(agreementId, update = {}) {
    return this.requestWithSession('agreements', 'update_onboarding_status', {
      agreement_id: agreementId,
      onboarding_status: update.onboarding_status,
      notes: update.notes
    });
  },
  async updateOperationsOnboardingAction({ onboardingId = '', agreementId = '', updates = {}, syncTechnicalStatus = '' } = {}) {
    const normalizedOnboardingId = String(onboardingId || '').trim();
    const normalizedAgreementId = String(agreementId || '').trim();
    if (!normalizedOnboardingId) throw new Error('operations_onboarding id is required.');
    const payload = updates && typeof updates === 'object' ? { ...updates } : {};
    delete payload.id;
    delete payload.db_id;
    delete payload.record_id;
    console.log('[operations onboarding] update id', normalizedOnboardingId, payload);
    const response = await this.updateOperationsOnboarding(normalizedOnboardingId, payload);
    const updatedOnboarding = this.unwrapApiPayload(response) || response || null;

    if (syncTechnicalStatus && normalizedAgreementId) {
      try {
        const technicalList = await this.listTechnicalAdminRequests({ agreement_id: normalizedAgreementId });
        const technicalRows = this.normalizeListResponse(technicalList).rows || [];
        const technicalStatus = String(syncTechnicalStatus || '').trim();
        if (technicalRows.length && technicalStatus) {
          await Promise.all(technicalRows.map(async row => {
            const technicalRequestId = String(row.technical_request_id || row.request_id || row.id || '').trim();
            if (!technicalRequestId) return;
            const statusPayload = {
              updated_at: payload.updated_at || new Date().toISOString()
            };
            if (technicalStatus === 'Completed') statusPayload.completed_at = payload.completed_at || new Date().toISOString();
            if (technicalStatus === 'In Progress') statusPayload.completed_at = null;
            await this.updateTechnicalAdminRequestStatus(technicalRequestId, technicalStatus, statusPayload);
          }));
        }
      } catch (syncError) {
        console.warn('[Api.updateOperationsOnboardingAction] Unable to sync technical_admin_requests status', {
          id: normalizedOnboardingId,
          agreement_id: normalizedAgreementId,
          status: syncTechnicalStatus,
          error: String(syncError?.message || syncError)
        });
      }
    }

    return {
      operations_onboarding: updatedOnboarding,
      synced_technical_status: syncTechnicalStatus || null
    };
  },


  async listOperationsOnboarding(filters = {}, options = {}) {
    return this.requestCached('operations_onboarding', 'list', {
      filters,
      sheetName: CONFIG.OPERATIONS_ONBOARDING_SHEET_NAME
    }, {
      forceRefresh: options?.forceRefresh === true
    });
  },
  async getOperationsOnboarding(payload = {}) {
    return this.requestWithSession('operations_onboarding', 'get', {
      ...payload,
      sheetName: CONFIG.OPERATIONS_ONBOARDING_SHEET_NAME
    });
  },
  async saveOperationsOnboarding(onboarding = {}) {
    return this.requestWithSession('operations_onboarding', 'save', {
      onboarding,
      sheetName: CONFIG.OPERATIONS_ONBOARDING_SHEET_NAME
    });
  },
  async updateOperationsOnboarding(onboardingId, updates = {}) {
    const safeUpdates = updates && typeof updates === 'object' ? { ...updates } : {};
    delete safeUpdates.id;
    delete safeUpdates.db_id;
    delete safeUpdates.record_id;
    return this.requestWithSession('operations_onboarding', 'update', {
      id: onboardingId,
      updates: safeUpdates,
      sheetName: CONFIG.OPERATIONS_ONBOARDING_SHEET_NAME
    });
  },
  async listTechnicalAdminRequests(filters = {}, options = {}) {
    const payload = {
      filters: {
        ...(filters && typeof filters === 'object' ? filters : {})
      }
    };
    const response = await this.requestCached('technical_admin_requests', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getTechnicalAdminRequest(technicalRequestId) {
    return this.requestWithSession('technical_admin_requests', 'get', {
      id: technicalRequestId,
      request_id: technicalRequestId,
      technical_request_id: technicalRequestId
    });
  },
  async updateTechnicalAdminRequestStatus(technicalRequestId, status, extra = {}) {
    return this.requestWithSession('technical_admin_requests', 'update_status', {
      id: technicalRequestId,
      technical_request_id: technicalRequestId,
      request_status: status,
      ...(extra && typeof extra === 'object' ? extra : {})
    });
  },

  async listInvoices(filters = {}, options = {}) {
    const listPayload = this.buildSummaryListPayload(options);
    const payload = {
      filters: {
        ...(filters && typeof filters === 'object' ? filters : {}),
        ...listPayload
      }
    };
    const response = await this.requestCached('invoices', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getInvoice(invoiceId) {
    return this.requestWithSession('invoices', 'get', { id: invoiceId, invoice_id: invoiceId });
  },
  async createInvoice(invoice, items = []) {
    return this.requestWithSession('invoices', 'create', { invoice, items });
  },
  async updateInvoice(invoiceId, updates = {}, items) {
    const payload = {
      id: invoiceId,
      invoice_id: invoiceId,
      updates
    };
    if (items !== undefined) payload.items = items;
    return this.requestWithSession('invoices', 'update', payload);
  },
  async deleteInvoice(invoiceId) {
    return this.requestWithSession('invoices', 'delete', { id: invoiceId, invoice_id: invoiceId });
  },
  async createInvoiceFromAgreement(agreementId) {
    return this.requestWithSession('invoices', 'create_from_agreement', { id: agreementId, agreement_id: agreementId });
  },
  async generateInvoiceHtml(invoiceId) {
    return this.requestWithSession('invoices', 'generate_invoice_html', { invoice_id: invoiceId });
  },
  async listReceipts(filters = {}, options = {}) {
    const listPayload = this.buildSummaryListPayload(options);
    const payload = {
      filters: {
        ...(filters && typeof filters === 'object' ? filters : {}),
        ...listPayload
      }
    };
    const response = await this.requestCached('receipts', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getReceipt(receiptId) {
    return this.requestWithSession('receipts', 'get', { id: receiptId, receipt_id: receiptId });
  },
  async createReceipt(receipt, items = []) {
    return this.requestWithSession('receipts', 'create', { receipt, items });
  },
  async updateReceipt(receiptId, updates = {}, items) {
    const payload = {
      id: receiptId,
      receipt_id: receiptId,
      updates
    };
    if (items !== undefined) payload.items = items;
    return this.requestWithSession('receipts', 'update', payload);
  },
  async deleteReceipt(receiptId) {
    return this.requestWithSession('receipts', 'delete', { id: receiptId, receipt_id: receiptId });
  },
  async createReceiptFromInvoice(invoiceId, options = {}) {
    const payload = {
      id: invoiceId,
      invoice_id: invoiceId
    };
    if (options && typeof options === 'object') {
      if (options.amount !== undefined) payload.amount = options.amount;
      if (options.payment_method !== undefined) payload.payment_method = options.payment_method;
      if (options.payment_reference !== undefined) payload.payment_reference = options.payment_reference;
    }
    return this.requestWithSession('receipts', 'create_from_invoice', payload);
  },
  async previewReceipt(receiptId) {
    return this.requestWithSession('receipts', 'generate_receipt_html', { receipt_id: receiptId });
  },
  async listClients(options = {}) {
    const payload = this.buildSummaryListPayload(options);
    const response = await this.requestCached('clients', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getClient(clientId) {
    return this.requestWithSession('clients', 'get', { id: clientId, client_id: clientId });
  },
  async createClient(client) {
    return this.requestWithSession('clients', 'create', { client });
  },
  async createClientFromPayload(client) {
    return this.requestWithSession('clients', 'create', { client });
  },
  async updateClient(clientId, updates) {
    return this.requestWithSession('clients', 'update', {
      id: clientId,
      client_id: clientId,
      updates
    });
  },
  async deleteClient(clientId) {
    return this.requestWithSession('clients', 'delete', { id: clientId, client_id: clientId });
  },
  async getClientAnalytics(clientId) {
    return this.requestWithSession('clients', 'get_analytics', { client_id: clientId });
  },
  async analyticsSearchEntity(query, filters = {}) {
    return this.requestWithSession('analytics', 'search_entity', { query, filters });
  },
  async analyticsGetLifecycle(entityId, filters = {}) {
    return this.requestWithSession('analytics', 'get_lifecycle', { entity_id: entityId, filters });
  },
  async analyticsGetTimeline(entityId, filters = {}) {
    return this.requestWithSession('analytics', 'get_timeline', { entity_id: entityId, filters });
  },
  async analyticsGetMetrics(entityId, filters = {}) {
    return this.requestWithSession('analytics', 'get_metrics', { entity_id: entityId, filters });
  },
  async getClientTimeline(clientId) {
    return this.requestWithSession('clients', 'get_timeline', { client_id: clientId });
  },
  async createProposalFromClient(clientId, payload = {}) {
    return this.requestWithSession('clients', 'create_proposal', {
      client_id: clientId,
      ...payload
    });
  },
  async createAgreementFromClient(clientId, payload = {}) {
    return this.requestWithSession('clients', 'create_agreement', {
      client_id: clientId,
      ...payload
    });
  },
  async createInvoiceFromClient(clientId, payload = {}) {
    return this.requestWithSession('clients', 'create_invoice', {
      client_id: clientId,
      ...payload
    });
  },
  async createFromPreviousAgreement(clientId, agreementId, flow = 'agreement') {
    return this.requestWithSession('clients', 'create_from_previous_agreement', {
      client_id: clientId,
      agreement_id: agreementId,
      flow
    });
  },

  async listNotifications(options = {}) {
    const payload = {
      limit: Number(options.limit || 50),
      unread_only: options.unread_only === true,
      priority: options.priority || '',
      search: options.search || ''
    };
    if (options.filters && typeof options.filters === 'object') payload.filters = options.filters;
    return this.requestWithSession('notifications', 'list', payload);
  },
  async getNotificationUnreadCount() {
    const response = await this.requestWithSession('notifications', 'get_unread_count', {});
    const candidates = [
      response?.unread_count,
      response?.count,
      response?.total,
      response?.data?.unread_count,
      response?.result?.unread_count,
      response?.payload?.unread_count
    ];
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  },
  async markNotificationRead(notificationId) {
    return this.requestWithSession('notifications', 'mark_read', {
      notification_id: notificationId
    });
  },
  async markAllNotificationsRead() {
    return this.requestWithSession('notifications', 'mark_all_read', {});
  },
  async listRoles(options = {}) {
    const payload = {
      ...this.buildSummaryListPayload(options),
      sheetName: CONFIG.ROLES_SHEET_NAME
    };
    const response = await this.requestCached('roles', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getRole(roleKey) {
    return this.requestWithSession('roles', 'get', {
      role_key: roleKey,
      sheetName: CONFIG.ROLES_SHEET_NAME
    });
  },
  async createRole(payload = {}) {
    return this.requestWithSession('roles', 'create', {
      role: payload,
      ...payload,
      sheetName: CONFIG.ROLES_SHEET_NAME
    });
  },
  async updateRole(roleKey, updates = {}) {
    return this.requestWithSession('roles', 'update', {
      role_key: roleKey,
      updates,
      role: { role_key: roleKey, ...updates },
      sheetName: CONFIG.ROLES_SHEET_NAME
    });
  },
  async deleteRole(roleKey) {
    return this.requestWithSession('roles', 'delete', {
      role_key: roleKey,
      sheetName: CONFIG.ROLES_SHEET_NAME
    });
  },
  async listRolePermissions(options = {}) {
    const payload = {
      ...this.buildSummaryListPayload(options)
    };
    const response = await this.requestCached('role_permissions', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getRolePermission(permissionId) {
    return this.requestWithSession('role_permissions', 'get', {
      permission_id: permissionId
    });
  },
  sanitizeRolePermissionPayload(payload = {}) {
    const dbColumns = ['role_key', 'resource', 'action', 'is_allowed', 'is_active', 'allowed_roles', 'updated_at'];
    const strippedFields = [
      'id',
      'description',
      'permission',
      'sheetName',
      'sheet_name',
      'roleName',
      'roleLabel',
      'selectedRoles'
    ];
    const sanitized = dbColumns.reduce((acc, key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) acc[key] = payload[key];
      return acc;
    }, {});
    strippedFields.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(sanitized, key)) delete sanitized[key];
    });
    if (Object.prototype.hasOwnProperty.call(sanitized, 'role_key')) {
      sanitized.role_key = String(sanitized.role_key || '').trim().toLowerCase();
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'resource')) {
      sanitized.resource = String(sanitized.resource || '').trim().toLowerCase();
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'action')) {
      sanitized.action = String(sanitized.action || '').trim().toLowerCase();
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'is_allowed')) {
      sanitized.is_allowed = Boolean(sanitized.is_allowed);
    }
    sanitized.is_active = Object.prototype.hasOwnProperty.call(sanitized, 'is_active')
      ? Boolean(sanitized.is_active)
      : true;
    sanitized.updated_at = new Date().toISOString();
    if (!sanitized.role_key || !sanitized.resource || !sanitized.action) return {};
    return sanitized;
  },
  async createRolePermission(payload = {}) {
    const permissionPayload = this.sanitizeRolePermissionPayload(payload);
    if (!permissionPayload.role_key || !permissionPayload.resource || !permissionPayload.action) {
      throw new Error('role_key, resource, and action are required.');
    }
    try { console.log('[RolesPermissions] final sanitized DB payload', permissionPayload); } catch {}
    return this.requestWithSession('role_permissions', 'create', {
      ...permissionPayload
    });
  },
  async updateRolePermission(permissionId, updates = {}) {
    const permissionUpdates = this.sanitizeRolePermissionPayload(updates);
    if (!permissionUpdates.role_key || !permissionUpdates.resource || !permissionUpdates.action) {
      throw new Error('role_key, resource, and action are required.');
    }
    try { console.log('[RolesPermissions] update permission_id', permissionId); } catch {}
    try { console.log('[RolesPermissions] final sanitized DB payload', { permission_id: permissionId, ...permissionUpdates }); } catch {}
    return this.requestWithSession('role_permissions', 'update', {
      permission_id: permissionId,
      ...permissionUpdates
    });
  },
  async saveRolePermission(payload = {}) {
    const permissionPayload = this.sanitizeRolePermissionPayload(payload);
    if (!permissionPayload.role_key || !permissionPayload.resource || !permissionPayload.action) {
      throw new Error('role_key, resource, and action are required.');
    }
    try { console.log('[RolesPermissions] final sanitized DB payload', permissionPayload); } catch {}
    return this.requestWithSession('role_permissions', 'save', {
      ...permissionPayload
    });
  },
  async deleteRolePermission(permissionId) {
    return this.requestWithSession('role_permissions', 'delete', {
      permission_id: permissionId
    });
  },

  clearApiCache(prefix = '') {
    try {
      const cachePrefix = this.getCacheConfig().prefix;
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(cachePrefix + ':')) continue;
        if (prefix && !key.includes(prefix)) continue;
        keys.push(key);
      }
      keys.forEach(key => localStorage.removeItem(key));
    } catch {}
  },
  debugWorkflowResponse(label, payload) {
    try { console.log('[workflow]', label, payload); } catch {}
  },
  normalizeWorkflowRulePayload(rule = {}) {
    const source = rule && typeof rule === 'object' ? { ...rule } : {};
    const normalizeRoleList = (...values) => {
      const found = values.find(value => value !== undefined && value !== null && (Array.isArray(value) || String(value).trim() !== ''));
      if (Array.isArray(found)) {
        return found.map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
      }
      return String(found || '')
        .split(',')
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean);
    };
    const allowedRoles = normalizeRoleList(source.allowed_roles, source.allowed_roles_csv);
    const approvalRoles = normalizeRoleList(source.approval_roles, source.approval_roles_csv, source.approval_role);
    return {
      ...source,
      allowed_roles: allowedRoles,
      approval_roles: approvalRoles,
      allowed_roles_csv: allowedRoles.join(','),
      approval_roles_csv: approvalRoles.join(','),
      approval_role: source.approval_role || approvalRoles[0] || ''
    };
  },
  async listWorkflowRules(filters = {}, options = {}) {
    const response = await this.requestWithSession('workflow', 'list', {
      filters,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    }, options);
    const normalizeRows = rows => Array.isArray(rows) ? rows.map(row => this.normalizeWorkflowRulePayload(row)) : rows;
    const normalized = Array.isArray(response)
      ? normalizeRows(response)
      : response && typeof response === 'object'
        ? {
            ...response,
            items: normalizeRows(response.items),
            rows: normalizeRows(response.rows),
            data: normalizeRows(response.data)
          }
        : response;
    this.debugWorkflowResponse('list rules response', normalized);
    return normalized;
  },
  async getWorkflowRule(workflowRuleId) {
    const response = await this.requestWithSession('workflow', 'get', {
      workflow_rule_id: workflowRuleId,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    });
    return this.normalizeWorkflowRulePayload(response);
  },
  async saveWorkflowRule(rule = {}) {
    const normalizedRule = this.normalizeWorkflowRulePayload(rule);
    const body = {
      rule: normalizedRule,
      ...normalizedRule,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    };
    try {
      return await this.requestWithSession('workflow', 'save_rule', body);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      const looksLikeAliasMismatch = /unknown workflow action|unknown action|not found|unsupported/.test(message);
      if (!looksLikeAliasMismatch) throw error;
      return this.requestWithSession('workflow', 'save', body);
    }
  },
  async deleteWorkflowRule(workflowRule) {
    const source = workflowRule && typeof workflowRule === 'object'
      ? workflowRule
      : { workflow_rule_id: workflowRule };
    const body = {
      workflow_rule_id: source.workflow_rule_id,
      id: source.id,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    };
    try {
      return await this.requestWithSession('workflow', 'delete_rule', body);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      const looksLikeAliasMismatch = /unknown workflow action|unknown action|not found|unsupported/.test(message);
      if (!looksLikeAliasMismatch) throw error;
      return this.requestWithSession('workflow', 'delete', body);
    }
  },
  buildWorkflowTransitionPayload(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const record = source.record && typeof source.record === 'object' ? source.record : {};
    const requestedChanges = source.requested_changes && typeof source.requested_changes === 'object'
      ? source.requested_changes
      : {};

    const firstNonEmpty = (...values) => {
      for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return '';
    };

    const normalizedResource = String(
      firstNonEmpty(
        source.target_workflow_resource,
        source.target_resource,
        source.workflow_resource,
        source.resource,
        requestedChanges.resource,
        record.resource
      )
    ).trim().toLowerCase();

    const currentStatus = String(
      firstNonEmpty(
        source.current_status,
        source.from_status,
        requestedChanges.current_status,
        requestedChanges.from_status,
        record.current_status,
        record.status
      )
    ).trim();

    const nextStatus = String(
      firstNonEmpty(
        source.next_status,
        source.to_status,
        source.requested_status,
        requestedChanges.next_status,
        requestedChanges.to_status,
        requestedChanges.requested_status,
        record.next_status
      )
    ).trim();

    const discountCandidate = firstNonEmpty(
      source.discount_percent,
      requestedChanges.discount_percent,
      record.discount_percent
    );
    const parsedDiscount = Number(discountCandidate);
    const normalizedDiscount = Number.isFinite(parsedDiscount) ? parsedDiscount : 0;

    const normalizedRecordId = String(
      firstNonEmpty(
        source.record_id,
        source.id,
        source.proposal_id,
        source.agreement_id,
        source.invoice_id,
        source.receipt_id,
        record.id,
        record.proposal_id,
        record.agreement_id,
        record.invoice_id,
        record.receipt_id
      )
    ).trim();

    return {
      resource: String(source.resource || 'workflow').trim().toLowerCase() || 'workflow',
      action: String(source.action || 'validate_transition').trim().toLowerCase() || 'validate_transition',
      target_workflow_resource: normalizedResource,
      current_status: currentStatus,
      requested_status: nextStatus,
      next_status: nextStatus,
      discount_percent: normalizedDiscount,
      record_id: normalizedRecordId,
      record,
      requested_changes: requestedChanges,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    };
  },
  async validateWorkflowTransition(payload = {}) {
    const body = this.buildWorkflowTransitionPayload(payload);
    return this.requestWithSession('workflow', 'validate_transition', body);
  },
  normalizeWorkflowApprovalResult(result = {}) {
    const source = result && typeof result === 'object' ? result : {};
    return {
      ok: source.ok === true,
      created: source.created === true,
      reused: source.reused === true,
      approval_id: String(source.approval_id || '').trim(),
      approval_role: String(source.approval_role || '').trim(),
      status: String(source.status || '').trim(),
      resource: String(source.resource || '').trim(),
      record_id: String(source.record_id || '').trim()
    };
  },
  async createWorkflowApproval(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const approvalPayload = {
      resource: source.resource ?? source.p_resource ?? '',
      p_resource: source.resource ?? source.p_resource ?? '',
      target_workflow_resource: source.target_workflow_resource ?? source.target_resource ?? source.resource ?? source.p_resource ?? '',
      target_resource: source.target_resource ?? source.target_workflow_resource ?? source.resource ?? source.p_resource ?? '',
      record_id: source.record_id ?? source.p_record_id ?? '',
      workflow_rule_id: source.workflow_rule_id ?? source.p_workflow_rule_id ?? null,
      requester_user_id: source.requester_user_id ?? source.p_requester_user_id ?? null,
      requester_role: source.requester_role ?? source.p_requester_role ?? '',
      approval_role: source.approval_role ?? source.p_approval_role ?? '',
      old_status: source.old_status ?? source.p_old_status ?? '',
      new_status: source.new_status ?? source.p_new_status ?? '',
      requested_changes: source.requested_changes ?? source.p_requested_changes ?? {}
    };
    const response = await apiPost({
      ...approvalPayload,
      resource: 'workflow',
      action: 'create_workflow_approval'
    });
    return this.normalizeWorkflowApprovalResult(response);
  },
  async requestWorkflowApproval(payload = {}) {
    return this.requestWithSession('workflow', 'request_approval', {
      ...payload,
      sheetName: CONFIG.WORKFLOW_APPROVALS_SHEET_NAME
    });
  },
  async approveWorkflowRequest(payload = {}) {
    return this.requestWithSession('workflow', 'approve', {
      ...payload,
      sheetName: CONFIG.WORKFLOW_APPROVALS_SHEET_NAME
    });
  },
  async rejectWorkflowRequest(payload = {}) {
    return this.requestWithSession('workflow', 'reject', {
      ...payload,
      sheetName: CONFIG.WORKFLOW_APPROVALS_SHEET_NAME
    });
  },
  async listPendingWorkflowApprovals(filters = {}) {
    return this.requestWithSession('workflow', 'list_pending_approvals', {
      filters,
      sheetName: CONFIG.WORKFLOW_APPROVALS_SHEET_NAME
    });
  },
  async listWorkflowAudit(filters = {}) {
    return this.requestWithSession('workflow', 'list_audit', {
      filters,
      sheetName: CONFIG.WORKFLOW_AUDIT_LOG_SHEET_NAME
    });
  },
};

async function apiPost(payload = {}) {
  const requestBody = payload && typeof payload === 'object' ? payload : {};
  const resource = String(requestBody?.resource || '').trim();
  const action = String(requestBody?.action || '').trim();
  if (window.SupabaseData?.isMigratedResource?.(resource)) {
    const dispatched = await window.SupabaseData.dispatch(requestBody);
    if (dispatched?.handled) return dispatched.data;
  }
  throw new Error(`Resource "${resource || 'unknown'}" is not available in SupabaseData. Legacy backend fallback has been removed.`);
}

function isOperationsOnboardingRowMissingError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('operations onboarding row not found for agreement') ||
    message.includes('onboarding row not found for agreement')
  );
}
