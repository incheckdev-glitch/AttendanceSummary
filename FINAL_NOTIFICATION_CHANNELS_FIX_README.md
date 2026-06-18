# Final Notification Channels Runtime Fix

This patch fixes the current symptom where only in-app notifications work while PWA and email do not.

Root cause:
- The new central dispatcher created the in-app notification immediately.
- PWA and email were only queued in `notification_delivery_queue`.
- If the queue worker is not running, unauthorized, or missing SMTP/VAPID env variables, PWA/email stay queued/failed/skipped.

What this patch changes:
1. `src/services/notificationDispatcher.js`
   - Keeps using `dispatch_notification` for in-app and queue creation.
   - Attempts to process `/api/notifications/process-queue` immediately.
   - If the queue worker does not send email/PWA, it uses the existing working direct channels:
     - Email via `/api/proxy` with `resource=notifications&action=send_email`.
     - PWA via Supabase Edge Function `send-web-push-v2`.
   - Updates queued rows to `sent/skipped/failed` after direct fallback when allowed.

2. `notification-service.js`
   - After business notification dispatch, it now attempts the queue worker first.
   - If the queue worker does not send, it falls back to direct email/PWA sending.
   - It returns `channelResults` for debugging.

3. `index.html`
   - Cache-busts `notification-service.js`, `notification-settings.js`, and `push-notifications.js`.

Required backend/environment checks:
- Email direct fallback still requires your existing `/api/proxy` SMTP config to work.
- PWA direct fallback requires deployed Supabase Edge Function `send-web-push-v2` and active rows in `user_push_subscriptions`.
- Browser must allow notification permission.
- Service worker must be registered.

After applying:
- Hard refresh the browser.
- Re-enable PWA from Notification settings.
- Send a test notification.
- Check `notification_delivery_queue` for `email` and `pwa` status.
