function isWebPushChannel(channel = '') {
  return ['pwa', 'push', 'web_push'].includes(String(channel || '').toLowerCase());
}

export async function processNotificationDeliveryQueue({ supabase, sendEmail, sendPush }) {
  const { data: jobs, error } = await supabase
    .from("notification_delivery_queue")
    .select("*")
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    console.error("Failed to load notification delivery queue:", error);
    return;
  }

  for (const job of jobs || []) {
    await supabase
      .from("notification_delivery_queue")
      .update({
        status: "processing",
        attempts: Number(job.attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    try {
      if (job.channel === "email") {
        if (!job.recipient_email) {
          await markJobSkipped(supabase, job, "Missing recipient email");
          continue;
        }

        await sendEmail({
          to: job.recipient_email,
          subject: job.title,
          html: buildNotificationEmailHtml(job),
          text: `${job.body}\n\n${job.deep_link || ""}`,
        });
      }

      if (isWebPushChannel(job.channel)) {
        if (!job.recipient_user_id) {
          await markJobSkipped(supabase, job, "Missing recipient user id");
          continue;
        }

        const { data: subscriptions, error: subError } = await supabase
          .from("user_push_subscriptions")
          .select("*")
          .eq("user_id", job.recipient_user_id)
          .eq("is_active", true);

        if (subError) throw subError;

        if (!subscriptions || subscriptions.length === 0) {
          await markJobSkipped(supabase, job, "No active PWA subscription");
          continue;
        }

        for (const sub of subscriptions) {
          try {
            await sendPush({
              subscription: {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              payload: {
                title: job.title,
                body: job.body,
                url: job.deep_link || "/",
                notificationId: job.notification_id,
                eventKey: job.event_key,
                resource: job.resource,
                resourceId: job.resource_id,
              },
            });
          } catch (pushError) {
            const statusCode = Number(pushError?.statusCode || pushError?.status || pushError?.code || 0);
            if (statusCode === 404 || statusCode === 410) {
              await supabase
                .from("user_push_subscriptions")
                .update({
                  is_active: false,
                  updated_at: new Date().toISOString(),
                })
                .eq("endpoint", sub.endpoint);
            }
            throw pushError;
          }
        }
      }

      await supabase
        .from("notification_delivery_queue")
        .update({
          status: "sent",
          processed_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      await supabase.from("notification_delivery_logs").insert({
        queue_id: job.id,
        notification_id: job.notification_id,
        event_key: job.event_key,
        channel: job.channel,
        recipient_user_id: job.recipient_user_id,
        recipient_email: job.recipient_email,
        status: "sent",
      });
    } catch (err) {
      const attempts = Number(job.attempts || 0) + 1;
      const failedFinal = isWebPushChannel(job.channel) || attempts >= 3;

      await supabase
        .from("notification_delivery_queue")
        .update({
          status: failedFinal ? "failed" : "queued",
          attempts,
          last_error: err.message || String(err),
          next_attempt_at: new Date(Date.now() + attempts * 60000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      await supabase.from("notification_delivery_logs").insert({
        queue_id: job.id,
        notification_id: job.notification_id,
        event_key: job.event_key,
        channel: job.channel,
        recipient_user_id: job.recipient_user_id,
        recipient_email: job.recipient_email,
        status: failedFinal ? "failed" : "queued",
        error_message: err.message || String(err),
      });
    }
  }
}

async function markJobSkipped(supabase, job, reason) {
  await supabase
    .from("notification_delivery_queue")
    .update({
      status: "skipped",
      last_error: reason,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  await supabase.from("notification_delivery_logs").insert({
    queue_id: job.id,
    notification_id: job.notification_id,
    event_key: job.event_key,
    channel: job.channel,
    recipient_user_id: job.recipient_user_id,
    recipient_email: job.recipient_email,
    status: "skipped",
    error_message: reason,
  });
}

function buildNotificationEmailHtml(job) {
  const link = job.deep_link
    ? `<p><a href="${job.deep_link}">Open in ERP</a></p>`
    : "";

  return `
    <div>
      <h2>${job.title}</h2>
      <p>${job.body}</p>
      ${link}
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.processNotificationDeliveryQueue = processNotificationDeliveryQueue;
}
