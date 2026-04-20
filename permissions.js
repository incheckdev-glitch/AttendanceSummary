const Permissions = {
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
    if (Array.isArray(row.allowed_roles)) {
      return row.allowed_roles.map(v => this.normalizeRole(v)).filter(Boolean);
    }
    return String(row.allowed_roles_csv || '')
      .split(',')
      .map(v => this.normalizeRole(v))
      .filter(Boolean);
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
      rows.forEach(row => {
        const resource = String(row.resource || '').trim().toLowerCase();
        const action = String(row.action || '').trim().toLowerCase();
        if (!resource || !action) return;
        const key = `${resource}:${action}`;
        const existing = matrix.get(key) || [];
        const merged = [...new Set([...existing, ...this.normalizeAllowedRoles(row)])];
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
    const role = this.normalizeRole(Session.role());
    if (!Session.isAuthenticated() || !role) return false;
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const normalizedAction = String(action || '').trim().toLowerCase();
    if (!normalizedResource || !normalizedAction) return false;

    if (role === ROLES.ADMIN && !this.state.loaded) return true;
    const allowed = this.state.matrix.get(`${normalizedResource}:${normalizedAction}`);
    if (Array.isArray(allowed)) return allowed.includes(role);
    if (role === ROLES.ADMIN) return true;
    if (typeof options.fallback === 'boolean') return options.fallback;
    return false;
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
    return Session.isAuthenticated();
  },
  canCreateLead() {
    return Session.isAuthenticated();
  },
  canViewCsmActivity() {
    return this.can('csm', 'list', { fallback: Session.isAuthenticated() && !this.isDev() });
  },
  canCreateCsmActivity() {
    return this.can('csm', 'create', {
      fallback: Session.isAuthenticated() && (this.isAdmin() || this.isViewer() || this.isHoo())
    });
  },
  canUpdateCsmActivity() {
    return this.can('csm', 'update', { fallback: this.isAdmin() || this.isHoo() });
  },
  canDeleteCsmActivity() {
    return this.can('csm', 'delete', { fallback: this.isAdmin() || this.isHoo() });
  },
  canManageCsmActivity() {
    return this.canUpdateCsmActivity() || this.canDeleteCsmActivity();
  },
  canEditTicket() {
    return this.can('tickets', 'update', { fallback: this.isAdminLike() });
  },
  canUpdateLead() {
    return this.can('leads', 'update', { fallback: this.isAdminLike() });
  },
  canDeleteLead() {
    return this.can('leads', 'delete', { fallback: this.isAdminLike() });
  },
  canEditDeleteLead() {
    return this.canUpdateLead() || this.canDeleteLead();
  },
  canManageEvents() {
    return this.can('events', 'save', { fallback: this.isAdminLike() });
  },
  canManageUsers() {
    return this.can('users', 'list', { fallback: this.isAdmin() });
  },
  canManageRolesPermissions() {
    return (
      this.can('roles', 'list', { fallback: this.isAdmin() }) ||
      this.can('role_permissions', 'list', { fallback: this.isAdmin() })
    );
  },
  canManageWorkflow() {
    return this.can('workflow', 'list', { fallback: this.isAdminLike() });
  },
  canEditRolesPermissions() {
    return (
      this.can('roles', 'update', { fallback: this.isAdmin() }) ||
      this.can('role_permissions', 'update', { fallback: this.isAdmin() })
    );
  },
  canCreateProposal() {
    return this.can('proposals', 'create', { fallback: Session.isAuthenticated() });
  },
  canUpdateProposal() {
    return this.can('proposals', 'update', {
      fallback: this.can('proposals', 'save', { fallback: this.canCreateProposal() })
    });
  },
  canDeleteProposal() {
    return this.can('proposals', 'delete', { fallback: this.isAdminLike() });
  },
  canCreateProposalFromDeal() {
    return this.can('proposals', 'create_from_deal', { fallback: this.canCreateProposal() });
  },
  canGenerateProposalHtml() {
    return this.can('proposals', 'generate_proposal_html', { fallback: Session.isAuthenticated() });
  },
  canCreateAgreement() {
    return this.can('agreements', 'create', { fallback: Session.isAuthenticated() });
  },
  canUpdateAgreement() {
    return this.can('agreements', 'update', { fallback: this.isAdminLike() });
  },
  canDeleteAgreement() {
    return this.can('agreements', 'delete', { fallback: this.isAdminLike() });
  },
  canGenerateAgreementHtml() {
    return this.can('agreements', 'generate_agreement_html', { fallback: Session.isAuthenticated() });
  },
  canCreateAgreementFromProposal() {
    return this.can('agreements', 'create_from_proposal', { fallback: this.canCreateAgreement() });
  },
  canViewOperationsOnboarding() {
    return this.can('operations_onboarding', 'list', { fallback: Session.isAuthenticated() });
  },
  canViewTechnicalAdmin() {
    return this.can('technical_admin_requests', 'list', { fallback: this.canViewOperationsOnboarding() });
  },
  canManageTechnicalAdmin() {
    return this.can('technical_admin_requests', 'update_status', { fallback: this.canManageOperationsOnboarding() });
  },
  canManageOperationsOnboarding() {
    return this.isAdmin() || this.isDev() || this.isHoo();
  },
  canSendAgreementToOperations() {
    return this.can('agreements', 'send_to_operations', { fallback: this.canManageOperationsOnboarding() });
  },
  canRequestAgreementIncheckLite() {
    return this.can('agreements', 'request_incheck_lite', { fallback: this.canManageOperationsOnboarding() });
  },
  canRequestAgreementIncheckFull() {
    return this.can('agreements', 'request_incheck_full', { fallback: this.canManageOperationsOnboarding() });
  },
  canAssignAgreementCsm() {
    return this.can('agreements', 'assign_csm', { fallback: this.canManageOperationsOnboarding() });
  },
  canUpdateAgreementOnboardingStatus() {
    return this.can('agreements', 'update_onboarding_status', { fallback: this.canManageOperationsOnboarding() });
  },


  canViewInvoices() {
    return this.can('invoices', 'list', { fallback: Session.isAuthenticated() });
  },
  canCreateInvoice() {
    return (
      this.can('invoices', 'create', { fallback: Session.isAuthenticated() }) ||
      this.can('invoices', 'save', { fallback: Session.isAuthenticated() })
    );
  },
  canUpdateInvoice() {
    return this.can('invoices', 'update', { fallback: this.isAdminLike() });
  },
  canDeleteInvoice() {
    return this.can('invoices', 'delete', { fallback: this.isAdminLike() });
  },
  canCreateInvoiceFromAgreement() {
    return this.can('invoices', 'create_from_agreement', { fallback: this.canCreateInvoice() });
  },
  canPreviewInvoice() {
    return (
      this.can('invoices', 'generate_invoice_html', { fallback: Session.isAuthenticated() }) ||
      this.can('invoices', 'get', { fallback: Session.isAuthenticated() })
    );
  },
  canViewReceipts() {
    return this.can('receipts', 'list', { fallback: Session.isAuthenticated() });
  },
  canCreateReceipt() {
    return (
      this.can('receipts', 'create', { fallback: this.isAdminLike() }) ||
      this.can('receipts', 'save', { fallback: this.isAdminLike() })
    );
  },
  canUpdateReceipt() {
    return this.can('receipts', 'update', { fallback: this.isAdminLike() });
  },
  canDeleteReceipt() {
    return this.can('receipts', 'delete', { fallback: this.isAdminLike() });
  },
  canCreateReceiptFromInvoice() {
    return this.can('receipts', 'create_from_invoice', { fallback: this.canCreateReceipt() });
  },
  canPreviewReceipt() {
    return (
      this.can('receipts', 'generate_receipt_html', { fallback: Session.isAuthenticated() }) ||
      this.can('receipts', 'get', { fallback: Session.isAuthenticated() })
    );
  },
  canCreateProposalCatalogItem() {
    return this.can('proposal_catalog', 'create', { fallback: Session.isAuthenticated() });
  },
  canUpdateProposalCatalogItem() {
    return this.can('proposal_catalog', 'update', { fallback: this.isAdminLike() });
  },
  canDeleteProposalCatalogItem() {
    return this.can('proposal_catalog', 'delete', { fallback: this.isAdminLike() });
  },
  canViewClients() {
    return this.can('clients', 'list', { fallback: this.isAdminLike() });
  },
  canChangePlanner() {
    return this.can('planner', 'manage', { fallback: this.isAdminLike() });
  },
  canManageFreezeWindows() {
    return this.can('freeze_windows', 'manage', { fallback: this.isAdminLike() });
  },
  canUseInternalIssueFilters() {
    return this.can('tickets', 'internal_filters', { fallback: this.isAdminLike() });
  },
  canAccessTab(viewKey) {
    const key = String(viewKey || '').trim();
    if (!key) return false;
    if (key === 'issues') return Session.isAuthenticated();
    if (key === 'operationsOnboarding') return this.canViewOperationsOnboarding();
    if (key === 'technicalAdmin') return this.canViewTechnicalAdmin();
    const resource = this.tabResourceMap[key];
    if (!resource) return Session.isAuthenticated();
    return this.can(resource, 'list', { fallback: Session.isAuthenticated() });
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
