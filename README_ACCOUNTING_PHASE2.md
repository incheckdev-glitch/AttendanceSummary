# InCheck360 Accounting Phase 2 — Admin Only

This update extends Accounting Phase 1 with source-module sync into the general ledger.

## New Accounting tab

Inside **Accounting Foundation**, open:

```text
Module Sync
```

It lets the admin review and post these records into accounting:

```text
Invoices           → Dr Accounts Receivable / Cr SaaS or Setup Revenue
Receipts           → Dr Bank or Cash / Cr Accounts Receivable
Credit Notes       → Dr Credit Notes Contra Revenue / Cr Accounts Receivable
Biners Payables    → Dr Outsourcing Expense / Cr Accounts Payable
Biners Payments    → Dr Accounts Payable / Cr Bank or Cash
HR Payroll         → Dr Payroll Expense / Cr Payroll Payable
Salary Receipts    → Dr Payroll Payable / Cr Bank or Cash
```

## Required SQL

Run this after Accounting Phase 1 SQL:

```text
sql/migrations/20260704_accounting_phase2_module_sync.sql
```

## Notes

- Access remains admin-only for now.
- Posting is reviewed by admin using a button; it does not blindly auto-post all records.
- Duplicate posting is blocked in the UI by `source_module + source_reference`.
- If a source table does not exist yet, the module ignores it and still loads the others.
- General Ledger now has a source filter so you can filter manual journals vs invoices, receipts, payroll, etc.
