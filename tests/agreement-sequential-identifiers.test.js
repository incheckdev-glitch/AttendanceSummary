const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'supabase-data.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'agreements.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'sql/migrations/20260730_agreement_sequential_number_fix.sql'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(api.includes("devLog('[agreements/create] complete Supabase insert payload'"), 'development insert payload must be logged');
assert(api.includes('delete sanitized.agreement_id'), 'create sanitizer must omit the legacy agreement id');
assert(api.includes('delete sanitized.agreement_number'), 'create sanitizer must let PostgreSQL allocate the display number');
assert(api.includes('delete sanitized.sequence_number'), 'create sanitizer must reject client sequence allocation');
assert(api.includes('Expected a standard integer but received'), 'integer errors must identify the invalid field and value');
assert(!api.includes("client.rpc('create_agreement_from_proposal'"), 'accepted proposals must not use the timestamp-generating legacy RPC');
assert(api.includes(".from('proposal_items')"), 'accepted proposal items must be copied into agreement items');
assert(ui.includes('delete agreement.id;') && ui.includes('delete agreement.sequence_number;'), 'UI create payload must not generate database identifiers');
assert(!/generateAgreementNumber\(\)\s*\{[^}]*Date\.now/s.test(ui), 'agreement number must not be timestamp-generated');
assert(migration.includes("new.sequence_number := allocated"), 'trigger must allocate a normal integer');
assert(migration.includes("'Agreement#' || lpad(allocated::text, 5, '0')"), 'display number must be stored separately as text');
assert(migration.includes('create unique index if not exists agreements_agreement_number_key'), 'display numbers must be unique');
assert(migration.includes("nextval('public.agreement_number_seq')"), 'concurrent creation must use a PostgreSQL sequence');
assert(migration.includes("column_name = 'agreement_id' and data_type = 'integer'"), 'legacy integer agreement_id must receive the normal sequence');

console.log('agreement sequential identifier checks passed');
