# Migration Status

## Current state
- Active backend: **Supabase** (tables + RPC + Supabase Auth).
- Migration status: **complete for active runtime**, with production flows running through Supabase resources.

## Fully migrated areas
- Core resource routing and persistence in `supabase-data.js`.
- Auth/session handling with Supabase-backed role checks.
- Operations, workflow, roles/permissions, tickets, clients, proposals, agreements, invoices, receipts, and notifications via Supabase resources.

## Final legacy cleanup status

### Removed in this pass
- Removed `APPS_SCRIPT_WEBAPP_URL` fallback from `api/proxy.js`; proxy target now resolves from Supabase/server-neutral env vars only.
- Removed unused config aliases: `LEGACY_TICKETS_CSV_URL`, `SHEET_URL`, and all `*_SHEET_NAME` compatibility keys.
- Centralized legacy payload compatibility key mapping in `legacy-compat.js`.

### Remaining compatibility shims (intentional)
- Legacy request payload keys (`sheetName`, `sheet_name`, `tabName`, `tab_name`, `table`, `entity`) are still accepted through `LegacyCompat` for stale clients.
- Sanitizers still remove legacy request metadata fields before DB writes.

All temporary shims are explicitly marked with:
`legacy compatibility - remove after migration closure`

### Why these remaining items still exist
- Some deployed clients may still submit old request contracts, so immediate hard removal could break update/create flows for roles, events, leads, deals, proposals, and agreements.

### Recommended future removal step
- After confirming all active clients send only `resource` (+ `action`) and use Supabase-first payload contracts for one release window, remove `legacy-compat.js` and all compatibility fallbacks that consume its keys.
