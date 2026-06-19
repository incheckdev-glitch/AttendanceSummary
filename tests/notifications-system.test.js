const assert = require('assert');
const fs = require('fs');

const data = fs.readFileSync('supabase-data.js', 'utf8');
const settings = fs.readFileSync('notification-settings.js', 'utf8');
const biners = fs.readFileSync('biners.js', 'utf8');
const helper = fs.readFileSync('notification-template-helpers.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const topLevelDeepLinkIdx = data.indexOf('  function getRecordDeepLink(resourceOrConfig, record = {})');
const notificationDispatcherIdx = data.indexOf('  async function createNotificationAndPush(payload = {}, context = \'\')');
assert(topLevelDeepLinkIdx > 0 && topLevelDeepLinkIdx < notificationDispatcherIdx, 'getRecordDeepLink must be in the top-level notification scope before createNotificationAndPush uses it');
assert(data.includes('function renderNotificationTemplate(template = \'\', context = {})'), 'renderNotificationTemplate must exist in notification scope');
assert(data.includes('target_user_id: currentUserId || null'), 'Notification Setup Test must target the current user');
assert(data.includes("resource: 'biners'"), 'Biners notification default must be registered');
assert(data.includes("action: 'biners_entry_created'"), 'Biners entry-created action must be registered');
assert(data.includes("client.rpc('dispatch_notification'") || data.includes("getClient().rpc('dispatch_notification'"), 'in-app notification path must dispatch notifications through unified RPC');
assert(data.includes("source: 'notification_delivery_queue'"), 'PWA/email must be queued through notification_delivery_queue');
assert(!data.includes("client.functions.invoke('send-web-push-v2'"), 'Normal modules must not invoke send-web-push-v2 directly');
assert(data.includes('createBinersEntryNotification({'), 'Biners create flow must call the notification helper after saving schedules');
assert(settings.includes('Test notification result'), 'Notification Setup test must show channel-specific results');

console.log('Notification system checks passed.');

const migration = fs.readFileSync('sql/migrations/20260619_unified_notification_queue_trigger.sql', 'utf8');
assert(migration.includes('trg_notification_unified_queue'), 'Unified notification queue trigger must be installed');
assert(migration.includes('notification_delivery_queue_notification_channel_idx'), 'Queue must enforce max one row per notification/channel');
assert(settings.includes("['queued', 'sent', 'failed', 'skipped']"), 'Notification Setup test must accept queued/sent/failed/skipped statuses');

const queueWorker = fs.readFileSync('supabase/functions/process-notification-queue/index.ts', 'utf8');
assert(queueWorker.includes("const tables = ['user_push_subscriptions', 'push_subscriptions'];"), 'Queue processor must check both subscription tables');
assert(queueWorker.includes("const userColumns = ['user_id', 'recipient_user_id', 'auth_user_id'];"), 'Queue processor must match recipient_user_id against all supported subscription user columns');
assert(queueWorker.includes('isActiveSubscription'), 'Queue processor must use flexible active subscription detection');
assert(queueWorker.includes('permission_status') && queueWorker.includes("'granted'"), 'Queue processor must treat granted permission as active');
assert(queueWorker.includes('No active PWA subscription found for recipient_user_id'), 'Queue processor skipped rows must explain missing recipient subscriptions');
assert(!queueWorker.includes(".eq('user_id', userId).eq('is_active', true)"), 'Queue processor must not only check user_id/is_active on one subscription table');
assert(migration.includes('notifications.recipient_user_id is required'), 'Notifications without recipient_user_id must be rejected');
assert(migration.includes('dispatch_notification requires at least one recipient_user_id'), 'Dispatch RPC must reject empty recipient lists');
