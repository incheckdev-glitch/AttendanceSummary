const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const invoices = fs.readFileSync('invoices.js', 'utf8');
const supabaseData = fs.readFileSync('supabase-data.js', 'utf8');
const migration = fs.readFileSync('sql/migrations/20260609_invoice_payment_schedule_due_date_anchor.sql', 'utf8');

const backendBuilder = supabaseData.slice(
  supabaseData.indexOf('function buildInvoicePaymentScheduleRows'),
  supabaseData.indexOf('async function listInvoicePaymentScheduleRows')
);
assert.match(backendBuilder, /const firstDueDate = String\([\s\S]*invoice\.due_date/, 'backend schedule must anchor on invoice due_date');
assert.match(backendBuilder, /index === 0 \? firstDueDate : addMonthsToDateString\(firstDueDate, plan\.intervalMonths \* index\)/, 'backend must add only installment months after the first due date');
assert.doesNotMatch(backendBuilder, /addDaysToDateString/, 'backend schedule must not add Net days');

const backendHelpers = supabaseData.slice(
  supabaseData.indexOf('function todayDateString'),
  supabaseData.indexOf('async function listInvoicePaymentScheduleRows')
);
const context = {};
vm.runInNewContext(`${backendHelpers}
this.buildSchedule = buildInvoicePaymentScheduleRows;`, context);
const scheduleDates = paymentTerm => Array.from(context.buildSchedule({
  id: 'invoice-uuid',
  due_date: '2026-06-01',
  payment_term: paymentTerm,
  invoice_total: 1200
}), row => row.due_date);
assert.deepStrictEqual(scheduleDates('Net 21'), ['2026-06-01', '2026-12-01']);
assert.deepStrictEqual(scheduleDates('Net 30'), ['2026-06-01']);
assert.deepStrictEqual(scheduleDates('Net 14'), ['2026-06-01', '2026-09-01', '2026-12-01', '2027-03-01']);
assert.strictEqual(scheduleDates('Net 7').length, 12);

assert.match(supabaseData, /automaticInvoiceScheduleMatchesInvoice\(existing, invoice\)/, 'create, renewal, and issue paths must reject stale automatic schedules');
assert.match(supabaseData, /index === 0 && invoiceDueDate \? invoiceDueDate/, 'manual schedule saves must also anchor their first row');
assert.match(supabaseData, /createInvoicePaymentScheduleRows\(client, id, true\)/, 'automatic recalculation must force a schedule rebuild');

const frontendConfig = invoices.slice(
  invoices.indexOf('getInvoicePaymentScheduleConfig'),
  invoices.indexOf('parseDateOnly')
);
assert.match(frontendConfig, /net 7[\s\S]*intervalMonths: 1, count: 12/, 'Net 7 must create 12 monthly installments');
assert.match(frontendConfig, /net 14[\s\S]*intervalMonths: 3, count: 4/, 'Net 14 must create 4 quarterly installments');
assert.match(frontendConfig, /net 21[\s\S]*intervalMonths: 6, count: 2/, 'Net 21 must create 2 semiannual installments');
assert.match(frontendConfig, /return \{ intervalMonths: 12, count: 1 \}/, 'Net 30 must create 1 annual installment');

const rebuildHelper = invoices.slice(
  invoices.indexOf('rebuildInvoicePaymentScheduleWithPayments'),
  invoices.indexOf('shouldCalculateInvoiceSchedule')
);
assert.match(rebuildHelper, /const rebuiltRows = this\.buildInvoicePaymentSchedule/, 'recalculation helper must regenerate dates from the invoice due date');
assert.doesNotMatch(rebuildHelper, /if \(savedRows\.length\) return savedRows/, 'recalculation helper must not preserve stale schedule dates');

assert.match(migration, /new\.schedule_no = 1[\s\S]*select i\.due_date[\s\S]*into new\.due_date/, 'database trigger must enforce the first-row due-date invariant');
assert.match(migration, /schedule\.schedule_no = 1[\s\S]*schedule\.due_date is distinct from invoice\.due_date/, 'migration must repair existing first installments');

console.log('invoice payment schedule due-date anchor checks passed');
