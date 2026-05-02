const BASE_PERMISSION_MATRIX = Object.freeze({
  tickets: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev', 'viewer', 'hoo'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev'],
    internal_filters: ['admin', 'dev']
  }),
  events: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev']
  }),
  csm: Object.freeze({
    list: ['admin', 'viewer', 'hoo'],
    get: ['admin', 'viewer', 'hoo'],
    create: ['admin', 'hoo'],
    update: ['admin', 'hoo'],
    delete: ['admin', 'hoo']
  }),
  leads: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev', 'viewer', 'hoo'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev'],
    convert_to_deal: ['admin', 'dev']
  }),
  companies: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev'],
    export: ['admin', 'dev']
  }),
  contacts: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev'],
    export: ['admin', 'dev']
  }),
  deals: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev']
  }),
  proposal_catalog: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev']
  }),
  proposals: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev'],
    create_from_deal: ['admin', 'dev'],
    generate_proposal_html: ['admin', 'dev', 'viewer', 'hoo']
  }),
  agreements: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev'],
    create_from_proposal: ['admin', 'dev'],
    generate_agreement_html: ['admin', 'dev', 'viewer', 'hoo'],
    send_to_operations: ['admin', 'hoo'],
    request_incheck_lite: ['admin', 'hoo'],
    request_incheck_full: ['admin', 'hoo'],
    assign_csm: ['admin', 'hoo'],
    update_onboarding_status: ['admin', 'hoo']
  }),
  operations_onboarding: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'hoo'],
    update: ['admin', 'hoo'],
    delete: ['admin']
  }),
  technical_admin_requests: Object.freeze({
    list: ['admin', 'dev', 'hoo'],
    get: ['admin', 'dev', 'hoo'],
    create: ['admin', 'dev', 'hoo'],
    update_status: ['admin', 'dev', 'hoo']
  }),
  invoices: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev'],
    create_from_agreement: ['admin', 'dev'],
    generate_invoice_html: ['admin', 'dev', 'viewer', 'hoo']
  }),
  receipts: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev'],
    update: ['admin', 'dev'],
    delete: ['admin', 'dev'],
    create_from_invoice: ['admin', 'dev'],
    generate_receipt_html: ['admin', 'dev', 'viewer', 'hoo']
  }),
  clients: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get: ['admin', 'dev', 'viewer', 'hoo'],
    view_renewals: ['admin', 'dev', 'viewer', 'hoo'],
    view_statement: ['admin', 'dev', 'viewer', 'hoo'],
    statement_view: ['admin', 'dev', 'viewer', 'hoo'],
    statement_export: ['admin', 'dev', 'viewer', 'hoo'],
    create: ['admin', 'dev', 'hoo'],
    update: ['admin', 'dev', 'hoo'],
    delete: ['admin', 'dev']
  }),
  analytics: Object.freeze({ list: ['admin', 'dev', 'viewer', 'hoo'] }),
  insights: Object.freeze({ list: ['admin', 'dev', 'viewer', 'hoo'] }),
  ai_insights: Object.freeze({ list: ['admin', 'dev', 'viewer', 'hoo'] }),
  notifications: Object.freeze({
    list: ['admin', 'dev', 'viewer', 'hoo'],
    get_unread_count: ['admin', 'dev', 'viewer', 'hoo'],
    mark_read: ['admin', 'dev', 'viewer', 'hoo'],
    mark_all_read: ['admin', 'dev', 'viewer', 'hoo']
  }),
  notification_settings: Object.freeze({
    list: ['admin'],
    upsert: ['admin'],
    bulk_upsert: ['admin'],
    reset_defaults: ['admin'],
    test_notification: ['admin']
  }),
  users: Object.freeze({ list: ['admin'], get: ['admin'], create: ['admin'], update: ['admin'], delete: ['admin'], activate: ['admin'], deactivate: ['admin'] }),
  roles: Object.freeze({ list: ['admin'], get: ['admin'], create: ['admin'], update: ['admin'], delete: ['admin'] }),
  role_permissions: Object.freeze({ list: ['admin', 'dev'], get: ['admin', 'dev'], create: ['admin'], update: ['admin'], delete: ['admin'] }),
  workflow: Object.freeze({
    list: ['admin', 'dev'],
    get: ['admin', 'dev'],
    save: ['admin', 'dev'],
    delete: ['admin'],
    request_approval: ['admin', 'dev', 'hoo'],
    approve: ['admin', 'hoo'],
    reject: ['admin', 'hoo'],
    list_pending_approvals: ['admin', 'dev', 'hoo'],
    list_audit: ['admin', 'dev']
  }),
  planner: Object.freeze({ manage: ['admin', 'dev'] }),
  freeze_windows: Object.freeze({ manage: ['admin', 'dev'] })
});

const Permissions = {
  baseMatrix: BASE_PERMISSION_MATRIX,
  tabPermissionRequirements: Object.freeze({
    issues: [{ resource: 'tickets', action: 'list' }],
    calendar: [{ resource: 'events', action: 'list' }],
    insights: [{ resource: 'ai_insights', action: 'preview' }, { resource: 'ai_insights', action: 'view' }, { resource: 'ai_insights', action: 'get' }, { resource: 'ai_insights', action: 'list' }, { resource: 'ai_insights', action: 'manage' }],
    csm: [{ resource: 'csm', action: 'list' }],
    company: [{ resource: 'companies', action: 'list' }],
    contacts: [{ resource: 'contacts', action: 'list' }],
    leads: [{ resource: 'leads', action: 'list' }],
    deals: [{ resource: 'deals', action: 'list' }],
    proposals: [{ resource: 'proposals', action: 'list' }],
    agreements: [{ resource: 'agreements', action: 'list' }],
    operationsOnboarding: [{ resource: 'operations_onboarding', action: 'list' }],
    technicalAdmin: [{ resource: 'technical_admin_requests', action: 'list' }],
    invoices: [{ resource: 'invoices', action: 'list' }],
    receipts: [{ resource: 'receipts', action: 'list' }],
    lifecycleAnalytics: [{ resource: 'analytics', action: 'list' }],
    clients: [{ resource: 'clients', action: 'list' }],
    proposalCatalog: [{ resource: 'proposal_catalog', action: 'list' }],
    notifications: [{ resource: 'notifications', action: 'list' }],
    notificationSetup: [{ resource: 'notification_settings', action: 'list' }],
    workflow: [{ resource: 'workflow', action: 'list' }],
    users: [{ resource: 'users', action: 'list' }],
    rolePermissions: [{ resource: 'role_permissions', action: 'list' }]
  }),
  tabResourceMap: {
    issues: null,
    calendar: 'events',
    insights: 'ai_insights',
    csm: 'csm',
    company: 'companies',
    contacts: 'contacts',
    leads: 'leads',
    deals: 'deals',
    proposals: 'proposals',
    agreements: 'agreements',
    operationsOnboarding: 'operations_onboarding',
    technicalAdmin: 'technical_admin_requests',
    invoices: 'invoices',
    receipts: 'receipts',
    lifecycleAnalytics: 'analytics',
    clients: 'clients',
    proposalCatalog: 'proposal_catalog',
    notifications: 'notifications',
    notificationSetup: 'notification_settings',
    users: 'users',
    rolePermissions: 'role_permissions',
    workflow: 'workflow'
  },
  state: {
    loaded: false,
    loading: false,
    rows: [],
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    total: 0,
    matrix: new Map()
  },
  actionAliasMap: Object.freeze({
    view: ['list', 'get'],
    manage: ['view', 'list', 'get', 'create', 'save', 'update', 'delete', 'export']
  }),
  createMatrixEntry() {
    return {
      hasAnyRow: false,
      allowedRoles: new Set(),
      deniedRoles: new Set()
    };
  },
  normalizeRole(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');
  },
  extractRows(response) {
    const parseJsonIfNeeded = value => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) return value;
      try {
        return JSON.parse(trimmed);
      } catch (_error) {
        return value;
      }
    };
    const coerceRows = value => {
      const parsed = parseJsonIfNeeded(value);
      if (Array.isArray(parsed)) return parsed;
      if (!parsed || typeof parsed !== 'object') return [];

      const objectValues = Object.values(parsed).filter(Boolean);
      if (objectValues.length && objectValues.every(item => item && typeof item === 'object')) {
        const hasRuleLikeShape = objectValues.some(
          item => 'resource' in item || 'action' in item || 'allowed_roles' in item || 'allowed_roles_csv' in item
        );
        if (hasRuleLikeShape) return objectValues;
      }
      return [];
    };
    const candidates = [
      response,
      response?.items,
      response?.rows,
      response?.permissions,
      response?.data,
      response?.result,
      response?.payload,
      response?.data?.items,
      response?.data?.rows
    ];
    for (const candidate of candidates) {
      const rows = coerceRows(candidate);
      if (rows.length) return rows;
    }
    return [];
  },
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
  normalizeAllowedRoles(row = {}) {
    const normalizedFromArray = Array.isArray(row.allowed_roles)
      ? row.allowed_roles.map(v => this.normalizeRole(v)).filter(Boolean)
      : [];
    if (normalizedFromArray.length) return normalizedFromArray;

    const normalizedFromCsv = String(row.allowed_roles_csv || '')
      .split(',')
      .map(v => this.normalizeRole(v))
      .filter(Boolean);
    if (normalizedFromCsv.length) return normalizedFromCsv;

    const hasSupabaseRoleRow = row && typeof row === 'object' && 'role_key' in row && 'is_allowed' in row;
    if (hasSupabaseRoleRow && Boolean(row.is_allowed)) {
      const normalizedRoleKey = this.normalizeRole(row.role_key);
      return normalizedRoleKey ? [normalizedRoleKey] : [];
    }

    return [];
  },
  toBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    return defaultValue;
  },
  canLoadRuntimeMatrix(role = Session.role()) {
    const normalizedRole = this.normalizeRole(role);
    return normalizedRole === ROLES.ADMIN || normalizedRole === ROLES.DEV;
  },
  resourceAliases(resource) {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    if (normalizedResource === 'csm') return ['csm', 'csm_activities'];
    if (normalizedResource === 'csm_activities') return ['csm_activities', 'csm'];
    return [normalizedResource];
  },
  buildMatrixFromRows(rows = []) {
    const matrix = new Map();
    let totalActiveRows = 0;
    let totalDeniedRows = 0;
    rows.forEach(row => {
      const resource = String(row.resource || '').trim().toLowerCase();
      const action = String(row.action || '').trim().toLowerCase();
      if (!resource || !action) return;
      const key = `${resource}:${action}`;
      const existing = matrix.get(key) || this.createMatrixEntry();
      existing.hasAnyRow = true;
      const isRowAllowed = this.toBoolean(row.is_allowed, true);
      const isRowActive = this.toBoolean(row.is_active, true);
      const normalizedAllowedRoles = this.normalizeAllowedRoles(row);
      const normalizedRoleKey = this.normalizeRole(row.role_key);
      if (!isRowActive) {
        matrix.set(key, existing);
        return;
      }
      totalActiveRows += 1;
      if (normalizedRoleKey) {
        if (isRowAllowed) {
          existing.allowedRoles.add(normalizedRoleKey);
          existing.deniedRoles.delete(normalizedRoleKey);
        } else {
          existing.deniedRoles.add(normalizedRoleKey);
          existing.allowedRoles.delete(normalizedRoleKey);
          totalDeniedRows += 1;
        }
      }
      if (isRowAllowed) normalizedAllowedRoles.forEach(roleValue => existing.allowedRoles.add(roleValue));
      matrix.set(key, existing);
    });
    return { matrix, totalActiveRows, totalDeniedRows };
  },
  async loadMatrix(force = false) {
    if (!Session.isAuthenticated()) {
      this.reset();
      return [];
    }
    if (this.state.loading && !force) return this.state.rows;
    const currentRole = this.normalizeRole(Session.role());
    this.state.loading = true;
    try {
      let rows = [];
      let total = 0;
      let limit = Number(this.state.limit || 50);
      if (this.canLoadRuntimeMatrix(currentRole)) {
        let page = 1;
        let hasMore = true;
        let lastNormalized = null;
        while (hasMore) {
          const response = await Api.listRolePermissions({
            limit: this.state.limit,
            page,
            summary_only: true,
            forceRefresh: force
          });
          const normalized = this.extractListResult(response);
          rows.push(...normalized.rows);
          hasMore = Boolean(normalized.hasMore);
          lastNormalized = normalized;
          page += 1;
          if (page > 500) break;
        }
        total = Number(lastNormalized?.total ?? rows.length) || rows.length;
        limit = Number(lastNormalized?.limit || this.state.limit || 50);
      } else {
        const client = window.SupabaseClient?.getClient?.();
        if (!client || typeof client.rpc !== 'function') {
          throw new Error('Supabase RPC client is unavailable for get_my_role_permissions');
        }
        const { data, error } = await client.rpc('get_my_role_permissions');
        if (error) throw error;
        rows = this.extractRows(data);
        total = rows.length;
      }
      const { matrix, totalActiveRows, totalDeniedRows } = this.buildMatrixFromRows(rows);
      this.state.rows = rows;
      this.state.total = total;
      this.state.returned = rows.length;
      this.state.hasMore = false;
      this.state.page = 1;
      this.state.limit = limit;
      this.state.offset = 0;
      this.state.matrix = matrix;
      console.log('[Permissions] matrix loaded', JSON.stringify({
        role: currentRole,
        totalRowsLoaded: rows.length,
        totalActiveRows,
        totalDeniedRows,
        matrixKeyCount: matrix.size,
        sampleRows: rows.slice(0, 10)
      }, null, 2));
      console.info('[Permissions] matrix loaded stats', {
        totalActiveRows,
        totalDeniedRows
      });
      this.state.loaded = true;
      return rows;
    } catch (error) {
      this.state.rows = [];
      this.state.matrix = new Map();
      const isPermErr =
        typeof window !== 'undefined' && typeof window.isPermissionError === 'function'
          ? window.isPermissionError(error)
          : String(error?.message || '').toLowerCase().includes('forbidden') ||
            String(error?.message || '').toLowerCase().includes('cannot list');
      this.state.loaded = isPermErr;
      console.warn('[Permissions] loadMatrix error', { isPermErr, message: error?.message });
      return [];
    } finally {
      this.state.loading = false;
    }
  },
  reset() {
    this.state.loaded = false;
    this.state.loading = false;
    this.state.rows = [];
    this.state.matrix = new Map();
  },
  isReady() {
    return Boolean(this.state.loaded) && !this.state.loading;
  },
  requireReady(message = 'Permissions are still loading. Please wait.') {
    if (this.isReady()) return true;
    UI?.toast?.(message);
    return false;
  },
  can(resource, action, options = {}) {
    if (!Session.isAuthenticated()) return false;
    const role = this.normalizeRole(Session.role());
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!normalizedResource || !normalizedAction) return false;

    if (!role) {
      if (typeof options.fallback === 'boolean') return options.fallback;
      return false;
    }

    return this.canPerformAction(normalizedResource, normalizedAction, role, options);
  },
  hasMatrixPermission(resource, action, role = Session.role()) {
    return this.canPerformAction(resource, action, role);
  },
  getBaseAllowedRoles(resource, action) {
    const resourceAliases = this.resourceAliases(resource);
    const candidateActions = this.getActionCandidates(action);
    const allowedRoles = new Set();
    resourceAliases.forEach(candidateResource => {
      candidateActions.forEach(candidateAction => {
        const allowedByBase = this.baseMatrix?.[candidateResource]?.[candidateAction];
        if (!Array.isArray(allowedByBase)) return;
        allowedByBase
          .map(value => this.normalizeRole(value))
          .filter(Boolean)
          .forEach(roleValue => allowedRoles.add(roleValue));
      });
    });
    return [...allowedRoles];
  },
  getActionCandidates(action) {
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!normalizedAction) return [];
    const candidates = new Set([normalizedAction]);
    Object.entries(this.actionAliasMap).forEach(([parentAction, impliedActions]) => {
      if (!Array.isArray(impliedActions)) return;
      if (impliedActions.includes(normalizedAction)) candidates.add(parentAction);
    });
    return [...candidates];
  },
  roleMatchesRow(row = {}, role = '') {
    const normalizedRole = this.normalizeRole(role);
    if (!normalizedRole) return false;
    const directRole = this.normalizeRole(row.role_key);
    const groupedRoles = this.normalizeAllowedRoles(row);
    return directRole === normalizedRole || groupedRoles.includes(normalizedRole);
  },
  getMatchedRows(resource, action, role = Session.role(), options = {}) {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const resourceAliases = this.resourceAliases(normalizedResource);
    const normalizedRole = this.normalizeRole(role);
    const candidateActions = this.getActionCandidates(action);
    if (!normalizedResource || !candidateActions.length || !normalizedRole) return [];
    const includeDenied = options.includeDenied !== false;
    return this.state.rows
      .filter(row => {
        const rowResource = String(row.resource || '').trim().toLowerCase();
        const rowAction = String(row.action || '').trim().toLowerCase();
        if (!resourceAliases.includes(rowResource) || !candidateActions.includes(rowAction)) return false;
        if (this.toBoolean(row.is_active, true) === false) return false;
        const isAllowed = this.toBoolean(row.is_allowed, true);
        if (!isAllowed && !includeDenied) return false;
        return this.roleMatchesRow(row, normalizedRole);
      })
      .map(row => ({
        role_key: this.normalizeRole(row.role_key),
        resource: String(row.resource || '').trim().toLowerCase(),
        action: String(row.action || '').trim().toLowerCase(),
        is_allowed: this.toBoolean(row.is_allowed, true),
        is_active: this.toBoolean(row.is_active, true),
        allowed_roles: this.normalizeAllowedRoles(row)
      }));
  },
  getMatrixEntry(resource, action) {
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const normalizedAction = String(action || '').trim().toLowerCase();
    const aliases = this.resourceAliases(normalizedResource);
    const merged = this.createMatrixEntry();
    let hasAny = false;
    aliases.forEach(alias => {
      const existing = this.state.matrix.get(`${alias}:${normalizedAction}`);
      if (!existing) return;
      hasAny = true;
      if (Array.isArray(existing)) {
        existing.forEach(roleValue => merged.allowedRoles.add(this.normalizeRole(roleValue)));
        merged.hasAnyRow = merged.hasAnyRow || existing.length > 0;
        return;
      }
      merged.hasAnyRow = merged.hasAnyRow || Boolean(existing.hasAnyRow);
      existing.allowedRoles?.forEach(roleValue => merged.allowedRoles.add(this.normalizeRole(roleValue)));
      existing.deniedRoles?.forEach(roleValue => merged.deniedRoles.add(this.normalizeRole(roleValue)));
    });
    return hasAny ? merged : null;
  },
  decidePermission(resource, action, role = Session.role(), options = {}) {
    const currentRole = this.normalizeRole(role);
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!currentRole || !normalizedResource || !normalizedAction) return false;

    if (!this.isReady()) {
      return currentRole === ROLES.ADMIN;
    }

    const matchedRows = this.getMatchedRows(normalizedResource, normalizedAction, currentRole, { includeDenied: true });
    const hasDeniedRow = matchedRows.some(row => row.is_active === true && row.is_allowed === false);
    const hasAllowedRow = matchedRows.some(row => row.is_active === true && row.is_allowed === true);

    let decision = false;
    if (hasDeniedRow) decision = false;
    else if (hasAllowedRow) decision = true;
    else if (currentRole === ROLES.ADMIN) decision = true;

    console.log('[permissions check]', JSON.stringify({
      role: currentRole,
      resource: normalizedResource,
      action: normalizedAction,
      aliases: this.resourceAliases(normalizedResource),
      matchedRows,
      result: decision
    }, null, 2));
    return decision;
  },
  getTabPermissionRequirements(viewKey) {
    const key = String(viewKey || '').trim();
    if (!key) return [];
    const explicit = this.tabPermissionRequirements[key];
    if (Array.isArray(explicit) && explicit.length) return explicit;
    const fallbackResource = this.tabResourceMap[key];
    if (!fallbackResource) return [];
    return [{ resource: fallbackResource, action: 'list' }];
  },
  canPerformAction(resource, action, role = Session.role(), options = {}) {
    return this.decidePermission(resource, action, role, options);
  },
  canView(resource, role = Session.role()) {
    return this.canPerformAction(resource, 'list', role) || this.canPerformAction(resource, 'get', role) || this.canPerformAction(resource, 'view', role) || this.canPerformAction(resource, 'manage', role);
  },
  canCreate(resource, role = Session.role()) {
    return this.canPerformAction(resource, 'create', role) || this.canPerformAction(resource, 'manage', role);
  },
  canEdit(resource, role = Session.role()) {
    return this.canPerformAction(resource, 'update', role) || this.canPerformAction(resource, 'manage', role);
  },
  canDelete(resource, role = Session.role()) {
    return this.canPerformAction(resource, 'delete', role) || this.canPerformAction(resource, 'manage', role);
  },
  canExport(resource, role = Session.role()) {
    return this.canPerformAction(resource, 'export', role) || this.canPerformAction(resource, 'manage', role);
  },
  isAdmin() {
    return this.normalizeRole(Session.role()) === ROLES.ADMIN;
  },
  isDev() {
    return this.normalizeRole(Session.role()) === ROLES.DEV;
  },
  isHoo() {
    return this.normalizeRole(Session.role()) === ROLES.HOO;
  },
  isViewer() {
    return this.normalizeRole(Session.role()) === ROLES.VIEWER;
  },
  isAdminLike() {
    return this.isAdmin() || this.isDev();
  },
  canCreateTicket() {
    return this.canPerformAction('tickets', 'create') || this.canPerformAction('tickets', 'manage');
  },
  canCreateLead() {
    return this.canCreate('leads');
  },
  canViewCsmActivity() {
    return this.canView('csm_activities');
  },
  canExportCsmActivity() {
    return this.canExport('csm_activities');
  },
  canCreateCsmActivity() {
    return this.canCreate('csm_activities');
  },
  canUpdateCsmActivity() {
    return this.canEdit('csm_activities');
  },
  canDeleteCsmActivity() {
    return this.canDelete('csm_activities');
  },
  canManageCsmActivity() {
    return this.canUpdateCsmActivity() || this.canDeleteCsmActivity();
  },
  canEditTicket() {
    return this.canPerformAction('tickets', 'update') || this.canPerformAction('tickets', 'manage');
  },
  canUpdateLead() {
    return this.canEdit('leads');
  },
  canDeleteLead() {
    return this.canDelete('leads');
  },
  canEditDeleteLead() {
    return this.canUpdateLead() || this.canDeleteLead();
  },
  canManageEvents() {
    return (
      this.canCreate('events') ||
      this.canEdit('events') ||
      this.canDelete('events')
    );
  },
  canManageUsers() {
    return this.canView('users');
  },
  canManageRolesPermissions() {
    return this.isAdmin();
  },
  canManageNotificationSettings() {
    return this.canPerformAction('notification_settings', 'list');
  },
  canManageWorkflow() {
    return this.canView('workflow');
  },
  canEditRolesPermissions() {
    return (
      this.canEdit('roles') ||
      this.canEdit('role_permissions')
    );
  },
  canCreateProposal() {
    return this.canCreate('proposals') || this.canPerformAction('proposals', 'manage');
  },
  canUpdateProposal() {
    return this.canEdit('proposals') || this.canPerformAction('proposals', 'manage');
  },
  canDeleteProposal() {
    return this.canDelete('proposals');
  },
  canCreateProposalFromDeal() {
    return (
      this.canPerformAction('deals', 'convert_to_proposal') ||
      this.canPerformAction('proposals', 'create_from_deal') ||
      this.canPerformAction('proposals', 'create') ||
      this.canPerformAction('proposals', 'manage')
    );
  },
  canPreviewProposal() {
    return (
      this.canPerformAction('proposals', 'preview') ||
      this.canPerformAction('proposals', 'get') ||
      this.canPerformAction('proposals', 'manage')
    );
  },
  canGenerateProposalHtml() {
    return this.canPreviewProposal();
  },
  canCreateAgreement() {
    return this.canCreate('agreements') || this.canPerformAction('agreements', 'manage');
  },
  canUpdateAgreement() {
    return this.canEdit('agreements') || this.canPerformAction('agreements', 'manage');
  },
  canDeleteAgreement() {
    return this.canDelete('agreements');
  },
  canPreviewAgreement() {
    return (
      this.canPerformAction('agreements', 'preview') ||
      this.canPerformAction('agreements', 'get') ||
      this.canPerformAction('agreements', 'manage')
    );
  },
  canGenerateAgreementHtml() {
    return this.canPreviewAgreement();
  },
  canCreateAgreementFromProposal() {
    return this.canPerformAction('proposals', 'convert_to_agreement') ||
      this.canPerformAction('agreements', 'create_from_proposal') ||
      this.canCreate('agreements');
  },
  canViewOperationsOnboarding() {
    return this.canView('operations_onboarding');
  },
  canViewTechnicalAdmin() {
    return this.canView('technical_admin_requests');
  },
  canRequestTechnicalAdmin() {
    return this.canCreate('technical_admin_requests') ||
      this.canPerformAction('technical_admin_requests', 'manage') ||
      this.canPerformAction('operations_onboarding', 'request_technical_admin');
  },
  canAccessInsights() {
    return (
      this.canPerformAction('ai_insights', 'preview') ||
      this.canPerformAction('ai_insights', 'view') ||
      this.canPerformAction('ai_insights', 'get') ||
      this.canPerformAction('ai_insights', 'list') ||
      this.canPerformAction('ai_insights', 'manage')
    );
  },
  canManageTechnicalAdmin() {
    return this.canPerformAction('technical_admin_requests', 'update_status') ||
      this.canEdit('technical_admin_requests') ||
      this.canPerformAction('technical_admin_requests', 'manage');
  },
  canManageOperationsOnboarding() {
    return this.canEdit('operations_onboarding');
  },
  canSendAgreementToOperations() {
    return this.canPerformAction('agreements', 'send_to_operations');
  },
  canRequestAgreementIncheckLite() {
    return this.canPerformAction('agreements', 'request_incheck_lite');
  },
  canRequestAgreementIncheckFull() {
    return this.canPerformAction('agreements', 'request_incheck_full');
  },
  canAssignAgreementCsm() {
    return this.canPerformAction('agreements', 'assign_csm');
  },
  canUpdateAgreementOnboardingStatus() {
    return this.canPerformAction('agreements', 'update_onboarding_status');
  },


  canViewInvoices() {
    return this.canView('invoices');
  },
  canCreateInvoice() {
    return this.canCreate('invoices');
  },
  canUpdateInvoice() {
    return this.canEdit('invoices');
  },
  canDeleteInvoice() {
    return this.canDelete('invoices');
  },
  canCreateInvoiceFromAgreement() {
    return this.canPerformAction('invoices', 'create_from_agreement');
  },
  canPreviewInvoice() {
    return this.canPerformAction('invoices', 'generate_invoice_html') || this.canView('invoices');
  },
  canViewReceipts() {
    return this.canView('receipts');
  },
  canCreateReceipt() {
    return this.canCreate('receipts');
  },
  canUpdateReceipt() {
    return this.canEdit('receipts');
  },
  canDeleteReceipt() {
    return this.canDelete('receipts');
  },
  canCreateReceiptFromInvoice() {
    return this.canPerformAction('receipts', 'create_from_invoice');
  },
  canPreviewReceipt() {
    return this.canPerformAction('receipts', 'generate_receipt_html') || this.canView('receipts');
  },
  canCreateProposalCatalogItem() {
    return this.canCreate('proposal_catalog') || this.canPerformAction('proposal_catalog_items', 'create');
  },
  canUpdateProposalCatalogItem() {
    return this.canEdit('proposal_catalog') || this.canPerformAction('proposal_catalog_items', 'update');
  },
  canDeleteProposalCatalogItem() {
    return this.canDelete('proposal_catalog') || this.canPerformAction('proposal_catalog_items', 'delete');
  },
  canViewClients() {
    return this.canView('clients');
  },
  canViewClientRenewals() {
    // Client profile renewals timeline is controlled by clients:view_renewals, not agreements:view.
    return this.canPerformAction('clients', 'view_renewals');
  },
  canChangePlanner() {
    return this.canPerformAction('planner', 'manage');
  },
  canManageFreezeWindows() {
    return this.canPerformAction('freeze_windows', 'manage');
  },
  canUseInternalIssueFilters() {
    return this.canPerformAction('tickets', 'internal_filters');
  },
  canAccessTab(viewKey) {
    const key = String(viewKey || '').trim();
    if (!key) return false;
    if (!Session.isAuthenticated()) return false;

    const requirements = this.getTabPermissionRequirements(key);
    if (!requirements.length) return true;

    return requirements.some(requirement => {
      if (!requirement || typeof requirement !== 'object') return false;
      const resource = String(requirement.resource || '').trim().toLowerCase();
      const action = String(requirement.action || '').trim().toLowerCase();
      if (!resource || !action) return false;
      return this.canPerformAction(resource, action);
    });
  }
};

function requirePermission(check, message) {
  if (check()) return true;
  UI.toast(message || 'You do not have permission for this action.');
  return false;
}

async function handleExpiredSession(message = 'Session expired. Please log in again.') {
  Session.clearClientSession();
  Permissions.reset();
  UI.applyRolePermissions();
  try {
    const loginIdentifierEl = document.getElementById('loginIdentifier');
    const loginPasscodeEl = document.getElementById('loginPasscode');
    if (loginIdentifierEl) loginIdentifierEl.value = '';
    if (loginPasscodeEl) loginPasscodeEl.value = '';
    const loginSection = document.getElementById('loginSection');
    if (loginSection) window.location.hash = '#loginSection';
    document.body.classList.add('auth-locked');
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.classList.add('is-locked');
      appEl.setAttribute('aria-hidden', 'true');
    }
  } catch {}
  UI.toast(message);
}


const PermissionAudit = {
  resources: ['tickets','events','ai_insights','companies','contacts','leads','deals','proposals','agreements','operations_onboarding','technical_admin_requests','invoices','receipts','clients','analytics','notifications','notification_settings','workflow','users','role_permissions'],
  actions: ['list','get','create','update','delete','export','manage','approve','reject','convert_to_deal','create_from_deal','create_from_proposal','create_from_agreement','create_from_invoice','assign_csm','update_status','view_renewals','view_statement','statement_view','statement_export'],
  inspect(resource, action) {
    const role = Permissions.normalizeRole(Session.role());
    const matchedRows = Permissions.getMatchedRows(resource, action, role, { includeDenied: true });
    const allowed = Permissions.can(resource, action);
    const denied = !allowed;
    return { role, resource, action, allowed, matchedRows: matchedRows.length, reason: denied ? 'denied' : 'allowed' };
  },
  run() {
    const rows = [];
    this.resources.forEach(resource => this.actions.forEach(action => rows.push(this.inspect(resource, action))));
    console.table(rows);
    return rows;
  },
  assertDenied(resource, action) {
    const result = this.inspect(resource, action);
    if (result.allowed) throw new Error(`Expected denied for ${resource}.${action}`);
    console.info('[PermissionAudit] assertDenied OK', result);
    return true;
  },
  assertAllowed(resource, action) {
    const result = this.inspect(resource, action);
    if (!result.allowed) throw new Error(`Expected allowed for ${resource}.${action}`);
    console.info('[PermissionAudit] assertAllowed OK', result);
    return true;
  }
};

window.PermissionAudit = PermissionAudit;
window.PermissionAudit.checkVisibleActions = function () {
  const rows = [];
  document.querySelectorAll('[data-permission-resource][data-permission-action]').forEach(node => {
    const resource = node.getAttribute('data-permission-resource');
    const action = node.getAttribute('data-permission-action');
    const allowed = Permissions.can(resource, action);
    const visible = !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
    rows.push({ text: (node.textContent || "").trim(), resource, action, allowed, visible, problem: visible && !allowed ? 'VISIBLE_BUT_DENIED' : '' });
  });
  console.table(rows);
  return rows;
};

window.AppPermissions = Permissions;
window.requirePermission = requirePermission;
window.handleExpiredSession = handleExpiredSession;

window.PermissionAudit.deniedVisible = function () {
  return window.PermissionAudit.checkVisibleActions().filter(row => row.problem);
};
