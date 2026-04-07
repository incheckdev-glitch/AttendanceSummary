const Session = {
  state: {
    role: null,
    authToken: ''
  },
  clearRoleScopedCache() {
    const roleScopedKeys = [
      LS_KEYS.issues,
      LS_KEYS.issuesLastUpdated,
      LS_KEYS.events,
      LS_KEYS.eventsLastUpdated,
      LS_KEYS.dataVersion
    ];
    roleScopedKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch {}
    });
  },
  restore() {
    try {
      const raw = sessionStorage.getItem(LS_KEYS.session);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const role = parsed?.role === ROLES.ADMIN ? ROLES.ADMIN : parsed?.role === ROLES.VIEWER ? ROLES.VIEWER : null;
      const authToken = String(parsed?.authToken || '');
      if (!role || !authToken) return false;
      this.state.role = role;
      this.state.authToken = authToken;
      return true;
    } catch {
      return false;
    }
  },
  persist() {
    try {
      sessionStorage.setItem(LS_KEYS.session, JSON.stringify(this.state));
    } catch {}
  },
  async login(role = '', passcode = '') {
    const selectedRole = String(role || '').trim().toLowerCase();
    const enteredPasscode = String(passcode || '').trim();
    const normalizedSelectedRole =
      selectedRole === ROLES.ADMIN ? ROLES.ADMIN : selectedRole === ROLES.VIEWER ? ROLES.VIEWER : null;
    if (!normalizedSelectedRole) throw new Error('Role is required.');
    if (!enteredPasscode) throw new Error('Passcode is required.');

    const response = await Api.post('auth', 'login', {
      role: normalizedSelectedRole,
      passcode: enteredPasscode
    });
    const session = response?.session || {};
    const authToken = String(session.token || '').trim();
    const backendRole = String(session.role || '').trim().toLowerCase();
    const normalizedRole =
      backendRole === ROLES.ADMIN ? ROLES.ADMIN : backendRole === ROLES.VIEWER ? ROLES.VIEWER : null;
    if (!authToken || !normalizedRole) {
      throw new Error('Login succeeded but backend did not return a valid session.');
    }

    const previousRole = this.state.role;
    if (previousRole && previousRole !== normalizedRole) {
      this.clearRoleScopedCache();
    }
    this.state.role = normalizedRole;
    this.state.authToken = authToken;
    this.persist();
    return { role: normalizedRole };
  },
  async logout() {
    const authToken = this.state.authToken || '';
    if (authToken) {
      try {
        await Api.post('auth', 'logout', { authToken });
      } catch (error) {
        console.warn('Auth logout request failed', error);
      }
    }
    this.clearClientSession();
  },
  clearClientSession() {
    if (this.state.role) {
      this.clearRoleScopedCache();
    }
    this.state.role = null;
    this.state.authToken = '';
    try {
      sessionStorage.removeItem(LS_KEYS.session);
    } catch {}
  },
  async validateSession() {
    const authToken = this.state.authToken || '';
    if (!authToken) return false;
    const response = await Api.post('auth', 'session', { authToken });
    const session = response?.session || {};
    const backendRole = String(session.role || '').trim().toLowerCase();
    const refreshedAuthToken = String(session.token || authToken).trim();
    const normalizedRole =
      backendRole === ROLES.ADMIN ? ROLES.ADMIN : backendRole === ROLES.VIEWER ? ROLES.VIEWER : null;
    if (!normalizedRole || !refreshedAuthToken) return false;
    this.state.role = normalizedRole;
    this.state.authToken = refreshedAuthToken;
    this.persist();
    return true;
  },
  isAuthenticated() {
    return this.state.role === ROLES.ADMIN || this.state.role === ROLES.VIEWER;
  },
  role() {
    return this.state.role || null;
  },
  getAuthToken() {
    return this.state.authToken || '';
  },
  authContext() {
    return { role: this.role(), authToken: this.getAuthToken() };
  }
};

function isAuthError(error) {
  const message = String(error?.message || '');
  return /unauthorized|forbidden|invalid.*token|expired.*session|invalid.*session|auth/i.test(message);
}
