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

  global.getRecordRef = global.getRecordRef || getRecordRef;
  global.NotificationTemplateHelpers = global.NotificationTemplateHelpers || {};
  global.NotificationTemplateHelpers.getRecordRef = global.NotificationTemplateHelpers.getRecordRef || global.getRecordRef;
})(window);
