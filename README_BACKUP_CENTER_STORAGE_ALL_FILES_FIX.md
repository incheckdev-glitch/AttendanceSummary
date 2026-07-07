# Backup Center storage all-files fix

This update fixes the one-click Backup Center export so Storage files are discovered from `storage.objects` metadata first.

Why:
- Proposal and Agreement tables may only store the latest uploaded document path.
- The backup must not rely only on those latest document fields.
- It must back up every object that exists in Supabase Storage buckets.

Updated behavior:
- Lists all Storage objects from `storage.objects` using the service role key.
- Downloads every object path found, including all Proposal and Agreement uploaded files that still exist in Storage.
- Falls back to recursive Storage API listing if metadata listing is unavailable.
- Adds `storage/storage_inventory.json` inside the ZIP so you can verify every bucket/path included.

No SQL migration is required for this update.

After deploy:
1. Redeploy Vercel.
2. Open ERP as admin.
3. Go to Backup Center.
4. Click Download Backup ZIP.
5. Extract ZIP and open `storage/storage_inventory.json` or `backup_manifest.json`.
6. Confirm old proposal/agreement files are listed.

Important:
If older proposal/agreement files were uploaded using the exact same Storage path and overwritten, only the final file physically exists in Storage. This fix backs up all files that still exist as Storage objects; it cannot recover overwritten files that no longer exist.
