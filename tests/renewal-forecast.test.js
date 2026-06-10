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
  { id: 'renewal', agreement_id: 'AGR-NEW', company_id: 'C3', category: 'SaaS license', location_name: 'Location C', service_start_date: '2025-05-02', end_date: '2026-05-01', unit_price: 600 }
];
let sources = forecast.normalizeSourceRows(invoiceItems);
assert(!sources.some(row => row.id === agreementItems[0].id), 'agreement_items must never be renewal opportunities');
assert.deepStrictEqual(JSON.parse(JSON.stringify(sources.map(row => row.id))), ['i1', 'i1', 'i2', 'old', 'renewal'], 'only qualifying invoice SaaS rows with service end dates are sources');
forecast.state.filters.status = 'poc';
sources = forecast.normalizeSourceRows(invoiceItems);
assert(sources.some(row => row.id === 'poc'), 'POC rows must be available only when explicitly filtered');
forecast.state.filters.status = 'all';

const agreements = [{ id: 'uuid-1', agreement_id: 'AGR-1', agreement_number: 'AGR-1', client_id: 'C1' }, { id: 'uuid-3', agreement_id: 'AGR-3', agreement_number: 'AGR-3', client_id: 'C2' }];
const clients = [{ id: 'C1', client_name: 'Client One' }, { id: 'C2', client_name: 'Client Two' }, { id: 'C3', client_name: 'Client Three' }];
const rows = forecast.buildRows(forecast.normalizeSourceRows(invoiceItems), agreements, clients);
assert.strictEqual(rows.length, 4, 'the same invoice item must not be counted twice');
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
assert.strictEqual(forecast.summary.call({ ...forecast, filtered: () => rows }).value, 4680, 'expected renewal value must sum invoice SaaS rows');
assert(!frontend.includes('scheduled_due_date'), 'renewal forecast must not use payment schedule dates');
assert(!frontend.includes('normalizeSourceRows(agreementItems'), 'agreement_items must not be passed to source normalization');
assert(!frontend.includes('renewalAgreement') && !frontend.includes('renewalInvoice'), 'header rows must not mark invoice items renewed');
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
