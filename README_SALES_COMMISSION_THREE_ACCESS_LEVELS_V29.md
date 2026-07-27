# Sales Commission Tracker · Three Access Levels V29

This update restricts the CRM Sales Commission Tracker to explicitly authorized roles.

## Access levels

### 1. View & Manage All Commissions
The role can:
- View every commission and installment
- Add, edit, and delete commission records
- Mark installments paid or undo payment
- Export all filtered commission records

### 2. View All Commissions — Read Only
The role can:
- View every commission and installment
- Use filters and export the visible data
- Cannot add, edit, delete, or mark payments

### 3. View Related Commissions Only
The role can:
- View commissions assigned to their own profile ID or email
- View the related installment schedule
- Export only their visible related commissions
- Cannot add, edit, delete, or mark payments

A role assigned to none of these levels cannot see or query the module.

## Default access installed by the SQL

- **View & Manage All:** Admin, Dev, Head of Sales, Sales Manager, GM, SFC, Financial Controller, Accounting, Accountant
- **View All — Read Only:** Viewer
- **View Related Only:** Sales Executive
- Other roles: no access

The assignments can be changed under **Roles & Permissions**. The three access levels are mutually exclusive: assigning a role to one level removes it from the other two.

## Installation

1. Run `20260727_sales_commission_three_access_levels_v29.sql` in Supabase SQL Editor.
2. Replace:
   - `commission-tracker.js`
   - `permissions.js`
   - `roles-admin.js`
   - `index.html`
3. Redeploy.
4. Sign out and sign back in so the permission matrix reloads.
5. Press `Ctrl + Shift + R`.

## Security

The restriction is applied in both the browser and Supabase Row Level Security. Users with **View Related Commissions Only** cannot retrieve unrelated commission rows by calling Supabase directly.
