# Accounting Vendors / Suppliers Update

Adds a dedicated **Vendors / Suppliers** tab inside Accounting Foundation.

## Added

- Vendor/Supplier master records
- Vendor bills / supplier invoices
- Vendor payments
- Vendor payable balance
- Post vendor bill to ledger:
  - Dr Expense / VAT Receivable
  - Cr Accounts Payable
- Post vendor payment to ledger:
  - Dr Accounts Payable
  - Cr Bank / Cash
- Vendor statement SQL view
- Admin-only accounting permissions

## SQL to run

Run this migration in Supabase after the previous Accounting Phase 1/2/4 migrations:

```text
sql/migrations/20260707_accounting_vendors_suppliers.sql
```

## Updated files

- accounting.js
- index.html
- service-worker.js
- sql/migrations/20260707_accounting_vendors_suppliers.sql
- README_ACCOUNTING_VENDORS_SUPPLIERS.md
