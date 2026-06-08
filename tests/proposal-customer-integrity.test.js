const assert = require('assert');
const fs = require('fs');

const proposals = fs.readFileSync('proposals.js', 'utf8');
const selectors = fs.readFileSync('crm-form-selectors.js', 'utf8');

assert.match(proposals, /async loadCompanyByUuid\(companyUuid\)[\s\S]*?from\('companies'\)\.select\('\*'\)\.eq\('id', id\)\.maybeSingle\(\)/, 'proposal companies must be reloaded by UUID');
assert.match(proposals, /async loadContactByUuid\(contactUuid\)[\s\S]*?from\('contacts'\)\.select\('\*'\)\.eq\('id', id\)\.maybeSingle\(\)/, 'proposal contacts must be reloaded by UUID');
assert.match(proposals, /sourceCompanyId && sourceCompanyId !== companyId/, 'save must reject a source/selected company mismatch');
assert.match(proposals, /loadedCompany\.id !== companyId/, 'save and preview must reject loaded-company mismatches');
assert.match(proposals, /proposal\.customer_legal_name = legalName;[\s\S]*?proposal\.customer_address = String\(loadedCompany\.address/, 'save snapshot must come from the UUID-loaded company');
assert.match(proposals, /\['proposalDraft', 'cachedProposal', 'currentProposalDraft', 'proposalFormState'\]/, 'new proposal reset must clear stale draft storage');
assert.match(selectors, /uuidSourceOfTruth: true/, 'proposal selectors must use UUID source-of-truth mode');
assert.match(selectors, /resolveContactsForCompany\(company, \{ strictUuid: cfg\.uuidSourceOfTruth === true \}\)/, 'proposal contact dropdown must not use name fallback');
assert.doesNotMatch(proposals, /findCompanyByName|getLastCompany|getCachedCompany|selectedCompanyName/, 'proposal flow must not use forbidden company fallbacks');

console.log('Proposal customer integrity checks passed.');
