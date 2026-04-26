const RolesAdmin = {
  state: {
    roles: [],
    permissions: [],
    groupedPermissions: [],
    filteredPermissions: [],
    filters: { resource: '', action: '', role: '', text: '' },
    loadingRoles: false,
    loadingPermissions: false,
    rolesPage: 1,
    rolesLimit: 50,
    rolesTotal: 0,
    permissionsPage: 1,
    permissionsLimit: 50,
    permissionsTotal: 0,
    limit: 50,
    page: 1
  },

  wire() {
    if (E.rolePermissionsRefreshBtn) E.rolePermissionsRefreshBtn.addEventListener('click', () => this.loadAll(true));
    if (E.rpQuickNewRoleBtn) E.rpQuickNewRoleBtn.addEventListener('click', () => this.toggleRoleCreate(true));
    if (E.rpRoleCreateInlineBtn) E.rpRoleCreateInlineBtn.addEventListener('click', () => this.toggleRoleCreate());
    if (E.rpQuickNewRuleBtn) E.rpQuickNewRuleBtn.addEventListener('click', () => this.togglePermissionCreate(true));
    if (E.rpPermissionCreateInlineBtn) E.rpPermissionCreateInlineBtn.addEventListener('click', () => this.togglePermissionCreate());

    if (E.rolePermissionsFiltersForm) {
      E.rolePermissionsFiltersForm.addEventListener('input', () => {
        this.state.filters.resource = String(E.rolePermissionsSearchResource?.value || '').trim().toLowerCase();
        this.state.filters.action = String(E.rolePermissionsSearchAction?.value || '').trim().toLowerCase();
        this.state.filters.role = String(E.rolePermissionsSearchAllowedRoles?.value || '').trim().toLowerCase();
        this.state.filters.text = String(E.rolePermissionsSearchText?.value || '').trim().toLowerCase();
        this.state.permissionsPage = 1;
        this.renderPermissionsTable();
      });
    }

    if (E.rpRoleCreateForm) {
      E.rpRoleCreateForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!Permissions.canManageRolesPermissions()) return UI.toast('Forbidden.');
        const payload = {
          role_key: this.normalizeRoleKey(E.rpRoleCreateKey?.value),
          role_name: String(E.rpRoleCreateDisplayName?.value || '').trim(),
          description: String(E.rpRoleCreateDescription?.value || '').trim(),
          is_active: String(E.rpRoleCreateIsActive?.value || 'true') !== 'false'
        };
        if (!payload.role_key || !payload.role_name) return UI.toast('role_key and role_name are required.');
        try {
          await Api.createRole(payload);
          UI.toast('Role created.');
          E.rpRoleCreateForm.reset();
          this.toggleRoleCreate(false);
          await this.refreshRoles(true);
        } catch (error) {
          UI.toast(String(error?.message || 'Unable to create role.'));
        }
      });
    }

    if (E.rolePermissionCreateForm) {
      E.rolePermissionCreateForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!Permissions.canEditRolesPermissions()) return UI.toast('Forbidden.');
        const { resource, action } = this.parseResourceAction(
          E.rolePermissionCreateResource?.value,
          E.rolePermissionCreateAction?.value,
          {
            permission: E.rolePermissionCreateResource?.value,
            resourceKey: E.rolePermissionCreateResource?.value,
            label: E.rolePermissionCreateResource?.value
          }
        );
        const selectedRoles = this.readMultiSelectValues(E.rolePermissionCreateAllowedRoles);
        const validation = this.validatePermissionPayload({ roleKeys: selectedRoles, resource, action });
        if (!validation.valid) return UI.toast(validation.message);
        const existingRows = this.state.permissions.filter(row =>
          String(row.resource || '').trim().toLowerCase() === validation.resource &&
          this.canonicalAction(row.action) === validation.action
        );
        const hadExisting = existingRows.some(row => validation.roleKeys.includes(this.roleKey(row)));
        try {
          await this.upsertPermissionGroup({
            resource: validation.resource,
            action: validation.action,
            roleKeys: validation.roleKeys,
            existingRows
          });
          UI.toast(hadExisting ? 'Permission updated.' : 'Permission rule created.');
          E.rolePermissionCreateForm.reset();
          this.togglePermissionCreate(false);
          await this.syncPermissionStateAfterSave();
        } catch (error) {
          UI.toast(String(error?.message || 'Unable to create permission rule.'));
        }
      });
    }

    if (E.tabPermissionBulkForm) {
      E.tabPermissionBulkForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!Permissions.canEditRolesPermissions()) return UI.toast('Forbidden.');
        await this.applyBulkTabPermissions();
      });
    }
  },

  toggleRoleCreate(force) {
    if (!E.rpRoleCreateForm) return;
    const shouldShow = typeof force === 'boolean' ? force : E.rpRoleCreateForm.style.display === 'none';
    E.rpRoleCreateForm.style.display = shouldShow ? '' : 'none';
  },

  togglePermissionCreate(force) {
    if (!E.rolePermissionCreateForm) return;
    const shouldShow = typeof force === 'boolean' ? force : E.rolePermissionCreateForm.style.display === 'none';
    E.rolePermissionCreateForm.style.display = shouldShow ? '' : 'none';
  },

  normalizeRoleKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_\-\s]/g, '').replace(/\s+/g, '_');
  },

  normalizeRoleKeys(values) {
    const source = Array.isArray(values) ? values : String(values || '').split(',');
    const roleLookup = new Map();
    this.state.roles.forEach(role => {
      const roleKey = this.roleKey(role);
      if (!roleKey) return;
      roleLookup.set(roleKey, roleKey);
      roleLookup.set(this.normalizeRoleKey(this.displayName(role)), roleKey);
      roleLookup.set(this.normalizeRoleKey(String(role.role_name || '')), roleKey);
      roleLookup.set(this.normalizeRoleKey(String(role.name || '')), roleKey);
    });
    return [...new Set(source
      .map(value => {
        const normalized = this.normalizeRoleKey(value);
        return roleLookup.get(normalized) || normalized;
      })
      .filter(Boolean))];
  },

  readMultiSelectValues(selectEl) {
    if (!selectEl) return [];
    return [...selectEl.options].filter(option => option.selected).map(option => option.value);
  },

  canonicalAction(action) {
    const normalized = String(action || '').trim().toLowerCase();
    if (!normalized) return '';
    const map = { read: 'get', edit: 'update' };
    return map[normalized] || normalized;
  },
  async syncPermissionStateAfterSave() {
    await this.refreshPermissions(true);
    await Permissions.loadMatrix(true);
    UI.applyRolePermissions();
  },

  parseResourceAction(resourceValue = '', actionValue = '', helperFields = {}) {
    // legacy compatibility - remove after migration closure
    const helper = helperFields && typeof helperFields === 'object' ? helperFields : {};
    let resource = window.LegacyCompat?.resolveResourceName
      ? window.LegacyCompat.resolveResourceName(resourceValue, helper)
      : String(resourceValue || helper.resource || helper.resourceKey || helper.table || helper.entity || helper.sheetName || helper.sheet_name || helper.tabName || helper.tab_name || '').trim().toLowerCase();
    let action = this.canonicalAction(actionValue || helper.action || '');

    const splitCombined = value => {
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized) return null;
      const match = normalized.match(/^([^.:/\s]+)[.:/]([^.:/\s]+)$/);
      if (!match) return null;
      const resourcePart = String(match[1] || '').trim();
      const actionPart = String(match[2] || '').trim();
      if (!resourcePart || !actionPart) return null;
      return { resource: resourcePart, action: this.canonicalAction(actionPart) };
    };

    const fromPermission = splitCombined(helper.permission);
    const fromLabel = splitCombined(helper.label || helper.combinedLabel || helper.combined_label);
    const fromResource = splitCombined(resource);
    const fromAction = splitCombined(actionValue);
    const parsed = fromPermission || fromLabel || fromResource || fromAction;
    if (parsed) {
      resource = parsed.resource;
      action = parsed.action;
    }
    return { resource, action };
  },

  validatePermissionPayload({ roleKeys = [], resource = '', action = '' }) {
    const normalizedRoles = this.normalizeRoleKeys(roleKeys);
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const normalizedAction = this.canonicalAction(action);
    if (!normalizedRoles.length) return { valid: false, message: 'role_key is required. Select at least one role before saving permission changes.' };
    if (!normalizedResource) return { valid: false, message: 'resource is required before saving permission changes.' };
    if (!normalizedAction) return { valid: false, message: 'action is required before saving permission changes.' };
    return { valid: true, roleKeys: normalizedRoles, resource: normalizedResource, action: normalizedAction };
  },

  extractRows(response) {
    if (response && typeof response === 'object' && Array.isArray(response.rows)) return response.rows;
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.items)) return response.items;
    return [];
  },

  extractListMeta(response, fallback = {}) {
    const rows = this.extractRows(response);
    const fallbackLimit = U.normalizePageSize(fallback.limit || this.state.limit || 50, 50, 200);
    const fallbackPage = U.normalizePageNumber(fallback.page || 1, 1);
    const page = U.normalizePageNumber(response?.page || fallbackPage, fallbackPage);
    const limit = U.normalizePageSize(response?.limit || fallbackLimit, 50, 200);
    const returned = Math.max(0, Number(response?.returned ?? response?.count ?? rows.length) || rows.length);
    const offset = Math.max(0, Number(response?.offset ?? ((page - 1) * limit)) || 0);
    const totalCandidate = Number(response?.total ?? response?.total_count ?? response?.meta?.total);
    const total = Number.isFinite(totalCandidate) ? totalCandidate : rows.length;
    const hasMore = response?.hasMore !== undefined
      ? Boolean(response.hasMore)
      : response?.has_more !== undefined
        ? Boolean(response.has_more)
        : offset + returned < total;
    return { rows, page, limit, returned, offset, total, hasMore };
  },

  async fetchAllPages(fetchPage, options = {}) {
    const limit = U.normalizePageSize(options.limit || this.state.limit || 50, 50, 200);
    const maxPages = Math.max(1, Number(options.maxPages || 500) || 500);
    const rows = [];
    const seenPageSignatures = new Set();
    let page = 1;
    let lastMeta = { total: 0, returned: 0, hasMore: false, limit, page: 1, offset: 0 };

    while (page <= maxPages) {
      const response = await fetchPage({ page, limit });
      const meta = this.extractListMeta(response, { page, limit });
      lastMeta = meta;
      const pageSignature = meta.rows
        .map(row => String(row?.permission_id || row?.id || row?.role_key || `${row?.resource || ''}:${row?.action || ''}:${row?.role || ''}`))
        .join('|');
      if (pageSignature && seenPageSignatures.has(pageSignature)) break;
      if (pageSignature) seenPageSignatures.add(pageSignature);
      rows.push(...meta.rows);
      const fullPageReturned = meta.rows.length >= limit || meta.returned >= limit;
      const hasMore = (Boolean(meta.hasMore) || fullPageReturned) && meta.returned > 0;
      if (!hasMore) break;
      page += 1;
    }

    return {
      rows,
      total: Number.isFinite(Number(lastMeta.total)) ? Math.max(Number(lastMeta.total), rows.length) : rows.length,
      returned: rows.length,
      limit,
      pagesLoaded: page,
      truncated: page > maxPages && Boolean(lastMeta.hasMore)
    };
  },

  paginateClientRows(rows = [], pageKey = 'rolesPage', limitKey = 'rolesLimit') {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeLimit = U.normalizePageSize(this.state[limitKey] || 50, 50, 200);
    const maxPage = Math.max(1, Math.ceil(safeRows.length / safeLimit));
    const safePage = Math.min(U.normalizePageNumber(this.state[pageKey] || 1, 1), maxPage);
    this.state[pageKey] = safePage;
    this.state[limitKey] = safeLimit;
    const from = Math.max(0, (safePage - 1) * safeLimit);
    const to = Math.min(safeRows.length, from + safeLimit);
    return {
      rows: safeRows.slice(from, to),
      total: safeRows.length,
      page: safePage,
      limit: safeLimit,
      from,
      to,
      hasMore: to < safeRows.length
    };
  },

  renderPagination({ hostId, anchor, moduleKey, pageKey, limitKey, totalRows, returnedRows }) {
    const host = U.ensurePaginationHost({ hostId, anchor });
    if (!host) return;
    const safeTotal = Math.max(0, Number(totalRows) || 0);
    const safeReturned = Math.max(0, Number(returnedRows) || 0);
    const safePage = U.normalizePageNumber(this.state[pageKey] || 1, 1);
    const safeLimit = U.normalizePageSize(this.state[limitKey] || 50, 50, 200);
    const from = safeTotal ? ((safePage - 1) * safeLimit) + 1 : 0;
    const to = Math.min(safeTotal, ((safePage - 1) * safeLimit) + safeReturned);
    const isLoading = moduleKey === 'roles-admin-roles' ? this.state.loadingRoles : this.state.loadingPermissions;
    U.renderPaginationControls({
      host,
      moduleKey,
      page: safePage,
      pageSize: safeLimit,
      hasMore: safePage * safeLimit < safeTotal,
      returned: safeReturned,
      countText: safeTotal ? `${from}-${to} of ${safeTotal}` : '0 rows',
      loading: isLoading,
      pageSizeOptions: [25, 50, 100, 200],
      onPageChange: nextPage => {
        this.state[pageKey] = U.normalizePageNumber(nextPage, 1);
        if (moduleKey === 'roles-admin-roles') this.renderRolesTable();
        else this.renderPermissionsTable();
      },
      onPageSizeChange: nextSize => {
        this.state[limitKey] = U.normalizePageSize(nextSize, 50, 200);
        this.state[pageKey] = 1;
        if (moduleKey === 'roles-admin-roles') this.renderRolesTable();
        else this.renderPermissionsTable();
      }
    });
  },

  roleKey(role = {}) {
    return this.normalizeRoleKey(role.role_key || role.key || role.role || role.id);
  },

  displayName(role = {}) {
    return String(role.role_name || role.display_name || role.name || this.roleKey(role) || '').trim();
  },

  permissionId(permission = {}) {
    return String(permission.permission_id || '').trim();
  },

  permissionActive(permission = {}) {
    return permission?.is_active !== false && permission?.is_allowed !== false;
  },

  normalizePermissionRow(row = {}) {
    const permissionId = String(row.permission_id || row.id || '').trim();
    return {
      ...row,
      id: permissionId,
      permission_id: permissionId,
      role_key: String(row.role_key || row.role || '').trim().toLowerCase(),
      resource: String(row.resource || '').trim().toLowerCase(),
      action: this.canonicalAction(row.action),
      is_allowed: Boolean(row.is_allowed),
      is_active: row.is_active !== undefined ? Boolean(row.is_active) : true,
      allowed_roles: Array.isArray(row.allowed_roles) ? row.allowed_roles : row.allowed_roles
    };
  },

  dedupePermissionRows(rows = []) {
    const newestByKey = new Map();
    rows.forEach(sourceRow => {
      const row = this.normalizePermissionRow(sourceRow);
      if (!row.role_key || !row.resource || !row.action) return;
      const dedupeKey = `${row.role_key}|${row.resource}|${row.action}`;
      const existing = newestByKey.get(dedupeKey);
      if (!existing) {
        newestByKey.set(dedupeKey, row);
        return;
      }
      const existingUpdated = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const rowUpdated = new Date(row.updated_at || row.created_at || 0).getTime();
      if (rowUpdated >= existingUpdated) newestByKey.set(dedupeKey, row);
    });
    return [...newestByKey.values()];
  },

  groupPermissions(rows = []) {
    const grouped = new Map();
    rows.forEach(row => {
      const resource = String(row.resource || '').trim().toLowerCase();
      const action = this.canonicalAction(row.action);
      const roleKey = this.roleKey(row);
      if (!resource || !action) return;
      const key = `${resource}:${action}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          resource,
          action,
          roleKeys: [],
          rows: [],
          updated_at: row.updated_at || row.created_at || ''
        });
      }
      const rule = grouped.get(key);
      rule.rows.push(row);
      if (this.permissionActive(row) && roleKey) {
        rule.roleKeys = [...new Set([...rule.roleKeys, roleKey])];
      }
      const updatedAt = row.updated_at || row.created_at || '';
      if (updatedAt && (!rule.updated_at || new Date(updatedAt) > new Date(rule.updated_at))) {
        rule.updated_at = updatedAt;
      }
    });
    return [...grouped.values()].sort((a, b) => `${a.resource}:${a.action}`.localeCompare(`${b.resource}:${b.action}`));
  },

  async ensureRolesLoaded(force = false) {
    if (!Session.isAuthenticated()) return [];
    if (this.state.roles.length && !force) return this.state.roles;
    await this.refreshRoles(force);
    return this.state.roles;
  },

  async loadAll(force = false) {
    if (!Permissions.canManageRolesPermissions()) return;
    await Promise.all([this.refreshRoles(force), this.refreshPermissions(force)]);
  },

  async refreshRoles(force = false) {
    if (this.state.loadingRoles && !force) return;
    this.state.loadingRoles = true;
    if (E.rpRolesState) E.rpRolesState.textContent = 'Loading roles…';
    try {
      const result = await this.fetchAllPages(
        ({ page, limit }) => Api.listRoles({ limit, page, summary_only: true, forceRefresh: force }),
        { limit: this.state.rolesLimit }
      );
      this.state.roles = result.rows;
      this.state.rolesTotal = result.total;
      this.state.loadingRoles = false;
      this.renderRolesTable();
      this.renderRoleSelects();
      this.renderKpis();
    } catch (error) {
      this.state.roles = [];
      this.state.rolesTotal = 0;
      this.state.loadingRoles = false;
      this.renderRolesTable(String(error?.message || 'Unable to load roles.'));
      this.renderRoleSelects();
      this.renderKpis();
    } finally {
      this.state.loadingRoles = false;
    }
  },

  async refreshPermissions(force = false) {
    if (this.state.loadingPermissions && !force) return;
    this.state.loadingPermissions = true;
    if (E.rolePermissionsState) E.rolePermissionsState.textContent = 'Loading permission rules…';
    try {
      const result = await this.fetchAllPages(
        ({ page, limit }) => Api.listRolePermissions({ limit, page, summary_only: true, forceRefresh: force }),
        { limit: this.state.permissionsLimit }
      );
      this.state.permissions = this.dedupePermissionRows(result.rows);
      this.state.permissionsTotal = this.state.permissions.length;
      this.state.groupedPermissions = this.groupPermissions(this.state.permissions);
      this.state.loadingPermissions = false;
      this.renderPermissionsTable();
      this.renderKpis();
    } catch (error) {
      this.state.permissions = [];
      this.state.permissionsTotal = 0;
      this.state.groupedPermissions = [];
      this.state.loadingPermissions = false;
      this.renderPermissionsTable(String(error?.message || 'Unable to load permission matrix.'));
      this.renderKpis();
    } finally {
      this.state.loadingPermissions = false;
    }
  },

  renderKpis() {
    if (E.rpTotalRoles) E.rpTotalRoles.textContent = String(this.state.roles.length);
    if (E.rpTotalRows) E.rpTotalRows.textContent = String(this.state.permissions.length);
    if (E.rpTotalGrouped) E.rpTotalGrouped.textContent = String(this.state.groupedPermissions.length);
  },

  renderRoleSelects() {
    const activeRoles = this.state.roles
      .filter(role => role?.is_active !== false)
      .map(role => ({ key: this.roleKey(role), label: this.displayName(role) || this.roleKey(role) }))
      .filter(option => option.key);

    if (window.UserAdmin?.applyRoleOptions) window.UserAdmin.applyRoleOptions(this.state.roles);

    if (E.rolePermissionCreateAllowedRoles) {
      const selected = new Set(this.readMultiSelectValues(E.rolePermissionCreateAllowedRoles));
      E.rolePermissionCreateAllowedRoles.innerHTML = activeRoles
        .map(option => `<option value="${U.escapeAttr(option.key)}"${selected.has(option.key) ? ' selected' : ''}>${U.escapeHtml(option.label)}</option>`)
        .join('');
    }

    if (E.tabPermissionRole) {
      const selected = new Set(this.readMultiSelectValues(E.tabPermissionRole));
      E.tabPermissionRole.innerHTML = activeRoles
        .map(option => `<option value="${U.escapeAttr(option.key)}"${selected.has(option.key) ? ' selected' : ''}>${U.escapeHtml(option.label)}</option>`)
        .join('');
    }
  },

  renderRolesTable(error = '') {
    if (!E.rpRolesTbody || !E.rpRolesState) return;
    const paginationAnchor = E.rpRolesTbody.closest?.('.table-wrap');
    if (error) {
      E.rpRolesState.textContent = error;
      E.rpRolesTbody.innerHTML = '';
      this.renderPagination({
        hostId: 'rpRolesPagination',
        anchor: paginationAnchor,
        moduleKey: 'roles-admin-roles',
        pageKey: 'rolesPage',
        limitKey: 'rolesLimit',
        totalRows: 0,
        returnedRows: 0
      });
      return;
    }
    if (!this.state.roles.length) {
      E.rpRolesState.textContent = 'No roles found.';
      E.rpRolesTbody.innerHTML = '';
      this.renderPagination({
        hostId: 'rpRolesPagination',
        anchor: paginationAnchor,
        moduleKey: 'roles-admin-roles',
        pageKey: 'rolesPage',
        limitKey: 'rolesLimit',
        totalRows: 0,
        returnedRows: 0
      });
      return;
    }
    const pageResult = this.paginateClientRows(this.state.roles, 'rolesPage', 'rolesLimit');
    E.rpRolesState.textContent = `${this.state.roles.length} role(s) loaded · showing ${pageResult.from + 1}-${pageResult.to}`;
    E.rpRolesTbody.innerHTML = pageResult.rows.map(role => {
      const key = this.roleKey(role);
      return `<tr data-role-key="${U.escapeAttr(key)}">
        <td>${U.escapeHtml(key || '—')}</td>
        <td>${U.escapeHtml(this.displayName(role) || '—')}</td>
        <td>${U.escapeHtml(role.description || '—')}</td>
        <td>${role.is_active === false ? 'false' : 'true'}</td>
        <td>${U.escapeHtml(U.fmtDisplayDate(role.updated_at || role.created_at))}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="chip-btn" data-role-action="manage">Manage Permissions</button>
            <button class="chip-btn" data-role-action="edit">Edit</button>
            <button class="chip-btn" data-role-action="delete">Delete</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    E.rpRolesTbody.querySelectorAll('[data-role-action]').forEach(btn => {
      btn.addEventListener('click', async event => {
        const row = event.currentTarget.closest('tr');
        const roleKey = String(row?.getAttribute('data-role-key') || '');
        const role = this.state.roles.find(item => this.roleKey(item) === roleKey);
        if (!role) return;
        const action = String(event.currentTarget.getAttribute('data-role-action') || '');
        if (action === 'manage') {
          if (E.rolePermissionsSearchAllowedRoles) E.rolePermissionsSearchAllowedRoles.value = roleKey;
          this.state.filters.role = roleKey;
          this.state.permissionsPage = 1;
          this.renderPermissionsTable();
          return;
        }
        if (action === 'edit') await this.editRole(role);
        if (action === 'delete') await this.deleteRole(role);
      });
    });

    this.renderPagination({
      hostId: 'rpRolesPagination',
      anchor: paginationAnchor,
      moduleKey: 'roles-admin-roles',
      pageKey: 'rolesPage',
      limitKey: 'rolesLimit',
      totalRows: pageResult.total,
      returnedRows: pageResult.rows.length
    });
  },

  async editRole(role) {
    const roleKey = this.roleKey(role);
    if (!roleKey) return UI.toast('Unable to edit role: missing role_key.');
    const roleName = window.prompt('Role name', this.displayName(role));
    if (roleName == null) return;
    const description = window.prompt('Description', String(role.description || ''));
    if (description == null) return;
    const isActive = window.confirm('Keep role active? Click Cancel to mark inactive.');
    try {
      await Api.updateRole(roleKey, { role_name: String(roleName).trim(), description: String(description).trim(), is_active: isActive });
      UI.toast('Role updated.');
      await this.refreshRoles(true);
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to update role.'));
    }
  },

  async deleteRole(role) {
    const roleKey = this.roleKey(role);
    if (!roleKey) return UI.toast('Unable to delete role: missing role_key.');
    if (!window.confirm(`Delete role "${roleKey}"?`)) return;
    console.log('[Roles] deleting role_key', roleKey);
    try {
      await Api.deleteRole(roleKey);
      UI.toast('Role deleted.');
      await this.loadAll(true);
      await Permissions.loadMatrix(true);
      UI.applyRolePermissions();
    } catch (error) {
      const rawMessage = String(error?.message || '');
      const referenceBlockPattern = /(foreign key|violates|is referenced|still referenced|constraint|profiles|role_permissions)/i;
      const readableMessage = referenceBlockPattern.test(rawMessage)
        ? 'Unable to delete role: this role_key is still referenced by profiles or permission rules.'
        : `Unable to delete role. ${rawMessage || 'This role may still be referenced in profiles or permissions.'}`;
      UI.toast(readableMessage);
    }
  },

  permissionChips(roleKeys = []) {
    if (!roleKeys.length) return '<span class="muted">No active roles</span>';
    const labels = new Map(this.state.roles.map(role => [this.roleKey(role), this.displayName(role)]));
    return roleKeys.map(roleKey => `<span class="rp-chip">${U.escapeHtml(labels.get(roleKey) || roleKey)}</span>`).join(' ');
  },

  filteredPermissionRows() {
    const { resource, action, role, text } = this.state.filters;
    return this.state.groupedPermissions.filter(rule => {
      const searchable = `${rule.resource} ${rule.action} ${rule.roleKeys.join(' ')}`;
      if (resource && !rule.resource.includes(resource)) return false;
      if (action && !rule.action.includes(action)) return false;
      if (role && !rule.roleKeys.some(roleKey => roleKey.includes(role))) return false;
      if (text && !searchable.includes(text)) return false;
      return true;
    });
  },

  renderPermissionsTable(error = '') {
    if (!E.rolePermissionsTbody || !E.rolePermissionsState) return;
    const paginationAnchor = E.rolePermissionsTbody.closest?.('.table-wrap');
    if (error) {
      E.rolePermissionsState.textContent = error;
      E.rolePermissionsTbody.innerHTML = '';
      this.renderPagination({
        hostId: 'rolePermissionsPagination',
        anchor: paginationAnchor,
        moduleKey: 'roles-admin-permissions',
        pageKey: 'permissionsPage',
        limitKey: 'permissionsLimit',
        totalRows: 0,
        returnedRows: 0
      });
      return;
    }
    const rules = this.filteredPermissionRows();
    this.state.filteredPermissions = rules;
    if (!rules.length) {
      E.rolePermissionsState.textContent = this.state.groupedPermissions.length ? 'No grouped rules match current filters.' : 'No permission rules found.';
      E.rolePermissionsTbody.innerHTML = '';
      this.renderPagination({
        hostId: 'rolePermissionsPagination',
        anchor: paginationAnchor,
        moduleKey: 'roles-admin-permissions',
        pageKey: 'permissionsPage',
        limitKey: 'permissionsLimit',
        totalRows: 0,
        returnedRows: 0
      });
      return;
    }
    const pageResult = this.paginateClientRows(rules, 'permissionsPage', 'permissionsLimit');
    E.rolePermissionsState.textContent = `${rules.length} grouped rule(s) · ${this.state.permissions.length} permission row(s) loaded · showing ${pageResult.from + 1}-${pageResult.to}`;
    E.rolePermissionsTbody.innerHTML = pageResult.rows.map(rule => `
      <tr data-rule-key="${U.escapeAttr(rule.key)}">
        <td><input class="input sm" data-rule-field="resource" type="text" value="${U.escapeAttr(rule.resource)}" disabled /></td>
        <td><input class="input sm" data-rule-field="action" type="text" value="${U.escapeAttr(rule.action)}" disabled /></td>
        <td>
          <div data-rule-chips>${this.permissionChips(rule.roleKeys)}</div>
          <select class="select sm" data-rule-field="roles" multiple size="5" style="display:none;">${this.state.roles
            .filter(role => role?.is_active !== false)
            .map(role => {
              const key = this.roleKey(role);
              return `<option value="${U.escapeAttr(key)}"${rule.roleKeys.includes(key) ? ' selected' : ''}>${U.escapeHtml(this.displayName(role) || key)}</option>`;
            })
            .join('')}</select>
        </td>
        <td>${U.escapeHtml(U.fmtDisplayDate(rule.updated_at))}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="chip-btn" data-rule-action="edit">Edit</button>
            <button class="chip-btn" data-rule-action="save" style="display:none;">Save</button>
            <button class="chip-btn" data-rule-action="duplicate">Duplicate</button>
            <button class="chip-btn" data-rule-action="delete">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');

    E.rolePermissionsTbody.querySelectorAll('[data-rule-action]').forEach(btn => {
      btn.addEventListener('click', async event => {
        const row = event.currentTarget.closest('tr');
        const key = String(row?.getAttribute('data-rule-key') || '');
        const rule = this.state.groupedPermissions.find(item => item.key === key);
        if (!rule) return;
        const actionName = String(event.currentTarget.getAttribute('data-rule-action') || '');
        if (actionName === 'edit') return this.toggleRuleEdit(row, true);
        if (actionName === 'save') return this.saveRuleRow(rule, row);
        if (actionName === 'delete') return this.deleteRule(rule);
        if (actionName === 'duplicate') return this.duplicateRule(rule);
      });
    });

    this.renderPagination({
      hostId: 'rolePermissionsPagination',
      anchor: paginationAnchor,
      moduleKey: 'roles-admin-permissions',
      pageKey: 'permissionsPage',
      limitKey: 'permissionsLimit',
      totalRows: pageResult.total,
      returnedRows: pageResult.rows.length
    });
  },

  toggleRuleEdit(row, editable) {
    row.querySelectorAll('[data-rule-field="resource"],[data-rule-field="action"]').forEach(input => {
      input.disabled = !editable;
    });
    const roleSelect = row.querySelector('[data-rule-field="roles"]');
    const chips = row.querySelector('[data-rule-chips]');
    if (roleSelect) roleSelect.style.display = editable ? '' : 'none';
    if (chips) chips.style.display = editable ? 'none' : '';
    const editBtn = row.querySelector('[data-rule-action="edit"]');
    const saveBtn = row.querySelector('[data-rule-action="save"]');
    if (editBtn) editBtn.style.display = editable ? 'none' : '';
    if (saveBtn) saveBtn.style.display = editable ? '' : 'none';
  },

  async saveRuleRow(rule, row) {
    if (!Permissions.canEditRolesPermissions()) return UI.toast('Forbidden.');
    const { resource, action } = this.parseResourceAction(
      row.querySelector('[data-rule-field="resource"]')?.value,
      row.querySelector('[data-rule-field="action"]')?.value
    );
    const selectedRoles = this.readMultiSelectValues(row.querySelector('[data-rule-field="roles"]'));
    const validation = this.validatePermissionPayload({ roleKeys: selectedRoles, resource, action });
    if (!validation.valid) return UI.toast(validation.message);

    try {
      await this.upsertPermissionGroup({
        resource: validation.resource,
        action: validation.action,
        roleKeys: validation.roleKeys,
        existingRows: rule.rows
      });
      UI.toast('Permission rule saved.');
      await this.syncPermissionStateAfterSave();
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to save grouped permission rule.'));
    }
  },

  async duplicateRule(rule) {
    if (!Permissions.canEditRolesPermissions()) return UI.toast('Forbidden.');
    const newResource = window.prompt('Duplicate rule to resource', rule.resource);
    if (newResource == null) return;
    const newAction = window.prompt('Duplicate rule to action', rule.action);
    if (newAction == null) return;
    try {
      const { resource, action } = this.parseResourceAction(newResource, newAction);
      const validation = this.validatePermissionPayload({ roleKeys: rule.roleKeys, resource, action });
      if (!validation.valid) return UI.toast(validation.message);
      await this.upsertPermissionGroup({
        resource: validation.resource,
        action: validation.action,
        roleKeys: validation.roleKeys,
        existingRows: []
      });
      UI.toast('Rule duplicated.');
      await this.syncPermissionStateAfterSave();
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to duplicate rule.'));
    }
  },

  async deleteRule(rule) {
    if (!Permissions.canEditRolesPermissions()) return UI.toast('Forbidden.');
    if (!window.confirm(`Remove permission rule ${rule.resource}:${rule.action}?`)) return;
    try {
      await Promise.all(rule.rows.map(row => Api.updateRolePermission(this.permissionId(row), {
        p_role_key: this.roleKey(row),
        role_key: this.roleKey(row),
        p_resource: String(row.resource || '').trim().toLowerCase(),
        resource: String(row.resource || '').trim().toLowerCase(),
        p_action: this.canonicalAction(row.action),
        action: this.canonicalAction(row.action),
        is_allowed: false,
        is_active: false,
        original_resource: String(row.resource || '').trim().toLowerCase(),
        original_action: this.canonicalAction(row.action)
      })));
      UI.toast('Permission rule removed.');
      await this.syncPermissionStateAfterSave();
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to remove permission rule.'));
    }
  },

  async upsertPermissionGroup({ resource, action, roleKeys, existingRows = [] }) {
    const validation = this.validatePermissionPayload({ roleKeys, resource, action });
    if (!validation.valid) throw new Error(validation.message);
    const targetRoles = new Set(validation.roleKeys);
    const rowsByRole = new Map();
    existingRows.forEach(row => {
      const key = this.roleKey(row);
      if (key) rowsByRole.set(key, row);
    });

    const upserts = [];
    targetRoles.forEach(roleKey => {
      const existing = rowsByRole.get(roleKey);
      const payload = {
        p_role_key: roleKey,
        role_key: roleKey,
        p_resource: validation.resource,
        resource: validation.resource,
        p_action: validation.action,
        action: validation.action,
        is_allowed: true,
        is_active: true,
        original_resource: validation.resource,
        original_action: validation.action
      };
      try { console.log('[RolesPermissions] upsert payload', payload); } catch {}
      upserts.push(Api.saveRolePermission(payload));
    });

    const deactivations = existingRows
      .filter(row => {
        const existingRole = this.roleKey(row);
        return existingRole && !targetRoles.has(existingRole) && this.permissionId(row);
      })
      .map(row => {
        const payload = {
          p_role_key: this.roleKey(row),
          role_key: this.roleKey(row),
          p_resource: validation.resource,
          resource: validation.resource,
          p_action: validation.action,
          action: validation.action,
          is_allowed: false,
          is_active: false,
          original_resource: validation.resource,
          original_action: validation.action
        };
        try { console.log('[RolesPermissions] final payload before save', { permission_id: this.permissionId(row), ...payload }); } catch {}
        return Api.updateRolePermission(this.permissionId(row), payload);
      });

    await Promise.all([...upserts, ...deactivations]);
  },

  selectedCrudActions() {
    const actions = [
      ['get', E.tabPermissionActionGet],
      ['list', E.tabPermissionActionList],
      ['create', E.tabPermissionActionCreate],
      ['save', E.tabPermissionActionSave],
      ['update', E.tabPermissionActionUpdate],
      ['delete', E.tabPermissionActionDelete]
    ]
      .filter(([, input]) => Boolean(input?.checked))
      .map(([action]) => action);
    const extras = String(E.tabPermissionExtraActions?.value || '')
      .split(',')
      .map(v => this.canonicalAction(v))
      .filter(Boolean);
    return [...new Set([...actions, ...extras])];
  },

  async applyBulkTabPermissions() {
    const roleKeys = this.readMultiSelectValues(E.tabPermissionRole);
    const { resource } = this.parseResourceAction(E.tabPermissionTarget?.value, '');
    const selectedActions = this.selectedCrudActions();

    const baseValidation = this.validatePermissionPayload({ roleKeys, resource, action: selectedActions[0] || '' });
    if (!baseValidation.valid) return UI.toast(baseValidation.message);
    const normalizedRoleKeys = baseValidation.roleKeys;

    const actionSet = new Set(selectedActions);
    const existingRows = this.state.permissions.filter(row => String(row.resource || '').trim().toLowerCase() === baseValidation.resource && normalizedRoleKeys.includes(this.roleKey(row)));

    const requests = [];
    normalizedRoleKeys.forEach(roleKey => {
      selectedActions.forEach(action => {
        const actionValidation = this.validatePermissionPayload({ roleKeys: [roleKey], resource: baseValidation.resource, action });
        if (!actionValidation.valid) return;
        const payload = {
          p_role_key: roleKey,
          role_key: roleKey,
          p_resource: actionValidation.resource,
          resource: actionValidation.resource,
          p_action: actionValidation.action,
          action: actionValidation.action,
          is_allowed: true,
          is_active: true,
          original_resource: actionValidation.resource,
          original_action: actionValidation.action
        };
        try { console.log('[RolesPermissions] upsert payload', payload); } catch {}
        requests.push(Api.saveRolePermission(payload));
      });

      existingRows
        .filter(row => this.roleKey(row) === roleKey && !actionSet.has(this.canonicalAction(row.action)) && this.permissionId(row))
        .forEach(row => {
          const payload = {
            p_role_key: roleKey,
            role_key: roleKey,
            p_resource: baseValidation.resource,
            resource: baseValidation.resource,
            p_action: this.canonicalAction(row.action),
            action: this.canonicalAction(row.action),
            is_allowed: false,
            is_active: false,
            original_resource: baseValidation.resource,
            original_action: this.canonicalAction(row.action)
          };
          try { console.log('[RolesPermissions] final payload before save', { permission_id: this.permissionId(row), ...payload }); } catch {}
          requests.push(Api.updateRolePermission(this.permissionId(row), payload));
        });
    });

    if (!requests.length) return UI.toast('No changes to apply.');

    try {
      await Promise.all(requests);
      UI.toast(`Applied CRUD helper on ${baseValidation.resource} for ${normalizedRoleKeys.length} role(s).`);
      await this.syncPermissionStateAfterSave();
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to apply CRUD helper changes.'));
    }
  }
};

window.RolesAdmin = RolesAdmin;
