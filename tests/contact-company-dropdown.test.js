const assert = require('assert');
const fs = require('fs');

const selectors = fs.readFileSync('crm-form-selectors.js', 'utf8');
const leads = fs.readFileSync('leads.js', 'utf8');
const contacts = fs.readFileSync('contacts.js', 'utf8');
const companies = fs.readFileSync('companies.js', 'utf8');

const helperStart = selectors.indexOf('async function loadContactsForCompany(companyId)');
const helperEnd = selectors.indexOf('function isDirectCreate', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'shared contact loader must exist');
const helper = selectors.slice(helperStart, helperEnd);

assert.match(helper, /rpc\('crm_get_contacts_for_company', \{ p_company_id: selectedCompanyId \}\)/, 'contacts must be queried by the company UUID RPC');
assert.match(helper, /value: row\.contact_uuid[\s\S]*?label: row\.contact_name[\s\S]*?secondary: row\.email \|\| row\.phone \|\| row\.contact_position \|\| row\.contact_ref/, 'RPC contact UUID, name, and secondary display fields must be mapped explicitly');
assert.doesNotMatch(helper, /company_name|company_names|contact_status|verified|contactsByCompany|\.or\(/, 'contact loader must not use names, status, verification, alternate relations, or cached rows');
assert.match(selectors, /return str\(company\.company_uuid\)/, 'company option values must use company UUIDs');
assert.match(selectors, /contactSelect\.dataset\.loadingCompanyId !== requestCompanyId/, 'shared dropdown must ignore stale contact responses');
assert.match(selectors, /console\.log\('\[Company changed\] selectedCompanyId:', selectedCompanyId\)/, 'company selection log must be present');
assert.match(helper, /console\.log\('\[Contacts loaded\]', contacts\)/, 'contact load log must be present');
assert.match(leads, /loadContactsForCompany\?\.\(normalizedCompanyId\)/, 'lead create/edit must use the shared UUID contact loader');
assert.match(leads, /requestId !== this\._leadPickerLoadRequestId/, 'lead picker must ignore stale contact responses');
assert.match(contacts, /const companyId = this\.companyRelationId\(company\)/, 'create contact from company must store the company UUID');
assert.match(companies, /company_id: companyUuid/, 'company module must pass a UUID when creating a contact');


assert.match(selectors, /companySelect\.addEventListener\('change'[\s\S]*?state\.contactOptionsByCompany\.clear\(\)[\s\S]*?setValue\(cfg\.contactHiddenId, '', \{ readonly: false \}\)[\s\S]*?loadContactsForConfig\(cfg, selectedCompanyId\)/, 'company changes must clear contact options and selected contact before loading the selected company contacts');
assert.match(leads, /handleLeadCompanyChange[\s\S]*?resetLeadSelectionState\(\)[\s\S]*?loadLeadPickerOptions\(resolvedCompanyId\)/, 'lead company changes must clear old contact before loading contacts');

console.log('contact company dropdown checks passed');
