const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('lifecycle-analytics.js', 'utf8');
const context = {
  U: {
    escapeHtml: String, fmtTS: String, fmtDisplayDate: String,
    formatDateTimeMMDDYYYYHHMM: String, fmtNumber: String
  },
  console: { log() {}, info() {}, warn() {}, error() {} }
};
context.window = context;
vm.createContext(context);
vm.runInContext(`${source}\nthis.lifecycle = LifecycleAnalytics;`, context);
const analytics = context.lifecycle;
const at = day => `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`;

const metrics = analytics.calculateLifecycleMetrics({
  leads: [{ id: 'lead-1', created_at: at(1), updated_at: at(3), status: 'Qualified' }],
  deals: [{ id: 'deal-1', lead_id: 'lead-1', created_at: at(3), updated_at: at(5) }],
  proposals: [{ id: 'proposal-1', deal_id: 'deal-1', created_at: at(5), updated_at: at(8), status: 'Accepted', subtotal_locations: 1000, total_discount: 100 }],
  proposalItems: [{ proposal_id: 'proposal-1', total: 1000, discount_percent: 10 }],
  agreementItems: [], invoiceItems: [],
  agreements: [{ id: 'agreement-1', proposal_id: 'proposal-1', created_at: at(8), signed_at: at(10), updated_at: at(10) }],
  invoices: [{ id: 'invoice-1', agreement_id: 'agreement-1', issued_at: at(12), updated_at: at(15), payment_status: 'Paid', paid_at: at(15) }],
  receipts: [{ id: 'receipt-1', invoice_id: 'invoice-1', created_at: at(15), updated_at: at(15) }],
  creditNotes: [], onboarding: [], workflowApprovals: [{ record_id: 'proposal-1', created_at: at(6), status: 'approved', approved_at: at(7) }],
  lifecycleStatusLogs: [
    { entity_type: 'proposal', entity_id: 'proposal-1', status_field: 'status', old_status: null, new_status: 'Draft', notes: 'Initial snapshot', changed_at: at(5) },
    { entity_type: 'proposal', entity_id: 'proposal-1', status_field: 'status', old_status: 'Draft', new_status: 'Accepted', changed_at: at(8) },
    { entity_type: 'proposal', entity_id: 'proposal-1', status_field: 'status', old_status: 'Draft', new_status: 'Accepted', changed_at: at(8) },
    { entity_type: 'invoice', entity_id: 'invoice-1', status_field: 'payment_status', old_status: 'Unpaid', new_status: 'Paid', changed_at: at(15) }
  ]
}, new Date(at(20)));

assert.strictEqual(metrics.daysInLead, 2);
assert.strictEqual(metrics.daysInDeal, 2);
assert.strictEqual(metrics.daysInProposal, 3);
assert.strictEqual(metrics.daysInAgreement, 2);
assert.strictEqual(metrics.daysInInvoice, 3);
assert.strictEqual(metrics.totalCycleDuration, 14);
assert.strictEqual(metrics.numberOfStageChanges, 2, 'initial snapshots and duplicate same-second transitions are excluded');
assert.strictEqual(metrics.approvalDelay, 1);
assert.strictEqual(metrics.lastActivityAge, 5);
assert.strictEqual(metrics.averageDiscount, 10);
assert.strictEqual(metrics.stuckStage, 'None');
assert.strictEqual(metrics.bottleneckWarning, '');

const missing = analytics.calculateLifecycleMetrics({ leads: [], deals: [], proposals: [], agreements: [], invoices: [], receipts: [], creditNotes: [], onboarding: [], lifecycleStatusLogs: [], workflowApprovals: [], proposalItems: [], agreementItems: [], invoiceItems: [] }, new Date(at(20)));
assert.strictEqual(missing.daysInLead, null);
assert.strictEqual(missing.daysInAgreement, null);
assert.strictEqual(missing.totalCycleDuration, null);
const snapshotOnly = analytics.calculateLifecycleMetrics({ leads: [{ created_at: at(1) }], deals: [], proposals: [], agreements: [], invoices: [], receipts: [], creditNotes: [], onboarding: [], workflowApprovals: [], proposalItems: [], agreementItems: [], invoiceItems: [], lifecycleStatusLogs: [{ entity_type: 'lead', old_status: null, new_status: 'New', notes: 'Initial snapshot', changed_at: at(1) }] }, new Date(at(20)));
assert.strictEqual(snapshotOnly.numberOfStageChanges, 0, 'initial-snapshot-only history is not replaced with invented transitions');
assert.strictEqual(snapshotOnly.stageChangesEstimated, false);

assert.strictEqual(analytics.formatDays(null), '—');
assert.strictEqual(analytics.formatDays(0), '0.00 days');

console.log('Lifecycle metrics checks passed.');
