function normalizeRecipientUserIds(recipientUserIds) {
  return [...new Set((Array.isArray(recipientUserIds) ? recipientUserIds : [recipientUserIds])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
}

async function triggerNotificationQueueProcessing() {
  const response = await fetch('/api/notifications/process-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    const error = new Error(String(result?.error || `Notification queue processing failed with HTTP ${response.status}`));
    error.result = result;
    throw error;
  }
  return result;
}

export async function dispatchNotification({
  supabase,
  eventKey,
  recipientUserIds,
  payload = {},
  resource = null,
  resourceId = null,
  deepLink = null,
}) {
  if (!supabase?.rpc) throw new Error('dispatchNotification requires a Supabase client.');

  const cleanRecipientUserIds = normalizeRecipientUserIds(recipientUserIds);
  if (!eventKey || cleanRecipientUserIds.length === 0) {
    throw new Error('dispatchNotification requires eventKey and at least one recipient user id.');
  }

  const { data, error } = await supabase.rpc('dispatch_notification', {
    p_event_key: eventKey,
    p_recipient_user_ids: cleanRecipientUserIds,
    p_payload: payload,
    p_resource: resource,
    p_resource_id: resourceId ? String(resourceId) : null,
    p_deep_link: deepLink,
  });

  if (error) {
    console.error('dispatch_notification failed:', {
      eventKey,
      recipientUserIds: cleanRecipientUserIds,
      payload,
      error,
    });
    throw error;
  }

  const queueProcessing = await triggerNotificationQueueProcessing();
  return Object.assign(Array.isArray(data) ? data : [], { queueProcessing });
}

if (typeof window !== 'undefined') {
  window.dispatchNotification = dispatchNotification;
}
