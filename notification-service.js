(function initNotificationService(global) {
  const KNOWN_NOTIFICATION_ACTIONS = {
    tickets: ['ticket_created','ticket_high_priority','ticket_status_changed','dev_team_status_changed','ticket_dev_team_status_changed','ticket_under_development','ticket_youtrack_changed','ticket_issue_related_changed'],
    leads: ['lead_created','lead_updated','lead_converted_to_deal'],
    deals: ['deal_created','deal_updated','deal_created_from_lead','deal_important_stage'],
    proposals: ['proposal_created','proposal_updated','proposal_requires_approval','proposal_approved','proposal_rejected','proposal_created_from_deal'],
    agreements: ['agreement_created','agreement_created_from_proposal','agreement_requires_signature','agreement_signed'],
    invoices: ['invoice_created','invoice_created_from_agreement','invoice_payment_state_changed','invoice_fully_paid'],
    receipts: ['receipt_created','receipt_created_from_invoice','receipt_updated'],
    operations_onboarding: ['onboarding_created','operations_onboarding_created','onboarding_status_changed','onboarding_request_submitted'],
    technical_admin_requests: ['technical_request_submitted','technical_request_status_changed'],
    events: ['event_created','event_updated','event_status_changed','event_schedule_changed','event_deleted'],
    workflow: ['workflow_approval_requested','workflow_approved','workflow_rejected']
  };

  const ACTION_ALIASES = {
    tickets: {
      dev_team_status_changed: ['dev_team_status_changed', 'ticket_dev_team_status_changed', 'tickets.dev_team_status_changed', 'tickets.ticket_dev_team_status_changed'],
      ticket_dev_team_status_changed: ['dev_team_status_changed', 'ticket_dev_team_status_changed', 'tickets.dev_team_status_changed', 'tickets.ticket_dev_team_status_changed']
    }
  };

  function normalizeText(value = '') {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeAction(value = '') {
    return normalizeText(value).replace(/\s+/g, '_');
  }

  function normalizeList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(item => normalizeList(item)).filter(Boolean);
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return [];
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return normalizeList(parsed);
      } catch {}
      return text.split(',').map(item => item.trim()).filter(Boolean);
    }
    return [String(value || '').trim()].filter(Boolean);
  }

  function normalizeRoleList(value) {
    return normalizeList(value)
      .map(item => item.toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean);
  }

  function isPlaceholderRecipientToken(value = '') {
    const normalized = normalizeText(value);
    return !normalized || normalized === 'optional: user@company.com' || normalized === 'user@company.com';
  }

  function getRuleAssignedRoles(rule = {}) {
    return normalizeRoleList(
      rule.assigned_roles ?? rule.assignedRoles ?? rule.target_roles ?? rule.targetRoles ??
      rule.recipient_roles ?? rule.recipientRoles ?? rule.allowed_roles ?? rule.allowedRoles ?? rule.roles
    );
  }

  function getRuleAssignedUsers(rule = {}) {
    return normalizeList(
      rule.assigned_users ?? rule.assignedUsers ?? rule.target_users ?? rule.targetUsers ??
      rule.recipient_users ?? rule.recipientUsers ?? rule.recipient_user_ids ?? rule.recipientUserIds
    );
  }

  function getRuleAssignedEmails(rule = {}) {
    return normalizeList(
      rule.assigned_emails ?? rule.assignedEmails ?? rule.target_emails ?? rule.targetEmails ??
      rule.recipient_emails ?? rule.recipientEmails
    )
      .map(item => item.toLowerCase())
      .filter(item => !isPlaceholderRecipientToken(item));
  }

  function getRuleUsersFromRecord(rule = {}) {
    return normalizeList(rule.users_from_record ?? rule.usersFromRecord ?? rule.dynamic_recipients ?? rule.dynamicRecipients);
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
          ? (rule.in_app_enabled ?? rule.inAppEnabled ?? rule.bell_enabled ?? rule.bellEnabled ?? rule.notification_hub_enabled ?? rule.notificationHubEnabled)
          : undefined;
    if (value === undefined || value === null || value === '') return true;
    if (value === false) return false;
    if (String(value).trim().toLowerCase() === 'false') return false;
    if (String(value).trim() === '0') return false;
    return true;
  }

  function getActionAliases(resource = '', action = '') {
    const normalizedResource = normalizeAction(resource);
    const normalizedAction = normalizeAction(action);
    const aliases = ACTION_ALIASES?.[normalizedResource]?.[normalizedAction] || [normalizedAction, `${normalizedResource}.${normalizedAction}`];
    return [...new Set(aliases.map(normalizeAction).filter(Boolean))];
  }

  function isKnownNotificationAction(resource = '', action = '') {
    const normalizedResource = normalizeAction(resource);
    const aliases = getActionAliases(resource, action);
    const configured = KNOWN_NOTIFICATION_ACTIONS[normalizedResource] || [];
    return configured.some(item => aliases.includes(normalizeAction(item)) || aliases.includes(normalizeAction(`${normalizedResource}.${item}`)));
  }

  function skipNotification({ resource, action, eventKey, channel = 'all', reason }) {
    console.info('[notifications] skipped', { resource, action, eventKey, channel, reason });
    return { attempted: false, skipped: true, reason };
  }

  async function listNotificationRules() {
    const response = await global.Api.listNotificationSettings();
    return Array.isArray(response?.rows) ? response.rows : (Array.isArray(response) ? response : []);
  }

  function ruleMatches(rule = {}, { resource = '', action = '', eventKey = '' }) {
    const normalizedResource = normalizeAction(resource);
    const normalizedAction = normalizeAction(action);
    const aliases = new Set([...getActionAliases(resource, action), normalizeAction(eventKey)]);
    const ruleResource = normalizeAction(rule.resource || '');
    const ruleAction = normalizeAction(rule.action || '');
    const ruleKeys = normalizeList(rule.event_key ?? rule.eventKey ?? rule.notification_key ?? rule.notificationKey ?? rule.template_key ?? rule.templateKey ?? rule.key)
      .map(normalizeAction);
    if (ruleResource && ruleResource !== normalizedResource) return false;
    if (ruleAction && aliases.has(ruleAction)) return true;
    return ruleKeys.some(key => aliases.has(key));
  }

  function resolveDynamicRecipientEmails(rule = {}, metadata = {}) {
    const record = metadata && typeof metadata === 'object' ? metadata : {};
    const emails = [];
    getRuleUsersFromRecord(rule).forEach(key => {
      const normalizedKey = normalizeAction(key);
      const candidates = normalizedKey === 'requester_email'
        ? [record.requester_email, record.email_addressee, record.emailAddressee, record.requesterEmail]
        : normalizedKey === 'owner_email'
          ? [record.owner_email, record.ownerEmail, record.assigned_user_email, record.assignedUserEmail]
          : [record[key], record[normalizedKey]];
      const email = candidates.map(value => String(value || '').trim().toLowerCase()).find(Boolean) || '';
      if (email && !isPlaceholderRecipientToken(email)) emails.push(email);
    });
    return [...new Set(emails)];
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

      let rules = [];
      try { rules = await listNotificationRules(); }
      catch (error) {
        console.warn('[notifications] unable to load notification rules', { resource: normalizedResource, action: normalizedAction, error });
      }
      const rule = rules.find(item => ruleMatches(item, { resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey })) || null;

      if (!rule && isKnownNotificationAction(normalizedResource, normalizedAction)) {
        return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'notification_rule_missing' });
      }
      if (rule && !isRuleEnabled(rule)) return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'notification_rule_disabled' });

      const requestedChannels = Array.isArray(channels) ? channels : ['in_app', 'push'];
      const allowedChannels = requestedChannels
        .map(channel => String(channel || '').trim().toLowerCase())
        .filter(Boolean)
        .filter(channel => isChannelEnabled(rule, channel));
      if (!allowedChannels.length) return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'notification_channels_disabled' });

      const directUsers = normalizeList(targetUsers);
      const directEmails = normalizeList(targetEmails).map(item => item.toLowerCase()).filter(item => !isPlaceholderRecipientToken(item));
      const assignedRoles = rule ? getRuleAssignedRoles(rule) : normalizeRoleList(roles);
      const assignedUsers = rule ? getRuleAssignedUsers(rule) : [];
      const assignedEmails = rule ? getRuleAssignedEmails(rule) : [];
      const dynamicEmails = rule ? resolveDynamicRecipientEmails(rule, metadata) : [];
      const directTargets = directUsers.length > 0 || directEmails.length > 0;
      const hasConfiguredRecipients = Boolean(assignedRoles.length || assignedUsers.length || assignedEmails.length || dynamicEmails.length || directTargets);

      if (rule && !hasConfiguredRecipients) {
        return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'no_recipients_configured' });
      }

      const roleUserIds = await resolveUsersForRoles(assignedRoles);
      const userIds = [...new Set([...directUsers, ...assignedUsers, ...roleUserIds])];
      const emails = [...new Set([...directEmails, ...assignedEmails, ...dynamicEmails])];
      if (!userIds.length && !emails.length && (rule || isKnownNotificationAction(normalizedResource, normalizedAction))) {
        return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'no_notification_recipients_resolved' });
      }

      const normalizedRecordId = String(recordId || '').trim();
      const finalUrl = String(url || '').trim() || (normalizedRecordId ? `/#${encodeURIComponent(normalizedResource)}?id=${encodeURIComponent(normalizedRecordId)}` : `/#${encodeURIComponent(normalizedResource)}`);
      const payload = {
        title: title || 'InCheck360 notification',
        body: body || 'A record was updated.',
        resource: normalizedResource,
        action: normalizedAction,
        event_key: normalizedEventKey,
        record_id: normalizedRecordId || undefined,
        record_number: String(recordNumber || '').trim() || undefined,
        url: finalUrl,
        tag: `${normalizedResource}-${normalizedAction}-${normalizedRecordId || 'record'}-${Date.now()}`,
        data: {
          resource: normalizedResource,
          action: normalizedAction,
          event_key: normalizedEventKey,
          record_id: normalizedRecordId || undefined,
          record_number: String(recordNumber || '').trim() || undefined,
          url: finalUrl,
          ...(metadata && typeof metadata === 'object' ? metadata : {})
        },
        channels: allowedChannels,
        user_ids: userIds,
        emails,
        target_roles: assignedRoles
      };
      try { return await global.Api.sendWebPush(payload, { context: `${normalizedResource}:${normalizedAction}:central` }); }
      catch (error) {
        console.warn('[notifications] sendBusinessNotification failed (non-blocking)', error);
        return { attempted: true, sent: false, error: String(error?.message || error) };
      }
    }
  };

  global.NotificationService = NotificationService;
})(window);
