# Agreement Annex – Additional Location V31

## Why V30 failed

V30 tried to update `root_agreement_id` on existing signed agreements. The platform's signed-agreement protection trigger correctly rejected that update.

## V31 correction

V31 adds the required annex columns and indexes without updating any existing signed agreement. Lifecycle defaults are applied only when a new agreement or annex is inserted.

Existing signed agreements may keep a blank `root_agreement_id`. This is supported by the Annex module, which safely uses the existing agreement ID as the root when creating an annex.

## Installation

1. Run `20260728_agreement_annex_extra_location_v31.sql` in Supabase.
2. If the V30 frontend files have not yet been deployed, replace `supabase-data.js` and `index.html`, and add `agreement-annex.js`.
3. Redeploy, sign out and back in, then hard-refresh with Ctrl + Shift + R.

No signed agreement value is changed by this migration.
