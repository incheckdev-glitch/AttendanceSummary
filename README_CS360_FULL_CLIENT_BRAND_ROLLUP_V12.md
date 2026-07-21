# CS360 Full Client Brand Rollup Fix — V12

## Problem fixed
When completion was entered separately for each brand, the full normal-client or full Special CS Client report still used a location-weighted average and treated assigned locations without a saved completion as 0%. This could make the full-client total differ from the entered brand results.

## Correct calculation
1. Each brand is calculated from its saved location completion rows.
2. The full-client result is the equal arithmetic average of all completed brand results.
3. A brand with no saved completion is excluded from the client percentage instead of being counted as 0%.
4. Done On-Time, Done Late, Partially Done, Missed, and Completion all use the same brand-level rollup.
5. Location detail pages show saved/reportable locations only for a whole-client report.
6. The brand table shows Reported / Assigned location coverage for verification.

Example:
- Brand A completion: 90%
- Brand B completion: 70%
- Brand C completion: 80%
- Full client completion: (90 + 70 + 80) / 3 = 80%

## Files to replace
- client-success.js
- index.html

No Supabase SQL is required.

After deployment, hard refresh with Ctrl + Shift + R.
