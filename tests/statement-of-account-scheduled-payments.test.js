const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const api = fs.readFileSync('api.js', 'utf8');
const clients = fs.readFileSync('clients.js', 'utf8');

const apiStart = api.indexOf('async getClientStatementOfAccount(clientOrId = {}, options = {})');
const apiEnd = api.indexOf('async getClientOnboarding', apiStart);
const statementApi = api.slice(apiStart, apiEnd);

assert(apiStart >= 0 && apiEnd > apiStart, 'Statement of Account API method must exist.');
assert.match(statementApi, /fetchLinkedRowsByColumns_\('invoice_payment_schedule'/, 'Statement must load saved invoice payment schedule rows.');
assert.doesNotMatch(statementApi, /client_scheduled_payments/, 'Statement must never replace saved schedule rows with a calculated legacy view.');
assert.match(statementApi, /const scheduledAmount = toStatementAmount\(schedule\.scheduled_amount\)/, 'Scheduled amount must come only from the installment row.');
assert.match(statementApi, /const paidAmount = [^;]*schedule\.paid_amount/, 'Paid amount must come only from the installment allocation.');
assert.match(statementApi, /const balanceDue = Math\.max\(scheduledAmount - paidAmount, 0\)/, 'Remaining amount must be derived per installment.');
assert.doesNotMatch(statementApi, /schedule\.(?:amount_paid|received_amount|pending_amount)/, 'Invoice/view total aliases must not calculate installment values.');

const context = {
  window: {},
  console,
  fetch: async () => { throw new Error('Unexpected network request in statement schedule test.'); },
  URL,
  URLSearchParams,
  Headers,
  setTimeout,
  clearTimeout,
  structuredClone: global.structuredClone
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(api, context, { filename: 'api.js' });

const Api = context.window.Api;
Api.getClientOverview = async () => ({
  invoices: {
    rows: [{
      id: '11111111-1111-4111-8111-111111111111',
      invoice_number: 'SA/2026/41',
      invoice_date: '2026-05-12',
      due_date: '2026-05-12',
      grand_total: 926,
      balance_due: 463,
      amount_paid: 100,
      payment_term: 'Semi-Annual',
      currency: 'USD',
      status: 'issued'
    }]
  },
  receipts: { rows: [] },
  creditNotes: { rows: [] }
});
Api.fetchLinkedRowsByColumns_ = async () => ([
  {
    id: 'schedule-1',
    invoice_id: '11111111-1111-4111-8111-111111111111',
    schedule_no: 1,
    due_date: '2026-05-12',
    scheduled_amount: 563,
    paid_amount: 563,
    amount_paid: 100,
    balance_due: 0,
    status: 'paid'
  },
  {
    id: 'schedule-2',
    invoice_id: '11111111-1111-4111-8111-111111111111',
    schedule_no: 2,
    due_date: '2026-11-12',
    scheduled_amount: 363,
    paid_amount: 0,
    balance_due: 463,
    amount_paid: 100,
    status: 'scheduled'
  }
]);

(async () => {
  const result = await Api.getClientStatementOfAccount({ client_id: 'Client#00001' }, { page: 1, pageSize: 25 });
  const schedules = result.paymentSchedules.rows;
  assert.strictEqual(schedules.length, 2, 'Statement must include every invoice installment.');
  assert.strictEqual(schedules[1].invoice_number, 'SA/2026/41', 'Second installment must remain linked to its invoice.');
  assert.strictEqual(schedules[1].due_date, '2026-11-12', 'Second payment must use its saved due date.');
  assert.strictEqual(schedules[0].scheduled_amount, 563, 'First installment must preserve its saved scheduled amount.');
  assert.strictEqual(schedules[0].balance_due, 0, 'Paid first installment must have no remaining amount.');
  assert.strictEqual(schedules[1].scheduled_amount, 363, 'Second installment must preserve its saved scheduled amount.');
  assert.strictEqual(schedules[1].paid_amount, 0, 'Invoice-level amount_paid must not leak into an installment.');
  assert.strictEqual(schedules[1].balance_due, 363, 'Remaining must be scheduled minus installment-paid amount, not saved invoice balance.');
  assert.strictEqual(schedules[1].status, 'Upcoming', 'A future unpaid installment must be upcoming.');
  assert.strictEqual(schedules[1].payment_term, 'Semi-Annual', 'Every installment must expose its payment term.');
  assert.strictEqual(result.statementRows.length, 1, 'Account activity must continue to contain invoices/receipts only.');
  assert.strictEqual(result.statementRows[0].running_balance, 926, 'Installments must not affect the Statement of Account running balance.');
  console.log('Statement of Account scheduled-payment checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
