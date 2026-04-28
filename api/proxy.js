import { createClient } from '@supabase/supabase-js';

const RESOURCE_ALIASES = {
  operations_onboarding: ['operationsOnboarding', 'operations-onboarding']
};

const NOTIFICATION_RULE_DEFAULTS = [
  { resource: 'tickets', action: 'ticket_created', recipient_roles: ['admin', 'dev'] },
  { resource: 'tickets', action: 'ticket_high_priority', recipient_roles: ['admin', 'dev'] },
  { resource: 'tickets', action: 'ticket_status_changed', recipient_roles: ['admin'], users_from_record: ['requester_email'] },
  { resource: 'tickets', action: 'ticket_dev_team_status_changed', recipient_roles: ['admin'], users_from_record: ['requester_email'] },
  { resource: 'tickets', action: 'ticket_under_development', recipient_roles: ['dev'] },
  { resource: 'leads', action: 'lead_created', recipient_roles: ['admin', 'sales_executive'] },
  { resource: 'leads', action: 'lead_updated', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
  { resource: 'leads', action: 'lead_converted_to_deal', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
  { resource: 'deals', action: 'deal_created', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
  { resource: 'deals', action: 'deal_updated', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
  { resource: 'deals', action: 'deal_created_from_lead', recipient_roles: ['admin'], users_from_record: ['owner_email', 'created_by_email'] },
  { resource: 'deals', action: 'deal_important_stage', recipient_roles: ['admin'], users_from_record: ['owner_email'] },
  { resource: 'proposals', action: 'proposal_requires_approval', recipient_roles: ['financial_controller', 'gm'] },
  { resource: 'agreements', action: 'agreement_signed', recipient_roles: ['admin', 'accounting', 'hoo'] },
  { resource: 'technical_admin_requests', action: 'technical_request_submitted', recipient_roles: ['admin', 'dev', 'hoo'] },
  { resource: 'workflow', action: 'workflow_approval_requested', recipient_roles: ['financial_controller', 'gm'] }
];

const NOTIFICATION_RULE_COLUMNS = new Set([
  'id', 'resource', 'action', 'description', 'is_enabled', 'in_app_enabled', 'pwa_enabled', 'email_enabled',
  'recipient_roles', 'recipient_user_ids', 'recipient_emails', 'users_from_record', 'exclude_actor', 'dedupe_window_seconds'
]);

function parseRequestBody(body) {
  if (body && typeof body === 'object') return body;
  try {
    return typeof body === 'string' && body.trim() ? JSON.parse(body) : {};
  } catch {
    return body ?? {};
  }
}

function normalizeRole(value = '') {
  return String(value || '').trim().toLowerCase();
}

function getSupabaseAdminClient() {
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || req.headers.Authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

async function requireAuthenticatedAdmin(req, supabaseAdmin) {
  const accessToken = getBearerToken(req);
  if (!accessToken) return { ok: false, error: 'Forbidden: admin only', code: 'FORBIDDEN' };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user?.id) {
    return { ok: false, error: 'Forbidden: admin only', code: 'FORBIDDEN' };
  }

  const actorId = String(userData.user.id || '').trim();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role_key, email')
    .eq('id', actorId)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, error: 'Forbidden: admin only', code: 'FORBIDDEN' };
  }

  const role = normalizeRole(profile.role_key);
  console.log('[NotificationSettings] actor role', role);
  if (role !== 'admin') {
    return { ok: false, error: 'Forbidden: admin only', code: 'FORBIDDEN' };
  }

  return { ok: true, actor: { id: actorId, role, email: String(profile.email || '').trim().toLowerCase() } };
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

function normalizeStringArray(value = [], { lowercase = false, validator = null } = {}) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  source.forEach(item => {
    let text = String(item || '').trim();
    if (!text) return;
    if (lowercase) text = text.toLowerCase();
    if (typeof validator === 'function' && !validator(text)) return;
    if (seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
}

function sanitizeNotificationRule(input = {}) {
  const payload = input && typeof input === 'object' ? { ...input } : {};
  if ('enabled' in payload && !('is_enabled' in payload)) {
    payload.is_enabled = payload.enabled;
  }
  delete payload.enabled;

  const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
  const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

  const cleaned = {};
  NOTIFICATION_RULE_COLUMNS.forEach(column => {
    if (column in payload) cleaned[column] = payload[column];
  });

  const safeRule = {
    id: cleaned.id || undefined,
    resource: String(cleaned.resource || '').trim().toLowerCase(),
    action: String(cleaned.action || '').trim().toLowerCase(),
    description: String(cleaned.description || '').trim(),
    is_enabled: cleaned.is_enabled !== false,
    in_app_enabled: cleaned.in_app_enabled !== false,
    pwa_enabled: cleaned.pwa_enabled !== false,
    email_enabled: cleaned.email_enabled === true,
    recipient_roles: normalizeStringArray(cleaned.recipient_roles, { lowercase: true }),
    recipient_user_ids: normalizeStringArray(cleaned.recipient_user_ids, { validator: isUuid }),
    recipient_emails: normalizeStringArray(cleaned.recipient_emails, { lowercase: true, validator: isEmail }),
    users_from_record: normalizeStringArray(cleaned.users_from_record),
    exclude_actor: cleaned.exclude_actor !== false,
    dedupe_window_seconds: Math.max(1, Number(cleaned.dedupe_window_seconds || 60) || 60)
  };

  if (!safeRule.id) delete safeRule.id;
  return safeRule;
}

async function resolveRuleRecipients(supabaseAdmin, rule = {}, actor = null) {
  const recipientUserIds = new Set(Array.isArray(rule?.recipient_user_ids) ? rule.recipient_user_ids : []);
  const recipientEmails = new Set(Array.isArray(rule?.recipient_emails) ? rule.recipient_emails.map(v => String(v || '').trim().toLowerCase()) : []);
  const recipientRoles = Array.isArray(rule?.recipient_roles) ? rule.recipient_roles.map(v => normalizeRole(v)).filter(Boolean) : [];

  const needsProfileLookup = Boolean(recipientRoles.length || recipientEmails.size);
  if (needsProfileLookup) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id,email,role_key,is_active')
      .eq('is_active', true)
      .limit(5000);
    const rows = Array.isArray(profiles) ? profiles : [];
    rows.forEach(row => {
      const id = String(row.id || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const role = normalizeRole(row.role_key);
      if (!id) return;
      if (recipientRoles.includes(role)) recipientUserIds.add(id);
      if (email && recipientEmails.has(email)) recipientUserIds.add(id);
    });
  }

  if (rule?.exclude_actor !== false && actor?.id) recipientUserIds.delete(actor.id);
  return [...recipientUserIds].filter(Boolean);
}

async function handleNotificationSettings(req, res, payload) {
  const action = String(payload?.action || '').trim().toLowerCase();
  console.log('[NotificationSettings] action', action);

  const supabaseAdmin = getSupabaseAdminClient();
  const auth = await requireAuthenticatedAdmin(req, supabaseAdmin);
  if (!auth.ok) return res.status(403).json(auth);
  const actor = auth.actor;

  if (action === 'list') {
    const { data, error } = await supabaseAdmin.from('notification_rules').select('*').order('resource', { ascending: true }).order('action', { ascending: true });
    if (error) return res.status(500).json({ ok: false, error: `Unable to load notification settings: ${error.message}` });
    return res.status(200).json({ ok: true, rows: Array.isArray(data) ? data : [] });
  }

  if (action === 'upsert') {
    const input = payload?.rule && typeof payload.rule === 'object' ? payload.rule : payload;
    const rule = sanitizeNotificationRule(input);
    if (!rule.resource || !rule.action) {
      return res.status(400).json({ ok: false, error: 'resource and action are required.' });
    }
    console.log('[NotificationSettings] saving rule', { resource: rule.resource, action: rule.action });
    const { data, error } = await supabaseAdmin
      .from('notification_rules')
      .upsert(rule, { onConflict: 'resource,action' })
      .select('*')
      .single();
    if (error) return res.status(500).json({ ok: false, error: `Unable to save notification setting: ${error.message}` });
    return res.status(200).json({ ok: true, row: data });
  }

  if (action === 'bulk_upsert') {
    const rules = Array.isArray(payload?.rules) ? payload.rules : [];
    const cleanRules = rules.map(rule => sanitizeNotificationRule(rule)).filter(rule => rule.resource && rule.action);
    cleanRules.forEach(rule => {
      console.log('[NotificationSettings] saving rule', { resource: rule.resource, action: rule.action });
    });
    const { error } = await supabaseAdmin
      .from('notification_rules')
      .upsert(cleanRules, { onConflict: 'resource,action' });
    if (error) return res.status(500).json({ ok: false, error: `Unable to save notification setting: ${error.message}` });
    return res.status(200).json({ ok: true, count: cleanRules.length });
  }

  if (action === 'reset_defaults') {
    const defaults = NOTIFICATION_RULE_DEFAULTS.map(rule => sanitizeNotificationRule({
      ...rule,
      is_enabled: true,
      in_app_enabled: true,
      pwa_enabled: true,
      email_enabled: false,
      exclude_actor: true,
      dedupe_window_seconds: 60
    }));
    const { error } = await supabaseAdmin
      .from('notification_rules')
      .upsert(defaults, { onConflict: 'resource,action' });
    if (error) return res.status(500).json({ ok: false, error: `Unable to reset notification defaults: ${error.message}` });
    return res.status(200).json({ ok: true, count: defaults.length });
  }

  if (action === 'test_notification') {
    const input = payload?.rule && typeof payload.rule === 'object' ? payload.rule : payload;
    const selectedResource = String(input?.resource || '').trim().toLowerCase();
    const selectedAction = String(input?.action || '').trim().toLowerCase();
    if (!selectedResource || !selectedAction) {
      return res.status(400).json({ ok: false, error: 'resource and action are required.' });
    }

    const { data: existingRule, error: ruleError } = await supabaseAdmin
      .from('notification_rules')
      .select('*')
      .eq('resource', selectedResource)
      .eq('action', selectedAction)
      .maybeSingle();
    if (ruleError) return res.status(500).json({ ok: false, error: `Unable to load notification setting: ${ruleError.message}` });
    if (!existingRule) return res.status(404).json({ ok: false, error: 'Notification rule not found.' });

    const recipients = await resolveRuleRecipients(supabaseAdmin, existingRule, actor);
    if (!recipients.length) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'no_recipients' });
    }

    const rows = recipients.map(userId => ({
      recipient_user_id: userId,
      title: 'Test notification',
      message: `Test for ${selectedResource}:${selectedAction}`,
      type: selectedAction,
      resource: selectedResource,
      resource_id: 'test',
      status: 'unread',
      is_read: false,
      actor_user_id: actor.id,
      actor_role: actor.role,
      priority: 'normal',
      meta: { test: true, source: 'notification_settings' }
    }));

    const { error } = await supabaseAdmin.from('notifications').insert(rows);
    if (error) return res.status(500).json({ ok: false, error: `Unable to send test notification: ${error.message}` });
    return res.status(200).json({ ok: true, skipped: false, sent: rows.length, recipient_user_ids: recipients });
  }

  return res.status(400).json({ ok: false, error: `Unsupported notification_settings action: ${action || 'unknown'}` });
}

async function forwardToUpstream(targetUrl, payload) {
  const upstream = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });
  const raw = await upstream.text();
  const contentType = upstream.headers.get('content-type') || 'unknown';
  const { data, parsedJson } = parseJsonBody(raw);
  return { upstream, raw, contentType, data, parsedJson };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed. Use POST.' });
  }

  const payload = parseRequestBody(req.body);
  const resource = String(payload?.resource || '').trim();
  const action = String(payload?.action || '').trim();

  if (resource === 'notification_settings') {
    return handleNotificationSettings(req, res, payload);
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
    upstreamResult = await forwardToUpstream(targetUrl, payload);
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
        });
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
