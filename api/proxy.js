import { createClient } from '@supabase/supabase-js';

const RESOURCE_ALIASES = {
  operations_onboarding: ['operationsOnboarding', 'operations-onboarding']
};

const USER_MANAGEMENT_ROLES = new Set(['admin', 'dev', 'developer', 'user_management', 'user-management', 'users_manage']);

function parseRequestBody(body) {
  if (body && typeof body === 'object') return body;
  try {
    return typeof body === 'string' && body.trim() ? JSON.parse(body) : {};
  } catch {
    return body ?? {};
  }
}

function parseJsonBody(raw) {
  try {
    return {
      data: raw ? JSON.parse(raw) : {},
      parsedJson: true
    };
  } catch {
    return {
      data: null,
      parsedJson: false
    };
  }
}

function needsResourceAliasRetry(resource, responseData) {
  if (!resource || !RESOURCE_ALIASES[resource]) return false;
  if (!responseData || typeof responseData !== 'object') return false;
  const code = String(responseData.code || '').trim();
  const status = String(responseData.status || '').trim().toLowerCase();
  const message = String(responseData.message || responseData.error || '').trim().toLowerCase();
  return (
    code === 'UNHANDLED_ERROR' &&
    (status === 'error' || status === 'failed' || message.includes('handler is not loaded'))
  );
}

async function forwardToUpstream(targetUrl, payload, authorization = "") {
  const upstream = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
      ...(authorization ? { Authorization: authorization } : {})
    },
    body: JSON.stringify(payload)
  });
  const raw = await upstream.text();
  const contentType = upstream.headers.get('content-type') || 'unknown';
  const { data, parsedJson } = parseJsonBody(raw);
  return { upstream, raw, contentType, data, parsedJson };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function extractBearerToken(req, payload = {}) {
  const authHeader = String(
    req.headers?.authorization ||
    req.headers?.Authorization ||
    ''
  ).trim();
  const headerToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  const altHeaderToken = String(
    req.headers?.['x-supabase-access-token'] ||
    req.headers?.['X-Supabase-Access-Token'] ||
    ''
  ).trim();

  const payloadToken = String(
    payload?.session_access_token ||
    payload?.access_token ||
    payload?.accessToken ||
    ''
  ).trim();

  return headerToken || altHeaderToken || payloadToken;
}

async function getCallerProfile(supabaseAdmin, authUserId, email = '') {
  const userResult = await supabaseAdmin
    .from('users')
    .select('id, auth_user_id, email, role, role_key')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (!userResult.error && userResult.data) {
    return userResult.data;
  }

  if (email) {
    const userByEmailResult = await supabaseAdmin
      .from('users')
      .select('id, auth_user_id, email, role, role_key')
      .ilike('email', email)
      .maybeSingle();

    if (!userByEmailResult.error && userByEmailResult.data) {
      return userByEmailResult.data;
    }
  }

  const profileResult = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, role_key')
    .eq('id', authUserId)
    .maybeSingle();

  if (!profileResult.error && profileResult.data) {
    return profileResult.data;
  }

  if (email) {
    const profileByEmailResult = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, role_key')
      .ilike('email', email)
      .maybeSingle();

    if (!profileByEmailResult.error && profileByEmailResult.data) {
      return profileByEmailResult.data;
    }
  }

  return null;
}

async function updatePublicUserRow(supabaseAdmin, payload, targetAuthUserId, updateDoc) {
  const rowId = String(payload?.id || payload?.user_id || '').trim();
  const authIdCandidates = [
    targetAuthUserId,
    String(payload?.auth_user_id || '').trim(),
    String(payload?.authUserId || '').trim()
  ].filter(Boolean);

  for (const candidate of authIdCandidates) {
    let authUpdate = await supabaseAdmin.from('users').update(updateDoc).eq('auth_user_id', candidate);
    if (!authUpdate.error) return { table: 'users', by: 'auth_user_id' };

    authUpdate = await supabaseAdmin.from('profiles').update(updateDoc).eq('id', candidate);
    if (!authUpdate.error) return { table: 'profiles', by: 'id' };
  }

  if (rowId) {
    let idUpdate = await supabaseAdmin.from('users').update(updateDoc).eq('id', rowId);
    if (!idUpdate.error) return { table: 'users', by: 'id' };

    idUpdate = await supabaseAdmin.from('profiles').update(updateDoc).eq('id', rowId);
    if (!idUpdate.error) return { table: 'profiles', by: 'id' };
  }

  return null;
}

async function handleSupabaseAdminRequest(req, res, payload) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      ok: false,
      error: 'Server configuration error: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
    });
  }

  const hasPayloadToken = Boolean(
    payload?.session_access_token ||
    payload?.access_token ||
    payload?.accessToken
  );
  const token = extractBearerToken(req, payload);
  delete payload.session_access_token;
  delete payload.access_token;
  delete payload.accessToken;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Your session expired. Please log in again.' });
  }

  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    return res.status(500).json({ ok: false, error: 'Server configuration error: missing SUPABASE_ANON_KEY.' });
  }

  const supabaseUserClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await supabaseUserClient.auth.getUser(token);
  if (authError || !authData?.user) {
    console.warn('[users admin] bearer token verification failed', {
      hasAuthorizationHeader: Boolean(req.headers?.authorization),
      hasAltTokenHeader: Boolean(req.headers?.['x-supabase-access-token']),
      hasPayloadToken,
      authError: authError?.message || null
    });
    return res.status(401).json({ ok: false, error: 'Your session expired. Please log in again.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const callerProfile = await getCallerProfile(supabaseAdmin, authData.user.id, authData.user.email || '');
  if (!callerProfile) {
    return res.status(403).json({
      ok: false,
      error: 'Your user profile was not found. Please contact an administrator.'
    });
  }
  const callerRole = String(callerProfile.role_key || callerProfile.role || '').trim().toLowerCase();
  if (!USER_MANAGEMENT_ROLES.has(callerRole)) {
    return res.status(403).json({ ok: false, error: 'You do not have permission to edit users.' });
  }

  const normalizedAction = String(payload?.action || '').trim();
  if (normalizedAction !== 'update') {
    return res.status(400).json({ ok: false, error: `Unsupported users action: ${normalizedAction || 'unknown'}.` });
  }

  const source = payload?.updates && typeof payload.updates === 'object' ? payload.updates : payload;
  const targetAuthUserId = String(
    payload?.auth_user_id || payload?.authUserId || payload?.auth_id || payload?.authId || ''
  ).trim();

  if (!targetAuthUserId || !isUuid(targetAuthUserId)) {
    return res.status(400).json({ ok: false, error: 'Cannot update auth user because auth_user_id is missing.' });
  }

  const currentAuthUser = await supabaseAdmin.auth.admin.getUserById(targetAuthUserId);
  const currentEmail = String(currentAuthUser?.data?.user?.email || '').trim().toLowerCase();
  const email = String(source?.email || '').trim();
  const name = String(source?.name || '').trim();
  const fullName = String(source?.full_name || '').trim();
  const roleKey = String(source?.role_key || source?.role || '').trim();
  const department = String(source?.department || '').trim();
  const password = source?.password;

  const authUpdate = {
    user_metadata: {
      ...(name ? { name } : {}),
      ...(fullName ? { full_name: fullName } : {}),
      ...(roleKey ? { role: roleKey, role_key: roleKey } : {}),
      ...(department ? { department } : {})
    }
  };

  if (email && email.toLowerCase() !== currentEmail) authUpdate.email = email;
  if (password && String(password).trim()) authUpdate.password = String(password).trim();

  const { data: updatedAuthUser, error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(targetAuthUserId, authUpdate);
  if (authUpdateError) {
    return res.status(400).json({ ok: false, error: `Unable to update auth user: ${authUpdateError.message}` });
  }

  const publicUpdate = {
    updated_at: new Date().toISOString(),
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    ...(fullName ? { full_name: fullName } : {}),
    ...(roleKey ? { role: roleKey, role_key: roleKey } : {}),
    ...(department ? { department } : {}),
    ...(typeof source?.is_active === 'boolean' ? { is_active: source.is_active } : {})
  };

  const updatedPublicRow = await updatePublicUserRow(supabaseAdmin, payload, targetAuthUserId, publicUpdate);

  return res.status(200).json({
    ok: true,
    data: updatedAuthUser?.user || null,
    updatedPublicRow
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed. Use POST.' });
  }

  const payload = parseRequestBody(req.body);
  const authorization = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
  const resource = String(payload?.resource || '').trim();
  const action = String(payload?.action || '').trim();

  if (resource === 'users' || resource === 'roles' || resource === 'role_permissions') {
    return handleSupabaseAdminRequest(req, res, payload);
  }

  const targetUrl = String(
    process.env.API_PROXY_TARGET_URL ||
    process.env.SUPABASE_SERVICE_PROXY_URL ||
    process.env.BACKEND_API_URL || ''
  ).trim();

  if (!targetUrl) {
    return res.status(500).json({
      ok: false,
      error: 'Server is missing API_PROXY_TARGET_URL.',
      targetUrl
    });
  }

  res.setHeader('X-Upstream-Target', targetUrl);

  console.log('[proxy] forwarding request', {
    targetUrl,
    resource,
    action
  });

  let upstreamResult;
  try {
    upstreamResult = await forwardToUpstream(targetUrl, payload, authorization);
  } catch (error) {
    console.error('[proxy] upstream fetch failed', {
      targetUrl,
      resource,
      action,
      error: String(error?.message || error)
    });
    return res.status(502).json({
      ok: false,
      error: 'Failed to reach upstream backend',
      upstreamStatus: 502,
      targetUrl,
      details: String(error?.message || error)
    });
  }

  let attemptedAlias = null;
  if (
    upstreamResult.parsedJson &&
    needsResourceAliasRetry(resource, upstreamResult.data)
  ) {
    const aliases = RESOURCE_ALIASES[resource];
    for (const alias of aliases) {
      try {
        const aliasResult = await forwardToUpstream(targetUrl, {
          ...payload,
          resource: alias
        }, authorization);
        attemptedAlias = alias;
        upstreamResult = aliasResult;
        if (aliasResult.upstream.ok || (aliasResult.parsedJson && !needsResourceAliasRetry(resource, aliasResult.data))) {
          break;
        }
      } catch (error) {
        console.warn('[proxy] alias retry failed', {
          targetUrl,
          originalResource: resource,
          alias,
          action,
          error: String(error?.message || error)
        });
      }
    }
  }

  console.log('[proxy] upstream response', {
    targetUrl,
    resource,
    action,
    upstreamStatus: upstreamResult.upstream.status,
    contentType: upstreamResult.contentType,
    parsedJson: upstreamResult.parsedJson,
    attemptedAlias
  });

  if (!upstreamResult.parsedJson) {
    return res.status(upstreamResult.upstream.status || 502).json({
      ok: false,
      error: 'Upstream backend returned invalid JSON',
      upstreamStatus: upstreamResult.upstream.status || 502,
      targetUrl,
      contentType: upstreamResult.contentType,
      upstreamBodySample: String(upstreamResult.raw || '').slice(0, 500),
      resource,
      action,
      attemptedAlias
    });
  }

  return res.status(upstreamResult.upstream.status).json(upstreamResult.data);
}
