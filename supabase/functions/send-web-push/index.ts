import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@incheck360.com';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

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
  const webhookHeader = req.headers.get('x-webhook-secret') || '';
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

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
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
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    const payload = buildPushPayload(body);
    const bodySubscription = body.subscription as webpush.PushSubscription | undefined;
    const targetUserIds = uniqueList(body.user_ids);
    const targetSubscriptionIds = uniqueList(body.subscription_ids);
    const legacyUserId = normalizeString(body.user_id);
    const legacySubscriptionId = normalizeString(body.subscription_id);
    if (legacyUserId && !targetUserIds.includes(legacyUserId)) targetUserIds.push(legacyUserId);
    if (legacySubscriptionId && !targetSubscriptionIds.includes(legacySubscriptionId)) targetSubscriptionIds.push(legacySubscriptionId);
    const targetRoles = uniqueList(body.roles).map(item => item.toLowerCase());
    const allowBroadcast = body.allow_broadcast === true;

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({
          error: 'VAPID keys are not configured',
          payload
        }),
        { status: 500 }
      );
    }

    let subscriptions: webpush.PushSubscription[] = [];

    if (bodySubscription?.endpoint) {
      subscriptions = [bodySubscription];
    } else {
      if (!adminClient) {
        return new Response(
          JSON.stringify({ error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        );
      }
      if (!auth.isPrivileged) {
        const hasRestrictedFields = allowBroadcast || targetRoles.length > 0;
        if (hasRestrictedFields) {
          return new Response(
            JSON.stringify({
              error: 'Not authorized. Only admin/dev/webhook may target roles or broadcast.',
              code: 'forbidden_targeting'
            }),
            { status: 403, headers: { 'content-type': 'application/json' } }
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
              { status: 500, headers: { 'content-type': 'application/json' } }
            );
          }
          const ownedIds = (ownedRows || []).map(row => normalizeString(row.id));
          targetsOwnSubscriptionsOnly =
            ownedIds.length === targetSubscriptionIds.length &&
            (ownedRows || []).every(row => normalizeString(row.user_id) === auth.userId);
        }
        if (!targetsOwnUserOnly && !targetsOwnSubscriptionsOnly) {
          return new Response(
            JSON.stringify({
              error: 'Not authorized. Authenticated users may only send test pushes to their own user_id/subscription_id.',
              code: 'forbidden_self_target_only'
            }),
            { status: 403, headers: { 'content-type': 'application/json' } }
          );
        }
      }

      let query = adminClient
        .from('push_subscriptions')
        .select('id, user_id, role, endpoint, p256dh, auth')
        .eq('is_active', true);
      if (targetSubscriptionIds.length > 0) query = query.in('id', targetSubscriptionIds);
      if (targetUserIds.length > 0) query = query.in('user_id', targetUserIds);
      if (targetRoles.length > 0) query = query.in('role', targetRoles);

      const { data: rows, error: fetchError } = await query.limit(50);
      if (fetchError) throw new Error(fetchError.message || 'Unable to load push subscriptions.');
      subscriptions = (rows || [])
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
      return new Response(
        JSON.stringify({
          ok: false,
          attempted: 0,
          sent: 0,
          failed: 0,
          error: 'No active push subscriptions found',
          payload
        }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    const results = await Promise.allSettled(
      subscriptions.map(subscription => webpush.sendNotification(subscription, JSON.stringify(payload)))
    );
    const attempted = results.length;
    const sent = results.filter(result => result.status === 'fulfilled').length;
    const failed = attempted - sent;

    return new Response(JSON.stringify({ ok: failed === 0, attempted, sent, failed, payload }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String((error as Error)?.message || error || 'Unknown error') }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
});
