# InCheck360 Backup Restoration Verification

Use this checklist after significant backup changes and at least periodically for disaster-recovery readiness. Never test restoration against the Production Supabase project.

## 1. Record the backup set

Capture:

- backup ZIP filename
- `backup_logs.id`
- backup start and finish timestamps
- SHA-256 from `backup_logs.checksum`
- Supabase project reference recorded in `backup_manifest.json`
- Vercel environment recorded in the manifest
- matching full CLI database dump location
- matching external Storage copy location

## 2. Verify ZIP integrity

On a trusted workstation:

```bash
sha256sum InCheck360_ERP_Backup_YYYY-MM-DDTHH-MM-SS.zip
unzip -t InCheck360_ERP_Backup_YYYY-MM-DDTHH-MM-SS.zip
```

The calculated SHA-256 must exactly match `backup_logs.checksum`. The ZIP test must report no corrupt entries.

Open `backup_manifest.json` and confirm:

- the environment is the expected source environment
- the project reference is the expected source project
- the backup finished successfully
- skipped Storage items are understood and accepted
- `database_export_sha256` is present
- expected Storage buckets appear in the bucket inventory

## 3. Prepare an isolated restoration project

Create or select a non-production Supabase project dedicated to restoration testing. Confirm its project reference is different from Production.

Do not reuse Production credentials, webhook destinations, notification secrets, payment integrations, or email delivery settings. Disable outbound automation until verification is complete.

## 4. Restore the full database dump

Use the separately retained Supabase CLI dump—not `public_tables.json` alone—to restore:

1. roles
2. schema, extensions, functions, triggers, and RLS
3. table data

Example outline:

```bash
psql "$RESTORE_DATABASE_URL" -f roles.sql
psql "$RESTORE_DATABASE_URL" -f schema.sql
psql "$RESTORE_DATABASE_URL" -f data.sql
```

Resolve errors before continuing. Keep the command output as verification evidence.

## 5. Restore Storage

Recreate the required buckets with the correct public/private configuration, file-size limits, and MIME restrictions. Copy the externally retained Storage files into the isolated project.

Compare the restored inventory against `storage/storage_inventory.json` and the manifest:

- bucket count
- object count per bucket
- total restored bytes
- representative signed proposal/agreement documents
- HR employee documents
- company documents and other protected attachments

## 6. Reconcile critical ERP data

Compare source manifest/table counts with the isolated restored project. At minimum verify:

- `profiles`, `roles`, and `role_permissions`
- companies and contacts
- leads and deals
- proposals and proposal items
- agreements and agreement items
- invoices, invoice items, receipts, and credit notes
- clients and renewal data
- Biners entries and payment schedules
- HR employees, attendance, leave, payroll, salary receipts, and documents
- accounting accounts, journals, lines, ledger entries, vendors, bills, payments, and expenses
- backup settings and logs

For financial documents, reconcile totals rather than relying only on row counts.

## 7. Verify security behavior

In the isolated environment:

- confirm RLS is enabled on protected tables
- confirm anonymous users cannot call protected RPCs
- confirm inactive profiles cannot continue using the ERP
- confirm role changes reload the permission matrix
- confirm Backup Center is Admin-only
- confirm the backup endpoint rejects GET
- confirm a second concurrent backup is rejected
- confirm requests during the cooldown receive `429`
- confirm the endpoint rejects an environment/project mismatch

## 8. Functional smoke test

Sign in with isolated test users and verify:

- permitted modules load for each role
- restricted modules remain unavailable
- proposal, agreement, invoice, and receipt previews open
- signed/uploaded documents can be downloaded
- HR and Accounting records load without local-only fallback
- representative reports calculate expected totals

Do not send real notifications, emails, payment requests, or external integrations from the restoration environment.

## 9. Record the result

Record:

- verification date
- verifier
- restored project reference
- backup checksum
- row-count and financial reconciliation result
- Storage reconciliation result
- RLS/auth result
- unresolved exceptions
- measured restore duration
- recovery point represented by the backup

Mark the backup **Verified**, **Verified with exceptions**, or **Failed**. A failed or materially incomplete test requires a new backup and repeat verification.

## 10. Destroy or isolate the test environment

After evidence is retained, remove sensitive restored data or keep the project isolated with restricted access and disabled integrations according to company policy.
