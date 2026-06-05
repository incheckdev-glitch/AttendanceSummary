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
    async getPaymentForecastPage(filters) { calls.push(['page', filters]); return [{ row_data: { invoice_id: 'invoice-1', remaining_amount: 100 }, total_count: 44 }]; },
    async getPaymentForecastClientDistribution(filters) {
      calls.push(['clients', filters]);
      return [{ row_data: { client_name: 'Client A', currency: 'USD', scheduled_payment_count: 2, gross_scheduled_amount: 125 }, total_count: 1 }];
    },
    async getPaymentForecastMonthlySummary(filters) {
      calls.push(['monthly', filters]);
      return [{ forecast_month: '2026-06', currency: 'USD', scheduled_payment_count: 3, due_soon_amount: 20 }];
    }
  },
  U: { fmtNumber: String, escapeHtml: String, escapeAttr: String },
  UI: { toast() {} }
});
context.window = context;
vm.runInContext(fs.readFileSync('payment-forecast.js', 'utf8'), context);
const forecast = vm.runInContext('PaymentForecast', context);
forecast.render = () => {};
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
  assert.strictEqual(forecast.state.summaryLoading, false);
  assert.strictEqual(forecast.state.summary.scheduled_rows, 0, 'backend zero must be preserved');
  assert.strictEqual(forecast.state.summary.credit_adjusted, undefined, 'missing summary metrics must remain missing');
  assert.strictEqual(forecast.renderPagination(), '', 'overview must not render pagination');

  forecast.state.activeTab = 'upcoming';
  forecast.state.pagination.upcoming.page = 2;
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.at(-1)[1].p_view, 'upcoming');
  assert.strictEqual(calls.at(-1)[1].p_page, 2);
  assert.strictEqual(forecast.state.pagination.upcoming.total, 44);

  forecast.state.activeTab = 'overdue';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.at(-1)[1].p_view, 'overdue');
  assert.strictEqual(calls.at(-1)[1].p_page, 1, 'overdue page must be independent from upcoming page');
  assert.strictEqual(forecast.state.pagination.upcoming.page, 2);

  forecast.state.activeTab = 'client_distribution';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'clients');
  assert.strictEqual(calls.at(-1)[1].p_view, 'client_distribution');
  assert.strictEqual(calls.at(-1)[1].p_page, undefined, 'grouped RPC must not receive page RPC parameters');
  assert.strictEqual(forecast.state.groupedRows[0].client_name, 'Client A');
  assert.strictEqual(forecast.state.groupedRows[0].gross_scheduled_amount, 125);

  forecast.state.activeTab = 'monthly_forecast';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'monthly');
  assert.strictEqual(calls.at(-1)[1].p_view, 'monthly_forecast');
  assert.strictEqual(forecast.state.groupedRows[0].forecast_month, '2026-06');
  assert.strictEqual(forecast.state.groupedRows[0].due_soon_amount, 20);

  forecast.state.pagination.upcoming.page = 3;
  forecast.state.pagination.overdue.page = 2;
  forecast.state.pagination.client_distribution.page = 4;
  await forecast.filtersChanged();
  Object.values(forecast.state.pagination).forEach(pagination => assert.strictEqual(pagination.page, 1));

  forecast.state.activeTab = 'collection_follow_up';
  await forecast.loadActiveTab();
  assert.strictEqual(forecast.renderPagination(), '', 'unconfigured follow-up tab must not render pagination');
  assert.match(forecast.renderContent(), /not configured yet/);

  forecast.state.activeTab = 'overdue';
  forecast.state.pagination.overdue.total = 0;
  const emptyPagination = forecast.renderPagination();
  assert.match(emptyPagination, /Showing 0–0 of 0/);
  assert.match(emptyPagination, /Page 1 of 1/);
  assert.strictEqual((emptyPagination.match(/disabled/g) || []).length, 2, 'both empty pagination buttons must be disabled');

  context.Api.getPaymentForecastSummary = async () => { throw new Error('Summary RPC failed'); };
  await forecast.loadSummary();
  assert.strictEqual(forecast.state.summaryLoading, false, 'summary loading must clear after an RPC failure');
  assert.strictEqual(forecast.state.summaryError, '', 'summary fallback should recover when page RPC is available');

  console.log('Payment Forecast RPC loading tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
