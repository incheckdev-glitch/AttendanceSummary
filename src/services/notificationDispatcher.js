export async function dispatchNotification({
  supabase,
  eventKey,
  recipientUserIds,
  payload = {},
  resource = null,
  resourceId = null,
  deepLink = null,
}) {
  const cleanRecipients = [...new Set((recipientUserIds || []).filter(Boolean))];

  if (!eventKey || cleanRecipients.length === 0) {
    console.warn("Notification skipped: missing eventKey or recipients", {
      eventKey,
      recipientUserIds,
    });
    return [];
  }

  const { data, error } = await supabase.rpc("dispatch_notification", {
    p_event_key: eventKey,
    p_recipient_user_ids: cleanRecipients,
    p_payload: payload,
    p_resource: resource,
    p_resource_id: resourceId ? String(resourceId) : null,
    p_deep_link: deepLink,
  });

  if (error) {
    console.error("dispatch_notification failed:", {
      eventKey,
      recipientUserIds: cleanRecipients,
      payload,
      error,
    });
    throw error;
  }

  return data || [];
}

if (typeof window !== 'undefined') {
  window.dispatchNotification = dispatchNotification;
}
