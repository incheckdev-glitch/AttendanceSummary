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
    quantity: 99,
    discount_percent: 0
  }
];

const totals = agreements.calculateTotals(agreement82Items);
assert.strictEqual(totals.saas_total, 1200, 'annual rows should provide the subscription total');
assert.strictEqual(totals.one_time_total, 19800, 'Account Setup should be detected and calculated as a one-time fee');
assert.strictEqual(totals.grand_total, 21000, 'grand total should combine row-derived totals');

const html = agreements.buildAgreementPreviewHtml({
  agreement_number: 'Agreement#00082',
  currency: 'USD',
  saas_total: 999999,
  one_time_total: 0,
  grand_total: 999999
}, agreement82Items);
assert.match(html, /Total One Time Fees<\/td>\s*<td class="cell-right">USD 19,800<\/td>/, 'one-time footer should sum the displayed Account Setup row');
assert.match(html, /<span>One Time Fees<\/span><strong>USD 19,800<\/strong>/, 'summary should use the row-derived one-time total');
assert.match(html, /<span>Grand Total<\/span><strong>USD 21,000<\/strong>/, 'grand total should ignore stale agreement header totals');
assert.match(html, /<span>Grand Total in Words<\/span><strong>USD words 21000<\/strong>/, 'grand total words should use the row-derived grand total');

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
  { saas_total: 1200, one_time_total: 19800, grand_total: 21000 },
  'agreement record totals should prefer item rows over stale header fields'
);

console.log('Agreement preview row-derived total checks passed.');
