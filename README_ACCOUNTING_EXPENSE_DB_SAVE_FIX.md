# Accounting Expense Database Save Fix

## What changed

Expenses now save to Supabase before the UI state is updated. The accounting module no longer treats local state or localStorage as a successful expense save.

## Runtime behavior

- The Expenses tab loads `accounting_expenses` from Supabase ordered by expense date and creation time.
- Creating or editing an expense calls Supabase `insert` / `update` first and waits for `.select('*').single()`.
- UI state is refreshed from Supabase only after the database returns the saved row.
- If Supabase save fails, the form stays open and the user sees: `Unable to save expense to database: [error message]`.
- The module logs database save attempts, saved rows, and database failures under `[Accounting Expenses]`.

## Database migration

Run:

```sql
sql/migrations/20260709_accounting_expenses_persistent_save_fix.sql
```

The migration safely creates or updates `public.accounting_expenses`, adds missing persistence columns, enables RLS, grants authenticated ERP access consistent with the existing accounting migrations, and adds database-side expense number generation.

## Validation checklist

1. Create a normal expense, refresh the page, and confirm it remains.
2. Edit the expense, refresh the page, and confirm edited values remain.
3. Create an Expense Refund / Credit with a negative amount, refresh, and confirm it remains negative.
4. Simulate a Supabase failure and confirm the UI does not add the row or show a fake success.
5. Post an expense and confirm the journal link is persisted.
