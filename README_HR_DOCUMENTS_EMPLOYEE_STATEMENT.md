# HR Documents + Employee Statement Update

Run this migration after the main HR migration:

```sql
sql/migrations/20260705_hr_documents_and_employee_statement.sql
```

Added:
- PDF upload metadata for employee documents.
- Private Supabase Storage bucket `hr-employee-documents`.
- Employee Statement of Account view/RPC support.
- Admin-only permissions for HR documents and employee salary statement.

Frontend update:
- HR Documents now has PDF upload, view, download, replace, and remove controls.
- HR has a new Employee Statement tab with salary generated as Debit, salary receipts as Credit, running balance, print, and CSV export.
