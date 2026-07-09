# Accounting Expense Refund / Credit

This update adds signed expense refunds and vendor credits to the Advanced Accounting / Expenses module.

## Expense Types

Expenses now have an `expense_type` value:

- `expense` — standard expense entry, requiring a positive net amount.
- `refund_credit` — refund, vendor credit, reversed expense, or subscription refund, requiring a negative net amount.

The expense form defaults to **Expense**. Select **Expense Refund / Credit** before entering negative net amounts such as `-25.00`.

## Amount and VAT Rules

The frontend validates signed amounts by expense type:

- Standard expense: `amount > 0`
- Refund / credit: `amount < 0`
- Zero is always blocked

VAT and totals follow the same sign as net amount:

```text
Net Amount: -100.00
VAT 11%:   -11.00
Total:     -111.00
```

Formula:

```text
tax_amount = net_amount * tax_rate
total_amount = net_amount + tax_amount
```

## Journal Entry Behavior

Normal expense posting remains unchanged:

```text
Dr Expense
Dr VAT Receivable / Input Tax
Cr Bank/Cash/AP
```

Refund / credit posting reverses the journal using absolute line values:

```text
Dr Bank/Cash/AP
Cr Expense
Cr VAT Receivable / Input Tax
```

This means refunds reduce expense balances in Profit & Loss and keep the Trial Balance balanced.

## Database Migration

Run:

```sql
sql/migrations/20260709_accounting_expense_refund_negative_amount.sql
```

The migration:

- Adds `expense_type` with default `expense`.
- Backfills existing rows to `expense`.
- Drops positive-only amount CHECK constraints where present.
- Adds non-zero amount constraints for available amount columns.
- Adds an `expense_type` CHECK constraint for `expense` and `refund_credit`.
