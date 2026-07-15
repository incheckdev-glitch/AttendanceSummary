const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const sessionSource = fs.readFileSync('session.js', 'utf8');
const permissionsSource = fs.readFileSync('permissions.js', 'utf8');
const appSource = fs.readFileSync('app.js', 'utf8');

assert.doesNotMatch(sessionSource, /ensureReactiveAuthState\(\)\s*\{\s*return;\s*\}/, 'reactive auth listener must not remain a no-op');
assert.match(sessionSource, /onAuthStateChange\(\(event, session\) =>/, 'Session must subscribe to Supabase auth changes');
assert.match(sessionSource, /TOKEN_REFRESHED[\s\S]*USER_UPDATED/, 'Session must revalidate refreshed and updated users');
assert.match(sessionSource, /profile_focus[\s\S]*profile_interval/, 'Session must revalidate profile changes while the app remains open');
assert.match(sessionSource, /Your account is inactive or has no active role/, 'inactive or role-less users must be failed closed');

assert.match(permissionsSource, /loadedRole:\s*null/, 'permission state must remember which role owns the loaded matrix');
assert.match(permissionsSource, /requestId:\s*0/, 'permission loads must use a request generation token');
assert.match(permissionsSource, /discarded stale matrix response/, 'stale role responses must be discarded');
assert.match(permissionsSource, /this\.normalizeRole\(this\.state\.loadedRole\) === currentRole/, 'permission readiness must be role-scoped');

assert.match(appSource, /wasAlreadyUnlocked[\s\S]*if \(!wasAlreadyUnlocked\)/, 'token refresh must preserve the active module when the app is already unlocked');
assert.match(appSource, /permission matrix refresh failed; locking app/, 'the UI must fail closed when runtime permissions cannot be verified');
assert.match(appSource, /let authUiSyncRequestId = 0[\s\S]*requestId !== authUiSyncRequestId/, 'auth UI refreshes must discard stale queued requests');

function createStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

(async () => {
  let authCallback = null;
  let authSubscriptions = 0;
  let signOutCalls = 0;
  let permissionResets = 0;
  let profile = { id: 'user-1', name: 'Test User', email: 'test@example.com', username: 'test', role_key: 'csm', is_active: true };
  const authUser = { id: 'user-1', email: 'test@example.com', user_metadata: {} };
  const activeSession = { access_token: 'token-1', user: authUser };

  const client = {
    auth: {
      onAuthStateChange(callback) {
        authSubscriptions += 1;
        authCallback = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async getSession() { return { data: { session: activeSession }, error: null }; },
      async getUser() { return { data: { user: authUser }, error: null }; },
      async signOut() { signOutCalls += 1; return { error: null }; }
    },
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async single() { return { data: { ...profile }, error: null }; },
        async maybeSingle() { return { data: { ...profile }, error: null }; },
        upsert() { return this; }
      };
    }
  };

  const windowObject = {
    addEventListener() {},
    setInterval() { return 1; },
    Permissions: { reset() { permissionResets += 1; } },
    UI: { toast() {} },
    Api: { clearApiCache() {} }
  };
  const context = {
    console,
    Promise,
    Date,
    setTimeout,
    clearTimeout,
    window: windowObject,
    document: { visibilityState: 'visible', addEventListener() {} },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    LS_KEYS: { lastKnownRole: 'last-role', issues: 'issues', issuesLastUpdated: 'issues-updated', events: 'events', eventsLastUpdated: 'events-updated', csmActivity: 'csm', dataVersion: 'version' },
    ROLES: { ADMIN: 'admin' },
    SupabaseClient: { getClient: () => client }
  };
  windowObject.window = windowObject;
  vm.createContext(context);
  vm.runInContext(sessionSource, context);
  const Session = windowObject.Session;

  Session.ensureReactiveAuthState();
  Session.ensureReactiveAuthState();
  assert.strictEqual(authSubscriptions, 1, 'reactive auth listener must be attached only once');

  Session.applyState(Session.buildState(authUser, activeSession, profile), { reason: 'test' });
  assert.strictEqual(Session.role(), 'csm');

  profile = { ...profile, role_key: 'viewer' };
  authCallback('TOKEN_REFRESHED', { ...activeSession, access_token: 'token-2' });
  await Promise.resolve();
  await Session.reactiveAuthSync;
  assert.strictEqual(Session.role(), 'viewer', 'token refresh must reload a changed profile role');
  assert.strictEqual(Session.state.session.access_token, 'token-2', 'token refresh must store the refreshed session');

  profile = { ...profile, is_active: false };
  const active = await Session.revalidateProfile({ reason: 'test_inactive', force: true });
  assert.strictEqual(active, false, 'inactive profile revalidation must fail');
  assert.strictEqual(Session.isAuthenticated(), false, 'inactive users must be signed out locally');
  assert(signOutCalls >= 1, 'inactive users must be signed out from Supabase');
  assert(permissionResets >= 1, 'inactive/sign-out handling must clear the permission matrix');

  let currentRole = 'csm';
  const permissionResponses = [];
  const permissionWindow = {
    SupabaseClient: {
      getClient: () => ({
        rpc: () => new Promise(resolve => permissionResponses.push(resolve))
      })
    },
    AdminOverride: { canOverride: () => false },
    location: { hash: '' }
  };
  const permissionContext = {
    console,
    window: permissionWindow,
    document: {
      getElementById() { return null; },
      querySelectorAll() { return []; },
      body: { classList: { add() {}, remove() {} } }
    },
    Session: {
      isAuthenticated: () => true,
      role: () => currentRole,
      authContext: () => ({}),
      clearClientSession() {}
    },
    ROLES: { ADMIN: 'admin', DEV: 'dev', HOO: 'hoo', VIEWER: 'viewer' },
    UI: { toast() {}, applyRolePermissions() {} }
  };
  vm.createContext(permissionContext);
  vm.runInContext(permissionsSource, permissionContext);
  const Permissions = permissionWindow.Permissions;

  const oldRoleLoad = Permissions.loadMatrix(true);
  currentRole = 'viewer';
  const currentRoleLoad = Permissions.loadMatrix(true);
  permissionResponses[1]({
    data: [{ role_key: 'viewer', resource: 'events', action: 'list', is_allowed: true, is_active: true }],
    error: null
  });
  await currentRoleLoad;
  permissionResponses[0]({
    data: [{ role_key: 'csm', resource: 'csm', action: 'list', is_allowed: true, is_active: true }],
    error: null
  });
  await oldRoleLoad;

  assert.strictEqual(Permissions.state.loadedRole, 'viewer', 'stale permission responses must not replace the current role matrix');
  assert.strictEqual(Permissions.state.rows.length, 1);
  assert.strictEqual(Permissions.state.rows[0].role_key, 'viewer');
  assert.strictEqual(Permissions.isReady(), true, 'permission readiness must match the active role');

  console.log('Phase 3 reactive authentication and permission safety checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
