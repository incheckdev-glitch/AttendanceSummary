# Full HR Module Added

This package adds a complete HR workspace to the ERP:

- HR Dashboard
- Employee Directory
- Attendance with check-in/check-out, absent marking, late minutes, worked hours, and overtime
- Shift Management
- Leave Management with approvals
- Monthly Payroll Report generation
- Payslip preview with browser Print / Save as PDF
- Employee Documents and expiry tracking
- HR Settings
- CSV export for Attendance and Payroll

## Files Added

- `hr.js`
- `hr.css`
- `sql/migrations/20260703_full_hr_module.sql`
- `README_FULL_HR_MODULE.md`

## Files Updated

- `index.html`
  - Added HR menu group and HR view.
  - Added `hr.css` and `hr.js` includes.
- `app.js`
  - Added HR route, tab loader, refresh handler, and hash support.
- `ui.js`
  - Added HR tab/view to element cache and permission-aware tab registry.
- `permissions.js`
  - Added HR, attendance, leave, payroll, document and HR settings permissions.
- `service-worker.js`
  - Bumped cache version and added HR assets.

## Supabase Setup

Run this migration in Supabase SQL editor:

```sql
sql/migrations/20260703_full_hr_module.sql
```

Until the migration is applied, the HR module will work in local browser storage mode and show a yellow `Local mode` badge. After applying the migration, the module will sync to Supabase.

## Payroll Calculation Logic

Monthly Payroll uses:

```text
Basic Salary
+ Allowances
+ Overtime Amount
- Absence Deduction
- Unpaid Leave Deduction
- Late Deduction
- Fixed Deductions
= Net Salary
```

Attendance source fields used:

- Present days
- Absent days
- Paid leave days
- Unpaid leave days
- Late minutes
- Overtime hours

## Recommended Next Step

After deployment, create real employees, assign shifts, record attendance for a few days, approve leaves, then generate the monthly payroll report and preview payslips.
