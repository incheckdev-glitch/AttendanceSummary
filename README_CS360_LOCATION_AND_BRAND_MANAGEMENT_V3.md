# CS360 Location and Brand Management V3

## Fixed location names
The CS360 display logic now checks every location field used by invoice, agreement, onboarding, completion, brand, and Special CS Client rows, including `location_name`, `store_name`, `outlet_name`, `branch_name`, `site_name`, and legacy camelCase fields.

Mappings:

- `LR muroo` / `LR Muroor` → `LR Muroor`
- `LR Defence` / `ZL Defence` → `LR Motor City`
- `ZL Khalidya` / `ZL Khalidiya` → `ZL al Forsan Cloud Kitchen`

The SQL migration updates only CS360-owned snapshots. It does not rename invoice, agreement, CRM, accounting, or client-module source records.

## Brand management fixes

### Normal CS clients
- Assign a location to a brand.
- Move a location between brands in the same scope.
- Unassign a location.
- Uses atomic Supabase RPC functions so browser-side RLS no longer causes silent failures.

### Special CS Clients
- Assign, move, and unassign each location from the **Brand Management** tab.
- Newly created locations start **Unassigned**.
- Existing assignments are restored by matching location and brand names when a Special CS Client is edited.
- The **Special CS Client Brand Completion Report** remains available in the export report types.

## Apply order

1. Run `sql/migrations/20260720_cs360_location_and_special_brand_management_v3.sql` once in Supabase SQL Editor.
2. Replace `client-success.js`.
3. Replace `index.html`.
4. Redeploy the site.
5. Hard refresh with `Ctrl + Shift + R`.

The new `index.html` uses a new CS360 script version so the browser does not reuse the previous V2 JavaScript file.
