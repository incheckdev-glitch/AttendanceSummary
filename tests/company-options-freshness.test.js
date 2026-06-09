const assert = require('assert');
const fs = require('fs');

const selectors = fs.readFileSync('crm-form-selectors.js', 'utf8');
const companies = fs.readFileSync('companies.js', 'utf8');
const leads = fs.readFileSync('leads.js', 'utf8');
const deals = fs.readFileSync('deals.js', 'utf8');
const contacts = fs.readFileSync('contacts.js', 'utf8');
const proposals = fs.readFileSync('proposals.js', 'utf8');

assert.match(selectors, /async function loadCompanyOptions\(searchText = '', includeSelectedId = null\)/, 'shared loader must accept search and selected UUID');
assert.match(selectors, /client\.from\('companies'\)\.select\('\*'\)/, 'shared loader must query Supabase companies fresh');
assert.match(selectors, /legal_name.*company_name.*name.*company_id.*company_number.*company_code/, 'server-side search must include names and company codes');
assert.match(selectors, /return str\(company\.id \|\| company\.company_uuid\)/, 'company option values must be UUIDs');
assert.doesNotMatch(selectors, /if \(state\.companies\.length\) return state\.companies/, 'shared loader must not return stale in-memory companies');
assert.match(selectors, /Unable to load companies — retry/, 'dropdown must show a visible load error');
assert.match(companies, /await window\.CrmCompanyContactSelectors\?\.refreshAfterCompanySave/, 'company create/update must await selector refresh');
assert.match(companies, /savedId = String\(saved\?\.id/, 'company save must capture the returned UUID');
assert.match(leads, /loadCompanyOptions\?\.\('', normalizedCompanyId\)/, 'lead picker must use the shared fresh loader and include selected UUID');
assert.match(deals, /loadCompanySafe\?\.\(companyId\)/, 'deal must safely reload company details by key');
assert.match(contacts, /loadCompanyOptions\?\.\(searchText, includeSelectedId\)/, 'contact picker must use shared fresh loader');
assert.match(proposals, /Selected company data mismatch\. Please reselect the company\./, 'proposal save must block company UUID/data mismatches');

console.log('company option freshness checks passed');
