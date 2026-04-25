# Migration Status

## Current state
- Active backend: **Supabase** (tables + RPC + Supabase Auth).
- Migration status: **near-complete**, with production flows running through Supabase resources.

## Fully migrated areas
- Core resource routing and persistence in `supabase-data.js`.
- Auth/session handling with Supabase-backed role checks.
- Operations, workflow, roles/permissions, tickets, clients, proposals, agreements, invoices, receipts, and notifications via Supabase resources.

## Temporary compatibility shims
- Legacy payload aliases (`sheetName`, `tabName`, `sheet_name`) are still accepted in sanitizers.
- Proxy target env fallback includes `APPS_SCRIPT_WEBAPP_URL`.
- Legacy config aliases for `*_SHEET_NAME` remain mapped to `*_TABLE` keys.

All temporary shims are marked with:
`legacy compatibility - remove after migration closure`

## Remaining minor cleanup
- Remove legacy aliases once all deployed clients use the updated payload contracts.
- Drop compatibility config/env aliases after next deployment validation window.
