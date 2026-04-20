const Api = {
  ensureBaseUrl() {
    const resolved = resolveApiEndpoint(API_BASE_URL);
    if (!resolved) {
      throw new Error('API_BASE_URL is not configured.');
    }
    return resolved;
  },
  getEndpointDiagnostics() {
    const endpoint = this.ensureBaseUrl();
    const localProxyEndpoint = resolveApiEndpoint('/api/proxy');
    return {
      endpoint,
      localProxyEndpoint,
      isProxy: endpoint === localProxyEndpoint,
      notificationEndpoint: endpoint
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
    const { endpoint, localProxyEndpoint, isLocalProxy } = this.getAuthDiagnostics();
    const payload = {
      resource: 'auth',
      action: 'session',
      authToken: 'invalid-test'
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const parsed = await readAppsScriptResponse(response, {
        sourceName: 'Auth health check',
        endpoint,
        resource: 'auth',
        action: 'session'
      });
      if (response.status === 404) {
        if (isLocalProxy) {
          console.error(
            `[auth/health] Missing local /api/proxy route (endpoint=${endpoint}). Ensure api/proxy.js is deployed.`
          );
        } else {
          console.error(
            `[auth/health] Backend endpoint returned HTTP 404 (endpoint=${endpoint}). Verify API_BASE_URL points to a valid auth backend.`
          );
        }
      }
      return {
        ok: response.ok,
        status: response.status,
        endpoint,
        data: parsed?.data || null,
        isLocalProxy,
        localProxyEndpoint
      };
    } catch (error) {
      const message = String(error?.message || error || 'unknown error');
      console.warn(
        `[auth/health] Failed before login. endpoint=${endpoint}; localProxy=${localProxyEndpoint}; error=${message}`
      );
      return {
        ok: false,
        status: 0,
        endpoint,
        error,
        isLocalProxy,
        localProxyEndpoint
      };
    }
  },
  buildUrl(resource = '', params = {}) {
    const endpoint = this.ensureBaseUrl();
    const url = new URL(endpoint);
    if (resource) url.searchParams.set('resource', String(resource));
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    return url.toString();
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
    const authToken =
      typeof Session?.getAuthToken === 'function'
        ? Session.getAuthToken()
        : String(Session?.authContext?.().authToken || '');

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

    if (authToken) payload.authToken = authToken;
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
  async get(resource, params = {}) {
    const endpoint = this.buildUrl(resource, params);
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store'
      });
    } catch (error) {
      throw buildNetworkRequestError(endpoint, error);
    }
    const { data } = await readAppsScriptResponse(response, {
      sourceName: `Backend ${resource || 'api'}`,
      endpoint,
      resource
    });
    if (!response.ok) {
      throw buildHttpResponseError(response, data, endpoint, { resource, action: 'get' });
    }
    if (data && typeof data === 'object' && hasExplicitBackendFailure(data)) {
      throw buildExplicitBackendFailureError(data, {
        endpoint,
        resource,
        action: 'get',
        status: response.status
      });
    }
    return this.unwrapApiPayload(data);
  },
  async post(resource, action, payload = {}) {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    return apiPost({
      ...safePayload,
      resource,
      action
    });
  },
  async postAuthenticated(resource, action, payload = {}, options = {}) {
    const requireAuth = options?.requireAuth !== false;
    const authToken =
      typeof Session?.getAuthToken === 'function'
        ? Session.getAuthToken()
        : String(Session?.authContext?.().authToken || '');
    if (requireAuth && !authToken) {
      throw new Error('Missing authentication token.');
    }
    return this.post(resource, action, {
      ...payload,
      authToken: authToken || ''
    });
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
  mergeIncrementalRows(cachedRows = [], freshRows = []) {
    if (!Array.isArray(cachedRows)) return Array.isArray(freshRows) ? freshRows : [];
    if (!Array.isArray(freshRows) || !freshRows.length) return cachedRows;

    const idKeys = ['id', 'uuid', 'ticket_id', 'deal_id', 'client_id', 'agreement_id', 'technical_request_id', 'invoice_id', 'proposal_id', 'user_id', 'role_id', 'key'];
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
  async postAuthenticatedCached(resource, action, payload = {}, options = {}) {
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
      const fresh = await this.postAuthenticated(resource, action, incrementalPayload, options);
      const shouldMerge = Array.isArray(cached?.value) && Array.isArray(fresh);
      const merged = shouldMerge ? this.mergeIncrementalRows(cached.value, fresh) : fresh;
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
      ...this.buildSummaryListPayload(options),
      sheetName: CONFIG.PROPOSAL_CATALOG_SHEET_NAME
    };
    const response = await this.postAuthenticatedCached('proposal_catalog', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getProposalCatalogItem(catalogItemId) {
    return this.postAuthenticated('proposal_catalog', 'get', {
      catalog_item_id: catalogItemId,
      sheetName: CONFIG.PROPOSAL_CATALOG_SHEET_NAME
    });
  },
  async createProposalCatalogItem(item) {
    return this.postAuthenticated('proposal_catalog', 'create', {
      item,
      sheetName: CONFIG.PROPOSAL_CATALOG_SHEET_NAME
    });
  },
  async updateProposalCatalogItem(catalogItemId, updates) {
    return this.postAuthenticated('proposal_catalog', 'update', {
      catalog_item_id: catalogItemId,
      updates,
      sheetName: CONFIG.PROPOSAL_CATALOG_SHEET_NAME
    });
  },
  async deleteProposalCatalogItem(catalogItemId) {
    return this.postAuthenticated('proposal_catalog', 'delete', {
      catalog_item_id: catalogItemId,
      sheetName: CONFIG.PROPOSAL_CATALOG_SHEET_NAME
    });
  },
  async listAgreements(options = {}) {
    const payload = this.buildSummaryListPayload(options);
    const response = await this.postAuthenticatedCached('agreements', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getAgreement(agreementId) {
    return this.postAuthenticated('agreements', 'get', { agreement_id: agreementId });
  },
  async createAgreement(agreement, items = []) {
    return this.postAuthenticated('agreements', 'create', { agreement, items });
  },
  async updateAgreement(agreementId, updates, items = []) {
    return this.postAuthenticated('agreements', 'update', {
      agreement_id: agreementId,
      updates,
      items
    });
  },
  async deleteAgreement(agreementId) {
    return this.postAuthenticated('agreements', 'delete', { agreement_id: agreementId });
  },
  async createAgreementFromProposal(proposalId) {
    return this.postAuthenticated('agreements', 'create_from_proposal', { proposal_id: proposalId });
  },
  async generateAgreementHtml(agreementId) {
    return this.postAuthenticated('agreements', 'generate_agreement_html', {
      agreement_id: agreementId
    });
  },
  async sendAgreementToOperations(agreementId) {
    return this.postAuthenticated('agreements', 'send_to_operations', {
      agreement_id: agreementId
    });
  },
  async getAgreementOnboarding(agreementId) {
    return this.postAuthenticated('agreements', 'get_onboarding', {
      agreement_id: agreementId
    });
  },
  async requestAgreementIncheckLite(agreementId) {
    const payload = {
      agreement_id: agreementId
    };
    try {
      return await this.postAuthenticated('agreements', 'request_incheck_lite', payload);
    } catch (error) {
      if (!isOperationsOnboardingRowMissingError(error)) throw error;
      await this.saveOperationsOnboarding({
        agreement_id: agreementId
      });
      return this.postAuthenticated('agreements', 'request_incheck_lite', payload);
    }
  },
  async requestAgreementIncheckFull(agreementId) {
    const payload = {
      agreement_id: agreementId
    };
    try {
      return await this.postAuthenticated('agreements', 'request_incheck_full', payload);
    } catch (error) {
      if (!isOperationsOnboardingRowMissingError(error)) throw error;
      await this.saveOperationsOnboarding({
        agreement_id: agreementId
      });
      return this.postAuthenticated('agreements', 'request_incheck_full', payload);
    }
  },
  async requestAgreementTechnicalAdmin(agreementId, message = '') {
    const payload = {
      agreement_id: agreementId,
      technical_admin_request: true,
      technical_admin_request_message: String(message || '').trim() || `Please proceed with the following agreement ${agreementId}.`
    };
    try {
      return await this.postAuthenticated('agreements', 'request_technical_admin', payload);
    } catch (error) {
      if (!isOperationsOnboardingRowMissingError(error)) throw error;
      await this.saveOperationsOnboarding({
        agreement_id: agreementId,
        request_type: 'Technical Admin',
        technical_admin_request: 'Requested',
        technical_admin_request_message: payload.technical_admin_request_message
      });
      return this.postAuthenticated('agreements', 'request_technical_admin', payload);
    }
  },
  async assignAgreementCsm(agreementId, assignment = {}) {
    return this.postAuthenticated('agreements', 'assign_csm', {
      agreement_id: agreementId,
      csm_assigned_to: assignment.csm_assigned_to,
      handover_note: assignment.handover_note
    });
  },
  async updateAgreementOnboardingStatus(agreementId, update = {}) {
    return this.postAuthenticated('agreements', 'update_onboarding_status', {
      agreement_id: agreementId,
      onboarding_status: update.onboarding_status,
      notes: update.notes
    });
  },


  async listOperationsOnboarding(filters = {}) {
    return this.postAuthenticatedCached('operations_onboarding', 'list', {
      filters,
      sheetName: CONFIG.OPERATIONS_ONBOARDING_SHEET_NAME
    });
  },
  async getOperationsOnboarding(payload = {}) {
    return this.postAuthenticated('operations_onboarding', 'get', {
      ...payload,
      sheetName: CONFIG.OPERATIONS_ONBOARDING_SHEET_NAME
    });
  },
  async saveOperationsOnboarding(onboarding = {}) {
    return this.postAuthenticated('operations_onboarding', 'save', {
      onboarding,
      sheetName: CONFIG.OPERATIONS_ONBOARDING_SHEET_NAME
    });
  },
  async updateOperationsOnboarding(onboardingId, updates = {}) {
    return this.postAuthenticated('operations_onboarding', 'update', {
      onboarding_id: onboardingId,
      updates,
      sheetName: CONFIG.OPERATIONS_ONBOARDING_SHEET_NAME
    });
  },
  async listTechnicalAdminRequests(filters = {}) {
    return this.postAuthenticatedCached('technical_admin_requests', 'list', { filters });
  },
  async getTechnicalAdminRequest(technicalRequestId) {
    return this.postAuthenticated('technical_admin_requests', 'get', {
      technical_request_id: technicalRequestId
    });
  },
  async updateTechnicalAdminRequestStatus(technicalRequestId, status, extra = {}) {
    return this.postAuthenticated('technical_admin_requests', 'update_status', {
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
    const response = await this.postAuthenticatedCached('invoices', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getInvoice(invoiceId) {
    return this.postAuthenticated('invoices', 'get', { invoice_id: invoiceId });
  },
  async createInvoice(invoice, items = []) {
    return this.postAuthenticated('invoices', 'create', { invoice, items });
  },
  async updateInvoice(invoiceId, updates = {}, items) {
    const payload = {
      invoice_id: invoiceId,
      updates
    };
    if (items !== undefined) payload.items = items;
    return this.postAuthenticated('invoices', 'update', payload);
  },
  async deleteInvoice(invoiceId) {
    return this.postAuthenticated('invoices', 'delete', { invoice_id: invoiceId });
  },
  async createInvoiceFromAgreement(agreementId) {
    return this.postAuthenticated('invoices', 'create_from_agreement', { agreement_id: agreementId });
  },
  async generateInvoiceHtml(invoiceId) {
    return this.postAuthenticated('invoices', 'generate_invoice_html', { invoice_id: invoiceId });
  },
  async listReceipts(filters = {}, options = {}) {
    const listPayload = this.buildSummaryListPayload(options);
    const payload = {
      filters: {
        ...(filters && typeof filters === 'object' ? filters : {}),
        ...listPayload
      }
    };
    const response = await this.postAuthenticatedCached('receipts', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getReceipt(receiptId) {
    return this.postAuthenticated('receipts', 'get', { receipt_id: receiptId });
  },
  async createReceipt(receipt, items = []) {
    return this.postAuthenticated('receipts', 'create', { receipt, items });
  },
  async updateReceipt(receiptId, updates = {}, items) {
    const payload = {
      receipt_id: receiptId,
      updates
    };
    if (items !== undefined) payload.items = items;
    return this.postAuthenticated('receipts', 'update', payload);
  },
  async deleteReceipt(receiptId) {
    return this.postAuthenticated('receipts', 'delete', { receipt_id: receiptId });
  },
  async createReceiptFromInvoice(invoiceId) {
    return this.postAuthenticated('receipts', 'create_from_invoice', { invoice_id: invoiceId });
  },
  async previewReceipt(receiptId) {
    return this.postAuthenticated('receipts', 'generate_receipt_html', { receipt_id: receiptId });
  },
  async listClients(options = {}) {
    const payload = this.buildSummaryListPayload(options);
    const response = await this.postAuthenticatedCached('clients', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getClient(clientId) {
    return this.postAuthenticated('clients', 'get', { client_id: clientId });
  },
  async createClient(client) {
    return this.postAuthenticated('clients', 'create', { client });
  },
  async createClientFromPayload(client) {
    return this.postAuthenticated('clients', 'create', { client });
  },
  async updateClient(clientId, updates) {
    return this.postAuthenticated('clients', 'update', {
      client_id: clientId,
      updates
    });
  },
  async deleteClient(clientId) {
    return this.postAuthenticated('clients', 'delete', { client_id: clientId });
  },
  async getClientAnalytics(clientId) {
    return this.postAuthenticated('clients', 'get_analytics', { client_id: clientId });
  },
  async analyticsSearchEntity(query, filters = {}) {
    return this.postAuthenticated('analytics', 'search_entity', { query, filters });
  },
  async analyticsGetLifecycle(entityId, filters = {}) {
    return this.postAuthenticated('analytics', 'get_lifecycle', { entity_id: entityId, filters });
  },
  async analyticsGetTimeline(entityId, filters = {}) {
    return this.postAuthenticated('analytics', 'get_timeline', { entity_id: entityId, filters });
  },
  async analyticsGetMetrics(entityId, filters = {}) {
    return this.postAuthenticated('analytics', 'get_metrics', { entity_id: entityId, filters });
  },
  async getClientTimeline(clientId) {
    return this.postAuthenticated('clients', 'get_timeline', { client_id: clientId });
  },
  async createProposalFromClient(clientId, payload = {}) {
    return this.postAuthenticated('clients', 'create_proposal', {
      client_id: clientId,
      ...payload
    });
  },
  async createAgreementFromClient(clientId, payload = {}) {
    return this.postAuthenticated('clients', 'create_agreement', {
      client_id: clientId,
      ...payload
    });
  },
  async createInvoiceFromClient(clientId, payload = {}) {
    return this.postAuthenticated('clients', 'create_invoice', {
      client_id: clientId,
      ...payload
    });
  },
  async createFromPreviousAgreement(clientId, agreementId, flow = 'agreement') {
    return this.postAuthenticated('clients', 'create_from_previous_agreement', {
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
    return this.postAuthenticated('notifications', 'list', payload);
  },
  async getNotificationUnreadCount() {
    const response = await this.postAuthenticated('notifications', 'get_unread_count', {});
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
    return this.postAuthenticated('notifications', 'mark_read', {
      notification_id: notificationId
    });
  },
  async markAllNotificationsRead() {
    return this.postAuthenticated('notifications', 'mark_all_read', {});
  },
  async listRoles(options = {}) {
    const payload = {
      ...this.buildSummaryListPayload(options),
      sheetName: CONFIG.ROLES_SHEET_NAME
    };
    const response = await this.postAuthenticatedCached('roles', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getRole(roleIdOrKey) {
    return this.postAuthenticated('roles', 'get', {
      role_id: roleIdOrKey,
      role_key: roleIdOrKey,
      sheetName: CONFIG.ROLES_SHEET_NAME
    });
  },
  async createRole(payload = {}) {
    return this.postAuthenticated('roles', 'create', {
      role: payload,
      ...payload,
      sheetName: CONFIG.ROLES_SHEET_NAME
    });
  },
  async updateRole(roleIdOrKey, updates = {}) {
    return this.postAuthenticated('roles', 'update', {
      role_id: roleIdOrKey,
      role_key: roleIdOrKey,
      updates,
      role: { role_key: roleIdOrKey, ...updates },
      sheetName: CONFIG.ROLES_SHEET_NAME
    });
  },
  async deleteRole(roleIdOrKey) {
    return this.postAuthenticated('roles', 'delete', {
      role_id: roleIdOrKey,
      role_key: roleIdOrKey,
      sheetName: CONFIG.ROLES_SHEET_NAME
    });
  },
  async listRolePermissions(options = {}) {
    const payload = {
      ...this.buildSummaryListPayload(options),
      sheetName: CONFIG.ROLE_PERMISSIONS_SHEET_NAME
    };
    const response = await this.postAuthenticatedCached('role_permissions', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getRolePermission(permissionId) {
    return this.postAuthenticated('role_permissions', 'get', {
      permission_id: permissionId,
      sheetName: CONFIG.ROLE_PERMISSIONS_SHEET_NAME
    });
  },
  async createRolePermission(payload = {}) {
    return this.postAuthenticated('role_permissions', 'create', {
      permission: payload,
      ...payload,
      sheetName: CONFIG.ROLE_PERMISSIONS_SHEET_NAME
    });
  },
  async updateRolePermission(permissionId, updates = {}) {
    return this.postAuthenticated('role_permissions', 'update', {
      permission_id: permissionId,
      updates,
      permission: { permission_id: permissionId, ...updates },
      sheetName: CONFIG.ROLE_PERMISSIONS_SHEET_NAME
    });
  },
  async saveRolePermission(payload = {}) {
    return this.postAuthenticated('role_permissions', 'save', {
      permission: payload,
      ...payload,
      sheetName: CONFIG.ROLE_PERMISSIONS_SHEET_NAME
    });
  },
  async deleteRolePermission(permissionId) {
    return this.postAuthenticated('role_permissions', 'delete', {
      permission_id: permissionId,
      sheetName: CONFIG.ROLE_PERMISSIONS_SHEET_NAME
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
  async listWorkflowRules(filters = {}, options = {}) {
    const response = await this.postAuthenticated('workflow', 'list', {
      filters,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    }, options);
    this.debugWorkflowResponse('list rules response', response);
    return response;
  },
  async getWorkflowRule(workflowRuleId) {
    return this.postAuthenticated('workflow', 'get', {
      workflow_rule_id: workflowRuleId,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    });
  },
  async saveWorkflowRule(rule = {}) {
    const body = {
      rule,
      ...rule,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    };
    try {
      return await this.postAuthenticated('workflow', 'save_rule', body);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      const looksLikeAliasMismatch = /unknown workflow action|unknown action|not found|unsupported/.test(message);
      if (!looksLikeAliasMismatch) throw error;
      return this.postAuthenticated('workflow', 'save', body);
    }
  },
  async deleteWorkflowRule(workflowRuleId) {
    const body = {
      workflow_rule_id: workflowRuleId,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    };
    try {
      return await this.postAuthenticated('workflow', 'delete_rule', body);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      const looksLikeAliasMismatch = /unknown workflow action|unknown action|not found|unsupported/.test(message);
      if (!looksLikeAliasMismatch) throw error;
      return this.postAuthenticated('workflow', 'delete', body);
    }
  },
  async validateWorkflowTransition(payload = {}) {
    const targetResource = String(
      payload?.target_workflow_resource ||
      payload?.target_resource ||
      payload?.workflow_resource ||
      payload?.resource ||
      ''
    ).trim();
    return this.postAuthenticated('workflow', 'validate_transition', {
      ...payload,
      resource: undefined,
      target_workflow_resource: targetResource,
      target_resource: targetResource,
      workflow_resource: targetResource,
      sheetName: CONFIG.WORKFLOW_RULES_SHEET_NAME
    });
  },
  async requestWorkflowApproval(payload = {}) {
    return this.postAuthenticated('workflow', 'request_approval', {
      ...payload,
      sheetName: CONFIG.WORKFLOW_APPROVALS_SHEET_NAME
    });
  },
  async approveWorkflowRequest(payload = {}) {
    return this.postAuthenticated('workflow', 'approve', {
      ...payload,
      sheetName: CONFIG.WORKFLOW_APPROVALS_SHEET_NAME
    });
  },
  async rejectWorkflowRequest(payload = {}) {
    return this.postAuthenticated('workflow', 'reject', {
      ...payload,
      sheetName: CONFIG.WORKFLOW_APPROVALS_SHEET_NAME
    });
  },
  async listPendingWorkflowApprovals(filters = {}) {
    return this.postAuthenticated('workflow', 'list_pending_approvals', {
      filters,
      sheetName: CONFIG.WORKFLOW_APPROVALS_SHEET_NAME
    });
  },
  async listWorkflowAudit(filters = {}) {
    return this.postAuthenticated('workflow', 'list_audit', {
      filters,
      sheetName: CONFIG.WORKFLOW_AUDIT_LOG_SHEET_NAME
    });
  },
};

async function apiPost(payload = {}) {
  const endpoint = Api.ensureBaseUrl();
  const requestBody = payload && typeof payload === 'object' ? payload : {};
  const resource = String(requestBody?.resource || '').trim();
  const action = String(requestBody?.action || '').trim();
  if (isDevEnvironment()) {
    console.log('[api] post', { endpoint, resource, action });
  }
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    throw buildNetworkRequestError(endpoint, error);
  }

  const { data } = await readAppsScriptResponse(response, {
    sourceName: `Backend ${requestBody.resource || 'api'}`,
    endpoint,
    resource,
    action
  });
  if (!response.ok) {
    throw buildHttpResponseError(response, data, endpoint, { resource, action });
  }
  if (data && typeof data === 'object' && hasExplicitBackendFailure(data)) {
    throw buildExplicitBackendFailureError(data, {
      endpoint,
      resource,
      action,
      status: response.status
    });
  }
  if (data && typeof data === 'object' && 'data' in data && data.data !== undefined) {
    return data.data;
  }
  return data;
}

function isDevEnvironment() {
  try {
    if (window?.RUNTIME_CONFIG?.DEBUG_API === true) return true;
    const hostname = String(window?.location?.hostname || '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

async function readAppsScriptResponse(response, context = {}) {
  const sourceName = context?.sourceName || 'API';
  const rawText = await response.text();
  const data = parseAppsScriptJson(rawText, sourceName, context);
  return { data, rawText };
}

function parseAppsScriptJson(text, sourceName = 'API', context = {}) {
  if (!text || !String(text).trim()) return {};
  const raw = String(text).trim();

  try {
    return JSON.parse(raw);
  } catch {}

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = raw.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  const looksLikeHtml = /<!doctype html|<html[\s>]/i.test(raw);
  if (looksLikeHtml) {
    const endpoint = String(context?.endpoint || API_BASE_URL || '').trim();
    const resource = String(context?.resource || '').trim();
    const action = String(context?.action || '').trim();
    const err = new Error(
      `${sourceName} returned HTML instead of JSON. Check API_BASE_URL/proxy.` +
      (endpoint ? ` endpoint=${endpoint}.` : '') +
      (resource || action ? ` resource=${resource || '-'} action=${action || '-'}.` : '')
    );
    err.code = 'UPSTREAM_NON_JSON_HTML';
    throw err;
  }

  const err = new Error(
    `${sourceName} returned non-JSON response. ` +
    `${context?.resource || context?.action ? `resource=${context?.resource || '-'} action=${context?.action || '-'}. ` : ''}` +
    `Sample: ${raw.slice(0, 500)}`
  );
  err.code = 'UPSTREAM_NON_JSON';
  throw err;
}

function buildNetworkRequestError(url, originalError) {
  const rawMessage = String(originalError?.message || '').trim();
  const looksLikeCorsFailure =
    /failed to fetch|networkerror|load failed|err_failed/i.test(rawMessage);
  if (looksLikeCorsFailure) {
    return new Error(
        `Request to ${url} failed before a response was received. ` +
        'This is commonly caused by CORS (missing Access-Control-Allow-Origin) ' +
        'or an unreachable backend/proxy endpoint.'
    );
  }
  return new Error(rawMessage || `Network error while contacting ${url}.`);
}

function isOperationsOnboardingRowMissingError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('operations onboarding row not found for agreement') ||
    message.includes('onboarding row not found for agreement')
  );
}

function hasExplicitBackendFailure(data) {
  const normalizeBool = value => {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    return null;
  };
  const ok = normalizeBool(data?.ok);
  const success = normalizeBool(data?.success);
  return ok === false || success === false;
}

function buildExplicitBackendFailureError(data, context = {}) {
  const endpoint = String((context && context.endpoint) || API_BASE_URL || 'backend endpoint');
  const resource = String((context && context.resource) || (data && data.resource) || '').trim();
  const action = String((context && context.action) || (data && data.action) || '').trim();
  const status = Number((context && context.status) || (data && data.status) || 0);
  const errorCode = String((data && (data.error_code || data.code)) || '').trim();
  const backendMessage = String((data && (data.error || data.message)) || 'Backend request failed.').trim();

  const details = [
    status ? `Status: ${status}.` : '',
    resource || action ? `Request: resource=${resource || '-'} action=${action || '-'}.` : '',
    errorCode ? `Code: ${errorCode}.` : ''
  ].filter(Boolean).join(' ');

  return new Error(
    `${backendMessage}${details ? ` ${details}` : ''}${endpoint ? ` Endpoint: ${endpoint}.` : ''}`
  );
}

function buildHttpResponseError(response, data, endpoint, context = {}) {
  const status = Number(response?.status || 0);
  const statusText = String(response?.statusText || '').trim();
  const endpointLabel = String(endpoint || API_BASE_URL || 'backend endpoint');
  const backendMessage = String(data?.error || data?.message || '').trim();
  const resource = String(context?.resource || data?.resource || '').trim();
  const action = String(context?.action || data?.action || '').trim();
  const sample = String(
    data?.upstreamBodySample ||
      data?.sample ||
      data?.raw ||
      ''
  ).trim();

  if (status === 404) {
    const localProxyEndpoint = resolveApiEndpoint('/api/proxy');
    const isLocalProxy = endpointLabel === localProxyEndpoint;
    const upstreamStatus = Number(data?.upstreamStatus || 0);

    if (isLocalProxy && !upstreamStatus) {
      const err = new Error(
        `HTTP 404 from ${endpointLabel}. Local /api/proxy route is missing. ` +
        'Deploy api/proxy.js (Vercel function) or set API_BASE_URL to a reachable backend endpoint.'
      );
      err.code = 'MISSING_PROXY_ROUTE';
      return err;
    }

    if (upstreamStatus === 404) {
      const err = new Error(
        `HTTP 404 from ${endpointLabel}. Proxy route exists, but upstream Apps Script returned 404. ` +
        'Check APPS_SCRIPT_WEBAPP_URL and Apps Script deployment path.'
      );
      err.code = 'UPSTREAM_404';
      return err;
    }

    const err = new Error(
      `HTTP 404 from ${endpointLabel}. Login/auth routes were not found on the configured backend. ` +
      'Verify API_BASE_URL points to a backend/proxy that implements auth.'
    );
    err.code = 'AUTH_ROUTE_404';
    return err;
  }

  const details = [
    `HTTP ${status || 'error'}${statusText ? ` ${statusText}` : ''} from ${endpointLabel}.`,
    resource || action ? `Request: resource=${resource || '-'} action=${action || '-'}.` : '',
    data?.upstreamStatus ? `Upstream status: ${data.upstreamStatus}.` : '',
    backendMessage ? `Backend message: ${backendMessage}.` : '',
    data?.details ? `Details: ${String(data.details).slice(0, 500)}.` : '',
    sample ? `Upstream sample: ${sample.slice(0, 500)}` : ''
  ]
    .filter(Boolean)
    .join(' ');
  if (details) return new Error(details);

  return new Error(
    `HTTP ${status || 'error'}${statusText ? ` ${statusText}` : ''} from ${endpointLabel}.`
  );
}
