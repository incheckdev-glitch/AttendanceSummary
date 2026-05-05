import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-incheck360-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@incheck360.com';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUSH_WEBHOOK_SECRET = Deno.env.get('INCHECK360_PUSH_WEBHOOK_SECRET') || '';

const adminClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      })
    : null;

function normalizeString(value: unknown) {
  return String(value || '').trim();
}

function uniqueList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  values.forEach(value => {
    const normalized = normalizeString(value);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  });
  return out;
}

function hasRole(payload: Record<string, unknown>, role: string) {
  const roleKey = normalizeString(role).toLowerCase();
  const appRole = normalizeString(payload.app_metadata?.role).toLowerCase();
  const profileRole = normalizeString(payload.user_metadata?.role).toLowerCase();
  const rolesFromMetadata = uniqueList(payload.app_metadata?.roles).map(item => item.toLowerCase());
  return appRole === roleKey || profileRole === roleKey || rolesFromMetadata.includes(roleKey);
}

async function resolveAuthContext(req: Request) {
  const authorization = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const webhookHeader = req.headers.get('x-incheck360-webhook-secret') || '';
  const webhookSecretProvided = webhookHeader && PUSH_WEBHOOK_SECRET && webhookHeader === PUSH_WEBHOOK_SECRET;
  const jwt = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';

  if (!jwt) {
    return {
      isAuthenticated: false,
      userId: '',
      isPrivileged: webhookSecretProvided,
      authError: 'Missing Authorization bearer token.'
    };
  }
  if (!adminClient) {
    return {
      isAuthenticated: false,
      userId: '',
      isPrivileged: false,
      authError: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    };
  }
  const { data, error } = await adminClient.auth.getUser(jwt);
  if (error || !data?.user) {
    return {
      isAuthenticated: false,
      userId: '',
      isPrivileged: webhookSecretProvided,
      authError: error?.message || 'Invalid or expired access token.'
    };
  }
  const user = data.user;
  const userId = normalizeString(user.id);
  const privilegedByRole = hasRole(user as unknown as Record<string, unknown>, 'admin') || hasRole(user as unknown as Record<string, unknown>, 'dev');
  return {
    isAuthenticated: true,
    userId,
    isPrivileged: webhookSecretProvided || privilegedByRole,
    authError: ''
  };
}

function buildPushPayload(input: Record<string, unknown>) {
  const title = String(input.title || 'InCheck360 MonitorCore').trim() || 'InCheck360 MonitorCore';
  const body = String(input.body || 'You have a new notification.').trim() || 'You have a new notification.';
  const url = String(input.url || '/').trim() || '/';
  const tag = String(input.tag || `incheck360-${Date.now()}`).trim() || `incheck360-${Date.now()}`;
  const data = input.data && typeof input.data === 'object' ? (input.data as Record<string, unknown>) : {};

  return {
    title,
    body,
    url,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag,
    data: {
      ...data,
      url
    }
  };
}

function getPayloadResource(input: Record<string, unknown>) {
  const data = input.data && typeof input.data === 'object' ? input.data as Record<string, unknown> : {};
  return normalizeString(input.resource || data.resource).toLowerCase();
}

function isAllowedSystemRolePush(input: Record<string, unknown>) {
  const resource = getPayloadResource(input);
  const allowedResources = new Set([
    'tickets',
    'operations_onboarding',
    'technical_admin_requests',
    'leads',
    'deals',
    'proposals',
    'agreements',
    'invoices',
    'receipts',
    'workflow',
    'notifications',
    'communication_centre'
  ]);
  return allowedResources.has(resource);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-incheck360-webhook-secret',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const auth = await resolveAuthContext(req);
    if (!auth.isAuthenticated && !auth.isPrivileged) {
      return new Response(
        JSON.stringify({
          error: auth.authError || 'Not authorized. Sign in first.',
          code: 'not_authorized'
        }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const payload = buildPushPayload(body);
    const bodySubscription = body.subscription as Record<string, unknown> | undefined;
    const targetUserIds = uniqueList(body.user_ids);
    const targetSubscriptionIds = uniqueList(body.subscription_ids);
    const legacyUserId = normalizeString(body.user_id);
    const legacySubscriptionId = normalizeString(body.subscription_id);
    if (legacyUserId && !targetUserIds.includes(legacyUserId)) targetUserIds.push(legacyUserId);
    if (legacySubscriptionId && !targetSubscriptionIds.includes(legacySubscriptionId)) targetSubscriptionIds.push(legacySubscriptionId);
    const targetRoles = uniqueList(body.roles).map(item => item.toLowerCase());
    const targetEmails = uniqueList(body.emails).map(item => item.toLowerCase());
    const allowBroadcast = false;
    const resource = getPayloadResource(body);

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({
          error: 'VAPID keys are not configured',
          payload
        }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const webPushModule = await import('npm:web-push@3.15.0');
    const webPush = webPushModule.default || webPushModule;
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    let subscriptions: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }> = [];
    let roleProfileIds: string[] = [];

    if (normalizeString(bodySubscription?.endpoint)) {
      subscriptions = [
        {
          endpoint: normalizeString(bodySubscription?.endpoint),
          keys: {
            p256dh: normalizeString((bodySubscription?.keys as Record<string, unknown> | undefined)?.p256dh),
            auth: normalizeString((bodySubscription?.keys as Record<string, unknown> | undefined)?.auth)
          }
        }
      ].filter(item => item.endpoint && item.keys.p256dh && item.keys.auth);
    } else {
      if (!adminClient) {
        return new Response(
          JSON.stringify({ error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
          { status: 500, headers: CORS_HEADERS }
        );
      }
      if (!auth.isPrivileged) {

        if (targetRoles.length > 0 && !isAllowedSystemRolePush(body)) {
          return new Response(
            JSON.stringify({
              error: 'Not authorized. Role push is only allowed for approved system notification resources.',
              code: 'forbidden_targeting'
            }),
            { status: 403, headers: CORS_HEADERS }
          );
        }

        const targetsOwnUserOnly = targetUserIds.length === 1 && targetUserIds[0] === auth.userId;
        let targetsOwnSubscriptionsOnly = false;
        if (targetSubscriptionIds.length > 0) {
          const { data: ownedRows, error: ownedError } = await adminClient
            .from('push_subscriptions')
            .select('id,user_id')
            .in('id', targetSubscriptionIds)
            .eq('is_active', true);
          if (ownedError) {
            return new Response(
              JSON.stringify({ error: ownedError.message || 'Unable to validate subscription ownership.' }),
              { status: 500, headers: CORS_HEADERS }
            );
          }
          const ownedIds = (ownedRows || []).map(row => normalizeString(row.id));
          targetsOwnSubscriptionsOnly =
            ownedIds.length === targetSubscriptionIds.length &&
            (ownedRows || []).every(row => normalizeString(row.user_id) === auth.userId);
        }
        const resource = getPayloadResource(body);
        const isAllowedRoleSystemPush = targetRoles.length > 0 && isAllowedSystemRolePush(body);
        const isAllowedCommunicationCentrePush = resource === 'communication_centre' && targetUserIds.length > 0;
        if (!targetsOwnUserOnly && !targetsOwnSubscriptionsOnly && !isAllowedRoleSystemPush && !isAllowedCommunicationCentrePush) {
          return new Response(
            JSON.stringify({
              error: 'Not authorized. Authenticated users may only send test pushes to their own user/subscription or approved system role pushes.',
              code: 'forbidden_self_target_only'
            }),
            { status: 403, headers: CORS_HEADERS }
          );
        }
      }

      console.info('[send-web-push-v2] resolving subscriptions', {
        targetUserIds,
        targetRoles,
        targetSubscriptionIds,
        resource,
        isPrivileged: auth.isPrivileged,
        authUserId: auth.userId
      });

      roleProfileIds = [];
      if (!targetUserIds.length && !targetRoles.length && !targetSubscriptionIds.length && !targetEmails.length) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no-target' }), { status: 200, headers: CORS_HEADERS });
      }
      if (targetRoles.length > 0) {
        const { data: profileRows, error: profileError } = await adminClient
          .from('profiles')
          .select('id, role_key')
          .eq('is_active', true)
          .limit(1000);
        if (profileError) throw new Error(profileError.message || 'Unable to load role profiles.');
        (profileRows || []).forEach(row => {
          const roleKey = normalizeString(row.role_key).toLowerCase();
          const id = normalizeString(row.id);
          if (id && targetRoles.includes(roleKey) && !roleProfileIds.includes(id)) roleProfileIds.push(id);
        });
      }

      const combinedUserIds = uniqueList([...targetUserIds, ...roleProfileIds]);
      if (targetEmails.length > 0) {
        const { data: emailProfiles, error: emailProfilesError } = await adminClient
          .from('profiles')
          .select('id,email')
          .eq('is_active', true)
          .in('email', targetEmails)
          .limit(500);
        if (emailProfilesError) throw new Error(emailProfilesError.message || 'Unable to resolve target emails.');
        (emailProfiles || []).forEach(row => {
          const id = normalizeString(row.id);
          if (id && !combinedUserIds.includes(id)) combinedUserIds.push(id);
        });
      }
      const fetchedRows: Array<Record<string, unknown>> = [];
      const seenSubscriptionIds = new Set<string>();

      if (targetSubscriptionIds.length > 0) {
        const { data: subscriptionRows, error: subscriptionError } = await adminClient
          .from('push_subscriptions')
          .select('id, user_id, email, role, endpoint, p256dh, auth')
          .eq('is_active', true)
          .in('id', targetSubscriptionIds)
          .limit(200);
        if (subscriptionError) throw new Error(subscriptionError.message || 'Unable to load target subscriptions.');
        (subscriptionRows || []).forEach(row => {
          const id = normalizeString(row.id);
          if (!id || seenSubscriptionIds.has(id)) return;
          seenSubscriptionIds.add(id);
          fetchedRows.push(row as Record<string, unknown>);
        });
      }

      if (combinedUserIds.length > 0) {
        const { data: userRows, error: userError } = await adminClient
          .from('push_subscriptions')
          .select('id, user_id, email, role, endpoint, p256dh, auth')
          .eq('is_active', true)
          .in('user_id', combinedUserIds)
          .limit(200);
        if (userError) throw new Error(userError.message || 'Unable to load user push subscriptions.');
        (userRows || []).forEach(row => {
          const id = normalizeString(row.id);
          if (!id || seenSubscriptionIds.has(id)) return;
          seenSubscriptionIds.add(id);
          fetchedRows.push(row as Record<string, unknown>);
        });
      }

      if (targetEmails.length > 0) {
        const { data: emailSubRows, error: emailSubError } = await adminClient
          .from('push_subscriptions')
          .select('id, user_id, email, role, endpoint, p256dh, auth')
          .eq('is_active', true)
          .in('email', targetEmails)
          .limit(500);
        if (emailSubError) throw new Error(emailSubError.message || 'Unable to load email push subscriptions.');
        (emailSubRows || []).forEach(row => {
          const id = normalizeString(row.id);
          if (!id || seenSubscriptionIds.has(id)) return;
          seenSubscriptionIds.add(id);
          fetchedRows.push(row as Record<string, unknown>);
        });
      }

      if (targetRoles.length > 0) {
        const { data: roleRows, error: roleError } = await adminClient
          .from('push_subscriptions')
          .select('id, user_id, email, role, endpoint, p256dh, auth')
          .eq('is_active', true)
          .limit(1000);
        if (roleError) throw new Error(roleError.message || 'Unable to load role push subscriptions.');
        (roleRows || []).forEach(row => {
          const id = normalizeString(row.id);
          const role = normalizeString(row.role).toLowerCase();
          if (!targetRoles.includes(role)) return;
          if (!id || seenSubscriptionIds.has(id)) return;
          seenSubscriptionIds.add(id);
          fetchedRows.push(row as Record<string, unknown>);
        });
      }

      subscriptions = fetchedRows
        .map(row => ({
          endpoint: String(row.endpoint || '').trim(),
          keys: {
            p256dh: String(row.p256dh || '').trim(),
            auth: String(row.auth || '').trim()
          }
        }))
        .filter(item => item.endpoint && item.keys.p256dh && item.keys.auth);
    }

    if (!subscriptions.length) {
      const noSubscriptionResult = {
        ok: false,
        attempted: 0,
        sent: 0,
        failed: 0,
        error: 'No active push subscriptions found',
        debug: {
          targetUserIds,
          targetRoles,
          targetSubscriptionIds,
          roleProfileIds,
          resource,
          isPrivileged: auth.isPrivileged,
          authUserId: auth.userId
        },
        payload
      };

      console.warn('[send-web-push-v2] no active subscriptions found', noSubscriptionResult.debug);

      if (adminClient) {
        await adminClient.from('push_notification_log').insert({
          sent_by: auth.userId || null,
          target_user_ids: targetUserIds,
          target_subscription_ids: targetSubscriptionIds,
          target_roles: targetRoles,
          allow_broadcast: allowBroadcast,
          attempted: 0,
          sent: 0,
          failed: 0,
          payload
        });
      }

      return new Response(JSON.stringify(noSubscriptionResult), {
        status: 404,
        headers: CORS_HEADERS
      });
    }

    const deliveryRows = await Promise.allSettled(
      subscriptions.map(subscription => webPush.sendNotification(subscription, JSON.stringify(payload)))
    );
    const attempted = deliveryRows.length;
    const sent = deliveryRows.filter(result => result.status === 'fulfilled').length;
    const failed = attempted - sent;

    for (let i = 0; i < deliveryRows.length; i += 1) {
      const result = deliveryRows[i];
      if (result.status !== 'rejected') continue;
      const statusCode = Number((result.reason as Record<string, unknown>)?.statusCode || 0);
      if (statusCode !== 404 && statusCode !== 410) continue;
      const endpoint = normalizeString(subscriptions[i]?.endpoint);
      if (!endpoint) continue;
      await adminClient?.from('push_subscriptions').update({ is_active: false, last_seen_at: new Date().toISOString() }).eq('endpoint', endpoint);
    }
    console.info('[send-web-push-v2] delivery result', {
      rows: subscriptions.length,
      attempted,
      sent,
      failed
    });

    if (adminClient) {
      await adminClient.from('push_notification_log').insert({
        sent_by: auth.userId || null,
        target_user_ids: targetUserIds,
        target_subscription_ids: targetSubscriptionIds,
        target_roles: targetRoles,
        allow_broadcast: allowBroadcast,
        attempted,
        sent,
        failed,
        payload
      });
    }

    return new Response(JSON.stringify({ ok: failed === 0, attempted, sent, failed, payload }), {
      headers: CORS_HEADERS
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String((error as Error)?.message || error || 'Unknown error') }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
