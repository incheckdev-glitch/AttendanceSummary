import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const EMAIL_FUNCTION_SECRET = Deno.env.get('INCHECK360_EMAIL_WEBHOOK_SECRET') || '';
const APPROVAL_EMAIL_FALLBACK_TO = Deno.env.get('APPROVAL_EMAIL_FALLBACK_TO') || 'Khaled.yakan@incheck360.nl';
const EMAIL_LOG_TABLE = Deno.env.get('WORKFLOW_APPROVAL_EMAIL_LOG_TABLE') || 'workflow_email_logs';

const adminClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      })
    : null;

function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeRoleList(...values: unknown[]) {
  const found = values.find(value => value !== undefined && value !== null && (Array.isArray(value) || normalizeString(value) !== ''));
  if (Array.isArray(found)) {
    return found
      .map(item => normalizeString(item).toLowerCase())
      .filter(Boolean);
  }
  return normalizeString(found)
    .split(',')
    .map(item => normalizeString(item).toLowerCase())
    .filter(Boolean);
}

function uniqueRecipients(items: Array<{ email: string; name?: string }>) {
  const seen = new Set<string>();
  const out: Array<{ email: string; name?: string }> = [];
  items.forEach(item => {
    const email = normalizeString(item?.email).toLowerCase();
    if (!email || seen.has(email)) return;
    seen.add(email);
    out.push({ email, name: normalizeString(item?.name) || undefined });
  });
  return out;
}

function parseFallbackRecipients() {
  const raw = normalizeString(APPROVAL_EMAIL_FALLBACK_TO);
  if (!raw) return [] as Array<{ email: string; name?: string }>;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .map(entry => {
          if (typeof entry === 'string') return { email: normalizeString(entry), name: '' };
          if (entry && typeof entry === 'object') {
            const candidate = entry as Record<string, unknown>;
            return { email: normalizeString(candidate.email), name: normalizeString(candidate.name) };
          }
          return { email: '', name: '' };
        })
        .filter(entry => entry.email);
      if (normalized.length) return normalized;
    }
  } catch {
    // fallback to csv parser
  }
  return raw
    .split(',')
    .map(item => ({ email: normalizeString(item), name: '' }))
    .filter(item => item.email);
}

async function resolveAuthContext(req: Request) {
  const authorization = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const jwt = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  if (!jwt) {
    return { ok: false, userId: '', error: 'Missing Authorization bearer token.' };
  }
  if (!adminClient) {
    return { ok: false, userId: '', error: 'Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' };
  }
  const { data, error } = await adminClient.auth.getUser(jwt);
  if (error || !data?.user?.id) {
    return { ok: false, userId: '', error: error?.message || 'Invalid or expired access token.' };
  }
  return { ok: true, userId: normalizeString(data.user.id), error: '' };
}

function toReadableResource(value: unknown) {
  const normalized = normalizeString(value).toLowerCase() || 'workflow';
  return normalized.replace(/_/g, ' ');
}

function sanitizeCell(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString();
}

function buildApprovalEmailTemplate(eventType: string, payload: Record<string, unknown>) {
  const resource = toReadableResource(payload.resource);
  const recordId = normalizeString(payload.record_id) || normalizeString(payload.approval_id) || '—';
  const title =
    eventType === 'approval_requested'
      ? `Approval request: ${resource} ${recordId}`
      : eventType === 'approval_approved'
        ? `Approval approved: ${resource} ${recordId}`
        : `Approval rejected: ${resource} ${recordId}`;

  const details: Array<{ label: string; value: string }> = [
    { label: 'Resource', value: resource },
    { label: 'Record ID', value: recordId }
  ];

  if (eventType === 'approval_requested') {
    details.push(
      { label: 'Requested action', value: normalizeString(payload.requested_action) || 'Workflow status transition' },
      { label: 'Requested by', value: normalizeString(payload.requested_by) || '—' },
      { label: 'Requested value/discount', value: normalizeString(payload.requested_value) || '—' },
      { label: 'Current status', value: normalizeString(payload.current_status) || '—' },
      { label: 'Requested status', value: normalizeString(payload.requested_status) || '—' },
      { label: 'Created at', value: formatDate(payload.created_at) }
    );
  } else if (eventType === 'approval_approved') {
    details.push(
      { label: 'Approved by', value: normalizeString(payload.reviewed_by) || '—' },
      { label: 'Approved at', value: formatDate(payload.reviewed_at) },
      { label: 'Applied status/change', value: normalizeString(payload.applied_change) || normalizeString(payload.requested_status) || '—' }
    );
  } else {
    details.push(
      { label: 'Rejected by', value: normalizeString(payload.reviewed_by) || '—' },
      { label: 'Rejected at', value: formatDate(payload.reviewed_at) },
      { label: 'Rejection reason/comment', value: normalizeString(payload.reviewer_comment) || '—' }
    );
  }

  const summaryMessage =
    eventType === 'approval_requested'
      ? 'Please review this approval request in InCheck360 MonitorCore.'
      : eventType === 'approval_approved'
        ? 'The approval request has been approved.'
        : 'The approval request has been rejected. Please review the comments in InCheck360 MonitorCore.';

  const rowsHtml = details
    .map(item => `<tr><td style="padding:8px 10px;color:#64748b;vertical-align:top;">${sanitizeCell(item.label)}</td><td style="padding:8px 10px;color:#0f172a;">${sanitizeCell(item.value)}</td></tr>`)
    .join('');
  const textDetails = details.map(item => `- ${item.label}: ${item.value}`).join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="background:#0f172a;color:#ffffff;padding:16px 20px;font-size:18px;font-weight:600;">InCheck360 MonitorCore</div>
        <div style="padding:20px;">
          <h2 style="margin:0 0 12px 0;font-size:20px;color:#0f172a;">${sanitizeCell(title)}</h2>
          <div style="background:#f1f5f9;border-left:4px solid #2563eb;padding:12px 14px;margin-bottom:14px;">${sanitizeCell(summaryMessage)}</div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">${rowsHtml}</table>
          <p style="margin:16px 0 0 0;color:#64748b;font-size:12px;">This email was sent by InCheck360 MonitorCore workflow approvals.</p>
        </div>
      </div>
    </div>
  `;
  const text = `${title}\n\n${summaryMessage}\n\n${textDetails}\n\nInCheck360 MonitorCore`;

  return { subject: title, html, text };
}

async function tableExists(tableName: string) {
  if (!adminClient) return false;
  try {
    const { error } = await adminClient.from(tableName).select('id', { head: true, count: 'exact' }).limit(1);
    if (!error) return true;
    const message = normalizeString((error as { message?: string })?.message).toLowerCase();
    if (message.includes('does not exist') || message.includes('not found')) return false;
    return false;
  } catch {
    return false;
  }
}

async function readLogRow(approvalId: string, eventType: string) {
  if (!adminClient) return null;
  const { data, error } = await adminClient
    .from(EMAIL_LOG_TABLE)
    .select('id,status')
    .eq('approval_id', approvalId)
    .eq('event_type', eventType)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function writeEmailLog(entry: Record<string, unknown>) {
  if (!adminClient) {
    console.info('[workflow approval email] log skipped, admin client unavailable', entry);
    return;
  }
  const exists = await tableExists(EMAIL_LOG_TABLE);
  if (!exists) {
    console.info('[workflow approval email] log table missing, console-only log', entry);
    return;
  }
  const { error } = await adminClient.from(EMAIL_LOG_TABLE).insert(entry);
  if (error) {
    console.warn('[workflow approval email] failed to write log', error);
  }
}

async function loadApproval(approvalId: string) {
  if (!adminClient) throw new Error('Server missing Supabase admin client');
  const { data, error } = await adminClient.from('workflow_approvals').select('*').eq('approval_id', approvalId).maybeSingle();
  if (error) throw new Error(error.message || 'Unable to load workflow approval');
  if (!data) throw new Error('Workflow approval not found');
  return data as Record<string, unknown>;
}

async function resolveProfileByUserId(userId: string) {
  if (!adminClient || !userId) return null;
  const { data, error } = await adminClient
    .from('profiles')
    .select('id,name,email,username,role_key,is_active')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

async function resolveRecipients(eventType: string, approval: Record<string, unknown>) {
  const fallbackRecipients = parseFallbackRecipients();
  if (!adminClient) return uniqueRecipients(fallbackRecipients);

  if (eventType === 'approval_requested') {
    const approvalRoles = normalizeRoleList(approval.approval_roles, approval.approval_roles_csv, approval.approval_role);
    if (!approvalRoles.length) return uniqueRecipients(fallbackRecipients);

    const { data, error } = await adminClient
      .from('profiles')
      .select('id,name,email,username,role_key,is_active')
      .in('role_key', approvalRoles)
      .eq('is_active', true)
      .limit(50);
    if (error || !Array.isArray(data)) {
      return uniqueRecipients(fallbackRecipients);
    }

    const roleRecipients = data
      .map(row => ({
        email: normalizeString(row.email),
        name: normalizeString(row.name || row.username || row.role_key)
      }))
      .filter(item => item.email);

    return uniqueRecipients(roleRecipients.length ? roleRecipients : fallbackRecipients);
  }

  const requesterUserId = normalizeString(approval.requester_user_id);
  const requesterProfile = await resolveProfileByUserId(requesterUserId);
  const requesterEmail = normalizeString(requesterProfile?.email);
  if (requesterEmail) {
    return uniqueRecipients([
      {
        email: requesterEmail,
        name: normalizeString(requesterProfile?.name || requesterProfile?.username || 'Requester')
      }
    ]);
  }
  return uniqueRecipients(fallbackRecipients);
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }
  return '';
}

function buildEventPayload(approval: Record<string, unknown>, requestBody: Record<string, unknown>) {
  const requestedChanges = approval.requested_changes && typeof approval.requested_changes === 'object'
    ? approval.requested_changes as Record<string, unknown>
    : {};
  return {
    approval_id: firstNonEmpty(approval.approval_id, approval.id),
    resource: firstNonEmpty(approval.resource, requestedChanges.resource, requestedChanges.target_workflow_resource),
    record_id: firstNonEmpty(
      approval.record_id,
      requestedChanges.proposal_number,
      requestedChanges.agreement_number,
      requestedChanges.invoice_number,
      requestedChanges.receipt_number,
      requestedChanges.proposal_id,
      requestedChanges.agreement_id,
      requestedChanges.invoice_id,
      requestedChanges.receipt_id
    ),
    requested_action: firstNonEmpty(requestedChanges.requested_action, requestedChanges.action, 'Status transition'),
    requested_by: firstNonEmpty(requestedChanges.requested_by, requestBody.requested_by),
    requested_value: firstNonEmpty(
      requestedChanges.requested_value,
      requestedChanges.changed_value,
      requestedChanges.discount_percent ? `${requestedChanges.discount_percent}%` : ''
    ),
    current_status: firstNonEmpty(approval.old_status, requestedChanges.current_status),
    requested_status: firstNonEmpty(approval.new_status, requestedChanges.requested_status, requestedChanges.next_status),
    created_at: firstNonEmpty(approval.created_at),
    reviewed_by: firstNonEmpty(requestBody.reviewed_by),
    reviewed_at: firstNonEmpty(approval.reviewed_at),
    applied_change: firstNonEmpty(requestedChanges.requested_status, approval.new_status),
    reviewer_comment: firstNonEmpty(requestBody.reviewer_comment, approval.reviewer_comment)
  };
}

async function callSendEmail(payload: Record<string, unknown>) {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL is missing');
  if (!EMAIL_FUNCTION_SECRET) throw new Error('INCHECK360_EMAIL_WEBHOOK_SECRET is missing');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-incheck360-email-secret': EMAIL_FUNCTION_SECRET
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`send-email failed (${response.status}): ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const auth = await resolveAuthContext(req);
    if (!auth.ok) {
      return new Response(JSON.stringify({ ok: false, error: auth.error, code: 'not_authorized' }), {
        status: 401,
        headers: CORS_HEADERS
      });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const eventType = normalizeString(body.event_type).toLowerCase();
    if (!['approval_requested', 'approval_approved', 'approval_rejected'].includes(eventType)) {
      return new Response(JSON.stringify({ ok: false, error: 'Unsupported event_type.' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    const approvalId = normalizeString(body.approval_id);
    if (!approvalId) {
      return new Response(JSON.stringify({ ok: false, error: 'approval_id is required.' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    const approval = await loadApproval(approvalId);

    const logTableAvailable = await tableExists(EMAIL_LOG_TABLE);
    if (logTableAvailable) {
      const alreadySent = await readLogRow(approvalId, eventType);
      if (alreadySent) {
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'duplicate_guard', approval_id: approvalId, event_type: eventType }), {
          status: 200,
          headers: CORS_HEADERS
        });
      }
    }

    const eventPayload = buildEventPayload(approval, body);
    const recipients = await resolveRecipients(eventType, approval);
    if (!recipients.length) {
      await writeEmailLog({
        approval_id: approvalId,
        event_type: eventType,
        recipient: null,
        status: 'skipped',
        provider_response: null,
        error_message: 'No recipient could be resolved.',
        created_at: new Date().toISOString()
      });
      return new Response(JSON.stringify({ ok: false, skipped: true, error: 'No recipients resolved.' }), {
        status: 200,
        headers: CORS_HEADERS
      });
    }

    const template = buildApprovalEmailTemplate(eventType, eventPayload);
    const sendPayload = {
      to: recipients,
      subject: template.subject,
      html: template.html,
      text: template.text,
      category: 'workflow_approval',
      metadata: {
        resource: eventPayload.resource,
        approval_id: approvalId,
        record_id: eventPayload.record_id,
        event_type: eventType
      }
    };

    try {
      const providerResponse = await callSendEmail(sendPayload);
      await writeEmailLog({
        approval_id: approvalId,
        event_type: eventType,
        recipient: recipients.map(item => item.email).join(','),
        status: 'sent',
        provider_response: providerResponse,
        error_message: null,
        created_at: new Date().toISOString()
      });
      return new Response(JSON.stringify({ ok: true, approval_id: approvalId, event_type: eventType, recipients, provider_response: providerResponse }), {
        status: 200,
        headers: CORS_HEADERS
      });
    } catch (error) {
      await writeEmailLog({
        approval_id: approvalId,
        event_type: eventType,
        recipient: recipients.map(item => item.email).join(','),
        status: 'failed',
        provider_response: null,
        error_message: normalizeString((error as Error)?.message || error),
        created_at: new Date().toISOString()
      });
      console.warn('[workflow approval email] send failed', {
        approval_id: approvalId,
        event_type: eventType,
        error: normalizeString((error as Error)?.message || error)
      });
      return new Response(JSON.stringify({ ok: false, approval_id: approvalId, event_type: eventType, error: normalizeString((error as Error)?.message || error) }), {
        status: 500,
        headers: CORS_HEADERS
      });
    }
  } catch (error) {
    console.error('[send-workflow-approval-email] failed', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: normalizeString((error as Error)?.message || error)
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
