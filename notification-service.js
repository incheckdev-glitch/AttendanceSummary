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
      dev_team_status_changed: ['dev_team_status_changed', 'ticket_dev_team_status_changed', 'ticket_dev_status_changed', 'tickets.dev_team_status_changed', 'tickets.ticket_dev_team_status_changed'],
      ticket_dev_team_status_changed: ['dev_team_status_changed', 'ticket_dev_team_status_changed', 'ticket_dev_status_changed', 'tickets.dev_team_status_changed', 'tickets.ticket_dev_team_status_changed'],
      ticket_dev_status_changed: ['dev_team_status_changed', 'ticket_dev_team_status_changed', 'ticket_dev_status_changed', 'tickets.dev_team_status_changed', 'tickets.ticket_dev_team_status_changed']
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


  function isValidEmail(value = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim().toLowerCase());
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function toTitleCase(value) {
    return String(value ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  function formatActionLabel(action) {
    return toTitleCase(String(action ?? '').replace(/[_.-]+/g, ' '));
  }

  function formatResourceLabel(resource) {
    return toTitleCase(String(resource ?? '').replace(/[_.-]+/g, ' '));
  }

  function resolveEmailBaseUrl() {
    const env = global?.ENV || {};
    const fromEnv = [env.APP_PUBLIC_URL, env.PUBLIC_APP_URL, env.VITE_APP_PUBLIC_URL]
      .map(value => String(value || '').trim())
      .find(Boolean);
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    const origin = String(global?.location?.origin || '').trim();
    if (origin) return origin.replace(/\/+$/, '');
    return 'https://monitor.app.incheck360.nl';
  }

  function toAbsoluteNotificationUrl(url) {
    const input = String(url || '').trim();
    if (!input) return '';
    if (/^https?:\/\//i.test(input)) return input;
    const base = resolveEmailBaseUrl();
    if (input.startsWith('/')) return `${base}${input}`;
    if (input.startsWith('#')) return `${base}/${input}`;
    return `${base}/${input.replace(/^\/+/, '')}`;
  }

  function buildEmailTemplate({ title = '', body = '', resource = '', action = '', recordNumber = '', url = '' } = {}) {
    const safeTitle = String(title || 'InCheck360 Notification').trim() || 'InCheck360 Notification';
    const safeBody = String(body || '').trim() || 'A business event requires your attention.';
    const safeResource = String(resource || '').trim();
    const safeAction = String(action || '').trim();
    const safeRecordNumber = String(recordNumber || '').trim();
    const absoluteUrl = toAbsoluteNotificationUrl(url);
    const formattedResource = formatResourceLabel(safeResource) || 'General';
    const formattedAction = formatActionLabel(safeAction) || 'Updated';
    const badgeText = `${formattedResource} • ${formattedAction}`;
    const timestamp = new Date().toISOString();

    const subject = escapeHtml(safeTitle);
    const bodyHtml = escapeHtml(safeBody);
    const resourceHtml = escapeHtml(formattedResource);
    const actionHtml = escapeHtml(formattedAction);
    const recordNumberHtml = escapeHtml(safeRecordNumber);
    const badgeHtml = escapeHtml(badgeText);
    const timestampHtml = escapeHtml(timestamp);
    const buttonUrlAttr = escapeAttribute(absoluteUrl);
    const fallbackUrlHtml = escapeHtml(absoluteUrl);

    const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f5f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:#0f172a;">
              <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">InCheck360 Notifications</div>
              <div style="margin-top:10px;display:inline-block;padding:6px 10px;background:#1e293b;color:#cbd5e1;border-radius:999px;font-size:12px;font-weight:600;">${badgeHtml}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;color:#111827;">${subject}</h1>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#374151;">${bodyHtml}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">
                <tr><td style="padding:14px 16px;font-size:14px;color:#4b5563;"><strong style="color:#111827;">Resource:</strong> ${resourceHtml}</td></tr>
                <tr><td style="padding:0 16px 14px 16px;font-size:14px;color:#4b5563;"><strong style="color:#111827;">Action:</strong> ${actionHtml}</td></tr>
                ${safeRecordNumber ? `<tr><td style="padding:0 16px 14px 16px;font-size:14px;color:#4b5563;"><strong style="color:#111827;">Record #:</strong> ${recordNumberHtml}</td></tr>` : ''}
              </table>
              ${absoluteUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;"><tr><td><a href="${buttonUrlAttr}" style="display:inline-block;padding:12px 20px;background:#0b57d0;border-radius:6px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Open in InCheck360</a></td></tr></table>
              <p style="margin:0 0 18px 0;font-size:12px;line-height:1.5;color:#6b7280;">If the button does not work, copy and paste this link into your browser:<br><a href="${buttonUrlAttr}" style="color:#0b57d0;word-break:break-all;text-decoration:underline;">${fallbackUrlHtml}</a></p>` : ''}
              <p style="margin:0;font-size:12px;color:#6b7280;">Timestamp: ${timestampHtml}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;border-top:1px solid #e5e7eb;background:#fafafa;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">You received this notification because you are listed as a recipient in InCheck360.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = [
      safeTitle,
      '',
      safeBody,
      '',
      `Resource: ${formattedResource}`,
      `Action: ${formattedAction}`,
      `Record #: ${safeRecordNumber || '-'}`,
      `Open link: ${absoluteUrl || '-'}`,
      `Timestamp: ${timestamp}`,
      '',
      'You received this notification because you are listed as a recipient in InCheck360.'
    ].join('\n');
    return { subject: safeTitle, html, text };
  }

  async function sendNotificationEmail({ resource = '', action = '', eventKey = '', title = '', body = '', recipients = [], recordNumber = '', url = '' } = {}) {
    const emailRecipients = [...new Set(normalizeList(recipients).map(item => String(item || '').trim().toLowerCase()).filter(isValidEmail))];
    console.info('[notifications] email decision', {
      resource,
      action,
      eventKey,
      emailEnabled: true,
      recipientsCount: emailRecipients.length,
      hasSmtpHost: Boolean(global?.ENV?.SMTP_HOST || global?.process?.env?.SMTP_HOST),
      hasSmtpUser: Boolean(global?.ENV?.SMTP_USER || global?.process?.env?.SMTP_USER),
      hasSmtpPass: Boolean(global?.ENV?.SMTP_PASS || global?.process?.env?.SMTP_PASS),
      hasSmtpFrom: Boolean(global?.ENV?.SMTP_FROM || global?.process?.env?.SMTP_FROM)
    });
    if (!emailRecipients.length) {
      console.info('[notifications] no_email_recipients_resolved', { resource, action, eventKey });
      return { attempted: false, skipped: true, reason: 'no_email_recipients_resolved' };
    }
    const token = await global.Api.getCurrentAccessToken();
    const template = buildEmailTemplate({ title, body, resource, action, recordNumber, url });
    console.info('[notifications] email template built', {
      resource,
      action,
      eventKey,
      hasUrl: Boolean(url),
      recordNumber: recordNumber || null
    });
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}`, 'X-Supabase-Access-Token': token } : {})
      },
      body: JSON.stringify({ resource: 'notifications', action: 'send_email', to: emailRecipients, ...template })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(result?.error || 'Unable to send email notification'));
    console.info('[notifications] email sent', { resource, action, eventKey, recipientsCount: emailRecipients.length, messageId: result?.messageId || null });
    return result;
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

  let usersCache = { loadedAt: 0, rows: [] };

  async function listActiveUserRows() {
    const now = Date.now();
    if (Array.isArray(usersCache.rows) && usersCache.rows.length && now - usersCache.loadedAt < 60000) return usersCache.rows;

    try {
      const usersResponse = await global.Api.requestWithSession('users', 'list', { limit: 10000 }, { requireAuth: true });
      const rows = Array.isArray(usersResponse?.rows)
        ? usersResponse.rows
        : (Array.isArray(usersResponse?.data?.rows)
          ? usersResponse.data.rows
          : (Array.isArray(usersResponse) ? usersResponse : []));
      usersCache = { loadedAt: now, rows: rows.filter(row => row && typeof row === 'object') };
      return usersCache.rows;
    } catch (error) {
      console.warn('[notifications] unable to load user rows for notification recipients', error);
      return [];
    }
  }

  function isActiveUserRow(row = {}) {
    return row?.is_active !== false && row?.isActive !== false && row?.active !== false;
  }

  function getUserRowId(row = {}) {
    return String(row?.id || row?.user_id || row?.userId || row?.profile_id || row?.profileId || '').trim();
  }

  function getUserRowEmail(row = {}) {
    return String(row?.email || row?.user_email || row?.userEmail || '').trim().toLowerCase();
  }

  async function resolveUsersForRolesDetailed(assignedRoles = []) {
    const roleSet = new Set(normalizeRoleList(assignedRoles));
    if (!roleSet.size) return { userIds: [], emails: [] };
    const rows = await listActiveUserRows();
    const matched = rows.filter(row => {
      if (!isActiveUserRow(row)) return false;
      const userRoles = normalizeRoleList([
        row.role, row.role_key, row.roleKey, row.user_role, row.userRole, row.app_role, row.appRole,
        ...(Array.isArray(row.roles) ? row.roles : [])
      ]);
      return userRoles.some(role => roleSet.has(role));
    });
    return {
      userIds: [...new Set(matched.map(getUserRowId).filter(Boolean))],
      emails: [...new Set(matched.map(getUserRowEmail).filter(isValidEmail))]
    };
  }

  async function resolveEmailsForUserIds(userIds = []) {
    const idSet = new Set(normalizeList(userIds).map(item => String(item || '').trim()).filter(Boolean));
    if (!idSet.size) return [];
    const rows = await listActiveUserRows();
    return [...new Set(rows.filter(row => idSet.has(getUserRowId(row))).map(getUserRowEmail).filter(isValidEmail))];
  }

  async function resolveUsersForRoles(assignedRoles = []) {
    const detailed = await resolveUsersForRolesDetailed(assignedRoles);
    return detailed.userIds;
  }


  function buildNotificationRoute(resource = '', recordId = '') {
    const normalizedResource = String(resource || '').trim();
    const normalizedRecordId = String(recordId || '').trim();
    if (!normalizedResource) return normalizedRecordId ? `/#record?id=${encodeURIComponent(normalizedRecordId)}` : '/#';
    if (!normalizedRecordId) return `/#${encodeURIComponent(normalizedResource)}`;

    const encodedId = encodeURIComponent(normalizedRecordId);
    const routeMap = {
      tickets: `/#tickets?ticket_id=${encodedId}`,
      workflow: `/#workflow?approval_id=${encodedId}`,
      operations_onboarding: `/#operations-onboarding?onboarding_id=${encodedId}`,
      operations_onboarding_requests: `/#operations-onboarding?onboarding_id=${encodedId}`,
      technical_admin_requests: `/#technical-admin?id=${encodedId}`,
      technical_admin: `/#technical-admin?id=${encodedId}`,
      leads: `/#crm?tab=leads&id=${encodedId}`,
      deals: `/#crm?tab=deals&id=${encodedId}`,
      proposals: `/#crm?tab=proposals&id=${encodedId}`,
      agreements: `/#crm?tab=agreements&id=${encodedId}`,
      invoices: `/#finance?tab=invoices&id=${encodedId}`,
      receipts: `/#finance?tab=receipts&id=${encodedId}`,
      clients: `/#clients?id=${encodedId}`,
      events: `/#events?id=${encodedId}`
    };
    return routeMap[normalizedResource] || `/#${encodeURIComponent(normalizedResource)}?id=${encodedId}`;
  }

  const NotificationService = {
    async sendBusinessNotification({ resource = '', action = '', eventKey = '', recordId = '', recordNumber = '', title = '', body = '', targetUsers = [], targetEmails = [], url = '', metadata = {}, channels = ['in_app', 'push', 'email'], roles = ['admin'] } = {}) {
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
      const normalizedRequestedChannels = requestedChannels
        .map(channel => String(channel || '').trim().toLowerCase())
        .filter(Boolean);
      const recipients = [];
      const decision = {
        channels: { in_app: false, push: false, email: false },
        shouldSendAny: false
      };

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

      const roleRecipients = await resolveUsersForRolesDetailed(assignedRoles);
      const userIds = [...new Set([...directUsers, ...assignedUsers, ...roleRecipients.userIds])];
      const userIdEmails = await resolveEmailsForUserIds(userIds);
      const emails = [...new Set([...directEmails, ...assignedEmails, ...dynamicEmails, ...roleRecipients.emails, ...userIdEmails])];
      if (!userIds.length && !emails.length && (rule || isKnownNotificationAction(normalizedResource, normalizedAction))) {
        return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'no_notification_recipients_resolved' });
      }

      recipients.push(...userIds, ...emails);
      const emailRecipients = [...new Set(emails.filter(isValidEmail))];
      const baseAllowed = Boolean(isRuleEnabled(rule) && recipients.length > 0);
      decision.channels.in_app = Boolean(baseAllowed && isChannelEnabled(rule, 'in_app') && normalizedRequestedChannels.includes('in_app'));
      decision.channels.push = Boolean(baseAllowed && isChannelEnabled(rule, 'push') && normalizedRequestedChannels.includes('push'));
      decision.channels.email = Boolean(baseAllowed && isChannelEnabled(rule, 'email') && normalizedRequestedChannels.includes('email'));
      decision.shouldSendAny = Boolean(decision.channels.in_app || decision.channels.push || decision.channels.email);
      console.info('[notifications] channel decision', {
        resource: normalizedResource,
        action: normalizedAction,
        eventKey: normalizedEventKey,
        ruleFound: Boolean(rule),
        isEnabled: rule?.is_enabled,
        inAppEnabled: rule?.in_app_enabled,
        pwaEnabled: rule?.pwa_enabled,
        pushEnabled: rule?.push_enabled ?? rule?.web_push_enabled,
        emailEnabled: rule?.email_enabled,
        recipientsCount: recipients.length,
        sendInApp: decision.channels.in_app,
        sendPush: decision.channels.push,
        sendEmail: decision.channels.email
      });
      if (!decision.shouldSendAny) {
        return skipNotification({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, reason: 'notification_channels_disabled' });
      }

      const normalizedRecordId = String(recordId || '').trim();
      const ticketBusinessId =
        metadata?.ticket_id ||
        metadata?.ticketId ||
        metadata?.ticket_number ||
        metadata?.ticketNumber ||
        recordNumber ||
        recordId;
      const finalUrl = String(url || '').trim() || (
        normalizedResource === 'tickets'
          ? `/#tickets?ticket_id=${encodeURIComponent(String(ticketBusinessId || '').trim() || normalizedRecordId)}`
          : buildNotificationRoute(normalizedResource, normalizedRecordId)
      );
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
        channels: [
          ...(decision.channels.in_app ? ['in_app'] : []),
          ...(decision.channels.push ? ['push'] : []),
          ...(decision.channels.email ? ['email'] : [])
        ],
        user_ids: userIds,
        emails: emailRecipients,
        target_roles: assignedRoles
      };
      let pushResult = { attempted: false, skipped: true, reason: 'push-disabled-by-rule' };
      if (decision.channels.push) {
        try {
          pushResult = await global.Api.sendWebPush(payload, { context: `${normalizedResource}:${normalizedAction}:central` });
        } catch (error) {
          console.warn('[notifications] push send failed', { resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, error: error?.message || String(error) });
          pushResult = { attempted: true, sent: false, error: String(error?.message || error) };
        }
      } else {
        console.info('[notifications] push skipped by channel rule', { resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey });
      }

      if (decision.channels.email) {
        try {
          await sendNotificationEmail({ resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, title: payload.title, body: payload.body, recipients: emailRecipients, recordNumber: payload.record_number, url: payload.url });
        } catch (error) {
          console.warn('[notifications] email send failed', { resource: normalizedResource, action: normalizedAction, eventKey: normalizedEventKey, error: error?.message || String(error) });
        }
      }

      return pushResult;
    }
  };

  global.NotificationService = NotificationService;
})(window);
