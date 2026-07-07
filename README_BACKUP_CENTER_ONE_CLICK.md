# InCheck360 Backup Center — One-Click Admin Backup

This update adds an admin-only **Download Backup ZIP** button in Backup Center.

## What the one-click ZIP includes

- `database/public_tables.json` — public ERP table data exported as JSON.
- `storage/<bucket>/<path>` — Supabase Storage bucket files downloaded with the service role.
- `backup_manifest.json` — backup metadata, bucket list, file count, skipped items, and notes.
- `README_BACKUP.txt` — short warning/description.

## Important limitation

This is an application-level backup for quick admin download. It is **not** a full PostgreSQL `pg_dump` replacement.

For full disaster recovery, keep using the manual Supabase CLI backup for:

- roles
- schema
- RLS policies
- functions
- triggers
- extensions

The one-click button is useful before small changes and for quick data/file snapshots.

## Required SQL

Run:

```sql
sql/migrations/20260707_backup_center_one_click_admin_only.sql
```

This creates/updates:

- `backup_settings`
- `backup_logs`
- admin-only permissions
- `public.backup_center_export_public_data()` RPC for the serverless backup endpoint

## Required Vercel environment variables

Set these in Vercel project settings:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Optional safety limits:

```text
BACKUP_MAX_STORAGE_OBJECTS=2500
BACKUP_MAX_STORAGE_BYTES=262144000
```

`BACKUP_MAX_STORAGE_BYTES` default is 250 MB. Increase only if your Vercel function has enough memory/time.

## Security

- The browser never receives the service role key.
- The button calls `/api/backup/download` with the current Supabase user session token.
- The serverless endpoint verifies the user and allows only `admin` role.
- Do not expose the service role key in frontend config.

## Deployment steps

1. Replace the updated files from this ZIP.
2. Run the SQL migration.
3. Add Vercel env vars.
4. Redeploy Vercel.
5. Hard-refresh the ERP or unregister the service worker.
6. Open Backup Center as admin.
7. Click **Download Backup ZIP**.

