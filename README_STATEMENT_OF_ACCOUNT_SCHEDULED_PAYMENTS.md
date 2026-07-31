# Statement of Account — Scheduled Payments

The client Statement of Account now reads every saved row from `invoice_payment_schedule` and displays each installment beneath its related SA invoice.

Each installment shows:

- SA invoice number and payment sequence, such as `SA/2026/41 · Payment 2 of 2`
- Scheduled due date
- Scheduled amount and currency
- Payment status

Scheduled-payment rows are informational. They do not increase Total Invoiced, Total Due, or the running balance because the parent invoice already records the accounting debit.

For legacy records, the statement can fall back to the `client_scheduled_payments` view when no direct schedule rows are available.
