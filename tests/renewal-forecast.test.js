const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const frontend = fs.readFileSync('renewal-forecast.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');
const permissions = fs.readFileSync('permissions.js', 'utf8');
const context = { console, Blob: class {}, URL: {}, window: {}, document: {}, U: { fmtNumber: value => String(value), fmtDate: value => value, escapeHtml: value => String(value), escapeAttr: value => String(value) }, UI: { toast() {} } };
vm.createContext(context);
vm.runInContext(frontend, context);
const forecast = context.window.RenewalForecast;
forecast.today = () => '2026-06-10';

const primary = [
  { id: 'a1', agreement_id: 'AGR-1', section: 'Annual SaaS', item_name: 'InCheck Location A', location_name: 'Location A', service_start_date: '2025-06-30', service_end_date: '2026-06-30', unit_price: 1200, discount_percent: 10 },
  { id: 'setup', agreement_id: 'AGR-1', section: 'Annual SaaS account setup fee', service_end_date: '2026-06-30', unit_price: 500 },
  { id: 'poc', agreement_id: 'AGR-2', section: 'Annual SaaS POC', service_end_date: '2026-07-01', unit_price: 100 }
];
const fallback = [
  { id: 'i1', agreement_id: 'AGR-1', section: 'Annual SaaS', location_name: 'Location A', service_end_date: '2026-06-30', invoice_date: '2025-01-01' },
  { id: 'i2', agreement_id: 'AGR-3', category: 'Subscription licence', location_name: 'Location B', service_start_date: '2025-08-01', billing_end_date: '2026-08-01', due_date: '2025-01-01', unit_price: 2400 }
];
let sources = forecast.normalizeSourceRows(primary, fallback);
assert.deepStrictEqual(JSON.parse(JSON.stringify(sources.map(row => row.id))), ['a1', 'i2'], 'agreement_items must be primary and invoice_items only fallback');
forecast.state.filters.status = 'poc';
sources = forecast.normalizeSourceRows(primary, fallback);
assert(sources.some(row => row.id === 'poc'), 'POC rows must be available only when explicitly filtered');
forecast.state.filters.status = 'all';

const agreements = [{ id: 'uuid-1', agreement_id: 'AGR-1', agreement_number: 'AGR-1', client_id: 'C1', status: 'active' }, { id: 'uuid-3', agreement_id: 'AGR-3', agreement_number: 'AGR-3', client_id: 'C2', status: 'active' }];
const clients = [{ id: 'C1', client_name: 'Client One' }, { id: 'C2', client_name: 'Client Two' }];
const rows = forecast.buildRows(forecast.normalizeSourceRows(primary, fallback), agreements, clients, [], fallback);
const first = rows.find(row => row.opportunity_id === 'agreement_items:a1');
const second = rows.find(row => row.opportunity_id === 'invoice_items:i2');
assert.strictEqual(first.expected_renewal_amount, 1080, 'expected renewal formula must use unit price, 12 months, and discount');
assert.strictEqual(first.renewal_status, 'due_soon');
assert.strictEqual(second.service_end_date, '2026-08-01', 'billing_end_date is an allowed service end fallback');
assert.strictEqual(second.renewal_status, 'upcoming', 'invoice due date must not drive renewal status');
assert(!frontend.includes('scheduled_due_date'), 'renewal forecast must not use payment schedule dates');
['Renewals This Month','Upcoming 30 Days','Upcoming 90 Days','Expected Renewal Value','Overdue Renewals','Number of Locations / SaaS Rows','Create Renewal Invoice'].forEach(label => assert(frontend.includes(label) || html.includes(label), `missing ${label}`));
assert(html.includes('id="renewalForecastView"') && html.includes('renewal-forecast.js'));
assert(app.includes("view === 'renewalForecast'") && permissions.includes('renewalForecast'));
console.log('Monthly Renewal Forecast checks passed.');
