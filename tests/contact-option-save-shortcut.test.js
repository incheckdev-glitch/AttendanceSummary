const fs = require('fs');
const assert = require('assert');

const selectors = fs.readFileSync('crm-form-selectors.js', 'utf8');
const leads = fs.readFileSync('leads.js', 'utf8');
const proposals = fs.readFileSync('proposals.js', 'utf8');

assert.match(selectors, /value: row\.contact_uuid[\s\S]*?label: row\.contact_name[\s\S]*?selected_company_uuid: row\.selected_company_uuid \|\| selectedCompanyId/, 'company contact RPC rows must map to canonical contact option fields');
assert.match(selectors, /selectedContactFromOptions = getContactOptionForCompany\(resolvedContactId, selectedCompanyId\)[\s\S]*?if \(!selectedContactFromOptions\) \{[\s\S]*?contactBelongsToCompany/, 'shared save validation must trust a contact returned by the selected company RPC and only run ownership RPC for other contacts');
assert.doesNotMatch(selectors, /filter\(contact =>[\s\S]{0,120}contact\.company_id === selectedCompanyId/, 'contact RPC rows must not be rejected using a legacy company_id comparison');
assert.doesNotMatch(leads, /contactBelongsToCompany\(contact = \{\}, company = \{\}\)/, 'lead picker selections must not run legacy frontend ownership comparisons');
assert.match(proposals, /selectedContactFromOptions = this\.getContactOptionForCompany\(contactId, companyId\)[\s\S]*?if \(!selectedContactFromOptions\) \{[\s\S]*?this\.contactBelongsToCompany/, 'proposal save validation must use the company option shortcut before backend validation');

console.log('Contact option save shortcut checks passed.');
