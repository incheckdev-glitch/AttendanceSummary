# Accounting Phase 3 — Financial Reports

This update extends the admin-only Accounting Foundation module with financial reporting built from posted ledger entries and synced source data.

## Added Reports

- Trial Balance
- Profit & Loss
- Balance Sheet
- Cash Flow
- Accounts Receivable Aging
- Accounts Payable Aging
- Customer Statement
- Vendor Statement
- Payroll Expense Report

## Added Controls

- Report From Date
- Report To Date
- Report As Of Date
- Report Search
- Print Report
- Export Report CSV

## Notes

- No new SQL migration is required for this phase.
- Reports depend on posted accounting ledger entries.
- AR/AP aging uses available synced source data from invoices, receipts, credit notes, Biners schedules, payroll items, and salary receipts.
- Accounting access remains admin-only.
