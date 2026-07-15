const assert = require('assert');
const fs = require('fs');

const accounting = fs.readFileSync('accounting.js', 'utf8');
const hr = fs.readFileSync('hr.js', 'utf8');

function functionSlice(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `${name} must exist`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  assert(end > start, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

assert.doesNotMatch(accounting, /Accounting saved locally|Journal saved locally|Posted locally/, 'Accounting must never present browser-only data as saved or posted');
assert.match(accounting, /if \(!supabase\) throw new Error\('Supabase client unavailable'\)/, 'Accounting writes must fail closed without Supabase');
assert.match(accounting, /const pendingAccountingWrites = new Set\(\)/, 'Accounting must block duplicate form saves');
assert.match(accounting, /Read-only mode\.[\s\S]*Accounting changes are disabled until Supabase reconnects/, 'Accounting must clearly show cached data as read-only');

const persistRow = functionSlice(accounting, 'persistRow', 'accountById');
assert(persistRow.indexOf('await upsertRemote(table, candidate)') < persistRow.indexOf('state[collection]'), 'Accounting state may only change after the database confirms the write');
assert.match(persistRow, /return null;[\s\S]*finally[\s\S]*pendingAccountingWrites\.delete/, 'Failed and duplicate Accounting saves must stop success handling and release the lock');

const postBalancedJournal = functionSlice(accounting, 'postBalancedJournal', 'syncVisibleSources');
assert(postBalancedJournal.indexOf('await upsertRemote(TABLES.journals, journal)') < postBalancedJournal.indexOf('state.journals.push(journal)'), 'Journal UI/cache state must update only after all remote inserts complete');
assert.match(postBalancedJournal, /Ledger posting failed\. No local journal was created/, 'Journal failure must be explicit and must not claim a local post');

assert.doesNotMatch(hr, /HR saved locally/, 'HR must never present browser-only data as saved');
assert.match(hr, /const pendingHrWrites = new Set\(\)/, 'HR must block duplicate writes');
assert.match(hr, /Read-only mode\.[\s\S]*HR changes are disabled until Supabase reconnects/, 'HR must clearly show cached data as read-only');

const syncUpsert = functionSlice(hr, 'syncUpsert', 'syncDelete');
assert.doesNotMatch(syncUpsert.split('try {')[0], /saveLocal\(\)/, 'HR must not cache unconfirmed changes before the database write');
assert.match(syncUpsert, /if \(!supabase\) throw new Error\('Supabase client unavailable'\)/, 'HR writes must fail closed without Supabase');
assert.match(syncUpsert, /restoreConfirmedHrCache\(\)[\s\S]*HR was not saved[\s\S]*throw error/, 'HR failed saves must restore the last confirmed cache and stop success handling');

const syncDelete = functionSlice(hr, 'syncDelete', 'statusChip');
assert.match(syncDelete, /const \{ error \} = await supabase\.from\(table\)\.delete\(\)\.eq\('id', id\);[\s\S]*if \(error\) throw error/, 'HR deletes must inspect the Supabase error result');
assert.match(syncDelete, /restoreConfirmedHrCache\(\)[\s\S]*HR deletion failed[\s\S]*throw error/, 'HR failed deletes must restore confirmed state and stop success handling');

console.log('Phase 2 Accounting and HR data-integrity checks passed.');
