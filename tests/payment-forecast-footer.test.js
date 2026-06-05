const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const index = fs.readFileSync('index.html', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

assert.doesNotMatch(index, /id=["']appFooter["']/, 'normal application layout must not render a global app footer');
assert.match(index, /id="paymentForecastView" class="view payment-forecast-module"/, 'Payment Forecast must identify its module boundary');
assert.match(index, /id="paymentForecastTabBody" class="pf-content payment-forecast-table"/, 'Payment Forecast must identify its table boundary');
assert.match(styles, /#app \.document-footer[\s\S]*#paymentForecastView footer[\s\S]*\.payment-forecast-table footer[\s\S]*display:none !important;/, 'app and Payment Forecast footer safety rules must remain in place');


['invoices.js', 'receipts.js', 'credit-notes.js'].forEach(file => {
  const previewRenderer = fs.readFileSync(file, 'utf8');
  assert.match(previewRenderer, /document-footer/, `${file} must keep its document preview footer`);
  assert.match(previewRenderer, /position:\s*static\s*!important/, `${file} document preview footer must remain in normal document flow`);
});

const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  window: {},
  document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
  Api: {},
  U: { fmtNumber: String, escapeHtml: String, escapeAttr: String },
  UI: { toast() {} }
});
context.window = context;
vm.runInContext(fs.readFileSync('payment-forecast.js', 'utf8'), context);
const forecast = vm.runInContext('PaymentForecast', context);

assert.strictEqual(forecast.fixedPageSize, 10, 'Payment Forecast pagination must remain fixed at 10 rows');
assert.doesNotMatch(forecast.renderPaymentRowsTable([]), /<footer|document-footer|app-footer|preview-footer/i, 'Payment Forecast row renderer must never inject footer markup');

console.log('Payment Forecast footer isolation tests passed.');
