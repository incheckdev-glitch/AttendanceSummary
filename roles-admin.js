const RolesAdmin = {
  state: {
    roles: [],
    permissions: [],
    groupedPermissions: [],
    filteredPermissions: [],
    filters: { resource: '', action: '', role: '', text: '' },
    loadingRoles: false,
    loadingPermissions: false,
    limit: 500,
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
        const resource = String(E.rolePermissionCreateResource?.value || '').trim().toLowerCase();
        const action = this.canonicalAction(E.rolePermissionCreateAction?.value);
        const selectedRoles = this.readMultiSelectValues(E.rolePermissionCreateAllowedRoles);
        const roleKeys = this.normalizeRoleKeys(selectedRoles);
        const description = String(E.rolePermissionCreateDescription?.value || '').trim();
        if (!resource || !action || !roleKeys.length) return UI.toast('resource, action, and roles are required.');
        try {
          await this.upsertPermissionGroup({ resource, action, roleKeys, description, existingRows: [] });
          UI.toast('Permission rule created.');
          E.rolePermissionCreateForm.reset();
          this.togglePermissionCreate(false);
          await this.refreshPermissions(true);
          await Permissions.loadMatrix(true);
          UI.applyRolePermissions();
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
    return [...new Set(source.map(v => this.normalizeRoleKey(v)).filter(Boolean))];
  },

  readMultiSelectValues(selectEl) {
    if (!selectEl) return [];
    return [...selectEl.options].filter(option => option.selected).map(option => option.value);
  },

  canonicalAction(action) {
    const normalized = String(action || '').trim().toLowerCase();
    if (!normalized) return '';
    const map = { view: 'get', read: 'get', edit: 'update', manage: 'update' };
    return map[normalized] || normalized;
  },

  extractRows(response) {
    if (response && typeof response === 'object' && Array.isArray(response.rows)) return response.rows;
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.items)) return response.items;
    return [];
  },

  roleKey(role = {}) {
    return this.normalizeRoleKey(role.role_key || role.key || role.role || role.id);
  },

  displayName(role = {}) {
    return String(role.role_name || role.display_name || role.name || this.roleKey(role) || '').trim();
  },

  permissionId(permission = {}) {
    return String(permission.permission_id || permission.id || '').trim();
  },

  permissionActive(permission = {}) {
    return permission?.is_active !== false && permission?.is_allowed !== false;
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
          description: String(row.description || '').trim(),
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
      if (!rule.description && row.description) rule.description = String(row.description || '').trim();
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
      const response = await Api.listRoles({ limit: this.state.limit, page: this.state.page, summary_only: true, forceRefresh: force });
      this.state.roles = this.extractRows(response);
      this.renderRolesTable();
      this.renderRoleSelects();
      this.renderKpis();
    } catch (error) {
      this.state.roles = [];
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
      const response = await Api.listRolePermissions({ limit: this.state.limit, page: this.state.page, summary_only: true, forceRefresh: force });
      this.state.permissions = this.extractRows(response);
      this.state.groupedPermissions = this.groupPermissions(this.state.permissions);
      this.renderPermissionsTable();
      this.renderKpis();
    } catch (error) {
      this.state.permissions = [];
      this.state.groupedPermissions = [];
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
    if (error) {
      E.rpRolesState.textContent = error;
      E.rpRolesTbody.innerHTML = '';
      return;
    }
    if (!this.state.roles.length) {
      E.rpRolesState.textContent = 'No roles found.';
      E.rpRolesTbody.innerHTML = '';
      return;
    }
    E.rpRolesState.textContent = `${this.state.roles.length} role(s)`;
    E.rpRolesTbody.innerHTML = this.state.roles.map(role => {
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
          this.renderPermissionsTable();
          return;
        }
        if (action === 'edit') await this.editRole(role);
        if (action === 'delete') await this.deleteRole(role);
      });
    });
  },

  async editRole(role) {
    const roleKey = this.roleKey(role);
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
    if (!window.confirm(`Delete role "${roleKey}"?`)) return;
    try {
      await Api.deleteRole(roleKey);
      UI.toast('Role deleted.');
      await this.loadAll(true);
      await Permissions.loadMatrix(true);
      UI.applyRolePermissions();
    } catch (error) {
      UI.toast(`Unable to delete role. ${String(error?.message || 'This role may still be referenced in profiles or permissions.')}`);
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
      const searchable = `${rule.resource} ${rule.action} ${rule.roleKeys.join(' ')} ${String(rule.description || '').toLowerCase()}`;
      if (resource && !rule.resource.includes(resource)) return false;
      if (action && !rule.action.includes(action)) return false;
      if (role && !rule.roleKeys.some(roleKey => roleKey.includes(role))) return false;
      if (text && !searchable.includes(text)) return false;
      return true;
    });
  },

  renderPermissionsTable(error = '') {
    if (!E.rolePermissionsTbody || !E.rolePermissionsState) return;
    if (error) {
      E.rolePermissionsState.textContent = error;
      E.rolePermissionsTbody.innerHTML = '';
      return;
    }
    const rules = this.filteredPermissionRows();
    this.state.filteredPermissions = rules;
    if (!rules.length) {
      E.rolePermissionsState.textContent = this.state.groupedPermissions.length ? 'No grouped rules match current filters.' : 'No permission rules found.';
      E.rolePermissionsTbody.innerHTML = '';
      return;
    }
    E.rolePermissionsState.textContent = `${rules.length} grouped rule(s)`;
    E.rolePermissionsTbody.innerHTML = rules.map(rule => `
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
        <td><input class="input sm" data-rule-field="description" type="text" value="${U.escapeAttr(rule.description || '')}" disabled /></td>
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
  },

  toggleRuleEdit(row, editable) {
    row.querySelectorAll('[data-rule-field="resource"],[data-rule-field="action"],[data-rule-field="description"]').forEach(input => {
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
    const resource = String(row.querySelector('[data-rule-field="resource"]')?.value || '').trim().toLowerCase();
    const action = this.canonicalAction(row.querySelector('[data-rule-field="action"]')?.value || '');
    const roleKeys = this.normalizeRoleKeys(this.readMultiSelectValues(row.querySelector('[data-rule-field="roles"]')));
    const description = String(row.querySelector('[data-rule-field="description"]')?.value || '').trim();
    if (!resource || !action || !roleKeys.length) return UI.toast('resource, action, and at least one role are required.');

    try {
      await this.upsertPermissionGroup({ resource, action, roleKeys, description, existingRows: rule.rows });
      UI.toast('Permission rule saved.');
      await this.refreshPermissions(true);
      await Permissions.loadMatrix(true);
      UI.applyRolePermissions();
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
      await this.upsertPermissionGroup({
        resource: String(newResource || '').trim().toLowerCase(),
        action: this.canonicalAction(newAction),
        roleKeys: rule.roleKeys,
        description: rule.description,
        existingRows: []
      });
      UI.toast('Rule duplicated.');
      await this.refreshPermissions(true);
      await Permissions.loadMatrix(true);
      UI.applyRolePermissions();
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to duplicate rule.'));
    }
  },

  async deleteRule(rule) {
    if (!Permissions.canEditRolesPermissions()) return UI.toast('Forbidden.');
    if (!window.confirm(`Remove permission rule ${rule.resource}:${rule.action}?`)) return;
    try {
      await Promise.all(rule.rows.map(row => Api.updateRolePermission(this.permissionId(row), {
        role_key: this.roleKey(row),
        resource: String(row.resource || '').trim().toLowerCase(),
        action: this.canonicalAction(row.action),
        is_allowed: false,
        is_active: false,
        description: String(row.description || '').trim()
      })));
      UI.toast('Permission rule removed.');
      await this.refreshPermissions(true);
      await Permissions.loadMatrix(true);
      UI.applyRolePermissions();
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to remove permission rule.'));
    }
  },

  async upsertPermissionGroup({ resource, action, roleKeys, description, existingRows = [] }) {
    const targetRoles = new Set(this.normalizeRoleKeys(roleKeys));
    const rowsByRole = new Map();
    existingRows.forEach(row => {
      const key = this.roleKey(row);
      if (key) rowsByRole.set(key, row);
    });

    const upserts = [];
    targetRoles.forEach(roleKey => {
      const existing = rowsByRole.get(roleKey);
      if (existing && this.permissionId(existing)) {
        upserts.push(Api.updateRolePermission(this.permissionId(existing), {
          role_key: roleKey,
          resource,
          action,
          is_allowed: true,
          is_active: true,
          description
        }));
      } else {
        upserts.push(Api.createRolePermission({
          role_key: roleKey,
          resource,
          action,
          is_allowed: true,
          is_active: true,
          description,
          allowed_roles: ''
        }));
      }
    });

    const deactivations = existingRows
      .filter(row => {
        const existingRole = this.roleKey(row);
        return existingRole && !targetRoles.has(existingRole) && this.permissionId(row);
      })
      .map(row => Api.updateRolePermission(this.permissionId(row), {
        role_key: this.roleKey(row),
        resource,
        action,
        is_allowed: false,
        is_active: false,
        description
      }));

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
    const roleKeys = this.normalizeRoleKeys(this.readMultiSelectValues(E.tabPermissionRole));
    const resource = String(E.tabPermissionTarget?.value || '').trim().toLowerCase();
    const selectedActions = this.selectedCrudActions();

    if (!roleKeys.length) return UI.toast('Please select at least one role.');
    if (!resource) return UI.toast('Please enter a resource.');

    const actionSet = new Set(selectedActions);
    const existingRows = this.state.permissions.filter(row => String(row.resource || '').trim().toLowerCase() === resource && roleKeys.includes(this.roleKey(row)));
    const byRoleAction = new Map(existingRows.map(row => [`${this.roleKey(row)}:${this.canonicalAction(row.action)}`, row]));

    const requests = [];
    roleKeys.forEach(roleKey => {
      selectedActions.forEach(action => {
        const existing = byRoleAction.get(`${roleKey}:${action}`);
        if (existing && this.permissionId(existing)) {
          requests.push(Api.updateRolePermission(this.permissionId(existing), {
            role_key: roleKey,
            resource,
            action,
            is_allowed: true,
            is_active: true
          }));
        } else {
          requests.push(Api.createRolePermission({ role_key: roleKey, resource, action, is_allowed: true, is_active: true, allowed_roles: '' }));
        }
      });

      existingRows
        .filter(row => this.roleKey(row) === roleKey && !actionSet.has(this.canonicalAction(row.action)) && this.permissionId(row))
        .forEach(row => {
          requests.push(Api.updateRolePermission(this.permissionId(row), {
            role_key: roleKey,
            resource,
            action: this.canonicalAction(row.action),
            is_allowed: false,
            is_active: false
          }));
        });
    });

    if (!requests.length) return UI.toast('No changes to apply.');

    try {
      await Promise.all(requests);
      UI.toast(`Applied CRUD helper on ${resource} for ${roleKeys.length} role(s).`);
      await this.refreshPermissions(true);
      await Permissions.loadMatrix(true);
      UI.applyRolePermissions();
    } catch (error) {
      UI.toast(String(error?.message || 'Unable to apply CRUD helper changes.'));
    }
  }
};

window.RolesAdmin = RolesAdmin;
