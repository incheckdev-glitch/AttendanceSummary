const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const saveAttempts = [];
const fakeClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  from: () => ({
    insert: payload => ({
      select: () => ({
        single: async () => {
          saveAttempts.push({ ...payload });
          if (Object.prototype.hasOwnProperty.call(payload, 'notes_optional')) {
            return { data: null, error: { message: "Could not find the 'notes_optional' column" } };
          }
          return { data: { id: 'activity-1', ...payload }, error: null };
        }
      })
    })
  })
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

const appSource = fs.readFileSync('app.js', 'utf8');
const indexSource = fs.readFileSync('index.html', 'utf8');
assert.ok(indexSource.includes('<th>Notes</th>'), 'renders a Notes table column');
assert.ok(appSource.includes("<td>${U.escapeHtml(row.notes || '—')}</td>"), 'renders canonical notes in the activity table');
assert.ok(appSource.includes('<div class="muted">Notes</div>'), 'renders canonical notes in the detail drawer');
assert.ok(appSource.includes("E.csmFormNotes.value = row?.notes || ''"), 'hydrates canonical notes when reopening the edit form');
assert.ok(appSource.includes("row.notes || ''"), 'includes canonical notes in the CSM export');
assert.ok(appSource.includes('await this.loadAndRefresh({ force: true });'), 'reloads activities from Supabase after saving');

(async () => {
  const legacyPayload = await service.toInsertPayload({ notes: '', note: 'Imported legacy note' });
  assert.strictEqual(legacyPayload.notes_optional, 'Imported legacy note', 'maps the canonical frontend note to the deployed DB note column');

  const updateWithoutNotes = await service.toUpdatePayload({ support_channel: 'Email' });
  assert.ok(!Object.prototype.hasOwnProperty.call(updateWithoutNotes, 'notes_optional'), 'preserves existing notes when no note input is supplied');

  const updateWithBlankNotes = await service.toUpdatePayload({ notes: '' });
  assert.strictEqual(updateWithBlankNotes.notes_optional, '', 'allows an explicitly supplied notes field to be cleared');

  const agreementPayload = await service.toInsertPayload({ activityContext: 'agreement_client', clientName: 'Agreement Client', notes: 'Agreement note' });
  assert.strictEqual(agreementPayload.notes_optional, 'Agreement note', 'saves notes for agreement-linked activities');

  const manualPayload = await service.toInsertPayload({ activityContext: 'manual_client', manualClientName: 'Manual Client', notes: 'Manual note' });
  assert.strictEqual(manualPayload.notes_optional, 'Manual note', 'saves notes for manual-client activities');

  const fallbackSaved = await service.createActivity({ activityContext: 'manual_client', manualClientName: 'Fallback Client', notes: 'Fallback note' });
  assert.strictEqual(saveAttempts[0].notes_optional, 'Fallback note', 'tries the deployed DB note column first');
  assert.strictEqual(saveAttempts[1].notes, 'Fallback note', 'retries a legacy DB note column without dropping the note');
  assert.strictEqual(fallbackSaved.notes, 'Fallback note', 'normalizes the saved fallback note for the frontend');

  console.log('CSM activity notes tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
