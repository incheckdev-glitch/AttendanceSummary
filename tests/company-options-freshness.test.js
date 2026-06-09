const assert = require('assert');
const fs = require('fs');

const selectors = fs.readFileSync('crm-form-selectors.js', 'utf8');
const companies = fs.readFileSync('companies.js', 'utf8');
const leads = fs.readFileSync('leads.js', 'utf8');
const deals = fs.readFileSync('deals.js', 'utf8');
const contacts = fs.readFileSync('contacts.js', 'utf8');
const proposals = fs.readFileSync('proposals.js', 'utf8');

assert.match(selectors, /async function loadCompanyOptions\(searchText = '', includeSelectedId = null\)/, 'shared loader must accept search and selected UUID');
assert.match(selectors, /rpc\('crm_search_companies_for_select', \{[\s\S]*?p_search: search \|\| ''[\s\S]*?p_limit: 100/, 'shared loader must use the complete company search RPC with the required limit');
assert.doesNotMatch(selectors.slice(selectors.indexOf("async function loadCompanyOptions(searchText = '', includeSelectedId = null)"), selectors.indexOf('async function fetchCompanies')), /from\('companies'\)|requestWithSession\('companies', 'list'/, 'shared option loader must not use partial direct/API company lists');
assert.match(selectors, /display_label: str\([\s\S]*?secondary: str\([\s\S]*?email[\s\S]*?phone[\s\S]*?city[\s\S]*?country/, 'RPC display label and secondary fields must be mapped');
assert.match(selectors, /return str\(company\.company_uuid\)/, 'company option values must be company UUIDs');
assert.doesNotMatch(selectors, /if \(state\.companies\.length\) return state\.companies/, 'shared loader must not return stale in-memory companies');
assert.match(selectors, /Unable to load companies — retry/, 'dropdown must show a visible load error');
assert.match(companies, /await window\.CrmCompanyContactSelectors\?\.refreshAfterCompanySave/, 'company create/update must await selector refresh');
assert.match(companies, /savedId = String\(saved\?\.id/, 'company save must capture the returned UUID');
assert.match(leads, /loadCompanyOptions\?\.\(searchText \|\| '', normalizedCompanyId\)/, 'lead picker must send typed searches to the shared RPC loader and include selected UUID');
assert.match(deals, /loadCompanySafe\?\.\(companyId\)/, 'deal must safely reload company details by key');
assert.match(contacts, /loadCompanyOptions\?\.\(searchText, includeSelectedId\)/, 'contact picker must use shared fresh loader');
assert.match(proposals, /Selected company data mismatch\. Please reselect the company\./, 'proposal save must block company UUID/data mismatches');
assert.match(selectors, /bindCompanyRemoteSearch\(companySelect, searchText => populateCompanySelect\(cfg, searchText\)\)/, 'all shared CRM company selects must remotely search as the user types');
assert.match(selectors, /loadCompanyOptions\(company\.display_label \|\| company\.company_name/, 'newly saved companies must be searched by name before being injected and selected');

console.log('company option freshness checks passed');
