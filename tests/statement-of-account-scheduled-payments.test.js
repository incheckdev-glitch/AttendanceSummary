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
assert.match(statementApi, /fetchPaged\([\s\S]*'client_scheduled_payments'/, 'Statement must retain the scheduled-payments view as a legacy fallback.');
assert.match(statementApi, /type: 'Scheduled Payment'/, 'Each installment must be emitted as a Scheduled Payment statement row.');
assert.match(statementApi, /document_no: `\$\{invoiceNumber\} · Payment \$\{scheduleNo\}/, 'Scheduled rows must remain visibly grouped under their SA invoice number.');
assert.match(statementApi, /debit: scheduledAmount/, 'Scheduled rows must display the installment amount.');
assert.match(statementApi, /due_date: dueDate/, 'Scheduled rows must display the installment due date.');
assert.match(statementApi, /affects_balance: false/, 'Scheduled rows must not duplicate the invoice in accounting balances.');
assert.match(statementApi, /if \(row\.affects_balance !== false\) running \+=/, 'API running balance must ignore informational schedule rows.');
assert.match(clients, /if \(row\.affects_balance !== false\) running \+= debit - credit;/, 'Client fallback running balance must ignore informational schedule rows.');
assert.match(clients, /const accountingRows = rows\.filter\(item => item\.affects_balance !== false\);/, 'Statement totals must exclude informational schedule rows.');
assert.match(clients, /row\.affects_balance === false \? '—'/, 'Schedule rows must not display a misleading running balance.');
assert.match(clients, /buildClientStatementRows\(client, paymentSchedules = \[\]\)/, 'Fallback statement builder must accept payment schedules.');

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
      grand_total: 726,
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
    scheduled_amount: 363,
    paid_amount: 363,
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
    balance_due: 363,
    status: 'scheduled'
  }
]);

(async () => {
  const result = await Api.getClientStatementOfAccount({ client_id: 'Client#00001' }, { page: 1, pageSize: 25 });
  const schedules = result.statementRows.filter(row => row.type === 'Scheduled Payment');
  assert.strictEqual(schedules.length, 2, 'Statement must include every invoice installment.');
  assert.strictEqual(schedules[1].document_no, 'SA/2026/41 · Payment 2 of 2', 'Second payment must remain grouped under its SA invoice.');
  assert.strictEqual(schedules[1].due_date, '2026-11-12', 'Second payment must use its saved due date.');
  assert.strictEqual(schedules[1].debit, 363, 'Second payment must show its scheduled amount.');
  assert.strictEqual(schedules[1].affects_balance, false, 'Scheduled payment must be informational only.');
  assert.strictEqual(schedules[1].running_balance, 726, 'Scheduled payment must not duplicate the invoice balance.');
  console.log('Statement of Account scheduled-payment checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
