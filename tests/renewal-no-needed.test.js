const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const frontend = fs.readFileSync('renewal-forecast.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const migration = fs.readFileSync('sql/migrations/20260610_renewal_no_needed_override.sql', 'utf8');
const context = { console, Blob: class {}, URL: {}, window: { Permissions: { canPerformAction: () => true, can: () => true } }, document: {}, U: { fmtNumber: value => String(value), fmtDate: value => value, escapeHtml: value => String(value), escapeAttr: value => String(value) }, UI: { toast() {} }, Permissions: { can: () => true, hasAdminOverride: () => false } };
vm.createContext(context);
vm.runInContext(frontend, context);
const forecast = context.window.RenewalForecast;
forecast.today = () => '2026-06-10';

const source = { id: 'i1', invoice_number: 'INV-1', client_name: 'Client One', location_name: 'Location A', service_start_date: '2025-06-01', service_end_date: '2026-06-01', renewal_status: 'overdue', expected_renewal_amount: 1200 };
const row = forecast.normalizeDetailRow(source, '2026-06-01');
const noNeeded = forecast.applyNoRenewalNeededOverride(row, [{ invoice_item_id: 'i1', reason: 'Location closed', note: 'Closed permanently' }]);
assert.strictEqual(noNeeded.renewal_status, 'no_renewal_needed');
assert.strictEqual(noNeeded.manual_no_renewal_needed, true);
assert(forecast.detailStatus(noNeeded).includes('Manual'));
assert(forecast.detailActions(row).includes('Mark as No Renewal Needed'));
assert(!forecast.detailActions(noNeeded).includes('Mark as No Renewal Needed'));
assert(forecast.detailActions(noNeeded).includes('Undo No Renewal Needed'));

forecast.state.filteredRows = [row, noNeeded];
const month = forecast.monthlyRows()[0];
assert.strictEqual(month.pending, 1, 'No Renewal Needed rows must not count as pending');
assert.strictEqual(month.overdue, 1, 'No Renewal Needed rows must not count as overdue');
assert.strictEqual(month.noRenewalNeeded, 1, 'No Renewal Needed rows must count separately');
assert.strictEqual(month.value, 1200, 'No Renewal Needed rows must not count toward expected renewal value');

assert(frontend.includes("rpc('crm_mark_renewal_no_needed'") && frontend.includes("rpc('crm_unmark_renewal_override'"));
assert(html.includes('Mark as No Renewal Needed') && html.includes('<option value="no_renewal_needed">No Renewal Needed</option>'));
assert(migration.includes('perform public.crm_require_renewal_admin()'));
assert(migration.includes('set active = false') && !migration.includes('delete from public.crm_renewal_no_needed_overrides'));
assert(!migration.includes('update public.invoice_items') && !migration.includes('update public.invoices') && !migration.includes('update public.agreements'));
console.log('Renewal No Renewal Needed checks passed.');
