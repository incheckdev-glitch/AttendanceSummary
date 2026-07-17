# CS360 Completion FK + Brand Location Fix

This patch fixes both errors:

1. `cs_location_completions_special_location_id_fkey`
2. `there is no unique or exclusion constraint matching the ON CONFLICT specification`

## Required deployment order

1. Run:
   `sql/migrations/20260717_cs360_completion_fk_and_brand_location_fix.sql`
2. Replace:
   - `client-success.js`
   - `client-success.css`
3. Hard refresh:
   `Ctrl + F5`

## What changed

- Replaces legacy Special CS Client foreign keys with links to:
  - `cs_special_clients`
  - `cs_special_client_locations`
  - `cs_special_client_groups`
  - `cs_special_client_brands`
- Repairs old completion references by matching Special Client + location name.
- Preserves old completion history while clearing only invalid retired references.
- Removes duplicate brand-location assignment rows.
- Adds the exact unique index required for brand/location conflict handling.
- Frontend brand assignment now uses delete + insert and no longer depends on `ON CONFLICT`.
- Frontend detects stale Special CS Client location IDs before saving.
