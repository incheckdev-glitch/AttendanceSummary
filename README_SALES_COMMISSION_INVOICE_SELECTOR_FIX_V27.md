# Sales Commission Tracker — Invoice Selector Fix V27

## Fixed
- The Add Commission invoice selector no longer queries `invoices` ordered by the non-existent `invoice_date` column.
- Invoice dates now support the deployed `issue_date` field.
- Invoice rows are sorted in the browser after loading.
- Added a fallback to the platform's `Api.listInvoices()` service when direct table access returns no rows or is restricted by RLS.
- The selector now shows `No eligible invoices found` instead of appearing blank when there are genuinely no usable invoices.

## Install
Replace:
- `commission-tracker.js`
- `index.html`

Redeploy, sign out and back in, then hard refresh with Ctrl + Shift + R.

No SQL migration is required. The original V24 commission tracker SQL must already be installed.
