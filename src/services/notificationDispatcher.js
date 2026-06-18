async function getAccessToken(supabase) {
  try {
    if (typeof window !== 'undefined' && window.Api?.getCurrentAccessToken) {
      const token = await window.Api.getCurrentAccessToken();
      if (token) return token;
    }
    const sessionResult = await supabase?.auth?.getSession?.();
    return String(sessionResult?.data?.session?.access_token || '').trim();
  } catch (_) {
    return '';
  }
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeArray).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeArray(parsed);
    } catch (_) {}
    return trimmed.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [String(value || '').trim()].filter(Boolean);
}

function getPayloadChannels(payload = {}) {
  return normalizeArray(payload?.channels).map(channel => String(channel || '').trim().toLowerCase());
}

async function resolveEmailsForUsers(supabase, userIds = [], extraEmails = []) {
  const emails = new Set(normalizeArray(extraEmails).map(normalizeEmail).filter(isValidEmail));
  const ids = [...new Set(normalizeArray(userIds).map(String).filter(Boolean))];
  if (!ids.length) return [...emails];

  const tables = ['profiles', 'users'];
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .in('id', ids);
      if (!error && Array.isArray(data)) {
        data.forEach(row => {
          const email = normalizeEmail(row?.email || row?.user_email || row?.email_address);
          if (isValidEmail(email)) emails.add(email);
        });
      }
    } catch (_) {}
  }

  try {
    const currentUser = (typeof window !== 'undefined' && (window.Session?.user?.() || window.Session?.currentUser?.())) || null;
    const currentUserId = String((typeof window !== 'undefined' && window.Session?.userId?.()) || currentUser?.id || '').trim();
    if (currentUserId && ids.includes(currentUserId)) {
      const currentEmail = normalizeEmail(currentUser?.email || currentUser?.user_email || '');
      if (isValidEmail(currentEmail)) emails.add(currentEmail);
    }
  } catch (_) {}

  return [...emails];
}

async function processQueueNow(supabase) {
  try {
    const token = await getAccessToken(supabase);
    const response = await fetch('/api/notifications/process-queue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}`, 'X-Supabase-Access-Token': token } : {})
      },
      body: JSON.stringify({ source: 'dispatchNotification-auto-process' })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) {
      return { attempted: true, sent: false, ok: false, error: String(result?.error || `HTTP ${response.status}`), result };
    }
    return { attempted: true, sent: true, ok: true, result };
  } catch (error) {
    return { attempted: true, sent: false, ok: false, error: String(error?.message || error) };
  }
}

function queueResultHasSentChannel(processResult = {}, channel = '') {
  const rows = processResult?.result?.results || processResult?.results || [];
  const normalized = String(channel || '').toLowerCase();
  return Array.isArray(rows) && rows.some(row => String(row?.channel || '').toLowerCase() === normalized && String(row?.status || '').toLowerCase() === 'sent');
}

function buildEmailHtml({ title = '', body = '', deepLink = '' } = {}) {
  const esc = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const link = deepLink ? `<p><a href="${esc(deepLink)}">Open in ERP</a></p>` : '';
  return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;"><h2>${esc(title)}</h2><p>${esc(body)}</p>${link}</div>`;
}

async function sendEmailDirect({ supabase, recipientEmails = [], title = '', body = '', deepLink = '' } = {}) {
  const emails = [...new Set(normalizeArray(recipientEmails).map(normalizeEmail).filter(isValidEmail))];
  if (!emails.length) return { attempted: false, skipped: true, reason: 'no_email_recipients_resolved' };

  try {
    const token = await getAccessToken(supabase);
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}`, 'X-Supabase-Access-Token': token } : {})
      },
      body: JSON.stringify({
        resource: 'notifications',
        action: 'send_email',
        to: emails,
        subject: title || 'InCheck360 Notification',
        html: buildEmailHtml({ title, body, deepLink }),
        text: `${title || 'InCheck360 Notification'}\n\n${body || ''}\n\n${deepLink || ''}`
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(String(result?.error || `HTTP ${response.status}`));
    return { attempted: true, sent: true, result };
  } catch (error) {
    return { attempted: true, sent: false, error: String(error?.message || error) };
  }
}

async function sendPwaDirect({ supabase, recipientUserIds = [], recipientEmails = [], roles = [], title = '', body = '', deepLink = '', eventKey = '', resource = '', resourceId = '', payload = {} } = {}) {
  const userIds = [...new Set(normalizeArray(recipientUserIds).map(String).filter(Boolean))];
  const emails = [...new Set(normalizeArray(recipientEmails).map(normalizeEmail).filter(isValidEmail))];
  const targetRoles = [...new Set(normalizeArray(roles).map(role => String(role || '').trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean))];
  if (!userIds.length && !emails.length && !targetRoles.length) return { attempted: false, skipped: true, reason: 'no_pwa_recipients_resolved' };

  try {
    const requestPayload = {
      title: title || 'InCheck360 Notification',
      body: body || 'A record was updated.',
      url: deepLink || '/',
      tag: `${resource || 'notification'}-${eventKey || 'event'}-${resourceId || Date.now()}`,
      resource,
      action: eventKey,
      record_id: resourceId || undefined,
      data: {
        url: deepLink || '/',
        event_key: eventKey,
        resource,
        record_id: resourceId || undefined,
        ...(payload?.data && typeof payload.data === 'object' ? payload.data : {})
      }
    };
    if (userIds.length) requestPayload.user_ids = userIds;
    if (emails.length) requestPayload.emails = emails;
    if (targetRoles.length) requestPayload.roles = targetRoles;
    const { data, error } = await supabase.functions.invoke('send-web-push-v2', { body: requestPayload });
    if (error) throw error;
    return { attempted: true, sent: true, result: data || null };
  } catch (error) {
    return { attempted: true, sent: false, error: String(error?.message || error || 'send-web-push-v2 failed') };
  }
}

async function markQueueRowsAfterDirect({ supabase, eventKey, resource, resourceId, channel, result } = {}) {
  try {
    if (!supabase || !eventKey || !channel) return;
    let status = 'failed';
    let lastError = result?.error || result?.reason || null;
    if (result?.sent || result?.result?.ok) {
      status = 'sent';
      lastError = null;
    } else if (result?.skipped) {
      status = 'skipped';
    }
    let query = supabase
      .from('notification_delivery_queue')
      .update({
        status,
        last_error: lastError,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('event_key', eventKey)
      .eq('channel', channel)
      .in('status', ['queued', 'processing']);
    if (resource) query = query.eq('resource', resource);
    if (resourceId) query = query.eq('resource_id', String(resourceId));
    await query;
  } catch (error) {
    console.warn('Unable to sync queue row after direct notification send', { eventKey, channel, error });
  }
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
  const cleanRecipients = [...new Set((recipientUserIds || []).filter(Boolean))];

  if (!eventKey || cleanRecipients.length === 0) {
    console.warn('Notification skipped: missing eventKey or recipients', {
      eventKey,
      recipientUserIds,
    });
    return [];
  }

  const { data, error } = await supabase.rpc('dispatch_notification', {
    p_event_key: eventKey,
    p_recipient_user_ids: cleanRecipients,
    p_payload: payload,
    p_resource: resource,
    p_resource_id: resourceId ? String(resourceId) : null,
    p_deep_link: deepLink,
  });

  if (error) {
    console.error('dispatch_notification failed:', {
      eventKey,
      recipientUserIds: cleanRecipients,
      payload,
      error,
    });
    throw error;
  }

  const channels = getPayloadChannels(payload);
  const wantsEmail = channels.includes('email');
  const wantsPwa = channels.includes('pwa') || channels.includes('push');
  const channelResults = { queue_worker: await processQueueNow(supabase) };

  const title = payload?.title || payload?.subject || 'InCheck360 Notification';
  const body = payload?.body || payload?.message || 'A record was updated.';
  const resolvedDeepLink = deepLink || payload?.url || payload?.deep_link || '/';
  const recipientEmails = await resolveEmailsForUsers(supabase, cleanRecipients, payload?.emails || payload?.target_emails || []);

  if (wantsEmail) {
    if (queueResultHasSentChannel(channelResults.queue_worker, 'email')) {
      channelResults.email = { attempted: true, sent: true, source: 'queue_worker' };
    } else {
      channelResults.email = await sendEmailDirect({ supabase, recipientEmails, title, body, deepLink: resolvedDeepLink });
      await markQueueRowsAfterDirect({ supabase, eventKey, resource, resourceId, channel: 'email', result: channelResults.email });
    }
  }

  if (wantsPwa) {
    if (queueResultHasSentChannel(channelResults.queue_worker, 'pwa')) {
      channelResults.pwa = { attempted: true, sent: true, source: 'queue_worker' };
    } else {
      channelResults.pwa = await sendPwaDirect({
        supabase,
        recipientUserIds: cleanRecipients,
        recipientEmails,
        roles: payload?.target_roles || payload?.roles || [],
        title,
        body,
        deepLink: resolvedDeepLink,
        eventKey,
        resource,
        resourceId,
        payload,
      });
      await markQueueRowsAfterDirect({ supabase, eventKey, resource, resourceId, channel: 'pwa', result: channelResults.pwa });
    }
  }

  return Object.assign(data || [], { channelResults });
}

if (typeof window !== 'undefined') {
  window.dispatchNotification = dispatchNotification;
}
