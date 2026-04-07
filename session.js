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
      if (!role) return false;
      this.state.role = role;
      this.state.authToken = String(parsed?.authToken || 'supabase-session');
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
    // Legacy signature kept for minimal UI changes: role field carries email, passcode carries password.
    const email = String(role || '').trim();
    const password = String(passcode || '').trim();
    if (!email || !password) throw new Error('Email and password are required.');

    const response = await Api.post('auth', 'login', { email, password });
    const profile = response?.profile || {};
    const normalizedRole =
      String(profile?.role || '').trim().toLowerCase() === ROLES.ADMIN ? ROLES.ADMIN : ROLES.VIEWER;

    const previousRole = this.state.role;
    if (previousRole && previousRole !== normalizedRole) {
      this.clearRoleScopedCache();
    }

    this.state.role = normalizedRole;
    this.state.authToken = String(response?.session?.access_token || 'supabase-session');
    this.persist();
    return { role: normalizedRole, user: response?.user || null, profile };
  },
  async logout() {
    try {
      await Api.post('auth', 'logout', {});
    } catch (error) {
      console.warn('Auth logout request failed', error);
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
    const response = await Api.post('auth', 'session', {});
    if (!response?.session || !response?.user) return false;

    const backendRole = String(response?.profile?.role || '')
      .trim()
      .toLowerCase();
    const normalizedRole = backendRole === ROLES.ADMIN ? ROLES.ADMIN : ROLES.VIEWER;

    this.state.role = normalizedRole;
    this.state.authToken = String(response?.session?.access_token || 'supabase-session');
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
