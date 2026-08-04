const assert = require('assert');
const fs = require('fs');

const proposals = fs.readFileSync('proposals.js', 'utf8');
const data = fs.readFileSync('supabase-data.js', 'utf8');
const migration = fs.readFileSync('sql/migrations/20260804_admin_accept_expired_proposal.sql', 'utf8');

assert.match(proposals, /role === 'admin'/, 'the action must be visible only to the Admin role');
assert.match(proposals, /Mark as Accepted/, 'expired proposal details must expose the action');
assert.match(proposals, /Accept Expired Proposal\?/, 'the confirmation must identify the override');
assert.match(proposals, /Reason for accepting expired proposal/, 'the optional audit reason must be collected');
assert.match(proposals, /status === 'accepted'.*return false/, 'accepted proposals with old validity dates must not expire in the UI');
assert.match(data, /role\(\) !== 'admin'/, 'the data layer must reject non-Admin callers');
assert.match(data, /admin_accept_expired_proposal/, 'the data layer must use the atomic database function');
assert.match(migration, /for update/, 'simultaneous acceptance must serialize on the proposal row');
assert.match(migration, /status = 'accepted', accepted_at = v_now, accepted_by = auth\.uid\(\)/, 'acceptance metadata must update together');
assert.match(migration, /proposal_expiry_acceptance_audit/, 'the override must be audited');
assert.match(migration, /old\.status in \('accepted', 'rejected', 'converted', 'converted_to_agreement'\)/, 'terminal statuses must be protected from expiry jobs');

console.log('Expired proposal Admin acceptance checks passed.');
