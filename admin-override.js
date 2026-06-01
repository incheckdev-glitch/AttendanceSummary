(function attachAdminOverride(global) {
  'use strict';

  const ADMIN_OVERRIDE_ROLES = new Set(['admin']);

  function normalizeRole(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getSessionUser() {
    try {
      if (global.Session && typeof global.Session.user === 'function') return global.Session.user() || {};
    } catch (_) {}
    return {};
  }

  function getCurrentRole() {
    const sessionUser = getSessionUser();
    const sessionState = global.Session?.state || {};
    const authContext = typeof global.Session?.authContext === 'function' ? global.Session.authContext() : {};
    const profile = sessionState.profile || sessionUser.profile || authContext.profile || {};
    return normalizeRole(
      (typeof global.Session?.role === 'function' ? global.Session.role() : '') ||
      sessionState.role ||
      sessionUser.role ||
      sessionUser.role_key ||
      sessionUser.roleKey ||
      profile.role_key ||
      profile.roleKey ||
      profile.role ||
      ''
    );
  }

  function isAdminOverrideUser() {
    return ADMIN_OVERRIDE_ROLES.has(getCurrentRole());
  }

  function getCurrentUserInfo() {
    const sessionUser = getSessionUser();
    const sessionState = global.Session?.state || {};
    const authContext = typeof global.Session?.authContext === 'function' ? global.Session.authContext() : {};
    const authUser = authContext.user || sessionState.user || sessionUser.user || {};
    const profile = sessionState.profile || sessionUser.profile || authContext.profile || {};
    return {
      user_id: String(sessionState.user_id || sessionUser.user_id || profile.id || authUser.id || '').trim(),
      user_email: String(sessionState.email || sessionUser.email || profile.email || authUser.email || '').trim(),
      user_role: getCurrentRole(),
      user_name: String(sessionState.name || sessionUser.name || profile.name || profile.full_name || '').trim()
    };
  }

  function canOverride() {
    return isAdminOverrideUser();
  }

  function shouldBypassWorkflow() {
    return canOverride();
  }

  function shouldBypassLocks() {
    return canOverride();
  }

  function shouldBypassValidation() {
    return canOverride();
  }

  function applyBanner(container, { active = true, message = '' } = {}) {
    if (!container || !active || !canOverride()) return;
    let banner = container.querySelector('[data-admin-override-banner]');
    if (!banner) {
      banner = document.createElement('div');
      banner.setAttribute('data-admin-override-banner', 'true');
      banner.className = 'admin-override-banner';
      banner.style.cssText = 'margin:0 0 12px 0;padding:10px 12px;border-radius:12px;border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.10);color:#92400e;font-size:13px;font-weight:600;';
      container.prepend(banner);
    }
    banner.textContent = message || 'Admin Override Mode: you can edit normally locked or restricted records. Changes should be used carefully.';
    banner.style.display = '';
  }

  function collectOldValues(resource, record) {
    if (!record || typeof record !== 'object') return null;
    const safe = { ...record };
    delete safe._raw;
    delete safe.items;
    return safe;
  }

  async function logOverride({ resource, recordId, action = 'override', oldValues = null, newValues = null, reason = '' } = {}) {
    if (!canOverride()) return;
    const client = global.SupabaseClient?.getClient?.();
    if (!client?.from) return;
    const user = getCurrentUserInfo();
    const payload = {
      user_id: user.user_id || null,
      user_email: user.user_email || null,
      user_role: user.user_role || null,
      resource: String(resource || 'unknown').trim() || 'unknown',
      record_id: String(recordId || '').trim() || null,
      action: String(action || 'override').trim() || 'override',
      old_values: oldValues && typeof oldValues === 'object' ? oldValues : null,
      new_values: newValues && typeof newValues === 'object' ? newValues : null,
      reason: String(reason || 'Admin override').trim() || 'Admin override'
    };
    try {
      await client.from('admin_override_audit_log').insert(payload);
    } catch (error) {
      console.warn('[AdminOverride] audit log insert failed', error?.message || error);
    }
  }

  global.AdminOverride = {
    normalizeRole,
    getCurrentRole,
    isAdminOverrideUser,
    canOverride,
    shouldBypassWorkflow,
    shouldBypassLocks,
    shouldBypassValidation,
    getCurrentUserInfo,
    collectOldValues,
    applyBanner,
    logOverride
  };
})(window);
