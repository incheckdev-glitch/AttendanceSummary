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

assert.match(helper, /rpc\('crm_get_contacts_for_company', \{ p_company_id: selectedCompanyId \}\)/, 'contacts must first be queried by the company UUID RPC');
assert.match(helper, /value: row\.contact_uuid \|\| row\.id[\s\S]*?label: row\.contact_name \|\| row\.full_name \|\| row\.name[\s\S]*?secondary: row\.email \|\| row\.phone \|\| row\.contact_position \|\| row\.contact_ref \|\| ''/, 'RPC contact UUID, name, and secondary display fields must be mapped explicitly');
assert.match(helper, /contacts = mapRpcRows\(rpcData\);[\s\S]*?if \(!contacts\.length\)/, 'fallbacks must run only when the primary UUID RPC returns no contacts');
assert.match(helper, /crm_get_contacts_for_company_key/, 'the controlled company-key RPC fallback must remain available for legacy mappings');
assert.match(helper, /contactMatchesCompanyFallback\(contact, loadedCompany, selectedCompanyId, companyFkValue\)/, 'the final API fallback must filter contacts against the selected company before display');
assert.doesNotMatch(helper, /\.or\(/, 'contact loading must not use broad PostgREST OR matching');
assert.match(selectors, /return str\(company\.company_uuid\)/, 'company option values must use company UUIDs');
assert.match(selectors, /contactSelect\.dataset\.loadingCompanyId !== requestCompanyId/, 'shared dropdown must ignore stale contact responses');
assert.match(selectors, /console\.log\('\[Company changed\] selectedCompanyId:', selectedCompanyId\)/, 'company selection log must be present');
assert.match(helper, /console\.log\('\[Contacts loaded\]', \{ companyId: selectedCompanyId, count: contacts\.length, contacts \}\)/, 'contact load log must include selected company, count, and contacts');
assert.match(leads, /loadContactsForCompany\?\.\(normalizedCompanyId\)/, 'lead create/edit must use the shared UUID contact loader');
assert.match(leads, /requestId !== this\._leadPickerLoadRequestId/, 'lead picker must ignore stale contact responses');
assert.match(contacts, /const companyId = this\.companyRelationId\(company\)/, 'create contact from company must store the company UUID');
assert.match(companies, /company_id: companyUuid/, 'company module must pass a UUID when creating a contact');

assert.match(selectors, /companySelect\.addEventListener\('change'[\s\S]*?state\.contactOptionsByCompany\.clear\(\)[\s\S]*?setValue\(cfg\.contactHiddenId, '', \{ readonly: false \}\)[\s\S]*?loadContactsForConfig\(cfg, selectedCompanyId\)/, 'company changes must clear contact options and selected contact before loading the selected company contacts');
assert.match(leads, /handleLeadCompanyChange[\s\S]*?resetLeadSelectionState\(\)[\s\S]*?loadLeadPickerOptions\(resolvedCompanyId\)/, 'lead company changes must clear old contact before loading contacts');

console.log('contact company dropdown checks passed');
