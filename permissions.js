const Permissions = {
  isAdmin() {
    return Session.role() === ROLES.ADMIN;
  },
  canCreateTicket() {
    return Session.isAuthenticated();
  },
  canEditTicket() {
    return this.isAdmin();
  },
  canManageEvents() {
    return this.isAdmin();
  },
  canChangePlanner() {
    return this.isAdmin();
  },
  canManageFreezeWindows() {
    return this.isAdmin();
  },
  canUseInternalIssueFilters() {
    return this.isAdmin();
  }
};

function requirePermission(check, message) {
  if (check()) return true;
  UI.toast(message || 'You do not have permission for this action.');
  return false;
}

async function handleExpiredSession(message = 'Session expired. Please log in again.') {
  Session.clearClientSession();
  UI.applyRolePermissions();
  try {
    const loginPasscodeEl = document.getElementById('loginPasscode');
    const loginRoleEl = document.getElementById('loginRole');
    if (loginPasscodeEl) loginPasscodeEl.value = '';
    if (loginRoleEl) loginRoleEl.value = ROLES.VIEWER;
    const loginSection = document.getElementById('loginSection');
    if (loginSection) window.location.hash = '#loginSection';
    document.body.classList.add('auth-locked');
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.classList.add('is-locked');
      appEl.setAttribute('aria-hidden', 'true');
    }
  } catch {}
  UI.toast(message);
}
