# Backend deployment notes (Supabase-first)

This platform now runs on Supabase as the active backend. The frontend data layer (`supabase-data.js`) is the primary request dispatcher, and `/api/proxy` is an optional generic relay for controlled upstream forwarding when needed by deployment topology.

## Current architecture

- **Data backend**: Supabase tables + RPCs.
- **Auth**: Supabase Auth session + role-based checks in the client.
- **API routing**: frontend routes requests to migrated resources through `SupabaseData.dispatch`.
- **Proxy usage**: optional Vercel proxy (`/api/proxy`) with neutral upstream forwarding (`API_PROXY_TARGET_URL`).

## Environment variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `API_PROXY_TARGET_URL` (optional, only when `/api/proxy` is intentionally used)
- `SUPABASE_SERVICE_PROXY_URL` / `BACKEND_API_URL` (optional aliases for proxy target resolution)

## Database migration workflow

- Keep SQL schema changes in `sql/migrations/`.
- Apply migrations in order and verify affected resources in the UI.
- For role/permission changes, validate both table rows and RPC behavior.
- After each migration, test create/list/update/delete paths for touched resources.

## Compatibility notes

- Some request sanitizers still accept legacy payload keys (`sheetName`, `sheet_name`, `tabName`, `tab_name`, `table`, `entity`) through centralized `legacy-compat.js` to avoid breaking stale clients.
- Compatibility aliases are explicitly marked in code with:
  `legacy compatibility - remove after migration closure`.
