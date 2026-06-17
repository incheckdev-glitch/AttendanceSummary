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
assert(data.includes('const fallbackRules = !matchingRules.length'), 'notification dispatcher must fall back to registered defaults when a DB rule is missing');
assert(data.includes('forcedTestUserIds'), 'Notification Setup Test must force the current user as a direct test recipient');
assert(data.includes('target_user_id: currentUserId || null'), 'Notification Setup Test must target the current user');
assert(data.includes("resource: 'biners'"), 'Biners notification default must be registered');
assert(data.includes("action: 'biners_entry_created'"), 'Biners entry-created action must be registered');
assert(data.includes("createNotificationHubEvent(sanitizedHubPayload"), 'in-app notification path must create Notification Hub events');
assert(data.includes("sendPwaPushForNotification"), 'PWA push path must be present');
assert(data.includes("client.functions.invoke('send-web-push-v2'"), 'PWA push must invoke send-web-push-v2');
assert(data.includes('createBinersEntryNotification({'), 'Biners create flow must call the notification helper after saving schedules');
assert.match(data, /const allowedSchedule = \['schedule_key','biners_entry_id','entry_number','schedule_no'/, 'data layer schedule inserts must include schedule_no');
assert.match(data, /schedule_no: Number\(schedule\.schedule_no \|\| idx \+ 1\)/, 'data layer must save sequential schedule_no values');
assert.match(biners, /schedule_no: Number\(schedule\.schedule_no \|\| index \+ 1\)/, 'frontend schedule payload must include sequential schedule_no values');
assert(settings.includes('Test notification result'), 'Notification Setup test must show channel-specific results');
assert(helper.includes('global.getRecordDeepLink'), 'shared notification template helpers must expose getRecordDeepLink globally');
assert(html.includes('supabase-data.js?v=20260617-notification-audit1'), 'index.html must cache-bust updated supabase-data.js');
assert(html.includes('notification-settings.js?v=20260617-notification-audit1'), 'index.html must cache-bust updated notification-settings.js');
assert(html.includes('biners.js?v=20260617-notification-audit1'), 'index.html must cache-bust updated biners.js');

console.log('Notification system checks passed.');
