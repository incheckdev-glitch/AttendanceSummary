const Session = {
  state: {
    role: null,
    user_id: '',
    name: '',
    email: '',
    username: '',
    session: null,
    user: null,
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

  buildState(user = null, session = null, profile = null) {
    const role = this.normalizeRole(profile?.role_key);
    return {
      role: role || null,
      user_id: String(profile?.id || user?.id || ''),
      name: String(profile?.full_name || profile?.name || user?.user_metadata?.full_name || '').trim(),
      email: String(profile?.email || user?.email || '').trim(),
      username: String(profile?.username || user?.user_metadata?.username || '').trim(),
      session: session || null,
      user: user || null,
      profile: profile || null
    };
  },

  applyState(nextState, { clearRoleCacheOnChange = true } = {}) {
    const prevRole = this.state.role;
    if (clearRoleCacheOnChange && prevRole && prevRole !== nextState.role) this.clearRoleScopedCache();
    this.state = nextState;
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
    console.info('[Session.fetchProfile] result', {
      userId: id,
      hasData: Boolean(data),
      error: error ? { message: error.message, code: error.code, status: error.status } : null
    });
    if (error) throw new Error(`Unable to load user profile: ${error.message}`);
    if (!data?.is_active) {
      await client.auth.signOut();
      this.clearClientSession({ clearRoleCache: false });
      throw new Error('Your account is inactive. Please contact an administrator.');
    }
    return data;
  },

  async login(identifier = '', passcode = '') {
    console.info('[Session.login] entered', {
      hasIdentifierInput: Boolean(String(identifier || '').trim()),
      hasPasscodeInput: Boolean(String(passcode || '').trim())
    });
    const email = String(identifier || '').trim().toLowerCase();
    const password = String(passcode || '').trim();
    console.info('[Session.login] sanitized credentials', {
      email,
      passwordPresent: Boolean(password)
    });
    if (!email) throw new Error('Email is required.');
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) throw new Error('Enter a valid email address.');
    if (!password) throw new Error('Password is required.');

    const client = SupabaseClient.getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    console.info('[Session.login] signInWithPassword result', {
      email,
      hasSession: Boolean(data?.session),
      hasUser: Boolean(data?.user),
      error: error ? { message: error.message, status: error.status } : null
    });
    if (error) throw new Error(error.message || 'Login failed.');

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw new Error(sessionError.message || 'Unable to load logged-in session.');

    const { data: userData, error: userError } = await client.auth.getUser();
    console.info('[Session.login] getUser result', {
      hasUser: Boolean(userData?.user),
      error: userError ? { message: userError.message, status: userError.status } : null
    });
    if (userError && !sessionData?.session?.user) {
      throw new Error(userError.message || 'Unable to load logged-in user.');
    }

    const authUser = userData?.user || data?.user || sessionData?.session?.user || null;
    const session = sessionData?.session || data?.session || null;
    if (!authUser?.id || !session) throw new Error('Login succeeded but no active session was found.');
    const profile = await this.fetchProfile(authUser?.id);
    this.applyState(this.buildState(authUser, session, profile));
    this.ensureReactiveAuthState();
    return this.user();
  },

  async restore() {
    console.info('[Session.restore] start');
    const client = SupabaseClient.getClient();
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      const session = sessionData?.session || null;
      console.info('[Session.restore] getSession result', {
        hasSession: Boolean(session),
        error: sessionError ? { message: sessionError.message, status: sessionError.status } : null
      });
      if (sessionError || !session) {
        this.clearClientSession({ clearRoleCache: false });
        console.info('[Session.restore] restored false');
        return false;
      }

      const { data: userData, error: userError } = await client.auth.getUser();
      const authUser = userData?.user || session?.user || null;
      console.info('[Session.restore] getUser result', {
        hasUser: Boolean(authUser),
        error: userError ? { message: userError.message, status: userError.status } : null
      });
      if (userError || !authUser?.id) {
        await client.auth.signOut();
        this.clearClientSession({ clearRoleCache: false });
        console.info('[Session.restore] restored false');
        return false;
      }

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id, name, email, username, role_key, is_active')
        .eq('id', authUser.id)
        .maybeSingle();
      console.info('[Session.restore] profile result', {
        hasProfile: Boolean(profile),
        isActive: profile?.is_active ?? null,
        error: profileError ? { message: profileError.message, code: profileError.code, status: profileError.status } : null
      });

      if (profileError || !profile || !profile.is_active) {
        await client.auth.signOut();
        this.clearClientSession({ clearRoleCache: false });
        console.info('[Session.restore] restored false');
        return false;
      }

      this.applyState(this.buildState(authUser, session, profile), { clearRoleCacheOnChange: false });
      console.info('[Session.restore] restored true');
      return true;
    } catch (error) {
      console.warn('[Session.restore] unexpected error', error);
      this.clearClientSession({ clearRoleCache: false });
      console.info('[Session.restore] restored false');
      return false;
    }
  },

  async validateSession() {
    // Temporary rollback for 9E startup validation:
    // Be harmless and do not clear/override state outside explicit login/logout flows.
    return this.isAuthenticated();
  },

  logout({ preserveCache = true } = {}) {
    this.clearClientSession({ clearRoleCache: !preserveCache });
    SupabaseClient.getClient().auth.signOut().catch(error => console.warn('Supabase signOut failed', error));
  },

  clearClientSession({ clearRoleCache = true } = {}) {
    if (clearRoleCache && this.state.role) this.clearRoleScopedCache();
    this.state = { role: null, user_id: '', name: '', email: '', username: '', session: null, user: null, profile: null };
    this.notify();
  },

  ensureReactiveAuthState() {
    // Temporary rollback for 9E reactive auth gate.
    // Disable auto re-lock/clear behavior until startup/login flow is stabilized.
    return;
  },

  user() {
    return {
      role: this.state.role,
      user_id: this.state.user_id,
      name: this.state.name,
      email: this.state.email,
      username: this.state.username,
      user: this.state.user,
      profile: this.state.profile,
      session: this.state.session
    };
  },
  isAuthenticated() {
    const hasSession = Boolean(this.state.session && (this.state.session?.user?.id || this.state.session?.access_token));
    const hasUser = Boolean(this.state.user?.id);
    const hasRole = Boolean(String(this.state.role || '').trim());
    const result = hasSession && hasUser && hasRole;
    console.info('[Session.isAuthenticated] result', {
      result,
      hasSession,
      hasUser,
      hasRole,
      userId: this.state.user?.id || this.state.session?.user?.id || null,
      role: this.state.role || null
    });
    return result;
  },
  role() { return this.state.role || null; },
  username() { return this.state.username || ''; },
  userId() { return this.state.user_id || ''; },
  displayName() { return this.state.name || this.state.username || this.state.email || ''; },
  isAdmin() { return this.role() === ROLES.ADMIN; },
  authContext() { return { role: this.role(), session: this.state.session, user: this.state.user, profile: this.state.profile }; }
};

function isAuthError(error) {
  const message = String(error?.message || '').trim().toLowerCase();
  if (!message) return false;
  return [/\bunauthorized\b/, /\bforbidden\b/, /invalid\s+session/, /expired\s+session/, /not\s+authenticated/, /auth/i].some(pattern => pattern.test(message));
}
