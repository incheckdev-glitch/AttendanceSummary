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
  proposalItems: [{ proposal_id: 'proposal-1', description: 'Annual SaaS subscription', unit_price: 1000, months: 12, discount_percent: 10 }],
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


const emptyContext = overrides => ({
  leads: [], deals: [], proposals: [], agreements: [], invoices: [], receipts: [], creditNotes: [], onboarding: [],
  lifecycleStatusLogs: [], activityLogs: [], auditLogs: [], statusHistory: [], workflowApprovals: [], proposalItems: [], agreementItems: [], invoiceItems: [],
  ...overrides
});

const minutesLater = analytics.calculateLifecycleMetrics(emptyContext({
  leads: [{ id: 'lead-minutes', created_at: '2026-01-01T00:00:00Z', status: 'converted' }],
  deals: [{ id: 'deal-minutes', created_at: '2026-01-01T00:30:00Z', status: 'open' }],
  proposals: [{ id: 'proposal-same-day', created_at: '2026-01-01T06:30:00Z', status: 'draft' }]
}), new Date(at(2)));
assert.strictEqual(minutesLater.daysInLead, 0.02, 'lead duration preserves minute-level accuracy rounded to two decimals');
assert.strictEqual(minutesLater.daysInDeal, 0.25, 'deal duration preserves same-day decimal accuracy');

const proposalAgreement = analytics.calculateLifecycleMetrics(emptyContext({
  proposals: [{ id: 'proposal-accepted', created_at: at(1), status: 'accepted', accepted_at: at(3) }],
  agreements: [{ id: 'agreement-sent', created_at: at(4), status: 'Sent' }]
}), new Date(at(8)));
assert.strictEqual(proposalAgreement.daysInProposal, 2, 'proposal acceptance is used before later agreement creation');
assert.strictEqual(proposalAgreement.daysInAgreement, 4, 'sent agreement remains active through the injected current time');
const sentTimeline = analytics.buildLifecycleTimeline({ agreements: [{ id: 'agreement-sent', created_at: at(4), status: 'Sent' }] });
assert.strictEqual(sentTimeline[0].title, 'Agreement sent');
const signedTimeline = analytics.buildLifecycleTimeline({ agreements: [{ id: 'agreement-signed', created_at: at(4), status: 'Sent', customer_sign_date: at(5) }] });
assert.strictEqual(signedTimeline[0].title, 'Agreement signed');

const parsedDisplayedDate = analytics.parseLifecycleDate('08/06/2026 13:01');
assert.strictEqual(parsedDisplayedDate.getFullYear(), 2026, 'displayed lifecycle dates preserve their year');
assert.strictEqual(parsedDisplayedDate.getMonth(), 5, 'DD/MM/YYYY lifecycle dates parse June as month 6');
assert.strictEqual(parsedDisplayedDate.getDate(), 8, 'DD/MM/YYYY lifecycle dates parse the first component as the day');
assert.strictEqual(analytics.parseLifecycleDate('31/02/2026 13:01'), null, 'invalid displayed lifecycle dates are rejected');

const originalGetLifecycleNow = analytics.getLifecycleNow;
analytics.getLifecycleNow = () => analytics.parseLifecycleDate('10/06/2026 12:44');
const activeAgreement = analytics.calculateLifecycleMetrics(emptyContext({
  agreements: [{ id: 'agreement-active', sent_at: '08/06/2026 13:01', updated_at: '09/06/2026 03:01', status: 'Sent' }]
}));
analytics.getLifecycleNow = originalGetLifecycleNow;
assert.strictEqual(activeAgreement.daysInAgreement, 1.99, 'active agreement duration uses injectable current time minus sent_at');
assert.strictEqual(activeAgreement.totalCycleDuration, 1.99, 'total cycle duration includes the active agreement through current time');
assert.strictEqual(activeAgreement.stuckStage, 'None', 'an agreement below the default 30-day threshold is not stuck');
assert.strictEqual(activeAgreement.bottleneckWarning, '', 'an agreement below the default 30-day threshold has no bottleneck warning');

const agreementFromSentLog = analytics.calculateLifecycleMetrics(emptyContext({
  agreements: [{ id: 'agreement-log-start', created_at: '2026-06-01T00:00:00Z', status: 'Sent' }],
  lifecycleStatusLogs: [{ entity_type: 'agreement', entity_id: 'agreement-log-start', new_status: 'Sent', changed_at: '2026-06-08T13:01:00Z' }]
}), new Date('2026-06-10T12:44:00Z'));
assert.strictEqual(agreementFromSentLog.daysInAgreement, 1.99, 'agreement sent status log takes precedence over an earlier creation date');

const staleSentSignedAgreement = analytics.calculateLifecycleMetrics(emptyContext({
  agreements: [{ id: 'agreement-signed-stale-status', sent_at: at(1), signed_at: at(3), status: 'Sent' }]
}), new Date(at(40)));
assert.strictEqual(staleSentSignedAgreement.daysInAgreement, 2, 'a valid signed date closes an agreement even if its stored status is stale');
assert.strictEqual(staleSentSignedAgreement.stuckStage, 'None', 'a signed agreement with a stale Sent status is not treated as stuck');

const invoiceUnpaid = analytics.calculateLifecycleMetrics(emptyContext({ invoices: [{ id: 'invoice-unpaid', invoice_date: at(1), updated_at: at(4), payment_status: 'Unpaid' }] }), new Date(at(10)));
assert.strictEqual(invoiceUnpaid.daysInInvoice, 9, 'unpaid invoice duration uses the injected current time rather than updated_at');
const invoiceReceipt = analytics.calculateLifecycleMetrics(emptyContext({
  invoices: [{ id: 'invoice-paid', invoice_date: at(1), payment_status: 'Partially Paid' }],
  receipts: [{ id: 'receipt-partial', invoice_id: 'invoice-paid', receipt_date: at(3) }, { id: 'receipt-later', invoice_id: 'invoice-paid', receipt_date: at(5) }],
  creditNotes: [{ id: 'credit-note', invoice_id: 'invoice-paid', credit_note_date: at(7) }]
}), new Date(at(10)));
assert.strictEqual(invoiceReceipt.daysInInvoice, 2, 'invoice duration ends at the first receipt');
assert.strictEqual(invoiceReceipt.totalCycleDuration, 6, 'credit note activity extends total cycle without extending invoice-to-first-receipt duration');
assert.strictEqual(analytics.calculateLifecycleMetrics(emptyContext({
  invoices: [{ id: 'invoice-first', invoice_date: at(1), payment_status: 'Paid' }, { id: 'invoice-second', invoice_date: at(4), payment_status: 'Paid' }],
  receipts: [{ id: 'receipt-first', invoice_id: 'invoice-first', receipt_date: at(2) }, { id: 'receipt-second', invoice_id: 'invoice-second', receipt_date: at(6) }]
})).daysInInvoice, 1, 'multiple invoices use the earliest issue and first related lifecycle receipt');

const weightedDiscount = analytics.calculateLifecycleMetrics(emptyContext({
  agreementItems: [
    { id: 'annual-100', description: 'Annual SaaS license', unit_price: 100, months: 12, discount_percent: 100 },
    { id: 'annual-9', name: 'InCheck subscription', unit_price: 900, months: 12, discount_percent: 9.09 },
    { id: 'annual-15', category: 'Annual licence', unit_price: 1000, months: 12, discount_percent: 15 },
    { id: 'setup-50', description: 'One-time account setup implementation', unit_price: 10000, months: 12, discount_percent: 50 }
  ],
  invoiceItems: [{ description: 'Annual SaaS', unit_price: 1, discount_percent: 99 }],
  proposalItems: [{ description: 'Annual SaaS', unit_price: 1, discount_percent: 99 }]
}));
assert.ok(Math.abs(weightedDiscount.averageDiscount - 16.5905) < 0.000001, 'Annual SaaS discount is base-amount weighted and agreement items take precedence');
const oneTimeOnly = analytics.calculateLifecycleMetrics(emptyContext({ agreementItems: [{ description: 'One time onboarding fee', unit_price: 100, discount_percent: 50 }] }));
assert.strictEqual(oneTimeOnly.averageDiscount, null, 'one-time-only fees are excluded from discount');
const zeroBaseFallback = analytics.calculateLifecycleMetrics(emptyContext({ agreementItems: [
  { description: 'Annual SaaS', unit_price: 0, discount_percent: 9.09 },
  { description: 'Subscription license', discount_percent: 15 }
] }));
assert.strictEqual(zeroBaseFallback.averageDiscount, 12.045, 'zero-base Annual SaaS rows fall back to a simple valid-percent average');

const duplicateCrossLog = analytics.calculateLifecycleMetrics(emptyContext({
  leads: [{ id: 'lead-log', created_at: at(1), status: 'qualified' }],
  lifecycleStatusLogs: [{ entity_type: 'lead', entity_id: 'lead-log', old_status: 'New', new_status: 'Qualified', changed_at: at(2) }],
  activityLogs: [{ entity_type: 'lead', entity_id: 'lead-log', old_status: 'New', new_status: 'Qualified', changed_at: at(2) }]
}), new Date(at(5)));
assert.strictEqual(duplicateCrossLog.numberOfStageChanges, 1, 'duplicate transitions across raw log sources count once');
const receiptCreationLog = analytics.calculateLifecycleMetrics(emptyContext({ lifecycleStatusLogs: [
  { entity_type: 'receipt', entity_id: 'receipt-log', old_status: null, new_status: 'Created', changed_at: at(2) },
  { entity_type: 'lead', entity_id: 'lead-snapshot', old_status: null, new_status: 'New', changed_at: at(1) }
] }));
assert.strictEqual(receiptCreationLog.numberOfStageChanges, 1, 'real receipt creation milestone counts while a generic initial snapshot does not');
assert.strictEqual(duplicateCrossLog.lastActivityAge, 3, 'last activity includes raw related logs');
assert.strictEqual(analytics.normalizeStatus(' Pending_Approval '), 'pending approval');
assert.strictEqual(analytics.diffDays(at(2), at(1)), 0, 'bad reverse dates clamp to zero');
const stuckInvoice = analytics.calculateLifecycleMetrics(emptyContext({ invoices: [{ id: 'invoice-overdue', invoice_date: at(1), due_date: at(3), updated_at: at(5), payment_status: 'Unpaid' }] }), new Date(at(10)));
assert.strictEqual(stuckInvoice.stuckStage, 'Invoice', 'invoice stuck threshold follows its due date/payment term');
assert.ok(stuckInvoice.bottleneckWarning.includes('Invoice'), 'a detected bottleneck always supplies warning text');

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
assert.strictEqual(Object.prototype.hasOwnProperty.call(overview, 'technicalRequestCompleted'), false, 'Technical Admin metrics must not be exposed');

const dateFiltered = analytics.getLifecycleMetrics({
  companies: [], leads: [], deals: [], agreementItems: [], invoiceItems: [], paymentSchedule: [], onboarding: [],
  proposals: [{ id: 'p1', status: 'accepted', created_at: at(1) }, { id: 'p2', status: 'accepted', created_at: at(20) }],
  agreements: [], invoices: [], receipts: [], creditNotes: []
}, { dateFrom: '2026-01-10', dateTo: '2026-01-31' });
assert.strictEqual(dateFiltered.proposalCreated, 1, 'date filters are applied at the source-record level');
assert.strictEqual(dateFiltered.proposalAccepted, 1);

console.log('Lifecycle overview source-of-truth checks passed.');
