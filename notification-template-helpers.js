(function initNotificationTemplateHelpers(global) {
  function getRecordRef(record = {}, fallback = 'TEST-NOTIFICATION') {
    if (!record || typeof record !== 'object') return fallback;

    return String(
      record.record_ref ||
      record.record_reference ||
      record.reference ||
      record.ref ||
      record.ticket_number ||
      record.ticket_id ||
      record.event_number ||
      record.event_id ||
      record.lead_number ||
      record.lead_id ||
      record.deal_number ||
      record.deal_id ||
      record.proposal_number ||
      record.proposal_id ||
      record.agreement_number ||
      record.agreement_id ||
      record.invoice_number ||
      record.invoice_id ||
      record.receipt_number ||
      record.receipt_id ||
      record.onboarding_number ||
      record.technical_request_number ||
      record.conversation_number ||
      fallback
    ).trim() || fallback;
  }


  function renderNotificationTemplate(template = '', payload = {}) {
    return String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => {
      const cleanKey = String(key || '').trim();
      return String(payload?.[cleanKey] ?? '');
    }).replace(/\{([a-z0-9_]+)\}/gi, (_, key) => String(payload?.[key] ?? ''));
  }

  function getRecordDeepLink(resourceOrConfig = {}, record = {}) {
    const eventConfig = resourceOrConfig && typeof resourceOrConfig === 'object' ? resourceOrConfig : { resource: resourceOrConfig };
    const payload = {
      ...(record && typeof record === 'object' ? record : {}),
      id: record?.id || record?.record_id || record?.entity_id || 'test',
      record_id: record?.record_id || record?.id || record?.entity_id || 'test',
      entity_id: record?.entity_id || record?.id || record?.record_id || 'test',
      biners_entry_id: record?.biners_entry_id || record?.entry_id || record?.id || 'test',
      entry_id: record?.entry_id || record?.biners_entry_id || record?.id || 'test',
      entry_number: record?.entry_number || 'BIN/TEST',
      client_name: record?.client_name || 'Test Client'
    };
    const template = String(
      eventConfig.deep_link_template ||
      eventConfig.deepLinkTemplate ||
      eventConfig.link_template ||
      eventConfig.url_template ||
      eventConfig.deep_link ||
      eventConfig.link ||
      ''
    ).trim();
    if (template) {
      return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => encodeURIComponent(payload[String(key || '').trim()] ?? ''));
    }
    const moduleKey = String(eventConfig.module || eventConfig.module_key || eventConfig.resource || '').trim().toLowerCase();
    if (moduleKey === 'biners') return `/biners?entryId=${encodeURIComponent(payload.biners_entry_id)}`;
    return '/#notifications';
  }

  global.getRecordRef = global.getRecordRef || getRecordRef;
  global.NotificationTemplateHelpers = global.NotificationTemplateHelpers || {};
  global.NotificationTemplateHelpers.getRecordRef = global.NotificationTemplateHelpers.getRecordRef || global.getRecordRef;
  global.NotificationTemplateHelpers.renderNotificationTemplate = global.NotificationTemplateHelpers.renderNotificationTemplate || renderNotificationTemplate;
  global.NotificationTemplateHelpers.getRecordDeepLink = global.NotificationTemplateHelpers.getRecordDeepLink || getRecordDeepLink;
  global.renderNotificationTemplate = global.renderNotificationTemplate || renderNotificationTemplate;
  global.getRecordDeepLink = global.getRecordDeepLink || getRecordDeepLink;
})(window);
