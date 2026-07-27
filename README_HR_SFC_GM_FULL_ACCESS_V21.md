# HR Full Access — GM and SFC (V21)

This update gives full HR & Payroll access to the following active role-key variants:

- General Manager: `gm`, `general_manager`, `generalmanager`
- Senior Financial Controller: `sfc`, `senior_fc`, `financial_controller`, `senior_financial_controller`, `senior_finanical_controller`, `senior_financial_controler`

## Installation order

1. Run `20260727_hr_full_access_sfc_gm.sql` in the Supabase SQL Editor.
2. Replace `permissions.js`, `hr.js`, and `index.html`.
3. Redeploy the platform.
4. Sign out and sign back in as the GM/SFC user, then hard-refresh with `Ctrl + Shift + R`.

The SQL changes role permissions only. It does not modify HR records, payroll data, employees, attendance, leaves, receipts, or documents.

The recent payslip print cleanup remains included in `hr.js`.
