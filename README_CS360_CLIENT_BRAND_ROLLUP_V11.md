# CS360 Client Brand Rollup Fix — V11

## Problem fixed
When completion was entered separately for each brand, the whole-client report could calculate incorrectly because it used only one global latest period and an older duplicate could overwrite the newest saved location row.

## New whole-client calculation
- Combines completion entered separately under every brand.
- Selects the newest saved completion for each unique active location.
- Counts every location once only.
- Calculates the client percentage as a location-weighted average, not an average of brand averages.
- Includes legacy Special CS Client rows saved with `special_brand` or `special_group` source types.
- Keeps locations without a saved completion at 0%, preserving the existing all-active-locations report rule.
- Shows `Latest saved entry per active location` when the combined brand entries use different periods.

## Files to replace
1. `client-success.js`
2. `index.html`

No Supabase SQL is required.

After deployment, hard refresh with Ctrl + Shift + R.
