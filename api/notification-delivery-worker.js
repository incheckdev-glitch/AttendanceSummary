import nodemailer from 'nodemailer';
import webpush from 'web-push';

const MAX_ATTEMPTS = 3;

function getErrorMessage(error) {
  return String(error?.message || error || 'Unknown notification delivery error');
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000).toISOString();
}

export function buildNotificationEmailHtml(job) {
  const deepLink = String(job.deep_link || '').trim();
  const escapedTitle = escapeHtml(job.title || 'ERP Notification');
  const escapedBody = escapeHtml(job.body || '');
  const link = deepLink
    ? `<p><a href="${escapeHtml(deepLink)}">Open in ERP</a></p>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2>${escapedTitle}</h2>
      <p>${escapedBody}</p>
      ${link}
    </div>
  `;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendEmail({ to, subject, html, text }) {
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

export function getVapidConfig(env = process.env) {
  const subject = String(env.VAPID_SUBJECT || '').trim();
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  const missing = [];

  if (!publicKey) missing.push('VAPID_PUBLIC_KEY');
  if (!privateKey) missing.push('VAPID_PRIVATE_KEY');
  if (!subject) missing.push('VAPID_SUBJECT');

  if (missing.length) {
    throw new Error(`Missing required web push VAPID environment variable(s): ${missing.join(', ')}`);
  }

  return { subject, publicKey, privateKey };
}

function isWebPushChannel(channel = '') {
  return ['pwa', 'push', 'web_push'].includes(String(channel || '').toLowerCase());
}

export async function sendPush({ supabaseAdmin, subscription, payload }) {
  const { subject, publicKey, privateKey } = getVapidConfig();

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth
    }
  };

  try {
    return await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
  } catch (error) {
    const statusCode = Number(error?.statusCode || error?.status || 0);
    if ((statusCode === 404 || statusCode === 410) && subscription.id) {
      await supabaseAdmin
        .from('user_push_subscriptions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', subscription.id);
    }
    throw error;
  }
}

export async function processNotificationDeliveryQueue({
  supabaseAdmin,
  sendEmail: emailSender = sendEmail,
  sendPush: pushSender = sendPush,
  limit = 25
}) {
  const workerId = `notification-delivery-worker-${Date.now()}`;
  const results = [];

  const { data: jobs, error } = await supabaseAdmin
    .from('notification_delivery_queue')
    .select('*')
    .eq('status', 'queued')
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  for (const job of jobs || []) {
    const startedAt = new Date().toISOString();
    const nextAttempts = Number(job.attempts || 0) + 1;
    const { data: lockedRows, error: lockError } = await supabaseAdmin
      .from('notification_delivery_queue')
      .update({
        status: 'processing',
        locked_at: startedAt,
        locked_by: workerId,
        attempts: nextAttempts,
        updated_at: startedAt
      })
      .eq('id', job.id)
      .eq('status', 'queued')
      .select('id');

    if (lockError) throw lockError;
    if (!lockedRows?.length) continue;

    const lockedJob = { ...job, attempts: nextAttempts };

    try {
      if (lockedJob.channel === 'email') {
        if (!lockedJob.recipient_email) {
          results.push(await markSkipped(supabaseAdmin, lockedJob, 'Missing recipient email'));
          continue;
        }

        await emailSender({
          to: lockedJob.recipient_email,
          subject: lockedJob.title,
          html: buildNotificationEmailHtml(lockedJob),
          text: `${lockedJob.title}\n\n${lockedJob.body}\n\n${lockedJob.deep_link || ''}`
        });
      } else if (isWebPushChannel(lockedJob.channel)) {
        getVapidConfig();
        if (!lockedJob.recipient_user_id) {
          results.push(await markSkipped(supabaseAdmin, lockedJob, 'Missing recipient user id'));
          continue;
        }

        const { data: subscriptions, error: subError } = await supabaseAdmin
          .from('user_push_subscriptions')
          .select('*')
          .eq('user_id', lockedJob.recipient_user_id)
          .eq('is_active', true);

        if (subError) throw subError;

        if (!subscriptions || subscriptions.length === 0) {
          results.push(await markSkipped(supabaseAdmin, lockedJob, 'No active PWA subscription'));
          continue;
        }

        for (const subscription of subscriptions) {
          await pushSender({
            supabaseAdmin,
            subscription,
            payload: {
              title: lockedJob.title,
              body: lockedJob.body,
              url: lockedJob.deep_link || '/',
              notificationId: lockedJob.notification_id,
              eventKey: lockedJob.event_key,
              resource: lockedJob.resource,
              resourceId: lockedJob.resource_id
            }
          });
        }
      } else {
        results.push(await markSkipped(supabaseAdmin, lockedJob, `Unsupported channel: ${lockedJob.channel}`));
        continue;
      }

      results.push(await markSent(supabaseAdmin, lockedJob));
    } catch (error) {
      results.push(await markFailedOrRetry(supabaseAdmin, lockedJob, error, { forceFailed: isWebPushChannel(lockedJob.channel) }));
    }
  }

  return { workerId, processed: results.length, results };
}

async function markSent(supabaseAdmin, job) {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from('notification_delivery_queue')
    .update({
      status: 'sent',
      processed_at: now,
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: now
    })
    .eq('id', job.id);

  await insertDeliveryLog(supabaseAdmin, job, 'sent');
  return resultFromJob(job, 'sent');
}

export async function markSkipped(supabaseAdmin, job, reason) {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from('notification_delivery_queue')
    .update({
      status: 'skipped',
      processed_at: now,
      locked_at: null,
      locked_by: null,
      last_error: reason,
      updated_at: now
    })
    .eq('id', job.id);

  await insertDeliveryLog(supabaseAdmin, job, 'skipped', reason);
  return resultFromJob(job, 'skipped', reason);
}

export async function markFailedOrRetry(supabaseAdmin, job, error, { forceFailed = false } = {}) {
  const attempts = Number(job.attempts || 0);
  const failedFinal = forceFailed || attempts >= MAX_ATTEMPTS;
  const status = failedFinal ? 'failed' : 'queued';
  const errorMessage = getErrorMessage(error);
  const now = new Date();

  await supabaseAdmin
    .from('notification_delivery_queue')
    .update({
      status,
      locked_at: null,
      locked_by: null,
      last_error: errorMessage,
      next_attempt_at: failedFinal ? now.toISOString() : addMinutes(now, Math.max(1, attempts)),
      updated_at: now.toISOString()
    })
    .eq('id', job.id);

  await insertDeliveryLog(supabaseAdmin, job, status, errorMessage);
  return resultFromJob(job, status, errorMessage);
}

async function insertDeliveryLog(supabaseAdmin, job, status, errorMessage = null) {
  await supabaseAdmin.from('notification_delivery_logs').insert({
    queue_id: job.id,
    notification_id: job.notification_id,
    event_key: job.event_key,
    channel: job.channel,
    recipient_user_id: job.recipient_user_id,
    recipient_email: job.recipient_email,
    status,
    error_message: errorMessage
  });
}

function resultFromJob(job, status, errorMessage = null) {
  return {
    queueId: job.id,
    notificationId: job.notification_id,
    eventKey: job.event_key,
    channel: job.channel,
    recipientUserId: job.recipient_user_id,
    recipientEmail: job.recipient_email,
    status,
    error: errorMessage
  };
}
