# Accounting Phase 1 - Admin Only

This update adds the first Accounting workspace to the ERP.

## Included

- Accounting Dashboard
- Chart of Accounts
- Bank & Cash Accounts
- Manual Journal Entries
- General Ledger
- Trial Balance
- Ledger CSV export
- Admin-only access in frontend permissions
- Admin-only Supabase role permissions

## Supabase SQL

Run this migration:

```text
sql/migrations/20260704_accounting_phase1_admin_only.sql
```

## Important behavior

- Only `admin` can see and use Accounting for now.
- Journal entries must balance before saving/posting.
- Posting a journal creates General Ledger rows.
- Bank/Cash balances are manual in Phase 1. In Phase 2, invoices, receipts, credit notes, Biners, and HR salary receipts can auto-post to Accounting.

## Updated files

```text
accounting.css
accounting.js
app.js
index.html
permissions.js
service-worker.js
sql/migrations/20260704_accounting_phase1_admin_only.sql
ui.js
```
