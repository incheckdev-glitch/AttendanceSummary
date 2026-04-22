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
    create: ['admin', 'dev', 'hoo'],
    update: ['admin', 'dev', 'hoo'],
    delete: ['admin', 'dev']
  }),
  analytics: Object.freeze({ list: ['admin', 'dev', 'viewer', 'hoo'] }),
  insights: Object.freeze({ list: ['admin', 'dev', 'viewer', 'hoo'] }),
  notifications: Object.freeze({ list: ['admin', 'dev', 'viewer', 'hoo'] }),
  users: Object.freeze({ list: ['admin'], get: ['admin'], create: ['admin'], update: ['admin'], delete: ['admin'], activate: ['admin'], deactivate: ['admin'] }),
  roles: Object.freeze({ list: ['admin'], get: ['admin'], create: ['admin'], update: ['admin'], delete: ['admin'] }),
  role_permissions: Object.freeze({ list: ['admin'], get: ['admin'], create: ['admin'], update: ['admin'], delete: ['admin'] }),
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
  tabResourceMap: {
    issues: null,
    calendar: 'events',
    insights: 'insights',
    csm: 'csm',
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
    users: 'users',
    roles: 'roles',
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
  async loadMatrix(force = false) {
    if (!Session.isAuthenticated()) {
      this.reset();
      return [];
    }
    if (this.state.loading && !force) return this.state.rows;
    this.state.loading = true;
    try {
      const response = await Api.listRolePermissions({
        limit: this.state.limit,
        page: this.state.page,
        summary_only: true,
        forceRefresh: force
      });
      const normalized = this.extractListResult(response);
      const rows = normalized.rows;
      const matrix = new Map();
      console.info('[Permissions] raw role_permissions rows', rows);
      rows.forEach(row => {
        const resource = String(row.resource || '').trim().toLowerCase();
        const action = String(row.action || '').trim().toLowerCase();
        if (!resource || !action) return;
        const key = `${resource}:${action}`;
        const existing = matrix.get(key) || [];
        const normalizedAllowedRoles = this.normalizeAllowedRoles(row);
        console.info('[Permissions] normalized allowed roles per row', {
          resource,
          action,
          role_key: row.role_key,
          is_allowed: row.is_allowed,
          normalizedAllowedRoles
        });
        if (!normalizedAllowedRoles.length) return;
        const merged = [...new Set([...existing, ...normalizedAllowedRoles])];
        matrix.set(key, merged);
      });
      this.state.rows = rows;
      this.state.total = normalized.total;
      this.state.returned = normalized.returned;
      this.state.hasMore = normalized.hasMore;
      this.state.page = normalized.page;
      this.state.limit = normalized.limit;
      this.state.offset = normalized.offset;
      this.state.matrix = matrix;
      console.info('[Permissions] final permission matrix keys', [...matrix.keys()]);
      this.state.loaded = true;
      return rows;
    } catch (error) {
      this.state.rows = [];
      this.state.matrix = new Map();
      this.state.loaded = false;
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

    const fromBackend = this.state.matrix.get(`${normalizedResource}:${normalizedAction}`);
    if (Array.isArray(fromBackend)) return fromBackend.includes(role);
    const allowedByBase = this.baseMatrix?.[normalizedResource]?.[normalizedAction];
    if (Array.isArray(allowedByBase)) return allowedByBase.includes(role);
    if (typeof options.fallback === 'boolean') return options.fallback;
    return role === ROLES.ADMIN;
  },
  canPerformAction(resource, action, role = Session.role(), options = {}) {
    const currentRole = this.normalizeRole(role);
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!currentRole || !normalizedResource || !normalizedAction) return false;
    const fromBackend = this.state.matrix.get(`${normalizedResource}:${normalizedAction}`);
    if (Array.isArray(fromBackend)) return fromBackend.includes(currentRole);
    const allowedByBase = this.baseMatrix?.[normalizedResource]?.[normalizedAction];
    if (Array.isArray(allowedByBase)) return allowedByBase.includes(currentRole);
    if (typeof options.fallback === 'boolean') return options.fallback;
    return currentRole === ROLES.ADMIN;
  },
  canView(resource, role = Session.role()) {
    return this.canPerformAction(resource, 'list', role) || this.canPerformAction(resource, 'get', role);
  },
  canCreate(resource, role = Session.role()) {
    return this.canPerformAction(resource, 'create', role) || this.canPerformAction(resource, 'save', role);
  },
  canEdit(resource, role = Session.role()) {
    return this.canPerformAction(resource, 'update', role) || this.canPerformAction(resource, 'save', role);
  },
  canDelete(resource, role = Session.role()) {
    return this.canPerformAction(resource, 'delete', role);
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
    return this.canCreate('tickets');
  },
  canCreateLead() {
    return this.canCreate('leads');
  },
  canViewCsmActivity() {
    return this.canView('csm');
  },
  canCreateCsmActivity() {
    return this.canCreate('csm');
  },
  canUpdateCsmActivity() {
    return this.canEdit('csm');
  },
  canDeleteCsmActivity() {
    return this.canDelete('csm');
  },
  canManageCsmActivity() {
    return this.canUpdateCsmActivity() || this.canDeleteCsmActivity();
  },
  canEditTicket() {
    return this.canEdit('tickets');
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
    return (
      this.canView('roles') ||
      this.canView('role_permissions')
    );
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
    return this.canCreate('proposals');
  },
  canUpdateProposal() {
    return this.canEdit('proposals');
  },
  canDeleteProposal() {
    return this.canDelete('proposals');
  },
  canCreateProposalFromDeal() {
    return this.canPerformAction('proposals', 'create_from_deal');
  },
  canPreviewProposal() {
    return this.canView('proposals');
  },
  canGenerateProposalHtml() {
    return this.canPreviewProposal();
  },
  canCreateAgreement() {
    return this.canCreate('agreements');
  },
  canUpdateAgreement() {
    return this.canEdit('agreements');
  },
  canDeleteAgreement() {
    return this.canDelete('agreements');
  },
  canGenerateAgreementHtml() {
    return this.canPerformAction('agreements', 'generate_agreement_html');
  },
  canCreateAgreementFromProposal() {
    return this.canPerformAction('agreements', 'create_from_proposal');
  },
  canViewOperationsOnboarding() {
    return this.canView('operations_onboarding');
  },
  canViewTechnicalAdmin() {
    return this.canView('technical_admin_requests');
  },
  canRequestTechnicalAdmin() {
    return this.canCreate('technical_admin_requests');
  },
  canManageTechnicalAdmin() {
    return this.canPerformAction('technical_admin_requests', 'update_status');
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
    return this.canCreate('proposal_catalog');
  },
  canUpdateProposalCatalogItem() {
    return this.canEdit('proposal_catalog');
  },
  canDeleteProposalCatalogItem() {
    return this.canDelete('proposal_catalog');
  },
  canViewClients() {
    return this.canView('clients');
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
    if (key === 'issues') return Session.isAuthenticated();
    if (key === 'operationsOnboarding') return this.canViewOperationsOnboarding();
    if (key === 'technicalAdmin') return this.canViewTechnicalAdmin();
    const resource = this.tabResourceMap[key];
    if (!resource) return Session.isAuthenticated();
    return this.canView(resource);
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
