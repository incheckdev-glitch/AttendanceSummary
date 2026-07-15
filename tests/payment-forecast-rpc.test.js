const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const calls = [];
const paymentForecastSource = fs.readFileSync('payment-forecast.js', 'utf8');
const apiSource = fs.readFileSync('api.js', 'utf8');
const supabaseDataSource = fs.readFileSync('supabase-data.js', 'utf8');

const rawRows = [
  {
    invoice_id: 'invoice-1', invoice_number: 'INV-1', client_id: 'client-a', client_name: 'Client A', currency: 'USD',
    scheduled_due_date: '2026-06-15', scheduled_amount: 100, paid_amount: 20, allocated_credit_amount: 5, remaining_amount: 75,
    followup_id: 'followup-1', follow_up_status: 'contacted', follow_up_notes: 'Called client', last_follow_up_at: '2026-06-09'
  },
  {
    invoice_id: 'invoice-2', invoice_number: 'INV-2', client_id: 'legacy-client-a', client_name: ' client a ', currency: 'USD',
    scheduled_due_date: '2026-06-01', scheduled_amount: 25, paid_amount: 5, allocated_credit_amount: 0, remaining_amount: 20,
    follow_up_status: 'not_started'
  },
  {
    invoice_id: 'invoice-3', invoice_number: 'INV-3', client_id: 'client-b', client_name: 'Client B', currency: 'USD',
    scheduled_due_date: '2026-07-05', scheduled_amount: 50, paid_amount: 0, allocated_credit_amount: 0, remaining_amount: 50,
    follow_up_status: 'not_started'
  }
];

const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  window: {},
  document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
  Api: {
    async getPaymentForecastSummary(filters) {
      calls.push(['summary', filters]);
      return [{ scheduled_rows: 3, gross_scheduled: 175, paid_amount: 25, remaining_forecast: 145 }];
    },
    async getPaymentForecastPage(filters) {
      calls.push(['page', filters]);
      return rawRows.map(row => ({ row_data: row, total_count: rawRows.length }));
    },
    async getPaymentForecastFollowupsPage(filters) { calls.push(['followups', filters]); return []; },
    async getPaymentForecastClientDistribution(filters) { calls.push(['clients', filters]); return []; },
    async createPaymentForecastFollowupLog(payload) { calls.push(['create-log', payload]); return payload; },
    async getPaymentForecastMonthlySummary(filters) { calls.push(['monthly', filters]); return []; }
  },
  U: { fmtNumber: String, escapeHtml: String, escapeAttr: String },
  UI: { toast() {} }
});
context.window = context;
vm.runInContext(paymentForecastSource, context);
const forecast = vm.runInContext('PaymentForecast', context);
forecast.render = () => {};
forecast.renderActiveTab = () => {};
forecast.populateFilters = () => {};
forecast.today = () => '2026-06-10';

(async () => {
  ['renderPaymentForecastOverview', 'renderPaymentForecastUpcoming', 'renderPaymentForecastOverdue', 'renderPaymentForecastClientDistribution', 'renderPaymentForecastMonthlyForecast', 'renderPaymentForecastFollowUp'].forEach(name => assert.strictEqual(typeof forecast[name], 'function', `${name} must exist`));
  assert.match(apiSource, /getPaymentForecastFollowupLogs[\s\S]*followup_logs/);
  assert.match(apiSource, /createPaymentForecastFollowupLog[\s\S]*create_followup_log/);
  assert.match(supabaseDataSource, /get_payment_forecast_followup_logs/);
  assert.match(supabaseDataSource, /payment_forecast_followup_logs/);

  const followupActions = forecast.followupActionButtons(rawRows[0]);
  ['Add Note', 'Update Status', 'Open Invoice', 'Create Communication', 'View Logs'].forEach(label => assert.match(followupActions, new RegExp(label)));
  ['Open Statement', 'Mark as Followed Up'].forEach(label => assert.doesNotMatch(followupActions, new RegExp(label), `obsolete follow-up action ${label} must not return`));
  assert.notStrictEqual(forecast.state.rowsByTab.upcoming, forecast.state.rowsByTab.overdue, 'tabs must have separate row arrays');

  const filters = forecast.rpcFilters();
  assert.deepStrictEqual(Object.keys(filters).sort(), [
    'p_client', 'p_currency', 'p_date_from', 'p_date_to', 'p_due_this_month', 'p_due_this_week',
    'p_follow_up_status', 'p_only_unpaid', 'p_overdue_only', 'p_payment_term', 'p_search', 'p_status', 'p_view'
  ].sort());

  forecast.state.activeTab = 'overview';
  await forecast.loadSummary();
  assert.strictEqual(calls.at(-1)[0], 'summary');
  assert.strictEqual(calls.at(-1)[1].p_view, 'overview');
  assert.strictEqual(forecast.state.summary.scheduled_rows, 3);

  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.at(-1)[1].p_view, 'all', 'overview must fetch the complete filtered raw schedule source');
  assert.strictEqual(calls.at(-1)[1].p_page_size, 100, 'raw source batching must use 100-row server pages before client-side paging');
  assert.strictEqual(forecast.state.rowsByTab.overview.length, 3);
  assert.strictEqual(forecast.state.pagination.overview.total, 3);
  assert.match(forecast.renderPagination(), /Showing 1–3 of 3/);

  forecast.state.activeTab = 'upcoming';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[1].p_view, 'all', 'upcoming rows must be filtered client-side from the complete raw source');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(forecast.state.rowsByTab.upcoming.map(row => row.invoice_number))), ['INV-1', 'INV-3']);
  assert.strictEqual(forecast.state.pagination.upcoming.total, 2);

  forecast.state.activeTab = 'overdue';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[1].p_view, 'all', 'overdue rows must be filtered client-side from the complete raw source');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(forecast.state.rowsByTab.overdue.map(row => row.invoice_number))), ['INV-2']);
  assert.strictEqual(forecast.state.pagination.overdue.total, 1);

  forecast.state.activeTab = 'client_distribution';
  const groupedRpcCallsBefore = calls.filter(call => call[0] === 'clients').length;
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.at(-1)[1].p_view, 'all', 'client distribution must use raw scheduled rows as its source of truth');
  assert.strictEqual(calls.filter(call => call[0] === 'clients').length, groupedRpcCallsBefore, 'client distribution must not trust a separate grouped total source');
  assert.strictEqual(forecast.state.rowsByTab.client_distribution.length, 2);
  const clientA = forecast.state.rowsByTab.client_distribution.find(row => row.client_name === 'Client A');
  assert(clientA, 'same legal client must be consolidated despite different IDs and whitespace');
  assert.strictEqual(clientA.scheduled_payment_count, 2);
  assert.strictEqual(clientA.invoice_count, 2);
  assert.strictEqual(clientA.gross_scheduled_amount, 125);
  assert.strictEqual(clientA.paid_amount, 25);
  assert.strictEqual(clientA.credit_adjustment_amount, 5);
  assert.strictEqual(clientA.net_expected_amount, 95);
  assert.strictEqual(clientA.overdue_amount, 20);

  forecast.state.activeTab = 'monthly_forecast';
  const monthlyRpcCallsBefore = calls.filter(call => call[0] === 'monthly').length;
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.filter(call => call[0] === 'monthly').length, monthlyRpcCallsBefore, 'monthly forecast must group the same raw scheduled-row source');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(forecast.state.rowsByTab.monthly_forecast.map(row => row.forecast_month))), ['2026-06', '2026-07']);

  forecast.state.activeTab = 'collection_follow_up';
  const followupRpcCallsBefore = calls.filter(call => call[0] === 'followups').length;
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.at(-1)[1].p_view, 'all');
  assert.strictEqual(calls.filter(call => call[0] === 'followups').length, followupRpcCallsBefore, 'follow-up tab must filter the complete raw source rather than mix separate page totals');
  assert.strictEqual(forecast.state.rowsByTab.collection_follow_up.length, 1);
  assert.strictEqual(forecast.state.rowsByTab.collection_follow_up[0].follow_up_notes, 'Called client');

  forecast.state.activityRow = { client_name: 'Client Follow-up', invoice_number: 'INV-1', follow_up_status: 'contacted' };
  forecast.state.activityLogs = [{ action_type: 'note', note: 'Called client', status_at_time: 'contacted', new_status: 'contacted', created_by_email: 'collector@example.com' }];
  ['openPaymentForecastFollowupActivity', 'loadPaymentForecastFollowupLogs', 'renderPaymentForecastFollowupLogs', 'openPaymentForecastAddFollowupNote', 'savePaymentForecastFollowupNote'].forEach(name => assert.strictEqual(typeof forecast[name], 'function', `${name} must exist`));
  const noteLogHtml = forecast.renderPaymentForecastFollowupLogs(forecast.state.activityLogs);
  assert.match(noteLogHtml, /Note[\s\S]*collector@example\.com[\s\S]*Status at time of activity[\s\S]*Contacted[\s\S]*Called client/);
  assert.doesNotMatch(noteLogHtml, /→/, 'note logs must not be presented as status changes');

  forecast.currentUser = () => ({});
  await forecast.savePaymentForecastFollowupNote({ followup_id: 'followup-1', follow_up_status: 'promised_to_pay' }, 'Payment promised');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.at(-1)[1])), { followup_id: 'followup-1', invoice_id: null, invoice_number: '', client_name: '', created_by: null, created_by_email: '', action_type: 'note', note: 'Payment promised', status_at_time: 'promised_to_pay', new_status: 'promised_to_pay' });

  context.Api.getPaymentForecastSummary = async () => { throw new Error('Summary RPC failed'); };
  await forecast.loadSummary();
  assert.strictEqual(forecast.state.loading.summary, false, 'summary loading must clear after an RPC failure');
  assert.strictEqual(forecast.state.summaryError, '', 'summary fallback should recover from the raw page source');
  assert.strictEqual(forecast.state.summary.scheduled_rows, 3);

  console.log('Payment Forecast RPC loading tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
