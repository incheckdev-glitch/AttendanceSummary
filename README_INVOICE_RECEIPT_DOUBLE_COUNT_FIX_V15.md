# Invoice Receipt Double-Count Fix V15

## Issue
The invoice preview loaded linked receipts twice when the same receipt matched both:

- `receipts.invoice_id = invoices.id`
- `receipts.invoice_number = invoices.invoice_number`

The payment schedule used the correct value, but the invoice totals summary could display double the real amount paid. Example: USD 805 appeared as USD 1,610.

## Fix
- Added stable receipt deduplication before any invoice payment total is calculated.
- Deduplication prioritizes the receipt database UUID, then receipt ID, then receipt number.
- Added a safe fallback key for legacy receipt rows.
- Applied the same deduplication to the invoice receipt list and the invoice preview calculation.
- Updated the `invoices.js` cache version in `index.html`.

## Installation
Replace:

1. `invoices.js`
2. `index.html`

Then redeploy and hard-refresh with `Ctrl + Shift + R`.

## SQL
No SQL migration is required. This is a frontend aggregation issue; no receipt or invoice records should be deleted.
