// Add these helpers inside the Clients module/object in clients.js.

normalizeRenewalStatusValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
},

isCanceledRenewalRow(row = {}) {
  const values = [
    row.renewal_status,
    row.status,
    row.invoice_status,
    row.payment_status,
    row.agreement_status,
    row.lifecycle_status,
    row.service_status,
    row.cancel_status,
    row.cancellation_status,
    row.renewal_decision,
    row.renewal_action,
    row.do_not_renew,
    row.is_cancelled,
    row.is_canceled,
    row.cancelled_at,
    row.canceled_at,
    row.cancel_date,
    row.cancellation_date
  ];

  const text = values
    .map(value => this.normalizeRenewalStatusValue(value))
    .filter(Boolean)
    .join(' | ');

  if (!text) return false;

  return [
    'cancelled',
    'canceled',
    'void',
    'deleted',
    'terminated',
    'not renewing',
    'not renew',
    'do not renew',
    'do not renewal',
    'non renewal',
    'no renewal'
  ].some(token => text.includes(token));
},

shouldExcludeCanceledRenewals() {
  const checkbox = document.querySelector('[data-client-exclude-canceled-renewals]')
    || document.getElementById('clientExcludeCanceledRenewals')
    || document.getElementById('excludeCanceledRenewals');

  // Default to true if the control is missing, so canceled rows do not affect Renewal Due Soon.
  if (!checkbox) return true;
  return Boolean(checkbox.checked);
},

applyRenewalUiFilters(rows = {}) {
  let filtered = Array.isArray(rows) ? [...rows] : [];

  if (this.shouldExcludeCanceledRenewals()) {
    filtered = filtered.filter(row => !this.isCanceledRenewalRow(row));
  }

  const startFilter = String(
    document.getElementById('clientRenewalFilterStart')?.value
    || this.E?.clientRenewalFilterStart?.value
    || ''
  ).trim();

  const endFilter = String(
    document.getElementById('clientRenewalFilterEnd')?.value
    || this.E?.clientRenewalFilterEnd?.value
    || ''
  ).trim();

  if (startFilter || endFilter) {
    filtered = filtered.filter(row => {
      const date = String(row.renewal_date || row.renewal_due_date || row.service_end_date || '').slice(0, 10);
      if (!date) return false;
      if (startFilter && date < startFilter) return false;
      if (endFilter && date > endFilter) return false;
      return true;
    });
  }

  return filtered;
},
