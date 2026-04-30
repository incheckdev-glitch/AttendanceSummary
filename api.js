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
const WEB_PUSH_FUNCTION_NAME = 'send-web-push-v2';
const BACKEND_MANAGED_PWA_ACTIONS = new Set([
  'leads:lead_created',
  'deals:deal_created',
  'deals:deal_created_from_lead',
  'deals:deal_important_stage',
  'deals:deal_stage_changed',
  'proposals:proposal_created',
  'proposals:proposal_created_from_deal',
  'proposals:proposal_requires_approval',
  'proposals:proposal_status_changed',
  'agreements:agreement_created',
  'agreements:agreement_created_from_proposal',
  'agreements:agreement_signed',
  'invoices:invoice_created',
  'invoices:invoice_created_from_agreement',
  'invoices:invoice_payment_updated',
  'invoices:invoice_payment_state_changed',
  'receipts:receipt_created',
  'receipts:receipt_created_from_invoice',
  'operations_onboarding:onboarding_created',
  'operations_onboarding:onboarding_status_changed',
  'operations_onboarding:operations_onboarding_created',
  'technical_admin_requests:technical_request_submitted',
  'technical_admin_requests:technical_request_status_changed'
]);

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
    const page = U.normalizePageNumber(safeState.currentPage || safeState.page || 1, 1);
    const limit = U.normalizePageSize(safeState.pageSize || safeState.limit || 50, 50, 200);
    const payload = {
      resource,
      action: action || 'list',
      page,
      limit,
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

    const limit = U.normalizePageSize(payload?.limit ?? payload?.page_size ?? payload?.meta?.limit, 50, 200);
    const page = U.normalizePageNumber(payload?.page ?? payload?.current_page ?? payload?.meta?.page, 1);
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
      hasPreviousPage: page > 1,
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
    const safeOptions = options && typeof options === 'object' ? options : {};
    const requireAuth = safeOptions.requireAuth !== false;
    let token = await this.getCurrentAccessToken();
    if (requireAuth && !token) {
      throw new Error('Your session expired. Please log in again.');
    }
    return this.request(resource, action, { ...payload, authToken: token || undefined });
  },
  async getCurrentAccessToken() {
    if (window.SupabaseClient?.getClient) {
      try {
        const client = window.SupabaseClient.getClient();
        const { data, error } = await client.auth.getSession();
        if (!error && data?.session?.access_token) {
          const freshToken = String(data.session.access_token || '').trim();
          if (window.Session?.state) {
            window.Session.state.session = data.session;
            window.Session.state.access_token = freshToken;
          }
          return freshToken;
        }
      } catch {}
    }

    if (window.supabase?.auth?.getSession) {
      try {
        const { data, error } = await window.supabase.auth.getSession();
        if (!error && data?.session?.access_token) {
          const freshToken = String(data.session.access_token || '').trim();
          if (window.Session?.state) {
            window.Session.state.session = data.session;
            window.Session.state.access_token = freshToken;
          }
          return freshToken;
        }
      } catch {}
    }

    const sessionState = window.Session?.state || Session?.state || {};
    const tokenFromState = String(
      sessionState?.session?.access_token ||
      sessionState?.access_token ||
      ''
    ).trim();
    if (tokenFromState) return tokenFromState;

    const tokenFromAccessTokenFn = String(
      window.Session?.accessToken?.() ||
      Session?.accessToken?.() ||
      ''
    ).trim();
    if (tokenFromAccessTokenFn) return tokenFromAccessTokenFn;

    const tokenFromSessionUser = String(
      window.Session?.user?.()?.session?.access_token ||
      Session?.user?.()?.session?.access_token ||
      ''
    ).trim();
    if (tokenFromSessionUser) return tokenFromSessionUser;

    return '';
  },
 
  async sendWebPush(payload = {}, { context = 'unspecified' } = {}) {
    const client = window.SupabaseClient?.getClient?.();
    if (!client) return null;
    try {
      const { data, error } = await client.functions.invoke(WEB_PUSH_FUNCTION_NAME, {
        body: payload && typeof payload === 'object' ? payload : {}
      });
      if (error) {
        console.warn(`[push] ${context} failed`, error);
        return null;
      }
      return data || null;
    } catch (error) {
      console.warn(`[push] ${context} failed`, error);
      return null;
    }
  },
  fireAndForgetWebPush(payload = {}, options = {}) {
    Promise.resolve()
      .then(() => this.sendWebPush(payload, options))
      .catch(error => console.warn('[push] fireAndForgetWebPush failed', error));
  },
  extractBusinessRecordId(response, fallback = '') {
    const payload = this.unwrapApiPayload(response) || response || {};
    const nested = payload && typeof payload === 'object' ? (payload.data || payload.result || payload.item || payload.record || payload.row || payload.operations_onboarding || payload.technical_request || payload.invoice || payload.receipt || payload.agreement || payload.proposal || payload.deal || payload.lead || null) : null;
    const source = nested && typeof nested === 'object' ? { ...payload, ...nested } : payload;
    const candidates = [
      source?.id, source?.uuid, source?.record_id, source?.ticket_id, source?.lead_id, source?.deal_id, source?.proposal_id, source?.agreement_id, source?.invoice_id, source?.receipt_id, source?.onboarding_id, source?.technical_request_id, fallback
    ];
    return String(candidates.find(value => value !== undefined && value !== null && String(value).trim()) || '').trim();
  },
  async sendBusinessPwaPush({ resource = '', action = '', eventKey = '', recordId = '', title = '', body = '', roles = ['admin'], userIds = [], targetEmails = [], url = '', data = {}, recordNumber = '' } = {}) {
    if (window.NotificationService?.sendBusinessNotification) {
      return window.NotificationService.sendBusinessNotification({
        resource,
        action,
        eventKey,
        recordId,
        recordNumber,
        title,
        body,
        targetUsers: userIds,
        targetEmails,
        url,
        metadata: data,
        roles,
        channels: ['in_app', 'push']
      });
    }
    const directFallbackKey = String(resource || '').trim().toLowerCase() + ':' + String(action || '').trim().toLowerCase();
    const notificationSetupManagedFallbacks = new Set([
      'tickets:dev_team_status_changed',
      'tickets:ticket_dev_team_status_changed'
    ]);
    if (notificationSetupManagedFallbacks.has(directFallbackKey)) {
      console.info('[business:pwa] skipped direct fallback for notification-setup managed action', { resource, action, recordId });
      return { attempted: false, skipped: true, reason: 'notification-service-unavailable-managed-action' };
    }
    return this.sendWebPush({ resource, action, record_id: recordId, title, body, url, data, roles, user_ids: userIds, emails: targetEmails }, { context: String(resource || '') + ':' + String(action || '') + ':direct-fallback' });
  },
  shouldSkipDirectBusinessPwaPush(args = {}) {
    const resource = String(args?.resource || '').trim().toLowerCase();
    const action = String(args?.action || '').trim().toLowerCase();
    if (!resource || !action) return false;
    if (resource === 'events') return false;
    return BACKEND_MANAGED_PWA_ACTIONS.has(`${resource}:${action}`);
  },
  async safeSendBusinessPwaPush(args = {}) {
    if (this.shouldSkipDirectBusinessPwaPush(args)) {
      console.info('[business:pwa] skipped duplicate direct PWA push; backend notification already handles it', {
        resource: args?.resource,
        action: args?.action,
        recordId: args?.recordId
      });
      return { attempted: false, skipped: true, reason: 'backend-managed-notification' };
    }
    try { return await this.sendBusinessPwaPush(args); }
    catch (error) {
      console.warn('[business:pwa] direct PWA push failed but save will continue', { args, error });
      return { attempted: true, sent: false, error: String(error?.message || error) };
    }
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
    const payload = this.buildSummaryListPayload(options);
    ['section', 'is_active', 'category'].forEach(key => {
      const value = options?.[key];
      if (value !== undefined && value !== null && value !== '') payload[key] = value;
    });
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
    const response = await this.requestWithSession('agreements', 'create', { agreement, items });
    const recordId = this.extractBusinessRecordId(response, agreement?.agreement_id || agreement?.agreement_number || '');
    await this.safeSendBusinessPwaPush({
      resource: 'agreements',
      action: 'agreement_created',
      recordId,
      title: 'Agreement created',
      body: 'Agreement ' + (agreement?.agreement_number || recordId || '') + ' was created.',
      roles: ['admin', 'hoo'],
      url: recordId ? '/#agreements?id=' + encodeURIComponent(recordId) : '/#agreements'
    });
    return response;
  },
  async updateAgreement(agreementId, updates, items = []) {
    const response = await this.requestWithSession('agreements', 'update', {
      id: agreementId,
      updates,
      items
    });
    const status = String(updates?.status || updates?.agreement_status || '').trim().toLowerCase();
    const action = status.includes('signed') ? 'agreement_signed' : 'agreement_updated';
    await this.safeSendBusinessPwaPush({
      resource: 'agreements',
      action,
      recordId: this.extractBusinessRecordId(response, agreementId),
      title: action === 'agreement_signed' ? 'Agreement signed' : 'Agreement updated',
      body: 'Agreement ' + (agreementId || '') + ' was updated.',
      roles: action === 'agreement_signed' ? ['admin', 'hoo', 'accounting'] : ['admin', 'hoo'],
      url: agreementId ? '/#agreements?id=' + encodeURIComponent(agreementId) : '/#agreements'
    });
    return response;
  },
  async deleteAgreement(agreementId) {
    return this.requestWithSession('agreements', 'delete', { id: agreementId });
  },
  async createAgreementFromProposal(proposalId) {
    const response = await this.requestWithSession('agreements', 'create_from_proposal', { proposal_uuid: proposalId });
    const recordId = this.extractBusinessRecordId(response, proposalId);
    await this.safeSendBusinessPwaPush({
      resource: 'agreements',
      action: 'agreement_created_from_proposal',
      recordId,
      title: 'Agreement created from proposal',
      body: 'Agreement was created from proposal ' + (proposalId || '') + '.',
      roles: ['admin', 'hoo'],
      url: recordId ? '/#agreements?id=' + encodeURIComponent(recordId) : '/#agreements'
    });
    return response;
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
      const response = await this.requestWithSession('agreements', 'request_incheck_lite', payload);
      await this.safeSendBusinessPwaPush({
        resource: 'operations_onboarding',
        action: 'onboarding_request_submitted',
        recordId: agreementId,
        title: 'InCheck360 Operations Request',
        body: 'Operations onboarding request submitted for agreement ' + agreementId + '.',
        roles: ['admin', 'hoo'],
        url: agreementId ? '/#operations_onboarding?id=' + encodeURIComponent(agreementId) : '/#operations_onboarding',
        data: { agreement_id: agreementId, type: 'incheck_lite' }
      });
      return response;
    } catch (error) {
      if (!isOperationsOnboardingRowMissingError(error)) throw error;
      await this.saveOperationsOnboarding({
        agreement_id: agreementId
      });
      const response = await this.requestWithSession('agreements', 'request_incheck_lite', payload);
      await this.safeSendBusinessPwaPush({
        resource: 'operations_onboarding',
        action: 'onboarding_request_submitted',
        recordId: agreementId,
        title: 'InCheck360 Operations Request',
        body: 'Operations onboarding request submitted for agreement ' + agreementId + '.',
        roles: ['admin', 'hoo'],
        url: agreementId ? '/#operations_onboarding?id=' + encodeURIComponent(agreementId) : '/#operations_onboarding',
        data: { agreement_id: agreementId, type: 'incheck_lite' }
      });
      return response;
    }
  },
  async requestAgreementIncheckFull(agreementId) {
    const payload = {
      agreement_id: agreementId
    };
    try {
      const response = await this.requestWithSession('agreements', 'request_incheck_full', payload);
      await this.safeSendBusinessPwaPush({
        resource: 'operations_onboarding',
        action: 'onboarding_request_submitted',
        recordId: agreementId,
        title: 'InCheck360 Operations Request',
        body: 'Operations onboarding request submitted for agreement ' + agreementId + '.',
        roles: ['admin', 'hoo'],
        url: agreementId ? '/#operations_onboarding?id=' + encodeURIComponent(agreementId) : '/#operations_onboarding',
        data: { agreement_id: agreementId, type: 'incheck_full' }
      });
      return response;
    } catch (error) {
      if (!isOperationsOnboardingRowMissingError(error)) throw error;
      await this.saveOperationsOnboarding({
        agreement_id: agreementId
      });
      const response = await this.requestWithSession('agreements', 'request_incheck_full', payload);
      await this.safeSendBusinessPwaPush({
        resource: 'operations_onboarding',
        action: 'onboarding_request_submitted',
        recordId: agreementId,
        title: 'InCheck360 Operations Request',
        body: 'Operations onboarding request submitted for agreement ' + agreementId + '.',
        roles: ['admin', 'hoo'],
        url: agreementId ? '/#operations_onboarding?id=' + encodeURIComponent(agreementId) : '/#operations_onboarding',
        data: { agreement_id: agreementId, type: 'incheck_full' }
      });
      return response;
    }
  },
  async requestAgreementTechnicalAdmin(agreementId, message = '') {
    const normalizedAgreementId = String(agreementId || '').trim();
    if (!normalizedAgreementId) throw new Error('Agreement ID is required.');
    console.log('[operations onboarding] technical admin agreement', normalizedAgreementId);
    const norm = value => String(value || '').trim().toLowerCase();
    const same = (a, b) => Boolean(norm(a) && norm(b) && norm(a) === norm(b));
    const pickFirst = (...values) => {
      for (const value of values) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (String(value).trim() !== '') return value;
      }
      return '';
    };
    const parseCount = (...values) => {
      for (const value of values) {
        if (value === undefined || value === null || String(value).trim() === '') continue;
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      return null;
    };
    const isSaasAnnualItem = item => {
      const text = [
        item?.item_name,
        item?.product_name,
        item?.service_name,
        item?.description,
        item?.category,
        item?.billing_frequency,
        item?.billing_cycle
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return text.includes('saas') && text.includes('annual');
    };

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
    let agreement = {};
    try {
      const agreementResponse = await this.getAgreement(normalizedAgreementId);
      const agreementPayload = this.unwrapApiPayload(agreementResponse) || agreementResponse || {};
      if (Array.isArray(agreementPayload)) {
        agreement = agreementPayload.find(item => item && typeof item === 'object') || {};
      } else if (agreementPayload && typeof agreementPayload === 'object') {
        agreement = agreementPayload.agreement && typeof agreementPayload.agreement === 'object'
          ? agreementPayload.agreement
          : agreementPayload;
      }
    } catch (error) {
      console.warn('[technical admin] unable to fetch agreement for request seed', normalizedAgreementId, error);
    }
    const agreementIdTokens = [...new Set([normalizedAgreementId, agreement?.id, agreement?.agreement_id].map(value => String(value || '').trim()).filter(Boolean))];
    const agreementNumberTokens = [...new Set([agreement?.agreement_number, agreement?.number, agreement?.agreement_code].map(value => String(value || '').trim()).filter(Boolean))];
    let linkedAgreementItems = Array.isArray(agreement?.agreement_items) ? agreement.agreement_items : [];
    const client = window.SupabaseClient?.getClient?.();
    if (client) {
      const itemQueries = [];
      if (agreementIdTokens.length) {
        itemQueries.push(client.from('agreement_items').select('*').in('agreement_id', agreementIdTokens));
        itemQueries.push(client.from('agreement_items').select('*').in('parent_id', agreementIdTokens));
      }
      if (agreementNumberTokens.length) {
        itemQueries.push(client.from('agreement_items').select('*').in('agreement_number', agreementNumberTokens));
        itemQueries.push(client.from('agreement_items').select('*').in('parent_number', agreementNumberTokens));
      }
      if (itemQueries.length) {
        const itemResults = await Promise.all(itemQueries);
        itemResults.forEach(result => {
          if (result?.error) {
            console.warn('[technical admin] agreement item seed enrichment failed', result.error);
            return;
          }
          if (Array.isArray(result?.data) && result.data.length) linkedAgreementItems = linkedAgreementItems.concat(result.data);
        });
      }
    }
    const linkedItems = linkedAgreementItems.filter(item => {
      const itemAgreementId = String(item?.agreement_id || item?.parent_id || '').trim();
      const itemAgreementNumber = String(item?.agreement_number || item?.parent_number || '').trim();
      return (
        agreementIdTokens.some(token => same(token, itemAgreementId)) ||
        agreementNumberTokens.some(token => same(token, itemAgreementNumber))
      );
    });
    const saasAnnualCount = linkedItems.filter(isSaasAnnualItem).length;
    const locationCount = parseCount(
      agreement?.number_of_locations,
      agreement?.locations_count,
      agreement?.location_count,
      saasAnnualCount || '',
      linkedItems.length
    );
    const serviceStartDate = String(
      pickFirst(
        agreement?.service_start_date,
        agreement?.contract_start_date,
        agreement?.start_date,
        agreement?.agreement_start_date,
        linkedItems.map(item => String(item?.service_start_date || '').trim()).filter(Boolean).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
      )
    ).trim();
    const serviceEndDate = String(
      pickFirst(
        agreement?.service_end_date,
        agreement?.contract_end_date,
        agreement?.end_date,
        agreement?.valid_until,
        linkedItems.map(item => String(item?.service_end_date || '').trim()).filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      )
    ).trim();
    const billingFrequency = String(pickFirst(agreement?.billing_frequency, agreement?.billing_cycle, agreement?.billing_period)).trim();
    const paymentTerm = String(pickFirst(agreement?.payment_term, agreement?.payment_terms)).trim();
    const assignedTo = String(pickFirst(agreement?.assigned_to, agreement?.owner, agreement?.created_by)).trim();
    const agreementNumber = String(pickFirst(agreement?.agreement_number, agreement?.number, agreement?.agreement_code)).trim();
    const clientName = String(pickFirst(agreement?.client_name, agreement?.company_name, agreement?.customer_name)).trim();
    const clientId = String(pickFirst(agreement?.client_id, agreement?.customer_id, agreement?.company_id)).trim();

    const requestFields = {
      agreement_id: normalizedAgreementId,
      agreement_number: agreementNumber || null,
      client_id: clientId || null,
      client_name: clientName || null,
      number_of_locations: locationCount,
      service_start_date: serviceStartDate || null,
      service_end_date: serviceEndDate || null,
      billing_frequency: billingFrequency || null,
      payment_term: paymentTerm || null,
      assigned_to: assignedTo || null,
      technical_request_type: 'Technical Admin',
      technical_request_details: technicalRequestDetails,
      technical_request_status: 'Requested',
      request_status: 'Requested',
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
          agreement_number: agreementNumber || null,
          client_id: clientId || null,
          client_name: clientName || null,
          number_of_locations: locationCount,
          service_start_date: serviceStartDate || null,
          service_end_date: serviceEndDate || null,
          billing_frequency: billingFrequency || null,
          payment_term: paymentTerm || null,
          assigned_to: assignedTo || null,
          onboarding_id: onboardingPayload?.onboarding_id || onboardingPayload?.id || null,
          technical_request_type: 'Technical Admin',
          technical_request_details: technicalRequestDetails,
          technical_request_status: 'Requested',
          request_status: 'Requested',
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

    await this.safeSendBusinessPwaPush({
      resource: 'technical_admin_requests',
      action: 'technical_request_submitted',
      recordId: normalizedAgreementId,
      title: 'InCheck360 Technical Admin Request',
      body: 'Technical admin request submitted for agreement ' + normalizedAgreementId + '.',
      roles: ['admin', 'dev', 'hoo'],
      url: normalizedAgreementId ? '/#technical_admin_requests?id=' + encodeURIComponent(normalizedAgreementId) : '/#technical_admin_requests',
      data: { agreement_id: normalizedAgreementId }
    });

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
      table: CONFIG.OPERATIONS_ONBOARDING_TABLE
    }, {
      forceRefresh: options?.forceRefresh === true
    });
  },
  async getOperationsOnboarding(payload = {}) {
    return this.requestWithSession('operations_onboarding', 'get', {
      ...payload,
      table: CONFIG.OPERATIONS_ONBOARDING_TABLE
    });
  },
  async saveOperationsOnboarding(onboarding = {}) {
    const response = await this.requestWithSession('operations_onboarding', 'save', {
      onboarding,
      table: CONFIG.OPERATIONS_ONBOARDING_TABLE
    });
    const recordId = this.extractBusinessRecordId(response, onboarding?.onboarding_id || onboarding?.agreement_id || '');
    await this.safeSendBusinessPwaPush({
      resource: 'operations_onboarding',
      action: 'onboarding_created',
      recordId,
      title: 'Operations onboarding created',
      body: 'Operations onboarding was created.',
      roles: ['admin', 'hoo'],
      url: recordId ? '/#operations_onboarding?id=' + encodeURIComponent(recordId) : '/#operations_onboarding'
    });
    return response;
  },
  async updateOperationsOnboarding(onboardingId, updates = {}) {
    const safeUpdates = updates && typeof updates === 'object' ? { ...updates } : {};
    delete safeUpdates.id;
    delete safeUpdates.db_id;
    delete safeUpdates.record_id;
    const response = await this.requestWithSession('operations_onboarding', 'update', {
      id: onboardingId,
      updates: safeUpdates,
      table: CONFIG.OPERATIONS_ONBOARDING_TABLE
    });
    const hasStatus = Object.prototype.hasOwnProperty.call(safeUpdates, 'onboarding_status') || Object.prototype.hasOwnProperty.call(safeUpdates, 'status');
    await this.safeSendBusinessPwaPush({
      resource: 'operations_onboarding',
      action: hasStatus ? 'onboarding_status_changed' : 'onboarding_updated',
      recordId: this.extractBusinessRecordId(response, onboardingId),
      title: hasStatus ? 'Onboarding status changed' : 'Onboarding updated',
      body: 'Operations onboarding ' + (onboardingId || '') + ' was updated.',
      roles: ['admin', 'hoo'],
      url: onboardingId ? '/#operations_onboarding?id=' + encodeURIComponent(onboardingId) : '/#operations_onboarding'
    });
    return response;
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
    const response = await this.requestWithSession('technical_admin_requests', 'update_status', {
      id: technicalRequestId,
      technical_request_id: technicalRequestId,
      request_status: status,
      ...(extra && typeof extra === 'object' ? extra : {})
    });
    await this.safeSendBusinessPwaPush({
      resource: 'technical_admin_requests',
      action: 'technical_request_status_changed',
      recordId: this.extractBusinessRecordId(response, technicalRequestId),
      title: 'Technical request status changed',
      body: 'Technical request ' + (technicalRequestId || '') + ' status changed to ' + (status || 'updated') + '.',
      roles: ['admin', 'dev', 'hoo'],
      url: technicalRequestId ? '/#technical_admin_requests?id=' + encodeURIComponent(technicalRequestId) : '/#technical_admin_requests'
    });
    return response;
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
    const response = await this.requestWithSession('invoices', 'create', { invoice, items });
    const recordId = this.extractBusinessRecordId(response, invoice?.invoice_id || invoice?.invoice_number || '');
    await this.safeSendBusinessPwaPush({
      resource: 'invoices',
      action: 'invoice_created',
      recordId,
      title: 'Invoice created',
      body: 'Invoice ' + (invoice?.invoice_number || recordId || '') + ' was created.',
      roles: ['admin', 'accounting'],
      url: recordId ? '/#invoices?id=' + encodeURIComponent(recordId) : '/#invoices'
    });
    return response;
  },
  async updateInvoice(invoiceId, updates = {}, items) {
    const payload = {
      id: invoiceId,
      invoice_id: invoiceId,
      updates
    };
    if (items !== undefined) payload.items = items;
    const response = await this.requestWithSession('invoices', 'update', payload);
    const paymentKeys = ['amount_paid', 'paid_amount', 'payment_status', 'payment_state', 'pending_amount', 'balance_due'];
    const isPaymentUpdate = paymentKeys.some(key => Object.prototype.hasOwnProperty.call(updates || {}, key));
    await this.safeSendBusinessPwaPush({
      resource: 'invoices',
      action: isPaymentUpdate ? 'invoice_payment_updated' : 'invoice_updated',
      recordId: this.extractBusinessRecordId(response, invoiceId),
      title: isPaymentUpdate ? 'Invoice payment updated' : 'Invoice updated',
      body: 'Invoice ' + (invoiceId || '') + ' was updated.',
      roles: ['admin', 'accounting'],
      url: invoiceId ? '/#invoices?id=' + encodeURIComponent(invoiceId) : '/#invoices'
    });
    return response;
  },
  async deleteInvoice(invoiceId) {
    return this.requestWithSession('invoices', 'delete', { id: invoiceId, invoice_id: invoiceId });
  },
  async createInvoiceFromAgreement(agreementId) {
    const response = await this.requestWithSession('invoices', 'create_from_agreement', { id: agreementId, agreement_id: agreementId });
    const recordId = this.extractBusinessRecordId(response, agreementId);
    await this.safeSendBusinessPwaPush({
      resource: 'invoices',
      action: 'invoice_created_from_agreement',
      recordId,
      title: 'Invoice created from agreement',
      body: 'Invoice was created from agreement ' + (agreementId || '') + '.',
      roles: ['admin', 'accounting'],
      url: recordId ? '/#invoices?id=' + encodeURIComponent(recordId) : '/#invoices'
    });
    return response;
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
    const response = await this.requestWithSession('receipts', 'create', { receipt, items });
    const recordId = this.extractBusinessRecordId(response, receipt?.receipt_id || receipt?.receipt_number || '');
    await this.safeSendBusinessPwaPush({
      resource: 'receipts',
      action: 'receipt_created',
      recordId,
      title: 'Receipt created',
      body: 'Receipt ' + (receipt?.receipt_number || recordId || '') + ' was created.',
      roles: ['admin', 'accounting'],
      url: recordId ? '/#receipts?id=' + encodeURIComponent(recordId) : '/#receipts'
    });
    return response;
  },
  async updateReceipt(receiptId, updates = {}, items) {
    const payload = {
      id: receiptId,
      receipt_id: receiptId,
      updates
    };
    if (items !== undefined) payload.items = items;
    const response = await this.requestWithSession('receipts', 'update', payload);
    await this.safeSendBusinessPwaPush({
      resource: 'receipts',
      action: 'receipt_updated',
      recordId: this.extractBusinessRecordId(response, receiptId),
      title: 'Receipt updated',
      body: 'Receipt ' + (receiptId || '') + ' was updated.',
      roles: ['admin', 'accounting'],
      url: receiptId ? '/#receipts?id=' + encodeURIComponent(receiptId) : '/#receipts'
    });
    return response;
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
    const response = await this.requestWithSession('receipts', 'create_from_invoice', payload);
    const recordId = this.extractBusinessRecordId(response, invoiceId);
    await this.safeSendBusinessPwaPush({
      resource: 'receipts',
      action: 'receipt_created_from_invoice',
      recordId,
      title: 'Receipt created from invoice',
      body: 'Receipt was created from invoice ' + (invoiceId || '') + '.',
      roles: ['admin', 'accounting'],
      url: recordId ? '/#receipts?id=' + encodeURIComponent(recordId) : '/#receipts'
    });
    return response;
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
    const safePage = U.normalizePageNumber(options.page ?? 1, 1);
    const safeLimit = U.normalizePageSize(options.limit ?? 50, 50, 200);
    const payload = {
      page: safePage,
      limit: safeLimit,
      sort_by: options.sort_by || options.sortBy || 'created_at',
      sort_dir: options.sort_dir || options.sortDir || 'desc',
      mode: options.mode || '',
      unread_only: options.unread_only === true,
      priority: options.priority || '',
      search: options.search || ''
    };
    if (options.filters && typeof options.filters === 'object') payload.filters = options.filters;
    const response = await this.requestWithSession('notifications', 'list', payload);
    return this.normalizeListResponse(response);
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
  async listNotificationSettings() {
    return this.requestWithSession('notification_settings', 'list', {});
  },
  async upsertNotificationSetting(rule = {}) {
    return this.requestWithSession('notification_settings', 'upsert', { rule });
  },
  async bulkUpsertNotificationSettings(rules = []) {
    return this.requestWithSession('notification_settings', 'bulk_upsert', { rules });
  },
  async resetNotificationSettingsDefaults() {
    return this.requestWithSession('notification_settings', 'reset_defaults', {});
  },
  async testNotificationSetting(rule = {}) {
    return this.requestWithSession('notification_settings', 'test_notification', { rule });
  },
  async listRoles(options = {}) {
    const payload = {
      ...this.buildSummaryListPayload(options),
      table: CONFIG.ROLES_TABLE
    };
    const response = await this.requestCached('roles', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    return this.normalizeListResponse(response);
  },
  async getRole(roleKey) {
    return this.requestWithSession('roles', 'get', {
      role_key: roleKey,
      table: CONFIG.ROLES_TABLE
    });
  },
  async createRole(payload = {}) {
    return this.requestWithSession('roles', 'create', {
      role: payload,
      ...payload,
      table: CONFIG.ROLES_TABLE
    });
  },
  async updateRole(roleKey, updates = {}) {
    return this.requestWithSession('roles', 'update', {
      role_key: roleKey,
      updates,
      role: { role_key: roleKey, ...updates },
      table: CONFIG.ROLES_TABLE
    });
  },
  async deleteRole(roleKey) {
    return this.requestWithSession('roles', 'delete', {
      role_key: roleKey,
      table: CONFIG.ROLES_TABLE
    });
  },
  async listRolePermissions(options = {}) {
    const payload = {
      ...this.buildSummaryListPayload(options)
    };
    const response = await this.requestCached('role_permissions', 'list', payload, {
      forceRefresh: options?.forceRefresh === true
    });
    const normalized = this.normalizeListResponse(response);
    const normalizeRows = rows => this.dedupeRolePermissionRows(Array.isArray(rows) ? rows : []);
    return Array.isArray(normalized)
      ? normalizeRows(normalized)
      : normalized && typeof normalized === 'object'
        ? {
            ...normalized,
            rows: normalizeRows(normalized.rows),
            items: normalizeRows(normalized.items),
            data: normalizeRows(normalized.data)
          }
        : normalized;
  },
  async getRolePermission(permissionId) {
    return this.requestWithSession('role_permissions', 'get', {
      permission_id: permissionId
    });
  },
  normalizePermissionKey(value) {
    return String(value || '').trim().toLowerCase();
  },
  normalizeAllowedRolesText(value) {
    if (Array.isArray(value)) {
      return value
        .map(role => String(role || '').trim().toLowerCase())
        .filter(Boolean)
        .join(',');
    }
    return String(value || '')
      .split(',')
      .map(role => String(role || '').trim().toLowerCase())
      .filter(Boolean)
      .join(',');
  },
  VALID_PERMISSION_RESOURCES: new Set([
    'tickets', 'events', 'leads', 'deals', 'proposals', 'agreements', 'invoices', 'receipts', 'clients',
    'csm_activities', 'operations_onboarding', 'technical_admin', 'workflow', 'notifications', 'ai_insights',
    'users', 'roles', 'role_permissions', 'analytics'
    , 'notification_settings'
  ]),
  VALID_PERMISSION_ACTIONS: new Set([
    'view',
    'get',
    'list',
    'create',
    'save',
    'update',
    'edit',
    'delete',
    'manage',
    'export',
    'approve',
    'reject',
    'request',
    'assign',
    'internal_filters',
    'bulk_update',
    'convert',
    'preview',
    'download',
    'send',
    'mark_read',
    'mark_unread'
  ]),
  permissionKey(row = {}) {
    return [
      this.normalizePermissionKey(row.role_key || row.roleKey || ''),
      this.normalizePermissionKey(row.resource || ''),
      this.normalizePermissionKey(row.action || '')
    ].join('|');
  },
  normalizeRolePermissionRow(row = {}) {
    const allowedRoles = Array.isArray(row.allowed_roles)
      ? row.allowed_roles
      : String(row.allowed_roles || '')
          .split(',')
          .map(role => String(role || '').trim())
          .filter(Boolean);
    return {
      ...row,
      id: row.permission_id,
      permission_id: row.permission_id,
      role_key: row.role_key || '',
      roleKey: row.role_key || '',
      resource: row.resource || '',
      action: row.action || '',
      is_allowed: row.is_allowed === true,
      isAllowed: row.is_allowed === true,
      is_active: row.is_active !== false,
      isActive: row.is_active !== false,
      allowed_roles: allowedRoles,
      allowedRoles,
      created_at: row.created_at || '',
      updated_at: row.updated_at || ''
    };
  },
  dedupeRolePermissionRows(rows = []) {
    const newestByKey = new Map();
    rows.forEach(rawRow => {
      const row = this.normalizeRolePermissionRow(rawRow);
      const key = this.permissionKey(row);
      if (!key || key === '||') return;
      const existing = newestByKey.get(key);
      if (!existing) {
        newestByKey.set(key, row);
        return;
      }
      const existingUpdated = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const rowUpdated = new Date(row.updated_at || row.created_at || 0).getTime();
      if (rowUpdated >= existingUpdated) newestByKey.set(key, row);
    });
    return [...newestByKey.values()];
  },
  buildRolePermissionRpcPayload(input = {}) {
    const form = input.form && typeof input.form === 'object' ? input.form : {};
    const roleSelect = input.roleSelect ?? input.rolePermissionRole ?? document.getElementById('rolePermissionRole');
    const resourceSelect = input.resourceSelect ?? input.rolePermissionResource ?? document.getElementById('rolePermissionResource');
    const actionSelect = input.actionSelect ?? input.rolePermissionAction ?? document.getElementById('rolePermissionAction');

    const selectedRoleKey =
      input.p_role_key ||
      input.role_key ||
      input.roleKey ||
      input.role ||
      form.role_key ||
      form.roleKey ||
      roleSelect?.value;

    const selectedResource =
      input.p_resource ||
      input.permission_resource ||
      input.permissionResource ||
      input.target_resource ||
      input.targetResource ||
      input.resource_key ||
      input.module ||
      input.module_key ||
      input.resource ||
      form.resource ||
      form.module ||
      resourceSelect?.value;

    const selectedAction =
      input.p_action ||
      input.permission_action ||
      input.permissionAction ||
      input.target_action ||
      input.targetAction ||
      input.action_key ||
      input.permission ||
      input.action ||
      form.action ||
      form.permission ||
      actionSelect?.value;

    const roleKey = this.normalizePermissionKey(selectedRoleKey);
    const resource = this.normalizePermissionKey(selectedResource);
    const action = this.normalizePermissionKey(selectedAction);
    if (!roleKey || !resource || !action) {
      throw new Error('Role, resource, and action are required.');
    }
    const payload = {
      p_role_key: roleKey,
      p_resource: resource,
      p_action: action,
      p_is_allowed: input.is_allowed ?? input.isAllowed ?? true,
      p_is_active: input.is_active ?? input.isActive ?? true,
      p_allowed_roles: this.normalizeAllowedRolesText(
        input.allowed_roles ??
        input.allowedRoles ??
        roleKey
      )
    };
    if (!payload.p_resource) {
      throw new Error('Permission resource is required.');
    }
    if (!payload.p_action) {
      throw new Error('Permission action is required.');
    }
    if (payload.p_resource === 'role' || payload.p_resource === 'permission') {
      throw new Error('Permission save was not verified in Supabase. Please check role/resource/action mapping.');
    }
    if (!this.VALID_PERMISSION_RESOURCES.has(payload.p_resource)) {
      try { console.warn('[role permissions] custom resource not in known list', payload.p_resource); } catch {}
    }
    if (!this.VALID_PERMISSION_ACTIONS.has(payload.p_action)) {
      try { console.warn('[role permissions] custom action not in known list', payload.p_action); } catch {}
    }
    try { console.log('[role permissions] selected fields', JSON.stringify({ selectedRoleKey, selectedResource, selectedAction }, null, 2)); } catch {}
    try { console.log('[role permissions] final rpc payload', JSON.stringify(payload, null, 2)); } catch {}
    return payload;
  },
  async createRolePermission(payload = {}) {
    return this.saveRolePermission(payload);
  },
  async updateRolePermission(permissionId, updates = {}) {
    try { console.log('[RolesPermissions] update permission_id (unused with RPC)', permissionId); } catch {}
    return this.saveRolePermission(updates);
  },
  async saveRolePermission(payload = {}) {
    try { console.log('[role permissions] form/input', JSON.stringify(payload, null, 2)); } catch {}
    const client = window.SupabaseClient?.getClient?.();
    if (!client) throw new Error('Supabase client is not available.');
    const rpcPayload = this.buildRolePermissionRpcPayload(payload);
    if (
      rpcPayload.p_resource === 'role_permissions' &&
      rpcPayload.p_action === 'save' &&
      payload.original_resource &&
      payload.original_action
    ) {
      throw new Error('Role permission payload collision detected: routing resource/action overwrote permission resource/action.');
    }
    try { console.log('[role permissions] final direct rpc payload', JSON.stringify(rpcPayload, null, 2)); } catch {}
    const { data, error } = await client.rpc('upsert_role_permission', rpcPayload);
    try { console.log('[role permissions] direct rpc result', JSON.stringify({ data, error }, null, 2)); } catch {}
    if (error) throw new Error(error.message || 'Unable to save role permission.');
    if (!data) throw new Error('Permission was not saved. Supabase returned no row.');
    const verify = await client
      .from('role_permissions')
      .select('permission_id, role_key, resource, action, is_allowed, is_active, allowed_roles, created_at, updated_at')
      .eq('role_key', rpcPayload.p_role_key)
      .eq('resource', rpcPayload.p_resource)
      .eq('action', rpcPayload.p_action)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (verify.error) throw new Error(verify.error.message || 'Unable to verify saved permission.');
    if (!Array.isArray(verify.data) || !verify.data.length) {
      throw new Error(`Permission save was not verified: ${rpcPayload.p_role_key}/${rpcPayload.p_resource}/${rpcPayload.p_action}`);
    }
    const savedRow = this.normalizeRolePermissionRow(verify.data[0]);
    try { console.log('[role permissions] verified direct rpc row', JSON.stringify(verify.data[0], null, 2)); } catch {}
    try { console.log('[role permissions] saved normalized row', JSON.stringify(savedRow, null, 2)); } catch {}
    return savedRow;
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
      table: CONFIG.WORKFLOW_RULES_TABLE
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
      table: CONFIG.WORKFLOW_RULES_TABLE
    });
    return this.normalizeWorkflowRulePayload(response);
  },
  async saveWorkflowRule(rule = {}) {
    const normalizedRule = this.normalizeWorkflowRulePayload(rule);
    const body = {
      rule: normalizedRule,
      ...normalizedRule,
      table: CONFIG.WORKFLOW_RULES_TABLE
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
      table: CONFIG.WORKFLOW_RULES_TABLE
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
      table: CONFIG.WORKFLOW_RULES_TABLE
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
      table: CONFIG.WORKFLOW_APPROVALS_TABLE
    });
  },
  async approveWorkflowRequest(payload = {}) {
    return this.requestWithSession('workflow', 'approve', {
      ...payload,
      table: CONFIG.WORKFLOW_APPROVALS_TABLE
    });
  },
  async rejectWorkflowRequest(payload = {}) {
    return this.requestWithSession('workflow', 'reject', {
      ...payload,
      table: CONFIG.WORKFLOW_APPROVALS_TABLE
    });
  },
  async listPendingWorkflowApprovals(filters = {}) {
    return this.requestWithSession('workflow', 'list_pending_approvals', {
      filters,
      table: CONFIG.WORKFLOW_APPROVALS_TABLE
    });
  },
  async listWorkflowAudit(filters = {}) {
    return this.requestWithSession('workflow', 'list_audit', {
      filters,
      table: CONFIG.WORKFLOW_AUDIT_LOG_TABLE
    });
  },
};

if (typeof window !== 'undefined') window.Api = Api;

async function apiPost(payload = {}) {
  const requestBody = payload && typeof payload === 'object' ? payload : {};
  const resource = String(requestBody?.resource || '').trim();
  const action = String(requestBody?.action || '').trim();
  const authToken = String(requestBody?.authToken || '').trim();
  const isUsersUpdate = resource === 'users' && action === 'update';

  if (isUsersUpdate) {
    if (!authToken) {
      throw new Error('Your session expired. Please log in again.');
    }
    console.info('[edit user auth debug]', {
      hasAuthToken: Boolean(authToken),
      tokenLength: authToken ? authToken.length : 0,
      resource,
      action
    });
    const proxyPayload = { ...requestBody };
    proxyPayload.session_access_token = authToken;
    delete proxyPayload.authToken;
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'X-Supabase-Access-Token': authToken
      },
      body: JSON.stringify(proxyPayload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(data?.error || data?.message || 'Unable to update user.').trim();
      if (response.status === 401) throw new Error(message || 'Your session expired. Please log in again.');
      if (response.status === 403) throw new Error('You do not have permission to edit users.');
      if (message.toLowerCase().includes('supabase_service_role_key')) throw new Error('Server is missing SUPABASE_SERVICE_ROLE_KEY.');
      if (message.toLowerCase().includes('auth_user_id')) throw new Error('Cannot update auth user because auth_user_id is missing.');
      throw new Error(message);
    }
    return data;
  }

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
