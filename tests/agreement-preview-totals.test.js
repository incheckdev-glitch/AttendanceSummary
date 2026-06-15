const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {
  window: {},
  document: { addEventListener() {}, getElementById() { return null; } },
  console,
  E: {},
  U: {
    escapeHtml: value => String(value ?? ''),
    fmtDisplayDate: value => String(value ?? ''),
    formatAmountInWords: (value, currency) => `${currency} words ${value}`,
    stripInternalDocumentLinks: html => html
  }
};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync('agreements.js', 'utf8')}\nglobalThis.TestAgreements = Agreements;`, context);

const agreements = context.TestAgreements;
agreements.normalizeAgreement = agreement => agreement;
agreements.formatMoneyWithCurrency = (value, currency) => `${currency} ${Number(value).toLocaleString('en-US')}`;
agreements.normalizeDateInputValue = value => value || '';
agreements.getDefaultAnnualServiceStartDate = () => '';
agreements.calculateServiceEndDate = () => '';
agreements.isAnnualSaasUserItem = () => false;

const agreement82Items = [
  {
    section: 'annual_saas',
    item_name: 'InCheck Basic',
    unit_price: 1200,
    quantity: 12,
    line_total: 'USD 1,200'
  },
  {
    section: 'one_time_fees',
    item_name: 'Account Setup',
    location_name: 'ALL Location',
    unit_price: 200,
    quantity: 98,
    discount_percent: 0
  }
];

const totals = agreements.calculateTotals(agreement82Items);
assert.strictEqual(totals.saas_total, 1200, 'annual rows should provide the subscription total');
assert.strictEqual(totals.one_time_total, 19600, 'Account Setup should be detected and calculated as a one-time fee');
assert.strictEqual(totals.grand_total, 20800, 'grand total should combine row-derived totals');

const groupedItems = agreements.groupedItems([
  ...agreement82Items,
  { section: 'annual_saas', item_name: 'InCheck Basic', location_name: 'Active Location', line_total: 500 },
  { section: 'one-time fees', description: 'Account Setup service', line_total: 50 }
]);
assert.strictEqual(groupedItems.annual_saas.length, 2, 'detail view should keep annual rows in the Annual SaaS section');
assert.strictEqual(groupedItems.one_time_fee.length, 2, 'detail view should group every supported Account Setup/one-time section as One Time Fees');
assert.strictEqual(
  agreements.calculateTotals([...groupedItems.annual_saas, ...groupedItems.one_time_fee]).one_time_total,
  19650,
  'detail totals should remain item-derived after canonical section grouping'
);

const html = agreements.buildAgreementPreviewHtml({
  agreement_number: 'Agreement#00082',
  currency: 'USD',
  saas_total: 999999,
  one_time_total: 0,
  grand_total: 999999
}, agreement82Items);
assert.match(html, /Total One Time Fees<\/td>\s*<td class="cell-right">USD 19,600<\/td>/, 'one-time footer should sum the displayed Account Setup row');
assert.match(html, /<span>One Time Fees<\/span><strong>USD 19,600<\/strong>/, 'summary should use the row-derived one-time total');
assert.match(html, /<span>Grand Total<\/span><strong>USD 20,800<\/strong>/, 'grand total should ignore stale agreement header totals');
assert.match(html, /<span>Grand Total in Words<\/span><strong>USD words 20800<\/strong>/, 'grand total words should use the row-derived grand total');
assert.doesNotMatch(html, /DIP Location|DIFC Location|Green Community|Manara|Meadows|Business Bay|Al Warqa|SMW-Bahrain/, 'preview should render only the loaded agreement item rows');

const fallbackItems = [
  { section: 'one-time fees', total: 'USD 25.00' },
  { section: 'misc', description: 'Account Setup service', total_amount: 'USD 30.00' },
  { section: 'one_time', amount: 'USD 40.00' },
  { section: 'one_time_fees', subtotal: 'USD 50.00' },
  { section: 'one_time_fee', unit_price: 100, qty: 2, discount: 10 }
];
assert.strictEqual(agreements.calculateTotals(fallbackItems).one_time_total, 325, 'all amount fallbacks and one-time detectors should contribute');

const recordTotals = agreements.calculateTotalsFromAgreementRecord({
  saas_total: 500000,
  one_time_total: 0,
  grand_total: 500000,
  agreement_items: agreement82Items
});
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(recordTotals)),
  { saas_total: 1200, one_time_total: 19600, grand_total: 20800 },
  'agreement record totals should prefer item rows over stale header fields'
);

const agreement83Items = [
  { section: 'annual_saas', line_total: 500 },
  { section: 'one_time_fees', total_amount: 112.50 }
];
const agreement83Html = agreements.buildAgreementPreviewHtml({
  agreement_number: 'Agreement#00083',
  currency: 'USD',
  grand_total: 1025
}, agreement83Items);
assert.match(agreement83Html, /<span>Grand Total<\/span><strong>USD 612.5<\/strong>/, 'Agreement#00083 preview should calculate 612.50 from its rows');
assert.match(agreement83Html, /<span>Grand Total in Words<\/span><strong>USD words 612.5<\/strong>/, 'Agreement#00083 total in words should use the calculated row total');

const companySignatory = agreements.resolveCustomerSignatorySnapshot(
  { status: 'draft' },
  { authorized_signatory_name: 'Customer Signer', customer_signatory_title: 'Director' }
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(companySignatory)),
  { name: 'Customer Signer', title: 'Director' },
  'draft agreements should use the related company signatory fallback'
);
const signedSignatory = agreements.resolveCustomerSignatorySnapshot(
  { status: 'signed', customer_signatory_name: 'Historical Signer', customer_signatory_title: 'Former Director' },
  { authorized_signatory_name: 'New Signer', authorized_signatory_title: 'New Director' }
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(signedSignatory)),
  { name: 'Historical Signer', title: 'Former Director' },
  'signed agreements should preserve saved signatory snapshots'
);

console.log('Agreement preview row-derived total checks passed.');
