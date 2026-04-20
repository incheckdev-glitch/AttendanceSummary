const Session = {
  state: {
    role: null,
    authToken: '',
    user_id: '',
    name: '',
    email: '',
    username: '',
    session: null,
    authUser: null,
    profile: null
  },
  listeners: new Set(),
  authSubscription: null,

  clearRoleScopedCache() {
    const roleScopedKeys = [LS_KEYS.issues, LS_KEYS.issuesLastUpdated, LS_KEYS.events, LS_KEYS.eventsLastUpdated, LS_KEYS.dataVersion];
    roleScopedKeys.forEach(key => { try { localStorage.removeItem(key); } catch {} });
    try { if (window.Api?.clearApiCache) window.Api.clearApiCache(); } catch {}
  },

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notify() {
    this.listeners.forEach(listener => {
      try { listener(this.user()); } catch {}
    });
  },

  normalizeRole(roleValue) {
    return String(roleValue || '').trim().toLowerCase();
  },

  buildState(authUser = null, session = null, profile = null) {
    const role = this.normalizeRole(profile?.role_key);
    return {
      role: role || null,
      authToken: String(session?.access_token || ''),
      user_id: String(profile?.id || authUser?.id || ''),
      name: String(profile?.full_name || profile?.name || authUser?.user_metadata?.full_name || '').trim(),
      email: String(profile?.email || authUser?.email || '').trim(),
      username: String(profile?.username || authUser?.user_metadata?.username || '').trim(),
      session: session || null,
      authUser: authUser || null,
      profile: profile || null
    };
  },

  applyState(nextState, { clearRoleCacheOnChange = true } = {}) {
    const prevRole = this.state.role;
    if (clearRoleCacheOnChange && prevRole && prevRole !== nextState.role) this.clearRoleScopedCache();
    this.state = nextState;
    this.persist();
    this.notify();
    return true;
  },

  async fetchProfile(userId) {
    const id = String(userId || '').trim();
    if (!id) return null;
    const client = SupabaseClient.getClient();
    const { data, error } = await client
      .from('profiles')
      .select('id, name, email, username, role_key, is_active')
      .eq('id', id)
      .single();
    if (error) throw new Error(`Unable to load user profile: ${error.message}`);
    if (!data?.is_active) {
      await client.auth.signOut();
      throw new Error('Your account is inactive. Please contact an administrator.');
    }
    return data;
  },

  persist() {
    const serializable = {
      role: this.state.role,
      user_id: this.state.user_id,
      name: this.state.name,
      email: this.state.email,
      username: this.state.username
    };
    try { sessionStorage.setItem(LS_KEYS.session, JSON.stringify(serializable)); } catch {}
    try { localStorage.setItem(LS_KEYS.persistentSession, JSON.stringify(serializable)); } catch {}
  },

  restore() {
    try {
      const raw = sessionStorage.getItem(LS_KEYS.session) || localStorage.getItem(LS_KEYS.persistentSession);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      this.state = { ...this.state, ...parsed };
      return Boolean(parsed?.role);
    } catch {
      return false;
    }
  },

  async login(identifier = '', passcode = '') {
    const email = String(identifier || '').trim();
    const password = String(passcode || '').trim();
    if (!email) throw new Error('Username or email is required.');
    if (!password) throw new Error('Password is required.');

    const client = SupabaseClient.getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || 'Login failed.');

    const authUser = data?.user || null;
    const session = data?.session || null;
    const profile = await this.fetchProfile(authUser?.id);
    this.applyState(this.buildState(authUser, session, profile));
    this.ensureReactiveAuthState();
    return this.user();
  },

  async validateSession() {
    const client = SupabaseClient.getClient();
    const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }] = await Promise.all([
      client.auth.getSession(), client.auth.getUser()
    ]);
    if (sessionError) throw new Error(sessionError.message || 'Unable to restore session.');
    if (userError) throw new Error(userError.message || 'Unable to restore user.');
    const session = sessionData?.session || null;
    const authUser = userData?.user || null;
    if (!session || !authUser) return false;
    const profile = await this.fetchProfile(authUser.id);
    this.applyState(this.buildState(authUser, session, profile), { clearRoleCacheOnChange: false });
    this.ensureReactiveAuthState();
    return true;
  },

  logout({ preserveCache = true } = {}) {
    this.clearClientSession({ clearRoleCache: !preserveCache });
    SupabaseClient.getClient().auth.signOut().catch(error => console.warn('Supabase signOut failed', error));
  },

  clearClientSession({ clearRoleCache = true } = {}) {
    if (clearRoleCache && this.state.role) this.clearRoleScopedCache();
    this.state = { role: null, authToken: '', user_id: '', name: '', email: '', username: '', session: null, authUser: null, profile: null };
    try { sessionStorage.removeItem(LS_KEYS.session); } catch {}
    try { localStorage.removeItem(LS_KEYS.persistentSession); } catch {}
    this.notify();
  },

  ensureReactiveAuthState() {
    if (this.authSubscription) return;
    const client = SupabaseClient.getClient();
    const subscription = client.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        this.clearClientSession({ clearRoleCache: false });
        return;
      }
      try {
        const profile = await this.fetchProfile(session.user.id);
        this.applyState(this.buildState(session.user, session, profile), { clearRoleCacheOnChange: false });
      } catch (error) {
        console.warn('Auth state change profile fetch failed', error);
      }
    });
    this.authSubscription = subscription?.data?.subscription || null;
  },

  user() {
    return {
      role: this.state.role,
      authToken: this.state.authToken,
      user_id: this.state.user_id,
      name: this.state.name,
      email: this.state.email,
      username: this.state.username,
      authUser: this.state.authUser,
      profile: this.state.profile,
      session: this.state.session
    };
  },
  isAuthenticated() { return !!this.state.session && !!String(this.state.role || '').trim(); },
  role() { return this.state.role || null; },
  username() { return this.state.username || ''; },
  userId() { return this.state.user_id || ''; },
  displayName() { return this.state.name || this.state.username || this.state.email || ''; },
  getAuthToken() { return this.state.authToken || ''; },
  isAdmin() { return this.role() === ROLES.ADMIN; },
  authContext() { return { role: this.role(), authToken: this.getAuthToken(), session: this.state.session, user: this.state.authUser, profile: this.state.profile }; }
};

function isAuthError(error) {
  const message = String(error?.message || '').trim().toLowerCase();
  if (!message) return false;
  return [/\bunauthorized\b/, /\bforbidden\b/, /invalid\s+session/, /expired\s+session/, /not\s+authenticated/, /auth/i].some(pattern => pattern.test(message));
}
