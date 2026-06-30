const assert = require('assert');
const fs = require('fs');

const agreements = fs.readFileSync('agreements.js', 'utf8');
const supabaseData = fs.readFileSync('supabase-data.js', 'utf8');

const agreementTerms = `Provider and Customer hereby agree to abide by and be bound by this Subscription Agreement, Provider’s Terms of Use, and Provider’s Privacy Policy. Provider’s Terms of Use and Privacy Policy can be found at https://www.incheck360.com/terms-of-use and https://www.incheck360.com/privacy-policy, respectively, and are hereby incorporated into this Agreement. The Subscription Agreement, Provider’s Terms of Use, and Privacy Policy form the Agreement between Customer, as listed above, and InCheck 360 Holding B.V.

IN WITNESS WHEREOF, the parties have caused this Agreement to be executed by their authorized representatives as of the date of last signature by either party (“Effective Date”).`;

assert(agreements.includes(agreementTerms), 'client agreement default terms must match required legal text');
assert(supabaseData.includes(agreementTerms), 'backend agreement default terms must match required legal text');
assert.match(
  agreements,
  /buildDraftAgreementFromProposal[\s\S]*?terms_conditions:\s*DEFAULT_AGREEMENT_TERMS_AND_CONDITIONS/,
  'draft agreements built from proposals must use agreement default terms, not proposal terms'
);
assert.match(
  supabaseData,
  /agreements'\s*&&\s*action\s*===\s*'create_from_proposal'[\s\S]*?if \(!createdAgreementIsSigned\) updatePayload\.terms_conditions = DEFAULT_AGREEMENT_TERMS_AND_CONDITIONS/,
  'backend proposal-to-agreement conversion must overwrite only unsigned new agreement terms with agreement terms'
);
assert.doesNotMatch(
  supabaseData,
  /updatePayload\.terms_conditions = DEFAULT_AGREEMENT_TERMS_AND_CONDITIONS;[\s\S]{0,250}createdAgreementIsSigned/,
  'backend conversion must check signed state before setting converted agreement terms'
);
