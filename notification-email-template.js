(function initNotificationEmailTemplate(root) {
  const DEFAULT_APP_NAME = 'InCheck360';
  const FALLBACK_BASE_URL = 'https://monitor.app.incheck360.nl';

  const RESOURCE_LABELS = {
    tickets: 'Tickets',
    events: 'Events',
    leads: 'Leads',
    deals: 'Deals',
    proposals: 'Proposals',
    agreements: 'Agreements',
    invoices: 'Invoices',
    receipts: 'Receipts',
    workflow: 'Workflow Approval',
    operations_onboarding: 'Operations Onboarding',
    technical_admin_requests: 'Technical Admin Request',
    communication_centre: 'Communication Centre',
    notification_settings: 'Notification Settings'
  };

  const ACTION_LABELS = {
    ticket_created: 'New Ticket Submitted',
    ticket_updated: 'Ticket Updated',
    ticket_status_changed: 'Ticket Status Changed',
    ticket_dev_team_status_changed: 'Ticket Dev Team Status Changed',
    dev_team_status_changed: 'Ticket Dev Team Status Changed',
    event_created: 'New Event Created',
    event_updated: 'Event Updated',
    lead_created: 'New Lead Created',
    deal_created: 'New Deal Created',
    proposal_created: 'Proposal Created',
    proposal_sent: 'Proposal Sent',
    proposal_approved: 'Proposal Approved',
    proposal_rejected: 'Proposal Rejected',
    agreement_signed: 'Agreement Signed',
    invoice_issued: 'Invoice Issued',
    invoice_created: 'Invoice Issued',
    receipt_created: 'Receipt Created',
    approval_requested: 'Approval Requested',
    workflow_approval_requested: 'Approval Requested',
    approval_approved: 'Approval Approved',
    workflow_approved: 'Approval Approved',
    approval_rejected: 'Approval Rejected',
    workflow_rejected: 'Approval Rejected',
    technical_admin_request_submitted: 'Technical Admin Request Submitted',
    technical_request_submitted: 'Technical Admin Request Submitted',
    message_created: 'New Communication Message',
    conversation_created: 'New Communication Message',
    reply_created: 'New Communication Reply',
    reply_added: 'New Communication Reply',
    test_notification: 'Test Notification'
  };

  function asString(value) {
    return String(value ?? '').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function toTitleCase(value) {
    return asString(value)
      .replace(/[_.-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  function humanizeResourceLabel(resource = '') {
    const key = asString(resource).toLowerCase();
    return RESOURCE_LABELS[key] || toTitleCase(key) || 'Notification';
  }

  function humanizeActionLabel(action = '') {
    const key = asString(action).toLowerCase();
    return ACTION_LABELS[key] || toTitleCase(key) || 'Notification';
  }

  function resolveBaseUrl() {
    const importMetaEnv = (() => {
      try {
        // Avoid hard dependency on module syntax while still supporting Vite-injected globals if present.
        return root?.import?.meta?.env || {};
      } catch {
        return {};
      }
    })();
    const processEnv = root?.process?.env || {};
    const runtimeEnv = root?.ENV || {};
    const candidates = [
      importMetaEnv.VITE_APP_BASE_URL,
      runtimeEnv.VITE_APP_BASE_URL,
      root?.location?.origin,
      processEnv.APP_BASE_URL,
      processEnv.VITE_APP_BASE_URL,
      runtimeEnv.APP_BASE_URL,
      runtimeEnv.APP_PUBLIC_URL,
      runtimeEnv.PUBLIC_APP_URL,
      runtimeEnv.VITE_APP_PUBLIC_URL
    ];
    const value = candidates.map(asString).find(Boolean) || FALLBACK_BASE_URL;
    return value.replace(/\/+$/, '');
  }

  function stripMarkdownLink(value = '') {
    return asString(value)
      .replace(/\[(#[^\]]+)\]\s*Open in InCheck360/gi, '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, '$1 ($2)')
      .replace(/\[([^\]]+)\]([^\s]+)/g, '$2: $1')
      .trim();
  }

  function buildAbsoluteNotificationUrl(deepLink = '') {
    const input = asString(deepLink);
    const base = resolveBaseUrl();
    if (!input) return base;
    if (/^https?:\/\//i.test(input)) return input;
    if (input.startsWith('#')) return `${base}/${input}`;
    if (input.startsWith('/#')) return `${base}${input}`;
    if (input.startsWith('/')) return `${base}${input}`;
    return `${base}/${input.replace(/^\/+/, '')}`;
  }

  function validateHref(url = '') {
    const value = buildAbsoluteNotificationUrl(url);
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) return FALLBACK_BASE_URL;
      return parsed.toString();
    } catch {
      return FALLBACK_BASE_URL;
    }
  }

  function buildDetailRow(label, value) {
    const clean = asString(value);
    if (!clean) return '';
    return `<tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e6edf5;color:#64748b;font-size:13px;font-weight:700;width:34%;">${escapeHtml(label)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e6edf5;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(clean)}</td>
    </tr>`;
  }

  function buildNotificationEmailHtml({
    appName = DEFAULT_APP_NAME,
    title = '',
    subtitle = 'Notification',
    description = '',
    body = '',
    resource = '',
    action = '',
    recordId = '',
    recordNumber = '',
    deepLink = '',
    url = '',
    actorName = '',
    recipientName = '',
    metadata = {}
  } = {}) {
    const cleanAppName = asString(appName) || DEFAULT_APP_NAME;
    const actionLabel = humanizeActionLabel(action);
    const resourceLabel = humanizeResourceLabel(resource);
    const rawTitle = stripMarkdownLink(title);
    const cleanTitle = rawTitle && rawTitle.toLowerCase() !== actionLabel.toLowerCase() ? rawTitle : (actionLabel || `${cleanAppName} Notification`);
    const cleanDescription = stripMarkdownLink(description || body) || 'A business event requires your attention.';
    const cleanRecord = asString(recordNumber || metadata?.record_number || metadata?.recordNumber || metadata?.ticket_id || metadata?.ticketId || recordId) || '—';
    const cleanActor = asString(actorName || metadata?.actor_name || metadata?.actorName || metadata?.created_by_name || metadata?.updated_by_name);
    const absoluteUrl = validateHref(deepLink || url);
    const subject = `${cleanTitle} — ${cleanRecord && cleanRecord !== '—' ? cleanRecord : cleanAppName}`;
    const badge = `${resourceLabel} • ${actionLabel}`;
    const detailsRows = [
      buildDetailRow('Resource', resourceLabel),
      buildDetailRow('Action', actionLabel),
      buildDetailRow('Record', cleanRecord),
      buildDetailRow('Created/Updated by', cleanActor)
    ].join('');

    const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f7fb;margin:0;padding:0;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;margin:0 auto;">
        <tr><td style="padding:0 0 14px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b1f3a;border-radius:18px 18px 0 0;">
            <tr><td style="padding:24px 28px;">
              <div style="font-size:24px;line-height:1.2;font-weight:800;letter-spacing:.2px;color:#ffffff;">${escapeHtml(cleanAppName)}</div>
              <div style="font-size:13px;line-height:1.4;color:#b9d5ff;margin-top:5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(subtitle || 'Notification')}</div>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #dbe5f1;border-top:0;border-radius:0 0 18px 18px;box-shadow:0 16px 36px rgba(15,23,42,.08);overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:30px 28px 24px 28px;">
              <div style="display:inline-block;background:#e8f1ff;color:#0b4db3;border:1px solid #cfe1ff;border-radius:999px;padding:7px 12px;font-size:12px;line-height:1;font-weight:800;margin-bottom:18px;">${escapeHtml(badge)}</div>
              <h1 style="margin:0 0 12px 0;color:#0f172a;font-size:26px;line-height:1.25;font-weight:800;">${escapeHtml(cleanTitle)}</h1>
              <p style="margin:0 0 22px 0;color:#334155;font-size:15px;line-height:1.65;">${escapeHtml(cleanDescription).replace(/\n/g, '<br>')}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dbe5f1;border-radius:12px;border-collapse:separate;border-spacing:0;background:#fbfdff;margin:0 0 24px 0;overflow:hidden;">
                ${detailsRows}
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;"><tr><td bgcolor="#0b57d0" style="border-radius:10px;">
                <a href="${escapeAttribute(absoluteUrl)}" style="display:inline-block;padding:14px 22px;background:#0b57d0;border-radius:10px;color:#ffffff;font-size:15px;line-height:1.2;font-weight:800;text-decoration:none;">Open in InCheck360</a>
              </td></tr></table>
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.55;">If the button does not work, copy and paste this link into your browser:<br><a href="${escapeAttribute(absoluteUrl)}" style="color:#0b57d0;text-decoration:underline;word-break:break-all;">${escapeHtml(absoluteUrl)}</a></p>
            </td></tr>
            <tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e6edf5;">
              <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">This is an automated notification from ${escapeHtml(cleanAppName)}. Please do not reply to this email.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
      cleanTitle,
      '',
      cleanDescription,
      '',
      `Resource: ${resourceLabel}`,
      `Action: ${actionLabel}`,
      `Record: ${cleanRecord}`,
      cleanActor ? `Created/Updated by: ${cleanActor}` : '',
      `Open in InCheck360: ${absoluteUrl}`,
      '',
      `This is an automated notification from ${cleanAppName}. Please do not reply to this email.`
    ].filter((line) => line !== '').join('\n');

    return { subject, html, text };
  }

  const api = {
    buildNotificationEmailHtml,
    buildAbsoluteNotificationUrl,
    humanizeResourceLabel,
    humanizeActionLabel,
    escapeHtml
  };

  root.NotificationEmailTemplate = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
