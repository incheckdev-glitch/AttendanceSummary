# SFC Full Accounting Foundation Access

Fixes the Accounting module message:

`Admin only. Accounting is restricted to admin users for now.`

Changes:
- `accounting.js` now allows Accounting Foundation access for:
  - `admin`
  - `accounting`
  - `accountant`
  - `sfc`
  - `senior_financial_controller`
  - `senior_finanical_controller`
- `permissions.js` base matrix now includes SFC variants for Accounting Foundation resources.
- SQL migration grants full accounting permissions in `role_permissions`.

Run:

`sql/migrations/20260710_sfc_full_accounting_foundation_access.sql`

Then replace:
- `accounting.js`
- `permissions.js`

After deployment:
- Hard refresh with `Ctrl + F5`
- Test with an SFC user
