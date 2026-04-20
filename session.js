const Session = {
  state: {
    role: null,
    authToken: '',
    user_id: '',
    name: '',
    email: '',
    username: ''
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
    try {
      if (window.Api?.clearApiCache) window.Api.clearApiCache();
    } catch {}
  },
  normalizeSessionPayload(session = {}, fallbackToken = '') {
    const token = String(session?.token || session?.authToken || fallbackToken || '').trim();
    const role = String(session?.role || '')
      .trim()
      .toLowerCase();
    if (!token || !role) return null;
    return {
      authToken: token,
      role,
      user_id: String(session?.user_id || session?.id || '').trim(),
      name: String(session?.name || '').trim(),
      email: String(session?.email || '').trim(),
      username: String(session?.username || '').trim()
    };
  },
  applySessionPayload(payload, { clearRoleCacheOnChange = true } = {}) {
    if (!payload) return false;
    const previousRole = this.state.role;
    if (clearRoleCacheOnChange && previousRole && previousRole !== payload.role) {
      this.clearRoleScopedCache();
    }
    this.state = {
      role: payload.role,
      authToken: payload.authToken,
      user_id: payload.user_id,
      name: payload.name,
      email: payload.email,
      username: payload.username
    };
    this.persist();
    return true;
  },
  restore() {
    try {
      const sessionRaw = sessionStorage.getItem(LS_KEYS.session);
      const persistentRaw = localStorage.getItem(LS_KEYS.persistentSession);
      const raw = sessionRaw || persistentRaw;
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const normalized = this.normalizeSessionPayload(
        {
          token: parsed?.authToken,
          role: parsed?.role,
          user_id: parsed?.user_id,
          name: parsed?.name,
          email: parsed?.email,
          username: parsed?.username
        },
        ''
      );
      if (!normalized) return false;
      return this.applySessionPayload(normalized, { clearRoleCacheOnChange: false });
    } catch {
      return false;
    }
  },
  persist() {
    try {
      sessionStorage.setItem(LS_KEYS.session, JSON.stringify(this.state));
    } catch {}
    try {
      localStorage.setItem(LS_KEYS.persistentSession, JSON.stringify(this.state));
    } catch {}
  },
  async login(identifier = '', passcode = '') {
    const enteredIdentifier = String(identifier || '').trim();
    const enteredPasscode = String(passcode || '').trim();
    if (!enteredIdentifier) throw new Error('Username or email is required.');
    if (!enteredPasscode) throw new Error('Password is required.');

    const response = await Api.post('auth', 'login', {
      identifier: enteredIdentifier,
      passcode: enteredPasscode
    });
    const normalized = this.normalizeSessionPayload(this.extractSession(response));
    if (!normalized) {
      throw new Error('Login succeeded but backend returned an invalid session payload.');
    }

    this.applySessionPayload(normalized);
    return this.user();
  },
  logout({ preserveCache = true } = {}) {
    const authToken = this.state.authToken || '';
    this.clearClientSession({ clearRoleCache: !preserveCache });

    if (authToken) {
      Api.post('auth', 'logout', { authToken }).catch(error => {
        console.warn('Auth logout request failed', error);
      });
    }
  },
  clearClientSession({ clearRoleCache = true } = {}) {
    if (clearRoleCache && this.state.role) {
      this.clearRoleScopedCache();
    }
    this.state = {
      role: null,
      authToken: '',
      user_id: '',
      name: '',
      email: '',
      username: ''
    };
    try {
      sessionStorage.removeItem(LS_KEYS.session);
    } catch {}
    try {
      localStorage.removeItem(LS_KEYS.persistentSession);
    } catch {}
  },
  async validateSession() {
    const authToken = this.state.authToken || '';
    if (!authToken) return false;
    const response = await Api.post('auth', 'session', { authToken });
    const normalized = this.normalizeSessionPayload(this.extractSession(response), authToken);
    if (!normalized) return false;
    this.applySessionPayload(normalized, { clearRoleCacheOnChange: false });
    return true;
  },
  extractSession(response = {}) {
    const candidates = [
      response?.session,
      response?.data?.session,
      response?.result?.session,
      response?.payload?.session,
      response
    ];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      if (candidate.session && typeof candidate.session === 'object') return candidate.session;
      if (candidate.token || candidate.authToken) return candidate;
    }
    return {};
  },
  user() {
    return {
      role: this.state.role,
      authToken: this.state.authToken,
      user_id: this.state.user_id,
      name: this.state.name,
      email: this.state.email,
      username: this.state.username
    };
  },
  isAuthenticated() {
    return !!this.state.authToken && !!String(this.state.role || '').trim();
  },
  role() {
    return this.state.role || null;
  },
  username() {
    return this.state.username || '';
  },
  userId() {
    return this.state.user_id || '';
  },
  displayName() {
    return this.state.name || this.state.username || this.state.email || '';
  },
  getAuthToken() {
    return this.state.authToken || '';
  },
  isAdmin() {
    return this.role() === ROLES.ADMIN;
  },
  authContext() {
    return { role: this.role(), authToken: this.getAuthToken() };
  }
};

function isAuthError(error) {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();
  if (!message) return false;

  const authErrorPatterns = [
    /\bunauthorized\b/,
    /\bforbidden\b/,
    /invalid\s+(?:auth(?:entication)?\s+)?token/,
    /token\s+(?:is\s+)?invalid/,
    /expired\s+(?:auth(?:entication)?\s+)?token/,
    /expired\s+session/,
    /session\s+expired/,
    /invalid\s+session/,
    /missing\s+authentication\s+token/,
    /authentication\s+required/,
    /not\s+authenticated/,
    /permission\s+denied/
  ];

  return authErrorPatterns.some(pattern => pattern.test(message));
}
