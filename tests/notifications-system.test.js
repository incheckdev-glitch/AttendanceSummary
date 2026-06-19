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
