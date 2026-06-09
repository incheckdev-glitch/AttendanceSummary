const assert = require('assert');
const fs = require('fs');

const selectors = fs.readFileSync('crm-form-selectors.js', 'utf8');
const leads = fs.readFileSync('leads.js', 'utf8');
const deals = fs.readFileSync('deals.js', 'utf8');
const proposals = fs.readFileSync('proposals.js', 'utf8');
const agreements = fs.readFileSync('agreements.js', 'utf8');
const invoices = fs.readFileSync('invoices.js', 'utf8');

assert.match(selectors, /validateCompanyContactSelection[\s\S]*?fetchCompanyByUuid\(selectedCompanyId\)[\s\S]*?loadedCompany\.id !== selectedCompanyId/, 'shared guard must reload and compare company UUID');
assert.match(selectors, /loadedContact\.company_id !== selectedCompanyId/, 'shared guard must block cross-company contacts');
assert.match(selectors, /applyLoadedCompanySnapshot[\s\S]*?company_id: str\(loadedCompany\.id\)[\s\S]*?customer_name: companyName[\s\S]*?client_name: companyName/, 'snapshots must use the UUID-loaded company');
for (const [name, source] of Object.entries({ lead: leads, deal: deals, agreement: agreements, invoice: invoices })) {
  assert.match(source, new RegExp(`validateCompanyContactSelection\\(\\{ companyId: [\\s\\S]*?moduleName: '${name}'`), `${name} save must use shared UUID guard`);
  assert.match(source, /applyLoadedCompanySnapshot/, `${name} save must use loaded company snapshot`);
  assert.match(source, /\[SAVE CHECK\] final payload:/, `${name} save must log final payload`);
}
assert.match(proposals, /validateAndRefreshProposalCustomer[\s\S]*?loadedCompany\.id !== companyId/, 'proposal save must reload company by UUID');
assert.match(proposals, /parsed = this\.extractProposalAndItems\(await this\.getProposal\(responseSavedUuid\)/, 'proposal confirmation must reload saved record');
assert.match(agreements, /moduleName: 'proposal-to-agreement'[\s\S]*?draft\.agreement\.company_id = proposalCompanyId/, 'proposal conversion must preserve proposal company UUID');
assert.match(agreements, /persistedAgreement = this\.extractAgreementAndItems\(await this\.getAgreement\(persistedAgreementUuid\)/, 'agreement confirmation must reload saved record');

console.log('Relationship UUID integrity checks passed.');
