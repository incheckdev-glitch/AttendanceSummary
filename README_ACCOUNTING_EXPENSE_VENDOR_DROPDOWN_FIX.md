# Accounting Expense Vendor Dropdown Fix

This update connects the **Expenses** form to the **Vendors / Suppliers** master table.

## What changed

- Expenses now use a Vendor / Supplier dropdown.
- Created vendors appear in the Expenses form.
- Expense rows store `vendor_id` and keep `vendor_name` for display/backward compatibility.
- When choosing a vendor, currency and default expense account can auto-fill if configured.
- Existing expenses with matching text vendor names can be backfilled to the vendor master.

## SQL to run

Run this migration in Supabase SQL Editor:

```sql
sql/migrations/20260707_accounting_expense_vendor_dropdown_fix.sql
```

This migration is safe to run multiple times.

## Files changed

- `accounting.js`
- `index.html`
- `service-worker.js`
- `sql/migrations/20260707_accounting_expense_vendor_dropdown_fix.sql`
