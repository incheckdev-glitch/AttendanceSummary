const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const utils = fs.readFileSync(path.join(root, 'utils.js'), 'utf8');
const methodSource = utils.match(/  resolveDocumentPaymentTerms\(\.\.\.sources\) \{[\s\S]*?\n  \},\n  _didLogDateTimeFormatDebug/);
assert.ok(methodSource, 'shared document payment-terms formatter must exist');
const resolve = Function(`return ({${methodSource[0].replace(/,\n  _didLogDateTimeFormatDebug$/, '')}}).resolveDocumentPaymentTerms`)();

assert.strictEqual(resolve({ payment_term: 'Net 7' }), 'Monthly');
assert.strictEqual(resolve({ payment_term: 'Net 14' }), 'Quarterly');
assert.strictEqual(resolve({ payment_term: 'Net 21' }), 'Semi-Annually');
assert.strictEqual(resolve({ payment_term: 'Net 30' }), 'Annually');
assert.strictEqual(resolve({ payment_term: 'Custom' }), '');
assert.strictEqual(resolve({}), '');
assert.strictEqual(resolve({ billing_frequency: 'Annual' }), '');
assert.strictEqual(resolve({ billing_frequency: 'Annual', payment_term: 'Net 7' }), 'Monthly');
assert.strictEqual(resolve({ paymentTerms: '  NET   30 ' }), 'Annually');

const invoices = fs.readFileSync(path.join(root, 'invoices.js'), 'utf8');
const receipts = fs.readFileSync(path.join(root, 'receipts.js'), 'utf8');
assert.match(invoices, /resolveDocumentPaymentTerms\(invoiceData\)/);
assert.match(receipts, /resolveDocumentPaymentTerms\(invoice\)/);
assert.match(invoices, /meta-key">Payment Terms/);
assert.match(receipts, /meta-key">Payment Terms/);
assert.doesNotMatch(invoices, /meta-key">Billing Frequency/);
assert.doesNotMatch(receipts, /meta-key">Billing Frequency/);

console.log('document payment terms tests passed');
