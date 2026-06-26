const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const calls = [];
const paymentForecastSource = fs.readFileSync('payment-forecast.js', 'utf8');
const apiSource = fs.readFileSync('api.js', 'utf8');
const supabaseDataSource = fs.readFileSync('supabase-data.js', 'utf8');
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  window: {},
  document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
  Api: {
    async getPaymentForecastSummary(filters) { calls.push(['summary', filters]); return [{ scheduled_rows: 0, gross_scheduled: 125, paid_amount: 25 }]; },
    async getPaymentForecastPage(filters) {
      calls.push(['page', filters]);
      if (filters.p_page_size === 100) {
        return [
          { row_data: { invoice_id: 'invoice-1', invoice_number: 'INV-1', client_id: 'client-a', client_name: 'Client A', currency: 'USD', scheduled_amount: 100, paid_amount: 20, allocated_credit_amount: 5, remaining_amount: 75 }, total_count: 2 },
          { row_data: { invoice_id: 'invoice-2', invoice_number: 'INV-2', client_id: 'client-a', client_name: 'Client A', currency: 'USD', scheduled_amount: 25, paid_amount: 5, allocated_credit_amount: 0, remaining_amount: 20 }, total_count: 2 }
        ];
      }
      return [{ row_data: { invoice_id: 'invoice-1', remaining_amount: 100 }, total_count: 44 }];
    },
    async getPaymentForecastFollowupsPage(filters) { calls.push(['followups', filters]); return [{ row_data: { invoice_id: 'invoice-followup', client_name: 'Client Follow-up', follow_up_status: 'contacted', follow_up_notes: 'Called client' }, total_count: 12 }]; },
    async getPaymentForecastClientDistribution(filters) {
      calls.push(['clients', filters]);
      return [{ row_data: { client_name: 'Client A', currency: 'USD', scheduled_payment_count: 2, gross_scheduled_amount: 999 }, total_count: 1 }];
    },
    async createPaymentForecastFollowupLog(payload) { calls.push(['create-log', payload]); return payload; },
    async getPaymentForecastMonthlySummary(filters) {
      calls.push(['monthly', filters]);
      return [{ forecast_month: '2026-06', currency: 'USD', scheduled_payment_count: 3, due_soon_amount: 20 }];
    }
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

(async () => {
  ['renderPaymentForecastOverview', 'renderPaymentForecastUpcoming', 'renderPaymentForecastOverdue', 'renderPaymentForecastClientDistribution', 'renderPaymentForecastMonthlyForecast', 'renderPaymentForecastFollowUp'].forEach(name => assert.strictEqual(typeof forecast[name], 'function', `${name} must exist`));
  assert.doesNotMatch(paymentForecastSource, /Collection follow-up tracking is not configured yet\./);
  assert.match(apiSource, /getPaymentForecastFollowupsPage[\s\S]*followups_page/);
  assert.match(supabaseDataSource, /followups_page:\s*'get_payment_forecast_followups_page'/);
  assert.match(apiSource, /getPaymentForecastFollowupLogs[\s\S]*followup_logs/);
  assert.match(apiSource, /createPaymentForecastFollowupLog[\s\S]*create_followup_log/);
  assert.match(supabaseDataSource, /get_payment_forecast_followup_logs/);
  assert.match(supabaseDataSource, /payment_forecast_followup_logs/);
  assert.match(supabaseDataSource, /'create_followup_log'[\s\S]*payment_forecast_followup_logs/);
  const followupActions = forecast.followupActionButtons({ forecast_row_id: 'row-1', invoice_id: 'invoice-1', client_id: 'client-1' });
  ['Open Invoice', 'Open Client', 'Open Statement', 'Activity', 'Add Note', 'Edit Follow-up', 'Mark as Followed Up'].forEach(label => assert.match(followupActions, new RegExp(label)));
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
  assert.strictEqual(forecast.state.loading.summary, false);
  assert.strictEqual(forecast.state.summary.scheduled_rows, 0, 'backend zero must be preserved');
  assert.strictEqual(forecast.state.summary.credit_adjusted, undefined, 'missing summary metrics must remain missing');

  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.at(-1)[1].p_view, 'all', 'overview row RPC must request all scheduled payments');
  assert.strictEqual(calls.at(-1)[1].p_page_size, 10, 'overview must request the fixed 10-row page size');
  assert.match(forecast.renderPagination(), /Showing 1–10 of 44/, 'overview must paginate its scheduled payment rows');

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
  const clientRpcCallsBefore = calls.filter(call => call[0] === 'clients').length;
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'page');
  assert.strictEqual(calls.at(-1)[1].p_view, 'all', 'client distribution must use raw scheduled rows as the gross source of truth');
  assert.strictEqual(calls.at(-1)[1].p_page_size, 100, 'client distribution gross scheduled audit must fetch full raw pages');
  assert.strictEqual(calls.filter(call => call[0] === 'clients').length, clientRpcCallsBefore, 'client distribution must not trust stale grouped gross scheduled RPC totals');
  assert.strictEqual(forecast.state.rowsByTab.client_distribution[0].client_name, 'Client A');
  assert.strictEqual(forecast.state.rowsByTab.client_distribution[0].gross_scheduled_amount, 125);
  assert.strictEqual(forecast.state.rowsByTab.client_distribution[0].paid_amount, 25);
  assert.strictEqual(forecast.state.rowsByTab.client_distribution[0].credit_adjustment_amount, 5);
  assert.strictEqual(forecast.state.rowsByTab.client_distribution[0].net_expected_amount, 95);

  forecast.state.activeTab = 'monthly_forecast';
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'monthly');
  assert.strictEqual(calls.at(-1)[1].p_view, 'monthly_forecast');
  assert.strictEqual(forecast.state.rowsByTab.monthly_forecast[0].forecast_month, '2026-06');
  assert.strictEqual(forecast.state.rowsByTab.monthly_forecast[0].due_soon_amount, 20);

  forecast.state.pagination.upcoming.page = 3;
  forecast.state.pagination.overdue.page = 2;
  forecast.state.pagination.client_distribution.page = 4;
  await forecast.filtersChanged();
  Object.values(forecast.state.pagination).forEach(pagination => assert.strictEqual(pagination.page, 1));

  forecast.state.activeTab = 'collection_follow_up';
  forecast.state.pagination.collection_follow_up.page = 2;
  await forecast.loadActiveTab();
  assert.strictEqual(calls.at(-1)[0], 'followups');
  assert.strictEqual(calls.at(-1)[1].p_view, 'collection_follow_up');
  assert.strictEqual(calls.at(-1)[1].p_page, 2, 'follow-up pagination must be independent');
  assert.strictEqual(calls.at(-1)[1].p_page_size, 10);
  assert.strictEqual(forecast.state.pagination.collection_follow_up.total, 12);
  assert.strictEqual(forecast.state.rowsByTab.collection_follow_up[0].follow_up_notes, 'Called client');
  assert.match(forecast.renderPagination(), /Showing 11–12 of 12/);
  assert.strictEqual(typeof forecast.renderPaymentForecastFollowUp, 'function');
  forecast.state.activityRow = { client_name: 'Client Follow-up', invoice_number: 'INV-1', follow_up_status: 'contacted' };
  forecast.state.activityLogs = [{ action_type: 'note', note: 'Called client', status_at_time: 'contacted', new_status: 'contacted', created_by_email: 'collector@example.com' }];
  ['openPaymentForecastFollowupActivity', 'loadPaymentForecastFollowupLogs', 'renderPaymentForecastFollowupLogs', 'openPaymentForecastAddFollowupNote', 'savePaymentForecastFollowupNote'].forEach(name => assert.strictEqual(typeof forecast[name], 'function', `${name} must exist`));
  assert.strictEqual(typeof forecast.renderActivityModal, 'function');
  const noteLogHtml = forecast.renderPaymentForecastFollowupLogs(forecast.state.activityLogs);
  assert.match(noteLogHtml, /Note[\s\S]*collector@example\.com[\s\S]*Status at time of activity[\s\S]*Contacted[\s\S]*Called client/);
  assert.doesNotMatch(noteLogHtml, /→/, 'note logs must not be presented as status changes');
  forecast.state.activityLogs = [{ action_type: 'status_changed', old_status: 'not_started', new_status: 'contacted' }];
  assert.match(forecast.renderPaymentForecastFollowupLogs(forecast.state.activityLogs), /Not Started[\s\S]*→[\s\S]*Contacted/);
  forecast.state.activityLogs = [{ action_type: 'activity' }];
  assert.match(forecast.renderPaymentForecastFollowupLogs(forecast.state.activityLogs), /Contacted/, 'legacy logs must fall back to the row status');
  forecast.currentUser = () => ({});
  await forecast.savePaymentForecastFollowupNote({ followup_id: 'followup-1', follow_up_status: 'promised_to_pay' }, 'Payment promised');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.at(-1)[1])), { followup_id: 'followup-1', invoice_id: null, invoice_number: '', client_name: '', created_by: null, created_by_email: '', action_type: 'note', note: 'Payment promised', status_at_time: 'promised_to_pay', new_status: 'promised_to_pay' });
  assert.match(forecast.renderPaymentForecastFollowupLogs([]), /No activity logs yet\./);

  forecast.state.activeTab = 'overdue';
  forecast.state.pagination.overdue.total = 0;
  const emptyPagination = forecast.renderPagination();
  assert.match(emptyPagination, /Showing 0–0 of 0/);
  assert.match(emptyPagination, /Page 1 of 1/);
  assert.strictEqual((emptyPagination.match(/disabled/g) || []).length, 2, 'both empty pagination buttons must be disabled');

  context.Api.getPaymentForecastSummary = async () => { throw new Error('Summary RPC failed'); };
  await forecast.loadSummary();
  assert.strictEqual(forecast.state.loading.summary, false, 'summary loading must clear after an RPC failure');
  assert.strictEqual(forecast.state.summaryError, '', 'summary fallback should recover when page RPC is available');

  console.log('Payment Forecast RPC loading tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
