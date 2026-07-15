const assert = require('assert');
const fs = require('fs');

const proposals = fs.readFileSync('proposals.js', 'utf8');
const selectors = fs.readFileSync('crm-form-selectors.js', 'utf8');

assert.match(proposals, /async loadCompanyByUuid\(companyUuid\)[\s\S]*?loadCompanySafe\?\.\(id\)/, 'proposal companies must be safely reloaded after UUID validation');
assert.match(proposals, /async loadContactByUuid\(contactKey\)[\s\S]*?CrmCompanyContactSelectors\?\.loadContactSafe\?\.\(contactKey\)/, 'proposal contacts must be resolved and safely reloaded before use');
assert.match(proposals, /sourceCompanyId && sourceCompanyId !== companyId/, 'save must reject a source/selected company mismatch');
assert.match(proposals, /loadedCompany\.id !== companyId/, 'save and preview must reject loaded-company mismatches');
assert.match(proposals, /proposal\.customer_legal_name = legalName;[\s\S]*?proposal\.customer_address = String\(loadedCompany\.address/, 'save snapshot must come from the UUID-loaded company');
assert.match(proposals, /\['proposalDraft', 'cachedProposal', 'currentProposalDraft', 'proposalFormState'\]/, 'new proposal reset must clear stale draft storage');
assert.match(selectors, /uuidSourceOfTruth: true/, 'proposal selectors must use UUID source-of-truth mode');
assert.match(selectors, /loadContactsForCompany\(companyId\)/, 'proposal contact dropdown must load contacts by company UUID');
assert.match(selectors, /contacts = mapRpcRows\(rpcData\);[\s\S]*?if \(!contacts\.length\)/, 'proposal contact fallbacks must run only after the primary company UUID RPC returns no contacts');
assert.match(selectors, /contactMatchesCompanyFallback\(contact, loadedCompany, selectedCompanyId, companyFkValue\)/, 'the final proposal contact fallback must remain filtered to the selected company');
assert.doesNotMatch(selectors, /\.or\(/, 'proposal contact loading must not use broad PostgREST OR name matching');
assert.doesNotMatch(proposals, /findCompanyByName|getLastCompany|getCachedCompany|selectedCompanyName/, 'proposal flow must not use forbidden company fallbacks');

assert.match(proposals, /resolveContactSignatory\(contact = \{\}\)[\s\S]*?contact\?\.full_name[\s\S]*?contact\?\.contact_name[\s\S]*?contact\?\.job_title[\s\S]*?contact\?\.contact_title[\s\S]*?contact\?\.role/, 'proposal signatory resolver must derive fallback from the selected contact card');
assert.match(proposals, /resolveProposalCustomerSignatory\(proposal = \{\}, contact = \{\}\)[\s\S]*?const contactSignatory = this\.resolveContactSignatory\(contact\)[\s\S]*?proposal\?\.authorizedSignatoryName[\s\S]*?contactSignatory\.name/, 'proposal preview/PDF/print must use saved proposal fields before contact-card fallback');
assert.match(proposals, /getProposalContactId\(proposal = \{\}\)[\s\S]*?proposal\?\.contact_id[\s\S]*?proposal\?\.customer_contact_id[\s\S]*?proposal\?\.client_contact_id[\s\S]*?proposal\?\.primary_contact_id[\s\S]*?proposal\?\.selected_contact_id/, 'proposal preview must support all accepted proposal contact id fields');
assert.match(proposals, /async loadProposalContactForPreview\(client, proposal = \{\}\)[\s\S]*?\.from\('contacts'\)[\s\S]*?\.select\('\*'\)[\s\S]*?\.eq\('id', contactId\)[\s\S]*?\.maybeSingle\(\)/, 'proposal preview/PDF/print must load the related contact card without mutating the proposal');
assert.match(proposals, /const \[creatorProfile, previewContact\] = await Promise\.all\([\s\S]*?this\.resolveProposalCreatorProfile\(client, proposalWithTotals\),[\s\S]*?this\.loadProposalContactForPreview\(client, proposalWithTotals\)/, 'proposal preview data must include the selected contact-card fallback');
assert.match(proposals, /buildSafePreviewProposal\(proposal = \{\}, company = null, contact = null\)[\s\S]*?const previewContact = contact \|\| proposal\?\.contact \|\| null;[\s\S]*?const signatory = this\.resolveProposalCustomerSignatory\(proposal, previewContact\);[\s\S]*?customer_signatory_name: signatory\.name/, 'safe preview payload must render customer signatory from the related contact when saved fields are empty');
assert.match(proposals, /if \(locked\) return \{ name: existingName, title: existingTitle \};[\s\S]*?const contactSigner = this\.resolveContactSignatory\(contact\)/, 'locked proposals must not create persisted company signatory snapshots');
assert.match(proposals, /if \(signatory\.name && !signatoryNameInput\.value\) signatoryNameInput\.value = signatory\.name;[\s\S]*?if \(signatory\.title && !signatoryTitleInput\.value\) signatoryTitleInput\.value = signatory\.title;/, 'proposal form contact selection must only fill empty customer signatory fields');
assert.doesNotMatch(proposals, /customerSignatoryNameValue = currentLockedSnapshot[\s\S]*?companySignatory\.name/, 'proposal save payload must not fall back to company signatory');

console.log('Proposal customer integrity checks passed.');
