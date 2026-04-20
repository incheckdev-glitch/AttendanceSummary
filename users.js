const UserAdmin = {
  state: {
    rows: [],
    roles: [],
    page: 1,
    limit: 50,
    offset: 0,
    returned: 0,
    hasMore: false,
    total: 0,
    loading: false,
    loadingRoles: false,
    error: '',
    editingUserId: ''
  },
  wire() {
    if (E.usersRefreshBtn) {
      E.usersRefreshBtn.addEventListener('click', () => this.refresh(true));
    }
    if (E.userCreateForm) {
      E.userCreateForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!Permissions.canManageUsers()) {
          UI.toast('Only admin can manage users.');
          return;
        }
        const payload = {
          name: String(E.userCreateName?.value || '').trim(),
          username: String(E.userCreateUsername?.value || '').trim(),
          email: String(E.userCreateEmail?.value || '').trim(),
          role: String(E.userCreateRole?.value || '').trim().toLowerCase(),
          password: String(E.userCreatePassword?.value || '')
        };
        if (!payload.name || !payload.username || !payload.email || !payload.password || !payload.role) {
          UI.toast('Name, username, email, role, and password are required.');
          return;
        }
        try {
          await Api.postAuthenticated('users', 'create', {
            user: payload,
            ...payload
          });
          if (E.userCreateForm) E.userCreateForm.reset();
          this.applyRoleOptions(this.state.roles);
          UI.toast('User created successfully.');
          await this.refresh();
        } catch (error) {
          this.handleError(error, 'Unable to create user.');
        }
      });
    }
    if (E.userEditClose) E.userEditClose.addEventListener('click', () => this.closeEditModal());
    if (E.userEditCancel) E.userEditCancel.addEventListener('click', () => this.closeEditModal());
    if (E.userEditForm) {
      E.userEditForm.addEventListener('submit', async e => {
        e.preventDefault();
        await this.submitEdit();
      });
    }
    this.loadRoles();
  },
  normalizeRole(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  },
  roleOptionsFromRows(rows = []) {
    return rows
      .map(role => ({
        key: this.normalizeRole(role.role_key || role.key || role.role),
        label: String(role.display_name || role.role_key || role.key || role.role || '').trim(),
        isActive: role?.is_active !== false
      }))
      .filter(role => role.key && role.label);
  },
  async loadRoles(force = false) {
    if (this.state.loadingRoles && !force) return;
    this.state.loadingRoles = true;
    try {
      if (window.RolesAdmin?.ensureRolesLoaded) {
        this.state.roles = await RolesAdmin.ensureRolesLoaded(force);
      } else {
        const response = await Api.listRoles();
        this.state.roles = this.extractRows(response);
      }
      this.applyRoleOptions(this.state.roles);
    } catch {
      this.state.roles = [];
      this.applyRoleOptions([]);
    } finally {
      this.state.loadingRoles = false;
    }
  },
  applyRoleOptions(rows = [], selectedRole = '') {
    const options = this.roleOptionsFromRows(rows);
    const activeOptions = options.filter(role => role.isActive);
    const normalizedSelected = this.normalizeRole(selectedRole);
    const setOptions = (selectEl, { fallbackLabel, includeSelected = false } = {}) => {
      if (!selectEl) return;
      let scoped = activeOptions.slice();
      if (includeSelected && normalizedSelected && !scoped.some(role => role.key === normalizedSelected)) {
        const selectedOption = options.find(role => role.key === normalizedSelected);
        if (selectedOption) scoped = [selectedOption, ...scoped];
        else scoped = [{ key: normalizedSelected, label: normalizedSelected, isActive: false }, ...scoped];
      }
      if (!scoped.length) {
        selectEl.innerHTML = `<option value="">${fallbackLabel || 'No roles available'}</option>`;
        selectEl.disabled = true;
        return;
      }
      selectEl.disabled = false;
      selectEl.innerHTML = scoped
        .map(role => `<option value="${U.escapeAttr(role.key)}">${U.escapeHtml(role.label)}</option>`)
        .join('');
      if (includeSelected && normalizedSelected) selectEl.value = normalizedSelected;
    };
    setOptions(E.userCreateRole, { fallbackLabel: 'No roles available (refresh Roles)' });
    setOptions(E.userEditRole, { fallbackLabel: 'No roles available (refresh Roles)', includeSelected: true });
  },
  async refresh(force = false) {
    if (!Permissions.canManageUsers()) return;
    if (!this.state.roles.length && !this.state.loadingRoles) {
      await this.loadRoles();
    }
    if (this.state.loading && !force) return;
    this.state.loading = true;
    this.state.error = '';
    this.render();
    try {
      const response = await Api.postAuthenticatedCached(
        'users',
        'list',
        {
          limit: this.state.limit,
          page: this.state.page,
          sort_by: 'updated_at',
          sort_dir: 'desc',
          summary_only: true
        },
        { forceRefresh: force }
      );
      const normalized = this.extractListResult(response);
      this.state.rows = normalized.rows;
      this.state.total = normalized.total;
      this.state.returned = normalized.returned;
      this.state.hasMore = normalized.hasMore;
      this.state.page = normalized.page;
      this.state.limit = normalized.limit;
      this.state.offset = normalized.offset;
      this.state.error = '';
      this.render();
    } catch (error) {
      this.state.rows = [];
      this.state.error = String(error?.message || '').trim() || 'Unable to load users right now.';
      this.render(error);
      this.handleError(error, 'Unable to load users.');
    } finally {
      this.state.loading = false;
      this.render();
    }
  },
  extractRows(response) {
    const candidates = [
      response,
      response?.users,
      response?.items,
      response?.rows,
      response?.data,
      response?.result,
      response?.payload,
      response?.users?.items,
      response?.users?.rows,
      response?.data?.users,
      response?.data?.items,
      response?.data?.rows,
      response?.result?.users,
      response?.payload?.users
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }

    const objectCandidates = [
      response?.users,
      response?.data?.users,
      response?.result?.users,
      response?.payload?.users
    ];
    for (const candidate of objectCandidates) {
      if (candidate && typeof candidate === 'object') return Object.values(candidate);
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
  formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return U.fmtDisplayDate(value);
  },
  normalizeActive(user = {}) {
    if (typeof user.active === 'boolean') return user.active;
    if (typeof user.is_active === 'boolean') return user.is_active;
    const status = String(user.status || '').toLowerCase();
    if (status === 'inactive' || status === 'disabled' || status === 'deactivated') return false;
    return true;
  },
  getUserId(user = {}) {
    return String(user.id || user.user_id || user.userId || '').trim();
  },
  getCreatedAt(user = {}) {
    return user.created_at || user.createdAt || user.created || '';
  },
  getUpdatedAt(user = {}) {
    return user.updated_at || user.updatedAt || user.updated || '';
  },
  getLastLoginAt(user = {}) {
    return user.last_login_at || user.lastLoginAt || user.last_login || '';
  },
  render(error = null) {
    if (!E.usersTbody || !E.usersState) return;
    if (this.state.loading) {
      E.usersState.textContent = 'Loading users…';
      E.usersTbody.innerHTML = '';
      return;
    }
    if (error) {
      E.usersState.textContent = this.state.error || 'Unable to load users right now.';
      E.usersTbody.innerHTML = '';
      return;
    }
    if (!this.state.rows.length) {
      E.usersState.textContent = 'No users found.';
      E.usersTbody.innerHTML = '';
      return;
    }

    E.usersState.textContent = `${this.state.rows.length} user(s)`;
    E.usersTbody.innerHTML = this.state.rows
      .map(user => {
        const userId = this.getUserId(user);
        const currentUserId = Session.user().user_id;
        const isSelf = !!userId && userId === currentUserId;
        const active = this.normalizeActive(user);
        const role = this.normalizeRole(user.role || '—') || '—';
        const created = this.formatDate(this.getCreatedAt(user));
        const updated = this.formatDate(this.getUpdatedAt(user));
        const lastLogin = this.formatDate(this.getLastLoginAt(user));
        return `<tr data-user-id="${U.escapeHtml(userId)}">
          <td>${U.escapeHtml(user.name || '—')}</td>
          <td>${U.escapeHtml(user.email || '—')}</td>
          <td>${U.escapeHtml(user.username || '—')}</td>
          <td>${U.escapeHtml(role)}</td>
          <td>${active ? 'true' : 'false'}</td>
          <td>${U.escapeHtml(created)}</td>
          <td>${U.escapeHtml(updated)}</td>
          <td>${U.escapeHtml(lastLogin)}</td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="chip-btn" data-user-action="edit">Edit</button>
              <button class="chip-btn" data-user-action="reset">Reset pwd</button>
              <button class="chip-btn" data-user-action="toggle">${active ? 'Deactivate' : 'Activate'}</button>
              ${isSelf ? '<span class="muted" style="font-size:11px;">(You)</span>' : ''}
            </div>
          </td>
        </tr>`;
      })
      .join('');

    E.usersTbody.querySelectorAll('[data-user-action]').forEach(btn => {
      btn.addEventListener('click', async event => {
        const action = event.currentTarget.getAttribute('data-user-action');
        const rowEl = event.currentTarget.closest('tr');
        const userId = String(rowEl?.getAttribute('data-user-id') || '').trim();
        const user = this.state.rows.find(r => this.getUserId(r) === userId);
        if (!user || !userId) return;
        if (action === 'edit') await this.editUser(user);
        if (action === 'reset') await this.resetPassword(user);
        if (action === 'toggle') await this.toggleUserStatus(user);
      });
    });
  },
  async editUser(user) {
    const currentUserId = Session.user().user_id;
    const userId = this.getUserId(user);
    const isSelf = userId === String(currentUserId || '');
    await this.loadRoles();
    if (!this.state.roles.length) return UI.toast('No roles available. Refresh Roles & Permissions first.');
    this.state.editingUserId = userId;
    if (E.userEditName) E.userEditName.value = String(user.name || '');
    if (E.userEditEmail) E.userEditEmail.value = String(user.email || '');
    if (E.userEditUsername) E.userEditUsername.value = String(user.username || '');
    const existingRole = this.normalizeRole(user.role || '');
    this.applyRoleOptions(this.state.roles, existingRole);
    if (E.userEditRole) E.userEditRole.value = existingRole;
    if (E.userEditModal) {
      E.userEditModal.classList.add('open');
      E.userEditModal.setAttribute('aria-hidden', 'false');
    }
    if (E.userEditSubmit) E.userEditSubmit.dataset.selfEdit = isSelf ? 'true' : 'false';
  },
  closeEditModal() {
    this.state.editingUserId = '';
    if (E.userEditModal) {
      E.userEditModal.classList.remove('open');
      E.userEditModal.setAttribute('aria-hidden', 'true');
    }
  },
  async submitEdit() {
    const userId = this.state.editingUserId;
    if (!userId) return;
    const name = String(E.userEditName?.value || '').trim();
    const email = String(E.userEditEmail?.value || '').trim();
    const username = String(E.userEditUsername?.value || '').trim();
    const normalizedRole = this.normalizeRole(E.userEditRole?.value || '');
    if (!name || !email || !username || !normalizedRole) {
      UI.toast('Name, username, email, and role are required.');
      return;
    }
    if (E.userEditSubmit?.dataset.selfEdit === 'true' && normalizedRole !== ROLES.ADMIN) {
      const allow = window.confirm('You are editing your own account. Changing your role may end admin access. Continue?');
      if (!allow) return;
    }
    try {
      await Api.postAuthenticated('users', 'update', {
        user_id: userId,
        id: userId,
        updates: {
          name: String(name).trim(),
          email: String(email).trim(),
          username: String(username).trim(),
          role: normalizedRole
        },
        user: {
          id: userId,
          user_id: userId,
          name: String(name).trim(),
          email: String(email).trim(),
          username: String(username).trim(),
          role: normalizedRole
        }
      });
      UI.toast('User updated.');
      this.closeEditModal();
      await this.refresh();
    } catch (error) {
      this.handleError(error, 'Unable to update user.');
    }
  },
  async toggleUserStatus(user) {
    const currentUserId = Session.user().user_id;
    const userId = this.getUserId(user);
    const isSelf = userId === String(currentUserId || '');
    const active = this.normalizeActive(user);
    if (isSelf && active) {
      UI.toast('You cannot deactivate your own active session from this screen.');
      return;
    }
    const confirmed = window.confirm(`${active ? 'Deactivate' : 'Activate'} user ${user.username || user.email || userId}?`);
    if (!confirmed) return;
    try {
      await Api.postAuthenticated('users', active ? 'deactivate' : 'activate', {
        user_id: userId,
        id: userId
      });
      UI.toast(`User ${active ? 'deactivated' : 'activated'}.`);
      await this.refresh();
    } catch (error) {
      this.handleError(error, 'Unable to update user status.');
    }
  },
  async resetPassword(user) {
    const newPassword = window.prompt(`Enter a new password for ${user.username || user.email}`);
    if (!newPassword) return;
    if (String(newPassword).length < 8) {
      UI.toast('Password should be at least 8 characters.');
      return;
    }
    const confirmed = window.confirm('Reset password now?');
    if (!confirmed) return;
    try {
      await Api.postAuthenticated('users', 'reset_password', {
        user_id: this.getUserId(user),
        id: this.getUserId(user),
        newPassword,
        password: newPassword,
        passcode: newPassword
      });
      UI.toast('Password reset successfully.');
    } catch (error) {
      this.handleError(error, 'Unable to reset password.');
    }
  },
  handleError(error, fallbackMessage) {
    if (isAuthError(error)) {
      handleExpiredSession('Session expired. Please log in again.');
      return;
    }
    const message = String(error?.message || '').trim();
    if (/forbidden|permission|admin/i.test(message)) {
      UI.toast('Forbidden: admin access is required.');
      return;
    }
    UI.toast(message || fallbackMessage);
  }
};

window.UserAdmin = UserAdmin;
