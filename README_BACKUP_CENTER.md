# Backup Center — Admin Only

This update adds an admin-only Backup Center tab.

## What it does

- Shows last logged database, storage, and full backup.
- Stores backup settings such as preferred destination and retention counts.
- Lets admin add manual backup logs after exporting files.
- Provides manual backup commands for database and buckets.
- Exports backup history CSV.
- Prints backup history.

## What it does not do

It does not run the database backup directly from the browser, and it does not store database passwords, service keys, or S3 secrets. Those must stay on the admin PC or secure backend.

## SQL to run

Run this in Supabase SQL Editor:

```sql
sql/migrations/20260707_backup_center_admin_only.sql
```

## Access

Only admin has frontend permission and `role_permissions` rows.

## Manual backup reminder

Database backup and Storage bucket backup are separate. Supabase database backup does not include actual bucket files.
