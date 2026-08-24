const fs = require('fs');
const assert = require('assert');

const read = file => fs.readFileSync(file, 'utf8');
const assistant = read('ai-assistant.js');
const edge = read('supabase/functions/incheck360-ai-assistant/index.ts');
const html = read('index.html');
const permissions = read('permissions.js');
const migration = read('sql/migrations/20260824_ai_action_assistant_v1.sql');

assert.match(html, /id="aiAssistantTab"[\s\S]*data-permission-resource="ai_assistant"[\s\S]*data-permission-action="use"/);
assert.match(html, /id="aiAssistantView"/);
assert.match(html, /src="\/ai-assistant\.js\?v=20260824-action-assistant-v1"/);

assert.match(permissions, /ai_assistant:\s*Object\.freeze\(\{[^}]*use:\s*\['admin'\]/);
assert.match(assistant, /getAppRole\(\) !== 'admin'/);
assert.match(assistant, /Api\.requestWithSession\(validation\.resource, validation\.actionName, payload\)/);
assert.match(assistant, /const AI_ACTION_POLICY = Object\.freeze/);
assert.doesNotMatch(assistant, /\busers:\s*\[/);
assert.doesNotMatch(assistant, /\brole_permissions:\s*\[/);
assert.doesNotMatch(assistant, /\bauth:\s*\[/);

assert.match(edge, /auth\.getUser\(token\)/);
assert.match(edge, /role !== 'admin'/);
assert.match(edge, /name:\s*'execute_erp_action'/);
assert.match(edge, /parallel_tool_calls:\s*false/);
assert.match(edge, /const ERP_WRITE_ACTIONS:/);
assert.match(edge, /Unsupported controlled ERP action/);
assert.match(edge, /forcedConfirmation/);
assert.match(edge, /MAX_MESSAGE_CHARS = 12000/);
assert.match(assistant, /MAX_ACTION_STEPS = 8/);
assert.match(assistant, /Duplicate AI action prevented/);
assert.match(edge, /Never write directly to the database/);
assert.match(edge, /Security administration is excluded/);
assert.doesNotMatch(edge, /current_user.*role/s);

assert.match(migration, /create table if not exists public\.ai_action_audit/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.ai_action_audit from anon, authenticated/);
assert.match(migration, /array\['admin'\]::text\[\]/);

console.log('AI Action Assistant V1 safety and wiring checks passed.');
