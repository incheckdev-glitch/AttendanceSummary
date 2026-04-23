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

  getLastKnownRoleStorageKey() {
    return LS_KEYS?.lastKnownRole || 'incheckLastKnownRole';
  },

  clearRoleScopedCache() {
    const roleScopedKeys = [
      LS_KEYS.issues,
      LS_KEYS.issuesLastUpdated,
      LS_KEYS.events,
      LS_KEYS.eventsLastUpdated,
      LS_KEYS.csmActivity,
      LS_KEYS.dataVersion
    ];
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
    const candidateState = nextState && typeof nextState === 'object'
      ? {
          role: this.normalizeRole(nextState.role) || null,
          user_id: String(nextState.user_id || '').trim(),
          name: String(nextState.name || '').trim(),
          email: String(nextState.email || '').trim(),
          username: String(nextState.username || '').trim(),
          session: nextState.session || null,
          user: nextState.user || null,
          profile: nextState.profile || null
        }
      : this.buildState(null, null, null);
    const hasSession = Boolean(candidateState.session && (candidateState.session?.user?.id || candidateState.session?.access_token));
    const hasUser = Boolean(candidateState.user?.id);
    const hasRole = Boolean(String(candidateState.role || '').trim());
    const isCompleteAuthenticatedState = hasSession && hasUser && hasRole;
    const normalizedState = isCompleteAuthenticatedState
      ? candidateState
      : this.buildState(null, null, null);

    const prevRole = this.state.role;
    if (clearRoleCacheOnChange && prevRole && prevRole !== normalizedState.role) this.clearRoleScopedCache();
    this.state = normalizedState;

    const currentRole = this.normalizeRole(normalizedState?.role);
    if (currentRole) {
      try { localStorage.setItem(this.getLastKnownRoleStorageKey(), currentRole); } catch {}
    }

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

  async restoreOrRepairProfile(authUser = null) {
    const client = SupabaseClient.getClient();
    const authUserId = String(authUser?.id || '').trim();
    const authEmail = String(authUser?.email || '').trim().toLowerCase();
    if (!authUserId) throw new Error('Authenticated user id is missing.');

    const { data: directProfile, error: directError } = await client
      .from('profiles')
      .select('id, name, email, username, role_key, is_active')
      .eq('id', authUserId)
      .maybeSingle();
    if (directError) throw new Error(`Unable to load user profile: ${directError.message}`);
    if (directProfile?.role_key) return directProfile;

    if (!authEmail) return directProfile || null;
    const { data: legacyProfile, error: legacyError } = await client
      .from('profiles')
      .select('id, name, email, username, role_key, is_active')
      .eq('email', authEmail)
      .maybeSingle();
    if (legacyError) throw new Error(`Unable to load legacy profile by email: ${legacyError.message}`);
    if (!legacyProfile?.role_key) return directProfile || legacyProfile || null;

    const repairedProfilePayload = {
      id: authUserId,
      name: String(legacyProfile.name || authUser?.user_metadata?.full_name || '').trim(),
      email: authEmail,
      username: String(legacyProfile.username || authUser?.user_metadata?.username || authEmail.split('@')[0] || '').trim(),
      role_key: String(legacyProfile.role_key || '').trim().toLowerCase(),
      is_active: legacyProfile.is_active !== false
    };
    const { data: repairedProfile, error: repairError } = await client
      .from('profiles')
      .upsert(repairedProfilePayload, { onConflict: 'id' })
      .select('id, name, email, username, role_key, is_active')
      .single();
    if (repairError) throw new Error(`Unable to repair user profile mapping: ${repairError.message}`);
    return repairedProfile;
  },

  async login(identifier = '', passcode = '') {
    this.purgeLegacyStorage();
    const email = String(identifier || '').trim().toLowerCase();
    const password = String(passcode || '').trim();
    if (!email) throw new Error('Email is required.');
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) throw new Error('Enter a valid email address.');
    if (!password) throw new Error('Password is required.');

    const client = SupabaseClient.getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || 'Login failed.');

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw new Error(sessionError.message || 'Unable to load logged-in session.');

    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError && !sessionData?.session?.user) {
      throw new Error(userError.message || 'Unable to load logged-in user.');
    }

    const authUser = userData?.user || data?.user || sessionData?.session?.user || null;
    const session = sessionData?.session || data?.session || null;
    if (!authUser?.id || !session) throw new Error('Login succeeded but no active session was found.');
    const profile = await this.restoreOrRepairProfile(authUser);
    if (!profile?.role_key) throw new Error('Login succeeded but no active role_key profile was found.');
    if (!profile?.is_active) {
      await client.auth.signOut();
      this.clearClientSession({ clearRoleCache: false });
      throw new Error('Your account is inactive. Please contact an administrator.');
    }
    this.applyState(this.buildState(authUser, session, profile));
    this.ensureReactiveAuthState();
    return this.user();
  },

  async restore() {
    const client = SupabaseClient.getClient();
    this.purgeLegacyStorage();
    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      const session = sessionData?.session || null;
      if (sessionError || !session) {
        this.clearClientSession({ clearRoleCache: false });
        return false;
      }

      const { data: userData, error: userError } = await client.auth.getUser();
      const authUser = userData?.user || session?.user || null;
      if (userError || !authUser?.id) {
        await client.auth.signOut();
        this.clearClientSession({ clearRoleCache: false });
        return false;
      }

      const profile = await this.restoreOrRepairProfile(authUser);
      if (!profile || !profile.is_active || !String(profile.role_key || '').trim()) {
        await client.auth.signOut();
        this.clearClientSession({ clearRoleCache: false });
        return false;
      }

      this.applyState(this.buildState(authUser, session, profile), { clearRoleCacheOnChange: false });
      return true;
    } catch (error) {
      console.warn('[Session.restore] unexpected error', error);
      this.clearClientSession({ clearRoleCache: false });
      return false;
    }
  },

  async validateSession() {
    return this.isAuthenticated();
  },

  logout({ preserveCache = false } = {}) {
    this.clearClientSession({ clearRoleCache: !preserveCache });
    SupabaseClient.getClient().auth.signOut().catch(error => console.warn('Supabase signOut failed', error));
  },

  clearClientSession({ clearRoleCache = true } = {}) {
    if (clearRoleCache && this.state.role) this.clearRoleScopedCache();
    this.purgeLegacyStorage();
    this.state = { role: null, user_id: '', name: '', email: '', username: '', session: null, user: null, profile: null };
    this.notify();
  },

  purgeLegacyStorage() {
    try { localStorage.removeItem(this.getLastKnownRoleStorageKey()); } catch {}
    try { localStorage.removeItem('incheckLegacyAuthSession'); } catch {}
    try { localStorage.removeItem('authToken'); } catch {}
    try { localStorage.removeItem('backendToken'); } catch {}
    try { localStorage.removeItem('backendUrl'); } catch {}
    try { sessionStorage.removeItem('incheckLegacyBootstrapCredentials'); } catch {}
  },

  ensureReactiveAuthState() {
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
    return hasSession && hasUser && hasRole;
  },
  role() { return this.state.role || null; },
  username() { return this.state.username || ''; },
  userId() { return this.state.user_id || ''; },
  displayName() { return this.state.name || this.state.username || this.state.email || ''; },
  isAdmin() { return this.role() === ROLES.ADMIN; },
  authContext() { return { role: this.role(), session: this.state.session, user: this.state.user, profile: this.state.profile }; }
};

function isAuthError(error) {
  const message = String(error?.message || error || '').trim().toLowerCase();
  if (!message) return false;
  return (
    message.includes('unauthorized') ||
    message.includes('invalid session') ||
    message.includes('expired session') ||
    message.includes('not authenticated') ||
    message.includes('missing token') ||
    message.includes('missing session')
  );
}

function isPermissionError(error) {
  const message = String(error?.message || error || '').trim().toLowerCase();
  if (!message) return false;
  return (
    message.includes('forbidden') ||
    message.includes('not permitted') ||
    message.includes('cannot list') ||
    message.includes('cannot get') ||
    message.includes('cannot create') ||
    message.includes('cannot save') ||
    message.includes('cannot update') ||
    message.includes('cannot delete') ||
    message.includes('cannot get_unread_count') ||
    message.includes('cannot mark_read') ||
    message.includes('cannot mark_all_read')
  );
}

window.Session = Session;
window.isAuthError = isAuthError;
window.isPermissionError = isPermissionError;
