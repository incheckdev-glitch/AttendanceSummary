# Sales Commission Payment Receipts V35

## What changed

When a commission installment is marked **Paid**, the Commission Tracker now atomically:

1. Records the installment payment.
2. Updates the parent commission status.
3. Issues a persistent branded commission payment receipt.
4. Opens the receipt preview for Print / Save PDF.

Receipt numbers use this format:

`CR/YYYY/00001`

## Receipt contents

- Receipt number and payment date
- Salesperson name and email
- Customer invoice and client
- First-year or renewal commission type
- Payment term and installment number
- Payment reference and notes
- Paid amount, commission total, and amount in words
- Issued-by user

## Existing paid installments

Open the commission details. A paid installment without a receipt displays **Issue Receipt**. After issuance, it displays **View Receipt**.

## Undo payment

Undoing a payment returns the installment to Scheduled and changes its receipt status to Void. Re-marking it paid reissues the same receipt number with the updated payment details.

## Installation

1. Run `20260728_sales_commission_payment_receipts_v35.sql` in the Supabase SQL Editor.
2. Replace `commission-tracker.js`.
3. Replace `index.html`.
4. Redeploy.
5. Sign out and back in, then press Ctrl + Shift + R.

The V24 Commission Tracker and V29 access-level migrations must already be installed.
