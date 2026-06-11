const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {
  window: {},
  document: { addEventListener() {} },
  console,
  E: {},
  U: {
    escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }
  }
};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync('proposals.js', 'utf8')}\nglobalThis.TestProposals = Proposals;`, context);

const proposals = context.TestProposals;
const supabaseData = fs.readFileSync('supabase-data.js', 'utf8');
const expectedTerms = `1. SaaS Cost is an annual recurring cost, while Account Setup is a one-time fee.
2. Customer Support is continuous during the subscription term with an unlimited quantity of requests.
3. InCheck's Privacy Policy can be found at https://incheck360.com/privacy-policy
4. InCheck's Terms of Use can be found at https://incheck360.com/terms-of-use`;

assert.strictEqual(proposals.defaultProposalTermsAndConditions, expectedTerms, 'new proposals must use only the fixed default terms');
assert.strictEqual(proposals.emptyProposal().terms_conditions, expectedTerms, 'empty proposal and deal/lead proposal drafts must inherit the fixed terms');

const rendered = proposals.renderProposalTermsHtml(expectedTerms);
assert.match(rendered, /^<ol class="proposal-terms-list">/, 'fixed terms should render as a numbered list');
assert.match(rendered, /href="https:\/\/incheck360\.com\/privacy-policy"[^>]*>https:\/\/incheck360\.com\/privacy-policy<\/a>/, 'privacy policy URL should be visible and clickable');
assert.match(rendered, /href="https:\/\/incheck360\.com\/terms-of-use"[^>]*>https:\/\/incheck360\.com\/terms-of-use<\/a>/, 'terms of use URL should be visible and clickable');
assert.doesNotMatch(rendered, /Provider and Customer|IN WITNESS WHEREOF|www\.incheck360\.com/, 'old terms must not appear in generated proposal documents');
assert.match(supabaseData, /!existingTerms \|\| existingTerms === LEGACY_AUTO_PROPOSAL_TERMS_AND_CONDITIONS\.trim\(\)[\s\S]*?proposalUpdates\.terms_conditions = DEFAULT_PROPOSAL_TERMS_AND_CONDITIONS/, 'backend deal-to-proposal conversion must replace only missing or legacy auto terms');
assert.match(supabaseData, /terms_conditions: firstDefined\(record,[\s\S]*?ensureBusinessIds \? DEFAULT_PROPOSAL_TERMS_AND_CONDITIONS : undefined/, 'backend proposal creation must default missing terms without overwriting updates');

const manualTerms = 'Customer-specific terms remain unchanged.';
assert.match(proposals.renderProposalTermsHtml(manualTerms), /Customer-specific terms remain unchanged\./, 'manual terms should render without being replaced');

context.E.proposalFormTerms = { value: manualTerms, focus() {} };
proposals.state.formReadOnly = false;
proposals.resetProposalTermsToDefault();
assert.strictEqual(context.E.proposalFormTerms.value, expectedTerms, 'reset/default action should explicitly restore fixed terms');
context.E.proposalFormTerms.value = manualTerms;
proposals.state.formReadOnly = true;
proposals.resetProposalTermsToDefault();
assert.strictEqual(context.E.proposalFormTerms.value, manualTerms, 'read-only existing terms should not be overwritten');

console.log('Proposal default terms checks passed.');
