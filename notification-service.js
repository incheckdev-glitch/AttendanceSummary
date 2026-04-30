(function initNotificationService(global) {
  const NotificationService = {
    async sendBusinessNotification({
      resource = '',
      action = '',
      recordId = '',
      recordNumber = '',
      title = '',
      body = '',
      targetUsers = [],
      targetEmails = [],
      url = '',
      metadata = {},
      channels = ['in_app', 'push'],
      roles = ['admin']
    } = {}) {
      const normalizedResource = String(resource || '').trim();
      const normalizedAction = String(action || '').trim();
      if (!normalizedResource || !normalizedAction) return { attempted: false, skipped: true, reason: 'missing-resource-action' };

      const normalizedRecordId = String(recordId || '').trim();
      const finalUrl = String(url || '').trim() || (normalizedRecordId
        ? `/#${encodeURIComponent(normalizedResource)}?id=${encodeURIComponent(normalizedRecordId)}`
        : `/#${encodeURIComponent(normalizedResource)}`);

      const payload = {
        title: title || 'InCheck360 notification',
        body: body || 'A record was updated.',
        resource: normalizedResource,
        action: normalizedAction,
        record_id: normalizedRecordId || undefined,
        record_number: String(recordNumber || '').trim() || undefined,
        url: finalUrl,
        tag: `${normalizedResource}-${normalizedAction}-${normalizedRecordId || 'record'}-${Date.now()}`,
        data: {
          resource: normalizedResource,
          action: normalizedAction,
          record_id: normalizedRecordId || undefined,
          record_number: String(recordNumber || '').trim() || undefined,
          url: finalUrl,
          ...(metadata && typeof metadata === 'object' ? metadata : {})
        },
        channels: Array.isArray(channels) ? channels : ['in_app', 'push']
      };

      const userIds = Array.isArray(targetUsers) ? targetUsers.map(id => String(id || '').trim()).filter(Boolean) : [];
      const emails = Array.isArray(targetEmails) ? targetEmails.map(email => String(email || '').trim().toLowerCase()).filter(Boolean) : [];
      if (userIds.length) payload.user_ids = userIds;
      if (emails.length) payload.emails = emails;
      if (!userIds.length && !emails.length) {
        payload.roles = (Array.isArray(roles) ? roles : ['admin']).map(role => String(role || '').trim().toLowerCase()).filter(Boolean);
      }

      try {
        return await global.Api.sendWebPush(payload, { context: `${normalizedResource}:${normalizedAction}:central` });
      } catch (error) {
        console.warn('[notifications] sendBusinessNotification failed (non-blocking)', error);
        return { attempted: true, sent: false, error: String(error?.message || error) };
      }
    }
  };

  global.NotificationService = NotificationService;
})(window);
