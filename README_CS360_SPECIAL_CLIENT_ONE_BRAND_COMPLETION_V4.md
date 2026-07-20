# CS360 Special Client — One Brand Completion V4

## What changed

A Special CS Client can now have several brands and completion can be entered for only one selected brand.

Example:
- Special CS Client A
- Brand 1, Brand 2, Brand 3
- Select `Special CS Client — One Brand`
- Select Client A
- Select Brand 2
- Only the locations currently assigned to Brand 2 are displayed and saved

## Completion entry

In **Add Location Completion**, the Source selector now contains:

- Special CS Client — All Brands
- Special CS Client — One Brand

For the one-brand option:
1. Select the Special CS Client.
2. Select one of its configured brands.
3. Enter completion only for the locations assigned to that brand.
4. Save. Other brands and unassigned locations are not included.

The **Special CS Client > Brand Management** page also contains direct buttons for every brand:

- Add `<Brand Name>` Completion
- Export `<Brand Name>`

These buttons are disabled when the brand has no assigned locations.

## Export

The existing export dialog contains **Special CS Client Brand Completion Report**.

1. Select the Special CS Client.
2. Select one brand.
3. Export.

Only that brand's assigned locations and latest completion period are included.

## Files

- `client-success.js`
- `index.html`
- `sql/migrations/20260720_cs360_location_and_special_brand_management_v3.sql`

The SQL file is included because it is required for the brand assign/unassign fix from V3. It does not need a second run when V3 was already applied successfully.

## Deployment

1. If V3 SQL was not applied, run `sql/migrations/20260720_cs360_location_and_special_brand_management_v3.sql` once in Supabase.
2. Replace `client-success.js`.
3. Replace `index.html`.
4. Redeploy.
5. Hard refresh with `Ctrl + Shift + R`.

## Validation

- JavaScript syntax validation passed for 98 scripts.
- SQL migration safety validation passed.
- All 37 ERP regression tests passed.
