const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const utils = fs.readFileSync(path.join(root, 'utils.js'), 'utf8');
const methodSource = utils.match(/  resolveDocumentBillingFrequency\(\.\.\.sources\) \{[\s\S]*?\n  \},\n  _didLogDateTimeFormatDebug/);
assert.ok(methodSource, 'shared document billing-frequency formatter must exist');
const resolve = Function(`return ({${methodSource[0].replace(/,\n  _didLogDateTimeFormatDebug$/, '')}}).resolveDocumentBillingFrequency`)();

assert.strictEqual(resolve({ billing_frequency: 'Monthly' }, { payment_term: 'Net 30' }), 'Monthly');
assert.strictEqual(resolve({ billing_cycle: 'Semi-Annual' }), 'Semi-Annually');
assert.strictEqual(resolve({ payment_term: 'Net 7' }), 'Monthly');
assert.strictEqual(resolve({ payment_term: 'Net 14' }), 'Quarterly');
assert.strictEqual(resolve({ payment_term: 'Net 21' }), 'Semi-Annually');
assert.strictEqual(resolve({ payment_term: 'Net 30' }), 'Annually');
assert.strictEqual(resolve({ payment_term: 'Custom' }), '');
assert.strictEqual(resolve({}), '');
assert.strictEqual(resolve({}, [{ billingFrequency: 'annual' }]), 'Annually');

const invoices = fs.readFileSync(path.join(root, 'invoices.js'), 'utf8');
const receipts = fs.readFileSync(path.join(root, 'receipts.js'), 'utf8');
assert.match(invoices, /resolveDocumentBillingFrequency\([\s\S]*?invoiceData[\s\S]*?selectedAgreement[\s\S]*?normalizedItems/);
assert.match(receipts, /resolveDocumentBillingFrequency\(invoice, agreement, invoiceItems, sourceItems\)/);
assert.match(invoices, /meta-key">Billing Frequency/);
assert.match(receipts, /meta-key">Billing Frequency/);
assert.doesNotMatch(invoices, /meta-key">Payment Terms/);
assert.doesNotMatch(receipts, /meta-key">Payment Terms/);

console.log('document billing frequency tests passed');
