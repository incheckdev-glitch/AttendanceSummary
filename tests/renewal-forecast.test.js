const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const frontend = fs.readFileSync('renewal-forecast.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const permissions = fs.readFileSync('permissions.js', 'utf8');
const sourceMigration = fs.readFileSync('sql/migrations/20260610_monthly_renewal_forecast_admin_guard.sql', 'utf8');

const rpcCalls = [];
const rpcClient = {
  async rpc(name, payload) {
    rpcCalls.push([name, payload]);
    if (name === 'crm_get_monthly_renewal_forecast') {
      return {
        data: [{
          renewal_month: '2026-08-19',
          client_count: '2',
          location_count: '3',
          expected_renewal_value: '2400',
          renewed_count: '1',
          pending_count: '1',
          overdue_count: '0',
          no_renewal_needed_count: '1'
        }],
        error: null
      };
    }
    if (name === 'crm_get_monthly_renewal_forecast_details') {
      return {
        data: [{
          id: 'invoice-item-1',
          invoice_number: 'SA/2026/01',
          agreement_number: 'Agreement#00001',
          client_id: 'client-1',
          client_name: 'Client One',
          location_name: 'Location One',
          service_start_date: '2025-09-01',
          service_end_date: '2026-08-31',
          current_period_amount: '1080',
          current_annual_price: '1200',
          expected_renewal_amount: '1080',
          discount_percent: '10',
          renewal_status: 'due_soon',
          currency: 'USD',
          country: 'Lebanon',
          owner: 'CS Owner',
          days_until_renewal: '82'
        }],
        error: null
      };
    }
    return { data: [], error: null };
  }
};

const document = {
  getElementById() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  body: { classList: { add() {}, remove() {} } },
  readyState: 'loading'
};
const window = {
  Permissions: { canPerformAction: () => true, can: () => true },
  SupabaseClient: { getClient: () => rpcClient },
  addEventListener() {},
  confirm: () => true
};
const context = {
  console,
  Blob: class {},
  URL: {},
  window,
  document,
  U: {
    fmtNumber: value => String(value),
    fmtDate: value => value,
    escapeHtml: value => String(value),
    escapeAttr: value => String(value)
  },
  UI: { toast() {} },
  Permissions: { can: () => true, hasAdminOverride: () => false }
};
vm.createContext(context);
vm.runInContext(frontend, context);
const forecast = context.window.RenewalForecast;
forecast.render = () => {};
forecast.today = () => '2026-06-10';
forecast.ensureDefaultDateRange();

assert.strictEqual(forecast.state.filters.dateFrom, '2025-06-01', 'default forecast must start at the first day of the current month minus 12 months');
assert.strictEqual(forecast.state.filters.dateTo, '2027-06-10', 'default forecast must end at the current date plus 12 months');
assert.deepStrictEqual(JSON.parse(JSON.stringify(forecast.defaultDateRange())), { dateFrom: '2025-06-01', dateTo: '2027-06-10' }, 'default range must include the prior and next 12 months');

assert.strictEqual(forecast.PAGE_SIZE, 10, 'renewal forecast pagination must use 10 rows per page');
assert.deepStrictEqual(JSON.parse(JSON.stringify(forecast.pagination(1, 37))), { currentPage: 1, totalPages: 4, start: 1, end: 10, rowsStart: 0, rowsEnd: 10 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(forecast.pagination(4, 37))), { currentPage: 4, totalPages: 4, start: 31, end: 37, rowsStart: 30, rowsEnd: 40 });
assert.match(forecast.renderPagination('details', 1, 37), /Showing 1–10 of 37 renewals/);
assert.match(forecast.renderPagination('details', 4, 37), /data-rf-page="next"[^>]+disabled/);

(async () => {
  const summaryRows = await forecast.fetchMonthSummaries();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rpcCalls[0])), ['crm_get_monthly_renewal_forecast', { p_start_date: '2025-06-01', p_months: 25 }], 'summary RPC must receive the selected start date and inclusive month window');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(summaryRows[0])), {
    renewal_month: '2026-08-01',
    client_count: 2,
    location_count: 3,
    expected_renewal_value: 2400,
    renewed_count: 1,
    pending_count: 1,
    overdue_count: 0,
    no_renewal_needed_count: 1
  });

  const detailRows = await forecast.fetchMonthDetails('2026-08');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rpcCalls[1])), ['crm_get_monthly_renewal_forecast_details', { p_month: '2026-08-01' }], 'detail RPC must use the first day of the selected renewal month');
  assert.strictEqual(detailRows.length, 1);
  const detail = detailRows[0];
  assert.strictEqual(detail.source_table, 'invoice_items', 'renewal opportunities must remain invoice-item based');
  assert.strictEqual(detail.invoice_item_id, 'invoice-item-1');
  assert.strictEqual(detail.invoice_number, 'SA/2026/01');
  assert.strictEqual(detail.agreement_number, 'Agreement#00001');
  assert.strictEqual(detail.client_name, 'Client One');
  assert.strictEqual(detail.location_name, 'Location One');
  assert.strictEqual(detail.service_start_date, '2025-09-01');
  assert.strictEqual(detail.service_end_date, '2026-08-31');
  assert.strictEqual(detail.current_invoice_row_amount, 1080);
  assert.strictEqual(detail.current_annual_price, 1200);
  assert.strictEqual(detail.expected_renewal_amount, 1080);
  assert.strictEqual(detail.current_discount, 10);
  assert.strictEqual(detail.renewal_status, 'due_soon');
  assert.strictEqual(detail.renewal_month, '2026-08-01');
  assert.strictEqual(forecast.getRenewalForecastServiceStart(detail), '2025-09-01');
  assert.strictEqual(forecast.getRenewalForecastServiceEnd(detail), '2026-08-31');

  await forecast.fetchMonthDetails('2026-08');
  assert.strictEqual(rpcCalls.filter(([name]) => name === 'crm_get_monthly_renewal_forecast_details').length, 1, 'detail rows must be cached by month');

  forecast.state.rows = detailRows;
  forecast.state.filters = { dateFrom: '2028-01-01', dateTo: '2028-12-31', client: 'all', country: 'all', status: 'all', agreement: 'all', owner: 'all' };
  forecast.state.overviewPage = 3;
  forecast.state.detailPage = 2;
  forecast.applyFilters();
  assert.strictEqual(forecast.state.overviewPage, 1, 'filter changes must reset overview pagination');
  assert.strictEqual(forecast.state.detailPage, 1, 'filter changes must reset detail pagination');
  assert.strictEqual(forecast.filtered().length, 0, 'active date filters may remove otherwise valid renewal rows');
  assert(forecast.emptyState().includes('No renewal opportunities match your filters.'), 'filtered empty state must explain that active filters removed rows');
  assert(forecast.emptyState().includes('Service end from: 2028-01-01'), 'filtered empty state must show active filters');
  forecast.state.rows = [];
  assert(forecast.emptyState().includes('No renewal forecast rows found.'), 'source empty state must clearly report that no forecast rows were returned');

  const fallbackRows = forecast.refreshFallbackRowsFromSummaries(summaryRows);
  assert.strictEqual(fallbackRows[0]._summaryOnly, true, 'summary fallback rows must be marked so they are not treated as detailed invoice items');
  assert.strictEqual(fallbackRows[0].expected_renewal_amount, 2400);
  assert.strictEqual(fallbackRows[0].location_name, '3 Annual SaaS row(s)');

  assert(!frontend.includes('scheduled_due_date'), 'renewal forecast must not use payment schedule dates');
  assert(!html.includes('<option value="poc">POC rows</option>'), 'POC must not be exposed as an includable renewal filter');
  ['Renewals This Month', 'Upcoming 30 Days', 'Upcoming 90 Days', 'Expected Renewal Value', 'Overdue Renewals', 'SaaS Rows / Locations', 'Invoice Number', 'Current Invoice SaaS Row Amount', 'Create Renewal Invoice'].forEach(label => assert(frontend.includes(label) || html.includes(label), `missing ${label}`));
  assert(html.includes('id="renewalForecastView"') && html.includes('renewal-forecast.js'));
  assert(app.includes("view === 'renewalForecast'") && permissions.includes('renewalForecast'));
  assert(permissions.includes("renewalForecast: [{ resource: 'monthly_renewal_forecast', action: 'view' }]"), 'renewal forecast tab access must use the view permission');
  assert(!html.match(/id="renewalForecastTab"[^>]+data-permission-resource="payment_forecast"/), 'renewal forecast must not inherit Payment Forecast permissions');
  assert(html.includes('data-permission-resource="monthly_renewal_forecast" data-permission-action="view"'), 'renewal forecast tab must declare its view permission');
  assert.match(frontend, /rpc\('crm_get_monthly_renewal_forecast', \{[\s\S]*?p_start_date: dateFrom,[\s\S]*?p_months: months/, 'frontend must use the monthly summary RPC');
  assert.match(frontend, /rpc\('crm_get_monthly_renewal_forecast_details', \{[\s\S]*?p_month: monthDate/, 'frontend must use the month-detail RPC');
  assert(sourceMigration.includes('from public.invoice_items item_row') && sourceMigration.includes('left join public.invoices invoice_row'), 'database renewal source must be invoice items joined to invoices');
  assert(!sourceMigration.includes("'agreement_items'"), 'database forecast source must not return agreement_items');
  assert(sourceMigration.includes('revoke all on function public.crm_get_monthly_renewal_forecast() from anon;'), 'anonymous users must not execute the forecast RPC');

  console.log('Monthly Renewal Forecast RPC architecture checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
