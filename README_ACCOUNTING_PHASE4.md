# InCheck360 Accounting Phase 4 — Advanced Controls

This update extends Accounting Foundation with the advanced controls layer.

## Access

Accounting remains **admin-only for now**.

## Added Features

- Deferred Revenue account `2400`
- Monthly SaaS revenue recognition schedule
- Invoice sync now credits annual SaaS to Deferred Revenue instead of direct SaaS Revenue
- Monthly recognition journal: `Dr Deferred Revenue / Cr SaaS Revenue`
- Expense Management
- Tax / VAT rates
- VAT Receivable account `1400`
- Cost Centers
- Closing Periods
- Bank Reconciliation
- Accounting Audit Log

## Required SQL

Run this after Accounting Phase 1 and Phase 2 migrations:

```sql
sql/migrations/20260704_accounting_phase4_advanced_controls.sql
```

## Important Accounting Logic

### Invoice with annual SaaS

```text
Dr Accounts Receivable
Cr Deferred Revenue
Cr Setup Fees Revenue, if one-time setup exists
```

### Monthly SaaS recognition

```text
Dr Deferred Revenue
Cr SaaS Revenue
```

### Expense approved but not paid

```text
Dr Expense
Dr VAT Receivable, if tax exists
Cr Accounts Payable
```

### Expense paid

```text
Dr Expense
Dr VAT Receivable, if tax exists
Cr Bank / Cash
```

## Notes

- Existing journals remain unchanged.
- New invoice postings after this update will defer SaaS revenue.
- Old invoices already posted directly to SaaS Revenue are not automatically reversed. If you want to convert old invoices to deferred revenue, create manual adjustment journals or repost after deleting/reversing the old auto journal.
- Closing periods block posting until reopened by admin.
