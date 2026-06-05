const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const calls = [];
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  window: {},
  document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
  Api: {
    async getPaymentForecastSummary(filters) { calls.push(['summary', filters]); return [{ scheduled_rows: 0, gross_scheduled: 125, paid_amount: 25 }]; },
    async getPaymentForecastPage(filters) { calls.push(['page', filters]); return [{ row_data: { invoice_id: 'invoice-1', remaining_amount: 100 }, total_count: 1 }]; },
    async getPaymentForecastClientDistribution(filters) { calls.push(['clients', filters]); return [{ client_name: 'Client A', currency: 'USD', scheduled_payment_count: 2 }]; },
    async getPaymentForecastMonthlySummary(filters) { calls.push(['monthly', filters]); return [{ month: '2026-06', currency: 'USD', scheduled_payment_count: 3 }]; }
  },
  U: { fmtNumber: String, escapeHtml: String, escapeAttr: String },
  UI: { toast() {} }
});
context.window = context;
vm.runInContext(fs.readFileSync('payment-forecast.js', 'utf8'), context);
const forecast = vm.runInContext('PaymentForecast', context);
forecast.render = () => {};
forecast.renderSummary = () => {};
forecast.populateFilters = () => {};

(async () => {
  const filters = forecast.rpcFilters();
  assert.deepStrictEqual(Object.keys(filters).sort(), [
    'p_client', 'p_currency', 'p_date_from', 'p_date_to', 'p_due_this_month', 'p_due_this_week',
    'p_follow_up_status', 'p_only_unpaid', 'p_overdue_only', 'p_payment_term', 'p_search', 'p_status', 'p_view'
  ].sort());

  forecast.state.activeTab = 'overview';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'summary');
  assert.strictEqual(calls.at(-1)[1].p_view, 'overview');
  assert.strictEqual(forecast.state.summary.scheduled_rows, 0, 'backend zero must be preserved');
  assert.strictEqual(forecast.state.summary.credit_adjusted, undefined, 'missing summary metrics must remain missing');

  forecast.state.activeTab = 'upcoming';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.at(-1)[1].p_view, 'upcoming');

  forecast.state.activeTab = 'overdue';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.at(-1)[1].p_view, 'overdue');

  forecast.state.activeTab = 'clients';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'clients');
  assert.strictEqual(calls.at(-1)[1].p_view, 'clients');
  assert.strictEqual(forecast.state.groupedRows[0].client_name, 'Client A');

  forecast.state.activeTab = 'monthly';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'monthly');
  assert.strictEqual(calls.at(-1)[1].p_view, 'monthly');
  assert.strictEqual(forecast.state.groupedRows[0].month, '2026-06');

  console.log('Payment Forecast RPC loading tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
