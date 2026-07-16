# InCheck360 Backup Center — One-Click Admin Backup

The Backup Center provides an Admin-only **Download Backup ZIP** action for quick application-level snapshots before controlled ERP changes.

## What the ZIP includes

- `database/public_tables.json` — public ERP table data exported as JSON.
- `storage/<bucket>/<path>` — Supabase Storage objects downloaded by the server-side service role.
- `storage/storage_inventory.json` — bucket/object inventory captured during the run.
- `backup_manifest.json` — environment, project reference, table metadata, storage limits, skipped items, and database-export SHA-256.
- `README_BACKUP.txt` — backup scope and limitations.

The completed ZIP SHA-256 is stored in `backup_logs.checksum` and returned in the `X-Backup-SHA256` response header.

## Important limitation

This is an application-level backup for quick Admin download. It is **not** a PostgreSQL `pg_dump` replacement.

For full disaster recovery, keep separate Supabase CLI backups for:

- database roles
- schema
- RLS policies
- functions and triggers
- extensions
- table data

Use the one-click ZIP together with the full database dump and an independently stored copy of all Storage buckets.

## Required SQL

Apply these migrations in order:

```text
sql/migrations/20260707_backup_center_one_click_admin_only.sql
sql/migrations/20260716_phase4_backup_runtime_guard.sql
```

The Phase 4 migration adds a service-role-only database guard so separate serverless instances cannot run overlapping backups. It also enforces a cooldown between backup starts.

## Required Vercel environment variables

Configure these as server-side variables for each Vercel environment:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
BACKUP_ENVIRONMENT=production
BACKUP_EXPECTED_PROJECT_REF=YOUR_PROJECT_REF
```

`BACKUP_ENVIRONMENT` must exactly match Vercel's `VERCEL_ENV` value for that deployment (`production`, `preview`, or `development`). `BACKUP_EXPECTED_PROJECT_REF` must match the project reference parsed from `SUPABASE_URL`.

This binding is intentional: a Preview deployment configured with Production values will fail closed instead of backing up the Production project.

Optional safety limits:

```text
BACKUP_MAX_STORAGE_OBJECTS=2500
BACKUP_MAX_STORAGE_BYTES=262144000
BACKUP_LOCK_SECONDS=900
BACKUP_RATE_WINDOW_SECONDS=300
```

- `BACKUP_MAX_STORAGE_BYTES` defaults to 250 MB.
- `BACKUP_LOCK_SECONDS` defaults to 15 minutes and protects long-running backups.
- `BACKUP_RATE_WINDOW_SECONDS` defaults to 5 minutes between backup starts.

Do not configure `BACKUP_CENTER_SECRET`, `ADMIN_BACKUP_SECRET`, or any URL-based backup token. Phase 4 accepts only an active Admin Supabase session.

## Endpoint security

`/api/backup/download` now:

- accepts `POST` only
- requires the current Supabase access token
- requires an active Admin profile
- requires the application request marker header
- verifies the deployment environment and Supabase project binding
- acquires a database-backed concurrency/rate guard
- returns `429` with `Retry-After` when another backup is running or the cooldown is active
- returns no-store response headers
- records the ZIP SHA-256 in Backup History

Global and API-specific security headers are configured in `vercel.json`. A strict Content Security Policy is intentionally not introduced in this phase because the current ERP still uses inline scripts/styles; enabling one without a nonce migration would break the application.

## Deployment order

1. Take a full manual Supabase CLI backup and copy Storage outside Supabase.
2. Apply `20260707_backup_center_one_click_admin_only.sql` if it is not already installed.
3. Apply `20260716_phase4_backup_runtime_guard.sql`.
4. Configure environment-scoped Vercel variables.
5. Deploy the Phase 4 frontend/serverless changes to Preview.
6. Test authorization, environment binding, concurrency, rate limiting, ZIP download, checksum logging, and security headers.
7. Complete the restoration verification checklist in `docs/BACKUP_RESTORE_VERIFICATION.md`.
8. Promote only after review.

## Restoration verification

A backup is not considered verified merely because the ZIP downloaded successfully. Follow:

```text
docs/BACKUP_RESTORE_VERIFICATION.md
```

The verification must be performed in an isolated non-production Supabase project.
