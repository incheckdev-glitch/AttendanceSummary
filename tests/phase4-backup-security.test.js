const assert = require('assert');
const fs = require('fs');

const endpoint = fs.readFileSync('api/backup/download.js', 'utf8');
const frontend = fs.readFileSync('backup-center.js', 'utf8');
const migration = fs.readFileSync('sql/migrations/20260716_phase4_backup_runtime_guard.sql', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const readme = fs.readFileSync('README_BACKUP_CENTER_ONE_CLICK.md', 'utf8');
const restoreGuide = fs.readFileSync('docs/BACKUP_RESTORE_VERIFICATION.md', 'utf8');

assert.match(endpoint, /if \(req\.method !== 'POST'\)/, 'backup endpoint must be POST-only');
assert.match(endpoint, /res\.setHeader\('Allow', 'POST'\)/, 'backup endpoint must advertise only POST');
assert.doesNotMatch(endpoint, /\['POST', 'GET'\]/, 'backup endpoint must not retain GET support');
assert.doesNotMatch(endpoint, /req\.query\?\.secret|x-backup-secret|BACKUP_CENTER_SECRET|ADMIN_BACKUP_SECRET/, 'URL/shared-secret authorization bypass must be removed');
assert.match(endpoint, /X-Backup-Request|x-backup-request/, 'backup endpoint must require an application request marker');
assert.match(endpoint, /application\/json/, 'backup endpoint must require JSON requests');
assert.match(endpoint, /const ADMIN_ROLES = new Set\(\['admin'\]\)/, 'only the exact Admin role may download backups');
assert.match(endpoint, /const supabaseUrl = getEnv\('SUPABASE_URL'\)/, 'backup endpoint must use the server-only Supabase URL');
assert.doesNotMatch(endpoint, /NEXT_PUBLIC_SUPABASE_URL|VITE_SUPABASE_URL/, 'backup endpoint must not fall back to public frontend environment variables');
assert.match(endpoint, /BACKUP_ENVIRONMENT/, 'backup endpoint must bind to the deployment environment');
assert.match(endpoint, /BACKUP_EXPECTED_PROJECT_REF/, 'backup endpoint must bind to the expected Supabase project');
assert.match(endpoint, /profile\.is_active !== true/, 'only explicitly active profiles may download backups');
assert.match(endpoint, /return loadProfileByColumn\(supabaseAdmin, 'id', user\.id\)/, 'backup authorization must bind the profile to the authenticated user id');
assert.doesNotMatch(endpoint, /process\.env\.VERCEL_ENV \|\| process\.env\.NODE_ENV/, 'deployment binding must not fall back to NODE_ENV');
assert.match(endpoint, /backup_center_acquire_guard/, 'backup endpoint must acquire the database runtime guard');
assert.match(endpoint, /backup_center_release_guard/, 'backup endpoint must release the database runtime guard');
assert.match(endpoint, /Retry-After/, 'limited backup requests must receive Retry-After');
assert.match(endpoint, /createHash\('sha256'\)/, 'backup endpoint must calculate SHA-256 integrity values');
assert.match(endpoint, /X-Backup-SHA256/, 'backup endpoint must return the ZIP SHA-256');
assert.match(endpoint, /Backup failed\. Review the server logs and Backup Center history\./, 'client errors must avoid leaking internal failure details');

assert.match(frontend, /method: 'POST'/, 'Backup Center must use POST');
assert.match(frontend, /'X-Backup-Request': 'incheck360-admin'/, 'Backup Center must send the request marker');
assert.match(frontend, /credentials: 'same-origin'/, 'Backup Center request must be same-origin');
assert.match(frontend, /X-Backup-SHA256/, 'Backup Center must read the returned checksum');
assert.match(frontend, /application\/zip/, 'Backup Center must reject unexpected response types');

assert.match(migration, /create table if not exists public\.backup_runtime_guards/i, 'migration must create the runtime guard table');
assert.match(migration, /for update/i, 'guard acquisition must lock the singleton row atomically');
assert.match(migration, /backup_in_progress/, 'guard must distinguish concurrent backups');
assert.match(migration, /rate_limited/, 'guard must enforce a cooldown');
assert.match(migration, /revoke all on function public\.backup_center_acquire_guard[\s\S]*from anon/i, 'anonymous users must not execute the guard RPC');
assert.match(migration, /grant execute on function public\.backup_center_acquire_guard[\s\S]*to service_role/i, 'only the service role should execute the guard RPC');
assert.doesNotMatch(migration, /grant (?:select|insert|update|all)[\s\S]*backup_runtime_guards[\s\S]*to service_role/i, 'the service role should use the guarded RPC instead of direct table access');

const headerEntries = (vercel.headers || []).flatMap(rule => rule.headers || []);
const headerMap = new Map(headerEntries.map(item => [item.key, item.value]));
assert.strictEqual(headerMap.get('X-Content-Type-Options'), 'nosniff');
assert.strictEqual(headerMap.get('X-Frame-Options'), 'DENY');
assert(headerMap.has('Strict-Transport-Security'), 'HSTS header is required');
assert(headerMap.has('Referrer-Policy'), 'Referrer-Policy header is required');
assert(headerMap.has('Permissions-Policy'), 'Permissions-Policy header is required');
assert.strictEqual(headerMap.get('X-Robots-Tag'), 'noindex, nofollow, nosnippet');
assert.strictEqual(headerMap.get('Cross-Origin-Resource-Policy'), 'same-origin');

assert.match(readme, /BACKUP_ENVIRONMENT=production/, 'deployment environment binding must be documented');
assert.match(readme, /BACKUP_EXPECTED_PROJECT_REF/, 'project binding must be documented');
assert.match(readme, /20260716_phase4_backup_runtime_guard\.sql/, 'Phase 4 migration must be documented');
assert.match(restoreGuide, /non-production Supabase project/i, 'restoration must be tested outside production');
assert.match(restoreGuide, /sha256sum/, 'checksum verification must be documented');
assert.match(restoreGuide, /RLS/i, 'restoration verification must include RLS checks');
assert.match(restoreGuide, /financial reconciliation/i, 'restoration verification must include financial reconciliation');

console.log('Phase 4 backup and deployment security checks passed.');
