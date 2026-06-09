const assert = require('assert');
const fs = require('fs');

const selectors = fs.readFileSync('crm-form-selectors.js', 'utf8');
const leads = fs.readFileSync('leads.js', 'utf8');
const deals = fs.readFileSync('deals.js', 'utf8');
const proposals = fs.readFileSync('proposals.js', 'utf8');
const agreements = fs.readFileSync('agreements.js', 'utf8');
const invoices = fs.readFileSync('invoices.js', 'utf8');
const supabaseData = fs.readFileSync('supabase-data.js', 'utf8');

assert.match(selectors, /resolveCompanyUuid[\s\S]*?crm_resolve_company_uuid[\s\S]*?p_company_key: key/, 'shared resolver must resolve business company keys through RPC');
assert.match(selectors, /loadCompanySafe[\s\S]*?crm_get_company_by_key[\s\S]*?p_company_key: key/, 'shared loader must load companies safely by any key');
assert.match(selectors, /fetchCompanyByUuid[\s\S]*?if \(!isUuid\(id\)\) return null;[\s\S]*?\.eq\('id', id\)/, 'UUID loader must reject non-UUID keys before querying companies.id');
assert.match(selectors, /validateCompanyContactSelection[\s\S]*?resolveCompanyUuid\(companyKey\)[\s\S]*?loadCompanySafe\(selectedCompanyId\)/, 'shared save guard must resolve before loading');
assert.match(selectors, /Selected company could not be resolved\. Please reselect the company\./, 'shared save guard must show the required unresolved-company blocker');
assert.match(selectors, /contactBelongsToCompany[\s\S]*?crm_contact_belongs_to_company[\s\S]*?p_contact_key: String\(contactKey\)[\s\S]*?p_company_key: String\(companyKey\)/, 'shared guard must use the backend ownership RPC');
assert.match(selectors, /if \(!belongs\) \{[\s\S]*?clearSelectedContactForCompany\(selectedCompanyId, moduleName\)[\s\S]*?Selected contact does not belong/, 'failed ownership checks must clear only the contact and block save');
assert.match(supabaseData, /column === 'id' && !isUuid\(lookupValue\)/, 'agreement conversion lookup must never query companies.id with a business key');
assert.match(selectors, /applyLoadedCompanySnapshot[\s\S]*?company_id: str\(loadedCompany\.id\)[\s\S]*?customer_name: companyName[\s\S]*?client_name: companyName/, 'snapshots must use the UUID-loaded company');
for (const [name, source] of Object.entries({ lead: leads, deal: deals, agreement: agreements, invoice: invoices })) {
  assert.match(source, new RegExp(`validateCompanyContactSelection\\(\\{ companyId: [\\s\\S]*?moduleName: '${name}'`), `${name} save must use shared UUID guard`);
  assert.match(source, /applyLoadedCompanySnapshot/, `${name} save must use loaded company snapshot`);
  assert.match(source, /\[SAVE CHECK\] final payload:/, `${name} save must log final payload`);
}
assert.match(proposals, /validateAndRefreshProposalCustomer[\s\S]*?resolveCompanyUuid\(companyKey\)[\s\S]*?loadCompanySafe\(companyId\)/, 'proposal save must resolve and safely reload the company');
assert.match(proposals, /parsed = this\.extractProposalAndItems\(await this\.getProposal\(responseSavedUuid\)/, 'proposal confirmation must reload saved record');
assert.match(agreements, /moduleName: 'proposal-to-agreement'[\s\S]*?draft\.agreement\.company_id = loadedSelection\.resolvedCompanyId/, 'proposal conversion must save the resolved proposal company UUID');
assert.match(agreements, /persistedAgreement = this\.extractAgreementAndItems\(await this\.getAgreement\(persistedAgreementUuid\)/, 'agreement confirmation must reload saved record');

console.log('Relationship UUID integrity checks passed.');
