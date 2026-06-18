const fs = require('fs');
const assert = require('assert');

const communication = fs.readFileSync('communication-centre.js', 'utf8');
const notifications = fs.readFileSync('notifications.js', 'utf8');
const migration = fs.readFileSync('sql/migrations/20260611_mark_communication_notifications_read.sql', 'utf8');

assert(communication.includes('await markCommunicationNotificationsRead(id);'), 'successful conversation open must mark related notifications');
assert(communication.includes('return false;'), 'conversation open must report failed opens');
assert(communication.includes('notificationReadRequests'), 'conversation opens must deduplicate in-flight notification updates');
assert(notifications.includes("client.rpc('mark_conversation_notifications_read'"), 'frontend must call conversation notification RPC');
assert(notifications.includes('applyCommunicationNotificationsRead(normalizedConversationId)'), 'frontend must update notification state immediately');
assert(notifications.includes("resource === 'communication_centre' && Boolean(targetId)"), 'communication notification clicks must defer marking until open succeeds');
assert(migration.includes('p_user_id uuid default auth.uid()'), 'RPC must accept the current user id');
assert(migration.includes('v_user_id uuid := coalesce(p_user_id, auth.uid())'), 'RPC must scope updates to the supplied/authenticated user');
assert(migration.includes("v_recipient_column"), 'RPC must update only recipient-owned notifications');
assert(migration.includes("'metadata', 'meta', 'payload', 'data'"), 'RPC must support JSON notification fields');
assert(migration.includes("'resource_id', 'entity_id'"), 'RPC must support resource/entity notification links');
assert(migration.includes("'deep_link', 'url', 'link_target'"), 'RPC must support URL/deep-link matching');
assert(migration.includes("v_unread_condition"), 'RPC must update only unread notifications');

console.log('communication notification read checks passed');
