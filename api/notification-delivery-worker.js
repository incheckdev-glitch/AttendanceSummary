import nodemailer from 'nodemailer';
import webpush from 'web-push';

const WEB_PUSH_CHANNELS = new Set(['pwa', 'push', 'web_push', 'web-push']);
const EMAIL_CHANNELS = new Set(['email', 'mail']);

function text(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function isWebPushChannel(channel = '') {
  return WEB_PUSH_CHANNELS.has(lower(channel));
}

function isEmailChannel(channel = '') {
  return EMAIL_CHANNELS.has(lower(channel));
}

function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getEnv(...keys) {
  for (const key of keys) {
    const value = text(process.env[key]);
    if (value) return value;
  }
  return '';
}

function normalizeAppUrl(url = '') {
  const value = text(url);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/g, '');
  return `https://${value.replace(/^\/+|\/+$/g, '')}`;
}

function getPublicAppUrl() {
  return normalizeAppUrl(
    getEnv('APP_PUBLIC_URL', 'PUBLIC_APP_URL', 'VITE_APP_PUBLIC_URL', 'NEXT_PUBLIC_APP_URL') ||
      (getEnv('VERCEL_URL') ? `https://${getEnv('VERCEL_URL')}` : '') ||
      'https://monitor.app.incheck360.nl'
  );
}

function makeAbsoluteUrl(url = '') {
  const value = text(url);
  if (!value) return getPublicAppUrl();
  if (/^https?:\/\//i.test(value)) return value;
  const base = getPublicAppUrl();
  if (value.startsWith('/')) return `${base}${value}`;
  if (value.startsWith('#')) return `${base}/${value}`;
  return `${base}/${value.replace(/^\/+/, '')}`;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getJobPayload(job = {}) {
  return safeJson(job.payload || job.data || job.meta || job.metadata, {});
}

function getJobTitle(job = {}) {
  const payload = getJobPayload(job);
  return text(job.title || payload.title || payload.notification?.title || 'InCheck360 Notification');
}

function getJobBody(job = {}) {
  const payload = getJobPayload(job);
  return text(job.body || job.message || payload.body || payload.message || payload.notification?.body || 'A business event requires your attention.');
}

function getJobDeepLink(job = {}) {
  const payload = getJobPayload(job);
  return text(job.deep_link || job.link || job.url || payload.deep_link || payload.url || payload.data?.deep_link || payload.data?.url || '/');
}

function buildEmailHtml(job = {}) {
  const title = getJobTitle(job);
  const body = getJobBody(job);
  const deepLink = makeAbsoluteUrl(getJobDeepLink(job));
  return `
    <div style="margin:0;padding:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;padding:28px 18px;">
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.08);">
          <div style="padding:22px 24px;border-bottom:1px solid #e2e8f0;background:linear-gradient(135deg,#0f172a,#1e293b);color:#ffffff;">
            <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.75;">InCheck360 MonitorCore</div>
            <h1 style="font-size:22px;line-height:1.3;margin:8px 0 0;">${escapeHtml(title)}</h1>
          </div>
          <div style="padding:24px;">
            <p style="font-size:15px;line-height:1.65;margin:0 0 20px;">${escapeHtml(body)}</p>
            <a href="${escapeHtml(deepLink)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:700;font-size:14px;">Open in InCheck360</a>
            <p style="font-size:12px;color:#64748b;line-height:1.5;margin:22px 0 0;">This notification was generated automatically by InCheck360 MonitorCore.</p>
          </div>
        </div>
      </div>
    </div>`;
}

let cachedTransporter = null;

function createEmailTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = getEnv('SMTP_HOST', 'MAILTRAP_HOST', 'EMAIL_SMTP_HOST');
  const port = Number(getEnv('SMTP_PORT', 'MAILTRAP_PORT', 'EMAIL_SMTP_PORT') || 587);
  const user = getEnv('SMTP_USER', 'MAILTRAP_USER', 'EMAIL_SMTP_USER');
  const pass = getEnv('SMTP_PASS', 'SMTP_PASSWORD', 'MAILTRAP_PASS', 'EMAIL_SMTP_PASS');

  if (!host || !user || !pass) {
    throw new Error('Missing SMTP configuration. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in Vercel.');
  }

  const secureValue = lower(getEnv('SMTP_SECURE', 'EMAIL_SMTP_SECURE'));
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: secureValue ? ['1', 'true', 'yes'].includes(secureValue) : port === 465,
    auth: { user, pass }
  });
  return cachedTransporter;
}

async function sendNotificationEmail(job = {}) {
  const to = text(job.recipient_email || getJobPayload(job).recipient_email || getJobPayload(job).email).toLowerCase();
  if (!to) throw new Error('Missing recipient email.');

  const from = getEnv('SMTP_FROM', 'EMAIL_FROM', 'NOTIFICATION_EMAIL_FROM') || getEnv('SMTP_USER', 'MAILTRAP_USER', 'EMAIL_SMTP_USER');
  const subject = getJobTitle(job);
  const deepLink = makeAbsoluteUrl(getJobDeepLink(job));
  const body = getJobBody(job);
  const html = text(job.html || getJobPayload(job).html || getJobPayload(job).email_html) || buildEmailHtml(job);
  const transporter = createEmailTransporter();
  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text: `${subject}\n\n${body}\n\nOpen in InCheck360: ${deepLink}`
  });
}

let webPushConfigured = false;

export function configureWebPush() {
  if (webPushConfigured) return;
  const publicKey = getEnv('VAPID_PUBLIC_KEY', 'PUSH_VAPID_PUBLIC_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  const privateKey = getEnv('VAPID_PRIVATE_KEY', 'PUSH_VAPID_PRIVATE_KEY');
  const subject = getEnv('VAPID_SUBJECT', 'WEB_PUSH_SUBJECT') || `mailto:${getEnv('SMTP_FROM', 'EMAIL_FROM', 'NOTIFICATION_EMAIL_FROM') || 'info@incheck360.nl'}`;
  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID configuration. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel.');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  webPushConfigured = true;
}

function readSubscriptionKeys(row = {}) {
  const subscription = safeJson(row.subscription || row.subscription_json || row.subscription_payload, {});
  const keys = safeJson(row.keys || subscription.keys, {});
  return {
    endpoint: text(row.endpoint || subscription.endpoint),
    p256dh: text(row.p256dh || row.key_p256dh || keys.p256dh),
    auth: text(row.auth || row.key_auth || keys.auth)
  };
}

function isActiveSubscription(row = {}) {
  const permission = lower(row.permission_status || row.permission || '');
  if (row.is_active === false || row.active === false || row.enabled === false) return false;
  if (permission && permission !== 'granted') return false;
  const keys = readSubscriptionKeys(row);
  return Boolean(keys.endpoint && keys.p256dh && keys.auth);
}

async function selectRows(supabase, table, buildQuery) {
  try {
    const query = buildQuery(supabase.from(table).select('*'));
    const { data, error } = await query;
    if (error) return [];
    return (Array.isArray(data) ? data : []).map(row => ({ ...row, __table: table }));
  } catch {
    return [];
  }
}

export async function loadActiveSubscriptions(supabase, userId = '') {
  const id = text(userId);
  if (!supabase || !id) return [];
  const tables = ['user_push_subscriptions', 'push_subscriptions'];
  const userColumns = ['user_id', 'recipient_user_id', 'auth_user_id', 'profile_id'];
  const batches = [];

  for (const table of tables) {
    for (const column of userColumns) {
      batches.push(selectRows(supabase, table, query => query.eq(column, id)));
    }
  }

  const rows = (await Promise.all(batches)).flat();
  const seen = new Set();
  return rows.filter(row => {
    if (!isActiveSubscription(row)) return false;
    const endpoint = readSubscriptionKeys(row).endpoint;
    if (seen.has(endpoint)) return false;
    seen.add(endpoint);
    return true;
  });
}

export async function loadSubscriptionsByIds(supabase, subscriptionIds = []) {
  const ids = [...new Set((Array.isArray(subscriptionIds) ? subscriptionIds : [subscriptionIds]).map(text).filter(Boolean))];
  if (!supabase || !ids.length) return [];
  const tables = ['user_push_subscriptions', 'push_subscriptions'];
  const batches = [];
  for (const table of tables) {
    batches.push(selectRows(supabase, table, query => query.in('id', ids)));
  }
  const rows = (await Promise.all(batches)).flat();
  const seen = new Set();
  return rows.filter(row => {
    if (!isActiveSubscription(row)) return false;
    const endpoint = readSubscriptionKeys(row).endpoint;
    if (seen.has(endpoint)) return false;
    seen.add(endpoint);
    return true;
  });
}

async function markSubscriptionInactive(supabase, row = {}) {
  const endpoint = readSubscriptionKeys(row).endpoint;
  const table = row.__table || 'user_push_subscriptions';
  if (!endpoint) return;
  const patch = {
    is_active: false,
    active: false,
    enabled: false,
    updated_at: new Date().toISOString()
  };
  try {
    await supabase.from(table).update(patch).eq('endpoint', endpoint);
  } catch {
    try { await supabase.from(table).update({ is_active: false, updated_at: new Date().toISOString() }).eq('endpoint', endpoint); } catch {}
  }
}

function buildPushPayload(job = {}) {
  const payload = getJobPayload(job);
  return {
    title: getJobTitle(job),
    body: getJobBody(job),
    deep_link: getJobDeepLink(job),
    url: getJobDeepLink(job),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: text(job.event_key || payload.event_key || payload.action || `incheck360-${Date.now()}`),
    resource: text(job.resource || payload.resource || payload.data?.resource),
    action: text(job.action || payload.action || payload.data?.action),
    record_id: text(job.resource_id || job.record_id || payload.record_id || payload.data?.record_id),
    notification_id: text(job.notification_id || payload.notification_id),
    data: {
      ...payload,
      ...(payload.data && typeof payload.data === 'object' ? payload.data : {}),
      notification_id: text(job.notification_id || payload.notification_id),
      event_key: text(job.event_key || payload.event_key),
      resource: text(job.resource || payload.resource || payload.data?.resource),
      action: text(job.action || payload.action || payload.data?.action),
      record_id: text(job.resource_id || job.record_id || payload.record_id || payload.data?.record_id),
      deep_link: getJobDeepLink(job),
      url: getJobDeepLink(job)
    }
  };
}

export async function sendWebPushToSubscriptions({ supabase, subscriptions = [], payload = {} } = {}) {
  configureWebPush();
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const row of subscriptions) {
    const keys = readSubscriptionKeys(row);
    if (!keys.endpoint || !keys.p256dh || !keys.auth) continue;
    attempted += 1;
    try {
      await webpush.sendNotification(
        { endpoint: keys.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
        JSON.stringify(payload)
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = Number(error?.statusCode || error?.status || 0);
      errors.push({ endpoint: `${keys.endpoint.slice(0, 18)}…${keys.endpoint.slice(-10)}`, statusCode, message: error?.body || error?.message || String(error) });
      if (statusCode === 404 || statusCode === 410) await markSubscriptionInactive(supabase, row);
    }
  }

  return { attempted, sent, failed, errors };
}

async function resolveEmailForUserId(supabase, userId = '') {
  const id = text(userId);
  if (!id) return '';
  const filters = [`id.eq.${id}`, `user_id.eq.${id}`, `auth_user_id.eq.${id}`];
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email,user_email')
      .or(filters.join(','))
      .limit(1)
      .maybeSingle();
    if (!error) return text(data?.email || data?.user_email).toLowerCase();
  } catch {}
  return '';
}

async function insertDeliveryLog(supabase, row = {}) {
  const payload = {
    queue_id: row.queue_id || row.id || null,
    notification_id: row.notification_id || null,
    event_key: row.event_key || null,
    channel: row.channel || null,
    recipient_user_id: row.recipient_user_id || null,
    recipient_email: row.recipient_email || null,
    status: row.status || null,
    error_message: row.error_message || row.last_error || null,
    provider_response: row.provider_response || null,
    created_at: new Date().toISOString()
  };
  for (const table of ['notification_delivery_logs', 'notification_delivery_log']) {
    try {
      const { error } = await supabase.from(table).insert(payload);
      if (!error) return;
    } catch {}
  }
}

async function updateQueueJob(supabase, id, patch = {}) {
  const { error } = await supabase
    .from('notification_delivery_queue')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function processEmailJob(supabase, job = {}) {
  if (!text(job.recipient_email) && text(job.recipient_user_id)) {
    const email = await resolveEmailForUserId(supabase, job.recipient_user_id);
    if (email) job = { ...job, recipient_email: email };
  }
  await sendNotificationEmail(job);
  return { attempted: 1, sent: 1, failed: 0, errors: [] };
}

async function processPushJob(supabase, job = {}) {
  const subscriptions = await loadActiveSubscriptions(supabase, job.recipient_user_id);
  if (!subscriptions.length) {
    return { attempted: 0, sent: 0, failed: 0, skipped: true, errors: [`No active PWA subscription found for recipient_user_id ${text(job.recipient_user_id) || 'unknown'}`] };
  }
  return sendWebPushToSubscriptions({ supabase, subscriptions, payload: buildPushPayload(job) });
}

function isDue(job = {}, nowIso = new Date().toISOString()) {
  const nextAttempt = text(job.next_attempt_at);
  return !nextAttempt || nextAttempt <= nowIso;
}

export async function processNotificationDeliveryQueue({ supabaseAdmin, supabase, limit = 50 } = {}) {
  const client = supabaseAdmin || supabase;
  if (!client?.from) throw new Error('processNotificationDeliveryQueue requires a Supabase service-role client.');

  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from('notification_delivery_queue')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(Number(limit || 50));

  if (error) throw error;

  const jobs = (Array.isArray(data) ? data : []).filter(job => isDue(job, nowIso));
  const results = [];

  for (const originalJob of jobs) {
    const job = { ...originalJob };
    const attempts = Number(job.attempts || 0) + 1;
    const channel = lower(job.channel);

    try {
      await updateQueueJob(client, job.id, { status: 'processing', attempts });

      let result;
      if (isEmailChannel(channel)) {
        result = await processEmailJob(client, job);
      } else if (isWebPushChannel(channel)) {
        result = await processPushJob(client, job);
      } else {
        result = { attempted: 0, sent: 0, failed: 0, skipped: true, errors: [`Unsupported channel ${channel || 'unknown'}`] };
      }

      const hasSent = Number(result.sent || 0) > 0;
      const skipped = result.skipped === true && !hasSent;
      const status = skipped ? 'skipped' : hasSent ? 'sent' : 'failed';
      const message = Array.isArray(result.errors) && result.errors.length ? JSON.stringify(result.errors) : null;

      await updateQueueJob(client, job.id, {
        status,
        processed_at: new Date().toISOString(),
        last_error: status === 'sent' ? null : message,
        provider_response: result
      });
      await insertDeliveryLog(client, { ...job, queue_id: job.id, status, error_message: message, provider_response: result });

      results.push({ id: job.id, channel, status, ...result });
    } catch (err) {
      const message = err?.message || String(err);
      const finalFailure = isWebPushChannel(channel) || attempts >= 3;
      const status = finalFailure ? 'failed' : 'queued';
      await updateQueueJob(client, job.id, {
        status,
        attempts,
        last_error: message,
        next_attempt_at: new Date(Date.now() + Math.max(attempts, 1) * 60000).toISOString()
      }).catch(() => null);
      await insertDeliveryLog(client, { ...job, queue_id: job.id, status, error_message: message }).catch(() => null);
      results.push({ id: job.id, channel, status, attempted: 1, sent: 0, failed: 1, error: message });
    }
  }

  return {
    ok: true,
    processed: results.length,
    attempted: results.reduce((sum, row) => sum + Number(row.attempted || 0), 0),
    sent: results.reduce((sum, row) => sum + Number(row.sent || 0), 0),
    failed: results.reduce((sum, row) => sum + Number(row.failed || 0), 0),
    skipped: results.filter(row => row.status === 'skipped').length,
    results
  };
}
