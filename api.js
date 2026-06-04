const RESOURCE_PRIMARY_KEY = {
  users: 'id',
  roles: 'role_key',
  role_permissions: 'permission_id',
  technical_admin_requests: 'id',
  operations_onboarding: 'id',
  clients: 'id',
  invoices: 'id',
  receipts: 'id',
  credit_notes: 'id',
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
  'credit_notes:credit_note_created',
  'operations_onboarding:onboarding_created',
  'operations_onboarding:onboarding_status_changed',
  'operations_onboarding:operations_onboarding_created',
  'technical_admin_requests:technical_request_submitted',
  'technical_admin_requests:technical_request_status_changed'
]);

const Api = {
  shouldSkipWorkflowForDraftSave({ currentStatus, nextStatus, action, payload } = {}) {
    const current = String(currentStatus ?? payload?.current_status ?? payload?.from_status ?? payload?.record?.status ?? '').trim().toLowerCase();
    const next = String(nextStatus ?? payload?.next_status ?? payload?.requested_status ?? payload?.to_status ?? payload?.status ?? payload?.record?.next_status ?? '').trim().toLowerCase();
    const normalizedAction = String(action || payload?.action || '').trim().toLowerCase();
    const isCreateOrSave = !normalizedAction || ['create', 'save', 'update', 'validate_transition', 'create_workflow_approval', 'create_approval', 'request_approval'].includes(normalizedAction);
    if (next === 'draft' && (current === '' || current === 'draft') && isCreateOrSave) return true;
    if (current === next) return true;
    return false;
  },
  draftWorkflowSkipResult() {
    return { ok: true, allowed: true, skipped: true, pendingApproval: false, approvalCreated: false, reason: 'Draft save does not require workflow approval.' };
  },
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
        payload?.credit_notes,
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
        channels: ['in_app', 'push', 'email']
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
  getCurrentUserIdForAudit() {
    return String(
      window.Session?.userId?.() ||
      window.Session?.authContext?.()?.id ||
      window.Session?.authContext?.()?.user?.id ||
      window.AppState?.currentUser?.id ||
      ''
    ).trim();
  },
  async deactivateProposalCatalogItem(catalogItemId) {
    const now = new Date().toISOString();
    return this.updateProposalCatalogItem(catalogItemId, {
      is_active: false,
      deactivated_at: now,
      deactivated_by: this.getCurrentUserIdForAudit() || null,
      updated_at: now
    });
  },
  async reactivateProposalCatalogItem(catalogItemId) {
    return this.updateProposalCatalogItem(catalogItemId, {
      is_active: true,
      deactivated_at: null,
      deactivated_by: null,
      updated_at: new Date().toISOString()
    });
  },
  async deleteProposalCatalogItem(catalogItemId) {
    return this.deactivateProposalCatalogItem(catalogItemId);
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
  async updateAgreement(agreementId, updates, items = null) {
    const payload = { id: agreementId, updates };
    if (Array.isArray(items)) payload.items = items;
    const response = await this.requestWithSession('agreements', 'update', payload);
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
  async requestAgreementTechnicalAdmin(agreementId, message = '', options = {}) {
    const normalizedAgreementId = String(agreementId || '').trim();
    const targetOnboardingId = String(options?.onboardingId || options?.operationsOnboardingId || options?.onboarding_id || '').trim();
    if (!normalizedAgreementId) throw new Error('Agreement ID is required.');
    if (!targetOnboardingId) {
      throw new Error('Technical Admin request must be created manually from a specific Operations onboarding row. Invoice the agreement locations first, then click Technical Admin Request on that row.');
    }
    console.log('[operations onboarding] manual technical admin request for onboarding row', { agreement_id: normalizedAgreementId, onboarding_id: targetOnboardingId });
    const norm = value => String(value || '').trim().toLowerCase();
    const same = (a, b) => Boolean(norm(a) && norm(b) && norm(a) === norm(b));
    const isUuid = value => typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
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
    const safeAgreementUuid = isUuid(normalizedAgreementId) ? normalizedAgreementId : '';
    const displayAgreementNumber = agreementNumber || (!safeAgreementUuid ? normalizedAgreementId : '');
    const clientName = String(pickFirst(agreement?.client_name, agreement?.company_name, agreement?.customer_name)).trim();
    const clientId = String(pickFirst(agreement?.client_id, agreement?.customer_id, agreement?.company_id)).trim();

    const requestFields = {
      agreement_id: safeAgreementUuid || normalizedAgreementId,
      agreement_number: displayAgreementNumber || null,
      client_id: clientId || null,
      client_name: clientName || null,
      number_of_locations: locationCount,
      service_start_date: serviceStartDate || null,
      service_end_date: serviceEndDate || null,
      billing_frequency: billingFrequency || null,
      payment_term: paymentTerm || null,
      assigned_to: assignedTo || null,
      technical_request_type: 'Technical Admin',
      request_type: 'Technical Admin',
      technical_request_details: technicalRequestDetails,
      request_message: technicalRequestDetails,
      request_details: technicalRequestDetails,
      technical_request_status: 'Requested',
      request_status: 'Requested',
      requested_by: requestedBy || null,
      requested_at: requestedAt
    };

    const onboardingListResponse = await this.listOperationsOnboarding({ agreement_id: normalizedAgreementId });
    const onboardingRows = this.normalizeListResponse(onboardingListResponse).rows || [];
    const matchesOnboardingId = row => {
      if (!targetOnboardingId) return false;
      return [row?.id, row?.db_id, row?.onboarding_id, row?.operations_onboarding_id]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .includes(targetOnboardingId);
    };
    let existingOnboarding = targetOnboardingId
      ? (onboardingRows.find(matchesOnboardingId) || null)
      : null;
    if (targetOnboardingId && !existingOnboarding) {
      try {
        const specificResponse = await this.getOperationsOnboarding({ id: targetOnboardingId });
        const specificPayload = this.unwrapApiPayload(specificResponse) || specificResponse || {};
        existingOnboarding = specificPayload?.onboarding || specificPayload?.item || specificPayload?.data || specificPayload || null;
      } catch (error) {
        console.warn('[operations onboarding] unable to resolve requested onboarding row for technical request', { targetOnboardingId, error });
      }
    }
    if (!existingOnboarding) {
      throw new Error('Operations onboarding row was not found. Technical Admin request cannot be created from the agreement directly. Create an invoice first and use the Technical Admin Request button on the matching Operations row.');
    }
    console.log('[operations onboarding] resolved invoice-scoped onboarding row for manual technical request', existingOnboarding);

    const scopedOnboardingCount = existingOnboarding ? parseCount(
      existingOnboarding.number_of_locations,
      existingOnboarding.locations_count,
      existingOnboarding.number_of_locations,
      existingOnboarding.location_count,
      existingOnboarding.location_number,
      existingOnboarding.locations_number,
      existingOnboarding.invoiced_locations_count,
      existingOnboarding.invoiced_location_count,
      existingOnboarding.invoicedLocationCount,
      existingOnboarding.location_name ? 1 : ''
    ) : null;
    const scopedInvoicedLocationNames = existingOnboarding ? String(pickFirst(
      existingOnboarding.invoiced_location_names,
      existingOnboarding.invoicedLocationNames,
      existingOnboarding.location_names,
      existingOnboarding.locationNames
    ) || '').trim() : '';
    const scopedInvoicedAgreementItemIds = existingOnboarding ? String(pickFirst(
      existingOnboarding.invoiced_agreement_item_ids,
      existingOnboarding.invoicedAgreementItemIds
    ) || '').trim() : '';
    const scopedInvoiceId = existingOnboarding ? String(pickFirst(
      existingOnboarding.source_invoice_id,
      existingOnboarding.sourceInvoiceId,
      existingOnboarding.invoice_id,
      existingOnboarding.invoiceId
    ) || '').trim() : '';
    const scopedInvoiceNumber = existingOnboarding ? String(pickFirst(
      existingOnboarding.source_invoice_number,
      existingOnboarding.sourceInvoiceNumber,
      existingOnboarding.invoice_number,
      existingOnboarding.invoiceNumber
    ) || '').trim() : '';
    const scopedServiceStartDate = existingOnboarding ? String(pickFirst(existingOnboarding.service_start_date, existingOnboarding.serviceStartDate) || '').trim() : '';
    const scopedServiceEndDate = existingOnboarding ? String(pickFirst(existingOnboarding.service_end_date, existingOnboarding.serviceEndDate) || '').trim() : '';
    if (existingOnboarding) {
      if (scopedOnboardingCount) {
        requestFields.number_of_locations = scopedOnboardingCount;
        requestFields.location_count = scopedOnboardingCount;
        requestFields.locations_count = scopedOnboardingCount;
        requestFields.location_number = scopedOnboardingCount;
        requestFields.locations_number = scopedOnboardingCount;
      }
      if (scopedInvoicedLocationNames) requestFields.invoiced_location_names = scopedInvoicedLocationNames;
      if (scopedInvoicedAgreementItemIds) requestFields.invoiced_agreement_item_ids = scopedInvoicedAgreementItemIds;
      if (scopedInvoiceId && isUuid(scopedInvoiceId)) requestFields.source_invoice_id = scopedInvoiceId;
      if (scopedInvoiceNumber || (scopedInvoiceId && !isUuid(scopedInvoiceId))) {
        const safeInvoiceReference = scopedInvoiceNumber || scopedInvoiceId;
        requestFields.source_invoice_number = safeInvoiceReference;
        requestFields.invoice_number = safeInvoiceReference;
      }
      if (scopedServiceStartDate) requestFields.service_start_date = scopedServiceStartDate;
      if (scopedServiceEndDate) requestFields.service_end_date = scopedServiceEndDate;
      requestFields.request_message = technicalRequestDetails;
      requestFields.request_details = technicalRequestDetails;
      requestFields.technical_request_details = technicalRequestDetails;
    }

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
        const onboardingPayload = this.unwrapApiPayload(onboardingRecord) || onboardingRecord || {};
        const onboardingIdTokens = [targetOnboardingId, onboardingPayload?.id, onboardingPayload?.db_id, onboardingPayload?.onboarding_id]
          .map(value => String(value || '').trim())
          .filter(Boolean);
        const invoiceTokens = [
          requestFields.source_invoice_id,
          requestFields.invoice_id,
          requestFields.source_invoice_number,
          requestFields.invoice_number
        ].map(value => String(value || '').trim()).filter(Boolean);
        let existingRequest = null;
        if (onboardingIdTokens.length) {
          existingRequest = technicalRows.find(row => [row?.operations_onboarding_id, row?.source_onboarding_id, row?.onboarding_id]
            .map(value => String(value || '').trim())
            .filter(Boolean)
            .some(value => onboardingIdTokens.some(token => same(value, token)))) || null;
        }
        if (!existingRequest && invoiceTokens.length) {
          existingRequest = technicalRows.find(row => [row?.source_invoice_id, row?.invoice_id, row?.source_invoice_number, row?.invoice_number]
            .map(value => String(value || '').trim())
            .filter(Boolean)
            .some(value => invoiceTokens.some(token => same(value, token)))) || null;
        }
        // Do not reuse an agreement-level Technical request. Each manual request is tied to the clicked invoice-batch onboarding row or invoice.
        const technicalPayload = {
          agreement_id: safeAgreementUuid || null,
          agreement_number: displayAgreementNumber || null,
          client_id: clientId || null,
          client_name: clientName || null,
          number_of_locations: requestFields.number_of_locations || locationCount,
          location_count: requestFields.location_count || requestFields.number_of_locations || locationCount,
          locations_count: requestFields.locations_count || requestFields.location_count || requestFields.number_of_locations || locationCount,
          location_number: requestFields.location_number || requestFields.location_count || requestFields.number_of_locations || locationCount,
          locations_number: requestFields.locations_number || requestFields.location_count || requestFields.number_of_locations || locationCount,
          service_start_date: requestFields.service_start_date || serviceStartDate || null,
          service_end_date: requestFields.service_end_date || serviceEndDate || null,
          source_invoice_id: isUuid(String(requestFields.source_invoice_id || '').trim()) ? requestFields.source_invoice_id : null,
          invoice_id: isUuid(String(requestFields.invoice_id || requestFields.source_invoice_id || '').trim()) ? (requestFields.invoice_id || requestFields.source_invoice_id) : null,
          source_invoice_number: requestFields.source_invoice_number || null,
          invoice_number: requestFields.invoice_number || requestFields.source_invoice_number || null,
          invoiced_location_names: requestFields.invoiced_location_names || null,
          invoiced_agreement_item_ids: requestFields.invoiced_agreement_item_ids || null,
          billing_frequency: billingFrequency || null,
          payment_term: paymentTerm || null,
          assigned_to: assignedTo || null,
          operations_onboarding_id: isUuid(String(onboardingPayload?.id || targetOnboardingId || '').trim()) ? (onboardingPayload?.id || targetOnboardingId) : null,
          source_onboarding_id: onboardingIdTokens[0] || null,
          onboarding_id: isUuid(String(onboardingIdTokens[0] || '').trim()) ? onboardingIdTokens[0] : null,
          technical_request_type: 'Technical Admin',
          request_type: 'Technical Admin',
          technical_request_details: technicalRequestDetails,
          request_message: technicalRequestDetails,
          request_details: technicalRequestDetails,
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
  async requestPocTechnicalAdmin({ onboardingId = '', message = '' } = {}) {
    const normalizedOnboardingId = String(onboardingId || '').trim();
    if (!normalizedOnboardingId) throw new Error('onboarding_id is required for POC technical requests.');
    const onboardingResponse = await this.getOperationsOnboarding({ id: normalizedOnboardingId });
    const onboarding = this.unwrapApiPayload(onboardingResponse)?.onboarding || this.unwrapApiPayload(onboardingResponse) || onboardingResponse || {};
    const isPoc = String(onboarding.onboarding_type || onboarding.request_type || '').trim().toLowerCase() === 'poc';
    if (!isPoc) throw new Error('Selected onboarding row is not a POC onboarding row.');
    const proposalId = String(onboarding.proposal_id || onboarding.source_id || '').trim();
    const requestMessage = String(message || onboarding.poc_notes || onboarding.request_message || 'Please proceed with POC technical setup.').trim();
    const payload = {
      onboarding_id: normalizedOnboardingId,
      onboarding_type: 'poc',
      request_type: 'poc',
      source_type: 'proposal',
      source_id: proposalId || null,
      proposal_id: proposalId || null,
      agreement_id: null,
      agreement_number: null,
      client_id: onboarding.client_id || onboarding.company_id || null,
      client_name: onboarding.client_name || onboarding.legal_company_name || onboarding.company_name || null,
      location_count: Number(onboarding.poc_location_count || onboarding.location_count || onboarding.locations_count || onboarding.number_of_locations || onboarding.location_number || onboarding.locations_number || 0) || null,
      number_of_locations: Number(onboarding.poc_location_count || onboarding.number_of_locations || onboarding.locations_count || onboarding.location_count || onboarding.location_number || onboarding.locations_number || 0) || null,
      locations_count: Number(onboarding.poc_location_count || onboarding.locations_count || onboarding.number_of_locations || onboarding.location_count || onboarding.location_number || onboarding.locations_number || 0) || null,
      location_number: Number(onboarding.poc_location_count || onboarding.location_number || onboarding.number_of_locations || onboarding.locations_count || onboarding.location_count || onboarding.locations_number || 0) || null,
      locations_number: Number(onboarding.poc_location_count || onboarding.locations_number || onboarding.number_of_locations || onboarding.locations_count || onboarding.location_count || onboarding.location_number || 0) || null,
      service_start_date: onboarding.poc_start_date || onboarding.poc_service_start_date || onboarding.service_start_date || null,
      service_end_date: onboarding.poc_end_date || onboarding.poc_service_end_date || onboarding.service_end_date || null,
      request_message: requestMessage,
      request_details: requestMessage,
      technical_request_details: requestMessage,
      requested_at: new Date().toISOString(),
      technical_request_status: 'Requested',
      request_status: 'Requested'
    };
    const existingList = await this.listTechnicalAdminRequests({ onboarding_id: normalizedOnboardingId, request_type: 'poc' });
    const existingRows = this.normalizeListResponse(existingList).rows || [];
    const existingActive = existingRows.find(row => !['cancelled', 'canceled', 'rejected'].includes(String(row.request_status || '').trim().toLowerCase()));
    let technicalRequest;
    if (existingActive?.id || existingActive?.technical_request_id) {
      technicalRequest = await this.requestWithSession('technical_admin_requests', 'update', {
        technical_request_id: String(existingActive.technical_request_id || existingActive.id).trim(),
        updates: payload
      });
    } else {
      technicalRequest = await this.requestWithSession('technical_admin_requests', 'save', { technical_admin_request: payload });
    }
    await this.updateOperationsOnboardingAction({
      onboardingId: normalizedOnboardingId,
      updates: {
        onboarding_status: 'Technical Requested',
        technical_request_status: 'Requested',
        request_status: 'Requested',
        request_type: 'POC',
        technical_request_type: 'POC',
        request_message: requestMessage
      }
    });
    return { operations_onboarding: onboarding, technical_request: this.unwrapApiPayload(technicalRequest) || technicalRequest };
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
    if (!normalizedOnboardingId) throw new Error('Missing id for operations_onboarding update');
    const payload = updates && typeof updates === 'object' ? { ...updates } : {};
    delete payload.id;
    delete payload.db_id;
    delete payload.record_id;
    const normalizeStatus = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    const isCompleted = row => {
      const status = normalizeStatus(row?.status || row?.onboarding_status || row?.state || '');
      return ['completed', 'complete', 'done', 'closed'].includes(status) || Boolean(row?.completed_at || row?.completedAt);
    };
    const isInProgress = row => {
      const status = normalizeStatus(row?.status || row?.onboarding_status || row?.state || '');
      return ['in_progress', 'started', 'active'].includes(status);
    };
    const currentRecordResponse = await this.getOperationsOnboarding({ id: normalizedOnboardingId });
    const currentRecord = this.unwrapApiPayload(currentRecordResponse) || currentRecordResponse || {};
    const targetStatus = normalizeStatus(payload.onboarding_status || payload.status || '');
    if (targetStatus === 'in_progress') {
      if (isCompleted(currentRecord)) throw new Error('This onboarding is already completed.');
      if (isInProgress(currentRecord)) throw new Error('This onboarding is already in progress.');
    }
    if (targetStatus === 'completed' && isCompleted(currentRecord)) throw new Error('This onboarding is already completed.');
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
    const safeOnboarding = { ...(onboarding && typeof onboarding === 'object' ? onboarding : {}) };
    const hasInvoiceScope = Boolean(String(
      safeOnboarding.source_invoice_id ||
      safeOnboarding.invoice_id ||
      safeOnboarding.source_invoice_number ||
      safeOnboarding.invoice_number ||
      ''
    ).trim());

    // Invoice-batch onboarding must not be sent through the generic Operations save path.
    // That path can require operations_onboarding:create and can also save client_id values
    // that belong to companies/invoices, violating operations_onboarding_client_id_fkey.
    delete safeOnboarding.client_id;
    delete safeOnboarding.clientId;

    if (!hasInvoiceScope) {
      throw new Error('Operations onboarding must be created from an invoice batch. Agreement signed alone must not create onboarding.');
    }

    const response = await this.requestWithSession('invoices', 'create_operations_onboarding', {
      operations_onboarding: safeOnboarding,
      onboarding: safeOnboarding,
      table: CONFIG.OPERATIONS_ONBOARDING_TABLE
    });
    const recordId = this.extractBusinessRecordId(response, safeOnboarding?.onboarding_id || safeOnboarding?.agreement_id || '');
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
  async saveTechnicalAdminRequest(technicalAdminRequest = {}) {
    const response = await this.requestWithSession('technical_admin_requests', 'save', {
      technical_admin_request: technicalAdminRequest,
      technical_admin_requests: technicalAdminRequest
    });
    const recordId = this.extractBusinessRecordId(
      response,
      technicalAdminRequest?.technical_request_id ||
        technicalAdminRequest?.request_id ||
        technicalAdminRequest?.onboarding_id ||
        technicalAdminRequest?.agreement_id ||
        ''
    );
    await this.safeSendBusinessPwaPush({
      resource: 'technical_admin_requests',
      action: 'technical_request_submitted',
      recordId,
      title: 'Technical admin request submitted',
      body: String(technicalAdminRequest?.request_message || technicalAdminRequest?.request_details || technicalAdminRequest?.technical_request_details || 'Technical admin request submitted.').trim(),
      roles: ['admin', 'dev', 'hoo'],
      url: recordId ? '/#technical_admin_requests?id=' + encodeURIComponent(recordId) : '/#technical_admin_requests'
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
  async updateTechnicalAdminRequest(technicalRequestId, updates = {}) {
    const normalizedId = String(technicalRequestId || '').trim();
    if (!normalizedId) throw new Error('Technical request id is required.');
    const safeUpdates = updates && typeof updates === 'object' ? { ...updates } : {};
    delete safeUpdates.id;
    delete safeUpdates.db_id;
    delete safeUpdates.record_id;
    const response = await this.requestWithSession('technical_admin_requests', 'update', {
      id: normalizedId,
      technical_request_id: normalizedId,
      request_id: normalizedId,
      updates: safeUpdates
    });
    const hasStatus = Object.prototype.hasOwnProperty.call(safeUpdates, 'request_status') || Object.prototype.hasOwnProperty.call(safeUpdates, 'technical_request_status');
    await this.safeSendBusinessPwaPush({
      resource: 'technical_admin_requests',
      action: hasStatus ? 'technical_request_status_changed' : 'technical_request_updated',
      recordId: this.extractBusinessRecordId(response, normalizedId),
      title: hasStatus ? 'Technical request status changed' : 'Technical request updated',
      body: 'Technical request ' + normalizedId + ' was updated.',
      roles: ['admin', 'dev', 'hoo'],
      url: normalizedId ? '/#technical_admin_requests?id=' + encodeURIComponent(normalizedId) : '/#technical_admin_requests'
    });
    return response;
  },
  async updateTechnicalAdminRequestStatus(technicalRequestId, status, extra = {}) {
    const normalizedId = String(technicalRequestId || '').trim();
    if (!normalizedId) throw new Error('Technical request id is required.');
    const response = await this.requestWithSession('technical_admin_requests', 'update_status', {
      id: normalizedId,
      technical_request_id: normalizedId,
      request_id: normalizedId,
      request_status: status,
      ...(extra && typeof extra === 'object' ? extra : {})
    });
    await this.safeSendBusinessPwaPush({
      resource: 'technical_admin_requests',
      action: 'technical_request_status_changed',
      recordId: this.extractBusinessRecordId(response, normalizedId),
      title: 'Technical request status changed',
      body: 'Technical request ' + normalizedId + ' status changed to ' + (status || 'updated') + '.',
      roles: ['admin', 'dev', 'hoo'],
      url: normalizedId ? '/#technical_admin_requests?id=' + encodeURIComponent(normalizedId) : '/#technical_admin_requests'
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
  async getCreditNotes(filters = {}, options = {}) {
    const listPayload = this.buildSummaryListPayload({
      ...options,
      sort_by: options?.sort_by || 'credit_note_date',
      sort_dir: options?.sort_dir || 'desc'
    });
    const safeFilters = filters && typeof filters === 'object' ? { ...filters } : {};
    const rawStatus = String(safeFilters.status ?? safeFilters.credit_note_status ?? '').trim().toLowerCase();
    delete safeFilters.credit_note_status;
    if (!rawStatus || rawStatus === 'all') delete safeFilters.status;
    else safeFilters.status = rawStatus === 'canceled' ? 'cancelled' : rawStatus;
    const payload = { filters: { ...safeFilters, ...listPayload } };
    const response = options?.forceRefresh === true
      ? await this.requestWithSession('credit_notes', 'list', payload)
      : await this.requestCached('credit_notes', 'list', payload);
    return this.normalizeListResponse(response);
  },
  async getCreditNotesByInvoice(invoiceId) {
    const response = await this.requestWithSession('credit_notes', 'list', { filters: { invoice_id: invoiceId, limit: 200, summary_only: false } });
    return this.normalizeListResponse(response).rows || [];
  },
  async createCreditNote(payload = {}) {
    const response = await this.requestWithSession('credit_notes', 'create', { credit_note: payload });
    this.clearApiCache?.('credit_notes:list');
    const saved = this.unwrapApiPayload(response) || response || {};
    const savedRecord = {
      ...saved,
      id: saved.id || saved.credit_note_uuid || saved.uuid || '',
      credit_note_number: saved.credit_note_number || saved.credit_note_id || payload?.credit_note_number || '',
      invoice_number: saved.invoice_number || payload?.invoice_number || '',
      client_name: saved.client_name || saved.customer_name || payload?.client_name || payload?.customer_name || '',
      customer_name: saved.customer_name || saved.client_name || payload?.customer_name || payload?.client_name || '',
      credit_note_date: saved.credit_note_date || payload?.credit_note_date || '',
      credit_amount: saved.credit_amount ?? payload?.credit_amount ?? 0,
      status: String(saved.status || payload?.status || 'issued').trim().toLowerCase()
    };
    const recordId = this.extractBusinessRecordId(savedRecord, payload?.credit_note_number || '');
    await this.safeSendBusinessPwaPush({
      resource: 'credit_notes',
      action: 'credit_note_created',
      recordId,
      title: 'Credit note issued',
      body: 'Credit note ' + (savedRecord.credit_note_number || recordId || '') + ' was issued.',
      roles: ['admin', 'accounting'],
      url: recordId ? '/#creditNotes?id=' + encodeURIComponent(recordId) : '/#creditNotes'
    });
    return savedRecord;
  },
  async cancelCreditNote(id) {
    const response = await this.requestWithSession('credit_notes', 'cancel', { id, credit_note_id: id });
    this.clearApiCache?.('credit_notes:list');
    return response;
  },
  async recalculateInvoiceTotals(invoiceId) {
    return this.requestWithSession('credit_notes', 'recalculate_invoice_totals', { invoice_id: invoiceId, id: invoiceId });
  },
  async createInvoiceFromAgreement(agreementId) {
    const normalizeAgreementStatusForInvoice = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
    const agreementHasSignedDocumentForInvoice = agreement => Boolean(
      agreement?.signed_document_path ||
      agreement?.signed_agreement_document_path ||
      agreement?.signed_document_url ||
      agreement?.signed_agreement_document_url
    );
    const agreementResponse = await this.getAgreement(agreementId);
    const candidates = [
      agreementResponse?.agreement,
      agreementResponse?.item,
      agreementResponse?.data?.agreement,
      agreementResponse?.data?.item,
      agreementResponse?.data,
      agreementResponse?.result?.agreement,
      agreementResponse?.result?.item,
      agreementResponse?.result,
      agreementResponse?.payload?.agreement,
      agreementResponse?.payload?.item,
      agreementResponse?.payload,
      agreementResponse
    ];
    const latestAgreement = candidates.find(candidate => candidate && typeof candidate === 'object' && !Array.isArray(candidate)) || {};
    if (normalizeAgreementStatusForInvoice(latestAgreement.status) !== 'signed') {
      throw new Error('Only signed agreements can be invoiced.');
    }
    if (!agreementHasSignedDocumentForInvoice(latestAgreement)) {
      throw new Error('You should upload the signed agreement document before creating an invoice.');
    }
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
  async getInvoicePaymentSchedule(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) return [];
    const client = window.SupabaseClient?.getClient?.() || window.supabase || null;
    if (client?.from) {
      const { data, error } = await client
        .from('invoice_payment_schedule')
        .select('*')
        .eq('invoice_id', id)
        .order('schedule_no', { ascending: true, nullsFirst: false })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true, nullsFirst: false });

      if (error) {
        console.warn('[Invoice] unable to load payment schedule', error);
        return [];
      }

      return data || [];
    }
    try {
      const response = await this.requestWithSession('invoices', 'list_payment_schedule', { id, invoice_id: id });
      return Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      console.warn('[Invoice] unable to load payment schedule', error);
      return [];
    }
  },
  async listInvoicePaymentSchedule(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) throw new Error('Invoice ID is required to load payment schedule.');
    return this.getInvoicePaymentSchedule(id);
  },
  async createInvoicePaymentSchedule(invoiceId, force = false) {
    const id = String(invoiceId || '').trim();
    if (!id) throw new Error('Invoice ID is required to create payment schedule.');
    return this.requestWithSession('invoices', 'create_payment_schedule', { id, invoice_id: id, force: force === true });
  },
  async recalculateInvoicePaymentSchedule(invoiceId) {
    const id = String(invoiceId || '').trim();
    if (!id) throw new Error('Invoice ID is required to recalculate payment schedule.');
    return this.requestWithSession('invoices', 'recalculate_payment_schedule', { id, invoice_id: id });
  },
  async saveInvoicePaymentSchedule(invoiceId, rows = [], invoice = {}) {
    const id = String(invoiceId || '').trim();
    if (!id) throw new Error('Invoice ID is required to save payment schedule.');
    const scheduleRows = (Array.isArray(rows) ? rows : []).map((row, index) => ({
      invoice_id: id,
      schedule_no: Number(row.schedule_no || index + 1),
      due_date: String(row.due_date || '').trim().slice(0, 10),
      payment_percent: Number(row.payment_percent || 0),
      scheduled_amount: Number(row.scheduled_amount || 0),
      paid_amount: Number(row.paid_amount || 0),
      status: String(row.status || 'scheduled').trim() || 'scheduled',
      schedule_label: String(row.schedule_label || (invoice.payment_term === 'Custom' ? 'Custom' : `Payment ${index + 1}`)).trim(),
      receipt_ids: Array.isArray(row.receipt_ids) ? row.receipt_ids : []
    }));
    return this.requestWithSession('invoices', 'save_payment_schedule', {
      id,
      invoice_id: id,
      payment_term: invoice.payment_term || '',
      payment_term_custom: invoice.payment_term_custom || '',
      payment_schedule_mode: invoice.payment_term === 'Custom' ? 'manual' : (invoice.payment_schedule_mode || 'manual'),
      rows: scheduleRows
    });
  },
  async updateInvoicePaymentScheduleReminder(payload = {}) {
    const scheduleId = String(payload?.schedule_id || payload?.id || '').trim();
    if (!scheduleId) throw new Error('Schedule row ID is required to save reminder settings.');
    const reminderDays = Array.isArray(payload.reminder_days) ? payload.reminder_days.map(day => Number(day)).filter(day => [30, 14, 7].includes(day)) : [30, 14, 7];
    const reminderUserIds = Array.isArray(payload.reminder_user_ids) ? payload.reminder_user_ids.map(id => String(id || '').trim()).filter(Boolean) : [];
    const body = {
      schedule_id: scheduleId,
      id: scheduleId,
      reminder_enabled: payload.reminder_enabled === true,
      reminder_days: reminderDays.length ? reminderDays : [30, 14, 7],
      reminder_user_ids: reminderUserIds
    };
    const client = window.SupabaseClient?.getClient?.() || window.supabase || null;
    if (client?.from) {
      let currentUserId = '';
      try {
        const { data } = await client.auth.getUser();
        currentUserId = String(data?.user?.id || '').trim();
      } catch {}
      const updates = {
        reminder_enabled: body.reminder_enabled,
        reminder_days: body.reminder_days,
        reminder_user_ids: body.reminder_user_ids,
        reminder_updated_at: new Date().toISOString(),
        reminder_updated_by: currentUserId || null
      };
      const { data, error } = await client
        .from('invoice_payment_schedule')
        .update(updates)
        .eq('id', scheduleId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data || { id: scheduleId, ...updates };
    }
    return this.requestWithSession('invoices', 'update_payment_schedule_reminder', body);
  },
  async processPaymentScheduleReminders(payload = {}) {
    return this.requestWithSession('invoices', 'process_payment_schedule_reminders', payload);
  },

  normalizePagedOptions(options = {}) {
    const page = Math.max(Number(options.page || 1), 1);
    const pageSize = Math.max(Number(options.pageSize || options.limit || 25), 1);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    return { page, pageSize, from, to };
  },
  pagedResult(data = [], count = 0, page = 1, pageSize = 25) {
    const total = Number.isFinite(Number(count)) ? Number(count) : (Array.isArray(data) ? data.length : 0);
    return { rows: data || [], total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
  },
  isUuidValue(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || '').trim());
  },
  firstUuidValue_(...values) {
    return values
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => String(value || '').trim())
      .find(value => this.isUuidValue(value)) || '';
  },
  firstDisplayValue_(...values) {
    return values
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(value => String(value || '').trim())
      .find(value => value && !this.isUuidValue(value)) || '';
  },
  sanitizePostgrestText_(value = '') {
    return String(value || '').trim().replace(/[%,()*]/g, ' ').replace(/\s+/g, ' ').trim();
  },
  getClientFilterValues(clientOrId = {}) {
    const source = clientOrId && typeof clientOrId === 'object' ? clientOrId : { client_id: clientOrId };
    const sourceClientIds = Array.isArray(source?.source_client_ids) ? source.source_client_ids : [];

    // Client#00055 / Invoice#00012 / Agreement#00017 are display references, not UUIDs.
    // Only real UUIDs are allowed to touch UUID columns such as invoices.client_id.
    const companyId = this.firstUuidValue_(
      source?.company_id,
      source?.companyId,
      source?.company_uuid,
      source?.companyUuid,
      source?.customer_company_id,
      source?.customerCompanyId,
      source?.client_company_id,
      source?.clientCompanyId
    );
    const clientUuid = this.firstUuidValue_(
      source?.client_uuid,
      source?.clientUuid,
      source?.id,
      source?.uuid,
      source?.client_id,
      source?.clientId,
      sourceClientIds
    );
    const displayClientId = this.firstDisplayValue_(source?.client_id, source?.clientId, sourceClientIds);
    const clientName = String(
      source?.legal_name ||
      source?.legalName ||
      source?.company_name ||
      source?.companyName ||
      source?.customer_legal_name ||
      source?.customerLegalName ||
      source?.customer_name ||
      source?.customerName ||
      source?.client_name ||
      source?.clientName ||
      source?.name ||
      ''
    ).trim();
    return { companyId, clientId: clientUuid, clientUuid, displayClientId, clientName };
  },
  getClientFilterConfig_(table = '') {
    const configs = {
      agreements: {
        uuid: { company_id: 'companyId', client_id: 'clientUuid' },
        text: ['customer_legal_name', 'customer_name', 'company_name', 'client_name']
      },
      invoices: {
        uuid: { company_id: 'companyId', client_id: 'clientUuid' },
        // invoices.client_name does not exist in this schema, so do not use it here.
        text: ['customer_legal_name', 'customer_name', 'company_name']
      },
      receipts: {
        uuid: { company_id: 'companyId', client_id: 'clientUuid' },
        // receipts.client_name may not exist; use the customer/company fields only.
        text: ['customer_legal_name', 'customer_name', 'company_name']
      },
      client_scheduled_payments: {
        uuid: { company_id: 'companyId', client_id: 'clientUuid' },
        text: ['client_name', 'customer_legal_name', 'customer_name', 'company_name']
      },
      onboarding_requests: {
        uuid: { company_id: 'companyId', client_id: 'clientUuid' },
        text: ['client_name', 'company_name', 'customer_name', 'customer_legal_name']
      },
      technical_requests: {
        uuid: { company_id: 'companyId', client_id: 'clientUuid' },
        text: ['client_name', 'company_name', 'customer_name', 'customer_legal_name']
      },
      csm_activities: {
        uuid: { company_id: 'companyId', client_id: 'clientUuid', agreement_id: 'agreementId', invoice_id: 'invoiceId', location_id: 'locationId' },
        text: ['client_name', 'company_name', 'customer_name', 'customer_legal_name', 'manual_client_name', 'manual_location_name', 'location_name']
      }
    };
    return configs[String(table || '').trim()] || { uuid: {}, text: [] };
  },
  getClientRowKey_(row = {}) {
    return String(
      row?.id || row?.uuid || row?.invoice_uuid || row?.agreement_uuid || row?.receipt_uuid ||
      row?.invoice_id || row?.agreement_id || row?.receipt_id || row?.schedule_id ||
      row?.invoice_number || row?.agreement_number || row?.receipt_number ||
      JSON.stringify(row || {})
    ).trim();
  },
  mergeUniqueClientRows_(...sets) {
    const byKey = new Map();
    sets.flat().filter(Boolean).forEach(row => {
      const key = this.getClientRowKey_(row);
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, row);
      else byKey.set(key, { ...byKey.get(key), ...row });
    });
    return [...byKey.values()];
  },
  sortClientRowsForTable_(table = '', rows = []) {
    const tableName = String(table || '').trim();
    const dateValue = row => new Date(row?.updated_at || row?.created_at || row?.issue_date || row?.invoice_date || row?.receipt_date || row?.due_date || 0).getTime() || 0;
    const sorted = [...(Array.isArray(rows) ? rows : [])];
    if (tableName === 'client_scheduled_payments' || tableName === 'invoice_payment_schedule') {
      return sorted.sort((a, b) => {
        const ad = new Date(a?.due_date || 0).getTime() || Number.POSITIVE_INFINITY;
        const bd = new Date(b?.due_date || 0).getTime() || Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return Number(a?.schedule_no || 0) - Number(b?.schedule_no || 0);
      });
    }
    return sorted.sort((a, b) => dateValue(b) - dateValue(a));
  },
  async runClientTableQuery_(table, buildQuery, configure = null, limit = 250) {
    const supabaseClient = window.SupabaseClient?.getClient?.() || window.supabase || null;
    if (!supabaseClient?.from) return [];
    try {
      let query = supabaseClient.from(table).select('*');
      query = buildQuery(query);
      if (!query) return [];
      if (typeof configure === 'function') query = configure(query) || query;
      const { data, error } = await query.limit(Math.max(Number(limit) || 250, 1));
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      // Some older/customer environments do not have every optional column/view.
      // Skip only that candidate query instead of breaking the whole client panel.
      console.info(`[Client Panel] ${table} filter candidate skipped`, error?.message || error);
      return [];
    }
  },
  async fetchPaged(table, clientOrId = {}, options = {}, configure = null) {
    const { page, pageSize, from, to } = this.normalizePagedOptions(options);
    const supabaseClient = window.SupabaseClient?.getClient?.() || window.supabase || null;
    if (!supabaseClient?.from) return this.pagedResult([], 0, page, pageSize);

    const filterValues = this.getClientFilterValues(clientOrId);
    const config = this.getClientFilterConfig_(table);
    const fetchLimit = Math.max(to + 1, 100);
    const uuidRows = [];

    for (const [column, key] of Object.entries(config.uuid || {})) {
      const value = String(filterValues[key] || '').trim();
      if (!value || !this.isUuidValue(value)) continue;
      const rows = await this.runClientTableQuery_(table, query => query.eq(column, value), configure, fetchLimit);
      uuidRows.push(...rows);
    }

    let rows = this.mergeUniqueClientRows_(uuidRows);

    // Always add the safe name fallback too. Many old/imported client rows have totals
    // but no company/client UUID link, so UUID-only filtering can show incomplete details.
    const safeName = this.sanitizePostgrestText_(filterValues.clientName);
    if (safeName) {
      const textRows = [];
      for (const column of config.text || []) {
        const candidateRows = await this.runClientTableQuery_(table, query => query.ilike(column, `%${safeName}%`), configure, fetchLimit);
        textRows.push(...candidateRows);
      }
      rows = this.mergeUniqueClientRows_(rows, textRows);
    }

    rows = this.sortClientRowsForTable_(table, rows);
    const pageRows = rows.slice(from, to + 1);
    return this.pagedResult(pageRows, rows.length, page, pageSize);
  },
  extractUuidKeys_(rows = [], fields = []) {
    return [...new Set((Array.isArray(rows) ? rows : [])
      .flatMap(row => fields.map(field => row?.[field]))
      .map(value => String(value || '').trim())
      .filter(value => this.isUuidValue(value)))];
  },
  extractTextKeys_(rows = [], fields = []) {
    return [...new Set((Array.isArray(rows) ? rows : [])
      .flatMap(row => fields.map(field => row?.[field]))
      .map(value => String(value || '').trim())
      .filter(value => value && !this.isUuidValue(value)))];
  },
  async fetchLinkedRowsByColumns_(table, columnKeys = {}, configure = null) {
    const output = [];
    for (const [column, rawKeys] of Object.entries(columnKeys || {})) {
      const keys = [...new Set((Array.isArray(rawKeys) ? rawKeys : [])
        .map(value => String(value || '').trim())
        .filter(Boolean))];
      for (let i = 0; i < keys.length; i += 100) {
        const chunk = keys.slice(i, i + 100);
        const rows = await this.runClientTableQuery_(table, query => query.in(column, chunk), configure, 500);
        output.push(...rows);
      }
    }
    return this.mergeUniqueClientRows_(output);
  },
  async getClientOverview(clientOrId = {}) {
    const source = clientOrId && typeof clientOrId === 'object' ? clientOrId : { client_id: clientOrId };
    const [agreements, directInvoices, directReceipts] = await Promise.all([
      this.getClientAgreements(source, { page: 1, pageSize: 250 }),
      this.getClientInvoices(source, { page: 1, pageSize: 250 }),
      this.getClientReceipts(source, { page: 1, pageSize: 250 })
    ]);

    const agreementRows = agreements.rows || [];

    const agreementLinkedInvoices = await this.fetchLinkedRowsByColumns_('invoices', {
      agreement_id: this.extractUuidKeys_(agreementRows, ['id', 'agreement_uuid', 'agreement_id']),
      source_agreement_id: this.extractUuidKeys_(agreementRows, ['id', 'agreement_uuid', 'agreement_id']),
      agreement_number: this.extractTextKeys_(agreementRows, ['agreement_number', 'agreement_id', 'agreement_no']),
      source_agreement_number: this.extractTextKeys_(agreementRows, ['agreement_number', 'agreement_id', 'agreement_no'])
    }, query => query.order('updated_at', { ascending: false, nullsFirst: false }));

    const invoiceRows = this.sortClientRowsForTable_('invoices', this.mergeUniqueClientRows_(directInvoices.rows || [], agreementLinkedInvoices));

    const invoiceLinkedReceipts = await this.fetchLinkedRowsByColumns_('receipts', {
      invoice_id: this.extractUuidKeys_(invoiceRows, ['id', 'invoice_uuid', 'invoice_id']),
      invoice_number: this.extractTextKeys_(invoiceRows, ['invoice_number', 'invoice_id', 'invoice_no'])
    }, query => query.order('updated_at', { ascending: false, nullsFirst: false }));

    const agreementLinkedReceipts = await this.fetchLinkedRowsByColumns_('receipts', {
      agreement_id: this.extractUuidKeys_(agreementRows, ['id', 'agreement_uuid', 'agreement_id']),
      agreement_number: this.extractTextKeys_(agreementRows, ['agreement_number', 'agreement_id', 'agreement_no'])
    }, query => query.order('updated_at', { ascending: false, nullsFirst: false }));

    const receiptRows = this.sortClientRowsForTable_('receipts', this.mergeUniqueClientRows_(directReceipts.rows || [], invoiceLinkedReceipts, agreementLinkedReceipts));

    const directCreditNotes = await this.fetchPaged('credit_notes', source, { page: 1, pageSize: 500 }, query => query.order('credit_note_date', { ascending: false, nullsFirst: false })).catch(error => {
      console.info('[Client Overview] direct credit notes unavailable', error?.message || error);
      return { rows: [] };
    });

    const invoiceLinkedCreditNotes = await this.fetchLinkedRowsByColumns_('credit_notes', {
      invoice_id: this.extractUuidKeys_(invoiceRows, ['id', 'invoice_uuid', 'invoice_id']),
      invoice_number: this.extractTextKeys_(invoiceRows, ['invoice_number', 'invoice_id', 'invoice_no'])
    }, query => query.order('credit_note_date', { ascending: false, nullsFirst: false })).catch(error => {
      console.info('[Client Overview] invoice-linked credit notes unavailable', error?.message || error);
      return [];
    });

    const agreementLinkedCreditNotes = await this.fetchLinkedRowsByColumns_('credit_notes', {
      agreement_id: this.extractUuidKeys_(agreementRows, ['id', 'agreement_uuid', 'agreement_id']),
      agreement_number: this.extractTextKeys_(agreementRows, ['agreement_number', 'agreement_id', 'agreement_no'])
    }, query => query.order('credit_note_date', { ascending: false, nullsFirst: false })).catch(error => {
      console.info('[Client Overview] agreement-linked credit notes unavailable', error?.message || error);
      return [];
    });

    const creditNoteRows = this.sortClientRowsForTable_('credit_notes', this.mergeUniqueClientRows_(directCreditNotes.rows || [], invoiceLinkedCreditNotes, agreementLinkedCreditNotes));

    const invoices = { ...directInvoices, rows: invoiceRows, total: invoiceRows.length, totalPages: Math.max(Math.ceil(invoiceRows.length / Math.max(Number(directInvoices.pageSize || 250), 1)), 1) };
    const receipts = { ...directReceipts, rows: receiptRows, total: receiptRows.length, totalPages: Math.max(Math.ceil(receiptRows.length / Math.max(Number(directReceipts.pageSize || 250), 1)), 1) };
    const creditNotes = { ...directCreditNotes, rows: creditNoteRows, total: creditNoteRows.length, totalPages: Math.max(Math.ceil(creditNoteRows.length / Math.max(Number(directCreditNotes.pageSize || 250), 1)), 1) };

    const agreementItems = await this.fetchLinkedRowsByColumns_('agreement_items', {
      agreement_id: this.extractUuidKeys_(agreementRows, ['id', 'agreement_uuid', 'agreement_id']),
      agreement_number: this.extractTextKeys_(agreementRows, ['agreement_number', 'agreement_id', 'agreement_no'])
    });

    const invoiceItems = await this.fetchLinkedRowsByColumns_('invoice_items', {
      invoice_id: this.extractUuidKeys_(invoiceRows, ['id', 'invoice_uuid', 'invoice_id']),
      invoice_number: this.extractTextKeys_(invoiceRows, ['invoice_number', 'invoice_id', 'invoice_no'])
    });

    const receiptItems = await this.fetchLinkedRowsByColumns_('receipt_items', {
      receipt_id: this.extractUuidKeys_(receiptRows, ['id', 'receipt_uuid', 'receipt_id']),
      receipt_number: this.extractTextKeys_(receiptRows, ['receipt_number', 'receipt_id', 'receipt_no'])
    });

    return {
      rows: source?.client_id || source?.id ? [source] : [],
      total: source?.client_id || source?.id ? 1 : 0,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      detail: source,
      agreements,
      invoices,
      receipts,
      creditNotes,
      credit_notes: creditNotes,
      agreementItems: { rows: agreementItems, total: agreementItems.length, page: 1, pageSize: agreementItems.length || 25, totalPages: 1 },
      invoiceItems: { rows: invoiceItems, total: invoiceItems.length, page: 1, pageSize: invoiceItems.length || 25, totalPages: 1 },
      receiptItems: { rows: receiptItems, total: receiptItems.length, page: 1, pageSize: receiptItems.length || 25, totalPages: 1 }
    };
  },
  async getClientAgreements(clientOrId = {}, options = {}) {
    return this.fetchPaged('agreements', clientOrId, options, query => query.order('updated_at', { ascending: false, nullsFirst: false }));
  },
  async getClientInvoices(clientOrId = {}, options = {}) {
    return this.fetchPaged('invoices', clientOrId, options, query => query.order('updated_at', { ascending: false, nullsFirst: false }));
  },
  async getClientReceipts(clientOrId = {}, options = {}) {
    return this.fetchPaged('receipts', clientOrId, options, query => query.order('updated_at', { ascending: false, nullsFirst: false }));
  },
  async getClientRenewalsPayments(clientOrId = {}, options = {}) {
    const overview = await this.getClientOverview(clientOrId);
    return {
      ...overview,
      rows: [],
      renewalRows: [],
      total: overview.invoiceItems?.total || overview.invoices?.total || 0,
      page: Math.max(Number(options.page || 1), 1),
      pageSize: Math.max(Number(options.pageSize || options.limit || 25), 1),
      totalPages: 1
    };
  },
  async getClientStatementOfAccount(clientOrId = {}, options = {}) {
    const overview = await this.getClientOverview(clientOrId);
    const invoices = overview.invoices || { rows: [] };
    const receipts = overview.receipts || { rows: [] };
    const creditNotes = overview.creditNotes || overview.credit_notes || { rows: [] };
    const rows = [
      ...(invoices.rows || []).map(inv => ({ ...inv, type: 'Invoice', date: inv.invoice_date || inv.issue_date || inv.created_at, document_no: inv.invoice_number || inv.invoice_id || inv.id, debit: inv.grand_total || inv.invoice_total || inv.total_amount || 0, credit: 0, due_date: inv.due_date, status: inv.status || inv.payment_state })),
      ...(receipts.rows || []).map(rec => ({ ...rec, type: 'Receipt', date: rec.receipt_date || rec.payment_date || rec.created_at, document_no: rec.receipt_number || rec.receipt_id || rec.id, debit: 0, credit: rec.received_amount || rec.amount_received || rec.amount_paid || rec.paid_amount || rec.amount || 0, due_date: '', status: rec.status || rec.payment_state })),
      ...(creditNotes.rows || []).filter(note => !['cancelled','canceled','void','voided','deleted','rejected'].includes(String(note.status || '').trim().toLowerCase())).map(note => ({ ...note, type: 'Credit Note', date: note.credit_note_date || note.created_at, document_no: note.credit_note_number || note.credit_note_id || note.id, debit: 0, credit: note.credit_amount || note.amount || 0, due_date: '', status: note.status || 'issued', reference: note.invoice_number || note.invoice_id || '' }))
    ].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
    let running = 0;
    rows.forEach(row => { running += Number(row.debit || 0) - Number(row.credit || 0); row.running_balance = running; });
    const total = rows.length;
    const { page, pageSize, from, to } = this.normalizePagedOptions(options);
    return { ...overview, rows: rows.slice(from, to + 1), statementRows: rows, invoices, receipts, creditNotes, credit_notes: creditNotes, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
  },
  async getClientOnboarding(clientOrId = {}, options = {}) {
    return this.fetchPaged('onboarding_requests', clientOrId, options, query => query.order('created_at', { ascending: false, nullsFirst: false }));
  },
  async getClientTechnicalRequests(clientOrId = {}, options = {}) {
    return this.fetchPaged('technical_requests', clientOrId, options, query => query.order('created_at', { ascending: false, nullsFirst: false }));
  },
  async getClientCsmActivity(clientOrId = {}, options = {}) {
    return this.fetchPaged('csm_activities', clientOrId, options, query => query.order('created_at', { ascending: false, nullsFirst: false }));
  },

  async getClientScheduledPayments(client = {}, options = {}) {
    const sourceClient = client && typeof client === 'object' ? client : { client_id: client };
    const { page, pageSize, from, to } = this.normalizePagedOptions(options);

    // Use the real invoice_payment_schedule rows as the source of truth.
    // The legacy client_scheduled_payments view can calculate/display dates from invoice data,
    // which caused cases like SA/2026/53 to show the wrong first payment date.
    const invoiceOverview = await this.getClientOverview(sourceClient).catch(() => ({ invoices: { rows: [] } }));
    const invoices = invoiceOverview.invoices?.rows || [];

    const invoiceByKey = new Map();
    invoices.forEach(invoice => {
      [invoice.id, invoice.invoice_uuid, invoice.invoice_id, invoice.invoice_number, invoice.invoice_no]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .forEach(key => invoiceByKey.set(key, invoice));
    });

    const scheduleRows = await this.fetchLinkedRowsByColumns_('invoice_payment_schedule', {
      invoice_id: this.extractUuidKeys_(invoices, ['id', 'invoice_uuid', 'invoice_id']),
      invoice_number: this.extractTextKeys_(invoices, ['invoice_number', 'invoice_id', 'invoice_no'])
    }, query => query.order('due_date', { ascending: true, nullsFirst: false }).order('schedule_no', { ascending: true, nullsFirst: false })).catch(error => {
      console.info('[Client Scheduled Payments] invoice_payment_schedule unavailable; trying client_scheduled_payments view', error?.message || error);
      return [];
    });

    if (scheduleRows.length) {
      const enrichedRows = scheduleRows.map(schedule => {
        const invoice = invoiceByKey.get(String(schedule.invoice_id || '').trim()) || invoiceByKey.get(String(schedule.invoice_number || '').trim()) || {};
        return {
          ...schedule,
          schedule_id: schedule.schedule_id || schedule.id,
          invoice_id: schedule.invoice_id || invoice.id || invoice.invoice_id || '',
          invoice_number: invoice.invoice_number || schedule.invoice_number || '',
          invoice_reference_fallback: invoice.invoice_id || invoice.display_id || '',
          invoice_status: invoice.status || invoice.invoice_status || '',
          client_id: invoice.client_id || schedule.client_id || '',
          company_id: invoice.company_id || schedule.company_id || '',
          client_name: invoice.customer_legal_name || invoice.customer_name || invoice.company_name || schedule.client_name || '',
          currency: schedule.currency || invoice.currency || 'USD',
          raw: invoice
        };
      });
      const rows = this.sortClientRowsForTable_('invoice_payment_schedule', enrichedRows);
      return options.returnArray === true ? rows.slice(from, to + 1) : this.pagedResult(rows.slice(from, to + 1), rows.length, page, pageSize);
    }

    const viewRows = await this.fetchPaged('client_scheduled_payments', sourceClient, { page: 1, pageSize: Math.max(to + 1, 100) }, query => query.order('due_date', { ascending: true, nullsFirst: false }).order('schedule_no', { ascending: true, nullsFirst: false })).catch(error => {
      console.info('[Client Scheduled Payments] fallback view unavailable', error?.message || error);
      return this.pagedResult([], 0, 1, Math.max(to + 1, 100));
    });
    const rows = this.sortClientRowsForTable_('client_scheduled_payments', viewRows.rows || []);
    return options.returnArray === true ? rows.slice(from, to + 1) : this.pagedResult(rows.slice(from, to + 1), rows.length, page, pageSize);
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
      if (options.receipt_date !== undefined) payload.receipt_date = options.receipt_date;
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
    if (this.shouldSkipWorkflowForDraftSave({
      currentStatus: body.current_status,
      nextStatus: body.requested_status || body.next_status,
      action: body.action,
      payload: body
    })) {
      return this.draftWorkflowSkipResult();
    }
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
    const requested = source.requested_changes && typeof source.requested_changes === 'object' ? source.requested_changes : {};
    if (this.shouldSkipWorkflowForDraftSave({
      currentStatus: source.old_status ?? source.p_old_status ?? requested.current_status,
      nextStatus: source.new_status ?? source.p_new_status ?? requested.requested_status ?? requested.next_status ?? requested.status,
      action: source.action || requested.action || 'create_workflow_approval',
      payload: { ...requested, ...source }
    })) {
      return this.draftWorkflowSkipResult();
    }
    const approvalPayload = {
      resource: source.resource ?? source.p_resource ?? '',
      p_resource: source.resource ?? source.p_resource ?? '',
      target_workflow_resource: source.target_workflow_resource ?? source.target_resource ?? source.resource ?? source.p_resource ?? '',
      target_resource: source.target_resource ?? source.target_workflow_resource ?? source.resource ?? source.p_resource ?? '',
      record_id: source.record_id ?? source.p_record_id ?? source.resource_id ?? source.target_id ?? '',
      resource_id: source.resource_id ?? source.record_id ?? source.p_record_id ?? source.target_id ?? '',
      target_id: source.target_id ?? source.record_id ?? source.p_record_id ?? source.resource_id ?? '',
      resource_display_id: source.resource_display_id ?? source.display_id ?? '',
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
