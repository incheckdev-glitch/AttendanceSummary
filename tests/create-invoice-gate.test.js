const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const agreementsSource = fs.readFileSync('agreements.js', 'utf8');
const invoicesSource = fs.readFileSync('invoices.js', 'utf8');
const start = agreementsSource.indexOf('  isTruthyInvoiceFlag(value) {');
const end = agreementsSource.indexOf('  isAnnualSaasItem(item = {}) {', start);
assert(start >= 0 && end > start, 'Create Invoice gate helpers must exist');

const context = { console: { log() {} } };
vm.createContext(context);
vm.runInContext(`this.gate = {${agreementsSource.slice(start, end)}};`, context);
const gate = context.gate;

for (const status of [null, '', false, 'false', 'not_invoiced', 'not invoiced', 'uninvoiced', 'not_billed', 'unbilled', 'pending_invoice', 'pending', 'draft', 'open', 'none']) {
  assert.strictEqual(gate.isInvoicedStatus(status), false, `${String(status)} must not be treated as invoiced`);
}
for (const status of ['invoiced', 'invoice_created', 'issued', 'paid', 'partially_paid', 'partially paid', 'overdue']) {
  assert.strictEqual(gate.isInvoicedStatus(status), true, `${status} must be treated as invoiced`);
}

const signedAgreement = { id: 'agreement-uuid', status: 'Signed', invoice_created: false, has_invoice: 'false', invoice_status: 'pending' };
const cleanItems = [{ id: 'item-1', agreement_id: 'agreement-uuid', invoice_status: 'not_invoiced', invoiced: false }];
assert.strictEqual(gate.canCreateInvoiceForAgreement(signedAgreement, cleanItems, []), true, 'clean signed agreement must allow invoice creation');
assert.strictEqual(gate.canCreateInvoiceForAgreement(signedAgreement, cleanItems, [{ id: 'old-zero', status: 'deleted', total: 0 }]), true, 'deleted zero invoice must not block creation');
assert.strictEqual(gate.canCreateInvoiceForAgreement(signedAgreement, cleanItems, [{ id: 'active', status: 'Draft', total: 0 }]), false, 'active linked invoice must block creation');
assert.strictEqual(gate.canCreateInvoiceForAgreement(signedAgreement, [{ invoice_status: 'paid' }], []), false, 'real invoiced item status must block creation');
assert.strictEqual(gate.canCreateInvoiceForAgreement({ ...signedAgreement, invoice_created: true }, cleanItems, []), false, 'truthy agreement header flag must block creation');

assert.match(agreementsSource, /reloadAgreementInvoiceGateData\(agreementId\)[\s\S]*from\('agreements'\)[\s\S]*from\('agreement_items'\)[\s\S]*from\('invoices'\)/, 'fresh gate reload must query agreements, agreement_items, and invoices');
assert.match(invoicesSource, /clearInvoiceCachesAfterDelete\(id\)[\s\S]*reloadAgreementInvoiceGateData\(agreementUuid\)[\s\S]*this\.refresh\(true\)/, 'delete flow must remove cached invoice state and reload fresh data');

const clientsSource = fs.readFileSync('clients.js', 'utf8');
assert.match(invoicesSource, /openCreateFromAgreementTemplate\(agreementId,[\s\S]*requireFreshAgreementInvoiceGate\(id, freshGate\)/, 'all direct agreement-template opens must run the fresh global gate');
assert.match(invoicesSource, /hydrateFromAgreement\(agreementId,[\s\S]*requireFreshAgreementInvoiceGate\(id, freshGate\)[\s\S]*gate\.agreementItems/, 'agreement hydration must generate invoice rows from the fresh global gate data');
assert.match(invoicesSource, /if \(agreementSelectionActive\)[\s\S]*requireFreshAgreementInvoiceGate\(agreementUuid\)/, 'agreement-backed invoice saves must re-run the fresh global gate');
assert.match(agreementsSource, /createInvoiceFromAgreement\(agreementId\)[\s\S]*reloadAgreementInvoiceGateData\(agreementId\)/, 'backend create-from-agreement wrapper must run the fresh global gate');
assert.match(clientsSource, /action === 'invoice'[\s\S]*openCreateFromAgreementTemplate\(agreementUuid\)/, 'client panel agreement invoice action must use the globally guarded template opener');
assert.doesNotMatch(`${agreementsSource}\n${invoicesSource}\n${clientsSource}`, /Agreement#?00050/i, 'the global fix must not hardcode the example agreement');

console.log('Create Invoice gate checks passed');
