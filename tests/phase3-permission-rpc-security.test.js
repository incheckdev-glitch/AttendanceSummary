const assert = require('assert');
const fs = require('fs');

const migration = fs.readFileSync(
  'sql/migrations/20260715_phase3_secure_role_permissions_rpc.sql',
  'utf8'
);

assert.match(
  migration,
  /create function public\.get_my_role_permissions\(\)[\s\S]*security definer[\s\S]*set search_path = pg_catalog, public/i,
  'permission RPC must use a controlled SECURITY DEFINER search path'
);
assert.match(
  migration,
  /where p\.id = auth\.uid\(\)[\s\S]*coalesce\(p\.is_active, false\) = true/i,
  'permission RPC must resolve only the signed-in active profile'
);
assert.match(
  migration,
  /regexp_replace\([\s\S]*rp\.role_key[\s\S]*= cp\.normalized_role_key/i,
  'permission rows must match the caller profile role exactly after normalization'
);
assert.match(
  migration,
  /where coalesce\(rp\.is_active, true\) = true/i,
  'inactive permission rows must not be returned'
);
assert.doesNotMatch(
  migration,
  /normalized_role_key\s*=\s*any\s*\([^)]*allowed_roles/i,
  'broad allowed_roles membership must not replace exact role matching'
);
assert.match(
  migration,
  /revoke all on function public\.get_my_role_permissions\(\) from public;/i,
  'PUBLIC must not execute the permission RPC'
);
assert.match(
  migration,
  /revoke all on function public\.get_my_role_permissions\(\) from anon;/i,
  'anonymous users must not execute the permission RPC'
);
assert.match(
  migration,
  /grant execute on function public\.get_my_role_permissions\(\) to authenticated;/i,
  'authenticated users must be able to load their own permission matrix'
);

console.log('Phase 3 permission RPC security checks passed.');
