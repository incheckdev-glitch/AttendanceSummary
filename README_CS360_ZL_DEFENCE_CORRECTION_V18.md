# CS360 ZL Defence correction — V18

## Corrected behavior

For the legal client:

`ZAHRAT LEBNAN CAFETERIA&RESTAURANT - SOLE PROPRIETORSHIP L.L.C. - BRANCH`

CS360 now shows the location as **ZL Defence**.

- `ZL Defence` remains **ZL Defence**.
- A previously migrated CS360 snapshot named `LR Motor City` for this exact client is displayed and restored as **ZL Defence**.
- `LR Defence` still becomes **LR Motor City** for the intended LR location.
- Genuine `LR Motor City` locations belonging to other clients are not changed.

## Installation

1. Run `sql/migrations/20260723_cs360_restore_zl_defence_v18.sql` once in Supabase.
2. Replace `client-success.js` and `index.html`.
3. Redeploy.
4. Hard refresh with `Ctrl + Shift + R`.

The SQL updates only CS360-owned snapshot tables. It does not change invoices, agreements, or CRM data.
