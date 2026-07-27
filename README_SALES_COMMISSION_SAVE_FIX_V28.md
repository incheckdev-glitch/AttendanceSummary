# Sales Commission Save Fix V28

## Fixed

The commission parent record was inserted, but the installment insert failed because the frontend included a `currency` property that does not exist in `public.sales_commission_installments`. The cleanup code then deleted the parent commission, so the form appeared to remain on Saving without a saved record.

V28 now sends only columns supported by the installment table:

- commission_id
- installment_no
- schedule_label
- source_schedule_id
- due_date
- commission_amount
- paid_amount
- status
- paid_date
- payment_reference
- notes
- updated_at

The Save Commission button also restores its normal state after success or failure and surfaces the Supabase error message.

## Installation

1. Replace `commission-tracker.js`.
2. Replace `index.html` to load the V28 cache version.
3. Redeploy.
4. Sign out and sign back in.
5. Hard refresh with Ctrl + Shift + R.

No SQL migration is required. The original V24 commission tracker SQL must already be installed.
