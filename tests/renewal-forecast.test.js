const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const frontend = fs.readFileSync('renewal-forecast.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const permissions = fs.readFileSync('permissions.js', 'utf8');
const adminGuardMigration = fs.readFileSync('sql/migrations/20260610_monthly_renewal_forecast_admin_guard.sql', 'utf8');
const context = { console, Blob: class {}, URL: {}, window: {}, document: {}, U: { fmtNumber: value => String(value), fmtDate: value => value, escapeHtml: value => String(value), escapeAttr: value => String(value) }, UI: { toast() {} } };
vm.createContext(context);
vm.runInContext(frontend, context);
const forecast = context.window.RenewalForecast;
forecast.today = () => '2026-06-10';
forecast.ensureDefaultDateRange();
assert.strictEqual(forecast.state.filters.dateFrom, '2025-06-01', 'default forecast must start at the first day of the current month minus 12 months');
assert.strictEqual(forecast.state.filters.dateTo, '2027-06-10', 'default forecast must end at the current date plus 12 months');

assert.strictEqual(forecast.PAGE_SIZE, 10, 'renewal forecast pagination must use 10 rows per page');
assert.deepStrictEqual(JSON.parse(JSON.stringify(forecast.pagination(1, 37))), { currentPage: 1, totalPages: 4, start: 1, end: 10, rowsStart: 0, rowsEnd: 10 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(forecast.pagination(4, 37))), { currentPage: 4, totalPages: 4, start: 31, end: 37, rowsStart: 30, rowsEnd: 40 });
assert.match(forecast.renderPagination('details', 1, 37), /Showing 1–10 of 37 renewals/);
assert.match(forecast.renderPagination('details', 1, 37), /Page 1 of 4/);
assert.match(forecast.renderPagination('details', 1, 37), /data-rf-page="previous"[^>]+disabled/);
assert.match(forecast.renderPagination('details', 4, 37), /data-rf-page="next"[^>]+disabled/);

const agreementItems = [
  { id: 'agreement-only', agreement_id: 'AGR-1', section: 'Annual SaaS', item_name: 'Location A', service_end_date: '2026-06-30', unit_price: 9999 }
];
const invoiceItems = [
  { id: 'i1', invoice_number: 'INV-1', agreement_id: 'AGR-1', company_id: 'C1', section: 'Annual SaaS', item_name: 'InCheck Location A', location_name: 'Location A', service_start_date: '2025-06-30', service_end_date: '2026-06-30', unit_price: 1200, amount: 1080, discount_percent: 10 },
  { id: 'i1', invoice_number: 'INV-1', agreement_id: 'AGR-1', company_id: 'C1', section: 'Annual SaaS', location_name: 'Location A', service_end_date: '2026-06-30', unit_price: 1200 },
  { id: 'setup', agreement_id: 'AGR-1', company_id: 'C1', section: 'Annual SaaS setup', service_end_date: '2026-06-30', unit_price: 500 },
  { id: 'poc', agreement_id: 'AGR-2', company_id: 'C2', section: 'Annual SaaS POC', service_end_date: '2026-07-01', unit_price: 100 },
  { id: 'i2', agreement_id: 'AGR-3', company_id: 'C2', category: 'Subscription licence', location_name: 'Location B', service_start_date: '2025-08-01', billing_end_date: '2026-08-01', due_date: '2025-01-01', unit_price: 2400 },
  { id: 'old', agreement_id: 'AGR-OLD', company_id: 'C3', category: 'SaaS license', location_name: 'Location C', service_start_date: '2024-05-01', period_end: '2025-05-01', unit_price: 600 },
  { id: 'renewal', agreement_id: 'AGR-NEW', company_id: 'C3', category: 'SaaS license', location_name: 'Location C', service_start_date: '2025-05-02', end_date: '2026-05-01', unit_price: 600 },
  { id: 'dated-only', agreement_id: 'AGR-4', company_id: 'C4', description: 'Managed platform row', service_start: '2026-01-01', service_end: '2027-01-01', unit_price: 300 },
  { id: 'location-match', agreement_id: 'AGR-5', company_id: 'C5', location_name: 'InCheck Site E', start_service_date: '2026-02-01', end_service_date: '2027-02-01', unit_price: 400 },
  { id: 'subscription-aliases', agreement_id: 'AGR-6', company_id: 'C6', item_type: 'Recurring service', subscription_start_date: '2026-03-01', subscription_end_date: '2027-03-01', unit_price: 500 },
  { id: 'one-time-dated', agreement_id: 'AGR-7', company_id: 'C7', description: 'One time migration', service_start_date: '2026-01-01', service_end_date: '2027-01-01', unit_price: 700 }
];
let sources = forecast.normalizeSourceRows(invoiceItems);
assert(!sources.some(row => row.id === agreementItems[0].id), 'agreement_items must never be renewal opportunities');
assert.deepStrictEqual(JSON.parse(JSON.stringify(sources.map(row => row.id))), ['i1', 'i1', 'i2', 'old', 'renewal', 'dated-only', 'location-match', 'subscription-aliases'], 'invoice SaaS rows and non-excluded rows with supported service date pairs are sources');
assert(!sources.some(row => ['setup', 'poc', 'one-time-dated'].includes(row.id)), 'setup, POC, and one-time rows must always be excluded');
assert.strictEqual(forecast.serviceStart(invoiceItems.find(row => row.id === 'subscription-aliases')), '2026-03-01', 'subscription_start_date must be supported');
assert.strictEqual(forecast.serviceEnd(invoiceItems.find(row => row.id === 'subscription-aliases')), '2027-03-01', 'subscription_end_date must be supported');
['service_start_date', 'start_date', 'period_start', 'billing_start_date', 'service_start', 'start_service_date', 'subscription_start_date', 'service_end_date', 'end_date', 'period_end', 'billing_end_date', 'service_end', 'end_service_date', 'subscription_end_date'].forEach(field => assert(frontend.includes(`'${field}'`), `missing supported service date field ${field}`));
assert.deepStrictEqual(JSON.parse(JSON.stringify(forecast.defaultDateRange())), { dateFrom: '2025-06-01', dateTo: '2027-06-10' }, 'default range must include the prior 12 months and next 12 months');

const agreements = [{ id: 'uuid-1', agreement_id: 'AGR-1', agreement_number: 'AGR-1', client_id: 'C1' }, { id: 'uuid-3', agreement_id: 'AGR-3', agreement_number: 'AGR-3', client_id: 'C2' }];
const clients = [{ id: 'C1', client_name: 'Client One' }, { id: 'C2', client_name: 'Client Two' }, { id: 'C3', client_name: 'Client Three' }];
const rows = forecast.buildRows(forecast.normalizeSourceRows(invoiceItems), agreements, clients);
assert.strictEqual(rows.length, 7, 'the same invoice item must not be counted twice while dated invoice rows remain included');
const first = rows.find(row => row.opportunity_id === 'invoice_items:i1');
const second = rows.find(row => row.opportunity_id === 'invoice_items:i2');
const old = rows.find(row => row.opportunity_id === 'invoice_items:old');
assert.strictEqual(first.invoice_number, 'INV-1');
assert.strictEqual(first.current_invoice_row_amount, 1080, 'drawer amount must be the current invoice SaaS row amount');
assert.strictEqual(first.expected_renewal_amount, 1080, 'expected renewal formula must use unit price, 12 months, and discount');
assert.strictEqual(first.renewal_status, 'due_soon');
assert.strictEqual(second.service_end_date, '2026-08-01', 'billing_end_date is an allowed service end fallback');
assert.strictEqual(second.renewal_status, 'upcoming', 'invoice due date must not drive renewal status');
assert.strictEqual(old.renewal_status, 'renewed', 'a later SaaS invoice item for the same client/location must mark the old row renewed even when agreement changes');
assert.strictEqual(forecast.summary.call({ ...forecast, filtered: () => rows }).value, 5880, 'expected renewal value must sum invoice SaaS rows');
forecast.state.rows = rows;
forecast.state.filters = { dateFrom: '2028-01-01', dateTo: '2028-12-31', client: 'all', country: 'all', status: 'all', agreement: 'all', owner: 'all' };
forecast.state.overviewPage = 3;
forecast.state.detailPage = 2;
forecast.applyFilters();
assert.strictEqual(forecast.state.overviewPage, 1, 'filter changes must reset overview pagination');
assert.strictEqual(forecast.state.detailPage, 1, 'filter changes must reset detail pagination');
assert.strictEqual(forecast.filtered().length, 0, 'active date filters may remove otherwise valid renewal rows');
assert(forecast.emptyState().includes('No renewal rows match the active filters.'), 'filtered empty state must explain that active filters removed rows');
assert(forecast.emptyState().includes('Service end from: 2028-01-01'), 'filtered empty state must show active filters');
forecast.state.rows = [];
assert(forecast.emptyState().includes('No renewal rows found from invoice SaaS service end dates. Check invoice item service dates or filters.'), 'source empty state must explain how invoice service dates drive the forecast');
assert(!frontend.includes('scheduled_due_date'), 'renewal forecast must not use payment schedule dates');
assert(!frontend.includes('normalizeSourceRows(agreementItems'), 'agreement_items must not be passed to source normalization');
assert(!frontend.includes('renewalAgreement') && !frontend.includes('renewalInvoice'), 'header rows must not mark invoice items renewed');
assert(!frontend.includes('No Annual SaaS renewals match the selected filters.'), 'misleading legacy empty state must be removed');
assert(!html.includes('<option value="poc">POC rows</option>'), 'POC must not be exposed as an includable renewal filter');
['Renewals This Month','Upcoming 30 Days','Upcoming 90 Days','Expected Renewal Value','Overdue Renewals','Number of SaaS Rows / Locations','Invoice Number','Current Invoice SaaS Row Amount','Create Renewal Invoice'].forEach(label => assert(frontend.includes(label) || html.includes(label), `missing ${label}`));
assert(html.includes('id="renewalForecastView"') && html.includes('renewal-forecast.js'));
assert(app.includes("view === 'renewalForecast'") && permissions.includes('renewalForecast'));
assert(permissions.includes("if (key === 'renewalForecast') return this.isAdmin();"), 'renewal forecast tab access must require the exact admin role');
assert(!html.match(/id="renewalForecastTab"[^>]+data-permission-resource="payment_forecast"/), 'renewal forecast must not inherit Payment Forecast permissions');
assert(html.includes('data-admin-only="monthly-renewal-forecast"'), 'renewal forecast tab must be marked admin-only');
assert(frontend.includes('if (!this.requireAdmin() || this.state.loading) return;'), 'refresh must stop before loading data for non-admin users');
assert(frontend.includes('render() { if (!this.isAdmin()) return;'), 'component rendering must stop for non-admin users');
assert(frontend.includes("rpc('crm_get_monthly_renewal_forecast')"), 'frontend must call the backend admin guard before loading source records');
assert(app.includes('Access denied. This forecast is available for admin users only.'), 'direct-route denial must use the required message');
assert(adminGuardMigration.includes("where profile.id = auth.uid()") && adminGuardMigration.includes("v_role_key <> 'admin'"), 'RPC must validate the authenticated profile role is admin');
assert(adminGuardMigration.includes("raise exception 'Access denied. Admin only.'"), 'RPC must raise the required non-admin error');
assert(adminGuardMigration.includes('from public.invoice_items item_row') && adminGuardMigration.includes('left join public.invoices invoice_row'), 'RPC must source invoice_items joined to invoices');
assert(!adminGuardMigration.includes("'agreement_items'"), 'RPC must not return agreement_items as forecast sources');
assert(adminGuardMigration.includes('revoke all on function public.crm_get_monthly_renewal_forecast() from anon;'), 'anonymous users must not execute the guard RPC');
console.log('Monthly Renewal Forecast checks passed.');
