const assert = require('assert');
const fs = require('fs');

const creditNotes = fs.readFileSync('credit-notes.js', 'utf8');
const api = fs.readFileSync('api.js', 'utf8');
const supabaseData = fs.readFileSync('supabase-data.js', 'utf8');
const migration = fs.readFileSync('CREDIT_NOTE_REQUEST_KEY_IDEMPOTENCY.sql', 'utf8');

assert.match(creditNotes, /if \(this\.state\.saving\) return;\s*this\.setSaving\(true\);/, 'save must guard and disable immediately');
assert.match(creditNotes, /button\.textContent = this\.state\.saving \? 'Saving\.\.\.' : 'Save Credit Note'/, 'save button must show Saving... and restore the full action label');
assert.match(creditNotes, /credit_note_request_key: this\.state\.requestKey/, 'create payload must include the modal request key');
assert.match(creditNotes, /removeEventListener\('submit', this\._saveSubmitHandler\)/, 'submit handler must be cleaned up before binding');
assert.match(creditNotes, /isCancelledCreditNote\(note = \{\}\)/, 'cancelled preview helper must exist');
assert.match(creditNotes, /this\.isCancelledCreditNote\(note\) \? '<div class="cancelled-watermark"/, 'watermark must depend on cancelled status');

const previewStart = creditNotes.indexOf('buildPreviewHtml(note = {}, invoice = {})');
const previewEnd = creditNotes.indexOf('async preview(id)', previewStart);
const preview = creditNotes.slice(previewStart, previewEnd);
const metaStart = preview.indexOf('<div class="meta">');
const metaEnd = preview.indexOf('</div></header>', metaStart);
const meta = preview.slice(metaStart, metaEnd);
assert.match(meta, /Credit Note #/);
assert.match(meta, /Credit Note Date/);
assert.doesNotMatch(meta, /Invoice #|Currency|Status/, 'top-right preview metadata must only contain credit note number and date');
assert.match(preview, /Related Invoice Details[\s\S]*Invoice:/, 'invoice number must remain in related invoice details');

assert.match(api, /_creditNoteCreateRequests\.has\(requestKey\)/, 'API must reuse an in-flight create request');
assert.match(supabaseData, /eq\('credit_note_request_key', finalCreateRecord\.credit_note_request_key\)/, 'backend must find an existing request key');
assert.match(supabaseData, /duplicatePrevented: true/, 'backend must return an existing credit note');
assert.match(migration, /create unique index if not exists credit_notes_request_key_unique/, 'request key must have a unique database index');

console.log('credit note idempotency and preview checks passed');
