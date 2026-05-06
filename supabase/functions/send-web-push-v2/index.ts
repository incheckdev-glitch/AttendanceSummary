import { createClient } from 'npm:@supabase/supabase-js@2';

const FUNCTION_VERSION = 'send-web-push-v2-cc-auth-final-20260506';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-incheck360-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'x-incheck360-function-version': FUNCTION_VERSION
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
  return String(value ?? '').trim();
}

function normalizeLower(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function normalizeResource(value: unknown) {
  return normalizeLower(value).replace(/[\s-]+/g, '_');
}

function uniqueList(...values: unknown[]): string[] {
  const out: string[] = [];
  const pushValue = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(pushValue);
      return;
    }
    if (typeof value === 'string' && value.includes(',')) {
      value.split(',').forEach(pushValue);
      return;
    }
    const normalized = normalizeString(value);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  };
  values.forEach(pushValue);
  return out;
}

function getRecord(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rowValue(row: Record<string, unknown>, key: string) {
  return normalizeString(row?.[key]);
}

function rowValueLower(row: Record<string, unknown>, key: string) {
  return rowValue(row, key).toLowerCase();
}

function getPayloadResource(input: Record<string, unknown>) {
  const data = getRecord(input, 'data');
  const metadata = getRecord(input, 'metadata');
  return normalizeResource(
    input.resource ||
    input.resource_key ||
    input.module ||
    data.resource ||
    data.resource_key ||
    data.module ||
    metadata.resource ||
    metadata.resource_key ||
    metadata.module
  );
}

function getPayloadAction(input: Record<string, unknown>) {
  const data = getRecord(input, 'data');
  const metadata = getRecord(input, 'metadata');
  return normalizeLower(
    input.action ||
    input.event_key ||
    input.type ||
    data.action ||
    data.event_key ||
    data.type ||
    metadata.action ||
    metadata.event_key ||
    metadata.type
  );
}

function getConversationId(input: Record<string, unknown>) {
  const data = getRecord(input, 'data');
  const metadata = getRecord(input, 'metadata');
  const candidates = [
    input.conversation_id,
    input.conversationId,
    input.record_id,
    input.resource_id,
    data.conversation_id,
    data.conversationId,
    data.record_id,
    data.resource_id,
    metadata.conversation_id,
    metadata.conversationId,
    metadata.record_id,
    metadata.resource_id
  ];
  for (const value of candidates) {
    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }
  return '';
}

function buildPushPayload(input: Record<string, unknown>) {
  const title = normalizeString(input.title) || 'InCheck360 MonitorCore';
  const body = normalizeString(input.body) || 'You have a new notification.';
  const url = normalizeString(input.url) || '/';
  const tag = normalizeString(input.tag) || `incheck360-${Date.now()}`;
  const data = getRecord(input, 'data');

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

function hasRole(payload: Record<string, unknown>, role: string) {
  const roleKey = normalizeLower(role);
  const appMetadata = getRecord(payload, 'app_metadata');
  const userMetadata = getRecord(payload, 'user_metadata');
  const appRole = normalizeLower(appMetadata.role || appMetadata.role_key);
  const profileRole = normalizeLower(userMetadata.role || userMetadata.role_key);
  const rolesFromMetadata = uniqueList(appMetadata.roles, userMetadata.roles).map(item => item.toLowerCase());
  return appRole === roleKey || profileRole === roleKey || rolesFromMetadata.includes(roleKey);
}

async function resolveAuthContext(req: Request) {
  const authorization = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const webhookHeader = req.headers.get('x-incheck360-webhook-secret') || '';
  const webhookSecretProvided = Boolean(webhookHeader && PUSH_WEBHOOK_SECRET && webhookHeader === PUSH_WEBHOOK_SECRET);
  const jwt = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';

  if (!jwt) {
    return {
      isAuthenticated: false,
      userId: '',
      email: '',
      profileRole: '',
      isPrivileged: webhookSecretProvided,
      authError: webhookSecretProvided ? '' : 'Missing Authorization bearer token.'
    };
  }

  if (!adminClient) {
    return {
      isAuthenticated: false,
      userId: '',
      email: '',
      profileRole: '',
      isPrivileged: false,
      authError: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    };
  }

  const { data, error } = await adminClient.auth.getUser(jwt);
  if (error || !data?.user) {
    return {
      isAuthenticated: false,
      userId: '',
      email: '',
      profileRole: '',
      isPrivileged: webhookSecretProvided,
      authError: error?.message || 'Invalid or expired access token.'
    };
  }

  const user = data.user;
  const userId = normalizeString(user.id);
  const email = normalizeLower(user.email);
  let profileRole = '';

  try {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role_key,role,email')
      .eq('id', userId)
      .maybeSingle();
    profileRole = normalizeLower((profile as Record<string, unknown> | null)?.role_key || (profile as Record<string, unknown> | null)?.role);
  } catch (_) {
    profileRole = '';
  }

  const privilegedByRole =
    hasRole(user as unknown as Record<string, unknown>, 'admin') ||
    hasRole(user as unknown as Record<string, unknown>, 'dev') ||
    profileRole === 'admin' ||
    profileRole === 'dev';

  return {
    isAuthenticated: true,
    userId,
    email,
    profileRole,
    isPrivileged: webhookSecretProvided || privilegedByRole,
    authError: ''
  };
}

function isCommunicationCentreResource(resource: string) {
  return ['communication_centre', 'communication_center', 'communication'].includes(resource);
}

function isAllowedSystemRolePush(input: Record<string, unknown>) {
  const resource = getPayloadResource(input);
  const allowedResources = new Set([
    'tickets',
    'events',
    'calendar_events',
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
    'communication_centre',
    'communication_center'
  ]);
  return allowedResources.has(resource);
}

function rowMatchesPushTarget(
  row: Record<string, unknown>,
  targetUserIds: string[],
  targetEmails: string[],
  targetRoles: string[],
  targetSubscriptionIds: string[]
) {
  const idTargets = targetUserIds.map(item => item.toLowerCase());
  const emailTargets = targetEmails.map(item => item.toLowerCase());
  const roleTargets = targetRoles.map(item => item.toLowerCase());
  const subscriptionTargets = targetSubscriptionIds.map(item => item.toLowerCase());

  const rowIdKeys = [
    'id',
    'subscription_id',
    'user_id',
    'profile_id',
    'auth_user_id',
    'auth_id',
    'supabase_user_id',
    'app_user_id',
    'owner_user_id',
    'recipient_user_id'
  ];
  const rowEmailKeys = ['email', 'user_email', 'recipient_email', 'profile_email'];
  const rowRoleKeys = ['role', 'role_key', 'recipient_role', 'profile_role'];

  if (subscriptionTargets.length && rowIdKeys.some(key => subscriptionTargets.includes(rowValueLower(row, key)))) return true;
  if (idTargets.length && rowIdKeys.some(key => idTargets.includes(rowValueLower(row, key)))) return true;
  if (emailTargets.length && rowEmailKeys.some(key => emailTargets.includes(rowValueLower(row, key)))) return true;
  if (roleTargets.length && rowRoleKeys.some(key => roleTargets.includes(rowValueLower(row, key)))) return true;
  return false;
}

async function validateCommunicationCentrePush(
  auth: Awaited<ReturnType<typeof resolveAuthContext>>,
  body: Record<string, unknown>,
  targetUserIds: string[],
  targetEmails: string[],
  targetRoles: string[]
) {
  const resource = getPayloadResource(body);
  const action = getPayloadAction(body);
  const conversationId = getConversationId(body);

  const baseDebug = {
    functionVersion: FUNCTION_VERSION,
    resource,
    action,
    conversationId,
    authUserId: auth.userId,
    authEmail: auth.email,
    authProfileRole: auth.profileRole,
    targetUserIds,
    targetEmails,
    targetRoles
  };

  if (!adminClient) return { allowed: false, reason: 'missing_admin_client', debug: baseDebug };
  if (!isCommunicationCentreResource(resource)) return { allowed: false, reason: 'not_communication_centre', debug: baseDebug };
  if (!auth.isAuthenticated || !auth.userId) return { allowed: false, reason: 'missing_authenticated_user', debug: baseDebug };
  if (!conversationId) return { allowed: false, reason: 'missing_conversation_id', debug: baseDebug };
  if (!targetUserIds.length && !targetEmails.length && !targetRoles.length) {
    return { allowed: false, reason: 'missing_targets', debug: baseDebug };
  }

  const { data: participantRows, error: participantError } = await adminClient
    .from('communication_centre_participants')
    .select('user_id, role_key, participant_type')
    .eq('conversation_id', conversationId)
    .limit(1000);

  if (participantError) {
    return { allowed: false, reason: participantError.message || 'participant_lookup_failed', debug: baseDebug };
  }

  const participants = (participantRows || []) as Array<Record<string, unknown>>;
  const participantUserIds = uniqueList(participants.map(row => row.user_id));
  const participantRoles = uniqueList(participants.map(row => row.role_key)).map(item => item.toLowerCase());

  let conversationCreatedBy = '';
  try {
    const { data: conversation } = await adminClient
      .from('communication_centre_conversations')
      .select('created_by, assigned_role')
      .eq('id', conversationId)
      .maybeSingle();
    conversationCreatedBy = normalizeString((conversation as Record<string, unknown> | null)?.created_by);
    const assignedRole = normalizeLower((conversation as Record<string, unknown> | null)?.assigned_role);
    if (assignedRole && !participantRoles.includes(assignedRole)) participantRoles.push(assignedRole);
  } catch (_) {
    conversationCreatedBy = '';
  }

  const actorIsParticipant =
    participantUserIds.includes(auth.userId) ||
    (conversationCreatedBy && conversationCreatedBy === auth.userId);

  if (!actorIsParticipant) {
    return {
      allowed: false,
      reason: 'actor_not_conversation_participant',
      debug: { ...baseDebug, participantUserIds, participantRoles, conversationCreatedBy }
    };
  }

  const participantEmails: string[] = [];
  if (participantUserIds.length > 0) {
    try {
      const { data: profileRows } = await adminClient
        .from('profiles')
        .select('id, email, role_key, role')
        .in('id', participantUserIds)
        .limit(1000);
      ((profileRows || []) as Array<Record<string, unknown>>).forEach(row => {
        const email = normalizeLower(row.email);
        const role = normalizeLower(row.role_key || row.role);
        if (email && !participantEmails.includes(email)) participantEmails.push(email);
        if (role && !participantRoles.includes(role)) participantRoles.push(role);
      });
    } catch (_) {
      // Email verification is best-effort. User-id participant verification remains the primary control.
    }
  }

  const targetUserIdsOk =
    !targetUserIds.length ||
    targetUserIds.every(id => participantUserIds.includes(id) || id === auth.userId || id === conversationCreatedBy);
  const targetEmailsOk =
    !targetEmails.length ||
    targetEmails.every(email => participantEmails.includes(email) || email === auth.email) ||
    targetUserIdsOk;
  const targetRolesOk =
    !targetRoles.length ||
    targetRoles.every(role => participantRoles.includes(role));

  // Most CC calls already include explicit user IDs and/or emails returned by notify_communication_centre_event.
  // Roles are not used for delivery below for CC, to avoid notifying every user in the same role globally.
  if (!targetUserIdsOk || !targetEmailsOk || (!targetUserIds.length && !targetEmails.length && !targetRolesOk)) {
    return {
      allowed: false,
      reason: 'targets_not_conversation_participants',
      debug: {
        ...baseDebug,
        participantUserIds,
        participantEmails,
        participantRoles,
        conversationCreatedBy,
        targetUserIdsOk,
        targetEmailsOk,
        targetRolesOk
      }
    };
  }

  return {
    allowed: true,
    reason: 'communication_centre_participant_push',
    debug: {
      ...baseDebug,
      participantCount: participantUserIds.length,
      participantUserIds,
      participantEmails,
      participantRoles
    }
  };
}

async function safeInsertPushLog(row: Record<string, unknown>) {
  if (!adminClient) return;
  try {
    await adminClient.from('push_notification_log').insert(row);
  } catch (error) {
    console.warn('[send-web-push-v2] push_notification_log insert skipped', String((error as Error)?.message || error));
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-incheck360-webhook-secret',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'x-incheck360-function-version': FUNCTION_VERSION
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed', version: FUNCTION_VERSION }), {
      status: 405,
      headers: CORS_HEADERS
    });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const auth = await resolveAuthContext(req);
    if (!auth.isAuthenticated && !auth.isPrivileged) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: auth.authError || 'Not authorized. Sign in first.',
          code: 'not_authorized',
          version: FUNCTION_VERSION
        }),
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const payload = buildPushPayload(body);
    const bodySubscription = body.subscription as Record<string, unknown> | undefined;
    const resource = getPayloadResource(body);
    const action = getPayloadAction(body);
    const isCcResource = isCommunicationCentreResource(resource);

    const targetUserIds = uniqueList(
      body.user_ids,
      body.target_user_ids,
      body.recipient_user_ids,
      body.targetUserIds,
      body.recipientUserIds
    );
    const targetSubscriptionIds = uniqueList(
      body.subscription_ids,
      body.target_subscription_ids,
      body.recipient_subscription_ids,
      body.subscriptionIds
    );
    const legacyUserId = normalizeString(body.user_id);
    const legacySubscriptionId = normalizeString(body.subscription_id);
    if (legacyUserId && !targetUserIds.includes(legacyUserId)) targetUserIds.push(legacyUserId);
    if (legacySubscriptionId && !targetSubscriptionIds.includes(legacySubscriptionId)) targetSubscriptionIds.push(legacySubscriptionId);

    let targetRoles = uniqueList(body.roles, body.target_roles, body.recipient_roles).map(item => item.toLowerCase());
    const targetEmails = uniqueList(body.emails, body.target_emails, body.recipient_emails, body.email).map(item => item.toLowerCase());
    const allowBroadcast = false;

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'VAPID keys are not configured',
          version: FUNCTION_VERSION,
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
    let ccValidation: Awaited<ReturnType<typeof validateCommunicationCentrePush>> | null = null;

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
          JSON.stringify({ ok: false, error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', version: FUNCTION_VERSION }),
          { status: 500, headers: CORS_HEADERS }
        );
      }

      if (!auth.isPrivileged) {
        ccValidation = await validateCommunicationCentrePush(auth, body, targetUserIds, targetEmails, targetRoles);

        if (!ccValidation.allowed) {
          if (targetRoles.length > 0 && !isAllowedSystemRolePush(body)) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: 'Not authorized. Role push is only allowed for approved system notification resources.',
                code: 'forbidden_targeting',
                version: FUNCTION_VERSION,
                debug: ccValidation.debug
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
                JSON.stringify({ ok: false, error: ownedError.message || 'Unable to validate subscription ownership.', version: FUNCTION_VERSION }),
                { status: 500, headers: CORS_HEADERS }
              );
            }
            const ownedIds = (ownedRows || []).map(row => normalizeString(row.id));
            targetsOwnSubscriptionsOnly =
              ownedIds.length === targetSubscriptionIds.length &&
              (ownedRows || []).every(row => normalizeString(row.user_id) === auth.userId);
          }

          const isAllowedSystemPush =
            !isCcResource &&
            isAllowedSystemRolePush(body) &&
            (targetRoles.length > 0 || targetUserIds.length > 0 || targetEmails.length > 0);

          if (!targetsOwnUserOnly && !targetsOwnSubscriptionsOnly && !isAllowedSystemPush) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: isCcResource
                  ? 'Not authorized. Communication Centre push requires the sender and recipients to belong to the conversation.'
                  : 'Not authorized. Authenticated users may only send test pushes to their own user/subscription or approved system pushes.',
                code: isCcResource ? 'forbidden_cc_conversation_targeting' : 'forbidden_self_target_only',
                version: FUNCTION_VERSION,
                debug: ccValidation.debug
              }),
              { status: 403, headers: CORS_HEADERS }
            );
          }
        }
      }

      // Important: Communication Centre sends explicit user IDs/emails. Do not deliver by role,
      // otherwise every user with the same role may receive a private chat notification.
      if (isCcResource) {
        targetRoles = [];
      }

      console.info('[send-web-push-v2] resolving subscriptions', {
        version: FUNCTION_VERSION,
        targetUserIds,
        targetEmails,
        targetRoles,
        targetSubscriptionIds,
        resource,
        action,
        isPrivileged: auth.isPrivileged,
        authUserId: auth.userId,
        ccValidation: ccValidation?.reason || null
      });

      if (!targetUserIds.length && !targetRoles.length && !targetSubscriptionIds.length && !targetEmails.length) {
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: 'no-target', version: FUNCTION_VERSION }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      roleProfileIds = [];
      if (targetRoles.length > 0) {
        const { data: profileRows, error: profileError } = await adminClient
          .from('profiles')
          .select('id, role_key')
          .eq('is_active', true)
          .limit(1000);
        if (profileError) throw new Error(profileError.message || 'Unable to load role profiles.');
        (profileRows || []).forEach(row => {
          const roleKey = normalizeLower(row.role_key);
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
          const id = normalizeString(row.id) || normalizeString(row.endpoint);
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
          .limit(500);
        if (userError) throw new Error(userError.message || 'Unable to load user push subscriptions.');
        (userRows || []).forEach(row => {
          const id = normalizeString(row.id) || normalizeString(row.endpoint);
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
          const id = normalizeString(row.id) || normalizeString(row.endpoint);
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
          const id = normalizeString(row.id) || normalizeString(row.endpoint);
          const role = normalizeLower(row.role);
          if (!targetRoles.includes(role)) return;
          if (!id || seenSubscriptionIds.has(id)) return;
          seenSubscriptionIds.add(id);
          fetchedRows.push(row as Record<string, unknown>);
        });
      }

      // Fallback: active subscription rows can use different ID/email column names across older migrations.
      if (targetUserIds.length > 0 || targetEmails.length > 0 || targetRoles.length > 0 || targetSubscriptionIds.length > 0) {
        const { data: allActiveRows, error: allActiveError } = await adminClient
          .from('push_subscriptions')
          .select('*')
          .eq('is_active', true)
          .limit(5000);
        if (allActiveError) throw new Error(allActiveError.message || 'Unable to load active push subscriptions fallback.');
        (allActiveRows || []).forEach(row => {
          const normalizedRow = row as Record<string, unknown>;
          if (!rowMatchesPushTarget(normalizedRow, targetUserIds, targetEmails, targetRoles, targetSubscriptionIds)) return;
          const id = normalizeString(normalizedRow.id) || normalizeString(normalizedRow.endpoint);
          if (!id || seenSubscriptionIds.has(id)) return;
          seenSubscriptionIds.add(id);
          fetchedRows.push(normalizedRow);
        });
      }

      subscriptions = fetchedRows
        .map(row => ({
          endpoint: normalizeString(row.endpoint),
          keys: {
            p256dh: normalizeString(row.p256dh),
            auth: normalizeString(row.auth)
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
        version: FUNCTION_VERSION,
        debug: {
          targetUserIds,
          targetEmails,
          targetRoles,
          targetSubscriptionIds,
          roleProfileIds,
          resource,
          action,
          isPrivileged: auth.isPrivileged,
          authUserId: auth.userId,
          ccValidation: ccValidation?.debug || null
        },
        payload
      };

      console.warn('[send-web-push-v2] no active subscriptions found', noSubscriptionResult.debug);

      await safeInsertPushLog({
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
      const reason = result.reason as Record<string, unknown>;
      const statusCode = Number(reason?.statusCode || 0);
      if (statusCode !== 404 && statusCode !== 410) continue;
      const endpoint = normalizeString(subscriptions[i]?.endpoint);
      if (!endpoint) continue;
      await adminClient?.from('push_subscriptions').update({ is_active: false, last_seen_at: new Date().toISOString() }).eq('endpoint', endpoint);
    }

    console.info('[send-web-push-v2] delivery result', {
      version: FUNCTION_VERSION,
      rows: subscriptions.length,
      attempted,
      sent,
      failed,
      resource,
      action
    });

    await safeInsertPushLog({
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

    return new Response(
      JSON.stringify({
        ok: failed === 0,
        attempted,
        sent,
        failed,
        version: FUNCTION_VERSION,
        payload
      }),
      { status: failed === 0 ? 200 : 207, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[send-web-push-v2] error', error);
    return new Response(
      JSON.stringify({ ok: false, error: String((error as Error)?.message || error || 'Unknown error'), version: FUNCTION_VERSION }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
