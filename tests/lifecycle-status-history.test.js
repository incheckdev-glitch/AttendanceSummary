const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const analyticsSource = fs.readFileSync('lifecycle-analytics.js', 'utf8');
const apiSource = fs.readFileSync('api.js', 'utf8');
const dataSource = fs.readFileSync('supabase-data.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const context = {
  U: {
    escapeHtml: value => String(value),
    fmtTS: value => String(value),
    fmtDisplayDate: value => String(value),
    formatDateTimeMMDDYYYYHHMM: value => String(value),
    fmtNumber: value => String(value)
  },
  console
};
context.window = context;
vm.createContext(context);
vm.runInContext(`${analyticsSource}\nthis.lifecycle = LifecycleAnalytics;`, context);

const account = {
  leads: [{ id: 'lead-uuid', lead_id: 'LEAD-001', status: 'Qualified', created_at: '2026-01-01T00:00:00Z' }],
  invoices: [{ id: 'invoice-uuid', invoice_number: 'INV-001', payment_status: 'Paid', created_at: '2026-02-01T00:00:00Z' }],
  tickets: [{ id: 'ticket-uuid', ticket_id: 'TKT-001', status: 'Resolved', created_at: '2026-03-01T00:00:00Z' }]
};
const timeline = context.lifecycle.buildLifecycleTimeline(account);
assert.strictEqual(timeline.length, 3, 'timeline should include standard and additional lifecycle entities');
assert.strictEqual(timeline[0].entityType, 'lead');
assert.strictEqual(timeline[1].currentStatus, 'Paid');
assert.strictEqual(timeline[2].entityType, 'ticket');
assert.match(context.lifecycle.renderLifecycleTimeline(account), /data-lifecycle-history/);
assert.match(context.lifecycle.renderLifecycleTimeline(account), /View History/);

assert.match(apiSource, /getLifecycleStatusHistory/);
assert.match(dataSource, /add_lifecycle_status_log/);
assert.match(dataSource, /get_lifecycle_status_history/);
assert.match(dataSource, /oldStatus\.toLowerCase\(\) === newStatus\.toLowerCase\(\)/);
assert.match(html, /id="lifecycleStatusHistoryModal"/);

console.log('Lifecycle status history checks passed.');
