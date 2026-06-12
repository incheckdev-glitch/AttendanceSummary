const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {
  window: {},
  console,
  document: { addEventListener() {}, getElementById() { return null; } },
  U: {
    escapeHtml(value) { return String(value ?? ''); },
    escapeAttr(value) { return String(value ?? ''); },
    fmtDisplayDate(value) { return String(value ?? ''); },
    formatAmountInWords(value, currency) { return `${currency} words ${value}`; },
    stripInternalDocumentLinks(value) { return value; }
  },
  E: {},
  Api: {},
  UI: {},
  Permissions: {},
  Session: {}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('agreements.js', 'utf8'), context);

const agreements = context.window.Agreements;
const agreement82Items = [
  { section: 'annual_saas', item_name: 'InCheck Basic', line_total: 'USD 46,000.63' },
  { section: 'One Time Fees', item_name: 'Account Setup', unit_price: 'USD 200', qty: 106, line_total: '' }
];
const totals = agreements.calculateAgreementDocumentTotals(
  { saas_total: 0, one_time_total: 0, grand_total: 0 },
  agreement82Items
);

assert.strictEqual(totals.saas_total, 46000.63, 'subscription total must come from visible annual agreement item rows');
assert.strictEqual(totals.one_time_total, 21200, 'one-time total must come from visible setup agreement item rows');
assert.strictEqual(totals.grand_total, 67200.63, 'grand total must combine the row-derived preview totals');
assert.strictEqual(totals.oneTimeItems.length, 1, 'One Time Fees section aliases must be recognized');

const directTotal = agreements.calculateAgreementDocumentTotals(
  { one_time_total: 0 },
  [{ section: 'misc', item_name: 'Account Setup', total_amount: 'USD 21,200' }]
);
assert.strictEqual(directTotal.one_time_total, 21200, 'supported direct line total aliases must be used before multiplication');

const staleHeader = agreements.calculateAgreementDocumentTotals(
  { one_time_total: 'USD 999' },
  [{ section: 'one_time_fee', item_name: 'Account Setup', line_total: 'USD 21,200' }]
);
assert.strictEqual(staleHeader.one_time_total, 21200, 'a stale agreement header total must never override existing one-time rows');

const headerFallback = agreements.calculateAgreementDocumentTotals(
  { one_time_fees_total: 'USD 350' },
  []
);
assert.strictEqual(headerFallback.one_time_total, 350, 'agreement header total may be used only when no one-time rows exist');

const previewHtml = agreements.buildAgreementPreviewHtml(
  { currency: 'USD', saas_total: 0, one_time_total: 0, grand_total: 0 },
  agreement82Items
);
assert.strictEqual((previewHtml.match(/USD 21,200/g) || []).length, 3, 'one-time row, footer, and summary must show the row-derived total');
assert.match(previewHtml, /Grand Total<\/span><strong>USD 67,200\.63/, 'grand total must use the row-derived subscription and one-time totals');
assert.match(previewHtml, /Grand Total in Words<\/span><strong>USD words 67200\.63/, 'grand total words must use the row-derived grand total');

const source = fs.readFileSync('agreements.js', 'utf8');
const previewStart = source.indexOf('buildAgreementPreviewHtml(agreement = {}, items = [])');
const previewEnd = source.indexOf('async createInvoiceFromAgreement', previewStart);
const previewSource = source.slice(previewStart, previewEnd);
assert.match(previewSource, /calculateAgreementDocumentTotals/, 'agreement preview must use row-derived document totals');
assert.match(previewSource, /Total One Time Fees[\s\S]*money\(subtotalOneTime\)/, 'one-time footer must use the calculated one-time total');
assert.match(previewSource, /Grand Total in Words[\s\S]*grandTotalInWords/, 'grand total words must use the calculated grand total');

console.log('Agreement preview row-derived total checks passed.');
