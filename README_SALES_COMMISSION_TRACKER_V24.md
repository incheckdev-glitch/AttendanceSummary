# InCheck360 CRM — Manual Sales Commission Tracker V24

## Purpose

Adds a manual Sales Commission Tracker under CRM. A commission record is created only when an authorized user selects an existing invoice and assigns a salesperson.

## Commission rules

- First year: 5% of the commissionable invoice amount.
- Renewal: 2.5% of the commissionable invoice amount.
- The default commissionable amount is the full invoice value, including Annual SaaS, one-time fees, and hardware.
- The commissionable amount remains visible in the form for manual adjustments when an approved exception is required.

## Payment schedule

The module first reads the invoice's saved `invoice_payment_schedule` rows and uses the same due dates. The total commission is split proportionally across those invoice payments.

When no saved schedule exists, it uses these fallbacks:

- Annual / Net 30: 1 commission payment.
- Semiannual / Net 21: 2 commission payments.
- Quarterly / Net 14: 4 commission payments.
- Monthly / Net 7: 12 commission payments.
- Custom: user-defined number of installments.

Example: a USD 10,000 first-year invoice with a semiannual term produces USD 500 total commission, divided into two scheduled commission payments.

## Module features

- CRM sidebar module.
- Manual invoice selection and salesperson assignment.
- First-year and renewal commission types.
- Term-based installment preview before saving.
- KPI cards for total, pending, paid, and due commission.
- Filters by salesperson, type, status, currency, and search.
- Commission detail view with installment history.
- Manual Mark Paid / Undo payment actions.
- Edit commission assignment and notes.
- Duplicate invoice protection.
- CSV export based on active filters.
- Multiple-currency totals kept separate.

## Access

- Full management: Admin, Dev, Head of Sales, GM, SFC/Financial Controller, Accounting/Accountant.
- Sales Executive: view and export only their own assigned commission records.

## Installation

1. Run `20260727_sales_commission_tracker_manual_v24.sql` in Supabase SQL Editor.
2. Replace `index.html`, `app.js`, `ui.js`, and `permissions.js`.
3. Add `commission-tracker.js` and `commission-tracker.css` to the project root.
4. Redeploy.
5. Sign out and back in so role permissions reload.
6. Press Ctrl + Shift + R.

## Database objects

- `public.sales_commissions`
- `public.sales_commission_installments`
- `public.sales_commission_current_role()`
