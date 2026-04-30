(function initNotificationService(global) {
  function normalizeList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return [];
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return normalizeList(parsed);
      } catch {}
      return text.split(',').map(item => item.trim()).filter(Boolean);
    }
    return [];
  }

  function normalizeRoleList(value) {
    return normalizeList(value)
      .map(item => item.toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean);
  }

  function getRuleAssignedRoles(rule = {}) {
    return normalizeRoleList(
      rule.assigned_roles ?? rule.assignedRoles ?? rule.target_roles ?? rule.targetRoles ??
      rule.recipient_roles ?? rule.recipientRoles ?? rule.allowed_roles ?? rule.allowedRoles ?? rule.roles
    );
  }

  function isRuleEnabled(rule = {}) {
    if (!rule) return true;
    const enabledValue = rule.is_enabled ?? rule.isEnabled ?? rule.enabled ?? rule.active;
    if (enabledValue === false) return false;
    if (String(enabledValue).trim().toLowerCase() === 'false') return false;
    if (String(enabledValue).trim() === '0') return false;
    return true;
  }

  function isChannelEnabled(rule = {}, channel = 'push') {
    if (!rule) return true;
    const ch = String(channel || '').toLowerCase();
    const value = ch === 'push'
      ? (rule.push_enabled ?? rule.pushEnabled ?? rule.pwa_enabled ?? rule.pwaEnabled ?? rule.web_push_enabled ?? rule.webPushEnabled ?? rule.pwa_push_enabled ?? rule.pwaPushEnabled)
      : ch === 'email'
        ? (rule.email_enabled ?? rule.emailEnabled)
        : ch === 'in_app'
          ? (rule.in_app_enabled ?? rule.inAppEnabled)
          : undefined;
    if (value === undefined || value === null || value === '') return true;
    if (value === false) return false;
    if (String(value).trim().toLowerCase() === 'false') return false;
    if (String(value).trim() === '0') return false;
    return true;
  }

  function skipNotification({ resource, action, eventKey, channel = 'push', reason }) {
    console.info('[notifications] skipped', { resource, action, eventKey, channel, reason });
    return { attempted: false, skipped: true, reason };
  }

  async function listNotificationRules() {
    const response = await global.Api.listNotificationSettings();
    return Array.isArray(response?.rows) ? response.rows : (Array.isArray(response) ? response : []);
  }

  function ruleMatches(rule = {}, { resource = '', action = '', eventKey = '' }) {
    const keys = normalizeList(rule.event_key ?? rule.eventKey ?? rule.notification_key ?? rule.notificationKey ?? rule.template_key ?? rule.templateKey ?? rule.key)
      .map(item => item.toLowerCase());
    const ruleResource = String(rule.resource || '').trim().toLowerCase();
    const ruleAction = String(rule.action || '').trim().toLowerCase();
    const normalizedResource = String(resource || '').trim().toLowerCase();
    const normalizedAction = String(action || '').trim().toLowerCase();
    const normalizedEventKey = String(eventKey || '').trim().toLowerCase();
    if (ruleResource && ruleAction && ruleResource === normalizedResource && ruleAction === normalizedAction) return true;
    return !!(normalizedEventKey && keys.includes(normalizedEventKey));
  }

  async function resolveUsersForRoles(assignedRoles = []) {
    if (!assignedRoles.length) return [];
    try {
      const usersResponse = await global.Api.requestWithSession('users', 'list', {}, { requireAuth: true });
      const rows = Array.isArray(usersResponse?.rows) ? usersResponse.rows : (Array.isArray(usersResponse) ? usersResponse : []);
      const roleSet = new Set(assignedRoles);
      return rows
        .filter(row => {
          const userRoles = normalizeRoleList([
            row.role, row.role_key, row.roleKey, row.user_role, row.userRole, row.app_role, row.appRole,
            ...(Array.isArray(row.roles) ? row.roles : [])
          ]);
          return userRoles.some(role => roleSet.has(role));
        })
        .map(row => String(row.id || row.user_id || row.userId || '').trim())
        .filter(Boolean);
    } catch (error) {
      console.warn('[notifications] unable to resolve users for roles', error);
      return [];
    }
  }

  const NotificationService = {
    async sendBusinessNotification({ resource = '', action = '', eventKey = '', recordId = '', recordNumber = '', title = '', body = '', targetUsers = [], targetEmails = [], url = '', metadata = {}, channels = ['in_app', 'push'], roles = ['admin'] } = {}) {
      const normalizedResource = String(resource || '').trim();
      const normalizedAction = String(action || '').trim();
      const normalizedEventKey = String(eventKey || `${normalizedResource}.${normalizedAction}`).trim();
      if (!normalizedResource || !normalizedAction) return { attempted: false, skipped: true, reason: 'missing-resource-action' };

      const rules = await listNotificationRules();
      const rule = rules.find(item => ruleMatches(item, { resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey })) || null;

      if (rule && !isRuleEnabled(rule)) return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'notification_rule_disabled' });
      if (rule && !isChannelEnabled(rule, 'push')) return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'notification_channel_disabled' });

      const directUsers = normalizeList(targetUsers);
      const directEmails = normalizeList(targetEmails).map(item => item.toLowerCase());
      const directTargets = directUsers.length > 0 || directEmails.length > 0;
      const assignedRoles = rule ? getRuleAssignedRoles(rule) : normalizeRoleList(roles);

      if (rule && assignedRoles.length === 0 && !directTargets) {
        return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'notification_rule_has_no_assigned_roles' });
      }

      const assignedUsers = normalizeList(rule?.assigned_users ?? rule?.assignedUsers ?? rule?.target_users ?? rule?.targetUsers ?? rule?.recipient_users ?? rule?.recipientUsers ?? rule?.recipient_user_ids ?? rule?.recipientUserIds);
      const assignedEmails = normalizeList(rule?.assigned_emails ?? rule?.assignedEmails ?? rule?.target_emails ?? rule?.targetEmails ?? rule?.recipient_emails ?? rule?.recipientEmails).map(item => item.toLowerCase());
      const roleUserIds = await resolveUsersForRoles(assignedRoles);

      const userIds = [...new Set([...directUsers, ...assignedUsers, ...roleUserIds])];
      const emails = [...new Set([...directEmails, ...assignedEmails])];
      if (!userIds.length && !emails.length) {
        return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'no_notification_recipients_resolved' });
      }

      const normalizedRecordId = String(recordId || '').trim();
      const finalUrl = String(url || '').trim() || (normalizedRecordId ? `/#${encodeURIComponent(normalizedResource)}?id=${encodeURIComponent(normalizedRecordId)}` : `/#${encodeURIComponent(normalizedResource)}`);
      const payload = { title: title || 'InCheck360 notification', body: body || 'A record was updated.', resource: normalizedResource, action: normalizedAction, event_key: normalizedEventKey, record_id: normalizedRecordId || undefined, record_number: String(recordNumber || '').trim() || undefined, url: finalUrl, tag: `${normalizedResource}-${normalizedAction}-${normalizedRecordId || 'record'}-${Date.now()}`, data: { resource: normalizedResource, action: normalizedAction, event_key: normalizedEventKey, record_id: normalizedRecordId || undefined, record_number: String(recordNumber || '').trim() || undefined, url: finalUrl, ...(metadata && typeof metadata === 'object' ? metadata : {}) }, channels: Array.isArray(channels) ? channels : ['in_app', 'push'], user_ids: userIds, emails };
      try { return await global.Api.sendWebPush(payload, { context: `${normalizedResource}:${normalizedAction}:central` }); }
      catch (error) {
        console.warn('[notifications] sendBusinessNotification failed (non-blocking)', error);
        return { attempted: true, sent: false, error: String(error?.message || error) };
      }
    }
  };

  global.NotificationService = NotificationService;
})(window);
