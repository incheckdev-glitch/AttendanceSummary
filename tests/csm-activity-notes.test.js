const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) }
};
const window = {
  SupabaseClient: { getClient: () => fakeClient },
  Session: {
    user: () => ({ email: 'csm@example.com', profile: { full_name: 'CSM User' } }),
    authContext: () => ({}),
    role: () => 'admin'
  }
};
vm.runInNewContext(fs.readFileSync('csm-service.js', 'utf8'), { window, console });
const service = window.CsmActivityService;

for (const [field, value] of [
  ['notes', 'Canonical note'],
  ['note', 'Legacy note'],
  ['activity_notes', 'Activity notes'],
  ['activity_note', 'Activity note'],
  ['notes_optional', 'Optional note'],
  ['description', 'Description note'],
  ['remarks', 'Remark note'],
  ['comments', 'Comments note'],
  ['comment', 'Comment note']
]) {
  assert.strictEqual(service.normalizeCsmRow({ [field]: value }).notes, value, `normalizes ${field}`);
}

assert.strictEqual(service.normalizeCsmRow({ notes: '', note: 'Imported legacy note' }).notes, 'Imported legacy note');

(async () => {
  const legacyPayload = await service.toInsertPayload({ notes: '', note: 'Imported legacy note' });
  assert.strictEqual(legacyPayload.notes, 'Imported legacy note', 'saves a populated legacy alias to canonical notes');

  const updateWithoutNotes = await service.toUpdatePayload({ support_channel: 'Email' });
  assert.ok(!Object.prototype.hasOwnProperty.call(updateWithoutNotes, 'notes'), 'preserves existing notes when no note input is supplied');

  const updateWithBlankNotes = await service.toUpdatePayload({ notes: '' });
  assert.strictEqual(updateWithBlankNotes.notes, '', 'allows an explicitly supplied notes field to be cleared');

  console.log('CSM activity notes tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
