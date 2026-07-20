# InCheck360 Expense Report Export V10

## Included files
- `accounting.js`
- `index.html`

## What changed
- Added **Export Branded PDF** to Accounting → Advanced Accounting → Expenses.
- The PDF/print preview uses only the expense records matching the active:
  - Search filter
  - From date
  - To date
  - Status filter
- Added **Export Filtered CSV** using the same active filters.
- Added a professional InCheck360-branded A4 landscape layout.
- Added filter summary, prepared-by information, generation time, posted/unposted counts, status breakdown, and currency-separated financial totals.
- Added a clean detailed expense table with repeating headers and print-safe rows.
- Multi-currency totals are intentionally kept separate to prevent incorrect mixed-currency totals.

## Installation
1. Replace `accounting.js`.
2. Replace `index.html`.
3. Redeploy the platform.
4. Hard refresh with `Ctrl + Shift + R`.

No Supabase SQL is required.
