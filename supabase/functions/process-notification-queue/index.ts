import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webPush from 'npm:web-push@3.6.7';

const MAX_ATTEMPTS = 3;
const DEFAULT_LIMIT = 25;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-worker-secret, x-cron-secret',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || 'Unknown notification delivery error');
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

function isWebPushChannel(channel = '') {
  return ['pwa', 'push', 'web_push'].includes(String(channel || '').toLowerCase());
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildNotificationEmailHtml(job: Record<string, any>) {
  const deepLink = String(job.deep_link || '').trim();
  const link = deepLink ? `<p><a href="${escapeHtml(deepLink)}">Open in ERP</a></p>` : '';
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2>${escapeHtml(job.title || 'ERP Notification')}</h2>
      <p>${escapeHtml(job.body || '')}</p>
      ${link}
    </div>
  `;
}

function getVapidConfig() {
  const subject = String(Deno.env.get('VAPID_SUBJECT') || '').trim();
  const publicKey = String(Deno.env.get('VAPID_PUBLIC_KEY') || '').trim();
  const privateKey = String(Deno.env.get('VAPID_PRIVATE_KEY') || '').trim();
  const missing: string[] = [];

  if (!publicKey) missing.push('VAPID_PUBLIC_KEY');
  if (!privateKey) missing.push('VAPID_PRIVATE_KEY');
  if (!subject) missing.push('VAPID_SUBJECT');
  if (missing.length) {
    throw new Error(`Missing required web push VAPID environment variable(s): ${missing.join(', ')}`);
  }

  return { subject, publicKey, privateKey };
}

function normalizeSubscription(row: Record<string, any>) {
  const keys = row.keys || row.subscription?.keys || {};
  const endpoint = String(row.endpoint || row.subscription?.endpoint || '').trim();
  const p256dh = String(row.p256dh || keys.p256dh || '').trim();
  const auth = String(row.auth || keys.auth || '').trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Push subscription is missing endpoint, p256dh, or auth.');
  }
  return { endpoint, keys: { p256dh, auth } };
}

async function sendPush(supabaseAdmin: any, subscription: Record<string, any>, payload: Record<string, unknown>) {
  const { subject, publicKey, privateKey } = getVapidConfig();
  webPush.setVapidDetails(subject, publicKey, privateKey);

  try {
    return await webPush.sendNotification(normalizeSubscription(subscription), JSON.stringify(payload));
  } catch (error) {
    const statusCode = Number((error as any)?.statusCode || (error as any)?.status || 0);
    if ((statusCode === 404 || statusCode === 410) && subscription.id) {
      await supabaseAdmin.from(subscription.__table || 'user_push_subscriptions').update({ is_active: false, active: false, enabled: false, updated_at: new Date().toISOString() }).eq('id', subscription.id);
    }
    throw error;
  }
}

function hasSubscriptionKeys(row: Record<string, any>) {
  const keys = row.keys || row.subscription?.keys || {};
  return Boolean(String(row.endpoint || row.subscription?.endpoint || '').trim() && String(row.p256dh || keys.p256dh || '').trim() && String(row.auth || keys.auth || '').trim());
}

function isActiveSubscription(row: Record<string, any>) {
  if (row.is_active === true || row.active === true || row.enabled === true || row.permission_status === 'granted') return true;
  const hasActiveFlag = Object.prototype.hasOwnProperty.call(row, 'is_active') || Object.prototype.hasOwnProperty.call(row, 'active') || Object.prototype.hasOwnProperty.call(row, 'enabled') || Object.prototype.hasOwnProperty.call(row, 'permission_status');
  return !hasActiveFlag && hasSubscriptionKeys(row);
}

async function loadSubscriptionsByUserColumn(supabaseAdmin: any, table: string, column: string, userId: string) {
  const { data, error } = await supabaseAdmin.from(table).select('*').eq(column, userId);
  if (error) return [];
  return (data || []).map((row: Record<string, any>) => ({ ...row, __table: table }));
}

async function loadActiveSubscriptions(supabaseAdmin: any, userId: string) {
  const tables = ['user_push_subscriptions', 'push_subscriptions'];
  const userColumns = ['user_id', 'recipient_user_id', 'auth_user_id'];
  const results = await Promise.all(tables.flatMap((table) => userColumns.map((column) => loadSubscriptionsByUserColumn(supabaseAdmin, table, column, userId))));
  const seen = new Set<string>();
  return results.flat().filter((row) => {
    const endpoint = String(row.endpoint || row.subscription?.endpoint || '').trim();
    if (!endpoint || seen.has(endpoint) || !hasSubscriptionKeys(row) || !isActiveSubscription(row)) return false;
    seen.add(endpoint);
    return true;
  });
}

async function sendEmail(job: Record<string, any>) {
  const resendApiKey = String(Deno.env.get('RESEND_API_KEY') || '').trim();
  const from = String(Deno.env.get('SMTP_FROM') || Deno.env.get('EMAIL_FROM') || '').trim();
  if (!resendApiKey || !from) throw new Error('Missing email provider configuration.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: job.recipient_email,
      subject: job.title || 'ERP Notification',
      html: buildNotificationEmailHtml(job),
      text: `${job.title || 'ERP Notification'}\n\n${job.body || ''}\n\n${job.deep_link || ''}`,
    }),
  });
  if (!response.ok) throw new Error(`Email provider failed with ${response.status}: ${await response.text()}`);
}

async function insertDeliveryLog(supabaseAdmin: any, job: Record<string, any>, status: string, errorMessage: string | null = null) {
  await supabaseAdmin.from('notification_delivery_logs').insert({
    queue_id: job.id,
    notification_id: job.notification_id,
    event_key: job.event_key,
    channel: job.channel,
    recipient_user_id: job.recipient_user_id,
    recipient_email: job.recipient_email,
    status,
    error_message: errorMessage,
  });
}

function resultFromJob(job: Record<string, any>, status: string, errorMessage: string | null = null) {
  return { queueId: job.id, notificationId: job.notification_id, eventKey: job.event_key, channel: job.channel, recipientUserId: job.recipient_user_id, recipientEmail: job.recipient_email, status, error: errorMessage };
}

async function markSent(supabaseAdmin: any, job: Record<string, any>) {
  const now = new Date().toISOString();
  await supabaseAdmin.from('notification_delivery_queue').update({ status: 'sent', processed_at: now, locked_at: null, locked_by: null, last_error: null, updated_at: now }).eq('id', job.id);
  await insertDeliveryLog(supabaseAdmin, job, 'sent');
  return resultFromJob(job, 'sent');
}

async function markSkipped(supabaseAdmin: any, job: Record<string, any>, reason: string) {
  const now = new Date().toISOString();
  await supabaseAdmin.from('notification_delivery_queue').update({ status: 'skipped', processed_at: now, locked_at: null, locked_by: null, last_error: reason, updated_at: now }).eq('id', job.id);
  await insertDeliveryLog(supabaseAdmin, job, 'skipped', reason);
  return resultFromJob(job, 'skipped', reason);
}

async function markFailedOrRetry(supabaseAdmin: any, job: Record<string, any>, error: unknown, forceFailed = false) {
  const attempts = Number(job.attempts || 0);
  const failedFinal = forceFailed || attempts >= MAX_ATTEMPTS;
  const status = failedFinal ? 'failed' : 'queued';
  const errorMessage = getErrorMessage(error);
  const now = new Date();
  await supabaseAdmin.from('notification_delivery_queue').update({ status, locked_at: null, locked_by: null, last_error: errorMessage, next_attempt_at: failedFinal ? now.toISOString() : addMinutes(now, Math.max(1, attempts)), updated_at: now.toISOString() }).eq('id', job.id);
  await insertDeliveryLog(supabaseAdmin, job, status, errorMessage);
  return resultFromJob(job, status, errorMessage);
}

async function processNotificationDeliveryQueue(supabaseAdmin: any, limit: number) {
  const workerId = `process-notification-queue-${crypto.randomUUID()}`;
  const results: unknown[] = [];
  const { data: jobs, error } = await supabaseAdmin.from('notification_delivery_queue').select('*').eq('status', 'queued').lte('next_attempt_at', new Date().toISOString()).order('created_at', { ascending: true }).limit(limit);
  if (error) throw error;

  for (const job of jobs || []) {
    const startedAt = new Date().toISOString();
    const attempts = Number(job.attempts || 0) + 1;
    const { data: lockedRows, error: lockError } = await supabaseAdmin.from('notification_delivery_queue').update({ status: 'processing', locked_at: startedAt, locked_by: workerId, attempts, updated_at: startedAt }).eq('id', job.id).eq('status', 'queued').select('id');
    if (lockError) throw lockError;
    if (!lockedRows?.length) continue;

    const lockedJob = { ...job, attempts };
    try {
      if (String(lockedJob.channel || '').toLowerCase() === 'email') {
        if (!lockedJob.recipient_email) {
          results.push(await markSkipped(supabaseAdmin, lockedJob, 'Missing recipient email'));
          continue;
        }
        await sendEmail(lockedJob);
      } else if (isWebPushChannel(lockedJob.channel)) {
        getVapidConfig();
        if (!lockedJob.recipient_user_id) {
          results.push(await markSkipped(supabaseAdmin, lockedJob, 'Missing recipient user id'));
          continue;
        }
        const subscriptions = await loadActiveSubscriptions(supabaseAdmin, lockedJob.recipient_user_id);
        if (!subscriptions.length) {
          results.push(await markSkipped(supabaseAdmin, lockedJob, `No active PWA subscription found for recipient_user_id ${lockedJob.recipient_user_id} in user_push_subscriptions or push_subscriptions`));
          continue;
        }
        for (const subscription of subscriptions) {
          await sendPush(supabaseAdmin, subscription, { title: lockedJob.title, body: lockedJob.body, url: lockedJob.deep_link || '/', notificationId: lockedJob.notification_id, eventKey: lockedJob.event_key, resource: lockedJob.resource, resourceId: lockedJob.resource_id });
        }
      } else {
        results.push(await markSkipped(supabaseAdmin, lockedJob, `Unsupported channel: ${lockedJob.channel}`));
        continue;
      }
      results.push(await markSent(supabaseAdmin, lockedJob));
    } catch (error) {
      results.push(await markFailedOrRetry(supabaseAdmin, lockedJob, error, isWebPushChannel(lockedJob.channel)));
    }
  }
  return { workerId, processed: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });
  if (!['GET', 'POST'].includes(req.method)) return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ ok: false, error: 'Server is missing Supabase admin configuration.' }, 500);

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || DEFAULT_LIMIT), 1), 100);
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const result = await processNotificationDeliveryQueue(supabaseAdmin, limit);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return jsonResponse({ ok: false, error: getErrorMessage(error) }, 500);
  }
});
