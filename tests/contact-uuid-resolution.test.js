const assert = require('assert');
const fs = require('fs');

const selectors = fs.readFileSync('crm-form-selectors.js', 'utf8');
const leads = fs.readFileSync('leads.js', 'utf8');
const deals = fs.readFileSync('deals.js', 'utf8');
const proposals = fs.readFileSync('proposals.js', 'utf8');
const agreements = fs.readFileSync('agreements.js', 'utf8');

assert.match(selectors, /resolveContactUuid[\s\S]*?crm_resolve_contact_uuid[\s\S]*?p_contact_key: key/, 'shared resolver must resolve contact business keys through RPC');
assert.match(selectors, /loadContactSafe[\s\S]*?resolveContactUuid\(contactKey\)[\s\S]*?crm_get_contact_by_key[\s\S]*?p_contact_key: id/, 'shared contact loader must resolve before loading by key');
assert.match(selectors, /loadContactSafe[\s\S]*?\.eq\('id', id\)/, 'contact id query must only use the resolved id');
assert.match(selectors, /getContactOptionValue[\s\S]*?find\(isUuid\)/, 'contact dropdown option helper must only return a UUID');
assert.match(selectors, /setSelectOptions[\s\S]*?: getContactOptionValue\(row\)/, 'contact dropdowns must use the UUID-only option helper');
assert.match(selectors, /crm_get_contacts_for_company', \{ p_company_id: selectedCompanyId \}/, 'company contact dropdown must keep using the company contacts RPC');
assert.match(selectors, /validateCompanyContactSelection[\s\S]*?resolveContactUuid\(selectedContactKey\)[\s\S]*?Selected contact could not be resolved\. Please reselect the contact\./, 'shared save guard must resolve and block unresolved contacts');
assert.match(selectors, /applyLoadedCompanySnapshot[\s\S]*?if \(loadedContact\) next\.contact_id = str\(loadedContact\.id\)/, 'saved snapshots must use contacts.id');
for (const [name, source] of Object.entries({ lead: leads, deal: deals, agreement: agreements })) {
  assert.match(source, new RegExp(`validateCompanyContactSelection\\(\\{ companyId: [\\s\\S]*?moduleName: '${name}'`), `${name} create/edit save must use the shared contact resolver guard`);
}
assert.match(agreements, /moduleName: 'proposal-to-agreement'/, 'agreement conversion must use the shared contact resolver guard');
assert.match(proposals, /validateAndRefreshProposalCustomer[\s\S]*?resolveContactUuid\(contactKey\)[\s\S]*?proposal\.contact_id = loadedContact\.id/, 'proposal save must resolve contact keys and save contacts.id');

console.log('Contact UUID resolution checks passed.');
