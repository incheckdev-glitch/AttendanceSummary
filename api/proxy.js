import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const RESOURCE_ALIASES = {
  operations_onboarding: ['operationsOnboarding', 'operations-onboarding']
};

const USER_MANAGEMENT_ROLES = new Set(['admin', 'administrator', 'super_admin']);
const DEFAULT_BOOTSTRAP_ADMIN_EMAILS = new Set(['khaled.yakan@incheck360.nl']);

function parseEmailList(value = '') {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getBootstrapAdminEmails() {
  const configured = [
    ...parseEmailList(process.env.USER_MANAGEMENT_ADMIN_EMAILS),
    ...parseEmailList(process.env.ADMIN_EMAILS),
    ...parseEmailList(process.env.BOOTSTRAP_ADMIN_EMAILS)
  ];

  return new Set([
    ...DEFAULT_BOOTSTRAP_ADMIN_EMAILS,
    ...configured
  ]);
}

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


function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function getFirstNormalizedRole(...values) {
  for (const value of values) {
    const normalized = normalizeRole(value);
    if (normalized) return normalized;
  }
  return '';
}

function getCallerRole(profile = null, verifiedUser = null) {
  return getFirstNormalizedRole(
    profile?.role_key,
    profile?.roleKey,
    profile?.role,
    profile?.user_role,
    profile?.userRole,
    profile?.app_role,
    profile?.appRole,
    verifiedUser?.user_metadata?.role_key,
    verifiedUser?.user_metadata?.roleKey,
    verifiedUser?.user_metadata?.role,
    verifiedUser?.user_metadata?.user_role,
    verifiedUser?.user_metadata?.app_role,
    verifiedUser?.app_metadata?.role_key,
    verifiedUser?.app_metadata?.roleKey,
    verifiedUser?.app_metadata?.role,
    verifiedUser?.app_metadata?.user_role,
    verifiedUser?.app_metadata?.app_role
  );
}

function isAdminRole(role) {
  return USER_MANAGEMENT_ROLES.has(normalizeRole(role));
}

function isBootstrapAdminEmail(email = '') {
  const normalized = String(email || '').trim().toLowerCase();
  return Boolean(normalized && getBootstrapAdminEmails().has(normalized));
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

async function findProfileByMatchers(supabaseAdmin, tableName, selectors) {
  for (const selector of selectors) {
    if (!selector.value) continue;
    const query = supabaseAdmin
      .from(tableName)
      .select('*');

    const result = selector.op === 'ilike'
      ? await query.ilike(selector.column, selector.value).maybeSingle()
      : await query.eq(selector.column, selector.value).maybeSingle();

    if (!result.error && result.data) {
      return result.data;
    }
  }

  return null;
}

async function getCallerProfile(supabaseAdmin, authUserId, email = '') {
  const callerAuthUserId = String(authUserId || '').trim();
  const callerEmail = String(email || '').trim();

  const canMatchId = isUuid(callerAuthUserId);
  if (canMatchId && callerEmail) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .or(`id.eq.${callerAuthUserId},email.eq.${callerEmail}`)
      .maybeSingle();

    if (!error && data) return data;
  }

  if (canMatchId) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', callerAuthUserId)
      .maybeSingle();

    if (!error && data) return data;
  }

  if (callerEmail) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .ilike('email', callerEmail)
      .maybeSingle();

    if (!error && data) return data;
  }

  return null;
}


function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim().toLowerCase());
}

async function sendEmailNotification({ to, subject, html, text }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !port || !user || !pass || !from) {
    throw new Error('Missing SMTP configuration.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    requireTLS: port !== 465
  });

  return transporter.sendMail({ from, to, subject, html, text });
}

function getMissingColumnName(error) {
  const message = String(error?.message || error?.details || '').trim();
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "?([a-zA-Z0-9_]+)"? of relation/i,
    /column "?([a-zA-Z0-9_]+)"? does not exist/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}

async function runUpdateWithSchemaRetry(label, updateDoc, runUpdate) {
  const doc = { ...(updateDoc || {}) };
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await runUpdate(doc);
    if (!result?.error) return { ok: true, result, strippedColumns: attempt ? Object.keys(updateDoc).filter((key) => !(key in doc)) : [] };

    lastError = result.error;
    const missingColumn = getMissingColumnName(result.error);
    if (!missingColumn || !(missingColumn in doc)) break;

    delete doc[missingColumn];
  }

  console.warn('[users admin] profile update skipped/failed', {
    label,
    error: lastError?.message || String(lastError || '')
  });

  return { ok: false, error: lastError };
}

async function updatePublicUserRow(supabaseAdmin, payload, targetAuthUserId, updateDoc) {
  const rowId = String(payload?.id || payload?.user_id || '').trim();
  const email = String(updateDoc?.email || payload?.email || payload?.updates?.email || '').trim();
  const authIdCandidates = [
    targetAuthUserId,
    String(payload?.auth_user_id || '').trim(),
    String(payload?.authUserId || '').trim(),
    rowId
  ].filter(Boolean);

  // This project uses public.profiles as the app user table. Try it first.
  for (const candidate of authIdCandidates) {
    if (!isUuid(candidate)) continue;
    const profileById = await runUpdateWithSchemaRetry(
      'profiles.id',
      updateDoc,
      (doc) => supabaseAdmin.from('profiles').update(doc).eq('id', candidate).select('id').maybeSingle()
    );
    if (profileById.ok) return { table: 'profiles', by: 'id' };
  }

  if (email) {
    const profileByEmail = await runUpdateWithSchemaRetry(
      'profiles.email',
      updateDoc,
      (doc) => supabaseAdmin.from('profiles').update(doc).ilike('email', email).select('id').maybeSingle()
    );
    if (profileByEmail.ok) return { table: 'profiles', by: 'email' };
  }

  // Optional legacy fallback. Ignore missing public.users because this project may not have it.
  for (const candidate of authIdCandidates) {
    const legacyByAuth = await runUpdateWithSchemaRetry(
      'users.auth_user_id',
      updateDoc,
      (doc) => supabaseAdmin.from('users').update(doc).eq('auth_user_id', candidate).select('id').maybeSingle()
    );
    if (legacyByAuth.ok) return { table: 'users', by: 'auth_user_id' };
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
  console.warn('[users admin] token extraction debug', {
    hasAuthorizationHeader: Boolean(req.headers?.authorization || req.headers?.Authorization),
    hasAltTokenHeader: Boolean(req.headers?.['x-supabase-access-token']),
    hasPayloadToken: Boolean(payload?.session_access_token),
    tokenLength: token ? token.length : 0,
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  });

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
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let verifiedUser = null;
  let verifyError = null;

  try {
    const anonResult = await supabaseUserClient.auth.getUser(token);
    verifiedUser = anonResult?.data?.user || null;
    verifyError = anonResult?.error || null;
  } catch (error) {
    verifyError = error;
  }

  if (!verifiedUser) {
    try {
      const adminResult = await supabaseAdmin.auth.getUser(token);
      verifiedUser = adminResult?.data?.user || null;
      verifyError = adminResult?.error || verifyError;
    } catch (error) {
      verifyError = error;
    }
  }

  if (!verifiedUser) {
    console.warn('[users admin] token verification failed', {
      hasAuthorizationHeader: Boolean(req.headers?.authorization || req.headers?.Authorization),
      hasAltTokenHeader: Boolean(req.headers?.['x-supabase-access-token']),
      hasPayloadToken: Boolean(payload?.session_access_token),
      tokenLength: token ? token.length : 0,
      authError: verifyError?.message || null
    });
    return res.status(401).json({
      ok: false,
      error: `Your session expired. Please log in again. ${verifyError?.message || ''}`.trim()
    });
  }

  delete payload.session_access_token;
  delete payload.access_token;
  delete payload.accessToken;

  const callerAuthUserId = verifiedUser.id;
  const callerEmail = String(verifiedUser.email || '').trim().toLowerCase();
  const bootstrapAdmin = isBootstrapAdminEmail(callerEmail);
  const callerProfile = await getCallerProfile(supabaseAdmin, callerAuthUserId, callerEmail || '');

  if (!callerProfile && !bootstrapAdmin) {
    return res.status(403).json({
      ok: false,
      error: 'Your user profile was not found. Please contact an administrator.'
    });
  }

  const callerRole = getCallerRole(callerProfile, verifiedUser) || (bootstrapAdmin ? 'admin' : '');

  const isActive = !callerProfile || (
    callerProfile.is_active !== false &&
    callerProfile.isActive !== false &&
    callerProfile.active !== false
  );

  console.warn('[users admin] permission check', {
    callerAuthUserId,
    callerEmail,
    foundProfile: Boolean(callerProfile),
    role: callerRole,
    isActive,
    bootstrapAdmin
  });

  if (!isActive) {
    return res.status(403).json({
      ok: false,
      error: 'Your user account is inactive.'
    });
  }

  if (!isAdminRole(callerRole) && !bootstrapAdmin) {
    return res.status(403).json({
      ok: false,
      error: `Forbidden: admin access is required. Current role: ${callerRole || 'none'}`
    });
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


  if (resource === 'notifications' && (action === 'send_email' || action === 'test_email')) {
    const token = extractBearerToken(req, payload);
    if (!token) return res.status(401).json({ ok: false, error: 'Missing access token.' });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ ok: false, error: 'Server is missing Supabase admin configuration.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: verified, error: verifiedError } = await supabaseAdmin.auth.getUser(token);
    if (verifiedError || !verified?.user) return res.status(401).json({ ok: false, error: 'Invalid or expired session.' });
    const callerRole = getCallerRole(await getCallerProfile(supabaseAdmin, verified.user.id, verified.user.email || ''), verified.user);
    if (action === 'test_email' && !isAdminRole(callerRole)) return res.status(403).json({ ok: false, error: 'Admin role required.' });

    const recipients = Array.isArray(payload?.to) ? payload.to : String(payload?.to || '').split(',');
    const normalizedTo = [...new Set(recipients.map((item) => String(item || '').trim().toLowerCase()).filter(isValidEmail))];
    if (!normalizedTo.length) return res.status(400).json({ ok: false, error: 'no_email_recipients_resolved' });

    try {
      const result = await sendEmailNotification({
        to: normalizedTo.join(', '),
        subject: String(payload?.subject || 'InCheck360 Notification').trim() || 'InCheck360 Notification',
        html: String(payload?.html || '').trim(),
        text: String(payload?.text || '').trim()
      });
      return res.status(200).json({ ok: true, messageId: result?.messageId || null, recipientsCount: normalizedTo.length });
    } catch (error) {
      return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
  }

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
