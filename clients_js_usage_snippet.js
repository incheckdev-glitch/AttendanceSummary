// Use this pattern wherever Payment & Renewals rows, cards, and timeline are built.

const allRenewalRows = this.getInvoiceAnnualSaasRenewalRows(client);
const visibleRenewalRows = this.applyRenewalUiFilters(allRenewalRows);

// Renewal Due Soon card must use visibleRenewalRows, not allRenewalRows.
const nextRenewalDate = visibleRenewalRows
  .map(row => row.renewal_date || row.renewal_due_date || row.service_end_date)
  .filter(Boolean)
  .sort((a, b) => new Date(a) - new Date(b))[0] || '';

// Payment & Renewals table must also use visibleRenewalRows.
const tableRows = visibleRenewalRows;

// After rendering the checkbox, bind change event once.
document.getElementById('clientExcludeCanceledRenewals')?.addEventListener('change', () => {
  // Re-render the current client payment/renewals section using your existing render function.
  if (this.currentClient) this.renderPaymentRenewalsTab(this.currentClient);
});
