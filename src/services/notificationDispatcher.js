function normalizeRecipientUserIds(recipientUserIds) {
  return [...new Set((Array.isArray(recipientUserIds) ? recipientUserIds : [recipientUserIds])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
}

async function getCurrentAccessToken(supabase) {
  try {
    const apiToken = await window?.Api?.getCurrentAccessToken?.();
    if (apiToken) return String(apiToken || '').trim();
  } catch {}

  try {
    const sessionResult = await supabase?.auth?.getSession?.();
    const token = sessionResult?.data?.session?.access_token;
    if (token) return String(token || '').trim();
  } catch {}

  try {
    const client = window?.SupabaseClient?.getClient?.();
    const sessionResult = await client?.auth?.getSession?.();
    const token = sessionResult?.data?.session?.access_token;
    if (token) return String(token || '').trim();
  } catch {}

  return '';
}

async function postJsonWithAuth(url, payload = {}, { supabase } = {}) {
  const token = await getCurrentAccessToken(supabase);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}`, 'X-Supabase-Access-Token': token } : {})
    },
    body: JSON.stringify(payload || {})
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    const error = new Error(String(result?.error || `Request failed with HTTP ${response.status}`));
    error.status = response.status;
    error.result = result;
    throw error;
  }
  return result;
}

async function triggerNotificationQueueProcessing({ supabase } = {}) {
  return postJsonWithAuth('/api/notifications/process-queue', { source: 'notification-dispatcher' }, { supabase });
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

  let queueProcessing;
  try {
    queueProcessing = await triggerNotificationQueueProcessing({ supabase });
  } catch (queueError) {
    queueProcessing = {
      ok: false,
      error: String(queueError?.message || queueError),
      status: queueError?.status || null,
      result: queueError?.result || null
    };
    console.warn('notification queue processing failed after dispatch:', queueProcessing);
  }

  return Object.assign(Array.isArray(data) ? data : [], { queueProcessing });
}

async function runServerPushTestViaVercel(pushModule) {
  if (!pushModule?.requireNotificationAdmin?.()) return;
  if (!window?.Session?.isAuthenticated?.()) {
    pushModule.setMessage?.('Please log in first to run server push test.');
    return;
  }

  pushModule.setBusy?.(true);
  pushModule.setServerTestResultMessage?.('Server push test: sending…');

  try {
    const userId = String(window?.Session?.userId?.() || '').trim();
    if (!userId) throw new Error('Missing current user id.');

    const subscriptionRow = await pushModule.findCurrentUserSubscriptionTarget?.(userId);
    const targetPayload = subscriptionRow?.id
      ? { subscription_ids: [String(subscriptionRow.id)] }
      : { user_ids: [userId] };
    const targetLabel = subscriptionRow?.id
      ? `subscription_id ${String(subscriptionRow.id)}`
      : `user_id ${userId}`;

    const result = await postJsonWithAuth('/api/notifications/test-push', {
      ...targetPayload,
      title: 'InCheck360 Server Test',
      body: 'Server push is working.',
      url: '/?pushTest=1',
      tag: 'server-test-push',
      data: { test: true, source: 'push-settings-test' }
    }, { supabase: window?.SupabaseClient?.getClient?.() });

    pushModule.state.latestServerTestResult = result || null;
    const attempted = Number(result?.attempted || 0);
    const sent = Number(result?.sent || 0);
    const failed = Number(result?.failed || 0);
    pushModule.setServerTestResultMessage?.(
      `Server push test result: attempted=${attempted}, sent=${sent}, failed=${failed}. Target: ${targetLabel}.`
    );
    if (attempted > 0 && sent === 0 && failed > 0) {
      pushModule.setMessage?.('The saved device subscription may be stale. Refresh your push subscription.');
    } else {
      pushModule.setMessage?.('Server push test completed. If no banner appears while closed, check OS settings, iOS Home Screen requirement, and active service worker version.');
    }
    await pushModule.renderDiagnostics?.({ source: 'testServerPushVercel' });
  } catch (error) {
    const message = String(error?.message || 'Unknown error');
    pushModule.setServerTestResultMessage?.(`Server push test failed: ${message}`);
    pushModule.setMessage?.(`Server push test failed: ${message}`);
  } finally {
    pushModule.setBusy?.(false);
  }
}

function installPushNotificationsPatch(attempt = 0) {
  const pushModule = window?.PushNotifications;
  if (pushModule && !pushModule.__incheck360FinalNotificationPatch) {
    pushModule.__incheck360FinalNotificationPatch = true;
    pushModule.testServerPush = function patchedTestServerPush() {
      return runServerPushTestViaVercel(this);
    };
    return;
  }
  if (attempt < 80) {
    window.setTimeout(() => installPushNotificationsPatch(attempt + 1), 250);
  }
}

if (typeof window !== 'undefined') {
  window.dispatchNotification = dispatchNotification;
  installPushNotificationsPatch();
  window.addEventListener?.('DOMContentLoaded', () => installPushNotificationsPatch());
  window.addEventListener?.('load', () => installPushNotificationsPatch());
}
