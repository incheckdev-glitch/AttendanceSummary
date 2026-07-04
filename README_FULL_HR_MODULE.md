# InCheck360 HR & Payroll Module — Admin-Only Version

This update changes the HR module to match the requested operational flow.

## Current access rule

For now, **only Admin** has access to HR. Employees do not have self-service access, no employee check-in/check-out, and no employee portal is active.

Other roles can be added later by updating `role_permissions` or the frontend permission matrix.

## Included HR sections

- HR Dashboard
- Employees
- Attendance
- Leave Management
- Leave Balance
- Holidays Calendar
- Monthly Payroll Report
- Payslips
- Salary Receipts
- Employee Documents
- HR Settings

## Attendance logic

Employees are considered **present by default** on working days.

The system does not require check-in/check-out.

A day becomes non-payable for transport only when:

- It is an approved leave day
- It is a sick leave day
- It is manually marked absent by Admin
- It is manually marked half day by Admin

Saturday and Sunday are always non-working days.

Holidays added in the Holidays Calendar are also excluded from working days.

## Salary and transportation logic

Each employee has:

- Fixed monthly salary
- Fixed monthly allowances
- Monthly transportation allowance
- Fixed admin deductions

Monthly salary is fixed and is not reduced just because there is no check-in/check-out.

Transportation is calculated as:

```text
Monthly transportation allowance / working days in the selected month
```

Then paid only for eligible working days.

Example:

```text
Monthly transport: 100 USD
Working days: 20
Transport/day: 5 USD
Employee absent/leave/sick: 2 days
Transport paid: 18 × 5 = 90 USD
Transport not paid: 10 USD
```

## Leave balance logic

Annual Leave is configured as:

```text
15 days per year
1.25 days accrued per month
```

Admin can always manually adjust:

- Entitlement days
- Carry-forward days
- Adjustment days
- Notes

## Salary receipts

Admin can generate salary receipts when an employee receives salary fully or partially.

Each payroll item shows:

- Net salary
- Paid amount
- Remaining salary rest

Salary receipts support partial payment.

## Required Supabase SQL

Run this file in Supabase SQL Editor:

```text
sql/migrations/20260703_full_hr_module.sql
```

The migration is safe to re-run.

## Updated files

```text
README_FULL_HR_MODULE.md
app.js
hr.css
hr.js
index.html
permissions.js
service-worker.js
sql/migrations/20260703_full_hr_module.sql
ui.js
```
