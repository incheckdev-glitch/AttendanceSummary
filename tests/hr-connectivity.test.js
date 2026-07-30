const assert = require('assert');
const fs = require('fs');

const hr = fs.readFileSync('hr.js', 'utf8');
const client = fs.readFileSync('supabase-client.js', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');

assert.match(client, /let cachedClient = null[\s\S]*if \(cachedClient\) return cachedClient/, 'Supabase browser client must be a singleton');
assert.match(client, /VITE_SUPABASE_URL[\s\S]*VITE_SUPABASE_ANON_KEY/, 'Vite Supabase runtime variables must be supported');
assert.match(config, /runtimeConfig\.VITE_SUPABASE_URL[\s\S]*runtimeConfig\.VITE_SUPABASE_ANON_KEY/, 'runtime config must resolve Vite Supabase variables');
assert.match(hr, /from\(TABLES\.employees\)\.select\('id'\)\.limit\(1\)/, 'health check must issue a lightweight valid table query');
assert.match(hr, /details\.code === '42501'[\s\S]*details\.code === '42P01'/, 'RLS and missing relation failures must have distinct classifications');
assert.match(hr, /reason === 'permission' \|\| reason === 'query'[\s\S]*setConnection\('connected'/, 'query/RLS errors must prove connectivity rather than activate read-only mode');
assert.match(hr, /auth\.refreshSession\(\)[\s\S]*result = await operation\(\)/, 'expired sessions must refresh and retry once');
assert.match(hr, /Promise\.allSettled/, 'one failed HR table query must not disable the whole module');
assert.match(hr, /hrRetryConnectionBtn[\s\S]*retryConnection\(\)/, 'read-only warning must provide a retry action');
assert.match(hr, /addEventListener\?\.\('online'[\s\S]*retryConnection\(\)/, 'internet reconnection must trigger verified automatic recovery');
assert.doesNotMatch(hr, /const readOnly = state\.dataSource !== 'supabase'/, 'cache presence/data source alone must not control read-only mode');

console.log('HR connectivity resilience checks passed.');
