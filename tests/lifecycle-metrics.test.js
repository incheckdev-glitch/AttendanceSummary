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

const overview = analytics.getLifecycleMetrics({
  companies: [
    { id: 'company-1', company_name: 'Acme LLC' },
    { id: 'company-2', company_name: 'Other Inc' }
  ],
  leads: [], deals: [], clients: [], contacts: [], paymentSchedule: [],
  proposals: [
    { id: 'proposal-1', company_id: 'company-1', status: ' ACCEPTED ', created_at: at(1) },
    { id: 'proposal-2', company_id: 'company-2', status: 'draft', created_at: at(2) }
  ],
  agreements: [
    { id: 'agreement-1', company_id: 'company-1', status: 'SIGNED', signed_at: at(3) },
    { id: 'agreement-2', company_id: 'company-1', status: 'signed', signed_at: at(4) },
    { id: 'agreement-3', company_id: 'company-2', status: 'active', created_at: at(5) },
    { id: 'agreement-4', company_id: 'company-2', status: 'signed', signed_at: at(5) }
  ],
  agreementItems: [
    { id: 'agreement-item-1', agreement_id: 'agreement-1', category: 'Annual SaaS License' },
    { id: 'agreement-item-2', agreement_id: 'agreement-1', product_name: 'InCheck Annual Subscription' },
    { id: 'agreement-item-3', agreement_id: 'agreement-2', description: 'Implementation and account setup' },
    { id: 'agreement-item-4', agreement_id: 'agreement-2', description: 'POC Annual SaaS' }
  ],
  invoices: [
    { id: 'invoice-1', agreement_id: 'agreement-1', company_id: 'company-1', status: 'Issued', invoice_date: at(6), grand_total: 1000, balance_due: 9999 },
    { id: 'invoice-2', agreement_id: 'agreement-2', company_id: 'company-1', invoice_status: 'ISSUED', invoice_date: at(7) },
    { id: 'invoice-3', company_id: 'company-2', status: 'draft', invoice_date: at(8), grand_total: 500 },
    { id: 'invoice-1', company_id: 'company-1', status: 'Issued', invoice_date: at(6), grand_total: 1000 }
  ],
  invoiceItems: [
    { id: 'invoice-item-1', invoice_id: 'invoice-1', agreement_id: 'agreement-1', description: 'Annual SaaS License', total: 1000 },
    { id: 'invoice-item-2', invoice_id: 'invoice-1', description: 'duplicate non-header item', total: 200 },
    { id: 'invoice-item-3', invoice_id: 'invoice-2', description: 'Consulting', quantity: 2, unit_price: 100 }
  ],
  receipts: [
    { id: 'receipt-1', invoice_id: 'invoice-1', company_id: 'company-1', payment_amount: 400, status: 'created', receipt_date: at(9) }
  ],
  creditNotes: [
    { id: 'credit-1', invoice_id: 'invoice-1', credit_amount: 100, status: 'issued', credit_note_date: at(10) }
  ],
  onboarding: [
    { id: 'onboarding-1', company_id: 'company-1', status: 'Completed', created_at: at(11) },
    { id: 'onboarding-2', company_id: 'company-1', status: 'in_progress', created_at: at(12) }
  ],
  technical: [
    { id: 'tech-1', company_id: 'company-1', request_status: 'completed', created_at: at(13) }
  ]
});
assert.strictEqual(overview.totalClients, 2, 'same company_id across records is counted once');
assert.strictEqual(overview.signedAgreements, 3, 'only exact normalized signed statuses count, including signed agreements without invoices');
assert.strictEqual(overview.totalLocations, 2, 'annual SaaS agreement rows count as locations while one-time and POC rows are excluded');
assert.strictEqual(overview.issuedInvoices, 2, 'only exact normalized issued invoices count and duplicate invoice records are removed');
assert.strictEqual(overview.totalInvoiced, 1200, 'valid invoice header wins and missing header falls back to invoice items without duplication');
assert.strictEqual(overview.totalPaid, 400, 'paid amount comes from partial receipts');
assert.strictEqual(overview.totalCredited, 100, 'credited amount comes from credit notes');
assert.strictEqual(overview.totalDue, 700, 'outstanding ignores stale balance_due and subtracts receipts and credits');
assert.strictEqual(overview.creditableInvoices, 2);
assert.strictEqual(overview.operationsOnboardingCreated, 2);
assert.strictEqual(overview.operationsCompleted, 1);
assert.strictEqual(overview.technicalRequestCompleted, 1);

const dateFiltered = analytics.getLifecycleMetrics({
  companies: [], leads: [], deals: [], agreementItems: [], invoiceItems: [], paymentSchedule: [], onboarding: [], technical: [],
  proposals: [{ id: 'p1', status: 'accepted', created_at: at(1) }, { id: 'p2', status: 'accepted', created_at: at(20) }],
  agreements: [], invoices: [], receipts: [], creditNotes: []
}, { dateFrom: '2026-01-10', dateTo: '2026-01-31' });
assert.strictEqual(dateFiltered.proposalCreated, 1, 'date filters are applied at the source-record level');
assert.strictEqual(dateFiltered.proposalAccepted, 1);

console.log('Lifecycle overview source-of-truth checks passed.');
