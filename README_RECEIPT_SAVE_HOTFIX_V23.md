# InCheck360 Receipt Save Hotfix V23

## Cause
The V22 360 Analytics database trigger was attached directly to `public.receipts`. If lifecycle-history logging failed during the receipt RPC or the later receipt update, PostgreSQL rolled back the financial transaction and the receipt appeared not to save.

## Fix
- Removes the database lifecycle trigger from `public.receipts`.
- Makes lifecycle database logging fail-safe for all other modules.
- Logs a new receipt from the application only after its header and item rows are fully saved.
- Analytics logging errors are non-blocking and cannot cancel receipt creation.

## Installation
1. Run `20260727_receipt_save_analytics_trigger_hotfix_v23.sql` in Supabase SQL Editor.
2. Replace `supabase-data.js` and `index.html`.
3. Redeploy.
4. Sign out/in if needed and press `Ctrl + Shift + R`.
5. Create a receipt and confirm it appears in Receipts and on the linked invoice.

The SQL verification query should return zero rows.
