const assert = require('assert');
const fs = require('fs');

const proposals = fs.readFileSync('proposals.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const ui = fs.readFileSync('ui.js', 'utf8');
const dataLayer = fs.readFileSync('supabase-data.js', 'utf8');

assert.match(index, /id="proposalFormInternalNotes"[\s\S]*placeholder="Add internal notes for this proposal\.\.\."/, 'proposal form must include the internal notes textarea with the required placeholder');
assert.match(index, /Internal only\. This note will not appear in the proposal preview or PDF\./, 'proposal form must disclose internal-only behavior');
assert.match(ui, /'proposalFormInternalNotes'/, 'proposal internal notes textarea must be cached');
assert.match(proposals, /'internal_notes'/, 'proposal fields must include internal_notes');
assert.match(proposals, /set\(E\.proposalFormInternalNotes, proposal\.internal_notes \|\| proposal\.proposal_notes \|\| proposal\.internal_note \|\| proposal\.notes \|\| ''\)/, 'editing/viewing must load internal notes and legacy aliases');
assert.match(proposals, /internal_notes: String\(E\.proposalFormInternalNotes\?\.value \|\| ''\)\.trim\(\) \|\| null/, 'save payload must use internal_notes');
assert.match(proposals, /sanitized\.internal_notes = String\(sanitized\.internal_notes \?\? sanitized\.proposal_notes \?\? sanitized\.internal_note \?\? sanitized\.notes \?\? ''\)\.trim\(\) \|\| null/, 'save normalization must map legacy note aliases to internal_notes');
assert.match(dataLayer, /'terms_conditions', 'internal_notes'/, 'data layer must allow proposals.internal_notes');

const documentStart = proposals.indexOf('buildProposalDocumentHtml(proposal = {}, items = [], options = {})');
const documentEnd = proposals.indexOf('buildProposalPreviewHtml(proposal = {}, items = [])', documentStart);
assert(documentStart >= 0 && documentEnd > documentStart, 'proposal document renderer must be locatable');
const documentRenderer = proposals.slice(documentStart, documentEnd);
assert.doesNotMatch(documentRenderer, /proposalData\.(?:internal_notes|notes|proposal_notes)|proposal\.(?:internal_notes|notes|proposal_notes)/, 'customer-facing proposal preview/PDF/print renderer must not render internal notes or legacy aliases');

console.log('Proposal internal notes checks passed.');
