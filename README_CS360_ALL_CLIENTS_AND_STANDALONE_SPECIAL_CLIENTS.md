# CS360 All Clients + Standalone Special Clients

## Fixed

- CS360 loads every client from the `clients` registry.
- Commercial clients with signed agreements or active invoices remain included even when registry/company linking is incomplete.
- Supabase tables are loaded page by page, removing the previous first-page/row-limit issue.
- Normal clients and Special CS Clients appear in separate sidebar sections.
- Every Special CS Client is independently selectable.
- A Special CS Client is no longer displayed under the normal client selected previously.
- The normal client selector is hidden when entering a Special CS Client completion report.
- Special CS Client details, locations, groups, brands, and completion history open in an independent client view.
- The previous CS360 save/persistence fix is preserved.

## Deploy

Replace:
- `client-success.js`
- `client-success.css`

Keep/run the included save migration if it was not already installed:
- `sql/migrations/20260717_cs360_save_persistence_final_fix.sql`

Then hard refresh with `Ctrl + F5`.
