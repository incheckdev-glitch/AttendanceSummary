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
  leads: [{ id: 'lead-uuid', lead_id: 'LEAD-001', status: 'Qualified', note: '  Initial lead note  ', created_at: '2026-01-01T00:00:00Z' }],
  invoices: [{ id: 'invoice-uuid', invoice_number: 'INV-001', payment_status: 'Paid', created_at: '2026-02-01T00:00:00Z' }],
  tickets: [{ id: 'ticket-uuid', ticket_id: 'TKT-001', status: 'Resolved', created_at: '2026-03-01T00:00:00Z' }],
  lifecycleStatusLogs: [
    { entity_type: 'invoice', entity_id: 'invoice-uuid', status_note: 'Older invoice note', created_at: '2026-02-02T00:00:00Z' },
    { entity_type: 'invoice', entity_id: 'invoice-uuid', completion_note: '  Latest invoice note  ', created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-03T00:00:00Z' },
    { entity_type: 'invoice', entity_id: 'invoice-uuid', comment: '   ', status_changed_at: '2026-02-04T00:00:00Z' },
    { entity_type: 'ticket', entity_id: 'ticket-uuid', comment: '   ', created_at: '2026-03-02T00:00:00Z' }
  ]
};
const timeline = context.lifecycle.buildLifecycleTimeline(account);
assert.strictEqual(timeline.length, 3, 'timeline should include standard and additional lifecycle entities');
assert.strictEqual(timeline[0].entityType, 'lead');
assert.strictEqual(timeline[1].currentStatus, 'Paid');
assert.strictEqual(timeline[2].entityType, 'ticket');
assert.strictEqual(timeline[0].latestNote, 'Initial lead note', 'source notes should be trimmed');
assert.strictEqual(timeline[1].latestNote, 'Latest invoice note', 'latest related log should be selected using all supported timestamps');
assert.strictEqual(timeline[2].latestNote, 'No note', 'empty notes should use the safe fallback');
assert.strictEqual(context.lifecycle.getRelatedNote({ remarks: '  Remark note  ' }), 'Remark note');
assert.strictEqual(context.lifecycle.getRelatedNote({ description: null }), 'No note');
assert.strictEqual(context.lifecycle.extractLifecycleNote({ metadata: { comment: '  Nested comment  ' } }), 'Nested comment');
assert.strictEqual(context.lifecycle.extractLifecycleNote({ payload: '{"details":{"internal_note":" JSON note "}}' }), 'JSON note');
assert.strictEqual(context.lifecycle.extractLifecycleNote({ note: 'null', details: { notes: '[]' }, data: { action_note: '  Real fallback  ' } }), 'Real fallback');
assert.strictEqual(context.lifecycle.extractLifecycleNote({ note: '{}', comments: 'undefined', metadata: '{}' }), '');
const normalizedHistory = context.lifecycle.normalizeLifecycleHistoryRecord({ id: 'log-1', metadata: { note: 'Preserved note' } });
assert.strictEqual(normalizedHistory.note, 'Preserved note');
assert.strictEqual(normalizedHistory.raw.metadata.note, 'Preserved note', 'normalization should preserve the full raw log');
const moduleHistoryNote = context.lifecycle.getLatestLifecycleNote({ proposalLogs: [{ proposal_id: 'proposal-1', payload: '{"note":"Module note"}', changed_at: '2026-01-01' }] }, { id: 'proposal-1' }, 'proposal', 'proposal-1');
assert.strictEqual(moduleHistoryNote, 'Module note', 'module-specific history arrays should be inspected');
const timelineHtml = context.lifecycle.renderLifecycleTimeline(account);
assert.match(timelineHtml, /data-lifecycle-history/);
assert.match(timelineHtml, /View History/);
assert.match(timelineHtml, /Latest Note:<\/strong> Latest invoice note/);
assert.match(timelineHtml, /Latest Note:<\/strong> No note/);

assert.match(apiSource, /getLifecycleStatusHistory/);
assert.match(apiSource, /typeof entityType === 'object'/, 'history API should accept the entity payload form');
assert.match(dataSource, /add_lifecycle_status_log/);
assert.match(dataSource, /get_lifecycle_status_history/);
assert.match(dataSource, /oldStatus\.toLowerCase\(\) === newStatus\.toLowerCase\(\)/);
assert.match(dataSource, /return bTime - aTime/, 'history response should be sorted newest first');
assert.match(analyticsSource, /\.sort\(\(a, b\).*getLatestRelatedRecordTimestamp/s, 'drawer should sort the full returned array by supported timestamps');
assert.match(analyticsSource, /logs\.map\(log => this\.normalizeLifecycleHistoryRecord\(log\)\)/, 'drawer should normalize every returned log without dropping the raw record');
assert.match(analyticsSource, /<strong>Note:<\/strong> \$\{this\.escape\(note\)\}/, 'every history row should render a note');
assert.match(analyticsSource, /select\(columns \|\| '\*'\)/, 'analytics queries should preserve complete logs and JSON note fields');
assert.match(analyticsSource, /if \(!note && this\.isDevelopmentMode\(\)\)/, 'missing-note diagnostics should only run in development');
assert.doesNotMatch(analyticsSource, /data\[0\]|limit\(1\)/, 'drawer must not render only one history row');
assert.match(analyticsSource, /Future status changes will appear here/);
assert.match(html, /id="lifecycleStatusHistoryModal"/);

const sql = fs.readFileSync('LIFECYCLE_STATUS_HISTORY_FUTURE_LOGGING.sql', 'utf8');
assert.match(sql, /create or replace function public\.get_lifecycle_status_history/);
assert.match(sql, /order by l\.changed_at desc/);
assert.match(sql, /create or replace function public\.log_lifecycle_status_change/);
assert.match(sql, /payment_forecast_followups/);
assert.match(sql, /biners_payment_schedules/);

console.log('Lifecycle status history checks passed.');
