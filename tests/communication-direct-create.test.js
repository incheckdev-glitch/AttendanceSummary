const fs = require('fs');
const assert = require('assert');

const communication = fs.readFileSync('communication-centre.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const clients = fs.readFileSync('clients.js', 'utf8');
const companies = fs.readFileSync('companies.js', 'utf8');
const contacts = fs.readFileSync('contacts.js', 'utf8');

[
  'lead', 'deal', 'agreement', 'proposal', 'invoice', 'receipt', 'credit_note',
  'ticket', 'company', 'contact', 'client', 'operations_onboarding'
].forEach(moduleKey => assert(communication.includes(`'${moduleKey}'`), `missing direct-create support for ${moduleKey}`));

assert(communication.includes('Access denied. You do not have permission to create communications.'));
assert(communication.includes('moduleSelect.disabled = Boolean(direct)'));
assert(communication.includes('recordSearch.readOnly = Boolean(direct)'));
assert(communication.includes('Communication regarding ${displayRef || moduleLabel}'));
assert(communication.includes(".eq('related_module', direct.related_module).eq('related_record_id', direct.related_record_id)"));
assert(communication.includes('M.openCreateForRecord = openCreateModal'));
assert(communication.includes('New communication created for ${relatedRecordRef}'));
assert(index.includes('clientCreateCommunicationBtn'));
assert(index.includes('ticketCreateCommunicationBtn'));
assert(app.includes('ticketRelatedCommunications'));
assert(clients.includes('clientRelatedCommunications'));
assert(companies.includes('data-company-edit'));
assert(contacts.includes('data-contact-edit'));
console.log('communication direct-create checks passed');
